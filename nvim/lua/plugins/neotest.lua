return {
  {
    "nvim-neotest/neotest",
    dependencies = {
      "nvim-neotest/nvim-nio",
      "nvim-lua/plenary.nvim",
      "antoinemadec/FixCursorHold.nvim",
      "nvim-treesitter/nvim-treesitter",
      "olimorris/neotest-phpunit",
      "marilari88/neotest-vitest",
    },
    config = function()
      local neotest = require("neotest")

      neotest.setup({
        adapters = {
          require("neotest-phpunit")({
            -- TODO FIX THIS
            phpunit_cmd = function()
              return { "docker", "compose", "exec", "-T", "-w", "/work", "app", "vendor/bin/phpunit" }
            end,
            root_files = { "composer.json", "phpunit.xml", ".gitignore", "docker-compose.yml" },
            filter_dirs = { ".git", "node_modules", "vendor" },
            phpunit_test_command = function(path)
              local cwd = vim.fn.getcwd()
              local relative_path = path:gsub("^" .. cwd .. "/", "")
              return relative_path
            end,
          }),
          require("neotest-vitest"),
        },
      })

      -- keymaps
      vim.keymap.set("n", "<leader>tt", function()
        neotest.run.run()
      end, { desc = "Run nearest test" })

      vim.keymap.set("n", "<leader>tf", function()
        neotest.run.run(vim.fn.expand("%"))
      end, { desc = "Run current file" })

      vim.keymap.set("n", "<leader>ts", function()
        neotest.run.run({ suite = true })
      end, { desc = "Run test suite" })

      vim.keymap.set("n", "<leader>to", function()
        neotest.output.open({ enter = true })
      end, { desc = "Show test output" })

      vim.keymap.set("n", "<leader>tO", function()
        neotest.output_panel.toggle()
      end, { desc = "Toggle test output panel" })

      vim.keymap.set("n", "<leader>tS", function()
        neotest.summary.toggle()
      end, { desc = "Toggle test summary" })
    end,
  },
}
