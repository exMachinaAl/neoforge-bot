# Usulan roadmap inti Arcadia

Tanggal analisis: **29 Oktober 2026**. Baseline source: `plus / 38ba803`, dengan perapian dokumentasi belum di-commit.

**Status: USULAN — menunggu verifikasi pemilik.** Dokumen ini mencatat rekomendasi, bukan persetujuan implementasi. Tidak ada runtime yang diubah, server yang dijalankan, atau panggilan LLM cloud pada analisis ini.

## Keputusan yang direkomendasikan

**Dahulukan fix yang membuat agent dapat dipercaya, kemudian upgrade kemampuan menyelesaikan tujuan bertahap.** Hindari rewrite total. Engine, skill, izin, checkpoint, misi, UI dan sandbox yang sudah ada menjadi fondasi.

Sasaran inti pertama:

> Pemilik memberi satu tujuan; bot menghitung kebutuhan, menjalankan langkah yang relevan, pulih dari hambatan, mempertahankan progres setelah restart, dan hanya menyatakan selesai ketika hasilnya terverifikasi. Pemilik dapat melihat alasan berhenti dan biaya keputusan tanpa membongkar log panjang.

Full permission berarti agent boleh mengambil keputusan dalam cakupan izin; tidak berarti prasyarat dunia atau kemampuan yang belum tersedia otomatis terpenuhi.

## Dasar analisis

Audit sebelumnya: `npm test`, `npm run check`, `test:admin`, dan `test:llm-config` **TERUJI TIRUAN: lulus**. Tidak diulang karena sesi ini hanya analisis/dokumentasi. [Audit lengkap](PROJECT_STATUS.md).

| Temuan | Bukti dan batas | Keputusan |
|---|---|---|
| Install/repository belum siap promosi tanpa catatan | Source `patch-all.js` tidak menetapkan exit gagal; viewer dipasang no-save; dua backup konfigurasi masih terlacak. Instalasi bersih **BELUM DIUJI**. | Fix terbatas sebelum promosi main. |
| Anti-loop sudah ada, tetapi pembanding keadaan belum menangkap perubahan dunia secara lengkap | `stateKey`/`noProgressReason` memakai posisi, health, food dan inventory; pencarian blok juga dibandingkan dengan posisi/radius. Perubahan blok/chunk/waktu tidak menjadi revisi observasi eksplisit. Risiko observasi sah tertolak atau pencarian berulang pada koordinat berdekatan adalah **DUGAAN dari source, BELUM DIUJI**. | Reproduksi dahulu; perbaiki berdasarkan perubahan dunia/progres, jangan sekadar menambah retry. |
| “Selesai” belum diverifikasi terhadap syarat tujuan secara deterministik | Jalur `finish` memeriksa evidence skill sukses dan menolak hasil parsial; tidak menguji sendiri bahwa evidence memenuhi jumlah bahan atau bentuk rumah. Struktur ini terlihat di source; kejadian false-success di server **BELUM DIUJI**. | Tambahkan pemeriksa hasil untuk tipe tujuan yang didukung. |
| Tujuan panjang belum punya catatan kebutuhan dan subtujuan terstruktur di agent | Agent menyimpan history/queue, konteks mengambil 6 langkah terakhir dan 24 langkah sukses. Runner misi terpisah sudah memiliki dependency. Tidak sama dengan belum memiliki memori sama sekali. | Upgrade terarah: catatan progres/prasyarat persisten; gunakan executor yang ada. |
| Budget lintas worker dan pemakaian token gagal belum lengkap | Gateway membatasi rute chat/planning tertentu; keputusan agent berjalan di Director worker. `decide()` mengakumulasi usage, tetapi pada kegagalan final melempar error tanpa meneruskan total itu ke goal. Dampak biaya nyata **BELUM DIUJI**. | Pengerasan panggilan LLM dan pencatatan penggunaan sebelum meningkatkan skala bot. |
| Framing Multi/Single belum konsisten | Sinkronisasi live belum ada; `persist()` avatar mengirim seluruh config lokal. Potensi nilai lama menimpa perubahan tampilan lain adalah **DUGAAN dari source, BELUM DIUJI**. | Fix fungsi yang sudah dijanjikan; tidak perlu redesign UI. |
| Data ML tersedia, model terlatih belum ada | Ada experience JSONL, feature vector, scorer dan template kegiatan. Bukti training/evaluasi model offline belum tersedia. | Rapikan mutu data sejak awal; tunda training sampai hasil tujuan dapat dipercaya. |

Rujukan source: [runtime agent](../agent/runtime.js) (`stateKey`, `noProgressReason`, `context`, `tick`), [Director](../orchestrator/director.js) (`reserve`, `decide`), [klien LLM](../orchestrator/llm.js) (`callModel`), [gateway](../admin/server.js), [avatar](../ui/js/avatar3d.mjs) (`persist`, `loadProfile`), [runner misi](../lifecycle/missions.js), [sampler](../lifecycle/sampler.js).

Temuan source menjelaskan batas desain; jangan melabelinya TERBUKTI di server sebelum ada log lapangan.

## Urutan inti yang diajukan

### R0 — Baseline dapat dipasang dan dipromosikan

**Jenis:** fix instalasi/repository. Cakupan kecil dan terpisah dari pengembangan perilaku agent.

- Hentikan pelacakan backup konfigurasi tanpa menghapus file pemilik; benahi pola ignore.
- Pastikan kegagalan compatibility patch menggagalkan instalasi dengan pesan yang berguna.
- Nyatakan dependency core, viewer opsional dan tes admin dengan jelas; verifikasi lockfile pada checkout terisolasi.
- Sediakan gate CI atau prosedur verifikasi yang bisa diulang. Tidak perlu migrasi framework/build system.

**Selesai bila:** checkout bersih dapat menjalankan jalur core; jalur viewer/admin terpasang dengan langkah terdokumentasi; kegagalan patch terdeteksi; berkas privat tidak terlacak; check/regresi relevan lulus. Windows menjadi baseline awal; Linux/Termux harus punya hasil tersendiri sebelum disebut didukung secara teruji.

**Keputusan main:** setelah R0, pemilik dapat menilai promosi sebagai branch pengembangan. Jangan menunggu seluruh fitur roadmap selesai, dan jangan menamai promosi ini rilis production stabil.

### R1 — Agent tidak boros, tidak mengulang buta, dan dapat dipantau

**Jenis:** fix/pengerasan perilaku yang sudah ada. **Prioritas produk tertinggi.**

- Reproduksi pencarian kosong, hasil parsial, dan recovery crafting/modded. Pertahankan kode/error/data native sebagai fakta.
- Bedakan hasil aksi, kegagalan transport/provider, keputusan invalid, kekurangan kemampuan, dan kondisi yang benar-benar membutuhkan informasi pemilik.
- Izinkan observasi ulang bila dunia berubah; blokir pengulangan tanpa progres meskipun parameter/koordinat sedikit berubah. Catat area dan alasan secara berbatas.
- Hitung penggunaan yang dilaporkan provider pada balasan sukses maupun invalid; tandai penggunaan tidak diketahui saat provider tidak memberi usage, bukan menganggapnya nol.
- Terapkan budget bersama pada jalur panggilan provider yang mencakup agent, chat, perencanaan, fallback dan retry. Sediakan padanan lokal untuk standalone.
- Pertahankan stop/kill switch, izin Semi/Penuh dan observasi setelah restart.
- Tutup bug framing Multi/Single: pembaruan tersinkron dan tidak menimpa field dari state lama; renderer/kamera tetap stabil.

**Selesai bila:** tujuan sederhana dapat pulih atau berhenti dengan hambatan konkret; pengulangan sia-sia berhenti sesuai budget; provider gagal tidak mengubah dunia; Stop mencegah dispatch lanjutan; pemakaian antarbot tercatat; perubahan profil tidak hilang saat berganti tampilan.

Mekanisme sinkronisasi, fingerprint observasi dan limiter dipilih setelah reproduksi; roadmap tidak mewajibkan library atau layanan baru.

### R2 — Progres tujuan dan prasyarat menjadi data yang dapat diperiksa

**Jenis:** upgrade inti setelah recovery dasar stabil.

Mulai dari satu tipe tujuan: **kumpulkan sejumlah bahan**, misalnya 8 cobblestone. Simpan target, stok terverifikasi, jumlah kurang, prasyarat, subtujuan selesai/terblokir, dan evidence terkait. Replan mengubah pekerjaan tersisa, bukan menghapus progres.

- LLM memilih strategi dan pemulihan; source resep/skill serta observasi menentukan kebutuhan dan hasil.
- Tambahkan kontrak hasil untuk tipe tujuan yang didukung. Contoh: tujuan stok “punya 8 cobblestone” berbeda dari “tambang 8 cobblestone baru”; maknanya harus jelas.
- Verifikasi hasil dari observasi yang relevan dan cukup baru. Hasil skill sukses yang tidak berhubungan tidak cukup untuk menyelesaikan tujuan.
- Integrasikan dengan engine/checkpoint/runner yang sudah ada; jangan menciptakan executor ketiga.
- UI cukup menampilkan subtujuan aktif, progres terverifikasi dan hambatan. Detail tetap dapat dibuka.

**Selesai bila:** skenario kayu → papan/stick → meja → pickaxe → cobblestone dapat dilacak; hasil parsial mengurangi kekurangan; restart/replan tidak menghitung hasil dua kali; inspeksi sukses saja tidak membuat tujuan bahan dinyatakan selesai.

### R3 — Satu kemampuan besar yang terbatas: shelter sederhana

**Jenis:** upgrade pertama yang terlihat oleh pemilik. Dikerjakan setelah R2 lolos.

Rekomendasi demonstrasi: **shelter satu ruangan**, dengan ukuran dan definisi selesai disepakati sebelum implementasi. Contoh syarat: lantai, dinding, atap, dan akses masuk; dekorasi/perabot menjadi pekerjaan terpisah.

- Rencana koordinat dan daftar bahan dibuat sebelum pengumpulan; material berasal dari inventory/resep yang didukung.
- Periksa lahan, akses dan kebutuhan bahan. Kekurangan bahan menghasilkan subtujuan, bukan loop pencarian tanpa batas.
- Jalankan pembangunan bertahap, simpan evidence per bagian, dan verifikasi blok terpasang.
- Gangguan/restart melanjutkan bagian yang masih kurang. Penambahan tool buatan agent tetap memakai validasi/izin/sandbox yang ada.

**Selesai bila:** bot menyelesaikan satu definisi shelter yang jelas dari bahan awal tidak cukup, atau melaporkan hambatan yang terverifikasi. Tidak boleh mengklaim selesai hanya karena kayu berhasil terkumpul.

Smelting/alat tier tinggi menjadi tahap berikut setelah shelter; portal Nether menyusul ketika dependensinya tersedia. Jangan menggabungkan semua itu ke satu batch.

## Skenario verifikasi pemilik

Kriteria berikut adalah **usulan penerimaan**, belum hasil uji. Pakai dunia uji yang disepakati dan catat kondisi awal, mode izin, versi source/model serta bukti akhir.

| Kasus | Hasil yang diharapkan |
|---|---|
| oak_log tidak ada di radius lokal | Gunakan eksplorasi berbatas atau laporkan hambatan; tidak memanggil pencarian identik terus-menerus. |
| Sudah memperoleh 2 dari target 8 | Kekurangan dihitung dengan makna tujuan yang benar; hasil parsial tetap tercatat. |
| Crafting terhalang komponen modded | Di Penuh, pilih recovery native bila chest/izin/prasyarat tersedia; jaga bahan penting. Di Semi, tanya hanya cakupan yang belum diizinkan. |
| Blok dunia berubah setelah inspeksi | Observasi baru diperbolehkan berdasarkan perubahan; tidak permanen tertolak oleh hasil lama. |
| Provider 429/timeout/balasan invalid | Retry/fallback berbatas, alasan tampil, penggunaan tercatat bila tersedia; tanpa aksi dunia dari keputusan invalid. |
| Stop dan restart saat aksi belum pasti | Tidak ada dispatch setelah stop; setelah restart amati keadaan sebelum mengulang aksi. |
| LLM memberi finish dengan evidence tidak relevan | Tujuan bertipe terverifikasi tetap belum selesai. |
| Dua bot berbagi provider | Batas total berlaku tanpa menghabiskan seluruh kesempatan bot kedua; status menunggu jelas. |
| Ubah framing bergantian Multi/Single | Nilai terbaru bertahan; canvas dan kamera tidak restart setiap polling. |
| Shelter kurang bahan atau lahan bermasalah | Rencana kebutuhan/pemulihan jelas; hasil akhir diperiksa terhadap definisi shelter. |

Usulan ambang: kasus kritis izin, stop, evidence dan duplikasi recovery harus lulus seluruh skenario yang disepakati. Untuk jalur sukses inti, ulangi pada tiga kondisi awal berbeda. Angka ini gate awal untuk evaluasi, bukan jaminan reliabilitas production.

Catat keberhasilan terverifikasi, kebutuhan intervensi pemilik, keputusan/panggilan provider, token diketahui/tidak diketahui, waktu, percobaan tanpa progres, dan hasil parsial. Bandingkan sebelum/sesudah pada kondisi sebanding; jangan menilai kemajuan hanya dari jumlah fitur atau task yang berhasil.

## Yang sengaja ditunda

- **Training ML:** setelah R2, audit label hasil; setelah R3 menghasilkan data layak, bandingkan ranker offline dengan scorer saat ini pada data terpisah. Mulai dari memilih kegiatan bertajuk yang sudah valid, bukan langsung generator aksi bebas. LLM dapat menjadi teacher, tetapi label sukses harus didukung hasil dunia.
- **Customer/commercial multi-tenant:** setelah reliability dan budget multi-bot stabil; owner login sekarang tetap dipakai.
- **Redesign UI, tambahan statistik/animasi besar, WASD:** bukan prioritas inti; fix kehilangan state/framing tetap masuk R1.
- **Rewrite engine, mengganti seluruh framework/provider:** belum ada bukti kebutuhan.
- **Dukungan semua mod atau rumah/portal universal:** di luar cakupan milestone awal; diagnosis modded diprioritaskan bila menghambat skenario inti.

Format kegiatan jangka panjang tetap sesuai permintaan pemilik: **judul → kumpulan task/dependency → faktor penilaian → score hasil → pengalaman**.

## Keputusan untuk diverifikasi

Rekomendasi paket inti: **R0 + R1 + R2**, kemudian **R3 shelter** sebagai demonstrasi pertama. R0 menutup gate main; R1/R2 menentukan apakah agent layak diperluas. Training ML dan customer ditunda.

Pemilik dapat menyetujui atau mengubah:
1. Urutan tersebut dan cakupan paket inti.
2. Shelter sebagai demonstrasi pertama, atau menggantinya dengan kegiatan bertajuk bertanam/memancing yang memakai skill tersedia.
3. Skenario dan ambang penerimaan di atas.

Setelah verifikasi, catat tanggal keputusan dan cakupan yang disetujui di dokumen ini; barulah jadikan urutan tersebut roadmap resmi dan pecah ke batch implementasi. Sampai itu terjadi, seluruh tahap tetap **USULAN**.
