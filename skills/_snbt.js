// skills/_snbt.js - parser SNBT (teks NBT Minecraft) untuk keluaran /data get ... dan pemetaan slot inventory.
// Toleran terhadap spasi/baris baru, kunci tanpa tanda kutip, string ber-kutip ' atau ", array bertipe [B; ..] [I; ..] [L; ..].
// Angka dikembalikan sebagai Number (long di luar rentang aman -> string digit). Boolean true/false -> boolean.

const MAX_DEPTH = 64
const MAX_LEN = 2 * 1024 * 1024
const NUM = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?[bBsSlLfFdD]?$/

function parse (src) {
  const s = String(src)
  if (s.length > MAX_LEN) throw new Error('SNBT terlalu besar: ' + s.length)
  let i = 0
  const fail = m => { throw new Error('SNBT: ' + m + ' @' + i + ' ...' + JSON.stringify(s.slice(Math.max(0, i - 12), i + 12))) }
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++ }

  function str (q) {
    i++ // kutip pembuka
    let o = ''
    while (i < s.length) {
      const c = s[i]
      if (c === '\\') {
        const n = s[i + 1]
        if (n === undefined) fail('escape terpotong')
        o += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n
        i += 2; continue
      }
      if (c === q) { i++; return o }
      o += c; i++
    }
    return fail('string tidak ditutup')
  }

  function bareToken () {
    const st = i
    while (i < s.length && !/[,\]}\s]/.test(s[i])) i++
    return s.slice(st, i)
  }

  function num (t) {
    const isFloat = /[.eE]/.test(t) || /[fFdD]$/.test(t)
    const body = t.replace(/[bBsSlLfFdD]$/, '')
    const n = Number(body)
    if (!Number.isFinite(n)) return t
    if (!isFloat && !Number.isSafeInteger(n)) return body.replace(/^\+/, '')
    return n
  }

  function scalar (t) {
    if (t === 'true') return true
    if (t === 'false') return false
    if (NUM.test(t)) return num(t)
    return t
  }

  function value (d) {
    if (d > MAX_DEPTH) fail('terlalu dalam')
    ws()
    const c = s[i]
    if (c === undefined) fail('data berakhir')
    if (c === '{') return compound(d)
    if (c === '[') return list(d)
    if (c === '"' || c === "'") return str(c)
    const t = bareToken()
    if (!t) fail('token kosong')
    return scalar(t)
  }

  function key () {
    ws()
    const c = s[i]
    if (c === '"' || c === "'") return str(c)
    const st = i
    while (i < s.length && /[A-Za-z0-9_\-.+]/.test(s[i])) i++
    if (i === st) fail('kunci kosong')
    return s.slice(st, i)
  }

  function compound (d) {
    i++ // {
    const o = {}
    ws()
    if (s[i] === '}') { i++; return o }
    for (;;) {
      const k = key()
      ws()
      if (s[i] !== ':') fail("diharapkan ':'")
      i++
      o[k] = value(d + 1)
      ws()
      if (s[i] === ',') { i++; ws(); if (s[i] === '}') { i++; return o }; continue }
      if (s[i] === '}') { i++; return o }
      fail("diharapkan ',' atau '}'")
    }
  }

  function list (d) {
    i++ // [
    ws()
    // array bertipe: [B; 1b, 2b] [I; 1, 2] [L; 1L]
    const m = /^[BIL]\s*;/.exec(s.slice(i, i + 8))
    if (m) i += m[0].length
    const a = []
    ws()
    if (s[i] === ']') { i++; return a }
    for (;;) {
      a.push(value(d + 1))
      ws()
      if (s[i] === ',') { i++; ws(); if (s[i] === ']') { i++; return a }; continue }
      if (s[i] === ']') { i++; return a }
      fail("diharapkan ',' atau ']'")
    }
  }

  const v = value(0)
  ws()
  return v
}

// Ambil SNBT dari baris keluaran perintah: "BotAlpha has the following entity data: [ ... ]"
function extract (text) {
  const t = String(text)
  const k = t.search(/[[{]/)
  if (k < 0) throw new Error('SNBT: tidak ada [ atau { di teks')
  return parse(t.slice(k))
}

// Slot NBT inventory pemain -> indeks slot jendela inventory mineflayer (46 slot)
//  NBT 0-8 hotbar -> 36-44 | 9-35 -> 9-35 | 100 kaki,101 celana,102 baju,103 helm -> 8,7,6,5 | -106 tangan kiri -> 45
function nbtSlotToMc (n) {
  if (!Number.isInteger(n)) return null
  if (n >= 0 && n <= 8) return 36 + n
  if (n >= 9 && n <= 35) return n
  if (n >= 100 && n <= 103) return 8 - (n - 100)
  if (n === -106) return 45
  return null
}

// Daftar item dari /data get entity <pemain> Inventory -> [{slot, nbtSlot, id, count, comps:[kunci komponen]}]
function inventoryItems (list) {
  if (!Array.isArray(list)) throw new Error('SNBT: inventory bukan list')
  return list.map(e => {
    const nbtSlot = Number(e.Slot)
    const comps = e.components && typeof e.components === 'object' ? Object.keys(e.components) : []
    return { slot: nbtSlotToMc(nbtSlot), nbtSlot, id: String(e.id), count: Number(e.count === undefined ? 1 : e.count), comps }
  })
}

// Isi chest dari /data get block x y z Items -> [{slot, id, count, comps}] (Slot chest = indeks slot jendela)
function containerItems (list) {
  if (!Array.isArray(list)) throw new Error('SNBT: Items bukan list')
  return list.map(e => ({ slot: Number(e.Slot), id: String(e.id), count: Number(e.count === undefined ? 1 : e.count), comps: e.components && typeof e.components === 'object' ? Object.keys(e.components) : [] }))
}

module.exports = { parse, extract, nbtSlotToMc, inventoryItems, containerItems }
