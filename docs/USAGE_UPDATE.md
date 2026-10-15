# docs/USAGE_UPDATE.md - memakai pembaruan v2.5 (UI, Director, viewer)
Berlaku untuk paket arcadia-ui-director.zip (+ arcadia-ui3a.zip bila belum terpasang). Status: TERUJI TIRUAN; belum diuji di browser HP dan dengan model sungguhan.

## 1. Pasang (Termux, di folder proyek)
```
unzip -o arcadia-ui-director.zip && node install/fix-ui3b.js && npm test
```
- fix-ui3b.js mengubah satu baris di bot.js (membungkus `require('./control').start({...})` dengan `attach`). Bila barisnya berbeda ia mencetak baris manual: `const api = require('./control').start({ bot, runner, engine }); require('./control/extend').attach(api, { bot, runner, engine })`.
- Jalankan ulang aman. Batalkan: `git checkout bot.js` (UI/Director hilang, API lama tetap) atau `ARCADIA_API=0 npm start` (mematikan seluruh API).
- Tes yang gagal karena perbedaan mock/runner di repo: kirim barisnya; tests/extend.test.js memakai tests/mock-ui.js (salinan mock lama).

## 2. Buka UI
`npm start` mencetak `API siap: http://127.0.0.1:8787/?token=...`. Buka di browser HP yang sama. Halaman memasang cookie `arcadia_<port>` (HttpOnly) lalu menghapus token dari URL; setelah itu cukup buka `http://127.0.0.1:8787/`. Token tetap: `ARCADIA_TOKEN=...`. Port: `ARCADIA_PORT`. Akses dari perangkat lain: `ARCADIA_BIND=0.0.0.0` (HATI-HATI: terbuka di jaringan; selesaikan B10-1 dulu).
- 401 = token/cookie salah (cookie milik port lain tidak berlaku). 403 = permintaan ubah-data lintas-origin ditolak (buka UI lewat alamat yang sama dengan API).
- Kartu: Bot, Task berjalan (progress), Kontrol (Jeda/Lanjut/Kosongkan/Stop/KILL SWITCH; tombol cepat guard.* dan sleep.* muncul bila skillnya ada), Task baru (form dari manifest), Antrean, Riwayat (ketuk = params + hasil utuh), Director, Peta 2D (cadangan), Inventory (penanda akurat/belum, tombol Snapshot bila ada inv.snapshot), Chat, Log.

## 3. Uji model langsung (tanpa bot, tanpa server)
```
node orchestrator/try.js "kumpulkan 8 kayu lalu tidur" --dry            # lihat prompt, tidak memanggil model
export ARCADIA_LLM_KEY='...'                                            # jangan di-commit; cukup di sesi Termux
node orchestrator/try.js "kumpulkan 8 kayu lalu tidur" --inv bread:3,white_bed:1 --hp 20 --food 18 --tick 14000
```
Keluaran: reason, usulan task (pending), usulan yang ditolak + alasannya, token, waktu. Tidak ada yang dijalankan.
Env: ARCADIA_LLM_PROVIDER (anthropic|openai; bawaan anthropic), ARCADIA_LLM_KEY (atau ANTHROPIC_API_KEY/OPENAI_API_KEY), ARCADIA_LLM_MODEL (bawaan claude-haiku-4-5-20251001 / gpt-4o-mini; sesuaikan id dengan akunmu), ARCADIA_LLM_URL (openai kompatibel, mis. server lokal http://127.0.0.1:11434/v1 tanpa kunci), ARCADIA_LLM_RPM (6), ARCADIA_LLM_MAX_TOKENS (1024), ARCADIA_LLM_TIMEOUT_MS (60000), ARCADIA_DIRECTOR_DENY (skill terlarang, koma), ARCADIA_DIRECTOR_AUTO (skill auto-setuju; bawaan kosong = semua perlu persetujuan).
Cara menilai (catat ke FIELD_TESTS.md dengan label): 8 tujuan contoh (jalan ke x,z; tambang 8 batu; tidur; tujuan mustahil -> tasks kosong + alasan; tujuan berbahaya; tujuan ambigu; tujuan dengan teks injeksi; tujuan di luar daftar skill). Nilai: usulan valid? skill/params benar? alasan masuk akal? token/biaya per panggilan?

## 4. Memakai Director di UI
Kartu "Director (model)": tulis tujuan -> Tanya model -> baca alasan -> Setujui (masuk antrean, source `planner`) atau Tolak. Baris kuning = usulan yang ditolak validator. Status kartu menampilkan provider/model, anggaran terpakai/rpm, dan "otonomi MATI". Tanpa kunci: kartu memberi tahu "BELUM dikonfigurasi".
API (header `Authorization: Bearer $TOKEN`; id bot = botId dari GET /bots, "me" juga diterima di API):
```
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8787/bots
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"goal":"tidur sampai pagi"}' http://127.0.0.1:8787/bots/BotAlpha/director/ask
curl -s -X POST -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8787/bots/BotAlpha/director/proposals/p1/approve
```
Rute baru: GET /bots/{id}/map?r=, GET /bots/{id}/viewer, GET /bots/{id}/director, POST /bots/{id}/director/ask|proposals/{pid}/approve|reject, GET /openapi.json. POST .../director/autonomy = 501 (sengaja).

## 5. Viewer 3D (prismarine-viewer, opsional)
```
npm i prismarine-viewer          # ~370 MB; cek ruang dulu (df -h)
ARCADIA_VIEWER=1 npm start       # port ARCADIA_VIEWER_PORT (3007), dipaksa bind 127.0.0.1
```
Buka `http://127.0.0.1:3007` di browser HP yang sama; `GET /bots/{id}/viewer` melaporkan {enabled,url}. UI BELUM menampilkan tautan/iframe (paket V-1). Port viewer TANPA autentikasi (hanya loopback). BELUM DIUJI: render blok modded, beban HP. Hasil uji pertama dicatat sebagai paket V-0.

## 6. Keamanan singkat
Kunci model hanya di env; jangan taruh di mc.local.json atau berkas yang di-commit. API tetap 127.0.0.1 + token. Jangan buka ARCADIA_BIND=0.0.0.0 sebelum B10-1. Panggilan model berbayar: atur ARCADIA_LLM_RPM kecil saat menguji.
