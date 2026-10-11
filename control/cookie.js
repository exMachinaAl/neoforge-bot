// control/cookie.js - token dari header / ?token / cookie. Nama cookie per PORT (cookie hanya terisolasi per host, bukan per port).
const cookieName = port => 'arcadia_' + Number(port)
function parseCookies (header) {
  const out = {}
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('='); if (i < 1) continue
    const k = part.slice(0, i).trim(); const v = part.slice(i + 1).trim()
    try { out[k] = decodeURIComponent(v) } catch (e) { /* abaikan cookie rusak */ }
  }
  return out
}
// urutan: header Authorization (API) > ?token= (halaman pertama / SSE) > cookie milik port ini. Mengembalikan {token, via}
function tokenFromRequest (req, url, port) {
  const h = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (h) return { token: h, via: 'header' }
  const q = url && url.searchParams ? url.searchParams.get('token') : null
  if (q) return { token: q, via: 'query' }
  const c = parseCookies(req.headers.cookie)[cookieName(port)]
  return c ? { token: c, via: 'cookie' } : { token: '', via: null }
}
const setCookieHeader = (port, token, maxAge = 86400) => cookieName(port) + '=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + maxAge
module.exports = { cookieName, parseCookies, tokenFromRequest, setCookieHeader }
