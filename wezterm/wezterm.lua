-- WezTerm configuration
local wezterm = require("wezterm")
local config = wezterm.config_builder()

-- フォント設定
config.font = wezterm.font("0xProto")
config.harfbuzz_features = { 'calt=0', 'clig=0', 'liga=0' }
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
wezterm.on('window-config-reloaded', function(window, pane)
    window:toast_notification('WezTerm', 'Config reloaded!')
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
config.keys = {
	-- ペイン分割
	{
		key = "d",
		mods = "CMD",
		action = wezterm.action.SplitHorizontal({ domain = "CurrentPaneDomain" }),
	},
	{
		key = "d",
		mods = "CMD|SHIFT",
		action = wezterm.action.SplitVertical({ domain = "CurrentPaneDomain" }),
	},
	-- ペイン移動
	{
		key = "LeftArrow",
		mods = "CMD|OPT",
		action = wezterm.action.ActivatePaneDirection("Left"),
	},
	{
		key = "RightArrow",
		mods = "CMD|OPT",
		action = wezterm.action.ActivatePaneDirection("Right"),
	},
	{
		key = "UpArrow",
		mods = "CMD|OPT",
		action = wezterm.action.ActivatePaneDirection("Up"),
	},
	{
		key = "DownArrow",
		mods = "CMD|OPT",
		action = wezterm.action.ActivatePaneDirection("Down"),
	},
	-- タブ操作
	{
		key = "t",
		mods = "CMD",
		action = wezterm.action.SpawnTab("CurrentPaneDomain"),
	},
	{
		key = "w",
		mods = "CMD",
		action = wezterm.action.CloseCurrentPane({ confirm = true }),
	},
	-- タブ移動（方向キー）
	{
		key = "LeftArrow",
		mods = "CMD|SHIFT",
		action = wezterm.action.ActivateTabRelative(-1),
	},
	{
		key = "RightArrow",
		mods = "CMD|SHIFT",
		action = wezterm.action.ActivateTabRelative(1),
	},
	-- フォントサイズ拡大・縮小
	{
		key = "+",
		mods = "CMD",
		action = wezterm.action.IncreaseFontSize,
	},
	{
		key = "=",
		mods = "CMD",
		action = wezterm.action.IncreaseFontSize,
	},
	{
		key = "-",
		mods = "CMD",
		action = wezterm.action.DecreaseFontSize,
	},
	{
		key = "0",
		mods = "CMD",
		action = wezterm.action.ResetFontSize,
	},
}

-- マウス設定
config.mouse_bindings = {
	-- 右クリックでペースト
	{
		event = { Down = { streak = 1, button = "Right" } },
		mods = "NONE",
		action = wezterm.action.PasteFrom("Clipboard"),
	},
}

return config

