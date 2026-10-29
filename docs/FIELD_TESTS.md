# FIELD_TESTS.md — hasil uji lapangan dan diagnosis terbuka

Legenda: TERBUKTI = terlihat di log server/CLI | DUGAAN = penjelasan yang belum diuji | BELUM DIUJI. Tambahkan hasil baru di bawah, jangan menimpa.

> Catatan di bawah adalah bukti historis sesuai tanggalnya, bukan daftar pekerjaan aktif. Rangkuman diagnosis tersisa ada di [TODO](../TODO.md); audit terbaru di [PROJECT_STATUS](PROJECT_STATUS.md). Instruksi upgrade yang berlaku: [WORKFLOW](WORKFLOW.md).

## sleep.auto (Okt 2026, server LAN, 2 pemain: pemilik + bot, malam dipasang dengan /time set 13000)
Params semua uji: `place:true, breakAfter:true, waitForNight:true, force:true`.

| Uji | Mode | Hasil | Data penting |
|---|---|---|---|
| q1 | bed ditaruh (142,101,-138) | INTERRUPTED, 5,4 dtk | sleptMs 3289, waktu bangun tick 14085 (malam), fights 0, reasons [], warning "bed yang ditaruh sudah tidak ada", pesan server "1/2 players sleeping" -> "0/2 players sleeping" |
| q2 | bed yang sudah ada (143,101,-132) | INTERRUPTED, 7,9 dtk | sleptMs 4959, bangun tick 14565, fights 0, reasons [], pesan "1/2" -> "0/2" |
| q3 | bed ditaruh (142,100,-133) | SERVER_REJECTED, 37 dtk | fights 1, resleeps 1, reasons ["mob di area bed: zombie", "bed terlalu jauh; mendekat", "terbangun malam hari (tick 15925): hajar mob lalu tidur lagi"]; akhir: timeOfDay 112, day 1, pesan server "Sleeping through this night" lalu "You can sleep only at night or during thunderstorms"; error "bot is not sleeping" |

Temuan:
- TERBUKTI: bot sempat tidur (server menghitung "1/2 sleeping") lalu terbangun dalam 3-5 dtk pada q1 dan q2 tanpa mob/serangan (fights 0, reasons kosong). Mode bed ditaruh maupun bed yang ada sama.
- DUGAAN (belum diuji): (a) pose tidur bot tak terbaca karena `entity_metadata` sering gagal parse, sehingga mineflayer mengira bot tidak tidur dan mengirim paket gerak yang membangunkan; (b) physics/pathfinder masih aktif saat tidur; (c) bed hilang (warning q1) membangunkan bot.
- TERBUKTI di q3: malam terlewati (hari 1, tick 112, pesan "Sleeping through this night") tetapi hasil dicatat SERVER_REJECTED. Klasifikasi seharusnya sukses bila hari berganti selama/sesudah percobaan.
- TERBUKTI: kode INTERRUPTED menjeda antrean ("antrean dijeda (keselamatan)") walau bot tidak terkena damage.
- Dengan 2 pemain, malam hanya terlewati bila semua pemain tidur (playersSleepingPercentage 100): pemilik juga harus tidur, atau atur gamerule.

Diagnosis berikutnya (kecil): saat tidur cetak `bot.isSleeping`, pose entitas bot, dan semua paket keluar (`TRACE=1`) dari mulai tidur sampai bangun; catat baris `PARSE GAGAL ... entity_metadata` di rentang itu.

## guard.post (Okt 2026)
- DILAPORKAN: `guard.post {radius:15, ranged:true, durationMs:30000}` selesai OK dalam 30186 ms (task.finished code OK).
- Statistik (kills, shots, hits, retreats) TIDAK terlihat: baris log CLI terpotong. Ambil dari riwayat UI (ketuk baris riwayat) atau `grep -a "guard.post" tasks.log`.
- bot.died + respawned tercatat 8 dtk setelah task selesai (di luar guard): penyebab tidak diketahui.
- BELUM DIUJI: akurasi panah di server (kena atau tidak), guard.follow, jaga lebih dari 5 menit (isi timeoutMs).

<!-- profile3d-lifecycle-v1 -->
## Profil GLB dan lifecycle bundle (16 Oktober 2026)

| Pemeriksaan | Hasil | Status |
|---|---|---|
| API profil | daftar model, simpan konfigurasi, dan stream GLB untuk BotAlpha | TERBUKTI server asli |
| Render GLB | kanvas 242x205, model kalibrasi tampil, 5 clip terbaca, 'Idle' dipilih saat kondisi idle | TERBUKTI browser Edge laptop |
| Stabilitas UI | kanvas tetap tersambung dan iframe viewer tetap node yang sama setelah polling | TERBUKTI CDP browser |
| Statistik | 14 meter AI Life tampil | TERBUKTI browser Edge laptop |
| Bundle | judul, beberapa task, selectionScore, dan 21 faktor terbentuk; persetujuan mengantrekan semua langkah | TERUJI TIRUAN |
| Model pemilik | model Blue Archive, texture, skeleton, dan clip asli | BELUM DIUJI |
| ML offline | format faktor/outcome siap dikumpulkan; model belum dilatih | BELUM DIUJI |

## Pelajaran proses
- Log CLI memotong objek hasil: UI/CLI perlu menampilkan `data` penuh (atau ringkasan) agar hasil uji bisa dinilai tanpa tebakan.
- Skill panjang (guard/follow/farm) butuh progress langsung (lihat TODO "Progress langsung").

## Prismarine Viewer per bot (16 Oktober 2026)

| Pemeriksaan | Hasil | Status |
|---|---|---|
| Paket | prismarine-viewer 1.33.0; daftar versi mencantumkan 1.21.1; Windows juga membutuhkan canvas 3.1.0 | TERBUKTI source + runtime |
| Lifecycle | mulai sesudah BotAlpha spawn; status API ready/eagle/BotAlpha; berhenti bersama bot | TERBUKTI server asli |
| Jaringan | viewer 127.0.0.1:3007 dan API 127.0.0.1:8787; bukan 0.0.0.0 | TERBUKTI Get-NetTCPConnection |
| Transport | index HTTP 200; Socket.IO handshake berhasil; sampel menerima 121 loadChunk, 690 entity, 5 position dalam 5 dtk | TERBUKTI server asli |
| UI | panel per bot, iframe dan tautan layar penuh termuat lewat UI Arcadia | TERBUKTI browser Edge laptop |
| Banyak bot | base port sama otomatis menjadi port berbeda | TERUJI TIRUAN dua bot/EventEmitter |
| Beban awal | proses bot+API+viewer sekitar 174 MB working set pada satu sampel singkat | TERBUKTI laptop, belum uji 5 menit |
| Render | canvas menampilkan player dan entitas; tanah/blok tidak lengkap pada screenshot headless | TERBUKTI sebagian; blok vanilla/modded BELUM DIUJI visual interaktif |
| HP/Termux | belum dibuka dari browser HP dan belum diukur di Termux | BELUM DIUJI |

Catatan: viewer sengaja loopback dan tanpa kontrol bot. Panel iframe saat ini untuk browser di mesin bot; akses browser perangkat lain masih membutuhkan proxy same-origin V-2.

## UI controller + Ollama Cloud (16 Oktober 2026)

| Pemeriksaan | Hasil | Status |
|---|---|---|
| UI controller | 12 panel, BotAlpha, akun Owner/Arcadia Local, statistik AI Life, Eagle View aktif | TERBUKTI browser Edge laptop |
| Stabilitas viewer | objek iframe sama setelah satu siklus polling; exception browser kosong | TERBUKTI CDP browser |
| Toggle runtime | off menutup listener 3007; on kembali `ready` di 3007; preferensi `viewer:true` tersimpan | TERBUKTI server asli |
| Render dunia | terrain, platform, bot, dan entitas terlihat pada tangkapan headless | TERBUKTI browser laptop; tekstur blok Create spesifik BELUM DIUJI |
| Director Ollama | `gpt-oss:20b` memberi satu usulan `inv.snapshot` valid dan pending dalam sekitar 5,1 dtk | TERBUKTI panggilan API nyata |
| Rahasia | kunci berasal dari berkas DPAPI di luar repo dan tidak tampil dalam hasil | TERBUKTI alur loader/log; isi kunci tidak dibaca |
| Browser HP | belum diuji | BELUM DIUJI |
