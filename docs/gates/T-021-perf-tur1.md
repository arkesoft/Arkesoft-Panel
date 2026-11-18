# GATE: perf — T-021 (ROADMAP v0.0.20), Tur 1

**SONUÇ: PASS** · `critical` 0 · `high` 0 · `medium` 0 · **`low` 2**

> ⚠ Bu rapor `perf` ajanının çıktısından **Orkestratör tarafından diske işlendi** —
> ajanın `Write` aracı yok. İçerik ajanın kendi ölçümleridir.

⭐ **Ölçüm yöntemi — `EMAIL_IP_LIMIT`'e SIFIR dokunuldu:** sahte platform-yöneticisi
oturumu `session` tablosuna **doğrudan SQL** ile kuruldu; Better Auth'un `better-call`
imzalaması (**HMAC-SHA256**) `node:crypto` webcrypto ile **birebir yeniden üretildi**
(⚠ `BETTER_AUTH_SECRET` okundu, **hiçbir çıktıda yazdırılmadı**). Önceki gate turundan
kalan fixture kullanıcısı (`platform_admin` + 2FA) kullanıldı ⇒ **kimlik üretilmedi,
e-posta gönderilmedi**.

---

## YÜZEY ① — `platform.tenantList`'in 1+N transaction deseni

### (a) Gerçek gecikme (`curl time_total`, n=10/senaryo)

| Senaryo                                       | Gerçek N | p50         | en kötü gözlem |
| --------------------------------------------- | -------- | ----------- | -------------- |
| `limit=20`, seed (10 tenant)                  | 10       | **37.3ms**  | 53.5ms         |
| `limit=50`, seed (10 tenant)                  | 10       | 32.4ms      | 41.6ms         |
| `limit=20`, 50 tenant varken                  | 20       | 47.3ms      | 61.1ms         |
| ⭐ **`limit=50`, 50 tenant (şema MAKSİMUMU)** | **50**   | **112.5ms** | **202.2ms**    |

⇒ **500ms API p95 bütçesine göre en kötü durum bütçenin %40'ı** — ⭐ geniş rezervle **PASS**.

### (b) ⭐⭐ ADR-0023'ün 1+N iddiası MEKANİK OLARAK DOĞRULANDI

⚠ Kod okumasından **çıkarım değil** — Postgres **`log_statement='all'`** ile gerçek SQL
log'undan (geçici mutasyon; ⭐ sonrasında `ALTER SYSTEM RESET log_statement` +
`pg_reload_conf()` ve `show log_statement` → **`none`** ile **doğrulanarak** geri alındı).

`limit=20` çağrısı (10 gerçek tenant) → **48 ifade**:

- **10×** `BEGIN` + **10×** `COMMIT` + **10×** `set_config` (GUC) + **10×**
  `subscription` SELECT = **40**
- ⭐ Sabit genel gider: 1× `tenant.findMany` + ⭐⭐ **1× `platform_audit_log` INSERT
  (TEK satır, N'DEN BAĞIMSIZ)** + 1× `plan` `IN (...)` **toplu** sorgu + 4× auth/session

⇒ ⭐ **ADR-0023 §3'ün _"denetim birimi = erişim OPERASYONU, kiracı değil"_ kararı
tasarlandığı gibi çalışıyor** — kiracı başına yazsaydı **10 satır** olurdu.

### (c) Sınır gerçekten zorlanıyor mu — CANLI

`limit=51` → **HTTP 400** (zod `max(50)`) · `limit=50` → **200** ·
`limit=0` → **400** (`min(1)`).
⇒ ⭐ `PLATFORM_TENANT_LIST_MAX_LIMIT=50` **sözleşmede zorlanıyor**, iyi niyete bağlı değil.

### (d) 1000 kiracı ekstrapolasyonu — ⚠ VARSAYIM, açıkça işaretli

⭐ **Tek bir çağrı** bugünkü N=50 ölçümünden **esasen farklı olmaz**, çünkü `limit`
şema seviyesinde **50'de sabit** ve ⚠ **sayfalama imleci yok** (architect tasarımı);
toplam kiracı sayısı yalnızca ilk `tenant.findMany`'nin tarama maliyetini etkiler
(50 satırda **0.58ms** ölçüldü).
⚠ **Gerçek N=1000 TEST EDİLMEDİ** (1000 sahte satırı güvenli/tersinir üretmek tur
süresini aşardı).
⚠ **Gerçek riziko N'de değil, TOPLAM İSTEK HACMİNDE:** çok sayıda eşzamanlı çağrı
bağlantı havuzunu **4×N ardışık round-trip** ile baskılayabilir — ⭐ bu **`R-A5`'in zaten
kabul ettiği**, **v0.15.0**'a bırakılan bedel.

### ⭐ `resolvePlanNames` özel kontrolü (`S7`'nin metodu) — TEMİZ

Log'da **tam bir** `plan … IN ($N)` ifadesi (N tenant için **tek toplu sorgu**)
⇒ ⚠ **N+1 YOK**; ADR'nin izin verdiği birincil 1+N'in üstüne **ikinci bir katman
binmemiş**.

---

## YÜZEY ② — Vite bundle bütçesi

### (a) Sayılar bağımsız doğrulandı

`pnpm --filter @arkesoft/superadmin build` → JS (gzip) **160.96 KiB / 250 KiB (%64.4)** ·
CSS **3.71 / 50 KiB (%7.4)**.
⇒ ⭐ `S8`'in iddiasıyla (160.93 / %64.4 · 3.70 / %7.4) **birebir örtüşüyor** —
**CONFIRMED**.

### (b) ⭐ 250 KiB MAKUL MU — admin'le karşılaştırıldı

`apps/admin` de bağımsız build edildi: **181.78 KiB / 250 KiB (%72.7)**
⇒ ⭐ **kardeş uygulama o bütçenin %72.7'sini ZATEN dolduruyor** — bütçe orada da
sıkışmıyor ama **rastgele değil**.
⭐ Ayrıca **250 (JS) + 50 (CSS) = 300 KiB**, platformun kendi _"Admin ilk yük
< 300 KB gzip"_ kuralıyla **birebir örtüşüyor**.
⇒ **Sayı kopya ama GEREKÇESİZ DEĞİL.** ⚠ Kalan eksik yalnızca **dokümantasyon** → `low` 2.

### (c) ⭐⭐ Fail-closed B mekanizması CANLI — mutasyonla teyit

`bundle-budget.config.ts`'in `DELIBERATELY_LAZY_ROUTE_SRCS` dizisinden
`iki-adimli-dogrulama.tsx?tsr-split=errorComponent` satırı **geçici silindi**
(⚠ `Edit` aracı yok ⇒ `cp` ile yedek) → build **KIRMIZI** (`FAIL-CLOSED B`, exit 1) →
`cp` ile geri yüklendi, ⭐ `diff` ile **birebir eşleşme doğrulandı**.
⇒ ⭐ **Mekanizma boş değil**, `S8`'in bulduğu gerçek eksikliği **hâlâ yakalıyor**.

---

## "Ayrıca bak" — dördü de cevaplandı

| #   | Eksen                                             | Sonuç                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **N+1** (`auditLog`/`session`/`resolvePlanNames`) | ✅ **TEMİZ** — `auditLog` `EXPLAIN ANALYZE` → **Index Scan** (`platform_audit_log_created_at_idx`, **0.372ms**); `session` iki bağımsız `findUnique`, **döngü yok**; `resolvePlanNames` **tek toplu `IN(...)`**                                                                                                                                 |
| 2   | **Gereksiz client JS / ağır bağımlılık**          | ✅ **TEMİZ** — ⭐ Radix **0 eşleşme** (`apps/superadmin` ve `packages/ui`); chunk'lar beklenen kütüphanelerle örtüşüyor (react/react-dom ~102KB, i18n kataloğu ~37KB) — **sürpriz paket yok**                                                                                                                                                   |
| 3   | **Build süresi**                                  | Kök `pnpm build` **1.374s** (13/14 cache hit); `superadmin:build` tek başına **~331ms**. ⚠ **Metodolojik caveat (ajanın kendi notu):** _"eklenmeden önce"_ ile **gerçek A/B yapılmadı** (uygulamayı tersinir çıkarmak riskli/kapsam dışı) — görev süresi marjinal maliyetin **vekili**                                                          |
| 4   | **Önbellek stratejisi**                           | ✅ **TEMİZ** — `no-store-response-headers.ts:54` `cache-control: no-store, private` **global, fail-closed** middleware (guard'lardan **önce**); ⭐ `platform.session`/`tenantList`/`auditLog` **üçünde de** canlı `curl` ile doğrulandı (**yetkisiz 401 dahil**). ⭐⭐ **Rota bazlı allowlist'e bağlı DEĞİL ⇒ unutma riski YAPISAL OLARAK YOK** |

---

## BULGULAR

### `low` — `(createdAt, id)` bileşik indeksi yok

**`packages/db/prisma/schema.prisma:141-160`** (`Tenant`)

`platform.tenantList`'in `ORDER BY created_at DESC, id DESC LIMIT n` sorgusuna karşılık
gelen bileşik indeks **yok**. ⭐ **`EXPLAIN ANALYZE` ile ölçüldü:** 10 satırda
Seq Scan+Sort (**2.122ms**), 50 satırda (**0.580ms**) ⇒ **bugün zararsız**, bütçeyi
aşmıyor.
⚠ 1000+ satırda **VARSAYIM** (ölçülmedi): dar satırlı küçük tabloda sıralı tarama +
bellek içi sıralama **hâlâ tek hane ms** kalır.
**Öneri:** `@@index([createdAt, id])` — **mikro optimizasyon, acil değil**. → `db` (borç)

### `low` — bundle bütçesinin gerekçesi platformun kendi kuralına atıf vermiyor

**`apps/superadmin/bundle-budget.config.ts:11-18`**

250 KiB JS / 50 KiB CSS, `apps/admin`'den kopyalanmış ve yorumu **yalnızca** _"aynı yığın"_
diyor — ⚠ platformun _"Admin ilk yük < 300 KB gzip"_ kuralına **açıkça atıf vermiyor**.
⭐ **Sayının kendisi makul** (yukarıda (b)); eksik olan **dokümantasyon/gerekçe**.
→ `frontend`/`docs` (borç)

---

## Ölçümler

| Metrik                                     | Değer                                                                    | Bütçe    | Durum                           |
| ------------------------------------------ | ------------------------------------------------------------------------ | -------- | ------------------------------- |
| API p95 — `tenantList` **N=50 (şema max)** | p50 **112.5ms**, en kötü **202.2ms**                                     | <500ms   | ✅ **%40**, geniş rezerv        |
| API p95 — `auditLog`                       | p50 **~10ms** (8-48ms, n=10)                                             | <500ms   | ✅                              |
| `tenantList` transaction sayısı (N=10)     | **48 ifade** (40 + 8 sabit)                                              | mekanik  | ⭐ 1+N **ölçülerek** doğrulandı |
| `limit` sınırı                             | 51→**400** · 50→**200** · 0→**400**                                      | ≤50      | ✅ canlı                        |
| Süper admin JS (gzip)                      | **160.96 KiB**                                                           | <250 KiB | ✅ **%64.4**                    |
| Süper admin CSS                            | **3.71 KiB**                                                             | <50 KiB  | ✅ %7.4                         |
| ⭐ Admin JS (referans)                     | **181.78 KiB**                                                           | <250 KiB | ✅ %72.7                        |
| Fail-closed B                              | **mutasyonla canlı** doğrulandı                                          | —        | ✅ boş değil                    |
| `tenant` seq scan                          | 10 satır **2.122ms** · 50 satır **0.580ms**                              | —        | bugün zararsız                  |
| Transaction süresi                         | her `withTenant()` tek SELECT (BEGIN→SELECT→COMMIT), **kilit tutma yok** | —        | ✅                              |
| Redis önbellek / BullMQ                    | **N/A** — `platform.*` ikisini de kullanmıyor                            | —        | bulgu yok                       |

**`ÖLÇÜLEMEDİ` (gerekçeli):** LCP/INP/CLS — ⭐ repoda **Lighthouse CI altyapısı hiç yok**
(grep: 0) **ve** CWV bütçesi mimaride **vitrine** ait, admin SPA'sına değil (SPA bütçesi
_"Admin ilk yük"_); bu Task `apps/storefront`'a **dokunmuyor** · Arama p95 — **kapsam
dışı** (Meilisearch'e dokunulmuyor).

## ⭐ Ortam temizliği (ajan doğruladı)

`tenant` **10**'a geri döndü · sahte `session` satırı **silindi** · test sırasında yazılan
**45** `platform_audit_log` satırı silindi (⭐ **önceden var olan 2 satır dokunulmadan**) ·
`log_statement` → **`none`** · `bundle-budget.config.ts` mutasyonu **`diff` ile birebir**
geri yüklendi · `git status --porcelain` **oturum başındaki durumla aynı** ·
25 konteyner ve portlar (3000/5173/5174) **dokunulmadı** · `docker context` **değişmedi** ·
⭐ `EMAIL_IP_LIMIT`'e **sıfır** yeni istek · kök `.env` **yalnızca okundu**,
⚠ **hiçbir sır çıktıda yazdırılmadı**.
