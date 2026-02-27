-- WezTerm tabline plugin setup
local wezterm = require("wezterm")

local M = {}

local tabline = wezterm.plugin.require("https://github.com/michaelbrusegard/tabline.wez")

function M.setup(config)
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
			tabline_x = {
				"ram",
				"cpu",
			},
			tabline_y = { { "datetime", style = "%H:%M:%S" }, "battery" },
			tabline_z = { "domain" },
		},
		extensions = {
			"resurrect",
		},
	})
	tabline.apply_to_config(config)
end

return M
