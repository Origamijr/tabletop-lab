local Action = require('tabletoplab.lua.Action')
local utils = require('tabletoplab.lua.utils')

-- ObjectScript: Core ECS handler for managing object-specific actions, conditions, and effects
-- Registers handlers with the Game instance that can be triggered by game state changes
local ObjectScript = {}

function ObjectScript:new(o)
    o = o or {}
    setmetatable(o, self)
    self.__index = self
    
    o._handlers = {}  -- {handler_name = check_fn}
    o._conditions = {}  -- {handler_name = {condition_fn_1, condition_fn_2, ...}}
    o._actions = {}  -- {handler_name = {action_fn_1, action_fn_2, ...}}
    o._initialize = nil  -- Optional initialization function
    
    return o
end

-- Register a handler action that produces an Action object
-- The action_fn should return an Action or nil
-- @param action_fn: function(object, zone) -> Action
function ObjectScript:register_action(action_fn)
    if not action_fn then return self end
    
    -- Generate a unique handler name
    local handler_name = "action_" .. tostring(#self._handlers + 1)
    
    -- Wrap the action_fn to create a handler that checks validity
    self._handlers[handler_name] = function(obj_id)
        local obj = GAME:get_object(obj_id)
        local zone = obj and obj._zone_history and GAME.id2zone[obj._zone_history[1]]
        if not obj or not zone then return false end
        
        local action = action_fn(obj, zone)
        return action ~= nil
    end
    
    -- Store conditions from the action
    self._conditions[handler_name] = {}
    
    -- Store actions from the action
    self._actions[handler_name] = {}
    
    return self
end

-- Add a condition to a handler
-- @param handler_name: string name of the handler
-- @param condition_fn: function() -> boolean
function ObjectScript:add_condition(handler_name, condition_fn)
    if not self._conditions[handler_name] then
        self._conditions[handler_name] = {}
    end
    table.insert(self._conditions[handler_name], condition_fn)
    return self
end

-- Add an action to a handler (executed when conditions pass)
-- @param handler_name: string name of the handler
-- @param action_fn: function(game, obj_id) -> void
function ObjectScript:add_action(handler_name, action_fn)
    if not self._actions[handler_name] then
        self._actions[handler_name] = {}
    end
    table.insert(self._actions[handler_name], action_fn)
    return self
end

-- Set the initialization function (called when script is registered)
-- @param init_fn: function(game, obj_id) -> void
function ObjectScript:set_initialize(init_fn)
    self._initialize = init_fn
    return self
end

-- Hook an effect before its execution
-- @param effect_name: string name of the effect (or hook_fn if effect_name is a function)
-- @param hook_fn: function(obj, ...) -> void (called before effect), or nil if effect_name is a function
function ObjectScript:prehook_effect(effect_name, hook_fn)
    -- Support both single function argument and (name, fn) argument pair
    if type(effect_name) == "function" and hook_fn == nil then
        hook_fn = effect_name
        effect_name = "default_prehook_" .. tostring(#self._prehooks or {} + 1)
    end
    
    if not effect_name or not hook_fn then return self end
    
    local hook_key = "prehook_" .. effect_name
    if not self._handlers[hook_key] then
        self._handlers[hook_key] = function() return true end
        self._conditions[hook_key] = {}
        self._actions[hook_key] = {}
    end
    
    table.insert(self._actions[hook_key], function(game, obj_id)
        local obj = game:get_object(obj_id)
        if obj then hook_fn(obj) end
    end)
    
    return self
end

-- Hook an effect after its execution
-- @param effect_name: string name of the effect (or hook_fn if effect_name is a function)
-- @param hook_fn: function(obj, ...) -> void (called after effect), or nil if effect_name is a function
function ObjectScript:posthook_effect(effect_name, hook_fn)
    -- Support both single function argument and (name, fn) argument pair
    if type(effect_name) == "function" and hook_fn == nil then
        hook_fn = effect_name
        effect_name = "default_posthook_" .. tostring(#self._posthooks or {} + 1)
    end
    
    if not effect_name or not hook_fn then return self end
    
    local hook_key = "posthook_" .. effect_name
    if not self._handlers[hook_key] then
        self._handlers[hook_key] = function() return true end
        self._conditions[hook_key] = {}
        self._actions[hook_key] = {}
    end
    
    table.insert(self._actions[hook_key], function(game, obj_id)
        local obj = game:get_object(obj_id)
        if obj then hook_fn(obj) end
    end)
    
    return self
end

-- Replace an effect with custom behavior
-- @param effect_name: string name of the effect (or replace_fn if effect_name is a function)
-- @param replace_fn: function(obj, ...) -> void (replaces the effect), or nil if effect_name is a function
function ObjectScript:replace_effect(effect_name, replace_fn)
    -- Support both single function argument and (name, fn) argument pair
    if type(effect_name) == "function" and replace_fn == nil then
        replace_fn = effect_name
        effect_name = "default_replace_" .. tostring(#self._replacements or {} + 1)
    end
    
    if not effect_name or not replace_fn then return self end
    
    local replace_key = "replace_" .. effect_name
    if not self._handlers[replace_key] then
        self._handlers[replace_key] = function() return true end
        self._conditions[replace_key] = {}
        self._actions[replace_key] = {}
    end
    
    self._actions[replace_key] = {function(game, obj_id)
        local obj = game:get_object(obj_id)
        if obj then replace_fn(obj) end
    end}
    
    return self
end

-- Build the compiled handler table for registration with Game
-- @return table: {handlers, conditions, actions, initialize}
function ObjectScript:build()
    return {
        handlers = self._handlers,
        conditions = self._conditions,
        actions = self._actions,
        initialize = self._initialize
    }
end

-- Get handler for a specific object (for checking if it should execute)
function ObjectScript:get_handler(handler_name)
    return self._handlers[handler_name]
end

-- Get conditions for a handler
function ObjectScript:get_conditions(handler_name)
    return self._conditions[handler_name] or {}
end

-- Get actions for a handler
function ObjectScript:get_actions(handler_name)
    return self._actions[handler_name] or {}
end

return ObjectScript
