const { goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const U = require('./_util')

const manifest = {
  name: 'nav.goto',
  description: 'Berjalan ke x,z (y opsional) sampai dalam jarak range blok; tanpa merusak/menaruh blok. Tanpa y: hanya jarak horizontal dihitung',
  paramsSchema: { type: 'object', required: ['x', 'z'], properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' }, range: { type: 'number', minimum: 1, default: 2 } } },
  requires: ['move', 'block.read'],
  interruptible: true,
  estimatedMs: 30000
}

async function run (bot, p, ctx) {
  for (const k of ['x', 'z']) if (!Number.isFinite(p[k])) return { ok: false, code: 'PRECONDITION_FAILED', error: 'param ' + k + ' wajib angka' }
  const hasY = Number.isFinite(p.y)
  const range = Math.max(1, Number(p.range ?? 2))
  if (ctx.signal.aborted) return { ok: false, code: 'ABORTED' }
  bot.pathfinder.setMovements(ctx.movements('walk'))
  const pos = () => ({ x: +bot.entity.position.x.toFixed(2), y: +bot.entity.position.y.toFixed(2), z: +bot.entity.position.z.toFixed(2) })
  const dist = () => hasY ? bot.entity.position.distanceTo(new Vec3(p.x, p.y, p.z)) : Math.hypot(bot.entity.position.x - p.x, bot.entity.position.z - p.z)
  const goal = hasY ? new goals.GoalNear(p.x, p.y, p.z, range) : new goals.GoalNearXZ(p.x, p.z, range)
  let err = null
  try { await U.gotoTimed(bot, goal, Number(p.thinkMs) || 120000, ctx.signal) } catch (e) { err = e }
  if (ctx.signal.aborted) return { ok: false, code: 'ABORTED', data: { pos: pos() } }
  const d = dist()
  const dxz = Math.hypot(bot.entity.position.x - p.x, bot.entity.position.z - p.z)
  const data = { pos: pos(), distance: +d.toFixed(2), distanceXZ: +dxz.toFixed(2), mode: hasY ? 'xyz' : 'xz' }
  // pathfinder melapor Timeout/NoPath bila y target tidak terjangkau (mis. di dalam tanah) walau posisi horizontal sudah tepat.
  // Default dianggap sampai; pakai strictY:true untuk menuntut y juga.
  if (d <= range + 1.5) return { ok: true, code: 'OK', data: err ? Object.assign(data, { note: 'dekat target; pathfinder: ' + err.name }) : data }
  if (err && !p.strictY && dxz <= range + 1.5) return { ok: true, code: 'OK', data: Object.assign(data, { note: 'XZ tercapai, y tidak terjangkau (selisih y ' + (bot.entity.position.y - p.y).toFixed(1) + '); pathfinder: ' + err.name }) }
  if (!err) return { ok: false, code: 'UNKNOWN', data, error: 'pathfinder melapor sampai, tapi jarak ke target ' + d.toFixed(2) + ' blok (posisi dikoreksi server?)' }
  const code = err.name === 'NoPath' ? 'NO_PATH' : err.name === 'Timeout' ? 'TIMEOUT' : (err.name === 'PathStopped' || err.name === 'GoalChanged') ? 'ABORTED' : 'UNKNOWN'
  return { ok: false, code, error: err.message, data }
}

module.exports = { manifest, run, cli: ['x', 'y', 'z'] }
