import { h, clear } from './dom.mjs'
import { createApi, connectEvents } from './api.mjs'
import { safeViewerUrl } from './viewer.mjs'
import { agentCard } from './agent.mjs'
const api = createApi(), root = typeof document !== 'undefined' && typeof document.getElementById === 'function' ? document.getElementById('admin') : null
const field = (label, input) => h('label', { className: 'admin-field' }, h('span', {}, label), input)
const button = (text, action, cls = '') => h('button', { className: cls, onclick: action }, text)
const input = (attrs = {}) => h('input', attrs)
let session, shutdown = () => {}
async function boot () {
  shutdown(); clear(root)
  try { session = await api.call('/admin/session'); session.authenticated ? dashboard() : login() }
  catch (e) { root.append(h('p', { className: 'bad' }, e.message),button('Coba lagi',boot)) }
}
function login () {
  const username = input({ autocomplete: 'username', required: true, maxlength: 32, value: 'owner' })
  const password = input({ type: 'password', autocomplete: session.setupRequired ? 'new-password' : 'current-password', required: true, minlength: session.setupRequired ? 12 : 1, maxlength: 128 })
  const error = h('p', { className: 'bad', role: 'status' })
  const submit = h('button', { type: 'submit', className: 'p' }, session.setupRequired ? 'Buat akun owner' : 'Masuk')
  const form = h('form', { className: 'panel login-panel', onsubmit: async event => {
    event.preventDefault(); submit.disabled = true; error.textContent = ''
    try { await api.call(session.setupRequired ? '/admin/setup' : '/admin/login', { method:'POST',body:{username:username.value.trim(),password:password.value} }); password.value='';await boot() }
    catch(e){error.textContent=e.message}finally{submit.disabled=false}
  } }, h('div',{className:'panel-label'},'ARCADIA / CONTROL ROOM'),h('h1',{},session.setupRequired?'Selamat datang, Owner':'Kembali ke ruang kontrol'),
  h('p',{className:'mut'},session.setupRequired?'Buat akun lokal pertama. Password minimal 12 karakter.':'Masuk untuk mengelola seluruh bot dalam satu panel.'),field('Username',username),field('Password',password),submit,error)
  root.append(h('main',{className:'login-shell'},form))
}
function cameraView (id, mode, report) {
  const host = h('div',{className:'camera-host'}), status = h('span',{className:'mut'},'Kamera belum aktif')
  let opened = false, frame = null, currentURL = '', current
  const toggle = button('Buka kamera',async()=>{
    toggle.disabled=true
    try {
      if (opened) { opened=false; clear(host);frame=null;currentURL='';toggle.textContent='Buka kamera';status.textContent='Kamera ditutup di panel ini';return }
      opened=true;toggle.textContent='Tutup kamera'
      const value=await api.call('/bots/'+id+'/viewer?mode='+mode,{method:'POST',body:{enabled:true}});render(value)
    }catch(e){opened=false;toggle.textContent='Buka kamera';report(e.message)}finally{toggle.disabled=false}
  })
  function render (value) {
    current=value
    if (!opened) return
    const url=value?.state==='ready'?safeViewerUrl(value.url):null
    status.textContent=url?'Live · '+(mode==='eagle'?'Eagle View':'First person'):value?.reason||'Menunggu kamera…'
    if (url && currentURL!==url) {
      if(!frame){frame=h('iframe',{title:mode+' '+id,sandbox:'allow-scripts allow-same-origin',allow:'fullscreen'});host.append(frame)}
      frame.src=url;currentURL=url
    }else if(!url && frame){clear(host);frame=null;currentURL=''}
  }
  const el=h('section',{className:'camera-panel'},h('div',{className:'camera-toolbar'},status,toggle),host)
  return {el,render,open:()=>{if(!opened)toggle.click()},get opened(){return opened},pause:()=>{if(opened){opened=false;clear(host);frame=null;currentURL='';toggle.textContent='Buka kamera';status.textContent='Kamera ditutup di panel ini'}}}
}
function dashboard () {
  let bots=[], focused=null, mode='multi', polling=false, stopped=false, singleBot=null, pendingPoll=false
  const cards=new Map(), selected=new Set(), eagleViews=new Map(), autoOpened=new Set()
  const message=h('p',{className:'admin-message',role:'status'}), count=h('span',{className:'tag'}), grid=h('div',{className:'fleet-grid'})
  const focusTitle=h('h2',{},'Pilih bot untuk Eagle View'), focusMeta=h('p',{className:'mut'},'Tambahkan bot atau pilih kartu di bawah.')
  const eagleHost=h('div',{className:'eagle-stack'}), multi=h('main',{className:'multi-room'}), single=h('main',{className:'single-room'})
  single.style.display='none'
  const goal=h('textarea',{rows:2,maxlength:600,placeholder:'Tujuan untuk bot yang sedang dipilih…','aria-label':'Tujuan bot fokus'})
  const controls=h('div',{className:'row'})
  const report=text=>{message.textContent=text}
  const agent = agentCard(api, () => focused, () => poll())
  async function act (id, action) {
    try { const result=await api.call('/admin/bots/'+id+'/'+action,{method:'POST',body:{}});report(action+' · '+(result.displayName||id));await poll();return true }
    catch(e){report(e.message);return false}
  }
  async function bulk (action) {
    if(!selected.size){report('Pilih bot melalui kotak centang dahulu.');return}
    const ids=[...selected], results=[]
    bulkButtons.forEach(b=>{b.disabled=true})
    try { for(const id of ids) { try { await api.call('/admin/bots/'+id+'/'+action,{method:'POST',body:{}});results.push({id,ok:true}) } catch(e) { results.push({id,ok:false,error:e.message}) } }
      await poll()
      report(results.map(r=>(bots.find(b=>b.botId===r.id)?.displayName||r.id)+': '+(r.ok?'berhasil':r.error)).join(' · '))
    }finally{bulkButtons.forEach(b=>{b.disabled=false})}
  }
  const bulkButtons=['start','stop','restart'].map((action,i)=>button(['Mulai terpilih','Hentikan terpilih','Restart terpilih'][i],()=>bulk(action)))
  const multiButton=button('Multi',()=>setMode('multi'),'p'), singleButton=button('Single / companion',()=>setMode('single'))
  function setMode (next) {
    if(next==='single'&&!focused){report('Pilih bot dahulu.');return}
    mode=next;multi.style.display=next==='multi'?'':'none';single.style.display=next==='single'?'':'none'
    multiButton.className=next==='multi'?'p':'';singleButton.className=next==='single'?'p':''
    if(next==='single' && singleBot!==focused){clear(single);single.append(h('iframe',{className:'single-frame',src:'/focus/'+focused,title:'Companion '+focused}));singleBot=focused}
  }
  function focus (id) {
    focused=id
    for(const [key,card]of cards)card.el.classList.toggle('focused',key===id)
    for(const [key,view]of eagleViews)view.el.style.display=key===id?'':'none'
    if(!eagleViews.has(id)) { const view=cameraView(id,'eagle',report);eagleViews.set(id,view);eagleHost.append(view.el) }
    eagleViews.get(id).el.style.display=''
    const bot=bots.find(b=>b.botId===id)
    focusTitle.textContent=bot?.displayName||id;focusMeta.textContent=(bot?.mission?.title||bot?.currentTask||'Belum ada kegiatan')+' · '+(bot?.status||'offline')
    if(bot?.workerStatus==='ready'&&!eagleViews.get(id).opened){autoOpened.add(id);eagleViews.get(id).open()}
    if(mode==='single')setMode('single')
    agent.load()
  }
  const goalButton=button('Jalankan tujuan',async()=>{
    if(!focused||!goal.value.trim()){report('Pilih bot dan tulis tujuan.');return}
    const id=focused,text=goal.value.trim();goalButton.disabled=true
    try{const mission=await api.call('/bots/'+id+'/agent/goals',{method:'POST',body:{goal:text}});report(mission.title+' · '+mission.status);if(goal.value.trim()===text)goal.value='';await poll()}catch(e){report(e.message)}finally{goalButton.disabled=false}
  },'p')
  controls.append(goalButton,button('Jeda kegiatan',async()=>{
    if(!focused)return
    const id=focused
    try{const a=await api.call('/bots/'+id+'/agent');for(const g of a.goals.filter(g=>!['finished','cancelled'].includes(g.status)))await api.call('/bots/'+id+'/agent/goals/'+g.id+'/stop',{method:'POST',body:{}});const data=await api.call('/bots/'+id+'/missions');for(const m of data.missions.filter(m=>m.status==='running'))await api.call('/bots/'+id+'/missions/'+m.id+'/stop',{method:'POST',body:{}});report('Kegiatan dijeda.');await poll()}catch(e){report(e.message)}
  }))
  const form=createForm(report,async()=>{form.open=false;await poll()})
  const logout=button('Keluar',async()=>{await api.call('/admin/logout',{method:'POST',body:{}});await boot()})
  const top=h('header',{className:'admin-top'},h('div',{},h('b',{},'ARCADIA'),h('small',{},'CONTROL ROOM')),h('div',{className:'row'},count,multiButton,singleButton,button('Tambah bot',()=>{form.open=!form.open}),button('Jeda darurat semua',async()=>{
    if(!confirm('Hentikan aksi aktif dan jeda engine semua bot?'))return
    try{const r=await api.call('/killswitch',{method:'POST',body:{}});report(r.results.filter(x=>x.ok).length+' bot dijeda; '+r.results.filter(x=>!x.ok).length+' gagal.');await poll()}catch(e){report(e.message)}
  },'k'),logout))
  multi.append(h('section',{className:'panel fleet-focus'},h('div',{className:'focus-heading'},h('div',{},h('div',{className:'panel-label'},'BOT FOKUS / EAGLE VIEW'),focusTitle,focusMeta),button('Buka companion',()=>setMode('single'))),eagleHost,goal,controls,agent.el),
    h('section',{className:'fleet-section'},h('div',{className:'fleet-toolbar'},h('div',{},h('h2',{},'Seluruh bot'),h('p',{className:'mut'},'Pilih fokus tanpa meninggalkan dashboard. First-person dapat dibuka pada setiap kartu.')),h('div',{className:'row'},...bulkButtons),h('div',{className:'row'},button('Buka semua FP',()=>{for(const b of bots)if(b.workerStatus==='ready')cards.get(b.botId)?.camera.open()}),button('Tutup semua kamera',()=>{for(const c of cards.values())c.camera.pause();for(const v of eagleViews.values())v.pause()}))),grid))
  root.append(h('div',{className:'admin-shell'},top,message,form,multi,single))
  function makeCard (bot) {
    const id=bot.botId, check=input({type:'checkbox','aria-label':'Pilih '+bot.displayName})
    check.onchange=()=>{check.checked?selected.add(id):selected.delete(id)}
    const name=h('b',{},bot.displayName), status=h('span',{className:'tag'}), vitals=h('div',{className:'bot-vitals'}), activity=h('p'), coords=h('small',{className:'mut'}), warning=h('p',{className:'bad'})
    const camera=cameraView(id,'first-person',report)
    const start=button('Mulai',()=>act(id,'start')),stop=button('Hentikan bot',()=>act(id,'stop'))
    const remove=button('Hapus',async()=>{if(!confirm('Hapus konfigurasi '+bot.displayName+' dari daftar? Data profil dan misi tetap disimpan.'))return;try{await api.call('/admin/bots/'+id,{method:'DELETE'});await poll()}catch(e){report(e.message)}})
    const el=h('article',{className:'panel bot-card','data-bot-id':id},h('div',{className:'bot-card-heading'},check,name,status),vitals,activity,coords,warning,
      h('div',{className:'row'},button('Fokus Eagle',()=>focus(id)),button('Single',()=>{focus(id);setMode('single')}),start,stop,remove),
      h('div',{className:'panel-label'},'FIRST PERSON'),camera.el)
    return {el,camera,update:b=>{name.textContent=b.displayName;status.textContent=b.workerStatus==='retrying'?'Menyambung ulang':b.status;status.className='tag '+(b.status==='online'?'ok':'mut')
      vitals.textContent='♥ '+(b.stale?'—':b.health??'—')+'/20   ·   Hunger '+(b.stale?'—':b.food??'—')+'/20'
      activity.textContent=b.mission?.title||b.currentTask||'Tidak ada kegiatan aktif';coords.textContent=b.pos?Math.round(b.pos.x)+', '+Math.round(b.pos.y)+', '+Math.round(b.pos.z)+' · '+(b.dimension||'')+(b.stale?' · data lama':''):'Koordinat belum tersedia'
      warning.textContent=b.error||'';start.disabled=['ready','starting','stopping'].includes(b.workerStatus);stop.disabled=b.workerStatus==='stopped';remove.disabled=!['stopped','error'].includes(b.workerStatus);camera.render(b.stale?null:b.viewers?.['first-person'])}}
  }
  async function poll () {
    if(stopped)return
    if(polling){pendingPoll=true;return}polling=true
    try{
      bots=await api.bots();if(stopped)return
      for(const [id,card]of cards)if(!bots.some(b=>b.botId===id)){card.camera.pause();card.el.remove();cards.delete(id);selected.delete(id);eagleViews.get(id)?.pause();eagleViews.get(id)?.el.remove();eagleViews.delete(id);autoOpened.delete(id);if(focused===id){focused=null;clear(single);singleBot=null;setMode('multi')}}
      count.textContent=bots.filter(b=>b.status==='online').length+' / '+bots.length+' online'
      if(!bots.length&&!grid.querySelector('.fleet-empty'))grid.append(h('p',{className:'mut fleet-empty'},'Belum ada bot. Tambah bot untuk mulai membangun ruang kontrol.'))
      if(bots.length)grid.querySelector('.fleet-empty')?.remove()
      for(const bot of bots){if(!cards.has(bot.botId)){const card=makeCard(bot);cards.set(bot.botId,card);grid.append(card.el)}cards.get(bot.botId).update(bot);eagleViews.get(bot.botId)?.render(bot.stale?null:bot.viewers?.eagle)}
      if(!focused&&bots.length)focus(bots[0].botId)
      const b=bots.find(b=>b.botId===focused)
      if(b){focusTitle.textContent=b.displayName;focusMeta.textContent=(b.mission?.title||b.currentTask||'Belum ada kegiatan')+' · '+b.status;if(b.workerStatus==='ready'&&!autoOpened.has(b.botId)){autoOpened.add(b.botId);eagleViews.get(b.botId)?.open()}}
      if(b?.workerStatus==='ready') await agent.load()
    }catch(e){if(e.status===401){await boot();return}report(e.message)}finally{polling=false;if(pendingPoll&&!stopped){pendingPoll=false;setTimeout(poll,100)}}
  }
  const timer=setInterval(()=>{if(!document.hidden)poll()},2000)
  const stopEvents=connectEvents({url:'/events',onEvent:e=>{if(e.type!=='task.progress')poll()}})
  shutdown=()=>{stopped=true;clearInterval(timer);stopEvents();for(const view of eagleViews.values())view.pause();for(const card of cards.values())card.camera.pause();clear(single)}
  poll()
}
function createForm (report, done) {
  const name=input({maxlength:64,placeholder:'Nama companion'}),username=input({required:true,minlength:3,maxlength:16,placeholder:'BotBeta'}),host=input({required:true,value:'localhost'}),port=input({type:'number',min:1,max:65535,value:25565}),legacy=input({type:'checkbox'})
  const save=h('button',{type:'submit',className:'p'},'Simpan bot')
  const details=h('details',{className:'panel create-bot'},h('summary',{},'Tambah bot'),h('form',{onsubmit:async event=>{
    event.preventDefault();save.disabled=true
    try{await api.call('/admin/bots',{method:'POST',body:{displayName:name.value,username:username.value,host:host.value,port:Number(port.value),importLegacy:legacy.checked}});report('Bot disimpan. Tekan Mulai pada kartunya untuk menghubungkan.');await done()}catch(e){report(e.message)}finally{save.disabled=false}
  }},h('div',{className:'form-grid'},field('Nama tampilan',name),field('Username Minecraft',username),field('Server Minecraft',host),field('Port',port)),
  field('Salin profil, persona, dan misi lama untuk username ini',legacy),h('p',{className:'mut'},'Koneksi NeoForge 1.21.1, auth offline. Model karakter dipilih pada Single → Model & animasi. LLM memakai konfigurasi proses admin.'),save))
  api.call('/admin/defaults').then(cfg=>{if(host.value==='localhost')host.value=cfg.host;port.value=cfg.port}).catch(()=>{})
  return details
}
if (root) boot()
