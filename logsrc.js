// logsrc.js
const fs = require('fs')
const { spawnSync } = require('child_process')
const cfg = require('./config')
const run = () => {
  const r = spawnSync('sh', ['-c', cfg.logCmd], { timeout: 30000, maxBuffer: 256 * 1024 * 1024 })
  return r.status === 0 ? r.stdout : null
}
exports.exists = () => (cfg.logCmd ? run() !== null : fs.existsSync(cfg.log))
exports.size = () => {
  if (cfg.logCmd) { const b = run(); return b ? b.length : 0 }
  try { return fs.statSync(cfg.log).size } catch { return 0 }
}
exports.from = off => {
  try {
    const b = cfg.logCmd ? run() : fs.readFileSync(cfg.log)
    return b ? b.slice(off > b.length ? 0 : off).toString('utf8') : ''
  } catch { return '' }
}