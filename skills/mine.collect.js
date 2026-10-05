const { goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const manifest = {
  name: 'mine.collect',
  description: 'Menambang blok terdekat bernama block sampai terkumpul count item; opsional menyimpan ke chest di koordinat chest',
  paramsSchema: {
    type: 'object',
    required: ['block'],
    properties: {
      block: { type: 'string' },
      item: { type: 'string', description: 'nama item bila beda dengan blok (stone -> cobblestone)' },
      count: { type: 'integer', minimum: 1, maximum: 256, default: 8 },
      maxDistance: { type: 'integer', minimum: 4, maximum: 64, default: 32 },
      chest: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } }
    }
  },
  requires: ['move', 'block.read', 'block.dig', 'inventory.protocol'],
  interruptible: true,
  estimatedMs: 120000
}

async function run (bot, p, ctx) {
  const blockInfo = ctx.mcData.blocksByName[p.block]
  if (!blockInfo) return { ok: false, code: 'PRECONDITION_FAILED', error: 'blok tidak dikenal (hanya vanilla): ' + p.block }
  const itemInfo = ctx.mcData.itemsByName[p.item || p.block]
  if (!itemInfo) return { ok: false, code: 'PRECONDITION_FAILED', error: 'item tidak dikenal: ' + (p.item || p.block) + ' (isi param item, mis. block=stone item=cobblestone)' }
  const count = Math.min(256, Math.max(1, parseInt(p.count ?? 8, 10)))
  const maxDistance = Math.min(64, Math.max(4, parseInt(p.maxDistance ?? 32, 10)))
  const have = () => bot.inventory.count(itemInfo.id, null)
  const start = have()
  const got = () => have() - start
  const key = v => v.x + ',' + v.y + ',' + v.z
  const bad = new Set()
  let fails = 0
  let collected = null // dibekukan setelah loop, supaya angka tidak berubah oleh penyimpanan ke chest
  const res = (ok, code, error, extra) => ({ ok, code, error, data: Object.assign({ collected: collected ?? got(), item: itemInfo.name, finalCount: have() }, extra) })
  const gotoLook = pos => bot.pathfinder.goto(new goals.GoalLookAtBlock(pos, bot.world, { reach: 4 }))

  bot.pathfinder.setMovements(ctx.movements())
  while (got() < count) {
    if (ctx.signal.aborted) return res(false, 'ABORTED')
    if (fails >= 5) return res(false, 'TARGET_NOT_FOUND', 'terlalu banyak kegagalan beruntun (jalur, gali, atau item tidak masuk)')
    const b = bot.findBlock({ matching: blockInfo.id, maxDistance, useExtraInfo: x => !bad.has(key(x.position)) })
    if (!b) return res(false, 'TARGET_NOT_FOUND', bad.size ? 'semua ' + bad.size + ' kandidat ' + p.block + ' gagal dijangkau/digali' : 'tidak ada ' + p.block + ' dalam ' + maxDistance + ' blok')
    try { await gotoLook(b.position) } catch (e) {
      if (ctx.signal.aborted) return res(false, 'ABORTED')
      bad.add(key(b.position)); fails++; continue
    }
    if (ctx.signal.aborted) return res(false, 'ABORTED')
    const cur = bot.blockAt(b.position)
    if (!cur || cur.type !== blockInfo.id) { bad.add(key(b.position)); continue }
    try { // alat vanilla terbaik bila ada
      const tool = bot.pathfinder.bestHarvestTool(cur)
      if (tool && /_(axe|pickaxe|shovel|hoe)$/.test(tool.name) && !(bot.heldItem && bot.heldItem.type === tool.type)) await bot.equip(tool, 'hand')
    } catch (e) { /* lanjut dengan alat saat ini */ }
    const before = have()
    try { await bot.dig(cur) } catch (e) {
      if (ctx.signal.aborted) return res(false, 'ABORTED')
      bad.add(key(b.position)); fails++; continue
    }
    try { await bot.pathfinder.goto(new goals.GoalNear(b.position.x, b.position.y, b.position.z, 1)) } catch (e) { if (ctx.signal.aborted) return res(false, 'ABORTED') }
    await sleep(600) // beri waktu item terambil
    if (have() > before) fails = 0; else fails++
  }

  collected = got()
  let deposited = 0
  if (p.chest) {
    const c = p.chest
    if (![c.x, c.y, c.z].every(Number.isFinite)) return res(false, 'PRECONDITION_FAILED', 'chest butuh x,y,z angka')
    const cb = bot.blockAt(new Vec3(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z)))
    if (!cb || cb.name !== 'chest') return res(false, 'TARGET_NOT_FOUND', 'tidak ada chest di koordinat itu (blok: ' + (cb ? (cb.name || 'modded') : 'NULL') + ')')
    try { await gotoLook(cb.position) } catch (e) { return res(false, ctx.signal.aborted ? 'ABORTED' : 'NO_PATH', e.message) }
    let w
    try {
      w = await bot.openContainer(cb)
      const n = got()
      await w.deposit(itemInfo.id, null, n)
      await sleep(400)
      deposited = n
    } catch (e) { return res(false, 'UNKNOWN', 'gagal menyimpan ke chest: ' + e.message, { deposited }) } finally { if (w) w.close() }
  }
  return res(true, 'OK', undefined, { deposited })
}

module.exports = { manifest, run, cli: ['block', 'count'] }
