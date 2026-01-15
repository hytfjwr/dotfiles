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
