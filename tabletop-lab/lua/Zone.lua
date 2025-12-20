local Zone = {}

function Zone:new(o)
    o = o or {}
    setmetatable(o, self)
    self.__index = self
    o.objs = {} -- a list of Objects
    return o
end

function Zone:load_collection(class, collection, id_label, quant_label)
    for _, row in ipairs(collection or {}) do
        local params = row
        local obj = class:new(params)
        obj:set_zone(self)
    end
    return self
end

function Zone:deal(zone, num)
    num = num or #self.objs
    for i = 1, num do
        local obj = self.objs[#self.objs]
        if not obj then break end
        obj:set_zone(zone)
    end
    return self
end

function Zone:shuffle()
    -- Fisher-Yates shuffle
    local n = #self.objs
    for i = n, 2, -1 do
        local j = math.random(i)
        self.objs[i], self.objs[j] = self.objs[j], self.objs[i]
    end
    return self
end

return Zone