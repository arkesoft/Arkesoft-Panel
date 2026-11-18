# T-021 — `security` gate, Tur 1

- **Tarih:** 2026-11-16
- **Sürüm:** ROADMAP v0.0.20 (süper admin iskeleti)
- **ADR:** ADR-0023 (5 karar), ADR-0022 GÜNCELLEME, ADR-0011 (gözden geçirme koşulu 2)
- **Kapsam:** `apps/api/src/platform/**`, `apps/api/src/auth/trusted-origins.ts` +
  `same-origin.guard.ts`, `packages/trpc` `platform.*` yüzeyi, `packages/db` platform
  tabloları + migration, `apps/superadmin/**`, `scripts/playwright/{sql,totp}.ts`,
  `scripts/guards.sh`, `turbo.json`, `ci.yml`, `.env.example`

```
GATE: security
SONUÇ: FAIL
BULGULAR:
  - [SEV: high] apps/api/src/platform/platform-admin-ip.guard.ts:53-55 (+ apps/api/src/http/normalize-request-path.ts:27-29) — Fail-closed IP allowlist'i YÜZDE-KODLANMIŞ yol ile TAMAMEN atlatılabiliyor: `isPlatformAdminGuardedPath` yolu `normalizeRequestPath` ile alıyor, o da `new URL().pathname` kullandığı için yüzde-kodlamayı ÇÖZMÜYOR; tRPC ise çözüyor (`@trpc/server@11.19.0` → `resolveResponse.ts:241`, `path: decodeURIComponent(opts.path)`). `/trpc/platform%2EtenantList` guard'ın `startsWith('/trpc/platform.')` testini GEÇMEZ (anında `true` döner, üç fail-closed dalın hiçbiri çalışmaz) ama tRPC prosedürü `platform.tenantList` olarak ÇÖZER. — Düzeltme: yol karşılaştırmasını kanonikleştirilmiş yol üzerinde yap (`decodeURIComponent` + bozuk kodlamada fail-closed "kapsamda" say), ya da `/trpc/*` yolunda `%` taşıyan isteği sınırda reddet; düzeltme `normalize-request-path.ts`'e (ortak normalizer) konmalı, yalnızca guard'a değil; `platform-admin-ip-guard.test.ts`'e `%2E`/`%2e` vakaları negatif kanıtla eklenmeli — backend (S7)
  - [SEV: medium] apps/api/src/auth/rate-limit/trpc-rate-limited-paths.ts:43-47 + rate-limit.policy.ts:339-345 — AYNI kök neden (ortak normalizer yüzde-kodlamayı çözmüyor) oran sınırlamasını da atlatıyor: `/trpc/registration%2EcreateTenant` için `resolveRateLimitPolicy` `undefined` döner (sınır YOK) ama tRPC `registration.createTenant`'ı çalıştırır. ⚠ BU BULGU T-021 TARAFINDAN ÜRETİLMEDİ (dosya v0.1.0'dan, bu diff'te değişmedi) ama daha önce hiçbir gate raporunda yok ve yüksek bulgunun düzeltmesiyle AYNI satırda kapanır. — Düzeltme: yukarıdaki kanonikleştirme ortak modüle konursa bu da kapanır; `rate-limit-policy` testine bir `%2E` vakası eklenmeli — backend + devops
  - [SEV: low] apps/api/src/platform/impersonation.service.ts:209 + packages/trpc/src/schemas/platform.schema.ts:168 — `architect`'in bağlayıcı kararı "kiracı kimlik listesi TELE ÇIKMAZ" (`detail` bu yüzden şemadan dışlandı, `platform.schema.ts:25-31`) ama `subject` alanı `[...tenantIds].sort().join(',')` olarak YAZILIYOR ve `platform.auditLog.entries[].subject` ile TELE ÇIKIYOR. Veri sızıntısı YOK (yalnızca platform yöneticisi okur ve `tenantList` ile aynı kümeyi zaten görür), ama yazılı karar fiilen baypas edilmiş ve tel sözleşmesi sınırsız uzunlukta bir kiracı kimlik listesi taşıyor (semver + ileride PII değerlendirmesi yüzeyi). — Düzeltme: `subject`'i operasyon başına tek bir opak değere indir (ör. erişilen kiracı SAYISI veya aktör kimliği) ve kiracı kümesini yalnızca `detail`de tut; ya da ADR-0023/`platform.schema.ts` yorumunu "liste `subject`'te tele çıkar" diye DÜZELT — backend + docs · vade: v0.15.0 (`detail.tenantIds` normalizasyonu)
  - [SEV: low] apps/api/src/prisma/prisma.service.ts:119-139 + canlı katalog ölçümü — `arkesoft_app` rolü `platform_admin` üzerinde `INSERT/UPDATE/DELETE` taşıyor (canlı ölçüldü) ve `PrismaService.platform` getter'ı `platformAdmin` delegesinin TAMAMINI (write metotları dahil) açıyor. Platform yetkisi = satırın VARLIĞI (ADR-0023 Karar 1) ⇒ uygulama çalışma zamanı rolü kendine platform yetkisi yazabilir ve `audit-log.writer.ts`/`runImpersonated` emsalindeki gibi bir YAZMA KAPISI bu tablo için YOK. Bugün yazan kod yolu yok ve sömürü mevcut bir "keyfi sorgu" primitifi gerektirir ⇒ `low`. ⚠ Bu, kayıtlı R-A6 tamper-evidence borcundan FARKLI bir eksen (o `platform_audit_log`'un UPDATE/DELETE'i; bu `platform_admin`'in INSERT'i = yetki yükseltme). — Düzeltme: v0.0.20.1'in REVOKE kapsamına `platform_admin` (INSERT/UPDATE/DELETE) da alınsın; getter `platformAdmin` için salt-okuma yüzeyine (`Pick<…,'findUnique'>` tarzı yapısal daraltma) indirgensin — db + devops · vade: v0.0.20.1
  - [SEV: low] apps/api/src/__tests__/platform-impersonation-write-gate.test.ts:57,85 — İki mekanik kapının needle'ı SÖZDİZİMİ-KIRILGAN: KAPI A `.impersonation.runImpersonated(` (enjekte edilen alanın ADINA bağlı — `private readonly svc` yeniden adlandırması kapıyı sessizce boşa çıkarır), KAPI B `(PrismaService)` (yalnızca AÇIK `@Inject(...)` dekoratörünü görür — `constructor(private readonly prisma: PrismaService)` tip-tabanlı enjeksiyonu Nest çözer, needle görmez). KAPI B'nin boşa çıkması `runImpersonated`'ı tamamen atlayan, DENETİMSİZ bir `withTenant()` yoluna izin verir. Bugün tutuyor: repo konvansiyonu 15/15 açık `@Inject(PrismaService)` (ölçüldü). — Düzeltme: KAPI A'yı alıcıdan bağımsız hale getir (`ImpersonationService` tipi import eden dosya kümesi + `runImpersonated` jetonu kesişimi), KAPI B'yi `: PrismaService` tip-anotasyonunu da kapsayacak şekilde genişlet — backend · vade: v0.0.20.1
  - [SEV: low] apps/api/src/config/api-env.ts:95 (`SUPERADMIN_BASE_URL: z.url()`) + auth/trusted-origins.ts:49-51 — `z.url()` özel-olmayan şemaları da kabul eder; böyle bir değerin `.origin`'i literal `"null"` dizesidir ⇒ güvenilir orijin listesine `"null"` girer ve `Origin: null` taşıyan istekler (sandbox'lı iframe, `data:` dokümanı, bazı çapraz-orijin yönlendirmeleri) `SameOriginGuard`'ı GEÇER. Operatör hatası gerektirir; sınıf ÖNCEDEN DE VARDI (`AUTH_BASE_URL` aynı `z.url()`), bu sürüm onu İKİYE çıkardı. — Düzeltme: şemada protokolü `http:`/`https:` ile sınırla veya `resolveTrustedOrigins`'te `'null'` orijinini fail-fast reddet — backend · vade: v0.0.20.1
  - [SEV: low] pnpm-lock.yaml (DEĞİŞMEMİŞ satırlar) — `pnpm audit`: 1 high (`multer@2.4.0`, GHSA-q7qp-rjg7-q26m), 3 moderate, 1 low. ⚠ HİÇBİRİ bu sürüm tarafından getirilmedi (lockfile diff'i yalnızca `apps/superadmin`'e MEVCUT katalog sürümlerini bağlıyor, yeni paket sürümü YOK). `multer` + `minimatch` KAYITLI borç (ROADMAP:3248, ROADMAP:2614). ⭐ KAYITLI OLMAYAN üçü: 2× `@astrojs/node` moderate (GHSA-r3h5-4585-7x3w) + 1× `astro` low (GHSA-mh32-jxcr-mh9f) — erişilebilirlik ÖLÇÜLDÜ: `apps/storefront` + `packages/themes` içinde `astro:assets`/`Image`/`getImage` → 0 eşleşme, dinamik etiket adı deseni → 0 eşleşme ⇒ bugün erişilemez. — Düzeltme: `@astrojs/node ≥11.1.12` + `astro ≥7.4.5` katalog yükseltmesi; `multer` için `pnpm.overrides ≥2.5.0` — devops · vade: v0.0.20.1 / sonraki bakım penceresi
ÖLÇÜMLER: pnpm audit → 0 critical / 1 high / 3 moderate / 1 low (hiçbiri bu sürümden; 3'ü kayıtsız, hiçbiri erişilebilir değil) · incelenen dosya: 54 (18 tam okuma + 36 diff/hedefli tarama) + 3 `@trpc/server` kaynak dosyası · CLAUDE.md §7 18 maddeden KARŞILANMAYAN: YOK (madde 4 GEREKÇELİ İSTİSNA, ADR-0023 Karar 2) · canlı DB ölçümü: `arkesoft_app|f|f`, `arkesoft_auth|f|f`, `arkesoft_migrator|f|f`; `platform_admin`/`platform_audit_log` RLS `f|f` (platform seviyesi, doğru); `subscription` RLS `t|t`; `public` şemasında view/matview/foreign tablo = 0, `prosecdef` fonksiyon = 0, kullanıcı trigger'ı = 0 · canlı HTTP ölçümü (:3100): `%2E` yol kodlaması kanıtlandı (aşağıda)
```

---

## 1. ⚠⚠ YÜKSEK BULGUNUN KANIT ZİNCİRİ (F1) — adım adım ölçüldü

### (a) Statik: iki katman yolu FARKLI çözüyor

`apps/api/src/http/normalize-request-path.ts:27-29` → `new URL(rawUrl, …).pathname`.
WHATWG URL yüzde-kodlamayı **çözmez**.

`@trpc/server@11.19.0` →
`src/unstable-core-do-not-import/http/resolveResponse.ts:241`:

```
path: decodeURIComponent(opts.path),
```

⇒ tRPC yolu **çözer**. Node ile ölçüldü (tam tRPC yol türetme algoritması taklit
edilerek — `fetchRequestHandler.ts`'in `trimSlashes` zinciri):

| Girdi URL                     | `normalizeRequestPath`        | IP guard eşleşmesi | tRPC'nin çözdüğü prosedür |
| ----------------------------- | ----------------------------- | ------------------ | ------------------------- |
| `/trpc/platform.tenantList`   | `/trpc/platform.tenantList`   | **true**           | `platform.tenantList`     |
| `/trpc/platform%2EtenantList` | `/trpc/platform%2EtenantList` | ⚠⚠ **false**       | ⚠⚠ `platform.tenantList`  |
| `/trpc/platform%2etenantList` | `/trpc/platform%2etenantList` | ⚠⚠ **false**       | ⚠⚠ `platform.tenantList`  |
| `/trpc/x/../platform.…`       | `/trpc/platform.tenantList`   | true               | `platform.tenantList`     |

⭐ **Batching bu kapıyı kapatmıyor** (kontrol edildi, iyi haber):
`create-trpc-request-handler.ts:103` `allowBatching: false` ⇒ `?batch=1` 400 ile
reddediliyor, virgüllü çoklu-yol ile karıştırma yolu **kapalı**.

### (b) Canlı: aynı normalizer'ı kullanan İKİNCİ bir kapı da `%2E`'yi görmüyor

Koşan `apps/api` (:3100) üzerinde, **salt okuma GET**, durum değiştirmeyen üç probe:

```
Host: superadmin.arkesoft.localhost
GET /trpc/platform.tenantList?input=%7B%7D   → 401 UNAUTHENTICATED
GET /trpc/platform%2EtenantList?input=%7B%7D → 404 TENANT_NOT_FOUND   ⚠ FARKLI KAPI
GET /trpc/platform.session?input=%7B%7D      → 401 UNAUTHENTICATED
```

⇒ `TENANT_EXEMPT_PATHS` (aynı `normalizeRequestPath`) kodlanmış yolu **tanımıyor**.
Bu, `isPlatformAdminGuardedPath`'in de tanımayacağının **canlı, bağımsız kanıtı** —
iki kapı aynı fonksiyonu tüketiyor.

### (c) Canlı: ÇÖZÜLEN bir kiracı host'unda kodlanmış yol kiracı katmanını GEÇİYOR

```
Host: isolation-a-b53b7ef4-d28.arkesoft.localhost   (DB'de active, seed kiracı)
GET /trpc/platform%2EtenantList?input=%7B%7D   → 401 UNAUTHENTICATED  (404 DEĞİL)
GET /trpc/registration%2EcreateTenant          → 401 UNAUTHENTICATED  (404 DEĞİL)
```

⇒ Kodlanmış yol `TenantGuard`'ın `resolved` dalından **geçiyor**; kalan tek kapı
`AuthGuard`'ın üyelik dalı.

### (d) Somut sömürü senaryosu — kim, hangi girdiyle, ne elde eder

1. **Aktör:** platform yöneticisi oturumunu elinde tutan biri — ya yöneticinin
   kendisi (allowlist'te olmayan bir ağdan, ör. evden), ya da oturum+TOTP'yi çalmış
   bir saldırgan. (2FA ve `platform_admin` kaydı **hâlâ gerekli** — bu yüzden
   `critical` değil.)
2. **Ön koşul:** aktörün ÇÖZÜLEN bir kiracı host'unda üyeliği olmalı. ⚠ Bu ön koşulu
   aktör **kendisi üretebilir**: `registration.createTenant` herkese açık
   `protectedProcedure`'dür; kendi kiracısını kurar ve `owner` olur.
3. **Girdi:** `GET https://<kendi-slug>.arkesoft.app/trpc/platform%2EtenantList?input={}`
   — çerez otomatik gider (`Domain=.${APP_BASE_DOMAIN}`), `Origin` **gerekmez**
   (GET güvenli metot ⇒ `SameOriginGuard` geçirir).
4. **Sonuç:** `PlatformAdminIpGuard` **hiç çalışmaz** — üç fail-closed dalın
   (`empty_allowlist` / `ip_not_allowed` / `unknown_ip`) hiçbiri değerlendirilmez.
   Aktör **tüm kiracıların** `slug`/`name`/`status`/`planId`/`planName`/`createdAt`
   listesini ve `platform.auditLog`'un tamamını izinsiz ağdan okur; üstelik
   `platform_audit_log`'a **izin verilmiş bir ağdanmış gibi** bir
   `tenant_impersonation_started` satırı yazılır (`ip` kolonu saldırganın IP'sini
   taşır ama kapı tetiklenmediği için **hiçbir red kaydı yoktur**).
5. ⚠ **Varsayılan yapılandırmada bu daha da keskin:** `SUPERADMIN_IP_ALLOWLIST`
   varsayılanı `''` ⇒ ADR-0023 §5'e göre yüzeyin **tamamı kapalı** olmalı; `%2E` ile
   **tamamı açık**.
6. ⚠ **`DOĞRULANAMADI` (dürüstçe):** son hop (kimliği doğrulanmış, platform
   yöneticisi + üye bir oturumla 200 alınması) canlı koşturulmadı — kaynak dosya
   değiştirme/test ekleme iznim yok ve elimde böyle bir oturum yok. (a)+(b)+(c)'nin
   üçü **ölçüldü**; yalnızca zincirin son halkası çıkarsamadır.

### (e) Neden `high`, `critical` değil

ADR-0023 §5 bu kapıyı **yazılı olarak** _"birincil yetkilendirme DEĞİL, üçüncü
katman"_ ilan ediyor ve birincil katman (oturum + `platform_admin` + 2FA) **ayakta**:
kiracı verisi yetkisiz bir kimliğe açılmıyor, kiracı izolasyonu ihlal edilmiyor.
Yine de bulgu `medium` değil `high`: kapı **kısmen değil tamamen** atlatılabiliyor,
"fail-closed" garantisi **tek bir karakter kodlamasıyla** yok oluyor ve bu, ROADMAP
kapsam maddesinin (_"IP kısıtlama seçeneği"_) teslim ettiği tek mekanizma.

---

## 2. ⭐ DÖRT YÜZEYE AYRI AYRI CEVAP

### ① YENİ YETKİLENDİRME EKSENİ — platform yetkisi · **TEMİZ**

| Doğrulama                                                          | Sonuç                                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TenantRole` enum'u değişti mi                                     | **HAYIR.** `migration.sql`'de `ALTER TYPE … ADD VALUE` yok (ölçüldü); `permissions-catalog.test.ts:51` pini dokunulmamış                                                                                                  |
| İki adımlı kapı doğru mu                                           | **EVET.** `platform-admin-procedure.ts:54-64`: (a) `requirePlatformAdmin` TOTAL ⇒ kayıt yoksa `PlatformAdminRequiredError` (403), (b) `twoFactorEnabled === false` ⇒ `twoFactorRequired()` (403). 401 **değil**           |
| Yetki oturumda taşınıyor mu                                        | **HAYIR.** `session` şeması diff'te yok; `requirePlatformAdmin` her istekte `platform_admin` + `app_user.two_factor_enabled` okuyor (`impersonation.service.ts:111-127`) ⇒ iptal gecikmesi yok (ADR-0023 Karar 1)         |
| Platform yöneticisi **tek başına** kiracı verisi alıyor mu         | **HAYIR.** `platform-authz.isolation.test.ts` öbek (C): 2FA'lı platform yöneticisi, hiçbir kiracıya üye değil ⇒ `tenant.current` **403 `TENANT_MEMBERSHIP_REQUIRED`**. `auth.guard.ts:113-147` üyelik dalı **değişmemiş** |
| ⚠ Platform kimliğiyle kiracı ucuna çağrı sessizce hak kazanıyor mu | **HAYIR** — yukarıdaki canlı test tam bu iddiayı ölçüyor. Ek yapısal kanıt: `platform.tenantList` çağrısı `membershipReadCalls`'ı sıfır bırakıyor (S5'in hermetik testi) ⇒ iki sistem birbirine bağlı değil               |
| Ters yön (kiracı rolü → `platform.*`)                              | **403 `PLATFORM_ADMIN_REQUIRED`**, beş rol × iki uç = 10 senaryo canlı (`platform-authz.isolation.test.ts` öbek A). AC-6 kümesi `PROCEDURE_SURFACE`'ten TÜRETİLİYOR, elle yazılmıyor                                      |
| Varlık oracle'ı mı                                                 | **DEĞİL.** `PLATFORM_ADMIN_REQUIRED` ve `TWO_FACTOR_REQUIRED` ikisi de **yalnızca çağıranın kendisi** hakkında; `context` yalnızca loglanır, `publicDetails` boş                                                          |

⭐ **R-PO6 (builder beyanı ELLE okundu):** `procedure-surface.ts:118-120` ↔
`platform.router.ts:51,63,75` **birebir uyuşuyor** — `platform.session` =
`'protected'` (**doğru ve bilinçli**: AC-4(a)'nın ön koşulu, çıktısı
`{isPlatformAdmin, twoFactorEnabled}` ⇒ sıfır kiracı verisi), `tenantList` ve
`auditLog` = `'platformAdmin'`. Yanlış beyan **yok**.

### ② CSRF GÜVENİLİR ORİJİNİ — dört azaltma · **DÖRDÜ DE AYAKTA**

| #   | Azaltma                                    | Bağımsız doğrulamam                                                                                                                                                                                                                                            |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | Tek türetme fonksiyonu                     | **EVET.** `grep -rn "AUTH_BASE_URL" apps/api/src` → `.origin` türetimi yalnızca `trusted-origins.ts:47`. `same-origin.guard.ts` artık `env.AUTH_BASE_URL`'i **hiç okumuyor** (diff'te doğrulandı), `resolveTrustedOrigins(this.env)` çağırıyor                 |
| b   | Kardinalite assertion'ı                    | **`toHaveLength`.** `trusted-origins.test.ts:38,47,58` → `toHaveLength(1)` / `toHaveLength(2)` / `toHaveLength(2)`. ⚠ `toContain`'e **düşürülmemiş** (dosyada `toContain` hiç yok)                                                                             |
| c   | `Access-Control-Allow-*`                   | **Hiçbir ortamda üretilmiyor.** `grep -rn "access-control-allow" apps/api/src` → yalnızca pin testi (`panel-origin-cors.test.ts:56-59`); üretim kodunda **0 eşleşme**. Pin dosyası `git status`'ta **el değmemiş**. `vite.config.ts`'te `cors: false` (açıkça) |
| d   | Joker / alt alan adı / `Origin` yansıtması | **YOK.** `trusted-origins.ts` tam-eşleşme dizeleri üretiyor; `isTrustedOrigin`/`detectViolationAgainstTrustedOrigins` **`includes()`** ile karşılaştırıyor (önek/sonek/regex yok). Yanıta hiçbir orijin **yansıtılmıyor** (CORS başlığı hiç yok)               |

⭐ **Tek kaynak garantisi korunmuş:** `auth-instance.ts:693` →
`trustedOrigins: [...resolveTrustedOrigins(env)]` — **hem** `SameOriginGuard` **hem**
Better Auth **aynı** fonksiyonu tüketiyor.

⭐ **§4.5 bayt-birebir iddiası TEYİT EDİLDİ (bağımsız ölçüm):**
`git status --porcelain apps/api/src/__tests__/same-origin-guard*.test.ts
apps/api/src/__tests__/panel-origin-cors.test.ts` → **boş çıktı** ⇒ üç pinli test
dosyasına **el değmemiş**. Mekanizmayı da doğruladım: eski
`detectSameOriginViolation(headers, method, trustedBaseUrl: string)` imzası
**korunmuş** ve yeni çekirdeğe delege ediyor; o yüzden eski testler derlenip
geçebiliyor. `SUPERADMIN_BASE_URL` verilmediğinde liste tek elemanlı ⇒ davranış
değişmiyor.

⚠ **Tek çatlak (F6, `low`):** `z.url()` özel-olmayan şemayı kabul ediyor ⇒ `.origin`
literal `"null"` olabilir ve `Origin: null` isteklerini güvenilir kılar. Sınıf
önceden de vardı (`AUTH_BASE_URL`), bu sürüm ikiye çıkardı.

### ③ IMPERSONATION — RLS'e bitişik erişim yolu · **TEMİZ**

| Doğrulama                                                   | Sonuç                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adaptörler DI'dan yalnızca `ImpersonationService` alıyor mu | **EVET.** `platform-read.port.adapter.ts:36` ve `platform-admin-read.port.adapter.ts:31` — ikisinde de `@Inject(ImpersonationService)`; `PrismaService` **enjekte edilmiyor**                                                                                        |
| `runImpersonated`'ın çağrı yeri sayısı                      | **TAM 1** — `platform-read.port.adapter.ts:51`. Elle doğruladım (`platform/**` 8 dosyanın tamamı okundu), kapı da aynı sonucu assert ediyor                                                                                                                          |
| Yeni DB rolü / GUC / `SECURITY DEFINER` / view              | **HİÇBİRİ.** Canlı katalog: `public` şemasında view/matview/foreign tablo = **0**, `pg_proc.prosecdef` = **0**, kullanıcı trigger'ı = **0**. Migration'da `CREATE ROLE`/`CREATE VIEW`/`SECURITY DEFINER`/`set_config`/`GRANT` → **0 eşleşme** (yalnızca yorum metni) |
| `rolsuper \| rolbypassrls`                                  | **`f \| f`** — `arkesoft_app`, `arkesoft_auth`, `arkesoft_migrator` üçünde de (canlı). (`arkesoft` bootstrap superuser'ı `t\|t`; bu tasarımdan beri böyle, bu sürümle ilgisiz)                                                                                       |
| GUC sızıntısı (döngü içinde çapraz kiracı)                  | **YOK.** `withTenant` → `set_config(<ad>, tenantId, true)` = **`SET LOCAL`** (`packages/db/src/tenant-context.ts:123`) ⇒ her yineleme ayrı transaction, GUC transaction sonunda düşüyor. Havuzlanan bağlantıya sızamaz                                               |
| `tenantIds` girdiden mi geliyor                             | **HAYIR** — `listTenantsBasic()`'in kendi sorgusundan türüyor (`platform-read.port.adapter.ts:46`) ⇒ CLAUDE.md §7 madde 6 **hiç doğmuyor**                                                                                                                           |
| `TenantTransactionClient` genişletildi mi                   | **HAYIR.** `packages/db/src/client.ts:284-287` bu diff'te **değişmemiş**; `subscription` zaten v0.1.0'dan beri üye                                                                                                                                                   |
| RLS'in karşıt kanıtı                                        | Canlı: `subscription` `relrowsecurity                                                                                                                                                                                                                                | relforcerowsecurity` = **`t\|t`**; platform tabloları `f\|f`(doğru,`PLATFORM_LEVEL_TABLES` üyesi) |

⚠ **İki `low`:** F5 (kapı needle'larının sözdizimi kırılganlığı) ve F4
(`platform_admin` üzerindeki `INSERT` yetkisi + getter'ın write metotlarını açması).

### ④ FAIL-CLOSED IP ALLOWLIST · ⚠ **F1 (high) BURADA**

| Doğrulama                                       | Sonuç                                                                                                                                                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Üç dal doğru kodlanmış mı                       | **EVET** — `platform-admin-ip.guard.ts:82-94`: boş liste → 403, `UNKNOWN_IP` → 403, listede yok → 403. Sıra da doğru (`UNKNOWN_IP` kontrolü `includes` **öncesinde**)                                                   |
| Varsayılan fail-closed mı                       | **EVET** — `api-env.ts` `SUPERADMIN_IP_ALLOWLIST: z.string().default('')` + `parseSuperadminIpAllowlist('')` → `[]` → 403                                                                                               |
| ⚠ Hata mesajı allowlist İÇERİĞİNİ sızdırıyor mu | **HAYIR.** `PlatformNetworkNotAllowedError` yalnızca üç kapalı `reason` değerinden birini `context`'e koyar; `publicDetails` **override edilmiyor** (boş) ⇒ tel gövdesi ne IP ne liste taşır. Testi de var (`:158-159`) |
| ⚠⚠ Kapı atlatılabiliyor mu                      | ⚠⚠ **EVET — F1.** Yüzde-kodlanmış yol kapıyı tamamen baypas ediyor (§1)                                                                                                                                                 |

**⭐ Orkestratör kararı hakkında gerekçeli görüşüm — KARAR DOĞRU, iki şartla**

`/auth/*` uçlarını IP ile kısıtlamamak **mimari olarak zorunlu**, kolaylık değil:
`AUTH_DELEGATED_PATHS` aynı Nest rotalarını `apps/admin` ile paylaşıyor; IP kapısı
oraya konsa **her kiracı yöneticisinin girişi** kırılırdı. Kapsamı `platform.*`
tRPC yollarıyla sınırlamak ADR-0023 §5'in yazılı sınırıyla (_"üçüncü katman"_)
tutarlı ve kalan açıklık **bilinçli**: izinsiz ağdan biri **giriş yapabilir** (kimlik

- TOTP hâlâ gerekli) ama hiçbir veri ucunu okuyamaz.

İki şart ekliyorum:

1. **F1 kapanmadan bu kararın koruması YOK.** Karar _"hiçbir veri ucunu okuyamaz"_
   iddiasına dayanıyor; `%2E` ile o iddia bugün **yanlış**. Karar F1'in düzeltmesiyle
   birlikte geçerli olur.
2. **Giriş yüzeyinin kendi savunması ölçüldü ve yeterli:** `/auth/sign-in/email` ve
   altı `two-factor` yolu `RATE_LIMITED_ROUTES`'ta (IP + e-posta kapsamlı) ⇒ IP
   kapısının kapsamadığı yüzeyde kaba kuvvet savunması **var**. ⚠ Ama o yüzeyin yol
   eşleştirmesi de aynı normalizer'a dayanıyor; `/auth/*` için `%2E` **güvenli**
   (çünkü `AUTH_DELEGATED_PATHS` TAM eşleşmelidir ⇒ kodlanmış yol hiçbir rotaya
   düşmez, 404), `/trpc/registration.*` için **değil** (F2).

---

## 3. ⭐ `PrismaService.platform` GETTER'I — **RLS BAYPAS YÜZEYİ DEĞİL** (gerekçeli)

`prisma.service.ts:119-139`,
`Pick<PrismaDatabase, 'platformAdmin' | 'platformAuditLog' | 'plan'>`.

**Teyit ettim:** `platform/**` 8 dosyanın tamamını okudum — `platformAdmin`/
`platformAuditLog`/`plan` delegelerine erişen **tek** dosya
`impersonation.service.ts`; `AppPrismaDatabase`/`PrismaDatabase` tipi
`platform/**`'de **hiç import edilmiyor**.

**Neden RLS baypası değil (tip değil, DB ölçümü):** RLS sınırı tip sistemi değil,
veritabanı. Üç tablonun üçü de **platform seviyesi** ve zaten RLS taşımıyor (canlı:
`platform_admin`/`platform_audit_log` → `relrowsecurity = f`; `plan` de
`PLATFORM_LEVEL_TABLES` üyesi). Getter **aynı** `#client`'ı dönüyor, yani bir
ayrıcalık **eklemiyor** — yalnızca derleme zamanında görünür model kümesini
genişletiyor. Kiracı tablosu bu getter'a eklenseydi bile `arkesoft_app`
`BYPASSRLS` taşımadığı için (canlı `f|f`) GUC'suz okuma **sıfır satır** dönerdi;
bunun canlı karşıt kanıtı `platform-tables.isolation.test.ts`'te mevcut
(`subscription` GUC'suz **görünmez**).

⚠ **Tek gerçek eksen (F4, `low`):** `Pick<>` **delegenin tamamını** verir —
`platformAdmin.create/update/delete` dahil. `platform_admin` platform yetkisinin
**tek** kaynağı ve `arkesoft_app` o tabloda `INSERT/UPDATE/DELETE` taşıyor (canlı
ölçüldü). Bugün yazan kod yolu yok, ama `audit-log.writer.ts`/`runImpersonated`
emsalindeki **yazma kapısı** da yok. Öneri F4'te.

---

## 4. ⚠⚠ ÜÇ KAYITLI BORCU YENİ BULGU SAYMADIM (R-PO7)

| #   | Kayıtlı borç                                                               | Bu rapordaki muamelesi                                                                                                                                                                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `platform_audit_log` tamper-evident DEĞİL (R-A6)                           | **BULGU YAZILMADI.** Canlı teyit ettim (`arkesoft_app` → `DELETE,INSERT,SELECT,UPDATE`) ve ADR-0023 "Olumsuz"/ROADMAP:3106 ile uyuştuğunu doğruladım. Linter kuralının **gevşetilmediğini** de doğruladım (`catalog-lint.ts` bu diff'te **değişmemiş**). Vade v0.0.20.1, kullanıcı onaylı. ⭐ F4 bundan **ayrı bir eksen** (yetki tablosunun INSERT'i), o yüzden ayrı yazıldı |
| 2   | IP kapısının birincil yetkilendirme olmaması + `ROADMAP:3109` ham IP borcu | **BULGU YAZILMADI.** `resolveClientIp` + `AUTH_TRUSTED_PROXY_COUNT` borcunu yeniden raporlamadım. ⚠ F1 bu borçla **ilgisiz**: F1 IP'nin **doğruluğu** değil, kapının **hiç çalışmaması**                                                                                                                                                                                      |
| 3   | `detail.tenantIds` indekssiz                                               | **BULGU YAZILMADI** (ADR-0023'ün yazılı kabul ettiği bedel). ⭐ F3 bundan farklı: indeks değil, listenin **tele çıkması** (`subject` üzerinden)                                                                                                                                                                                                                               |

⚠ **R-PO5 (GRUP 4 sonundaki beklenen `typecheck` kırmızılığı)** da bulgu sayılmadı —
S7 sonunda altı kapının yeşil olduğu Task dosyasında kayıtlı.

---

## 5. Girdi doğrulama · enjeksiyon · sır · PII · oran sınırı — özet

- **Girdi doğrulama:** iki girdi şeması Zod; `limit` **sınırlı** (`tenantList` 1-50
  varsayılan 20, `auditLog` 1-100 varsayılan 50) ⇒ sınırsız liste yok (R-A5).
  JSONB yazması `PLATFORM_AUDIT_DETAIL_SCHEMA_BY_ACTION` ile `.strict()` + `parse`
  (`safeParse` değil); `tenantIds` `.min(1)`. Env iki alan Zod. `satisfies
Record<PlatformAuditAction, …>` ⇒ yeni enum değeri şemasız kalamaz.
- **Enjeksiyon:** üretim kodunda ham SQL **yok** (`$queryRaw` yalnızca
  `tenant-context.ts`'in bağlı-parametreli `set_config`'i, değişmemiş). XSS: süper
  admin SPA'sında `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function` → **0
  eşleşme**. Açık yönlendirme: `redirect()` hedeflerinin tamamı **sabit** (`/`,
  `/giris`, `/iki-adimli-dogrulama`) — URL parametresinden okunan hedef **yok**.
  ⚠ E2E fixture'ında dize-interpolasyonlu SQL **var** ama test-only ve dört
  fail-closed kapı arkasında (`NODE_ENV=test`, docker loopback allowlist'i,
  slug/e-posta/kullanıcı-kimliği regex'leri) — üretim yüzeyi değil, bulgu yazılmadı.
- **Sır yönetimi:** `git diff --cached`/`git diff` üzerinde jeton taraması →
  repoya giren sır **yok**; `.env.example`'a eklenen iki satır **yorum**. TOTP sırrı
  tarayıcıda React metni olarak render ediliyor (üçüncü taraf QR servisi **yok** —
  `chart.googleapis`/`api.qrserver` → 0 eşleşme), yedek kodlar yalnızca bellekte,
  bir kez gösteriliyor. `console.*` → `apps/superadmin/src` ve
  `scripts/playwright/*` içinde **0** (testler hariç). `totpURI`'yi hata mesajına
  koyan tek yer (`platform-admin.ts:285`) yalnızca `secret` **yokken** tetiklenir ⇒
  sır sızdırmaz. Aktör **e-postası tele çıkmıyor** (yalnızca opak `actorUserId`) ⇒
  maskeleme tartışması doğmuyor.
- **PII / KVKK:** `platform_audit_log` `ip` + `user_agent` saklıyor — denetim izinin
  amacı için **gerekli ve yeterli**, fazla veri yok; `user_agent` kapıda 512'ye
  kırpılıyor. Platform yöneticisinin kimliği kiracı `audit_log`'una **yazılmıyor**
  (A-T21-1 doğru uygulanmış). ⚠ Kullanıcı silme akışı: `platform_admin.user_id`
  `ON DELETE CASCADE` ⇒ silme talebi platform yetkisini düşürür; denetim satırı
  (FK'siz, **olgu**) kalır — bu doğru tasarım, KVKK'nın denetim istisnasıyla uyumlu.
- **Oran sınırlama:** giriş + altı 2FA yolu zaten `RATE_LIMITED_ROUTES`'ta (IP +
  e-posta kapsamlı) ⇒ süper admin girişi **mevcut** savunmayı miras alıyor.
  `platform.*` oran sınırlı değil — tasarım gereği kabul edilebilir (IP kapısı +
  `platform_admin` + 2FA arkasında, iki sorgu/çağrı); **bulgu yazılmadı**. ⚠ Ancak
  F1 kapanmazsa bu değerlendirme de zayıflar.
- **SSRF / dosya:** kullanıcı verisinden türeyen giden istek **yok**; dosya yükleme
  yüzeyi bu sürümde **açılmadı**. Mailpit/Docker uç noktaları test-only ve
  loopback allowlist'inde.

---

## 6. CLAUDE.md §7 — 18 madde

| #    | Madde                                   | Sonuç                                                                                                                                                                                                                                      |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1-3  | `tenant_id` / RLS / bileşik indeks      | **N/A, doğru** — yeni kiracı tablosu yok; iki tablo da platform seviyesi (canlı `f\|f`)                                                                                                                                                    |
| 4    | `tenantProcedure`/`permissionProcedure` | **GEREKÇELİ İSTİSNA** (ADR-0023 Karar 2): süper admin host'u rezerve ⇒ `ctx.tenant` daralmaz. `platformAdminProcedure` `protectedProcedure` üzerine **daha sıkı** kapı. `publicProcedure` **kullanılmıyor**; `AUTH_EXEMPT_PATHS` **12'de** |
| 5    | `withTenant()`                          | ✅ Kiracı verisine tek yol `runImpersonated` → `withTenant`; `.platform` yalnızca platform tabloları                                                                                                                                       |
| 6    | Girdideki `id`'ye güvenilmiyor          | ✅ **Hiç doğmuyor** — `tenantIds` sunucunun kendi sorgusundan                                                                                                                                                                              |
| 7-10 | Kuyruk / dış kaynak / önbellek / dosya  | **N/A** — bu sürüm hiçbirine dokunmuyor                                                                                                                                                                                                    |
| 11   | Çapraz okuma/yazma testi                | ✅ Prob gerekmiyor (yeni kiracı tablosu yok); yerine iki canlı test — beş rol × `platform.*` 403 ve `runImpersonated(tenantA)` içinde `tenantB.subscription` **okunamıyor**                                                                |
| 12   | Hata mesajı varlık sızdırmıyor          | ✅ Üç 403 **yalnızca çağıran** hakkında; `TENANT_NOT_FOUND` tek 404                                                                                                                                                                        |
| 13   | Logda `tenantId`                        | ✅ Platform operasyonunun kiracısı yok; erişilen küme `platform_audit_log.detail.tenantIds`'te                                                                                                                                             |
| 14   | Süper admin → impersonation + denetim   | ✅ Üç ayak: yapısal (zorunlu `entry`) + mekanik kapı + çalışma zamanı (N çağrı = N satır). ⚠ Kapı needle'ı kırılgan (F5)                                                                                                                   |
| 15   | Bağımlı/türetilmiş DB nesnesi           | ✅ **0** view/matview/foreign tablo, **0** kullanıcı trigger'ı (canlı) ⇒ linter kör noktasına girilmiyor                                                                                                                                   |
| 16   | `SECURITY DEFINER`                      | ✅ **0** (`prosecdef` canlı ölçüldü)                                                                                                                                                                                                       |
| 17   | `public` dışına şema                    | ✅ Değişmedi                                                                                                                                                                                                                               |
| 18   | Sır taşıyan tablo → dört liste          | ✅ **Doğru karar:** iki tablo parola özeti/token/TOTP sırrı/kurtarma kodu **taşımıyor** (migration'ın kolon listesi okundu) ⇒ dört liste dokunulmamış (`git status` ile teyit)                                                             |

**Karşılanmayan madde numarası: YOK.**

---

## 7. ÖLÇÜM KOŞULLARI (AGENT_BASELINE §4, ders 2)

- Makine: ~25 kullanıcı konteyneri koşuyor (`docker ps` → 25 isim); `arkesoft-*`
  altyapısı ayakta, **dokunulmadı**.
- Koşturulan komutlar: `pnpm audit` (1), `docker exec … psql -tAc` **salt okuma** (4),
  `curl` **salt okuma GET** (7), `node -e` saf hesap (1), `git diff`/`status`/`grep`.
- ⚠ **Koşturulmayanlar:** `pnpm test`, `test:isolation`, `test:e2e`, `guards`, `build`
  — gate paralelliği ve `EMAIL_IP_LIMIT` kısıtı gereği. Test sayıları bu raporda
  **tekrarlanmadı**; Task dosyasındaki S3/S5/S7/S8 ölçümleri kaynak kabul edildi.
- Kök `.env` **okundu, yazılmadı**. Port 3000/5173/5174'e **dokunulmadı** (prob
  yalnızca :3100 `apps/api` ve :3000 `/health` HEAD-benzeri durum kodu).
- `git stash`/`checkout --`/`restore`/`add`/`commit` **yapılmadı**. Hiçbir kaynak
  dosya değiştirilmedi; yazılan tek dosya bu rapordur.
