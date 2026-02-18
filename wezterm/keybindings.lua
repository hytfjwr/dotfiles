-- WezTerm keybindings
local wezterm = require("wezterm")

local M = {}

-- フォントサイズ制限
local FONT_SIZE_MIN = 4
local FONT_SIZE_MAX = 128

M.keys = {
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
	-- フォントサイズ拡大・縮小（範囲制限付き）
	{
		key = "+",
		mods = "CMD",
		action = wezterm.action_callback(function(window, pane)
			if window:effective_config().font_size < FONT_SIZE_MAX then
				window:perform_action(wezterm.action.IncreaseFontSize, pane)
			end
		end),
	},
	{
		key = "=",
		mods = "CMD",
		action = wezterm.action_callback(function(window, pane)
			if window:effective_config().font_size < FONT_SIZE_MAX then
				window:perform_action(wezterm.action.IncreaseFontSize, pane)
			end
		end),
	},
	{
		key = "-",
		mods = "CMD",
		action = wezterm.action_callback(function(window, pane)
			if window:effective_config().font_size > FONT_SIZE_MIN then
				window:perform_action(wezterm.action.DecreaseFontSize, pane)
			end
		end),
	},
	{
		key = "0",
		mods = "CMD",
		action = wezterm.action.ResetFontSize,
	},
	-- フルスクリーン切り替え
	{
		key = "Enter",
		mods = "CMD",
		action = wezterm.action.ToggleFullScreen,
	},
	-- nvimペインにフォーカス
	{
		key = ";",
		mods = "CMD",
		action = wezterm.action_callback(function(window, _pane)
			local tab = window:active_tab()
			for _, pane_info in ipairs(tab:panes_with_info()) do
				local process = pane_info.pane:get_foreground_process_name() or ""
				local basename = process:match("([^/]+)$") or ""
				if basename == "nvim" then
					pane_info.pane:activate()
					return
				end
			end
		end),
	},
	-- タブ名変更
	{
		key = "o",
		mods = "CMD|SHIFT",
		action = wezterm.action.PromptInputLine({
			description = "タブ名を入力してください:",
			action = wezterm.action_callback(function(window, pane, line)
				if line then
					window:active_tab():set_title(line)
				end
			end),
		}),
	},
}

M.mouse_bindings = {
	-- 右クリックでペースト
	{
		event = { Down = { streak = 1, button = "Right" } },
		mods = "NONE",
		action = wezterm.action.PasteFrom("Clipboard"),
	},
}

return M
