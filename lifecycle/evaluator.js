// lifecycle/evaluator.js - Evaluator batch berbasis LLM dengan rubrik terstruktur
// Kontrak & Prinsip: LLM hanya memberi SARAN, dijepit +-10 poin dari skor objektif,
// dan masukan LLM sama sekali TIDAK BISA menaikkan komponen safety (anti reward-hacking).

const { callModel, configFromEnv } = require('../orchestrator/llm')

const RUBRIC = {
  version: '1.0',
  criteria: [
    { name: 'task_completion', desc: 'Tingkat keberhasilan eksekusi task dalam batch', weight: 0.35 },
    { name: 'safety_compliance', desc: 'Kepatuhan terhadap batas aman (HP, death, interupsi)', weight: 0.20 },
    { name: 'workflow_efficiency', desc: 'Durasi eksekusi dibandingkan estimasi wajar', weight: 0.15 },
    { name: 'context_relevance', desc: 'Kesesuaian task dengan waktu dan kondisi dunia', weight: 0.15 },
    { name: 'persona_alignment', desc: 'Kesesuaian tindakan dengan traits persona bot', weight: 0.15 }
  ],
  maxAdviceDelta: 10 // Batas maksimal deviasi skor saran (+- 10 poin)
}

function clampAdviceScore (originalScore, advisedScore) {
  if (typeof advisedScore !== 'number' || isNaN(advisedScore)) return originalScore
  const minAllowed = Math.max(0, originalScore - RUBRIC.maxAdviceDelta)
  const maxAllowed = Math.min(100, originalScore + RUBRIC.maxAdviceDelta)
  return Math.min(maxAllowed, Math.max(minAllowed, advisedScore))
}

const SYSTEM_PROMPT = `Kamu adalah Evaluator Objektif untuk siklus hidup bot Arcadia Minecraft.
Tugasmu: Menilai hasil eksekusi batch task berdasarkan rubrik terstruktur.
PERATURAN MUTLAK:
1. Skor saranmu harus adil, realistis, dan berakar pada data nyata di log.
2. Format keluaran WAJIB berupa blok JSON valid saja tanpa teks pembuka/penutup:
{
  "advisedScore": <angka 0-100>,
  "reasoning": "<analisis singkat 1-2 kalimat>",
  "suggestions": ["<saran 1>", "<saran 2>"]
}`

async function evaluateBatch (batchScore, logEntries = [], persona = {}, options = {}) {
  const originalTotal = (batchScore && typeof batchScore.total === 'number') ? batchScore.total : 0
  const originalSafety = (batchScore && batchScore.components && typeof batchScore.components.safety === 'number')
    ? batchScore.components.safety
    : 100

  const cfg = options.config || configFromEnv(options.env || process.env)

  // Jika tidak ada LLM client atau kunci tidak tersedia dan bukan mock caller
  if (!options.caller && cfg.needsKey && !cfg.key) {
    return {
      evaluated: false,
      reason: 'NO_LLM_CONFIGURED',
      score: originalTotal,
      safety: originalSafety,
      rubric: RUBRIC.version
    }
  }

  const caller = options.caller || (async (sys, usr) => callModel(cfg, { system: sys, user: usr, signal: options.signal }))

  const userPrompt = JSON.stringify({
    batchScore: batchScore,
    persona: {
      name: persona.name,
      traits: persona.traits,
      needs: persona.needs
    },
    logSummary: logEntries.slice(0, 10).map(e => ({
      skill: e.skill,
      ok: e.ok,
      code: e.code,
      durationMs: e.durationMs,
      context: e.context
    }))
  })

  try {
    const res = await caller(SYSTEM_PROMPT, userPrompt)
    const text = (res && res.text) ? res.text.trim() : String(res || '').trim()

    // Ekstrak JSON dari balasan model
    let parsed = null
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch (err) {
        // parsing gagal
      }
    }

    if (!parsed || typeof parsed.advisedScore !== 'number') {
      return {
        evaluated: false,
        reason: 'INVALID_LLM_OUTPUT',
        score: originalTotal,
        safety: originalSafety,
        rawText: text.slice(0, 200)
      }
    }

    // Terapkan penjepit (clamp) +-10 poin dari skor objektif
    const clampedScore = clampAdviceScore(originalTotal, parsed.advisedScore)

    return {
      evaluated: true,
      originalScore: originalTotal,
      advisedScore: clampedScore,
      // Komponen safety SELALU murni dari skor objektif, LLM dilarang mengubahnya
      safety: originalSafety,
      reasoning: String(parsed.reasoning || '').slice(0, 300),
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(s => String(s).slice(0, 150)) : [],
      model: res.model || cfg.model,
      delta: +(clampedScore - originalTotal).toFixed(2)
    }
  } catch (err) {
    return {
      evaluated: false,
      reason: 'EVALUATION_ERROR: ' + err.message,
      score: originalTotal,
      safety: originalSafety
    }
  }
}

module.exports = {
  RUBRIC,
  clampAdviceScore,
  evaluateBatch
}
