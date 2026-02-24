local Object = {}

-- module-level unique id counter
local __next_object_id = 0

function Object:new(o)
    o = o or {}
    setmetatable(o, self)
    self.__index = self

    __next_object_id = __next_object_id + 1
    o._uid = __next_object_id

    -- history of zones this object has been in; index 1 is current
    o._zones = o._zones or {}
    o._actions = o._actions or {}
    o.game = nil -- reference to parent Gamestate, set by Zone:load_collection()

    return o
end

function Object:set_zone(zone)
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

    return self
end

function Object:register_action(name, action)
    self._actions[name] = action
end

return Object