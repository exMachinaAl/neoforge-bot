# docs/ORCHESTRATOR_PLAN.md - dari "Director usul task" menuju orchestrator (v1, 2026-10-12)
Prinsip tetap dari UI_PLAN: LLM hanya mengusulkan Task/Command tervalidasi; killswitch selalu ada; otonomi bawaan MATI; label status jujur.

## Keadaan sekarang (L0) - TERUJI TIRUAN
orchestrator/llm.js (klien), director.js (konteks -> prompt -> JSON -> validasi manifest -> usulan pending -> setujui/tolak), try.js (uji tanpa bot). Anggaran N panggilan/menit. Tidak ada loop, tidak ada memori, tidak ada audit berkas, keluaran JSON bebas.

## Level dan syarat selesai
- L1 Usul terstruktur dan terukur. (a) tool/function-calling provider (anthropic tool_use, openai tools) menggantikan parse JSON bebas, dengan cadangan parse; (b) coba ulang SEKALI saat tidak valid dengan pesan galat validator; (c) versi prompt (PROMPT_VERSION) tercatat; (d) audit `director.log` JSONL: ts, versi prompt, model, hash prompt, balasan, keputusan, hasil akhir task; (e) harness evaluasi offline `orchestrator/eval.js` + skenario di `orchestrator/scenarios/*.json` (keadaan + tujuan + batasan). Selesai bila: tingkat usulan valid >= 95% pada 20 skenario dengan model palsu terekam, 0 pelanggaran keselamatan (skill terlarang, params di luar skema, HP rendah tapi usul tambang), tes mutasi menggagalkan penjaga yang dimatikan.
- L2 Loop multi-langkah. observe -> propose -> (setuju) -> hasil -> replan, dengan batas: maks langkah per sesi, maks token/biaya per sesi, maks percobaan ulang per kegagalan, berhenti pada DIED/INTERRUPTED, tujuan tercapai, atau killswitch. Konteks dipadatkan (ringkasan riwayat + N hasil terakhir). Selesai bila: 5 skenario nyata selesai di server dengan persetujuan manual tiap batch, semua tercatat di audit, anggaran tidak pernah terlampaui (uji).
- L3 Kebijakan otonomi. Mode: off | propose | auto-safe | auto. auto-safe = hanya skill allowlist dan params dalam batas (mis. nav.goto jarak <= R, sleep.auto, inv.snapshot); kondisi pemblokir: HP < batas, malam tanpa senjata, dimensi bukan overworld, antrean dijeda. Command setAutonomy/approve/reject + event director.decision di kontrak (commit terpisah). Selesai bila: mode auto-safe berjalan 30 menit tanpa campur tangan pada server uji dan UI menampilkan ALASAN, ANGGARAN, KESELAMATAN, KEBUTUHAN (HP/lapar/jam/stok).
- L4 Hub multi-bot (UI_PLAN bagian 7): Director memberi tujuan ke beberapa bot, menghindari bentrok (chest, area), melaporkan. Di luar lingkup sampai L3 terbukti dan bot kedua dibutuhkan.

## Konteks yang dibutuhkan (urut nilai/biaya)
BotState ringkas (ada) > riwayat task ringkas (ada) > ChestBook chests.json (TODO) > fakta dunia (jam, cuaca, dimensi: sebagian ada) > persona traits (kontrak ada, isi belum) > memori ringkas lintas sesi (belum). Dilarang masuk konteks: isi chat pemain, teks bebas dari dunia (papan nama, nama item) di luar bagian DATA.

## Pertahanan dan keandalan
Injeksi prompt: teks tak tepercaya hanya di bagian DATA; skill dan params selalu divalidasi ulang di kode (bukan percaya model); batas ukuran params 2 KB, timeoutMs dijepit; daftar blokir ARCADIA_DIRECTOR_DENY. Jaringan: timeout, redirect ditolak, anggaran/menit, backoff pada 429/5xx (belum ada; paket O-1). Biaya: catat token masuk/keluar per panggilan (ada di keputusan) dan agregat per sesi (belum).

## Pemilihan model
Bawaan murah (anthropic claude-haiku-4-5-20251001, openai gpt-4o-mini) lewat ARCADIA_LLM_MODEL; id model dapat berubah, sesuaikan dengan akun. Pisahkan peran bila perlu (perencana vs perangkum) lewat konfigurasi per peran - hanya setelah L2.
