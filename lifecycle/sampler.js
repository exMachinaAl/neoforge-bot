// lifecycle/sampler.js - Pembuat task acak berbobot (mode kering / propose)
// Kontrak: Batch {batchId, category, tasks[], contextSnapshot, seed, mode, proposedAt}
// Prinsip: Filter Keras 100% -> Skor berbobot (Persona + Konteks) -> PRNG Berbiji
const fs = require('fs')
const path = require('path')

const CYCLEBOOK_DIR = path.join(__dirname, 'cyclebook')

// Mulberry32 PRNG deterministik berbiji 32-bit
function createPrng (seedVal) {
  let s = 0
  if (typeof seedVal === 'number') {
    s = seedVal >>> 0
  } else if (typeof seedVal === 'string') {
    for (let i = 0; i < seedVal.length; i++) {
      s = (Math.imul(31, s) + seedVal.charCodeAt(i)) >>> 0
    }
  } else {
    s = (Date.now() & 0xffffffff) >>> 0
  }
  return function () {
    s = (s + 0x6D2B79F5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Muat template dari lifecycle/cyclebook/*.json
function loadTemplates () {
  const templates = []
  if (!fs.existsSync(CYCLEBOOK_DIR)) return templates
  const files = fs.readdirSync(CYCLEBOOK_DIR).filter(f => f.endsWith('.json'))
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(CYCLEBOOK_DIR, f), 'utf8'))
      if (data && data.id && data.skill) {
        templates.push(data)
      }
    } catch (e) {
      console.warn('[sampler] Peringatan: gagal memuat template ' + f + ': ' + e.message)
    }
  }
  return templates
}

// Filter keras (wajib lolos 100%)
function filterCandidates (templates, context = {}, persona = {}, lastExecutedMap = {}, options = {}) {
  // sampler-evidence-v1: jangan menyimpulkan ada senjata dari HP.
  const hp = Number.isFinite(context.hp) ? context.hp : (Number.isFinite(context.health) ? context.health : 0)
  const dimension = String(context.dimension || 'unknown').replace(/^minecraft:/, '')
  const timeOfDay = context.timeOfDay || 'day'
  const threatCount = typeof context.threatCount === 'number' ? context.threatCount : 0
  const hasWeapon = options.hasWeapon !== undefined ? options.hasWeapon : false
  const isPaused = !!options.isPaused
  const isOnline = options.isOnline !== undefined ? options.isOnline : true
  const now = options.now || Date.now()

  const allowed = []
  const rejected = []

  if (isPaused || !isOnline) {
    return { allowed: [], rejected: templates.map(t => ({ id: t.id, reason: 'ENGINE_PAUSED_OR_OFFLINE' })) }
  }

  for (const t of templates) {
    const pre = t.prerequisites || {}

    // 1. Filter HP minimum (Wajib - tidak bisa ditawar)
    if (typeof pre.minHp === 'number' && hp < pre.minHp) {
      rejected.push({ id: t.id, reason: `HP_TOO_LOW (hp: ${hp} < min: ${pre.minHp})` })
      continue
    }

    // 2. Filter Dimensi aman
    if (pre.safeDimension && pre.safeDimension !== dimension) {
      rejected.push({ id: t.id, reason: `UNSAFE_DIMENSION (${dimension} != ${pre.safeDimension})` })
      continue
    }

    // 3. Filter Waktu (daytimeOnly vs nightOnly)
    if (pre.daytimeOnly && (timeOfDay === 'night' || timeOfDay === 'dusk')) {
      rejected.push({ id: t.id, reason: `DAYTIME_ONLY (sekarang: ${timeOfDay})` })
      continue
    }
    if (pre.nightOnly && (timeOfDay === 'day' || timeOfDay === 'dawn')) {
      rejected.push({ id: t.id, reason: `NIGHT_ONLY (sekarang: ${timeOfDay})` })
      continue
    }

    // 4. Filter Senjata saat malam atau ada ancaman
    if ((pre.requiresWeapon || ((timeOfDay === 'night' || threatCount > 0) && ['mine.collect','hunt.kill','nav.goto','farm.harvest'].includes(t.skill))) && !hasWeapon) {
      rejected.push({ id: t.id, reason: 'NO_WEAPON' })
      continue
    }

    // 5. Cooldown pendinginan
    const lastRan = lastExecutedMap[t.id] || 0
    if (lastExecutedMap[t.id] !== undefined && t.cooldownMs && (now - lastRan < t.cooldownMs)) {
      rejected.push({ id: t.id, reason: `IN_COOLDOWN (${now - lastRan}ms < ${t.cooldownMs}ms)` })
      continue
    }

    allowed.push(t)
  }

  return { allowed, rejected }
}

// Skor kandidat deterministik berbasis Persona dan Konteks
function scoreCandidate (template, context = {}, persona = {}) {
  let score = template.baseWeight || 1.0
  const traits = persona.traits || {}
  const needs = persona.needs || {}
  const category = template.category || 'maintain'
  const timeOfDay = context.timeOfDay || 'day'
  const threatCount = context.threatCount || 0
  const weather = context.weather || 'clear'

  // Pengaruh Traits
  if (category === 'explore' && typeof traits.curiosity === 'number') {
    score *= (0.5 + traits.curiosity)
  }
  if ((category === 'maintain' || category === 'gather' || category === 'craft') && typeof traits.diligence === 'number') {
    score *= (0.5 + traits.diligence)
  }
  if (category === 'survive' && template.skill === 'hunt.kill' && typeof traits.aggression === 'number') {
    score *= (0.5 + traits.aggression)
  }
  if ((category === 'social' || template.skill === 'breed.animals') && typeof traits.sociability === 'number') {
    score *= (0.5 + traits.sociability)
  }
  if (typeof traits.caution === 'number') {
    if (threatCount > 0 || (context.hp && context.hp < 12)) {
      // Makin berhati-hati, makin rendah bobot aksi agresif/eksplorasi saat bahaya
      if (category === 'explore' || template.skill === 'hunt.kill') {
        score *= Math.max(0.1, 1.0 - traits.caution)
      } else if (template.skill === 'sleep.auto' || category === 'maintain') {
        score *= (1.0 + traits.caution)
      }
    }
  }

  // Pengaruh Needs
  if (needs.energy !== undefined && needs.energy < 0.4) {
    if (template.skill === 'sleep.auto' || template.skill === 'fish.cast') score *= 2.0
  }
  if (needs.boredom !== undefined && needs.boredom > 0.6) {
    if (category === 'explore' || category === 'gather') score *= 1.5
  }
  if (needs.security !== undefined && needs.security < 0.5) {
    if (template.skill === 'guard.post' || template.skill === 'inv.store') score *= 1.8
  }

  // Pengaruh Konteks Dunia
  if (timeOfDay === 'night' && template.skill === 'sleep.auto') score *= 3.0
  if ((weather === 'rain' || weather === 'thunder') && category === 'explore') score *= 0.4

  return Math.max(0.001, score)
}

// Pengambil sampel batch
function sampleBatch (context = {}, persona = {}, options = {}) {
  const seed = options.seed !== undefined ? options.seed : (Date.now().toString(36) + Math.random().toString(36).slice(2, 6))
  const prng = createPrng(seed)
  const templates = options.templates || loadTemplates()
  const lastExecutedMap = options.lastExecutedMap || {}

  const { allowed, rejected } = filterCandidates(templates, context, persona, lastExecutedMap, options)

  if (allowed.length === 0) {
    return {
      batchId: 'batch_' + seed,
      category: 'survive',
      tasks: [],
      contextSnapshot: context,
      seed: String(seed),
      mode: 'proposed',
      proposedAt: Date.now(),
      reasons: rejected.map(r => `${r.id}: ${r.reason}`)
    }
  }

  // Hitung skor untuk semua kandidat yang lolos filter
  const scored = allowed.map(t => ({
    template: t,
    score: scoreCandidate(t, context, persona)
  }))

  // Weighted random selection via PRNG
  const totalWeight = scored.reduce((sum, item) => sum + item.score, 0)
  let pickVal = prng() * totalWeight
  let chosen = scored[0].template

  for (const item of scored) {
    pickVal -= item.score
    if (pickVal <= 0) {
      chosen = item.template
      break
    }
  }

  // Buat Task spec ringkas
  const taskId = 't_' + chosen.id + '_' + prng().toString(36).slice(2, 8)
  const task = {
    id: taskId,
    skill: chosen.skill,
    params: Object.assign({}, chosen.params),
    priority: 50,
    status: 'queued',
    source: 'persona',
    createdAt: Date.now()
  }

  return {
    batchId: 'batch_' + seed,
    category: chosen.category || 'maintain',
    tasks: [taskId],
    taskDetails: [task],
    contextSnapshot: context,
    seed: String(seed),
    mode: 'proposed',
    proposedAt: Date.now(),
    chosenTemplate: chosen.id,
    reasons: [`Dipilih: ${chosen.name} (${chosen.id}) dengan bobot sesuai persona & konteks`]
  }
}

module.exports = {
  createPrng,
  loadTemplates,
  filterCandidates,
  scoreCandidate,
  sampleBatch
}
