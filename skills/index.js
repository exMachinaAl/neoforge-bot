// skills/index.js - registry skill + runner satu-task. Kontrak: contracts/contracts.schema.json
const fs = require('fs')
const path = require('path')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const ERROR_CODES = new Set(['OK', 'PRECONDITION_FAILED', 'TARGET_NOT_FOUND', 'NO_PATH', 'TIMEOUT', 'ABORTED',
  'INTERRUPTED', 'DIED', 'INVENTORY_FULL', 'PROTOCOL_UNSUPPORTED', 'SERVER_REJECTED', 'UNKNOWN'])

function normalizeSkillOutput (out) {
  if (!out || typeof out !== 'object' || Array.isArray(out) || typeof out.ok !== 'boolean') {
    return { ok: false, code: 'UNKNOWN', error: 'skill tidak mengembalikan objek hasil {ok, code, data?, error?}' }
  }
  let data
  if (out.data !== undefined) {
    if (!out.data || typeof out.data !== 'object' || Array.isArray(out.data)) {
      return { ok: false, code: 'UNKNOWN', error: 'skill mengembalikan data yang bukan objek JSON' }
    }
    try { data = JSON.parse(JSON.stringify(out.data)) } catch (_) {
      return { ok: false, code: 'UNKNOWN', error: 'skill mengembalikan data yang tidak dapat diserialkan sebagai JSON' }
    }
  }
  let code = typeof out.code === 'string' ? out.code : (out.ok ? 'OK' : 'UNKNOWN')
  let error = out.error === undefined ? '' : String(out.error)
  if (!ERROR_CODES.has(code)) {
    error = 'skill mengembalikan code tidak dikenal: ' + code + (error ? '; ' + error : '')
    code = 'UNKNOWN'
  }
  if (!out.ok && !error) error = 'skill gagal tanpa rincian; periksa data hasil dan log task'
  if (!out.ok && data && ['collected', 'dug', 'harvested', 'catches', 'kills', 'placed', 'deposited']
    .some(k => Number(data[k]) > 0)) data.partial = true
  return { ok: out.ok, code, ...(data ? { data } : {}), ...(error ? { error } : {}) }
}

function loadSkills () {
  const out = {}
  for (const f of fs.readdirSync(__dirname)) {
    if (!/^[a-z][a-z0-9_]*\.[a-z0-9_.]+\.js$/.test(f)) continue
    const m = require(path.join(__dirname, f))
    out[m.manifest.name] = m
  }
  return out
}

let validate = null
function checker () {
  if (validate !== null) return validate
  try {
    const Ajv = require('ajv')
    const ajv = new Ajv({ allErrors: true, strict: false })
    ajv.addSchema(require('../contracts/contracts.schema.json'))
    validate = (name, doc) => { const v = ajv.getSchema('arcadia/contracts#/definitions/' + name); return v(doc) ? null : JSON.stringify(v.errors) }
  } catch (e) { validate = () => null }
  return validate
}

function createRunner (bot) {
  const skills = loadSkills()
  bot.loadPlugin(pathfinder)
  const U = require('./_util')
  const mcDataOf = () => require('minecraft-data')(bot.version)
  const movementsFor = (kind, opts) => U.movementsFor(bot, Movements, mcDataOf(), kind || 'walk', opts)
  let current = null
  let seq = 0
  const events = new (require('events'))()

  const finish = (task, t0, out) => {
    out = normalizeSkillOutput(out)
    const r = { taskId: task.id, skill: task.skill, ok: !!out.ok, code: out.code || (out.ok ? 'OK' : 'UNKNOWN'), durationMs: Date.now() - t0 }
    if (out.data) r.data = out.data
    if (out.error) r.error = String(out.error)
    const bad = checker()('SkillResult', r)
    if (bad) console.log('PERINGATAN: SkillResult melanggar kontrak: ' + bad)
    events.emit('task.finished', r)
    return r
  }

  async function run (name, params = {}, opts = {}) {
    const task = { id: opts.taskId || 't' + (++seq) + '-' + Date.now().toString(36), skill: name, params, priority: opts.priority ?? 50, status: 'queued', source: opts.source || 'cli', createdAt: Date.now() }
    const t0 = Date.now()
    const skill = skills[name]
    if (!skill) return finish(task, t0, { ok: false, code: 'PRECONDITION_FAILED', error: 'skill tidak dikenal: ' + name })
    if (current) return finish(task, t0, { ok: false, code: 'PRECONDITION_FAILED', error: 'task lain masih berjalan: ' + current.task.id })
    if (!bot.entity || !bot.pathfinder) return finish(task, t0, { ok: false, code: 'PRECONDITION_FAILED', error: 'bot belum siap (belum spawn/plugin belum terpasang)' })
    // progress-v1: pecahan 0..1, maks 2/detik, salinan data, berhenti setelah abort.
    const ac = new AbortController()
    let progressSeq = 0; let lastProgress = -Infinity; let lastPct = 0
    const progress = (value = {}) => {
      if (ac.signal.aborted || !current || current.task !== task || Date.now() - lastProgress < 500) return
      try {
        const pct = Number.isFinite(value.pct) ? Math.max(lastPct, Math.min(1, Math.max(0, value.pct))) : null
        const p = { taskId: task.id, seq: progressSeq + 1, pct, label: String(value.label || '').slice(0, 160), data: value.data || {} }
        const json = JSON.stringify(p)
        if (Buffer.byteLength(json) > 3500 || checker()('TaskProgress', p)) return
        lastProgress = Date.now(); progressSeq++; if (pct !== null) lastPct = pct
        events.emit('task.progress', JSON.parse(json))
      } catch (_) { /* telemetri tidak memutus skill */ }
    }
    const timeoutMs = Math.min(Number(params.timeoutMs) || 300000, 1800000)
    const timer = setTimeout(() => ac.abort('TIMEOUT'), timeoutMs)
    current = { task, abort: reason => ac.abort(reason) }
    task.status = 'running'
    console.log('TASK mulai ' + task.id + ' ' + name + ' ' + JSON.stringify(params))
    events.emit('task.started', { id: task.id, skill: name, params })
    let out
    try {
      const mcData = mcDataOf()
      bot.pathfinder.bestHarvestTool = block => U.bestTool(bot, block, mcData).tool // pemilihan alat yang menghormati harvestTools
      out = await skill.run(bot, params, { signal: ac.signal, mcData, movements: movementsFor, progress })
    } catch (e) { out = { ok: false, code: 'UNKNOWN', error: e && e.message } }
    out = normalizeSkillOutput(out)
    clearTimeout(timer)
    try { bot.pathfinder.stop() } catch (e) {}
    ;['forward', 'back', 'left', 'right', 'jump', 'sprint'].forEach(k => bot.setControlState(k, false))
    if (ac.signal.aborted && !out.ok && (!out.code || out.code === 'ABORTED' || out.code === 'UNKNOWN')) out.code = ac.signal.reason === 'DIED' ? 'DIED' : ac.signal.reason === 'TIMEOUT' ? 'TIMEOUT' : 'ABORTED'
    if (ac.signal.aborted && !out.ok && (!out.error || out.error === 'skill gagal tanpa rincian; periksa data hasil dan log task')) {
      out.error = 'dihentikan: ' + String(ac.signal.reason)
    }
    current = null
    return finish(task, t0, out)
  }

  bot.on('death', () => current && current.abort('DIED'))
  bot.on('end', () => current && current.abort('ABORTED'))

  const parse = (name, tokens) => {
    const s = tokens.join(' ').trim()
    if (s.startsWith('{')) return JSON.parse(s)
    const p = {}
    const pos = (skills[name] && skills[name].cli) || []
    let i = 0
    for (const t of tokens) {
      const m = t.match(/^([a-zA-Z_]+)=(.*)$/)
      const v = x => /^-?\d+(\.\d+)?$/.test(x) ? Number(x) : x
      if (m) p[m[1]] = v(m[2])
      else if (pos[i]) p[pos[i++]] = v(t)
    }
    return p
  }

  async function cli (args) {
    const t = args.trim().split(/\s+/).filter(Boolean)
    const cmd = t[0]
    if (!cmd || cmd === 'list') {
      for (const s of Object.values(skills)) console.log('SKILL ' + s.manifest.name + ' - ' + s.manifest.description + ' | cli: ' + ((s.cli || []).join(' ') || '-') + ' | params: ' + JSON.stringify(s.manifest.paramsSchema.properties))
      return
    }
    if (cmd === 'stop') { if (current) { current.abort('USER_STOP'); console.log('TASK stop dikirim ke ' + current.task.id) } else console.log('tidak ada task berjalan'); return }
    if (cmd === 'status') { console.log(current ? 'TASK berjalan ' + current.task.id + ' ' + current.task.skill + ' ' + Math.round((Date.now() - current.task.createdAt) / 1000) + 's' : 'tidak ada task berjalan'); return }
    let params
    try { params = parse(cmd, t.slice(1)) } catch (e) { console.log('JSON tidak valid: ' + e.message); return }
    const r = await run(cmd, params)
    console.log('SKILLRESULT ' + JSON.stringify(r))
    return r
  }

  return { run, cli, skills, events, parse, abort: r => current && current.abort(r || 'ABORTED'), current: () => current && { id: current.task.id, skill: current.task.skill, params: current.task.params, startedAt: current.task.createdAt } }
}

module.exports = { createRunner, normalizeSkillOutput }
