const { Vec3 } = require('vec3')
const { mk, mkBlock, mcData, bi, it } = require('./mock')
const { createRunner } = require('../skills')
const U = require('../skills/_util')
let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m) }
;(async () => {
  let b, r, o
  // movements
  b = mk(); const { Movements } = require('mineflayer-pathfinder')
  const mvM = U.movementsFor(b, Movements, mcData, 'mine', { dig: 'natural', keepIds: [bi('coal_ore').id] }); const mvW = U.movementsFor(b, Movements, mcData, 'walk')
  ok(mvM.canDig && !mvW.canDig, 'movements: mine canDig=true, walk=false')
  ok(!mvM.blocksCantBreak.has(bi('stone').id) && !mvM.blocksCantBreak.has(bi('dirt').id) && !mvM.blocksCantBreak.has(bi('coal_ore').id), 'movements natural: stone/dirt/ore boleh digali')
  ok(mvM.blocksCantBreak.has(bi('oak_planks').id) && mvM.blocksCantBreak.has(bi('chest').id) && mvM.blocksCantBreak.has(bi('glass').id), 'movements natural: planks/chest/glass TIDAK boleh digali')
  // bestTool
  b = mk({ inv: { wooden_pickaxe: 1, iron_pickaxe: 1, iron_axe: 1, stick: 3 } }); let st = mkBlock('stone', 3, 64, 3)
  let bt = U.bestTool(b, st, mcData); ok(bt.canHarvest && bt.tool.name === 'iron_pickaxe', 'bestTool stone -> ' + (bt.tool && bt.tool.name))
  b = mk({ inv: { iron_axe: 1, stick: 3 } }); bt = U.bestTool(b, st, mcData); ok(!bt.canHarvest && bt.needs.includes('wooden_pickaxe'), 'bestTool stone tanpa pickaxe -> canHarvest=false')
  b = mk({ inv: { iron_axe: 1 } }); bt = U.bestTool(b, mkBlock('oak_log', 3, 64, 3), mcData); ok(bt.tool && bt.tool.name === 'iron_axe', 'bestTool oak_log -> kapak')
  b = mk({ inv: { iron_axe: 1 } }); bt = U.bestTool(b, mkBlock('dirt', 3, 64, 3), mcData); ok(bt.canHarvest, 'bestTool dirt tanpa sekop -> tetap boleh (tangan)')
  // nav
  b = mk({ gotoErr: 'Timeout', gotoMove: { x: 30.5, z: 20.5 } }); r = createRunner(b); o = await r.run('nav.goto', { x: 30, z: 20, y: 70 }); ok(o.ok && /y tidak terjangkau/.test(o.data.note || ''), 'nav: XZ tercapai, y tidak terjangkau -> ok + note (' + (o.data && o.data.note) + ')')
  b = mk({ gotoErr: 'Timeout', gotoMove: { x: 30.5, z: 20.5 } }); r = createRunner(b); o = await r.run('nav.goto', { x: 30, z: 20, y: 70, strictY: true }); ok(!o.ok && o.code === 'TIMEOUT', 'nav: strictY -> TIMEOUT')
  b = mk(); r = createRunner(b); o = await r.run('nav.goto', { x: 10, z: 5 }); ok(o.ok && o.data.mode === 'xz' && b._goals[0] === 'GoalNearXZ', 'nav: tanpa y -> GoalNearXZ')
  b = mk({ gotoErr: 'NoPath' }); r = createRunner(b); o = await r.run('nav.goto', { x: 50, z: 50 }); ok(!o.ok && o.code === 'NO_PATH', 'nav: jauh + NoPath -> NO_PATH')
  // mine
  b = mk({ mode: 'creative', blocks: [mkBlock('stone', 4, 64, 2)] }); r = createRunner(b); o = await r.run('mine.collect', { block: 'stone', count: 1 }); ok(o.code === 'PRECONDITION_FAILED' && /creative/.test(o.error), 'mine: creative ditolak -> ' + o.error)
  b = mk({ blocks: [mkBlock('stone', 4, 64, 2)] }); r = createRunner(b); o = await r.run('mine.collect', { block: 'stone', count: 1 }); ok(o.code === 'PRECONDITION_FAILED' && /wooden_pickaxe/.test(o.error), 'mine: stone tanpa pickaxe ditolak -> ' + o.error)
  b = mk({ inv: { iron_pickaxe: 1 }, blocks: [mkBlock('stone', 4, 64, 2), mkBlock('stone', 6, 64, 3)] }); r = createRunner(b); o = await r.run('mine.collect', { block: 'stone', count: 2 }); ok(o.ok && o.data.collected === 2 && o.data.items[0] === 'cobblestone' && b.equipped.includes('iron_pickaxe'), 'mine: stone+pickaxe -> cobblestone x2, alat dipilih (' + JSON.stringify(o.data) + ')')
  ok(b._mv && b._mv.canDig, 'mine: movements saat menambang canDig=true')
  b = mk({ inv: { iron_pickaxe: 1, cobblestone: 10 }, blocks: [mkBlock('stone', 4, 64, 2), mkBlock('stone', 6, 64, 3), mkBlock('chest', 2, 70, 2)] }); r = createRunner(b); o = await r.run('mine.collect', { block: 'stone', count: 2, chest: { x: 2, y: 70, z: 2 } }); ok(o.ok && o.data.deposited === 2 && b._deposit === 2, 'mine: simpan ke chest hanya hasil baru (2 dari 12) -> ' + b._deposit)
  b = mk({ inv: { iron_pickaxe: 1 }, digFail: true, blocks: [mkBlock('stone', 4, 64, 2), mkBlock('stone', 5, 64, 2), mkBlock('stone', 6, 64, 2), mkBlock('stone', 7, 64, 2), mkBlock('stone', 8, 64, 2), mkBlock('stone', 9, 64, 2)] }); r = createRunner(b); o = await r.run('mine.collect', { block: 'stone', count: 2 }); ok(!o.ok && o.data.reasons.length >= 3 && /gali/.test(o.data.reasons[0]), 'mine: dig gagal -> alasan tercatat: ' + o.data.reasons[0])
  b = mk({ inv: { iron_pickaxe: 1 }, noDrop: true, blocks: [mkBlock('stone', 4, 64, 2), mkBlock('stone', 5, 64, 2), mkBlock('stone', 6, 64, 2), mkBlock('stone', 7, 64, 2), mkBlock('stone', 8, 64, 2), mkBlock('stone', 9, 64, 2)] }); r = createRunner(b); o = await r.run('mine.collect', { block: 'stone', count: 2 }); ok(!o.ok && /item tidak masuk/.test(o.data.reasons.join('|')), 'mine: item tak masuk -> dilaporkan jelas')
  // guard + fight
  b = mk({ inv: { iron_pickaxe: 1, iron_sword: 1, bread: 2 }, food: 8, blocks: [mkBlock('stone', 4, 64, 2)] }); b.entities[7] = { id: 7, type: 'hostile', name: 'zombie', position: new Vec3(3.5, 64, 0.5), height: 1.9 }; r = createRunner(b)
  o = await r.run('mine.collect', { block: 'stone', count: 1 }); ok(o.ok && o.data.fights === 1 && b.attacks >= 1 && b.equipped.includes('iron_sword') && b.food === 20, 'guard: zombie dilawan (pedang), makan saat lapar, lalu menambang (fights=' + o.data.fights + ', food=' + b.food + ')')
  b = mk({ inv: { iron_pickaxe: 1 }, health: 4, blocks: [mkBlock('stone', 4, 64, 2)] }); r = createRunner(b); o = await r.run('mine.collect', { block: 'stone', count: 1 }); ok(o.code === 'INTERRUPTED', 'guard: HP 4 -> INTERRUPTED')
  // hunt
  b = mk(); b.entities[3] = { id: 3, type: 'animal', name: 'cow', position: new Vec3(4.5, 64, 0.5), height: 1.4 }; r = createRunner(b); o = await r.run('hunt.kill', { mob: 'cow', count: 1 }); ok(o.ok && o.data.kills === 1, 'hunt: cow terbunuh (hits ' + o.data.hits + ')')
  b = mk(); r = createRunner(b); o = await r.run('hunt.kill', { mob: 'cow' }); ok(o.code === 'TARGET_NOT_FOUND', 'hunt: tidak ada target -> TARGET_NOT_FOUND')
  b = mk(); r = createRunner(b); o = await r.run('hunt.kill', { mob: 'creeperx' }); ok(o.code === 'PRECONDITION_FAILED', 'hunt: nama entitas tak dikenal -> PRECONDITION_FAILED')
  b = mk({ mode: 'creative' }); r = createRunner(b); o = await r.run('hunt.kill', { mob: 'animal' }); ok(o.code === 'PRECONDITION_FAILED', 'hunt: creative ditolak')
  // fish
  b = mk(); r = createRunner(b); o = await r.run('fish.cast', {}); ok(o.code === 'PRECONDITION_FAILED' && /fishing_rod/.test(o.error), 'fish: tanpa joran ditolak')
  b = mk({ inv: { fishing_rod: 1 } }); r = createRunner(b); o = await r.run('fish.cast', { count: 2 }); ok(o.code === 'TARGET_NOT_FOUND', 'fish: tanpa air -> TARGET_NOT_FOUND')
  const water = mkBlock('water', 6, 63, 0, 0), above = mkBlock('air', 6, 64, 0)
  b = mk({ inv: { fishing_rod: 1 }, blocks: [water, above] }); r = createRunner(b); o = await r.run('fish.cast', { count: 2 }); ok(o.ok && o.data.catches === 2 && o.data.caught.cod === 2 && b.equipped.includes('fishing_rod'), 'fish: 2 tangkapan terukur dari inventory (' + JSON.stringify(o.data.caught) + ')')
  // farm
  const w7 = mkBlock('wheat', 3, 64, 1, 7), w2 = mkBlock('wheat', 5, 64, 1, 2), soil = mkBlock('farmland', 3, 63, 1)
  b = mk({ inv: { wheat_seeds: 3 }, blocks: [w7, w2, soil] }); r = createRunner(b); o = await r.run('farm.harvest', { crops: ['wheat'], count: 1 }); ok(o.ok && o.data.harvested === 1 && o.data.replanted === 1 && b.dug[0] === 'wheat' && b._place.length === 1, 'farm: panen matang, abaikan muda, tanam ulang (' + JSON.stringify(o.data) + ')')
  b = mk({ blocks: [w2] }); r = createRunner(b); o = await r.run('farm.harvest', {}); ok(o.code === 'TARGET_NOT_FOUND', 'farm: hanya tanaman muda -> TARGET_NOT_FOUND')
  b = mk({ mode: 'creative' }); r = createRunner(b); o = await r.run('farm.harvest', {}); ok(o.code === 'PRECONDITION_FAILED', 'farm: creative ditolak')

  // chest auto + koordinat salah + nav escape
  const chestB = () => mkBlock('chest', 8, 64, 8)
  b = mk({ inv: { iron_pickaxe: 1 }, blocks: [mkBlock('stone', 4, 64, 2), chestB()] }); r = createRunner(b); o = await r.run('mine.collect', { block: 'stone', count: 1, chest: true }); ok(o.ok && o.data.deposited === 1 && o.data.chest.how === 'terdekat dari bot', 'chest:true -> chest terdekat otomatis (' + JSON.stringify(o.data.chest) + ')')
  b = mk({ inv: { iron_pickaxe: 1 }, blocks: [mkBlock('stone', 4, 64, 2), mkBlock('stone', 5, 61, 18), chestB()] }); r = createRunner(b); o = await r.run('mine.collect', { block: 'stone', count: 1, chest: { x: 5, y: 61, z: 18 } }); ok(!o.ok && /blok di koordinat itu: stone/.test(o.error) && /terdekat di 8,64,8/.test(o.error), 'chest salah koordinat (jauh) -> pesan menunjuk chest terdekat: ' + o.error)
  b = mk({ inv: { iron_pickaxe: 1 }, blocks: [mkBlock('stone', 4, 64, 2), chestB()] }); r = createRunner(b); o = await r.run('mine.collect', { block: 'stone', count: 1, chest: { x: 8, y: 65, z: 8 } }); ok(o.ok && o.data.chest.how === 'terdekat dari koordinat', 'chest meleset 1 blok -> memakai chest terdekat dari koordinat')
  b = mk({ inv: { iron_pickaxe: 1 }, blocks: [mkBlock('stone', 4, 64, 2)] }); r = createRunner(b); o = await r.run('mine.collect', { block: 'stone', count: 1, chest: 'auto' }); ok(!o.ok && o.code === 'TARGET_NOT_FOUND' && o.data.collected === 1, 'tanpa chest sama sekali -> gagal jelas, hasil tambang tetap tercatat')
  b = mk({ inv: { iron_pickaxe: 1 }, blocks: [mkBlock('stone', 4, 64, 2)] }); r = createRunner(b); o = await r.run('mine.collect', { block: 'stone', count: 1, chest: 'false' }); ok(o.ok && o.data.deposited === 0, "chest:'false' -> tidak menyimpan")
  b = mk({ noMoveFirst: 1 }); r = createRunner(b); o = await r.run('nav.goto', { x: 10, z: 5 }); ok(o.ok && b._mvs.length === 2 && !b._mvs.includes(true), 'nav: terjebak sekali -> ulang jalan kaki lalu sampai (tanpa gali)')
  b = mk({ noMoveFirst: 2 }); r = createRunner(b); o = await r.run('nav.goto', { x: 10, z: 5 }); ok(o.ok && b._mvs[2] === true && /menggali keluar/.test(o.data.escaped), 'nav: terjebak dua kali -> gali keluar (blok alami) lalu sampai')
  b = mk({ noMoveFirst: 2 }); r = createRunner(b); o = await r.run('nav.goto', { x: 10, z: 5, escape: false }); ok(!o.ok && o.code === 'UNKNOWN', 'nav: escape:false -> tetap melapor kegagalan jelas')
  // runner death
  b = mk({ inv: { iron_pickaxe: 1 }, delay: 300, blocks: [mkBlock('stone', 4, 64, 2), mkBlock('stone', 5, 64, 2)] }); r = createRunner(b); const pr = r.run('mine.collect', { block: 'stone', count: 2 }); setTimeout(() => b.emit('death'), 100); o = await pr; ok(o.code === 'DIED', 'runner: mati saat task -> DIED')
  console.log('\nHASIL: ' + pass + ' lulus, ' + fail + ' gagal'); process.exit(fail ? 1 : 0)
})()
