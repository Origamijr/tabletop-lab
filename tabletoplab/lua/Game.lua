local Zone = require('tabletoplab.lua.Zone')
local Object = require('tabletoplab.lua.Object')
local Action = require('tabletoplab.lua.Action')
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

    -- default variables in scope of scripts
    self.env = setmetatable(setmetatable({
        zones=self.zones,
        state=self.state,
        signaled=self.signaled,
        load_collection=function(...) return self:load_collection(...) end
    }, {__index=self.variables}), {__index=_G})

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
                table.insert(cfg._cond_fn, self:createScriptFn(
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
            local signal = nil
            if state_cfg and state_cfg._enter_fn then
                signal = self.state_cfg._enter_fn()
            end
            if signal then do self.signaled[signal] = true end end
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

function Game:getActions(player)
    local valid_actions = {}
    for action_name, action in pairs(self.actions) do
        if action:check_conditions(player) then
            table.insert(valid_actions, { name = action_name, action = action })
        end
    end
    return valid_actions
end

function Game:getState(flag)
    -- stub implementation, should be a proper encoding based on flag (typically flag is player to ensure hidden knowledge isn't encoded in state)
    -- Ideally, the state should be completely described by
        -- placement of objects in zones
        -- instance variable state in objects
        -- gamestate.state
        -- gamestate.variables
    return self 
end

function Game:loadState(state)
    -- stub implementation for now
    -- If the assumptions above are true, this should effective implement rollback and save states
    return self
end

function Game:log(message, data)
    local log_event = {message=message, data=data or {}}
    table.insert(self.logs, log_event)
    LOG(log_event)
end

function Game:load_collection(zone, collection, class, base_params, script_label, quant_label)
    class = class or Object
    quant_label = quant_label or "_quantity"
    script_label = script_label or "_script"
    base_params = base_params or {}
    
    self:log(string.format('Loading %s to %s', collection, zone:get_name()), {TODO=nil})
    
    if not COLLECTIONS[collection] then
        self:log(string.format('ERROR: COLLECTIONS[%s] not found', collection), {TODO=nil})
        return self
    end

    for _, row in ipairs(COLLECTIONS[collection]) do
        local params = {}
        for k, v in pairs(row) do params[k] = v end
        for k, v in pairs(base_params) do params[k] = v end

        local quant = 1
        local script_key = nil
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
        for _ = 1, quant do
            local obj = class:new(params)
            obj:set_zone(zone, true)
            -- If there is a script_key, load and execute the lazy script
            if script_key then
                local lazy_script = LOAD_OBJECT_SCRIPT(script_key)
                local env = setmetatable({ GetObj = function() return obj, zone, self.game end }, { __index = _G })
                local chunk, load_err = load(lazy_script, script_key, 't', env)
                if not chunk then
                    error("Failed to load object script '" .. script_key .. "': " .. load_err)
                end
                local ok, run_err = pcall(chunk)
                if not ok then
                    error("Failed to execute object script '" .. script_key .. "': " .. run_err)
                end
            end
        end
    end
    
    return zone
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