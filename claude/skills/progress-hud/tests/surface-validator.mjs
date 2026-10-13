// checks a tree a hook drew against the element table of the surface and the props each element takes,
// so a stub-engine render fails here instead of being thrown away by the real engine.
// Element names and props come from the element definitions in plugin-authoring/types/claude-code.d.ts
// (Elements, BoxProps, TextProps, ...); regenerate PROPS from there when the build changes.
// A tree is what the stub's h() returns: { type: 'Box', props, children }.

const PROPS = {
  Box: ['hover', 'position', 'top', 'left', 'right', 'bottom', 'flexDirection', 'flexGrow', 'flexShrink', 'flexWrap', 'alignItems', 'alignSelf', 'justifyContent', 'gap', 'columnGap', 'rowGap', 'width', 'height', 'minWidth', 'minHeight', 'margin', 'marginX', 'marginY', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'padding', 'paddingX', 'paddingY', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'borderStyle', 'borderColor', 'borderDimColor', 'backgroundColor', 'overflow', 'display'],
  Text: ['hover', 'color', 'backgroundColor', 'dimColor', 'bold', 'italic', 'underline', 'strikethrough', 'inverse', 'wrap'],
  Button: ['label', 'hotkey', 'action', 'plain', 'dimColor', 'variant', 'role', 'autoFocus', 'hover', 'onPress'],
  Input: ['label', 'placeholder', 'value', 'submitLabel', 'autoFocus', 'onInput', 'onSubmit'],
  Select: ['label', 'options', 'value', 'autoFocus', 'onSelect'],
  Link: ['href', 'label'],
  Code: ['source', 'language', 'path', 'startLine', 'format', 'wrap'],
  Markdown: ['text', 'dimColor', 'onLinkPress', 'pressableLinks'],
  Client: ['module', 'props', 'width', 'height', 'flexGrow'],
  Raster: ['columns', 'rows', 'cells'],
  Image: ['source', 'columns', 'rows', 'alt'],
  Svg: ['source', 'alt', 'width', 'height', 'isInteractive'],
}

// the Elements table of each surface
export const TABLE = {
  terminal: ['Box', 'Text', 'Button', 'Input', 'Select', 'Link', 'Code', 'Markdown', 'Client', 'Raster', 'Image'],
  desktop: ['Box', 'Text', 'Button', 'Input', 'Select', 'Svg', 'Link', 'Code', 'Markdown', 'Client'],
  mobile: ['Box', 'Text', 'Button', 'Svg', 'Link', 'Code', 'Markdown'],
  vscode: ['Box', 'Text', 'Button', 'Input', 'Select', 'Svg', 'Link', 'Code', 'Markdown'],
}

// every element takes key (a JSX attribute) and children
const COMMON = ['key', 'children']
const SVG_SOURCE_MAX = 131_072

// the problems found, one string each with the path to the element; empty when the tree is valid
export function validateTree(tree, surface) {
  const table = TABLE[surface]
  if (!table) throw new Error(`unknown surface "${surface}"`)
  const problems = []
  const walk = (node, path) => {
    if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return
    if (Array.isArray(node)) return node.forEach((c, i) => walk(c, `${path}[${i}]`))
    if (typeof node !== 'object' || typeof node.type !== 'string') return void problems.push(`${path}: not an element (${typeof node.type})`)
    const here = `${path}/${node.type}`
    if (!table.includes(node.type)) return void problems.push(`${here}: ${node.type} is not an element of ${surface}`)
    const props = node.props ?? {}
    for (const key of Object.keys(props)) {
      if (!COMMON.includes(key) && !PROPS[node.type].includes(key)) problems.push(`${here}: prop "${key}" is not a prop of ${node.type}`)
    }
    if (node.type === 'Svg') {
      if (typeof props.alt !== 'string' || props.alt.trim() === '') problems.push(`${here}: Svg needs a non-empty alt`)
      if (typeof props.source !== 'string') problems.push(`${here}: Svg needs a source string`)
      else if (props.source.length > SVG_SOURCE_MAX) problems.push(`${here}: Svg source is ${props.source.length} characters (max ${SVG_SOURCE_MAX})`)
    }
    walk(node.children ?? [], here)
  }
  walk(tree, '')
  return problems
}
