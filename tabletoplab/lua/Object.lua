-- Object: Represents a game object (card, piece, etc.) with serializable state
--
-- Design Philosophy:
-- - Objects store ONLY state (properties, zone, owner, etc.)
-- - No closures or function references stored in objects
-- - Handlers and logic are stored external to objects (in Game._object_handlers)
-- - This enables full serialization for save/load and tree search
--
-- Key Fields:
-- - _uid: Unique identifier for this object
-- - _current_zone_uid: UID of the zone this object is currently in
-- - _zone_history: List of zone UIDs representing the history of zones visited
-- - _applicable_scripts: Table mapping script names to boolean (whether script applies to this object)
-- - _game_ref: Reference to the Game instance (not serialized; re-assigned on load)
-- - All other fields: Object-specific state (owner, properties, etc.) - these ARE serialized

local Object = {}

local __next_object_id = 0

function Object:new(o)
    o = o or {}
    setmetatable(o, self)
    self.__index = self

    __next_object_id = __next_object_id + 1
    o._uid = __next_object_id

    -- Zone tracking: Store zone UIDs instead of zone objects
    -- _current_zone_uid: UID of the zone the object is in (nil if not in a zone)
    o._current_zone_uid = o._current_zone_uid or nil
    
    -- _zone_history: List of zone UIDs for tracking object movement history
    -- Index 1 would be the most recent zone if you want to track history
    o._zone_history = o._zone_history or {}
    
    -- _applicable_scripts: Map of script names to boolean
    -- true if the script applies to this object, false/nil otherwise
    -- e.g. { ['card_2'] = true, ['card_effect_draw'] = false }
    o._applicable_scripts = o._applicable_scripts or {}
    
    -- _game_ref: Reference to Game instance (NOT serialized)
    -- This is re-assigned when object is loaded from state
    o._game_ref = o._game_ref or nil

    return o
end

-- Object:set_zone(zone_uid, zone_obj, suppress_log): Update the zone this object is in
-- @param zone_uid (number): The UID of the zone to move to
-- @param zone_obj (Zone): The zone object itself (used for name logging and object list management)
-- @param suppress_log (boolean): If true, don't create a log event
-- @return self: For method chaining
--
-- This function handles the complete zone transition:
-- 1. Removes object from the old zone's object list
-- 2. Adds object to the new zone's object list
-- 3. Updates _current_zone_uid
-- 4. Tracks zone history
-- 5. Logs the move (unless suppressed)
function Object:set_zone(zone_uid, zone_obj, suppress_log)
    -- Remove from old zone's object list if we have a game reference
    if self._game_ref and self._current_zone_uid then
        local old_zone = self._game_ref:get_zone_by_uid(self._current_zone_uid)
        if old_zone and old_zone.objs then
            for i = #old_zone.objs, 1, -1 do
                if old_zone.objs[i] == self._uid then
                    table.remove(old_zone.objs, i)
                    break
                end
            end
        end
    end
    
    -- Update current zone
    local old_zone_uid = self._current_zone_uid
    self._current_zone_uid = zone_uid
    
    -- Add to new zone's object list
    if zone_uid and zone_obj then
        zone_obj.objs = zone_obj.objs or {}
        table.insert(zone_obj.objs, self._uid)
    end
    
    -- Track zone history
    if zone_uid then
        table.insert(self._zone_history, 1, zone_uid)
    end
    
    if not suppress_log and self._game_ref then
        local zone_name = zone_obj and zone_obj:get_name() or "unknown"
        self._game_ref:log(string.format("move obj_%d -> %s", self._uid, zone_name), 
            {event="OBJ_SET_ZONE", obj_id=self._uid, zone_uid=zone_uid})
    end
    return self
end

-- Object:mark_script_applicable(script_name, applicable): Mark whether a script applies to this object
-- @param script_name (string): Name/ID of the script
-- @param applicable (boolean): Whether this script applies
-- @return self: For method chaining
function Object:mark_script_applicable(script_name, applicable)
    self._applicable_scripts[script_name] = applicable and true or nil
    return self
end

-- Object:get_applicable_scripts(): Get list of all applicable script names
-- @return table: List of script names that apply to this object
function Object:get_applicable_scripts()
    local scripts = {}
    for script_name, is_applicable in pairs(self._applicable_scripts) do
        if is_applicable then
            table.insert(scripts, script_name)
        end
    end
    return scripts
end

return Object