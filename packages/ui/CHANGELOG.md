# @arkesoft/ui

## 0.7.0

No changes in this release.

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

- 7b41a06: Yönetim paneli (admin) açıldı. Mağaza sahibi artık kendi tarayıcısından e-posta ve şifresiyle
  panele giriş yapabiliyor; oturumu sayfa yenilendiğinde korunuyor, çıkış yapınca güvenli şekilde
  sonlanıyor ve oturumsuz erişim otomatik olarak giriş ekranına yönlendiriliyor. Hatalar (yanlış
  şifre, bağlantı sorunu vb.) Türkçe, anlaşılır mesajlarla gösteriliyor; teknik kodlar veya İngilizce
  sistem mesajları ekrana çıkmıyor. Panelin tamamı klavyeyle ve ekran okuyucuyla kullanılabilir
  (yalnızca fare gerektiren hiçbir işlem yok).

  Operatör notu: mevcut `.env` dosyalarında `AUTH_BASE_URL` değerinin portu `:3000`'den `:5173`'e
  güncellenmesi gerekiyor — bkz. `docs/development.md` → "Panel (`apps/admin`) Geliştirme".

  [v0.0.7]
