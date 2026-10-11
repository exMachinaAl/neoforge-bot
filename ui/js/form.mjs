// form.mjs - form task dari paramsSchema manifest (murni, tanpa DOM).
export function fieldsFromSchema (schema) {
  const pr = (schema && schema.properties) || {}; const req = (schema && schema.required) || []
  return Object.keys(pr).map(k => {
    const d = pr[k]; const types = [].concat(d.type || []); let kind = 'string'
    if (d.enum) kind = 'enum'; else if (types.includes('object') || types.includes('array')) kind = 'json'
    else if (types.length === 1 && types[0] === 'boolean') kind = 'boolean'; else if (types.includes('integer') && !types.includes('string')) kind = 'integer'; else if (types.includes('number') && !types.includes('string')) kind = 'number'
    return { key: k, kind, types, enum: d.enum, required: req.includes(k), placeholder: d.default !== undefined ? String(d.default) : String(d.description || '') }
  })
}
export function collectParams (fields, raw) {
  const params = {}; const errors = []
  for (const f of fields) {
    const v = raw[f.key]; const s = typeof v === 'string' ? v.trim() : v
    if (s === undefined || s === '' || s === null) { if (f.required) errors.push(f.key + ' wajib diisi'); continue }
    if (f.kind === 'integer') { const n = Number(s); if (!Number.isInteger(n)) { errors.push(f.key + ' harus bilangan bulat'); continue } params[f.key] = n } else if (f.kind === 'number') { const n = Number(s); if (!Number.isFinite(n)) { errors.push(f.key + ' harus angka'); continue } params[f.key] = n } else if (f.kind === 'boolean') { if (s !== 'true' && s !== 'false' && typeof s !== 'boolean') { errors.push(f.key + ' harus true/false'); continue } params[f.key] = s === true || s === 'true' } else if (f.kind === 'enum') { if (!f.enum.includes(s)) { errors.push(f.key + ' harus salah satu: ' + f.enum.join('|')); continue } params[f.key] = s } else if (f.kind === 'json') {
      if (typeof s === 'string' && (s[0] === '{' || s[0] === '[')) { try { params[f.key] = JSON.parse(s) } catch (e) { errors.push(f.key + ': JSON tidak valid'); continue } } else if (f.types.includes('boolean') && (s === 'true' || s === 'false')) params[f.key] = s === 'true'
      else if (f.types.includes('string')) params[f.key] = s; else errors.push(f.key + ' butuh JSON ({...} atau [...])')
    } else params[f.key] = s
  }
  return { params, errors }
}
