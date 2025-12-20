local Object = {}

function Object:new(o)
    o = o or {}
    setmetatable(o, self)
    self.__index = self

    o._zones = {}

    return o
end

function Object:set_zone(zone)
    local current = self.zones[1]
    if current and current.objs then
        for i = #current.objs, 1, -1 do
            if current.objs[i] == self then
                table.remove(current.objs, i)
                break
            end
        end
    end

    if zone then
        zone.objs = zone.objs or {}
        table.insert(zone.objs, self)
    end

    table.insert(self._zones, 1, zone)

    return self
end

return Object