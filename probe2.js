const mc = require('minecraft-protocol')
const fs = require('fs')
const { neoforgeHandshake } = require('minecraft-protocol-forge')
const base = require('./channels')
const ids = require('./ids.json')

const VER = process.env.VER || '1'
const extra = {}
for (const id of ids) {
  if (base[id]) continue
  const e = { version: VER, optional: true, handler () {} }
  if (id.includes('client_bound')) e.flow = 'clientbound'
  else if (id.includes('server_bound')) e.flow = 'serverbound'
  extra[id] = e
}

const client = mc.createClient({
  host: 'localhost', port: 25565,
  username: 'BotAlpha', auth: 'offline', version: '1.21.1'
})
neoforgeHandshake(client, { playChannels: require('./modchannels') })

client.on('error', e => console.log('ERR:', e.code || '', e.message))
client.on('neoforgeChannels', c => {
  console.log('CHANNELS OK:', c.map(g => g.phase + ':' + g.channels.length).join(' '))
  setTimeout(() => process.exit(0), 3000)
})
client.on('neoforgeRegistry', r => {
  if (/argument/.test(r.name)) console.log(r.name, r.ids.filter(x => !x.key.startsWith('minecraft:')).map(x => x.key))
})
client.on('end', r => console.log('END:', r))
client.on('custom_payload', p => {
  if (p.channel !== 'neoforge:modded_network_setup_failed') return
  const t = Buffer.from(p.data).toString('latin1').replace(/[^\x20-\x7e]/g, ' ')
  fs.writeFileSync('fail2.txt', t)
  const keys = {}
  for (const m of t.matchAll(/failure\.([a-z_.]+)/g)) {
    const k = m[1].startsWith('mod') ? 'mod(*)' : m[1]
    keys[k] = (keys[k] || 0) + 1
  }
  console.log('ALASAN:', keys)
  setTimeout(() => process.exit(0), 300)
})
client.on('neoforgeRegistry', r => {
  if (/argument/.test(r.name)) console.log(r.name, r.ids.filter(x => !x.key.startsWith('minecraft:')).map(x => x.key))
})
