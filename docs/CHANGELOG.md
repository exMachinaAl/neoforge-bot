# CHANGELOG
Format: Ditambah / Diubah / Diperbaiki / Catatan keamanan / Diketahui bermasalah. Label status: TERBUKTI (log pemilik) | DILAPORKAN | TERUJI TIRUAN | BELUM DIUJI.
Tanggal paket sebelum 2026-10-12 tidak tercatat; urutan di bawah = urutan pengiriman.

## [Companion & mission runner] 2026-10-19

- UI utama berpusat pada karakter GLB, kegiatan berjudul/progres, percakapan dan tujuan. Statistik tambahan serta kalibrasi dilipat; Eagle View dan ingatan berada di ruang bersama, kontrol manual di tab lanjutan.
- Runner persisten per bot: dependency, satu langkah aktif, stop/cancel, retry eksplisit, replan LLM yang mempertahankan hasil selesai, checkpoint dan pemulihan restart tanpa mengulang aksi yang hasilnya belum diketahui.
- Director/lifecycle menghasilkan kegiatan melalui runner yang sama. Chat LLM memakai konteks dan ingatan; catatan serta hasil kegiatan dapat dilihat/dihapus di UI. Skor hasil mempertahankan riwayat kegagalan.
- TERUJI TIRUAN: 8 skenario mission runner, 50 extend/API termasuk auth/CSRF, 48 Director, 50 UI, 12 integrasi. `npm run check` lulus.
- TERUJI TIRUAN (Edge nyata): Momoi, percakapan, ingatan/hapus, kegiatan dua langkah, persistensi reload, desktop/viewport HP; kanvas dan iframe stabil, tanpa exception. Tidak memanggil API model sungguhan atau Minecraft.
- BELUM DIUJI: alur misi baru dengan server Minecraft/model LLM sungguhan dan HP fisik. First-person, training ML, serta login customer belum dikerjakan. Restart proses bot diperlukan untuk memuat backend baru.
- Rincian pemakaian, recovery, batas dan API: [MISSIONS.md](MISSIONS.md). Perubahan langsung ke source, tanpa installer/upgrader.

## [Profil GLB v2] 2026-10-19 — Momoi dan pergantian model

- Renderer Three.js dipertahankan ketika model berganti; hasil load usang diabaikan, unduhan lama dibatalkan, dan kanvas mengikuti resize.
- CSP mengizinkan fetch blob lokal agar ImageBitmapLoader dapat membaca tekstur GLB tertanam.
- Pilihan model langsung memuat dan tersimpan; ukuran, rotasi, clip manual, serta mapping otomatis disimpan per model/per bot. Kalibrasi lama dipulihkan saat kembali ke model.
- Framing memakai wrapper terpisah dari root animasi. Model statis tanpa clip tetap dapat ditampilkan.
- Validasi container GLB 2.0, file rusak, resource eksternal, dan ekstensi wajib. Draco/KTX2/Meshopt belum didukung; UI meminta ekspor GLB tanpa kompresi tersebut.
- TERUJI TIRUAN (browser Edge nyata, aset Momoi asli, API profil lokal tanpa Minecraft): Momoi dengan 37 clip dan tekstur tampil; pemilihan manual, pergantian model, resize, pemulihan dari file rusak, pilihan cepat, serta autosave lulus. Screenshot lokal: backup/avatar-momoi.png.
- TERUJI TIRUAN: profil 18/18, UI 50/50, static 37/37, extend 41/41. Tes symlink profil dilewati karena Windows EPERM; validasi path lain lulus.
- BELUM DIUJI: browser HP/Termux, model lain milik pemilik, dan transisi kondisi selama task Minecraft nyata.
- Uji browser dapat diulang dengan `node tests/avatar-browser.test.js` (Edge dan dua aset lokal diperlukan). Tes tidak memanggil LLM atau server Minecraft.

## [v2.6-belum-commit] 2026-10-16 - profil GLB per bot dan fondasi generator kegiatan

Ditambah
- `control/profile3d.js` dan rute `/bots/{id}/profile`: daftar model dari `data/models`, konfigurasi per bot di `data/profiles`, stream GLB terautentikasi, batas 100 MB, serta validasi nama/path/symlink.
- `ui/js/avatar3d.mjs`: renderer Three.js/GLTFLoader lokal, skala dan rotasi manual, pilihan model, mode animasi otomatis/manual, serta pemetaan clip untuk `idle`, `working`, `happy`, `tired`, `sad`, dan `danger`.
- `ui/vendor/three.module.mjs`, `GLTFLoader.mjs`, dan lisensi Three.js. Runtime disalin dari dependency lokal yang sudah terpasang; tidak memakai CDN.
- Profil AI Life menjadi 14 meter: afeksi, kesehatan, kenyang, energi, rasa aman, rasa ingin tahu, produktivitas, sosial, kewaspadaan, agresivitas, ketenangan, keamanan area, kenyamanan waktu, dan progres XP.
- `lifecycle/features.js`: 21 faktor numerik untuk audit scoring dan dataset ML mendatang.
- `lifecycle/cyclebook/beautiful_farming_day.json`: contoh kegiatan berjudul **Hari yang Indah untuk Bertanam**, terdiri dari `farm.harvest`, `fish.cast`, lalu `inv.snapshot`.
- Kontrak Batch menerima `title`, `selectionScore`, dan `selectionFactors`; sampler dan runtime menerima template multi-task dan mengantrekan seluruh langkah setelah persetujuan.
- Statistik agregat menambah `failCount`, `successRate`, `avgMs`, hitungan kode hasil, dan jumlah konteks.

Diubah / diperbaiki
- Panel profil dan iframe Eagle View dipertahankan saat polling; render halaman tidak mengganti seluruh UI tiap tiga detik.
- Status profil menampilkan clip aktif dan kondisi pemilihnya.
- Validasi endpoint hanya menerima ekstensi literal `.glb`; nama seperti `modelXglb` ditolak.
- Dry-run lifecycle menampilkan judul, skor pemilihan, dan faktor yang digunakan.

Validasi
- TERBUKTI di server dan Edge laptop: BotAlpha online; API 8787 dan viewer 3007 aktif; model kalibrasi GLB dirender; lima clip ditemukan; `Idle` dipilih; 14 meter tampil; iframe viewer tetap node DOM yang sama setelah polling.
- TERUJI TIRUAN: profile 9/9, static 37/37, UI 50/50, sampler 14/14, API extend 41/41, integrasi 12/12, lifecycle 30/30; `npm run check` lulus 41 kontrak, 14 skill, dan 8 makro.
- Seluruh perubahan masih berada di working tree dan BELUM di-commit.

Diketahui bermasalah / belum tercapai
- Model Blue Archive milik pemilik belum pernah dimasukkan. Material, texture, skeleton, nama clip, ekstensi GLTF terkompresi, skala, dan performa HP masih BELUM DIUJI.
- Pergantian animasi otomatis baru diuji dengan helper dan model kalibrasi. Transisi selama task nyata, damage, afeksi rendah, dan energi rendah belum direkam di server.
- Model kalibrasi `data/models/arcadia-calibration.glb` hanya segitiga lokal untuk pengujian dan diabaikan Git; bukan aset final.
- `selectionScore` masih heuristic. Belum ada training ML, ranker offline, dataset outcome yang cukup, evaluasi model, ekspor ONNX/JSON weights, ataupun integrasi LLM sebagai teacher.
- Generator sudah mendukung satu judul dengan banyak task, tetapi bundle contoh belum diuji berjalan penuh di server. Task memasak belum ada karena skill cooking/smelting belum dibuat.
- Sebagian statistik UI adalah nilai turunan sederhana (`calm`, `daylight`, `experience`), belum seluruhnya state persisten atau sinyal pembelajaran yang tervalidasi.
- Login customer belum dibuat. `/auth/session` baru boundary lokal; belum ada user database, password/OAuth, rotasi session, tenant membership, RBAC per bot, recovery, atau audit login.
- Browser HP/Termux, penggunaan viewer lima menit, banyak bot nyata, dan model 3D berat belum diuji.
- Kode baru cukup padat dan beberapa modul ditulis dalam baris panjang. Model berikutnya sebaiknya melakukan review/refactor keterbacaan sebelum memperluas fitur, tanpa mengubah perilaku yang sudah diuji.

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
