-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here
--
-- 新規タブでターミナル起動
vim.keymap.set("n", "tt", "<cmd>terminal<CR>", { silent = true, desc = "Open terminal in new tab" })

-- 下分割でターミナル起動
vim.keymap.set("n", "tx", function()
  vim.cmd("belowright new")
  vim.cmd("terminal")
end, { silent = true, desc = "Open terminal in bottom split" })

-- ターミナルを開いたら Insert モードに入る
vim.api.nvim_create_autocmd("TermOpen", {
  pattern = "*",
  callback = function()
    vim.cmd("startinsert")
  end,
})
