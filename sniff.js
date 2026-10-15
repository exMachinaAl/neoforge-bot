// sniff.js - tally custom_payload (channel mod) arah masuk/keluar per state. Pakai: !channels [kata kunci...]
module.exports = function (client) {
  const tally = new Map()
  const hex = b => Buffer.isBuffer(b) ? b.slice(0, 24).toString('hex') : ''
  const add = (dir, state, p) => {
    const ch = p && (p.channel || p.identifier); if (!ch) return
    const k = dir + '|' + state + '|' + ch
    const len = p.data ? p.data.length : 0
    const e = tally.get(k) || { dir, state, ch, n: 0, bytes: 0, first: hex(p.data) }
    e.n++; e.bytes += len; tally.set(k, e)
  }
  client.on('custom_payload', p => add('IN ', client.state, p))
  const w = client.write.bind(client)
  client.write = function (name, params) { if (name === 'custom_payload') add('OUT', client.state, params); return w(name, params) }
  return function show (args) {
    const kw = (args || '').trim().split(/\s+/).filter(Boolean)
    const rows = [...tally.values()].filter(e => !kw.length || kw.some(k => e.ch.includes(k))).sort((a, b) => a.ch.localeCompare(b.ch))
    for (const e of rows) console.log('CH ' + e.dir + ' ' + String(e.state).padEnd(13) + ' ' + e.ch + ' x' + e.n + ' ' + e.bytes + 'B first=' + e.first)
    console.log('CH total ' + rows.length + ' channel' + (kw.length ? ' (filter: ' + kw.join(',') + ')' : ''))
  }
}
