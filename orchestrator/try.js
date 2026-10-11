// orchestrator/try.js - uji model langsung dari terminal, TANPA server/bot: node orchestrator/try.js "kumpulkan 8 kayu" [--dry] [--hp 20] [--food 18] [--inv bread:3,iron_pickaxe:1]
// Memakai daftar skill sungguhan (manifest saja, tidak ada yang dijalankan). Kunci: ARCADIA_LLM_KEY (lihat orchestrator/llm.js).
const fs = require('fs'); const path = require('path')
const { createDirector } = require('./director'); const { configFromEnv, publicConfig } = require('./llm')
const args = process.argv.slice(2); const flag = n => { const i = args.indexOf('--' + n); return i < 0 ? undefined : args[i + 1] }
const goal = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--hp' && args[args.indexOf(a) - 1] !== '--food' && args[args.indexOf(a) - 1] !== '--inv') || ''
const skills = {}
for (const f of fs.readdirSync(path.join(__dirname, '..', 'skills'))) { if (!/^[a-z][a-z0-9_]*\.[a-z0-9_.]+\.js$/.test(f)) continue; try { const m = require(path.join(__dirname, '..', 'skills', f)); skills[m.manifest.name] = m } catch (e) { console.log('lewati ' + f + ': ' + e.message) } }
const inv = String(flag('inv') || '').split(',').filter(Boolean).map((s, i) => { const [n, c] = s.split(':'); return { name: n, count: Number(c) || 1, slot: 9 + i } })
const bot = { game: { gameMode: 'survival' }, time: { timeOfDay: Number(flag('tick') || 6000), isDay: Number(flag('tick') || 6000) < 12000 } }
const engine = { state: () => ({ status: 'online', pos: { x: 0, y: 64, z: 0 }, health: Number(flag('hp') || 20), food: Number(flag('food') || 20), dimension: 'overworld', inventory: { items: inv, source: 'stub', accurate: false } }), list: () => ({ paused: false, queue: [], history: [] }), enqueue: () => { throw new Error('mode uji: tidak ada antrean') } }
const cfg = configFromEnv(); const d = createDirector({ bot, runner: { skills }, engine, cfg })
;(async () => {
  console.log('konfigurasi:', JSON.stringify(publicConfig(cfg)), '| skill dimuat:', Object.keys(skills).length)
  if (!goal) return console.log('pakai: node orchestrator/try.js "tujuan" [--dry]')
  if (args.includes('--dry')) { const p = await d.ask(goal, { dry: true }); return console.log('--- SYSTEM\n' + p.system + '\n--- USER\n' + p.user) }
  try { const r = await d.ask(goal); console.log(JSON.stringify(r, null, 2)) } catch (e) { console.log('GAGAL (' + e.status + '): ' + e.message) }
})()
