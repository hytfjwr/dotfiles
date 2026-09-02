-- tuicr (code review TUI) を Snacks の float terminal で開く。
-- 終了後は tuicr-review がコメントを Claude Code ペイン (herdr) へ送る。
return {
  "folke/snacks.nvim",
  keys = {
    {
      "<leader>gR",
      function()
        if vim.fn.executable("tuicr-review") ~= 1 then
          vim.notify("tuicr-review not found in PATH", vim.log.levels.WARN)
          return
        end
        Snacks.terminal("tuicr-review", { cwd = LazyVim.root.git(), win = { style = "lazygit" } })
      end,
      desc = "Review diff with tuicr",
    },
  },
}
