const mc = require('minecraft-protocol')
mc.ping({ host: 'localhost', port: 25565, version: '1.21.1' }, (err, r) => {
  if (err) return console.log('ERR', err)
  require('fs').writeFileSync('status.json', JSON.stringify(r, null, 1))
  console.log(Object.keys(r))
})
