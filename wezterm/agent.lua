-- Claude Code agent monitor for WezTerm
-- Detects Claude sessions via process tree scanning and caffeinate child detection.
-- No hooks required for core functionality (running/idle, session list, completion notifications).
-- Hook-provided activity data from /tmp/claude_sessions/ is overlayed when available.
local wezterm = require("wezterm")

local M = {}

local WEZTERM = "/opt/homebrew/bin/wezterm"
local FD = "/opt/homebrew/bin/fd"
local SESSIONS_DIR = "/tmp/claude_sessions"
local CACHE_TTL = 3

local cache = {
	agents = {},
	timestamp = 0,
}

local prev_states = {}
local last_cleanup = 0
local CLEANUP_INTERVAL = 30

-- Parse `ps` output into process table, children map, and claude pid set
local function build_process_table()
	local ok, stdout = wezterm.run_child_process({
		"ps",
		"-axo",
		"pid=,ppid=,tty=,comm=",
	})
	if not ok or stdout == "" then
		return {}, {}, {}
	end

	local procs = {} -- pid → { ppid, tty, name }
	local children = {} -- pid → [ child_pids ]
	local claude_pids = {} -- set of claude PIDs

	for line in stdout:gmatch("[^\n]+") do
		local pid_s, ppid_s, tty, comm = line:match("^%s*(%d+)%s+(%d+)%s+(%S+)%s+(.+)%s*$")
		if pid_s then
			local pid = tonumber(pid_s)
			local ppid = tonumber(ppid_s)
			local name = comm:match("([^/]+)$") or comm
			name = name:gsub("%s+$", "")

			procs[pid] = { ppid = ppid, tty = tty, name = name }

			if not children[ppid] then
				children[ppid] = {}
			end
			table.insert(children[ppid], pid)

			if name == "claude" then
				claude_pids[pid] = true
			end
		end
	end

	return procs, children, claude_pids
end

-- Check if a claude process has a caffeinate child → running
local function is_running(claude_pid, children, procs)
	for _, child_pid in ipairs(children[claude_pid] or {}) do
		local info = procs[child_pid]
		if info and info.name == "caffeinate" then
			return true
		end
	end
	return false
end

-- Read hook-provided activity for a pane (optional enrichment)
local function read_activity(pane_id)
	local path = SESSIONS_DIR .. "/" .. tostring(pane_id) .. ".json"
	local f = io.open(path, "r")
	if not f then
		return nil
	end
	local content = f:read("*a")
	f:close()
	local ok, data = pcall(wezterm.json_parse, content)
	if ok and data and data.activity then
		return data.activity
	end
	return nil
end

-- Clean up stale hook files for panes that no longer run Claude
local function cleanup_stale_files(active_pane_ids)
	local ok, stdout = wezterm.run_child_process({
		FD,
		"--max-depth",
		"1",
		"--type",
		"f",
		"-e",
		"json",
		".",
		SESSIONS_DIR,
	})
	if not ok or stdout == "" then
		return
	end

	for path in stdout:gmatch("[^\n]+") do
		local pane_id = path:match("(%d+)%.json$")
		if pane_id and not active_pane_ids[pane_id] then
			os.remove(path)
		end
	end
end

-- Scan all WezTerm panes for Claude sessions
function M.scan()
	local now = os.time()
	if now - cache.timestamp < CACHE_TTL then
		return cache.agents
	end

	-- Get pane list with tty_name
	local list_ok, list_out = wezterm.run_child_process({
		WEZTERM,
		"cli",
		"list",
		"--format",
		"json",
	})
	if not list_ok or list_out == "" then
		return cache.agents
	end
	local pane_list = wezterm.json_parse(list_out) or {}

	-- Build tty → pane mapping ("/dev/ttys009" → "ttys009")
	local tty_to_pane = {}
	for _, p in ipairs(pane_list) do
		if p.tty_name and p.tty_name ~= "" then
			local short_tty = p.tty_name:match("/dev/(.+)") or p.tty_name
			tty_to_pane[short_tty] = p
		end
	end

	-- Get process table
	local procs, children, claude_pids = build_process_table()

	-- Match claude processes to WezTerm panes
	local agents = {}
	local seen_panes = {}

	for cpid in pairs(claude_pids) do
		local info = procs[cpid]
		if info and info.tty and info.tty ~= "??" then
			local pane = tty_to_pane[info.tty]
			if pane and not seen_panes[pane.pane_id] then
				seen_panes[pane.pane_id] = true

				local running = is_running(cpid, children, procs)
				local status = running and "running" or "idle"

				-- Extract project name from cwd
				local cwd = ""
				if pane.cwd then
					cwd = pane.cwd:match("file://[^/]*(/.+)") or pane.cwd
				end
				local project = cwd:match("([^/]+)$") or ""

				-- Overlay hook-provided activity if available
				local activity = read_activity(pane.pane_id)
				if not activity or activity == "" or activity == "Starting" then
					activity = status == "running" and "Working..." or "Idle"
				end

				table.insert(agents, {
					pane_id = pane.pane_id,
					workspace = pane.workspace or "",
					project = project,
					cwd = cwd,
					status = status,
					activity = activity,
				})
			end
		end
	end

	-- Sort by workspace, then project
	table.sort(agents, function(a, b)
		if a.workspace ~= b.workspace then
			return a.workspace < b.workspace
		end
		return a.project < b.project
	end)

	-- Detect running → idle transitions for completion notifications
	local current_states = {}
	for _, a in ipairs(agents) do
		current_states[a.pane_id] = a.status
		local prev = prev_states[a.pane_id]
		if prev == "running" and a.status == "idle" then
			os.execute(
				string.format(
					[[osascript -e 'display notification "Claude finished in %s" with title "Claude Code" sound name "Glass"' &]],
					a.project:gsub("'", "'\\''")
				)
			)
		end
	end
	-- Prune prev_states to prevent unbounded growth
	prev_states = current_states

	-- Clean up stale hook files (debounced, not on every scan)
	if now - last_cleanup >= CLEANUP_INTERVAL then
		last_cleanup = now
		local active_ids = {}
		for _, a in ipairs(agents) do
			active_ids[tostring(a.pane_id)] = true
		end
		cleanup_stale_files(active_ids)
	end

	cache.agents = agents
	cache.timestamp = now
	return agents
end

-- Get running / total counts
function M.counts()
	local agents = M.scan()
	local running = 0
	for _, a in ipairs(agents) do
		if a.status == "running" then
			running = running + 1
		end
	end
	return running, #agents
end

-- Tabline component: "🔵 2/3" or ""
function M.status_component(window)
	local running, total = M.counts()
	if total == 0 then
		return ""
	end
	local icon = running > 0 and "🔵" or "⚫"
	return string.format("%s %d/%d", icon, running, total)
end

return M
