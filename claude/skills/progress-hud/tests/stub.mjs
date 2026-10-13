// Derived from zycck/claude-mods plugins/plan-progress/tests/stub.mjs (commit 549ecee), MIT License, (c) 2026 Kirill Serditov. Modified for progress-hud. See THIRD_PARTY_NOTICES.md.
// stands in for the 'claude-code' runtime import in the transpiled hooks.
// read and update go through $.state.get / $.state.set like the library does: update re-reads and retries when the version moved
export const atom = (ref, initial, options) => ({ ref, initial, shape: options?.shape })

export const read = async ($, a) => {
  const { value } = await $.state.get(a.ref)
  return value === undefined ? a.initial : value
}

export const update = async ($, a, change) => {
  for (let i = 0; i < 20; i++) {
    const { value, version } = await $.state.get(a.ref)
    const next = change(value === undefined ? a.initial : value)
    const set = await $.state.set(a.ref, next, { ifVersion: version })
    if (set.isSet) return next
  }
  throw new Error('update: the version kept moving')
}
