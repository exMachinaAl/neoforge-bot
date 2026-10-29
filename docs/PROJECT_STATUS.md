# Status native dan audit main — 29 Oktober 2026

## Kesimpulan

**Integrasi source: ya.** Arcadia adalah aplikasi Node.js/web yang menjalankan fitur langsung dari repository: entry bot, admin, agent, Director, engine, skills, lifecycle dan UI. Tidak perlu menjalankan installer `fix.js` untuk mengaktifkan fitur yang sudah ada. Source membuktikan wiring ini; keberhasilan semua skenario Minecraft adalah penilaian terpisah.

**Siap main tanpa syarat: belum.** Baseline `38ba803` pada branch lokal `plus` layak menjadi kandidat branch pengembangan utama setelah gate repository/instalasi di bawah diselesaikan. Audit ini tidak melakukan merge, rename branch, commit atau push. Tidak ada branch lokal `main` saat pemeriksaan; konfigurasi default branch remote tidak diperiksa.

**Siap rilis production stabil: belum dapat dinyatakan.** Pengujian tiruan lulus tidak mencakup seluruh kombinasi mod, model/provider, perangkat dan beban multi-bot.

“Native” di sini tidak berarti mod Java NeoForge, biner desktop, bebas dependency, dukungan modded penuh, atau sertifikasi/afiliasi resmi Mojang/Microsoft. Patch dependency kompatibilitas NeoForge masih bagian instalasi.

## Bukti audit saat ini

Lingkungan: Windows, Node.js 24.21.0, npm 11.19.0, dependency yang sudah terpasang. Working tree bersih sebelum penyuntingan dokumentasi.

| Pemeriksaan | Hasil dan cakupan |
|---|---|
| Wiring source | `bot.js` langsung memasang runner, engine, lifecycle dan control/extend; admin masuk melalui `admin/index.js`. Fitur bukan sekadar berkas installer. |
| `npm test` | **TERUJI TIRUAN: LULUS, exit 0.** Suite skill/engine/API/UI/Director/lifecycle, misi, bootstrap mining dan agent. |
| `npm run check` | **TERUJI TIRUAN: LULUS.** 41 kasus kontrak, 17 manifest skill, 8 kasus makro. |
| `npm run test:llm-config` | **TERUJI TIRUAN: LULUS.** Loader env, prioritas, pewarisan child dan status tanpa membocorkan key. |
| `npm run test:admin` | **TERUJI TIRUAN: LULUS, exit 0.** Login, dua worker fixture, proxy kamera HTTP/WebSocket, profil offline, isolasi akses dan persistensi sesi. |
| Browser/GLB | **TERUJI TIRUAN, riwayat 21 Oktober.** Edge, Momoi, Multi/Single dan kamera; tidak dijalankan ulang untuk perubahan dokumentasi. |
| Fresh install, Docker command, Minecraft/LLM cloud nyata, Linux/Termux fisik | **BELUM DIUJI pada audit ini.** Tidak menginstal ulang dependency atau me-restart proses produksi. |

Tes memakai mock/server HTTP lokal/worker fixture. Tidak ada validasi ulang penuh terhadap dunia Minecraft pemilik. Symlink profil pada Windows sebelumnya dapat dilewati karena izin; kelulusan suite bukan bukti semua path platform sudah diuji.

## Gate sebelum main

1. **Konfigurasi lokal masih terlacak.** `git ls-files` menemukan `mc.local.json.bp1` dan `mc.local.json.bp2`. Isinya tidak dibuka; tidak menyatakan bahwa keduanya berisi secret. Keluarkan dari pelacakan tanpa menghapus salinan pemilik dan perbaiki pola ignore (pola `*.bp` tidak mencakup suffix `.bp1/.bp2`). Jika pernah memuat kredensial, evaluasi riwayat/rotasi secara terpisah.
2. **Instalasi harus dapat diulang dari checkout bersih.** Viewer/canvas memakai `npm run viewer:install` dengan `--no-save --package-lock=false`; tes admin mengimpor `socket.io-client` yang bukan dependency langsung. Bukti tes dengan node_modules yang sudah terpasang belum membuktikan `npm ci` saja cukup untuk semua suite. Tetapkan kontrak dependency core/opsional dan verifikasi instalasi terisolasi.
3. **Kegagalan postinstall belum menghentikan instalasi.** `patch-all.js` menghitung dan mencetak kegagalan, tetapi tidak menetapkan exit code gagal. Perbaiki serta uji agar instalasi tidak tampak sukses saat compatibility patch rusak.
4. **Gate verifikasi harus dijalankan pada candidate commit.** Tidak ada workflow CI terlacak di `.github/` saat audit. CI atau prosedur gate yang dapat diulang perlu mencakup check, regresi core, env, dan admin dengan dependency yang dinyatakan.

Temuan tersebut dicatat sebagai backlog; sesi ini hanya menyunting dokumentasi, bukan menghapus data lokal atau memperbaiki runtime secara diam-diam.

## Batas menuju rilis stabil

- Uji lapangan anti-loop/eksplorasi dan penggunaan hasil parsial setelah kegagalan.
- Uji bootstrap mining/crafting, recovery item bermuatan komponen modded, serta restart di tengah aksi.
- Uji admin multi-bot dengan provider sungguhan, budget lintas worker, dan kamera/GLB jangka panjang.
- Sinkronisasi framing Multi → Single yang sudah terbuka belum otomatis; kontrol Single dapat memuat ulang profil.
- Sandbox Docker nyata, Linux/Termux fisik, TLS eksternal dan customer management belum lengkap.
- Task generator saat ini berbasis aturan/skor dan LLM; belum ada model ML terlatih atau jaminan pembangunan rumah/portal untuk setiap tujuan.

Catatan bukti sebelumnya: [CHANGELOG](CHANGELOG.md), [FIELD_TESTS](FIELD_TESTS.md), [handoff arsip](archive/HANDOFF_2026-10-21.md). Pekerjaan berikut: [TODO](../TODO.md).
