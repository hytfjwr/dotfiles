-- Claude Code session switcher for WezTerm
-- Uses agent.lua for process-based session detection.
-- Shows a fuzzy selector to jump between Claude sessions across workspaces.
local wezterm = require("wezterm")
local agent = require("agent")

local M = {}

local WEZTERM = "/opt/homebrew/bin/wezterm"

local STATUS_ICON = {
	running = "🟢",
	idle = "💤",
}

function M.show_selector(window, pane)
	local agents = agent.scan()

	if #agents == 0 then
		window:toast_notification("WezTerm", "No active Claude sessions")
		return
	end

	local choices = {}
	for _, a in ipairs(agents) do
		local icon = STATUS_ICON[a.status] or "?"
		local label = string.format("%s %-16s  %-30s  %s", icon, a.project, a.activity, a.workspace)
		table.insert(choices, {
			id = tostring(a.pane_id),
			label = label,
		})
	end

	window:perform_action(
		wezterm.action.InputSelector({
			title = "󰚩 Claude Sessions",
			choices = choices,
			fuzzy = true,
			action = wezterm.action_callback(function(inner_window, inner_pane, id)
				if not id then
					return
				end

				-- Find workspace for target pane
				local target_ws = nil
				for _, a in ipairs(agents) do
					if tostring(a.pane_id) == id then
						target_ws = a.workspace
						break
					end
				end

				-- Switch workspace if needed
				if target_ws and target_ws ~= wezterm.mux.get_active_workspace() then
					inner_window:perform_action(wezterm.action.SwitchToWorkspace({ name = target_ws }), inner_pane)
				end

				-- Activate the target pane (handles cross-tab)
				wezterm.run_child_process({
					WEZTERM,
					"cli",
					"activate-pane",
					"--pane-id",
					id,
				})
			end),
		}),
		pane
	)
end

return M
