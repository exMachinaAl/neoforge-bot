#!/usr/bin/env node
// lifecycle/dry.js - CLI mode kering untuk simulasi dan audit pemilihan batch
const { sampleBatch, loadTemplates } = require('./sampler')
const { load: loadPersona } = require('./persona')

function parseArgs () {
  const args = process.argv.slice(2)
  const opts = {
    seed: null,
    botId: 'BotAlpha',
    hp: 20,
    timeOfDay: 'day',
    dimension: 'overworld',
    weather: 'clear',
    threatCount: 0
  }

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--seed' && args[i + 1]) opts.seed = args[++i]
    else if (a === '--botId' && args[i + 1]) opts.botId = args[++i]
    else if (a === '--hp' && args[i + 1]) opts.hp = Number(args[++i])
    else if (a === '--time' && args[i + 1]) opts.timeOfDay = args[++i]
    else if (a === '--dimension' && args[i + 1]) opts.dimension = args[++i]
    else if (a === '--weather' && args[i + 1]) opts.weather = args[++i]
    else if (a === '--threats' && args[i + 1]) opts.threatCount = Number(args[++i])
  }
  return opts
}

const opts = parseArgs()
const persona = loadPersona(opts.botId)
const context = {
  hp: opts.hp,
  timeOfDay: opts.timeOfDay,
  dimension: opts.dimension,
  weather: opts.weather,
  threatCount: opts.threatCount
}

console.log('=== ARCADIA LIFECYCLE: DRY RUN BATCH SAMPLER ===')
console.log('Persona   : ' + persona.name + ' (' + opts.botId + ')')
console.log('Traits    : ' + JSON.stringify(persona.traits))
console.log('Needs     : ' + JSON.stringify(persona.needs))
console.log('Konteks   : ' + JSON.stringify(context))
console.log('------------------------------------------------')

const batch = sampleBatch(context, persona, { seed: opts.seed })

console.log('Batch ID  : ' + batch.batchId)
console.log('Judul     : ' + (batch.title || '(tanpa judul)'))
console.log('Kategori  : ' + batch.category)
console.log('Skor pilih: ' + (batch.selectionScore ?? '(tidak ada)'))
console.log('Faktor    : ' + JSON.stringify(batch.selectionFactors || {}))
console.log('Status    : ' + batch.mode)
console.log('Biji      : ' + batch.seed)
console.log('Template  : ' + (batch.chosenTemplate || '(tidak ada)'))
console.log('Tasks     : ' + (batch.tasks.length ? batch.tasks.join(', ') : 'KOSONG'))
if (batch.taskDetails && batch.taskDetails.length) {
  for (const t of batch.taskDetails) {
    console.log(`  -> [${t.skill}] params: ${JSON.stringify(t.params)}`)
  }
}
console.log('Alasan    :')
for (const r of batch.reasons) {
  console.log('  * ' + r)
}
console.log('================================================')
