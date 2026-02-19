local Event = {}

function Event:new(o)
    o = o or {}
    setmetatable(o, self)
    self.__index = self
    o._active = true
    o._conditions = {}
    o._executions = {}
    return o
end

function Event:add_condition(cond)
    table.insert(self._conditions, cond)
    return self
end

function Event:add_execution(exec)
    table.insert(self._executions, exec)
    return self
end

function Event:check_valid(zone)
    if not self.active then return false end
    for _, cond in pairs(self._conditions) do
        if not cond() then return false end
    end
    return true
end

function Event:execute()
    for _, exec in ipairs(self._executions) do
        exec(self)
    end
    return self
end

return Event