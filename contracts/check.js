// node contracts/check.js : validasi skema + contoh. Butuh: npm i -D ajv
let Ajv
try { Ajv = require('ajv') } catch { console.log('ajv belum ada: jalankan  npm i -D ajv'); process.exit(1) }
const ajv = new Ajv({ allErrors: true, strict: false })
ajv.addSchema(require('./contracts.schema.json'))
const v = n => ajv.getSchema('arcadia/contracts#/definitions/' + n)
const now = Date.now()
const cases = [
  // --- Task (lama) ---
  ['Task', true, { id: 't1', skill: 'mine.collect', params: { block: 'oak_log', count: 16 }, priority: 50, status: 'queued', source: 'cli' }],
  ['Task', false, { id: 't 1', skill: 'Mine', params: {}, priority: 500, status: 'queued' }],
  // --- Task + batchId (baru) ---
  ['Task', true, { id: 't2', skill: 'mine.collect', params: {}, priority: 10, status: 'queued', batchId: 'batch-001' }],
  ['Task', false, { id: 't3', skill: 'mine.collect', params: {}, priority: 10, status: 'queued', batchId: 'has space!' }],
  // --- SkillResult ---
  ['SkillResult', true, { taskId: 't1', skill: 'mine.collect', ok: false, code: 'PROTOCOL_UNSUPPORTED', error: 'inventory tidak terbaca' }],
  ['SkillResult', false, { taskId: 't1', skill: 'x', ok: true, code: 'BAGUS' }],
  // --- BotState ---
  ['BotState', true, { botId: 'b1', username: 'BotAlpha', status: 'online', capabilities: ['move', 'block.dig', 'inventory.protocol'], ts: now,
    inventory: { items: [{ name: 'dirt', count: 3, slot: 36 }], source: 'protocol', accurate: false }, currentTaskId: null, queueLength: 0 }],
  ['BotState', false, { botId: 'b1', username: 'BotAlpha', status: 'online', ts: now }],
  // --- Event (lama) ---
  ['Event', true, { ts: now, botId: 'b1', type: 'task.failed', data: { taskId: 't1', code: 'TIMEOUT' } }],
  // --- Event batch.proposed (baru) ---
  ['Event', true, { ts: now, botId: 'b1', type: 'batch.proposed', data: { batchId: 'batch-001' } }],
  ['Event', true, { ts: now, botId: 'b1', type: 'batch.approved', data: {} }],
  ['Event', true, { ts: now, botId: 'b1', type: 'batch.started', data: {} }],
  ['Event', true, { ts: now, botId: 'b1', type: 'batch.finished', data: {} }],
  ['Event', true, { ts: now, botId: 'b1', type: 'batch.scored', data: {} }],
  ['Event', true, { ts: now, botId: 'b1', type: 'lifecycle.updated', data: {} }],
  ['Event', false, { ts: now, botId: 'b1', type: 'batch.unknown', data: {} }],
  // --- Persona (lama, tanpa field baru) ---
  ['Persona', true, { id: 'petani', name: 'Petani Rajin', traits: { caution: 0.7, diligence: 0.9 }, timing: { reactionMsMean: 350, reactionMsJitter: 120 } }],
  ['Persona', false, { id: 'x', name: 'x', traits: { caution: 2 }, timing: { reactionMsMean: 1, reactionMsJitter: 1 } }],
  // --- Persona + needs/affection/xp/level (baru) ---
  ['Persona', true, { id: 'p2', name: 'Bot Penuh', traits: { curiosity: 0.5 }, timing: { reactionMsMean: 300, reactionMsJitter: 100 },
    needs: { energy: 0.8, security: 0.6, boredom: 0.2 }, affection: 0.75, xp: 1500, level: 3 }],
  ['Persona', true, { id: 'p3', name: 'Minimal', traits: {}, timing: { reactionMsMean: 200, reactionMsJitter: 50 },
    xp: 0, level: 1 }],
  ['Persona', false, { id: 'p4', name: 'Bad Level', traits: {}, timing: { reactionMsMean: 100, reactionMsJitter: 10 }, level: 0 }],
  ['Persona', false, { id: 'p5', name: 'Bad Affection', traits: {}, timing: { reactionMsMean: 100, reactionMsJitter: 10 }, affection: 1.5 }],
  ['Persona', false, { id: 'p6', name: 'Bad XP', traits: {}, timing: { reactionMsMean: 100, reactionMsJitter: 10 }, xp: -1 }],
  // --- Command (lama) ---
  ['Command', true, { id: 'c1', botId: 'b1', op: 'enqueue', payload: { skill: 'fish.cast', params: {} } }],
  // --- Command approveBatch / rejectBatch (baru) ---
  ['Command', true, { id: 'c2', botId: 'b1', op: 'approveBatch', payload: { batchId: 'batch-001' } }],
  ['Command', true, { id: 'c3', botId: 'b1', op: 'rejectBatch', payload: { batchId: 'batch-001' } }],
  ['Command', false, { id: 'c4', botId: 'b1', op: 'badOp' }],
  // --- SkillManifest ---
  ['SkillManifest', true, { name: 'mine.collect', description: 'Tambang blok', paramsSchema: { type: 'object' }, requires: ['move', 'block.dig'], interruptible: true }],
  // --- StatsSnapshot valid ---
  ['StatsSnapshot', true, { ts: now, skill: 'mine.collect', params: { block: 'oak_log' }, durationMs: 3500, ok: true, code: 'OK',
    context: { timeOfDay: 'day', weather: 'clear', playerCount: 2, threatCount: 0, hp: 20, food: 18, dimension: 'overworld' } }],
  // --- StatsSnapshot invalid: konteks hilang ---
  ['StatsSnapshot', false, { ts: now, skill: 'mine.collect', params: {}, durationMs: 100, ok: false, code: 'TIMEOUT' }],
  // --- StatsSnapshot invalid: timeOfDay tidak dikenal ---
  ['StatsSnapshot', false, { ts: now, skill: 'mine.collect', params: {}, durationMs: 100, ok: false, code: 'OK',
    context: { timeOfDay: 'noon', weather: 'clear', playerCount: 0, threatCount: 0, hp: 20, food: 20, dimension: 'overworld' } }],
  // --- StatsSnapshot invalid: playerCount negatif ---
  ['StatsSnapshot', false, { ts: now, skill: 'fish.cast', params: {}, durationMs: 200, ok: true, code: 'OK',
    context: { timeOfDay: 'night', weather: 'rain', playerCount: -1, threatCount: 0, hp: 15, food: 10, dimension: 'overworld' } }],
  // --- Batch valid ---
  ['Batch', true, { batchId: 'batch-001', category: 'gather', tasks: ['t1', 't2'], contextSnapshot: {}, seed: 'abc123', mode: 'proposed', proposedAt: now, updatedAt: now }],
  // --- Batch invalid: kategori tidak dikenal ---
  ['Batch', false, { batchId: 'batch-002', category: 'sleep', tasks: [], contextSnapshot: {}, seed: 'xyz', mode: 'proposed', proposedAt: now, updatedAt: now }],
  // --- Batch invalid: mode tidak dikenal ---
  ['Batch', false, { batchId: 'batch-003', category: 'survive', tasks: ['t1'], contextSnapshot: {}, seed: 'x', mode: 'pending', proposedAt: now, updatedAt: now }],
  // --- Batch invalid: batchId berformat salah ---
  ['Batch', false, { batchId: 'has space', category: 'craft', tasks: [], contextSnapshot: {}, seed: 's', mode: 'approved', proposedAt: now, updatedAt: now }],
  // --- BatchScore valid ---
  ['BatchScore', true, { batchId: 'batch-001', total: 82.5, components: { completion: 0.9, safety: 0.8, efficiency: 0.7, contextFit: 0.85, value: 0.6 }, computedAt: now }],
  // --- BatchScore valid dengan playerScore + agentEval ---
  ['BatchScore', true, { batchId: 'batch-001', total: 75, components: { completion: 1, safety: 1, efficiency: 0.5, contextFit: 0.6, value: 0.4 },
    playerScore: 4, agentEval: 70, computedAt: now }],
  // --- BatchScore invalid: total > 100 ---
  ['BatchScore', false, { batchId: 'batch-001', total: 105, components: { completion: 1, safety: 1, efficiency: 1, contextFit: 1, value: 1 }, computedAt: now }],
  // --- BatchScore invalid: total < 0 ---
  ['BatchScore', false, { batchId: 'batch-001', total: -5, components: { completion: 0, safety: 0, efficiency: 0, contextFit: 0, value: 0 }, computedAt: now }],
  // --- BatchScore invalid: playerScore > 5 ---
  ['BatchScore', false, { batchId: 'batch-001', total: 50, components: { completion: 0.5, safety: 0.5, efficiency: 0.5, contextFit: 0.5, value: 0.5 },
    playerScore: 6, computedAt: now }]
]
let bad = 0
for (const [n, want, doc] of cases) {
  const ok = v(n)(doc)
  if (ok !== want) { bad++; console.log('GAGAL', n, 'harusnya', want, JSON.stringify(v(n).errors)) }
}
console.log(bad ? bad + ' kasus gagal' : 'kontrak OK: ' + cases.length + ' kasus')
process.exit(bad ? 1 : 0)
