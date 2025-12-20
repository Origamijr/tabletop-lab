local score

-- ChatGPT generated
-- Helper: normalize rank (1..13) and pip value for 15s (A=1, 2..10 numeric, J/Q/K=10)
local function rank_of(card)
	local v = card.value
	if type(v) == 'number' then return v end
	if type(v) == 'string' then
		local up = v:upper()
		if up == 'A' then return 1 end
		if up == 'J' then return 11 end
		if up == 'Q' then return 12 end
		if up == 'K' then return 13 end
		local n = tonumber(v)
		if n then return n end
	end
	return nil
end

local function pip_value(card)
	local r = rank_of(card)
	if not r then return 0 end
	if r >= 11 then return 10 end
	return r
end

-- score(starter, cards)
-- starter: card table {suit=..., value=...}
-- cards: array of 4 card tables
-- returns: combos (array of {type=..., cards={...}, score=...}), total_score (number)
function score(starter, cards)
	cards = cards or {}
	assert(type(starter) == 'table', "starter must be a card table")
	assert(type(cards) == 'table', "cards must be an array of card tables")

	local all = {}
	for i = 1, #cards do all[#all+1] = cards[i] end
	all[#all+1] = starter

	local combos = {}
	local total = 0

	-- 1) Fifteens: any subset of cards summing to 15 by pip_value (2 points)
	local n = #all
	for mask = 1, (1 << n) - 1 do
		local sum = 0
		local subset = {}
		for i = 1, n do
			if (mask & (1 << (i-1))) ~= 0 then
				sum = sum + pip_value(all[i])
				table.insert(subset, all[i])
			end
		end
		if sum == 15 then
			table.insert(combos, { type = 'fifteen', cards = subset, score = 2 })
			total = total + 2
		end
	end

	-- 2) Pairs: any pair of same rank (2 points per pair)
	for i = 1, n - 1 do
		for j = i+1, n do
			local ri = rank_of(all[i])
			local rj = rank_of(all[j])
			if ri and rj and ri == rj then
				table.insert(combos, { type = 'pair', cards = { all[i], all[j] }, score = 2 })
				total = total + 2
			end
		end
	end

	-- 3) Runs: any subset of size >=3 where ranks are consecutive and all distinct
	for mask = 1, (1 << n) - 1 do
		local subset = {}
		for i = 1, n do
			if (mask & (1 << (i-1))) ~= 0 then table.insert(subset, all[i]) end
		end
		if #subset >= 3 then
			local ranks = {}
			for i = 1, #subset do ranks[i] = rank_of(subset[i]) end
			table.sort(ranks)
			local ok = true
			for i = 2, #ranks do
				if ranks[i] == ranks[i-1] or ranks[i] ~= ranks[i-1] + 1 then ok = false; break end
			end
			if ok then
				local pts = #ranks
				table.insert(combos, { type = 'run', cards = subset, score = pts })
				total = total + pts
			end
		end
	end

	-- 4) Flush: if all 4 hand cards same suit -> 4 points; +1 if starter same suit
	local hand_suit = cards[1] and cards[1].suit
	local all_same = true
	for i = 2, #cards do if cards[i].suit ~= hand_suit then all_same = false; break end end
	if all_same and hand_suit ~= nil then
		local pts = 4
		local flush_cards = {}
		for i = 1, #cards do table.insert(flush_cards, cards[i]) end
		if starter.suit == hand_suit then
			pts = pts + 1
			table.insert(flush_cards, starter)
		end
		table.insert(combos, { type = 'flush', cards = flush_cards, score = pts })
		total = total + pts
	end

	-- 5) Nobs (his nobs): Jack in hand with same suit as starter -> 1 point
	for i = 1, #cards do
		local r = rank_of(cards[i])
		if r == 11 and cards[i].suit == starter.suit then
			table.insert(combos, { type = 'nobs', cards = { cards[i] }, score = 1 })
			total = total + 1
			break
		end
	end

	return combos, total
end

return score