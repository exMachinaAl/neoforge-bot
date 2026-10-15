// mapcard.mjs - peta 2D pada canvas; ketuk sel -> tawarkan nav.goto. Menggambar hanya saat terlihat.
import { h } from './dom.mjs'
import { decodeMap, worldOf, colorOf, shade } from './mapview.mjs'
export function mapCard (api, getId, goTo) {
  const cv = h('canvas', { width: 330, height: 330 }); const info = h('div', { className: 'mut' }); const rsel = h('select', {}, [16, 24, 32].map(r => h('option', { value: r }, 'r=' + r))); rsel.value = '24'
  let snap = null; let dec = null; const ctx = cv.getContext && cv.getContext('2d')
  function draw () {
    if (!snap || !ctx) return; const n = dec.size; const px = Math.floor(cv.width / n); cv.width = cv.height = px * n
    dec.rows.forEach((row, z) => row.forEach((c, x) => { ctx.fillStyle = shade(colorOf(c.name), c.y - snap.center.y); ctx.fillRect(x * px, z * px, px, px) }))
    for (const e of snap.entities) { const cx = (e.x - (snap.center.x - snap.r)) * px; const cz = (e.z - (snap.center.z - snap.r)) * px; ctx.fillStyle = /zombie|skeleton|creeper|spider/.test(e.kind) ? '#ff5252' : '#ffe082'; ctx.fillRect(cx - 2, cz - 2, 4, 4) }
    const sx = (snap.self.x - (snap.center.x - snap.r)) * px; const sz = (snap.self.z - (snap.center.z - snap.r)) * px; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sz, Math.max(3, px / 2), 0, 7); ctx.fill()
    info.textContent = 'pusat ' + snap.center.x + ',' + snap.center.z + ' · ' + snap.entities.length + ' entitas' + (snap.partial ? ' · SEBAGIAN (waktu habis)' : '')
  }
  async function refresh () { try { snap = await api.map(getId(), rsel.value); dec = decodeMap(snap); draw() } catch (e) { info.textContent = 'peta gagal: ' + e.message } }
  cv.onclick = ev => { if (!snap) return; const b = cv.getBoundingClientRect(); const col = Math.floor((ev.clientX - b.left) / b.width * dec.size); const row = Math.floor((ev.clientY - b.top) / b.height * dec.size); const w = worldOf(snap, col, row); goTo(w.x, w.z, dec.rows[row][col].name) }
  rsel.onchange = refresh
  return { el: h('div', {}, h('div', { className: 'row' }, rsel, h('button', { onclick: refresh }, 'Segarkan'), info), cv), refresh }
}
