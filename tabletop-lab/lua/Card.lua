local Object = require('tabletop-lab.lua.Object')  -- use consistent module path
local Card = setmetatable({}, { __index = Object })
Card.__index = Card

function Card:new(o)
    o = Object:new(o)
    setmetatable(o, Card)

    if o._visible_to then
        o:setVisibleTo(o._visible_to)
    else
        o._visible_to = {}
    end

    return o
end

function Card:setVisibleTo(players)
    local set = {}
    for k, v in pairs(players or {}) do
        if type(v) == 'boolean' then
            set[k] = true
        elseif type(k) == 'number' then
            set[v] = true
        end
    end
    self._visible_to = set
end

function Card:addViewer(id)
    self._visible_to = self._visible_to or {}
    self._visible_to[id] = true
end

function Card:removeViewer(id)
    if self._visible_to then self._visible_to[id] = nil end
    return self
end

function Card:canBeSeenBy(id)
    return (self._visible_to and self._visible_to[id] == true) or false
end

return Card