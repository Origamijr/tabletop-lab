local Zone = {}

local __next_zone_id = 0

function Zone:new(o)
    o = o or {}
    setmetatable(o, self)
    self.__index = self
    __next_zone_id = __next_zone_id + 1
    o._uid = __next_zone_id
    o.objs = {} -- a list of Objects
    return o
end

function Zone:get_name()
    return (self.name and self.name .. ':' or '') ..
           (self._zone_index and self._zone_index .. ':' or '') ..
           self._uid
end

function Zone:deal(zone, num)
    num = num or #self.objs
    for i = 1, num do
        local obj = self.objs[#self.objs]
        if not obj then break end
        obj:set_zone(zone)
    end
    GAME:log(string.format("dealt %s %d-> %s", self:get_name(), num, zone:get_name()), 
        {event="DEAL_ZONE"})
    return self
end

function Zone:shuffle(seed) -- Fisher-Yates shuffle
    if not seed then
        math.randomseed(os.time() + self._uid * 31 + #self.objs * 73)
        seed = math.random(1, 2147483647)
    end
    math.randomseed(seed)
    local n = #self.objs
    for i = n, 2, -1 do
        local j = math.random(i)
        self.objs[i], self.objs[j] = self.objs[j], self.objs[i]
    end
    GAME:log(string.format("shuffled %s - %s", self:get_name(), seed), 
        {event="SHUFFLE_ZONE", seed=seed, id=self._uid})
    return self
end

return Zone