// Panel prismarine-viewer per bot. Iframe dipertahankan selama URL sama.
import { h, clear } from './dom.mjs'

export function safeViewerUrl (value) {
  if (typeof value === 'string' && /^\/view\/[A-Za-z0-9_-]+\/(eagle|first-person)\/(\?g=[A-Za-z0-9_-]+)?$/.test(value)) return value
  try {
    const u = new URL(String(value || '')); const port = Number(u.port)
    if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || !Number.isInteger(port) || port < 1 || port > 65535 || u.username || u.password) return null // GUARD:VIEWER_URL
    u.pathname = '/'; u.search = ''; u.hash = ''; return u.href
  } catch (e) { return null }
}

export function viewerCard (api, botId) { // viewer-stable-frame-v2
  const state = h('span', { className: 'mut' }, 'memuat eagle view...'); const open = h('a', { target: '_blank', rel: 'noopener noreferrer' }, 'Layar penuh')
  const toggle = h('button', { className: 'toggle-viewer' }, 'Matikan'); const bar = h('div', { className: 'viewer-toolbar' }, state, h('span', { className: 'row' }, open, toggle)); const frame = h('div', { className: 'viewer-frame' })
  const el = h('div', {}, bar, frame); let generation = 0; let lastKey = ''; let frameUrl = ''; let current = null
  const render = v => {
    current = v || {}; const url = current.state === 'ready' ? safeViewerUrl(current.url) : null
    const key = JSON.stringify([current.botId, current.enabled, current.desired, current.state, current.port, url, current.reason])
    if (key === lastKey) return; lastKey = key
    toggle.textContent = current.desired === false || current.state === 'off' ? 'Nyalakan' : 'Matikan'; toggle.disabled = false
    if (current.state === 'ready' && url) {
      state.className = 'ok'; state.textContent = url.startsWith('/view/') ? 'Eagle View · Live' : (current.botId || botId()) + ' · EAGLE · port ' + current.port; open.setAttribute('href', url); open.style.display = ''
      if (frameUrl !== url) { clear(frame); frame.append(h('iframe', { className: 'viewer3d', src: url, title: 'Viewer 3D ' + (current.botId || botId()), loading: 'eager', sandbox: 'allow-scripts allow-same-origin', allow: 'fullscreen' })); frameUrl = url }
      return
    }
    open.style.display = 'none'; state.className = current.state === 'error' || current.state === 'unavailable' || (current.state === 'ready' && !url) ? 'bad' : 'mut'
    state.textContent = current.state === 'ready' && !url ? 'URL viewer ditolak' : current.reason || ('Viewer ' + (current.state || 'memulai'))
    if (frameUrl) { clear(frame); frameUrl = '' }
  }
  toggle.onclick = async () => { const enable = !current || current.desired === false || current.state === 'off'; toggle.disabled = true; try { render(await api.setViewer(botId(), enable)) } catch (e) { render({ enabled: false, desired: false, state: 'error', reason: e.message }) } }
  const load = async () => { const id = botId(); if (!id) return; const mine = ++generation; try { const v = await api.viewer(id); if (mine === generation && id === botId()) render(v) } catch (e) { if (mine === generation) render({ enabled: false, state: 'error', reason: e.message }) } }
  return { el, load, render }
}
