const { Vec3 } = require('vec3')
const U = require('./_util')
const I = require('./_inv')

const manifest = {
  name: 'craft.item',
  description: 'Buat item vanilla dari bahan di inventory: tanpa meja bila resep muat di grid 2x2 (tidak butuh jendela chest), dengan meja crafting (terdekat/koordinat) bila perlu. Meja gagal bila jendelanya tak terbaca bot (item bermuatan komponen modded di inventory)',
  paramsSchema: {
    type: 'object',
    required: ['item'],
    properties: {
      item: { type: 'string', description: 'nama item hasil (vanilla), mis. "stick", "crafting_table", "iron_pickaxe"' },
      count: { type: 'integer', minimum: 1, maximum: 576, default: 1, description: 'jumlah item HASIL yang diinginkan (dibulatkan ke atas ke kelipatan hasil resep)' },
      table: { type: ['boolean', 'string', 'object'], description: 'true/"auto": cari meja crafting terdekat (<=32 blok); {x,y,z} atau "x,y,z": meja di koordinat itu; false: hanya resep 2x2' },
      refresh: { type: 'boolean', default: true, description: 'samakan inventory bot dengan server (butuh op) sebelum menghitung bahan dan sesudah crafting' },
      waitMs: { type: 'integer', minimum: 1000, maximum: 20000, default: 6000 }
    }
  },
  requires: ['move', 'block.read', 'inventory.protocol'],
  interruptible: true,
  estimatedMs: 15000
}

const withTimeout = (p, ms, msg) => { let t; return Promise.race([p, new Promise((resolve, reject) => { t = setTimeout(() => reject(new Error(msg)), ms) })]).finally(() => clearTimeout(t)) }

function findTable (bot, md, hint) {
  const id = md.blocksByName.crafting_table.id
  if (hint && typeof hint === 'object' && Number.isFinite(Number(hint.x))) {
    const b = bot.blockAt(new Vec3(Math.floor(hint.x), Math.floor(hint.y), Math.floor(hint.z)))
    return b && b.type === id ? { block: b, how: 'koordinat' } : { block: null, seen: b ? b.name : 'kosong' }
  }
  if (typeof hint === 'string' && !/^(auto|true|false)$/i.test(hint)) {
    const n = (hint.match(/-?\d+(?:\.\d+)?/g) || []).map(Number)
    if (n.length >= 3) { const b = bot.blockAt(new Vec3(Math.floor(n[0]), Math.floor(n[1]), Math.floor(n[2]))); return b && b.type === id ? { block: b, how: 'koordinat' } : { block: null, seen: b ? b.name : 'kosong' } }
  }
  const pos = bot.findBlocks({ matching: [id], maxDistance: 32, count: 1 })
  const b = pos && pos[0] ? bot.blockAt(pos[0]) : null
  return { block: b, how: 'terdekat dari bot' }
}

async function run (bot, p, ctx) {
  I.watch(bot)
  const md = ctx.mcData
  const name = String(p.item || '').replace(/^minecraft:/, '')
  const target = md.itemsByName[name]
  if (!target) return { ok: false, code: 'PRECONDITION_FAILED', error: 'item tidak dikenal (hanya vanilla): ' + name }
  const count = Math.max(1, parseInt(p.count ?? 1, 10) || 1)
  const Recipe = require('prismarine-recipe')(bot.registry).Recipe
  const all = Recipe.find(target.id, null)
  if (!all.length) return { ok: false, code: 'PRECONDITION_FAILED', error: 'tidak ada resep crafting vanilla untuk ' + name }

  // 1. samakan inventory bot dengan server (butuh op); gagal tidak fatal
  let sync = { refreshed: false, reason: 'refresh=false' }
  if (p.refresh !== false) {
    const rf = await I.refreshInventory(bot, ctx, { timeoutMs: Math.min(p.waitMs || 6000, 3000) })
    sync = rf.ok ? { refreshed: true, hydrated: rf.hydrated.length, removed: rf.removed.length, fixed: rf.fixed.length } : { refreshed: false, reason: String(rf.error || rf.code).slice(0, 100) }
    if (!rf.ok && rf.code === 'ABORTED') return rf
  }

  // 2. pilih resep: yang bahannya cukup; utamakan tanpa meja
  const have = id => bot.inventory.count(id)
  const need = r => r.delta.filter(d => d.count < 0).map(d => ({ id: d.id, need: -d.count }))
  const maxOps = r => Math.min(...need(r).map(n => Math.floor(have(n.id) / n.need)))
  const wanted = r => Math.ceil(count / r.result.count)
  const itemName = id => (md.items[id] ? md.items[id].name : 'id#' + id)
  const noTable = p.table === false
  let feasible = all.filter(r => maxOps(r) >= 1 && (!noTable || !r.requiresTable))
  feasible = feasible.sort((a, b) => (a.requiresTable ? 1 : 0) - (b.requiresTable ? 1 : 0))
  if (!feasible.length) {
    // laporkan kekurangan pada resep yang paling mendekati (selisih total terkecil)
    const usable = all.filter(r => !noTable || !r.requiresTable)
    const pool = usable.length ? usable : all
    const short = r => need(r).map(n => ({ item: itemName(n.id), need: n.need * wanted(r), have: have(n.id) })).filter(m => m.have < m.need)
    const best = pool.map(r => ({ r, miss: short(r) })).sort((a, b) => a.miss.reduce((s, m) => s + (m.need - m.have), 0) - b.miss.reduce((s, m) => s + (m.need - m.have), 0))[0]
    const onlyTable = noTable && !usable.length
    return { ok: false, code: 'PRECONDITION_FAILED', error: onlyTable ? name + ' butuh meja crafting (table=false menolaknya)' : 'bahan kurang untuk ' + name + ' x' + count + ': ' + best.miss.map(m => m.item + ' ' + m.have + '/' + m.need).join(', '), data: { missing: best.miss, recipes: all.length, sync } }
  }
  const recipe = feasible[0]
  const ops = Math.min(wanted(recipe), maxOps(recipe))
  const perOp = recipe.result.count

  // 3. meja crafting bila perlu: cari, dekati, uji jendelanya (mode degraded = jendela tak terbaca -> gagal jelas)
  let tableBlock = null; let tableInfo
  if (recipe.requiresTable) {
    const f = findTable(bot, md, p.table)
    if (!f.block) return { ok: false, code: 'TARGET_NOT_FOUND', error: f.seen ? 'tidak ada meja crafting di koordinat itu (blok: ' + f.seen + ')' : name + ' butuh meja crafting, tidak ada dalam 32 blok (menaruh meja belum didukung)', data: { sync } }
    tableBlock = f.block
    tableInfo = { x: tableBlock.position.x, y: tableBlock.position.y, z: tableBlock.position.z, how: f.how }
    const o = await I.openWindowAt(bot, ctx, tableBlock, tableInfo)
    if (!o.ok) return { ok: false, code: o.code, error: o.error, data: { table: o.chest || tableInfo, sync } }
    const degraded = o.S.degraded
    o.S.close()
    if (degraded) return { ok: false, code: 'PRECONDITION_FAILED', error: 'jendela meja crafting tidak terbaca bot (window_items dibuang: ada item bermuatan komponen modded di inventory). Simpan item itu ke chest dulu (inv.store includeModded=true) lalu ulangi', data: { table: o.info, degraded: true, sync } }
    await U.sleep(200)
  }

  // 4. craft per kelompok (bisa dihentikan di antara kelompok)
  const beforeCount = bot.inventory.count(target.id)
  let done = 0; let err = null
  while (done < ops && !ctx.signal.aborted) {
    const step = Math.min(8, ops - done)
    try { await withTimeout(bot.craft(recipe, step, tableBlock), step * 5000 + 8000, 'crafting melewati batas waktu') } catch (e) { err = e; break }
    done += step
  }
  I.ensureClosed(bot)
  await I.settle(() => bot.inventory.count(target.id))
  const crafted = Math.max(0, bot.inventory.count(target.id) - beforeCount)
  const used = {}; for (const n of need(recipe)) used[itemName(n.id)] = n.need * done
  const data = { item: name, requested: count, crafted, ops: done, perOp, recipe: { table: !!recipe.requiresTable, ingredients: need(recipe).map(n => ({ item: itemName(n.id), perOp: n.need })) }, used, ...(tableInfo ? { table: tableInfo } : {}), partial: crafted < count, sync }
  if (err) data.stoppedBy = String(err.message).slice(0, 140)
  if (ctx.signal.aborted && done < ops) data.stoppedBy = 'dihentikan'
  if (crafted <= 0) return { ok: false, code: ctx.signal.aborted ? 'ABORTED' : 'SERVER_REJECTED', error: err ? String(err.message).slice(0, 140) : 'tidak ada item yang terbentuk', data }
  if (p.refresh !== false && !ctx.signal.aborted) await I.attachRefresh(bot, ctx, p, { data })
  return { ok: true, code: 'OK', data }
}

module.exports = { manifest, run, cli: ['item', 'count'] }
