const { createAdmin } = require('./server')
const app = createAdmin()
app.listen().then(address => console.log('Arcadia Admin: http://localhost:' + address.port + ' — login/setup owner di browser')).catch(async e => { console.error('Admin gagal: ' + e.message); await app.close(); process.exitCode = 1 })
let stopping = false
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{if(stopping)return;stopping=true;await app.close();process.exit(0)})
