# Değişiklik Kaydı — Arkesoft Platform

Bu dosya **platform çekirdeğinin** sürüm geçmişini tutar ve [Changesets](https://github.com/changesets/changesets) tarafından üretilir. Elle düzenleme yapılmaz; girdiler `.changeset/*.md` dosyalarından gelir.

Sürümleme [Semantic Versioning](https://semver.org/lang/tr/) kurallarına uyar. Platform, `theme-sdk`, her tema ve public API birbirinden bağımsız semver taşır; kuralların tamamı `ROADMAP.md` → _Sürüm Politikası_ bölümündedir.

Bağımsız versiyonlanan paketler kendi değişiklik kayıtlarını kendi klasörlerinde tutar:

- `packages/theme-sdk/CHANGELOG.md`
- `packages/themes/modern/CHANGELOG.md`
- `packages/themes/corporate/CHANGELOG.md`

## Changeset ekleme

```bash
pnpm changeset
```

- Özet **Türkçe** ve kullanıcıya dönük yazılır; doğrudan sürüm notuna girer.
- Özet, ait olduğu ROADMAP versiyonunu belirtir. Örnek:
  `Sipariş iptal akışı eklendi. Kısmi iade desteği dahil. [v0.9.0]`
- Davranış değiştiren her PR bir changeset içerir; yalnızca `docs`, `test` ve `chore` PR'ları muaftır.

---

<!-- Changesets bu çizginin altına yazar. Elle girdi eklemeyin. -->

## 0.6.0 — 2026-11-09

- İki faktörlü kimlik doğrulama (TOTP) eklendi: QR kodla kurulum, girişte doğrulama kodu
  isteme, yedek kodlarla kurtarma ve 2FA'yı kapatma. Mağaza sahipleri (owner) için 2FA'yı
  zorunlu kılma kuralı sisteme kazandırıldı — bu kuralı açıp kapatan panel ekranı sonraki
  bir sürümde gelecek. Art arda 10 başarısız doğrulama denemesinde hesap bir süreliğine
  kilitleniyor. 2FA ile ilgili tüm işlemler (kurulum, doğrulama, kapatma, yedek kod
  oluşturma) artık otomatik olarak sınırlandırılıyor; 2FA'yı kapatma ve yedek kodları
  yenileme işlemleri artık güvenlik kayıtlarına doğru şekilde yazılıyor. Panel, 2FA
  durumunu artık sunucudan güvenilir biçimde okuyor — birden fazla sekme açıkken kurulum
  sihirbazının kazara tekrar çalışması giderildi. [v0.0.15]

## 0.5.0 — 2026-11-05

- Parola, oturum ve doğrulama belirteçlerini tutan tablolar artık veritabanı seviyesinde de
  ayrı ve en az yetkili bir kimlik doğrulama rolüyle korunuyor; uygulamanın günlük
  çalıştığı rol bu tablolara artık hiç erişemiyor. Operatör notu: kurulumunuzda yeni bir
  ortam değişkeni (`DATABASE_AUTH_URL`) zorunlu hale geldi — `.env` dosyanıza
  `.env.example`'daki satırı ekleyip `pnpm db:bootstrap`'i yeniden çalıştırmanız gerekiyor,
  aksi halde giriş/kayıt akışı açılışta hata verir. [v0.0.14.1]

## 0.4.0 — 2026-11-04

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

  Davet, kabul ve denetim kayıtları mağazaya kapsamlı: bir mağazanın davetleri ve denetim izi
  başka bir mağazadan ne okunabiliyor ne yazılabiliyor (veritabanı seviyesinde RLS ile
  zorlanıyor). Mağaza başına bekleyen davet sayısı sınırlı ve aynı davet çok kısa aralıkla tekrar
  gönderilemiyor.

  Operatör notu: bu sürüm yeni bir ortam değişkeni veya yeni bir kurulum adımı getirmiyor; mevcut
  kurulumlar yalnızca veritabanı göçünü uygular. [v0.0.14]

- Public API'ye `member` namespace'i eklendi: `member.invite` bir e-posta adresini belirli bir
  role davet eder, `member.acceptInvitation` daveti kabul edip üyeliği oluşturur,
  `member.updateRole` bir üyenin rolünü değiştirir, `member.remove` üyeyi ekipten çıkarır. Bunlar
  sözleşmenin ilk yazma uçlarıdır; dördü de mağaza bağlamını zorunlu kılar.

  Sözleşmeye ayrıca izin kataloğu (`job:read`, `member:write`) ve rol → izin eşlemesi girdi. İzin
  gerektiren prosedürler yeni `permissionProcedure` basamağından geçiyor; yetkisi olmayan çağrı
  tele `PERMISSION_DENIED` ve 403 olarak dönüyor, istenen iznin adı ve çağıranın rolü yanıta
  **girmiyor** (yalnızca sunucu logunda görünüyor). Hangi prosedürün hangi izni istediği kapalı
  bir yüzey tablosunda tutuluyor, yani izin istemeyi unutmuş yeni bir prosedür eklemek mümkün
  değil.

  `job.get` ve `job.list` de izinli basamağa taşındı; `job:read` izni beş rolün beşine de
  verildiği için dün bu uçları çağırabilen her istemci bugün de çağırabiliyor — hiçbir yetenek
  kaldırılmadı.

  Bu bir **yalnızca ekleme** sürümüdür: var olan dört namespace'in hiçbir prosedürü, alanı veya
  tipi değişmedi, zorunlu hâle gelmedi, kaldırılmadı. Mevcut istemciler değişiklik yapmadan
  çalışmaya devam eder. [v0.0.14]

## 0.3.0 — 2026-11-03

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
  çalışıyorsa onu durdurmak gerekiyor. Ayrıntı: `docs/development.md` → "Kuyruk worker'ı".
  [v0.0.11]

- Public API'ye salt okunur `job` namespace'i eklendi: `job.get` bir işin durumunu, ilerlemesini ve
  hatasını döndürür, `job.list` mağazanın işlerini sayfalı olarak listeler. İkisi de mağaza
  bağlamını zorunlu kılar; başka bir mağazanın iş kimliği, var olmayan bir kimlikle **aynı** hatayı
  alır (bir işin varlığı sızdırılmaz).

  Bu bir **yalnızca ekleme** sürümüdür: var olan hiçbir prosedür, alan veya tip değişmedi,
  kaldırılmadı. Mevcut istemciler değişiklik yapmadan çalışmaya devam eder. [v0.0.11]

## 0.2.0 — 2026-11-03

- Mağazanın seçtiği tema artık kendi vitrininde gerçekten render ediliyor: ilk tema paketi
  (`modern`) ana sayfa ve "sayfa bulunamadı" şablonlarıyla storefront'a bağlandı, tema rengi ve
  yazı tipi ayarları sayfaya otomatik uygulanıyor. Mağaza sahibi bu sürümde henüz bir yüzey
  görmüyor (tema seçimi her mağaza için şimdilik sabit) — bu, "tema seç, siteyi kur" vaadinin
  temel alt yapısını kuruyor. [v0.0.10]
- Tema sözleşmesindeki varlık yolu doğrulaması sıkılaştırıldı: gizli dosyalara (`.env` gibi)
  işaret eden tema varlık yolları artık reddediliyor. İlk tema paketi (`modern`) bu sürümle
  ilk kez yayınlanıyor. [v0.0.10]

## 0.1.1 — 2026-11-03

- Geliştirme ortamı güvenilirliği düzeltildi: kanonik `pnpm dev` komutu artık mağaza vitrinini
  hatasız ayağa kaldırıyor ve vitrinin ortam değişkeni hatası API sunucusunu birlikte
  düşürmüyor. Playwright test koşumlarının arkada bıraktığı takılı kalmış süreçler ve bunun
  yol açtığı rastgele test başarısızlıkları giderildi. [v0.0.9.1]

## 0.1.0 — 2026-11-02

- Yönetim paneli (admin) açıldı. Mağaza sahibi artık kendi tarayıcısından e-posta ve şifresiyle
  panele giriş yapabiliyor; oturumu sayfa yenilendiğinde korunuyor, çıkış yapınca güvenli şekilde
  sonlanıyor ve oturumsuz erişim otomatik olarak giriş ekranına yönlendiriliyor. Hatalar (yanlış
  şifre, bağlantı sorunu vb.) Türkçe, anlaşılır mesajlarla gösteriliyor; teknik kodlar veya İngilizce
  sistem mesajları ekrana çıkmıyor. Panelin tamamı klavyeyle ve ekran okuyucuyla kullanılabilir
  (yalnızca fare gerektiren hiçbir işlem yok).

Operatör notu: mevcut `.env` dosyalarında `AUTH_BASE_URL` değerinin portu `:3000`'den `:5173`'e
güncellenmesi gerekiyor — bkz. `docs/development.md` → "Panel (`apps/admin`) Geliştirme".

[v0.0.7]

- Kayıt, giriş, çıkış ve oturum yönetimi Better Auth kütüphanesiyle tamamlandı. Mağaza sahibi panele bir hesapla giriş yapabilir, e-posta doğrulaması gerçekleştirir ve kendi oturumlarını yönetir.

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

- CI/CD ve Changesets kurulumu. Dört bağımsız uygulama hattı, otomatik sürüm yönetimi, Türkçe özet disiplini. [v0.0.12]
- Tenant izolasyonu artık veritabanı seviyesinde zorluyoruz. Postgres RLS (Row Level Security) ve FORCE RLS ile her sorgu otomatik olarak mağazanın verilerine filtrelenir. İkinci bir rol (`arkesoft_app`) ayarlanarak uygulama en az yetkisi ilkesiyle koşuyor. Yeni `withTenant()` fonksiyonu transaction'lara tenant context'i bağlar; context'siz sorgu sıfır satır döner (hata değil). Linter 20 kural ile izolasyon ihlalini CI'da yakalar. Test komutu `pnpm test:isolation` yeni ve zorunlu.

⚠ OPERATÖR KIRILMASI: `.env` dosyasına iki yeni değişken gerekiyor (`DATABASE_MIGRATION_URL`, `DATABASE_BOOTSTRAP_URL`) ve adım olarak çalıştırılması zorunlu olan `pnpm db:bootstrap` adımı geldi. Mevcut `.env`'de bu değişkenler yoksa `pnpm env:check` kırmızıya düşecek. Geçiş talimatları ve geri alma adımları `docs/development.md`'de açıklanmıştır. [v0.0.13]

- Mağaza vitrini (storefront) açıldı. Müşteriler artık kendi alt alan adlarından
  (`magaza-adi.arkesoft.app`) veya bağladıkları özel alan adından mağazalarına
  ulaşabiliyor; adres doğru çözülemezse Türkçe bir "mağaza bulunamadı" sayfası, API
  geçici olarak erişilemezse Türkçe bir "şu an kullanılamıyor" sayfası gösteriliyor.
  Her sayfa arama motorlarına kendi mağaza adresine göre doğru `robots.txt` ve site
  haritası bildiriyor. Vitrin tarayıcıda hiçbir kiracı/sır bilgisi taşımıyor; önbellek
  başlıkları mağazalar arası veri sızıntısını önleyecek şekilde ayarlandı.

[v0.0.8]

- Uçtan uca tipli ilk tRPC endpoint'leri eklendi. İstemciler `@arkesoft/trpc` paketinden tipi alıyor. `session.me` ve `tenant.current` prosedürleri çalışıyor.

**Yeni ana bağımlılık:** `@trpc/server@11.19.0` + `@trpc/client@11.19.0` — **exact ve birebir aynı sürüm**. Aynı sürüm zorunluluğu paketin kendi şartı: `@trpc/client`'ın `peerDependencies`'i `@trpc/server`'ın tam olarak aynı sürümünü istiyor (ikisi tel protokolünü paylaşıyor, ayrı kayan aralıklar sessiz uyumsuzluk üretir).

`latest` (**11.22.1**) **seçilmedi:** teslim gününden yalnızca **1 gün önce** yayınlanmıştı ve depodaki tedarik zinciri koruması (`minimumReleaseAge`, 7 gün) bu kadar yeni bir sürüme izin vermiyor. 11.19.0 yayından 43 gün sonra seçildi ve koruma eşiğini **istisna kaydı olmadan** geçti. **Sonraki geliştirici `latest`'e çekmemeli** — v0.0.5'teki `nodemailer` kararıyla aynı gerekçe.

Operatör kırılması yok — yeni ortam değişkeni yok, migration yok, şema değişikliği yok. `@arkesoft/errors` iç imza daralması (`toErrorBody` üçüncü parametresi kaldırıldı, `details` artık `AppError.publicDetails`'ten geliyor) platform için kırıcı değil çünkü dönüş değeri birebir aynı.

Güvenlik iyileştirmesi: `/trpc` yanıtları `Cache-Control: no-store, private` ve `Vary: Cookie` taşıyor (paylaşımlı önbellek üzerinden guard atlatmayı kapatıyor).

[v0.0.6]

> **Not:** Changesets `v0.0.12`'de kurulacak. `0.0.1` – `0.0.11` arası girdiler bu nedenle
> elle yazılmıştır; `v0.0.12`'den sonra bu bölüm tamamen Changesets tarafından üretilir.

## 0.0.4 — 2026-10-26

Platformun ilk HTTP yüzeyini açan, her istekte tenant bağlamını taşıyan ve merkezi hata yönetimini kuran NestJS API iskeletinin tamamlanması.

- **NestJS 12.2.0 API iskeleti** — `main.ts`, global Zod doğrulama pipe, graceful shutdown, `/health` (liveness) ve `/health/ready` (readiness) endpoint'leri
- **Tenant context yönetimi** — AsyncLocalStorage ile istek scope'a tenant bilgisi; host adından veya `x-arkesoft-tenant` başlığından (geliştirme ortamında) çözüm
- **Fail-closed tasarım** — middleware çözümlemez, guard exhaustive switch ile kararlar; bilinmeyen host'ta TENANT_NOT_FOUND 404'ü
- **Standart hata sözleşmesi** — `{ code, message, details, requestId }` yapısı; tüm yanıtlara birebir uyumlu
- **`@arkesoft/errors` iç paketi** — `AppError`, `AppErrorBody` Zod şeması, `maskEmail` + redaction ilkelleri
- **Yapılandırılmış JSON log (pino)** — `requestId` korelasyonu, sır/PII maskeleme, tenant bağlamı her kaydında
- **Zod doğrulama** — `ValidatedBody/Query/Params` dekoratörleri, `class-validator` **çıkarıldı**
- **Paket sürümleri:** kök **0.0.4**, `@arkesoft/api` **0.0.4**, `@arkesoft/db` **0.0.4**, `@arkesoft/errors` **0.0.4** (yeni), `@arkesoft/config` **0.0.3** (değişmedi)
- **Kabul kriteri:** 14 dosya / 112 API test, 0 failed / 0 skipped; `/health` 200; bilinmeyen host 404; `demo-magaza.arkesoft.localhost` tenant çözümü
- **Uyarı:** v0.0.13'e kadar tenant izolasyonunun tek savunma hattı uygulama katmanıdır; RLS politikaları henüz yok

## 0.0.3 — 2026-10-26

Veritabanı katmanının temel modelleri ve Prisma kurulumu. Çok kiracılı veri izolasyonunun temeli.

- **Prisma 7.10.1 kurulumu** — `@prisma/adapter-pg` + `pg` + `@types/pg` zorunlu bağımlılık
  (Prisma 7 mimarisi).
- **`@arkesoft/db` paketi** — `Tenant`, `User`, `TenantMembership` modelleri ve ilk migration
  (`20261026082729_init`). Şema RLS'e hazırlanmış: tenant'a bağlı tablolarda `tenant_id TEXT NOT NULL`,
  ön kolon indeks, v0.0.13'ten itibaren zorlayıcı RLS politikaları gelecek.
- **Konvansiyonlar:** Cuid2 `text` PK (uzunluk-sınırsız), `Timestamptz(3)` zaman alanları, soft
  delete `deletedAt`, platform seviyesi vs. tenant'a bağlı tablolar taksonomi ile ayrılmış.
  Detay: ADR-0003.
- **Seed ve migration:** `pnpm db:reset && pnpm db:seed` iki kez üst üste exit 0 (idempotans).
  Demo tenant (`demo-magaza`) ve demo owner kullanıcısı (`demo-yonetici@arkesoft.test`).
- **Script yüzeyinde güvenlik:** `db:push` ve `db:reset` yıkıcı komutları allowlist'li sarmalayıcıdan
  geçiyor; host kontrolü (yalnızca localhost/127.0.0.1), `NODE_ENV` varsayılan-reddet, kaçış kapısı
  (ARKESOFT_CONFIRM_DESTRUCTIVE). Diğer veri komutları (`db:seed`, `migrate dev`, `migrate reset`)
  da aynı mekanizmada.
- **Test altyapısı:** Vitest kurulumu, seri koşum (gerçek DB ortağı), tenant izolasyon süiti v0.0.13.
- **`packages/config` devDep → dep** — tek doğrulama noktası: `packages/db/src/env.ts` →
  `readDatabaseEnv()`.
- **Kabul kriteri geçti:** 4 test dosyası / 63 test (%100 yeşil, 0 skipped), lint/typecheck/build/format
  tümü exit 0, AC4 kuralı lint ile zorlanıyor (`packages/config/eslint/base.js`).
- RLS politikaları, rol ayrımı, `FORCE ROW LEVEL SECURITY`, tenant context kancası **v0.0.13**'de
  gelecek. Bu sürümde şema hazırlanmış, yönetim henüz değil (AC8 teknik borç).

## 0.0.2 — 2026-10-26

Yerel geliştirme altyapısı. Tek komutla beş servis ayağa kalkıyor.

- `pnpm infra:up` ile Postgres 17, Redis 8, Meilisearch, S3 uyumlu depolama ve
  Mailpit ayağa kalkıyor; komut tüm servisler `healthy` olmadan geri dönmüyor.
- Verileri isimli Docker volume'larında kalıcı. `pnpm infra:down` veriyi korur,
  `pnpm infra:reset` sıfırdan kurar — ikisi de ayrı ayrı doğrulandı.
- Ortam değişkenleri Zod şemasıyla doğrulanıyor (`packages/config/src/env.ts`).
  `pnpm env:check` değerleri denetler ve parola/anahtarları maskeleyerek basar.
- `docs/development.md`: kurulum, komutlar, bilinen tuzaklar, sorun giderme.
- Yerel S3 servisi MinIO yerine **SeaweedFS**: MinIO'nun public Docker imajları
  artık anonim çekilemiyor. Üretim depolaması (Cloudflare R2) etkilenmedi.
  Gerekçe ve alternatifler: `docs/adr/0005-yerel-s3-depolama.md`.
- Postgres veritabanı seviyesinde Türkçe collation **bilinçli olarak**
  ayarlanmadı; gerekçesi `docs/development.md`'de. Türkçe sıralama v0.4.0'da
  kolon/sorgu seviyesinde gelecek.

## 0.0.1 — 2026-10-26

Monorepo iskeleti. Henüz çalışan bir ürün yok; bu sürüm sonradan değiştirmesi pahalı olan
temel yapıyı sabitler.

- Turborepo + pnpm workspace kurulumu. Araç sürümleri `pnpm-workspace.yaml` catalog'unda
  tek yerde tutuluyor; monorepo genelinde sürüm kayması oluşmuyor.
- `@arkesoft/config`: paylaşılan tsconfig preset'leri (base/node/react), tip bilgisine
  dayalı katı ESLint yapılandırması, Prettier yapılandırması ve Tailwind v4 token iskeleti.
- Dokuz paket iskeleti: `apps/api`, `apps/admin`, `apps/superadmin`, `apps/storefront`,
  `packages/db`, `packages/trpc`, `packages/ui`, `packages/theme-sdk`,
  `packages/integrations`. Hepsi derleniyor, lint ve typecheck'ten geçiyor.
- ESLint kuralları CLAUDE.md'deki yasakları makine tarafından zorluyor: `any`, `console.*`,
  sınıf tabanlı React bileşeni, hata yutma ve eksik dönüş tipi hata üretiyor.
- ADR şablonu (`docs/adr/0000-sablon.md`).
- TypeScript `6.0.3`'e sabitlendi; gerekçesi `ROADMAP.md` → Varsayımlar A13.
- Hedef Node sürümü 24 LTS olarak düzeltildi (önceki varsayım 22 LTS); gerekçesi
  `ROADMAP.md` → Varsayımlar A1.
