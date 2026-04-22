use serde::Deserialize;
use std::collections::HashMap;
use std::env;
use std::io::Write;
use std::process::{Command, ExitCode};

// ── WezTerm CLI JSON structures ──────────────────────────────────────

#[derive(Deserialize)]
#[allow(dead_code)]
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

fn parse_target_pane(target: &str) -> Result<u64, String> {
    // Handle various tmux target formats:
    //   %N          → direct pane id
    //   N           → direct pane id
    //   session:window.pane → extract pane part after last dot
    //   session:window      → not a pane ref, fall back to current pane
    if target.starts_with('%') {
        return strip_pane_prefix(target)
            .parse::<u64>()
            .map_err(|_| format!("invalid pane id: {}", target));
    }
    if let Ok(id) = target.parse::<u64>() {
        return Ok(id);
    }
    // session:window.pane format
    if let Some(dot_pos) = target.rfind('.') {
        let pane_part = &target[dot_pos + 1..];
        return strip_pane_prefix(pane_part)
            .parse::<u64>()
            .map_err(|_| format!("invalid pane id: {}", target));
    }
    // session:window or session name — fall back to current pane
    current_pane_id()
}

fn resolve_target_pane(args: &[String]) -> Result<u64, String> {
    if let Some(target) = get_flag_value(args, "-t") {
        parse_target_pane(&target)
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
/// Always uses %N format (like tmux) regardless of -F value.
fn print_pane_id_if_requested(args: &[String], new_pane: &str) {
    if has_flag(args, "-P") {
        println!("%{}", new_pane.trim());
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
            size_str = pct.to_string();
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
    // Create a split pane as the "swarm-view" container.
    // Claude Code will either use this pane directly (1 agent) or split it
    // further (multiple agents). list-panes excludes WEZTERM_PANE so the
    // main pane is never used as an agent pane.
    let pane_id = current_pane_id()?;
    let pane_str = pane_id.to_string();
    let name = get_flag_value(args, "-n").unwrap_or_default();

    let trailing = get_trailing_command(args);
    let mut wez_args: Vec<&str> = vec!["split-pane", "--pane-id", &pane_str, "--bottom"];
    append_trailing(&mut wez_args, &trailing);

    let new_pane = wezterm_cli(&wez_args)?;

    if !name.is_empty() {
        if let Ok(id) = new_pane.trim().parse::<u64>() {
            let _ = wezterm_cli(&[
                "set-tab-title",
                &name,
                "--pane-id",
                &id.to_string(),
            ]);
        }
    }

    print_pane_id_if_requested(args, &new_pane);
    Ok(())
}

fn cmd_list_panes(args: &[String]) -> Result<(), String> {
    let target_str = get_flag_value(args, "-t");
    let pane_id = resolve_target_pane(args)?;
    let panes = get_panes_in_tab(pane_id)?;
    let format_str = get_flag_value(args, "-F");

    // When target is a session:window reference (e.g. "claude-swarm:swarm-view"),
    // exclude the main pane (WEZTERM_PANE) so Claude Code only sees agent panes.
    let exclude_main = target_str
        .as_deref()
        .map_or(false, |t| t.contains(':') && !t.starts_with('%'));
    let main_pane = if exclude_main {
        current_pane_id().ok()
    } else {
        None
    };

    for pane in &panes {
        if main_pane.map_or(false, |mp| pane.pane_id == mp) {
            continue;
        }
        if let Some(ref fmt) = format_str {
            let line = fmt.replace("#{pane_id}", &tmux_pane_id(pane.pane_id));
            println!("{}", line);
        } else {
            println!("%{}", pane.pane_id);
        }
    }

    Ok(())
}

fn cmd_send_keys(args: &[String]) -> Result<(), String> {
    let pane_id = resolve_target_pane(args)?;
    let mut keys: Vec<String> = Vec::new();

    // Collect non-flag args as keys: -t is handled by resolve_target_pane, -l is boolean
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "-t" => { let _ = iter.next(); }
            "-l" => {}
            other => keys.push(other.to_string()),
        }
    }

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

    // Collect format string from -F value or positional arg (-p and -t are handled elsewhere)
    let mut format_str = String::new();
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "-p" => {}
            "-t" => { let _ = iter.next(); }
            "-F" => {
                if let Some(v) = iter.next() {
                    format_str = v.clone();
                }
            }
            other => {
                if format_str.is_empty() {
                    format_str = other.to_string();
                }
            }
        }
    }

    if format_str.is_empty() {
        return Ok(());
    }

    let panes = get_pane_list()?;
    let pane = panes
        .iter()
        .find(|p| p.pane_id == pane_id)
        .ok_or_else(|| format!("pane {} not found", pane_id))?;

    let mut result = format_str;
    result = result.replace("#{pane_id}", &tmux_pane_id(pane.pane_id));
    // tmux window ≒ WezTerm tab
    result = result.replace("#{window_id}", &format!("@{}", pane.tab_id));
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

    result = result.replace("#{window_index}", &pane.tab_id.to_string());

    println!("{}", result);
    Ok(())
}

fn cmd_capture_pane(args: &[String]) -> Result<(), String> {
    let pane_id = resolve_target_pane(args)?;
    let print_mode = has_flag(args, "-p");
    let pane_str = pane_id.to_string();
    let mut wez_args = vec!["get-text", "--pane-id", &pane_str];

    let start_line;
    if let Some(s) = get_flag_value(args, "-S") {
        start_line = s;
        wez_args.push("--start-line");
        wez_args.push(&start_line);
    }

    if print_mode {
        let text = wezterm_cli(&wez_args)?;
        println!("{}", text);
    }
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

fn cmd_show(args: &[String]) -> Result<(), String> {
    // image.nvim etc. run: tmux show -Apv allow-passthrough
    // WezTerm has no tmux layer so passthrough is effectively always enabled.
    let value_only = has_flag(args, "-v");
    let positional: Vec<&str> = args
        .iter()
        .filter(|a| !a.starts_with('-'))
        .map(|a| a.as_str())
        .collect();

    if positional.iter().any(|a| *a == "allow-passthrough") {
        if value_only {
            println!("on");
        } else {
            println!("allow-passthrough on");
        }
    }
    Ok(())
}

fn cmd_select_pane(args: &[String]) -> Result<(), String> {
    // -P (style) and -T (title) take values that we ignore but must consume
    let pane_id = resolve_target_pane(args)?;
    wezterm_cli(&["activate-pane", "--pane-id", &pane_id.to_string()])?;
    Ok(())
}

fn cmd_list_windows(args: &[String]) -> Result<(), String> {
    // Return tab names for the current window, formatted per -F if given
    let pane_id = current_pane_id()?;
    let panes = get_pane_list()?;
    let current_window_id = panes
        .iter()
        .find(|p| p.pane_id == pane_id)
        .map(|p| p.window_id);

    let format_str = get_flag_value(args, "-F").unwrap_or_default();

    // Collect unique tabs in this window
    let mut seen_tabs = std::collections::HashSet::new();
    for pane in &panes {
        if current_window_id.map_or(true, |wid| pane.window_id == wid)
            && seen_tabs.insert(pane.tab_id)
        {
            if format_str.contains("#{window_name}") {
                // WezTerm tabs don't have persistent names; use tab_id
                let line = format_str.replace("#{window_name}", &format!("tab-{}", pane.tab_id));
                println!("{}", line);
            } else {
                println!("tab-{}", pane.tab_id);
            }
        }
    }
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
    workspaces.sort_by_key(|(name, _)| *name);
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

fn log_debug(msg: &str) {
    if let Ok(path) = env::var("WEZTERM_TMUX_SHIM_LOG") {
        use std::fs::OpenOptions;
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(f, "{}", msg);
        }
    }
}

fn main() -> ExitCode {
    if env::var("WEZTERM_PANE").is_err() {
        return passthrough_to_real_tmux();
    }

    let all_args: Vec<String> = env::args().skip(1).collect();
    log_debug(&format!("called: tmux {}", all_args.join(" ")));

    if all_args.is_empty() {
        return ExitCode::SUCCESS;
    }

    if all_args.iter().any(|a| a == "-V") {
        println!("tmux 3.5a");
        return ExitCode::SUCCESS;
    }

    // Skip pre-subcommand flags: -L <socket>, -S <socket-path>, -f <config>
    let mut i = 0;
    while i < all_args.len() {
        match all_args[i].as_str() {
            "-L" | "-S" | "-f" => {
                i += 2; // skip flag and its value
            }
            _ => break,
        }
    }

    let args = &all_args[i..];
    if args.is_empty() {
        return ExitCode::SUCCESS;
    }

    let sub_args = &args[1..];

    let result = match args[0].as_str() {
        "split-window" => {
            let r = cmd_split_window(sub_args);
            log_debug(&format!("split-window result: {:?}", r.as_ref().map(|_| "ok")));
            r
        }
        "new-window" | "new-session" => cmd_new_window(sub_args),
        "list-panes" => cmd_list_panes(sub_args),
        "list-windows" => cmd_list_windows(sub_args),
        "list-sessions" | "ls" => cmd_list_sessions(),
        "send-keys" => cmd_send_keys(sub_args),
        "display-message" => cmd_display_message(sub_args),
        "capture-pane" => cmd_capture_pane(sub_args),
        "kill-pane" => cmd_kill_pane(sub_args),
        "kill-session" => cmd_kill_session(sub_args),
        "select-pane" => cmd_select_pane(sub_args),
        "has-session" => cmd_has_session(sub_args),
        "show" => cmd_show(sub_args),
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
