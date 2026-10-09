// tests/sleep.test.js - sleep.auto (bot tiruan mandiri: dunia kecil, bed asli prismarine-block, model server sederhana)
const EE = require('events'); const { Vec3 } = require('vec3')
const mcData = require('minecraft-data')('1.21.1'); const registry = require('prismarine-registry')('1.21.1')
const Block = require('prismarine-block')(registry)
const sk = require('../skills/sleep.auto.js')
const { validate, compile } = require('../contracts/validate')
let pass = 0; let fail = 0
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m) }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const K = p => p.x + ',' + p.y + ',' + p.z
const bedItem = n => mcData.itemsByName[n].id
const isBedName = n => /_bed$/.test(n)
const FACING = { '0,-1': 'north', '1,0': 'east', '0,1': 'south', '-1,0': 'west' }

function mk (o = {}) {
  const bot = new EE(); const world = new Map()
  const set = (name, x, y, z, props) => { const b = props ? Block.fromProperties(name, props, 0) : Block.fromStateId(mcData.blocksByName[name].minStateId, 0); b.position = new Vec3(x, y, z); world.set(K(b.position), b); return b }
  const R = o.size || 10
  for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) set('stone', x, 63, z)
  const bed = (name, x, y, z, dx, dz, occ) => { set(name, x, y, z, { facing: FACING[dx + ',' + dz], occupied: !!occ, part: 'foot' }); set(name, x + dx, y, z + dz, { facing: FACING[dx + ',' + dz], occupied: !!occ, part: 'head' }) }
  bot._set = set; bot._bed = bed; bot._world = world
  bot.version = '1.21.1'; bot.registry = registry
  bot.game = { gameMode: o.mode || 'survival', dimension: o.dim || 'overworld' }
  bot.time = { timeOfDay: o.time ?? 14000, isDay: (o.time ?? 14000) < 13000, doDaylightCycle: o.cycle ?? true, day: 3 }
  bot.isRaining = false; bot.thunderState = 0; bot.isSleeping = false
  bot.entity = { position: new Vec3(0.5, 64, 0.5), yaw: 0, id: 7 }; bot.entities = {}; bot.heldItem = null; bot.health = 20; bot.username = 'BotAlpha'
  const inv = []; bot._inv = inv
  bot.inventory = { items: () => inv.filter(i => i.count > 0) }
  bot._give = (name, n) => { const e = inv.find(i => i.name === name); if (e) e.count += n; else inv.push({ type: bedItem(name), name, count: n }) }
  bot.blockAt = p => { p = p.floored ? p.floored() : p; return world.get(K(p)) || (p.y >= 64 && Math.abs(p.x) <= R && Math.abs(p.z) <= R ? set('air', p.x, p.y, p.z) : null) }
  bot.findBlocks = q => { const ids = [].concat(q.matching); return [...world.values()].filter(b => ids.includes(b.type) && b.position.distanceTo(bot.entity.position) <= q.maxDistance).sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position)).slice(0, q.count || 1).map(b => b.position) }
  bot.isABed = b => isBedName(b.name)
  bot.canDigBlock = b => bot.entity.position.distanceTo(b.position.offset(0.5, 0.5, 0.5)) <= 5.5
  bot.lookAt = async pos => { bot.entity.yaw = Math.atan2(-(pos.x - bot.entity.position.x), -(pos.z - bot.entity.position.z)) }
  bot.equip = async it => { bot.heldItem = it }
  bot._places = 0; bot._refuse = o.refusePlace || 0
  bot.placeBlock = async (ref, face) => {
    bot._places++
    if (bot._refuse > 0) { bot._refuse--; throw new Error('Server refused to place bed') }
    if (!bot.heldItem || !isBedName(bot.heldItem.name)) throw new Error('tidak memegang bed')
    const f = ref.position.plus(face); const fw = [-Math.sin(bot.entity.yaw), -Math.cos(bot.entity.yaw)]
    const d = Math.abs(fw[0]) > Math.abs(fw[1]) ? [Math.sign(fw[0]), 0] : [0, Math.sign(fw[1])]
    const h = f.offset(d[0], 0, d[1])
    if (!['air', 'short_grass'].includes(bot.blockAt(h).name)) throw new Error('kepala bed terhalang')
    bot._lastPlace = { f, h, d }; bed(bot.heldItem.name, f.x, f.y, f.z, d[0], d[1], false)
    bot.heldItem.count--
  }
  bot._drops = []
  bot.dig = async b => { if (!isBedName(b.name)) throw new Error('bukan bed'); const q = [...world.values()].filter(x => isBedName(x.name) && x.position.distanceTo(b.position) <= 1.01); for (const x of q) set('air', x.position.x, x.position.y, x.position.z); if (bot.game.gameMode !== 'creative') bot._drops.push({ name: b.name, pos: b.position.clone() }) }
  bot._gotos = []
  bot.pathfinder = { setMovements () {}, stop () {}, setGoal () {}, goto: async goal => { bot._gotos.push(goal.constructor.name); await sleep(2); if (o.gotoErr) throw Object.assign(new Error('x'), { name: o.gotoErr }); bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5); for (let i = bot._drops.length - 1; i >= 0; i--) if (bot._drops[i].pos.distanceTo(bot.entity.position) <= 2.5) { bot._give(bot._drops[i].name, 1); bot._drops.splice(i, 1) } } }
  // model server untuk tidur
  const setOcc = (pos, occ) => { for (const x of [...world.values()].filter(x => isBedName(x.name) && x.position.distanceTo(pos) <= 1.01)) { const pr = x.getProperties(); set(x.name, x.position.x, x.position.y, x.position.z, { ...pr, occupied: occ }) } }
  let ticker = setInterval(() => { if (!o.frozen) { bot.time.timeOfDay = (bot.time.timeOfDay + 40) % 24000; bot.time.isDay = bot.time.timeOfDay < 13000 } }, 20)
  bot._stop = () => clearInterval(ticker)
  bot._monsterThrows = o.monsters || 0; bot._sleepCalls = 0; bot._wakeCalls = 0; bot._raw = 0; bot._bedHeldDuringSleep = false
  const wakeNow = pos => { setOcc(pos, false); bot.isSleeping = false; bot.emit('wake') }
  bot.sleep = async b => {
    bot._sleepCalls++
    const t = bot.time.timeOfDay
    if (!(t >= 12541 && t <= 23458)) throw new Error("it's not night and it's not a thunderstorm")
    if (b.getProperties().occupied) throw new Error('the bed is occupied')
    if (bot._monsterThrows > 0) { bot._monsterThrows--; throw new Error('there are monsters nearby') }
    if (bot.entity.position.distanceTo(b.position) > 4) throw new Error('the bed is too far')
    bot._bedHeldDuringSleep = [...world.values()].some(x => isBedName(x.name)); setOcc(b.position, true)
    if (o.dropSleepEvent) { await sleep(40); bot._sleepSilent = true; throw new Error('bot is not sleeping') }
    bot.isSleeping = true; bot.emit('sleep')
    bot._wakeTimer = setTimeout(() => { if (!o.stayAsleep) { if (!o.earlyWake) { bot.time.timeOfDay = 100; bot.time.isDay = true } wakeNow(b.position) } }, o.wakeAfter ?? 120)
    if (o.dropSleepEvent) bot.isSleeping = false
  }
  bot.wake = async () => { if (!bot.isSleeping) throw new Error('already awake'); bot._wakeCalls++; clearTimeout(bot._wakeTimer); const b = [...world.values()].find(x => isBedName(x.name) && x.getProperties().occupied); wakeNow(b ? b.position : new Vec3(0, 64, 0)) }
  bot._client = { write: (n, p) => { if (n === 'entity_action' && p.actionId === 2) { bot._raw++; const b = [...world.values()].find(x => isBedName(x.name) && x.getProperties().occupied); if (b) wakeNow(b.position) } } }
  bot.attack = e => { bot._hits = (bot._hits || 0) + 1; if (bot._hits >= 2) setTimeout(() => { delete bot.entities[e.id]; bot.emit('entityDead', e) }, 5) }
  if (o.dropSleepEvent) { const orig = bot.sleep; bot.sleep = async b => { try { await orig(b) } catch (e) { setTimeout(() => { if (!o.stayAsleep) { bot.time.timeOfDay = 100; bot.time.isDay = true; setOcc(b.position, false) } }, 150); throw e } } }
  return bot
}
const ctxOf = (signal) => ({ signal: signal || new AbortController().signal, mcData, movements: () => ({}) })
const P = { pollMs: 20, stallMs: 1500, maxWaitMs: 10000 }
const bedBlocks = bot => [...bot._world.values()].filter(b => isBedName(b.name))

;(async () => {
  let b, o
  // 1 siang
  b = mk({ time: 3000 }); b._bed('red_bed', 3, 64, 0, 1, 0); o = await sk.run(b, { ...P }, ctxOf()); ok(!o.ok && o.code === 'PRECONDITION_FAILED' && /belum malam/.test(o.error) && o.data.time.timeOfDay != null, 'siang -> PRECONDITION_FAILED jelas (' + o.error.slice(0, 40) + ')'); b._stop()
  // 2 siang + waitForNight
  b = mk({ time: 11800 }); b._bed('red_bed', 3, 64, 0, 1, 0); o = await sk.run(b, { ...P, waitForNight: true }, ctxOf()); ok(o.ok && o.data.mode === 'existing' && b._sleepCalls === 1, 'waitForNight: menunggu malam lalu tidur'); b._stop()
  // 3 bed ada: tidur di sana, tidak dihancurkan
  b = mk(); b._bed('red_bed', 4, 64, 2, 1, 0); b._give('white_bed', 1); o = await sk.run(b, { ...P }, ctxOf())
  ok(o.ok && o.data.mode === 'existing' && o.data.bed.name === 'red_bed' && o.data.wokeAtTick < 3000 && bedBlocks(b).length === 2 && !o.data.broke && b._places === 0, 'bed dekat dipakai (inventory tidak dipakai, bed tidak dihancurkan); bangun pagi tick ' + o.data.wokeAtTick); b._stop()
  // 4 bed terisi dilewati
  b = mk(); b._bed('red_bed', 2, 64, 1, 1, 0, true); b._bed('blue_bed', 6, 64, 4, 1, 0); o = await sk.run(b, { ...P }, ctxOf()); ok(o.ok && o.data.bed.name === 'blue_bed', 'bed terisi dilewati, bed bebas dipakai'); b._stop()
  // 5 tanpa bed -> pakai inventory, taruh, tidur, hancurkan, ambil kembali
  b = mk(); b._give('green_bed', 1); o = await sk.run(b, { ...P }, ctxOf())
  const lp = b._lastPlace
  ok(o.ok && o.data.mode === 'placed' && b._bedHeldDuringSleep && o.data.broke && o.data.recovered === true && bedBlocks(b).length === 0 && b.inventory.items().find(i => i.name === 'green_bed').count === 1, 'bed inventory: ditaruh -> tidur -> dihancurkan -> kembali ke inventory (' + JSON.stringify({ broke: o.data.broke, rec: o.data.recovered }) + ')')
  ok(lp && lp.d.length === 2 && b.entity.position.distanceTo(lp.f.offset(0.5, 0, 0.5)) < 6, 'penaruhan segaris dengan arah berdiri: kaki ' + K(lp.f) + ' kepala ' + K(lp.h)); b._stop()
  // 6 tanpa bed dan tanpa inventory
  b = mk(); o = await sk.run(b, { ...P }, ctxOf()); ok(!o.ok && o.code === 'TARGET_NOT_FOUND' && /tidak ada bed/.test(o.error), 'tanpa bed apa pun -> TARGET_NOT_FOUND'); b._stop()
  b = mk(); b._give('green_bed', 1); o = await sk.run(b, { ...P, place: false }, ctxOf()); ok(!o.ok && o.code === 'TARGET_NOT_FOUND' && /place=false/.test(o.error) && b._places === 0, 'place:false -> tidak menaruh bed'); b._stop()
  // 7 pra-cek
  b = mk({ dim: 'the_nether' }); b._give('green_bed', 1); o = await sk.run(b, { ...P }, ctxOf()); ok(!o.ok && o.code === 'PRECONDITION_FAILED' && /meledak/.test(o.error) && b._places === 0, 'nether -> ditolak sebelum menaruh bed'); b._stop()
  b = mk({ cycle: false }); b._bed('red_bed', 3, 64, 0, 1, 0); o = await sk.run(b, { ...P }, ctxOf()); ok(!o.ok && /doDaylightCycle/.test(o.error) && b._sleepCalls === 0, 'doDaylightCycle=false -> ditolak'); b._stop()
  b = mk({ mode: 'spectator' }); o = await sk.run(b, { ...P }, ctxOf()); ok(o.code === 'PRECONDITION_FAILED', 'spectator ditolak'); b._stop()
  // 8 event sleep hilang tetapi bed terisi
  b = mk({ dropSleepEvent: true }); b._bed('red_bed', 3, 64, 0, 1, 0); o = await sk.run(b, { ...P }, ctxOf()); ok(o.ok && o.data.mode === 'existing', 'event sleep hilang: terdeteksi lewat bed terisi, tetap sampai pagi'); b._stop()
  // 9 monster: dilawan lalu tidur
  b = mk({ monsters: 1 }); b._bed('red_bed', 3, 64, 0, 1, 0); b.entities[5] = { id: 5, type: 'hostile', kind: 'Hostile mobs', name: 'zombie', position: new Vec3(4.5, 64, 0.5), height: 1.9 }; o = await sk.run(b, { ...P }, ctxOf()); ok(o.ok && o.data.fights >= 1 && b._sleepCalls === 2, 'monster dekat: dilawan lalu tidur (fights ' + o.data.fights + ', sleep ' + b._sleepCalls + ')'); b._stop()
  b = mk({ monsters: 99 }); b._bed('red_bed', 3, 64, 0, 1, 0); o = await sk.run(b, { ...P, retries: 1 }, ctxOf()); ok(!o.ok && o.code === 'SERVER_REJECTED' && /monster/.test(o.error) && b._sleepCalls === 2, 'monster tak hilang -> SERVER_REJECTED setelah retries'); b._stop()
  // 10 abort saat tidur: bangun + bersihkan bed
  b = mk({ wakeAfter: 60000 }); b._give('green_bed', 1); const ac = new AbortController(); const pr = sk.run(b, { ...P }, ctxOf(ac.signal)); await sleep(300); ac.abort('USER_STOP'); o = await pr
  ok(!o.ok && o.code === 'ABORTED' && b._wakeCalls === 1 && bedBlocks(b).length === 0 && o.data.recovered === true && b.inventory.items().find(i => i.name === 'green_bed').count === 1, 'abort saat tidur: bangun, bed dihancurkan dan dikembalikan'); b._stop()
  // 11 bangun sebelum pagi
  b = mk({ earlyWake: true }); b._give('green_bed', 1); o = await sk.run(b, { ...P }, ctxOf()); ok(!o.ok && o.code === 'INTERRUPTED' && /sebelum pagi/.test(o.error) && o.data.broke, 'bangun malam hari -> INTERRUPTED, bed tetap dibersihkan'); b._stop()
  // 12 waktu beku saat tidur
  b = mk({ frozen: true, stayAsleep: true }); b._bed('red_bed', 3, 64, 0, 1, 0); o = await sk.run(b, { ...P, stallMs: 400 }, ctxOf()); ok(!o.ok && o.code === 'TIMEOUT' && /tidak bergerak/.test(o.error) && b._wakeCalls === 1, 'waktu tidak bergerak -> TIMEOUT dan bot dibangunkan'); b._stop()
  // 13 penaruhan ditolak sekali -> coba tempat lain; ditolak semua -> SERVER_REJECTED
  b = mk({ refusePlace: 1 }); b._give('green_bed', 1); o = await sk.run(b, { ...P }, ctxOf()); ok(o.ok && b._places === 2 && o.data.reasons.some(r => /taruh bed/.test(r)), 'penaruhan ditolak sekali -> tempat berikutnya berhasil'); b._stop()
  b = mk({ refusePlace: 99 }); b._give('green_bed', 1); o = await sk.run(b, { ...P }, ctxOf()); ok(!o.ok && o.code === 'SERVER_REJECTED' && b._places === 4, 'ditolak di semua tempat (4 dicoba) -> SERVER_REJECTED'); b._stop()
  // 14 tak ada tempat (dunia sempit penuh batu)
  b = mk({ size: 1 }); b._give('green_bed', 1); for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) { b._set('stone', x, 65, z); if (!(x === 0 && z === 0)) b._set('stone', x, 64, z) } o = await sk.run(b, { ...P }, ctxOf()); ok(!o.ok && o.code === 'TARGET_NOT_FOUND' && /tempat datar/.test(o.error), 'tak ada tempat 3 sel -> TARGET_NOT_FOUND'); b._stop()
  // 15 bed jauh tak terjangkau -> pakai inventory
  b = mk({ gotoErr: undefined }); b._bed('red_bed', 8, 64, 8, 1, 0); b._give('green_bed', 1); let calls = 0; const og = b.pathfinder.goto; b.pathfinder.goto = async g => { calls++; if (calls === 1) throw Object.assign(new Error('x'), { name: 'NoPath' }); return og(g) }; o = await sk.run(b, { ...P }, ctxOf()); ok(o.ok && o.data.mode === 'placed' && o.data.reasons.some(r => /jalan ke bed/.test(r)), 'bed ada tapi tak terjangkau -> jatuh ke bed inventory'); b._stop()
  // 16 kontrak
  ok(!validate('SkillManifest', sk.manifest), 'manifest valid kontrak'); const chk = compile(sk.manifest.paramsSchema); ok(chk({}) === null && chk({ radius: 10, place: false }) === null && chk({ radius: 'jauh' }) !== null && chk({ retries: 9 }) !== null, 'paramsSchema: menerima parameter sah, menolak yang salah')
  console.log('\nHASIL: ' + pass + ' lulus, ' + fail + ' gagal'); process.exit(fail ? 1 : 0)
})().catch(e => { console.error('CRASH', e); process.exit(2) })
