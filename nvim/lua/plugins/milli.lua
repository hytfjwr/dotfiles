-- milli.nvim — animated ASCII splash screens.
-- 引数なしの素の `nvim` 起動時に、matrix rain シェーダーを全画面表示して
-- snacks ダッシュボードの代わりにする。`q` / `<Esc>` で終了。
-- シェーダーはバッファ全体を毎フレーム上書きするフルスクリーン専用なので、
-- snacks のヘッダーには載せられない（snacks ダッシュボードは無効化済み）。
return {
  "amansingh-afk/milli.nvim",
  lazy = false,
  config = function()
    local stdin = false
    vim.api.nvim_create_autocmd("StdinReadPre", {
      once = true,
      callback = function()
        stdin = true
      end,
    })

    vim.api.nvim_create_autocmd("VimEnter", {
      once = true,
      callback = function()
        -- 素の `nvim` のときだけ発動：ファイル引数なし・stdin パイプなし・空バッファ
        if stdin or vim.fn.argc(-1) ~= 0 then
          return
        end
        local first = vim.api.nvim_get_current_buf()
        if vim.api.nvim_buf_get_name(first) ~= "" or vim.bo[first].buftype ~= "" then
          return
        end
        local lines = vim.api.nvim_buf_get_lines(first, 0, -1, false)
        if #lines > 1 or (lines[1] and lines[1] ~= "") then
          return
        end

        local runtime = require("milli.runtime")

        local buf = vim.api.nvim_create_buf(false, true)
        vim.bo[buf].buftype = "nofile"
        vim.bo[buf].bufhidden = "wipe"
        vim.bo[buf].swapfile = false
        vim.api.nvim_buf_set_name(buf, "milli-shader://rain")
        vim.cmd("buffer! " .. buf)

        -- rain が画面いっぱいに広がるよう UI 装飾を一時的に外す
        local win = vim.api.nvim_get_current_win()
        local saved = {
          number = vim.wo[win].number,
          relativenumber = vim.wo[win].relativenumber,
          signcolumn = vim.wo[win].signcolumn,
          cursorline = vim.wo[win].cursorline,
          list = vim.wo[win].list,
          fillchars = vim.wo[win].fillchars,
        }
        vim.wo[win].number = false
        vim.wo[win].relativenumber = false
        vim.wo[win].signcolumn = "no"
        vim.wo[win].cursorline = false
        vim.wo[win].list = false
        vim.wo[win].fillchars = "eob: "

        local stop = runtime.play_shader(buf, { shader = "rain" })
        local function quit()
          stop()
          if vim.api.nvim_win_is_valid(win) then
            for k, v in pairs(saved) do
              vim.wo[win][k] = v
            end
          end
          pcall(vim.cmd, "bwipeout!")
        end
        vim.keymap.set("n", "q", quit, { buffer = buf, nowait = true, silent = true })
        vim.keymap.set("n", "<Esc>", quit, { buffer = buf, nowait = true, silent = true })
      end,
    })
  end,
}
