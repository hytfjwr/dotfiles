-- Guarded workspace save for resurrect.wezterm, plus a tabline component
-- that shows whether the last save succeeded.
local wezterm = require("wezterm")

local resurrect = wezterm.plugin.require("https://github.com/MLFlexer/resurrect.wezterm")

local M = {}

-- periodic_save の間隔（秒）。これの3倍以上保存されていなければ止まっているとみなす
M.interval_seconds = 30

-- 設定リロードを跨いで保持する
wezterm.GLOBAL.workspace_save = wezterm.GLOBAL.workspace_save or {}

local function set_status(result, detail)
	wezterm.GLOBAL.workspace_save = { result = result, detail = detail, time = os.time() }
end

local function count_tabs(state)
	local n = 0
	for _, w in ipairs(state.window_states or {}) do
		n = n + #(w.tabs or {})
	end
	return n
end

-- シャットダウン中などタブが消えかけた状態で正常な保存を上書きしないようにする
-- タブ数が減るときは直前の状態を .prev.json に退避する
function M.save()
	local state = resurrect.workspace_state.get_workspace_state()
	local tabs = count_tabs(state)
	if tabs == 0 then
		wezterm.log_warn("resurrect: skip saving empty workspace state")
		set_status("skip", "empty")
		return
	end

	local path =
		string.format("%sworkspace/%s.json", resurrect.state_manager.save_state_dir, (state.workspace:gsub("/", "+")))
	local f = io.open(path, "r")
	if f then
		local ok, prev = pcall(wezterm.json_parse, f:read("*a"))
		f:close()
		if ok and prev and count_tabs(prev) > tabs then
			os.rename(path, (path:gsub("%.json$", ".prev.json")))
		end
	end

	resurrect.state_manager.save_state(state)
	local ok, err = resurrect.state_manager.write_current_state(state.workspace, "workspace")
	if ok then
		set_status("ok", tostring(tabs) .. " tabs")
	else
		set_status("error", tostring(err))
	end
end

function M.setup()
	wezterm.on("resurrect.state_manager.periodic_save.finished", M.save)
	-- 書き込み失敗は resurrect.error で通知される
	wezterm.on("resurrect.error", function(err)
		set_status("error", tostring(err))
	end)
end

local function format_age(sec)
	if sec < 60 then
		return string.format("%ds", sec)
	elseif sec < 3600 then
		return string.format("%dm", sec // 60)
	end
	return string.format("%dh", sec // 3600)
end

function M.component()
	local s = wezterm.GLOBAL.workspace_save
	if not s or not s.time then
		return "💾 …"
	end
	local age = os.time() - s.time
	if s.result == "error" then
		return "❌ 💾 " .. format_age(age)
	elseif s.result == "skip" then
		return "⚠️ 💾 skip"
	elseif age > M.interval_seconds * 3 then
		return "⚠️ 💾 " .. format_age(age)
	end
	return "💾 " .. format_age(age)
end

return M
