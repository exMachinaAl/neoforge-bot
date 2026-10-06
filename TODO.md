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
