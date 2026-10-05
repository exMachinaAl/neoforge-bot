// patch-blocks.js: blok modded (state id tak dikenal minecraft-data) dianggap kubus PADAT, bukan udara.
// Tanpa ini physics bot menembus blok modded sementara server menganggapnya padat (rubber-band).
// Pengecualian: unknownblocks.json {"empty":[stateId,...]} = state id yang boleh dilewati (tanaman, rel, dll).
const fs = require('fs')
const file = require.resolve('prismarine-block/index.js')
let s = fs.readFileSync(file, 'utf8')
if (s.includes('PATCH-UNKNOWN-SOLID')) { console.log('sudah ter-patch'); process.exit(0) }
const a1 = 'function loader (registryOrVersion) {'
const old = "this.shapes = []\n        this.hardness = 0\n        this.boundingBox = 'empty'\n        this.transparent = true\n        this.diggable = false"
if (!s.includes(a1) || !s.includes(old)) throw new Error('anchor tidak ditemukan (versi prismarine-block berubah?)')
const helper = "// PATCH-UNKNOWN-SOLID\nconst __unknownEmpty = (() => { try { return new Set(JSON.parse(require('fs').readFileSync(require('path').join(process.cwd(), 'unknownblocks.json'), 'utf8')).empty || []) } catch (e) { return new Set() } })()\n\n"
const neu = "const solid = typeof this.stateId === 'number' && !__unknownEmpty.has(this.stateId)\n        this.shapes = solid ? [[0, 0, 0, 1, 1, 1]] : []\n        this.hardness = 0\n        this.boundingBox = solid ? 'block' : 'empty'\n        this.transparent = !solid\n        this.diggable = false"
s = s.replace(a1, helper + a1).replace(old, neu)
fs.writeFileSync(file, s)
console.log('patched')
