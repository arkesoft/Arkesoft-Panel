# @arkesoft/api

## 0.1.0

### Minor Changes

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

- b072657: Uçtan uca tipli ilk tRPC endpoint'leri eklendi. İstemciler `@arkesoft/trpc` paketinden tipi alıyor. `session.me` ve `tenant.current` prosedürleri çalışıyor.

  **Yeni ana bağımlılık:** `@trpc/server@11.19.0` + `@trpc/client@11.19.0` — **exact ve birebir aynı sürüm**. Aynı sürüm zorunluluğu paketin kendi şartı: `@trpc/client`'ın `peerDependencies`'i `@trpc/server`'ın tam olarak aynı sürümünü istiyor (ikisi tel protokolünü paylaşıyor, ayrı kayan aralıklar sessiz uyumsuzluk üretir).

  `latest` (**11.22.1**) **seçilmedi:** teslim gününden yalnızca **1 gün önce** yayınlanmıştı ve depodaki tedarik zinciri koruması (`minimumReleaseAge`, 7 gün) bu kadar yeni bir sürüme izin vermiyor. 11.19.0 yayından 43 gün sonra seçildi ve koruma eşiğini **istisna kaydı olmadan** geçti. **Sonraki geliştirici `latest`'e çekmemeli** — v0.0.5'teki `nodemailer` kararıyla aynı gerekçe.

  Operatör kırılması yok — yeni ortam değişkeni yok, migration yok, şema değişikliği yok. `@arkesoft/errors` iç imza daralması (`toErrorBody` üçüncü parametresi kaldırıldı, `details` artık `AppError.publicDetails`'ten geliyor) platform için kırıcı değil çünkü dönüş değeri birebir aynı.

  Güvenlik iyileştirmesi: `/trpc` yanıtları `Cache-Control: no-store, private` ve `Vary: Cookie` taşıyor (paylaşımlı önbellek üzerinden guard atlatmayı kapatıyor).

  [v0.0.6]

### Patch Changes

- 16c1035: CI/CD ve Changesets kurulumu. Dört bağımsız uygulama hattı, otomatik sürüm yönetimi, Türkçe özet disiplini. [v0.0.12]
- Updated dependencies [08ba11d]
- Updated dependencies [b072657]
  - @arkesoft/db@0.1.0
  - @arkesoft/trpc@0.1.0
  - @arkesoft/errors@0.1.0
  - @arkesoft/config@0.1.0
