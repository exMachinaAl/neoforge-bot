// lifecycle/scorer.js - Penghitung skor offline dari data log
// Deterministik: hanya dari data log, anti reward-hacking.
// agentEval TIDAK bisa menaikkan komponen safety.

'use strict'

const path = require('path')

// Muat rubrik dari rubric.json (statis saat require)
let rubric
try {
  rubric = require(path.join(__dirname, 'rubric.json'))
} catch (_) {
  rubric = {
    version: '1.0',
    weights: { completion: 0.35, safety: 0.20, efficiency: 0.15, contextFit: 0.15, value: 0.15 },
    penalties: { death: 20, interrupted: 10, safetyLimit: 5 },
    safetyMaxScore: 40
  }
}

/**
 * Normalisasi bobot: pastikan jumlah = 1.0.
 * Bila tidak, tampilkan peringatan ke console dan normalisasi.
 * @param {object} weights
 * @returns {object} weights yang sudah dinormalisasi
 */
function normalizeWeights (weights) {
  const keys = Object.keys(weights)
  const total = keys.reduce((s, k) => s + (weights[k] || 0), 0)
  if (total === 0) return weights
  if (Math.abs(total - 1.0) > 1e-9) {
    console.warn('[scorer] PERINGATAN: bobot rubrik tidak berjumlah 1 (' + total.toFixed(4) + '), dinormalisasi.')
    const normalized = {}
    for (const k of keys) normalized[k] = (weights[k] || 0) / total
    return normalized
  }
  return weights
}

const weights = normalizeWeights(rubric.weights || {})
const penalties = rubric.penalties || {}
const PENALTY_DEATH = typeof penalties.death === 'number' ? penalties.death : 20
const PENALTY_INTERRUPTED = typeof penalties.interrupted === 'number' ? penalties.interrupted : 10

/**
 * Skor satu task entry (ringkasan cepat).
 * @param {object} entry - baris dari stats.jsonl
 * @returns {{ completion: 0|1, safetyOk: boolean }}
 */
function scoreTask (entry) {
  if (!entry || typeof entry !== 'object') return { completion: 0, safetyOk: false }
  const ok = entry.ok === true
  const code = entry.code || ''
  const safetyOk = ok && code !== 'DIED' && code !== 'INTERRUPTED'
  return { completion: ok ? 1 : 0, safetyOk }
}

/**
 * Hitung skor batch dari array entri log.
 * Hanya menggunakan data objektif dari log - anti reward-hacking.
 * agentEval TIDAK bisa menaikkan komponen safety.
 *
 * @param {Array<object>} entries
 * @returns {object} BatchScore
 */
function scoreBatch (entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      total: 0,
      n_tasks: 0,
      ok: 0,
      components: {
        completion: 0,
        safety: null,
        efficiency: null,
        contextFit: null,
        value: null
      },
      weights_used: {},
      note: 'batch kosong'
    }
  }

  // nested-results-v1: tasks.log membungkus hasil di result.
  entries = entries.map(e => e && e.result ? { ...e, ...e.result, params: e.params } : e)
  const total_tasks = entries.length
  let okCount = 0
  let deaths = 0
  let interrupted = 0
  let effSum = 0
  let effCount = 0

  for (const e of entries) {
    if (!e || typeof e !== 'object') continue
    if (e.ok === true) okCount++
    const code = e.code || ''
    if (code === 'DIED') deaths++
    if (code === 'INTERRUPTED') interrupted++

    // Efisiensi: hanya bila ada estimatedMs di params
    let estimatedMs = null
    try {
      if (e.params && typeof e.params === 'object' && typeof e.params.estimatedMs === 'number') {
        estimatedMs = e.params.estimatedMs
      } else if (e.params_digest) {
        // Coba parse params_digest (mungkin JSON ringkas)
        const parsed = JSON.parse(e.params_digest)
        if (parsed && typeof parsed.estimatedMs === 'number') estimatedMs = parsed.estimatedMs
      }
    } catch (_) {}

    if (estimatedMs !== null && estimatedMs > 0 && typeof e.durationMs === 'number' && e.durationMs > 0) {
      // Skor efisiensi: estimasi/aktual, dijepit 0..100
      // Lebih cepat = lebih baik; maksimal 100 bila durasi == estimasi
      const ratio = estimatedMs / e.durationMs
      const effScore = Math.min(100, Math.max(0, ratio * 100))
      effSum += effScore
      effCount++
    }
  }

  // Hitung komponen
  const completion = (okCount / total_tasks) * 100

  // Safety: 100 - penalti (dijepit 0..100)
  const safetyRaw = 100 - (deaths * PENALTY_DEATH) - (interrupted * PENALTY_INTERRUPTED)
  const safety = Math.min(100, Math.max(0, safetyRaw))

  // Efisiensi: null bila tidak ada estimasi
  const efficiency = effCount > 0 ? Math.min(100, Math.max(0, effSum / effCount)) : null

  // contextFit: lewati (null) bila tidak ada konteks
  const contextFit = null

  // value: lewati (null) bila tidak ada stok target
  const value = null

  // Hitung total weighted - hanya komponen yang tersedia
  const componentMap = {
    completion: { score: completion, weight: weights.completion || 0 },
    safety: { score: safety, weight: weights.safety || 0 },
    efficiency: { score: efficiency, weight: weights.efficiency || 0 },
    contextFit: { score: contextFit, weight: weights.contextFit || 0 },
    value: { score: value, weight: weights.value || 0 }
  }

  // Filter komponen yang ada (score tidak null)
  const available = Object.entries(componentMap).filter(([, v]) => v.score !== null)
  const sumWeights = available.reduce((s, [, v]) => s + v.weight, 0)

  let totalScore = 0
  const weights_used = {}
  if (sumWeights > 0) {
    for (const [name, v] of available) {
      const w = v.weight / sumWeights // normalisasi bobot yang tersedia
      weights_used[name] = +w.toFixed(4)
      totalScore += v.score * w
    }
  }

  // Jepit total 0..100
  totalScore = Math.min(100, Math.max(0, totalScore))

  return {
    total: +totalScore.toFixed(2),
    n_tasks: total_tasks,
    ok: okCount,
    deaths,
    interrupted,
    components: {
      completion: +completion.toFixed(2),
      safety: +safety.toFixed(2),
      efficiency: efficiency !== null ? +efficiency.toFixed(2) : null,
      contextFit,
      value
    },
    weights_used
  }
}

module.exports = { scoreTask, scoreBatch, normalizeWeights }
