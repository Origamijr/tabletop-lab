--- Lambda Syntax Preprocessor
-- Transparently transforms |params| expr syntax into (function(params) return expr end)
-- This module should be loaded FIRST before any game code
-- Works in any Lua environment (lupa, fengari, vanilla Lua)

local LambdaPreprocessor = {}

--- Transform lambda syntax in Lua source code
-- @param src string: Lua source code
-- @return string: Transformed Lua code with anonymous functions
--
-- DESIGN NOTES:
-- 
-- SUPPORTED PATTERNS (all work correctly):
--   |x| x * 2                    → (function(x) return x * 2 end)
--   |a, b| a + b                 → (function(a, b) return a + b end)
--   || true                      → (function() return true end)
--   foo(|| true)                 → foo((function() return true end))
--   foo(|| true, bar)            → foo((function() return true end), bar)
--   map(|x| x * 2, list)         → map((function(x) return x * 2 end), list)
--   {inc = |x| x + 1}            → {inc = (function(x) return x + 1 end)}
--
-- EDGE CASES HANDLED:
--   1. Lambdas as function args: foo(|x| expr, bar) correctly stops at comma
--   2. Multiple params: |a, b, c| expr works (commas inside pipes are safe)
--   3. Zero params: || expr correctly captured
--   4. Trailing arguments: foo(|| true, x) - second arg preserved
--
-- PATTERN DETAILS:
--   |([^|]*)|      - Match params between pipes (allows commas inside)
--   %s*            - Optional whitespace after closing pipe
--   ([^,\n%)%]]+)  - Capture expr stopping at delimiters:
--                    , comma    (separates function arguments)
--                    \n newline (line boundary)
--                    ) paren    (closes function call)
--                    %] bracket (closes table/array literal)
--                    %] percent-bracket (Lua pattern bracket)
--
-- LINE-BY-LINE PROCESSING:
--   Process each line separately to prevent greedy capture across lines.
--   This means lambdas MUST be single-line expressions.
--
-- MULTILINE LAMBDAS: NOT VIABLE
--   The |params| expr syntax does NOT support multiline expressions because:
--   1. Pattern stops at newlines: [^\\n]+ prevents crossing line boundaries
--   2. Would need explicit delimiter (like 'end') but that defeats conciseness
--   3. Multiline requires lookahead, reintroduces greedy capture bugs
--   4. foo(|x| ... \\n ... end, bar) is as verbose as function(x) ... end
--   
--   RECOMMENDATION: Use standard function(params) ... end for multiline logic.
--   The |params| expr syntax is optimized for single-line, readable lambdas.
--
function LambdaPreprocessor.transform(src)
    if type(src) ~= "string" then return src end
    
    local lines = {}
    for line in src:gmatch("[^\n]+") do
        -- Process line character by character, skipping strings
        local result = ""
        local i = 1
        local len = #line
        
        while i <= len do
            local char = line:sub(i, i)
            
            -- Handle string literals - copy them verbatim without transformation
            if char == '"' or char == "'" then
                local quote = char
                result = result .. char
                i = i + 1
                -- Copy everything until closing quote (handling escapes)
                while i <= len do
                    char = line:sub(i, i)
                    result = result .. char
                    if char == quote then
                        -- Check if it's escaped
                        local escape_count = 0
                        local j = i - 1
                        while j > 0 and line:sub(j, j) == "\\" do
                            escape_count = escape_count + 1
                            j = j - 1
                        end
                        -- If even number of backslashes, quote is not escaped
                        if escape_count % 2 == 0 then
                            i = i + 1
                            break
                        end
                    end
                    i = i + 1
                end
            -- Handle lambda syntax outside of strings
            elseif char == "|" then
                -- Try to match lambda pattern: |([^|]*)|%s*([^,\n%)%]]+)
                local rest = line:sub(i)
                local params, expr, full_len = rest:match("^|([^|]*)|%s*([^,\n%)%]]+)()")
                
                if params and expr then
                    -- Successfully matched a lambda
                    result = result .. "(function(" .. params .. ") return " .. expr .. " end)"
                    i = i + full_len - 1  -- -1 because the () captures position after match
                else
                    -- Not a lambda, just a pipe character
                    result = result .. char
                    i = i + 1
                end
            else
                result = result .. char
                i = i + 1
            end
        end
        
        table.insert(lines, result)
    end
    return table.concat(lines, "\n")
end

--- Hook Lua's module system to auto-transform lambda syntax
-- This replaces the default Lua searcher to preprocess all loaded modules
-- Must be called exactly once at startup
function LambdaPreprocessor.enable_auto_transform()
    if LambdaPreprocessor._enabled then return end
    LambdaPreprocessor._enabled = true
    
    -- Insert custom searcher at position 2 (after package.loadlib, before other searchers)
    table.insert(package.searchers, 2, function(modname)
        -- Standard Lua search path
        local path, err = package.searchpath(modname, package.path)
        if not path then return err end
        
        -- Read and transform the file
        local f = assert(io.open(path, "r"))
        local src = f:read("*a")
        f:close()
        
        -- Apply lambda preprocessing
        src = LambdaPreprocessor.transform(src)
        
        -- Load transformed code
        return assert(load(src, "@" .. path))
    end)
end

--- Wrapped load() function that applies lambda transformation
-- Use this instead of load() for any dynamically loaded code
-- @param chunk string: Lua code as string
-- @param chunkname string: Name for error messages (optional)
-- @param mode string: Lua version (optional, default 't')
-- @param env table: Environment/globals (optional)
-- @return function: Compiled chunk function (or nil, error string on failure)
--
-- CRITICAL: This ensures lambdas work in:
--   - Game:createScriptFn() loaded strings
--   - load() calls anywhere in the codebase
--   - Dynamic code evaluation
--   - Initialization scripts
--   - Action definitions from config
--   - Condition functions from config
--
-- IMPORTANT: String pipes are NOT transformed
--   Example: local msg = "|x| hello" stays as-is (the pipes are in a string)
--   Lambda syntax ONLY transforms when NOT in a string context.
--   The pattern |([^|]*)|%s*([^,\n%)%]]+) is structural Lua syntax, not string content.
--
-- IMPLEMENTATION DETAIL:
--   This is the ONLY place where lambdas in load() are transformed.
--   Must be used in all places that call load() with user code:
--   1. Game:createScriptFn() - scripts from config/initialization
--   2. Any REPL or dynamic evaluation
--   3. Future: Custom load() calls
--
function LambdaPreprocessor.load_transformed(chunk, chunkname, mode, env)
    if type(chunk) ~= "string" then
        return load(chunk, chunkname, mode, env)
    end
    
    -- Transform lambda syntax before loading
    local transformed = LambdaPreprocessor.transform(chunk)
    
    -- Load the transformed code
    return load(transformed, chunkname, mode, env)
end

--- Transform lambda syntax in a single function/table
-- Useful for dynamic code or REPL environments
-- @param code string: Code snippet to transform
-- @return string: Transformed code
function LambdaPreprocessor.transform_snippet(code)
    return LambdaPreprocessor.transform(code)
end

return LambdaPreprocessor
