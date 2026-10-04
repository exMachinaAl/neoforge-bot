// adapt.js
const fs = require('fs')
const { spawnSync } = require('child_process')
const { parseFailure, learnStep } = require('./learn')

const { host: HOST, port: PORT, log: LOG } = require('./config')
const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }
const wr = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 1))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const PAYLOAD_RE = /Payload ([a-z0-9_.-]+:[a-z0-9/._-]+) may not be sent to the client/
const ARG_RE = /Unsupported Forge command argument type: (\S+)/

if (process.argv.includes('--check')) {
  const mc = require('minecraft-protocol')
  const { neoforgeHandshake } = require('minecraft-protocol-forge')
  const m = require('./modchannels')
  const client = mc.createClient({ host: HOST, port: PORT, username: 'BotAlpha', auth: 'offline', version: '1.21.1' })
  let done = false
  let kick = ''
  const end = (kind, detail = '') => {
    if (done) return
    done = true
    console.log('RESULT:', kind, String(detail || kick).replace(/\s+/g, ' ').slice(0, 300))
    try { client.end() } catch {}
    setTimeout(() => process.exit(0), 300)
  }
  neoforgeHandshake(client, { playChannels: m, configurationChannels: m.configurationChannels })
  client.on('error', e => e.code === 'NEOFORGE_CHANNEL_MISMATCH' ? end('SETUP_FAILED') : end('ERR', (e.code ? e.code + ' ' : '') + e.message))
  client.on('custom_payload', p => { if (p.channel === 'neoforge:modded_network_setup_failed') end('SETUP_FAILED') })
  const onKick = p => { kick = JSON.stringify(p.reason || p) }
  client.on('disconnect', onKick)
  client.on('kick_disconnect', onKick)
  client.on('state', s => { if (s === 'play') setTimeout(() => end('OK_PLAY'), 3000) })
  client.on('end', r => setTimeout(() => end('END', r + ' ' + kick), 200))
  setTimeout(() => end('TIMEOUT'), 25000)
  return
}

const fresh = () => { delete require.cache[require.resolve('./modchannels')]; return require('./modchannels') }
function attempt () {
  const mc = require('minecraft-protocol')
  const { neoforgeHandshake } = require('minecraft-protocol-forge')
  return new Promise(resolve => {
    const client = mc.createClient({ host: HOST, port: PORT, username: 'BotAlpha', auth: 'offline', version: '1.21.1' })
    let done = false
    const finish = r => { if (done) return; done = true; try { client.end() } catch {} ; setTimeout(() => resolve(r), 800) }
    const m = fresh()
    neoforgeHandshake(client, { playChannels: m, configurationChannels: m.configurationChannels })
    client.on('error', () => {})
    client.on('neoforgeChannels', () => finish({ ok: true }))
    client.on('custom_payload', p => { if (p.channel === 'neoforge:modded_network_setup_failed') finish({ fail: Buffer.from(p.data) }) })
    client.on('end', () => finish({ end: true }))
    setTimeout(() => finish({ timeout: true }), 20000)
  })
}
async function learnChannels () {
  for (let round = 1; round <= 12; round++) {
    const r = await attempt()
    if (r.ok) { console.log(`   channel OK (putaran ${round})`); return true }
    if (!r.fail) { console.log('   koneksi berakhir tanpa pesan penolakan:', Object.keys(r)[0]); return false }
    fs.writeFileSync('lastfail.bin', r.fail)
    const st = { ids: rd('ids.json', []), flows: rd('flows.json', {}), versions: rd('versions.json', {}), cfg: rd('config.json', {}) }
    const p = parseFailure(r.fail, st.versions)
    const { n, notes } = learnStep(st, p)
    wr('ids.json', [...new Set(st.ids)].sort()); wr('flows.json', st.flows); wr('versions.json', st.versions); wr('config.json', st.cfg)
    console.log(`   putaran ${round}: hilang ${p.need.length}, flow ${Object.keys(p.flows).length}, versi ${Object.keys(p.versions).length}, perubahan ${n}`)
    for (const s of notes) console.log('     ', s)
    for (const u of p.unknown) console.log('      TAK TERBACA:', u[0], u[1], JSON.stringify(u[2]).slice(0, 120))
    if (!n) { console.log('   tidak ada perubahan; berhenti. Kirim output ini dan: xxd lastfail.bin | head -40'); return false }
  }
  return false
}

const real = {
  patchAll: () => { const r = spawnSync(process.execPath, ['patch-all.js'], { encoding: 'utf8' }); return r.stdout || '' },
  patchNmpf: () => { const r = spawnSync(process.execPath, ['patch-nmpf.js'], { encoding: 'utf8' }); return (r.stdout || r.stderr || '').trim() },
  patchChecks: () => { spawnSync(process.execPath, ['patch-checks.js'], { stdio: 'inherit' }) },
  check: () => {
    const r = spawnSync(process.execPath, [__filename, '--check'], { encoding: 'utf8', timeout: 60000 })
    const line = (r.stdout || '').split('\n').reverse().find(l => l.startsWith('RESULT:'))
    return (line || 'RESULT: TIDAK_ADA ' + String(r.stderr || '').slice(0, 200)).trim()
  },
  learn: learnChannels,
  logSize: () => require('./logsrc').size(),
  logFrom: off => require('./logsrc').from(off),
  logExists: () => require('./logsrc').exists(),
  sleep,
  say: console.log
}

async function adapt (o = real) {
  o.say('== patch ==')
  const pa = o.patchAll()
  o.say(pa.trim())
  if (/GAGAL/.test(pa)) return 'patch-gagal'
  if (!o.logExists()) o.say(`(log server tidak ada di ${LOG}; error "Payload ... may not be sent" tidak terdeteksi. Set MC_LOG atau MC_LOG_CMD)`)
  const seen = new Set()
  let repatch = 0
  for (let i = 1; i <= 40; i++) {
    const mark = o.logSize()
    const line = o.check()
    await o.sleep(1500)
    const delta = o.logFrom(mark)
    o.say(`[${i}] ${line}`)
    const pm = delta.match(PAYLOAD_RE)
    if (pm) {
      const id = pm[1]
      if (seen.has(id)) { o.say(`MACET: ${id} tetap ditolak server walau sudah didaftarkan. Kirim log server di sekitarnya.`); return 'macet-payload' }
      seen.add(id)
      const ids = rd('ids.json', []); const flows = rd('flows.json', {})
      if (!ids.includes(id)) ids.push(id)
      flows[id] = 'CLIENTBOUND'
      wr('ids.json', [...new Set(ids)].sort()); wr('flows.json', flows)
      o.say(`   + payload opsional ${id} (clientbound)`)
      continue
    }
    if (line.includes('SETUP_FAILED')) {
      if (!(await o.learn())) { o.say('Belajar channel belum berhasil; lihat pesan di atas.'); return 'learn-gagal' }
      continue
    }
    const am = line.match(ARG_RE)
    if (am) {
      const t = rd('argtypes.json', [])
      if (t.includes(am[1])) { o.say(`MACET: tipe ${am[1]} sudah terdaftar tapi masih ditolak (mungkin punya properti).`); return 'macet-arg' }
      t.push(am[1]); wr('argtypes.json', t)
      o.say(`   + tipe argumen ${am[1]} -> ${o.patchNmpf()}`)
      continue
    }
    if (/enum extensions|feature flags/.test(line) && repatch++ < 1) { o.patchChecks(); continue }
    if (line.includes('OK_PLAY')) { o.say('SELESAI: bot mencapai fase play tanpa penolakan. Jalankan: npm start'); return 'ok' }
    o.say('Berhenti: hasil tak dikenal. Kirim baris di atas (dan log server).')
    return 'tak-dikenal'
  }
  o.say('40 putaran habis; kirim output ini.')
  return 'habis'
}
module.exports = { adapt, PAYLOAD_RE, ARG_RE }
if (require.main === module) adapt()