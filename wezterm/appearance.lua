-- WezTerm appearance settings
local wezterm = require("wezterm")

local M = {}

function M.apply(config)
	-- フォント設定
	config.font = wezterm.font_with_fallback({ "0xProto", "Hiragino Sans" })
	config.harfbuzz_features = { "calt=0", "clig=0", "liga=0" }
	config.text_background_opacity = 1.0
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
	config.colors = {
		background = "#0a0f18",
	}

	-- ウィンドウ設定
	config.window_background_opacity = 0.45
	config.macos_window_background_blur = 20
	config.window_decorations = "RESIZE"
	config.window_padding = {
		left = 10,
		right = 10,
		top = 10,
		bottom = 10,
	}

	-- ハイパーリンク設定
	config.hyperlink_rules = {
		{
			regex = [[\bhttps?://\S+\.\S+]],
			format = "$0",
		},
	}

	-- スクロール設定
	config.scrollback_lines = 10000

	-- レンダリング設定
	config.front_end = "WebGpu"
	config.webgpu_power_preference = "HighPerformance"
	config.max_fps = 120
end

return M
