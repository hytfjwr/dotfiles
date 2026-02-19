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
    end,
  },
}
