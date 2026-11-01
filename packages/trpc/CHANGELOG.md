# @arkesoft/trpc

## 0.1.0

### Minor Changes

- b072657: Uçtan uca tipli ilk tRPC endpoint'leri eklendi. İstemciler `@arkesoft/trpc` paketinden tipi alıyor. `session.me` ve `tenant.current` prosedürleri çalışıyor.

  **Yeni ana bağımlılık:** `@trpc/server@11.19.0` + `@trpc/client@11.19.0` — **exact ve birebir aynı sürüm**. Aynı sürüm zorunluluğu paketin kendi şartı: `@trpc/client`'ın `peerDependencies`'i `@trpc/server`'ın tam olarak aynı sürümünü istiyor (ikisi tel protokolünü paylaşıyor, ayrı kayan aralıklar sessiz uyumsuzluk üretir).

  `latest` (**11.22.1**) **seçilmedi:** teslim gününden yalnızca **1 gün önce** yayınlanmıştı ve depodaki tedarik zinciri koruması (`minimumReleaseAge`, 7 gün) bu kadar yeni bir sürüme izin vermiyor. 11.19.0 yayından 43 gün sonra seçildi ve koruma eşiğini **istisna kaydı olmadan** geçti. **Sonraki geliştirici `latest`'e çekmemeli** — v0.0.5'teki `nodemailer` kararıyla aynı gerekçe.

  Operatör kırılması yok — yeni ortam değişkeni yok, migration yok, şema değişikliği yok. `@arkesoft/errors` iç imza daralması (`toErrorBody` üçüncü parametresi kaldırıldı, `details` artık `AppError.publicDetails`'ten geliyor) platform için kırıcı değil çünkü dönüş değeri birebir aynı.

  Güvenlik iyileştirmesi: `/trpc` yanıtları `Cache-Control: no-store, private` ve `Vary: Cookie` taşıyor (paylaşımlı önbellek üzerinden guard atlatmayı kapatıyor).

  [v0.0.6]

### Patch Changes

- Updated dependencies [b072657]
  - @arkesoft/errors@0.1.0
