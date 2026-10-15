const fs=require('fs'); const path=require('path')
function edit(file,marker,fn){const old=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');if(old.includes(marker))return console.log(file+': sudah ter-fix');const b=path.join('backup/session-2026-10-16',file);fs.mkdirSync(path.dirname(b),{recursive:true});if(!fs.existsSync(b))fs.copyFileSync(file,b);fs.writeFileSync(file,fn(old))}
function rep(s,a,b){if(!s.includes(a))throw Error('Anchor hilang '+a.slice(0,80));return s.replace(a,b)}
const file='ui/js/lifecycle.mjs'
const code=`import {h,clear} from './dom.mjs'
import {renderPersona,renderBatch} from './cards.mjs'
export function lifecycleCard(api,getId,refresh) {
  const persona=h('div');const batch=h('div');const tasks=h('pre');const controls=h('div',{className:'row'});const msg=h('div',{className:'mut'});let current=null;let busy=false
  const path=()=>'/bots/'+encodeURIComponent(getId())+'/lifecycle'
  async function action(op) {if(busy)return;busy=true;try {await api.call(path()+op,{method:'POST',body:{}});await load();await refresh()}catch(e){msg.textContent=e.message}finally{busy=false}}
  async function load(){const id=getId();if(!id)return;try{const s=await api.call(path());if(id!==getId())return;current=s.batch;renderPersona(persona,s.persona);renderBatch(batch,current,current?.score);tasks.textContent=current?JSON.stringify(current.taskDetails||[],null,2):'';clear(controls);controls.append(h('button',{onclick:()=>action('/propose')},'Usulkan kegiatan'))
    if(current?.status==='pending')for(const [op,label] of [['approve','Setujui'],['reject','Tolak']]) controls.append(h('button',{onclick:()=>action('/batches/'+encodeURIComponent(current.batchId)+'/'+op)},label))
    msg.textContent='Otonomi mati. Kegiatan berjalan setelah disetujui.'+(current?' Status: '+current.status:'')
  }catch(e){msg.textContent=e.message}}
  return {el:h('div',{},msg,persona,batch,tasks,controls),load}
}
`
if(!fs.existsSync(file))fs.writeFileSync(file,code);else if(fs.readFileSync(file,'utf8')!==code)throw Error('File sudah ada')
edit('ui/js/app.mjs','// lifecycle-panel-v1',s=>{
 s=rep(s,"import { mapCard } from './mapcard.mjs'", "import { mapCard } from './mapcard.mjs'\nimport { lifecycleCard } from './lifecycle.mjs' // lifecycle-panel-v1")
 s=rep(s,"const picker = h('select'", "const life = lifecycleCard(api, id, () => poll())\n  const picker = h('select'")
 s=rep(s,"sec('Director (model)', dir.el)","sec('Director (model)', dir.el), sec('Kegiatan & persona', life.el)")
 s=rep(s,"await poll(); dir.load(); map.refresh()", "await poll(); dir.load(); map.refresh(); life.load()")
 s=rep(s,"store.setCurrent(e.target.value); poll()", "store.setCurrent(e.target.value); poll(); life.load(); dir.load(); map.refresh()")
 s=rep(s,"onEvent: ev => { store.applyEvent(ev);", "onEvent: ev => { store.applyEvent(ev); if (/^(batch\\.|lifecycle\\.|persona\\.)/.test(ev.type)) life.load();")
 return s
})
edit('engine/index.js','// clear-results-v1',s=>rep(s,"function clear () { const n = queue.length; for (const t of queue) { t.status = 'aborted'; history.unshift(t) } queue = []; return { cleared: n } }", "// clear-results-v1: batch harus menerima hasil untuk task yang dibuang.\n  function clear () { const removed = queue; queue = []; for (const t of removed) { t.status = 'aborted'; history.unshift(t); emit('task.failed', { taskId:t.id, skill:t.skill, code:'ABORTED' }) } history.length=Math.min(history.length,60); return { cleared: removed.length } }"))
console.log('Panel dan pembatalan terpasang')
