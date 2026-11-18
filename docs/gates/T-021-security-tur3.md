# T-021 — GATE: `security` — TUR 3

- **Tarih:** 2026-11-16
- **Sürüm:** ROADMAP v0.0.20 (süper admin iskeleti)
- **Dal:** `feat/v0.0.21-surum-kayit-modeli`
- **Önceki raporlar:** `docs/gates/T-021-security-tur1.md` · `-tur2.md`

```
GATE: security
SONUÇ: FAIL
BULGULAR:
  - [SEV: high] apps/api/src/http/normalize-request-path.ts:138-140 (+ apps/api/src/auth/rate-limit/rate-limit.policy.ts:365) — ⚠⚠ ÜÇÜNCÜ EKSEN: SONDAKİ EĞİK ÇİZGİ SAYISI. `normalizeRequestPath` sondaki `/`'ı YALNIZCA BİR KEZ soyar; `@trpc/server@11.19.0`'ın `fetchRequestHandler`'ı ise `trimSlashes(trimSlashes(pathname).slice(4))` ile TOPLAM BİR BAŞTAN + BİR SONDAN daha soyar ⇒ ikisi TAM BİR eğik çizgi kadar ayrışır. `POST /trpc/registration.createTenant//` tRPC'de `registration.createTenant` mutasyonunu AYNEN çalıştırır (kanonik yolla BİREBİR aynı 500, gerçek pinli handler'la ölçüldü) ama `resolveRateLimitPolicy` `/trpc/registration.createTenant/` görür ve `undefined` döner ⇒ `RateLimitGuard` (`rate-limit.guard.ts:214-216`) Redis'e HİÇ dokunmadan `true` döner. SALDIRI: kendi kiracısına ÜYE herhangi bir doğrulanmış kullanıcı (yani her müşteri), `Host: <kendi-kiracisi>.arkesoft.app` + `Origin: https://panel.arkesoft.app` (herkese açık, `trusted-origins.ts:13` tam-eşleşme listesi Host'u DEĞİL yalnızca Origin'i karşılaştırır — canlı ölçüldü) ile `/trpc/registration.checkSlugAvailability//` çağırarak SINIRSIZ slug numaralandırması (ADR-0021 §3: `taken` başka bir kiracının VARLIĞINI bildirir), `/trpc/registration.createTenant//` ile SINIRSIZ kiracı oluşturma, `/trpc/registration.onboardingChecklist//` ile SINIRSIZ üye-olunmayan-slug yoklaması yapar. ADR-0021 §2 koşul E'nin (üç rotada oran sınırı) kabul kriteri KARŞILANMIYOR. — Düzeltme: `normalizeRequestPath` sondaki eğik çizgileri TEK TEK değil TAMAMEN soysun (`mountFolded.replace(/\/+$/, '')`, kök `/` korunarak) — `///` varyantı tRPC'de zaten `NOT_FOUND` olduğu için bu fail-CLOSED yönde fazladan eşleşme üretir, GÜVENLİ. Ayrıca `normalize-request-path.test.ts`'e DEĞİŞMEZLİK testi eklensin: appRouter'ın HER prosedürü × mutasyon jetonu kümesi için `tRPCçözer(P) !== null ⇒ normalizeRequestPath(P) === '/trpc/'+tRPCçözer(P)` — bu tek testi yazmak ÜÇ eksenin (yüzde-kodlama, büyük/küçük harf, eğik çizgi) ÜÇÜNÜ DE aynı anda yakalardı ve dördüncüsünü de yakalar. — backend
  - [SEV: low] apps/api/src/platform/impersonation.service.ts:226 + packages/trpc/src/schemas/platform.schema.ts:168 — TUR 1 F3 / TUR 2 AYNEN AÇIK (satırlar bu turda yeniden teyit edildi, `subject: [...tenantIds].sort().join(',')` değişmemiş): "kiracı kimlik listesi TELE ÇIKMAZ" kararı `subject` alanı üzerinden fiilen baypas ediliyor. — backend + docs · vade: v0.15.0
  - [SEV: low] apps/api/src/prisma/prisma.service.ts:119-139 + canlı katalog — TUR 1 F4 / TUR 2 AYNEN AÇIK (bu turda YENİDEN ölçüldü: `arkesoft_app` → `platform_admin` üzerinde `DELETE INSERT SELECT UPDATE`). Platform yetkisi = satırın VARLIĞI ⇒ yetki yükseltme ekseni. — db + devops · vade: v0.0.20.1
  - [SEV: low] apps/api/src/__tests__/platform-impersonation-write-gate.test.ts:57,78 — TUR 1 F5 / TUR 2 AYNEN AÇIK (needle'lar birebir aynı). KAPI B hâlâ yalnızca AÇIK `@Inject(...)` dekoratörünü görüyor. — backend · vade: v0.0.20.1
  - [SEV: low] apps/api/src/config/api-env.ts:69,96 + apps/api/src/auth/trusted-origins.ts:47-51 — TUR 1 F6 / TUR 2 AYNEN AÇIK (iki satır da değişmemiş): `z.url()` özel-olmayan şema kabul eder, `.origin` literal `"null"` olabilir ⇒ `Origin: null` taşıyan istekler `SameOriginGuard`'ı geçebilir. — backend · vade: v0.0.20.1
  - [SEV: low] pnpm-lock.yaml (DEĞİŞMEMİŞ satırlar) — TUR 1 F7 / TUR 2 AYNEN AÇIK, sayılar BİREBİR AYNI: `pnpm audit` → 0 critical / 1 high (`multer`) / 3 moderate / 1 low (`astro`). FIX turları HİÇBİR yeni üçüncü-taraf paket eklemedi (tüm yeni `apps/superadmin` bağımlılıkları `catalog:` / `workspace:*` — ölçüldü). — devops · vade: v0.0.20.1
ÖLÇÜMLER: pnpm audit → 0 critical / 1 high / 3 moderate / 1 low (tur1 + tur2 ile BİREBİR aynı; hiçbiri bu sürümden; yeni üçüncü-taraf paket 0) · incelenen dosya: 24 (11 tam/kısmi okuma + 13 hedefli diff/grep) + 4 bağımlılık kaynağı (`@trpc/server` fetchRequestHandler + resolveResponse, `better-call/crypto`, `@nestjs/platform-express` express-adapter, `path-to-regexp@8.4.2`) · CLAUDE.md §7 18 maddeden KARŞILANMAYAN: YOK (madde 4 GEREKÇELİ İSTİSNA, ADR-0023 Karar 2 — tur1/tur2 ile aynı); ⚠ F8 §7'nin DIŞINDA bir eksen (kiracı izolasyonu DEĞİL — oran sınırı/numaralandırma) · canlı HTTP ölçümü: 41 istek (:3100) · canlı Redis: 4 salt-okuma taraması + 5 sayaç gözlemi · canlı psql: 5 salt-okuma · statik simülasyon: 6 `npx tsx`/`node` koşumu (gerçek üretim + gerçek pinli bağımlılık kodu) · SİSTEMATİK EKSEN TARAMASI: 35.840 yol varyantı
```

---

## 0. ÖZET — bu turun üç sorusu

| Soru                                                          | Cevap                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `backend`'in F1-TUR2/F2-TUR2 düzeltmesi gerçekten kapandı mı? | ✅ **EVET** — canlı, ayırt edici tanıkla ölçüldü (§1)                                |
| `backend`'in yol (2)'yi eleme gerekçesi doğru mu?             | ✅ **EVET** — bağımsız olarak, canlı Express 5.3.0 deneyiyle doğrulandı (§2)         |
| ⚠⚠ Üçüncü eksen var mı?                                       | ⚠⚠ **EVET — BULUNDU.** Sondaki eğik çizgi sayısı (`//`). 35.840 varyant tarandı (§3) |

⇒ **SONUÇ: FAIL** (1 × `high`). Üç düzeltme turu tükendiği için Task **`ESCALATED`**.

---

## 1. `backend`'in iki `DOĞRULANAMADI`'sı — ⭐ İKİSİ DE KAPANDI

### 1.1 Ayırt edici tanık bulundu (tur 1 ve tur 2'nin bulamadığı)

Tur 2 şunu yazmıştı: _"`PlatformAdminIpGuard`'ın kendi 403'ü bu ortamda hiçbir yöntemle
gözlenemez"_ — çünkü `SUPERADMIN_IP_ALLOWLIST=127.0.0.1` ve istemci IP'si `127.0.0.1`'di,
`AUTH_TRUSTED_PROXY_COUNT=0` olduğu için `X-Forwarded-For` spoof edilemiyordu.

⭐ **Bu tur çıkış yolunu buldu:** API `*:3100`'de (tüm arayüzlerde) dinliyor
(`lsof` ile ölçüldü). Aynı makinenin **LAN arayüzüne** (`192.168.1.4:3100`) bağlanıldığında
`socket.remoteAddress` `192.168.1.4` olur — allowlist'te **YOK** ⇒ guard'ın `ip_not_allowed`
dalı **gerçekten tetiklenir**. Hiçbir env değiştirilmedi, API yeniden başlatılmadı,
kimlik üretilmedi (tur 2'nin fixture oturumu yeniden imzalanarak kullanıldı).

Bu, **iki durumu kesin olarak ayıran** bir tanık verir:

| Gözlenen hata kodu             | Anlamı                                                        |
| ------------------------------ | ------------------------------------------------------------- |
| `PLATFORM_NETWORK_NOT_ALLOWED` | `PlatformAdminIpGuard` **DEĞERLENDİRİLDİ** ve reddetti        |
| `PLATFORM_ADMIN_REQUIRED`      | Guard **ATLANDI** (veya geçti), istek tRPC prosedürüne ULAŞTI |

**Taban doğrulama (ölçüldü):**

| İstek                                                  | Yanıt                              |
| ------------------------------------------------------ | ---------------------------------- |
| `GET http://127.0.0.1:3100/trpc/platform.tenantList`   | 403 `PLATFORM_ADMIN_REQUIRED`      |
| `GET http://192.168.1.4:3100/trpc/platform.tenantList` | 403 `PLATFORM_NETWORK_NOT_ALLOWED` |

⇒ Tanık çalışıyor. Bu, `backend`'in **`DOĞRULANAMADI` #1**'ini kapatır — üstelik
"platform yöneticisi oturumu üretme" ihtiyacı olmadan, çünkü **ayrım guard'ın kendi
hata kodunda**, prosedürün çıktısında değil.

### 1.2 F1-TUR2 (büyük/küçük harf → `PlatformAdminIpGuard` atlatma) — **KAPANDI**

Aynı oturum, aynı IP (`192.168.1.4` — allowlist dışı), yalnızca yol değişti:

| Yol                              | Yanıt                              | Guard çalıştı mı |
| -------------------------------- | ---------------------------------- | ---------------- |
| `/trpc/platform.tenantList`      | 403 `PLATFORM_NETWORK_NOT_ALLOWED` | ✅ EVET          |
| `/TRPC/platform.tenantList`      | 403 `PLATFORM_NETWORK_NOT_ALLOWED` | ✅ **EVET**      |
| `/TrPc/platform.tenantList`      | 403 `PLATFORM_NETWORK_NOT_ALLOWED` | ✅ **EVET**      |
| `/trpc/platform%2EtenantList`    | 403 `PLATFORM_NETWORK_NOT_ALLOWED` | ✅ EVET (tur 1)  |
| `/trpc/platform.tenantList/`     | 403 `PLATFORM_NETWORK_NOT_ALLOWED` | ✅ EVET          |
| `/trpc/./platform.tenantList`    | 403 `PLATFORM_NETWORK_NOT_ALLOWED` | ✅ EVET          |
| `/trpc/a/../platform.tenantList` | 403 `PLATFORM_NETWORK_NOT_ALLOWED` | ✅ EVET          |

Tur 2'de `/TRPC/platform.tenantList` **`PLATFORM_ADMIN_REQUIRED`** döndürüyordu (guard
atlanmış, prosedür çalışmıştı). Bugün **`PLATFORM_NETWORK_NOT_ALLOWED`** dönüyor.
⇒ **F1-TUR2 canlı olarak, ayırt edici tanıkla kapandı.** (Bu aynı zamanda çalışan
`dist/`'in FIX 3'ü GERÇEKTEN taşıdığını kanıtlar — `dist` mtime'ı 10:17, süreç başlangıcı
~10:13 olduğu için bu şüpheliydi; davranış şüpheyi ortadan kaldırdı.)

### 1.3 F2-TUR2 (oran sınırı) — **KAPANDI**, canlı sayaçla

`DOĞRULANAMADI` #2 (canlı Redis 1→3) için **ikame teste güvenmedim, kendim ölçtüm.**
Ölçümden önce `post-auth-sessions-revoke:*` anahtarları TTL ile sönmüştü (**0**).

Gerçek `resolveRateLimitPolicy` ile (mock YOK):

| Girdi                                  | Politika                                   |
| -------------------------------------- | ------------------------------------------ |
| `POST /TRPC/registration.createTenant` | ✅ `POST /trpc/registration.createTenant`  |
| `POST /AUTH/sessions/revoke`           | ✅ `POST /auth/sessions/revoke` (fallback) |
| `POST /Auth/Sign-In/Email`             | — (`undefined`) — **doğru**, aşağıya bkz.  |

Canlı sayaç (aynı oturum, aynı gövde, dört kanonik `POST /auth/sessions/revoke`):
`…revoke:ip:*` **0 → 4**, `…revoke:account:*` **0 → 4**. Sayaç gerçekten artıyor.

⚠ **TUR 2'NİN BİR ÖLÇÜMÜNÜ DÜZELTİYORUM.** Tur 2, `/AUTH/sessions/revoke` ve
`/Auth/Sessions/Revoke`'un "gerçek işleyiciye ULAŞTIĞINI" (400 `VALIDATION_ERROR`)
yazmıştı. **Bugün üç farklı `Host` değeriyle tekrarladım — ikisi de 404
`TENANT_NOT_FOUND` dönüyor**, yani `TenantGuard`'da ölüyorlar (`isTenantExemptPath`
büyük/küçük harf duyarlı ve `/auth` **katlanmıyor**; `TenantGuard`, `RateLimitGuard`'tan
ÖNCE koşuyor). ⇒ Rezerve host'ta (`panel.*`) fallback'e **sıra gelmiyor**.

⭐ **Ama fallback VACUOUS DEĞİL** — gerçek kiracı host'unda sıra geliyor, bunu da ölçtüm:
`Host: demo-magaza.arkesoft.localhost` ile `POST /AUTH/sessions/revoke` →
**403 `TENANT_MEMBERSHIP_REQUIRED`** (404 DEĞİL) ⇒ `TenantGuard` **geçti**, zinciri
kesen yalnızca üyelik kontrolü. Üyesi olan bir kullanıcı için `RateLimitGuard`'a
ULAŞILIR ve fallback **gerekir**. ⇒ `backend`'in düzeltmesi **doğru yerde ve gerekli**.

### 1.4 `backend`'in ikame kanıtı (`rate-limit-guard-case-sensitivity.test.ts`) — **YETERLİ**

Değerlendirme: ✅ kabul ediyorum. Üç gerekçe:

1. Mock **doğru dikişte**: `RateLimitService` (Redis I/O) mock'lanmış,
   `resolveRateLimitPolicy` **mock'lanmamış** — `RateLimitGuard.canActivate` onu
   `rate-limit.guard.ts:212`'de **gerçek** `req.method`/`req.url` ile çağırıyor.
2. `checkAndIncrement` çağrı sayısı, Redis sayacının artışının **birebir** vekili:
   `policy === undefined` dalı (`:214-216`) Redis'e **hiç dokunmaz**.
3. **Vacuous değil** — dosya ayrıca `POST /Auth/Sign-In/Email` için `not.toHaveBeenCalled()`
   iddia ediyor, yani fallback'in `AUTH_DELEGATED_PATHS` yüzeyine **sızmadığını** da pinliyor.

Yine de ikame **tek başına yeterli olmazdı** (pipeline'ın ÖNCEKİ guard'larını hiç
görmüyor — §1.3'teki `TenantGuard` sürprizi tam da bu yüzden kaçmıştı); yukarıdaki
canlı ölçüm bu boşluğu kapatıyor.

### 1.5 `/auth`'un bilerek katlanmaması — **TEYİT EDİLDİ**

Tur 2 §2(c)'nin bulgusu **iki bağımsız fail-closed katmanla** teyit edildi:

- `isAuthDelegatedPath('POST', '/AUTH/sign-in/email')` → **`false`** (gerçek fonksiyonla
  ölçüldü) ⇒ `AuthController.delegate` (`auth.controller.ts:121`) 404 ile keser;
  Better Auth'a **ulaşılmaz**.
- Ondan da ÖNCE: `isTenantExemptPath('/AUTH/sign-in/email')` → `false` ⇒ `TenantGuard`
  rezerve host'ta 404 veriyor (**canlı ölçüldü**).

⇒ Giriş/şifre-sıfırlama/2FA yüzeyi bu eksenden **etkilenmiyor**. `backend`'in
"`/auth` eklenmedi" kararı **doğru**.

---

## 2. ⭐ `backend`'in yol (2) elemesi — **BAĞIMSIZ OLARAK DOĞRULANDI**

İddia: _"`ExpressAdapter` constructor'ı `instance.use(...)`'u `NestFactory.create()`'in
İÇİNDE yapıyor ⇒ `case sensitive routing` o anki değerinde donuyor."_

**Kanıt 1 — kaynak:** `@nestjs/platform-express@12.2.0`,
`adapters/express-adapter.js:30-32`:

```js
constructor(instance) {
    super(instance || express());
    this.instance.use((req, res, next) => {   // ← lazyrouter BURADA tetikleniyor
```

**Kanıt 2 — canlı deney (express@5.3.0, Nest'ten bağımsız, iki sıralama):**

| Sıralama                | `/trpc/x` | `/TRPC/x` | `/trpc/x//` | `/trpc/x///` |
| ----------------------- | --------- | --------- | ----------- | ------------ |
| `use()` → sonra `set()` | 200       | **200**   | 200         | 200          |
| `set()` → sonra `use()` | 200       | **404**   | 200         | 200          |

⇒ Ayar gerçekten **donuyor**; uygulama kodu `app.set(...)`'i yetiştiremez. `backend`'in
gerekçesi **doğru** ve kaçırılan bir yol yok (kendi `express()` örneğini geçirmek,
`express`'i doğrudan bağımlılık yapar — onay eşiği).

⭐ **EK, ÖNEMLİ BULGU:** `case sensitive routing: true` **olsaydı bile ÜÇÜNCÜ EKSENİ
KAPATMAZDI** — iki sıralamada da `/trpc/x//` **200**. Yani yol (2) seçilseydi F8 yine
açık kalırdı. Yol (1) tercihinin maliyeti yok.

---

## 3. ⚠⚠ ÜÇÜNCÜ EKSEN — **BULUNDU** (F8)

### 3.1 Yöntem — sistematik tarama, tahmin değil

Yapısal zaafın tanımı: _"literal eşleştirici ↔ aşağı akışta daha gevşek eşleştirici"_.
Bunu bir **değişmezlik** olarak yazdım ve **ihlal arattım**:

> `tRPCçözer(P) ∈ appRouter.procedures` **ve** Express rotası `P`'yi eşleştiriyor
> ⇒ `normalizeRequestPath(P) === '/trpc/' + tRPCçözer(P)` **olmalı**.

- `tRPCçözer` = `@trpc/server@11.19.0`'ın `fetchRequestHandler.ts`'inden **birebir
  kopyalanmış** üç satır (`trimSlashes` + `slice(endpoint.length)` + `decodeURIComponent`).
- Express eşleşmesi = **gerçek** `path-to-regexp@8.4.2`, Express 5 varsayılanlarıyla
  (`sensitive:false`, `trailing:true`).
- `normalizeRequestPath` / `resolveRateLimitPolicy` / `isTenantExemptPath` /
  `matchesPrefixOrUnparsablePercentEncoding` = **gerçek üretim fonksiyonları**.

**Taranan uzay:** 5 hedef prosedür × 8 mount varyantı × 32 jeton × 32 jeton =
**35.840 benzersiz yol**.

**Denenen jeton kümesi (açık liste):**
`''`, `/`, `//`, `///`, `.`, `./`, `/.`, `/./`, `%2e`, `%2E`, `%2e%2e`, `%2f`, `%2F`,
`%252F` (çift kodlama), `%252E` (çift kodlama), ` ` (ham boşluk), `%20`, `%09` (tab),
`%00` (null byte), `;x=1` (matrix parametresi), `\`, `%5C`, `..`, `/..`, `/x/..`,
`İ` (Türkçe noktalı büyük I), `ı` (noktasız i), `ﬀ` (Unicode ligatür),
`Ｔ` (tam genişlik), `%C2%A0` (kırılmaz boşluk), `​` (ham sıfır genişlikli boşluk),
`%E2%80%8B` (kodlanmış sıfır genişlikli boşluk).
**Mount varyantları:** `/trpc`, `/TRPC`, `/Trpc`, `/tRpC`, `//trpc`, `/trpc/`,
`/%74rpc`, `/trpc%2F`.

### 3.2 Sonuç — **TEK bir ihlal şekli**

```
Denenen yol sayısı: 35840
İhlal: 40
Benzersiz normalize() ŞEKLİ: ["/trpc/<PROC>/"]
```

⇒ Unicode normalizasyonu, tam genişlik, Türkçe harf, çift kodlama, null byte,
boşluk/kontrol karakteri, matrix parametresi, ters eğik çizgi, `..`/`.` segmentleri,
`%2F` — **hiçbiri ayrışma üretmiyor** (çoğu her iki katmanda da aynı sonucu veriyor,
geri kalanı tRPC'de `NOT_FOUND`'a düşüyor). ⭐ **Tek bir eksen kaldı: sondaki eğik
çizgi SAYISI.**

### 3.3 Kök neden — bir eğik çizgilik aritmetik

| Katman                         | Davranış                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `normalizeRequestPath:138-140` | sondaki `/`'ı **EN FAZLA BİR KEZ** soyar                                               |
| tRPC `fetchRequestHandler`     | `trimSlashes(pathname)` + `slice(4)` + **`trimSlashes` BİR KEZ DAHA** (baş **ve** son) |

Net etki: tRPC, normalizer'ın bıraktığı **tam bir fazladan sondaki eğik çizgiyi**
tolere eder.

### 3.4 Kanıt — gerçek, pinli handler (mock yok)

`createTrpcRequestHandler()` doğrudan çağrıldı (`packages/trpc/dist/server.js`),
`POST`, `content-type: application/json`:

| Yol                                   | HTTP | tRPC sonucu                                   |
| ------------------------------------- | ---- | --------------------------------------------- |
| `/trpc/registration.createTenant`     | 500  | **prosedür BULUNDU ve ÇALIŞTI**               |
| `/trpc/registration.createTenant//`   | 500  | ⚠⚠ **BİREBİR AYNI — ÇALIŞTI**                 |
| `/trpc/registration.createTenant///`  | 404  | `NOT_FOUND`                                   |
| `/trpc/registration.createTenant/%2F` | 404  | `NOT_FOUND`                                   |
| `/trpc/nope.nope//`                   | 404  | `NOT_FOUND` ← **kontrol** (500 jenerik değil) |

(500, sahte context'in portları taşımamasından; **prosedür gövdesine girildiğinin**
kanıtı — bulunmayan prosedür 404 veriyor.)

Aynı yolların literal eşleştiricideki karşılığı (gerçek fonksiyonlar):

| Yol                                 | `normalizeRequestPath`             | `resolveRateLimitPolicy` | `isTenantExemptPath` | `isPlatformAdminGuardedPath`        |
| ----------------------------------- | ---------------------------------- | ------------------------ | -------------------- | ----------------------------------- |
| `/trpc/registration.createTenant`   | `/trpc/registration.createTenant`  | ✅ VAR                   | `true`               | `false`                             |
| `/trpc/registration.createTenant//` | `/trpc/registration.createTenant/` | ⚠⚠ **YOK**               | `false`              | `false`                             |
| `/trpc/platform.tenantList//`       | `/trpc/platform.tenantList/`       | YOK                      | `false`              | ⭐ **`true`** (ÖNEK — etkilenmiyor) |

### 3.5 Her tüketici için etki — ⭐ yalnızca BİRİ sömürülebilir

| Tüketici                                                | `//` varyantında                                                                             | Yön              |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------- |
| `isPlatformAdminGuardedPath` (ÖNEK)                     | hâlâ `true` ⇒ guard **koşar**                                                                | ✅ Etkilenmiyor  |
| `isTenantExemptPath` / `isAuthExemptPath` (TAM EŞLEŞME) | `false` ⇒ **DAHA** kısıtlayıcı                                                               | ✅ Fail-closed   |
| `isAuthDelegatedPath` + `/auth` statik rotaları         | Express statik rota `//`'ı **eşleştirmiyor** (`^…(?:\/$)?$`, ölçüldü) ⇒ joker → delegate 404 | ✅ Fail-closed   |
| ⚠⚠ `resolveRateLimitPolicy` (TAM EŞLEŞME)               | `undefined` ⇒ `RateLimitGuard` → `true`, **Redis'e hiç dokunmaz**                            | ⚠⚠ **FAIL-OPEN** |

### 3.6 Saldırı senaryosu — kim, neyle, ne elde eder

**Kim:** `platform_admin` olmayan, sıradan, doğrulanmış bir kullanıcı — **tek koşul**,
en az bir kiracıya üye olması (yani her ödeme yapan müşteri).

**Ne gönderir:**

```
POST https://<kendi-kiracisi>.arkesoft.app/trpc/registration.createTenant//
Origin: https://panel.arkesoft.app        ← herkese açık, sabit
Cookie: better-auth.session_token=<kendi oturumu>
```

**Zincir (her halka ölçüldü, biri hariç):**

| #   | Halka                  | Sonuç                                                                 | Kanıt                                                                                 |
| --- | ---------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Express rotası         | `trpc/*path` **eşleşiyor**                                            | gerçek `path-to-regexp` + canlı `TENANT_NOT_FOUND` (Nest 404 **değil**, bkz. §3.7)    |
| 2   | `TenantGuard`          | Host'tan kiracı **çözülür** ⇒ geçer                                   | canlı: `demo-magaza` host'unda 404 **değil** 403 döndü                                |
| 3   | `AuthGuard`            | kiracıya **üyeyse** geçer                                             | ⚠ **TEK ÇIKARSANAN HALKA** — bu ortamda `tenant_membership` tablosu **boş** (ölçüldü) |
| 4   | `RateLimitGuard`       | `policy === undefined` ⇒ `true`, **sayaç ARTMAZ**                     | gerçek `resolveRateLimitPolicy` + `rate-limit.guard.ts:214-216`                       |
| 5   | `SameOriginGuard`      | Origin **tam-eşleşme** listesinde (Host ile KARŞILAŞTIRILMAZ) ⇒ geçer | canlı: panel Origin + `demo-magaza` Host → 400 (geçti); kiracı Origin → 403           |
| 6   | `PlatformAdminIpGuard` | `platform.*` değil ⇒ anında `true`                                    | kaynak                                                                                |
| 7   | tRPC                   | `registration.createTenant` **çalışır**                               | gerçek pinli handler (§3.4)                                                           |

⭐ **KONTROLLÜ CANLI KARŞILAŞTIRMA** (aynı oturum, aynı Host, aynı gövde, aynı metot —
yalnızca iki eğik çizgi farkı):

| İstek                                    | Yanıt                             | `…createtenant:ip` sayacı |
| ---------------------------------------- | --------------------------------- | ------------------------- |
| `POST /trpc/registration.createTenant`   | 403 `CROSS_SITE_REQUEST_REJECTED` | **0 → 1** (guard ölçtü)   |
| `POST /trpc/registration.createTenant//` | 403 `TENANT_MEMBERSHIP_REQUIRED`  | ⚠⚠ **1 → 1 (DEĞİŞMEDİ)**  |

⇒ `//` varyantı yalnızca **üyelik** yüzünden öldü; **oran sınırı katmanı hiç
çalışmadı**. Saldırganın üyeliği **vardır**.

**Ne elde eder:**

1. `registration.checkSlugAvailability//` — **sınırsız** slug numaralandırması.
   ADR-0021 §3'e göre `taken` çıktısı **başka bir kiracının varlığını** bildirir;
   oran sınırı bu numaralandırmanın **tek** azaltımıydı (`rate-limit.policy.ts:285-302`).
2. `registration.createTenant//` — **sınırsız** kiracı oluşturma (kaynak tüketimi,
   slug ad uzayı squatting, provisioning kuyruğu doldurma).
3. `registration.onboardingChecklist//` — **sınırsız** üye-olunmayan-slug yoklaması
   (T-019 gate tur 1'in `medium` bulgusunun tam olarak kapattığı yüzey).

⇒ ADR-0021 §2 koşul E'nin kabul kriteri (**üç rotada oran sınırı**) karşılanmıyor.

### 3.7 Rota eşleşmesi nasıl ayırt edildi

Canlı ayırt edici: `HTTP_EXCEPTION` (Nest not-found — **rota eşleşmedi**) ↔
`TENANT_NOT_FOUND` (bizim domain hatamız — **rota eşleşti, guard koştu**).

| Yol                           | Kod                | Rota eşleşti mi |
| ----------------------------- | ------------------ | --------------- |
| `/trpc/platform.tenantList//` | `TENANT_NOT_FOUND` | ✅ EVET         |
| `/notaroute/x`                | `HTTP_EXCEPTION`   | ❌ HAYIR        |
| `//trpc/platform.tenantList`  | `HTTP_EXCEPTION`   | ❌ HAYIR        |
| `/trpc%2Fplatform.tenantList` | `HTTP_EXCEPTION`   | ❌ HAYIR        |

### 3.8 Önerilen düzeltme

1. **`normalize-request-path.ts:138-140`** — sondaki eğik çizgileri **tamamen** soy
   (kök `/` korunarak). `///` varyantı tRPC'de zaten `NOT_FOUND` olduğundan bu,
   fail-**closed** yönde fazladan eşleşme üretir; gevşetme değildir.
2. ⭐ **Asıl düzeltme — değişmezlik testi.** §3.1'deki değişmezliği
   `normalize-request-path.test.ts`'e bir özellik (property) testi olarak yaz:
   `appRouter`'ın **her** prosedürü × mutasyon jetonu kümesi. **Bu tek test, ÜÇ
   EKSENİN (yüzde-kodlama → tur 1, büyük/küçük harf → tur 2, eğik çizgi → tur 3)
   ÜÇÜNÜ DE yakalardı** ve dördüncüsünü de yakalar. Bugünkü 18 testin hiçbiri
   tekrarlanan eğik çizgiye bakmıyor (ölçüldü — dosyada tek bir "sondaki `/`" testi var).

---

## 4. ⚠ TUR 2'NİN BEŞ `low`'U — beşi de AÇIK, yan etki YOK

| Bulgu | Durum                     | Bu turdaki mekanik teyit                                                          |
| ----- | ------------------------- | --------------------------------------------------------------------------------- |
| F3    | AÇIK, değişmemiş          | `impersonation.service.ts:226` → `subject: [...tenantIds].sort().join(',')` aynen |
| F4    | AÇIK, canlı yeniden ölçüm | `arkesoft_app` → `platform_admin`: `DELETE INSERT SELECT UPDATE`                  |
| F5    | AÇIK, değişmemiş          | `:57` ve `:78`'deki iki needle birebir aynı                                       |
| F6    | AÇIK, değişmemiş          | `api-env.ts:69,96` → `z.url()`; `trusted-origins.ts:47-51` → ham `.origin`        |
| F7    | AÇIK, sayılar aynı        | `pnpm audit` yeniden koşturuldu: 0/1/3/1                                          |

⚠ FIX turu 3'ün yan etkisi **yok** — dokunduğu iki dosyanın (`normalize-request-path.ts`,
`rate-limit.policy.ts`) hiçbiri bu beş bulgunun dosyası değil.

⭐ **FIX 3'ün kendi yan etkisi (gözden geçirildi, bulgu DEĞİL):** `/trpc` mount katlaması
`TENANT_EXEMPT_PATHS`/`AUTH_EXEMPT_PATHS` için de geçerli ⇒ `/TRPC/storefront.currentTenant`
artık kimlikten muaf, `/TRPC/session.me` artık kiracıdan muaf. Bu **gevşetme değil
hizalamadır**: tRPC her iki yazımda da **aynı** prosedürü çalıştırıyor, muafiyetler de o
prosedürler için zaten verilmişti. Asimetriyi kapatmak doğru yön.

---

## 5. BU TURDA KOŞTURULAN / KOŞTURULMAYAN

- **Koşturuldu:** `pnpm audit` (1) · `npx vitest run` hedefli 4 dosya (**103 test yeşil**,
  Turbo önbelleği **devrede değil** — `npx vitest` doğrudan çağrıldı) · `curl` 41 istek
  (:3100) · `docker exec … redis-cli get/scan/ttl` salt-okuma · `docker exec … psql -tAc`
  salt-okuma (5) · `npx tsx`/`node` saf hesap (6) · `git diff`/`status`/`grep`/`lsof`/`ps`.
- ⚠ **Koşturulmadı:** `pnpm test` (tamamı), `test:isolation`, **`test:e2e` (YASAK)**,
  `guards`, `build`, `lint`, `typecheck` — bütçe ve yasak gereği.

### ⚠⚠ ORTAMDA BIRAKILAN İZ (tam döküm)

| Redis anahtarı                                 | Değer | TTL   | Not                                                            |
| ---------------------------------------------- | ----- | ----- | -------------------------------------------------------------- |
| `post-auth-sessions-revoke:ip:e3c1…`           | 4/20  | ~627s | Kanıt ölçümünün kaçınılmaz yan etkisi                          |
| `post-auth-sessions-revoke:account:39e0…`      | 4/5   | ~627s | ⚠ **sınıra yakın** — yalnızca MY fixture kullanıcısını etkiler |
| `post-trpc-registration-createtenant:ip:e3c1…` | 1/20  | ~683s | Kontrollü karşılaştırmanın kanonik yarısı                      |
| `post-trpc-registration-createtenant:account:` | 1/5   | ~683s | aynı                                                           |
| `post-auth-sign-in-email:ip:e3c1…`             | 1/20  | ~521s | ⭐ **TUR 2'DEN KALMA — bu turda DOKUNULMADI**                  |

⭐ **`EMAIL_IP_LIMIT` bütçesi (`request-password-reset` / `sign-up/email` /
`send-verification-email`) — BU TURDA SIFIR TÜKETİLDİ.** Bu üç uca tek bir istek
atılmadı; Redis'te ilgili anahtar **yok**. `qa` tur 2'nin bütçesi **el değmemiş**.

### Durum DEĞİŞTİRMEYENLER

- **Hiçbir DB yazması yok** — mevcut, süresi dolmamış bir fixture oturumu (`session`
  tablosundan okunup `BETTER_AUTH_SECRET` ile yeniden imzalandı) **yeniden kullanıldı**;
  `session` tablosuna **INSERT yok**. `BETTER_AUTH_SECRET` okundu, **hiçbir çıktıda
  yazdırılmadı** (bu raporda da yok).
- `revoke` probları 400 `VALIDATION_ERROR` ile öldü ⇒ **hiçbir oturum iptal edilmedi**.
- `createTenant` probları `SameOriginGuard`/`AuthGuard`'da öldü ⇒ **hiçbir kiracı
  oluşturulmadı**.
- Hiçbir kaynak dosya değiştirilmedi. Kök `.env` **okundu, yazılmadı**. API **yeniden
  başlatılmadı** (PID 43757 aynı). Port 3000/5173/5174'e **dokunulmadı**. Hiçbir konteyner
  durdurulmadı (25 konteyner ayakta). `docker context` **değiştirilmedi**.
  `git stash`/`checkout --`/`restore`/`add`/`commit` **yapılmadı**. Yazılan tek dosya
  **budur**. Yardımcı betikler `/tmp`'de (repo dışı).

### Ölçüm koşulları (AGENT_BASELINE §4, ders 2)

Makine yükü: **25 konteyner**, `load average 3.16 / 3.92 / 4.13`. Bu turun ölçümlerinin
**tamamı** gecikme değil **davranış/durum kodu/sayaç değeri** olduğu için yük duyarlı
değil; 35.840 varyantlık tarama tamamen saf hesap (I/O yok).

---

## 6. CLAUDE.md §7 — kiracı izolasyonu

18 maddenin tamamı tur 1 ve tur 2'de bu değişiklik için doğrulandı; FIX turu 3 yalnızca
iki saf yol fonksiyonuna dokundu ve **hiçbir tablo/sorgu/kuyruk/önbellek/S3/indeks
yüzeyini değiştirmedi** (`git diff` ile teyit edildi). **Karşılanmayan madde: YOK.**
Madde 4 (`publicProcedure` yasağı) ADR-0023 Karar 2 kapsamında **gerekçeli istisna**
olarak kalır — tur 1/tur 2 ile aynı.

⚠ **F8 §7'nin kapsamı DIŞINDA bir eksendir** — kiracı verisine çapraz erişim değil,
oran sınırı atlatma + varlık numaralandırması. Bu yüzden `critical` değil `high`.
