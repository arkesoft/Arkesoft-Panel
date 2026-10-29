T-006 — Kimlik doğrulama (Better Auth) — QA Gate, Tur 1
Tarih: 2026-10-29
Sürüm: v0.0.5 (minor)
Dal: main (commit atılmadı)

GATE: qa
SONUÇ: PASS

---

## AC1–AC11 — tek tek, komut koşarak doğrulama

AC1: PASS — `pnpm lint && pnpm typecheck && pnpm test && pnpm test:isolation && pnpm build && pnpm format:check`
→ lint 15/15, typecheck 15/15, build 12/12, format:check temiz (ilk koşum, cache hit —
turbo içerik hash'ine dayalı, içerik değişmeden tekrar koşulmuyor, geçerli).
→ `pnpm test`: errors 41 + db 166 + api 266 = **473** (baseline "> 314" ve Orkestratör'ün
"473" ölçümüyle eşleşiyor). İKİ KEZ net-yeşil koşum (`test-full2.log`), BİR KEZ
`shutdown.test.ts` flaky FAIL (ayrıntı aşağıda, madde "Flaky test").
→ `pnpm test:isolation`: db 14 + api 1 = **15** (baseline "≥14" aşıldı, AC10'un yeni
izolasyon testi dahil).
Kapı genel olarak PASS; flaky test ayrı madde olarak raporlanıyor (FAIL kuralı
tetiklemiyor — tek medium bulgu).

AC2: PASS — `packages/db/src/tenancy.ts` tek satır eklendi (`session`,`account`,
`verification` → `PLATFORM_LEVEL_TABLES`). `pnpm test` içindeki `catalog-lint.test.ts`
(db 166'nın parçası) yeşil → `UNCLASSIFIED_TABLE`/`TENANT_ID_ON_PLATFORM_TABLE`
üretmiyor. Bağımsız doğrulama: canlı Postgres'te
`SELECT relname, relrowsecurity FROM pg_class ...` → `session/account/verification/
  app_user/tenant` → `relrowsecurity=f` (RLS yok, BEKLENEN), `tenant_membership` →
`t`/`t` (enable+force). `TENANT_SCOPED_TABLES` değişmedi (tek eleman) — prob tamlığı
kapısı kırılmadı.

AC3: PASS — Canlı DB: `app_user` tek kullanıcı kimlik tablosu; `account`/`session`
`app_user(id)`'ye FK; `tenant_membership.user_id` FK'si **değişmeden** `app_user(id)`'ye
bakıyor (`\d app_user` → "Referenced by" listesi doğrulandı).

AC4: PASS — Gerçek Postgres + **gerçek Mailpit HTTP API'si** (`mailpit-client.ts`,
`fetch('http://127.0.0.1:8025/api/v1/...')`, Zod ile parse, mock YOK — grep
doğrulandı). **Kasıtlı bozma ile bağımsız kanıt:** `docker stop arkesoft-mailpit` →
`auth-flow.test.ts -t AC4` çalıştırıldı → 2 test `ECONNREFUSED 127.0.0.1:8025` ile
FAIL (ağ bağımlılığı gerçek). `docker start arkesoft-mailpit` → aynı test yeniden
PASS. (a) kayıt 2xx, token null · (b) Mailpit'ten gerçek mesaj okunup `Text` gövdesinden
URL/`token` çıkarılıyor (`extractFirstUrl`+`extractQueryParam`, throw-on-missing) ·
(c) doğrulama 2xx · (d) giriş `Set-Cookie` `HttpOnly`+`SameSite=Lax`,
`NODE_ENV=production` ayrı test uygulamasında `Secure` de doğrulandı · (e)/(f) S6'nın
`auth-sessions.test.ts`/`auth-cross-tenant.isolation.test.ts`'inde (korumalı
uç 200 + aynı çerez çıkıştan sonra 401, AC6 altında).

AC5: PASS — `auth-flow.test.ts` "AC5 — doğrulanmamış hesabın giriş denemesi": giriş
403 `EMAIL_NOT_VERIFIED`, `Set-Cookie` YOK. Korumalı uç 401 `UNAUTHENTICATED`
tarafı `auth-guard.test.ts`/`validation.test.ts` zincirinde kapsanıyor (266 testin
parçası, ayrıca `tenant-resolution.test.ts` ve `concurrency.test.ts`'in `AuthGuard`
global olduktan sonra kimliksiz isteklerin reddedildiği dolaylı kanıtı).

AC6: PASS — `auth-sessions.test.ts`: iki giriş → liste **tam 2**, `assertNoRawSecret`
ile ham `"token"`/`"password"` JSON'da YOK · birini sonlandır → o çerez 401, diğeri
200 · tümünü sonlandır → ikisi 401 · başkasının `sessionId`'si → 404
`SESSION_NOT_FOUND` (+ var olmayan id ile AYNI 404 — K5). **A-G8 kasıtlı bozma ile
bağımsız kanıt (ayrı madde, aşağıda):** `cookieCache.enabled` geçici olarak `true`
yapıldı → test gerçekten KIRMIZI verdi (`expected 200 to be 401`, revoke sonrası
hâlâ 200 — cache canlı tutuyor) → geri alındı, `diff`/`cp` ile byte-birebir
restorasyon kanıtlandı, test yeniden YEŞİL. AC6 sahte-yeşil DEĞİL.

AC7: PASS — `rate-limit.test.ts` üç seviye: (1) birim (mock servis), (2) `RateLimitService`
gerçek Redis (atomiklik: 30 eşzamanlı istek, limit=10 → tam 10 kabul/20 ret), (3) HTTP
gerçek Postgres+Redis+Mailpit — 5. başarısız sonrası 6. istek 429+`Retry-After`;
araya başarılı giriş → sayaç sıfırlanır, 429 gelmez; IP eşiği (20/15dk) AYRI describe/
AYRI `createTestApp()` ile doğrulanıyor (IP sayacının önceki testin kalıntısını
almaması için bilinçli ayrım); şifre sıfırlama 4. istek 429; kayıt/doğrulama
yeniden-gönderim uçları da (onaylı kapsam genişletmesi) 4. istek 429; varlık-
sızdırmazlık: var olan/olmayan e-posta için status+gövde+Retry-After AYIRT EDİLEMEZ.
**S8'in `create-test-app.ts` flush'ının sahte-yeşil riski incelendi (ayrı madde,
aşağıda) — flush yalnızca `app.init()` sonrası BİR KEZ çalışıyor, eşik gerçek
ardışık HTTP istekleriyle ölçülüyor, sahte yeşil DEĞİL.**

AC8: PASS — `auth-secret-leak.test.ts`: tam akış (kayıt→doğrulama→giriş→korumalı
uç→liste→tümünü sonlandır) bellek NDJSON stream'inde yakalanıyor; ham parola,
doğrulama token'ı, `Set-Cookie`/`Cookie` değerleri, `Authorization`,
`BETTER_AUTH_SECRET`, tam e-posta, `ipAddress` dizesi — HİÇBİRİ log metninde YOK.
**A-G7 bağımsız ölçüm (ayrı madde, aşağıda):** Better Auth'un gerçek kaynağı
(`better-auth@1.7.14` `dist/**/*.mjs`) tarandı, `logger.warn/debug` çağrılarının
HİÇBİRİ e-posta/token/parola içermiyor (yapılandırma uyarıları, secret ENTROPİ
uyarıları vb.) — A-G7 doğrulandı. Ayrıca `createBetterAuthLogger` zaten pozisyonel
`args`'ı hiç forward etmiyor (ikinci bağımsız savunma katmanı). İKİNCİ describe
bloğu (better-call `router.mjs:93` `console.error`) ÖLÇÜM olarak koşturuldu,
gerçekten 1 çağrı üretiyor ama bu senaryoda DATABASE_URL/parola İÇERMİYOR (ölçülmüş,
assert'siz, kapsam dışı — bkz. bulgu listesi, low).

AC9: PASS — `tenant-exempt-paths.test.ts` (tam 12 eleman, tam liste) + `auth-exempt-
  paths.test.ts` (18 test) + `auth-path-sets.test.ts` (ÜÇÜNCÜ kesişim testi:
`AUTH_DELEGATED_PATHS ∪ AUTH_OWN_PATHS ⊆ TENANT_EXEMPT_PATHS`, ayrıca `AUTH_OWN_PATHS
  ∩ AUTH_EXEMPT_PATHS = ∅` ve "tenancy hiçbir .ts dosyası auth'tan import etmiyor"
mekanik taraması) — hepsi yeşil, tam eşleşme (prefix/regex yok). A-G6'nın gerçek
Better Auth kaynağından ölçtüğü sapma (`forget-password`→`request-password-reset`)
dosya başı yorumunda açık, sayı (yedi) değişmedi.

AC10: PASS — `auth-cross-tenant.isolation.test.ts`, gerçek Postgres + gerçek HTTP
(`createTestApp`, `supertest`). Tenant A'ya üye kullanıcı → tenant B host'unda
(`x-arkesoft-tenant`) **403 `TENANT_MEMBERSHIP_REQUIRED`**, gövde `tenantId`/
`tenantId` taşımıyor; AYNI çerez tenant A'da **200**, `@CurrentUser()` kimliği
doğru. **Bağımsız koşum:** `pnpm exec vitest run --config vitest.isolation.config.ts`
(apps/api) → 1/1 PASS, gerçek log satırında `code:"TENANT_MEMBERSHIP_REQUIRED"`

- gerçek `tenantId`/`userId` görüldü (ham log çıktısı okunarak doğrulandı).
  `createTenantIsolationSuite()` içine girmeme gerekçesi (architect/Orkestratör
  yorumu — `session` platform tablosu) kabul edilebilir, HTTP hattı eşdeğer kanıt
  sağlıyor.

AC11: PASS — `mail-transport.test.ts`: katalogda olmayan anahtar → throw; var olan
anahtar ama eksik değişken → throw (`/eksik e-posta mesaj değişkeni/`). `pnpm audit
  --audit-level=high` → **1 high** (`multer`, pre-existing, GHSA-q7qp-rjg7-q26m) —
`better-auth`/`nodemailer` YENİ bir `high` getirmedi (AC11'in "mevcut 1'i aşmıyor"
şartı karşılandı, bağımsız komutla doğrulandı).

---

## Özel inceleme 1 — S6'nın yedi mevcut test dosyasına dokunması

`git diff` satır satır incelendi: `concurrency.test.ts`, `error-mapping.test.ts`,
`helpers/create-test-app.ts`, `log-correlation.test.ts`, `prisma-with-tenant.test.ts`,
`tenant-exempt-paths.test.ts`, `tenant-resolution.test.ts`, `validation.test.ts`.

- **Hiçbir `expect` kaldırılmadı/gevşetilmedi.** Tüm değişiklikler şu üç kategoriden
  biri: (a) `AuthGuard` global olduğu için isteklere `createAuthenticatedSession()` +
  `tenantMembership` + `Cookie` eklenmesi (davranış/assert değişmedi — ör.
  `concurrency.test.ts`'te hâlâ "20 entry → 20 response" assert'i aynı); (b)
  `tenant-exempt-paths.test.ts`'te kasıtlı, gerekçeli büyütme (2→12, dosya başı
  yorumunda + PM riski 6'da ÖNCEDEN beklenen, "kasıtlı inceleme kapısı" ÇALIŞTI); (c)
  `prisma-with-tenant.test.ts`'te pin GÜÇLENDİRİLDİ (eski jenerik negatif pin yerine
  `.db.account`'a doğrudan erişimin DERLENMEDİĞİNİ kanıtlayan daha isabetli bir negatif
  pin; pozitif pin `AppPrismaDatabase`'e karşı güncellendi — daraltmanın KENDİSİNİN
  doğru olduğunu ölçüyor, gevşetme değil).
- **`log-correlation.test.ts`'teki değişiklik aslında bir SIKILAŞTIRMA:** eşleşme
  artık yalnızca `msg==='istek tamamlandı'` değil, AYRICA `requestId===headerRequestId`
  şartını da taşıyor (çünkü auth fixture'ının ürettiği 3 ön istek aynı stream'e yazıyor
  — ilk eşleşen kaydı almak YANLIŞ olurdu). Bu bir zayıflatma değil, doğru
  davranışı korumak için gereken ek hassasiyet.
- Sonuç: S6'nın iddiası ("hiçbir expect gevşetilmedi") **doğrulandı**.

## Özel inceleme 2 — S8'in `create-test-app.ts` flush'ı sahte-yeşil mi?

Hayır. `flushRateLimitCounters()` yalnızca `app.init()` SONRASI, `createTestApp()`
çağrısı başına **BİR KEZ** çalışıyor — istek başına değil. `rate-limit.test.ts`'in
HTTP describe blokları `beforeAll`'da tek bir `createTestApp()` kurup İÇİNDE ardışık
gerçek HTTP istekleri atıyor (ör. "5 başarısız → 6. 429"); flush bu dizinin
ORTASINDA tekrar tetiklenmiyor, dolayısıyla eşik gerçekten zorlanıyor. Flush'ın amacı
dosyalar/describe blokları ARASI sızıntıyı önlemek (`apps/api/vitest.config.ts`
`fileParallelism:false` + `sequence.concurrent:false` ile dosyalar seri koşuyor,
doğrulandı) — IP eşiği testi bu yüzden kasıtlı olarak AYRI bir `createTestApp()`
örneğinde (dosya içi ayrı describe) çalıştırılıyor, "önceki testin IP kalıntısını
almasın" diye. Sahte yeşil değil, gerçek izolasyon.

## Özel inceleme 3 — A-G7 bağımsız ölçüm

`node_modules/.pnpm/better-auth@1.7.14.../dist/**/*.mjs` kaynağında `logger.warn/
debug/error` çağrıları tarandı (config/plugin uyarıları, JWT/OAuth hata mesajları).
Hiçbirinde e-posta, token veya parola dize olarak GEÇMİYOR. Ayrıca
`createBetterAuthLogger` zaten pozisyonel `args`'ı pino'ya iletmiyor (ikinci bağımsız
savunma). A-G7 doğrulandı.

## Özel inceleme 4 — A-G8 kasıtlı bozma

`apps/api/src/auth/auth-instance.ts`'te `cookieCache: { enabled: false }` →
`{ enabled: true }` olarak GEÇİCİ değiştirildi, `auth-sessions.test.ts` koşturuldu:
**gerçekten KIRMIZI** (`expected 200 to be 401`, iptal edilen çerez hâlâ 200
dönüyordu). Dosya `cp` ile yedeklenen orijinaliyle **byte-birebir** geri yüklendi
(`diff` çıktısı boş), test yeniden YEŞİL doğrulandı. AC6 gerçek bir şey ölçüyor,
sahte yeşil değil.

## Taksonomi/sahte-yeşil dedektörü — bağımsız doğrulama

`turbo run test --dry=json` / `turbo run test:isolation --dry=json` çıktıları
`.github/ci-expected-test-packages.txt` (3 satır) ve
`.github/ci-expected-isolation-packages.txt` (2 satır) ile BİREBİR eşleşti.
Dedektörün İKİ YÖNÜ de scratch'te geçici (repoya YAZILMAYAN) sahte "expected" dosyaları
ile test edildi: eksik satır (`@arkesoft/db` çıkarılınca) → kırmızı verirdi; fazla satır
(`@arkesoft/errors` eklenince) → kırmızı verirdi. Gerçek dosyalar hiç değiştirilmedi.
`*.isolation.test.ts` çift koşum kontrolü: `vitest.config.ts`'in `exclude` listesi
doğrulandı, `pnpm test`/`pnpm test:isolation` ayrık çalışıyor (AC10 testi yalnızca
`test:isolation`'da, V-P1'in geçiş notuyla uyumlu).

## skip/only/todo taraması

`grep -rnE "\.(skip|only|todo|skipIf|runIf)\("` tüm `apps/`+`packages/` → tek sonuç:
`packages/db/src/__tests__/migration-sql.test.ts:630` `it.skipIf(win32)` — T-005'te
onaylanmış, platform koşullu, MEŞRU. T-006'nın eklediği hiçbir dosyada skip/only/todo
yok.

## CLAUDE.md §7 (14 madde) — işaretleme

1. tenant_id NOT NULL — N/A (bu sürümde yeni tenant'a bağlı tablo yok, sadece
   `tenant_membership` zaten var). ✓
2. RLS + kanonik politika — `tenant_membership` için zaten var, değişmedi. Platform
   tabloları (session/account/verification) RLS YAPISAL OLARAK imkânsız — ADR-0008'de
   açıkça dürüst biçimde belgelendi, "DB garantisi DEĞİL" diye işaretlendi. ✓ (dürüst sapma)
3. Bileşik indeks — N/A (platform tabloları). ✓
4. `tenantProcedure`/HTTP eşdeğeri — `TenantGuard`+`AuthGuard` ikisi de global,
   fail-closed. ✓
5. `withTenant()` üretim yolu — `AuthGuard`'ın üyelik kontrolü ilk gerçek kullanımı,
   doğrulandı (canlı log'da görüldü). ✓
6. Kuyruk payload'ı tenantId — N/A (bu sürümde kuyruk işi yok). ✓
7. ID sahipliği doğrulanıyor — `sessionId` sahipliği 404 ile kapatıldı, test edildi. ✓
8. Dış kaynak tenant kapsamı — BİLİNÇLİ SAPMA (`platform:auth:` öneki, R1 onaylı,
   gerekçeli). ✓ (onaylı sapma)
9. Önbellek anahtarı — N/A, önbellek YOK (bilinçli, A-V26). ✓
10. Dosya yolu tenant önekiyle — N/A (bu sürümde dosya yükleme yok). ✓
11. Çapraz okuma+yazma testi — AC10 ile karşılandı (HTTP hattı). ✓
12. 404 ayrımı — K5 ile karşılandı (var olmayan/yetkisiz sessionId → 404). ✓
13. Log'da tenantId — `AuthContextMiddleware` → child logger, doğrulandı (canlı log).
    Küçük not: AC10 canlı log çıktısında `tenantId` alanı İKİ KEZ göründü (aşağıdaki
    low bulgu). ✓ (kozmetik not hariç)
14. Süper admin audit — N/A (bu sürümde süper admin işlemi yok). ✓

Karşılanmayan madde yok; mevcut N/A'lar mantıklı, sapmalar (8) gerekçeli ve onaylı,
madde 2'nin yapısal sınırı ADR-0008'de dürüstçe belgelenmiş.

---

## BULGULAR

- [SEV: medium] `apps/api/src/__tests__/shutdown.test.ts` (T-002, bu Task'ın DIŞINDA,
  `git diff` ile dokunulmadığı doğrulandı) — **flaky**: 3 tam `pnpm test` koşumundan
  1'inde `buildApiForShutdownTest()`'in `execFileSync('pnpm',['exec','tsc',...])`
  çağrısı "Command failed" ile FAIL verdi (muhtemelen 28 paralel vitest worker +
  gerçek `tsc` alt süreci arasında kaynak/zaman aşımı yarışı); aynı komut tek başına
  koşulduğunda (`cd apps/api && pnpm exec tsc -p tsconfig.build.json`) anında 0 ile
  çıktı. Diğer 2 koşumda 266/266 yeşil. Testi susturmadım, sadece raporluyorum
  (AGENT_BASELINE §madde 8). — **sorumlu ajan: devops/backend (T-002 sahibi)** — öneri:
  `buildApiForShutdownTest`'e retry veya daha büyük zaman aşımı/kaynak izolasyonu
  eklensin; T-006 kapsamı dışı olduğu için bu Task'ı BLOKE etmiyor (zaten mevcut bir
  borç, T-006 onu KÖTÜLEŞTİRMEDİ — 3 koşumun 2'si temiz).

- [SEV: low] `auth-secret-leak.test.ts`'in ikinci describe bloğu ÖLÇTÜ: better-call
  kütüphanesinin `router.mjs:93`'ü sağlayıcı seviyesi beklenmedik hatada
  `console.error` çağırıyor (bizim pino/redaction'ımızı ATLAYARAK, CLAUDE.md §4'ün
  "console.log yasak, her zaman enjekte edilen logger" ilkesinin üçüncü-parti
  kütüphane tarafında deldiği tek nokta). Bu koşuda ÖLÇÜLEN: DATABASE_URL/parola
  İÇERMİYOR (false) — bugün sır sızdırmıyor ama güvenceli DEĞİL (kütüphane sürümüne
  bağlı davranış, bizim kontrolümüzde değil). S5/S6 bunu bilerek "düzeltme kapsam
  dışı" olarak işaretlemiş, assert'siz bırakılmış — şeffaf. — **sorumlu ajan: architect**
  (ROADMAP'e teknik borç satırı olarak düşülmesi önerilir, henüz Teknik Borç
  tablosunda görünmüyor).

- [SEV: low] AC10'un canlı log çıktısında (`vitest.isolation.config.ts` koşumu) tek
  bir JSON satırında `"tenantId"` anahtarı İKİ KEZ göründü (`...,"tenantId":"X",...,
"tenantId":"X",...`) — geçerli JSON, aynı değer, güvenlik etkisi YOK, ama child
  logger kompozisyonunda (`AuthContextMiddleware`'in bağladığı `tenantId` + hata
  log'unun kendi `context.tenantId`'si) muhtemelen gereksiz bir tekrar var. —
  **sorumlu ajan: backend** (S6/S3) — kozmetik, düzeltme isteğe bağlı.

- [SEV: low] **Süreç bulgusu (Orkestratör'e):** QA incelemesi sürerken
  `apps/api/src/__tests__/zz-security-gate-probe.test.ts` adlı, `security` gate'inin
  kendi geçici ölçüm dosyası (başlığı "GEÇİCİ ... SİLİNECEK") paylaşılan çalışma
  ağacında belirdi (zaman damgası benim son resmi `pnpm test` koşumlarımdan SONRA —
  baseline sayılarımı KİRLETMEDİ, doğrulandı). Dosya `pnpm test`'in `include` deseniyle
  eşleşiyor (`vitest list` ile doğrulandı) — eğer `qa` ve `security` gate'leri AYNI
  checkout + AYNI paylaşılan Postgres/Redis üzerinde GERÇEKTEN eşzamanlı çalışıyorsa,
  bu PO/architect'in G1–G7 için zaten belirttiği "tek paylaşılan Postgres/Redis, paralel
  ajan çalıştırmayın" riskinin gate FAZINA da uzandığını gösterir. Bu Task'ı
  bloke etmiyorum (dosyaya dokunmadım, benim ölçümlerimi kirletmedi) ama Orkestratör'e
  bildiriyorum: gate ajanlarının (qa‖security‖solid) gerçekten paralel mi yoksa
  sıralı mı çalıştığı netleştirilmeli; paralelse izole checkout/DB gerekir. —
  **sorumlu: Orkestratör** (süreç).

---

ÖLÇÜMLER

KABUL KRİTERİ EŞLEMESİ:

| AC   | Test(ler)                                                                              | Sonuç                                                    |
| ---- | -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| AC1  | `pnpm lint/typecheck/test/test:isolation/build/format:check`                           | PASS (473/15/473/15 geçti; 1 flaky FAIL ayrı raporlandı) |
| AC2  | `packages/db/src/__tests__/catalog-lint.test.ts` + canlı `pg_class` sorgusu            | PASS                                                     |
| AC3  | canlı `\d app_user` / FK zinciri                                                       | PASS                                                     |
| AC4  | `auth-flow.test.ts` (AC4 describe'ları) + kasıtlı Mailpit kapatma/açma                 | PASS                                                     |
| AC5  | `auth-flow.test.ts` "AC5" describe                                                     | PASS                                                     |
| AC6  | `auth-sessions.test.ts` + A-G8 kasıtlı bozma                                           | PASS                                                     |
| AC7  | `rate-limit.test.ts` (6 describe)                                                      | PASS                                                     |
| AC8  | `auth-secret-leak.test.ts` + A-G7 kaynak taraması                                      | PASS                                                     |
| AC9  | `tenant-exempt-paths.test.ts` + `auth-exempt-paths.test.ts` + `auth-path-sets.test.ts` | PASS                                                     |
| AC10 | `auth-cross-tenant.isolation.test.ts` (bağımsız `vitest.isolation.config.ts` koşumu)   | PASS                                                     |
| AC11 | `mail-transport.test.ts` + `pnpm audit --audit-level=high`                             | PASS                                                     |

Karşılıksız kriter: YOK.

TEST SAYILARI:

- Yeni eklenen test dosyaları (apps/api): 14 (`assert-never`, `auth-cross-tenant.isolation`,
  `auth-delegation-allowlist`, `auth-exempt-paths`, `auth-flow`, `auth-guard`,
  `auth-path-sets`, `auth-secret-leak`, `auth-sessions`, `client-ip`, `mail-transport`,
  `rate-limit-policy`, `rate-limit`, `tenant-guard`) + 1 pin dosyası (db,
  `auth-model-narrowing.pin.ts`, assertion'sız tip pin, ölü kod değil — tip testi).
- Toplam geçen: `pnpm test` → **473** (errors 41, db 166, api 266) — baseline'dan
  **+159** (314→473, S6/S8'in eklediği auth testleri). `pnpm test:isolation` → **15**
  (db 14, api 1) — baseline'dan **+1** (AC10).
- Toplam başarısız (bu koşumlarda): 0 kalıcı; 1 **flaky** (`shutdown.test.ts`, T-006
  dışı, yukarıda raporlandı).

KOŞTURULAN KOMUTLAR (gerçek, bu oturumda):

| Komut                                                                                                                                 | Exit  | Özet                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------- |
| `pnpm lint`                                                                                                                           | 0     | 15/15 (cache hit, içerik hash'i değişmedi)           |
| `pnpm typecheck`                                                                                                                      | 0     | 15/15 (cache hit)                                    |
| `pnpm format:check`                                                                                                                   | 0     | "All matched files use Prettier code style!"         |
| `pnpm build`                                                                                                                          | 0     | 12/12 (cache hit)                                    |
| `pnpm test` (×3 tam koşum)                                                                                                            | 0,1,0 | 473/473, 1 flaky FAIL (`shutdown.test.ts`), 473/473  |
| `pnpm test:isolation`                                                                                                                 | 0     | 15/15                                                |
| `pnpm audit --audit-level=high`                                                                                                       | —     | 1 high (`multer`, pre-existing)                      |
| `docker stop/start arkesoft-mailpit` + `vitest run auth-flow.test.ts -t AC4`                                                          | 1→0   | AC4 Mailpit bağımlılığı kasıtlı bozma ile kanıtlandı |
| geçici `cookieCache:true` + `vitest run auth-sessions.test.ts` + geri alma (`diff` ile doğrulandı)                                    | 1→0   | AC6/A-G8 kasıtlı bozma ile kanıtlandı                |
| `pnpm exec eslint` (tek seferlik temp dosya, oluşturup silindi, `git status` ile temizlik doğrulandı)                                 | —     | R-1 katman 2 lint kısıtı gerçekten yakalıyor         |
| `turbo run test/test:isolation --dry=json` + geçici (repoya yazılmamış) scratch "expected" dosyalarıyla iki yönlü kırmızı/yeşil testi | 0     | sahte-yeşil dedektörü iki yönlü çalışıyor            |
| `grep -rnE "\.(skip                                                                                                                   | only  | todo                                                 | skipIf | runIf)\("` | —   | tek sonuç, T-005 onaylı `skipIf(win32)` |
| canlı Postgres sorguları (`pg_class`, `pg_policy`, `\d app_user/session/tenant_membership`)                                           | —     | AC2/AC3/K-E5 kanonik politika doğrulandı             |

Koşulmayan komutlar: `pnpm test:e2e` — bu sürümde yok (frontend yok, PM "FRONTEND VAR MI: hayır";
Playwright kritik akışı T-006'da tetiklenmiyor, `wcag`/`perf` de koşmuyor, PO'nun alt görev
tablosunda zaten belirtilmiş). `pnpm test:contract` — bu sürümde `packages/trpc` doğmadığı için
konu yok (architect notu).
