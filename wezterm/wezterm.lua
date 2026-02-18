-- WezTerm configuration
local wezterm = require("wezterm")
local keybindings = require("keybindings")
local config = wezterm.config_builder()

-- resurrect.wezterm プラグイン
local resurrect = wezterm.plugin.require("https://github.com/MLFlexer/resurrect.wezterm")

-- tabline.wez プラグイン
local tabline = wezterm.plugin.require("https://github.com/michaelbrusegard/tabline.wez")

-- 最後にアクティブだった非nvimペインを追跡
local last_written_pane_id = nil
wezterm.on("update-status", function(window, pane)
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
			else
				wezterm.log_error("Failed to write /tmp/wezterm_last_active_pane")
			end
		end
	end
end)

-- 起動時にworkspace状態を復元
wezterm.on("gui-startup", resurrect.state_manager.resurrect_on_gui_startup)

-- 定期保存
resurrect.state_manager.periodic_save({
	interval_seconds = 30,
	save_tabs = true,
	save_windows = true,
	save_workspaces = true,
})

-- 定期保存完了後にcurrent_stateを更新
wezterm.on("resurrect.state_manager.periodic_save.finished", function()
	local workspace = wezterm.mux.get_active_workspace()
	resurrect.state_manager.save_state(resurrect.workspace_state.get_workspace_state())
	resurrect.state_manager.write_current_state(workspace, "workspace")
end)

-- フォント設定
config.font = wezterm.font_with_fallback({ "0xProto", "Hiragino Sans" })
config.harfbuzz_features = { "calt=0", "clig=0", "liga=0" }
config.text_background_opacity = 0.8
config.font_size = 16
config.cell_width = 1.0
config.line_height = 1.0
config.use_cap_height_to_scale_fallback_fonts = true
config.foreground_text_hsb = {
	hue = 1.0,
	saturation = 1.0,
	brightness = 1.2,
}
config.adjust_window_size_when_changing_font_size = false
config.use_ime = true

-- カラースキーム
config.color_scheme = "ayu"

-- 設定を自動リロードする
config.automatically_reload_config = true
wezterm.on("window-config-reloaded", function(window)
	window:toast_notification("WezTerm", "Config reloaded!")
end)

-- アップデートチェックを有効にする
config.check_for_updates = true
config.check_for_updates_interval_seconds = 86400

-- ウィンドウ設定
config.window_background_opacity = 0.55
config.macos_window_background_blur = 20
config.window_decorations = "RESIZE"
config.window_padding = {
	left = 10,
	right = 10,
	top = 10,
	bottom = 10,
}
config.window_background_gradient = {
	orientation = { Linear = { angle = -50.0 } },
	colors = {
		"#0f0c29",
		"#282a36",
		"#343746",
		"#3a3f52",
		"#343746",
		"#282a36",
	},
	interpolation = "Linear",
	blend = "Rgb",
	noise = 64,
	segment_size = 11,
	segment_smoothness = 1.0,
}

-- ハイパーリンク設定
config.hyperlink_rules = wezterm.default_hyperlink_rules()
config.hyperlink_rules = {
	{
		regex = [[\bhttps?://\S+\.\S+]],
		format = "$0",
	},
}

-- スクロール設定
config.scrollback_lines = 10000

-- フレームレート設定
config.max_fps = 250

-- 非アクティブペインの輝度を下げる（テキストと背景両方に適用）
config.inactive_pane_hsb = {
	hue = 1.0,
	saturation = 0.7,
	brightness = 0.45,
}

-- キーバインド
config.keys = keybindings.keys
config.mouse_bindings = keybindings.mouse_bindings

-- tabline セットアップ
tabline.setup({
	options = {
		theme = "ayu",
		section_separators = { left = "", right = "" },
		component_separators = { left = "", right = "" },
		tab_separators = { left = "", right = "" },
		theme_overrides = {
			normal_mode = {
				a = { bg = "#FF8F40" },
			},
			copy_mode = {
				a = { bg = "#AAD94C" },
			},
			search_mode = {
				a = { bg = "#D2A6FF" },
			},
		},
	},
	sections = {
		tabline_a = { "mode" },
		tabline_b = { "workspace" },
		tabline_c = { " " },
		tab_active = {
			"index",
			{ "process", icons_only = true, padding = { left = 1, right = 0 } },
			{ "parent", padding = 0 },
			"/",
			{ "cwd", max_length = 20, padding = { left = 0, right = 1 } },
			{ "zoomed", padding = 0 },
		},
		tab_inactive = {
			"index",
			{ "process", icons_only = true, padding = { left = 1, right = 0 } },
			{ "cwd", max_length = 20, padding = { left = 0, right = 1 } },
		},
		tabline_x = { "ram", "cpu" },
		tabline_y = { { "datetime", style = "%H:%M:%S" }, "battery" },
		tabline_z = { "domain" },
	},
	extensions = {
		"resurrect",
	},
})
tabline.apply_to_config(config)

return config
