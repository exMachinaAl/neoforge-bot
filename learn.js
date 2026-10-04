const fs = require('fs')
const ID_RE = /^[a-z0-9_.-]+:[a-z0-9/._-]+$/
const load = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }
const save = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 1))

function parseFailure (b, sentVersions = {}) {
  const found = []
  for (let i = 0; i < b.length; i++) {
    const len = b[i]
    if (len < 3 || i + 1 + len > b.length) continue
    const s = b.toString('latin1', i + 1, i + 1 + len)
    if (ID_RE.test(s) && !s.startsWith('translate') && !s.includes('neoforge.')) found.push({ id: s, at: i + 1, end: i + 1 + len })
  }
  found.sort((x, y) => x.at - y.at)
  const ids = []
  for (const c of found) {
    const last = ids[ids.length - 1]
    if (last && c.at < last.end) { if (c.end > last.end) ids[ids.length - 1] = c } else ids.push(c)
  }
  const out = { need: [], flows: {}, versions: {}, unknown: [] }
  ids.forEach((e, k) => {
    const stop = k + 1 < ids.length ? ids[k + 1].at : b.length
    const seg = b.toString('latin1', e.end, stop).replace(/[^\x20-\x7e]/g, ' ')
    const m = seg.match(/failure\.((?:missing|flow|version)\.[a-z_.]+)/)
    const reason = m ? m[1] : null
    const head = seg.split('translate')[0]
    const tokens = head.split(/\swith\s/).pop().trim().split(/\s+/)
    if (reason && reason.startsWith('missing.server.client')) out.need.push(e.id)
    else if (reason && reason.startsWith('missing.client.server')) { /* abaikan */ }
    else if (reason && reason.startsWith('flow')) {
      const f = head.match(/\b(CLIENTBOUND|SERVERBOUND)\b/)
      if (f) out.flows[e.id] = f[1]; else out.unknown.push([e.id, reason, head.trim()])
    } else if (reason && reason.startsWith('version')) {
      const sent = sentVersions[e.id] || '1'
      const v = tokens.find(x => x !== sent && /^[\w.+-]+$/.test(x))
      if (v) out.versions[e.id] = v; else out.unknown.push([e.id, reason, head.trim()])
    } else out.unknown.push([e.id, reason, head.trim()])
  })
  return out
}

function learnStep (st, p) {
  let n = 0
  const notes = []
  for (const id of p.need) {
    if (st.cfg[id]) { notes.push(`MACET: ${id} masih hilang walau sudah di fase konfigurasi`); continue }
    if (st.ids.includes(id)) {
      st.ids = st.ids.filter(x => x !== id); st.cfg[id] = {}; n++
      notes.push(`${id}: dipindah ke fase konfigurasi`)
    } else { st.ids.push(id); n++ }
  }
  for (const [id, f] of Object.entries(p.flows)) if (st.flows[id] !== f) { st.flows[id] = f; n++ }
  for (const [id, v] of Object.entries(p.versions)) if (st.versions[id] !== v) { st.versions[id] = v; n++ }
  const byNs = {}
  for (const id of Object.keys(st.cfg)) (byNs[id.split(':')[0]] ||= []).push(id)
  for (const [ns, list] of Object.entries(byNs)) {
    const acks = list.filter(i => /^ack(nowledge)?$|_ack(nowledge)?$/.test(i.split(':')[1]))
    const others = list.filter(i => !acks.includes(i))
    if (acks.length === 1 && others.length === 1 && !st.cfg[others[0]].ack) {
      st.cfg[others[0]].ack = acks[0]; n++
      notes.push(`${others[0]}: balas payload KOSONG ke ${acks[0]} (dugaan, belum terbukti)`)
    } else if (acks.length && others.length && !others.every(o => st.cfg[o].ack)) {
      notes.push(`${ns}: pasangan ack ambigu; isi manual di config.json`)
    }
  }
  return { n, notes }
}
module.exports = { parseFailure, learnStep }
if (require.main !== module) return

const mc = require('minecraft-protocol')
const { neoforgeHandshake } = require('minecraft-protocol-forge')
const fresh = () => { delete require.cache[require.resolve('./modchannels')]; return require('./modchannels') }
const attempt = () => new Promise(resolve => {
  const client = mc.createClient({ host: process.env.HOST || 'localhost', port: +(process.env.PORT || 25565), username: 'BotAlpha', auth: 'offline', version: '1.21.1' })
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

;(async () => {
  for (let round = 1; round <= 12; round++) {
    const r = await attempt()
    if (r.ok) return console.log(`CHANNELS OK (putaran ${round}). Lanjut: bash autopatch.sh`)
    if (!r.fail) return console.log('Koneksi berakhir tanpa pesan penolakan:', Object.keys(r)[0])
    fs.writeFileSync('lastfail.bin', r.fail)
    const st = { ids: load('ids.json', []), flows: load('flows.json', {}), versions: load('versions.json', {}), cfg: load('config.json', {}) }
    const p = parseFailure(r.fail, st.versions)
    const { n, notes } = learnStep(st, p)
    save('ids.json', [...new Set(st.ids)].sort()); save('flows.json', st.flows); save('versions.json', st.versions); save('config.json', st.cfg)
    console.log(`putaran ${round}: hilang ${p.need.length}, flow ${Object.keys(p.flows).length}, versi ${Object.keys(p.versions).length}, perubahan ${n}`)
    for (const s of notes) console.log('  ', s)
    for (const u of p.unknown) console.log('  TAK TERBACA:', u[0], u[1], JSON.stringify(u[2]).slice(0, 120))
    if (!n) return console.log('Tidak ada perubahan; berhenti. Kirim output ini dan: xxd lastfail.bin | head -40')
  }
  console.log('12 putaran habis tanpa CHANNELS OK; kirim output ini.')
})()