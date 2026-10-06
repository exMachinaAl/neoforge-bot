// contracts/validate.js - validate(nama, dokumen) -> null (valid) | string kesalahan. compile(schema) -> fungsi(params) -> null | pesan. Tanpa ajv: selalu null.
let ajv = null; let v = null
try {
  const Ajv = require('ajv')
  ajv = new Ajv({ allErrors: true, strict: false })
  ajv.addSchema(require('./contracts.schema.json'))
  v = n => ajv.getSchema('arcadia/contracts#/definitions/' + n)
} catch (e) { ajv = null }
const fmt = errs => errs.map(e => ((e.instancePath || '').replace(/^\//, '') || (e.params && e.params.missingProperty) || 'params') + ' ' + e.message + (e.params && e.params.missingProperty && e.instancePath ? ' (' + e.params.missingProperty + ')' : '')).join('; ')
module.exports = {
  validate: (name, doc) => { if (!ajv) return null; const f = v(name); return f(doc) ? null : JSON.stringify(f.errors) },
  compile: schema => { if (!ajv) return () => null; const f = ajv.compile(schema); return doc => (f(doc) ? null : fmt(f.errors)) }
}
