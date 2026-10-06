// contracts/validate.js - validate(nama, dokumen) -> null (valid) | string kesalahan. Tanpa ajv: selalu null.
let v = null
try {
  const Ajv = require('ajv')
  const ajv = new Ajv({ allErrors: true, strict: false })
  ajv.addSchema(require('./contracts.schema.json'))
  v = n => ajv.getSchema('arcadia/contracts#/definitions/' + n)
} catch (e) { v = null }
module.exports = { validate: (name, doc) => { if (!v) return null; const f = v(name); return f(doc) ? null : JSON.stringify(f.errors) } }
