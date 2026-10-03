const mc = require('minecraft-protocol')
const fs = require('fs')
const { neoforgeHandshake } = require('minecraft-protocol-forge')
const playChannels = require('./channels')

const client = mc.createClient({
  host: 'localhost', port: 25565,
  username: 'BotAlpha', auth: 'offline', version: '1.21.1'
})

neoforgeHandshake(client, {
  playChannels: {
    ...playChannels,
    'epicfight:client_bound_set_target': {
      version: 'x', flow: 'clientbound', optional: true, handler () {}
    }
  }
})

client.on('error', () => {})
client.on('custom_payload', p => {
  if (p.channel !== 'neoforge:modded_network_setup_failed') return
  const b = Buffer.from(p.data)
  const ids = new Set()
  for (let i = 0; i < b.length; i++) {
    const len = b[i]
    if (len < 3 || i + 1 + len > b.length) continue
    const s = b.toString('latin1', i + 1, i + 1 + len)
    if (/^[a-z0-9_.-]+:[a-z0-9/._-]+$/.test(s) && !s.startsWith('translate') && !s.includes('neoforge.')) ids.add(s)
  }
  fs.writeFileSync('ids.json', JSON.stringify([...ids].sort(), null, 1))
  const txt = b.toString('latin1').replace(/[^\x20-\x7e]/g, ' ').replace(/translate/g, '\ntranslate')
  fs.writeFileSync('fail.txt', txt)
  const ns = {}
  for (const id of ids) { const n = id.split(':')[0]; ns[n] = (ns[n] || 0) + 1 }
  console.log('TOTAL', ids.size, ns)
  setTimeout(() => process.exit(0), 300)
})