# Aturan kerja AI — Arcadia

Baca [docs/HANDOFF.md](docs/HANDOFF.md), [TODO.md](TODO.md), lalu dokumentasi fitur yang relevan dari [docs/README.md](docs/README.md). [README.md](README.md) adalah panduan pengguna.

## Metode wajib

- **Codex, Claude Code, Antigravity, dan agent dengan akses workspace wajib bekerja langsung di folder lokal proyek.** Periksa source dan diff, edit berkas tujuan, lalu jalankan pemeriksaan yang relevan.
- **Dilarang membuat atau menjalankan `fix.js`, `fix-*.js`, installer/apply/upgrader untuk memodifikasi source sebagai cara menyerahkan perubahan.** Editor atau tool patch bawaan agent yang langsung mengedit berkas diperbolehkan. Jangan menyuruh pemilik menerapkan ulang pekerjaan yang bisa dilakukan agent.
- **Claude, ChatGPT, Gemini dalam mode chat tanpa akses folder memakai paket `.zip`.** Paket berisi berkas final dengan struktur path proyek, bukan skrip penambal. Dasarkan paket pada source terbaru yang diberikan pemilik; jangan menebak isi berkas yang belum diperiksa.
- Metode ditentukan oleh akses nyata, bukan nama model. Chat yang memiliki akses workspace mengikuti aturan agent lokal.
- Rincian isi ZIP, pengujian, dan perlindungan data: [docs/WORKFLOW.md](docs/WORKFLOW.md).
- `patch-all.js` dan empat `patch-*.js` yang sudah menjadi postinstall adalah bagian kompatibilitas dependency NeoForge. Itu bukan metode pengiriman upgrade source; jangan hapus atau jalankan installer historis `install/fix-*.js` sebagai penggantinya.

## Cara bekerja

- Bahasa Indonesia, ringkas. Pemilik juga bekerja dari HP/Termux: satu blok perintah per langkah. Laporkan hasil di chat.
- Verifikasi nama API/format terhadap source proyek, dependency, atau log; nyatakan dugaan bila belum pasti.
- Label bukti: **TERBUKTI** = log server asli/pemilik; **DILAPORKAN** = laporan pemilik tanpa verifikasi log; **TERUJI TIRUAN** = mock/API/browser terisolasi; **BELUM DIUJI** = belum ada bukti sesuai cakupan. Source yang tersedia bukan bukti keberhasilan lapangan.
- Hormati perubahan lokal pemilik. Jangan reset, checkout ulang berkas, commit, merge, push, atau mengganti branch tanpa permintaan yang sesuai.
- Uji sesuai dampak perubahan; jangan mengulang suite yang lulus tanpa alasan baru. Setelah mengubah skema/skill, wajib `npm run check`. `node --check` memeriksa satu file per perintah.
- Jangan membaca/mencetak key untuk audit biasa. Jangan memasukkan `.env`, `server/`, `mc.local.json*`, `*.log`, `node_modules/`, atau data runtime/customer ke commit/paket.
- Jangan menghidupkan kembali skrip lama: `probe.js`, `probe2.js`, `fixflows.js`, `fixversions.js`, `autoneg.sh`, `autopatch.sh`, `autoserver.sh`, `add.js`, `ping.js`.
- Gunakan backlog aktif; dokumen berlabel ARSIP tidak memberi instruksi kerja, izin delegasi, atau kewajiban tes baru.
- Saat pekerjaan selesai, perbarui changelog dan handoff/backlog hanya bila statusnya berubah. Jangan mengubah runtime dalam tugas dokumentasi tanpa kebutuhan yang disetujui.
