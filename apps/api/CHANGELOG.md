# @arkesoft/api

## 0.4.0

### Minor Changes

- Ekip yönetimi geldi: mağaza sahibi artık ekibini panele davet edebiliyor, davet e-posta ile
  gidiyor, davet edilen kişi kabul ettiğinde üyeliği oluşuyor; üyelerin rolü değiştirilebiliyor ve
  üyeler ekipten çıkarılabiliyor.

  Beş mağaza rolü (`owner`, `admin`, `staff`, `support`, `readonly`) bu sürümle gerçekten
  uygulanmaya başladı. Bir rolün ne yapabileceği tek bir izin kataloğundan okunuyor; izni olmayan
  istek, isteği yapan kişi mağazanın üyesi olsa bile 403 ile reddediliyor. Salt okunur bir üye
  hiçbir yazma ucunu çağıramaz. Yeni bir rol eklendiğinde rolün izinleri yazılmadan proje
  derlenmiyor, yani bir rolün yanlışlıkla izinsiz (ya da fazla izinli) kalması mümkün değil.

  Her yetki değişikliği denetim kaydına yazılıyor: kim, hangi mağazada, hangi zaman, kimi davet
  etti, kimin rolünü değiştirdi, kimi çıkardı. Denetim kaydı yalnızca eklenir — güncellenmez ve
  silinmez; her kaydın içeriği kapalı bir sözlükten geçtiği için parola, oturum belirteci veya
  e-posta adresi gibi veriler kayda sızamıyor. İstek IP'si ve tarayıcı bilgisi denetim kaydında
  saklanıyor ama hiçbir log satırına geçmiyor.

  Her mağazanın her zaman tam olarak bir sahibi var: son sahip ekipten çıkarılamıyor, sahiplik
  devri iki adım yerine tek bir atomik işlemde yapılıyor ve eşzamanlı iki devir denemesinden
  yalnızca biri başarılı oluyor. Böylece sahipsiz mağaza oluşması engellendi.

  Davet, kabul ve denetim kayıtları mağazaya kapsamlı: bir mağazanın davetleri ve denetim izi başka
  bir mağazadan ne okunabiliyor ne yazılabiliyor (veritabanı seviyesinde RLS ile zorlanıyor).
  Mağaza başına bekleyen davet sayısı sınırlı ve aynı davet çok kısa aralıkla tekrar gönderilemiyor.

  Operatör notu: bu sürüm yeni bir ortam değişkeni veya yeni bir kurulum adımı getirmiyor; mevcut
  kurulumlar yalnızca veritabanı göçünü uygular. [v0.0.14]

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @arkesoft/trpc@0.4.0
  - @arkesoft/db@0.4.0
  - @arkesoft/config@0.4.0
  - @arkesoft/errors@0.4.0
  - @arkesoft/tenancy@0.4.0

## 0.3.0

### Minor Changes

- Arka plan iş altyapısı kuruldu: uzun süren işler artık HTTP isteğinin dışına taşınabiliyor.
  BullMQ tabanlı bir kuyruk, kendi Redis bağlantısı, üst sınırlı exponential backoff ile tekrar
  deneme ve başarısız işlerin düştüğü ayrı bir ölü mektup kuyruğu (DLQ) eklendi. İşler ayrı bir
  worker sürecinde (`pnpm dev:worker`) koşuyor; `pnpm dev` worker'ı bilinçli olarak başlatmaz.

  Her iş artık veritabanında birinci sınıf, mağazaya kapsamlı bir kayıt: durum, ilerleme (0-100),
  hata ve zaman damgaları saklanıyor. İlk iş türü olarak "mağaza kurulumu" iskeleti eklendi —
  adımlarını loglayıp ilerlemesini yazıyor, gerçek kurulum işini henüz yapmıyor (o iş v0.2.0'da).
  `Job` tablosu Postgres RLS ile korunuyor; bir mağazanın işleri başka bir mağazadan ne okunabilir
  ne yazılabilir, worker her işi işin kendi mağaza bağlamı altında koşturuyor.

  SIGTERM sonrası temiz kapanış garantisi (v0.0.4) yeni worker süreci için de korundu: devam eden
  iş sınırlı süre beklenir, kuyruk ve Redis bağlantıları kapatılır, açık handle bırakılmaz.

  Operatör notu: kuyruk testleri `pnpm infra:up` ile gelen compose Redis'ini gerektirir. Redis
  `appendonly yes` ve `noeviction` ile yapılandırılmamışsa kuyruk testleri Türkçe, okunur bir
  mesajla **başlamadan** durur — 6379 portunda ikinci bir Redis (ör. `brew services start redis`)
  çalışıyorsa onu durdurmak gerekiyor. Ayrıntı: `docs/development.md` → "Kuyruk worker'ı". [v0.0.11]

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @arkesoft/db@0.3.0
  - @arkesoft/trpc@0.3.0
  - @arkesoft/config@0.3.0
  - @arkesoft/errors@0.3.0
  - @arkesoft/tenancy@0.3.0

## 0.2.0

### Minor Changes

- Mağazanın seçtiği tema artık kendi vitrininde gerçekten render ediliyor: ilk tema paketi
  (`modern`) ana sayfa ve "sayfa bulunamadı" şablonlarıyla storefront'a bağlandı, tema rengi ve
  yazı tipi ayarları sayfaya otomatik uygulanıyor. Mağaza sahibi bu sürümde henüz bir yüzey
  görmüyor (tema seçimi her mağaza için şimdilik sabit) — bu, "tema seç, siteyi kur" vaadinin
  temel alt yapısını kuruyor. [v0.0.10]

### Patch Changes

- Updated dependencies
  - @arkesoft/db@0.2.0
  - @arkesoft/trpc@0.2.0
  - @arkesoft/config@0.2.0
  - @arkesoft/errors@0.2.0
  - @arkesoft/tenancy@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies
  - @arkesoft/config@0.1.1
  - @arkesoft/db@0.1.1
  - @arkesoft/errors@0.1.1
  - @arkesoft/tenancy@0.1.1
  - @arkesoft/trpc@0.1.1

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

- 5d720cd: Kayıt, giriş, çıkış ve oturum yönetimi Better Auth kütüphanesiyle tamamlandı. Mağaza sahibi panele bir hesapla giriş yapabilir, e-posta doğrulaması gerçekleştirir ve kendi oturumlarını yönetir.

  Yeni özellikler:

  - **Hesap açma ve giriş** — e-posta + şifre kaydı, e-posta doğrulaması (Mailpit üzerinden), şifre sıfırlama
  - **Oturum yönetimi** — birden fazla aygıttan girişleri sonlandırabilme; şifre sıfırlama tüm oturumları öldürür
  - **Oran sınırlama** — Giriş 5 başarısız denemeden sonra 15 dakika kilitli (hesap bazında) + 20 denemesi ayrı IP kısıtı; şifre sıfırlama ve doğrulama e-postası saatte 3 istek (e-posta) + 10 istek (IP)
  - **Güvenlik** — Oturum çerezi `HttpOnly` + `SameSite=Lax` (`Secure` üretimde); çapraz kiracı oturumu 403 döner; loglar ve yanıtlar parola, belirteç, tam e-posta içermez

  ⚠ **OPERATÖR KIRILMASI:** `.env` dosyasına iki yeni zorunlu değişken gerekiyor. Olmadan `apps/api` açılmaz (Zod fail-fast):

  - `BETTER_AUTH_SECRET` — en az 32 karakter (rastgele string)
  - `AUTH_BASE_URL` — panel ana sayfası URL'i (örn. `http://panel.arkesoft.localhost:3000`)

  **Yeni ana bağımlılık:** `nodemailer@10.2.1` (e-posta gönderimine) · Mailpit geliştirme ortamında `infra:up` ile kalkıyor

  [v0.0.5]

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

- 16c1035: CI/CD ve Changesets kurulumu. Dört bağımsız uygulama hattı, otomatik sürüm yönetimi, Türkçe özet disiplini. [v0.0.12]
- Updated dependencies [7b41a06]
- Updated dependencies [08ba11d]
- Updated dependencies
- Updated dependencies [b072657]
  - @arkesoft/config@0.1.0
  - @arkesoft/db@0.1.0
  - @arkesoft/tenancy@0.1.0
  - @arkesoft/trpc@0.1.0
  - @arkesoft/errors@0.1.0
