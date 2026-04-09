local Object = {}

local __next_object_id = 0

function Object:new(o)
    o = o or {}
    setmetatable(o, self)
    self.__index = self

    __next_object_id = __next_object_id + 1
    o._uid = __next_object_id

    o._zones = o._zones or {} -- history of zones this object has been in; index 1 is current
    o._actions = o._actions or {}

    return o
end

function Object:set_zone(zone, suppress_log)
    local current = self._zones and self._zones[1]
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

    if not suppress_log then
        GAME:log(string.format("move %s -> %s", self._uid, zone:get_name()), 
            {event="OBJ_SET_ZONE", obj_id=self._uid, zone_id=zone._uid})
    end
    return self
end

function Object:register_action(name, action)
    self._actions[name] = action
end

return Object