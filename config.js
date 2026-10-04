// config.js
const fs = require('fs')
const path = require('path')
let f = {}
try { f = JSON.parse(fs.readFileSync(path.join(__dirname, 'mc.local.json'), 'utf8')) } catch {}
module.exports = {
  host: process.env.MC_HOST || f.host || 'localhost',
  port: +(process.env.MC_PORT || f.port || 25565),
  log: process.env.MC_LOG || f.log || path.join(__dirname, 'server/logs/latest.log'),
  logCmd: process.env.MC_LOG_CMD || f.logCmd || ''
}