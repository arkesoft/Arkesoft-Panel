# @arkesoft/storefront

## 0.11.0

### Patch Changes

- Updated dependencies [4cae8ad]
  - @arkesoft/trpc@0.8.4
  - @arkesoft/errors@0.11.0
  - @arkesoft/tenancy@0.11.0
  - @arkesoft/themes-modern@0.1.7

## 0.10.3

### Patch Changes

- @arkesoft/errors@0.10.3
  - @arkesoft/tenancy@0.10.3
  - @arkesoft/themes-modern@0.1.6
  - @arkesoft/trpc@0.8.3

## 0.10.2

### Patch Changes

- @arkesoft/errors@0.10.2
  - @arkesoft/tenancy@0.10.2
  - @arkesoft/themes-modern@0.1.5
  - @arkesoft/trpc@0.8.2

## 0.10.1

### Patch Changes

- @arkesoft/errors@0.10.1
  - @arkesoft/tenancy@0.10.1
  - @arkesoft/themes-modern@0.1.4
  - @arkesoft/trpc@0.8.1

## 0.10.0

### Patch Changes

- Updated dependencies
  - @arkesoft/trpc@0.8.0
  - @arkesoft/errors@0.10.0
  - @arkesoft/tenancy@0.10.0
  - @arkesoft/themes-modern@0.1.3

## 0.9.0

### Patch Changes

- Updated dependencies
  - @arkesoft/tenancy@0.9.0
  - @arkesoft/trpc@0.7.0
  - @arkesoft/errors@0.9.0
  - @arkesoft/themes-modern@0.1.2

## 0.8.0

### Patch Changes

- @arkesoft/themes-modern@0.1.1
  - @arkesoft/errors@0.8.0
  - @arkesoft/tenancy@0.8.0
  - @arkesoft/trpc@0.6.1

## 0.7.0

### Patch Changes

- Updated dependencies
  - @arkesoft/trpc@0.6.0
  - @arkesoft/errors@0.7.0
  - @arkesoft/tenancy@0.7.0
  - @arkesoft/themes-modern@0.1.0

## 0.6.0

### Patch Changes

- Updated dependencies
  - @arkesoft/errors@0.6.0
  - @arkesoft/trpc@0.5.0
  - @arkesoft/tenancy@0.6.0
  - @arkesoft/themes-modern@0.1.0

## 0.5.0

### Patch Changes

- @arkesoft/errors@0.5.0
  - @arkesoft/tenancy@0.5.0
  - @arkesoft/themes-modern@0.1.0
  - @arkesoft/trpc@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies
  - @arkesoft/trpc@0.4.0
  - @arkesoft/errors@0.4.0
  - @arkesoft/tenancy@0.4.0
  - @arkesoft/themes-modern@0.1.0

## 0.3.0

### Patch Changes

- Updated dependencies
  - @arkesoft/trpc@0.3.0
  - @arkesoft/errors@0.3.0
  - @arkesoft/tenancy@0.3.0
  - @arkesoft/themes-modern@0.1.0

## 0.2.0

### Minor Changes

- Mağazanın seçtiği tema artık kendi vitrininde gerçekten render ediliyor: ilk tema paketi
  (`modern`) ana sayfa ve "sayfa bulunamadı" şablonlarıyla storefront'a bağlandı, tema rengi ve
  yazı tipi ayarları sayfaya otomatik uygulanıyor. Mağaza sahibi bu sürümde henüz bir yüzey
  görmüyor (tema seçimi her mağaza için şimdilik sabit) — bu, "tema seç, siteyi kur" vaadinin
  temel alt yapısını kuruyor. [v0.0.10]

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @arkesoft/trpc@0.2.0
  - @arkesoft/themes-modern@0.1.0
  - @arkesoft/errors@0.2.0
  - @arkesoft/tenancy@0.2.0

## 0.1.1

### Patch Changes

- Geliştirme ortamı güvenilirliği düzeltildi: kanonik `pnpm dev` komutu artık mağaza vitrinini
  hatasız ayağa kaldırıyor ve vitrinin ortam değişkeni hatası API sunucusunu birlikte
  düşürmüyor. Playwright test koşumlarının arkada bıraktığı takılı kalmış süreçler ve bunun
  yol açtığı rastgele test başarısızlıkları giderildi. [v0.0.9.1]
- @arkesoft/errors@0.1.1
  - @arkesoft/tenancy@0.1.1
  - @arkesoft/trpc@0.1.1

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

### Patch Changes

- Updated dependencies
- Updated dependencies [b072657]
  - @arkesoft/tenancy@0.1.0
  - @arkesoft/trpc@0.1.0
  - @arkesoft/errors@0.1.0
