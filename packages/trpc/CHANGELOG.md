# @arkesoft/trpc

## 0.2.0

### Minor Changes

- Mağazanın seçtiği tema artık kendi vitrininde gerçekten render ediliyor: ilk tema paketi
  (`modern`) ana sayfa ve "sayfa bulunamadı" şablonlarıyla storefront'a bağlandı, tema rengi ve
  yazı tipi ayarları sayfaya otomatik uygulanıyor. Mağaza sahibi bu sürümde henüz bir yüzey
  görmüyor (tema seçimi her mağaza için şimdilik sabit) — bu, "tema seç, siteyi kur" vaadinin
  temel alt yapısını kuruyor. [v0.0.10]

### Patch Changes

- @arkesoft/errors@0.2.0

## 0.1.1

### Patch Changes

- @arkesoft/errors@0.1.1

## 0.1.0

### Minor Changes

- Mağaza vitrini (storefront) açıldı. Müşteriler artık kendi alt alan adlarından
  (`magaza-adi.arkesoft.app`) veya bağladıkları özel alan adından mağazalarına
  ulaşabiliyor; adres doğru çözülemezse Türkçe bir "mağaza bulunamadı" sayfası, API
  geçici olarak erişilemezse Türkçe bir "şu an kullanılamıyor" sayfası gösteriliyor.
  Her sayfa arama motorlarına kendi mağaza adresine göre doğru `robots.txt` ve site
  haritası bildiriyor. Vitrin tarayıcıda hiçbir kiracı/sır bilgisi taşımıyor; önbellek
  başlıkları mağazalar arası veri sızıntısını önleyecek şekilde ayarlandı.

  [v0.0.8]

- b072657: Uçtan uca tipli ilk tRPC endpoint'leri eklendi. İstemciler `@arkesoft/trpc` paketinden tipi alıyor. `session.me` ve `tenant.current` prosedürleri çalışıyor.

  **Yeni ana bağımlılık:** `@trpc/server@11.19.0` + `@trpc/client@11.19.0` — **exact ve birebir aynı sürüm**. Aynı sürüm zorunluluğu paketin kendi şartı: `@trpc/client`'ın `peerDependencies`'i `@trpc/server`'ın tam olarak aynı sürümünü istiyor (ikisi tel protokolünü paylaşıyor, ayrı kayan aralıklar sessiz uyumsuzluk üretir).

  `latest` (**11.22.1**) **seçilmedi:** teslim gününden yalnızca **1 gün önce** yayınlanmıştı ve depodaki tedarik zinciri koruması (`minimumReleaseAge`, 7 gün) bu kadar yeni bir sürüme izin vermiyor. 11.19.0 yayından 43 gün sonra seçildi ve koruma eşiğini **istisna kaydı olmadan** geçti. **Sonraki geliştirici `latest`'e çekmemeli** — v0.0.5'teki `nodemailer` kararıyla aynı gerekçe.

  Operatör kırılması yok — yeni ortam değişkeni yok, migration yok, şema değişikliği yok. `@arkesoft/errors` iç imza daralması (`toErrorBody` üçüncü parametresi kaldırıldı, `details` artık `AppError.publicDetails`'ten geliyor) platform için kırıcı değil çünkü dönüş değeri birebir aynı.

  Güvenlik iyileştirmesi: `/trpc` yanıtları `Cache-Control: no-store, private` ve `Vary: Cookie` taşıyor (paylaşımlı önbellek üzerinden guard atlatmayı kapatıyor).

  [v0.0.6]

### Patch Changes

- Updated dependencies [b072657]
  - @arkesoft/errors@0.1.0
