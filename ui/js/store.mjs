// store.mjs - keadaan UI berbasis botId (tanpa "me"). Reduser event murni, dapat diuji tanpa DOM.
export const normPct = p => { if (typeof p !== 'number' || !Number.isFinite(p)) return null; const f = p > 1 ? p / 100 : p; return Math.min(1, Math.max(0, f)) }
export function createStore () {
  const s = { bots: [], current: null, skills: [], by: {}, log: [], status: '' }; const subs = new Set()
  const B = id => (s.by[id] = s.by[id] || { state: null, tasks: { running: null, queue: [], history: [], paused: false }, progress: {}, seq: {}, running: null })
  const emit = () => subs.forEach(f => f(s))
  function setBots (list) { s.bots = list.map(b => b.botId); if (!s.current || !s.bots.includes(s.current)) s.current = s.bots[0] || null; list.forEach(b => { B(b.botId).state = b }); emit() }
  function setState (id, st) { B(id).state = st; emit() }
  function setTasks (id, t) { B(id).tasks = t; emit() }
  function applyEvent (ev) {
    const id = ev.botId; if (!id) return; const b = B(id); const d = ev.data || {}
    if (ev.type === 'task.progress') {
      const tid = d.taskId; if (!tid) return
      if (typeof d.seq === 'number' && b.seq[tid] !== undefined && d.seq <= b.seq[tid]) return // GUARD:SEQ
      const prev = b.progress[tid]; let pct = normPct(d.pct)
      if (pct !== null && prev && prev.pct !== null && pct < prev.pct) pct = prev.pct // GUARD:MONO
      if (typeof d.seq === 'number') b.seq[tid] = d.seq
      b.progress[tid] = { taskId: tid, pct, label: d.label == null ? '' : String(d.label), data: d.data, seq: d.seq }
      emit(); return // sering: tidak masuk log
    }
    if (ev.type === 'task.started') { b.running = d.id || d.taskId || null }
    if (ev.type === 'task.finished' || ev.type === 'task.failed') {
      const tid = d.taskId || d.id
      if (tid && b.progress[tid]) delete b.progress[tid]
      if (tid && b.running === tid) b.running = null // GUARD:OTHER
    }
    s.log.push({ ts: ev.ts, botId: id, type: ev.type, text: JSON.stringify(d).slice(0, ev.type === 'task.failed' ? 600 : 160) }); if (s.log.length > 200) s.log.splice(0, s.log.length - 200)
    emit()
  }
  return { s, B, setBots, setState, setTasks, applyEvent, setSkills: l => { s.skills = l; emit() }, setStatus: t => { s.status = t; emit() }, setCurrent: id => { s.current = id; emit() }, subscribe: f => { subs.add(f); return () => subs.delete(f) } }
}
