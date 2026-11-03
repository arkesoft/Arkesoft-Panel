# @arkesoft/tenancy

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
