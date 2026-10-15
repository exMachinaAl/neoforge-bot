# Key terenkripsi DPAPI: hanya akun Windows ini yang bisa membukanya.
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
