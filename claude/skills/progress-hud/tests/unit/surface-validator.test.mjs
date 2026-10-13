// the surface validator itself: a tree a stub-engine render returns must fit the surface's element table and props
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateTree } from '../surface-validator.mjs'

const h = (type, props, ...children) => ({ type, props: props ?? {}, children })

test('a plausible terminal band is valid', () => {
  const tree = h('Box', { flexDirection: 'column' }, h('Box', { flexDirection: 'row', gap: 1 }, h('Text', { color: '#7858CA' }, '●'), h('Text', { wrap: 'truncate', dimColor: true }, 'title'), h('Button', { key: 'hud-close-x', plain: true, dimColor: true, label: '✕', onPress() {} })), [null, false, 'x'])
  assert.deepEqual(validateTree(tree, 'terminal'), [])
})

test('Svg is not a terminal element and Raster is not a desktop element', () => {
  assert.match(validateTree(h('Box', {}, h('Svg', { source: '<svg/>', alt: 'a' })), 'terminal')[0], /Svg is not an element of terminal/)
  assert.match(validateTree(h('Box', {}, h('Raster', { columns: 1, rows: 1, cells: '' })), 'desktop')[0], /Raster is not an element of desktop/)
})

test('a prop outside the element definition is invalid, key and children are not', () => {
  assert.deepEqual(validateTree(h('Text', { key: 'k', bold: true }, 'x'), 'terminal'), [])
  const problems = validateTree(h('Text', { bold: true, fontSize: 3 }, 'x'), 'terminal')
  assert.equal(problems.length, 1)
  assert.match(problems[0], /prop "fontSize" is not a prop of Text/)
  assert.match(validateTree(h('Box', { position: 'absolute', zIndex: 2 }), 'desktop')[0], /zIndex/)
})

test('Svg needs a non-empty alt, a source, and at most 131,072 characters', () => {
  assert.deepEqual(validateTree(h('Svg', { source: '<svg/>', alt: 'bar' }), 'desktop'), [])
  assert.match(validateTree(h('Svg', { source: '<svg/>', alt: '' }), 'desktop')[0], /non-empty alt/)
  assert.match(validateTree(h('Svg', { source: '<svg/>' }), 'desktop')[0], /non-empty alt/)
  assert.match(validateTree(h('Svg', { alt: 'a' }), 'desktop')[0], /source string/)
  assert.match(validateTree(h('Svg', { source: 'x'.repeat(131_073), alt: 'a' }), 'desktop')[0], /131073 characters/)
  assert.deepEqual(validateTree(h('Svg', { source: 'x'.repeat(131_072), alt: 'a', isInteractive: true }), 'desktop'), [])
})

test('problems carry the path; bad nodes are reported', () => {
  const tree = h('Box', {}, h('Box', {}, h('Nope', {})), 5, h('Text', { bad: 1 }))
  const problems = validateTree(tree, 'desktop')
  assert.equal(problems.length, 2)
  assert.ok(problems[0].startsWith('/Box[0]/Box[0]/Nope: '))
  assert.ok(problems[1].startsWith('/Box[2]/Text: '))
  assert.match(validateTree({ nope: 1 }, 'terminal')[0], /not an element/)
})

test('an unknown surface throws', () => {
  assert.throws(() => validateTree(h('Box'), 'tv'), /unknown surface/)
})
