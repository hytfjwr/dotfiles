use serde::Deserialize;
use std::fmt::Write;
use std::io::Read;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Deserialize)]
struct StatusData {
    model: Option<Model>,
    context_window: Option<ContextWindow>,
    cost: Option<Cost>,
    rate_limits: Option<RateLimits>,
}

#[derive(Deserialize)]
struct Model {
    display_name: Option<String>,
}

#[derive(Deserialize)]
struct ContextWindow {
    used_percentage: Option<f64>,
}

#[derive(Deserialize)]
struct Cost {
    total_lines_added: Option<i64>,
    total_lines_removed: Option<i64>,
}

#[derive(Deserialize, serde::Serialize)]
struct RateLimits {
    five_hour: Option<RateLimit>,
    seven_day: Option<RateLimit>,
}

#[derive(Deserialize, serde::Serialize)]
struct RateLimit {
    used_percentage: Option<f64>,
    resets_at: Option<f64>,
}

type Color = (u8, u8, u8);

/// Three-stop gradient: low -> mid -> high
struct Theme {
    low: Color,
    mid: Color,
    high: Color,
    label: Color,
}

const THEME_CTX: Theme = Theme {
    low: (80, 200, 200),
    mid: (60, 160, 230),
    high: (130, 100, 255),
    label: (80, 190, 210),
};

const THEME_5H: Theme = Theme {
    low: (80, 210, 100),
    mid: (240, 200, 60),
    high: (255, 75, 75),
    label: (240, 180, 60),
};

const THEME_7D: Theme = Theme {
    low: (170, 140, 245),
    mid: (210, 100, 200),
    high: (255, 75, 120),
    label: (180, 140, 240),
};

const DIM_BAR: Color = (60, 60, 70);
const DIM_TEXT: Color = (120, 120, 130);

/// Interpolate between two RGB colors based on t (0.0 to 1.0)
fn lerp_color(c1: Color, c2: Color, t: f64) -> Color {
    let t = t.clamp(0.0, 1.0);
    (
        (c1.0 as f64 + (c2.0 as f64 - c1.0 as f64) * t) as u8,
        (c1.1 as f64 + (c2.1 as f64 - c1.1 as f64) * t) as u8,
        (c1.2 as f64 + (c2.2 as f64 - c1.2 as f64) * t) as u8,
    )
}

/// Get color for a percentage along a theme's gradient
fn theme_color(theme: &Theme, pct: f64) -> Color {
    if pct <= 50.0 {
        lerp_color(theme.low, theme.mid, pct / 50.0)
    } else {
        lerp_color(theme.mid, theme.high, (pct - 50.0) / 50.0)
    }
}

/// Format text with TrueColor foreground
fn fg(text: &str, color: Color) -> String {
    format!("\x1b[38;2;{};{};{}m{}\x1b[0m", color.0, color.1, color.2, text)
}

/// Format text as bold
fn bold(text: &str) -> String {
    format!("\x1b[1m{}\x1b[0m", text)
}

/// Build a progress bar with per-character gradient along the theme
fn progress_bar(pct: f64, theme: &Theme) -> String {
    let width = 6usize;
    let filled = ((pct / 100.0) * width as f64).round() as usize;
    let filled = filled.min(width);
    let mut bar = String::with_capacity(width * 32);
    for i in 0..width {
        let (color, ch) = if i < filled {
            let block_pct = (i as f64 / (width - 1) as f64) * pct;
            (theme_color(theme, block_pct), '\u{2588}')
        } else {
            (DIM_BAR, '\u{2591}')
        };
        let _ = write!(bar, "\x1b[38;2;{};{};{}m{}", color.0, color.1, color.2, ch);
    }
    bar.push_str("\x1b[0m");
    bar
}

/// Build a rate limit section (used for both 5h and 7d)
fn build_rate_limit_section(
    label_text: &str,
    theme: &Theme,
    limit: &RateLimit,
    show_remaining: bool,
) -> Option<String> {
    let pct = limit.used_percentage?;
    let color = theme_color(theme, pct);
    let label = fg(label_text, theme.label);
    let bar = progress_bar(pct, theme);
    let pct_str = fg(&format!("{:.0}%", pct), color);
    let mut section = format!("{} {} {}", label, bar, pct_str);
    if show_remaining {
        if let Some(resets_at) = limit.resets_at {
            if let Some(remaining) = format_remaining(resets_at) {
                section.push_str(&format!(" {}", fg(&remaining, DIM_TEXT)));
            }
        }
    }
    Some(section)
}

/// Format remaining time from resets_at epoch
fn format_remaining(resets_at: f64) -> Option<String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_secs_f64();
    let remaining = resets_at - now;
    if remaining <= 0.0 {
        return None;
    }
    let total_secs = remaining as u64;
    let hours = total_secs / 3600;
    let mins = (total_secs % 3600) / 60;
    Some(format!("({}h{}m)", hours, mins))
}

/// Get current git branch by reading .git/HEAD directly, with command fallback
fn git_branch() -> Option<String> {
    // Fast path: read .git/HEAD directly
    if let Ok(head) = std::fs::read_to_string(".git/HEAD") {
        if let Some(branch) = head.strip_prefix("ref: refs/heads/") {
            let branch = branch.trim();
            if !branch.is_empty() {
                return Some(branch.to_string());
            }
        }
    }
    // Fallback for worktrees/submodules where .git may be a file
    let output = Command::new("git")
        .args(["branch", "--show-current"])
        .output()
        .ok()?;
    if output.status.success() {
        let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !branch.is_empty() {
            return Some(branch);
        }
    }
    None
}

/// Write rate_limits to /tmp for WezTerm tabline
fn write_rate_limits(rate_limits: &Option<RateLimits>) {
    if let Some(rl) = rate_limits {
        if let Ok(json) = serde_json::to_string(rl) {
            let _ = std::fs::write("/tmp/claude_rate_limits.json", json);
        }
    }
}

fn main() {
    let mut input = String::new();
    if std::io::stdin().read_to_string(&mut input).is_err() {
        return;
    }

    let data: StatusData = match serde_json::from_str(&input) {
        Ok(d) => d,
        Err(_) => return,
    };

    // Side effect: write rate_limits for WezTerm
    write_rate_limits(&data.rate_limits);

    let mut line1: Vec<String> = Vec::new();
    let mut line2: Vec<String> = Vec::new();

    // Line 1: Model name (bold)
    if let Some(ref model) = data.model {
        if let Some(ref name) = model.display_name {
            line1.push(bold(name));
        }
    }

    // Line 1: Git branch (magenta) + changes (yellow)
    if let Some(branch) = git_branch() {
        let magenta = (200, 100, 220);
        let branch_str = fg(&format!("\u{e0a0} {}", branch), magenta);

        if let Some(ref cost) = data.cost {
            let added = cost.total_lines_added.unwrap_or(0);
            let removed = cost.total_lines_removed.unwrap_or(0);
            if added > 0 || removed > 0 {
                let yellow = (240, 200, 60);
                let changes = fg(&format!("(+{},-{})", added, removed), yellow);
                line1.push(format!("{} {}", branch_str, changes));
            } else {
                line1.push(branch_str);
            }
        } else {
            line1.push(branch_str);
        }
    }

    // Line 2: Context window (cyan theme)
    if let Some(ref ctx) = data.context_window {
        if let Some(pct) = ctx.used_percentage {
            let color = theme_color(&THEME_CTX, pct);
            let label = fg("ctx", THEME_CTX.label);
            let bar = progress_bar(pct, &THEME_CTX);
            let pct_str = fg(&format!("{:.0}%", pct), color);
            line2.push(format!("{} {} {}", label, bar, pct_str));
        }
    }

    // Line 2: Rate limits (5h: warm theme, 7d: purple theme)
    if let Some(ref rl) = data.rate_limits {
        if let Some(ref five) = rl.five_hour {
            if let Some(s) = build_rate_limit_section("5h", &THEME_5H, five, true) {
                line2.push(s);
            }
        }
        if let Some(ref seven) = rl.seven_day {
            if let Some(s) = build_rate_limit_section("7d", &THEME_7D, seven, false) {
                line2.push(s);
            }
        }
    }

    let output = if line2.is_empty() {
        line1.join("  ")
    } else {
        format!("{}\n{}", line1.join("  "), line2.join("  "))
    };
    print!("{}", output);
}
