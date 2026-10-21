// Misi persisten: satu langkah aktif, dependency eksplisit, hasil tidak ditebak setelah restart.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { compile } = require('../contracts/validate')
const { safetyReason } = require('../orchestrator/director')
const { scoreBatch } = require('./scorer')
const copy = value => JSON.parse(JSON.stringify(value))
const fail = (status, message) => Object.assign(Error(message), { status })
const terminal = new Set(['finished', 'cancelled'])
const inflight = step => ['dispatching', 'running'].includes(step.status)
function stepLabel (step) {
  const names = { 'nav.goto': 'Mengunjungi tujuan', 'farm.harvest': 'Memanen dan merawat kebun', 'fish.cast': 'Memancing',
    'mine.collect': 'Mengumpulkan bahan', 'craft.item': 'Membuat barang', 'inv.snapshot': 'Memeriksa persediaan',
    'inv.store': 'Menyimpan barang', 'inv.take': 'Mengambil barang', 'sleep.auto': 'Beristirahat',
    'breed.animals': 'Merawat ternak', 'hunt.kill': 'Berburu', 'guard.post': 'Menjaga tempat', 'guard.follow': 'Menemani perjalanan' }
  return step.label || names[step.skill] || step.skill
}

function createMissions ({ engine, runner, director, lifecycle, dataDir = process.env.ARCADIA_DATA_DIR || './data', canRun = () => null, agentContext = () => null }) {
  const botId = engine.botId()
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(botId)) throw fail(400, 'botId misi tidak valid')
  const file = path.resolve(dataDir, 'missions', botId + '.json')
  let db = { version: 1, botId, missions: [], memories: [], conversation: [] }
  let closed = false, planning = false, chatting = false, epoch = 0, storageError = null
  function persist () {
    if (storageError) throw fail(503, storageError)
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file + '.tmp', JSON.stringify(db, null, 2) + '\n')
      fs.renameSync(file + '.tmp', file)
    } catch (error) {
      storageError = 'Checkpoint gagal disimpan. Eksekusi misi dihentikan: ' + error.message
      throw fail(503, storageError)
    }
  }
  if (fs.existsSync(file)) {
    db = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (db.version !== 1 || db.botId !== botId || !Array.isArray(db.missions) ||
        !Array.isArray(db.memories) || !Array.isArray(db.conversation)) throw Error('Checkpoint misi tidak valid: ' + file)
    for (const mission of db.missions) {
      if (!Array.isArray(mission.steps)) throw Error('Langkah checkpoint misi tidak valid')
      for (const step of mission.steps) {
        if (inflight(step)) { step.status = 'uncertain'; step.taskId = null }
      }
      if (!terminal.has(mission.status) && mission.status !== 'proposed') {
        mission.status = 'paused'
        mission.reason = 'Dipulihkan setelah restart. Periksa langkah yang hasilnya belum diketahui, lalu lanjutkan.'
      }
    }
    persist()
  }
  function changed (mission) {
    if (mission) mission.updatedAt = Math.max(Date.now(), (mission.updatedAt || 0) + 1)
    persist()
    engine.emit('mission.updated', { missionId: mission?.id || null, status: mission?.status || null })
  }
  function get (id) {
    const mission = db.missions.find(m => m.id === id)
    if (!mission) throw fail(404, 'misi tidak ditemukan')
    return mission
  }
  function remember (text, kind = 'outcome', missionId = null) {
    const entry = { id: crypto.randomUUID(), ts: Date.now(), text: String(text).slice(0, 1000), kind, missionId }
    db.memories.unshift(entry); db.memories.length = Math.min(100, db.memories.length)
    return entry
  }
  function normalizeSteps (steps, prefix = 's') {
    if (!Array.isArray(steps) || !steps.length || steps.length > 12) throw fail(400, 'misi memerlukan 1..12 langkah')
    const normalized = steps.map((step, index) => {
      if (!step || !runner.skills[step.skill]) throw fail(400, 'skill misi tidak dikenal')
      const params = step.params ?? {}
      if (!params || typeof params !== 'object' || Array.isArray(params)) throw fail(400, 'params langkah harus object')
      const invalid = compile(runner.skills[step.skill].manifest.paramsSchema)(params)
      if (invalid) throw fail(400, 'params ' + step.skill + ': ' + invalid)
      const id = step.id || prefix + (index + 1)
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw fail(400, 'id langkah tidak valid')
      const dependsOn = step.dependsOn === undefined ? (index ? [steps[index - 1].id || prefix + index] : []) : step.dependsOn
      if (!Array.isArray(dependsOn) || !dependsOn.every(x => typeof x === 'string')) throw fail(400, 'dependency harus daftar id')
      return { id, skill: step.skill, label: String(stepLabel(step)).slice(0, 180),
        params: copy(params), dependsOn: [...new Set(dependsOn)], status: 'pending', taskId: null, attempts: 0, result: null }
    })
    const ids = new Set(normalized.map(s => s.id))
    if (ids.size !== normalized.length) throw fail(400, 'id langkah duplikat')
    const visited = new Set(), visiting = new Set()
    function visit (id) {
      if (visiting.has(id)) throw fail(400, 'dependency misi melingkar')
      if (visited.has(id)) return
      const step = normalized.find(s => s.id === id)
      if (!step) throw fail(400, 'dependency tidak ditemukan: ' + id)
      visiting.add(id)
      for (const dep of step.dependsOn) visit(dep)
      visiting.delete(id); visited.add(id)
    }
    for (const id of ids) visit(id)
    return normalized
  }
  function create (plan) {
    if (closed || storageError) throw fail(503, storageError || 'runner sudah ditutup')
    const steps = normalizeSteps(plan.steps)
    if (db.missions.length >= 50) {
      const index = db.missions.findLastIndex(m => terminal.has(m.status))
      if (index < 0) throw fail(409, 'terlalu banyak misi; batalkan misi lama')
      db.missions.splice(index, 1)
    }
    const mission = { id: 'm_' + crypto.randomUUID(), botId, title: String(plan.title || 'Kegiatan bersama').slice(0, 160),
      goal: String(plan.goal || plan.title || '').slice(0, 600), source: plan.source === 'llm' ? 'llm' : 'offline',
      reason: String(plan.reason || '').slice(0, 1000), status: 'proposed', steps, revisions: [],
      template: plan.template || null, selectionFactors: copy(plan.selectionFactors || {}),
      selectionScore: plan.selectionScore ?? null, outcomeScore: null, createdAt: Date.now(), updatedAt: Date.now() }
    db.missions.unshift(mission); changed(mission)
    return copy(mission)
  }
  function prerequisites (step) {
    const occupied = canRun(); if (occupied) return occupied
    const state = engine.state(), queue = engine.list()
    if (queue.paused) return 'Antrean engine dijeda; lanjutkan engine terlebih dahulu.'
    const unsafe = safetyReason(step, state)
    if (unsafe) return unsafe
    const skill = runner.skills[step.skill]
    if (!skill) return 'Skill tidak lagi tersedia: ' + step.skill
    const invalid = compile(skill.manifest.paramsSchema)(step.params)
    if (invalid) return 'Parameter tidak lagi valid: ' + invalid
    const items = state.inventory?.items || []
    if (step.skill === 'fish.cast' && !items.some(i => i.name === 'fishing_rod' && i.count > 0)) return 'Belum ada fishing_rod.'
    const deny = director?.snapshot?.().deny || []
    if (deny.includes(step.skill)) return 'Skill diblokir kebijakan: ' + step.skill
    return null
  }
  function advance (mission) {
    if (closed || storageError || mission.status !== 'running' || mission.steps.some(inflight)) return
    if (mission.steps.every(s => s.status === 'done')) {
      mission.status = 'finished'; mission.reason = 'Seluruh langkah selesai.'
      mission.outcomeScore = scoreBatch(mission.outcomes?.length ? mission.outcomes : mission.steps.map(s => s.result))
      remember(mission.title + ' selesai: ' + mission.steps.length + ' langkah.', 'outcome', mission.id)
      changed(mission); return
    }
    const step = mission.steps.find(s => s.status === 'pending' && s.dependsOn.every(id => mission.steps.find(x => x.id === id)?.status === 'done'))
    if (!step) {
      mission.status = 'blocked'; mission.reason = 'Ada langkah gagal atau hasil belum diketahui. Periksa sebelum melanjutkan.'
      changed(mission); return
    }
    const why = prerequisites(step)
    if (why) { mission.status = 'blocked'; mission.reason = why; changed(mission); return }
    // Checkpoint sebelum enqueue: crash di celah ini tidak mengulang aksi secara otomatis.
    step.status = 'dispatching'; step.attempts++; mission.reason = ''
    changed(mission)
    try {
      const task = engine.enqueue({ skill: step.skill, params: copy(step.params), priority: 50,
        source: mission.source === 'llm' ? 'planner' : 'persona', batchId: mission.id })
      step.taskId = task.id
      if (mission.template) lifecycle?.recordMissionStart?.(mission.template)
      changed(mission)
    } catch (error) {
      step.status = 'failed'; step.error = error.message
      mission.status = 'blocked'; mission.reason = error.message; changed(mission)
    }
  }
  function start (id) {
    const mission = get(id)
    if (!['proposed', 'paused', 'blocked'].includes(mission.status)) throw fail(409, 'misi tidak dapat dilanjutkan: ' + mission.status)
    if (db.missions.some(m => m.id !== id && (m.status === 'running' || m.steps.some(inflight)))) throw fail(409, 'misi lain masih berjalan')
    if (mission.steps.some(s => s.status === 'uncertain' || s.status === 'failed')) throw fail(409, 'periksa langkah gagal/tidak diketahui atau perbaiki rencana dahulu')
    if (mission.steps.some(inflight)) throw fail(409, 'menunggu task sebelumnya berhenti')
    const first = mission.steps.find(s => s.status === 'pending' && s.dependsOn.every(dep => mission.steps.find(x => x.id === dep)?.status === 'done'))
    if (first) { const why = prerequisites(first); if (why) throw fail(409, why) }
    mission.status = 'running'; changed(mission); advance(mission)
    return copy(mission)
  }
  function halt (id, cancelled = false) {
    const mission = get(id)
    if (terminal.has(mission.status)) return copy(mission)
    epoch++
    mission.status = cancelled ? 'cancelled' : 'paused'
    mission.reason = cancelled ? 'Dibatalkan pemilik.' : 'Dihentikan pemilik; langkah selanjutnya tidak dijalankan.'
    changed(mission)
    for (const step of mission.steps.filter(inflight)) {
      if (step.taskId) { try { engine.cancel(step.taskId) } catch (_) {} }
    }
    return copy(mission)
  }
  function resolve (id, stepId, resolution) {
    const mission = get(id), step = mission.steps.find(s => s.id === stepId)
    if (!step || !['failed', 'uncertain'].includes(step.status) || terminal.has(mission.status)) throw fail(409, 'langkah tidak memerlukan pemeriksaan')
    if (mission.steps.some(inflight)) throw fail(409, 'tunggu langkah aktif berhenti')
    const queue = engine.list()
    if (step.taskId && (queue.running?.id === step.taskId || queue.queue.some(t => t.id === step.taskId))) throw fail(409, 'tunggu executor lama berhenti')
    if (resolution === 'done' && step.status === 'uncertain') {
      step.status = 'done'; step.result = { ok: true, code: 'OK', data: { confirmedByOwner: true } }
      remember('Pemilik mengonfirmasi hasil langkah ' + step.label, 'confirmation', id)
    } else if (resolution === 'retry') {
      if (step.attempts >= 3) throw fail(409, 'batas tiga percobaan; perbaiki rencana')
      step.status = 'pending'; step.result = null; step.taskId = null; delete step.error
    } else throw fail(400, 'resolusi harus retry atau done untuk hasil tidak diketahui')
    mission.status = 'paused'; mission.reason = 'Pemeriksaan tersimpan. Lanjutkan ketika siap.'
    changed(mission); return copy(mission)
  }
  async function generate ({ source = 'llm', goal = '', run = false, seed } = {}) {
    if (planning || closed) throw fail(409, 'perencanaan masih berjalan')
    if (!['offline', 'llm'].includes(source)) throw fail(400, 'sumber rencana tidak dikenal')
    if (typeof run !== 'boolean') throw fail(400, 'run harus boolean')
    if (typeof goal !== 'string' || goal.length > 600) throw fail(400, 'tujuan maksimum 600 karakter')
    planning = true; const version = epoch
    try {
      let plan
      if (source === 'offline') {
        if (!lifecycle?.plan) throw fail(503, 'generator offline belum tersedia')
        const batch = lifecycle.plan({ seed })
        if (!batch.taskDetails?.length) throw fail(409, 'Belum ada kegiatan dengan prasyarat yang tersedia.')
        plan = { title: batch.title, goal: batch.title, reason: batch.reasons.join('; '), source,
          template: batch.chosenTemplate, selectionFactors: batch.selectionFactors,
          selectionScore: batch.selectionScore, steps: batch.taskDetails.map(t => ({ skill: t.skill, params: t.params })) }
      } else {
        const decision = await director.ask(goal, { proposeOnly: true })
        if (decision.error || decision.rejected?.length || !decision.tasks?.length) throw fail(422, decision.error || decision.reason || 'Rencana tidak lengkap; coba tujuan lain.')
        plan = { title: decision.title || goal, goal, source, reason: decision.reason,
          steps: decision.tasks.map(t => ({ skill: t.skill, params: t.params })) }
      }
      if (version !== epoch || closed) throw fail(409, 'perencanaan dibatalkan')
      const mission = create(plan)
      remember(goal || mission.title, 'goal', mission.id)
      changed()
      if (run) {
        try { return start(mission.id) } catch (error) {
          const current = get(mission.id); current.status = 'blocked'; current.reason = error.message; changed(current)
          return copy(current)
        }
      }
      return mission
    } finally { planning = false }
  }
  async function replan (id) {
    const mission = get(id)
    if (planning || !['paused', 'blocked'].includes(mission.status) || mission.steps.some(inflight)) throw fail(409, 'hentikan misi sebelum memperbaiki rencana')
    if (mission.steps.some(s => s.status === 'uncertain')) throw fail(409, 'periksa hasil yang belum diketahui sebelum replan')
    if (mission.revisions.length >= 3) throw fail(409, 'batas tiga perbaikan rencana')
    planning = true; const version = epoch, revision = mission.updatedAt
    try {
      const context = mission.steps.map(s => ({ skill: s.skill, params: s.params, status: s.status, code: s.result?.code, error: s.error }))
      const decision = await director.ask(mission.goal || mission.title, { proposeOnly: true, missionContext: context })
      if (closed || version !== epoch || mission.updatedAt !== revision || !['paused', 'blocked'].includes(mission.status) || mission.steps.some(inflight)) throw fail(409, 'misi berubah; rencana lama diabaikan')
      if (decision.error || decision.rejected?.length || !decision.tasks?.length) throw fail(422, decision.reason || 'Perbaikan rencana tidak lengkap.')
      const steps = normalizeSteps(decision.tasks.map(t => ({ skill: t.skill, params: t.params })), 'r' + (mission.revisions.length + 1) + 's')
      mission.revisions.push({ ts: Date.now(), steps: copy(mission.steps), reason: mission.reason })
      mission.steps = [...mission.steps.filter(s => s.status === 'done'), ...steps]
      mission.status = 'paused'; mission.source = 'llm'; mission.reason = decision.reason || 'Rencana diperbaiki; siap dilanjutkan.'
      remember('Rencana diperbaiki: ' + mission.title, 'replan', id); changed(mission)
      return copy(mission)
    } finally { planning = false }
  }
  async function chat (text) {
    if (chatting || closed) throw fail(409, 'percakapan masih diproses')
    if (typeof text !== 'string' || !text.trim() || text.length > 1000) throw fail(400, 'pesan harus 1..1000 karakter')
    chatting = true; const version = epoch
    try {
      const reply = await director.chat(text, { memories: db.memories.slice(0, 12), conversation: db.conversation.slice(-12),
        agent: agentContext(),
        mission: db.missions[0] ? { title: db.missions[0].title, status: db.missions[0].status } : null,
        persona: lifecycle?.snapshot?.().persona })
      if (closed || version !== epoch) throw fail(409, 'percakapan dibatalkan')
      db.conversation.push({ role: 'user', text, ts: Date.now() }, { role: 'assistant', text: reply.text, ts: Date.now() })
      db.conversation = db.conversation.slice(-80); changed()
      return reply
    } finally { chatting = false }
  }
  function memory (text) {
    if (typeof text !== 'string' || !text.trim() || text.length > 1000) throw fail(400, 'catatan harus 1..1000 karakter')
    const result = remember(text.trim(), 'note'); changed(); return copy(result)
  }
  function forget (id) { db.memories = db.memories.filter(m => m.id !== id); changed(); return { deleted: true } }
  function onEvent (event) {
    if (closed || storageError) return
    const data = event.data || {}
    if (['safety.killswitch', 'bot.died', 'bot.disconnected'].includes(event.type)) {
      epoch++
      for (const mission of db.missions) {
        if (terminal.has(mission.status)) continue
        mission.status = 'paused'; mission.reason = event.type
        for (const step of mission.steps.filter(inflight)) {
          step.status = 'uncertain'
          if (step.taskId) { try { engine.cancel(step.taskId) } catch (_) {} }
        }
        changed(mission)
      }
      return
    }
    if (event.type === 'task.started') {
      const mission = db.missions.find(m => m.id === data.batchId)
      const step = mission?.steps.find(s => s.status === 'dispatching')
      if (step) { step.taskId = data.id || data.taskId; step.status = 'running'; changed(mission) }
      return
    }
    if (!['task.finished', 'task.failed'].includes(event.type)) return
    const mission = db.missions.find(m => m.steps.some(s => s.taskId === data.taskId && ['running', 'dispatching', 'uncertain'].includes(s.status)))
    if (!mission) return
    const step = mission.steps.find(s => s.taskId === data.taskId)
    const result = data.result || { ok: false, code: data.code || 'UNKNOWN' }
    if (!mission.outcomes) mission.outcomes = []
    mission.outcomes.push(copy(result))
    step.result = copy(result); step.status = result.ok ? 'done' : 'failed'; step.error = result.ok ? null : result.error || result.code
    if (!result.ok && mission.status === 'running') { mission.status = 'blocked'; mission.reason = 'Langkah gagal: ' + step.label + ' (' + result.code + ')' }
    remember(step.label + ': ' + (result.ok ? 'selesai' : result.code || 'gagal'), 'outcome', mission.id)
    changed(mission)
    setImmediate(() => { try { advance(mission) } catch (error) { console.error('[missions]', error.message) } })
  }
  const listener = event => { try { onEvent(event) } catch (error) { console.error('[missions]', error.message) } }
  engine.on('event', listener)
  return {
    create, start, halt, resolve, generate, replan, chat, memory, forget,
    snapshot: () => copy({ ...db, planning, chatting, storageError }),
    close: () => { closed = true; epoch++; engine.off('event', listener) }
  }
}
module.exports = { createMissions }
