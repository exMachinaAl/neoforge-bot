// Mencatat bug sleep.auto ke FIELD_TESTS.md (append-only, aman diulang)
const fs = require('fs'); const f = 'FIELD_TESTS.md'; const marker = '### sleep.auto: klik bed lagi setelah bangun'
const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '# FIELD_TESTS.md - hasil uji lapangan (label: TERBUKTI / DILAPORKAN / TERUJI TIRUAN / BELUM DIUJI)\n'
if (cur.includes(marker)) { console.log(f + ': catatan sudah ada'); process.exit(0) }
fs.writeFileSync(f, cur.replace(/\n*$/, '\n') + `
## 2026-10-10
${marker} (BUKA, DILAPORKAN)
- Gejala (laporan pemilik; SKILLRESULT/tasks.log belum dilihat): tidur dan bangun berhasil, lalu bot mengklik bed lagi sebagai "use"; muncul error "cannot sleep / hanya bisa tidur di malam hari" padahal bot baru saja tidur.
- Status: BELUM DIPERBAIKI. Penyebab BELUM DIKETAHUI. Konteks: sleep.auto v2 (arcadia-sleep-v2.zip); 28 tes tiruan lulus tetapi tidak menutup kasus ini.
- Fakta dari kode (berkas skills/ versi saya): satu-satunya pemanggil bot.sleep (klik bed) adalah attemptSleep() di skills/sleep.auto.js; dipanggil ulang hanya oleh cabang "resleep" (terbangun sebelum pagi menurut skill).
  Pesan "it's not night and it's not a thunderstorm" berasal dari mineflayer bila bot.sleep dipanggil di luar 12541-23458; "You can only sleep at night" berasal dari server saat bed diklik di siang hari.
- Hipotesis (BELUM TERBUKTI):
  H1. Bangun terdeteksi sebelum "pagi" versi skill (timeOfDay < 23000 dan bukan isDay) sehingga dianggap gangguan lalu tidur ulang; saat klik kedua server sudah siang. Skill memakai aturan mineflayer (12541-23458), saat bangun server mengikuti kecerahan langit (dan hujan).
  H2. Flag bot.isSleeping basi: event sleep/wake berasal dari entity_metadata yang sering dibuang parser (PARSE GAGAL entity_metadata), sehingga deteksi tidur/bangun salah.
  H3. Pemanggil lain (mis. kode guard agen lain) mengklik bed; tidak diperiksa karena berkasnya tidak ada pada saya.
- Diagnostik ditambahkan (tanpa mengubah perilaku): SKILLRESULT.data.timeline (klik-tidur / tidur / bangun / klik-ditolak, dengan tick, ms, flag tidur, status bed terisi), data.signals, data.serverMsgs, data.resleeps.
- Data yang dibutuhkan saat terulang: baris terakhir "tail -n 1 tasks.log" untuk task sleep.auto.
- Rencana perbaikan (belum dikerjakan; tunggu timeline): (a) setelah tidur berhasil jangan klik lagi bila tick >= ~22800 atau pesan server memuat "sleep at night"; (b) galat "not night" setelah pernah tidur = sukses, bukan gagal; (c) rekonsiliasi flag isSleeping dengan status bed terisi + waktu; (d) tes tiruan untuk tiap kasus, termasuk uji mutasi.
`)
console.log(f + ': catatan ditambahkan')
