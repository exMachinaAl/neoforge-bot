// tests/guard.test.js - guard.post, guard.follow, lintasan panah (bot tiruan; hasil di server BELUM DIUJI)
const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const { mkInv } = require('./invmock')
const { createRunner } = require('../skills')
const C = require('../skills/_combat')
let pass = 0; let fail = 0
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m) }

function mk (o = {}) {
  const b = mkInv(o)
  b.goals = []; b.looks = []; b.shots = 0
  b.pathfinder.setGoal = g => { b.goals.push(g) }
  b.lookAt = async p => { b.looks.push(p) }
  b.deactivateItem = () => { b.shots++; if (o.killOnShot) { const e = Object.values(b.entities).find(x => x.name === o.killOnShot); if (e) { delete b.entities[e.id]; b.emit('entityDead', e) } } }
  b.mob = (id, name, x, z, y = 64, type = 'hostile') => { b.entities[id] = { id, name, type, position: new Vec3(x, y, z), height: 1.95, velocity: new Vec3(0, 0, 0) }; return b.entities[id] }
  b.owner = (name, x, z) => { const e = { id: 900, username: name, type: 'player', position: new Vec3(x, 64, z), height: 1.8 }; b.entities[900] = e; b.players = { [name]: { entity: e } }; return e }
  return b
}
const run = (b, skill, p) => createRunner(b).run(skill, p)
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  let b, o

  // ---- lintasan panah ----
  const cases = [[10, 0], [20, 0], [20, 3], [28, -4], [6, 1]]
  ok(cases.every(([x, dy]) => { const s = C.launchAngle(x, dy); return s && Math.abs(C.flight(s.theta, x).y - dy) < 0.02 }), 'panah: sudut luncur mengenai titik (x,dy) dalam 0.02 blok untuk 5 kasus')
  ok(C.launchAngle(300, 0) === null, 'panah: di luar jangkauan -> null (bidik lurus)')
  b = mk({}); b.entity.position = new Vec3(0.5, 64, 0.5)
  const tgt = { position: new Vec3(20.5, 64, 0.5), height: 1.95 }
  const p0 = C.aimPoint(b, tgt); const center = 64 + 1.95 * 0.6
  ok(p0.y > center && Math.abs(p0.z - 0.5) < 1e-6 && p0.x > 0.5, 'panah: titik bidik di atas pusat target (kompensasi gravitasi), arah mendatar lurus ke target')
  const p1 = C.aimPoint(b, tgt, new Vec3(0, 0, 0.2))
  ok(p1.z > p0.z + 0.5 && Math.abs(p1.x - p0.x) < 1, 'panah: target bergerak ke +z -> titik bidik mendahului ke +z (lead)')

  // ---- guard.post ----
  b = mk({}); b.mob(1, 'zombie', 6.5, 0.5)
  o = await run(b, 'guard.post', { durationMs: 1500 })
  ok(o.ok && b.goals.some(g => g instanceof goals.GoalFollow && g.entity.id === 1), 'guard.post: zombie 6 blok dalam radius -> dikejar (GoalFollow ke zombie)')
  b = mk({}); b.mob(1, 'zombie', 2.5, 0.5)
  o = await run(b, 'guard.post', { durationMs: 2500 })
  ok(o.ok && o.data.kills === 1 && o.data.hits >= 2, 'guard.post: zombie dalam jangkauan serang -> diserang sampai mati (melee)')
  b = mk({}); b.mob(1, 'zombie', 30.5, 0.5)
  o = await run(b, 'guard.post', { radius: 8, durationMs: 2000 })
  ok(o.ok && o.data.kills === 0 && b.attacks === 0, 'guard.post: hostile di luar radius diabaikan')
  b = mk({}); b.mob(1, 'enderman', 4.5, 0.5)
  o = await run(b, 'guard.post', { durationMs: 2000 })
  ok(o.ok && b.attacks === 0, 'guard.post: enderman dilewati secara default')
  b = mk({}); b.mob(1, 'enderman', 3, 0.5)
  o = await run(b, 'guard.post', { durationMs: 2500, targets: 'enderman' })
  ok(o.ok && o.data.kills === 1, 'guard.post: enderman diserang bila disebut di targets')
  b = mk({ mk: { health: 4 } }); b.mob(1, 'zombie', 3, 0.5)
  o = await run(b, 'guard.post', { durationMs: 2000, minHealth: 8 })
  ok(o.ok && b.attacks === 0 && o.data.retreats === 1, 'guard.post: HP di bawah minHealth -> tidak menyerang, tercatat mundur (1x walau berulang)')
  b = mk({}); b.mob(1, 'zombie', 3, 0.5); b.entity.position = new Vec3(20, 64, 0)
  o = await run(b, 'guard.post', { x: 0.5, y: 64, z: 0.5, radius: 8, leash: 10, durationMs: 1500 })
  ok(o.ok && b.attacks === 0, 'guard.post: bot di luar leash tidak mengejar (kembali ke pos dulu)')
  b = mk({ mk: { gameMode: 'creative', mode: 'creative' } }); o = await run(b, 'guard.post', { durationMs: 2000 })
  ok(!o.ok && o.code === 'PRECONDITION_FAILED', 'guard.post: mode creative ditolak')
  b = mk({}); const t0 = Date.now(); o = await run(b, 'guard.post', { durationMs: 2000 })
  ok(o.ok && Date.now() - t0 < 3500 && o.data.durationMs >= 1900, 'guard.post: berhenti OK saat durasi habis (2 dtk)')

  // ---- memanah ----
  const kit = { 9: ['bow', 1], 10: ['arrow', 20] }
  b = mk({ inv: kit, killOnShot: 'skeleton' }); b.mob(1, 'skeleton', 15.5, 0.5)
  o = await run(b, 'guard.post', { durationMs: 4000, radius: 20 })
  const ay = b.looks.length ? b.looks[b.looks.length - 1].y : 0
  ok(o.ok && o.data.shots === 1 && o.data.kills === 1 && b.attacks === 0 && b.equipped.includes('bow') && b._act >= 1 && ay > 64 + 1.95 * 0.6, 'guard.post: skeleton 15 blok dipanah (busur dipegang, ditarik, dilepas, bidik di atas pusat) dan mati')
  b = mk({ inv: kit }); b.mob(1, 'skeleton', 15.5, 0.5)
  o = await run(b, 'guard.post', { durationMs: 2500, radius: 20, ranged: false })
  ok(o.ok && b.shots === 0 && !b._act, 'guard.post: ranged=false -> tidak memanah walau ada busur')
  b = mk({ inv: { 9: ['bow', 1] } }); b.mob(1, 'skeleton', 15.5, 0.5)
  o = await run(b, 'guard.post', { durationMs: 2500, radius: 20 })
  ok(o.ok && b.shots === 0 && !b._act, 'guard.post: busur tanpa panah -> tidak memanah')
  b = mk({ inv: kit }); b.mob(1, 'zombie', 3.5, 0.5)
  o = await run(b, 'guard.post', { durationMs: 2500 })
  ok(o.ok && b.shots === 0 && o.data.kills === 1, 'guard.post: musuh dekat (<5 blok) -> melee walau ada busur')
  b = mk({ inv: kit }); b.mob(1, 'skeleton', 15.5, 0.5); b.world = { raycast: () => ({ position: new Vec3(8, 64, 0.5) }) }
  o = await run(b, 'guard.post', { durationMs: 2000, radius: 20 })
  ok(o.ok && b.shots === 0, 'guard.post: terhalang blok (raycast kena) -> tidak memanah')

  // ---- guard.follow ----
  b = mk({}); b.owner('Steve', 3.5, 0.5); b.mob(1, 'zombie', 2.5, 0.5)
  o = await run(b, 'guard.follow', { player: 'Steve', durationMs: 3000 })
  ok(o.ok && o.data.kills === 1 && b.goals.some(g => g instanceof goals.GoalFollow && g.entity && g.entity.username === 'Steve'), 'guard.follow: mengikuti Steve (GoalFollow) dan membunuh zombie di dekat Steve')
  ok(b.arcadia.companion.owner === 'Steve' && b.arcadia.companion.followedMs >= 2000 && b.arcadia.companion.kills === 1 && b.arcadia.companion.sessions === 1, 'guard.follow: catatan companion (waktu bersama, kill, sesi) tersimpan untuk affection nanti')
  b = mk({}); b.owner('Steve', 3.5, 0.5)
  o = await run(b, 'guard.follow', { durationMs: 2000 })
  ok(o.ok && o.data.owner === 'Steve', 'guard.follow: tanpa param player -> memakai pemain terdekat')
  b = mk({}); o = await run(b, 'guard.follow', { durationMs: 2000 })
  ok(!o.ok && o.code === 'PRECONDITION_FAILED' && /param player/.test(o.error), 'guard.follow: tidak ada pemain di dekat -> minta param player')
  b = mk({}); b.players = { Alex: {} }; o = await run(b, 'guard.follow', { player: 'Alex', durationMs: 2000 })
  ok(!o.ok && o.code === 'TARGET_NOT_FOUND' && /tidak terlihat/.test(o.error), 'guard.follow: pemain tak terlihat -> TARGET_NOT_FOUND')
  b = mk({}); const ow = b.owner('Steve', 3.5, 0.5); b.mob(1, 'zombie', 5.5, 0.5); b.entities[1].name = 'zombie'
  setTimeout(() => { delete b.players.Steve.entity }, 400)
  o = await run(b, 'guard.follow', { player: 'Steve', durationMs: 30000, lostTimeoutMs: 5000 })
  ok(!o.ok && o.code === 'TARGET_NOT_FOUND' && /hilang/.test(o.error) && o.data.durationMs < 9000 && b.arcadia.companion.sessions === 1, 'guard.follow: pemain hilang > lostTimeoutMs -> berhenti TARGET_NOT_FOUND dengan statistik, companion tetap tercatat')
  b = mk({ mk: { health: 4 } }); b.owner('Steve', 3.5, 0.5); b.mob(1, 'zombie', 5.5, 0.5)
  o = await run(b, 'guard.follow', { player: 'Steve', durationMs: 2000 })
  ok(o.ok && b.attacks === 0 && o.data.retreats === 1 && b.goals.some(g => g instanceof goals.GoalFollow), 'guard.follow: HP rendah -> tetap dekat pemain tanpa menyerang')
  ok(createRunner(mk({})).parse('guard.follow', ['Steve', '6']).player === 'Steve' && createRunner(mk({})).parse('guard.post', ['14']).radius === 14, 'CLI posisional: guard.follow player distance, guard.post radius')

  console.log('\nHASIL: ' + pass + ' lulus, ' + fail + ' gagal')
  process.exit(fail ? 1 : 0)
})().catch(e => { console.log('EXCEPTION', e); process.exit(1) })
