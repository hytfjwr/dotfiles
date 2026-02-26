-- Neovim diagnostics bridge for WezTerm tabline
local wezterm = require("wezterm")

local M = {}

-- Neovim診断情報の読み取り（キャッシュ付き）
local diag_cache = { data = nil, test = nil, last_read = 0 }
local CACHE_TTL = 3 -- 秒

local function read_json(path)
	local f = io.open(path, "r")
	if not f then
		return nil
	end
	local content = f:read("*a")
	f:close()
	if not content or content == "" then
		return nil
	end
	local ok, data = pcall(wezterm.json_parse, content)
	if not ok then
		return nil
	end
	-- 30秒以上古いデータはNvimが閉じられたと判断
	if os.time() - (data.timestamp or 0) > 30 then
		return nil
	end
	return data
end

local function refresh_diag_cache()
	local now = os.time()
	if now - diag_cache.last_read < CACHE_TTL then
		return
	end
	diag_cache.last_read = now
	diag_cache.data = read_json("/tmp/nvim_diagnostics.json")
	diag_cache.test = read_json("/tmp/nvim_test_results.json")
end

-- アクティブタブ内のいずれかのペインでnvimが動いているか検出
local function active_tab_has_nvim(window)
	local tab = window:active_tab()
	if not tab then
		return false
	end
	for _, p in ipairs(tab:panes()) do
		local name = p:get_foreground_process_name() or ""
		if name:match("nvim$") then
			return true
		end
	end
	return false
end

-- FormatItem参照テーブル: 内部プロパティだけ動的更新（参照自体は不変）
M.diag_fg = { Foreground = { Color = "#AAD94C" } }

-- 診断テキスト（タブ内nvim検出 + ラベル付きアイコン）
function M.nvim_diagnostics_text(window)
	if not active_tab_has_nvim(window) then
		return ""
	end
	refresh_diag_cache()
	local d = diag_cache.data
	local t = diag_cache.test
	if not d and not t then
		return ""
	end

	local parts = {}
	if t then
		if t.status == "RUNNING" then
			table.insert(parts, "󰑐 RUN")
		elseif t.status == "FAIL" then
			table.insert(parts, "✗ FAIL")
		elseif t.status == "PASS" then
			table.insert(parts, "✓ PASS")
		end
	end
	if d then
		if d.errors > 0 then
			table.insert(parts, " E:" .. d.errors)
		end
		if d.warnings > 0 then
			table.insert(parts, " W:" .. d.warnings)
		end
		if d.errors == 0 and d.warnings == 0 and not t then
			table.insert(parts, "✓ OK")
		end
	end

	return table.concat(parts, "  ")
end

-- tabline.wez レンダリング前に FormatItem の色プロパティだけ更新
wezterm.on("update-status", function(window, pane)
	refresh_diag_cache()
	local d = diag_cache.data
	local t = diag_cache.test
	if (t and t.status == "FAIL") or (d and d.errors > 0) then
		M.diag_fg.Foreground.Color = "#FF3333"
	elseif t and t.status == "RUNNING" then
		M.diag_fg.Foreground.Color = "#73B8FF"
	elseif d and d.warnings > 0 then
		M.diag_fg.Foreground.Color = "#E7C547"
	else
		M.diag_fg.Foreground.Color = "#AAD94C"
	end
end)

return M
