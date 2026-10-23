-- Guarded workspace save for resurrect.wezterm, plus a tabline component
-- that shows whether the last save succeeded.
local wezterm = require("wezterm")

local resurrect = wezterm.plugin.require("https://github.com/MLFlexer/resurrect.wezterm")
require("resurrect_patch").apply()

local M = {}

-- 保存間隔（秒）。これの3倍以上保存されていなければ止まっているとみなす
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

local function save_windows_and_tabs()
	for _, gui_win in ipairs(wezterm.gui.gui_windows()) do
		local mux_win = gui_win:mux_window()
		local title = mux_win:get_title()
		if title ~= "" and title ~= nil then
			resurrect.state_manager.save_state(resurrect.window_state.get_window_state(mux_win))
		end
		for _, mux_tab in ipairs(mux_win:tabs()) do
			local tab_title = mux_tab:get_title()
			if tab_title ~= "" and tab_title ~= nil then
				resurrect.state_manager.save_state(resurrect.tab_state.get_tab_state(mux_tab))
			end
		end
	end
end

-- resurrect の periodic_save（time.call_after の連鎖）は、設定リロードで評価時の
-- Lua 状態が捨てられるとタイマーごと消え、保存が黙って止まる。
-- update-status は常に現役の設定で毎秒呼ばれるので、そこで間隔を見て保存する
local function maybe_save()
	local now = os.time()
	if now - (wezterm.GLOBAL.workspace_save_last_run or 0) < M.interval_seconds then
		return
	end
	wezterm.GLOBAL.workspace_save_last_run = now

	local ok, err = pcall(save_windows_and_tabs)
	if not ok then
		wezterm.log_error("resurrect: window/tab save failed: " .. tostring(err))
	end
	ok, err = pcall(M.save)
	if not ok then
		wezterm.log_error("resurrect: workspace save failed: " .. tostring(err))
		set_status("error", tostring(err))
	end
end

function M.setup()
	-- 書き込み失敗は resurrect.error で通知される
	wezterm.on("resurrect.error", function(err)
		set_status("error", tostring(err))
	end)
	wezterm.on("update-status", maybe_save)
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
