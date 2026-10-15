// UI-3a: menambahkan tes statis ke skrip "test" (aman diulang). Berkas control/static.js dan control/cookie.js belum dipakai control/index.js (UI-3b).
const fs = require('fs')
const pj = JSON.parse(fs.readFileSync('package.json', 'utf8')); const cmd = 'node tests/static.test.js'
if (pj.scripts && pj.scripts.test && !pj.scripts.test.includes(cmd)) { pj.scripts.test += ' && ' + cmd; fs.writeFileSync('package.json', JSON.stringify(pj, null, 2) + '\n'); console.log('package.json: test + static.test.js') } else console.log('package.json: sudah/tidak ada skrip test')
