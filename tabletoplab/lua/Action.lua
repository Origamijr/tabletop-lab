local utils = require('tabletoplab.lua.utils')

local Action = {}

function Action:new(o)
    o = o or {}
    setmetatable(o, self)
    self.__index = self
    o._name = o._name or nil
    o._conditions = {}
    o._targets = {}
    o._executions = {}
    return o
end

function Action:add_condition(cond)
    table.insert(self._conditions, cond)
    return self
end

function Action:add_target(name, candidates, conditions, min_targets, max_targets)
    min_targets = min_targets or 1
    max_targets = max_targets or min_targets
    local spec = {
        name = name,
        candidates = candidates,
        conditions = conditions,
        min = min_targets,
        max = max_targets
    }
    self._targets[name] = spec
    -- Implicit condition: must have at least min_targets valid targets
    self:add_condition(function()
        return #self:get_valid_targets(#self._targets) >= spec.min
    end)
    return self
end

function Action:set_execution(exec)
    self._executions = exec
    return self
end

function Action:check_conditions(player)
    _G.player = player
    for _, cond in pairs(self._conditions) do
        if not cond() then return false end
    end
    return true
end

function Action:get_valid_targets(name, player, targets)
    _G.player = player
    if targets then for t, v in pairs(targets) do _G.t = v end end
    local spec = self._targets[name]
    if not spec then return {} end
    local valid = {}
    for _, opts in ipairs(utils.castList(spec.candidates)) do
        for _, opt in ipairs(utils.castList(opts)) do
            for _, cond in ipairs(utils.castList(spec.conditions)) do
                if not cond(opt) then goto continue end
            end
            table.insert(valid, opt) -- ignore the case of duplicate options for now
            ::continue::
        end
    end
    return valid
end

function Action:execute(player, targets)
    _G.player = player
    if targets then for t, v in pairs(targets) do _G.t = v end end
    return self._execution()
end

return Action