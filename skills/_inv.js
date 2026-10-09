// skills/_inv.js - pembantu inventory/chest: kueri perintah via chat, data kebenaran server, pembanding, buka chest.
// Kebenaran server = /data get ... (butuh bot op). Jendela/inventory dari protokol bisa tertinggal karena paket
// bermuatan komponen item modded gagal parse dan dibuang.
const fs = require('fs')
const path = require('path')
const U = require('./_util')
const names = require('./_names')
const snbt = require('./_snbt')

const dataPath = f => path.join(process.env.ARCADIA_DATA_DIR || '.', f)

// 'minecraft:x' untuk item vanilla, 'ns:path' bila dikenal, selain itu 'unknown#<id>'
function fullId (i) {
  if (i.name && i.name !== 'unknown') return 'minecraft:' + i.name
  return names.nameOf(i.type) || 'unknown#' + i.type
}
const isModdedId = id => !String(id).startsWith('minecraft:')
const shortId = id => String(id).replace(/^minecraft:/, '')

// Kirim perintah via chat, tunggu baris balasan yang cocok. -> {ok,text} | {ok:false,reason}
function chatQuery (bot, command, o = {}) {
  const timeoutMs = o.timeoutMs || 6000
  return new Promise(resolve => {
    let done = false
    const fin = r => { if (done) return; done = true; clearTimeout(t); bot.removeListener('messagestr', on); if (o.signal) o.signal.removeEventListener('abort', ab); resolve(r) }
    const on = str => {
      const s = String(str)
      if (o.match && o.match.test(s)) return fin({ ok: true, text: s })
      if (o.none && o.none.test(s)) return fin({ ok: true, none: true, text: s })
      if (/Unknown or incomplete command|Unknown command|Incorrect argument for command|You do not have permission/i.test(s)) return fin({ ok: false, reason: 'NO_PERMISSION', text: s })
      if (o.fail && o.fail.test(s)) return fin({ ok: false, reason: 'FAIL', text: s })
    }
    const ab = () => fin({ ok: false, reason: 'ABORTED' })
    const t = setTimeout(() => fin({ ok: false, reason: 'TIMEOUT' }), timeoutMs)
    bot.on('messagestr', on)
    if (o.signal) { if (o.signal.aborted) return fin({ ok: false, reason: 'ABORTED' }); o.signal.addEventListener('abort', ab) }
    bot.chat(command)
  })
}

// Terjemahkan kegagalan chatQuery ke SkillResult (null bila tidak gagal)
function queryError (q, what) {
  if (q.ok) return null
  if (q.reason === 'ABORTED') return { ok: false, code: 'ABORTED', error: 'dihentikan' }
  if (q.reason === 'NO_PERMISSION') return { ok: false, code: 'PRECONDITION_FAILED', error: 'bot tidak boleh memakai /data (jadikan op: /op BotAlpha): ' + String(q.text).slice(0, 120) }
  if (q.reason === 'TIMEOUT') return { ok: false, code: 'TIMEOUT', error: 'tidak ada balasan untuk ' + what + ' (bot bukan op, atau gamerule sendCommandFeedback=false)' }
  return { ok: false, code: 'SERVER_REJECTED', error: what + ': ' + String(q.text).slice(0, 160) }
}

function saveRaw (text) {
  try { fs.writeFileSync(dataPath('snapshot_raw.txt'), String(text).slice(0, 20000)) } catch (e) { /* abaikan */ }
}

// Inventory sebenarnya menurut server. -> {ok, items:[{slot,nbtSlot,id,count,comps}]} | SkillResult gagal
async function serverInventory (bot, o = {}) {
  const q = await chatQuery(bot, '/data get entity ' + bot.username + ' Inventory', { match: /has the following entity data/i, none: /Found no elements matching/i, timeoutMs: o.timeoutMs, signal: o.signal })
  const err = queryError(q, '/data get entity Inventory'); if (err) return err
  if (q.none) return { ok: true, items: [] }
  try { return { ok: true, items: snbt.inventoryItems(snbt.extract(q.text)) } } catch (e) {
    saveRaw(q.text)
    return { ok: false, code: 'PROTOCOL_UNSUPPORTED', error: 'format /data tidak terbaca (' + e.message.slice(0, 120) + '); teks mentah disimpan di snapshot_raw.txt, kirim ke pengembang' }
  }
}

// Isi chest sebenarnya menurut server (satu blok). -> {ok, items:[{slot,id,count,comps}]} | SkillResult gagal
async function serverChest (bot, pos, o = {}) {
  const q = await chatQuery(bot, `/data get block ${pos.x} ${pos.y} ${pos.z} Items`, { match: /has the following block data/i, none: /Found no elements matching/i, fail: /not a block entity|Found no block|No block entity/i, timeoutMs: o.timeoutMs, signal: o.signal })
  const err = queryError(q, '/data get block Items'); if (err) return err
  if (q.none) return { ok: true, items: [] }
  try { return { ok: true, items: snbt.containerItems(snbt.extract(q.text)) } } catch (e) {
    saveRaw(q.text)
    return { ok: false, code: 'PROTOCOL_UNSUPPORTED', error: 'format /data block tidak terbaca (' + e.message.slice(0, 120) + '); teks mentah di snapshot_raw.txt' }
  }
}

// Bandingkan slot per slot: view = [{slot,id,count}] (sisi bot/jendela), truth = [{slot,id,count,comps}] (server)
function diffSlots (view, truth) {
  const v = new Map(view.map(x => [x.slot, x])); const t = new Map(truth.filter(x => x.slot != null).map(x => [x.slot, x]))
  const out = { match: 0, missing: [], extra: [], idDiff: [], countDiff: [], unknownId: [] }
  for (const [slot, tr] of t) {
    const b = v.get(slot)
    if (!b) { out.missing.push({ slot, id: tr.id, count: tr.count, modded: isModdedId(tr.id) || tr.comps.some(isModdedId) }); continue }
    if (b.id !== tr.id) {
      if (String(b.id).startsWith('unknown#') && isModdedId(tr.id)) { out.unknownId.push({ slot, botId: b.id, id: tr.id, count: tr.count }); if (b.count !== tr.count) out.countDiff.push({ slot, id: tr.id, bot: b.count, server: tr.count }); continue }
      out.idDiff.push({ slot, bot: b.id, server: tr.id }); continue
    }
    if (b.count !== tr.count) { out.countDiff.push({ slot, id: tr.id, bot: b.count, server: tr.count }); continue }
    out.match++
  }
  for (const [slot, b] of v) if (!t.has(slot)) out.extra.push({ slot, id: b.id, count: b.count })
  return out
}
const accurate = d => !d.missing.length && !d.extra.length && !d.idDiff.length && !d.countDiff.length

const totalsOf = items => { const m = {}; for (const i of items) m[i.id] = (m[i.id] || 0) + i.count; return m }

// Tampilan inventory bot (slot jendela 5-45; slot 0-4 = crafting diabaikan)
function botView (bot) {
  const out = []
  for (let s = 5; s <= 45; s++) { const it = bot.inventory.slots[s]; if (it && it.count > 0) out.push({ slot: s, id: fullId(it), count: it.count, type: it.type }) }
  return out
}

// ---------- jendela/chest yang tahan banting ----------
// Mineflayer baru memancarkan windowOpen SETELAH window_items diparse. Paket itu memuat isi chest DAN seluruh inventory
// pemain; bila satu item bermuatan komponen modded gagal parse, paket dibuang dan openContainer menggantung selamanya
// (jendela tetap terbuka di server). Karena itu kita memantau open_window sendiri dan, bila window_items tak datang,
// lanjut dalam mode "degraded": isi chest dibaca dari /data get block, pemindahan lewat shift-click berbasis nomor slot.
const watched = new WeakSet()
function watch (bot) {
  if (watched.has(bot)) return
  watched.add(bot)
  const reset = () => { bot.currentWindow = null }
  bot.on('respawn', reset); bot.on('death', reset); bot.on('end', reset)
}
function rawClose (bot, id) { try { bot._client.write('close_window', { windowId: id }) } catch (e) { /* abaikan */ } }
// Tutup jendela yang tertinggal (mis. dari task sebelumnya yang gagal/mati). -> true bila ada yang ditutup
function ensureClosed (bot) {
  const w = bot.currentWindow
  if (!w) return false
  try { if (typeof w.close === 'function') w.close(); else rawClose(bot, w.id) } catch (e) { rawClose(bot, w.id) }
  bot.currentWindow = null
  return true
}
// Shift-click (mode 1) satu slot jendela: server memindahkan stack itu ke sisi lain. Tak perlu data item di klien.
function quickMove (bot, S, windowSlot) {
  const Item = require('prismarine-item')(bot.registry)
  bot._client.write('window_click', { windowId: S.windowId, stateId: 0, slot: windowSlot, mouseButton: 0, mode: 1, changedSlots: [], cursorItem: Item.toNotch(null) })
}
// slot inventory pemain (9-44 di jendela inventory) -> nomor slot di jendela chest
const invToWindow = (S, s) => S.inventoryStart + (s - 9)
// tunggu sampai nilai read() stabil (paket konfirmasi server bisa lambat saat server lag)
async function settle (read, o = {}) {
  const quiet = o.quietMs || 600; const max = o.maxMs || 3500
  let last = JSON.stringify(read()); let since = Date.now(); const t0 = Date.now()
  while (Date.now() - t0 < max) {
    await U.sleep(100)
    const cur = JSON.stringify(read())
    if (cur !== last) { last = cur; since = Date.now() } else if (Date.now() - since >= quiet) break
  }
}

// Dekati blok (bila jauh) lalu buka jendelanya dengan deteksi mode degraded. -> {ok, S, w, degraded, block, info} | {ok:false, code, error}
async function openWindowAt (bot, ctx, b, info, o = {}) {
  watch(bot)
  ensureClosed(bot)
  const center = b.position.offset(0.5, 0.5, 0.5)
  const dist = bot.entity.position.distanceTo(center)
  info.dist = Math.round(dist * 10) / 10
  if (dist > 4.2) { // sudah dekat -> lewati pathfinder (menghindari menggantung)
    bot.pathfinder.setMovements(ctx.movements('walk'))
    try { await U.approach(bot, b.position, ctx, o.approachMs || 25000) } catch (e) {
      const dy = Math.round((b.position.y - bot.entity.position.y) * 10) / 10
      return { ok: false, code: ctx.signal.aborted ? 'ABORTED' : 'NO_PATH', error: e.message + ' (jarak ' + info.dist + ' blok, selisih y ' + dy + ')', chest: info }
    }
  }
  let got = null; let gotAt = 0; let win = null
  const onOpen = p => { got = p; gotAt = Date.now() }
  const onWin = x => { win = x }
  bot._client.on('open_window', onOpen); bot.on('windowOpen', onWin)
  try {
    Promise.resolve(bot.activateBlock(b)).catch(() => {})
    const t0 = Date.now(); const grace = o.graceMs || Number(process.env.ARCADIA_OPEN_GRACE_MS) || 1500; const total = o.openMs || Number(process.env.ARCADIA_OPEN_MS) || 8000
    while (!win && !ctx.signal.aborted) {
      const now = Date.now()
      if (got && now - gotAt > grace) break
      if (!got && now - t0 > total) break
      await U.sleep(40)
    }
  } finally { bot._client.removeListener('open_window', onOpen); bot.removeListener('windowOpen', onWin) }
  if (ctx.signal.aborted) { ensureClosed(bot); return { ok: false, code: 'ABORTED', error: 'dihentikan', chest: info } }
  if (!win && !got) return { ok: false, code: 'SERVER_REJECTED', error: 'server tidak membuka chest dalam 8 dtk (tidak ada open_window): terlalu jauh, terhalang, atau akses ditolak', chest: info }
  const degraded = !win
  const w = win || bot.currentWindow || { id: got.windowId, inventoryStart: 27 }
  const S = { w, degraded, windowId: degraded ? got.windowId : w.id, inventoryStart: (w && w.inventoryStart != null) ? w.inventoryStart : 27, block: b, info: { ...info, degraded } }
  // JANGAN memakai bot.closeWindow pada jendela degraded: ia menyalin slot jendela (kosong) ke inventory bot.
  S.close = () => { try { if (!degraded && typeof w.close === 'function') w.close(); else rawClose(bot, S.windowId) } catch (e) { rawClose(bot, S.windowId) } bot.currentWindow = null }
  return { ok: true, S, w, degraded, block: b, info: S.info }
}

// Cari chest/barrel (terdekat atau lewat koordinat), lalu buka. Lihat openWindowAt.
async function openChest (bot, ctx, hint, o = {}) {
  watch(bot)
  ensureClosed(bot)
  const f = U.findContainer(bot, ctx.mcData, hint === undefined || hint === null || hint === false ? true : hint, 48)
  if (!f.block) return { ok: false, code: 'TARGET_NOT_FOUND', error: 'tidak ada chest/barrel yang ditemukan' + (f.seen ? ' (blok di koordinat itu: ' + f.seen + ')' : '') + (f.nearest ? '; terdekat di ' + f.nearest.x + ',' + f.nearest.y + ',' + f.nearest.z : '') }
  const b = f.block
  return openWindowAt(bot, ctx, b, { x: b.position.x, y: b.position.y, z: b.position.z, how: f.how, block: b.name }, o)
}

// Ringkas isi jendela chest (hanya bagian container)
function windowItems (w) {
  return w.containerItems().map(i => ({ slot: i.slot, id: fullId(i), count: i.count, type: i.type }))
}
const chestSlots = w => (w.inventoryStart != null ? w.inventoryStart : 27)

// Chest ganda: /data get block hanya membaca setengah
function isDouble (block) {
  try { const p = block.getProperties(); return !!(p && p.type && p.type !== 'single') } catch (e) { return false }
}

// Samakan tampilan inventory bot dengan kebenaran server: pulihkan item polos yang hilang, hapus "hantu" (bot mengira ada,
// server tidak), koreksi jumlah item polos. Item bermuatan komponen tak bisa direkonstruksi -> 'unreadable'.
function reconcile (bot, ctx, svItems, o = {}) {
  const truth = svItems.filter(x => x.slot != null)
  const before = diffSlots(botView(bot), truth)
  const hydrated = []; const unreadable = []; const removed = []; const fixed = []
  if (o.hydrate !== false) {
    const Item = require('prismarine-item')(bot.registry)
    const make = x => {
      const sh = shortId(x.id)
      const type = ctx.mcData.itemsByName[sh] ? ctx.mcData.itemsByName[sh].id : names.idOf(x.id)
      return type == null ? null : new Item(type, x.count, null, null)
    }
    for (const m of before.missing) {
      const x = truth.find(y => y.slot === m.slot); if (!x) continue
      if (x.comps.length) { unreadable.push({ slot: x.slot, id: x.id, count: x.count, comps: x.comps.slice(0, 6) }); continue }
      const it = make(x)
      if (!it) { unreadable.push({ slot: x.slot, id: x.id, count: x.count, why: 'id numerik tidak diketahui' }); continue }
      try { bot.inventory.updateSlot(x.slot, it); hydrated.push({ slot: x.slot, id: x.id, count: x.count }) } catch (e) { unreadable.push({ slot: x.slot, id: x.id, count: x.count, why: e.message.slice(0, 60) }) }
    }
    for (const g of before.extra) { try { bot.inventory.updateSlot(g.slot, null); removed.push(g) } catch (e) { /* abaikan */ } }
    for (const c of before.countDiff) {
      const x = truth.find(y => y.slot === c.slot); if (!x || x.comps.length) continue
      const it = make(x); if (!it) continue
      try { bot.inventory.updateSlot(x.slot, it); fixed.push({ slot: x.slot, id: x.id, bot: c.bot, server: x.count }) } catch (e) { /* abaikan */ }
    }
  }
  const view = hydrated.length || removed.length || fixed.length ? botView(bot) : botView(bot)
  const d = diffSlots(view, truth)
  return { before, view, d, hydrated, unreadable, removed, fixed }
}

// Ambil kebenaran server lalu samakan tampilan bot; perbarui bot.arcadia.inventoryTruth (dipakai BotState). Dipanggil setelah
// store/take/craft agar catatan tidak tertinggal. -> {ok, ...hasil reconcile} | SkillResult gagal (mis. bot bukan op)
async function refreshInventory (bot, ctx, o = {}) {
  const sv = await serverInventory(bot, { timeoutMs: o.timeoutMs, signal: ctx.signal })
  if (!sv.ok) return sv
  const r = reconcile(bot, ctx, sv.items, o)
  const unmapped = sv.items.filter(x => x.slot == null)
  bot.arcadia = bot.arcadia || {}
  bot.arcadia.inventoryTruth = { ts: Date.now(), accurate: true, matched: accurate(r.d) && !unmapped.length, totals: totalsOf(sv.items), items: sv.items.map(x => ({ slot: x.slot, id: x.id, count: x.count })) }
  return { ok: true, items: sv.items, unmapped, ...r }
}

// Setelah transfer: samakan catatan inventory (BotState) dengan server supaya item yang sudah keluar/masuk tercatat.
async function attachRefresh (bot, ctx, p, res) {
  await U.sleep(300)
  const rf = await refreshInventory(bot, ctx, { timeoutMs: p.waitMs || 6000 })
  res.data.inventoryRefreshed = !!rf.ok
  if (rf.ok) { const n = rf.hydrated.length + rf.removed.length + rf.fixed.length; if (n) res.data.inventorySync = { hydrated: rf.hydrated.length, removed: rf.removed.length, fixed: rf.fixed.length } } else res.data.inventoryRefreshNote = String(rf.error || rf.code).slice(0, 120)
}

const KEEP = /(_pickaxe|_axe|_shovel|_hoe|_sword)$|^(bow|crossbow|shield|fishing_rod|shears|flint_and_steel|bucket|water_bucket|lava_bucket|trident|elytra|totem_of_undying|torch|ender_pearl)$/
const isKeepTool = key => KEEP.test(String(key).replace(/^minecraft:/, ''))

const toList = v => v == null ? [] : Array.isArray(v) ? v.map(String) : String(v).split(/[\s,]+/).filter(Boolean)

module.exports = { attachRefresh, reconcile, refreshInventory, openWindowAt, shortId, watch, ensureClosed, quickMove, invToWindow, settle, rawClose, fullId, isModdedId, chatQuery, queryError, serverInventory, serverChest, diffSlots, accurate, totalsOf, botView, openChest, windowItems, chestSlots, isDouble, isKeepTool, toList, dataPath, saveRaw }
