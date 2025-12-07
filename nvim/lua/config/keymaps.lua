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
