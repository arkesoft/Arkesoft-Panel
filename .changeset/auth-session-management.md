---
'@arkesoft/api': minor
---

Kayıt, giriş, çıkış ve oturum yönetimi Better Auth kütüphanesiyle tamamlandı. Mağaza sahibi panele bir hesapla giriş yapabilir, e-posta doğrulaması gerçekleştirir ve kendi oturumlarını yönetir.

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
