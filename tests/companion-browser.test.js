// Opsional: Edge + UI/API/engine asli, bot dan balasan LLM tiruan. Tidak memakai API key.
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http')
const assert = require('node:assert/strict')
const { spawn } = require('child_process')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'arcadia-companion-'))
process.env.ARCADIA_DATA_DIR = temp; process.env.ARCADIA_TASKLOG = 'off'
const { mk } = require('./mock')
const { createRunner } = require('../skills'), { createEngine } = require('../engine')
const { createProfile3d } = require('../control/profile3d')
const root = path.resolve(__dirname, '..'), sleep = ms => new Promise(r => setTimeout(r, ms))
let api, browser, socket, world, lifecycle
async function main () {
  const edge = process.env.ARCADIA_TEST_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  assert.ok(fs.existsSync(edge), 'Edge diperlukan')
  fs.mkdirSync(path.join(temp, 'models'))
  fs.copyFileSync(path.join(root, 'data/models/Momoi.glb'), path.join(temp, 'models/Momoi.glb'))
  const profile = createProfile3d({ dataDir: temp }); profile.update('BrowserBot', { model: 'Momoi.glb' })
  const bot = mk(); bot.username = 'BrowserBot'; bot.game.dimension = 'overworld'; bot.time = { timeOfDay: 2000, isDay: true }
  const runner = createRunner(bot), engine = createEngine(bot, runner)
  lifecycle = require('../lifecycle/runtime').createLifecycle({ bot, runner, engine, dataDir: temp })
  const director = require('../orchestrator/director').createDirector({ bot, runner, engine, deny: [], autoApprove: [],
    cfg: { provider: 'ollama', url: 'http://unused', model: 'test', rpm: 20, needsKey: false },
    llm: async (cfg, request) => ({ text: request.tool ? JSON.stringify({ title: 'Hari yang indah untuk menjelajah', reason: 'Mengunjungi dua tempat bersama.', tasks: [
      { skill: 'nav.goto', params: { x: 2, z: 2 } }, { skill: 'nav.goto', params: { x: 4, z: 4 } }
    ] }) : 'Aku ingat, kamu suka kebun bunga. Kita bisa berkunjung bersama.', usage: { in: 1, out: 1 } }) })
  world = http.createServer((req, res) => res.end('<html><body style="background:#1c2735;color:white">Dunia tiruan untuk menguji kestabilan iframe</body></html>'))
  await new Promise(resolve => world.listen(0, '127.0.0.1', resolve))
  const reservation = http.createServer()
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const reservedPort = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  api = require('../control').start({ bot, runner, engine, port: reservedPort, bind: '127.0.0.1', token: 'browser-test-only' })
  await new Promise(resolve => api.server.listening ? resolve() : api.server.once('listening', resolve))
  const port = api.server.address().port
  require('../control/extend').attach(api, { bot, runner, engine, director, lifecycle }, { dataDir: temp, profile3d: profile,
    viewer: { enabled: true, desired: true, state: 'ready', port: world.address().port, url: 'http://127.0.0.1:' + world.address().port, close () {} } })
  const url = 'http://127.0.0.1:' + port + '/?token=browser-test-only', edgeProfile = path.join(temp, 'edge')
  browser = spawn(edge, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--remote-debugging-port=0', '--user-data-dir=' + edgeProfile, '--window-size=1440,1200', url], { windowsHide: true, stdio: 'ignore' })
  const active = path.join(edgeProfile, 'DevToolsActivePort')
  for (let i = 0; !fs.existsSync(active) && i < 100; i++) await sleep(100)
  const debugPort = fs.readFileSync(active, 'utf8').split('\n')[0]
  const targets = await (await fetch('http://127.0.0.1:' + debugPort + '/json')).json()
  const target = targets.find(t => t.type === 'page' && t.url.includes('127.0.0.1:' + port))
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let sequence = 0; const pending = new Map(), errors = []
  socket.onmessage = event => {
    const m = JSON.parse(event.data)
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
    if (pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result) }
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result.value
  }
  async function waitFor (expression) {
    for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await sleep(100) }
    throw Error('Timeout: ' + expression + '\n' + await evaluate('document.body.innerText'))
  }
  const click = text => evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(text)}).click()`)
  await send('Runtime.enable'); await send('Page.reload', { ignoreCache: true })
  await waitFor("document.querySelector('.avatar-status')?.textContent.includes('37 animasi') && document.querySelector('iframe')")
  await evaluate("window.savedCanvas=document.querySelector('.avatar-canvas');window.savedFrame=document.querySelector('iframe')")
  await click('Ingatan')
  await evaluate("document.querySelector('[aria-label=\"Catatan ingatan\"]').value='Suka kebun bunga'")
  await click('Simpan ingatan'); await waitFor("document.querySelector('.memory-list').textContent.includes('Suka kebun bunga')")
  await evaluate("document.querySelector('[aria-label=\"Pesan atau tujuan\"]').value='Halo, ingat kesukaanku?'")
  await click('Kirim pesan'); await waitFor("document.querySelector('.conversation').textContent.includes('Aku ingat')")
  await evaluate("document.querySelector('[aria-label=\"Pesan atau tujuan\"]').value='Mari menjelajah bersama'")
  await click('Mulai kegiatan'); await waitFor("document.querySelector('.mission-content').textContent.includes('2 / 2 langkah')")
  await click('Dunia bersama'); await sleep(3500)
  assert.equal(await evaluate("savedCanvas===document.querySelector('.avatar-canvas') && savedFrame===document.querySelector('iframe')"), true)
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
  fs.mkdirSync(path.join(root, 'backup'), { recursive: true })
  const desktop = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(root, 'backup/companion-desktop.png'), Buffer.from(desktop.data, 'base64'))
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await sleep(500)
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'tidak overflow horizontal di HP')
  const mobile = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(root, 'backup/companion-mobile.png'), Buffer.from(mobile.data, 'base64'))
  await send('Page.reload', { ignoreCache: true }); await waitFor("document.querySelector('.mission-content')?.textContent.includes('2 / 2 langkah')")
  assert.equal(await evaluate("document.querySelector('.conversation').textContent.includes('Aku ingat')"), true)
  await click('Ingatan')
  await evaluate("Array.from(document.querySelectorAll('.memory-entry')).find(e=>e.textContent.includes('Suka kebun bunga')).querySelector('button').click()")
  await waitFor("!document.querySelector('.memory-list').textContent.includes('Suka kebun bunga')")
  assert.deepEqual(errors, [])
  console.log('PASS companion desktop/HP: GLB, chat, ingatan/hapus, misi 2 langkah, reload persisten; canvas/iframe stabil; tanpa exception')
  await send('Browser.close').catch(() => {})
}
const deadline = setTimeout(() => { console.error('Browser test timeout'); process.exit(1) }, 90000)
main().catch(error => { console.error(error.stack); process.exitCode = 1 }).finally(async () => {
  clearTimeout(deadline); socket?.close(); browser?.kill(); lifecycle?.close()
  if (api) { api.server.closeAllConnections(); api.close() }
  if (world) { world.closeAllConnections(); world.close() }
  await sleep(500)
  if (path.resolve(temp).startsWith(path.join(os.tmpdir(), 'arcadia-companion-'))) { try { fs.rmSync(temp, { recursive: true, force: true }) } catch (_) {} }
})
