// lifecycle/stats.js - Pengumpul statistik - subscribe ke event engine, catat ke JSONL
// Format entry: { ts, botId, skill, params_digest, durationMs, ok, code, context }
// Rotasi berkas: bila ukuran > 5MB, rename ke stats.YYYYMMDD.jsonl dan buat baru
// Agregat bergulir: per (skill x timeOfDay) -> {count, okCount, totalMs, lastTs} di stats_agg.json
// Aman bila sinyal hilang (context kosong -> defaults wajar)
// HANYA MENCATAT - tidak mengubah perilaku bot

'use strict'

const fs = require('fs')
const path = require('path')

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5MB

const TIME_BUCKETS = [
  { name: 'day',   tickStart: 0,     tickEnd: 12000 },
  { name: 'dusk',  tickStart: 12000, tickEnd: 13000 },
  { name: 'night', tickStart: 13000, tickEnd: 23000 },
  { name: 'dawn',  tickStart: 23000, tickEnd: 24000 }
]

/**
 * Tentukan bucket waktu berdasarkan tick Minecraft.
 * Batas inklusif kiri, eksklusif kanan (kecuali bucket terakhir).
 * @param {number} tick
 * @returns {string}
 */
function timeBucket (tick) {
  const t = (typeof tick === 'number' && isFinite(tick)) ? tick : 0
  // Normalkan ke 0..23999
  const normalized = ((t % 24000) + 24000) % 24000
  for (const b of TIME_BUCKETS) {
    if (normalized >= b.tickStart && normalized < b.tickEnd) return b.name
  }
  // Fallback: tick 23000..23999 = dawn, 0..11999 = day (sudah ditangani di atas)
  return 'day'
}

/**
 * Baca snapshot konteks dari bot.
 * Semua field aman bila sinyal kosong/tidak ada.
 * @param {object} bot
 * @returns {object}
 */
function getContext (bot) {
  let timeOfDay = 'day'
  let tick = 0
  let isRaining = false
  let playerCount = 0
  let hostileCount = 0
  let health = 20
  let food = 20
  let dimension = 'overworld'

  try {
    if (bot && bot.time && typeof bot.time.timeOfDay === 'number') {
      tick = bot.time.timeOfDay
      timeOfDay = timeBucket(tick)
    }
  } catch (_) {}

  try {
    if (bot && typeof bot.isRaining === 'boolean') isRaining = bot.isRaining
  } catch (_) {}

  try {
    if (bot && bot.players && typeof bot.players === 'object') {
      playerCount = Object.keys(bot.players).filter(name => name !== bot.username).length
    }
  } catch (_) {}

  try {
    if (bot && bot.entities && typeof bot.entities === 'object') {
      for (const id of Object.keys(bot.entities)) {
        const e = bot.entities[id]
        if (!e || !(e.type === 'hostile' || e.kind === 'Hostile mobs')) continue
        const p = bot.entity?.position; const q = e.position
        // threats-nearby-v1: entitas jauh di chunk yang sama bukan ancaman lokal.
        if (!p || !q || Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z) <= 16) hostileCount++
      }
    }
  } catch (_) {}

  try {
    if (bot && typeof bot.health === 'number' && isFinite(bot.health)) health = bot.health
  } catch (_) {}

  try {
    if (bot && typeof bot.food === 'number' && isFinite(bot.food)) food = bot.food
  } catch (_) {}

  try {
    if (bot && bot.game && bot.game.dimension) dimension = String(bot.game.dimension)
  } catch (_) {}

  return { timeOfDay, tick, isRaining, playerCount, hostileCount, health, food, dimension: dimension.replace(/^minecraft:/, ''), hp: health, threatCount: hostileCount, weather: isRaining ? (bot && bot.thunderState > 0 ? 'thunder' : 'rain') : 'clear', known: { hp: Number.isFinite(bot && bot.health), time: Number.isFinite(bot && bot.time && bot.time.timeOfDay), dimension: !!(bot && bot.game && bot.game.dimension) } }
}

/**
 * Rotasi berkas bila ukuran > 5MB.
 * Rename ke stats.YYYYMMDD.jsonl lalu buat file baru kosong.
 * @param {string} filePath
 */
function rotate (filePath) {
  try {
    const stat = fs.statSync(filePath)
    if (stat.size > MAX_FILE_BYTES) {
      const now = new Date()
      const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '')
      const dir = path.dirname(filePath)
      const base = path.basename(filePath, path.extname(filePath))
      let dest = path.join(dir, base + '.' + yyyymmdd + '.jsonl')
      // Hindari overwrite bila sudah ada (tambah suffix angka)
      let suffix = 0
      while (fs.existsSync(dest)) {
        suffix++
        dest = path.join(dir, base + '.' + yyyymmdd + '_' + suffix + '.jsonl')
      }
      fs.renameSync(filePath, dest)
    }
  } catch (e) {
    // File mungkin belum ada atau tidak bisa dibaca - abaikan
  }
}

/**
 * Perbarui agregat bergulir di stats_agg.json.
 * Key agregat: "<skill>:<timeOfDay>"
 * @param {object} entry
 * @param {string} aggPath
 */
function updateAgg (entry, aggPath) {
  if (!aggPath) aggPath = 'stats_agg.json'

  let agg = {}
  try {
    const raw = fs.readFileSync(aggPath, 'utf8')
    agg = JSON.parse(raw)
  } catch (_) {
    agg = {}
  }

  const skill = entry.skill || 'unknown'
  const timeOfDay = (entry.context && entry.context.timeOfDay) ? entry.context.timeOfDay : 'day'
  const key = skill + ':' + timeOfDay

  if (!agg[key]) {
    agg[key] = { count: 0, okCount: 0, totalMs: 0, lastTs: 0 }
  }

  const rec = agg[key]
  rec.count++
  if (entry.ok) rec.okCount++
  if (typeof entry.durationMs === 'number' && isFinite(entry.durationMs)) rec.totalMs += entry.durationMs
  rec.lastTs = entry.ts || Date.now()
  rec.failCount = (rec.failCount || 0) + (entry.ok ? 0 : 1); rec.successRate = +(rec.okCount / rec.count).toFixed(4); rec.avgMs = +(rec.totalMs / rec.count).toFixed(2)
  rec.codeCounts = rec.codeCounts || {}; rec.codeCounts[entry.code || 'UNKNOWN'] = (rec.codeCounts[entry.code || 'UNKNOWN'] || 0) + 1
  rec.contextSums = rec.contextSums || { health: 0, food: 0, threats: 0, players: 0, rain: 0 }; const c=entry.context||{}
  rec.contextSums.health += Number(c.health)||0; rec.contextSums.food += Number(c.food)||0; rec.contextSums.threats += Number(c.threatCount)||0; rec.contextSums.players += Number(c.playerCount)||0; rec.contextSums.rain += c.weather==='rain'||c.weather==='thunder'?1:0

  try {
    fs.writeFileSync(aggPath, JSON.stringify(agg, null, 2), 'utf8')
  } catch (_) {}
}

/**
 * Sambungkan modul statistik ke engine.
 * Subscribe ke event 'event' dari engine, proses task.finished dan task.failed.
 * TIDAK mengubah perilaku engine sama sekali.
 * @param {object} engine - hasil createEngine (memiliki .on(name, fn))
 * @param {object} bot
 * @param {object} [opts]
 * @param {string} [opts.statsFile] - path file JSONL (default: stats.jsonl)
 * @param {string} [opts.aggFile]   - path file agregat (default: stats_agg.json)
 */
// stats-start-context-v1: snapshot au debut; ne pas compter les notifications deux fois.
function attach (engine, bot, opts = {}) {
  const dir = opts.dataDir || process.env.ARCADIA_DATA_DIR || './data'
  const statsFile = opts.statsFile || path.join(dir, 'stats.jsonl')
  const aggFile = opts.aggFile || path.join(dir, 'stats_agg.json')
  const starts = new Map(); const seen = new Set()
  const listener = ev => {
    if (!ev || !ev.type) return
    const d = ev.data || {}; const id = d.taskId || d.id
    if (!id) return
    if (ev.type === 'task.started') {
      seen.delete(id)
      starts.set(id, { ts: ev.ts ?? Date.now(), params: JSON.parse(JSON.stringify(d.params || {})), context: getContext(bot), batchId: d.batchId })
      return
    }
    if (!['task.finished', 'task.failed'].includes(ev.type) || seen.has(id)) return
    const start = starts.get(id)
    if (!start && !d.result) return
    starts.delete(id); seen.add(id); if (seen.size > 1000) seen.delete(seen.values().next().value)
    const result = d.result || {}; const ts = ev.ts ?? Date.now()
    const entry = { ts, taskId: id, botId: ev.botId || bot?.username || 'bot', skill: d.skill,
      params: start?.params || d.params || {}, durationMs: result.durationMs ?? Math.max(0, ts - (start?.ts ?? ts)),
      ok: result.ok === true, code: result.code || d.code || 'UNKNOWN', context: start?.context || getContext(bot),
      contextAtStart: !!start, ...(start?.batchId ? {batchId:start.batchId}:{}), result }
    try {
      fs.mkdirSync(path.dirname(statsFile), {recursive:true}); fs.mkdirSync(path.dirname(aggFile), {recursive:true})
      rotate(statsFile); fs.appendFileSync(statsFile, JSON.stringify(entry) + '\n'); updateAgg(entry, aggFile)
    } catch (e) { console.warn('[stats] gagal mencatat: ' + e.message) }
    if (opts.onEntry) opts.onEntry(entry)
  }
  engine.on('event', listener)
  return { close: () => engine.off && engine.off('event', listener), statsFile, aggFile }
}

module.exports = { attach, getContext, rotate, updateAgg, timeBucket, TIME_BUCKETS, MAX_FILE_BYTES }
