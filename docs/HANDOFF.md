# Handoff aktif — 29 Oktober 2026

Baca [aturan agent](../AGENTS.md), [backlog aktif](../TODO.md), dan [indeks](README.md). Riwayat teknis lengkap sampai 21 Oktober disimpan di [arsip handoff](archive/HANDOFF_2026-10-21.md); instruksi/status lama tidak berlaku sebagai perintah baru.

## Baseline dan keputusan pemilik

- Source yang diaudit: branch `plus`, commit `38ba803` (`add ui model to multi`). Working tree bersih saat audit dimulai. Tidak ada branch lokal `main` saat pemeriksaan; sesi ini tidak melakukan merge, commit, atau rename branch.
- Proyek native dalam arti fitur terintegrasi langsung ke source Node.js/web. Bukan sertifikasi/afiliasi resmi Minecraft atau dukungan modded sempurna.
- Codex, Claude Code, Antigravity dan agent workspace wajib mengedit file langsung. Tidak boleh membuat/menjalankan `fix.js` atau upgrader source. Chat tanpa akses workspace memakai ZIP berisi berkas final. [WORKFLOW.md](WORKFLOW.md) adalah rujukan metode.
- `patch-all.js` dan empat patch dependency postinstall tetap diperlukan untuk kompatibilitas NeoForge; jangan disamakan dengan installer source historis `install/fix-*.js`.
- Native tidak otomatis berarti siap main/production. Keputusan audit dan gate: [PROJECT_STATUS.md](PROJECT_STATUS.md).

## Kondisi implementasi

- `bot.js` menghubungkan Mineflayer ke NeoForge 1.21.1 (auth offline). `adapt.js` mempelajari channel/protokol dari log.
- `agent/` menjalankan keputusan LLM berulang, izin Observasi/Semi/Penuh, checkpoint, observasi setelah restart, QuickJS dan command Docker. `orchestrator/llm.js` menyediakan klien provider; `director.js` menyusun konteks, prompt, validasi dan budget.
- `engine/` mengeksekusi skill; `lifecycle/` menyediakan persona, skor, kegiatan offline, misi dan ingatan. Agent serta misi tidak menjadi pemilik eksekusi bersamaan. Training ML belum ada.
- Anti-loop: hasil pencarian eksplisit, normalisasi hasil skill, forced tool call + koreksi invalid terbatas, `NO_PROGRESS`, dan `world.explore`. Jangan sekadar menaikkan radius melebihi batas skill.
- `admin/` menyediakan owner login, worker per bot, registry, sesi, kontrol single/multi, proxy kamera satu origin. Customer management lengkap belum ada.
- Profil GLB tiap kartu Multi, framing X/Y per bot/model, profil tersedia saat worker offline, log agent ringkas. Polling mempertahankan kartu/kamera. Single yang sudah terbuka belum otomatis menerima kalibrasi dari Multi; tombol Muat ulang model tersedia.

## Bukti dan batas

- **TERBUKTI (riwayat log pemilik):** koneksi/spawn, sejumlah aksi vanilla, viewer standalone, request Ollama dan eksekusi agent; bukti tersebut tidak mencakup semua fitur terbaru.
- **TERUJI TIRUAN (21 Oktober):** anti-loop, bootstrap mining, admin multi-worker, misi/recovery, profil GLB Momoi dan UI di Edge.
- Audit ulang 29 Oktober dicatat terpisah di [PROJECT_STATUS.md](PROJECT_STATUS.md), tanpa memanggil LLM cloud atau menghubungkan bot ke Minecraft.
- **BELUM DIUJI:** anti-loop terbaru di server asli, multi-bot/LLM end-to-end setelah upgrade, Docker nyata, instalasi bersih serta Linux/Termux fisik.
- Parsing komponen item modded dapat membuang paket window/items/metadata. Jalur SNBT membutuhkan izin command server; jangan menyamakan observasi inventory yang tidak lengkap dengan tidak ada bahan.
- Jangan klaim agent dapat membangun semua rumah/portal atau ML sudah belajar otomatis.

## Melanjutkan pekerjaan

Permintaan berikutnya adalah analisis fix vs upgrade, bukan implementasi. [CORE_ROADMAP.md](CORE_ROADMAP.md) mengusulkan R0 baseline, R1 reliability, R2 progres/prasyarat terverifikasi, lalu R3 shelter. Status **USULAN menunggu verifikasi pemilik**; jangan menganggap roadmap sudah disetujui. Temuan tambahan dari source: pembanding anti-loop belum mencatat revisi dunia, evidence finish belum menguji syarat tujuan, usage keputusan gagal tidak diteruskan ke goal, dan autosave profil penuh berpotensi menimpa state terbaru. Kasus dampaknya belum direproduksi pada analisis ini.

Ikuti prioritas di TODO, periksa diff sebelum mengedit, lalu baca hanya source/panduan fitur yang perlu. Riwayat uji tidak perlu dijalankan ulang untuk perubahan dokumentasi; audit main boleh menjalankan suite regresi sekali dan mencatat kegagalannya. Jangan membuka key `.env` untuk pemeriksaan biasa. Jangan menghidupkan kembali skrip lama yang tercantum di AGENTS.md.
