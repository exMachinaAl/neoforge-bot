# AGENTS.md - aturan untuk AI agent di repo ini
Baca dulu: docs/HANDOFF.md (konteks lengkap) dan TODO.md (backlog). README.md = cara pakai.

## Aturan kerja
- Bahasa Indonesia, ringkas. Pemilik bekerja dari HP/Termux: satu blok perintah per langkah. Output di chat, bukan file Word.
- JANGAN menebak nama API/format. Verifikasi ke source (node_modules, source NeoForge/mineflayer) atau minta log. Bila tidak yakin, katakan itu dugaan.
- Label klaim: TERBUKTI (dari log pemilik) / DILAPORKAN / TERUJI TIRUAN / BELUM DIUJI. Jangan klaim terbukti sebelum diuji di server asli.
- Patch lewat skrip sementara fix-xxx.js: anchor + penanda "sudah ter-fix", node --check, lalu hapus skrip. Sebelum "cat >>" pastikan file berakhir newline.
- "node --check" hanya memeriksa SATU file per perintah.
- Jangan commit: server/, mc.local.json, *.log, node_modules/. Jangan simpan IP/kredensial di repo.
- Setelah mengubah skema/skill: npm run check.
- Jangan menghidupkan lagi skrip lama yang sudah dihapus (daftar di docs/HANDOFF.md).
