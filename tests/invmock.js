// tests/invmock.js - bot tiruan dengan model server tunggal (inventory + chest) untuk uji inventory/crafting/breeding.
// Tampilan bot hanya berisi item yang TERBACA; item 'hidden*' hanya ada di server (paket bermuatan komponen modded dibuang).
const { mk, mkBlock, mcData, it } = require('./mock')
// ---------- tiruan server: teks /data get ... ----------
const { EventEmitter } = require('events')
const mcToNbt = s => s >= 36 && s <= 44 ? s - 36 : s >= 9 && s <= 35 ? s : s >= 5 && s <= 8 ? 103 - (s - 5) : s === 45 ? -106 : null
const compsTxt = c => c && Object.keys(c).length ? ', components: {' + Object.entries(c).map(([k, v]) => '"' + k + '": ' + (typeof v === 'string' ? '"' + v + '"' : JSON.stringify(v))).join(', ') + '}' : ''
const itemTxt = (slotTxt, e) => '{Slot: ' + slotTxt + ', id: "' + e.id + '", count: ' + e.count + compsTxt(e.comps) + '}'

// Model server tunggal (kebenaran): srvInv/srvChest. Tampilan bot (slots, window) hanya berisi item yang TERBACA;
// item 'hidden*' hanya ada di server (mis. paket bermuatan komponen modded dibuang bot).
function mkInv (o = {}) {
  const b = mk({ blocks: o.blocks || [mkBlock('chest', 3, 64, 0)], ...(o.mk || {}) })
  b.username = 'BotAlpha'
  b._client = new EventEmitter(); b.writes = []; b._closedIds = []; b._closed = 0
  const slots = new Array(46).fill(null)
  const srvInv = new Array(46).fill(null)
  const srvChest = new Array(27).fill(null)
  const view = new Array(27).fill(null) // isi chest di jendela bot (mode normal)
  b.inventory = { slots, items: () => slots.filter(i => i && i.count > 0), count: type => slots.filter(i => i && i.type === type).reduce((a, i) => a + i.count, 0), updateSlot: (s, item) => { slots[s] = item } }
  const idOf = n => (it(n) ? it(n).id : null)
  const plain = e => e.id.startsWith('minecraft:') && !(e.comps && Object.keys(e.comps).length)
  const later = fn => (o.lagMs ? setTimeout(fn, o.lagMs) : fn())
  b.put = (slot, name, count, type, srvId) => {
    const known = idOf(name)
    slots[slot] = { type: known != null ? known : type, name: known != null ? name : 'unknown', count, slot }
    srvInv[slot] = { id: srvId || (known != null ? 'minecraft:' + name : 'mod:unknown'), count, comps: {} }
  }
  for (const [slot, [name, count, type, srvId]] of Object.entries(o.inv || {})) b.put(Number(slot), name, count, type, srvId)
  for (const h of o.hiddenInv || []) srvInv[h.slot] = { id: h.id, count: h.count, comps: h.comps || {} }
  for (const [slot, [name, count]] of Object.entries(o.chest || {})) { const e = { id: 'minecraft:' + name, count, comps: {} }; srvChest[Number(slot)] = e; view[Number(slot)] = { type: idOf(name), name, count, slot: Number(slot) } }
  for (const h of o.hiddenChest || []) srvChest[h.slot] = { id: h.id, count: h.count, comps: h.comps || {} }
  b._srvChest = srvChest; b._srvInv = srvInv; b._view = view
  b.srv = { noOp: !!o.noOp, silent: !!o.silent, garbage: !!o.garbage }
  const say = t => setTimeout(() => b.emit('messagestr', t, 'system', {}), 5)
  b.chat = text => {
    b.sent = (b.sent || []).concat(text)
    if (b.srv.silent) return
    if (b.srv.noOp && text.startsWith('/data')) return say('Unknown or incomplete command, see below for error')
    if (/^\/data get entity BotAlpha Inventory/.test(text)) {
      if (b.srv.garbage) return say('BotAlpha has the following entity data: [{Slot: 0b, id: "minecraft:st')
      const truth = []
      srvInv.forEach((e, s) => { if (e && e.count > 0 && mcToNbt(s) != null) truth.push({ s: mcToNbt(s), ...e }) })
      if (!truth.length) return say('Found no elements matching Inventory')
      return say('BotAlpha has the following entity data: [' + truth.map(e => itemTxt(e.s + 'b', e)).join(', ') + ']')
    }
    const m = /^\/data get block (-?\d+) (-?\d+) (-?\d+) Items/.exec(text)
    if (m) {
      const items = []; srvChest.forEach((e, s) => { if (e && e.count > 0) items.push({ s, ...e }) })
      if (!items.length) return say('Found no elements matching Items')
      return say(m[1] + ', ' + m[2] + ', ' + m[3] + ' has the following block data: [' + items.map(e => itemTxt(e.s + 'b', e)).join(', ') + ']')
    }
  }
  const sameId = (x, y) => x && y && x.id === y.id && JSON.stringify(x.comps || {}) === JSON.stringify(y.comps || {})
  const toChest = (item) => { // gabung ke stack sama atau slot kosong; -> indeks atau -1
    let i = srvChest.findIndex(c => c && sameId(c, item) && c.count < 64); if (i >= 0) return i
    return srvChest.findIndex(c => !c)
  }
  const toInv = (item) => {
    for (let s = 9; s <= 44; s++) if (srvInv[s] && sameId(srvInv[s], item) && srvInv[s].count < 64) return s
    for (let s = 9; s <= 44; s++) if (!srvInv[s]) return s
    return -1
  }
  // pindah satu stack penuh (shift-click). dir: 'toChest' | 'toInv'
  const quick = (dir, slot) => {
    if (dir === 'toChest') {
      const e = srvInv[slot]; if (!e) return
      const ci = toChest(e); if (ci < 0) return
      const room = srvChest[ci] ? 64 - srvChest[ci].count : 64; const n = Math.min(e.count, room)
      if (!srvChest[ci]) srvChest[ci] = { id: e.id, count: 0, comps: e.comps }
      srvChest[ci].count += n; e.count -= n
      const bs = slots[slot]
      if (plain(srvChest[ci])) later(() => { view[ci] = view[ci] || { type: idOf(srvChest[ci].id.slice(10)), name: srvChest[ci].id.slice(10), count: 0, slot: ci }; view[ci].count = srvChest[ci].count; if (bs) { bs.count -= n; if (bs.count <= 0) slots[slot] = null } })
      if (e.count <= 0) srvInv[slot] = null
    } else {
      const e = srvChest[slot]; if (!e) return
      const di = toInv(e); if (di < 0) return
      const room = srvInv[di] ? 64 - srvInv[di].count : 64; const n = Math.min(e.count, room)
      if (!srvInv[di]) srvInv[di] = { id: e.id, count: 0, comps: e.comps }
      srvInv[di].count += n; e.count -= n
      if (plain(srvInv[di])) later(() => { slots[di] = slots[di] || { type: idOf(srvInv[di].id.slice(10)), name: srvInv[di].id.slice(10), count: 0, slot: di }; slots[di].count = srvInv[di].count; if (view[slot]) { view[slot].count = e.count; if (e.count <= 0) view[slot] = null } })
      if (e.count <= 0) srvChest[slot] = null
    }
  }
  b._client.write = (name, pkt) => {
    b.writes.push({ name, ...pkt })
    if (name === 'close_window') { b._closedIds.push(pkt.windowId); return }
    if (name === 'window_click' && pkt.mode === 1 && !o.ignoreClicks) { if (pkt.slot < 27) quick('toInv', pkt.slot); else quick('toChest', pkt.slot - 27 + 9) }
  }
  const win = {
    id: 7, inventoryStart: 27,
    containerItems: () => view.filter(Boolean).map(c => ({ ...c })),
    close () { b._closed++; b.currentWindow = null },
    deposit: async (type, meta, n) => {
      let left = n; let moved = 0
      for (let s = 9; s <= 44 && left > 0; s++) {
        const x = slots[s]; if (!x || x.type !== type || !srvInv[s]) continue
        const ci = toChest(srvInv[s]); if (ci < 0) break
        const room = srvChest[ci] ? 64 - srvChest[ci].count : 64; const take = Math.min(left, x.count, room)
        if (!srvChest[ci]) srvChest[ci] = { id: srvInv[s].id, count: 0, comps: srvInv[s].comps }
        srvChest[ci].count += take; srvInv[s].count -= take; if (srvInv[s].count <= 0) srvInv[s] = null
        later(() => { view[ci] = view[ci] || { type, name: x.name, count: 0, slot: ci }; view[ci].count = srvChest[ci] ? srvChest[ci].count : view[ci].count; x.count -= take; if (x.count <= 0) slots[s] = null })
        left -= take; moved += take
      }
      if (!moved) throw new Error('destination full')
    },
    withdraw: async (type, meta, n) => {
      let left = n; let moved = 0
      for (let c = 0; c < 27 && left > 0; c++) {
        const v = view[c]; const e = srvChest[c]; if (!v || v.type !== type || !e) continue
        const di = toInv(e); if (di < 0) break
        const room = srvInv[di] ? 64 - srvInv[di].count : 64; const take = Math.min(left, e.count, room)
        if (!srvInv[di]) srvInv[di] = { id: e.id, count: 0, comps: e.comps }
        srvInv[di].count += take; e.count -= take
        later(() => { slots[di] = slots[di] || { type, name: v.name, count: 0, slot: di }; slots[di].count = srvInv[di].count; v.count = e.count; if (e.count <= 0) { view[c] = null } })
        if (e.count <= 0) srvChest[c] = null
        left -= take; moved += take
      }
      if (!moved) throw new Error('destination full')
    }
  }
  b.activateBlock = async () => {
    b.activations = (b.activations || 0) + 1
    setTimeout(() => {
      if (o.noOpen) return
      if (o.degradedOpen) { b.currentWindow = { id: 7, inventoryStart: 27, slots: [] }; b._client.emit('open_window', { windowId: 7 }); return }
      b.currentWindow = win; b._client.emit('open_window', { windowId: 7 }); b.emit('windowOpen', win)
    }, 20)
  }
  return b
}
const inv = (b, name) => b.inventory.slots.filter(i => i && (i.name === name)).reduce((a, i) => a + i.count, 0)
const srvInvCount = (b, id) => b._srvInv.filter(e => e && e.id === id).reduce((a, e) => a + e.count, 0)
const chestCount = (b, name) => b._srvChest.filter(e => e && e.id === 'minecraft:' + name).reduce((a, e) => a + e.count, 0)
const chestIdCount = (b, id) => b._srvChest.filter(e => e && e.id === id).reduce((a, e) => a + e.count, 0)


module.exports = { mkInv, inv, srvInvCount, chestCount, chestIdCount, mcToNbt }
