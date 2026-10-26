# CLAUDE.md — Arkesoft Platform

> Bu dosya her oturumda okunur. Kod yazmaya başlamadan önce ilgili bölümleri gözden geçir.
> Yol haritası ve versiyon disiplini için `ROADMAP.md`, mimari kararlar için `docs/adr/` dosyalarına bak.

---

## 1. Proje özeti

Arkesoft, Türkiye pazarına yönelik çok kiracılı (multi-tenant) bir SaaS e-ticaret ve kurumsal web sitesi platformudur. Müşteri panele girer, tema seçer, "Siteyi Kur" der ve dakikalar içinde kendi alan adında (veya `musteri.arkesoft.app` alt alan adında) SSL'li, ödeme ve kargo entegrasyonlu bir site elde eder. IdeaSoft, ikas ve Ticimax'in çözdüğü problemleri çözüyoruz; ayrıştığımız nokta **her şeyin versiyonlanması**: platform çekirdeği, tema sözleşmesi, her tema ve public API ayrı semver taşır. Müşteri hangi versiyonda olduğunu görür, güncellemeyi kendisi uygular ve bozulursa geri alır (rollback).

---

## 2. Teknoloji yığını — tartışma, uygula

| Katman              | Teknoloji                                             |
| ------------------- | ----------------------------------------------------- |
| Dil                 | TypeScript (strict, her yerde)                        |
| Backend API         | NestJS                                                |
| Vitrin              | Astro (SSR, React adaları)                            |
| Admin + süper admin | Vite + React + TanStack Router + shadcn/ui + Tailwind |
| API tip paylaşımı   | tRPC (NestJS adaptörü)                                |
| Veritabanı          | PostgreSQL (tek DB, `tenant_id` + RLS)                |
| ORM                 | Prisma                                                |
| Önbellek / kuyruk   | Redis + BullMQ                                        |
| Arama               | Meilisearch                                           |
| Depolama            | S3 uyumlu (dev: MinIO, prod: Cloudflare R2)           |
| Kimlik doğrulama    | Better Auth                                           |
| Monorepo            | Turborepo + pnpm workspaces                           |
| Test                | Vitest + Playwright                                   |
| Altyapı kodu        | Pulumi (TypeScript)                                   |
| Konteyner           | Docker (dev: compose), Kubernetes + Helm (prod)       |
| CI/CD + sürüm       | GitHub Actions + Changesets                           |
| Gözlemlenebilirlik  | OpenTelemetry + Sentry + Grafana/Loki                 |
| Lint/format         | ESLint (strict) + Prettier                            |

### Yasaklar

- **Next.js kullanılmayacak.** Hiçbir koşulda.
- **Tipsiz JavaScript dosyası yazılmayacak.** `.js`/`.jsx` kaynak dosyası yok (üretilen çıktılar hariç).
- **`any` yasak.** Bilinmeyen için `unknown` + daraltma (narrowing) kullan. Kaçınılmaz durumda `// eslint-disable-next-line` + gerekçe yorumu + ilgili ROADMAP versiyonuna not.
- **Sınıf tabanlı React bileşeni yasak.** Fonksiyon bileşeni + hook.
- **`as` ile tip zorlama** (type assertion) yalnızca runtime doğrulamasından (Zod) hemen sonra kabul edilir.
- **Yeni ana bağımlılık** eklemeden önce `ROADMAP.md`'de gerekçesi yazılacak ve onay alınacak.
- **Para birimi float ile tutulmayacak.** Tamsayı kuruş + `Money` değer nesnesi.
- **Kart verisi loglanmayacak, saklanmayacak.**
- **`tenant_id` filtresiz sorgu yazılmayacak.**

---

## 3. Monorepo haritası

```
arkesoft/
├── apps/
│   ├── api/            # NestJS — tüm iş mantığı, tRPC router'ları, worker
│   ├── admin/          # Vite+React — tenant yönetim paneli
│   ├── superadmin/     # Vite+React — Arkesoft iç paneli
│   └── storefront/     # Astro SSR — çok kiracılı vitrin, tema runtime
├── packages/
│   ├── db/             # Prisma şeması, migration, seed, RLS politikaları
│   ├── errors/         # AppError hiyerarşi tabanı, hata gövdesi tel sözleşmesi, redaction
│   ├── trpc/           # Router tipleri, Zod şemaları, istemci factory
│   ├── ui/             # Paylaşılan shadcn bileşenleri, şema→form motoru
│   ├── theme-sdk/      # Tema sözleşmesi, theme.json şeması, migration API
│   ├── integrations/   # Ödeme, kargo, e-fatura, SMS, pazaryeri adaptörleri
│   ├── versioning/     # Semver karşılaştırma, uyumluluk, N-2 penceresi
│   ├── i18n/           # Mesaj katalogları, Money, Intl biçimlendiriciler
│   ├── config/         # eslint, tsconfig, tailwind preset, env şeması
│   └── themes/
│       ├── modern/     # e-ticaret teması (kendi semver'i)
│       └── corporate/  # kurumsal site teması (kendi semver'i)
├── infra/              # Pulumi, Helm, docker-compose
├── docs/               # ADR'ler, runbook'lar, geliştirme notları
├── CLAUDE.md
├── ROADMAP.md
└── CHANGELOG.md
```

### Sorumluluk sınırları

| Paket                            | Yapar                                                                 | Yapmaz                                                |
| -------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------- |
| `apps/api`                       | İş mantığı, yetkilendirme, kuyruk işleri, tRPC router implementasyonu | Sunum (presentation) mantığı                          |
| `apps/admin` / `apps/superadmin` | Sunum, form durumu, istemci tarafı doğrulama                          | İş kuralı; doğrulama her zaman sunucuda tekrar edilir |
| `apps/storefront`                | Tema render, SEO, önbellek                                            | Yazma işlemi (API üzerinden gider)                    |
| `packages/db`                    | Şema, migration, RLS, seed                                            | İş mantığı                                            |
| `packages/errors`                | `AppError` hiyerarşi tabanı, hata gövdesi tel sözleşmesi, redaction   | Domain hatası tanımı; i18n çözümlemesi; log yazma     |
| `packages/trpc`                  | Sözleşme (girdi/çıktı şemaları) ve tipler                             | İş mantığı                                            |
| `packages/theme-sdk`             | Tema sözleşmesi ve doğrulama                                          | Tenant verisine erişim                                |
| `packages/integrations`          | Dış sağlayıcı adaptörleri                                             | Veritabanına yazma — sonucu çağırana döner            |
| `packages/ui`                    | Sunum bileşenleri                                                     | Veri çekme, tRPC bağımlılığı                          |

**Bağımlılık yönü:** `apps/*` → `packages/*`. Paketler arası döngüsel bağımlılık yasak. `packages/ui` hiçbir uygulamaya veya `trpc`'ye bağımlı olmaz. **`packages/errors` hiçbir iç pakete bağımlı değildir** (yalnızca `zod`).

---

## 4. Kod standartları

### Dil

- **Kod, değişken, fonksiyon, tip, dosya adları: İngilizce.**
- **Yorum, dokümantasyon, commit açıklaması, kullanıcıya dönük metin, changeset özeti: Türkçe.**
- Kullanıcıya dönük hata mesajları `i18n` kataloğundan gelir, kodda sabit (hardcoded) yazılmaz.

### TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`.
- Dış dünyadan gelen her veri (HTTP gövdesi, env, webhook, JSONB okuması) Zod ile parse edilir. Parse edilmemiş veriye tip verilmez.
- Tercih: `type` (birleşim/kesişim için), `interface` (genişletilebilir sözleşmeler için).
- Discriminated union + exhaustive `switch` (+ `assertNever`) kullan; boolean bayrak yığını kurma.
- Dışa açılan her fonksiyonun dönüş tipi açıkça yazılır.

### İsimlendirme

| Öğe                   | Kural                  | Örnek                          |
| --------------------- | ---------------------- | ------------------------------ |
| Dosya (TS modülü)     | kebab-case             | `tenant-context.middleware.ts` |
| React bileşen dosyası | PascalCase             | `ProductForm.tsx`              |
| Tip / arayüz / sınıf  | PascalCase             | `PaymentAdapter`               |
| Fonksiyon / değişken  | camelCase              | `resolveTenantByHost`          |
| Sabit                 | SCREAMING_SNAKE_CASE   | `MAX_UPLOAD_BYTES`             |
| Prisma modeli         | PascalCase tekil       | `OrderItem`                    |
| DB tablo/kolon        | snake_case (`@@map`)   | `order_item`, `tenant_id`      |
| tRPC prosedürü        | `namespace.action`     | `product.create`               |
| Kuyruk işi            | `domain.action`        | `tenant.provision`             |
| Hata kodu             | SCREAMING_SNAKE_CASE   | `TENANT_NOT_FOUND`             |
| Boolean               | `is`/`has`/`can` öneki | `isPublished`, `canRefund`     |

### Hata yönetimi deseni

Tek hiyerarşi: `AppError`.

```ts
// Her domain hatası AppError'dan türer ve dört şeyi taşır:
// code       — makine tarafından okunur, kararlı, SCREAMING_SNAKE_CASE
// httpStatus — HTTP eşlemesi
// userMessage— kullanıcıya gösterilecek i18n anahtarı (Türkçe metin katalogda)
// context    — loglanacak ek bilgi (PII ve sır içermez)
export class ProductNotFoundError extends AppError {
  constructor(productId: string) {
    super({
      code: 'PRODUCT_NOT_FOUND',
      httpStatus: 404,
      userMessageKey: 'errors.product.notFound',
      context: { productId },
    })
  }
}
```

Kurallar:

- Beklenen durumlar için hata fırlat, `null` döndürüp çağıranı tahmine zorlamayın.
- Beklenmeyen hata yakalanıp yutulmaz; sarmalanıp yukarı iletilir.
- `catch (e) {}` boş blok yasak.
- Dış sağlayıcı hataları adaptör içinde `IntegrationError`'a çevrilir; sağlayıcıya özgü tip adaptör dışına çıkmaz.
- Yeniden denenebilir (retryable) hatalar `isRetryable: true` taşır; kuyruk buna göre davranır.
- Kullanıcı girdisi hataları alan bazlı döner: `{ code: 'VALIDATION_ERROR', fields: { slug: 'errors.slug.taken' } }`.

### Log formatı

Yapılandırılmış JSON (pino). Her kayıtta şunlar bulunur:

```json
{
  "level": "info",
  "time": "2026-10-26T09:12:33.001Z",
  "service": "api",
  "version": "0.4.0",
  "requestId": "req_01J...",
  "traceId": "4bf92f...",
  "tenantId": "tnt_01J...",
  "userId": "usr_01J...",
  "msg": "sipariş oluşturuldu",
  "orderId": "ord_01J..."
}
```

- Seviyeler: `error` (müdahale gerekir), `warn` (beklenen ama anormal), `info` (iş olayı), `debug` (yalnızca geliştirme).
- `console.log` yasak; her zaman enjekte edilen logger.
- **Asla loglanmaz:** şifre, token, çerez, API anahtarı, kart numarası/CVV, TCKN, tam adres, tam e-posta (maskelenir: `a***@example.com`).
- Para tutarları kuruş tamsayısı + para birimi kodu olarak loglanır.

### Veritabanı ve Prisma

- Her tenant'a bağlı tabloda `tenant_id` (NOT NULL) + RLS politikası + `(tenant_id, ...)` bileşik indeks.
- Sorgular tenant'a kapsamlı Prisma istemcisi üzerinden gider (`withTenant(tenantId)`); ham `prisma.*` çağrısı yalnızca platform seviyesi (tenant'sız) tablolarda kabul edilir ve gerekçe yorumu ister.
- Migration'lar expand/contract desenindedir: önce ekle ve çift yaz, sonra tüket, iki sürüm sonra sil. Böylece platform rollback'i şema rollback'i gerektirmez.
- Yıkıcı migration (`DROP COLUMN`, `NOT NULL` ekleme) ayrı PR'da ve ROADMAP'te açıkça işaretli.
- Çok kayıtlı yazma işlemleri transaction içinde; para ve stok işlemleri her zaman transaction + uygun kilit ile.
- JSONB kolonları (tema ayarı, sayfa blokları) okunurken Zod ile parse edilir.

### React / UI

- Fonksiyon bileşeni + hook. Sunucu durumu TanStack Query, form durumu react-hook-form + Zod resolver.
- Veri çeken bileşen ile sunum bileşeni ayrılır; `packages/ui` bileşenleri veri çekmez.
- Erişilebilirlik: her etkileşimli öğe klavyeyle kullanılabilir, etiketli ve odak göstergeli. Renk kontrastı WCAG AA.
- Yükleniyor/boş/hata durumları her liste ve form için açıkça tasarlanır.
- Tailwind sınıfları; ad-hoc inline stil yalnızca dinamik değerler için.

---

## 4.5 Çalışma Döngüsü

**Kullanıcıdan gelen her istek önce Orkestratör tarafından bir Task dosyasına
dönüştürülür ve çok ajanlı döngüden geçirilir. Doğrudan kod yazma yasaktır.**

Ana oturum **Orkestratör**dür: ajanları çağırır, handoff paketlerini taşır, gate
sonuçlarını toplar, kullanıcıya rapor eder. Ajanlar birbirini çağırmaz; her şey
Orkestratör üzerinden geçer.

```
istek → pm → architect → po → [ux → ui] → [db → backend ║ frontend ║ devops]
      → [qa ║ security ║ solid ║ wcag ║ perf] → (FAIL ise düzeltme, en fazla 3 tur)
      → docs → release → kullanıcı onayı → commit
```

| Komut                        | Ne yapar                                         |
| ---------------------------- | ------------------------------------------------ |
| `/run <görev>`               | Görevi tam döngüden geçirir                      |
| `/run v0.3.0`                | ROADMAP sürümünü Task'a çevirip döngüden geçirir |
| `/run --full <görev>`        | Trivial kısayolunu devre dışı bırakır            |
| `/run --skip-design <görev>` | UX/UI adımlarını atlar                           |
| `/run --gates-only T-xxx`    | Mevcut Task'ı yalnızca gate'lerden geçirir       |
| `/status`                    | Task durumları ve teknik borç özeti              |

Döngünün tamamı, 16 ajanın rolleri, paralellik ve gate FAIL kuralları:
**`.claude/workflow/WORKFLOW.md`**. Ajanların ortak sözleşmesi:
**`.claude/workflow/AGENT_BASELINE.md`**.

Orkestratör kullanıcıya **yalnızca** şu altı durumda sorar; diğer her belirsizlikte en
makul varsayımı seçip Task dosyasına `VARSAYIM:` olarak yazar ve devam eder:

1. PM kapsamı daralttı veya değiştirdi
2. Architect `major` (kırıcı) versiyon etkisi tespit etti
3. Yeni ana bağımlılık gerekiyor
4. 3 düzeltme turundan sonra hâlâ FAIL var
5. Bir ajan `NEEDS_INPUT` döndü ve makul varsayımla ilerlenemiyor
6. Git commit / push / dış servise yazma

---

## 5. Çalışma akışı

**Her değişiklik `ROADMAP.md`'deki bir versiyona bağlı olmak zorundadır.**

1. Hangi versiyonu uyguladığını söyle. Versiyon yoksa önce ROADMAP'e ekle ve onay al.
2. O versiyonun **kapsamı dışına çıkma.** Çıkman gerekiyorsa önce sor.
3. Kapsamı uygula. Test yaz.
4. **Kabul kriterini çalıştır ve çıktıyı göster.** Geçmeden versiyon kapanmaz.
5. `pnpm changeset` ile changeset ekle — özet Türkçe, kullanıcıya dönük, ait olduğu ROADMAP versiyonunu belirtir.
6. `CHANGELOG.md`'yi güncelle (veya Changesets'in üretmesini sağla).
7. `ROADMAP.md`'deki ilgili `- [ ]` kutularını `- [x]` yap; versiyon başlığına tamamlanma tarihi ekle.
8. Varsayım yaptıysan ROADMAP'in **Varsayımlar** tablosuna satır ekle.

### Commit ve PR

- Conventional Commits: `feat(api): sipariş iptal akışı eklendi [v0.9.0]`
- Tip listesi: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `ci`.
- Versiyon etiketi köşeli parantezle commit başlığının sonunda.
- PR açıklamasında: hangi ROADMAP versiyonu, kabul kriteri çıktısı, ekran görüntüsü (UI değişikliği varsa), tenant izolasyon kontrol listesi.
- `main` dalına doğrudan push yok; her değişiklik PR üzerinden.

### Belirsizlik politikası

En fazla 3 soru sor, sonra en makul varsayımla ilerle ve varsayımı ROADMAP'e not düş. Varsayımı kodda da `// VARSAYIM(A{n}):` yorumuyla işaretle.

---

## 6. Test zorunlulukları

| Katman              | Araç                           | Zorunluluk                                                                                                   |
| ------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Birim               | Vitest                         | Her iş mantığı fonksiyonu; kural motorları (fiyat, kampanya, durum makinesi, stok) için kenar durumlar dahil |
| Entegrasyon         | Vitest + gerçek Postgres/Redis | Her tRPC prosedürü; her repository                                                                           |
| Tenant izolasyonu   | Vitest                         | Her yeni tenant'a bağlı kaynak için çapraz erişim testi — **istisnasız**                                     |
| Sözleşme (contract) | Vitest                         | Her dış sağlayıcı adaptörü (sandbox); public API şema snapshot'ı                                             |
| Uçtan uca           | Playwright                     | Her kritik akış: kayıt, kur, ürün ekle, sipariş ver, öde, kargola, güncelle, geri al                         |
| Görsel regresyon    | Playwright                     | Her tema şablonu, mobil + masaüstü — yayın şartı                                                             |
| Performans          | Lighthouse CI + k6             | Vitrin Core Web Vitals bütçesi; API p95 hedefleri                                                            |

### Komutlar

```bash
pnpm install                 # bağımlılıklar
pnpm infra:up                # postgres, redis, meilisearch, minio, mailpit
pnpm db:migrate              # migration uygula
pnpm db:seed                 # demo veri
pnpm dev                     # tüm uygulamalar (turbo)
pnpm --filter @arkesoft/api dev

pnpm lint                    # eslint
pnpm format                  # prettier
pnpm typecheck               # tsc --noEmit, tüm paketler
pnpm test                    # vitest (birim + entegrasyon)
pnpm test:isolation          # tenant izolasyon süiti
pnpm test:contract           # API sözleşme snapshot'ı + adaptör sözleşmeleri
pnpm test:e2e                # playwright
pnpm test:visual             # görsel regresyon
pnpm test:visual:update      # referans görüntüleri güncelle (gerekçe ister)
pnpm build                   # tüm paketler

pnpm changeset               # changeset ekle
```

**Bir versiyonu kapatmadan önce zorunlu kapı:**
`pnpm lint && pnpm typecheck && pnpm test && pnpm test:isolation && pnpm build` — hepsi yeşil olmak zorunda.

Flaky test düzeltilir veya kaldırılır; `test.skip` ile kalıcı susturma yasak (ROADMAP'te takip kaydı olmadan).

---

## 7. Tenant izolasyonu kontrol listesi

Yeni bir endpoint, prosedür, kuyruk işi veya tablo eklerken **her maddeyi** doğrula:

- [ ] Tabloda `tenant_id` kolonu var ve `NOT NULL`.
- [ ] Tabloda RLS etkin ve politika `current_setting('app.tenant_id')` ile karşılaştırıyor.
- [ ] `(tenant_id, <sorgulanan kolon>)` bileşik indeksi var.
- [ ] Prosedür `tenantProcedure` (veya `permissionProcedure`) kullanıyor; `publicProcedure` değil.
- [ ] Sorgular `withTenant(tenantId)` istemcisi üzerinden gidiyor; ham `prisma` çağrısı yok.
- [ ] Girdideki hiçbir `id` doğrudan güvenilmiyor; sahiplik (ownership) doğrulanıyor.
- [ ] Kuyruk işinin payload'ında `tenantId` var ve worker işin başında tenant context kuruyor.
- [ ] Dış kaynak (Meilisearch indeksi, S3 anahtar öneki, önbellek anahtarı) tenant'a kapsamlı.
- [ ] Önbellek anahtarı `tenant:{tenantId}:...` formatında; global anahtarda tenant verisi yok.
- [ ] Yüklenen/indirilen dosya yolu tenant önekiyle doğrulanıyor.
- [ ] `createTenantIsolationSuite()` ile çapraz okuma **ve** yazma testi yazıldı.
- [ ] Hata mesajı başka tenant'ın varlığını sızdırmıyor (var olmayan vs. yetkisiz ayrımı yapılmıyor → her ikisi de 404).
- [ ] Log kayıtlarında `tenantId` var.
- [ ] Süper admin erişimi varsa impersonation kaydı ve denetim kaydı üretiliyor.

---

## 8. Yeni entegrasyon/adaptör ekleme reçetesi

Her dış sağlayıcı (ödeme, kargo, e-fatura, SMS, pazaryeri, ERP) ortak bir arayüzün arkasındadır. **Çekirdek asla sağlayıcı adı bilmez.**

1. **Arayüzü kontrol et.** `packages/integrations/src/<domain>/types.ts` içinde arayüz var mı? Yoksa önce arayüzü tasarla ve ADR yaz. Arayüz bir sağlayıcıya göre şekillenmez; en az iki sağlayıcı düşünülerek tasarlanır.
2. **Klasörü oluştur:** `packages/integrations/src/<domain>/<provider>/`
   - `adapter.ts` — arayüz implementasyonu
   - `client.ts` — HTTP istemcisi (timeout, retry, imza)
   - `schemas.ts` — sağlayıcı istek/yanıtları için Zod şemaları
   - `mappers.ts` — sağlayıcı ↔ domain dönüşümleri
   - `errors.ts` — sağlayıcı hatası → `IntegrationError` eşlemesi
   - `__tests__/contract.test.ts` — sandbox sözleşme testi
   - `README.md` — kimlik bilgileri, sandbox, bilinen kısıtlar, oran limitleri
3. **Yapılandırmayı tanımla:** sağlayıcı kimlik bilgileri şeması (Zod), tenant başına şifreli saklanır (`TenantIntegrationConfig`). Anahtarlar asla kod veya log içinde değil.
4. **Dayanıklılık:** timeout (varsayılan 10 sn), exponential backoff ile yeniden deneme, idempotency key, devre kesici (circuit breaker), sağlayıcı yanıtının ham halinin (sırlar maskelenmiş) denetim kaydına yazılması.
5. **Webhook varsa:** imza doğrulaması zorunlu, tekrar gelen olayın tekrar işlenmemesi (olay id'si ile idempotency), ham gövdenin saklanması.
6. **Kayda ekle:** `providerRegistry`'ye ekle; sağlayıcı seçimi tenant yapılandırmasından gelir, kodda `if (provider === 'iyzico')` dallanması **yok**.
7. **Admin UI:** sağlayıcı ayar formu şemadan üretilir; "Bağlantıyı test et" butonu `healthCheck()` çağırır.
8. **Testler:** sözleşme testi (sandbox), eşleme (mapper) birim testleri, hata eşleme testleri, webhook idempotency testi.
9. **Belgele:** `docs/integrations/<domain>-<provider>.md` + ROADMAP kutusunu işaretle + changeset.

**Kabul kriteri şablonu:** "Sağlayıcı X sandbox'ında `pnpm test:contract --filter <provider>` yeşil; adaptör arayüz dışına sağlayıcıya özgü tip sızdırmıyor (tip testi); kimlik bilgileri şifreli saklanıyor; webhook tekrarı tek kayıt üretiyor."

---

## 9. Versiyonlama ile çalışma

- Davranış değiştiren her PR changeset içerir. `docs`/`test`/`chore` muaf.
- Versiyonlanan dört birim: **platform**, **theme-sdk**, **her tema**, **public API**. Kuralların tamamı `ROADMAP.md` → _Sürüm Politikası_'nda.
- Public API'de bir alanı zorunlu yapmak, kaldırmak veya tipini değiştirmek **major**'dır. `pnpm test:contract` bunu yakalar — testi güncellemek yetmez, major gerekir.
- Tema ayar şemasında kırıcı değişiklik yapıyorsan `theme-sdk` migration'ı **yazmak zorunludur**; migration'sız tema majoru yayınlanamaz.
- Migration'lar geriye uyumlu (expand/contract) olacak ki platform rollback'i şema rollback'i gerektirmesin.
- Tenant'a zorla güncelleme uygulanmaz; istisna yalnızca güvenlik yaması olarak işaretlenen patch'ler.

---

## 10. Asla yapılmayacaklar

1. **Next.js eklemek.**
2. **`any` kullanmak** veya `@ts-ignore` ile tip hatasını susturmak.
3. **`tenant_id` filtresi olmadan sorgu yazmak** veya RLS politikası olmayan tenant tablosu eklemek.
4. **RLS'i devre dışı bırakmak / `BYPASSRLS` rolünü uygulama koduna vermek.**
5. **Kabul kriteri çalıştırılmadan versiyonu "bitti" ilan etmek.**
6. **Kabul kriterini geçirmek için testi gevşetmek** (eşiği düşürmek, `skip`, görsel referansı gerekçesiz güncellemek).
7. **Kart verisi, şifre, token, API anahtarı, TCKN loglamak veya saklamak.**
8. **Gizli bilgiyi repoya commit etmek.** Her şey env + secret yöneticisinde.
9. **Parayı float ile tutmak veya hesaplamak.**
10. **Yıkıcı migration'ı (kolon/tablo silme, `NOT NULL` ekleme) kullanımdan kaldırma penceresi dolmadan uygulamak.**
11. **Changeset'siz davranış değişikliği göndermek.**
12. **Çekirdek koda sağlayıcıya özgü dallanma (`if (provider === ...)`) yazmak.**
13. **Verilen ROADMAP kapsamı dışına sormadan çıkmak** veya "yolum üstündeydi" diye ilgisiz refactor yapmak.
14. **Yeni ana bağımlılığı gerekçesiz eklemek.**
15. **İş mantığını `packages/ui` veya istemci tarafına koymak** / sunucu doğrulamasını atlamak.
16. **Hata yutmak** (`catch {}`), hatayı `null`'a çevirip sessizce devam etmek.
17. **Kullanıcıya dönük metni kodda sabit yazmak** (i18n kataloğu dışında).
18. **Müşteri verisi üzerinde denetim kaydı bırakmadan süper admin işlemi yapmak.**
19. **Üretim veritabanına elle müdahale etmek** (runbook ve onay olmadan).
20. **`main` dalına doğrudan push yapmak.**
