// patch-nmpf.js
const fs = require('fs')
const path = require('path')
const file = require.resolve('minecraft-protocol-forge/src/client/commandRegistry.js')
let extra = []
try { extra = JSON.parse(fs.readFileSync(path.join(__dirname, 'argtypes.json'), 'utf8')) } catch {}
extra = [...new Set(['touhou_little_maid:handle_types', ...extra])]
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