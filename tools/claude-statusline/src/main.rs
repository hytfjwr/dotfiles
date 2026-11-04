mod input;
mod render;
mod usage;

use input::{RateLimit, StatusData};
use render::{
    fg, fg_bold, frame_now, icon, Color, Gauge, Theme, DIM_BAR, THEME_5H, THEME_7D, THEME_CTX,
    THEME_SCOPED,
};
use std::io::Read;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const BRANCH_COLOR: Color = (200, 100, 220);
const CHANGES_COLOR: Color = (240, 200, 60);
const COST_COLOR: Color = (140, 205, 155);
const FAST_COLOR: Color = (255, 175, 70);
const THINKING_COLOR: Color = (245, 215, 120);

/// Format remaining time from a `resets_at` epoch. Zero-padded so the width
/// stays stable while the animation redraws the line.
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
    if total_secs >= 86_400 {
        let days = total_secs / 86_400;
        let hours = (total_secs % 86_400) / 3600;
        Some(format!("{}d{:02}h", days, hours))
    } else {
        let hours = total_secs / 3600;
        let mins = (total_secs % 3600) / 60;
        Some(format!("{}h{:02}m", hours, mins))
    }
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

/// Tint the model name by family so the active model reads at a glance
fn model_color(id: Option<&str>) -> Color {
    let id = id.unwrap_or_default().to_ascii_lowercase();
    if id.contains("opus") {
        (205, 165, 255)
    } else if id.contains("sonnet") {
        (110, 185, 255)
    } else if id.contains("fable") {
        (255, 195, 105)
    } else if id.contains("haiku") {
        (120, 225, 165)
    } else {
        (225, 225, 235)
    }
}

/// Cool for cheap effort, hot for expensive
fn effort_color(level: &str) -> Color {
    match level {
        "low" => (120, 185, 255),
        "medium" => (120, 220, 180),
        "high" => (240, 200, 60),
        "xhigh" => (255, 145, 60),
        "max" => (255, 85, 125),
        _ => (180, 180, 190),
    }
}

/// `󰚩 Opus 5` — bold, tinted by model family
fn model_segment(data: &StatusData) -> Option<String> {
    let model = data.model.as_ref()?;
    let name = model.display_name.as_deref()?;
    let color = model_color(model.id.as_deref());
    Some(format!(
        "{} {}",
        fg(icon::MODEL, color),
        fg_bold(name, color)
    ))
}

/// Session modes: fast mode, effort level, extended thinking
fn mode_segment(data: &StatusData) -> Option<String> {
    let mut badges: Vec<String> = Vec::new();

    if data.fast_mode == Some(true) {
        badges.push(fg(icon::FAST, FAST_COLOR));
    }
    if let Some(level) = data.effort.as_ref().and_then(|e| e.level.as_deref()) {
        let color = effort_color(level);
        badges.push(format!("{} {}", fg(icon::EFFORT, color), fg(level, color)));
    }
    if let Some(ref thinking) = data.thinking {
        // Thinking is on by default, so the badge dims rather than disappears.
        let color = if thinking.enabled == Some(false) {
            DIM_BAR
        } else {
            THINKING_COLOR
        };
        badges.push(fg(icon::THINKING, color));
    }

    if badges.is_empty() {
        None
    } else {
        Some(badges.join(" "))
    }
}

///  branch (+added,-removed)
fn git_segment(data: &StatusData) -> Option<String> {
    let branch = git_branch()?;
    let branch_str = fg(&format!("{} {}", icon::BRANCH, branch), BRANCH_COLOR);

    let (added, removed) = match data.cost {
        Some(ref cost) => (
            cost.total_lines_added.unwrap_or(0),
            cost.total_lines_removed.unwrap_or(0),
        ),
        None => (0, 0),
    };
    if added > 0 || removed > 0 {
        let changes = fg(&format!("(+{},-{})", added, removed), CHANGES_COLOR);
        Some(format!("{} {}", branch_str, changes))
    } else {
        Some(branch_str)
    }
}

/// Session spend so far
fn cost_segment(data: &StatusData) -> Option<String> {
    let usd = data.cost.as_ref()?.total_cost_usd?;
    if usd <= 0.0 {
        return None;
    }
    Some(fg(&format!("${:.2}", usd), COST_COLOR))
}

fn rate_limit_gauge<'a>(
    label: &'a str,
    theme: &'a Theme,
    limit: &RateLimit,
    phase: u64,
    stale: bool,
    frame: u64,
) -> Option<String> {
    let gauge = Gauge {
        icon: label,
        name: None,
        pct: limit.used_percentage?,
        theme,
        remaining: limit.resets_at.and_then(format_remaining),
        phase,
        stale,
    };
    Some(gauge.render(frame))
}

fn main() {
    // Detached refresh of the usage snapshot and the exports; no stdin, no output.
    if std::env::args().nth(1).as_deref() == Some("--refresh-usage") {
        usage::refresh();
        return;
    }

    let mut input = String::new();
    if std::io::stdin().read_to_string(&mut input).is_err() {
        return;
    }

    let data: StatusData = match serde_json::from_str(&input) {
        Ok(d) => d,
        Err(_) => return,
    };

    // Read once: an aged-out snapshot spawns a background refresh as a side
    // effect, which is also what keeps the exports up to date.
    let usage = usage::read();

    let frame = frame_now();
    let mut line1: Vec<String> = Vec::new();
    let mut line2: Vec<String> = Vec::new();

    line1.extend(model_segment(&data));
    line1.extend(mode_segment(&data));
    line1.extend(git_segment(&data));
    line1.extend(cost_segment(&data));

    // Context window
    if let Some(pct) = data
        .context_window
        .as_ref()
        .and_then(|ctx| ctx.used_percentage)
    {
        let gauge = Gauge {
            icon: icon::CTX,
            name: None,
            pct,
            theme: &THEME_CTX,
            remaining: None,
            phase: 0,
            stale: false,
        };
        line2.push(gauge.render(frame));
    }

    // Plan rate limits, from the usage snapshot so every session shows the same
    // value. The payload's copy is as old as this session's last API call, so it
    // is only the fallback for when there is no snapshot.
    let (plan, plan_stale) = match usage {
        Some(ref usage) => (Some(&usage.plan), usage.stale),
        None => (data.rate_limits.as_ref(), false),
    };
    if let Some(rl) = plan {
        if let Some(ref five) = rl.five_hour {
            line2.extend(rate_limit_gauge(
                icon::FIVE_HOUR,
                &THEME_5H,
                five,
                1,
                plan_stale,
                frame,
            ));
        }
        if let Some(ref seven) = rl.seven_day {
            line2.extend(rate_limit_gauge(
                icon::SEVEN_DAY,
                &THEME_7D,
                seven,
                2,
                plan_stale,
                frame,
            ));
        }
    }

    // Per-model weekly windows (Fable), from the usage snapshot
    if let Some(ref usage) = usage {
        for limit in &usage.scoped {
            let gauge = Gauge {
                icon: icon::SCOPED,
                // One bucket is unambiguous; name the others.
                name: (usage.scoped.len() > 1).then_some(limit.display_name.as_str()),
                pct: limit.pct,
                theme: &THEME_SCOPED,
                remaining: limit.resets_at.and_then(format_remaining),
                phase: 3,
                stale: usage.stale,
            };
            line2.push(gauge.render(frame));
        }
    }

    let output = if line2.is_empty() {
        line1.join("  ")
    } else {
        format!("{}\n{}", line1.join("  "), line2.join("  "))
    };
    print!("{}", output);
}
