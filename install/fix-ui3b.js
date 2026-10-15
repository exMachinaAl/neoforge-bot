// UI-3b + viewer + Director: memasang pembungkus controller di bot.js, menambah tes, dan menambahkan catatan dokumen (semua aman diulang).
const fs = require('fs')
// 1) bot.js: tangkap hasil start() lalu pasang extend
if (fs.existsSync('bot.js')) {
  let s = fs.readFileSync('bot.js', 'utf8')
  if (s.includes("control/extend")) console.log('bot.js: extend sudah terpasang')
  else {
    const re = /require\('\.\/control'\)\.start\(\{([^}]*)\}\)/
    if (!re.test(s)) console.log("bot.js: pola require('./control').start({...}) tidak ditemukan. Pasang manual: const api = require('./control').start({ bot, runner, engine }); require('./control/extend').attach(api, { bot, runner, engine })")
    else { fs.writeFileSync('bot.js', s.replace(re, (m, a) => "(() => { const api = require('./control').start({" + a + "}); require('./control/extend').attach(api, { bot, runner, engine }); return api })()")); console.log('bot.js: extend dipasang') }
  }
}
// 2) skrip test
if (fs.existsSync('package.json')) {
  const pj = JSON.parse(fs.readFileSync('package.json', 'utf8')); pj.scripts = pj.scripts || {}; let t = pj.scripts.test || ''
  for (const f of ['static', 'director', 'map', 'extend', 'ui']) { const c = 'node tests/' + f + '.test.js'; if (!t.includes(c)) t += (t ? ' && ' : '') + c }
  pj.scripts.test = t; fs.writeFileSync('package.json', JSON.stringify(pj, null, 2) + '\n'); console.log('package.json: skrip test diperbarui')
}
// 2b) tes lama yang mengharapkan UI satu-berkas: UI kini cangkang modul (index.html + ui/js/*.mjs)
if (fs.existsSync('tests/engine.test.js')) { const t = fs.readFileSync('tests/engine.test.js', 'utf8'); const o = '/textContent|replaceChildren/.test(html)'; if (t.includes(o)) { fs.writeFileSync('tests/engine.test.js', t.replace(o, '/type="module"/.test(html)')); console.log('tests/engine.test.js: pemeriksaan UI disesuaikan dengan UI modular') } }
// 3) dokumen
function add (file, marker, text) { const c = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''; if (c.includes(marker)) return console.log(file + ': sudah ada'); fs.writeFileSync(file, c.replace(/\n*$/, '\n') + '\n' + text); console.log(file + ': ditambahkan') }
add('README.md', '## Director (uji model langsung)', `## Director (uji model langsung)
Model HANYA mengusulkan task; tidak ada yang berjalan sebelum disetujui (otonomi MATI). Kunci hanya dari env, tidak pernah ke UI/log.
- Uji tanpa server/bot: \`ARCADIA_LLM_KEY=sk-... node orchestrator/try.js "kumpulkan 8 kayu lalu tidur" --inv bread:3 --hp 20\` (tambahkan \`--dry\` untuk melihat prompt tanpa memanggil model).
- Env: \`ARCADIA_LLM_PROVIDER\` (anthropic|openai; openai juga untuk server lokal via \`ARCADIA_LLM_URL\`, mis. http://127.0.0.1:11434/v1 tanpa kunci), \`ARCADIA_LLM_KEY\` (atau ANTHROPIC_API_KEY/OPENAI_API_KEY), \`ARCADIA_LLM_MODEL\`, \`ARCADIA_LLM_RPM\` (anggaran/menit, bawaan 6), \`ARCADIA_LLM_MAX_TOKENS\`, \`ARCADIA_LLM_TIMEOUT_MS\`, \`ARCADIA_DIRECTOR_DENY\` (skill terlarang, koma), \`ARCADIA_DIRECTOR_AUTO\` (skill yang disetujui otomatis; bawaan kosong).
- Di UI: kartu "Director (model)" -> tanya -> Setujui/Tolak. API: \`POST /bots/{id}/director/ask\`, \`/director/proposals/{pid}/approve|reject\`, \`GET /bots/{id}/director\`.
## UI baru, peta, viewer
- Buka URL \`API siap: http://127.0.0.1:8787/?token=...\` sekali; cookie HttpOnly (per port) dipasang dan token dihapus dari URL. UI modular di \`ui/\` (modul ES, tanpa HTML dinamis).
- Peta 2D: \`GET /bots/{id}/map?r=24\` (grid permukaan, ketuk sel untuk nav.goto). Viewer 3D opsional: \`npm i prismarine-viewer\` (~370 MB) + \`ARCADIA_VIEWER=1\` (dipaksa 127.0.0.1:3007).
- \`/openapi.json\` memuat rute dan skema skill dari manifest.
`)
add('FIELD_TESTS.md', '### Spike viewer 3D (prismarine-viewer)', `### Spike viewer 3D (prismarine-viewer) (TERBUKTI dari kode paket; belum dijalankan dengan bot)
- README paket mendaftar 1.21.1 di versi yang didukung. Ukuran terpasang di disk ~372 MB (assets) - berat untuk Termux.
- lib/mineflayer.js memanggil http.listen(port) tanpa host = semua interface (tanpa autentikasi). Solusi di control/viewer3d.js: memaksa 127.0.0.1 hanya selama pemanggilan (TERUJI TIRUAN: tes bind).
- BELUM DIUJI: render dunia bermod, blok tak dikenal, performa di HP. Aktif hanya bila ARCADIA_VIEWER=1.
`)
add('TODO.md', '## Pembaruan #7 (UI/Director)', `## Pembaruan #7 (UI/Director)
- [~] UI modular + cookie per port + peta 2D + Director + /openapi.json: TERUJI TIRUAN (npm test), BELUM DIUJI di browser HP dan dengan model sungguhan
- [ ] Uji model: ARCADIA_LLM_KEY=... node orchestrator/try.js "..." lalu lewat UI (kartu Director); kirim hasil/galat
- [ ] Kartu progress memakai bentuk BotState.progress/event task.progress dari UI_PLAN (pct/label/data, taskId+seq): cocokkan dengan implementasi asli
- [ ] Otonomi Director (loop) dan event director.decision di kontrak: belum ada (sengaja)
- [ ] Viewer 3D: uji nyata (spike tinggal eksekusi)
`)
