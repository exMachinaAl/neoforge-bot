// cards.mjs - kartu tampilan. Semua teks dinamis lewat h() (simpul teks). Bidang yang tak dikenal ditampilkan generik (kompatibel dengan penambahan API).
import { h, clear, fmtMs, short } from './dom.mjs'
import { fieldsFromSchema, collectParams } from './form.mjs'
import { normPct } from './store.mjs'

const kv = obj => Object.keys(obj || {}).map(k => h('span', { className: 'tag', style: 'margin:2px 4px 2px 0;display:inline-block' }, k + ': ' + short(obj[k], 40)))
export function renderStatus (el, bs) {
  clear(el); if (!bs) return el.append('memuat...')
  const p = bs.pos ? bs.pos.x + ', ' + bs.pos.y + ', ' + bs.pos.z : '-'
  el.append(h('div', {}, (bs.username || bs.botId) + ' · ', h('b', { className: bs.status === 'online' ? 'ok' : 'warn' }, bs.status), ' · pos ' + p + ' · HP ' + (bs.health ?? '-') + ' · lapar ' + (bs.food ?? '-') + ' · ' + (bs.dimension || '-')))
  el.append(h('div', { className: 'mut' }, 'task: ' + (bs.currentTaskId || '-') + ' · antre ' + (bs.queueLength ?? 0)))
  const known = new Set(['botId', 'username', 'status', 'pos', 'health', 'food', 'dimension', 'currentTaskId', 'queueLength', 'inventory', 'capabilities', 'ts', 'personaId', 'progress'])
  for (const k of Object.keys(bs)) if (!known.has(k) && bs[k] && typeof bs[k] === 'object') el.append(h('div', { style: 'margin-top:4px' }, h('span', { className: 'mut' }, k + ': '), kv(bs[k])))
  return el
}
export function renderProgress (el, bot) {
  clear(el); const run = bot.tasks.running; const entries = Object.values(bot.progress)
  if (!run && !entries.length) { el.append(h('span', { className: 'mut' }, 'tidak ada task berjalan')); return el }
  if (run) el.append(h('div', {}, h('b', {}, run.skill), ' ', h('span', { className: 'mut' }, short(run.params, 80))))
  for (const p of entries) { const f = normPct(p.pct); el.append(h('div', { className: 'bar' }, h('i', { style: 'width:' + (f === null ? 100 : Math.round(f * 100)) + '%' + (f === null ? ';opacity:.35' : '') })), h('div', { className: 'mut' }, (p.label || '(tanpa label)') + (f === null ? '' : ' · ' + Math.round(f * 100) + '%') + (p.data ? ' · ' + short(p.data, 80) : ''))) }
  return el
}
export function renderQueue (el, t, act) {
  clear(el); const row = (tk, tag) => h('div', { className: 'item' }, h('span', {}, h('span', { className: 'tag' }, tag), ' #' + tk.priority + ' ' + tk.skill + ' ', h('span', { className: 'mut' }, short(tk.params, 70))), h('button', { onclick: () => act.cancel(tk.id) }, 'Batal'))
  if (t.running) el.append(row(t.running, 'jalan')); t.queue.forEach(q => el.append(row(q, 'antre')))
  if (!el.children.length) el.append(h('span', { className: 'mut' }, 'kosong' + (t.paused ? ' (dijeda)' : '')))
  return el
}
export function renderHistory (el, t) {
  clear(el)
  for (const x of t.history.slice(0, 10)) {
    const r = x.result || {}; const pre = h('pre', { style: 'display:none;flex-basis:100%;margin-top:4px' }, JSON.stringify({ params: x.params, result: r }, null, 1))
    el.append(h('div', { className: 'item', style: 'cursor:pointer', onclick: () => { pre.style.display = pre.style.display === 'none' ? 'block' : 'none' } }, h('span', { className: r.ok ? 'ok' : 'bad' }, x.skill + ' ' + (r.code || x.status)), h('span', { className: 'mut' }, fmtMs(r.durationMs) + ' ' + short(r.error || r.data || '', 70)), pre))
  }
  if (!el.children.length) el.append(h('span', { className: 'mut' }, '-')); return el
}
export function renderInventory (el, bs, skills, act) {
  clear(el); const inv = bs && bs.inventory; if (!inv) { el.append(h('span', { className: 'mut' }, 'belum ada data')); return el }
  const snap = skills.some(s => s.name === 'inv.snapshot')
  el.append(h('div', { className: 'row' }, h('span', { className: 'tag ' + (inv.accurate ? 'ok' : 'warn') }, inv.accurate ? 'akurat (' + inv.source + ')' : 'belum diverifikasi (' + inv.source + ')'), h('button', { disabled: !snap, title: snap ? '' : 'skill inv.snapshot tidak ada', onclick: () => act.snapshot() }, 'Snapshot')))
  const items = inv.items.slice().sort((a, b) => b.count - a.count)
  el.append(h('div', { style: 'margin-top:6px' }, items.length ? items.map(i => h('span', { className: 'tag', style: 'margin:2px 4px 2px 0;display:inline-block' }, i.name + ' ×' + i.count)) : h('span', { className: 'mut' }, 'kosong')))
  return el
}
export function renderQuick (el, skills, act, pick) {
  clear(el); const sel = skills.filter(s => /^(guard\.|sleep\.)/.test(s.name))
  el.append(h('div', { className: 'row' }, h('button', { onclick: () => act.cmd('pause') }, 'Jeda'), h('button', { onclick: () => act.cmd('resume') }, 'Lanjut'), h('button', { onclick: () => act.cmd('clear') }, 'Kosongkan'), h('button', { onclick: () => act.cmd('stop') }, 'Stop task'), h('button', { className: 'k', onclick: () => act.kill() }, 'KILL SWITCH')))
  if (sel.length) el.append(h('div', { className: 'row', style: 'margin-top:6px' }, h('span', { className: 'mut' }, 'cepat:'), sel.map(s => h('button', { onclick: () => pick(s.name) }, s.name))))
  return el
}
export function renderLog (el, log) { el.textContent = log.slice(-60).map(e => new Date(e.ts).toLocaleTimeString() + ' ' + e.type + ' ' + e.text).join('\n'); el.scrollTop = el.scrollHeight; return el }

export function skillFormCard (store, act) {
  const sel = h('select'); const fields = h('div', { className: 'row', style: 'margin-top:6px' }); const desc = h('div', { className: 'mut', style: 'margin:6px 0' }); const pr = h('input', { type: 'number', min: 0, max: 100, value: 50, style: 'width:80px' }); const msg = h('div', { className: 'bad' })
  let cur = []; const inputs = {}
  const draw = () => { clear(fields); cur = []; const sk = store.s.skills.find(s => s.name === sel.value); if (!sk) return; desc.textContent = sk.description || ''; cur = fieldsFromSchema(sk.paramsSchema)
    cur.forEach(f => { let i; if (f.kind === 'enum') { i = h('select', {}, h('option', { value: '' }, '-'), f.enum.map(v => h('option', { value: v }, v))) } else if (f.kind === 'boolean') { i = h('select', {}, ['', 'true', 'false'].map(v => h('option', { value: v }, v || '-'))) } else i = h('input', { type: f.kind === 'integer' || f.kind === 'number' ? 'number' : 'text', step: 'any', placeholder: f.placeholder }); inputs[f.key] = i; fields.append(h('div', { className: 'f' }, h('label', {}, f.key + (f.required ? ' *' : '')), i)) }) }
  sel.onchange = draw
  const add = h('button', { className: 'p', onclick: () => { const raw = {}; cur.forEach(f => { raw[f.key] = inputs[f.key].value }); const { params, errors } = collectParams(cur, raw); msg.textContent = errors.join('; '); if (!errors.length) act.enqueue(sel.value, params, Number(pr.value) || 50).catch(e => { msg.textContent = e.message }) } }, 'Tambah ke antrean')
  const el = h('div', {}, h('div', { className: 'row' }, sel, h('span', { className: 'mut' }, 'prioritas'), pr), fields, desc, add, msg)
  const sync = () => { const prev = sel.value; clear(sel); store.s.skills.forEach(s => sel.append(h('option', { value: s.name }, s.name))); if (prev && store.s.skills.some(s => s.name === prev)) sel.value = prev; draw() }
  return { el, sync, pick: name => { sel.value = name; draw(); el.scrollIntoView && el.scrollIntoView() } }
}
export function chatCard (act) { const i = h('input', { placeholder: 'pesan atau /perintah', style: 'flex:1 1 200px' }); const go = () => { const t = i.value.trim(); if (t) { act.say(t); i.value = '' } }; return h('div', { className: 'row' }, i, h('button', { onclick: go }, 'Kirim')) }
