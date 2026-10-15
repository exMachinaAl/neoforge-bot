// mapview.mjs - dekode peta 2D dan koordinat (murni, tanpa DOM). Format: lihat control/map.js
export function decodeMap (snap) {
  const rows = snap.rows.map((r, z) => Array.from(r).map((ch, x) => ({ name: snap.legend[ch] || '?', y: snap.baseY + parseInt(snap.hs[z][x], 36) })))
  return { r: snap.r, size: 2 * snap.r + 1, rows }
}
export const worldOf = (snap, col, row) => ({ x: snap.center.x - snap.r + col, z: snap.center.z - snap.r + row })
export const cellOf = (snap, x, z) => ({ col: Math.floor(x) - (snap.center.x - snap.r), row: Math.floor(z) - (snap.center.z - snap.r) })
const COLORS = { grass_block: '#4f8f3a', dirt: '#7a5a3a', stone: '#808080', cobblestone: '#6b6b6b', sand: '#d9cd8f', water: '#3b6fd6', lava: '#e8571a', snow: '#f4f8ff', gravel: '#8d8a87', oak_log: '#6b4e2a', oak_leaves: '#2f6b2a', farmland: '#5b3c1e', 'belum dimuat': '#0c0e13', 'modded/tak dikenal': '#b05fd0' }
export function colorOf (name) {
  if (COLORS[name]) return COLORS[name]
  if (/leaves/.test(name)) return '#2f6b2a'; if (/log|planks/.test(name)) return '#6b4e2a'; if (/sand/.test(name)) return '#d9cd8f'; if (/ore|deepslate|stone|tuff/.test(name)) return '#707070'
  let hsh = 0; for (const c of String(name)) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0
  return 'hsl(' + (hsh % 360) + ',35%,45%)'
}
export const shade = (color, dy) => dy === 0 ? color : 'color-mix(in srgb, ' + color + ' ' + Math.max(55, Math.min(100, 85 + dy * 3)) + '%, ' + (dy > 0 ? 'white' : 'black') + ')'
