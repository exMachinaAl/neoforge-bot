import { h, clear } from './dom.mjs'

const STATUS = { proposed: 'Siap dimulai', running: 'Berjalan', paused: 'Dijeda', blocked: 'Butuh perhatian',
  finished: 'Selesai', cancelled: 'Dibatalkan', pending: 'Menunggu', dispatching: 'Menyiapkan',
  done: 'Selesai', failed: 'Gagal', uncertain: 'Perlu diperiksa' }

export function journeyCard (api, getId, onRefresh) {
  const missionHost = h('div', { className: 'mission-content' })
  const recent = h('div', { className: 'mission-history' })
  const progressLabel = h('div', { className: 'mut mission-live-progress' })
  const message = h('div', { className: 'journey-message', role: 'status' })
  const conversation = h('div', { className: 'conversation', 'aria-live': 'polite' })
  const input = h('textarea', { rows: 3, maxlength: 600, placeholder: 'Ceritakan sesuatu, atau beri tujuan untuk kegiatan kita…', 'aria-label': 'Pesan atau tujuan' })
  const send = h('button', {}, 'Kirim pesan')
  const start = h('button', { className: 'p' }, 'Mulai kegiatan')
  const offline = h('button', {}, 'Pilih kegiatan offline')
  const memoryHost = h('div', { className: 'memory-list' })
  const note = h('textarea', { rows: 2, maxlength: 1000, placeholder: 'Hal yang ingin diingat bersama…', 'aria-label': 'Catatan ingatan' })
  const saveNote = h('button', {}, 'Simpan ingatan')
  const sourceLabel = h('span', { className: 'tag' }, 'Tujuan → LLM · kegiatan offline → aturan lokal')
  let data = null, selected = null, owner = null, busy = false, loadVersion = 0
  let missionSig = '', memorySig = '', conversationSig = ''
  const base = id => '/bots/' + encodeURIComponent(id)
  function setBusy (value) { busy = value; send.disabled = start.disabled = offline.disabled = saveNote.disabled = value }
  async function action (path, body = {}, method = 'POST') {
    const id = getId()
    try {
      const result = await api.call(base(id) + path, { method, body })
      if (id !== getId()) return
      if (result?.id?.startsWith('m_')) selected = result.id
      await load(); await onRefresh?.()
      return result
    } catch (error) { if (id === getId()) message.textContent = error.message }
  }
  async function submit (kind) {
    if (busy || !getId()) return
    const text = input.value.trim()
    if (kind !== 'offline' && !text) { message.textContent = 'Tulis pesan atau tujuan dahulu.'; return }
    const id = getId(); setBusy(true)
    message.textContent = kind === 'chat' ? 'Sedang membalas…' : 'Menyiapkan kegiatan…'
    const result = await action(kind === 'chat' ? '/companion/chat' : '/missions/plan',
      kind === 'chat' ? { text } : { source: kind === 'offline' ? 'offline' : 'llm', goal: text, run: true })
    if (id === getId()) {
      if (result) {
        if (input.value.trim() === text) input.value = ''
        message.textContent = kind === 'chat' ? '' : 'Kegiatan tersimpan. ' + (result.reason || '')
      }
      setBusy(false)
    }
  }
  send.onclick = () => submit('chat')
  start.onclick = () => submit('llm')
  offline.onclick = () => submit('offline')
  saveNote.onclick = async () => {
    const text = note.value.trim(), id = getId()
    if (!text || busy) return
    setBusy(true); const result = await action('/memories', { text })
    if (id === getId()) { if (result && note.value.trim() === text) note.value = ''; setBusy(false) }
  }
  function button (title, path, body, method = 'POST') {
    const element = h('button', { onclick: async () => {
      element.disabled = true
      try { await action(path, body, method) } finally { element.disabled = false }
    } }, title)
    return element
  }
  function renderMission () {
    const mission = data?.missions.find(m => m.id === selected) || data?.missions[0]
    if (mission) selected = mission.id
    const signature = JSON.stringify([mission, data?.missions.map(m => [m.id, m.title, m.status]), data?.storageError])
    if (signature === missionSig) return
    missionSig = signature; clear(missionHost); clear(recent)
    if (!mission) {
      missionHost.append(h('div', { className: 'empty-activity' }, h('h2', {}, 'Hari ini, kita melakukan apa?'),
        h('p', { className: 'mut' }, 'Beri tujuan bersama atau biarkan lifecycle memilih kegiatan yang sesuai keadaan.')))
      return
    }
    const done = mission.steps.filter(s => s.status === 'done').length
    const operations = h('div', { className: 'row mission-actions' })
    const path = '/missions/' + encodeURIComponent(mission.id)
    if (['proposed', 'paused', 'blocked'].includes(mission.status)) {
      operations.append(button(mission.status === 'proposed' ? 'Mulai' : 'Lanjutkan', path + '/start'))
      if (mission.status !== 'proposed') operations.append(button('Perbaiki rencana · LLM', path + '/replan'))
    }
    if (mission.status === 'running') operations.append(button('Hentikan kegiatan', path + '/stop'))
    if (!['finished', 'cancelled'].includes(mission.status)) operations.append(button('Batalkan', path + '/cancel'))
    missionHost.append(h('div', { className: 'activity-eyebrow' }, mission.source === 'llm' ? 'DIRENCANAKAN BERSAMA AI' : 'KEGIATAN OFFLINE'),
      h('h2', {}, mission.title), h('div', { className: 'row' }, h('span', { className: 'tag' }, STATUS[mission.status] || mission.status),
        h('span', { className: 'mut' }, done + ' / ' + mission.steps.length + ' langkah')),
      h('p', { className: 'mut' }, mission.reason || mission.goal),
      h('progress', { max: mission.steps.length, value: done, 'aria-label': 'Progres kegiatan' }), operations)
    const list = h('ol', { className: 'mission-steps' })
    for (const step of mission.steps) {
      const row = h('li', { className: 'mission-step state-' + step.status },
        h('div', {}, h('b', {}, step.label), h('span', { className: 'tag' }, STATUS[step.status] || step.status)),
        step.error ? h('p', { className: 'bad' }, step.error) : null)
      if (['failed', 'uncertain'].includes(step.status) && !['cancelled', 'finished'].includes(mission.status)) {
        row.append(h('p', { className: 'mut' }, step.status === 'uncertain'
          ? 'Hasil sebelum terputus belum diketahui. Periksa dunia sebelum mengulang aksi.'
          : 'Langkah berikutnya menunggu penyelesaian masalah ini.'))
        const retry = button('Siapkan ulang langkah', path + '/resolve', { stepId: step.id, resolution: 'retry' })
        const click = retry.onclick
        retry.onclick = () => { if (step.status !== 'uncertain' || confirm('Sudah memeriksa dunia? Mengulang dapat menggandakan aksi yang sempat selesai.')) click() }
        row.append(retry)
        if (step.status === 'uncertain') row.append(button('Saya sudah periksa: selesai', path + '/resolve', { stepId: step.id, resolution: 'done' }))
      }
      list.append(row)
    }
    missionHost.append(list)
    if (mission.outcomeScore) missionHost.append(h('p', { className: 'mut' }, 'Skor hasil: ' + Math.round(mission.outcomeScore.total) + '/100'))
    if (data.storageError) missionHost.append(h('p', { className: 'bad' }, data.storageError))
    for (const item of data.missions.slice(0, 8)) {
      recent.append(h('button', { className: item.id === selected ? 'selected' : '', onclick: () => { selected = item.id; renderMission() } },
        item.title + ' · ' + (STATUS[item.status] || item.status)))
    }
  }
  function renderMemory () {
    const signature = JSON.stringify(data?.memories)
    if (signature === memorySig) return
    memorySig = signature; clear(memoryHost)
    for (const entry of (data?.memories || []).slice(0, 20)) {
      const label = { note: 'Catatan Anda', outcome: 'Hasil kegiatan', goal: 'Tujuan', replan: 'Perbaikan rencana', confirmation: 'Konfirmasi Anda' }[entry.kind] || entry.kind
      memoryHost.append(h('article', { className: 'memory-entry' },
        h('small', { className: 'mut' }, label + ' · ' + new Date(entry.ts).toLocaleString('id-ID')),
        h('p', {}, entry.text), button('Lupakan', '/memories/' + encodeURIComponent(entry.id), undefined, 'DELETE')))
    }
    if (!data?.memories.length) memoryHost.append(h('p', { className: 'mut' }, 'Ingatan akan terisi dari kegiatan dan catatan yang Anda simpan.'))
  }
  function renderConversation () {
    const signature = JSON.stringify(data?.conversation)
    if (signature === conversationSig) return
    conversationSig = signature; clear(conversation)
    for (const item of data?.conversation || []) conversation.append(h('div', { className: 'speech ' + item.role },
      h('small', {}, item.role === 'user' ? 'Anda' : 'Companion'), h('p', {}, item.text)))
    if (!data?.conversation.length) conversation.append(h('p', { className: 'mut' }, 'Kirim pesan untuk mengobrol. Gunakan Mulai kegiatan untuk menjalankan tujuan.'))
    conversation.scrollTop = conversation.scrollHeight
  }
  async function load () {
    const id = getId(), version = ++loadVersion
    if (!id) return
    if (owner !== id) {
      owner = id; selected = null; data = null; missionSig = memorySig = conversationSig = ''
      input.value = ''; note.value = ''; message.textContent = ''; setBusy(false)
      clear(missionHost); clear(memoryHost); clear(conversation); clear(recent)
    }
    try {
      const result = await api.call(base(id) + '/missions')
      if (version !== loadVersion || id !== getId()) return
      data = result; renderMission(); renderMemory(); renderConversation()
    } catch (error) { if (version === loadVersion && id === getId()) message.textContent = error.message }
  }
  function update (state) {
    const mission = data?.missions.find(m => m.id === selected)
    const step = mission?.steps.find(s => s.taskId === state.currentTaskId)
    const progress = step && state.progress
    progressLabel.textContent = progress ? (progress.label || step.label) + (Number.isFinite(progress.pct) ? ' · ' + Math.round(progress.pct * 100) + '%' : '') : ''
  }
  return {
    load, update,
    activities: h('section', { className: 'panel activity-card' }, h('div', { className: 'panel-label' }, 'KEGIATAN KITA'), missionHost, progressLabel,
      h('details', {}, h('summary', {}, 'Kegiatan sebelumnya'), recent)),
    talk: h('section', { className: 'panel talk-card' }, h('div', { className: 'panel-label' }, 'PERCAKAPAN & TUJUAN'),
      conversation, input, h('div', { className: 'row conversation-actions' }, send, start, offline), message, sourceLabel),
    memories: h('section', { className: 'panel memories-card' }, h('div', { className: 'panel-label' }, 'INGATAN BERSAMA'), note, saveNote, memoryHost)
  }
}
