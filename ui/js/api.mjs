// api.mjs - klien REST/SSE. Autentikasi lewat cookie same-origin (token tidak pernah dipegang JS). botId selalu eksplisit (tanpa "me").
export function createApi ({ base = '', fetchImpl = (...a) => fetch(...a) } = {}) {
  async function call (path, { method = 'GET', body } = {}) {
    const res = await fetchImpl(base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
    let j = null; try { j = await res.json() } catch (e) { /* bukan JSON */ }
    if (!res.ok) throw Object.assign(new Error((j && j.error) || 'HTTP ' + res.status), { status: res.status })
    return j
  }
  const b = id => '/bots/' + encodeURIComponent(id); const q = encodeURIComponent
  return {
    call, bots: () => call('/bots'), state: id => call(b(id)), tasks: id => call(b(id) + '/tasks'), skills: () => call('/skills'),
    enqueue: (id, body) => call(b(id) + '/tasks', { method: 'POST', body }), cancel: (id, tid) => call(b(id) + '/tasks/' + q(tid), { method: 'DELETE' }),
    command: (id, op, payload) => call(b(id) + '/commands', { method: 'POST', body: { op, payload } }), kill: () => call('/killswitch', { method: 'POST' }),
    session: () => call('/auth/session'), settings: id => call(b(id) + '/settings'), updateSettings: (id, body) => call(b(id) + '/settings', { method: 'POST', body }),
    map: (id, r) => call(b(id) + '/map?r=' + q(r)), viewer: id => call(b(id) + '/viewer'), setViewer: (id, enabled) => call(b(id) + '/viewer', { method: 'POST', body: { enabled } }), director: id => call(b(id) + '/director'),
    ask: (id, goal) => call(b(id) + '/director/ask', { method: 'POST', body: { goal } }),
    approve: (id, pid) => call(b(id) + '/director/proposals/' + q(pid) + '/approve', { method: 'POST' }), reject: (id, pid) => call(b(id) + '/director/proposals/' + q(pid) + '/reject', { method: 'POST' })
  }
}
export function connectEvents ({ url = '/events', onEvent, onStatus, ES = typeof EventSource === 'undefined' ? null : EventSource, delays = [1000, 2000, 4000, 8000, 15000] }) {
  let es = null; let n = 0; let closed = false; let timer = null
  const open = () => {
    if (closed || !ES) return
    es = new ES(url); es.onopen = () => { n = 0; onStatus && onStatus('tersambung') }
    es.onmessage = m => { let e = null; try { e = JSON.parse(m.data) } catch (x) { return } if (e && typeof e.type === 'string') onEvent(e) }
    es.onerror = () => { onStatus && onStatus('terputus, mencoba lagi'); try { es.close() } catch (x) {} if (!closed) timer = setTimeout(open, delays[Math.min(n++, delays.length - 1)]) }
  }
  open(); return () => { closed = true; clearTimeout(timer); try { es && es.close() } catch (x) {} }
}
