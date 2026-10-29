> **ARSIP RENCANA — bukan instruksi kerja/status aktif.** Dipertahankan untuk konteks keputusan lama; sebagian fitur di bawah sudah diimplementasikan. Aturan pengiriman patch/fix, kewajiban izin/delegasi, dan pernyataan “belum ada kode” di arsip tidak berlaku otomatis. Gunakan [indeks aktif](README.md), [status proyek](PROJECT_STATUS.md), [backlog](../TODO.md), dan [metode kerja](WORKFLOW.md).

# docs/UI_PLAN_ADDENDUM_v1.2.md - keputusan baru (2026-10-12), melengkapi UI_PLAN v1.1
Status: keputusan pemilik; agen tidak mengubahnya tanpa persetujuan baru. Tanda [BERUBAH] = berbeda dari UI_PLAN v1.1.

## D1 [BERUBAH] Viewer utama = prismarine-viewer (render asli milik Prismarine)
- Pemilik meminta render asli prismarine-viewer, BUKAN gambar buatan sendiri. UI_PLAN v1.1 bagian 2 menyebut viewer 3D sebagai add-on yang UI "TIDAK boleh bergantung padanya"; arti yang berlaku sekarang: UI tetap berfungsi penuh tanpa viewer (viewer mati/tak terpasang), tetapi bila aktif viewer menjadi panel kelas satu (bukan sekadar tautan tersembunyi).
- Tetap berlaku dari v1.1: opsional (ARCADIA_VIEWER=1), dimuat malas, bind 127.0.0.1 (dipaksa oleh control/viewer3d.js), read-only, tidak ada kontrol bot lewat viewer.
- Bukti spike dari kode paket (TERBUKTI dari kode, belum dijalankan dengan bot): README mendaftar 1.21.1; ukuran terpasang ~372 MB; `lib/mineflayer.js` memanggil `http.listen(port)` tanpa host (semua interface, tanpa autentikasi). Belum diketahui: render blok modded, beban Termux, kelayakan iframe/proxy (socket.io di akar path) - itu isi paket V-0 dan V-1.
## D2 Peta 2D (control/map.js, ui/js/mapcard.mjs) = "minimap data", cadangan ringan
- Dibuat sebelum keputusan D1. Dipertahankan sementara sebagai cadangan (murah, tanpa dependency, cocok Termux, klik sel -> nav.goto). Tidak dikembangkan lagi. Keputusan akhir pertahankan/hapus: pemilik setelah V-1 selesai (opsi hapus: map.js, rute /map, mapcard.mjs, tests/map.test.js bagian peta).
## D3 Controller pelengkap lewat pembungkus (sementara)
- control/extend.js membungkus listener control/index.js agar tidak mengedit berkas milik agen lain. Jangka menengah: pindahkan rute yang stabil ke control/index.js (paket E-1) lalu hapus pembungkus.
## D4 Autentikasi UI
- Cookie `arcadia_<port>` HttpOnly SameSite=Strict (menjawab keputusan terbuka UI-3 dan jebakan cookie per port); JS UI tidak memegang token. Rute lama menerima cookie lewat pemetaan ke header di pembungkus.
## D5 Director: model hanya mengusulkan
- Task dari model bersumber `planner`, status pending, masuk antrean hanya setelah Setujui (atau skill di ARCADIA_DIRECTOR_AUTO). Otonomi MATI. Chat pemain/isi inventory dianggap DATA tak tepercaya (bagian KEADAAN prompt); chat tidak dimasukkan ke konteks.
## D6 Klien model langsung tanpa SDK
- Dua provider (anthropic, openai/kompatibel). Alasan: nol dependency baru di Termux, kontrol penuh atas kunci/redirect/timeout. Konsekuensi: keluaran masih JSON bebas (di-parse + divalidasi); fungsi/tool-calling terstruktur = paket O-1.
## D7 Jalur orkestrasi (lihat docs/ORCHESTRATOR_PLAN.md)
- Director tumbuh bertahap: L0 usul+setuju manual (ada) -> L1 usul terstruktur+audit+evaluasi -> L2 loop multi-langkah dengan anggaran -> L3 kebijakan otonomi -> L4 hub multi-bot. Tiap level punya syarat selesai terukur; naik level hanya setelah level di bawahnya terbukti.
