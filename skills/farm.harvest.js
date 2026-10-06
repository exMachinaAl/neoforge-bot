const { goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const U = require('./_util')

const CROPS = { wheat: { seed: 'wheat_seeds', max: 7 }, carrots: { seed: 'carrot', max: 7 }, potatoes: { seed: 'potato', max: 7 }, beetroots: { seed: 'beetroot_seeds', max: 3 } }

const manifest = {
  name: 'farm.harvest',
  description: 'Panen tanaman matang (wheat, carrots, potatoes, beetroots) di sekitar dan tanam ulang bila punya bibit',
  paramsSchema: {
    type: 'object',
    properties: {
      crops: { type: ['array', 'string'], description: 'wheat,carrots,potatoes,beetroots (pisah koma); kosong = semua' },
      count: { type: 'integer', minimum: 1, maximum: 128, default: 16 },
      maxDistance: { type: 'integer', minimum: 4, maximum: 48, default: 24 },
      replant: { type: 'boolean', default: true },
      guard: { type: 'boolean', default: true },
      minHealth: { type: 'number', default: 8 }
    }
  },
  requires: ['move', 'block.read', 'block.dig', 'block.place', 'inventory.protocol'],
  interruptible: true,
  estimatedMs: 120000
}

async function run (bot, p, ctx) {
  const md = ctx.mcData
  const want = Array.isArray(p.crops) ? p.crops : String(p.crops || '').split(/[\s,]+/).filter(Boolean)
  const names = (want.length ? want : Object.keys(CROPS)).filter(n => CROPS[n])
  if (!names.length) return { ok: false, code: 'PRECONDITION_FAILED', error: 'crops tidak valid; pilih dari ' + Object.keys(CROPS).join(',') }
  if (bot.game.gameMode !== 'survival') return { ok: false, code: 'PRECONDITION_FAILED', error: 'mode game ' + bot.game.gameMode + ': panen tidak menjatuhkan item. /gamemode survival BotAlpha' }
  const count = Math.min(128, Math.max(1, parseInt(p.count ?? 16, 10)))
  const maxDistance = Math.min(48, Math.max(4, parseInt(p.maxDistance ?? 24, 10)))
  const ids = names.map(n => md.blocksByName[n].id)
  const stat = { harvested: 0, replanted: 0, failed: 0 }
  const reasons = []; const bad = new Set()
  const key = v => v.x + ',' + v.y + ',' + v.z
  const why = m => { reasons.push(m); if (reasons.length > 8) reasons.shift() }
  const mature = b => { const c = CROPS[b.name]; if (!c) return false; const age = Number((b.getProperties() || {}).age); return Number.isFinite(age) && age >= c.max }
  const seen = () => { let m = 0; let im = 0; for (const q of bot.findBlocks({ matching: ids, maxDistance, count: 300 }) || []) { const bb = bot.blockAt(q); if (bb && mature(bb)) m++; else im++ } return { mature: m, immature: im } }
  const res = (ok, code, error) => ({ ok, code, error: error && reasons.length ? error + ' | ' + reasons.slice(-3).join(' ; ') : error, data: Object.assign({ reasons, fights: (ctx.stats && ctx.stats.fights) || 0, tanaman: ok ? undefined : seen() }, stat) })

  bot.pathfinder.setMovements(ctx.movements('walk'))
  while (stat.harvested < count) {
    if (ctx.signal.aborted) return res(false, 'ABORTED')
    if (p.guard !== false) { const g = await U.guard(bot, ctx, { minHealth: p.minHealth }); if (g) return res(false, g.code, g.error) }
    if (stat.failed >= 8) return res(false, 'TARGET_NOT_FOUND', 'terlalu banyak kegagalan beruntun (panen ' + stat.harvested + ')')
    const b = bot.findBlock({ matching: ids, maxDistance, useExtraInfo: x => !bad.has(key(x.position)) && mature(x) })
    if (!b) { const s = seen(); return stat.harvested > 0 ? res(true, 'OK') : res(false, 'TARGET_NOT_FOUND', 'tidak ada tanaman matang dijangkau (matang ' + s.mature + ', belum matang ' + s.immature + ' dalam ' + maxDistance + ' blok)') }
    try { await U.approach(bot, b.position, ctx, 30000) } catch (e) {
      if (ctx.signal.aborted) return res(false, 'ABORTED')
      why('jalan ' + key(b.position) + ': ' + e.name); bad.add(key(b.position)); stat.failed++; continue
    }
    const cur = bot.blockAt(b.position)
    if (!cur || !CROPS[cur.name] || !mature(cur)) { bad.add(key(b.position)); continue }
    const name = cur.name; const pos = cur.position.clone()
    if (typeof bot.canDigBlock === 'function' && !bot.canDigBlock(cur)) {
      try { await U.gotoTimed(bot, new goals.GoalNear(pos.x, pos.y, pos.z, 1), 10000, ctx.signal) } catch (e) { why('mendekat ' + key(pos) + ': ' + e.name) }
    }
    try { await bot.dig(cur) } catch (e) { why('gali ' + key(pos) + ': ' + e.message); bad.add(key(pos)); stat.failed++; continue }
    stat.harvested++; stat.failed = 0
    try { await U.gotoTimed(bot, new goals.GoalNear(pos.x, pos.y, pos.z, 1), 6000, ctx.signal) } catch (e) { /* item mungkin tetap terambil */ }
    await U.sleep(500)
    if (p.replant !== false) {
      const seedInfo = md.itemsByName[CROPS[name].seed]
      const seed = bot.inventory.items().find(i => i.type === seedInfo.id)
      const soil = bot.blockAt(pos.offset(0, -1, 0))
      if (seed && soil && soil.name === 'farmland') {
        try { await bot.equip(seed, 'hand'); await bot.lookAt(soil.position.offset(0.5, 1, 0.5), true); await bot.placeBlock(soil, new Vec3(0, 1, 0)); stat.replanted++ } catch (e) { why('tanam ulang ' + key(pos) + ': ' + e.message) }
      } else if (seed && soil) why('tanam ulang ' + key(pos) + ': tanah ' + (soil.name || 'modded') + ' (bukan farmland)')
    }
  }
  return res(true, 'OK')
}

module.exports = { manifest, run, cli: ['count'] }
