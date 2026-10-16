// Batas sesi/tenant untuk UI. Saat ini token lokal dipetakan ke owner lokal.
// Implementasi login pelanggan kelak dapat mengganti pembuat sesi tanpa mengubah kontrak UI.
const CAPABILITIES = Object.freeze(['bots:read', 'bots:control', 'settings:write', 'director:review'])

function localSession () {
  return {
    authenticated: true,
    authMode: 'local-token',
    user: { id: 'local-owner', displayName: 'Owner', role: 'owner' },
    tenant: { id: 'local', name: 'Arcadia Local' },
    capabilities: [...CAPABILITIES]
  }
}

module.exports = { localSession, CAPABILITIES }
