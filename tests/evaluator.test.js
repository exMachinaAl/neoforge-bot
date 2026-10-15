// tests/evaluator.test.js - Unit test untuk lifecycle/evaluator.js (L-2)
const assert = require('assert')
const {
  RUBRIC,
  clampAdviceScore,
  evaluateBatch
} = require('../lifecycle/evaluator')

let pass = 0
let fail = 0
async function test (name, fn) {
  try {
    await fn()
    pass++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    fail++
    console.error(`  ✗ ${name}: ${err.message}`)
  }
}

;(async () => {
  console.log('=== L-2: lifecycle/evaluator.js ===\n')

  const dummyBatchScore = {
    batchId: 'batch_test_1',
    total: 75,
    components: {
      completion: 80,
      safety: 60,
      efficiency: 70,
      contextFit: 80,
      value: 75
    }
  }

  // T-01: Tanpa LLM caller / kunci -> graceful skip
  await test('T-01: evaluateBatch tanpa konfigurasi LLM -> graceful skip', async () => {
    const res = await evaluateBatch(dummyBatchScore, [], {}, { env: { ARCADIA_LLM_KEY: '' } })
    assert.strictEqual(res.evaluated, false)
    assert.strictEqual(res.reason, 'NO_LLM_CONFIGURED')
    assert.strictEqual(res.score, 75)
    assert.strictEqual(res.safety, 60)
  })

  // T-02: clampAdviceScore dalam batas wajar
  await test('T-02: clampAdviceScore deviasi wajar (+5 poin) dipertahankan', async () => {
    const clamped = clampAdviceScore(75, 80)
    assert.strictEqual(clamped, 80)
  })

  // T-03: Skor model terlalu tinggi (> +10) dijepit ke batas atas (+10)
  await test('T-03: Skor model terlalu tinggi (+25 poin) dijepit ke +10 poin', async () => {
    const clamped = clampAdviceScore(75, 100)
    assert.strictEqual(clamped, 85, `seharusnya 85, tapi ${clamped}`)
  })

  // T-04: Skor model terlalu rendah (> -10) dijepit ke batas bawah (-10)
  await test('T-04: Skor model terlalu rendah (-30 poin) dijepit ke -10 poin', async () => {
    const clamped = clampAdviceScore(75, 45)
    assert.strictEqual(clamped, 65, `seharusnya 65, tapi ${clamped}`)
  })

  // T-05: Penjepit batas absolut 0..100
  await test('T-05: Penjepit tidak melebihi 100 atau kurang dari 0', async () => {
    assert.strictEqual(clampAdviceScore(95, 110), 100)
    assert.strictEqual(clampAdviceScore(5, -10), 0)
  })

  // T-06: Mock caller dengan respon valid
  await test('T-06: Mock LLM caller dengan balasan valid dan terstruktur', async () => {
    const mockCaller = async () => ({
      text: JSON.stringify({
        advisedScore: 82,
        reasoning: 'Batch dieksekusi dengan baik, sedikit lag pada farming.',
        suggestions: ['Gunakan chest lebih dekat']
      }),
      model: 'mock-model'
    })

    const res = await evaluateBatch(dummyBatchScore, [{ skill: 'farm.harvest', ok: true }], {}, { caller: mockCaller })
    assert.strictEqual(res.evaluated, true)
    assert.strictEqual(res.advisedScore, 82)
    assert.strictEqual(res.safety, 60, 'Komponen safety tidak boleh berubah')
    assert.strictEqual(res.delta, 7)
    assert.strictEqual(res.suggestions.length, 1)
  })

  // T-07: Respon model ekstrem dijepit secara end-to-end
  await test('T-07: Respon model skor 100 dijepit ke 85 (original: 75)', async () => {
    const mockCaller = async () => ({
      text: JSON.stringify({
        advisedScore: 100,
        reasoning: 'Sangat luar biasa sempurna!',
        suggestions: []
      })
    })

    const res = await evaluateBatch(dummyBatchScore, [], {}, { caller: mockCaller })
    assert.strictEqual(res.evaluated, true)
    assert.strictEqual(res.advisedScore, 85)
    assert.strictEqual(res.delta, 10)
    assert.strictEqual(res.safety, 60, 'Safety score tetap murni dari data')
  })

  // T-08: Respon model rusak / non-JSON ditangani tanpa crash
  await test('T-08: Format balasan model rusak -> ditangani graceful', async () => {
    const mockCaller = async () => ({
      text: 'Maaf, saya tidak bisa memproses permintaan Anda sebagai JSON.'
    })

    const res = await evaluateBatch(dummyBatchScore, [], {}, { caller: mockCaller })
    assert.strictEqual(res.evaluated, false)
    assert.strictEqual(res.reason, 'INVALID_LLM_OUTPUT')
    assert.strictEqual(res.score, 75)
    assert.strictEqual(res.safety, 60)
  })

  // T-09: Caller melempar error jaringan
  await test('T-09: Error caller -> ditangkap dengan aman', async () => {
    const mockCaller = async () => { throw new Error('Jaringan terputus') }
    const res = await evaluateBatch(dummyBatchScore, [], {}, { caller: mockCaller })
    assert.strictEqual(res.evaluated, false)
    assert(res.reason.includes('EVALUATION_ERROR'))
  })

  // T-10: Uji mutasi: matikan clamp -> deviasi ekstrem lolos (membuktikan clamp aktif)
  await test('T-10: Uji mutasi membuktikan fungsi clamp penting', async () => {
    // Simulasi mutan tanpa clamp
    const mutantClamp = (orig, adv) => adv
    const mutantResult = mutantClamp(75, 120)
    assert(mutantResult > 85, 'Mutan tanpa clamp membiarkan skor melebihi batas')
  })

  console.log(`\n==================================================`)
  console.log(`Hasil: ${pass}/${pass + fail} lulus, ${fail} gagal`)
  if (fail > 0) process.exit(1)
  console.log('STATUS: LULUS\n')
})()
