const fs=require('fs');const path=require('path')
function edit(file,marker,fn){const old=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');if(old.includes(marker))return console.log(file+': sudah ter-fix');const b=path.join('backup/session-2026-10-16',file);fs.mkdirSync(path.dirname(b),{recursive:true});if(!fs.existsSync(b))fs.copyFileSync(file,b);fs.writeFileSync(file,fn(old))}
function rep(s,a,b){if(!s.includes(a))throw Error('Anchor hilang '+a.slice(0,80));return s.replace(a,b)}
edit('orchestrator/llm.js','// structured-tools-v1',s=>{
 s=rep(s,'async function callModel (cfg, { system, user, signal })', 'async function callModel (cfg, { system, user, signal, tool, onRetry })')
 s=rep(s,"if (signal) { if (signal.aborted) ac.abort(); else signal.addEventListener('abort', () => ac.abort(), { once: true }) }", "const onAbort = () => ac.abort()\n  if (signal) { if (signal.aborted) ac.abort(); else signal.addEventListener('abort', onAbort, { once: true }) }")
 s=rep(s,'  try {\n    const res = await fetch', `  // structured-tools-v1: tool hanya membawa usulan, tidak pernah langsung mengeksekusi skill.
  if (tool) {
    if (cfg.provider === 'anthropic') { body.tools=[{name:tool.name,description:tool.description,input_schema:tool.schema}];body.tool_choice={type:'auto',disable_parallel_tool_use:true} }
    else { body.tools=[{type:'function',function:{name:tool.name,description:tool.description,parameters:tool.schema,strict:false}}];body.tool_choice='auto';body.parallel_tool_calls=false }
  }
  try {
    let res
    for(let attempt=0; ; attempt++) {
      res = await fetch`)
 s=rep(s,"redirect: 'error' })\n    const raw", `redirect: 'error' })
      if (!(res.status===429 || res.status>=500) || attempt>=2) break
      await res.arrayBuffer()
      const retryAfter=Number(res.headers.get('retry-after'))*1000
      const delay=Math.min(5000,Math.max(Number.isFinite(retryAfter)?retryAfter:0,(cfg.backoffMs??250)*2**attempt))
      await require('timers/promises').setTimeout(delay,undefined,{signal:ac.signal})
      if(onRetry) onRetry()
    }
    const raw`)
 s=rep(s,"if (cfg.provider === 'anthropic') return { text:", "if (cfg.provider === 'anthropic') {\n      const tc=(j.content||[]).filter(c=>c.type==='tool_use'); if(tc.length && (tc.length!==1 || !tool || tc[0].name!==tool.name)) throw Object.assign(new Error('tool model tidak dikenal atau lebih dari satu'),{code:'BAD_REPLY'})\n      if(tc.length) return {text:JSON.stringify(tc[0].input),usage:{in:j.usage?.input_tokens,out:j.usage?.output_tokens},model:j.model||cfg.model}\n      return { text:")
 s=rep(s,"model: j.model || cfg.model }\n    const m", "model: j.model || cfg.model } }\n    const m")
 s=rep(s,"return { text: (m && m.content) || ''", "const tc=m?.tool_calls||[]\n    if(tc.length && (tc.length!==1 || !tool || tc[0].type!=='function' || tc[0].function?.name!==tool.name)) throw Object.assign(new Error('tool model tidak dikenal atau lebih dari satu'),{code:'BAD_REPLY'})\n    return { text: tc.length ? tc[0].function.arguments : (m && m.content) || ''")
 s=rep(s,'finally { clearTimeout(timer) }', "finally { clearTimeout(timer); if(signal) signal.removeEventListener('abort',onAbort) }")
 return s
})
edit('orchestrator/director.js','// director-l1-v1',s=>{
 s=rep(s,'const MAX_TASKS = 3', `const MAX_TASKS = 3
// director-l1-v1
const PROMPT_VERSION='arcadia-director-1.1'
const fs=require('fs');const path=require('path');const crypto=require('crypto')
const DECISION_TOOL={name:'propose_tasks',description:'Usulkan task Minecraft untuk persetujuan pemilik; tidak menjalankan task.',schema:{type:'object',required:['reason','tasks'],additionalProperties:false,properties:{reason:{type:'string',maxLength:400},tasks:{type:'array',maxItems:MAX_TASKS,items:{type:'object',required:['skill','params'],additionalProperties:false,properties:{skill:{type:'string'},params:{type:'object'},priority:{type:'integer',minimum:0,maximum:100}}}}}}
function safetyReason(task,st) {
  if(st.status!=='online') return 'bot belum online'
  if(['mine.collect','hunt.kill','farm.harvest','guard.post','guard.follow'].includes(task.skill) && (!Number.isFinite(st.health)||st.health<8)) return 'HP terlalu rendah atau belum diketahui'
  if(task.skill==='sleep.auto' && String(st.dimension).replace(/^minecraft:/,'')!=='overworld') return 'bed hanya boleh di overworld'
  return null
}`)
 s=rep(s,'  const obj = extractJson(text)', "  const obj = extractJson(text)\n  if(!obj || typeof obj!=='object' || Array.isArray(obj) || !Array.isArray(obj.tasks)) throw new Error('tasks wajib berupa array')")
 s=rep(s,'autoApprove } = {})', 'autoApprove, auditFile } = {})')
 s=rep(s,"const fail = (status, msg) => Object.assign(new Error(msg), { status })", `const fail = (status, msg) => Object.assign(new Error(msg), { status })
  const usage={in:0,out:0};let generation=0;const active=new Set()
  auditFile = auditFile ?? process.env.ARCADIA_DIRECTOR_LOG ?? path.join(process.env.ARCADIA_DATA_DIR||'./data','director.log')
  const sanitize=v=>JSON.parse(JSON.stringify(v).split(cfg.key||'__no_secret__').join(cfg.key?'***':'__no_secret__'))
  const audit=(type,data)=>{if(auditFile==='off')return;try{fs.mkdirSync(path.dirname(auditFile),{recursive:true});require('../lifecycle/stats').rotate(auditFile);fs.appendFileSync(auditFile,JSON.stringify(sanitize({ts:now(),promptVersion:PROMPT_VERSION,type,...data}))+'\\n')}catch(e){console.warn('[director] audit gagal: '+e.message)}}
  const reserve=()=>{const t=now();while(calls.length&&t-calls[0]>=60000)calls.shift();if(calls.length>=cfg.rpm)throw fail(429,'anggaran: maksimum '+cfg.rpm+' panggilan/menit');calls.push(t)}
  if(engine.on) engine.on('event',ev=>{
    if(['safety.killswitch','bot.died','bot.disconnected'].includes(ev.type)){generation++;for(const ac of active)ac.abort();for(const p of proposals.values())if(p.status==='pending')p.status='cancelled'}
    if(['task.finished','task.failed'].includes(ev.type)){const p=[...proposals.values()].find(p=>p.taskId===ev.data.taskId);if(p)audit('outcome',{pid:p.pid,taskId:p.taskId,code:ev.data.code})}
  })`)
 s=rep(s,"const p = buildPrompt(goal); if (dry)", "const p = buildPrompt(goal); if (dry)")
 const begin=s.indexOf('    const t = now(); while (calls.length',s.indexOf('  async function ask'))
 const end=s.indexOf('    history.unshift(d); history.length',s.indexOf("    d.ms = now() - t; d.usage",begin))
 if(begin<0||end<0)throw Error('ask anchor')
 s=s.slice(0,begin)+`    const t=now(); const epoch=generation; const ac=new AbortController();active.add(ac)
    const abort=()=>ac.abort();if(signal){if(signal.aborted)ac.abort();else signal.addEventListener('abort',abort,{once:true})}
    const d={id:'d'+(++seq),ts:t,goal,model:cfg.model,provider:cfg.provider,promptVersion:PROMPT_VERSION,tasks:[],rejected:[],usage:{in:0,out:0},attempts:0}
    let correction='';let parsed=null
    try {
      for(let attempt=0;attempt<2;attempt++) {
        if(ac.signal.aborted) throw fail(409,'permintaan dibatalkan')
        reserve();d.attempts++
        const r=await call(cfg,{system:p.system,user:p.user+correction,signal:ac.signal,tool:DECISION_TOOL,onRetry:reserve})
        if(ac.signal.aborted||epoch!==generation)throw fail(409,'permintaan dibatalkan oleh keselamatan')
        d.model=r.model||d.model
        for(const k of ['in','out']){const n=Number(r.usage?.[k]);if(Number.isFinite(n)&&n>=0){d.usage[k]+=n;usage[k]+=n}}
        try {
          parsed=parseDecision(r.text,runner.skills,deny)
          parsed.tasks=parsed.tasks.filter(tk=>{const why=safetyReason(tk,engine.state());if(why)parsed.rejected.push({skill:tk.skill,why});return !why})
          if(!parsed.rejected.length)break
          correction='\\nVALIDASI GAGAL (perbaiki satu kali): '+JSON.stringify(parsed.rejected).slice(0,1200)
        }catch(e){parsed=null;d.error='balasan model tidak dapat dipakai: '+e.message;correction='\\nVALIDASI GAGAL: '+e.message}
        audit('invalid',{id:d.id,attempt:d.attempts,reason:correction})
      }
      if(parsed){delete d.error;d.reason=parsed.reason;d.rejected=parsed.rejected;d.tasks=parsed.tasks.map(tk=>{const pid='p'+(++pseq);const e={pid,decision:d.id,...tk,status:'pending'};proposals.set(pid,e);return e})}
      while(proposals.size>300)proposals.delete(proposals.keys().next().value)
    }catch(e){d.error=String(e.message).split(cfg.key||'__no_secret__').join(cfg.key?'***':'__no_secret__').slice(0,300);d.ms=now()-t;history.unshift(d);history.length=Math.min(history.length,30);audit('error',d);throw fail(e.status||(['NO_KEY','BAD_PROVIDER','BAD_URL'].includes(e.code)?503:502),d.error)}
    finally{active.delete(ac);if(signal)signal.removeEventListener('abort',abort)}
    d.ms=now()-t;d.promptHash=crypto.createHash('sha256').update(p.system+'\\n'+p.user).digest('hex');audit('decision',d)
`+s.slice(end)
 s=rep(s,"try { const t = engine.enqueue", "const why=safetyReason(p,engine.state());if(why)throw fail(409,why)\n    try { const t = engine.enqueue")
 s=rep(s,"p.taskId = t.id; return", "p.taskId = t.id; audit('approved',{pid,taskId:t.id}); return")
 s=rep(s,"p.status = 'rejected'; return", "p.status = 'rejected'; audit('rejected',{pid}); return")
 s=rep(s,'const view = d => ({ id:', 'const view = d => sanitize({ promptVersion:d.promptVersion, attempts:d.attempts, id:')
 s=rep(s,'autonomy: false, autoApprove, deny, history:', 'autonomy: false, autoApprove, deny, usage:{...usage}, promptVersion:PROMPT_VERSION, history:')
 s=rep(s,'SYSTEM, MAX_TASKS }', 'SYSTEM, MAX_TASKS, PROMPT_VERSION, DECISION_TOOL, safetyReason }')
 return s
})
edit('tests/director.test.js','// retry-expectation-v1',s=>{
 s=rep(s,'r.usage.in === 100', 'r.usage.in === 200')
 s=rep(s,'called === 1 &&', 'called === 2 &&')
 return '// retry-expectation-v1: validator mencoba satu kali lagi, token dijumlahkan.\n'+s
})
console.log('Director L1 terpasang')
