const base = require('./channels')
const ids = require('./ids.json')
let flows = {}
let versions = {}
try { flows = require('./flows.json') } catch {}
try { versions = require('./versions.json') } catch {}
const extra = {}
for (const id of ids) {
  if (base[id]) continue
  const e = { version: versions[id] || '1', optional: true, handler () {} }
  const f = flows[id] || (id.includes('client_bound') ? 'CLIENTBOUND' : id.includes('server_bound') ? 'SERVERBOUND' : '')
  if (f === 'CLIENTBOUND' || f === 'SERVERBOUND') e.flow = f.toLowerCase()
  extra[id] = e
}
module.exports = { ...base, ...extra }