return {
  {
    "nvim-neo-tree/neo-tree.nvim",
    branch = "v3.x",
    dependencies = {
      "nvim-lua/plenary.nvim",
      "MunifTanjim/nui.nvim",
      "nvim-tree/nvim-web-devicons", -- optional, but recommended
    },
    lazy = false,
    opts = {
      filesystem = {
        filtered_items = {
          visible = true,
          hide_gitignored = false,
        },
        follow_current_file = {
          enabled = true,
          leave_dirs_open = true,
        },
      },
    },
    keys = {
      { "<leader>e", "<cmd>Neotree reveal<cr>", desc = "Neotree" },
    },
  },
}
