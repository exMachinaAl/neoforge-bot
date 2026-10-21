const { goals } = require('mineflayer-pathfinder')
const U = require('./_util')

const manifest = {
  name: 'world.explore',
  description: 'Berjalan secara berbatas untuk memuat wilayah baru dan mencari blok vanilla di luar radius inspeksi lokal; tidak menggali atau menaruh blok.',
  paramsSchema: {
    type: 'object',
    required: ['blocks'],
    properties: {
      blocks: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string' } },
      distance: { type: 'integer', minimum: 16, maximum: 256, default: 96 },
      scanRadius: { type: 'integer', minimum: 8, maximum: 48, default: 24 },
      count: { type: 'integer', minimum: 1, maximum: 32, default: 8 },
      direction: { enum: ['auto', 'north', 'east', 'south', 'west'], default: 'auto' },
      minHealth: { type: 'number', minimum: 1, default: 8 }
    }
  },
  requires: ['move', 'block.read'],
  interruptible: true,
  estimatedMs: 180000
}

async function run (bot, p, ctx) {
  const name = n => String(n).replace(/^minecraft:/, '')
  const requested = p.blocks.map(name)
  const unknown = requested.filter(n => !ctx.mcData.blocksByName[n])
  if (unknown.length) return { ok: false, code: 'PRECONDITION_FAILED', error: 'blok tidak dikenal: ' + unknown.join(', ') }
  if (bot.health < Number(p.minHealth ?? 8)) return { ok: false, code: 'INTERRUPTED', error: 'HP terlalu rendah untuk eksplorasi: ' + bot.health }
  const ids = requested.map(n => ctx.mcData.blocksByName[n].id)
  const distance = Number(p.distance ?? 96), scanRadius = Number(p.scanRadius ?? 24), count = Number(p.count ?? 8)
  const origin = bot.entity.position.floored()
  const describe = pos => { const b = bot.blockAt(pos); return b && { name: b.name, type: b.type, position: b.position } }
  const scan = () => bot.findBlocks({ matching: ids, maxDistance: scanRadius, count }).slice(0, count).map(describe).filter(Boolean)
  const data = (nearby, visited, extra = {}) => ({ query: { blocks: requested, distance, scanRadius, count, direction: p.direction || 'auto' },
    origin: { x: origin.x, y: origin.y, z: origin.z }, nearby, found: nearby.length, visited, loadedChunksOnly: true, ...extra })
  let nearby = scan()
  if (nearby.length) return { ok: true, code: 'OK', data: data(nearby, [], { alreadyNearby: true }) }

  const vectors = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] }
  const directions = p.direction && p.direction !== 'auto' ? [p.direction] : ['north', 'east', 'south', 'west']
  const step = Math.max(16, Math.min(scanRadius, 32)), waypoints = []
  for (let d = step; d <= distance; d += step) {
    for (const direction of directions) {
      const [dx, dz] = vectors[direction]
      waypoints.push({ direction, x: origin.x + dx * d, z: origin.z + dz * d })
    }
  }
  const visited = [], errors = []
  bot.pathfinder.setMovements(ctx.movements('walk'))
  for (let i = 0; i < waypoints.length; i++) {
    if (ctx.signal.aborted) return { ok: false, code: 'ABORTED', error: 'eksplorasi dihentikan', data: data([], visited) }
    if (bot.health < Number(p.minHealth ?? 8)) return { ok: false, code: 'INTERRUPTED', error: 'HP turun di bawah batas eksplorasi', data: data([], visited) }
    const w = waypoints[i]
    try {
      await U.gotoTimed(bot, new goals.GoalNearXZ(w.x, w.z, 3), 45000, ctx.signal)
      visited.push({ direction: w.direction, x: +bot.entity.position.x.toFixed(1), y: +bot.entity.position.y.toFixed(1), z: +bot.entity.position.z.toFixed(1) })
    } catch (e) {
      if (ctx.signal.aborted) return { ok: false, code: 'ABORTED', error: 'eksplorasi dihentikan', data: data([], visited) }
      errors.push(w.direction + '@' + w.x + ',' + w.z + ':' + e.name)
      if (errors.length > 8) errors.shift()
      continue
    }
    ctx.progress?.({ pct: (i + 1) / waypoints.length, label: 'Menjelajah ' + w.direction,
      data: { visited: visited.length, position: visited[visited.length - 1] } })
    nearby = scan()
    if (nearby.length) return { ok: true, code: 'OK', data: data(nearby, visited) }
  }
  if (!visited.length) return { ok: false, code: 'NO_PATH', error: 'tidak ada rute eksplorasi yang dapat ditempuh', data: data([], visited, { errors }) }
  return { ok: false, code: 'TARGET_NOT_FOUND', error: 'tidak menemukan ' + requested.join('/') + ' setelah eksplorasi berbatas ' + distance + ' blok',
    data: data([], visited, { exhausted: true, errors }) }
}

module.exports = { manifest, run }
