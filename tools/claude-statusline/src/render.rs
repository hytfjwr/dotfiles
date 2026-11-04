//! Colors, gauges, and the 1 Hz animation used by the status line.

use std::fmt::Write;

pub type Color = (u8, u8, u8);

/// Nerd Font glyphs. Verified present in Symbols Nerd Font / the repo's font stack.
pub mod icon {
    pub const MODEL: &str = "\u{f06a9}"; // nf-md-robot
    pub const BRANCH: &str = "\u{e0a0}"; // powerline branch
    pub const CTX: &str = "\u{f086}"; // fa-comments
    pub const FIVE_HOUR: &str = "\u{f017}"; // fa-clock-o
    pub const SEVEN_DAY: &str = "\u{f073}"; // fa-calendar
    pub const SCOPED: &str = "\u{f0e7}"; // fa-bolt
    pub const FAST: &str = "\u{f135}"; // fa-rocket
    pub const EFFORT: &str = "\u{f1de}"; // fa-sliders
    pub const THINKING: &str = "\u{f0eb}"; // fa-lightbulb-o
}

/// Three-stop gradient: low -> mid -> high
pub struct Theme {
    pub low: Color,
    pub mid: Color,
    pub high: Color,
    pub label: Color,
}

pub const THEME_CTX: Theme = Theme {
    low: (80, 200, 200),
    mid: (60, 160, 230),
    high: (130, 100, 255),
    label: (80, 190, 210),
};

pub const THEME_5H: Theme = Theme {
    low: (80, 210, 100),
    mid: (240, 200, 60),
    high: (255, 75, 75),
    label: (240, 180, 60),
};

pub const THEME_7D: Theme = Theme {
    low: (170, 140, 245),
    mid: (210, 100, 200),
    high: (255, 75, 120),
    label: (180, 140, 240),
};

/// Per-model weekly windows (Fable). Amber family, distinct from 5h/7d.
pub const THEME_SCOPED: Theme = Theme {
    low: (255, 195, 105),
    mid: (255, 145, 65),
    high: (255, 70, 70),
    label: (255, 185, 95),
};

pub const DIM_BAR: Color = (60, 60, 70);
pub const DIM_TEXT: Color = (120, 120, 130);
const WHITE: Color = (255, 255, 255);

const BAR_WIDTH: usize = 10;
/// Left one-eighth block through left seven-eighths block: the partial cell.
const EIGHTHS: [char; 7] = [
    '\u{258f}', '\u{258e}', '\u{258d}', '\u{258c}', '\u{258b}', '\u{258a}', '\u{2589}',
];
const FULL: char = '\u{2588}';
const EMPTY: char = '\u{2591}';

/// Unfilled bar cells: a groove drawn as a cell background, so the terminal's
/// blink can fade a foreground overlay without punching holes in the bar.
const TRACK: Color = (52, 54, 64);

/// Utilization at which the gauge icon starts blinking, and at which it
/// switches to the terminal's rapid blink.
const DANGER_PCT: f64 = 85.0;
const CRITICAL_PCT: f64 = 95.0;

/// Cells the shimmer highlight advances per frame. The command can only be
/// re-run once a second, so the highlight covers ground per step instead.
const SWEEP_STEP: u64 = 2;
/// Blank cells between one shimmer sweep and the next.
const SWEEP_GAP: usize = 4;
/// How much brighter the blinking overlay is than the cell underneath.
const OVERLAY_BOOST: f64 = 0.35;

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
pub fn theme_color(theme: &Theme, pct: f64) -> Color {
    if pct <= 50.0 {
        lerp_color(theme.low, theme.mid, pct / 50.0)
    } else {
        lerp_color(theme.mid, theme.high, (pct - 50.0) / 50.0)
    }
}

/// Push a color toward white — used by the shimmer highlight and the pulse
fn brighten(c: Color, t: f64) -> Color {
    lerp_color(c, WHITE, t)
}

/// Push a color toward the dim text gray — used for stale data
fn fade(c: Color, t: f64) -> Color {
    lerp_color(c, DIM_TEXT, t)
}

/// Format text with TrueColor foreground
pub fn fg(text: &str, color: Color) -> String {
    format!(
        "\x1b[38;2;{};{};{}m{}\x1b[0m",
        color.0, color.1, color.2, text
    )
}

/// Format text as bold with TrueColor foreground
pub fn fg_bold(text: &str, color: Color) -> String {
    format!(
        "\x1b[1;38;2;{};{};{}m{}\x1b[0m",
        color.0, color.1, color.2, text
    )
}

/// Which of the terminal's two blink rates to hand a run of text.
#[derive(Clone, Copy, PartialEq)]
pub enum Blink {
    None,
    Slow,
    Rapid,
}

impl Blink {
    /// The SGR parameter, ready to append inside an escape sequence.
    fn sgr(self) -> &'static str {
        match self {
            Blink::None => "",
            Blink::Slow => ";5",
            Blink::Rapid => ";6",
        }
    }
}

/// Format text with TrueColor foreground, blinking at the terminal's own rate.
/// WezTerm eases the fade at `animation_fps`, so this animates far faster than
/// the once-a-second re-run of the command ever could.
pub fn fg_blink(text: &str, color: Color, blink: Blink) -> String {
    format!(
        "\x1b[38;2;{};{};{}{}m{}\x1b[0m",
        color.0,
        color.1,
        color.2,
        blink.sgr(),
        text
    )
}

/// Current animation frame. One frame per second, matching the smallest
/// `statusLine.refreshInterval` Claude Code accepts.
pub fn frame_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// One labelled utilization gauge: icon, bar, percentage, reset countdown.
pub struct Gauge<'a> {
    pub icon: &'a str,
    /// Rendered after the icon when the icon alone would be ambiguous.
    pub name: Option<&'a str>,
    pub pct: f64,
    pub theme: &'a Theme,
    /// Pre-formatted countdown to the window reset, e.g. `1h56m`.
    pub remaining: Option<String>,
    /// Staggers the shimmer so neighbouring gauges do not sweep in lockstep.
    pub phase: u64,
    /// Data older than the source's refresh window: dimmed and marked.
    pub stale: bool,
}

impl Gauge<'_> {
    pub fn render(&self, frame: u64) -> String {
        let dim = |c: Color| if self.stale { fade(c, 0.65) } else { c };

        // The icon carries the alert, because a percentage that fades out is a
        // percentage you cannot read when it matters most.
        let icon_blink = match self.pct {
            _ if self.stale => Blink::None,
            p if p >= CRITICAL_PCT => Blink::Rapid,
            p if p >= DANGER_PCT => Blink::Slow,
            _ => Blink::None,
        };
        // Alternating brightness on the number, so the alert still reads on
        // terminals that ignore blink.
        let alert_boost = if icon_blink != Blink::None && frame.is_multiple_of(2) {
            0.35
        } else {
            0.0
        };
        let accent = dim(brighten(theme_color(self.theme, self.pct), alert_boost));

        let mut out = String::with_capacity(512);
        out.push_str(&fg_blink(
            self.icon,
            dim(brighten(self.theme.label, alert_boost)),
            icon_blink,
        ));
        if let Some(name) = self.name {
            out.push(' ');
            out.push_str(&fg(name, dim(self.theme.label)));
        }
        out.push(' ');
        out.push_str(&self.bar(frame));
        // Right-aligned so the line does not shift as the value changes.
        out.push(' ');
        out.push_str(&fg(&format!("{:>3.0}%", self.pct), accent));
        if let Some(ref remaining) = self.remaining {
            out.push(' ');
            out.push_str(&fg(remaining, dim(DIM_TEXT)));
        }
        if self.stale {
            out.push_str(&fg("*", DIM_TEXT));
        }
        out
    }

    /// Sub-block precision bar.
    ///
    /// Every cell paints a background, and the filled ones carry a brighter
    /// foreground block on top. That lets the terminal's blink fade the
    /// overlay in and out — a smooth brightness alternation — instead of
    /// blanking the cell and making the bar look emptier than it is.
    fn bar(&self, frame: u64) -> String {
        let cells = (self.pct / 100.0).clamp(0.0, 1.0) * BAR_WIDTH as f64;
        let mut full = cells.floor() as usize;
        let mut eighths = ((cells - full as f64) * 8.0).round() as usize;
        if eighths >= 8 {
            full += 1;
            eighths = 0;
        }
        let full = full.min(BAR_WIDTH);
        let filled = (full + usize::from(eighths > 0)).min(BAR_WIDTH);

        // Shimmer: a three-cell highlight sweeping the filled span, then a gap.
        let sweep_center = if self.stale || filled == 0 {
            None
        } else {
            let span = (filled + SWEEP_GAP) as u64;
            Some(((frame * SWEEP_STEP + self.phase) % span) as i64)
        };

        let mut bar = String::with_capacity(BAR_WIDTH * 40);
        for i in 0..BAR_WIDTH {
            // Cell background: the value itself.
            let (bg, glyph, glyph_color, blink) = if i < full {
                let boost = match sweep_center.map(|c| (i as i64 - c).abs()) {
                    Some(0) => 0.55,
                    Some(1) => 0.22,
                    _ => 0.0,
                };
                let base = brighten(theme_color(self.theme, self.cell_pct(i)), boost);
                // Every other cell blinks, and the parity flips each frame, so
                // the pattern marches instead of sitting still.
                let blink = if self.stale || !(i as u64 + frame).is_multiple_of(2) {
                    Blink::None
                } else {
                    Blink::Slow
                };
                let overlay = match blink {
                    Blink::None => base,
                    _ => brighten(base, OVERLAY_BOOST),
                };
                (base, FULL, overlay, blink)
            } else if i == full && eighths > 0 {
                // The value's edge stays still: it is the number you read.
                let edge = theme_color(self.theme, self.cell_pct(i));
                (TRACK, EIGHTHS[eighths - 1], edge, Blink::None)
            } else {
                (TRACK, EMPTY, lerp_color(TRACK, DIM_TEXT, 0.3), Blink::None)
            };

            let (bg, glyph_color) = if self.stale {
                (fade(bg, 0.65), fade(glyph_color, 0.65))
            } else {
                (bg, glyph_color)
            };
            // A leading 0 clears the previous cell's blink attribute.
            let _ = write!(
                bar,
                "\x1b[0;48;2;{};{};{};38;2;{};{};{}{}m{}",
                bg.0,
                bg.1,
                bg.2,
                glyph_color.0,
                glyph_color.1,
                glyph_color.2,
                blink.sgr(),
                glyph
            );
        }
        bar.push_str("\x1b[0m");
        bar
    }

    /// Gradient position for cell `i`: the bar sweeps the theme up to `pct`.
    fn cell_pct(&self, i: usize) -> f64 {
        (i as f64 / (BAR_WIDTH - 1) as f64) * self.pct
    }
}
