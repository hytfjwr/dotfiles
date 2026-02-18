-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here
--
local map = vim.api.nvim_set_keymap
local opts = { noremap = true, silent = true }

vim.api.nvim_set_var("mapleader", " ")

-- paste with cmd + d
vim.keymap.set("i", "<D-v>", function()
  vim.api.nvim_paste(vim.fn.getreg("+"), true, -1)
end, { desc = "Paste with Cmd+v" })

vim.keymap.set("n", "<D-v>", "+p", { desc = "Paste with Cmd+V" })

-- Shift Shiftで検索
vim.keymap.set("n", "<leader><leader>", function()
  Snacks.picker.smart()
end, { desc = "Search Files" })

vim.keymap.set("n", "<leader>sT", function()
  require("telescope.builtin").treesitter()
end, { desc = "Search Symbols (Treesitter)" })

-- ペイン移動: Option + Cmd + 方向キー
vim.keymap.set("n", "<D-M-Left>", "<C-w>h", { desc = "Move to left pane" })
vim.keymap.set("n", "<D-M-Down>", "<C-w>j", { desc = "Move to lower pane" })
vim.keymap.set("n", "<D-M-Up>", "<C-w>k", { desc = "Move to upper pane" })
vim.keymap.set("n", "<D-M-Right>", "<C-w>l", { desc = "Move to right pane" })

-- バッファ切り替え: Shift + Cmd + 方向キー
vim.keymap.set("n", "<D-S-Left>", ":bprevious<CR>", { desc = "Previous buffer" })
vim.keymap.set("n", "<D-S-Right>", ":bnext<CR>", { desc = "Next buffer" })

-- 選択行の参照をClaudeCode形式でコピーし、Claude Codeペインに送信: <leader>cl
vim.keymap.set("v", "<leader>cl", function()
  -- Gitルートを取得
  local git_root = vim.fn.system("git rev-parse --show-toplevel"):gsub("\n", "")
  if vim.v.shell_error ~= 0 then
    vim.notify("Git repository not found", vim.log.levels.ERROR)
    return
  end

  -- 現在のファイルの絶対パスを取得
  local file_path = vim.fn.expand("%:p")

  -- Gitルートからの相対パスを計算
  local relative_path = file_path:sub(#git_root + 2)

  -- 選択範囲の行番号を取得
  local start_line = vim.fn.line("v")
  local end_line = vim.fn.line(".")
  if start_line > end_line then
    start_line, end_line = end_line, start_line
  end

  -- 参照文字列を作成
  local reference = string.format("@%s#L%d-%d", relative_path, start_line, end_line)

  -- クリップボードにコピー
  vim.fn.setreg("+", reference)

  -- 最後にアクティブだった非nvimペインに送信
  local pane_id_file = "/tmp/wezterm_last_active_pane"
  local f = io.open(pane_id_file, "r")
  if f then
    local pane_id = f:read("*all"):gsub("%s+", "")
    f:close()
    if pane_id ~= "" then
      vim.fn.system("wezterm cli send-text --pane-id " .. pane_id .. " " .. vim.fn.shellescape(" " .. reference .. " "))
      if vim.v.shell_error ~= 0 then
        vim.notify("Failed to send (pane may be closed): " .. reference, vim.log.levels.WARN)
      else
        vim.notify("Sent to pane " .. pane_id .. ": " .. reference, vim.log.levels.INFO)
      end
    else
      vim.notify("Copied (no active pane): " .. reference, vim.log.levels.WARN)
    end
  else
    vim.notify("Copied (no active pane): " .. reference, vim.log.levels.WARN)
  end
end, { desc = "Send line reference to last active pane" })
