# ARKESOFT PLATFORM — Versiyonlama Yol Haritası

> Bu dosya platformun sıfırdan üretime kadar her adımını semantik versiyon numarasıyla tanımlar.
> Her değişiklik buradaki bir versiyona bağlı olmak zorundadır. Versiyon kapanınca ilgili kutular
> işaretlenir, changeset eklenir ve `CHANGELOG.md` güncellenir.

**Durum:** Taslak — onay bekliyor. Henüz hiçbir versiyon uygulanmadı.
**Son güncelleme:** 2026-10-26

---

## İçindekiler

| Faz    | Versiyon aralığı    | Konu                                             |
| ------ | ------------------- | ------------------------------------------------ |
| Faz 0  | `0.0.1` – `0.0.22`  | İskelet, altyapı, sözleşmeler                    |
| Faz 1  | `0.1.0` – `0.3.0`   | Tenant yaşam döngüsü, provisioning, tema sistemi |
| Faz 2  | `0.4.0` – `0.6.0`   | Katalog ve arama                                 |
| Faz 3  | `0.7.0` – `0.9.0`   | Sepet, ödeme, sipariş                            |
| Faz 4  | `0.10.0` – `0.12.0` | Kargo, kampanya, müşteri hesapları               |
| Faz 5  | `0.13.0` – `0.14.0` | Kurumsal site modülü, e-fatura                   |
| Faz 6  | `0.15.0` – `0.17.0` | Süper admin, versiyon yöneticisi, abonelik       |
| Faz 7  | `0.18.0` – `0.20.0` | Üretim altyapısı, alan adı/SSL, sertleştirme     |
| MVP    | `1.0.0`             | Canlı, ödeme alan ilk müşteri                    |
| Faz 8+ | `1.1.0` – `1.12.0`  | Pazaryerleri, B2B, tema/uygulama mağazası, ERP   |

Sonda: **[Sürüm Politikası](#sürüm-politikası)** ve **[Varsayımlar](#varsayımlar-ve-açık-kararlar)**.

---

## Faz 0 — İskelet ve Altyapı (`0.0.x`)

Bu fazın tamamı "çalışan ama ürün olmayan" iskelet kurar. Her adım tek oturumda bitecek büyüklüktedir.

---

## v0.0.1 — Monorepo iskeleti ✅ (tamamlandı: 2026-10-26)

**Hedef:** Turborepo + pnpm workspace ayağa kalksın, `pnpm build` ve `pnpm typecheck` yeşil olsun.
**Kapsam:**

- [x] `pnpm-workspace.yaml` (catalog ile sürüm sabitleme), kök `package.json`, `turbo.json` (`tasks`: `build`, `dev`, `lint`, `typecheck`, `test`, `clean`)
- [x] `packages/config`: `tsconfig` base/node/react preset'leri, `eslint` strict (type-aware) config, `prettier` config, Tailwind v4 `@theme` token iskeleti
- [x] Boş ama derlenebilir `apps/api`, `apps/admin`, `apps/superadmin`, `apps/storefront` klasörleri (`index.ts` + `package.json`)
- [x] Boş ama derlenebilir `packages/db`, `packages/trpc`, `packages/ui`, `packages/theme-sdk`, `packages/integrations`
- [x] `.nvmrc` (Node 24 LTS), `.npmrc`, `.editorconfig`, `.prettierignore`, `.gitignore` güncellemesi
- [x] `docs/` ve `docs/adr/` klasörleri, ADR şablonu (`0000-sablon.md`)

**Dokunulan paketler:** kök, packages/config, tüm apps ve packages (iskelet)
**Kabul kriteri:** `pnpm install && pnpm lint && pnpm typecheck && pnpm build` sıfır hatayla tamamlanır. `pnpm -r exec tsc --noEmit` strict modda temiz.
**Bağımlılık:** —
**Tahmini büyüklük:** M

**Uygulama notları:**

- Beş kapı da yeşil: `pnpm lint` (10 paket), `pnpm typecheck` (10 paket), `pnpm build` (9 paket), `pnpm format:check`, `pnpm -r exec tsc --noEmit`.
- Kapıların boş geçmediği kasıtlı ihlal testiyle doğrulandı: `any`, `console.*`, eksik dönüş tipi ve tip hatası sırasıyla `no-explicit-any`, `no-console`, `explicit-module-boundary-types` ve `TS2322` ile yakalandı.
- `turbo.json` Turborepo 2.x'te `pipeline` değil `tasks` anahtarını kullanır; yapı aynı.
- `packages/config` TypeScript'e derlenmez ama `allowJs`+`checkJs` ile tsc denetimine alındı; böylece preset'lerdeki JSDoc hataları da yakalanıyor ve `pnpm -r exec tsc --noEmit` her pakette çalışıyor.
- `declaration`/`declarationMap` tsconfig'de değil `build` script'inde bayrak olarak verilir; aynı tsconfig ile `tsc --noEmit` çakışmadan çalışsın diye.
- Yeni varsayımlar: **A1 düzeltildi** (Node 22 → 24 LTS), **A13** (TypeScript 6.0.3 sabiti), **A14** (pnpm kurulumu).
- Changesets v0.0.12'de kuruluyor; bu sürümün `CHANGELOG.md` girdisi elle yazıldı.

---

## v0.0.2 — Yerel altyapı servisleri ✅ (tamamlandı: 2026-10-26)

**Hedef:** Tek komutla Postgres, Redis, Meilisearch, S3 uyumlu depolama ve Mailpit ayağa kalksın.
**Kapsam:**

- [x] `infra/docker-compose.yml`: postgres:17.11-alpine, redis:8.10-alpine, meilisearch:v1.55, seaweedfs:4.51 (+ bucket oluşturma işi), mailpit:v1.32
- [x] Sağlık kontrolleri (`healthcheck`) ve kalıcı volume'lar
- [x] `.env.example` ve `packages/config/src/env.ts` içinde Zod tabanlı env şeması (+ `pnpm env:check` doğrulayıcısı)
- [x] Kök `package.json`'a `infra:up`, `infra:down`, `infra:reset`, `infra:ps`, `infra:logs`, `env:init`, `env:check` script'leri
- [x] `docs/development.md`: yerel kurulum adımları, bilinen tuzaklar, sorun giderme

**Dokunulan paketler:** infra, packages/config, docs, kök
**Kabul kriteri:** `pnpm infra:up` sonrası beş servis `healthy`. `pnpm infra:reset` veriyi temizleyip yeniden kurar.
**Bağımlılık:** v0.0.1
**Tahmini büyüklük:** S

**Uygulama notları:**

- Kabul kriteri geçti: `pnpm infra:reset` → exit 0, `5/5 healthy`, bucket yeniden oluşturuldu. İkinci `pnpm infra:up` "bucket zaten var" diyerek idempotent davranıyor.
- Kalıcılık ve silme ayrı ayrı doğrulandı: `infra:down` + `infra:up` sonrası Postgres satırı, Redis anahtarı, Meilisearch indeksi ve S3 nesnesi **korundu**; `infra:reset` sonrası **dördü de silindi**.
- Beş servis host'tan erişilebilir doğrulandı (psql, redis-cli PONG, Meili `/health` 200, S3 PUT+GET, SMTP 220 banner, Mailpit `/readyz` 200).
- **MinIO kullanılamadı:** public Docker imajları artık anonim çekilemiyor (`authentication required`). Yerel S3 servisi **SeaweedFS** oldu — gerekçe, değerlendirilen alternatifler ve kabul edilen maliyetler: [ADR-0005](docs/adr/0005-yerel-s3-depolama.md). Üretim depolaması (Cloudflare R2) etkilenmedi.
- Üç tuzak çözüldü ve `docs/development.md`'ye yazıldı: (1) konteyner içinde `localhost` önce `::1`'e çözülüyor, Meilisearch ve SeaweedFS yalnızca IPv4 dinliyor → healthcheck'ler `127.0.0.1` kullanıyor; (2) Compose, compose dosyasındaki `$VAR` biçimini kendisi yorumluyor → betik içindeki kabuk değişkenleri `$$` ile kaçırıldı; (3) `up --wait` tek seferlik konteynerin bitmesini güvenilir biçimde beklemiyor → bucket kurulumu `init` profiline alınıp `docker compose run --rm` ile senkron çalıştırılıyor.
- Postgres'te veritabanı seviyesinde `tr-TR` collation **bilinçli olarak ayarlanmadı** (noktasız ı / noktalı i karşılaştırması `LOWER()` aramalarını ve unique kısıtlarını bozuyor). Türkçe sıralama kolon/sorgu seviyesinde v0.4.0'da uygulanacak.
- Yeni varsayımlar: **A15** (Postgres 17), **A16** (Redis 8), **A17** (yerel S3 → SeaweedFS).
- Yeni ana bağımlılık: `zod@^4.6.7` — gerekçesi `pnpm-workspace.yaml` catalog'unda yorumda.

---

## v0.0.3 — Prisma kurulumu ve ilk modeller

**Hedef:** `packages/db` üzerinden `Tenant` ve `User` modelleri migrate edilip seed'lenebilsin.
**Kapsam:**

- [ ] Prisma kurulumu, `schema.prisma`, generate çıktısının paketten export edilmesi
- [ ] Modeller: `Tenant` (id, slug, name, status, planId, primaryDomain, createdAt), `User` (id, email, name, status), `TenantMembership` (tenantId, userId, role)
- [ ] Ortak alanlar için konvansiyon: `id` cuid2, `createdAt/updatedAt`, soft delete için `deletedAt`
- [ ] İlk migration + `seed.ts` (1 demo tenant, 1 owner kullanıcı)
- [ ] `pnpm db:migrate`, `db:push`, `db:seed`, `db:studio`, `db:reset` script'leri
      **Dokunulan paketler:** packages/db
      **Kabul kriteri:** `pnpm db:reset && pnpm db:seed` hatasız çalışır; `pnpm --filter @arkesoft/db test` seed'lenen tenant'ı okuyan entegrasyon testini geçer.
      **Bağımlılık:** v0.0.2
      **Tahmini büyüklük:** M

---

## v0.0.4 — NestJS API iskeleti ve tenant context

**Hedef:** API ayağa kalksın, `/health` dönsün, her istek bir tenant context taşısın.
**Kapsam:**

- [ ] NestJS uygulaması, `main.ts`, global validation pipe, graceful shutdown
- [ ] `PrismaModule` (global, `onModuleDestroy` ile disconnect)
- [ ] `/health` ve `/health/ready` endpoint'leri (db + redis kontrolü)
- [ ] `TenantContextMiddleware`: host adı veya `x-arkesoft-tenant` başlığından tenant çözümü, `AsyncLocalStorage` ile request scope'a yazma
- [ ] `TenantNotFoundException` ve global exception filter + standart hata gövdesi (`{ code, message, details, requestId }`)
- [ ] Yapılandırılmış log (pino) + `requestId` korelasyonu
      **Dokunulan paketler:** apps/api, packages/db
      **Kabul kriteri:** `pnpm --filter @arkesoft/api test` yeşil; `GET /health` 200; bilinmeyen host için 404 `TENANT_NOT_FOUND`; e2e testi `demo.localhost` ile tenant çözümünü doğrular.
      **Bağımlılık:** v0.0.3
      **Tahmini büyüklük:** M

---

## v0.0.5 — Kimlik doğrulama (Better Auth)

**Hedef:** Kayıt, giriş, çıkış ve oturum doğrulaması çalışsın.
**Kapsam:**

- [ ] Better Auth entegrasyonu, Prisma adapter, gerekli tablolar için migration
- [ ] E-posta + şifre kaydı, e-posta doğrulama (Mailpit üzerinden), şifre sıfırlama
- [ ] Oturum çerezi (httpOnly, secure, sameSite), oturum listeleme ve sonlandırma
- [ ] `AuthGuard` ve `@CurrentUser()` dekoratörü
- [ ] Oran sınırlama (rate limit) giriş ve şifre sıfırlama uçlarında
      **Dokunulan paketler:** apps/api, packages/db
      **Kabul kriteri:** Kayıt → doğrulama → giriş → korumalı endpoint → çıkış akışını kapsayan entegrasyon testi yeşil. Doğrulanmamış kullanıcı korumalı uca 401 alır.
      **Bağımlılık:** v0.0.4
      **Tahmini büyüklük:** M

---

## v0.0.6 — tRPC sözleşme katmanı

**Hedef:** Uçtan uca tipli ilk endpoint çalışsın; istemciler tipi paketten alsın.
**Kapsam:**

- [ ] `packages/trpc`: router tanımları, `AppRouter` tip export'u, Zod şemaları, istemci factory
- [ ] NestJS tRPC adaptörü (`/trpc` mount)
- [ ] `publicProcedure`, `protectedProcedure`, `tenantProcedure` (tenant + auth zorunlu) middleware'leri
- [ ] İlk router: `session.me`, `tenant.current`
- [ ] Hata eşlemesi: domain hatası → tRPC error code
      **Dokunulan paketler:** packages/trpc, apps/api
      **Kabul kriteri:** `pnpm --filter @arkesoft/trpc test` yeşil; tip testi (`expectTypeOf`) `tenant.current` çıktısının `Tenant` tipine eşit olduğunu doğrular; `tenantProcedure` tenant yoksa `UNAUTHORIZED` döner.
      **Bağımlılık:** v0.0.5
      **Tahmini büyüklük:** M

---

## v0.0.7 — Admin paneli iskeleti

**Hedef:** Tenant yöneticisi giriş yapıp boş bir dashboard görsün.
**Kapsam:**

- [ ] Vite + React + TypeScript, TanStack Router (file-based), TanStack Query
- [ ] Tailwind + shadcn/ui kurulumu, `packages/ui`'ye ilk bileşenler (Button, Input, Card, Toast, DataTable iskeleti)
- [ ] tRPC istemcisi + React Query entegrasyonu
- [ ] Giriş ekranı, korumalı route guard, çıkış
- [ ] Uygulama kabuğu: sidebar, topbar, tenant adı, kullanıcı menüsü
- [ ] Boş dashboard sayfası
      **Dokunulan paketler:** apps/admin, packages/ui, packages/trpc
      **Kabul kriteri:** `pnpm --filter @arkesoft/admin build` yeşil; Playwright testi `login → dashboard → logout` akışını geçer.
      **Bağımlılık:** v0.0.6
      **Tahmini büyüklük:** L

---

## v0.0.8 — Storefront iskeleti ve host çözümü

**Hedef:** Astro SSR, isteğin host adından tenant'ı çözüp "Merhaba {mağaza}" dönsün.
**Kapsam:**

- [ ] Astro SSR (Node adapter), React island desteği, Tailwind
- [ ] `src/middleware.ts`: host → tenant çözümü (alt alan adı ve özel alan adı), 404 sayfası
- [ ] API'ye sunucu taraflı tRPC çağrısı (iç ağ üzerinden)
- [ ] Temel SEO: `<title>`, meta, `robots.txt`, `sitemap.xml` iskeleti
- [ ] Önbellek başlıkları ve `Cache-Control` stratejisi iskeleti
      **Dokunulan paketler:** apps/storefront, packages/trpc
      **Kabul kriteri:** Playwright testi `demo.localhost:4321` adresinde tenant adını içeren sayfayı, `yok.localhost` adresinde 404'ü doğrular.
      **Bağımlılık:** v0.0.6
      **Tahmini büyüklük:** M

---

## v0.0.9 — theme-sdk v0.1: tema sözleşmesi

**Hedef:** Bir temanın platformla konuşma sözleşmesi tipli ve şemalı hale gelsin.
**Kapsam:**

- [ ] `ThemeManifest` tipi ve `theme.json` için Zod + JSON Schema üretimi
- [ ] Ayar şeması ilkelleri: `color`, `font`, `select`, `toggle`, `image`, `text`, `number`, `group`
- [ ] Tema sözleşmesi: desteklenen `templates` listesi (home, product, collection, cart, page, blog, 404), slot/bölüm tanımı
- [ ] `defineTheme()` yardımcısı, ayar varsayılanlarının türetilmesi
- [ ] Ayar migration sözleşmesi: `migrations: { from, to, migrate(settings) }`
- [ ] `validateThemeManifest()` ve `validateThemeSettings()` fonksiyonları
      **Dokunulan paketler:** packages/theme-sdk
      **Kabul kriteri:** `pnpm --filter @arkesoft/theme-sdk test` yeşil; geçersiz `theme.json` için okunur hata; JSON Schema çıktısı `docs/theme-contract.schema.json` olarak üretilir.
      **Bağımlılık:** v0.0.1
      **Tahmini büyüklük:** M

---

## v0.0.10 — İlk tema paketi ve storefront render

**Hedef:** `themes/modern@0.1.0` storefront tarafından yüklenip render edilsin.
**Kapsam:**

- [ ] `packages/themes/modern`: `theme.json`, Astro şablonları (home, 404), temel bileşenler
- [ ] Tema çözücü: tenant kaydındaki `themeId` + `themeVersion` → tema modülü
- [ ] Tema ayarlarının CSS değişkenlerine (`--color-primary` vb.) aktarılması
- [ ] Sabit (hardcoded) demo ayarlarla render
- [ ] Tema paketlerinin storefront build'ine dahil edilmesi (bkz. ADR-0002)
      **Dokunulan paketler:** packages/themes/modern, apps/storefront, packages/theme-sdk
      **Kabul kriteri:** Playwright görsel testi `demo.localhost` ana sayfasının tema renklerini uyguladığını doğrular; `theme.json` SDK doğrulamasından geçer.
      **Bağımlılık:** v0.0.9, v0.0.8
      **Tahmini büyüklük:** L

---

## v0.0.11 — BullMQ kuyruk altyapısı

**Hedef:** Arka plan işleri çalışsın; ilk iş olarak provisioning iskeleti kuyruğa girsin.
**Kapsam:**

- [ ] `QueueModule`: BullMQ bağlantısı, kuyruk kaydı, tekrar deneme (exponential backoff), DLQ
- [ ] `apps/api` içinde worker process (ayrı `main.worker.ts` giriş noktası)
- [ ] `Job` tablosu: tenantId, type, status, progress, payload, error, timestamps
- [ ] `tenant.provision` işinin iskeleti (adımları loglayan, henüz iş yapmayan pipeline)
- [ ] İş durumunu okuyan tRPC endpoint'i: `job.get`, `job.list`
- [ ] Bull Board yalnızca geliştirme ortamında
      **Dokunulan paketler:** apps/api, packages/db, packages/trpc
      **Kabul kriteri:** Entegrasyon testi işi kuyruğa atıp `completed` durumuna geçtiğini ve `Job` kaydının güncellendiğini doğrular; başarısız iş 3 denemeden sonra DLQ'ya düşer.
      **Bağımlılık:** v0.0.4
      **Tahmini büyüklük:** M

---

## v0.0.12 — CI/CD ve Changesets

**Hedef:** Her PR'da lint/typecheck/test/build koşsun; sürüm akışı kurulsun.
**Kapsam:**

- [ ] GitHub Actions: `ci.yml` (install cache, lint, typecheck, unit test, build), `e2e.yml` (docker-compose servisleri + Playwright)
- [ ] Changesets kurulumu, `release.yml` (changeset → versiyon PR → tag)
- [ ] Turbo remote cache
- [ ] PR şablonu: "Hangi ROADMAP versiyonu?" alanı zorunlu
- [ ] Branch koruması önerileri `docs/development.md`'de
      **Dokunulan paketler:** kök, .github
      **Kabul kriteri:** Örnek PR'da tüm job'lar yeşil; changeset'siz PR uyarı verir; `pnpm changeset version` sürümleri doğru yükseltir.
      **Bağımlılık:** v0.0.1
      **Tahmini büyüklük:** M

---

## v0.0.13 — Postgres RLS ve tenant izolasyon test koşumu

**Hedef:** Veritabanı seviyesinde çapraz tenant erişimi imkânsız olsun.
**Hedefin gerekçesi:** Uygulama katmanı hatası veri sızıntısına dönüşmesin.
**Kapsam:**

- [ ] Tüm tenant'a bağlı tablolarda `tenant_id NOT NULL` + indeks
- [ ] Her tablo için `ENABLE ROW LEVEL SECURITY` ve `USING (tenant_id = current_setting('app.tenant_id')::text)` politikaları
- [ ] Prisma extension: her işlemden önce `SET LOCAL app.tenant_id` çalıştıran transaction sarmalayıcı
- [ ] Ayrı DB rolü: migration için `BYPASSRLS`, uygulama için yok
- [ ] `createTenantIsolationSuite()` test yardımcısı: iki tenant kurup her repository'de çapraz okuma/yazmayı dener
- [ ] Yeni tablo eklendiğinde RLS politikasını zorunlu kılan CI kontrolü (şema linter)
      **Dokunulan paketler:** packages/db, apps/api
      **Kabul kriteri:** `pnpm test:isolation` yeşil; RLS politikası olmayan tablo eklendiğinde CI kırmızıya döner.
      **Bağımlılık:** v0.0.4
      **Tahmini büyüklük:** L

---

## v0.0.14 — RBAC ve yetki modeli

**Hedef:** Rol ve izin kontrolü tüm uçlarda uygulanabilir olsun.
**Kapsam:**

- [ ] Roller: `owner`, `admin`, `staff`, `support`, `readonly`; platform tarafında `platform_admin`
- [ ] İzin kataloğu (`product:write`, `order:read`, `theme:publish` ...), rol → izin eşlemesi
- [ ] `@RequirePermission()` dekoratörü ve tRPC `permissionProcedure`
- [ ] Davet akışı: e-posta ile üye davet, kabul, rol değiştirme, çıkarma
- [ ] Yetki değişikliklerinin denetim kaydına (audit log) yazılması
- [ ] `AuditLog` tablosu: actorId, tenantId, action, subject, diff, ip, userAgent
      **Dokunulan paketler:** apps/api, packages/db, packages/trpc
      **Kabul kriteri:** `readonly` rolü yazma ucuna 403 alır; davet akışı entegrasyon testi yeşil; izin kataloğu ile dekoratör kullanımları arasındaki tutarlılığı doğrulayan test var.
      **Bağımlılık:** v0.0.13, v0.0.5
      **Tahmini büyüklük:** L

---

## v0.0.15 — İki faktörlü doğrulama ve oturum güvenliği

**Hedef:** Hesap güvenliği MVP seviyesine çıksın.
**Kapsam:**

- [ ] TOTP tabanlı 2FA (kurulum, QR, doğrulama, kapatma), yedek kodlar
- [ ] Owner rolü için 2FA zorunlu kılma seçeneği (tenant ayarı)
- [ ] Aktif oturum listesi (cihaz, IP, son görülme), uzaktan sonlandırma
- [ ] Şifre politikası, parola sızıntı kontrolü (HIBP k-anonymity)
- [ ] Hassas işlemlerde yeniden kimlik doğrulama (step-up auth)
      **Dokunulan paketler:** apps/api, apps/admin, packages/db
      **Kabul kriteri:** 2FA kurulum/giriş/yedek kod akışları entegrasyon testinde yeşil; 2FA zorunluyken kodsuz giriş 401.
      **Bağımlılık:** v0.0.14
      **Tahmini büyüklük:** M

---

## v0.0.16 — Medya ve dosya servisi

**Hedef:** Panelden görsel yüklenip vitrinde optimize biçimde sunulsun.
**Kapsam:**

- [ ] S3 uyumlu istemci soyutlaması (`StorageAdapter`), MinIO ve R2 implementasyonları
- [ ] Ön imzalı (presigned) yükleme URL'i, tenant başına klasörleme, boyut/MIME doğrulama
- [ ] `MediaAsset` tablosu: tenantId, key, mimeType, width, height, size, alt, checksum
- [ ] Görsel türevleri (thumbnail/webp/avif) için BullMQ işi
- [ ] Admin'de medya kütüphanesi bileşeni (yükle, ara, sil, alt metin düzenle)
- [ ] Vitrin için `<Image>` bileşeni (srcset, lazy, LQIP)
      **Dokunulan paketler:** apps/api, apps/admin, apps/storefront, packages/db, packages/ui
      **Kabul kriteri:** Playwright testi görseli yükleyip vitrinde `webp` türeviyle render edildiğini doğrular; başka tenant'ın medya anahtarına erişim 403.
      **Bağımlılık:** v0.0.14
      **Tahmini büyüklük:** L

---

## v0.0.17 — Gözlemlenebilirlik ve hata yönetimi

**Hedef:** Üretimde ne olduğunu görebilelim.
**Kapsam:**

- [ ] OpenTelemetry: HTTP, Prisma, BullMQ, Redis otomatik enstrümantasyonu; trace id'nin log ve yanıt başlığına yazılması
- [ ] Sentry: api, admin, superadmin, storefront; sürüm (release) etiketi = platform semver
- [ ] `tenant_id` ve `tenant_plan` span attribute'ları (PII yazmadan)
- [ ] Standart `AppError` hiyerarşisi: `code`, `httpStatus`, `userMessage` (TR), `logLevel`
- [ ] Grafana/Loki için docker-compose profili ve örnek dashboard JSON'ları
- [ ] Alarm eşikleri `docs/observability.md`'de belgelenir
      **Dokunulan paketler:** tüm apps, packages/config
      **Kabul kriteri:** Bir isteğin trace'i API → DB → kuyruk zincirinde tek `traceId` ile görünür; bilinçli atılan hata Sentry'ye tenant etiketiyle düşer.
      **Bağımlılık:** v0.0.11
      **Tahmini büyüklük:** M

---

## v0.0.18 — Çoklu dil ve para birimi altyapısı

**Hedef:** Metin ve para biçimlendirmesi tek merkezden gelsin (içerik çevirisi 1.5.0'da).
**Kapsam:**

- [ ] `packages/i18n`: mesaj kataloğu formatı, `tr-TR` varsayılan, `en-US` ikinci dil
- [ ] Admin ve storefront için çeviri yükleyicisi, eksik anahtar tespiti
- [ ] `Money` değer nesnesi: tamsayı kuruş, para birimi kodu, toplama/çarpma, yuvarlama kuralları
- [ ] Biçimlendirme yardımcıları: para, tarih, sayı (Intl üzerinden)
- [ ] `Currency` ve `ExchangeRate` tabloları (TRY varsayılan)
- [ ] Float ile para tutmayı yasaklayan ESLint kuralı
      **Dokunulan paketler:** packages/i18n, packages/db, tüm apps
      **Kabul kriteri:** `pnpm --filter @arkesoft/i18n test` yeşil; `Money` testleri yuvarlama ve para birimi uyuşmazlığı hatalarını kapsar; eksik çeviri anahtarı CI'da uyarı üretir.
      **Bağımlılık:** v0.0.7
      **Tahmini büyüklük:** M

---

## v0.0.19 — Test altyapısı: Playwright ve görsel regresyon

**Hedef:** Uçtan uca ve görsel testler CI'da güvenilir koşsun.
**Kapsam:**

- [ ] Playwright yapılandırması: projeler (admin, superadmin, storefront), çoklu viewport (mobil/masaüstü)
- [ ] Test verisi fabrikaları ve her testte izole tenant oluşturma/yıkma
- [ ] Görsel regresyon: tema şablonları için referans (baseline) ekran görüntüleri, eşik değerleri, animasyon dondurma
- [ ] `pnpm test:e2e`, `pnpm test:visual`, `pnpm test:visual:update` script'leri
- [ ] CI'da trace/video/screenshot artefakt yüklemesi
- [ ] Flaky test politikası `docs/testing.md`'de
      **Dokunulan paketler:** kök, apps/_, packages/themes/_
      **Kabul kriteri:** `pnpm test:e2e` CI'da üç kez üst üste yeşil; tema şablonunda kasıtlı renk değişimi görsel testi kırar.
      **Bağımlılık:** v0.0.10, v0.0.12
      **Tahmini büyüklük:** L

---

## v0.0.20 — Süper admin iskeleti

**Hedef:** Arkesoft iç paneli ayrı uygulama olarak ayağa kalksın.
**Kapsam:**

- [ ] Vite + React + TanStack Router iskeleti, `packages/ui` yeniden kullanımı
- [ ] Platform yöneticisi girişi (ayrı rol, 2FA zorunlu, IP kısıtlama seçeneği)
- [ ] Tenant listesi (salt okunur): slug, plan, durum, oluşturulma
- [ ] Platform denetim kaydı görünümü
- [ ] Tenant verisine erişimin `BYPASSRLS` yerine açık `impersonation` kaydıyla yapılması
      **Dokunulan paketler:** apps/superadmin, apps/api, packages/ui
      **Kabul kriteri:** Playwright testi platform admin girişi ve tenant listesini doğrular; tenant kullanıcısı superadmin uçlarına 403 alır; her impersonation denetim kaydı üretir.
      **Bağımlılık:** v0.0.14
      **Tahmini büyüklük:** M

---

## v0.0.21 — Sürüm kayıt modeli (versiyonlamanın veri temeli)

**Hedef:** Platform, tema ve API versiyonları veritabanında izlenebilir olsun.
**Kapsam:**

- [ ] `PlatformRelease`: version, channel (`stable`/`canary`), releasedAt, notes, minApiVersion
- [ ] `Theme`: id, slug, name, status; `ThemeRelease`: themeId, version, sdkRange, changelog, status, publishedAt
- [ ] `TenantVersionState`: tenantId, platformVersion, themeId, themeVersion, apiVersion, lastUpdatedAt, previousState (rollback için)
- [ ] `TenantUpdateHistory`: fromState, toState, triggeredBy, status, startedAt, finishedAt, error
- [ ] Semver karşılaştırma ve uyumluluk yardımcıları (`packages/versioning`)
- [ ] Seed: mevcut platform sürümü ve `modern@0.1.0`
      **Dokunulan paketler:** packages/db, packages/versioning
      **Kabul kriteri:** `pnpm --filter @arkesoft/versioning test` yeşil (semver aralığı, uyumluluk, N-2 penceresi testleri); seed sonrası demo tenant'ın versiyon durumu okunabilir.
      **Bağımlılık:** v0.0.3, v0.0.9
      **Tahmini büyüklük:** M

---

## v0.0.22 — API sürümleme ve public sözleşme iskeleti

**Hedef:** Dışa açık API'nin versiyon disiplini baştan kurulsun.
**Kapsam:**

- [ ] tRPC router'larının `v1` namespace'i altında toplanması
- [ ] REST köprüsü iskeleti: `/api/v1/*` (OpenAPI üretimi ile)
- [ ] Kullanımdan kaldırma (deprecation) mekanizması: `Deprecation` ve `Sunset` başlıkları, log uyarısı
- [ ] Sözleşme anlık görüntüsü (snapshot) testi: router şeması dosyaya yazılır, kırıcı değişiklik CI'da yakalanır
- [ ] `docs/api-versioning.md`
      **Dokunulan paketler:** packages/trpc, apps/api, docs
      **Kabul kriteri:** `pnpm test:contract` mevcut şemayla eşleşir; bir alanı zorunlu hale getirmek testi kırar ve major gerektiği mesajını verir.
      **Bağımlılık:** v0.0.6, v0.0.21
      **Tahmini büyüklük:** M

---

## Faz 1 — Tenant Yaşam Döngüsü ve Tema Sistemi (`0.1.0` – `0.3.0`)

---

## v0.1.0 — Kayıt, tenant oluşturma ve alt alan adı

**Hedef:** Yeni bir müşteri kendi başına kayıt olup boş bir tenant'a sahip olabilsin.
**Kapsam:**

- [ ] Kayıt sihirbazı: hesap → mağaza adı → slug (müsaitlik kontrolü) → site tipi (e-ticaret / kurumsal)
- [ ] Yasaklı slug listesi (www, api, admin, app, mail ...), slug normalizasyonu (Türkçe karakter dönüşümü)
- [ ] `Plan` ve `Subscription` modelleri; `trial` planında otomatik başlatma
- [ ] Tenant durumları: `pending`, `provisioning`, `active`, `suspended`, `deleted`
- [ ] Alt alan adı kaydı (`{slug}.arkesoft.app`) ve wildcard DNS varsayımı
- [ ] Onboarding kontrol listesi bileşeni (admin dashboard)
      **Dokunulan paketler:** apps/api, apps/admin, packages/db, packages/trpc
      **Kabul kriteri:** Playwright testi `kayıt → slug seçimi → tenant pending` akışını geçer; alınmış/yasaklı slug reddedilir; plan limitleri tenant'a yazılır.
      **Bağımlılık:** v0.0.14, v0.0.21
      **Tahmini büyüklük:** L

---

## v0.2.0 — "Tek tuşla kur": provisioning hattı

**Hedef:** "Siteyi Kur" butonuna basan müşteri, ilerlemeyi canlı izleyip dakikalar içinde çalışan bir siteye kavuşsun.
**Kapsam:**

- [ ] `tenant.provision` iş hattının adımları: doğrulama → veri seed → tema kurulumu → arama indeksi → DNS kaydı → SSL → smoke test → `active`
- [ ] Her adımın idempotent olması ve yeniden denenebilmesi
- [ ] Başarısızlıkta telafi (compensation): yarım kalan kaynakların temizlenmesi
- [ ] Panelde canlı ilerleme (yüzde + adım adım durum), hata durumunda okunur mesaj ve "Tekrar dene"
- [ ] Varsayılan içerik seed'i: örnek kategoriler, 5 demo ürün (e-ticaret) veya 4 sayfa (kurumsal)
- [ ] Provisioning süresi için SLO: p95 < 180 sn
      **Dokunulan paketler:** apps/api, apps/admin, packages/db, packages/themes/*
      **Kabul kriteri:** `pnpm test:e2e --grep provisioning` testi butona basıp tenant `active` olana kadar bekler ve vitrinde 200 alır; adımlardan biri kasıtlı patlatıldığında telafi çalışır ve tenant `pending`e döner.
      **Bağımlılık:** v0.1.0, v0.0.11, v0.0.19
      **Tahmini büyüklük:** L

---

## v0.3.0 — Tema seçimi ve tema ayar editörü

**Hedef:** Müşteri tema seçsin, renk/font/düzen ayarlarını panelden değiştirip önizlesin.
**Kapsam:**

- [ ] Tema galerisi: önizleme görseli, açıklama, versiyon, uyumluluk bilgisi
- [ ] Tema ayarları JSONB olarak `TenantThemeSettings`'te; `theme.json` şemasına göre doğrulama
- [ ] Şemadan otomatik üretilen ayar formu (`packages/ui` içinde şema→form motoru)
- [ ] Taslak/yayın ayrımı: `draft` ayarlarla önizleme, "Yayınla" ile `published`
- [ ] İmzalı önizleme bağlantısı (`?preview_token=`) ile yayınlanmadan görme
- [ ] Tema değiştirme: ayarların yeni temanın şemasına eşlenmesi, eşlenemeyenlerin uyarıyla düşürülmesi
- [ ] `packages/themes/corporate@0.1.0` ikinci tema (kurumsal, e-ticaret kapalı)
      **Dokunulan paketler:** apps/admin, apps/storefront, packages/theme-sdk, packages/themes/*, packages/db
      **Kabul kriteri:** Playwright testi ayar değişikliğini önizlemede görüp yayınladıktan sonra canlı vitrinde doğrular; geçersiz ayar değeri formda hata gösterir ve API'de 400 olur; tema değiştirmede veri kaybı uyarısı çıkar.
      **Bağımlılık:** v0.2.0, v0.0.16
      **Tahmini büyüklük:** L

---

## Faz 2 — Katalog ve Arama (`0.4.0` – `0.6.0`)

---

## v0.4.0 — Ürün, kategori, marka yönetimi

**Hedef:** Panelden ürün ağacı kurulabilsin, vitrinde listelenebilsin.
**Kapsam:**

- [ ] Modeller: `Product`, `Category` (ağaç, nested set veya materialized path), `Brand`, `Tag`, `ProductImage`
- [ ] SEO alanları: slug, metaTitle, metaDescription, canonical, OG görseli
- [ ] Ürün durumları: `draft`, `active`, `archived`; yayın tarihi
- [ ] Admin: ürün listesi (sunucu taraflı sayfalama/filtre/sıralama), ürün düzenleme formu, toplu işlemler
- [ ] Zengin metin açıklaması (sanitize edilmiş HTML)
- [ ] CSV/Excel içe-dışa aktarma işi (BullMQ, hata raporu ile)
- [ ] Vitrin: kategori sayfası, ürün detay sayfası (fiyat/varyant hariç)
      **Dokunulan paketler:** apps/api, apps/admin, apps/storefront, packages/db, packages/trpc
      **Kabul kriteri:** Playwright testi ürün oluşturup vitrin ürün sayfasında görüntüler; tenant izolasyon süiti ürün uçlarında yeşil; 1000 satırlık CSV içe aktarma işi hatasız biter.
      **Bağımlılık:** v0.3.0
      **Tahmini büyüklük:** L

---

## v0.5.0 — Varyant, fiyat ve stok

**Hedef:** Beden/renk gibi seçenekler, fiyatlandırma ve stok takibi çalışsın.
**Kapsam:**

- [ ] `ProductOption` / `ProductOptionValue` / `ProductVariant` (SKU, barkod, ağırlık, boyut)
- [ ] Fiyat alanları: `price`, `compareAtPrice`, `costPrice`; KDV oranı ve dahil/hariç gösterim
- [ ] `InventoryItem` ve `InventoryMovement` (hareket defteri, nedeni ile)
- [ ] Stok politikası: stok yokken satışa izin verme / vermeme, kritik stok uyarısı
- [ ] Varyant matrisi üretici UI (seçeneklerden kombinasyon oluşturma, toplu fiyat/stok düzenleme)
- [ ] Vitrin: varyant seçici, seçime göre fiyat/stok/görsel güncellemesi
      **Dokunulan paketler:** apps/api, apps/admin, apps/storefront, packages/db
      **Kabul kriteri:** Birim testler stok rezervasyon ve geri alma senaryolarını kapsar; eşzamanlı iki satın almada stok eksiye düşmez (yarış koşulu testi); Playwright varyant seçiminde fiyat değişimini doğrular.
      **Bağımlılık:** v0.4.0
      **Tahmini büyüklük:** L

---

## v0.6.0 — Arama, filtreleme ve katalog vitrini

**Hedef:** Meilisearch ile hızlı arama ve filtreli kategori sayfaları.
**Kapsam:**

- [ ] Tenant başına Meilisearch indeksi (`products_{tenantId}`), anahtar kapsamı (scoped key) ile izolasyon
- [ ] İndeksleme işi: ürün/varyant/kategori değişiminde artımlı güncelleme, tam yeniden indeksleme komutu
- [ ] Yüzlü arama (faceted search): kategori, marka, fiyat aralığı, seçenek değerleri, stok durumu
- [ ] Türkçe arama kalitesi: eşanlamlı sözlük, durak kelimeler, yazım hatası toleransı, karakter normalizasyonu (ı/i, ş/s)
- [ ] Vitrin: arama sayfası, otomatik tamamlama, filtre paneli, sıralama, sayfalama
- [ ] Admin: eşanlamlı yönetimi ve indeks durumu
      **Dokunulan paketler:** apps/api, apps/admin, apps/storefront, packages/db
      **Kabul kriteri:** "tisort" sorgusu "tişört" ürününü döner; filtre kombinasyonu testleri yeşil; başka tenant'ın indeksine anahtarla erişim reddedilir; arama p95 < 150 ms (yerel ölçüm).
      **Bağımlılık:** v0.5.0
      **Tahmini büyüklük:** L

---

## Faz 3 — Sepet, Ödeme, Sipariş (`0.7.0` – `0.9.0`)

---

## v0.7.0 — Sepet ve ödeme adımı (checkout)

**Hedef:** Misafir kullanıcı sepete ürün atıp ödeme adımını tamamlayabilecek noktaya gelsin (ödeme hariç).
**Kapsam:**

- [ ] `Cart` / `CartItem`: anonim sepet (çerez token), kullanıcı girişinde birleştirme
- [ ] Sepet fiyat yeniden hesaplaması, stok doğrulaması, sepet süresi dolumu
- [ ] Adres defteri: `Address` modeli, Türkiye il/ilçe veri seti, TCKN/vergi no alanları
- [ ] Checkout akışı: sepet → adres → kargo yöntemi → ödeme (yer tutucu) → özet
- [ ] `Order` ve `OrderItem` modelleri, `draft` siparişin oluşturulması, sipariş numarası üretimi
- [ ] KDV ve kargo bedelinin toplam hesabı (`OrderTotals` değer nesnesi)
- [ ] Mesafeli satış sözleşmesi ve ön bilgilendirme formu onayı (yasal zorunluluk)
      **Dokunulan paketler:** apps/api, apps/storefront, packages/db
      **Kabul kriteri:** Playwright testi misafir kullanıcıyla sepet → adres → özet akışını tamamlar; toplam hesaplama birim testleri (KDV, kargo, indirim yokken) yeşil; stoksuz ürün checkout'u engeller.
      **Bağımlılık:** v0.6.0
      **Tahmini büyüklük:** L

---

## v0.8.0 — Ödeme adaptörleri: iyzico ve PayTR

**Hedef:** Gerçek para tahsil edilebilsin.
**Kapsam:**

- [ ] `PaymentAdapter` arayüzü: `createPayment`, `confirm3DS`, `capture`, `refund`, `verifyWebhook`, `getStatus`
- [ ] iyzico adaptörü (3D Secure, taksit sorgulama, iade)
- [ ] PayTR adaptörü (iFrame API, 3D, iade)
- [ ] `Payment` / `PaymentTransaction` / `Refund` modelleri; idempotency key zorunlu
- [ ] 3DS geri dönüş (callback) ve webhook doğrulama; tekrar gelen webhook'un tekrar işlenmemesi
- [ ] Hassas veri kuralı: kart verisi hiçbir koşulda loglanmaz/saklanmaz (PCI kapsamı dışı kalma)
- [ ] Admin: ödeme sağlayıcı ayarları (şifreli saklanan anahtarlar), test modu
- [ ] Taksit tablosu ve komisyon gösterimi (vitrin)
      **Dokunulan paketler:** packages/integrations, apps/api, apps/admin, apps/storefront, packages/db
      **Kabul kriteri:** Her iki adaptör için sözleşme (contract) testleri sağlayıcı sandbox'ında yeşil; `pnpm test:e2e --grep payment` sandbox kartla 3DS başarılı ödeme ve iade akışını geçer; aynı webhook iki kez gelince tek `Payment` kaydı kalır; log taramasında kart numarası deseni bulunmaz.
      **Bağımlılık:** v0.7.0
      **Tahmini büyüklük:** L

---

## v0.9.0 — Sipariş yönetimi ve bildirimler

**Hedef:** Mağaza sahibi siparişleri uçtan uca yönetebilsin, müşteri bilgilendirilsin.
**Kapsam:**

- [ ] Sipariş durum makinesi: `pending` → `paid` → `preparing` → `shipped` → `delivered`; `cancelled`, `refunded`
- [ ] Geçersiz durum geçişlerinin kodla engellenmesi, her geçişin denetim kaydı
- [ ] Admin: sipariş listesi/filtre, sipariş detayı, not, kısmi iade, iptal, stok iadesi
- [ ] İade talebi (RMA) akışı: müşteri talebi → onay/ret → iade işlemi
- [ ] Bildirim motoru: e-posta (şablonlu, tenant markalı) ve SMS (Netgsm, İleti Merkezi adaptörleri)
- [ ] Bildirim şablonları: sipariş alındı, ödeme onaylandı, kargoya verildi, teslim edildi, iade
- [ ] Müşteri sipariş takip sayfası (giriş gerektirmeyen imzalı bağlantı)
      **Dokunulan paketler:** apps/api, apps/admin, apps/storefront, packages/integrations, packages/db
      **Kabul kriteri:** Durum makinesi birim testleri tüm geçerli/geçersiz geçişleri kapsar; Playwright testi sipariş → kargoya ver → müşteriye e-posta (Mailpit'te doğrulanır) akışını geçer; kısmi iade tutarı ödeme sağlayıcısında doğrulanır.
      **Bağımlılık:** v0.8.0
      **Tahmini büyüklük:** L

---

## Faz 4 — Kargo, Kampanya, Müşteri (`0.10.0` – `0.12.0`)

---

## v0.10.0 — Kargo adaptörleri: Yurtiçi ve Aras

**Hedef:** Sipariş için kargo etiketi üretilsin ve takip bilgisi müşteriye ulaşsın.
**Kapsam:**

- [ ] `ShippingAdapter` arayüzü: `quote`, `createShipment`, `getLabel`, `track`, `cancel`
- [ ] Yurtiçi Kargo ve Aras Kargo adaptörleri (API kimlik bilgileri tenant başına, şifreli)
- [ ] `Shipment` / `ShipmentTracking` modelleri, takip numarası ve durum senkronizasyon işi
- [ ] Kargo kuralları: ağırlık/desi hesabı, bölge, ücretsiz kargo eşiği, sabit ücret, alıcı ödemeli
- [ ] Admin: toplu etiket basma (PDF birleştirme), teslimat durumu panosu
- [ ] Vitrin: checkout'ta kargo seçenekleri ve tahmini teslim süresi
      **Dokunulan paketler:** packages/integrations, apps/api, apps/admin, apps/storefront, packages/db
      **Kabul kriteri:** Sözleşme testleri iki sağlayıcı sandbox'ında yeşil; Playwright testi siparişten etiket PDF'i üretir; takip senkronizasyon işi durum değişiminde müşteriye bildirim tetikler; desi hesabı birim testleri yeşil.
      **Bağımlılık:** v0.9.0
      **Tahmini büyüklük:** L

---

## v0.11.0 — Kampanya, kupon ve indirim motoru

**Hedef:** Esnek ve test edilebilir bir promosyon motoru.
**Kapsam:**

- [ ] Kural motoru: koşullar (sepet tutarı, ürün/kategori/marka, müşteri grubu, ilk sipariş, tarih aralığı, kullanım limiti) ve etkiler (yüzde, sabit tutar, X al Y öde, ücretsiz kargo, hediye ürün)
- [ ] `Promotion`, `PromotionRule`, `Coupon`, `CouponRedemption` modelleri
- [ ] Önceliklendirme ve birleştirme (stacking) politikası, çakışma çözümü
- [ ] Hediye çeki (gift card): bakiye, kısmi kullanım, iade davranışı
- [ ] Admin: kampanya oluşturucu, kupon toplu üretimi, kullanım raporu
- [ ] Vitrin: kupon kodu girişi, indirim dökümü, kampanya rozetleri
      **Dokunulan paketler:** apps/api, apps/admin, apps/storefront, packages/db
      **Kabul kriteri:** Kural motoru için en az 30 senaryoluk birim test seti (çakışma, limit aşımı, tarih dışı, birleştirme) yeşil; aynı kuponun eşzamanlı iki kullanımında limit aşılmaz; indirim dökümü toplamı sipariş toplamıyla kuruş hassasiyetinde eşleşir.
      **Bağımlılık:** v0.9.0
      **Tahmini büyüklük:** L

---

## v0.12.0 — Müşteri hesapları, favoriler, yorum ve puanlama

**Hedef:** Son müşteri tarafı tam olsun.
**Kapsam:**

- [ ] Vitrin müşteri hesabı (tenant'a kapsamlı, panel kullanıcılarından ayrı `Customer` modeli)
- [ ] Hesap sayfaları: siparişlerim, adreslerim, favorilerim, bilgilerim, şifre değiştirme
- [ ] Favori/istek listesi, stok gelince haber ver
- [ ] `Review` modeli: puan, başlık, metin, görsel, doğrulanmış satın alma işareti, moderasyon durumu
- [ ] Admin: yorum moderasyonu, yanıtlama
- [ ] KVKK: veri indirme ve hesap silme talebi akışı, aydınlatma metni, çerez onayı
- [ ] Pazarlama izni (e-posta/SMS) kaydı ve çıkış (opt-out) bağlantıları
      **Dokunulan paketler:** apps/api, apps/admin, apps/storefront, packages/db
      **Kabul kriteri:** Playwright testi kayıt → sipariş → yorum yazma → moderasyon → vitrinde görünme akışını geçer; hesap silme talebi kişisel verileri anonimleştirir ve sipariş kayıtlarını (yasal saklama) korur.
      **Bağımlılık:** v0.9.0
      **Tahmini büyüklük:** L

---

## Faz 5 — Kurumsal Site ve E-Fatura (`0.13.0` – `0.14.0`)

---

## v0.13.0 — Kurumsal site modülü ve sayfa oluşturucu

**Hedef:** E-ticaret kapalı tenant'lar tam işlevli bir kurumsal site alsın.
**Kapsam:**

- [ ] Modül anahtarları (feature flags): `commerce`, `blog`, `pages`, `forms` tenant başına açık/kapalı
- [ ] Blok tabanlı sayfa oluşturucu: blok kataloğu (hero, metin, görsel, galeri, SSS, referans, ekip, CTA, iletişim formu, harita, video), sürükle-bırak sıralama, blok ayarları
- [ ] Sayfa modeli: JSONB blok ağacı, taslak/yayın, versiyon geçmişi ve geri alma
- [ ] Blog: yazı, kategori, etiket, yazar, planlı yayın, RSS
- [ ] Form oluşturucu: alan tanımları, spam koruması (honeypot + rate limit), gönderi kutusu, e-posta bildirimi
- [ ] `corporate` temasının tüm blokları desteklemesi
      **Dokunulan paketler:** apps/api, apps/admin, apps/storefront, packages/themes/corporate, packages/db
      **Kabul kriteri:** Playwright testi sayfa oluştur → blok ekle → yayınla → vitrinde doğrula akışını geçer; `commerce` kapalıyken sepet/ödeme rotaları 404 döner; form gönderisi kutuya ve e-postaya ulaşır.
      **Bağımlılık:** v0.3.0
      **Tahmini büyüklük:** L

---

## v0.14.0 — E-fatura / e-arşiv entegrasyonu

**Hedef:** Sipariş için yasal belge otomatik kesilsin.
**Kapsam:**

- [ ] `InvoiceAdapter` arayüzü: `createInvoice`, `cancelInvoice`, `getStatus`, `getPdf`
- [ ] Tek entegratör implementasyonu (bkz. [Varsayımlar](#varsayımlar-ve-açık-kararlar))
- [ ] `Invoice` modeli, e-arşiv/e-fatura ayrımı (alıcı mükellef sorgusu), fatura numarası serileri
- [ ] Sipariş ödendiğinde fatura kesme işi, hata durumunda yeniden deneme ve manuel müdahale kuyruğu
- [ ] İptal/iade durumunda iade faturası veya iptal
- [ ] Admin: fatura listesi, PDF indirme, müşteriye gönderme, entegratör ayarları
- [ ] Vergi alanları: TCKN/VKN, vergi dairesi, e-posta, adres doğrulama kuralları
      **Dokunulan paketler:** packages/integrations, apps/api, apps/admin, packages/db
      **Kabul kriteri:** Entegratör sandbox'ında sözleşme testleri yeşil; Playwright testi ödenen siparişin faturasının `issued` duruma geçip PDF'inin indirilebildiğini doğrular; iade senaryosu iade faturası üretir; VKN kontrol basamağı birim testleri yeşil.
      **Bağımlılık:** v0.9.0
      **Tahmini büyüklük:** L

---

## Faz 6 — Süper Admin, Versiyon Yöneticisi, Abonelik (`0.15.0` – `0.17.0`)

---

## v0.15.0 — Süper admin: tenant ve plan yönetimi

**Hedef:** Arkesoft ekibi tüm tenant'ları operasyonel olarak yönetebilsin.
**Kapsam:**

- [ ] Tenant detay sayfası: plan, kullanım (ürün/sipariş/depolama), üyeler, denetim kaydı, son işler
- [ ] Plan değiştirme, limit istisnası tanımlama, askıya alma/geri açma, silme (soft → zamanlı hard delete)
- [ ] Kontrollü impersonation: gerekçe zorunlu, süreli, tenant'ta görünür uyarı bandı, tam denetim kaydı
- [ ] Sistem sağlığı panosu: kuyruk derinliği, hata oranı, provisioning başarı oranı, DB/Redis durumu
- [ ] Toplu işlem aracı: seçili tenant'larda yeniden indeksleme, önbellek temizliği
      **Dokunulan paketler:** apps/superadmin, apps/api, packages/db
      **Kabul kriteri:** Playwright testi plan değiştirme, askıya alma (vitrin 503 bakım sayfası) ve geri açma akışlarını geçer; her operasyon denetim kaydı üretir; impersonation gerekçesiz başlatılamaz.
      **Bağımlılık:** v0.0.20, v0.1.0
      **Tahmini büyüklük:** L

---

## v0.16.0 — Versiyon yöneticisi: güncelleme uygula ve rollback

**Hedef:** Platformun ayırt edici özelliği çalışsın — müşteri kendi versiyonunu görür, güncellemeyi uygular, bozulursa geri döner.
**Kapsam:**

- [ ] Admin'de "Sürümler" sayfası: mevcut platform/tema/API versiyonu, yayın notları, uyumluluk durumu
- [ ] Güncelleme uygulama işi: ön kontroller (uyumluluk, yedek, bakım modu) → tema ayar migration'ı → doğrulama (smoke test) → tamamla
- [ ] Rollback: `TenantVersionState.previousState`'e dönüş, tema ayarlarının geri migration'ı veya saklanan anlık görüntüsünden geri yükleme
- [ ] Güncelleme öncesi ayar anlık görüntüsü (snapshot) ve içerik yedeği referansı
- [ ] Süper admin tarafı: platform/tema sürümü yayınlama, kanal seçimi (`canary` → `stable`), hedef tenant yüzdesi
- [ ] Zorunlu güncellemeler (güvenlik) için zamanlanmış otomatik uygulama ve bildirim
- [ ] N-2 desteği: çok geride kalan tenant'a uyarı ve zorunlu yükseltme takvimi
      **Dokunulan paketler:** apps/admin, apps/superadmin, apps/api, packages/versioning, packages/theme-sdk, packages/db
      **Kabul kriteri:** `pnpm test:e2e --grep version-manager` testi tema `0.1.0 → 0.2.0` güncellemesini uygular, ayarların migrate edildiğini doğrular, ardından rollback yapıp ayarların birebir eski haline döndüğünü doğrular; uyumsuz SDK aralığında güncelleme engellenir ve nedeni gösterilir; canary'de %10 tenant'a yayın testi yeşil.
      **Bağımlılık:** v0.0.21, v0.3.0, v0.15.0
      **Tahmini büyüklük:** L

---

## v0.17.0 — Abonelik ve faturalandırma (platform tarafı)

**Hedef:** Arkesoft kendi gelirini tahsil edebilsin.
**Kapsam:**

- [ ] Planlar ve limitler: ürün sayısı, sipariş/ay, depolama, kullanıcı sayısı, modül erişimi
- [ ] Limit uygulama (enforcement): yumuşak uyarı → sert engelleme; kullanım ölçümü işi
- [ ] Kart saklama ve yinelenen (recurring) tahsilat; deneme süresi, yükseltme/düşürme, oransal (prorated) hesap
- [ ] Başarısız tahsilat akışı: yeniden deneme takvimi, ödeme hatırlatmaları, gecikmede askıya alma
- [ ] Arkesoft → tenant faturası (e-arşiv), fatura geçmişi, ödeme yöntemi yönetimi
- [ ] Süper admin: gelir panosu, MRR, iptal (churn) listesi
      **Dokunulan paketler:** apps/api, apps/admin, apps/superadmin, packages/integrations, packages/db
      **Kabul kriteri:** Yinelenen tahsilat işi sandbox'ta başarıyla çalışır; limit aşımı testleri (ürün ekleme reddi, uyarı e-postası) yeşil; başarısız tahsilat sonrası 3 denemede askıya alma senaryosu doğrulanır; oransal yükseltme tutarı birim testiyle doğrulanır.
      **Bağımlılık:** v0.15.0, v0.8.0, v0.14.0
      **Tahmini büyüklük:** L

---

## Faz 7 — Üretim Altyapısı ve Sertleştirme (`0.18.0` – `0.20.0`)

---

## v0.18.0 — Pulumi, Kubernetes, Helm

**Hedef:** Staging ve production ortamları kod olarak kurulabilsin.
**Kapsam:**

- [ ] Pulumi (TypeScript) stack'leri: `dev`, `staging`, `prod`; ortam başına yapılandırma ve gizli (secret) yönetimi
- [ ] Kaynaklar: Kubernetes kümesi, yönetilen Postgres (yedek + PITR), yönetilen Redis, Cloudflare R2, Cloudflare DNS, konteyner kayıt defteri
- [ ] Helm chart'ları: `api`, `worker`, `admin`, `superadmin`, `storefront`; HPA, PDB, kaynak limitleri, readiness/liveness
- [ ] Ingress (ingress-nginx) + cert-manager + wildcard sertifika
- [ ] Veritabanı migration'ının dağıtımdan ayrı, geriye uyumlu (expand/contract) çalıştırılması
- [ ] Çok adımlı dağıtım hattı: build → push → migrate → rollout → smoke test → (gerekirse) otomatik geri alma
- [ ] `infra/README.md` ve felaket kurtarma (DR) tatbikat prosedürü
      **Dokunulan paketler:** infra, .github
      **Kabul kriteri:** `pulumi up` ile staging sıfırdan kurulur; `helm test` smoke testleri yeşil; dağıtım sırasında `/health` kesintisiz (sıfır kesinti doğrulaması); veritabanı yedeğinden geri yükleme tatbikatı belgelenir ve bir kez başarıyla koşar.
      **Bağımlılık:** v0.0.17, v0.0.12
      **Tahmini büyüklük:** L

---

## v0.19.0 — Özel alan adı ve otomatik SSL

**Hedef:** Müşteri kendi alan adını bağlasın, SSL otomatik gelsin.
**Kapsam:**

- [ ] `TenantDomain` modeli: hostname, durum (`pending_dns`, `verifying`, `active`, `failed`), doğrulama tokenı, sertifika durumu
- [ ] Panelde yönlendirme talimatları (A/CNAME kaydı), canlı DNS doğrulama kontrolü
- [ ] cert-manager ile isteğe bağlı (on-demand) sertifika üretimi; Let's Encrypt oran limitlerine saygı
- [ ] Ana alan adı seçimi, www ↔ kök yönlendirmesi, HTTP → HTTPS zorlaması, HSTS
- [ ] Alan adı değişiminde 301 yönlendirme ve `canonical` güncellemesi
- [ ] Sertifika yenileme izlemesi ve 14 gün öncesinden alarm
      **Dokunulan paketler:** apps/api, apps/admin, infra, packages/db
      **Kabul kriteri:** Staging'de gerçek bir test alan adı bağlanır, sertifika üretilir ve HTTPS'te 200 döner; yanlış DNS kaydında panelde açıklayıcı hata görünür; yenileme simülasyonu alarm üretir.
      **Bağımlılık:** v0.18.0, v0.2.0
      **Tahmini büyüklük:** L

---

## v0.20.0 — Performans, güvenlik ve MVP sertleştirmesi

**Hedef:** Canlıya çıkmaya engel kalmasın.
**Kapsam:**

- [ ] Vitrin performansı: Core Web Vitals hedefleri (LCP < 2.5 sn, INP < 200 ms, CLS < 0.1), kritik CSS, görsel optimizasyonu, CDN önbellek politikası, Lighthouse CI bütçesi
- [ ] API performansı: N+1 sorgu avı, indeks gözden geçirme, Redis önbellekleme (ürün/kategori/tema ayarı), yük testi (k6) ile p95 hedefleri
- [ ] Güvenlik: bağımlılık taraması, OWASP ASVS kontrol listesi, CSP/HSTS/güvenlik başlıkları, CSRF, SSRF koruması, dosya yükleme sertleştirmesi, gizli bilgi taraması
- [ ] Dış kaynaklı sızma testi (penetration test) ve bulguların kapatılması
- [ ] Oran sınırlama ve kötüye kullanım koruması (tenant ve IP bazlı)
- [ ] Yedekleme/geri yükleme tatbikatı, çalışma kitapları (runbook): olay müdahalesi, veri silme talebi, provisioning arızası
- [ ] Yasal: KVKK aydınlatma, çerez politikası, mesafeli satış sözleşmesi şablonları, hizmet şartları
- [ ] Durum sayfası (status page) ve bakım modu
      **Dokunulan paketler:** tüm apps, infra, docs
      **Kabul kriteri:** Lighthouse CI bütçesi geçer; k6 yük testinde 100 eşzamanlı kullanıcıda p95 < 500 ms; sızma testi raporundaki yüksek/kritik bulgu sayısı sıfır; `pnpm audit` kritik açık içermez; tüm runbook'lar `docs/runbooks/` altında.
      **Bağımlılık:** v0.19.0, v0.17.0
      **Tahmini büyüklük:** L

---

## v1.0.0 — MVP: İlk ödeme alan müşteri

**Hedef:** Bir müşteri kendi başına kayıt olur, tema seçer, siteyi kurar, ürün ekler, iyzico ile ödeme alır ve Yurtiçi ile kargolar.
**Kapsam:**

- [ ] Uçtan uca kabul senaryosu (altın yol) tek Playwright testinde, production benzeri staging ortamında koşar
- [ ] Tüm `0.x` versiyonlarının kabul kriterleri yeşil
- [ ] Dokümantasyon: müşteri yardım merkezi başlangıç içeriği, admin ekran turu (onboarding tour)
- [ ] Destek süreci: iletişim kanalı, SLA tanımı, olay sınıflandırması
- [ ] Sürüm notları ve `CHANGELOG.md`'nin `1.0.0` girdisi
- [ ] Public API `v1`'in kararlı (stable) ilan edilmesi ve sözleşme dondurulması
- [ ] Pilot müşterilerle sınırlı canlıya çıkış (limited GA), ardından genel açılış
      **Dokunulan paketler:** tümü
      **Kabul kriteri:** `pnpm test:e2e --grep golden-path` staging'de yeşil: kayıt → tema seç → siteyi kur → ürün ekle → vitrinden sipariş ver → iyzico sandbox ile öde → kargo etiketi üret → fatura kes. Gerçek bir pilot müşteri canlı ortamda gerçek bir ödeme tahsil eder.
      **Bağımlılık:** v0.20.0
      **Tahmini büyüklük:** L

---

## Faz 8+ — MVP Sonrası (`1.x.0`)

---

## v1.1.0 — Webhook sistemi ve public API v1 genel kullanıma açılması

**Hedef:** Müşteriler ve üçüncü taraflar platformla programatik konuşsun.
**Kapsam:**

- [ ] `Webhook` ve `WebhookDelivery` modelleri; olay kataloğu (order.created, product.updated ...)
- [ ] HMAC imzası, yeniden deneme (exponential backoff), teslim günlüğü, manuel yeniden gönderim
- [ ] API anahtarı yönetimi: kapsam (scope), oran limiti, son kullanma, döndürme (rotation)
- [ ] OpenAPI dokümantasyonu ve etkileşimli API gezgini
- [ ] Resmî TypeScript istemci paketi (`@arkesoft/sdk`)
      **Dokunulan paketler:** apps/api, apps/admin, packages/trpc, packages/sdk, packages/db
      **Kabul kriteri:** Webhook teslim testleri (başarı, 500'de yeniden deneme, imza doğrulama) yeşil; OpenAPI şeması sözleşme testinden geçer; SDK ile uçtan uca örnek script çalışır.
      **Bağımlılık:** v1.0.0, v0.0.22
      **Tahmini büyüklük:** L

---

## v1.2.0 — Trendyol pazaryeri entegrasyonu

**Hedef:** Ürün ve sipariş Trendyol ile iki yönlü senkronize olsun.
**Kapsam:**

- [ ] `MarketplaceAdapter` arayüzü: ürün gönderme, fiyat/stok güncelleme, sipariş çekme, kargo bildirimi, iade
- [ ] Trendyol adaptörü ve kategori/özellik eşleme (mapping) arayüzü
- [ ] Senkronizasyon işleri ve çakışma çözümü (hangi taraf doğruluk kaynağı)
- [ ] Admin: pazaryeri panosu, eşleme ekranı, hata listesi ve yeniden deneme
      **Dokunulan paketler:** packages/integrations, apps/api, apps/admin, packages/db
      **Kabul kriteri:** Sandbox'ta ürün gönderimi, stok güncellemesi ve sipariş çekme sözleşme testleri yeşil; çakışma senaryosu birim testleriyle doğrulanır.
      **Bağımlılık:** v1.1.0
      **Tahmini büyüklük:** L

---

## v1.3.0 — Hepsiburada ve N11 entegrasyonları

**Hedef:** Pazaryeri kapsamını genişletmek.
**Kapsam:**

- [ ] Hepsiburada adaptörü
- [ ] N11 adaptörü
- [ ] Çoklu kanal stok havuzu: kanallara stok ayırma/paylaştırma stratejisi
- [ ] Birleşik sipariş görünümü (kanal etiketli)
      **Dokunulan paketler:** packages/integrations, apps/api, apps/admin
      **Kabul kriteri:** Her iki adaptörün sözleşme testleri sandbox'ta yeşil; aşırı satış (overselling) önleme testi çoklu kanalda yeşil.
      **Bağımlılık:** v1.2.0
      **Tahmini büyüklük:** L

---

## v1.4.0 — B2B ve bayi sistemi

**Hedef:** Kurumsal müşteri ve bayi satışı desteklensin.
**Kapsam:**

- [ ] Müşteri grupları, gruba özel fiyat listeleri, miktar kırılımlı (tiered) fiyatlandırma
- [ ] Bayi hesapları: onay akışı, kredi limiti, cari hesap, vadeli ödeme
- [ ] Teklif (quote) akışı: talep → teklif → siparişe dönüştürme
- [ ] Minimum sipariş miktarı/tutarı, katlı satış (paket), vergisiz fiyat gösterimi
- [ ] B2B'ye özel giriş zorunlu vitrin modu
      **Dokunulan paketler:** apps/api, apps/admin, apps/storefront, packages/db
      **Kabul kriteri:** Fiyat çözümleme (price resolution) birim testleri grup/kademe/kampanya önceliğini doğrular; Playwright testi bayi girişi → özel fiyat → vadeli sipariş akışını geçer.
      **Bağımlılık:** v1.1.0
      **Tahmini büyüklük:** L

---

## v1.5.0 — Tam çoklu dil ve çoklu para birimi

**Hedef:** İçerik çevirisi ve çok para birimli satış.
**Kapsam:**

- [ ] Çevrilebilir içerik modeli (ürün, kategori, sayfa, blog) ve çeviri editörü
- [ ] Dil bazlı rotalama (`/en/...` veya alt alan adı), `hreflang`, dile göre sitemap
- [ ] Döviz kuru sağlayıcısı, kur marjı, para birimi bazlı fiyat geçersiz kılma (override), yuvarlama kuralları
- [ ] Ödeme ve fatura tarafının çoklu para birimiyle uyumu
      **Dokunulan paketler:** apps/api, apps/admin, apps/storefront, packages/i18n, packages/db
      **Kabul kriteri:** `hreflang` ve sitemap doğrulama testleri yeşil; para birimi değiştirince sepet ve sipariş toplamlarının tutarlılığını doğrulayan e2e test geçer.
      **Bağımlılık:** v1.1.0, v0.0.18
      **Tahmini büyüklük:** L

---

## v1.6.0 — Tema mağazası ve tema geliştirici SDK'sı

**Hedef:** Üçüncü taraf tema geliştirebilsin ve yayınlayabilsin.
**Kapsam:**

- [ ] `theme-sdk` v1.0 ve sözleşmenin kararlı ilan edilmesi
- [ ] Tema CLI: `arkesoft theme init | dev | validate | screenshot | publish`
- [ ] Tema inceleme (review) hattı: otomatik doğrulama + görsel regresyon + performans bütçesi + manuel onay
- [ ] Tema mağazası vitrini, ücretli tema satın alma ve lisans
- [ ] Tema sandbox'ı ve güvenlik kısıtları (izin verilen API yüzeyi)
- [ ] Tema geliştirici dokümantasyonu
      **Dokunulan paketler:** packages/theme-sdk, packages/cli, apps/superadmin, apps/admin, infra
      **Kabul kriteri:** Örnek üçüncü taraf tema CLI ile oluşturulup inceleme hattından geçip mağazada yayınlanır ve bir tenant tarafından kurulur; doğrulamadan geçmeyen tema yayınlanamaz.
      **Bağımlılık:** v1.1.0, v0.16.0
      **Tahmini büyüklük:** L

---

## v1.7.0 — Uygulama mağazası ve eklenti sistemi

**Hedef:** Platformun yetenekleri çekirdek değişmeden genişletilebilsin.
**Kapsam:**

- [ ] Uygulama modeli: OAuth kurulum akışı, izin kapsamları, tenant başına kurulum
- [ ] Genişletme noktaları: admin paneli gömülü görünümleri, vitrin script slotları, webhook abonelikleri, özel veri alanları (metafield)
- [ ] Uygulama faturalandırması (Arkesoft üzerinden tahsilat, gelir paylaşımı)
- [ ] Uygulama inceleme hattı ve geliştirici portalı
      **Dokunulan paketler:** apps/api, apps/admin, apps/superadmin, packages/db
      **Kabul kriteri:** Örnek uygulama kurulup izin verdiği kapsam dışına erişemediğini doğrulayan testler yeşil; kurulum/kaldırma akışı e2e testte geçer.
      **Bağımlılık:** v1.6.0
      **Tahmini büyüklük:** L

---

## v1.8.0 — Sosyal ve ek satış kanalları

**Hedef:** Ürünler sosyal platformlarda satışa açılsın.
**Kapsam:**

- [ ] Google Merchant Center ürün akışı (feed)
- [ ] Meta (Facebook/Instagram) katalog ve Shop entegrasyonu
- [ ] TikTok Shop katalog entegrasyonu
- [ ] Dönüşüm izleme (Google Ads, Meta Pixel, TikTok Pixel) ve sunucu taraflı olay gönderimi
      **Dokunulan paketler:** packages/integrations, apps/api, apps/admin, apps/storefront
      **Kabul kriteri:** Akış (feed) doğrulama araçlarından hatasız geçer; sunucu taraflı dönüşüm olayı sandbox'ta alınır.
      **Bağımlılık:** v1.3.0
      **Tahmini büyüklük:** M

---

## v1.9.0 — ERP ve muhasebe entegrasyonları

**Hedef:** Kurumsal müşterilerin mevcut sistemleriyle veri alışverişi.
**Kapsam:**

- [ ] `ErpAdapter` arayüzü: ürün, stok, fiyat, sipariş, cari, fatura senkronizasyonu
- [ ] İlk iki sağlayıcı (talep sırasına göre; Logo ve Netsis varsayımı)
- [ ] Eşleme (mapping) motoru ve alan dönüştürme kuralları
- [ ] Senkronizasyon izleme panosu, uzlaştırma (reconciliation) raporu, çakışma kuyruğu
      **Dokunulan paketler:** packages/integrations, apps/api, apps/admin
      **Kabul kriteri:** Sözleşme testleri sağlayıcı test ortamında yeşil; uzlaştırma raporu bilinçli oluşturulan farkı yakalar.
      **Bağımlılık:** v1.4.0
      **Tahmini büyüklük:** L

---

## v1.10.0 — Analitik ve raporlama

**Hedef:** Mağaza sahibi veriye dayalı karar verebilsin.
**Kapsam:**

- [ ] Olay toplama (event collection) ve özetleme (rollup) işleri; raporlama için ayrı okuma modeli
- [ ] Raporlar: satış, ürün performansı, dönüşüm hunisi, sepet terk etme, trafik kaynağı, müşteri yaşam boyu değeri (LTV), kohort
- [ ] Panoda grafikler, tarih aralığı karşılaştırması, CSV/Excel dışa aktarma
- [ ] Zamanlanmış e-posta özetleri
- [ ] Süper admin tarafında platform geneli metrikler
      **Dokunulan paketler:** apps/api, apps/admin, apps/superadmin, packages/db
      **Kabul kriteri:** Özetleme işlerinin doğruluğunu bilinen veri kümesiyle doğrulayan birim testler yeşil; 1 milyon olaylı veri kümesinde rapor sorgusu p95 < 2 sn.
      **Bağımlılık:** v1.1.0
      **Tahmini büyüklük:** L

---

## v1.11.0 — Headless ve mobil uygulama desteği

**Hedef:** Vitrin dışı istemciler aynı çekirdeği kullansın.
**Kapsam:**

- [ ] Storefront API'si (müşteri tarafı, kapsam sınırlı token) ve oran limitleri
- [ ] Mobil push bildirim altyapısı
- [ ] Beyaz etiketli (white-label) mobil uygulama şablonu (React Native) — ayrı repo, bu yol haritasında yalnızca API tarafı
- [ ] Headless dokümantasyonu ve örnek uygulama
      **Dokunulan paketler:** apps/api, packages/trpc, packages/sdk
      **Kabul kriteri:** Storefront API sözleşme testleri yeşil; örnek headless istemci ürün listeleyip sipariş oluşturur; kapsam dışı erişim 403.
      **Bağımlılık:** v1.1.0
      **Tahmini büyüklük:** M

---

## v1.12.0 — Çoklu depo, mağaza ve gelişmiş lojistik

**Hedef:** Birden fazla fiziksel lokasyonla çalışan satıcılar desteklensin.
**Kapsam:**

- [ ] `Location` modeli, lokasyon bazlı stok, stok transfer emirleri
- [ ] Sipariş yönlendirme (fulfillment routing) kuralları: en yakın/en uygun depo, kısmi gönderi
- [ ] Mağazadan teslim alma (click & collect), mağaza içi stok sorgulama
- [ ] Ek kargo sağlayıcıları: MNG, Sürat, PTT
      **Dokunulan paketler:** apps/api, apps/admin, apps/storefront, packages/integrations, packages/db
      **Kabul kriteri:** Yönlendirme kuralları birim testleri yeşil; kısmi gönderi e2e testi geçer; yeni kargo adaptörlerinin sözleşme testleri yeşil.
      **Bağımlılık:** v1.3.0
      **Tahmini büyüklük:** L

---

# Sürüm Politikası

## 1. Versiyonlanan birimler

Platformda birbirinden bağımsız semver taşıyan **dört** birim vardır:

| Birim                           | Nerede yaşar                                      | Kim tüketir                  |
| ------------------------------- | ------------------------------------------------- | ---------------------------- |
| **Platform**                    | kök `package.json` + `PlatformRelease` kaydı      | Tenant'lar (çalışma zamanı)  |
| **theme-sdk** (tema sözleşmesi) | `packages/theme-sdk/package.json`                 | Temalar (`peerDependency`)   |
| **Her tema**                    | `packages/themes/*/package.json` + `ThemeRelease` | Tenant'lar (tema seçimi)     |
| **Public API**                  | `/trpc/v1`, `/api/v1` + `packages/trpc`           | Müşteriler, uygulamalar, SDK |

## 2. Semver kuralları

**Platform**

- **MAJOR** — tenant'ın müdahalesi gerektiren değişiklik (veri modeli göçü, kaldırılan panel yeteneği, kaldırılan API major'ı).
- **MINOR** — yeni modül veya özellik; geriye uyumlu.
- **PATCH** — hata düzeltmesi, performans, güvenlik yaması; davranış sözleşmesi değişmez.

**theme-sdk**

- **MAJOR** — tema sözleşmesinde kırıcı değişiklik (kaldırılan şablon tipi, zorunlu hale gelen alan, değişen slot anlamı). Temaların güncellenmesi gerekir.
- **MINOR** — yeni opsiyonel yetenek (yeni blok tipi, yeni ayar ilkeli, yeni slot).
- **PATCH** — tip düzeltmesi, doğrulama hatası düzeltmesi.
- Her tema desteklediği aralığı bildirir: `"peerDependencies": { "@arkesoft/theme-sdk": "^1.2.0" }`.

**Tema**

- **MAJOR** — ayar şemasında kırıcı değişiklik veya kaçınılmaz görsel kırılma; migration yazılması **zorunlu**.
- **MINOR** — yeni bölüm/ayar, geriye uyumlu görsel iyileştirme.
- **PATCH** — stil ve erişilebilirlik düzeltmeleri; ayar şeması değişmez.
- Yayın koşulu: `validateThemeManifest` + görsel regresyon + Lighthouse bütçesi + (üçüncü taraf ise) manuel inceleme.

**Public API**

- Yol (path) bazlı majorlar: `v1`, `v2` yan yana yaşar.
- MINOR = yalnızca ekleme (yeni uç, yeni opsiyonel alan). Bir alanı zorunlu yapmak, kaldırmak veya tipini değiştirmek **MAJOR**'dır.
- Sözleşme snapshot testi (`pnpm test:contract`) kırıcı değişikliği CI'da yakalar.
- Kullanımdan kaldırma: duyuru → `Deprecation` ve `Sunset` başlıkları → **en az 12 ay** paralel yaşam → kapatma.

## 3. Uyumluluk matrisi

Her `PlatformRelease` şunları beyan eder:

- desteklenen `theme-sdk` major aralığı,
- desteklenen API majorları,
- gerekli minimum tema versiyonu (varsa).

Uyumluluk, güncelleme uygulanmadan **önce** `packages/versioning` tarafından kontrol edilir. Uyumsuzsa güncelleme başlamaz ve kullanıcıya nedeni Türkçe olarak gösterilir.

## 4. Yayın kanalları ve kademeli dağıtım (rollout)

| Kanal    | İçerik                        | Hedef kitle                                    |
| -------- | ----------------------------- | ---------------------------------------------- |
| `dev`    | her ana dal (main) birleşmesi | yalnızca iç ortam                              |
| `canary` | sürüm adayı                   | gönüllü tenant'lar + Arkesoft demo tenant'ları |
| `stable` | onaylı sürüm                  | tüm tenant'lar                                 |

Platform minor/major yayın akışı:

1. `canary` kanalına yayın, iç demo tenant'larında doğrulama (en az 24 saat).
2. Gönüllü tenant'lar (%1–5), 48 saat izleme: hata oranı, p95 gecikme, provisioning başarısı.
3. Kademeli açılış: %10 → %50 → %100. Her kademede otomatik sağlık kapısı (health gate).
4. Kapı eşiği aşılırsa dağıtım otomatik durur ve son kademe geri alınır.

Tema yayınları tenant'a **zorla uygulanmaz**; tenant panelden "Uygula" der. İstisna: güvenlik yaması olarak işaretlenen patch'ler bildirimle birlikte otomatik uygulanır.

## 5. Rollback prosedürü

**Platform (altyapı seviyesi)**

1. Helm `rollout undo` ile önceki görüntüye (image) dön.
2. Veritabanı migration'ları her zaman expand/contract desenindedir — bir önceki sürüm yeni şemayla çalışabilir. Bu nedenle kod geri alınırken şema geri alınmaz.
3. Yıkıcı (destructive) şema değişiklikleri yalnızca iki sürüm sonra, kullanımdan kaldırma penceresi dolduktan sonra uygulanır.

**Tenant seviyesi (tema/ayar)**

1. Güncelleme öncesi `TenantVersionState.previousState` ve ayar anlık görüntüsü (snapshot) alınır.
2. "Geri Al" tek işlemle: versiyon durumunu geri yaz, ayar anlık görüntüsünü geri yükle, önbellekleri temizle, smoke test koş.
3. Geri alma penceresi: güncellemeden sonra **7 gün**. Pencere dolunca anlık görüntüler arşivlenir.
4. Her güncelleme ve geri alma `TenantUpdateHistory`'ye yazılır ve panelde görünür.

**Karar kuralı:** Hata tek tenant'ı etkiliyorsa tenant seviyesi rollback; birden fazla tenant'ı etkiliyorsa dağıtımı durdur ve platform rollback yap.

## 6. Desteklenen versiyon penceresi (N-2)

- Platform: en güncel iki minor geriye kadar desteklenir (`N`, `N-1`, `N-2`). Daha geride kalan tenant'a panelde uyarı çıkar ve 30 gün içinde yükseltme zorunlu hale gelir.
- theme-sdk: en güncel iki major desteklenir. Eski major için yalnızca güvenlik patch'i çıkar.
- Public API: her major, yerine geçen major yayınlandıktan sonra en az **12 ay** daha yaşar.
- Tema: bir temanın son iki majoru desteklenir.

## 7. Changeset ve CHANGELOG disiplini

- Davranış değiştiren her PR bir changeset içerir. İçermiyorsa CI uyarı verir; yalnızca `docs`, `test` ve `chore` etiketli PR'lar muaftır.
- Changeset özeti kullanıcıya dönük ve Türkçe yazılır (yayın notuna doğrudan girer).
- Her changeset hangi ROADMAP versiyonuna ait olduğunu belirtir.
- Sürüm kesilince: `CHANGELOG.md` güncellenir, `PlatformRelease`/`ThemeRelease` kaydı oluşturulur, git tag atılır, bu dosyadaki kutular işaretlenir.

---

# Varsayımlar ve Açık Kararlar

Briefingde belirtilmeyen ve makul varsayımla ilerlenen noktalar. Her biri ilgili versiyon uygulanırken teyit edilmeli.

| #   | Varsayım                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Etkilediği versiyon |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| A1  | ~~Node 22 LTS~~ → **Node 24 LTS ("Krypton")** ve pnpm 12+ kullanılır. Düzeltme gerekçesi: 2026-10 itibarıyla Node 22 ("Jod") bakım moduna geçmiş ve ömrü 2027-04'te doluyor; Node 26 ise henüz LTS değil. `.nvmrc` = `24`, CI ve üretim 24'e sabitlenir. `engines.node` `>=24` bırakıldı ki yerel makinede 25 ile de çalışılabilsin. **Dikkat:** geliştirme makinesinde şu an Node 25.8.1 (LTS olmayan hat) kurulu — v0.0.4'ten (NestJS) önce yerel kurulumun 24'e çekilmesi önerilir. | v0.0.1              |
| A2  | Tek Postgres veritabanı, paylaşılan şema, `tenant_id` + RLS. Tenant başına şema veya veritabanı yok. (ADR-0003 konusu)                                                                                                                                                                                                                                                                                                                                                                 | v0.0.3, v0.0.13     |
| A3  | Storefront **tek bir çok kiracılı dağıtım**tır; tenant host adından çözülür. Tenant başına ayrı dağıtım yapılmaz. (ADR-0002 konusu)                                                                                                                                                                                                                                                                                                                                                    | v0.0.8              |
| A4  | Temalar derleme zamanında storefront paketine dahil edilir; desteklenen tema versiyonları (N-2 penceresi) aynı dağıtımda yan yana bulunur. Çalışma zamanında npm'den dinamik tema kurulumu MVP kapsamında değil. (ADR-0002 konusu)                                                                                                                                                                                                                                                     | v0.0.10, v0.16.0    |
| A5  | E-fatura entegratörü olarak modern REST API'si olan tek bir sağlayıcı (Nilvera varsayımı) ile başlanır; `InvoiceAdapter` arayüzü sağlayıcı değişimini mümkün kılar.                                                                                                                                                                                                                                                                                                                    | v0.14.0             |
| A6  | Platform aboneliği tahsilatı iyzico kart saklama + yinelenen ödeme ile yapılır; ayrı bir faturalandırma sağlayıcısı (Stripe vb.) kullanılmaz.                                                                                                                                                                                                                                                                                                                                          | v0.17.0             |
| A7  | DNS ve CDN Cloudflare'dir; wildcard `*.arkesoft.app` kaydı ve R2 depolama kullanılır.                                                                                                                                                                                                                                                                                                                                                                                                  | v0.19.0, v0.18.0    |
| A8  | SSL: Kubernetes'te cert-manager + Let's Encrypt (wildcard için DNS-01, özel alan adları için HTTP-01).                                                                                                                                                                                                                                                                                                                                                                                 | v0.19.0             |
| A9  | Vitrin müşterileri (`Customer`) panel kullanıcılarından (`User`) ayrı modeldir ve tenant'a kapsamlıdır; aynı e-posta farklı tenant'larda bağımsız müşteri olabilir.                                                                                                                                                                                                                                                                                                                    | v0.12.0             |
| A10 | Para birimi tamsayı kuruş olarak saklanır; ondalık/float kullanılmaz.                                                                                                                                                                                                                                                                                                                                                                                                                  | v0.0.18             |
| A11 | ERP entegrasyonunda ilk iki sağlayıcı Logo ve Netsis varsayılmıştır; müşteri talebine göre değişebilir.                                                                                                                                                                                                                                                                                                                                                                                | v1.9.0              |
| A12 | Mobil uygulama ayrı bir repoda geliştirilir; bu yol haritası yalnızca gereken API yüzeyini kapsar.                                                                                                                                                                                                                                                                                                                                                                                     | v1.11.0             |
| A13 | TypeScript **6.0.3**'e sabitlendi (en güncel sürüm 7.0.2 olmasına rağmen). Gerekçe: `typescript-eslint` 8.x, tip bilgisine dayalı lint için `typescript >=4.8.4 <6.1.0` istiyor; TypeScript 7 (Go ile yazılmış native port) henüz desteklenmiyor. Katı tip-aware lint, CLAUDE.md'nin `any` yasağını ve hata yönetimi kurallarını zorlayan asıl mekanizma olduğu için TS 7'ye geçmek yerine TS 6.0'da kalındı. `typescript-eslint` TS 7 desteği yayınlayınca yükseltilir.               | v0.0.1              |
| A14 | pnpm `npm install -g pnpm` ile global kuruldu (sürüm 12.15.0, `packageManager` alanında sabit). Gerekçe: Node 25 dağıtımında corepack artık gelmiyor. CI'da pnpm/action-setup kullanılacak.                                                                                                                                                                                                                                                                                            | v0.0.1              |
| A15 | **Postgres 17** (17.11-alpine) kullanılır; ROADMAP'te başta `postgres:16` yazıyordu. Gerekçe: PG17 desteği 2029-11'e kadar sürüyor (PG16 2028-11), PG18 ise bir aylık. Sistemin kayıt defteri olan bileşende olgun sürüm tercih edildi.                                                                                                                                                                                                                                                | v0.0.2              |
| A16 | **Redis 8** (8.10-alpine) kullanılır; ROADMAP'te başta `redis:7` yazıyordu. Gerekçe: güncel kararlı hat, BullMQ uyumlu. **Teyit edilmeli:** Redis'in 7.4 sonrası lisans değişiklikleri; üretimde yönetilen Redis kullanılacağı için (v0.18.0) risk sağlayıcıda kalıyor, ama ticari kullanım öncesi lisans doğrulanmalı.                                                                                                                                                                | v0.0.2              |
| A17 | Yerel S3 uyumlu depolama **MinIO yerine SeaweedFS**. MinIO imajları anonim çekilemiyor. Üretim (Cloudflare R2) değişmedi. Ön imzalı URL ve CORS uyumluluğu v0.0.16'da ayrıca doğrulanmalı. Bkz. ADR-0005.                                                                                                                                                                                                                                                                              | v0.0.2, v0.0.16     |

---

## Nasıl ilerliyoruz

1. Bu dosya ve `CLAUDE.md` onaylanır.
2. "v0.0.1'i uygula" denir; yalnızca o versiyonun kapsamı yapılır.
3. Kabul kriteri çalıştırılır ve çıktısı gösterilir.
4. Changeset eklenir, `CHANGELOG.md` güncellenir, bu dosyadaki kutular işaretlenir.
5. Sonraki versiyona geçilir.

Kapsam dışına çıkmak gerekirse önce sorulur; versiyon bölünmesi gerekiyorsa yeni bir patch versiyonu bu dosyaya eklenir.
