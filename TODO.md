# TODO (checkpoint #4)
Legenda: [x] TERBUKTI (log/!test) | [~] TERUJI TIRUAN / sebagian | [ ] belum

## Koneksi & kompatibilitas modded
- [x] Handshake, adapt otomatis, data map, spawn dan bertahan, respawn
- [x] Fisika dasar, dig, place, chest, equip, attack(entityHurt), blok modded padat (patch-blocks)
- [ ] Diagnosis T-pose: A/B ARCADIA_UNKNOWN_EMPTY=1, !channels ysm epicfight yes_steve; lihat klien lain
- [ ] YSM: handler channel ysm_epicfight_compat:model_request/model_chunk (closed source: tangkap payload klien asli atau cek /ysm)
- [ ] entity_metadata/entity_equipment gagal: ambil payload (TRACE=1 + xxd), parser aman yang hanya mengambil slot + id item
- [ ] Inventory: bandingkan !test inventory vs /data get entity BotAlpha Inventory (item modded, item berkomponen); jalur cadangan parser SNBT
- [ ] Tes equip/place item non-hotbar bermodded komponen (serialisasi ItemStack)
- [ ] Rarity enum bergeser (6 entri): pantau efek parse item
- [ ] noErrorLogging: ringkas PARSE GAGAL per 10 detik
- [ ] !help diperbarui (!test !task !channels)

## Skills (kontrak: contracts/)
- [x] nav.goto (jalan datar, pulang-pergi)
- [~] nav.goto tanpa y / XZ tercapai (fix timeout y di tanah)
- [~] mine.collect baru (drop otomatis, alat, dig natural, guard, chest) - uji server
- [~] fish.cast, farm.harvest, hunt.kill - uji server
- [ ] craft.vanilla (crafting table + window click), inv.store/take (chest umum), eat/sleep sebagai skill sendiri
- [ ] Mining lanjutan: strip-mine, hindari lava/air, penyimpanan saat penuh
- [ ] Combat: tes damage Epic Fight (/data get entity sebelum-sesudah), PvP setelah equipment terbaca
- [ ] Tes otomatis: tests/ dengan harness bot tiruan (31 kasus ada di sesi, belum di repo) + npm test

## Task engine & orchestrator
- [ ] Antrean prioritas, interupsi, resume, retry onFail (sekarang satu task per waktu)
- [ ] Banyak bot: satu proses per bot, reconnect, jeda login
- [ ] Event bus sesuai skema Event; BotState dengan capabilities dari hasil !test

## Mind (persona & planner)
- [ ] Persona sebagai parameter perilaku; planner LLM memilih Task dari SkillManifest (batas maxLlmCallsPerMin)
- [ ] Keputusan: LLM API vs lokal, dijalankan di mana

## Control plane
- [ ] CLI lanjutan, REST + WebSocket (contracts/README.md), Web UI minimal, kill switch

## Infra, uji, keamanan
- [ ] Lingkungan laptop (server/ subfolder, tanpa mc.local.json); bandingkan hasil !test dengan HP
- [ ] Opsi MC_DATA (folder JSON per lingkungan) agar laptop/HP tidak saling menimpa
- [ ] Tes postinstall pada fresh clone (rm -rf node_modules && npm install)
- [ ] Whitelist BotAlpha, firewall, batas biaya LLM

## Urutan berikut
1. Jalankan test list di README (bagian Uji) dan kirim hasilnya
2. Putuskan arah T-pose dari hasil A/B + !channels
3. Perbaiki skill berdasarkan SKILLRESULT.data.reasons
4. Task engine minimum, lalu tes otomatis di repo

## Pembaruan #5
- [x] nav.goto XZ + y tak terjangkau (OK dengan note), jarak 90 blok (TERBUKTI log)
- [x] mine.collect dirt dan stone -> cobblestone, menembus tanah (TERBUKTI log)
- [~] DILAPORKAN (pemilik: anggap tes lain berhasil, log tak dilihat): hunt, farm, fish, guard, tes T-list lain
- [ ] Uji ulang chest: koordinat yang diberikan terbaca 'stone' oleh bot (3x gagal); coba chest=true (auto-detect)
- [ ] Uji nav.goto dari lubang hasil galian (retry + gali keluar); sebelumnya UNKNOWN dalam 91 ms tanpa bergerak
- [~] engine/ + control/ + ui/ (antrean, API, SSE, UI web) - TERUJI TIRUAN (npm test), BELUM DIUJI di server/browser HP
- [ ] YSM: baca subperintah /ysm (Tab di klien OP); !channels ysm; pelajari paket pilih-model klien asli
- [ ] Orchestrator multi-bot (proses per bot + IPC), persona, memori, planner LLM, UI lanjutan (daftar bot, inventory, peta)

## Pembaruan #6
- [x] farm.harvest: akar masalah ditemukan di source (GoalLookAtBlock tak pernah terpenuhi untuk blok tanpa shapes seperti tanaman); kini U.approach memakai GoalNear untuk blok tanpa bentuk tabrakan - TERUJI TIRUAN, BELUM DIUJI server
- [x] Item unknown dikelompokkan per id numerik (unknown#<id>) di invTotals/BotState - TERUJI TIRUAN
- [ ] Verifikasi inventory: skill inv.snapshot (/data get entity <bot> Inventory, parser SNBT) dibanding bot.inventory; butuh bot op
- [ ] craft.item: resep vanilla ada di minecraft-data (782 item); alur crafting table + window click BELUM diuji; hanya bahan vanilla
- [ ] Uji ulang farm.harvest di server; kirim tail -n 3 tasks.log bila gagal
## Pembaruan #7 (inventory)
- [~] inv.snapshot: bandingkan bot.inventory dengan /data get entity <bot> Inventory (butuh op); belajar nama item modded; state.inventory jadi source=snbt/accurate=true bila snapshot cocok dan <30 dtk - TERUJI TIRUAN, BELUM DIUJI di server
- [~] inv.view / inv.store / inv.take: lihat, simpan, ambil dari chest dengan verifikasi /data get block Items; item modded dilewati kecuali includeModded - TERUJI TIRUAN, BELUM DIUJI di server
- [~] Nama item modded dari registri minecraft:item (log "ITEM NAMES: n id"); bila tidak muncul, nama dipelajari dari inv.snapshot (itemmap.json)
- [ ] Format keluaran /data get di server asli belum pernah dilihat: bila PROTOCOL_UNSUPPORTED, kirim snapshot_raw.txt
- [ ] View 3D (prismarine-viewer) untuk UI - BELUM dikerjakan, lihat catatan kelayakan
## Pembaruan #8 (inventory tahan banting, v2.3)
- [~] Jendela chest tak terbaca (window_items dibuang karena komponen item modded): openChest memantau open_window sendiri, lanjut mode degraded (isi dari /data get block, pindah lewat shift-click berbasis slot), SELALU menutup jendela (close_window mentah) - TERUJI TIRUAN, BELUM DIUJI di server
- [~] inv.store/inv.take: hasil dihitung dari isi chest di server (tidak lagi salah menilai gagal saat server lag); item vanilla yang tak terbaca bot ikut dipindah; item modded dengan includeModded=true dan bot op; inv.take item=all
- [~] inv.snapshot hydrate: item polos (tanpa komponen) yang dibawa sebelum spawn dipulihkan ke tampilan bot; state.inventory memakai daftar kebenaran server selama snapshot <30 dtk
- [ ] Item BERMUATAN komponen modded tetap tak terbaca bot (butuh skema SlotComponent: opsi 2)
- [ ] craft.item dan breed.animals belum dikerjakan (craft memakai jendela yang sama; 2x2 lewat inventory tidak butuh jendela chest)
## Pembaruan #9 (v2.4: crafting, breeding, catatan inventory)
- [~] craft.item: resep 2x2 lewat inventory (tanpa jendela chest), resep meja lewat meja crafting terdekat/koordinat; jendela meja yang tak terbaca (degraded) ditolak jelas; bahan diperiksa lewat sinkron server (butuh op) - TERUJI TIRUAN, BELUM DIUJI di server
- [~] breed.animals: cow/sheep/goat/mooshroom/pig/chicken/horse/donkey/llama/rabbit/fox; anak lahir diukur dari event entitySpawn (bukan metadata); cooldown 5 menit disimpan di memori proses - TERUJI TIRUAN. Deteksi anak lewat metadata[16] (AgeableMob) BELUM DIUJI
- [~] Catatan inventory (BotState) disamakan dengan server setelah inv.store/inv.take/craft.item/breed.animals (reconcile: pulihkan item polos, hapus item hantu, koreksi jumlah)
- [ ] ChestBook (inventory eksternal): catat isi tiap chest per koordinat (item, jumlah, waktu lihat) ke chests.json agar Director bisa memutuskan "ambil dari chest X"; data sudah tersedia dari inv.view/store/take, tinggal dicatat
- [ ] Perintah guard: jaga pos (x,y,z) dalam radius R; serang mob hostile yang masuk radius, kembali ke pos; berhenti saat HP rendah; parameter pos/radius/mode dari UI dan chat
- [ ] Perintah follow-as-guard: ikuti pemain pemilik, jaga jarak, lindungi dari mob (memakai logika guard di sekitar pemilik), makan/istirahat sesuai kebutuhan; tiap petualangan bersama menaikkan affection persona
- [ ] Persona: nilai affection (disimpan JSON), dipengaruhi follow-as-guard, hadiah item, waktu bersama; mempengaruhi bobot Director (kontrak Persona.traits sudah ada)
- [ ] Perintah di dalam game: pemilik mengetik "!bot guard/follow/stop/craft ..." di chat -> masuk antrean engine (hanya dari pemain yang diizinkan)
- [ ] WebUI: tombol cepat guard/follow/stop, kartu Inventory (akurat/tidak, tombol Snapshot), kartu chest, form craft/breed; peta 2D lalu opsional viewer 3D
- [ ] craft: menaruh meja crafting bila tidak ada, tungku (smelting), resep dengan bahan modded
- [ ] breeding: deteksi mode cinta/anak yang lebih tepat, penyimpanan cooldown antar restart
- [ ] Mekanik hidup (Director non-LLM + cyclebook JSON + persona + plugin planner LLM) setelah fungsi vanilla lengkap
- [ ] Skema SlotComponent untuk komponen item modded (opsi 2) agar item bermuatan komponen terbaca penuh
## Batch 10 — Verifikasi & stabilitas (rencana 2026-10-09)

Status masuk
- TERBUKTI (log pemilik, terpotong): breed.animals species=auto pairs=2 lewat API/antrean -> OK 7,7 dtk;
  antrean engine queued -> started -> finished berjalan. Jumlah anak tidak terlihat di log.
- Perbaikan 09-10 (fix-breed-v2): gotoTimed tidak lagi menyamarkan Timeout sebagai PathStopped;
  PathStopped dari luar dicoba ulang dan membawa "[asal: ...]"; approachEntity; anak dilacak dari entitySpawn.
- Belum terjelaskan: PathStopped seketika (88 ms, 3,4 dtk) sebelum perbaikan. Jika muncul lagi, baca
  "[asal: ...]" dan data.pathStops pada SKILLRESULT.

Urutan: B10-1 -> (B10-2, B10-4, B10-5 bebas) -> B10-3 (butuh B10-1) -> B10-6 terakhir.

### B10-1 Keamanan jaringan  [Pemilik, S] — DULU
- Langkah: cek router tidak mem-forward 25565; firewall/bind server; API kontrol tetap 127.0.0.1 + token;
  git rm --cached mc.local.json.bp, tambah *.bp ke .gitignore. Konsol: whitelist on, whitelist add BotAlpha
  (pelengkap saja; nama BotAlpha tetap bisa dipalsukan di offline-mode).
- Selesai bila: dari jaringan luar (data seluler) ping ke server gagal; repo tidak memuat berkas lokal.

### B10-2 Konfirmasi breed.animals  [Pemilik, S]
- Langkah: 3 skenario dengan hewan baru tiap uji (cooldown 5 menit): pairs=1 sapi dekat; pairs=2 sapi
  bergerak; tanpa gandum. Kirim SKILLRESULT UTUH dari CLI (UI memotong hasil).
- Selesai bila: data.babies = pairs, semua data.moves ok, pathStops kosong, tanpa PathStopped seketika
  dalam 10 percobaan berurutan; tanpa gandum -> PRECONDITION_FAILED.

### B10-3 Uji server skill yang baru "teruji tiruan"  [Pemilik, M] — setelah B10-1
- Cakupan: craft.item (2x2 lalu meja), inv.snapshot/view/store/take, farm.harvest (pascaperbaikan approach),
  mine.collect (dirt/stone + anomali nav.goto sesudah menggali lubang), guard.
- Langkah: op BotAlpha + gamerule sendCommandFeedback true hanya selama sesi, lalu deop BotAlpha.
  Parameter tiap skill lewat !task list. Satu sesi, satu log.
- Selesai bila: tabel PASS/FAIL/SKIP per skill masuk HANDOFF (label TERBUKTI atau DILAPORKAN).

### B10-4 Diagnosa T-pose A/B  [Pemilik, M]
- Langkah: (1) ukur gerak di server: data get entity BotAlpha Pos dua kali berselang 2 dtk (animasi bukan
  bukti gerak); (2) jalankan dengan ARCADIA_UNKNOWN_EMPTY=1 lawan bawaan, amati dari klien pemain saat bot
  diam dan berjalan; (3) simpan keluaran !channels ysm epicfight; (4) catat apakah klien pengamat
  memakai YSM/Epic Fight dan apakah pemain biasa tampil normal.
- Selesai bila: tabel A/B terisi, hipotesis patch-blocks dikonfirmasi atau disanggah, dan ada keputusan
  (lanjut tangkap paket pilih-model YSM, atau tutup).

### B10-5 Spike statistik paket gagal parse  [Pemilik, S, hanya baca log]
- Langkah: setelah 30 menit aktivitas, grep -a "PARSE GAGAL" bot.log | sed -E 's/.*paket: ([a-z_]+).*/\1/' | sort | uniq -c | sort -rn
- Selesai bila: ada peringkat paket gagal; keputusan: skema SlotComponent sendiri layak (window_items/set_slot
  sering) atau tidak (didominasi entity_equipment/metadata mob lain).

### B10-6 Penutupan batch  [Pemilik + Agen, S]
- npm test dijalankan di lingkungan sebenarnya (path.test.js dan 6 kasus baru di breed.test.js belum pernah
  dijalankan di sana), commit, HANDOFF checkpoint #10 berisi hasil B10-1..5, MAP.md dibangkitkan ulang, tag prestable-1.

### Ditunda (dengan alasan)
- Skema SlotComponent sendiri: tunggu B10-5.   - PvP / damage Epic Fight: butuh HP mob terbaca.
- Upgrade pathfinder: risiko regresi, tunggu semua skill terbukti.   - Persona / planner LLM / multi-bot: tunggu stabil.
- Pilih-model YSM: tunggu B10-4.   - Format ack TaCZ selain kosong: hanya bila kick muncul.
