// the terminal's animations (X9), as pure functions of a frame number: a frame is 125 ms, and nothing here reads a clock or a
// random source, so every picture can be asked for again. Colours are #RRGGBB, the only kind a terminal Text takes here
import type { Seg } from './layout'
import { cells } from './width'

export const FRAME_MS = 125
export const isHex = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c)
export const FLASH_MS = 600 // how long a bar that has just finished glows
export const WHITE = '#FFFFFF'

const SPINNER = [...'⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'] // braille dots, one cell wide, a turn in 10 frames
const BAND_HALF = 1 // the band of light is 3 cells: its centre and one cell each side
const PAUSE = 8 // frames of one turn beyond the width of the title: the band leaves, and the title rests a moment
const SPARKLE = [0, 0.2, 0.4, 0.6] // how far towards white the tip of the fill goes, by level
const FLASH_MIX = 0.8 // how far towards white a finished bar starts

const clamp01 = (t: number) => (Number.isNaN(t) ? 0 : Math.min(1, Math.max(0, t)))
const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

// a colour between a and b: t = 0 is a, t = 1 is b (t is held to 0..1); both #RRGGBB, the result upper case
export function mixHex(a: string, b: string, t: number): string {
  const k = clamp01(t)
  const [from, to] = [channels(a), channels(b)]
  return `#${from.map((v, i) => Math.round(v + ((to[i] ?? 0) - v) * k).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

// the glyph of a running bar or agent at this frame
export const spinnerGlyph = (frame: number): string => SPINNER[((Math.floor(frame) % SPINNER.length) + SPINNER.length) % SPINNER.length] ?? SPINNER[0] ?? '⠋'

// a band of light crossing the title from left to right, one cell a frame, and resting after it has left: [period] frames a turn
// (the width of the title plus a pause unless the caller says another). Characters are whole (a wide one is lit as one) and
// the Segs, put end to end, are exactly the text. A character the band does not touch is `base`; at its centre it is `hi`
export function shimmerSegs(text: string, frame: number, base: string, hi: string, opts: { period?: number } = {}): Seg[] {
  const period = Math.max(1, Math.floor(opts.period ?? cells(text) + PAUSE))
  const centre = (((Math.floor(frame) % period) + period) % period) - BAND_HALF - 1
  const out: Seg[] = []
  let at = 0
  let last = 0
  for (const ch of text) {
    const w = cells(ch)
    // a mark that takes no cell goes with the character before it
    let weight = last
    if (w > 0) {
      weight = 0
      for (let k = at; k < at + w; k++) weight = Math.max(weight, Math.abs(k - centre) === 0 ? 1 : Math.abs(k - centre) <= BAND_HALF ? 0.5 : 0)
    }
    last = weight
    at += w
    const color = weight === 0 ? base : mixHex(base, hi, weight)
    const prev = out[out.length - 1]
    if (prev && prev.color === color) prev.text += ch
    else out.push({ text: ch, color })
  }
  return out
}

// how bright the tip of a bar's fill is at this frame, 0 to 3: from the id and the frame, so it twinkles and the same frame is the same
export function sparkleLevel(barId: string, frame: number): number {
  let h = 2166136261
  for (let i = 0; i < barId.length; i++) h = Math.imul(h ^ barId.charCodeAt(i), 16777619)
  h = Math.imul(h ^ Math.floor(frame), 16777619)
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995)
  h ^= h >>> 15
  return Math.floor(((h >>> 0) / 4294967296) * SPARKLE.length)
}
export const sparkleColor = (base: string, level: number) => mixHex(base, WHITE, SPARKLE[level] ?? 0)

// how much of its glow a bar that finished at endedAt has left at now: 1 at the moment, 0 after FLASH_MS
export function flashLevel(now: number, endedAt: number | null): number {
  if (endedAt === null) return 0
  return clamp01(1 - (now - endedAt) / FLASH_MS)
}
export const isFlashing = (now: number, endedAt: number | null): boolean => endedAt !== null && now - endedAt < FLASH_MS
export const flashColor = (base: string, level: number) => mixHex(base, WHITE, FLASH_MIX * level)
