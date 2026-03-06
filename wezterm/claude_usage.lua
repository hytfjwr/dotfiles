-- Claude Code usage display for WezTerm tabline
-- Cost from ccusage CLI, utilization/reset from Anthropic OAuth API
local M = {}

local CCUSAGE = os.getenv("HOME") .. "/.local/share/mise/shims/ccusage"
local CACHE_FILE = "/tmp/wezterm_ccusage_cache"
local TRIGGER_FILE = "/tmp/wezterm_ccusage_trigger"
local CACHE_TTL = 300 -- 5 minutes

-- Track when we last triggered a fetch
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

local function trigger_fetch()
	local manual = check_manual_trigger()
	local now = os.time()
	if not manual and now - last_triggered < CACHE_TTL then
		return
	end
	last_triggered = now

	local today = os.date("%Y%m%d")
	local tmp = CACHE_FILE .. ".tmp"
	-- Cost from ccusage, utilization/reset from Anthropic OAuth API
	local script = string.format(
		[=[(%s daily --json --since %s --offline 2>/dev/null
echo __SEP__
TOKEN=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin).get('claudeAiOauth',{}).get('accessToken',''))" 2>/dev/null)
if [ -n "$TOKEN" ]; then
  VF=/tmp/wezterm_claude_version
  if [ ! -f "$VF" ] || [ $(( $(date +%%s) - $(stat -f %%m "$VF") )) -gt 86400 ]; then
    claude --version 2>/dev/null | awk 'NR==1{print $1}' > "$VF"
  fi
  CC_VERSION=$(cat "$VF" 2>/dev/null)
  curl -s -H "Authorization: Bearer $TOKEN" -H "anthropic-beta: oauth-2025-04-20" -H "User-Agent: claude-code/${CC_VERSION:-0.0.0}" -H "Accept: application/json" "https://api.anthropic.com/api/oauth/usage" 2>/dev/null
fi) > %s 2>/dev/null && mv %s %s &]=],
		CCUSAGE,
		today,
		tmp,
		tmp,
		CACHE_FILE
	)
	os.execute(script)
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
	local usage_json = content:sub(sep_end + 1)

	local parts = {}

	-- Daily cost (defaults to $0.00 if no usage today)
	local cost = daily_json:match('"totalCost":%s*([%d%.]+)')
	table.insert(parts, string.format("󰚩 $%.2f", tonumber(cost or "0")))

	-- Parse Anthropic OAuth API response (five_hour window)
	local resets_at = usage_json:match('"resets_at":%s*"([^"]+)"')
	if resets_at then
		local epoch = iso_utc_to_epoch(resets_at)
		if epoch then
			local remaining = epoch - os.time()
			if remaining > 0 then
				local hours = math.floor(remaining / 3600)
				local mins = math.floor((remaining % 3600) / 60)
				table.insert(parts, string.format("󱎫 %dh%02dm", hours, mins))
			end
		end
	end

	local utilization = usage_json:match('"utilization":%s*([%d%.]+)')
	if utilization then
		table.insert(parts, string.format("󰓅 %.0f%%", tonumber(utilization)))
	end

	return table.concat(parts, "  ")
end

return M
