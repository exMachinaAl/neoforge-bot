// dom.mjs - pembuat elemen yang AMAN: semua string dinamis menjadi simpul teks (tidak pernah HTML).
const BAN = /^(innerhtml|outerhtml|srcdoc)$/i
export function h (tag, attrs, ...kids) {
  const el = document.createElement(tag)
  for (const k of Object.keys(attrs || {})) {
    const v = attrs[k]; if (v == null || v === false) continue
    if (BAN.test(k)) throw new Error('atribut dilarang: ' + k)
    if (k === 'className') el.className = String(v)
    else if (k === 'style') el.style.cssText = String(v)
    else if (/^on/i.test(k)) { if (typeof v !== 'function') throw new Error('handler harus fungsi: ' + k); el[k.toLowerCase()] = v }
    else if (/^(href|src|action|formaction)$/i.test(k) && /^\s*(javascript|data|vbscript):/i.test(String(v))) throw new Error('URL dilarang di ' + k)
    else el.setAttribute(k, String(v === true ? '' : v))
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(typeof c === 'object' && c.nodeType ? c : document.createTextNode(String(c)))
  return el
}
export function clear (el) { while (el.firstChild) el.removeChild(el.firstChild); return el }
export const fmtMs = ms => ms == null ? '-' : ms < 1000 ? ms + 'ms' : ms < 60000 ? (ms / 1000).toFixed(1) + 's' : Math.round(ms / 60000) + 'm'
export const short = (v, n = 90) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? '' : s.length > n ? s.slice(0, n) + '…' : s }
