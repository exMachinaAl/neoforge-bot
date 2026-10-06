const { goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const U = require('./_util')

const manifest = {
  name: 'mine.collect',
  description: 'Menambang blok terdekat sampai terkumpul count item hasil (drop otomatis dari data blok); menggali menembus tanah/batu alami bila perlu; opsional simpan ke chest',
  paramsSchema: {
    type: 'object',
    required: ['block'],
    properties: {
      block: { type: 'string' },
      item: { type: 'string', description: 'timpa item hasil bila perlu (default: dari data blok, mis. stone -> cobblestone)' },
      count: { type: 'integer', minimum: 1, maximum: 256, default: 8 },
      maxDistance: { type: 'integer', minimum: 4, maximum: 64, default: 32 },
      dig: { enum: ['natural', 'any', 'none'], default: 'natural' },
      guard: { type: 'boolean', default: true },
      minHealth: { type: 'number', default: 8 },
      chest: { type: ['boolean', 'string', 'object'], description: 'true/"auto" = chest/barrel terdekat; {x,y,z} = di/dekat koordinat itu' }
    }
  },
  requires: ['move', 'block.read', 'block.dig', 'inventory.protocol'],
  interruptible: true,
  estimatedMs: 180000
}

async function run (bot, p, ctx) {
  const md = ctx.mcData
  const blockInfo = md.blocksByName[p.block]
  if (!blockInfo) return { ok: false, code: 'PRECONDITION_FAILED', error: 'blok tidak dikenal (hanya vanilla): ' + p.block }
  if (bot.game.gameMode !== 'survival') return { ok: false, code: 'PRECONDITION_FAILED', error: 'mode game ' + bot.game.gameMode + ': blok tidak menjatuhkan item. /gamemode survival BotAlpha' }
  let dropIds = p.item ? [md.itemsByName[p.item] && md.itemsByName[p.item].id] : (blockInfo.drops || [])
  if (!dropIds.length || dropIds.some(x => x == null)) dropIds = [md.itemsByName[p.block] && md.itemsByName[p.block].id].filter(x => x != null)
  if (!dropIds.length) return { ok: false, code: 'PRECONDITION_FAILED', error: 'item hasil tidak diketahui untuk ' + p.block + ' (isi param item)' }
  const dropNames = dropIds.map(i => md.items[i].name)
  const dig = p.dig || 'natural'
  const count = Math.min(256, Math.max(1, parseInt(p.count ?? 8, 10)))
  const maxDistance = Math.min(64, Math.max(4, parseInt(p.maxDistance ?? 32, 10)))
  const useGuard = p.guard !== false

  // pra-cek: alat yang boleh memanen blok ini harus ada (stone tanpa pickaxe tidak menjatuhkan apa pun)
  const probe = bot.findBlock({ matching: blockInfo.id, maxDistance })
  if (!probe) return { ok: false, code: 'TARGET_NOT_FOUND', error: 'tidak ada ' + p.block + ' dalam ' + maxDistance + ' blok' }
  const bt = U.bestTool(bot, probe, md)
  if (!bt.canHarvest) return { ok: false, code: 'PRECONDITION_FAILED', error: p.block + ' butuh alat: ' + bt.needs.slice(0, 3).join('/') + ' (mis. /give BotAlpha minecraft:' + (bt.needs[0] || 'iron_pickaxe') + ')' }

  const have = () => dropIds.reduce((a, id) => a + bot.inventory.count(id, null), 0)
  const start = have(); const got = () => have() - start
  const startBy = {}; for (const id of dropIds) startBy[id] = bot.inventory.count(id, null)
  const key = v => v.x + ',' + v.y + ',' + v.z
  const bad = new Set(); const reasons = []
  let fails = 0; let collected = null; let dug = 0
  const why = m => { reasons.push(m); if (reasons.length > 6) reasons.shift() }
  const res = (ok, code, error, extra) => ({ ok, code, error, data: Object.assign({ collected: collected ?? got(), items: dropNames, dug, fights: (ctx.stats && ctx.stats.fights) || 0, reasons }, extra) })
  const mv = ctx.movements('mine', { dig, keepIds: [blockInfo.id] })
  const gotoLook = pos => U.gotoTimed(bot, new goals.GoalLookAtBlock(pos, bot.world, { reach: 4 }), 45000, ctx.signal)

  bot.pathfinder.setMovements(mv)
  while (got() < count) {
    if (ctx.signal.aborted) return res(false, 'ABORTED')
    if (useGuard) { const g = await U.guard(bot, ctx, { minHealth: p.minHealth }); if (g) return res(false, g.code, g.error) }
    if (fails >= 5) return res(false, 'TARGET_NOT_FOUND', 'terlalu banyak kegagalan beruntun; lihat data.reasons')
    const b = bot.findBlock({ matching: blockInfo.id, maxDistance, useExtraInfo: x => !bad.has(key(x.position)) })
    if (!b) return res(false, 'TARGET_NOT_FOUND', bad.size ? 'semua ' + bad.size + ' kandidat ' + p.block + ' gagal; lihat data.reasons' : 'tidak ada ' + p.block + ' dalam ' + maxDistance + ' blok')
    try { await gotoLook(b.position) } catch (e) {
      if (ctx.signal.aborted) return res(false, 'ABORTED')
      why('jalan ke ' + key(b.position) + ': ' + e.name); bad.add(key(b.position)); fails++; continue
    }
    const cur = bot.blockAt(b.position)
    if (!cur || cur.type !== blockInfo.id) { bad.add(key(b.position)); continue }
    const t = U.bestTool(bot, cur, md)
    if (!t.canHarvest) return res(false, 'PRECONDITION_FAILED', 'alat untuk ' + p.block + ' hilang/rusak (butuh ' + t.needs.slice(0, 3).join('/') + ')')
    try { if (t.tool && (!bot.heldItem || bot.heldItem.type !== t.tool.type)) await bot.equip(t.tool, 'hand') } catch (e) { why('equip: ' + e.message) }
    const before = have()
    try { await bot.dig(cur); dug++ } catch (e) {
      if (ctx.signal.aborted) return res(false, 'ABORTED')
      why('gali ' + key(b.position) + ': ' + e.message); bad.add(key(b.position)); fails++; continue
    }
    try { await U.gotoTimed(bot, new goals.GoalNear(b.position.x, b.position.y, b.position.z, 1), 8000, ctx.signal) } catch (e) { if (ctx.signal.aborted) return res(false, 'ABORTED') }
    for (let i = 0; i < 10 && have() <= before; i++) await U.sleep(150)
    if (have() > before) fails = 0; else { why('item tidak masuk setelah gali ' + key(b.position)); fails++ }
  }

  collected = got()
  let deposited = 0
  let chestInfo = null
  if (p.chest && p.chest !== 'false' && p.chest !== '0') {
    const f = U.findContainer(bot, md, p.chest, 48)
    if (!f.block) return res(false, 'TARGET_NOT_FOUND', 'tidak ada chest/barrel yang ditemukan' + (f.seen ? ' (blok di koordinat itu: ' + f.seen + ')' : '') + (f.nearest ? '; terdekat di ' + f.nearest.x + ',' + f.nearest.y + ',' + f.nearest.z : ''))
    const cb = f.block
    chestInfo = { x: cb.position.x, y: cb.position.y, z: cb.position.z, how: f.how }
    bot.pathfinder.setMovements(ctx.movements('walk'))
    try { await gotoLook(cb.position) } catch (e) { return res(false, ctx.signal.aborted ? 'ABORTED' : 'NO_PATH', e.message, { chest: chestInfo }) }
    let w
    try {
      w = await bot.openContainer(cb)
      for (const id of dropIds) { const n = bot.inventory.count(id, null) - startBy[id]; if (n > 0) { await w.deposit(id, null, n); deposited += n } }
      await U.sleep(400)
    } catch (e) { return res(false, 'UNKNOWN', 'gagal menyimpan ke chest: ' + e.message, { deposited, chest: chestInfo }) } finally { if (w) w.close() }
  }
  return res(true, 'OK', undefined, { deposited, chest: chestInfo })
}

module.exports = { manifest, run, cli: ['block', 'count'] }
