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

-- 選択行の参照をClaudeCode形式でコピーし、cmux/weztermのペインに送信: <leader>cl
local function send_to_cmux(reference)
  local json = vim.fn.system({ "cmux", "rpc", "pane.last", "{}" })
  if vim.v.shell_error ~= 0 then
    vim.notify("Copied (cmux: no last pane): " .. reference, vim.log.levels.WARN)
    return
  end
  local ok, decoded = pcall(vim.json.decode, json)
  if not ok or type(decoded) ~= "table" or not decoded.surface_ref then
    vim.notify("Copied (cmux: malformed response): " .. reference, vim.log.levels.WARN)
    return
  end
  local surface_ref = decoded.surface_ref
  vim.fn.system({ "cmux", "send-panel", "--panel", surface_ref, " " .. reference .. " " })
  if vim.v.shell_error ~= 0 then
    vim.notify("Failed to send (cmux " .. surface_ref .. "): " .. reference, vim.log.levels.WARN)
  else
    vim.notify("Sent to " .. surface_ref .. ": " .. reference, vim.log.levels.INFO)
  end
end

local function send_to_wezterm(reference)
  local pane_id = ""
  local f = io.open("/tmp/wezterm_last_active_pane", "r")
  if f then
    pane_id = f:read("*all"):gsub("%s+", "")
    f:close()
  end
  if pane_id == "" then
    vim.notify("Copied (no active pane): " .. reference, vim.log.levels.WARN)
    return
  end
  vim.fn.system({ "wezterm", "cli", "send-text", "--pane-id", pane_id, " " .. reference .. " " })
  if vim.v.shell_error ~= 0 then
    vim.notify("Failed to send (pane may be closed): " .. reference, vim.log.levels.WARN)
  else
    vim.notify("Sent to pane " .. pane_id .. ": " .. reference, vim.log.levels.INFO)
  end
end

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

  -- クリップボードにコピー（送信失敗時のフォールバック）
  vim.fn.setreg("+", reference)

  -- ターミナル別に送信先を分岐（cmux優先）
  if os.getenv("CMUX_WORKSPACE_ID") then
    send_to_cmux(reference)
  elseif os.getenv("WEZTERM_PANE") or vim.fn.filereadable("/tmp/wezterm_last_active_pane") == 1 then
    send_to_wezterm(reference)
  else
    vim.notify("Copied (no terminal integration): " .. reference, vim.log.levels.WARN)
  end
end, { desc = "Send line reference to last active pane" })
