# neoforge-bot
## Menambah mod baru

Prasyarat: `npm install` sudah jalan, dan log server terbaca (lihat "Lokasi log" di bawah).

1. **Hentikan bot** (`Ctrl+C`). Nama BotAlpha tidak boleh sedang online.
2. **Commit kondisi sekarang**: `git add -A && git commit -m "sebelum mod X"`.
   Dengan begitu `git diff` nanti menunjukkan persis apa yang diubah `adapt`.
3. **Pasang mod**: taruh jar di `server/mods/`, restart server, tunggu log memuat `Done`.
   Cek: `grep -a "Done" server/logs/latest.log | tail -1`
4. **Belajar**: `npm run adapt`
   Bisa 1–5 menit (tiap percobaan sampai 25 detik). Berhasil bila berakhir dengan `SELESAI`.
5. **Uji bot**: `npm start`. Biarkan minimal 1 menit. Sehat bila:
   - `CHANNELS OK`, `EVENT spawn`, dan `CEK10s` menunjukkan paket ribuan dengan posisi bukan `0,0,0`
   - log server tidak memuat `Timed out`, `Invalid player data`, atau `Incompatible client`
6. **Simpan**: `git diff --stat`, lalu `git add -A && git commit -m "tambah mod X" && git push`.
   File yang berubah biasanya `ids.json flows.json versions.json config.json argtypes.json`.

Mengurangi mod: tidak perlu apa-apa. Entri sisa bersifat opsional dan tidak menggagalkan negosiasi.

Fresh clone di perangkat lain dengan mod yang sama: `git clone`, `npm install`, `npm start`. `adapt` tidak perlu.

## Lokasi log server

Default: `server/logs/latest.log` (relatif ke folder bot).
Server di folder lain, pilih satu:
- symlink (paling rapi): `ln -s /path/ke/server server`
- sekali pakai: `LOG=/path/ke/server/logs/latest.log npm run adapt`
- permanen: `echo 'export LOG=/path/ke/server/logs/latest.log' >> ~/.bashrc`
Mencari lokasinya: `find ~ -name latest.log -path "*logs*" 2>/dev/null`
Cek terbaca: `ls -l $LOG` atau `ls -l server/logs/latest.log`

## Kalau adapt berhenti

| Pesan | Artinya | Tindakan |
|---|---|---|
| `patch-gagal` / `!!! patch GAGAL` | versi dependency berubah, patch tak menemukan titik pasang | kirim pesan error-nya |
| `MACET: tipe X sudah terdaftar` | tipe argumen command itu punya properti | perlu dibaca dari kode mod |
| `MACET: X tetap ditolak server` | payload opsional tidak cocok versi/flow | kirim 20 baris log server di sekitarnya |
| `MACET: ... fase konfigurasi` | channel konfigurasi tetap hilang | kirim output + `xxd lastfail.bin \| head -40` |
| `Task ... has not finished yet` di kick | balasan ack (payload kosong) salah | kirim pesannya |
| `TAK TERBACA` | format pesan server berbeda dari dugaan | kirim barisnya |
| `PARSE GAGAL` / `SKIP paket gagal` | item bermod tak terbaca, paket dibuang | normal, bukan error |

## Struktur folder

Server selalu berada di subfolder `server/` di dalam folder proyek bot (root = folder bot).
`adapt` membaca `server/logs/latest.log` otomatis. Jalankan lewat `npm run adapt`
dari root proyek (jangan dari folder lain, karena path-nya relatif).
