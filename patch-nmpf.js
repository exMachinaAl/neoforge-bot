// Menambah tipe argumen command modded (tanpa properti) ke plugin NeoForge.
// Jalankan lagi setiap selesai "npm install":  node patch-nmpf.js
const fs = require('fs')
const file = require.resolve('minecraft-protocol-forge/src/client/commandRegistry.js')

// Tambahkan nama tipe lain di sini kalau muncul error serupa.
// Hanya untuk tipe yang didaftarkan dengan SingletonArgumentInfo (tanpa properti).
const extra = ['touhou_little_maid:handle_types']

let src = fs.readFileSync(file, 'utf8')
const anchor = "'minecraft:test_class': 'void'"
if (!src.includes(anchor)) throw new Error('anchor tidak ditemukan, versi plugin berbeda')
let changed = 0
for (const name of extra) {
  if (src.includes(`'${name}': 'void'`)) continue
  src = src.replace(anchor, `${anchor},\n    '${name}': 'void'`)
  changed++
}
fs.writeFileSync(file, src)
console.log(changed ? `patched ${changed} entri` : 'sudah ter-patch')