// tests/ui.test.js - UI modular (ui/js/*.mjs): keamanan DOM (tanpa HTML dinamis), reduser event, form, peta, klien API, + uji mutasi pada penjaga store
const fs = require('fs'); const path = require('path'); const os = require('os'); const { pathToFileURL } = require('url'); const { Vec3 } = require('vec3')
const UI = path.join(__dirname, '..', 'ui'); const JS = path.join(UI, 'js')
let pass = 0; let fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m) }
const imp = f => import(pathToFileURL(f).href)
class El { constructor (t) { this.nodeType = 1; this.tag = t; this.children = []; this.attrs = {}; this.style = { cssText: '' }; this.dataset = {}; this.className = '' } setAttribute (k, v) { this.attrs[k] = v } append (...c) { this.children.push(...c) } removeChild (c) { this.children.splice(this.children.indexOf(c), 1) } get firstChild () { return this.children[0] } set textContent (v) { this.children = [{ nodeType: 3, text: String(v) }] } get textContent () { return this.children.map(c => c.nodeType === 3 ? c.text : c.textContent).join('') } remove () {} }
global.document = { createElement: t => new El(t), createTextNode: s => ({ nodeType: 3, text: String(s) }) }
const tags = el => [el.tag, ...el.children.filter(c => c.nodeType === 1).flatMap(tags)]
const mkStore = async file => (await imp(file)).createStore()
const ev = (type, botId, data, ts = 1) => ({ ts, botId, type, data })
const mutate = (src, g) => src.split('\n').map(l => l.includes('// GUARD:' + g) ? l.replace(/^(\s*)if .*?(\/\/ GUARD:)/, '$1$2') : l).join('\n')

async function storeSuite (file, quiet) {
  let bad = 0; const t = (c, m) => { if (!c) bad++; if (!quiet) ok(c, m) }; const st = await mkStore(file); const B = () => st.B('b1')
  st.applyEvent(ev('task.started', 'b1', { id: 'A' })); st.applyEvent(ev('task.started', 'b1', { id: 'B' }))
  st.applyEvent(ev('task.progress', 'b1', { taskId: 'A', seq: 2, pct: 0.5, label: 'x' })); st.applyEvent(ev('task.progress', 'b1', { taskId: 'A', seq: 1, pct: 0.1, label: 'lama' }))
  t(B().progress.A.pct === 0.5 && B().progress.A.label === 'x', 'progress: seq lebih lama diabaikan')
  st.applyEvent(ev('task.progress', 'b1', { taskId: 'A', seq: 3, pct: 0.2, label: 'mundur' })); t(B().progress.A.pct === 0.5 && B().progress.A.label === 'mundur', 'progress: pct tidak boleh mundur (label tetap diperbarui)')
  st.applyEvent(ev('task.progress', 'b1', { taskId: 'A', seq: 4, pct: null, label: 'tanpa-pct' })); t(B().progress.A.pct === null, 'pct null (durasi tak terbatas) diterima')
  st.applyEvent(ev('task.progress', 'b1', { taskId: 'B', seq: 1, pct: 40, label: 'persen' })); t(B().progress.B.pct === 1, 'pct di luar kontrak dijepit ke 1'); // pct-contract-v1
  t(st.s.log.filter(e => e.type === 'task.progress').length === 0, 'event progress (sering) tidak membanjiri log')
  st.applyEvent(ev('task.failed', 'b1', { taskId: 'A', code: 'TIMEOUT' })); t(B().running === 'B' && B().progress.B && !B().progress.A, 'task.failed milik task LAIN tidak menutup task yang sedang berjalan')
  st.applyEvent(ev('task.finished', 'b1', { taskId: 'B' })); t(B().running === null && !B().progress.B, 'task.finished milik task sendiri menutup kartunya')
  return bad
}

;(async () => {
  console.log('--- keamanan berkas')
  const files = fs.readdirSync(JS).filter(f => f.endsWith('.mjs')).map(f => path.join(JS, f)); const html = fs.readFileSync(path.join(UI, 'index.html'), 'utf8')
  const BAN = /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|srcdoc|localStorage|sessionStorage/
  ok(files.length >= 8 && files.every(f => !BAN.test(fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\bBAN = .*$/gm, '').replace(/\/\^\(innerhtml.*\n/gi, ''))), 'tidak ada API berbahaya (innerHTML/eval/document.write/localStorage) di ' + files.length + ' modul')
  ok(!/<script(?![^>]*\bsrc=)/i.test(html) && !/\son[a-z]+\s*=/i.test(html) && /type="module"/.test(html), 'index.html: tanpa skrip inline dan tanpa atribut on*= (cocok dengan CSP default-src self)')
  ok(files.every(f => !/authorization|bearer|[?&]token=|document\.cookie/i.test(fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/location\.search\.includes\('token='\)/, ''))), 'modul UI tidak memegang token (tanpa Authorization/Bearer/?token=/document.cookie; autentikasi lewat cookie HttpOnly)')
  const mods = {}; for (const f of files) { try { mods[path.basename(f)] = await imp(f) } catch (e) { mods[path.basename(f)] = null; console.log('impor gagal', f, e.message) } }
  ok(Object.keys(mods).filter(k => k !== 'app.mjs').every(k => mods[k]) , 'semua modul (selain app) dapat diimpor tanpa DOM sungguhan')
  const { h, clear } = mods['dom.mjs']
  console.log('--- dom aman')
  let el = h('div', { className: 'x' }, '<img src=x onerror=alert(1)>', null, false, [['dalam', 7]]); ok(el.children[0].nodeType === 3 && el.children[0].text.includes('<img') && !tags(el).includes('img') && el.children.length === 3, 'string dinamis menjadi simpul teks (bukan elemen), null/false dilewati, array diratakan')
  let thrown = 0; for (const a of [{ innerHTML: 'x' }, { outerHTML: 'x' }, { srcdoc: 'x' }, { href: 'javascript:alert(1)' }, { src: ' data:text/html,x' }, { onclick: 'alert(1)' }]) { try { h('a', a) } catch (e) { thrown++ } } ok(thrown === 6, 'atribut/URL berbahaya dan handler string ditolak (6/6)')
  let fn = () => {}; el = h('button', { onclick: fn }); ok(el.onclick === fn, 'handler fungsi dipasang')
  console.log('--- kartu dengan data bermusuhan')
  const cards = mods['cards.mjs']; const host = new El('div'); const evil = '<script>alert(1)</script>'
  cards.renderStatus(host, { botId: 'b', username: evil, status: 'online', pos: { x: 1, y: 2, z: 3 }, stats: { k: evil }, inventory: { items: [] } }); ok(host.textContent.includes(evil) && !tags(host).includes('script'), 'renderStatus: nama/bidang tak dikenal tampil sebagai teks')
  const ih = new El('div'); cards.renderInventory(ih, { inventory: { items: [{ name: evil, count: 2 }], source: 'snbt', accurate: true } }, [{ name: 'inv.snapshot' }], {}); ok(ih.textContent.includes(evil) && !tags(ih).includes('script') && /akurat/.test(ih.textContent), 'renderInventory: nama item berbahaya sebagai teks; penanda akurat tampil')
  const ph = new El('div'); cards.renderProgress(ph, { tasks: { running: { skill: evil, params: {} } }, progress: { a: { taskId: 'a', pct: 0.25, label: evil, data: { n: 1 } } } }); ok(ph.textContent.includes('25%') && !tags(ph).includes('script'), 'renderProgress: label berbahaya sebagai teks, persen tampil')
  const nh = new El('div'); cards.renderInventory(nh, { inventory: { items: [], source: 'x', accurate: false } }, [], {}); ok(tags(nh).includes('button') && nh.children[0].children.some(c => c.tag === 'button' && c.attrs.disabled === 'true' || c.attrs.disabled === ''), 'tombol Snapshot nonaktif bila skill inv.snapshot tidak ada')
  const persEl = new El('div'); cards.renderPersona(persEl, { name: evil, level: 3, xp: 120, affection: 0.85, traits: { caution: 0.7 }, needs: { energy: 0.9 } }); ok(persEl.textContent.includes(evil) && !tags(persEl).includes('script') && persEl.textContent.includes('level 3'), 'renderPersona: nama berbahaya sebagai teks, data persona tampil')
  const batchEl = new El('div'); let rated = 0; cards.renderBatch(batchEl, { batchId: 'b_123', category: evil, seed: 's1', reasons: [evil] }, { total: 150, components: { safety: 100 } }, n => { rated = n }); ok(batchEl.textContent.includes(evil) && !tags(batchEl).includes('script') && batchEl.textContent.includes('Skor: 100/100'), 'renderBatch: alasan berbahaya sebagai teks, skor dijepit ke 100')
  const starBtn = batchEl.children.flatMap(c => c.children || []).find(c => c.tag === 'button'); if (starBtn && starBtn.onclick) starBtn.onclick(); ok(rated === 1, 'renderBatch: tombol rating memicu onRate callback')
  console.log('--- store/reduser')
  const bad0 = await storeSuite(path.join(JS, 'store.mjs'), false); ok(bad0 === 0, 'store asli: seluruh tes reduser lulus')
  const st = await mkStore(path.join(JS, 'store.mjs')); for (let i = 0; i < 260; i++) st.applyEvent(ev('chat.in', 'b1', { n: i })); ok(st.s.log.length === 200, 'log dibatasi 200 baris')
  st.applyEvent({ type: 'task.progress', data: {} }); st.applyEvent(ev('task.progress', 'b1', {})); st.applyEvent(ev('aneh.baru', 'b1', { x: 1 })); ok(st.s.log[st.s.log.length - 1].type === 'aneh.baru', 'event tak dikenal/rusak tidak membuat galat (kompatibel dengan penambahan API)')
  st.setBots([{ botId: 'b1' }, { botId: 'b2' }]); st.setCurrent('b2'); st.setBots([{ botId: 'b1' }]); ok(st.s.current === 'b1', 'bot terpilih yang hilang dari daftar -> beralih ke bot pertama')
  console.log('--- form')
  const { fieldsFromSchema: ff, collectParams: cp } = mods['form.mjs']
  const sch = { required: ['block'], properties: { block: { type: 'string' }, count: { type: 'integer' }, dig: { enum: ['natural', 'any'] }, guard: { type: 'boolean' }, chest: { type: ['boolean', 'string', 'object'] }, crops: { type: ['array', 'string'] }, y: { type: 'number' } } }
  const f = ff(sch); ok(f.find(x => x.key === 'count').kind === 'integer' && f.find(x => x.key === 'dig').kind === 'enum' && f.find(x => x.key === 'chest').kind === 'json' && f.find(x => x.key === 'block').required, 'fieldsFromSchema: jenis bidang dan wajib benar')
  let r = cp(f, { block: ' stone ', count: '8', dig: 'any', guard: 'false', chest: 'true', crops: 'wheat,carrots', y: '64.5' }); ok(r.errors.length === 0 && r.params.block === 'stone' && r.params.count === 8 && r.params.guard === false && r.params.chest === true && r.params.crops === 'wheat,carrots' && r.params.y === 64.5, 'collectParams: tipe dikonversi (int, boolean, "true"->true, teks multi-tipe)')
  r = cp(f, { block: 'x', chest: '{"x":1,"y":2,"z":3}', crops: '["wheat"]' }); ok(r.params.chest.z === 3 && r.params.crops[0] === 'wheat', 'objek/larik JSON diparse')
  r = cp(f, { count: '3.5', dig: 'zzz', guard: 'mungkin', y: 'abc', chest: '{rusak' }); ok(r.errors.length === 6 && /block wajib/.test(r.errors[0]), 'kesalahan: wajib, bukan bulat, enum salah, bukan boolean, bukan angka, JSON rusak (' + r.errors.length + ')')
  r = cp(f, { block: 'x', count: '', dig: '' }); ok(r.errors.length === 0 && !('count' in r.params), 'bidang kosong dilewati')
  console.log('--- viewer 3D')
  const viewer = mods['viewer.mjs']; const goodViewer = viewer.safeViewerUrl('http://127.0.0.1:3007/x?q=1')
  ok(goodViewer === 'http://127.0.0.1:3007/' && viewer.safeViewerUrl('javascript:alert(1)') === null && viewer.safeViewerUrl('http://evil.test:3007') === null && viewer.safeViewerUrl('http://127.0.0.1') === null, 'viewer: hanya URL loopback dengan port sah diterima')
  const vh = new El('div'); const vc = viewer.viewerCard({ viewer: async () => ({ enabled: true, desired: true, state: 'ready', botId: evil, port: 3007, url: 'http://127.0.0.1:3007' }) }, () => 'b1'); await vc.load()
  const firstFrame = vc.el.children[1].children[0]; await vc.load()
  ok(tags(vc.el).includes('iframe') && tags(vc.el).includes('a') && vc.el.textContent.includes(evil) && !tags(vc.el).includes('script'), 'viewer aktif: iframe + tautan, botId bermusuhan tetap teks')
  ok(vc.el.children[1].children[0] === firstFrame, 'poll status viewer yang sama mempertahankan iframe (tidak restart)')
  vc.render({ enabled: false, reason: 'mati untuk tes' }); ok(!tags(vc.el).includes('iframe') && /mati untuk tes/.test(vc.el.textContent), 'viewer mati: alasan tampil dan UI tetap hidup')
  vc.render({ enabled: true, state: 'ready', url: 'javascript:alert(1)' }); ok(!tags(vc.el).includes('iframe') && /ditolak/.test(vc.el.textContent), 'viewer: URL berbahaya tidak dipasang ke iframe')
  console.log('--- peta')
  const { buildMap } = require('../control/map'); const { decodeMap, worldOf, cellOf, colorOf } = mods['mapview.mjs']
  const bot = { entity: { position: new Vec3(0.5, 64, 0.5), yaw: 0 }, entities: {}, blockAt: p => (p.x === 3 && p.z === -2 && p.y <= 66 && p.y >= 64) ? { name: 'stone' } : p.y <= 63 ? { name: 'grass_block' } : { name: 'air' } }
  const snap = buildMap(bot, { r: 6 }); const dec = decodeMap(snap); const w = worldOf(snap, 9, 4); const c = cellOf(snap, w.x, w.z)
  ok(dec.size === 13 && dec.rows[4][9].name === 'stone' && dec.rows[4][9].y === 66 && w.x === 3 && w.z === -2 && c.col === 9 && c.row === 4, 'decodeMap/worldOf/cellOf konsisten dengan control/map.js (sel stone y=66 di 3,-2)')
  ok(colorOf('grass_block') === '#4f8f3a' && colorOf('xyz:mod') === colorOf('xyz:mod') && colorOf('xyz:mod') !== colorOf('lain:blok') && /^hsl/.test(colorOf('xyz:mod')), 'warna: tetap untuk blok umum, deterministik dan berbeda untuk blok asing')
  console.log('--- klien API')
  const { createApi, connectEvents } = mods['api.mjs']; const calls = []; const api = createApi({ fetchImpl: async (u, o) => { calls.push({ u, o }); return u.includes('gagal') ? { ok: false, status: 409, json: async () => ({ error: 'sudah ada' }) } : { ok: true, status: 200, json: async () => ({ ok: 1 }) } } })
  await api.state('bot/a b'); await api.enqueue('b1', { skill: 'x' }); await api.approve('b1', 'p 1'); await api.map('b1', 24); await api.setViewer('b1', true); await api.updateSettings('b1', { motion: false })
  ok(calls[0].u === '/bots/bot%2Fa%20b' && calls[1].u === '/bots/b1/tasks' && calls[1].o.method === 'POST' && JSON.parse(calls[1].o.body).skill === 'x' && calls[2].u === '/bots/b1/director/proposals/p%201/approve' && calls[3].u === '/bots/b1/map?r=24' && calls[4].u === '/bots/b1/viewer' && JSON.parse(calls[4].o.body).enabled === true && calls[5].u === '/bots/b1/settings', 'URL dan metode API bot/settings/viewer benar')
  ok(calls.every(x => x.o.credentials === 'same-origin' && !/token/i.test(x.u) && !(x.o.headers && x.o.headers.authorization)), 'semua permintaan same-origin dengan cookie; tidak ada token di URL/header')
  let er; try { await api.call('/gagal') } catch (e) { er = e } ok(er && er.status === 409 && er.message === 'sudah ada', 'galat server dipetakan (status + pesan)')
  let msgs = []; let inst; class FakeES { constructor (u) { this.u = u; inst = this } close () { this.closed = true } }; const stop = connectEvents({ url: '/events', onEvent: e => msgs.push(e), ES: FakeES, delays: [1] }); inst.onmessage({ data: '{"type":"a.b"}' }); inst.onmessage({ data: 'rusak' }); inst.onmessage({ data: '{"x":1}' }); ok(msgs.length === 1 && msgs[0].type === 'a.b', 'SSE: hanya event berformat benar yang diteruskan')
  const first = inst; first.onerror(); await new Promise(r => setTimeout(r, 30)); ok(first.closed && inst !== first, 'SSE: terputus -> menutup dan menyambung ulang'); stop()
  console.log('--- mutasi store')
  const src = fs.readFileSync(path.join(JS, 'store.mjs'), 'utf8'); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcadia-uimut-'))
  for (const g of ['SEQ', 'MONO', 'OTHER']) { const m = mutate(src, g); ok(m !== src, 'mutan ' + g + ' dibuat'); const fp = path.join(dir, 'store-' + g + '.mjs'); fs.writeFileSync(fp, m); let b = -1; try { b = await storeSuite(fp, true) } catch (e) { b = 99 } ok(b > 0, 'tanpa penjaga ' + g + ': ' + b + ' tes gagal (harus > 0)') }
  console.log('\nHASIL: ' + pass + ' lulus, ' + fail + ' gagal'); process.exit(fail ? 1 : 0)
})().catch(e => { console.error('CRASH', e); process.exit(2) })
