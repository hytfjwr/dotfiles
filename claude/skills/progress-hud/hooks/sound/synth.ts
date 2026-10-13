// the three chimes, synthesised: 22,050 Hz, mono, 16-bit PCM in a WAV (DESIGN 5.10). No file is shipped and no process is started
export type Sound = 'decision' | 'error' | 'done'

export const SAMPLE_RATE = 22_050
const PEAK = 0.5 // peak amplitude of one note
const ATTACK_S = 0.005
const DECAY_S = 0.12 // time constant of the exponential decay
const RELEASE_S = 0.005 // a short fade at the end of a note, so it does not click

type Note = { hz: number; from: number; to: number; overtone?: number } // milliseconds; overtone: the 3rd harmonic's level

export const NOTES: Record<Sound, Note[]> = {
  decision: [{ hz: 659.25, from: 0, to: 140 }, { hz: 880, from: 120, to: 380 }], // E5, A5
  error: [{ hz: 440, from: 0, to: 160, overtone: 0.15 }, { hz: 349.23, from: 140, to: 420, overtone: 0.15 }], // A4, F4
  done: [{ hz: 523.25, from: 0, to: 120 }, { hz: 659.25, from: 100, to: 220 }, { hz: 783.99, from: 200, to: 520 }], // C5, E5, G5
}

// the WAV file as bytes: a 44-byte RIFF header and the samples
export function synthWav(sound: Sound): Uint8Array {
  const notes = NOTES[sound]
  const samples = Math.ceil((Math.max(...notes.map(n => n.to)) / 1000) * SAMPLE_RATE)
  const dataBytes = samples * 2
  const out = new Uint8Array(44 + dataBytes)
  const view = new DataView(out.buffer)
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true) // size of the format chunk
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true) // bytes a second
  view.setUint16(32, 2, true) // bytes a frame
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)
  for (let i = 0; i < samples; i++) {
    const at = i / SAMPLE_RATE
    let v = 0
    for (const n of notes) {
      const t = at - n.from / 1000
      const len = (n.to - n.from) / 1000
      if (t < 0 || t >= len) continue
      const env = Math.min(1, t / ATTACK_S) * Math.exp(-t / DECAY_S) * Math.min(1, (len - t) / RELEASE_S)
      const wave = Math.sin(2 * Math.PI * n.hz * t) + (n.overtone ? n.overtone * Math.sin(2 * Math.PI * n.hz * 3 * t) : 0)
      v += PEAK * env * (n.overtone ? wave / (1 + n.overtone) : wave)
    }
    view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, v)) * 32767), true)
  }
  return out
}

// base64 of bytes without toBase64 (not in the engine's lib): btoa over a binary string built in chunks
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

// made once per sound
const cache = new Map<Sound, string>()
export function wavBase64(sound: Sound): string {
  const hit = cache.get(sound)
  if (hit !== undefined) return hit
  const made = toBase64(synthWav(sound))
  cache.set(sound, made)
  return made
}
