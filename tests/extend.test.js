// tests/extend.test.js - control/extend.js terpasang di atas control/index.js ASLI (kompatibilitas rute lama) + uji mutasi (AUTH, CSRF)
process.env.ARCADIA_TASKLOG = 'off'
const fs = require('fs'); const os = require('os'); const path = require('path'); const http = require('http'); const Module = require('module')
const { mk, mkBlock } = require('./mock') // shared-mock-v1
const { createRunner } = require('../skills'); const { createEngine } = require('../engine'); const control = require('../control'); const dirMod = require('../orchestrator/director')
const EXT = path.join(__dirname, '..', 'control', 'extend.js')
let pass = 0; let fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m) }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const load = (file, code) => { const m = new Module(file, module); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(code, file); return m.exports }
const req = (port, p, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => { const r = http.request({ host: '127.0.0.1', port, path: p, method, headers }, res => { const ch = []; res.on('data', c => ch.push(c)); res.on('end', () => { const t = Buffer.concat(ch).toString(); let j = null; try { j = JSON.parse(t) } catch (e) {} resolve({ s: res.statusCode, h: res.headers, t, j }) }) }); r.on('error', reject); if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body)); r.end() })

async function suite (attachImpl, quiet) {
  let bad = 0; const t = (c, m) => { if (!c) bad++; if (!quiet) ok(c, m) }
  const ui = fs.mkdtempSync(path.join(os.tmpdir(), 'arcadia-ext-')); fs.writeFileSync(path.join(ui, 'index.html'), '<!doctype html><title>Arcadia</title>'); fs.mkdirSync(path.join(ui, 'js')); fs.writeFileSync(path.join(ui, 'js', 'app.mjs'), 'export const x = 1')
  const bot = mk({ inv: { iron_pickaxe: 1 }, blocks: [mkBlock('stone', 4, 64, 2)] }); bot.username = 'BotAlpha'; bot.chat = () => {}; bot.game.dimension = 'overworld'; bot.time = { timeOfDay: 14000, isDay: false }
  const runner = createRunner(bot); const engine = createEngine(bot, runner); bot.emit('spawn')
  const port = 19000 + (process.pid % 500) + (quiet ? 600 : 0)
  const api = control.start({ bot, runner, engine, port, bind: '127.0.0.1', token: 'tok123' }); await sleep(100)
  const llm = async () => ({ text: JSON.stringify({ reason: 'tes', tasks: [{ skill: 'nav.goto', params: { x: 3, z: 3 } }] }), usage: { in: 1, out: 1 }, model: 'm' })
  const director = dirMod.createDirector({ bot, runner, engine, llm, cfg: { provider: 'anthropic', url: 'http://x', key: 'K-SECRET', model: 'm', rpm: 20, needsKey: true }, deny: [], autoApprove: [] })
  attachImpl(api, { bot, runner, engine, director }, { uiRoot: ui, viewer: { enabled: false, reason: 'tes' } })
  const H = { authorization: 'Bearer tok123' }; const ck = 'arcadia_' + port + '=tok123'
  let r = await req(port, '/bots', { headers: H }); t(r.s === 200 && r.j[0].botId === 'BotAlpha', 'rute LAMA tetap jalan lewat pembungkus: GET /bots')
  r = await req(port, '/skills', { headers: H }); t(r.s === 200 && r.j.length >= 5, 'rute lama: GET /skills')
  r = await req(port, '/bots/me/tasks', { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: { skill: 'nav.goto', params: { x: 3, z: 3 } } }); t(r.s === 201, 'rute lama: POST task diterima'); await sleep(300)
  r = await req(port, '/bots/me/tasks', { headers: H }); t(r.j.history.length === 1 && r.j.history[0].result.ok, 'rute lama: task selesai tercatat di riwayat')
  r = await req(port, '/'); t(r.s === 401, '/ tanpa token -> 401')
  r = await req(port, '/?token=salah'); t(r.s === 401, '/ token salah -> 401')
  r = await req(port, '/?token=tok123'); const sc = String(r.h['set-cookie'] || '')
  t(r.s === 200 && /Arcadia/.test(r.t) && sc.startsWith('arcadia_' + port + '=tok123') && /HttpOnly/.test(sc) && /SameSite=Strict/.test(sc) && /default-src 'self'/.test(r.h['content-security-policy']), '/ ?token -> UI + cookie per port (HttpOnly, SameSite=Strict) + CSP')
  r = await req(port, '/ui/js/app.mjs', { headers: { cookie: ck } }); t(r.s === 200 && /javascript/.test(r.h['content-type']), 'modul UI dilayani lewat cookie (tanpa token di URL)')
  r = await req(port, '/ui/js/app.mjs', { headers: { cookie: 'arcadia_1=tok123' } }); t(r.s === 401, 'cookie milik port LAIN ditolak')
  r = await req(port, '/bots/me', { headers: { cookie: ck } }); t(r.s === 200 && r.j.username === 'BotAlpha', 'API lama menerima cookie (dipetakan ke header)')
  r = await req(port, '/bots/me/tasks', { method: 'POST', headers: { cookie: ck, origin: 'http://evil.example', 'content-type': 'application/json' }, body: { skill: 'nav.goto', params: { x: 1, z: 1 } } }); t(r.s === 403, 'CSRF: POST via cookie dengan Origin asing -> 403')
  r = await req(port, '/bots/me/tasks', { method: 'POST', headers: { cookie: ck, 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' }, body: { skill: 'nav.goto', params: { x: 1, z: 1 } } }); t(r.s === 403, 'CSRF: Sec-Fetch-Site cross-site -> 403')
  engine.pause(); r = await req(port, '/bots/me/tasks', { method: 'POST', headers: { cookie: ck, origin: 'http://127.0.0.1:' + port, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' }, body: { skill: 'nav.goto', params: { x: 1, z: 1 } } }); t(r.s === 201, 'POST via cookie same-origin diterima'); engine.clear(); engine.resume()
  r = await req(port, '/bots/me/map?r=8'); t(r.s === 401, '/map tanpa token -> 401')
  r = await req(port, '/bots/me/map?r=8', { headers: H }); t(r.s === 200 && r.j.rows.length === 17 && JSON.stringify(r.j).length < 20000, '/map: grid 17x17, < 20 KB')
  const ts1 = r.j.ts; r = await req(port, '/bots/me/map?r=8', { headers: H }); t(r.j.ts === ts1, '/map: cache 1 dtk (ts sama)')
  r = await req(port, '/bots/lain/map', { headers: H }); t(r.s === 404, 'bot tak dikenal -> 404')
  r = await req(port, '/bots/me/viewer', { headers: H }); t(r.s === 200 && r.j.enabled === false, '/viewer melaporkan status (mati)')
  r = await req(port, '/openapi.json', { headers: H }); t(r.s === 200 && r.j.paths['/bots/{id}/map'] && r.j.paths['/bots/{id}/director/ask'] && r.j.components.schemas['nav.goto'], '/openapi.json memuat rute baru + skema skill dari manifest'); r = await req(port, '/openapi.json'); t(r.s === 401, '/openapi.json tanpa token -> 401')
  r = await req(port, '/bots/me/director', { headers: H }); t(r.s === 200 && r.j.autonomy === false && !r.t.includes('K-SECRET'), 'Director: snapshot, otonomi MATI, kunci tidak bocor')
  r = await req(port, '/bots/me/director/ask', { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: {} }); t(r.s === 400, 'Director ask tanpa goal -> 400')
  engine.pause(); r = await req(port, '/bots/me/director/ask', { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: { goal: 'ke 3,3' } }); const pid = r.j && r.j.tasks && r.j.tasks[0] && r.j.tasks[0].pid
  t(r.s === 200 && pid && r.j.tasks[0].status === 'pending' && engine.list().queue.length === 0, 'Director ask: usulan pending, TIDAK masuk antrean')
  r = await req(port, '/bots/me/director/proposals/' + pid + '/approve', { method: 'POST', headers: H }); t(r.s === 200 && engine.list().queue.length === 1 && engine.list().queue[0].source === 'planner', 'approve: masuk antrean dengan source "planner"')
  r = await req(port, '/bots/me/director/proposals/' + pid + '/approve', { method: 'POST', headers: H }); t(r.s === 409, 'approve ulang -> 409')
  r = await req(port, '/bots/me/director/autonomy', { method: 'POST', headers: H }); t(r.s === 501, 'otonomi -> 501 (sengaja belum ada)')
  const sse = await new Promise(res => { const q = http.get({ host: '127.0.0.1', port, path: '/events', headers: { cookie: ck } }, rr => { res(rr.headers['content-type']); q.destroy() }); q.on('error', () => res('err')) }); t(/event-stream/.test(String(sse)), 'SSE /events (rute lama) tetap jalan, diterima lewat cookie')
  engine.clear(); engine.resume(); api.close(); return bad
}

;(async () => {
  console.log('--- extend (asli)'); const bad0 = await suite(require('../control/extend').attach, false)
  console.log('--- mutasi'); const src = fs.readFileSync(EXT, 'utf8')
  for (const g of ['AUTH', 'CSRF']) {
    const mut = src.split('\n').map(l => l.includes('// GUARD:' + g) ? l.replace(/^(\s*)if .*?(\/\/ GUARD:)/, '$1$2') : l).join('\n'); ok(mut !== src, 'mutan ' + g + ' dibuat')
    let b = -1; try { b = await suite(load(EXT, mut).attach, true) } catch (e) { b = 99 } ok(b > 0, 'tanpa penjaga ' + g + ': ' + b + ' tes gagal (harus > 0)')
  }
  ok(bad0 === 0, 'implementasi asli: seluruh tes extend lulus')
  console.log('\nHASIL: ' + pass + ' lulus, ' + fail + ' gagal'); process.exit(fail ? 1 : 0)
})().catch(e => { console.error('CRASH', e); process.exit(2) })
