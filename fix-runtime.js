const fs = require('fs'); const path = require('path')
function put(file, content) { if(fs.existsSync(file)) { if(fs.readFileSync(file,'utf8')===content) return console.log(file+': sudah ter-fix'); throw Error('File sudah ada '+file) } fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,content) }
function edit(file, marker, fn) { const old=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'); if(old.includes(marker)) return console.log(file+': sudah ter-fix'); const b=path.join('backup/session-2026-10-16',file); fs.mkdirSync(path.dirname(b),{recursive:true}); if(!fs.existsSync(b)) fs.copyFileSync(file,b); fs.writeFileSync(file,fn(old)) }
function rep(s,a,b) {if(!s.includes(a)) throw Error('Anchor hilang '+a.slice(0,80)); return s.replace(a,b)}
put('lifecycle/chestbook.js', `// Catatan isi server; tiap entri punya dimensi, waktu, sumber. Tidak menyatakan stok lama akurat.
const fs = require('fs'); const path = require('path')
const fileOf = () => path.join(process.env.ARCADIA_DATA_DIR || './data', 'chests.json')
function read () { try { const v = JSON.parse(fs.readFileSync(fileOf(), 'utf8')); return Array.isArray(v) ? v : [] } catch (_) { return [] } }
function record (bot, pos, items) {
  try {
    const dimension = String(bot.game?.dimension || 'unknown'); const botId = bot.username || 'bot'
    const id = botId + ':' + dimension + ':' + [pos.x,pos.y,pos.z].join(',')
    const entry = { id, botId, dimension, pos: {x:pos.x,y:pos.y,z:pos.z}, ts:Date.now(), source:'snbt', items:items.map(i=>({id:i.id,count:i.count,slot:i.slot})) }
    const entries = read().filter(e=>e.id!==id); entries.push(entry)
    const file = fileOf(); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file+'.tmp',JSON.stringify(entries.slice(-128),null,2)+'\\n'); fs.renameSync(file+'.tmp',file)
    return entry
  } catch(e) { console.warn('[chestbook] '+e.message) }
}
function list (botId, now=Date.now()) { return read().filter(e=>e.botId===botId).map(e=>({...e,ageMs:Math.max(0,now-e.ts),fresh:now-e.ts<30000})) }
module.exports={record,list}
`)
put('lifecycle/runtime.js', `// Lifecycle aktif hanya atas permintaan: propose -> approve -> engine -> score.
// Tidak ada timer pengantrean. Killswitch membatalkan seluruh usulan yang belum disetujui.
const fs=require('fs'); const path=require('path'); const crypto=require('crypto')
const stats=require('./stats'); const persona=require('./persona'); const sampler=require('./sampler')
const {scoreBatch}=require('./scorer'); const {compile}=require('../contracts/validate')
const chestbook=require('./chestbook')
const copy=o=>JSON.parse(JSON.stringify(o)); const fail=(status,msg)=>Object.assign(Error(msg),{status})
function createLifecycle ({bot,runner,engine,dataDir,templates}={}) {
  const dir=dataDir||process.env.ARCADIA_DATA_DIR||'./data'; const botId=engine.botId()
  const batches=new Map(); const cooldowns={}; let latest=null
  const audit=(type,data)=>{try {fs.mkdirSync(dir,{recursive:true}); const file=path.join(dir,'lifecycle.log'); stats.rotate(file); fs.appendFileSync(file,JSON.stringify({ts:Date.now(),type,botId,...data})+'\\n')}catch(e){console.warn('[lifecycle] '+e.message)}}
  const emit=(type,data)=>{audit(type,data); engine.emit(type,data)}
  const telemetry=stats.attach(engine,bot,{dataDir:dir})
  function options () {
    const st=engine.state(); const q=engine.list(); const items=st.inventory?.items||[]
    return {isOnline:st.status==='online',isPaused:q.paused,hasWeapon:items.some(i=>i.count>0&&/_(sword|axe)$/.test(i.name)),now:Date.now(),lastExecutedMap:cooldowns}
  }
  function candidates () {
    const st=engine.state(); const items=st.inventory?.items||[]; const count=n=>items.filter(i=>i.name===n).reduce((s,i)=>s+i.count,0)
    return (templates||sampler.loadTemplates()).filter(t=>{
      const sk=runner.skills[t.skill]; if(!sk || compile(sk.manifest.paramsSchema)(t.params||{})) return false
      if(t.skill==='fish.cast'&&!count('fishing_rod')) return false
      if(t.skill==='breed.animals'&&count('wheat')<2) return false
      if(t.skill==='mine.collect'&&t.params.block==='stone'&&!items.some(i=>/_pickaxe$/.test(i.name))) return false
      if(t.skill==='craft.item'&&t.params.item==='stick'&&!items.some(i=>/_planks$/.test(i.name)&&i.count>=2)) return false
      return true
    }).map(t=>t.id==='explore_patrol'&&st.pos?{...t,params:{...t.params,x:Math.floor(st.pos.x)+6,z:Math.floor(st.pos.z)+6}}:t)
  }
  function propose ({seed}={}) {
    const c=stats.getContext(bot); const o=options()
    if(!c.known.hp||!c.known.time||!c.known.dimension) throw fail(409,'konteks dunia belum lengkap')
    const batch=sampler.sampleBatch(c,persona.get(botId),{...o,templates:candidates(),seed})
    if(!batch.taskDetails?.length) return {...batch,status:'empty'}
    batch.batchId='b_'+crypto.randomBytes(10).toString('hex'); batch.status='pending'; batch.updatedAt=Date.now()
    batch.results=[]; batch.tasks=[]
    batches.set(batch.batchId,batch); latest=batch.batchId
    while(batches.size>50) { const old=[...batches.values()].find(b=>!['approved','running'].includes(b.status)); if(!old) break; batches.delete(old.batchId) }
    emit('batch.proposed',{batchId:batch.batchId,seed:batch.seed,template:batch.chosenTemplate})
    return copy(batch)
  }
  function getPending(id) {const b=batches.get(id); if(!b) throw fail(404,'batch tidak ditemukan'); if(b.status!=='pending') throw fail(409,'batch sudah '+b.status); return b}
  function approve(id) {
    const b=getPending(id); const c=stats.getContext(bot); const o=options()
    const template=candidates().find(t=>t.id===b.chosenTemplate)
    if(!c.known.hp||!c.known.time||!c.known.dimension||!template||!sampler.filterCandidates([template],c,persona.get(botId),cooldowns,o).allowed.length) throw fail(409,'konteks berubah; batch tidak aman atau prasyarat tidak tersedia')
    // Persetujuan dan pengantrean sinkron; satu task per template pada v1.
    b.status='approved'; b.mode='approved'; b.updatedAt=Date.now()
    emit('batch.approved',{batchId:id})
    try {
      for(const t of b.taskDetails) {const q=engine.enqueue({skill:t.skill,params:copy(t.params),priority:t.priority,source:'persona',batchId:id}); b.tasks.push(q.id)}
      cooldowns[b.chosenTemplate]=Date.now()
    } catch(e) {b.status='failed'; b.error=e.message; audit('batch.enqueue_failed',{batchId:id,error:e.message}); throw e}
    return copy(b)
  }
  function reject(id) {const b=getPending(id); b.status='rejected'; b.mode='archived'; b.updatedAt=Date.now(); emit('lifecycle.updated',{batchId:id,status:b.status}); return copy(b)}
  const listener=ev=>{
    const d=ev.data||{}
    if(ev.type==='safety.killswitch'||ev.type==='bot.died'||ev.type==='bot.disconnected') {
      for(const b of batches.values()) if(b.status==='pending') {b.status='cancelled';b.mode='archived'}
    }
    if(ev.type==='task.started'&&d.batchId) {const b=batches.get(d.batchId); if(b){b.status='running';b.mode='running';emit('batch.started',{batchId:b.batchId})} return}
    if(!['task.finished','task.failed'].includes(ev.type)) return
    const b=[...batches.values()].find(x=>x.tasks.includes(d.taskId)); if(!b||b.results.some(x=>x.taskId===d.taskId)) return
    b.results.push(d.result||{taskId:d.taskId,ok:false,code:d.code||'ABORTED'}); b.updatedAt=Date.now()
    if(b.results.length===b.tasks.length) {
      const score=scoreBatch(b.results); b.score={batchId:b.batchId,total:score.total,components:score.components,computedAt:Date.now()}
      b.status=b.results.every(x=>x.ok)?'finished':'failed';b.mode='evaluated'
      emit('batch.finished',{batchId:b.batchId,status:b.status});emit('batch.scored',b.score)
    }
  }
  engine.on('event',listener)
  function snapshot () {return {mode:'off',autonomy:false,context:stats.getContext(bot),persona:copy(persona.get(botId)),batch:latest&&batches.has(latest)?copy(batches.get(latest)):null,chests:chestbook.list(botId)}}
  return {propose,approve,reject,snapshot,close:()=>{telemetry.close();engine.off('event',listener)}}
}
module.exports={createLifecycle}
`)
edit('skills/_inv.js','// chestbook-v1',s=>{
 s=rep(s,"if (q.none) return { ok: true, items: [] }\n  try { return { ok: true, items: snbt.containerItems(snbt.extract(q.text)) } }", "// chestbook-v1: hanya isi terkonfirmasi server yang dicatat.\n  if (q.none) { require('../lifecycle/chestbook').record(bot, pos, []); return { ok: true, items: [] } }\n  try { const items = snbt.containerItems(snbt.extract(q.text)); require('../lifecycle/chestbook').record(bot, pos, items); return { ok: true, items } }")
 return s
})
edit('lifecycle/scorer.js','// nested-results-v1',s=>rep(s,'const total_tasks = entries.length', "// nested-results-v1: tasks.log membungkus hasil di result.\n  entries = entries.map(e => e && e.result ? { ...e, ...e.result, params: e.params } : e)\n  const total_tasks = entries.length"))
edit('contracts/contracts.schema.json','runtime-score-nullable-v1',s=>{
 const j=JSON.parse(s); j.$comment='runtime-score-nullable-v1: null berarti komponen belum diukur, bukan nol.'
 for(const [k,v] of Object.entries(j.definitions.BatchScore.properties.components.properties)) if(k!=='completion') v.type=['number','null']
 return JSON.stringify(j,null,2)+'\n'
})
edit('bot.js','// lifecycle-runtime-v1',s=>rep(s,"const engine = require('./engine').createEngine(bot, runner)", "const engine = require('./engine').createEngine(bot, runner)\n// lifecycle-runtime-v1: telemetri pasif, usulan hanya lewat API.\nconst lifecycle = require('./lifecycle/runtime').createLifecycle({ bot, runner, engine })\nbot.once('end', () => lifecycle.close())" ).replace("attach(api, { bot, runner, engine })", "attach(api, { bot, runner, engine, lifecycle })"))
edit('control/extend.js','// lifecycle-routes-v1',s=>{
 s=rep(s,'const { bot, runner, engine } = deps','const { bot, runner, engine, lifecycle } = deps')
 s=rep(s,"parts[2] === 'director'))", "parts[2] === 'director' || parts[2] === 'lifecycle' || parts[2] === 'persona' || parts[2] === 'chests'))")
 s=rep(s,"if (parts[2] === 'map' && m === 'GET')", `// lifecycle-routes-v1
      if (['lifecycle','persona','chests'].includes(parts[2])) {
        if (!lifecycle) throw fail(503, 'lifecycle belum terpasang')
        if (m === 'GET' && parts.length === 3) { const st = lifecycle.snapshot(); send(res,200,parts[2]==='persona'?st.persona:parts[2]==='chests'?st.chests:st); return true }
        if (parts[2] === 'lifecycle' && m === 'POST') {
          if (parts[3] === 'propose' && parts.length===4) {send(res,200,lifecycle.propose(await readBody(req)));return true}
          if (parts[3] === 'batches' && parts.length===6 && ['approve','reject'].includes(parts[5])) {send(res,200,lifecycle[parts[5]](parts[4]));return true}
        }
        throw fail(404,'rute lifecycle tidak ada')
      }
      if (parts[2] === 'map' && m === 'GET')`)
 s=rep(s,"'/bots/{id}/viewer':", "'/bots/{id}/lifecycle': { get: op('Konteks, persona, batch terakhir', {parameters:[idp]}) },\n        '/bots/{id}/lifecycle/propose': {post:op('Usulkan batch deterministik; tidak menjalankan', {parameters:[idp]})},\n        '/bots/{id}/lifecycle/batches/{batchId}/approve': {post:op('Setujui batch',{parameters:[idp]})},\n        '/bots/{id}/lifecycle/batches/{batchId}/reject': {post:op('Tolak batch',{parameters:[idp]})},\n        '/bots/{id}/persona': {get:op('Persona tersimpan',{parameters:[idp]})},\n        '/bots/{id}/chests': {get:op('Catatan chest bertimestamp',{parameters:[idp]})},\n        '/bots/{id}/viewer':")
 return s
})
console.log('Runtime terpasang')
