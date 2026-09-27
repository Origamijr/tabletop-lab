local Object = {}

local __next_object_id = 0

function Object:new(o)
    o = o or {}
    setmetatable(o, self)
    self.__index = self

    __next_object_id = __next_object_id + 1
    o._uid = __next_object_id
    o._zone_history = o._zone_history or {}
    o._scripts = o._scripts or {}

    return o
end

function Object:set_zone(zone, suppress_log)
    -- Remove from old zone's object list if we have a game reference
    if self._game_ref and #self._zone_history>0 then
        local prev_zone = GAME.id2zone[self._zone_history[1]]
        for i = #prev_zone.objs, 1, -1 do
            if prev_zone.objs[i] == self._uid then
                table.remove(prev_zone.objs, i)
                break
            end
        end
    end
    
    -- Add to new zone's object list
    table.insert(zone.objs, self)
    
    -- Track zone history
    table.insert(self._zone_history, 1, zone._uid)
    
    if not suppress_log and self._game_ref then
        local zone_name = zone and zone:get_name() or "unknown"
        GAME:log(string.format("move obj_%d -> %s", self._uid, zone_name), 
            {event="OBJ_SET_ZONE", obj_id=self._uid, zone_uid=zone_uid})
    end
    return self
end

return Object