const fs = require('fs')
const t = fs.readFileSync('fail2.txt', 'latin1')
const ids = require('./ids.json')
const flows = {}
const cnt = {}
for (const s of t.split('failure.mod').slice(1)) {
  for (const id of ids) {
    if (!new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+with').test(s)) continue
    const f = (s.match(/(CLIENTBOUND|SERVERBOUND)/g) || []).join('+')
    if (f) { flows[id] = f; cnt[f] = (cnt[f] || 0) + 1 }
  }
}
fs.writeFileSync('flows.json', JSON.stringify(flows, null, 1))
console.log('ketemu', Object.keys(flows).length, cnt)
