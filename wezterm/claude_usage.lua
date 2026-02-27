-- Claude Code usage display for WezTerm tabline
-- Uses ccusage CLI to show daily cost, block remaining time, and session usage
local M = {}

local CCUSAGE = os.getenv("HOME") .. "/.local/share/mise/shims/ccusage"
local CACHE_FILE = "/tmp/wezterm_ccusage_cache"
local CACHE_TTL = 900 -- 15 minutes

-- Track when we last triggered a fetch
local last_triggered = 0

local function trigger_fetch()
	local now = os.time()
	if now - last_triggered < CACHE_TTL then
		return
	end
	last_triggered = now

	local today = os.date("%Y%m%d")
	-- Run in background: spawn detached process that writes to cache file
	os.execute(
		string.format(
			"(%s daily --json --since %s --offline 2>/dev/null; echo __SEP__; %s blocks --active --json --offline --token-limit max 2>/dev/null) > %s 2>/dev/null &",
			CCUSAGE,
			today,
			CCUSAGE,
			CACHE_FILE
		)
	)
end

local function iso_utc_to_epoch(iso)
	local y, mo, d, h, mi, s = iso:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
	if not y then
		return nil
	end
	local now = os.time()
	local utc_offset = os.difftime(now, os.time(os.date("!*t", now)))
	return os.time({
		year = tonumber(y),
		month = tonumber(mo),
		day = tonumber(d),
		hour = tonumber(h),
		min = tonumber(mi),
		sec = tonumber(s),
	}) + utc_offset
end

function M.component(window)
	trigger_fetch()

	local f = io.open(CACHE_FILE, "r")
	if not f then
		return ""
	end
	local content = f:read("*a")
	f:close()

	if not content or content == "" then
		return ""
	end

	local sep_start, sep_end = content:find("__SEP__")
	if not sep_start then
		return ""
	end
	local daily_json = content:sub(1, sep_start - 1)
	local blocks_json = content:sub(sep_end + 1)

	local cost = daily_json:match('"totalCost":%s*([%d%.]+)')
	if not cost then
		return ""
	end

	local parts = {}
	table.insert(parts, string.format("󰚩 $%.2f", tonumber(cost)))

	local has_blocks = not blocks_json:match('"blocks":%s*%[%s*%]')
	if has_blocks then
		local end_time = blocks_json:match('"endTime":%s*"([^"]+)"')
		if end_time then
			local epoch = iso_utc_to_epoch(end_time)
			if epoch then
				local remaining = epoch - os.time()
				if remaining > 0 then
					local hours = math.floor(remaining / 3600)
					local mins = math.floor((remaining % 3600) / 60)
					table.insert(parts, string.format("󱎫 %dh%02dm", hours, mins))
				end
			end
		end

		local pct = blocks_json:match('"percentUsed":%s*([%d%.]+)')
		if pct then
			table.insert(parts, string.format("󰓅 %.0f%%", tonumber(pct)))
		end
	end

	return table.concat(parts, "  ")
end

return M
