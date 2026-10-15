// lifecycle/persona.js
// Simpan dan baca persona bot (traits, needs, affection, xp, level) ke JSON per bot
// di ARCADIA_DATA_DIR (env, default: './data')
// Batas perubahan trait: +-0.02/nudge, dijepit 0..1, peluruhan perlahan
// Event: persona.changed (bukan bot event, pakai EventEmitter)
'use strict'
const EventEmitter = require('events')
const fs = require('fs')
const path = require('path')

const ee = new EventEmitter()

const DEFAULT_PERSONA = {
  id: 'default',
  name: 'Arcadia Bot',
  traits: { caution: 0.5, aggression: 0.3, curiosity: 0.5, diligence: 0.7, sociability: 0.4 },
  needs: { energy: 1.0, security: 0.8, boredom: 0.0 },
  affection: 0.5,
  xp: 0,
  level: 1,
  timing: { reactionMsMean: 300, reactionMsJitter: 100 }
}

// Cache in-memory: botId -> persona object
// persona-validation-v1
const { validate } = require('../contracts/validate')
const cache = Object.create(null)
const cacheKey = botId => path.resolve(personaPath(botId))
const check = p => { const bad = validate('Persona', p); if (bad) throw new Error('persona tidak valid: ' + bad); return p }

function dataDir () {
  return process.env.ARCADIA_DATA_DIR || './data'
}

function personaPath (botId) {
  if (typeof botId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(botId)) throw new Error('botId tidak valid')
  return path.join(dataDir(), 'personas', botId + '.json')
}

/** Gabung persona lama (mungkin tidak punya needs/affection/xp/level) dengan default */
function mergeWithDefault (obj, botId) {
  const p = Object.assign({}, DEFAULT_PERSONA, obj)
  p.id = botId || obj.id || DEFAULT_PERSONA.id
  // Pastikan sub-objek ada (backward compat)
  p.traits = Object.assign({}, DEFAULT_PERSONA.traits, obj.traits || {})
  p.needs  = Object.assign({}, DEFAULT_PERSONA.needs,  obj.needs  || {})
  p.timing = Object.assign({}, DEFAULT_PERSONA.timing, obj.timing || {})
  if (typeof p.affection !== 'number') p.affection = DEFAULT_PERSONA.affection
  if (typeof p.xp       !== 'number') p.xp        = DEFAULT_PERSONA.xp
  if (typeof p.level    !== 'number') p.level      = DEFAULT_PERSONA.level
  return p
}

/**
 * Muat persona dari file. Bila tidak ada / rusak, kembalikan default dan log peringatan.
 * @param {string} botId
 * @returns {object} persona
 */
function load (botId) {
  const file = personaPath(botId)
  let persona
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw)
    persona = check(mergeWithDefault(parsed, botId))
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // File ada tapi rusak
      console.warn('[persona] PERINGATAN: gagal baca persona ' + botId + ', pakai default. Galat: ' + err.message)
    }
    persona = mergeWithDefault({}, botId)
    persona.id = botId
  }
  cache[cacheKey(botId)] = persona
  return persona
}

/**
 * Simpan persona secara atomik (tulis ke .tmp lalu rename).
 * @param {string} botId
 * @param {object} persona
 */
function save (botId, persona) {
  check(persona)
  const file = personaPath(botId)
  const tmp  = file + '.tmp'
  const dir  = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(tmp, JSON.stringify(persona, null, 2), 'utf8')
  fs.renameSync(tmp, file)
  cache[cacheKey(botId)] = persona
}

/**
 * Nudge trait: delta dijepit ke +-0.02, lalu nilai akhir dijepit 0..1.
 * Simpan + emit 'persona.changed'.
 * @param {string} botId
 * @param {string} trait  - salah satu dari: caution|aggression|curiosity|diligence|sociability
 * @param {number} delta
 * @returns {object} persona baru
 */
function nudge (botId, trait, delta) {
  if (!Object.hasOwn(DEFAULT_PERSONA.traits, trait) || !Number.isFinite(delta)) throw new Error('trait/delta tidak valid')
  const persona = get(botId) || load(botId)
  // Jepit delta +-0.02
  const clampedDelta = Math.max(-0.02, Math.min(0.02, delta))
  const oldVal = typeof persona.traits[trait] === 'number' ? persona.traits[trait] : 0.5
  const newVal = Math.max(0, Math.min(1, oldVal + clampedDelta))
  const updated = Object.assign({}, persona, {
    traits: Object.assign({}, persona.traits, { [trait]: newVal })
  })
  save(botId, updated)
  ee.emit('persona.changed', { botId, trait, oldVal, newVal, persona: updated })
  return updated
}

/**
 * Decay: naikkan boredom sedikit (boredom naik 0.01/panggilan), energy turun 0.005.
 * Nilai dijepit 0..1. Simpan.
 * @param {string} botId
 */
function decay (botId) {
  const persona = get(botId) || load(botId)
  const needs = Object.assign({}, persona.needs || DEFAULT_PERSONA.needs)
  needs.boredom = Math.min(1, (needs.boredom || 0) + 0.01)
  needs.energy  = Math.max(0, (needs.energy  ?? 1) - 0.005)
  const updated = Object.assign({}, persona, { needs })
  save(botId, updated)
}

/**
 * Baca persona dari cache secara sync.
 * Bila belum di cache, load dari disk.
 * @param {string} botId
 * @returns {object} persona
 */
function get (botId) {
  if (!cache[cacheKey(botId)]) return load(botId)
  return cache[cacheKey(botId)]
}

module.exports = { load, save, nudge, decay, get, events: ee, DEFAULT_PERSONA }
