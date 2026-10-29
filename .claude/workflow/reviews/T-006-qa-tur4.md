# T-006 — QA gate, Tur 4 (FIX turu 3 sonrası — dar kapsam gerileme turu)

- **Tarih:** 2026-10-29
- **Sürüm:** ROADMAP v0.0.5 (Kimlik doğrulama — Better Auth)
- **Dal:** `main`, commit atılmadı.
- **Araç:** `Bash` var. Her iddia komut çıktısıyla işaretli; koşulmayan komut
  "çalıştırılmadı" yazıldı. Hiçbir çıktı uydurulmadı.
- **Kapsam:** DAR — tur 3'ün FAIL gerekçesi olan `$extends` kaçış kapısının
  (B1/S3-1, `high`) FIX 3'teki düzeltmesinin AC gerilemesi yaratıp
  yaratmadığı + tur 3'ün kendi `medium`'u (B2/S3-9, rate-limit hermetikliği)
  hâlâ açık mı.

```
GATE: qa
SONUÇ: PASS
```

**PASS gerekçesi (AGENT_BASELINE §4, mekanik):** `critical` yok, `high` yok.
Tek bulgu — B2 (rate-limit hermetikliği) — bu turda **da bağımsız ölçülerek
AÇIK bulundu**, ama tur 3'te zaten `medium` olarak sınıflandırılmıştı; yeni bir
bulgu değil, aynı borcun **devam ettiğinin doğrulanmasıdır**. 1 `medium` →
AGENT_BASELINE §4: "1–2 `medium` → PASS — bulgular teknik borca kaydedilir."
Hiçbir AC'de gerileme ölçülmedi.

---

## Özet — tur 3'ün `high`'ı KAPANDI, bağımsız doğrulandı

Tur 3'te FAIL veren B1 (`$extends` kaçış kapısı, `packages/db/src/client.ts`)
FIX 3'te **mekanizma değişikliğiyle** (deny-list `Omit<>` → allowlist
`Pick<>`) kapatıldı. Bu turda bunu **kendi bağımsız kırma denemelerimle**
doğruladım (Madde 2) — `security`/`db`'nin raporunu okuyup kabul etmedim,
üç farklı mutasyonla (eksi üye, artı üye, gerçek tüketici) kendim kırdım.

---

## Madde 1 — AC1–AC11 gerileme kontrolü

Tam kapı + AC'ye özel hedefli koşumlar (hepsi gerçek Postgres + gerçek Redis,
komut çıktıları aşağıda ÖLÇÜMLER'de):

| AC   | Hedefli test                                                                                                                                                     | Sonuç |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| AC1  | `pnpm lint/typecheck/build` 15/15/12/12; `pnpm test` 518/518 (flush sonrası); `pnpm test:isolation` 15/15; `format:check` yalnızca B7 (başka ajan rapor dosyası) | PASS  |
| AC2  | `packages/db` `catalog-lint.test.ts` → 37/37 (hedefli koşum)                                                                                                     | PASS  |
| AC3  | `tenant_membership.user_id → app_user.id` FK dokunulmadı (statik); B1 kapandığı için ADR'nin derleme-zamanı güvencesi artık gerçek                               | PASS  |
| AC4  | `auth-flow.test.ts` (hedefli) — 2 dosya/21 test (AC5 ile birlikte)                                                                                               | PASS  |
| AC5  | `auth-flow.test.ts` "AC5" describe — yukarıdaki 21 testin içinde                                                                                                 | PASS  |
| AC6  | `auth-sessions.test.ts` — yukarıdaki 21 testin içinde                                                                                                            | PASS  |
| AC7  | `rate-limit.test.ts` **izole** 28/28 (Madde 3'teki çapraz-dosya senaryosu DIŞINDA tutarlı PASS)                                                                  | PASS  |
| AC8  | `auth-secret-leak.test.ts` + 2 QA dosyası (hedefli) → 7/7                                                                                                        | PASS  |
| AC9  | `auth-exempt-paths.test.ts` + `tenant-exempt-paths.test.ts` + `auth-path-sets.test.ts` (hedefli) → 3 dosya/50 test                                               | PASS  |
| AC10 | `auth-cross-tenant.isolation.test.ts` (hedefli, `vitest.isolation.config.ts`) → 1/1                                                                              | PASS  |
| AC11 | `pnpm audit` → critical 0 · high 1 (`multer`, T-006 öncesi) — mevcut 1 aşılmadı                                                                                  | PASS  |

**Karşılıksız kriter: yok. Gerileme: yok.**

---

## Madde 2 — ⚠ `Pick<>` allowlist'i KIRARAK doğrulama

Üç bağımsız mutasyon denendi, üçü de scratchpad yedeğiyle **geri alındı ve
`diff` ile kanıtlandı**.

### 2.1 — Yasak üyelerin GERÇEKTEN derlenmediği (geçici prob, SİLİNDİ)

`apps/api/src/__qa-verify-pick-probe.ts` (muafiyet dizini **dışında**):

```ts
p.db.$extends({}).account.findMany()        // beklenen: derlenmez
p.db.$transaction(async (tx) => ...)         // beklenen: derlenmez
p.db.$disconnect()                           // beklenen: derlenmez
```

```
pnpm exec tsc --noEmit -p apps/api/tsconfig.json | grep qa-verify-pick-probe
→ TS2339 '$extends' does not exist on type 'AppPrismaDatabase'.
→ TS2339 '$transaction' does not exist on type 'AppPrismaDatabase'.
→ TS2339 '$disconnect' does not exist on type 'AppPrismaDatabase'.
```

Dördüncü fonksiyon (`p.db.tenant`/`.user`/`.tenantMembership`/`.$queryRaw`)
**sıfır hata** üretti — meşru yol açık kaldı. Dosya **silindi**,
`git status --porcelain | grep qa-verify` → **boş**.

### 2.2 — `withTenant()` callback'i: meşru PASS, kötü niyetli FAIL

Aynı yöntemle `p.withTenant(id, tx => tx.tenantMembership.findMany())` **derlendi**
(sıfır hata), `p.withTenant(id, tx => tx.account.findMany())` → **TS2339
`'account' does not exist on type 'TenantTransactionClient'`**. Prob dosyası
silindi, `git status` boş.

### 2.3 — ⚠ Jenerik kapalı-dünya pin'in GERÇEKLİĞİ — iki yönlü mutasyon

`packages/db/src/client.ts` bir dosya yedeğine (`cp`, scratchpad) alındıktan
sonra **iki ayrı** mutasyon denendi:

**(a) Fazla üye** — `Pick<..., '$extends'>` eklendi:

```
pnpm --filter @arkesoft/db typecheck
→ TS2578 Unused '@ts-expect-error' (pinAppPrismaDatabaseDropsExtends — NEGATİF pin yakaladı)
→ TS2322 Type 'boolean' is not assignable to type [...'$extends'] (JENERİK pin AYRICA yakaladı)
```

**(b) Eksik üye** — `'$queryRaw'` listeden çıkarıldı:

```
pnpm --filter @arkesoft/db typecheck
→ TS2339 '$queryRaw' does not exist (POZİTİF pin yakaladı, ×2 satır)
→ TS2322 [...'EKSİK ANAHTAR'...'$queryRaw'] (JENERİK pin AYRICA yakaladı)
→ packages/db/src/health.ts(48,12): TS2339 '$queryRaw' does not exist
  — GERÇEK ÜRETİM TÜKETİCİSİ de kırıldı (pin teatral değil, `health.ts` fiilen bağımlı)
```

Her iki mutasyon sonrası dosya `cp` ile **geri yüklendi** ve
`diff client.ts client.ts.bak` → **IDENTICAL** (byte-birebir), ardından
`pnpm --filter @arkesoft/db typecheck` → **temiz** doğrulandı.

**Yargı:** jenerik pin hem fazla hem eksik yönde **gerçek ve bağımsız** bir
kapı; isim bazlı pin'lerle **örtüşmeden** ek güvence sağlıyor (ikisi birden
tetiklendi, biri diğerinin yedeği değil tek başına da yeter). `security`
tur3'ün ve `db`'nin iddiası mekanik olarak doğrulandı.

---

## Madde 3 — ⚠ `rate-limit.test.ts` hermetikliği — flush'SIZ iki ardışık koşum

**Hâlâ AÇIK — bağımsız ölçüldü, kök neden FIX 3'te DOKUNULMADI.**

```
redis-cli --scan --pattern 'platform:auth:*'   → 3 anahtar (önceki koşumdan artık)
pnpm test (flush YAPILMADI)                     → exit 1, api 2 failed / 310 (308 geçti)
redis-cli --scan --pattern 'platform:auth:*'   → 4 anahtar (ARTTI, silinmedi)
pnpm test (flush YİNE YAPILMADI, hemen ardından) → exit 1, api 6 failed / 310 (304 geçti)
redis-cli --scan --pattern 'platform:auth:*' | xargs redis-cli DEL
pnpm test (flush SONRASI)                       → exit 0, 518/518 (errors 41 + db 166 + api 311)
```

Başarısız olan testler iki koşumda **farklı** (ilk koşum IP-eşiği testleri,
ikinci koşum hesap-eşiği + kapsam-genişletme testleri) — bu, security tur3'ün
teşhisiyle **tutarlı**: `createTestApp()`'in flush'ı dosya **başında** koşar
ama dosyalar **paralel** çalışır; bir dosyanın flush'ı başka bir dosyanın
ortasındaki sayacı sıfırlar, ya da önceki bir koşumun artığı yeni koşumun
eşiğini önceden tüketir. `rate-limit.test.ts` **tek başına** (izole) çalışınca
28/28 yeşil (Madde 1 tablosu) — flakiness yalnızca **çok-dosya/çok-süreç**
Redis paylaşımında ortaya çıkıyor.

**Sınıflandırma: aynı kalır — `T-006 KUSURU`, `medium` (tur3 B2/S3-9 ile
BİREBİR aynı kök neden, FIX 3 bunu hedeflememiş/düzeltmemiş).** Severity
şişirilmedi: üretim davranışının kendisi (fail-closed rate limiting) **doğru**
kalıyor; bozulan şey bu davranışı ölçen testin **güvenilirliği**. CI'da da
(paralel dosya çalıştırma aynı) **aynı sınıf kırılma beklenmeli** —
`release`/`devops`'a taşınmalı.

**Orkestratörün "temiz ölçüm" notuyla çelişmiyor:** Orkestratör flush
**yaptıktan sonra** 517/517 ölçtü — bu doğru ve tekrarlandı (Madde 1). Benim
ölçümüm flush'SIZ senaryo; ikisi **farklı önkoşulları** ölçüyor, ikisi de
doğru.

---

## Madde 4 — Pin kalitesi (Madde 2.3 ile birleşik)

Jenerik pin hem fazla hem eksik anahtar mutasyonunda **gerçek** kırılma
üretti (Madde 2.3) — isim bazlı pin'lerle aynı anda tetiklendi ama **ondan
bağımsız** bir kanıt yolu (tip-seviyesi `Exclude<>` karşılaştırması).
Üç bağımsız ölçüm (`db`, `security` tur3, `qa` tur3+tur4) aynı sonuca ulaştı.

---

## Madde 5 — ⚠ Belge ↔ davranış uyumu — belgeyi KOŞTURARAK test

`docs/development.md` "E-posta Gönderilemedi — Kurtarma Yolu" bölümünün
iddialarını **okuyup kabul etmedim** — yeni bir test dosyası yazıp **gerçek
Postgres + gerçek HTTP + kasıtlı ulaşılamaz SMTP** ile koşturdum:

`apps/api/src/__tests__/auth-docs-behavior-verification.qa.test.ts` (1 test,
kalıcı — repoda bırakıldı, `skip`/`only` yok):

- `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1` (bağlantı reddi, "Mailpit down"un
  birebir karşılığı) ile `POST /auth/sign-up/email` → **2xx** ✓ (doc iddiası
  ile örtüşüyor)
- `prismaService.db.user.count({where:{email}})` → **1** (satır GERÇEKTEN
  oluştu) ✓
- Log metni → `"causeCode":"MAIL_DELIVERY_FAILED"` **VAR** ✓,
  `"providerErrorCode"` **VAR** ✓, ham e-posta **YOK** ✓
- **Aynı e-posta ile ikinci** `sign-up/email` çağrısı → **2xx**, **birinciyle
  AYNI status** (varlık sızdırmazlığı) ✓, satır sayısı **hâlâ 1** (ikinci
  satır oluşmadı) ✓

```
pnpm exec vitest run src/__tests__/auth-docs-behavior-verification.qa.test.ts
→ 1 Test File passed, 1 test passed
pnpm exec eslint src/__tests__/auth-docs-behavior-verification.qa.test.ts → temiz (çıktı yok)
pnpm exec tsc --noEmit (apps/api)                                          → temiz (çıktı yok)
```

**Yargı: `docs`'un FIX 3'te runbook'a yazdığı iki iddia (503→2xx, "zaten
kayıtlı"→200) GERÇEK DAVRANIŞLA ÖRTÜŞÜYOR.** Bulgu yok.

**Not (çapraz-gate, kendi bulgum DEĞİL):** `solid` tur4 bu bölümün **hemen
üstündeki** "Log Olayları" tablosunda (`development.md:564-575`, M4-2,
`medium`) iki olgusal hata buldu (`tenantId` hücresi + `traceId` cümlesi) —
benim madde 5 kapsamım (SMTP/causeCode iddiaları) bu tabloyu kapsamıyordu,
tekrar ölçmedim; `solid`'in bulgusunu kopyalamıyorum, yalnızca çakışma
olmadığını not ediyorum (solid kendi gate'inde raporlamış).

---

## Madde 6 — `shutdown.test.ts` nihai oran (T-006 DIŞI, severity T-006'ya yazılmaz)

Bu tur: `vitest run shutdown.test.ts` **5× ardışık** → **5/5 yeşil**.

**Dört turun BİRLEŞİK toplamı:**

- Tur 1: 3 tam koşum → 1 FAIL
- Tur 2: 7 koşum → 7/7 yeşil
- Tur 3: 5 koşum → 5/5 yeşil
- Tur 4 (bu tur): 5 koşum → 5/5 yeşil

**Nihai oran: 20 koşumda 1 başarısız = %5.** T-002'nin borcu, T-006
kötüleştirmedi. `release` ROADMAP teknik borç kaydına bu nihai oranı
(**%5, 20 koşum**) taşımalı.

---

## Bulgu ↔ Borç sınıflandırması (üçlü, zorunlu)

| #                | Bulgu                                                                                | Sınıf                                                                                           | Sorumlu                                                                           |
| ---------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| B1 (tur3)        | `$extends` kaçış kapısı                                                              | **KAPANDI** — bağımsız kırılarak doğrulandı (Madde 2)                                           | —                                                                                 |
| B2 (tur3 devamı) | `rate-limit.test.ts` hermetik değil, flush'sız iki ardışık koşum ikisinde de düşüyor | **`T-006 KUSURU`** (`medium`, DEĞİŞMEDİ — FIX 3 bunu hedeflemedi)                               | backend (S8, test-koşusuna-özgü önek export'u), devops (CI paralellik izolasyonu) |
| B3 (tur3)        | ADR-0008 metin sapması (`:100`/`:114`)                                               | **KAPANDI** — Madde (ADR okuma) ile doğrulandı, `imkânsız` kaldırıldı, beş kapı tablosu tutarlı | —                                                                                 |
| —                | `solid` tur4 M4-1 (ADR'nin KENDİ metni 3 yerde `Omit`/`Pick` çelişkisi)              | solid'in kendi bulgusu, qa tekrar ölçmedi/kopyalamadı                                           | solid raporuna bkz.                                                               |
| —                | `solid` tur4 M4-2 (development.md "Log Olayları" tablosu 2 olgusal hata)             | solid'in kendi bulgusu, qa madde 5 kapsamı dışında                                              | solid raporuna bkz.                                                               |
| B5 (tur1-3)      | `shutdown.test.ts` flaky (~%5, 20 koşum birleşik)                                    | `ÖNCEDEN VAR OLAN BORÇ` (T-002)                                                                 | devops/backend                                                                    |
| B7 (tur2-3)      | `pnpm format:check` — başka ajanların rapor dosyaları prettier biçiminde değil       | `ÖNCEDEN VAR OLAN BORÇ` (`.prettierignore` kapsamı)                                             | release                                                                           |

**Bu turda qa'nın KENDİ gate'i için geçerli bulgu: yalnızca B2 (1 `medium`,
yeni değil, doğrulanmış devam).** AGENT_BASELINE §4: 1–2 `medium` → **PASS**.

---

## KABUL KRİTERİ EŞLEMESİ

(Madde 1 tablosuyla birebir aynı — tekrar: karşılıksız kriter **yok**,
gerileme **yok**.)

---

## ÖLÇÜMLER

**TEST SAYILARI:**

- Yeni eklenen (bu tur, QA): **1** dosya / **1** test
  (`auth-docs-behavior-verification.qa.test.ts`) — `skip`/`only` yok.
- `pnpm test` (flush sonrası, temiz): **518/518** (errors 41 + db 166 + api 311).
- `pnpm test` (flush'sız, ard arda 2×): **1. koşum 308/310, 2. koşum 304/310**
  — ikisi de rate-limit.test.ts'in AC7 bloklarında, FARKLI test kümeleri (B2).
- `pnpm test:isolation`: **15/15** (db 14 + api 1).
- `pnpm --filter @arkesoft/db test`: **166/166**.
- `pnpm --filter @arkesoft/db exec vitest run catalog-lint.test.ts`: **37/37**.

**KABUL KRİTERİ EŞLEMESİ:** bkz. Madde 1 tablosu — 11/11 AC karşılıksız değil,
hepsi PASS.

**KOŞTURULAN KOMUTLAR:**

| Komut                                                                                                                                | Exit                                | Özet                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm lint`                                                                                                                          | 0                                   | 15/15                                                                                            |
| `pnpm typecheck`                                                                                                                     | 0                                   | 15/15                                                                                            |
| `pnpm build`                                                                                                                         | 0                                   | 12/12                                                                                            |
| `pnpm format:check`                                                                                                                  | 1                                   | 1 dosya — `T-006-solid-tur4.md` (başka ajan rapor dosyası, üretim kodu temiz, B7 ile aynı sınıf) |
| `pnpm test` (flush sonrası, ×2 tekrar)                                                                                               | 0, 0                                | 518/518 her ikisinde                                                                             |
| `pnpm test` (flush'sız, ard arda 2×)                                                                                                 | 1, 1                                | 308/310, 304/310 — Madde 3                                                                       |
| `pnpm test:isolation`                                                                                                                | 0                                   | 15/15                                                                                            |
| `pnpm audit`                                                                                                                         | 0 (uyarı var)                       | critical 0 · high 1 (`multer`, T-006 öncesi)                                                     |
| `pnpm exec tsc --noEmit -p apps/api/tsconfig.json` + geçici prob + silme                                                             | 0 (hatalar probun İÇİNDE, beklenen) | Madde 2.1/2.2, `git status` temiz                                                                |
| `pnpm --filter @arkesoft/db typecheck` (×2 mutasyon + geri alma)                                                                     | 2, 2, 0                             | Madde 2.3 — mutasyonlar kırdı, geri alma `diff` ile IDENTICAL doğrulandı                         |
| `vitest run auth-flow.test.ts auth-sessions.test.ts auth-cross-tenant.isolation.test.ts`                                             | 0                                   | 21/21 (auth-cross-tenant ayrı config gerektirdiği için ikinci komutla)                           |
| `vitest run -c vitest.isolation.config.ts auth-cross-tenant.isolation.test.ts`                                                       | 0                                   | 1/1                                                                                              |
| `vitest run rate-limit.test.ts` (izole)                                                                                              | 0                                   | 28/28                                                                                            |
| `vitest run auth-exempt-paths.test.ts tenant-exempt-paths.test.ts auth-path-sets.test.ts`                                            | 0                                   | 50/50                                                                                            |
| `vitest run auth-secret-leak.test.ts auth-secret-leak-smtp-failure-modes.qa.test.ts auth-secret-leak-assertion-fragility.qa.test.ts` | 0                                   | 7/7                                                                                              |
| `vitest run auth-docs-behavior-verification.qa.test.ts`                                                                              | 0                                   | 1/1 (Madde 5)                                                                                    |
| `eslint src/__tests__/auth-docs-behavior-verification.qa.test.ts`                                                                    | 0                                   | temiz                                                                                            |
| `vitest run shutdown.test.ts` (×5)                                                                                                   | 0×5                                 | 5/5 (Madde 6, nihai: 20 koşumda 1 FAIL = %5)                                                     |

**Çalıştırılmayan komutlar:** `pnpm test:e2e` (frontend yok, bu sürümde yok) ·
`pnpm test:contract` (`packages/trpc` doğmuyor).

**Redis durumu:** Oturum sonunda `platform:auth:*` **flush edildi** (0
anahtar) — bir sonraki ajanın "temiz" bir Redis ile başlaması için.

---

## Sınır uyumu beyanı

- Üretim kodu **düzeltilmedi**. Tüm kırma denemeleri `cp` yedeği + `diff`
  ile **geri alındı ve kanıtlandı** (`client.ts`), geçici prob dosyaları
  **silindi** ve `git status` ile doğrulandı.
- `git checkout`/`restore`/`clean`/`stash`/`commit` **hiç çağrılmadı**.
- `prisma migrate reset`/`db push --force-reset` **çağrılmadı**. Redis'te
  yalnızca `platform:auth:*` desenli silme yapıldı (izinli).
- `ROADMAP.md`/`CHANGELOG.md`/`.changeset/**`/`docs/**` **değiştirilmedi**.
- Yalnızca kendi dosyam eklendi: `apps/api/src/__tests__/auth-docs-behavior-verification.qa.test.ts`.
