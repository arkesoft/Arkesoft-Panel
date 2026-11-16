# T-021 — GATE: `security` — TUR 4

- **Tarih:** 2026-11-16
- **Sürüm:** ROADMAP v0.0.20 (süper admin iskeleti)
- **Dal:** `feat/v0.0.21-surum-kayit-modeli`
- **Kapsam:** ⭐ **DAR** — yalnızca kendi tur 3 `high`'ının (F8) kapanışı + FIX 4'ün
  değişmezlik testinin sağlamlığı + tur 3'ün beş `low`'unun durumu. Yeni genel tarama
  **yapılmadı** (tur 3'te temiz çıkan eksenler tekrar taranmadı).
- **Önceki raporlar:** `docs/gates/T-021-security-tur1.md` · `-tur2.md` · `-tur3.md`

```
GATE: security
SONUÇ: PASS
BULGULAR:
  - [SEV: medium] apps/api/src/http/normalize-request-path.ts:176,196 + apps/api/src/tenancy/tenant-context.middleware.ts:40 — ⚠ ÖN-VAROLAN (FIX 4 GETİRMEDİ, ama FIX 4'ün "sınıfı kapatan" değişmezi de KAPATMIYOR). `normalizeRequestPath` ilk işi olarak `new URL(rawUrl, 'http://…invalid')` çağırır; `req.url` `//`, `///`, `////` veya `//%2F` ise bu çağrı `TypeError: Invalid URL` FIRLATIR (boş authority). Çağıran `isTenantExemptPath`, `tenant-context.middleware.ts:40`'ta — GLOBAL middleware'in İLK satırında, `try`/`catch` DIŞINDA — çağrılıyor; middleware guard'lardan ve rota eşleşmesinden ÖNCE koşar. SALDIRI: kimliksiz, kiracısız, oturumsuz herhangi bir istemci ham soketten `GET // HTTP/1.1` göndererek her istekte bir 500 + `app-exception.filter.ts:67`'de bir `error` seviyeli log kaydı üretir. `RateLimitGuard` bu noktaya HİÇ ULAŞMAZ (guard, middleware'den sonra koşar) ⇒ üretim SINIRSIZDIR: log depolama maliyeti, `error` seviyeli alarm gürültüsü/alarm körelmesi. CANLI ÖLÇÜLDÜ (:3100): `//`→500, `///`→500, `////`→500, `//%2F`→500; kontrol `/notaroute/x`→404 `HTTP_EXCEPTION`, `//x`→404 (çünkü `//x` host=`x` olarak AYRIŞIR, fırlatmaz). Veri sızıntısı veya yetki atlatma YOK (istek fail-closed ölür) — bu yüzden `high` değil `medium`. — Düzeltme: `normalizeRequestPath` ve `matchesPrefixOrUnparsablePercentEncoding`, `new URL` çağrısını `decodePathnameSafely`'nin ZATEN uyguladığı dokümante fail-closed desene alsın (ayrıştırılamayan url → ham `rawUrl`'ün `?`/`#` öncesi kısmı, ÖNEK yardımcısında `true`); değişmezlik testine "FIRLATMAYAN toplam fonksiyon" iddiası eklensin. — backend · vade: v0.0.20.1
  - [SEV: low] apps/api/src/__tests__/normalize-request-path-trpc-invariant.test.ts:79-84,153 — Envanter YALNIZCA `appRouter._def.procedures`'tan okunuyor; `@trpc/server@11.19.0`'ın GERÇEK çözücüsü (`router.ts:377-391`) bunu bulamazsa AYRICA `_def.lazy` üzerinden de çözer. Bugün `_def.lazy` BOŞ (ölçüldü: `[]`), yani test bugün TAM kapsıyor. Ama ileride bir lazy router eklenirse o prosedürler `knownProcedurePaths`'e GİRMEZ ⇒ model `null` döner ⇒ assertion o yollar için SESSİZCE atlanır (vacuous olur) ve `resolvedCandidateCount > 0` kontrolü bunu YAKALAMAZ. — Düzeltme: `readRouterProcedurePaths()` `_def.lazy`'yi de okusun, VEYA `expect(Object.keys(appRouter._def.lazy)).toEqual([])` ile bu varsayımı GÜRÜLTÜLÜ pinleyen bir iddia eklensin. — backend · vade: v0.0.20.1
  - [SEV: low] apps/api/src/__tests__/normalize-request-path-trpc-invariant.test.ts:91,107-120 — Değişmez YALNIZCA `/trpc` mount'unu modelliyor; aynı `normalizeRequestPath`'i tüketen `/auth` yüzeyi (`isAuthDelegatedPath`, `isAuthOwnPath`, `isAuthExemptPath`) için EŞDEĞER bir değişmez YOK. ⚠ FIX 4 bu yüzeyin DAVRANIŞINI DEĞİŞTİRDİ: `POST /auth/sign-in/email//` ESKİDEN `AuthController.delegate`'in fail-closed allowlist'inde 404 ile ölüyordu, ARTIK Better Auth'a DELEGE EDİLİYOR (ölçüldü: `isAuthDelegatedPath('POST','/auth/sign-in/email//')` → `true`). ⭐ GÜVENLİK ETKİSİ ÖLÇÜLDÜ VE NÖTR: aynı dört arity'nin DÖRDÜ DE doğru oran sınırı politikasını alıyor (`POST /auth/sign-in/email` → `login`, 5/20; `request-password-reset`/`sign-up/email`/`send-verification-email` → `reset`, 3/10) ⇒ "erişilebilir AMA sınırsız" bileşimi HİÇBİR durumda oluşmuyor. Bulgu, davranış değişikliğinin TESTSİZ olmasıdır. — Düzeltme: `/auth` için eşdeğer bir değişmez (Better Auth'un KENDİ router eşleştirmesi modellenerek) veya en azından dört arity × delege yüzeyi tablosu testi. — backend · vade: v0.0.20.1
  - [SEV: low] apps/api/src/platform/impersonation.service.ts:226 + packages/trpc/src/schemas/platform.schema.ts:168 — TUR 1 F3 / TUR 2 / TUR 3 AYNEN AÇIK (bu turda yeniden okundu, `subject: [...tenantIds].sort().join(',')` birebir aynı): "kiracı kimlik listesi TELE ÇIKMAZ" kararı `subject` alanı üzerinden fiilen baypas ediliyor. — backend + docs · vade: v0.15.0
  - [SEV: low] apps/api/src/prisma/prisma.service.ts:119-139 + canlı katalog — TUR 1 F4 / TUR 2 / TUR 3 AYNEN AÇIK (bu turda CANLI YENİDEN ÖLÇÜLDÜ, `arkesoft-postgres`: `arkesoft_app` → `platform_admin` VE `platform_audit_log` üzerinde `DELETE INSERT SELECT UPDATE`). Platform yetkisi = satırın VARLIĞI ⇒ yetki yükseltme ekseni. — db + devops · vade: v0.0.20.1
  - [SEV: low] apps/api/src/__tests__/platform-impersonation-write-gate.test.ts:57,85 — TUR 1 F5 / TUR 2 / TUR 3 AYNEN AÇIK (needle'lar birebir aynı; tur 3'ün yazdığı `:78` satır numarası bu turda `:85` olarak DÜZELTİLDİ — içerik değişmedi). KAPI B hâlâ yalnızca AÇIK `@Inject(...)` dekoratörünü görüyor. — backend · vade: v0.0.20.1
  - [SEV: low] apps/api/src/config/api-env.ts:69,96 + apps/api/src/auth/trusted-origins.ts:47-51 — TUR 1 F6 / TUR 2 / TUR 3 AYNEN AÇIK (üç satır da değişmemiş): `z.url()` özel-olmayan şema kabul eder, `.origin` literal `"null"` olabilir ⇒ `Origin: null` taşıyan istekler `SameOriginGuard`'ı geçebilir. — backend · vade: v0.0.20.1
  - [SEV: low] pnpm-lock.yaml (DEĞİŞMEMİŞ) — TUR 1 F7 / TUR 2 / TUR 3 AYNEN AÇIK, sayılar BİREBİR AYNI: `pnpm audit` → 0 critical / 1 high (`multer`) / 3 moderate / 1 low (`astro`). FIX turu 4 HİÇBİR bağımlılık eklemedi (`pnpm-lock.yaml` FIX 4'ün dosya ayak izinde YOK — ölçüldü). — devops · vade: v0.0.20.1
ÖLÇÜMLER: pnpm audit → 0 critical / 1 high / 3 moderate / 1 low (tur1+2+3 ile BİREBİR aynı; yeni paket 0) · incelenen dosya: 16 (6 tam okuma + 10 hedefli grep/sed; FIX 4'ün dosya ayak izi ÖLÇÜLDÜ = TAM 2 kaynak dosya) + 4 bağımlılık kaynağı (`@trpc/server` `fetchRequestHandler.ts`, `resolveResponse.ts`, `router.ts`, `create-trpc-request-handler.ts`) · CLAUDE.md §7 18 maddeden KARŞILANMAYAN: YOK (madde 4 GEREKÇELİ İSTİSNA, ADR-0023 Karar 2 — tur1/2/3 ile aynı); FIX 4 hiçbir tablo/sorgu/kuyruk/önbellek/S3/indeks yüzeyine DOKUNMADI · MUTASYON DENEYİ: 3 mutant × 816 aday, 3'ü de KIRMIZI (bağımsız olarak, `/tmp` kopyası üzerinde — repo dosyası DEĞİŞTİRİLMEDİ) · SADAKAT DENEYİ: 816 aday GERÇEK pinli `@trpc/server@11.19.0` handler'ına karşı koşuldu → 0 yanlış-null, 0 yanlış-pozitif, 0 ad uyuşmazlığı · ADR-0021 §2 koşul E: 72/72 varyant oran sınırı kapsamında · FAIL-OPEN REGRESYON TARAMASI: 221 (yol × sonek) → ÖNEK tüketicisinde 0 fail-open · hedefli vitest: 6 dosya / 129 test YEŞİL (Turbo önbelleği DEVREDE DEĞİL — `npx vitest` doğrudan) · canlı HTTP: 16 istek (:3100) · canlı psql: 1 salt-okuma · canlı Redis: 5 salt-okuma taraması · ⭐ `EMAIL_IP_LIMIT` bütçesi: 0 tüketildi (dördüncü tur üst üste) · ölçüm koşulları: 25 konteyner, load avg 6.17/5.40/5.77
```

---

## 0. ÖZET — bu turun beş sorusu

| Soru                                                                | Cevap                                                                        |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| ⚠⚠ Değişmez testi **gizli totolojik** mi?                           | ✅ **HAYIR** — 816 adayda gerçek handler'a karşı ölçüldü (§2)                |
| Üç geri alma (mutasyon) **gerçekten** kırmızı mı?                   | ✅ **EVET** — üçünü de **ben** koşturdum, devralmadım (§3)                   |
| Prosedür listesi gerçekten dinamik / 17 mi?                         | ✅ **EVET** — 17, `_def.procedures`'tan; ⚠ `_def.lazy` kör noktası (§2.4)    |
| 816'ya daraltma kabul edilebilir mi?                                | ✅ **EVET** (§4) — ama iki kapsam kaybı `low` olarak yazıldı                 |
| Over-inclusive yön gerçekten güvenli mi / tur 3 §3.8 atfı doğru mu? | ✅ **EVET** — yedi tüketicinin **tamamı** için ayrı ayrı doğrulandı (§5)     |
| `backend`'in `DOĞRULANAMADI`'sını ben kapatabilir miyim?            | ❌ **HAYIR** — gerekçe ÖLÇÜLDÜ, aşağıda (§6). **DOĞRULANAMADI** olarak kalır |

⇒ **SONUÇ: PASS.** `critical` 0 · `high` 0 · `medium` 1 · `low` 7.
**Tur 3'ün `high`'ı (F8) KAPANDI** — kapanış ölçümle kanıtlandı, iddiaya dayanılmadı.

---

## 1. İŞ ② — düzeltmenin kendisi

`apps/api/src/http/normalize-request-path.ts:104-111`:

```ts
function stripTrailingSlashes(path: string): string {
  if (path.length <= 1) return path
  const stripped = path.replace(/\/+$/, '')
  return stripped.length === 0 ? '/' : stripped
}
```

- ✅ Sondaki eğik çizgiler **tek tek değil tamamen** soyuluyor.
- ✅ Kök `/` korunuyor (`path.length <= 1` erken dönüşü **ve** `stripped.length === 0`
  yedeği — iki katmanlı).
- ✅ **İki tüketici de** aynı fonksiyonu çağırıyor (`:179` ve `:206`); kopya yazılmamış.
- ✅ `decodePathnameSafely` → `foldTrpcMountPrefix` → `stripTrailingSlashes` sırası
  korunmuş; tRPC'nin kendi sırasıyla (decode → trim) uyumlu.

**Kabul kriteri (ADR-0021 §2 koşul E) — doğrudan ölçüldü.** Üç kayıt rotasının
3 mount × 2 nokta kodlaması × 4 eğik çizgi arity'si = **72 varyantının tamamı** artık bir
oran sınırı politikası alıyor (`undefined` dönen **sıfır** varyant). Tur 3'teki ihlal
(`POST /trpc/registration.createTenant//` → `undefined`) **ortadan kalktı**.

---

## 2. ⚠⚠ İŞ ① — DEĞİŞMEZ GERÇEKTEN TOTOLOJİK DEĞİL

### 2.1 Statik denetim: üretim fonksiyonları test içinde çağrılıyor mu?

Test dosyasının **tek** üretim importu `normalizeRequestPath`'tir (`:55`).
`decodePathnameSafely`, `foldTrpcMountPrefix`, `stripTrailingSlashes` zaten
**export edilmiyor** — yapısal olarak çağrılamazlar. `matchesPrefixOrUnparsable
PercentEncoding` import **edilmemiş**. ⇒ Test, denetlediği fonksiyonun **iç
mantığını** kullanmıyor. ✅

### 2.2 `trimSlashesOnce` sadık mı? — kaynak karşılaştırması

`node_modules/.pnpm/@trpc+server@11.19.0_typescript@6.0.3/.../fetchRequestHandler.ts:17-22`:

```ts
const trimSlashes = (path: string): string => {
  path = path.startsWith('/') ? path.slice(1) : path
  path = path.endsWith('/') ? path.slice(0, -1) : path
  return path
}
```

Test `:95-98`: **semantik olarak birebir** (aynı iki koşul, aynı sıra, aynı dilimler).

Kesme sırası, `fetchRequestHandler.ts:37-39`:

| Gerçek kaynak                                   | Test `:141-144`                                     |
| ----------------------------------------------- | --------------------------------------------------- |
| `const pathname = trimSlashes(url.pathname)`    | `const trimmedPathname = trimSlashesOnce(pathname)` |
| `const endpoint = trimSlashes(opts.endpoint)`   | `const trimmedEndpoint = trimSlashesOnce(…)`        |
| `const path = trimSlashes(pathname.slice(len))` | `trimSlashesOnce(trimmedPathname.slice(len))`       |

Decode konumu: `resolveResponse.ts:241` → `path: decodeURIComponent(opts.path)` —
yani **kesmeden SONRA**. Test `:148` de **kesmeden sonra** decode ediyor. ✅

Endpoint değeri: `create-trpc-request-handler.ts:100` → `endpoint: '/trpc'`.
Test `:91` → `TRPC_ENDPOINT = '/trpc'`. ✅

Prosedür araması: `router.ts:375` → `_def.procedures[path]`.
Test `:153` → `knownProcedurePaths.has(decodedPath)`. ✅

### 2.3 ⭐⭐ Statik okuma YETMEZ — modeli GERÇEK handler'a karşı koşturdum

Yorumun "birebir kopyaladım" demesi bir **iddiadır**. Bağımsız ölçüm:
testin jeton kümesinden üretilen **816 adayın tamamı**, `@trpc/server@11.19.0`'ın
**gerçek** `fetchRequestHandler`'ına (aynı `endpoint`, aynı `appRouter`,
`allowBatching: false`) verildi; tRPC'nin **kendi** çözdüğü prosedür adı `onError`
kancasının `path` alanından okundu. Sorgular `GET`, mutasyonlar `POST` ile gönderildi
(aksi halde tRPC tip uyuşmazlığından `NOT_FOUND` üretir ve ölçüm bozulurdu).

```
TOPLAM ADAY       = 816
MODEL "çözüldü"   = 612
GERÇEK "çözüldü"  = 612
[sondaki / sayısı | tRPC hata kodu] dağılımı:
    0|INTERNAL_SERVER_ERROR = 204      ← prosedür BULUNDU ve çalıştı
    1|INTERNAL_SERVER_ERROR = 204      ← prosedür BULUNDU ve çalıştı
    2|INTERNAL_SERVER_ERROR = 204      ← ⚠ F8'in EKSENİ — prosedür BULUNDU
    3|NOT_FOUND             = 204      ← prosedür YOK
YANLIŞ NULL (model null, GERÇEK prosedür çalıştı) = 0
YANLIŞ POZİTİF (model çözdü, GERÇEK NOT_FOUND)    = 0
AD UYUŞMAZLIĞI (model adı ≠ tRPC'nin path'i)      = 0
```

⭐ **"Yanlış null = 0" bu turun en önemli sayısıdır.** Gizli totolojinin tek gerçekçi
biçimi şudur: model, gerçekte **çalışan** bir yol için `null` döner, `continue` ile
atlanır ve assertion o yol için **hiç kurulmaz** — test yeşil kalır, açık kapanmaz.
Bu **sıfır kez** oluyor. Dahası, çözülen 612 adayın **hepsinde** modelin ürettiği
prosedür adı tRPC'nin kendi `path`'iyle **birebir aynı** — yani `expected` değeri de
sahte değil.

⇒ **Gizli totoloji YOK.** Testin 612 iddiası **gerçek**; her üç eksen de (yüzde-kodlama
`%2E`/`%2e`, mount büyük/küçük harf, sondaki eğik çizgi arity 0/1/2) bu 612'nin
**içinde**.

### 2.4 ⚠ Dinamiklik — 17 doğru, ama bir kör nokta var

```
COUNT= 17   (job.get … tenant.updateSecurityPolicy)
LAZY= []
NO_DOT= []
```

- ✅ Prosedür listesi **sabit kodlanmamış**; `_def.procedures`'tan okunuyor ⇒ yarın
  bir prosedür eklenince **otomatik** kapsanır.
- ✅ `applyDotToken` nokta taşımayan bir ada denk gelirse **gürültülü fırlatıyor**
  (`:172`) — sessiz atlama yok.
- ⚠ **Kör nokta:** gerçek çözücü `_def.procedures`'ta bulamazsa `_def.lazy`'ye de
  bakar (`router.ts:377-391`); test **yalnızca** `_def.procedures`'ı okur. Bugün
  `_def.lazy` boş olduğu için fark yok, ama bir lazy router eklenirse o prosedürler
  **sessizce** kapsam dışı kalır. → `low` olarak yazıldı.

---

## 3. ⭐ İŞ ③ — ÜÇ GERİ ALMA: **DEVRALMADIM, KENDİM KOŞTURDUM**

Yöntem: üretim dosyası `/tmp/t021-sec-tur4/mutants/`'a **kopyalandı** ve orada mutasyona
uğratıldı; gerçek test dosyası da `/tmp`'ye kopyalanıp **yalnızca üç import satırı**
değiştirildi (diff rapora alındı — gövde birebir). ⚠ **Repo içinde hiçbir dosya
değiştirilmedi.**

| #   | Mutasyon                                              | Kontrol (mutasyonsuz) | Sonuç          | İlk ihlal örneği                                               |
| --- | ----------------------------------------------------- | --------------------- | -------------- | -------------------------------------------------------------- |
| —   | yok (kontrol)                                         | —                     | ✅ **YEŞİL**   | —                                                              |
| 1   | `foldTrpcMountPrefix` → no-op                         | yeşil                 | ❌ **KIRMIZI** | `/TRPC/session.me` → `"/TRPC/session.me"` ≠ `/trpc/session.me` |
| 2   | `decodePathnameSafely` → no-op                        | yeşil                 | ❌ **KIRMIZI** | `/trpc/session%2Eme` → `"/trpc/session%2Eme"`                  |
| 3   | `stripTrailingSlashes` → **tek** soyma (FIX 4 öncesi) | yeşil                 | ❌ **KIRMIZI** | `/trpc/session.me//` → `"/trpc/session.me/"`                   |

⇒ **Değişmez üç ekseni de gerçekten kapsıyor.** Her mutant, **yalnızca** kendi eksenine
ait ihlalleri üretti (çapraz kirlenme yok) — yani test üç ekseni **ayrı ayrı** pinliyor,
tek bir toplu iddiaya yaslanmıyor.

Ayrıca gerçek süitte (önbelleksiz): **6 dosya / 129 test yeşil** —
`normalize-request-path.test.ts`, invariant, `rate-limit-policy`, `tenant-exempt-paths`,
`platform-admin-ip-guard`, `rate-limit-guard-case-sensitivity`.

---

## 4. ⚠ 35.840 → 816 DARALTMASI — kabul ediyorum, iki kaydıyla

`backend`'in gerekçesi doğru: tur 3'ün taraması **tek bir ihlal şekli** buldu, diğer
eksenler (Unicode, tam genişlik, Türkçe harf, çift kodlama, null byte, boşluk/kontrol,
matrix parametresi, ters eğik çizgi, `.`/`..`, `%2F`) **sıfır** ayrışma üretti. 35.840'ı
her PR'da tekrar koşmak bir **kapı** için orantısızdır ve testin amacı regresyon ağı
olmaktır, keşif değil.

⭐ **Daraltmayı güçlendiren ölçüm:** 816 aday **boş bir kabuk değil** — §2.3'te
görüldüğü gibi **612'si gerçekten prosedür çalıştırıyor** ve üç eksenin ikili/üçlü
kombinasyonlarını (ör. `/tRpC/session%2eme//` = üç eksen aynı anda) içeriyor.

**İki kayıt (`low` olarak yazıldı):** `_def.lazy` kör noktası (§2.4) ve `/auth`
yüzeyinin değişmezsiz kalması (§5.3).

---

## 5. ⚠ OVER-INCLUSIVE YÖN — yedi tüketicinin **tamamı** denetlendi

`backend`'in atfı (**tur 3 §3.8 madde 1**) **doğrudur**: o madde "`///` varyantı tRPC'de
zaten `NOT_FOUND` olduğundan bu, fail-closed yönde fazladan eşleşme üretir" diyordu.
⚠ Ama o cümle **oran sınırı tüketicisi** bağlamında yazılmıştı. Bu turda **yedi
tüketicinin hepsi** ayrı ayrı denetlendi, çünkü "daha çok eşleşme" iki tüketicide
**daha gevşek** anlamına gelir:

| #   | Tüketici                 | Eşleşme ne demek     | Fazladan eşleşmenin yönü                         |
| --- | ------------------------ | -------------------- | ------------------------------------------------ |
| 1   | `isTrpcRateLimitedPath`  | **sınırla**          | ✅ daha sıkı                                     |
| 2   | `resolveRateLimitPolicy` | **sınırla**          | ✅ daha sıkı — F8'in düzeltildiği yer            |
| 3   | `isAuthOwnPath`          | kendi handler'ımız   | ✅ nötr (404 yerine kanonik handler)             |
| 4   | `isAuthDelegatedPath`    | Better Auth'a ilet   | ⚠ **daha gevşek** → §5.3'te ölçüldü, **nötr**    |
| 5   | `isTenantExemptPath`     | **muaf tut**         | ⚠ **daha gevşek** → §5.2'de ölçüldü, **güvenli** |
| 6   | `isAuthExemptPath`       | **muaf tut**         | ⚠ **daha gevşek** → §5.2'de ölçüldü, **güvenli** |
| 7   | `matchesPrefix…` (ÖNEK)  | guard'ı **çalıştır** | ✅ 0 fail-open (§5.1)                            |

### 5.1 ÖNEK tüketicisi — **tek** fail-open riski, mekanik olarak elendi

`PlatformAdminIpGuard` için eşleşmeme = **guard atlanır** = fail-OPEN. "Tam soyma"nın
eski "tek soyma"ya göre bir yolu eşleşmez hâle getirmesi teorik olarak mümkündü
(örn. önek `/` ile bitseydi). Ölçüm: 17 taban × 13 sonek = 221 yol, eski ve yeni
implementasyon yan yana:

```
ÖNEK fail-open sayısı = 0 | önek farkı toplam = 0
normalize farkı (eski ≠ yeni) = 71
```

Yani 71 yolda normalize çıktısı değişti ama **hiçbirinde** önek kararı değişmedi.
Yapısal gerekçe: `PLATFORM_NAMESPACE_PREFIX = '/trpc/platform.'` **eğik çizgiyle
bitmiyor**, bu yüzden sondan eğik çizgi soymak önek kararını etkileyemez.

### 5.2 Muafiyet kümeleri — gevşeme değil, **hizalama**

`/trpc/session.me//` artık kiracı-muaf. Doğru mu? **Evet:** tRPC o yol için
`session.me`'nin **ta kendisini** çalıştırıyor (§2.3'te ölçüldü — arity 2 çözülüyor),
muafiyet de o prosedüre zaten verilmişti. Asimetriyi kapatmak doğru yön.

`///` (arity 3) için: muafiyet veriliyor **ama tRPC `NOT_FOUND` dönüyor** ⇒ hiçbir
prosedür çalışmıyor. Atlanan guard'ların koruduğu şey zaten yok. Yeni bir varlık
numaralandırma oracle'ı da doğmuyor: kanonik yol zaten aynı muafiyete sahip olduğu için
saldırganın elde edebileceği ayırt edici bilgi **değişmiyor**.

### 5.3 ⚠ `/auth` yüzeyi — FIX 4 **sessizce** genişletti, ama ölçtüm: **nötr**

ESKİDEN `POST /auth/sign-in/email//` → `AuthController.delegate` 404 ile keserdi.
ARTIK Better Auth'a delege ediliyor. Tehlikeli bileşim "erişilebilir **ve** sınırsız"
olurdu — bunu doğrudan **gerçek üretim fonksiyonlarıyla** ölçtüm:

| Yol (POST)                              | delegated  | tenantExempt | Oran sınırı politikası           |
| --------------------------------------- | ---------- | ------------ | -------------------------------- |
| `/auth/sign-in/email` … `///`           | true (4/4) | true (4/4)   | `login` 5/20 — **4/4 varyantta** |
| `/auth/request-password-reset` … `///`  | true (4/4) | true (4/4)   | `reset` 3/10 — **4/4 varyantta** |
| `/auth/sign-up/email` … `///`           | true (4/4) | true (4/4)   | `reset` 3/10 — **4/4 varyantta** |
| `/auth/send-verification-email` … `///` | true (4/4) | true (4/4)   | `reset` 3/10 — **4/4 varyantta** |
| `/auth/sessions/revoke` … `///`         | (own yol)  | true (4/4)   | `login` 5/20 — **4/4 varyantta** |

⇒ Genişleyen yüzeyin **tamamı** oran sınırlı. Yeni bir Better Auth ucu açılmıyor
(normalizasyon yalnızca sondaki eğik çizgiyi soyar, bir yolu **başka** bir yola
çeviremez). **Güvenlik etkisi nötr**; bulgu yalnızca **testsizlik** (`low`).

---

## 6. ⚠ `backend`'in `DOĞRULANAMADI`'sı — ⭐ **KAPATAMADIM, GEREKÇESİ ÖLÇÜLDÜ**

### 6.1 Çalışan API süreci FIX 4'ü **TAŞIMIYOR** — davranışla kanıtlandı

Zaman damgası (DoD'nin istediği yöntem — `dist/main.js` mtime'ı **değil**, sürecin
başlangıcı):

```
PID 43757   STARTED Mon Nov 16 10:13:24 2026   node dist/main.js
apps/api/src/http/normalize-request-path.ts            mtime 2026-11-16 12:57:53
apps/api/src/__tests__/…-trpc-invariant.test.ts        mtime 2026-11-16 12:55:15
```

Süreç, FIX 4'ten **2 saat 44 dakika ÖNCE** başlamış ve yeniden başlatılmamış.

⭐ **Zaman damgasına güvenmedim — ayırt edici bir canlı tanık kurdum.** FIX 4, `//`
varyantını kiracı-muaf hâle getirir; öncesi getirmez. Rezerve host'ta bu, **iki farklı
durum kodu** demektir ve **hiçbir oran sınırlı uca dokunmaz, oturum gerektirmez**:

| İstek (`Host: panel.arkesoft.localhost`) | Gözlenen                   | Anlamı                               |
| ---------------------------------------- | -------------------------- | ------------------------------------ |
| `GET /trpc/session.me`                   | 401 `UNAUTHENTICATED`      | muaf (kanonik)                       |
| `GET /trpc/session.me/`                  | 401 `UNAUTHENTICATED`      | muaf (arity 1 — eski kod da soyuyor) |
| `GET /trpc/session.me//`                 | **404 `TENANT_NOT_FOUND`** | ⚠⚠ **muaf DEĞİL ⇒ FIX 4 YOK**        |
| `GET /trpc/session.me///`                | **404 `TENANT_NOT_FOUND`** | aynı                                 |
| `GET /trpc/tenant.current` (kontrol)     | 404 `TENANT_NOT_FOUND`     | muaf olmayan yol — tanık çalışıyor   |

⇒ **:3100'de koşan süreç FIX 4 ÖNCESİ koddur (ölçüldü, varsayılmadı).**

### 6.2 Sonuç: canlı sayaç ölçümü **yapılmadı** ve yapılmamalıydı

Bu süreçte `createTenant//` için Redis sayacını ölçseydim, **FIX 4 öncesi** davranışı
ölçmüş olurdum (sayaç artmaz) ve bu, düzeltme hakkında **yanıltıcı bir "hâlâ açık"**
sonucu üretirdi. ⇒ **`DOĞRULANAMADI` olarak kalıyor** — ama artık _nedeni_ bilinmiyor
değil, **ölçülmüş**.

### 6.3 `backend`'in ikame kanıtı **yeterli mi?** — ✅ evet, üç gerekçeyle

1. **Doğru dikiş:** `rate-limit.guard.ts:214-216`'da `policy === undefined` dalı Redis'e
   **hiç dokunmaz**; sayacın artması, `resolveRateLimitPolicy`'nin `undefined`
   dönmemesinin **deterministik** sonucudur. `backend` mock kullanmadan **gerçek**
   fonksiyonu çağırdı.
2. **Boru hattının üst halkaları zaten canlı ölçülmüş:** tur 3 §3.6, `createTenant//`
   için `TENANT_MEMBERSHIP_REQUIRED` (403) gözlemişti — yani `TenantGuard` geçildi ve
   istek `RateLimitGuard`'ın **hemen öncesindeki** `AuthGuard`'da öldü. Bu turda aynı
   şeyi `session.me//` ile tekrar gözledim (middleware + guard zinciri gerçekten koşuyor).
3. **Tek çıkarsanan halka değişmedi:** `AuthGuard`'ın üyelik dalı (bu ortamda
   `tenant_membership` boş). Bu, tur 3'te de tek çıkarsanan halkaydı ve FIX 4 ona
   dokunmuyor.

⭐ **Orkestratöre öneri (bütçesiz, tek komut):** API yeniden başlatıldıktan sonra
§6.1'deki tanığı tekrar koşmak yeterlidir — `GET /trpc/session.me//` **401** dönerse
süreç FIX 4'ü taşıyor demektir. Oturum, imzalama, Redis veya `EMAIL_IP_LIMIT` bütçesi
gerekmez. ⚠ Süreci **ben yeniden başlatmadım** (kullanıcı ortamı).

---

## 7. ⚠ YENİ BULGU — `//` ÖNEKLİ YOLLAR: GUARD ÖNCESİ, KİMLİKSİZ, SINIRSIZ 500

Bu, FIX 4'ün **fail-open regresyon yönünü** denetlerken ortaya çıktı (§5.1'in taraması
`"//"` için `TypeError` fırlattı) ve canlı doğrulandı.

`normalizeRequestPath`'in ilk satırı `new URL(rawUrl, 'http://…invalid')`. `//`
**boş authority** demektir ve WHATWG ayrıştırıcısı **fırlatır**:

```
"//"      -> FIRLATTI: TypeError: Invalid URL
"///"     -> FIRLATTI: TypeError: Invalid URL
"////"    -> FIRLATTI: TypeError: Invalid URL
"//%2F"   -> FIRLATTI: TypeError: Invalid URL
"//x"     -> normalize -> "/"            (host=x olarak ayrışır, fırlatmaz)
```

Çağıran `tenant-context.middleware.ts:40`'ta, **`try` bloğunun DIŞINDA**:

```ts
const context = getRequestContext()
if (isTenantExemptPath(req.url)) {   // ← FIRLATABİLİR
  …
}
try { const resolution = await this.tenantResolver.resolve(req.headers) … }
```

**Canlı (:3100):** `//` → 500 · `///` → 500 · `////` → 500 · `//%2F` → 500.
Kontroller: `/notaroute/x` → 404 `HTTP_EXCEPTION` · `//x`, `//x/y` → 404 · `/%2F` → 404.

**Saldırı senaryosu:** kimliksiz, oturumsuz, kiracısız bir istemci ham soketten
`GET // HTTP/1.1` gönderir. Middleware guard'lardan **önce** koştuğu için `RateLimitGuard`
bu yola **hiç ulaşmaz** ⇒ üretim **sınırsızdır**. Her istek
`app-exception.filter.ts:67`'de bir `error` seviyeli log kaydı doğurur. Kazanç: log
depolama maliyeti + `error` seviyeli alarm gürültüsü (alarm körelmesi). Veri sızıntısı,
yetki atlatma veya kiracı sızıntısı **yok** — istek fail-closed ölüyor.

⚠ **ÖN-VAROLAN:** `new URL(...)` satırı FIX 4 tarafından **değiştirilmedi**; eski ve
yeni implementasyonun ikisi de fırlatıyor (ölçüldü). FIX 4 bunu **getirmedi** —
ama "sınıfı kapatan" değişmez testi de bunu **kapatmıyor**, çünkü testin jeton kümesi
`new URL`'i fırlatan hiçbir girdi üretmiyor. ⇒ `medium`.

⭐ İlgili, bulgu **olmayan** gözlem: `//trpc/session.me` → `normalizeRequestPath`
`"/session.me"` döndürüyor (authority yutuluyor). Tur 3 bu yolu canlı ölçmüş ve
Express'in **rotalamadığını** (`HTTP_EXCEPTION`) saptamıştı ⇒ bugün ayrışma üretmiyor,
fail-closed. Not olarak bırakılıyor.

---

## 8. ⚠ TUR 3'ÜN BEŞ `low`'U — **beşi de AÇIK**, yan etki yok

FIX turu 4'ün dosya ayak izi **mekanik olarak ölçüldü** (mutlak ISO 8601 zaman,
stderr görünür, `-prune` ile):

```
2026-11-16 12:00:00 sonrası değişen repo dosyaları:
  ./apps/api/tsconfig.tsbuildinfo                                  (üretilen)
  ./apps/api/src/http/normalize-request-path.ts                    (FIX 4)
  ./apps/api/src/__tests__/normalize-request-path-trpc-invariant.test.ts (FIX 4 — YENİ)
```

⇒ FIX 4 **tam iki kaynak dosyaya** dokundu. Beş `low`'un hiçbirinin dosyası bunlarda
değil; yine de **beşi de yeniden ölçüldü**:

| Bulgu | Durum              | Bu turdaki mekanik teyit                                                                     |
| ----- | ------------------ | -------------------------------------------------------------------------------------------- |
| F3    | AÇIK, değişmemiş   | `impersonation.service.ts:226` → `subject: [...tenantIds].sort().join(',')` aynen            |
| F4    | AÇIK, canlı ölçüm  | `arkesoft_app` → `platform_admin` **ve** `platform_audit_log`: `DELETE INSERT SELECT UPDATE` |
| F5    | AÇIK, değişmemiş   | `:57` `RUN_IMPERSONATED_CALL_NEEDLE`, `:85` `PRISMA_SERVICE_NEEDLE` — içerik birebir         |
| F6    | AÇIK, değişmemiş   | `api-env.ts:69,96` → `z.url()`; `trusted-origins.ts:47-51` → ham `.origin`                   |
| F7    | AÇIK, sayılar aynı | `pnpm audit` → **0 critical / 1 high / 3 moderate / 1 low**                                  |

⚠ F5'in satır numarası düzeltildi: tur 3 `:78` yazmıştı, doğrusu **`:85`**. İçerik
(iki needle'ın çalışma anında birleştirilmesi) **değişmemiş** — yalnızca numara bayattı.

---

## 9. CLAUDE.md §7 — kiracı izolasyonu

18 maddenin tamamı tur 1/2/3'te bu değişiklik için doğrulandı. FIX turu 4 **tek bir saf
yol fonksiyonuna + bir test dosyasına** dokundu; hiçbir tablo, sorgu, kuyruk işi,
önbellek anahtarı, S3 öneki veya arama indeksi yüzeyini değiştirmedi (dosya ayak izi
§8'de ölçüldü). **Karşılanmayan madde: YOK.** Madde 4 (`publicProcedure` yasağı)
ADR-0023 Karar 2 kapsamında **gerekçeli istisna** olarak kalır.

⚠ Bu turun üç yeni `low`'u ve tek `medium`'u §7'nin **dışındaki** eksenlerdedir
(kiracı çapraz erişimi değil: test kapsamı, hata dayanıklılığı, oran sınırı yüzeyi).

---

## 10. BU TURDA KOŞTURULAN / KOŞTURULMAYAN

- **Koşturuldu:** `pnpm audit` (1) · `npx vitest run` hedefli 6 dosya (**129 test
  yeşil**, Turbo önbelleği **devrede değil** — `npx vitest` doğrudan çağrıldı) ·
  `npx tsx` ile 6 saf/işlem-içi betik (`/tmp`, repo dışı): 3 mutasyon koşumu + 1 kontrol,
  816 adaylık gerçek-handler sadakat ölçümü, 221 yolluk fail-open regresyon taraması,
  `/auth` yüzeyi politika tablosu, ADR-0021 §2-E kapsam tablosu · `curl` **16 istek**
  (:3100) · `docker exec … psql -tAc` **1 salt-okuma** · `docker exec … redis-cli --scan`
  **5 salt-okuma** · `git status`/`diff --stat`, `grep`, `sed`, `find -newermt`, `lsof`, `ps`.
- ⚠ **Koşturulmadı:** `pnpm test` (tamamı), `test:isolation`, **`test:e2e` (YASAK)**,
  `guards`, `build`, `lint`, `typecheck` — dar kapsam ve bütçe gereği.

### ⚠⚠ ORTAMDA BIRAKILAN İZ

**Hiçbir oran sınırı sayacı oluşturulmadı.** Ölçümden sonra Redis taraması:

```
*trpc*            → (boş)
*sign-up*         → (boş)
*password-reset*  → (boş)
*verification*    → (boş)
post-*            → (boş)
```

16 canlı isteğin **hiçbiri** oran sınırlı bir uca gitmedi: `/trpc/session.me` (×4),
`/trpc/tenant.current`, `/trpc//`, `/notaroute/x`, `//`-ailesi (×6), `/%2F`,
`//trpc/session.me`. Oran sınırlı üç tRPC yolu (`checkSlugAvailability`, `createTenant`,
`onboardingChecklist`) ve `/auth/*` uçlarının **hiçbirine** istek atılmadı.

⭐ **`EMAIL_IP_LIMIT` bütçesi (`request-password-reset` / `sign-up/email` /
`send-verification-email`) — BU TURDA DA SIFIR TÜKETİLDİ.** `qa` tur 2'nin bütçesi
**dört tur boyunca el değmemiş** durumda.

### Durum DEĞİŞTİRMEYENLER

- **Hiçbir DB yazması yok** (tek psql komutu `information_schema` üzerinde `SELECT`).
  Oturum **üretilmedi**, **yeniden imzalanmadı**; `BETTER_AUTH_SECRET` **okunmadı**.
- **Hiçbir repo dosyası değiştirilmedi.** Mutasyonlar `/tmp/t021-sec-tur4/`'te üretilen
  **kopyalar** üzerinde yapıldı. Yazılan tek dosya **budur**.
- Kök `.env` **okundu (grep, parola maskelendi), yazılmadı**. API **yeniden
  başlatılmadı** (PID 43757 başta ve sonda aynı). Port 3000/5173/5174'e **dokunulmadı**.
  Hiçbir konteyner durdurulmadı (25 konteyner ayakta). `docker context`
  **değiştirilmedi**. `git stash`/`checkout --`/`restore`/`add`/`commit` **yapılmadı**.
- ⚠ Not: ilk psql denemem yanlışlıkla **başka bir projenin** konteynerine
  (`cnc_proje-postgres-1`) gitti; komut `SELECT 1` idi ve rol bulunamadığı için
  **bağlantı kurulamadan reddedildi**. O konteynerde hiçbir etki oluşmadı; doğru
  konteyner (`arkesoft-postgres`) belirlenip ölçüm orada tekrarlandı.

### Ölçüm koşulları (AGENT_BASELINE §4, ders 2)

Makine yükü: **25 konteyner**, `load average 6.17 / 5.40 / 5.77`. Bu turun ölçümlerinin
**tamamı** gecikme değil **davranış / durum kodu / hata kodu / sayı** olduğu için yük
duyarlı değildir; 816 adaylık sadakat ölçümü ve 221 yolluk tarama tamamen işlem-içi
(ağ/disk I/O yok).
