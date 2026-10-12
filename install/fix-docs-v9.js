// Menambahkan blok TODO Batch 12 (append-only, aman diulang). Hanya dokumen; tidak mengubah kode.
const fs = require('fs'); const path = require('path')
const marker = '## Batch 12 — Otak lifecycle'; const src = path.join(__dirname, '..', 'docs', '_append', 'TODO.lifecycle.append.md')
const cur = fs.existsSync('TODO.md') ? fs.readFileSync('TODO.md', 'utf8') : ''
if (cur.includes(marker)) console.log('TODO.md: sudah ada'); else { fs.writeFileSync('TODO.md', cur.replace(/\n*$/, '\n') + '\n' + fs.readFileSync(src, 'utf8')); console.log('TODO.md: ditambahkan') }
