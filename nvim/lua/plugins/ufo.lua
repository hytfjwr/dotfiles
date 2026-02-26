return {
  "kevinhwang91/nvim-ufo",
  dependencies = { "kevinhwang91/promise-async" },
  event = "BufReadPost",
  keys = {
    {
      "zR",
      function()
        require("ufo").openAllFolds()
      end,
      desc = "UFO: Open all folds",
    },
    {
      "zM",
      function()
        require("ufo").closeAllFolds()
      end,
      desc = "UFO: Close all folds",
    },
    {
      "zK",
      function()
        local winid = require("ufo").peekFoldedLinesUnderCursor()
        if not winid then
          vim.lsp.buf.hover()
        end
      end,
      desc = "UFO: Peek fold or hover",
    },
  },
  opts = {
    -- LSP → Treesitter → indent の順でフォールバック
    provider_selector = function(_, filetype, _)
      local lsp_filetypes = {
        "php",
        "typescript",
        "typescriptreact",
        "javascript",
        "go",
        "lua",
        "json",
        "yaml",
      }
      if vim.tbl_contains(lsp_filetypes, filetype) then
        return { "lsp", "indent" }
      end
      return { "treesitter", "indent" }
    end,

    -- 折りたたみプレビューのカスタマイズ
    fold_virt_text_handler = function(virtText, lnum, endLnum, width, truncate)
      local newVirtText = {}
      local suffix = ("  %d lines "):format(endLnum - lnum)
      local sufWidth = vim.fn.strdisplaywidth(suffix)
      local targetWidth = width - sufWidth
      local curWidth = 0

      for _, chunk in ipairs(virtText) do
        local chunkText = chunk[1]
        local chunkWidth = vim.fn.strdisplaywidth(chunkText)
        if targetWidth > curWidth + chunkWidth then
          table.insert(newVirtText, chunk)
        else
          chunkText = truncate(chunkText, targetWidth - curWidth)
          table.insert(newVirtText, { chunkText, chunk[2] })
          break
        end
        curWidth = curWidth + chunkWidth
      end

      table.insert(newVirtText, { suffix, "Comment" })
      return newVirtText
    end,
  },
  init = function()
    vim.o.foldcolumn = "1"
    vim.o.foldlevel = 99
    vim.o.foldlevelstart = 99
    vim.o.foldenable = true
  end,
}
