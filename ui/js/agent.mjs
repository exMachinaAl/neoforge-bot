import { h, clear } from './dom.mjs'
const MODES = ['observe', 'semi', 'full']
const LABELS = ['Observasi', 'Semi', 'Penuh']
const STATUS = { thinking: 'Menentukan langkah', running: 'Bertindak', waiting: 'Menunggu anggaran LLM',
  awaiting_approval: 'Menunggu izin', needs_input: 'Memerlukan jawaban', paused: 'Dijeda', blocked: 'Terhenti',
  finished: 'Tujuan tercapai', cancelled: 'Dibatalkan' }
export function agentCard (api, getId, refresh) {
  const slider = h('input', { type: 'range', min: 0, max: 2, step: 1, value: 1, 'aria-label': 'Izin agent' })
  const mode = h('b', {}, 'Semi'), description = h('p', { className: 'mut' })
  const warning = h('p', { className: 'bad', role: 'status' }), host = h('div')
  const feedback = h('textarea', { rows: 2, maxlength: 2000, 'aria-label': 'Jawaban untuk agent', placeholder: 'Jawaban atau koreksi untuk agent…' })
  const reply = h('button', {}, 'Kirim jawaban & lanjutkan')
  const answer = h('div', {}, feedback, reply)
  answer.style.display = 'none'
  let data, owner, version = 0, signature = '', goalId = null, sending = false
  const base = id => '/bots/' + encodeURIComponent(id) + '/agent'
  function modeText (index) {
    mode.textContent = LABELS[index]
    description.textContent = [
      'Menyusun usulan tanpa menjalankan tindakan.',
      'Meminta izin cakupan baru; izin berlaku selama tujuan ini.',
      'Memutuskan, bertindak, dan memulihkan kegagalan otomatis dalam batas tujuan.'
    ][index]
  }
  slider.oninput = () => modeText(Number(slider.value))
  async function request (suffix, body = {}) {
    const id = getId()
    const result = await api.call(base(id) + suffix, { method: 'POST', body })
    if (id === getId()) { await load(); await refresh?.() }
    return result
  }
  slider.onchange = async () => {
    if (sending) return
    sending = true; slider.disabled = true
    try { await request('/permissions', { mode: MODES[Number(slider.value)] }) }
    catch (e) { warning.textContent = e.message; if (data) { slider.value = MODES.indexOf(data.mode); modeText(Number(slider.value)) } }
    finally { sending = false; slider.disabled = false }
  }
  function action (label, suffix, body) {
    return h('button', { onclick: async e => {
      e.currentTarget.disabled = true
      try { await request('/goals/' + goalId + suffix, body) } catch (error) { warning.textContent = error.message; e.target.disabled = false }
    } }, label)
  }
  reply.onclick = async () => {
    const text = feedback.value.trim(), id = getId(), target = goalId
    if (!text || !target) return
    reply.disabled = true
    try {
      await request('/goals/' + target + '/reply', { message: text })
      if (id === getId() && feedback.value.trim() === text) feedback.value = ''
    } catch (error) { if (id === getId()) warning.textContent = error.message }
    finally { reply.disabled = false }
  }
  function render () {
    const g = data.goals[0]
    goalId = g?.id || null
    warning.textContent = data.storageError || data.sandbox?.warning || ''
    if (document.activeElement !== slider) { slider.value = MODES.indexOf(data.mode); modeText(Number(slider.value)) }
    answer.style.display = g && ['needs_input', 'paused', 'blocked'].includes(g.status) ? '' : 'none'
    const sig = JSON.stringify([g, data.tools, data.mode])
    if (sig === signature) return
    signature = sig; clear(host)
    if (!g) { host.append(h('p', { className: 'mut' }, 'Tujuan baru akan dijalankan oleh agent.')); return }
    host.append(h('h3', {}, g.title), h('span', { className: 'tag' }, STATUS[g.status] || g.status),
      h('p', {}, g.reason || ''), h('small', { className: 'mut' }, `${g.decisions}/${g.maxDecisions} keputusan · ${g.steps.length} langkah · token ${g.usage.in + g.usage.out}`))
    const buttons = h('div', { className: 'row' })
    if (g.status === 'awaiting_approval') {
      const pending = h('details', {}, h('summary', {}, 'Periksa tindakan dan izin: ' + (g.requestedScopes || []).join(', ')),
        h('pre', { style: 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto' }, JSON.stringify(g.pending, null, 2)))
      host.append(pending)
      if (data.mode !== 'observe') buttons.append(action('Izinkan cakupan untuk tujuan ini', '/approve'))
    }
    if (['paused', 'blocked'].includes(g.status)) buttons.append(action('Lanjutkan agent', '/resume'))
    if (!['finished', 'cancelled'].includes(g.status)) buttons.append(action('Hentikan agent', '/stop'), action('Batalkan tujuan', '/cancel'))
    host.append(buttons)
    const history = h('ol', { className: 'mission-steps' })
    for (const step of g.steps.slice(-12)) history.append(h('li', { className: 'mission-step state-' + step.status },
      h('b', {}, step.decision.skill || step.decision.name || step.decision.kind),
      h('span', { className: 'tag' }, step.status), h('p', {}, step.decision.reason || ''),
      step.result?.error ? h('p', { className: 'bad' }, step.result.error) : null))
    host.append(history)
    if (data.tools.length) host.append(h('details', {}, h('summary', {}, 'Metode tersimpan (' + data.tools.length + ')'),
      ...data.tools.map(t => h('p', {}, t.name + ' · ' + t.description))))
  }
  async function load () {
    const id = getId(), seq = ++version
    if (!id) return
    if (owner !== id) { owner = id; data = null; goalId = null; signature = ''; feedback.value = ''; clear(host); answer.style.display = 'none' }
    try {
      const value = await api.call(base(id))
      if (seq !== version || id !== getId()) return
      data = value; render()
    } catch (error) { if (seq === version && id === getId()) warning.textContent = error.message }
  }
  modeText(1)
  return { load, submit: goal => request('/goals', { goal }), get hasGoal () { return !!data?.goals.length },
    el: h('div', { className: 'agent-panel' }, h('div', { className: 'panel-label' }, 'AGENT / IZIN'),
      h('label', {}, 'Observasi — Semi — Penuh ', slider, mode), description, warning, host, answer) }
}
