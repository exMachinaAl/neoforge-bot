// skills/_combat.js - pertarungan untuk guard.post / guard.follow: pilih ancaman, melee, memanah (lintasan panah vanilla), mundur saat HP rendah.
const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const U = require('./_util')

const V0 = 3.0; const G = 0.05; const DRAG = 0.99 // panah penuh: 3 blok/tick, gravitasi 0.05, hambatan 0.99 per tick (vanilla)
const DRAW_MS = 1050 // tarik busur penuh 20 tick
const NEUTRAL = new Set(['enderman', 'zombified_piglin', 'piglin', 'piglin_brute', 'iron_golem'])

// tinggi panah saat menempuh jarak mendatar x dengan sudut theta; null bila tak sampai
function flight (theta, x) {
  let px = 0; let py = 0; let vx = V0 * Math.cos(theta); let vy = V0 * Math.sin(theta)
  for (let t = 1; t <= 200; t++) {
    const nx = px + vx; const ny = py + vy
    if (nx >= x) { const f = (x - px) / (nx - px); return { y: py + (ny - py) * f, ticks: t - 1 + f } }
    px = nx; py = ny; vx *= DRAG; vy = vy * DRAG - G
  }
  return null
}
// sudut luncur (rad, + = ke atas) agar panah melewati titik (x mendatar, dy vertikal dari mata); null bila mustahil
function launchAngle (x, dy) {
  if (x < 0.5) return { theta: Math.atan2(dy, 0.5), ticks: 1 }
  let lo = -0.7; let hi = 0.9
  const a = flight(lo, x); const b = flight(hi, x)
  if (!a || !b || a.y > dy || b.y < dy) return null
  for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; const f = flight(m, x); if (!f) return null; if (f.y < dy) lo = m; else hi = m }
  const th = (lo + hi) / 2; const f = flight(th, x)
  return f ? { theta: th, ticks: f.ticks } : null
}
// titik yang harus dilihat bot: mengompensasi gravitasi dan gerak target (vel = blok/tick)
function aimPoint (bot, target, vel) {
  vel = vel || new Vec3(0, 0, 0)
  const eye = bot.entity.position.offset(0, 1.62, 0)
  const base = target.position.offset(0, (target.height || 1.8) * 0.6, 0)
  let pt = base; let sol = null
  for (let i = 0; i < 3; i++) {
    const x = Math.hypot(pt.x - eye.x, pt.z - eye.z)
    sol = launchAngle(x, pt.y - eye.y)
    if (!sol) return base
    pt = base.offset(vel.x * sol.ticks, 0, vel.z * sol.ticks)
  }
  const dx = pt.x - eye.x; const dz = pt.z - eye.z; const x = Math.hypot(dx, dz)
  return eye.offset(dx, Math.tan(sol.theta) * x, dz)
}

const hasBow = bot => !!bot.inventory.items().find(i => i.name === 'bow')
const arrows = bot => bot.inventory.items().filter(i => /(^|_)arrow$/.test(i.name)).reduce((a, i) => a + i.count, 0)
function los (bot, t) {
  try {
    if (!bot.world || typeof bot.world.raycast !== 'function') return true
    const eye = bot.entity.position.offset(0, 1.62, 0); const to = t.position.offset(0, (t.height || 1.8) * 0.6, 0)
    const d = to.minus(eye); const dist = d.norm()
    const hit = bot.world.raycast(eye, d.scaled(1 / dist), dist)
    return !hit || !hit.position || hit.position.distanceTo(eye) >= dist - 0.6
  } catch (e) { return true }
}
function threats (bot, center, o) {
  const now = Date.now()
  return Object.values(bot.entities).filter(e => e !== bot.entity && e.position && (o.names ? o.names.has(e.name) : (e.type === 'hostile' && !NEUTRAL.has(e.name))) && !(o.skip.get(e.id) > now) && e.position.distanceTo(center) <= o.radius)
    .sort((a, b) => (a.position.distanceTo(bot.entity.position) - (o.ranged && a.name === 'creeper' ? 4 : 0)) - (b.position.distanceTo(bot.entity.position) - (o.ranged && b.name === 'creeper' ? 4 : 0)))
}

// tarik busur sambil membidik terus, lalu lepas. true bila terlepas dengan target masih ada
async function shoot (bot, ctx, target, velOf) {
  const bow = bot.inventory.items().find(i => i.name === 'bow')
  if (!bow) return false
  if (!bot.heldItem || bot.heldItem.type !== bow.type) await bot.equip(bow, 'hand')
  const t0 = Date.now(); let ok = true
  bot.activateItem()
  try {
    while (Date.now() - t0 < DRAW_MS) {
      if (ctx.signal.aborted || !bot.entities[target.id]) { ok = false; break }
      await bot.lookAt(aimPoint(bot, target, velOf(target)), true).catch(() => {})
      await U.sleep(100)
    }
  } finally { if (bot.deactivateItem) bot.deactivateItem() }
  await U.sleep(250)
  return ok
}

// cfg: { center(), idle(c, urgent), onLost(), radius, leash, minHealth, ranged, names, until }
async function guardLoop (bot, ctx, cfg) {
  const stats = { kills: 0, shots: 0, hits: 0, retreats: 0, ate: 0 }
  const skip = new Map(); const seen = new Set(); const last = new Map()
  const onDead = e => { if (e && seen.delete(e.id)) stats.kills++ }
  const velOf = e => {
    const now = Date.now(); const l = last.get(e.id); last.set(e.id, { p: e.position.clone(), t: now })
    if (!l || now - l.t < 40) return new Vec3(0, 0, 0)
    const v = e.position.minus(l.p).scaled(50 / (now - l.t)); const n = v.norm()
    return n > 0.6 ? v.scaled(0.6 / n) : v
  }
  bot.on('entityDead', onDead)
  let low = false
  try {
    while (!ctx.signal.aborted && Date.now() < cfg.until) {
      const c = cfg.center()
      if (!c) { const r = await cfg.onLost(); if (r) return { stats, end: r }; await U.sleep(300); continue }
      if (bot.health !== undefined && bot.health < cfg.minHealth) {
        if (!low) { low = true; stats.retreats++ }
        await cfg.idle(c, true)
        if (await U.autoEat(bot, ctx.mcData)) stats.ate++
        await U.sleep(500); continue
      }
      low = false
      if (await U.autoEat(bot, ctx.mcData)) stats.ate++
      const t = threats(bot, c, { radius: cfg.radius, names: cfg.names, skip, ranged: cfg.ranged })[0]
      if (!t) { await cfg.idle(c, false); await U.sleep(250); continue }
      if (bot.entity.position.distanceTo(c) > cfg.leash) { skip.set(t.id, Date.now() + 5000); await cfg.idle(c, true); continue }
      seen.add(t.id)
      const d = bot.entity.position.distanceTo(t.position)
      if (cfg.ranged && hasBow(bot) && arrows(bot) > 0 && d >= 5 && d <= 28 && los(bot, t)) {
        try { bot.pathfinder.setGoal(null) } catch (e) { /* abaikan */ }
        if (await shoot(bot, ctx, t, velOf)) stats.shots++
        continue
      }
      await U.equipWeapon(bot)
      if (d <= 3.3) { await bot.lookAt(t.position.offset(0, (t.height || 1) / 2, 0), true).catch(() => {}); bot.attack(t); stats.hits++; await U.sleep(600) } else {
        try { bot.pathfinder.setGoal(new goals.GoalFollow(t, 2), true) } catch (e) { /* abaikan */ }
        await U.sleep(200)
      }
    }
  } finally { bot.removeListener('entityDead', onDead); try { bot.pathfinder.setGoal(null) } catch (e) { /* abaikan */ } }
  return { stats }
}

const toNames = v => { const a = String(v || '').split(/[\s,]+/).filter(Boolean); return !a.length || a.includes('hostile') ? null : new Set(a) }
const until = p => Date.now() + Math.min(1800000, Math.max(2000, Number(p.durationMs) || Math.max(10000, (Number(p.timeoutMs) || 300000) - 8000)))

module.exports = { guardLoop, aimPoint, launchAngle, flight, threats, shoot, hasBow, arrows, los, toNames, until, NEUTRAL, DRAW_MS }
