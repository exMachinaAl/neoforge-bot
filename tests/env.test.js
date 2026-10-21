const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process')
test('portable .env: default path, precedence, child inheritance, local/cloud and secret-free status', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcadia-env-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, '.env'), secret = 'test-only-not-a-real-key'
  fs.writeFileSync(file, 'ARCADIA_LLM_PROVIDER=openai\nARCADIA_LLM_URL=https://ollama.com/v1\nARCADIA_LLM_MODEL=example-model\nARCADIA_LLM_KEY="'+secret+'"\nARCADIA_LLM_RPM=3\n')
  const env = { ...process.env, ARCADIA_ENV_FILE:file }
  for (const key of Object.keys(env)) if (key.startsWith('ARCADIA_LLM_') || ['OPENAI_API_KEY','ANTHROPIC_API_KEY'].includes(key)) delete env[key]
  const run = (args, extra = {}) => spawnSync(process.execPath,args,{ cwd:path.resolve(__dirname,'..'), env:{...env,...extra},encoding:'utf8' })
  const status = run(['orchestrator/status.js'])
  assert.equal(status.status,0); assert.ok(!status.stdout.includes(secret)); assert.ok(!status.stderr.includes(secret))
  const data=JSON.parse(status.stdout);assert.equal(data.keyPresent,true);assert.equal(data.networkTested,false);assert.equal(data.provider,'openai')
  const override=run(['orchestrator/status.js'],{ARCADIA_LLM_MODEL:'environment-wins'})
  assert.equal(JSON.parse(override.stdout).model,'environment-wins')
  const inherited=run(['-e',"require('./env').loadProjectEnv();const r=require('child_process').spawnSync(process.execPath,['-e','console.log(Boolean(process.env.ARCADIA_LLM_KEY))'],{encoding:'utf8'});process.stdout.write(r.stdout)"])
  assert.equal(inherited.stdout.trim(),'true')
  const local=run(['orchestrator/status.js'],{ARCADIA_LLM_URL:'http://127.0.0.1:11434/v1',ARCADIA_LLM_KEY:''})
  assert.equal(local.status,0);assert.equal(JSON.parse(local.stdout).keyRequired,false)
  const cloud=run(['orchestrator/status.js'],{ARCADIA_LLM_KEY:''})
  assert.equal(cloud.status,1);assert.equal(JSON.parse(cloud.stdout).configured,false)
  const missing=run(['orchestrator/status.js'],{ARCADIA_ENV_FILE:path.join(dir,'absent')})
  assert.equal(missing.status,1);assert.ok(!missing.stderr.includes(secret))
  fs.copyFileSync(path.join(__dirname,'../env.js'),path.join(dir,'env.js'))
  const childEnv={...env};delete childEnv.ARCADIA_ENV_FILE
  const defaultFile=spawnSync(process.execPath,['-e',`require(${JSON.stringify(path.join(dir,'env.js'))}).loadProjectEnv();console.log(process.env.ARCADIA_LLM_MODEL)`],{cwd:os.tmpdir(),env:childEnv,encoding:'utf8'})
  assert.equal(defaultFile.stdout.trim(),'example-model')
})
