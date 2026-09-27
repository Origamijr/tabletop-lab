-- Gameplay effect class for the case when other effects interact with other
local Effect = {}

function Effect:new(exec_fn)
    local o = {}
    o._execute_fn = exec_fn or function() end  -- The main effect function
    o._prehooks = {}  -- Functions to run before effect
    o._posthooks = {}  -- Functions to run after effect
    o._break_flag = false  -- Flag set by break() to skip remaining execution
    
    local mt = {
        __index = self,
        __call = function(self, ...)
            return self:execute(...)
        end
    }
    setmetatable(o, mt)
    
    return o
end

-- Break out of effect execution, skipping main execution and posthooks
-- Should be called from within a prehook
function Effect:halt()
    self._break_flag = true
    return self
end

-- Add a prehook that runs before the effect
-- @param hook_fn: function(obj, ...) -> void
function Effect:add_prehook(hook_fn)
    if hook_fn then
        table.insert(self._prehooks, hook_fn)
    end
    return self
end

-- Add a posthook that runs after the effect
-- @param hook_fn: function(obj, ...) -> void
function Effect:add_posthook(hook_fn)
    if hook_fn then
        table.insert(self._posthooks, hook_fn)
    end
    return self
end

-- Execute the effect with all hooks
-- Runs: prehooks -> execution/replacement -> posthooks
-- If halt() is called in a prehook, skips execution and posthooks
-- @param obj: The object this effect is applied to
-- @param ...: Additional arguments passed to the effect
function Effect:execute(obj, ...)
    -- Reset break flag at start of execution
    self._break_flag = false
    
    -- Run all prehooks
    for _, hook in ipairs(self._prehooks) do
        hook(obj, ...)
        if self._break_flag then goto halt end
    end
    
    -- Run main execution or replacement
    self._execute_fn(obj, ...)
    
    -- Run all posthooks
    for _, hook in ipairs(self._posthooks) do
        hook(obj, ...)
        if self._break_flag then goto halt end
    end
    
    ::halt::
    return self
end

return Effect