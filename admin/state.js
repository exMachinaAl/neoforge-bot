const fs = require('fs'), path = require('path'), crypto = require('crypto')
const { promisify } = require('util')
const scrypt = promisify(crypto.scrypt)
const fail = (status, message) => Object.assign(Error(message), { status })
const hash = value => crypto.createHash('sha256').update(value).digest('hex')

// Satu proses admin menjadi penulis registry/auth. File lock mencegah dua penulis.
function openState (directory) {
  const dir = path.resolve(directory); fs.mkdirSync(dir, { recursive: true })
  const lock = path.join(dir, 'admin.lock'), file = path.join(dir, 'admin.json')
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8')); let alive = false
    if (Number.isInteger(pid) && pid > 0) { try { process.kill(pid, 0); alive = true } catch (e) { if (e.code !== 'ESRCH') alive = true } }
    if (alive) throw Error('Panel admin untuk folder ini sudah berjalan')
    fs.unlinkSync(lock)
  }
  fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 })
  let db
  try {
    db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { version: 1, users: [], sessions: [], bots: [] }
    if (db.version !== 1 || !['users','sessions','bots'].every(k => Array.isArray(db[k]))) throw Error('Registry admin tidak valid')
  } catch (e) { fs.unlinkSync(lock); throw e }
  const save = () => { fs.writeFileSync(file + '.tmp', JSON.stringify(db, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(file + '.tmp', file) }
  let registering = false
  async function setup (body) {
    if (db.users.length || registering) throw fail(409, 'Owner sudah dibuat')
    const username = String(body.username || '').trim()
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(username) || typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) throw fail(400, 'Username 3–32 karakter; password 12–128 karakter')
    registering = true
    try {
      const salt = crypto.randomBytes(16).toString('hex'), passwordHash = (await scrypt(body.password, salt, 64)).toString('hex')
      const user = { id: crypto.randomUUID(), username, displayName: username, role: 'owner', tenantId: 'local', salt, passwordHash }
      db.users.push(user); save(); return user
    } finally { registering = false }
  }
  async function login (body) {
    if (typeof body.password !== 'string' || body.password.length > 128) throw fail(401, 'Username/password tidak sesuai')
    const user = db.users.find(u => u.username === body.username)
    const derived = await scrypt(body.password, user?.salt || 'invalid-account-salt', 64)
    if (!user || !crypto.timingSafeEqual(derived, Buffer.from(user.passwordHash, 'hex'))) throw fail(401, 'Username/password tidak sesuai')
    return user
  }
  function issue (user) {
    const token = crypto.randomBytes(32).toString('hex'), expires = Date.now() + 7 * 86400000
    db.sessions = db.sessions.filter(s => s.expires > Date.now()).slice(-99)
    db.sessions.push({ hash: hash(token), userId: user.id, expires }); save(); return token
  }
  function session (token) {
    if (!token || token.length > 128) return null
    const s = db.sessions.find(s => s.hash === hash(token) && s.expires > Date.now())
    return s && db.users.find(u => u.id === s.userId) || null
  }
  function revoke (token) { db.sessions = db.sessions.filter(s => s.hash !== hash(token || '')); save() }
  const visible = (user, bot) => user && (user.role === 'owner' || user.tenantId === bot.tenantId)
  return { db, save, setup, login, issue, session, revoke, visible, close: () => { if (fs.existsSync(lock) && fs.readFileSync(lock,'utf8') === String(process.pid)) fs.unlinkSync(lock) } }
}
module.exports = { openState, fail }
