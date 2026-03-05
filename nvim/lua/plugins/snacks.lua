return {
  "folke/snacks.nvim",
  priority = 1000,
  lazy = false,
  ---@type snacks.Config
  opts = {
    -- your configuration comes here
    -- or leave it empty to use the default settings
    -- refer to the configuration section below
    bigfile = { enabled = true },
    dashboard = {
      enabled = true,
      sections = {
        { section = "header" },
        {
          section = "keys",
          gap = 1,
          padding = 1,
        },
        {
          icon = " ",
          title = "Recent Files",
          section = "recent_files",
          indent = 2,
          padding = 1,
          limit = 10,
        },
        {
          icon = " ",
          title = "Projects",
          section = "projects",
          indent = 2,
          padding = 1,
          limit = 8,
        },
        { section = "startup" },
      },
      preset = {
        header = (function()
          local headers = {
            [0] = [[
.d88888b  dP     dP 888888ba  888888ba   .d888888  dP    dP
88.    "' 88     88 88    `8b 88    `8b d8'    88  Y8.  .8P
`Y88888b. 88     88 88     88 88     88 88aaaaa88a  Y8aa8P
      `8b 88     88 88     88 88     88 88     88     88
d8'   .8P Y8.   .8P 88     88 88    .8P 88     88     88
 Y88888P  `Y88888P' dP     dP 8888888P  88     88     dP]],
            [1] = [[
8888ba.88ba   .88888.  888888ba  888888ba   .d888888  dP    dP
88  `8b  `8b d8'   `8b 88    `8b 88    `8b d8'    88  Y8.  .8P
88   88   88 88     88 88     88 88     88 88aaaaa88a  Y8aa8P
88   88   88 88     88 88     88 88     88 88     88     88
88   88   88 Y8.   .8P 88     88 88    .8P 88     88     88
dP   dP   dP  `8888P'  dP     dP 8888888P  88     88     dP]],
            [2] = [[
d888888P dP     dP  88888888b .d88888b  888888ba   .d888888  dP    dP
   88    88     88  88        88.    "' 88    `8b d8'    88  Y8.  .8P
   88    88     88 a88aaaa    `Y88888b. 88     88 88aaaaa88a  Y8aa8P
   88    88     88  88              `8b 88     88 88     88     88
   88    Y8.   .8P  88        d8'   .8P 88    .8P 88     88     88
   dP    `Y88888P'  88888888P  Y88888P  8888888P  88     88     dP]],
            [3] = [[
dP   dP   dP  88888888b 888888ba  888888ba   88888888b .d88888b  888888ba   .d888888  dP    dP
88   88   88  88        88    `8b 88    `8b  88        88.    "' 88    `8b d8'    88  Y8.  .8P
88  .8P  .8P a88aaaa    88     88 88     88 a88aaaa    `Y88888b. 88     88 88aaaaa88a  Y8aa8P
88  d8'  d8'  88        88     88 88     88  88              `8b 88     88 88     88     88
88.d8P8.d8P   88        88    .8P 88     88  88        d8'   .8P 88    .8P 88     88     88
8888' Y88'    88888888P 8888888P  dP     dP  88888888P  Y88888P  8888888P  88     88     dP]],
            [4] = [[
d888888P dP     dP  dP     dP  888888ba  .d88888b  888888ba   .d888888  dP    dP
   88    88     88  88     88  88    `8b 88.    "' 88    `8b d8'    88  Y8.  .8P
   88    88aaaaa88a 88     88 a88aaaa8P' `Y88888b. 88     88 88aaaaa88a  Y8aa8P
   88    88     88  88     88  88   `8b.       `8b 88     88 88     88     88
   88    88     88  Y8.   .8P  88     88 d8'   .8P 88    .8P 88     88     88
   dP    dP     dP  `Y88888P'  dP     dP  Y88888P  8888888P  88     88     dP]],
            [5] = [[
 88888888b  888888ba  dP 888888ba   .d888888  dP    dP
 88         88    `8b 88 88    `8b d8'    88  Y8.  .8P
a88aaaa    a88aaaa8P' 88 88     88 88aaaaa88a  Y8aa8P
 88         88   `8b. 88 88     88 88     88     88
 88         88     88 88 88    .8P 88     88     88
 dP         dP     dP dP 8888888P  88     88     dP]],
            [6] = [[
.d88888b   .d888888  d888888P dP     dP  888888ba  888888ba   .d888888  dP    dP
88.    "' d8'    88     88    88     88  88    `8b 88    `8b d8'    88  Y8.  .8P
`Y88888b. 88aaaaa88a    88    88     88 a88aaaa8P' 88     88 88aaaaa88a  Y8aa8P
      `8b 88     88     88    88     88  88   `8b. 88     88 88     88     88
d8'   .8P 88     88     88    Y8.   .8P  88     88 88    .8P 88     88     88
 Y88888P  88     88     dP    `Y88888P'  dP     dP 8888888P  88     88     dP]],
          }
          local wday = tonumber(os.date("%w"))
          local date = os.date("%Y-%m-%d")
          return headers[wday] .. "\n\n" .. date
        end)(),
        keys = {
          { icon = " ", key = "f", desc = "Find File", action = ":lua Snacks.dashboard.pick('files')" },
          { icon = " ", key = "n", desc = "New File", action = ":ene | startinsert" },
          { icon = " ", key = "g", desc = "Find Text", action = ":lua Snacks.dashboard.pick('live_grep')" },
          { icon = " ", key = "r", desc = "Recent Files", action = ":lua Snacks.dashboard.pick('oldfiles')" },
          {
            icon = " ",
            key = "d",
            desc = "Dotfiles",
            action = ":lua Snacks.dashboard.pick('files', {cwd = '~/Dev/dotfiles'})",
          },
          {
            icon = " ",
            key = "s",
            desc = "Restore Session",
            action = ":lua require('persistence').load()",
          },
          { icon = "󰊳 ", key = "u", desc = "Update", action = ":Lazy update" },
          { icon = " ", key = "q", desc = "Quit", action = ":qa" },
        },
      },
    },
    explorer = {
      enabled = true,
      ignored = true,
    },
    indent = { enabled = true },
    input = { enabled = true },
    picker = {
      enabled = true,
      sources = {
        files = {
          ignored = true,
        },
        grep = {
          ignored = true,
        },
      },
    },
    notifier = { enabled = true },
    quickfile = { enabled = true },
    scope = { enabled = true },
    scroll = { enabled = true },
    statuscolumn = { enabled = true },
    words = { enabled = true },
  },
}
