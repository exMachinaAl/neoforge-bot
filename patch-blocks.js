// patch-blocks.js: blok modded (state id tak dikenal minecraft-data) dianggap kubus PADAT, bukan udara.
// Pengecualian: unknownblocks.json {"empty":[stateId,...]}. A/B uji: ARCADIA_UNKNOWN_EMPTY=1 npm start -> perilaku lama.
const fs = require('fs')
const file = require.resolve('prismarine-block/index.js')
let s = fs.readFileSync(file, 'utf8')
const a1 = 'function loader (registryOrVersion) {'
const old = "this.shapes = []\n        this.hardness = 0\n        this.boundingBox = 'empty'\n        this.transparent = true\n        this.diggable = false"
const helper = "// PATCH-UNKNOWN-SOLID\nconst __unknownEmpty = (() => { try { return new Set(JSON.parse(require('fs').readFileSync(require('path').join(process.cwd(), 'unknownblocks.json'), 'utf8')).empty || []) } catch (e) { return new Set() } })()\n\n"
const neu = "const solid = typeof this.stateId === 'number' && process.env.ARCADIA_UNKNOWN_EMPTY !== '1' && !__unknownEmpty.has(this.stateId)\n        this.shapes = solid ? [[0, 0, 0, 1, 1, 1]] : []\n        this.hardness = 0\n        this.boundingBox = solid ? 'block' : 'empty'\n        this.transparent = !solid\n        this.diggable = false"
if (s.includes('ARCADIA_UNKNOWN_EMPTY')) { console.log('sudah ter-patch (v2)'); process.exit(0) }
if (s.includes('PATCH-UNKNOWN-SOLID')) {
  const v1 = "const solid = typeof this.stateId === 'number' && !__unknownEmpty.has(this.stateId)"
  if (!s.includes(v1)) throw new Error('v1 terdeteksi tapi anchor berbeda')
  fs.writeFileSync(file, s.replace(v1, "const solid = typeof this.stateId === 'number' && process.env.ARCADIA_UNKNOWN_EMPTY !== '1' && !__unknownEmpty.has(this.stateId)"))
  console.log('di-upgrade ke v2'); process.exit(0)
}
if (!s.includes(a1) || !s.includes(old)) throw new Error('anchor tidak ditemukan (versi prismarine-block berubah?)')
fs.writeFileSync(file, s.replace(a1, helper + a1).replace(old, neu))
console.log('patched (v2)')
