const fs = require('fs')
const t = fs.readFileSync('fail2.txt', 'latin1')
const ids = require('./ids.json')
const versions = fs.existsSync('versions.json') ? JSON.parse(fs.readFileSync('versions.json')) : {}
const stat = {}
for (const s of t.split('failure.mod')) {
  if (!s.includes('version.mismatch')) continue
  const id = ids.filter(i => s.includes(i + ' ')).sort((a, b) => b.length - a.length)[0]
  if (!id) { console.log('ID tidak ketemu:', JSON.stringify(s.slice(0, 80))); continue }
  const tail = s.slice(s.indexOf(id) + id.length).split('translate')[0]
  const tokens = tail.split('with').pop().trim().split(/\s+/)
  const sent = versions[id] || '1'
  const server = tokens.find(x => x !== sent)
  if (!server) { console.log('versi server tidak terbaca:', id, tokens); continue }
  versions[id] = server
  stat[server] = (stat[server] || 0) + 1
}
fs.writeFileSync('versions.json', JSON.stringify(versions, null, 1))
console.log('versi server ditemukan:', stat)
