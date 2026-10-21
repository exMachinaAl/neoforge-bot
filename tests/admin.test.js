const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path')
const {createAdmin}=require('../admin/server')
const {openState}=require('../admin/state')
const {io}=require('socket.io-client')
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function waitFor(fn){for(let i=0;i<150;i++){const value=await fn();if(value)return value;await sleep(100)}throw Error('Timeout menunggu worker/kamera')}
test('admin login, isolated workers, dual cameras through HTTP/WebSocket, session persistence and access control',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arcadia-admin-'))
  let app=createAdmin({dataDir:dir,manager:{workerFile:path.join(__dirname,'fixtures/admin-worker.js')}})
  const address=await app.listen(0),base='http://127.0.0.1:'+address.port
  let cookie='';const sockets=[]
  t.after(async()=>{sockets.forEach(s=>s.close());await app.close();fs.rmSync(dir,{recursive:true,force:true})})
  async function request(route,method='GET',body,headers={}){
    const res=await fetch(base+route,{method,headers:{cookie,origin:base,connection:'close',...(body===undefined?{}:{'content-type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)}).catch(e=>{throw Error(method+' '+route+': '+e.message+' '+e.cause?.message)})
    const text=await res.text();let data;try{data=JSON.parse(text)}catch(_){}
    return {status:res.status,data,text,headers:res.headers}
  }
  assert.throws(()=>openState(dir),/sudah berjalan/)
  assert.equal((await request('/bots')).status,401)
  assert.equal((await request('/admin/session')).data.setupRequired,true)
  assert.equal((await request('/admin/setup','POST',{username:'owner',password:'password-for-test-only'},{origin:'http://evil.example'})).status,403)
  const setup=await request('/admin/setup','POST',{username:'owner',password:'password-for-test-only'})
  assert.equal(setup.status,200);cookie=setup.headers.get('set-cookie').split(';')[0]
  assert.match(setup.headers.get('set-cookie'),/HttpOnly/)
  assert.equal((await request('/admin/setup','POST',{username:'owner',password:'password-for-test-only'})).status,409)
  assert.equal((await request('/admin/login','POST',{username:'owner',password:'wrong'})).status,401)
  const persisted=fs.readFileSync(path.join(dir,'admin.json'),'utf8');assert.ok(!persisted.includes('password-for-test-only'));assert.ok(!persisted.includes(cookie.split('=')[1]))
  const a=await request('/admin/bots','POST',{username:'BotAlpha',displayName:'Momoi',host:'localhost',port:25565})
  const b=await request('/admin/bots','POST',{username:'BotBeta',displayName:'Midori',host:'localhost',port:25565})
  assert.equal(a.status,201);assert.equal(b.status,201)
  const idA=a.data.botId,idB=b.data.botId
  const offlineProfile=await request('/bots/'+idA+'/profile');assert.equal(offlineProfile.status,200);assert.equal(offlineProfile.data.config.model,null)
  const framedOffline=await request('/bots/'+idA+'/profile','POST',{offsetX:.25,offsetY:1});assert.equal(framedOffline.status,200);assert.equal(framedOffline.data.config.offsetX,.25)
  assert.equal((await request('/admin/bots','POST',{username:'BotAlpha',host:'localhost',port:25565})).status,409)
  assert.equal((await request('/admin/bots/'+idA+'/start','POST',{})).status,200)
  assert.equal((await request('/admin/bots/'+idB+'/start','POST',{})).status,200)
  await waitFor(async()=>{const r=await request('/bots');return r.data.every(b=>b.status==='online'&&b.viewers.eagle?.state==='ready')})
  assert.notEqual(app.manager.workers.get(idA).child.pid,app.manager.workers.get(idB).child.pid)
  await request('/bots/'+idA+'/viewer?mode=first-person','POST',{enabled:true})
  await request('/bots/'+idB+'/viewer?mode=first-person','POST',{enabled:true})
  await waitFor(async()=>{const r=await request('/bots');return r.data.every(b=>b.viewers['first-person']?.state==='ready')})
  const views=(await request('/bots')).data
  for(const bot of views)for(const mode of ['eagle','first-person']){
    const url=bot.viewers[mode].url;assert.match(url,/^\/view\//)
    const page=await request(url);assert.equal(page.status,200);assert.match(page.text,/index.js/)
    assert.equal((await request('/view/'+bot.botId+'/'+mode+'/index.js')).status,200)
    assert.equal((await request('/view/'+bot.botId+'/'+mode+'/worker.js')).status,200)
  }
  const positions=await Promise.all([[idA,'eagle'],[idA,'first-person'],[idB,'first-person']].map(([id,mode])=>new Promise((resolve,reject)=>{
    const s=io(base,{path:'/view/'+id+'/'+mode+'/socket.io',transports:['websocket'],extraHeaders:{cookie,origin:base},reconnection:false,timeout:10000});sockets.push(s)
    const timer=setTimeout(()=>reject(Error('position timeout '+mode)),15000)
    s.once('position',packet=>{clearTimeout(timer);resolve(packet)});s.once('connect_error',e=>{clearTimeout(timer);reject(e)})
  })))
  assert.equal(positions[0].pitch,undefined);assert.equal(positions[1].pitch,0.1);assert.equal(positions[2].pitch,0.1)
  const customer={id:'customer-test',username:'customer',role:'customer',tenantId:'other'};app.state.db.users.push(customer)
  const customerCookie=cookie.split('=')[0]+'='+app.state.issue(customer)
  assert.deepEqual((await request('/bots','GET',undefined,{cookie:customerCookie})).data,[])
  assert.equal((await request('/bots/'+idA,'GET',undefined,{cookie:customerCookie})).status,404)
  assert.equal((await request('/bots/'+idA+'/profile','GET',undefined,{cookie:customerCookie})).status,404)
  assert.equal((await request('/view/'+idA+'/eagle/','GET',undefined,{cookie:customerCookie})).status,404)
  assert.equal((await request('/admin/bots/'+idA+'/stop','POST',{})).status,200)
  assert.equal((await request('/bots/'+idA)).data.status,'offline')
  assert.equal((await request('/bots/'+idA+'/profile')).data.config.offsetY,1)
  const running=(await request('/bots')).data.find(b=>b.botId===idB);assert.equal(running.status,'online')
  assert.equal((await request('/bots/'+idB+'/missions/plan','POST',{goal:'Ke taman',run:true})).status,200)
  await waitFor(async()=>{const r=await request('/bots/'+idB+'/missions');return r.data.missions[0]?.status==='finished'})
  const oldGeneration=app.manager.workers.get(idB).generation
  await request('/admin/bots/'+idB+'/restart','POST',{});await waitFor(async()=>{const r=await request('/bots');return r.data.find(b=>b.botId===idB).status==='online'})
  assert.notEqual(app.manager.workers.get(idB).generation,oldGeneration)
  assert.equal((await request('/bots/'+idB+'/missions')).data.missions[0].status,'finished')
  // Session dan registry tetap berlaku setelah proses panel diganti.
  sockets.forEach(s=>s.close());await app.close()
  app=createAdmin({dataDir:dir,manager:{workerFile:path.join(__dirname,'fixtures/admin-worker.js')}});await app.listen(address.port)
  assert.equal((await request('/admin/session')).data.authenticated,true)
  assert.equal((await request('/bots')).data.length,2)
  assert.equal((await request('/admin/bots/'+idA,'DELETE')).data.dataRetained,true)
  assert.equal((await request('/bots')).data.length,1)
  await request('/admin/logout','POST',{});assert.equal((await request('/bots')).status,401)
})
