// Worker proses sungguhan untuk pengujian, dunia lokal tiruan tanpa Minecraft/LLM.
process.env.ARCADIA_TASKLOG = 'off'
const { mk, mcData } = require('../mock')
const { Vec3 } = require('vec3')
const bot = mk(); bot.username = process.env.MC_USERNAME; bot.arcadiaId = process.env.ARCADIA_BOT_ID
bot.game.dimension = 'overworld'; bot.time = { timeOfDay:2000,isDay:true }; bot.entity.yaw=0.4;bot.entity.pitch=0.1;bot.chat=()=>{};bot.quit=()=>bot.emit('end')
const Chunk = require('prismarine-chunk')('1.21.1'), chunk=new Chunk()
for(let x=0;x<16;x++)for(let z=0;z<16;z++){const pos=new Vec3(x,63,z);chunk.setBlockStateId(pos,mcData.blocksByName.grass_block.minStateId);chunk.setSkyLight(new Vec3(x,64,z),15)}
bot.world={getColumnAt:async()=>chunk}
const runner=require('../../skills').createRunner(bot),engine=require('../../engine').createEngine(bot,runner)
const lifecycle=require('../../lifecycle/runtime').createLifecycle({bot,runner,engine})
const api=require('../../control').start({bot,runner,engine,port:0})
const director=require('../../orchestrator/director').createDirector({bot,runner,engine,deny:[],autoApprove:[],cfg:{provider:'ollama',url:'http://unused',model:'test',rpm:20,needsKey:false},llm:async()=>({text:JSON.stringify({title:'Mengunjungi taman',reason:'Ayo berjalan',tasks:[{skill:'nav.goto',params:{x:2,z:2}}]}),usage:{in:1,out:1}})})
const extension=require('../../control/extend').attach(api,{bot,runner,engine,lifecycle,director},{multiView:true,viewerPrefix:'/view/'+bot.arcadiaId+'/eagle',firstPersonPrefix:'/view/'+bot.arcadiaId+'/first-person'})
require('../../admin/worker').attach({bot,engine,api,extension,lifecycle})
setInterval(()=>bot.emit('move'),300).unref()
