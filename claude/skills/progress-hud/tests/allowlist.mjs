// DESIGN 9.3: what a mod may call on $. One list, read by the stub engine (anything else throws), by the validate check
// (security.test.mjs, C1) and by the static scan (C2)
export const ALLOWED = [
  'tool.register', 'command.register',
  'ui.resolve', 'ui.toast', 'ui.status', 'ui.log', 'ui.open', 'ui.close',
  'state.get', 'state.set', // through atom / read / update
  'store.get', 'store.set', 'store.delete', 'store.keys',
  'clock.now', 'clock.after', 'clock.every',
  'audio.play',
  'session.id', 'session.cwd', 'session.root', 'session.repo', 'session.usage', 'session.surfaces',
  'agent.list',
  'config.list', // P1: the theme row, read only
  'env.get', // "LANG" only
]
