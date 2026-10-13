// A11: the synthesised chimes
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NOTES, SAMPLE_RATE, synthWav, toBase64, wavBase64 } from '../.build/sound/synth.mjs'

const KINDS = ['decision', 'error', 'done']
const ascii = (b, at, n) => String.fromCharCode(...b.subarray(at, at + n))
const view = b => new DataView(b.buffer, b.byteOffset, b.byteLength)
const samples = b => Array.from({ length: (b.length - 44) / 2 }, (_, i) => view(b).getInt16(44 + i * 2, true))

test('RIFF / WAVE header: 44 bytes, PCM, mono, 22,050 Hz, 16 bit', () => {
  for (const k of KINDS) {
    const b = synthWav(k)
    const v = view(b)
    assert.equal(ascii(b, 0, 4), 'RIFF')
    assert.equal(ascii(b, 8, 4), 'WAVE')
    assert.equal(ascii(b, 12, 4), 'fmt ')
    assert.equal(ascii(b, 36, 4), 'data')
    assert.equal(v.getUint32(16, true), 16)
    assert.equal(v.getUint16(20, true), 1, 'PCM')
    assert.equal(v.getUint16(22, true), 1, 'mono')
    assert.equal(v.getUint32(24, true), 22_050)
    assert.equal(v.getUint32(28, true), 44_100)
    assert.equal(v.getUint16(32, true), 2)
    assert.equal(v.getUint16(34, true), 16)
    assert.equal(v.getUint32(4, true), b.length - 8, 'RIFF size')
    assert.equal(v.getUint32(40, true), b.length - 44, 'data size')
  }
})

test('the length is the end of the last note', () => {
  for (const k of KINDS) {
    const end = Math.max(...NOTES[k].map(n => n.to))
    assert.equal(samples(synthWav(k)).length, Math.ceil((end / 1000) * SAMPLE_RATE), k)
  }
  assert.deepEqual(KINDS.map(k => Math.max(...NOTES[k].map(n => n.to))), [380, 420, 520])
})

test('the notes of DESIGN 5.10', () => {
  assert.deepEqual(NOTES.decision.map(n => [n.hz, n.from, n.to]), [[659.25, 0, 140], [880, 120, 380]])
  assert.deepEqual(NOTES.error.map(n => [n.hz, n.from, n.to, n.overtone]), [[440, 0, 160, 0.15], [349.23, 140, 420, 0.15]])
  assert.deepEqual(NOTES.done.map(n => [n.hz, n.from, n.to]), [[523.25, 0, 120], [659.25, 100, 220], [783.99, 200, 520]])
})

test('samples are 16-bit values, loud enough to hear, never past half-scale plus the overlap', () => {
  for (const k of KINDS) {
    const s = samples(synthWav(k))
    const peak = Math.max(...s.map(Math.abs))
    assert.ok(peak <= 32767, k)
    assert.ok(peak > 0.25 * 32767, `${k} is audible`)
    assert.ok(peak < 0.8 * 32767, `${k} is not harsh`)
  }
})

test('a note starts from silence in 5 ms and decays; the first sample is zero', () => {
  const s = samples(synthWav('decision'))
  assert.equal(s[0], 0)
  const rms = (a, b) => Math.sqrt(s.slice(a, b).reduce((n, x) => n + x * x, 0) / (b - a))
  const ms = x => Math.round((x / 1000) * SAMPLE_RATE)
  assert.ok(rms(ms(0), ms(2)) < rms(ms(10), ms(20)), 'the attack is not instant')
  assert.ok(rms(ms(10), ms(30)) > rms(ms(90), ms(110)), 'the note decays')
})

test('the pitch is the note\'s: zero crossings in the first 100 ms of decision are E5\'s', () => {
  const s = samples(synthWav('decision')).slice(0, Math.round(0.1 * SAMPLE_RATE))
  let crossings = 0
  for (let i = 1; i < s.length; i++) if (s[i - 1] < 0 !== s[i] < 0) crossings++
  const hz = crossings / 2 / 0.1
  assert.ok(Math.abs(hz - 659.25) < 25, `${hz} Hz`)
})

test('the end of a note does not click: each sample next to the end of a note is small', () => {
  const s = samples(synthWav('done'))
  const at = Math.round(0.12 * SAMPLE_RATE) // the first note ends here, the second is already sounding
  assert.ok(Math.abs(s[at] - s[at - 1]) < 4000)
  assert.ok(Math.abs(s.at(-1)) < 100, 'the last sample is all but silent')
})

test('base64 of the bytes decodes to the same bytes, and is made once per sound', () => {
  for (const k of KINDS) {
    const b = synthWav(k)
    const text = wavBase64(k)
    assert.deepEqual(new Uint8Array(Buffer.from(text, 'base64')), b)
    assert.equal(wavBase64(k), text)
    assert.equal(toBase64(b), text)
  }
  assert.notEqual(wavBase64('decision'), wavBase64('error'))
})

test('toBase64 works on more than one chunk and on the empty input', () => {
  const big = Uint8Array.from({ length: 0x8000 * 2 + 17 }, (_, i) => (i * 7) & 255)
  assert.deepEqual(new Uint8Array(Buffer.from(toBase64(big), 'base64')), big)
  assert.equal(toBase64(new Uint8Array(0)), '')
})
