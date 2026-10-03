const fs = require('fs'), id = process.argv[2]
const a = require('./ids.json'); a.push(id)
fs.writeFileSync('ids.json', JSON.stringify([...new Set(a)].sort(), null, 1))
const f = require('./flows.json'); f[id] = 'CLIENTBOUND'
fs.writeFileSync('flows.json', JSON.stringify(f, null, 1))
