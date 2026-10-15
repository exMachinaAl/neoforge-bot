// Lifecycle aktif hanya atas permintaan: propose -> approve -> engine -> score.
// Tidak ada timer pengantrean. Killswitch membatalkan seluruh usulan yang belum disetujui.
const fs=require('fs'); const path=require('path'); const crypto=require('crypto')
const stats=require('./stats'); const persona=require('./persona'); const sampler=require('./sampler')
const {scoreBatch}=require('./scorer'); const {compile}=require('../contracts/validate')
const chestbook=require('./chestbook')
const copy=o=>JSON.parse(JSON.stringify(o)); const fail=(status,msg)=>Object.assign(Error(msg),{status})
function createLifecycle ({bot,runner,engine,dataDir,templates}={}) {
  const dir=dataDir||process.env.ARCADIA_DATA_DIR||'./data'; const botId=engine.botId()
  const batches=new Map(); const cooldowns={}; let latest=null
  const audit=(type,data)=>{try {fs.mkdirSync(dir,{recursive:true}); const file=path.join(dir,'lifecycle.log'); stats.rotate(file); fs.appendFileSync(file,JSON.stringify({ts:Date.now(),type,botId,...data})+'\n')}catch(e){console.warn('[lifecycle] '+e.message)}}
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
