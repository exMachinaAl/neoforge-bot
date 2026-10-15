#!/usr/bin/env node
// lifecycle/replay.js - CLI untuk memutar ulang dan mengevaluasi tasks.log
// Penggunaan: node lifecycle/replay.js tasks.log [--batchId X] [--window 24h]
// Label: TERUJI TIRUAN

'use strict'

const fs = require('fs')
const path = require('path')
const { scoreBatch } = require('./scorer')

function parseArgs (argv) {
  const args = argv.slice(2)
  const opts = { logFile: null, batchId: null, window: null }
  let i = 0
  while (i < args.length) {
    if (args[i] === '--batchId' && args[i + 1]) {
      opts.batchId = args[i + 1]; i += 2
    } else if (args[i] === '--window' && args[i + 1]) {
      opts.window = args[i + 1]; i += 2
    } else if (!args[i].startsWith('--')) {
      opts.logFile = args[i]; i++
    } else {
      i++
    }
  }
  return opts
}

/**
 * Parse window string seperti "24h", "7d", "30m" ke milliseconds.
 * @param {string} w
 * @returns {number|null}
 */
function parseWindow (w) {
  if (!w) return null
  const m = String(w).match(/^(\d+)(h|d|m)$/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  const unit = m[2]
  if (unit === 'h') return n * 60 * 60 * 1000
  if (unit === 'd') return n * 24 * 60 * 60 * 1000
  if (unit === 'm') return n * 60 * 1000
  return null
}

/**
 * Baca file JSONL dan kembalikan array objek.
 * Baris yang tidak bisa di-parse diabaikan.
 * @param {string} filePath
 * @returns {Array<object>}
 */
function readJsonl (filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n')
  const result = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      result.push(JSON.parse(trimmed))
    } catch (_) {
      // Abaikan baris rusak
    }
  }
  return result
}

/**
 * Cetak tabel skor ke console.
 * @param {Array<{batchId: string, score: object}>} rows
 */
function printTable (rows) {
  if (rows.length === 0) {
    console.log('(Tidak ada batch ditemukan)')
    return
  }

  const header = 'batchId                          | total  | completion | safety | n_tasks | ok/total'
  const sep    = '---------------------------------+--------+------------+--------+---------+---------'
  console.log(header)
  console.log(sep)
  for (const row of rows) {
    const s = row.score
    const batchId = String(row.batchId).padEnd(32)
    const total      = String(s.total !== null ? s.total : '-').padStart(6)
    const completion = String(s.components.completion !== null ? s.components.completion : '-').padStart(10)
    const safety     = String(s.components.safety !== null ? s.components.safety : '-').padStart(6)
    const n          = String(s.n_tasks).padStart(7)
    const okTotal    = (s.ok + '/' + s.n_tasks).padStart(8)
    console.log(`${batchId} | ${total} | ${completion} | ${safety} | ${n} | ${okTotal}`)
  }
}

function main () {
  const opts = parseArgs(process.argv)

  if (!opts.logFile) {
    console.log('Penggunaan: node lifecycle/replay.js <tasks.log> [--batchId X] [--window 24h|7d|30m]')
    process.exit(0)
  }

  const logPath = path.resolve(opts.logFile)

  if (!fs.existsSync(logPath)) {
    console.log('File tidak ditemukan: ' + logPath)
    console.log('Jalankan bot dulu agar tasks.log terbentuk.')
    process.exit(0)
  }

  let entries = readJsonl(logPath)

  // Filter berdasarkan window waktu
  const windowMs = parseWindow(opts.window)
  if (windowMs !== null) {
    const cutoff = Date.now() - windowMs
    entries = entries.filter(e => e && typeof e.ts === 'number' && e.ts >= cutoff)
  }

  // Kelompokkan per batchId
  const groups = {}
  for (const e of entries) {
    // Dukung batchId di level root atau di dalam params/result
    const batchId = e.batchId ||
      (e.params && e.params.batchId) ||
      (e.result && e.result.batchId) ||
      '__default__'

    // Filter batchId bila diminta
    if (opts.batchId && batchId !== opts.batchId) continue

    if (!groups[batchId]) groups[batchId] = []
    groups[batchId].push(e)
  }

  const rows = []
  for (const [batchId, bEntries] of Object.entries(groups)) {
    const score = scoreBatch(bEntries)
    rows.push({ batchId, score })
  }

  // Urutkan: __default__ di akhir, lainnya alfabetis
  rows.sort((a, b) => {
    if (a.batchId === '__default__') return 1
    if (b.batchId === '__default__') return -1
    return a.batchId.localeCompare(b.batchId)
  })

  if (opts.window) console.log('Filter window: ' + opts.window + ' (sejak ' + new Date(Date.now() - windowMs).toISOString() + ')')
  if (opts.batchId) console.log('Filter batchId: ' + opts.batchId)
  console.log('Total entri: ' + entries.length + ', batch: ' + rows.length)
  console.log('')
  printTable(rows)
}

main()
