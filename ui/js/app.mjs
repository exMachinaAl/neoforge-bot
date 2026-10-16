// controller-shell-v3: UI stabil, panel game controller, dan boundary akun/tenant.
import { h, clear } from './dom.mjs'
import { createApi, connectEvents } from './api.mjs'
import { createStore } from './store.mjs'
import { renderStatus, renderProgress, renderQueue, renderHistory, renderInventory, renderQuick, renderLog, skillFormCard, chatCard } from './cards.mjs'
import { directorCard } from './director.mjs'
import { mapCard } from './mapcard.mjs'
import { lifecycleCard } from './lifecycle.mjs'
import { viewerCard } from './viewer.mjs'
import { companionCard } from './companion.mjs'
import { preferencesCard } from './preferences.mjs'

const stable = value => JSON.stringify(value, (key, item) => key === 'ts' || key === 'updatedAt' ? undefined : item)
const panel = (title, body, cls = '') => h('section', { className: 'panel ' + cls }, h('div', { className: 'panel-label' }, title), body)
function tabs (items, initial, onChange) {
  const nav = h('div', { className: 'tabs' }); const body = h('div', { className: 'tab-body' }); let active = initial
  const set = key => { active = key; for (const item of items) { item.button.className = 'tab' + (item.key === key ? ' active' : ''); item.body.style.display = item.key === key ? '' : 'none' } onChange && onChange(key) }
  for (const item of items) { item.button = h('button', { className: 'tab', onclick: () => set(item.key) }, item.label); nav.append(item.button); body.append(item.body) }
  set(initial); return { el: h('div', {}, nav, body), set, get active () { return active } }
}

async function main () {
  if (location.search.includes('token=')) history.replaceState(null, '', location.pathname)
  const api = createApi(); const store = createStore(); const root = document.getElementById('app'); clear(root)
  const id = () => store.s.current; const log = message => store.applyEvent({ ts: Date.now(), botId: id() || '-', type: 'ui', data: { message } })
  const act = { cancel: task => api.cancel(id(), task).then(poll).catch(e => log(e.message)), cmd: op => api.command(id(), op, {}).then(poll).catch(e => log(e.message)), kill: () => confirm('Hentikan semua task dan jeda antrean?') && api.kill().then(poll), say: text => api.command(id(), 'say', { text }).catch(e => log(e.message)), snapshot: () => api.enqueue(id(), { skill: 'inv.snapshot', params: {}, priority: 60 }).then(poll).catch(e => log(e.message)), enqueue: (skill, params, priority) => api.enqueue(id(), { skill, params, priority }).then(poll) }
  const els = { status: h('div'), progress: h('div'), quick: h('div'), queue: h('div'), history: h('div'), inventory: h('div'), log: h('pre'), connection: h('span', { className: 'connection' }, 'menghubungkan'), account: h('div', { className: 'account-chip' }, 'Owner') }
  const picker = h('select', { className: 'bot-picker' }); const companion = companionCard(api, id); let persona = null; let lifeContext = {}; let worldMode = 'viewer'; let preferences
  const form = skillFormCard(store, act); const director = directorCard(api, id, poll)
  const map = mapCard(api, id, (x, z, name) => { if (confirm('Jalan ke ' + x + ', ' + z + ' (' + name + ')?')) act.enqueue('nav.goto', { x, z }, 50).catch(e => log(e.message)) })
  const viewer = viewerCard(api, id)
  const life = lifecycleCard(api, id, poll, snapshot => { persona = snapshot.persona; lifeContext = snapshot.context || {}; companion.update({ state: id() ? store.B(id()).state : {}, persona, context: lifeContext }) })
  const worldTabs = tabs([{ key: 'viewer', label: 'Eagle View', body: viewer.el }, { key: 'map', label: 'Peta 2D', body: map.el }], 'viewer', key => { worldMode = key; if (key === 'map') map.refresh() })
  preferences = preferencesCard(api, id, (settings, key) => { if (key === 'viewer') viewer.load(); if (key === 'map' && settings.map && worldMode === 'map') map.refresh(); document.body.className = settings.motion === false ? 'reduce-motion' : '' })
  const activityTabs = tabs([{ key: 'mission', label: 'Misi', body: h('div', {}, panel('Task baru', form.el), panel('Antrean', els.queue), panel('Riwayat', els.history)) }, { key: 'life', label: 'Lifecycle', body: life.el }, { key: 'inventory', label: 'Inventory', body: els.inventory }, { key: 'log', label: 'Log', body: els.log }], 'mission')
  const shell = h('div', { className: 'controller-shell' },
    h('header', { className: 'topbar' }, h('div', { className: 'brand' }, h('span', { className: 'brand-mark' }, 'A'), h('span', {}, h('b', {}, 'ARCADIA'), h('small', {}, 'AI LIFE CONTROL'))), h('div', { className: 'top-controls' }, picker, els.connection, els.account)),
    h('main', { className: 'dashboard-grid' },
      h('div', { className: 'left-rail' }, companion.el, panel('STATUS BOT', els.status), panel('KONTROL CEPAT', els.quick)),
      h('div', { className: 'world-column' }, panel('LIVE WORLD', worldTabs.el, 'world-panel'), panel('AKTIVITAS', activityTabs.el, 'activity-panel')),
      h('aside', { className: 'right-rail' }, panel('TASK BERJALAN', els.progress), panel('DIRECTOR', director.el), panel('PENGATURAN', preferences.el), panel('CHAT', chatCard(act)))
    ))
  root.append(shell)
  picker.onchange = () => { store.setCurrent(picker.value); persona = null; poll(); life.load(); director.load(); viewer.load(); preferences.load(); companion.loadProfile(); if (worldMode === 'map') map.refresh() }
  const seen = {}; const paint = (key, value, fn) => { const sig = stable(value); if (seen[key] === sig) return; seen[key] = sig; fn() }
  function draw () {
    const bot = id() ? store.B(id()) : null; if (!bot) return
    paint('status', bot.state, () => renderStatus(els.status, bot.state)); paint('progress', [bot.tasks.running, bot.progress], () => renderProgress(els.progress, bot)); paint('queue', [bot.tasks.running, bot.tasks.queue, bot.tasks.paused], () => renderQueue(els.queue, bot.tasks, act)); paint('history', bot.tasks.history, () => renderHistory(els.history, bot.tasks)); paint('inventory', bot.state && bot.state.inventory, () => renderInventory(els.inventory, bot.state, store.s.skills, act)); paint('quick', store.s.skills.map(x => x.name), () => renderQuick(els.quick, store.s.skills, act, form.pick)); paint('log', store.s.log, () => renderLog(els.log, store.s.log)); companion.update({ state: bot.state || {}, persona: persona || {}, context: lifeContext }); els.connection.textContent = store.s.status || 'tersambung'; els.connection.className = 'connection ' + (/terputus/.test(store.s.status) ? 'bad' : 'ok')
  }
  store.subscribe(draw)
  async function poll () {
    try {
      const bots = await api.bots(); store.setBots(bots); const ids = store.s.bots.join('|')
      if (picker.dataset.ids !== ids) { picker.dataset.ids = ids; clear(picker); store.s.bots.forEach(botId => picker.append(h('option', { value: botId }, botId))) }
      picker.value = id() || ''; if (id()) { const [state, tasks] = await Promise.all([api.state(id()), api.tasks(id())]); store.setState(id(), state); store.setTasks(id(), tasks) }
    } catch (e) { store.setStatus('terputus: ' + e.message) }
  }
  try { const session = await api.session(); els.account.textContent = session.user.displayName + ' · ' + session.tenant.name; els.account.setAttribute('title', session.user.role + ' / ' + session.authMode) } catch (e) { els.account.textContent = 'Sesi tidak tersedia' }
  try { store.setSkills(await api.skills()); form.sync() } catch (e) { log('skill gagal dimuat: ' + e.message) }
  await poll(); await Promise.allSettled([director.load(), viewer.load(), life.load(), preferences.load(), companion.loadProfile()])
  connectEvents({ url: '/events', onEvent: event => { store.applyEvent(event); if (/^(batch.|lifecycle.|persona.)/.test(event.type)) life.load(); if (/^(task.(started|finished|failed|queued)|bot.)/.test(event.type)) poll() }, onStatus: store.setStatus })
  setInterval(() => { if (!document.hidden) { poll(); viewer.load() } }, 3000)
  setInterval(() => { if (!document.hidden && worldMode === 'map' && (!preferences.current || preferences.current.map !== false)) map.refresh() }, 5000)
}
if (typeof document !== 'undefined' && typeof document.getElementById === 'function') main().catch(e => { document.getElementById('app').textContent = 'UI gagal dimulai: ' + e.message })
