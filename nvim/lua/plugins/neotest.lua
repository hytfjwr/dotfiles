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

      local test_results_file = "/tmp/nvim_test_results.json"

      local function write_test_status(status, passed, failed)
        local data = vim.json.encode({
          status = status,
          passed = passed or 0,
          failed = failed or 0,
          timestamp = os.time(),
        })
        local f = io.open(test_results_file, "w")
        if f then
          f:write(data)
          f:close()
        end
      end

      neotest.setup({
        consumers = {
          notify = function(client)
            local neotest_notif_id = "neotest_progress"
            local total_tests = 0

            client.listeners.run = function(adapter_id, root_id, position_ids)
              total_tests = 0
              for _, id in ipairs(position_ids) do
                local pos = client:get_position(id)
                if pos and pos:data().type == "test" then
                  total_tests = total_tests + 1
                end
              end
              if total_tests > 0 then
                write_test_status("RUNNING", 0, 0)
                vim.notify("Running " .. total_tests .. " tests...", vim.log.levels.INFO, {
                  title = "Neotest",
                  id = neotest_notif_id,
                  timeout = false,
                })
              end
            end

            client.listeners.results = function(adapter_id, results, partial)
              local passed, failed, skipped = 0, 0, 0
              local passed_names, failed_names = {}, {}
              for id, result in pairs(results) do
                local position = client:get_position(id)
                if position and position:data().type == "test" then
                  local name = position:data().name
                  if result.status == "passed" then
                    passed = passed + 1
                    table.insert(passed_names, name)
                  elseif result.status == "failed" then
                    failed = failed + 1
                    table.insert(failed_names, name)
                  elseif result.status == "skipped" then
                    skipped = skipped + 1
                  end
                end
              end

              if not partial then
                write_test_status(failed > 0 and "FAIL" or "PASS", passed, failed)
              end

              local done = passed + failed + skipped
              local parts = {}
              if passed > 0 then
                table.insert(parts, passed .. " passed")
              end
              if failed > 0 then
                table.insert(parts, failed .. " failed")
              end
              if skipped > 0 then
                table.insert(parts, skipped .. " skipped")
              end

              if partial then
                local msg = done .. "/" .. total_tests .. " (" .. table.concat(parts, ", ") .. ")"
                local level = failed > 0 and vim.log.levels.WARN or vim.log.levels.INFO
                vim.notify(msg, level, { title = "Neotest", id = neotest_notif_id, timeout = false })
                return
              end

              local msg = table.concat(parts, ", ")
              if #passed_names > 0 then
                table.sort(passed_names)
                msg = msg .. "\n\nPassed:\n- " .. table.concat(passed_names, "\n- ")
              end
              if #failed_names > 0 then
                table.sort(failed_names)
                msg = msg .. "\n\nFailed:\n- " .. table.concat(failed_names, "\n- ")
              end

              local level = failed > 0 and vim.log.levels.WARN or vim.log.levels.INFO
              vim.notify(msg, level, { title = "Neotest", id = neotest_notif_id })
            end
            -- Discover positions for buffers already open before neotest initialized
            require("nio").run(function()
              for _, buf in ipairs(vim.api.nvim_list_bufs()) do
                if vim.api.nvim_buf_is_loaded(buf) then
                  local file = vim.api.nvim_buf_get_name(buf)
                  if file and #file > 0 then
                    pcall(client.get_position, client, file)
                  end
                end
              end
            end)

            return {}
          end,
        },
        adapters = {
          require("neotest-phpunit")({
            phpunit_cmd = function()
              local cwd = vim.fn.getcwd()
              local config_path = cwd .. "/.neotest-phpunit.lua"
              if vim.fn.filereadable(config_path) == 1 then
                local docker_config = dofile(config_path)
                local script = vim.fn.stdpath("config") .. "/scripts/phpunit-docker.sh"
                local service = docker_config.service
                local workdir = docker_config.docker_workdir or "/work"
                return { script, service, workdir }
              end
              return "vendor/bin/phpunit"
            end,
            root_files = { "composer.json", "phpunit.xml", ".gitignore", "docker-compose.yml" },
            filter_dirs = { ".git", "node_modules", "vendor" },
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
