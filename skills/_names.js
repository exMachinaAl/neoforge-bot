// skills/_names.js - nama item modded.
// Sumber utama: registri minecraft:item dari sinkronisasi NeoForge (bot.js memanggil load(r.ids)).
// Cadangan: pemetaan hasil inv.snapshot (itemmap.json) bila registri tidak disinkronkan.
const fs = require('fs')
const path = require('path')

const byId = new Map() // id numerik -> 'ns:path'
const learned = new Map() // dari snapshot
let registryLoaded = 0

const mapFile = () => path.join(process.env.ARCADIA_DATA_DIR || '.', process.env.ARCADIA_ITEMMAP || 'itemmap.json')

function load (ids) {
  byId.clear()
  for (const e of ids || []) if (e && Number.isInteger(e.value) && typeof e.key === 'string') byId.set(e.value, e.key)
  registryLoaded = byId.size
  return registryLoaded
}

function loadFile () {
  try {
    const j = JSON.parse(fs.readFileSync(mapFile(), 'utf8'))
    for (const [k, v] of Object.entries(j)) if (typeof v === 'string') learned.set(Number(k), v)
  } catch (e) { /* belum ada */ }
  return learned.size
}

function learn (type, fullName) {
  if (!Number.isInteger(type) || typeof fullName !== 'string' || byId.has(type)) return false
  if (learned.get(type) === fullName) return false
  learned.set(type, fullName); return true
}

function save () {
  try { fs.writeFileSync(mapFile(), JSON.stringify(Object.fromEntries([...learned.entries()].sort((a, b) => a[0] - b[0])), null, 1) + '\n') } catch (e) { /* abaikan */ }
}

// 'ns:path' lengkap, atau undefined bila tidak diketahui
const nameOf = type => byId.get(type) || learned.get(type)
// id numerik dari nama lengkap (untuk item modded), atau undefined
function idOf (fullName) {
  for (const [id, n] of byId) if (n === fullName) return id
  for (const [id, n] of learned) if (n === fullName) return id
  return undefined
}
const stats = () => ({ registry: registryLoaded, learned: learned.size })

loadFile()
module.exports = { load, loadFile, learn, save, nameOf, idOf, stats }
