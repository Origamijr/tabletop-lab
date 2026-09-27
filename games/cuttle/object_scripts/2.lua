--[[ 
2
On Turn: Scrap target Royal / Glasses
At Any Time: Counter target One-Off Effect. Counters may be played during your opponent's turn.
]]

obj_scr = ObjectScript('2')

function is_royal_or_glasses(t)
	return string.find("8JQK", t.value)
end

function(obj)
	asdlkfjalsdkjfalskj obj
end

-- On Turn: Scrap target Royal / Glasses
Register_action('one-off 1', function(object, player) 
	return Action:new()
		:add_condition(function()
			return GAME.state.action and GAME.current_player == o.owner
		end)
		:add_target('target', { game.zones.perms, game.zones.point }, is_royal_or_glasses, 1, 1)
		:add_execution(function(act) game.scrap(act.target) end)
	end
)

-- At Any Time: Counter target One-Off Effect
o.register_action('one-off 1', Action:new()
	:add_condition(function() return game.state.response end)
	:add_execution(function(act)
		game.negate()
	end)
)