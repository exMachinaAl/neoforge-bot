# MAP.md — peta berkas Arcadia (neoforge-bot)

Tujuan dokumen: orang/AI yang melanjutkan proyek cukup membaca berkas ini (dan `TODO.md`, `docs/HANDOFF.md`) tanpa membaca ulang seluruh kode. Bagian 3 sampai 5 dibangkitkan otomatis dari kode; bagian 1, 2, 6 ditulis tangan.

## 1. Alur singkat

- **Koneksi:** `bot.js` membuat client `minecraft-protocol` (versi 1.21.1, auth offline) -> `neoforgeHandshake` (fork `minecraft-protocol-forge`) menjawab negosiasi channel dari `channels.js` + `modchannels.js` (+ `ids/flows/versions/config/argtypes.json`) -> `mineflayer.createBot({ client })`. `respondToPing:false` karena mineflayer sudah membalas ping.
- **Belajar channel:** `npm run adapt` (`adapt.js` + `learn.js`) menjalankan bot berulang, membaca penolakan server (`neoforge:modded_network_setup_failed`) dan memperbarui JSON di akar. Log server dibaca lewat `config.js` + `logsrc.js` (berkas lokal atau `logCmd` via SSH).
- **Tambalan node_modules:** `patch-all.js` (postinstall) menjalankan `patch-nmpf`, `patch-checks`, `patch-protodef`, `patch-blocks`. Harus dijalankan ulang setelah `npm install`.
- **Skill:** `skills/<ns>.<nama>.js` mengekspor `{ manifest, run(bot, params, ctx), cli }`. `skills/index.js` (runner) memuat semuanya, memvalidasi params terhadap `paramsSchema`, menjalankan dengan `AbortSignal`, timeout, dan memetakan hasil ke `SkillResult`. Pembantu berawalan `_` tidak dimuat sebagai skill.
- **Engine:** `engine/index.js` = antrean berprioritas + `BotState` + event. Task yang berakhir DIED/INTERRUPTED menjeda antrean (lanjut manual).
- **Kontrol:** `control/index.js` = API HTTP + SSE (127.0.0.1, token). `ui/index.html` = WebUI yang membuat form task dari manifest skill. CLI di `bot.js`: `!task`, `!queue`, `!hit`, `!help`, `!quit`, atau `/perintah` / teks chat.
- **Kontrak:** `contracts/contracts.schema.json` (Task, SkillResult, SkillManifest, BotState, Persona, Capability, ErrorCode, dll.), `contracts/validate.js`. Jangan ubah skema tanpa commit khusus `contracts/`.
- **Inventory (penting):** paket yang memuat item bermuatan komponen modded gagal diparse dan dibuang, jadi tampilan bot (`bot.inventory`, jendela chest) bisa tidak lengkap. Kebenaran = `/data get entity|block` (bot harus op). Pembantu di `skills/_inv.js`: `serverInventory`, `serverChest`, `reconcile`, `refreshInventory`, `openChest`/`openWindowAt` (mode degraded), `quickMove` (shift-click per slot), `settle`. `bot.arcadia.inventoryTruth` dipakai `engine.state()` (source `snbt`, segar < 30 dtk).

## 2. Di mana mengubah apa

| Keperluan | Berkas |
|---|---|
| Hasil uji lapangan, diagnosis terbuka (sleep, guard) | `docs/FIELD_TESTS.md` |
| Bahan awal chat baru (UI / Lifecycle) | `docs/NEXT_CHAT.md` |
| Tambah skill baru | `skills/<ns>.<nama>.js` (manifest + run), tes di `tests/`, tambahkan ke skrip `test` di `package.json`, perbarui hitungan skill di `tests/engine.test.js` |
| Parameter muncul di form UI | cukup `paramsSchema.properties` pada manifest (UI membaca dari `/skills`) |
| Channel mod baru ditolak server | jalankan `npm run adapt`; bila macet lihat `learn.js`, `modchannels.js` |
| Tipe argumen command modded | `argtypes.json` lalu `node patch-nmpf.js` |
| Nama item modded | registri sinkronisasi (`bot.js` memuat ke `skills/_names.js`) atau `itemmap.json` hasil `inv.snapshot` |
| Perilaku antrean / BotState | `engine/index.js` |
| Endpoint API | `control/index.js` |
| Tampilan UI | `ui/index.html` |
| Mock tes (inventory/chest/hewan) | `tests/invmock.js`; mock dasar `tests/mock.js` |
| Ubah kontrak | `contracts/contracts.schema.json` (commit terpisah) + `contracts/check.js` |


## 3. Berkas kode (dibangkitkan otomatis; baris pertama komentar = tujuan)

### Akar
| Berkas | Baris | Tujuan |
|---|---|---|
| `adapt.js` | 138 | satu perintah npm run adapt: patch, uji koneksi, belajar channel, ulang sampai OK_PLAY — ekspor: `adapt, PAYLOAD_RE, ARG_RE` |
| `bot.js` | 171 | titik masuk: client + handshake NeoForge + mineflayer + CLI + engine + API/UI |
| `channels.js` | 78 | daftar dasar 59 channel play (TLM + Patchouli), semua optional dengan handler kosong |
| `config.js` | 11 | host/port/log/logCmd dari env MC_* > mc.local.json > bawaan |
| `learn.js` | 109 | mengurai payload penolakan negosiasi dan menerapkan hasil belajar channel (ids/flows/versions/config) — ekspor: `parseFailure, learnStep` |
| `logsrc.js` | 19 | sumber log server: berkas lokal atau perintah (mis. SSH), baca dari offset |
| `modchannels.js` | 34 | menyusun daftar channel akhir (play + configurationChannels) dari channels.js + JSON hasil belajar |
| `patch-all.js` | 10 | patch-all.js |
| `patch-blocks.js` | 20 | patch-blocks.js: blok modded (state id tak dikenal minecraft-data) dianggap kubus PADAT, bukan udara. |
| `patch-checks.js` | 15 | tambalan plugin: abaikan enum extension / feature flag modded |
| `patch-nmpf.js` | 18 | tambalan plugin: tipe argumen command modded sebagai void (dari argtypes.json) |
| `patch-protodef.js` | 12 | tambalan protodef: paket gagal parse dibuang, stream tetap hidup |
| `selftest.js` | 207 | selftest.js - uji fungsi vanilla bot di server bermod. Pakai di bot.js: !test | !test walk dig | !test list |
| `sniff.js` | 22 | sniff.js - tally custom_payload (channel mod) arah masuk/keluar per state. Pakai: !channels [kata kunci...] |

### engine/
| Berkas | Baris | Tujuan |
|---|---|---|
| `engine/index.js` | 129 | engine/index.js - antrean task berprioritas + BotState + Event (kontrak: contracts/) — ekspor: `createEngine` |

### control/
| Berkas | Baris | Tujuan |
|---|---|---|
| `control/index.js` | 75 | control/index.js - API HTTP + SSE + Web UI (tanpa dependency). Kontrak: contracts/README.md. Bind 127.0.0.1 + token. — ekspor: `start` |

### contracts/
| Berkas | Baris | Tujuan |
|---|---|---|
| `contracts/check.js` | 29 | node contracts/check.js : validasi skema + contoh. Butuh: npm i -D ajv |
| `contracts/validate.js` | 14 | contracts/validate.js - validate(nama, dokumen) -> null (valid) | string kesalahan. compile(schema) -> fungsi(params) -> null | pesan. Tanpa |

### install/
| Berkas | Baris | Tujuan |
|---|---|---|
| `install/fix-docs.js` | 61 | Menambah bagian pembaruan (append-only, aman diulang) ke README.md, TODO.md, docs/HANDOFF.md |
| `install/fix-inv.js` | 121 | Pemasangan paket v2.2 (inventory): edit file lama dengan anchor (aman diulang) + catatan dokumen. |
| `install/fix-wire3.js` | 14 | - |

### skills/ pembantu (diawali _)
| Berkas | Baris | Tujuan |
|---|---|---|
| `skills/_combat.js` | 130 | pertarungan guard: pilih ancaman, melee, memanah (lintasan panah vanilla) — ekspor: `guardLoop, aimPoint, launchAngle, flight, threats, shoot` |
| `skills/_inv.js` | 260 | skills/_inv.js - pembantu inventory/chest: kueri perintah via chat, data kebenaran server, pembanding, buka chest. — ekspor: `attachRefresh, reconcile, refreshInventory, openWindowAt, shortId, watch, ensureClosed, quickMove, invToWindow, settle, rawClose, fullId, isModdedId, ` |
| `skills/_names.js` | 50 | skills/_names.js - nama item modded. — ekspor: `load, loadFile, learn, save, nameOf, idOf, stats` |
| `skills/_snbt.js` | 155 | skills/_snbt.js - parser SNBT (teks NBT Minecraft) untuk keluaran /data get ... dan pemetaan slot inventory. — ekspor: `parse, extract, nbtSlotToMc, inventoryItems, containerItems` |
| `skills/_util.js` | 130 | skills/_util.js - helper bersama (nama berawalan _ = bukan skill) — ekspor: `sleep, NATURAL, gotoTimed, bestTool, movementsFor, equipWeapon, autoEat, hostiles, fight, guard, invTotals, diffTotals, creative, findContainer, appro` |

### skills/ skill (manifest dibaca langsung dari kode)
| Skill | Parameter | Butuh | Deskripsi |
|---|---|---|---|
| `breed.animals` | species, pairs, radius, waitMs, refresh | move, inventory.protocol | Kawinkan hewan ternak vanilla: beri makanan pada dua dewasa terdekat, tunggu anak lahir. Butuh makanan yang sesuai di inventory. Keberhasilan diukur d |
| `craft.item` | item, count, table, refresh, waitMs | move, block.read, inventory.protocol | Buat item vanilla dari bahan di inventory: tanpa meja bila resep muat di grid 2x2 (tidak butuh jendela chest), dengan meja crafting (terdekat/koordina |
| `farm.harvest` | crops, count, maxDistance, replant, guard, minHealth | move, block.read, block.dig, block.place, inventory.protocol | Panen tanaman matang (wheat, carrots, potatoes, beetroots) di sekitar dan tanam ulang bila punya bibit |
| `fish.cast` | count, maxDistance, biteTimeoutMs, guard, minHealth | move, block.read, inventory.protocol | Memancing: cari air terdekat, pegang joran, lempar dan tarik sampai count tangkapan (diukur dari penambahan inventory) |
| `guard.follow` | player, distance, radius, leash, ranged, targets, minHealth, lostTimeoutMs, durationMs, timeoutMs | move, combat.vanilla | Ikuti pemain sebagai pengawal: serang hostile di sekitar pemain (pedang/panah), berhenti bila pemain hilang |
| `guard.post` | x, y, z, radius, leash, ranged, targets, minHealth, durationMs, timeoutMs | move, combat.vanilla | Jaga titik tetap: serang hostile dalam radius (pedang/panah), kembali ke pos, mundur saat HP rendah |
| `hunt.kill` | mob, count, maxDistance, minHealth | move, combat.vanilla | Mengejar dan membunuh count entitas bernama mob (mis. cow, zombie) atau bertipe animal/hostile, dalam maxDistance |
| `inv.snapshot` | waitMs, save, hydrate | inventory.protocol, inventory.snbt, chat | Bandingkan inventory bot (protokol) dengan data server (/data get entity Inventory), samakan tampilan bot (pulihkan item polos, hapus item hantu), bel |
| `inv.store` | chest, items, keep, keepTools, includeModded, source, verify, waitMs | move, block.read, inventory.protocol, chat | Pindahkan item inventory ke chest/barrel (default: semua item vanilla kecuali alat/senjata), lalu laporkan isi chest. Item modded hanya dengan include |
| `inv.take` | item, count, chest, includeModded, verify, waitMs | move, block.read, inventory.protocol, chat | Ambil item dari chest/barrel ke inventory bot. item="all" mengambil semuanya. Item vanilla: jumlah tepat; item modded / jendela tak terbaca: shift-cli |
| `inv.view` | chest, verify, waitMs | move, block.read, inventory.protocol, chat | Buka chest/barrel dan daftar isinya. Bila jendela tak terbaca bot (item modded), isi diambil dari /data get block (butuh bot op); verify=true membandi |
| `mine.collect` | block, item, count, maxDistance, dig, guard, minHealth, chest | move, block.read, block.dig, inventory.protocol | Menambang blok terdekat sampai terkumpul count item hasil (drop otomatis dari data blok); menggali menembus tanah/batu alami bila perlu; opsional simp |
| `nav.goto` | x, y, z, range | move, block.read | Berjalan ke x,z (y opsional) sampai dalam jarak range blok; tanpa merusak/menaruh blok. Tanpa y: hanya jarak horizontal dihitung |
| `sleep.auto` | radius, place, breakAfter, waitForNight, retries, force, maxWaitMs, pollMs, stallMs | move, block.read, block.dig, block.place, inventory.protocol | Tidur sampai pagi: bed terdekat atau taruh bed lalu hancurkan setelah bangun; hanya overworld, malam/badai. Status uji: lihat docs/FIELD_TESTS.md |

### tests/
| Berkas | Baris | Tujuan |
|---|---|---|
| `tests/breed.test.js` | 111 | tests/breed.test.js - breed.animals (bot tiruan: hewan, pemberian makan, anak lahir lewat event entitySpawn) |
| `tests/craft.test.js` | 119 | tests/craft.test.js - craft.item (bot tiruan; resep vanilla asli dari minecraft-data/prismarine-recipe) |
| `tests/engine.test.js` | 74 | enqueue prioritas: nav (50), lalu mine (90) harus jalan lebih dulu setelah task pertama berjalan |
| `tests/guard.test.js` | 100 | guard.post, guard.follow, lintasan panah (26 kasus) |
| `tests/inv.test.js` | 252 | tests/inv.test.js - SNBT, nama item, inv.snapshot / inv.view / inv.store / inv.take (bot tiruan, tanpa server) |
| `tests/invmock.js` | 139 | tests/invmock.js - bot tiruan dengan model server tunggal (inventory + chest) untuk uji inventory/crafting/breeding. — ekspor: `mkInv, inv, srvInvCount, chestCount, chestIdCount, mcToNbt` |
| `tests/mock.js` | 40 | - — ekspor: `mk, mkBlock, mcData, bi, it` |
| `tests/skills.test.js` | 79 | movements |

### ui/
| `ui/index.html` | 45 | WebUI satu berkas (status, antrean, riwayat, chat, kill switch, form task dari manifest) |

### Data hasil belajar / konfigurasi (JSON di akar)
| Berkas | Isi |
|---|---|
| `argtypes.json` | 18 item |
| `config.json` | 3 kunci |
| `flows.json` | 345 kunci |
| `ids.json` | 399 item |
| `unknownblocks.json` | 1 kunci |
| `versions.json` | 282 kunci |

## 4. Variabel lingkungan
| Variabel | Dipakai di |
|---|---|
| `ARCADIA_API` | bot.js, install/fix-wire3.js |
| `ARCADIA_BIND` | control/index.js |
| `ARCADIA_DATA_DIR` | skills/_inv.js, skills/_names.js |
| `ARCADIA_ITEMMAP` | skills/_names.js |
| `ARCADIA_OPEN_GRACE_MS` | skills/_inv.js |
| `ARCADIA_OPEN_MS` | skills/_inv.js |
| `ARCADIA_PORT` | control/index.js |
| `ARCADIA_TASKLOG` | engine/index.js |
| `ARCADIA_TOKEN` | control/index.js |
| `ARCADIA_UNKNOWN_EMPTY` | patch-blocks.js |
| `MC_HOST` | config.js |
| `MC_LOG` | config.js |
| `MC_LOG_CMD` | config.js |
| `MC_PORT` | config.js |
| `TRACE` | bot.js |

## 5. Skrip npm
| Perintah | Isi |
|---|---|
| `npm run test` | `node tests/skills.test.js && node tests/engine.test.js && node tests/inv.test.js && node tests/craft.test.js && node tests/breed.test.js` |
| `npm run postinstall` | `node patch-all.js` |
| `npm run adapt` | `node adapt.js` |
| `npm run start` | `node bot.js` |
| `npm run check` | `node contracts/check.js && node skills/check.js` |

_Dibangkitkan oleh skrip dari commit 5aeb57b. Perbarui bila struktur berubah._
