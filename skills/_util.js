// skills/_util.js - helper bersama (nama berawalan _ = bukan skill)
const { goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const NATURAL = /^(dirt|grass_block|coarse_dirt|rooted_dirt|podzol|mycelium|sand|red_sand|gravel|clay|stone|andesite|diorite|granite|tuff|deepslate|netherrack|snow|snow_block|short_grass|tall_grass|fern|large_fern|dead_bush|vine|moss_block|moss_carpet|dripstone_block|pointed_dripstone|calcite|basalt|blackstone)$|_leaves$|_ore$/

// Jejak siapa yang memanggil pathfinder.stop()/setGoal() (diagnosa "Path was stopped ..."). Aman dipanggil berulang.
// Hasil: bot.arcadia.pathLog = [{t, kind, by}] (12 terakhir). Hentian dari DALAM pathfinder tidak lewat stop() dan tidak tercatat.
function traceStops (bot) {
  const pf = bot.pathfinder
  if (!pf || pf.__traced) return
  pf.__traced = true
  bot.arcadia = bot.arcadia || {}
  const log = bot.arcadia.pathLog = bot.arcadia.pathLog || []
  const who = () => {
    const fr = String(new Error().stack).split('\n').slice(3).map(x => x.trim().replace(/^at /, ''))
    const mine = fr.filter(x => !/node:internal|node_modules/.test(x))
    return String(mine[0] || fr[0] || '?').replace(/\\/g, '/').slice(-80)
  }
  const wrap = (name, label) => {
    const orig = pf[name]
    if (typeof orig !== 'function') return
    pf[name] = function (...a) {
      log.push({ t: Date.now(), kind: label(a), by: who() })
      if (log.length > 12) log.shift()
      return orig.apply(this, a)
    }
  }
  wrap('stop', () => 'stop')
  wrap('setGoal', a => 'setGoal(' + (a[0] ? a[0].constructor.name : 'null') + ')')
}
function pathDiag (bot, sinceMs = 5000) {
  const log = (bot.arcadia && bot.arcadia.pathLog) || []
  return log.filter(r => Date.now() - r.t < sinceMs).map(r => ({ agoMs: Date.now() - r.t, kind: r.kind, by: r.by }))
}

// goto dengan batas waktu (total, termasuk percobaan ulang). Pada timeout pathfinder dihentikan dan error bernama 'Timeout'.
// 'PathStopped' yang BUKAN karena timeout/abort kita (mis. ada pihak lain memanggil stop()) dicoba ulang (opts.retries, bawaan 2);
// bila tetap gagal, error membawa asal-usulnya (err.stoppedBy) supaya penyebabnya terlihat di log.
async function gotoTimed (bot, goal, ms, signal, opts = {}) {
  traceStops(bot)
  const retries = opts.retries ?? 2
  const t0 = Date.now()
  for (let attempt = 0; ; attempt++) {
    const left = ms - (Date.now() - t0)
    if (left < 400) throw Object.assign(new Error('goto melewati batas ' + ms + ' ms'), { name: 'Timeout' })
    let t; let timedOut = false
    // reject() DULU baru stop(): stop() membuat goto menolak 'PathStopped'; jangan sampai itu yang menang di Promise.race (Timeout tersamar jadi PathStopped)
    const timeout = new Promise((resolve, reject) => { t = setTimeout(() => { timedOut = true; reject(Object.assign(new Error('goto melewati batas ' + ms + ' ms'), { name: 'Timeout' })); try { bot.pathfinder.stop() } catch (e) {} }, left) })
    const onAbort = () => { try { bot.pathfinder.stop() } catch (e) {} }
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
    try {
      await Promise.race([bot.pathfinder.goto(goal), timeout])
      return
    } catch (e) {
      if (!e || e.name !== 'PathStopped') throw e
      const aborted = !!(signal && signal.aborted)
      if (!timedOut && !aborted && attempt < retries) { /* dicoba ulang di bawah */ } else {
        const src = pathDiag(bot, 2000).slice(-3).map(r => r.kind + '@' + r.by).join(' | ') || 'dalam pathfinder (bukan lewat stop()/setGoal())'
        e.stoppedBy = src
        e.message = String(e.message) + ' [asal: ' + src + ']'
        throw e
      }
    } finally { clearTimeout(t); if (signal) signal.removeEventListener('abort', onAbort) }
    await sleep(120 * (attempt + 1))
  }
}

// Jalan lurus ke posisi (tanpa pathfinder). Hanya untuk jarak pendek di area terbuka; berhenti saat dalam reach, waktu habis, atau abort.
// getPos() dipanggil ulang tiap langkah (target bergerak). Mengembalikan jarak akhir (Infinity bila target hilang).
async function steerTo (bot, getPos, reach, ms, signal) {
  const t0 = Date.now()
  try {
    while (Date.now() - t0 < ms && !(signal && signal.aborted)) {
      const p = getPos()
      if (!p) return Infinity
      if (bot.entity.position.distanceTo(p) <= reach) break
      try { await bot.lookAt(new Vec3(p.x, bot.entity.position.y + 1.6, p.z), true) } catch (e) { /* abaikan */ }
      bot.setControlState('forward', true)
      bot.setControlState('jump', !!(bot.entity.isCollidedHorizontally && bot.entity.onGround))
      await sleep(80)
    }
  } finally { try { bot.setControlState('forward', false); bot.setControlState('jump', false) } catch (e) {} }
  const p = getPos()
  return p ? bot.entity.position.distanceTo(p) : Infinity
}

// Mendekati entitas yang bergerak sampai dalam reach blok: lompatan pendek lewat pathfinder dengan posisi dihitung ulang tiap lompatan;
// bila pathfinder tidak berhasil dan jaraknya pendek, jalan lurus. Mengembalikan {ok, code?, error?, hops, via, dist}.
async function approachEntity (bot, entity, ctx, opts = {}) {
  const reach = opts.reach ?? 2.6
  const tries = opts.tries ?? 4
  const hopMs = opts.hopMs ?? 8000
  const signal = ctx && ctx.signal
  const info = { hops: 0, via: 'none' }
  const cur = () => bot.entities[entity.id]
  const dist = () => { const e = cur(); return e && e.position ? bot.entity.position.distanceTo(e.position) : Infinity }
  let code = null; let last = ''
  for (let i = 0; i < tries; i++) {
    if (signal && signal.aborted) return { ok: false, code: 'ABORTED', error: 'dihentikan', ...info }
    const e = cur()
    if (!e || !e.position) return { ok: false, code: 'TARGET_NOT_FOUND', error: 'entitas hilang saat didekati', ...info }
    if (dist() <= reach) return { ok: true, dist: +dist().toFixed(2), ...info }
    info.hops++
    try {
      await gotoTimed(bot, new goals.GoalNear(e.position.x, e.position.y, e.position.z, Math.max(1, reach - 1)), hopMs, signal)
      info.via = 'pathfinder'
    } catch (err) {
      if (signal && signal.aborted) return { ok: false, code: 'ABORTED', error: 'dihentikan', ...info }
      last = (err && err.name) + ': ' + String(err && err.message).slice(0, 260)
      code = err.name === 'NoPath' ? 'NO_PATH' : err.name === 'Timeout' ? 'TIMEOUT' : err.name === 'PathStopped' ? 'INTERRUPTED' : 'UNKNOWN'
      if (opts.steer !== false && dist() < 10) {
        const d = await steerTo(bot, () => { const x = cur(); return x && x.position }, reach, 3500, signal)
        info.via = 'steer'
        if (d <= reach) return { ok: true, dist: +d.toFixed(2), ...info }
      }
    }
  }
  const d = dist()
  if (d <= reach) return { ok: true, dist: +d.toFixed(2), ...info }
  return { ok: false, code: code || 'TIMEOUT', error: 'tidak bisa mendekati dalam ' + tries + ' langkah (jarak ' + (Number.isFinite(d) ? d.toFixed(1) : '?') + ' > ' + reach + ')' + (last ? '; ' + last : ''), ...info }
}


// Mendekati blok. Blok TANPA bentuk tabrakan (tanaman, rumput, bunga, rel: shapes kosong) tidak bisa dikenai raycast,
// jadi GoalLookAtBlock tidak pernah terpenuhi -> pakai GoalNear. Blok padat memakai GoalLookAtBlock.
async function approach (bot, pos, ctx, ms = 30000) {
  const b = bot.blockAt(pos)
  const solid = b && b.shapes && b.shapes.length > 0
  const goal = solid ? new goals.GoalLookAtBlock(pos, bot.world, { reach: 4 }) : new goals.GoalNear(pos.x, pos.y, pos.z, 2)
  return gotoTimed(bot, goal, ms, ctx && ctx.signal)
}

function creative (bot) { return bot.game && bot.game.gameMode === 'creative' }

// Alat terbaik untuk memecah blok. Hanya alat yang BOLEH memanen (harvestTools) bila blok mensyaratkan.
function bestTool (bot, block, mcData) {
  const info = mcData.blocks[block.type]
  const req = info && info.harvestTools
  const eff = bot.entity.effects || {}
  const time = it => block.digTime(it ? it.type : null, creative(bot), !!bot.entity.isInWater, !bot.entity.onGround, [], eff)
  let best = null; let bestT = req ? Infinity : time(null)
  let canHarvest = !req
  for (const it of bot.inventory.items()) {
    if (req && !req[it.type]) continue
    canHarvest = true
    const t = time(it)
    if (t < bestT) { bestT = t; best = it }
  }
  return { tool: best, canHarvest, ms: bestT, needs: req ? Object.keys(req).map(i => mcData.items[i] && mcData.items[i].name).filter(Boolean) : [] }
}

function movementsFor (bot, Movements, mcData, kind, opts = {}) {
  const mv = new Movements(bot)
  mv.allow1by1towers = false; mv.scafoldingBlocks = []; mv.allowParkour = false
  mv.canDig = kind === 'mine' && opts.dig !== 'none'
  mv.digCost = 2
  if (mv.canDig && opts.dig !== 'any') {
    const keep = new Set(opts.keepIds || [])
    for (const b of mcData.blocksArray) if (!NATURAL.test(b.name) && !keep.has(b.id)) mv.blocksCantBreak.add(b.id)
  }
  return mv
}

const WEAPONS = ['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'golden_sword', 'wooden_sword', 'netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe']
async function equipWeapon (bot) {
  for (const n of WEAPONS) {
    const it = bot.inventory.items().find(i => i.name === n)
    if (it) { if (!bot.heldItem || bot.heldItem.type !== it.type) await bot.equip(it, 'hand').catch(() => {}); return it }
  }
  return null
}

const BAD_FOOD = new Set(['rotten_flesh', 'spider_eye', 'pufferfish', 'poisonous_potato', 'chicken', 'suspicious_stew', 'enchanted_golden_apple'])
async function autoEat (bot, mcData) {
  if (bot.food === undefined || bot.food > 14) return false
  const it = bot.inventory.items().find(i => mcData.foodsByName[i.name] && !BAD_FOOD.has(i.name))
  if (!it) return false
  try { await bot.equip(it, 'hand'); await bot.consume(); return true } catch (e) { return false }
}

function hostiles (bot, r) {
  return Object.values(bot.entities).filter(e => e !== bot.entity && e.type === 'hostile' && e.position && e.position.distanceTo(bot.entity.position) <= r)
    .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))
}

// Serang entitas sampai hilang/mati atau waktu habis. Mengembalikan {killed, hits, ms}
async function fight (bot, ctx, target, maxMs = 12000) {
  const t0 = Date.now(); let hits = 0; let dead = false
  const onDead = e => { if (e && e.id === target.id) dead = true }
  bot.on('entityDead', onDead)
  await equipWeapon(bot)
  try { bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true) } catch (e) {}
  try {
    while (!ctx.signal.aborted && !dead && bot.entities[target.id] && Date.now() - t0 < maxMs) {
      const d = bot.entity.position.distanceTo(target.position)
      if (d <= 3.3) { await bot.lookAt(target.position.offset(0, (target.height || 1) / 2, 0), true).catch(() => {}); bot.attack(target); hits++ }
      await sleep(d <= 3.3 ? 600 : 250)
    }
  } finally { bot.removeListener('entityDead', onDead); try { bot.pathfinder.setGoal(null) } catch (e) {} }
  return { killed: dead || !bot.entities[target.id], hits, ms: Date.now() - t0 }
}

// Pengaman ringan: batas HP, makan otomatis, lawan monster dekat. null = aman lanjut.
async function guard (bot, ctx, opts = {}) {
  const min = opts.minHealth ?? 8
  if (bot.health !== undefined && bot.health < min) return { ok: false, code: 'INTERRUPTED', error: 'HP ' + bot.health + ' di bawah batas ' + min }
  await autoEat(bot, ctx.mcData)
  const h = hostiles(bot, 6)[0]
  if (h) { ctx.stats = ctx.stats || { fights: 0 }; ctx.stats.fights++; await fight(bot, ctx, h) }
  return null
}


// Cari wadah (chest/trapped_chest/barrel): tepat di koordinat hint, atau terdekat dari hint (<=6 blok), atau terdekat dari bot.
function findContainer (bot, mcData, hint, maxDist = 48) {
  const ids = ['chest', 'trapped_chest', 'barrel'].map(n => mcData.blocksByName[n] && mcData.blocksByName[n].id).filter(x => x != null)
  if (typeof hint === 'string') { const n = hint.match(/-?\d+(\.\d+)?/g); hint = n && n.length >= 3 ? { x: +n[0], y: +n[1], z: +n[2] } : true } // "x y z" atau "x,y,z"
  const at = hint && typeof hint === 'object' && [hint.x, hint.y, hint.z].every(Number.isFinite) ? hint : null
  const seen = at ? bot.blockAt(new Vec3(Math.floor(at.x), Math.floor(at.y), Math.floor(at.z))) : null
  if (seen && ids.includes(seen.type)) return { block: seen, how: 'koordinat', seen: seen.name }
  const all = bot.findBlocks({ matching: ids, maxDistance: maxDist, count: 40 }) || []
  const ref = at ? { x: at.x, y: at.y, z: at.z } : bot.entity.position
  const d2 = q => (q.x - ref.x) ** 2 + (q.y - ref.y) ** 2 + (q.z - ref.z) ** 2
  const best = all.sort((a, b) => d2(a) - d2(b))[0]
  if (!best || (at && d2(best) > 36)) return { block: null, seen: seen ? (seen.name || 'modded') : null, nearest: best ? { x: best.x, y: best.y, z: best.z } : null }
  return { block: bot.blockAt(best), how: at ? 'terdekat dari koordinat' : 'terdekat dari bot', seen: seen ? seen.name : null }
}

// item modded tak dikenal bernama 'unknown': dibedakan per id numerik (unknown#<id>) supaya bisa dikelompokkan; komponen item tidak terbaca
// nama item modded: dari registri sinkronisasi / hasil snapshot bila ada ('ns:path'), kalau tidak 'unknown#<id>'
const itemKey = i => { if (i.name && i.name !== 'unknown') return i.name; const n = require('./_names').nameOf(i.type); return n || 'unknown#' + i.type }
function invTotals (bot) { const m = {}; for (const i of bot.inventory.items()) { const k = itemKey(i); m[k] = (m[k] || 0) + i.count } return m }
function diffTotals (a, b) { const d = {}; for (const k of Object.keys(b)) { const v = b[k] - (a[k] || 0); if (v > 0) d[k] = v } return d }

module.exports = { sleep, NATURAL, gotoTimed, traceStops, pathDiag, steerTo, approachEntity, bestTool, movementsFor, equipWeapon, autoEat, hostiles, fight, guard, invTotals, diffTotals, creative, findContainer, approach, itemKey }
