// node contracts/check.js : validasi skema + contoh. Butuh: npm i -D ajv
let Ajv
try { Ajv = require('ajv') } catch { console.log('ajv belum ada: jalankan  npm i -D ajv'); process.exit(1) }
const ajv = new Ajv({ allErrors: true, strict: false })
ajv.addSchema(require('./contracts.schema.json'))
const v = n => ajv.getSchema('arcadia/contracts#/definitions/' + n)
const now = Date.now()
const cases = [
  ['Task', true, { id: 't1', skill: 'mine.collect', params: { block: 'oak_log', count: 16 }, priority: 50, status: 'queued', source: 'cli' }],
  ['Task', false, { id: 't 1', skill: 'Mine', params: {}, priority: 500, status: 'queued' }],
  ['SkillResult', true, { taskId: 't1', skill: 'mine.collect', ok: false, code: 'PROTOCOL_UNSUPPORTED', error: 'inventory tidak terbaca' }],
  ['SkillResult', false, { taskId: 't1', skill: 'x', ok: true, code: 'BAGUS' }],
  ['BotState', true, { botId: 'b1', username: 'BotAlpha', status: 'online', capabilities: ['move', 'block.dig', 'inventory.protocol'], ts: now,
    inventory: { items: [{ name: 'dirt', count: 3, slot: 36 }], source: 'protocol', accurate: false }, currentTaskId: null, queueLength: 0 }],
  ['BotState', false, { botId: 'b1', username: 'BotAlpha', status: 'online', ts: now }],
  ['Event', true, { ts: now, botId: 'b1', type: 'task.failed', data: { taskId: 't1', code: 'TIMEOUT' } }],
  ['Persona', true, { id: 'petani', name: 'Petani Rajin', traits: { caution: 0.7, diligence: 0.9 }, timing: { reactionMsMean: 350, reactionMsJitter: 120 } }],
  ['Persona', false, { id: 'x', name: 'x', traits: { caution: 2 }, timing: { reactionMsMean: 1, reactionMsJitter: 1 } }],
  ['Command', true, { id: 'c1', botId: 'b1', op: 'enqueue', payload: { skill: 'fish.cast', params: {} } }],
  ['SkillManifest', true, { name: 'mine.collect', description: 'Tambang blok', paramsSchema: { type: 'object' }, requires: ['move', 'block.dig'], interruptible: true }]
]
let bad = 0
for (const [n, want, doc] of cases) {
  const ok = v(n)(doc)
  if (ok !== want) { bad++; console.log('GAGAL', n, 'harusnya', want, JSON.stringify(v(n).errors)) }
}
console.log(bad ? bad + ' kasus gagal' : 'kontrak OK: ' + cases.length + ' kasus')
process.exit(bad ? 1 : 0)
