play = Effect:new(function (obj, index)
    obj:set_zone(ZONES.play[PLAYER][index])
end)

draw = Effect:new(function (player, quant)
    deck:deal(ZONES.hand[player], quant)
end)