# Indeks dokumentasi Arcadia

Dokumentasi aktif dirapikan 29 Oktober 2026. Mulai dari [README proyek](../README.md). Klaim historis hanya berlaku untuk tanggal/cakupannya; kondisi terbaru dan gate main ada di PROJECT_STATUS.

## Panduan aktif

| Dokumen | Isi |
|---|---|
| [Aturan agent](../AGENTS.md) | Kewajiban edit folder lokal dan disiplin kerja |
| [WORKFLOW](WORKFLOW.md) | Agent lokal vs chat ZIP; larangan fix.js/upgrader source |
| [PROJECT_STATUS](PROJECT_STATUS.md) | Arti native, audit kesiapan main, hasil uji dan batas |
| [CORE_ROADMAP](CORE_ROADMAP.md) | Analisis fix vs upgrade, tahapan inti dan kriteria penerimaan; USULAN menunggu verifikasi pemilik |
| [HANDOFF](HANDOFF.md) | Konteks ringkas untuk melanjutkan proyek |
| [TODO](../TODO.md) | Backlog aktif, tanpa checkbox historis bertentangan |
| [MAP](MAP.md) | Peta source dan alur eksekusi |
| [ADMIN_PANEL](ADMIN_PANEL.md) | Login, bot/worker, Multi/Single, kamera dan GLB |
| [LLM_SETUP](LLM_SETUP.md) | Setup .env Ollama/provider, Windows/Linux/Termux, uji LLM |
| [AGENT_RUNTIME](AGENT_RUNTIME.md) | Loop keputusan, izin, pemulihan dan sandbox |
| [MISSIONS](MISSIONS.md) | Runner kegiatan offline/legacy dan recovery dependency |
| [MINING_PREPARATION](MINING_PREPARATION.md) | Prasyarat alat/meja dan batas crafting/mining |
| [MACRO_SPEC](MACRO_SPEC.md) | Spesifikasi makro deklaratif; bukan tool JS agent |
| [USAGE_UPDATE](USAGE_UPDATE.md) | Memperbarui instalasi tanpa installer historis |
| [AGENT_BRIEFS](AGENT_BRIEFS.md) | Cara membatasi tugas dan memilih area source |
| [NEXT_CHAT](NEXT_CHAT.md) | Pembuka sesi untuk agent lokal atau chat ZIP |

## Riwayat bukti

- [CHANGELOG](CHANGELOG.md): perubahan menurut tanggal; bukan petunjuk instalasi versi kini.
- [FIELD_TESTS](FIELD_TESTS.md): log lapangan dan diagnosis; laporan lama dipertahankan.
- [Arsip checkpoint](archive/README.md): snapshot HANDOFF/TODO sebelum perapian.

## Rencana historis — bukan instruksi aktif

| Arsip | Pengganti untuk kondisi sekarang |
|---|---|
| [ADMIN_PANEL_PLAN](ADMIN_PANEL_PLAN.md) | ADMIN_PANEL dan TODO |
| [ORCHESTRATOR_PLAN](ORCHESTRATOR_PLAN.md) | AGENT_RUNTIME dan PROJECT_STATUS |
| [LIFECYCLE_PLAN](LIFECYCLE_PLAN.md) | MISSIONS, AGENT_RUNTIME dan TODO |
| [AGENT_BRIEFS_LIFECYCLE](AGENT_BRIEFS_LIFECYCLE.md) | AGENT_BRIEFS dan TODO |
| [UI_PLAN](UI_PLAN.md), [addendum](UI_PLAN_ADDENDUM_v1.2.md) | ADMIN_PANEL dan README proyek |
| [UPGRADE_PLAN_2026-10-19](UPGRADE_PLAN_2026-10-19.md) | CHANGELOG dan TODO |

Fragmen [README](_append/README.append.md), [MAP](_append/MAP.append.md), [TODO](_append/TODO.append.md) dan [TODO lifecycle](_append/TODO.lifecycle.append.md) di `_append/` adalah arsip installer lama. Jangan menempelkannya kembali ke dokumen aktif.
