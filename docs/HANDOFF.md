# HANDOFF neoforge-bot / Arcadia (checkpoint #4)
Prompt konteks lengkap untuk AI agent baru. Lihat juga: AGENTS.md (aturan), README.md (cara pakai), TODO.md (backlog), contracts/ (skema).

## 1. Pemilik & gaya kerja
Alpha, mahasiswa Teknik Informatika, gaya low-level: teori singkat dulu, lalu langkah konkret. Bahasa Indonesia, ringkas. Bekerja dari HP (Termux).
Koreksi pemilik langsung bila keliru. Proyek kolaboratif. Satu blok perintah per langkah. Aturan lengkap: AGENTS.md.

## 2. Tujuan
Jangka pendek: bot mineflayer (BotAlpha, Node.js, auth offline, 1.21.1) masuk dan BERTAHAN di server NeoForge 1.21.1 bermod milik pemilik,
dan menyesuaikan diri saat mod berubah dengan satu perintah (npm run adapt). Mod dicopot lalu dipasang lagi = otomatis (hasil belajar ada di JSON).
Jangka panjang ("Minecraft Arcadia"): ekosistem banyak bot otonom (bertani, mancing, mining, hunting, PvE/PvP, tugas kustom) yang dikontrol lewat
CLI/API/Web UI, dengan persona (parameter perilaku, bukan "AGI"). LLM hanya perencana tingkat tinggi, bukan di loop per-tick.

## 3. Lingkungan
- HP A: server sekaligus client Zalith Launcher (dunia LAN, NeoForge 21.1.251, online-mode off, port 25565). Mod terlihat di log: Create (+Enchantment
  Industry, Dragons Plus, Connected, Aeronautics), Sable, Numismatics, Ponder, Curios, Pufferfish Skills, CreativeCore, Iron's Lib/Spellbooks,
  Sophisticated Backpacks/Core, Touhou Little Maid, GeckoLib, TaCZ, Epic Fight (+Skill Tree), Yes Steve Model (YSM), "wom", Placebo, Distant Horizons, Sinytra.
  Server lama (sesi awal): NeoForge 21.1.252 dedicated di server/ pada folder bot.
- HP B: Termux, menjalankan bot dan adapt. Log HP A dibaca lewat ssh batch (logCmd di mc.local.json; sudah diatur pemilik).
- Laptop: rencana lingkungan uji kedua (server di subfolder server/, tanpa mc.local.json).
- Dependency: mineflayer 4.39.0; mineflayer-pathfinder ^2.4.5 (terakhir diubah 2023, jalan di 1.21.1 untuk jalan datar: TERBUKTI);
  minecraft-protocol-forge dari github:Pix3lPirat3/node-minecraft-protocol-forge (commit af4dcd8f, PR #51 belum merge); overrides minecraft-protocol dari
  github:Pix3lPirat3/node-minecraft-protocol (commit 58efc1b2, PR #1528 belum merge). package-lock.json WAJIB di-commit. ajv (devDependency) untuk validasi kontrak.

## 4. Peta repo
bot.js (handshake, parser diagnosa, CLI: !test !task !channels !hit !quit) | channels.js, modchannels.js, ids/flows/versions/config/argtypes.json (hasil belajar)
learn.js (urai payload gagal negosiasi) | adapt.js (loop otomatis, maks 40 putaran) | config.js (MC_HOST MC_PORT MC_LOG MC_LOG_CMD > mc.local.json > bawaan) | logsrc.js
patch-all.js -> patch-nmpf.js, patch-checks.js, patch-protodef.js, patch-blocks.js (postinstall; mengubah node_modules)
selftest.js (!test) | sniff.js (!channels) | contracts/ (contracts.schema.json + check.js) | skills/ (index.js runner, _util.js, nav.goto, mine.collect, fish.cast, farm.harvest, hunt.kill, check.js)
unknownblocks.json ({"empty":[stateId]} = blok modded yang boleh dilewati)
Skrip lama DIHAPUS, jangan dihidupkan: probe.js probe2.js fixflows.js fixversions.js autoneg.sh autopatch.sh autoserver.sh add.js ping.js.

## 5. Cara kerja teknis (temuan)
1. Negosiasi: server kirim neoforge:register kosong -> bot balas daftar channel (konfigurasi + play) -> server kirim neoforge:network (sukses) atau
   neoforge:modded_network_setup_failed. Server TIDAK mengirim daftar channel lengkap. Handler wajib kecuali flow serverbound; nama ^[a-z0-9_.-]+:[a-z0-9/._-]+$.
2. Payload kegagalan (TERBUKTI): string berawalan panjang 1 byte; per entri id channel, nama mod, alasan: missing.server.client, missing.client.server,
   flow.client.missing (+CLIENTBOUND/SERVERBOUND), version.mismatch (+versi server, versi bot). Satu alasan per channel per putaran -> belajar butuh beberapa putaran.
3. Channel OPSIONAL tidak dilaporkan server. Kode mod yang mengirimnya tanpa cek melempar "Payload X may not be sent to the client!" di log server ->
   "Couldn't place player in world" -> kick invalid_player_data. adapt membaca log server untuk ini (irons_lib:sync_patreon_data, sync_attribute_remaps (versi 1.0.0),
   irons_spellbooks:sync_config). Server melempar pada payload PERTAMA yang gagal: satu putaran = satu channel.
4. Channel konfigurasi: learn.js memindahkannya ke config.json + ack (payload kosong, DUGAAN). Mod yang mendaftar di dua fase (create_connected:sync_config): flag both.
5. Registry data map (TERBUKTI): tanpa channel konfigurasi neoforge:known_registry_data_maps server menganggap klien vanilla dan menendang "does not support vanilla clients
   as it has mandatory registry data maps". Fix: daftarkan channel + balas neoforge:known_registry_data_maps_reply kosong (modchannels.js).
6. Tipe argumen command modded didaftarkan 'void' (argtypes.json). Tipe yang punya properti akan salah baca (gejala: PARSE GAGAL pada declare_commands).
7. Enum diperluas (Rarity: EPICFIGHT_UNIQUE, IRONS_SPELLBOOKS_RARITY_CINDEROUS) ditolak plugin -> patch-checks. Efek pergeseran ordinal pada parse item BELUM diketahui.
8. Komponen data item modded (110, ID mulai 57) tidak ada di minecraft-data. Paket bermuatan item bermod gagal parse (declare_recipes, window_items, entity_equipment, entity_metadata).
   Error non-PartialReadError mematikan stream (TERBUKTI) -> patch-protodef membuang paket gagal. Dampak: resep modded kosong (resep vanilla tetap jalan: prismarine-recipe memakai
   minecraft-data), HP/equipment entitas tertentu tak terbaca, item modded terbaca "unknown" (hitungan aman, jenis tidak diketahui).
9. Blok modded: state id tak dikenal -> prismarine-block membuat name "", boundingBox empty, shapes [] (tembus di sisi bot, padat di server = rubber-band). patch-blocks.js
   menjadikannya kubus padat (TERUJI TIRUAN lewat simulasi fisika; modblock PASS di server). A/B: ARCADIA_UNKNOWN_EMPTY=1 npm start = perilaku lama.
10. place/chest ke server: paket sampai dan diproses (ACK + block_change revert) tapi sempat ditolak logika game pada satu run, lalu lolos di run berikutnya; penyebab belum diketahui.

## 6. Skill & task runner
Kontrak: contracts/contracts.schema.json (Task, SkillResult, SkillManifest, BotState, Event, Persona, Command; kode error: OK, PRECONDITION_FAILED, TARGET_NOT_FOUND, NO_PATH, TIMEOUT,
ABORTED, INTERRUPTED, DIED, INVENTORY_FULL, PROTOCOL_UNSUPPORTED, SERVER_REJECTED, UNKNOWN). Skill = { manifest, run(bot, params, ctx) -> {ok, code, data, error} }, ctx = {signal, mcData, movements(kind, opts)}.
Satu task per waktu, timeout bawaan 5 menit (timeoutMs, maks 30). Mati -> DIED. CLI: !task list | stop | status | <skill> k=v ... | <skill> {json}. Hasil: baris "SKILLRESULT {...}".
- nav.goto x z [y] [range] [strictY]: tanpa y = hanya jarak horizontal. Tidak merusak/menaruh blok.
- mine.collect block [count item maxDistance dig=natural|any|none guard minHealth chest{x,y,z}]: item hasil otomatis dari data blok (stone -> cobblestone); wajib survival dan alat yang boleh memanen;
  menggali menembus blok alami (whitelist) bila perlu; pemilih alat sendiri (harvestTools + digTime) yang juga dipakai pathfinder; guard = batas HP, makan otomatis, lawan monster dekat.
- fish.cast [count maxDistance biteTimeoutMs]: bot.fish(); keberhasilan diukur dari penambahan inventory.
- farm.harvest [crops count maxDistance replant]: wheat/carrots/potatoes/beetroots matang (properti age), tanam ulang di farmland.
- hunt.kill mob [count maxDistance]: nama entitas vanilla atau tipe animal/hostile; mati diukur dari event entityDead.

## 7. Status
TERBUKTI (log pemilik): negosiasi + adapt otomatis (satu run: 46 channel hilang -> OK putaran 4; 10 tipe argumen baru); kick data map teratasi; bot spawn dan bertahan; respawn (death->respawn->spawn);
 !test PASS: state look walk(4-6 blok) jump blocks inventory(item vanilla) equip(termasuk item unknown) chest(buka + simpan/ambil item vanilla) dig(survival) place attack(entityHurt) modblock(setelah patch-blocks);
 nav.goto 20,70,30 OK (8,7 dtk) dan kembali ke 0,70,0; target y di dalam tanah -> TIMEOUT padahal XZ tercapai (sudah diperbaiki di kode).
 mine.collect VERSI LAMA gagal: TARGET_NOT_FOUND x5 dan DIED x2 (penyebab: canDig=false, item hasil salah, tanpa alat/creative, tanpa pertahanan) -> ditulis ulang.
TERUJI TIRUAN: mine.collect baru, nav (y tak terjangkau), fish, farm, hunt, guard/fight, movementsFor, bestTool (31 kasus mock, harness belum ada di repo), parseFailure/learnStep, alur adapt,
 patch-blocks (simulasi fisika), config/logsrc.
BELUM DIUJI di server: semua skill baru kecuali nav.goto; dig menembus tanah; guard; ARCADIA_UNKNOWN_EMPTY; !channels; damage Epic Fight (baru entityHurt); item berkomponen via window click;
 inventory vs /data get entity; postinstall pada fresh clone; lingkungan laptop; format ack TaCZ selain kosong.

## 8. Masalah terbuka
- Bot terlihat T-pose / tanpa animasi jalan di klien pemain lain. Kode jalan = mineflayer standar (setControlState -> fisika -> paket posisi) dan patch-blocks hanya mengubah bentuk tabrakan blok modded.
  Hipotesis (BELUM TERBUKTI): YSM/Epic Fight merender pemain dari data yang tidak pernah diinisialisasi bot (handshake mod). Pemilik menduga patch-blocks penyebabnya (tidak terbukti, tidak terbantah):
  uji A/B dengan ARCADIA_UNKNOWN_EMPTY=1 dan lihat !channels ysm epicfight. YSM closed source; channel ysm_epicfight_compat:model_request/model_chunk terdaftar tapi handler kosong.
- entity_metadata/entity_equipment/window_items/declare_recipes gagal parse: HP mob dan equipment tak terbaca (PvP belum aman; hunting memakai entityDead).
- Mode creative = tidak ada drop; stone tanpa pickaxe tidak menjatuhkan apa pun. Skill menolak dengan PRECONDITION_FAILED.
- Keamanan: auth offline + online-mode=false; bila server terjangkau luar, siapa pun bisa login. Perlu whitelist/firewall. Proxy/tunnel dapat mengubah negosiasi.
- pathfinder 2.4.5 usang (2023); bot.fish() bergantung partikel/entitas pelampung 1.21.1 (belum diverifikasi).

## 9. Kesalahan yang pernah terjadi (jangan diulang)
fixflows.js lama membuang entri pertama dan menimpa flows.json; probe.js menimpa ids.json. Env HOST bentrok dengan zsh (pakai MC_HOST). Mengira "offered" = daftar server (ternyata daftar bot).
Mengira versi channel tak diperiksa (diperiksa). Mengira "Incompatible client" soal versi NeoForge (pesan bawaan negosiasi gagal). Mengira error parse tidak fatal (non-PartialReadError mematikan stream).
"cat >> bot.js" tanpa newline -> SyntaxError. Mengira log HP A tidak terbaca padahal logCmd ssh sudah diatur. Mengira animasi = bukti gerak (salah dengan YSM/Epic Fight; ukur posisi server:
/data get entity BotAlpha Pos). Mengira tes chest bermasalah jarak (chest ada dalam 2 blok). Menghitung item "stone" padahal drop-nya cobblestone. Memilih item[0] di tes (item modded "unknown" -> Invalid itemType).

## 10. Mulai sesi baru (untuk agen)
1. git clone, npm install (postinstall memasang 4 patch), npm run check.
2. Baca README.md, TODO.md, contracts/. Jangan mengubah skema tanpa commit khusus contracts/.
3. Minta pemilik menjalankan tes dan menempel: grep -a "TASK\|SKILLRESULT\|TEST\|CH \|EVENT\|SKIP\|ERR\|KICK" bot.log ; log server: grep -a "BotAlpha\|may not be sent\|Couldn't place" latest.log | tail -30.
4. Kerjakan backlog dari TODO.md secara berurutan; tiap perubahan: skrip fix-xxx.js, node --check, uji tiruan, lalu minta uji server.

## 11. Pembaruan checkpoint #5
Kode baru: engine/ (antrean berprioritas, BotState, Event; DIED/INTERRUPTED menjeda antrean), control/ (API HTTP + SSE + UI, tanpa dependency, bind 127.0.0.1 + token),
ui/index.html (tanpa innerHTML), contracts/validate.js, tests/ (mock bot, npm test), CLI !queue. Runner skills/index.js kini mengekspos events, current(), abort(), parse().
Skill: mine.collect chest=true|"auto"|{x,y,z} (wadah terdekat; error menunjuk chest terdekat), nav.goto retry 2x lalu gali keluar blok alami (escape:false mematikan).
TERBUKTI (log pemilik): nav.goto XZ (14 dtk dan 17 dtk untuk 90 blok), y di dalam tanah -> OK dengan note; mine.collect dirt x6 dan stone x6 (cobblestone, dug 6, reasons kosong).
Anomali: nav.goto sesudah menggali dirt (bot di lubang y=65) -> UNKNOWN dalam 91 ms tanpa bergerak, percobaan kedua berhasil (fix retry/escape BELUM DIUJI).
Chest: koordinat yang diberikan pemilik terbaca "stone" oleh bot pada 3 percobaan (penyebab tak diketahui; mungkin koordinat berbeda) -> auto-detect ditambahkan, BELUM DIUJI.
DILAPORKAN: pemilik meminta semua tes lain dianggap berhasil (log tidak dilihat).
YSM (sumber publik, bukan kode): perintah /ysm butuh OP level 2 (model reload, auth all|clear|add|remove); model dipilih lewat GUI klien (Alt+Y) yang mengirim pilihan ke server. Perintah "set model pemain lain"
tidak ditemukan di sumber yang saya baca (BELUM DIVERIFIKASI). Dugaan: bot tak punya model terpilih sehingga tampak T-pose; solusi mungkin meniru paket pilih-model klien asli (format tertutup).
Langkah: ketik "/ysm " + Tab di klien OP; jalankan !channels ysm di bot; tangkap paket klien asli bila perlu.

## 12. Pembaruan checkpoint #6
Log pemilik (UI/SSE): mine.collect oak_log + chest OK (24 dtk), hunt.kill cow x5 OK (8,7 dtk), fish.cast OK (58 dtk; detail tangkapan terpotong), nav.goto OK; hunt.kill tanpa mob -> PRECONDITION_FAILED; fish.cast pertama ABORTED (penyebab tak terlihat, kemungkinan stop manual);
farm.harvest wheat GAGAL dua kali (TARGET_NOT_FOUND, 26 dan 28 dtk = kira-kira 5 x thinkTimeout 5 dtk). Hasil lengkap terpotong di log, jadi data.reasons tidak terlihat.
Akar masalah (TERBUKTI dari source): world.raycast memakai block.shapes; tanaman punya shapes kosong sehingga GoalLookAtBlock.isEnd tak pernah terpenuhi -> pathfinder timeout. Perbaikan: U.approach (GoalNear untuk blok tanpa shapes). Berlaku juga bagi mine.collect pada blok tanpa shapes.
Params skill dari UI bisa berupa string ("wheat"); farm.harvest kini menerima daftar dipisah koma. Engine memvalidasi params terhadap paramsSchema (HTTP 400). ABORTED membawa alasan (USER_STOP, USER_CANCEL, KILLSWITCH, DIED, TIMEOUT).
Inventory: item modded tak dikenal bernama "unknown" oleh prismarine-item; dikelompokkan per id numerik (unknown#<id>); komponen item tidak terbaca (dua item berbeda komponen dengan id sama tampak sama).
Paket yang memuat komponen modded gagal parse dan dibuang (PARSE GAGAL window_items/set_slot) sehingga bot.inventory dapat tertinggal dari server. Belum ada pemeriksaan silang; rencana: inv.snapshot via /data get entity.
## 13. Pembaruan checkpoint #7
- Skill baru: inv.snapshot, inv.view, inv.store, inv.take (+ pembantu skills/_snbt.js, _names.js, _inv.js; tes tests/inv.test.js, 58 kasus). Semuanya TERUJI TIRUAN, BELUM DIUJI di server.
- Kebenaran inventory/chest = /data get ... (bot harus op, gamerule sendCommandFeedback true). Jendela chest dan inventory protokol bisa tertinggal karena paket bermuatan komponen modded gagal parse.
- BotState.inventory: source=snbt, accurate=true hanya bila snapshot terakhir cocok dan berumur <30 dtk; selain itu protocol/false.
- Item modded: nama dari registri sinkronisasi (ITEM NAMES di log) atau hasil snapshot (itemmap.json). inv.store/inv.take melewati item modded kecuali includeModded=true (serialisasi komponen item belum terbukti).
## 14. Pembaruan checkpoint #8
- Akar masalah inv.view/take "chest tidak terbuka": mineflayer baru memancarkan windowOpen setelah window_items diparse, dan paket itu memuat isi chest + seluruh inventory pemain; satu item bermuatan komponen modded -> paket dibuang -> openContainer menggantung dan jendela tertinggal terbuka di server. Perbaikan: skills/_inv.js openChest (mode degraded, ensureClosed, reset saat respawn).
- Akar masalah "snapshot hanya membaca item setelah spawn": window_items(0) saat join dibuang utuh bila satu item bermuatan komponen modded -> semua item yang sudah dibawa tak terbaca. snapshot hydrate memulihkan item polos; item bermuatan komponen tetap tak terbaca.
- Akar masalah inv.store "gagal padahal item vanilla terpindah": hasil dihitung dari inventory bot 150 ms setelah deposit sementara konfirmasi server lambat saat server lag. Kini dihitung dari isi chest di server (/data get block) bila bot op, atau menunggu stabil (settle).
- deposit(type) menolak item modded ("Invalid itemType"); item modded dipindah lewat window_click mode 1 (shift-click) per nomor slot: server menerapkan klik walau stateId tidak cocok (dugaan dari kode vanilla; BELUM DIUJI di server).
- Variabel lingkungan uji: ARCADIA_OPEN_MS, ARCADIA_OPEN_GRACE_MS (batas tunggu open_window), ARCADIA_DATA_DIR.
## 15. Pembaruan checkpoint #9
- Skill baru: craft.item dan breed.animals (skills/craft.item.js, skills/breed.animals.js; tes tests/craft.test.js 26 kasus, tests/breed.test.js 25 kasus; mock bersama tests/invmock.js). Total tes: 45 + 29 + 91 + 26 + 25. Semua TERUJI TIRUAN, BELUM DIUJI di server.
- craft.item memakai Recipe.find (prismarine-recipe) dan bot.craft mineflayer. Resep 2x2 tidak membuka jendela apa pun (aman walau inventory berisi item bermuatan komponen modded); resep meja membuka jendela lewat I.openWindowAt dan menolak bila mode degraded.
- breed.animals: pendengar entitySpawn dipasang SEBELUM memberi makan (anak bisa lahir saat hewan kedua masih diberi makan; sebelumnya race). Deteksi dewasa lewat metadata[16] (AgeableMob.DATA_BABY_ID, 1.21.x) BELUM DIUJI.
- Catatan inventory: I.reconcile / I.refreshInventory menyamakan tampilan bot dengan /data get entity (butuh op) lalu memperbarui bot.arcadia.inventoryTruth; dipanggil di akhir inv.store, inv.take, craft.item, breed.animals (kecuali verify/refresh=false).
- Cara menyerahkan kode: paket .zip + skrip pemasangan beranchor (install/fix-inv.js) yang aman diulang dan diuji pada klon bersih; salin-tempel EOF hanya untuk perubahan satu file kecil.

## 16. Pembaruan: guard (v2.5)
- Skill baru: guard.post (jaga titik) dan guard.follow (ikuti pemain sebagai pengawal); modul bersama skills/_combat.js (pilih ancaman, melee, memanah). Tes tests/guard.test.js (26 kasus). TERUJI TIRUAN, BELUM DIUJI di server.
- Memanah: tarik busur penuh 1050 ms sambil membidik terus, lalu lepas (activateItem/deactivateItem). Titik bidik memakai fisika panah vanilla (3 blok/tick, gravitasi 0.05, hambatan 0.99) dan lead dari kecepatan yang diukur dari perubahan posisi. Akurasi di server BELUM DIUJI. Crossbow belum.
- Durasi: durationMs (default timeoutMs - 8 dtk); runner membatasi timeoutMs default 300000, maks 1800000: isi timeoutMs untuk jaga lama.
- Enderman/piglin/iron_golem dilewati kecuali disebut di targets. HP di bawah minHealth: tidak menyerang, kembali ke pos/pemain, makan.
