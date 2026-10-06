// skills/_util.js - helper bersama (nama berawalan _ = bukan skill)
const { goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const NATURAL = /^(dirt|grass_block|coarse_dirt|rooted_dirt|podzol|mycelium|sand|red_sand|gravel|clay|stone|andesite|diorite|granite|tuff|deepslate|netherrack|snow|snow_block|short_grass|tall_grass|fern|large_fern|dead_bush|vine|moss_block|moss_carpet|dripstone_block|pointed_dripstone|calcite|basalt|blackstone)$|_leaves$|_ore$/

// goto dengan batas waktu; pada timeout pathfinder dihentikan dan error bernama 'Timeout'
async function gotoTimed (bot, goal, ms, signal) {
  let t
  const timeout = new Promise((resolve, reject) => { t = setTimeout(() => { try { bot.pathfinder.stop() } catch (e) {} reject(Object.assign(new Error('goto melewati batas ' + ms + ' ms'), { name: 'Timeout' })) }, ms) })
  const onAbort = () => { try { bot.pathfinder.stop() } catch (e) {} }
  if (signal) signal.addEventListener('abort', onAbort, { once: true })
  try { await Promise.race([bot.pathfinder.goto(goal), timeout]) } finally { clearTimeout(t); if (signal) signal.removeEventListener('abort', onAbort) }
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
const itemKey = i => i.name === 'unknown' || !i.name ? 'unknown#' + i.type : i.name
function invTotals (bot) { const m = {}; for (const i of bot.inventory.items()) { const k = itemKey(i); m[k] = (m[k] || 0) + i.count } return m }
function diffTotals (a, b) { const d = {}; for (const k of Object.keys(b)) { const v = b[k] - (a[k] || 0); if (v > 0) d[k] = v } return d }

module.exports = { sleep, NATURAL, gotoTimed, bestTool, movementsFor, equipWeapon, autoEat, hostiles, fight, guard, invTotals, diffTotals, creative, findContainer, approach, itemKey }
