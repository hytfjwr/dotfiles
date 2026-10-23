-- WezTerm appearance settings
local wezterm = require("wezterm")

local M = {}

-- 単色の透過背景の不透明度。keybindings.lua の背景モード切り替えでも使う
M.window_opacity = 0.45

function M.apply(config)
	-- フォント設定
	config.font = wezterm.font_with_fallback({ "0xProto", "Hiragino Sans" })
	config.harfbuzz_features = { "calt=0", "clig=0", "liga=0" }
	-- アプリが明示的に背景色を付けたセルの不透明度。
	-- Neovim は背景色を持たせるため、この値で Neovim pane だけが暗く（少し透過を残して）描画される。
	-- shell の空き領域はデフォルト背景なので window_background_opacity(0.45) 側が効き、透過は維持される。
	config.text_background_opacity = 0.7
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

	-- 点滅テキスト（SGR 5 / 6）。claude-statusline がゲージのアニメーションに使う。
	-- コマンドの再実行は 1 秒が下限なので、その間のなめらかな動きは端末側の
	-- イージング付きフェード（animation_fps で描画）に任せている。
	config.text_blink_rate = 300
	config.text_blink_rate_rapid = 150
	config.text_blink_ease_in = "EaseOut"
	config.text_blink_ease_out = "EaseIn"

	-- カラースキーム
	config.color_scheme = "ayu"
	config.colors = {
		background = "#0a0f18",
	}

	-- ウィンドウ設定
	config.window_background_opacity = M.window_opacity
	config.macos_window_background_blur = 40

	-- ループするグラデーション背景（backgrounds/gen-gradient.sh で生成）。
	-- background を指定すると window_background_opacity ではなくレイヤーの opacity が効くので、
	-- 0.75 にしてデスクトップのぼかしを少し透かす。画像が無ければ従来の単色透過のまま。
	local gradient = wezterm.config_dir .. "/backgrounds/gradient.png"
	if wezterm.glob(gradient)[1] then
		config.background = {
			{
				source = { File = gradient },
				width = "100%",
				height = "100%",
				opacity = 0.75,
				-- 明るさは画像を作り直さずここで調整する
				hsb = { brightness = 0.6 },
			},
		}
		-- APNG（8fps）を取りこぼさず、点滅テキストのフェードもなめらかに保つ
		config.animation_fps = 12
	end
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
