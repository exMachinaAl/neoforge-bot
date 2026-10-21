const MODES = ['observe', 'semi', 'full']
const SCOPES = ['read', 'move', 'mine', 'inventory', 'craft', 'combat', 'place', 'survival', 'tools', 'commands']
function scopeOf (decision) {
  if (decision.kind.startsWith('tool.')) return 'tools'
  if (decision.kind === 'command') return 'commands'
  if (decision.kind !== 'skill') return 'read'
  const name = decision.skill
  if (['world.inspect', 'inv.snapshot'].includes(name)) return 'read'
  if (name === 'world.place') return 'place'
  if (name.startsWith('nav.')) return 'move'
  if (name.startsWith('inv.')) return 'inventory'
  if (name.startsWith('craft.')) return 'craft'
  if (/^(hunt|guard)\./.test(name)) return 'combat'
  if (/^(farm|fish|breed|sleep)\./.test(name)) return 'survival'
  return 'mine'
}
function requiredScopes (d) {
  const scopes = [scopeOf(d)]
  if (d.skill === 'mine.collect') {
    if (d.params?.prepare !== false) scopes.push('craft', 'place')
    if (d.params?.chest) scopes.push('inventory')
  }
  if (d.skill === 'craft.item' && d.params?.autoPlace !== false) scopes.push('place')
  if (d.skill === 'nav.goto' && d.params?.escape !== false) scopes.push('mine')
  if (d.params?.chest) scopes.push('inventory')
  // Movement and optional combat guards are part of native action skills.
  if (d.kind === 'skill' && !['world.inspect', 'inv.snapshot'].includes(d.skill)) scopes.push('move')
  if (d.kind === 'skill' && /^(mine|farm|fish|breed)\./.test(d.skill) && d.params?.guard !== false) scopes.push('combat')
  return [...new Set(scopes)]
}
function missingScopes (mode, grants, d) {
  if (mode === 'full') return []
  return requiredScopes(d).filter(s => mode === 'observe' || !grants.includes(s))
}
function sandboxPolicy (env = process.env) {
  const mode = env.ARCADIA_MODE === 'debug' ? 'debug' : 'production'
  const requested = /^(true|1)$/i.test(env.ARCADIA_DEBUG_UNSAFE_SANDBOX || '')
  return { mode, unsafeHost: mode === 'debug' && requested,
    warning: requested ? (mode === 'debug'
      ? 'DEBUG: command host tanpa isolasi OS diizinkan. Jangan gunakan untuk production.'
      : 'ARCADIA_DEBUG_UNSAFE_SANDBOX diabaikan: production wajib menggunakan sandbox.') : null }
}
module.exports = { MODES, SCOPES, scopeOf, requiredScopes, missingScopes, sandboxPolicy }
