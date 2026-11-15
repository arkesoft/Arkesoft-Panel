# T-019 — `perf` gate, TUR 1

Tarih: 2026-11-14 · Dal: `feat/v0.0.21-surum-kayit-modeli` · İncelenen commit: `9d33820`
(T-019 üretim fazının tamamı). Sürüm: platform `0.9.0`.

GATE: perf
SONUÇ: PASS

## BULGULAR

BULGULAR: yok (critical/high/medium **sıfır**). Aşağıda iki `low` not (teknik borç,
düzeltme turu açmaz) ve ayrıca **ölçülemeyen eksenler** listesi var (ayrı, bulgu değil).

- [SEV: low] `apps/api/src/registration/registration.service.ts:217-266` —
  `onboardingChecklist` **dört** sıralı DB round-trip'i yapıyor (`tenant.findFirst` →
  `tenantMembership.findUnique` → `subscription.findUnique` → `tenant.findFirst`).
  Sayı **sabit** (liste uzunluğuyla büyümüyor, N+1 değil) ama iki `tenant` okuması tek
  sorguya birleştirilebilir görünüyor. **Birleştirmeyi ÖNERMİYORUM**: sıra, ADR-0021 §2
  koşul B'nin bağlayıcı güvenlik kararı (sahiplik doğrulaması kiracı verisi okunmadan
  ÖNCE tamamlanmalı) — birleştirmek okunabilirliği bozar ve `solid` gate'in geri
  çevireceği bir performans/güvenlik takası olur. Kayda değer bir borç değil, bilinçli
  bir maliyet. Sorumlu: yok (aksiyon gerekmiyor), bilgi notu.
- [SEV: low] Admin paketinde Core Web Vitals (LCP/INP/CLS) ve API p95/arama p95 için
  **hiçbir otomatik ölçüm altyapısı yok** (Lighthouse CI/k6 — ROADMAP'te henüz
  planlanmamış). Yalnızca bundle bayt bütçesi mekanik olarak zorlanıyor. Bu T-019'un
  ürettiği bir regresyon değil, platformun o eksende hâlâ "ölçülemiyor" durumunda
  olması. Sorumlu: `devops`/`architect`, vade: ROADMAP'e göre belirlenecek.

## ÖLÇÜMLER

### 0. Gerekçeli ATLAMA — Core Web Vitals / Lighthouse (vitrin)
`git show --stat 9d33820` → `apps/storefront` için **sıfır** satır değişti (dosya adı
hiç geçmiyor). `git status --short` → yalnızca `.claude/workflow/tasks/T-019.md`,
`apps/admin/e2e/panel-flow.spec.ts`, `apps/admin/playwright.config.ts`,
`apps/admin/e2e/helpers/`, `apps/admin/e2e/registration-flow.spec.ts` — hiçbiri
`apps/storefront`. ⇒ **vitrin yüzeyi yok, Lighthouse CI koşturulmadı (gerekçeli
atlama, sessiz değil).** Gerçek yüzey `apps/admin` + `apps/api`.

### 1. Bundle boyutu — `pnpm --filter @arkesoft/admin build` (gerçek komut çıktısı, bu oturumda koşuldu)
```
[bundle-budget] paylaşılan çekirdek — JS (gzip): 136.43 KiB, CSS (gzip): 4.05 KiB
[bundle-budget] kimlikli ilk ekran (/) — JS (gzip): 181.65 KiB / bütçe 250.00 KiB (%72.7, rezerv 68.35 KiB)
[bundle-budget] kimlikli ilk ekran (/) — CSS (gzip): 4.05 KiB / bütçe 50.00 KiB (%8.1)
[bundle-budget] kimliksiz ilk ekran (/sign-in) — JS (gzip): 163.07 KiB / bütçe 250.00 KiB (%65.2)
[bundle-budget] kimliksiz ikinci ilk ekran (/kayit) — JS (gzip): 161.47 KiB / bütçe 250.00 KiB (%64.6)
[bundle-budget] MAKSİMUM — JS (gzip): 181.65 KiB / bütçe 250.00 KiB (%72.7)
```
→ **build PASS**, hiçbir eşik aşılmadı. **Eşik VAR** (ilk okumada "eşik yok" varsayımı
**YANLIŞ ÇIKTI** — `apps/admin/bundle-budget.config.ts`'te `MAX_FIRST_ROUTE_JS_GZIP_BYTES
= 250 KiB` + `MAX_FIRST_ROUTE_CSS_GZIP_BYTES = 50 KiB`, T-008'den beri mekanik olarak
zorlanıyor, `check-bundle-budget.ts` build'i kırar). 250+50 = 300 KiB toplam ⇒
**CLAUDE.md'nin "Admin ilk yük < 300 KB gzip" bütçesiyle BİREBİR eşleşiyor.** Gerçek
toplam (/): 181.65+4.05 = **185.70 KiB / 300 KiB bütçe (%61.9)** — bütçe İÇİNDE.
⚠ **Taban (T-019 öncesi) ölçülemedi** — `git stash` yasak, `9d33820^`'a geçmek
yasaklı dal kaydırma sayılır. Bunun yerine mutlak sayı + eşik karşılaştırması
raporlandı (talimata uygun); task dosyasının S10 ölçümüyle (161.47/181.65 KiB) **tam
örtüşüyor** — bağımsız doğrulama.
→ **④ "bundle bayt deltası beyan edilmiş" KARŞILANDI**, delta değil mutlak+eşik
karşılaştırması olarak (taban yokluğu nedeniyle, dürüst daraltma).

**Rota bazlı kod bölme:** build çıktısında `_auth.kayit` (1.77 KiB gzip),
`_app.magaza-olustur` (3.03 KiB gzip), `_app.kurulum._slug` (1.17 KiB gzip) **ayrı
chunk'lar** — TanStack Router'ın `autoCodeSplitting`'i her rotayı kendi chunk'ına
ayırıyor. `/magaza-olustur` ve `/kurulum/{slug}` `DELIBERATELY_LAZY_ROUTE_SRCS`'te
(`bundle-budget.config.ts:86-99`) → ilk-boya bütçesine **sayılmıyor**, yalnızca
derin bağlantıyla ziyaret edilirse indirilir. Bu liste task log'unda mutasyon kanıtıyla
doğrulanmış (satır çıkar → build kırmızı). Sihirbazın dört adımı (`StoreWizard.tsx`,
içeride `storeName`/`slug`/`siteType`) **tek React bileşeni içinde** — zaten tek
3.03 KiB'lık chunk'ın parçası, ayrıca bölünmesi kazanç getirmez (chunk zaten küçük,
bölme ek HTTP round-trip'i ekler).

**Yeni ağır bağımlılık:** `git show 9d33820 -- apps/admin/package.json` → **tek satır**
eklendi: `"@arkesoft/tenancy": "workspace:*"`. Üçüncü parti değil, workspace içi paket;
`normalizeTenantSlug()` saf fonksiyon, bağımlılığı **boş küme** (pakette `zod` dahil
hiçbir bağımlılık yok — `purity.test.ts` pinliyor, task log + `package.json` diff ile
teyit). Türkçe katlama 7 harf çifti elle eşleme — kütüphane (`slugify` vb.) **eklenmedi**.

### 2. Debounce — `pnpm --filter @arkesoft/admin test` (gerçek komut çıktısı)
```
Test Files  20 passed (20)
     Tests  160 passed (160)
```
`store-wizard-controller.test.ts` (bu koşumun parçası) sahte zamanlayıcıyla
(`vi.advanceTimersByTimeAsync`) **mutasyon kanıtlı**: `setSlug` art arda çağrıldığında
debounce penceresi (`SLUG_CHECK_DEBOUNCE_MS = 400`) içinde `checkSlugAvailability`
**TAM 1 kez** çağrılıyor (`toHaveBeenCalledTimes(1)` assert'i, dosya `:78`/`:104`).
Adım açılışındaki otomatik öneri kontrolü debounce'suz ama **tek seferlik** (adım
başına 1 çağrı, döngü yok). ⇒ **① "debounce ölçülmüş" KARŞILANDI.**

### 3. Sunucu sorgu sayısı — `pnpm --filter @arkesoft/api test` (gerçek komut çıktısı, bu oturumda koşuldu)
```
Test Files  89 passed (89)
     Tests  707 passed (707)
Duration  137.06s
```
`registration.test.ts` içindeki (bu koşumun parçası) PERF-etiketli test
(`:380-464`) spy'larla **mutasyon kanıtlı** sayım yapıyor:
- `checkSlugAvailability` → `tenant.findUnique` **TAM 1** (`findUniqueSpy`,
  `toHaveBeenCalledTimes(1)`).
- `createTenant` → `withNewTenant` **TAM 1**, `plan.findUnique` **TAM 1**,
  `tenant.create` **TAM 1**, `tenantMembership.create` **TAM 1**,
  `subscription.create` **TAM 1** — hepsi `expect(...).toBe(1)`.
⇒ **② "müsaitlik tam 1 tekil indeks okuması, N+1 yok" ve ③ "createTenant tam 1
transaction, döngüde sorgu yok" KARŞILANDI** — ölçüm test assert'i olarak **pinli**,
gelecekte regresyon olursa `pnpm test` kırmızı verir.

`onboardingChecklist` (liste üretimi) kaynak kodda doğrulandı
(`registration.service.ts:217-266`): **4 sabit sıralı sorgu**
(`tenant.findFirst`→`tenantMembership.findUnique`→`subscription.findUnique`→
`tenant.findFirst`), beş adımlık kontrol listesi **bellekte** (`buildOnboardingSteps`)
üretiliyor — adım sayısı sabit, sorgu sayısı adım sayısıyla **büyümüyor** ⇒ N+1 yok.

### 4. İndeks — `\d tenant` / `\d subscription` / `\d tenant_membership` (canlı Postgres, bu oturumda koşuldu)
```
tenant:             "tenant_slug_key" UNIQUE, btree (slug)                [checkSlugAvailability/onboardingChecklist'in sorgusu]
subscription:       "subscription_tenant_id_key" UNIQUE, btree (tenant_id) [onboardingChecklist'in subscription okuması]
tenant_membership:  "tenant_membership_tenant_id_user_id_key" UNIQUE, btree (tenant_id, user_id) [sahiplik doğrulaması]
plan:               id TEXT PRIMARY KEY (doğal anahtar 'trial')           [createTenant'ın plan okuması]
```
Dört sorgu deseninin **dördü de** uygun unique btree indeksle destekleniyor.
`EXPLAIN ANALYZE SELECT id FROM tenant WHERE slug='demo-site'` ve eşdeğeri
`subscription` sorgusu **Seq Scan** gösterdi — ancak `pg_class.reltuples`: `tenant`=9,
`subscription`=1, `plan`=2, `tenant_membership`=432. Bu, planlayıcının küçük
tablolarda (tek sayfaya sığan) seq scan'i index scan'den **daha ucuz bulmasının**
beklenen davranışı — eksik indeks **DEĞİL** (indeksin kendisi `\d` çıktısında mevcut
ve DDL'de doğru tanımlı). Tablo büyüdükçe planlayıcı otomatik index scan'e döner;
bu eksen **gerçek bir regresyon riski taşımıyor**, dürüst kayıt olarak not edildi.

### 5. Önbellek — `apps/api/src/http/no-store-response-headers.ts` (kod okuması)
`/trpc/*` yanıtlarının **tamamına** (yeni `registration.*` prosedürleri dahil, ayrı bir
istisna yazılmadı) `cache-control: no-store, private` global politikası uygulanıyor
(`trpc.controller.ts:130-149` — alt katmanın yazdığı `cache-control`'ü **ezer**).
Kiracı/kullanıcıya özel yanıt paylaşılan önbellekte **görünmüyor**. Yeni bir Redis
önbellek anahtarı bu task'ta **eklenmedi** (slug müsaitliği her çağrıda canlı
okunuyor, bilerek önbelleksiz — müsaitlik "available" sonucunu önbelleklemek bir
yarış penceresi açardı). ⇒ **critical risk yok.**

### 6. Oran sınırı (perf'in sayaç uzayı endişesiyle kesişen yüzey)
`trpc-rate-limited-paths.ts` → `checkSlugAvailability`/`createTenant`
`LOGIN_ACCOUNT_LIMIT=5` penceresine bağlı; `onboardingChecklist` bilerek **hariç**
(yalnızca 2 okuma, enumeration yüzeyi değil). Debounce (400ms) + adım-açılış tek
çağrısı bu limitle **tutarlı** — architect'in F15 riskinin ("tuş başına çağrı ⇒
debounce ZORUNLU") karşılığı kod tarafında doğrulandı.

### 7. Test süresi (ikincil, ⚠ taban yok + eşzamanlı ajan yükü uyarısı)
`@arkesoft/api test` bu oturumda **137.06s** sürdü (89 dosya/707 test, izole koşum —
kök `pnpm test` KOŞTURULMADI, bilinen flake `solid`/`qa` gate'ine devredilmiş, burada
**tekrar raporlanmıyor**). ⚠ Bu ölçüm sırasında talimatta belirtilen üç başka ajan
(`solid`, `security`, bir `frontend`) eşzamanlı çalışıyor olabilir — **taban yok,
DOĞRULANAMADI**: süre artışının T-019'un yeni testlerinden mi yoksa eşzamanlı
makine yüküyle mi ilişkili olduğu ayırt edilemiyor. Sayı mutlak olarak raporlanıyor,
regresyon iddiası **yapılmıyor**.

### Ölçülemeyen eksenler (bütçesiz/altyapısız — ayrı rapor edilen, bulgu niteliğinde liste)
| Eksen | Durum |
| --- | --- |
| Vitrin LCP/INP/CLS | **Yüzey yok** (storefront değişmedi) — gerekçeli atlama |
| Admin LCP/INP/CLS (gerçek tarayıcı metriği) | **Ölçülemedi** — Lighthouse CI altyapısı yok, yalnızca bundle bayt bütçesi var (proxy ölçüm, gerçek CWV değil) |
| API p95 (gerçek network latency) | **Ölçülemedi** — k6/yük testi koşmadı; yalnızca sorgu SAYISI ölçüldü (mimari alt yüzey), gerçek milisaniye p95 YOK |
| Arama p95 | Kapsam dışı (bu task arama yüzeyine dokunmuyor) |

## SONUÇ GEREKÇESİ
Architect'in bağlayıcı perf planının dört dar kalemi (①②③④) **ölçümle** karşılandı;
üçü mutasyon-kanıtlı test assert'leriyle **pinli** (regresyon `pnpm test`'i kırar).
Critical/high/≥3-medium bulgu **yok** ⇒ AGENT_BASELINE §4 kuralına göre **PASS**.
İki `low` not teknik borca kaydedilsin, düzeltme turu açılmasını gerektirmiyor.
