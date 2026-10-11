// control/viewer3d.js - viewer 3D OPSIONAL (prismarine-viewer, pihak lain). Mati secara bawaan: ARCADIA_VIEWER=1 + paket terpasang (npm i prismarine-viewer; ~370 MB).
// Temuan spike (dari kode paket): lib/mineflayer.js memanggil http.listen(port) tanpa host = semua interface; di sini dipaksa 127.0.0.1 selama pemanggilan.
const http = require('http')
function withLoopbackListen (fn) {
  const orig = http.Server.prototype.listen
  http.Server.prototype.listen = function (...a) { if (typeof a[0] === 'number' && (a.length === 1 || typeof a[1] === 'function')) return orig.call(this, a[0], '127.0.0.1', ...a.slice(1)); return orig.apply(this, a) }
  try { return fn() } finally { http.Server.prototype.listen = orig }
}
function startViewer3d (bot, env = process.env, load = () => require('prismarine-viewer')) {
  if (env.ARCADIA_VIEWER !== '1') return { enabled: false, reason: 'mati (set ARCADIA_VIEWER=1)' }
  let pv; try { pv = load() } catch (e) { return { enabled: false, reason: 'paket prismarine-viewer tidak terpasang (npm i prismarine-viewer; ~370 MB)' } }
  const port = Number(env.ARCADIA_VIEWER_PORT) || 3007
  try { withLoopbackListen(() => (pv.mineflayer || pv)(bot, { port, firstPerson: false })) } catch (e) { return { enabled: false, reason: 'gagal memulai: ' + e.message } }
  return { enabled: true, url: 'http://127.0.0.1:' + port, bind: '127.0.0.1', note: 'tanpa autentikasi; hanya loopback' }
}
module.exports = { startViewer3d, withLoopbackListen }
