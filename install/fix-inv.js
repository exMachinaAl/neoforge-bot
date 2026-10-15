// Pemasangan paket v2.2 (inventory): edit file lama dengan anchor (aman diulang) + catatan dokumen.
// File baru (skills/_snbt.js, _names.js, _inv.js, inv.*.js, tests/inv.test.js) datang dari zip.
const fs = require('fs')
let failed = 0
function edit (file, anchor, replacement, done) {
  if (!fs.existsSync(file)) { console.log(file + ': TIDAK ADA'); failed++; return }
  const s = fs.readFileSync(file, 'utf8')
  if (s.includes(done)) return console.log(file + ': sudah ter-fix')
  if (!s.includes(anchor)) { console.log(file + ': ANCHOR TIDAK DITEMUKAN (file berbeda dari yang diuji); tidak diubah'); failed++; return }
  fs.writeFileSync(file, s.replace(anchor, replacement))
  console.log(file + ': diperbarui')
}
function append (file, marker, text) {
  if (!fs.existsSync(file)) return console.log(file + ': tidak ada, dilewati')
  const s = fs.readFileSync(file, 'utf8')
  if (s.includes(marker)) return console.log(file + ': sudah ter-update')
  fs.writeFileSync(file, s.replace(/\n*$/, '\n') + text)
  console.log(file + ': diperbarui')
}

edit('skills/_util.js',
  "const itemKey = i => i.name === 'unknown' || !i.name ? 'unknown#' + i.type : i.name",
  "// nama item modded: dari registri sinkronisasi / hasil snapshot bila ada ('ns:path'), kalau tidak 'unknown#<id>'\nconst itemKey = i => { if (i.name && i.name !== 'unknown') return i.name; const n = require('./_names').nameOf(i.type); return n || 'unknown#' + i.type }",
  "require('./_names').nameOf(i.type)")

const ENGINE_NEW = "    if (bot.inventory) {\n      const T = bot.arcadia && bot.arcadia.inventoryTruth\n      const fresh = !!(T && T.accurate && Date.now() - T.ts < 30000) // snapshot segar (<30 dtk): daftar = kebenaran server\n      const shortName = id => String(id).replace(/^minecraft:/, '')\n      st.inventory = fresh\n        ? { items: T.items.map(i => ({ name: shortName(i.id), count: i.count, slot: i.slot })), source: 'snbt', accurate: true }\n        : { items: bot.inventory.items().map(i => ({ name: require('../skills/_util').itemKey(i), count: i.count, slot: i.slot })), source: 'protocol', accurate: false }\n    }"
const ENGINE_ORIG = "    if (bot.inventory) st.inventory = { items: bot.inventory.items().map(i => ({ name: i.name === 'unknown' || !i.name ? 'unknown#' + i.type : i.name, count: i.count, slot: i.slot })), source: 'protocol', accurate: false }"
const ENGINE_V22 = "    if (bot.inventory) {\n      const T = bot.arcadia && bot.arcadia.inventoryTruth\n      const fresh = !!(T && T.accurate && Date.now() - T.ts < 30000) // snapshot cocok dan masih segar (<30 dtk)\n      st.inventory = { items: bot.inventory.items().map(i => ({ name: require('../skills/_util').itemKey(i), count: i.count, slot: i.slot })), source: fresh ? 'snbt' : 'protocol', accurate: fresh }\n    }"
{
  const f = 'engine/index.js'
  const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''
  if (cur.includes('shortName(i.id)')) console.log(f + ': sudah ter-fix')
  else if (cur.includes(ENGINE_V22)) edit(f, ENGINE_V22, ENGINE_NEW, 'shortName(i.id)')
  else edit(f, ENGINE_ORIG, ENGINE_NEW, 'shortName(i.id)')
}

edit('bot.js',
  "const showChannels = require('./sniff')(client)",
  "// nama item modded dari registri sinkronisasi (unknown#<id> -> ns:path)\nclient.on('neoforgeRegistry', r => { if (r.name === 'minecraft:item') console.log('ITEM NAMES: ' + require('./skills/_names').load(r.ids) + ' id dimuat dari registri sinkronisasi') })\n\nconst showChannels = require('./sniff')(client)",
  'ITEM NAMES')

{
  const f = 'package.json'
  const NEW = '"test": "node tests/skills.test.js && node tests/engine.test.js && node tests/inv.test.js && node tests/craft.test.js && node tests/breed.test.js"'
  const OLD2 = '"test": "node tests/skills.test.js && node tests/engine.test.js && node tests/inv.test.js"'
  const ORIG = '"test": "node tests/skills.test.js && node tests/engine.test.js"'
  const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''
  if (cur.includes(NEW)) console.log(f + ': sudah ter-fix')
  else if (cur.includes(OLD2)) edit(f, OLD2, NEW, NEW)
  else edit(f, ORIG, NEW, NEW)
}
{
  const f = 'tests/engine.test.js'
  const NEW = "ok(sk.length === 11 && ['inv.snapshot', 'inv.view', 'inv.store', 'inv.take', 'craft.item', 'breed.animals'].every(n => sk.some(s => s.name === n)) && sk.every(s => !validate('SkillManifest', s)), '/skills: 11 manifest valid kontrak (termasuk inv.*, craft.item, breed.animals)')"
  const V23 = "ok(sk.length === 9 && ['inv.snapshot', 'inv.view', 'inv.store', 'inv.take'].every(n => sk.some(s => s.name === n)) && sk.every(s => !validate('SkillManifest', s)), '/skills: 9 manifest valid kontrak (termasuk 4 skill inv.*)')"
  const ORIG = "ok(sk.length === 5 && sk.every(s => !validate('SkillManifest', s)), '/skills: 5 manifest valid kontrak')"
  const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''
  if (cur.includes('11 manifest valid kontrak')) console.log(f + ': sudah ter-fix')
  else if (cur.includes(V23)) edit(f, V23, NEW, '11 manifest valid kontrak')
  else edit(f, ORIG, NEW, '11 manifest valid kontrak')
}

// .gitignore: berkas snapshot lokal
if (fs.existsSync('.gitignore')) {
  let g = fs.readFileSync('.gitignore', 'utf8')
  const add = ['snapshot.json', 'snapshot_raw.txt'].filter(l => !g.split(/\r?\n/).includes(l))
  if (add.length) { fs.writeFileSync('.gitignore', g.replace(/\n*$/, '\n') + add.join('\n') + '\n'); console.log('.gitignore: +' + add.join(', ')) } else console.log('.gitignore: sudah ter-fix')
}

append('TODO.md', '## Pembaruan #7', `## Pembaruan #7 (inventory)
- [~] inv.snapshot: bandingkan bot.inventory dengan /data get entity <bot> Inventory (butuh op); belajar nama item modded; state.inventory jadi source=snbt/accurate=true bila snapshot cocok dan <30 dtk - TERUJI TIRUAN, BELUM DIUJI di server
- [~] inv.view / inv.store / inv.take: lihat, simpan, ambil dari chest dengan verifikasi /data get block Items; item modded dilewati kecuali includeModded - TERUJI TIRUAN, BELUM DIUJI di server
- [~] Nama item modded dari registri minecraft:item (log "ITEM NAMES: n id"); bila tidak muncul, nama dipelajari dari inv.snapshot (itemmap.json)
- [ ] Format keluaran /data get di server asli belum pernah dilihat: bila PROTOCOL_UNSUPPORTED, kirim snapshot_raw.txt
- [ ] View 3D (prismarine-viewer) untuk UI - BELUM dikerjakan, lihat catatan kelayakan
`)
append('docs/HANDOFF.md', '## 13. Pembaruan checkpoint #7', `## 13. Pembaruan checkpoint #7
- Skill baru: inv.snapshot, inv.view, inv.store, inv.take (+ pembantu skills/_snbt.js, _names.js, _inv.js; tes tests/inv.test.js, 58 kasus). Semuanya TERUJI TIRUAN, BELUM DIUJI di server.
- Kebenaran inventory/chest = /data get ... (bot harus op, gamerule sendCommandFeedback true). Jendela chest dan inventory protokol bisa tertinggal karena paket bermuatan komponen modded gagal parse.
- BotState.inventory: source=snbt, accurate=true hanya bila snapshot terakhir cocok dan berumur <30 dtk; selain itu protocol/false.
- Item modded: nama dari registri sinkronisasi (ITEM NAMES di log) atau hasil snapshot (itemmap.json). inv.store/inv.take melewati item modded kecuali includeModded=true (serialisasi komponen item belum terbukti).
`)
append('TODO.md', '## Pembaruan #8', `## Pembaruan #8 (inventory tahan banting, v2.3)
- [~] Jendela chest tak terbaca (window_items dibuang karena komponen item modded): openChest memantau open_window sendiri, lanjut mode degraded (isi dari /data get block, pindah lewat shift-click berbasis slot), SELALU menutup jendela (close_window mentah) - TERUJI TIRUAN, BELUM DIUJI di server
- [~] inv.store/inv.take: hasil dihitung dari isi chest di server (tidak lagi salah menilai gagal saat server lag); item vanilla yang tak terbaca bot ikut dipindah; item modded dengan includeModded=true dan bot op; inv.take item=all
- [~] inv.snapshot hydrate: item polos (tanpa komponen) yang dibawa sebelum spawn dipulihkan ke tampilan bot; state.inventory memakai daftar kebenaran server selama snapshot <30 dtk
- [ ] Item BERMUATAN komponen modded tetap tak terbaca bot (butuh skema SlotComponent: opsi 2)
- [ ] craft.item dan breed.animals belum dikerjakan (craft memakai jendela yang sama; 2x2 lewat inventory tidak butuh jendela chest)
`)
append('docs/HANDOFF.md', '## 14. Pembaruan checkpoint #8', `## 14. Pembaruan checkpoint #8
- Akar masalah inv.view/take "chest tidak terbuka": mineflayer baru memancarkan windowOpen setelah window_items diparse, dan paket itu memuat isi chest + seluruh inventory pemain; satu item bermuatan komponen modded -> paket dibuang -> openContainer menggantung dan jendela tertinggal terbuka di server. Perbaikan: skills/_inv.js openChest (mode degraded, ensureClosed, reset saat respawn).
- Akar masalah "snapshot hanya membaca item setelah spawn": window_items(0) saat join dibuang utuh bila satu item bermuatan komponen modded -> semua item yang sudah dibawa tak terbaca. snapshot hydrate memulihkan item polos; item bermuatan komponen tetap tak terbaca.
- Akar masalah inv.store "gagal padahal item vanilla terpindah": hasil dihitung dari inventory bot 150 ms setelah deposit sementara konfirmasi server lambat saat server lag. Kini dihitung dari isi chest di server (/data get block) bila bot op, atau menunggu stabil (settle).
- deposit(type) menolak item modded ("Invalid itemType"); item modded dipindah lewat window_click mode 1 (shift-click) per nomor slot: server menerapkan klik walau stateId tidak cocok (dugaan dari kode vanilla; BELUM DIUJI di server).
- Variabel lingkungan uji: ARCADIA_OPEN_MS, ARCADIA_OPEN_GRACE_MS (batas tunggu open_window), ARCADIA_DATA_DIR.
`)
append('TODO.md', '## Pembaruan #9', `## Pembaruan #9 (v2.4: crafting, breeding, catatan inventory)
- [~] craft.item: resep 2x2 lewat inventory (tanpa jendela chest), resep meja lewat meja crafting terdekat/koordinat; jendela meja yang tak terbaca (degraded) ditolak jelas; bahan diperiksa lewat sinkron server (butuh op) - TERUJI TIRUAN, BELUM DIUJI di server
- [~] breed.animals: cow/sheep/goat/mooshroom/pig/chicken/horse/donkey/llama/rabbit/fox; anak lahir diukur dari event entitySpawn (bukan metadata); cooldown 5 menit disimpan di memori proses - TERUJI TIRUAN. Deteksi anak lewat metadata[16] (AgeableMob) BELUM DIUJI
- [~] Catatan inventory (BotState) disamakan dengan server setelah inv.store/inv.take/craft.item/breed.animals (reconcile: pulihkan item polos, hapus item hantu, koreksi jumlah)
- [ ] ChestBook (inventory eksternal): catat isi tiap chest per koordinat (item, jumlah, waktu lihat) ke chests.json agar Director bisa memutuskan "ambil dari chest X"; data sudah tersedia dari inv.view/store/take, tinggal dicatat
- [ ] Perintah guard: jaga pos (x,y,z) dalam radius R; serang mob hostile yang masuk radius, kembali ke pos; berhenti saat HP rendah; parameter pos/radius/mode dari UI dan chat
- [ ] Perintah follow-as-guard: ikuti pemain pemilik, jaga jarak, lindungi dari mob (memakai logika guard di sekitar pemilik), makan/istirahat sesuai kebutuhan; tiap petualangan bersama menaikkan affection persona
- [ ] Persona: nilai affection (disimpan JSON), dipengaruhi follow-as-guard, hadiah item, waktu bersama; mempengaruhi bobot Director (kontrak Persona.traits sudah ada)
- [ ] Perintah di dalam game: pemilik mengetik "!bot guard/follow/stop/craft ..." di chat -> masuk antrean engine (hanya dari pemain yang diizinkan)
- [ ] WebUI: tombol cepat guard/follow/stop, kartu Inventory (akurat/tidak, tombol Snapshot), kartu chest, form craft/breed; peta 2D lalu opsional viewer 3D
- [ ] craft: menaruh meja crafting bila tidak ada, tungku (smelting), resep dengan bahan modded
- [ ] breeding: deteksi mode cinta/anak yang lebih tepat, penyimpanan cooldown antar restart
- [ ] Mekanik hidup (Director non-LLM + cyclebook JSON + persona + plugin planner LLM) setelah fungsi vanilla lengkap
- [ ] Skema SlotComponent untuk komponen item modded (opsi 2) agar item bermuatan komponen terbaca penuh
`)
append('docs/HANDOFF.md', '## 15. Pembaruan checkpoint #9', `## 15. Pembaruan checkpoint #9
- Skill baru: craft.item dan breed.animals (skills/craft.item.js, skills/breed.animals.js; tes tests/craft.test.js 26 kasus, tests/breed.test.js 25 kasus; mock bersama tests/invmock.js). Total tes: 45 + 29 + 91 + 26 + 25. Semua TERUJI TIRUAN, BELUM DIUJI di server.
- craft.item memakai Recipe.find (prismarine-recipe) dan bot.craft mineflayer. Resep 2x2 tidak membuka jendela apa pun (aman walau inventory berisi item bermuatan komponen modded); resep meja membuka jendela lewat I.openWindowAt dan menolak bila mode degraded.
- breed.animals: pendengar entitySpawn dipasang SEBELUM memberi makan (anak bisa lahir saat hewan kedua masih diberi makan; sebelumnya race). Deteksi dewasa lewat metadata[16] (AgeableMob.DATA_BABY_ID, 1.21.x) BELUM DIUJI.
- Catatan inventory: I.reconcile / I.refreshInventory menyamakan tampilan bot dengan /data get entity (butuh op) lalu memperbarui bot.arcadia.inventoryTruth; dipanggil di akhir inv.store, inv.take, craft.item, breed.animals (kecuali verify/refresh=false).
- Cara menyerahkan kode: paket .zip + skrip pemasangan beranchor (install/fix-inv.js) yang aman diulang dan diuji pada klon bersih; salin-tempel EOF hanya untuk perubahan satu file kecil.
`)
console.log(failed ? '\n' + failed + ' MASALAH: lihat pesan di atas' : '\nSELESAI. Jalankan: npm test && npm run check')
process.exit(failed ? 1 : 0)
