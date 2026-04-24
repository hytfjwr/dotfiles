return {
  {
    "linrongbin16/lsp-progress.nvim",
    event = "LspAttach",
    config = function()
      require("lsp-progress").setup()

      vim.api.nvim_create_autocmd("User", {
        group = vim.api.nvim_create_augroup("lualine_augroup", { clear = true }),
        pattern = "LspProgressStatusUpdated",
        callback = function()
          require("lualine").refresh()
        end,
      })
    end,
  },
  {
    "nvim-lualine/lualine.nvim",
    opts = function(_, opts)
      table.insert(opts.sections.lualine_c, function()
        local ok, progress = pcall(require, "lsp-progress")
        if ok then
          return progress.progress()
        end
        return ""
      end)
      -- Insert モード時にステータスバーを緑色に強調
      opts.sections.lualine_a = {
        {
          "mode",
          color = function()
            local mode = vim.fn.mode()
            if mode == "i" or mode == "ic" then
              return { bg = "#73d997", fg = "#0d1017", gui = "bold" }
            end
          end,
        },
      }

      -- WezTerm の背景透過を活かすため、lualine テーマの b/c/x/y/z セクションを透過にする
      if vim.env.TERM_PROGRAM == "WezTerm" then
        local mode_section = function(a_bg, a_fg)
          return {
            a = { fg = a_fg or "#0A0E14", bg = a_bg, gui = "bold" },
            b = { fg = "#B3B1AD", bg = "NONE" },
            c = { fg = "#B3B1AD", bg = "NONE" },
          }
        end
        opts.options = opts.options or {}
        opts.options.theme = {
          normal = mode_section("#FF8F40"),
          insert = mode_section("#73D997", "#0D1017"),
          visual = mode_section("#D2A6FF"),
          replace = mode_section("#F07178"),
          command = mode_section("#95E6CB"),
          inactive = {
            a = { fg = "#626A73", bg = "NONE", gui = "bold" },
            b = { fg = "#626A73", bg = "NONE" },
            c = { fg = "#626A73", bg = "NONE" },
          },
        }
      end
    end,
  },
}
