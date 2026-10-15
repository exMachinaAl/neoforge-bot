const U = require('./_util')
const I = require('./_inv')

const manifest = {
  name: 'inv.view',
  description: 'Buka chest/barrel dan daftar isinya. Bila jendela tak terbaca bot (item modded), isi diambil dari /data get block (butuh bot op); verify=true membandingkan jendela dengan server',
  paramsSchema: {
    type: 'object',
    properties: {
      chest: { type: ['boolean', 'string', 'object'], description: 'true/"auto" = terdekat; {x,y,z} atau "x y z" = di/dekat koordinat itu' },
      verify: { type: 'boolean', default: true },
      waitMs: { type: 'integer', minimum: 1000, maximum: 20000, default: 6000 }
    }
  },
  requires: ['move', 'block.read', 'inventory.protocol', 'chat'],
  interruptible: true,
  estimatedMs: 15000
}

async function run (bot, p, ctx) {
  const o = await I.openChest(bot, ctx, p.chest)
  if (!o.ok) return { ok: false, code: o.code, error: o.error, data: o.chest ? { chest: o.chest } : undefined }
  const S = o.S
  try {
    await U.sleep(250)
    const dbl = I.isDouble(S.block)
    const wait = p.waitMs || 6000
    let sv = null
    if (!dbl && (S.degraded || p.verify !== false)) sv = await I.serverChest(bot, S.block.position, { timeoutMs: wait, signal: ctx.signal })

    if (S.degraded) {
      if (!sv || !sv.ok) return { ok: false, code: sv && sv.code ? sv.code : 'PROTOCOL_UNSUPPORTED', error: 'jendela chest tidak terbaca bot (window_items gagal diparse: ada item bermuatan komponen modded) dan isi tak bisa diambil dari server: ' + (sv ? sv.error : 'chest ganda tidak didukung'), data: { chest: o.info, degraded: true } }
      const items = sv.items.map(x => ({ slot: x.slot, id: x.id, count: x.count }))
      const slots = S.inventoryStart
      return { ok: true, code: 'OK', data: { chest: o.info, degraded: true, source: 'server', slots, used: items.length, free: slots - items.length, items, totals: I.totalsOf(items), moddedOrComponent: sv.items.filter(x => I.isModdedId(x.id) || x.comps.some(I.isModdedId)).slice(0, 20).map(x => ({ slot: x.slot, id: x.id, count: x.count, comps: x.comps.slice(0, 6) })), verify: { checked: true, degraded: true }, note: 'jendela chest tak terbaca bot; isi diambil dari /data get block' } }
    }

    const items = I.windowItems(S.w)
    const slots = S.inventoryStart
    const data = { chest: o.info, degraded: false, source: 'window', slots, used: items.length, free: slots - items.length, items: items.map(i => ({ slot: i.slot, id: i.id, count: i.count })), totals: I.totalsOf(items) }
    if (p.verify === false) data.verify = { checked: false, reason: 'verify=false' }
    else if (dbl) data.verify = { checked: false, reason: 'chest ganda: /data get block hanya membaca setengah' }
    else if (!sv.ok) data.verify = { checked: false, reason: sv.error, code: sv.code }
    else {
      const d = I.diffSlots(items, sv.items)
      data.verify = { checked: true, ok: I.accurate(d), serverItems: sv.items.length, missingInWindow: d.missing.slice(0, 20), extraInWindow: d.extra.slice(0, 20), diff: d.idDiff.concat(d.countDiff).slice(0, 20) }
      if (!data.verify.ok) data.note = 'jendela chest di bot berbeda dari server (kemungkinan item bermuatan komponen modded tak terbaca): ' + d.missing.length + ' hilang di jendela'
    }
    return { ok: true, code: 'OK', data }
  } finally { S.close() }
}

module.exports = { manifest, run, cli: [] }
