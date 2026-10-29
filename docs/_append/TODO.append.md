> **ARSIP FRAGMEN INSTALLER — JANGAN DITERAPKAN.** Isi ini berasal dari distribusi lama dan tidak boleh ditambahkan kembali ke README/MAP/TODO. Gunakan [indeks aktif](../README.md) dan [WORKFLOW](../WORKFLOW.md); upgrade source tidak memakai fix.js.

## Batch 11 — Viewer prismarine & Orchestrator LLM (rencana 2026-10-12)
Kartu rinci (format UI_PLAN bagian 4): `docs/AGENT_BRIEFS.md`. Urutan tetap: B10-1 (keamanan jaringan) dulu sebelum membuka API ke jaringan atau memakai ARCADIA_BIND=0.0.0.0.
Status masuk
- TERUJI TIRUAN: UI modular, controller pelengkap, Director + klien model, peta 2D, pembungkus bind viewer (npm test). BELUM DIUJI: browser HP, model sungguhan, viewer dengan bot.
- Keputusan pemilik (2026-10-12): viewer utama = prismarine-viewer (render asli); peta 2D buatan sendiri = cadangan; LLM dikembangkan hingga bisa menjadi orchestrator (bertahap L1..L4).
Jalur 1 Viewer
- [ ] V-0 Spike viewer nyata [Pemilik+E, M]: bukti (a)-(e) di server bermod -> FIELD_TESTS.md
- [ ] V-1 Panel Viewer di UI [B, M, setelah V-0]  - [ ] V-2 Proxy same-origin [E, L, opsional]  - [ ] V-3 Kontrak BotState.viewer? [A, S]
Jalur 2 Orchestrator
- [ ] O-1 Usulan terstruktur (tool calling, retry, backoff, versi prompt) [D, M]  - [ ] O-4 Audit director.log [D, S]  - [ ] O-5 Harness evaluasi + skenario [D, M]
- [ ] O-2 Loop multi-langkah dengan anggaran [D, L]  - [ ] O-3 Kebijakan otonomi + kontrak (Director, director.decision, Command) [A+D, L]  - [ ] O-8 Panel Director v2 [B, M]
- [ ] ChestBook (chests.json) sebagai konteks Director (sudah ada di Pembaruan #9) - masuk L2
Jalur 3 Pengerasan
- [ ] H-1 sleep.auto klik bed lagi setelah bangun [C] (butuh tail -n 1 tasks.log)  - [ ] H-2 kartu progress cocok dengan BotState.progress asli [B]
- [ ] H-3 tes extend tanpa mock lama [E]  - [ ] E-1 pindahkan rute stabil ke control/index.js [E]
Pemilik
- [ ] M-1 Uji model nyata (docs/USAGE_UPDATE.md bagian 3)  - [ ] B10-1..B10-6 tetap berlaku
Ditunda (dengan alasan)
- Hub multi-bot dan L4: tunggu L3 terbukti.  - Hapus peta 2D: tunggu V-1.  - Otonomi `auto` penuh: hanya setelah `auto-safe` terbukti di server uji.
