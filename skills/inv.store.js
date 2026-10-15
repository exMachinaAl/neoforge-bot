const U = require('./_util')
const I = require('./_inv')

const manifest = {
  name: 'inv.store',
  description: 'Pindahkan item inventory ke chest/barrel (default: semua item vanilla kecuali alat/senjata), lalu laporkan isi chest. Item modded hanya dengan includeModded=true dan bot op (dipindah lewat shift-click berbasis slot)',
  paramsSchema: {
    type: 'object',
    properties: {
      chest: { type: ['boolean', 'string', 'object'], description: 'true/"auto" = terdekat; {x,y,z} atau "x y z"' },
      items: { type: ['string', 'array'], description: '"all" (default) atau daftar nama dipisah koma, mis. "cobblestone,dirt"' },
      keep: { type: ['string', 'array'], description: 'nama item yang JANGAN dipindah (berlaku untuk items=all)' },
      keepTools: { type: 'boolean', default: true, description: 'items=all: jangan pindahkan pickaxe/axe/sword/shovel/hoe/bow/shield/dll' },
      includeModded: { type: 'boolean', default: false, description: 'ikutkan item modded / bermuatan komponen modded (butuh bot op untuk verifikasi)' },
      source: { type: 'string', enum: ['auto', 'bot'], default: 'auto', description: 'auto = rencana dari /data get entity bila op (lengkap, termasuk item yang tak terbaca bot); bot = hanya tampilan bot' },
      verify: { type: 'boolean', default: true, description: 'hitung hasil dari isi chest di server (/data get block) bila bot op' },
      waitMs: { type: 'integer', minimum: 1000, maximum: 20000, default: 6000 }
    }
  },
  requires: ['move', 'block.read', 'inventory.protocol', 'chat'],
  interruptible: true,
  estimatedMs: 25000
}

const keyOf = id => (I.isModdedId(id) ? String(id) : I.shortId(id))
const botTotals = bot => { const m = {}; for (let s = 9; s <= 44; s++) { const it = bot.inventory.slots[s]; if (it && it.count > 0) { const k = U.itemKey(it); m[k] = (m[k] || 0) + it.count } } return m }
const byKey = totals => { const m = {}; for (const [id, n] of Object.entries(totals)) { const k = keyOf(id); m[k] = (m[k] || 0) + n } return m }
const positiveDiff = (after, before) => { const m = {}; for (const k of Object.keys(after)) { const d = after[k] - (before[k] || 0); if (d > 0) m[k] = d } return m }
const sum = o => Object.values(o).reduce((a, n) => a + n, 0)

async function runCore (bot, p, ctx) {
  I.watch(bot)
  const want = I.toList(p.items); const all = !want.length || want.includes('all')
  const keep = new Set(I.toList(p.keep))
  const keepTools = p.keepTools !== false
  const includeModded = p.includeModded === true
  const wait = p.waitMs || 6000
  const md = ctx.mcData

  // 1. rencana: kebenaran server (bila op) lebih lengkap daripada tampilan bot (paket inventory bermuatan komponen modded dibuang)
  let truth = null
  if (p.source !== 'bot') {
    const sv = await I.serverInventory(bot, { timeoutMs: wait, signal: ctx.signal })
    if (sv.ok) truth = sv.items; else if (sv.code === 'ABORTED') return sv
  }
  const entries = []
  if (truth) { for (const x of truth) if (x.slot >= 9 && x.slot <= 44) entries.push({ slot: x.slot, id: x.id, count: x.count, comps: x.comps }) } else {
    for (let s = 9; s <= 44; s++) { const it = bot.inventory.slots[s]; if (it && it.count > 0) entries.push({ slot: s, id: I.fullId(it), count: it.count, comps: [] }) }
  }
  for (const e of entries) {
    e.key = keyOf(e.id)
    e.modded = I.isModdedId(e.id) || e.comps.some(I.isModdedId)
    const it = bot.inventory.slots[e.slot]
    e.type = it ? it.type : undefined
    e.viaBot = !!(it && I.fullId(it) === e.id && it.type != null && md.items[it.type]) // dikenal & terbaca bot -> boleh deposit()
  }
  const skippedMap = new Map(); const skip = (item, count, why) => { const k = item + '|' + why; const c = skippedMap.get(k); if (c) c.count += count; else skippedMap.set(k, { item, count, why }) }
  const plan = []
  for (const e of entries) {
    if (e.modded && !includeModded) { skip(e.key, e.count, 'modded'); continue }
    if (!all && !want.includes(e.key) && !want.includes(e.id)) continue
    if (keep.has(e.key) || keep.has(e.id)) { skip(e.key, e.count, 'keep'); continue }
    if (all && keepTools && I.isKeepTool(e.key)) { skip(e.key, e.count, 'alat'); continue }
    plan.push(e)
  }
  if (!all) for (const n of want) if (!entries.some(e => e.key === n || e.id === n || I.shortId(e.id) === n)) skip(n, 0, 'tidak ada di inventory')
  if (!plan.length) return { ok: false, code: 'PRECONDITION_FAILED', error: 'tidak ada item yang bisa dipindah', data: { skipped: [...skippedMap.values()], source: truth ? 'server' : 'bot' } }

  // 2. buka chest
  const o = await I.openChest(bot, ctx, p.chest)
  if (!o.ok) return { ok: false, code: o.code, error: o.error, data: { skipped: [...skippedMap.values()], ...(o.chest ? { chest: o.chest } : {}) } }
  const S = o.S; const w = S.w
  const dbl = I.isDouble(S.block)
  try {
    // 3. bagi metode: deposit() untuk item vanilla yang terbaca bot (terbukti), shift-click berbasis slot untuk sisanya (butuh bot op)
    const viaDeposit = new Map(); const viaClick = []
    for (const e of plan) {
      if (!S.degraded && e.viaBot && !e.modded) { const g = viaDeposit.get(e.type) || { type: e.type, key: e.key, count: 0 }; g.count += e.count; viaDeposit.set(e.type, g) } else if (truth) viaClick.push(e)
      else skip(e.key, e.count, 'butuh op (item modded / tak terbaca bot)')
    }
    if (!viaDeposit.size && !viaClick.length) return { ok: false, code: 'PRECONDITION_FAILED', error: 'tidak ada item yang bisa dipindah (bot bukan op, item modded/tak terbaca)', data: { skipped: [...skippedMap.values()], chest: o.info } }

    const canTruth = !dbl && (p.verify !== false || viaClick.length > 0 || S.degraded)
    const before = canTruth ? await I.serverChest(bot, S.block.position, { timeoutMs: wait, signal: ctx.signal }) : null
    const beforeBot = botTotals(bot)
    const itemsBefore = S.degraded ? null : I.windowItems(w).length

    // 4. pindahkan
    const failed = []; let chestFull = false
    for (const g of viaDeposit.values()) {
      if (ctx.signal.aborted || chestFull) break
      try { await w.deposit(g.type, null, g.count) } catch (err) {
        failed.push({ item: g.key, error: String(err.message).slice(0, 100) })
        if (/full/i.test(err.message)) chestFull = true
      }
      await U.sleep(150)
    }
    for (const e of viaClick) {
      if (ctx.signal.aborted) break
      try { I.quickMove(bot, S, I.invToWindow(S, e.slot)) } catch (err) { failed.push({ item: e.key, error: String(err.message).slice(0, 100) }) }
      await U.sleep(150)
    }

    // 5. tunggu server selesai (konfirmasi bisa lambat saat server lag), lalu hitung hasil dari kebenaran server bila ada
    await I.settle(() => botTotals(bot))
    await U.sleep(200)
    const after = canTruth ? await I.serverChest(bot, S.block.position, { timeoutMs: wait, signal: ctx.signal }) : null
    const haveTruth = !!(before && before.ok && after && after.ok)
    // hasil: dari isi chest di server bila ada; kalau tidak, dari berkurangnya item di inventory bot
    const moved = haveTruth ? positiveDiff(byKey(I.totalsOf(after.items)), byKey(I.totalsOf(before.items))) : positiveDiff(beforeBot, botTotals(bot))
    const asked = {}; for (const e of plan) asked[e.key] = (asked[e.key] || 0) + e.count
    for (const k of Object.keys(asked)) {
      const n = moved[k] || 0
      if (n < asked[k] && !failed.some(f => f.item === k) && !skippedMap.has(k + '|butuh op (item modded / tak terbaca bot)')) failed.push({ item: k, error: 'hanya ' + n + '/' + asked[k] + ' terpindah (chest penuh atau ditolak server)' })
    }

    const items = S.degraded ? null : I.windowItems(w)
    const slots = S.inventoryStart
    const chestTotals = haveTruth ? I.totalsOf(after.items) : (items ? I.totalsOf(items) : {})
    const used = haveTruth ? after.items.length : (items ? items.length : 0)
    const total = sum(moved)
    const data = { chest: o.info, degraded: S.degraded, method: { deposit: viaDeposit.size, click: viaClick.length }, moved, movedTotal: total, movedBy: haveTruth ? 'server' : 'bot', skipped: [...skippedMap.values()], failed, chestFull, chestAfter: { slots, free: slots - used, totals: chestTotals, items: used, itemsBefore } }
    if (p.verify === false) data.verify = { checked: false, reason: 'verify=false' }
    else if (dbl) data.verify = { checked: false, reason: 'chest ganda' }
    else if (!after || !after.ok) data.verify = { checked: false, reason: after ? after.error : 'tidak ada', code: after && after.code }
    else if (S.degraded) data.verify = { checked: true, degraded: true, ok: true, serverTotals: chestTotals }
    else { const d = I.diffSlots(items, after.items); data.verify = { checked: true, ok: I.accurate(d), serverTotals: chestTotals, missingInWindow: d.missing.slice(0, 20), diff: d.idDiff.concat(d.countDiff).slice(0, 20) } }
    if (total <= 0) return { ok: false, code: chestFull ? 'PRECONDITION_FAILED' : 'SERVER_REJECTED', error: chestFull ? 'chest penuh' : 'tidak ada item yang terpindah', data }
    return { ok: true, code: 'OK', data }
  } finally { S.close() }
}

// jendela sudah ditutup di runCore; setelah itu catatan inventory disamakan dengan server (hanya bila ada yang berpindah dan verify aktif)
async function run (bot, p, ctx) {
  const res = await runCore(bot, p, ctx)
  if (res && res.data && res.data.movedTotal > 0 && p.verify !== false && !ctx.signal.aborted) await I.attachRefresh(bot, ctx, p, res)
  return res
}

module.exports = { manifest, run, cli: [] }
