// tests/persona.test.js
// Test untuk lifecycle/persona.js
// Menggunakan Node.js built-in assert + fs, tanpa framework eksternal
// ARCADIA_DATA_DIR di-mock ke direktori temp
'use strict'
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

// --- Setup temp dir ---
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-test-'))
process.env.ARCADIA_DATA_DIR = tmpDir

// Require SETELAH set env supaya dataDir() sudah pakai tmpDir
const persona = require('../lifecycle/persona')

let pass = 0, fail = 0
function ok (cond, msg) {
  if (cond) { pass++; console.log('PASS ' + msg) }
  else        { fail++; console.log('FAIL ' + msg) }
}

// Bersihkan cache antar test (akses internal cache lewat load ulang)
function freshBotId () {
  return 'bot-' + Math.random().toString(36).slice(2, 8)
}

;(async () => {
  // ----------------------------------------------------------------
  // Test 1: Load persona baru -> default
  // ----------------------------------------------------------------
  {
    const botId = freshBotId()
    const p = persona.load(botId)
    ok(p.traits.caution  === 0.5,  'T1: load baru -> caution default 0.5')
    ok(p.traits.diligence === 0.7, 'T1: load baru -> diligence default 0.7')
    ok(p.affection === 0.5,        'T1: load baru -> affection default 0.5')
    ok(p.xp       === 0,           'T1: load baru -> xp default 0')
    ok(p.level    === 1,           'T1: load baru -> level default 1')
    ok(p.needs.energy === 1.0,     'T1: load baru -> energy default 1.0')
  }

  // ----------------------------------------------------------------
  // Test 2: Nudge trait dalam batas (<= 0.02 per call)
  // ----------------------------------------------------------------
  {
    const botId = freshBotId()
    persona.load(botId) // inisialisasi dengan default (caution=0.5)
    const p = persona.nudge(botId, 'caution', 0.01)
    ok(Math.abs(p.traits.caution - 0.51) < 1e-9, 'T2: nudge 0.01 -> caution=0.51')
  }

  // ----------------------------------------------------------------
  // Test 3: Nudge yang berusaha naikkan >0.02 dijepit ke 0.02
  // ----------------------------------------------------------------
  {
    const botId = freshBotId()
    persona.load(botId) // caution default = 0.5
    const p = persona.nudge(botId, 'caution', 0.05) // coba naik 0.05
    ok(Math.abs(p.traits.caution - 0.52) < 1e-9,
      'T3: nudge 0.05 dijepit ke 0.02 -> caution=0.52 (actual=' + p.traits.caution + ')')
  }

  // ----------------------------------------------------------------
  // Test 4a: Nudge dijepit 0 (tidak bisa < 0)
  // ----------------------------------------------------------------
  {
    const botId = freshBotId()
    persona.load(botId) // aggression default = 0.3
    // Turunkan jauh, satu per satu: 0.3 - 0.02 = 0.28, dst
    // Atau langsung jepit negatif: mulai dari nilai sangat kecil
    // Set manual ke 0.01 dulu supaya bisa coba < 0
    const initial = persona.load(botId)
    // Override traits langsung ke file
    const overridden = Object.assign({}, initial, {
      traits: Object.assign({}, initial.traits, { aggression: 0.01 })
    })
    persona.save(botId, overridden)
    const p = persona.nudge(botId, 'aggression', -0.02)
    ok(p.traits.aggression >= 0,
      'T4a: nudge dijepit 0 (actual=' + p.traits.aggression + ')')
  }

  // ----------------------------------------------------------------
  // Test 4b: Nudge dijepit 1 (tidak bisa > 1)
  // ----------------------------------------------------------------
  {
    const botId = freshBotId()
    persona.load(botId)
    // Set curiosity ke 0.99
    const initial = persona.load(botId)
    persona.save(botId, Object.assign({}, initial, {
      traits: Object.assign({}, initial.traits, { curiosity: 0.99 })
    }))
    const p = persona.nudge(botId, 'curiosity', 0.02)
    ok(p.traits.curiosity <= 1,
      'T4b: nudge dijepit 1 (actual=' + p.traits.curiosity + ')')
  }

  // ----------------------------------------------------------------
  // Test 5: File rusak -> default aman + log peringatan (tidak throw)
  // ----------------------------------------------------------------
  {
    const botId = freshBotId()
    const pDir = path.join(tmpDir, 'personas')
    fs.mkdirSync(pDir, { recursive: true })
    const file = path.join(pDir, botId + '.json')
    fs.writeFileSync(file, '{RUSAK JSON{{{{', 'utf8')
    let threw = false
    let p
    try {
      p = persona.load(botId)
    } catch (e) {
      threw = true
    }
    ok(!threw,            'T5: file rusak tidak throw')
    ok(p && p.traits &&
       typeof p.traits.caution === 'number',
      'T5: file rusak -> default aman (caution=' + (p && p.traits && p.traits.caution) + ')')
  }

  // ----------------------------------------------------------------
  // Test 6: Tulis atomik (file .tmp tidak tersisa setelah save)
  // ----------------------------------------------------------------
  {
    const botId = freshBotId()
    const p = persona.load(botId)
    persona.save(botId, p)
    const pDir = path.join(tmpDir, 'personas')
    const tmpFile = path.join(pDir, botId + '.json.tmp')
    ok(!fs.existsSync(tmpFile),
      'T6: file .tmp tidak tersisa setelah save atomik')
    const mainFile = path.join(pDir, botId + '.json')
    ok(fs.existsSync(mainFile),
      'T6: file utama ada setelah save')
  }

  // ----------------------------------------------------------------
  // Test 7: Event persona.changed terpicu setelah nudge
  // ----------------------------------------------------------------
  {
    const botId = freshBotId()
    persona.load(botId)
    let fired = false
    let eventData = null
    const handler = (d) => { fired = true; eventData = d }
    persona.events.once('persona.changed', handler)
    persona.nudge(botId, 'sociability', 0.01)
    ok(fired, 'T7: event persona.changed terpicu setelah nudge')
    ok(eventData && eventData.botId === botId && eventData.trait === 'sociability',
      'T7: event data valid (botId=' + (eventData && eventData.botId) + ', trait=' + (eventData && eventData.trait) + ')')
  }

  // ----------------------------------------------------------------
  // Test 8: Backward compat - persona lama (tanpa needs/affection/xp/level)
  // ----------------------------------------------------------------
  {
    const botId = freshBotId()
    const pDir = path.join(tmpDir, 'personas')
    fs.mkdirSync(pDir, { recursive: true })
    const oldPersona = {
      id: botId,
      name: 'Bot Lama',
      traits: { caution: 0.6, aggression: 0.2, curiosity: 0.4, diligence: 0.8, sociability: 0.3 },
      timing: { reactionMsMean: 300, reactionMsJitter: 100 }
      // Sengaja tanpa needs, affection, xp, level
    }
    const file = path.join(pDir, botId + '.json')
    fs.writeFileSync(file, JSON.stringify(oldPersona), 'utf8')
    const p = persona.load(botId)
    ok(p.traits.caution === 0.6,         'T8: backward compat - traits asli tetap (caution=0.6)')
    ok(typeof p.needs === 'object' &&
       typeof p.needs.energy === 'number',
      'T8: backward compat - needs diisi default (energy=' + (p.needs && p.needs.energy) + ')')
    ok(typeof p.affection === 'number',  'T8: backward compat - affection diisi default (' + p.affection + ')')
    ok(typeof p.xp        === 'number',  'T8: backward compat - xp diisi default (' + p.xp + ')')
    ok(typeof p.level     === 'number',  'T8: backward compat - level diisi default (' + p.level + ')')
  }

  // ----------------------------------------------------------------
  // Test 9: decay - boredom naik, energy turun, tidak melebihi batas
  // ----------------------------------------------------------------
  {
    const botId = freshBotId()
    persona.load(botId)
    persona.decay(botId)
    const p = persona.get(botId)
    ok(p.needs.boredom > 0 && p.needs.boredom <= 1,
      'T9: decay -> boredom naik (' + p.needs.boredom + ')')
    ok(p.needs.energy < 1 && p.needs.energy >= 0,
      'T9: decay -> energy turun (' + p.needs.energy + ')')
  }

  // ----------------------------------------------------------------
  // Test 10: get() menggunakan cache (tidak baca disk ulang)
  // ----------------------------------------------------------------
  {
    const botId = freshBotId()
    const loaded = persona.load(botId)
    // Simpan dulu ke disk agar file ada (load tidak otomatis menyimpan file baru)
    persona.save(botId, loaded)
    // Modifikasi file di disk langsung (tanpa lewat API)
    const pDir = path.join(tmpDir, 'personas')
    const file = path.join(pDir, botId + '.json')
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    raw.traits.caution = 0.99
    fs.writeFileSync(file, JSON.stringify(raw), 'utf8')
    // get() harus pakai cache, bukan baca disk ulang
    const cached = persona.get(botId)
    ok(cached.traits.caution !== 0.99,
      'T10: get() pakai cache (bukan disk; cache=' + cached.traits.caution + ', disk=0.99)')
  }

  // ----------------------------------------------------------------
  // Test 11: Nudge negatif besar dijepit ke -0.02
  // ----------------------------------------------------------------
  {
    const botId = freshBotId()
    persona.load(botId) // diligence = 0.7
    const p = persona.nudge(botId, 'diligence', -0.10) // coba turun 0.10
    ok(Math.abs(p.traits.diligence - 0.68) < 1e-9,
      'T11: nudge -0.10 dijepit -0.02 -> diligence=0.68 (actual=' + p.traits.diligence + ')')
  }

  // ----------------------------------------------------------------
  // Ringkasan
  // ----------------------------------------------------------------
  console.log('\n--- Hasil: ' + pass + ' PASS, ' + fail + ' FAIL ---')

  // Bersihkan temp dir
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (e) {}

  if (fail > 0) process.exit(1)
})()
