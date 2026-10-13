-- WezTerm configuration
local wezterm = require("wezterm")
local keybindings = require("keybindings")
local appearance = require("appearance")
local tabline_setup = require("tabline_setup")
local config = wezterm.config_builder()

-- resurrect.wezterm プラグイン
local resurrect = wezterm.plugin.require("https://github.com/MLFlexer/resurrect.wezterm")

-- 最後にアクティブだった非nvimペインを追跡
local last_written_pane_id = nil
wezterm.on("update-status", function(_, pane)
	local process = pane:get_foreground_process_name() or ""
	local basename = process:match("([^/]+)$") or ""
	if basename ~= "nvim" then
		local pane_id = tostring(pane:pane_id())
		if pane_id ~= last_written_pane_id then
			last_written_pane_id = pane_id
			local f = io.open("/tmp/wezterm_last_active_pane", "w")
			if f then
				f:write(pane_id)
				f:close()
			end
		end
	end
end)

-- 起動時にworkspace状態を復元
wezterm.on("gui-startup", function()
	local ok, err = resurrect.state_manager.resurrect_on_gui_startup()
	if not ok then
		wezterm.log_error("resurrect: restore on startup failed: " .. tostring(err))
	end
end)

-- 定期保存（workspaceはworkspace_saveがfinishedイベントで保存する）
resurrect.state_manager.periodic_save({
	interval_seconds = 30,
	save_tabs = true,
	save_windows = true,
	save_workspaces = false,
})

-- 縮退ガード付きのworkspace保存（保存状態はタブバーに表示）
require("workspace_save").setup()

-- 設定を自動リロードする
config.automatically_reload_config = true
wezterm.on("window-config-reloaded", function(window)
	window:toast_notification("WezTerm", "Config reloaded!")
end)

-- アップデートチェックを有効にする
config.check_for_updates = true
config.check_for_updates_interval_seconds = 86400

-- 外観設定
appearance.apply(config)

-- キーバインド
config.keys = keybindings.keys
config.mouse_bindings = keybindings.mouse_bindings

-- Tabline
tabline_setup.setup(config)

return config
