import {h,clear} from './dom.mjs'
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
