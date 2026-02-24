local Zone = require('tabletoplab.lua.Zone')
local Card = require('tabletoplab.lua.Card')

local Gamestate = {}
Gamestate.__index = Gamestate

-- initConfig (table) may contain: variables, zones, init (list of scripts), gamestates, collections
function Gamestate:new(initConfig)
    initConfig = initConfig or {}

    local o = {}
    setmetatable(o, self)

    -- variables (from game.json)
    o.variables = initConfig.variables or {}

    -- zones: create Zone objects for each configured zone
    o.zones = {}
    for name, cfg in pairs(initConfig.zones or {}) do
        local zoneCfg = {}
        local quantity = 1
        for k, v in pairs(cfg) do
            if k == 'quantity' then
                quantity = 1
            else
                zoneCfg[k] = v
            end
        end
        if quantity == 1 then
            o.zones[name] = Zone:new(zoneCfg)
            o.zones[name].gamestate = o
        else
            o.zones[name] = {}
            for i=1,quantity do
                o.zones[name][i] = Zone:new(zoneCfg)
                o.zones[name][i]._zone_index = i
                o.zones[name][i].gamestate = o
            end
        end
    end

    o.init = initConfig.init or {}
    o.gamestates = initConfig.gamestates or {}
    o.actions = {}

    o.logs = {}

    -- Parse actions from config (convert string scripts to functions)
    if initConfig.actions then
        for action_name, action_cfg in pairs(initConfig.actions) do
            o.actions[action_name] = o:parseAction(action_name, action_cfg)
        end
    end

    -- run initialization scripts (if any)
    if #o.init > 0 then
        o:createScriptFn(o.init, o:defaultEnv())()
    end

    o.state = {} -- dictionary that maps state to a boolean indicating if it's active
    o._state_queue = {}
    o._signal_flags = {} -- dictionary to track signal flags during state transitions
    
    -- Place all states in o.gamestates with 'initial'=true in the state queue
    for state_name, state_cfg in pairs(o.gamestates) do
        if state_cfg.initial then
            table.insert(o._state_queue, state_name)
        end
    end

    return o
end

function Gamestate:parseAction(action_name, action_cfg)
    local Action = require('tabletoplab.lua.Action')
    local action = Action:new()
    action.id = action_name

    -- Parse and add conditions
    if action_cfg.condition then
        local cond_list = action_cfg.condition
        if type(cond_list) == 'string' then cond_list = { cond_list } end
        
        for _, cond_str in ipairs(cond_list) do
            if type(cond_str) == 'string' and not cond_str:match('^%s*%-%-') and cond_str:match('^%s*$') == nil then
                local condition_func = self:createConditionFunction(cond_str)
                action:add_condition(condition_func)
            end
        end
    end

    -- Parse and add targets
    if action_cfg.targets then
        local targets_cfg = action_cfg.targets
        local name = targets_cfg.name or 'targets'
        local candidates = targets_cfg.candidates or {}
        local min_targets = targets_cfg.min_targets or 1
        local max_targets = targets_cfg.max_targets or min_targets
        
        -- Parse target condition
        local target_condition = self:createTargetConditionFunction(targets_cfg.condition)
        
        action:add_target(name, candidates, target_condition, min_targets, max_targets)
    end

    -- Parse and add executions
    if action_cfg.execution then
        local exec_list = action_cfg.execution
        if type(exec_list) == 'string' then exec_list = { exec_list } end
        
        for _, exec_str in ipairs(exec_list) do
            if type(exec_str) == 'string' and not exec_str:match('^%s*%-%-') and exec_str:match('^%s*$') == nil then
                local execution_func = self:createExecutionFunction(exec_str)
                action:add_execution(execution_func)
            end
        end
    end

    return action
end

function Gamestate:step()
    -- Process all states in the queue
    while #self._state_queue > 0 do
        local state_name = table.remove(self._state_queue, 1)
        self.state[state_name] = true
        
        local state_cfg = self.gamestates[state_name]
        if state_cfg and state_cfg.on_enter then
            -- Execute on_enter scripts and capture returned signal
            local env = setmetatable({
                self = self,
                Card = Card,
                state = self.state
            }, { __index = _G })
            
            for _, script in ipairs(state_cfg.on_enter) do
                if type(script) ~= 'string' then goto continue_enter end
                if script:match('^%s*%-%-') or script:match('^%s*$') then goto continue_enter end
                
                local chunk, load_err = load(script, 'gamestate_on_enter', 't', env)
                if not chunk then
                    table.insert(self.logs, { type = 'load_error', err = load_err, script = script })
                    goto continue_enter
                end
                
                local ok, result = pcall(chunk)
                if not ok then
                    table.insert(self.logs, { type = 'runtime_error', err = result, script = script })
                elseif result then
                    self._signal_flags[tostring(result)] = true
                end
                
                ::continue_enter::
            end
        end
    end
    
    -- Check transitions for each active state
    for state_name, is_active in pairs(self.state) do
        if is_active then
            local state_cfg = self.gamestates[state_name]
            if state_cfg and state_cfg.transitions then
                -- Iterate through transitions in order
                for _, transition in ipairs(state_cfg.transitions) do
                    local conditions_met = true
                    
                    -- Check all conditions for this transition
                    if transition.conditions then
                        local cond_list = transition.conditions
                        if type(cond_list) == 'string' then cond_list = { cond_list } end
                        
                        for _, cond in ipairs(cond_list) do
                            local env = setmetatable({
                                self = self,
                                Card = Card,
                                state = self.state,
                                zones = self.zones,
                                signaled = function(sig) return self._signal_flags[sig] or false end
                            }, { __index = _G })
                            
                            local chunk, load_err = load('return ' .. cond, 'transition_condition', 't', env)
                            if not chunk then
                                table.insert(self.logs, { type = 'load_error', err = load_err, condition = cond })
                                conditions_met = false
                                break
                            end
                            
                            local ok, result = pcall(chunk)
                            if not ok or not result then
                                conditions_met = false
                                break
                            end
                        end
                    end
                    
                    -- If conditions are met, add next_state(s) to queue
                    if conditions_met then
                        if transition.next_state then
                            local next_states = transition.next_state
                            if type(next_states) == 'string' then
                                next_states = { next_states }
                            end
                            for _, next_state in ipairs(next_states) do
                                table.insert(self._state_queue, next_state)
                            end
                        end
                        break -- Only process the first matching transition
                    end
                end
            end
        end
    end
    
    -- Reset signal flags for next step
    self._signal_flags = {}
end

function Gamestate:applyAction(actions)
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
    
    return { delta = nil }
end

function Gamestate:getActions(player)
    local valid_actions = {}
    
    -- Iterate through all parsed actions
    for action_name, action in pairs(self.actions) do
        -- Set the player for this action
        action.player = player
        
        -- Check if action passes all conditions
        if action:check_conditions() then
            table.insert(valid_actions, { name = action_name, action = action })
        end
    end
    
    return valid_actions
end

function Gamestate:getState(flag)
    -- stub implementation, should be a proper encoding based on flag (typically flag is player to ensure hidden knowledge isn't encoded in state)
    -- Ideally, the state should be completely described by
        -- placement of objects in zones
        -- instance variable state in objects
        -- gamestate.state
        -- gamestate.variables
    return self 
end

function Gamestate:loadState(state)
    -- stub implementation for now
    -- If the assumptions above are true, this should effective implement rollback and save states
    return self
end

function Gamestate:log(message, data)
    local log_event = {message=message, data=data}
    table.insert(self.logs, log_event)
    LOG(log_event)
end

-- Execute one or more Lua scripts (strings).
-- Any load/compile/runtime error is appended to self.logs.
function Gamestate:createScriptFn(scripts, env, chunk_name)
    if not scripts then return end
    chunk_name = chunk_name or "script"

    local list = scripts
    if type(scripts) == 'string' then list = { scripts } end

    -- Concatenate all scripts into one chunk
    local script_text = ""
    for _, script in ipairs(list) do
        if type(script) == 'string' and not script:match('^%s*%-%-') and script:match('^%s*$') == nil then
            script_text = script_text .. "\n" .. script
        end
    end

    -- Compile with environment
    env = env or self:defaultEnv()
    local final_env = setmetatable(env, { __index = _G })
    local chunk, load_err = load(script_text, chunk_name, 't', final_env)
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

function Gamestate:defaultEnv() 
    return setmetatable({
        zones=self.zones,
        state=self.state
    }, {__index=self.variables})
end

return Gamestate