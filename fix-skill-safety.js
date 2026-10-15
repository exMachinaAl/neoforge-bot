const fs=require('fs');const path=require('path')
function edit(file,marker,fn){const old=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');if(old.includes(marker))return console.log(file+': sudah ter-fix');const b=path.join('backup/session-2026-10-16',file);fs.mkdirSync(path.dirname(b),{recursive:true});if(!fs.existsSync(b))fs.copyFileSync(file,b);fs.writeFileSync(file,fn(old))}
function rep(s,a,b){if(!s.includes(a))throw Error('Anchor hilang '+a.slice(0,80));return s.replace(a,b)}
edit('skills/mine.collect.js','// mining-support-v1',s=>{
 s=rep(s,'async function run (bot, p, ctx) {', `// mining-support-v1: jangan menggali pijakan sendiri atau membuka lantai ke jurang/cairan.
function safeTarget (bot, block) {
  if (!block?.position || !bot.entity?.position) return false
  const p = bot.entity.position; const b = block.position
  if (Math.abs(p.x-(b.x+0.5)) < 0.8 && Math.abs(p.z-(b.z+0.5)) < 0.8 && b.y < p.y && b.y >= p.y-1.5) return false
  for (const d of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]]) {
    const n=bot.blockAt(b.offset(...d)); if(n && /^(lava|water)$/.test(n.name)) return false
  }
  if(b.y < Math.floor(p.y)) {
    for(let d=1;d<=3;d++){const below=bot.blockAt(b.offset(0,-d,0));if(!below||/^(lava|water)$/.test(below.name))return false;if(below.boundingBox==='block'&&below.shapes?.length)return true}
    return false
  }
  return true
}

async function run (bot, p, ctx) {`)
 s=rep(s,"const probe = bot.findBlock({ matching: blockInfo.id, maxDistance })", "const probe = bot.findBlock({ matching: blockInfo.id, maxDistance, useExtraInfo: x => safeTarget(bot, x) })")
 s=rep(s,"!bad.has(key(x.position)) })", "!bad.has(key(x.position)) && safeTarget(bot, x) })")
 s=rep(s,"const t = U.bestTool(bot, cur, md)", "if (!safeTarget(bot, cur)) { why('kandidat berbahaya/pijakan: ' + key(cur.position)); bad.add(key(cur.position)); continue }\n    const t = U.bestTool(bot, cur, md)")
 s=rep(s,"module.exports = { manifest, run, cli:","module.exports = { manifest, run, safeTarget, cli:")
 return s
})
edit('skills/sleep.auto.js','// sleep-dawn-v1',s=>{
 s=rep(s,'let slept = 0', `// sleep-dawn-v1: wake datang sebelum time_update; tunggu satu putaran sinkronisasi sebelum klik ulang.
    let slept = 0; let everSlept = false; let damaged = false; let lastHealth = bot.health
    const initialDay = bot.time.day
    const morning = () => everSlept && (bot.time.day > initialDay || bot.time.timeOfDay < 12000 || bot.time.timeOfDay >= 23000)
    const healthChange = () => { if(Number.isFinite(lastHealth) && bot.health < lastHealth) damaged = true; lastHealth = bot.health }
    bot.on('health', healthChange)
    const previousOff = offHealth; offHealth = () => { previousOff(); bot.removeListener('health', healthChange) }
    const success = () => ({ ok:true, code:'OK', data:{sleptMs:slept,wokeAtTick:bot.time.timeOfDay} })`)
 s=rep(s,"mark(round ? 'klik-tidur-lagi'", "if (morning()) return success()\n      bed = bedAt(bot, bedIds, bed.position) || bed\n      mark(round ? 'klik-tidur-lagi'")
 s=rep(s,"const m = String(e.message)\n        if (/not night/.test(m)) return", "const m = String(e.message)\n        if (morning() || (everSlept && /not night|only at night/i.test(m + ' ' + st.msgs.slice(-2).join(' ')))) return success()\n        if (/not night/.test(m)) return")
 s=rep(s,"mark('tidur', { via:", "everSlept = true\n      mark('tidur', { via:")
 s=rep(s,"const t = bot.time.timeOfDay\n      if (t < 12000", "// Server dapat mengirim wake sebelum jam pagi; jangan klik bed selama jendela ini.\n      for (let n=0; n<25 && !morning() && !ctx.signal.aborted; n++) await sleep(100)\n      if (ctx.signal.aborted) return {ok:false,code:'ABORTED'}\n      const t = bot.time.timeOfDay\n      if (morning() || t < 12000")
 s=rep(s,"code: 'INTERRUPTED', error: 'bangun sebelum pagi (timeOfDay ' + t + '): terganggu/terkena serangan?'", "code: damaged ? 'INTERRUPTED' : 'SERVER_REJECTED', error: 'bangun sebelum pagi (timeOfDay ' + t + '): ' + (damaged ? 'damage terdeteksi' : 'tanpa damage; pemain lain mungkin belum tidur atau server membangunkan bot')")
 s=rep(s,"const off = () =>", "let offHealth = () => {}\n  const off = () =>")
 s=rep(s,'  off()\n  return finish', '  off(); offHealth()\n  return finish')
 s=rep(s,'  async function cleanup () {\n    if (!st.placed', '  async function cleanup () {\n    if (ctx.signal.aborted) return // jangan berjalan/menggali setelah killswitch atau mati\n    if (!st.placed')
 return s
})
console.log('Guard tambang dan tidur terpasang')
