// Wajah dan statistik AI life. Visual dibuat dengan DOM/CSS, data berasal dari BotState + Persona.
import { h } from './dom.mjs'
import { createAvatar3d } from './avatar3d.mjs'

const clamp = value => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0))
export function moodOf (state = {}, persona = {}) {
  const health = clamp((state.health ?? 20) / 20); const affection = clamp(persona.affection ?? 0.5)
  const energy = clamp(persona.needs && persona.needs.energy !== undefined ? persona.needs.energy : 0.7)
  const boredom = clamp(persona.needs && persona.needs.boredom !== undefined ? persona.needs.boredom : 0.3)
  const score = health * 0.3 + affection * 0.3 + energy * 0.25 + (1 - boredom) * 0.15
  return score >= 0.8 ? { label: 'Ceria', face: 'happy' } : score >= 0.55 ? { label: 'Tenang', face: 'calm' } : score >= 0.35 ? { label: 'Lelah', face: 'tired' } : { label: 'Butuh perhatian', face: 'sad' }
}

export function companionCard (api, getId) {
  const name = h('div', { className: 'companion-name' }, 'Arcadia Bot'); const meta = h('div', { className: 'mut' }, 'level 1 · 0 XP')
  const face = h('div', { className: 'life-face calm' }, h('i', { className: 'antenna' }), h('i', { className: 'ear left' }), h('i', { className: 'ear right' }), h('span', { className: 'eye left' }), h('span', { className: 'eye right' }), h('span', { className: 'mouth' }))
  const mood = h('span', { className: 'mood-pill' }, 'Tenang'); const fallback = h('div', { className: 'avatar-fallback' }, h('div', { className: 'life-halo' }), face); const avatar = createAvatar3d(api, getId, fallback)
  const stats = h('div', { className: 'life-stats' }); const extraStats = h('div', { className: 'life-stats' }); const rows = new Map()
  const names = [['affection', 'Afeksi'], ['health', 'Kesehatan'], ['food', 'Kenyang'], ['energy', 'Energi'], ['security', 'Rasa aman'], ['curiosity', 'Rasa ingin tahu'], ['diligence', 'Produktivitas'], ['sociability', 'Sosial'], ['caution', 'Kewaspadaan'], ['aggression', 'Agresivitas'], ['calm', 'Ketenangan'], ['threatSafety', 'Keamanan area'], ['daylight', 'Kenyamanan waktu'], ['experience', 'Progres XP']]
  for (const [key, label] of names) { const value = h('b', {}, '0%'); const fill = h('i'); (rows.size < 4 ? stats : extraStats).append(h('div', { className: 'life-stat' }, h('div', {}, h('span', {}, label), value), h('div', { className: 'meter' }, fill))); rows.set(key, { value, fill }) }
  function update ({ state = {}, persona = {}, context = {} } = {}) {
    name.textContent = persona.name || state.username || state.botId || 'Arcadia Bot'; meta.textContent = 'level ' + (persona.level ?? 1) + ' · ' + (persona.xp ?? 0) + ' XP'
    const m = moodOf(state, persona); mood.textContent = m.label; face.className = 'life-face ' + m.face; avatar.update(state, persona)
    const traits = persona.traits || {}; const needs = persona.needs || {}
    const values = { affection: persona.affection ?? 0.5, health: (state.health ?? 20) / 20, food: (state.food ?? 20) / 20, energy: needs.energy ?? 0.7, security: needs.security ?? 0.5, curiosity: traits.curiosity ?? 0.5, diligence: traits.diligence ?? 0.5, sociability: traits.sociability ?? 0.5, caution: traits.caution ?? 0.5, aggression: traits.aggression ?? 0.3, calm: 1 - (needs.boredom ?? 0.3), threatSafety: 1 - Math.min(1, (context.threatCount || 0) / 8), daylight: ['day','dawn'].includes(context.timeOfDay) ? 1 : 0.35, experience: ((persona.xp || 0) % 100) / 100 }
    for (const [key, row] of rows) { const pct = Math.round(clamp(values[key]) * 100); row.value.textContent = pct + '%'; row.fill.style.width = pct + '%' }
  }
  return { el: h('section', { className: 'panel companion-card' }, h('div', { className: 'panel-label' }, 'BERSAMA COMPANION'), h('div', { className: 'life-stage' }, fallback, avatar.el, mood), name, meta, stats,
    h('details', { className: 'companion-details' }, h('summary', {}, 'Kepribadian & statistik'), extraStats),
    h('details', { className: 'companion-details' }, h('summary', {}, 'Model & animasi'), avatar.controls)), update, loadProfile: avatar.loadProfile, dispose: avatar.dispose }
}
