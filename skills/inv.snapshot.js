const fs = require('fs')
const I = require('./_inv')
const names = require('./_names')

const manifest = {
  name: 'inv.snapshot',
  description: 'Bandingkan inventory bot (protokol) dengan data server (/data get entity Inventory), samakan tampilan bot (pulihkan item polos, hapus item hantu), belajar nama item modded; butuh bot op',
  paramsSchema: {
    type: 'object',
    properties: {
      waitMs: { type: 'integer', minimum: 1000, maximum: 20000, default: 6000 },
      save: { type: 'boolean', default: true, description: 'tulis snapshot.json' },
      hydrate: { type: 'boolean', default: true, description: 'samakan tampilan bot dengan server: pulihkan item polos yang hilang, hapus item hantu, koreksi jumlah' }
    }
  },
  requires: ['inventory.protocol', 'inventory.snbt', 'chat'],
  interruptible: true,
  estimatedMs: 3000
}

const cap = (a, n = 20) => a.slice(0, n)

async function run (bot, p, ctx) {
  const t0 = Date.now()
  const sv = await I.serverInventory(bot, { timeoutMs: p.waitMs || 6000, signal: ctx.signal })
  if (!sv.ok) return sv
  const unmapped = sv.items.filter(x => x.slot == null).map(x => ({ nbtSlot: x.nbtSlot, id: x.id, count: x.count }))
  const rec = I.reconcile(bot, ctx, sv.items, { hydrate: p.hydrate !== false })
  const d = rec.d; const before = rec.before
  const view = rec.view

  // belajar nama: slot yang di sisi bot bernama unknown#<id> tetapi server menyebut nama aslinya
  const learned = {}
  for (const u of d.unknownId) {
    const it = bot.inventory.slots[u.slot]
    if (it && names.learn(it.type, u.id)) learned[it.type] = u.id
  }
  if (Object.keys(learned).length) names.save()

  const truthTotals = I.totalsOf(sv.items)
  const botTotals = I.totalsOf(view)
  const ok = I.accurate(d) && !unmapped.length
  const modded = sv.items.filter(x => I.isModdedId(x.id) || x.comps.some(I.isModdedId))
  const data = {
    accurate: ok, serverItems: sv.items.length, botItems: view.length, matched: d.match,
    protocolEmpty: view.length === 0 && sv.items.length > 0,
    missingInBot: cap(d.missing), extraInBot: cap(d.extra), idDiff: cap(d.idDiff), countDiff: cap(d.countDiff), unknownNamed: cap(d.unknownId),
    moddedOrComponent: cap(modded.map(x => ({ slot: x.slot, id: x.id, count: x.count, comps: x.comps.slice(0, 6) })), 12),
    unmappedSlots: cap(unmapped),
    hydrated: cap(rec.hydrated), unreadable: cap(rec.unreadable), removed: cap(rec.removed), fixed: cap(rec.fixed),
    beforeHeal: { missing: before.missing.length, extra: before.extra.length, diff: before.idDiff.length + before.countDiff.length },
    learned, names: names.stats(), truthTotals, botTotals
  }
  bot.arcadia = bot.arcadia || {}
  // daftar ini = kebenaran server saat snapshot (lengkap, termasuk item yang tak terbaca bot); 'matched' = tampilan bot cocok penuh
  bot.arcadia.inventoryTruth = { ts: Date.now(), accurate: true, matched: ok, totals: truthTotals, items: sv.items.map(x => ({ slot: x.slot, id: x.id, count: x.count })) }
  if (p.save !== false) { try { fs.writeFileSync(I.dataPath('snapshot.json'), JSON.stringify({ ts: Date.now(), accurate: ok, server: sv.items, diff: d }, null, 1)) } catch (e) { /* abaikan */ } }
  data.durationMs = Date.now() - t0
  const healed = rec.hydrated.length + rec.removed.length + rec.fixed.length
  if (healed) data.healedNote = 'tampilan bot disamakan dengan server: ' + rec.hydrated.length + ' dipulihkan, ' + rec.removed.length + ' item hantu dihapus, ' + rec.fixed.length + ' jumlah dikoreksi'
  if (!ok) data.note = 'inventory bot berbeda dari server: ' + d.missing.length + ' hilang di bot (' + rec.unreadable.length + ' tak bisa dipulihkan: bermuatan komponen), ' + d.extra.length + ' lebih di bot, ' + (d.idDiff.length + d.countDiff.length) + ' selisih, ' + unmapped.length + ' slot tak terpetakan'
  return { ok: true, code: 'OK', data }
}

module.exports = { manifest, run, cli: [] }
