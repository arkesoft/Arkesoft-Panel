# T-009 — QA Gate, Tur 1

Tarih: 2026-11-02 · Sürüm: v0.0.8

```
GATE: qa
SONUÇ: PASS
```

## BULGULAR

- [SEV: medium] `apps/storefront/e2e/storefront-host.spec.ts:96-101` ve `:193-201` — M4 **DOĞRULANDI** (çürütülmedi). AC5 ve AC14/AC15'in bilinmeyen-host testleri yalnızca `response.status()`'u ölçüyor, gövdeyi hiç okumuyor. Sınıf: *"regresyon durumu doğru bıraktı, gövdeyi 'Loop Detected' yaptı"* senaryosuna **yapısal olarak kör** — status assertion'ı her iki durumda da (doğru Türkçe 404.astro VEYA Astro'nun "Loop Detected" düz metni + kazara doğru durum kodu) yeşil kalır. Düzeltme: `toContain(MESSAGES.storefront.notFound.heading)` + `not.toContain('Loop Detected')` (AC5), 503 yolu için `MESSAGES.storefront.unavailable.heading` + `not.toContain('Loop Detected')` eşdeğeri. Sorumlu ajan: **qa** (bu dosyanın sahibi, S9).
- [SEV: low] Aynı sınıfın **ikinci ama daha hafif** örneği: `apps/storefront/e2e/storefront-host.spec.ts:122-135` (AC6 bayt-bayt eşitlik testi) iki host'un durum/gövde/cache-control'ünün **birbirine göre** eşit olduğunu ölçüyor, ama **hangi** gövdeye eşit olduklarını (gerçek Türkçe 404.astro mu, yoksa ikisi de "Loop Detected" mi) ölçmüyor. Bugün middleware.ts düzeltmesi sayesinde doğru içerik üretiliyor (bağımsız doğrulandı, bkz. ÖLÇÜMLER), ama test bu ayrımı **yapısal olarak** yapamaz — regresyon ikisini de aynı yanlış gövdeye düşürse test yine yeşil kalır. Önerilen düzeltme: testin içine `expect(await softDeletedResponse.text()).not.toContain('Loop Detected')` eklemek (M4'ün düzeltmesiyle **aynı dosya, aynı tur** — AGENT_BASELINE §4 istisnası kapsamında, ayrı tur açılmaz). Sorumlu ajan: **qa**.
- [SEV: low] `apps/storefront/src/lib/__tests__/storefront-server-fetch.test.ts:121-131` — abort-sinyali testi `.rejects.toBeDefined()` kullanıyor; red sebebinin **içeriğini** (örn. `AbortError`/mesaj) doğrulamıyor, herhangi bir reddetme ile geçer. AC'ye doğrudan eşlenmiyor (iç uygulama detayı), borç olarak not edildi. Sorumlu ajan: **frontend**.

Diğerleri (`/503` mutasyon boşluğu, doğrudan `GET /404`/`/503` kapsamı, normalizasyon sapması vakası) **madde 2/3** altında değerlendirildi — bulgu olarak değil, **karar** olarak aşağıda kayıtlı.

## KARARLAR (madde 2–4)

**M4'ün sınıfı başka nerede var? (somut cevap: 716 birim testinin TAMAMI + 11 e2e'nin TAMAMI tek tek tarandı)**
Taranan dosyalar: `map-api-error.test.ts` (saf fonksiyon, mock yok — temiz), `middleware.test.ts` (re-entrancy harness GERÇEK Astro `state.counter` eşiğini simüle ediyor, `not.toContain('Loop Detected')` İÇERİYOR — M4 düzeltme turu 1'de buraya zaten eklenmiş), `cache-policy.test.ts` (fonksiyon koşulsuz tek atama, test tautolojik değil çünkü dallanma yok), `api-client.test.ts`/`request-origin.test.ts`/`storefront-tenant-context.test.ts` (içerik-spesifik, `toEqual`/`toContain` ile), `trpc-cross-tenant.isolation.test.ts` (bayt düzeyinde çapraz sızıntı kontrolü var), `trpc-storefront-tenant-read-port-adapter.test.ts` (`toEqual({name:...})` tam alan kümesi). **Sonuç: M4 sınıfının e2e'deki iki örneği (AC5, AC14/15) zaten bilinen bulgu; üçüncü, daha hafif bir örnek AC6'da bulundu (yukarıda, low); birim testlerinde yeni örnek YOK.**

**AC1–AC20 → test → seviye → örtüşme** (AC19/AC20 PM'in 20 kriterinde var, handoff "18" diyor ama dosya 20 listeliyor — isim çakışması not edildi, kapsamı etkilemiyor):

| AC | Test | Seviye | Örtüşüyor mu |
| -- | ---- | ------ | ------------ |
| AC1 | elle ölçüm (`dist/server/entry.mjs` var, `dist/index.js` yok) | build artefaktı | Evet |
| AC2 | `storefront-host.spec.ts` JS kapalı/açık (70-250) | e2e | Evet |
| AC3 | elle mutasyon (Tailwind sınıfı kaldır/geri al) | build | Evet |
| AC4 | `storefront-host.spec.ts:71-85` (mutasyon kanıtlı) | e2e | Evet |
| AC5 | `storefront-host.spec.ts:96-101` | e2e | **Kısmi — M4** |
| AC6 | `storefront-host.spec.ts:122-135` | e2e | **Kısmi — ek low bulgu** |
| AC7 | `storefront-host.spec.ts:149-158` | e2e | Evet |
| AC8 | `storefront-host.spec.ts:217-223` + `middleware.test.ts` | e2e+birim | Evet (AC8 metni gövde istemiyor) |
| AC9 | yapısal (apps/api altında resolve-host.ts/reserved-subdomains.ts YOK, elle doğrulandı) | yapısal | Evet |
| AC10/AC11 | eslint `no-restricted-imports` (K14) + manifest (`@arkesoft/db` dependency'de yok) | lint + yapısal | Evet |
| AC12 | `auth-exempt-paths.test.ts` (`.size===10` + küme eşitliği) | birim | Evet |
| AC13 | `trpc-http.test.ts:340-368` + port-adapter testi (`toEqual({name})`) | entegrasyon | Evet |
| AC14/AC15 | `storefront-host.spec.ts:160-201` | e2e | **Kısmi — robots/sitemap custom-domain içerik ölçülüyor, bilinmeyen host yalnızca status (M4 ile aynı dosyada)** |
| AC16/AC17 | `cache-policy.test.ts` + `no-store-headers.test.ts` 6/6 | birim+entegrasyon | Evet |
| AC18 | `no-store-headers.test.ts` 6/6 (bağımsız doğrulandı) | entegrasyon | Evet |
| AC19 | `pnpm test` → 716 (≥634) | komut | Evet, bağımsız doğrulandı |
| AC20 | `ci.yml:970-989` storefront job'u (lint→typecheck→test→build) | CI | Komut çalıştırılmadı (CI'da), dosya varlığı handoff'ta doğrulanmış kabul edildi |

**`/503` mutasyon boşluğu — BAĞIMSIZ DOĞRULANDI.** `middleware.ts:142`'deki `|| context.url.pathname === '/503'` koşulu kaldırılıp storefront birim testleri koşturuldu: **61/61 hâlâ yeşil**. Mutasyon geri alındı (`diff` ile `IDENTICAL` doğrulandı). **Karar: bu gerçek bir kapsam boşluğu** — hiçbir test `/503` erken-çıkış dalını `/404`'ten ayırt etmiyor. Doğrudan `GET /404`/`GET /503` testi de yok (grep: 0 eşleşme). Bu zaten `frontend`'e atanmış — qa burada yalnızca **kapsamı** teyit ediyor, düzeltmiyor. **SEV önerisi (kayıt için): low** — çünkü AC8/AC5/AC6 fonksiyonel sonucu (durum kodu) hâlâ doğru ölçülüyor, yalnızca "hangi branch'ten geçti" ayrımı test edilmiyor; davranış hatası üretmiyor.

**Normalizasyon sapması vakası (security-B, `low`) — e2e'de OLMASI GEREKMİYOR (karar).** Gerekçe: (1) sonuç cross-tenant veri sızıntısı değil — çift-nokta girdisi `demo-magaza` kiracısına (zaten herkese açık, anonim) düşüyor, başka bir kiracının verisini açığa çıkarmıyor; (2) security zaten `low` olarak kayda geçirdi; (3) bu sürümün e2e'si ROADMAP'in kabul kriterini (AC4-AC8) kapsıyor, bu vaka hiçbirinde yok. Tekrarlayan bir güvenlik sınıfı değil, tek seferlik host-normalizasyon kenar durumu — **ROADMAP teknik borcuna** düşsün, ayrı e2e testi gerekmiyor.

## ÖLÇÜMLER

KABUL KRİTERİ EŞLEMESİ: yukarıdaki tablo (AC1–AC20).

TEST SAYILARI: yeni eklenmedi (qa bu turda test yazmadı — kod düzeltmedi) · toplam geçen **716** birim/entegrasyon (api 312 · db 166 · storefront 61 · errors 48 · tenancy 37 · admin 37 · trpc 32 · ui 23) · toplam başarısız **0** · test:isolation **18/18** (9 dosya) · e2e **11/11**.

KOŞTURULAN KOMUTLAR:
- `pnpm lint` → exit 0 → 19/19 paket yeşil
- `pnpm typecheck` → exit 0 → 19/19 paket yeşil
- `pnpm build` → exit 0 → 13/13 paket yeşil
- `pnpm format:check` → exit 0 → "All matched files use Prettier code style!"
- `pnpm test` → exit 0 → 716/716 (bağımsız koşum, yukarıdaki dağılım)
- `pnpm test:isolation` → exit 0 → 18/18 (api 4 + diğer paketler cache'ten 14)
- `apps/api`: `npx vitest run src/__tests__/shutdown.test.ts` × 5 → **5/5 koşum yeşil** (borç 1461 bağımsız doğrulandı, flaky değil)
- `apps/storefront`: `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AI_AGENT APP_BASE_DOMAIN=arkesoft.localhost STOREFRONT_API_BASE_URL=http://127.0.0.1:3000 npx playwright test` → **11/11 yeşil** (bağımsız koşum)
- Mutasyon denemesi: `middleware.ts:142`'den `'/503'` dalı kaldırıldı → `pnpm --filter @arkesoft/storefront test` → **61/61 hâlâ yeşil** (boşluk doğrulandı) → `perl` ile değişiklik geri alındı, `diff` ile orijinalle **IDENTICAL** teyit edildi, `git status --short` çalıştırıldı (dosya zaten `??` untracked, mutasyon öncesi/sonrası fark yok)
- `rg test.skip|it.skip|test.only|it.only|test.todo|it.todo|xdescribe|xit\(` → T-009 kapsamında **0** aktif susturma (yalnızca `migration-sql.test.ts`'teki önceden var olan platform-koşullu `skipIf` ve `apps/admin` spec'indeki tarihsel yorum satırları — T-009 dışı)
- `pnpm audit`, `dist` sır taraması, `wcag`/`perf` işleri → **koşulmadı** (görev kapsamı dışı, talimatla yasak)

## SONUÇ

Bulgu dağılımı: critical 0 · high 0 · medium 1 · low 2. AGENT_BASELINE §4 kuralına göre (1-2 medium → PASS, bulgular borca kaydedilir):

**SONUÇ: PASS**

Not: `medium` bulgu (M4) zaten önceki turda `solid` gate'i tarafından bulunup `qa`'ya atanmıştı; bu turda tekrar sayılmadı, yalnızca doğrulandı. Toplam açık `medium` = 1, `low` = 2 → eşik aşılmadı, düzeltme turu bu gate'ten **açılmıyor**; M4'ün kendi düzeltmesi zaten Orkestratör tarafından ayrıca yönlendirilmiş durumda.
