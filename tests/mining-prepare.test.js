const test = require('node:test')
const assert = require('node:assert/strict')
const { mkInv } = require('./invmock')
const { mkBlock, mcData: md } = require('./mock')
const { createRunner } = require('../skills')
const craft = require('../skills/craft.item')
const { planPickaxe } = require('../skills/_mining_prepare')

// Dunia/protokol tiruan, registry dan delta resep Minecraft 1.21.1 asli.
function world (inventory = {}, opts = {}) {
  const inv = Object.fromEntries(Object.entries(inventory).map(([name, count], i) => [9 + i, [name, count]]))
  const blocks = [mkBlock('stone', 10, 64, 0)]
  if (opts.logs !== false) for (let x = 2; x <= 4; x++) blocks.push(mkBlock(opts.log || 'oak_log', x, 64, 2))
  if (opts.table) blocks.push(mkBlock('crafting_table', 6, 64, 0))
  const b = mkInv({ inv, blocks })
  const at = b.blockAt
  b.blockAt = pos => at(pos) || (opts.noSpace ? null : mkBlock(pos.y === 63 ? 'dirt' : 'air', pos.x, pos.y, pos.z))
  const change = (name, delta) => {
    const id = md.itemsByName[name].id
    assert.ok(delta >= 0 || b.inventory.count(id) >= -delta, 'bahan cukup: ' + name)
    const current = b.inventory.items().find(i => i.name === name)
    if (current) {
      const n = current.count + delta
      if (n) b.put(current.slot, name, n)
      else { b.inventory.slots[current.slot] = null; b._srvInv[current.slot] = null }
    } else if (delta > 0) {
      const slot = b.inventory.slots.findIndex((v, i) => i >= 9 && i <= 44 && !v)
      assert.ok(slot >= 9)
      b.put(slot, name, delta)
    }
  }
  b._give = change
  b.crafted = []
  b.craft = async (recipe, count, table) => {
    assert.ok(!recipe.requiresTable || table?.name === 'crafting_table')
    const name = md.items[recipe.result.id].name
    if (opts.failCraft === name) throw Error('craft ditolak server tiruan')
    for (const d of recipe.delta) change(md.items[d.id].name, d.count * count)
    b.crafted.push(name)
  }
  b.placed = 0
  b.placeBlock = async (ref, face) => {
    b.placed++
    if (opts.rejectPlace) throw Error('area dilindungi')
    const pos = ref.position.plus(face)
    assert.equal(b.blockAt(pos).name, 'air')
    blocks.push(mkBlock('crafting_table', pos.x, pos.y, pos.z))
    change('crafting_table', -1)
  }
  return b
}

test('namespace vanilla diterima, namespace mod dan override drop asing ditolak', async () => {
  const b = world({ wooden_pickaxe: 1 })
  const runner = createRunner(b)
  let out = await runner.run('mine.collect', { block: 'minecraft:stone', item: 'minecraft:cobblestone', count: 1 })
  assert.equal(out.ok, true); assert.equal(out.data.collected, 1)
  assert.deepEqual(out.data.preparation, [])
  out = await runner.run('mine.collect', { block: 'mod:stone' })
  assert.equal(out.code, 'PRECONDITION_FAILED')
  out = await runner.run('mine.collect', { block: 'stone', item: 'mod:rock' })
  assert.match(out.error, /item hasil tidak dikenal/)
})

test('tangan kosong -> log -> papan -> stick -> meja terpasang -> pickaxe -> cobblestone', async () => {
  const b = world()
  const runner = createRunner(b), progress = []
  runner.events.on('task.progress', p => progress.push(p))
  const out = await runner.run('mine.collect', { block: 'minecraft:stone', count: 1 })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(b.crafted, ['oak_planks', 'stick', 'crafting_table', 'wooden_pickaxe'])
  assert.equal(b.placed, 1)
  assert.equal(b.inventory.count(md.itemsByName.wooden_pickaxe.id), 1)
  assert.equal(b.inventory.count(md.itemsByName.cobblestone.id), 1)
  assert.equal(out.data.preparation.length, 5)
  assert.equal(out.data.preparation[0].params.count, 3)
  assert.ok(progress.some(p => p.data.phase === 'preparation'))
  assert.equal(b.sent?.length || 0, 0, 'tidak membutuhkan /give atau /data OP')
})

test('gunakan birch di sekitar; inventory dan meja yang ada mengurangi dependency', async () => {
  const b = world({}, { log: 'birch_log' })
  assert.equal(planPickaxe(b, md, 32)[0].params.block, 'birch_log')
  const ready = world({ birch_planks: 3, stick: 2 }, { table: true, logs: false })
  const out = await createRunner(ready).run('mine.collect', { block: 'stone', count: 1 })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(ready.crafted, ['wooden_pickaxe'])
  assert.equal(ready.placed, 0)
  assert.equal(out.data.preparation.length, 1)
})

test('log di inventory dipakai tanpa mencari pohon; meja bawaan dipasang', async () => {
  const b = world({ spruce_log: 2, crafting_table: 1 }, { logs: false })
  const out = await createRunner(b).run('mine.collect', { block: 'stone', count: 1 })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(b.crafted, ['spruce_planks', 'stick', 'wooden_pickaxe'])
  assert.deepEqual(b.dug, ['stone'])
  assert.equal(b.placed, 1)
})

test('pilih resep stick yang cukup, meskipun resep bamboo parsial tersedia lebih awal', async () => {
  const b = world({ bamboo: 2, oak_log: 3 }, { logs: false })
  const out = await createRunner(b).run('mine.collect', { block: 'stone', count: 1 })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(b.inventory.count(md.itemsByName.wooden_pickaxe.id), 1)
  assert.equal(b.inventory.count(md.itemsByName.bamboo.id), 2)
})

test('bahan kurang, prepare=false, dan alat tier tinggi berhenti sebelum menggali', async () => {
  for (const [params, options] of [[{}, { logs: false }], [{ prepare: false }, {}]]) {
    const b = world({}, options)
    const out = await createRunner(b).run('mine.collect', { block: 'stone', count: 1, ...params })
    assert.equal(out.code, 'PRECONDITION_FAILED')
    assert.match(out.error, /wooden_pickaxe/)
    assert.deepEqual(b.dug, [])
  }
  const b = world()
  b._blocks.push(mkBlock('diamond_ore', 12, 64, 0))
  const out = await createRunner(b).run('mine.collect', { block: 'diamond_ore', count: 1 })
  assert.equal(out.code, 'PRECONDITION_FAILED')
  assert.ok(out.data.requiredTools.includes('iron_pickaxe'))
  assert.deepEqual(b.dug, [])
})

test('craft gagal atau pemasangan ditolak tidak melanjutkan mining tujuan', async () => {
  for (const opts of [{ failCraft: 'stick' }, { rejectPlace: true }, { noSpace: true }]) {
    const b = world({ oak_log: 3 }, { ...opts, logs: false })
    const out = await createRunner(b).run('mine.collect', { block: 'stone', count: 1 })
    assert.equal(out.ok, false, JSON.stringify(out))
    assert.deepEqual(b.dug, [])
    assert.ok(out.data.preparation.length)
  }
})

test('abort saat persiapan dan HP rendah menghentikan dependency berikutnya', async () => {
  const b = world({ oak_log: 3 }, { logs: false })
  const runner = createRunner(b)
  const original = b.craft
  b.craft = async (...args) => { await original(...args); b.emit('death') }
  const out = await runner.run('mine.collect', { block: 'stone', count: 1 })
  assert.equal(out.code, 'DIED')
  assert.deepEqual(b.crafted, ['oak_planks'])
  assert.deepEqual(b.dug, [])
  const weak = world()
  weak.health = 4
  const stopped = await createRunner(weak).run('mine.collect', { block: 'stone', count: 1 })
  assert.equal(stopped.code, 'INTERRUPTED'); assert.deepEqual(weak.dug, [])
})

test('meja: autoPlace=false/koordinat eksplisit tidak memasang; abort dan konfirmasi wajib', async () => {
  for (const params of [{ autoPlace: false }, { autoPlace: 'false' }, { table: { x: 20, y: 64, z: 0 } }]) {
    const b = world({ oak_planks: 3, stick: 2, crafting_table: 1 })
    const out = await createRunner(b).run('craft.item', { item: 'wooden_pickaxe', refresh: false, ...params })
    assert.equal(out.ok, false); assert.equal(b.placed, 0)
  }
  const b = world({ crafting_table: 1 })
  let out = await craft.placeTable(b, md, { signal: AbortSignal.abort() })
  assert.equal(out.code, 'ABORTED'); assert.equal(b.placed, 0)
  b.placeBlock = async () => {}
  out = await craft.placeTable(b, md, { signal: new AbortController().signal })
  assert.equal(out.code, 'SERVER_REJECTED')
})

test('Director tetap melihat alat meski inventory berisi lebih dari 15 jenis item', async () => {
  const { createDirector } = require('../orchestrator/director')
  const items = Array.from({ length: 18 }, (_, i) => ({ name: 'bahan_' + i, count: 64 }))
  items.push({ name: 'iron_pickaxe', count: 1 })
  const director = createDirector({ bot: { game: {} }, runner: { skills: {} },
    cfg: { key: '', rpm: 3 }, auditFile: 'off',
    engine: { state: () => ({ inventory: { items } }), list: () => ({ queue: [], history: [] }) } })
  const prompt = await director.ask('tambang batu', { dry: true })
  assert.match(prompt.user, /iron_pickaxex1/)
  assert.match(prompt.system, /stone ditambang biasa menghasilkan cobblestone/)
})
