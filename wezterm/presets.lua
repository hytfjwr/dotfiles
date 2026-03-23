-- WezTerm window preset management
local wezterm = require("wezterm")
local resurrect = wezterm.plugin.require("https://github.com/MLFlexer/resurrect.wezterm")

local M = {}

local PRESET_PREFIX = "preset_"

local NVIM = "/opt/homebrew/bin/nvim"
local LAZYGIT = "/opt/homebrew/bin/lazygit"
local CLAUDE = os.getenv("HOME") .. "/.local/bin/claude"

-- Builtin preset definitions
local BUILTINS = {
	{
		id = "dev",
		label = " Dev (Nvim + Terminal + Lazygit)",
		build = function(mux_win)
			local tab, root_pane, _ = mux_win:spawn_tab({ args = { NVIM } })
			local right_pane = root_pane:split({ direction = "Right", size = 0.30 })
			right_pane:split({
				direction = "Bottom",
				size = 0.50,
				args = { LAZYGIT },
			})
			return tab
		end,
	},
	{
		id = "claude",
		label = " Claude Code (Claude + Nvim)",
		build = function(mux_win)
			local tab, root_pane, _ = mux_win:spawn_tab({ args = { CLAUDE } })
			root_pane:split({
				direction = "Right",
				size = 0.50,
				args = { NVIM },
			})
			return tab
		end,
	},
	{
		id = "terminal",
		label = " Terminal Only",
		build = function(mux_win)
			local tab, _, _ = mux_win:spawn_tab({})
			return tab
		end,
	},
}

-- Scan for user-saved presets in resurrect state directory
local function get_user_presets()
	local state_dir = resurrect.state_manager.save_state_dir
	local window_dir = state_dir .. "window"

	local success, stdout = wezterm.run_child_process({
		"/opt/homebrew/bin/fd",
		"--max-depth",
		"1",
		"--type",
		"f",
		"-g",
		PRESET_PREFIX .. "*.json",
		window_dir,
	})

	if not success or stdout == "" then
		return {}
	end

	local presets = {}
	for path in stdout:gmatch("[^\n]+") do
		local name = path:match(PRESET_PREFIX .. "(.+)%.json$")
		if name then
			table.insert(presets, {
				id = "user:" .. name,
				label = "󰆓 " .. name,
			})
		end
	end
	return presets
end

-- Close old tabs after a preset has been applied
local function close_old_tabs(window, new_pane, old_tab_count)
	for _ = 1, old_tab_count do
		window:perform_action(wezterm.action.ActivateTab(0), new_pane)
		window:perform_action(wezterm.action.CloseCurrentTab({ confirm = false }), new_pane)
	end
	window:perform_action(wezterm.action.ActivateTab(0), new_pane)
end

-- Save current window state as a named preset
function M.save(window, pane)
	window:perform_action(
		wezterm.action.PromptInputLine({
			description = "Preset name:",
			action = wezterm.action_callback(function(inner_window, _, line)
				if not line or line == "" then
					return
				end
				local name = line:gsub("[^%w_%-]", "_")
				local mux_win = inner_window:mux_window()
				local state = resurrect.window_state.get_window_state(mux_win)
				resurrect.state_manager.save_state(state, PRESET_PREFIX .. name)
				inner_window:toast_notification("WezTerm", "Preset saved: " .. name)
			end),
		}),
		pane
	)
end

-- Load a preset (builtin or user-saved)
function M.load(window, pane)
	local choices = {}

	for _, preset in ipairs(BUILTINS) do
		table.insert(choices, {
			id = "builtin:" .. preset.id,
			label = preset.label,
		})
	end

	local user_presets = get_user_presets()
	for _, p in ipairs(user_presets) do
		table.insert(choices, p)
	end

	window:perform_action(
		wezterm.action.InputSelector({
			title = "Load Preset",
			choices = choices,
			fuzzy = true,
			action = wezterm.action_callback(function(inner_window, _, id, label)
				if not id then
					return
				end

				local mux_win = inner_window:mux_window()
				local old_tab_count = #mux_win:tabs()

				if id:match("^builtin:") then
					local preset_id = id:match("^builtin:(.+)$")
					local new_tab = nil
					for _, preset in ipairs(BUILTINS) do
						if preset.id == preset_id then
							new_tab = preset.build(mux_win)
							break
						end
					end
					if new_tab then
						close_old_tabs(inner_window, new_tab:active_pane(), old_tab_count)
					end
				elseif id:match("^user:") then
					local name = id:match("^user:(.+)$")
					local state = resurrect.state_manager.load_state(PRESET_PREFIX .. name, "window")
					if not state or not state.tabs then
						inner_window:toast_notification("WezTerm", "Failed to load preset: " .. name)
						return
					end
					resurrect.window_state.restore_window(mux_win, state, {
						close_open_tabs = true,
						relative = true,
						restore_text = false,
					})
				end

				inner_window:toast_notification("WezTerm", "Preset loaded: " .. (label or id))
			end),
		}),
		pane
	)
end

-- Delete a user-saved preset
function M.delete(window, pane)
	local presets = get_user_presets()

	if #presets == 0 then
		window:toast_notification("WezTerm", "No saved presets to delete")
		return
	end

	window:perform_action(
		wezterm.action.InputSelector({
			title = "Delete Preset",
			choices = presets,
			fuzzy = true,
			action = wezterm.action_callback(function(inner_window, _, id)
				if not id then
					return
				end
				local name = id:match("^user:(.+)$")
				if name then
					resurrect.state_manager.delete_state("window/" .. PRESET_PREFIX .. name .. ".json")
					inner_window:toast_notification("WezTerm", "Preset deleted: " .. name)
				end
			end),
		}),
		pane
	)
end

return M
