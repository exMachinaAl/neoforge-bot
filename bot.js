const mc = require('minecraft-protocol')
const mineflayer = require('mineflayer')
const { neoforgeHandshake } = require('minecraft-protocol-forge')
const util = require('util')
const playChannels = require('./channels')

const client = mc.createClient({
  host: 'localhost',
  port: 25565,
  username: 'BotAlpha',
  auth: 'offline',
  version: '1.21.1'
})

neoforgeHandshake(client, { playChannels, respondToPing: false }) // mineflayer sudah menjawab ping

// ---- TRACE (aktif hanya dengan: TRACE=1 node bot.js) ----
if (process.env.TRACE) {
const t0 = Date.now()
const stamp = () => String(Date.now() - t0).padStart(5) + 'ms'
const origWrite = client.write.bind(client)
client.write = (name, data) => {
  const extra = name === 'custom_payload' ? ' ' + data.channel : ''
  console.log(stamp(), '>>', client.state, name + extra)
  return origWrite(name, data)
}
client.on('packet', (data, meta) => {
  if (client.state === 'play' && meta.name !== 'login') return // di fase play hanya paket pertama
  const extra = meta.name === 'custom_payload' ? ' ' + data.channel : ''
  console.log(stamp(), '<<', meta.state, meta.name + extra)
})
client.on('state', s => console.log(stamp(), 'STATE ->', s))
client.on('end', r => console.log(stamp(), 'END:', r))
client.on('close', () => console.log(stamp(), 'CLOSE'))
}
// -------------------------------------------------

client.on('neoforgeChannels', c => console.log('CHANNELS OK:', c.map(g => `${g.phase}:${g.channels.length}`).join(' ')))
client.on('custom_payload', p => {
  if (p.channel === 'neoforge:modded_network_setup_failed') console.log('SETUP FAILED:', p.data.toString('latin1'))
})


// ---- DIAGNOSA PARSE ERROR ----
const mcData = require('minecraft-data')('1.21.1')
const packetNames = mcData.protocol.play.toClient.types.packet[1][0].type[1].mappings
// NMP membuat ulang deserializer di setiap pergantian state, jadi bungkus ulang tiap kali
const wrapParser = () => {
  const parser = client.deserializer
  const origParse = parser.parsePacketBuffer.bind(parser)
  parser.parsePacketBuffer = buf => {
    try {
      return origParse(buf)
    } catch (e) {
      if (client.state === 'play') {
        const id = '0x' + buf[0].toString(16).padStart(2, '0')
        console.log('PARSE GAGAL di paket:', packetNames[id] || id, '(' + buf.length + ' byte)')
      }
      throw e
    }
  }
}
wrapParser()
client.on('state', wrapParser)
client.on('neoforgeRegistry', r => {
  if (r.name !== 'minecraft:data_component_type') return
  const modded = r.ids.filter(x => !x.key.startsWith('minecraft:')).sort((a, b) => a.value - b.value)
  console.log('DATA COMPONENT MODDED (' + modded.length + '):')
  for (const m of modded) console.log('  ', m.value, m.key)
})
// ------------------------------

const bot = mineflayer.createBot({ client })
bot.once('spawn', () => {
  console.log('handshake complete:', client.neoforgeHandshakeComplete)
  bot.chat('Halo, bot terhubung!')
})
bot.on('kicked', r => console.log('KICK:', util.inspect(r, { depth: null })))
bot.on('error', e => console.log('ERR:', e.code, e.message))