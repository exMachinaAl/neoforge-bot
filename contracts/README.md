# Arcadia contracts v0.1.0
Sumber kebenaran antar-AI. Ubah skema hanya lewat commit khusus contracts/ + naikkan versi di title. Jangan impor kode antar paket; bertukar data lewat skema ini.

## Paket (monorepo, belum dipecah)
protocol = repo sekarang (handshake, adapt, patch, selftest) | skills | engine (antrean, orchestrator) | mind (persona, memori, planner LLM) | control (API, CLI, Web UI)

## Aturan
- Skill = { manifest: SkillManifest, run(bot, params, ctx) -> SkillResult }. ctx = { signal: AbortSignal, log, persona }. Skill wajib menghormati signal.abort dan tidak melempar exception: kembalikan SkillResult dengan code.
- Skill hanya jalan bila BotState.capabilities mencakup manifest.requires. inventory.protocol baru boleh diklaim bila inventory terbukti akurat (hasil !test); item modded tak terbaca = code PROTOCOL_UNSUPPORTED.
- LLM tidak boleh ada di loop per-tick; planner hanya memilih Task dan menulis ulang rencana saat gagal.
- Planner dibatasi persona.limits.maxLlmCallsPerMin.

## API kontrol (bind 127.0.0.1, header Authorization: Bearer $ARCADIA_TOKEN)
GET /bots | POST /bots {username, personaId?} | GET /bots/:id (BotState) | DELETE /bots/:id
POST /bots/:id/tasks (Task tanpa id/status) | DELETE /bots/:id/tasks/:taskId | POST /bots/:id/commands (Command)
GET /skills (SkillManifest[]) | GET/PUT /personas/:id | POST /killswitch (hentikan semua bot)
WebSocket /ws: aliran Event.
