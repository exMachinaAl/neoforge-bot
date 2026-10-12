

## Pembaruan 2026-10-12 (UI, Director, viewer) - ditulis tangan sampai MAP diregenerasi
**Alur tambahan**
- **Controller pelengkap:** `control/extend.js` MEMBUNGKUS listener `request` milik `control/index.js` (dipasang di `bot.js` oleh `install/fix-ui3b.js`). Ia melayani `/` dan `/ui/*` (lewat `control/static.js`), `/openapi.json`, `/bots/{id}/map|viewer|director*`; rute lain diteruskan apa adanya. Auth: header Bearer > `?token` > cookie `arcadia_<port>` (`control/cookie.js`); cookie dipetakan ke header untuk rute lama; ubah-data via cookie wajib same-origin.
- **Director:** `orchestrator/director.js` membangun konteks dari `engine.state()/list()` + manifest skill, memanggil model lewat `orchestrator/llm.js`, memvalidasi usulan (skill ada, params sesuai `paramsSchema`, maks 3 task, anggaran/menit), menyimpan usulan `pending`; Setujui -> `engine.enqueue({source:'planner'})`. Otonomi MATI. Uji tanpa bot: `orchestrator/try.js`.
- **UI:** `ui/index.html` (cangkang) memuat `ui/js/app.mjs`; modul: `dom` (pembuat elemen aman), `api` (klien + SSE), `store` (keadaan per botId + reduser event), `form` (form dari manifest), `cards`, `director`, `mapcard`+`mapview` (peta 2D cadangan).
- **Viewer:** `control/viewer3d.js` memuat prismarine-viewer secara malas (ARCADIA_VIEWER=1) dengan bind dipaksa 127.0.0.1; viewer utama = prismarine-viewer (D1).
**Di mana mengubah apa (tambahan)**
| Keperluan | Berkas |
|---|---|
| Rute API baru (sementara) | `control/extend.js` (jangka menengah: `control/index.js`, paket E-1) |
| Aturan berkas statis / CSP | `control/static.js` |
| Auth cookie / CSRF | `control/cookie.js`, `control/extend.js` |
| Prompt, validasi, anggaran Director | `orchestrator/director.js` |
| Provider/kunci/timeout model | `orchestrator/llm.js` |
| Uji model dari terminal / skenario evaluasi | `orchestrator/try.js` / (rencana) `orchestrator/eval.js` + `orchestrator/scenarios/` |
| Tampilan kartu / form / peta | `ui/js/cards.mjs`, `form.mjs`, `mapcard.mjs` |
| Keadaan UI & event | `ui/js/store.mjs` |
| Viewer 3D | `control/viewer3d.js` (+ rencana V-1 di `ui/`) |
**Endpoint (semua butuh auth)**
| Rute | Keterangan |
|---|---|
| GET /bots, /bots/{id}, /bots/{id}/tasks, /skills, /events (SSE) | lama (BotState, antrean+riwayat, manifest, event) |
| POST /bots/{id}/tasks, DELETE /bots/{id}/tasks/{taskId}, POST /bots/{id}/commands, POST /killswitch | lama |
| GET /, /ui/* | UI statis (extend) |
| GET /openapi.json | rute + skema skill dari manifest (extend) |
| GET /bots/{id}/map?r=4..32 | peta 2D data, cache 1 dtk, <20 KB (extend) |
| GET /bots/{id}/viewer | {enabled,url|reason} (extend) |
| GET /bots/{id}/director; POST .../director/ask {goal, dry?}; POST .../director/proposals/{pid}/approve|reject | Director (extend); POST .../director/autonomy = 501 |
**Variabel lingkungan (tambahan)**
| Variabel | Dipakai di |
|---|---|
| `ARCADIA_LLM_PROVIDER`, `ARCADIA_LLM_KEY` (atau `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`), `ARCADIA_LLM_MODEL`, `ARCADIA_LLM_URL`, `ARCADIA_LLM_RPM`, `ARCADIA_LLM_MAX_TOKENS`, `ARCADIA_LLM_TIMEOUT_MS` | orchestrator/llm.js |
| `ARCADIA_DIRECTOR_DENY`, `ARCADIA_DIRECTOR_AUTO` | orchestrator/director.js |
| `ARCADIA_VIEWER`, `ARCADIA_VIEWER_PORT` | control/viewer3d.js |
**Skrip `test` (tambahan):** `node tests/static.test.js && node tests/director.test.js && node tests/map.test.js && node tests/extend.test.js && node tests/ui.test.js` (+ `tests/sleep.test.js` bila arcadia-sleep terpasang).
**Area kepemilikan (agar tidak bentrok):** A = `contracts/` + `engine/` | B = `ui/` | C = `skills/` | D = `orchestrator/` | E = `control/` + viewer. Pemilik = uji server/HP. Kartu kerja: `docs/AGENT_BRIEFS.md`.
**Keputusan:** `docs/UI_PLAN_ADDENDUM_v1.2.md` (D1 viewer = prismarine-viewer, D2 peta 2D cadangan, D3 pembungkus sementara, D4 cookie per port, D5 Director hanya mengusulkan, D6 klien model tanpa SDK, D7 jalur orkestrasi).
