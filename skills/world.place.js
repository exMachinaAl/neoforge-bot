const { Vec3 } = require('vec3')
const U = require('./_util')
const manifest = { name: 'world.place', description: 'Pasang satu blok vanilla dari inventory di koordinat kosong; dekati tanpa menggali, verifikasi hasil server. Blok yang sudah sesuai tidak dipasang ulang.',
  paramsSchema: { type: 'object', required: ['block', 'x', 'y', 'z'], properties: {
    block: { type: 'string' }, x: { type: 'integer' }, y: { type: 'integer' }, z: { type: 'integer' }
  } }, requires: ['move', 'block.read', 'block.place', 'inventory.protocol'], interruptible: true, estimatedMs: 40000 }
async function run (bot, p, ctx) {
  const name = String(p.block).replace(/^minecraft:/, ''), md = ctx.mcData
  const info = md.blocksByName[name], itemInfo = md.itemsByName[name], dest = new Vec3(p.x, p.y, p.z)
  const failure = (code, error) => ({ ok: false, code, error, data: { block: name, position: dest } })
  if (!info || !itemInfo) return failure('PRECONDITION_FAILED', 'blok/item vanilla tidak dikenal')
  if (ctx.signal.aborted) return failure('ABORTED', 'dihentikan')
  const before = bot.blockAt(dest)
  if (before?.type === info.id) return { ok: true, code: 'OK', data: { block: name, position: dest, alreadyPresent: true } }
  if (!before || !/^(air|cave_air|void_air)$/.test(before.name)) return failure('PRECONDITION_FAILED', 'lokasi belum dimuat atau tidak kosong')
  const item = bot.inventory.items().find(i => i.type === itemInfo.id)
  if (!item) return failure('PRECONDITION_FAILED', 'bahan belum tersedia: ' + name)
  const offsets = [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]
  const ref = offsets.map(d => bot.blockAt(dest.offset(...d))).find(b => b?.boundingBox === 'block' &&
    !/(chest|barrel|furnace|door|button|lever|crafting_table|bed|shulker|hopper|dispenser|dropper|beacon|anvil)/.test(b.name))
  if (!ref) return failure('PRECONDITION_FAILED', 'tidak ada permukaan penyangga yang sesuai')
  try {
    bot.pathfinder.setMovements(ctx.movements('walk'))
    await U.approach(bot, ref.position, ctx, 30000)
    if (ctx.signal.aborted) return failure('ABORTED', 'dihentikan')
    const space = bot.blockAt(dest)
    if (!space || !/^(air|cave_air|void_air)$/.test(space.name)) return failure('PRECONDITION_FAILED', 'lokasi berubah sebelum pemasangan')
    for (const e of [bot.entity, ...Object.values(bot.entities || {})]) {
      if (e.position && Math.abs(e.position.x - dest.x - 0.5) < (e.width || 0.6) / 2 + 0.5 &&
          Math.abs(e.position.z - dest.z - 0.5) < (e.width || 0.6) / 2 + 0.5 &&
          e.position.y < dest.y + 1 && e.position.y + (e.height || 1.8) > dest.y) return failure('PRECONDITION_FAILED', 'lokasi ditempati entitas')
    }
    await bot.equip(item, 'hand')
    if (ctx.signal.aborted) return failure('ABORTED', 'dihentikan')
    await bot.placeBlock(ref, dest.minus(ref.position))
    if (bot.blockAt(dest)?.type !== info.id) return failure('SERVER_REJECTED', 'server belum mengonfirmasi blok tujuan')
    return { ok: true, code: 'OK', data: { block: name, position: dest, placed: true } }
  } catch (e) { return failure(ctx.signal.aborted ? 'ABORTED' : 'SERVER_REJECTED', e.message) }
}
module.exports = { manifest, run, cli: ['block', 'x', 'y', 'z'] }
