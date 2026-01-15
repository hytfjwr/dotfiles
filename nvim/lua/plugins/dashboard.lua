return {
  "nvimdev/dashboard-nvim",
  event = "VimEnter",
  dependencies = { "nvim-tree/nvim-web-devicons" },
  config = function()
    require("dashboard").setup({
      theme = "hyper",
      config = {
        week_header = {
          enable = true,
        },
        shortcut = {
          {
            desc = " Projects",
            group = "DiagnosticHint",
            action = "Telescope projects",
            key = "p",
          },
          { desc = "󰊳 Update", group = "@property", action = "Lazy update", key = "u" },
          {
            icon = " ",
            icon_hl = "@variable",
            desc = "Files",
            group = "Label",
            action = "Telescope find_files",
            key = "f",
          },
          {
            desc = " dotfiles",
            group = "Number",
            action = "Telescope find_files cwd=~/Dev/dotfiles",
            key = "d",
          },
        },
        packages = { enable = true },
        project = { enable = true, limit = 8, icon = " ", label = "", action = "Telescope find_files cwd=" },
        mru = { limit = 10, icon = " ", label = "", cwd_only = false },
        footer = {},
      },
    })

    -- オレンジ色のハイライト設定
    vim.api.nvim_set_hl(0, "DashboardHeader", { fg = "#ff8800", bold = true })
    vim.api.nvim_set_hl(0, "DashboardFooter", { fg = "#ff8800", italic = true })
    vim.api.nvim_set_hl(0, "DashboardDesc", { fg = "#ff9500" })
    vim.api.nvim_set_hl(0, "DashboardKey", { fg = "#ff8800", bold = true })
    vim.api.nvim_set_hl(0, "DashboardIcon", { fg = "#ff8800" })
    vim.api.nvim_set_hl(0, "DashboardShortCut", { fg = "#ff9500" })
    -- ファイル・プロジェクト関連
    vim.api.nvim_set_hl(0, "DashboardMruTitle", { fg = "#ff8800", bold = true })
    vim.api.nvim_set_hl(0, "DashboardMruIcon", { fg = "#ff8800" })
    vim.api.nvim_set_hl(0, "DashboardFiles", { fg = "#ff9500" })
    vim.api.nvim_set_hl(0, "DashboardProjectTitle", { fg = "#ff8800", bold = true })
    vim.api.nvim_set_hl(0, "DashboardProjectIcon", { fg = "#ff8800" })
    vim.api.nvim_set_hl(0, "DashboardProjectTitleIcon", { fg = "#ff8800" })
  end,
}
