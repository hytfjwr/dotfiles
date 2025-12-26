-- WezTerm keybindings
local wezterm = require("wezterm")

local M = {}

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
	-- フルスクリーン切り替え
	{
		key = "Enter",
		mods = "CMD",
		action = wezterm.action.ToggleFullScreen,
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
