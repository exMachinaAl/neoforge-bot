# FIELD_TESTS.md — hasil uji lapangan dan diagnosis terbuka

Legenda: TERBUKTI = terlihat di log server/CLI | DUGAAN = penjelasan yang belum diuji | BELUM DIUJI. Tambahkan hasil baru di bawah, jangan menimpa.

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

## Pelajaran proses
- Log CLI memotong objek hasil: UI/CLI perlu menampilkan `data` penuh (atau ringkasan) agar hasil uji bisa dinilai tanpa tebakan.
- Skill panjang (guard/follow/farm) butuh progress langsung (lihat TODO "Progress langsung").
