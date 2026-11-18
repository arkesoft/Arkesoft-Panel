# T-022 — GATE `security`, tur 1

Tarih: 2026-11-17 · ROADMAP sürümü: **v0.0.20.1** · Dal: `feat/v0.0.20-super-admin-iskeleti`

```
GATE: security
SONUÇ: PASS
BULGULAR:
  - [SEV: medium] .github/actions/run-gates/action.yml:63-94 — PUBLIC depoda ham test
    çıktısı artefaktı, redaksiyon YOK — redaksiyon filtresi + `retention-days: 1` +
    "sır tüketen job ham log yüklemesin" guard'ı — devops
  - [SEV: low] apps/api/src/http/normalize-request-path.ts:206-215 (+254-259) — §1.5
    `unparsable` kümesini DARALTTI; `matchesPrefixOrUnparsablePercentEncoding`'in
    tutucu `true` varsayılanı ölçülen bir girdi sınıfında `false`'a döndü —
    `'/'`'e çöken pathname'i `true` say VEYA JSDoc'u daraltılmış sözleşmeye güncelle — backend
ÖLÇÜMLER: pnpm audit = 1 high / 3 moderate / 1 low (taban ile AYNI, yeni bağımlılık yok) ·
  incelenen dosya: 31 · tenant izolasyon listesinden karşılanmayan madde: YOK (0/17) ·
  hedefli vitest: 3 dosya / 47 test yeşil · diferansiyel tarama: 8.377 + 138.915 kombinasyon
```

---

## 1. Mandat (i) — `normalize-request-path.ts`

### 1.1 §1.5 kanonikleştirme YÖNÜ — ⭐ DOĞRU UYGULANMIŞ (ölçüldü)

`:208-209` gerçekten **BİRLEŞTİRME** yapıyor, ikinci argüman **değil**:

```ts
const url = rawUrl.startsWith('/')
  ? new URL(CANONICALIZATION_ORIGIN + rawUrl)   // ✅ BİRLEŞTİRME
  : new URL(rawUrl, CANONICALIZATION_ORIGIN)
```

Canlı ölçüm (`node`):

| rawUrl                        | YENİ (birleştirme)            | ESKİ (relatif)       |
| ----------------------------- | ----------------------------- | -------------------- |
| `//evil.com/trpc/session.me`  | `//evil.com/trpc/session.me`  | `/trpc/session.me` ⚠ |
| `//x/trpc/session.me`         | `//x/trpc/session.me`         | `/trpc/session.me` ⚠ |
| `//evil.example`              | `//evil.example`              | `/` ⚠               |
| `/trpc/a/../platform.tenantList` | `/trpc/platform.tenantList` | `/trpc/platform.tenantList` ✅ |

⇒ authority yorumu **yapısal olarak kapandı**, WHATWG dot-segment çözümü **korundu**.
`architect`'in R-A1'i (ters uygulanırsa guard bypass) **gerçekleşmedi**.

**NO-OP değişmezi mekanik olarak doğrulandı:** 8.377 girdilik NEW-vs-OLD taramada
`//` ile **başlamayan** girdiler arasında **tek bir** fark bulundu (`/\\`) — bkz. §1.3.

### 1.2 §1.4 fail-open iddiası — ⚠⚠ HANDOFF'UN HİPOTEZİ ÇÜRÜTÜLDÜ

Handoff *"`true` = önek eşleşti = **muafiyet**"* diyordu. **Çağrı zinciri okundu:**

```ts
// platform-admin-ip.guard.ts:90-92
if (!isPlatformAdminGuardedPath(req.url)) {
  return true           // ← guard'ı ATLAYAN dal, `false` DÖNDÜĞÜNDE çalışır
}
// ...üç fail-closed dal (empty_allowlist / unknown_ip / ip_not_allowed)
```

⇒ `matchesPrefixOrUnparsablePercentEncoding` **`true`** dönerse yol **KAPSAMDA**
sayılır ve IP allowlist **ZORLANIR**. `true` = **fail-CLOSED**, muafiyet **değil**.
`:176` (ham `rawUrl`'e düşme) de fail-closed: ham/bozuk yol hiçbir tam-eşleşme
literaliyle eşleşmez. **İki çağrı noktası da doğru yönde — bulgu YOK.**

### 1.3 Dördüncü/beşinci eksen araması — ÖLÇÜLDÜ

Değişmez testinin (`normalize-request-path-trpc-invariant.test.ts:216-222`) jeton
kümesi: mount öneki (`''`/`'/'`/`'//'`) × harf varyantı × nokta kodlaması (`.`/`%2E`/`%2e`)
× sondaki eğik çizgi (0-3). **Kapsamadığı eksenler** için bağımsız diferansiyel tarama
yazıldı (üretim modeli ↔ bağımsız tRPC+Express modeli, `foldTrpcMountPrefix`
**çağrılmadan**):

- eksen kümesi: `\` · `/\` · `..` · `/../` · `%2e%2e` · `%2E%2E` · `/..%2f` · `%00` ·
  `%2500` · `%c0%af` · `;x` · `//.` · `/./` · Unicode (`İ`, `．` U+FF0E, U+00AD) · `%u002e` · boş segment
- **138.915 kombinasyon → 0 ihlal.**

⇒ `tRPCçözer(P) ≠ null ⇒ normalizeRequestPath(P) === '/trpc/' + tRPCçözer(P)`
değişmezi bu eksenlerde de tutuyor. **Dördüncü eksen BULUNAMADI.**

### 1.4 ⚠ BULGU F2 (`low`) — `unparsable` kümesinin daralması

8.377 girdilik taramanın bulduğu **tek** fark ve `//` ailesinin tamamı aynı sınıf:

| rawUrl | ESKİ `resolveCanonical…` | ESKİ `matchesPrefix…` | YENİ `resolveCanonical…` | YENİ `matchesPrefix…` |
| ------ | ------------------------ | --------------------- | ------------------------ | --------------------- |
| `//`   | **THROW** → `unparsable` | **`true`** (kapsamda) | `'//'` → strip → `'/'`  | **`false`** ⚠         |
| `/\\`  | **THROW** → `unparsable` | **`true`** (kapsamda) | `'///'` → strip → `'/'` | **`false`** ⚠         |

`:244-251`'in JSDoc'u hâlâ *"AYNI TUTUCU varsayılan `rawUrl` HİÇ AYRIŞTIRILAMADIĞINDA
da UYGULANIR"* diyor — bu iddia artık koddan **daha geniş**. §1.5 `unparsable` üreten
girdi kümesini küçülttüğü için tutucu varsayılan daha az girdiyi kapsıyor ve kapsam
dışına çıkan girdiler **guard'sız** tarafa düşüyor.

**Sömürülebilir DEĞİL (ölçüldü):** `path-to-regexp@8.4.2`'nin `match('/trpc/*path')`'i
`parseurl` çıktısı üzerinde `//…` ve `/\\…` için `false` dönüyor ⇒ `TrpcController`
ve dolayısıyla `PlatformAdminIpGuard` **hiç koşmuyor**. Canlı kanıt: `//trpc/session.me`,
`/\\x/trpc/session.me` → **404**. `architect`'in `:196` için verdiği *"derinlemesine
savunma, canlı defekt DEĞİL"* sınıfının aynısı ⇒ **`low`**.

⚠ `matchesPrefixOrUnparsablePercentEncoding` daha geniş bir rotaya bağlı **ikinci bir
tüketici** kazanırsa bu bulgu **`high`** olur.

### 1.5 `normalizeRequestPath` tarafı fail-CLOSED (doğrulandı)

`'/'` **hiçbir** muafiyet kümesinde yok (`tenant-exempt-paths.ts:192+`,
`auth-exempt-paths.ts:84+` okundu) ⇒ `//` → `'/'` → muaf **değil**.
Hedefli vitest koşumunun logu bunu bağımsız doğruladı: `GET //` isteğinde
`tenant çözümü başarısız / reason: no_row` üretildi (yani kiracı çözümü **KOŞTU**,
atlanmadı), ardından 404.

### 1.6 ⚠ Canlı prob uyarısı — ÖLÇÜMÜN KOŞULLARI

`http://localhost:3100` üzerinde ham soket probu koşturuldu. **`GET //` → 500**
(`INTERNAL_ERROR` + temiz JSON tel sözleşmesi) gözlendi. ⚠ Bu **düzeltmenin
başarısızlığı DEĞİL**: `/health` `uptimeSeconds` = 16584 ⇒ süreç **12:53**'te başlamış,
düzeltilmiş `dist` ise **16:02:25**'te üretilmiş ⇒ **koşan ikili BAYAT**. Yani bu prob
defektin **fix ÖNCESİ gerçekliğini** teyit eder (A-A22-1 / S2 adım ② doğrulandı),
fix sonrası davranış hakkında kanıt **değildir**. Fix sonrası kanıt hedefli vitest
koşumudur (§3).

---

## 2. Mandat (ii) — TOTP sırrının yaşam döngüsü

Hepsi **ölçüldü**, hiçbirinde bulgu yok:

| Soru | Ölçüm | Sonuç |
| --- | --- | --- |
| Sır `sessionStorage`/`localStorage`/çerez/URL'ye yazılıyor mu? | `grep -rniE "sessionStorage\|localStorage\|document\.cookie\|history\.(push\|replace)State\|window\.location\|searchParams"` iki `features/two-factor` ağacında | **HAYIR.** Tek eşleşme `TwoFactorSetupWizard.tsx:312`/`:286`'nın `url.searchParams.get('secret')`'i — `otpauth://` URI'sini **ayrıştırıp ekranda gösterme**; kalıcılık yok |
| Loglanıyor mu? | aynı ağaçlarda `console.`/`logger` grep'i | **0 eşleşme.** `two-factor-rest.ts:10-11` yasağı kodda da tutuyor |
| `backupCodesCapturedForDisplay` ne kadar tutuyor? | `two-factor-setup-controller.ts:94,186` | **Yalnızca RAM**, controller örneği ömrü (= mount). Reload ⇒ yeni örnek ⇒ **boş**. Kodlar zaten aynı mount'ta DOM'a basılmıştı ⇒ **yeni yüzey yok**. Kontrol akışına dokunmuyor (`:155` yalnızca gösterim) |
| `get-totp-uri` **şifre doğrulaması** istiyor mu? | `better-auth@1.7.14` `plugins/two-factor/totp/index.mjs:106-108` + `utils/password.mjs` `shouldRequirePassword` + `auth-instance.ts:754-760` | ⭐ **EVET.** `shouldRequirePassword(ctx,id,allowPasswordless)` → `if (!allowPasswordless) return true`; `allowPasswordless` bizde **AYARLANMAMIŞ** ⇒ `checkPassword` **her zaman** koşar, yanlış şifre `INVALID_PASSWORD` fırlatır. `enable` ile **eşdeğer** yetkilendirme — ⚠ oturumu çalınan kullanıcı sırrı **okuyamaz** |
| `TOTP_NOT_ENABLED` dışı bir hata `enable`'a düşüyor mu? | `two-factor-setup-controller.ts:130` (iki kopyada da birebir) | **HAYIR** — tek koşul `error.kind === 'known' && error.code === 'TOTP_NOT_ENABLED'`. `INVALID_PASSWORD` → `show-error` ⇒ yanlış şifre sırrı **yeniden üretmez** |
| `enable` ve `get-totp-uri` **aynı kovada mı**? | `rate-limit.policy.ts:216-239` + `rate-limit.service.ts:122-127` | **HAYIR, AYRI kova.** Redis anahtarı `sanitizeRouteKeySegment(routeKey)` içeriyor ⇒ rota başına sayaç. İkisi de `login` penceresi, 5/hesap + 20/IP, `sessionUserId` kapsamı ⇒ taze kurulum 2 **farklı** kovadan 1'er birim yer, bütçe **tükenmiyor** |
| Numaralandırma aracı mı? | `getTOTPURI` `TOTP_NOT_ENABLED`'ı şifre kontrolünden **önce** fırlatıyor | Sinyal `sessionMiddleware` ile **kendi** kullanıcısına bağlı ⇒ çapraz kullanıcı/kiracı numaralandırması **yok**. Bulgu değil |

Dış veri Zod ile parse ediliyor: `two-factor-rest.ts:61-64,93` (`enableTwoFactorBodySchema`,
`getTotpUriBodySchema`), `normalize-panel-error.ts:43-55` (beş `safeParse` zarfı),
`two-factor-get-totp-uri-contract.test.ts:67-68`.

---

## 3. Fix sonrası mekanik kanıt

```
cd apps/api && npx vitest run src/__tests__/normalize-request-path
 Test Files  3 passed (3)
      Tests  47 passed (47)
   Duration  1.83s
```

(`normalize-request-path.test.ts` · `-trpc-invariant.test.ts` · `-double-slash-http.test.ts`)
⚠ `pnpm test` / `test:isolation` / Playwright **koşturulmadı** (handoff yasağı: paylaşılan
ortam + `qa`'nın oran-sınırı bütçesi).

---

## 4. ⚠⚠ BULGU F1 (`medium`) — PUBLIC depoda ham test çıktısı artefaktı

**Depo gerçekten PUBLIC (ölçüldü):**
`gh repo view --json visibility,isPrivate` → `{"isPrivate":false,"nameWithOwner":"arkesoft/Arkesoft-Panel","visibility":"PUBLIC"}`
⇒ iş akışı koşumunun artefaktları **anonim** kullanıcılar dahil herkes tarafından
indirilebilir, `retention-days: 7` boyunca.

**Saldırı senaryosu (kim, neyle, ne elde eder):** depoyu izleyen herhangi bir internet
kullanıcısı, `api` job'u kırmızıya döndüğünde koşum özetinden `test-output-api` /
`isolation-output-api` artefaktını indirir ve **redakte edilmemiş** vitest çıktısını
okur. Çıktı, **tasarımı gereği** şu assertion'ların "beklenen/gerçek" değerlerini basar:

| Dosya:satır | Başarısızlıkta basılan değer |
| --- | --- |
| `apps/api/src/__tests__/two-factor-plugin-live.test.ts:460` | `expect(fullLogText).not.toContain(totpURI)` ⇒ **ham `otpauth://…?secret=…`** |
| `apps/api/src/__tests__/two-factor-acceptance-ac4-secret-redaction-vacuity.test.ts:186` | aynı şekil ⇒ **TOTP sırrı** |
| `apps/api/src/__tests__/auth-secret-leak.test.ts:201` | `not.toContain(BASE_ENV.BETTER_AUTH_SECRET)` ⇒ **auth sırrı** |
| `apps/api/src/__tests__/log-correlation.test.ts:237,238,280` | oturum çerezi / `Authorization` değeri |
| `apps/api/src/__tests__/audit-log-write-gate.test.ts:324-325` | parola + e-posta fixture'ı |
| 15 dosyada `throw new Error(\`beklenmeyen Set-Cookie biçimi: ${setCookieHeader}\`)` | **tam `Set-Cookie` başlığı** |
| `apps/{admin,superadmin}/e2e/two-factor-setup-reload.spec.ts:61,106` | **ham base32 TOTP sırrı** (Playwright raporu, `ci.yml:1446` zaten yüklüyor) |

**⭐ ŞİDDETİ `critical`'a ÇIKARMAYAN ÖLÇÜM (dürüst ayrım):**

- `grep "secrets\." .github/workflows/*.yml .github/actions/*/action.yml` → **tek eşleşme**
  `release.yml:82`'nin `GITHUB_TOKEN`'ı. `api`/`shared` job'ları **sıfır** GitHub sırrı tüketiyor.
- `DATABASE_URL` (`ci.yml:791`) ve `POSTGRES_PASSWORD` (`:880,:1173`) = `arkesoft_dev_only`,
  **`.env.example` ile birebir aynı, zaten kamuya açık** dev-only değerler.
- Basılan tüm kimlik materyali, koşumla birlikte **yok olan** bir Postgres service
  container'ındaki **tek kullanımlık** test kullanıcılarına ait; e-postalar `@arkesoft.test`.

⇒ **Bugün kullanılabilir, kalıcı bir kimlik bilgisi sızmıyor** ⇒ somut senaryo kurulamıyor
⇒ `critical` **DEĞİL**. Ama kanal **redaksiyonsuz ve guard'sız**: `v0.0.20.3`'ün axe'ı,
bir Sentry DSN'i veya bir R2 anahtarı herhangi bir job'a girdiği **gün** bu kanal kalıcı
sır sızdırmaya başlar ve **hiçbir mekanik kapı bunu yakalamaz**.

**Önerilen düzeltme (`devops`):** `tee`'den **önce** redaksiyon süzgeci
(`sed -E 's/secret=[A-Z2-7]{16,}/secret=<redacted>/g; s/(Set-Cookie:).*/\1 <redacted>/I'`),
`retention-days: 7 → 1`, ve `scripts/guards.sh`'e mekanik kural: *"`secrets.` tüketen bir
job ham log artefaktı yükleyemez"*. ⚠ `set -o pipefail` redaksiyon eklendikten **sonra**
da korunmalı (süzgeç pipeline'a üçüncü halka ekler).

---

## 5. Kontrol listesi

| # | Madde | Sonuç |
| --- | --- | --- |
| 1 | Tenant izolasyon listesinin 17 maddesi | ⭐ **0 karşılanmayan.** Sıfır şema/tablo/sorgu/kuyruk/önbellek/S3 değişikliği (`db` düğümü açılmadı). Listeyle **ilgilenen tek mekanizma** muafiyet yolu normalizasyonu — §1.5'te fail-closed ölçüldü |
| 2 | Girdiden gelen id'lerde sahiplik (IDOR) | Yeni id girdisi yok; `get-totp-uri` `sessionMiddleware` ile **oturum kullanıcısına** bağlı (`totp/index.mjs:93`) |
| 3 | Yetkisiz ve var olmayan aynı cevabı dönüyor | `//`/`/\\` ailesi tek tip **404**, iç ayrım sızmıyor (ham soket probu) |
| 4 | Yetki kontrolü atlatılamıyor | `get-totp-uri` şifre doğrulaması **zorunlu** (ölçüldü); `PlatformAdminIpGuard` üç fail-closed dalı korunuyor |
| 5 | Her dış veri Zod ile parse | ✅ (§2 sonu) |
| 6 | Enjeksiyon yüzeyi (SQL/komut/yol/XSS/açık yönlendirme) | Ham SQL yok; yeni metin `MESSAGES` kataloğundan JSX ile basılıyor (`dangerouslySetInnerHTML` yok); **açık yönlendirme ekseni bu Task'ın ASIL konusu** ve §1.1'de kapatılmış |
| 7 | Sır loglanmıyor/saklanmıyor/repoya girmemiş | `git diff HEAD \| grep -niE "(password\|secret\|api[_-]?key\|token\|BEGIN .*PRIVATE KEY)"` → eklenen satırlarda **yalnızca** test fixture'ı (`'sifre-123'`, `'yanlis-sifre'`) ve hata **kodu** literalleri; gerçek sır **yok** |
| 8 | Ödeme: imza + replay + idempotency | **Kapsam dışı** — ödeme yolu bu sürümde yok |
| 9 | Kart verisi saklanmıyor/loglanmıyor | **Kapsam dışı** |
| 10 | Oran sınırlama kötüye kullanılabilir uçlarda | ✅ `enable`/`get-totp-uri`/`verify-totp` üçü de politikalı, **ayrı** kovalarda |
| 11 | SSRF ve dosya yükleme | **Kapsam dışı** — kullanıcı URL'sine istek atan yeni kod yok |
| 12 | `pnpm audit` | 1 high / 3 moderate / 1 low — **taban ile BİREBİR aynı** (`T-022.md:166`'daki F7 kaydı). `package.json` tek satır (`--continue`), `pnpm-lock.yaml` **DEĞİŞMEMİŞ** ⇒ yeni/geçişli bağımlılık **yok** |
| 13 | KVKK — gereksiz veri toplama | Yeni kişisel veri alanı yok; yeni metin PII içermiyor |
| 14 | Süper admin işlemleri denetim kaydı | Yeni süper admin işlemi **yok** (denetim izi maddesi **v0.0.20.2**'ye ayrıldı) |

**`packages/trpc` teyidi:** `git status --short packages/trpc` → **boş** ⇒ public API
sözleşmesi dokunulmamış (S4 DoD'si karşılandı).

---

## 6. BULGU OLMAYAN üç kalem (handoff gereği, tekrar açılmasın)

1. İki kontrolcü kopyası — ADR-0024 Karar 6, bilinçli; borç `ROADMAP:3406` (`medium`).
2. **A-PO22-4** — composite içinde `if: failure()` + `upload-artifact` gerçek CI'da
   doğrulanmadı; iş akışı tetiklemek **yasaktı** ⇒ `DOĞRULANAMADI` olarak kalır.
3. İki izlenen flake — kullanıcı *"araştırma YOK"* dedi; bu gate hiçbir ham çıktı **kesmedi**.

**Ek (yeni borç değil, `architect` R-A7'nin teyidi):** `trpc.controller.ts:114` ve
`auth.controller.ts:57` hâlâ **relatif** `new URL(req.url, baseUrl)` kullanıyor; bugün
Express `//…`'yi onlara **yönlendirmediği** için erişilemez. Rota katmanı değişirse
(strict routing, mount değişimi, önde yeniden yazan bir ters vekil) iki katman **yeniden
ayrışır**. `architect` bunu **zaten borç olarak kaydetti**.

---

## 7. Sonuç

**PASS** — `critical` 0, `high` 0, `medium` 1, `low` 1.
AGENT_BASELINE §4 tablosu: *1–2 `medium` → PASS, bulgular teknik borca kaydedilir.*
`low` için düzeltme turu **açılmaz** (§4, 2026-11-01 kuralı); F2'nin borç satırı §1.4'te
hazır. **F1 için düzeltme turu zorunlu değil** ama borç tablosuna `medium` olarak
girmeli — ⚠ vadesi, bir job'a ilk gerçek `secrets.*` girdiği sürümden **önce** olmalı.
