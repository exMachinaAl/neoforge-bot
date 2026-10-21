// Profil visual per bot, dengan kalibrasi terpisah untuk setiap model lokal.
const fs = require('fs')
const path = require('path')
const STATES = ['idle', 'working', 'happy', 'tired', 'sad', 'danger']
const DEFAULTS = {
  model: null, scale: 1, rotationY: 0, offsetX: 0, offsetY: 0, animationMode: 'auto', manualAnimation: null,
  animationMap: Object.fromEntries(STATES.map(state => [state, null]))
}
const bad = (status, message) => Object.assign(Error(message), { status })
const validName = name => typeof name === 'string' && /^[^<>:"/\\|?*\x00-\x1f]{1,180}\.glb$/i.test(name)
const clone = value => JSON.parse(JSON.stringify(value))

function createProfile3d ({ dataDir = process.env.ARCADIA_DATA_DIR || path.join(__dirname, '..', 'data'), modelsDir: configuredModelsDir } = {}) {
  const modelsDir = path.resolve(configuredModelsDir || process.env.ARCADIA_MODELS_DIR || path.join(dataDir, 'models'))
  const profilesDir = path.resolve(dataDir, 'profiles')
  fs.mkdirSync(modelsDir, { recursive: true })
  fs.mkdirSync(profilesDir, { recursive: true })
  function botKey (id) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw bad(400, 'botId profil tidak valid')
    return id
  }
  const profileFile = id => path.join(profilesDir, botKey(id) + '.json')
  function resolveModel (name) {
    if (!validName(name) || path.basename(name) !== name) throw bad(404, 'model tidak ditemukan')
    const full = path.resolve(modelsDir, name)
    let real, stat
    try { real = fs.realpathSync(full); stat = fs.statSync(real) } catch (_) { throw bad(404, 'model tidak ditemukan') }
    if (!real.startsWith(fs.realpathSync(modelsDir) + path.sep) || !stat.isFile()) throw bad(404, 'model tidak ditemukan')
    if (stat.size > 100 * 1024 * 1024) throw bad(413, 'model melebihi batas 100 MB')
    return { full: real, size: stat.size, name }
  }
  function models () {
    return fs.readdirSync(modelsDir, { withFileTypes: true })
      .filter(entry => entry.isFile() && validName(entry.name))
      .map(entry => entry.name).sort((a, b) => a.localeCompare(b)).slice(0, 200)
  }
  function read (id) {
    const file = profileFile(id)
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'))
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    } catch (error) {
      if (error.code === 'ENOENT') return {}
      throw bad(500, 'Profil tersimpan tidak dapat dibaca; pulihkan JSON profil sebelum menyimpan.')
    }
  }
  function cleanConfig (value = {}) {
    const out = clone(DEFAULTS)
    out.model = typeof value.model === 'string' ? value.model : null
    if (Number.isFinite(value.scale)) out.scale = Math.min(100, Math.max(.01, value.scale))
    if (Number.isFinite(value.rotationY)) out.rotationY = Math.min(180, Math.max(-180, value.rotationY))
    if (Number.isFinite(value.offsetX)) out.offsetX = Math.min(5, Math.max(-5, value.offsetX))
    if (Number.isFinite(value.offsetY)) out.offsetY = Math.min(5, Math.max(-5, value.offsetY))
    out.animationMode = value.animationMode === 'manual' ? 'manual' : 'auto'
    out.manualAnimation = typeof value.manualAnimation === 'string' ? value.manualAnimation.slice(0, 160) : null
    for (const state of STATES) {
      const clip = value.animationMap?.[state]
      if (typeof clip === 'string') out.animationMap[state] = clip.slice(0, 160)
    }
    return out
  }
  function load (id) {
    const config = cleanConfig(read(id))
    if (!models().includes(config.model)) config.model = null
    return config
  }
  function update (id, patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw bad(400, 'profil harus object')
    const keys = Object.keys(DEFAULTS)
    if (Object.keys(patch).some(key => !keys.includes(key))) throw bad(400, 'field profil tidak dikenal')
    const stored = read(id)
    const previous = cleanConfig(stored)
    const calibrations = { ...(stored.calibrations || {}) }
    if (previous.model) calibrations[previous.model] = previous
    let next = clone(previous)
    if (Object.hasOwn(patch, 'model')) {
      if (patch.model !== null) {
        if (!models().includes(patch.model)) throw bad(400, 'model .glb tidak ditemukan')
        resolveModel(patch.model)
      }
      if (patch.model !== previous.model) next = cleanConfig(calibrations[patch.model] || {})
      next.model = patch.model
    }
    for (const [key, min, max] of [['scale', .01, 100], ['rotationY', -180, 180], ['offsetX', -5, 5], ['offsetY', -5, 5]]) {
      if (!Object.hasOwn(patch, key)) continue
      if (!Number.isFinite(patch[key]) || patch[key] < min || patch[key] > max) throw bad(400, key + ' harus ' + min + '..' + max)
      next[key] = patch[key]
    }
    if (Object.hasOwn(patch, 'animationMode')) {
      if (!['auto', 'manual'].includes(patch.animationMode)) throw bad(400, 'animationMode harus auto/manual')
      next.animationMode = patch.animationMode
    }
    if (Object.hasOwn(patch, 'manualAnimation')) {
      if (patch.manualAnimation !== null && typeof patch.manualAnimation !== 'string') throw bad(400, 'manualAnimation harus string/null')
      next.manualAnimation = patch.manualAnimation?.slice(0, 160) ?? null
    }
    if (Object.hasOwn(patch, 'animationMap')) {
      const map = patch.animationMap
      if (!map || typeof map !== 'object' || Array.isArray(map)) throw bad(400, 'animationMap harus object')
      for (const [state, clip] of Object.entries(map)) {
        if (!STATES.includes(state) || clip !== null && typeof clip !== 'string') throw bad(400, 'mapping animasi tidak valid')
        next.animationMap[state] = clip?.slice(0, 160) ?? null
      }
    }
    if (next.model) calibrations[next.model] = clone(next)
    const file = profileFile(id), tmp = file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify({ ...next, calibrations }, null, 2) + '\n')
    fs.renameSync(tmp, file)
    return next
  }
  function publicProfile (id) {
    const config = load(id)
    return {
      config, models: models(), states: [...STATES],
      modelUrl: config.model ? '/bots/' + encodeURIComponent(botKey(id)) + '/profile/model/' + encodeURIComponent(config.model) : null
    }
  }
  return { load, update, models, resolveModel, publicProfile, modelsDir }
}
module.exports = { createProfile3d, DEFAULTS, STATES }
