//! Account-wide usage windows: the plan's 5h / 7d, and per-model weekly (Fable).
//!
//! The status line payload only carries `five_hour`, `seven_day` and
//! `spend_limit`, so the model-scoped windows have to come from the claude.ai
//! usage endpoint. The payload's plan windows are no better: they are as old as
//! that session's last API call, so an idle session keeps reporting whatever it
//! saw hours ago. One endpoint answer is the same for every session, so it is
//! the only source for the plan windows too.
//!
//! Claude Code caches its own answer in `~/.claude.json`, but only re-polls when
//! something opens `/usage`, so that snapshot is usually hours old. We therefore
//! keep our own snapshot and refresh it in a detached child process — rendering
//! only ever reads files. That child is also the only writer of the exports.

use crate::input::{self, RateLimit, RateLimits};
use chrono::DateTime;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const KEYCHAIN_SERVICE: &str = "Claude Code-credentials";

/// Our snapshot, refreshed by `--refresh-usage`.
const SNAPSHOT_FILE: &str = ".claude/statusline-usage.json";
/// Marker touched before every refresh attempt, so a failing refresh backs off
/// instead of firing once per rendered frame.
const ATTEMPT_FILE: &str = ".claude/statusline-usage.attempt";
/// Claude Code's own snapshot, used when it happens to be newer than ours.
const CLAUDE_CONFIG_FILE: &str = ".claude.json";

const MINUTE_MS: f64 = 60.0 * 1000.0;
/// Age at which a refresh is kicked off, and the floor between two attempts.
/// The marker makes this a floor across every session, not per session.
const REFRESH_AFTER_MS: f64 = MINUTE_MS;
/// Age at which the gauge is dimmed and marked — three missed refreshes.
const STALE_AFTER_MS: f64 = 3.0 * MINUTE_MS;
/// Age at which the snapshot says nothing useful, so the gauge is dropped.
const DISCARD_AFTER_MS: f64 = 24.0 * 60.0 * MINUTE_MS;

/// `~/.claude.json`
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeConfig {
    cached_usage_utilization: Option<Snapshot>,
}

/// Our snapshot file, and the value nested in Claude Code's config
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    fetched_at_ms: Option<f64>,
    utilization: Option<Utilization>,
}

#[derive(Deserialize)]
struct Utilization {
    limits: Option<Vec<LimitEntry>>,
}

#[derive(Deserialize)]
struct LimitEntry {
    kind: Option<String>,
    percent: Option<f64>,
    resets_at: Option<String>,
    scope: Option<Scope>,
}

#[derive(Deserialize)]
struct Scope {
    model: Option<ScopeModel>,
}

#[derive(Deserialize)]
struct ScopeModel {
    display_name: Option<String>,
}

/// The claude.ai OAuth credentials, from the keychain or the fallback file
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Credentials {
    claude_ai_oauth: Option<OauthCredentials>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OauthCredentials {
    access_token: Option<String>,
    expires_at: Option<f64>,
}

/// A weekly window scoped to one model bucket, as labelled by the server.
pub struct ScopedLimit {
    pub display_name: String,
    pub pct: f64,
    pub resets_at: Option<f64>,
}

/// Every window one usage snapshot holds.
pub struct Usage {
    /// The plan windows, in the status line payload's shape. A window the
    /// answer lacks is `None`.
    pub plan: RateLimits,
    pub scoped: Vec<ScopedLimit>,
    /// Older than three missed refreshes: the gauges are dimmed and marked.
    pub stale: bool,
}

impl Usage {
    /// Read an endpoint answer. `None` when it carries no `limits` at all.
    pub fn from_response(body: &serde_json::Value) -> Option<Usage> {
        let utilization = Utilization::deserialize(body).ok()?;
        Usage::from_utilization(utilization, false)
    }

    fn from_utilization(utilization: Utilization, stale: bool) -> Option<Usage> {
        let limits = utilization.limits?;
        let plan = RateLimits {
            five_hour: plan_window(&limits, "session"),
            seven_day: plan_window(&limits, "weekly_all"),
        };
        let scoped = limits
            .into_iter()
            .filter(|entry| entry.kind.as_deref() == Some("weekly_scoped"))
            .filter_map(|entry| {
                let display_name = entry.scope?.model?.display_name?;
                Some(ScopedLimit {
                    display_name,
                    pct: entry.percent?,
                    resets_at: entry.resets_at.as_deref().and_then(iso8601_to_epoch),
                })
            })
            .collect();
        Some(Usage {
            plan,
            scoped,
            stale,
        })
    }
}

/// The plan window of one `kind`. A window nobody has opened since its last
/// reset still has a percentage (0) but no reset time yet.
fn plan_window(limits: &[LimitEntry], kind: &str) -> Option<RateLimit> {
    let entry = limits
        .iter()
        .find(|entry| entry.kind.as_deref() == Some(kind))?;
    Some(RateLimit {
        used_percentage: Some(entry.percent?),
        resets_at: entry.resets_at.as_deref().and_then(iso8601_to_epoch),
    })
}

/// Read the usage snapshot, kicking off a background refresh when it has aged
/// out. `None` when no snapshot under a day old has any `limits`.
pub fn read() -> Option<Usage> {
    let home = home_dir()?;

    let (age_ms, utilization) = best_snapshot(&home);
    if age_ms > REFRESH_AFTER_MS {
        spawn_refresh(&home);
    }
    if age_ms > DISCARD_AFTER_MS {
        return None;
    }
    Usage::from_utilization(utilization?, age_ms > STALE_AFTER_MS)
}

/// Fetch the usage snapshot, store it, and write the exports from it. Runs in
/// the detached child, so it reports failure by leaving the previous files in
/// place.
pub fn refresh() {
    let Some(home) = home_dir() else { return };
    let Some(token) = access_token(&home) else {
        return;
    };

    let Ok(output) = Command::new("curl")
        .args(["-sS", "-m", "5", "-H", "Content-Type: application/json"])
        .arg("-H")
        .arg(format!("Authorization: Bearer {}", token))
        .arg(USAGE_URL)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
    else {
        return;
    };
    if !output.status.success() {
        return;
    }
    let Ok(body) = serde_json::from_slice::<serde_json::Value>(&output.stdout) else {
        return;
    };
    // An in-band error body parses fine but carries none of the windows.
    if body.get("limits").is_none() && body.get("five_hour").is_none() {
        return;
    }
    let usage = Usage::from_response(&body);

    let fetched_at_ms = now_ms();
    let snapshot = serde_json::json!({ "fetchedAtMs": fetched_at_ms, "utilization": body });
    let Ok(json) = serde_json::to_string(&snapshot) else {
        return;
    };
    if !write_atomic(&home.join(SNAPSHOT_FILE), json.as_bytes()) {
        return;
    }

    // Exported from here only, so every reader sees this one answer instead of
    // whichever session rendered last.
    if let Some(usage) = usage {
        input::write_rate_limits(&usage.plan);
        input::write_rate_limits_file(&usage, fetched_at_ms);
    }
}

/// Write-then-rename so a reader never sees a half-written file. The temp name
/// carries our pid: two sessions can both spawn a refresh in the same instant.
pub fn write_atomic(path: &Path, contents: &[u8]) -> bool {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(format!(".{}.tmp", std::process::id()));
    let tmp = PathBuf::from(tmp);
    if std::fs::write(&tmp, contents).is_ok() && std::fs::rename(&tmp, path).is_ok() {
        return true;
    }
    let _ = std::fs::remove_file(&tmp);
    false
}

/// Age and content of whichever snapshot is newer: ours, or Claude Code's.
fn best_snapshot(home: &Path) -> (f64, Option<Utilization>) {
    let ours = read_snapshot(&home.join(SNAPSHOT_FILE));
    // Ours is refreshed every minute, so skip the 800 KB config parse unless
    // ours has actually aged out.
    if let Some((age_ms, utilization)) = ours {
        if age_ms <= STALE_AFTER_MS {
            return (age_ms, utilization);
        }
        let theirs = read_claude_config(home);
        return match theirs {
            Some((their_age, their_util)) if their_age < age_ms => (their_age, their_util),
            _ => (age_ms, utilization),
        };
    }
    read_claude_config(home).unwrap_or((f64::INFINITY, None))
}

fn read_snapshot(path: &Path) -> Option<(f64, Option<Utilization>)> {
    let raw = std::fs::read_to_string(path).ok()?;
    let snapshot: Snapshot = serde_json::from_str(&raw).ok()?;
    Some((age_ms(snapshot.fetched_at_ms?), snapshot.utilization))
}

fn read_claude_config(home: &Path) -> Option<(f64, Option<Utilization>)> {
    let raw = std::fs::read_to_string(home.join(CLAUDE_CONFIG_FILE)).ok()?;
    let config: ClaudeConfig = serde_json::from_str(&raw).ok()?;
    let cached = config.cached_usage_utilization?;
    Some((age_ms(cached.fetched_at_ms?), cached.utilization))
}

/// Re-exec ourselves detached to do the network call. The attempt marker is
/// touched first so a refresh that fails still backs off for a full cycle.
fn spawn_refresh(home: &Path) {
    let attempt = home.join(ATTEMPT_FILE);
    if file_age_ms(&attempt).is_some_and(|age| age < REFRESH_AFTER_MS) {
        return;
    }
    if std::fs::write(&attempt, b"").is_err() {
        return;
    }
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let _ = Command::new(exe)
        .arg("--refresh-usage")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}

/// The claude.ai access token. Keychain first — the plain file is a leftover
/// from older versions and is often expired.
fn access_token(home: &Path) -> Option<String> {
    keychain_credentials()
        .or_else(|| file_credentials(home))
        .and_then(|creds| {
            let oauth = creds.claude_ai_oauth?;
            // A stale token would only earn a 401; let Claude Code refresh it.
            if oauth.expires_at? <= now_ms() {
                return None;
            }
            oauth.access_token
        })
}

fn keychain_credentials() -> Option<Credentials> {
    let output = Command::new("security")
        .args(["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    serde_json::from_slice(&output.stdout).ok()
}

fn file_credentials(home: &Path) -> Option<Credentials> {
    let raw = std::fs::read_to_string(home.join(".claude/.credentials.json")).ok()?;
    serde_json::from_str(&raw).ok()
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

fn age_ms(fetched_at_ms: f64) -> f64 {
    (now_ms() - fetched_at_ms).max(0.0)
}

fn file_age_ms(path: &Path) -> Option<f64> {
    let modified = std::fs::metadata(path).and_then(|m| m.modified()).ok()?;
    Some(
        SystemTime::now()
            .duration_since(modified)
            .map(|d| d.as_secs_f64() * 1000.0)
            .unwrap_or(0.0),
    )
}

fn iso8601_to_epoch(text: &str) -> Option<f64> {
    DateTime::parse_from_rfc3339(text)
        .ok()
        .map(|dt| dt.timestamp() as f64)
}
