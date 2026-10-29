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

Sonda: **[Sürüm Politikası](#sürüm-politikası)**, **[Varsayımlar](#varsayımlar-ve-açık-kararlar)** ve **[Teknik Borç](#teknik-borç)**.

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

## v0.0.3 — Prisma kurulumu ve ilk modeller ✅ (tamamlandı: 2026-10-26)

**Hedef:** `packages/db` üzerinden `Tenant` ve `User` modelleri migrate edilip seed'lenebilsin.
**Kapsam:**

- [x] Prisma kurulumu, `schema.prisma`, generate çıktısının paketten export edilmesi
- [x] Modeller: `Tenant` (id, slug, name, status, planId, primaryDomain, createdAt), `User` (id, email, name, status), `TenantMembership` (tenantId, userId, role)
- [x] Ortak alanlar için konvansiyon: `id` cuid2, `createdAt/updatedAt`, soft delete için `deletedAt`
- [x] İlk migration + `seed.ts` (1 demo tenant, 1 owner kullanıcı)
- [x] `pnpm db:migrate`, `db:push`, `db:seed`, `db:studio`, `db:reset` script'leri
      **Dokunulan paketler:** packages/db
      **Kabul kriteri:** `pnpm db:reset && pnpm db:seed` hatasız çalışır; `pnpm --filter @arkesoft/db test` seed'lenen tenant'ı okuyan entegrasyon testini geçer.
      **Bağımlılık:** v0.0.2
      **Tahmini büyüklük:** M

**Uygulama notları:**

- Kabul kriteri çıktıları: `pnpm db:reset && pnpm db:seed` **iki kez üst üste exit 0** (Kullanıcı Onayı #3 ve #4 ile koşuldu — Prisma'nın AI-ajan güvenlik kapısı gerçek kullanıcı onayı istiyor); `pnpm --filter @arkesoft/db test` → **4 dosya / 63 test**, 0 failed / 0 skipped; `pnpm lint && pnpm typecheck && pnpm build && pnpm format:check` → sıfır hata; `pnpm --filter @arkesoft/db run verify` → "No difference detected."
- Prisma **7.10.1**, **A yolu** uygulandı (`prisma-client` generator + `prisma.config.ts`); B yedek yoluna düşülmedi.
- **Prisma 7, şemadan `datasource.url`'i kaldırdı** → bağlantı URL'si `prisma.config.ts`'e taşındı, çalışma zamanı istemcisi **`@prisma/adapter-pg` olmadan kurulamıyor** (Kullanıcı Onayı #1'in koşulu gerçekleşti).
- **`migrate diff` bayrakları değişti:** architect'in yazdığı `--from-schema-datasource`/`--to-schema-datamodel` Prisma 7.10.1'de kaldırılmış; aynı niyet `--from-config-datasource --to-schema <şema> --exit-code` ile kuruldu.
- **`--skip-seed`/`--skip-generate` Prisma 7.10.1'de YOK** → yıkıcı komut sarmalayıcısının argüman allowlist'inden çıkarıldı (`--help` ile teyit edildi, uydurulmadı).
- **pnpm 12.15.0 `onlyBuiltDependencies` alanını okumuyor**; gerçek şema `allowBuilds: { paket: true }` (harita, dizi değil). Asgari allowlist: `@prisma/engines`, `prisma` (`@prisma/client` hiç flag'lenmedi).
- **Yıkıcı komut guard'ı mimarisi değişti:** gate Tur 1'de `high` bulgu — pnpm kullanıcı argümanlarını zincirin **son** komutuna ekliyor, ön-kontrol guard'ı (`guard && prisma`) bunu göremiyor. Architect R5'i iptal edip **allowlist'li sarmalayıcı** desenine geçti (`run-guarded-prisma.ts` Prisma'yı kendisi `spawn` ediyor). Security Tur 2'de **56 argüman vektörü** + **27 host × 3 confirmation = 81 koşum** ile ampirik doğrulandı.
- Yeni ana bağımlılıklar (Kullanıcı Onayı #1): `@prisma/adapter-pg`, `pg` (dep), `@types/pg` (devDep). `zod`, `packages/db`'den **çıkarıldı** (hiç import edilmiyordu); `@arkesoft/config` devDep → **dep** (Düzeltme Turu 1, K2).
- AC4 artık yalnızca "grep ile kontrol edildi" değil, **lint ile zorlanıyor** (`packages/config/eslint/base.js`, Kullanıcı Onayı #2).
- RLS **bu sürümde yok** — bilinçli karar, vade v0.0.13. AC8 borcu Teknik Borç tablosuna **üç ayak** olarak kaydedildi: (a) politika yok, (b) rol ayrımı + `FORCE RLS` yok, (c) tenant context kancası yok.
- `prisma migrate reset` bir AI ajanı tarafından çağrıldığında Prisma'nın kendi güvenlik kapısı (`CLAUDECODE` algısı) gerçek kullanıcı onayı istiyor; AC1 bu nedenle **iki kez** kullanıcı onayıyla koşuldu (Onay #3: ilk guard mimarisiyle; Onay #4: düzeltme turu sonrası `db:reset` script içeriği değiştiği için tekrar).
- 1 düzeltme turu kullanıldı (3 hakkın 1'i): security Tur 1 FAIL (1 high + 4 medium) + solid Tur 1 FAIL (3 medium) → Tur 2'de ikisi de PASS. qa Tur 1'de zaten PASS idi, yeniden koşulmadı.

---

## v0.0.4 — NestJS API iskeleti ve tenant context ✅ (tamamlandı: 2026-10-26)

**Hedef:** API ayağa kalksın, `/health` dönsün, her istek bir tenant context taşısın.
**Kapsam:**

- [x] NestJS uygulaması, `main.ts`, global validation pipe, graceful shutdown
- [x] `PrismaModule` (global, `onModuleDestroy` ile disconnect)
- [x] `/health` ve `/health/ready` endpoint'leri (db + redis kontrolü)
- [x] `TenantContextMiddleware`: host adı veya `x-arkesoft-tenant` başlığından tenant çözümü, `AsyncLocalStorage` ile request scope'a yazma
- [x] `TenantNotFoundException` ve global exception filter + standart hata gövdesi (`{ code, message, details, requestId }`)
- [x] Yapılandırılmış log (pino) + `requestId` korelasyonu

**Dokunulan paketler:** apps/api, packages/db, packages/errors (yeni)

**Kabul kriteri:** `pnpm --filter @arkesoft/api test` → 0 failed / 0 skipped, 14 dosya / 112 test; `GET /health` 200; bilinmeyen host için 404 `TENANT_NOT_FOUND`; HTTP seviyesinde entegrasyon testi `demo-magaza.arkesoft.localhost` ile tenant çözümünü doğrular.

**Bağımlılık:** v0.0.3  
**Tahmini büyüklük:** M

**Uygulama notları:**

- **Kabul kriteri:** `pnpm --filter @arkesoft/api test` **14 dosya / 112 test**, 0 failed / 0 skipped; kök `lint`/`typecheck`/`build`/`test`/`format:check` exit 0; `test` 7 görev / **212 test** (api 112 + db 65 + errors 35); `/health` 200; bilinmeyen host 404 `TENANT_NOT_FOUND`; `demo-magaza.arkesoft.localhost` tenant'ı çözüyor.
- **NestJS 12.2.0 + express adaptörü** (K-A1; fastify reddedildi, gerekçe ADR-0004'te). Diğer sürümler: `reflect-metadata` 0.2.2, `rxjs` 7.8.2, `pino` 10.4.0, `ioredis` 6.0.0. Tüm exact + Türkçe gerekçe.
- **R2 spike sonucu (ST-0, Ladder 1):** `experimentalDecorators: true` + **`emitDecoratorMetadata: false`** + `useDefineForClassFields: false` kombinasyonu TS 6.0.3'te çalışıyor; DI **açık `@Inject(TOKEN)`** ile kuruldu. `apps/api` **ESM** (`"type": "module"`) kaldı, SWC katmanı gerekmedi.
- **Yeni iç paket `@arkesoft/errors`** (Onay #4) — `AppError`, `AppErrorBody` Zod şeması, `maskEmail`. Gerekçe: `IntegrationError` (v0.6.x) `packages/integrations`'tan fırlatılacak ve paketler uygulamaları import edemez.
- **Onay #1:** `x-arkesoft-tenant` yalnızca `NODE_ENV !== 'production'`. Servis-servis güvenilir belirteç v0.0.5/v0.0.8'de tanımlanacak.
- **Onay #2:** `seed.ts` e-posta maskeleme + yığın izi düzeltmeleri kapandı; `run-guarded-prisma.ts:154-161` **borçta bırakıldı**.
- **Gate sonuçları:** qa/solid/security **PASS**, **0 düzeltme turu** (ölçüm gerekçesinde). Bulgu: 5 medium + 20 low, tamamı teknik borç (davranış hataları yok).
- **RLS yok** → v0.0.13; **v0.0.4 ile uygulama katmanı tenant izolasyonunun TEK savunma hattı oldu**.
- **Host adı normalizasyonu:** `new URL()` ile IDN→punycode, port soyma, IPv6. Yalnızca `Host` başlığı okunur; `X-Forwarded-Host` **açık kural** ile okunmaz (`trust proxy` kapalı). Tenant çözümü SQL: istek başına EN FAZLA 1 `findUnique`, çözümsüz durumlarda 0.

---

## v0.0.5 — Kimlik doğrulama (Better Auth) ✅ (tamamlandı: 2026-10-29)

**Hedef:** Kayıt, giriş, çıkış ve oturum doğrulaması çalışsın.
**Kapsam:**

- [x] Better Auth entegrasyonu, Prisma adapter, gerekli tablolar için migration
- [x] E-posta + şifre kaydı, e-posta doğrulama (Mailpit üzerinden), şifre sıfırlama
- [x] Oturum çerezi (httpOnly, secure, sameSite), oturum listeleme ve sonlandırma
- [x] `AuthGuard` ve `@CurrentUser()` dekoratörü
- [x] Oran sınırlama (rate limit) giriş ve şifre sıfırlama uçlarında
      **Dokunulan paketler:** apps/api, packages/db
      **Kabul kriteri:** Kayıt → doğrulama → giriş → korumalı endpoint → çıkış akışını kapsayan entegrasyon testi yeşil. Doğrulanmamış kullanıcı korumalı uca 401 alır.
      **Bağımlılık:** v0.0.4
      **Tahmini büyüklük:** M

**Yeni ana bağımlılık:** `nodemailer@10.2.1` (Kullanıcı Onayı 2026-10-29)

Node.js stdlib'inde SMTP istemcisi yoktur; Better Auth `sendVerificationEmail` callback sağlar ama mailer motoru getirmez. Elle yazmak altı RFC (EHLO, STARTTLS, AUTH PLAIN/LOGIN, MIME, RFC 2047 başlık kodlaması, dot-stuffing) ve 998 karakter sınırı gerektirir. Bir STARTTLS hatası kimlik bilgilerinin düz metin gönderilmesine yol açar. `nodemailer` 10.2.1'e sabitleniyor — 10.3.0 o gün yayınlandığı için tedarik zinciri koruma istisnası gerektiriyordu. Sonraki geliştirici `latest`'e çekmemelidir.

**Uygulama notları (release, 2026-10-29):**

- **Kabul kriteri — gerçekten koşturuldu:** `pnpm lint` 15/15 · `pnpm typecheck` 15/15 · `pnpm build` 12/12 · `pnpm test` **518/518** (errors 41 + db 166 + api 311) · `pnpm test:isolation` **15/15** (db 14 + api 1) · `pnpm audit` → yalnızca mevcut 1 `high` (`multer`, T-006 öncesi, AC11 aşılmadı). ROADMAP'in kendi AC'si (kayıt → doğrulama → giriş → korumalı endpoint → çıkış) `auth-flow.test.ts` + `auth-sessions.test.ts` (21/21) ile, çapraz kiracı izolasyonu `auth-cross-tenant.isolation.test.ts` (1/1, `vitest.isolation.config.ts`) ile doğrudan koşturularak doğrulandı.
- **`pnpm format:check` temiz** — ama ilk ölçümde exit 1 verdi: beş belge/rapor dosyası (`.changeset/auth-session-management.md`, 3 gate raporu, `docs/adr/0008-*.md`) prettier markdown biçimine uymuyordu; üretim kodu her zaman temizdi. `format:check` CI'ın zorunlu adımlarından biri (`ci.yml:311`) olduğu için commit öncesi Orkestratör `prettier --write` ile kapattı (yalnızca biçim, içerik değişmedi). Kök sebep — `.prettierignore` ajan çıktı dizinlerini kapsamıyor — `qa` tur 2-3'ten devreden borç (B7); bu sürümde kapsam `.changeset/**` ve `docs/adr/**`'e genişledi, borç olarak duruyor.
- **⚠ `pnpm test` hermetik değil** — tek dosya izole koşumda tüm süit yeşil, ama çok-dosya/çok-süreç `pnpm test` art arda (flush'sız) koşulduğunda Redis `platform:auth:*` sayaçları dosyalar arası sızıyor ve **farklı** testler (bu ölçümde `concurrency.test.ts`; `qa` tur 4'te `rate-limit.test.ts`) rastgele düşüyor. Temiz (flush sonrası veya tek koşum) ölçüm **her zaman** 518/518. Teknik borca kaydedildi (vade v0.0.6).
- **Mimari kayıt:** sır taşıyan Prisma delegelerinin (`account`/`session`/`verification`) derleme zamanı daraltması FIX turu 3'te deny-list (`Omit<>`) → allowlist (`Pick<>`) mekanizmasına çevrildi; beş turda beş kez atlatılan kaçış kapısı sınıfı bu değişiklikle kapandı (bkz. ADR-0008). Veritabanı seviyesinde (RLS) bu üç tablo **korunmuyor** — yapısal olarak imkânsız (giriş, asıldan önce parola hash'ini okumak zorunda); garanti tip+lint+test katmanında, v0.0.14'e borç.
- **Operatör kırılması:** `.env`'e iki yeni **zorunlu** değişken (`BETTER_AUTH_SECRET`, `AUTH_BASE_URL`) — yoksa `apps/api` Zod fail-fast ile açılmaz. v0.0.13 emsali, `major` değil (tenant değil operatör müdahalesi).

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
      **Kabul kriteri:** Playwright testi `demo-magaza.arkesoft.localhost:4321` adresinde tenant adını içeren sayfayı, `yok.arkesoft.localhost` adresinde 404'ü doğrular.
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
      **Kabul kriteri:** Playwright görsel testi `demo-magaza.arkesoft.localhost` ana sayfasının tema renklerini uyguladığını doğrular; `theme.json` SDK doğrulamasından geçer.
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

## v0.0.12 — CI/CD ve Changesets ✅ (tamamlandı: 2026-10-28)

> **On üç kabul kriterinin hepsi gerçek GitHub Actions koşumuyla doğrulandı.**
> Yerel kanıt yeterli sayılmadı: dokuz madde ancak runner'da sınanabildi ve ilk
> gerçek koşum **yerelde geçen iki kusuru** ortaya çıkardı (AC13 taramasında
> `xargs`'ın `grep` 1'ini 123'e çevirmesi; `prepare-db`'nin `db:seed`'i bağımlılıklar
> derlenmeden koşturması). İkisi de `103aa24` ile düzeltildi.
>
> **PR bağlamı gerektiren dördünün kanıtı** (PR #2, merge edilmeden kapatıldı):
> **AC1** — yalnızca `apps/api/**` değişti → `api` koştu, `admin`/`superadmin`/
> `storefront`/`shared` **skipped** · **AC2** — aynı PR'a kök dosya (`.github/**`)
> eklendi → **tüm hatlar koştu** (temiz A/B) · **AC7** — changeset'siz koşumda uyarı,
> changeset eklenince temizlendi, **hiçbirinde bloklamadı** · **AC10** — `[vX.Y.Z]`
> etiketi yokken uyarı, eklenince temizlendi.
>
> **AC9 iki ayağı birden:** `16c1035` koşumunda iki job kırmızıyken `ci-gate`
> **failure**; `103aa24` koşumunda **success**; PR #2'de dört job `skipped` iken
> yine **success** → izinli küme `{success, skipped}` doğrulandı.
>
> **Platform sürümü 0.0.4'te kalıyor** — AC6 "gerçek sürüm kesilmez" diyor.
> Bir changeset bekliyor; yükseltme (0.0.5) `release.yml`'ın açacağı sürüm PR'ı ile
> gelecek. Sürüm numarası ile ROADMAP kilometre taşı bu sürümde **ilk kez ayrıştı**
> (v0.0.12 sırası dışında yapıldı) — bkz. Varsayımlar tablosu.

**Hedef:** Her PR'da lint/typecheck/test/build koşsun; sürüm akışı kurulsun.
**Kapsam:**

- [x] GitHub Actions: `ci.yml` (install cache, lint, typecheck, unit test, build)
- [x] Changesets kurulumu, `release.yml` (changeset → versiyon PR → tag)
- [x] PR şablonu: "Hangi ROADMAP versiyonu?" alanı zorunlu
- [x] Branch koruması önerileri `docs/development.md`'de
      **Dokunulan paketler:** kök, .github, packages/db, packages/config
      **Kabul kriteri:** Örnek PR'da tüm job'lar yeşil; changeset'siz PR uyarı verir; `pnpm release:version` sürümleri doğru yükseltir.
      **Bağımlılık:** v0.0.1
      **Tahmini büyüklük:** M

**Uygulama notları:**

- Kabul kriteri geçti: `pnpm lint` 15/15 · `pnpm typecheck` 15/15 · `pnpm build` 12/12 · `pnpm test` 212 test (0 failed/skipped) · `format:check` temiz · `env:check` 17 değişken · `pnpm install --frozen-lockfile` exit 0.
- **Dört bağımsız hattan ek olarak beşinci hat (`shared`)** added: `packages/*` yalnızca lint/typecheck/build koştur, test yok (İçerik ayrıntılar: architect karar K-B2).
- **Kanonik sürüm komutu `pnpm release:version`** — eski `pnpm changeset version` + mekanik senkronizasyon script. Platform semver (kök) ve paket sürümleri tek numaraya (fixed grup) ilerlemiş.
- **Changesets dört üyesi:** (1) `privatePackages.version: true` — yalnızca sürüm, tag yok, registry yayını kapalı. (2) Platform (`fixed` grup): 9 paket (api, db, errors, config, ui, integrations, admin, superadmin, storefront). (3) theme-sdk bağımsız. (4) Public API (trpc) bağımsız.
- **Sürüm/kilometre taşı ayrışması:** ROADMAP versiyonu v0.0.12 (kilometre taşı) çalışması, paket sürümü 0.0.4 → 0.0.5 kesdi. İlk adım bu ayrışmada — ROADMAP sırası dışında yapılması. Sinkronizasyon mekanizması `scripts/sync-platform-version.ts` + `--check` guard.
- **Teknik borç kapandı:** (a) `.env` olmayan CI koşumu dayanıklı (`existsSync` veya `--env-file-if-exists`), (b) `packages/db` `dist/generated` budaması (`find`-tabanlı, `rm -rf dist` değil), (c) `@arkesoft/config` lint-only dep'ler devDep'e taşındı, (d) A-V18 CI host mekanizması (servis localhost → **A-V21 kanıtlandı**).
- **Varsayım:** beşinci hat (`shared`) kullanıcıya sorulmadı çünkü eklemeli ve gerçek boşluğu kapatıyor (6 paket CI dışında). Geri alınırsa o kalemler ROADMAP teknik borç'a yazılır.
- **Düzeltme turları:** 3 tur — `solid` FAIL (4m) → FAIL (4m) → PASS (1m). FIX 1: `ci-gate` job listesi `toJSON(needs)` türü, `shared` hat, fail-open koşulu, literal-jeton tuzağı. FIX 2: `set -e`, jq çalışması, turbo JSON şeması, jeton split, release.yml yarış. FIX 3: jeton senkron çift yön, hata mesajları, 5 low.
- **Dokumanlar:** ADR-0006 (CI/CD+Changesets), `docs/development.md` şu satırları ekledi: CI mimarisi, branch koruması önerileri (uygulanmamış, önerildiği halde), GitHub ayarları (Actions etkin, "approve PR" izni), `pnpm release:version` kanonik komut.

---

## v0.0.13 — Postgres RLS ve tenant izolasyon test koşumu ✅ (tamamlandı: 2026-10-29)

**Hedef:** Veritabanı seviyesinde çapraz tenant erişimi imkânsız olsun.
**Hedefin gerekçesi:** Uygulama katmanı hatası veri sızıntısına dönüşmesin.
**Kapsam:**

- [x] Tüm tenant'a bağlı tablolarda `tenant_id NOT NULL` + indeks
- [x] Her tenant'a bağlı tabloda `ENABLE ROW LEVEL SECURITY` **ve** `FORCE ROW LEVEL SECURITY` + `USING (tenant_id = current_setting('app.tenant_id')::text)` politikası; şema linter'ı ikisini **birlikte** arar, biri eksikse CI kırmızı (T-001 security Tur 1 S3: tablo sahibi `FORCE` olmadan RLS'i atlar)
- [x] Tenant context kancası: `CreatePrismaClientOptions`'a additive alan + `withTenant(tenantId)`; her transaction başında **parametreli** `SET LOCAL app.tenant_id` (dize birleştirme **yasak**; `SET LOCAL` bilinçli seçim — transaction bitince düşer, bağlantı havuzundaki bağlantı sonraki tenant'a sızdırmaz)
- [x] **Rol ayrımı** (T-001 security K3 kararıyla güncellendi — eski "Ayrı DB rolü: migration için `BYPASSRLS`, uygulama için yok" kutusunun yerine): `arkesoft_migrator` (shadow DB için `CREATEDB`, migration'ları çalıştırır) + `arkesoft_app` (`NOSUPERUSER`, `NOBYPASSRLS`, hiçbir tablonun **sahibi değil**, yalnızca `SELECT/INSERT/UPDATE/DELETE`); migration ve uygulama bağlantı dizeleri **ayrı** ortam değişkenleri
- [x] `createTenantIsolationSuite()` test yardımcısı: iki tenant kurup her repository'de çapraz okuma/yazmayı dener
- [x] Yeni tablo eklendiğinde RLS politikasını zorunlu kılan CI kontrolü (şema linter)
      **Dokunulan paketler:** packages/db, apps/api
      **Kabul kriteri:** `pnpm test:isolation` yeşil; RLS politikası olmayan tablo eklendiğinde CI kırmızıya döner. Ek olarak üç doğrulama sorgusu geçmeli: (1) `select rolsuper, rolbypassrls from pg_roles where rolname = current_user` → `f | f`; (2) `select relrowsecurity, relforcerowsecurity from pg_class where relname = 'tenant_membership'` → `t | t`; (3) `app.tenant_id` ayarlanmamış oturumda `select * from tenant_membership` → **0 satır** (hata değil, boş sonuç).
      **Bağımlılık:** v0.0.4
      **Tahmini büyüklük:** L

**Uyarı (T-004'ten):** Yıkıcı ifade taraması artık **tüm** migration kümesine uygulanıyor. Expand/contract politikasının **contract fazındaki meşru** bir `DROP COLUMN` bu testi **kırmızıya düşürecek** ve **kasıtlı bir muafiyet mekanizması** gerekecek. Önerilen biçim: migration SQL'ine konan işaret yorumu `-- arkesoft:allow-destructive <sürüm> <gerekçe>` — muafiyet o migration'la yaşar ve review'de görünür. **Sıralama kısıtı (K-C8):** `stripLineComments` yorumları temizlediği için işaret yorumu normalizasyondan **önce** ayrıştırılmalı. **Testi gevşetmek yasak** (CLAUDE.md §10.6). **Kapsam kararı (T-005, PM):** bu uyarının çözümü (R-D1, durum tutan SQL tarayıcısı) bu sürümün hiçbir AC'sinin yolu üstünde değil → **v0.0.14'e** ertelendi, bkz. [Teknik Borç](#teknik-borç).

**ADR Rezervasyonu:** _"Şema linter'ı statik SQL metnini mi, canlı Postgres kataloğunu mu (`pg_class`/`information_schema`) okur?"_ kararı için **`docs/adr/0007-sema-linter-canli-katalog.md` numarası ayrıldı** (architect T-004). **Karar (T-005, K-E1):** linter **canlı Postgres kataloğunu** okur — `docs/adr/0007-rls-ve-rol-ayrimi.md` yazıldı, `docs/adr/0003-cok-kiracili-veri-modeli.md` madde 7 tadil edildi (RLS/rol/grant DDL'inin elle yazılabileceği dar istisna).

**Not (T-001'den taşındı):** AC4 lint kuralı (`packages/config/eslint/base.js` `no-restricted-imports`) bu sürümde `pg` ve `@prisma/adapter-pg`'yi de kapsayacak şekilde genişletilsin. **T2-1** (**✅ kapandı (T-004, 2026-10-28)** — okuma kapsamı tek `_init` dizininden tüm migration kümesine genişletildi) bu sürümün şema linter'ının **temeli** olduğu için bu sürümden **önce** kapanmalıydı — bkz. [Teknik Borç](#teknik-borç). **✅ kapandı (v0.0.13, K-E12)** — genişletme yapıldı, `$executeRawUnsafe`/`$queryRawUnsafe` de eklendi.

**Uygulama notları:**

- **Kabul kriteri gerçek koşumla doğrulandı (release, 2026-10-29):** `pnpm lint` 15/15 · `pnpm typecheck` 15/15 · `pnpm format:check` temiz · `pnpm build` 12/12 · `pnpm test` 314 (errors 35 + db 164 + api 115), 0 fail/0 skip · `pnpm test:isolation` 14/14 (2 dosya / 5 görev). Üç doğrulama sorgusu `arkesoft_app` bağlantısıyla birebir koşturuldu: `rolsuper,rolbypassrls` → `f|f` · `relrowsecurity,relforcerowsecurity` (`tenant_membership`) → `t|t` · `app.tenant_id` ayarlanmamış oturumda `select count(*) from tenant_membership` → `0` (hata yok).
- **Operatör kırılması (bilinçli, `minor`):** `.env`'e iki yeni zorunlu değişken geldi (`DATABASE_MIGRATION_URL`, `DATABASE_BOOTSTRAP_URL`) ve `pnpm db:bootstrap` adımı eklendi. `DATABASE_URL`'in anlamı değişti — artık en az yetkili `arkesoft_app` rolünü taşıyor. Geçiş ve geri alma adımları `docs/development.md`'de.
- **Çözülen tuzaklar:** (1) `pnpm db:deploy` en-az-yetkili rolle DDL migration'ı uygulayamıyordu (RLS/politika sahip rol ister) — `db:deploy` guard'lı CLI'ye sarmalandı. (2) `catalog-lint.ts`'in `WITH CHECK`/`USING` doğrulaması alt dize araması yapıyordu (`WITH CHECK (true)` 17 kuraldan temiz geçiyordu) — kanonik (deparse edilmiş) **tam dize eşitliği**ne geçildi; Postgres'in yedi farklı yazımı aynı kanonik dizeye indirgediği `security` tur 3'te ampirik olarak doğrulandı (dört kasıtlı mutasyonun dördü de bulguyu kırmızıya düşürdü — totolojik değil). (3) `_prisma_migrations` tablosunda `arkesoft_app`'in fazla DML yetkisi `DO` bloğu + `IF EXISTS` taklidiyle `REVOKE` edildi (Postgres'in tablo `REVOKE`'u `IF EXISTS` söz dizimini desteklemediği için).
- **Yeni varsayımlar:** mimari varsayımlar A-E1–A-E8 olarak [Varsayımlar](#varsayımlar-ve-açık-kararlar) tablosuna eklendi.
- **Mimari kısıt (kayda geçti):** Kanonik tam dize eşitliği, "bir tablo = bir kanonik politika"yı platform seviyesi bir kısıt yapıyor (`docs/adr/0007:242-245`). İleride meşru bir ikinci politika gerekirse gevşetme **karşılaştırma mekanizması değiştirilerek değil, K-E5 madde 3 tadil edilerek** yapılacak (bağlayıcı).
- **Teknik borç:** T-005 gate turlarının (1 high + çeşitli medium/low, 3 tur sonunda hepsi kapandı veya bilinçli olarak ertelendi) kalan `low`/ertelenen `medium` bulguları [Teknik Borç → Vadesi v0.0.14](#teknik-borç) tablosuna eklendi.

---

## v0.0.14 — RBAC ve yetki modeli

**Hedef:** Rol ve izin kontrolü tüm uçlarda uygulanabilir olsun.

**Devreden borç (T-006/v0.0.5, ADR-0008 "R-1 KARARI"):** parola hash'i/oturum belirteci/doğrulama belirteci taşıyan üç tablo (`account`/`session`/`verification`) veritabanı seviyesinde (RLS) **korunamıyor** — yapısal (giriş, asıldan önce hash'i okumak zorunda). v0.0.13 sonunda bu borç "platform tablolarına RLS düşün" iken, v0.0.5 sonunda **üç tablo + üç kolon** büyüdü ve çözümün şekli değişti: bu sürüm **`arkesoft_auth` rolü** + **kolon bazlı `GRANT`/`REVOKE`** + `catalog-lint`'e **kolon yetkisi kural sınıfı** + **ikinci Prisma istemcisi/havuzu** + **üçüncü zorunlu env** (ikinci operatör kırılması) teslim etmek zorunda.

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

| #     | Varsayım                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Etkilediği versiyon     |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| A1    | ~~Node 22 LTS~~ → **Node 24 LTS ("Krypton")** ve pnpm 12+ kullanılır. Düzeltme gerekçesi: 2026-10 itibarıyla Node 22 ("Jod") bakım moduna geçmiş ve ömrü 2027-04'te doluyor; Node 26 ise henüz LTS değil. `.nvmrc` = `24`, CI ve üretim 24'e sabitlenir. `engines.node` `>=24` bırakıldı ki yerel makinede 25 ile de çalışılabilsin. **Dikkat:** geliştirme makinesinde şu an Node 25.8.1 (LTS olmayan hat) kurulu — v0.0.4'ten (NestJS) önce yerel kurulumun 24'e çekilmesi önerilir.                          | v0.0.1                  |
| A2    | Tek Postgres veritabanı, paylaşılan şema, `tenant_id` + RLS. Tenant başına şema veya veritabanı yok. (ADR-0003 konusu)                                                                                                                                                                                                                                                                                                                                                                                          | v0.0.3, v0.0.13         |
| A3    | Storefront **tek bir çok kiracılı dağıtım**tır; tenant host adından çözülür. Tenant başına ayrı dağıtım yapılmaz. (ADR-0002 konusu)                                                                                                                                                                                                                                                                                                                                                                             | v0.0.8                  |
| A4    | Temalar derleme zamanında storefront paketine dahil edilir; desteklenen tema versiyonları (N-2 penceresi) aynı dağıtımda yan yana bulunur. Çalışma zamanında npm'den dinamik tema kurulumu MVP kapsamında değil. (ADR-0002 konusu)                                                                                                                                                                                                                                                                              | v0.0.10, v0.16.0        |
| A5    | E-fatura entegratörü olarak modern REST API'si olan tek bir sağlayıcı (Nilvera varsayımı) ile başlanır; `InvoiceAdapter` arayüzü sağlayıcı değişimini mümkün kılar.                                                                                                                                                                                                                                                                                                                                             | v0.14.0                 |
| A6    | Platform aboneliği tahsilatı iyzico kart saklama + yinelenen ödeme ile yapılır; ayrı bir faturalandırma sağlayıcısı (Stripe vb.) kullanılmaz.                                                                                                                                                                                                                                                                                                                                                                   | v0.17.0                 |
| A7    | DNS ve CDN Cloudflare'dir; wildcard `*.arkesoft.app` kaydı ve R2 depolama kullanılır.                                                                                                                                                                                                                                                                                                                                                                                                                           | v0.19.0, v0.18.0        |
| A8    | SSL: Kubernetes'te cert-manager + Let's Encrypt (wildcard için DNS-01, özel alan adları için HTTP-01).                                                                                                                                                                                                                                                                                                                                                                                                          | v0.19.0                 |
| A9    | Vitrin müşterileri (`Customer`) panel kullanıcılarından (`User`) ayrı modeldir ve tenant'a kapsamlıdır; aynı e-posta farklı tenant'larda bağımsız müşteri olabilir.                                                                                                                                                                                                                                                                                                                                             | v0.12.0                 |
| A10   | Para birimi tamsayı kuruş olarak saklanır; ondalık/float kullanılmaz.                                                                                                                                                                                                                                                                                                                                                                                                                                           | v0.0.18                 |
| A11   | ERP entegrasyonunda ilk iki sağlayıcı Logo ve Netsis varsayılmıştır; müşteri talebine göre değişebilir.                                                                                                                                                                                                                                                                                                                                                                                                         | v1.9.0                  |
| A12   | Mobil uygulama ayrı bir repoda geliştirilir; bu yol haritası yalnızca gereken API yüzeyini kapsar.                                                                                                                                                                                                                                                                                                                                                                                                              | v1.11.0                 |
| A13   | TypeScript **6.0.3**'e sabitlendi (en güncel sürüm 7.0.2 olmasına rağmen). Gerekçe: `typescript-eslint` 8.x, tip bilgisine dayalı lint için `typescript >=4.8.4 <6.1.0` istiyor; TypeScript 7 (Go ile yazılmış native port) henüz desteklenmiyor. Katı tip-aware lint, CLAUDE.md'nin `any` yasağını ve hata yönetimi kurallarını zorlayan asıl mekanizma olduğu için TS 7'ye geçmek yerine TS 6.0'da kalındı. `typescript-eslint` TS 7 desteği yayınlayınca yükseltilir.                                        | v0.0.1                  |
| A14   | pnpm `npm install -g pnpm` ile global kuruldu (sürüm 12.15.0, `packageManager` alanında sabit). Gerekçe: Node 25 dağıtımında corepack artık gelmiyor. CI'da pnpm/action-setup kullanılacak.                                                                                                                                                                                                                                                                                                                     | v0.0.1                  |
| A15   | **Postgres 17** (17.11-alpine) kullanılır; ROADMAP'te başta `postgres:16` yazıyordu. Gerekçe: PG17 desteği 2029-11'e kadar sürüyor (PG16 2028-11), PG18 ise bir aylık. Sistemin kayıt defteri olan bileşende olgun sürüm tercih edildi.                                                                                                                                                                                                                                                                         | v0.0.2                  |
| A16   | **Redis 8** (8.10-alpine) kullanılır; ROADMAP'te başta `redis:7` yazıyordu. Gerekçe: güncel kararlı hat, BullMQ uyumlu. **Teyit edilmeli:** Redis'in 7.4 sonrası lisans değişiklikleri; üretimde yönetilen Redis kullanılacağı için (v0.18.0) risk sağlayıcıda kalıyor, ama ticari kullanım öncesi lisans doğrulanmalı.                                                                                                                                                                                         | v0.0.2                  |
| A17   | Yerel S3 uyumlu depolama **MinIO yerine SeaweedFS**. MinIO imajları anonim çekilemiyor. Üretim (Cloudflare R2) değişmedi. Ön imzalı URL ve CORS uyumluluğu v0.0.16'da ayrıca doğrulanmalı. Bkz. ADR-0005.                                                                                                                                                                                                                                                                                                       | v0.0.2, v0.0.16         |
| A18   | `@prisma/adapter-pg` + `pg` + `@types/pg` zorunlu (dep/devDep). Gerekçe: Prisma 7, şemadan `datasource.url`'i kaldırdı; çalışma zamanı istemcisi adaptörsüz kurulamıyor (T-001, Kullanıcı Onayı #1).                                                                                                                                                                                                                                                                                                            | v0.0.3, v0.0.4, v0.0.13 |
| A19   | pnpm 12.15.0 build-script allowlist şeması **`allowBuilds: { paket: true }`** (harita), `onlyBuiltDependencies` (dizi) **değil**. Doküman ve ADR metinleri `allowBuilds` yazmalı. (T-001, ST-5)                                                                                                                                                                                                                                                                                                                 | v0.0.3                  |
| A20   | Prisma 7.10.1 `prisma.config.ts` ve `prisma-client` generator'ını destekliyor (A yolu); B yedek yolu (`prisma-client-js` + `@prisma/client` eşlemesi) kullanılmadı. (T-001, A-V12 doğrulandı)                                                                                                                                                                                                                                                                                                                   | v0.0.3                  |
| A21   | **NestJS 12.2.0 + Express adaptörü.** `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/testing` 12.2.0; `reflect-metadata` 0.2.2, `rxjs` 7.8.2. Fastify yolu v0.0.5 (Better Auth), v0.0.6 (tRPC), v0.0.11 (Bull Board), v0.0.16 (multipart) için uzun bir entegrasyon sırasına karşı basit yapı sundukça kapalı (gerekçe ADR-0004).                                                                                                                                                       | v0.0.4                  |
| A22   | **TypeScript decorators:** `experimentalDecorators: true`, **`emitDecoratorMetadata: false`**, `useDefineForClassFields: false`. Metadata emit'lenmediği için DI **açık `@Inject(TOKEN)`** zorunlu; repo lint (`consistent-type-imports`) ve esbuild (vitest) bunu zorluyor. (T-002 ST-0 spike sonucu, ladder 1)                                                                                                                                                                                                | v0.0.4                  |
| A23   | **`@arkesoft/errors` yeni iç paketi** (v0.0.4). `AppError`, `AppErrorBody` Zod şeması, `maskEmail` + `PINO_REDACT_PATHS`. Bağımlılık yalnızca `zod` → döngü imkansız. Taşıma gerekçesi: v0.0.6 `packages/trpc` ve v0.0.17 Sentry eşlemesi bu tipi görmek zorunda; `packages/integrations` uygulamaya import edemez. (T-002 Onay #4, K-A2)                                                                                                                                                                       | v0.0.4, v0.0.6, v0.0.17 |
| A24   | **Doğrulama: Zod**, `class-validator`/`class-transformer` **eklenmiyor**. Global `ZodValidationPipe` + `ValidatedBody/Query/Params` dekoratörleri. Lint (`no-restricted-imports`) `Body/Query/Param` importu yasak kılar. (T-002 K-A6)                                                                                                                                                                                                                                                                          | v0.0.4, v0.0.5+         |
| A25   | **`x-arkesoft-tenant` başlığı yalnızca `NODE_ENV !== 'production'`** iken okunur; üretimde `header_rejected_in_production` sebebiyle reddedilir, host'a fallback yapılmaz. Servis-servis güvenilir belirteç v0.0.5/v0.0.8'de tanımlanacak. (T-002 Onay #1, K-A4)                                                                                                                                                                                                                                                | v0.0.4, v0.0.5, v0.0.8  |
| A26   | **`X-Forwarded-Host` okunmaz, `trust proxy` kapalı.** Kaynak yalnızca `Host` başlığı. `new URL()` normalizasyonu ile IDN, port soyma, IPv6 yapılır; proxy allowlist'i v0.18.0'da gelecek. Üretim ingress'i `Host` başlığını korumak zorunda. (T-002 K-A4, security PASS A-A7 teyiti)                                                                                                                                                                                                                            | v0.0.4, v0.0.18         |
| A27   | **Tenant çözümü önbelleklenmiyor** (v0.0.13'e kadar RLS yokken). İstek başına EN FAZLA 1 `findUnique`, çözümsüz durumlarda 0. (T-002 K-A4)                                                                                                                                                                                                                                                                                                                                                                      | v0.0.4, v0.0.13+        |
| A28   | **TUTTU.** Panel giriş yüzeyi platform host'u (`panel.arkesoft.{APP_BASE_DOMAIN}`), kiracı alt alan adı değil; `panel` zaten rezerve (`reserved-subdomains.ts:22`) ama host hiçbir yerde tanımlı değildi — v0.0.5 onu tanımlayan ilk sürüm oldu (R1 onayı, PM A1). Sonucu: auth oran sınırlama sayaçları **platform** kapsamlı (`platform:auth:*`).                                                                                                                                                             | v0.0.5                  |
| A29   | **TUTTU, ölçüldü.** Mailpit CI'da `services:` ile kaldırılabilir ve `:8025/api/v1/messages` okunabilir (PM A2, architect A-G9) — `devops`/S1 ölçtü.                                                                                                                                                                                                                                                                                                                                                             | v0.0.5                  |
| A30   | **TUTTU, ölçüldü.** Better Auth yinelenen e-posta kaydında varlık sızdırmayan tek biçimli yanıt üretecek şekilde yapılandırılabildi (PM A3) — `security` çapraz turlarda ölçtü, aynı status + aynı gövde şekli.                                                                                                                                                                                                                                                                                                 | v0.0.5                  |
| A31   | **TUTTU, ölçüldü.** Better Auth `user` modeli `@map("app_user")` ile mevcut tabloya eşlendi, `tenant_membership.user_id` FK'si bozulmadı (PM A4) — adaptör modele Prisma **model adıyla** erişiyor (`prisma.user`), `@@map`/`@map` adaptöre görünmüyor (A-G2), `modelName`/`fields` eşlemesi gerekmedi.                                                                                                                                                                                                         | v0.0.5                  |
| A32   | **TUTTU.** Oran sınırlama Redis ile bağımlılıksız çözüldü (PM A5) — yeni paket eklenmedi, eşikler modül sabiti, pencere süresi env'den.                                                                                                                                                                                                                                                                                                                                                                         | v0.0.5                  |
| A-G1  | **TUTTU, ölçüldü.** `@better-auth/cli generate` çıktısı (`betterAuth@1.7.14` + `@better-auth/cli@1.4.21`) yazılan alan listesiyle (`emailVerified`/`image`) birebir eşleşti, sapma yok.                                                                                                                                                                                                                                                                                                                         | v0.0.5                  |
| A-G2  | **TUTTU, ölçüldü.** Adaptör Prisma **model adıyla** erişiyor (`prisma.user`/`prisma.account`/…); `@@map`/`@map` adaptöre görünmüyor → `modelName`/`fields` eşlemesi gerekmedi (`solid` tur4 §2.1 üretim çağrı noktalarıyla doğruladı).                                                                                                                                                                                                                                                                          | v0.0.5                  |
| A-G3  | **KISMEN.** `$queryRaw`/`$transaction`/`$disconnect` ve kalan delegeleri koruma iddiası FIX 3'te mekanizma `Omit<>`'ten `Pick<>`'e değişince biçim değiştirdi: `$queryRaw` allowlist'te kaldı, ama `$transaction` (FIX 2) ve `$disconnect` (FIX 3) **bilinçli olarak** `.db` yüzeyinden çıkarıldı (üretimde `.db` üzerinden hiç çağrılmadıkları ölçüldü). Sonuç aynı (`pnpm typecheck` 15/15), biçim farklı.                                                                                                    | v0.0.5                  |
| A-G4  | **TUTTU, ölçüldü.** `prismaAdapter()` `PrismaDatabase` tipini `@prisma/client` import etmeden kabul etti; `any`/`@ts-ignore` kullanılmadı.                                                                                                                                                                                                                                                                                                                                                                      | v0.0.5                  |
| A-G5  | **TUTTU, ölçüldü.** Nest gövde ayrıştırıcısından yeniden kurulan Web `Request` `auth.handler()` tarafından işlendi; `getSetCookie()` çoklu `Set-Cookie`'yi doğru döndü (Node 24).                                                                                                                                                                                                                                                                                                                               | v0.0.5                  |
| A-G6  | **ÇELİŞKİ ÇIKTI — düzeltildi.** Architect'in yazdığı `POST /auth/forget-password` Better Auth'ta **mevcut değil**; gerçek uç adı `POST /auth/request-password-reset`. Yedi yollu allowlist, `auth-delegated-paths.ts`/`rate-limit.policy.ts`/`tenant-exempt-paths.ts` içinde dosya yorumuyla işaretlenerek doğru uç adına düzeltildi (S5 ölçtü ve düzeltti); test sayısı/kapsamı değişmedi.                                                                                                                     | v0.0.5                  |
| A-G7  | **TUTTU, ölçüldü (AC8).** Better Auth'un logger'ı `info` ve altında belirteç/ham e-posta emit etmedi; `auth-secret-leak.test.ts` + çapraz turlarda log yakalama testi yeşil.                                                                                                                                                                                                                                                                                                                                    | v0.0.5                  |
| A-G8  | **TUTTU, ölçüldü (AC6).** `cookieCache.enabled: false` ile oturum iptali **anında** etkili oldu; sahte-yeşil ölçülmedi.                                                                                                                                                                                                                                                                                                                                                                                         | v0.0.5                  |
| A-G9  | **TUTTU, ölçüldü.** Mailpit CI'da `services:` ile kaldırılabildi ve `:8025/api/v1/messages` okunabildi (S1/devops ölçtü, AC4 gevşetilmedi).                                                                                                                                                                                                                                                                                                                                                                     | v0.0.5                  |
| V-P1  | **TUTTU.** `apps/api/vitest.config.ts` `include: ['src/**/*.test.ts']` `*.isolation.test.ts`'i de eşledi → S6→S7 arası AC10 testi `pnpm test` içinde koştu ve yeşil kaldı; S7 `exclude` ile ayırdı.                                                                                                                                                                                                                                                                                                             | v0.0.5                  |
| V-P2  | **TUTTU.** Oran sınırlama guard'ı `AuthModule` içinde `APP_GUARD` olarak sağlandı (`tenancy.module.ts` deseniyle aynı) → S8 `app.module.ts`'e dokunmadı (dosya yorumunda "V-P2, PO varsayımı TUTTU" olarak işaretli).                                                                                                                                                                                                                                                                                           | v0.0.5                  |
| V-P3  | **TUTTU.** `packages/errors`'ın sahibi `backend` olarak onaylandı (Orkestratör, 2026-10-29) — T-002/ST-3b emsaliyle tutarlı.                                                                                                                                                                                                                                                                                                                                                                                    | v0.0.5                  |
| V-P4  | **TUTTU.** `.github/ci-expected-isolation-packages.txt` iki satıra çıktı; T-005'in "yalnızca `packages/db`" varsayımı bilinçli olarak bu sürümde geçersizleşti.                                                                                                                                                                                                                                                                                                                                                 | v0.0.5                  |
| V-P5  | **TUTTU.** `pnpm env:check` yalnızca `infraEnvSchema`+`databaseAdminEnvSchema`'yı doğruladı; `.env.example`'a eklenen `AUTH_*` değişkenleri bunu kırmadı.                                                                                                                                                                                                                                                                                                                                                       | v0.0.5                  |
| A-A1  | **Hata gövdesi:** `message` v0.0.18'e kadar **i18n anahtarı** (Türkçe metin değil). `context` yanıta asla yazılmaz, yalnızca log. `details` asla null, varsayılan `{}`. `details.checks` (`/health/ready`), `details.fields` (doğrulama) biçimleri. (T-002 K-A4, K-A7)                                                                                                                                                                                                                                          | v0.0.4, v0.0.18         |
| A-A2  | **`/health/ready` sağlayıcıya özgü dallanma yok.** `HealthCheck[]` dizisi `Promise.allSettled` + `withTimeout(2000)`. (T-002 K-A8)                                                                                                                                                                                                                                                                                                                                                                              | v0.0.4, v0.0.6+         |
| A-A3  | **`pino` 10.4.0, `ioredis` 6.0.0.** Elle bağlanmış pino (`@nestjs/pino`, `pino-http` **yok**). `requestId` = `'req_' + randomUUID()`, istemci başlığı `/^[A-Za-z0-9_-]{8,64}$/` doğrulamasından geçerse kullanılır. (T-002 K-A7, ST-0 spike)                                                                                                                                                                                                                                                                    | v0.0.4, v0.0.11         |
| A-A4  | **`RESERVED_SUBDOMAINS`** (www, api, admin, app, panel, cdn, static, assets, mail, superadmin, status, docs) bugün `apps/api`'de hardcoded. v0.1.0 tenant oluşturma bu listeyi reddetmek zorunda. (T-002 K-A4 bölüm 4)                                                                                                                                                                                                                                                                                          | v0.0.4, v0.1.0          |
| A-A5  | **`Tenant.primaryDomain` normalizasyonu** (`new URL()` ile port/IPv6 soyma, IDN→punycode) v0.1.0'ın işi; v0.0.4'te yalnızca okuma. (T-002 K-A4 bölüm 2)                                                                                                                                                                                                                                                                                                                                                         | v0.0.4, v0.1.0          |
| A-A6  | **`pnpm audit` v0.0.16 multipart'tan sonra `multer` GHSA-q7qp-rjg7-q26m (high, v0.0.4'te somut değil) için `pnpm.overrides`** (kök `package.json`) + beşli kapıya eklenmeli. (T-002 security medium)                                                                                                                                                                                                                                                                                                            | v0.0.4, v0.0.16         |
| V1    | Soft delete edilmiş `Tenant`'ın `slug`/`primaryDomain`'i ve `User.email`'i serbest kalmaz; tekillik `deletedAt`'ten bağımsız korunur. Gerekçe: silinen mağazanın dizinlenmiş URL'lerini/e-posta geçmişini devralınması SEO/güven açısından kabul edilemez. (T-001, PM V1)                                                                                                                                                                                                                                       | v0.0.3                  |
| A-V7  | `Tenant.primaryDomain` yalnızca **özel** alan adını tutar; `{slug}.arkesoft.app` alt alan adı `slug` + `APP_BASE_DOMAIN`'den türetilir, saklanmaz. Seed'de `null`. (T-001, architect)                                                                                                                                                                                                                                                                                                                           | v0.0.3, v0.0.4, v0.0.8  |
| A-V8  | `TenantStatus`'a `deleted` **eklenmiyor**; silinmişliğin tek doğruluk kaynağı `deletedAt`. **v0.1.0 bu değeri yeniden eklememeli** — yazılı kapsamdan bilinçli sapma, kullanıcı teyidi değerli. (T-001, architect)                                                                                                                                                                                                                                                                                              | v0.0.3, v0.1.0          |
| A-V9  | `User.name` ve `Tenant.name` **NOT NULL**. Sonradan NOT NULL eklemek yıkıcı + Better Auth `user.name`'i zorunlu bekliyor; v0.0.5'te ad gelmeyen sosyal giriş sağlayıcısı varsa teyit edilmeli. (T-001, architect)                                                                                                                                                                                                                                                                                               | v0.0.3, v0.0.5          |
| A-V18 | v0.0.12 CI Postgres'e `localhost`/`127.0.0.1` üzerinden erişir varsayımıyla ilerlendi; `postgres` host adı yıkıcı komut guard'ının allowlist'inden çıkarıldığı için CI işi konteyner içinde servis adıyla bağlanıyorsa o sürümde **ayrı bir mekanizma** gerekecek. (T-001, düzeltme turu)                                                                                                                                                                                                                       | v0.0.3, v0.0.12         |
| A-V19 | Changesets `fixed` grubu + `privatePackages.version: true` + `scripts/sync-platform-version.ts` platform sürümünü tek numarayla ilerletir; kök paket workspace üyesi yapılmaz (ADR-0006)                                                                                                                                                                                                                                                                                                                        | v0.0.12                 |
| A-V20 | `turbo run build --affected --dry=json` çıktısının `.packages` alanı affected kümesini (değişenler **ve dependent'ları**) verir; `TURBO_SCM_BASE`/`TURBO_SCM_HEAD` env adları turbo 2.11.10'da geçerli. Şema farklıysa **fail-open** (tüm hatlar koşar). **.packages[]** düz string dizisi (`["//", "@arkesoft/admin", …]`), `.packages[].name` değil; filtresiz bırakılsa `<NONEXISTENT>` placeholder'lar tüm paketleri "test sahibi" yaptığından filtre `select(.command != "<NONEXISTENT>")` zorunlu.        | v0.0.12                 |
| A-V21 | GitHub `services:` ile açılan Postgres/Redis, container'sız job'da `localhost:5432`/`6379`'a maplenir → `guard-policy.ts` allowlist'i karşılanır, `pnpm db:seed` exit 0 (**A-V18'in kapanışı**).                                                                                                                                                                                                                                                                                                                | v0.0.12                 |
| A-V22 | `fixed` grubun yükselmesi `@arkesoft/theme-sdk` ve `@arkesoft/trpc`'yi **taşımaz** (`workspace:*` aralıkları kırılmadığı için dependent bump tetiklenmez).                                                                                                                                                                                                                                                                                                                                                      | v0.0.12                 |
| A-V23 | Node 24 tip sıyırması `scripts/sync-platform-version.ts`'i **derlemesiz** koşturur (dosya `enum`/`namespace`/parametre özelliği kullanmaz).                                                                                                                                                                                                                                                                                                                                                                     | v0.0.12                 |
| A-V24 | ~~`vitest list` ve `prisma validate` DB'ye bağlanmadan, `.env` **olmadan** koşar~~ — **Düzeltme:** `prisma validate` `DATABASE_URL` meşru olarak ister (Prisma yapısı), `.env` dosyasının yokluğuna `prisma.config.ts` dayanıklı hale geldi (ST-1'in düzeltmesi). CI'da değişken **ortamdan** (env:) geliyor. `vitest list` başarılı.                                                                                                                                                                           | v0.0.12                 |
| A-V25 | ~~`fixed` grubu 11 paket~~ — **Düzeltme:** `@arkesoft/versioning` ve `@arkesoft/i18n` henüz oluşturulmamış → `fixed` grubu **9 üye** (api, db, errors, config, ui, integrations, admin, superadmin, storefront). Drift guard (`--check`) yeni paketleri otomatik gruba eklemek zorlar.                                                                                                                                                                                                                          | v0.0.12                 |
| A-V26 | `zod` kök `devDependencies`'e `catalog:` ile eklendi (ST-5 Orkestratör kararı, A-V26); `scripts/sync-platform-version.ts` tip sıyırma altında `zod`'u kök `node_modules`'tan çözebiliyor.                                                                                                                                                                                                                                                                                                                       | v0.0.12                 |
| A-DV1 | `changesets/action@v1.9.0` (SHA: `a45c4d594aa4e2c509dc14a9f2b3b67ba3780d0d`) — `@v1` hareketli tag yerine annotated tag dereference ile spesifik commit. v2 tercih edilirse tek satır düzeltme.                                                                                                                                                                                                                                                                                                                 | v0.0.12                 |
| A-E1  | **Tuttu.** `migrate dev --create-only` boş diff'te `migration.sql` dizinini standart adlandırmayla üretti (`20261028153016_rls_tenant_isolation/`); elle dizin oluşturma gerekmedi (dolaylı doğrulama — S3'ün riskine düşülmedi).                                                                                                                                                                                                                                                                               | v0.0.13                 |
| A-E2  | **Tuttu.** `arkesoft_migrator` shadow DB'yi kendi `CREATEDB` yetkisiyle kurdu; `prisma.config.ts`'e `shadowDatabaseUrl` eklenmedi (dosyada değişiklik yok, `git diff` boş) — AC5 bu yolla kapandı.                                                                                                                                                                                                                                                                                                              | v0.0.13                 |
| A-E3  | **Tuttu.** `prisma migrate diff` RLS/politika/grant'i drift olarak bildirmedi; `pnpm db:verify` yeşil (AC10 PASS, `qa`/`security` tur 2–3 bağımsız ölçtü).                                                                                                                                                                                                                                                                                                                                                      | v0.0.13                 |
| A-E4  | **Tuttu.** `tx.$queryRaw` etiketli şablonu `set_config` çağrısını kabul etti; `*Unsafe` hiç kullanılmadı (`security` tur 1–3: 0 `*Unsafe`, enjeksiyon denemeleri sözdizimi hatasız 0 satırla sonuçlandı).                                                                                                                                                                                                                                                                                                       | v0.0.13                 |
| A-E5  | **Tuttu, testle pinlendi.** RLS `WITH CHECK` FK trigger'ından **önce** değerlendiriliyor — varlık/yetki oracle'ı kapalı (K-E10 senaryo 4); `security` tur 3'te ampirik doğrulandı: var olan ve var olmayan yabancı `tenant_id` aynı hata sınıfını üretiyor.                                                                                                                                                                                                                                                     | v0.0.13                 |
| A-E6  | **Tuttu.** Dev parolaları URL-güvenli; S2, S1'in `.env` değerlerini birebir kullandı — uyuşmazlık çıkmadı.                                                                                                                                                                                                                                                                                                                                                                                                      | v0.0.13                 |
| A-E7  | **Tasarımla MOOT edildi.** Koşturucu `psql`'e bağımlı kalmadı — Node tabanlı yazıldı (`prisma db execute --file`); paket içi doğrudan `pg`/`@prisma/adapter-pg` kullanımı `client.ts` dışında K-E12 ile yasaklandı.                                                                                                                                                                                                                                                                                             | v0.0.13                 |
| A-E8  | **Varsayım olmaktan çıktı — ölçüldü (T-005 Gate Turu 3).** `solid`'in "deparse biçimi PG sürümüne bağlı, kanonik tam dize eşitliği kırılgan" itirazı, `security`'nin canlı Postgres'te **yedi** farklı SQL yazımını aynı kanonik dizeye indirgediğini göstermesiyle kapandı; dört kasıtlı şablon mutasyonunun dördü de bulguyu kırmızıya düşürdü (totolojik değil). Yan etki: tam eşitlik "bir tablo = bir kanonik politika"yı platform kısıtı yapıyor — gevşetme yalnızca K-E5 madde 3 tadil edilerek yapılır. | v0.0.13, v0.0.14        |

## Sürüm ve kilometre taşı ayrışması (v0.0.12'den başlayarak)

**Karar (v0.0.12):** ROADMAP kilometre taşı numarası ile paket sürümü v0.0.12'den itibaren **ayrışabilir**.

**Nedeni:** v0.0.1–v0.0.4 sırası takip ederek yapıldığı için birebir çakışıyordu. v0.0.12 **sırası dışında** yapılmış (bağımlılığı yalnızca v0.0.1 olduğu için teknik olarak mümkün; CI erken kurulması sonraki her sürümü koruma altına alıyor). Sonuç:

- **ROADMAP kilometre taşı:** v0.0.12 (sıra, etiket)
- **Paket sürümü kesilişi:** 0.0.4 → 0.0.5 (Changesets tarafından `fixed` grubun en yükseği)

Bundan sonra sürümler sıra takip ederse yeniden çakışır. Sıra dışında yapılırsa ayrışır.

**Doğrulama:** `sync-platform-version.ts --check` her PR'da kökün paket sürümü (max fixed grup) ile eşit olup olmadığını doğrular.

---

# Teknik Borç

> Gate'lerin (`qa`/`security`/`solid`) PASS verirken kaydettiği `low` ve geçen `medium` bulgular.
> Her kalem bir sonraki uygun sürümde ele alınır; vadesi gelen versiyon kapanmadan satır silinmez,
> yalnızca "çözüldü" diye işaretlenip gerekçesiyle arşivlenir. Kaynak: T-001 (v0.0.3) gate raporları.

## Vadesi v0.0.13 — RLS borcunun üç ayağı (AC8)

**Not (v0.0.4'ten):** v0.0.4 ile uygulama katmanı tenant izolasyonunun **TEK savunma hattı** oldu — `TenantContextMiddleware`/`TenantGuard`/`getTenantContext()` zincirindeki bir hata doğrudan çapraz tenant veri sızıntısıdır ve veritabanı yakalamaz.

**Çapraz not (v0.0.4'ten):** `withTenant()` `PrismaService` sınıfına additive eklenecek (tek erişim noktası, `.db` getter'ı o sürümde lint ile kısıtlanabilir hâle gelir); `TenantContext.id` `SET LOCAL app.tenant_id` için hazır; `checkDatabaseConnection` `packages/db` içinde olduğu için doğru role yönlendirilebilir. `CreatePrismaClientOptions` v0.0.4'te **bilinçli olarak değiştirilmedi** → bu sürüm kendi alanını çakışmasız ekleyebilir.

| SEV    | Konum                                                        | Açıklama                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Sorumlu            | Vade    | Kaynak gate                       |
| ------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------- | --------------------------------- |
| medium | `packages/db/src/tenancy.ts:9-13`                            | **✅ kapandı (v0.0.13, T-005).** (a) Politika yazıldı — `tenant_membership`'te `ENABLE`+`FORCE ROW LEVEL SECURITY` ve kanonik `USING`/`WITH CHECK` politikası; canlı katalog linter'ı ikisini birlikte zorluyor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | db                 | v0.0.13 | security                          |
| medium | `infra/docker-compose.yml:26` · `.env.example:21`            | **✅ kapandı (v0.0.13, T-005).** (b) Rol ayrımı: `arkesoft_migrator` (sahip, `CREATEDB`) + `arkesoft_app` (`NOSUPERUSER`/`NOBYPASSRLS`, hiçbir tablonun sahibi değil) — `bootstrap-roles.sql` + idempotent koşturucu; ampirik doğrulandı (`rolsuper,rolbypassrls` → `f\|f`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | devops + architect | v0.0.13 | security                          |
| medium | `packages/db/src/client.ts:47`                               | **✅ kapandı (v0.0.13, T-005).** (c) `withTenant(client, tenantId, cb)` eklendi — tek `$transaction` içinde `set_config('app.tenant_id', $1, true)`; `PrismaService.withTenant()` additive delegasyon ile `apps/api`'ye taşındı.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | db                 | v0.0.13 | security                          |
| medium | `packages/db/src/__tests__/migration-sql.test.ts:18-30`      | **✅ kapandı (T-004).** Okuma kapsamı tek `_init` dizininden **tüm migration kümesine** genişletildi; doğrulama artık kümülatif şema yüzeyi ile taksonomiyi **iki yönde** karşılaştırıyor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | db                 | v0.0.13 | security                          |
| low    | `packages/config/eslint/base.js:52-64`                       | **✅ kapandı (v0.0.13, T-005, K-E12).** `no-restricted-imports` `pg`/`pg-pool`/`pg-native`/`@prisma/adapter-pg`'yi de kapsıyor (`packages/db/src/client.ts` dosya kapsamlı istisna); `no-restricted-syntax` `$executeRawUnsafe`/`$queryRawUnsafe`'i de kapsıyor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | devops             | v0.0.13 | security                          |
| medium | `packages/db/src/__tests__/helpers/migration-set.ts`         | **R-D1 — durum tutan tek geçişli migration SQL tarayıcısı.** Yıkıcı ifade taraması ve ayna bekçisi bugün **metin tabanlı**; dört bilinen boşluk var ve **dördü de aynı mekanizmayla** kapanır: **(a)** harf/boşluk duyarlılığı — `drop column`, `SET  NOT NULL`, `DROP\nCOLUMN` yakalanmıyor (9 ampirik vektör) · **(b)** **R-C4** `stripLineComments`'in string-literal sınırı (`SET "note" = '--'; DROP TABLE "x";`) · **(c)** ayna bekçisinin blok yorum / dize literali yanlış pozitifi (fail-**closed**) · **(d)** `CREATE/* c */TABLE` kör noktası. **Çözüm:** tek tırnak + `''` + `$tag$` + `/* */` + `--` farkında, ifade seviyesinde bölen, **dosya sonunda açık literal/yorum için fail-closed** bir tarayıcı. **DÖRDÜNCÜ BİR SEZGİSEL YAMA DENENMEYECEK** — T-004'te üç eşik denendi (harf duyarlılığı → tek-tırnak sayımı → `;` yasağı), **üçü de bir sonraki turda atlatıldı**; `security` tur 5'te 24 vektörden **14 kaçış** ölçtü. Mekanizma yanlış, eşik değil. **ERTELENDİ → v0.0.14** (T-005 PM kararı: bu sürümün hiçbir AC'sinin yolu üstünde değil; `solid`'in T-005 önerisi — tarayıcı `DESTRUCTIVE_STATEMENT`+`EMPTY_MIGRATION_SET`'e daraltılsın — v0.0.14'te değerlendirilecek). | `architect`        | v0.0.14 | security                          |
| low    | `packages/db/src/__tests__/helpers/migration-set.ts`         | `ALTER TABLE … ADD COLUMN "tenant_id"` ile **sonradan** tenant'a bağlanan tablo tespit edilmiyor (PM Karar 2 ile bilinçli olarak v0.0.13'e bırakıldı). **Bağlayıcı not:** v0.0.13'ün şema linter'ı **canlı şemayı** (`pg_class.relrowsecurity` / `relforcerowsecurity`, `information_schema.columns`) okumazsa bu boşluğu **devralır** — yalnızca SQL metni okuyan bir linter kapatamaz (architect R-C2). **✅ kapandı (v0.0.13, dolaylı, T-005 K-E1).** Şema linter'ı artık canlı Postgres kataloğunu okuyor; kolonun nasıl geldiğinden bağımsız görüyor (PM kapsam kararı: "İÇİNDE (dolaylı)").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `architect`        | v0.0.13 | security                          |
| low    | `packages/db/src/__tests__/helpers/migration-set.ts`         | `ALTER TABLE … ADD COLUMN … NOT NULL`, **`TRUNCATE TABLE`**, **`ALTER TABLE … RENAME COLUMN`** bekçinin kapsamında **değil** (HEAD'den devralındı, T-004'ün ürünü **değil**). Tek adımda `ADD COLUMN … NOT NULL` yazılırsa bekçi yeşil verir ve migration mevcut satırlarda patlar. **ERTELENDİ → v0.0.14** (T-005 PM kararı: R-D1 ile birlikte ele alınacak).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `architect`        | v0.0.13 | security                          |
| low    | `packages/db/src/__tests__/helpers/migration-set-fixture.ts` | **`solid` T-004 tur 3'ten devredilen iki açık kalem** (gate tazeliği: `solid` dosyayı son kez **545 satır** hâlinde gördü; `security`'nin FAIL zincirini kapatan son düzeltme onu **666 satıra** çıkardı — `WORKFLOW.md:36` gereği yalnızca FAIL veren gate yeniden koştu). **(a)** `withTemporaryMigrationSet` **dört pozisyonel parametre**, ikisi opsiyonel → `undefined` delikleri; seçenek nesnesine (`{directories, rootFiles, rootSymlinks}`) çevrilmeli, **26 çağrı noktası** etkiliyor. **(b)** yorum güncelliği (satır/kural sayıları, çapraz referanslar) — T-004'te **üç tur** boyunca bayatladı. **R-D1 o dosyayı baştan yazacağı için aynı turda ele alınmalı**; R-D1 turunda **tam bir `solid` geçişi** önerilir. **ERTELENDİ → v0.0.14** (R-D1 ile birlikte, T-005 PM kararı).                                                                                                                                                                                                                                                                                                                                                                                                            | `architect`        | v0.0.13 | `solid` (T-004 tur 3) + `release` |

## Vadesi v0.0.4 (pino / AppError geldiğinde)

| SEV | Konum                                           | Açıklama                                                                                                                                                           | Sorumlu | Vade   | Kaynak gate |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------ | ----------- |
| low | `packages/db/src/seed.ts:103`                   | **✅ kapandı (v0.0.4).** Yığın izi kaybı `try-catch` yapısı ve `maskEmail` yardımcısı ile düzeltildi.                                                              | db      | v0.0.4 | solid       |
| low | `packages/db/src/seed.ts:95`                    | **✅ kapandı (v0.0.4).** stdout'a tam e-posta → `maskEmail` yardımcısı ile çözüldü.                                                                                | db      | v0.0.4 | security    |
| low | `packages/db/src/run-guarded-prisma.ts:154-161` | B yolu `throw`'ları `fail()`'den geçmeden fırlıyor → `[run-guarded-prisma]` + exit 1 deseni kırılır, ham yığın izi görünür. B yolu (A-V15) **hiç test edilmemiş**. | db      | v0.0.4 | solid       |

## Vadesi v0.0.5 — Kimlik doğrulama

**Çapraz not (v0.0.4'ten):** Onay #1 ile `x-arkesoft-tenant` üretimde yok sayıldığı ve host adı tek doğruluk kaynağı olduğu için, servisler arası güvenilir çağrı belirteci bu sürümde **tanımlanmak zorunda**. Ayrıca `RequestContext`'e `auth` alanı additive eklenecek ve auth muafiyet listesi tenant allowlist'inden **ayrı** tutulacak (`AUTH_EXEMPT_PATHS`).

| SEV       | Konum                                                                                                                | Açıklama                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Sorumlu   | Vade           | Kaynak gate            |
| --------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------- | ---------------------- |
| low       | `apps/api/src/tenancy/tenant.guard.ts:44` (dolaylı)                                                                  | Eşleşmeyen rotada global `APP_GUARD` **hiç koşmuyor** → yanıt `TENANT_NOT_FOUND` yerine `HTTP_EXCEPTION`; kimliksiz istemci bu ayrımdan **rota varlığını** çıkarıp API yüzeyini haritalayabilir. Tenant **varlığı** sızmıyor (AC8 bayt bayt doğrulandı).                                                                                                                                                                                                                                                                                                                                                                  | architect | v0.0.5         | security               |
| low       | `apps/api/src/tenancy/tenant-resolver.service.ts:88-90`                                                              | Çoklu `x-arkesoft-tenant` başlığı `reason: 'multiple_host_headers'` üretiyor — **yanlış katmanı söylüyor**; R4 telafisi #7'nin tek gözlem kanalı bu alan. v0.0.5'te additive `multiple_tenant_headers`.                                                                                                                                                                                                                                                                                                                                                                                                                   | backend   | v0.0.5         | solid                  |
| medium    | `apps/api/src/errors/error-mapping.ts:123` + `tenancy/tenant.guard.ts:38` + `tenancy/tenant-resolver.service.ts:223` | **Üç kopya `assertNever`**; üçü de aynı sebeple değişir (fırlatılan tip, log standardı, v0.0.17 `logLevel`). CLAUDE.md §4 bunu platform idiomu olarak adlandırıyor. **Dördüncü kopya v0.0.5 `AuthGuard`'da kesin gelir.** Öneri: tek `assertNever(value: never, context: string): never`.                                                                                                                                                                                                                                                                                                                                 | backend   | v0.0.5         | solid                  |
| — (kayıt) | `apps/api/src/auth/auth-instance.ts`                                                                                 | **T-006: "başarısızlıkta 503 döner" tasarımı GERÇEKLEŞTİRİLEMEDİ** — better-auth'un `runInBackgroundOrAwait` (`create-context.mjs:215-226`) mail gönderim hatasını **koşulsuz** yutuyor; `backgroundTasks.handler` tanımlansa bile kütüphanenin `.catch()`'i handler'a ulaşmadan tüketiyor. Kayıt uçları bu durumda **2xx** döner, belirti yalnızca logda (`causeCode: MAIL_DELIVERY_FAILED`). Architect'in orijinal tasarımından **ölçülmüş sapma** (backend FIX turu 2); davranış `docs/development.md`'de belgelendi ve `qa` tur4'te gerçek SMTP arızasıyla doğrulandı. İleri iş **gerektirmiyor** — kayıt amaçlı not. | architect | kayıt (v0.0.5) | backend FIX2 + qa tur4 |

## Vadesi v0.0.6 — tRPC sözleşme katmanı

| SEV    | Konum                                                                                        | Açıklama                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Sorumlu             | Vade   | Kaynak gate                    |
| ------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------ | ------------------------------ |
| medium | `apps/api/src/errors/error-mapping.ts:54-64`                                                 | `resolveAppErrorDetails()` **`instanceof` zinciriyle** alt sınıf tanıyor; `details` taşıyan her yeni `AppError` merkezi fonksiyonu düzenlemeyi zorunlu kılıyor. **"Bu hatanın `details`'i nedir" bilgisi `apps/api`'de kalıyor** → v0.0.6 `packages/trpc` ya kopyalar ya bağımlılık yönünü ters çevirir, **yani K-A2'nin `packages/errors` taşıma gerekçesinin yarısı geri alınmış**. `isAppError()`'ın yapısal dayanıklılığıyla da çelişiyor. Öneri: `details` üretimini sahibine taşı — `AppError`'da geçersiz kılınabilir `publicDetails` (varsayılan `{}` → AC8 güçlenir). **architect teyifi ister.**                                                                                              | architect + backend | v0.0.6 | solid                          |
| medium | `apps/api/src/__tests__/rate-limit.test.ts` (çapraz-dosya etkisi, ör. `concurrency.test.ts`) | **T-006: `pnpm test` hermetik değil.** Çok-dosya/çok-süreç `pnpm test` art arda (Redis flush'sız) koşulduğunda `platform:auth:*` sayaçları dosyalar arası sızıyor; her koşumda **farklı** dosyalar rastgele düşebiliyor (ölçüldü: `qa` tur2-4 `rate-limit.test.ts`; `release` ölçümünde aynı sınıf `concurrency.test.ts`'te). İzole koşumda (`vitest run <dosya>`) **her zaman** yeşil; `pnpm test` tek seferlik/flush sonrası koşumda **her zaman** 518/518. Kök neden: `createTestApp()`'in flush'ı dosya **başında** koşuyor ama dosyalar **paralel**. CI'da da aynı sınıf flakiness **beklenmeli**. Öneri: test-koşusuna-özgü Redis önek export'u (backend) + CI'da paralellik izolasyonu (devops). | backend + devops    | v0.0.6 | qa tur2-4 + Orkestratör ölçümü |
| low    | `infra/docker-compose.yml` + runbook                                                         | **T-006: host seviyesinde ikinci `redis-server` 6379'u dinliyor** → `docker stop arkesoft-redis` ile yapılan "Redis arızası" simülasyonu **gerçek bir arızayı simüle etmiyor**; bu yöntemle yapılmış ölçümler kanıt sayılamaz. Öneri: `infra:up`'a port çakışması kontrolü + runbook uyarısı.                                                                                                                                                                                                                                                                                                                                                                                                           | devops              | v0.0.6 | security tur3                  |
| low    | `apps/api/src/__tests__/shutdown.test.ts`                                                    | **T-002'den devreden flaky test, T-006 ile birleşik nihai oran ölçüldü: ~%5 (20 koşumda 1 başarısız).** T-006 bu testi **kötüleştirmedi**; dört gate turu boyunca ayrı ayrı ölçüldü. CLAUDE.md §6 "flaky test düzeltilir veya kaldırılır, ROADMAP takip kaydı olmadan `test.skip` yasak" — bu satır o takip kaydıdır.                                                                                                                                                                                                                                                                                                                                                                                   | backend             | v0.0.6 | qa tur1-4 (T-002 kaynaklı)     |

## Vadesi v0.0.11 — BullMQ kuyruk altyapısı

| SEV | Konum                                | Açıklama                                                                                                                                                    | Sorumlu | Vade    | Kaynak gate |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- | ----------- |
| low | `apps/api/src/redis/redis.module.ts` | `'error'` throttle penceresi (10 sn) sabit kod içi değer; BullMQ aynı istemciyi paylaşacağından hata işleme beklentisiyle uyumu **o sürümde doğrulanmalı**. | devops  | v0.0.11 | ST-6        |

## Vadesi v0.0.12 (CI geldiğinde)

| SEV | Konum                                                                | Açıklama                                                                                                                                                                       | Sorumlu                   | Vade    | Kaynak gate |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ------- | ----------- |
| low | `packages/db/prisma.config.ts:8` · `vitest.config.ts:11`             | **✅ kapandı (v0.0.12)** — `existsSync` vb. ile `.env` yokluğuna dayanıklı hale geldi.                                                                                         | db                        | v0.0.12 | solid       |
| low | `packages/db/package.json` `build`                                   | **✅ kapandı (v0.0.12, K-B6b)** — **T2-3** `rm -rf dist` yerine `find dist -mindepth 1 -maxdepth 1 ! -name generated` kullanıldı. `dist/generated` (Prisma istemcisi) korunur. | db                        | v0.0.12 | security    |
| low | `packages/config/package.json:36-42` · `packages/db/package.json:40` | **✅ kapandı (v0.0.12)** — **T2-4** `@arkesoft/config` lint-only dep'ler `devDependencies`'e taşındı. Üretim kapanışı ESLint zinciri taşımıyor.                                | devops (architect teyidi) | v0.0.12 | security    |
| low | A-V18 (`packages/db/src/guard-policy.ts` host allowlist)             | **✅ kapandı (v0.0.12, A-V21)** — GitHub `services:` Postgres/Redis localhost'a mapleniyor, allowlist karşılanıyor.                                                            | devops                    | v0.0.12 | architect   |

## Vadesi v0.0.13 — CI borçları (v0.0.12 gate sonuçları)

| SEV | Konum                              | Açıklama                                                                                                                                                                                                                                                                                                                                                                                                            | Sorumlu | Vade    | Kaynak gate |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- | ----------- |
| low | `scripts/` dizini                  | **T3-1** — Hiçbir workspace paketi değil → `pnpm lint`/`pnpm typecheck` göremiyor; `scripts/sync-platform-version.ts` CI'da denetimsiz. ST-5 geçici tsconfig ile elle doğruladı. Kalıcı çözüm: `scripts/` için tsconfig + eslint yapılandırması. **ERTELENDİ → v0.0.14** (kullanıcı onayı, 2026-10-29): v0.0.13'ün kapsamında (PM AC1–AC10) hiç yoktu ve ele alınmadı; bayat vade bırakmak yerine açıkça ertelendi. | devops  | v0.0.14 | solid       |
| low | `.github/` dizini                  | **T3-4** — `ci-gate.needs` listesi elle bakımlı. Yeni job eklenip listeye yazılmazsa o job'un kırmızısı toplayıcıyı yeşil bırakır (sahte yeşil). Mekanik koruma yazılmadı → PR şablonu madde + `docs/development.md` kuralı; düşük borç (R-7). **ERTELENDİ → v0.0.14** (kullanıcı onayı, 2026-10-29): aynı gerekçe — v0.0.13 kapsamı dışıydı.                                                                       | devops  | v0.0.14 | solid       |
| low | `.github/workflows/`               | **T3-2** — `actionlint` composite action'ların içini doğrulamıyor (ST-7 yerel kanıt). Kapsam `.github/workflows/*.yml` ile sınırlı; üç composite action'da `shell: bash` **elle** garanti edildi.                                                                                                                                                                                                                   | devops  | v0.0.16 | solid       |
| low | `packages/db/package.json` `build` | **T2-3b** — Diğer paketlerin `build` script'leri bayat `dist` içermez. Basit `rm -rf dist &&` prefix'le yeterli; `packages/db` ise spesial (`dist/generated` koruması). T2-3b **yeni düşük borç** olarak v0.0.13'e yazıldı.                                                                                                                                                                                         | devops  | v0.0.13 | security    |

## Vadesi v0.0.14 — RLS/tenant izolasyon borcu (T-005 gate sonuçları)

**Not:** T-005 (v0.0.13) gate turu 3'te üçü de PASS verdi; aşağıdakiler bilinçli olarak ertelenen `low` ve 1 `medium` bulgudur — AC'lerin yolu üstünde değil. `multer` GHSA-q7qp-rjg7-q26m (v0.0.16) T-005 tarafından **getirilmedi** (`pnpm-lock.yaml` diff'i boş); T-006 (v0.0.5) de yeniden ölçtü ve **yine getirmedi** — burada tekrar edilmiyor, bkz. [Vadesi v0.0.16 — Medya ve dosya servisi](#vadesi-v0016--medya-ve-dosya-servisi).

| SEV    | Konum                                                                                                                                                                        | Açıklama                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Sorumlu        | Vade    | Kaynak gate                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------- | ---------------------------- |
| medium | `packages/db/src/catalog-lint.ts` (politika kuralları)                                                                                                                       | `pg_policies.permissive`/`cmd` okunmuyor → tek `AS RESTRICTIVE` politika 20 kuraldan temiz geçiyor. **Fail-closed ölçüldü** (`restrictive_only_rowcount=0` — PERMISSIVE yokken RESTRICTIVE erişim vermiyor, sızıntı değil) ama kural eksikliği duruyor. Architect kararı ister.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | architect      | v0.0.14 | security                     |
| low    | `packages/db/src/catalog-lint.ts` `lintMigrationsLedgerPrivilege`                                                                                                            | `privileges` satırı yoksa sessizce `[]` dönüyor — tek fail-**open** dal. Bugün erişilemez (`readPrivileges` `pg_tables`'ı geziyor).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | db             | v0.0.14 | solid                        |
| low    | `packages/db/src/run-guarded-prisma.ts:88`                                                                                                                                   | Korumasız `loadEnvFile`. Kardeş dosya `existsSync` ile koruyor; bugün kırmızı değil (`vitest list` import'ları koşturmuyor; test koşan tek hat zaten `.env` üretiyor).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | db             | v0.0.14 | solid                        |
| low    | `packages/db/src/__tests__/guard-policy.test.ts`                                                                                                                             | "Tam olarak bir komut muaf" (`migrate deploy`) invariant testi yok — altı komut ayrı ayrı pinli; 7. komut yanlışlıkla `false` ile inerse hiçbir test kırılmaz.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | db             | v0.0.14 | qa                           |
| low    | `packages/db/src/bootstrap-roles.ts:177`                                                                                                                                     | `main()` import anında koşuyor — FIX 1'in kapattığı `run-guarded-prisma.ts` boşluğunun ikizi. `index.ts` bu dosyayı dışa açmadığı için bugün erişilemez.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | db             | v0.0.14 | solid                        |
| low    | `packages/db/src/catalog-lint.ts` `readRowSecurity`                                                                                                                          | `relkind='r'` filtresi bölümlenmiş (`p`) tabloyu kaçırıyor. Fail-closed yön (`RLS_NOT_ENABLED` düşer); bugün bölümlenmiş tablo yok.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | db             | v0.0.14 | solid                        |
| low    | `packages/db/src/catalog-lint.ts` (`lintTenantScopedTable` 167 satır, tur 1: 101 · dosya 587, tur 1: 346)                                                                    | 20'nci kural (politika kanonik eşitliği) kendi fonksiyonunu almadı; fonksiyon ve dosya büyümesi. Sonraki kural eklenirse `medium`'a döner.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | db             | v0.0.14 | solid                        |
| low    | `packages/db/sql/bootstrap-roles.sql` (20'nci kural / `REVOKE`)                                                                                                              | 20'nci kural (`_prisma_migrations` fazla DML yetkisi) yalnızca fixture kapsamında test ediliyor, canlı prob yok. `REVOKE`'un etkisi ampirik doğrulandı ama linter kuralı için canlı katalog senaryosu eksik.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | db             | v0.0.14 | qa                           |
| medium | `packages/db/src/__tests__/helpers/migration-set.ts` + ikiz CLI (`bootstrap-roles.ts`/`run-guarded-prisma.ts`)                                                               | Tur 2'den devam eden dört kalem: indeks kuralı çelişkisi (`migration-set.ts` UNIQUE+≥2 kolon ↔ `catalog-lint.ts` herhangi bir indeks) · ikiz CLI ~70 satır tekrar (`src/prisma-cli.ts` çıkarımı önerisi) · çıplak `throw new Error` yerine `AppError` (architect kararı ister) · `apps/api` tip pin'inin `type-pins/` konvansiyonuna taşınması.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | architect + db | v0.0.14 | solid                        |
| low    | `packages/db/package.json` `deploy` + `.github/actions/prepare-db/action.yml`                                                                                                | `db:deploy` için dar onay kapısı — yeni guard CI'ın doğru rolle bağlanan değişkeni set etmesini ister; bu bir gerileme değil ama hattı kırabilecek bir bağımlılık.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | devops + db    | v0.0.14 | qa                           |
| medium | `packages/db/src/client.ts:136-139` (`AppPrismaDatabase` `Pick<>` allowlist) + `apps/api/src/prisma/prisma.service.ts:74` + `packages/db/src/index.ts:29`/`prisma.module.ts` | **T-006: "R-1 kararı"nın (ADR-0008) kapsam boşluğu, büyüdü.** `account`/`session`/`verification` tip seviyesinde `Pick<>` allowlist ile korunuyor (beş kaçış kapısı kapandı), ama **altıncı kapı AÇIK ve belgelenmiş**: allowlist üyesi `$queryRaw` herhangi bir `PrismaService` enjekte eden serviste tek satırla **tüm hash'leri/belirteçleri** okuyabiliyor (çalışma zamanında ölçüldü: 2830 parola hash'i). Ayrıca `PrismaService.client` TS `private`'ı çalışma zamanında yok (`as unknown as` ile aşılabiliyor, ölçüldü: 2894 satır) ve `withTenant`'ın dışa açık tam istemci token'ı (latent, DI çözülemiyor ama tek satırlık bir `exports` değişikliğiyle açılabilir). **Hiçbiri bugün sömürülen bir açık değil** — hepsi tip+lint+test ile kapalı veya DI ile latent. v0.0.14'ün `arkesoft_auth` rolü + kolon bazlı `GRANT`/`REVOKE` bu sınıfı veritabanı seviyesinde kapatacak. Ek öneri (≈6 satır, davranış değişikliği yok): `health.ts`'in `$queryRaw` erişimini `AppPrismaDatabase`'den ayrı, tek üyeli bir `connectionProbe` erişimcisine taşı. | architect + db | v0.0.14 | security tur3/4 + solid tur4 |

## Vadesi v0.0.15 — İki faktörlü doğrulama ve oturum güvenliği

| SEV    | Konum                                              | Açıklama                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Sorumlu | Vade    | Kaynak gate                 |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- | --------------------------- |
| medium | `apps/api/src/auth/rate-limit/rate-limit.guard.ts` | **T-006: IP bazlı oran sınırlama sayacı yalnızca "başarısız" değil, BAŞARILI istekleri de sayıyor** (K3 metni "20 **başarısız**" diyor). Hesap bazlı sayaç başarılı girişte iade ediliyor (`DECR`, `solid`/`security` doğruladı) ama **yalnızca `sign-in` rotasında**; mail gönderen üç uçta (kayıt, doğrulama e-postası, şifre sıfırlama) 2xx'in kendisi sayacı tüketiyor. `backend` sıfırlamayı **bilinçli reddetti** (paylaşılan IP'de saldırganın sayacı sıfırlamasını önlemek için); `solid` ve `security` bu kararı kabul etti. | backend | v0.0.15 | solid tur1/2, security tur2 |
| low    | `apps/api/src/auth/auth-instance.ts:219`           | `providerErrorCode: typeof record['code'] === 'string' ? record['code'] : undefined` — uzunluk sınırı ve allowlist yok; düşmanca/hatalı yapılandırılmış bir SMTP sağlayıcısı serbest metin (PII dahil) koyarsa loga ham geçer. Öneri: `z.string().regex(/^[A-Z_]{1,32}$/)` veya bilinen kodların allowlist'i.                                                                                                                                                                                                                         | backend | v0.0.15 | security tur3/4             |

## Vadesi v0.0.16 — CI teknoloji borçları (v0.0.12 gate sonuçları)

| SEV | Konum             | Açıklama                                                                                                                                                                                                       | Sorumlu | Vade    | Kaynak gate |
| --- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- | ----------- |
| low | `.github/` yapısı | **T3-3** — CI duvar saati bütçesi yok. `perf` gate'i bu Task'ta koşmadı; `test` job'u `cache: false` → doğruluk pahasına.                                                                                      | devops  | v0.18.0 | solid       |
| low | `.github/` yapısı | **T3-5** — Literal-grep tuzağı (T-002 ST-1, ST-3b, T-003 ST-6, ST-7 ile sekiz toplam). Kural: jeton yasağı denetleyen bir kontrol, kendi metninde o jetonu bitişik yazamaz. `AGENT_BASELINE.md` §5'e not ekle. | devops  | kapalı  | solid       |

## Vadesi v0.0.14 / v0.1.0 — iş kuralı eksikleri

| SEV | Konum                                     | Açıklama                                                                                                                                                                                            | Sorumlu | Vade    | Kaynak gate |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- | ----------- |
| low | `packages/db/prisma/schema.prisma:79-80`  | **R-A10** — `onDelete: Cascade` çifti, kullanıcı hard delete'inde tenant'ın **son `owner` üyeliğini sessizce siliyor** → sahibi olmayan tenant. v0.0.14 "son owner silinemez" kuralı + owner devri. | db      | v0.0.14 | security    |
| low | `packages/db/prisma/schema.prisma` `slug` | **R-A11** — `slug` tekilliği harf duyarlı; `Demo` ve `demo` birlikte var olabilir. Normalizasyon v0.1.0 uygulama katmanı sorumluluğu.                                                               | backend | v0.1.0  | architect   |

## Vadesi v0.0.16 — Medya ve dosya servisi

| SEV    | Konum                                      | Açıklama                                                                                                                                                                                | Sorumlu   | Vade                                                                                                                                                                                                                                                                                                                                                  | Kaynak gate |
| ------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| medium | `pnpm-workspace.yaml:101` → `multer@2.4.0` | **`pnpm audit` 1 HIGH: GHSA-q7qp-rjg7-q26m** (multer ≥2.0.0 <2.5.0) — istek teardown'ından sonra askıda kalan async `fileFilter` → **DoS**. **v0.0.4'te SOMUT DEĞİL** (`FileInterceptor | multipart | multer`grep → 0, CI yok) → bu yüzden`high`değil`medium`. **v0.0.16 multipart'ı açınca SOMUTLAŞIR.** Düzeltme: kök `package.json`→`pnpm.overrides` `multer: ">=2.5.0"`+`pnpm audit`'i beşli kapıya eklemek. **T-006 (v0.0.5) de yeniden ölçtü — `pnpm-lock.yaml`diff'i boş, T-006 yeni`high` getirmedi, durum DEĞİŞMEDİ** (AC11 "mevcut 1'i aşmıyor"). | devops      | v0.0.16 | security |

## Vadesi v0.0.17 — Gözlemlenebilirlik ve hata yönetimi

| SEV | Konum                                                | Açıklama                                                                                                                                                                                                                      | Sorumlu | Vade    | Kaynak gate |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- | ----------- |
| low | `apps/api/src/logging/arkesoft-nest-logger.ts:49-51` | Nest `optionalParams`'ı `context` log alanına yazılıyor; `AppError.context` aynı alanı farklı anlamda kullanıyor → **tek log alanı iki anlam**, v0.0.17 Loki sorgularında belirsizlik. Öneri: Nest tarafını `nestParams` yap. | backend | v0.0.17 | solid       |

## Vadesi v0.18.0 — Çoklu dil ve para birimi altyapısı

| SEV | Konum                                         | Açıklama                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Sorumlu            | Vade    | Kaynak gate |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------- | ----------- |
| low | `apps/api/src/health/health.controller.ts:64` | `/health/ready` kimlik doğrulamasız, tenant'tan muaf ve **her istekte gerçek DB (`SELECT 1`) + Redis (`PING`) I/O** yapıyor; oran sınırı yok → kimliksiz sel **tenant trafiğiyle paylaşılan Prisma havuzunu** tüketebilir. 503 gövdesi altyapı topolojisini, `/health` platform sürümünü anonim açıyor. v0.0.4'te public yüzey yok (ingress v0.18.0) + `withTimeout(2000)` → low. Öneri: ilk public dağıtımdan önce ingress'ten çıkar (k8s probe) veya IP bazlı ucuz sınır. | devops + architect | v0.18.0 | security    |
| low | A-A7 · `X-Forwarded-Host` okunmuyor           | Üretim ingress'i `Host`'u korumak **zorunda**. Korumayan topoloji seçilirse bu karar **yeniden değerlendirilmeli**.                                                                                                                                                                                                                                                                                                                                                         | devops             | v0.18.0 | architect   |

## Vadesiz — test kapsamı ve kod kalitesi borçları (ilk uygun sürümde)

| SEV    | Konum                                                                                      | Açıklama                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Sorumlu                                                                                                                                                                                      | Vade    | Kaynak gate |
| ------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------- |
| low    | `packages/db/src/errors.ts`                                                                | `isUniqueConstraintError` yalnızca pozitif (P2002) yoldan test ediliyor; P2002-dışı kod / `null` / `undefined` / primitive girdiler test edilmemiş (üretim kodu doğru).                                                                                                                                                                                                                                                                                    | db                                                                                                                                                                                           | vadesiz | qa          |
| low    | `packages/db/src/guard-policy.ts:239-278` · `guard-policy.test.ts:76,84`                   | `resolveExtraArgs` altı ret sebebi için neredeyse aynı mesajı üretiyor → testler hangi dalın reddettiğini ayırt edemiyor. "Boş veritabanı adı" dalı silinse bile testler yeşil kalır.                                                                                                                                                                                                                                                                      | db                                                                                                                                                                                           | vadesiz | solid       |
| low    | `packages/db/src/__tests__/migration-sql.test.ts:81-112`                                   | Üç `for` döngüsünde "en az bir kez döndü" güvencesi yok → `extractCreatedTableNames` boş dönerse testler **sıfır assertion ile yeşil** geçer.                                                                                                                                                                                                                                                                                                              | db                                                                                                                                                                                           | vadesiz | solid       |
| low    | `packages/db/src/run-guarded-prisma.ts:175-184` · `seed.ts:50-53` · `test-client.ts:24-26` | Ayrımlı birleşim yalnızca `if (kind === 'reject')` ile daraltılıyor; üçüncü varyant eklenirse üç çağrı yeri **fail-open** olur. CLAUDE.md §4 exhaustive `switch` + `assertNever` istiyor.                                                                                                                                                                                                                                                                  | db                                                                                                                                                                                           | vadesiz | solid       |
| low    | `packages/db/src/env.ts:36-40` · `run-guarded-prisma.ts:47-51`                             | İki yorum kodla çelişiyor: "tek `if (NODE_ENV==='production')` ile değil" diyor ama tam o kontrol var; "üç dizin altında" diyor ama bir dizin altında. Yanlış yorum doğru koddan tehlikeli.                                                                                                                                                                                                                                                                | db                                                                                                                                                                                           | vadesiz | solid       |
| low    | `packages/db/prisma.config.ts:30-38`                                                       | Yorum bayat: artık var olmayan `seed` script'ini aktarıyor; `docs` bu yoruma bakarsa yanlış belge yazar.                                                                                                                                                                                                                                                                                                                                                   | db                                                                                                                                                                                           | vadesiz | solid       |
| low    | `packages/db/src/__tests__/tenant.test.ts:16-31` · `membership.test.ts:21-31`              | Temizlik defteri iki dosyada birebir aynı 13 satır. `createCleanupRegistry()` helper'ı önerilir.                                                                                                                                                                                                                                                                                                                                                           | db                                                                                                                                                                                           | vadesiz | solid       |
| low    | `packages/db/src/run-guarded-prisma.ts:174` · `seed.ts:49` · `test-client.ts:23`           | `ARKESOFT_CONFIRM_DESTRUCTIVE` üç yerde doğrudan `process.env`'den okunuyor; `env.ts` kendini "tek nokta" diye tanımlıyor. `readDestructiveConfirmation()` eklenmeli.                                                                                                                                                                                                                                                                                      | db                                                                                                                                                                                           | vadesiz | solid       |
| low    | `packages/db/src/guard-policy.ts:297-298`                                                  | **T2-2** — bilinmeyen-komut dalı `argv.join(' ')` ile tüm argv'yi yazıyor; "değer yazma" yasağı yalnızca bayrak dalında. Repo script yüzeyinden erişilemez ama CI logu bağlantı dizesi görebilir.                                                                                                                                                                                                                                                          | db                                                                                                                                                                                           | vadesiz | security    |
| low    | `packages/db/src/__tests__/migration-sql.test.ts:56-58`                                    | **✅ kapandı (T-004).** Yorum yıkıcı ifade taraması kapsamı ile tutarlı hale geldi — her migration kümesi artık okunuyor.                                                                                                                                                                                                                                                                                                                                  | db                                                                                                                                                                                           | vadesiz | solid       |
| low    | `packages/db/src/__tests__/helpers/test-client.ts`                                         | Seed'lenmiş DB ön koşulunu bildiren teşhis yok → boş DB'de `expected null not to be null`.                                                                                                                                                                                                                                                                                                                                                                 | db + qa                                                                                                                                                                                      | vadesiz | solid + qa  |
| low    | `.prettierignore`                                                                          | **`pnpm format:check` ajan çıktısı dosyalarını kapsamıyor** — `.claude/workflow/reviews/*.md`, `.changeset/*.md`, `docs/adr/*.md` prettier markdown biçimine (tablo hizalaması) uymuyor. T-004'ten (`qa` B7) devreden, T-006'da kapsam `.changeset/**` ve `docs/adr/**`'e **genişledi**. Üretim kodu her zaman temiz; ilk uygun sürümde `.prettierignore`'a bu dizinler eklenmeli.                                                                         | devops                                                                                                                                                                                       | vadesiz | qa (B7)     |
| low    | `packages/config/eslint/base.js:42-47`                                                     | React ve Prisma yorum blokları araya boş satır konmadan birleşmiş; hangi yorumun hangi `paths` girdisine ait olduğu belirsiz.                                                                                                                                                                                                                                                                                                                              | devops                                                                                                                                                                                       | vadesiz | solid       |
| low    | `packages/db/src/__tests__/` (genel)                                                       | Enum değerleri (`suspended`, `provisioning`, `admin`, `staff`, `support`, `readonly`) runtime'da hiç egzersiz edilmemiş; `seed.ts`'in kısmi başarısızlık/rollback senaryosu test edilmemiş; `createPrismaClient` için dedike birim testi yok.                                                                                                                                                                                                              | db                                                                                                                                                                                           | vadesiz | qa          |
| medium | `apps/api/src/redis/redis.service.ts:30-44`                                                | `quit()` zaman aşımına uğrayıp `disconnect()` **sert-kapanış** dalına düşme senaryosu **testsiz** (AC11 yalnızca Prisma/pg'yi deterministik ölçüyor). Davranış kod okumasıyla doğru bulundu.                                                                                                                                                                                                                                                               | backend                                                                                                                                                                                      | vadesiz | qa          |
| medium | `apps/api/src/tenancy/tenant.guard.ts:49-68` + `tenant-context.middleware.ts:48-59`        | `failed`/`pending` dalları ve middleware `catch` bloğu **hiçbir test tarafından tetiklenmiyor** — **R4 telafisinin merkezi dalı**. qa probuyla davranış doğru bulundu.                                                                                                                                                                                                                                                                                     | backend                                                                                                                                                                                      | vadesiz | qa          |
| low    | `apps/api/src/tenancy/tenant-exempt-paths.ts:36-42`                                        | `isTenantExemptPath` WHATWG `new URL()` ile yol üretiyor ve **nokta-segmentlerini düşürüyor**; Express ham hedefi eşliyor → `/./health`, `/admin/../health`, `/health/.`, `health`, `http://evil.com/health`, `/health#x` **muaf sayılıyor**. Etkin muafiyet yüzeyi "küme tam olarak 2 eleman" garantisinden **geniş** (R4 telafisi #2). Bugün sömürülemiyor (yönlendirici eşleşmiyor; tenant'a bağlı handler'a ulaşılsa `getTenantContext()` fırlatıyor). | backend + qa                                                                                                                                                                                 | vadesiz | security    |
| low    | `apps/api/src/tenancy/tenant-resolver.service.ts:101,145`                                  | `x-arkesoft-tenant` değeri `SLUG_PATTERN`'den **geçmeden** `findUnique` argümanı oluyor. Ampirik zararsız (5000 karakter, `x' OR 1=1 --`, `../../etc/passwd`, `%00` → dördü de 404, sorgu parametreli, yol yalnızca non-production) ama CLAUDE.md §4 ihlali ve **tek savunma katmanında asimetri** (host yolu `SLUG_PATTERN` uyguluyor, bu yol uygulamıyor).                                                                                               | backend                                                                                                                                                                                      | vadesiz | security    |
| low    | `apps/api/src/request-context/request-id.ts:33-43`                                         | Desene uyan istemci `x-request-id`'si olduğu gibi kabul ediliyor → saldırgan başka bir isteğin id'sini göndererek **log korelasyonunu bulanıklaştırabilir**. CRLF/kontrol karakteri/dizi/uzunluk **doğru kapatılmış** (17 vektör). Öneri: `requestIdSource: 'client'                                                                                                                                                                                       | 'generated'`.                                                                                                                                                                                | backend | vadesiz     | security                                                                  |
| low    | `apps/api/src/__tests__/bootstrap.test.ts`                                                 | AC2'nin "host yok / geçerli / bilinmeyen" **üç varyantı** açık HTTP testiyle kanıtlanmıyor (qa probu üçünün de 200 döndüğünü doğruladı).                                                                                                                                                                                                                                                                                                                   | backend                                                                                                                                                                                      | vadesiz | qa          |
| low    | `apps/api/src/config/platform-version.ts:31-35`                                            | Bozuk `package.json` davranışı **testsiz**.                                                                                                                                                                                                                                                                                                                                                                                                                | backend                                                                                                                                                                                      | vadesiz | qa          |
| low    | `apps/api/src/errors/app-exception.filter.ts:38`                                           | ALS context'siz savunma dalı **testsiz** (şu an erişilemez dal).                                                                                                                                                                                                                                                                                                                                                                                           | backend                                                                                                                                                                                      | vadesiz | qa          |
| low    | `apps/api/src/request-context/request-id.ts:29-39`                                         | Çoklu `x-request-id` başlığı / sınır uzunluk durumları için dedike birim test yok.                                                                                                                                                                                                                                                                                                                                                                         | backend                                                                                                                                                                                      | vadesiz | qa          |
| low    | `apps/api/src/health/health-check.types.ts:17`                                             | `name: 'database'                                                                                                                                                                                                                                                                                                                                                                                                                                          | 'redis'` union'ı **somut sağlayıcıları sayıyor**; dosyanın yorumu "v0.0.11 queue additive, çekirdek değişmez" diyor ama bu satır **değişmek zorunda** (union test yardımcılarına da sızmış). | backend | vadesiz     | solid                                                                     |
| low    | `apps/api/src/logging/request-logging.interceptor.ts:62-66`                                | Yorum "fallback'te bile her kayıtta `requestId`" diyor; kod `requestContext?.requestId` yazıyor → context yoksa pino alanı **hiç koymaz**. **Yorum kodun tersini iddia ediyor.**                                                                                                                                                                                                                                                                           | backend                                                                                                                                                                                      | vadesiz | solid       |
| low    | `packages/errors/src/app-error.ts:89-106`                                                  | `isAppError()` `error is AppError` vaat ediyor ama yapısal yedek **5 alandan 3'ünü** doğruluyor; tüketici `isRetryable`/ `context` okuyor (runtime'da `undefined` olabilir), `httpStatus` **aralık kontrolsüz** ve doğrudan `httpAdapter.reply()`'a gidiyor.                                                                                                                                                                                               | backend                                                                                                                                                                                      | vadesiz | solid       |
| low    | `apps/api/src/request-context/request-context.accessors.ts:70,75`                          | `getTenantId()`/`getLogger()` dışa açık ama bu sürümde **çağrısız ve testsiz**; `getLogger()`'ın fail-closed davranışı doğrulanmamış.                                                                                                                                                                                                                                                                                                                      | backend                                                                                                                                                                                      | vadesiz | solid       |
| low    | `apps/api/src/index.ts:3`                                                                  | "NestJS uygulaması v0.0.4'te kurulacak" yorumu **güncelliğini yitirdi**; `PACKAGE_NAME` export'u tüketilmiyor.                                                                                                                                                                                                                                                                                                                                             | backend                                                                                                                                                                                      | vadesiz | solid       |
| low    | `apps/api/src/__tests__/resolve-host.test.ts:221,232`                                      | İki assertion **davranış değil test dosyasını/imzayı** ölçüyor (`cases.length >= 25`, `resolveHost.length === 2`); ikincinin yorumu "derleme-zamanı kanıt" diyor ama **runtime arity** kontrolü.                                                                                                                                                                                                                                                           | backend                                                                                                                                                                                      | vadesiz | solid       |
| low    | `apps/api/src/__tests__/helpers/create-test-app.ts:69-74`                                  | `purpose` alanı yalnızca `no-extraneous-class`'ı susturuyor (hiçbir yerde okunmuyor) ve yorum **tersini** iddia ediyor; repo aynı sorun için daha görünür desene sahip (gerekçeli `eslint-disable-next-line`).                                                                                                                                                                                                                                             | backend                                                                                                                                                                                      | vadesiz | solid       |
| low    | `apps/api/src/__tests__/{log-correlation,concurrency}.test.ts`                             | `'finish'` olayında yazılan `requestId`/`tenantId` atfı yalnızca **tek istekli** testlerle doğrulanmış; 20 eşzamanlı istek testi yalnızca yanıt gövdelerini kontrol ediyor → ST-4'ün spesifikasyondan ayrıştığı noktanın **kanıtsız kalan ayağı**. Öneri: eşzamanlılık testine bellek stream'i ekleyip 20 kaydın `requestId`×`tenantId` çiftlerinin ayrık/doğru olduğunu assert et.                                                                        | qa + backend                                                                                                                                                                                 | vadesiz | solid       |
| low    | `apps/api` test süiti                                                                      | **`MaxListenersExceededWarning`** (`process.stdout`/`stderr`) — test başarısını etkilemiyor (exit 0), muhtemelen art arda kurulan çok sayıda `createTestApp()` örneğinden.                                                                                                                                                                                                                                                                                 | backend                                                                                                                                                                                      | vadesiz | ST-7        |
| low    | `apps/api/src/__tests__/shutdown.test.ts`                                                  | Her koşuda `tsc -p tsconfig.build.json` ile `dist`'i **tazeliyor** (~0.5–3 sn); CI'da toplam test süresine sabit maliyet.                                                                                                                                                                                                                                                                                                                                  | backend                                                                                                                                                                                      | vadesiz | ST-7        |
| low    | Node 25.8.1 × `vitest@5.0.5` engine aralığı (T-001)                                        | **R3 hâlâ açık.** ROADMAP A1'in "v0.0.4'ten önce yerel kurulumun 24 LTS'e çekilmesi" önerisi **uygulanmadı**; ST-0 spike'ı `npm warn EBADENGINE` ile bunu ampirik olarak gözledi (`required: ^22.12.0                                                                                                                                                                                                                                                      |                                                                                                                                                                                              | ^24.0.0 |             | >=26.0.0`, `current: v25.8.1`). Üç soru yine de geçti, bloke edici değil. | devops | vadesiz | ST-0 |

## Kapsam dışı kalan artık risk (bilinçli, architect beyanı — T-001)

Guard **repo script yüzeyini** korur, keyfi çağrıları korumaz: `pnpm exec prisma db push --url=…`
ve `npx prisma …` guard'sızdır. Gerçek savunma **kimlik bilgisi ayrımıdır** (geliştirici
kabuğunda üretim `DATABASE_URL` bulunmaması + v0.0.13'ün süper olmayan uygulama rolü + v0.0.12 CI
sırları). **Guard bir hız kesicidir, izolasyon sınırı değildir.**

---

## Nasıl ilerliyoruz

1. Bu dosya ve `CLAUDE.md` onaylanır.
2. "v0.0.1'i uygula" denir; yalnızca o versiyonun kapsamı yapılır.
3. Kabul kriteri çalıştırılır ve çıktısı gösterilir.
4. Changeset eklenir, `CHANGELOG.md` güncellenir, bu dosyadaki kutular işaretlenir.
5. Sonraki versiyona geçilir.

Kapsam dışına çıkmak gerekirse önce sorulur; versiyon bölünmesi gerekiyorsa yeni bir patch versiyonu bu dosyaya eklenir.
