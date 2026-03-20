-- Claude Code usage display for WezTerm tabline
-- Cost from ccusage CLI, utilization/reset from Claude Code statusline (rate_limits)
local M = {}

local CCUSAGE = os.getenv("HOME") .. "/.local/share/mise/shims/ccusage"
local COST_CACHE_FILE = "/tmp/wezterm_ccusage_cache"
local RATE_LIMITS_FILE = "/tmp/claude_rate_limits.json"
local TRIGGER_FILE = "/tmp/wezterm_ccusage_trigger"
local COST_CACHE_TTL = 300 -- 5 minutes

-- Track when we last triggered a cost fetch
local last_triggered = 0

local function check_manual_trigger()
	local f = io.open(TRIGGER_FILE, "r")
	if f then
		f:close()
		os.remove(TRIGGER_FILE)
		return true
	end
	return false
end

local function trigger_cost_fetch()
	local manual = check_manual_trigger()
	local now = os.time()
	if not manual and now - last_triggered < COST_CACHE_TTL then
		return
	end
	last_triggered = now

	local today = os.date("%Y%m%d")
	local tmp = COST_CACHE_FILE .. ".tmp"
	local script = string.format(
		[=[(%s daily --json --since %s --offline 2>/dev/null) > %s 2>/dev/null && mv %s %s &]=],
		CCUSAGE,
		today,
		tmp,
		tmp,
		COST_CACHE_FILE
	)
	os.execute(script)
end

local function read_daily_cost()
	local f = io.open(COST_CACHE_FILE, "r")
	if not f then
		return "0"
	end
	local content = f:read("*a")
	f:close()
	if not content or content == "" then
		return "0"
	end
	return content:match('"totalCost":%s*([%d%.]+)') or "0"
end

local function read_rate_limits()
	local f = io.open(RATE_LIMITS_FILE, "r")
	if not f then
		return nil
	end
	local content = f:read("*a")
	f:close()
	if not content or content == "" or content:match("^%s*$") then
		return nil
	end
	return content
end

function M.component(window)
	trigger_cost_fetch()

	local parts = {}

	-- Daily cost from ccusage
	local cost = read_daily_cost()
	table.insert(parts, string.format("󰚩 $%.2f", tonumber(cost)))

	-- Rate limits from Claude Code statusline (real-time)
	local rl = read_rate_limits()
	if rl then
		-- five_hour resets_at (Unix epoch seconds)
		local resets_at = rl:match('"resets_at"%s*:%s*(%d+)')
		if resets_at then
			local remaining = tonumber(resets_at) - os.time()
			if remaining > 0 then
				local hours = math.floor(remaining / 3600)
				local mins = math.floor((remaining % 3600) / 60)
				table.insert(parts, string.format("󱎫 %dh%02dm", hours, mins))
			end
		end

		-- five_hour used_percentage (prefer five_hour over seven_day for display)
		local five_pct = rl:match('"five_hour"%s*:%s*{[^}]*"used_percentage"%s*:%s*([%d%.]+)')
		if not five_pct then
			five_pct = rl:match('"used_percentage"%s*:%s*([%d%.]+)')
		end
		if five_pct then
			table.insert(parts, string.format("󰓅 %.0f%%", tonumber(five_pct)))
		end
	end

	return table.concat(parts, "  ")
end

return M
