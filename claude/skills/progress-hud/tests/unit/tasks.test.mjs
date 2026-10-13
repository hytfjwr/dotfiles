// A4: the mirror of TaskCreate / TaskUpdate / TodoWrite (DESIGN 5.3)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newBar } from '../.build/core/model.mjs'
import { TASKS_TITLE, onTaskCreate, onTaskUpdate, onTodoWrite } from '../.build/core/tasks.mjs'
import { ZERO as M0, ctx } from '../fixtures.mjs'

const M1 = { input: 5, output: 50, cacheRead: 0, cacheWrite: 0, costUsd: 1.5 }
const create = (bar, subject, id, c = ctx()) => onTaskCreate(bar, { subject, description: 'd' }, { task: { id, subject } }, c)
const upd = (bar, taskId, patch, c = ctx(), result = { success: true, taskId }) => onTaskUpdate(bar, { taskId, ...patch }, result, c)
const todo = (content, status = 'pending', activeForm = `${content}ing`) => ({ content, status, activeForm })
const steps = bar => bar.stages.flatMap(s => s.steps).map(s => `${s.title}:${s.status}`).join(' ')
const three = () => {
  let b = null
  for (const [s, id] of [['A', '1'], ['B', '2'], ['C', '3']]) b = create(b, s, id)
  return b
}

test('TaskCreate x3 makes one tasks bar with a pending step per task', () => {
  const b = three()
  assert.equal(b.id, 'tasks')
  assert.equal(b.source, 'tasks')
  assert.equal(b.kind, 'todo')
  assert.equal(b.title, 'タスク')
  assert.equal(b.state, 'running')
  assert.deepEqual(b.stages, [{ name: 'タスク', steps: [{ title: 'A', status: 'pending', taskId: '1' }, { title: 'B', status: 'pending', taskId: '2' }, { title: 'C', status: 'pending', taskId: '3' }] }])
  assert.equal(b.startedAt, 1000)
  assert.deepEqual(b.meterStart, M0)
  assert.equal(b.endedAt, null)
})

test('TaskCreate: the first task starts the bar with the clock and the meter of that moment', () => {
  const b = create(null, 'A', '1', ctx(7000, { meter: M1 }))
  assert.equal(b.startedAt, 7000)
  assert.deepEqual(b.meterStart, M1)
  const later = create(b, 'B', '2', ctx(9000, { meter: { ...M1, output: 99 } }))
  assert.equal(later.startedAt, 7000, 'a second task does not restart it')
  assert.deepEqual(later.meterStart, M1)
})

test('TaskCreate: words follow the language, ids may be numbers, the subject may come from the result', () => {
  assert.equal(create(null, 'A', '1', ctx(1, { lang: 'en' })).title, 'Tasks')
  assert.equal(TASKS_TITLE.ja, 'タスク')
  assert.equal(onTaskCreate(null, { subject: 'A' }, { task: { id: 7, subject: 'A' } }, ctx()).stages[0].steps[0].taskId, '7')
  assert.equal(onTaskCreate(null, {}, { task: { id: '1', subject: 'From result' } }, ctx()).stages[0].steps[0].title, 'From result')
})

test('TaskCreate: an unexpected shape changes nothing', () => {
  const b = three()
  for (const [input, result] of [[{ subject: 'X' }, null], [{ subject: 'X' }, {}], [{ subject: 'X' }, { task: {} }], [{ subject: 'X' }, { task: { id: '' } }], [{}, { task: { id: '9' } }], [null, 'text'], ['x', 5]]) {
    assert.equal(onTaskCreate(b, input, result, ctx()), b)
  }
  assert.equal(onTaskCreate(null, { subject: 'X' }, null, ctx()), null)
})

test('TaskCreate: the same task id twice is one step; more than 80 tasks are not added', () => {
  const b = three()
  assert.equal(create(b, 'A again', '1'), b)
  let big = null
  for (let i = 0; i < 80; i++) big = create(big, `t${i}`, String(i))
  assert.equal(create(big, 'one more', 'x'), big)
})

test('TaskUpdate: in_progress is active and names the stage by its activeForm; completed is done with doneAt', () => {
  let b = upd(three(), '1', { status: 'in_progress', activeForm: 'Reading code' }, ctx(2000))
  assert.equal(steps(b), 'A:active B:pending C:pending')
  assert.equal(b.stages[0].name, 'Reading code')
  b = upd(b, '1', { status: 'completed' }, ctx(3000))
  assert.equal(steps(b), 'A:done B:pending C:pending')
  assert.equal(b.stages[0].steps[0].doneAt, 3000)
  assert.equal(b.stages[0].name, 'タスク', 'nothing in progress: the word for tasks')
  assert.equal(b.state, 'running')
})

test('TaskUpdate: a second task in progress without an activeForm keeps the stage name', () => {
  let b = upd(three(), '1', { status: 'in_progress', activeForm: 'Reading code' })
  b = upd(b, '2', { status: 'in_progress' })
  assert.equal(b.stages[0].name, 'Reading code')
})

test('TaskUpdate: back to pending drops doneAt; a new subject renames the step; other fields change nothing', () => {
  let b = upd(three(), '1', { status: 'completed' }, ctx(2000))
  b = upd(b, '1', { status: 'pending' })
  assert.equal(b.stages[0].steps[0].doneAt, undefined)
  b = upd(b, '2', { subject: '  New   name ' })
  assert.equal(b.stages[0].steps[1].title, 'New name')
  assert.equal(upd(b, '2', { description: 'only a description', owner: 'x' }), b)
  assert.equal(upd(b, '2', { status: 'bogus' }), b)
})

test('TaskUpdate: deleted removes the step; the last one removed removes the bar', () => {
  let b = upd(three(), '2', { status: 'deleted' })
  assert.equal(steps(b), 'A:pending C:pending')
  b = upd(b, '1', { status: 'deleted' })
  assert.equal(upd(b, '3', { status: 'deleted' }), null)
})

test('TaskUpdate: an unknown task, a failed update, no bar, or a bad shape change nothing', () => {
  const b = three()
  assert.equal(upd(b, '99', { status: 'completed' }), b)
  assert.equal(upd(b, '1', { status: 'completed' }, ctx(), { success: false, taskId: '1' }), b)
  assert.equal(upd(null, '1', { status: 'completed' }), null)
  assert.equal(onTaskUpdate(b, null, {}, ctx()), b)
  assert.equal(onTaskUpdate(b, { status: 'completed' }, {}, ctx()), b)
  assert.equal(onTaskUpdate(b, { taskId: '1', status: 'completed' }, null, ctx()).stages[0].steps[0].status, 'done', 'a result with no success flag is not a failure')
})

test('all tasks completed: the bar is done with its end and meter; reopening a task runs it again', () => {
  let b = three()
  for (const id of ['1', '2']) b = upd(b, id, { status: 'completed' })
  assert.equal(b.state, 'running')
  b = upd(b, '3', { status: 'completed' }, ctx(5000, { meter: M1 }))
  assert.equal(b.state, 'done')
  assert.equal(b.endedAt, 5000)
  assert.deepEqual(b.meterEnd, M1)
  const again = upd(b, '3', { status: 'in_progress', activeForm: 'Again' }, ctx(6000, { meter: { ...M1, output: 70 } }))
  assert.equal(again.state, 'running')
  assert.equal(again.endedAt, null)
  assert.equal(again.meterEnd, null)
  assert.equal(again.startedAt, 1000)
})

test('TaskUpdate keeps the state a question set (needs_input), and the strips on the bar', () => {
  const run = { id: 'ag', title: 'x', state: 'running', tool: '', startedAt: 1, endedAt: null, depth: 0, calls: 0, errors: 0, streak: 0, output: 0 }
  const b = { ...three(), state: 'needs_input', agents: [run] }
  const next = upd(b, '1', { status: 'in_progress' })
  assert.equal(next.state, 'needs_input')
  assert.deepEqual(next.agents, [run])
})

test('TaskCreate after the bar is done starts a new bar: old tasks dropped, clock and meter taken again, strips kept', () => {
  const run = { id: 'ag', title: 'x', state: 'done', tool: '', startedAt: 1, endedAt: 2, depth: 0, calls: 0, errors: 0, streak: 0, output: 0 }
  let b = create(null, 'Old', '1')
  b = { ...upd(b, '1', { status: 'completed' }, ctx(2000)), agents: [run], agentsDoneAt: 2 }
  assert.equal(b.state, 'done')
  const next = create(b, 'New', '2', ctx(9000, { meter: M1 }))
  assert.equal(steps(next), 'New:pending')
  assert.equal(next.state, 'running')
  assert.equal(next.startedAt, 9000)
  assert.deepEqual(next.meterStart, M1)
  assert.equal(next.endedAt, null)
  assert.deepEqual(next.agents, [run])
  assert.equal(next.agentsDoneAt, 2)
})

test('TodoWrite replaces the whole list; in-progress activeForm names the stage', () => {
  let b = onTodoWrite(null, { todos: [todo('Read', 'completed'), todo('Fix', 'in_progress', 'Fixing the bug'), todo('Test')] }, ctx(4000))
  assert.equal(steps(b), 'Read:done Fix:active Test:pending')
  assert.equal(b.stages[0].name, 'Fixing the bug')
  assert.equal(b.stages[0].steps[0].doneAt, 4000)
  assert.equal(b.source, 'tasks')
  assert.equal(b.kind, 'todo')
  assert.equal(b.startedAt, 4000)
  b = onTodoWrite(b, { todos: [todo('Fix', 'completed'), todo('Ship', 'in_progress')] }, ctx(5000))
  assert.equal(steps(b), 'Fix:done Ship:active')
  assert.equal(b.stages[0].name, 'Shiping')
  assert.equal(b.startedAt, 4000, 'the bar goes on')
})

test('TodoWrite: a content that was done keeps its doneAt (also across widths); a new one done now gets the time', () => {
  let b = onTodoWrite(null, { todos: [todo('ＡＰＩ', 'completed'), todo('B')] }, ctx(1000))
  b = onTodoWrite(b, { todos: [todo('API', 'completed'), todo('B', 'completed'), todo('C', 'completed')] }, ctx(8000))
  assert.deepEqual(b.stages[0].steps.map(s => s.doneAt), [1000, 8000, 8000])
  assert.equal(b.state, 'done')
  assert.equal(b.endedAt, 8000)
})

test('TodoWrite: an empty or unreadable list changes nothing', () => {
  const b = onTodoWrite(null, { todos: [todo('A')] }, ctx())
  for (const input of [{ todos: [] }, { todos: 'x' }, {}, null, 'x', { todos: [{ content: '' }, null, 5] }]) assert.equal(onTodoWrite(b, input, ctx()), b)
  assert.equal(onTodoWrite(null, { todos: [] }, ctx()), null)
})

test('TodoWrite: an item with an unknown status is pending; items without content are skipped', () => {
  const b = onTodoWrite(null, { todos: [{ content: 'A', status: 'weird' }, { status: 'completed' }, todo('B', 'in_progress')] }, ctx())
  assert.equal(steps(b), 'A:pending B:active')
})

test('TodoWrite: the same list again is no change; a new list with open work on a done bar starts it again', () => {
  const done = onTodoWrite(null, { todos: [todo('A', 'completed')] }, ctx(1000))
  assert.equal(done.state, 'done')
  assert.equal(onTodoWrite(done, { todos: [todo('A', 'completed')] }, ctx(2000)), done)
  const next = onTodoWrite(done, { todos: [todo('A', 'completed'), todo('B')] }, ctx(9000, { meter: M1 }))
  assert.equal(next.state, 'running')
  assert.equal(next.startedAt, 9000)
  assert.deepEqual(next.meterStart, M1)
  assert.equal(steps(next), 'A:done B:pending')
  const live = onTodoWrite(null, { todos: [todo('A'), todo('B')] }, ctx())
  assert.equal(onTodoWrite(live, { todos: [todo('A'), todo('B')] }, ctx(2000)), live)
})

test('TodoWrite: at most 80 steps, titles cut at 120', () => {
  const b = onTodoWrite(null, { todos: Array.from({ length: 100 }, (_, i) => todo(i === 0 ? 'x'.repeat(300) : `t${i}`)) }, ctx())
  assert.equal(b.stages[0].steps.length, 80)
  assert.equal(b.stages[0].steps[0].title.length, 120)
})

test('the reducers never change what they are given', () => {
  const deepFreeze = o => {
    if (o && typeof o === 'object') Object.values(o).forEach(deepFreeze)
    return Object.freeze(o)
  }
  const b = deepFreeze(three())
  const input = deepFreeze({ todos: [todo('A', 'completed')] })
  assert.doesNotThrow(() => {
    create(b, 'D', '4')
    upd(b, '1', { status: 'completed' })
    upd(b, '1', { status: 'deleted' })
    onTodoWrite(b, input, ctx())
    onTodoWrite(null, input, ctx())
  })
  assert.equal(newBar('tasks', 'tasks', 0, M0).id, 'tasks')
})
