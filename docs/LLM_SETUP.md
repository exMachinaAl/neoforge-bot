# Setup dan pengujian LLM — Windows, Termux, Linux

Gunakan Node.js 22 atau lebih baru (sesuai requirement mineflayer yang terpasang). Semua perintah di bawah dijalankan dari root proyek.

## Kenapa key sudah disimpan tetapi belum terbaca?

`scripts/setup-ollama.ps1` menyimpan pilihan model dan key terenkripsi DPAPI di profil Windows. Skrip tersebut tidak menjadikan key tersedia selamanya di setiap terminal. `scripts/load-ollama.ps1` membukanya dan mengisi environment terminal saat ini. Proses admin dan worker hanya mewarisi environment saat diluncurkan.

**Tidak perlu mengganti nama variabel atau menempel key ke source `load-ollama.ps1`.** `ARCADIA_LLM_KEY` adalah nama variabel; nilainya diambil dari penyimpanan.

Pada pemeriksaan 20 Oktober 2026, file settings/key Windows ada, tetapi environment proses tool belum berisi provider/key. `npm run llm:status` menunjukkan default Anthropic, `keyPresent:false`, `configured:false`. Ini tidak menguji validitas key yang tersimpan dan tidak membuktikan isi terminal lain.

## Pilihan A: gunakan konfigurasi Windows yang sudah tersimpan

Di **PowerShell**, jalankan:

```powershell
. .\scripts\load-ollama.ps1
npm run llm:status
```

Titik dan spasi sebelum `.\scripts` berarti dot-source: variabel dimuat ke terminal ini. Jangan memuatnya melalui jendela PowerShell lain lalu menjalankan admin di terminal lama. Tidak perlu menjalankan setup ulang selama file dan akun Windows pemilik key masih sama.

Hasil yang diharapkan: `provider: "openai"`, endpoint `https://ollama.com/v1`, nama model pilihan Anda, `keyPresent:true`, `configured:true`. Status tidak mencetak key dan tidak melakukan request jaringan.

Lanjutkan pengujian di bawah, lalu jalankan `npm run admin` dari terminal yang sama. Bila admin sudah berjalan sebelum key dimuat, hentikan dan jalankan ulang admin. Worker yang sudah hidup juga perlu diganti; perubahan environment tidak masuk ke proses lama secara otomatis.

DPAPI terikat akun Windows; berkas terenkripsi ini tidak bisa langsung dipakai di Termux/Linux.

## Pilihan B: `.env` portable untuk semua OS

Salin `.env.example` menjadi **`.env` di root proyek** melalui editor/file manager, hanya jika `.env` belum ada. Edit model dan key sendiri pada mesin Anda:

```dotenv
ARCADIA_LLM_PROVIDER=openai
ARCADIA_LLM_URL=https://ollama.com/v1
ARCADIA_LLM_MODEL=NAMA_MODEL_PERSIS_DARI_OLLAMA
ARCADIA_LLM_KEY=API_KEY_OLLAMA_ANDA
ARCADIA_LLM_RPM=3
ARCADIA_DIRECTOR_AUTO=
```

Nilai model/key di atas adalah placeholder, wajib diganti. Gunakan model Cloud yang tersedia untuk akun Anda; nama model lokal dan Cloud belum tentu sama. Proyek memakai adapter OpenAI-compatible, sehingga provider tetap `openai`, bukan `ollama`. Tidak perlu memiliki key OpenAI.

`.env` otomatis dibaca oleh `npm start`, `npm run admin`, `npm run llm:status`, dan `npm run llm:test`. Tidak perlu PowerShell atau perintah `export` untuk jalur ini. File dicari relatif terhadap proyek, bukan working directory worker. Environment yang sudah ada mempunyai prioritas lebih tinggi daripada `.env`; bila pindah dari Cloud ke lokal, gunakan terminal baru tanpa konfigurasi lama.

`.env` menyimpan key sebagai teks lokal dan sudah masuk `.gitignore`; jangan kirim file tersebut ke chat atau commit. Di Linux/Termux, batasi izin file:

```bash
chmod 600 .env
```

Jika memilih lokasi lain, set `ARCADIA_ENV_FILE` ke path file sebelum menjalankan Node. Bila path yang ditentukan tidak ditemukan, proses melaporkan konfigurasi gagal; tidak diam-diam memakai provider default.

## Ollama lokal

Untuk server Ollama pada perangkat yang sama dengan proses bot/admin:

```dotenv
ARCADIA_LLM_PROVIDER=openai
ARCADIA_LLM_URL=http://127.0.0.1:11434/v1
ARCADIA_LLM_MODEL=NAMA_MODEL_DARI_OLLAMA_LIST
ARCADIA_LLM_KEY=
ARCADIA_LLM_RPM=3
```

Pastikan server Ollama berjalan dan model sudah tersedia. Periksa model dengan `ollama list` di mesin Ollama. `keyPresent:false` normal untuk endpoint loopback ini; `keyRequired:false` dan `configured:true` menunjukkan konfigurasi lokal lengkap, bukan bukti server sudah terhubung.

`127.0.0.1` selalu berarti perangkat tempat proses admin berjalan. Jika admin ada di Termux dan Ollama ada di laptop, alamat itu tidak menunjuk laptop. Untuk tahap awal di Termux, gunakan Ollama Cloud melalui HTTPS agar tidak perlu menjalankan inferensi lokal atau mengatur server LAN. Dukungan deployment Ollama di Android dan endpoint LAN berautentikasi belum diuji proyek ini; validator saat ini mewajibkan key untuk host non-loopback.

## Urutan pengujian — perintah sama di ketiga OS

1. **Periksa versi dan konfigurasi, tanpa mengirim request LLM.**

```text
node --version
npm run llm:status
```

`configured:true` berarti field konfigurasi tersedia. `networkTested:false` sengaja tetap false: ini belum menguji kredensial, endpoint, kuota, atau model.

2. **Uji pembentukan prompt, tanpa koneksi Minecraft dan tanpa panggilan LLM.**

```text
npm run llm:test -- "Periksa inventori dengan inv.snapshot" --dry
```

Output berisi SYSTEM, USER, dan manifest skill. Lulus tahap ini hanya menunjukkan prompt dapat dibuat; key yang kosong pun belum diuji oleh dry-run.

3. **Uji koneksi LLM sungguhan, tanpa menyalakan bot Minecraft.**

```text
npm run llm:test -- "Periksa inventori dengan inv.snapshot"
```

Tahap ini memakai kuota provider. Output yang diharapkan: keputusan berisi alasan, judul, dan daftar task yang valid. Skrip hanya meminta rencana; tidak menjalankan task. Kegagalan request/validasi menghasilkan exit code nonzero. Balasan valid `tasks:[]` dapat berarti model menolak atau perlu informasi, bukan selalu kegagalan koneksi; baca `reason`.

4. **Uji integrasi admin dan worker.**

```text
npm run admin
```

Buka localhost:8788, login, mulai satu bot dan masuk Single. Coba **Kirim pesan** dahulu, lalu tujuan sederhana melalui **Mulai kegiatan**. Berhasil pada tahap 3 tetapi gagal di UI biasanya memerlukan pemeriksaan konfigurasi proses admin/worker yang masih lama, rate limit, status bot, atau prasyarat skill.

5. **Uji kode memakai balasan model tiruan, tanpa API key.**

```text
npm run test:llm-config
node tests/director.test.js
```

Ini menguji pembacaan konfigurasi, prioritas environment, pewarisan ke child process, penyamaran key, adapter provider, timeout dan validasi. Tidak membuktikan akun Ollama sungguhan dapat diakses.

## Membaca masalah

| Gejala | Arti / pemeriksaan |
|---|---|
| Provider menjadi Anthropic padahal memakai Ollama | Variabel/provider belum dimuat di proses tersebut; periksa `.env` atau dot-source PowerShell |
| `ARCADIA_LLM_KEY belum diisi` | Cloud membutuhkan key, proses yang melakukan request belum mendapatkannya |
| HTTP 401/403 | Periksa key, akses akun dan endpoint; jangan mengirim key dalam log |
| HTTP 404 | Periksa base URL berakhiran `/v1` dan nama model persis yang tersedia |
| HTTP 429 / anggaran habis | Rate limit aplikasi/provider; tunggu sebelum mencoba lagi |
| Connection refused | Server Ollama lokal belum berjalan atau alamat/port salah |
| Timeout | Endpoint tidak merespons dalam batas waktu, jaringan lambat, atau model belum siap |
| `configured:true`, tetapi request gagal | Status hanya memeriksa konfigurasi, bukan autentikasi/provider online |
| Konfigurasi `.env` tidak mengubah hasil | Environment lama menang; buka terminal baru atau bersihkan nilai lama sebelum menjalankan ulang |

Referensi resmi: [Ollama OpenAI compatibility, Cloud dan lokal](https://docs.ollama.com/api/openai-compatibility), [Ollama Cloud](https://docs.ollama.com/cloud), [Node loadEnvFile](https://nodejs.org/api/process.html#processloadenvfilepath).

**Status verifikasi:** TERUJI TIRUAN pada Windows/Node 24 untuk loader `.env`, precedence, child inheritance, status tanpa secret dan regresi Director. Linux/Termux fisik serta request Ollama nyata pada perubahan ini BELUM DIUJI. Kompatibilitas konfigurasi lintas OS tidak berarti seluruh dependency native/viewer proyek sudah teruji di semua OS.
