# Arcadia Admin — 2026-10-20

Panel admin sekarang memiliki login owner, registry bot, pengelola proses, dashboard multi-kamera, dan mode single companion dalam satu origin. Implementasi langsung di source; tidak ada apply/upgrader.

## Jalankan

Dari folder proyek, jika konfigurasi Ollama Windows sudah disimpan:

```powershell
. .\scripts\load-ollama.ps1
npm run admin
```

Tanpa LLM, cukup `npm run admin`; pengelolaan bot, kamera, task manual, dan generator offline tetap tersedia. Worker mewarisi konfigurasi LLM dari proses admin, jadi perubahan environment membutuhkan restart admin/worker.

Buka **http://localhost:8788**. Buat akun owner pertama dari mesin yang menjalankan panel; password minimal 12 karakter. Setelah itu login memakai alamat yang sama, tanpa token URL. Sesi bertahan tujuh hari, tersimpan server-side dalam bentuk hash token, dan dapat dicabut lewat Keluar. Password menggunakan scrypt. Restart bot tidak mengubah sesi admin.

Panel baru tidak menghentikan proses standalone lama pada port 8787. Sebelum memulai username Minecraft yang sama dari admin, hentikan bot standalone tersebut agar tidak terjadi login ganda.

## Alur penggunaan

1. **Tambah bot**: isi nama tampilan, username Minecraft, host dan port. Koneksi mengikuti implementasi proyek: NeoForge 1.21.1 dengan auth offline. Konfigurasi tersimpan sebelum bot terhubung.
2. Pilih **Salin profil, persona, dan misi lama** jika ingin membawa data username tersebut. Contoh: BotAlpha membawa pilihan Momoi dan kalibrasi lama. Sumber lama tidak diubah. Hentikan bot lama terlebih dahulu agar salinannya konsisten.
3. Tekan **Mulai** pada kartu; setiap bot memperoleh proses, API privat, data runtime dan ID internal terpisah.
4. Pilih **Fokus Eagle**: Eagle View tampil di panel utama sementara kartu bot lain tetap terlihat di desktop. Kamera yang sudah terbuka tidak diganti saat statistik diperbarui.
5. **Buka kamera** di kartu menampilkan first-person bot tersebut. **Buka semua FP** membuka semua bot yang siap, termasuk bot fokus. **Tutup kamera** melepaskan iframe pada browser ini; worker kamera tetap tersedia untuk klien lain. **Tutup semua kamera** melepaskan semua iframe dashboard.
6. **Single / companion** membuka karakter GLB, kegiatan, percakapan, ingatan dan kontrol detail untuk bot fokus. Kembali ke Multi tidak membuat ulang iframe single selama bot fokus sama.
7. Kotak centang + **Mulai/Hentikan/Restart terpilih** mengirim kontrol proses dengan hasil per bot. **Jeda kegiatan** menghentikan kegiatan bot fokus; bot tetap online. **Jeda darurat semua** memakai killswitch tiap worker. Pemeriksaan/resume misi tetap tersedia di Single.
8. **Hapus** tersedia setelah proses berhenti. Konfigurasi dikeluarkan dari daftar, tetapi folder data bot tetap disimpan.

Eagle/first-person adalah kamera pengamatan. Kontrol tindakan saat ini melalui tujuan/misi, task, chat Minecraft dan kontrol proses. Teleoperasi WASD/mouse-look belum tersedia. Banyak iframe 3D menambah beban GPU/CPU; buka hanya kamera yang dibutuhkan atau gunakan Tutup semua kamera.

## Arsitektur dan data

- `admin/index.js` entrypoint; `admin/server.js` login, API gateway, SSE, serta proxy HTTP/Socket.IO WebSocket viewer.
- `admin/state.js` menyimpan registry, hash password dan sesi. Metadata menggunakan JSON atomic rename dengan **satu penulis dan process lock** pada tahap ini; usulan SQLite dalam rencana awal belum digunakan.
- `admin/manager.js` mengelola fork worker, port privat, heartbeat, startup timeout, stop/restart, dan reconnect terbatas tiga percobaan. Batas awal delapan worker aktif; tidak ada autostart registry saat admin baru dimulai.
- `admin/worker.js` mengirim snapshot/event melalui IPC dan menghentikan worker bila supervisor terputus. `bot.js` tetap dapat berjalan standalone.
- `control/viewer3d.js` memakai dua controller viewer terpisah, masing-masing `firstPerson:false/true`, dengan prefix URL per bot. API verified dari `node_modules/prismarine-viewer/lib/mineflayer.js` dan `lib/index.js`; client Socket.IO mengikuti pathname iframe.
- Semua request kamera, aset, polling dan upgrade WebSocket melewati akses sesi di `/view/{botId}/{eagle|first-person}/`. Logout/expiry menutup stream dan socket viewer sesi tersebut. Browser tidak menerima token API worker.
- UI `ui/admin.html`, `ui/js/admin.mjs`, `ui/css/admin.css`; single memakai UI companion yang ada melalui `/focus/{botId}`. Kartu dan kamera disimpan per bot; polling hanya memperbarui data, bukan mengganti seluruh DOM.

Default data:

| Isi | Lokasi |
|---|---|
| Akun, sesi, registry | `data/admin/admin.json` |
| Lock supervisor | `data/admin/admin.lock` |
| Profil, misi, persona, settings, telemetry worker | `data/admin/bots/{botId}/` |
| Katalog model GLB bersama | `data/models/` |

`ARCADIA_ADMIN_DATA` mengganti folder admin; `ARCADIA_MODELS_DIR` mengganti katalog model bersama. File data diabaikan Git. ID bot tidak bergantung username, sehingga username sama pada server berbeda tidak berbenturan. Import tidak mencakup histori telemetry/chest/settings lama.

## Akses dan LLM

Default bind hanya loopback, port 8788. Untuk deployment jaringan, atur `ARCADIA_ADMIN_BIND` serta `ARCADIA_ADMIN_ORIGIN` ke origin panel yang dipakai browser; gateway menolak Host/Origin asing. Deployment internet/TLS dan reverse proxy eksternal belum diuji. Jangan expose port API worker/viewer langsung ke jaringan.

Gateway membatasi jumlah **permintaan perencanaan/chat** bersama berdasarkan `ARCADIA_LLM_RPM` (default enam/menit). Director setiap worker tetap memiliki batas panggilan provider termasuk retry sendiri. Batas gateway bukan penghitung token/biaya atau semua percobaan HTTP provider. Semua bot saat ini menggunakan profil provider/model dari environment admin; pemilihan profil LLM berbeda per bot belum tersedia.

Owner login sudah diimplementasikan. Pemeriksaan ownership backend disiapkan dan diuji dengan sesi customer tiruan; halaman membuat/mengelola customer, undangan akun, dan katalog model per customer masih backlog. Katalog GLB sekarang merupakan katalog owner bersama, belum multi-tenant penuh.

## Verifikasi

**TERUJI TIRUAN**:

- `npm run test:admin`: login/setup, CSRF, hash kredensial, registry terkunci satu penulis, dua worker proses terpisah, proxy HTML/JS/worker assets, tiga Socket.IO WebSocket bersamaan, pitch first-person berbeda dari Eagle, isolasi customer tiruan, stop satu worker tanpa menghentikan yang lain, restart misi, sesi setelah restart panel, logout, dan hapus konfigurasi tanpa menghapus data.
- `npm run test:admin-browser`: Edge nyata, buat dua bot lewat form, bulk start, Eagle + first-person per bot, pergantian fokus tanpa reload FP, Momoi pada Single, sesi setelah reload, logout dan viewport 390 px tanpa overflow. Screenshot lokal `backup/admin-multi.png`.
- Regresi: engine 29, static/CSP 37, profil 18, UI 50, extend/API 50, misi 8. `npm run check` lulus. Tes symlink profil dilewati bila Windows menolak izin.

**BELUM DIUJI**: beberapa bot pada server Minecraft asli melalui admin, panggilan LLM sungguhan dari worker admin, HP fisik, beban delapan bot/kamera jangka panjang, restart paksa OS. Dunia dan bot pengujian dibuat lokal; viewer dan koneksi WebSocket yang digunakan adalah implementasi sungguhan.

Percobaan agen menyalakan panel background dengan konfigurasi Ollama ditolak peninjauan otomatis tool (`blocked by policy`). Tidak ada proses admin produksi yang dinyalakan pada sesi build ini; jalankan perintah di atas untuk mulai.
