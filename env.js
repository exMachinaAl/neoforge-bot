// Konfigurasi portable Node.js; nilai environment yang sudah ada tetap menang.
const fs = require('fs')
const path = require('path')
function loadProjectEnv (file = process.env.ARCADIA_ENV_FILE || path.join(__dirname, '.env')) {
  const resolved = path.resolve(file)
  if (!fs.existsSync(resolved)) {
    if (process.env.ARCADIA_ENV_FILE) throw Error('ARCADIA_ENV_FILE menunjuk file yang tidak ditemukan')
    return false
  }
  if (typeof process.loadEnvFile !== 'function') throw Error('Gunakan Node.js 22 atau lebih baru untuk konfigurasi .env proyek')
  if (fs.statSync(resolved).size > 65536) throw Error('File konfigurasi .env terlalu besar')
  process.loadEnvFile(resolved)
  return true
}
module.exports = { loadProjectEnv }
