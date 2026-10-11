// control/static.js - rute statis aman untuk UI modular: GET|HEAD <prefix><berkas>. Autentikasi dilakukan PEMANGGIL (token/cookie) sebelum handle().
// Penjaga bertanda "// GUARD:" diuji mutasi di tests/static.test.js (matikan satu penjaga -> tes harus gagal).
const fs = require('fs')
const path = require('path')
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' }
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"

function createStatic ({ root, prefix = '/ui/', maxBytes = 512 * 1024 }) {
  const base = path.resolve(root)
  // mengembalikan null (bukan rute ini) | {status} | {full, ext, size}
  function resolve (pathname) {
    if (!pathname.startsWith(prefix)) return null
    let rel
    try { rel = decodeURIComponent(pathname.slice(prefix.length)) } catch (e) { return { status: 400 } }
    if (!rel || rel.includes('\0') || rel.includes('\\')) return { status: 400 } // GUARD:BADCHARS
    if (rel.split('/').some(seg => seg === '' || seg.startsWith('.'))) return { status: 404 } // GUARD:TRAVERSAL
    const ext = path.extname(rel).toLowerCase()
    if (!TYPES[ext]) return { status: 404 } // GUARD:EXT
    const full = path.resolve(base, rel)
    if (!full.startsWith(base + path.sep)) return { status: 404 } // GUARD:ROOT
    let st; try { st = fs.statSync(full) } catch (e) { return { status: 404 } }
    if (!st.isFile()) return { status: 404 }
    if (st.size > maxBytes) return { status: 413 } // GUARD:SIZE
    let real; try { real = fs.realpathSync(full) } catch (e) { return { status: 404 } }
    if (!real.startsWith(fs.realpathSync(base) + path.sep)) return { status: 404 } // GUARD:SYMLINK
    return { full: real, ext, size: st.size }
  }
  // true bila permintaan ditangani di sini
  function handle (req, res, pathname) {
    const r = resolve(pathname); if (!r) return false
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }); res.end(); return true } // GUARD:METHOD
    if (r.status) { res.writeHead(r.status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); res.end(String(r.status)); return true }
    res.writeHead(200, { 'content-type': TYPES[r.ext] || 'application/octet-stream', 'content-length': r.size, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': CSP })
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(r.full).pipe(res)
    return true
  }
  return { handle, resolve, prefix }
}
module.exports = { createStatic, TYPES }
