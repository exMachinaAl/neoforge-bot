// Pemasangan sleep.auto (aman diulang, tidak menyentuh berkas milik agen lain selain 2 baris terdaftar):
// 1) menambahkan "node tests/sleep.test.js" ke skrip "test" di package.json
// 2) menyamakan hitungan skill di tests/engine.test.js dengan jumlah berkas skill sebenarnya (bila polanya ditemukan)
const fs = require('fs'); const path = require('path')
const pj = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const cmd = 'node tests/sleep.test.js'
if (pj.scripts && pj.scripts.test && !pj.scripts.test.includes(cmd)) { pj.scripts.test += ' && ' + cmd; fs.writeFileSync('package.json', JSON.stringify(pj, null, 2) + '\n'); console.log('package.json: test + sleep.test.js') } else console.log('package.json: sudah/tidak ada skrip test')
const n = fs.readdirSync('skills').filter(f => /^[a-z][a-z0-9_]*\.[a-z0-9_.]+\.js$/.test(f) && f !== 'check.js').length
const t = 'tests/engine.test.js'
if (fs.existsSync(t)) {
  const s = fs.readFileSync(t, 'utf8'); const re = /(sk\.length === )(\d+)/
  const m = s.match(re)
  if (!m) console.log(t + ': pola "sk.length === N" tidak ditemukan; ubah hitungan skill secara manual menjadi ' + n)
  else if (Number(m[2]) === n) console.log(t + ': hitungan skill sudah ' + n)
  else { fs.writeFileSync(t, s.replace(re, '$1' + n)); console.log(t + ': hitungan skill ' + m[2] + ' -> ' + n) }
}
