const fs = require('fs')
const path = require('path')
const base = require('./channels')
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')) } catch { return d } }
const ids = read('ids.json', [])
const flows = read('flows.json', {})
const versions = read('versions.json', {})
const cfg = read('config.json', {})

const flowOf = id => {
  const f = flows[id] || (id.includes('client_bound') ? 'CLIENTBOUND' : id.includes('server_bound') ? 'SERVERBOUND' : '')
  return f === 'CLIENTBOUND' || f === 'SERVERBOUND' ? f.toLowerCase() : undefined
}
const make = (id, handler) => {
  const e = { version: versions[id] || '1', optional: true }
  const f = flowOf(id)
  if (f) e.flow = f
  if (f !== 'serverbound') e.handler = handler || (() => {})
  return e
}
const play = { ...base }
for (const id of ids) if (!base[id] && (!cfg[id] || cfg[id].both)) play[id] = make(id)
const configuration = {}
for (const [id, c] of Object.entries(cfg)) {
  const ack = c && c.ack
  configuration[id] = make(id, ack
    ? (bytes, { client }) => client.write('custom_payload', { channel: ack, data: Buffer.alloc(0) })
    : null)
}
configuration['neoforge:known_registry_data_maps'] = { version: '1', flow: 'clientbound', optional: true,
  handler: (bytes, { client }) => client.write('custom_payload', { channel: 'neoforge:known_registry_data_maps_reply', data: Buffer.from([0]) }) }
configuration['neoforge:known_registry_data_maps_reply'] = { version: '1', flow: 'serverbound', optional: true }
Object.defineProperty(play, 'configurationChannels', { value: configuration, enumerable: false })
module.exports = play