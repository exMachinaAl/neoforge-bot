const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { validateDecision } = require('./decision')
const { MODES, SCOPES, scopeOf, missingScopes } = require('./permissions')
const { createSandbox } = require('./sandbox')
const { safetyReason } = require('../orchestrator/director')
const copy = x => JSON.parse(JSON.stringify(x))
const fail = (status, text) => Object.assign(Error(text), { status })
const terminal = g => ['finished', 'cancelled'].includes(g.status)
const active = status => ['dispatching', 'running'].includes(status)

function createAgent ({ engine, runner, director, dataDir = process.env.ARCADIA_DATA_DIR || './data',
  canRun = () => null, sandbox: injectedSandbox, env = process.env }) {
  const botId = engine.botId()
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(botId)) throw Error('botId agent tidak valid')
  const directory = path.resolve(dataDir, 'agent', botId), file = path.join(directory, 'checkpoint.json')
  const experienceFile = path.join(directory, 'experience.jsonl')
  let db = { version: 1, mode: MODES.includes(env.ARCADIA_AGENT_PERMISSION) ? env.ARCADIA_AGENT_PERMISSION : 'semi',
    goals: [] }
  let closed = false, busy = false, timer, controller, generation = 0, storageError = null
  if (fs.existsSync(file)) {
    db = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (db.version !== 1 || !MODES.includes(db.mode) || !Array.isArray(db.goals)) throw Error('checkpoint agent tidak valid')
    for (const goal of db.goals) if (!terminal(goal)) {
      goal.status = 'paused'; goal.pending = null; goal.queue = []
      goal.reason = 'Dipulihkan setelah restart. Lanjutkan untuk mengamati dunia dan merencanakan kembali.'
      for (const step of goal.steps) if (active(step.status)) { step.status = 'uncertain'; step.taskId = null }
      goal.needsObservation = true
    }
  }
  const sandbox = injectedSandbox || createSandbox({ dataDir: directory, env })
  function persist () {
    if (storageError) throw fail(503, storageError)
    try {
      fs.mkdirSync(directory, { recursive: true })
      fs.writeFileSync(file + '.tmp', JSON.stringify(db)); fs.renameSync(file + '.tmp', file)
    } catch (e) { storageError = 'Checkpoint agent gagal: ' + e.message; throw fail(503, storageError) }
  }
  persist()
  function changed (g) {
    if (g) g.updatedAt = Date.now()
    persist(); engine.emit('agent.updated', { goalId: g?.id || null, status: g?.status || null, mode: db.mode })
  }
  function experience (g, type, data) {
    const row = { version: 1, ts: Date.now(), botId, goalId: g.id, goal: g.goal, type, mode: db.mode, ...data }
    try {
      if (fs.existsSync(experienceFile) && fs.statSync(experienceFile).size > 8 * 1024 * 1024) {
        fs.renameSync(experienceFile, path.join(directory, 'experience-' + Date.now() + '.jsonl'))
      }
      fs.appendFileSync(experienceFile, JSON.stringify(row) + '\n')
    } catch (e) { storageError = 'Catatan pengalaman gagal: ' + e.message; throw fail(503, storageError) }
  }
  function get (id) {
    const g = db.goals.find(x => x.id === id)
    if (!g) throw fail(404, 'tujuan agent tidak ditemukan')
    return g
  }
  const current = () => db.goals.find(g => !terminal(g))
  function wake (ms = 0) {
    clearTimeout(timer)
    if (closed || storageError) return
    timer = setTimeout(() => tick().catch(e => {
      const g = current()
      if (g && !storageError) { g.status = 'blocked'; g.reason = e.message; changed(g) }
      else console.error('[agent]', e.message)
    }), ms)
    timer.unref?.()
  }
  function available () {
    const state = engine.state(), q = engine.list()
    if (state.status !== 'online') return 'Bot belum online.'
    if (q.paused) return 'Engine dijeda; lanjutkan engine sebelum agent.'
    if (q.running || q.queue.length || runner.current?.()) return 'Executor masih dipakai task lain.'
    return canRun()
  }
  function validate (decision) {
    const d = copy(decision); delete d.usage
    validateDecision(d, runner.skills, director.snapshot?.().deny || [])
    return d
  }
  function record (g, decision, result, step) {
    if (!step) {
      step = { id: crypto.randomUUID(), decision: copy(decision), startedAt: Date.now() }
      g.steps.push(step)
    }
    step.status = result.ok ? 'done' : 'failed'; step.result = copy(result); step.finishedAt = Date.now()
    experience(g, 'outcome', { stepId: step.id, decision, result, after: engine.state() })
    if (!result.ok) {
      g.queue = []
      const sig = JSON.stringify([decision.kind, decision.skill, decision.params, decision.name, decision.command, result.code, result.error])
      g.failures[sig] = (g.failures[sig] || 0) + 1
      if (g.failures[sig] >= 3) { g.status = 'blocked'; g.reason = 'Tiga kegagalan identik. Ubah kondisi atau tujuan sebelum melanjutkan.' }
    }
    changed(g)
    return step
  }
  function context (g) {
    const summary = (result, limit = 2500) => {
      const text = JSON.stringify(result)
      return text && text.length > limit ? { ok: result.ok, code: result.code, error: result.error,
        excerpt: text.slice(0, limit), truncated: true } : result
    }
    return { goalId: g.id, goal: g.goal, mode: db.mode, grants: g.grants,
      needsObservation: !!g.needsObservation,
      ownerMessages: g.messages.slice(-8), decisionsRemaining: g.maxDecisions - g.decisions,
      history: g.steps.slice(-6).map(s => ({ id: s.id, decision: { ...s.decision, code: undefined }, status: s.status, result: summary(s.result) })),
      completed: g.steps.filter(s => s.status === 'done').slice(-24).map(s => ({ id: s.id, skill: s.decision.skill,
        params: s.decision.params, code: s.result?.code, data: summary(s.result, 500) })),
      tools: sandbox.list(), sandbox: sandbox.policy }
  }
  async function tick () {
    const g = current()
    if (busy || closed || storageError || !g || !['thinking', 'running', 'waiting'].includes(g.status) || g.steps.some(s => active(s.status))) return
    const unavailable = available()
    if (unavailable) { g.status = 'paused'; g.reason = unavailable; changed(g); return }
    if (Date.now() > g.deadline || (g.decisions >= g.maxDecisions && !g.pending && !g.queue.length) || g.steps.length >= 128) {
      g.status = 'blocked'; g.reason = 'Batas waktu/keputusan/langkah tujuan tercapai.'; changed(g); return
    }
    busy = true; const version = generation; controller = new AbortController()
    const signal = controller.signal
    try {
      let d = g.pending || g.queue.shift()
      if (!d) {
        g.status = 'thinking'; g.reason = 'Menentukan tindakan dari keadaan dan hasil native.'; changed(g)
        g.decisions++; changed(g) // Juga menghitung balasan invalid, supaya tidak loop tak terbatas.
        try { d = await director.decide(context(g), { signal }) } catch (e) {
          if (signal.aborted || version !== generation) return
          if (e.status === 429) {
            g.decisions--; g.status = 'waiting'; g.retryAt = Date.now() + Math.min(61000, e.retryAfterMs || 60000)
            g.reason = 'Menunggu anggaran LLM tersedia.'; changed(g); wake(g.retryAt - Date.now()); return
          }
          record(g, { kind: 'decision' }, { ok: false, code: 'DECISION_FAILED', error: e.message })
          if (g.status !== 'blocked') { g.status = 'waiting'; g.reason = e.message; changed(g); wake(3000) }
          return
        }
        if (signal.aborted || version !== generation || closed) return
        g.usage.in += Number(d.usage?.in) || 0; g.usage.out += Number(d.usage?.out) || 0
      }
      d = validate(d)
      g.pending = null
      if (g.needsObservation && d.kind !== 'ask' && !(d.kind === 'skill' && scopeOf(d) === 'read')) {
        throw Error('Setelah restart/hasil uncertain, lakukan world.inspect atau inv.snapshot sebelum aksi lain atau finish.')
      }
      const missing = missingScopes(db.mode, g.grants, d)
      // finish/ask tidak memodifikasi dunia; observasi tetap boleh menyampaikan usulan.
      if (!['finish', 'ask'].includes(d.kind) && missing.length) {
        g.pending = d; g.status = 'awaiting_approval'; g.requestedScopes = missing
        g.reason = db.mode === 'observe' ? 'Mode observasi: rencana tersedia, eksekusi dinonaktifkan.' : 'Perlu izin cakupan: ' + missing.join(', ')
        experience(g, 'permission.request', { decision: d, scopes: missing }); changed(g); return
      }
      const why = available()
      if (why) { g.status = 'paused'; g.reason = why; changed(g); return }
      if (d.kind === 'skill') {
        const unsafe = safetyReason({ skill: d.skill }, engine.state())
        if (unsafe) { g.status = 'paused'; g.reason = unsafe; changed(g); return }
      }
      g.status = 'running'; g.reason = d.reason
      experience(g, 'decision', { decision: d, before: engine.state() }); changed(g)
      if (d.kind === 'ask') {
        g.status = 'needs_input'; g.reason = d.question; g.pending = null; changed(g); return
      }
      if (d.kind === 'finish') {
        const evidence = d.evidence.map(id => g.steps.find(s => s.id === id))
        if (evidence.some(s => !s || s.decision.kind !== 'skill' || s.status !== 'done' || s.result?.data?.partial)) {
          record(g, d, { ok: false, code: 'EVIDENCE_REQUIRED', error: 'Evidence harus merujuk hasil native sukses, bukan tool atau hasil parsial.' })
        } else {
          g.status = 'finished'; g.reason = d.reason; g.evidence = d.evidence; g.finishedAt = Date.now()
          experience(g, 'goal.finished', { evidence: d.evidence, reason: d.reason, usage: g.usage,
            score: { succeeded: g.steps.filter(s => s.status === 'done').length, failed: g.steps.filter(s => s.status === 'failed').length, decisions: g.decisions } })
          changed(g)
        }
      } else if (d.kind === 'skill') {
        const step = { id: crypto.randomUUID(), decision: d, status: 'dispatching', taskId: null, startedAt: Date.now() }
        g.steps.push(step); changed(g) // Checkpoint wajib sebelum mengubah dunia.
        try {
          const task = engine.enqueue({ skill: d.skill, params: d.params || {}, source: 'planner', priority: 50, batchId: g.id })
          step.taskId = task.id; changed(g)
        } catch (e) { record(g, d, { ok: false, code: 'ENQUEUE_FAILED', error: e.message }, step) }
      } else {
        const step = { id: crypto.randomUUID(), decision: d, status: 'running', startedAt: Date.now() }
        g.steps.push(step); changed(g)
        let result
        try {
          const world = engine.state()
          let output
          if (d.kind === 'tool.create') output = await sandbox.define(d, world, signal)
          else if (d.kind === 'tool.run') output = await sandbox.run(d.name, d.input, world, signal)
          else output = await sandbox.command(d.command, signal)
          if (signal.aborted || version !== generation || closed) return
          if (d.kind === 'tool.run' && output?.tasks !== undefined) {
            if (!Array.isArray(output.tasks) || output.tasks.length > 32) throw Error('output.tasks harus array maksimum 32 task')
            const tasks = output.tasks.map(t => validate({ kind: 'skill', reason: 'Metode ' + d.name,
              skill: t.skill, params: t.params || {} }))
            if (tasks.length + g.steps.length > 128) throw Error('batas langkah tujuan terlampaui')
            g.queue = tasks // Divalidasi seluruhnya sebelum task pertama, dan izin diperiksa per langkah.
          }
          result = d.kind === 'command' ? { ...output, data: { output: output.output } } : { ok: true, code: 'OK', data: output }
        } catch (e) {
          if (signal.aborted || version !== generation || closed) return
          result = { ok: false, code: 'SANDBOX_FAILED', error: e.message }
        }
        record(g, d, result, step)
      }
    } catch (e) {
      if (!closed && !storageError && version === generation) {
        record(g, { kind: 'validation' }, { ok: false, code: 'INVALID_DECISION', error: e.message })
      }
    } finally {
      busy = false; controller = null
      if (!closed && version === generation && ['running', 'thinking'].includes(g.status) && !g.steps.some(s => active(s.status))) wake()
    }
  }
  function start ({ goal, maxDecisions = 40, maxMinutes = 30 } = {}) {
    if (closed || storageError) throw fail(503, storageError || 'agent ditutup')
    if (typeof goal !== 'string' || !goal.trim() || goal.length > 600) throw fail(400, 'tujuan harus 1..600 karakter')
    if (!Number.isInteger(maxDecisions) || maxDecisions < 1 || maxDecisions > 100 ||
      !Number.isInteger(maxMinutes) || maxMinutes < 1 || maxMinutes > 120) throw fail(400, 'batas keputusan 1..100; menit 1..120')
    if (current()) throw fail(409, 'Masih ada tujuan agent; lanjutkan atau batalkan terlebih dahulu.')
    const why = available(); if (why) throw fail(409, why)
    const g = { id: 'a_' + crypto.randomUUID(), goal: goal.trim(), title: goal.trim(), status: 'thinking',
      reason: '', steps: [], queue: [], pending: null, messages: [], grants: ['read'], failures: {},
      usage: { in: 0, out: 0 }, decisions: 0, maxDecisions, deadline: Date.now() + maxMinutes * 60000,
      createdAt: Date.now() }
    db.goals.unshift(g); db.goals = db.goals.slice(0, 20)
    experience(g, 'goal.started', { limits: { maxDecisions, maxMinutes }, before: engine.state() })
    changed(g); wake(); return copy(g)
  }
  function stop (id, cancel = false) {
    const g = get(id)
    if (terminal(g)) return copy(g)
    generation++; controller?.abort(); clearTimeout(timer)
    g.status = cancel ? 'cancelled' : 'paused'; g.reason = cancel ? 'Dibatalkan pemilik.' : 'Dihentikan pemilik.'
    g.pending = null; g.queue = []; changed(g)
    for (const step of g.steps.filter(s => active(s.status))) {
      if (step.taskId) { try { engine.cancel(step.taskId) } catch (_) {} }
      else step.status = 'uncertain'
      if (cancel && active(step.status)) step.status = 'uncertain'
    }
    experience(g, cancel ? 'owner.cancel' : 'owner.stop', {}); changed(g)
    return copy(g)
  }
  function resume (id, { message } = {}) {
    const g = get(id)
    if (closed || storageError || terminal(g) || busy || g.steps.some(s => active(s.status))) throw fail(409, 'agent belum dapat dilanjutkan')
    const why = available(); if (why) throw fail(409, why)
    if (message !== undefined && (typeof message !== 'string' || message.length > 2000)) throw fail(400, 'pesan maksimum 2000 karakter')
    if (message?.trim()) { g.messages.push(message.trim()); g.messages = g.messages.slice(-20); experience(g, 'owner.feedback', { message }) }
    if (g.decisions >= g.maxDecisions || Date.now() > g.deadline) throw fail(409, 'Anggaran tujuan habis; mulai tujuan baru dengan batas yang sesuai.')
    g.status = 'thinking'; g.pending = null; g.queue = []
    // Hasil uncertain dibawa ke LLM untuk observasi, tidak diulang otomatis.
    changed(g); wake(); return copy(g)
  }
  function approve (id) {
    const g = get(id)
    if (g.status !== 'awaiting_approval' || !g.pending || db.mode === 'observe') throw fail(409, 'tidak ada persetujuan yang dapat dijalankan')
    const d = validate(g.pending), scopes = missingScopes(db.mode, g.grants, d)
    g.grants = [...new Set([...g.grants, ...scopes])]
    experience(g, 'owner.approve', { decision: d, scopes })
    g.status = 'running'; changed(g); wake(); return copy(g)
  }
  function permissions ({ mode }) {
    if (!MODES.includes(mode)) throw fail(400, 'mode harus observe, semi, atau full')
    if (mode !== db.mode && current()) stop(current().id)
    db.mode = mode; changed()
    return { mode, scopes: SCOPES }
  }
  function onEvent (ev) {
    if (closed || storageError) return
    const g = current(); if (!g) return
    if (['safety.killswitch', 'bot.died', 'bot.disconnected'].includes(ev.type)) {
      stop(g.id); g.reason = ev.type; changed(g); return
    }
    const data = ev.data || {}
    if (ev.type === 'task.started' && data.batchId === g.id) {
      const s = g.steps.find(s => s.status === 'dispatching')
      if (s) { s.taskId = data.id; s.status = 'running'; changed(g) }
    }
    if (!['task.finished', 'task.failed'].includes(ev.type)) return
    const s = g.steps.find(s => s.taskId === data.taskId && active(s.status))
    if (!s) return
    const result = data.result || { ok: false, code: data.code || 'UNKNOWN' }
    if (result.ok && scopeOf(s.decision) === 'read') g.needsObservation = false
    record(g, s.decision, result, s)
    if (['ABORTED', 'DIED', 'INTERRUPTED'].includes(result.code)) {
      g.status = 'paused'; g.reason = result.error || result.code; g.queue = []; changed(g)
    }
    if (g.status === 'running') wake()
  }
  const listener = event => { try { onEvent(event) } catch (e) { console.error('[agent]', e.message) } }
  engine.on('event', listener)
  return { start, stop, resume, approve, permissions,
    busy: () => !!current() && !['paused', 'blocked', 'needs_input', 'awaiting_approval'].includes(current().status),
    snapshot: () => copy({ ...db, storageError, sandbox: sandbox.policy, tools: sandbox.list(), scopes: SCOPES }),
    experiences: () => fs.existsSync(experienceFile) ? fs.readFileSync(experienceFile, 'utf8').split('\n').filter(Boolean).slice(-200).map(x => JSON.parse(x)) : [],
    close: () => {
      if (closed) return
      try { if (current()) stop(current().id) } catch (_) { controller?.abort() }
      closed = true; generation++; controller?.abort(); clearTimeout(timer); engine.off('event', listener)
    }
  }
}
module.exports = { createAgent }
