# @arkesoft/config

## 0.6.0

No changes in this release.

## 0.5.0

### Minor Changes

- Parola, oturum ve doğrulama belirteçlerini tutan tablolar artık veritabanı seviyesinde de
  ayrı ve en az yetkili bir kimlik doğrulama rolüyle korunuyor; uygulamanın günlük
  çalıştığı rol bu tablolara artık hiç erişemiyor. Operatör notu: kurulumunuzda yeni bir
  ortam değişkeni (`DATABASE_AUTH_URL`) zorunlu hale geldi — `.env` dosyanıza
  `.env.example`'daki satırı ekleyip `pnpm db:bootstrap`'i yeniden çalıştırmanız gerekiyor,
  aksi halde giriş/kayıt akışı açılışta hata verir. [v0.0.14.1]

## 0.4.0

No changes in this release.

## 0.3.0

No changes in this release.

## 0.2.0

No changes in this release.

## 0.1.1

### Patch Changes

- Geliştirme ortamı güvenilirliği düzeltildi: kanonik `pnpm dev` komutu artık mağaza vitrinini
  hatasız ayağa kaldırıyor ve vitrinin ortam değişkeni hatası API sunucusunu birlikte
  düşürmüyor. Playwright test koşumlarının arkada bıraktığı takılı kalmış süreçler ve bunun
  yol açtığı rastgele test başarısızlıkları giderildi. [v0.0.9.1]

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
