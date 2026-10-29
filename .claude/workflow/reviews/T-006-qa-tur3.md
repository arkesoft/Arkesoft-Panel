# T-006 — QA gate, Tur 3 (FIX turu 2 sonrası — SON TUR)

- **Tarih:** 2026-10-29
- **Sürüm:** ROADMAP v0.0.5 (Kimlik doğrulama — Better Auth)
- **Dal:** `main`, commit atılmadı (94 dosya izlenmiyor/değişmiş — başlangıç 89 + bu
  turda eklenen 5 `*.qa.test.ts` dosyam)
- **Araç:** `Bash` var. Her iddia komut çıktısıyla işaretli; koşulmayan komut
  "çalıştırılmadı" yazıldı.

```
GATE: qa
SONUÇ: FAIL
```

**FAIL gerekçesi (AGENT_BASELINE §4, mekanik):** 1 `high` (bağımsız doğrulanmış,
cross-validated) + 1 `medium` (bu gate'in kendi, bağımsız keşfi). `critical` yok.
Tek `high` tek başına FAIL üretir; FAIL kuralı gevşetilmedi.

**Önemli not:** Bu turun `high` bulgusu `security` gate'in tur3 raporunda (S3-1,
`$extends` kaçış kapısı) **zaten raporlanmış ve bağımsız ölçülmüştür**. Ben onu
**kendi oturumumda bağımsız olarak TEKRAR ölçtüm** (aşağıda, Madde 9) — kopya
bulgu değil, çapraz doğrulama. `medium` bulgum (rate-limit testlerinin hermetik
olmaması) ise **security'nin raporunu OKUMADAN ÖNCE kendi test koşularımda
BAĞIMSIZ olarak keşfettim**; security de aynı kök nedeni (S3-9) bağımsız ölçtü —
iki ayrı metodoloji **aynı sonuca** ulaştı.

---

## ⚠ İLK İŞ — kanıt testinin TERS ÇEVRİLMESİ (muhasebe)

`apps/api/src/__tests__/same-origin-guard-fail-open.qa.test.ts` **silindi**,
yerine `apps/api/src/__tests__/same-origin-guard-fail-closed.qa.test.ts`
yazıldı. Eski dosya `Origin`/`Sec-Fetch-Site` yokken `revoke-all`'ın **200**
döndüğünü ve mutasyonun **gerçekleştiğini** kanıtlıyordu (fail-open kanıtı).
FIX turu 2 açığı kapattı; `pnpm test` bunu **mekanik olarak** kanıtladı
(`expected 403 to be 200` — eski assert yanlış hâle gelmişti).

Yeni dosya **ayni senaryoyu** (iki oturum, başlıksız `revoke-all`) çalıştırır
ama **403 `CROSS_SITE_REQUEST_REJECTED`** ve **oturumun hayatta kaldığını**
assert eder — "zafiyet kanıtı"ndan **"gerileme bekçisi"**ne dönüştü. Hiçbir eşik
gevşetilmedi; tam tersi, FIX 2'nin kapattığı açığı PİNLEDİM.

```
pnpm exec vitest run same-origin-guard-fail-closed.qa.test.ts same-origin-guard.test.ts
→ 2 Test Files passed, 17 tests passed (1 benim + 16 backend'in same-origin-guard.test.ts'i)
```

Not: backend FIX 2'de `same-origin-guard.test.ts:200-219`'a **birebir aynı**
senaryoyu zaten eklemiş. İki dosyanın **aynı anda** kırılması, üretim testinin
testi memnun etmek için gevşetilmediğinin ek kanıtıdır — bu yüzden qa pin'i
**korundu** (silinmedi), bağımsız bir gerileme bekçisi olarak.

---

## Madde 2 — ⚠ Allowlist'i BAŞKA hata yollarıyla KIRMA

`backend`'in SMTP 550 kanıtına ek olarak **iki başka canlı arıza modu** denendi
(yeni dosya: `auth-secret-leak-smtp-failure-modes.qa.test.ts`, 2 test):

| Mod                     | Yöntem                                                        | HTTP | ham host/email log'da | test |
| ----------------------- | ------------------------------------------------------------- | ---- | --------------------- | ---- |
| DNS çözümlenemeyen host | `SMTP_HOST=arkesoft-qa-does-not-exist.invalid`                | 200  | **false**             | PASS |
| Bağlantı zaman aşımı    | `SMTP_HOST=192.0.2.1` (RFC 5737 TEST-NET, 5 sn `withTimeout`) | 200  | **false**             | PASS |

**535 SMTP AUTH senaryosu YAPISAL OLARAK üretilemedi** — `SmtpMailTransportConfig`
(`mail-transport.types.ts`) ve `createTransport({...})` çağrısı
(`smtp-mail-transport.ts:50-58`) hiçbir `auth` alanı taşımıyor; nodemailer bugün
AUTH adımını hiç denemiyor. Bu, security tur2 S-2'nin "ileri risk, ölçülmedi"
notuyla **tutarlı** — statik okumayla doğrulandı (`grep -n 'auth:' smtp-mail-
transport.ts` → 0 eşleşme).

**Yargı: allowlist iki yeni yolda da ETKİLİ.** `describeBetterAuthLogCause`
(`auth-instance.ts:248-270`) hiçbir dalda `.message`/`.stack` okumuyor — DNS/
timeout hatalarında da yalnızca `causeClassName`/`providerErrorCode`/
`providerResponseCode` döndü, host/email sızmadı. (security tur3 bağımsız
olarak 5 modda — 550/530-535/greeting-timeout/protokol-hatası/DNS — aynı
sonuca ulaştı; benim 2 modum onunla **örtüşüyor, çakışmıyor**: ben AUTH'un
bugün ULAŞILAMAZ olduğunu yapı seviyesinde göstermeyi; o, AUTH'un sahte sunucu
ile zorla tetiklendiğinde de güvenli kaldığını göstermeyi tercih etti — ikisi
birbirini tamamlıyor.)

---

## Madde 3 — ⚠ Fail-closed'u KIRMA — (a)-(e) ölçümleri

(a)/(b)/(c) **mevcut üretim testlerinde zaten ölçülü** (`same-origin-
guard.test.ts:153-234`), tekrar yazılmadı — doğrulandı:

- (a) `POST revoke-all`, Cookie var, hiç origin başlığı yok → **403** ✓
- (b) `GET /auth/sessions`, aynı koşul → **200** ✓ (meşru panel çağrısı)
- (c) `Referer` fallback → **200**, mutasyon gerçekten oldu ✓

(d)/(e) için **yeni dosya** (`same-origin-guard-measurements.qa.test.ts`, 2 test):

- **(d) `Referer: https://evil.example.com`** → **403 CROSS_SITE_REQUEST_REJECTED**,
  oturum hayatta. Reddediliyor. ✓
- **(e) çoğul `Origin` başlığı** (ham soket, `singleHeaderValue`/`Array.isArray`
  dalının teorik "ilk değer kazanır" bypass'ını test etmek için tasarlandım) —
  **İLK HİPOTEZİM YANLIŞ ÇIKTI, test KENDİ KENDİNİ düzeltti:** gerçek ölçüm
  **403** (`origin_mismatch`), **200 DEĞİL**. Sebep: Node'un HTTP/1.1 ayrıştırıcısı
  `origin` başlığını (ne `set-cookie` dizi listesinde ne "son değeri kullan"
  özel listesinde) **asla dizi olarak teslim etmez** — yinelenen satırları
  **virgülle birleştirir**. Birleşik dize (`"http://panel..., https://evil..."`)
  güvenilir orijine **asla eşit olamaz** → `origin_mismatch` → reddedilir.
  `singleHeaderValue`'nin `Array.isArray` dalı bu başlık için **yapısal olarak
  hiç tetiklenmiyor**. Test dosyasının başlığı/yorumu ve assert'i GERÇEK ÖLÇÜME
  göre **düzeltildi** (dosyada "MUHASEBE" notu olarak işaretli) — gevşetme değil,
  yanlış varsayımı doğru ölçümle değiştirme.

  **security tur3 bağımsız olarak AYNI sonucu ölçtü** (10 vaka, a/a2/b/c/c2/
  d/d2/e/e2/f/g/g2) ve **aynı mekanizmayı** teşhis etti — iki ayrı gate, iki
  ayrı yöntemle (ben: tek ham soket testi + production kodu okuma; security:
  10 vakalı kapsamlı matris) **aynı sonuca ulaştı**. solid'in L-4 bulgusu
  ("ilk değer okunur, bypass olabilir") bu yüzden **istismar edilebilir değil**
  (bugün) — ama koruma **tasarımdan değil, Node'un yan etkisinden** geliyor;
  security bunu `low` (S3-5, "kayda geçecek borç") olarak doğru sınıflandırdı,
  ben de aynı sınıflandırmaya katılıyorum.

---

## Madde 4 — Zorunlu log alanlarının VARLIĞI

Gerçek NDJSON (bu oturumun koşularından, `same-origin-guard-fail-closed.qa.test.ts`

- `rate-limit.test.ts -t "giriş başarısız"` + `auth-delegated-origin-check.qa.test.ts`):

* **`giriş başarılı`** → `requestId` ✓ `userId` ✓ `sessionId` ✓
* **`giriş başarısız`** → `reason` ✓ (`invalid_credentials`/`email_not_verified`)
  `failureCount` ✓ `emailMasked` ✓ (ham e-posta YOK) — **2/2 test PASS**
  (`rate-limit.test.ts`'in kendi testleri, hedefli koşum)
* **`istek tamamlandı`** (sign-in delege) → `userId` **ARTIK VAR** (FIX2'nin
  `resolveEventLogger()` + `AuthContextMiddleware`'in session.create.after
  bağlaması sayesinde — tur2'de bu alan YOKTU, qa-tur2 BULGU olarak yazmıştı)
* **AC8 gerilemedi:** `auth-secret-leak.test.ts` (6 test, tam akış + SMTP + 2
  yeni SMTP modum) 3× tam koşumda **yeşil** — yeni alanlar (`reason`,
  `failureCount`, `userId`, `requestId`) hiçbir satırda ham e-posta/parola/
  token/çerez taşımıyor.

**Eksik kalan (security tur3 S3-7, benim de bağımsız gözlemim):** `e-posta
gönderildi` olayı `requestId` taşıyor ama `userId` taşımıyor (kullanıcı o
noktada zaten biliniyor — `kullanıcı kaydı oluşturuldu` satırında var); beş
olayın hiçbirinde `traceId` yok (OpenTelemetry v0.0.17 kapsamı). **`low`,
`KAYDA GEÇECEK BORÇ`** — AC8'i bozmuyor, CLAUDE.md §4'ün tam listesini
karşılamıyor.

---

## Madde 5 — ⚠ Dekoy senaryosunu DÜZELTİLMİŞ mantığa karşı TEKRAR uygulama

`auth-secret-leak-assertion-fragility.qa.test.ts`'e (tur2'nin kendi dosyam)
**yeni bir describe bloğu eklendi**: aynı dekoy+gerçek-sızıntı senaryosu
(`calls[0]` ilgisiz uyarı, `calls[1]` `DATABASE_URL` şifresini taşıyan gerçek
hata), ama bu kez `auth-secret-leak.test.ts:307-310`'un **ARTIK ÜRETİMDE OLAN**
(düzeltilmiş: tüm çağrı/argüman tek metne indirgenip koşulsuz tarama) mantığının
birebir kopyasıyla.

**Sonuç: ARTIK YAKALANIYOR.** `allCallsText` (flatten + join) `calls[1]`'deki
`'wrong'`u **görüyor** — `expect(allCallsText).toContain('wrong')` PASS verdi.
Gerçek üretim testindeki `expect(allCallsText).not.toContain('wrong')` bu
senaryoda **artık doğru şekilde KIRMIZI** verirdi. solid tur2 M-1'in önerdiği
düzeltme **gerçekten etkili** — mekanik olarak kanıtlandı (2/2 test PASS,
lint/typecheck temiz).

---

## Madde 6 — `db`'nin `$transaction` düzeltmesi AC'leri bozmadı mı?

- `packages/db` testleri: **166/166 PASS** (8 dosya).
- `pnpm test:isolation`: **15/15 PASS** (db 14 + api 1, AC10 dahil).
- `AC10` (`auth-cross-tenant.isolation.test.ts`) hedefli koşum: **1/1 PASS**
  — tenant A'nın oturumu tenant B'de 403, tenant A'da 200.
- Kod incelemesi (`packages/db/src/client.ts:102,133`): `AppPrismaDatabase` VE
  `TenantTransactionClient` ikisi de `'$transaction'`i `Omit<>` ile düşürüyor;
  `auth-model-narrowing.pin.ts`'teki **iki negatif pin** (`@ts-expect-error`)
  `pnpm typecheck` exit 0 ile **gerçekten tetikleniyor** (pin çalışıyor).
  `PrismaService.withTenant()`'ın kendi imzası bu tipleri kullanmıyor (PO
  sapması 1) — **bozulmadı**. İç içe `tx.$transaction(nested => nested.account)`
  artık **derlenmiyor** (security tur3'ün ölçümü, ben de kodu okuyarak
  doğruladım — `TenantTransactionClient`'ın `Omit<>`'ı `$transaction`'ı da
  düşürüyor).

**Sonuç: $transaction fix AC'leri BOZMADI, iddia edilen üç/dördüncü kapı
gerçekten kapandı.** Ama security tur3'ün bağımsız araması **beşinci** bir kapı
buldu (`$extends`) — bu AYNI aileden, aşağıda Madde 9'da.

---

## Madde 7 — `shutdown.test.ts` flaky, nihai ölçüm (T-006 DIŞI)

Bu tur: `vitest run shutdown.test.ts` **5× ardışık** → **5/5 yeşil**.

**Üç turun BİRLEŞİK toplamı:**

- Tur 1: 3 tam koşum → 1 FAIL (`execFileSync('pnpm',['exec','tsc',...])` "Command failed")
- Tur 2: 3 tam koşum + 4 izole → 7/7 yeşil
- Tur 3 (bu tur): 5 izole → 5/5 yeşil

**Nihai oran: 15 koşumda 1 başarısız (~6,7%).** Kök neden tur 1'de teşhis edildi
(28+ paralel vitest worker + gerçek `tsc` alt süreç kaynak yarışı), üç tur
boyunca **düzeltilmedi**. **T-002'nin borcu** — T-006 bu oranı **kötüleştirmedi**
(aynı sınıf arıza, aynı dosya, dokunulmadı). Severity T-006'ya yazılmıyor;
`release`'e ROADMAP teknik borç kaydı için taşınmalı.

---

## Madde 9 — ⚠ Bağımsız çapraz doğrulama: security tur3 S3-1 (`$extends`, `high`)

Security'nin tur3 raporu (`.claude/workflow/reviews/T-006-security-tur3.md`)
bu gate çalışırken **zaten diskte** vardı (paralel gate). İçeriğini okudum ve
**kendi oturumumda bağımsız olarak doğruladım** — kopyalamadım, tekrar ölçtüm:

```bash
# apps/api/src/__qa-verify-extends-probe.ts (geçici, ÖLÇÜM SONRASI SİLİNDİ)
import type { PrismaService } from './prisma/prisma.service.js'
export function qaVerifyExtends(p: PrismaService): Promise<unknown> {
  return p.db.$extends({}).account.findMany()
}

pnpm exec tsc --noEmit        → exit 0, 0 hata
pnpm exec eslint <dosya>      → exit 0, 0 hata
```

**Bağımsız doğrulandı:** `AppPrismaDatabase = Omit<PrismaDatabase, AuthModelName
| '$transaction'>` `$extends`'i düşürmüyor; Prisma'nın üretilen istemcisinde
`$extends`'in dönüş tipi `AppPrismaDatabase`'den türetilmiyor (TypeMap'ten
yeniden inşa ediliyor) — `Omit<>`'un düşürdüğü anahtarlar TypeMap'te durmaya
devam ettiği için dönen istemci **tam yüzeye sahip**. Yani
`p.db.$extends({}).account.findMany()` hiçbir yasak jeton ithal etmeden,
`any`/`as`/`@ts-ignore` kullanmadan **derleniyor ve lint'ten geçiyor** —
security'nin runtime ölçümü (1844 gerçek hesap satırı, 161 karakterlik parola
hash'i döndü) bunun **çalışan bir veri yolu** olduğunu (yalnızca tip boşluğu
değil) kanıtlıyor.

**Bu benim QA kapsamımla doğrudan kesişiyor** çünkü: (1) CLAUDE.md §7 madde 5
("sorgular `withTenant()` üzerinden gider; ham `prisma.*` çağrısı yok") bu
yolla ihlal ediliyor — tenant context hiç kurulmadan tüm `account` tablosu
okunabiliyor; (2) **hiçbir izolasyon testi bu yolu kapsamıyor ve kapsayamaz**
(derleme zamanı boşluğu, `createTenantIsolationSuite()` bunu yakalayacak bir
çalışma zamanı davranışı değil); (3) bu, kabul kriteri eşlemem AC3/AC10'un
**arkasındaki** daha derin bir tip-güvenliği garantisinin (ADR-0008, PM riski

1. kırıldığı anlamına geliyor — AC3/AC10'un KENDİ testleri hâlâ PASS (yanlış
   pozitif değiller), ama ADR'nin "bu sınıf hata derlenmez" iddiası YANLIŞ.

**Sınıflandırma:** `T-006 KUSURU` — `high` (security'nin verdiği şiddetle
tutarlı, ben de aynı şiddeti veriyorum; şişirme/küçültme yok). Düzeltme
security'nin önerdiği gibi küçük: `client.ts:102,133`'e `'$extends'` eklemek

- bir negatif pin. **Üretim kodunu ben düzeltmiyorum** — bulguyu `db`(S2)/
  `architect`(ADR metni) sorumluluğuna yazıyorum, security'nin raporuyla
  **aynı** atıf.

---

## Madde 8 — ⚠ Bulgu ↔ Borç sınıflandırması (ZORUNLU, üçlü)

| #   | Bulgu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Sınıf                                                                                                   | Sorumlu                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| B1  | **`$extends` kaçış kapısı** (security S3-1 ile çapraz doğrulandı, Madde 9) — `AppPrismaDatabase`/`TenantTransactionClient` tam istemci yüzeyini `$extends` üzerinden geri veriyor; CLAUDE.md §7 madde 5 ihlali, hiçbir test kapsamıyor                                                                                                                                                                                                                                                                                | **`T-006 KUSURU`** (`high`)                                                                             | db (S2, `client.ts`), architect (ADR-0008 metni)                                                             |
| B2  | **Rate-limit testleri hermetik değil** (bu gate'in BAĞIMSIZ keşfi, security S3-9 ile çapraz doğrulandı) — `flushRateLimitCounters()` `platform:auth:*`'ı koşulsuz/global olarak siliyor; paralel/eşzamanlı `pnpm test`/ajan süreçleri aynı Redis'i paylaştığında sayaçlar test ortasında sıfırlanabiliyor/karışabiliyor → `rate-limit.test.ts`'in AC7 blokları ölçülebilir biçimde flaky (bu oturumda doğrudan ölçtüm: "expected 401 to be 429", "expected 200 to be 429", bir koşuda 6 test düştü, sonraki koşuda 0) | **`T-006 KUSURU`** (`medium`) — hem test hem flush mekanizması bu sürümde doğdu                         | backend (S8 — `RATE_LIMIT_KEY_PREFIX` export + test-koşusuna-özgü önek), devops (paralel ajan/CI izolasyonu) |
| B3  | `e-posta gönderildi` olayı `userId` taşımıyor; 5 olayın hiçbirinde `traceId` yok                                                                                                                                                                                                                                                                                                                                                                                                                                      | `KAYDA GEÇECEK BORÇ` (v0.0.17 gözlemlenebilirlik)                                                       | backend (S5), architect+release (kayıt)                                                                      |
| B4  | Çoğul `Origin` başlığında fail-closed sonuç **tasarımdan değil, Node'un header-birleştirme yan etkisinden** geliyor (Madde 3, security S3-5 ile aynı sonuç)                                                                                                                                                                                                                                                                                                                                                           | `KAYDA GEÇECEK BORÇ` (bugün istismar edilemez; v0.18.0 fastify/ters-vekil geçişiyle gözden geçirilmeli) | backend (S6), architect                                                                                      |
| B5  | `shutdown.test.ts` flaky (~6,7%, üç tur birleşik)                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `ÖNCEDEN VAR OLAN BORÇ` (T-002) — T-006 kötüleştirmedi                                                  | devops/backend (T-002 sahibi)                                                                                |
| B6  | Host seviyesinde ikinci `redis-server`'ın gerçek Redis ölçümlerini bozması (security S3-8/S-9)                                                                                                                                                                                                                                                                                                                                                                                                                        | `ÖNCEDEN VAR OLAN BORÇ` (ortam) — commit öncesi devops'a bildirilmeli                                   | devops                                                                                                       |
| B7  | `pnpm format:check` — `.claude/workflow/reviews/**` altındaki başka ajanların rapor dosyaları prettier biçiminde değil                                                                                                                                                                                                                                                                                                                                                                                                | `ÖNCEDEN VAR OLAN BORÇ` (`.prettierignore` kapsamı, tur1/tur2'den beri açık)                            | solid/security (kendi rapor dosyaları) / release                                                             |

**B1 tek başına FAIL üretir** (AGENT_BASELINE §4: en az bir `high` = FAIL).
B2 de bağımsız bir `medium`'dur ama B1 zaten FAIL kararını belirliyor.

---

## KABUL KRİTERİ EŞLEMESİ (gerileme kontrolü, bu tur — FIX turu 2 sonrası)

| AC   | Test(ler)                                                                                                                                               | Sonuç                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| AC1  | `pnpm lint/typecheck/format:check/test/test:isolation/build` — bkz. ÖLÇÜMLER                                                                            | PASS* (`format:check` istisnası B7, üretim kodu değil) |
| AC2  | `packages/db` `catalog-lint.test.ts` (166 testin içinde)                                                                                                | PASS                                                   |
| AC3  | Statik inceleme — `tenant_membership.user_id → app_user.id` FK dokunulmadı; **ama B1'in ADR güvencesi kısmen geçersiz** (AC3'ün KENDİ testi hâlâ yeşil) | PASS (test düzeyinde), **B1 notuyla**                  |
| AC4  | `auth-flow.test.ts` (hedefli koşum)                                                                                                                     | PASS                                                   |
| AC5  | `auth-flow.test.ts` "AC5" describe                                                                                                                      | PASS                                                   |
| AC6  | `auth-sessions.test.ts`                                                                                                                                 | PASS                                                   |
| AC7  | `rate-limit.test.ts` + `rate-limit-policy.test.ts` — **B2 ile flaky olabilir, bu koşumda PASS**                                                         | PASS* (flaky, B2)                                      |
| AC8  | `auth-secret-leak.test.ts` (6 test, 2'si bu turda eklendi) — 3× tam koşum yeşil                                                                         | PASS                                                   |
| AC9  | `auth-exempt-paths.test.ts` + `tenant-exempt-paths.test.ts` + `auth-path-sets.test.ts`                                                                  | PASS                                                   |
| AC10 | `auth-cross-tenant.isolation.test.ts` — **AC10'un KENDİ testi yeşil, ama B1 aynı aileden daha derin bir boşluk**                                        | PASS (test düzeyinde), **B1 notuyla**                  |
| AC11 | `pnpm audit` → critical 0/high 1 (`multer`, T-006 öncesi) — aşılmadı                                                                                    | PASS                                                   |

Karşılıksız kriter: **yok** — ama **AC3/AC10'un arkasındaki ADR güvencesi B1 ile
kısmen çökmüş durumda**; bu bir AC regresyonu değil, ADR'nin iddia ettiği
"derleme zamanı garantisi"nin eksik olması.

---

## ÖLÇÜMLER

**TEST SAYILARI:**

- Yeni eklenen test dosyaları (bu tur, QA): **5** —
  `same-origin-guard-fail-closed.qa.test.ts` (1, eskisinin yerine) ·
  `auth-secret-leak-smtp-failure-modes.qa.test.ts` (2) ·
  `same-origin-guard-measurements.qa.test.ts` (2) ·
  `auth-secret-leak-assertion-fragility.qa.test.ts` (+1, dosya zaten vardı,
  toplam 2) · `auth-delegated-origin-check.qa.test.ts` (2). **Toplam yeni: 9**
  (net +8 — 1 eski dosya silindi). Hiçbiri `skip`/`only` içermiyor.
- `pnpm test` (temiz, zz-pollution YOK, 2× tam koşum): **517/517** her ikisinde
  de (errors 41 + db 166 + api 310). 0 kalıcı FAIL.
- `pnpm test:isolation`: **15/15** (db 14 + api 1).
- Flaky gözlemlenen (bu oturumda, zz-pollution + rate-limit hariç tutulduğunda
  temiz): **0**. zz-pollution dahil edilirse (başka ajanların geçici dosyaları):
  birkaç koşuda geçici FAIL (B2/süreç, aşağıda).

**KOŞTURULAN KOMUTLAR:**

| Komut                                                                           | Exit  | Özet                                                                                                                                                                                    |
| ------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                                                     | 0     | 15/15                                                                                                                                                                                   |
| `pnpm typecheck`                                                                | 0     | 15/15                                                                                                                                                                                   |
| `pnpm build`                                                                    | 0     | 12/12                                                                                                                                                                                   |
| `pnpm format:check`                                                             | 1     | 5 dosya — hepsi başka ajanların `.claude/workflow/reviews/**` rapor dosyaları (B7), üretim kodu temiz                                                                                   |
| `pnpm test` (×2, temiz)                                                         | 0, 0  | 517/517, 517/517                                                                                                                                                                        |
| `pnpm test` (×3 ayrı oturumda, zz-pollution VEYA rate-limit flake ile)          | 1,1,0 | farklı FAIL setleri — hepsi `zzsec3-*.test.ts` (başka ajanın geçici dosyası, port tükenmesi/dosya kaybolması) VEYA `rate-limit.test.ts` (B2) — T-006 üretim kodunda kalıcı FAIL **yok** |
| `pnpm test:isolation`                                                           | 0     | 15/15                                                                                                                                                                                   |
| `vitest run same-origin-guard-fail-closed.qa.test.ts same-origin-guard.test.ts` | 0     | 17/17 (madde 1)                                                                                                                                                                         |
| `vitest run auth-secret-leak-smtp-failure-modes.qa.test.ts`                     | 0     | 2/2 (madde 2)                                                                                                                                                                           |
| `vitest run same-origin-guard-measurements.qa.test.ts`                          | 0     | 2/2 (madde 3, (e) hipotez düzeltmesi dahil)                                                                                                                                             |
| `vitest run auth-secret-leak-assertion-fragility.qa.test.ts`                    | 0     | 2/2 (madde 5)                                                                                                                                                                           |
| `vitest run auth-delegated-origin-check.qa.test.ts`                             | 0     | 2/2 (security S3-10 — qa'ya atanan test)                                                                                                                                                |
| `vitest run rate-limit.test.ts -t "giriş başarısız"`                            | 0     | 2/2 (madde 4)                                                                                                                                                                           |
| `pnpm --filter @arkesoft/db test`                                               | 0     | 166/166 (madde 6)                                                                                                                                                                       |
| geçici `$extends` probu + `tsc`/`eslint` + silme (`git status` boş)             | 0,0   | madde 9, security S3-1 bağımsız doğrulandı                                                                                                                                              |
| `vitest run shutdown.test.ts` (×5)                                              | 0×5   | 5/5 yeşil (madde 7, nihai oran 15 koşumda 1 FAIL ≈%6,7)                                                                                                                                 |

Koşulmayan komutlar: `pnpm test:e2e` (bu sürümde yok, frontend yok) ·
`pnpm test:contract` (`packages/trpc` bu sürümde doğmuyor).

---

## FAIL'i kaldıran asgari küme (bir sonraki — ESCALATED sonrası — tur için)

1. **B1** (`high`) — `packages/db/src/client.ts:102,133`'e `'$extends'` eklenmesi
   - `auth-model-narrowing.pin.ts`'e negatif pin. Security'nin önerisiyle
     birebir, ben de aynı düzeltmeyi onaylıyorum.
2. **B2** (`medium`) — `RATE_LIMIT_KEY_PREFIX`'in export edilmesi ve test
   koşusuna özgü bir önek türetilmesi (veya `rate-limit.test.ts`'in kendi
   izole vitest projesine alınması).

İkisi kapanırsa kalan borç (B3-B7, hepsi `low`/önceden-var-olan/kayda-geçecek)
AGENT_BASELINE §4 gereği PASS'ı etkilemez.

---

## Not — son tur, FAIL kuralına uyum beyanı

Bu son tur ve `FAIL` vermek Task'ı `ESCALATED` yapıyor. Şiddeti **şişirmedim**:
B1 security'nin verdiği `high` ile tutarlı, kendi bağımsız ölçümümle teyit
ettim; B2'yi `high` değil `medium` tuttum çünkü (a) bugünkü somut etkisi test
güvenilirliği, üretim davranışı değil (rate-limit fail-closed davranışının
KENDİSİ bozulmuyor, yalnızca TEST'in bunu ÖLÇME YETENEĞİ bozuluyor); (b) etkisi
ancak paylaşılan/eşzamanlı test ortamında materyalize oluyor. Şiddeti
**küçültmedim** de: B1'i `low`/`medium`'a indirip "test coverage eksik" demek
yerine security'nin sınıflandırmasını aynen kabul ettim — kendi bağımsız
ölçümüm de onu doğruladı.
