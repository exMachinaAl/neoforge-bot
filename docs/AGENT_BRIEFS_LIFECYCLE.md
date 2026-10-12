# docs/AGENT_BRIEFS_LIFECYCLE.md - kartu kerja paralel untuk otak lifecycle (2026-10-12)
Rancangan: docs/LIFECYCLE_PLAN.md. Aturan bersama, area, dan prompt pembuka: docs/AGENT_BRIEFS.md bagian A dan D (berlaku sama). Area: A contracts+engine | B ui | C skills (termasuk interpreter makro) | D orchestrator + lifecycle/ | E control + viewer | Pemilik = uji server. Satu kartu = satu patch kecil terhadap hash HEAD; 8-12 tes termasuk jalur gagal + uji mutasi; label TERBUKTI/DILAPORKAN/TERUJI TIRUAN/BELUM DIUJI; tanpa dependency baru tanpa persetujuan.

## Apa dulu? (rekomendasi)
Mulai dari yang DETERMINISTIK, murah, dan tidak mengubah perilaku bot: **A-1 kontrak, S-1 audit sinyal, S-2 pengumpul statistik, P-1 persona stats (usulanmu), S-3 penghitung skor offline**. Kelimanya bisa serentak. Alasan: (1) memberi data nyata yang dibutuhkan semua lapisan di atasnya; (2) S-3 dapat dibuktikan pada tasks.log yang sudah ada; (3) belum ada biaya LLM dan belum ada risiko di dunia. LLM, makro, dan upgrade baru masuk setelah ada data dan skor.
Jalur kritis: A-1 -> S-2 -> S-3 -> G-1 -> G-2 -> PR-1.

## Gelombang 1 (paralel)
### A-1 Kontrak lifecycle v0.3 [A, S] - kontrak: YA (commit contracts/ terpisah)
Tujuan: definisi tambahan opsional agar lapisan lain bisa jalan paralel. Baca: contracts/contracts.schema.json, contracts/check.js, docs/LIFECYCLE_PLAN.md bagian 5, engine/index.js (event/Task). Langkah: tambah Persona.{needs,affection,xp,level}, Task.batchId, StatsSnapshot, Batch, BatchScore, event batch.* + lifecycle.updated; JANGAN menambah field yang belum diisi kode; contoh valid/tidak valid di check.js. Tes: tiap definisi (valid, tak valid, field tak dikenal ditolak bila additionalProperties:false), kompatibilitas mundur (dokumen lama tetap valid). Selesai bila: node contracts/check.js lulus dan semua tes lama tetap lulus. Di luar lingkup: kode di luar contracts/. Catatan: hanya definisi yang langsung dipakai paket Gelombang 1 (Persona, StatsSnapshot, BatchScore); sisanya menyusul bersama kodenya.
### S-1 Audit sinyal konteks [Pemilik + D, S] - kontrak: tidak
Tujuan: tabel sinyal (LIFECYCLE_PLAN bagian 3) berisi bukti dari server bermod. Langkah: skrip baca-saja yang mencetak jam/cuaca/jumlah pemain (bot.players, apakah termasuk bot sendiri)/mob/biome/cahaya; jalankan siang, malam, dengan 0/1/2 pemain; catat nilai asli. Tes: tes tiruan untuk pengurai tiap sinyal + jalur nilai kosong/aneh. Selesai bila: tabel di FIELD_TESTS.md dengan label dan keputusan sinyal mana dipakai. Di luar lingkup: pengambil keputusan.
### S-2 Pengumpul statistik [D, M, setelah A-1 untuk StatsSnapshot] - kontrak: ya (A-1)
Tujuan: catat tiap task + konteks saat mulai ke ARCADIA_DATA_DIR (JSONL, rotasi) dan agregat bergulir per (skill x bucket konteks). Baca: engine/index.js (event, tasks.log), skills/index.js (runner events), docs/LIFECYCLE_PLAN.md bagian 2.1. Langkah: modul `lifecycle/stats.js` memakai event engine (tanpa mengubah engine); bucket jam/ancaman/pemain; batas ukuran berkas; aman bila sinyal hilang. Tes: bucket benar di batas (tick 12000/13000/23000), event tak dikenal tidak crash, rotasi, konteks kosong, agregat konsisten, TIDAK mengubah perilaku antrean; mutasi: hapus penjaga ukuran -> tes gagal. Selesai bila: 1 jam aktivitas nyata menghasilkan berkas + agregat yang cocok dengan tasks.log (Pemilik). Di luar lingkup: keputusan, skor.
### P-1 Persona stats [D, M, setelah A-1] - kontrak: ya (A-1)
Tujuan: simpan dan baca persona (traits, needs, affection, xp, level) dengan batas perubahan. Baca: contracts (Persona), docs/LIFECYCLE_PLAN.md 2.2, TODO.md (Pembaruan #9: affection). Langkah: `lifecycle/persona.js` (muat/simpan JSON per bot di ARCADIA_DATA_DIR, validasi skema, `nudge(trait, delta)` dijepit +-0.02/batch dan 0..1, peluruhan, log perubahan, event persona.changed); API baca `GET /bots/{id}/persona` (E menambah rute). Tes: jepit, peluruhan, berkas rusak -> default aman + peringatan, tulis atomik, pembaruan serentak, mutasi penjepit -> tes gagal. Selesai bila: persona bertahan lintas restart dan perubahan terekam. Di luar lingkup: dampak ke keputusan (G-1).
### S-3 Penghitung skor offline [D, M, setelah A-1 untuk BatchScore] - kontrak: ya (A-1)
Tujuan: hitung skor batch dari log, dapat diputar ulang pada tasks.log nyata. Baca: docs/LIFECYCLE_PLAN.md 2.7, contoh baris tasks.log, FIELD_TESTS.md. Langkah: `lifecycle/scorer.js` + `lifecycle/rubric.json` (bobot dapat diubah); komponen: completion, keselamatan, efisiensi, kecocokan konteks (butuh konteks dari S-2; bila tak ada -> komponen dilewati dan dilaporkan), nilai; CLI `node lifecycle/replay.js tasks.log` mencetak tabel per batch/jendela waktu. Tes: tiap komponen (batas 0/100), batch kosong, hasil aneh, bobot tidak berjumlah 1 -> dinormalkan + peringatan, skor tak bergantung klaim agen (masukan agen tak mengubah komponen keselamatan), mutasi: hapus penalti kematian -> tes gagal. Selesai bila: replay pada tasks.log nyata menghasilkan tabel yang dapat diverifikasi manual (Pemilik: 3 batch dicek). Di luar lingkup: masukan pemain/agen.

## Gelombang 2
### G-1 Cyclebook + sampler mode kering [D, L, setelah S-2, P-1] - kontrak: tidak
Tujuan: hasilkan batch acak berbobot TANPA mengantrekannya. Langkah: `lifecycle/cyclebook/*.json` (skema + 10-15 template dari skill yang ada), `lifecycle/sampler.js` (filter keras -> skor -> softmax berbiji, versi 1: bobot tetap + epsilon), CLI `node lifecycle/dry.js --state ...` mencetak batch + alasan + biji. Tes (jalur gagal wajib): filter keras tidak pernah dilanggar pada 10.000 sampel berbiji; biji sama -> hasil sama; semua kandidat terfilter -> batch kosong + alasan; malam tanpa senjata tidak memilih template berisiko; distribusi mengikuti bobot (toleransi); mutasi: matikan filter HP -> tes gagal. Selesai bila: mode kering selama 1 sesi menghasilkan batch yang masuk akal dibanding aktivitas nyata (Pemilik menilai 10 batch). Di luar lingkup: mengantre task.
### U-1 Kartu Batch/Skor/Persona di UI [B, M, setelah A-1] - kontrak: tidak (memakai kontrak A-1)
Tampilkan persona (baca-saja), batch terakhir (alasan, biji, konteks), skor + rincian komponen, tombol masukan pemain (1-5) bila endpoint ada. Tes: XSS pada alasan/nama, bidang hilang, skor di luar rentang dijepit. Selesai bila: kartu benar dengan data tiruan; tidak mengubah kartu lain.
### L-2 Rubrik evaluator LLM [D, M, setelah S-3] - kontrak: tidak
Rubrik terstruktur (kriteria, skala, bukti dari log) + pemanggil memakai orchestrator/llm.js; keluaran SARAN dijepit +-10 poin dari skor objektif dan tidak menyentuh komponen keselamatan. Tes: balasan rusak/ekstrem/injeksi dijepit atau ditolak; tanpa kunci -> evaluasi dilewati; mutasi penjepit -> tes gagal.
### T-1 Spesifikasi makro (DSL) [C + A, S, hanya dokumen + contoh] - kontrak: ya bila skema makro masuk kontrak
Spesifikasi JSON: langkah (skill+params), kondisi (atas BotState), loop berbatas (maks N, maks durasi), penanganan gagal (lanjut/ulang/berhenti), variabel keluaran antar langkah. Larangan: tanpa kode sembarang. 5 contoh. Selesai bila: pemilik menyetujui spesifikasi.

## Gelombang 3
### G-2 Mode propose + persetujuan [D + B + A, L, setelah G-1, U-1]
Batch dari sampler tampil sebagai usulan (source `persona`), disetujui pemilik -> masuk antrean dengan batchId; tolak -> tercatat. Kontrak: Batch + event batch.* + Command approveBatch/rejectBatch (A). Tes: tidak ada yang masuk antrean tanpa persetujuan; killswitch membatalkan batch; kegagalan satu task menandai batch; mutasi persetujuan -> tes gagal.
### PR-1 Progresi/upgrade [D, M, setelah S-3, G-2]
XP/level dari skor; ambang di konfigurasi; kartu usulan upgrade (UI) dengan alasan; kenaikan otonomi/allowlist/tool = persetujuan pemilik; trait kecil otomatis dengan batas; penurunan otomatis bila pelanggaran keselamatan. Tes: tak ada kenaikan tanpa data cukup; pelanggaran menurunkan; batas tak terlampaui; mutasi.
### T-2 Interpreter makro [C, L, setelah T-1]
Skill `macro.run` + registry `tools/registry.json` (manifest, asal, kepercayaan, statistik); validasi terhadap manifest skill; batas langkah/durasi; abort bersih. Tes: kondisi/loop/gagal, makro merujuk skill tak ada ditolak, loop tak berhenti dipotong, abort saat langkah berjalan, mutasi batas loop.
### L-1 Peringkat ulang LLM [D, M, setelah G-1, O-1]
LLM menyusun ulang kandidat yang SUDAH lolos filter (tak bisa menambah kandidat); alasan tercatat; tanpa kunci -> sampler murni.

## Gelombang 4
### C-1 Konfigurasi lifecycle berversi + patch [D + A, L]
Berkas config berversi, muat ulang panas, rollback, `lifecycle.log`; usulan patch JSON dari LLM -> validasi skema + uji skenario -> persetujuan -> terapkan. Tes: patch tak valid ditolak, rollback memulihkan, versi naik monoton, konfigurasi rusak -> pakai versi terakhir baik.
### G-3 Bandit per konteks [D, M, setelah >= 2 minggu data S-2] | O-3 auto-safe (ORCHESTRATOR_PLAN) | T-3 Keputusan kode buatan model [Pemilik + C]
T-3 bawaan: TIDAK. Bila dipertimbangkan: keluaran = laporan risiko + prototipe analisis statis + tes mutasi sebelum keputusan; tanpa persetujuan tertulis tidak ada eksekusi kode model.

## Pemilik (pengujian)
M-1 uji model nyata (USAGE_UPDATE) | S-1 audit sinyal | menilai 10 batch mode kering (G-1) | memberi skor 1-5 pada batch nyata | memutuskan butir LIFECYCLE_PLAN bagian 7.
