# T-014 · `qa` · tur 1 (TAM kapsam)

Tarih: 2026-11-04 · Sürüm: ROADMAP v0.0.14 · Dal: `main`

```
GATE: qa
SONUÇ: PASS
BULGULAR:
  - [SEV: low] apps/api/src/__tests__/production-write-path-grep.qa.test.ts:238-243 (tur öncesi) — KAPI 3 yalnızca `import` ile BAŞLAYAN satırı tarıyordu; çok satırlı logger import'u görünmez geçiyordu — `qa` ÖLÇTÜ (typecheck 0 + kapı 7/7 yeşil) ve KENDİ dosyasında KAPATTI (ifade birleştirme + regresyon testi) — qa (kapandı)
  - [SEV: low] apps/api/src/__tests__/production-write-path-grep.qa.test.ts:79,196-203 (tur öncesi) — append-only yalnızca `create` için kapılıydı; `auditLog.updateMany` üretimde derleniyor ve hiçbir kapıya çarpmıyordu — `qa` ÖLÇTÜ (typecheck 0 + lint 0 + 3 kapı yeşil) ve KAPI 4'ü EKLEDİ — qa (kapandı)
  - [SEV: low] packages/trpc/src/index.ts sözleşmesi — tarayıcı girişinin transitif kapanışı HİÇBİR testte mekanik değildi (S2 R-S2-2 `medium` işaretleyip `qa`/`docs`'a devretmişti); tek dosya `rg` biçimi S2'nin M7'sinde YEŞİL kalıyor — `qa` yeni kapıyı yazdı ve M7'yi yeniden üretip KIRMIZI gördü — qa (kapandı)
  - [SEV: low] apps/api/src/__tests__/member-authz.test.ts:217-232 — HTTP seviyesindeki çapraz kiracı YAZMA ölçümü `pnpm test`'te yaşıyordu, `test:isolation`'da değildi ve yalnızca DURUM KODUNA bakıyordu; `member.*` hiçbir `*.isolation.test.ts`'te geçmiyordu — `qa` `member-cross-tenant.isolation.test.ts`'i yazdı (5 test) — qa (kapandı)
  - [SEV: low] apps/api/src/member/member.service.ts:639-641 — `PENDING_INVITATION_LIMIT` (50) ve `ALREADY_MEMBER` HİÇBİR testte çalıştırılmamıştı; üst sınır bu sürümün TEK kötüye kullanım denetimi (oran sınırı hiçbir tRPC prosedürünü kapsamıyor) — `qa` `member-invite-negative.qa.test.ts`'i yazdı (4 test), davranış DOĞRU çıktı — qa (kapandı)
  - [SEV: low] apps/api/src/__tests__/audit-log-no-log-leak.test.ts:210-217 — yasaklı alan taraması `Object.hasOwn` ile YALNIZCA ÜST SEVİYEDE; FIX 1 `AppError.context`'i nestelenmiş olarak loglanan alan yaptı → ileride `context.diff` taşıyan bir hata sınıfı bu kapıdan görünmez geçer (bugün ulaşılamaz, `security` L-11 ile aynı aile). Vade v0.0.17 — backend
ÖLÇÜMLER: aşağıda
```

**Açık `medium`: 0** → §4 gereği düzeltme turu **açılmıyor**. 20 devralınan `low`'a **dokunulmadı**.

---

## 1 · AC8 — `qa`'nın KENDİ çıktısı (`--force` / 0 cached)

AC8 **üç kez** bağımsız koşturuldu. Tuzak 2 (bayat `dist`) her koşumda **ön-build** ile kesildi;
tuzak 3 (FULL TURBO) `--force` ile. **Hiçbir koşumda hiçbir görev önbellekten oynatılmadı.**

| # | Komut | Exit | Turbo | Sayılar |
| - | ----- | ---- | ----- | ------- |
| 0 | `pnpm build --force` (ön-build) | **0** | 13/13, **0 cached** | — |
| 1 | `pnpm lint --force` | **0** | 21/21, **0 cached** | — |
| 2 | `pnpm typecheck --force` | **0** | 21/21, **0 cached** | 0 diagnostic |
| 3 | `pnpm test --force` | **0** | 18/18, **0 cached** | koşum 1: **1251** · koşum 3: **1257** |
| 4 | `pnpm test:isolation --force` | **0** | 10/10, **0 cached** | koşum 1: **48** · koşum 3: **53** |
| 5 | `pnpm build --force` | **0** | 13/13, **0 cached** | — |
| + | `pnpm format:check` | **0** | — | temiz |

**Koşum 1 (taban ağaç, `qa` testlerinden ÖNCE) — `backend`'in sayıları BİREBİR doğrulandı:**
`test` **1251** (api 472 · db 172 · trpc 107 · theme-sdk 223 · storefront 125 · errors 48 · tenancy 39 · admin 37 · ui 23 · themes-modern 5) / **123 dosya** · `test:isolation` **48** (db 35 + api 13) / 5 dosya.
⚠ **`skipped`/`todo` = 0** (log taraması + kaynak taraması: `.skip(`/`.only(`/`it.todo` → üretim testlerinde **0**, üç eşleşme de yorum).

**Koşum 3 (`qa`'nın ilk üç dosyası dahil):** `test` **1257** / 124 dosya · `test:isolation` **53** (db 35 + api 18) / 6 dosya.

**Son durum (dördüncü `qa` dosyası eklendikten sonra, paket kapsamlı ölçüm):**
`@arkesoft/api` **479 test / 59 dosya**, exit 0 · `typecheck` 0 · `eslint` 0 · kök `format:check` **0**
→ **kök `pnpm test` toplamı 1261** (1257 ölçülen + 4 ölçülen; **aritmetik, kök koşum tekrarlanmadı** — §5).

---

## 2 · Sekiz AC — tek tek, devralma YOK

| AC | `qa` sonucu | `qa`'nın kendi kanıtı |
| -- | ----------- | --------------------- |
| **AC1** | ✅ | `member-authz.test.ts` kendi koşumumda yeşil. Matris **3 uç × 5 rol = 15 vaka** kaynakta doğrulandı: `readonly`+`owner` **literal**, `admin`/`staff`/`support` `ROLE_PERMISSIONS`'tan **türetme** (`remainingRoles` literal olarak `['admin','staff','support']`e pinli). ⚠ **İKİ KATMANLI tasarımın yük taşıdığını MUTASYONLA ölçtüm (QA-M2):** kataloğa `readonly: [...,'member:write']` eklediğimde **literal** assert (`not.toContain`) kırmızıya düştü — yalnızca türetme olsaydı test sapmayı **sessizce takip ederdi**. S5'in kararı **doğrulandı**. 403 gövdesi: izin adı ve rol gövdenin TAMAMINDA aranıp bulunmuyor; `AppErrorBody` anahtar kümesi `TENANT_MEMBERSHIP_REQUIRED` ile eşit, `details` ikisinde de boş. |
| **AC2** | ✅ | `member-invite-flow.test.ts` yeşil. Belirteç **FRAGMANDA**: `new URL(url).search === ''` **ve** `expect(() => extractQueryParam(...)).toThrow()` → fragman kararı **ölçülmüş**, varsayım değil. Mailpit alıcısı **küçük harfe normalize**; `tokenHash` ham belirtece **eşit değil**, sha256'sına **eşit**. Denetim izi **dört satır, zincirli** (`accepted.diff.invitationId === invited.subject`); e-posta ve ham belirteç **hiçbir satırda yok**. SMTP sıra testi: taşıyıcı fırlatınca davet satırı **DB'de DURUYOR** (commit oldu). |
| **AC3** | ✅ | `authz-consistency.test.ts` + `permissions-catalog.test.ts` + `member-procedures.test.ts` → `@arkesoft/trpc` **110/110** yeşil (benim eklediğim 3 dahil). ⚠ **A-A2'yi KENDİM çalışma zamanında ölçtüm:** `appRouter._def.procedures` **noktalı tam yol anahtarlı DÜZ kayıt**, 9 prosedür, her değer `function`, `_def.type` ∈ {query,mutation}, **4 mutation** → **grep yedeğine düşülmedi**. Üç ayak da kaynakta doğrulandı; (c) ayağı **çoğul küme** karşılaştırıyor (sayıdan güçlü) + izinsiz dört yolun **kardinalite + ad** listesi. |
| **AC4** | ✅ | **İKİ YARI DA DOĞRULANDI.** Tip yarısı: PİN 8 (`pinTenantRoleWireKeysExactlyMatchTenantRole`, `trpc-wire-contract.pin.ts:367`) iki yönlü (`AssertNoExtraWireRoles` + `AssertNoMissingWireRoles`); kök `typecheck --force` 21/21 / 0 diagnostic **üç kez**. ⚠ **Çalışma zamanı yarısı — brief'in sorduğu soru:** `tenantRoleWireValuesMatchPrismaAtRuntime` **GERÇEKTEN ÇAĞRILIYOR** → `trpc-http.test.ts:52` (import) + **`:329` `expect(...).toBe(true)`**. Ölü pin **değil**. |
| **AC5** | ✅ | Kök `test:isolation --force` üç kez exit 0. `TENANT_SCOPED_TABLES` = **4** üye (`tenant_membership`,`job`,`audit_log`,`tenant_invitation`); db süiti **35 test** = 7 senaryo × 4 tablo + prob tamlığı + catalog-lint 6. ⚠ **Çağrı noktası HÂLÂ TEK:** `createTenantIsolationSuite(` gerçek çağrısı **yalnızca** `tenant-membership.isolation.test.ts:119`; diğer 10 eşleşmenin **tamamı yorum**. Prob tamlığı kapısının `expect` başarısızlığı S1→S3 zincirinde yapıştırılmış. |
| **AC6** | ✅ | `audit-log-write-gate.test.ts` + `audit-log-no-log-leak.test.ts` yeşil. Düşürme: dört eylemin dördünde de sır/PII anahtarları düşüyor, alan listeleri **şemanın kendi şeklinden** okunuyor. Log yakalama: `ip`/`userAgent`/`diff` hiçbir kayıtta alan olarak yok **ve aynı anda** satırlar bu alanları **dolu** taşıyor, istek kayıtlarında `tenantId` **var**. ⚠ Yapısal yarı (KAPI 3) bir **kör nokta** taşıyordu → `qa` ölçtü ve kapattı (bulgu 1). ⚠ Üst-seviye-only tarama → **bulgu 6** (`low`). |
| **AC7** | ✅ **kod + kapı seviyesinde** | `member-owner-invariant.test.ts` 7/7 yeşil: üç sebep de 409 (`details:{}`, sebep **tele sızmıyor**), devir tek transaction'da CAS, eşzamanlı iki devir → **tam biri 200, tam biri 409**, atomiklik, devirden sonra eski sahip 409. ⚠⚠ **"R-A10 KAPANDI" DEMİYORUM** — `rg -i "R-A10 kapan"` → repo genelinde **0 eşleşme**, yani kimse kapandı demiyor; karşılanma **kod + grep kapısı** seviyesindedir, **DB garantisi DEĞİL**. Borç **v0.0.19'a taşınıyor**. KAPI 2 (kullanıcı sert silme yolu yok) kendi koşumumda yeşil ve **vacuous değil** (kontrol kümesinde eşleşme buluyor). |
| **AC8** | ✅ | §1. |

---

## 3 · `perf` ikamesinin üç ölçümü — BAĞLAYICI, `qa` doğruladı

**Ölçüm 1 — izinli istek üyelik satırını TAM İKİ KEZ okuyor.** `member-authz.test.ts` kendi
koşumumda yeşil:
```
İZİNLİ (200):     requireRole = 1 · memberWrite.invite = 1
                  tenantMembership.findUnique = 2 → [{select:{id:true}}, {select:{role:true}}]
                                                      muhafız        izin kapısı   (ÜÇÜNCÜ YOK)
REDDEDİLEN (403): requireRole = 1 · memberWrite.invite = 0   ← kapı next()'ten ÖNCE fırlatıyor
```
Assert **sayı değil, hangi okumanın hangisi olduğunu** karşılaştırıyor (`toEqual` ile iki elemanlı
dizi) → üçüncü bir okuma **kırmızı** olur. Ölçüm aracı seçimi de doğrulandı: delegenin `findUnique`'i
sarılabilir bir **kendi özelliği**.
⚠ **A-S5-2'yi MUTASYONLA ölçtüm (QA-M1):** `assertNotAlreadyMember`'ın erken dönüşünü kaldırdım →
`typecheck` **0 (YEŞİL)**, ölçüm **KIRMIZI** (3 okuma gördü). Yani ölçümün izolasyonu gerçekten o
erken dönüşe dayanıyor ve kaldırılması **istendiği gibi kırmızıya düşüyor**. Kaynakta da doğrulandı:
`member.service.ts:600-602` `userId === undefined` → `return`.
⚠ Adaptörün yapısal yarısı: `membership-read.port.adapter.ts`'te **tek** sorgu var,
`withTenant(tenantId)` + `tenantId_userId` bileşik yüklemi; kiracıyı satırla karşılaştıran bir `if`
**yok**.

**Ölçüm 2 — SMTP transaction DIŞINDA ve COMMIT'TEN SONRA.** `member-invite-flow.test.ts`'in sıra
testi kendi koşumumda yeşil: taşıyıcı ikizi (seçici) fırlatıyor → **503 `MAIL_DELIVERY_FAILED`**,
davet satırı **DB'de DURUYOR**, denetim **1**, tekrar davet **409 `INVITATION_RESEND_TOO_SOON`** ve
satır **hâlâ 1**. ⚠ **Ayrımı veren assert bu:** ters sıra (gönder→commit) seçilseydi satır **hiç
olmazdı**. Kaynak sırası da doğrulandı — `writeAuditLog` transaction içinde, e-posta `withTenant`
bloğunun **dışında**.

**Ölçüm 3 — `job` okuma yüzeyi dokunulmadı.** `qa`'nın kendi `git diff` ölçümü:
`job-summary.schema.ts` → **BOŞ** · `job-read.port.adapter.ts` → **BOŞ** · `job.router.ts` →
19+/9− ama `grep -ciE "^[+-].*(limit|cursor|orderBy|take|skip)"` → **0** (yalnızca builder takası +
yorum) · `JOB_LIST_MAX_LIMIT = 50` **değişmedi** · migration'daki **4 `CREATE INDEX`'in dördü de**
`audit_log`/`tenant_invitation`, `'job'` jetonu migration'da **1 kez ve o da YORUM**.
⚠ **Yan fayda:** R-A10 (`job.router.ts`'in bayat builder yorumu) **gerçekten güncellenmiş** —
diff'te eski builder adı siliniyor.

**`wcag` ikamesi:** `git diff --stat -- apps/admin packages/ui` → **BOŞ** ·
`git status --porcelain` aynı yollarda → **BOŞ**. ✅

---

## 4 · Altı devredilen kararın cevabı

**① HTTP çapraz kiracı YAZMA ölçümü `*.isolation.test.ts`'e TERFİ ETMELİ Mİ → EVET, ETTİRDİM.**

Üç ölçülmüş gerekçe:
1. ⚠ **R-A7 BU DOSYAYA UYGULANMAZ ve S5 iki mekanizmayı karıştırdı.** R-A7'nin yasakladığı şey
   `packages/db`'deki **`createTenantIsolationSuite()`'in ikinci çağrı noktası**. Yeni dosya o süiti
   **çağırmıyor** — `rg "createTenantIsolationSuite\("` gerçek çağrı **tek** ve hâlâ
   `tenant-membership.isolation.test.ts:119`'da. `apps/api` **zaten üç bağımsız izolasyon dosyası**
   taşıyor (`auth-cross-tenant`, `trpc-cross-tenant`, `queue-tenant-context`) ve üçü de dosya başında
   *"`createTenantIsolationSuite()` İÇİNE KONULMAZ"* gerekçesini **yazılı** taşıyor → bu pakette
   "tek dosya" kuralı **yok**.
2. **Platformun yazılı deseni bu:** v0.0.8 `storefront.currentTenant`'ı, v0.0.11 `job.*`'ı
   `trpc-cross-tenant.isolation.test.ts`'e **ekledi**. v0.0.14 **dört mutation + iki yeni kiracı
   tablosu** getirdi ve `rg` ölçümü: `member.*` **hiçbir** `*.isolation.test.ts`'te geçmiyordu →
   desenin **tek istisnası**, hem de platformun **ilk yazma namespace'i** için.
3. **Sürüm kapısı `test:isolation`'ı AYRI koşturuyor** (CLAUDE.md §6). Çapraz erişim kanıtı
   `pnpm test`'e gömülüyse o kapı onu **görmez**.

Ayrıca mevcut assert **yetersizdi**: yalnızca durum koduna bakıyordu. Yeni dosya
(`member-cross-tenant.isolation.test.ts`, **5 test**) şunları ekliyor: üç uçta 403 **+ yabancı
kiracıda satır sayısının DEĞİŞMEDİĞİ** · ⚠ **ÇİFT ÜYELİK vakası** (depoda **hiç yoktu**: A'da
`owner`, C'de `readonly` olan asıl C'de **403 PERMISSION_DENIED** alıyor, roller iki kiracıda
**farklı okunuyor**) · aynı oturumun A'da **200** aldığı ve sayıların **arttığı** (vacuous değil) ·
yabancı kiracının üyelik satırının değiştirilemediği · A bağlamında C'nin davetlerinin görünmediği.
**Kendi koşumumda 5/5 yeşil; QA-M6 ile non-vacuous kanıtlandı.**

**② `solid` L-4 (KAPI 3 çok satırlı import kör noktası) → GERÇEK, ÖLÇTÜM, KAPATTIM.**
QA-M3b: yazma kapısına **gerçek, çözülebilen ve TÜKETİLEN** çok satırlı bir logger import'u ekledim
→ `pnpm typecheck` **EXIT 0** ve KAPI 3 **7/7 YEŞİL** geçti. Kör nokta **kanıtlandı**. Kapı artık
import ifadelerini kapanış tırnağına kadar **birleştiriyor**; aynı mutasyon şimdi **kırmızı**. Ek
olarak bir **regresyon testi** (sentetik kaynakta eski biçimin 0, yeni biçimin 1 eşleşme bulduğunu
gösteriyor). `low` kalıyor (çalışma zamanı yarısı zaten `audit-log-no-log-leak.test.ts`'te canlıydı).

**③ `solid` L-5 (append-only yalnızca `create` için kapılı) → GERÇEK, ÖLÇTÜM, KAPATTIM.**
QA-M4: `member.service.ts`'e mevcut denetim satırlarının `subject`'ini yeniden yazan bir
`tx.auditLog.updateMany` ekledim → `typecheck` **0**, `eslint` **0**, **üç grep kapısı 7/7 yeşil**.
Yani denetim izini **sessizce tahrif eden** bir üretim yolu hiçbir kapıya çarpmıyordu. **KAPI 4**
eklendi (`update`/`delete`/`upsert` → 0, `updateMany`/`deleteMany` önek olarak kapsanıyor) + kendi
vacuous-olmama kontrolü. Aynı mutasyon şimdi **kırmızı**. ⚠ Bu bir **DB garantisi değil** —
`security` L2'nin kaydettiği gerilim (uygulama rolü UPDATE/DELETE'e sahip ve sertleştirmeyi kendi
linter'ımız engelliyor) **aynen duruyor**, vade v0.0.20.

**④ `security` L7 (izolasyon süiti senaryo 2 `WITH CHECK`'i bağımsız ölçmüyor) → `security` HAKLI,
KENDİM ÖLÇTÜM; `low` olarak teyit, DEĞİŞİKLİK YAPMADIM.**
Ham `pg` ile, **`rolbypassrls=t` olan `arkesoft` rolüyle kurulum** (tuzak 1'den kaçınarak), geri
alınan transaction içinde, `arkesoft_app` rolüne geçip A bağlamında yabancı `tenant_id`'ye yazdım:
```
RETURNING'siz INSERT, YABANCI tenant_id → ERROR: new row violates row-level security policy
RETURNING'siz INSERT, AYNI  tenant_id → INSERT 0 1 ("KONTROL INSERT BASARILI")   ← vacuous değil
```
→ **`WITH CHECK` yarısı `RETURNING`'den BAĞIMSIZ olarak CANLI.** S3'ün M6 gözlemi **mutasyonlu
politikaya özgüydü**; `security` tur 2 **doğru**. Kalan şey yalnızca **senaryo adının kapsamından
geniş olması** → **test kapsamı borcu**, `low`. ⚠ Süit **motoruna dokunmadım**: S3'ün yazdığı gibi
`RETURNING`'siz bir yol eklemek **motor değişikliği = `architect` kararı**.
**Sızıntı kontrolü (doğru rolle):** `qa` prob kiracıları 0 · `audit_log` 0 · `tenant_invitation` 0 ·
`tenant_membership` 4445 (seed kiracısına ait, `security` L9'un ölçtüğü **önceden var olan** birikim).

**⑤ A-S5-1 (testler kiracıyı geliştirici başlığıyla seçiyor) → OLGU DOĞRU, AMA BOŞLUK DEĞİL.**
İki ölçüm:
- **Gerçek host dalları ZATEN kapsanıyor** — `tenant-resolution.test.ts`: `subdomain` (AC5),
  **`primaryDomain`/`custom-domain`** (R-P6), bilinmeyen host 404, `production`'da başlığın **yok
  sayıldığı**, `development`'ta başlığın host'u **baypas ettiği**. Yani *"slug XOR primaryDomain"*
  **ölçülüyor**, sadece ayrı bir dosyada.
- ⚠ **Çözümleme dalı yetkiyi ETKİLEYEMEZ ve bunu ölçtüm:** `TenantContext['source']`'un üretim
  kodunda **sıfır tüketicisi** var (`rg "\.source\b" apps/api/src --glob '!__tests__'` → **0**);
  `auth.guard.ts` ve `permission-procedure.ts` `source` jetonunu **hiç anmıyor** (`rg -c` → 0/0).
  Beş dalın hepsi **tek bir `TenantContext`'te birleşiyor** ve yetki katmanı ondan sonra koşuyor.
- Gerçek host üzerinden `member.*` ölçümü bu sürümde **imkânsız**: kök `pnpm test:e2e` **yok**
  (yalnızca `apps/admin`'de) ve `member.*` **tarayıcıdan erişilemez** (ADR-0011 md 4).
→ **Bulgu yazmıyorum** (bilgi).

**⑥ A-S5-2 (`member.invite` hesap yokken üyelik tablosunu okumuyor) → DOĞRULANDI, MUTASYONLA.**
Bkz. §3 ölçüm 1 / QA-M1. Kaynak + mutasyon: ikisi de `architect`'in beklediği davranışı veriyor.

---

## 5 · Mutasyon tablosu — dokuz mutasyon, üretim dosyaları **md5 ile birebir** geri alındı

| # | Hedef | Mutasyon | lint/tc | Ölçülen sonuç |
| - | ----- | -------- | ------- | ------------- |
| **QA-M1** | `member.service.ts` | `assertNotAlreadyMember`'ın erken dönüşü kaldırıldı (A-S5-2) | **tc 0 YEŞİL** | `perf` ölçüm 1 **KIRMIZI** — 3 okuma: `expected [3 öğe] to deeply equal [2 öğe]` |
| **QA-M2** | `authz/permissions.ts` | `readonly`'ye `member:write` verildi (katalog sapması) | **tc 0 YEŞİL** | **6 test KIRMIZI, 2 pakette**: api 2 (`expected ['job:read','member:write'] to not include 'member:write'` + `expected 200 to be 403`), trpc 4 → **AC1'in literal katmanı yük taşıyor** |
| **QA-M3b** | `audit/audit-log.writer.ts` | **çok satırlı** logger import (gerçek yol, tüketilmiş) | **tc 0 YEŞİL** | ⚠ **KAPI 3 7/7 YEŞİL GEÇTİ** → `solid` L-4 **kanıtlandı** |
| **QA-M3c** | aynı | aynı mutasyon, **güçlendirilmiş** KAPI 3'e karşı | — | **KIRMIZI**: `expected [Array(1)] to deeply equal []` → düzeltme **vacuous değil** |
| **QA-M4** | `member.service.ts` | `tx.auditLog.updateMany` ile denetim izi tahrifi | **tc 0 + lint 0 YEŞİL** | ⚠ **3 kapı 7/7 YEŞİL GEÇTİ** → `solid` L-5 **kanıtlandı** |
| **QA-M4b** | aynı | aynı mutasyon, **yeni KAPI 4**'e karşı | — | **KIRMIZI**: `append-only ihlali: .auditLog.update` → KAPI 4 **vacuous değil** |
| **QA-M5** | `membership-read.port.adapter.ts` | rol okuması **kiracı kapsamsız** ham istemciye taşındı | **tc 0 + lint 0 YEŞİL** | **15 test KIRMIZI** (3 isolation + 12 member) — ⚠ **ama RLS FAIL-CLOSED yüzünden**: GUC'suz okuma 0 satır → 403. **Çapraz kiracı rol karışması RLS'i devre dışı bırakmadan ÜRETİLEMİYOR** (olumlu bulgu) |
| **QA-M6** | `member-cross-tenant.isolation.test.ts` (kendi testim) | C'de `readonly` → `owner` | — | **KIRMIZI**: `expected 200 to be 403` → **çift üyelik assert'i kiracı başına role GERÇEKTEN duyarlı** |
| **QA-M7** | `packages/trpc/src/index.ts` | S2'nin M7'si: tarayıcı girişinden izin builder'ı export edildi | — | ⚠ **ESKİ tek dosya `rg` → 0 eşleşme (YEŞİL)**; **YENİ kapı → KIRMIZI** (3 yasaklı modül) → R-S2-2 **kapandı ve vacuous değil** |
| **QA-M8** | `member.constants.ts` | `PENDING_INVITATION_LIMIT` 50 → 500 | — | ⚠ **HAYATTA KALDI (4/4 yeşil)** — testim sabiti **import ediyor**, bu yüzden sınırla birlikte uyarlanıyor. **Mutasyonun kendisi yanlış seçilmişti**; dürüstlük gereği kayda geçti ve QA-M9 ile değiştirildi |
| **QA-M9** | `member.service.ts` | kapasite kontrolü etkisizleştirildi (`false &&`) | — | **KIRMIZI**: `expected 200 to be 409` → üst sınır assert'i **vacuous değil** |

**Geri alma kanıtı — altı üretim dosyasının md5'i taban değerlerle BİREBİR aynı:**
```
58590c7fe6f4416ac22f76e7072b9c1c  apps/api/src/member/member.service.ts
952ee9dcd6add805254e7ed428801629  apps/api/src/member/member.constants.ts
07daa44a43f2d54379a4ce5abe143cea  packages/trpc/src/authz/permissions.ts
9ba86be2cdf13c65b6348ad453e93dee  apps/api/src/audit/audit-log.writer.ts
265a923433c6d895f7e7b53351a2e59f  apps/api/src/trpc/ports/membership-read.port.adapter.ts
55cd8c4cd0ba050bf45db221a5329d4e  packages/trpc/src/index.ts
```
⚠ **Yedi mutasyon `lint`+`typecheck`'i YEŞİL geçti** → bu sürümün garantilerinin önemli bir kısmı
**testlerde ve grep kapılarında** yaşıyor, tip sisteminde değil. (`backend`'in FIX 1'de ölçtüğü
aynı olgu.) `packages/trpc/dist` her mutasyondan sonra **yeniden kuruldu** (tuzak 2).

---

## 6 · Eksik senaryo taraması

**Kapatılanlar (`qa` test yazdı — dört dosya, 22 test):**

| Boşluk | Nasıl ölçüldü | Kapatan |
| ------ | ------------- | ------- |
| `member.*` hiçbir izolasyon süitinde yok; çapraz yazma yalnızca durum kodu; **çift üyelik vakası depoda hiç yok** | `rg` (2 bağımsız ölçüm) | `member-cross-tenant.isolation.test.ts` — **5 test** |
| Tarayıcı girişi transitif kapanışı **mekanik değil** (S2 R-S2-2) | `rg` → hiçbir test hesaplamıyor | `browser-entry-closure.qa.test.ts` — **3 test** |
| KAPI 3 çok satırlı import kör noktası (L-4) | QA-M3b | güçlendirilmiş KAPI 3 + regresyon testi |
| Denetim izi UPDATE/DELETE kapısı yok (L-5) | QA-M4 | **KAPI 4** — 2 test |
| `PENDING_INVITATION_LIMIT` (50) **hiç çalıştırılmamış** — sürümün TEK kötüye kullanım denetimi | `rg "PENDING_INVITATION_LIMIT_REACHED"` → test dosyalarında **0** | `member-invite-negative.qa.test.ts` — **4 test**. ⚠ **Davranış DOĞRU çıktı**: sınırda 409 + `details:{}` + satır açılmıyor; **tazelemede üst sınır tetiklenmiyor** (hata kodu `INVITATION_RESEND_TOO_SOON`, `PENDING_INVITATION_LIMIT_REACHED` **değil**) → S4'ün bilinçli inceliği **ölçüldü** |
| `ALREADY_MEMBER` **hiç çalıştırılmamış** | `rg` → **0** | aynı dosya: 409 + satır açılmıyor + e-posta gövdeye sızmıyor + **büyük/küçük harf atlatması kapalı** |

**Kapanmayanlar (gerekçeli):**
- **`member.*` için Playwright e2e YOK ve bu sürümde İMKÂNSIZ** — kök `pnpm test:e2e` script'i **yok**
  (AGENT_BASELINE §6; yalnızca `apps/admin`), `member.*` **tarayıcıdan erişilemez** (ADR-0011 md 4,
  `po` K-PO5 üç bağımsız ölçümle teyit etti) ve `apps/admin` diff'i **BOŞ**. Kritik akış (kayıt→
  davet→kabul) e2e'ye **v0.1.0'da** (panel kiracı seçimi) bağlanabilir. **Bu turda bulgu değil.**
- **Zod girdi hatalarının alan bazlı gövdesi** — K-A10 **yazılı olarak bu sürümde çözülmüyor**
  (vade v0.0.18). Davranışı ölçtüm: `owner` rolüyle davet **≥400** alıyor ve satır **açılmıyor**;
  gövde jenerik ve her hatalı girdi bir `warn`/`error` kaydı üretiyor (ölçtüm, `ZodError` yığın izi
  dahil). **Kapsam dışı, borç yerinde.**
- **`INVITATION_TTL_MS` sınırının süresi GEÇMİŞ davetle ölçümü** — `expiresAt` geçmişe alınabilir ama
  cooldown/`updatedAt` Prisma yönetiminde; S5 aynı kısıtı ölçtü. TTL **expiresAt değeri üzerinden**
  ölçülüyor (±60s, sabit import edilerek). ⚠ `solid` L-2'nin kaydettiği *"süresi geçmiş satırlar hiç
  temizlenmiyor"* borcu **duruyor**.

---

## 7 · Flake sıklığı — ÖLÇÜLDÜ (T-013'te hiç ölçülmemişti)

`backend`'in kaydettiği flake: `trpc-storefront-tenant-read-port-adapter.test.ts`'in `beforeAll`'unda
ioredis **`Command timed out`** (58 worker aynı Redis'e).

| Ölçüm | Sonuç |
| ----- | ----- |
| Tam `pnpm test --force` koşumu | **3** (koşum 1, 2, 3) |
| `Command timed out` / `ECONNRESET` / `ETIMEDOUT` / `unhandled` | ⚠ **3 koşumda 0 kez** — hiç tekrarlamadı |
| AC8'in yedi komutu | **3/3 koşumda yedisi de exit 0** |
| Hedefli alt süit koşumu (mutasyon turları) | ~20 koşum, **deterministik** — her mutasyon aynı testi aynı biçimde kırdı |
| `MaxListenersExceededWarning` | koşum başına **tam 3**, her koşumda **aynı** → **deterministik, flake değil**; S5 bunun S5'ten ÖNCE de var olduğunu ölçmüştü → **gerileme değil** |

→ **Bu turda flaky davranış GÖZLENMEDİ.** `backend`'in kaydı tekil bir olay olarak duruyor; sıklık
**3 koşumda 0**. ⚠ `fileParallelism: false` kaldırılırsa `member-owner-invariant.test.ts`'in
eşzamanlı devir testi yarış verir (S5'in kaydı, **değişmedi**).

---

## 8 · `qa`'nın yazdığı dosyalar

| Dosya | Test | Koştuğu kapı |
| ----- | ---- | ------------ |
| `apps/api/src/__tests__/member-cross-tenant.isolation.test.ts` | **5** | `pnpm test:isolation` |
| `apps/api/src/__tests__/member-invite-negative.qa.test.ts` | **4** | `pnpm test` |
| `packages/trpc/src/__tests__/browser-entry-closure.qa.test.ts` | **3** | `pnpm test` |
| `apps/api/src/__tests__/production-write-path-grep.qa.test.ts` (güçlendirildi) | 7 → **10** | `pnpm test` |

🚫 **Üretim kodu kalıcı olarak DEĞİŞTİRİLMEDİ** (altı dosyanın md5'i §5'te). Dokunma listesindeki
hiçbir dosyaya dokunulmadı: `auth.guard.ts` · `shutdown.test.ts` · `worker-shutdown.test.ts` ·
`fixtures/shutdown-child.ts` · `queue/**` · `main.ts`/`main.worker.ts` · `ROADMAP`/`CHANGELOG`/
`CLAUDE.md`/`.changeset`/`docs`/`infra`/`.github`/`.env`. **20 `low` kapatılmadı.**
`prettier --write` **yalnızca kendi dört dosyamda** çalıştırıldı.

---

## 9 · DOĞRULANAMADI (§5)

1. **Kök `pnpm test` toplamı 1261 ARİTMETİK** — son `qa` dosyası eklendikten sonra kök koşum
   **tekrarlanmadı** (Orkestratör'ün açık talimatı: AC8'i yeniden koşturma). Bileşenleri ölçüldü:
   koşum 3'ün **1257**'si (`--force`, 0 cached) + `@arkesoft/api`'nin **479**'u (475 → +4, paket
   kapsamlı, exit 0). `test:isolation` **53** koşum 3'te **doğrudan ölçüldü** ve yeni dosya onu
   değiştirmiyor (`.qa.test.ts` deseni izolasyon `include`'una girmez).
2. **`pnpm test:contract` / `test:visual` koşturulmadı** — ⚠ **bu sürümde kök script'leri YOK**
   (`test:contract` vade v0.0.22). Public API etkisi (**minor**) `architect`'in elle analiziyle
   duruyor; `qa` bunu **bağımsız doğrulamadı**.
3. **`member.*` için Playwright e2e koşturulmadı** — kök script yok + uç tarayıcıdan erişilemez (§6).
4. **`catalog-lint`'in 20 kuralının iki yeni tabloda bulgu üretmediği** `qa` tarafından yeniden
   ölçülmedi; S1/S3'ün `catalog-lint-live.isolation.test.ts` koşumu (6 test) **benim kök
   `test:isolation` koşumumun içinde** yeşil geçti — ama kuralları tek tek **ben** doğrulamadım.
5. **`solid`'in örnekleyemediği altı T-014 dosyası** `qa` tarafından da satır satır okunmadı; `qa`'nın
   kapsamı **kabul kriteri + çalıştırılan ölçüm** odaklıydı. ⚠ **O dosyalarda bulgu olmadığını iddia
   etmiyorum.**
6. **`AUTH_TRUSTED_PROXY_COUNT`'un üretim değeri** bilinmiyor (`security` tur 1 ile aynı boşluk) →
   `ip` kaydının üretimdeki doğruluğu ölçülemedi.
7. **20 `low`'un hiçbiri yeniden doğrulanmadı** (kapsam dışı) — tek istisna L-4, L-5, L7 (brief
   bunları bana devretti).
