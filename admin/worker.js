// Hanya dipasang oleh bot.js ketika diluncurkan supervisor admin lewat fork IPC.
function attach ({ bot, engine, api, extension, lifecycle }) {
  if (!process.send) throw Error('Worker memerlukan IPC supervisor')
  let stopping = false
  const send = msg => { if (process.connected) process.send(msg, () => {}) }
  const snapshot = () => send({ type: 'snapshot', state: engine.state(), tasks: engine.list(),
    viewers: { eagle: extension.viewer, 'first-person': extension.firstPerson },
    mission: extension.missions.snapshot().missions.find(m => m.status === 'running') || null })
  const ready = () => { send({ type: 'ready', port: api.server.address().port }); snapshot() }
  if (api.server.listening) ready(); else api.server.once('listening', ready)
  engine.on('event', event => send({ type: 'event', event }))
  const timer = setInterval(snapshot, 1000)
  function stop () {
    if (stopping) return; stopping = true; clearInterval(timer)
    engine.killswitch(); extension.missions.close(); lifecycle.close()
    extension.viewer.close(); extension.firstPerson?.close()
    try { bot.quit('Dihentikan dari admin') } catch (_) {}
    api.close(); setTimeout(() => process.exit(0), 250).unref()
  }
  process.on('message', message => { if (message?.type === 'shutdown') stop() })
  process.once('disconnect', stop)
  bot.once('end', () => { if (!stopping) setTimeout(() => process.exit(1), 100).unref() })
}
module.exports = { attach }
