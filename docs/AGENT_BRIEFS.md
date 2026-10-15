# docs/AGENT_BRIEFS.md - instruksi untuk agen paralel (2026-10-12)
Bacalah dulu: AGENTS.md, docs/HANDOFF.md, MAP.md, TODO.md, docs/UI_PLAN.md + docs/UI_PLAN_ADDENDUM_v1.2.md, docs/ORCHESTRATOR_PLAN.md. Satu kartu = satu patch kecil terhadap hash HEAD (`git rev-parse --short HEAD` di laporan).

## A. Aturan bersama (wajib)
1. Satu AI satu AREA; jangan menyentuh berkas area lain. Area: **A** contracts + engine | **B** ui | **C** skills | **D** orchestrator | **E** control + viewer. Pemilik = pengujian di server/HP.
2. Kontrak dulu, hanya menambah, commit terpisah `contracts/` (field baru opsional; diisi hanya bila ada kode yang mengisinya).
3. Patch: `git apply`-able terhadap HEAD yang disebut; bila HEAD bergeser, buat ulang dari HEAD baru. 8-12 tes termasuk jalur gagal, uji mutasi (matikan satu penjaga -> tes gagal), tambahkan ke skrip `test`.
4. Label jujur: TERBUKTI (log pemilik) | DILAPORKAN | TERUJI TIRUAN | BELUM DIUJI. Jangan menebak nama API/format: baca source atau minta berkas/log.
5. Tanpa dependency baru di `dependencies` tanpa persetujuan pemilik (Termux berat). prismarine-viewer = instal manual opsional.
6. Teks dinamis UI hanya lewat node teks; tanpa innerHTML; token tidak dipegang JS. Otonomi bawaan MATI; killswitch selalu terlihat.
7. Laporan: hash HEAD, patch, hasil tes + label, daftar yang BELUM terbukti, perubahan keputusan yang diperlukan.

## B. Peta ketergantungan (jalur paralel)
- Jalur 1 Viewer: V-0 (Pemilik+E) -> V-1 (B) -> V-2 (E, opsional) ; V-3 (A) kapan saja setelah V-0.
- Jalur 2 Orchestrator: O-1 (D) -> O-4/O-5 (D, paralel) -> O-2 (D) -> O-3 (A+D) -> O-8 (B).
- Jalur 3 Pengerasan: H-1 (C), H-2 (B), H-3 (E), E-1 (E) - bebas.
- Pemilik: B10-1 dulu, lalu uji model nyata (M-1), V-0, B10-3.
Bisa jalan serentak sekarang: V-0, O-1, H-1, H-2, H-3, M-1.

## C. Kartu kerja
### V-0 Spike viewer nyata [Pemilik + E, M]
Tujuan: jawab (a)-(e) UI_PLAN dengan bukti dari server bermod. Baca dulu: control/viewer3d.js, docs/UI_PLAN_ADDENDUM_v1.2.md D1, FIELD_TESTS.md (spike dari kode), node_modules/prismarine-viewer/README.md, lib/mineflayer.js. Kontrak: tidak. Langkah: `npm i prismarine-viewer` (catat df -h sebelum/sesudah); `ARCADIA_VIEWER=1 npm start`; verifikasi bind: `ss -ltn | grep 3007` harus 127.0.0.1; buka dari browser HP: blok vanilla, blok modded (Create), entitas, pergerakan; ukur CPU/RAM (top) 5 menit; catat apakah klien Termux sanggup. Tes: tes kecil yang memverifikasi bind loopback pada paket asli (jalur gagal: paket tak terpasang -> alasan jelas). Selesai bila: tabel (a)-(e) di FIELD_TESTS.md dengan label + keputusan: lanjut V-1 atau tutup. Di luar lingkup: UI, proxy. Laporan: sesuai A.7.
### V-1 Panel Viewer di UI [B, M, setelah V-0]
Tujuan: panel kelas satu untuk viewer asli. Baca: ui/js/app.mjs, ui/js/cards.mjs, control/extend.js (rute /viewer, CSP di control/static.js), hasil V-0. Kontrak: ya bila menambah `BotState.viewer?: {url}` (diisi A, V-3). Langkah: pilih (1) tab baru, (2) iframe (butuh `frame-src` untuk URL viewer di CSP - ubah di E), (3) proxy same-origin (V-2); tampilkan status/alasan saat mati; UI tetap normal tanpa viewer. Tes (8-12): viewer mati -> kartu menjelaskan; aktif -> tautan benar; URL berbahaya (javascript:) ditolak; tanpa innerHTML; mutasi: hapus penjaga URL -> tes gagal. Selesai bila: panel tampil di HP dan UI normal saat viewer mati. Di luar lingkup: mengubah viewer.
### V-2 Proxy viewer same-origin [E, L, opsional]
Tujuan: satu origin + autentikasi untuk viewer (akses jauh/iframe). Catatan risiko: klien viewer memakai socket.io di akar path; subpath butuh penulisan ulang atau port kedua yang diproteksi. Langkah: evaluasi dua opsi dengan bukti, implementasi satu (http + upgrade, tanpa dependency baru). Tes: tanpa cookie ditolak, WebSocket upgrade lolos, path traversal ditolak, mutasi. Selesai bila: viewer terbuka lewat UI dengan auth dan port viewer tetap loopback.
### V-3 Kontrak BotState.viewer? [A, S, setelah V-0]
Field opsional {url} diisi hanya bila aktif; commit contracts/ terpisah; engine/extend mengisi. Tes: valid/tidak valid, dan tidak muncul saat mati.
### O-1 Usulan terstruktur [D, M]
Tujuan: L1 (ORCHESTRATOR_PLAN). Baca: orchestrator/llm.js, director.js, tests/director.test.js. Langkah: tool/function-calling dua provider + cadangan parse; coba ulang sekali dengan pesan validator; PROMPT_VERSION; backoff 429/5xx; agregat token per sesi. Tes: balasan tool valid/rusak/kosong, retry berhasil/gagal, 429 -> backoff, kunci tak bocor, mutasi penjaga. Selesai bila: server model palsu lolos semua kasus; satu uji nyata oleh Pemilik (M-1) dicatat. Di luar lingkup: loop, otonomi.
### O-4 Audit director.log [D, S]  | O-5 Harness evaluasi [D, M]
O-4: JSONL per keputusan (ts, versi prompt, model, hash prompt, balasan, keputusan, outcome task); tidak memuat kunci; rotasi sederhana. O-5: orchestrator/eval.js + orchestrator/scenarios/*.json (20 skenario: keadaan, tujuan, batasan wajib), model palsu terekam; metrik valid%, pelanggaran keselamatan (harus 0), token, waktu. Selesai bila: `node orchestrator/eval.js` mencetak tabel dan gagal (exit 1) bila ada pelanggaran.
### O-2 Loop multi-langkah [D, L, setelah O-1, O-4]
observe->propose->setuju->hasil->replan; batas langkah/token/biaya/percobaan; berhenti pada DIED/INTERRUPTED/killswitch; konteks dipadatkan. Tes: batas tercapai, berhenti saat mati, replan setelah gagal, tidak menjalankan tanpa persetujuan. Selesai bila: 5 skenario nyata (Pemilik) dengan persetujuan manual, anggaran tak terlampaui.
### O-3 Kebijakan otonomi + kontrak [A + D, L, setelah O-2]
Kontrak: Director {enabled, mode, lastDecision, nextReviewAt}, event director.decision, Command setAutonomy/approve/reject (commit terpisah). Mode off|propose|auto-safe|auto; pemblokir HP/malam/dimensi/jeda. Tes: tiap pemblokir menghentikan; allowlist; killswitch menang; mutasi penjaga. Selesai bila: auto-safe 30 menit tanpa campur tangan di server uji (Pemilik).
### O-8 Panel Director v2 [B, M, setelah O-3]
Tampilkan ALASAN, ANGGARAN, KESELAMATAN, KEBUTUHAN (HP/lapar/jam/stok), riwayat, tombol mode otonomi; uji XSS pada alasan/params dari model.
### H-1 sleep.auto: klik bed lagi setelah bangun [C, S-M]
Baca: skills/sleep.auto.js, tests/sleep.test.js, FIELD_TESTS.md (catatan bug). Butuh dari Pemilik: `tail -n 1 tasks.log` (data.timeline). Langkah: baca timeline; terapkan perbaikan (a)-(d) di catatan; tes tiruan untuk kasus nyata. Selesai bila: tak ada klik bed setelah bangun pagi pada 3 uji server berturut-turut (Pemilik). Di luar lingkup: ubah skill lain.
### H-2 Cocokkan kartu progress dengan BotState.progress asli [B, S]
Baca: ui/js/store.mjs, cards.mjs, contracts (progress), engine. Langkah: samakan nama/skala bidang (pct pecahan atau persen), hapus tebakan; tes dengan event nyata (dari tasks.log/SSE). Selesai bila: kartu benar pada guard.post saat server berjalan.
### H-3 Tes extend tanpa bergantung mock lama [E, S]
Ganti tests/mock-ui.js dengan mock proyek yang sekarang; tes extend lulus di repo; bila ada perbedaan, perbaiki tes, bukan penjaga.
### E-1 Pindahkan rute stabil ke control/index.js [E, M, setelah V-1/H-3]
Hapus pembungkus; satu router; semua tes (extend/static/ui) tetap lulus.
### M-1 Uji model nyata [Pemilik, S]
Ikuti docs/USAGE_UPDATE.md bagian 3 (8 tujuan contoh); catat tabel di FIELD_TESTS.md (label DILAPORKAN/TERBUKTI); kirim keluaran try.js utuh. Selesai bila: ada keputusan model/id yang dipakai dan perkiraan biaya per panggilan.

## D. Prompt pembuka untuk agen baru (tempel)
"Proyek https://github.com/exMachinaAl/neoforge-bot (branch main). Clone, baca AGENTS.md, docs/HANDOFF.md, MAP.md, TODO.md, docs/UI_PLAN.md, docs/UI_PLAN_ADDENDUM_v1.2.md, docs/ORCHESTRATOR_PLAN.md, lalu docs/AGENT_BRIEFS.md bagian A. Kamu memegang AREA <A|B|C|D|E> dan kartu <ID>. Jangan menyentuh area lain. Jangan menebak; minta berkas/log bila kurang. Keluaran: patch git apply terhadap HEAD (sebut hash), tes, dan laporan berlabel. Mulailah dengan ringkasan pemahamanmu (maks 10 baris) sebelum mengubah apa pun."
