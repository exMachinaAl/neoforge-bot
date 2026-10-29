# Peta source Arcadia

Peta aktif, diperiksa 29 Oktober 2026. Rujukan API rinci adalah source dan manifest; jumlah baris file tidak dijadikan kontrak.

## Alur eksekusi

`Admin/UI/CLI → agent atau runner misi → engine → skill → Mineflayer → server`

Hasil skill kembali ke agent/runner, event/SSE, statistik dan checkpoint. LLM dipanggil pada tingkat keputusan, bukan setiap tick fisika. UI menggunakan modul JavaScript lokal tanpa build frontend terpisah.

| Area | Source utama | Tanggung jawab |
|---|---|---|
| Entry bot | `bot.js`, `config.js`, `env.js` | Koneksi, konfigurasi, wiring runtime, CLI |
| NeoForge | `modchannels.js`, `channels.js`, `adapt.js`, `learn.js`, `logsrc.js` | Negosiasi dan adaptasi channel dari log |
| Dependency compatibility | `patch-all.js`, `patch-*.js` | Postinstall pada node_modules; bukan installer upgrade source |
| Agent | `agent/runtime.js`, `decision.js`, `permissions.js`, `sandbox.js` di `agent/` | Loop keputusan, izin, pemulihan, sandbox |
| LLM | `orchestrator/llm.js`, `director.js`, `status.js`, `try.js` di `orchestrator/` | Konfigurasi/provider, konteks, keputusan, uji CLI |
| Eksekusi | `engine/index.js`, `skills/index.js`, `skills/*.js` | Antrean, manifest, validasi, aksi native, SkillResult |
| Misi dan lifecycle | `lifecycle/missions.js`, `lifecycle/runtime.js`, `lifecycle/` | Dependency, checkpoint, persona, skor dan kegiatan offline |
| API standalone | `control/index.js`, `control/extend.js` | HTTP/SSE, auth, agent/misi/lifecycle/profile routes |
| Admin | `admin/index.js`, `server.js`, `manager.js`, `state.js`, `worker.js` di `admin/` | Akun owner, registry, worker, proxy viewer, profil offline |
| Kamera | `control/viewer3d.js`, `ui/js/viewer.mjs` | Prismarine Eagle/first-person dan integrasi UI |
| Profil GLB | `control/profile3d.js`, `ui/js/avatar3d.mjs`, `ui/js/companion.mjs` | Aset lokal, animasi, framing dan penyimpanan |
| Frontend | `ui/admin.html`, `ui/index.html`, `ui/js/`, `ui/css/` | Multi, Single, log agent, input dan statistik |
| Kontrak | `contracts/` dan manifest setiap skill | Bentuk task/state/hasil serta validasi |
| Verifikasi | `tests/`, skrip npm di `package.json` | Mock, integrasi API/worker, browser |
| Panduan | `README.md`, `docs/README.md`, `TODO.md`, `AGENTS.md` | Cara pakai, indeks, backlog, aturan kerja |

## Data lokal

Standalone memakai `data/` atau `ARCADIA_DATA_DIR`. Admin memakai `data/admin/admin.json` dan `data/admin/bots/{botId}/`; model bersama di `data/models/` atau `ARCADIA_MODELS_DIR`. Kredensial di `.env` lokal. Jangan memasukkan data ini dalam ZIP upgrade atau commit.

Inventory modded: `skills/_inv.js`, `_names.js`, `_snbt.js` di `skills/` menangani pembacaan server, rekonsiliasi dan nama item. Komponen modded yang tidak dipahami tetap menjadi batas kompatibilitas.

## Berkas historis

`install/fix-*.js`, ZIP upgrade lama di root, dan `docs/_append/` adalah peninggalan distribusi lama. Bukan bagian alur menjalankan fitur terbaru. Jangan meregenerasi dokumentasi aktif dari fragmen lama tersebut.
