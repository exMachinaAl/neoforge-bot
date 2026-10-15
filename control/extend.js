// control/extend.js - pelengkap controller: UI statis (cookie per port), peta 2D, viewer 3D (opsional), Director (model), /openapi.json.
// Dipasang MEMBUNGKUS listener 'request' milik control/index.js: rute lain tetap dilayani apa adanya (kompatibel dengan seluruh API yang ada).
// Auth: header Bearer > ?token > cookie (nama per port). Cookie dipetakan ke header agar API lama ikut menerimanya; permintaan ubah-data lewat cookie wajib same-origin (CSRF).
const fs = require('fs'); const path = require('path'); const crypto = require('crypto')
const { createStatic } = require('./static'); const cookie = require('./cookie'); const { buildMap } = require('./map'); const { startViewer3d } = require('./viewer3d')
const { createDirector } = require('../orchestrator/director')

function attach (api, deps = {}, opts = {}) {
  if (!api || !api.server || !api.token) { console.log('EXTEND: api.server/token tidak tersedia; UI/peta/director tidak dipasang'); return null }
  const { server, token } = api; const port = api.port || (server.address && server.address() && server.address().port) || 0
  const { bot, runner, engine, lifecycle } = deps
  const stat = createStatic({ root: opts.uiRoot || path.join(__dirname, '..', 'ui'), prefix: '/ui/' })
  const director = deps.director || createDirector({ bot, runner, engine })
  const viewer = opts.viewer || startViewer3d(bot)
  const tokenOk = t => { const a = Buffer.from(String(t || '')); const b = Buffer.from(token); return a.length === b.length && crypto.timingSafeEqual(a, b) }
  const send = (res, code, obj, extra) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(extra || {}) }); res.end(JSON.stringify(obj)) }
  const fail = (status, msg) => Object.assign(new Error(msg), { status })
  const readBody = req => new Promise((resolve, reject) => { let n = 0; const ch = []; req.on('data', c => { n += c.length; if (n > 65536) { reject(fail(413, 'body terlalu besar')); req.destroy() } else ch.push(c) }); req.on('end', () => { try { resolve(ch.length ? JSON.parse(Buffer.concat(ch).toString()) : {}) } catch (e) { reject(fail(400, 'JSON tidak valid')) } }) })
  const botIdOf = () => (typeof engine.botId === 'function' ? engine.botId() : engine.state().botId)
  const isMe = id => id === 'me' || id === botIdOf()
  let mapCache = { t: 0, r: 0, v: null }

  function openapi () {
    const idp = { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
    const op = (summary, extra) => ({ summary, security: [{ bearer: [] }], responses: { 200: { description: 'OK' } }, ...extra })
    const skills = {}; for (const s of Object.values(runner.skills)) skills[s.manifest.name.replace(/[^A-Za-z0-9_.-]/g, '_')] = { ...s.manifest.paramsSchema, description: s.manifest.description }
    return { openapi: '3.0.3', info: { title: 'Arcadia bot API', version: '1' }, servers: [{ url: '/' }], components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } }, schemas: skills },
      paths: {
        '/bots': { get: op('Daftar bot') }, '/bots/{id}': { get: op('BotState', { parameters: [idp] }) },
        '/bots/{id}/tasks': { get: op('Antrean+riwayat', { parameters: [idp] }), post: op('Tambah task', { parameters: [idp] }) }, '/bots/{id}/tasks/{taskId}': { delete: op('Batalkan task', { parameters: [idp] }) },
        '/bots/{id}/commands': { post: op('Command', { parameters: [idp] }) }, '/skills': { get: op('Manifest skill') }, '/killswitch': { post: op('Hentikan semua') }, '/events': { get: op('SSE event') },
        '/bots/{id}/map': { get: op('Peta 2D', { parameters: [idp, { name: 'r', in: 'query', schema: { type: 'integer', minimum: 4, maximum: 32 } }] }) },
        '/bots/{id}/lifecycle': { get: op('Konteks, persona, batch terakhir', {parameters:[idp]}) },
        '/bots/{id}/lifecycle/propose': {post:op('Usulkan batch deterministik; tidak menjalankan', {parameters:[idp]})},
        '/bots/{id}/lifecycle/batches/{batchId}/approve': {post:op('Setujui batch',{parameters:[idp]})},
        '/bots/{id}/lifecycle/batches/{batchId}/reject': {post:op('Tolak batch',{parameters:[idp]})},
        '/bots/{id}/persona': {get:op('Persona tersimpan',{parameters:[idp]})},
        '/bots/{id}/chests': {get:op('Catatan chest bertimestamp',{parameters:[idp]})},
        '/bots/{id}/viewer': { get: op('Status viewer 3D', { parameters: [idp] }) }, '/bots/{id}/director': { get: op('Status Director', { parameters: [idp] }) },
        '/bots/{id}/director/ask': { post: op('Tanya model (usulan task, tidak dijalankan)', { parameters: [idp] }) },
        '/bots/{id}/director/proposals/{pid}/approve': { post: op('Setujui usulan -> antrean', { parameters: [idp] }) }, '/bots/{id}/director/proposals/{pid}/reject': { post: op('Tolak usulan', { parameters: [idp] }) }
      } }
  }

  async function mine (req, res, url, auth) {
    const parts = url.pathname.split('/').filter(Boolean); const m = req.method
    const isUi = (m === 'GET' || m === 'HEAD') && (!parts.length || parts[0] === 'index.html' || parts[0] === 'ui')
    const isMine = isUi || (m === 'GET' && parts[0] === 'openapi.json') || (parts[0] === 'bots' && (parts[2] === 'map' || parts[2] === 'viewer' || parts[2] === 'director' || parts[2] === 'lifecycle' || parts[2] === 'persona' || parts[2] === 'chests'))
    if (!isMine) return false
    if (!auth.ok) { send(res, 401, { error: 'token salah/kurang (Authorization: Bearer, ?token=, atau cookie arcadia_' + port + ')' }); return true } // GUARD:AUTH
    if (isUi) {
      if (auth.via === 'query') res.setHeader('Set-Cookie', cookie.setCookieHeader(port, token))
      return stat.handle(req, res, !parts.length || parts[0] === 'index.html' ? '/ui/index.html' : url.pathname) || (send(res, 404, { error: 'tidak ada' }), true)
    }
    if (parts[0] === 'openapi.json') { send(res, 200, openapi()); return true }
    try {
      if (!isMe(parts[1])) throw fail(404, 'bot tidak ditemukan: ' + parts[1])
      // lifecycle-routes-v1
      if (['lifecycle','persona','chests'].includes(parts[2])) {
        if (!lifecycle) throw fail(503, 'lifecycle belum terpasang')
        if (m === 'GET' && parts.length === 3) { const st = lifecycle.snapshot(); send(res,200,parts[2]==='persona'?st.persona:parts[2]==='chests'?st.chests:st); return true }
        if (parts[2] === 'lifecycle' && m === 'POST') {
          if (parts[3] === 'propose' && parts.length===4) {send(res,200,lifecycle.propose(await readBody(req)));return true}
          if (parts[3] === 'batches' && parts.length===6 && ['approve','reject'].includes(parts[5])) {send(res,200,lifecycle[parts[5]](parts[4]));return true}
        }
        throw fail(404,'rute lifecycle tidak ada')
      }
      if (parts[2] === 'map' && m === 'GET') {
        const r = Math.min(32, Math.max(4, parseInt(url.searchParams.get('r'), 10) || 24)); const t = Date.now()
        if (!(mapCache.v && mapCache.r === r && t - mapCache.t < 1000)) mapCache = { t, r, v: buildMap(bot, { r }) }
        send(res, 200, mapCache.v); return true
      }
      if (parts[2] === 'viewer' && m === 'GET') { send(res, 200, viewer); return true }
      if (parts[2] === 'director') {
        if (m === 'GET' && parts.length === 3) { send(res, 200, director.snapshot()); return true }
        if (m === 'POST' && parts[3] === 'ask') { const b = await readBody(req); const ac = new AbortController(); res.on('close', () => { if (!res.writableEnded) ac.abort() }); send(res, 200, await director.ask(b.goal, { signal: ac.signal, dry: b.dry === true })); return true }
        if (m === 'POST' && parts[3] === 'proposals' && parts[5] === 'approve') { send(res, 200, director.approve(parts[4])); return true }
        if (m === 'POST' && parts[3] === 'proposals' && parts[5] === 'reject') { send(res, 200, director.reject(parts[4])); return true }
        if (m === 'POST' && parts[3] === 'autonomy') throw fail(501, 'otonomi belum diimplementasi (sengaja MATI)')
      }
      throw fail(404, 'rute tidak ada: ' + m + ' ' + url.pathname)
    } catch (e) { send(res, e.status || 500, { error: e.message }); return true }
  }

  const orig = server.listeners('request').slice(); server.removeAllListeners('request')
  server.on('request', async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x'); const a = cookie.tokenFromRequest(req, url, port); const ok = tokenOk(a.token)
      if (ok && a.via === 'cookie') { // cookie -> header agar rute lama menerimanya; ubah-data wajib same-origin
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const o = req.headers.origin; const sf = req.headers['sec-fetch-site']
          if ((o && o !== 'http://' + req.headers.host) || (sf && sf !== 'same-origin' && sf !== 'none')) { send(res, 403, { error: 'permintaan lintas-origin ditolak' }); return } // GUARD:CSRF
        }
        req.headers.authorization = 'Bearer ' + a.token
      }
      if (await mine(req, res, url, { ok, via: a.via })) return
    } catch (e) { if (!res.headersSent) send(res, 500, { error: e.message }); return }
    for (const l of orig) l.call(server, req, res)
  })
  return { director, viewer, stat }
}
module.exports = { attach }
