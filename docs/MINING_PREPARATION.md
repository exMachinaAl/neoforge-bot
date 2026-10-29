# Persiapan menambang

Panduan fitur yang diimplementasikan 21 Oktober 2026. Bukti audit terbaru: [PROJECT_STATUS.md](PROJECT_STATUS.md); aturan perubahan source: [WORKFLOW.md](WORKFLOW.md).

TERBUKTI dari log pemilik: `mine.collect` menolak `minecraft:stone` sebagai blok tidak dikenal. Lookup skill sebelumnya hanya menerima `stone`; error ini bukan kegagalan API Ollama.

## Perilaku baru

- `stone` dan `minecraft:stone` diterima. Namespace selain `minecraft:` tidak dihapus. Override `item` yang tidak dikenal ditolak jelas.
- `mine.collect` memeriksa alat yang boleh memanen menurut registry versi bot. Jika alat sudah ada, langsung menambang.
- Jika wooden_pickaxe cukup tetapi belum ada: hitung kekurangan menggunakan inventory dan resep `prismarine-recipe`; kumpulkan log sekitar, craft papan, stick, meja bila perlu, lalu wooden_pickaxe. Tidak ada request LLM tambahan untuk resep.
- Meja terdekat dipakai kembali. Bila tidak ada, `craft.item` memasang meja dari inventory di ruang kosong dekat bot, di atas blok padat yang didukung. Koordinat meja eksplisit tetap dihormati. Pemasangan harus dikonfirmasi dunia/server sebelum crafting diteruskan.
- Contoh tangan kosong dengan oak: 3 log -> 12 papan -> 4 stick, 1 meja, 1 wooden_pickaxe -> tambang stone menghasilkan cobblestone. Bahan/alat/meja yang sudah ada mengurangi persiapan.
- Progres persiapan dikirim melalui `task.progress`; hasil sublangkah ada di `result.data.preparation`. Gagal, hasil parsial, mati, atau stop menghentikan langkah berikutnya.
- Director diberi penjelasan kemampuan ini dan melihat hingga 46 entri inventory, supaya alat berjumlah satu tidak hilang dari konteks karena kalah jumlah oleh bahan.

## Cara mencoba

1. Restart proses bot yang dipakai (di admin: restart worker bot tersebut). Perubahan source tidak masuk ke worker yang masih berjalan.
2. Dalam mode survival, pastikan batu dan pohon dapat dijangkau, HP cukup, dan ada ruang kosong untuk meja. Dari UI, buat kegiatan dengan tujuan **“Kumpulkan 4 cobblestone dari batu; siapkan alat bila belum ada.”**
3. Untuk menguji skill tanpa LLM, kirim melalui chat Minecraft:

```text
!task mine.collect block=minecraft:stone count=4
```

4. Periksa progres persiapan, meja yang terpasang, wooden_pickaxe di inventory, lalu `OK` dengan `data.collected: 4`. Tes stop dengan `!task stop`; dependency berikutnya tidak boleh berjalan. In-flight aksi server mungkin sudah terjadi ketika stop dikirim.

Menonaktifkan persiapan pada panggilan tertentu:

```text
!task mine.collect block=stone count=4 prepare=false
```

Uji lokal tanpa server Minecraft, API key, atau request cloud:

```sh
npm run test:mining-prepare
```

## Batas

- Implementasi ini bootstrap wooden_pickaxe, bukan planner survival universal. Persiapan stone/iron/diamond pickaxe, smelting, Silk Touch, resep modded, dan pencarian sumber daya lintas wilayah belum dibuat.
- Memakai jenis papan yang tersedia pada resep bot dan dapat dibuat dari log. Belum menggabungkan beberapa jenis papan untuk satu resep campuran. Hanya chunk yang dimuat dalam radius `maxDistance` (default 32) diperiksa; pohon/batu bisa tetap tidak terjangkau.
- Craft otomatis memakai inventory yang terbaca bot tanpa `/give` atau sinkron OP `/data`. Inventory modded yang tidak terbaca dapat menyebabkan laporan bahan kurang.
- Persiapan masih bagian dari satu task `mine.collect`, bukan node misi terpisah. Restart di tengahnya mengikuti recovery `uncertain` milik runner; periksa dunia sebelum retry. Saat retry, inventory dan meja dihitung ulang. Meja yang dipasang dibiarkan tersedia.
- `prepare=false` menonaktifkan bootstrap; `craft.item autoPlace=false` menonaktifkan pemasangan meja. Kebijakan `ARCADIA_DIRECTOR_DENY=craft.item` juga menghentikan bootstrap yang memerlukan crafting.
- TERUJI TIRUAN menggunakan registry/resep vanilla asli. Rantai baru di Minecraft/NeoForge pemilik **BELUM DIUJI**.
