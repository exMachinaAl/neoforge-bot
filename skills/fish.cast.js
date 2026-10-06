const { goals } = require('mineflayer-pathfinder')
const U = require('./_util')

const manifest = {
  name: 'fish.cast',
  description: 'Memancing: cari air terdekat, pegang joran, lempar dan tarik sampai count tangkapan (diukur dari penambahan inventory)',
  paramsSchema: {
    type: 'object',
    properties: {
      count: { type: 'integer', minimum: 1, maximum: 64, default: 3 },
      maxDistance: { type: 'integer', minimum: 4, maximum: 48, default: 24 },
      biteTimeoutMs: { type: 'integer', minimum: 10000, default: 60000 },
      guard: { type: 'boolean', default: true },
      minHealth: { type: 'number', default: 8 }
    }
  },
  requires: ['move', 'block.read', 'inventory.protocol'],
  interruptible: true,
  estimatedMs: 120000
}

async function run (bot, p, ctx) {
  const md = ctx.mcData
  const rodInfo = md.itemsByName.fishing_rod
  const rod = () => bot.inventory.items().find(i => i.type === rodInfo.id)
  if (!rod()) return { ok: false, code: 'PRECONDITION_FAILED', error: 'tidak ada fishing_rod di inventory (mis. /give BotAlpha minecraft:fishing_rod)' }
  if (typeof bot.fish !== 'function') return { ok: false, code: 'PRECONDITION_FAILED', error: 'bot.fish tidak tersedia' }
  const count = Math.min(64, Math.max(1, parseInt(p.count ?? 3, 10)))
  const maxDistance = Math.min(48, Math.max(4, parseInt(p.maxDistance ?? 24, 10)))
  const biteMs = Math.max(10000, Number(p.biteTimeoutMs) || 60000)
  const waterId = md.blocksByName.water.id
  const before = U.invTotals(bot)
  const stat = { casts: 0, catches: 0, misses: 0, timeouts: 0 }
  const res = (ok, code, error) => ({ ok, code, error, data: Object.assign({ caught: U.diffTotals(before, U.invTotals(bot)) }, stat, { fights: (ctx.stats && ctx.stats.fights) || 0 }) })

  // permukaan air: blok air dengan udara di atasnya
  const surface = bot.findBlock({ matching: waterId, maxDistance, useExtraInfo: b => { const up = bot.blockAt(b.position.offset(0, 1, 0)); return up && up.name === 'air' } })
  if (!surface) return res(false, 'TARGET_NOT_FOUND', 'tidak ada permukaan air dalam ' + maxDistance + ' blok')
  bot.pathfinder.setMovements(ctx.movements('walk'))
  try { await U.gotoTimed(bot, new goals.GoalNear(surface.position.x, surface.position.y, surface.position.z, 3), 60000, ctx.signal) } catch (e) {
    if (ctx.signal.aborted) return res(false, 'ABORTED')
    return res(false, e.name === 'NoPath' ? 'NO_PATH' : e.name === 'Timeout' ? 'TIMEOUT' : 'UNKNOWN', e.message)
  }

  while (stat.catches < count) {
    if (ctx.signal.aborted) return res(false, 'ABORTED')
    if (p.guard !== false) { const g = await U.guard(bot, ctx, { minHealth: p.minHealth }); if (g) return res(false, g.code, g.error) }
    const r = rod()
    if (!r) return res(false, 'PRECONDITION_FAILED', 'joran hilang/rusak')
    try { if (!bot.heldItem || bot.heldItem.type !== r.type) await bot.equip(r, 'hand') } catch (e) { return res(false, 'UNKNOWN', 'gagal memegang joran: ' + e.message) }
    await bot.lookAt(surface.position.offset(0.5, 0.9, 0.5), true)
    const snap = U.invTotals(bot)
    stat.casts++
    let outcome = 'bite'
    const fishing = bot.fish().catch(e => { outcome = 'cancel:' + e.message })
    let threat = false
    const watch = setInterval(() => { if (U.hostiles(bot, 6).length || (bot.health !== undefined && bot.health < (p.minHealth ?? 8))) threat = true }, 500)
    const abortP = new Promise(r2 => ctx.signal.addEventListener('abort', () => r2('abort'), { once: true }))
    const tick = new Promise(r2 => { const t0 = Date.now(); const iv = setInterval(() => { if (threat) { clearInterval(iv); r2('threat') } else if (Date.now() - t0 > biteMs) { clearInterval(iv); r2('timeout') } }, 300); fishing.then(() => { clearInterval(iv); r2('done') }) })
    const w = await Promise.race([tick, abortP])
    clearInterval(watch)
    if (w !== 'done') { try { bot.activateItem() } catch (e) {} ; await U.sleep(500) } // tarik tali
    if (w === 'abort') return res(false, 'ABORTED')
    if (w === 'timeout') { stat.timeouts++; if (stat.timeouts >= 3) return res(false, 'TIMEOUT', 'tiga kali tidak ada gigitan dalam ' + biteMs + ' ms (air tidak cocok/posisi buruk?)'); continue }
    if (w === 'threat') continue
    if (outcome.startsWith('cancel')) { stat.misses++; continue }
    await U.sleep(1200) // beri waktu item masuk
    const d = U.diffTotals(snap, U.invTotals(bot))
    if (Object.keys(d).length) stat.catches++; else stat.misses++
    if (stat.misses >= 5) return res(false, 'TARGET_NOT_FOUND', 'lima kali gigitan tanpa item masuk (inventory penuh / item tidak terbaca?)')
  }
  return res(true, 'OK')
}

module.exports = { manifest, run, cli: ['count'] }
