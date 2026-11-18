# @arkesoft/tenancy

## 0.10.2

No changes in this release.

## 0.10.1

No changes in this release.

## 0.10.0

No changes in this release.

## 0.9.0

### Minor Changes

- Artık yeni müşteriler panelde kendi başlarına kayıt olup birkaç adımda (hesap →
  mağaza adı → mağaza adresi → site tipi) kendi mağazalarını oluşturabiliyor.
  Mağaza adresi (alt alan adı) seçilirken müsaitlik anında kontrol ediliyor;
  alınmış, yasaklı (www, api, admin gibi) veya Türkçe karakter içeren adlar
  doğru şekilde işleniyor ve kullanıcıya anlaşılır bir hata gösteriliyor.
  Kayıt tamamlandığında mağaza "kurulum bekliyor" durumunda doğuyor ve panelde,
  mağazanızı ziyaretçilere açmak için kalan adımları gösteren bir kurulum
  kontrol listesi görünüyor. [v0.1.0]

## 0.8.0

No changes in this release.

## 0.7.0

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.0

No changes in this release.

## 0.2.0

No changes in this release.

## 0.1.1

No changes in this release.

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
