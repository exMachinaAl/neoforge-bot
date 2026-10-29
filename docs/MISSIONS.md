# Companion dan kegiatan terpadu

**Pembaruan 2026-10-21:** tujuan baru dari **Mulai kegiatan** memakai [agent berulang](AGENT_RUNTIME.md) dan slider izin. Dokumen di bawah menjelaskan runner lama/offline dan API `/missions`, yang tetap tersedia. Agent dan misi tidak berjalan bersamaan.

Implementasi 2026-10-19. Status **TERUJI TIRUAN**: engine/API asli dengan executor atau bot tiruan, browser Edge nyata. Minecraft dan model LLM sungguhan **BELUM DIUJI** untuk jalur baru ini.

## Cara memakai

Restart proses bot (`npm start` setelah proses lama berhenti), lalu muat ulang UI. Perubahan backend memerlukan restart; tidak ada installer/apply/upgrader.

- **Kirim pesan** mengobrol melalui konfigurasi LLM yang sudah ada. Balasan menerima konteks dunia, persona, percakapan terakhir, dan 12 ingatan terbaru. Chat tidak menjalankan aksi.
- **Mulai kegiatan** mengirim tujuan ke agent berulang; tindakan mengikuti mode izin. Jalur misi di bawah berlaku untuk kegiatan offline dan API `/missions`.
- **Pilih kegiatan offline** memakai sampler lifecycle yang ada, tanpa LLM. Ini masih aturan/skor deterministik, bukan ML terlatih.
- **Hentikan kegiatan** membatalkan task aktif dan menghentikan langkah berikutnya. **Lanjutkan** tersedia setelah masalah langkah diselesaikan.
- **Perbaiki rencana · LLM** menyusun sisa langkah berdasarkan hasil yang sudah tercatat. Langkah selesai tetap dipertahankan; rencana baru menunggu Lanjutkan. Maksimal tiga revisi.
- **Ingatan** menyimpan catatan dan hasil kegiatan per bot. Lupakan menghapus entri ingatan tersebut, bukan isi percakapan atau riwayat misi.
- **Kontrol lanjutan** memuat task manual, antrean, inventory, chat Minecraft, pengaturan, serta kill switch. Eagle View tetap tersedia di Dunia bersama.

## Perilaku runner

`lifecycle/missions.js` menjadi pemilik eksekusi kegiatan offline dan API `/missions`. Director dipanggil dengan `proposeOnly:true`: tidak ada auto-approve atau proposal legacy yang dapat mengantrekan task yang sama lagi. Lifecycle menyediakan `plan()` tanpa membuat batch approval lama.

Satu misi berjalan per bot, satu langkah dikirim ke engine pada satu waktu. Langkah berikutnya menunggu semua `dependsOn` selesai. Rencana LLM/lifecycle saat ini dikonversi menjadi dependency linear; API internal `create()` menerima graph acyclic eksplisit. Validasi menolak skill/parameter salah, dependency hilang, ID duplikat, dan siklus. Batas 12 langkah per rencana; Director tetap membatasi tiga task per balasan.

Status misi: `proposed`, `running`, `paused`, `blocked`, `finished`, `cancelled`. Status langkah: `pending`, `dispatching`, `running`, `done`, `failed`, `uncertain`. Prasyarat engine online, antrean tidak dijeda, kebijakan deny, keselamatan dasar dan parameter diperiksa sebelum setiap dispatch. Prasyarat rinci tetap diperiksa skill.

Checkpoint disimpan sebelum enqueue ke `data/missions/<botId>.json` (atau `ARCADIA_DATA_DIR`). Penulisan memakai file sementara dan rename. Bila penyimpanan gagal, tidak ada dispatch berikutnya. Batas penyimpanan: 50 misi, 100 ingatan, 80 pesan. Hasil gagal tetap masuk scoring meskipun rencana diperbaiki. Faktor pemilihan offline disimpan; telemetry skill lama tetap menerima task ID dan mission ID melalui `batchId`.

Saat restart, misi aktif menjadi paused dan langkah aktif menjadi uncertain. **Tidak ada pengulangan aksi otomatis.** Periksa dunia, lalu konfirmasi selesai atau siapkan ulang langkah dan lanjutkan. Task lama yang masih berjalan harus berhenti sebelum resolusi. Mati, disconnect, dan kill switch menghentikan kelanjutan misi. Ini pemulihan checkpoint, bukan melanjutkan posisi internal skill di tengah aksi.

API legacy Director/lifecycle tetap tersedia untuk kompatibilitas. UI companion memakai agent untuk tujuan baru dan runner misi untuk kegiatan offline. First-person dan login owner admin sudah tersedia; customer management serta training ML masih backlog. Lihat [ADMIN_PANEL.md](ADMIN_PANEL.md) dan [AGENT_RUNTIME.md](AGENT_RUNTIME.md).

## API

Semua rute memakai autentikasi dan pemeriksaan same-origin yang sama dengan API lama.

| Metode | Rute di bawah `/bots/{id}` | Body |
|---|---|---|
| GET | `/missions` | Snapshot misi, ingatan, percakapan |
| POST | `/missions/plan` | `{source:"llm" atau "offline", goal, run:true}` |
| POST | `/missions/{missionId}/start` | `{}` |
| POST | `/missions/{missionId}/stop` | `{}` |
| POST | `/missions/{missionId}/cancel` | `{}` |
| POST | `/missions/{missionId}/replan` | `{}` |
| POST | `/missions/{missionId}/resolve` | `{stepId, resolution:"retry" atau "done"}` |
| POST | `/companion/chat` | `{text}` |
| POST | `/memories` | `{text}` |
| DELETE | `/memories/{memoryId}` | — |

Event SSE `mission.updated` meminta UI mengambil snapshot terbaru. Polling cadangan tetap aktif tanpa mengganti kanvas profil/iframe.

## Verifikasi

`npm run test:missions`: dependency, gagal/stop, replan, restart, checkpoint gagal, respons LLM usang, isolasi jalur auto-approve.

`npm run test:companion-browser`: opsional, membutuhkan Edge dan `data/models/Momoi.glb`. UI/API/engine asli dengan bot dan balasan model tiruan; tidak memakai API key. Menguji chat, ingatan/hapus, misi dua langkah, reload, stabilitas kanvas/iframe, viewport desktop dan 390 px. Screenshot lokal: `backup/companion-desktop.png` dan `backup/companion-mobile.png`. Ini bukan uji browser HP fisik atau rendering dunia Minecraft.
