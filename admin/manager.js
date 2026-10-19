const fs = require('fs'), path = require('path'), crypto = require('crypto'), http = require('http')
const { fork } = require('child_process')
const { EventEmitter } = require('events')
const { fail } = require('./state')
const root = path.resolve(__dirname, '..')

function createManager ({ state, dataDir, spawn = fork, workerFile = path.join(root, 'bot.js'), maxWorkers = 8 }) {
  const workers = new Map(), events = new EventEmitter(), restarting = new Set()
  let closing = false
  function get (id) { const bot = state.db.bots.find(b => b.id === id); if (!bot) throw fail(404, 'Bot tidak ditemukan'); return bot }
  function summary (bot) {
    const w = workers.get(bot.id), stale = !w?.child || !w?.lastSeen || Date.now() - w.lastSeen > 5000
    return { ...(w?.state || {}), botId: bot.id, username: bot.username, displayName: bot.displayName,
      status: w?.child ? (stale ? w.status === 'starting' ? 'connecting' : 'disconnected' : w.state?.status || 'connecting') : 'offline',
      workerStatus: w?.status || 'stopped', stale, lastSeen: w?.lastSeen || null, error: w?.error || null,
      currentTask: w?.tasks?.running?.skill || null, mission: w?.mission ? { title: w.mission.title, status: w.mission.status } : null,
      server: bot.host + ':' + bot.port, viewers: w?.viewers || {}, generation: w?.generation || null }
  }
  function create (body, user) {
    if (state.db.bots.length >= 100) throw fail(409, 'Batas 100 konfigurasi bot')
    const username = String(body.username || '').trim(), displayName = String(body.displayName || username).trim()
    const host = String(body.host || 'localhost').trim(), port = Number(body.port || 25565)
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) throw fail(400, 'Username Minecraft harus 3–16 huruf/angka/underscore')
    if (!displayName || displayName.length > 64 || !/^[A-Za-z0-9.:[\]_-]{1,253}$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) throw fail(400, 'Nama/server/port tidak valid')
    if (state.db.bots.some(b => b.username.toLowerCase() === username.toLowerCase() && b.host.toLowerCase() === host.toLowerCase() && b.port === port)) throw fail(409, 'Username sudah terdaftar pada server ini')
    const bot = { id: 'bot_' + crypto.randomUUID(), tenantId: user.tenantId, displayName, username, host, port, createdAt: Date.now() }
    const dir = path.join(dataDir, 'bots', bot.id); fs.mkdirSync(dir, { recursive: true })
    // Salin data lama hanya atas pilihan pemilik. Sumber lama tetap utuh.
    if (body.importLegacy === true) {
      if (user.role !== 'owner') throw fail(403, 'Import hanya untuk owner')
      const legacyRoot = path.resolve(process.env.ARCADIA_DATA_DIR || path.join(root, 'data'))
      for (const folder of ['profiles','personas','missions']) {
        const old = path.join(legacyRoot, folder, username + '.json')
        if (!fs.existsSync(old)) continue
        const content = JSON.parse(fs.readFileSync(old, 'utf8'))
        if (folder === 'missions') { content.botId = bot.id; for (const m of content.missions || []) m.botId = bot.id }
        if (folder === 'personas') content.id = bot.id
        fs.mkdirSync(path.join(dir, folder), { recursive: true })
        fs.writeFileSync(path.join(dir, folder, bot.id + '.json'), JSON.stringify(content, null, 2))
      }
    }
    state.db.bots.push(bot); state.save(); return summary(bot)
  }
  function start (id) {
    const bot = get(id), old = workers.get(id)
    if (closing) throw fail(503, 'Admin sedang berhenti')
    if (old?.child) return summary(bot)
    if ([...workers.values()].filter(w => w.child).length >= maxWorkers) throw fail(409, 'Batas bot aktif: ' + maxWorkers)
    if (old?.timer) clearTimeout(old.timer)
    const generation = crypto.randomBytes(8).toString('hex'), token = crypto.randomBytes(24).toString('hex')
    const w = { generation, token, status: 'starting', lastSeen: null, failures: old?.failures || 0, wanted: true, viewers: {}, port: null }
    workers.set(id, w)
    try {
      const child = spawn(workerFile, [], { cwd: root, windowsHide: true, stdio: ['ignore','ignore','pipe','ipc'],
        env: { ...process.env, MC_USERNAME: bot.username, MC_HOST: bot.host, MC_PORT: String(bot.port),
          ARCADIA_BOT_ID: bot.id, ARCADIA_WORKER: '1', ARCADIA_API: '1', ARCADIA_PORT: '0', ARCADIA_BIND: '127.0.0.1',
          ARCADIA_TOKEN: token, ARCADIA_DIRECTOR_AUTO: '', ARCADIA_DATA_DIR: path.join(dataDir, 'bots', bot.id),
          ARCADIA_MODELS_DIR: path.resolve(process.env.ARCADIA_MODELS_DIR || path.join(root, 'data/models')) } })
      w.child = child
      child.stderr?.on('data', () => {}) // Jangan mengirim stack/secret worker ke UI.
      child.on('message', msg => {
        if (workers.get(id) !== w || !msg || typeof msg !== 'object') return
        if (msg.type === 'ready' && Number.isInteger(msg.port) && msg.port > 0 && msg.port < 65536) { w.port = msg.port; w.status = 'ready' }
        if (msg.type === 'snapshot') { w.lastSeen = Date.now(); w.state = msg.state; w.tasks = msg.tasks; w.viewers = msg.viewers || {}; w.mission = msg.mission; if (msg.state?.status === 'online') w.failures = 0 }
        if (msg.type === 'event') events.emit('event', { ...msg.event, botId: id })
      })
      child.on('error', () => { w.error = 'Worker gagal dimulai'; child.kill() })
      child.once('exit', (code, signal) => {
        if (workers.get(id) !== w) return
        w.child = null; w.port = null; w.viewers = {}; w.status = 'stopped'
        events.emit('event', { ts: Date.now(), botId: id, type: 'bot.disconnected', data: { code, signal } })
        if (w.wanted && !closing && ++w.failures <= 3) {
          w.status = 'retrying'; w.timer = setTimeout(() => { try { start(id) } catch (e) { w.error = e.message } }, 2000 * 2 ** (w.failures - 1))
        } else if (w.wanted) { w.status = 'error'; w.error = 'Worker terputus; batas reconnect tercapai. Periksa server lalu Mulai lagi.' }
      })
      // Deadline startup/heartbeat mencegah proses macet selamanya.
      w.watchdog = setInterval(() => {
        if (!w.child) { clearInterval(w.watchdog); return }
        if (Date.now() - (w.lastSeen || w.startedAt) > 60000) { w.error = 'Worker tidak merespons'; w.child.kill() }
      }, 5000); w.startedAt = Date.now(); w.watchdog.unref()
      return summary(bot)
    } catch (e) { w.child = null; w.status = 'error'; throw fail(503, 'Tidak dapat memulai worker: ' + e.message) }
  }
  async function stop (id) {
    const bot = get(id), w = workers.get(id)
    if (!w) return summary(bot)
    w.wanted = false; clearTimeout(w.timer); clearInterval(w.watchdog)
    const child = w.child
    if (child) {
      w.status = 'stopping'
      await new Promise(resolve => {
        let done = false; const finish = () => { if (done) return; done = true; clearTimeout(timer); resolve() }
        const timer = setTimeout(() => { child.kill(); setTimeout(finish, 1000).unref() }, 4000)
        child.once('exit', finish)
        if (child.connected) child.send({ type: 'shutdown' }, () => {}); else child.kill()
      })
    }
    return summary(bot)
  }
  async function restart (id) {
    if (restarting.has(id)) throw fail(409, 'Restart masih berjalan')
    restarting.add(id)
    try { await stop(id); return start(id) } finally { restarting.delete(id) }
  }
  function remove (id) {
    get(id); const w = workers.get(id)
    if (w?.child || w?.wanted) throw fail(409, 'Hentikan bot sebelum menghapus konfigurasi')
    clearTimeout(w?.timer); clearInterval(w?.watchdog); workers.delete(id)
    state.db.bots = state.db.bots.filter(b => b.id !== id); state.save()
    return { deleted: true, dataRetained: true }
  }
  function target (id) {
    get(id); const w = workers.get(id)
    if (!w?.port || !w.child || w.status === 'stopping') throw fail(409, 'Bot belum siap. Mulai bot dahulu.')
    return w
  }
  function request (id, route, method = 'GET', body) {
    const w = target(id)
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: w.port, path: route, method, headers: { authorization: 'Bearer ' + w.token, 'content-type': 'application/json' } }, res => {
        const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => { try { const data = JSON.parse(Buffer.concat(chunks).toString()); res.statusCode >= 400 ? reject(fail(res.statusCode, data.error || 'Worker error')) : resolve(data) } catch (_) { reject(fail(502, 'Balasan worker tidak valid')) } })
      })
      req.setTimeout(90000, () => req.destroy(Error('Worker timeout'))); req.on('error', e => reject(fail(502, e.message)))
      req.end(body === undefined ? undefined : JSON.stringify(body))
    })
  }
  return { events, workers, get, create, start, stop, restart, remove, target, request, summary,
    list: user => state.db.bots.filter(b => state.visible(user, b)).map(summary),
    close: async () => { closing = true; await Promise.all(state.db.bots.map(b => stop(b.id))) } }
}
module.exports = { createManager }
