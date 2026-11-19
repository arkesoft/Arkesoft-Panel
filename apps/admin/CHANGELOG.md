# @arkesoft/admin

## 0.11.0

### Patch Changes

- Updated dependencies [4cae8ad]
  - @arkesoft/trpc@0.8.4
  - @arkesoft/errors@0.11.0
  - @arkesoft/tenancy@0.11.0
  - @arkesoft/ui@0.11.0

## 0.10.3

### Patch Changes

- @arkesoft/errors@0.10.3
  - @arkesoft/tenancy@0.10.3
  - @arkesoft/ui@0.10.3
  - @arkesoft/trpc@0.8.3

## 0.10.2

### Patch Changes

- @arkesoft/errors@0.10.2
  - @arkesoft/tenancy@0.10.2
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
  - @arkesoft/tenancy@0.10.1
  - @arkesoft/ui@0.10.1
  - @arkesoft/trpc@0.8.1

## 0.10.0

### Patch Changes

- Updated dependencies
  - @arkesoft/trpc@0.8.0
  - @arkesoft/errors@0.10.0
  - @arkesoft/tenancy@0.10.0
  - @arkesoft/ui@0.10.0

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

### Patch Changes

- Updated dependencies
  - @arkesoft/tenancy@0.9.0
  - @arkesoft/trpc@0.7.0
  - @arkesoft/errors@0.9.0
  - @arkesoft/ui@0.9.0

## 0.8.0

### Patch Changes

- @arkesoft/errors@0.8.0
  - @arkesoft/ui@0.8.0
  - @arkesoft/trpc@0.6.1

## 0.7.0

### Minor Changes

- Hesabım → Güvenlik ekranına aktif oturumlarınızı gösteren yeni bir kart eklendi: hangi
  tarayıcı ve işletim sisteminden, hangi IP adresinden ve en son ne zaman giriş
  yaptığınızı görebilir, şu an kullandığınız cihazı ayırt edebilir; istediğiniz oturumu
  veya diğer tüm oturumlarınızı tek tıkla uzaktan sonlandırabilirsiniz.

  Hesabınızı etkileyen altı hassas işlem (oturum sonlandırma — tek veya tümü, iki
  faktörlü doğrulamayı kapatma, yedek kodları yenileme, kimlik doğrulayıcı kurulum
  bilgisini yeniden alma ve doğrulama kodu girme) artık oturumunuz açık olsa bile
  parolanızı yeniden doğrulamadan tamamlanmıyor; bu, çalınan bir oturum çerezinin
  hesabınıza kalıcı zarar vermesini önlüyor. [v0.0.15.1]

### Patch Changes

- Updated dependencies
  - @arkesoft/trpc@0.6.0
  - @arkesoft/errors@0.7.0
  - @arkesoft/ui@0.7.0

## 0.6.0

### Minor Changes

- İki faktörlü kimlik doğrulama (TOTP) eklendi: QR kodla kurulum, girişte doğrulama kodu
  isteme, yedek kodlarla kurtarma ve 2FA'yı kapatma. Mağaza sahipleri (owner) için 2FA'yı
  zorunlu kılma kuralı sisteme kazandırıldı — bu kuralı açıp kapatan panel ekranı sonraki
  bir sürümde gelecek. Art arda 10 başarısız doğrulama denemesinde hesap bir süreliğine
  kilitleniyor. 2FA ile ilgili tüm işlemler (kurulum, doğrulama, kapatma, yedek kod
  oluşturma) artık otomatik olarak sınırlandırılıyor; 2FA'yı kapatma ve yedek kodları
  yenileme işlemleri artık güvenlik kayıtlarına doğru şekilde yazılıyor. Panel, 2FA
  durumunu artık sunucudan güvenilir biçimde okuyor — birden fazla sekme açıkken kurulum
  sihirbazının kazara tekrar çalışması giderildi. [v0.0.15]

### Patch Changes

- Updated dependencies
  - @arkesoft/errors@0.6.0
  - @arkesoft/trpc@0.5.0
  - @arkesoft/ui@0.6.0

## 0.5.0

### Patch Changes

- @arkesoft/errors@0.5.0
  - @arkesoft/trpc@0.4.1
  - @arkesoft/ui@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies
  - @arkesoft/trpc@0.4.0
  - @arkesoft/errors@0.4.0
  - @arkesoft/ui@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies
  - @arkesoft/trpc@0.3.0
  - @arkesoft/errors@0.3.0
  - @arkesoft/ui@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies
  - @arkesoft/trpc@0.2.0
  - @arkesoft/errors@0.2.0
  - @arkesoft/ui@0.2.0

## 0.1.1

### Patch Changes

- @arkesoft/errors@0.1.1
  - @arkesoft/trpc@0.1.1
  - @arkesoft/ui@0.1.1

## 0.1.0

### Minor Changes

- 7b41a06: Yönetim paneli (admin) açıldı. Mağaza sahibi artık kendi tarayıcısından e-posta ve şifresiyle
  panele giriş yapabiliyor; oturumu sayfa yenilendiğinde korunuyor, çıkış yapınca güvenli şekilde
  sonlanıyor ve oturumsuz erişim otomatik olarak giriş ekranına yönlendiriliyor. Hatalar (yanlış
  şifre, bağlantı sorunu vb.) Türkçe, anlaşılır mesajlarla gösteriliyor; teknik kodlar veya İngilizce
  sistem mesajları ekrana çıkmıyor. Panelin tamamı klavyeyle ve ekran okuyucuyla kullanılabilir
  (yalnızca fare gerektiren hiçbir işlem yok).

  Operatör notu: mevcut `.env` dosyalarında `AUTH_BASE_URL` değerinin portu `:3000`'den `:5173`'e
  güncellenmesi gerekiyor — bkz. `docs/development.md` → "Panel (`apps/admin`) Geliştirme".

  [v0.0.7]

### Patch Changes

- Updated dependencies [7b41a06]
- Updated dependencies
- Updated dependencies [b072657]
  - @arkesoft/ui@0.1.0
  - @arkesoft/trpc@0.1.0
  - @arkesoft/errors@0.1.0
