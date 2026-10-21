const fs = require('fs'), http = require('http'), path = require('path')
const { openState, fail } = require('./state')
const { createManager } = require('./manager')
const { createStatic } = require('../control/static')
const { parseCookies } = require('../control/cookie')
const { createProfile3d } = require('../control/profile3d')

function createAdmin (options = {}) {
  const dataDir = path.resolve(options.dataDir || process.env.ARCADIA_ADMIN_DATA || path.join(__dirname, '../data/admin'))
  const state = openState(dataDir)
  const manager = createManager({ state, dataDir, ...options.manager })
  const files = createStatic({ root: path.join(__dirname, '../ui'), prefix: '/ui/', maxBytes: 2 * 1024 * 1024 })
  const profiles = new Map(), modelsDir = path.resolve(process.env.ARCADIA_MODELS_DIR || path.join(__dirname, '../data/models'))
  const profileFor = id => {
    if (!profiles.has(id)) profiles.set(id, createProfile3d({ dataDir: path.join(dataDir, 'bots', id), modelsDir }))
    return profiles.get(id)
  }
  const streams = new Set(), sockets = new Set(), attempts = new Map(), llmCalls = []
  const bind = options.bind || process.env.ARCADIA_ADMIN_BIND || '127.0.0.1'
  const publicOrigin = options.origin || process.env.ARCADIA_ADMIN_ORIGIN || null
  const cookieName = () => 'arcadia_admin_' + server.address()?.port
  const tokenOf = req => parseCookies(req.headers.cookie)[cookieName()] || ''
  const send = (res, code, data) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(data)) }
  const cookie = token => cookieName() + '=' + token + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + (token ? 604800 : 0) + (publicOrigin?.startsWith('https:') ? '; Secure' : '')
  const read = async req => {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw fail(415, 'Gunakan JSON')
    let size = 0; const chunks = []
    for await (const chunk of req) { size += chunk.length; if (size > 65536) throw fail(413, 'Body terlalu besar'); chunks.push(chunk) }
    try { const value = JSON.parse(Buffer.concat(chunks).toString() || '{}'); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value } catch (_) { throw fail(400, 'JSON object tidak valid') }
  }
  function originCheck (req) {
    const host = req.headers.host
    const allowedHost = publicOrigin ? new URL(publicOrigin).host : ['127.0.0.1','localhost','[::1]'].map(h => h + ':' + server.address().port)
    if (Array.isArray(allowedHost) ? !allowedHost.includes(host) : host !== allowedHost) throw fail(403, 'Host panel tidak sesuai; atur ARCADIA_ADMIN_ORIGIN untuk akses jaringan')
    const expected = publicOrigin || 'http://' + host
    if (req.headers.origin && req.headers.origin !== expected) throw fail(403, 'Origin tidak diizinkan')
    if (req.headers['sec-fetch-site'] === 'cross-site') throw fail(403, 'Permintaan lintas situs ditolak')
  }
  function authorize (req) { const user = state.session(tokenOf(req)); if (!user) throw fail(401, 'Silakan login'); return user }
  function access (user, id) { const bot = manager.get(id); if (!state.visible(user, bot)) throw fail(404, 'Bot tidak ditemukan'); return bot }
  function rateLimit (req) {
    const key = req.socket.remoteAddress || 'local', now = Date.now()
    const times = (attempts.get(key) || []).filter(t => now - t < 60000)
    if (times.length >= 6) throw fail(429, 'Terlalu banyak percobaan login. Tunggu satu menit.')
    times.push(now); attempts.set(key, times)
    if (attempts.size > 1000) for (const [k, values] of attempts) if (now - values.at(-1) > 60000) attempts.delete(k)
  }
  const viewerURL = (id, mode, w) => '/view/' + id + '/' + mode + '/?g=' + w.generation
  function camera (id, mode) {
    const w = manager.target(id), view = w.viewers[mode]
    if (!view || view.state !== 'ready' || !Number.isInteger(view.port)) throw fail(409, 'Kamera belum siap')
    return { w, view }
  }
  function proxy (req, res, port, route, token) {
    const headers = { ...req.headers, host: '127.0.0.1:' + port }
    delete headers.cookie; delete headers.origin; delete headers.authorization
    if (token) headers.authorization = 'Bearer ' + token
    const upstream = http.request({ host: '127.0.0.1', port, method: req.method, path: route, headers }, reply => {
      const output = { ...reply.headers }; delete output['set-cookie']; output['cache-control'] = 'no-store'
      if (!token) { output['content-security-policy'] = "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'self'; base-uri 'none'" }
      res.writeHead(reply.statusCode, output); reply.pipe(res)
    })
    upstream.setTimeout(90000, () => upstream.destroy(Error('Timeout')))
    upstream.on('error', () => { if (!res.headersSent) send(res, 502, { error: 'Worker tidak dapat dihubungi' }); else res.destroy() })
    res.on('close', () => { if (!res.writableEnded) upstream.destroy() }); req.pipe(upstream)
  }
  const server = http.createServer(async (req, res) => {
    try {
      originCheck(req)
      const url = new URL(req.url, 'http://panel'), p = url.pathname, method = req.method
      if (method === 'GET' && (p === '/' || p === '/login')) { files.handle(req, res, '/ui/admin.html'); return }
      if (p.startsWith('/ui/')) { files.handle(req, res, p); return }
      if (p === '/admin/session' && method === 'GET') { const user = state.session(tokenOf(req)); send(res, 200, { setupRequired: !state.db.users.length, authenticated: !!user, user: user && { id: user.id, displayName: user.displayName, role: user.role } }); return }
      if (['/admin/setup','/admin/login'].includes(p) && method === 'POST') {
        rateLimit(req)
        if (p.endsWith('setup') && !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) throw fail(403, 'Setup owner pertama dilakukan dari mesin panel')
        const body = await read(req), user = await state[p.endsWith('setup') ? 'setup' : 'login'](body)
        res.setHeader('set-cookie', cookie(state.issue(user))); send(res, 200, { ok: true }); return
      }
      const user = authorize(req)
      if (p === '/admin/logout' && method === 'POST') {
        const token = tokenOf(req); state.revoke(token)
        for (const item of streams) if (item.token === token) item.res.end()
        for (const item of sockets) if (item.token === token) item.socket.destroy()
        res.setHeader('set-cookie', cookie('')); send(res, 200, { ok: true }); return
      }
      if (method === 'GET' && /^\/focus\/bot_[a-z0-9-]+$/.test(p)) { access(user, p.split('/')[2]); files.handle(req, res, '/ui/index.html'); return }
      if (p === '/auth/session' && method === 'GET') { send(res, 200, { user: { id: user.id, displayName: user.displayName, role: user.role }, tenant: { id: user.tenantId, name: 'Arcadia Admin' }, authMode: 'admin-session' }); return }
      if (p === '/bots' && method === 'GET') {
        const list = manager.list(user).map(bot => ({ ...bot, viewers: Object.fromEntries(Object.entries(bot.viewers).map(([mode, v]) => [mode, { ...v, url: v?.state === 'ready' ? viewerURL(bot.botId, mode, { generation: bot.generation }) : null }])) }))
        send(res, 200, list); return
      }
      if (p === '/admin/bots' && method === 'POST') { if (user.role !== 'owner') throw fail(403, 'Hanya owner dapat membuat bot'); send(res, 201, manager.create(await read(req), user)); return }
      if (p === '/admin/defaults' && method === 'GET') { if (user.role !== 'owner') throw fail(403, 'Hanya owner'); const cfg = require('../config'); send(res, 200, { host: cfg.host, port: cfg.port }); return }
      if (p === '/events' && method === 'GET') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' }); res.write(': connected\n\n')
        const item = { user, token: tokenOf(req), res }; streams.add(item); req.on('close', () => streams.delete(item)); return
      }
      if (p === '/skills' && method === 'GET') { const id = url.searchParams.get('botId') || manager.list(user).find(b => b.workerStatus === 'ready')?.botId; if (!id) { send(res,200,[]); return } access(user,id); send(res,200,await manager.request(id,'/skills')); return }
      if (p === '/killswitch' && method === 'POST') {
        const results = await Promise.all(manager.list(user).filter(b => b.workerStatus === 'ready').map(async b => { try { await manager.request(b.botId,'/killswitch','POST',{}); return { botId:b.botId,ok:true } } catch (e) { return { botId:b.botId,ok:false,error:e.message } } }))
        send(res,200,{results}); return
      }
      const action = p.match(/^\/admin\/bots\/(bot_[a-z0-9-]+)\/(start|stop|restart)$/)
      if (action && method === 'POST') { access(user,action[1]); send(res,200,await manager[action[2]](action[1])); return }
      const remove = p.match(/^\/admin\/bots\/(bot_[a-z0-9-]+)$/)
      if (remove && method === 'DELETE') { access(user,remove[1]); if (user.role !== 'owner') throw fail(403,'Hanya owner'); send(res,200,manager.remove(remove[1])); return }
      const view = p.match(/^\/view\/(bot_[a-z0-9-]+)\/(eagle|first-person)\//)
      if (view) { access(user,view[1]); const c = camera(view[1],view[2]); proxy(req,res,c.view.port,p+url.search); return }
      const botRoute = p.match(/^\/bots\/(bot_[a-z0-9-]+)(\/.*)?$/)
      if (botRoute) {
        const id = botRoute[1]; access(user,id)
        if (!botRoute[2] && method === 'GET') { send(res,200,manager.summary(manager.get(id))); return }
        if (botRoute[2] === '/profile' && method === 'GET') { send(res,200,profileFor(id).publicProfile(id)); return }
        if (botRoute[2] === '/profile' && method === 'POST') { const profile=profileFor(id);profile.update(id,await read(req));send(res,200,profile.publicProfile(id));return }
        const profileModel = botRoute[2]?.match(/^\/profile\/model\/(.+)$/)
        if (profileModel && (method === 'GET' || method === 'HEAD')) {
          let name; try { name = decodeURIComponent(profileModel[1]) } catch (_) { throw fail(400,'nama model tidak valid') }
          const model = profileFor(id).resolveModel(name)
          res.writeHead(200,{'content-type':'model/gltf-binary','content-length':model.size,'cache-control':'no-store','x-content-type-options':'nosniff'})
          if(method==='HEAD')res.end();else fs.createReadStream(model.full).pipe(res)
          return
        }
        const w = manager.target(id)
        if (botRoute[2] === '/killswitch' && method === 'POST') { send(res,200,await manager.request(id,'/killswitch','POST',{})); return }
        if (botRoute[2] === '/viewer') {
          const mode = url.searchParams.get('mode') || 'eagle'
          if (!['eagle','first-person'].includes(mode)) throw fail(400,'Kamera tidak valid')
          const result = await manager.request(id,p+url.search,method,method === 'POST' ? await read(req) : undefined)
          w.viewers[mode] = result; send(res,200,{...result,url:result.state === 'ready' ? viewerURL(id,mode,w) : null}); return
        }
        if (method === 'POST' && (/\/(companion\/chat|director\/ask|replan)$/.test(p) || /\/missions\/plan$/.test(p))) {
          const body = await read(req)
          if (!(p.endsWith('/missions/plan') && body.source === 'offline')) {
            const now = Date.now(); while (llmCalls.length && now - llmCalls[0] > 60000) llmCalls.shift()
            const limit = Math.max(1, Number(process.env.ARCADIA_LLM_RPM) || 6)
            if (llmCalls.length >= limit) throw fail(429,'Anggaran LLM bersama habis; tunggu satu menit')
            llmCalls.push(now)
          }
          send(res,200,await manager.request(id,p,method,body)); return
        }
        proxy(req,res,w.port,p+url.search,w.token); return
      }
      throw fail(404,'Rute tidak ditemukan')
    } catch (e) { if (!res.headersSent) send(res,e.status || 500,{error:e.status ? e.message : 'Operasi admin gagal'}); else res.destroy() }
  })
  server.on('upgrade', (req, socket, head) => {
    let upstream
    try {
      originCheck(req); const user = authorize(req), url = new URL(req.url,'http://panel')
      const match = url.pathname.match(/^\/view\/(bot_[a-z0-9-]+)\/(eagle|first-person)\/socket\.io\/$/)
      if (!match) throw fail(404,'Socket tidak dikenal')
      access(user,match[1]); const { view } = camera(match[1],match[2])
      const headers = { ...req.headers, host:'127.0.0.1:'+view.port }; delete headers.cookie; delete headers.authorization; delete headers.origin
      const request = http.request({ host:'127.0.0.1',port:view.port,path:req.url,headers })
      request.on('upgrade',(response,remote,remoteHead) => {
        upstream = remote
        socket.write('HTTP/1.1 101 Switching Protocols\r\n'+Object.entries(response.headers).map(([k,v])=>k+': '+v).join('\r\n')+'\r\n\r\n')
        if (head.length) remote.write(head); if (remoteHead.length) socket.write(remoteHead)
        remote.pipe(socket); socket.pipe(remote)
        const item = { token:tokenOf(req),socket }; sockets.add(item); socket.on('close',()=>{sockets.delete(item);remote.destroy()}); remote.on('error',()=>socket.destroy()); remote.on('close',()=>socket.destroy())
      })
      request.setTimeout(10000,()=>request.destroy()); request.on('error',()=>socket.destroy()); request.on('response',()=>socket.destroy()); request.end()
      socket.on('error',()=>upstream?.destroy())
    } catch (e) { socket.end('HTTP/1.1 '+(e.status || 500)+' Forbidden\r\nConnection: close\r\n\r\n') }
  })
  manager.events.on('event', event => {
    const bot = state.db.bots.find(b => b.id === event.botId)
    for (const s of streams) if (bot && state.visible(s.user,bot)) { if (s.res.writableLength > 1024*1024) s.res.end(); else s.res.write('data: '+JSON.stringify(event)+'\n\n') }
  })
  const keepalive = setInterval(()=>{
    for (const s of streams) if (!state.session(s.token)) s.res.end(); else s.res.write(': keepalive\n\n')
    for (const s of sockets) if (!state.session(s.token)) s.socket.destroy()
  },15000); keepalive.unref()
  return { server,state,manager,
    listen: (port = Number(process.env.ARCADIA_ADMIN_PORT) || 8788) => new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,bind,()=>{server.removeListener('error',reject);resolve(server.address())})}),
    close: async () => { clearInterval(keepalive); for(const s of streams)s.res.end();for(const s of sockets)s.socket.destroy();await manager.close();await new Promise(resolve=>{server.closeAllConnections();server.close(resolve)});state.close() }
  }
}
module.exports = { createAdmin }
