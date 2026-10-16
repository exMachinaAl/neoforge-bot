// director.mjs - kartu Director: tanya model, lihat usulan, setujui/tolak. Otonomi MATI; model hanya mengusulkan.
import { h, clear, fmtMs, short } from './dom.mjs'
export function directorCard (api, getId, refresh) {
  const goal = h('input', { placeholder: 'tujuan, mis. "kumpulkan 8 kayu lalu tidur"', style: 'flex:1 1 220px', maxlength: 600 }); const out = h('div', { style: 'margin-top:8px' }); const cfg = h('div', { className: 'mut' }); const msg = h('div', { className: 'bad' })
  const askBtn = h('button', { className: 'p' }, 'Tanya model')
  const showDecision = d => {
    clear(out); if (d.error) out.append(h('div', { className: 'bad' }, d.error)); if (d.reason) out.append(h('div', {}, d.reason))
    out.append(h('div', { className: 'mut' }, (d.model || '') + (d.ms ? ' · ' + fmtMs(d.ms) : '') + (d.usage ? ' · token ' + (d.usage.in ?? '?') + '/' + (d.usage.out ?? '?') : '')))
    for (const t of d.tasks || []) {
      const st = h('span', { className: 'tag' }, t.status); const row = h('div', { className: 'item' }, h('span', {}, h('b', {}, t.skill), ' ', h('span', { className: 'mut' }, short(t.params, 80))), h('span', { className: 'row' }, st))
      if (t.status === 'pending') { const ok = h('button', { className: 'p', onclick: async () => { try { const r = await api.approve(getId(), t.pid); st.textContent = r.status; ok.remove(); no.remove(); refresh() } catch (e) { msg.textContent = e.message } } }, 'Setujui'); const no = h('button', { onclick: async () => { try { const r = await api.reject(getId(), t.pid); st.textContent = r.status; ok.remove(); no.remove() } catch (e) { msg.textContent = e.message } } }, 'Tolak'); row.lastChild.append(ok, no) }
      out.append(row)
    }
    for (const r of d.rejected || []) out.append(h('div', { className: 'warn' }, 'ditolak: ' + (r.skill || '?') + ' — ' + r.why))
  }
  askBtn.onclick = async () => { msg.textContent = ''; askBtn.disabled = true; try { showDecision(await api.ask(getId(), goal.value)) } catch (e) { msg.textContent = e.message } askBtn.disabled = false; load() }
  async function load () { try { const s = await api.director(getId()); cfg.textContent = (s.configured ? s.provider + ' / ' + s.model : 'Model belum aktif pada proses bot; muat konfigurasi provider lalu restart bot') + ' · anggaran ' + s.used + '/' + s.rpm + ' per menit · otonomi MATI' + (s.autoApprove.length ? ' · auto-setuju: ' + s.autoApprove.join(',') : '') } catch (e) { cfg.textContent = 'Director tidak tersedia: ' + e.message } }
  return { el: h('div', {}, cfg, h('div', { className: 'row', style: 'margin-top:6px' }, goal, askBtn), msg, out), load }
}
