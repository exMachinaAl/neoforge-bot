const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { Worker } = require('node:worker_threads')
const { spawn } = require('node:child_process')
const { sandboxPolicy } = require('./permissions')
const validName = name => typeof name === 'string' && /^[a-z][a-z0-9_-]{0,39}$/.test(name)

function evaluate (code, input, world, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Error('ABORTED'))
    const worker = new Worker(path.join(__dirname, 'sandbox-worker.js'), {
      workerData: { code, input, world }, resourceLimits: { maxOldGenerationSizeMb: 64 } })
    let done = false
    const finish = (error, output) => {
      if (done) return
      done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort)
      worker.terminate().catch(() => {})
      error ? reject(error) : resolve(output)
    }
    const abort = () => finish(Error('ABORTED'))
    const timer = setTimeout(() => finish(Error('Sandbox timeout')), 5000)
    signal?.addEventListener('abort', abort, { once: true })
    worker.on('message', r => finish(r.ok ? null : Error(r.error), r.output))
    worker.on('error', e => finish(e))
    worker.on('exit', code => { if (!done) finish(Error('Sandbox berhenti: ' + code)) })
  })
}

function commandSpec (command, policy, env = process.env) {
  if (typeof command !== 'string' || !command.trim() || command.length > 8000) throw Error('command harus 1..8000 karakter')
  if (policy.unsafeHost) return process.platform === 'win32'
    ? { bin: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', command], unsafe: true }
    : { bin: env.SHELL || (env.PREFIX ? path.join(env.PREFIX, 'bin', 'sh') : '/bin/sh'), args: ['-c', command], unsafe: true }
  const image = env.ARCADIA_SANDBOX_IMAGE || 'node:22-alpine'
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/@:-]{0,200}$/.test(image)) throw Error('nama image sandbox tidak valid')
  const name = 'arcadia-' + crypto.randomUUID()
  return { bin: 'docker', name, args: ['run', '--rm', '--pull=never', '--name', name,
    '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--pids-limit=64', '--memory=128m', '--cpus=0.5', '--user=65534:65534',
    '--tmpfs=/work:rw,nosuid,nodev,size=16m,mode=1777', '--workdir=/work', image, 'sh', '-lc', command] }
}
function executeCommand (spec, cwd, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Error('ABORTED'))
    // Tidak mewariskan API key, NODE_OPTIONS, HOME atau credential Docker khusus.
    const env = {}
    for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'DOCKER_HOST']) {
      if (process.env[key]) env[key] = process.env[key]
    }
    const child = spawn(spec.bin, spec.args, { cwd, env, windowsHide: true,
      detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
    let output = '', killed = false, done = false
    const cleanupContainer = () => {
      if (!spec.name) return
      const cleanup = spawn('docker', ['rm', '-f', spec.name], { env, windowsHide: true, stdio: 'ignore', timeout: 5000 })
      cleanup.on('error', () => {})
    }
    const kill = () => {
      if (killed) return
      killed = true
      if (child.pid) {
        if (process.platform === 'win32') {
          const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
          killer.on('error', () => {})
        } else { try { process.kill(-child.pid, 'SIGKILL') } catch (_) {} }
      }
      cleanupContainer()
    }
    const finish = (error, code) => {
      if (done) return
      done = true; clearTimeout(timer); signal?.removeEventListener('abort', kill)
      if (killed) cleanupContainer()
      error ? reject(error) : resolve({ ok: code === 0 && !killed, code: killed ? 'ABORTED' : code === 0 ? 'OK' : 'COMMAND_FAILED', output, exitCode: code })
    }
    const timer = setTimeout(kill, 15000)
    signal?.addEventListener('abort', kill, { once: true })
    const collect = chunk => { output += chunk.toString(); if (output.length > 32768) { output = output.slice(0, 32768); kill() } }
    child.stdout.on('data', collect); child.stderr.on('data', collect)
    child.on('error', e => finish(Error('Command sandbox gagal: ' + e.message + '. Production memerlukan Docker dan image yang sudah tersedia.')))
    child.on('close', code => finish(null, code))
  })
}
function createSandbox ({ dataDir, env = process.env }) {
  const directory = path.resolve(dataDir, 'agent-tools')
  const file = path.join(directory, 'tools.json')
  const policy = sandboxPolicy(env)
  if (policy.warning) console.warn('[sandbox] ' + policy.warning)
  let tools = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
  const list = () => Object.entries(tools).map(([name, t]) => ({ name, description: t.description, hash: t.hash, tested: t.tested }))
  const persist = () => {
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(file + '.tmp', JSON.stringify(tools, null, 2)); fs.renameSync(file + '.tmp', file)
  }
  return {
    policy, list,
    async define ({ name, description = '', code, input = {} }, world, signal) {
      if (!validName(name) || typeof code !== 'string' || code.length > 16000 || !code.trim()) throw Error('nama/source tool tidak valid')
      if (!Object.hasOwn(tools, name) && Object.keys(tools).length >= 50) throw Error('maksimum 50 tool per bot')
      const output = await evaluate(code, input, world, signal)
      if (signal?.aborted) throw Error('ABORTED')
      const hash = crypto.createHash('sha256').update(code).digest('hex')
      tools[name] = { code, description: String(description).slice(0, 300), hash, tested: true }
      persist()
      return { name, hash, tested: true, testOutput: output, note: 'Test tidak menjalankan task dunia.' }
    },
    async run (name, input, world, signal) {
      if (!validName(name) || !Object.hasOwn(tools, name)) throw Error('tool tidak ditemukan')
      return evaluate(tools[name].code, input || {}, world, signal)
    },
    command (text, signal) {
      fs.mkdirSync(directory, { recursive: true })
      return executeCommand(commandSpec(text, policy, env), directory, signal)
    }
  }
}
module.exports = { createSandbox, evaluate, commandSpec }
