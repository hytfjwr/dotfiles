-- GitHub Copilot (official plugin)
-- https://docs.github.com/en/copilot/how-tos/get-code-suggestions/get-ide-code-suggestions?tool=vimneovim
return {
  "github/copilot.vim",
  -- Load on first insert (for suggestions) or on any :Copilot command (setup/status/etc.)
  event = "InsertEnter",
  cmd = "Copilot",
  init = function()
    -- Tab is used by LazyVim's completion menu (blink.cmp),
    -- so disable Copilot's default <Tab> mapping and accept with <C-J> instead.
    vim.g.copilot_no_tab_map = true
  end,
  config = function()
    -- Accept the full suggestion
    vim.keymap.set("i", "<C-J>", 'copilot#Accept("\\<CR>")', {
      expr = true,
      replace_keycodes = false,
      desc = "Copilot: Accept suggestion",
    })
    -- Partial accepts
    vim.keymap.set("i", "<C-L>", "<Plug>(copilot-accept-word)", { desc = "Copilot: Accept word" })
    vim.keymap.set("i", "<M-Right>", "<Plug>(copilot-accept-line)", { desc = "Copilot: Accept line" })
    -- Cycle / dismiss suggestions
    vim.keymap.set("i", "<M-]>", "<Plug>(copilot-next)", { desc = "Copilot: Next suggestion" })
    vim.keymap.set("i", "<M-[>", "<Plug>(copilot-previous)", { desc = "Copilot: Previous suggestion" })
    vim.keymap.set("i", "<C-]>", "<Plug>(copilot-dismiss)", { desc = "Copilot: Dismiss suggestion" })
  end,
}
