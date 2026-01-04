local Zone = require('tabletop-lab.lua.Zone')
local Card = require('tabletop-lab.lua.Card')

local Gamestate = {}
Gamestate.__index = Gamestate

-- COPILOT GENERATE. NEEDS REVIEW

-- initConfig (table) may contain: variables, zones, init (list of scripts), gamestates, collections
function Gamestate:new(initConfig)
    initConfig = initConfig or {}

    local o = {}
    setmetatable(o, self)

    -- variables (from game.json)
    o.variables = initConfig.variables or {}

    -- zones: create Zone objects for each configured zone
    o.zones = {}
    for name, cfg in pairs(initConfig.zones or {}) do
        -- copy cfg into the zone object so metadata (type, location, offset, etc.) is preserved
        local zoneCfg = {}
        for k, v in pairs(cfg) do zoneCfg[k] = v end
        local zone = Zone:new(zoneCfg)
        o.zones[name] = zone
    end

    -- collections placeholder (may be filled externally)
    o.collections = initConfig.collections or {}

    -- init scripts and gamestates
    o.init = initConfig.init or {}
    o.gamestates = initConfig.gamestates or {}

    -- logs should collect any script errors and other diagnostics
    o.logs = {}

    -- run initialization scripts (if any)
    if #o.init > 0 then
        o:executeScript(o.init)
    end

    return o
end

-- Execute one or more Lua scripts (strings). Each script has access to `self`.
-- Any load/compile/runtime error is appended to self.logs.
function Gamestate:executeScript(scripts)
    if not scripts then return end

    local list = scripts
    if type(scripts) == 'string' then list = { scripts } end

    for _, script in ipairs(list) do
        if type(script) ~= 'string' then goto continue end
        -- skip commented-out lines in JSON (e.g. "-- ...")
        if script:match('^%s*%-%-') or script:match('^%s*$') then goto continue end

        -- provide `self` and commonly-used classes in the script environment
        local env = setmetatable({ self = self, Card = Card }, { __index = _G })

        local chunk, load_err = load(script, 'gamestate_script', 't', env)
        if not chunk then
            table.insert(self.logs, { type = 'load_error', err = load_err, script = script })
            goto continue
        end

        local ok, run_err = pcall(chunk)
        if not ok then
            table.insert(self.logs, { type = 'runtime_error', err = run_err, script = script })
        end

        ::continue::
    end
end

-- stub implementations (left as-is for now)
function Gamestate:applyAction(actions)
    return { delta = nil }
end

function Gamestate:getActions()
    return {}
end

return Gamestate