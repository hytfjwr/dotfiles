-- WezTerm configuration
local wezterm = require("wezterm")
local keybindings = require("keybindings")
local config = wezterm.config_builder()

-- フォント設定
config.font = wezterm.font("0xProto")
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
wezterm.on("window-config-reloaded", function(window, pane)
	window:toast_notification("WezTerm", "Config reloaded!")
end)

-- アップデートチェックを有効にする
config.check_for_updates = true
config.check_for_updates_interval_seconds = 86400

-- ウィンドウ設定
config.window_background_opacity = 0.45
config.macos_window_background_blur = 15
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

-- タブバーの透過
config.window_frame = {
	inactive_titlebar_bg = "none",
	active_titlebar_bg = "none",
}

-- タブ同士の境界線を非表示
config.colors = {
	tab_bar = {
		inactive_tab_edge = "none",
	},
}

-- タブの形をカスタマイズ

wezterm.on("format-tab-title", function(tab, tabs, panes, config, hover, max_width)
	local background = "#5c6d74"
	local foreground = "#FFFFFF"
	local edge_background = "none"
	if tab.is_active then
		background = "#9ac742"
		foreground = "#292929"
	end
	local edge_foreground = background
	-- タブ名が設定されていればそれを使用、なければペインのタイトルを使用
	local tab_title = tab.tab_title
	if not tab_title or #tab_title == 0 then
		tab_title = tab.active_pane.title
	end
	local title = "   " .. wezterm.truncate_right(tab_title, max_width - 1) .. "   "
	return {
		{ Background = { Color = edge_background } },
		{ Foreground = { Color = edge_foreground } },
		{ Background = { Color = background } },
		{ Foreground = { Color = foreground } },
		{ Text = title },
		{ Background = { Color = edge_background } },
		{ Foreground = { Color = edge_foreground } },
	}
end)

-- ハイパーリンク設定
config.hyperlink_rules = wezterm.default_hyperlink_rules()
config.hyperlink_rules = {
	{
		regex = [[\bhttps?://\S+\.\S+]],
		format = "$0",
	},
}

-- タブバー設定
config.hide_tab_bar_if_only_one_tab = true
config.tab_bar_at_bottom = false

-- スクロール設定
config.scrollback_lines = 10000

-- キーバインド
config.keys = keybindings.keys
config.mouse_bindings = keybindings.mouse_bindings

return config
