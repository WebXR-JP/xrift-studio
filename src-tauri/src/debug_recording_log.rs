//! The line format of a long Scene View recording's activity log.
//!
//! A long recording is two files written side by side: the WebM the Scene View
//! streams, and a JSONL log of what happened while it ran. The log is what turns
//! hours of footage into something a person can cut: every MCP tool call, every
//! stretch where the window was hidden, and the moment the video actually
//! started, each stamped with the seconds since the session began.
//!
//! This module holds only the pure formatting so it can be tested without a
//! Tauri runtime. File handles and app state live in `debug_recording.rs`.

use serde_json::{json, Map, Value};

/// Event names are file-safe identifiers. Anything else is rejected so a
/// caller cannot smuggle structure into the `event` key.
pub const MAX_EVENT_NAME_CHARS: usize = 48;
/// Extra data on a line is bounded so a runaway caller cannot fill the disk
/// through the log instead of the video.
pub const MAX_EVENT_DATA_BYTES: usize = 4 * 1024;

/// Formats a Unix time in milliseconds as ISO 8601 UTC with milliseconds,
/// e.g. `2026-09-02T00:20:19.123Z`. Uses the civil-from-days algorithm so no
/// date crate is needed for one timestamp format.
pub fn iso8601_utc_millis(unix_ms: u64) -> String {
    let millis = unix_ms % 1000;
    let seconds = unix_ms / 1000;
    let (year, month, day, hour, minute, second) = civil_from_unix_seconds(seconds);
    format!(
        "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z"
    )
}

/// Directory name for one recording, sortable by start time and readable in a
/// file manager: `recording-20260902-002019`.
pub fn recording_directory_name(unix_ms: u64) -> String {
    let (year, month, day, hour, minute, second) = civil_from_unix_seconds(unix_ms / 1000);
    format!("recording-{year:04}{month:02}{day:02}-{hour:02}{minute:02}{second:02}")
}

/// Accepts an event name made of ASCII letters, digits, `-` and `_`.
pub fn sanitize_event_name(name: &str) -> Option<&str> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.chars().count() > MAX_EVENT_NAME_CHARS {
        return None;
    }
    if trimmed
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || character == '-' || character == '_')
    {
        Some(trimmed)
    } else {
        None
    }
}

/// One log line, without the trailing newline. `t` is seconds since the
/// session began, which is the axis a video editor works on; `at` is the wall
/// clock for matching against anything recorded elsewhere.
pub fn log_line(at_unix_ms: u64, t_seconds: f64, event: &str, fields: Map<String, Value>) -> String {
    let mut object = Map::new();
    object.insert("at".to_string(), Value::String(iso8601_utc_millis(at_unix_ms)));
    object.insert("t".to_string(), json!(round_to_millis(t_seconds)));
    object.insert("event".to_string(), Value::String(event.to_string()));
    for (key, value) in fields {
        // The three fixed keys describe the line itself; extra data may not
        // rewrite them.
        if key == "at" || key == "t" || key == "event" {
            continue;
        }
        object.insert(key, value);
    }
    Value::Object(object).to_string()
}

fn round_to_millis(seconds: f64) -> f64 {
    (seconds * 1000.0).round() / 1000.0
}

/// Howard Hinnant's civil-from-days, for a proleptic Gregorian calendar.
fn civil_from_unix_seconds(seconds: u64) -> (i64, u32, u32, u32, u32, u32) {
    let days = (seconds / 86_400) as i64;
    let remainder = seconds % 86_400;
    let hour = (remainder / 3600) as u32;
    let minute = ((remainder % 3600) / 60) as u32;
    let second = (remainder % 60) as u32;

    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * month_index + 2) / 5 + 1) as u32;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    } as u32;
    let year = year_of_era + era * 400 + if month <= 2 { 1 } else { 0 };
    (year, month, day, hour, minute, second)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timestamps_are_iso8601_utc_with_milliseconds() {
        assert_eq!(iso8601_utc_millis(0), "1970-01-01T00:00:00.000Z");
        // 2026-09-02T00:20:19.123Z
        assert_eq!(iso8601_utc_millis(1_788_308_419_123), "2026-09-02T00:20:19.123Z");
        // A leap day, to exercise the calendar arithmetic.
        assert_eq!(iso8601_utc_millis(1_709_164_800_000), "2024-02-29T00:00:00.000Z");
    }

    #[test]
    fn directory_names_sort_by_start_time() {
        assert_eq!(
            recording_directory_name(1_788_308_419_123),
            "recording-20260902-002019"
        );
        assert!(recording_directory_name(1_000) < recording_directory_name(2_000_000_000_000));
    }

    #[test]
    fn event_names_are_file_safe_identifiers() {
        assert_eq!(sanitize_event_name(" visibility "), Some("visibility"));
        assert_eq!(sanitize_event_name("video-start"), Some("video-start"));
        assert_eq!(sanitize_event_name(""), None);
        assert_eq!(sanitize_event_name("has space"), None);
        assert_eq!(sanitize_event_name("日本語"), None);
        assert_eq!(sanitize_event_name(&"a".repeat(MAX_EVENT_NAME_CHARS + 1)), None);
    }

    #[test]
    fn log_lines_keep_the_fixed_keys_and_round_t() {
        let mut fields = Map::new();
        fields.insert("tool".to_string(), json!("place_asset"));
        fields.insert("event".to_string(), json!("spoofed"));
        fields.insert("t".to_string(), json!(999));
        let line = log_line(1_788_308_419_123, 12.34567, "tool", fields);
        let parsed: Value = serde_json::from_str(&line).expect("line is JSON");
        assert_eq!(parsed["at"], "2026-09-02T00:20:19.123Z");
        assert_eq!(parsed["t"], 12.346);
        assert_eq!(parsed["event"], "tool");
        assert_eq!(parsed["tool"], "place_asset");
        assert!(!line.contains('\n'));
    }
}
