process.env.ARCADIA_TASKLOG = 'off'
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { EventEmitter } = require('node:events')
const { mk, mkBlock, mcData } = require('./mock')
const { createRunner } = require('../skills')
const { createEngine } = require('../engine')
const { createAgent } = require('../agent/runtime')
const { createDirector } = require('../orchestrator/director')
const { createSandbox, evaluate, commandSpec } = require('../agent/sandbox')
const { sandboxPolicy } = require('../agent/permissions')
const pause = ms => new Promise(r => setTimeout(r, ms))
async function until (predicate) {
  for (let i = 0; i < 400; i++) { if (predicate()) return; await pause(10) }
  throw Error('timeout menunggu kondisi')
}
const skill = (name, params = {}) => ({ kind: 'skill', reason: 'Langkah tujuan', skill: name, params })
const finish = ctx => ({ kind: 'finish', reason: 'Hasil native mengonfirmasi tujuan', evidence: [ctx.history.findLast(s => s.status === 'done' && s.decision.kind === 'skill').id] })
function fixture (t, decide, options = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcadia-agent-'))
  const bot = mk(); bot.username = 'AgentTest'
  const native = createRunner(bot), calls = [], contexts = []
  let active = null, abort = () => {}
  const runner = { skills: native.skills, events: new EventEmitter(), current: () => active,
    abort: () => abort(), run: async (name, params, meta) => {
      calls.push({ name, params, meta }); active = meta
      try {
        return await Promise.race([
          Promise.resolve().then(() => options.execute?.(name, params, calls.length) || { ok: true, code: 'OK', data: { verified: true } }),
          new Promise(resolve => { abort = () => resolve({ ok: false, code: 'ABORTED' }) })
        ])
      } finally { active = null }
    } }
  const engine = createEngine(bot, runner)
  const director = { snapshot: () => ({ deny: options.deny || [] }),
    decide: async (ctx, opt) => { contexts.push(ctx); return decide(ctx, contexts.length, opt) } }
  const args = { engine, runner, director, dataDir, env: { ARCADIA_AGENT_PERMISSION: options.mode || 'full' } }
  let agent = createAgent(args)
  t.after(() => { agent.close(); engine.killswitch(); assert.ok(dataDir.startsWith(path.join(os.tmpdir(), 'arcadia-agent-'))); fs.rmSync(dataDir, { recursive: true, force: true }) })
  return { bot, runner, engine, director, calls, contexts, dataDir, args,
    get agent () { return agent }, restart: () => { agent.close(); agent = createAgent(args) },
    goal: () => agent.snapshot().goals[0] }
}

test('full: kegagalan crafting -> simpan barang -> crafting -> mining -> verifikasi tanpa persetujuan', async t => {
  const f = fixture(t, (ctx, n) => [
    skill('craft.item', { item: 'wooden_pickaxe' }),
    skill('inv.store', { includeModded: true, keep: ['stick', 'oak_planks'] }),
    skill('craft.item', { item: 'wooden_pickaxe' }),
    skill('mine.collect', { block: 'stone', count: 4 })
  ][n - 1] || finish(ctx), {
    execute: (name, params, n) => n === 1 ? { ok: false, code: 'PRECONDITION_FAILED',
      error: 'jendela meja crafting tidak terbaca; inv.store includeModded=true', data: { degraded: true } } : { ok: true, code: 'OK', data: { collected: 4 } }
  })
  f.agent.start({ goal: 'Kumpulkan 4 batu' })
  await until(() => f.goal().status === 'finished')
  assert.deepEqual(f.calls.map(c => c.name), ['craft.item', 'inv.store', 'craft.item', 'mine.collect'])
  assert.equal(f.contexts[1].history[0].result.data.degraded, true)
  assert.match(f.contexts[1].history[0].result.error, /inv.store/)
  assert.equal(f.contexts.every(c => c.goal === 'Kumpulkan 4 batu'), true)
  const experiences = f.agent.experiences()
  assert.ok(experiences.some(e => e.type === 'goal.finished'))
  assert.equal(experiences.some(e => e.type === 'permission.request'), false)
})

test('semi: izin cakupan bertahan, cakupan baru meminta persetujuan', async t => {
  const f = fixture(t, (ctx, n) => n === 1 ? skill('craft.item', { item: 'stick' }) :
    n === 2 ? skill('inv.store', { includeModded: true }) :
      n === 3 ? skill('craft.item', { item: 'wooden_pickaxe' }) : finish(ctx), { mode: 'semi' })
  const g = f.agent.start({ goal: 'Siapkan alat' })
  await until(() => f.goal().status === 'awaiting_approval')
  assert.equal(f.calls.length, 0)
  f.agent.approve(g.id)
  await until(() => f.calls.length === 1 && f.goal().status === 'awaiting_approval')
  assert.deepEqual(f.goal().requestedScopes, ['inventory'])
  f.agent.approve(g.id)
  await until(() => f.goal().status === 'finished')
  assert.equal(f.calls.length, 3)
  assert.equal(f.agent.experiences().filter(e => e.type === 'owner.approve').length, 2)
})

test('observasi tidak mengeksekusi; perubahan mode menjeda; stop membatalkan keputusan terlambat', async t => {
  let resolve, count = 0
  const f = fixture(t, () => ++count === 1 ? skill('nav.goto', { x: 4, z: 4 }) : new Promise(r => { resolve = r }), { mode: 'observe' })
  const g = f.agent.start({ goal: 'Jalan' })
  await until(() => f.goal().status === 'awaiting_approval')
  assert.throws(() => f.agent.approve(g.id), /persetujuan/)
  f.agent.permissions({ mode: 'full' })
  assert.equal(f.goal().status, 'paused')
  f.agent.resume(g.id)
  await until(() => !!resolve)
  f.agent.stop(g.id)
  resolve(skill('nav.goto', { x: 9, z: 9 }))
  await pause(30)
  assert.equal(f.calls.length, 0); assert.equal(f.goal().status, 'paused')
})

test('killswitch native dan downgrade izin menghentikan aksi aktif', async t => {
  const f = fixture(t, () => skill('nav.goto', { x: 4, z: 4 }), { execute: () => new Promise(() => {}) })
  f.agent.start({ goal: 'Jalan' })
  await until(() => f.calls.length === 1)
  f.agent.permissions({ mode: 'observe' })
  await until(() => f.goal().steps[0].status === 'failed')
  assert.equal(f.goal().status, 'paused'); assert.equal(f.contexts.length, 1)
  f.agent.permissions({ mode: 'full' }); f.agent.resume(f.goal().id)
  await until(() => f.calls.length === 2)
  f.engine.killswitch()
  await pause(20)
  assert.equal(f.goal().status, 'paused'); assert.equal(f.calls.length, 2)
})

test('restart mempertahankan tujuan dan mewajibkan observasi sebelum aksi dunia', async t => {
  let phase = 0
  const f = fixture(t, ctx => {
    if (phase === 0) return skill('nav.goto', { x: 2, z: 2 })
    if (phase++ === 1) return skill('nav.goto', { x: 3, z: 3 }) // Harus ditolak.
    if (phase === 3) return skill('world.inspect')
    return finish(ctx)
  }, { execute: name => name === 'nav.goto' ? new Promise(() => {}) : { ok: true, code: 'OK' } })
  const g = f.agent.start({ goal: 'Periksa tujuan' })
  await until(() => f.calls.length === 1)
  f.restart(); phase = 1
  await pause(30)
  assert.equal(f.goal().status, 'paused')
  assert.equal(f.goal().steps[0].status, 'uncertain')
  f.agent.resume(g.id)
  await until(() => f.goal().status === 'finished')
  assert.deepEqual(f.calls.map(c => c.name), ['nav.goto', 'world.inspect'])
  assert.ok(f.goal().steps.some(s => s.result?.code === 'INVALID_DECISION'))
})

test('rate limit ditunggu; batas keputusan dan tiga kegagalan identik menghentikan loop', async t => {
  const f = fixture(t, (ctx, n) => {
    if (n === 1) throw Object.assign(Error('rate'), { status: 429, retryAfterMs: 20 })
    return skill('craft.item', { item: 'stick' })
  }, { execute: () => ({ ok: false, code: 'PRECONDITION_FAILED', error: 'bahan kurang' }) })
  f.agent.start({ goal: 'Buat stick' })
  await until(() => f.goal().status === 'blocked')
  assert.equal(f.calls.length, 3); assert.equal(f.goal().decisions, 3)
  assert.match(f.goal().reason, /Tiga kegagalan/)
  f.agent.stop(f.goal().id, true)
  f.agent.start({ goal: 'Terbatas', maxDecisions: 1 })
  await until(() => f.goal().status === 'blocked')
  assert.equal(f.goal().decisions, 1)
})

test('tool dibuat, diuji, dipakai; output task divalidasi dan gagal membatalkan sisa metode', async t => {
  const f = fixture(t, (ctx, n) => {
    if (n === 1) return { kind: 'tool.create', reason: 'Metode perjalanan', name: 'rute',
      code: 'function run(input,world){return {tasks:[{skill:"nav.goto",params:{x:1,z:1}},{skill:"nav.goto",params:{x:2,z:2}}]}}' }
    if (n === 2) return { kind: 'tool.run', reason: 'Gunakan metode', name: 'rute', input: {} }
    if (n === 3) return skill('world.inspect')
    return finish(ctx)
  }, { execute: (name, params) => name === 'nav.goto' ? { ok: false, code: 'NO_PATH', error: 'jalan tertutup' } : { ok: true, code: 'OK' } })
  f.agent.start({ goal: 'Uji metode' })
  await until(() => f.goal().status === 'finished')
  assert.deepEqual(f.calls.map(c => c.name), ['nav.goto', 'world.inspect'])
  assert.equal(f.agent.snapshot().tools[0].tested, true)
  assert.equal(f.goal().steps[0].result.data.testOutput.tasks.length, 2)
})

test('tool tidak bisa menyelundupkan skill diblokir, dan finish perlu evidence native', async t => {
  const f = fixture(t, (ctx, n) => n === 1
    ? { kind: 'finish', reason: 'Klaim palsu', evidence: ['palsu'] }
    : n === 2 ? { kind: 'tool.create', reason: 'Metode', name: 'bad', code: 'function run(){return {tasks:[{skill:"nav.goto",params:{x:1,z:1}},{skill:"inv.store",params:{}}]}}' }
      : n === 3 ? { kind: 'tool.run', name: 'bad', reason: 'Coba' }
        : { kind: 'ask', reason: 'Butuh arahan', question: 'Apa tujuan berikutnya?' }, { deny: ['inv.store'] })
  f.agent.start({ goal: 'Uji validasi' })
  await until(() => f.goal().status === 'needs_input')
  assert.equal(f.calls.length, 0)
  assert.equal(f.goal().steps[0].result.code, 'EVIDENCE_REQUIRED')
  assert.equal(f.goal().steps[2].result.code, 'SANDBOX_FAILED')
})

test('checkpoint gagal mencegah tindakan', t => {
  const f = fixture(t, () => skill('nav.goto', { x: 1, z: 1 }))
  fs.mkdirSync(path.join(f.dataDir, 'agent', 'AgentTest', 'checkpoint.json.tmp'))
  assert.throws(() => f.agent.start({ goal: 'Jalan' }), /Checkpoint/)
  assert.equal(f.calls.length, 0)
})

test('sandbox WASM membatasi API, output, CPU dan abort; tool bertahan setelah restart', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcadia-sandbox-'))
  t.after(() => { assert.ok(dir.startsWith(path.join(os.tmpdir(), 'arcadia-sandbox-'))); fs.rmSync(dir, { recursive: true, force: true }) })
  const code = 'function run(input,world){return {x:input.x+1, require:typeof require, process:typeof process, fetch:typeof fetch}}'
  assert.deepEqual(await evaluate(code, { x: 1 }, {}), { x: 2, require: 'undefined', process: 'undefined', fetch: 'undefined' })
  await assert.rejects(evaluate('function run(){return process.env}', {}, {}), /process/)
  await assert.rejects(evaluate('function run(){while(true){}}', {}, {}), /interrupt|timeout/i)
  await assert.rejects(evaluate('function run(){return "x".repeat(40000)}', {}, {}), /32 KB/)
  const ac = new AbortController(), waiting = evaluate('function run(){while(true){}}', {}, {}, ac.signal)
  ac.abort(); await assert.rejects(waiting, /ABORTED/)
  const sandbox = createSandbox({ dataDir: dir, env: {} })
  await sandbox.define({ name: 'increment', code, input: { x: 3 } }, {})
  const fresh = createSandbox({ dataDir: dir, env: {} })
  assert.equal((await fresh.run('increment', { x: 7 }, {})).x, 8)
  await assert.rejects(sandbox.define({ name: '../escape', code }, {}), /tidak valid/)
})

test('flag unsafe di production hanya warning; command production selalu container', () => {
  const policy = sandboxPolicy({ ARCADIA_MODE: 'production', ARCADIA_DEBUG_UNSAFE_SANDBOX: 'true' })
  assert.equal(policy.unsafeHost, false); assert.match(policy.warning, /diabaikan/)
  const spec = commandSpec('echo hello', policy, {})
  assert.equal(spec.bin, 'docker')
  for (const arg of ['--network=none', '--read-only', '--cap-drop=ALL', '--pull=never']) assert.ok(spec.args.includes(arg))
  assert.equal(spec.args.some(a => a.includes('docker.sock') || a.startsWith('--volume')), false)
  const debug = sandboxPolicy({ ARCADIA_MODE: 'debug', ARCADIA_DEBUG_UNSAFE_SANDBOX: 'true' })
  assert.equal(debug.unsafeHost, true); assert.equal(commandSpec('echo hello', debug).unsafe, true)
})

test('Director agent memakai kontrak terstruktur dan hasil native, tanpa key di konteks', async t => {
  const f = fixture(t, () => {})
  let sent
  const director = createDirector({ bot: f.bot, runner: f.runner, engine: f.engine, auditFile: 'off',
    cfg: { key: 'TEST-SECRET', rpm: 10, provider: 'openai', model: 'mock' },
    llm: async (_, request) => { sent = request; return { text: JSON.stringify(skill('inv.store', { includeModded: true })), usage: { in: 2, out: 3 } } } })
  const out = await director.decide({ goal: 'Mine batu', history: [{ result: { error: 'Simpan item modded ke chest' } }] })
  assert.equal(out.kind, 'skill'); assert.equal(sent.tool.name, 'agent_decision')
  assert.match(sent.user, /Simpan item modded/); assert.equal(sent.user.includes('TEST-SECRET'), false)
})

test('world.inspect dan world.place memeriksa dunia dan konfirmasi, tidak menimpa blok', async () => {
  const b = mk({ inv: { oak_planks: 2 }, blocks: [mkBlock('dirt', 2, 63, 0), mkBlock('air', 2, 64, 0), mkBlock('chest', 4, 64, 0)] })
  const runner = createRunner(b)
  let out = await runner.run('world.inspect', { blocks: ['minecraft:chest'], recipes: ['stick'], positions: [{ x: 2, y: 64, z: 0 }] })
  assert.equal(out.ok, true); assert.equal(out.data.nearby[0].name, 'chest'); assert.ok(out.data.recipes[0].recipes.length)
  b.pathfinder.goto = async () => {}
  b.placeBlock = async (ref, face) => {
    const dest = ref.position.plus(face)
    b._blocks.splice(b._blocks.findIndex(x => x.position.equals(dest)), 1, mkBlock('oak_planks', dest.x, dest.y, dest.z))
  }
  out = await runner.run('world.place', { block: 'oak_planks', x: 2, y: 64, z: 0 })
  assert.equal(out.ok, true, JSON.stringify(out))
  out = await runner.run('world.place', { block: 'oak_planks', x: 2, y: 64, z: 0 })
  assert.equal(out.data.alreadyPresent, true)
  out = await runner.run('world.place', { block: 'oak_planks', x: 4, y: 64, z: 0 })
  assert.equal(out.ok, false)
})
