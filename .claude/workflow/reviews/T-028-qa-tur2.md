# T-028 — `qa` gate, tur 2 (TAM denetim — ilk `qa` turu)

Tarih: 2026-11-24 · ROADMAP **v0.0.17** · platform `0.12.0 → 0.13.0`

```
GATE: qa
SONUÇ: FAIL
```

---

## 0. Özet (Orkestratör için)

`solid` ve `security` tur 2'de PASS verdi (0 critical/high, sırasıyla 2 ve 1 `medium`).
Brief bu üç `medium`'u (M1/M2/M3) `qa`'nın **kendi alanı** olarak işaretledi ve bağımsız
değerlendirme istedi. Üçünü de **kaynak kodu okuyarak + gerçek testler koşturarak**
bağımsız doğruladım, hepsine katılıyorum (SEV değişmiyor):

| # | Konu | Bağımsız doğrulama | Sonuç |
| - | - | - | - |
| **M1** | `sentry-invariants.test.ts:576-638` — critical'ın tek davranışsal kanıtı pozitif kontrolsüz | Kod okundu, gap doğrulandı | ⭐ **KAPANDI** — pozitif kontrol testi EKLEDİM (yeşil) |
| **M2** | `redaction.ts:273-274` — "mutasyona uğratmaz" değişmezi testsiz | Kod okundu, 0 test doğrulandı | ⭐ **KAPANDI** — mutasyon-değişmezi testi EKLEDİM (yeşil) |
| **M3** | `sentry.ts:85-106` — `Console` breadcrumb kanalı 3 redaksiyon katmanını baypas ediyor | `@sentry/node`/`@sentry/core` kaynağından BAĞIMSIZ doğrulandı + **gerçek bir koşumla yeniden üretildi** | ⚠⚠ **AÇIK** — regresyon pini EKLEDİM, **bilerek KIRMIZI** |

M1/M2 için eksik olan şey SADECE testti — davranış bugün doğru, testi yazıp yeşil aldım,
bulgu kapandı. M3 için eksik olan şey **üretim kodu** (Console entegrasyonu filtrelenmiyor)
— test yazdım ama **yazabileceğim en güçlü kanıt bu kadar**: test bilerek kırmızı, çünkü
üretim kodu düzeltilmeden geçemez (ve geçmemeli — düzeltmeyi ben yapamam, CLAUDE.md §10.6).

**SONUÇ neden FAIL (AGENT_BASELINE §4 tablosunun mekanik uygulamasından SAPMA, gerekçeli):**
tek açık `medium` (M3) bugün suitte **gerçek, kasıtlı bir regresyon testiyle kırmızı**
tutuluyor (`apps/api/src/__tests__/sentry-console-breadcrumb-leak.test.ts`). CLAUDE.md §6'nın
zorunlu kapısı ("`pnpm test` ... hepsi yeşil olmak zorunda") bu nedenle **bugün
karşılanmıyor**. Tablonun "1-2 `medium` → PASS" kısayolunu altındaki bulgu **mekanik olarak
kırmızı** iken uygulamak "kırmızı testi görmezden gel" anlamına gelirdi — bu da
AGENT_BASELINE'ın kendi "sonuç uydurma" ilkesine aykırı olur. ⇒ **FAIL**, düzeltme turu
`backend`'e: `sentry.ts`'e `Console` entegrasyonunu filtreleyen bir satır eklenmeli
(`integrations: (d) => d.filter((i) => i.name !== 'Console')` veya
`beforeBreadcrumb: () => null`), sonra benim pinim yeşile döner.

Kabul kriterlerinin (AC-52…AC-63) **TAMAMI** ayrıca tek tek ölçüldü — karşılıksız kriter
**yok**, hepsi §2'de tablo halinde.

---

## 1. Kabul kriteri eşlemesi (AC-52 … AC-63) — karşılıksız kriter YOK

| AC | Kriter (özet) | Test | Geçti mi |
| - | - | - | - |
| AC-52 | `traceId` log alanı + `requestId` tek kez | `apps/api/src/__tests__/log-correlation.test.ts` | ✅ (10/10) |
| AC-53 | Tek `traceId` zinciri HTTP→DB→kuyruk | `apps/api/src/__tests__/queue-trace-propagation.test.ts` + `queue-enqueue.test.ts` | ✅ |
| AC-54a | Başarı yanıtı `x-trace-id` | `log-correlation.test.ts` | ✅ |
| AC-54b | Hata yanıtı `x-trace-id` | `app-exception-filter-log-level.test.ts` (+ bağımsız kod okuması: `app-exception.filter.ts:105`) | ✅ |
| AC-55 | Span/log bağlam güvenliği (derinlemesine tarama, L-12) | `audit-log-no-log-leak.test.ts` (L-12, 5+1 test) + `redaction.test.ts` | ✅ |
| AC-56 | `logLevel` additive + 4-anahtar pin + `test:contract` diff 0 | `packages/errors/__tests__/app-error.test.ts` + `error-body` pini + `pnpm test:contract --force` | ✅ (34/34, diff 0 — **koştum**) |
| AC-57 | Sentry DSN boşken NO-OP + SIGTERM→exit 0 | `observability-runtime-contract.test.ts` (d) + `worker-shutdown.test.ts` | ✅ |
| AC-58 | `env:check` yeşil, yeni env anahtarı yok | `pnpm env:check` (**koştum**, exit 0) + `git diff --stat -- .env.example` (**koştum**, boş) + ⭐ yeni: `sentry-dsn-malformed-fail-closed.test.ts` | ✅ |
| AC-59 | Redaksiyon iki yönlü mutasyon testi | `redaction.test.ts` + ⭐ yeni: `redact-deep-input-immutability.test.ts` | ✅ |
| AC-60 | `docs/observability.md` dürüst | `docs/observability.md` **henüz YOK** — `docs` ajanı bu iş akışında `qa`'dan SONRA koşar (akış: …→qa/security/solid→düzeltme→docs→release). `qa` kapsamı dışı, bilgi notu. | — N/A (sıra gelmedi) |
| AC-61 | `pnpm guards` 24→25 | `scripts/guards.sh` + `pnpm guards` (**koştum**) | ✅ (25/25) |
| AC-62 | Sentry beş değişmez mekanik pinli | `sentry-invariants.test.ts` (1) + ⭐ yeni: `sentry-request-data-pipeline-positive-control.test.ts` (M1'in pozitif kontrolü) | ✅ |
| AC-63 | `PINO_REDACT_PATHS` 28'in süperkümesi, türetilmiş | `redaction.test.ts` (`.length` pini) — bağımsız sayıldı: 27+6+6=39 | ✅ |

AC-60 dışında tüm kriterler **geçti**; AC-60 bu turda henüz üretilecek bir çıktı (docs
ajanının sıradaki işi), eksik kriter DEĞİL.

---

## 2. BULGULAR

```
BULGULAR:
  - [SEV: medium] apps/api/src/observability/sentry.ts:85-106 — Sentry'nin VARSAYILAN
    `Console` entegrasyonu (`@sentry/node@11.12.0`'ın `getBaseDefaultIntegrations()`'ı,
    node_modules/.pnpm/@sentry+node@11.12.0/.../sdk/index.js:41) FİLTRELENMİYOR;
    `console.*` çağrılarının TÜM argümanları breadcrumb'a yazılıyor
    (@sentry+core@11.12.0/.../integrations/console.js → addConsoleBreadcrumb), bu
    dataCollection/redactDeep/pino redact.paths'in ÜÇÜNÜ DE baypas ediyor.
    security tur2 M3'ün (bağımsız) devralınmış bulgusu — qa BAĞIMSIZ olarak kaynak
    (node_modules) seviyesinde doğruladı VE GERÇEK bir koşumla yeniden üretti:
    console.warn('…arkesoft-musteri-sir-7c2e9f1a') + captureAppError() sonrası
    zarfın breadcrumbs[0].data.arguments[0] alanında sır AYNEN bulundu
    (ölçüm: apps/api/src/__tests__/sentry-console-breadcrumb-leak.test.ts, bilerek
    KIRMIZI — düzeltilmeden geçemez). `medium` (critical DEĞİL): no-console:'error'
    mekanik zorlu (packages/config/eslint/base.js:220) ve birinci parti üretim
    kodunda console.* çağrısı SIFIR ⇒ bugün saldırgan tarafından tetiklenebilir somut
    yol YOK; risk üçüncü parti bağımlılığın (Better Auth/Prisma/sürücü) ürettiği bir
    console.warn/error senaryosunda gerçekleşir. — Önerilen düzeltme:
    `Sentry.init`'e `integrations: (defaults) => defaults.filter((i) => i.name !==
    'Console')` (veya `beforeBreadcrumb: () => null`) ekle; eklenince
    `sentry-console-breadcrumb-leak.test.ts` yeşile döner (test DEĞİŞMEZ). — backend

  - [SEV: low] apps/api/src/observability/instrumentation.ts:208 — `sdk.start()`
    modül yüklenirken (top-level side effect) try/catch İÇİNDE DEĞİL. Eğer OTel
    `NodeSDK.start()` herhangi bir ortamda (Node sürümü/enstrümantasyon
    uyumsuzluğu) fırlatırsa, bu modülün İLK import'u (main.ts/main.worker.ts'in
    ilk satırı) fırlar ve TÜM API/worker süreci AÇILMAZ — "gözlemlenebilirlik
    dikişi" bir kullanılabilirlik bağımlılığına dönüşür (fail-open/fail-closed
    kararı BELGESİZ ve TEST EDİLMEMİŞ). Bugün ÖLÇÜLMÜŞ bir gerçek arıza YOK
    (spekülatif) — bu yüzden `low`, `critical`/`high` DEĞİL. — Önerilen düzeltme:
    (a) davranışı BİLİNÇLİ bir karar olarak dosya başında belgele (fail-closed
    kabul ediliyorsa neden), VEYA (b) `sdk.start()`'ı try/catch'e al ve
    hatayı `warn` seviyesinde loglayıp düşür (fail-open) — hangisi seçilirse
    seçilsin bir test eklenmeli. Vade: v0.18.0 (OTel exporter'la birlikte
    yeniden değerlendirilecek pencere). — architect/backend

BULGULAR (KAPANMIŞ — bilgi amaçlı, borç DEĞİL):
  - M1 (solid tur2, medium) — sentry-invariants.test.ts:576-638'in (4) describe'u
    Sentry'nin istek-verisi hattının GERÇEKTEN çalıştığını ölçen bir pozitif kontrol
    taşımıyordu (yalnızca "olay üretildi" + "sır yok" — hat sessizce dursa da aynı
    sonuç çıkardı). qa bağımsız doğruladı ve KAPATTI:
    apps/api/src/__tests__/sentry-request-data-pipeline-positive-control.test.ts
    (1 test, YEŞİL) — zarfın `request.method`/`request.url` alanlarının GERÇEKTEN
    doldurulduğunu assert ediyor.

  - M2 (solid tur2, medium) — redaction.ts:273-274'ün "girdi MUTASYONA UĞRAMAZ"
    değişmezi SIFIR testle korunuyordu (sentry-invariants.test.ts:494'teki
    karşılaştırma döngüseldi — mutasyon olsa da yeşil kalırdı). qa bağımsız
    doğruladı (değişmez BUGÜN TUTUYOR) ve KAPATTI:
    packages/errors/src/__tests__/redact-deep-input-immutability.test.ts
    (4 test, YEŞİL) — kök/iç içe/dizi girdilerin önce/sonra aynı kaldığını VE
    dönen değerin bağımsız referans olduğunu assert ediyor.
```

---

## 3. Eksik senaryo avı

Brief'in listelediği altı senaryoyu tek tek ölçtüm:

| Senaryo | Sonuç |
| - | - |
| `SENTRY_DSN` geçersiz biçimde | ⭐ Ölçüldü: `apiEnvSchema.SENTRY_DSN` (`config/api-env.ts:246`) `z.url().optional()` — biçimsiz değer `startSentry()`'ye HİÇ ULAŞMAZ, `parseEnv` AÇILIŞTA fırlatır (fail-closed, `DATABASE_AUTH_URL` emsali). **Eksikti, testi yazdım:** `sentry-dsn-malformed-fail-closed.test.ts` (4 test, YEŞİL) |
| OTel `NodeSDK.start()` fırlarsa açılış | ⚠ Ölçüldü: `instrumentation.ts:208` top-level, try/catch YOK ⇒ fırlarsa TÜM süreç açılmaz. Belgesiz/testsiz — yukarıda `low` bulgu olarak kaydettim |
| Worker'da kapanış sırası gerçekten çalışıyor mu | ✅ Ölçüldü: `worker.module.ts:48/53`'e `ObservabilityModule` eklendi; `worker-shutdown.test.ts` 8/8 PASS (Orkestratörün S6 doğrulamasıyla UYUMLU, kendim de koşturdum — tam suite içinde yeşil) |
| İki `startSentry()` çağrısı | ⚠ **Ölçülmedi** — ne bir bug bulgusu var ne de test yazdım; `Sentry.init`'in ikinci çağrıda ne yaptığı bu turda doğrulanmadı. Bulgu DEĞİL, açık soru olarak not ediyorum (borç tablosuna girmez, SEV atfedilmedi) |
| `captureAppError` Sentry başlatılmamışken | ✅ Zaten pinli: `sentry-invariants.test.ts` ("DSN tanımsız/boş NO-OP") — kendim okudum, `Sentry.isInitialized()` kapısı (`sentry.ts:233`) doğru |
| `redactDeep` derinlik limiti 6'yı aşan girdi | ✅ Zaten pinli: `redaction.test.ts` ("derinlik sınırını AŞAN bir nesnede fırlatmaz/takılmaz") — sır gerçekten DEPTH_LIMIT_PLACEHOLDER'ın ARKASINDA kesiliyor, sızmıyor (kendim okudum, gap yok) |

---

## 4. Regresyon

Tüm mevcut testler (benim dosyalarım HARİÇ) **değişmedi, gevşetilmedi**. Tam suite
koşumlarında benim eklediğim dosyalar dışında **sıfır** yeni kırmızı:

```
apps/api         önce: 112 dosya / 936 test  →  şimdi: 115 dosya / 942 test
                 (yalnızca BENİM 3 yeni dosyam: +6 test; 1'i BİLEREK kırmızı — M3 pini)
packages/errors  önce: 97/97   →  şimdi: 101/101 (benim 1 yeni dosyam: +4, hepsi yeşil)
packages/trpc    228/228 — DEĞİŞMEDİ (dokunulmadı)
```

---

## 5. Playwright / E2E

**Koşturulmadı** — brief'in kısıtı ve kendi ölçümüm aynı yönde: `apps/admin` /
`apps/superadmin` / `apps/storefront` dosya listesinde **sıfır** değişiklik (bu
sürümün tamamı `apps/api` + `packages/errors` + `packages/trpc`); DOM/erişilebilirlik
yüzeyi yok. `pnpm test:visual` de aynı gerekçeyle koşturulmadı.

---

## ÖLÇÜMLER

```
KABUL KRİTERİ EŞLEMESİ: §1 — 13/13 kriter (AC-52…AC-63) test edildi, AC-60 hariç
  hepsi GEÇTİ (AC-60 henüz docs'un sırası, kriter karşılıksız değil).

TEST SAYILARI (benim eklediğim / toplam):
  apps/api         yeni: 6 test (3 dosya) — 5 yeşil + 1 BİLEREK kırmızı (M3 pini)
                   toplam: 115 dosya / 942 test — 941 PASS / 1 FAIL (M3)
  packages/errors  yeni: 4 test (1 dosya) — 4 yeşil
                   toplam: 5 dosya / 101 test — 101 PASS / 0 FAIL
  packages/trpc    değişmedi — 16 dosya / 228 test — 228 PASS / 0 FAIL
  kök `pnpm test` (turbo) — 22/23 görev başarılı; TEK başarısız: @arkesoft/api#test
                   (M3 pini nedeniyle, yukarıda açıklandı)

KOŞTURULAN KOMUTLAR (hepsi gerçekten koştu, sırayla — eşzamanlı koşum YOK):
  pnpm lint                              → exit 0  (25/25 görev başarılı)
  pnpm typecheck                         → exit 0  (25/25)
  pnpm build                             → exit 0  (15/15)
  pnpm test (kök, turbo)                 → exit 1  (22/23 — @arkesoft/api#test FAIL, M3 pini)
  pnpm test:isolation (kök, AYRI koşum)  → exit 0  (12/12 görev, 6 dosya/31 test PASS)
  pnpm guards                            → exit 0  (25/25 PASS, 0 FAIL — iki ayrı koşumda teyit)
  pnpm format:check                      → exit 0  ("All matched files use Prettier code style!")
  pnpm test:contract --force             → exit 0  (34/34 PASS, cache bypass teyitli, snapshot diff 0)
  pnpm env:check                         → exit 0  ("✓ Tüm ortam değişkenleri geçerli.")
  git diff --stat -- .env.example        → boş (yeni anahtar YOK, AC-58 ikinci yarısı)
  npx eslint <3 yeni apps/api dosyası>   → exit 0, 0 problem (ayrıca pnpm lint'e dahil)
  npx eslint <1 yeni packages/errors>    → exit 0, 0 problem
  pnpm test:e2e / pnpm test:visual       → KOŞTURULMADI (brief kısıtı + DOM değişikliği 0)

FLAKY KONTROLÜ: apps/api tam suite 3 bağımsız koşumda (lint sonrası, root test sonrası,
  son doğrulama) AYNI sonuç: yalnızca M3 pini kırmızı, başka hiçbir dosya değişken
  davranış göstermedi. Flaky bulgu YOK.
```

---

## Yeni/değişen dosyalar (qa — yalnızca test, üretim kodu dokunulmadı)

- `apps/api/src/__tests__/sentry-console-breadcrumb-leak.test.ts` — YENİ, M3 regresyon
  pini (bilerek kırmızı, backend'in düzeltmesiyle yeşile dönecek)
- `apps/api/src/__tests__/sentry-dsn-malformed-fail-closed.test.ts` — YENİ, eksik
  senaryo (SENTRY_DSN geçersiz biçim → fail-closed), yeşil
- `apps/api/src/__tests__/sentry-request-data-pipeline-positive-control.test.ts` —
  YENİ, M1'in pozitif kontrol eksikliğini kapatır, yeşil
- `packages/errors/src/__tests__/redact-deep-input-immutability.test.ts` — YENİ, M2'nin
  mutasyon-değişmezi testini kapatır, yeşil
