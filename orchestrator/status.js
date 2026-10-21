// Tidak mengirim request jaringan, tidak mencetak key maupun isi .env.
const { configFromEnv } = require('./llm')
try {
  const cfg = configFromEnv()
  let endpoint
  try {
    const u = new URL(cfg.url)
    endpoint = u.origin + u.pathname // username/password/query/fragment tidak ditampilkan
  } catch (_) { endpoint = '(URL tidak valid)' }
  const ready = (!cfg.needsKey || !!cfg.key) && ['openai','anthropic'].includes(cfg.provider) &&
    !cfg.model.startsWith('GANTI_') && /^https?:\/\//.test(cfg.url)
  console.log(JSON.stringify({ provider: cfg.provider, endpoint, model: cfg.model, keyPresent: !!cfg.key,
    keyRequired: cfg.needsKey, configured: ready, rpm: cfg.rpm, networkTested: false }, null, 2))
  if (!ready) { console.error('Konfigurasi belum lengkap. Lihat docs/LLM_SETUP.md.'); process.exitCode = 1 }
} catch (_) { console.error('Konfigurasi gagal dimuat. Periksa lokasi/izin .env dan versi Node.js.'); process.exitCode = 1 }
