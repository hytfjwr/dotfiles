return {
  {
    "neovim/nvim-lspconfig",
    opts = {
      servers = {
        phpactor = {
          enabled = false,
        },
        intelephense = {
          enabled = true,
          settings = {
            intelephense = {
              files = {
                maxSize = 5000000,
                associations = { "*.php", "*.phtml" },
                exclude = {
                  "**/node_modules/**",
                  "**/vendor/**/Tests/**",
                  "**/vendor/**/tests/**",
                  "**/.git/**",
                },
              },
              environment = {
                includePaths = { "vendor" },
              },
              telemetry = {
                enabled = false,
              },
            },
          },
        },
      },
      setup = {
        phpactor = function()
          return true
        end,
      },
    },
  },
  {
    "mason-org/mason.nvim",
    opts = {
      ensure_installed = {
        "intelephense",
      },
    },
  },
}
