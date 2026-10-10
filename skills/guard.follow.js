const { goals } = require('mineflayer-pathfinder')
const U = require('./_util')
const C = require('./_combat')

const manifest = {
  name: 'guard.follow',
  description: 'Ikuti pemain sebagai pengawal: jaga jarak, serang monster hostile di sekitar pemain (pedang atau panah), mundur dan makan saat HP rendah. Berhenti bila pemain hilang terlalu lama, durasi habis, atau dihentikan',
  paramsSchema: {
    type: 'object',
    properties: {
      player: { type: 'string', description: 'nama pemain yang diikuti (default: pemain terdekat selain bot)' },
      distance: { type: 'integer', minimum: 2, maximum: 16, default: 4, description: 'jarak ikut dari pemain' },
      radius: { type: 'integer', minimum: 4, maximum: 32, default: 10, description: 'ancaman dihitung bila berada dalam radius dari PEMAIN' },
      leash: { type: 'integer', minimum: 6, maximum: 48, description: 'batas jauh bot dari pemain saat bertarung (default radius+4)' },
      ranged: { type: 'boolean', default: true },
      targets: { type: 'string', default: 'hostile' },
      minHealth: { type: 'number', default: 8 },
      lostTimeoutMs: { type: 'integer', minimum: 5000, maximum: 600000, default: 60000, description: 'berhenti bila pemain tak terlihat selama ini' },
      durationMs: { type: 'integer', minimum: 2000, maximum: 1800000, description: 'lama mengawal (default: timeoutMs - 8 dtk)' },
      timeoutMs: { type: 'integer', minimum: 10000, maximum: 1800000, default: 300000, description: 'batas waktu task (isi >= durasi + 10 dtk untuk pengawalan lama)' }
    }
  },
  requires: ['move', 'combat.vanilla'],
  interruptible: true,
  estimatedMs: 300000
}

async function run (bot, p, ctx) {
  if (bot.game.gameMode === 'creative' || bot.game.gameMode === 'spectator') return { ok: false, code: 'PRECONDITION_FAILED', error: 'mode game ' + bot.game.gameMode + ': ganti ke survival' }
  let name = p.player
  if (!name) {
    const near = Object.values(bot.entities).filter(e => e !== bot.entity && e.type === 'player' && e.username && e.position).sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))[0]
    if (!near) return { ok: false, code: 'PRECONDITION_FAILED', error: 'tidak ada pemain di dekat bot; isi param player' }
    name = near.username
  }
  const ownerEntity = () => { const pl = bot.players && bot.players[name]; return pl && pl.entity && pl.entity.position ? pl.entity : null }
  if (!ownerEntity()) return { ok: false, code: 'TARGET_NOT_FOUND', error: 'pemain ' + name + ' tidak terlihat (offline atau di luar jarak render)' }
  const dist = p.distance || 4; const radius = p.radius || 10; const leash = Math.max(p.leash || radius + 4, radius)
  const lostMs = p.lostTimeoutMs || 60000
  bot.pathfinder.setMovements(ctx.movements('walk'))
  let following = null; let lostSince = 0; let lastPos = null
  const t0 = Date.now()
  const r = await C.guardLoop(bot, ctx, {
    center: () => { const o = ownerEntity(); if (o) { lostSince = 0; lastPos = o.position.clone(); return o.position } return null },
    radius, leash, minHealth: p.minHealth ?? 8, ranged: p.ranged !== false, names: C.toNames(p.targets), until: C.until(p),
    idle: async () => {
      const o = ownerEntity(); if (!o) return
      if (following !== o.id) { following = o.id; try { bot.pathfinder.setGoal(new goals.GoalFollow(o, dist), true) } catch (e) { /* abaikan */ } }
    },
    onLost: async () => {
      following = null
      if (!lostSince) { lostSince = Date.now(); if (lastPos) { try { bot.pathfinder.setGoal(new goals.GoalNear(lastPos.x, lastPos.y, lastPos.z, 2)) } catch (e) { /* abaikan */ } } }
      return Date.now() - lostSince > lostMs ? 'pemain ' + name + ' hilang > ' + lostMs + ' ms' : null
    }
  })
  const ms = Date.now() - t0
  bot.arcadia = bot.arcadia || {}
  const prev = bot.arcadia.companion && bot.arcadia.companion.owner === name ? bot.arcadia.companion : { owner: name, followedMs: 0, kills: 0, shots: 0, sessions: 0 }
  bot.arcadia.companion = { ...prev, followedMs: prev.followedMs + ms, kills: prev.kills + r.stats.kills, shots: prev.shots + r.stats.shots, sessions: prev.sessions + 1, last: Date.now() } // bahan affection persona nanti
  const data = { owner: name, distance: dist, radius, leash, ...r.stats, durationMs: ms, companion: bot.arcadia.companion }
  if (r.end) return { ok: false, code: 'TARGET_NOT_FOUND', error: r.end, data }
  if (ctx.signal.aborted) return { ok: false, code: 'ABORTED', error: 'dihentikan', data }
  return { ok: true, code: 'OK', data }
}

module.exports = { manifest, run, cli: ['player', 'distance'] }
