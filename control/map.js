// control/map.js - peta 2D (eagle view): grid persegi 2r+1, blok permukaan per sel. Milik kita (bukan add-on). Batas ukuran ~20 KB, batas waktu per tarikan.
const { Vec3 } = require('vec3')
const AIR = new Set(['air', 'cave_air', 'void_air'])
const ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz'

function buildMap (bot, { r = 24, budgetMs = 150, now = Date.now, maxEntities = 64 } = {}) {
  r = Math.min(32, Math.max(4, parseInt(r, 10) || 24))
  const p = bot.entity.position; const cx = Math.floor(p.x); const cz = Math.floor(p.z); const cy = Math.floor(p.y)
  const baseY = cy - 17; const top = cy + 14; const bottom = cy - 20
  const legend = { ' ': 'belum dimuat', '?': 'modded/tak dikenal' }; const codes = {}; let next = 0
  const code = name => { if (name === '') return '?'; if (codes[name]) return codes[name]; const c = ALPHA[next++] || '#'; codes[name] = c; legend[c] = name; return c }
  const t0 = now(); let partial = false; const rows = []; const hs = []
  for (let z = cz - r; z <= cz + r; z++) {
    let row = ''; let hrow = ''
    if (partial || now() - t0 > budgetMs) { partial = true; rows.push(' '.repeat(2 * r + 1)); hs.push('0'.repeat(2 * r + 1)); continue }
    let hint = cy
    for (let x = cx - r; x <= cx + r; x++) {
      let y = Math.min(top, hint + 2); let found = null; let unloaded = false
      while (y < top) { const b = bot.blockAt(new Vec3(x, y, z)); if (b && !AIR.has(b.name)) y++; else break }
      for (; y >= bottom; y--) { const b = bot.blockAt(new Vec3(x, y, z)); if (!b) { unloaded = true; break } if (!AIR.has(b.name)) { found = { b, y }; break } }
      if (found) { row += code(found.b.name); hrow += B36[Math.min(35, Math.max(0, found.y - baseY))]; hint = found.y } else { row += ' '; hrow += '0'; void unloaded }
    }
    rows.push(row); hs.push(hrow)
  }
  const entities = []
  for (const e of Object.values(bot.entities || {})) {
    if (entities.length >= maxEntities) break
    if (!e || e === bot.entity || !e.position) continue
    if (Math.abs(e.position.x - p.x) > r || Math.abs(e.position.z - p.z) > r) continue
    entities.push({ id: e.id, kind: String(e.name || e.type || '?').slice(0, 24), x: +e.position.x.toFixed(1), y: +e.position.y.toFixed(1), z: +e.position.z.toFixed(1) })
  }
  return { v: 1, r, center: { x: cx, y: cy, z: cz }, baseY, legend, rows, hs, entities, self: { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1), yaw: +(bot.entity.yaw || 0).toFixed(2) }, partial, ts: Date.now() }
}
module.exports = { buildMap }
