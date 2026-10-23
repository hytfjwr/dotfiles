-- Patch for resurrect.wezterm's pane_tree.create_pane_tree.
--
-- 元の実装は「root より右のペイン」と「root より下のペイン」を別々に集めるため、
-- 右下にあるペインが両方に入り、2 回目の処理で pane が nil になって保存が失敗する
-- （pane_tree.lua:78: attempt to index a nil value (field 'pane')）。
-- プラグインはアーカイブ済みで直らないので、こちらで差し替える。
-- 分割は二分割の入れ子なので、root の右端の線がどのペインも横切らなければ左右分割、
-- そうでなければ上下分割とみなし、各ペインをどちらか一方にだけ振り分ける。
local wezterm = require("wezterm")

-- wezterm.plugin.require 済みであること（package.path に plugin が入る）
local pane_tree = require("resurrect.pane_tree")
local utils = require("resurrect.utils")

local M = {}

local function compare_pane_by_coord(a, b)
	if a.left == b.left then
		return a.top < b.top
	end
	return a.left < b.left
end

local function pop_connected(root, panes, direction)
	for i, p in ipairs(panes) do
		local connected
		if direction == "right" then
			connected = root.top == p.top and root.left + root.width + 1 == p.left
		else
			connected = root.left == p.left and root.top + root.height + 1 == p.top
		end
		if connected then
			table.remove(panes, i)
			return p
		end
	end
end

-- root 以外のペインを右側と下側に重複なく分ける
local function partition(root, panes)
	local x = root.left + root.width
	local vertical_first = true
	for _, p in ipairs(panes) do
		if p.left <= x and p.left + p.width > x then
			vertical_first = false
			break
		end
	end

	local right, bottom = {}, {}
	local y = root.top + root.height
	for _, p in ipairs(panes) do
		if vertical_first then
			table.insert(p.left > x and right or bottom, p)
		else
			table.insert(p.top > y and bottom or right, p)
		end
	end
	return right, bottom
end

-- pane_tree.lua の insert_panes と同じ情報を集める
local function capture(root)
	local domain = root.pane:get_domain_name()
	if not wezterm.mux.get_domain(domain):is_spawnable() then
		wezterm.log_warn("Domain " .. domain .. " is not spawnable")
		wezterm.emit("resurrect.error", "Domain " .. domain .. " is not spawnable")
		return
	end
	root.domain = domain

	local cwd = root.pane:get_current_working_dir()
	root.cwd = cwd and cwd.file_path or ""
	if cwd and utils.is_windows then
		root.cwd = root.cwd:gsub("^/([a-zA-Z]):", "%1:")
	end

	if domain == "local" then
		root.alt_screen_active = root.pane:is_alt_screen_active()
		if root.alt_screen_active then
			local process_info = root.pane:get_foreground_process_info()
			if process_info then
				process_info.children = nil
				process_info.pid = nil
				process_info.ppid = nil
			end
			root.process = process_info
		else
			local nlines = math.min(root.pane:get_dimensions().scrollback_rows, pane_tree.max_nlines)
			root.text = root.pane:get_lines_as_escapes(nlines)
		end
	end
end

local function insert_panes(root, panes)
	if root == nil then
		return nil
	end

	capture(root)
	root.pane = nil

	if #panes == 0 then
		return root
	end

	local right, bottom = partition(root, panes)
	if #right > 0 then
		root.right = insert_panes(pop_connected(root, right, "right") or table.remove(right, 1), right)
	end
	if #bottom > 0 then
		root.bottom = insert_panes(pop_connected(root, bottom, "bottom") or table.remove(bottom, 1), bottom)
	end
	return root
end

function M.apply()
	pane_tree.create_pane_tree = function(panes)
		table.sort(panes, compare_pane_by_coord)
		local root = table.remove(panes, 1)
		return insert_panes(root, panes)
	end
end

return M
