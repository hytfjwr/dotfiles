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
    end,
  },
}
