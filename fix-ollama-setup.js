const fs=require('fs');const path=require('path');
const files={
'scripts/setup-ollama.ps1':String.raw`# Key terenkripsi DPAPI: hanya akun Windows ini yang bisa membukanya.
$ErrorActionPreference = 'Stop'
$settingsDir = Join-Path $env:LOCALAPPDATA 'Arcadia'
$models = @((Invoke-RestMethod -Uri 'https://ollama.com/api/tags').models.name)
if ($models.Count -eq 0) { throw 'Daftar model Ollama kosong.' }
for ($i = 0; $i -lt $models.Count; $i++) { Write-Host "$($i + 1). $($models[$i])" }
[int]$choice = 0
if (-not [int]::TryParse((Read-Host 'Nomor model yang ingin dipakai'), [ref]$choice) -or $choice -lt 1 -or $choice -gt $models.Count) { throw 'Nomor model tidak valid.' }
$secret = Read-Host 'API key Ollama (input disembunyikan)' -AsSecureString
if ($secret.Length -eq 0) { throw 'Key kosong; pengaturan tidak diubah.' }
New-Item -ItemType Directory -Force -Path $settingsDir | Out-Null
ConvertFrom-SecureString $secret | Set-Content -LiteralPath (Join-Path $settingsDir 'ollama-key.dpapi') -Encoding ASCII
@{ provider = 'openai'; url = 'https://ollama.com/v1'; model = $models[$choice - 1] } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $settingsDir 'ollama.json') -Encoding UTF8
$secret.Dispose()
Write-Host 'Setup selesai. Key tersimpan terenkripsi di profil Windows, di luar proyek.'
`,
'scripts/load-ollama.ps1':String.raw`# Dot-source sebelum node bot.js atau node orchestrator/try.js.
$ErrorActionPreference = 'Stop'
$settingsDir = Join-Path $env:LOCALAPPDATA 'Arcadia'
$settings = Get-Content -Raw -LiteralPath (Join-Path $settingsDir 'ollama.json') | ConvertFrom-Json
if ($settings.url -ne 'https://ollama.com/v1' -or $settings.provider -ne 'openai') { throw 'Endpoint lokal tidak sesuai Ollama Cloud.' }
$secret = Get-Content -Raw -LiteralPath (Join-Path $settingsDir 'ollama-key.dpapi') | ConvertTo-SecureString
$credential = New-Object System.Net.NetworkCredential('', $secret)
$env:ARCADIA_LLM_KEY = $credential.Password
$env:ARCADIA_LLM_PROVIDER = 'openai'
$env:ARCADIA_LLM_URL = $settings.url
$env:ARCADIA_LLM_MODEL = $settings.model
$env:ARCADIA_LLM_RPM = '3'
$env:ARCADIA_DIRECTOR_AUTO = ''
$secret.Dispose()
$credential = $null
`
};
for(const [f,s]of Object.entries(files)){if(fs.existsSync(f)){if(fs.readFileSync(f,'utf8')===s){console.log(f+' sudah ter-fix');continue}throw Error('File sudah ada: '+f)}fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s)}
const f='orchestrator/llm.js';let s=fs.readFileSync(f,'utf8');const a="const local = provider === 'openai' && url !== DEFAULTS.openai.url // server lokal (mis. Ollama) boleh tanpa kunci";const b="const local = provider === 'openai' && (() => { try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname) } catch { return false } })() // loopback-auth-v1: cloud selalu membutuhkan key";
if(s.includes(b))console.log(f+' sudah ter-fix');else {if(!s.includes(a))throw Error('anchor llm hilang');fs.writeFileSync(f,s.replace(a,b))}
