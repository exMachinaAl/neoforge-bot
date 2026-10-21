// orchestrator/llm.js - klien model langsung (tanpa SDK): anthropic | openai (juga server lokal yang kompatibel). Kunci hanya dari env; tidak pernah masuk log/hasil.
const DEFAULTS = {
  anthropic: { url: 'https://api.anthropic.com', model: 'claude-haiku-4-5-20251001' },
  openai: { url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
}
const int = (v, d, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }
function configFromEnv (env = process.env) {
  if (env === process.env) require('../env').loadProjectEnv()
  const provider = String(env.ARCADIA_LLM_PROVIDER || 'anthropic').toLowerCase()
  const d = DEFAULTS[provider] || DEFAULTS.anthropic
  const url = String(env.ARCADIA_LLM_URL || d.url).replace(/\/+$/, '')
  const key = env.ARCADIA_LLM_KEY || (provider === 'anthropic' ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY) || ''
  const local = provider === 'openai' && (() => { try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname) } catch { return false } })() // loopback-auth-v1: cloud selalu membutuhkan key
  return { provider, url, key, model: env.ARCADIA_LLM_MODEL || d.model, maxTokens: int(env.ARCADIA_LLM_MAX_TOKENS, 1024, 128, 4096), timeoutMs: int(env.ARCADIA_LLM_TIMEOUT_MS, 60000, 1000, 300000), rpm: int(env.ARCADIA_LLM_RPM, 6, 1, 60), needsKey: !local }
}
const redact = (s, key) => { let t = String(s); if (key) t = t.split(key).join('***'); return t }
const publicConfig = c => ({ provider: c.provider, model: c.model, url: c.url, rpm: c.rpm, configured: !!c.key || !c.needsKey })

// satu panggilan; mengembalikan { text, usage: {in,out}, model }
async function callModel (cfg, { system, user, signal, tool, onRetry }) {
  if (!DEFAULTS[cfg.provider]) throw Object.assign(new Error('provider tidak dikenal: ' + cfg.provider + ' (anthropic|openai)'), { code: 'BAD_PROVIDER' })
  if (cfg.needsKey && !cfg.key) throw Object.assign(new Error('ARCADIA_LLM_KEY belum diisi'), { code: 'NO_KEY' })
  if (!/^https?:\/\//.test(cfg.url)) throw Object.assign(new Error('ARCADIA_LLM_URL harus http(s)'), { code: 'BAD_URL' })
  const ac = new AbortController(); const timer = setTimeout(() => ac.abort(new Error('timeout')), cfg.timeoutMs)
  const onAbort = () => ac.abort()
  if (signal) { if (signal.aborted) ac.abort(); else signal.addEventListener('abort', onAbort, { once: true }) }
  let url; let headers; let body
  if (cfg.provider === 'anthropic') {
    url = cfg.url + '/v1/messages'
    headers = { 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' }
    body = { model: cfg.model, max_tokens: cfg.maxTokens, system, messages: [{ role: 'user', content: user }] }
  } else {
    url = cfg.url + '/chat/completions'
    headers = { 'content-type': 'application/json' }; if (cfg.key) headers.authorization = 'Bearer ' + cfg.key
    body = { model: cfg.model, max_tokens: cfg.maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }
  }
  // structured-tools-v1: tool hanya membawa usulan, tidak pernah langsung mengeksekusi skill.
  if (tool) {
    if (cfg.provider === 'anthropic') {
      body.tools=[{name:tool.name,description:tool.description,input_schema:tool.schema}]
      body.tool_choice=tool.required ? {type:'tool',name:tool.name,disable_parallel_tool_use:true} : {type:'auto',disable_parallel_tool_use:true}
    } else {
      body.tools=[{type:'function',function:{name:tool.name,description:tool.description,parameters:tool.schema,strict:false}}]
      body.tool_choice=tool.required ? {type:'function',function:{name:tool.name}} : 'auto'
      body.parallel_tool_calls=false
    }
  }
  try {
    let res
    for(let attempt=0; ; attempt++) {
      res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal, redirect: 'error' })
      if (!(res.status===429 || res.status>=500) || attempt>=2) break
      await res.arrayBuffer()
      const retryAfter=Number(res.headers.get('retry-after'))*1000
      const delay=Math.min(5000,Math.max(Number.isFinite(retryAfter)?retryAfter:0,(cfg.backoffMs??250)*2**attempt))
      await require('timers/promises').setTimeout(delay,undefined,{signal:ac.signal})
      if(onRetry) onRetry()
    }
    const raw = await res.text()
    if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status + ': ' + redact(raw.slice(0, 300), cfg.key)), { code: 'HTTP', httpStatus: res.status })
    let j; try { j = JSON.parse(raw) } catch (e) { throw Object.assign(new Error('balasan bukan JSON: ' + redact(raw.slice(0, 120), cfg.key)), { code: 'BAD_REPLY' }) }
    if (cfg.provider === 'anthropic') {
      const tc=(j.content||[]).filter(c=>c.type==='tool_use'); if(tc.length && (tc.length!==1 || !tool || tc[0].name!==tool.name)) throw Object.assign(new Error('tool model tidak dikenal atau lebih dari satu'),{code:'BAD_REPLY'})
      if(tc.length) return {text:JSON.stringify(tc[0].input),usage:{in:j.usage?.input_tokens,out:j.usage?.output_tokens},model:j.model||cfg.model}
      return { text: (j.content || []).filter(c => c.type === 'text').map(c => c.text).join(''), usage: { in: j.usage && j.usage.input_tokens, out: j.usage && j.usage.output_tokens }, model: j.model || cfg.model } }
    const m = j.choices && j.choices[0] && j.choices[0].message
    const tc=m?.tool_calls||[]
    if(tc.length && (tc.length!==1 || !tool || tc[0].type!=='function' || tc[0].function?.name!==tool.name)) throw Object.assign(new Error('tool model tidak dikenal atau lebih dari satu'),{code:'BAD_REPLY'})
    return { text: tc.length ? tc[0].function.arguments : (m && m.content) || '', usage: { in: j.usage && j.usage.prompt_tokens, out: j.usage && j.usage.completion_tokens }, model: j.model || cfg.model }
  } catch (e) {
    if (e.code) throw e
    throw Object.assign(new Error(redact(e && e.cause && e.cause.message ? e.message + ': ' + e.cause.message : (e && e.message) || 'galat jaringan', cfg.key)), { code: ac.signal.aborted ? 'TIMEOUT' : 'NETWORK' })
  } finally { clearTimeout(timer); if(signal) signal.removeEventListener('abort',onAbort) }
}
module.exports = { callModel, configFromEnv, publicConfig, redact, DEFAULTS }
