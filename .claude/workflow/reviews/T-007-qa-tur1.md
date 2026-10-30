# T-007 — QA Gate, Tur 1

Tarih: 2026-10-30
Sürüm: ROADMAP v0.0.6 (tRPC sözleşme katmanı)

GATE: qa
SONUÇ: PASS

---

## 1. Kabul kriteri → test eşlemesi

| AC     | Ölçüm (Task metni, özet)                                                                                                                                    | Kapsayan test(ler)                                                                                                          | Kendi koşumum                                                                                                                                                                                                                                                 | Karar                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| AC1    | `pnpm --filter @arkesoft/trpc test` exit 0, ≥1 dosya, 0 başarısız                                                                                           | `packages/trpc/src/__tests__/*.test.ts` (6 dosya)                                                                           | exit 0, 24/24 (2 kez üst üste)                                                                                                                                                                                                                                | **KARŞILANDI**                                                                                      |
| AC2    | `expectTypeOf…toEqualTypeOf` — `tenant.current` çıktısı tel tipine                                                                                          | `router-output.test-d.ts` (literal şekil)                                                                                   | `pnpm --filter @arkesoft/trpc test` içinde `Type Errors no errors`                                                                                                                                                                                            | **KARŞILANDI**                                                                                      |
| AC3    | Tenant'sız istek → `UNAUTHORIZED`/401                                                                                                                       | `procedures.test.ts` (AC3 bloğu)                                                                                            | Geçti; **ayrıca** `appErrorBoundary`'yi eski (buggy) desene geri alıp bu testin KIRILDIĞINI bizzat gözledim (bkz. §2.1)                                                                                                                                       | **KARŞILANDI**                                                                                      |
| AC4    | Mutasyon A/B kanıtı; literal şekil (totoloji karşıtı)                                                                                                       | `router-output.test-d.ts`                                                                                                   | **Mutasyon A'yı bizzat tekrarladım** (`name` alanını sildim) → `TypeCheckError` + runtime `toEqual` hatası, exit≠0, geri aldım, `git diff` boş doğrulandı (bkz. §2.3). Mutasyon B S4'ün raporuna güvenilerek kabul edildi (DoD yalnızca A'yı zorunlu kılıyor) | **KARŞILANDI**                                                                                      |
| AC5    | `createTrpcClient()` ile gerçek uygulamaya `session.me`, `as`/`any` yok                                                                                     | `trpc-http.test.ts` AC5 bloğu                                                                                               | Geçti (`pnpm test` içinde)                                                                                                                                                                                                                                    | **KARŞILANDI**                                                                                      |
| AC6    | Üyeliksiz kullanıcı → 403 `TENANT_MEMBERSHIP_REQUIRED`, gövde/başlıkta kimlik yok, log'da `tenantId(B)` var                                                 | `trpc-cross-tenant.isolation.test.ts`                                                                                       | Geçti (`pnpm test` + `pnpm test:isolation`)                                                                                                                                                                                                                   | **KARŞILANDI**                                                                                      |
| AC7    | `session.me` anahtar kümesinde token/password/hash/secret yok                                                                                               | `trpc-http.test.ts` AC7 bloğu                                                                                               | Geçti                                                                                                                                                                                                                                                         | **KARŞILANDI**                                                                                      |
| AC8    | Bağımlılık yönü — `packages/trpc/src` içinde `apps/`/`@arkesoft/api`/`@arkesoft/db` import'u 0                                                              | grep (kod satırları) + `no-restricted-imports` (`packages/trpc/eslint.config.mjs`, `files:['src/**/*.ts']` — testler dahil) | Bağımsız grep: 0 gerçek import, yalnızca yorumlarda geçiyor (kapsam: yorum, bulgu değil)                                                                                                                                                                      | **KARŞILANDI**                                                                                      |
| AC9(a) | `packages/trpc/src` içinde domain hatası alt sınıfı/`instanceof` 0 eşleşme                                                                                  | grep                                                                                                                        | 0 (yorumlarda "sınıf-örneği operatörü" bahsi var, kod değil)                                                                                                                                                                                                  | **KARŞILANDI**                                                                                      |
| AC9(b) | Tek doğruluk kaynağı — test-yerel `AppError` alt sınıfı (`ProbeDetailsError`) her iki yüzeyde `details` yansır, `error-mapping.ts`/`packages/trpc` değişmez | `trpc-http.test.ts` AC9(b)+AC10 bloğu                                                                                       | Geçti; `git diff` ile `packages/errors`/`packages/trpc/src`/`apps/api/src/errors` boş doğrulandı                                                                                                                                                              | **KARŞILANDI** (bkz. §2.2 — kapsam notu)                                                            |
| AC10   | Aynı domain hatası HTTP + tRPC'den birebir aynı gövde, `requestId` dolu                                                                                     | `trpc-http.test.ts` aynı blok                                                                                               | Geçti                                                                                                                                                                                                                                                         | **KARŞILANDI**, medium bulgu (§2.2) — test kurulumu gerçek Nest guard/controller zincirinin DIŞINDA |
| AC11   | Paketin kendi testi art arda iki koşumda aynı sayı, Redis/Postgres yok                                                                                      | `pnpm --filter @arkesoft/trpc test` × 2 (benim koşumum) + grep                                                              | 24/24, 24/24; `grep "redis                                                                                                                                                                                                                                    | ioredis                                                                                             | postgres | prisma | @arkesoft/db"` → 0 | **KARŞILANDI** |
| AC12   | Yeni `apps/api` testleri `platform:auth:*` önekine yazmıyor                                                                                                 | grep (kod satırları)                                                                                                        | 0 eşleşme kod satırında (1 eşleşme yalnızca açıklayıcı yorumda)                                                                                                                                                                                               | **KARŞILANDI**                                                                                      |
| AC13   | `/trpc/tenant.current` log kaydında `requestId` + `tenantId` dolu                                                                                           | `trpc-http.test.ts` AC13 bloğu                                                                                              | Geçti                                                                                                                                                                                                                                                         | **KARŞILANDI**                                                                                      |
| AC14   | Zorunlu kapı: lint+typecheck+test+test:isolation+build yeşil + format:check temiz, `pnpm test` ≥518+yeni                                                    | Tüm komutlar                                                                                                                | lint 16/16, typecheck 16/16, build 12/12, test 48+24+166+320=**558/558**, test:isolation 14+2=**16/16**, format:check T-007 kapsamında temiz (bkz. §4 not)                                                                                                    | **KARŞILANDI**                                                                                      |

ROADMAP'in kendi üç kriteri (AC1–AC3): üçü de yukarıda ayrı ayrı doğrulandı, **karşılanıyor**.

Karşılıksız AC yok.

---

## 2. Üç özel dikkat maddesinin bağımsız değerlendirmesi

### 2.1 `appErrorBoundary` düzeltmesi gerçekten çalışıyor mu?

Kendi koşumumla doğruladım:

- `pnpm --filter @arkesoft/trpc test` → 24/24, `AC3` ve `TenantReadPort totalliği` testleri **gerçek** `appRouter` üzerinden 401/404 gözlemliyor.
- **Kasıtlı bozma 1:** `appErrorBoundary`'yi S4'ün orijinal (buggy) `try/catch` desenine geri çevirdim → `AC3` testi `'INTERNAL_SERVER_ERROR'`/500 ile, `TenantNotFoundError` testi de aynı şekilde **kırmızı** oldu (tam S4'ün orijinal bulgusunun tekrarı). Dosyayı bozulmamış hâline geri aldım, `diff` ile doğruladım, tekrar 24/24.
- **Kasıtlı bozma 2 (ek, kendi başlattığım):** "bizim değilse olduğu gibi yeniden fırlat" satırını (`throw result.error`) `return result`'a çevirdim (yani non-AppError hatayı yutup `{ok:false}` sonucu döndürmeyi simüle ettim). **Sonuç: 24/24 test YİNE geçti** — bu dal için `throw` ile `return` arasında gözlemlenebilir bir fark YOK; bu tRPC sürümünde üst seviye `callRecursive` her iki temsili de aynı şekilde işliyor. Dosyayı geri aldım.
  - **Sonuç:** Kritik bulgunun asıl regresyon koruması `AC3` + `TenantNotFoundError` testlerinden geliyor (ikisi de gerçek, totolojik değil — bozulma 1 ile kanıtlandı). "Non-AppError'ı olduğu gibi yeniden fırlat" dalının **kendisi** için ayırt edici bir test yoktu (S3'ün prob testi silinmişti); ben kalıcı bir eşdeğer yazdım (`app-error-boundary-non-app-error.test.ts`) ama bu da (bozulma 2'nin gösterdiği gibi) throw/return farkını AYIRT ETMİYOR — yalnızca "sızdırmazlık + tek zarf" davranışını PİNLİYOR. Bu, gerçek bir regresyon riski değil (iki temsil de doğru sonucu üretiyor), ama "S3'ün sildiği prob testinin eşdeğerinin asla yazılmadığı" iddiasını netleştiriyor. **Bulgu: düşük/bilgilendirici**, aşağıda kayıtlı.
- `result.error.cause` bizim olmadığı durum (bilinmeyen prosedür, bozuk `cause`): `error-formatter.test.ts` 5 testle (sızdırmazlık, `NODE_ENV` bağımsızlığı, `warn` asimetrisi gözlemi) kapsıyor — geçti, bağımsız okudum, doğru.

**Sonuç:** Düzeltme gerçekten çalışıyor; AC3/AC9(b)/AC10 düzeltme ÖNCESİ kırmızı, SONRASI yeşil olduğunu bizzat gördüm.

### 2.2 S6'nın AC9(b)/AC10 kurulumu meşru mu?

**Kısmen — AC10'un "aynı gövde" iddiasını kanıtlıyor, ama gerçek HTTP yolunun kablolamasını ÖLÇMÜYOR.**

`trpc-http.test.ts`'in AC9(b)+AC10 testi tRPC yüzeyini `createTrpcRequestHandler()`'ı elle kurulmuş bir `TrpcContext` ile **doğrudan** çağırarak test ediyor — `TrpcController.handle()`, `trpc-context.factory.ts`, DI ile enjekte edilen gerçek `TenantReadPortAdapter`/`TrpcErrorsPortAdapter`, ve guard zinciri (`SameOriginGuard`, `AuthGuard`, `TenantGuard`) bu testin **dışında** kalıyor.

Somut kapsanmayan senaryo: _"gerçek bir `/trpc` HTTP isteği, gerçek `TrpcController.handle()`'a ulaşır, gerçek `createTrpcContext()` RequestContext'ten gerçek bir auth/tenant durumu okur, DI ile enjekte edilmiş **gerçek** bir port adaptörü (örn. `TenantReadPortAdapter`) bir `AppError` fırlatır, ve bu hata gerçek `errorFormatter`/`appErrorBoundary` zincirinden geçip doğru `AppErrorBody`'ye dönüşür"_ — bu uçtan uca hiçbir testte gözlenmiyor.

Bunun nedenini araştırdım: v0.0.6'nın kapsamında, gerçek bir `/trpc` isteği üzerinden bir resolver'ın (`TenantReadPortAdapter`) gerçekten bir `AppError` fırlatmasını tetikleyecek **tek** yol, host çözümlemesi (`TenantGuard`) ile `TrpcController`'ın kendi okuması arasındaki **soft-delete yarışı**dır — ve bu yarış host seviyesinde ZATEN filtrelendiği için (`TenantResolverService`, v0.0.4) deterministik bir HTTP testiyle tetiklenemez. Bu yüzden S6'nın (ve benim ilk aday çözümümün) bu senaryoyu TAM HTTP turu ile test etmesi mümkün değil.

**Yaptığım:** `TenantReadPortAdapter`'ın GERÇEK (DI ile kurulmuş, gerçek Postgres'e bağlı) sınıfını `app.get()` ile alıp **doğrudan** çağıran bir test yazdım (`apps/api/src/__tests__/trpc-tenant-read-port-adapter.test.ts`) — bu, gerçek üretim sınıfının `deletedAt: null` koşulunu doğru uyguladığını kanıtlıyor, ama hâlâ `TrpcController`/`trpc-context.factory.ts`/gerçek `errorFormatter` zincirini atlıyor.

**Sonuç:** AC10'un "iki yüzey aynı gövde" iddiası **yapısal olarak** güvenilir (her iki yüzey de `@arkesoft/errors`'un AYNI `toErrorBody`/fabrikalarını çağırıyor — kopya literal yok, S2/S3'ün kararı) ve S6'nın testi bunu doğru ölçüyor. Ama "gerçek Nest kablolaması bir domain hatasını doğru ilettiği" iddiası **hiçbir testte uçtan uca gözlenmiyor** — bu, **mimari bir kör nokta**, kapatmak bu turun sınırları içinde mümkün değildi (deterministik tetikleyici yok). **Bulgu: medium, AÇIK** (aşağıda kayıtlı, sorumlu: backend — ilk girdili/mutasyon prosedürü eklendiğinde veya bilinçli bir hata-enjeksiyon mekanizması tasarlandığında kapanabilir).

### 2.3 AC4'ün mutasyon kanıtları gerçek mi?

**Mutasyon A'yı bizzat tekrarladım:**

```
packages/trpc/src/schemas/tenant-summary.schema.ts içinde `name: z.string(),` satırı SİLİNDİ
→ pnpm --filter @arkesoft/trpc test
→ FAIL: procedures.test.ts (runtime `toEqual` — fazladan alan artık harness sabitinde var ama şemada yok)
→ FAIL: router-output.test-d.ts (TypeCheckError — 'name' alanı eksik)
→ exit code ≠ 0 (ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL)
→ dosya `cp` ile GERİ ALINDI, `diff` ile BİREBİR aynı olduğu doğrulandı
→ tekrar 24/24 yeşil
```

**`router-output.test-d.ts`'in literal olduğu doğrulandı:** dosya `expectTypeOf<RouterOutputs['tenant']['current']>().toEqualTypeOf<{id:string; slug:string; name:string; status:...; primaryDomain:string|null}>()` ile **literal bir obje tipi** yazıyor (satır 39-45), `tenantSummarySchema`'dan `z.infer` ile TÜRETİLMİYOR. Şemadan türetilen ayrı bir ikinci test (satır 48-54) "export belgesi" olarak AÇIKÇA ayrı tutuluyor — bu doğru tasarım, totoloji riski yok. Mutasyon A'nın literal testi kırdığını bizzat gözlemledim (yukarıdaki repro) — **iddia doğrulandı, totolojik DEĞİL**.

Mutasyon B (`typecheck.enabled:false` → sessizce geçer) bizzat tekrarlanmadı — Task'ın Tamamlanma Tanımı yalnızca Mutasyon A'yı zorunlu kılıyor; S4'ün raporuna (kendi içinde tutarlı, S1'in spike'ında da aynı davranış bağımsız gözlenmiş: "yanlış assert `TypeCheckError` ile kırmızı; `typecheck` kapatılınca sessizce geçer" örüntüsü) güvenildi.

---

## 3. Bilinen borçların ayırt edilmesi

Üç tam `pnpm test` koşumu (+ ek koşumlar, toplam 6 tam koşum) ve 4 `pnpm --filter @arkesoft/trpc test` koşumunda:

- **`platform:auth:*` Redis sızıntısı (v0.0.5 borcu):** hiç tetiklenmedi.
- **`.vitest-cache` ENOTEMPTY yarışı (yeni borç, v0.0.6'nın ürünü değil):** hiç tetiklenmedi.
- **`shutdown.test.ts` flaky'liği (T-002 borcu):** hiç gözlenmedi (her koşumda geçti).

Düşüş yok — S1/S2/S5/S6'nın "hiç tetiklenmedi" iddiası benim koşumlarımla da tutarlı.

---

## 4. Eksik negatif senaryolar — bulundu ve QA tarafından kapatıldı

Task'ın "AYRICA DENETLE" listesini tek tek denetledim:

| Senaryo                                                          | Önceki durum                                                                                                                                                                                          | Yapılan                                                                                                                                                                       |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bozuk JSON gövdesi                                               | v0.0.6'da hiçbir mutasyon/girdili prosedür yok → gövde okuyan hiçbir yol yok. **Geçerli değil** (architect'in bilinçli kapsam dışı kararı, risk 7)                                                    | Test YAZILMADI — kapsam dışı olduğu teyit edildi                                                                                                                              |
| Bilinmeyen prosedür adı                                          | `packages/trpc` hermetik seviyede test ediliyordu (`error-formatter.test.ts`)                                                                                                                         | Yeterli — ek test gerekmedi                                                                                                                                                   |
| `GET` yerine `POST`                                              | **Hiçbir testte yoktu**                                                                                                                                                                               | **YAZILDI**: `packages/trpc/src/__tests__/transport-negative.test.ts` — `POST /trpc/session.me` 2xx DEĞİL, sızdırmaz                                                          |
| Batched istek (`allowBatching:false`)                            | **Hiçbir testte yoktu** — ADR-0009 madde 8'in "bağlayıcı güvenlik değişmezliği" dediği mekanizma SIFIR test kapsamındaydı                                                                             | **YAZILDI**: aynı dosya — `?batch=1` isteği 400 BAD_REQUEST ile reddediliyor, sızdırmaz, tek-istek senaryosu yanlış pozitif üretmiyor (kontrol testi dahil)                   |
| `publicProcedure`'ün HTTP'den erişilemezliği                     | `appRouter`'ın kendisi (`routers/app.router.ts`) yalnızca `session`/`tenant` router'larını mount ediyor — `publicProcedure` hiçbir yere BAĞLANMAMIŞ. **Yapısal garanti**, dosyayı okuyarak doğrulandı | Ek test gerekmedi (mimari zaten kanıtlıyor, S6'nın muafiyet kümesi regresyon testleriyle de tutarlı)                                                                          |
| `tenant.current`'ın `deletedAt:null` koşulu (soft-delete yarışı) | **Hiçbir testte yoktu** — `TenantReadPortAdapter.findSummary()`'nin KENDİ sorgusu hiç gerçek DB ile test edilmemişti (yalnızca sahte port/host-seviyesi resolver testi vardı)                         | **YAZILDI**: `apps/api/src/__tests__/trpc-tenant-read-port-adapter.test.ts` — gerçek DI'lı adaptör, gerçek Postgres, soft-delete sonrası `TenantNotFoundError` + sızdırmazlık |
| `appErrorBoundary`'nin "bizim değilse yeniden fırlat" dalı       | S3'ün prob testi SİLİNMİŞTİ, kalıcı eşdeğer yoktu                                                                                                                                                     | **YAZILDI**: `packages/trpc/src/__tests__/app-error-boundary-non-app-error.test.ts` (bkz. §2.1 — regresyon ayırt ediciliği sınırlı ama sızdırmazlık pini olarak değerli)      |

Üç yeni test dosyası eklendi, hiçbir üretim/mevcut test dosyası değiştirilmedi. Toplam +6 test (`packages/trpc`: +3 transport-negative, +1 non-app-error; `apps/api`: +2 soft-delete).

---

## BULGULAR

- [SEV: medium] `apps/api/src/trpc/trpc.controller.ts` + `apps/api/src/trpc/trpc-context.factory.ts` (gerçek Nest kablolaması) — AC9(b)/AC10'un "iki yüzey aynı gövde" testi gerçek guard zinciri/`TrpcController`'ı atlıyor; gerçek bir `/trpc` HTTP isteğinin, gerçek bir port adaptöründen fırlatılan bir `AppError`'ı doğru `AppErrorBody`'ye çevirdiği uçtan uca HİÇBİR testte gözlenmiyor (bkz. §2.2). Mevcut kapsamda deterministik bir tetikleyici yok (tek aday — soft-delete yarışı — host seviyesinde zaten filtreleniyor). Önerilen düzeltme: ilk mutasyon/girdili prosedür eklendiğinde (veya bilinçli bir test-amaçlı hata-enjeksiyon mekanizması/DI override noktası tasarlandığında) bu uçtan uca senaryo kapatılmalı. — **sorumlu ajan: backend** (sonraki sürüm, ör. v0.0.7/ilk mutasyon prosedürü sahibi).
- [SEV: low] `packages/trpc/src/__tests__/procedures.test.ts:9-37,126-129,152-154` — dosya başı/satır içi yorumlar "BUGÜN BAŞARISIZ OLUR", "DURUM: BLOCKED gerekçesidir" diyor; ama S3'ün düzeltmesi sonrası bu testler ŞU AN geçiyor (bizzat doğrulandı, §2.1). Yorumlar S4'ün BLOCKED turundan kalma, güncellenmedi — yanıltıcı olabilir. Önerilen düzeltme: yorumları "düzeltme ÖNCESİ gözlenen davranış, düzeltme SONRASI geçer" şeklinde geçmiş zamana çevir. — **sorumlu ajan: backend** (S4/S3'ün dosyası).
- [SEV: low, bilgilendirici] `packages/trpc/src/trpc.ts:136-148` (`appErrorBoundary`) — "bizim değilse olduğu gibi yeniden fırlat" dalının `throw`/`return` ayrımı bu tRPC sürümünde (11.19.0) gözlemlenebilir bir fark ÜRETMİYOR (bizzat kasıtlı bozmayla doğrulandı, §2.1) — kritik bulgunun regresyon koruması zaten AC3/TenantNotFound testlerinden geliyor, bu dal için ek bir "regresyon riski" YOK, sadece dokümantasyon/yorum iddiası ("TEKRAR SARMALANMAZ, ÇİFTE ÇEVİRİ YAPILMAZ") bağımsız bir testle AYIRT EDİLEMİYOR. Aksiyon gerekmez, kayıt amaçlı. — **sorumlu ajan: yok (bilgi notu)**.
- [SEV: low, operasyonel — T-007 kapsamı DIŞI] `pnpm format:check` çalıştırıldığında `.claude/workflow/reviews/T-007-security-tur1.md` ve `T-007-solid-tur1.md` (eşzamanlı çalışan security/solid gate'lerinin KENDİ rapor dosyaları) formatsız çıkıyor. Bu dosyalar T-007'nin üretim/test kodu DEĞİL — AGENT_BASELINE §5 gereği başka ajanın dosyasına dokunulmadı. T-007'nin kendi üretim/test kod yüzeyi `format:check` açısından TEMİZ (bu dosyalar oluşmadan önceki koşumlarımda doğrulandı). — **sorumlu ajan: security, solid** (kendi dosyalarını bitirdiklerinde temizlenecektir, bir müdahale gerekmez).

Yukarıdaki dört bulgudan **hiçbiri FAIL eşiğini tetiklemiyor** (1 açık medium + 2 açık low + 1 bilgi notu → AGENT_BASELINE §4 "1–2 medium → PASS").

---

## ÖLÇÜMLER

**KABUL KRİTERİ EŞLEMESİ:** §1'deki tabloya bakınız — AC1–AC14 hepsi KARŞILANDI.

**TEST SAYILARI:**

| Paket              | Dosya (önce → sonra)           | Test (önce → sonra)              |
| ------------------ | ------------------------------ | -------------------------------- |
| `@arkesoft/errors` | 3 → 3                          | 48 → 48                          |
| `@arkesoft/trpc`   | 4 → **6** (+2, QA eklentisi)   | 20 → **24** (+4, QA eklentisi)   |
| `@arkesoft/db`     | 8 → 8                          | 166 → 166                        |
| `@arkesoft/api`    | 37 → **38** (+1, QA eklentisi) | 318 → **320** (+2, QA eklentisi) |
| **Toplam**         | 52 → **55**                    | 552 → **558**                    |

Tüm koşumlar 0 başarısız. `test:isolation`: 16/16 (db 14 + api 2), değişmedi.

**KOŞTURULAN KOMUTLAR (gerçek çıktı özeti):**

| Komut                                                        | Sonuç                                                                 | Not                                                                                                                                                         |
| ------------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                                  | exit 0, **16/16**                                                     | 2 kez koşturuldu (QA testleri eklenmeden önce/sonra)                                                                                                        |
| `pnpm typecheck`                                             | exit 0, **16/16**                                                     | 2 kez                                                                                                                                                       |
| `pnpm build`                                                 | exit 0, **12/12**                                                     | 2 kez                                                                                                                                                       |
| `pnpm test`                                                  | exit 0, **558/558** (0 başarısız)                                     | **6 tam koşum** (QA eklentileri öncesi/sonrası, hermetiklik kontrolü için tekrarlı); hiçbir koşumda `.vitest-cache`/`platform:auth:*` borçları tetiklenmedi |
| `pnpm --filter @arkesoft/trpc test`                          | exit 0, **24/24**, `Type Errors no errors`                            | **4 kez üst üste** (AC11 hermetiklik) — aynı sayı, aynı sonuç                                                                                               |
| `pnpm test:isolation`                                        | exit 0, **16/16**                                                     | 1 kez                                                                                                                                                       |
| `pnpm format:check`                                          | T-007 kapsamı temiz (2 ilgisiz, eşzamanlı rapor dosyası hariç)        | bkz. BULGULAR, operasyonel not                                                                                                                              |
| Mutasyon A (`tenant-summary.schema.ts`'den `name` silindi)   | exit ≠ 0 (`TypeCheckError` + runtime fail) → geri alındı, `diff` boş  | bizzat tekrarlandı                                                                                                                                          |
| Kasıtlı bozma — `appErrorBoundary` → eski `try/catch` deseni | `AC3`/`TenantNotFound` testleri KIRMIZI → geri alındı, `diff` boş     | bizzat yapıldı (§2.1)                                                                                                                                       |
| Kasıtlı bozma — `throw result.error` → `return result`       | 24/24 YİNE yeşil (gözlemlenebilir fark yok) → geri alındı, `diff` boş | bizzat yapıldı (§2.1)                                                                                                                                       |

`pnpm test:e2e`/`pnpm test:contract`: bu sürümde henüz yok (ROADMAP v0.0.19/v0.0.22) — çalıştırılmadı. Frontend yok (po: "FRONTEND VAR MI: hayır") → Playwright/wcag/perf uygulanmıyor.

---

SONUÇ: PASS
