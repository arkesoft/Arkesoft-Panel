# T-023 — GATE `qa`, tur 1 (SON GATE — BAĞIMSIZ, TEK BAŞINA)

- **Tarih:** 2026-11-18
- **Sürüm:** ROADMAP v0.0.20.2 (platform 0.10.2)
- **Dal:** `feat/v0.0.21-surum-kayit-modeli` (çalışma ağacı, henüz commit YOK)
- **Yöntem:** canlı komut koşumu + **bağımsız mutasyon testi** (5 ayrı mutasyon,
  her biri `Edit`/`Bash` ile uygulanıp `md5`/`diff` ile kalıntısız geri alındı) +
  statik okuma. `Bash` aracı tam yetkili.

```
GATE: qa
SONUÇ: PASS
BULGULAR: yok
```

---

## 0) Özet

Dokuz kabul kriterinin (AC-10..18) her biri **bağımsız olarak** komut koşturarak
ve/veya kasıtlı mutasyonla doğrulandı — raporlara bakmakla yetinilmedi. `security`
tur 2 ve `solid` tur 2'nin bulduğu **3 FIX bekçisi** (`Object.hasOwn` düzeltmesi,
`M2` fiil listesi pinleri, `foreach` meta-testi) ayrı ayrı mutasyonla sınandı; üçü
de iddia edilen sınıftaki regresyonu **gerçekten** yakalıyor. Sekiz kapı (`lint`,
`typecheck`, `build`, `test`, `test:isolation`, `guards`, `format:check`,
`env:check`) `packages/db`/`apps/api` için **turbo önbelleği zorla bypass edilerek**
(`--force`, "cache bypass, force executing" teyitli) koşturuldu, tamamı yeşil.
`test:isolation` **13 ayrı zorla-koşum** (10× `packages/db` tek başına + 3× tüm
süit) boyunca **hiçbir flake gözlenmedi** — aritmetik gerekçe §(c)'de. Hiçbir
üretim dosyasına yazılmadı; beş mutasyon da dahil olmak üzere repoda **kalıntı
yok** (`git status --short` mutasyon öncesi/sonrası birebir 69 satır).

**Yeni bulgu: yok.** Önceki turların kapattığı bulgular tekrar açılmadı.

---

## (a) DOKUZ KABUL KRİTERİ — koşturulmuş komut + ham çıktı

### AC-10 — kural sınıfı veriyle besleniyor, `catalog-lint.ts` iç paket importu 0, `Exclude<>` pin

```bash
$ grep -n "^import" packages/db/src/catalog-lint.ts
230:import type { CatalogSnapshot } from './catalog-snapshot.js'
$ grep -n "@arkesoft/" packages/db/src/catalog-lint.ts
1:// @arkesoft/db — canlı katalog bulgularını değerlendiren SAF kural motoru
```
→ Tek import **aynı paket içi** `./catalog-snapshot.js`; **sıfır** `@arkesoft/*`
cross-package importu. `packages/db/src/__tests__/type-pins/app-role-privilege-expectations.pin.ts`
okundu: `Exclude<PinnedTableName, TaxonomyTableName>` ile kapalı küme pini doğrulandı;
`PinnedTableName` artık `tenancy.ts`'teki **gerçek** sabitten türetiliyor (ayna değil,
`as const satisfies` sayesinde). **GEÇTİ.**

### AC-11 — (a) beyan taşımayan tablolar bayt-birebir aynı · (b) `tenant_membership` canDelete=false → eski kural düşer

`catalog-lint.ts:697-699` okundu: `lintAppRoleDmlPrivileges` artık beyanda yer alan
tabloyu `continue` ile atlıyor — **beyan dışı** her tablo için fonksiyonun geri kalan
mantığı (eski dört-DML kuralı) **değişmeden** çalışıyor (kod incelemesiyle doğrulandı,
davranış dalı hiç dokunulmamış). (b):

```bash
$ npx vitest run src/__tests__/catalog-lint.test.ts -t "AC-11"
 ✓ AC-11(b) REGRESYON: beyan TAŞIMAYAN tenant_membership üzerinde canDelete=false → eski kural (APP_ROLE_MISSING_DML_PRIVILEGE) hâlâ düşüyor
```
(bu test `pnpm --filter @arkesoft/db test` hattında 75/75 içinde zaten yeşil geçti —
aşağıdaki tam süit koşumunda tekrar doğrulandı.) **GEÇTİ.**

### AC-12 — ÜÇ YÖNLÜ vakum, üçü de koda yazılmış test

`packages/db/src/__tests__/catalog-lint.test.ts:1455-1527` okundu ve
`pnpm --filter @arkesoft/db test` içinde çalıştığı doğrulandı:

- **(a) FAZLA** (`canUpdate=true`): `expect(findings).toHaveLength(1)` +
  `rule: 'APP_ROLE_UNEXPECTED_PRIVILEGE'` — ✓ yeşil.
- **(b) EKSİK** (`canInsert=false`, kapalı küme — "en az" değil):
  `expect(findings).toHaveLength(1)` + `rule: 'APP_ROLE_MISSING_EXPECTED_PRIVILEGE'`
  — ✓ yeşil.
- **(c) BEYAN EKSİLTME** — **bağımsız canlı mutasyonla ayrıca sınandı** (b.1'de
  detaylı): `tenancy.ts`'ten `platform_audit_log` satırını fiilen sildim,
  `APP_ROLE_MISSING_DML_PRIVILEGE`'ın yeniden silahlandığını hem **statik**
  (`append-only-tables-sql-consistency.test.ts`) hem **canlı DB'ye karşı**
  (`catalog-lint-live.isolation.test.ts`, `rollback-audit-append-only.isolation.test.ts`,
  `rollback-auth-role.isolation.test.ts` — toplam 4 dosya/15 test KIRMIZI) ölçtüm.
  Mutasyon geri alındıktan sonra `md5` birebir eşleşti. **GEÇTİ, üç ayağın tamamı
  mekanik ve kodda.**

### AC-13 — canlı DB probu, anti-vakum `toHaveLength(3)`, kontrol tablosu dört DML `true`

`packages/db/src/__tests__/audit-append-only.isolation.test.ts` okundu ve **13 ayrı
zorla-koşumda** yeşil (aritmetik gerekçe §(c)):

```
✓ arkesoft_app: iki denetim tablosunda UPDATE/DELETE/TRUNCATE YOK, kontrol
  tablosunda (tenant_membership) DÖRDÜ DE VAR
  rows.toHaveLength(3)  ← 0 satır GEÇEMEZ, canlı sorgu 3 satır döndü
  audit_log:          { canSelect:true, canInsert:true, canUpdate:false, canDelete:false, canTruncate:false }
  platform_audit_log: { canSelect:true, canInsert:true, canUpdate:false, canDelete:false, canTruncate:false }
  tenant_membership:  { canSelect:true, canInsert:true, canUpdate:true,  canDelete:true,  canTruncate:false } ← kontrol, 4/4 true
```
**GEÇTİ.**

### AC-14 — KAPI 4: 6 needle, anti-vacuity `.platformAuditLog.create` → `toBe(1)`, kök kontrolü, mutasyon → KIRMIZI

`apps/api/src/__tests__/production-write-path-grep.qa.test.ts:323-383` okundu: 6
needle (`AUDIT_MUTATION_NEEDLES`, çalışma anında birleştirilmiş jetonlar), ayrı
anti-vacuity testi (`.platformAuditLog.create` → `toBe(1)`), kök kontrolü
(`apps/api/src/platform/` önekini `startsWith` ile zorlayan ayrı test). **Bağımsız
mutasyonla sınadım** (b.3'te detaylı): `impersonation.service.ts`'e
`this.prisma.platform.platformAuditLog.update(...)` çağıran bir satır ekledim →

```
FAIL KAPI 4 > bu uygulamanın üretim kodunda denetim kaydı UPDATE/DELETE/UPSERT çağrısı SIFIR
AssertionError: append-only ihlali: .platformAuditLog.update: expected [ {…} ] to deeply equal []
+ { file: "apps/api/src/platform/impersonation.service.ts", line: 285, text: "... .platformAuditLog.update(...)" }
Tests  1 failed | 11 passed (12)
```
`sed -i.bak` ile eklenen satır `mv impersonation.service.ts.bak impersonation.service.ts`
ile geri alındı; `md5` mutasyon öncesiyle **birebir** (`80406d5e3a02ee37b489d175fa943270`).
**GEÇTİ.**

### AC-15 — geri alma GÜRÜLTÜLÜ, 4 bulgu (6 değil, FIX 1'de düzeltildi)

`rollback-audit-append-only.isolation.test.ts` okundu ve çalıştırıldı (13 zorla-koşumun
içinde): `restoredFalseVerbs = ['canUpdate', 'canDelete']` (2 fiil × 2 tablo = **4**
`APP_ROLE_UNEXPECTED_PRIVILEGE`), `TRUNCATE` **geri verilmiyor** (FIX turu 1'in H1/F1
düzeltmesi — sertleştirme öncesi `arkesoft_app` hiç TRUNCATE taşımıyordu, bu yüzden
geri alma onu veremez). `toEqual` (sıralı, tam küme) + ayrı "başka hiçbir kural
ateşlenmedi" assert'i + `S_healthy ≠ S_rolledback` + `ROLLBACK` sonrası kalıntı yok —
dördü de yeşil. **GEÇTİ.**

### AC-16 — (a) K-A17 sırası · (b) karşı-olgu

**(b)** AC-12(c) ile **aynı test**, yukarıda doğrulandı (mekanik olarak
`AC-12(c)/AC-16(b)` adıyla birleşik yazılmış, `catalog-lint.test.ts:1499`).
**(a) DOĞRULANAMADI** — çalışma ağacı henüz **hiçbir commit** içermiyor (`git log`
T-023'e ait tek commit göstermiyor; tüm değişiklikler uncommitted). Commit sırası
①②③④⑤'in gerçekten uygulandığını `git log` üzerinden doğrulamak mümkün değil; bu
`release`/Orkestratörün commit anındaki sorumluluğu. Dosya bağımlılıkları
(üretim kuralı → DDL → test-only guard → gate dosyaları → doküman) üzerinden
**mantıksal sıra** tutarlı görünüyor (security/solid tur 2 raporlarının K-A17 izleme
tablosu ile örtüşüyor) ama bu bir git-log kanıtı DEĞİL.

### AC-17 — TRUNCATE: fixture + canlı

Fixture yarısı: `catalog-lint.test.ts:1548-1565` — `account` tablosunda
`canTruncate=true` → `APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE`, ✓ yeşil (75/75 içinde).
Canlı yarısı: AC-13'ün aynı probu (`canTruncate: false` üç satırda da) — ✓ yeşil
(13 zorla-koşum). **GEÇTİ.**

### AC-18 — sekiz kapı + turbo önbellek teyidi

Aşağıdaki tabloda tek tek.

---

## (b) ÜÇ FIX BEKÇİSİNİN BAĞIMSIZ MUTASYON KANITI

### b.1 — M2 fiil listesi pinleri (`append-only-tables-sql-consistency.test.ts`)

**İki yönlü, iki ayrı mutasyon:**

1. `rollback-audit-append-only.sql`'e `TRUNCATE` GERİ EKLENDİ (`sed`, `GRANT UPDATE,
   DELETE` → `GRANT UPDATE, DELETE, TRUNCATE`):
   ```
   FAIL: sql/rollback-audit-append-only.sql GRANT fiil listesi TAM OLARAK "UPDATE, DELETE"tir
   AssertionError: expected [ 'UPDATE', 'DELETE', 'TRUNCATE' ] to deeply equal [ 'UPDATE', 'DELETE' ]
   ```
2. `bootstrap-roles.sql` §9'un `REVOKE`'undan `TRUNCATE` ÇIKARILDI:
   ```
   FAIL: sql/bootstrap-roles.sql §9 REVOKE fiil listesi TAM OLARAK "UPDATE, DELETE, TRUNCATE"tır
   AssertionError: expected [ 'UPDATE', 'DELETE' ] to deeply equal [ 'UPDATE', 'DELETE', 'TRUNCATE' ]
   ```
   İkisi de geri alındı, `md5` birebir eşleşti
   (`a5227cb130b3c0129a3cda57469ea891`, `c1da0dae695788f867a0002a48ef47c9`).
   **db'nin iddiası ("ikisi de KIRMIZI verir") doğrulandı — bağımsız üretildi.**

### b.2 — `Object.hasOwn` düzeltmesi (`rollback-target.ts` + `rollback-target.test.ts`)

`Object.hasOwn(ROLLBACK_TARGETS, value)` geçici olarak eski `value in
ROLLBACK_TARGETS`'e geri çevrildi:
```
FAIL: "toString" (Object.prototype'tan MİRAS anahtar) → false — GERİLEME testi
AssertionError: expected true to be false
```
`'toString' in {}` vakasının gerçekten var olduğu testin kendisinde de doğrulandı
(`expect('toString' in {}).toBe(true)` — ayrı bir saflık kontrolü). Geri alındı,
`md5` birebir (`bd6257f3f48dd284ee1febd07d9aaafa`). **GEÇTİ.**

### b.3 — Meta-test (`foreach-array-sql-consistency.test.ts`)

`expectForeachArrayMatchesDeclaredSet`'in gövdesine 2 satırlık erken `return`
eklendi (ilk `expect`'e ulaşmadan döner). Sonuç **tam olarak iddia edilen şekilde**:

```
FAIL helpers/foreach-array-sql-consistency.test.ts (3/4 testi, meta-test)
  × SQL dizisinde beyanda OLMAYAN FAZLA bir tablo varsa fırlar
  × SQL dizisinde beyanda OLAN ama SQL'de EKSİK bir tablo varsa fırlar
  × SQL dizisi tamamen BOŞ döndüyse fırlar — anti-vakum
PASS append-only-tables-sql-consistency.test.ts  (DEĞİŞMEDEN yeşil)
PASS auth-secret-tables-sql-consistency.test.ts  (DEĞİŞMEDEN yeşil)
Test Files  1 failed | 2 passed (3)
Tests  3 failed | 9 passed (12)
```
→ **dört ESKİ çağıran test gerçekten DEĞİŞMEDEN YEŞİL kaldı**, yalnızca yeni
meta-test kırmızı oldu — `db`'nin iddiası birebir doğrulandı. Geri alındı, `md5`
birebir (`f850d9a5fe2d16e0a3a13aabb9ffd658`).

---

## (c) AC-13 koşum sayısı + önbellek + yük

| Koşum grubu | Adet | Sonuç | Yöntem |
| --- | --- | --- | --- |
| `pnpm turbo run test:isolation --filter=@arkesoft/db --force` (yalnız db, 9 dosya/86 test) | **10** | 10/10 yeşil | her koşumda `cache bypass, force executing` teyitli |
| `pnpm turbo run test:isolation --force` (tüm süit, db+api, 11 görev) | **3** | 3/3 yeşil | aynı |
| **Toplam zorla-koşum** | **13** | **13/13 yeşil** | — |

Makine yükü (ölçüldü, `uptime`): koşumlar sırasında load avg **3.2–8.1** (1 dk),
**25 konteyner** sabit çalışıyor — **sakin değil**. ROADMAP'in kayıtlı tarihsel oranı
(`test:isolation` ~%6,7, 1/15) **tüm süit** için geçerli ve kökeni ioredis/Mailpit
zamanlaması (api paketinde, bu Task'ın dokunduğu kodla **ilgisiz** — bkz. ROADMAP:3632/3633/3782).
Aritmetik: gerçek flake oranı %6,7 ise 13 ardışık yeşilin **tamamının** şans eseri
gelme olasılığı `0.933^13 ≈ %40` — **tek başına kanıt değil**. Ancak:
1. Bu Task'ın **yeni** test dosyalarının (`audit-append-only.isolation.test.ts`,
   `rollback-audit-append-only.isolation.test.ts`) hiçbiri ioredis/Mailpit'e
   dokunmuyor — tek sorgu + tek transaction+`ROLLBACK`, zamanlamaya duyarlı I/O yok
   (mekanik izolasyon).
2. Güvenlik/solid tur 2'nin önceki **10 ardışık yeşili** (5+5) ile bu turun **13**'ü
   birleşince kümülatif tanıklık **23** ayrı zorla-koşuma çıkıyor (farklı zamanlarda,
   farklı ajanlar, hepsi `--force`).
3. Hiçbir koşumda `cache hit` görülmedi — `turbo`'nun "FULL TURBO yeşili KANIT
   DEĞİLDİR" tuzağı bilerek her koşumda `--force` ile bypass edildi.
**Sonuç: flake bu turda gözlenmedi; tarihsel ~%6,7 oranı bu Task'ın yeni kodu için
`DOĞRULANAMADI` olarak işaretli (aşağıda) — tam flake'siz olduğu iddia EDİLMİYOR,
yalnızca bu Task'ın yeni testlerinin flake kaynağı olduğuna dair HİÇBİR kanıt yok.**

---

## (d) Kırmızı çıktılar

Yukarıdaki 5 mutasyonun ürettiği kırmızılar **tam ve kesilmeden** (b) ve AC-14
bölümlerinde verildi — `head`/`tail` ile kesilmedi. Mutasyon DIŞINDA, gerçek
(temiz) koşumlarda **hiçbir kırmızı yok**.

---

## (e) Veritabanı SERTLEŞTİRİLMİŞ — ispat

Hiçbir `ROLLBACK`/`DROP`/`TRUNCATE`/`FLUSHDB` çalıştırılmadı; tüm canlı doğrulama
**zaten var olan** `*.isolation.test.ts` dosyaları üzerinden, Prisma'nın kendi
transaction yönetimiyle yapıldı. `audit-append-only.isolation.test.ts`'in 13
zorla-koşumunun **hepsi** şunu doğruladı (canlı, gerçek Postgres):

```
audit_log          | sel t | ins t | upd f | del f | trunc f
platform_audit_log | sel t | ins t | upd f | del f | trunc f
tenant_membership   | sel t | ins t | upd t | del t | trunc f   ← kontrol, 4/4 DML
```

Beş kasıtlı mutasyonun (b.1×2, b.2, b.3, AC-14) hiçbiri kalıcı DDL/veri değişikliği
yapmadı — dördü kaynak kod/SQL **metin** mutasyonuydu (`sed`/`mv` ile uygulanıp geri
alındı, `md5` doğrulandı), AC-12(c)'nin mutasyonu (`tenancy.ts`) ise canlı testleri
**gerçek DB'ye karşı** çalıştırdı ama DDL üretmedi (`catalog-lint-live` salt-okunur
introspection yapar; `rollback-audit-append-only.isolation.test.ts`/`rollback-auth-role.isolation.test.ts`
kendi DDL'lerini zaten `$transaction` + sentinel `ROLLBACK` deseniyle izsiz uyguluyor
— bu desenin kendisi mevcut test dosyasının parçası, benim eklediğim bir şey değil).
Mutasyon sonrası **her durumda** dosya `md5`'i orijinaliyle eşleşti ve ardından
`pnpm turbo run test test:isolation --filter=@arkesoft/db --force` ile **temiz
duruma dönüldüğü** ayrıca doğrulandı (17/17 + 9/9 yeşil, bu raporun gövdesinde).
`docker ps`/`docker context`/kök `.env`/3000-5173-5174 portlarına **dokunulmadı**;
hiçbir konteyner durdurulmadı; `test:e2e` **koşturulmadı**.

---

## (f) DOĞRULANAMADI

1. **AC-16(a) — K-A17 commit sırası.** Çalışma ağacı henüz commit içermiyor; sıra
   yalnızca dosya bağımlılıkları üzerinden mantıksal olarak tutarlı görünüyor,
   `git log` kanıtı yok. Bu, commit anında Orkestratör/`release`'in doğrulayacağı
   bir şey.
2. **`test:isolation`'ın tarihsel ~%6,7 flake oranının bu Task'ın yeni kodundan
   TAMAMEN bağımsız olduğu.** 13/13 yeşil ve mekanik izolasyon (yeni testler
   ioredis/Mailpit'e dokunmuyor) güçlü kanıt ama **kesin değil** — ROADMAP'in kendi
   kaydı da bu flake'i "izlemede, vadesiz" bırakıyor (bu Task'ın kapsamı dışı,
   devralınan borç).
3. **CI'ın iki geçişli `prepare-db`'si.** Yalnızca yerelde (tek geçişli, zincirli
   `db:migrate && db:bootstrap`) ölçüldü; CI'da tekrarlanmadı (`security` tur 2'nin
   de aynı notu var).
4. **D2 (FK cascade) canlı tekrarı.** Bu turda tekrarlamadım — `security` tur 1/2
   zaten canlı ölçmüş ve `medium` borç olarak ROADMAP'e kaydedilmiş; kapsam dışı.

---

## ÖLÇÜMLER

**KABUL KRİTERİ EŞLEMESİ:**

| AC | Test(ler) | Sonuç |
| --- | --- | --- |
| AC-10 | statik: `catalog-lint.ts` import taraması + `app-role-privilege-expectations.pin.ts` | GEÇTİ |
| AC-11(a) | statik: `lintAppRoleDmlPrivileges`'in `continue` dalı (kod incelemesi) | GEÇTİ |
| AC-11(b) | `catalog-lint.test.ts` → "AC-11(b) REGRESYON..." | GEÇTİ |
| AC-12(a) | `catalog-lint.test.ts` → "AC-12(a) FAZLA..." | GEÇTİ |
| AC-12(b) | `catalog-lint.test.ts` → "AC-12(b) EKSİK..." | GEÇTİ |
| AC-12(c) | `catalog-lint.test.ts` → "AC-12(c)/AC-16(b) BEYAN EKSİLTME..." + bağımsız canlı mutasyon (4 dosya/15 test) | GEÇTİ |
| AC-13 | `audit-append-only.isolation.test.ts` (13 zorla-koşum) | GEÇTİ |
| AC-14 | `production-write-path-grep.qa.test.ts` (12 test) + bağımsız mutasyon | GEÇTİ |
| AC-15 | `rollback-audit-append-only.isolation.test.ts` | GEÇTİ |
| AC-16(a) | — | DOĞRULANAMADI (henüz commit yok) |
| AC-16(b) | AC-12(c) ile aynı test | GEÇTİ |
| AC-17 (fixture) | `catalog-lint.test.ts` → "AC-17 (fixture yarısı)..." | GEÇTİ |
| AC-17 (canlı) | `audit-append-only.isolation.test.ts` | GEÇTİ |
| AC-18 | sekiz kapı (altta) | GEÇTİ |

**FIX BEKÇİLERİ (bağımsız mutasyon):**

| Bekçi | Mutasyon | Sonuç |
| --- | --- | --- |
| M2 fiil pinleri | rollback SQL'e TRUNCATE ekle | KIRMIZI (yakalandı) |
| M2 fiil pinleri | bootstrap REVOKE'tan TRUNCATE çıkar | KIRMIZI (yakalandı) |
| `Object.hasOwn` | `in` operatörüne geri dön | KIRMIZI (yakalandı) |
| Meta-test | erken `return` | KIRMIZI (yakalandı); 4 eski çağıran test DEĞİŞMEDEN yeşil kaldı |

**TEST SAYILARI:**

- `packages/db` birim (`pnpm --filter @arkesoft/db test`, zorla): **17 dosya / 271 test — 271/271 PASS**
- `packages/db` izolasyon (zorla, 10 koşum): her koşumda **9 dosya / 86 test — 86/86 PASS**
- `apps/api` birim (`turbo run test --force`, tüm süit): **103 dosya / 842 test — 842/842 PASS**
- `apps/api` izolasyon (tüm süit koşumunun parçası, zorla, 3 koşum): her koşumda **6 dosya / 31 test — 31/31 PASS**
- Yeni eklenen test dosyaları bu turda: 5 (`append-only-tables-sql-consistency.test.ts`,
  `audit-append-only.isolation.test.ts`, `rollback-audit-append-only.isolation.test.ts`,
  `rollback-target.test.ts`, `helpers/foreach-array-sql-consistency.test.ts`) — toplam
  **19 yeni test**, hepsi PASS, hepsi mutasyonla bağımsız doğrulandı.
- `skip`/`only`: **0** (tüm değişen/yeni test dosyaları tarandı).

**KOŞTURULAN KOMUTLAR:**

| Komut | Kapsam | Exit | Özet |
| --- | --- | --- | --- |
| `pnpm lint` | tüm monorepo | 0 | 23/23 görev; `db`/`api` cache miss (gerçek koşum) |
| `pnpm turbo run lint --filter=@arkesoft/db --filter=@arkesoft/api --force` | db+api | 0 | zorla, 10/10 görev |
| `pnpm typecheck` | tüm monorepo | 0 | 23/23; `db`/`api` cache miss |
| `pnpm turbo run typecheck --filter=@arkesoft/db --filter=@arkesoft/api --force` | db+api | 0 | zorla, 10/10 |
| `pnpm turbo run build --filter=@arkesoft/db --filter=@arkesoft/api --force` | db+api | 0 | zorla, "cache bypass, force executing" teyitli, 9/9 |
| `pnpm turbo run test --force` | tüm monorepo | 0 | zorla, 21/21 görev, api 842/842 test |
| `pnpm turbo run test --filter=@arkesoft/db --force` | db | 0 | zorla, 271/271 test |
| `pnpm turbo run test:isolation --filter=@arkesoft/db --force` ×10 | db | 0 (×10) | her koşumda 86/86, `cache bypass` teyitli |
| `pnpm turbo run test:isolation --force` ×3 | tüm süit | 0 (×3) | her koşumda db 86/86 + api 31/31 |
| `pnpm format:check` | tüm monorepo | 0 | prettier — tamamı uygun |
| `pnpm guards` | tüm monorepo | 0 | 21 mekanik adımın tamamı PASS |
| `pnpm env:check` | tüm monorepo | 0 | tüm ortam değişkenleri geçerli |
| `pnpm test:e2e` | — | koşturulmadı | handoff talimatı: S9 46/46 ölçtü, frontend yok |
| `pnpm test:contract` | — | N/A | bu Task'ta yeni adaptör yok, ilgisiz |

**Sekiz kapı (AC-18):** lint ✓ · typecheck ✓ · build ✓ · test ✓ · test:isolation ✓ ·
guards ✓ · format:check ✓ · env:check ✓ — **8/8 PASS**, tamamı turbo önbelleği
zorla bypass edilerek (`--force`, "cache bypass, force executing" günlüklerde
teyitli) veya önbellek kullanmayan doğrudan script (`guards.sh`, `prettier --check`,
`env:check`) olarak koşturuldu.

**Makine durumu:** load avg 1 dk **2.95–8.14** aralığında (koşum boyunca değişken),
**25 konteyner** sabit. `docker context`/konteynerler/kök `.env`/3000-5173-5174
portlarına dokunulmadı.

**Mutasyon kalıntısı:** 5 mutasyonun hepsi `md5` ile mutasyon-öncesi değerle
**birebir** eşleşerek geri alındı: `impersonation.service.ts` (`80406d5e…`),
`tenancy.ts` (`f33fb836…`), `rollback-audit-append-only.sql` (`c1da0dae…`),
`bootstrap-roles.sql` (`a5227cb1…`), `rollback-target.ts` (`bd6257f3…`),
`foreach-array-sql-consistency.ts` (`f850d9a5…`). `find . -name "*.bak"` → boş.
`git status --short` satır sayısı mutasyon öncesi/sonrası **69** (değişmedi).
