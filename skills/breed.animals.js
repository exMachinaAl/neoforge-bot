const { goals } = require('mineflayer-pathfinder')
const U = require('./_util')
const I = require('./_inv')

// Makanan pemicu mode cinta (vanilla 1.21). Hanya hewan ternak umum; nama diverifikasi terhadap minecraft-data saat dipakai.
const FOOD = {
  cow: ['wheat'], mooshroom: ['wheat'], sheep: ['wheat'], goat: ['wheat'],
  pig: ['carrot', 'potato', 'beetroot'],
  chicken: ['wheat_seeds', 'beetroot_seeds', 'melon_seeds', 'pumpkin_seeds', 'torchflower_seeds', 'pitcher_pod'],
  horse: ['golden_apple', 'golden_carrot', 'enchanted_golden_apple'], donkey: ['golden_apple', 'golden_carrot', 'enchanted_golden_apple'],
  llama: ['hay_block'], rabbit: ['carrot', 'golden_carrot', 'dandelion'], fox: ['sweet_berries', 'glow_berries']
}

const manifest = {
  name: 'breed.animals',
  description: 'Kawinkan hewan ternak vanilla: beri makanan pada dua dewasa terdekat, tunggu anak lahir. Butuh makanan yang sesuai di inventory. Keberhasilan diukur dari kemunculan anak (bukan metadata)',
  paramsSchema: {
    type: 'object',
    properties: {
      species: { type: 'string', default: 'auto', description: 'cow, sheep, pig, chicken, goat, mooshroom, horse, donkey, llama, rabbit, fox, atau "auto" (spesies dengan pasangan & makanan terbanyak)' },
      pairs: { type: 'integer', minimum: 1, maximum: 10, default: 1, description: 'jumlah pasangan yang dikawinkan' },
      radius: { type: 'integer', minimum: 4, maximum: 48, default: 20, description: 'radius pencarian hewan (blok)' },
      waitMs: { type: 'integer', minimum: 1000, maximum: 60000, default: 15000, description: 'batas tunggu anak lahir per pasangan' },
      refresh: { type: 'boolean', default: true, description: 'samakan inventory bot dengan server (butuh op) sebelum menghitung makanan dan sesudahnya' }
    }
  },
  requires: ['move', 'inventory.protocol'],
  interruptible: true,
  estimatedMs: 40000
}

const isBaby = e => !!(e.metadata && e.metadata[16] === true) // AgeableMob.DATA_BABY_ID = indeks 16 (1.21.x); BELUM DIUJI di server
const COOLDOWN_OK_MS = 5 * 60 * 1000 // setelah kawin
const COOLDOWN_FAIL_MS = 60 * 1000 // mode cinta berakhir ~30 dtk

async function run (bot, p, ctx) {
  const md = ctx.mcData
  const radius = p.radius || 20
  const pairsWanted = p.pairs || 1
  const waitMs = p.waitMs || 15000
  const creative = U.creative(bot)
  bot.arcadia = bot.arcadia || {}
  const cd = bot.arcadia.breedCooldown = bot.arcadia.breedCooldown || {}

  let sync = { refreshed: false, reason: 'refresh=false' }
  if (p.refresh !== false) {
    I.watch(bot)
    const rf = await I.refreshInventory(bot, ctx, { timeoutMs: Math.min(p.waitMs || 6000, 3000) })
    sync = rf.ok ? { refreshed: true, hydrated: rf.hydrated.length, removed: rf.removed.length, fixed: rf.fixed.length } : { refreshed: false, reason: String(rf.error || rf.code).slice(0, 100) }
    if (!rf.ok && rf.code === 'ABORTED') return rf
  }

  const near = e => e.position.distanceTo(bot.entity.position) <= radius
  const all = sp => Object.values(bot.entities).filter(e => e !== bot.entity && e.position && e.name === sp && near(e))
  const adults = sp => all(sp).filter(e => !isBaby(e) && !(cd[e.id] > Date.now()))
  const foodFor = sp => (FOOD[sp] || []).map(n => md.itemsByName[n]).filter(Boolean).map(i => ({ name: i.name, id: i.id, n: bot.inventory.count(i.id) })).filter(f => f.n > 0)
  const foodTotal = sp => foodFor(sp).reduce((a, f) => a + f.n, 0)

  // spesies
  let species
  if (p.species && p.species !== 'auto') {
    species = String(p.species).replace(/^minecraft:/, '')
    if (!FOOD[species]) return { ok: false, code: 'PRECONDITION_FAILED', error: 'spesies belum didukung: ' + species + ' (didukung: ' + Object.keys(FOOD).join(', ') + ')' }
  } else {
    const rows = Object.keys(FOOD).map(sp => ({ sp, total: all(sp).length, adults: adults(sp).length, food: foodTotal(sp) }))
    const good = rows.filter(c => c.adults >= 2 && (c.food >= 2 || creative)).sort((a, b) => Math.min(Math.floor(b.adults / 2), Math.floor(b.food / 2)) - Math.min(Math.floor(a.adults / 2), Math.floor(a.food / 2)))
    if (!good.length) {
      return { ok: false, code: 'TARGET_NOT_FOUND', error: 'tidak ada spesies yang bisa dikawinkan: butuh >=2 dewasa (di luar cooldown) dalam ' + radius + ' blok dan >=2 makanan yang sesuai', data: { seen: rows.filter(r => r.total).map(r => ({ species: r.sp, animals: r.total, adults: r.adults, food: r.food })), sync } }
    }
    species = good[0].sp
  }

  const foodNames = (FOOD[species] || []).join('/')
  if (!creative && foodTotal(species) < 2) return { ok: false, code: 'PRECONDITION_FAILED', error: 'butuh >=2 ' + foodNames + ' di inventory untuk mengawinkan ' + species + ' (ada ' + foodTotal(species) + ')', data: { species, sync } }

  const stats = { species, pairs: 0, fed: 0, babies: 0, foodUsed: {}, attempts: [] }
  const feed = async e => {
    const food = foodFor(species)[0]
    if (!food && !creative) return { ok: false, why: 'makanan habis' }
    const item = food ? bot.inventory.items().find(i => i.type === food.id) : null
    if (item) await bot.equip(item, 'hand')
    if (e.position.distanceTo(bot.entity.position) > 3) await U.gotoTimed(bot, new goals.GoalNear(e.position.x, e.position.y, e.position.z, 2), 15000, ctx.signal)
    if (bot.lookAt) { try { await bot.lookAt(e.position.offset(0, (e.height || 1) * 0.5, 0), true) } catch (err) { /* abaikan */ } }
    const before = food ? bot.inventory.count(food.id) : 0
    await bot.activateEntity(e)
    await U.sleep(350)
    const consumed = creative ? true : bot.inventory.count(food.id) < before
    if (consumed && food) stats.foodUsed[food.name] = (stats.foodUsed[food.name] || 0) + 1
    return { ok: consumed, why: consumed ? null : 'makanan tidak dimakan (hewan sudah mode cinta/cooldown, terlalu jauh, atau item salah)' }
  }
  // Dengarkan kemunculan hewan baru SEJAK sebelum memberi makan: anak bisa lahir saat kita masih memberi makan hewan kedua.
  const watchSpawns = () => {
    const seen = []; const waiters = new Set()
    const on = ent => {
      if (!ent || ent.name !== species || !ent.position || (ent.metadata && ent.metadata[16] === false)) return
      seen.push(ent); for (const w of [...waiters]) w(ent)
    }
    bot.on('entitySpawn', on)
    return {
      stop: () => { bot.removeListener('entitySpawn', on); waiters.clear() },
      wait: (center, ms) => new Promise(resolve => {
        const close = e => e.position.distanceTo(center) < 16
        const early = seen.find(close); if (early) return resolve(early)
        let t; const fin = v => { clearTimeout(t); waiters.delete(h); if (ctx.signal) ctx.signal.removeEventListener('abort', ab); resolve(v) }
        const h = e => { if (close(e)) fin(e) }
        const ab = () => fin(null)
        t = setTimeout(() => fin(null), ms)
        waiters.add(h)
        if (ctx.signal) { if (ctx.signal.aborted) return fin(null); ctx.signal.addEventListener('abort', ab) }
      })
    }
  }

  let stop = null
  for (let k = 0; k < pairsWanted && !ctx.signal.aborted; k++) {
    if (!creative && foodTotal(species) < 2) { stop = 'makanan habis'; break }
    const list = adults(species)
    if (list.length < 2) { stop = 'kurang dari 2 ' + species + ' dewasa (di luar cooldown) dalam ' + radius + ' blok'; break }
    const A = list.sort((x, y) => x.position.distanceTo(bot.entity.position) - y.position.distanceTo(bot.entity.position))[0]
    const B = list.filter(e => e !== A).sort((x, y) => x.position.distanceTo(A.position) - y.position.distanceTo(A.position))[0]
    const sp = watchSpawns()
    let baby = null
    let fa; let fb
    try {
      fa = await feed(A)
      if (fa.ok) stats.fed++
      fb = fa.ok ? await feed(B) : { ok: false, why: fa.why }
      if (fb.ok) stats.fed++
      stats.pairs++
      if (fa.ok && fb.ok) baby = await sp.wait(A.position, waitMs)
    } finally { sp.stop() }
    if (!fa.ok || !fb.ok) { cd[A.id] = Date.now() + COOLDOWN_FAIL_MS; cd[B.id] = Date.now() + COOLDOWN_FAIL_MS; stats.attempts.push({ a: A.id, b: B.id, result: 'gagal memberi makan: ' + (fb.why || fa.why) }); stop = fb.why || fa.why; break }
    if (baby) { stats.babies++; cd[A.id] = Date.now() + COOLDOWN_OK_MS; cd[B.id] = Date.now() + COOLDOWN_OK_MS; stats.attempts.push({ a: A.id, b: B.id, result: 'anak lahir' }) } else {
      cd[A.id] = Date.now() + COOLDOWN_FAIL_MS; cd[B.id] = Date.now() + COOLDOWN_FAIL_MS; stats.attempts.push({ a: A.id, b: B.id, result: 'tidak ada anak dalam ' + waitMs + ' ms' }); stop = 'tidak ada anak lahir'
    }
  }
  if (ctx.signal.aborted) stop = 'dihentikan'
  const data = { ...stats, requestedPairs: pairsWanted, stoppedBy: stop, babyDetection: 'kemunculan entitas baru sejenis (anak) dekat pasangan', sync }
  if (stats.fed > 0 && p.refresh !== false && !ctx.signal.aborted) await I.attachRefresh(bot, ctx, p, { data })
  if (stats.babies > 0) return { ok: true, code: 'OK', data: { ...data, partial: stats.babies < pairsWanted } }
  if (ctx.signal.aborted) return { ok: false, code: 'ABORTED', error: 'dihentikan', data }
  if (stats.fed > 0) return { ok: false, code: 'TIMEOUT', error: 'hewan diberi makan tetapi tidak ada anak lahir dalam ' + waitMs + ' ms (cooldown 5 menit setelah kawin, jarak antar hewan, atau tidak keduanya masuk mode cinta)', data }
  if (stop && /dewasa/.test(stop)) return { ok: false, code: 'TARGET_NOT_FOUND', error: stop, data }
  return { ok: false, code: 'PRECONDITION_FAILED', error: stop || 'tidak ada yang dikawinkan', data }
}

module.exports = { manifest, run, cli: ['species', 'pairs'], FOOD }
