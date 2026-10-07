# MarkAsDate

Kalender agenda satu halaman. Pilih tanggal, tambahkan nama agenda dan jam, lalu lihat tanggal bertanda hijau dan catatan Markdown yang diperbarui otomatis.

Agenda hanya disimpan sementara di `sessionStorage` browser; tidak ada database. Data akan tersedia selama sesi tab browser masih aktif.

## Menjalankan aplikasi

```sh
pnpm install
pnpm dev
```

Buka `http://localhost:4321`. Gunakan tombol panah untuk berpindah bulan, pilih tanggal pada kalender untuk membuat agenda, dan tombol **Salin** untuk menyalin catatan Markdown.

## Build

```sh
pnpm build
```
