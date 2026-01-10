-- Neovide設定

if vim.g.neovide then
  -- ============================================================
  -- フォント設定
  -- ============================================================
  -- 0xProtoをメインフォント、Hiragino Sansをフォールバックとして使用
  vim.opt.guifont = "0xProto,Hiragino Sans:h16"
  -- ============================================================
  -- 背景透過設定
  -- ============================================================
  vim.g.neovide_opacity = 0.65
  -- ============================================================
  -- パディング設定
  -- ============================================================
  vim.g.neovide_padding_top = 10
  vim.g.neovide_padding_bottom = 10
  vim.g.neovide_padding_right = 10
  vim.g.neovide_padding_left = 10
  -- ============================================================
  -- カーソルアニメーション設定
  -- ============================================================
  vim.g.neovide_cursor_animation_length = 0.13
  vim.g.neovide_cursor_trail_size = 0.8
  vim.g.neovide_cursor_antialiasing = true
  vim.g.neovide_cursor_animate_in_insert_mode = true
  vim.g.neovide_cursor_animate_command_line = true
  -- ============================================================
  -- カーソルパーティクル効果
  -- ============================================================
  vim.g.neovide_cursor_vfx_mode = "pixiedust"
  vim.g.neovide_cursor_vfx_opacity = 200.0
  vim.g.neovide_cursor_vfx_particle_lifetime = 1.2
  vim.g.neovide_cursor_vfx_particle_density = 7.0
  vim.g.neovide_cursor_vfx_particle_speed = 10.0
  -- ============================================================
  -- スクロールアニメーション設定
  -- ============================================================
  vim.g.neovide_scroll_animation_length = 0.3
  -- ============================================================
  -- その他の設定
  -- ============================================================
  vim.g.neovide_remember_window_size = true
  vim.g.neovide_input_use_logo = true
  vim.g.neovide_fullscreen = false
  vim.g.neovide_floating_blur_amount_x = 0.2
  vim.g.neovide_floating_blur_amount_y = 0.2
  vim.g.neovide_window_blurred = true
  vim.g.neovide_show_border = false
  vim.g.neovide_floating_shadow = true
  vim.g.neovide_floating_z_height = 10
  vim.g.neovide_light_angle_degrees = 45
  vim.g.neovide_light_radius = 5
  vim.opt.winblend = 5
  vim.opt.pumblend = 5
  vim.g.neovide_scroll_animation_length = 0.3
  vim.g.neovide_scroll_animation_far_lines = 2
  -- ============================================================
  -- カスタムキーバインド（Neovide専用）
  -- ============================================================
  -- Cmd+V でペースト（macOS）
  vim.keymap.set("n", "<D-v>", '"+p', { desc = "Paste (Neovide)" })
  vim.keymap.set("i", "<D-v>", "<C-r>+", { desc = "Paste in insert mode (Neovide)" })
  -- Cmd+C でコピー（macOS）
  vim.keymap.set("v", "<D-c>", '"+y', { desc = "Copy (Neovide)" })
  -- フルスクリーントグル
  vim.keymap.set("n", "<D-CR>", function()
    vim.g.neovide_fullscreen = not vim.g.neovide_fullscreen
  end, { desc = "Toggle fullscreen (Neovide)" })
end

return {}
