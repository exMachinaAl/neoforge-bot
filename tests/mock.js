const EE = require('events'); const { Vec3 } = require('vec3')
const mcData = require('minecraft-data')('1.21.1'); const registry = require('prismarine-registry')('1.21.1')
const Block = require('prismarine-block')(registry)
const bi = n => mcData.blocksByName[n]; const it = n => mcData.itemsByName[n]
const mkBlock = (name, x, y, z, off = 0) => { const b = Block.fromStateId(bi(name).minStateId + off, 0); b.position = new Vec3(x, y, z); return b }
function mk (o = {}) {
  const bot = new EE()
  bot.version = '1.21.1'; bot.registry = registry
  bot.game = { gameMode: o.mode || 'survival' }; bot.health = o.health ?? 20; bot.food = o.food ?? 20
  bot.entity = { position: new Vec3(0.5, 64, 0.5), effects: {}, onGround: true, isInWater: false }
  bot.entities = {}; bot.world = {}; bot.heldItem = null
  const inv = []; bot.inventory = { items: () => inv.filter(i => i.count > 0), count: (id) => inv.filter(i => i.type === id).reduce((a, i) => a + i.count, 0) }
  bot._give = (name, n) => { const e = inv.find(i => i.type === it(name).id); if (e) e.count += n; else inv.push({ type: it(name).id, name, count: n }) }
  for (const [n, c] of Object.entries(o.inv || {})) bot._give(n, c)
  const blocks = o.blocks || []
  bot._blocks = blocks
  bot.blockAt = p => blocks.find(b => b.position.equals(p.floored ? p.floored() : p)) || null
  bot.findBlock = q => { const ids = [].concat(q.matching); return blocks.filter(b => ids.includes(b.type) && b.position.distanceTo(bot.entity.position) <= q.maxDistance && (!q.useExtraInfo || q.useExtraInfo(b))).sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))[0] || null }
  bot.findBlocks = q => { const ids = [].concat(q.matching); return blocks.filter(b => ids.includes(b.type) && b.position.distanceTo(bot.entity.position) <= q.maxDistance).map(b => b.position) }
  bot.setControlState = () => {}; bot.loadPlugin = () => {}
  bot.equipped = []; bot.equip = async i => { bot.equipped.push(i.name); bot.heldItem = i }
  bot.lookAt = async () => {}; bot.consume = async () => { bot.food = 20 }
  bot.dug = []
  bot.dig = async b => { if (o.digFail) throw new Error('dig ditolak'); bot.dug.push(b.name); const i = blocks.indexOf(b); blocks.splice(i, 1); const d = bi(b.name).drops; if (d && d.length && !o.noDrop) bot._pending = { id: d[0], at: b.position.clone() } }
  bot._place = []; bot.placeBlock = async (ref, face) => { bot._place.push(ref.name + '@' + ref.position); }
  let moving = null; bot._goals = []
  bot._mvs = []; let nm = o.noMoveFirst || 0
  bot.pathfinder = { setMovements: m => { bot._mv = m; bot._mvs.push(m.canDig) }, stop: () => { if (moving) moving(Object.assign(new Error('stopped'), { name: 'PathStopped' })) }, setGoal: g => { bot._goal = g; if (g && g.entity) bot.entity.position = g.entity.position.offset(-2, 0, 0) },
    goto: goal => new Promise((res, rej) => { moving = rej; bot._goals.push(goal.constructor.name); const t = goal.pos || (goal.x !== undefined ? new Vec3(goal.x, goal.y ?? 64, goal.z) : bot.entity.position)
      setTimeout(() => { moving = null; if (nm > 0) { nm--; return res() }; if (o.gotoErr) { if (o.gotoMove) bot.entity.position = new Vec3(o.gotoMove.x, 64, o.gotoMove.z); return rej(Object.assign(new Error('x'), { name: o.gotoErr })) }
        bot.entity.position = t.offset(0.5, 0, 0.5); if (bot._pending && bot._pending.at.distanceTo(t) <= 2) { bot._give(mcData.items[bot._pending.id].name, 1); bot._pending = null }; res() }, o.delay || 10) }) }
  bot.attacks = 0; bot.attack = e => { bot.attacks++; if (bot.attacks >= (o.killAfter || 2)) setTimeout(() => { delete bot.entities[e.id]; bot.emit('entityDead', e) }, 5) }
  bot.openContainer = async () => ({ deposit: async (id, m, n) => { bot._deposit = (bot._deposit || 0) + n; const e = inv.find(i => i.type === id); e.count -= n }, close () {} })
  bot.activateItem = () => { bot._act = (bot._act || 0) + 1 }
  bot.fish = () => new Promise((res, rej) => { if (o.noBite) return; setTimeout(() => { bot._give('cod', 1); res() }, 30) })
  return bot
}

module.exports = { mk, mkBlock, mcData, bi, it }
