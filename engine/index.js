// engine/index.js - antrean task berprioritas + BotState + Event (kontrak: contracts/)
const EventEmitter = require('events')
const { validate } = require('../contracts/validate')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const CAPS = ['move', 'block.read', 'block.dig', 'block.place', 'combat.vanilla', 'chat', 'inventory.protocol']

function createEngine (bot, runner) {
  const ee = new EventEmitter()
  let status = bot.entity ? 'online' : 'connecting'
  let paused = false; let queue = []; let running = null; let seq = 0; let pumping = false; let engineBusy = false
  const history = []
  const botId = () => bot.username || 'bot'
  const emit = (type, data) => {
    const ev = { ts: Date.now(), botId: botId(), type, data: data || {} }
    const bad = validate('Event', ev); if (bad) console.log('PERINGATAN: Event melanggar kontrak: ' + bad)
    ee.emit('event', ev); return ev
  }
  const brief = t => ({ id: t.id, skill: t.skill, params: t.params, priority: t.priority, status: t.status, source: t.source, retries: t.retries, createdAt: t.createdAt })

  function enqueue (spec = {}) {
    if (!spec.skill || !runner.skills[spec.skill]) { const e = new Error('skill tidak dikenal: ' + spec.skill); e.status = 400; throw e }
    const t = { id: 'q' + (++seq) + '-' + Date.now().toString(36), skill: spec.skill, params: spec.params && typeof spec.params === 'object' ? spec.params : {}, priority: Number.isInteger(spec.priority) ? spec.priority : 50, status: 'queued', source: spec.source || 'api', retries: Number.isInteger(spec.retries) ? spec.retries : 0, onFail: spec.onFail || 'abort', createdAt: Date.now() }
    const bad = validate('Task', brief(t)); if (bad) { const e = new Error('task melanggar kontrak: ' + bad); e.status = 400; throw e }
    queue.push(t); queue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
    emit('task.queued', brief(t)); pump(); return brief(t)
  }
  function cancel (id) {
    if (running && running.id === id) { runner.abort('ABORTED'); return { cancelled: 'running' } }
    const i = queue.findIndex(t => t.id === id)
    if (i < 0) { const e = new Error('task tidak ditemukan: ' + id); e.status = 404; throw e }
    const [t] = queue.splice(i, 1); t.status = 'aborted'; history.unshift(t)
    emit('task.failed', { taskId: t.id, skill: t.skill, code: 'ABORTED' }); return { cancelled: 'queued' }
  }
  function clear () { const n = queue.length; for (const t of queue) { t.status = 'aborted'; history.unshift(t) } queue = []; return { cleared: n } }
  function pause () { paused = true; return { paused } }
  function resume () { paused = false; pump(); return { paused } }
  function stop () { runner.abort('ABORTED'); return { stopped: !!running } }
  function killswitch () {
    paused = true; clear(); runner.abort('ABORTED')
    try { for (const k of ['forward', 'back', 'left', 'right', 'jump', 'sprint']) bot.setControlState(k, false) } catch (e) {}
    emit('safety.killswitch', {}); return { killed: true, paused }
  }
  function say (text) { const s = String(text || '').slice(0, 256); if (!s) { const e = new Error('teks kosong'); e.status = 400; throw e } bot.chat(s); emit('chat.out', { message: s }); return { sent: s } }
  function list () { return { paused, running: running && brief(running), queue: queue.map(brief), history: history.slice(0, 30).map(t => Object.assign(brief(t), { result: t.result })) } }

  async function pump () {
    if (pumping) return
    pumping = true
    try {
      while (!paused && queue.length && status === 'online') {
        if (runner.current()) { await sleep(500); continue }
        const t = queue.shift(); running = t; t.status = 'running'; engineBusy = true
        emit('task.started', brief(t))
        const r = await runner.run(t.skill, t.params, { priority: t.priority, source: t.source })
        engineBusy = false; running = null
        t.status = r.ok ? 'done' : r.code === 'ABORTED' ? 'aborted' : 'failed'; t.result = r
        history.unshift(t); if (history.length > 60) history.pop()
        emit(r.ok ? 'task.finished' : 'task.failed', { taskId: t.id, skill: t.skill, code: r.code, result: r })
        if (!r.ok) {
          if (r.code === 'DIED' || r.code === 'INTERRUPTED') { paused = true; emit('task.failed', { taskId: t.id, skill: t.skill, code: r.code, note: 'antrean dijeda (keselamatan); resume manual' }) } else if (t.retries > 0 && r.code !== 'ABORTED' && r.code !== 'PRECONDITION_FAILED') { t.retries--; t.status = 'queued'; queue.unshift(t) }
        }
      }
    } finally { pumping = false; running = null; engineBusy = false }
  }

  function state () {
    const st = { botId: botId(), username: bot.username || 'bot', status, capabilities: CAPS, ts: Date.now(), queueLength: queue.length }
    const cur = runner.current(); st.currentTaskId = running ? running.id : cur ? cur.id : null
    if (bot.entity && bot.entity.position) st.pos = { x: +bot.entity.position.x.toFixed(2), y: +bot.entity.position.y.toFixed(2), z: +bot.entity.position.z.toFixed(2) }
    if (bot.game && bot.game.dimension) st.dimension = String(bot.game.dimension)
    if (typeof bot.health === 'number') st.health = bot.health
    if (typeof bot.food === 'number') st.food = bot.food
    if (bot.inventory) st.inventory = { items: bot.inventory.items().map(i => ({ name: i.name, count: i.count, slot: i.slot })), source: 'protocol', accurate: false }
    return st
  }

  bot.on('login', () => emit('bot.connected'))
  bot.on('spawn', () => { status = 'online'; emit('bot.spawned'); pump() })
  bot.on('death', () => { status = 'dead'; emit('bot.died') })
  bot.on('respawn', () => emit('bot.respawned'))
  bot.on('kicked', r => emit('bot.kicked', { reason: String(JSON.stringify(r)).slice(0, 300) }))
  bot.on('end', r => { status = 'offline'; emit('bot.disconnected', { reason: String(r) }) })
  bot.on('chat', (username, message) => { if (username !== bot.username) emit('chat.in', { username, message: String(message).slice(0, 200) }) })
  runner.events.on('task.started', t => { if (!engineBusy) emit('task.started', { id: t.id, skill: t.skill, params: t.params, source: 'cli' }) })
  runner.events.on('task.finished', r => { if (!engineBusy && r.code !== 'PRECONDITION_FAILED') emit(r.ok ? 'task.finished' : 'task.failed', { taskId: r.taskId, skill: r.skill, code: r.code, result: r }) })

  function cli (args) {
    const t = String(args || '').trim().split(/\s+/).filter(Boolean); const c = t[0] || 'list'
    const show = o => console.log('QUEUE ' + JSON.stringify(o))
    try {
      switch (c) {
        case 'add': { const out = enqueue({ skill: t[1], params: runner.parse(t[1], t.slice(2)), source: 'cli' }); console.log('QUEUE +' + out.id + ' ' + out.skill); break }
        case 'list': {
          const l = list()
          console.log('QUEUE paused=' + l.paused + ' running=' + (l.running ? l.running.id + ':' + l.running.skill : '-') + ' antre=' + l.queue.map(q => q.id + ':' + q.skill).join(','))
          for (const h of l.history.slice(0, 5)) console.log('QUEUE riwayat ' + h.id + ' ' + h.skill + ' ' + h.status + ' ' + ((h.result && h.result.code) || ''))
          break
        }
        case 'clear': show(clear()); break
        case 'pause': show(pause()); break
        case 'resume': show(resume()); break
        case 'cancel': show(cancel(t[1])); break
        case 'kill': show(killswitch()); break
        default: console.log('pakai: !queue add <skill> k=v... | list | clear | pause | resume | cancel <id> | kill')
      }
    } catch (e) { console.log('QUEUE galat: ' + e.message) }
  }

  return { on: (n, f) => ee.on(n, f), enqueue, cancel, clear, pause, resume, stop, killswitch, say, list, state, cli, botId }
}

module.exports = { createEngine }
