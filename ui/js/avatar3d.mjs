// Renderer GLB per bot; renderer tetap hidup saat aset diganti.
import * as THREE from '../vendor/three.module.mjs'
import { GLTFLoader } from '../vendor/GLTFLoader.mjs'
import { h, clear } from './dom.mjs'

const ALIASES = {
  idle: ['cafe_idle', 'normal_idle', 'idle', 'stand', 'breath', 'wait'],
  working: ['work', 'walk', 'move_ing', 'run', 'action', 'cast', 'fish', 'farm'],
  happy: ['happy', 'smile', 'wave', 'cheer', 'joy', 'victory'],
  tired: ['tired', 'sleep', 'yawn', 'rest'],
  sad: ['sad', 'cry', 'down'],
  danger: ['damage', 'hurt', 'hit', 'danger', 'fear', 'panic']
}
export function animationState (state = {}, persona = {}) {
  if (Number.isFinite(state.health) && state.health < 6) return 'danger'
  if (state.currentTaskId) return 'working'
  if (Number.isFinite(persona.needs?.energy) && persona.needs.energy < .3) return 'tired'
  if (Number.isFinite(persona.affection) && persona.affection < .25 ||
      Number.isFinite(persona.needs?.security) && persona.needs.security < .25) return 'sad'
  return persona.affection > .75 ? 'happy' : 'idle'
}
export function chooseClip (names, state, config = {}) {
  const list = (names || []).filter(x => typeof x === 'string')
  const exact = name => list.find(x => x === name) || list.find(x => x.toLowerCase() === String(name || '').toLowerCase())
  if (config.animationMode === 'manual') return exact(config.manualAnimation) || null
  const mapped = exact(config.animationMap?.[state])
  if (mapped) return mapped
  const match = words => words.map(w => list.find(x => x.toLowerCase().includes(w))).find(Boolean)
  return match(ALIASES[state] || ALIASES.idle) || match(ALIASES.idle) || list[0] || null
}

// Periksa container dan kebutuhan decoder sebelum mengalokasikan renderer/aset.
export function inspectGlb (buffer) {
  const view = new DataView(buffer)
  if (buffer.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 ||
      view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) {
    throw new Error('Berkas bukan GLB 2.0 yang utuh. Ekspor ulang sebagai glTF Binary (.glb).')
  }
  const length = view.getUint32(12, true)
  if (view.getUint32(16, true) !== 0x4e4f534a || 20 + length > buffer.byteLength) throw new Error('Metadata GLB rusak.')
  let json
  try { json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length))) } catch (_) { throw new Error('Metadata GLB tidak dapat dibaca.') }
  const supported = ['KHR_lights_punctual', 'KHR_materials_clearcoat', 'KHR_materials_pbrSpecularGlossiness',
    'KHR_materials_transmission', 'KHR_materials_unlit', 'KHR_texture_transform', 'KHR_mesh_quantization', 'EXT_texture_webp']
  const compressed = ['KHR_draco_mesh_compression', 'KHR_texture_basisu', 'EXT_meshopt_compression']
  const unsupported = [...new Set([
    ...(json.extensionsRequired || []).filter(x => !supported.includes(x)),
    ...(json.extensionsUsed || []).filter(x => compressed.includes(x))
  ])]
  if (unsupported.length) throw new Error('Ekstensi belum didukung: ' + unsupported.join(', ') + '. Ekspor GLB tanpa kompresi tersebut.')
  if ([...(json.buffers || []), ...(json.images || [])].some(x => x.uri && !x.uri.startsWith('data:'))) {
    throw new Error('Model memakai berkas eksternal. Ekspor GLB dengan tekstur dan buffer tertanam.')
  }
  return json
}

function release (root) {
  if (!root) return
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set()
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry)
    if (object.skeleton) skeletons.add(object.skeleton)
    for (const material of [].concat(object.material || [])) {
      materials.add(material)
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
    }
  })
  for (const texture of textures) { texture.image?.close?.(); texture.dispose() }
  for (const material of materials) material.dispose()
  for (const geometry of geometries) geometry.dispose()
  for (const skeleton of skeletons) skeleton.dispose()
}

export function createAvatar3d (api, getId, fallback) {
  const canvas = h('canvas', { className: 'avatar-canvas', 'aria-label': 'Model 3D bot; geser untuk memutar' })
  const host = h('div', { className: 'avatar-render' }, canvas)
  const status = h('div', { className: 'avatar-status mut', role: 'status' })
  const saved = h('div', { className: 'avatar-status mut', role: 'status' })
  const controls = h('div', { className: 'avatar-controls' })
  const modelSel = h('select', { 'aria-label': 'Model bot', className: 'avatar-model' })
  const modeSel = h('select', { 'aria-label': 'Mode animasi' }, h('option', { value: 'auto' }, 'Otomatis'), h('option', { value: 'manual' }, 'Manual'))
  const manualSel = h('select', { 'aria-label': 'Clip animasi', className: 'avatar-clip' })
  const scale = h('input', { type: 'range', min: .1, max: 5, step: .01, 'aria-label': 'Ukuran model' })
  const rotation = h('input', { type: 'range', min: -180, max: 180, step: 1, 'aria-label': 'Rotasi model' })
  const refresh = h('button', { type: 'button' }, 'Muat ulang model')
  let profile, clips = [], desired = 'idle', renderer, scene, camera, mixer, model, pivot, currentAction
  let generation = 0, controller, raf = 0, previousTime = 0, lastWidth = 0, lastHeight = 0
  let saveTimer, saveChain = Promise.resolve(), saveVersion = 0, profileVersion = 0, modelVersion = 0, profileId, disposed = false, dragX = null
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null

  function resize () {
    if (!renderer || !camera) return
    const width = host.clientWidth, height = host.clientHeight
    if (!width || !height || width === lastWidth && height === lastHeight) return
    lastWidth = width; lastHeight = height
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    fitCamera()
  }
  function fitCamera () {
    if (!camera) return
    const distance = 1.25 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(1, camera.aspect)
    camera.position.set(0, 0, distance)
    camera.near = .01; camera.far = Math.max(100, distance * 10)
    camera.lookAt(0, 0, 0); camera.updateProjectionMatrix()
  }
  function ensureRenderer () {
    if (renderer) return
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2))
    renderer.outputEncoding = THREE.sRGBEncoding
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(35, 1, .01, 100)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x443355, 1))
    const key = new THREE.DirectionalLight(0xffffff, 1.2)
    key.position.set(3, 5, 4); scene.add(key)
    resize(); observer?.observe(host)
    if (!raf) raf = requestAnimationFrame(frame)
  }
  function frame (time) {
    if (disposed) return
    raf = requestAnimationFrame(frame)
    const delta = previousTime ? Math.min(.1, (time - previousTime) / 1000) : 0
    previousTime = time
    if (!renderer || document.hidden || host.style.display === 'none' || renderer.getContext().isContextLost()) return
    resize()
    mixer?.update(delta)
    renderer.render(scene, camera)
  }
  function clearModel () {
    if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(model) }
    if (pivot) scene.remove(pivot)
    release(model)
    model = pivot = mixer = currentAction = null
    clips = []
  }
  function calibrate () {
    if (!pivot || !profile) return
    pivot.scale.setScalar(profile.config.scale || 1)
    pivot.rotation.y = THREE.MathUtils.degToRad(profile.config.rotationY || 0)
  }
  function play () {
    if (!model || !profile) return
    const name = chooseClip(clips.map(c => c.name), desired, profile.config)
    const clip = clips.find(c => c.name === name)
    if (!clip) {
      mixer?.stopAllAction(); currentAction = null
      status.textContent = clips.length ? 'Pilih clip untuk animasi manual.' : 'Model tampil tanpa animasi bawaan.'
      return
    }
    const next = mixer.clipAction(clip)
    if (next !== currentAction) {
      currentAction?.fadeOut(.25)
      next.reset().fadeIn(.25).play(); currentAction = next
    }
    status.textContent = clips.length + ' animasi · ' + clip.name + ' · ' + desired
  }
  function buildControls () {
    clear(modelSel)
    modelSel.append(h('option', { value: '' }, 'Tanpa model 3D'))
    for (const name of profile.models) modelSel.append(h('option', { value: name }, name))
    modelSel.value = profile.config.model || ''
    modeSel.value = profile.config.animationMode
    scale.max = Math.max(5, profile.config.scale || 1)
    scale.value = profile.config.scale || 1
    rotation.value = profile.config.rotationY || 0
    clear(manualSel); manualSel.append(h('option', { value: '' }, 'Pilih animasi'))
    for (const clip of clips) manualSel.append(h('option', { value: clip.name }, clip.name))
    manualSel.value = profile.config.manualAnimation || ''
    const mapBox = h('div', { className: 'animation-map' })
    for (const state of profile.states) {
      const select = h('select', { 'aria-label': 'Animasi ' + state }, h('option', { value: '' }, 'Otomatis'))
      for (const clip of clips) select.append(h('option', { value: clip.name }, clip.name))
      select.value = profile.config.animationMap?.[state] || ''
      select.onchange = () => change({ animationMap: { ...profile.config.animationMap, [state]: select.value || null } })
      mapBox.append(h('label', {}, state, select))
    }
    clear(controls)
    controls.append(modelSel, refresh, h('div', { className: 'avatar-control-row' }, modeSel, manualSel),
      h('label', { className: 'scale-row' }, 'Ukuran', scale),
      h('label', { className: 'scale-row' }, 'Rotasi', rotation),
      h('details', {}, h('summary', {}, 'Pemetaan animasi'), mapBox), status, saved)
  }
  function persist () {
    clearTimeout(saveTimer); saveTimer = null
    if (!profile || disposed) return saveChain
    const id = profileId, version = ++saveVersion, owner = profileVersion
    const config = JSON.parse(JSON.stringify(profile.config))
    saved.textContent = 'Menyimpan...'
    saveChain = saveChain.catch(() => {}).then(() => api.updateProfile(id, config)).then(() => {
      if (!disposed && owner === profileVersion && version === saveVersion) saved.textContent = 'Tersimpan otomatis'
    }).catch(error => {
      if (!disposed && owner === profileVersion && version === saveVersion) saved.textContent = 'Belum tersimpan: ' + error.message
    })
    return saveChain
  }
  function change (patch) {
    if (!profile) return
    Object.assign(profile.config, patch)
    calibrate(); play()
    ++saveVersion
    saved.textContent = 'Perubahan belum tersimpan...'
    clearTimeout(saveTimer); saveTimer = setTimeout(persist, 300)
  }
  async function loadModel () {
    const mine = ++generation
    controller?.abort(); controller = new AbortController()
    const signal = controller.signal
    clearModel()
    buildControls()
    if (!profile?.modelUrl) {
      fallback.style.display = ''; host.style.display = 'none'
      status.textContent = 'Taruh GLB di data/models, lalu muat ulang daftar.'
      return
    }
    host.style.display = ''; fallback.style.display = 'none'
    status.textContent = 'Mengunduh ' + profile.config.model + '...'
    const timeout = setTimeout(() => controller?.signal === signal && controller.abort(), 60000)
    let loaded
    try {
      const response = await fetch(profile.modelUrl, { credentials: 'same-origin', signal })
      if (!response.ok) throw new Error('Unduhan model gagal (HTTP ' + response.status + ').')
      const buffer = await response.arrayBuffer()
      if (mine !== generation || disposed) return
      inspectGlb(buffer)
      status.textContent = 'Membaca model dan tekstur...'
      const manager = new THREE.LoadingManager()
      const textureErrors = []
      manager.onError = url => textureErrors.push(url)
      const loader = new GLTFLoader(manager)
      loaded = await new Promise((resolve, reject) => loader.parse(buffer, '', resolve, reject))
      if (mine !== generation || disposed) { release(loaded.scene); return }
      if (textureErrors.length) throw new Error('Tekstur gagal dimuat; periksa format gambar dan izin browser.')
      ensureRenderer()
      model = loaded.scene
      model.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(model)
      const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3())
      const extent = Math.max(size.x, size.y, size.z)
      if (!Number.isFinite(extent) || extent <= 0) throw new Error('Model tidak memiliki geometri yang terlihat.')
      // Wrapper terpisah: animasi root/bone tidak menimpa framing dan kalibrasi.
      const normalized = new THREE.Group()
      normalized.scale.setScalar(2 / extent)
      const offset = new THREE.Group()
      offset.position.copy(center).multiplyScalar(-1); offset.add(model); normalized.add(offset)
      pivot = new THREE.Group(); pivot.add(normalized); scene.add(pivot)
      clips = loaded.animations || []
      mixer = clips.length ? new THREE.AnimationMixer(model) : null
      calibrate(); resize(); buildControls(); play()
    } catch (error) {
      if (mine !== generation || disposed) { if (loaded) release(loaded.scene); return }
      if (loaded && loaded.scene !== model) release(loaded.scene)
      clearModel()
      fallback.style.display = ''; host.style.display = 'none'
      buildControls()
      status.textContent = signal.aborted ? 'Unduhan terlalu lama. Tekan Muat ulang model.' : 'Model gagal: ' + (error.message || String(error))
    } finally { clearTimeout(timeout) }
  }
  async function loadProfile () {
    if (saveTimer && profile) persist()
    clearTimeout(saveTimer); saveTimer = null
    ++modelVersion
    const mine = ++profileVersion, id = getId()
    ++generation; controller?.abort(); clearModel()
    profile = null; host.style.display = 'none'; fallback.style.display = ''
    controls.inert = true
    try {
      await saveChain
      if (!id || disposed || mine !== profileVersion) return
      const next = await api.profile(id)
      if (disposed || mine !== profileVersion || id !== getId()) return
      profile = next; profileId = id; saved.textContent = ''
      await loadModel()
    } catch (error) { if (mine === profileVersion) status.textContent = 'Profil gagal: ' + error.message }
    finally { if (mine === profileVersion) controls.inert = false }
  }
  modelSel.onchange = async () => {
    if (!profile) return
    const name = modelSel.value || null, id = profileId, owner = profileVersion, choice = ++modelVersion
    controls.inert = true
    clearTimeout(saveTimer)
    await persist()
    if (owner !== profileVersion || choice !== modelVersion || disposed) return
    // Invalidasi segera, sebelum respons model sebelumnya sempat terpasang.
    ++generation; controller?.abort()
    controls.inert = true; saved.textContent = 'Menyimpan pilihan model...'
    try {
      saveChain = saveChain.catch(() => {}).then(() => api.updateProfile(id, { model: name }))
      const next = await saveChain
      if (owner !== profileVersion || choice !== modelVersion || id !== getId() || disposed) return
      profile = next; saved.textContent = 'Tersimpan otomatis'
      await loadModel()
    } catch (error) {
      if (owner === profileVersion && choice === modelVersion) { modelSel.value = profile.config.model || ''; saved.textContent = 'Pilihan belum tersimpan: ' + error.message }
    } finally { if (owner === profileVersion && choice === modelVersion) controls.inert = false }
  }
  refresh.onclick = loadProfile
  modeSel.onchange = () => change({ animationMode: modeSel.value, manualAnimation: manualSel.value || null })
  manualSel.onchange = () => { modeSel.value = 'manual'; change({ animationMode: 'manual', manualAnimation: manualSel.value || null }) }
  scale.oninput = () => change({ scale: Number(scale.value) })
  rotation.oninput = () => change({ rotationY: Number(rotation.value) })
  canvas.onpointerdown = event => { dragX = event.clientX; canvas.setPointerCapture(event.pointerId) }
  canvas.onpointermove = event => {
    if (dragX === null || !pivot) return
    const degrees = ((profile.config.rotationY || 0) + (event.clientX - dragX) * .7 + 540) % 360 - 180
    dragX = event.clientX; rotation.value = degrees; change({ rotationY: degrees })
  }
  canvas.onpointerup = canvas.onpointercancel = () => { dragX = null }
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); status.textContent = 'Konteks 3D terputus; menunggu browser memulihkan.' })
  canvas.addEventListener('webglcontextrestored', () => { if (!disposed) loadModel() })
  function dispose () {
    disposed = true; ++generation; ++profileVersion; controller?.abort()
    clearTimeout(saveTimer); cancelAnimationFrame(raf); observer?.disconnect()
    clearModel(); renderer?.dispose(); renderer = null
  }
  host.style.display = 'none'
  controls.append(refresh, status, saved)
  return { el: host, controls, loadProfile, dispose, update (state, persona) { desired = animationState(state, persona); if (model) play() }, get profile () { return profile } }
}
