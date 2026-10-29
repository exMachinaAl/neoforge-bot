# Arcadia / neoforge-bot

Arcadia adalah aplikasi Node.js dengan panel web untuk mengelola companion AI di Minecraft Java/NeoForge 1.21.1. Bot memakai Mineflayer, skill native proyek, antrean engine, dan keputusan LLM; lifecycle menyediakan kegiatan offline berbasis aturan dan skor.

**Status native:** fitur saat ini sudah terintegrasi langsung dalam source repository. Jalankan aplikasi dari folder proyek; tidak perlu installer `fix.js` atau paket upgrade berantai. Istilah ini berarti integrasi source Node.js/web, bukan mod Java NeoForge, aplikasi desktop biner, atau produk resmi Mojang/Microsoft.

**Kelayakan main:** lihat [audit 29 Oktober 2026](docs/PROJECT_STATUS.md). Implementasi tersedia dan memiliki pengujian, tetapi promosi tanpa syarat ke `main` belum direkomendasikan sampai temuan kebersihan repository serta instalasi bersih ditutup. Branch pengembangan utama tidak sama dengan rilis production stabil.

## Kemampuan saat ini

- Admin dengan login owner, pembuatan banyak bot, proses per bot, kontrol tunggal/massal, sesi dan data terpisah.
- Multi menampilkan Eagle bot fokus, first-person per bot, dan profil GLB pada setiap kartu; Single menyediakan companion, percakapan, tujuan, ingatan, dan statistik.
- Profil 3D memiliki animasi otomatis/manual, skala, rotasi, posisi X/Y, serta kalibrasi per model/per bot.
- Agent mengamati hasil skill, memilih tindakan/pemulihan, menyimpan checkpoint, dan mengikuti izin Observasi/Semi/Penuh. Log ringkas dapat dibuka untuk melihat seluruh proses.
- Kegiatan offline bertajuk dengan beberapa task, dependency, skor faktor, dan pemulihan misi.
- Native skills untuk navigasi, mining, farming, fishing, hunting, inventory, crafting, breeding, sleep, guard, inspeksi, eksplorasi, dan placement.

ML terlatih, pembuatan rumah/portal universal, dukungan penuh item modded, dan manajemen customer lengkap **belum tersedia**. Batas agent: [AGENT_RUNTIME.md](docs/AGENT_RUNTIME.md).

## Menjalankan proyek

Gunakan Node.js 22 atau lebih baru, npm, dan Git. Target penggunaan: Windows, Linux, dan Android melalui Termux. Pengujian fisik seluruh dependency di Linux/Termux belum lengkap; viewer/canvas dapat membutuhkan dependency build platform.

1. Dari root checkout proyek, pasang dependency terkunci:

```sh
npm ci
```

Postinstall menjalankan empat patch kompatibilitas dependency yang memang bagian runtime. Periksa keluarannya: saat ini `patch-all.js` mencetak kegagalan tanpa menetapkan exit code gagal; hasil instalasi saja belum menjamin semua patch berhasil.

2. Salin `.env.example` menjadi `.env` lewat editor, lalu atur koneksi/provider. Jangan kirim API key ke chat. Ikuti [setup LLM lintas OS](docs/LLM_SETUP.md); Ollama memakai jalur kompatibel OpenAI (`ARCADIA_LLM_PROVIDER=openai`).

3. Validasi kontrak:

```sh
npm run check
```

4. Untuk Eagle/first-person, pasang dependency viewer opsional:

```sh
npm run viewer:install
```

Paket viewer/canvas belum dikunci sebagai dependency langsung dalam package manifest. Setelah instalasi dependency, pastikan keluaran postinstall tetap berhasil; jika diperlukan jalankan `node patch-all.js`.

5. Jalankan admin:

```sh
npm run admin
```

Buka **http://localhost:8788**, buat akun owner, tambah bot dengan host/port server, lalu tekan **Mulai**. Admin tidak otomatis menyalakan Minecraft server. Panduan lengkap: [ADMIN_PANEL.md](docs/ADMIN_PANEL.md).

Untuk satu bot standalone, gunakan `npm start`; buka URL autentikasi yang dicetak terminal (bawaan port 8787). Jangan menjalankan username sama dari standalone dan admin bersamaan.

## Konfigurasi Minecraft dan model

Standalone membaca `MC_HOST`, `MC_PORT`, `MC_LOG`, `MC_LOG_CMD` sebelum `mc.local.json`; bawaan host `localhost`, port `25565`, log `server/logs/latest.log`. Admin menyimpan koneksi setiap bot lewat form. Server saat ini memakai auth offline.

Taruh GLB 2.0 bertekstur/buffer tertanam di `data/models/`, lalu pilih model melalui **Single → Model & animasi**. Batas 100 MB; decoder Draco/KTX2/Meshopt belum tersedia. Atur ukuran dan posisi X/Y untuk framing kepala atau badan. **Multi → Atur framing** menyediakan kontrol ringkas yang sama. Profil dapat dimuat ketika worker offline.

Kalibrasi tersimpan bersama per bot/model; Single yang sudah terbuka dapat masih memegang nilai lama dari Multi: gunakan **Muat ulang model** bila perlu. Ini belum sinkron langsung antar-renderer. Animasi GLB tidak mengubah tampilan skin/YSM bot di dunia Minecraft.

## Pengujian

Status konfigurasi LLM tanpa menampilkan key atau memanggil cloud:

```sh
npm run llm:status
```

Uji model tanpa Minecraft (benar-benar memakai API provider):

```sh
npm run llm:test -- "kumpulkan 8 kayu"
```

Regresi otomatis:

```sh
npm test
```

Admin memakai suite terpisah `npm run test:admin`; konfigurasi env memakai `npm run test:llm-config`. Viewer opsional harus terpasang untuk tes admin; uji browser memakai helper Edge Windows dan aset GLB lokal. Rincian bukti serta checklist lapangan: [PROJECT_STATUS.md](docs/PROJECT_STATUS.md) dan [FIELD_TESTS.md](docs/FIELD_TESTS.md).

CLI standalone: `!test list`, `!task list`, `!task <skill> k=v`, `!task stop`, `!queue list`, `!channels`, `!quit`. Hasil task dicatat sebagai `SKILLRESULT` dan di `tasks.log`. Untuk perubahan mod, `npm run adapt` mempelajari channel dari kegagalan negosiasi/log server; ini bukan training ML.

## Pengembangan dan dokumentasi

**Codex / Claude Code / Antigravity:** wajib edit langsung di folder lokal. **Claude / ChatGPT / Gemini tanpa akses folder:** upgrade berbentuk ZIP berisi source final. Dilarang memakai `fix.js` sebagai mekanisme perubahan source. Ketentuan lengkap: [AGENTS.md](AGENTS.md) dan [WORKFLOW.md](docs/WORKFLOW.md).

Mulai dari [indeks dokumentasi](docs/README.md), [handoff aktif](docs/HANDOFF.md), [peta source](docs/MAP.md), dan [backlog](TODO.md). Riwayat perubahan ada di [CHANGELOG.md](docs/CHANGELOG.md); rencana lama ditandai **ARSIP**.
