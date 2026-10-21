// tests/map.test.js - control/map.js + control/viewer3d.js (bot tiruan; viewer 3D: hanya pembungkus bind, paketnya TIDAK dijalankan)
const http = require('http'); const EE = require('events'); const { Vec3 } = require('vec3')
const { buildMap } = require('../control/map'); const { startViewer3d, withLoopbackListen } = require('../control/viewer3d')
let pass = 0; let fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m) }
function world (o = {}) {
  const bot = { entity: { position: new Vec3(0.5, 64, 0.5), yaw: 1.5 }, entities: {} }
  const B = n => ({ name: n })
  bot.blockAt = p => {
    if (o.unloaded && p.x > 5) return null
    if (p.x === 3 && p.z === 3 && p.y >= 64 && p.y <= 67) return B('stone')   // bukit setinggi y=67
    if (p.x === 2 && p.z === 2 && p.y === 63) return B('')                      // blok modded
    if (p.x === -2 && p.z === 0 && p.y === 63) return B('water')
    if (p.y <= 63) return B('grass_block'); return B('air')
  }
  return bot
}
const dec = m => { const out = []; for (let z = 0; z < m.rows.length; z++) for (let x = 0; x < m.rows[z].length; x++) out.push({ x: m.center.x - m.r + x, z: m.center.z - m.r + z, name: m.legend[m.rows[z][x]], y: m.baseY + parseInt(m.hs[z][x], 36) }); return out }
;(async () => {
  let b = world(); let m = buildMap(b, { r: 8 }); const cells = dec(m); const at = (x, z) => cells.find(c => c.x === x && c.z === z)
  ok(m.rows.length === 17 && m.rows.every(r => r.length === 17) && m.hs.length === 17 && m.r === 8, 'grid 2r+1 persegi (r=8 -> 17x17)')
  ok(at(0, 0).name === 'grass_block' && at(0, 0).y === 63, 'permukaan datar = grass_block di y=63')
  ok(at(3, 3).name === 'stone' && at(3, 3).y === 67, 'bukit: blok teratas dipilih (stone y=67), bukan lantai')
  ok(at(2, 2).name === 'modded/tak dikenal' && m.rows[2 + 8 - 0 + 0 - 8 + 0].length > 0 && m.legend['?'] === 'modded/tak dikenal', 'blok modded (nama kosong) -> "?"')
  ok(at(-2, 0).name === 'water', 'air tercatat di legenda')
  b = world({ unloaded: true }); m = buildMap(b, { r: 8 }); ok(dec(m).filter(c => c.x > 5).every(c => c.name === 'belum dimuat') && dec(m).filter(c => c.x <= 5).every(c => c.name !== 'belum dimuat'), 'chunk belum dimuat (null) -> sel kosong, sisanya normal')
  // anggaran waktu
  b = world(); let tick = 0; m = buildMap(b, { r: 16, budgetMs: 5, now: () => (tick += 3) }); ok(m.partial === true && m.rows.length === 33 && /^ +$/.test(m.rows[32]), 'melewati anggaran waktu -> partial, baris sisa kosong, ukuran tetap')
  // ukuran
  m = buildMap(world(), { r: 99 }); ok(m.r === 32 && JSON.stringify(m).length < 20000, 'r dijepit 32; JSON r=32 < 20 KB (' + JSON.stringify(m).length + ' B)')
  m = buildMap(world(), { r: 1 }); ok(m.r === 4, 'r dijepit minimal 4')
  // entitas
  b = world(); b.entities[1] = { id: 1, name: 'cow', position: new Vec3(2, 64, 2) }; b.entities[2] = { id: 2, name: 'zombie', position: new Vec3(100, 64, 0) }; b.entities[3] = b.entity; for (let i = 10; i < 120; i++) b.entities[i] = { id: i, type: 'mob', position: new Vec3(1, 64, 1) }
  m = buildMap(b, { r: 8 }); ok(m.entities.length === 64 && m.entities.some(e => e.kind === 'cow') && !m.entities.some(e => e.kind === 'zombie') && !m.entities.some(e => e.id === 3), 'entitas: dibatasi 64, di luar jangkauan dan bot sendiri dikecualikan')
  ok(m.self.x === 0.5 && m.self.yaw === 1.5, 'posisi sendiri + yaw disertakan')
  // viewer 3D (pembungkus bind)
  const srv = http.createServer(); await new Promise(r => withLoopbackListen(() => srv.listen(0, r))); ok(srv.address().address === '127.0.0.1', 'listen(port) tanpa host dipaksa ke 127.0.0.1'); await new Promise(r => srv.close(r))
  const s2 = http.createServer(); await new Promise(r => s2.listen(0, r)); ok(s2.address().address !== '127.0.0.1', 'di luar pembungkus: perilaku asli dipulihkan (semua interface)'); await new Promise(r => s2.close(r))
  const waiting = new EE(); waiting.username = 'DefaultOn'; const vd = startViewer3d(waiting, {}, () => ({ mineflayer: () => {} })); ok(vd.enabled === true && vd.desired === true && vd.state === 'waiting_spawn', 'viewer aktif secara bawaan tanpa env')
  ok(/prismarine-viewer/.test(startViewer3d({}, {}, () => { const e = new Error("Cannot find module 'prismarine-viewer'"); e.code = 'MODULE_NOT_FOUND'; throw e }).reason), 'paket tak terpasang -> alasan jelas, tanpa crash')
  let got; const vb = new EE(); vb.tag = 'bot'; vb.username = 'BotA'; const v = startViewer3d(vb, { basePort: 3999 }, () => ({ mineflayer: (bot, o) => { got = { bot, o } } })); ok(v.enabled && v.state === 'waiting_spawn' && v.mode === 'eagle' && !got, 'viewer tiap bot menunggu spawn dan melaporkan mode eagle'); vb.entity = {}; vb.emit('spawn'); ok(v.url === 'http://127.0.0.1:3999/' && got.o.port === 3999 && got.o.firstPerson === false && got.bot.tag === 'bot', 'setelah spawn: port dasar dan third-person diteruskan ke paket')
  // viewer-port-per-bot-v1: dua bot dengan base sama mendapat port berbeda.
  const probe = http.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); const base = probe.address().port; await new Promise(r => probe.close(r))
  const fake = () => ({ mineflayer: (bot, o) => { const server = http.createServer((q, s) => s.end(bot.username)); server.listen(o.port); bot.viewer = { close: () => server.close() } } })
  const a = new EE(); a.username = 'A'; a.entity = {}; const c = new EE(); c.username = 'C'; c.entity = {}
  const va = startViewer3d(a, { basePort: base }, fake); const vc = startViewer3d(c, { basePort: base }, fake)
  await new Promise(r => setTimeout(r, 80)); ok(va.state === 'ready' && vc.state === 'ready' && va.port !== vc.port && va.botId === 'A' && vc.botId === 'C', 'setiap bot mendapat viewer ready dan port bebas sendiri'); va.setEnabled(false); ok(va.state === 'off' && va.desired === false && !va.enabled, 'viewer dapat dimatikan lewat runtime toggle'); va.close(); vc.close()
  ok(startViewer3d({}, {}, () => ({ mineflayer: () => { throw new Error('gagal') } })).enabled === false, 'galat saat start -> enabled=false')
  console.log('\nHASIL: ' + pass + ' lulus, ' + fail + ' gagal'); process.exit(fail ? 1 : 0)
})()
