const fs=require('fs');const path=require('path')
const file='tests/integration.test.js'
const code=`// Regresi integrasi; semua bot/model di sini tiruan, tidak menyambung server.
process.env.ARCADIA_TASKLOG='off'
const assert=require('assert/strict');const fs=require('fs');const os=require('os');const path=require('path');const EE=require('events')
const {mk,mkBlock}=require('./mock');const {createRunner}=require('../skills');const {createEngine}=require('../engine')
const {createLifecycle}=require('../lifecycle/runtime');const stats=require('../lifecycle/stats');const persona=require('../lifecycle/persona')
const {validate}=require('../contracts/validate');const {safeTarget}=require('../skills/mine.collect');const {scoreBatch}=require('../lifecycle/scorer')
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arcadia-integration-'));process.env.ARCADIA_DATA_DIR=dir
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let passed=0
async function test(name,fn){await fn();passed++;console.log('PASS '+name)}
function deps(){const bot=mk();bot.username='TestBot';bot.game.dimension='overworld';bot.time={timeOfDay:6000};bot.players={TestBot:{},Other:{}};const runner=createRunner(bot);const engine=createEngine(bot,runner);return{bot,runner,engine}}
const template={id:'test_nav',name:'tes',skill:'nav.goto',category:'explore',params:{x:2,z:2},prerequisites:{minHp:12,safeDimension:'overworld'},baseWeight:1}
;(async()=>{
 await test('stats memakai konteks/params saat mulai dan deduplikasi hasil',()=>{
  const engine=new EE();const bot={username:'A',health:20,food:20,time:{timeOfDay:6000},game:{dimension:'overworld'}};const a=stats.attach(engine,bot,{dataDir:path.join(dir,'stats')})
  engine.emit('event',{type:'task.started',ts:100,data:{id:'q1',params:{count:2}}});bot.health=3;bot.time.timeOfDay=14000
  const ev={type:'task.failed',ts:150,data:{taskId:'q1',skill:'nav.goto',result:{ok:false,code:'DIED',durationMs:50}}};engine.emit('event',ev);engine.emit('event',ev)
  const rows=fs.readFileSync(a.statsFile,'utf8').trim().split('\\n').map(JSON.parse);assert.equal(rows.length,1);assert.equal(rows[0].context.hp,20);assert.equal(rows[0].context.timeOfDay,'day');assert.equal(rows[0].params.count,2);a.close()
 })
 await test('konteks mengecualikan bot sendiri dan mengenali badai',()=>{const {bot}=deps();bot.isRaining=true;bot.thunderState=1;const c=stats.getContext(bot);assert.equal(c.playerCount,1);assert.equal(c.weather,'thunder');assert.equal(c.hp,20)})
 await test('persona: traversal, NaN, trait asing ditolak; energi nol tetap nol',()=>{assert.throws(()=>persona.load('../escape'));assert.throws(()=>persona.nudge('X','caution',NaN));assert.throws(()=>persona.nudge('X','hacked',0.02));const p=persona.get('X');p.needs.energy=0;persona.save('X',p);persona.decay('X');assert.equal(persona.get('X').needs.energy,0)})
 await test('scorer membaca bentuk tasks.log asli dan tidak mengubah null menjadi nilai palsu',()=>{const s=scoreBatch([{params:{},result:{ok:true,code:'OK'}}]);assert.equal(s.components.completion,100);assert.equal(s.components.contextFit,null)})
 await test('tambang menolak pijakan sendiri dan jurang; blok samping boleh',()=>{const b=mk({blocks:[mkBlock('stone',0,63,0),mkBlock('stone',2,63,0),mkBlock('stone',2,64,0)]});assert.equal(safeTarget(b,b._blocks[0]),false);assert.equal(safeTarget(b,b._blocks[1]),false);assert.equal(safeTarget(b,b._blocks[2]),true)})
 await test('progress memakai id antrean, snapshot valid, dibatasi laju, hilang saat selesai',async()=>{
  const {runner,engine}=deps();const events=[];engine.on('event',e=>events.push(e))
  runner.skills['test.progress']={manifest:{name:'test.progress',paramsSchema:{type:'object'}},run:async(b,p,c)=>{c.progress({pct:0.2,label:'a'});c.progress({pct:0.3,label:'b'});await sleep(550);c.progress({pct:0.1,label:'c'});assert.equal(engine.state().progress.pct,0.2);assert.equal(validate('BotState',engine.state()),null);return{ok:true,code:'OK'}}}
  const q=engine.enqueue({skill:'test.progress',params:{}});await sleep(650);const ps=events.filter(e=>e.type==='task.progress');assert.equal(ps.length,2);assert(ps.every(e=>e.data.taskId===q.id));assert.equal(engine.list().history[0].result.taskId,q.id);assert.equal(engine.state().progress,undefined)
 })
 await test('propose tidak mengantre; approve satu kali menghasilkan skor dan kontrak sah',async()=>{
  const d=deps();const life=createLifecycle({...d,templates:[template],dataDir:path.join(dir,'run')});const p=life.propose({seed:7});assert.equal(d.engine.list().queue.length,0);assert.equal(d.engine.list().history.length,0);life.approve(p.batchId);assert.throws(()=>life.approve(p.batchId));await sleep(100);const b=life.snapshot().batch;assert.equal(b.status,'finished');assert.equal(validate('BatchScore',b.score),null);assert.equal(b.score.components.completion,100);life.close()
 })
 await test('persetujuan memeriksa ulang HP yang berubah',()=>{const d=deps();const life=createLifecycle({...d,templates:[template]});const p=life.propose();d.bot.health=2;assert.throws(()=>life.approve(p.batchId),/konteks berubah/);assert.equal(d.engine.list().queue.length,0);life.close()})
 await test('killswitch menghanguskan usulan sebelum bisa disetujui',()=>{const d=deps();const life=createLifecycle({...d,templates:[template]});const p=life.propose();d.engine.killswitch();assert.throws(()=>life.approve(p.batchId),/cancelled/);assert.equal(d.engine.list().queue.length,0);life.close()})
 await test('tolak batch dan mati/offline tidak boleh berjalan',()=>{const d=deps();const life=createLifecycle({...d,templates:[template]});const p=life.propose();life.reject(p.batchId);assert.throws(()=>life.approve(p.batchId));d.bot.emit('end','test');assert.equal(life.propose().status,'empty');life.close()})
 await test('ChestBook terpisah dimensi dan menandai stok lama',()=>{const book=require('../lifecycle/chestbook');const {bot}=deps();book.record(bot,{x:1,y:2,z:3},[{id:'minecraft:stone',count:2,slot:0}]);bot.game.dimension='the_nether';book.record(bot,{x:1,y:2,z:3},[]);const rows=book.list('TestBot',Date.now()+31000);assert.equal(rows.length,2);assert(rows.every(x=>!x.fresh))})
 await test('ctx.progress setelah abort tidak dipancarkan',async()=>{const {runner}=deps();const ps=[];runner.events.on('task.progress',p=>ps.push(p));runner.skills['test.abort']={manifest:{name:'test.abort',paramsSchema:{}},run:async(b,p,c)=>{runner.abort('KILLSWITCH');c.progress({pct:1});return{ok:false,code:'ABORTED'}}};const r=await runner.run('test.abort');assert.equal(r.code,'ABORTED');assert.equal(ps.length,0)})
 console.log('HASIL: '+passed+' lulus, 0 gagal')
})().catch(e=>{console.error(e);process.exitCode=1})
`
if(!fs.existsSync(file))fs.writeFileSync(file,code);else if(fs.readFileSync(file,'utf8')!==code)throw Error('File sudah ada');else console.log('sudah ter-fix')
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));if(!pkg.scripts.test.includes('integration.test.js')){fs.copyFileSync('package.json','backup/session-2026-10-16/package.json');pkg.scripts.test+=' && node tests/integration.test.js';fs.writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n')}
