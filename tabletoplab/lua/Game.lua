local Zone = require('tabletoplab.lua.Zone')
local Object = require('tabletoplab.lua.Object')
local Action = require('tabletoplab.lua.Action')
local ObjectScript = require('tabletoplab.lua.ObjectScript')
local utils = require('tabletoplab.lua.utils')

-- SINGLETON CLASS
local Game = {}
Game.__index = Game

function Game:initialize(initConfig)
    initConfig = initConfig or {}

    self.logs = {}
    self.variables = initConfig.variables or {}
    self.fsm = initConfig.gamestates or {}
    self.state = {} -- dictionary that maps state to a boolean indicating if it's active
    self.state_queue = {} -- queue to keep track of states to enter on next step
    self.signaled = {} -- dictionary to track signal flags during state transitions. Held true until transitions are checked.
    
    -- zones: create Zone objects for each configured zone
    self.zones = {}
    self._id2zone = {}
    for name, cfg in pairs(initConfig.zones or {}) do
        local zoneCfg = {name=name}
        local quantity = 1
        for k, v in pairs(cfg) do
            if k == 'quantity' then
                quantity = v
            else
                zoneCfg[k] = v
            end
        end
        if quantity == 1 then
            z = Zone:new(zoneCfg)
            self.zones[name] = z
            self._id2zone[z._uid] = z
        else
            self.zones[name] = {}
            for i=1,quantity do
                z = Zone:new(zoneCfg)
                self.zones[name][i] = z
                self._id2zone[z._uid] = z
                z._zone_index = i
            end
        end
    end
    
    -- Object tracking and handlers
    -- _objects_by_id: Map from object UID to Object instance for fast lookup
    self._objects_by_id = {}
    
    -- _object_handlers: Map from script_name -> {compiled handlers, initialize fn, etc}
    -- Handlers are stored externally and persist across game state loads
    self._object_handlers = {}
    
    -- _object_scripts: Map from object_id -> script_name for script lookup
    -- This allows querying which scripts apply to an object
    self._object_scripts = {}

    -- default variables in scope of scripts
    -- Use metatables to ensure variable reads/writes go through self.variables
    -- Reads: check variables first, then globals
    -- Writes: always update self.variables
    self.env = setmetatable({
        zones=self.zones,
        state=self.state,
        signaled=self.signaled,
        load_collection=function(...) return self:load_collection(...) end
    }, {
        __index = function(t, k)
            if self.variables[k] ~= nil then
                return self.variables[k]
            end
            return _G[k]
        end,
        __newindex = function(t, k, v)
            self.variables[k] = v
        end
    })

    -- run initialization scripts (if any)
    self:log('Initializing...')
    self.init = initConfig.init or {}
    if #self.init > 0 then
        local init_fn = self:createScriptFn(self.init, "initialize_script")
        if init_fn then
            local ok, err = pcall(init_fn)
            if not ok then
                self:log(string.format('Init script error: %s', err), {error=err})
            end
        else
            self:log('Failed to create init script function')
        end
    end

    -- Parse actions from config (convert string scripts to functions)
    self.actions = {}
    if initConfig.actions then
        for action_name, action_cfg in pairs(initConfig.actions) do
            self.actions[action_name] = self:parseAction(action_name, action_cfg)
        end
    end

    -- Parse states and place initial states in queue
    for name, cfg in pairs(self.fsm) do
        if cfg.initial then table.insert(self.state_queue, name) end
        if cfg.on_enter then 
            cfg._enter_fn = self:createScriptFn(
                cfg.on_enter, 
                "state_"..name.."_onenter",
                "return %s"
            )
        end
        for i, t in ipairs(utils.castList(cfg.transitions)) do
            if not t.conditions then goto continue end
            cfg._cond_fns = {}
            for ii, cond in ipairs(t.conditions) do
                table.insert(cfg._cond_fns, self:createScriptFn(
                    cond, 
                    "state_"..name.."_tran"..i.."_cond"..ii,
                    "return %s"
                ))
            end
            ::continue::
        end
    end

    return self
end

-- ============================================================================
-- OBJECT AND HANDLER METHODS
-- ============================================================================

-- Game:get_object(obj_id): Get an object by its UID
-- @param obj_id (number): The UID of the object
-- @return Object: The object instance, or nil if not found
function Game:get_object(obj_id)
    return self._objects_by_id[obj_id]
end

-- Game:get_zone_by_uid(zone_uid): Get a zone by its UID
-- @param zone_uid (number): The UID of the zone
-- @return Zone: The zone instance, or nil if not found
function Game:get_zone_by_uid(zone_uid)
    return self._id2zone[zone_uid]
end

-- Game:register_object_handlers(script_name, obj_id, compiled_handlers): Register handlers for an object
-- @param script_name (string): Name/ID of the script (e.g., 'card_2', 'spell_effect')
-- @param obj_id (number): UID of the object
-- @param compiled_handlers (table): Compiled handler table from ObjectScript:build()
--
-- The compiled_handlers should contain:
--   - handlers: {handler_name = check_fn}
--   - conditions: {handler_name = {condition_fn_1, condition_fn_2, ...}}
--   - actions: {handler_name = {action_fn_1, action_fn_2, ...}}
--   - initialize: optional function (game, obj_id)
function Game:register_object_handlers(script_name, obj_id, compiled_handlers)
    -- Store the compiled handlers by script name
    if not self._object_handlers[script_name] then
        self._object_handlers[script_name] = compiled_handlers
    end
    
    -- Mark this script as applicable to this object
    if not self._object_scripts[obj_id] then
        self._object_scripts[obj_id] = {}
    end
    self._object_scripts[obj_id][script_name] = true
    
    -- Call the initialize function if present (only on first registration)
    local obj = self:get_object(obj_id)
    if obj and compiled_handlers.initialize then
        compiled_handlers.initialize(self, obj_id)
    end
end

-- Game:check_object_conditions(obj_id, handler_name): Check if all conditions for a handler are met
-- @param obj_id (number): UID of the object
-- @param handler_name (string): Name of the handler to check
-- @return boolean: True if all conditions are met, false otherwise
function Game:check_object_conditions(obj_id, script_name, handler_name)
    local handlers = self._object_handlers[script_name]
    if not handlers or not handlers.conditions[handler_name] then
        return false
    end
    
    -- Check all conditions for this handler
    for _, cond in ipairs(handlers.conditions[handler_name]) do
        if not cond(self, obj_id) then
            return false
        end
    end
    
    return true
end

-- Game:execute_object_action(obj_id, handler_name): Execute all actions for a handler
-- @param obj_id (number): UID of the object
-- @param script_name (string): Name of the script
-- @param handler_name (string): Name of the handler to execute
function Game:execute_object_action(obj_id, script_name, handler_name)
    local handlers = self._object_handlers[script_name]
    if not handlers or not handlers.actions[handler_name] then
        return
    end
    
    -- Execute all actions for this handler in sequence
    for _, action in ipairs(handlers.actions[handler_name]) do
        action(self, obj_id)
    end
end

-- Game:emit_event(event_name, event_data): Emit an event that handlers can listen for
-- @param event_name (string): Name of the event
-- @param event_data (table): Event data to pass to listeners
--
-- Note: This is a stub for a future event listener system
function Game:emit_event(event_name, event_data)
    self:log(string.format("Event emitted: %s", event_name), 
             {event="EMIT_EVENT", event_name=event_name, data=event_data})
    -- TODO: Implement event listener dispatch if needed
end

function Game:set_signal(signal_values)
    -- Handles both single and multiple return values from scripts
    -- Sets self.signaled[signal_name] = true for each signal
    if not signal_values then return end
    
    -- Handle single signal (string)
    if type(signal_values) == 'string' then
        self.signaled[signal_values] = true
        return
    end
    
    -- Handle table of signals (for when multiple signals need to be set)
    if type(signal_values) == 'table' then
        for _, signal in ipairs(signal_values) do
            if signal then
                self.signaled[signal] = true
            end
        end
        return
    end
end

function Game:parseAction(action_name, action_cfg)
    local action = Action:new({_name=action_name})

    -- Parse and add conditions
    if not action_cfg.conditions then goto no_conditions end
    for i, cond_str in ipairs(utils.castList(action_cfg.conditions)) do
        if utils.validScript(cond_str) then
            local condition_func = self:createScriptFn(
                cond_str, 
                action_name.."_cond"..i, 
                "return %s"
            )
            action:add_condition(condition_func)
        end
    end
    ::no_conditions::

    -- Parse and add targets
    if not action_cfg.targets then goto no_targets end
    for i, target in ipairs(utils.castList(action_cfg.targets)) do
        local target_name = target.name -- This must be present
        local candidates = {}
        for ii, cand_str in ipairs(utils.castList(target.candidates)) do
            if utils.validScript(cand_str) then
                table.insert(candidates, self:createScriptFn(
                    cand_str, 
                    action_name.."_"..target_name.."_cand"..ii, 
                    "return %s"
                ))
            end
        end
        local conditions = {}
        for ii, cond_str in ipairs(utils.castList(target.conditions)) do
            if utils.validScript(cond_str) then
                table.insert(conditions, self:createScriptFn(
                    cond_str, 
                    action_name.."_"..target_name.."_cond"..ii, 
                    "return function("..target_name..") return %s end"
                ))
            end
        end
        action:add_target(target_name, candidates, conditions, target.min_targets, target.max_targets)
    end
    ::no_targets::

    -- Parse and add execution
    action:set_execution(self:createScriptFn(action_cfg.execution, action_name.."_exec"))

    return action
end

function Game:step()
    -- TODO add safety state loop detection
    repeat -- repeat until states are stable
        -- Process all states in the queue
        while #self.state_queue > 0 do
            local state_name = table.remove(self.state_queue, 1)
            self.state[state_name] = true
            
            local state_cfg = self.fsm[state_name]
            if state_cfg and state_cfg._enter_fn then
                local signal = state_cfg._enter_fn()
                self:set_signal(signal)
            end
        end
        
        -- Check transitions for each active state
        for state_name, is_active in pairs(self.state) do
            if not is_active then goto continue end
            -- Iterate through transitions in order
            for _, transition in ipairs(self.fsm[state_name].transitions) do
                -- Check all conditions for this transition
                if transition._cond_fns then
                    for _, cond in ipairs(transition._cond_fns) do
                        if not cond() then goto fail end
                    end
                end
                
                -- Do transition
                for _, next_state in ipairs(utils.castList(transition.next_state)) do
                    transitioned = true
                    self.state[state_name] = nil
                    table.insert(self.state_queue, next_state)
                end
                break
                ::fail::
            end
            ::continue::
        end
    
        -- Reset signal flags for next transition check
        self._signals = {}
    until #self.state_queue > 0
end

function Game:applyAction(actions)
    -- Execute the action's execute method and return the delta
    if not actions then return { delta = nil } end
    
    local action_list = actions
    if type(actions) ~= 'table' or not actions[1] then
        action_list = { actions }
    end
    
    -- Execute all actions in the list
    for _, action in ipairs(action_list) do
        if action and action.execute then
            action:execute()
        end
    end
    
    return self
end

-- Game:getActions(player): Get all available actions for a player
-- @param player (any): Player identifier/object
-- @return table: List of available actions from both FSM actions and object handlers
--
-- Probes all object handlers to find actions triggered by current game state.
-- Returns both traditional Action objects and handler-based actions.
function Game:getActions(player)
    local valid_actions = {}
    
    -- Add actions from the FSM action system
    for action_name, action in pairs(self.actions) do
        if action:check_conditions(player) then
            table.insert(valid_actions, { name = action_name, action = action })
        end
    end
    
    -- Add actions from object handlers
    for obj_id, scripts in pairs(self._object_scripts) do
        for script_name, _ in pairs(scripts) do
            local handlers = self._object_handlers[script_name]
            if handlers then
                for handler_name, _ in pairs(handlers.handlers) do
                    -- Check if conditions are met for this handler
                    if self:check_object_conditions(obj_id, script_name, handler_name) then
                        table.insert(valid_actions, {
                            name = handler_name,
                            type = 'handler',
                            obj_id = obj_id,
                            script_name = script_name,
                            handler_name = handler_name,
                        })
                    end
                end
            end
        end
    end
    
    return valid_actions
end

-- Game:getState(flag): Serialize game state for saving, tree search, or checkpoints
-- @param flag (string or any): Optional flag for visibility filtering (e.g., player ID for hidden info)
-- @return table: Serializable game state containing objects, zones, variables, FSM state
--
-- State is JSON-serializable and contains:
--   - variables: Game variables (rules state, round number, etc.)
--   - state: Current FSM states
--   - objects: All objects with their properties and zone assignments
--   - zones: Zone state
--
-- Note: Object handlers are NOT serialized (stored in Game instance).
-- Objects are reconstructed with their game reference on loadState.
function Game:getState(flag)
    local state = {
        variables = {},
        state = {},
        objects = {},
        zones = {},
    }
    
    -- Copy variables (should be JSON-serializable)
    for k, v in pairs(self.variables) do
        state.variables[k] = v
    end
    
    -- Copy current FSM states
    for state_name, is_active in pairs(self.state) do
        if is_active then
            table.insert(state.state, state_name)
        end
    end
    
    -- Serialize all objects
    -- Include only serializable properties (not _game_ref, not functions)
    for obj_id, obj in pairs(self._objects_by_id) do
        local obj_state = {}
        
        -- Copy all properties except internal system fields
        for k, v in pairs(obj) do
            if k:match("^_game_ref") then
                -- Skip game reference (will be re-assigned on load)
                goto skip_field
            end
            
            -- Skip functions
            if type(v) == 'function' then
                goto skip_field
            end
            
            -- Copy state properties
            obj_state[k] = v
            
            ::skip_field::
        end
        
        state.objects[obj_id] = obj_state
    end
    
    -- Store zone state (just the zone names/UIDs for reference)
    for zone_name, zone_or_zones in pairs(self.zones) do
        state.zones[zone_name] = {
            uid = zone_or_zones._uid or (zone_or_zones[1] and zone_or_zones[1]._uid),
        }
    end
    
    return state
end

-- Game:loadState(state): Restore game state from a serialized state
-- @param state (table): State table from getState()
-- @return self: Returns self for chaining
--
-- Reconstruction process:
-- 1. Restore variables, FSM states
-- 2. Recreate object instances with properties from saved state
-- 3. Re-assign game references to objects
-- 4. Do NOT re-execute scripts (handlers persist in Game instance)
-- 5. Objects are now ready to be acted upon with handlers
function Game:loadState(state)
    if not state then return self end
    
    -- Restore variables
    for k, v in pairs(state.variables or {}) do
        self.variables[k] = v
    end
    
    -- Restore FSM states
    self.state = {}
    for _, state_name in ipairs(state.state or {}) do
        self.state[state_name] = true
    end
    
    -- Recreate objects
    self._objects_by_id = {}
    for obj_id, obj_state in pairs(state.objects or {}) do
        -- Create a new object with the saved state
        local obj = Object:new(obj_state)
        
        -- Re-assign the game reference (not serialized)
        obj._game_ref = self
        
        -- Store in object map
        self._objects_by_id[obj_id] = obj
    end
    
    -- Rebuild zone object lists based on object zone assignments
    for zone_uid, zone in pairs(self._id2zone) do
        zone.objs = {}  -- Clear and rebuild
    end
    
    for obj_id, obj in pairs(self._objects_by_id) do
        if obj._current_zone_uid then
            local zone = self._id2zone[obj._current_zone_uid]
            if zone then
                zone.objs = zone.objs or {}
                table.insert(zone.objs, obj_id)
            end
        end
    end
    
    return self
end



function Game:log(message, data)
    local log_event = {message=message, data=data or {}}
    table.insert(self.logs, log_event)
    LOG(log_event)
end

function Game:load_collection(zone, collection, class, base_params, script_label, quant_label)
    -- Load objects from a collection and register their handlers
    --
    -- Parameters:
    --   zone: Zone to load objects into
    --   collection: Name of the collection (from COLLECTIONS global)
    --   class: Object class to instantiate (default: Object)
    --   base_params: Base parameters to apply to all objects
    --   script_label: CSV column name for script identifier (default: "_script")
    --   quant_label: CSV column name for quantity (default: "_quantity")
    --
    -- The script_label column should contain the script name/ID that identifies
    -- which ObjectScript handlers apply to this object. The script is loaded
    -- once globally and handlers are registered per-object.
    
    class = class or Object
    quant_label = quant_label or "_quantity"
    script_label = script_label or "_script"
    base_params = base_params or {}
    
    self:log(string.format('Loading %s to %s', collection, zone:get_name()), {event='LOAD_COLLECTION'})
    
    if not COLLECTIONS[collection] then
        self:log(string.format('ERROR: COLLECTIONS[%s] not found', collection), {error=true})
        return self
    end

    for _, row in ipairs(COLLECTIONS[collection]) do
        local params = {}
        for k, v in pairs(row) do params[k] = v end
        for k, v in pairs(base_params) do params[k] = v end

        local quant = 1
        local script_key = nil
        
        -- Extract special columns (_script, _quantity, etc.)
        for k, v in pairs(params) do
            if k:match("^_") then  -- skip columns starting with underscore
                params[k] = nil
            end
            if k == quant_label then
                local q = tonumber(v)
                if q and q >= 0 and q == math.floor(q) then
                    quant = q
                end
            end
            if k == script_label then
                script_key = v
            end
        end    
        
        -- Create object instances
        for _ = 1, quant do
            local obj = class:new(params)
            
            -- Store object in game's object map
            self._objects_by_id[obj._uid] = obj
            
            -- Set zone by UID
            obj:set_zone(zone._uid, zone, true)
            
            -- Add object to zone's object list
            zone.objs = zone.objs or {}
            table.insert(zone.objs, obj._uid)
            
            -- Give object a reference to the game (not serialized)
            obj._game_ref = self
            
            -- If there is a script_key, load the ObjectScript and register handlers
            if script_key then
                local script_obj = self:_load_object_script(script_key)
                if script_obj then
                    -- Mark the script as applicable to this object
                    obj:mark_script_applicable(script_key, true)
                    
                    -- Build and register handlers for this object
                    local compiled_handlers = script_obj:build(obj._uid, self)
                    self:register_object_handlers(script_key, obj._uid, compiled_handlers)
                end
            end
        end
    end
    
    return zone
end

-- Game:_load_object_script(script_key): Load an ObjectScript from file/cache
-- @param script_key (string): Identifier for the script to load
-- @return ObjectScript or nil: The loaded ObjectScript instance, or nil if not found
--
-- This is a helper that loads the script file and instantiates an ObjectScript.
-- In practice, script files should call ObjectScript:new() and set up handlers.
-- This method handles caching to avoid reloading the same script multiple times.
function Game:_load_object_script(script_key)
    -- TODO: Implement script caching and loading
    -- For now, this is a stub that assumes scripts are pre-loaded
    -- In a real implementation, this would:
    -- 1. Check if script is already loaded (cache)
    -- 2. Load from file: LOAD_OBJECT_SCRIPT(script_key)
    -- 3. Execute in a controlled environment
    -- 4. Return the instantiated ObjectScript
    -- 5. Cache for future use
    
    self:log(string.format('Loading script: %s', script_key), {event='LOAD_SCRIPT'})
    
    -- Placeholder: should return an ObjectScript instance
    return nil
end

function Game:createScriptFn(scripts, chunk_name, line_format, env)
    if not scripts then return end
    env = env or self.env
    chunk_name = chunk_name or "script"
    -- Concatenate all scripts into one chunk
    local lines = {}
    for _, script in ipairs(utils.castList(scripts)) do
        if not utils.validScript(script) then goto continue end
        table.insert(lines, script)
        ::continue::
    end
    if line_format and #lines > 0 then lines[#lines] = string.format(line_format, lines[#lines]) end -- prepend return if set
    local script_text = table.concat(lines, "\n")
    -- Compile with environment
    local chunk, load_err = load(script_text, chunk_name, 't', env)
    if not chunk then
        self:log(load_err, { type = 'load_error', err = load_err, script = script_text })
        return nil
    end
    -- Return a function that executes the pre-compiled chunk
    return function()
        local ok, result = pcall(chunk)
        if not ok then
            self:log(result, { type = 'runtime_error', err = result, script = script_text })
            return nil
        end
        return result
    end
end

-- Create and return a singleton Game instance
GAME = setmetatable({}, Game)
return GAME