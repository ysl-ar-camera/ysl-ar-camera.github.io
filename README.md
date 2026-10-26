# Yves Saint Laurent · AR Camera (WebAR)

AR Camera di browser untuk 6 produk **Yves Saint Laurent**. Scan kartu QR dengan kamera HP (Android atau iPhone),
website terbuka, lalu animasi 3D muncul di atas kartu. Tidak perlu install aplikasi.

**Website:** https://ysl-ar-camera.github.io/
**Kartu QR (lihat, download, cetak):** https://ysl-ar-camera.github.io/cards/
**Preview tanpa kamera:** https://ysl-ar-camera.github.io/?preview=1

| Kartu (`cards/`) | Produk |
|---|---|
| `Card_ysl-rouge-pur-couture.png` | Rouge Pur Couture Lipstick |
| `Card_ysl-libre.png` | Libre Eau de Parfum |
| `Card_ysl-kate-bag.png` | Kate Chain Bag |
| `Card_ysl-opyum-pumps.png` | Opyum Pumps |
| `Card_ysl-sl1-sunglasses.png` | SL 1 Sunglasses |
| `Card_ysl-couture-palette.png` | Couture Eyeshadow Palette |

## Isi

- `index.html`, `app.js`, `style.css`: halaman WebAR (MindAR 1.2.5 + three.js 0.160 dari CDN).
- `targets.mind`: data pelacakan 6 kartu (urutan sama dengan `models/products.json`).
- `models/*.glb` + `products.json`: model 3D dan parameter animasi yang diekspor dari project Unity.
- `cards/`: kartu QR + `Kartu-QR-YSL-A4.pdf` (6 kartu dalam 1 lembar A4) dan `Tugas-AR-YSL.pdf` (cover + QR polos).

Model 3D dan kartu adalah prototipe bergaya untuk tugas kuliah, bukan materi resmi Yves Saint Laurent.
