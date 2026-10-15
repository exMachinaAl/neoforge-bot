## Pembaruan v2.5 (UI, Director, viewer)
Ringkas; rincian di `docs/USAGE_UPDATE.md`, riwayat di `docs/CHANGELOG.md`, rencana di `docs/ORCHESTRATOR_PLAN.md` dan `docs/UI_PLAN_ADDENDUM_v1.2.md`.
- **UI baru:** `npm start` mencetak `API siap: http://127.0.0.1:8787/?token=...`; buka sekali, cookie `arcadia_<port>` (HttpOnly) dipasang dan token hilang dari URL. UI modular di `ui/` (modul ES, tanpa build, tanpa HTML dinamis), botId-first.
- **Uji model langsung:** `node orchestrator/try.js "tujuan" --dry` (lihat prompt) lalu `ARCADIA_LLM_KEY=... node orchestrator/try.js "tujuan"`. Model HANYA mengusulkan; task jalan setelah Setujui di UI. Otonomi MATI.
- **Viewer 3D (prismarine-viewer, opsional):** `npm i prismarine-viewer` (~370 MB) + `ARCADIA_VIEWER=1`; dipaksa 127.0.0.1:3007. Viewer utama proyek = prismarine-viewer; peta 2D buatan sendiri hanya cadangan ringan. Panel di UI: paket V-1 (belum ada).
- **Pasang pembaruan:** `unzip -o arcadia-ui-director.zip && node install/fix-ui3b.js && npm test`. Batalkan: `git checkout bot.js` atau `ARCADIA_API=0 npm start`.
- **Status:** TERUJI TIRUAN (npm test); BELUM DIUJI di browser HP, dengan model sungguhan, dan viewer dengan bot.
