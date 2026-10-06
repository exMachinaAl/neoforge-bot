# neoforge-bot
Bot mineflayer (1.21.1, auth offline) yang bisa masuk dan bertahan di server NeoForge bermod, belajar sendiri saat mod berubah (`npm run adapt`),
dan menjalankan task (jalan, tambang, pancing, panen, berburu) lewat CLI. Konteks lengkap untuk AI agent: `docs/HANDOFF.md`, aturan: `AGENTS.md`, backlog: `TODO.md`.

## Mulai
```
git clone https://github.com/exMachinaAl/neoforge-bot && cd neoforge-bot
npm install          # postinstall memasang 4 patch di node_modules
npm run check        # validasi kontrak + skill
npm start
```
Server lokal: taruh di `server/` (tidak ikut git), `online-mode=false`. Server lain: buat `mc.local.json` (jangan di-push):
`{ "host": "IP", "port": 25565, "logCmd": "ssh -p PORT -i ~/.ssh/botlog -o BatchMode=yes USER@IP 'cat /path/ke/logs/latest.log'" }`
Prioritas konfigurasi: env `MC_HOST`, `MC_PORT`, `MC_LOG`, `MC_LOG_CMD` > `mc.local.json` > bawaan (localhost:25565, `server/logs/latest.log`). Jangan pakai env bernama `HOST`.
Di Termux, jalankan `termux-wake-lock` sebelum task panjang.

## Perintah CLI (ketik di terminal bot)
- `!test [nama...]` / `!test list`: uji fungsi (state look walk jump blocks inventory equip modblock chest dig place attack probe); keluaran `SELFTEST_JSON`.
- `!task list | status | stop`; `!task <skill> k=v ...` atau `!task <skill> {json}`; hasil: baris `SKILLRESULT {...}`.
- `!channels [kata kunci]`: tabel channel mod masuk/keluar (diagnosis YSM/Epic Fight). `!hit`: serang mob terdekat. `!quit`.

## Skill
| Skill | Contoh |
|---|---|
| `nav.goto` | `!task nav.goto x=20 z=30` (tanpa y) atau `!task nav.goto 20 70 30` |
| `mine.collect` | `!task mine.collect block=stone count=8` (survival + pickaxe; menembus tanah alami) |
| `fish.cast` | `!task fish.cast count=3` (dekat air, bawa fishing_rod) |
| `farm.harvest` | `!task farm.harvest {"crops":["wheat"],"count":6}` |
| `hunt.kill` | `!task hunt.kill mob=cow count=2` |
Syarat umum: mode survival, hanya blok/item/entitas vanilla. Kegagalan dijelaskan di `SKILLRESULT.data.reasons`.

## Menambah mod baru
1. Hentikan bot. Commit kondisi sekarang: `git add -A && git commit -m "sebelum mod X"`.
2. Pasang jar, restart server, tunggu log memuat `Done`.
3. `npm run adapt` (1-5 menit; sukses berakhir `SELESAI`). `adapt` membaca log server (lokal atau `logCmd`) untuk channel opsional.
4. `npm start` minimal 1 menit. Sehat bila: `CHANNELS OK`, `EVENT spawn`, `CEK10s` paket ribuan dengan posisi bukan `0,0,0`, log server tanpa `Timed out` / `Invalid player data` / `Incompatible client`.
5. `git diff --stat`, lalu commit + push (`ids.json flows.json versions.json config.json argtypes.json`).
Mengurangi mod: tidak perlu apa-apa. Fresh clone dengan mod yang sama: `npm install && npm start`.

## Kalau adapt berhenti
| Pesan | Artinya | Tindakan |
|---|---|---|
| `patch-gagal` | versi dependency berubah | kirim pesan error |
| `MACET: tipe X sudah terdaftar` | argumen command punya properti | baca dari kode mod |
| `MACET: X tetap ditolak server` | payload opsional salah versi/flow | kirim 20 baris log server |
| `MACET: ... fase konfigurasi` | channel konfigurasi tetap hilang | kirim output + `xxd lastfail.bin \| head -40` |
| kick `mandatory registry data maps` | channel data map tidak terdaftar | sudah ditangani di `modchannels.js`; pastikan kode terbaru |
| kick `invalid_player_data` | channel opsional tanpa cek di mod | pastikan log server terbaca; `adapt` mendaftarkannya |
| `TAK TERBACA` | format pesan server berbeda | kirim barisnya |
| `PARSE GAGAL` / `SKIP paket gagal` | item bermod tak terbaca, paket dibuang | normal |

## Uji (urut; berhenti dan kirim hasil di langkah yang gagal)
Siapkan: `/difficulty peaceful`, `/gamemode survival BotAlpha`, lalu `/give BotAlpha minecraft:iron_pickaxe`, `iron_sword`, `fishing_rod`, `wheat_seeds 8`, `bread 8`.
1. `!test` tanpa FAIL; `walk` >= 4 blok. 2. `nav.goto x=20 z=30` lalu `/data get entity BotAlpha Pos` (ukuran gerak = posisi server, bukan animasi).
3. `nav.goto 0 70 90` (y di tanah) = OK dengan `note`. 4. `mine.collect block=dirt count=6` dan `block=stone count=8` (cobblestone, `dug` >= 8, blok buatan tidak rusak).
5. Tanpa pickaxe / di creative = `PRECONDITION_FAILED` jelas. 6. `mine.collect` dengan `chest` = `deposited` benar. 7. `hunt.kill mob=cow count=2`, lalu `/difficulty normal` + zombie.
8. `farm.harvest` gandum matang. 9. `fish.cast count=3`. 10. `!task stop` = `ABORTED`; `/kill BotAlpha` saat task = `DIED`. 11. Malam + `mine.collect`: `fights` > 0, bot tidak mati.
12. T-pose: `!channels ysm epicfight yes_steve`; bandingkan `npm start` dengan `ARCADIA_UNKNOWN_EMPTY=1 npm start`.
Kirim: `grep -a "TASK\|SKILLRESULT\|TEST\|CH \|EVENT\|SKIP\|ERR\|KICK" bot.log`

## Struktur
`bot.js` (entri) | `modchannels.js channels.js ids/flows/versions/config/argtypes.json` (channel hasil belajar) | `learn.js adapt.js` | `config.js logsrc.js` | `patch-*.js` (postinstall) |
`selftest.js sniff.js` | `contracts/` (skema + check) | `skills/` (runner + skill) | `unknownblocks.json`. Server selalu di `server/` (tidak ikut git). Jalankan dari root proyek.

## Antrean, API & UI
- Antrean berprioritas: `!queue add <skill> k=v ...`, `!queue list|clear|pause|resume|cancel <id>|kill`. `!task` tetap menjalankan satu task langsung.
- Saat `npm start`, bot mencetak `API siap: http://127.0.0.1:8787/?token=...`. Buka URL itu di browser (HP yang sama) untuk UI: status bot, antrean, riwayat, chat, kill switch, form task dari manifest skill.
- API (header `Authorization: Bearer TOKEN`): `GET /bots`, `GET /bots/me` (BotState), `GET|POST /bots/me/tasks`, `DELETE /bots/me/tasks/<id>`, `POST /bots/me/commands` (enqueue cancel pause resume clear stop say), `GET /skills`, `POST /killswitch`, `GET /events` (SSE).
- Env: `ARCADIA_TOKEN` (tetap), `ARCADIA_PORT` (8787), `ARCADIA_BIND` (127.0.0.1; 0.0.0.0 membuka ke jaringan, hati-hati), `ARCADIA_API=0` mematikan API.
- Kegagalan task yang mematikan bot (`DIED`/`INTERRUPTED`) menjeda antrean; lanjutkan manual (`!queue resume` atau tombol Lanjut).
- `mine.collect ... chest=true` (atau `"chest":"auto"`) menyimpan ke chest/barrel terdekat; `chest` berkoordinat memakai wadah di/dekat koordinat itu.
- Tes otomatis (bot tiruan): `npm test`.
