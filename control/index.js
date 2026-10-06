// control/index.js - API HTTP + SSE + Web UI (tanpa dependency). Kontrak: contracts/README.md. Bind 127.0.0.1 + token.
const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { validate } = require('../contracts/validate')

function start ({ bot, runner, engine, port, bind, token } = {}) {
  port = port || Number(process.env.ARCADIA_PORT) || 8787
  bind = bind || process.env.ARCADIA_BIND || '127.0.0.1'
  token = token || process.env.ARCADIA_TOKEN || crypto.randomBytes(12).toString('hex')
  const tokenOk = t => { const a = Buffer.from(String(t || '')); const b = Buffer.from(token); return a.length === b.length && crypto.timingSafeEqual(a, b) }
  const sse = new Set(); const recent = []
  engine.on('event', ev => { recent.push(ev); if (recent.length > 100) recent.shift(); const line = 'data: ' + JSON.stringify(ev) + '\n\n'; for (const r of sse) r.write(line) })
  const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)) }
  const fail = (status, msg) => Object.assign(new Error(msg), { status })
  const readBody = req => new Promise((resolve, reject) => {
    let n = 0; const ch = []
    req.on('data', c => { n += c.length; if (n > 65536) { reject(fail(413, 'body terlalu besar')); req.destroy() } else ch.push(c) })
    req.on('end', () => { try { resolve(ch.length ? JSON.parse(Buffer.concat(ch).toString()) : {}) } catch (e) { reject(fail(400, 'JSON tidak valid')) } })
  })
  const isMe = id => id === 'me' || id === engine.botId()

  function command (cmd) {
    const c = Object.assign({ id: 'c' + Date.now().toString(36), botId: engine.botId() }, cmd)
    const bad = validate('Command', c); if (bad) throw fail(400, 'Command melanggar kontrak: ' + bad)
    const p = c.payload || {}
    switch (c.op) {
      case 'enqueue': return engine.enqueue({ skill: p.skill, params: p.params, priority: p.priority, retries: p.retries, source: 'api' })
      case 'cancel': return engine.cancel(String(p.taskId))
      case 'pause': return engine.pause()
      case 'resume': return engine.resume()
      case 'clear': return engine.clear()
      case 'stop': return engine.stop()
      case 'say': return engine.say(p.text)
      default: throw fail(501, 'op belum diimplementasi: ' + c.op)
    }
  }

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'); const parts = u.pathname.split('/').filter(Boolean)
    const tk = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || u.searchParams.get('token')
    if (!tokenOk(tk)) return send(res, 401, { error: 'token salah/kurang (Authorization: Bearer ... atau ?token=)' })
    try {
      const m = req.method
      if (m === 'GET' && !parts.length) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(fs.readFileSync(path.join(__dirname, '..', 'ui', 'index.html'))) }
      if (m === 'GET' && parts[0] === 'skills') return send(res, 200, Object.values(runner.skills).map(s => s.manifest))
      if (m === 'POST' && parts[0] === 'killswitch') return send(res, 200, engine.killswitch())
      if (m === 'GET' && parts[0] === 'events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
        for (const ev of recent.slice(-30)) res.write('data: ' + JSON.stringify(ev) + '\n\n')
        sse.add(res); const ka = setInterval(() => res.write(': ka\n\n'), 15000)
        req.on('close', () => { clearInterval(ka); sse.delete(res) }); return
      }
      if (parts[0] === 'bots') {
        if (m === 'GET' && parts.length === 1) return send(res, 200, [engine.state()])
        if (!isMe(parts[1])) throw fail(404, 'bot tidak ditemukan: ' + parts[1])
        if (m === 'GET' && parts.length === 2) { const st = engine.state(); const bad = validate('BotState', st); if (bad) console.log('PERINGATAN: BotState melanggar kontrak: ' + bad); return send(res, 200, st) }
        if (parts[2] === 'tasks') {
          if (m === 'GET' && parts.length === 3) return send(res, 200, engine.list())
          if (m === 'POST' && parts.length === 3) { const b = await readBody(req); return send(res, 201, engine.enqueue({ skill: b.skill, params: b.params, priority: b.priority, retries: b.retries, onFail: b.onFail, source: 'api' })) }
          if (m === 'DELETE' && parts.length === 4) return send(res, 200, engine.cancel(parts[3]))
        }
        if (m === 'POST' && parts[2] === 'commands') return send(res, 200, command(await readBody(req)))
      }
      throw fail(404, 'rute tidak ada: ' + m + ' ' + u.pathname)
    } catch (e) { send(res, e.status || 500, { error: e.message }) }
  })
  server.on('error', e => console.log('API galat: ' + e.message + ' (ganti port: ARCADIA_PORT=xxxx, atau ARCADIA_API=0 untuk mematikan)'))
  server.listen(port, bind, () => console.log('API siap: http://' + (bind === '0.0.0.0' ? '<IP-perangkat>' : bind) + ':' + port + '/?token=' + token + (bind === '0.0.0.0' ? '  (PERINGATAN: terbuka di jaringan)' : '')))
  return { server, token, port, bind, close: () => { for (const r of sse) r.end(); server.close() } }
}

module.exports = { start }
