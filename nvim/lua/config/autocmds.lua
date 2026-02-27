-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/autocmds.lua
--
-- Add any additional autocmds here
-- with `vim.api.nvim_create_autocmd`
--
-- Or remove existing autocmds by their group name (which is prefixed with `lazyvim_` for the defaults)
vim.api.nvim_del_augroup_by_name("lazyvim_wrap_spell")

-- Auto-save on insert mode exit
vim.api.nvim_create_autocmd("InsertLeave", {
  group = vim.api.nvim_create_augroup("auto_save_on_insert_leave", { clear = true }),
  callback = function()
    if vim.bo.modified then
      vim.cmd("silent write")
    end
  end,
})

-- Insert モード強調ハイライト
local insert_hl_augroup = vim.api.nvim_create_augroup("insert_mode_highlight", { clear = true })

local function get_hl(name)
  local ok, hl = pcall(vim.api.nvim_get_hl, 0, { name = name, link = false })
  return ok and hl or {}
end

local function capture_orig_hl()
  return {
    CursorLine = get_hl("CursorLine"),
    LineNr = get_hl("LineNr"),
    CursorLineNr = get_hl("CursorLineNr"),
  }
end

-- カラースキーム適用済みの値を即座に保存（VeryLazy で読み込まれるため安全）
local orig_hl = capture_orig_hl()

vim.api.nvim_create_autocmd("ColorScheme", {
  group = insert_hl_augroup,
  callback = function()
    orig_hl = capture_orig_hl()
  end,
})

vim.api.nvim_create_autocmd("InsertEnter", {
  group = insert_hl_augroup,
  callback = function()
    vim.api.nvim_set_hl(0, "CursorLine", { bg = "#0d1f0d" })
    vim.api.nvim_set_hl(0, "LineNr", { fg = "#73d997", bg = "NONE" })
    vim.api.nvim_set_hl(0, "CursorLineNr", { fg = "#73d997", bg = "NONE", bold = true })
    if vim.bo.buftype ~= "terminal" then
      vim.notify("-- INSERT --", vim.log.levels.INFO, {
        title = "Mode",
        timeout = 800,
        id = "insert_mode_notify",
      })
    end
  end,
})

vim.api.nvim_create_autocmd("InsertLeave", {
  group = insert_hl_augroup,
  callback = function()
    vim.api.nvim_set_hl(0, "CursorLine", orig_hl.CursorLine)
    vim.api.nvim_set_hl(0, "LineNr", orig_hl.LineNr)
    vim.api.nvim_set_hl(0, "CursorLineNr", orig_hl.CursorLineNr)
  end,
})
