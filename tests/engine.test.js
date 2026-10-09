process.env.ARCADIA_TASKLOG = 'off'
const { mk, mkBlock, bi } = require('./mock')
const { createRunner } = require('../skills'); const { createEngine } = require('../engine'); const control = require('../control')
const { validate } = require('../contracts/validate')
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m) }
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const bot = mk({ inv: { iron_pickaxe: 1 }, blocks: [mkBlock('stone', 4, 64, 2), mkBlock('stone', 6, 64, 3)] })
  bot.username = 'BotAlpha'; bot.chat = t => { bot._said = t }; bot.entity.position = bot.entity.position; bot.game.dimension = 'overworld'
  const runner = createRunner(bot); const engine = createEngine(bot, runner)
  const events = []; engine.on('event', e => events.push(e))
  const c = control.start({ bot, runner, engine, port: 18787, bind: '127.0.0.1', token: 'tok123' })
  await sleep(100)
  const B = 'http://127.0.0.1:18787'; const H = { Authorization: 'Bearer tok123', 'content-type': 'application/json' }
  const get = async p => (await fetch(B + p, { headers: H })).json(); const post = async (p, b) => { const r = await fetch(B + p, { method: 'POST', headers: H, body: JSON.stringify(b || {}) }); return { s: r.status, j: await r.json() } }
  let r = await fetch(B + '/bots'); ok(r.status === 401, 'tanpa token -> 401')
  r = await fetch(B + '/bots?token=salah'); ok(r.status === 401, 'token salah -> 401')
  r = await fetch(B + '/?token=tok123'); const html = await r.text(); ok(r.status === 200 && /Arcadia/.test(html) && /textContent|replaceChildren/.test(html), 'UI disajikan (' + html.length + ' B)')
  const sk = await get('/skills'); ok(sk.length === 11 && ['inv.snapshot', 'inv.view', 'inv.store', 'inv.take', 'craft.item', 'breed.animals'].every(n => sk.some(s => s.name === n)) && sk.every(s => !validate('SkillManifest', s)), '/skills: 11 manifest valid kontrak (termasuk inv.*, craft.item, breed.animals)')
  bot.emit('spawn'); await sleep(20)
  let st = await get('/bots/me'); ok(!validate('BotState', st) && st.status === 'online' && st.username === 'BotAlpha' && st.inventory.items.length === 1, 'BotState valid kontrak: ' + JSON.stringify({ s: st.status, pos: st.pos, hp: st.health }))
  st = await get('/bots/BotAlpha'); ok(st.botId === 'BotAlpha', '/bots/<username> = /bots/me')
  r = await fetch(B + '/bots/lain', { headers: H }); ok(r.status === 404, 'bot lain -> 404')
  r = await post('/bots/me/tasks', { skill: 'tidak.ada' }); ok(r.s === 400, 'skill tak dikenal -> 400: ' + r.j.error)
  r = await fetch(B + '/bots/me/tasks', { method: 'POST', headers: H, body: '{rusak' }); ok(r.status === 400, 'JSON rusak -> 400')
  r = await fetch(B + '/bots/me/tasks', { method: 'POST', headers: H, body: 'x'.repeat(70000) }).catch(() => ({ status: 'putus' })); ok(r.status === 413 || r.status === 'putus', 'body 70KB ditolak (' + r.status + ')')
  // enqueue prioritas: nav (50), lalu mine (90) harus jalan lebih dulu setelah task pertama berjalan
  engine.pause()
  const a = await post('/bots/me/tasks', { skill: 'nav.goto', params: { x: 10, z: 5 }, priority: 10 }); const b2 = await post('/bots/me/tasks', { skill: 'mine.collect', params: { block: 'stone', count: 1 }, priority: 90 })
  ok(a.s === 201 && b2.s === 201, 'enqueue 201 x2'); let l = await get('/bots/me/tasks'); ok(l.paused && l.queue[0].skill === 'mine.collect' && l.queue.length === 2, 'antrean terurut prioritas, dijeda: ' + l.queue.map(q => q.skill).join('>'))
  r = await post('/bots/me/commands', { op: 'resume' }); await sleep(1500); l = await get('/bots/me/tasks')
  ok(l.queue.length === 0 && l.history.length === 2 && l.history[0].skill === 'nav.goto' && l.history[1].skill === 'mine.collect' && l.history.every(h => h.result.ok), 'dua task selesai berurutan prioritas (mine dulu): ' + l.history.map(h => h.skill + ':' + h.result.code).reverse().join(' > '))
  ok(events.filter(e => !validate('Event', e)).length === events.length, 'semua ' + events.length + ' event valid kontrak: ' + [...new Set(events.map(e => e.type))].join(','))
  // cancel queued
  engine.pause(); const c1 = await post('/bots/me/tasks', { skill: 'nav.goto', params: { x: 1, z: 1 } }); r = await fetch(B + '/bots/me/tasks/' + c1.j.id, { method: 'DELETE', headers: H }); ok(r.status === 200 && (await get('/bots/me/tasks')).queue.length === 0, 'cancel task antre')
  // say + command validasi
  r = await post('/bots/me/commands', { op: 'say', payload: { text: 'halo' } }); ok(r.s === 200 && bot._said === 'halo', 'say -> bot.chat')
  r = await post('/bots/me/commands', { op: 'ngawur' }); ok(r.s === 400, 'op tak dikenal -> 400 (kontrak)')
  r = await post('/bots/me/commands', { op: 'setPersona', payload: {} }); ok(r.s === 501, 'setPersona -> 501 (belum ada)')
  // running cancel + killswitch
  const bot2 = bot; bot2.pathfinder.goto = bot2.pathfinder.goto; engine.resume()
  const slow = mk({ delay: 400, inv: { iron_pickaxe: 1 }, blocks: [mkBlock('stone', 4, 64, 2), mkBlock('stone', 5, 64, 2), mkBlock('stone', 6, 64, 2)] })
  slow.username = 'S'; slow.chat = () => {}; const rr = createRunner(slow); const ee = createEngine(slow, rr); slow.emit('spawn')
  const t1 = ee.enqueue({ skill: 'mine.collect', params: { block: 'stone', count: 3 } }); ee.enqueue({ skill: 'nav.goto', params: { x: 9, z: 9 } }); await sleep(100)
  const ev2 = []; ee.on('event', e => ev2.push(e.type)); const kr = ee.killswitch(); await sleep(900)
  ok(kr.killed && ee.list().queue.length === 0 && ee.list().paused && ev2.includes('safety.killswitch'), 'killswitch: antrean kosong, dijeda, task berjalan dihentikan')
  ok(ee.list().history.some(h => h.id === t1.id && h.result && h.result.code === 'ABORTED'), 'task berjalan -> ABORTED')
  // mati -> antrean dijeda
  const d = mk({ delay: 300, inv: { iron_pickaxe: 1 }, blocks: [mkBlock('stone', 4, 64, 2), mkBlock('stone', 5, 64, 2)] }); d.username = 'D'; d.chat = () => {}; const rd = createRunner(d); const ed = createEngine(d, rd); d.emit('spawn')
  ed.enqueue({ skill: 'mine.collect', params: { block: 'stone', count: 2 } }); ed.enqueue({ skill: 'nav.goto', params: { x: 3, z: 3 } }); await sleep(80); d.emit('death'); await sleep(800)
  ok(ed.list().paused && ed.list().queue.length === 1 && ed.list().history[0].result.code === 'DIED', 'mati: task DIED, antrean sisa DIJEDA (bukan lanjut otomatis)')
  // SSE
  const ac = new AbortController(); const sres = await fetch(B + '/events?token=tok123', { signal: ac.signal }); const rd2 = sres.body.getReader(); const dec = new TextDecoder(); let buf = ''
  const reading = (async () => { try { for (;;) { const { value, done } = await rd2.read(); if (done) break; buf += dec.decode(value) } } catch (e) {} })()
  await sleep(100); await post('/bots/me/commands', { op: 'say', payload: { text: 'sse' } }); await sleep(150); ac.abort()
  ok(sres.headers.get('content-type').includes('event-stream') && /chat\.out/.test(buf) && /task\.finished|bot\.spawned/.test(buf), 'SSE: riwayat + event baru terkirim')
  // CLI !queue
  const logs = []; const ol = console.log; console.log = (...a) => { logs.push(a.join(' ')); }; engine.cli('pause'); engine.cli('add nav.goto x=2 z=2'); engine.cli('list'); engine.cli('clear'); engine.cli('add tidak.ada'); console.log = ol
  ok(logs.some(x => /QUEUE \+q\d+/.test(x)) && logs.some(x => /galat: skill tidak dikenal/.test(x)), '!queue add/list/clear + galat jelas')

  // v2.1: validasi params, alasan abort, tasks.log, nama unknown
  r = await post('/bots/me/tasks', { skill: 'hunt.kill', params: { count: 5 } }); ok(r.s === 400 && /mob/.test(r.j.error), 'hunt.kill tanpa mob -> 400: ' + r.j.error)
  r = await post('/bots/me/tasks', { skill: 'mine.collect', params: { block: 'stone', count: 'banyak' } }); ok(r.s === 400 && /count/.test(r.j.error), 'count bukan angka -> 400: ' + r.j.error)
  engine.pause(); r = await post('/bots/me/tasks', { skill: 'farm.harvest', params: { crops: 'wheat', replant: true } }); ok(r.s === 201, 'farm.harvest crops string lolos validasi'); engine.clear(); engine.resume()
  ok(ee.list().history.some(h => h.result && h.result.code === 'ABORTED' && /KILLSWITCH/.test(h.result.error || '')), 'ABORTED membawa alasan: KILLSWITCH')
  const tmp = require('os').tmpdir() + '/arcadia-test-' + process.pid + '.log'; process.env.ARCADIA_TASKLOG = tmp
  const lg = mk({ inv: { iron_pickaxe: 1 }, blocks: [mkBlock('stone', 4, 64, 2)] }); lg.username = 'L'; lg.chat = () => {}; lg._inv.push({ type: 99999, name: 'unknown', count: 2, slot: 12 }); const rl = createRunner(lg); const el = createEngine(lg, rl); lg.emit('spawn'); process.env.ARCADIA_TASKLOG = 'off'
  el.enqueue({ skill: 'mine.collect', params: { block: 'stone', count: 1 } }); await sleep(600)
  const fsx = require('fs'); const line = fsx.existsSync(tmp) ? JSON.parse(fsx.readFileSync(tmp, 'utf8').trim().split('\n').pop()) : null; if (fsx.existsSync(tmp)) fsx.unlinkSync(tmp)
  ok(line && line.params.block === 'stone' && line.result.code === 'OK' && line.result.data.collected === 1, 'tasks.log: params + hasil utuh tercatat')
  const stl = el.state(); ok(!validate('BotState', stl) && stl.inventory.items.some(i => i.name === 'unknown#99999'), 'BotState: item unknown bernama unknown#<id> dan valid kontrak')
  c.close(); console.log('\nHASIL: ' + pass + ' lulus, ' + fail + ' gagal'); process.exit(fail ? 1 : 0)
})().catch(e => { console.error('CRASH', e); process.exit(2) })
