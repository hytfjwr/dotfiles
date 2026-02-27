-- WezTerm keybindings
local wezterm = require("wezterm")

local M = {}

-- フォントサイズ制限
local FONT_SIZE_MIN = 4
local FONT_SIZE_MAX = 128

-- プロジェクト一覧を取得（zoxide使用頻度順、フォールバック: ~/Dev/スキャン）
local function get_projects()
	local projects = {}
	local home = os.getenv("HOME")
	local dev_prefix = home .. "/Dev/"

	-- zoxide DBから取得（使用頻度順）
	local success, stdout = wezterm.run_child_process({
		"/opt/homebrew/bin/zoxide",
		"query",
		"--list",
		"--score",
	})

	if success and stdout ~= "" then
		local dev_lower = dev_prefix:lower()
		for line in stdout:gmatch("[^\n]+") do
			local score, path = line:match("^%s*([%d.]+)%s+(.+)$")
			if path and path:lower():sub(1, #dev_lower) == dev_lower and path ~= dev_prefix:sub(1, -2) then
				local name = path:match("([^/]+)$")
				table.insert(projects, {
					id = path,
					label = name .. " (" .. score .. ")",
				})
			end
		end
	else
		-- フォールバック: ~/Dev/ 直下をスキャン
		local ls_success, ls_stdout = wezterm.run_child_process({ "ls", "-1", dev_prefix })
		if ls_success then
			for name in ls_stdout:gmatch("[^\n]+") do
				table.insert(projects, {
					id = dev_prefix .. name,
					label = name,
				})
			end
		end
	end

	return projects
end

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
	-- オーバーレイ（Terminal / Neovim / Lazygit）
	{
		key = "p",
		mods = "CMD|SHIFT",
		action = wezterm.action.InputSelector({
			title = "Open Overlay",
			choices = {
				{ id = "terminal", label = " Terminal" },
				{ id = "nvim", label = " Neovim" },
				{ id = "lazygit", label = "󰊢 Lazygit" },
			},
			action = wezterm.action_callback(function(window, pane, id, _label)
				if not id then
					return
				end

				local args = nil
				if id == "nvim" then
					args = { "/opt/homebrew/bin/nvim" }
				elseif id == "lazygit" then
					args = { "/opt/homebrew/bin/lazygit" }
				end

				local new_pane = pane:split({
					direction = "Bottom",
					args = args,
				})

				window:perform_action(wezterm.action.TogglePaneZoomState, new_pane)
			end),
		}),
	},
	-- プロジェクトワークスペーススイッチャー
	{
		key = "p",
		mods = "CMD|OPT",
		action = wezterm.action_callback(function(window, pane)
			local projects = get_projects()

			if #projects == 0 then
				window:toast_notification("WezTerm", "No projects found in ~/Dev/")
				return
			end

			window:perform_action(
				wezterm.action.InputSelector({
					title = "Switch Project Workspace",
					choices = projects,
					fuzzy = true,
					action = wezterm.action_callback(function(inner_window, inner_pane, id, label)
						if not id then
							return
						end

						local project_name = id:match("([^/]+)$")

						-- 既存ワークスペースがあればそちらに切り替え
						for _, ws in ipairs(wezterm.mux.get_workspace_names()) do
							if ws == project_name then
								inner_window:perform_action(
									wezterm.action.SwitchToWorkspace({ name = project_name }),
									inner_pane
								)
								return
							end
						end

						-- 新規ワークスペース作成
						inner_window:perform_action(
							wezterm.action.SwitchToWorkspace({
								name = project_name,
								spawn = { cwd = id },
							}),
							inner_pane
						)
					end),
				}),
				pane
			)
		end),
	},
	-- 前のワークスペースに切り替え
	{
		key = "[",
		mods = "CMD|SHIFT",
		action = wezterm.action_callback(function(window, pane)
			local workspaces = wezterm.mux.get_workspace_names()
			if #workspaces <= 1 then
				return
			end
			local current = wezterm.mux.get_active_workspace()
			for i, ws in ipairs(workspaces) do
				if ws == current then
					local prev = workspaces[(i - 2) % #workspaces + 1]
					window:perform_action(wezterm.action.SwitchToWorkspace({ name = prev }), pane)
					return
				end
			end
		end),
	},
	-- 次のワークスペースに切り替え
	{
		key = "]",
		mods = "CMD|SHIFT",
		action = wezterm.action_callback(function(window, pane)
			local workspaces = wezterm.mux.get_workspace_names()
			if #workspaces <= 1 then
				return
			end
			local current = wezterm.mux.get_active_workspace()
			for i, ws in ipairs(workspaces) do
				if ws == current then
					local next_ws = workspaces[i % #workspaces + 1]
					window:perform_action(wezterm.action.SwitchToWorkspace({ name = next_ws }), pane)
					return
				end
			end
		end),
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
