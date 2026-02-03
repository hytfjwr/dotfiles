return {
  "keaising/im-select.nvim",
  event = "InsertEnter",
  config = function()
    require("im_select").setup({
      -- 英字入力（デフォルト）
      default_im_select = "com.apple.keylayout.ABC",
      default_command = "im-select",

      -- Insertモード復帰時に直前のIME状態を復元
      set_previous_events = { "InsertEnter" },

      -- 英字に切り替えるイベント
      set_default_events = { "InsertLeave", "CmdlineEnter" },

      -- フォーカス移動時の動作
      set_default_events_on_focus_lost = true, -- フォーカス喪失時→英字
      set_previous_events_on_focus_gained = true, -- フォーカス復帰時→復元
    })
  end,
}
