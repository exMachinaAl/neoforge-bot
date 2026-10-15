const { goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const U = require('./_util')
const C = require('./_combat')

const manifest = {
  name: 'guard.post',
  description: 'Jaga titik tetap: serang monster hostile yang masuk radius (pedang, atau panah bila ada busur+panah dan jarak >=5), kembali ke pos, mundur dan makan saat HP rendah. Berhenti saat durasi habis atau dihentikan',
  paramsSchema: {
    type: 'object',
    properties: {
      x: { type: 'number', description: 'pos penjagaan (default: posisi bot sekarang)' }, y: { type: 'number' }, z: { type: 'number' },
      radius: { type: 'integer', minimum: 4, maximum: 32, default: 12, description: 'ancaman dihitung bila berada dalam radius dari pos' },
      leash: { type: 'integer', minimum: 6, maximum: 48, description: 'batas jauh bot dari pos saat bertarung (default radius+6)' },
      ranged: { type: 'boolean', default: true, description: 'pakai busur bila ada' },
      targets: { type: 'string', default: 'hostile', description: '"hostile" atau daftar nama dipisah koma, mis. "zombie,skeleton" (enderman/piglin dilewati kecuali disebut)' },
      minHealth: { type: 'number', default: 8, description: 'di bawah ini bot tidak menyerang: kembali ke pos dan makan' },
      durationMs: { type: 'integer', minimum: 2000, maximum: 1800000, description: 'lama jaga (default: timeoutMs - 8 dtk)' },
      timeoutMs: { type: 'integer', minimum: 10000, maximum: 1800000, default: 300000, description: 'batas waktu task (isi >= durasi + 10 dtk untuk jaga lama)' }
    }
  },
  requires: ['move', 'combat.vanilla'],
  interruptible: true,
  estimatedMs: 300000
}

async function run (bot, p, ctx) {
  if (bot.game.gameMode === 'creative' || bot.game.gameMode === 'spectator') return { ok: false, code: 'PRECONDITION_FAILED', error: 'mode game ' + bot.game.gameMode + ': ganti ke survival' }
  const post = [p.x, p.y, p.z].every(Number.isFinite) ? new Vec3(p.x, p.y, p.z) : bot.entity.position.clone()
  const radius = p.radius || 12; const leash = Math.max(p.leash || radius + 6, radius)
  bot.pathfinder.setMovements(ctx.movements('walk'))
  const t0 = Date.now()
  const r = await C.guardLoop(bot, ctx, {
    center: () => post, radius, leash, minHealth: p.minHealth ?? 8, ranged: p.ranged !== false, names: C.toNames(p.targets), until: C.until(p),
    idle: async (c, urgent) => { if (bot.entity.position.distanceTo(c) > 2.5) { try { await U.gotoTimed(bot, new goals.GoalNear(c.x, c.y, c.z, 1), urgent ? 6000 : 8000, ctx.signal) } catch (e) { /* abaikan */ } } },
    onLost: async () => null
  })
  const data = { post: { x: post.x, y: post.y, z: post.z }, radius, leash, ...r.stats, durationMs: Date.now() - t0 }
  if (ctx.signal.aborted) return { ok: false, code: 'ABORTED', error: 'dihentikan', data }
  return { ok: true, code: 'OK', data }
}

module.exports = { manifest, run, cli: ['radius'] }
