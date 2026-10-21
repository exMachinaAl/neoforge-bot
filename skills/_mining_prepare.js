// Bootstrap terbatas: resep versi bot, bukan resep/urutan karangan LLM.
// Tetap satu task runner: signal/guard/batas waktu induk berlaku ke semua langkah.
const U = require('./_util')
const craft = require('./craft.item')

function planPickaxe (bot, md, maxDistance) {
  const Recipe = require('prismarine-recipe')(bot.registry).Recipe
  const have = name => bot.inventory.count(md.itemsByName[name].id, null)
  const recipes = name => Recipe.find(md.itemsByName[name].id, null)
  const ingredients = r => r.delta.filter(d => d.count < 0)
  const tableNearby = craft.findTable(bot, md).block
  const needTable = !tableNearby && !have('crafting_table')
  const choices = []
  // Pilih satu jenis papan yang dapat dibuat dari log; bahan yang sudah ada diutamakan.
  for (const pick of recipes('wooden_pickaxe')) {
    const needs = ingredients(pick)
    const plank = needs.find(d => md.items[d.id]?.name.endsWith('_planks'))
    const stick = needs.find(d => md.items[d.id]?.name === 'stick')
    if (!plank || !stick || needs.length !== 2) continue
    const plankName = md.items[plank.id].name
    const stickRecipe = recipes('stick').find(r => ingredients(r).length === 1 && ingredients(r)[0].id === plank.id)
    const tableRecipe = recipes('crafting_table').find(r => ingredients(r).length === 1 && ingredients(r)[0].id === plank.id)
    if (!stickRecipe || !tableRecipe) continue
    const missingSticks = Math.max(0, -stick.count - have('stick'))
    const stickOps = Math.ceil(missingSticks / stickRecipe.result.count)
    const plankNeed = -plank.count - ingredients(stickRecipe)[0].count * stickOps -
      (needTable ? ingredients(tableRecipe)[0].count : 0)
    const missingPlanks = Math.max(0, plankNeed - have(plankName))
    for (const planks of recipes(plankName)) {
      const input = ingredients(planks)
      const log = input.length === 1 && md.items[input[0].id]
      const block = log && md.blocksByName[log.name]
      if (!block || !/_log$/.test(log.name) || block.harvestTools) continue
      const logNeed = Math.ceil(missingPlanks / planks.result.count) * -input[0].count
      const gather = Math.max(0, logNeed - have(log.name))
      const nearby = gather && bot.findBlock({ matching: block.id, maxDistance,
        useExtraInfo: b => require('./mine.collect').safeTarget(bot, b) })
      if (gather && !nearby) continue
      const steps = []
      if (gather) steps.push({ skill: 'mine.collect', params: { block: log.name, count: gather, prepare: false } })
      if (missingPlanks) steps.push({ skill: 'craft.item', params: { item: plankName, count: missingPlanks, table: false } })
      if (missingSticks) steps.push({ skill: 'craft.item', params: { item: 'stick', count: missingSticks, table: false } })
      if (needTable) steps.push({ skill: 'craft.item', params: { item: 'crafting_table', count: 1, table: false } })
      steps.push({ skill: 'craft.item', params: { item: 'wooden_pickaxe', count: 1, autoPlace: true } })
      choices.push({ steps, cost: gather * 1000 + logNeed * 10 + (nearby ? nearby.position.distanceTo(bot.entity.position) : 0) })
    }
  }
  return choices.sort((a, b) => a.cost - b.cost)[0]?.steps || null
}

async function prepare (bot, p, ctx, needs) {
  const history = []
  const failure = error => ({ ok: false, code: 'PRECONDITION_FAILED', error,
    data: { requiredTools: needs, preparation: history } })
  // Jangan mencoba menambang tier lebih tinggi dengan wooden_pickaxe.
  if (!needs.includes('wooden_pickaxe')) return failure('alat belum ada: ' + needs.join('/') + '; persiapan otomatis saat ini hanya wooden_pickaxe')
  const deny = String(process.env.ARCADIA_DIRECTOR_DENY || '').split(',').map(s => s.trim())
  if (deny.includes('craft.item')) return failure('persiapan wooden_pickaxe memerlukan craft.item yang diblokir kebijakan')
  const steps = planPickaxe(bot, ctx.mcData, p.maxDistance || 32)
  if (!steps) return failure('wooden_pickaxe belum ada; bahan papan/log yang cocok tidak tersedia di inventory atau radius pencarian')
  for (const step of steps) {
    if (ctx.signal.aborted) return { ok: false, code: 'ABORTED', data: { preparation: history } }
    if (p.guard !== false) {
      const stop = await U.guard(bot, ctx, { minHealth: p.minHealth })
      if (stop) return { ...stop, data: { preparation: history } }
    }
    ctx.progress?.({ label: 'Persiapan: ' + (step.params.item || step.params.block),
      data: { phase: 'preparation', step: history.length + 1, total: steps.length } })
    const params = { maxDistance: p.maxDistance, dig: p.dig, guard: p.guard, minHealth: p.minHealth,
      ...step.params, refresh: false }
    const out = await (step.skill === 'mine.collect' ? require('./mine.collect') : craft).run(bot, params, ctx)
    history.push({ skill: step.skill, params: step.params, code: out.code, data: out.data })
    // craft.item dapat sukses parsial; dependency berikutnya tidak boleh diteruskan.
    if (!out.ok || out.data?.partial) return { ok: false, code: out.ok ? 'PRECONDITION_FAILED' : out.code,
      error: 'Persiapan ' + (step.params.item || step.params.block) + ': ' + (out.error || 'hasil belum mencukupi'),
      data: { preparation: history, requiredTools: needs } }
  }
  return { ok: true, data: { preparation: history } }
}

module.exports = { planPickaxe, prepare }
