const fs = require('fs'); const path = require('path')
function edit(file, marker, fn) { const old = fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'); if(old.includes(marker)) return console.log(file+': sudah ter-fix'); const next=fn(old); const b=path.join('backup/session-2026-10-16',file); fs.mkdirSync(path.dirname(b),{recursive:true}); if(!fs.existsSync(b)) fs.copyFileSync(file,b); fs.writeFileSync(file,next) }
function rep(s,a,b) { if(!s.includes(a)) throw Error('Anchor hilang '+a.slice(0,80)); return s.replace(a,b) }
edit('lifecycle/stats.js','// stats-start-context-v1',s=>{
 s=rep(s,"playerCount = Object.keys(bot.players).length", "playerCount = Object.keys(bot.players).filter(name => name !== bot.username).length")
 s=rep(s,'return { timeOfDay, tick, isRaining, playerCount, hostileCount, health, food, dimension }', `return { timeOfDay, tick, isRaining, playerCount, hostileCount, health, food, dimension: dimension.replace(/^minecraft:/, ''), hp: health, threatCount: hostileCount, weather: isRaining ? (bot && bot.thunderState > 0 ? 'thunder' : 'rain') : 'clear', known: { hp: Number.isFinite(bot && bot.health), time: Number.isFinite(bot && bot.time && bot.time.timeOfDay), dimension: !!(bot && bot.game && bot.game.dimension) } }`)
 const a=s.indexOf('function attach (engine, bot, opts) {'); const b=s.indexOf('\nmodule.exports =',a); if(a<0||b<0) throw Error('attach anchor')
 return s.slice(0,a)+`// stats-start-context-v1: snapshot au debut; ne pas compter les notifications deux fois.
function attach (engine, bot, opts = {}) {
  const dir = opts.dataDir || process.env.ARCADIA_DATA_DIR || './data'
  const statsFile = opts.statsFile || path.join(dir, 'stats.jsonl')
  const aggFile = opts.aggFile || path.join(dir, 'stats_agg.json')
  const starts = new Map(); const seen = new Set()
  const listener = ev => {
    if (!ev || !ev.type) return
    const d = ev.data || {}; const id = d.taskId || d.id
    if (!id) return
    if (ev.type === 'task.started') {
      seen.delete(id)
      starts.set(id, { ts: ev.ts ?? Date.now(), params: JSON.parse(JSON.stringify(d.params || {})), context: getContext(bot), batchId: d.batchId })
      return
    }
    if (!['task.finished', 'task.failed'].includes(ev.type) || seen.has(id)) return
    const start = starts.get(id)
    if (!start && !d.result) return
    starts.delete(id); seen.add(id); if (seen.size > 1000) seen.delete(seen.values().next().value)
    const result = d.result || {}; const ts = ev.ts ?? Date.now()
    const entry = { ts, taskId: id, botId: ev.botId || bot?.username || 'bot', skill: d.skill,
      params: start?.params || d.params || {}, durationMs: result.durationMs ?? Math.max(0, ts - (start?.ts ?? ts)),
      ok: result.ok === true, code: result.code || d.code || 'UNKNOWN', context: start?.context || getContext(bot),
      contextAtStart: !!start, ...(start?.batchId ? {batchId:start.batchId}:{}), result }
    try {
      fs.mkdirSync(path.dirname(statsFile), {recursive:true}); fs.mkdirSync(path.dirname(aggFile), {recursive:true})
      rotate(statsFile); fs.appendFileSync(statsFile, JSON.stringify(entry) + '\\n'); updateAgg(entry, aggFile)
    } catch (e) { console.warn('[stats] gagal mencatat: ' + e.message) }
    if (opts.onEntry) opts.onEntry(entry)
  }
  engine.on('event', listener)
  return { close: () => engine.off && engine.off('event', listener), statsFile, aggFile }
}
`+s.slice(b)
})
edit('lifecycle/persona.js','// persona-validation-v1',s=>{
 s=rep(s,'const cache = {}', "// persona-validation-v1\nconst { validate } = require('../contracts/validate')\nconst cache = Object.create(null)\nconst cacheKey = botId => path.resolve(personaPath(botId))\nconst check = p => { const bad = validate('Persona', p); if (bad) throw new Error('persona tidak valid: ' + bad); return p }")
 s=rep(s,"return path.join(dataDir(), 'personas', botId + '.json')", "if (typeof botId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(botId)) throw new Error('botId tidak valid')\n  return path.join(dataDir(), 'personas', botId + '.json')")
 s=rep(s,'persona = mergeWithDefault(parsed, botId)', 'persona = check(mergeWithDefault(parsed, botId))')
 s=s.replaceAll('cache[botId]', 'cache[cacheKey(botId)]')
 s=rep(s,'function save (botId, persona) {', 'function save (botId, persona) {\n  check(persona)')
 s=rep(s,'const persona = get(botId) || load(botId)\n  // Jepit', "if (!Object.hasOwn(DEFAULT_PERSONA.traits, trait) || !Number.isFinite(delta)) throw new Error('trait/delta tidak valid')\n  const persona = get(botId) || load(botId)\n  // Jepit")
 s=rep(s,'(needs.energy  || 1)', '(needs.energy  ?? 1)')
 return s
})
edit('lifecycle/sampler.js','// sampler-evidence-v1',s=>{
 s=rep(s,"const hp = typeof context.hp === 'number' ? context.hp : 20", "// sampler-evidence-v1: jangan menyimpulkan ada senjata dari HP.\n  const hp = Number.isFinite(context.hp) ? context.hp : (Number.isFinite(context.health) ? context.health : 0)")
 s=rep(s,"const dimension = context.dimension || 'overworld'", "const dimension = String(context.dimension || 'unknown').replace(/^minecraft:/, '')")
 s=rep(s,"(threatCount === 0 || hp >= 12)", "false")
 s=rep(s,"if (pre.requiresWeapon && !hasWeapon)", "if ((pre.requiresWeapon || ((timeOfDay === 'night' || threatCount > 0) && ['mine.collect','hunt.kill','nav.goto','farm.harvest'].includes(t.skill))) && !hasWeapon)")
 s=rep(s,'if (t.cooldownMs && (now - lastRan < t.cooldownMs))', 'if (lastExecutedMap[t.id] !== undefined && t.cooldownMs && (now - lastRan < t.cooldownMs))')
 return s
})
edit('tests/static.test.js','// junction-fixture-v1',s=>{
 s=rep(s,"let link = true; try { fs.symlinkSync(path.join(root, 'secret.txt'), path.join(ui, 'leak.js')) } catch (e) { link = false }", "// junction-fixture-v1: junction direktori tidak butuh hak symlink di Windows.\n  const outside = path.join(root, 'outside'); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'secret.js'), 'TOPSECRET')\n  let link = true; try { fs.symlinkSync(outside, path.join(ui, 'leak'), process.platform === 'win32' ? 'junction' : 'dir') } catch (e) { link = false }")
 s=rep(s,"g('/ui/leak.js')", "g('/ui/leak/secret.js')")
 s=rep(s,"const mutated = src.split", "if (g === 'SYMLINK' && !fx.link) { console.log('SKIP symlink: sistem tidak mendukung fixture'); continue }\n    const mutated = src.split")
 return s
})
edit('tests/ui.test.js','// pct-contract-v1',s=>rep(s,"t(B().progress.B.pct === 0.4, 'pct dalam persen (>1) dinormalkan ke pecahan')", "t(B().progress.B.pct === 1, 'pct di luar kontrak dijepit ke 1'); // pct-contract-v1"))
console.log('Lifecycle data terpasang')
