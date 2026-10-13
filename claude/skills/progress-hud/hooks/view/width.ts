// terminal cell widths: wide and fullwidth characters take 2, combining marks 0, everything else 1.
// Characters whose East Asian width is ambiguous (● █ ░ ┊ ✓) count as 1, as most terminals draw them

const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x231a, 0x231b],
  [0x2329, 0x232a],
  [0x2e80, 0x303e], // CJK radicals, punctuation
  [0x3041, 0x33ff], // kana, CJK symbols
  [0x3400, 0x4dbf], // CJK extension A
  [0x4e00, 0x9fff], // CJK unified
  [0xa000, 0xa4cf], // Yi
  [0xa960, 0xa97f], // Hangul Jamo extended A
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility
  [0xfe30, 0xfe6f], // CJK compatibility forms
  [0xff00, 0xff60], // fullwidth forms
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f], // emoji
  [0x1f680, 0x1f6ff],
  [0x1f900, 0x1f9ff],
  [0x20000, 0x3fffd], // CJK extensions B and up
]

const isCombining = (cp: number) =>
  (cp >= 0x0300 && cp <= 0x036f) || // combining diacritics
  (cp >= 0x1ab0 && cp <= 0x1aff) ||
  (cp >= 0x1dc0 && cp <= 0x1dff) ||
  (cp >= 0x20d0 && cp <= 0x20ff) ||
  (cp >= 0x3099 && cp <= 0x309a) || // kana voiced marks
  (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors
  (cp >= 0xfe20 && cp <= 0xfe2f) ||
  (cp >= 0xe0100 && cp <= 0xe01ef) ||
  cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0x2060 || cp === 0xfeff

const charCells = (cp: number): number => {
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0
  if (cp < 0x300) return 1
  if (isCombining(cp)) return 0
  return WIDE.some(([lo, hi]) => cp >= lo && cp <= hi) ? 2 : 1
}

export const cells = (s: string): number => [...s].reduce((n, ch) => n + charCells(ch.codePointAt(0) ?? 0), 0)

// at most n cells, ending in … when something was cut
export function truncateCells(s: string, n: number): string {
  if (n <= 0) return ''
  if (cells(s) <= n) return s
  let out = ''
  let w = 0
  for (const ch of s) {
    const c = charCells(ch.codePointAt(0) ?? 0)
    if (w + c > n - 1) break
    out += ch
    w += c
  }
  return `${out}…`
}

// spaces added to reach n cells (nothing when it is already as wide)
export const padEndCells = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - cells(s)))
export const padStartCells = (s: string, n: number) => ' '.repeat(Math.max(0, n - cells(s))) + s

// pixels in the desktop's UI font: CJK, fullwidth and Hangul 12, narrow letters 3.4, wide letters 9.5, the rest 6.7
export const pxWidth = (s: string, px = 6.7): number =>
  [...s].reduce((w, ch) => {
    const cp = ch.codePointAt(0) ?? 0
    const c = charCells(cp)
    return w + (c === 0 ? 0 : c === 2 ? 12 : /[ilI.,:;'|!]/.test(ch) ? 3.4 : /[mwMW]/.test(ch) ? 9.5 : px)
  }, 0)
