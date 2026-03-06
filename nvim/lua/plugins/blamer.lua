return {
  "APZelos/blamer.nvim",
  event = "VeryLazy",
  opts = {},
  config = function()
    -- blamerを有効化
    vim.g.blamer_enabled = 1
    -- 遅延時間（ミリ秒）
    vim.g.blamer_delay = 100
    -- blame情報の表示形式
    vim.g.blamer_show_in_visual_modes = 0
    vim.g.blamer_show_in_insert_modes = 0
    -- 日付フォーマット
    vim.g.blamer_date_format = "%y/%m/%d %H:%M"
    -- プレフィックス
    vim.g.blamer_prefix = " > "
  end,
}
