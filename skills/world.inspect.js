const { Vec3 } = require('vec3')
const posSchema = { type: 'object', required: ['x', 'y', 'z'], additionalProperties: false,
  properties: { x: { type: 'integer' }, y: { type: 'integer' }, z: { type: 'integer' } } }
const manifest = { name: 'world.inspect', description: 'Amati blok/entitas yang sudah dimuat, periksa koordinat, dan baca resep vanilla. Tidak bergerak atau mengubah dunia.',
  paramsSchema: { type: 'object', properties: {
    blocks: { type: 'array', maxItems: 12, items: { type: 'string' }, description: 'nama blok yang dicari, mis. chest, oak_log, stone' },
    positions: { type: 'array', maxItems: 32, items: posSchema },
    recipes: { type: 'array', maxItems: 8, items: { type: 'string' } },
    radius: { type: 'integer', minimum: 1, maximum: 64, default: 32 },
    count: { type: 'integer', minimum: 1, maximum: 32, default: 16 }
  } }, requires: ['block.read'], interruptible: true, estimatedMs: 1000 }
async function run (bot, p, ctx) {
  if (ctx.signal.aborted) return { ok: false, code: 'ABORTED' }
  const md = ctx.mcData, radius = p.radius || 32, count = p.count || 16
  const name = n => String(n).replace(/^minecraft:/, '')
  const requested = p.blocks || [], unknown = requested.filter(n => !md.blocksByName[name(n)])
  if (unknown.length) return { ok: false, code: 'PRECONDITION_FAILED', error: 'blok tidak dikenal: ' + unknown.join(', ') }
  const ids = requested.map(n => md.blocksByName[name(n)].id)
  const describe = b => b ? { name: b.name, type: b.type, position: b.position } : { loaded: false }
  const nearby = ids.length ? bot.findBlocks({ matching: ids, maxDistance: radius, count }).slice(0, count).map(pos => describe(bot.blockAt(pos))) : []
  const positions = (p.positions || []).map(pos => ({ requested: pos, ...describe(bot.blockAt(new Vec3(pos.x, pos.y, pos.z))) }))
  const Recipe = require('prismarine-recipe')(bot.registry).Recipe
  const recipes = (p.recipes || []).map(n => {
    const item = md.itemsByName[name(n)]
    return { item: name(n), recipes: item ? Recipe.find(item.id, null).slice(0, 12).map(r => ({
      count: r.result.count, table: r.requiresTable,
      ingredients: r.delta.filter(d => d.count < 0).map(d => ({ item: md.items[d.id]?.name, count: -d.count }))
    })) : [], note: 'resep dibatasi 12 varian; bahan modded tidak tercakup' }
  })
  const entities = Object.values(bot.entities || {}).filter(e => e !== bot.entity && e.position &&
    e.position.distanceTo(bot.entity.position) <= radius).slice(0, 24).map(e => ({ name: e.name || e.username, type: e.type, position: e.position }))
  return { ok: true, code: 'OK', data: {
    query: { blocks: requested.map(name), radius, count }, nearby, found: nearby.length,
    exhausted: ids.length > 0 && nearby.length === 0,
    positions, recipes, entities, radius, loadedChunksOnly: true,
    note: ids.length > 0 && nearby.length === 0
      ? 'Tidak ada blok yang diminta pada chunk termuat dalam radius ini; bergerak dengan world.explore sebelum mencari ulang.'
      : undefined
  } }
}
module.exports = { manifest, run, posSchema }
