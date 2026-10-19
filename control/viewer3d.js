// prismarine-viewer per bot. Default aktif, dikendalikan dari UI, bind loopback saja.
const http = require('http')

function withLoopbackListen (fn, intercept) {
  const orig = http.Server.prototype.listen
  http.Server.prototype.listen = function (...a) {
    const implicitHost = typeof a[0] === 'number' && (a.length === 1 || typeof a[1] === 'function')
    if (!implicitHost) return orig.apply(this, a)
    const callback = typeof a[1] === 'function' ? a[1] : undefined
    if (intercept) return intercept(this, a[0], callback, orig)
    return orig.call(this, a[0], '127.0.0.1', callback)
  }
  try { return fn() } finally { http.Server.prototype.listen = orig }
}

function number (v, fallback, lo, hi) {
  const n = Number(v)
  return Number.isInteger(n) && n >= lo && n <= hi ? n : fallback
}

function startViewer3d (bot, opts = {}, load = () => require('prismarine-viewer')) { // viewer-runtime-toggle-v2
  const botId = String(bot && (bot.arcadiaId || bot.username) || 'bot')
  const firstPerson = opts.firstPerson === true
  const prefix = opts.prefix || ''
  const basePort = number(opts.basePort == null ? opts.port : opts.basePort, 3007, 1, 65535)
  const viewDistance = number(opts.viewDistance, 6, 2, 16)
  let desired = opts.enabled !== false
  const status = { enabled: desired, desired, state: desired ? 'waiting_spawn' : 'off', botId, mode: firstPerson ? 'first-person' : 'eagle', bind: '127.0.0.1', port: basePort, url: 'http://127.0.0.1:' + basePort + prefix + '/', viewDistance }
  let ended = false; let spawned = !!(bot && bot.entity); let launching = false; let server = null; let viewerClose = null; let generation = 0

  function stopCurrent () {
    generation++; launching = false
    try { if (viewerClose) viewerClose() } catch (e) {}
    try { if (server && server.listening) server.close() } catch (e) {}
    viewerClose = null; server = null
  }

  function launch () {
    if (ended || !desired || !spawned || launching || status.state === 'ready') return
    launching = true; status.enabled = true; status.state = 'starting'; delete status.reason
    let pv
    try { pv = load() } catch (e) {
      launching = false; status.enabled = false; status.state = 'unavailable'
      const absent = e && e.code === 'MODULE_NOT_FOUND' && /'prismarine-viewer'/.test(e.message)
      status.reason = absent ? 'paket prismarine-viewer belum terpasang (npm run viewer:install)' : 'gagal memuat prismarine-viewer: ' + e.message
      return
    }
    const mine = ++generation; let tries = 0
    try {
      withLoopbackListen(() => (pv.mineflayer || pv)(bot, { port: basePort, viewDistance, firstPerson, prefix }), (srv, requested, callback, orig) => {
        server = srv
        const attempt = () => {
          if (mine !== generation || !desired || ended) return srv
          const port = basePort + tries
          if (port > 65535 || tries >= 100) { launching = false; status.enabled = false; status.state = 'error'; status.reason = 'tidak ada port viewer bebas mulai ' + basePort; return srv }
          status.port = port; status.url = 'http://127.0.0.1:' + port + prefix + '/'
          const onError = e => {
            if (mine !== generation) return
            if (e && e.code === 'EADDRINUSE') { tries++; status.state = 'retrying'; status.reason = 'port ' + port + ' terpakai; mencoba port berikutnya'; attempt(); return }
            launching = false; status.enabled = false; status.state = 'error'; status.reason = 'viewer gagal: ' + (e && e.message || e)
          }
          srv.once('error', onError)
          return orig.call(srv, port, '127.0.0.1', () => {
            srv.removeListener('error', onError)
            if (mine !== generation || !desired || ended) return
            launching = false; status.enabled = true; status.state = 'ready'; delete status.reason
            if (callback) callback()
          })
        }
        return attempt()
      })
      if (bot && bot.viewer && typeof bot.viewer.close === 'function') viewerClose = bot.viewer.close.bind(bot.viewer)
    } catch (e) {
      launching = false; status.enabled = false; status.state = 'error'; status.reason = 'gagal memulai: ' + e.message
    }
  }

  function setEnabled (value) {
    if (typeof value !== 'boolean') throw Object.assign(new Error('enabled harus boolean'), { status: 400 })
    desired = value; status.desired = value
    if (!value) { stopCurrent(); status.enabled = false; status.state = 'off'; status.reason = 'dimatikan dari panel kontrol' }
    else if (!ended) { status.enabled = true; status.state = spawned ? 'starting' : 'waiting_spawn'; delete status.reason; launch() }
    return status
  }
  function close () { ended = true; desired = false; status.desired = false; stopCurrent(); status.enabled = false; status.state = 'closed'; status.reason = 'bot berhenti' }
  Object.defineProperties(status, { close: { value: close, enumerable: false }, setEnabled: { value: setEnabled, enumerable: false } })
  const onSpawn = () => { spawned = true; if (desired) launch() }
  if (spawned) launch()
  else if (bot && typeof bot.once === 'function') bot.once('spawn', onSpawn)
  else { spawned = true; launch() }
  return status
}

// prismarine-viewer menyimpan controller di bot.viewer. Pisahkan controller kedua
// kamera, tetapi ikat metode event ke bot asli agar listener dapat dilepas tepat.
function viewerBot (bot) {
  let viewer
  return new Proxy(bot, {
    get (target, key) { if (key === 'viewer') return viewer; const value = target[key]; return typeof value === 'function' ? value.bind(target) : value },
    set (target, key, value) { if (key === 'viewer') viewer = value; else target[key] = value; return true }
  })
}
module.exports = { startViewer3d, withLoopbackListen, viewerBot }
