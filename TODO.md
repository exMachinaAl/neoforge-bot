# Backlog aktif Arcadia

Diperbarui 29 Oktober 2026. Implementasi dan bukti dipisahkan: [PROJECT_STATUS.md](docs/PROJECT_STATUS.md). Backlog lama tersedia sebagai [arsip](docs/archive/TODO_2026-10-21.md); checkbox di sana tidak menentukan kondisi sekarang.

## Sebelum promosi main

Usulan urutan inti untuk verifikasi pemilik: [CORE_ROADMAP](docs/CORE_ROADMAP.md), R0 baseline → R1 reliability → R2 progres/prasyarat → R3 shelter. **Belum disahkan sebagai urutan implementasi**; tidak berarti seluruh item di bawah otomatis disetujui untuk dibangun.

- [ ] Hentikan pelacakan `mc.local.json.bp1` dan `mc.local.json.bp2` tanpa menghapus salinan lokal; evaluasi riwayat jika pernah memuat kredensial.
- [ ] Verifikasi instalasi bersih dari lockfile di checkout terisolasi; dependency viewer/canvas opsional dan dependency tes admin harus jelas.
- [ ] Buat kegagalan patch dependency menghasilkan exit code gagal; saat ini postinstall dapat terlihat berhasil walau salah satu patch gagal.
- [ ] Tinjau status audit dan hasil suite terbaru sebelum merge; belum ada CI tercatat di repository.

## Validasi lapangan

- [ ] Uji anti-loop: pencarian oak_log kosong → eksplorasi wilayah baru → gunakan progres parsial; jangan mengulang area/radius identik tanpa perubahan.
- [ ] Uji prasyarat crafting/mining dan pemindahan item bermuatan komponen modded ke chest; hasil native harus diteruskan ke keputusan agent.
- [ ] Uji restart saat task aktif: observasi dunia dulu, hindari pengulangan aksi yang belum diketahui hasilnya.
- [ ] Uji multi-bot Minecraft + Ollama lewat admin, beban kamera/GLB jangka panjang, dan HP/Termux/Linux fisik.
- [ ] Uji sandbox command Docker nyata dan batas debug/production.
- [ ] Tutup diagnosis sleep/guard/T-pose dan parsing inventory/metadata yang masih terbuka dengan log baru; lihat [FIELD_TESTS.md](docs/FIELD_TESTS.md).

## Perluasan fitur

- [ ] Anggaran panggilan/token LLM bersama yang mencakup loop agent seluruh worker.
- [ ] Framing Multi ↔ Single tersinkron tanpa reload model atau menimpa perubahan lama.
- [ ] Planner prasyarat tier batu/besi, smelting, validasi bahan/rencana bangunan, lalu portal.
- [ ] Customer management lengkap, profil LLM per bot/customer, deployment HTTPS teruji.
- [ ] Teleoperasi WASD/mouse-look; kamera first-person sudah diimplementasikan.
- [ ] Evaluasi dataset pengalaman, LLM sebagai teacher/ranker, lalu training generator/ranker offline. Kegiatan bertajuk tetap kumpulan task dengan skor multifaktor.

## Sudah diimplementasikan

Engine antrean, API/SSE, persona/lifecycle/skor, runner misi, agent berulang/izin/sandbox, admin multi-bot, Eagle/first-person, GLB/animasi/framing, log agent ringkas, setup LLM melalui `.env`, dan 17 manifest skill. Lihat status pengujian di handoff; daftar ini bukan klaim bahwa semuanya terbukti pada server asli.
