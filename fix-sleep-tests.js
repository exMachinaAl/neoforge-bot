const fs=require('fs');const f='tests/sleep.test.js';let s=fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');if(s.includes('// sleep-regression-v1')){console.log('sudah ter-fix');process.exit(0)}fs.copyFileSync(f,'backup/session-2026-10-16/tests/sleep.test.js');function rep(a,b){if(!s.includes(a))throw Error('anchor '+a.slice(0,50));s=s.replace(a,b)}
rep("bedBlocks(b).length === 0 && o.data.recovered === true && b.inventory.items().find(i => i.name === 'green_bed').count === 1, 'abort saat tidur: bangun, bed dihancurkan dan dikembalikan'", "bedBlocks(b).length === 2 && o.data.broke === false, 'abort saat tidur: bangun, tanpa jalan/gali sesudah stop'")
rep("o.code === 'INTERRUPTED' && /sebelum pagi/", "o.code === 'SERVER_REJECTED' && /sebelum pagi/")
rep("'bangun malam terus-menerus -> tidur lagi 2x lalu INTERRUPTED, bed tetap dibersihkan'", "'bangun tanpa damage -> SERVER_REJECTED, bukan interupsi serangan'")
rep("  // 1 siang", `  // sleep-regression-v1: reproduksi wake sebelum pembaruan jam server.
  b = mk({ earlyWake: true, wakeAfter: 50 }); b._bed('red_bed',3,64,0,1,0)
  b.once('wake',()=>setTimeout(()=>{b.time.day++;b.time.timeOfDay=100;b.time.isDay=true},300))
  o=await sk.run(b,{...P},ctxOf());ok(o.ok && b._sleepCalls===1 && o.data.resleeps===0,'wake mendahului time_update: tidak klik ulang dan OK');b._stop()
  b = mk({earlyWake:true});b._bed('red_bed',3,64,0,1,0)
  b.once('sleep',()=>{b.health=15;b.emit('health')})
  o=await sk.run(b,{...P,resleep:0},ctxOf());ok(o.code==='INTERRUPTED','bangun dengan damage nyata -> INTERRUPTED');b._stop()
  // 1 siang`)
fs.writeFileSync(f,s)
