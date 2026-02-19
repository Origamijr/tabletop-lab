local Zone = {}

function Zone:new(o)
    o = o or {}
    setmetatable(o, self)
    self.__index = self
    o.objs = {} -- a list of Objects
    return o
end

function Zone:load_collection(collection_file, class, params, quant_label)
    quant_label = quant_label or "_quantity"
    params = params or {}
    
    -- Simple CSV reader: read lines, first line is headers
    local file = io.open(collection_file, "r")
    if not file then error("Could not open collection file: " .. collection_file) end
    
    local headers
    for line in file:lines() do
        if not headers then
            -- Parse header row
            headers = {}
            for header in line:gmatch("[^,]+") do
                table.insert(headers, header:match("^%s*(.-)%s*$"))  -- trim
            end
        else
            -- Parse data row
            local cols = {}
            local col_idx = 1
            for val in line:gmatch("[^,]+") do
                val = val:match("^%s*(.-)%s*$")  -- trim
                if col_idx <= #headers then
                    cols[headers[col_idx]] = val
                end
                col_idx = col_idx + 1
            end
            
            -- Merge parameters
            local row_params = {}
            for k, v in pairs(cols) do
                if not k:match("^_") then  -- skip columns starting with underscore
                    row_params[k] = v
                end
            end
            for k, v in pairs(params) do
                row_params[k] = v
            end
            
            -- Get quantity
            local quant = 1
            if cols[quant_label] then
                local q = tonumber(cols[quant_label])
                if q and q >= 0 and q == math.floor(q) then
                    quant = q
                end
            end
            
            -- Create and add quant instances
            for _ = 1, quant do
                local obj = class:new(row_params)
                obj:set_zone(self)
            end
        end
    end
    file:close()
    
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