const fs = require('fs')
const file = require.resolve('protodef/src/serializer.js')
const src = fs.readFileSync(file, 'utf8')
const i = src.indexOf('class FullPacketParser')
if (i < 0) throw new Error('FullPacketParser tidak ditemukan')
const head = src.slice(0, i), tail = src.slice(i)
if (tail.includes('SKIP paket gagal')) { console.log('sudah ter-patch'); process.exit(0) }
if (!tail.includes('return cb(e)')) throw new Error('anchor tidak ditemukan')
fs.writeFileSync(file, head + tail.replace('return cb(e)',
  "{ console.log('SKIP paket gagal:', String(e.message).slice(0, 90)); return cb() }"))
console.log('patched')
