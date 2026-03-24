use serde::Deserialize;
use std::collections::HashMap;
use std::env;
use std::io::Write;
use std::process::{Command, ExitCode};

// ── WezTerm CLI JSON structures ──────────────────────────────────────

#[derive(Deserialize)]
struct WezPane {
    pane_id: u64,
    tab_id: u64,
    window_id: u64,
    workspace: Option<String>,
    cwd: Option<String>,
    is_active: Option<bool>,
}

// ── Helpers ──────────────────────────────────────────────────────────

const FLAGS_WITH_VALUE: &[&str] = &["-t", "-l", "-F", "-S", "-b", "-n"];

fn strip_pane_prefix(id: &str) -> &str {
    id.strip_prefix('%').unwrap_or(id)
}

fn tmux_pane_id(id: u64) -> String {
    format!("%{}", id)
}

fn wezterm_cli(args: &[&str]) -> Result<String, String> {
    let output = Command::new("wezterm")
        .arg("cli")
        .args(args)
        .output()
        .map_err(|e| format!("failed to run wezterm cli: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("wezterm cli failed: {}", stderr.trim()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn get_pane_list() -> Result<Vec<WezPane>, String> {
    let json = wezterm_cli(&["list", "--format", "json"])?;
    serde_json::from_str(&json).map_err(|e| format!("failed to parse pane list: {}", e))
}

fn get_panes_in_tab(pane_id: u64) -> Result<Vec<WezPane>, String> {
    let panes = get_pane_list()?;
    let tab_id = panes
        .iter()
        .find(|p| p.pane_id == pane_id)
        .map(|p| p.tab_id)
        .ok_or_else(|| format!("pane {} not found", pane_id))?;
    Ok(panes.into_iter().filter(|p| p.tab_id == tab_id).collect())
}

fn current_pane_id() -> Result<u64, String> {
    env::var("WEZTERM_PANE")
        .map_err(|_| "WEZTERM_PANE not set".to_string())?
        .parse::<u64>()
        .map_err(|_| "WEZTERM_PANE is not a valid integer".to_string())
}

fn resolve_target_pane(args: &[String]) -> Result<u64, String> {
    if let Some(target) = get_flag_value(args, "-t") {
        strip_pane_prefix(&target)
            .parse::<u64>()
            .map_err(|_| format!("invalid pane id: {}", target))
    } else {
        current_pane_id()
    }
}

fn get_flag_value(args: &[String], flag: &str) -> Option<String> {
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        if arg == flag {
            return iter.next().cloned();
        }
        if let Some(value) = arg.strip_prefix(flag) {
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn has_flag(args: &[String], flag: &str) -> bool {
    args.iter().any(|a| a == flag)
}

fn get_trailing_command(args: &[String]) -> Vec<String> {
    let mut result = Vec::new();
    let mut skip_next = false;
    for arg in args {
        if skip_next {
            skip_next = false;
            continue;
        }
        if FLAGS_WITH_VALUE.contains(&arg.as_str()) {
            skip_next = true;
            continue;
        }
        if arg.starts_with('-') {
            continue;
        }
        result.push(arg.clone());
    }
    result
}

fn append_trailing<'a>(wez_args: &mut Vec<&'a str>, trailing: &'a [String]) {
    if !trailing.is_empty() {
        wez_args.push("--");
        for t in trailing {
            wez_args.push(t);
        }
    }
}

/// Print pane id in tmux format if -P flag is present.
fn print_pane_id_if_requested(args: &[String], new_pane: &str) {
    if has_flag(args, "-P") {
        let id = new_pane.trim();
        if has_flag(args, "-F") {
            println!("%{}", id);
        } else {
            println!("{}", id);
        }
    }
}

/// Decode percent-encoded URL components (e.g. `%20` -> ` `).
fn percent_decode(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let hi = chars.next();
            let lo = chars.next();
            if let (Some(h), Some(l)) = (hi, lo) {
                let hex = [h, l];
                if let Ok(s) = std::str::from_utf8(&hex) {
                    if let Ok(decoded) = u8::from_str_radix(s, 16) {
                        result.push(decoded as char);
                        continue;
                    }
                }
                // Malformed: emit as-is
                result.push('%');
                result.push(h as char);
                result.push(l as char);
            }
        } else {
            result.push(b as char);
        }
    }
    result
}

// ── Subcommand handlers ─────────────────────────────────────────────

fn cmd_split_window(args: &[String]) -> Result<(), String> {
    let pane_id = resolve_target_pane(args)?;
    let pane_str = pane_id.to_string();
    let mut wez_args = vec!["split-pane", "--pane-id", &pane_str];

    // tmux -h = side by side, tmux -v (default) = top/bottom
    if has_flag(args, "-h") {
        wez_args.push("--right");
    } else {
        wez_args.push("--bottom");
    }

    let size_str;
    if let Some(size) = get_flag_value(args, "-l") {
        if let Some(pct) = size.strip_suffix('%') {
            size_str = format!("{}%", pct);
            wez_args.push("--percent");
            wez_args.push(&size_str);
        } else if let Ok(cells) = size.parse::<u32>() {
            size_str = cells.to_string();
            wez_args.push("--cells");
            wez_args.push(&size_str);
        }
    }

    let trailing = get_trailing_command(args);
    append_trailing(&mut wez_args, &trailing);

    let new_pane = wezterm_cli(&wez_args)?;
    print_pane_id_if_requested(args, &new_pane);
    Ok(())
}

fn cmd_new_window(args: &[String]) -> Result<(), String> {
    let name = get_flag_value(args, "-n").unwrap_or_default();

    let trailing = get_trailing_command(args);
    let mut wez_args: Vec<&str> = vec!["spawn"];
    append_trailing(&mut wez_args, &trailing);

    let new_pane = wezterm_cli(&wez_args)?;

    if !name.is_empty() {
        if let Ok(pane_id) = new_pane.trim().parse::<u64>() {
            let _ = wezterm_cli(&[
                "set-tab-title",
                &name,
                "--pane-id",
                &pane_id.to_string(),
            ]);
        }
    }

    print_pane_id_if_requested(args, &new_pane);
    Ok(())
}

fn cmd_list_panes(args: &[String]) -> Result<(), String> {
    let pane_id = resolve_target_pane(args)?;
    let panes = get_panes_in_tab(pane_id)?;

    for pane in &panes {
        let active = if pane.is_active.unwrap_or(false) {
            "(active)"
        } else {
            ""
        };
        println!("%{}: {}", pane.pane_id, active);
    }

    Ok(())
}

fn cmd_send_keys(args: &[String]) -> Result<(), String> {
    let pane_id = resolve_target_pane(args)?;
    let keys = get_trailing_command(args);
    if keys.is_empty() {
        return Ok(());
    }

    let mut text = String::new();
    for key in &keys {
        match key.as_str() {
            "Enter" | "C-m" => text.push('\n'),
            "Space" => text.push(' '),
            "Tab" | "C-i" => text.push('\t'),
            "Escape" | "C-[" => text.push('\x1b'),
            "BSpace" | "C-h" => text.push('\x08'),
            s if s.starts_with("C-") => {
                if let Some(ch) = s.chars().nth(2) {
                    let ctrl = (ch as u8).wrapping_sub(b'a').wrapping_add(1);
                    text.push(ctrl as char);
                }
            }
            other => text.push_str(other),
        }
    }

    let pane_str = pane_id.to_string();
    let mut child = Command::new("wezterm")
        .args(["cli", "send-text", "--pane-id", &pane_str, "--no-paste"])
        .stdin(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to spawn wezterm cli: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(text.as_bytes())
            .map_err(|e| format!("failed to write to wezterm cli stdin: {}", e))?;
    }

    let status = child
        .wait()
        .map_err(|e| format!("failed to wait for wezterm cli: {}", e))?;
    if !status.success() {
        return Err(format!("wezterm cli send-text exited with {}", status));
    }

    Ok(())
}

fn cmd_display_message(args: &[String]) -> Result<(), String> {
    let pane_id = resolve_target_pane(args)?;
    // tmux: -p prints to stdout, format string is a positional arg
    let format_str = get_flag_value(args, "-p")
        .or_else(|| {
            if has_flag(args, "-p") {
                get_trailing_command(args).into_iter().next()
            } else {
                None
            }
        })
        .unwrap_or_default();

    let panes = get_pane_list()?;
    let pane = panes
        .iter()
        .find(|p| p.pane_id == pane_id)
        .ok_or_else(|| format!("pane {} not found", pane_id))?;

    let mut result = format_str;
    result = result.replace("#{pane_id}", &tmux_pane_id(pane.pane_id));
    result = result.replace("#{window_id}", &format!("@{}", pane.window_id));
    result = result.replace(
        "#{session_name}",
        pane.workspace.as_deref().unwrap_or("default"),
    );
    result = result.replace(
        "#{pane_current_path}",
        &pane
            .cwd
            .as_deref()
            .and_then(|c| c.strip_prefix("file://"))
            .and_then(|c| c.find('/').map(|i| &c[i..]))
            .map(|p| percent_decode(p))
            .unwrap_or_default(),
    );

    if result.contains("#{window_index}") {
        let mut tab_ids: Vec<u64> = panes
            .iter()
            .filter(|p| p.window_id == pane.window_id)
            .map(|p| p.tab_id)
            .collect();
        tab_ids.sort();
        tab_ids.dedup();
        let window_index = tab_ids
            .iter()
            .position(|&t| t == pane.tab_id)
            .unwrap_or(0);
        result = result.replace("#{window_index}", &window_index.to_string());
    }

    println!("{}", result);
    Ok(())
}

fn cmd_capture_pane(args: &[String]) -> Result<(), String> {
    let pane_id = resolve_target_pane(args)?;
    let pane_str = pane_id.to_string();
    let mut wez_args = vec!["get-text", "--pane-id", &pane_str];

    let start_line;
    if let Some(s) = get_flag_value(args, "-S") {
        start_line = s;
        wez_args.push("--start-line");
        wez_args.push(&start_line);
    }

    let text = wezterm_cli(&wez_args)?;
    println!("{}", text);
    Ok(())
}

fn cmd_kill_pane(args: &[String]) -> Result<(), String> {
    let pane_id = resolve_target_pane(args)?;
    wezterm_cli(&["kill-pane", "--pane-id", &pane_id.to_string()])?;
    Ok(())
}

fn cmd_kill_session(args: &[String]) -> Result<(), String> {
    // WezTerm has no sessions — kill all panes in the same tab.
    // After the first kill, remaining panes may already be gone, so ignore errors.
    let pane_id = resolve_target_pane(args)?;
    let panes = get_panes_in_tab(pane_id)?;
    for pane in panes.iter().rev() {
        if wezterm_cli(&["kill-pane", "--pane-id", &pane.pane_id.to_string()]).is_err() {
            break;
        }
    }
    Ok(())
}

fn cmd_select_pane(args: &[String]) -> Result<(), String> {
    let pane_id = resolve_target_pane(args)?;
    wezterm_cli(&["activate-pane", "--pane-id", &pane_id.to_string()])?;
    Ok(())
}

fn cmd_list_sessions() -> Result<(), String> {
    let panes = get_pane_list()?;
    let mut ws_tabs: HashMap<&str, std::collections::HashSet<u64>> = HashMap::new();
    for pane in &panes {
        let ws = pane.workspace.as_deref().unwrap_or("default");
        ws_tabs.entry(ws).or_default().insert(pane.tab_id);
    }
    let mut workspaces: Vec<_> = ws_tabs.into_iter().collect();
    workspaces.sort_by_key(|(name, _)| name.to_string());
    for (ws, tabs) in &workspaces {
        println!("{}: {} windows", ws, tabs.len());
    }
    Ok(())
}

fn cmd_has_session(_args: &[String]) -> Result<(), String> {
    Ok(())
}

// ── Passthrough to real tmux ─────────────────────────────────────────

fn passthrough_to_real_tmux() -> ExitCode {
    let tmux_paths = [
        "/opt/homebrew/bin/tmux",
        "/usr/local/bin/tmux",
        "/usr/bin/tmux",
    ];

    let Some(tmux_path) = tmux_paths.iter().find(|p| std::path::Path::new(p).exists()) else {
        eprintln!("wezterm-tmux-shim: real tmux not found");
        return ExitCode::from(127);
    };

    let args: Vec<String> = env::args().skip(1).collect();
    let status = Command::new(tmux_path)
        .args(&args)
        .status()
        .unwrap_or_else(|_| std::process::exit(127));

    ExitCode::from(status.code().unwrap_or(1) as u8)
}

// ── Main ─────────────────────────────────────────────────────────────

fn main() -> ExitCode {
    if env::var("WEZTERM_PANE").is_err() {
        return passthrough_to_real_tmux();
    }

    let args: Vec<String> = env::args().skip(1).collect();

    if args.is_empty() {
        return ExitCode::SUCCESS;
    }

    if args.iter().any(|a| a == "-V") {
        println!("tmux 3.5a");
        return ExitCode::SUCCESS;
    }

    let sub_args = &args[1..];

    let result = match args[0].as_str() {
        "split-window" => cmd_split_window(sub_args),
        "new-window" | "new-session" => cmd_new_window(sub_args),
        "list-panes" => cmd_list_panes(sub_args),
        "list-sessions" | "ls" => cmd_list_sessions(),
        "send-keys" => cmd_send_keys(sub_args),
        "display-message" => cmd_display_message(sub_args),
        "capture-pane" => cmd_capture_pane(sub_args),
        "kill-pane" => cmd_kill_pane(sub_args),
        "kill-session" => cmd_kill_session(sub_args),
        "select-pane" => cmd_select_pane(sub_args),
        "has-session" => cmd_has_session(sub_args),
        // No-ops: WezTerm handles these automatically or they don't apply
        "select-layout" | "show-options" | "switch-client" | "resize-pane" | "set-option"
        | "set-window-option" | "bind-key" | "unbind-key" => Ok(()),
        other => {
            eprintln!(
                "wezterm-tmux-shim: unsupported command '{}', ignoring",
                other
            );
            Ok(())
        }
    };

    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("wezterm-tmux-shim: {}", e);
            ExitCode::from(1)
        }
    }
}
