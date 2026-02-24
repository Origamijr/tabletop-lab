local EventHandler = {}

-- module-level unique id counter

function EventHandler:new(o)
    o = o or {}
    setmetatable(o, self)
    self.__index = self
    self.lifo = self.lifo or true -- whether the handler is lifo (stack) or fifo (queue)
    o._queue = o._queue or {}
    return o
end

function EventHandler:push(event)
    -- TODO
end

function EventHandler:pop(event)
    -- TODO
end

function EventHandler:isempty(event)
    -- TODO
end

return EventHandler