# docs/UI_PLAN.md - cara berpikir dan template (v1.1, 2026-10-10; v1.1 = keputusan multi-bot, bagian 7)
Berlaku untuk UI, viewer, dan lifecycle. Patch 0001/0002 (kontrak v0.2.0, progress) adalah contoh pola ini.

## 1. Prinsip
1. Kontrak dulu, hanya menambah: field baru opsional, di commit khusus contracts/. Field cadangan
   (director, persona di BotState) baru ditambahkan bila ada kode yang mengisinya.
2. UI adalah proyeksi: tampilan = fungsi dari (BotState snapshot + Event delta). Tidak ada state domain di UI.
   Pola "snapshot + delta" (contoh: BotState.progress + event task.progress, kunci taskId dan seq) membuat
   halaman yang dibuka di tengah task tetap benar: polling mengisi, SSE memperbarui.
3. Aliran berfrekuensi tinggi: dibatasi laju, dibatasi ukuran, tidak diputar ulang ke klien baru, nilai terakhir
   ada di snapshot. Anggaran: maks 2 event/dtk per sumber, maks 4 KB per event, peta maks sekitar 20 KB.
4. UI tidak punya kuasa lebih dari API: semua aksi = Task/Command tervalidasi. Killswitch selalu terlihat.
   Otonomi bawaan MATI.
5. Teks dinamis hanya lewat node teks (jangan innerHTML); ada tes XSS.
6. Patch kecil terhadap hash HEAD, satu fitur per patch, 8-12 tes termasuk jalur gagal, uji mutasi
   (matikan satu penjaga, tes harus gagal), dan label status jujur: TERBUKTI / TERUJI TIRUAN / BELUM DIUJI.

## 2. Kompatibilitas
### Peta 2D (eagle view): data milik kita
- GET /bots/{id}/map?r=32 (cache 1 dtk): grid persegi 2r+1, tiap sel {blok permukaan, y}, ditambah daftar
  entitas {id, jenis, x, y, z}. Blok modded tak dikenal = "?" (digambar abu-abu). Klik sel = POST task nav.goto
  lewat validasi biasa. Kontrak: definisi MapSnapshot dengan batas ukuran; tidak ada event, klien yang menarik.
- Sumber data: bot.world/blockAt, dengan batas waktu per tarikan supaya tidak menahan loop game.

### Prismarine viewer 3D: add-on opsional milik pihak lain
- Opsional (ARCADIA_VIEWER=1), dimuat malas, port sendiri, bind 127.0.0.1, read-only. UI hanya menampilkan
  tautan/iframe dan TIDAK boleh bergantung padanya. BotState.viewer?: {url} diisi hanya bila aktif.
- Spike dulu, bukan kode produksi. Jawab dengan bukti (README + kode paket + uji di server):
  (a) dukungan 1.21.1? (b) bisa di-bind ke 127.0.0.1? (c) blok modded tampil seperti apa?
  (d) beban CPU/RAM di Termux? (e) port tanpa autentikasi: risikonya? Hasil ke FIELD_TESTS.md dengan label.

### Lifecycle / Director / Persona
- Sudah ada: BotState.stats/world/paused/progress dan riwayat penuh (tasks.log).
- Nanti, tiap item = kontrak tersendiri saat kodenya ada: Director {enabled, lastDecision{ts, skill, params,
  reason}, nextReviewAt}; event director.decision; Command setAutonomy/approve/reject.
- UI wajib menampilkan: ALASAN keputusan, ANGGARAN (panggilan LLM/menit), KESELAMATAN (otonomi on/off, killswitch),
  KEBUTUHAN (HP, lapar, jam dunia, stok).
- Planner/LLM hanya mengusulkan Task (source: 'planner'); jalan setelah disetujui atau sesuai kebijakan persona.

## 3. Urutan batch UI (satu patch tiap baris)
UI-1 selesai: progress + kartu Task berjalan + hasil penuh (patch 0001/0002).
UI-2 guard.post memakai ctx.progress, lalu guard.follow (spesifikasi di bagian 5).
UI-3 rute statis aman + UI dipecah jadi modul (prasyarat UI besar): GET /ui/* dengan daftar putih, tolak "..",
     content-type benar. Keputusan terbuka: token via cookie SameSite=Strict setelah ?token pertama
     (aset statis tidak bisa mengirim header).
UI-4 tombol cepat (guard.post/follow/stop) + kartu Inventory dan Companion.
UI-5 /openapi.json dari manifest. UI-6 peta 2D. UI-7 spike viewer 3D. UI-8 panel Director (setelah Director ada).

## 4. Template kartu kerja untuk AI lain
Tujuan (1 kalimat) | Baca dulu (maks 6 berkas) | Perubahan kontrak: ya/tidak (bila ya, commit terpisah) |
Langkah | Tes (nama kasus + jalur gagalnya) | Selesai bila (bisa diukur) | Di luar lingkup |
Laporan: hash HEAD, patch git apply, hasil tes dengan label status, daftar yang BELUM terbukti.
Pembagian berkas agar tidak bentrok: satu AI satu area (contracts+engine | ui | skills). Patch digabung berurutan;
bila HEAD bergeser, buat ulang diff dari HEAD baru, jangan menambal manual.

## 5. Spesifikasi progress guard
- Panggil ctx.progress di tiap putaran loop utama (runner sudah membatasi laju) dan saat ganti keadaan.
- data: {state: patrol|engage|retreat|eat, kills, shots, hits, retreats, hp, target?: {name, dist}, elapsedMs}
  (guard.follow menambah {owner, dist}). pct = elapsed/durationMs bila durasi terbatas, selain itu null.
  label contoh: "menjaga (2 mob)". Angka progress harus sama dengan data hasil akhir.
- Tidak boleh mengubah perilaku; tidak ada progress setelah abort.
- Tes (8-12): ganti state tercatat | pct tidak turun | tanpa durasi pct null | tanpa progress setelah abort |
  data < 4 KB | angka akhir = hasil | tanpa musuh tetap melapor | exception tidak memutus guard | follow tanpa owner
  -> PRECONDITION_FAILED | uji mutasi: hapus panggilan progress -> tes gagal.

## 6. Jebakan yang sudah terjadi
- Cookie tidak terisolasi per port (hanya per host): token cookie dari bot di port lain akan ikut terkirim ke port ini dan ditolak. Layani UI hanya dari satu origin (hub) atau beri nama cookie per port.
- Di race timeout, tolak promise sendiri DULU baru stop(); kalau tidak, PathStopped tersamar sebagai Timeout.
- Event task.failed milik task lain jangan menutup kartu task berjalan.
- Polling bisa tertinggal dari SSE; kartu dibuat dari event progress bila perlu.
- Event berfrekuensi tinggi jangan masuk riwayat replay SSE.
- git apply butuh isi berkas persis HEAD; selalu sertakan hash.
- Modul yang tidak ada di zip (mock, validate) di-stub; hasilnya diberi label TERUJI TIRUAN.

## 7. Keputusan arsitektur: banyak bot, satu API (v1.1)
Keputusan: UI baru modular tanpa langkah build (ES modules, teks lewat node teks), BUKAN dasbor pihak ketiga dan BUKAN menulis ulang API. Banyak bot = HUB + satu proses per bot; bukan registry banyak bot dalam satu proses Node.
Alasan: (1) kode bot/skill tetap tidak berubah; (2) isolasi crash dan memori (Termux); (3) berkas tunggal per proses (snapshot.json, tasks.log, itemmap.json, snapshot_raw.txt) tidak bentrok bila tiap proses punya ARCADIA_DATA_DIR sendiri; (4) bentuk rute sudah /bots/:id/..., Event dan BotState sudah punya botId (wajib di kontrak).
Aturan yang berlaku SEKARANG (agar tidak ada yang ditulis ulang nanti):
1. UI botId-first: ambil id dari GET /bots, jangan memakai "me" di UI; semua state UI berkunci botId.
2. UI membaca daftar endpoint (satu atau banyak) dari satu konfigurasi; tiap endpoint = satu proses bot atau satu hub. Skill dibaca per bot (GET /skills per endpoint; kemampuan bisa beda per set mod).
3. Event selalu membawa botId (sudah); jangan ada event tanpa botId. Aliran SSE per endpoint; hub menggabungkan.
4. Satu proses = satu bot: data per bot lewat ARCADIA_DATA_DIR/ARCADIA_TASKLOG; tidak ada berkas global baru di akar tanpa kunci botId.
5. Aksi lintas bot (kirim task ke banyak bot) = hub memanggil API tiap bot; tidak ada jalan pintas yang melewati validasi Task/Command.
Hub (nanti, saat bot kedua dibutuhkan; 1 batch sendiri): bots.json [{id, url, token}], GET /bots menggabungkan, /bots/:id/* diteruskan ke bot yang sesuai, SSE digabung, token bot disimpan di sisi hub (UI hanya memegang token hub), opsional memulai/menghentikan proses bot. Kontrak tambahan (opsional): BotState.endpoint? hanya bila ada kode yang mengisinya.
Di luar lingkup sekarang: hub, spawn proses, registry banyak bot dalam satu proses.

