# T-021 — `security` gate, Tur 2 (TAM yeniden denetim)

- **Tarih:** 2026-11-16
- **Sürüm:** ROADMAP v0.0.20 (süper admin iskeleti)
- **Önceki tur:** `docs/gates/T-021-security-tur1.md` (FAIL, 1 `high` + 5 `low`)
- **Kapsam:** tur 1 kapsamı + FIX turu 1/2'nin değiştirdiği yüzey
  (`http/normalize-request-path.ts`, `platform/platform-admin-ip.guard.ts`,
  `scripts/e2e-env-passthrough-check.ts`, `scripts/playwright/mailpit.ts`,
  `turbo.json`, `ci.yml`, `apps/superadmin/src/components/Sidebar.tsx`,
  `apps/superadmin/e2e/sidebar-focus-return.qa.spec.ts`)

```
GATE: security
SONUÇ: FAIL
BULGULAR:
  - [SEV: high] apps/api/src/http/normalize-request-path.ts:79-110 + apps/api/src/platform/platform-admin-ip.guard.ts:47,67-69,90 + apps/api/src/trpc/trpc.controller.ts:204 (`@All('trpc/*path')`) — ⚠⚠ TUR 1'İN F1'İ YALNIZCA YARI KAPANDI: yüzde-kodlama ekseni kapatıldı, AMA AYNI KÖK NEDEN (iki katmanın yolu FARKLI kanonikleştirmesi) BÜYÜK/KÜÇÜK HARF ekseninde AYNEN AÇIK. NestJS'in Express adaptörü `case sensitive routing`'i VARSAYILAN OLARAK KAPALI bırakır ⇒ `/TRPC/platform.tenantList` `@All('trpc/*path')` rotasına DÜŞER; `@trpc/server@11.19.0`'ın `fetchRequestHandler.ts:37-39`'u endpoint'i İÇERİĞE göre DEĞİL UZUNLUĞA göre keser (`pathname.slice(endpoint.length)`, önek DOĞRULAMASI YOK) ⇒ `platform.tenantList` prosedürünü ÇALIŞTIRIR. `isPlatformAdminGuardedPath` ise küçük harfli literal `'/trpc/platform.'` ile `startsWith` yapar ⇒ `false` döner ⇒ guard ANINDA `true`, ÜÇ fail-closed dalın (`empty_allowlist`/`unknown_ip`/`ip_not_allowed`) HİÇBİRİ değerlendirilmez. SALDIRI: tur1 F1(d)'nin BİREBİR aynı senaryosu — platform yöneticisi oturumu + 2FA'ya sahip aktör (yöneticinin kendisi izinsiz bir ağdan, ya da oturumu çalmış saldırgan) `registration.createTenant` ile KENDİ kiracısını kurar (ön koşulu kendi üretir), sonra `GET https://<kendi-slug>.arkesoft.app/TRPC/platform.tenantList?input={}` ile IP allowlist'ini TAMAMEN atlayarak tüm kiracıların slug/name/status/plan listesini ve `platform.auditLog`'un tamamını izinsiz ağdan okur; `SUPERADMIN_IP_ALLOWLIST` varsayılanı (`''` = "tamamı kapalı") da BÖYLE atlanır. — Düzeltme: kanonikleştirmeyi tRPC'nin KENDİ endpoint kesmesiyle hizala — `normalize-request-path.ts`'e `/trpc` önekinin LİTERAL (büyük/küçük harf duyarlı) doğrulamasını ekle ve `trpc.controller.ts`'te pathname'i gerçekten `'/trpc/'` ile başlamayan isteği SINIRDA reddet (fail-closed), ya da Express'te `app.set('case sensitive routing', true)` + `strict routing` ile rota eşleşmesini kanonikleştir; `platform-admin-ip-guard.test.ts` · `tenant-exempt-paths.test.ts` · `rate-limit-policy.test.ts`'e `/TRPC/...`, `/Trpc/...`, `/tRpC/...` vakaları NEGATİF kanıtla eklenmeli — backend (S7)
  - [SEV: medium] apps/api/src/auth/rate-limit/rate-limit.policy.ts:148-176 + rate-limit.guard.ts:212,302 + apps/api/src/auth/sessions.controller.ts:75,82,101 — AYNI kök neden (büyük/küçük harf) ORAN SINIRLAMASINI da atlatıyor ve bu CANLI KANITLANDI: `/auth/sessions/revoke` uç noktasına BİREBİR aynı 3 POST atıldı (biri `/auth/...`, ikisi `/AUTH/...` ve `/Auth/Sessions/Revoke`), ÜÇÜ DE gerçek işleyiciye ULAŞTI (üçü de `400 VALIDATION_ERROR` + `fields.sessionId` döndü ⇒ gövde şeması çalıştı) ama Redis sayacı `platform:auth:post-auth-sessions-revoke:ip:*` = **1** kaldı ⇒ iki istek TAMAMEN ÖLÇÜLMEDİ. Etkilenen 6 rota: `GET /auth/sessions`, `POST /auth/sessions/revoke`, `POST /auth/sessions/revoke-all` (kendi Nest rotaları — CANLI kanıtlandı) ve `GET /trpc/registration.checkSlugAvailability`, `POST /trpc/registration.createTenant`, `GET /trpc/registration.onboardingChecklist` (`resolveRateLimitPolicy('POST','/TRPC/registration.createTenant')` → `undefined`, ÖLÇÜLDÜ). ⭐ İYİ HABER — Better Auth'un delege yüzeyi (`sign-in/email`, `request-password-reset`, `sign-up/email`, altı `two-factor/*`) ETKİLENMİYOR: `AuthController.delegate`'in KENDİ fail-closed TAM EŞLEŞME allowlist'i (`isAuthDelegatedPath`, auth.controller.ts:121) büyük harfli varyantı 404 ile keser — CANLI doğrulandı (dört uç → 404, sayaçlarda sıfır değişim) ⇒ GİRİŞ/ŞİFRE SIFIRLAMA/2FA kaba kuvvet savunması SAĞLAM. — Düzeltme: F1'in düzeltmesiyle AYNI satırda kapanır (ortak normalizer'da kanonikleştirme); ek olarak `/trpc/*` ve `/auth/*` dışındaki her Nest rotası için "ham pathname literal önekle başlamıyorsa reddet" deseni emsal alınmalı — backend
  - [SEV: low] apps/api/src/platform/impersonation.service.ts:226 + packages/trpc/src/schemas/platform.schema.ts:168 — TUR 1 F3 AYNEN AÇIK (satır teyit edildi: `subject: [...tenantIds].sort().join(',')`): `architect`'in "kiracı kimlik listesi TELE ÇIKMAZ" kararı `subject` alanı üzerinden fiilen baypas ediliyor. — Düzeltme/vade tur1'deki gibi — backend + docs · vade: v0.15.0
  - [SEV: low] apps/api/src/prisma/prisma.service.ts:119-139 + canlı katalog — TUR 1 F4 AYNEN AÇIK (bu turda YENİDEN ölçüldü: `arkesoft_app` → `platform_admin` üzerinde `DELETE,INSERT,SELECT,UPDATE`; getter `Pick<…,'platformAdmin'|'platformAuditLog'|'plan'>` delegenin TAMAMINI açıyor). Platform yetkisi = satırın VARLIĞI ⇒ yetki yükseltme ekseni. — Düzeltme/vade tur1'deki gibi — db + devops · vade: v0.0.20.1
  - [SEV: low] apps/api/src/__tests__/platform-impersonation-write-gate.test.ts:57,78 — TUR 1 F5 AYNEN AÇIK (needle'lar birebir aynı: `['.impersonation','.runImpersonated('].join('')` ve `(PrismaService)`). KAPI B hâlâ yalnızca AÇIK `@Inject(...)` dekoratörünü görüyor. — Düzeltme/vade tur1'deki gibi — backend · vade: v0.0.20.1
  - [SEV: low] apps/api/src/config/api-env.ts:69,96 (`AUTH_BASE_URL`/`SUPERADMIN_BASE_URL`: `z.url()`) + auth/trusted-origins.ts:49-51 — TUR 1 F6 AYNEN AÇIK (iki satır da değişmemiş): özel-olmayan şema kabul edilir, `.origin` literal `"null"` olabilir ⇒ `Origin: null` taşıyan istekler `SameOriginGuard`'ı geçer. — Düzeltme/vade tur1'deki gibi — backend · vade: v0.0.20.1
  - [SEV: low] pnpm-lock.yaml (DEĞİŞMEMİŞ satırlar) — TUR 1 F7 AYNEN AÇIK, sayılar BİREBİR AYNI: `pnpm audit` → 0 critical / **1 high** (`multer`, GHSA-q7qp-rjg7-q26m) / 3 moderate (2× `@astrojs/node` GHSA-r3h5-4585-7x3w + 1 kayıtlı `minimatch`) / 1 low (`astro` GHSA-mh32-jxcr-mh9f). FIX turları HİÇBİR YENİ PAKET eklemedi (`git diff pnpm-lock.yaml` → yeni `resolution:` girdisi 0 — ölçüldü). — Düzeltme/vade tur1'deki gibi — devops · vade: v0.0.20.1
ÖLÇÜMLER: pnpm audit → 0 critical / 1 high / 3 moderate / 1 low (tur1 ile BİREBİR aynı, hiçbiri bu sürümden, yeni paket 0) · incelenen dosya: 32 (13 tam/kısmi okuma + 19 diff/hedefli tarama) + 2 bağımlılık kaynak dosyası (`@trpc/server` `fetchRequestHandler.ts`, `better-call` `crypto.mjs`) · CLAUDE.md §7 18 maddeden KARŞILANMAYAN: **YOK** (madde 4 GEREKÇELİ İSTİSNA, ADR-0023 Karar 2 — tur1'le aynı); ⚠ F1/F2 §7'nin DIŞINDA bir eksen (kiracı izolasyonu DEĞİL, ağ katmanı + oran sınırı) · canlı HTTP ölçümü: 38 istek (:3100) · canlı DB ölçümü: 5 salt-okuma `psql` · canlı Redis: 4 salt-okuma + 3 sayaç gözlemi · statik simülasyon: 2 `npx tsx` koşumu (gerçek üretim fonksiyonları import edildi)
```

---

## 1. ⚠⚠ F1 GERÇEKTEN KAPANDI MI — İDDİA DEVRALINMADI, ÖLÇÜLDÜ

### (a) ✅ Yüzde-kodlama ekseni **KAPANDI** — uçtan uca canlı kanıt

Tur 1'in kanıtı dolaylıydı (`TENANT_EXEMPT_PATHS` üzerinden). Bu turda
**prosedürün GERÇEKTEN çalıştığı** bir uçla ölçüldü (`demo-magaza` host'u,
`storefront.currentTenant` = `AUTH_EXEMPT_PATHS` üyesi, `publicTenantProcedure`):

| İstek                                  | Sonuç                                                |
| -------------------------------------- | ---------------------------------------------------- |
| `GET /trpc/storefront.currentTenant`   | **200** `{"name":"Demo Mağaza", …}`                  |
| `GET /trpc/storefront%2EcurrentTenant` | **200** (AYNI gövde) ⇒ muafiyet kümesi ARTIK TANIYOR |

Düzeltmeden **önce** ikincisi `AUTH_EXEMPT_PATHS`'e eşleşmez, `AuthGuard` 401
verirdi. ⇒ ortak normalizer'ın `decodeURIComponent`'i tRPC ile **birebir aynı**
kanonikleştirmeyi üretiyor. Orkestratörün `%2E`/`%2e` → 401 kanıtı da **bağımsız
olarak tekrarlandı** (`superadmin` host'u, üç varyant da 401).

### (b) ✅ Bozuk kodlama (`%ZZ`) — `backend`'in kalan risk değerlendirmesi **ONAYLANDI** (bir düzeltmeyle)

```
GET /trpc/platform%ZZtenantList        → 400
GET /trpc/platform%2ZtenantList        → 400   (çerezli/çerezsiz, iki host — 3 kez tekrarlandı)
GET /trpc/platform%E0%A4%A.tenantList  → 400
```

⚠ **Kendi ölçüm hatamı düzeltiyorum:** ilk turda `set --` kelime bölmeli bir
döngüde bu uç **404** okunmuştu; sütun hizalamasındaki bozulma ölçüm artefaktını
ele veriyordu. Tekrarlanan, izole ölçüm **400** (üç form, iki host, çerezli ve
çerezsiz). ⇒ İstek **hiçbir prosedüre ulaşmıyor**.

**Değerlendirme: `backend` HAKLI.** Bozuk kodlamada tam-eşleşme setlerinin
"eşleşmiyor ⇒ sınırsız" varsayılanı **iş mantığı bypass'ı DEĞİL** — kalan risk
yalnızca "sınırsız 400 üretme", ve bu bir saldırganın zaten **herhangi bir var
olmayan yola** istek atarak üretebileceği gürültüyle aynı sınıf ⇒ **yeni yetenek
kazandırmıyor**. Bulgu yazılmadı.

### (c) ⭐ İKİ FARKLI GÜVENLİ VARSAYILANIN AYRI TUTULMASI — **DENETLENDİ, KARAR DOĞRU**

`normalizeRequestPath` bozukta **ham pathname**'e düşer;
`matchesPrefixOrUnparsablePercentEncoding` bozukta **`true`** döner.

**Bu ayrım doğru ve yeni bir delik AÇMIYOR.** Gerekçe, iki tüketici sınıfının
"eşleşmeme" varsayılanının **zıt yönde** güvenli olmasıdır:

| Tüketici sınıfı                                                                               | "Eşleşme yok" ne demek           | Güvenli mi                                                             |
| --------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------- |
| TAM EŞLEŞME kümeleri (`TENANT_EXEMPT_PATHS`, `AUTH_EXEMPT_PATHS`, `AUTH_DELEGATED/OWN_PATHS`) | "muaf DEĞİL" = KORUMALI          | ✅ **Evet**                                                            |
| TAM EŞLEŞME haritası (`resolveRateLimitPolicy`)                                               | "politika yok" = SINIRSIZ        | ⚠ hayır — ama (b)'de ölçüldüğü gibi istek 400 ile ölüyor ⇒ sömürülemez |
| ÖNEK testi (`isPlatformAdminGuardedPath`)                                                     | "kapsamda değil" = GUARD ATLANIR | ❌ hayır ⇒ bu yüzden AYRI, TERS varsayılan ZORUNLU                     |

İkisi tek fonksiyonda birleştirilseydi, `true` varsayılanı tam-eşleşme
tüketicilerini **yanlış yönde** etkilerdi (ham `%`'li yol bir literalle
eşleşmediği için `true` dönen bir "eşleşti" sinyali anlamsız/yanıltıcı olurdu) ve
`normalizeRequestPath`'in tek dönüş tipi (`string`) bozulurdu. ⇒ **Ayrım
bilinçli, dokümante ve doğru. Bulgu yazılmadı.**

Ek doğrulama: `matchesPrefixOrUnparsablePercentEncoding`'in **tek tüketicisi**
`platform-admin-ip.guard.ts:68` (grep ile teyit) ⇒ `true` varsayılanı başka
hiçbir karara sızmıyor.

### (d) ⚠⚠ ANCAK — **AYNI KÖK NEDEN, İKİNCİ EKSEN: BÜYÜK/KÜÇÜK HARF** (F1-TUR2, `high`)

Düzeltme **yüzde-kodlamayı** tRPC ile hizaladı ama tRPC'nin yol türetmesinin
**ikinci** özelliğini gözden kaçırdı.

**Kök neden — `@trpc/server@11.19.0`, `fetchRequestHandler.ts:37-39` (kaynaktan okundu):**

```ts
const pathname = trimSlashes(url.pathname)
const endpoint = trimSlashes(opts.endpoint) // '/trpc' → 'trpc', uzunluk 4
const path = trimSlashes(pathname.slice(endpoint.length)) // ⚠ İÇERİK DOĞRULAMASI YOK
```

`slice(endpoint.length)` **uzunluğa** göre keser — kesilen 4 karakterin gerçekten
`trpc` olup olmadığına **hiç bakmaz**. Nest/Express ise `@All('trpc/*path')`
rotasını **büyük/küçük harf duyarsız** eşleştirir (Express'in
`case sensitive routing` ayarı varsayılan olarak **kapalı**; `main.ts`'te
açılmıyor — okundu). ⇒ `/TRPC/platform.tenantList` rotaya düşer ve tRPC onu
`platform.tenantList` olarak çözer.

**Statik ölçüm (gerçek üretim fonksiyonları import edilerek, `npx tsx`):**

| Ham URL                        | tRPC'nin çözdüğü prosedür    | `isPlatformAdminGuardedPath`   |
| ------------------------------ | ---------------------------- | ------------------------------ |
| `/trpc/platform.tenantList`    | `platform.tenantList`        | `true`                         |
| `/trpc/platform%2EtenantList`  | `platform.tenantList`        | `true` ✅ (düzeltme çalışıyor) |
| `/trpc/%70latform.tenantList`  | `platform.tenantList`        | `true` ✅                      |
| ⚠⚠ `/TRPC/platform.tenantList` | ⚠⚠ `platform.tenantList`     | ⚠⚠ **`false`**                 |
| ⚠⚠ `/Trpc/platform.tenantList` | ⚠⚠ `platform.tenantList`     | ⚠⚠ **`false`**                 |
| ⚠⚠ `/tRpC/platform.tenantList` | ⚠⚠ `platform.tenantList`     | ⚠⚠ **`false`**                 |
| `/trpc//platform.tenantList`   | `/platform.tenantList` (404) | `false` (zararsız)             |
| `/trpc/%2Fplatform.tenantList` | `/platform.tenantList` (404) | `false` (zararsız)             |

⭐ Çift eğik çizgi ve `%2F` **sömürülebilir DEĞİL**: `trimSlashes` yalnızca
**BİR** baştaki eğik çizgiyi atar, geriye kalan `/` prosedür anahtarına girer ve
router eşleşme bulamaz. Ölçüldü (canlı: `/trpc//tenant.current` → tRPC'nin kendi
`NOT_FOUND`'u).

**CANLI KANIT ZİNCİRİ — üç bağımsız ölçüm:**

1. **Express rotayı eşleştiriyor.** `/TRPC/platform.tenantList` (superadmin
   host'u, çerezsiz) → **404 `TENANT_NOT_FOUND`**. Bu `TenantGuard`'ın kendi
   `AppError`'ı; eşleşmeyen bir rota (`/definitely-not-a-route`) ise **404
   `HTTP_EXCEPTION`** veriyor. İki gövde **farklı** ⇒ rota eşleşti, guard zinciri
   koştu.
2. **tRPC prosedürü gerçekten çalıştırıyor.** `demo-magaza` host'u + **gerçek
   oturum** (aşağıdaki yöntem) ile:

   ```
   GET /trpc/tenant.current  → 200 {"slug":"demo-magaza", …}
   GET /TRPC/tenant.current  → 200 (BİREBİR AYNI gövde)   ⚠⚠
   GET /Trpc/tenant.current  → 200 (BİREBİR AYNI gövde)   ⚠⚠
   ```

3. ⭐⭐ **`platform.*` router'ına ULAŞIYOR** — en keskin ölçüm:

   ```
   GET /trpc/platform.tenantList   → 403 PLATFORM_ADMIN_REQUIRED
   GET /TRPC/platform.tenantList   → 403 PLATFORM_ADMIN_REQUIRED   ⚠⚠ AYNI
   GET /trpc/platform%2EtenantList → 403 PLATFORM_ADMIN_REQUIRED
   ```

   `PLATFORM_ADMIN_REQUIRED` **yalnızca `platformAdminProcedure`'ün içinden**
   gelebilir ⇒ `/TRPC/...` isteği `PlatformAdminIpGuard`'ı geçip **tRPC'nin
   `platform.tenantList` prosedürüne ulaşmış**. Aynı istek için
   `isPlatformAdminGuardedPath` **`false`** döndüğü (yukarıda gerçek fonksiyonla
   ölçüldü) için guard **hiç değerlendirilmemiştir**.

**Zincirin tek çıkarsanan halkası** (tur 1'dekiyle aynı): platform yöneticisi
**olan** bir oturumla 403 yerine 200 alınması. Ortamda `platform_admin` + kiracı
üyeliği olan bir kullanıcı **yok** (61 platform yöneticisinin tamamı "üyelik yok"
— ölçüldü) ve kimlik üretmem yasak.

### (e) ⚠ Orkestratörün `DOĞRULANAMADI` sorusu — **TEYİT EDİLDİ, ama gerekçesi DARALTILDI**

> _"`PlatformAdminIpGuard`'ın kendi 403'ü oturumsuz curl'la gözlenemiyor; tur1'in
> 403 beklentisi yapısal olarak sağlanamıyor."_

**Oturumsuz kısım DOĞRU** — ölçtüm: oturumsuz `/trpc/platform.tenantList` → 401
`UNAUTHENTICATED`. `AuthGuard` gerçekten önce kesiyor.

⚠ **Ama "yapısal olarak sağlanamaz" iddiası eksik gerekçeli.** `perf`'in
yöntemiyle **gerçek oturum kurdum** ve `AuthGuard`'ı geçtim (yukarıdaki 403'ler
bunun kanıtı) — yani oturum engeli **aşılabilir bir engeldi**. 403
`PLATFORM_NETWORK_NOT_ALLOWED` yine de gözlenemedi, ama sebebi **başka ve daha
dar**:

- `SUPERADMIN_IP_ALLOWLIST=127.0.0.1` ve istemci IP'm **`127.0.0.1`** ⇒ allowlist
  dalı **geçiyor**, reddetmiyor.
- `AUTH_TRUSTED_PROXY_COUNT` kök `.env`'de **tanımsız** ⇒ varsayılan `0` ⇒
  `resolveClientIp` `X-Forwarded-For`'u **okumuyor** ⇒ IP **spoof edilemiyor**.

⇒ **`DOĞRULANAMADI`: `PlatformAdminIpGuard`'ın kendi 403'ü bu ortamda hiçbir
yöntemle gözlenemez** (API yeniden başlatılmadan veya `AUTH_TRUSTED_PROXY_COUNT`
değiştirilmeden). Bu, guard'ın **kanonik yolda** doğru çalıştığını **göstermez
de, çürütmez de** — ama F1-TUR2 için bu önemsiz: bulgu guard'ın _doğruluğu_
değil, **hiç çalışmaması**dır ve o ölçüldü.

---

## 2. ⚠ ORAN SINIRI — F2'nin DURUMU (bir kapandı, biri AÇILDI)

### (a) ✅ `%2E` ekseni kapandı — teyit

`resolveRateLimitPolicy('POST','/trpc/registration%2EcreateTenant')` →
**tanımlı** (`routeKey: "POST /trpc/registration.createTenant"`, `accountLimit:5`,
`ipLimit:20`). Gerçek fonksiyonla ölçüldü. Aynı şekilde
`POST /auth/sign-in%2Femail` → tanımlı.

### (b) ⚠⚠ Büyük/küçük harf ekseni AÇIK — **CANLI, SAYAÇLA KANITLANDI** (F2-TUR2)

Üç **birebir aynı** POST, aynı oturum, aynı gövde (`{}`):

| İstek                        | HTTP yanıtı                                 | Sayaç etkisi |
| ---------------------------- | ------------------------------------------- | ------------ |
| `POST /auth/sessions/revoke` | 400 `VALIDATION_ERROR` + `fields.sessionId` | **+1**       |
| `POST /AUTH/sessions/revoke` | 400 `VALIDATION_ERROR` + `fields.sessionId` | ⚠⚠ **0**     |
| `POST /Auth/Sessions/Revoke` | 400 `VALIDATION_ERROR` + `fields.sessionId` | ⚠⚠ **0**     |

Redis sonrası durum (salt okuma):
`platform:auth:post-auth-sessions-revoke:ip:e3c1…` = **1**,
`…:account:8cae…` = **1**.

⇒ Üç istek de **gerçek işleyiciye ulaştı** (gövde şeması çalıştı, alan bazlı
`VALIDATION_ERROR` döndü) ama yalnızca biri **ölçüldü**. Bu, teorik değil
**mekanik, gözlenmiş** bir oran sınırı atlatmasıdır.

**Etkilenen 6 rota:**

- `GET /auth/sessions`, `POST /auth/sessions/revoke`, `POST /auth/sessions/revoke-all`
  (`sessions.controller.ts:75,82,101` — kendi Nest rotaları; **canlı kanıtlandı**)
- `GET /trpc/registration.checkSlugAvailability`, `POST /trpc/registration.createTenant`,
  `GET /trpc/registration.onboardingChecklist`
  (`resolveRateLimitPolicy('POST','/TRPC/registration.createTenant')` →
  **`undefined`**, ölçüldü; rotaya ulaşım §1(d)-2'de kanıtlandı. ⚠ Gerçek kiracı
  OLUŞTURMAMAK için canlı POST atılmadı — yan etki üretmeme kuralı.)

### (c) ⭐⭐ GİRİŞ YÜZEYİ **SAĞLAM** — en önemli olumlu bulgu

Better Auth'a delege edilen yollar bu eksenden **etkilenmiyor**, çünkü
`AuthController.delegate` kendi **fail-closed TAM EŞLEŞME** allowlist'ini
(`isAuthDelegatedPath`, `auth.controller.ts:121-126`) rotadan **sonra** uyguluyor
ve küme dışını **404** ile kesiyor. Canlı doğrulandı (oturumlu, doğru `Origin`):

```
POST /AUTH/sign-in/email           → 404   POST /AUTH/sign-up/email        → 404
POST /AUTH/request-password-reset  → 404   POST /AUTH/two-factor/verify-totp → 404
```

Dört istekten sonra ilgili Redis sayaçlarında **sıfır değişim**. ⇒ **Giriş /
şifre sıfırlama / 2FA kaba kuvvet savunması ATLATILAMIYOR.** Bu, `/trpc/*`
yüzeyinin neden savunmasız olduğunu da açıklıyor: `TrpcController.handle`'ın
`@All('trpc/*path')`'i **eşdeğer bir allowlist taşımıyor** — her yol doğrudan
tRPC'ye gidiyor. ⇒ Önerilen düzeltmenin emsali **zaten repoda var**.

### (d) Muafiyet kümeleri — **GÜVENLİ YÖNDE** bozuluyor (bulgu değil)

`isTenantExemptPath('/TRPC/platform.tenantList')` → **`false`** ⇒ süper admin
host'unda (rezerve alt alan adı, `unresolved`) `TenantGuard` isteği **404** ile
kesiyor (canlı doğrulandı). Aynı şekilde `/TRPC/storefront.currentTenant` →
`AUTH_EXEMPT_PATHS`'e eşleşmiyor ⇒ **401** (daha sıkı). ⇒ Bu iki küme için
büyük/küçük harf sapması **koruma yönünde** çalışıyor.

⚠ **Ama bu F1-TUR2'yi azaltmıyor:** saldırı **çözülen bir kiracı host'undan**
yapılır (tur1 F1(d) adım 2 — aktör `registration.createTenant` ile ön koşulu
kendisi üretir), orada `TenantGuard` 404 vermez.

---

## 3. ⭐ YENİ YÜZEY — TAM TARAMA

### ① `scripts/e2e-env-passthrough-check.ts` (YENİ, 385 satır) · **TEMİZ**

| Eksen                 | Bulgu                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Enjeksiyon            | **Yok.** Ağ yok, kabuk alt süreci yok, `exec*` yok. Yalnızca `readFileSync`/`readdirSync`/`statSync`                  |
| Yol geçişi            | **Yok.** Tüm yollar `REPO_ROOT` + **sabit** `SCAN_ROOTS`/`KNOWN_WHOLE_OBJECT_ENV_PASS_FILES` literallerinden türüyor  |
| Sır sızıntısı         | **Yok.** Çıktı yalnızca değişken **ADI** ve `dosya:satır` yazıyor; `process.env` **değerleri** hiçbir yere yazılmıyor |
| Fail-closed           | ✅ Şema anahtarı bulunamazsa (`schemaKeys.length === 0`) **ihlal** üretiyor — sessiz yeşil yok                        |
| Yasak jeton disiplini | ✅ `NAMED_ENV_PATTERN`/`BARE_ENV_PATTERN` runtime regex; kendi metnini taramıyor (`SCAN_ROOTS`'ta `scripts/*.ts` yok) |

⭐ Dosyanın §(B) "kör nokta" itirafı (bütün-nesne `process.env` geçişi için
otomatik doğrulama yok, yalnızca allowlist zorlaması) **dürüst ve doğru**; negatif
mutasyon testi de dosyada kayıtlı. Güvenlik açısından bulgu **yok**.

### ② `turbo.json` `passThroughEnv` 5 → 10 · **TEMİZ**

Eklenen 10 anahtarın **hiçbiri sır taşımıyor**: `APP_BASE_DOMAIN`,
`ARKESOFT_PANEL_DEV_API_TARGET`, `ARKESOFT_PANEL_E2E_PORT`,
`ARKESOFT_STOREFRONT_E2E_PORT`, `ARKESOFT_SUPERADMIN_DEV_API_TARGET`,
`ARKESOFT_SUPERADMIN_E2E_PORT`, `POSTGRES_DB`, `POSTGRES_PORT`, `POSTGRES_USER`,
`STOREFRONT_API_BASE_URL`.

⭐ **`POSTGRES_PASSWORD` listede YOK** ve `scripts/playwright/sql.ts` parola
**okumuyor** (`docker exec` ile konteyner içinden `psql`, trust auth) ⇒ sır
geçişi yüzeyi doğmuyor. `test:e2e` zaten `cache: false` ⇒ hash etkisi de yok.

### ③ `scripts/playwright/mailpit.ts` (YENİ) · **`devops` GEREKÇESİ ONAYLANDI**

Denetledim — gerekçe **doğru**, K1(d)-benzeri kapı **gerekmiyor**:

- **Salt okuma:** yalnızca `GET /api/v1/messages?limit=50` ve
  `GET /api/v1/message/:id`. Yazma/silme/komut **yok**.
- **SSRF yok:** `MAILPIT_BASE_URL` **sabit literal** `http://127.0.0.1:8025` —
  env'den **okunmuyor**, çağırandan **parametre almıyor**. Mesaj kimliği
  (`match.ID`) Mailpit'in **kendi** yanıtından geliyor, kullanıcı girdisinden
  değil.
- **Enjeksiyon yüzeyi yok:** düz `fetch`; kabuk alt süreci yok, SQL yok, dize
  interpolasyonu yalnızca sayısal/opak `ID`'de.
- **Fail-closed:** token bulunamazsa sessizce boş dönmüyor, `throw` ediyor.
- ⚠ Tek not (bulgu **değil**): `new URL(urlMatch[0])` e-posta gövdesinden
  okunan bir URL'yi ayrıştırıyor ama **istek atmıyor**, yalnızca `token` sorgu
  parametresini okuyor ⇒ SSRF doğmuyor.

K1(d)'nin var olma nedeni (**ayrıcalıklı YAZMA yolunun `apps/*/src/**`'e
sızması**) burada gerçekten yok. ⇒ Bulgu yazılmadı; `devops`'un bıraktığı
"üçüncü kopya mekanik olarak yakalanmıyor" borcu **doğru sınıflandırılmış**
(düşük öncelik, güvenlik değil bakım borcu).

### ④ `scripts/playwright/sql.ts` (POSTGRES\_\* okuması) · **TEMİZ**

`execFileSync('docker', [...argv])` — **kabuk yok** ⇒ `POSTGRES_USER`/
`POSTGRES_DB`/`POSTGRES_PORT` env değerleri **komut enjeksiyonu yapamaz** (argv
elemanı olarak geçiyor). Dört fail-closed kapı (`NODE_ENV=test`, loopback docker
endpoint, tek-konteyner çözümü, `ON_ERROR_STOP=1`) yerinde. Tur 1'in
değerlendirmesi geçerli.

### ⑤ `apps/superadmin/src/components/Sidebar.tsx` (×2 değişti) + `sidebar-focus-return.qa.spec.ts` (YENİ) · **TEMİZ**

Saf sunum bileşeni — veri çekmiyor, `fetch`/`href`/`navigate`/token/sır **yok**
(grep: 0 eşleşme). `apps/superadmin/src` genelinde yeniden tarandı:
`dangerouslySetInnerHTML` / `innerHTML` / `eval(` / `new Function` /
`document.write` / `window.location =` / `location.href =` → **0 eşleşme**;
`localStorage` / `sessionStorage` / `document.cookie` → **0 eşleşme** (oturum
yalnızca `HttpOnly` çerezde). `qa`'nın spec'i fixture parolası kullanıyor —
test-only, üretilen kullanıcı.

### ⑥ `ci.yml` / `guards.sh` · **TEMİZ**

`ci.yml`'e eklenen iki env (`SUPERADMIN_BASE_URL`,
`SUPERADMIN_IP_ALLOWLIST: 127.0.0.1`) sır **değil** ve efemeral runner'a özgü.
`guards.sh`'in 19. adımı (`node scripts/e2e-env-passthrough-check.ts`) ek
ayrıcalık **gerektirmiyor**.

---

## 4. TEKRAR ÖLÇÜLEN DEĞİŞMEZLER (tur 1 ile BİREBİR aynı)

| Ölçüm                                       | Sonuç                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `rolsuper \| rolbypassrls`                  | `arkesoft_app` / `_auth` / `_migrator` → **`f\|f`**                                       |
| `public`'te view/matview/foreign tablo      | **0**                                                                                     |
| `pg_proc.prosecdef` (`SECURITY DEFINER`)    | **0**                                                                                     |
| `platform_admin` / `platform_audit_log` RLS | `f\|f` (platform seviyesi — **doğru**)                                                    |
| `subscription` RLS                          | `t\|t`                                                                                    |
| `arkesoft_app` → `platform_admin` yetkileri | `DELETE,INSERT,SELECT,UPDATE` (⚠ F4 `low`, açık)                                          |
| Repoya giren sır                            | **Yok** (`git diff` jeton taraması; `.env.example`'a eklenen 20 satırın tamamı **yorum**) |
| Yeni bağımlılık                             | **Yok** (`pnpm-lock.yaml` diff'inde yeni `resolution:` girdisi 0)                         |

**CLAUDE.md §7 — karşılanmayan madde: YOK.** Bu turda yeni kiracı tablosu, yeni
DB nesnesi, yeni kuyruk işi, yeni dosya yükleme veya yeni giden istek **yok**;
F1-TUR2/F2-TUR2 §7'nin **dışındaki** eksenlerde (ağ katmanı savunma derinliği +
oran sınırı).

---

## 5. ÖLÇÜM KOŞULLARI VE ORTAM ETKİSİ (AGENT_BASELINE §4, ders 2 · §5)

- **Makine yükü:** `arkesoft-*` altyapı konteynerleri (5) ayakta; kullanıcı
  konteynerlerine **dokunulmadı**. Ölçümler gecikme değil **davranış/durum kodu**
  olduğu için yük duyarlı değil.
- **Koşturulan komutlar:** `pnpm audit` (1), `curl` salt-okuma (38 istek),
  `docker exec … psql -tAc` salt-okuma (5), `docker exec … redis-cli get/scan`
  salt-okuma (çoklu), `npx tsx` saf hesap (2), `node` HMAC imzalama (1),
  `git diff`/`status`/`grep`.
- ⚠ **Koşturulmayanlar:** `pnpm test`, `test:isolation`, `test:e2e`, `guards`,
  `build` — gate paralelliği (`solid`/`wcag` tur 2) ve `test:e2e` yasağı gereği.
- ⚠⚠ **ORTAMDA BIRAKTIĞIM İZ (tam dökümü):** üç Redis oran-sınırı sayacı arttı,
  üçü de TTL ile kendiliğinden sönüyor (pencere 900 sn):
  - `post-auth-sign-in-email:ip:*` = **1/20** (⚠ `/auth/sign-in%2Femail` probu —
    bu yolun politikası düzeltmeden **sonra** tanımlı hâle geldiği için sayaç
    arttı; gövdede geçerli e-posta **yoktu** ⇒ **`EMAIL_IP_LIMIT`'in hesap
    kapsamlı kovası HİÇ dokunulmadı**, Redis'te `…sign-in-email:account:*`
    anahtarı **yok** — doğrulandı)
  - `post-auth-sessions-revoke:ip:*` = **1/20** ve `…:account:*` = **1/5**
    (kanıt ölçümünün kaçınılmaz yan etkisi)
  - ⇒ `qa` tur 2'nin bütçesi **pratikte el değmemiş** (giriş kovasında 19/20
    kaldı).
- **Durum DEĞİŞTİRMEYENLER:** hiçbir DB yazması yapılmadı (mevcut, süresi
  dolmamış bir fixture oturumu **yeniden kullanıldı** — `perf`'in yöntemi, ama
  oturum **üretmeden**: `session` tablosuna INSERT **yok**). `revoke` probları
  `400 VALIDATION_ERROR` ile öldüğü için **hiçbir oturum iptal edilmedi**.
  `BETTER_AUTH_SECRET` okundu, **hiçbir çıktıda yazdırılmadı**.
- **Dosya:** hiçbir kaynak dosya değiştirilmedi. Kök `.env` **okundu, yazılmadı**.
  Port 3000 / 5173 / 5174'e **dokunulmadı**. `docker context` **değiştirilmedi**,
  hiçbir konteyner durdurulmadı. `git stash`/`checkout --`/`restore`/`add`/
  `commit` **yapılmadı**. Yazılan tek dosya **bu rapordur**.
