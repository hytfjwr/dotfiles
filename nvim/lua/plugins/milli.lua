-- milli.nvim — animated ASCII splash screens.
-- 引数なしの素の `nvim` 起動時に、milli-splashes レジストリの splash を全画面表示して
-- snacks ダッシュボードの代わりにする。`q` / `<Esc>` で終了（snacks 側は無効化済み）。
--
-- splash はフレーム列のデータファイルで、github.com/Amansingh-afk/milli-splashes から
-- ~/.local/share/nvim/milli/splashes/ にダウンロードされる。dotfiles 管理外（1ファイル
-- 1MB 前後あり同梱には向かない）なので、PRELOAD を初回起動時に自動取得して再現性を取る。
--
-- 手動操作:
--   :MilliBrowse            レジストリの splash 一覧
--   :MilliPreview <name>    splash を試写（バンドル分・インストール済み分を補完）
--   :MilliShader <name>     手続き生成シェーダー（doomfire / plasma / rain / starfield）
--   :MilliInstall <name>    PRELOAD 外の splash を追加
--
-- 起動画面を差し替えるときは SPLASH を PRELOAD 内の名前に変えるだけ。
local SPLASH = "skullthree"
local PRELOAD = { "hack-matrix", "milli-fire", "doomfire", "skullthree" }

return {
  "amansingh-afk/milli.nvim",
  lazy = false,
  config = function()
    local stdin = false
    vim.api.nvim_create_autocmd("StdinReadPre", {
      once = true,
      callback = function()
        stdin = true
      end,
    })

    -- 素の `nvim` かどうか：ファイル引数なし・stdin パイプなし・空バッファ
    local function is_bare_start()
      if stdin or vim.fn.argc(-1) ~= 0 then
        return false
      end
      local buf = vim.api.nvim_get_current_buf()
      if vim.api.nvim_buf_get_name(buf) ~= "" or vim.bo[buf].buftype ~= "" then
        return false
      end
      local lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
      return #lines <= 1 and (lines[1] == nil or lines[1] == "")
    end

    -- 未インストールの splash を非同期取得する。通信が走るのは初回だけ。
    -- 戻り値は「この時点で既に使える splash」の集合。
    local function preload()
      local registry = require("milli.registry")
      local installed = {}
      for _, name in ipairs(registry.installed()) do
        installed[name] = true
      end
      for _, name in ipairs(PRELOAD) do
        if not installed[name] then
          registry.install(name, function(ok, msg)
            if not ok then
              vim.notify("milli: " .. name .. " の取得に失敗: " .. msg, vim.log.levels.WARN)
            end
          end)
        end
      end
      return installed
    end

    -- runtime.play は frames[1] の非空行をバッファ内から探して続きを上書きする実装。
    -- 先頭フレームが全空白の splash（hack-matrix のような雨の立ち上がり）は anchor が
    -- 見つからず無音で再生されないので、最初の非空フレームを先頭に回してから渡す。
    local function rotate_to_visible(data)
      local first
      for i, frame in ipairs(data.frames) do
        for _, line in ipairs(frame) do
          if line:find("%S") then
            first = i
            break
          end
        end
        if first then
          break
        end
      end
      if not first or first == 1 then
        return data
      end
      local function shift(list)
        if type(list) ~= "table" then
          return list
        end
        local rotated = {}
        for i = 1, #list do
          rotated[i] = list[(first - 2 + i) % #list + 1]
        end
        return rotated
      end
      local out = vim.tbl_extend("force", {}, data)
      out.frames = shift(data.frames)
      out.delays = shift(data.delays)
      out.colors = shift(data.colors)
      return out
    end

    -- splash を全画面再生する。frames[1] を中央寄せで置いてから runtime.play に渡す。
    local function open_splash(name)
      local runtime = require("milli.runtime")
      local ok, data = pcall(runtime.load, { splash = name })
      if not ok or type(data) ~= "table" or not (data.frames and data.frames[1]) then
        vim.notify("milli: splash を読み込めません: " .. name, vim.log.levels.WARN)
        return
      end
      data = rotate_to_visible(data)

      local buf = vim.api.nvim_create_buf(false, true)
      vim.bo[buf].buftype = "nofile"
      vim.bo[buf].bufhidden = "wipe"
      vim.bo[buf].swapfile = false
      vim.api.nvim_buf_set_name(buf, "milli://" .. name)
      vim.cmd("buffer! " .. buf)

      -- splash が画面いっぱいに広がるよう UI 装飾を一時的に外す
      local win = vim.api.nvim_get_current_win()
      local saved = {
        number = vim.wo[win].number,
        relativenumber = vim.wo[win].relativenumber,
        signcolumn = vim.wo[win].signcolumn,
        cursorline = vim.wo[win].cursorline,
        list = vim.wo[win].list,
        fillchars = vim.wo[win].fillchars,
      }
      vim.wo[win].number = false
      vim.wo[win].relativenumber = false
      vim.wo[win].signcolumn = "no"
      vim.wo[win].cursorline = false
      vim.wo[win].list = false
      vim.wo[win].fillchars = "eob: "

      -- `:e <file>` などで splash から離れたときも装飾を戻す（bufhidden=wipe 経由含む）
      vim.api.nvim_create_autocmd({ "BufWipeout", "BufLeave" }, {
        buffer = buf,
        once = true,
        callback = function()
          if vim.api.nvim_win_is_valid(win) then
            for k, v in pairs(saved) do
              vim.wo[win][k] = v
            end
          end
        end,
      })

      local frame = data.frames[1]
      local cols = data.cols or 0
      if cols == 0 then
        for _, line in ipairs(frame) do
          cols = math.max(cols, vim.fn.strdisplaywidth(line))
        end
      end
      local pad = string.rep(" ", math.max(0, math.floor((vim.api.nvim_win_get_width(win) - cols) / 2)))
      local top = math.max(0, math.floor((vim.api.nvim_win_get_height(win) - #frame) / 2))

      local lines = {}
      for _ = 1, top do
        lines[#lines + 1] = ""
      end
      for _, line in ipairs(frame) do
        lines[#lines + 1] = pad .. line
      end
      vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
      vim.bo[buf].modified = false
      vim.bo[buf].modifiable = false

      local function quit()
        pcall(vim.cmd, "bwipeout!")
      end
      vim.keymap.set("n", "q", quit, { buffer = buf, nowait = true, silent = true })
      vim.keymap.set("n", "<Esc>", quit, { buffer = buf, nowait = true, silent = true })

      -- バッファが wipe されるとアニメーションループも自然に止まる
      runtime.play(buf, { data = data, loop = true })
    end

    vim.api.nvim_create_autocmd("VimEnter", {
      once = true,
      callback = function()
        local bare = is_bare_start()
        local installed = preload()
        if not bare then
          return
        end
        if installed[SPLASH] then
          open_splash(SPLASH)
        else
          -- 初回起動：ダウンロード完了を待って画面を差し替えると入力を奪うので次回に回す
          vim.notify("milli: " .. SPLASH .. " 取得中。次回起動から表示", vim.log.levels.INFO)
        end
      end,
    })
  end,
}
