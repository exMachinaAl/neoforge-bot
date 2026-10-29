> **ARSIP FRAGMEN INSTALLER — JANGAN DITERAPKAN.** Isi ini berasal dari distribusi lama dan tidak boleh ditambahkan kembali ke README/MAP/TODO. Gunakan [indeks aktif](../README.md) dan [WORKFLOW](../WORKFLOW.md); upgrade source tidak memakai fix.js.

## Batch 12 — Otak lifecycle: statistik, task acak berbobot, skor, upgrade, tool tambahan (rencana 2026-10-12)
Rancangan: `docs/LIFECYCLE_PLAN.md`; kartu paralel: `docs/AGENT_BRIEFS_LIFECYCLE.md`. Status: RENCANA, belum ada kode. Urutan: B10-1 tetap dulu untuk jaringan; Batch 11 (viewer/orchestrator) berjalan paralel.
Gelombang 1 (serentak, tanpa mengubah perilaku bot)
- [ ] A-1 kontrak lifecycle v0.3 [A]  - [ ] S-1 audit sinyal konteks [Pemilik+D]  - [ ] S-2 pengumpul statistik [D]  - [ ] P-1 persona stats [D] (usulan pemilik: dulu)  - [ ] S-3 penghitung skor offline di tasks.log [D]
Gelombang 2: [ ] G-1 cyclebook + sampler mode kering [D]  [ ] U-1 kartu Batch/Skor/Persona [B]  [ ] L-2 rubrik evaluator LLM [D]  [ ] T-1 spesifikasi makro [C+A]
Gelombang 3: [ ] G-2 mode propose + persetujuan  [ ] PR-1 progresi/upgrade  [ ] T-2 interpreter makro  [ ] L-1 peringkat ulang LLM
Gelombang 4: [ ] C-1 konfigurasi berversi + patch  [ ] G-3 bandit  [ ] O-3 auto-safe  [ ] T-3 keputusan kode buatan model (bawaan: tidak)
Keputusan terbuka pemilik: LIFECYCLE_PLAN bagian 7 (bobot skor, T3, kenaikan otomatis vs persetujuan, nama pemain di prompt, anggaran LLM, arti affection, ambang "banyak pemain", lokasi data).
