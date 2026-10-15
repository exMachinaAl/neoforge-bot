// tests/path.test.js - helper gerak di skills/_util.js: gotoTimed (percobaan ulang PathStopped, Timeout tidak tersamar),
// traceStops (asal stop), approachEntity (mendekati entitas bergerak), steerTo (jalan lurus). Bot tiruan ringan.
const EE = require('events'); const { Vec3 } = require('vec3'); const { goals } = require('mineflayer-pathfinder')
const U = require('../skills/_util')
let pass = 0; let fail = 0
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m) }
const stopErr = () => Object.assign(new Error('Path was stopped before it could be completed! Thus, the desired goal was not reached.'), { name: 'PathStopped' })

function mk (hook) {
  const b = new EE(); b.entity = { position: new Vec3(0.5, 64, 0.5), onGround: true, height: 1.8 }; b.entities = {}; b.ctl = {}; b.calls = 0
  let pending = null
  b.setControlState = (k, v) => { b.ctl[k] = v }; b.lookAt = async () => {}
  b.pathfinder = {
    setGoal () {},
    stop () { if (pending) { const p = pending; pending = null; p(stopErr()) } },
    goto (g) { b.calls++; return new Promise((res, rej) => {
      const h = hook && hook(g, b.calls)
      if (h === 'stopped') return setTimeout(() => rej(stopErr()), 5)
      if (h === 'nopath') return setTimeout(() => rej(Object.assign(new Error('No path to the goal!'), { name: 'NoPath' })), 5)
      pending = rej
      if (h === 'hang') return
      setTimeout(() => { pending = null; b.entity.position = new Vec3(g.x + 0.5, g.y, g.z + 0.5); res() }, 10) }) }
  }
  b.addEnt = (id, x, z) => (b.entities[id] = { id, position: new Vec3(x, 64, z) })
  return b
}
const G = (x, z) => new goals.GoalNear(x, 64, z, 1)

;(async () => {
  let b, e
  b = mk((g, n) => n <= 2 ? 'stopped' : null); await U.gotoTimed(b, G(10, 2), 5000, null)
  ok(b.calls === 3 && Math.floor(b.entity.position.x) === 10, 'gotoTimed: PathStopped dari luar 2x -> dicoba ulang, sampai tujuan (goto ' + b.calls + 'x)')

  b = mk(() => 'stopped'); e = null; try { await U.gotoTimed(b, G(10, 2), 5000, null) } catch (x) { e = x }
  ok(e && e.name === 'PathStopped' && /asal:/.test(e.message) && e.stoppedBy && b.calls === 3, 'gotoTimed: PathStopped terus -> melempar setelah 3 percobaan, pesan memuat asal')

  b = mk(() => 'hang'); e = null; try { await U.gotoTimed(b, G(10, 2), 400, null) } catch (x) { e = x }
  ok(e && e.name === 'Timeout' && b.calls === 1, 'gotoTimed: timeout -> Timeout (bukan PathStopped yang tersamar), tanpa percobaan ulang')

  b = mk(() => 'hang'); const ac = new AbortController(); setTimeout(() => ac.abort('X'), 60); e = null; try { await U.gotoTimed(b, G(10, 2), 5000, ac.signal) } catch (x) { e = x }
  ok(e && e.name === 'PathStopped' && b.calls === 1, 'gotoTimed: abort -> berhenti, tidak dicoba ulang')

  b = mk(() => 'nopath'); e = null; try { await U.gotoTimed(b, G(10, 2), 5000, null) } catch (x) { e = x }
  ok(e && e.name === 'NoPath' && b.calls === 1, 'gotoTimed: NoPath diteruskan apa adanya, tanpa percobaan ulang')

  b = mk(); U.traceStops(b); const pihakLain = () => b.pathfinder.stop(); pihakLain(); U.traceStops(b); b.pathfinder.setGoal(null)
  ok(b.arcadia.pathLog.length === 2 && /pihakLain/.test(b.arcadia.pathLog[0].by) && b.arcadia.pathLog[1].kind === 'setGoal(null)', 'traceStops: mencatat pemanggil stop() dan setGoal(); idempoten')

  b = mk(); b.addEnt(1, 1.5, 1)
  let r = await U.approachEntity(b, b.entities[1], {}, {})
  ok(r.ok && b.calls === 0 && r.via === 'none', 'approachEntity: sudah dalam jangkauan -> tanpa goto')

  b = mk(); b.addEnt(1, 12, 2); r = await U.approachEntity(b, b.entities[1], {}, {})
  ok(r.ok && b.calls === 1 && r.via === 'pathfinder', 'approachEntity: jauh -> satu lompatan pathfinder')

  b = mk(); r = await U.approachEntity(b, { id: 9 }, {}, {})
  ok(!r.ok && r.code === 'TARGET_NOT_FOUND', 'approachEntity: entitas tidak ada -> TARGET_NOT_FOUND')

  b = mk(() => 'nopath'); b.addEnt(1, 14, 2); r = await U.approachEntity(b, b.entities[1], {}, {})
  ok(!r.ok && r.code === 'NO_PATH' && b.calls === 4, 'approachEntity: NoPath di semua langkah -> NO_PATH (jarak jauh: tanpa jalan lurus)')

  b = mk(() => 'stopped'); b.addEnt(1, 6, 1)
  const iv = setInterval(() => { if (b.ctl.forward) b.entity.position = b.entity.position.offset(0.4, 0, 0) }, 20)
  r = await U.approachEntity(b, b.entities[1], {}, {}); clearInterval(iv)
  ok(r.ok && r.via === 'steer', 'approachEntity: pathfinder terus berhenti tetapi jarak pendek -> jalan lurus sampai (via ' + r.via + ')')

  b = mk(() => 'hang'); b.addEnt(1, 14, 2); const ac2 = new AbortController(); setTimeout(() => ac2.abort('X'), 60)
  r = await U.approachEntity(b, b.entities[1], { signal: ac2.signal }, {})
  ok(!r.ok && r.code === 'ABORTED', 'approachEntity: abort -> ABORTED')

  console.log('\nHASIL: ' + pass + ' lulus, ' + fail + ' gagal'); process.exit(fail ? 1 : 0)
})().catch(x => { console.log('EXCEPTION', x); process.exit(1) })
