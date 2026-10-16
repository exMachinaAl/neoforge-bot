// Menu pengaturan runtime; tersimpan di server per bot.
import { h } from './dom.mjs'
export function preferencesCard (api, getId, changed) {
  const msg = h('div', { className: 'mut' }, 'memuat pengaturan...'); const controls = h('div', { className: 'switch-list' }); let current = null; let generation = 0
  const labels = { viewer: ['Eagle View', 'Viewer 3D per bot'], map: ['Peta hidup', 'Penyegaran peta 2D'], motion: ['Animasi UI', 'Gerak halus karakter dan panel'] }
  function render (settings) {
    current = settings; controls.textContent = ''
    for (const key of Object.keys(labels)) { const input = h('input', { type: 'checkbox' }); input.checked = settings[key] !== false
      input.onchange = async () => { input.disabled = true; try { current = await api.updateSettings(getId(), { [key]: input.checked }); changed && changed(current, key) } catch (e) { input.checked = !input.checked; msg.textContent = e.message } finally { input.disabled = false } }
      controls.append(h('label', { className: 'switch-row' }, h('span', {}, h('b', {}, labels[key][0]), h('small', {}, labels[key][1])), h('span', { className: 'switch' }, input, h('i')))) }
    msg.textContent = 'Preferensi tersimpan untuk ' + getId()
  }
  async function load () { const id = getId(); if (!id) return; const mine = ++generation; try { const v = await api.settings(id); if (mine === generation && id === getId()) render(v) } catch (e) { if (mine === generation) msg.textContent = e.message } }
  return { el: h('div', {}, controls, msg), load, render, get current () { return current } }
}
