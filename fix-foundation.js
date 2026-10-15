const fs = require('fs'); const path = require('path')
const changed = []
function edit(file, marker, fn) {
  const old = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  if (old.includes(marker)) { console.log(file + ': sudah ter-fix'); return }
  const next = fn(old)
  if (next === old) throw new Error('Anchor tidak mengubah ' + file)
  const backup = path.join('backup/session-2026-10-16', file)
  fs.mkdirSync(path.dirname(backup), { recursive: true }); if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
  fs.writeFileSync(file, next); changed.push(file)
}
function rep(s, a, b) { if (!s.includes(a)) throw new Error('Anchor hilang: ' + a.slice(0, 100)); return s.replace(a, b) }
edit('contracts/contracts.schema.json', 'TaskProgress', s => {
  const j = JSON.parse(s); const d = j.definitions
  d.TaskProgress = { type: 'object', required: ['taskId','seq','pct','label','data'], additionalProperties: false, properties: { taskId: {type:'string'}, seq:{type:'integer',minimum:1}, pct:{type:['number','null'],minimum:0,maximum:1}, label:{type:'string',maxLength:160}, data:{type:'object'} } }
  d.BotState.properties.progress = {$ref:'#/definitions/TaskProgress'}
  d.BotState.properties.paused = {type:'boolean'}
  d.Event.properties.type.enum.push('task.progress')
  return JSON.stringify(j, null, 2) + '\n'
})
edit('skills/index.js', '// progress-v1', s => {
  s = rep(s, "const task = { id: 't' + (++seq)", "const task = { id: opts.taskId || 't' + (++seq)")
  s = rep(s, "const ac = new AbortController()", `// progress-v1: pecahan 0..1, maks 2/detik, salinan data, berhenti setelah abort.
    const ac = new AbortController()
    let progressSeq = 0; let lastProgress = -Infinity; let lastPct = 0
    const progress = (value = {}) => {
      if (ac.signal.aborted || !current || current.task !== task || Date.now() - lastProgress < 500) return
      try {
        const pct = Number.isFinite(value.pct) ? Math.max(lastPct, Math.min(1, Math.max(0, value.pct))) : null
        const p = { taskId: task.id, seq: progressSeq + 1, pct, label: String(value.label || '').slice(0, 160), data: value.data || {} }
        const json = JSON.stringify(p)
        if (Buffer.byteLength(json) > 3500 || checker()('TaskProgress', p)) return
        lastProgress = Date.now(); progressSeq++; if (pct !== null) lastPct = pct
        events.emit('task.progress', JSON.parse(json))
      } catch (_) { /* telemetri tidak memutus skill */ }
    }`)
  s = rep(s, '{ signal: ac.signal, mcData, movements: movementsFor }', '{ signal: ac.signal, mcData, movements: movementsFor, progress }')
  s = rep(s, "current.abort('ABORTED'); console.log('TASK stop", "current.abort('USER_STOP'); console.log('TASK stop")
  return s
})
edit('engine/index.js', '// integration-v1', s => {
  s = '// integration-v1: satu id task dari antrean sampai hasil/progress/log.\n' + s
  s = rep(s, 'const history = []', 'const history = []\n  let progress = null')
  s = rep(s, 'createdAt: t.createdAt })', "createdAt: t.createdAt, ...(t.batchId ? { batchId: t.batchId } : {}) })")
  s = rep(s, "createdAt: Date.now() }", "createdAt: Date.now(), ...(spec.batchId ? { batchId: spec.batchId } : {}) }")
  s = rep(s, "{ priority: t.priority, source: t.source }", "{ taskId: t.id, priority: t.priority, source: t.source }")
  s = rep(s, "if (r.code === 'DIED' || r.code === 'INTERRUPTED') { paused = true; emit('task.failed', { taskId: t.id, skill: t.skill, code: r.code, note: 'antrean dijeda (keselamatan); resume manual' }) }", "if (r.code === 'DIED' || r.code === 'INTERRUPTED') { paused = true }")
  s = rep(s, 'queueLength: queue.length }', 'queueLength: queue.length, paused }\n    if (progress) st.progress = progress')
  s = rep(s, "const logFile = process.env.ARCADIA_TASKLOG || 'tasks.log';", "const logFile = process.env.ARCADIA_TASKLOG || require('path').join(process.env.ARCADIA_DATA_DIR || '.', 'tasks.log');")
  s = rep(s, "runner.events.on('task.finished', r => { if (logFile === 'off') return;", "runner.events.on('task.finished', r => { if (logFile === 'off') { delete startedParams[r.taskId]; return };")
  s = rep(s, "if (!engineBusy && r.code !== 'PRECONDITION_FAILED') emit", "if (!engineBusy) emit")
  s = rep(s, "function cli (args) {", `runner.events.on('task.progress', p => { progress = p; emit('task.progress', p) })
  runner.events.on('task.finished', r => { if (progress && progress.taskId === r.taskId) progress = null })

  function cli (args) {`)
  s = rep(s, "return { on: (n, f) => ee.on(n, f),", "return { on: (n, f) => ee.on(n, f), off: (n, f) => ee.off(n, f), emit,")
  return s
})
edit('control/index.js', '// progress-no-replay', s => rep(s, "engine.on('event', ev => { recent.push(ev); if (recent.length > 100) recent.shift();", "// progress-no-replay: klien baru mengambil nilai terakhir dari BotState.\n  engine.on('event', ev => { if (ev.type !== 'task.progress') { recent.push(ev); if (recent.length > 100) recent.shift() };"))
edit('skills/_combat.js', '// guard-progress-v1', s => {
  s = rep(s, 'const stats = { kills:', 'const started = Date.now() // guard-progress-v1\n  const report = (state, target) => { try { if (ctx.progress) ctx.progress({ pct: (Date.now() - started) / Math.max(1, cfg.until - started), label: state, data: { state, ...stats, hp: bot.health, elapsedMs: Date.now() - started, ...(target ? { target: { name: target.name || \'unknown\', dist: bot.entity.position.distanceTo(target.position) } } : {}) } }) } catch (_) {} }\n  const stats = { kills:')
  s = rep(s, 'const c = cfg.center()', "report(low ? 'retreat' : 'patrol')\n      const c = cfg.center()")
  s = rep(s, 'seen.add(t.id)', "report('engage', t)\n      seen.add(t.id)")
  return s
})
edit('skills/farm.harvest.js', '// farm-progress-v1', s => rep(s, 'while (stat.harvested < count) {', "// farm-progress-v1\n  while (stat.harvested < count) {\n    if (ctx.progress) ctx.progress({ pct: stat.harvested / count, label: 'panen ' + stat.harvested + '/' + count, data: { ...stat } })"))
edit('ui/js/store.mjs', '// snapshot-progress-v1', s => {
  s = rep(s, "const f = p > 1 ? p / 100 : p;", "const f = p; // snapshot-progress-v1: kontrak pecahan 0..1\n")
  s = rep(s, 'function setState (id, st) { B(id).state = st; emit() }', "function setState (id, st) { const b = B(id); b.state = st; if (st.progress && (!b.seq[st.progress.taskId] || st.progress.seq > b.seq[st.progress.taskId])) applyEvent({ botId: id, type: 'task.progress', data: st.progress }); if (!st.currentTaskId) { b.progress = {}; b.seq = {} } emit() }")
  return s
})
edit('tests/extend.test.js', '// shared-mock-v1', s => rep(s, "require('./mock-ui')", "require('./mock') // shared-mock-v1"))
edit('.gitignore', '# runtime-local-v1', s => s.trimEnd() + '\n\n# runtime-local-v1\n*.bp\ndata/\n*.jsonl\nstats_agg.json\nitemmap.json\nchests.json\n')
console.log('Diubah: ' + changed.join(', '))
