// Menambah bagian pembaruan (append-only, aman diulang) ke README.md, TODO.md, docs/HANDOFF.md
const fs = require('fs')
function add (file, marker, text) {
  if (!fs.existsSync(file)) return console.log(file + ': tidak ada, dilewati')
  const s = fs.readFileSync(file, 'utf8')
  if (s.includes(marker)) return console.log(file + ': sudah ter-update')
  fs.writeFileSync(file, s.replace(/\n*$/, '\n') + '\n' + text)
  console.log(file + ': diperbarui')
}
add('README.md', '## Antrean, API & UI', `## Antrean, API & UI
- Antrean berprioritas: \`!queue add <skill> k=v ...\`, \`!queue list|clear|pause|resume|cancel <id>|kill\`. \`!task\` tetap menjalankan satu task langsung.
- Saat \`npm start\`, bot mencetak \`API siap: http://127.0.0.1:8787/?token=...\`. Buka URL itu di browser (HP yang sama) untuk UI: status bot, antrean, riwayat, chat, kill switch, form task dari manifest skill.
- API (header \`Authorization: Bearer TOKEN\`): \`GET /bots\`, \`GET /bots/me\` (BotState), \`GET|POST /bots/me/tasks\`, \`DELETE /bots/me/tasks/<id>\`, \`POST /bots/me/commands\` (enqueue cancel pause resume clear stop say), \`GET /skills\`, \`POST /killswitch\`, \`GET /events\` (SSE).
- Env: \`ARCADIA_TOKEN\` (tetap), \`ARCADIA_PORT\` (8787), \`ARCADIA_BIND\` (127.0.0.1; 0.0.0.0 membuka ke jaringan, hati-hati), \`ARCADIA_API=0\` mematikan API.
- Kegagalan task yang mematikan bot (\`DIED\`/\`INTERRUPTED\`) menjeda antrean; lanjutkan manual (\`!queue resume\` atau tombol Lanjut).
- \`mine.collect ... chest=true\` (atau \`"chest":"auto"\`) menyimpan ke chest/barrel terdekat; \`chest\` berkoordinat memakai wadah di/dekat koordinat itu.
- Tes otomatis (bot tiruan): \`npm test\`.
`)
add('TODO.md', '## Pembaruan #5', `## Pembaruan #5
- [x] nav.goto XZ + y tak terjangkau (OK dengan note), jarak 90 blok (TERBUKTI log)
- [x] mine.collect dirt dan stone -> cobblestone, menembus tanah (TERBUKTI log)
- [~] DILAPORKAN (pemilik: anggap tes lain berhasil, log tak dilihat): hunt, farm, fish, guard, tes T-list lain
- [ ] Uji ulang chest: koordinat yang diberikan terbaca 'stone' oleh bot (3x gagal); coba chest=true (auto-detect)
- [ ] Uji nav.goto dari lubang hasil galian (retry + gali keluar); sebelumnya UNKNOWN dalam 91 ms tanpa bergerak
- [~] engine/ + control/ + ui/ (antrean, API, SSE, UI web) - TERUJI TIRUAN (npm test), BELUM DIUJI di server/browser HP
- [ ] YSM: baca subperintah /ysm (Tab di klien OP); !channels ysm; pelajari paket pilih-model klien asli
- [ ] Orchestrator multi-bot (proses per bot + IPC), persona, memori, planner LLM, UI lanjutan (daftar bot, inventory, peta)
`)
add('docs/HANDOFF.md', '## 11. Pembaruan checkpoint #5', `## 11. Pembaruan checkpoint #5
Kode baru: engine/ (antrean berprioritas, BotState, Event; DIED/INTERRUPTED menjeda antrean), control/ (API HTTP + SSE + UI, tanpa dependency, bind 127.0.0.1 + token),
ui/index.html (tanpa innerHTML), contracts/validate.js, tests/ (mock bot, npm test), CLI !queue. Runner skills/index.js kini mengekspos events, current(), abort(), parse().
Skill: mine.collect chest=true|"auto"|{x,y,z} (wadah terdekat; error menunjuk chest terdekat), nav.goto retry 2x lalu gali keluar blok alami (escape:false mematikan).
TERBUKTI (log pemilik): nav.goto XZ (14 dtk dan 17 dtk untuk 90 blok), y di dalam tanah -> OK dengan note; mine.collect dirt x6 dan stone x6 (cobblestone, dug 6, reasons kosong).
Anomali: nav.goto sesudah menggali dirt (bot di lubang y=65) -> UNKNOWN dalam 91 ms tanpa bergerak, percobaan kedua berhasil (fix retry/escape BELUM DIUJI).
Chest: koordinat yang diberikan pemilik terbaca "stone" oleh bot pada 3 percobaan (penyebab tak diketahui; mungkin koordinat berbeda) -> auto-detect ditambahkan, BELUM DIUJI.
DILAPORKAN: pemilik meminta semua tes lain dianggap berhasil (log tidak dilihat).
YSM (sumber publik, bukan kode): perintah /ysm butuh OP level 2 (model reload, auth all|clear|add|remove); model dipilih lewat GUI klien (Alt+Y) yang mengirim pilihan ke server. Perintah "set model pemain lain"
tidak ditemukan di sumber yang saya baca (BELUM DIVERIFIKASI). Dugaan: bot tak punya model terpilih sehingga tampak T-pose; solusi mungkin meniru paket pilih-model klien asli (format tertutup).
Langkah: ketik "/ysm " + Tab di klien OP; jalankan !channels ysm di bot; tangkap paket klien asli bila perlu.
`)
