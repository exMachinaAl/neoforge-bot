# Metode pengembangan dan pengiriman upgrade

Berlaku sejak 29 Oktober 2026, sesuai keputusan pemilik. Aturan ini menggantikan metode skrip penambal source dan distribusi patch dalam panduan lama.

## Agent dengan akses workspace: wajib work in folder local

Berlaku untuk **Codex, Claude Code, Antigravity** dan agent sejenis yang memiliki editor/terminal/filesystem proyek.

1. Masuk ke root proyek, baca AGENTS.md, handoff, backlog, lalu periksa branch dan perubahan lokal.
2. Baca source terkait; edit langsung file tujuan di workspace. Gunakan editor atau tool patch bawaan yang langsung mengubah file.
3. Jalankan pemeriksaan sesuai perubahan, tinjau diff, dan perbarui dokumen yang statusnya berubah.
4. Laporkan perilaku yang berubah, hasil uji, keterbatasan dan restart yang dibutuhkan. Perubahan sudah ada di folder; jangan memindahkan pekerjaan penerapan kembali ke pemilik.
5. Commit, merge, push dan deploy mengikuti permintaan pemilik; akses folder saja tidak berarti semua tindakan itu diminta.

**Tidak boleh** membuat/menjalankan `fix.js`, `fix-*.js`, skrip anchor-replace sementara, installer, apply, atau upgrader yang mengedit source sebagai mekanisme pengerjaan/pengiriman. Larangan berlaku meskipun skrip nantinya dihapus. Tool editor/patch bawaan agent diperbolehkan karena langsung menghasilkan diff source yang ditinjau.

## AI melalui chat: ZIP source final

Berlaku untuk **Claude, ChatGPT, Gemini** dalam mode chat yang tidak dapat mengakses folder proyek pemilik.

1. Gunakan source/ZIP terbaru dari pemilik dan catat baseline commit/versinya. Jika berkas penting belum tersedia, minta berkas tersebut; jangan membuat pengganti berdasarkan tebakan.
2. Kembalikan **satu ZIP upgrade** berisi file final yang berubah atau ditambah, dengan path relatif tepat dari root proyek.
3. Sertakan `UPGRADE.md` sebagai manifest: baseline, daftar file tambah/ubah, daftar penghapusan/rename yang perlu ditinjau, perubahan dependency/migrasi, langkah uji, dan hasil uji sebenarnya.
4. Tanpa `fix.js`, installer, atau skrip yang mengubah file lain. Penghapusan/migrasi destruktif tidak dijalankan otomatis.
5. Jangan sertakan `.env`, konfigurasi server privat, `mc.local.json*`, `node_modules/`, `server/`, `data/`, log, akun/customer, atau aset model milik pemilik.
6. Jika chat tidak mempunyai alat untuk membuat lampiran ZIP, nyatakan batas tersebut; jangan mengklaim ZIP tersedia atau folder lokal telah berubah.

Pemilik mengekstrak ZIP ke folder sementara, meninjau manifest/diff terhadap baseline dan perubahan lokal, lalu menyalin file yang disepakati. Simpan salinan source lama untuk rollback. Setelah dependency berubah, instal ulang sesuai lockfile dan uji; restart proses terkait serta refresh UI. ZIP tidak boleh menimpa data lokal.

Pemilihan metode didasarkan pada **akses nyata**, bukan nama model. ChatGPT dengan akses workspace dapat bekerja langsung sebagai agent; model apa pun tanpa akses folder menggunakan ZIP.

## Runtime yang tetap berlaku

Arcadia sekarang menjalankan fitur langsung dari source. `npm run admin` dan `npm start` tidak membutuhkan upgrade historis `install/fix-*.js`.

`npm ci`/`npm install` tetap menjalankan `patch-all.js` untuk empat patch kompatibilitas **dependency** pada `node_modules`: `patch-nmpf.js`, `patch-checks.js`, `patch-protodef.js`, `patch-blocks.js`. Mereka bagian runtime NeoForge yang sudah ada, bukan metode AI mengubah source proyek. Perubahan patch compatibility dilakukan langsung pada file yang relevan dan diuji sebagaimana perubahan runtime.

ZIP lama, installer di `install/`, dan `docs/_append/` masih tersimpan sebagai peninggalan historis; jangan dipakai pada baseline terbaru.

## Bukti dan dokumentasi

Gunakan label TERBUKTI, DILAPORKAN, TERUJI TIRUAN, BELUM DIUJI sesuai [AGENTS.md](../AGENTS.md). Tes mock/browser tanpa Minecraft tidak menjadi bukti lapangan. `npm test` tidak mencakup tes admin, env, dan browser terpisah.

README = cara pakai; docs/README = indeks; HANDOFF = keadaan sekarang; TODO = pekerjaan tersisa; CHANGELOG/FIELD_TESTS = riwayat bukti. Rencana berlabel ARSIP tidak mengesampingkan aturan aktif.
