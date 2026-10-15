// app.mjs - perakit UI. botId-first: bot dipilih dari GET /bots. Token tidak dipegang JS (cookie same-origin); ?token dihapus dari URL.
import { h, clear } from './dom.mjs'
import { createApi, connectEvents } from './api.mjs'
import { createStore } from './store.mjs'
import { renderStatus, renderProgress, renderQueue, renderHistory, renderInventory, renderQuick, renderLog, skillFormCard, chatCard } from './cards.mjs'
import { directorCard } from './director.mjs'
import { mapCard } from './mapcard.mjs'
import { lifecycleCard } from './lifecycle.mjs' // lifecycle-panel-v1

async function main () {
  if (location.search.includes('token=')) history.replaceState(null, '', location.pathname)
  const api = createApi(); const store = createStore(); const root = document.getElementById('app'); clear(root)
  const id = () => store.s.current; const log = m => store.applyEvent({ ts: Date.now(), botId: id() || '-', type: 'ui', data: { m } })
  const act = { cancel: t => api.cancel(id(), t).then(poll).catch(e => log(e.message)), cmd: op => api.command(id(), op, {}).then(poll).catch(e => log(e.message)), kill: () => confirm('Hentikan semua task dan jeda antrean?') && api.kill().then(poll), say: t => api.command(id(), 'say', { text: t }).catch(e => log(e.message)),
    snapshot: () => api.enqueue(id(), { skill: 'inv.snapshot', params: {}, priority: 60 }).then(poll).catch(e => log(e.message)), enqueue: (skill, params, priority) => api.enqueue(id(), { skill, params, priority }).then(poll) }
  const sec = (title, body) => h('div', { className: 'card' }, h('h2', {}, title), body)
  const els = { head: h('div', { className: 'row' }), status: h('div'), progress: h('div'), quick: h('div'), queue: h('div'), history: h('div'), inv: h('div'), log: h('pre') }
  const form = skillFormCard(store, act); const chat = chatCard(act); const dir = directorCard(api, id, () => poll())
  const map = mapCard(api, id, (x, z, name) => { if (confirm('Jalan ke ' + x + ', ' + z + ' (' + name + ')?')) act.enqueue('nav.goto', { x, z }, 50).catch(e => log(e.message)) })
  const life = lifecycleCard(api, id, () => poll())
  const picker = h('select', { onchange: e => { store.setCurrent(e.target.value); poll(); life.load(); dir.load(); map.refresh() } })
  const view = h('span', { className: 'mut' })
  root.append(h('div', { className: 'card' }, h('div', { className: 'row' }, h('b', {}, 'Arcadia'), picker, view)), sec('Bot', els.status), sec('Task berjalan', els.progress), sec('Kontrol', els.quick), sec('Task baru', form.el), sec('Antrean', els.queue), sec('Riwayat (ketuk untuk detail)', els.history), sec('Director (model)', dir.el), sec('Kegiatan & persona', life.el), sec('Peta 2D', map.el), sec('Inventory', els.inv), sec('Chat', chat), sec('Log', els.log))
  const draw = () => { const b = id() ? store.B(id()) : null; if (!b) return
    renderStatus(els.status, b.state); renderProgress(els.progress, b); renderQueue(els.queue, b.tasks, act); renderHistory(els.history, b.tasks); renderInventory(els.inv, b.state, store.s.skills, act); renderQuick(els.quick, store.s.skills, act, form.pick); renderLog(els.log, store.s.log); view.textContent = store.s.status }
  store.subscribe(draw)
  async function poll () { try { const bots = await api.bots(); store.setBots(bots); clear(picker); store.s.bots.forEach(b => picker.append(h('option', { value: b }, b))); picker.value = id() || ''; if (id()) { store.setState(id(), await api.state(id())); store.setTasks(id(), await api.tasks(id())) } } catch (e) { store.setStatus('terputus: ' + e.message) } }
  try { store.setSkills(await api.skills()); form.sync() } catch (e) { log('skill gagal dimuat: ' + e.message) }
  await poll(); dir.load(); map.refresh(); life.load()
  connectEvents({ url: '/events', onEvent: ev => { store.applyEvent(ev); if (/^(batch\.|lifecycle\.|persona\.)/.test(ev.type)) life.load(); if (/^(task\.(started|finished|failed|queued)|bot\.)/.test(ev.type)) poll() }, onStatus: store.setStatus })
  setInterval(poll, 3000); setInterval(() => { if (!document.hidden) map.refresh() }, 4000)
}
if (typeof document !== 'undefined' && typeof document.getElementById === 'function') main().catch(e => { document.getElementById('app').textContent = 'UI gagal dimulai: ' + e.message })
