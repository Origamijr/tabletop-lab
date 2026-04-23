-- ObjectScript: Fluent API wrapper for defining game object handlers
-- Transforms imperative script definitions into functional, serializable handlers
-- 
-- Key Design Principles:
-- 1. Fluent API: Chain method calls for readable handler definitions
-- 2. Declarative conditions/actions: Use templates to minimize boilerplate
-- 3. Functional handlers: Output is pure functions, not closures
-- 4. No state in scripts: All state is stored in game/objects, enabling serialization
--
-- Example Usage:
-- local script = ObjectScript:new()
-- script:handler('scrap_royal')
--     :condition(Cond.in_zone('hand'))
--     :condition(Cond.is_owner(function(g) return g.current_player end))
--     :action(Act.move_to_zone('discard'))
-- 
-- game:register_object_handlers(script_name, obj_id, script:build(obj_id, game))

local ObjectScript = {}
ObjectScript.__index = ObjectScript

-- ============================================================================
-- CONDITION TEMPLATES
-- ============================================================================
-- These return condition functions that check game state and object properties
-- 
-- Conditions:
--   - Take (game, obj_id) as parameters
--   - Return boolean indicating if condition is met
--   - Can be chained with :condition(...) calls
--   - Multiple conditions create AND logic (all must be true)

local Cond = {}

-- Cond.in_zone(zone_name): Check if object is in a specific zone
-- @param zone_name (string): Name of the zone to check
-- @return function: Condition function (game, obj_id) -> boolean
function Cond.in_zone(zone_name)
    return function(game, obj_id)
        local obj = game:get_object(obj_id)
        if not obj or not obj._current_zone_uid then return false end
        
        -- Get the zone by UID from the game
        local zone = game:get_zone_by_uid(obj._current_zone_uid)
        if not zone then return false end
        
        return zone:get_name() == zone_name
    end
end

-- Cond.in_any_zone(zone_names): Check if object is in any of the listed zones
-- @param zone_names (table): List of zone names to check
-- @return function: Condition function (game, obj_id) -> boolean
function Cond.in_any_zone(zone_names)
    return function(game, obj_id)
        local obj = game:get_object(obj_id)
        if not obj or not obj._current_zone_uid then return false end
        
        local zone = game:get_zone_by_uid(obj._current_zone_uid)
        if not zone then return false end
        
        local zone_name = zone:get_name()
        for _, name in ipairs(zone_names) do
            if zone_name == name then return true end
        end
        return false
    end
end

-- Cond.is_owner(owner_checker): Check if object's owner matches a condition
-- @param owner_checker (function or value): 
--   If function: (game) -> expected_owner
--   If value: Direct comparison against object's owner
-- @return function: Condition function (game, obj_id) -> boolean
function Cond.is_owner(owner_checker)
    return function(game, obj_id)
        local obj = game:get_object(obj_id)
        if not obj then return false end
        
        local expected_owner
        if type(owner_checker) == 'function' then
            expected_owner = owner_checker(game)
        else
            expected_owner = owner_checker
        end
        
        return obj.owner == expected_owner
    end
end

-- Cond.state(obj_state_key, expected_value): Check if object property equals expected value
-- @param obj_state_key (string): Property name on the object to check
-- @param expected_value (any): Expected value, or function(game)->value
-- @return function: Condition function (game, obj_id) -> boolean
function Cond.state(obj_state_key, expected_value)
    return function(game, obj_id)
        local obj = game:get_object(obj_id)
        if not obj then return false end
        
        local actual_value = obj[obj_state_key]
        
        -- If expected is a function, call it to get the value
        if type(expected_value) == 'function' then
            expected_value = expected_value(game)
        end
        
        return actual_value == expected_value
    end
end

-- Cond.and_cond(cond1, cond2, ...): Combine multiple conditions with AND logic
-- @param ... (functions): Variable number of condition functions
-- @return function: Condition function that requires all conditions to be true
function Cond.and_cond(...)
    local conditions = {...}
    return function(game, obj_id)
        for _, cond in ipairs(conditions) do
            if not cond(game, obj_id) then
                return false
            end
        end
        return true
    end
end

-- Cond.or_cond(cond1, cond2, ...): Combine multiple conditions with OR logic
-- @param ... (functions): Variable number of condition functions
-- @return function: Condition function that requires at least one condition to be true
function Cond.or_cond(...)
    local conditions = {...}
    return function(game, obj_id)
        for _, cond in ipairs(conditions) do
            if cond(game, obj_id) then
                return true
            end
        end
        return false
    end
end

-- Cond.not_cond(cond): Negate a condition
-- @param cond (function): Condition function to negate
-- @return function: Condition function that returns the opposite result
function Cond.not_cond(cond)
    return function(game, obj_id)
        return not cond(game, obj_id)
    end
end

-- ============================================================================
-- ACTION TEMPLATES
-- ============================================================================
-- These return action functions that modify game state
--
-- Actions:
--   - Take (game, obj_id) as parameters
--   - Modify game/object state
--   - Multiple actions should each be added separately (sequential execution)
--   - Return nothing (side effects only)

local Act = {}

-- Act.move_to_zone(target_zone_name): Move object to a specific zone
-- @param target_zone_name (string or function): 
--   If string: Static zone name
--   If function: (game, obj_id) -> zone_name
-- @return function: Action function (game, obj_id) -> void
function Act.move_to_zone(target_zone_name)
    return function(game, obj_id)
        local zone_name
        if type(target_zone_name) == 'function' then
            zone_name = target_zone_name(game, obj_id)
        else
            zone_name = target_zone_name
        end
        
        local obj = game:get_object(obj_id)
        if not obj then return end
        
        -- Get zone by name from game.zones
        local target_zone = game.zones[zone_name]
        if not target_zone then 
            error("Zone not found: " .. zone_name)
            return 
        end
        
        -- Update object's zone UID to new zone
        obj._current_zone_uid = target_zone._uid
        
        -- Add to new zone's object list
        target_zone.objs = target_zone.objs or {}
        table.insert(target_zone.objs, obj_id)
        
        -- Log the move
        game:log(string.format("move obj_%d -> %s", obj_id, zone_name), 
                 {event="OBJ_MOVE", obj_id=obj_id, zone_name=zone_name})
    end
end

-- Act.set_property(property_name, value): Set a property on an object
-- @param property_name (string): Name of the property to set
-- @param value (any or function):
--   If value is a function: (game, obj_id) -> actual_value
--   Otherwise: Direct assignment
-- @return function: Action function (game, obj_id) -> void
function Act.set_property(property_name, value)
    return function(game, obj_id)
        local obj = game:get_object(obj_id)
        if not obj then return end
        
        local actual_value
        if type(value) == 'function' then
            actual_value = value(game, obj_id)
        else
            actual_value = value
        end
        
        obj[property_name] = actual_value
        game:log(string.format("set obj_%d.%s = %s", obj_id, property_name, tostring(actual_value)),
                 {event="OBJ_SET_PROP", obj_id=obj_id, prop=property_name, value=actual_value})
    end
end

-- Act.emit_event(event_name, event_data): Emit an event in the game
-- @param event_name (string): Name of the event
-- @param event_data (table or function):
--   If function: (game, obj_id) -> event_data_table
--   Otherwise: Direct event data table
-- @return function: Action function (game, obj_id) -> void
function Act.emit_event(event_name, event_data)
    return function(game, obj_id)
        local data
        if type(event_data) == 'function' then
            data = event_data(game, obj_id)
        else
            data = event_data or {}
        end
        
        data.obj_id = obj_id
        game:emit_event(event_name, data)
    end
end

-- Act.set_signal(signal_name): Set a signal that can trigger state transitions
-- @param signal_name (string or function):
--   If string: Static signal name
--   If function: (game, obj_id) -> signal_name
-- @return function: Action function (game, obj_id) -> void
function Act.set_signal(signal_name)
    return function(game, obj_id)
        local name
        if type(signal_name) == 'function' then
            name = signal_name(game, obj_id)
        else
            name = signal_name
        end
        
        game:set_signal(name)
    end
end

-- Act.execute_custom(fn): Execute a custom action function directly
-- @param fn (function): Custom function (game, obj_id) -> void
-- @return function: Action function that calls the custom function
function Act.execute_custom(fn)
    return function(game, obj_id)
        fn(game, obj_id)
    end
end

-- ============================================================================
-- ObjectScript CLASS
-- ============================================================================

function ObjectScript:new(o)
    o = o or {}
    setmetatable(o, self)
    
    -- _handlers table: {handler_name = {conditions={...}, actions={...}}}
    o._handlers = {}
    
    -- _current_handler: Tracks which handler we're building in fluent chain
    o._current_handler = nil
    
    -- _initialize_fn: Optional initialization function called once per object
    o._initialize_fn = nil
    
    return o
end

-- ============================================================================
-- FLUENT API METHODS
-- ============================================================================

-- ObjectScript:handler(handler_name): Start defining a new handler
-- @param handler_name (string): Name/identifier for this handler
-- @return self: Returns self for method chaining
-- 
-- A handler is a named group of conditions and actions that triggers when
-- all conditions are true. Once an action is added, the handler is complete.
function ObjectScript:handler(handler_name)
    -- If we were building a previous handler, verify it has actions
    if self._current_handler then
        assert(#self._handlers[self._current_handler].actions > 0, 
               "Handler '" .. self._current_handler .. "' has no actions")
    end
    
    -- Create new handler entry
    self._handlers[handler_name] = {
        conditions = {},
        actions = {},
    }
    
    self._current_handler = handler_name
    return self
end

-- ObjectScript:condition(condition_fn): Add a condition to the current handler
-- @param condition_fn (function): Function matching (game, obj_id) -> boolean
-- @return self: Returns self for method chaining
--
-- Multiple conditions are combined with AND logic (all must be true).
-- Conditions are checked in the order they're added.
function ObjectScript:condition(condition_fn)
    assert(self._current_handler, "Must call :handler(...) before :condition(...)")
    assert(type(condition_fn) == 'function', "condition_fn must be a function")
    
    table.insert(self._handlers[self._current_handler].conditions, condition_fn)
    return self
end

-- ObjectScript:action(action_fn): Add an action to the current handler
-- @param action_fn (function): Function matching (game, obj_id) -> void
-- @return self: Returns self for method chaining
--
-- Multiple actions can be added to one handler (chained sequentially).
-- When conditions are met, all actions are executed in order.
function ObjectScript:action(action_fn)
    assert(self._current_handler, "Must call :handler(...) before :action(...)")
    assert(type(action_fn) == 'function', "action_fn must be a function")
    
    table.insert(self._handlers[self._current_handler].actions, action_fn)
    return self
end

-- ObjectScript:initialize(init_fn): Set an initialization function for the object
-- @param init_fn (function): Function matching (game, obj_id) -> void
-- @return self: Returns self for method chaining
--
-- The initialize function is called exactly once when the object is created
-- or when the ObjectScript is first registered. Use this to set up stats,
-- properties, or other one-time initialization that isn't in the CSV.
-- 
-- Example: Loading skill stats from a separate data source
function ObjectScript:initialize(init_fn)
    assert(type(init_fn) == 'function', "init_fn must be a function")
    self._initialize_fn = init_fn
    return self
end

-- ============================================================================
-- BUILD AND COMPILATION
-- ============================================================================

-- ObjectScript:build(obj_id, game): Compile handlers into executable functions
-- @param obj_id (number): The object ID these handlers apply to
-- @param game (Game): Reference to the game instance
-- @return table: Handler functions ready for registration in game
--
-- Returns a table in format: {
--   handlers = {
--     handler_name = function(game, obj_id),
--     ...
--   },
--   initialize = function(game, obj_id) or nil,
--   check_condition = function(handler_name, game, obj_id) -> boolean,
--   execute_action = function(handler_name, game, obj_id)
-- }
--
-- This enables:
-- 1. Lazy evaluation: Conditions checked only when needed
-- 2. Serialization: No closures, pure functions
-- 3. Reusability: Same handlers registered for multiple objects
function ObjectScript:build(obj_id, game)
    local compiled = {
        handlers = {},
        conditions = {},
        actions = {},
    }
    
    -- Compile each handler into condition-checking and action-executing pairs
    for handler_name, handler_def in pairs(self._handlers) do
        -- Store conditions for this handler
        compiled.conditions[handler_name] = handler_def.conditions
        
        -- Store actions for this handler
        compiled.actions[handler_name] = handler_def.actions
        
        -- Create a "check" function that tests all conditions
        compiled.handlers[handler_name] = function()
            -- Check if all conditions are met
            for _, cond in ipairs(handler_def.conditions) do
                if not cond(game, obj_id) then
                    return false  -- Short-circuit: condition failed
                end
            end
            return true  -- All conditions passed
        end
    end
    
    -- Copy over initialization function if present
    if self._initialize_fn then
        compiled.initialize = self._initialize_fn
    end
    
    return compiled
end

-- ============================================================================
-- UTILITY METHODS
-- ============================================================================

-- ObjectScript:list_handlers(): Return list of all handler names
-- @return table: List of handler names
function ObjectScript:list_handlers()
    local handlers = {}
    for name, _ in pairs(self._handlers) do
        table.insert(handlers, name)
    end
    return handlers
end

-- ObjectScript:get_handler_info(handler_name): Get details about a handler
-- @param handler_name (string): Name of the handler
-- @return table: {conditions=count, actions=count} or nil if not found
function ObjectScript:get_handler_info(handler_name)
    local h = self._handlers[handler_name]
    if not h then return nil end
    
    return {
        conditions = #h.conditions,
        actions = #h.actions,
    }
end

-- Export template factories alongside the class
ObjectScript.Cond = Cond
ObjectScript.Act = Act

return ObjectScript