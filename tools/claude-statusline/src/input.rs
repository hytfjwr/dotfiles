//! The status line payload Claude Code writes to stdin, plus the two usage
//! exports other tools on this machine read.

use crate::usage::{write_atomic, ScopedLimit, Usage};
use chrono::DateTime;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Read by the WezTerm tabline (`wezterm/claude_usage.lua`).
const TMP_EXPORT_FILE: &str = "/tmp/claude_rate_limits.json";
/// Read by the macOS status bar plugin, relative to `$HOME`.
const HOME_EXPORT_FILE: &str = ".claude/rate_limits.json";

#[derive(Deserialize)]
pub struct StatusData {
    pub model: Option<Model>,
    pub context_window: Option<ContextWindow>,
    pub cost: Option<Cost>,
    pub rate_limits: Option<RateLimits>,
    pub fast_mode: Option<bool>,
    pub effort: Option<Effort>,
    pub thinking: Option<Thinking>,
}

#[derive(Deserialize)]
pub struct Model {
    pub id: Option<String>,
    pub display_name: Option<String>,
}

#[derive(Deserialize)]
pub struct ContextWindow {
    pub used_percentage: Option<f64>,
}

#[derive(Deserialize)]
pub struct Cost {
    pub total_cost_usd: Option<f64>,
    pub total_lines_added: Option<i64>,
    pub total_lines_removed: Option<i64>,
}

#[derive(Deserialize)]
pub struct Effort {
    pub level: Option<String>,
}

#[derive(Deserialize)]
pub struct Thinking {
    pub enabled: Option<bool>,
}

#[derive(Deserialize, Serialize)]
pub struct RateLimits {
    pub five_hour: Option<RateLimit>,
    pub seven_day: Option<RateLimit>,
}

#[derive(Deserialize, Serialize)]
pub struct RateLimit {
    pub used_percentage: Option<f64>,
    pub resets_at: Option<f64>,
}

/// Output structs for ~/.claude/rate_limits.json
#[derive(Serialize)]
struct RateLimitsFile {
    rate_limits: RateLimitsOutput,
}

/// A window the snapshot lacks is left out, not written as null.
#[derive(Serialize)]
struct RateLimitsOutput {
    #[serde(skip_serializing_if = "Option::is_none")]
    five_hour: Option<RateLimitOutput>,
    #[serde(skip_serializing_if = "Option::is_none")]
    seven_day: Option<RateLimitOutput>,
    /// Model-scoped weekly windows (Fable). Absent, not null, when there are none.
    #[serde(skip_serializing_if = "Option::is_none")]
    model_scoped: Option<Vec<ScopedLimitOutput>>,
    /// When the snapshot was fetched, so the reader can tell how old it is.
    fetched_at: String,
}

#[derive(Serialize)]
struct RateLimitOutput {
    used_percentage: f64,
    /// Dropped rather than emitted as null for a window nobody has opened
    /// since it last reset: it reads 0% and has no reset time yet.
    #[serde(skip_serializing_if = "Option::is_none")]
    resets_at: Option<String>,
}

#[derive(Serialize)]
struct ScopedLimitOutput {
    display_name: String,
    used_percentage: f64,
    /// Dropped rather than emitted as null when the reset time is unknown.
    #[serde(skip_serializing_if = "Option::is_none")]
    resets_at: Option<String>,
}

fn epoch_to_iso8601(epoch: f64) -> Option<String> {
    let dt = DateTime::from_timestamp(epoch as i64, 0)?;
    Some(dt.format("%Y-%m-%dT%H:%M:%SZ").to_string())
}

fn convert_rate_limit(limit: &RateLimit) -> Option<RateLimitOutput> {
    Some(RateLimitOutput {
        used_percentage: limit.used_percentage?,
        resets_at: limit.resets_at.and_then(epoch_to_iso8601),
    })
}

fn convert_scoped_limit(limit: &ScopedLimit) -> ScopedLimitOutput {
    ScopedLimitOutput {
        display_name: limit.display_name.clone(),
        used_percentage: limit.pct,
        resets_at: limit.resets_at.and_then(epoch_to_iso8601),
    }
}

/// The /tmp export keeps the payload's own shape. `claude_usage.lua` matches it
/// with patterns and takes the first `resets_at` as the 5h one, so `five_hour`
/// stays first and nothing is added.
fn tmp_export_json(plan: &RateLimits) -> Option<String> {
    serde_json::to_string(plan).ok()
}

fn home_export_json(usage: &Usage, fetched_at_ms: f64) -> Option<String> {
    let output = RateLimitsFile {
        rate_limits: RateLimitsOutput {
            five_hour: usage.plan.five_hour.as_ref().and_then(convert_rate_limit),
            seven_day: usage.plan.seven_day.as_ref().and_then(convert_rate_limit),
            model_scoped: (!usage.scoped.is_empty())
                .then(|| usage.scoped.iter().map(convert_scoped_limit).collect()),
            fetched_at: epoch_to_iso8601(fetched_at_ms / 1000.0)?,
        },
    };
    serde_json::to_string_pretty(&output).ok()
}

/// Write the plan windows to /tmp for the WezTerm tabline
pub fn write_rate_limits(plan: &RateLimits) {
    if let Some(json) = tmp_export_json(plan) {
        write_atomic(Path::new(TMP_EXPORT_FILE), json.as_bytes());
    }
}

/// Write every window to ~/.claude/rate_limits.json with ISO 8601 timestamps
pub fn write_rate_limits_file(usage: &Usage, fetched_at_ms: f64) {
    let Some(json) = home_export_json(usage, fetched_at_ms) else {
        return;
    };
    if let Some(home) = std::env::var_os("HOME") {
        write_atomic(&Path::new(&home).join(HOME_EXPORT_FILE), json.as_bytes());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    /// 2026-10-03T08:33:26.064Z
    const FETCHED_AT_MS: f64 = 1_791_016_406_064.927;

    /// One `limits[]` entry, shaped like the endpoint's.
    fn limit(kind: &str, percent: f64, resets_at: Option<&str>) -> Value {
        json!({
            "group": "weekly",
            "is_active": resets_at.is_some(),
            "kind": kind,
            "percent": percent,
            "resets_at": resets_at,
            "scope": null,
            "severity": "normal",
        })
    }

    fn scoped(display_name: &str, percent: f64, resets_at: &str) -> Value {
        let mut entry = limit("weekly_scoped", percent, Some(resets_at));
        entry["scope"] =
            json!({ "model": { "display_name": display_name, "id": null }, "surface": null });
        entry
    }

    /// An endpoint answer with these `limits`, read the way the refresh reads it.
    fn answer(limits: Vec<Value>) -> Usage {
        Usage::from_response(&json!({ "limits": limits, "five_hour": { "utilization": 0.0 } }))
            .expect("the answer has limits")
    }

    fn home_export(usage: &Usage) -> Value {
        let json = home_export_json(usage, FETCHED_AT_MS).expect("serializes");
        serde_json::from_str(&json).expect("valid JSON")
    }

    #[test]
    fn maps_each_kind_to_its_window() {
        let usage = answer(vec![
            limit("session", 31.0, Some("2026-10-03T08:30:00.140040+00:00")),
            limit("weekly_all", 87.0, Some("2026-10-03T10:00:00.047020+00:00")),
            scoped("Fable", 17.0, "2026-10-03T10:00:00.047244+00:00"),
        ]);

        assert_eq!(
            home_export(&usage),
            json!({
                "rate_limits": {
                    "five_hour": { "used_percentage": 31.0, "resets_at": "2026-10-03T08:30:00Z" },
                    "seven_day": { "used_percentage": 87.0, "resets_at": "2026-10-03T10:00:00Z" },
                    "model_scoped": [
                        { "display_name": "Fable", "used_percentage": 17.0, "resets_at": "2026-10-03T10:00:00Z" },
                    ],
                    "fetched_at": "2026-10-03T08:33:26Z",
                }
            })
        );
    }

    #[test]
    fn missing_windows_are_left_out_of_the_home_export() {
        let mut no_percent = limit("session", 0.0, None);
        no_percent["percent"] = Value::Null;
        let usage = answer(vec![
            no_percent,
            limit("weekly_all", 87.0, Some("2026-10-03T10:00:00.047020+00:00")),
        ]);

        let export = home_export(&usage);
        let rate_limits = export["rate_limits"].as_object().expect("an object");
        assert!(!rate_limits.contains_key("five_hour"));
        assert!(!rate_limits.contains_key("model_scoped"));
        assert!(rate_limits.contains_key("seven_day"));
        assert!(!home_export_json(&usage, FETCHED_AT_MS)
            .expect("serializes")
            .contains("null"));
    }

    #[test]
    fn unopened_window_reads_zero_without_a_reset_time() {
        let usage = answer(vec![
            limit("session", 0.0, None),
            limit("weekly_all", 87.0, Some("2026-10-03T10:00:00.047020+00:00")),
        ]);

        assert_eq!(
            home_export(&usage)["rate_limits"]["five_hour"],
            json!({ "used_percentage": 0.0 })
        );
        assert_eq!(
            tmp_export_json(&usage.plan).expect("serializes"),
            r#"{"five_hour":{"used_percentage":0.0,"resets_at":null},"seven_day":{"used_percentage":87.0,"resets_at":1791021600.0}}"#
        );
    }

    #[test]
    fn resets_at_becomes_whole_seconds_in_utc() {
        let usage = answer(vec![
            limit("session", 31.0, Some("2026-10-03T08:30:00.140040+00:00")),
            limit("weekly_all", 87.0, Some("2026-10-03T19:00:00.999999+09:00")),
            scoped("Fable", 17.0, "2026-10-03T10:00:00.047244+00:00"),
        ]);

        let export = home_export(&usage);
        let rate_limits = &export["rate_limits"];
        assert_eq!(
            rate_limits["five_hour"]["resets_at"],
            "2026-10-03T08:30:00Z"
        );
        assert_eq!(
            rate_limits["seven_day"]["resets_at"],
            "2026-10-03T10:00:00Z"
        );
        assert_eq!(
            rate_limits["model_scoped"][0]["resets_at"],
            "2026-10-03T10:00:00Z"
        );
        assert_eq!(
            usage.plan.five_hour.and_then(|w| w.resets_at),
            Some(1_791_016_200.0)
        );
    }

    #[test]
    fn tmp_export_keeps_the_payload_shape_with_five_hour_first() {
        // Listed in the opposite order on purpose: the output order is ours.
        let usage = answer(vec![
            scoped("Fable", 17.0, "2026-10-03T10:00:00.047244+00:00"),
            limit("weekly_all", 87.0, Some("2026-10-03T10:00:00.047020+00:00")),
            limit("session", 31.0, Some("2026-10-03T08:30:00.140040+00:00")),
        ]);

        assert_eq!(
            tmp_export_json(&usage.plan).expect("serializes"),
            r#"{"five_hour":{"used_percentage":31.0,"resets_at":1791016200.0},"seven_day":{"used_percentage":87.0,"resets_at":1791021600.0}}"#
        );

        let missing_five_hour = answer(vec![limit(
            "weekly_all",
            87.0,
            Some("2026-10-03T10:00:00.047020+00:00"),
        )]);
        assert_eq!(
            tmp_export_json(&missing_five_hour.plan).expect("serializes"),
            r#"{"five_hour":null,"seven_day":{"used_percentage":87.0,"resets_at":1791021600.0}}"#
        );
    }

    #[test]
    fn an_answer_without_limits_exports_nothing() {
        assert!(
            Usage::from_response(&json!({ "error": { "type": "rate_limit_error" } })).is_none()
        );
        assert!(Usage::from_response(&json!({ "five_hour": { "utilization": 31.0 } })).is_none());
    }
}
