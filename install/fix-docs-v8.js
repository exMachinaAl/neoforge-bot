// Menambahkan blok dokumentasi 2026-10-12 ke README.md, MAP.md, TODO.md (append-only, aman diulang). Tidak mengubah kode.
const fs = require('fs'); const path = require('path')
const blocks = [['README.md', '## Pembaruan v2.5 (UI, Director, viewer)', 'README.append.md'], ['MAP.md', '## Pembaruan 2026-10-12 (UI, Director, viewer)', 'MAP.append.md'], ['TODO.md', '## Batch 11 — Viewer prismarine & Orchestrator LLM', 'TODO.append.md']]
for (const [file, marker, src] of blocks) {
  const p = path.join(__dirname, '..', 'docs', '_append', src); if (!fs.existsSync(p)) { console.log(src + ': tidak ada, dilewati'); continue }
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  if (cur.includes(marker)) { console.log(file + ': sudah ada'); continue }
  fs.writeFileSync(file, cur.replace(/\n*$/, '\n') + '\n' + fs.readFileSync(p, 'utf8')); console.log(file + ': ditambahkan')
}
