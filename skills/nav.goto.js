const { goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')

const manifest = {
  name: 'nav.goto',
  description: 'Berjalan ke koordinat x,y,z sampai dalam jarak range blok (tanpa merusak/menaruh blok)',
  paramsSchema: { type: 'object', required: ['x', 'y', 'z'], properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' }, range: { type: 'number', minimum: 1, default: 2 } } },
  requires: ['move', 'block.read'],
  interruptible: true,
  estimatedMs: 30000
}

async function run (bot, p, ctx) {
  for (const k of ['x', 'y', 'z']) if (!Number.isFinite(p[k])) return { ok: false, code: 'PRECONDITION_FAILED', error: 'param ' + k + ' wajib angka' }
  const range = Math.max(1, Number(p.range ?? 2))
  if (ctx.signal.aborted) return { ok: false, code: 'ABORTED' }
  bot.pathfinder.setMovements(ctx.movements())
  const onAbort = () => bot.pathfinder.stop()
  ctx.signal.addEventListener('abort', onAbort, { once: true })
  const pos = () => ({ x: +bot.entity.position.x.toFixed(2), y: +bot.entity.position.y.toFixed(2), z: +bot.entity.position.z.toFixed(2) })
  try {
    await bot.pathfinder.goto(new goals.GoalNear(p.x, p.y, p.z, range))
  } catch (e) {
    if (ctx.signal.aborted) return { ok: false, code: 'ABORTED', data: { pos: pos() } }
    const code = e.name === 'NoPath' ? 'NO_PATH' : e.name === 'Timeout' ? 'TIMEOUT' : (e.name === 'PathStopped' || e.name === 'GoalChanged') ? 'ABORTED' : 'UNKNOWN'
    return { ok: false, code, error: e.message, data: { pos: pos() } }
  } finally { ctx.signal.removeEventListener('abort', onAbort) }
  const d = bot.entity.position.distanceTo(new Vec3(p.x, p.y, p.z))
  const data = { pos: pos(), distance: +d.toFixed(2) }
  return d <= range + 1.5 ? { ok: true, code: 'OK', data } : { ok: false, code: 'UNKNOWN', data, error: 'pathfinder melapor sampai, tapi jarak ke target ' + d.toFixed(2) + ' blok (posisi dikoreksi server?)' }
}

module.exports = { manifest, run, cli: ['x', 'y', 'z'] }
