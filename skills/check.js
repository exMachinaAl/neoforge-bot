// node skills/check.js : semua manifest skill valid terhadap kontrak. Butuh: npm i -D ajv
const Ajv = require('ajv')
const ajv = new Ajv({ allErrors: true, strict: false })
ajv.addSchema(require('../contracts/contracts.schema.json'))
const v = n => ajv.getSchema('arcadia/contracts#/definitions/' + n)
const fs = require('fs'); const path = require('path')
let bad = 0; let n = 0
for (const f of fs.readdirSync(__dirname)) {
  if (!/^[a-z][a-z0-9_]*\.[a-z0-9_.]+\.js$/.test(f)) continue
  const m = require(path.join(__dirname, f)); n++
  if (!v('SkillManifest')(m.manifest)) { bad++; console.log('MANIFEST SALAH', f, JSON.stringify(v('SkillManifest').errors)) }
  if (typeof m.run !== 'function') { bad++; console.log('run() tidak ada di', f) }
  const t = { id: 'cek1', skill: m.manifest.name, params: {}, priority: 50, status: 'queued' }
  if (!v('Task')(t)) { bad++; console.log('nama skill tidak lolos pola Task:', m.manifest.name) }
}
console.log(bad ? bad + ' masalah' : 'skill OK: ' + n + ' skill sesuai kontrak')
process.exit(bad ? 1 : 0)
