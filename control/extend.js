// control/extend.js - pelengkap controller: UI statis (cookie per port), peta 2D, viewer 3D (opsional), Director (model), /openapi.json.
// Dipasang MEMBUNGKUS listener 'request' milik control/index.js: rute lain tetap dilayani apa adanya (kompatibel dengan seluruh API yang ada).
// Auth: header Bearer > ?token > cookie (nama per port). Cookie dipetakan ke header agar API lama ikut menerimanya; permintaan ubah-data lewat cookie wajib same-origin (CSRF).
const fs = require('fs'); const path = require('path'); const crypto = require('crypto')
const { createStatic } = require('./static'); const cookie = require('./cookie'); const { buildMap } = require('./map'); const { startViewer3d } = require('./viewer3d')
const { createDirector } = require('../orchestrator/director')
const { createMissions } = require('../lifecycle/missions')
const { createSettings } = require('./settings'); const { localSession } = require('./auth'); const { createProfile3d } = require('./profile3d')

function attach (api, deps = {}, opts = {}) {
  if (!api || !api.server || !api.token) { console.log('EXTEND: api.server/token tidak tersedia; UI/peta/director tidak dipasang'); return null }
  const { server, token } = api; const port = api.port || (server.address && server.address() && server.address().port) || 0
  const { bot, runner, engine, lifecycle } = deps
  const stat = createStatic({ root: opts.uiRoot || path.join(__dirname, '..', 'ui'), prefix: '/ui/', maxBytes: 2 * 1024 * 1024 })
  const director = deps.director || createDirector({ bot, runner, engine })
  const missions = opts.missions || createMissions({ engine, runner, director, lifecycle, dataDir: opts.dataDir })
  server.once('close', () => missions.close())
  const settings = opts.settings || createSettings(opts.settingsOptions)
  const initialSettings = settings.get(String(bot && bot.username || 'bot'))
  const viewer = opts.viewer || startViewer3d(bot, { enabled: initialSettings.viewer })
  const session = opts.session || localSession() // auth-tenant-boundary-v1
  const profile3d = opts.profile3d || createProfile3d(opts.profileOptions)
  // viewer-each-bot-v1: lifecycle viewer mengikuti lifecycle bot.
  if (bot && typeof bot.once === 'function' && viewer && typeof viewer.close === 'function') bot.once('end', viewer.close)
  const tokenOk = t => { const a = Buffer.from(String(t || '')); const b = Buffer.from(token); return a.length === b.length && crypto.timingSafeEqual(a, b) }
  const send = (res, code, obj, extra) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(extra || {}) }); res.end(JSON.stringify(obj)) }
  const fail = (status, msg) => Object.assign(new Error(msg), { status })
  const readBody = req => new Promise((resolve, reject) => { let n = 0; const ch = []; req.on('data', c => { n += c.length; if (n > 65536) { reject(fail(413, 'body terlalu besar')); req.destroy() } else ch.push(c) }); req.on('end', () => { try { const body = ch.length ? JSON.parse(Buffer.concat(ch).toString()) : {}; if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('object diperlukan'); resolve(body) } catch (e) { reject(fail(400, 'JSON object tidak valid')) } }) })
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
        '/bots/{id}/missions': {get:op('Misi, percakapan, dan ingatan persisten',{parameters:[idp]})},
        '/bots/{id}/missions/plan': {post:op('Rencanakan kegiatan dari LLM atau lifecycle; run=true mulai langsung',{parameters:[idp]})},
        '/bots/{id}/missions/{missionId}/{action}': {post:op('start, stop, cancel, replan, atau resolve langkah',{parameters:[idp]})},
        '/bots/{id}/companion/chat': {post:op('Percakapan AI tanpa eksekusi task',{parameters:[idp]})},
        '/bots/{id}/memories': {post:op('Simpan catatan pemilik',{parameters:[idp]})},
        '/bots/{id}/memories/{memoryId}': {delete:op('Hapus ingatan tersimpan',{parameters:[idp]})},
        '/auth/session': { get: op('Sesi akun dan tenant aktif') },
        '/bots/{id}/settings': { get: op('Pengaturan UI bot', { parameters: [idp] }), post: op('Ubah pengaturan UI bot', { parameters: [idp] }) },
        '/bots/{id}/profile': { get: op('Profil model GLB bot', { parameters: [idp] }), post: op('Kalibrasi model/animasi GLB', { parameters: [idp] }) },
        '/bots/{id}/viewer': { get: op('Status viewer 3D', { parameters: [idp] }), post: op('Nyalakan/matikan viewer 3D', { parameters: [idp] }) }, '/bots/{id}/director': { get: op('Status Director', { parameters: [idp] }) },
        '/bots/{id}/director/ask': { post: op('Tanya model (usulan task, tidak dijalankan)', { parameters: [idp] }) },
        '/bots/{id}/director/proposals/{pid}/approve': { post: op('Setujui usulan -> antrean', { parameters: [idp] }) }, '/bots/{id}/director/proposals/{pid}/reject': { post: op('Tolak usulan', { parameters: [idp] }) }
      } }
  }

  async function mine (req, res, url, auth) {
    const parts = url.pathname.split('/').filter(Boolean); const m = req.method
    const isUi = (m === 'GET' || m === 'HEAD') && (!parts.length || parts[0] === 'index.html' || parts[0] === 'ui')
    const isMine = isUi || (m === 'GET' && (parts[0] === 'openapi.json' || (parts[0] === 'auth' && parts[1] === 'session'))) || (parts[0] === 'bots' && ['map','viewer','settings','profile','director','lifecycle','persona','chests','missions','companion','memories'].includes(parts[2]))
    if (!isMine) return false
    if (!auth.ok) { send(res, 401, { error: 'token salah/kurang (Authorization: Bearer, ?token=, atau cookie arcadia_' + port + ')' }); return true } // GUARD:AUTH
    if (isUi) {
      if (auth.via === 'query') res.setHeader('Set-Cookie', cookie.setCookieHeader(port, token))
      return stat.handle(req, res, !parts.length || parts[0] === 'index.html' ? '/ui/index.html' : url.pathname) || (send(res, 404, { error: 'tidak ada' }), true)
    }
    if (parts[0] === 'openapi.json') { send(res, 200, openapi()); return true }
    if (parts[0] === 'auth' && parts[1] === 'session') { send(res, 200, session); return true }
    try {
      if (!isMe(parts[1])) throw fail(404, 'bot tidak ditemukan: ' + parts[1])
      if (parts[2] === 'missions') {
        if (m === 'GET' && parts.length === 3) { send(res,200,missions.snapshot()); return true }
        if (m === 'POST' && parts.length === 4 && parts[3] === 'plan') { send(res,200,await missions.generate(await readBody(req))); return true }
        if (m === 'POST' && parts.length === 5) {
          const id = parts[3], action = parts[4]; let result
          if (action === 'start') result = missions.start(id)
          else if (action === 'stop') result = missions.halt(id)
          else if (action === 'cancel') result = missions.halt(id,true)
          else if (action === 'replan') result = await missions.replan(id)
          else if (action === 'resolve') { const b = await readBody(req); result = missions.resolve(id,b.stepId,b.resolution) }
          else throw fail(404,'aksi misi tidak ditemukan')
          send(res,200,result); return true
        }
      }
      if (parts[2] === 'companion' && parts[3] === 'chat' && parts.length === 4 && m === 'POST') {
        const b = await readBody(req); send(res,200,await missions.chat(b.text)); return true
      }
      if (parts[2] === 'memories') {
        if (m === 'POST' && parts.length === 3) { const b = await readBody(req); send(res,200,missions.memory(b.text)); return true }
        if (m === 'DELETE' && parts.length === 4) { send(res,200,missions.forget(parts[3])); return true }
      }
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
      if (parts[2] === 'profile') {
        if (m === 'GET' && parts.length === 3) { send(res,200,profile3d.publicProfile(botIdOf())); return true }
        if (m === 'POST' && parts.length === 3) { profile3d.update(botIdOf(),await readBody(req)); send(res,200,profile3d.publicProfile(botIdOf())); return true }
        if ((m === 'GET' || m === 'HEAD') && parts[3] === 'model' && parts.length === 5) { let modelName; try { modelName=decodeURIComponent(parts[4]) } catch(e) { throw fail(400,'nama model tidak valid') } const f=profile3d.resolveModel(modelName); res.writeHead(200,{'content-type':'model/gltf-binary','content-length':f.size,'cache-control':'no-store','x-content-type-options':'nosniff'}); if(m==='HEAD')res.end();else fs.createReadStream(f.full).pipe(res); return true }
      }
      if (parts[2] === 'settings') {
        if (m === 'GET') { send(res, 200, settings.get(botIdOf())); return true }
        if (m === 'POST') { const b = await readBody(req); const next = settings.update(botIdOf(), b); if (Object.prototype.hasOwnProperty.call(b, 'viewer') && viewer && typeof viewer.setEnabled === 'function') viewer.setEnabled(b.viewer); send(res, 200, next); return true }
      }
      if (parts[2] === 'viewer') {
        if (m === 'GET') { send(res, 200, viewer); return true }
        if (m === 'POST') { const b = await readBody(req); if (typeof b.enabled !== 'boolean') throw fail(400, 'enabled harus boolean'); if (!viewer || typeof viewer.setEnabled !== 'function') throw fail(503, 'viewer runtime tidak mendukung toggle'); settings.update(botIdOf(), { viewer: b.enabled }); send(res, 200, viewer.setEnabled(b.enabled)); return true }
      }
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
  return { director, viewer, stat, settings, session, profile3d, missions }
}
module.exports = { attach }
