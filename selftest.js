// selftest.js - uji fungsi vanilla bot di server bermod. Pakai di bot.js: !test | !test walk dig | !test list
const { Vec3 } = require('vec3')
const mcData = require('minecraft-data')('1.21.1')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const AIR = n => !n || n === 'air' || n === 'cave_air' || n === 'void_air'
const SKIP = d => ({ r: 'SKIP', d })
const PASS = d => ({ r: 'PASS', d })
const FAIL = d => ({ r: 'FAIL', d })

module.exports = function (bot, args) {
  const f = () => bot.entity.position.floored()
  const tests = {
    async state () {
      const p = bot.entity.position
      const zero = p.x === 0 && p.y === 0 && p.z === 0
      const d = `pos ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} hp ${bot.health} food ${bot.food} mode ${bot.game.gameMode} dim ${bot.game.dimension} onGround ${bot.entity.onGround}`
      return zero ? FAIL(d + ' (posisi 0,0,0: parser mati?)') : PASS(d)
    },
    async look () {
      const y0 = bot.entity.yaw
      await bot.look(y0 + 1, 0, true)
      await sleep(300)
      const dy = Math.abs(bot.entity.yaw - y0)
      return dy > 0.5 ? PASS('yaw berubah ' + dy.toFixed(2)) : FAIL('yaw tidak berubah')
    },
    async walk () {
      const a = bot.entity.position.clone()
      bot.setControlState('forward', true)
      await sleep(1500)
      bot.setControlState('forward', false)
      const b = bot.entity.position
      const dist = Math.hypot(b.x - a.x, b.z - a.z)
      return dist > 0.5 ? PASS('maju ' + dist.toFixed(2) + ' blok') : FAIL('maju ' + dist.toFixed(2) + ' blok (terhalang/physics macet/disetel server?)')
    },
    async jump () {
      const y0 = bot.entity.position.y
      let max = y0
      bot.setControlState('jump', true)
      for (let i = 0; i < 12; i++) { await sleep(50); max = Math.max(max, bot.entity.position.y) }
      bot.setControlState('jump', false)
      await sleep(600)
      return max - y0 > 0.4 ? PASS('naik ' + (max - y0).toFixed(2)) : FAIL('naik ' + (max - y0).toFixed(2) + ' (mungkin terhalang atap)')
    },
    async blocks () {
      const c = f(); let nul = 0; const names = {}
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
        const b = bot.blockAt(c.offset(dx, dy, dz))
        if (!b) { nul++; continue }
        names[b.name] = (names[b.name] || 0) + 1
      }
      const top = Object.entries(names).sort((x, y) => y[1] - x[1]).slice(0, 8).map(e => e[0] + ':' + e[1]).join(' ')
      const under = bot.blockAt(c.offset(0, -1, 0))
      const d = `null ${nul}/125; ${top}; bawah kaki: ${under ? under.name : 'NULL'}`
      return under ? PASS(d) : FAIL(d)
    },
    async inventory () {
      const it = bot.inventory.items()
      const d = `${it.length} item: ` + it.slice(0, 10).map(i => i.name + 'x' + i.count).join(', ') + ' | tangan: ' + (bot.heldItem ? bot.heldItem.name : '-') + ' | akurasi vs server BELUM diverifikasi (bandingkan /data get entity BotAlpha Inventory)'
      return PASS(d)
    },
    async dig () {
      const ids = ['dirt', 'grass_block', 'sand', 'gravel', 'stone', 'cobblestone', 'netherrack'].filter(n => mcData.blocksByName[n]).map(n => mcData.blocksByName[n].id)
      const c = f()
      const b = bot.findBlock({ matching: ids, maxDistance: 4, useExtraInfo: x => !(x.position.x === c.x && x.position.z === c.z && x.position.y < c.y) && bot.canDigBlock(x) })
      if (!b) return SKIP('tidak ada blok dig-able dalam 4 blok (selain yang di bawah kaki)')
      const t0 = Date.now()
      await bot.dig(b, true)
      await sleep(400)
      const now = bot.blockAt(b.position)
      const d = `${b.name} di ${b.position} ${Date.now() - t0}ms, sekarang ${now ? now.name : 'NULL'}`
      return now && AIR(now.name) ? PASS(d) : FAIL(d + ' (server menolak? area protected / mode adventure?)')
    },
    async place () {
      const item = bot.inventory.items().find(i => mcData.blocksByName[i.name])
      if (!item) return SKIP('tidak ada item blok di inventory (kosong, atau item gagal diparse; coba /give BotAlpha dirt 8)')
      const c = f()
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ref = bot.blockAt(c.offset(dx, -1, dz)); const tgt = bot.blockAt(c.offset(dx, 0, dz))
        if (!ref || !tgt || ref.boundingBox !== 'block' || !AIR(tgt.name)) continue
        try { await bot.equip(item, 'hand') } catch (e) { return FAIL('equip gagal: ' + e.message + ' (indikasi masalah serialisasi ItemStack)') }
        await bot.lookAt(ref.position.offset(0.5, 1, 0.5), true)
        await bot.placeBlock(ref, new Vec3(0, 1, 0))
        await sleep(400)
        const now = bot.blockAt(tgt.position)
        const d = `${item.name} di ${tgt.position}, sekarang ${now ? now.name : 'NULL'}`
        return now && !AIR(now.name) ? PASS(d) : FAIL(d)
      }
      return SKIP('tidak ada sel kosong berpijak di sekitar kaki')
    },
    async attack () {
      const e = bot.nearestEntity(x => x !== bot.entity && ['mob', 'hostile', 'animal', 'passive'].includes(x.type))
      if (!e) return SKIP('tidak ada mob dekat (coba /summon minecraft:cow ~ ~ ~2)')
      const dist = bot.entity.position.distanceTo(e.position)
      if (dist > 4) return SKIP(`${e.name} terlalu jauh (${dist.toFixed(1)} m)`)
      let hurt = false
      const on = x => { if (x.id === e.id) hurt = true }
      bot.on('entityHurt', on)
      for (let i = 0; i < 4 && !hurt; i++) { await bot.lookAt(e.position.offset(0, e.height / 2, 0), true); bot.attack(e); await sleep(700) }
      bot.removeListener('entityHurt', on)
      return hurt ? PASS(`${e.name} terkena (entityHurt)`) : FAIL(`${e.name}: tidak ada entityHurt (meleset, Epic Fight memblok damage vanilla, atau event hilang)`)
    }
  }
  const order = ['state', 'look', 'walk', 'jump', 'blocks', 'inventory', 'dig', 'place', 'attack']
  const want = args && args.trim() ? args.trim().split(/\s+/) : order
  if (want[0] === 'list') return console.log('TEST tersedia: ' + order.join(' '))
  return (async () => {
    const out = {}
    for (const n of want) {
      if (!tests[n]) { console.log('TEST ' + n + ': tidak dikenal'); continue }
      let res
      try { res = await Promise.race([tests[n](), sleep(25000).then(() => FAIL('timeout 25 dtk'))]) } catch (e) { res = FAIL('exception: ' + e.message) }
      out[n] = res.r
      console.log(`TEST ${n}: ${res.r} - ${res.d}`)
    }
    console.log('SELFTEST_JSON ' + JSON.stringify(out))
  })()
}
