# T-007 — QA Gate, Tur 2 (düzeltme turu sonrası)

Tarih: 2026-10-30
Sürüm: ROADMAP v0.0.6 (tRPC sözleşme katmanı)
Girdi: kendi tur1 raporum (PASS, 1 medium + 3 low), solid tur1 (FAIL, 4m/16l), security tur1 (PASS, 1m/6l), düzeltme turu 1'in değişiklikleri.

```
GATE: qa
SONUÇ: PASS
```

---

## 1. Düzeltme turunun kapsadığı yüzey — doğrulandı

Prompt'ta listelenen yedi değişikliği dosya okuyarak tek tek doğruladım:

| Dosya                                                                             | İddia edilen değişiklik                                                                                 | Doğrulama                                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/trpc/src/trpc.ts`                                                       | `cause`-parse-fail dalına `warn` eklendi (solid M4(b))                                                  | **DOĞRULANDI** — `ctx !== undefined` koruması ile `ctx.logger.warn('trpc.error-formatter.unparsable-cause', {requestId})`, satır 90-92                                                          |
| `packages/trpc/src/__tests__/procedures.test.ts`                                  | bayat yorumlar temizlendi; `appError.code` assert'leri (M2); `authenticated+tenant:'absent'` testi (M3) | **DOĞRULANDI** — dosya başı yorumu geçmiş zamana çevrildi; AC3/port-totalliği testlerine `appError.code` assert'leri eklendi; yeni `describe("requireTenant'ın hata dalı…")` bloğu (M3) eklendi |
| `packages/trpc/src/__tests__/error-formatter.test.ts`                             | `toEqual([])` kaldırıldı, `warn` filtresiyle assert                                                     | **DOĞRULANDI** — artık `entries.filter(e => e.level === 'warn')` + mesaj/bağlam assert'i                                                                                                        |
| `packages/trpc/src/__tests__/harness.ts`                                          | ölü `TrpcHandlerOptions` re-export kaldırıldı                                                           | **DOĞRULANDI** — `grep "TrpcHandlerOptions" harness.ts` → 0 eşleşme                                                                                                                             |
| `apps/api/src/trpc/trpc.controller.ts`                                            | `Cache-Control: no-store, private` + `Vary: Cookie`                                                     | **DOĞRULANDI** — `forwardTrpcWebResponse`'ta döngü SONRASI `setHeader('cache-control', 'no-store, private')` + `appendHeader('vary','Cookie')`, gerekçe yorumu security tur1'e atıf yapıyor     |
| `apps/api/src/__tests__/trpc-http.test.ts`                                        | iki başlık testi                                                                                        | **DOĞRULANDI** — satır 263-311, `cache-control`/`vary` assert'leri                                                                                                                              |
| İki yorum dosyası (`trpc-error-data.schema.ts`, `create-trpc-request-handler.ts`) | paraphrase → literal (solid L1/L2)                                                                      | **DOĞRULANDI** — `instanceof` ve `apps/api` artık literal, paraphrase yok                                                                                                                       |

**Kendi üç test dosyam dokunulmamış** (`transport-negative.test.ts`, `app-error-boundary-non-app-error.test.ts`, `trpc-tenant-read-port-adapter.test.ts`): `stat` ile değişim zamanları fix-turu dosyalarından ÖNCE (19:27-19:39 vs 19:52+); içerik okunarak tur1 raporumla birebir tutarlı olduğu teyit edildi. `git status` tüm T-007 ağacını `??` (untracked, henüz commit yok) gösteriyor — bu yüzden `git diff` ile önce/sonra karşılaştırması YAPILAMADI, zaman damgası + içerik okuması ile doğrulandı.

---

## 2. AC3 / AC9(b) / AC10 / AC11 — yeniden doğrulama (kendi koşumum)

### AC11 — hermetiklik, iki koşum

```
pnpm --filter @arkesoft/trpc test  → 6 dosya, 25/25, Type Errors: no errors
pnpm --filter @arkesoft/trpc test  → 6 dosya, 25/25, Type Errors: no errors  (AYNI sayı)
```

### M2/M3'ün gerçek regresyon koruması olduğu — KASITLI BOZMAYLA kanıtlandı

**Bozma 1 (M2):** `toTrpcError`'un `cause` ataması `{code, httpStatus}`'a daraltıldı (`appError` alanı silindi, `as unknown as TrpcErrorData` ile tip zorlandı — sessiz dejenerasyonun simülasyonu). Sonuç:

```
FAIL procedures.test.ts > AC3 … expect(caught.data?.appError.code).toBe('UNAUTHENTICATED')
  Received: 'HTTP_EXCEPTION'
FAIL procedures.test.ts > TenantReadPort totalliği … appError.code === 'TENANT_NOT_FOUND'
  Received: 'HTTP_EXCEPTION'
FAIL procedures.test.ts > requireTenant'ın hata dalı … appError.code === 'TENANT_CONTEXT_REQUIRED'
  Received: 'HTTP_EXCEPTION'
3 failed | 22 passed (25)
```

Bu, solid'in M2 bulgusunun TAM KANITI: eski assert'ler (`data.code`/`data.httpStatus`) bu dejenerasyonu YAKALAMAZDI (ikisi de `UNAUTHORIZED`/401 kalır); yeni `appError.code` assert'leri YAKALIYOR. Dosya geri alındı, `diff` ile BİREBİR aynı doğrulandı, tekrar **25/25**.

**Bozma 2 (M3):** `requireTenant`'ın `throw ctx.errors.tenantContextRequired()` dalı kaldırıldı (her koşulda `next()` çağıran bir sahte-guard'a indirgendi). Sonuç: M3'ün yeni testi bu kez bir `TypeCheckError` ile kırmızı oldu (`ctx.tenant.tenantId` dar tiplenmiş `{kind:'absent'}` üzerinde yok) — yani middleware'in context-daraltma sözleşmesi bozulduğunda M3'ün testi YİNE yakalıyor (farklı başarısızlık modu, ama yakalama gerçek). Dosya geri alındı, `diff` ile BİREBİR aynı doğrulandı, tekrar **25/25**.

**Sonuç:** M2+M3'ün düzeltmeleri kozmetik değil, GERÇEK regresyon koruması. AC3/AC9(b)/AC10 üçü de bu testlerden geçiyor → **yeniden KARŞILANDI**.

### AC10 — Cache-Control düzeltmesi bir yan etki üretmedi

`trpc-http.test.ts`'in iki yeni başlık testi + mevcut AC9(b)/AC10 gövde-eşitliği testi AYNI `beforeAll` fixture'ını paylaşıyor; ikisi de yeşil (bkz. §4 ölçümler) — başlık eklemesi gövde karşılaştırmasını etkilemiyor (beklenen, header ≠ body).

---

## 3. Kendi medium'umun akıbeti — BAĞIMSIZ DENETİM: iddia ÇÜRÜTÜLDÜ, SOMUT YOL BULUNDU VE UYGULANDI

Düzeltme ajanının muhakemesini adım adım denetledim:

- **"`TenantResolverService.toResolution()` zaten `deletedAt!==null`'ı `unresolved(soft_deleted)`'a çeviriyor, `TenantGuard` 404 ile reddediyor"** — `tenant-resolver.service.ts:208-210` ve `tenant.guard.ts:53-57`'yi okuyarak DOĞRULADIM. Soft-delete yarışının HTTP yolundan deterministik tetiklenemeyeceği iddiası **DOĞRU**.
- **"Kalan tek yol TOCTOU yarışı — deterministik tetiklenemez, DI override noktası eklemeye izin verilmiyordu"** — **BU KISIM YANLIŞ/EKSİK.** Ajan "üretim koduna/`create-test-app.ts`'e yeni bir DI override noktası eklemek" ile "mevcut bir sağlayıcıyı YENİ bir test dosyasında Nest'in STANDART `overrideProvider()` API'siyle override etmek" ihtimallerini ayırt etmemiş. İkincisi **hiçbir üretim kodu değişikliği, hiçbir paylaşımlı dosya değişikliği (`create-test-app.ts` dahil) gerektirmez** — yalnızca NestJS'in testing modülü API'sinin standart kullanımıdır.

**Somut kanıt (bizzat yazıp çalıştırdım, sonra kalıcı hale getirdim):**

Geçici bir prob dosyasıyla (`zz-qa-gate-tur2-probe.temp.test.ts`, rapor sonrası SİLİNDİ) önce hipotezi doğruladım:

```ts
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(TenantReadPortAdapter)
  .useValue({ findSummary: () => Promise.reject(new TenantNotFoundError()) })
  .compile()
```

`TenantReadPortAdapter` `@Injectable()` + SINIF-REFERANSLI DI token'la enjekte edildiği için (`trpc.controller.ts:132`, solid tur1'in de doğruladığı desen) bu override ÇALIŞIYOR. Gerçek HTTP isteği (`supertest`, geçerli oturum çerezi + gerçek kiracı üyeliği) gönderildiğinde:

```
GET /trpc/tenant.current (gerçek guard zinciri: TenantGuard→AuthGuard→RateLimitGuard→SameOriginGuard)
→ TrpcController.handle() (GERÇEK) → override edilmiş port AppError fırlatır
→ 404 {"error":{"data":{"code":"NOT_FOUND","appError":{"code":"TENANT_NOT_FOUND","requestId":"req-qa-probe-01",...}}}}
log: {"handler":"TrpcController.handle","statusCode":404,"tenantId":"...",...}
```

**Önce gerçek bir tenant yaratıp gerçek üyelik kurduğumu** (override olmasaydı adaptör 200 dönerdi) ve 404 aldığımı doğruladım — override'ın GERÇEKTEN devreye girdiğinin kanıtı (yanlış-pozitif riski yok).

**Bunu kalıcı bir test olarak yazdım:** `apps/api/src/__tests__/trpc-full-chain-domain-error.test.ts` — gerçek `TenantGuard`/`AuthGuard`/`RateLimitGuard`/`SameOriginGuard` zincirinden geçen, gerçek `TrpcController.handle()`'ı koşturan, DI override edilmiş gerçek bir port adaptöründen fırlatılan bir `AppError`'ın gerçek `errorFormatter`/`appErrorBoundary`'den geçip doğru `AppErrorBody`'ye dönüştüğünü doğrulayan test. **Üretim kodu değişmedi, `create-test-app.ts` değişmedi.** `pnpm --filter @arkesoft/api lint`/`typecheck` temiz, test **1/1 geçiyor**.

**Sonuç:** tur1'in medium bulgusu ("gerçek Nest kablolaması uçtan uca hiçbir testte gözlenmiyor") artık **KAPATILDI** — düzeltme ajanının "yapısal olarak imkansız" değerlendirmesi kısmen yanlıştı; borç olarak kaydedilmeyecek, bu turda çözüldü.

---

## 4. Zorunlu kapı — kendi koşumum (gerçek çıktı)

| Komut                               | Sonuç                                                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                         | exit 0, **16/16**                                                                                                                                                      |
| `pnpm typecheck`                    | exit 0, **16/16**                                                                                                                                                      |
| `pnpm build`                        | exit 0, **12/12**                                                                                                                                                      |
| `pnpm test`                         | exit 0, **562/562** (errors 48 + trpc 25 + db 166 + api 323) — **3 tam koşum**, hepsi 0 başarısız                                                                      |
| `pnpm test:isolation`               | exit 0, **16/16** (db 14 + api 2)                                                                                                                                      |
| `pnpm --filter @arkesoft/trpc test` | exit 0, **25/25** — **2 kez üst üste** (AC11)                                                                                                                          |
| `pnpm format:check`                 | T-007 kapsamı TEMİZ — tek uyarı `.claude/workflow/reviews/T-007-solid-tur2.md` (solid'in KENDİ, eşzamanlı yazdığı rapor dosyası; AGENT_BASELINE §5 gereği dokunulmadı) |

**Flaky gözlem (DoD §6 gereği raporlanıyor, susturulmadı):** `pnpm test`'i art arda koşarken BİR ara koşumda `rate-limit.test.ts`'te 4-5 test başarısız oldu (`platform:auth:*` Redis sayaçlarının beklenmeyen durumu). Kök neden araştırıldı: `lsof -i :6379` → HEM host seviyesi `redis-server` (PID 1445) HEM docker'ın `arkesoft-redis` konteyneri AYNI porta bağlı — bu, T-007'nin kendi görev dosyasında ÖNCEDEN kayıtlı low borç ("Host seviyesinde ikinci redis-server 6379'u dinliyor") ile BİREBİR aynı sınıf, ve `platform:auth:*` çapraz-dosya sızıntısı da AYNI dosyada ÖNCEDEN kayıtlı medium borç. Bu turda EŞZAMANLI çalışan başka bir gate oturumunun (security tur2) AYNI gerçek Redis'e/DB'ye yazdığı gözlendi (`zz-security-gate-tur2-*.temp.test.ts` dosyaları geçici olarak mevcuttu). Fix turunun DEĞİŞTİRDİĞİ hiçbir dosya (`rate-limit.test.ts`, auth modülü, Redis kodu) bu diff'te YOK — **bu turun ürünü DEĞİL**, önceden kataloglanmış borcun eşzamanlı çok-ajan gerçek-altyapı paylaşımıyla TETİKLENMESİ. İzole (başka gate oturumu olmadan) koşumlarım TUTARLI olarak 562/562 verdi (3 kez). Yeni bulgu olarak KAYDEDİLMİYOR — mevcut borç satırlarının (sorumlu backend+devops) geçerliliğini TEYİT ediyor.

---

## 5. Yeni eklenen test + kapanan bulgu

`apps/api/src/__tests__/trpc-full-chain-domain-error.test.ts` (yeni, qa tur2) — tur1'in medium bulgusunu kapatıyor (bkz. §3). Lint/typecheck temiz, 1/1 geçiyor.

---

## BULGULAR

yok

(Tur1'in tek medium'u bu turda KAPATILDI — §3. Tur1'in 3 low'undan ikisi backend tarafından düzeltildi — §1 tablosu; üçüncüsü "operasyonel, T-007 kapsamı dışı" idi ve halen geçerli şekilde kapsam dışı.)

---

## ÖLÇÜMLER

**KABUL KRİTERİ EŞLEMESİ (bu turda yeniden doğrulananlar):**

| AC     | Test                                                                                | Sonuç                                                                                     |
| ------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| AC3    | `procedures.test.ts` AC3 bloğu                                                      | **KARŞILANDI** — kasıtlı bozmayla regresyon koruması bizzat kanıtlandı                    |
| AC9(b) | `trpc-http.test.ts` AC9(b)+AC10 bloğu + yeni `trpc-full-chain-domain-error.test.ts` | **KARŞILANDI** — artık GERÇEK guard zinciri + GERÇEK controller üzerinden de doğrulanıyor |
| AC10   | aynı + Cache-Control başlık testleri                                                | **KARŞILANDI** — başlık eklemesi gövde eşitliğini bozmadı                                 |
| AC11   | `pnpm --filter @arkesoft/trpc test` × 2                                             | **KARŞILANDI** — 25/25, 25/25                                                             |

**TEST SAYILARI:**

| Aşama                                         | trpc | api     | errors | db  | Toplam                                                |
| --------------------------------------------- | ---- | ------- | ------ | --- | ----------------------------------------------------- |
| qa tur1 (temel)                               | 24   | 320     | 48     | 166 | 558                                                   |
| + düzeltme turu 1 (M3 ×1, security başlık ×2) | 25   | 322     | 48     | 166 | **561** (orkestratörün kök ölçümüyle BİREBİR eşleşti) |
| + qa tur2 (full-chain testi ×1)               | 25   | **323** | 48     | 166 | **562**                                               |

Toplam geçen: **562/562**. Toplam başarısız (izole koşumlarda): **0**.

**KOŞTURULAN KOMUTLAR:**

| Komut                                                         | Exit | Özet                                                                            |
| ------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------- |
| `pnpm lint`                                                   | 0    | 16/16                                                                           |
| `pnpm typecheck`                                              | 0    | 16/16                                                                           |
| `pnpm build`                                                  | 0    | 12/12                                                                           |
| `pnpm test` (×3, izole)                                       | 0    | 562/562 her seferinde                                                           |
| `pnpm test` (eşzamanlı başka gate oturumuyla, ×2)             | 1    | `rate-limit.test.ts`'te 4-5 test, önceden kayıtlı borç tetiklendi — bkz. §4     |
| `pnpm test:isolation`                                         | 0    | 16/16                                                                           |
| `pnpm --filter @arkesoft/trpc test` (×2 art arda)             | 0    | 25/25, 25/25                                                                    |
| `pnpm format:check`                                           | 1    | T-007 kapsamı temiz; tek uyarı solid'in eşzamanlı rapor dosyası                 |
| Kasıtlı bozma — `toTrpcError`'un `cause`'u daraltıldı         | 1    | 3/25 kırmızı (M2'nin gerçek koruması), geri alındı, `diff` boş                  |
| Kasıtlı bozma — `requireTenant`'ın `throw` dalı kaldırıldı    | 1    | 1/25 kırmızı (`TypeCheckError`, M3'ün gerçek koruması), geri alındı, `diff` boş |
| Geçici prob (`Test.createTestingModule` + `overrideProvider`) | 0    | hipotez doğrulandı, kalıcı teste dönüştürüldü, geçici dosya SİLİNDİ             |

`pnpm test:e2e`/`pnpm test:contract`: bu sürümde henüz yok — çalıştırılmadı. Frontend yok → Playwright/wcag/perf uygulanmıyor.

---

SONUÇ: PASS
