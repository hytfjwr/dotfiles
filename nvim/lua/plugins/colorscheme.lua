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

      -- WezTerm の背景透過を活かすため、主要ハイライトの背景を NONE に上書きする
      if vim.env.TERM_PROGRAM == "WezTerm" then
        local groups = {
          "Normal",
          "NormalNC",
          "NormalFloat",
          "FloatBorder",
          "FloatTitle",
          "SignColumn",
          "EndOfBuffer",
          "FoldColumn",
          "MsgArea",
          "VertSplit",
          "WinSeparator",
          "StatusLine",
          "StatusLineNC",
          "TabLine",
          "TabLineFill",
          "NeoTreeNormal",
          "NeoTreeNormalNC",
          "NeoTreeEndOfBuffer",
          "TelescopeNormal",
          "TelescopeBorder",
          "TelescopePromptNormal",
          "TelescopePromptBorder",
          "TelescopeResultsNormal",
          "TelescopeResultsBorder",
          "TelescopePreviewNormal",
          "TelescopePreviewBorder",
          "TelescopeTitle",
          "BufferLineFill",
          "BufferLineBackground",
          "WhichKeyFloat",
          "WhichKeyBorder",
          "NotifyBackground",
        }
        local function clear_bg()
          for _, g in ipairs(groups) do
            local hl = vim.api.nvim_get_hl(0, { name = g, link = false })
            vim.api.nvim_set_hl(0, g, vim.tbl_extend("force", hl, { bg = "NONE", ctermbg = "NONE" }))
          end
        end
        clear_bg()
        vim.api.nvim_create_autocmd("ColorScheme", {
          group = vim.api.nvim_create_augroup("wezterm_transparent_bg", { clear = true }),
          callback = clear_bg,
        })
        -- 遅延ロードされるプラグインが後からハイライトを定義しても適用されるよう、起動完了後にも実行
        vim.api.nvim_create_autocmd("User", {
          pattern = "VeryLazy",
          group = vim.api.nvim_create_augroup("wezterm_transparent_bg_verylazy", { clear = true }),
          callback = clear_bg,
        })
      end
    end,
  },
}
