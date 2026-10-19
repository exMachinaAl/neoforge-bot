// TERUJI TIRUAN: engine asli, executor terkendali, checkpoint terisolasi.
process.env.ARCADIA_TASKLOG = 'off'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs'), os = require('os'), path = require('path')
const { EventEmitter } = require('events')
const { mk } = require('./mock')
const { createEngine } = require('../engine')
const { createMissions } = require('../lifecycle/missions')
const { createDirector } = require('../orchestrator/director')
const tick = () => new Promise(resolve => setImmediate(resolve))
const step = () => ({ skill: 'nav.goto', params: { x: 1, z: 2 } })
function fixture (t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcadia-missions-'))
  const bot = mk(); bot.username = 'TestBot'
  let finish, active = null
  const calls = []
  const runner = { events: new EventEmitter(), current: () => active,
    skills: { 'nav.goto': { manifest: { name: 'nav.goto', description: 'Berjalan ke kebun', paramsSchema: { type: 'object', required: ['x','z'], properties: { x: { type: 'number' }, z: { type: 'number' } } } } } },
    run: (skill, params, meta) => { calls.push({ skill, params, meta }); active = meta; return new Promise(resolve => { finish = (ok = true, code = ok ? 'OK' : 'TIMEOUT') => { active = null; resolve({ ok, code }) } }) },
    abort: () => finish?.(false, 'ABORTED') }
  const engine = createEngine(bot, runner)
  const requests = []
  const director = { snapshot: () => ({ deny: [] }), ask: async (goal, options) => { requests.push(options); return { title: 'Hari yang indah untuk berkebun', reason: 'Tanah siap', tasks: [step()] } }, chat: async (text, context) => { requests.push(context); return { text: 'Mari merawat kebun bersama.' } } }
  const lifecycle = { plan: () => ({ title: 'Mengunjungi kebun', reasons: ['Pagi hari'], selectionScore: 70, taskDetails: [step(),step()] }) }
  const options = { engine, runner, director, lifecycle, dataDir }
  let missions = createMissions(options)
  t.after(() => { missions.close(); runner.abort(); engine.clear(); fs.rmSync(dataDir, { recursive: true, force: true }) })
  return { engine, runner, director, bot, calls, requests, dataDir, get missions () { return missions },
    restart: () => { missions.close(); missions = createMissions(options); return missions },
    finish: async (...args) => { finish(...args); await tick(); await tick() },
    current: () => missions.snapshot().missions[0] }
}
test('dependency, synchronous started event, and one active step with real engine', async t => {
  const f = fixture(t)
  const m = f.missions.create({ title: 'Berkebun', steps: [{ ...step(), id: 'later', dependsOn: ['first'] }, { ...step(), id: 'first', dependsOn: [] }] })
  f.missions.start(m.id)
  assert.equal(f.current().steps[1].status, 'running'); assert.equal(f.calls.length, 1)
  await f.finish(); assert.equal(f.current().steps[0].status, 'running'); assert.equal(f.calls.length, 2)
  await f.finish(); assert.equal(f.current().status, 'finished'); assert.equal(f.current().outcomeScore.total, 100)
})
test('failure blocks successors, replan preserves completed work and failed outcome', async t => {
  const f = fixture(t), m = f.missions.create({ steps: [step(),step(),step()] })
  f.missions.start(m.id); await f.finish(); await f.finish(false)
  assert.equal(f.current().status, 'blocked'); assert.equal(f.calls.length, 2)
  await f.missions.replan(m.id)
  assert.equal(f.current().steps[0].status, 'done'); assert.equal(f.current().revisions.length, 1)
  assert.equal(f.requests[0].proposeOnly, true); assert.equal(f.requests[0].missionContext[1].code, 'TIMEOUT')
  f.missions.start(m.id); await f.finish()
  assert.equal(f.current().status, 'finished'); assert.ok(f.current().outcomeScore.total < 100)
})
test('stop aborts current action without dispatching successor; explicit retry resumes', async t => {
  const f = fixture(t), m = f.missions.create({ steps: [step(),step()] })
  f.missions.start(m.id); f.missions.halt(m.id); await tick()
  assert.equal(f.current().status, 'paused'); assert.equal(f.calls.length, 1)
  assert.throws(() => f.missions.start(m.id), /periksa/)
  f.missions.resolve(m.id, 's1', 'retry'); f.missions.start(m.id); await f.finish(); await f.finish()
  assert.equal(f.current().status, 'finished')
})
test('restart leaves uncertain actions stopped and preserves memory/conversation per bot', async t => {
  const f = fixture(t), m = f.missions.create({ steps: [step(),step()] })
  f.missions.memory('Suka kebun'); await f.missions.chat('Halo')
  f.missions.start(m.id); f.restart()
  assert.equal(f.current().status, 'paused'); assert.equal(f.current().steps[0].status, 'uncertain')
  assert.equal(f.calls.length, 1); assert.equal(f.missions.snapshot().conversation.length, 2)
  assert.ok(f.missions.snapshot().memories.some(x => x.text === 'Suka kebun'))
  assert.throws(() => f.missions.start(m.id), /periksa/)
  await f.finish() // Late result from old process/engine must not resolve uncertain persisted action.
  assert.equal(f.current().steps[0].status, 'uncertain')
  f.missions.resolve(m.id, 's1', 'done'); f.missions.start(m.id); await f.finish()
  assert.equal(f.calls.length, 2); assert.equal(f.current().status, 'finished')
})
test('reject invalid graph/params and enforce one mission at a time', async t => {
  const f = fixture(t)
  assert.throws(() => f.missions.create({ steps: [{ ...step(), id: 'a', dependsOn: ['a'] }] }), /melingkar/)
  assert.throws(() => f.missions.create({ steps: [{ ...step(), dependsOn: ['missing'] }] }), /tidak ditemukan/)
  assert.throws(() => f.missions.create({ steps: [{ skill: 'nav.goto', params: { x: 'oops' } }] }), /params/)
  const a = f.missions.create({ steps: [step()] }), b = f.missions.create({ steps: [step()] })
  f.missions.start(a.id); assert.throws(() => f.missions.start(b.id), /lain masih berjalan/)
  f.engine.killswitch(); await tick(); assert.equal(f.missions.snapshot().missions.find(m => m.id === a.id).status, 'paused')
  assert.equal(f.calls.length, 1)
})
test('LLM and offline generators use the same runner, no legacy auto-approval', async t => {
  const f = fixture(t)
  const a = await f.missions.generate({ source: 'offline', run: true }); assert.equal(a.title, 'Mengunjungi kebun')
  await f.finish(); await f.finish()
  const b = await f.missions.generate({ goal: 'Berkebun', run: true }); assert.equal(b.source, 'llm')
  assert.deepEqual(f.requests[0], { proposeOnly: true }); await f.finish()
  const d = createDirector({ bot: f.bot, runner: f.runner, engine: f.engine,
    llm: async () => ({ text: JSON.stringify({ title: 'Rencana saja', reason: 'Siap', tasks: [step()] }), usage: { in: 1, out: 1 } }),
    cfg: { provider: 'ollama', url: 'http://unused', model: 'test', rpm: 10, needsKey: false }, deny: [], autoApprove: ['nav.goto'] })
  const decision = await d.ask('Tes', { proposeOnly: true })
  assert.equal(decision.title, 'Rencana saja'); assert.equal(decision.tasks[0].status, 'delegated')
  assert.equal(f.calls.length, 3); assert.throws(() => d.approve(decision.tasks[0].pid), /tidak ditemukan/)
  await d.chat('Halo'); assert.equal(f.calls.length, 3)
})
test('late LLM response is discarded after cancellation', async t => {
  const f = fixture(t), m = f.missions.create({ steps: [step()] })
  let respond; f.director.ask = () => new Promise(resolve => { respond = resolve })
  const pending = f.missions.generate({ goal: 'Lagi' }); f.missions.halt(m.id, true)
  respond({ tasks: [step()] }); await assert.rejects(pending, /dibatalkan/)
  assert.equal(f.missions.snapshot().missions.length, 1)
})
test('checkpoint failure prevents enqueue', t => {
  const f = fixture(t), m = f.missions.create({ steps: [step()] })
  fs.mkdirSync(path.join(f.dataDir, 'missions', 'TestBot.json.tmp'))
  assert.throws(() => f.missions.start(m.id), /Checkpoint gagal/)
  assert.equal(f.calls.length, 0); assert.ok(f.missions.snapshot().storageError)
})
