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
          -- 通常の行番号（選択されていない行）。bg は指定せず Normal のダーク背景を継承させる
          LineNr = { fg = "#95E6CB" }, -- より明るいグレー
          -- カレント行の行番号（選択されている行）
          CursorLineNr = { fg = "#FFCC66", bold = true }, -- 黄色で強調
          -- Insert モード用カーソル色（guicursor の iCursor グループ）
          iCursor = { bg = "#73d997", fg = "#0A0E14" },
        },
      })
      -- カラースキームを適用
      vim.cmd("colorscheme ayu-dark")
      -- 以前は WezTerm の透過を活かすため主要ハイライトの背景を NONE にしていたが、
      -- Neovim pane だけを暗くしたいので ayu-dark 本来のダーク背景をそのまま使う。
      -- Neovim のセルは明示的な背景色を持つため、WezTerm 側の text_background_opacity が効き、
      -- shell（デフォルト背景＝window_background_opacity）より暗く描画される。
    end,
  },
}
