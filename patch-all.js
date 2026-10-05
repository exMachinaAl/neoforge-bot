// patch-all.js
const { spawnSync } = require('child_process')
let gagal = 0
for (const f of ['patch-nmpf.js', 'patch-checks.js', 'patch-protodef.js', 'patch-blocks.js']) {
  const r = spawnSync(process.execPath, [f], { encoding: 'utf8' })
  const msg = r.status === 0 ? (r.stdout || '').trim() : 'GAGAL: ' + (((r.stderr || r.stdout || '').split('\n').find(l => /^\w*Error:/.test(l))) || 'lihat error').trim()
  if (r.status !== 0) gagal++
  console.log(`${f}: ${msg}`)
}
if (gagal) console.log(`\n!!! ${gagal} patch GAGAL (versi dependency berubah?). Bot kemungkinan tidak akan jalan benar.`)