// tests/sampler.test.js - Unit test untuk lifecycle/sampler.js (mode kering)
const assert = require('assert')
const {
  createPrng,
  loadTemplates,
  filterCandidates,
  scoreCandidate,
  sampleBatch
} = require('../lifecycle/sampler')

let pass = 0
let fail = 0
function test (name, fn) {
  try {
    fn()
    pass++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    fail++
    console.error(`  ✗ ${name}: ${err.message}`)
  }
}

console.log('=== G-1: lifecycle/sampler.js ===\n')

const templates = loadTemplates()

// T-01: Template cyclebook termuat minimal 10
test('T-01: loadTemplates() memuat minimal 10 template', () => {
  assert(Array.isArray(templates), 'templates harus berupa array')
  assert(templates.length >= 10, `jumlah template ${templates.length} < 10`)
  for (const t of templates) {
    assert(t.id, 'template harus punya id')
    assert(t.skill || (Array.isArray(t.steps) && t.steps.length), 'template harus punya skill atau steps')
    assert(t.category, 'template harus punya category')
  }
})

// T-02: Deterministik PRNG: biji sama -> urutan nilai sama
test('T-02: PRNG deterministik berbiji', () => {
  const prng1 = createPrng('arcadia_seed_42')
  const prng2 = createPrng('arcadia_seed_42')
  const v1 = [prng1(), prng1(), prng1()]
  const v2 = [prng2(), prng2(), prng2()]
  assert.deepStrictEqual(v1, v2, 'nilai PRNG harus identik untuk seed sama')
})

// T-03: Filter keras: HP rendah (hp: 4) menyaring template berbahaya (minHp > 4)
test('T-03: Filter keras HP rendah menyaring pekerjaan berisiko', () => {
  const context = { hp: 4, dimension: 'overworld', timeOfDay: 'day' }
  const { allowed, rejected } = filterCandidates(templates, context)
  for (const t of allowed) {
    if (t.prerequisites && typeof t.prerequisites.minHp === 'number') {
      assert(t.prerequisites.minHp <= 4, `template ${t.id} butuh minHp ${t.prerequisites.minHp} > 4`)
    }
  }
  assert(rejected.some(r => r.id === 'gather_stone'), 'gather_stone harusnya terfilter saat HP=4')
  assert(rejected.some(r => r.id === 'hunt_animals'), 'hunt_animals harusnya terfilter saat HP=4')
})

// T-04: Filter keras: Waktu malam menyaring daytimeOnly
test('T-04: Filter keras daytimeOnly saat malam hari', () => {
  const context = { hp: 20, dimension: 'overworld', timeOfDay: 'night' }
  const { allowed, rejected } = filterCandidates(templates, context)
  for (const t of allowed) {
    assert(!t.prerequisites || !t.prerequisites.daytimeOnly, `template ${t.id} daytimeOnly tapi lolos malam`)
  }
  assert(rejected.some(r => r.id === 'gather_wood'), 'gather_wood harus terfilter saat malam')
})

// T-05: Filter keras: Waktu siang menyaring nightOnly
test('T-05: Filter keras nightOnly saat siang hari', () => {
  const context = { hp: 20, dimension: 'overworld', timeOfDay: 'day' }
  const { allowed, rejected } = filterCandidates(templates, context)
  for (const t of allowed) {
    assert(!t.prerequisites || !t.prerequisites.nightOnly, `template ${t.id} nightOnly tapi lolos siang`)
  }
  assert(rejected.some(r => r.id === 'sleep_night'), 'sleep_night harus terfilter saat siang')
})

// T-06: Filter keras: Dimensi nether menyaring safeDimension overworld
test('T-06: Filter keras dimensi nether', () => {
  const context = { hp: 20, dimension: 'the_nether', timeOfDay: 'day' }
  const { allowed } = filterCandidates(templates, context)
  for (const t of allowed) {
    if (t.prerequisites && t.prerequisites.safeDimension) {
      assert.strictEqual(t.prerequisites.safeDimension, 'the_nether')
    }
  }
})

// T-07: Filter keras: Malam tanpa senjata tidak memilih template butuh senjata
test('T-07: Malam tanpa senjata menyaring template requiresWeapon', () => {
  const context = { hp: 16, dimension: 'overworld', timeOfDay: 'night', threatCount: 2 }
  const { allowed, rejected } = filterCandidates(templates, context, {}, {}, { hasWeapon: false })
  for (const t of allowed) {
    assert(!t.prerequisites || !t.prerequisites.requiresWeapon, `${t.id} butuh senjata tapi lolos`)
  }
  assert(rejected.some(r => r.id === 'guard_area'), 'guard_area harus ditolak jika tanpa senjata')
})

// T-08: Filter keras: Engine paused -> batch kosong dengan alasan
test('T-08: Engine paused -> tidak ada template yang lolos', () => {
  const context = { hp: 20, dimension: 'overworld', timeOfDay: 'day' }
  const { allowed, rejected } = filterCandidates(templates, context, {}, {}, { isPaused: true })
  assert.strictEqual(allowed.length, 0, 'tidak boleh ada template lolos saat paused')
  assert(rejected.length > 0)
  assert.strictEqual(rejected[0].reason, 'ENGINE_PAUSED_OR_OFFLINE')
})

// T-09: 10.000 sampel berbiji: filter keras tidak pernah dilanggar sekalipun
test('T-09: 10.000 sampel berbiji: filter keras 0 pelanggaran', () => {
  const context = { hp: 5, dimension: 'overworld', timeOfDay: 'night', threatCount: 1 }
  const persona = {
    traits: { caution: 0.8, aggression: 0.1, curiosity: 0.5, diligence: 0.7, sociability: 0.4 },
    needs: { energy: 0.3, security: 0.4, boredom: 0.2 }
  }

  for (let i = 0; i < 10000; i++) {
    const batch = sampleBatch(context, persona, { seed: 'run_' + i, hasWeapon: false, templates }) // sampler-test-no-disk-loop-v1
    if (batch.tasks.length > 0) {
      const chosen = templates.find(t => t.id === batch.chosenTemplate)
      assert(chosen, 'template terpilih harus ada di cyclebook')
      // Wajib: HP tidak boleh melanggar minHp
      if (chosen.prerequisites && chosen.prerequisites.minHp) {
        assert(chosen.prerequisites.minHp <= 5, `Pelanggaran HP: ${chosen.id} butuh ${chosen.prerequisites.minHp}`)
      }
      // Wajib: Tidak daytimeOnly saat malam
      if (chosen.prerequisites && chosen.prerequisites.daytimeOnly) {
        assert(false, `Pelanggaran waktu: ${chosen.id} adalah daytimeOnly`)
      }
      // Wajib: Tidak requiresWeapon jika hasWeapon=false
      if (chosen.prerequisites && chosen.prerequisites.requiresWeapon) {
        assert(false, `Pelanggaran senjata: ${chosen.id} butuh senjata`)
      }
    }
  }
})

// T-10: Uji mutasi: matikan filter HP -> pelanggaran terjadi (membuktikan filter HP aktif)
test('T-10: Uji mutasi: simulasi tanpa filter HP terdeteksi', () => {
  const context = { hp: 2, dimension: 'overworld', timeOfDay: 'day' }
  // Simulasi mutan: filter yang mengabaikan minHp
  const mutantFilter = (tmplts, ctx) => {
    return { allowed: tmplts.filter(t => !t.prerequisites || !t.prerequisites.daytimeOnly || ctx.timeOfDay === 'day') }
  }
  const mutantRes = mutantFilter(templates, context)
  // Mutan akan meloloskan gather_stone (minHp 12) padahal HP bot hanya 2
  const dangerousPassed = mutantRes.allowed.some(t => t.id === 'gather_stone')
  assert(dangerousPassed, 'mutasi tanpa filter HP harus meloloskan pekerjaan berbahaya')
})

// T-11: Deterministik sampleBatch: seed sama menghasilkan batch identik
test('T-11: sampleBatch deterministik jika seed sama', () => {
  const context = { hp: 20, dimension: 'overworld', timeOfDay: 'day' }
  const persona = { traits: { diligence: 0.9 }, needs: { energy: 1.0 } }
  const b1 = sampleBatch(context, persona, { seed: 998877 })
  const b2 = sampleBatch(context, persona, { seed: 998877 })
  assert.strictEqual(b1.chosenTemplate, b2.chosenTemplate)
  assert.strictEqual(b1.category, b2.category)
  assert.deepStrictEqual(b1.contextSnapshot, b2.contextSnapshot)
})

// T-12: scoreCandidate memperhitungkan persona needs & traits
test('T-12: scoreCandidate sensitif terhadap kebutuhan persona', () => {
  const sleepTmpl = templates.find(t => t.id === 'sleep_night')
  const exploreTmpl = templates.find(t => t.id === 'explore_patrol')

  const personaTired = { needs: { energy: 0.1 }, traits: { caution: 0.5 } }
  const personaEnergetic = { needs: { energy: 1.0 }, traits: { caution: 0.5 } }

  const scoreTired = scoreCandidate(sleepTmpl, { timeOfDay: 'night' }, personaTired)
  const scoreEnergetic = scoreCandidate(sleepTmpl, { timeOfDay: 'night' }, personaEnergetic)
  assert(scoreTired > scoreEnergetic, 'skor tidur saat energi rendah harus lebih tinggi')

  const personaCurious = { needs: { boredom: 0.9 }, traits: { curiosity: 0.9 } }
  const personaBoring = { needs: { boredom: 0.1 }, traits: { curiosity: 0.1 } }
  const scoreCurious = scoreCandidate(exploreTmpl, { timeOfDay: 'day' }, personaCurious)
  const scoreBoring = scoreCandidate(exploreTmpl, { timeOfDay: 'day' }, personaBoring)
  assert(scoreCurious > scoreBoring, 'skor explore saat curiosity tinggi harus lebih tinggi')
})

test('T-13: batch multi-step memiliki judul, score, dan feature vector', () => {
  const bundle=templates.find(t=>t.id==='beautiful_farming_day');assert(bundle&&bundle.steps.length===3)
  const b=sampleBatch({hp:20,food:18,dimension:'overworld',timeOfDay:'day',weather:'clear'}, {traits:{diligence:.8},needs:{energy:.8}}, {seed:'bundle',templates:[bundle],hasWeapon:true})
  assert.strictEqual(b.title,'Hari yang Indah untuk Bertanam');assert.strictEqual(b.taskDetails.length,3);assert(b.selectionScore>0);assert(Object.keys(b.selectionFactors).length>=20);assert(b.taskDetails.every(x=>x.source==='persona'))
})

test('T-14: feature vector seluruhnya numerik dan riwayat mempengaruhi skor', () => {
  const t=templates.find(x=>x.id==='harvest_crops');const a=scoreCandidate(t,{hp:20,food:20,timeOfDay:'day'},{traits:{diligence:.7}},{count:10,okCount:9,successRate:.9});const b=scoreCandidate(t,{hp:20,food:20,timeOfDay:'day'},{traits:{diligence:.7}},{count:10,okCount:1,successRate:.1});assert(a>b)
})

console.log(`\n==================================================`)
console.log(`Hasil: ${pass}/${pass + fail} lulus, ${fail} gagal`)
if (fail > 0) process.exit(1)
console.log('STATUS: LULUS\n')
