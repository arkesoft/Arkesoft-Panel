---
'@arkesoft/api': minor
'@arkesoft/trpc': patch
---

Dışa açık API'nin sözleşme yüzeyi artık mekanik olarak ölçülüyor: yeni `pnpm test:contract` komutu, `packages/trpc`'nin tüm uç noktalarını (7 ad alanı, 17 prosedür) tek bir sürüm kontrollü dosyaya (`docs/api-contract-surface.json`) kaydediyor ve her değişikliği otomatik olarak sınıflandırıyor — bir alanı zorunlu hale getirmek veya kaldırmak kırıcı (MAJOR), yeni bir alan eklemek geriye uyumlu (MINOR) olarak işaretleniyor; bu kontrol artık `pnpm guards`'ın bir parçası ve `docs/api-versioning.md` ile belgelendi. [v0.0.22]
