const U = require('./_util')
const I = require('./_inv')

const manifest = {
  name: 'inv.take',
  description: 'Ambil item dari chest/barrel ke inventory bot. item="all" mengambil semuanya. Item vanilla: jumlah tepat; item modded / jendela tak terbaca: shift-click per stack (butuh bot op, jumlah per stack)',
  paramsSchema: {
    type: 'object',
    required: ['item'],
    properties: {
      item: { type: ['string', 'array'], description: 'nama item (boleh beberapa dipisah koma, mis. "iron_ingot,coal") atau "all"' },
      count: { type: ['integer', 'string'], description: 'jumlah per item, atau "all". Default 64 (atau semua bila item="all")' },
      chest: { type: ['boolean', 'string', 'object'], description: 'true/"auto" = terdekat; {x,y,z} atau "x y z"' },
      includeModded: { type: 'boolean', default: false, description: 'boleh mengambil item modded (ns:path) / bermuatan komponen modded' },
      verify: { type: 'boolean', default: true },
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
const freeMain = bot => { let n = 0; for (let s = 9; s <= 44; s++) if (!bot.inventory.slots[s]) n++; return n }

async function runCore (bot, p, ctx) {
  I.watch(bot)
  const want = I.toList(p.item)
  if (!want.length) return { ok: false, code: 'PRECONDITION_FAILED', error: 'param item kosong' }
  const takeAll = want.includes('all')
  const includeModded = p.includeModded === true
  const countAll = p.count === 'all' || (takeAll && (p.count === undefined || p.count === null))
  const count = countAll ? Infinity : Math.max(1, parseInt(p.count ?? 64, 10) || 64)
  const md = ctx.mcData; const wait = p.waitMs || 6000

  // nama -> id penuh (vanilla dari mcData; modded 'ns:path' hanya dengan includeModded)
  const targets = []; const unknown = []
  if (!takeAll) {
    for (const n of want) {
      const short = n.replace(/^minecraft:/, '')
      if (md.itemsByName[short]) { targets.push('minecraft:' + short); continue }
      if (includeModded && /^[a-z0-9_.-]+:[a-z0-9/._-]+$/.test(n)) { targets.push(n); continue }
      unknown.push(n)
    }
    if (!targets.length) return { ok: false, code: 'PRECONDITION_FAILED', error: 'item tidak dikenal/modded tanpa includeModded: ' + unknown.join(','), data: { unknown } }
  }

  const o = await I.openChest(bot, ctx, p.chest)
  if (!o.ok) return { ok: false, code: o.code, error: o.error, data: o.chest ? { chest: o.chest } : undefined }
  const S = o.S; const w = S.w
  const dbl = I.isDouble(S.block)
  try {
    await U.sleep(250)
    // isi chest: kebenaran server (op) bila ada, kalau tidak jendela
    // kebenaran server dipakai untuk verifikasi, jendela degraded, dan item modded; verify=false pada kasus vanilla biasa -> tanpa perintah
    const needTruth = !dbl && (p.verify !== false || S.degraded || includeModded)
    const before = needTruth ? await I.serverChest(bot, S.block.position, { timeoutMs: wait, signal: ctx.signal }) : null
    const haveTruth = !!(before && before.ok)
    const win = S.degraded ? [] : I.windowItems(w)
    if (S.degraded && !haveTruth) return { ok: false, code: before && before.code ? before.code : 'PROTOCOL_UNSUPPORTED', error: 'jendela chest tidak terbaca bot (item bermuatan komponen modded) dan isi tak bisa diambil dari server: ' + (before ? before.error : 'chest ganda'), data: { chest: o.info, degraded: true } }
    const stacks = (haveTruth ? before.items : win).map(x => {
      const id = x.id; const comps = x.comps || []
      const wi = win.find(y => y.slot === x.slot && y.id === id)
      return { slot: x.slot, id, key: keyOf(id), count: x.count, modded: I.isModdedId(id) || comps.some(I.isModdedId), type: wi ? wi.type : undefined, viaWindow: !S.degraded && !!wi && wi.type != null && !!md.items[wi.type] }
    })
    const skipped = []
    const chosen = stacks.filter(st => {
      if (!takeAll && !targets.includes(st.id)) return false
      if (st.modded && !includeModded) { skipped.push({ item: st.key, count: st.count, why: 'modded' }); return false }
      return true
    })
    const missing = takeAll ? [] : targets.filter(t => !stacks.some(st => st.id === t)).map(keyOf)

    const beforeBot = botTotals(bot); const freeBefore = freeMain(bot)
    const remaining = {}; const failed = []; let invFull = false
    const rem = k => (remaining[k] === undefined ? (remaining[k] = count) : remaining[k])
    // vanilla terbaca: withdraw() dengan jumlah tepat, digabung per jenis
    const groups = new Map()
    for (const st of chosen.filter(s => s.viaWindow)) { const g = groups.get(st.type) || { type: st.type, key: st.key, avail: 0 }; g.avail += st.count; groups.set(st.type, g) }
    for (const g of groups.values()) {
      if (ctx.signal.aborted || invFull) break
      const n = Math.min(rem(g.key), g.avail)
      if (n <= 0) continue
      try { await w.withdraw(g.type, null, n); remaining[g.key] = rem(g.key) - n } catch (err) {
        failed.push({ item: g.key, error: String(err.message).slice(0, 100) })
        if (/full/i.test(err.message)) invFull = true
      }
      await U.sleep(150)
    }
    // sisanya (modded / tak terbaca / jendela degraded): shift-click per stack, jumlah per stack
    const viaClick = chosen.filter(s => !s.viaWindow)
    if (viaClick.length && !haveTruth) for (const st of viaClick) skipped.push({ item: st.key, count: st.count, why: 'butuh op (item modded / tak terbaca bot)' })
    else for (const st of viaClick) {
      if (ctx.signal.aborted || invFull) break
      if (rem(st.key) <= 0) continue
      try { I.quickMove(bot, S, st.slot); remaining[st.key] = rem(st.key) - st.count } catch (err) { failed.push({ item: st.key, error: String(err.message).slice(0, 100) }) }
      await U.sleep(150)
    }

    await I.settle(() => botTotals(bot))
    await U.sleep(200)
    const after = needTruth ? await I.serverChest(bot, S.block.position, { timeoutMs: wait, signal: ctx.signal }) : null
    const afterOk = !!(after && after.ok)
    const moved = (haveTruth && afterOk) ? positiveDiff(byKey(I.totalsOf(before.items)), byKey(I.totalsOf(after.items))) : positiveDiff(botTotals(bot), beforeBot)
    const total = sum(moved)
    if (!total && freeBefore === 0 && chosen.length) invFull = true

    const items = S.degraded ? null : I.windowItems(w)
    const slots = S.inventoryStart
    const chestTotals = afterOk ? I.totalsOf(after.items) : (items ? I.totalsOf(items) : {})
    const used = afterOk ? after.items.length : (items ? items.length : 0)
    const data = { chest: o.info, degraded: S.degraded, method: { withdraw: groups.size, click: viaClick.length }, granularity: viaClick.length ? 'stack' : 'exact', moved, movedTotal: total, movedBy: (haveTruth && afterOk) ? 'server' : 'bot', missing, unknown, skipped, failed, inventoryFull: invFull, chestAfter: { slots, free: slots - used, totals: chestTotals } }
    if (p.verify === false) data.verify = { checked: false, reason: 'verify=false' }
    else if (dbl) data.verify = { checked: false, reason: 'chest ganda' }
    else if (!afterOk) data.verify = { checked: false, reason: after ? after.error : 'tidak ada', code: after && after.code }
    else if (S.degraded) data.verify = { checked: true, degraded: true, ok: true, serverTotals: chestTotals }
    else { const d = I.diffSlots(items, after.items); data.verify = { checked: true, ok: I.accurate(d), serverTotals: chestTotals, missingInWindow: d.missing.slice(0, 20), diff: d.idDiff.concat(d.countDiff).slice(0, 20) } }

    if (total > 0) return { ok: true, code: 'OK', data }
    if (invFull) return { ok: false, code: 'INVENTORY_FULL', error: 'inventory bot penuh', data }
    if (missing.length || !chosen.length) return { ok: false, code: 'TARGET_NOT_FOUND', error: (missing.length ? 'tidak ada di chest: ' + missing.join(',') : 'tidak ada item yang bisa diambil') + '; isi chest: ' + Object.entries(byKey(I.totalsOf(stacks))).slice(0, 15).map(([k, v]) => k + ' x' + v).join(', '), data }
    return { ok: false, code: 'SERVER_REJECTED', error: 'tidak ada item yang terambil', data }
  } finally { S.close() }
}

// jendela sudah ditutup di runCore; setelah itu catatan inventory disamakan dengan server (hanya bila ada yang berpindah dan verify aktif)
async function run (bot, p, ctx) {
  const res = await runCore(bot, p, ctx)
  if (res && res.data && res.data.movedTotal > 0 && p.verify !== false && !ctx.signal.aborted) await I.attachRefresh(bot, ctx, p, res)
  return res
}

module.exports = { manifest, run, cli: ['item', 'count'] }
