# NEXT_CHAT.md — bahan awal untuk chat baru (pilih salah satu: A UI, B Lifecycle)

## Pembuka umum (tempel di awal)
Proyek: bot mineflayer "Arcadia" untuk server NeoForge 1.21.1 bermod (repo exMachinaAl/neoforge-bot). Bahasa Indonesia, ringkas; saya di HP/Termux. Baca dulu: docs/MAP.md, TODO.md, docs/HANDOFF.md, docs/FIELD_TESTS.md. Jangan membaca kode lain kecuali perlu.
Aturan kerja (hemat limit): satu batch = satu fitur; keluaran berupa patch `git apply` terhadap HEAD terbaru yang diklon (bukan zip, bukan file utuh); tes 8-12 kasus yang memuat jalur gagal; jangan klaim terbukti sebelum dites di server (label TERBUKTI / DILAPORKAN / TERUJI TIRUAN / BELUM DIUJI); tanya maksimal satu pertanyaan; mulai dengan teori singkat lalu langkah konkret.
Prasyarat: patch guard-v2.5 dan patch catatan ini sudah di-push.

## A. Upgrade UI (ui/index.html + control/index.js + engine)
Sudah ada: API HTTP+SSE (127.0.0.1, token): GET /skills, GET /bots, GET /bots/me, POST /bots/me/tasks, DELETE /bots/me/tasks/:id, POST /bots/me/commands, POST /killswitch, GET /events. UI membuat form dari manifest skill.
Urutan yang disarankan (satu batch masing-masing):
1. Progress langsung untuk skill panjang: `ctx.progress(data)` di runner -> event `task.progress` -> kartu "Task berjalan" (guard: kill/tembakan/mundur; follow: jarak ke pemain; farm: jumlah). Termasuk menampilkan `data` penuh hasil task di riwayat (log CLI memotongnya).
2. Tombol cepat: guard.post (pos sekarang, radius), guard.follow (pemain), stop (cancel task berjalan), killswitch.
3. Kartu Inventory (accurate/source dari BotState, tombol inv.snapshot) dan kartu Companion (bot.arcadia.companion).
4. GET /openapi.json dari manifest (untuk klien luar, mis. planner).
5. Peta 2D (blok permukaan + entitas, klik untuk nav.goto); viewer 3D hanya opsional dan harus di 127.0.0.1.
Keputusan terbuka: bentuk event task.progress; apakah mode (guard/follow) jadi task biasa di antrean atau "mode" terpisah.

## B. Lifecycle / Director (non-LLM, lalu plugin planner)
Sudah ada: skill vanilla (nav, mine, farm, fish, hunt, inv.*, craft, breed, sleep.auto, guard.*), BotState, antrean engine, kontrak Persona (traits, timing), bot.arcadia.companion (waktu bersama, kill, sesi).
Rancangan: Stock (inventory+chest, dengan penanda sumber dan kesegaran) -> Director (skor kebutuhan: makanan, kayu/besi, alat, tidur, keselamatan -> Task di antrean engine, tidak melewatinya) -> Cyclebook JSON (konteks -> skill -> hasil per menit, epsilon-greedy dengan batas keselamatan) -> Persona (bobot/ambang) -> opsional planner LLM berfrekuensi rendah dengan validasi paramsSchema.
Mulai dari yang kecil: ChestBook (catatan isi chest per koordinat, data sudah ada dari inv.view/store/take), lalu Director dengan 3 kebutuhan (makan, bahan dasar, tidur) memakai skill yang sudah ada.
Prasyarat dari uji lapangan: sleep.auto belum stabil (bangun 3-5 dtk, lihat FIELD_TESTS), INTERRUPTED menjeda antrean; hasil task perlu terlihat penuh agar Cyclebook bisa mencatat hasil.
