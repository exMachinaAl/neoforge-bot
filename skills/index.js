// skills/index.js - registry skill + runner satu-task. Kontrak: contracts/contracts.schema.json
const fs = require('fs')
const path = require('path')
const { pathfinder, Movements } = require('mineflayer-pathfinder')

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
  let movements = null
  const getMovements = () => {
    if (!movements) {
      movements = new Movements(bot)
      movements.canDig = false // jangan merusak dunia saat berjalan
      movements.allow1by1towers = false
      movements.scafoldingBlocks = [] // jangan menaruh blok saat berjalan
      movements.allowParkour = false
    }
    return movements
  }
  let current = null
  let seq = 0

  const finish = (task, t0, out) => {
    const r = { taskId: task.id, skill: task.skill, ok: !!out.ok, code: out.code || (out.ok ? 'OK' : 'UNKNOWN'), durationMs: Date.now() - t0 }
    if (out.data) r.data = out.data
    if (out.error) r.error = String(out.error)
    const bad = checker()('SkillResult', r)
    if (bad) console.log('PERINGATAN: SkillResult melanggar kontrak: ' + bad)
    return r
  }

  async function run (name, params = {}, opts = {}) {
    const task = { id: 't' + (++seq) + '-' + Date.now().toString(36), skill: name, params, priority: opts.priority ?? 50, status: 'queued', source: opts.source || 'cli', createdAt: Date.now() }
    const t0 = Date.now()
    const skill = skills[name]
    if (!skill) return finish(task, t0, { ok: false, code: 'PRECONDITION_FAILED', error: 'skill tidak dikenal: ' + name })
    if (current) return finish(task, t0, { ok: false, code: 'PRECONDITION_FAILED', error: 'task lain masih berjalan: ' + current.task.id })
    if (!bot.entity || !bot.pathfinder) return finish(task, t0, { ok: false, code: 'PRECONDITION_FAILED', error: 'bot belum siap (belum spawn/plugin belum terpasang)' })
    const ac = new AbortController()
    const timeoutMs = Math.min(Number(params.timeoutMs) || 300000, 1800000)
    const timer = setTimeout(() => ac.abort('TIMEOUT'), timeoutMs)
    current = { task, abort: reason => ac.abort(reason) }
    task.status = 'running'
    console.log('TASK mulai ' + task.id + ' ' + name + ' ' + JSON.stringify(params))
    let out
    try {
      out = await skill.run(bot, params, { signal: ac.signal, mcData: require('minecraft-data')(bot.version), movements: getMovements })
    } catch (e) { out = { ok: false, code: 'UNKNOWN', error: e && e.message } }
    clearTimeout(timer)
    try { bot.pathfinder.stop() } catch (e) {}
    ;['forward', 'back', 'left', 'right', 'jump', 'sprint'].forEach(k => bot.setControlState(k, false))
    if (ac.signal.aborted && !out.ok && (!out.code || out.code === 'ABORTED' || out.code === 'UNKNOWN')) out.code = ac.signal.reason === 'DIED' ? 'DIED' : ac.signal.reason === 'TIMEOUT' ? 'TIMEOUT' : 'ABORTED'
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
    if (cmd === 'stop') { if (current) { current.abort('ABORTED'); console.log('TASK stop dikirim ke ' + current.task.id) } else console.log('tidak ada task berjalan'); return }
    if (cmd === 'status') { console.log(current ? 'TASK berjalan ' + current.task.id + ' ' + current.task.skill + ' ' + Math.round((Date.now() - current.task.createdAt) / 1000) + 's' : 'tidak ada task berjalan'); return }
    let params
    try { params = parse(cmd, t.slice(1)) } catch (e) { console.log('JSON tidak valid: ' + e.message); return }
    const r = await run(cmd, params)
    console.log('SKILLRESULT ' + JSON.stringify(r))
    return r
  }

  return { run, cli, skills }
}

module.exports = { createRunner }
