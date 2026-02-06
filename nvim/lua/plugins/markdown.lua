return {
  -- render-markdown.nvim を無効化（LazyVim の lang.markdown エクストラから提供されるものを置換）
  { "MeanderingProgrammer/render-markdown.nvim", enabled = false },

  -- markdownlint を無効化
  {
    "mfussenegger/nvim-lint",
    optional = true,
    opts = {
      linters_by_ft = {
        markdown = {},
      },
    },
  },

  -- markview.nvim: Markdown インラインプレビュー
  {
    "OXY2DEV/markview.nvim",
    lazy = false,
    dependencies = {
      "nvim-treesitter/nvim-treesitter",
      "nvim-tree/nvim-web-devicons",
    },
    config = function()
      local markview = require("markview")
      markview.setup({
        preview = {
          icon_provider = "devicons",
        },
      })

      -- render-markdown.nvim が提供していた <leader>um トグルを再現
      Snacks.toggle({
        name = "Markview",
        get = function()
          return markview.state.enable
        end,
        set = function(enabled)
          if enabled then
            vim.cmd("Markview Enable")
          else
            vim.cmd("Markview Disable")
          end
        end,
      }):map("<leader>um")
    end,
  },
}
