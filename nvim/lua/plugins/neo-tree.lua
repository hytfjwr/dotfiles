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
        follow_curent_file = {
          enebled = true,
          leave_dirs_open = true,
        },
      },
    },
  },
}
