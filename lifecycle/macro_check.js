// lifecycle/macro_check.js - Validasi contoh spesifikasi makro terhadap schema (T-1)
const Ajv = require('ajv')
const macroSchema = require('./macro.schema.json')

const ajv = new Ajv({ allErrors: true, strict: false })
const validateMacro = ajv.compile(macroSchema)

const EXAMPLES = [
  // 1. sleep_cycle
  {
    id: 'sleep_cycle',
    name: 'Siklus Tidur Malam Aman',
    version: '1.0',
    category: 'survive',
    limits: { maxDurationMs: 60000, maxSteps: 3 },
    prerequisites: { minHp: 6, safeDimension: 'overworld' },
    steps: [
      { id: 'find_safe_spot', skill: 'nav.goto', params: { range: 2 }, onFail: 'skip', timeoutMs: 15000 },
      { id: 'execute_sleep', skill: 'sleep.auto', params: {}, condition: { field: 'timeOfDay', operator: '==', value: 'night' }, onFail: 'abort', timeoutMs: 30000 }
    ]
  },
  // 2. farm_cycle
  {
    id: 'farm_cycle',
    name: 'Panen Gandum dan Simpan Peti',
    version: '1.0',
    category: 'maintain',
    limits: { maxDurationMs: 120000, maxSteps: 3 },
    prerequisites: { minHp: 10, safeDimension: 'overworld' },
    steps: [
      { id: 'harvest_wheat', skill: 'farm.harvest', params: { crops: ['wheat'], count: 12, replant: true }, onFail: 'abort', timeoutMs: 60000 },
      { id: 'deposit_produce', skill: 'inv.store', params: { chest: 'auto' }, onFail: 'skip', timeoutMs: 30000 }
    ]
  },
  // 3. patrol_route
  {
    id: 'patrol_route',
    name: 'Patroli Rute Pos Keamanan',
    version: '1.0',
    category: 'maintain',
    limits: { maxDurationMs: 180000, maxSteps: 4 },
    prerequisites: { minHp: 14, safeDimension: 'overworld' },
    steps: [
      { id: 'goto_post_a', skill: 'nav.goto', params: { x: 15, z: 20, range: 2 }, onFail: 'skip', timeoutMs: 30000 },
      { id: 'guard_post_a', skill: 'guard.post', params: { durationMs: 30000 }, onFail: 'skip', timeoutMs: 35000 },
      { id: 'goto_post_b', skill: 'nav.goto', params: { x: 0, z: 0, range: 2 }, onFail: 'skip', timeoutMs: 30000 },
      { id: 'guard_post_b', skill: 'guard.post', params: { durationMs: 30000 }, onFail: 'skip', timeoutMs: 35000 }
    ]
  },
  // 4. gather_and_deposit
  {
    id: 'gather_and_deposit',
    name: 'Tebang Kayu Olah dan Simpan',
    version: '1.0',
    category: 'gather',
    limits: { maxDurationMs: 120000, maxSteps: 3 },
    prerequisites: { minHp: 12, safeDimension: 'overworld' },
    steps: [
      { id: 'chop_wood', skill: 'mine.collect', params: { block: 'oak_log', count: 4 }, onFail: 'abort', timeoutMs: 45000 },
      { id: 'craft_planks', skill: 'craft.item', params: { item: 'oak_planks', count: 4 }, onFail: 'skip', timeoutMs: 15000 },
      { id: 'store_materials', skill: 'inv.store', params: { chest: 'auto' }, onFail: 'skip', timeoutMs: 20000 }
    ]
  },
  // 5. safe_retreat
  {
    id: 'safe_retreat',
    name: 'Mundur Darurat ke Pangkalan',
    version: '1.0',
    category: 'survive',
    limits: { maxDurationMs: 60000, maxSteps: 2 },
    prerequisites: { minHp: 1, safeDimension: 'overworld' },
    steps: [
      { id: 'run_to_base', skill: 'nav.goto', params: { x: 0, z: 0, range: 3 }, condition: { field: 'health', operator: '<', value: 10 }, onFail: 'retry', retries: 1, timeoutMs: 30000 },
      { id: 'audit_status', skill: 'inv.snapshot', params: {}, onFail: 'skip', timeoutMs: 10000 }
    ]
  }
]

const INVALID_CASES = [
  // Durasi melebihi batas 600.000 ms
  {
    desc: 'Durasi melebihi batas 600000',
    doc: { id: 'bad_dur', name: 'Bad', version: '1.0', category: 'survive', limits: { maxDurationMs: 9999999, maxSteps: 2 }, steps: [{ id: 's1', skill: 'nav.goto', params: {} }] }
  },
  // Operator kondisi tidak valid
  {
    desc: 'Operator kondisi tidak valid',
    doc: { id: 'bad_op', name: 'Bad', version: '1.0', category: 'survive', limits: { maxDurationMs: 60000, maxSteps: 2 }, steps: [{ id: 's1', skill: 'nav.goto', params: {}, condition: { field: 'hp', operator: 'EVAL_JS', value: 10 } }] }
  },
  // Steps kosong
  {
    desc: 'Steps kosong',
    doc: { id: 'empty_steps', name: 'Bad', version: '1.0', category: 'survive', limits: { maxDurationMs: 60000, maxSteps: 2 }, steps: [] }
  }
]

let pass = 0
let fail = 0

console.log('=== T-1: Validasi Contoh Makro Spesifikasi ===\n')

// Uji 5 contoh valid
EXAMPLES.forEach((ex, idx) => {
  const valid = validateMacro(ex)
  if (valid) {
    pass++
    console.log(`  ✓ Contoh ${idx + 1} (${ex.id}) valid sesuai skema`)
  } else {
    fail++
    console.error(`  ✗ Contoh ${idx + 1} (${ex.id}) GAGAL:`, JSON.stringify(validateMacro.errors))
  }
})

// Uji kasus invalid
INVALID_CASES.forEach((tc) => {
  const valid = validateMacro(tc.doc)
  if (!valid) {
    pass++
    console.log(`  ✓ Kasus invalid tertolak dengan benar: ${tc.desc}`)
  } else {
    fail++
    console.error(`  ✗ Kasus invalid lolos: ${tc.desc}`)
  }
})

console.log(`\n==================================================`)
console.log(`Hasil: ${pass}/${pass + fail} lulus, ${fail} gagal`)
if (fail > 0) process.exit(1)
console.log('STATUS: LULUS\n')
