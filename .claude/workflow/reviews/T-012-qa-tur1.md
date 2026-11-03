# T-012 — qa gate — tur 1

Tarih: 2026-11-03 · Sürüm: v0.0.10 (platform → 0.2.0 ön görüsü) · Task: T-012

GATE: qa
SONUÇ: PASS

---

## BULGULAR

- [SEV: low] `apps/storefront/src/middleware.ts:230-236` — "seçim yok" (ikisi de `null`/eksik) ile
  "seçim VAR ama **asimetrik**" (`themeId` dolu + `themeVersion` `null`, veya tersi) **AYNI dala**
  düşüyor: `themeId !== null && themeVersion !== null` koşulu asimetrik çiftte `false` döner ve
  sessizce `DEFAULT_THEME_SELECTION`'a düşer, 503 **üretmez**. DB'nin
  `tenant_theme_selection_pairing_check` CHECK kısıtı bu şekli **satırda** engelliyor, ama bu garanti
  **telde yok** (R5'in zaten kapsadığı "ikisi de eksik"/"ikisi de null" senaryolarının **dışında**,
  hiç test edilmemişti — ölçüldü, kodda da yorum/test yoktu). Bu bir çökme/güvenlik açığı değil —
  davranış deterministik ve belgeli (bu turda eklenen testlerle artık pinli) — ama bir API/dağıtım
  kayması `themeId`'yi gönderip `themeVersion`'ı düşürürse (ya da tersi) vitrin **sessizce**
  varsayılan temaya döner, hiçbir hata/log sinyali üretmez; bu tür bir veri bütünlüğü kusurunu
  operasyonel olarak **maskeler**. — **Önerilen düzeltme:** `middleware.ts`'in adım 5.5'ine asimetrik
  çift için açık bir dal eklenip (`ThemeResolutionError`/503'e eşlenerek) CHECK kısıtının DB'de
  verdiği garantinin tel üzerinde de **açıkça** modellenmesi; veya bilinçli bir tasarım kararıysa
  bunun ADR-0002'ye bir satır olarak not edilmesi. — **Sorumlu ajan:** `architect`/`frontend` (vade
  önerisi: bu teknik borç tablosuna, aciliyet yok — davranış bugün YANLIŞ değil, sadece
  **belgesiz/kasıtsız**).

Yukarıdaki tek `low` dışında bulgu yok. Sekiz mekanik pin dosyası, dört kasıtlı bozma senaryosu ve
AC3'ün üç mutasyonu dahil hiçbir "sessizce yeşil kalan yol" bulunamadı (ayrıntı aşağıda).

---

## ÖLÇÜMLER

### KOŞTURULAN KOMUTLAR

| Komut | Exit kodu | Özet |
| --- | --- | --- |
| `pnpm env:check` | 0 | Tüm ortam değişkenleri geçerli |
| `pnpm db:migrate` | 0 | "Already in sync" — `20261103070156_tenant_theme_selection` zaten uygulanmış |
| `pnpm db:seed` | 0 | demo-magaza hazır |
| `docker exec … psql \d tenant` | — | `theme_id`/`theme_version` kolonları + `tenant_theme_selection_pairing_check` CHECK canlıda doğrulandı |
| `docker exec … psql select theme_id,theme_version from tenant` | — | `modern` / `0.1.0` (backfill doğrulandı) |
| `apps/api` arka planda başlatıldı, `/health/ready` | 200 | AC ölçümlerinin ön koşulu |
| `pnpm lint` | 0 | **21/21** |
| `pnpm typecheck` | 0 | **21/21** |
| `pnpm format:check` | 0 | Prettier temiz |
| `pnpm build` | 0 | **13/13** (14/14 DEĞİL — `themes-modern`'in `build` görevi YOK, ADR-0002 Karar 1 ile tutarlı) |
| `pnpm test` (1. koşum) | 0 | **18/18 görev, 1015 test, 0 skipped** |
| `pnpm test:isolation` (1. koşum) | 0 | **10/10 görev → 18 test** (db 14 + api 4) |
| `pnpm --filter @arkesoft/storefront test:e2e` (1. koşum) | 0 | **14/14** |
| İş 3/4/5 mutasyonları (8 ayrı mutasyon, her biri `shasum`/`git diff` ile tersine çevrildi) | — | aşağıda ayrıntılı |
| `pnpm lint`/`typecheck`/`format:check` (2. koşum, 3 yeni test sonrası) | 0 | **21/21**, temiz |
| `pnpm test` (2. koşum) | 0 | **18/18 görev, 1018 test** (1015+3 yeni), **0 skipped** |
| `pnpm test:isolation` (2. koşum) | 0 | **10/10 görev → 18 test**, değişmedi |
| `pnpm build` (2. koşum) | 0 | **13/13** |
| `pnpm --filter @arkesoft/storefront test:e2e` (2. koşum) | 0 | **14/14** — flake YOK (iki koşum birebir aynı sonuç) |
| `pgrep -fl 'astro dev'` (koşum sonu) | 1 (boş) | artık süreç YOK |
| `lsof -i :3000` / `:4321` (koşum sonu) | 1 (boş) | her iki port serbest |

`pnpm test:contract` — bu sürümde henüz yok (v0.0.22, AGENT_BASELINE/CLAUDE.md §6 uyarısı).
`pnpm test:visual` — bu sürümde henüz yok (v0.0.19).

### KABUL KRİTERİ EŞLEMESİ

| # | Kriter | Test/Komut | Sonuç |
| --- | --- | --- | --- |
| AC1 | `modern@0.1.0` manifesti SDK doğrulamasından geçer; home+404 ikisi birden | `packages/themes/modern/src/__tests__/theme-manifest.test.ts` (5 test) | ✅ GEÇTİ — `ok:true`, `templates` `['home','404']`, uzunluk 2 |
| AC2 | Çözücü: bilinen→modül, bilinmeyen id/sürüm→adlandırılmış hata, `null` YOK | `apps/storefront/src/themes/__tests__/registry.test.ts` (8 test, `toBeNull` sıfır — `rg -c "toBeNull" registry.test.ts` → 0) | ✅ GEÇTİ |
| AC3 | `theme-css.ts`'te ayar anahtarı literali SIFIR (düzeltilmiş ölçüm) | `theme-css-no-literal-keys.test.ts` + kendi mutasyonum (aşağıda) | ✅ GEÇTİ, mutasyon kanıtlı |
| AC4 | `--color-primary` TAM `#2563EB` VE `main h1`'in hesaplanmış rengi bundan türüyor | `e2e/storefront-theme.spec.ts:130` (gerçek Playwright koşumu, 2 kez) | ✅ GEÇTİ — `rgb(37, 99, 235)` |
| AC5 | Regresyon yok: `yok.*`→404, `/404`/`/503` kiracıdan bağımsız | `e2e/storefront-host.spec.ts` (DEĞİŞMEDİ, diff boş, 11/11 test) | ✅ GEÇTİ |
| AC6 | Kiracıya özgü değer `immutable` ile servis edilmiyor | `e2e/storefront-theme.spec.ts:215` (Cache-Control) + `rg -c "color-primary" dist/client/_astro/` → **0** (exit 1) | ✅ GEÇTİ |
| AC7 | SEC-5a: `x/.env`/`assets/.hidden` RED, `a..b/c.jpg`/`v1.2.3/x.jpg` KABUL | `pnpm --filter @arkesoft/theme-sdk test` → **223 test** | ✅ GEÇTİ (sayı BAĞLAM ÖZETİ ile birebir) |
| AC8 | Public API ekleme `{name,themeId,themeVersion}`; 6 alan hâlâ YOK | `packages/trpc/src/__tests__/router-output.test-d.ts` (negatif pin) | ✅ GEÇTİ (tip testi, `pnpm test` kapsamında) |
| AC9 | DB nullable + backfill + CHECK; izolasyon bozulmadı | `docker exec psql` canlı doğrulama + `pnpm test:isolation` → 18 test (14+4) | ✅ GEÇTİ — görev 9→10 (derleme zinciri, AC9'un "test sayısı" şartı 18'de sabit) |
| AC10 | Tema build'e dahil; v0.0.9.1 AC8 değişmezi korunuyor | `pnpm build` 13/13 + `entry.mjs` var + `rg -l "data-arkesoft-theme" dist/server/` → 1 eşleşme | ✅ GEÇTİ |
| AC11 | Zorunlu kapı | `lint && typecheck && test && test:isolation && build` + `format:check` | ✅ GEÇTİ — hepsi 0, test **1018** (≥957, hatta ≥1015), **0 skipped** |

**11/11 kabul kriteri bağımsız olarak koşturuldu ve geçti.**

### İŞ 2 — SEKİZ MEKANİK PİN TEYİDİ

`git diff --stat` + `git status --porcelain` — her ikisi de **boş** (ne `M` ne `??`):

```
apps/storefront/src/layouts/BaseLayout.astro         — boş diff
apps/storefront/src/lib/cache-policy.ts              — boş diff
apps/storefront/src/pages/404.astro                  — boş diff
apps/storefront/src/pages/503.astro                  — boş diff
apps/storefront/e2e/storefront-host.spec.ts          — boş diff
packages/trpc/src/routers/storefront.router.ts       — boş diff
packages/theme-sdk/src/migrations/chain.ts           — boş diff
.changeset/config.json                               — boş diff
```

Sekizi de teyit edildi — bağımsız olarak doğrulandı, Orkestratör'ün ölçümüyle tutarlı.

### İŞ 3 — AC3'ÜN KENDİ MUTASYONLARIM

1. **`theme-css.ts`'e literal `'color-primary'` eklendi** (`QA_MUTATION_PROBE` sabiti) →
   `theme-css-no-literal-keys.test.ts` **KIRMIZI** döndü (`expected [ 'color-primary' ] to deeply
   equal []`). Geri alındı, `shasum` **birebir** eşleşti (`c434deb1…`).
2. **`theme.config.ts`'te `key: 'color-primary'` → `'color-primary-x'` yeniden adlandırıldı** →
   - `packages/themes/modern/src/__tests__/theme-manifest.test.ts:48` **KIRMIZI**
     (`expected undefined to be defined`) ✅ iddia doğrulandı
   - `apps/storefront/e2e/storefront-theme.spec.ts:130` (AC4, satır 136'daki
     `findColorSettingDefault('color-primary')` çağrısı) **KIRMIZI** (`"color-primary" renk ayarı
     modernTheme manifestinde bulunamadı`) ✅
   - `apps/storefront/e2e/storefront-theme.spec.ts:182` (İŞ 2, satır 190) **KIRMIZI**
     (`--color-primary` boş dize döndü, `PageHeading.astro`'nun hardcoded `var(--color-primary)`
     referansı artık tanımsız bir değişkene bakıyor) ✅
   - `theme-css-no-literal-keys.test.ts` — **YEŞİL kaldı** (beklenen: bu pin yalnızca "literal var
     mı" ölçer, anahtar adının NE olduğunu değil — canlı manifestten okuyor, rename'e karşı bağışık
     olması TASARIM, sessiz-yeşil kaçağı DEĞİL)
   - `storefront-tenant-context.test.ts:19`'daki hardcoded `styleText` literali — **YEŞİL kaldı**
     (bu test sentetik bir mock kullanıyor, `generateThemeCss`'i hiç ÇAĞIRMIYOR — gerçek temayı
     doğrulama iddiası TAŞIMIYOR, dosya başı yorumunda da bu açık: "middleware'in ZATEN çözümlediği
     değerleri TAŞIR". Sessizce yeşil kalan bir KAÇAK değil, kapsamı dışı.)
   Geri alındı, `shasum` **birebir** eşleşti (`d38e3fdb…`). Revert sonrası
   `themes-modern test` (5/5) ve `storefront test` (122/122) yeniden yeşil.

**Sonuç: AC3'ün pin'inde sessizce yeşil kalan bir yol bulunamadı.** `solid`'in iddiası (dört sapma
yolu, hepsi kırmızı) bağımsız olarak doğrulandı; iki ek "yeşil kalan" dosya (`theme-css-no-literal-
keys.test.ts`, `storefront-tenant-context.test.ts`) incelendi ve ikisinin de **kapsamı dışı**
olduğu (farklı bir şey ölçüyorlar) gerekçelendirildi — bunlar bir kaçak değil.

### İŞ 4 — EKSİK SENARYO TARAMASI + YAZILAN TESTLER

| Senaryo (handoff'ta işaretli) | Ölçüm | Sonuç |
| --- | --- | --- |
| `theme_id` dolu, `theme_version` `null` (veya tersi) — uygulama katmanı ne yapıyor? | Kod okundu (`middleware.ts:230-236`), **hiçbir test yoktu** (ölçüldü — `grep` ile doğrulandı) | **BULGU yazıldı** (low) + **3 yeni test eklendi** (`middleware.test.ts`), ikisi de mutasyon kanıtlı (aşağıda) |
| Bilinmeyen `themeId` + bilinen `themeVersion` (ve tersi) → ikisi de 503 mü? | `registry.test.ts` zaten iki ayrı test taşıyor: "bilinmeyen themeId" (satır 27) ve "bilinmeyen themeVersion, bilinen id" (satır 33) — İKİSİ de `ThemeResolutionError`/503'e düşüyor, ayrı ayrı doğrulanmış | Zaten kapsanmış, ek test gerekmedi |
| Boş dize (`themeId: ''`) → `null` gibi mi, yoksa "bilinmeyen tema" mı? CHECK boş dizeyi engellemiyor | Kod okundu + **hiçbir test yoktu** | **1 yeni test eklendi**, mutasyon kanıtlı — sonuç: `''` `null` SAYILMIYOR (`!== null` doğru), `resolveTheme({'',''})` `"@"` anahtarını arıyor, bulamıyor, 503 veriyor |
| `/404`/`/503` sayfalarında tema — kiracısız render ediliyor mu, `undefined` erişimi var mı? | `404.astro`/`503.astro` okundu — `Astro.locals`/`theme` **hiç okunmuyor**, mekanik pin de (İş 2) diff boş olduğunu doğruluyor | Gap değil — doğrulandı |
| `TenantGreeting` (`client:idle`) tema değişikliğinden sonra hidratlanıyor mu? | `e2e/storefront-host.spec.ts:285` (aynı `index.astro`, aynı koşumda tema render EDİLİRKEN) iki kez koşturuldu, ikisinde de `data-hydrated="true"` ✅ | Ölçüldü, gap değil |
| İki farklı kiracı isteği aynı `styleText` referansını mı alıyor? | `registry.test.ts:58` (`toBe` kimlik testi) — aynı seçimle iki ÇAĞRI aynı referansı döndürüyor; bu sürümde kayıtta TEK tema olduğu için "iki farklı kiracı" aynı anahtara düştüğünde YAPISAL OLARAK aynı sonuç — registry seviyesindeki kimlik testi doğru abstraksiyon | Yeterli ölçüldü, ek test gereksiz (ikinci bir tema eklenmeden "farklı kiracı, farklı anahtar, aynı referans" iddiası zaten test edilemez — v0.3.0'ın sınırı) |

**Yazılan testler** (`apps/storefront/src/lib/__tests__/middleware.test.ts`, 3 yeni `it`):
1. `themeId` dolu/`themeVersion` `null` → "seçim yok" dalına düşer (200, varsayılan tema) — **mutasyon kanıtlı**: middleware'e asimetrik-çift-için-503 mantığı eklenip test KIRMIZI olduğu, sonra geri alınıp YEŞİL olduğu doğrulandı.
2. `themeId` `null`/`themeVersion` dolu (ters asimetri) → aynı dal — aynı mutasyonla **kanıtlandı**.
3. İkisi de boş dize → 503 (CHECK boş dizeyi engellemiyor ama `resolveTheme` bilinmeyen anahtar olarak reddediyor) — **mutasyon kanıtlı**: middleware'e boş-dizeyi-null'a-normalize-et mantığı eklenip test KIRMIZI olduğu, geri alınıp YEŞİL olduğu doğrulandı.

Üçü de gerçek koda karşı koşturuldu (`pnpm --filter @arkesoft/storefront test`), 125/125 yeşil;
mutasyon sonrası sayılar yukarıdaki `pnpm test` (2. koşum) satırına yansıdı (1018 toplam).

### İŞ 5 — KASITLI BOZMA (dört senaryo, hepsi tek tek ölçüldü ve geri alındı)

1. **`resolveTheme()`'in tam eşleşmesi gevşetildi** (sürüm yoksayıldı, yalnızca `themeId`'ye göre ilk
   eşleşen girdi) → `registry.test.ts`'in **2 testi KIRMIZI** oldu ("bilinmeyen themeVersion" ve
   "aralık/major çözümlemesi yapılmaz" testleri). **BULGU DEĞİL** — ADR-0002 Karar 2 korumasız
   değil, testler gerçekten yakalıyor. Geri alındı, `shasum` eşleşti (`4799fc66…`).
2. **`DEFAULT_THEME_SELECTION` var olmayan bir temaya (`hayali-tema@9.9.9`) çevrildi** →
   `pnpm --filter @arkesoft/storefront typecheck` **derleme hatası** verdi
   (`TS2322: Type '"hayali-tema@9.9.9"' is not assignable to type '"modern@0.1.0"'`). ADR-0002
   Karar 5 iddiası ("var olmayan temaya işaret etmek derleme hatası olmalı") **doğrulandı**. Geri
   alındı, `shasum` eşleşti.
3. **`middleware.ts`'in "seçim yok→varsayılan" dalı "seçim yok→503" yapıldı** →
   `middleware.test.ts`'in **4 testi KIRMIZI** oldu (iki başarılı-çözümleme testi + iki "seçim yok"
   testi — hepsi artık 503 görüyordu, 200/`locals.tenant` beklerken). İş kuralı md 8 ("vitrin
   404/503 vermez") korumalı. Geri alındı, `shasum` eşleşti (`e01df39d…`).
4. **CHECK kısıtı migration'dan kaldırıldı** → `migration-sql.test.ts`'in ilgili testi **KIRMIZI**
   oldu (`expected false to be true`). Geri alındı — bu dosya git'te **takip edilmiyor** (henüz
   commit edilmemiş yeni dosya), `git checkout` ÇALIŞMADI; içerik elle orijinaline **birebir**
   yeniden yazıldı ve `shasum` ile doğrulandı (`d13d67a1…`, önce/sonra birebir eşleşti).

**Dördünün de testleri YAKALADI — "hiçbiri kırmızı değil" durumu hiçbir senaryoda gerçekleşmedi,
BULGU gerekmiyor.**

### FLAKY KONTROLÜ

`pnpm test` iki kez (mutasyon öncesi/sonrası, farklı dosya durumlarıyla), `pnpm --filter
@arkesoft/storefront test:e2e` iki kez (birebir aynı 14/14, aynı sıra, karşılaştırılabilir
süreler: 5.2s → 5.1s) koşturuldu. Hiçbir testte farklı sonuç gözlenmedi. Flaky davranış
**gözlenmedi**.

### TEMİZLİK

- `pgrep -fl 'astro dev'` → boş (exit 1)
- `lsof -i :3000` / `:4321` → boş (exit 1), `apps/api` arka plan süreci elle sonlandırıldı
- `apps/storefront/test-results/` (Playwright'ın ürettiği geçici klasör) silindi
- `git status --porcelain` — bu gate'in dokunduğu TEK üretim/test dosyası
  `apps/storefront/src/lib/__tests__/middleware.test.ts` (3 yeni test eklendi); mutasyon
  denemelerinin HİÇBİRİ kalıcı değişiklik bırakmadı (hepsi `shasum`/elle yeniden yazma ile
  doğrulanarak geri alındı)

### ÖLÇEMEDİĞİM

- `pnpm test:contract`, `pnpm test:visual` — bu sürümde komutlar yok, koşturulmadı.
- CI'daki Playwright koşumu — R6/v0.0.19 kısıtı nedeniyle CI'a giremiyor, yalnızca **yerel**
  koşumla doğrulandı (iki kez, flake yok) — görsel/piksel karşılaştırması bu sürümde zaten
  kapsam dışı (R2).
- `wcag`/`perf` gate'leri — bu turda koşmuyor (görev tanımında açıkça belirtilmiş, sonraki turlar).
