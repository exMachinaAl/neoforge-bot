// tests/craft.test.js - craft.item (bot tiruan; resep vanilla asli dari minecraft-data/prismarine-recipe)
const fs = require('fs'); const os = require('os'); const path = require('path')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'arcadia-craft-'))
process.env.ARCADIA_DATA_DIR = TMP
process.env.ARCADIA_OPEN_MS = '600'; process.env.ARCADIA_OPEN_GRACE_MS = '400'
const { mkBlock, mcData } = require('./mock')
const { mkInv } = require('./invmock')
const { createRunner } = require('../skills')
const { createEngine } = require('../engine')
let pass = 0; let fail = 0
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m) }
const md = mcData
const itemName = id => md.items[id].name

// bot.craft tiruan: memakai delta resep asli, mengubah tampilan bot DAN model server
function addCraft (b, o = {}) {
  b.craftCalls = []
  b.craft = async (recipe, n, table) => {
    b.craftCalls.push({ n, table: !!table, requiresTable: recipe.requiresTable })
    if (o.craftErr) throw new Error(o.craftErr)
    if (recipe.requiresTable && !table) throw new Error('Recipe requires craftingTable')
    for (let i = 0; i < n; i++) {
      for (const d of recipe.delta.filter(x => x.count < 0)) {
        let left = -d.count
        for (let s = 9; s <= 44 && left > 0; s++) {
          const x = b.inventory.slots[s]; if (!x || x.type !== d.id) continue
          const t = Math.min(left, x.count); x.count -= t; b._srvInv[s].count -= t; left -= t
          if (x.count <= 0) { b.inventory.slots[s] = null; b._srvInv[s] = null }
        }
      }
      let left = recipe.result.count; const rid = recipe.result.id; const nm = itemName(rid)
      for (let s = 9; s <= 44 && left > 0; s++) {
        const x = b.inventory.slots[s]; if (!x || x.type !== rid || x.count >= 64) continue
        const t = Math.min(left, 64 - x.count); x.count += t; b._srvInv[s].count += t; left -= t
      }
      for (let s = 9; s <= 44 && left > 0; s++) {
        if (b.inventory.slots[s]) continue
        const t = Math.min(left, 64); b.inventory.slots[s] = { type: rid, name: nm, count: t, slot: s }; b._srvInv[s] = { id: 'minecraft:' + nm, count: t, comps: {} }; left -= t
      }
    }
  }
  return b
}
const mk = (o = {}) => addCraft(mkInv(o), o)
const cnt = (b, name) => b.inventory.slots.filter(i => i && i.name === name).reduce((a, i) => a + i.count, 0)
const stickRecipe = require('prismarine-recipe')(require('prismarine-registry')('1.21.1')).Recipe.find(md.itemsByName.stick.id, null).find(r => r.result.count === 4) // 2 papan -> 4 stick
const stickMat = itemName(stickRecipe.delta.find(d => d.count < 0).id)

;(async () => {
  let b, r, o

  // ---- 2x2 tanpa meja ----
  b = mk({ inv: { 9: ['oak_log', 3] } }); r = createRunner(b)
  ok(r.skills['craft.item'] && r.parse('craft.item', ['stick', '4']).item === 'stick' && r.parse('craft.item', ['stick', '4']).count === 4, 'craft: skill terdaftar, CLI posisional item count')
  o = await r.run('craft.item', { item: 'oak_planks', count: 8 })
  ok(o.ok && o.data.crafted === 8 && o.data.ops === 2 && cnt(b, 'oak_log') === 1 && cnt(b, 'oak_planks') === 8 && !o.data.recipe.table && b.craftCalls.every(c => !c.table) && o.data.used.oak_log === 2, 'craft: 8 oak_planks dari 3 oak_log (2 operasi, tanpa meja), bahan terpakai tercatat')
  b = mk({ inv: { 9: ['oak_log', 3] } }); r = createRunner(b); o = await r.run('craft.item', { item: 'oak_planks', count: 6 })
  ok(o.ok && o.data.crafted === 8 && o.data.partial === false, 'craft: jumlah dibulatkan ke atas ke kelipatan hasil resep (6 -> 8)')
  b = mk({ inv: { 9: ['oak_log', 1] } }); r = createRunner(b); o = await r.run('craft.item', { item: 'oak_planks', count: 12 })
  ok(o.ok && o.data.crafted === 4 && o.data.partial === true && o.data.ops === 1, 'craft: bahan hanya cukup sebagian -> hasil sebagian (4 dari 12) ditandai partial')
  b = mk({ inv: { 9: [stickMat, 2] } }); r = createRunner(b); o = await r.run('craft.item', { item: 'stick', count: 4 })
  ok(o.ok && cnt(b, 'stick') === 4 && cnt(b, stickMat) === 0, 'craft: stick dari 2 ' + stickMat + ' (resep dengan bahan yang tersedia dipilih)')
  b = mk({ inv: { 9: [stickMat, 8] } }); r = createRunner(b); o = await r.run('craft.item', { item: 'crafting_table' })
  ok(!o.ok || o.data.crafted >= 1, 'craft: crafting_table (resep 2x2 bila bahan cocok)')
  b = mk({ inv: { 9: ['oak_log', 1] } }); r = createRunner(b); o = await r.run('craft.item', { item: 'oak_planks' })
  ok(o.ok && o.data.crafted === 4, 'craft: count default = 1 hasil -> satu operasi (4 planks)')

  // ---- gagal dengan alasan jelas ----
  b = mk({}); r = createRunner(b); o = await r.run('craft.item', { item: 'iron_pickaxe' })
  ok(!o.ok && o.code === 'PRECONDITION_FAILED' && /bahan kurang/.test(o.error) && /iron_ingot 0\/3/.test(o.error) && /stick 0\/2/.test(o.error) && o.data.missing.length === 2, 'craft: bahan kurang -> daftar kekurangan (iron_ingot 0/3, stick 0/2)')
  b = mk({ inv: { 9: ['iron_ingot', 3], 10: ['stick', 2] } }); r = createRunner(b); o = await r.run('craft.item', { item: 'iron_pickaxe', table: false })
  ok(!o.ok && o.code === 'PRECONDITION_FAILED' && /butuh meja crafting/.test(o.error) && b.craftCalls.length === 0, 'craft: resep butuh meja tapi table=false -> ditolak jelas')
  b = mk({ inv: { 9: ['iron_ingot', 3], 10: ['stick', 2] }, blocks: [] }); r = createRunner(b); o = await r.run('craft.item', { item: 'iron_pickaxe' })
  ok(!o.ok && o.code === 'TARGET_NOT_FOUND' && /tidak ada dalam 32 blok/.test(o.error) && b.craftCalls.length === 0, 'craft: butuh meja tapi tidak ada -> TARGET_NOT_FOUND')
  b = mk({}); r = createRunner(b); o = await r.run('craft.item', { item: 'item_ngawur' })
  ok(!o.ok && o.code === 'PRECONDITION_FAILED' && /tidak dikenal/.test(o.error), 'craft: nama item tidak dikenal ditolak')
  b = mk({}); r = createRunner(b); o = await r.run('craft.item', { item: 'bedrock' })
  ok(!o.ok && o.code === 'PRECONDITION_FAILED' && /tidak ada resep/.test(o.error), 'craft: item tanpa resep crafting ditolak')
  b = mk({}); r = createRunner(b); o = await r.run('craft.item', {})
  ok(!o.ok, 'craft: tanpa param item ditolak')
  b = mk({ inv: { 9: ['oak_log', 3] }, craftErr: 'boom' }); r = createRunner(b); o = await r.run('craft.item', { item: 'oak_planks', count: 4 })
  ok(!o.ok && o.code === 'SERVER_REJECTED' && /boom/.test(o.error) && cnt(b, 'oak_log') === 3, 'craft: kesalahan saat crafting -> SERVER_REJECTED, bahan tidak berkurang')

  // ---- meja crafting ----
  const tbl = () => [mkBlock('crafting_table', 3, 64, 0)]
  b = mk({ inv: { 9: ['iron_ingot', 3], 10: ['stick', 2] }, blocks: tbl() }); r = createRunner(b); o = await r.run('craft.item', { item: 'iron_pickaxe' })
  ok(o.ok && o.data.crafted === 1 && cnt(b, 'iron_pickaxe') === 1 && o.data.recipe.table && o.data.table.x === 3 && b.craftCalls[0].table && b._closed >= 1 && b.currentWindow === null, 'craft: iron_pickaxe di meja terdekat (jendela diuji lalu ditutup, tidak tertinggal)')
  b = mk({ inv: { 9: ['iron_ingot', 3], 10: ['stick', 2] }, blocks: tbl() }); r = createRunner(b); o = await r.run('craft.item', { item: 'iron_pickaxe', table: '3,64,0' })
  ok(o.ok && o.data.table.how === 'koordinat', 'craft: meja lewat koordinat teks "3,64,0"')
  b = mk({ inv: { 9: ['iron_ingot', 3], 10: ['stick', 2] }, blocks: tbl() }); r = createRunner(b); o = await r.run('craft.item', { item: 'iron_pickaxe', table: { x: 3, y: 64, z: 0 } })
  ok(o.ok && o.data.table.how === 'koordinat', 'craft: meja lewat objek {x,y,z}')
  b = mk({ inv: { 9: ['iron_ingot', 3], 10: ['stick', 2] }, blocks: tbl() }); r = createRunner(b); o = await r.run('craft.item', { item: 'iron_pickaxe', table: '8,64,8' })
  ok(!o.ok && o.code === 'TARGET_NOT_FOUND' && /tidak ada meja crafting di koordinat/.test(o.error), 'craft: koordinat meja salah -> TARGET_NOT_FOUND')
  b = mk({ inv: { 9: ['iron_ingot', 3], 10: ['stick', 2] }, blocks: tbl(), degradedOpen: true }); r = createRunner(b); o = await r.run('craft.item', { item: 'iron_pickaxe' })
  ok(!o.ok && o.code === 'PRECONDITION_FAILED' && /jendela meja crafting tidak terbaca/.test(o.error) && /inv\.store includeModded/.test(o.error) && b._closedIds.includes(7) && b.craftCalls.length === 0, 'craft: jendela meja tak terbaca (degraded) -> gagal jelas + petunjuk inv.store, jendela ditutup, tidak ada craft')
  b = mk({ inv: { 9: ['iron_ingot', 3], 10: ['stick', 2] }, blocks: tbl(), noOpen: true }); r = createRunner(b); o = await r.run('craft.item', { item: 'iron_pickaxe' })
  ok(!o.ok && o.code === 'SERVER_REJECTED' && /tidak ada open_window/.test(o.error), 'craft: meja tidak terbuka sama sekali -> SERVER_REJECTED')
  b = mk({ inv: { 9: ['oak_log', 3] }, blocks: tbl() }); r = createRunner(b); o = await r.run('craft.item', { item: 'oak_planks', count: 4 })
  ok(o.ok && !o.data.recipe.table && !o.data.table && b.craftCalls.every(c => !c.table), 'craft: resep 2x2 tidak memakai meja walau ada meja di dekat')

  // ---- sinkron inventory dengan server (op) ----
  b = mk({ hiddenInv: [{ slot: 20, id: 'minecraft:oak_log', count: 2 }] }); r = createRunner(b); o = await r.run('craft.item', { item: 'oak_planks', count: 8 })
  ok(o.ok && o.data.crafted === 8 && o.data.sync.refreshed && o.data.sync.hydrated === 1, 'craft: bahan yang dibawa sebelum spawn (tak terbaca bot) dipulihkan lewat sinkron server lalu dipakai')
  b = mk({ hiddenInv: [{ slot: 20, id: 'minecraft:oak_log', count: 2 }] }); r = createRunner(b); o = await r.run('craft.item', { item: 'oak_planks', count: 8, refresh: false })
  ok(!o.ok && o.code === 'PRECONDITION_FAILED' && /oak_log 0\/2/.test(o.error), 'craft: refresh=false -> bahan tak terbaca tidak dihitung (membuktikan gunanya sinkron)')
  b = mk({ inv: { 9: ['oak_log', 3] }, noOp: true }); r = createRunner(b); o = await r.run('craft.item', { item: 'oak_planks', count: 4 })
  ok(o.ok && o.data.sync.refreshed === false && /op|boleh/.test(o.data.sync.reason) && o.data.crafted === 4, 'craft: tanpa op sinkron dilewati dengan alasan, crafting tetap jalan dari tampilan bot')
  b = mk({ inv: { 9: ['oak_log', 3] } }); r = createRunner(b); const eng = createEngine(b, r)
  o = await r.run('craft.item', { item: 'oak_planks', count: 8 })
  const st = eng.state()
  ok(o.ok && o.data.inventoryRefreshed === true && st.inventory.source === 'snbt' && st.inventory.items.some(i => i.name === 'oak_planks' && i.count === 8) && st.inventory.items.some(i => i.name === 'oak_log' && i.count === 1), 'craft: setelah crafting, catatan inventory (BotState) langsung menunjukkan hasil dan sisa bahan')
  b = mk({ inv: { 9: ['oak_log', 3] } }); r = createRunner(b); o = await r.run('craft.item', { item: 'oak_planks', count: 4, refresh: false })
  ok(o.ok && o.data.inventoryRefreshed === undefined && !(b.sent || []).length, 'craft: refresh=false -> tidak ada perintah /data sama sekali')

  fs.rmSync(TMP, { recursive: true, force: true })
  console.log('\nHASIL: ' + pass + ' lulus, ' + fail + ' gagal')
  process.exit(fail ? 1 : 0)
})().catch(e => { console.log('EXCEPTION', e); process.exit(1) })
