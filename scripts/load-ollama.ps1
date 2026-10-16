# Dot-source sebelum node bot.js atau node orchestrator/try.js.
$ErrorActionPreference = 'Stop'
$settingsDir = Join-Path $env:LOCALAPPDATA 'Arcadia'
$settings = Get-Content -Raw -LiteralPath (Join-Path $settingsDir 'ollama.json') | ConvertFrom-Json
if ($settings.url -ne 'https://ollama.com/v1' -or $settings.provider -ne 'openai') { throw 'Endpoint lokal tidak sesuai Ollama Cloud.' }
$ciphertext = (Get-Content -Raw -LiteralPath (Join-Path $settingsDir 'ollama-key.dpapi')).Trim()
$secret = $ciphertext | ConvertTo-SecureString # dpapi-trim-newline-v1
$credential = New-Object System.Net.NetworkCredential('', $secret)
$env:ARCADIA_LLM_KEY = $credential.Password
$env:ARCADIA_LLM_PROVIDER = 'openai'
$env:ARCADIA_LLM_URL = $settings.url
$env:ARCADIA_LLM_MODEL = $settings.model
$env:ARCADIA_LLM_RPM = '3'
$env:ARCADIA_DIRECTOR_AUTO = ''
$secret.Dispose()
$credential = $null
