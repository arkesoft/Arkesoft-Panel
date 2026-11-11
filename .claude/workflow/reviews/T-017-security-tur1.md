# T-017 — security gate, tur 1

- **Tarih:** 2026-11-10
- **Sürüm:** ROADMAP v0.0.15.1 (`T-017`)
- **Kapsam:** ADR-0019 (dokuz karar) uygulaması — oturum listesi, step-up, istemci IP kaynağı
- **Koşturulmayanlar (bilerek):** Playwright, `apps/admin` dev sunucusu, `turbo run build`,
  `prisma migrate reset`, `db push`, `db:rollback-roles`, `db:reset`, Redis `FLUSHALL/FLUSHDB/CONFIG SET`

```
GATE: security
SONUÇ: PASS
BULGULAR:
  - [SEV: low] apps/api/src/auth/rate-limit/rate-limit.policy.ts:152 (+ pathOf :137-142) — `buildPolicy` yazım-hatası guard'ı YOL ekseninde meşru biçimde genişletildi ama YÖNTEM eksenini `AUTH_OWN_PATHS` girdileri için TAMAMEN kaybetti: `pathOf()` yöntemi soyduğu için `buildPolicy('POST /auth/sessions', …)` veya `buildPolicy('GET /auth/sessions/revoke', …)` guard'dan SESSİZCE geçer; `resolveRateLimitPolicy('POST','/auth/sessions/revoke')` o durumda `undefined` döner ve hassas uç ORAN SINIRSIZ kalır. Bugün sömürülemez (ölçüldü: `sensitive-operations.ts:93-102` kapısı (b) bu iki rota için modülü yükletmez; `rate-limit-policy.test.ts` `GET /auth/sessions/revoke → undefined` negatifini pinler), ama `AUTH_OWN_PATHS`'in üçüncü üyesi (`GET /auth/sessions`) bu ağın DIŞINDA. — Düzeltme: `auth-own-paths.ts`'ten yöntem-nitelikli bir anahtar kümesi (`AUTH_OWN_ROUTE_KEYS`) dışa açıp routeKey'i ONA karşı karşılaştır, `pathOf`'u kaldır. — backend (S1)
  - [SEV: low] apps/api/src/auth/rate-limit/rate-limit.policy.ts:258-275 — step-up bütçesi ROTA BAŞINA sayılıyor (`buildScopeKey(policy.routeKey,'account',userId)`): altı `SENSITIVE_OPERATIONS` ucunun her biri ayrı 5/15dk bütçesi taşıyor → tek hesap için 15 dakikada 30, saatte 120 parola denemesi. Senaryo: çalınmış çerezle (XSS/cihaz hırsızlığı) gelen saldırgan parolayı bilmiyor; 2FA kapatma + oturum sonlandırma uçlarını DÖNÜŞÜMLÜ kullanarak bütçeyi altıya katlar. Etkisi sınırlı (scrypt + zaten geçerli oturum gerekli), bu yüzden `low`. — Düzeltme: `SENSITIVE_OPERATIONS` için TEK paylaşılan hesap-kapsamı anahtar ailesi (`stepUp`) — rota başına değil. — backend (S1)
  - [SEV: low] apps/api/src/__tests__/rate-limit.test.ts — iki yeni rotanın 429'u UÇTAN UCA ölçülmüyor; kablolama yalnızca YAPIM GEREĞİ kanıtlı (global `APP_GUARD` + politika varlığı + `resolveRateLimitPolicy` tablo pini). Gerçek bir "6. denemede 429" testi yok. — Düzeltme: `rate-limit.test.ts`'e `POST /auth/sessions/revoke` için hesap eşiği senaryosu ekle. — qa
  - [SEV: low] packages/trpc/src/__tests__/session-list.test.ts + apps/api/src/__tests__/trpc-http.test.ts:201-222 — ADR-0019 §9 bu kaynak için "kullanıcı-çapraz erişim testi ZORUNLU" diyor; REST taşımasında VAR (`auth-sessions.test.ts:265-268` — userB'nin listesi tam 1 satır; kapsamsız bir `findMany` paylaşılan dev DB'sinin 33k+ satırıyla bu assert'i kırar, yani pin yük taşıyor), tRPC taşımasında YOK (tek HTTP testi tek kullanıcılı). Sahiplik mantığı AYNI fonksiyonda olduğu için izolasyon kapalı; eksik olan taşıma seviyesi pini. — Düzeltme: `trpc-http.test.ts`'e iki kullanıcılı bir `session.list` turu ekle (A'nın listesi B'nin `sessionId`'sini İÇERMEZ). — qa
  - [SEV: low] apps/api/src/auth/rate-limit/client-ip.ts:83 — artık KALICI olarak saklanan ve panelde GÖSTERİLEN `session.ip_address` değerinin tek kaynağında ne biçim doğrulaması ne uzunluk sınırı var. Bugün sömürülemez (ölçüldü: `api-env.ts:76-80` → `AUTH_TRUSTED_PROXY_COUNT` varsayılanı `0` → soket adresi, istemci kontrolünde DEĞİL). Senaryo: üretimde vekil sayısı `>0` ayarlanıp gerçekte başlık ekleyen bir vekil olmazsa (veya sayı fazla girilirse) `hops[max(len-N,0)]` istemcinin verdiği dize olur → saldırgan KENDİ oturum satırına ve `audit_log.ip`'sine (bu ikincisi v0.0.14'ten beri var) keyfi uzunlukta keyfi dize yazar. XSS yok (React kaçışı; `apps/admin/src/features/sessions/` içinde `dangerouslySetInnerHTML`/`innerHTML` — ölçüldü, 0 eşleşme); kalan risk depolama şişmesi + denetim kaydı kirlenmesi. — Düzeltme: `resolveClientIp`'in dönüşünü IP biçimi/uzunluk ile kısıtla. — backend/devops
ÖLÇÜMLER:
  pnpm audit: critical 0 · high 1 (multer, PRE-EXISTING, @nestjs/platform-express geçişlisi) ·
              moderate 1 (minimatch, PRE-EXISTING, eslint geçişlisi, dev-only) · low 0 · info 0
              → YENİ advisory YOK; package.json/pnpm-lock.yaml diff'i BOŞ (yeni ana bağımlılık YOK)
  İncelenen dosya: 41 (36 değişmiş + 22 yeni'den güvenlik ilgili 41 benzersiz; ayrıca better-auth@1.7.14
              kaynağından 4 dosya: api/routes/password.mjs, api/routes/session.mjs, db/internal-adapter.mjs, db/with-hooks.mjs)
  Kendi koşumum (tek temiz koşum, hepsi yeşil): 244 test
              api step-up+coverage+ip-not-logged 18 · api auth-sessions 6 ·
              api rate-limit+rate-limit-policy+tenant-exempt-paths+auth-path-sets 116 ·
              api device-label+session-ip-and-last-seen+session-list-read-port-adapter+trpc-http 46 ·
              errors redaction 21 · trpc session-list+authz-consistency+procedures 37
  Tenant izolasyon listesi — karşılanmayan madde: 1,2,3,7,8,9,10,11,13,14 → HEPSİ "UYGULANAMAZ"
              (platform seviyesi tablo, ADR-0019 §9; canlı ölçüm: `session` tablosunda kiracı kolonu YOK)
              Karşılanan: 4,5,6,12,15,16,17. Gerçek eksik: YOK.
  AC9 birincil savunma (IP loglanmıyor) — BAĞIMSIZ ölçüm: tam akışın (kayıt → doğrulama → XFF'li giriş →
              liste → sonlandırma → revoke-all → 401 probe) TÜM log akışında `203.0.113.*` 0 eşleşme,
              HERHANGİ bir dotted-quad 0 eşleşme, `"ipAddress"`/`"userAgent"` anahtarı 0 eşleşme.
  Çift kayıt kontrolü: `TrpcModule → AuthModule` importu rota/guard çiftlemesi ÜRETMİYOR —
              tek boot'ta `Mapped {/auth/sessions/revoke, POST}` 1 kez; oran sınırı eşikleri (5/20) korundu.
  Migration/DB nesnesi: 0 (şema diff'i YALNIZCA yorum) · `SECURITY DEFINER` 0 · yeni `.sql` 0 · `public` dışı şema 0
  Ham SQL: 3 (yalnızca `packages/db/src/__tests__/session-metadata-columns.test.ts`, etiketli şablon,
              SIFIR interpolasyon, sonuç Zod ile parse) → enjeksiyon yüzeyi yok
  Sır taraması: `git diff HEAD` içinde özel anahtar/API anahtarı/sır literali 0; yalnızca test fixture parolaları
```

---

## On denetim noktası

### 1. `/auth/sessions/revoke` parola oracle'ı — oran sınırı yeterli mi?

**Denetlendi, `low` iki bulgu (yukarıda F2/F3); `critical`/`high` yok.**

- `RATE_LIMITED_ROUTES` 10 → 12 (`rate-limit.policy.ts:258-275`), iki rota `login` penceresi
  (`AUTH_LOGIN_RATE_WINDOW_SECONDS`, varsayılan **900 sn**, `api-env.ts:73`), hesap 5 / IP 20,
  `resetAccountOnSuccess: false`. `rate-limit-policy.test.ts` bu altı alanı birebir pinliyor (yeşil).
- **Kapsam zehirlenmesi bu kaynakta DOĞMUYOR — teyit edildi.** `accountScopeSource: 'sessionUserId'` →
  `rate-limit.guard.ts:138-141` `resolveSessionUserIdScopeValue()` → `getRequestContext().auth`'u okur ve
  **yalnızca** `auth.kind === 'authenticated'` dalında `userId` döner. T-016'nın zehirlenmesi
  `twoFactorChallengeOrSession` kaynağındaydı (ham `cookie` başlığı, `two-factor-scope-cookie.ts`) —
  bu rotalar o kaynağı kullanmıyor. `AuthContextMiddleware` küresel (`app.module.ts:129-130`,
  `{ path: '*path', method: ALL }`), guard aşamasından ÖNCE koşar → alan doldurulmuş olur.
  Saldırgan `userId`'yi SEÇEMEZ.
- Kalan: bütçe rota başına (F2) ve 429 uçtan uca ölçülmemiş (F3). İkisi de `low`.

### 2. `buildPolicy` guard'ı gevşedi mi?

**Denetlendi — YOL ekseninde meşru genişletme, YÖNTEM ekseninde ölçülebilir daralma (F1, `low`).**

Koşul: `!AUTH_DELEGATED_PATHS.has(routeKey) && !AUTH_OWN_PATHS.has(pathOf(routeKey))`.
Tanımsız bir routeKey (yazım hatası dahil) hâlâ **fırlatır** — `AUTH_OWN_PATHS` üç literal taşıyor,
hiçbir yazım hatası onlara eşleşmez. S1'in iddiası bu eksende **doğru**.
Ama `pathOf()` yöntemi **soyduğu için** `'POST /auth/sessions'` ve `'GET /auth/sessions/revoke'`
girdileri guard'dan geçer. Bu, `AUTH_DELEGATED_PATHS` kolunda (yöntem+yol tam eşleşme) **mümkün değil**;
yani guard'ın koruma gücü iki kol arasında artık asimetrik. Bugünkü iki hassas rota için
`sensitive-operations.ts` kapısı (b) ağı kapatıyor (ölçüldü); `GET /auth/sessions` kapatılmıyor.

### 3. `/verify-password` dışa açılmadı mı?

**Denetlendi, bulgu yok.**

- `grep -rn "verify-password" apps/api/src apps/admin/src packages/*/src` → **2 eşleşme, ikisi de yorum**
  (`sensitive-operations.ts:63`, `step-up.service.ts:11`). Hiçbir küme literali yok.
- `AUTH_DELEGATED_PATHS` (`auth-delegated-paths.ts:109-125`) **13 literal**, `/auth/verify-password` **yok**;
  dosya bu sürümde hiç değişmedi (`git diff` boş).
- Fail-closed teyidi: `auth.controller.ts:121-125` → `if (!isAuthDelegatedPath(req.method, req.url)) throw new NotFoundException()`.
  Küme dışı her şey **404**.
- Kütüphane tarafı ek teyit: `verifyPassword` `metadata.scope: "server"` taşıyor
  (`better-auth/dist/api/routes/password.mjs:167-176`) — programatik erişim doğru desen.

### 4. Step-up sırası = varlık oracle'ı kapısı — gerçekten kapalı mı?

**Denetlendi, bulgu yok — kapı KAPALI, iki bağımsız ölçümle.**

- Kod sırası: `sessions.service.ts:152` (`assertVerified`) **önce**, `:156` (`findUnique`) **sonra**,
  `:164` (`revokeSession`) en son. `revokeAllOwnSessions` da `:186`'da ilk satırda step-up.
- **Ölçüm A (davranış):** `auth-sessions.test.ts` AC3 — userA, userB'nin `sessionId`'siyle **parolasız**
  çağırıyor → **400 `INVALID_PASSWORD`** (404 DEĞİL) ve B'nin satırı DB'de duruyor. Yeşil (benim koşumumda).
- **Ölçüm B (zamanlama):** benim koşumumun log akışında parolasız `SessionsController.revokeSession`
  satırı `statusCode: 400, durationMs: 0` — DB turu yapılmadığının yan kanalı.
- Doğru parolayla: başkasının `sessionId`'si **404** ve var olmayan `sessionId` **404**;
  gövdeler `requestId` dışında **`toStrictEqual`** ile birebir eşit (AC3). Var/yetkisiz ayrımı sızmıyor.
- Ters yönde bir kaçak da aradım: doğru parola + başkasının oturumu → yine 404 (sahiplik `:159`'da
  `row.userId !== identity.userId` → `SessionNotFoundError`). Oracle yok.

### 5. IP — iki savunma AYRI AYRI

**Denetlendi, bulgu yok. Birincil savunma bağımsız olarak ölçüldü.**

- **Birincil (hiçbir kod yolu logger'a geçirmiyor):**
  `grep -rn "client\.ip\|clientIp"` → üretim tüketicileri yalnızca **(a)** denetim kaydı yazıcıları
  (`tenant-security.service.ts:102`, `member.service.ts:238/339/422/476/537/547` — hepsi
  `writeAuditLog(...)`'ın `ip:` **alanı**, logger çağrısı değil) ve **(b)** yeni kanca
  (`auth-instance.ts:808-811`). `logger.*` çağrılarında `session`/`ipAddress` geçen **0 satır**.
  `session.create.after` (`:880-888`) ve `session.delete.after` (`:879-889`) yalnızca
  `{ userId, sessionId }` logluyor — tam satırı yaymıyorlar.
  **Bağımsız ölçüm:** tam akışın log çıktısında `203.0.113.*` **0**, herhangi bir dotted-quad **0**,
  `"ipAddress"`/`"userAgent"` anahtarı **0**.
- **İkincil (`PINO_REDACT_PATHS`):** `redaction.ts:110-111` `ipAddress` + `*.ipAddress`.
  `redaction.test.ts` 21/21 yeşil.
  **Sınırı teyit ettim:** yol tabanlı → serbest metni yakalamaz; ayrıca pino `*` **tek seviye**
  eşler, yani `{a:{b:{ipAddress}}}` redakte **edilmez**. Bu sınır hem ADR §2'de hem
  `redaction.ts:67-78` yorumunda yazılı ve birincil savunma ölçülmüş olduğu için **bulgu değil**;
  kalıntı risk olarak kayda geçiyor.
- **Kütüphane IP'sinin kullanılmaması kararı — denetledim, KATILIYORUM.** Beş gerekçenin
  güvenlikle ilgili olanı doğrulanabilir: bizim `resolveClientIp` (`client-ip.ts:60-84`)
  `trustedProxyCount <= 0` iken XFF'i **tamamen yok sayıyor** ve `>0` iken `hops[len-N]` seçerek
  vekilin EKLEDİĞİ girdiyi alıyor — doğru yapılandırmada sahtecilik dirençli. Kütüphanenin
  `getIP` davranışına ikinci bir güven ailesi açmak gerçek bir regresyon olurdu. Tek kalan
  pürüz F5 (biçim/uzunluk doğrulaması yok).

### 6. `AuthModule.exports`'a ikinci token

**Denetlendi, bulgu yok — kısmi geri alma GÜVENLİK AÇISINDAN KABUL EDİLEBİLİR.**

- `SESSION_LIST_READER` tipi (`auth.tokens.ts:84-86`) **tek metot**: `listOwnSessions`.
  Fabrika (`auth.module.ts:234-240`) `{ listOwnSessions: (identity) => sessionsService.listOwnSessions(identity) }`
  döner — `SessionsService` örneği **kapanış içinde**, nesne üzerinde alan olarak **taşınmıyor**;
  `revokeOwnSession`/`revokeAllOwnSessions` bu yüzeyden erişilemez.
- `AUTH_INSTANCE` (tam `Auth`) **hâlâ dışa açılmıyor** — `exports: [AUTH_SESSION_READER, SESSION_LIST_READER]`.
  F1(b)'nin asıl kararı ayakta.
- `TrpcModule.imports`'a `AuthModule` eklenmesinin yan etkisi aradım: Nest modül örneği tek
  olduğu için `APP_GUARD`/`APP_INTERCEPTOR` çiftlenmiyor — **ölçüldü** (tek boot'ta rota
  eşlemesi 1 kez; `rate-limit` süiti 116/116 yeşil, eşikler 5/20 korundu). Çiftlenseydi
  sayaçlar iki kat artardı.
- Mimari (dolaylama sayısı) itirazı `solid`'in alanı; güvenlik açısından yazma yüzeyi açılmadı.

### 7. `session.list` sahipliği

**Denetlendi, bulgu yok (taşıma seviyesi test pini eksik → F4, `low`).**

Zincir: `session.router.ts:43-50` (**girdi şeması YOK**) → `ctx.auth.userId`/`ctx.auth.sessionId`
(`requireAuth` middleware'i `trpc.ts:286-292` `kind === 'authenticated'`'e daraltıyor) →
`SessionListReadPortAdapter:69-72` → `SESSION_LIST_READER` → `SessionsService.listOwnSessions`
→ `where: { userId: identity.userId }` (`sessions.service.ts:111`).
Başka kullanıcının satırını döndürebilen bir yol **yok**: girdi yüzeyi sıfır olduğu için
IDOR'un gereken ilk adımı (saldırgan kontrollü `id`) hiç mevcut değil.
Batching kapalı (`create-trpc-request-handler.ts:103`), yani yol→prosedür eşlemesi birebir.

### 8. `TENANT_EXEMPT_PATHS` 20 → 21 — over-exemption mı?

**Denetlendi, bulgu yok.**

- Muafiyet **yalnızca kiracı**: `AUTH_EXEMPT_PATHS` dosyası bu sürümde **hiç değişmedi**
  (`git diff --stat` boş) ve **12** girdide kalıyor → kimlik hâlâ zorunlu.
  Ölçüm: `trpc-http.test.ts:218-222` oturumsuz `GET /trpc/session.list` → **401** (yeşil).
- Dayanak canlı ölçüldü: `session-metadata-columns.test.ts:124-134` → `information_schema.columns`'ta
  `session.tenant_id` **boş küme**. Platform seviyesi tablo için kiracı daraltması anlamsız.
- Tel sözleşmesinde kiracı verisi yok: `activeSessionWireSchema` 8 alan, `tenantId`/`slug`/`status` **yok**.
- `tenant-exempt-paths.test.ts` kardinaliteyi (21) elle pinliyor → inceleme görünürlüğü korunuyor (yeşil).

### 9. Sır/PII tele çıkmıyor mu?

**Denetlendi, bulgu yok.**

- `activeSessionWireSchema` (`session-summary.schema.ts:81-90`): `id`, `isCurrent`, `browserFamily`,
  `osFamily`, `ipAddress`, `lastSeenAt`, `createdAt`, `expiresAt`. **`token` yok, ham `userAgent` yok,
  `tenantId` yok.** `z.object()` bilinmeyen anahtarları soyar → `.output()` ile **yapısal** sızdırmazlık.
- REST tarafında da iki katman: `SESSION_SUMMARY_SELECT` (`sessions.service.ts:92-99`) `token`'ı
  **hiç seçmiyor**; `rows.map` yayma (`{...row}`) **kullanmıyor**, altı alanı tek tek adıyla seçiyor —
  `userAgent` yalnızca `resolveDeviceFamilies(...)`'e girdi olarak kullanılıp atılıyor.
- `device-label.ts` saf: ham UA'yı loglamıyor, döndürmüyor (`resolveDeviceFamilies` dönüşü iki
  kapalı-dünya tanımlayıcı).
- Hata tarafı: `InvalidPasswordError.context` **`{}`** (`invalid-password.error.ts:21-29`),
  `error-mapping.test.ts` bunu pinliyor; benim koşumumun log satırında `"context":{}` görülüyor —
  denenen parola/işlem adı hiçbir yere yazılmıyor.
- Panelde ham veri basma yüzeyi: `dangerouslySetInnerHTML`/`innerHTML`/`window.location`
  `apps/admin/src/features/sessions/` içinde **0 eşleşme**. Parola `type="password"`, state'te
  tutulup başarıda `INITIAL_STATE` ile temizleniyor (`active-sessions-controller.ts:247-257, 274-277`);
  diyalog her açılışta sıfırlanıyor. Çıkışta ve `revoke-all` sonrası `queryClient.clear()`
  (`_app.tsx:148`, `ActiveSessionsCard.tsx:111`) → aynı tarayıcıda ikinci kullanıcıya bayat liste gitmiyor.

### 10. `pnpm audit` — yeni advisory var mı?

**Denetlendi, bulgu yok. YENİ advisory YOK.**

| severity | modül | yol | durum |
| --- | --- | --- | --- |
| high | `multer` | `apps__api > @nestjs/core > @nestjs/platform-express > multer` | **PRE-EXISTING** (T-016'da da vardı), geçişli, doğrudan bağımlılık değil |
| moderate | `minimatch` | `apps__storefront > eslint > …`, `packages__ui > eslint > …` | **PRE-EXISTING**, dev-only, geçişli |

`critical 0 · high 1 · moderate 1 · low 0 · info 0`.
`git diff HEAD --stat -- '**/package.json' 'package.json' 'pnpm-lock.yaml'` → **boş**
→ ADR-0019'un "yeni ana bağımlılık yok" iddiası **teyit edildi**; `device-label.ts` elle yazılmış
saf eşleme (UA ayrıştırma kütüphanesi eklenmemiş).

---

## Ajanların işaretlediği üç kalem — açık karar

### (a) S8a'nın kapsam dışı üç dosyası — **TEMİZE ÇIKAR**

`git diff` okudum, üçü de **salt eklemeli**:

- `helpers/auth-fixture.ts`: `AuthenticatedSession`'a `readonly password: string` alanı + dönüşte
  `password: FIXTURE_PASSWORD`. Mevcut `{ cookieHeader, userId }` destructuring eden çağıranlar etkilenmez.
- `panel-origin-cors.test.ts:119-132`: `.send({ password })` eklendi. **Asıl iddialar değişmedi** —
  `expect(response.status).toBe(200)` ve CORS başlığı yokluğu assert'leri aynen duruyor.
- `same-origin-guard.test.ts:239-252`: aynı şekilde `.send({ password })`; Referer fallback iddiası korundu.

Hiçbir eşik düşürülmedi, hiçbir `skip` eklenmedi, hiçbir assert zayıflatılmadı
(CLAUDE.md §10 md 6 ihlali yok). Gerekçe `auth-fixture.ts`'in kendi başlık ilkesinden alınmış —
doğru sahiplik. **Onaylıyorum.**

### (b) S11'in `panel-config.ts`'e iki yol sabiti — **TEMİZE ÇIKAR**

İki `export const` göreli yol (`/auth/sessions/revoke`, `/auth/sessions/revoke-all`), T-016'nın
`AUTH_TWO_FACTOR_*_PATH` sabitleriyle **aynı dosya, aynı desen**. Mutlak URL yok, `VITE_*` yok
(tek orijin topolojisi/ADR-0011 korunuyor). Güvenlik yüzeyi açmıyor; sunucu tarafı allowlist'ler
bu sabitlerden **bağımsız**. **Onaylıyorum.**

### (c) S9'un jeton tuzağını proaktif önlemesi — **ONAYLIYORUM, bir koşulla**

Adaptör yorumunda yasaklı Prisma sınıf adlarının bilerek yazılmaması **doğru** bir karar:
AGENT_BASELINE §5'in literal-jeton kuralı tam olarak bunu gerektiriyor ve bu sınıf CI'ı
daha önce üç kez kırmış.
**Koşul (ve neden güvenlik açısından sorun değil):** yasağın otoritesi yorum değil,
**mekanik kural** olmak zorunda — ve öyle: `apps/api/eslint.config.mjs:61-75`
`prismaClientSurfaceRestriction` `@arkesoft/db`'den `PrismaDatabase`/`AuthPrismaDatabase`/
`AUTH_SECRET_BEARING_MODELS`/`createPrismaClient` ithalini `src/{prisma,auth}/**` dışında
yasaklıyor. Adaptörün gerçek ithalatlarını okudum (`@arkesoft/trpc`, `@arkesoft/trpc/server`,
`auth.tokens.js`) — veritabanı istemcisine **dokunmuyor**. Yorumun jetonu yazmaması bir
güvenlik kaybı üretmiyor çünkü koruma yorumla sağlanmıyor.

---

## CLAUDE.md §7 — madde madde

⚠ `Session` **platform seviyesi** bir tablodur (canlı ölçüm: `session.tenant_id` yok).
ADR-0019 §9 bunu yazıya geçirdi; kiracı kolonu/RLS/`createTenantIsolationSuite()` beklemek
**yanlış FAIL** üretirdi. İzolasyonun tek dayanağı: `where: { userId }` + 404 eşitliği +
`protectedProcedure`. Üçünü de ayrı ayrı ölçtüm.

| # | Madde | Değerlendirme |
| --- | --- | --- |
| 1 | `tenant_id` NOT NULL | **UYGULANAMAZ** — platform seviyesi tablo; canlı ölçüm: kolon yok. Yeni tablo da eklenmedi. |
| 2 | RLS + kiracı GUC karşılaştırması | **UYGULANAMAZ** — aynı gerekçe. |
| 3 | `(tenant_id, …)` bileşik indeks | **UYGULANAMAZ**. Mevcut `session_user_id_idx` canlı doğrulandı (S3 testi ③). Bileşik indeks kararı ADR §Gözden geçirme 4'te `perf`'e bırakılmış. |
| 4 | Doğru prosedür tipi | **KARŞILANDI** — `session.list` `protectedProcedure`; `PROCEDURE_SURFACE` 11 girdi, `builder: 'protected'`; `authz-consistency.test.ts` yeşil. `publicProcedure` değil. |
| 5 | `withTenant()` üzerinden sorgu | **UYGULANAMAZ ama kural karşılandı** — platform tablosunda ham istemci CLAUDE.md §4'ün izin verdiği durum; gerekçe yorumu `sessions.service.ts:66-73`'te yazılı ve erişim `src/auth/**` kapsamında (ESLint R-1 katman 2 ile mekanik). |
| 6 | Girdideki `id`'ye güvenilmiyor, sahiplik doğrulanıyor | **KARŞILANDI** — `revokeOwnSession` `row.userId !== identity.userId → 404`; `session.list` **girdi almıyor**. |
| 7 | Kuyruk işi `tenantId` + worker context | **UYGULANAMAZ** — yeni iş eklenmedi. |
| 8 | Dış kaynak (arama/S3/önbellek) kiracı kapsamlı | **UYGULANAMAZ** — yeni dış kaynak yok. Oran sınırı anahtar uzayı `platform:auth:` (giriş anında kiracı bilinmez — mevcut, bilinçli karar). |
| 9 | Önbellek anahtarı `tenant:{id}:…` | **UYGULANAMAZ** — sunucu önbelleği eklenmedi. İstemci tarafı `['session','list']` anahtarı tarayıcı-yerel ve çıkışta temizleniyor (ölçüldü). |
| 10 | Dosya yolu kiracı öneki | **UYGULANAMAZ** — dosya yükleme/indirme yok. |
| 11 | `createTenantIsolationSuite()` çapraz okuma+yazma | **UYGULANAMAZ** (ADR §9). Yerine kullanıcı-çapraz: yazma **var** (AC3, ölçüldü), okuma REST'te **var**, tRPC taşımasında **yok** → F4 (`low`). |
| 12 | Hata mesajı varlık sızdırmıyor | **KARŞILANDI** — 404 eşitliği `toStrictEqual` ile pinli; step-up sırası 400/404 ayrımını da kapatıyor. |
| 13 | Loglarda `tenantId` | **UYGULANAMAZ** — bu uçlar kiracıdan muaf. Korelasyon `requestId` + `userId` ile sağlanıyor (log çıktısında ölçüldü). |
| 14 | Süper admin impersonation + denetim kaydı | **UYGULANAMAZ** — süper admin yüzeyi eklenmedi; işlemler kullanıcının kendi kaynağı üzerinde. Yapısal log olayı var (`oturum sonlandırıldı`). |
| 15 | Bağımlı/türetilmiş DB nesnesi eklemiyorum | **KARŞILANDI** — 0 migration, 0 yeni nesne, şema diff'i yalnızca yorum. Katalog linter'ının görüş alanı genişletilmesi gerekmiyor. |
| 16 | `SECURITY DEFINER` fonksiyon eklemiyorum | **KARŞILANDI** — diff'te 0 eşleşme. |
| 17 | `public` dışına şema açmıyorum | **KARŞILANDI** — yeni şema yok. |

**Gerçek eksik: yok.** 10 madde platform seviyesi tablonun doğal sonucu olarak uygulanamaz.

---

## Dosya değişikliği kanıtı

Bu gate hiçbir kaynak/test/konfig dosyasını değiştirmedi. Bu rapor yazılmadan ÖNCE:

```
$ git status --porcelain | wc -l
58        # oturum başındaki ile aynı (36 M + 22 ??)
$ git status --porcelain | md5
a81acae2ad52d3642898da7aafbb1211
```

Tek repo yazımı bu rapor dosyasıdır (`.claude/workflow/reviews/T-017-security-tur1.md`,
AGENT_BASELINE §3.2 gereği kalıcı denetim kaydı). Geçici dosyalar scratchpad'e yazıldı.

**Koşturulmadı (bilerek):** Playwright, `apps/admin` dev sunucusu, `npx turbo run build`,
yıkıcı Prisma komutları, Redis flush/config. Port 3000/3100'deki süreçlere dokunulmadı.
Postgres konteyneri isimle seçildi (`arkesoft-postgres`, 5432).
