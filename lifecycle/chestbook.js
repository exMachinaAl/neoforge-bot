// Catatan isi server; tiap entri punya dimensi, waktu, sumber. Tidak menyatakan stok lama akurat.
const fs = require('fs'); const path = require('path')
const fileOf = () => path.join(process.env.ARCADIA_DATA_DIR || './data', 'chests.json')
function read () { try { const v = JSON.parse(fs.readFileSync(fileOf(), 'utf8')); return Array.isArray(v) ? v : [] } catch (_) { return [] } }
function record (bot, pos, items) {
  try {
    const dimension = String(bot.game?.dimension || 'unknown'); const botId = bot.username || 'bot'
    const id = botId + ':' + dimension + ':' + [pos.x,pos.y,pos.z].join(',')
    const entry = { id, botId, dimension, pos: {x:pos.x,y:pos.y,z:pos.z}, ts:Date.now(), source:'snbt', items:items.map(i=>({id:i.id,count:i.count,slot:i.slot})) }
    const entries = read().filter(e=>e.id!==id); entries.push(entry)
    const file = fileOf(); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file+'.tmp',JSON.stringify(entries.slice(-128),null,2)+'\n'); fs.renameSync(file+'.tmp',file)
    return entry
  } catch(e) { console.warn('[chestbook] '+e.message) }
}
function list (botId, now=Date.now()) { return read().filter(e=>e.botId===botId).map(e=>({...e,ageMs:Math.max(0,now-e.ts),fresh:now-e.ts<30000})) }
module.exports={record,list}
