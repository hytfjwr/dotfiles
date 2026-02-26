return {
  -- Ayu カラースキーム
  {
    "Shatur/neovim-ayu",
    lazy = false,
    priority = 1000,
    config = function()
      require("ayu").setup({
        mirage = false, -- false: dark, true: mirage
        terminal = true, -- ターミナルカラーも設定
        overrides = {
          -- 通常の行番号（選択されていない行）
          LineNr = { fg = "#95E6CB", bg = "NONE" }, -- より明るいグレー
          -- カレント行の行番号（選択されている行）
          CursorLineNr = { fg = "#FFCC66", bg = "NONE", bold = true }, -- 黄色で強調
          -- Insert モード用カーソル色（guicursor の iCursor グループ）
          iCursor = { bg = "#73d997", fg = "#0A0E14" },
        },
      })
      -- カラースキームを適用
      vim.cmd("colorscheme ayu-dark")
    end,
  },
}
