local Zone = {}

function Zone:new(o)
    o = o or {}
    setmetatable(o, self)
    self.__index = self
    o.objs = {} -- a list of Objects
    o.game = nil -- reference to parent Gamestate, set by Gamestate:new()
    return o
end

function Zone:load_collection(collection, class, base_params, script_label, quant_label)
    quant_label = quant_label or "_quantity"
    script_label = script_label or "_script"
    base_params = base_params or {}
    
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
            obj:set_zone(self)
            obj.game = self.gamestate
            -- If there is a script_key, load and execute the lazy script
            if script_key then
                local lazy_script = LOAD_OBJECT_SCRIPT(script_key)
                local env = setmetatable({ GetObj = function() return obj, self, self.game end }, { __index = _G })
                local chunk, load_err = load(lazy_script, script_key, 't', env)
                if not chunk then
                    error("Failed to load lazy script '" .. script_key .. "': " .. load_err)
                end
                local ok, run_err = pcall(chunk)
                if not ok then
                    error("Failed to execute lazy script '" .. script_key .. "': " .. run_err)
                end
            end
        end
    end
    
    return self
end

function Zone:deal(zone, num)
    num = num or #self.objs
    for i = 1, num do
        local obj = self.objs[#self.objs]
        if not obj then break end
        obj:set_zone(zone)
    end
    return self
end

function Zone:shuffle()
    -- Fisher-Yates shuffle
    local n = #self.objs
    for i = n, 2, -1 do
        local j = math.random(i)
        self.objs[i], self.objs[j] = self.objs[j], self.objs[i]
    end
    return self
end

return Zone