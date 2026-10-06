const U = require('./_util')

const manifest = {
  name: 'hunt.kill',
  description: 'Mengejar dan membunuh count entitas bernama mob (mis. cow, zombie) atau bertipe animal/hostile, dalam maxDistance',
  paramsSchema: {
    type: 'object',
    required: ['mob'],
    properties: {
      mob: { type: 'string', description: 'nama entitas vanilla (cow, zombie, ...) atau tipe: animal | hostile' },
      count: { type: 'integer', minimum: 1, maximum: 64, default: 1 },
      maxDistance: { type: 'integer', minimum: 4, maximum: 64, default: 32 },
      minHealth: { type: 'number', default: 8 }
    }
  },
  requires: ['move', 'combat.vanilla'],
  interruptible: true,
  estimatedMs: 60000
}

async function run (bot, p, ctx) {
  const md = ctx.mcData
  const mob = String(p.mob || '')
  const byType = mob === 'animal' || mob === 'hostile'
  if (!byType && !md.entitiesByName[mob]) return { ok: false, code: 'PRECONDITION_FAILED', error: 'entitas tidak dikenal (hanya vanilla): ' + mob }
  if (bot.game.gameMode === 'creative' || bot.game.gameMode === 'spectator') return { ok: false, code: 'PRECONDITION_FAILED', error: 'mode game ' + bot.game.gameMode + ': ganti ke survival' }
  const count = Math.min(64, Math.max(1, parseInt(p.count ?? 1, 10)))
  const maxDistance = Math.min(64, Math.max(4, parseInt(p.maxDistance ?? 32, 10)))
  const kills = []; const skip = new Set(); let hits = 0; let giveUp = 0
  const res = (ok, code, error) => ({ ok, code, error, data: { kills: kills.length, hits, targets: kills.slice(-5) } })
  bot.pathfinder.setMovements(ctx.movements('walk'))
  while (kills.length < count) {
    if (ctx.signal.aborted) return res(false, 'ABORTED')
    if (bot.health !== undefined && bot.health < (p.minHealth ?? 8)) return res(false, 'INTERRUPTED', 'HP ' + bot.health + ' di bawah batas')
    await U.autoEat(bot, md)
    const t = Object.values(bot.entities).filter(e => e !== bot.entity && e.position && !skip.has(e.id) && (byType ? e.type === mob : e.name === mob) && e.position.distanceTo(bot.entity.position) <= maxDistance)
      .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))[0]
    if (!t) return kills.length ? res(false, 'TARGET_NOT_FOUND', 'hanya ' + kills.length + ' dari ' + count + ' ditemukan') : res(false, 'TARGET_NOT_FOUND', 'tidak ada ' + mob + ' dalam ' + maxDistance + ' blok')
    const r = await U.fight(bot, ctx, t, 20000)
    hits += r.hits
    if (r.killed && r.hits > 0) { kills.push(t.name || mob); giveUp = 0 } else { skip.add(t.id); if (++giveUp >= 4) return res(false, 'TARGET_NOT_FOUND', 'empat target beruntun tidak bisa dibunuh (terhalang/damage diblok?)') }
  }
  return res(true, 'OK')
}

module.exports = { manifest, run, cli: ['mob', 'count'] }
