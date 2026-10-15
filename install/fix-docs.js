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

add('README.md', '## Log task (tasks.log)', `## Log task (tasks.log)
Tiap task menulis satu baris JSON (params + hasil utuh) ke \`tasks.log\` (diabaikan git; \`ARCADIA_TASKLOG=off\` mematikan, atau isi path lain). Terminal mencetak \`SKILLRESULT {...}\` untuk task antrean juga.
Lihat detail kegagalan: \`tail -n 3 tasks.log\`. Di UI, ketuk baris Riwayat untuk membuka params + hasil lengkap. Params divalidasi terhadap manifest skill (HTTP 400 bila salah).
`)
add('TODO.md', '## Pembaruan #6', `## Pembaruan #6
- [x] farm.harvest: akar masalah ditemukan di source (GoalLookAtBlock tak pernah terpenuhi untuk blok tanpa shapes seperti tanaman); kini U.approach memakai GoalNear untuk blok tanpa bentuk tabrakan - TERUJI TIRUAN, BELUM DIUJI server
- [x] Item unknown dikelompokkan per id numerik (unknown#<id>) di invTotals/BotState - TERUJI TIRUAN
- [ ] Verifikasi inventory: skill inv.snapshot (/data get entity <bot> Inventory, parser SNBT) dibanding bot.inventory; butuh bot op
- [ ] craft.item: resep vanilla ada di minecraft-data (782 item); alur crafting table + window click BELUM diuji; hanya bahan vanilla
- [ ] Uji ulang farm.harvest di server; kirim tail -n 3 tasks.log bila gagal
`)
add('docs/HANDOFF.md', '## 12. Pembaruan checkpoint #6', `## 12. Pembaruan checkpoint #6
Log pemilik (UI/SSE): mine.collect oak_log + chest OK (24 dtk), hunt.kill cow x5 OK (8,7 dtk), fish.cast OK (58 dtk; detail tangkapan terpotong), nav.goto OK; hunt.kill tanpa mob -> PRECONDITION_FAILED; fish.cast pertama ABORTED (penyebab tak terlihat, kemungkinan stop manual);
farm.harvest wheat GAGAL dua kali (TARGET_NOT_FOUND, 26 dan 28 dtk = kira-kira 5 x thinkTimeout 5 dtk). Hasil lengkap terpotong di log, jadi data.reasons tidak terlihat.
Akar masalah (TERBUKTI dari source): world.raycast memakai block.shapes; tanaman punya shapes kosong sehingga GoalLookAtBlock.isEnd tak pernah terpenuhi -> pathfinder timeout. Perbaikan: U.approach (GoalNear untuk blok tanpa shapes). Berlaku juga bagi mine.collect pada blok tanpa shapes.
Params skill dari UI bisa berupa string ("wheat"); farm.harvest kini menerima daftar dipisah koma. Engine memvalidasi params terhadap paramsSchema (HTTP 400). ABORTED membawa alasan (USER_STOP, USER_CANCEL, KILLSWITCH, DIED, TIMEOUT).
Inventory: item modded tak dikenal bernama "unknown" oleh prismarine-item; dikelompokkan per id numerik (unknown#<id>); komponen item tidak terbaca (dua item berbeda komponen dengan id sama tampak sama).
Paket yang memuat komponen modded gagal parse dan dibuang (PARSE GAGAL window_items/set_slot) sehingga bot.inventory dapat tertinggal dari server. Belum ada pemeriksaan silang; rencana: inv.snapshot via /data get entity.
`)
