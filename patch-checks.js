const fs = require('fs')
const file = require.resolve('minecraft-protocol-forge/src/client/neoforgeChecks.js')
let src = fs.readFileSync(file, 'utf8')
const edits = [
  ["entry => entry.extension || !", "entry => /*patched*/ !"],
  ["if (flags.length) throw new Error('Unsupported NeoForge modded feature flags')", "/*patched: flags diterima*/"]
]
let n = 0
for (const [from, to] of edits) {
  if (src.includes(from)) { src = src.replace(from, to); n++ }
  else if (!src.includes(to)) throw new Error('anchor tidak ditemukan: ' + from)
}
fs.writeFileSync(file, src)
console.log(n ? `patched ${n} bagian` : 'sudah ter-patch')
