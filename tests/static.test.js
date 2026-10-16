// tests/static.test.js - control/static.js + control/cookie.js (UI-3a). Termasuk uji mutasi: tiap penjaga dimatikan -> tes harus gagal.
const http = require('http'); const fs = require('fs'); const os = require('os'); const path = require('path'); const Module = require('module')
const cookie = require('../control/cookie')
const STATIC = path.join(__dirname, '..', 'control', 'static.js'); const COOKIE = path.join(__dirname, '..', 'control', 'cookie.js')
let pass = 0; let fail = 0
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m) }

function fixture () {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arcadia-ui-')); const ui = path.join(root, 'ui'); fs.mkdirSync(path.join(ui, 'sub'), { recursive: true })
  fs.writeFileSync(path.join(root, 'secret.txt'), 'TOPSECRET')
  fs.writeFileSync(path.join(ui, 'index.html'), '<!doctype html><title>x</title>'); fs.writeFileSync(path.join(ui, 'app.js'), 'export const a = 1')
  fs.writeFileSync(path.join(ui, 'style.css'), 'body{}'); fs.writeFileSync(path.join(ui, 'sub', 'ok.js'), 'export {}')
  fs.writeFileSync(path.join(ui, '.hidden.js'), 'HIDDEN'); fs.writeFileSync(path.join(ui, 'data.txt'), 'DATA'); fs.writeFileSync(path.join(ui, 'big.js'), Buffer.alloc(600 * 1024, 97))
  // junction-fixture-v1: junction direktori tidak butuh hak symlink di Windows.
  const outside = path.join(root, 'outside'); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'secret.js'), 'TOPSECRET')
  let link = true; try { fs.symlinkSync(outside, path.join(ui, 'leak'), process.platform === 'win32' ? 'junction' : 'dir') } catch (e) { link = false }
  return { root, ui, link }
}
const load = (file, code) => { const m = new Module(file, module); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(code, file); return m.exports }
const rawReq = (port, p, method = 'GET') => new Promise((resolve, reject) => { const r = http.request({ host: '127.0.0.1', port, path: p, method }, res => { const ch = []; res.on('data', c => ch.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(ch).toString() })) }); r.on('error', reject); r.end() })

// menjalankan semua kasus statis terhadap implementasi createStatic tertentu; mengembalikan jumlah kegagalan
async function suiteStatic (createStatic, fx, quiet) {
  let bad = 0; const t = (c, m) => { if (!c) bad++; if (!quiet) ok(c, m) }
  const st = createStatic({ root: fx.ui, prefix: '/ui/', maxBytes: 512 * 1024 })
  const srv = http.createServer((req, res) => { try { const u = new URL(req.url, 'http://x'); if (!st.handle(req, res, u.pathname)) { res.writeHead(404); res.end('lain') } } catch (e) { if (!res.headersSent) res.writeHead(500); res.end('galat') } })
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port; const g = (p, m) => rawReq(port, p, m)
  let r = await g('/ui/index.html'); t(r.status === 200 && /text\/html/.test(r.headers['content-type']) && r.headers['x-content-type-options'] === 'nosniff' && /default-src 'self'/.test(r.headers['content-security-policy']) && /frame-src http:\/\/127\.0\.0\.1:\*/.test(r.headers['content-security-policy']) && r.headers['cache-control'] === 'no-store', 'index.html: 200, tipe html, nosniff, CSP, no-store')
  r = await g('/ui/app.js'); const r2 = await g('/ui/style.css'); t(/text\/javascript/.test(r.headers['content-type']) && /text\/css/.test(r2.headers['content-type']), 'js dan css bertipe benar')
  r = await g('/ui/sub/ok.js'); t(r.status === 200, 'subfolder diizinkan')
  r = await g('/ui/..%2f..%2fsecret.txt'); t(r.status === 404 && !/TOPSECRET/.test(r.body), 'traversal ..%2f ditolak, rahasia tidak bocor')
  r = await g('/ui/%2e%2e/secret.txt'); t(!/TOPSECRET/.test(r.body) && r.status === 404, 'titik-ganda ter-encode dinormalkan URL dan tidak bocor')
  r = await g('/ui/..%5csecret.txt'); t(r.status === 400, 'backslash -> 400')
  r = await g('/ui/index.html%00.js'); t(r.status === 400, 'byte null -> 400')
  r = await g('/ui/.hidden.js'); t(r.status === 404 && !/HIDDEN/.test(r.body), 'berkas titik (dotfile) ditolak')
  r = await g('/ui/data.txt'); t(r.status === 404 && !/DATA/.test(r.body), 'ekstensi di luar daftar putih ditolak')
  r = await g('/ui/index.html', 'POST'); t(r.status === 405, 'POST -> 405')
  r = await g('/ui/index.html', 'HEAD'); t(r.status === 200 && r.body === '' && Number(r.headers['content-length']) > 0, 'HEAD: header ada, badan kosong')
  r = await g('/ui/sub'); const r3 = await g('/ui/sub/'); t(r.status === 404 && r3.status === 404, 'direktori (dengan/tanpa garis miring) -> 404')
  r = await g('/ui/nope.js'); t(r.status === 404, 'berkas tak ada -> 404')
  r = await g('/api/x'); t(r.status === 404 && r.body === 'lain', 'awalan lain tidak ditangani modul statis')
  r = await g('/ui/big.js'); t(r.status === 413, 'berkas melebihi batas ukuran -> 413')
  if (fx.link) { r = await g('/ui/leak/secret.js'); t(r.status === 404 && !/TOPSECRET/.test(r.body), 'symlink keluar akar ditolak') }
  await new Promise(r => srv.close(r)); return bad
}

;(async () => {
  const fx = fixture()
  const real = require('../control/static.js')
  console.log('--- statis (asli)')
  const badReal = await suiteStatic(real.createStatic, fx, false)
  console.log('--- cookie')
  const req = (h) => ({ headers: h }); const U = q => new URL('http://x/' + q)
  ok(cookie.tokenFromRequest(req({ authorization: 'Bearer AAA', cookie: 'arcadia_8787=CCC' }), U('?token=BBB'), 8787).token === 'AAA', 'header mengalahkan query dan cookie')
  ok(cookie.tokenFromRequest(req({}), U('?token=BBB'), 8787).via === 'query', 'query dipakai bila tak ada header')
  ok(cookie.tokenFromRequest(req({ cookie: 'x=1; arcadia_8787=CCC' }), U(''), 8787).token === 'CCC', 'cookie milik port ini dipakai')
  ok(cookie.tokenFromRequest(req({ cookie: 'arcadia_9999=ZZZ' }), U(''), 8787).via === null, 'cookie port LAIN diabaikan (isolasi per port)')
  ok(cookie.tokenFromRequest(req({ cookie: 'arcadia_8787=%E0%A4%A' }), U(''), 8787).via === null && cookie.tokenFromRequest(req({}), U(''), 8787).token === '', 'cookie rusak / tanpa token -> kosong, tanpa error')
  const sc = cookie.setCookieHeader(8787, 'tok en/1'); ok(/^arcadia_8787=tok%20en%2F1; /.test(sc) && /HttpOnly/.test(sc) && /SameSite=Strict/.test(sc) && /Path=\//.test(sc) && /Max-Age=\d+/.test(sc) && !/Secure/.test(sc), 'Set-Cookie: HttpOnly, SameSite=Strict, Path=/, Max-Age (tanpa Secure: http lokal)')
  ok(cookie.tokenFromRequest(req({ cookie: sc.split(';')[0] }), U(''), 8787).token === 'tok en/1', 'token berkarakter khusus lolos pulang-pergi')
  // ---- uji mutasi
  console.log('--- mutasi (matikan satu penjaga -> harus ada tes gagal)')
  const src = fs.readFileSync(STATIC, 'utf8')
  for (const g of ['BADCHARS', 'TRAVERSAL', 'EXT', 'METHOD', 'SIZE', 'SYMLINK']) {
    if (g === 'SYMLINK' && !fx.link) { console.log('SKIP symlink: sistem tidak mendukung fixture'); continue }
    const mutated = src.split('\n').map(l => l.includes('// GUARD:' + g) ? l.replace(/^(\s*)if .*?(\/\/ GUARD:)/, '$1$2') : l).join('\n')
    ok(mutated !== src, 'mutan ' + g + ' dibuat (baris penjaga ditemukan)')
    let bad = -1; try { bad = await suiteStatic(load(STATIC, mutated).createStatic, fx, true) } catch (e) { bad = 99 }
    ok(bad > 0, 'tanpa penjaga ' + g + ': ' + bad + ' tes gagal (harus > 0)')
  }
  const csrc = fs.readFileSync(COOKIE, 'utf8'); const cm = load(COOKIE, csrc.replace("'arcadia_' + Number(port)", "'arcadia'"))
  ok(cm.tokenFromRequest(req({ cookie: 'arcadia=ZZZ' }), U(''), 8787).via === 'cookie' && cm.tokenFromRequest(req({ cookie: 'arcadia=ZZZ' }), U(''), 9999).via === 'cookie', 'mutan nama-cookie-tanpa-port: isolasi port jebol (dibuktikan oleh tes isolasi)')
  ok(badReal === 0, 'implementasi asli: semua tes statis lulus')
  console.log('\nHASIL: ' + pass + ' lulus, ' + fail + ' gagal'); process.exit(fail ? 1 : 0)
})().catch(e => { console.error('CRASH', e); process.exit(2) })
