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
	background = "#0a0a0a",
}

-- 設定を自動リロードする
config.automatically_reload_config = true
wezterm.on("window-config-reloaded", function(window)
	window:toast_notification("WezTerm", "Config reloaded!")
end)

-- アップデートチェックを有効にする
config.check_for_updates = true
config.check_for_updates_interval_seconds = 86400

-- ウィンドウ設定
config.window_background_opacity = 0.6
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
		"#0a0a0a",
		"#141414",
		"#1c1c1c",
		"#222222",
		"#1c1c1c",
		"#141414",
	},
	interpolation = "Linear",
	blend = "Rgb",
	noise = 8,
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

-- レンダリング設定
config.front_end = "WebGpu"
config.webgpu_power_preference = "HighPerformance"
config.max_fps = 250

-- 非アクティブペインの輝度を下げる（テキストと背景両方に適用）
-- config.inactive_pane_hsb = {
-- 	hue = 1.0,
-- 	saturation = 0.7,
-- 	brightness = 0.45,
-- }

-- キーバインド
config.keys = keybindings.keys
config.mouse_bindings = keybindings.mouse_bindings

-- Neovim診断情報の読み取り（キャッシュ付き）
local diag_cache = { data = nil, test = nil, last_read = 0 }
local CACHE_TTL = 3 -- 秒

local function read_json(path)
	local f = io.open(path, "r")
	if not f then
		return nil
	end
	local content = f:read("*a")
	f:close()
	if not content or content == "" then
		return nil
	end
	local ok, data = pcall(wezterm.json_parse, content)
	if not ok then
		return nil
	end
	-- 30秒以上古いデータはNvimが閉じられたと判断
	if os.time() - (data.timestamp or 0) > 30 then
		return nil
	end
	return data
end

local function refresh_diag_cache()
	local now = os.time()
	if now - diag_cache.last_read < CACHE_TTL then
		return
	end
	diag_cache.last_read = now
	diag_cache.data = read_json("/tmp/nvim_diagnostics.json")
	diag_cache.test = read_json("/tmp/nvim_test_results.json")
end

-- アクティブタブ内のいずれかのペインでnvimが動いているか検出
local function active_tab_has_nvim(window)
	local tab = window:active_tab()
	if not tab then
		return false
	end
	for _, p in ipairs(tab:panes()) do
		local name = p:get_foreground_process_name() or ""
		if name:match("nvim$") then
			return true
		end
	end
	return false
end

-- FormatItem参照テーブル: 内部プロパティだけ動的更新（参照自体は不変）
local diag_fg = { Foreground = { Color = "#AAD94C" } }

-- 診断テキスト（タブ内nvim検出 + ラベル付きアイコン）
local function nvim_diagnostics_text(window)
	if not active_tab_has_nvim(window) then
		return ""
	end
	refresh_diag_cache()
	local d = diag_cache.data
	local t = diag_cache.test
	if not d and not t then
		return ""
	end

	local parts = {}
	if t then
		if t.status == "RUNNING" then
			table.insert(parts, "󰑐 RUN")
		elseif t.status == "FAIL" then
			table.insert(parts, "✗ FAIL")
		elseif t.status == "PASS" then
			table.insert(parts, "✓ PASS")
		end
	end
	if d then
		if d.errors > 0 then
			table.insert(parts, " E:" .. d.errors)
		end
		if d.warnings > 0 then
			table.insert(parts, " W:" .. d.warnings)
		end
		if d.errors == 0 and d.warnings == 0 and not t then
			table.insert(parts, "✓ OK")
		end
	end

	return table.concat(parts, "  ")
end

-- tabline.wez レンダリング前に FormatItem の色プロパティだけ更新
wezterm.on("update-status", function(window, pane)
	refresh_diag_cache()
	local d = diag_cache.data
	local t = diag_cache.test
	if (t and t.status == "FAIL") or (d and d.errors > 0) then
		diag_fg.Foreground.Color = "#FF3333"
	elseif t and t.status == "RUNNING" then
		diag_fg.Foreground.Color = "#73B8FF"
	elseif d and d.warnings > 0 then
		diag_fg.Foreground.Color = "#E7C547"
	else
		diag_fg.Foreground.Color = "#AAD94C"
	end
end)

-- tabline セットアップ（セクション配列は静的、要素の参照だけ動的）
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
		tabline_x = { diag_fg, nvim_diagnostics_text, "ResetAttributes", "ram", "cpu" },
		tabline_y = { { "datetime", style = "%H:%M:%S" }, "battery" },
		tabline_z = { "domain" },
	},
	extensions = {
		"resurrect",
	},
})
tabline.apply_to_config(config)

return config
