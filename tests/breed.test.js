// tests/breed.test.js - breed.animals (bot tiruan: hewan, pemberian makan, anak lahir lewat event entitySpawn)
const fs = require('fs'); const os = require('os'); const path = require('path')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'arcadia-breed-'))
process.env.ARCADIA_DATA_DIR = TMP
const { Vec3 } = require('vec3')
const { mkInv } = require('./invmock')
const { createRunner } = require('../skills')
const { createEngine } = require('../engine')
const { FOOD } = require('../skills/breed.animals')
let pass = 0; let fail = 0
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m) }

function mk (o = {}) {
  const b = mkInv(o)
  b.activations = []; b.fed = new Set(); let nextId = 1000
  b.lookAt = async () => {}
  b.addAnimal = (id, name, x, z, metadata = []) => { b.entities[id] = { id, name, position: new Vec3(x, 64, z), height: 1.4, metadata }; return b.entities[id] }
  const consume = name => {
    for (let s = 9; s <= 44; s++) { const x = b.inventory.slots[s]; if (x && x.name === name) { x.count--; b._srvInv[s].count--; if (x.count <= 0) { b.inventory.slots[s] = null; b._srvInv[s] = null } return } }
  }
  b.activateEntity = async e => {
    b.activations.push(e.id)
    const held = b.heldItem
    if (!held || o.ignoreFeed) return
    if (!(FOOD[e.name] || []).includes(held.name) || b.fed.has(e.id)) return
    consume(held.name); b.fed.add(e.id)
    const mates = [...b.fed].map(id => b.entities[id]).filter(x => x && x.name === e.name)
    if (mates.length >= 2 && !o.noBaby) {
      const [m1, m2] = mates; b.fed.delete(m1.id); b.fed.delete(m2.id)
      setTimeout(() => { const baby = { id: nextId++, name: e.name, position: m1.position.offset(0.5, 0, 0.5), height: 0.7, metadata: [] }; b.entities[baby.id] = baby; b.emit('entitySpawn', baby) }, 40)
    }
  }
  return b
}
const cnt = (b, name) => b.inventory.slots.filter(i => i && i.name === name).reduce((a, i) => a + i.count, 0)
const babies = b => Object.values(b.entities).filter(e => e.id >= 1000).length

;(async () => {
  let b, r, o

  b = mk({ inv: { 9: ['wheat', 4] } }); b.addAnimal(1, 'cow', 3, 2); b.addAnimal(2, 'cow', 4, 2); r = createRunner(b)
  ok(r.skills['breed.animals'] && r.parse('breed.animals', ['cow', '2']).species === 'cow' && r.parse('breed.animals', ['cow', '2']).pairs === 2, 'breed: skill terdaftar, CLI posisional species pairs')
  o = await r.run('breed.animals', { species: 'cow' })
  ok(o.ok && o.data.babies === 1 && o.data.fed === 2 && o.data.foodUsed.wheat === 2 && cnt(b, 'wheat') === 2 && babies(b) === 1 && b.equipped.includes('wheat'), 'breed: 2 sapi + wheat -> keduanya diberi makan, 1 anak lahir, wheat berkurang 2')
  ok(b.activations.join() === '1,2' && o.data.attempts[0].result === 'anak lahir', 'breed: urutan pemberian makan A lalu B tercatat')

  b = mk({ inv: { 9: ['wheat', 4] } }); b.addAnimal(1, 'cow', 3, 2); b.addAnimal(2, 'cow', 4, 2); r = createRunner(b)
  await r.run('breed.animals', { species: 'cow' })
  o = await r.run('breed.animals', { species: 'cow' })
  ok(!o.ok && o.code === 'TARGET_NOT_FOUND' && /kurang dari 2 cow dewasa/.test(o.error) && cnt(b, 'wheat') === 2, 'breed: pasangan yang baru kawin (cooldown 5 menit) tidak diberi makan lagi (makanan tidak terbuang)')

  b = mk({ inv: { 9: ['wheat', 8] } }); for (let i = 1; i <= 4; i++) b.addAnimal(i, 'cow', 2 + i, 2); r = createRunner(b)
  o = await r.run('breed.animals', { species: 'cow', pairs: 2 })
  ok(o.ok && o.data.babies === 2 && o.data.pairs === 2 && o.data.fed === 4 && !o.data.partial && cnt(b, 'wheat') === 4, 'breed: pairs=2 dengan 4 sapi -> 2 anak, pasangan kedua tidak memakai hewan pasangan pertama')
  b = mk({ inv: { 9: ['wheat', 8] } }); b.addAnimal(1, 'cow', 3, 2); b.addAnimal(2, 'cow', 4, 2); r = createRunner(b); o = await r.run('breed.animals', { species: 'cow', pairs: 3 })
  ok(o.ok && o.data.babies === 1 && o.data.partial === true && /kurang dari 2/.test(o.data.stoppedBy), 'breed: minta 3 pasangan tapi hanya cukup 1 -> sukses sebagian (partial) dengan alasan berhenti')

  // auto spesies
  b = mk({ inv: { 9: ['wheat', 4], 10: ['carrot', 6] } }); b.addAnimal(1, 'cow', 3, 2); b.addAnimal(2, 'cow', 4, 2); b.addAnimal(3, 'pig', 3, 4); b.addAnimal(4, 'pig', 4, 4); b.addAnimal(5, 'pig', 5, 4); b.addAnimal(6, 'pig', 6, 4); r = createRunner(b)
  o = await r.run('breed.animals', {})
  ok(o.ok && o.data.species === 'pig' && o.data.foodUsed.carrot === 2, 'breed auto: memilih spesies dengan pasangan & makanan terbanyak (pig 2 pasang vs cow 1) dan memakai carrot')
  b = mk({ inv: { 9: ['wheat_seeds', 4] } }); b.addAnimal(1, 'chicken', 3, 2); b.addAnimal(2, 'chicken', 4, 2); r = createRunner(b); o = await r.run('breed.animals', {})
  ok(o.ok && o.data.species === 'chicken' && o.data.foodUsed.wheat_seeds === 2, 'breed auto: ayam memakai wheat_seeds')
  b = mk({ inv: { 9: ['wheat', 4] } }); b.addAnimal(1, 'chicken', 3, 2); b.addAnimal(2, 'chicken', 4, 2); r = createRunner(b); o = await r.run('breed.animals', { species: 'chicken' })
  ok(!o.ok && o.code === 'PRECONDITION_FAILED' && /wheat_seeds/.test(o.error) && b.activations.length === 0, 'breed: makanan salah (wheat untuk ayam) -> ditolak sebelum memberi makan, sebut makanan yang benar')

  // gagal dengan alasan jelas
  b = mk({}); b.addAnimal(1, 'cow', 3, 2); b.addAnimal(2, 'cow', 4, 2); r = createRunner(b); o = await r.run('breed.animals', { species: 'cow' })
  ok(!o.ok && o.code === 'PRECONDITION_FAILED' && /butuh >=2 wheat/.test(o.error), 'breed: tanpa makanan -> PRECONDITION_FAILED menyebut item yang dibutuhkan')
  b = mk({ inv: { 9: ['wheat', 1] } }); b.addAnimal(1, 'cow', 3, 2); b.addAnimal(2, 'cow', 4, 2); r = createRunner(b); o = await r.run('breed.animals', { species: 'cow' })
  ok(!o.ok && /ada 1/.test(o.error) && b.activations.length === 0, 'breed: makanan hanya 1 -> ditolak (butuh 2 untuk sepasang)')
  b = mk({ inv: { 9: ['wheat', 4] } }); b.addAnimal(1, 'cow', 3, 2); r = createRunner(b); o = await r.run('breed.animals', { species: 'cow' })
  ok(!o.ok && o.code === 'TARGET_NOT_FOUND' && /kurang dari 2 cow dewasa/.test(o.error), 'breed: hanya 1 sapi -> TARGET_NOT_FOUND')
  b = mk({ inv: { 9: ['wheat', 4] } }); b.addAnimal(1, 'cow', 3, 2); b.addAnimal(2, 'cow', 4, 2, [...Array(16).fill(null), true]); r = createRunner(b); o = await r.run('breed.animals', { species: 'cow' })
  ok(!o.ok && o.code === 'TARGET_NOT_FOUND' && b.activations.length === 0, 'breed: anak sapi (metadata[16]=true) tidak dihitung dewasa dan tidak diberi makan')
  b = mk({ inv: { 9: ['wheat', 4] } }); b.addAnimal(1, 'cow', 3, 2); b.addAnimal(2, 'cow', 40, 2); r = createRunner(b); o = await r.run('breed.animals', { species: 'cow', radius: 10 })
  ok(!o.ok && o.code === 'TARGET_NOT_FOUND', 'breed: hewan di luar radius tidak dihitung')
  b = mk({ inv: { 9: ['wheat', 4] } }); r = createRunner(b); o = await r.run('breed.animals', {})
  ok(!o.ok && o.code === 'TARGET_NOT_FOUND' && /butuh >=2 dewasa/.test(o.error), 'breed auto: tidak ada hewan -> TARGET_NOT_FOUND dengan syarat yang jelas')
  b = mk({ inv: { 9: ['wheat', 4] } }); r = createRunner(b); o = await r.run('breed.animals', { species: 'dragon' })
  ok(!o.ok && o.code === 'PRECONDITION_FAILED' && /belum didukung/.test(o.error), 'breed: spesies tidak didukung ditolak, daftar didukung disebut')
  b = mk({ inv: { 9: ['wheat', 4] }, ignoreFeed: true }); b.addAnimal(1, 'cow', 3, 2); b.addAnimal(2, 'cow', 4, 2); r = createRunner(b); o = await r.run('breed.animals', { species: 'cow' })
  ok(!o.ok && /tidak dimakan/.test(o.data.stoppedBy) && o.data.fed === 0 && cnt(b, 'wheat') === 4, 'breed: server mengabaikan pemberian makan -> gagal jelas, tidak dikira berhasil')
  b = mk({ inv: { 9: ['wheat', 4] }, noBaby: true }); b.addAnimal(1, 'cow', 3, 2); b.addAnimal(2, 'cow', 4, 2); r = createRunner(b); o = await r.run('breed.animals', { species: 'cow', waitMs: 1000 })
  ok(!o.ok && o.code === 'TIMEOUT' && o.data.fed === 2 && /tidak ada anak lahir/.test(o.error) && /cooldown/.test(o.error), 'breed: kedua hewan diberi makan tapi tak ada anak -> TIMEOUT dengan kemungkinan penyebab')
  b = mk({ inv: { 9: ['wheat', 4] }, noBaby: true }); b.addAnimal(1, 'cow', 3, 2); b.addAnimal(2, 'cow', 4, 2); r = createRunner(b); await r.run('breed.animals', { species: 'cow', waitMs: 1000 })
  o = await r.run('breed.animals', { species: 'cow', waitMs: 1000 })
  ok(!o.ok && /kurang dari 2/.test(o.error), 'breed: pasangan gagal diberi jeda 60 dtk (tidak langsung diberi makan lagi)')

  // sinkron inventory
  b = mk({ hiddenInv: [{ slot: 20, id: 'minecraft:wheat', count: 4 }] }); b.addAnimal(1, 'cow', 3, 2); b.addAnimal(2, 'cow', 4, 2); r = createRunner(b); o = await r.run('breed.animals', { species: 'cow' })
  ok(o.ok && o.data.sync.refreshed && o.data.sync.hydrated === 1 && o.data.foodUsed.wheat === 2, 'breed: makanan yang dibawa sebelum spawn (tak terbaca bot) dipulihkan lewat sinkron server lalu dipakai')
  b = mk({ hiddenInv: [{ slot: 20, id: 'minecraft:wheat', count: 4 }] }); b.addAnimal(1, 'cow', 3, 2); b.addAnimal(2, 'cow', 4, 2); r = createRunner(b); o = await r.run('breed.animals', { species: 'cow', refresh: false })
  ok(!o.ok && /butuh >=2 wheat/.test(o.error), 'breed: refresh=false -> makanan tak terbaca tidak dihitung')
  b = mk({ inv: { 9: ['wheat', 4] } }); b.addAnimal(1, 'cow', 3, 2); b.addAnimal(2, 'cow', 4, 2); r = createRunner(b); const eng = createEngine(b, r)
  o = await r.run('breed.animals', { species: 'cow' })
  ok(o.ok && o.data.inventoryRefreshed === true && eng.state().inventory.items.some(i => i.name === 'wheat' && i.count === 2), 'breed: setelah kawin, catatan inventory (BotState) menunjukkan sisa wheat')
  b = mk({ inv: { 9: ['wheat', 4] }, noOp: true }); b.addAnimal(1, 'cow', 3, 2); b.addAnimal(2, 'cow', 4, 2); r = createRunner(b); o = await r.run('breed.animals', { species: 'cow' })
  ok(o.ok && o.data.sync.refreshed === false && o.data.babies === 1, 'breed: tanpa op sinkron dilewati, kawin tetap jalan dari tampilan bot')
  b = mk({ inv: { 9: ['wheat', 4] } }); b.addAnimal(1, 'cow', 3, 2); b.addAnimal(2, 'cow', 4, 2); r = createRunner(b); o = await r.run('breed.animals', { species: 'cow', refresh: false })
  ok(o.ok && !(b.sent || []).length, 'breed: refresh=false -> tanpa perintah /data')

  // daftar makanan sah di minecraft-data
  const md = require('./mock').mcData
  ok(Object.values(FOOD).flat().every(n => md.itemsByName[n]) && Object.keys(FOOD).every(n => md.entitiesByName[n]), 'breed: semua nama makanan & hewan di tabel FOOD ada di minecraft-data 1.21.1')

  fs.rmSync(TMP, { recursive: true, force: true })
  console.log('\nHASIL: ' + pass + ' lulus, ' + fail + ' gagal')
  process.exit(fail ? 1 : 0)
})().catch(e => { console.log('EXCEPTION', e); process.exit(1) })
