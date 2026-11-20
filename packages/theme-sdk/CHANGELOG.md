# @arkesoft/theme-sdk

## 0.1.9

### Patch Changes

- @arkesoft/versioning@0.12.0

## 0.1.8

### Patch Changes

- @arkesoft/versioning@0.11.0

## 0.1.7

### Patch Changes

- @arkesoft/versioning@0.10.3

## 0.1.6

### Patch Changes

- @arkesoft/versioning@0.10.2

## 0.1.5

### Patch Changes

- @arkesoft/versioning@0.10.1

## 0.1.4

### Patch Changes

- @arkesoft/versioning@0.10.0

## 0.1.3

### Patch Changes

- @arkesoft/versioning@0.9.0

## 0.1.2

### Patch Changes

- Platform, tema ve API sürümleri artık veritabanında izlenebilir [v0.0.21]. Her
  müşterinin (kiracının) o anda hangi platform + tema + API sürümü bileşiminde
  olduğu tek bir kayıtta tutulur; bu kayıt, bir önceki sürüm bileşimini de
  geri dönülebilir şekilde saklar. Sürüm güncelleme ve geri alma işlemlerinin
  geçmişi de ayrıca kayda geçer. Bu sürümde panelde gösterilen bir ekran yoktur
  — bu değişiklik, ileride gelecek sürüm görünürlüğü ve geri alma özelliklerinin
  veri temelini kurar.
- @arkesoft/versioning@0.8.0

## 0.1.1

### Patch Changes

- Tema sözleşmesindeki varlık yolu doğrulaması sıkılaştırıldı: gizli dosyalara (`.env` gibi)
  işaret eden tema varlık yolları artık reddediliyor. İlk tema paketi (`modern`) bu sürümle
  ilk kez yayınlanıyor. [v0.0.10]

## 0.1.0

### Minor Changes

- Tema sözleşmesi tipli ve şemalı hale getirildi: `ThemeManifest` tipi ve `theme.json` için Zod + JSON Schema üretimi, sekiz ayar şeması ilkeli (`color`, `font`, `select`, `toggle`, `image`, `text`, `number`, `group`), desteklenen şablon listesi ve slot/bölüm tanımı, `defineTheme()` yardımcısı, ayar migration sözleşmesi ve `validateThemeManifest()`/`validateThemeSettings()` doğrulama fonksiyonları eklendi. [v0.0.9]
