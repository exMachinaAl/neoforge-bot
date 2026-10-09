// skills/sleep.auto.js - tidur otomatis sampai pagi.
// Urutan: bed terdekat (radius) -> bed dari inventory (ditaruh, lalu dihancurkan setelah bangun) -> gagal jelas.
// Mandiri: hanya memakai mineflayer + pathfinder; helper _util dipakai secara opsional (hostiles/fight) bila ada.
const { goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
let U = {}; try { U = require('./_util') } catch (e) { U = {} }
const sleep = ms => new Promise(r => setTimeout(r, ms))

const manifest = {
  name: 'sleep.auto',
  description: 'Tidur sampai pagi: bed terdekat; bila tidak ada, taruh bed dari inventory lalu hancurkan setelah bangun (breakAfter). Hanya overworld, hanya malam/badai petir.',
  paramsSchema: {
    type: 'object',
    properties: {
      radius: { type: 'integer', minimum: 4, maximum: 64, default: 24, description: 'jarak cari bed yang sudah ada' },
      place: { type: 'boolean', default: true, description: 'boleh menaruh bed dari inventory bila tak ada bed' },
      breakAfter: { type: 'boolean', default: true, description: 'hancurkan bed yang ditaruh sendiri setelah bangun (dan ambil kembali)' },
      waitForNight: { type: 'boolean', default: false, description: 'siang hari: tunggu sampai malam (butuh timeoutMs besar)' },
      retries: { type: 'integer', minimum: 0, maximum: 5, default: 2, description: 'ulang bila ada monster dekat bed' },
      force: { type: 'boolean', default: false, description: 'abaikan doDaylightCycle=false' },
      maxWaitMs: { type: 'integer', minimum: 10000, default: 900000, description: 'batas menunggu pagi (runner membatasi lewat timeoutMs, mis. 900000)' },
      pollMs: { type: 'integer', minimum: 50, default: 1000 },
      stallMs: { type: 'integer', minimum: 1000, default: 30000, description: 'waktu dunia tak bergerak selama ini = berhenti (TIMEOUT)' }
    }
  },
  requires: ['move', 'block.read', 'block.dig', 'block.place', 'inventory.protocol'],
  interruptible: true,
  estimatedMs: 600000
}

const AIR = new Set(['air', 'cave_air', 'void_air'])
const REPL = new Set(['air', 'cave_air', 'void_air', 'short_grass'])
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]] // utara, timur, selatan, barat
const key = v => v.x + ',' + v.y + ',' + v.z
const isNight = bot => { const t = bot.time.timeOfDay; return (bot.isRaining && bot.thunderState > 0) || (t >= 12541 && t <= 23458) }
const props = b => { try { return b.getProperties() || {} } catch (e) { return {} } }
const occupied = b => !!b && String(props(b).occupied) === 'true'
const timeInfo = bot => ({ timeOfDay: bot.time.timeOfDay, isDay: bot.time.isDay, doDaylightCycle: bot.time.doDaylightCycle, day: bot.time.day })
const fullCube = b => !!b && b.shapes && b.shapes.length === 1 && b.shapes[0][0] === 0 && b.shapes[0][1] === 0 && b.shapes[0][2] === 0 && b.shapes[0][3] === 1 && b.shapes[0][4] === 1 && b.shapes[0][5] === 1 && !/_leaves$|^slime_block$|^honey_block$/.test(b.name)

async function goTo (bot, goal, signal, ms = 45000) {
  let t
  const timeout = new Promise((resolve, reject) => { t = setTimeout(() => { try { bot.pathfinder.stop() } catch (e) {} reject(Object.assign(new Error('goto melewati ' + ms + ' ms'), { name: 'Timeout' })) }, ms) })
  const onAbort = () => { try { bot.pathfinder.stop() } catch (e) {} }
  signal.addEventListener('abort', onAbort, { once: true })
  try { await Promise.race([bot.pathfinder.goto(goal), timeout]) } finally { clearTimeout(t); signal.removeEventListener('abort', onAbort) }
}

function bedsAround (bot, ids, center, radius) {
  const c = center || bot.entity.position
  const maxD = Math.min(128, Math.ceil(center ? radius + bot.entity.position.distanceTo(center) + 1 : radius))
  const pts = bot.findBlocks({ matching: ids, maxDistance: maxD, count: 80 }) || []
  return pts.map(q => bot.blockAt(q)).filter(b => b && bot.isABed(b) && (!center || b.position.distanceTo(center) <= radius)).sort((a, b) => a.position.distanceTo(c) - b.position.distanceTo(c))
}
const bedAt = (bot, ids, pos) => bedsAround(bot, ids, pos, 3).find(b => b.position.distanceTo(pos) <= 1.5) || null
const anyOccupied = (bot, ids, pos) => bedsAround(bot, ids, pos, 3).some(b => b.position.distanceTo(pos) <= 1.5 && occupied(b))

// Tempat menaruh bed: A (berdiri) - F (kaki bed) - H (kepala bed) segaris; F dan H harus kosong/rumput pendek di atas kubus penuh.
function findSpots (bot, r) {
  const base = bot.entity.position.floored(); const out = []
  const name = p => { const b = bot.blockAt(p); return b ? b.name : null }
  const free = p => REPL.has(name(p))
  const support = p => fullCube(bot.blockAt(p.offset(0, -1, 0)))
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) for (let dy = -1; dy <= 1; dy++) {
    const F = base.offset(dx, dy, dz)
    if (!free(F) || !support(F)) continue
    for (const [ex, ez] of DIRS) {
      const A = F.offset(-ex, 0, -ez); const H = F.offset(ex, 0, ez)
      if (!free(H) || !support(H) || !AIR.has(name(A)) || !AIR.has(name(A.offset(0, 1, 0))) || !support(A)) continue
      out.push({ A, F, H, d: [ex, ez], dist: bot.entity.position.distanceTo(A.offset(0.5, 0, 0.5)) })
    }
  }
  return out.sort((a, b) => a.dist - b.dist).slice(0, 8)
}

async function wakeUp (bot, bedIds, pos) {
  try { if (bot.isSleeping) { await bot.wake(); return } } catch (e) {}
  // event "sleep" bisa hilang (metadata entitas gagal diparse): kirim leave_bed mentah bila bed masih terisi
  if (pos && anyOccupied(bot, bedIds, pos)) { try { bot._client.write('entity_action', { entityId: bot.entity.id, actionId: 2, jumpBoost: 0 }) } catch (e) {} }
}

async function run (bot, p, ctx) {
  const md = ctx.mcData
  const st = { reasons: [], warnings: [], msgs: [], placed: null, broke: false, recovered: null, mode: null, bed: null, signals: [], fights: 0, tried: 0 }
  const bedIds = md.blocksArray.filter(b => /_bed$/.test(b.name)).map(b => b.id)
  const bedItems = new Set(md.itemsArray.filter(i => /_bed$/.test(i.name)).map(i => i.id))
  const radius = Math.min(64, Math.max(4, parseInt(p.radius ?? 24, 10)))
  const retries = Math.min(5, Math.max(0, parseInt(p.retries ?? 2, 10)))
  const pollMs = Math.max(50, Number(p.pollMs) || 1000); const stallMs = Math.max(1000, Number(p.stallMs) || 30000); const maxWaitMs = Math.max(10000, Number(p.maxWaitMs) || 900000)
  const why = m => { st.reasons.push(String(m).slice(0, 140)); if (st.reasons.length > 10) st.reasons.shift() }
  const creative = bot.game.gameMode === 'creative'
  const bedCount = () => bot.inventory.items().filter(i => bedItems.has(i.type)).reduce((a, i) => a + i.count, 0)
  const before = bedCount()
  const finish = (ok, code, error, extra) => ({ ok, code, error, data: Object.assign({ mode: st.mode, bed: st.bed, broke: st.broke, recovered: st.recovered, time: timeInfo(bot), fights: st.fights, serverMsgs: st.msgs.slice(-4), reasons: st.reasons, warnings: st.warnings }, extra) })

  // ---- pra-cek
  if (bot.time.timeOfDay == null) return finish(false, 'PRECONDITION_FAILED', 'waktu dunia belum diterima dari server')
  if (bot.game.gameMode === 'spectator') return finish(false, 'PRECONDITION_FAILED', 'mode spectator tidak bisa tidur')
  const dim = String(bot.game.dimension || '').replace('minecraft:', '')
  if (dim !== 'overworld') return finish(false, 'PRECONDITION_FAILED', 'bed meledak di dimensi ' + dim + ': tidur hanya di overworld')
  if (bot.isSleeping) return finish(false, 'PRECONDITION_FAILED', 'bot sudah tidur')
  if (bot.time.doDaylightCycle === false && !p.force) return finish(false, 'PRECONDITION_FAILED', 'doDaylightCycle=false: waktu beku, tidur tidak akan sampai pagi (/gamerule doDaylightCycle true, atau force:true)')

  const onMsg = m => { const s = String(m); if (/sleep|rest|bed|night|monster|tidur/i.test(s)) { st.msgs.push(s.slice(0, 120)) } }
  bot.on('messagestr', onMsg); bot.on('actionBar', onMsg)
  const off = () => { bot.removeListener('messagestr', onMsg); bot.removeListener('actionBar', onMsg) }

  async function clearMonsters () {
    if (typeof U.hostiles !== 'function' || typeof U.fight !== 'function') return
    try { for (const h of U.hostiles(bot, 9).slice(0, 3)) { if (ctx.signal.aborted) return; st.fights++; await U.fight(bot, ctx, h, 10000) } } catch (e) { why('lawan monster: ' + e.message) }
  }

  async function attemptSleep (bed) {
    for (let i = 0; i <= retries; i++) {
      if (ctx.signal.aborted) throw Object.assign(new Error('dibatalkan'), { aborted: true })
      st.tried++
      try { await bot.sleep(bed); st.signals.push('event'); return } catch (e) {
        const m = String(e.message)
        if (/not sleeping/.test(m) && anyOccupied(bot, bedIds, bed.position)) { st.signals.push('bed-terisi'); return }
        if (/monsters/.test(m)) { why('monster dekat bed (percobaan ' + (i + 1) + ')'); await clearMonsters(); await sleep(Math.min(pollMs, 1500)); continue }
        if (/too far|cant click/.test(m)) { why('bed terlalu jauh; mendekat'); try { await goTo(bot, new goals.GoalNear(bed.position.x, bed.position.y, bed.position.z, 1), ctx.signal, 20000) } catch (e2) {} continue }
        throw e
      }
    }
    throw new Error('there are monsters nearby')
  }

  async function placeFromInventory (item) {
    const spots = findSpots(bot, 6)
    if (!spots.length) throw Object.assign(new Error('tidak ada tempat datar 3 sel segaris (berdiri-kaki-kepala) dalam 6 blok untuk menaruh bed'), { code: 'TARGET_NOT_FOUND' })
    for (const s of spots.slice(0, 4)) {
      if (ctx.signal.aborted) throw Object.assign(new Error('dibatalkan'), { aborted: true })
      try {
        await goTo(bot, new goals.GoalBlock(s.A.x, s.A.y, s.A.z), ctx.signal, 30000)
        await bot.equip(item, 'hand')
        const sup = bot.blockAt(s.F.offset(0, -1, 0))
        await bot.placeBlock(sup, new Vec3(0, 1, 0))
        st.placed = { x: s.F.x, y: s.F.y, z: s.F.z, item: item.name }
        const fb = bot.blockAt(s.F)
        if (fb && bot.isABed(fb)) return fb
        throw new Error('blok bed tidak muncul setelah menaruh')
      } catch (e) { if (ctx.signal.aborted) throw Object.assign(e, { aborted: true }); why('taruh bed di ' + key(s.F) + ': ' + e.message) }
    }
    throw Object.assign(new Error('server menolak menaruh bed di semua tempat yang dicoba'), { code: 'SERVER_REJECTED' })
  }

  async function core () {
    // malam?
    if (!isNight(bot)) {
      if (!p.waitForNight) return { ok: false, code: 'PRECONDITION_FAILED', error: 'belum malam (timeOfDay ' + bot.time.timeOfDay + '): tidur hanya 12541-23458 atau badai petir. Pakai waitForNight:true' }
      const t0 = Date.now()
      while (!isNight(bot)) { if (ctx.signal.aborted) return { ok: false, code: 'ABORTED' }; if (Date.now() - t0 > maxWaitMs) return { ok: false, code: 'TIMEOUT', error: 'malam tidak datang dalam ' + maxWaitMs + ' ms' }; await sleep(pollMs) }
    }
    // 1) bed terdekat
    let bed = null
    const bad = new Set()
    for (const cand of bedsAround(bot, bedIds, null, radius)) {
      if (bad.has(key(cand.position)) || occupied(cand)) continue
      if (st.tried > 2) break
      try { await goTo(bot, new goals.GoalNear(cand.position.x, cand.position.y, cand.position.z, 2), ctx.signal, 45000); bed = cand; st.mode = 'existing'; break } catch (e) {
        if (ctx.signal.aborted) return { ok: false, code: 'ABORTED' }
        why('jalan ke bed ' + key(cand.position) + ': ' + e.name); for (const n of bedsAround(bot, bedIds, cand.position, 3)) bad.add(key(n.position)); st.tried++
      }
    }
    // 2) bed dari inventory
    if (!bed) {
      const item = p.place === false ? null : bot.inventory.items().find(i => bedItems.has(i.type))
      if (!item) return { ok: false, code: 'TARGET_NOT_FOUND', error: 'tidak ada bed (bebas) dalam ' + radius + ' blok' + (p.place === false ? ' dan place=false' : ' dan tidak ada bed di inventory') }
      try { bed = await placeFromInventory(item); st.mode = 'placed' } catch (e) {
        if (e.aborted) return { ok: false, code: 'ABORTED' }
        return { ok: false, code: e.code || 'UNKNOWN', error: e.message }
      }
    }
    st.bed = { x: bed.position.x, y: bed.position.y, z: bed.position.z, name: bed.name }
    // 3) tidur
    try { await attemptSleep(bed) } catch (e) {
      if (e.aborted) return { ok: false, code: 'ABORTED' }
      const m = String(e.message)
      if (/not night/.test(m)) return { ok: false, code: 'PRECONDITION_FAILED', error: m }
      if (/monsters/.test(m)) return { ok: false, code: 'SERVER_REJECTED', error: 'tidak bisa tidur: monster dekat bed setelah ' + (retries + 1) + ' percobaan' }
      return { ok: false, code: 'SERVER_REJECTED', error: 'server tidak menidurkan bot: ' + m + (st.msgs.length ? ' | server: ' + st.msgs.slice(-2).join(' / ') : '') }
    }
    // 4) tunggu pagi
    const t0 = Date.now(); let lastT = bot.time.timeOfDay; let lastChange = Date.now(); let end = 'awake'
    for (;;) {
      if (ctx.signal.aborted) { end = 'aborted'; break }
      if (!(bot.isSleeping || anyOccupied(bot, bedIds, bed.position))) { end = 'awake'; break }
      const t = bot.time.timeOfDay
      if (t !== lastT) { lastT = t; lastChange = Date.now() } else if (Date.now() - lastChange > stallMs) { end = 'stalled'; break }
      if (Date.now() - t0 > maxWaitMs) { end = 'maxwait'; break }
      await sleep(pollMs)
    }
    const slept = Date.now() - t0
    if (end === 'aborted') return { ok: false, code: 'ABORTED', data: { sleptMs: slept } }
    if (end === 'stalled') { await wakeUp(bot, bedIds, bed.position); return { ok: false, code: 'TIMEOUT', error: 'waktu dunia tidak bergerak ' + stallMs + ' ms selama tidur (doDaylightCycle dimatikan?)', data: { sleptMs: slept } } }
    if (end === 'maxwait') { await wakeUp(bot, bedIds, bed.position); return { ok: false, code: 'TIMEOUT', error: 'pagi belum tiba dalam ' + maxWaitMs + ' ms (pemain lain tidak tidur?)', data: { sleptMs: slept } } }
    const t = bot.time.timeOfDay
    const morning = t < 12000 || t >= 23000 || bot.time.isDay
    if (!morning) return { ok: false, code: 'INTERRUPTED', error: 'bangun sebelum pagi (timeOfDay ' + t + '): terganggu/terkena serangan?', data: { sleptMs: slept } }
    return { ok: true, code: 'OK', data: { sleptMs: slept, wokeAtTick: t } }
  }

  async function cleanup () {
    if (!st.placed || p.breakAfter === false) return
    try {
      const at = new Vec3(st.placed.x, st.placed.y, st.placed.z)
      await wakeUp(bot, bedIds, at); await sleep(300)
      const b = bedAt(bot, bedIds, at)
      if (!b) { st.warnings.push('bed yang ditaruh sudah tidak ada'); return }
      const calm = new AbortController().signal
      if (bot.entity.position.distanceTo(b.position.offset(0.5, 0.5, 0.5)) > 4) await goTo(bot, new goals.GoalNear(b.position.x, b.position.y, b.position.z, 2), calm, 20000)
      await bot.dig(b); st.broke = true
      if (!creative) {
        try { await goTo(bot, new goals.GoalNear(at.x, at.y, at.z, 1), calm, 8000) } catch (e) { /* item mungkin tetap terambil */ }
        for (let i = 0; i < 10 && bedCount() < before; i++) await sleep(250)
        st.recovered = bedCount() >= before
        if (!st.recovered) st.warnings.push('bed dihancurkan tetapi tidak kembali ke inventory (jumlah ' + bedCount() + ' < ' + before + ')')
      }
    } catch (e) { st.warnings.push('bersihkan bed: ' + e.message) }
  }

  let out
  try { out = await core() } catch (e) { out = { ok: false, code: e.code || 'UNKNOWN', error: e.message } }
  try { if (!out.ok && (bot.isSleeping || st.bed)) await wakeUp(bot, bedIds, st.bed ? new Vec3(st.bed.x, st.bed.y, st.bed.z) : null) } catch (e) {}
  await cleanup()
  off()
  return finish(out.ok, out.code, out.error, out.data)
}

module.exports = { manifest, run, cli: [] }
