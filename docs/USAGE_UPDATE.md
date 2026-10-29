# Memperbarui instalasi Arcadia

Source repository adalah versi aplikasi yang dijalankan. Semua fitur terintegrasi; jangan menjalankan `install/fix-*.js`, fragmen `docs/_append/`, atau ZIP lama untuk mengaktifkan fitur terbaru.

## Jika dibantu agent workspace

Codex, Claude Code, Antigravity dan agent setara mengedit langsung di folder proyek. Pemilik tidak perlu menjalankan skrip apply. Agent memeriksa diff, menjalankan pemeriksaan relevan, dan melaporkan file/perilaku yang berubah.

## Jika upgrade berasal dari chat

Gunakan ZIP berisi source final berdasarkan baseline yang sama. Ekstrak dahulu ke folder sementara, cocokkan manifest dan diff, lalu salin hanya file source yang disepakati. Lindungi `.env`, `mc.local.json*`, `data/`, `server/` dan perubahan lokal. Daftar file yang perlu dihapus harus eksplisit; tidak ada skrip penghapus atau penambal tersembunyi.

Isi ZIP dan alur penerapan lengkap: [WORKFLOW.md](WORKFLOW.md).

## Setelah source diperbarui

Jika manifest/lockfile dependency berubah, jalankan `npm ci` lalu periksa seluruh keluaran postinstall. Viewer adalah dependency opsional; pasang kembali lewat `npm run viewer:install` bila perlu. Jalankan tes sesuai perubahan. Hentikan proses lama secara wajar, mulai admin/bot lagi, dan refresh browser untuk memuat frontend baru.

Cara pakai sekarang: [README](../README.md), [admin](ADMIN_PANEL.md), [LLM](LLM_SETUP.md), [agent](AGENT_RUNTIME.md), [misi offline/legacy](MISSIONS.md). Catatan upgrade historis tersedia dalam [CHANGELOG](CHANGELOG.md).
