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
          "WhichKeyFloat",
          "WhichKeyBorder",
          "NotifyBackground",
        }
        -- BufferLine と lualine はハイライトグループが動的生成されるためパターンマッチで一括対応する
        local prefix_patterns = {
          "BufferLine",
          "lualine_b_",
          "lualine_c_",
          "lualine_x_",
          "lualine_y_",
          "lualine_z_",
        }
        local function clear_bg()
          local function clear(name)
            local hl = vim.api.nvim_get_hl(0, { name = name, link = false })
            vim.api.nvim_set_hl(0, name, vim.tbl_extend("force", hl, { bg = "NONE", ctermbg = "NONE" }))
          end
          for _, g in ipairs(groups) do
            clear(g)
          end
          for _, prefix in ipairs(prefix_patterns) do
            for _, name in ipairs(vim.fn.getcompletion(prefix, "highlight")) do
              clear(name)
            end
          end
          -- 透過背景上で埋もれないよう Comment の前景色を持ち上げる
          local comment_hl = vim.api.nvim_get_hl(0, { name = "Comment", link = false })
          vim.api.nvim_set_hl(0, "Comment", vim.tbl_extend("force", comment_hl, { fg = "#8A9199", bg = "NONE" }))
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
