// Pengaturan kontrol yang aman disimpan per bot. Tidak menyimpan token/API key.
const fs = require('fs')
const path = require('path')

const DEFAULTS = Object.freeze({ viewer: true, map: true, motion: true })
const KEYS = Object.keys(DEFAULTS)

function createSettings ({ file = path.join(process.env.ARCADIA_DATA_DIR || path.join(__dirname, '..', 'data'), 'settings.json') } = {}) {
  let data = { version: 1, bots: {} }
  if (file) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (parsed && parsed.version === 1 && parsed.bots && typeof parsed.bots === 'object') data = parsed
    } catch (e) { if (e.code !== 'ENOENT' && e.name !== 'SyntaxError') throw e }
  }
  const id = value => String(value || 'bot').slice(0, 80)
  const clean = value => {
    const out = {}
    for (const key of KEYS) if (value && typeof value[key] === 'boolean') out[key] = value[key]
    return out
  }
  const get = botId => ({ ...DEFAULTS, ...clean(data.bots[id(botId)]) })
  const update = (botId, patch) => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw Object.assign(new Error('settings harus object'), { status: 400 })
    const unknown = Object.keys(patch).filter(k => !KEYS.includes(k))
    if (unknown.length) throw Object.assign(new Error('settings tidak dikenal: ' + unknown.join(', ')), { status: 400 })
    for (const key of Object.keys(patch)) if (typeof patch[key] !== 'boolean') throw Object.assign(new Error(key + ' harus boolean'), { status: 400 })
    data.bots[id(botId)] = { ...clean(data.bots[id(botId)]), ...clean(patch) }
    if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n') }
    return get(botId)
  }
  return { get, update, defaults: { ...DEFAULTS } } // settings-per-bot-v1
}

module.exports = { createSettings, DEFAULTS }
