# CHANGELOG
Format: Ditambah / Diubah / Diperbaiki / Catatan keamanan / Diketahui bermasalah. Label status: TERBUKTI (log pemilik) | DILAPORKAN | TERUJI TIRUAN | BELUM DIUJI.
Tanggal paket sebelum 2026-10-12 tidak tercatat; urutan di bawah = urutan pengiriman.

## [v2.5-usulan] 2026-10-12 - UI modular, controller pelengkap, Director (model langsung), viewer opsional
Ditambah
- `control/extend.js`: pembungkus listener `request` milik `control/index.js` (rute lama tidak diubah). Menambah UI statis, `/openapi.json`, `/bots/{id}/map|viewer|director*`. TERUJI TIRUAN (tests/extend.test.js, 32 kasus + mutasi AUTH/CSRF).
- `control/static.js`, `control/cookie.js`: berkas statis daftar-putih (tolak `..`, dotfile, symlink keluar akar, ekstensi di luar daftar, ukuran >512 KB) dan cookie `arcadia_<port>` (HttpOnly, SameSite=Strict). TERUJI TIRUAN (37 kasus + mutasi 6 penjaga).
- `ui/index.html` (cangkang) + `ui/js/*.mjs` + `ui/css/app.css`: UI modular tanpa langkah build, tanpa HTML dinamis, botId-first, kartu status/progress/antrean/riwayat/inventory/kontrol cepat/form task/Director/peta/chat/log. TERUJI TIRUAN (tests/ui.test.js, 40 kasus + mutasi store). BELUM DIUJI di browser HP.
- `orchestrator/llm.js`: klien model langsung tanpa SDK (anthropic dan openai/kompatibel, termasuk server lokal tanpa kunci). `orchestrator/director.js`: Director (usul task, validasi terhadap manifest, anggaran/menit, persetujuan manual). `orchestrator/try.js`: uji model dari terminal tanpa bot (`--dry` = lihat prompt saja). TERUJI TIRUAN dengan server model palsu (tests/director.test.js, 48 kasus + mutasi 5 penjaga). BELUM DIUJI dengan API sungguhan.
- `control/map.js` + `ui/js/mapcard.mjs`: peta 2D data (grid permukaan, <20 KB). TERUJI TIRUAN (17 kasus). STATUS KEPUTUSAN: cadangan ringan; viewer utama = prismarine-viewer (lihat docs/UI_PLAN_ADDENDUM_v1.2.md).
- `control/viewer3d.js`: pemuat opsional prismarine-viewer (ARCADIA_VIEWER=1), dipaksa bind 127.0.0.1. Pembungkus bind TERUJI TIRUAN; paketnya BELUM pernah dijalankan dengan bot.
- `install/fix-ui3b.js`: memasang pembungkus di `bot.js`, menambah tes ke skrip `test`, menyesuaikan tes UI lama, menambah catatan dokumen (aman diulang).
Diubah
- `ui/index.html`: UI satu-berkas lama diganti cangkang modul. `tests/engine.test.js`: pemeriksaan UI disesuaikan (`type="module"`).
Catatan keamanan
- Autentikasi: header Bearer > `?token` > cookie per port; cookie dipetakan ke header untuk rute lama; ubah-data via cookie wajib same-origin (Origin/Sec-Fetch-Site). Token dihapus dari URL setelah halaman terbuka.
- Kunci model hanya dari env; tidak masuk log, snapshot, UI, atau pesan galat (disamarkan); redirect HTTP ditolak agar kunci tidak ikut. Otonomi Director MATI; auto-setuju hanya untuk skill di `ARCADIA_DIRECTOR_AUTO` (bawaan kosong).
Diketahui bermasalah / belum ada
- Bentuk `BotState.progress`/event `task.progress` di UI mengikuti UI_PLAN (pct/label/data, taskId+seq), belum dicocokkan dengan implementasi asli.
- UI belum menampilkan tautan/iframe viewer 3D. Otonomi Director (loop), event `director.decision`, dan Command setAutonomy/approve/reject di kontrak belum ada.

## [sleep.auto v2] arcadia-sleep-v2.zip
Diperbaiki (TERUJI TIRUAN, 28 kasus): kepala bed ditunggu sebelum klik (error "only half bed"); bed jauh didekati berulang selama ada kemajuan (Timeout jalur sebagian tak lagi dianggap gagal) + fase buka pintu; `setMovements` eksplisit; mob di area bed dihajar SEBELUM klik; tidur lagi bila terbangun malam hari.
Diketahui bermasalah (DILAPORKAN, BELUM DIPERBAIKI): setelah bangun, bot kadang mengklik bed lagi lalu muncul "hanya bisa tidur di malam hari". Dicatat di FIELD_TESTS.md; diagnostik `data.timeline`/`data.signals` ditambahkan di arcadia-ui3a.zip. Perbaikan menunggu data timeline (docs/AGENT_BRIEFS.md, H-1).

## [v2.1] arcadia-v2-1.zip
Diperbaiki: farm.harvest (GoalLookAtBlock tak pernah terpenuhi untuk blok tanpa shapes; kini U.approach memakai GoalNear) - akar masalah TERBUKTI dari kode, perbaikan lalu dilaporkan berhasil. Item unknown dikelompokkan per id (`unknown#<id>`). `tasks.log` per task, validasi params dengan manifest (HTTP 400), alasan ABORTED, chest `true|"auto"|"x y z"`.

## [v2] arcadia-v2.zip
Ditambah: engine (antrean berprioritas, BotState, Event), control (API HTTP + SSE + UI satu-berkas), `!queue`, tests/. Skill: nav.goto (retry + gali keluar blok alami), mine.collect (drop otomatis, alat terbaik, dig menembus blok alami, chest otomatis), fish.cast, farm.harvest, hunt.kill; `!test` (selftest), `!channels` (sniffer), patch-blocks v2 (blok modded padat).
