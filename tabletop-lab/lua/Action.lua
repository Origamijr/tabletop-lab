local Action = {}

function Action:new(o)
    o = o or {}
    setmetatable(o, self)
    self.__index = self
    o._conditions = {}
    o._targets = {}
    o._executions = {}
    return o
end

function Action:add_condition(cond)
    table.insert(self._conditions, cond)
    return self
end

function Action:add_target(name, candidates, condition, min_targets, max_targets)
    min_targets = min_targets or 1
    max_targets = max_targets or min_targets
    local spec = {
        name = name,
        candidates = candidates,
        condition = condition,
        min = min_targets,
        max = max_targets
    }
    table.insert(self._targets, spec)
    -- Implicit condition: must have at least min_targets valid targets
    self:add_condition(function()
        return #self:get_valid_targets(#self._targets) >= spec.min
    end)
    return self
end

function Action:add_execution(exec)
    table.insert(self._executions, exec)
    return self
end

function Action:check_conditions()
    for _, cond in pairs(self._conditions) do
        if not cond() then return false end
    end
    return true
end

function Action:get_valid_targets(i)
    local spec = self._targets[i]
    if not spec then return {} end
    local valid = {}
    for _, coll in ipairs(spec.candidates) do
        local objs = (type(coll) == 'table' and coll.objs) or coll
        if objs then
            for _, obj in ipairs(objs) do
                if spec.condition(obj) then
                    table.insert(valid, obj)
                end
            end
        end
    end
    return valid
end

function Action:set_targets(i, targets)
    self[self._targets[i].name] = targets
    return self
end

function Action:execute()
    for _, exec in ipairs(self._executions) do
        exec(self)
    end
    return self
end

return Action