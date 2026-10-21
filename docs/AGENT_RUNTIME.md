# Agent berulang, izin, dan sandbox

Implementasi 2026-10-21. **TERBUKTI dari log pemilik**: loop agent dan Ollama Cloud berjalan di Minecraft/NeoForge, termasuk pemulihan beberapa task dan kasus gagal pencarian kayu. Perbaikan anti-loop/eksplorasi terbaru **TERUJI TIRUAN** dan belum diuji ulang pada server asli. Sandbox JavaScript, API dan browser desktop/HP juga TERUJI TIRUAN.

## Mulai dari UI

1. Restart worker bot terkait melalui admin, lalu refresh halaman. Dependency QuickJS sudah dipasang pada workspace ini; instalasi baru mengikuti `npm install`.
2. Buka Single atau pilih bot fokus pada Multi. Panel **AGENT / IZIN** menyediakan slider **Observasi — Semi — Penuh**, tersimpan per bot.
3. Pilih **Penuh**, masukkan tujuan, lalu **Mulai kegiatan** (Single) atau **Jalankan tujuan** (Multi). Contoh: “Kumpulkan 4 cobblestone. Siapkan alat dan pulihkan hambatan crafting sampai berhasil.”
4. Pantau alasan, hasil native, keputusan, dan token. **Hentikan agent** menjeda; **Batalkan tujuan** mengakhiri tujuan. Kill switch tetap berlaku.

| Mode | Perilaku |
|---|---|
| Observasi | Menyusun usulan tanpa menjalankan skill/tool/command. |
| Semi (default) | Pembacaan keadaan diizinkan; cakupan baru meminta persetujuan yang berlaku selama tujuan tersebut. |
| Penuh | Pemulihan, skill dunia, metode buatan agent dan command sandbox berjalan tanpa persetujuan per langkah. |

Cakupan: read, move, mine, inventory, craft, combat, place, survival, tools, commands. Aksi gabungan seperti mining meminta juga izin crafting/placement/combat yang dapat dilakukannya. `ARCADIA_DIRECTOR_DENY` tetap berlaku. Mengubah mode menjeda tujuan aktif; tekan Lanjutkan untuk memakai izin baru. Full tetap tunduk pada sandbox, batas tujuan dan kill switch.

## Siklus keputusan

`agent/runtime.js`: tujuan → keadaan/hasil native → `Director.decide()` → satu tindakan → hasil → keputusan berikutnya. Kegiatan offline dan API `/missions` lama tetap menggunakan `lifecycle/missions.js`; kedua runner tidak menguasai executor bersamaan. Chat companion menerima ringkasan agent, tetapi Kirim pesan tetap percakapan.

- Log native, termasuk kode/error/data, diberikan kembali ke model. Kegagalan biasa memberi kesempatan LLM memilih pemulihan. Contoh crafting bermasalah: `inv.store includeModded=true`, pertahankan bahan melalui `keep`, lalu coba crafting/mining kembali. Pemilihan ini oleh LLM, bukan pemulihan hardcoded untuk setiap error.
- `world.inspect` membaca blok/entitas pada chunk yang dimuat, memeriksa koordinat, dan mengambil resep vanilla. Hasil pencarian kosong memiliki `found:0` dan `exhausted:true`; ini fakta area lokal, bukan alasan untuk mengulang query sama. `world.explore` berjalan secara berbatas tanpa menggali/menaruh blok untuk memuat area lain dan mencari target. `world.place` memasang satu blok inventory di ruang kosong dan memverifikasi konfirmasi server; tidak menimpa blok.
- Tujuan selesai melalui keputusan `finish` dengan ID hasil native sukses sebagai evidence. Referensi palsu, hasil gagal/parsial, dan hasil tool saja ditolak. Kesesuaian semantik bukti terhadap tujuan tetap dinilai LLM, bukan pembuktian universal bahwa rumah/portal sudah benar.
- `ask` untuk informasi pemilik yang benar-benar kurang. UI menyediakan jawaban/koreksi. Izin Semi dikelola engine, bukan pertanyaan LLM berulang.

Default: **40 keputusan, 30 menit, maksimum 128 langkah** per tujuan. API menerima 1–100 keputusan dan 1–120 menit. Tiga kegagalan identik menghentikan loop. Inspeksi identik atau mining pada area pencarian yang sudah habis ditolak sebagai `NO_PROGRESS`; dua penolakan identik memblokir tujuan. Perpindahan dengan `world.explore` membuat area baru sah dicari. Counter tidak dihapus oleh Lanjutkan. Rate limit LLM ditunggu, dengan deadline tetap berlaku. Budget LLM worker berlaku per bot, bukan kuota total lintas worker.

Semua keluaran skill dinormalkan sebelum masuk engine: `ok` wajib boolean, kode harus berasal dari kontrak, `data` harus objek JSON, dan kegagalan tanpa rincian mendapat error eksplisit. Kegagalan yang sudah menghasilkan item/aksi diberi `data.partial:true`. Keputusan agent memakai forced tool call; endpoint kompatibel OpenAI yang menolaknya mendapat satu fallback JSON. Balasan model non-JSON atau melanggar schema juga dicoba diperbaiki satu kali.

## Metode buatan agent

`tool.create` menerima nama, deskripsi, source JS dan input uji, misalnya:

```js
function run(input, world) {
  return { tasks: [
    { skill: 'nav.goto', params: { x: input.x, z: input.z } },
    { skill: 'world.inspect', params: { blocks: ['chest'], radius: 16 } }
  ] }
}
```

Source dijalankan dalam **QuickJS/WebAssembly di worker terpisah**, tanpa require/process/filesystem/jaringan/referensi bot. Batas: source 16 KB, heap 16 MB, sekitar 1 detik eksekusi JS, deadline worker 5 detik, output JSON 32 KB. Program sinkron, bukan runtime npm/Node.

Test saat create tidak mengeksekusi task Minecraft. Metode yang lolos disimpan bersama hash; maksimal 50 nama per bot. `tool.run` menggunakannya lagi. Output `tasks` maksimal 32, semuanya divalidasi sebelum task pertama; izin diperiksa per tindakan. Kegagalan membatalkan sisa rangkaian agar LLM merencanakan pemulihan. Metode bisa menghasilkan pola/algoritme baru dari skill tersedia, tetapi tidak memperkenalkan API Mineflayer baru secara langsung.

## Sandbox dan environment

Contoh `.env` berikut tidak mengubah file/key pemilik:

```dotenv
ARCADIA_AGENT_PERMISSION=semi
ARCADIA_MODE=production
ARCADIA_DEBUG_UNSAFE_SANDBOX=false
ARCADIA_SANDBOX_IMAGE=node:22-alpine
```

`ARCADIA_AGENT_PERMISSION` hanya nilai awal sebelum preferensi per bot tersimpan. Slider menjadi sumber pengaturan sesudahnya.

Command production memerlukan Docker daemon dan image yang sudah tersedia. Container tanpa jaringan, volume host, key atau Docker socket; root filesystem read-only, user non-root, capability dihapus, no-new-privileges, batas CPU/memori/PID. `/work` adalah tmpfs sementara. Batas command 15 detik/output 32 KB; timeout/stop menghentikan proses dan meminta penghapusan container. Agent tidak mengunduh image otomatis.

Setelah Docker terpasang, pemilik dapat menyiapkan image:

```sh
docker pull node:22-alpine
```

Tanpa Docker, command gagal jelas dan LLM dapat memilih JavaScript/native. **QuickJS tidak memerlukan Docker.** Jalur container nyata BELUM DIUJI pada perubahan ini.

Pelonggaran host hanya ketika kedua variabel ini aktif:

```dotenv
ARCADIA_MODE=debug
ARCADIA_DEBUG_UNSAFE_SANDBOX=true
```

Ini command host tanpa isolasi OS, disertai warning log/UI. Windows memakai PowerShell; Linux/Termux memakai shell lingkungan/PREFIX. Key tidak diwariskan melalui environment command, tetapi command host memiliki hak filesystem akun proses. Pada production, flag unsafe **diabaikan dengan warning**. Debug tanpa flag unsafe tetap memakai container.

Core agent/QuickJS tidak bergantung pada PowerShell. Windows sudah diuji; perangkat Linux/Termux fisik belum. Docker Android harus tersedia terpisah untuk jalur command; bukan syarat menggunakan native skill/QuickJS.

## Restart dan pengalaman ML

Data per bot: `ARCADIA_DATA_DIR/agent/<botId>/`.

- `checkpoint.json`: mode, tujuan, hasil, izin, budget dan feedback; disimpan sebelum aksi dunia.
- `agent-tools/tools.json`: source metode, hash dan status uji.
- `experience.jsonl`: tujuan, keputusan, keadaan sebelum/sesudah, hasil native, persetujuan, koreksi dan ringkasan hasil. File aktif dirotasi sekitar 8 MB; arsip dipertahankan untuk dataset.

Restart menjeda tujuan dan menandai aksi belum diketahui sebagai `uncertain`. Lanjutkan mewajibkan `world.inspect`/`inv.snapshot` sebelum aksi baru; aksi lama tidak otomatis diulang. Stop/death/disconnect membatalkan keputusan yang menunggu dan mengabaikan balasan terlambat.

Pengalaman siap dievaluasi/dilatih, tetapi **belum ada training bobot ML atau task generator offline terlatih**. Runtime memakai LLM, histori tujuan, dan metode tersimpan. Rumah, pencarian village, smelting dan penyalaan portal masih bergantung pada skill tersedia; full permission tidak menjamin semua tujuan besar selesai.

## API dan pengujian

Semua rute memakai autentikasi controller/admin dan isolasi per bot:

| Rute | Fungsi |
|---|---|
| GET `/bots/:id/agent` | Mode, tujuan, hasil, metode dan warning |
| POST `/bots/:id/agent/permissions` | `{ "mode": "observe|semi|full" }` |
| POST `/bots/:id/agent/goals` | `{ "goal": "...", "maxDecisions": 40, "maxMinutes": 30 }` |
| POST `/bots/:id/agent/goals/:goalId/stop` atau `/cancel` | Jeda/batal |
| POST `/bots/:id/agent/goals/:goalId/approve` | Setujui cakupan yang ditampilkan |
| POST `/bots/:id/agent/goals/:goalId/resume` atau `/reply` | Lanjutkan, opsional `{ "message": "..." }` |
| GET `/bots/:id/agent/experiences` | Maksimum 200 catatan terbaru dari file aktif |

Tes tanpa Minecraft/API key:

```sh
npm run test:agent
```

TERUJI TIRUAN: 13 kasus agent; regresi misi 8, API 57, UI 50, Director 48; check/sintaks lulus. Edge desktop/HP: agent Semi → dua langkah → verifikasi, slider Penuh persisten, karakter/kamera/input stabil. Admin multi-worker/multi-kamera juga lulus. Docker command dan server/LLM nyata belum diuji.

Referensi isolasi: [QuickJS/WASM](https://github.com/justjake/quickjs-emscripten) dan [opsi container Docker](https://docs.docker.com/reference/cli/docker/container/run/). Tidak menggunakan `node:vm` sebagai batas keamanan.
