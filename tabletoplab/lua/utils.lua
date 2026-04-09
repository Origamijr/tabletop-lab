local utils = {}

-- Source - https://stackoverflow.com/a
-- Posted by islet8, modified by community. See post 'Timeline' for change history
-- Retrieved 2026-01-01, License - CC BY-SA 3.0
utils.deepcopy = function(o, seen)
  seen = seen or {}
  if o == nil then return nil end
  if seen[o] then return seen[o] end

  local no
  if type(o) == 'table' then
    no = {}
    seen[o] = no

    for k, v in next, o, nil do
      no[deepcopy(k, seen)] = deepcopy(v, seen)
    end
    setmetatable(no, deepcopy(getmetatable(o), seen))
  else -- number, string, boolean, etc
    no = o
  end
  return no
end

utils.castList = function(o)
    if type(o) == "table" and o[1]~=nil then return o end
    if o ~= nil then return { o } end
    return {}
end

utils.validScript = function(script)
    return type(script) == "string"
       and not script:match("^%s*%-%-")
       and not script:match("^%s*$")
end

return utils