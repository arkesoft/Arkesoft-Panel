# @arkesoft/superadmin

## 0.13.0

### Patch Changes

- Updated dependencies
  - @arkesoft/errors@0.13.0
  - @arkesoft/trpc@0.8.6
  - @arkesoft/i18n@0.13.0
  - @arkesoft/ui@0.13.0

## 0.12.0

### Patch Changes

- @arkesoft/errors@0.12.0
  - @arkesoft/i18n@0.12.0
  - @arkesoft/ui@0.12.0
  - @arkesoft/trpc@0.8.5

## 0.11.0

### Patch Changes

- Updated dependencies [4cae8ad]
  - @arkesoft/trpc@0.8.4
  - @arkesoft/errors@0.11.0
  - @arkesoft/ui@0.11.0

## 0.10.3

### Patch Changes

- @arkesoft/errors@0.10.3
  - @arkesoft/ui@0.10.3
  - @arkesoft/trpc@0.8.3

## 0.10.2

### Patch Changes

- @arkesoft/errors@0.10.2
  - @arkesoft/ui@0.10.2
  - @arkesoft/trpc@0.8.2

## 0.10.1

### Patch Changes

- İki faktörlü kimlik doğrulama kurulum sihirbazında sayfa yeniden yüklendiğinde
  QR kodunun ve gizli anahtarın değişmesine yol açan hata düzeltildi — artık devam
  eden bir kuruluma aynı anahtarla sorunsuzca dönülüyor (yedek kodların bu durumda
  tekrar gösterilemeyeceği açıkça belirtiliyor). Ayrıca iki iç bakım kalemi
  kapatıldı: `//` ile başlayan isteklerin sunucuda beklenmeyen hataya (500) yol
  açması engellendi; sürekli entegrasyon (CI) kontrolleri artık test
  başarısızlıklarını daha güvenilir şekilde tespit ediyor. [v0.0.20.1]
- @arkesoft/errors@0.10.1
  - @arkesoft/ui@0.10.1
  - @arkesoft/trpc@0.8.1

## 0.10.0

### Minor Changes

- Arkesoft ekibi için ayrı bir süper admin paneli eklendi. Platform yöneticileri artık
  kendi girişleriyle (iki faktörlü doğrulama zorunlu) bu panelden tüm mağazaların
  listesini (alan adı, plan, durum, oluşturulma tarihi) ve platform erişim denetim
  kaydını görebiliyor. Bir mağazanın verisine erişim artık görünmez bir arka kapı
  üzerinden değil, her erişimde iz bırakan açık bir kayıt mekanizmasıyla yapılıyor.
  Mağaza sahiplerinin kendi panelleri bu değişiklikten etkilenmiyor. [v0.0.20]

### Patch Changes

- Updated dependencies
  - @arkesoft/trpc@0.8.0
  - @arkesoft/errors@0.10.0
  - @arkesoft/ui@0.10.0

## 0.9.0

No changes in this release.

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

No changes in this release.
