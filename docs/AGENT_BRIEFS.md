# Panduan tugas agent

Panduan aktif 29 Oktober 2026; menggantikan kartu paralel 12 Oktober yang sebagian besar sudah diimplementasikan.

1. Baca [AGENTS.md](../AGENTS.md), [HANDOFF.md](HANDOFF.md), [TODO.md](../TODO.md).
2. Tentukan akses: agent workspace bekerja langsung di folder lokal; chat tanpa workspace menyerahkan ZIP source final. Dilarang memakai fix.js/upgrader source. Lihat [WORKFLOW.md](WORKFLOW.md).
3. Pilih area source melalui [MAP.md](MAP.md), pastikan kemampuan yang diminta belum tersedia, dan periksa diff pemilik.
4. Edit area yang diperlukan, uji jalur yang terkena perubahan, laporkan hasil serta batas pengujian. Tidak ada kuota wajib jumlah tes; jangan membuat tes yang hanya menyalin implementasi.
5. Perbarui status fitur/backlog dan changelog. Kode tersedia, tes tiruan lulus, dan terbukti di Minecraft adalah status berbeda.

Prioritas sekarang adalah [gate main](PROJECT_STATUS.md), uji agent/recovery di server, lalu perluasan pada backlog. Pembagian kerja paralel hanya dilakukan bila diminta; panduan ini bukan izin otomatis untuk menjalankan sub-agent.

Kontrak diubah hanya ketika implementasi membutuhkannya; verifikasi kompatibilitas pemanggil dan jalankan `npm run check` setelah perubahan skema/skill.
