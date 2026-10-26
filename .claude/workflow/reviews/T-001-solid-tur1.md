# T-001 · solid gate · Tur 1

Tarih: 2026-10-26
Sürüm: v0.0.3 — Prisma kurulumu ve ilk modeller

> Bu dosyayı Orkestratör yazdı. `solid` gate ajanının yazma aracı yoktur (bilinçli kısıt:
> gate ajanları kod düzeltmez). Rapor, ajanın döndürdüğü handoff paketinin birebir içeriğidir.

```
GATE: solid
SONUÇ: FAIL
```

**FAIL gerekçesi (AGENT_BASELINE §4):** 0 critical · 0 high · **3 medium** → kural gereği FAIL
(≥3 medium). Hiçbir yüksek seviye bulgu yok; kod genel olarak yüksek kalitede, bulgular dar
kapsamlı ve tek turda kapanabilir.

Bulgu dağılımı: **0 critical / 0 high / 3 medium / 8 low**

---

## BULGULAR

### [SEV: medium] `src/seed.ts:27-34` + `src/guard-local-database.ts:59-65` + `src/__tests__/helpers/test-client.ts:12-18`

`DATABASE_URL` **üç ayrı yerde** elle okunup `undefined`/`length === 0` kontrolüyle `string`
tipine yükseltiliyor; **Zod parse'ı yok.** CLAUDE.md §4 açık: _"Dış dünyadan gelen her veri
(HTTP gövdesi, **env**, webhook, JSONB okuması) Zod ile parse edilir. Parse edilmemiş veriye tip
verilmez."_

Üstelik doğrulayıcı **zaten var**: `packages/config/src/env.ts:71` →
`DATABASE_URL: connectionUrl(['postgresql://','postgres://'])` ve
`packages/config/src/env.ts:127` → `parseEnv()`, `@arkesoft/config` `./env` subpath'inden dışa
açık (`packages/config/package.json:16-19`).

Buna rağmen `zod` `packages/db/package.json:43`'te **çalışma-zamanı bağımlılığı olarak tanımlı
ama hiçbir yerde import edilmiyor** (grep: tek eşleşme manifestin kendisi) — architect'in
"bağımlılık yönü `packages/db` → `packages/config` + `zod`" kararının **zod ayağı hiç
uygulanmamış.**

Bu hem standart ihlali hem **gerçek tekrar**: üç kopya aynı sebeple değişir (değişken adı,
format kuralı, hata metni). Yüzeysel benzerlik değil — üçünün yalnızca _başarısızlık modu_ farklı
(stderr+exit / `rejectWith` / `throw`), okuma+doğrulama mantığı aynı.

**Düzeltme:** `@arkesoft/config`'i `devDependencies`'ten `dependencies`'e taşı, tek bir
`src/env.ts` (veya `client.ts` içinde) `parseEnv(infraEnvSchema.pick({ DATABASE_URL: true }))`
sarmalayıcısı kur, üç çağrı yerini ona bağla; `zod` kullanılmayacaksa manifestten çıkar.

**Sorumlu:** db (export yüzeyi/bağımlılık sınıfı değişikliği gerektirdiği için **architect**
teyidi ister)

### [SEV: medium] `src/__tests__/tenant.test.ts:54-81`

Test adı `'Soft delete sonrası slug/e-posta serbest kalmaz'` ama gövde **yalnızca** `Tenant.slug`
yolunu doğruluyor; `User.email` için tek satır yok. **Test adı ne test ettiğini söylemiyor,
yanlışını söylüyor.**

PM V1 (`T-001.md:805`) "Aynı mantık `User.email` için geçerli" diyor, AC7 "Soft delete sonrası
tekillik davranışı testte açıkça doğrulanmış" istiyor ve architect'in vaka tablosu
(`T-001.md:332`) adı birebir "slug/e-posta" olarak kilitlemiş. Ayrıca AC7'nin üçüncü ayağı olan
`Tenant.primaryDomain` küresel tekilliği **hiçbir testte doğrulanmıyor** (yalnızca
`migration.sql:54`'te indeks olarak var).

**Düzeltme:** aynı dosyaya `deletedAt` set edilmiş kullanıcı için ikinci `user.create` →
`isUniqueConstraintError` vakası ekle (veya `user.test.ts` aç) ve `primaryDomain` için bir vaka
ekle; ya da testi adıyla uyumlu hale getirip eksik kapsamı ROADMAP teknik borcuna yaz.

**Sorumlu:** db (kapsam kararı gerekirse **qa**/**po**)

### [SEV: medium] `package.json:32` ve `:35`

`"push"` ve `"reset"` script'leri güvenlik kontrolünü `node dist/guard-local-database.js` ile
**derlenmiş çıktıdan** çalıştırıyor, ama **build garantisi yok.** Aynı dosyanın `:33` satırındaki
`"seed": "pnpm run build && prisma db seed"` bu garantiyi bilinçli olarak kuruyor — yani desen
dosya içinde **tutarsız** ve bayatlama riski yalnızca seed için kabul edilmiş
(`prisma.config.ts:30-37` notu), guard için **hiçbir yerde kayıt altında değil.**

İki somut sonuç:

- (a) `guard-local-database.ts` sıkılaştırılıp yeniden derlenmezse `pnpm db:reset` **eski,
  gevşek** guard ile koşar — yıkıcı komutun koruma mekanizması **sessizce geriye düşer.**
- (b) Taze klonda `dist/` yokken `pnpm db:reset` `MODULE_NOT_FOUND` ile (kapalı tarafa düşerek,
  ama anlamsız bir mesajla) patlar — Üretim Logları `T-001.md:725-726` zaten AC1'i koşmak için
  önce elle `pnpm --filter @arkesoft/db run build` çalıştırmak zorunda kalmış.

**Düzeltme:** `"push"`/`"reset"`'i `"pnpm run build && node dist/guard-local-database.js && …"`
yap (veya guard'ı turbo `build` task'ına `dependsOn` ile bağla).

**qa'ya not:** AC1'in literal komut zinciri (`pnpm infra:up && pnpm db:reset && pnpm db:seed`)
taze klonda ön build olmadan geçmiyor — AC kapsamında yeniden değerlendirin; bu bulgu bilinçli
olarak `medium`'da tutuldu.

**Sorumlu:** db (dosya ST-2 sahipliğinde)

### [SEV: low] `src/__tests__/migration-sql.test.ts:45-47`

Yorum _"gelecekteki her migration için yıkıcı ifadeler yasak"_ diyor ama
`readInitMigrationSql()` (`:15-27`) yalnızca adı `_init` ile biten **tek** dizini okuyor.
Sonraki migration'lar (`..._add_plan` vb.) bu testin kapsamına hiç girmiyor. Architect spec'i
testi `_init`'e kapsamlı tanımladığı için _test_ sözleşmesini karşılıyor; kusur yorumun koda ait
olmayan bir garanti vaat etmesi — bir sonraki geliştirici expand/contract korumasının mekanik
olduğunu sanıp eklemeyi atlar.

**Düzeltme:** ya yorumu "yalnızca init migration'ı kapsar; genel koruma v0.0.12 CI'ında" diye
düzelt, ya `readdirSync` sonucunun **tamamı** üzerinde döngü kur. **Sorumlu:** db

### [SEV: low] `prisma.config.ts:8` ve `vitest.config.ts:11`

İki yerde `process.loadEnvFile(...)` **import ifadelerinin görsel olarak üstünde** duruyor
(`prisma.config.ts:10`, `vitest.config.ts:13`). ESM'de import'lar hoist edilip modül gövdesinden
**önce** değerlendirildiği için bu sıralama okunduğu garantiyi vermiyor; şu an çalışıyor çünkü
`env('DATABASE_URL')`/`defineConfig` çağrıları gövdede, modül yüklenirken değil. Kırılgan ve
yorumsuz.

Ek olarak `process.loadEnvFile` dosya yoksa **fırlatır**; `prisma.config.ts:6-7` yorumunun
"CI'nin enjekte ettiği değerler bozulmaz" iddiası `.env` dosyasının _ayrıca var olmasına_ bağlı
— v0.0.12 CI'ında `.env` olmayan koşumda bu üç çağrı yeri (guard dahil,
`guard-local-database.ts:31`) çöker.

**Düzeltme:** çağrıyı import'ların altına taşı (veya niyeti yoruma yaz) ve dosya yokluğunu
tolere eden bir sarmalayıcı kullan; `.env` zorunluluğunu `docs/development.md`'ye yaz.
**Sorumlu:** db (CI tarafı **devops**)

### [SEV: low] `src/seed.ts:84-87`

Üst seviye `catch` hatayı `String(error)` ile stderr'e yazıyor: **yığın izi (stack) kaybediliyor**
ve bağlantı kurulamadığında Prisma/pg hata metninde yer alabilen bağlantı ayrıntısı doğrudan
çıktıya düşebiliyor. Bu, `guard-local-database.ts`'in özenle kurduğu "mesajda yalnızca host +
DB adı" disiplininin (`:16-18`) aynı pakette tutulmaması demek. Hata **yutulmuyor** (exit 1
veriliyor) — bu yüzden CLAUDE.md §4 ihlali değil, tutarlılık/teşhis kusuru.

**Düzeltme:** `error instanceof Error ? error.stack ?? error.message : String(error)` ile daralt,
bağlantı dizesini maskele. **security gate'e not:** sızıntı yüzeyini siz teyit edin.
**Sorumlu:** db

### [SEV: low] `src/__tests__/tenant.test.ts:16-22` ve `src/__tests__/membership.test.ts:21-31`

"Oluşturulan id'leri diziye biriktir → `afterAll`'da `deleteMany`" **temizlik defteri** iki
dosyada tekrarlanıyor ve aynı sebeple (temizlik stratejisi değişirse) birlikte değişir.
`helpers/` altında küçük bir `createCleanupRegistry()` doğal yeri.

Aynı dosyalardaki `create → duplicate create → catch → isUniqueConstraintError` blokları
**tekrar değildir** (farklı davranışları doğruluyorlar, birleştirilmemeli) — yalnızca temizlik
defteri işaretlendi. **Sorumlu:** db

### [SEV: low] `src/__tests__/migration-sql.test.ts:50`

`expect(sql).not.toContain('DROP COLUMN')` assertion'ı `:48`'deki `not.toContain('DROP ')`
tarafından zaten kapsanıyor (`DROP COLUMN` ⊃ `DROP `); **erişilemez/ölü assertion.**

Ayrıca architect'in "İndeks değişmezi" garantisi (`T-001.md:184`: `tenant_id` en az bir indeksin
**öncü** kolonu) bu testte **mekanik olarak doğrulanmıyor** — yalnızca ST-2'nin elle `psql \d`
çıktısına dayanıyor.

**Düzeltme:** gereksiz assertion'ı kaldır; yerine `TENANT_SCOPED_TABLES` üzerinden
`CREATE UNIQUE INDEX ... ON "<tablo>"("tenant_id",` desenini assert et. **Sorumlu:** db

### [SEV: low] `packages/config/eslint/base.js:42-47`

React yorumu (`:42`) ile yeni eklenen Prisma yorumu (`:43-47`) araya boş satır konmadan
birleşmiş; tek bir blok gibi okunuyor ve hangi yorumun `paths` dizisindeki hangi girdiye ait
olduğu belirsiz kalıyor (`:53` react, `:58` `@prisma/client`). Dosyanın geri kalanı
`// --- Bölüm ---` desenini tutarlı kullanıyor.

**Düzeltme:** iki yorumu ayır, Prisma yorumunu ilgili `paths` girdisinin hemen üstüne taşı.
**Sorumlu:** devops

### [SEV: low] `src/guard-local-database.ts:29`

Çıplak `export {}` satırının gerekçesi yazılı değil (dosyanın ESM modülü sayılması ve
`import.meta.url`'in çalışması için). 29 satırlık ayrıntılı başlık yorumunun hemen ardında
açıklamasız durduğu için "artık kod" gibi görünüyor ve **silinme riski taşıyor.**

**Düzeltme:** tek satır Türkçe gerekçe yorumu ekle. **Sorumlu:** db

### [SEV: low] `src/__tests__/helpers/test-client.ts:15`

Hata mesajı yalnızca `pnpm infra:up`'a yönlendiriyor; oysa `tenant.test.ts:24` ve
`membership.test.ts:33` **seed'lenmiş** veritabanı varsayıyor. Ayağa kalkmış ama seed'lenmemiş
bir DB'de hata `expected null not to be null` olarak çıkıyor — **nedeni söylemeyen bir teşhis.**

**Düzeltme:** mesaja `pnpm db:seed`'i ekle veya seed verisinin varlığını doğrulayan bir
`beforeAll` ön koşul kontrolü koy. **Sorumlu:** db

---

## BİLİNÇLİ KARARLAR — teyit edildi, bulgu yazılmadı

- `process.stdout/stderr.write` (`seed.ts:30,76,85` · `guard:55`) — R-A7 gerekçe yorumuyla
  **her iki dosyada da mevcut** (`seed.ts:18-21`, `guard:26-27`) ✓
- `process.env['X']` bracket notasyonu (`noPropertyAccessFromIndexSignature`) ✓
- `Prisma` yalnızca `export type` (`index.ts:28`); `dist/index.d.ts`'te değer sızmıyor ✓
- `TransactionClient` üretilen istemcinin kendi tipine alias (`client.ts:40`) ✓
- Modül seviyesi singleton yok, fabrika deseni (`client.ts:46`) ✓ ve test yardımcısı bu kararla
  çatışmadığını açıkça gerekçelendirmiş (`test-client.ts:3-7`) ✓
- `TenantMembership`'te `deletedAt` yok / `TenantStatus`'ta `deleted` yok
  (`schema.prisma:70,87-88`) ✓
- `packages/db` iş mantığı içermiyor; `withTenant()` eksikliği bulgu sayılmadı ✓
- `PLATFORM_LEVEL_TABLES` ve `TransactionClient`'ın henüz tüketilmemesi ölü kod sayılmadı ✓

---

## DOĞRULANAN VE TEMİZ ÇIKAN KATEGORİLER

**Tip disiplini** — `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `as X` zorlaması:
**sıfır eşleşme** (`as const` dışında assertion yok). Dışa açılan ve iç fonksiyonların
**tamamında** dönüş tipi açıkça yazılı (**12/12**). `unknown` daraltması sağlam:
`errors.ts:19` `typeof === 'object' && !== null && 'code' in error` — nesne olmayan, `null` ve
`code` taşımayan girdilerde doğru `false` dönüyor, prototip zincirindeki getter'ı da yakalıyor.

**Hata yönetimi** — boş `catch {}` yok; `guard-local-database.ts:70-72`'deki tek sessiz `catch`
kontrollü `rejectWith`'e dönüyor ve orijinal hatayı bilinçli olarak yutuyor (URL sızdırmamak
için, gerekçe `:16-18`); hiçbir yerde hata `null`'a çevrilmiyor; `AppError`'ın bu sürümde
bulunmaması **teyit edildi** (v0.0.4).

**Katman/bağımlılık** — `packages/db` yalnızca `@prisma/adapter-pg` + `#prisma` + Node
yerleşiklerine bağımlı, `@arkesoft/config` devDep, **döngü yok**, sunum veya iş mantığı yok;
ST-6 kuralı doğru yerde (`packages/config/eslint/base.js:58-68`), `packages/db` `#prisma`
dolaylaması sayesinde istisnasız muaf. Sağlayıcı dallanması (`if (provider === ...)`) yok.

**İsimlendirme** — dosyalar kebab-case (7/7 src + 4/4 test), tipler PascalCase, sabitler
SCREAMING_SNAKE (`PRISMA_ERROR_CODES`, `ALLOWED_LOCAL_HOSTNAMES`, `MIGRATIONS_DIR`, `DEMO_SEED`,
`PACKAGE_NAME`), boolean dönen fonksiyonlar `is`/`has` önekli, Prisma modelleri PascalCase
tekil, DB tablo/kolon snake_case (`migration.sql` birebir doğrulandı), kod İngilizce / yorumlar
Türkçe.

**Test** — `skip`/`only`/`todo` **sıfır**; assertion'lar tautolojik değil (hata fırlatılmazsa
`caughtError === undefined` → `isUniqueConstraintError` `false` → test kırmızı, regresyonu
gerçekten yakalıyor); seri koşum gerekçesi `vitest.config.ts:3-7`'de yorumla açıklanmış ✓;
`afterAll` demo seed'e dokunmuyor, yalnızca kendi id'lerini siliyor ✓; `migration-sql.test.ts:52`
tablo adını sabit yazmıyor, `TENANT_SCOPED_TABLES`'ı gerçekten döngüye alıyor ✓.

**Export yüzeyi** — `index.ts` **tam dokuz** çalışma-zamanı export'u açıyor
(`createPrismaClient`, `isUniqueConstraintError`, 3 enum, 2 taksonomi dizisi, `DEMO_SEED`,
`PACKAGE_NAME`) — architect tablosundan fazlası yok ✓

**Şema** — `schema.prisma` architect'in üç alan tablosuna **birebir** uyuyor; R2
(cuid2/text/`@default(cuid(2))` DDL'de yok uyarısı dahil) `:4-7`, R3 (`app_user`) `:8-12`, soft
delete ve V4 kararları `:15-19`, A-V8 `:87-88`, V3 `:98` yorumlanmış; `@map` tutarsızlığı veya
eksik indeks yok; `generated/**` dosyalarının `@ts-nocheck` taşıdığı iddiası
(`eslint.config.mjs:4-5`, `tsconfig.prisma.json:3-4`) **11/11 dosyada doğrulandı.**

---

## ÖLÇÜMLER

- İncelenen dosya: **24** (`packages/db` 19 + `packages/config` 2 + kök 3)
- İncelenen satır: **~1.500**
- Bulunan `any`: **0** · `@ts-ignore`/`@ts-expect-error`: **0** · gerekçesiz `as` zorlaması: **0**
- En büyük fonksiyon: **47 satır** (`seed.ts:36-82` `main()`); ikinci:
  `guard-local-database.ts:75-103` `assertDestructiveCommandAllowed()`, 29 satır
- Kontrol edilen kategori: **12/12** (tek sorumluluk, katman sınırı, bağımlılık yönü + döngü,
  soyutlama/sağlayıcı dallanması, DRY, KISS, isimlendirme, tip disiplini, hata yönetimi deseni,
  test kalitesi, ölü kod, yorum kalitesi)
- Bulgu dağılımı: **0 critical / 0 high / 3 medium / 8 low**
- Komut çalıştırılmadı (salt okuma incelemesi; `pnpm lint`/`typecheck`/`test` çıktıları `qa`
  gate'inin kapsamında)
