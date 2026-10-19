// Uji browser opsional: node tests/avatar-browser.test.js
// Memakai Edge lokal, GLB asli, API profil dan CSP asli; tanpa koneksi Minecraft/LLM.
const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const assert = require('assert/strict')
const { spawn } = require('child_process')
const { createStatic } = require('../control/static')
const { createProfile3d } = require('../control/profile3d')
const root = path.resolve(__dirname, '..')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'arcadia-avatar-browser-'))
const edgePath = process.env.ARCADIA_TEST_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
let server, browser, socket
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const html = '<!doctype html><html><head><link rel="stylesheet" href="/ui/css/app.css"></head><body><main id="test"></main><script type="module" src="/test.mjs"></script></body></html>'
const moduleSource = [
  "import {createAvatar3d} from '/ui/js/avatar3d.mjs';",
  "const stage=document.createElement('div');stage.className='life-stage';stage.style.height='460px';",
  "const fallback=document.createElement('div');fallback.textContent='Fallback';stage.append(fallback);",
  "const api={profile:async()=>{const r=await fetch('/profile');return r.json()},updateProfile:async(id,body)=>{const r=await fetch('/profile',{method:'POST',body:JSON.stringify(body)});if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}};",
  "const avatar=createAvatar3d(api,()=> 'BrowserBot',fallback);stage.append(avatar.el);",
  "const panel=document.getElementById('test');panel.className='panel';panel.style.width='460px';panel.append(stage,avatar.controls);",
  "window.avatarTest={avatar,stage,api};await avatar.loadProfile();window.avatarReady=true;"
].join('\n')

async function main () {
  if (!fs.existsSync(edgePath)) throw new Error('Edge tidak ditemukan; atur ARCADIA_TEST_EDGE')
  const dataDir = path.join(temp, 'data')
  fs.mkdirSync(path.join(dataDir, 'models'), { recursive: true })
  for (const name of ['Momoi.glb', 'arcadia-calibration.glb']) {
    const source = path.join(root, 'data', 'models', name)
    if (!fs.existsSync(source)) throw new Error('Aset uji belum tersedia: ' + name)
    fs.copyFileSync(source, path.join(dataDir, 'models', name))
  }
  // Varian tanpa animasi menggunakan geometri/aset yang sama, untuk uji fallback statis.
  const original = fs.readFileSync(path.join(dataDir, 'models', 'arcadia-calibration.glb'))
  const jsonLength = original.readUInt32LE(12)
  const json = JSON.parse(original.subarray(20, 20 + jsonLength).toString('utf8'))
  function variant (name, transform) {
    const doc = JSON.parse(JSON.stringify(json)); transform(doc)
    const text = Buffer.from(JSON.stringify(doc)), padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32)
    text.copy(padded)
    const tail = original.subarray(20 + jsonLength), result = Buffer.alloc(20 + padded.length + tail.length)
    original.copy(result, 0, 0, 20); result.writeUInt32LE(result.length, 8); result.writeUInt32LE(padded.length, 12)
    padded.copy(result, 20); tail.copy(result, 20 + padded.length)
    fs.writeFileSync(path.join(dataDir, 'models', name), result)
  }
  variant('Static.glb', doc => { delete doc.animations })
  variant('Unsupported.glb', doc => { doc.extensionsRequired = ['UNSUPPORTED_test'] })
  fs.writeFileSync(path.join(dataDir, 'models', 'Broken.glb'), 'invalid')
  const profile = createProfile3d({ dataDir })
  profile.update('BrowserBot', { model: 'Momoi.glb' })
  fs.writeFileSync(path.join(temp, 'index.html'), html)
  fs.writeFileSync(path.join(temp, 'test.mjs'), moduleSource)
  const page = createStatic({ root: temp, prefix: '/' })
  const ui = createStatic({ root: path.join(root, 'ui'), prefix: '/ui/', maxBytes: 2 * 1024 * 1024 })
  server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/profile') {
        if (req.method === 'POST') {
          let body = ''; for await (const chunk of req) body += chunk
          profile.update('BrowserBot', JSON.parse(body))
        }
        res.setHeader('content-type', 'application/json')
        return res.end(JSON.stringify(profile.publicProfile('BrowserBot')))
      }
      const match = req.url.match(/^\/bots\/BrowserBot\/profile\/model\/([^/]+)$/)
      if (match) {
        const file = profile.resolveModel(decodeURIComponent(match[1]))
        res.writeHead(200, { 'content-type': 'model/gltf-binary', 'content-length': file.size })
        return fs.createReadStream(file.full).pipe(res)
      }
      if (ui.handle(req, res, req.url)) return
      page.handle(req, res, req.url === '/' ? '/index.html' : req.url)
    } catch (error) { res.statusCode = error.status || 500; res.end(error.message) }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = 'http://127.0.0.1:' + server.address().port + '/'
  const edgeProfile = path.join(temp, 'edge')
  browser = spawn(edgePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--remote-debugging-port=0', '--user-data-dir=' + edgeProfile, '--window-size=700,1000', url],
  { windowsHide: true, stdio: 'ignore' })
  browser.on('error', error => { console.error(error.message) })
  const activePort = path.join(edgeProfile, 'DevToolsActivePort')
  for (let i = 0; !fs.existsSync(activePort) && i < 100; i++) await sleep(100)
  const port = fs.readFileSync(activePort, 'utf8').split('\n')[0]
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json')).json()
  const target = targets.find(t => t.url === url)
  assert(target, 'halaman pengujian harus tersedia')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let sequence = 0
  const pending = new Map(), errors = []
  socket.onmessage = event => {
    const m = JSON.parse(event.data)
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text)
    if (pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id)
      m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result)
    }
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result.value
  }
  async function waitFor (expression) {
    for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await sleep(100) }
    throw Error('Timeout: ' + expression + '\n' + await evaluate('document.body.innerText'))
  }
  await send('Runtime.enable')
  await send('Page.reload', { ignoreCache: true })
  await waitFor("window.avatarReady && document.querySelector('.avatar-status').textContent.includes('37 animasi')")
  await evaluate("window.originalCanvas=document.querySelector('canvas');window.originalContext=originalCanvas.getContext('webgl2')||originalCanvas.getContext('webgl');")
  console.log('PASS Momoi: 37 clip, tekstur tertanam dimuat tanpa kegagalan loader')
  const selectModel = async name => {
    await evaluate("(async()=>{const s=document.querySelector('.avatar-model');s.value=" + JSON.stringify(name) + ";await s.onchange()})()")
  }
  await evaluate("(()=>{const s=document.querySelector('.avatar-clip');s.value='Cafe_Walk';s.onchange()})()")
  await waitFor("document.body.innerText.includes('Tersimpan otomatis')")
  assert.equal(profile.load('BrowserBot').manualAnimation, 'Cafe_Walk')
  console.log('PASS clip manual dan penyimpanan otomatis')
  await selectModel('arcadia-calibration.glb')
  await waitFor("document.querySelector('.avatar-status').textContent.includes('5 animasi')")
  assert.equal(profile.load('BrowserBot').animationMode, 'auto')
  await selectModel('Momoi.glb')
  await waitFor("document.querySelector('.avatar-status').textContent.includes('Cafe_Walk')")
  assert(await evaluate("document.querySelector('canvas')===originalCanvas && !originalContext.isContextLost()"))
  console.log('PASS ganti Momoi → model lain → Momoi; kalibrasi pulih, kanvas/konteks tetap')
  await evaluate("avatarTest.stage.style.height='320px';avatarTest.stage.parentElement.style.width='350px'")
  await sleep(350)
  assert(await evaluate("document.querySelector('canvas').height===Math.round(320*Math.min(devicePixelRatio,2))"))
  console.log('PASS resize kanvas')
  fs.mkdirSync(path.join(root, 'backup'), { recursive: true })
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(path.join(root, 'backup', 'avatar-momoi.png'), Buffer.from(shot.data, 'base64'))
  await selectModel('Static.glb')
  await waitFor("document.body.innerText.includes('tanpa animasi bawaan')")
  await selectModel('Broken.glb')
  await waitFor("document.body.innerText.includes('GLB 2.0')")
  await selectModel('Unsupported.glb')
  await waitFor("document.body.innerText.includes('UNSUPPORTED_test')")
  await selectModel('Momoi.glb')
  await waitFor("document.querySelector('.avatar-status').textContent.includes('37 animasi')")
  console.log('PASS model statis, pesan file rusak/ekstensi tak didukung, dan pemulihan ke Momoi')

  await evaluate("(async()=>{const s=document.querySelector('.avatar-model');s.value='arcadia-calibration.glb';const first=s.onchange();s.value='Momoi.glb';await s.onchange();await first})()")
  await waitFor("document.querySelector('.avatar-status').textContent.includes('37 animasi')")
  assert.equal(profile.load('BrowserBot').model, 'Momoi.glb')
  console.log('PASS pilihan cepat tidak memasang model usang')
  await evaluate("(()=>{const r=document.querySelector('input[aria-label=\"Rotasi model\"]');r.value=35;r.oninput();return avatarTest.avatar.loadProfile()})()")
  assert.equal(profile.load('BrowserBot').rotationY, 35)
  console.log('PASS muat ulang saat debounce menyimpan perubahan terakhir')

  assert.deepEqual(errors, [])
  console.log('PASS tidak ada exception browser; screenshot backup/avatar-momoi.png')
  await send('Browser.close').catch(() => {})
}
const deadline = setTimeout(() => { console.error('Browser test melebihi 90 detik'); process.exit(1) }, 90000)
main().catch(error => { console.error(error.stack); process.exitCode = 1 }).finally(async () => {
  clearTimeout(deadline); socket?.close(); browser?.kill()
  if (server) { server.closeAllConnections(); server.close() }
  // Temp dimiliki tes ini. Edge dapat menahan file sesaat; jangan hapus direktori lain.
  await sleep(500)
  try { if (temp.startsWith(path.join(os.tmpdir(), 'arcadia-avatar-browser-'))) fs.rmSync(temp, { recursive: true, force: true }) } catch (_) {}
})
