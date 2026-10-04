# Arcadia TODO (checkpoint setelah !test pertama)
Legenda: [x] TERBUKTI (log/!test) · [~] sebagian/DILAPORKAN · [ ] belum

## 0. Kontrak (Agent 0)
- [ ] Commit contracts/, selftest.js, package.json, package-lock.json
- [ ] capabilities terbukti: move, block.read, block.dig, block.place. Belum: combat.vanilla, inventory.protocol (hanya item vanilla polos)
- [ ] Satu SkillManifest contoh per skill di contracts/skills/ (mine.collect dulu)

## 1. Koneksi & kompatibilitas modded (Agent A)
- [x] Handshake, adapt, fix data map, spawn dan bertahan (TERBUKTI)
- [x] Fisika dasar: jalan 5.4 blok/1.5s, lompat, onGround (TERBUKTI)
- [ ] Cek death/respawn: grep -a "EVENT death\|EVENT respawn" bot.log (posisi loncat -77,64,37 -> 0,69,0)
- [ ] Rarity enum kini 6 entri (+IRONS_SPELLBOOKS_RARITY_CINDEROUS): pantau efek ke parse item
- [ ] declare_recipes gagal ("Invalid tag: 105 > 20"): abaikan untuk resep vanilla, catat resep modded = tidak ada
- [ ] entity_equipment gagal: ambil 1 payload (TRACE=1 + xxd) bila perlu untuk PvP; opsi parse aman yang hanya ambil slot + id item
- [ ] noErrorLogging: kurangi kebisingan PARSE GAGAL dengan ringkasan per 10 detik

## 2. Indra dunia
- [x] blockAt vanilla: null 0/125 (TERBUKTI)
- [ ] Tes blok modded (dekat blok Create): blockAt mengembalikan apa? Bila null/unknown, petakan jadi "solid tak dikenal" supaya pathfinder tidak menembus
- [ ] Inventory: bandingkan !test inventory vs /data get entity BotAlpha Inventory (item vanilla polos, item modded, item berkomponen)
- [ ] Jalur cadangan: parser SNBT dari /data get entity (butuh op, jeda 1 tick) -> inventory.source = "snbt"
- [ ] Entity tracking: [x] mob terlihat (creeper 52 m); [ ] lihat equipment/nama pemain lain

## 3. Skills (Agent B), kerjakan setelah kontrak di-commit
- [ ] nav.goto (mineflayer-pathfinder; uji dengan blok modded di rute)
- [ ] mine.collect {block,count} (dig sudah PASS) + simpan ke chest
- [ ] place.block (place sudah PASS) -> modal dasar bangun/bertani
- [ ] eat / sleep / flee dasar
- [ ] craft.vanilla (resep dari minecraft-data; butuh tes crafting table + window click)
- [ ] farm.crop (hoe, tanam, panen), fish.cast (joran + bobber event): belum ada tesnya
- [ ] Tiap skill: manifest, abort via signal, SkillResult dengan code, tes di !test-style

## 4. Combat (Agent C)
- [ ] !test attack dengan mob dekat (/summon minecraft:cow ~ ~ ~2): ada entityHurt?
- [ ] Bandingkan HP mob sebelum/sesudah dengan Epic Fight aktif (/data get entity)
- [ ] combat.vanilla: hunting hewan, PvE (zombi/creeper), flee saat HP rendah
- [ ] PvP: tunda sampai entity_equipment bisa dibaca
- [ ] Epic Fight: tentukan apakah bot perlu skill khusus (belum diketahui)

## 5. Task engine & orchestrator (Agent D)
- [ ] Antrean prioritas, interupsi (lapar/serangan/HP), resume, retry onFail
- [ ] Banyak bot: satu proses per bot, reconnect otomatis, jeda login
- [ ] Event bus sesuai skema Event

## 6. Mind: persona & planner (Agent E)
- [ ] Persona sebagai parameter perilaku (reaksi, jitter, idle, gaya chat), bukan "kecerdasan"
- [ ] Planner LLM memilih Task dari SkillManifest, tidak di loop per-tick, batas maxLlmCallsPerMin
- [ ] Memori ringkas: statistik sukses/gagal per skill diumpankan ke planner
- [ ] Keputusan dulu: LLM API vs lokal, jalan di mana (laptop/VPS/HP)

## 7. Control plane (Agent F)
- [ ] CLI: enqueue/cancel/say/list lewat Command
- [ ] REST + WS sesuai contracts/README.md (bind 127.0.0.1, token)
- [ ] Web UI minimal: daftar bot, BotState, log Event, kill switch

## 8. Infra, uji, keamanan (Agent G)
- [x] !test (state, look, walk, jump, blocks, inventory, dig, place, attack)
- [ ] Tambah test: equip (non-hotbar), chest, modblock, craft
- [ ] Server uji laptop (server/ subfolder) + hasil !test dibandingkan HP
- [ ] Whitelist BotAlpha, firewall, batas biaya LLM
- [ ] Skrip regresi: jalankan !test + adapt tiap mod baru

## Urutan berikut
1. Commit kontrak + selftest
2. Lengkapi tes: attack dengan mob dekat, equip non-hotbar, blok modded, cek inventory vs /data
3. Skill pertama: nav.goto lalu mine.collect, ujung-ke-ujung dari CLI
4. Task engine minimum (satu bot, antrean)
5. Baru combat, farm, fish
