# Rencana upgrade Arcadia — 19 Oktober 2026

Update implementasi: pemuatan Momoi, renderer stabil, autosave, dan kalibrasi per model sudah dikerjakan pada 19 Oktober; lihat CHANGELOG bagian Profil GLB v2. Validasi browser/aset nyata memakai API terisolasi, tanpa server Minecraft. P1–P3 tetap usulan.

Status awal dokumen: USULAN untuk evaluasi pemilik. Sesi ini hanya memeriksa source/aset dan menulis dokumentasi; tidak mengubah aplikasi, menyalakan server, memanggil LLM, atau menjalankan ulang suite tes.

## 1. Kondisi aktual dan koreksi catatan lama

- Git saat audit: HEAD `a0772a3` ("fixing 3d model (fail), upgrade lifecycle (fail)"), working tree awal bersih. Catatan 16 Oktober "belum di-commit" adalah riwayat, bukan kondisi terkini.
- Model pemilik sudah tersedia: `data/models/Momoi.glb`, 4.259.556 byte. Pembacaan metadata lokal menemukan header glTF 2, ukuran deklarasi sesuai file, 10 mesh, 2 skin, 37 animasi, serta 13 PNG tertanam. Ini inspeksi metadata, bukan validasi penuh geometri/rig/render.
- Tidak ada deklarasi extensionsRequired/extensionsUsed pada metadata tersebut; tidak ada URI eksternal pada image/buffer. Belum ada dasar untuk langsung menyalahkan kompresi atau meminta konversi model.
- Konfigurasi lokal BotAlpha saat audit masih memilih `arcadia-calibration.glb`. File Momoi ada, tetapi memilihnya di UI saat ini belum langsung memuatnya: penyimpanan dipicu tombol "Simpan kalibrasi".
- DILAPORKAN pemilik: model gagal dimuat. BELUM DIUJI pada sesi ini: reproduksi gagal muat di browser dan model Momoi berjalan di UI.
- Source Director masih mengembalikan `autonomy:false`; endpoint autonomy mengembalikan 501. Lifecycle masih propose/approve dan sampler berbobot aturan. Belum ditemukan ranker ML terlatih pada jalur keputusan yang diperiksa.
- Target produk boleh berpusat pada ML/LLM, tetapi kemampuan runtime belum sampai ke sana. UI harus menampilkan kemampuan nyata serta sumber keputusan.
- Angka tes lama di CHANGELOG adalah hasil sesi sebelumnya, bukan validasi rencana upgrade ini.

## 2. P0 — Momoi benar-benar tampil dan dapat dikalibrasi

Tujuan: profil karakter menjadi bagian utama pengalaman AI Life, memakai aset pemilik.

Temuan source yang harus diperiksa:
1. DUGAAN: CSP `control/static.js` hanya memberi `connect-src 'self'`. GLTFLoader lokal mengubah PNG tertanam menjadi URL blob; ImageBitmapLoader Three.js r128 menggunakan fetch untuk membacanya. Izin blob pada img-src saja belum menjelaskan izin jalur fetch. Rekam console/network di browser target untuk membuktikan atau menolak dugaan ini.
2. DUGAAN: `dispose()` memanggil forceContextLoss lalu `loadModel()` langsung membangun renderer baru pada kanvas yang sama. Audit pergantian model dan lifecycle konteks WebGL.
3. Source belum menjaga respons load yang datang terlambat saat berpindah bot/model; belum ada penyesuaian renderer mengikuti resize. Kalibrasi skala juga memanggil fit kamera kembali, sehingga efek zoom perlu diperiksa.

Upgrade:
- Pisahkan status memilih, mengunduh, membaca GLB, memuat tekstur, dan merender. Tampilkan error tahap yang spesifik serta tombol coba lagi.
- Pilihan model langsung memuat pratinjau; perubahan kalibrasi tersimpan otomatis dengan debounce dan indikator tersimpan/gagal. Tidak membutuhkan tombol Apply untuk pergantian biasa.
- Gunakan renderer yang stabil; batalkan/abaikan hasil load usang; bersihkan aset lama tanpa merusak renderer aktif; tangani resize dan konteks yang hilang.
- Kalibrasi orientasi, framing/zoom, skala, kecepatan animasi, loop/sekali, transisi, dan reset per model/per bot.
- Jangan mengasumsikan semua model perlu decoder baru; tambahkan dukungan hanya berdasarkan metadata/error nyata.

Mapping awal Momoi (USULAN, perlu pratinjau visual):
| Kondisi | Clip kandidat | Perlakuan |
|---|---|---|
| Diam | Cafe_Idle atau Normal_Idle | Loop |
| Bergerak | Cafe_Walk atau Move_Ing | Loop selama gerak |
| Berinteraksi | Cafe_Reaction | Sekali lalu kembali idle |
| Misi sukses | Victory_Start lalu Victory_End | Verifikasi arti/transisi clip |
| Bahaya | Vital_Panic | Verifikasi visual sebelum dipakai |
| Lelah/sedih | Belum ditentukan | Kalibrasi manual; jangan pakai animasi mati sebagai pengganti |

Pisahkan aktivitas (diam/jalan/kerja), emosi (ceria/sedih), dan reaksi sesaat (terluka/sukses). Data task/gerak menjadi pemicu utama; LLM dapat memberi intent emosi terstruktur, sementara pemetaan clip tetap lokal. Tidak perlu panggilan model setiap frame.

Selesai bila: Momoi tampil dengan tekstur dan rig benar; clip aktual bisa dipratinjau; pergantian model/bot berulang tidak membekukan kanvas atau menampilkan model bot lain; preferensi pulih setelah reload. Satu pemeriksaan visual terarah dengan model asli lebih bernilai daripada menambah tes segitiga.

## 3. P1 — UI AI Life dengan karakter dan misi sebagai pusat

Masalah: app.mjs masih menempatkan form skill, antrean, Director, lifecycle, dan chat sebagai panel terpisah. Pemilik harus menghubungkan proses berpikir dan pelaksanaannya sendiri.

Susunan yang diusulkan:
- **Companion:** karakter 3D dominan, nama, mood, hubungan, kebutuhan utama, aktivitas saat ini, dan percakapan/tujuan.
- **Dunia:** Eagle View tetap tersedia per bot; bisa menjadi tampilan utama saat memantau pekerjaan. Pilihan karakter/dunia tidak membuat ulang renderer.
- **Kegiatan:** satu kartu bertajuk, alasan singkat, langkah aktif, progres, hasil, intervensi pemilik.
- **Ingatan & perkembangan:** preferensi, pengalaman, keterampilan, tren afeksi, dan ringkasan pengalaman yang benar-benar tercatat.
- **Pengaturan:** model/animasi, provider, kebijakan otomatis, batas sumber daya. Form skill mentah, log, JSON, dan antrean teknis masuk panel Lanjutan.

Contoh pengalaman: "Hari yang indah untuk bertanam" → persiapan → panen/tanam ulang → memancing → memasak jika skill tersedia → simpan hasil. Pemilik cukup memberi tujuan, mengubah prioritas, menjeda, atau membatalkan.

Bedakan chat companion, instruksi tujuan, dan chat Minecraft: source chat saat ini mengirim pesan ke game. Jangan melabelinya percakapan AI sebelum ada jalur respons LLM.

Tampilkan sumber keputusan (aturan/offline/LLM), ringkasan alasan, dan status sedang merencanakan/berjalan/terhalang. Jangan menampilkan penalaran internal atau mengarang pikiran/ingatan karakter.

Selesai bila: pemilik dapat mengikuti satu kegiatan dari tujuan sampai hasil tanpa memahami nama skill. HP menampilkan karakter/kegiatan dengan nyaman; tidak ada reset view saat polling; pengaturan tersimpan langsung.

## 4. P2 — Satukan Director dan lifecycle melalui mission runner

Konsep tetap: **satu judul mewakili kumpulan task**, dengan konteks, tujuan hasil, alasan pemilihan, dan skor. Director dan generator offline menghasilkan format misi yang sama.

Usulan kontrak (belum API yang tersedia): missionId, botId, title, goal, source, steps, dependencies, preconditions, successCriteria, decisionScore, outcomeScore, policyVersion, status, checkpoint.

Celah source saat ini:
- Lifecycle memasukkan seluruh langkah ke antrean sekaligus. Engine mengurutkan berdasarkan priority; urutan array bukan jaminan dependency.
- Kegagalan biasa tidak otomatis membatalkan langkah lanjutan yang bergantung pada hasilnya. Kumpulan task belum setara runner misi.
- Batch/cooldown berada di memori; pulih setelah restart belum menjadi alur misi persisten.
- Director dan lifecycle belum berbagi satu lifecycle misi lengkap.

Upgrade:
1. Runner memilih langkah yang dependency/prasyaratnya terpenuhi, menjalankan, membaca hasil nyata, lalu melanjutkan.
2. Tangani blocked, retry terbatas, skip opsional, replan, cancel, dan stop. Simpan checkpoint; setelah restart cocokkan keadaan dunia sebelum mengulang aksi.
3. LLM menyusun/memperbaiki rencana pada awal misi atau hambatan penting; engine tetap mengeksekusi skill dan batas keselamatan secara lokal.
4. Mode UI: Manual, Bantuan, Otomatis terbatas. Pemilik menetapkan kebijakan sekali; kegiatan yang memenuhi kebijakan berjalan tanpa persetujuan setiap langkah. Batas tindakan, durasi, biaya/token, dan stop tetap jelas.
5. Tambah cooking/smelting hanya ketika alur nyata membutuhkannya; jangan menampilkan memasak sebagai kemampuan yang sudah ada.

Selesai bila: satu misi multi-langkah selesai di server; gagal panen tidak memicu langkah yang membutuhkan hasil panen; stop mencegah langkah baru; restart tidak menggandakan aksi; pemilik melihat penyebab terhalang dan hasil akhir.

## 5. P3 — Statistik bermakna dan generator offline yang belajar

Jumlah meter bukan ukuran kecerdasan. Pisahkan:
- Observasi nyata: HP, makanan, inventory, waktu, posisi, ancaman, durasi, keberhasilan.
- State persona persisten: energi, afeksi, preferensi; aturan perubahan harus jelas dan dapat diaudit.
- Nilai prediksi: peluang sukses, waktu/biaya, kecocokan misi; beri label prediksi dan kualitas data.
- Statistik belum diketahui harus tetap unknown, bukan otomatis dianggap aman/sehat.

Pisahkan skor pemilihan sebelum aksi dan skor hasil sesudah aksi. Data outcome tidak boleh bocor ke fitur input pelatihan.

Dataset minimum per keputusan: kandidat misi (termasuk yang tidak dipilih), fitur sebelum keputusan + indikator missing, pilihan, kebijakan/model/versi fitur, alasan penolakan, hasil per langkah, reward, feedback pemilik. Metadata judul/faktor saat ini belum dicatat lengkap pada event batch.proposed; jangan mengklaim dataset training lengkap.

Perbaiki riwayat skor: source memilih bucket skill dengan jumlah sampel terbesar, dan bundle memakai riwayat skill pertama. Rancang agregasi per bot/konteks dan per keseluruhan misi agar skor tidak mewakili langkah pertama saja.

Jalur pembelajaran:
1. Heuristic offline menjadi baseline yang selalu tersedia.
2. LLM memberi usulan/ranking/label opsional dalam anggaran; label LLM dibedakan dari hasil dunia nyata.
3. Latih ranker lokal dari dataset yang telah diaudit. Pisahkan evaluasi berdasarkan waktu/sesi; bandingkan completion, kegagalan, durasi, variasi aktivitas, dan intervensi pemilik.
4. Jalankan ranker sebagai pembanding tanpa mengendalikan bot dulu, lalu aktifkan bila mengungguli baseline. Simpan versi dan rollback.
5. Generator offline memilih/menyusun template bertajuk dan parameter lokal. Menjalankan LLM lokal adalah jalur tambahan jika kelak diperlukan teks/rencana bebas offline.

Selesai bila: putus koneksi provider tidak menghentikan pemilihan kegiatan aman; sumber keputusan terlihat; model terlatih memiliki hasil evaluasi terhadap baseline, bukan hanya file bobot.

## 6. Urutan pengerjaan dan batas lingkup

Urutan: **P0 model asli → P1 tampilan companion/kegiatan → P2 runner misi → P3 dataset dan ML**. UI P1 dapat dimulai dengan status backend yang tersedia, tetapi jangan menampilkan tombol otonomi seolah sudah berfungsi.

Login pelanggan/multi-tenant tetap pekerjaan terpisah sesudah alur satu bot stabil: identitas, kepemilikan bot/aset, session, dan otorisasi server. Jangan menganggap dropdown bot atau account chip sudah mengisolasi pelanggan.

Untuk menghemat waktu/token: satu tahap, satu hasil yang bisa diperiksa, uji paling relevan, ringkasan singkat. Refactor hanya modul yang disentuh. Jangan mengganti framework atau seluruh dependency tanpa kebutuhan yang terukur.

Keputusan yang perlu dievaluasi pemilik: komposisi karakter vs dunia, tindakan yang boleh otomatis, serta arti/perubahan afeksi. Rekomendasi awal: karakter + kartu kegiatan menjadi tampilan utama; Eagle View satu klik; otomatis mengikuti kebijakan yang dipilih pemilik.
