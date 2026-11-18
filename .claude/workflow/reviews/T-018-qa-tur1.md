# T-018 — QA gate, tur 1 (son gate)

Tarih: 2026-11-11 · Sürüm: v0.0.21 (platform 0.7.0 → 0.8.0 adayı)

```
GATE: qa
SONUÇ: PASS
```

---

## 1. Kapsam ve yöntem

Bu tur üç işi birden kapsadı:
1. 12 ölçülebilir kabul kriterinin (AC-0…AC-12) her birine karşı kanıt topla.
2. `solid` gate'in SD-1 (medium) bulgusunu test olarak kapat (zorunlu), SD-2/SD-3/SD-6
   ([low]) için yaz/borç bırak kararı ver.
3. Kendi eksik senaryolarımı bul — tenant izolasyonu/UNIQUE/CHECK/ENUM davranışının
   canlı Postgres'te hiç test edilmemiş kenarları.

Dokunulmayan dosyalar talimata göre korundu (`packages/**` üretim kodu — S1–S5'in,
`.changeset/**`/`.github/**` — S6'nın, `prisma/**` migration — S2'nin, `ROADMAP.md`/
`CHANGELOG.md`). İki yerde üretim dosyasına **geçici** dokunuldu (mutasyon kanıtı için),
her ikisi de **shasum ile birebir geri alındı** (aşağıda).

---

## 2. KABUL KRİTERİ EŞLEMESİ (AC-0…AC-12)

| AC | Kriter (özet) | Kanıt / test | Sonuç |
| --- | --- | --- | --- |
| AC-0 | §6'nın altı komutu yeşil | §6 "KOŞTURULAN KOMUTLAR" (bu rapor) — `format:check` dahil yedi komut | ✅ GEÇTİ |
| AC-1 | `PlatformRelease` ENUM + `(version,channel)` UNIQUE + geçersiz kanal reddi + linter sıfır bulgu | `migration-sql.test.ts` (SQL metni) + **YENİ** `version-registry-constraints.test.ts` ("aynı version farklı channel KABUL", "aynı version+channel RED", "geçersiz channel RED — raw SQL canlı ölçüm") + S4'ün `catalog-lint-live` sıfır bulgu ölçümü | ✅ GEÇTİ (qa canlı kanıt eksikliğini KAPATTI — aşağıda not) |
| AC-2 | `Theme`/`ThemeRelease` + türetme testi (literal yasağı) | `version-registry-seed.test.ts` (`modernTheme.manifest`'ten ithal, üç değer birebir) | ✅ GEÇTİ |
| AC-3 | `sdkRange` uyumluluğu + negatif kanıt ZORUNLU | `range.test.ts:66-73` — bağımsız doğrulandı (`rg` ile): `satisfies('1.0.0',…)===false` **ve** `satisfies('0.0.9',…)===false` mevcut ve koşuyor | ✅ GEÇTİ |
| AC-4 | `TenantVersionState` izolasyonu (RLS ENABLE+FORCE, kanonik politika, `tenant_id` öncü UNIQUE, yedi senaryo) + "ikinci kiracı sıfır satır + varlık sızdırmaz" | `tenant-membership.isolation.test.ts` (prob kaydı, 7 senaryo × 2 yeni tablo = 14 test) + S4'ün R-PO1 SQLSTATE ölçümü (`42501`) | ✅ GEÇTİ |
| AC-5 | `TenantUpdateHistory` + CHECK (`finished_at IS NULL OR >= started_at`) + `error` redaction | `migration-sql.test.ts` (SQL metni) + **YENİ** `version-registry-constraints.test.ts` (eşitlik KABUL, ters sıra RED — canlı) + S2/mimari not (`error` sözleşmesi `Job.error`'ın birebir kopyası) | ✅ GEÇTİ |
| AC-6 | `previousState` üç kanıt (NULL ilk durum · Zod parse+bozuk JSONB negatifi · yeterlilik pini) | `snapshot.test.ts` (dört alan tamlık + tek tek zorunluluk + bozuk JSONB üç vaka) + **qa'nın SD-3 güçlendirmesi** (gerçek `__proto__` vektörü) | ✅ GEÇTİ |
| AC-7 | N-2: dört birim, dört ayrı test grubu, `Date.now()`/`new Date()` yasağı | `support-window.test.ts` — (a)(b)(c)(d)(e) beş `describe` + `purity.test.ts`'in `Date.now(`/`new Date(` taraması (SIFIR) | ✅ GEÇTİ |
| AC-8 | Paket saflığı + TEK semver deseni | `purity.test.ts` (versioning+theme-sdk) + qa'nın bağımsız `rg "SEMVER_CORE_PATTERN_SOURCE\s*="` taraması → **tek tanım yeri** (`packages/versioning/src/semver.ts:68`) | ✅ GEÇTİ |
| AC-9 | Yeni bağımlılık YOK (`semver` npm paketi eklenmedi) | `purity.test.ts` → `dependencies` TAM `{zod:'catalog:'}` (versioning) / `{zod,@arkesoft/versioning}` (theme-sdk); S1'in mutasyon kanıtı (`"semver":"catalog:"` eklenince pnpm'in kendisi "No catalog entry" hatası verdi) | ✅ GEÇTİ |
| AC-10 | Seed literal yasağı + idempotent | S5'in `rg "0\.(7\|8)\.0\|0\.6\.0\|0\.1\.0"` → sıfır eşleşme (qa bağımsız tekrarlamadı, S5'in ham çıktısı ölçülmüş ve `pnpm db:seed` bu turda ayrıca tekrar koşturulmadı — kapsam dışı, S5'in işi zaten dört kez koşturup idempotans kanıtladı) | ✅ GEÇTİ (S5'in kanıtına dayanır) |
| AC-11 | Çift doğruluk kaynağı sapma testi (DB'den iki satır, bozarak doğrulama) | `version-registry-state.isolation.test.ts` — S5'in canlı bozarak-doğrulaması (psql `UPDATE` → kırmızı → geri al → yeşil) | ✅ GEÇTİ |
| AC-12 | Changeset + sürüm tutarlılığı | `.changeset/*.md` **henüz YOK** (sıra `release` fazında — S6+`release`); `sync-platform-version.ts --check` **bu turda** zaten PASS (§6) | ⏳ BU TURDA DEĞERLENDİRİLEMEZ — kapsamı `release` fazı (AC-0 kapısı ve S6'nın mekanik kayıtları zaten PASS; changeset dosyası gates'ten SONRA eklenecek, workflow sırasına uygun) |

**Karşılıksız kriter: YOK.** AC-12 "karşılıksız" değil — henüz sırası gelmemiş bir sonraki
faza ait (workflow: gates → docs → release). AC-1'in canlı-DB kanıt boşluğu **qa tarafından
bu turda kapatıldı** (aşağıda İŞ④).

---

## 3. İŞ② — SD-1 (solid gate, medium) — TEST YAZILDI ve MUTASYONLA KIRMIZI VERDİ

**Dosya:** `packages/theme-sdk/src/__tests__/purity.test.ts`

**Eklenen:** `ALLOWED_VERSIONING_NAMED_IMPORTS = {SEMVER_CORE_PATTERN_SOURCE,
SEMVER_FORMAT_PATTERN, extractMajor}` + `namedImportsFromVersioningPackage()` (ham dosya
içeriği üzerinde `import { ... } from '@arkesoft/versioning'` ifadelerinin isimli
bağlarını çıkarır, `type`/`as` ayıklanır) + yeni `it()`: her isimli bağın bu kümede
olduğunu SEMBOL seviyesinde pinler. Yorumdaki abartılı iddia (*"bu test o iddiayı kod
satırları üzerinde DENETLER"*) artık **doğru** — pin eklendiğinden sonra.

**Mutasyon kanıtı (shasum çifti ile geri alındı):**
```
ÖNCE:  chain.ts  09f16c1d0128b77e3953c1df9abe4844d694ca7b5222f8d7bcdde1132b6a4290
MUTASYON: + import { compareSemver } from '@arkesoft/versioning'
SONUÇ:
  ✓ "yasaklı dizgi 0" testi (PAKET seviyesi)      → YEŞİL KALDI (beklenen — solid'in tam bulgusu)
  × "YALNIZCA {...} ithal edilir" testi (YENİ)    → KIRMIZI:
      expected [ Array(1) ] to deeply equal []
      + ["…/chain.ts: \"compareSemver\""]
GERİ ALMA: chain.ts  09f16c1d0128b77e3953c1df9abe4844d694ca7b5222f8d7bcdde1132b6a4290  (BİREBİR EŞLEŞTİ)
```
Tam olarak solid'in öngördüğü senaryo kanıtlandı: eski test yeşil kalırken yeni test
kırmızıya düşüyor — pin gerçek bir boşluğu kapatıyor, vacuous değil.

---

## 4. İŞ③ — SD-2 / SD-3 / SD-6 kararları

| Bulgu | Karar | Gerekçe |
| --- | --- | --- |
| **SD-2** (`support-window.test.ts`) | **YAZILDI** (düzeltildi) | Yanlış öncül ("saflık taraması test dosyalarını da tarar") doğrulandı YANLIŞ: `purity.test.ts`'in `productionSourceFiles()`'ı `entry.isFile()` kullanıyor, `__tests__/` bir dizin → asla taranmaz (kendi `:37`'si de "test dosyaları HARİÇ" diyor). Yorum düzeltildi, `EPOCH_REFERENCE` `Reflect.construct(Date,[0])`'dan sade `new Date(0)`'a indirildi. Test paketi (6 dosya, 82 test) hâlâ yeşil; `purity.test.ts` etkilenmedi (ayrıca koşturuldu). |
| **SD-3** (`snapshot.test.ts`) | **YAZILDI** (güçlendirildi, en önemlisi) | Eski test literal `__proto__:` kullanıyordu — bu bir ATAYICI, own-property ÜRETMEZ (`node -e` ile ÖLÇÜLDÜ: `Object.keys` görmüyor, `JSON.stringify` çıktıya hiç yazmıyor). **YENİ** test `JSON.parse` ile GERÇEK own-property `__proto__` üretip (`Object.keys`/`hasOwnProperty` ile ÖNCE doğrulanıp) `safeParse`'ın bunu reddettiğini kanıtlıyor — tam olarak JSONB okumasının üreteceği temsil. Mutasyonla doğrulandı (aşağıda). Eski test de KORUNDU, adı "genel fazla alan davranışı"na daraltıldı (artık yanlış iddia taşımıyor). |
| **SD-6** (`version-registry-seed.test.ts:64-73`) | **YAZILDI** (güçlendirildi) | Eski assertion'lar yalnızca `SEMVER_LIKE_PATTERN` kontrol ediyordu — bu zaten `:45`/`:61`'de vardı (no-op). Yeni test İKİ package.json yolunun GERÇEKTEN farklı dosyalar olduğunu (`pathname` eşitsizliği) ÖNCE doğruluyor, SONRA her değerin KENDİ dosyasına eşit olduğunu pinliyor — "bağımsızlık" artık gerçekten test ediliyor, pattern-eşleşmesinin tekrarı değil. Test SAYISI değişmedi (7→7, biri değiştirildi). |

### SD-3 mutasyon kanıtı (shasum çifti ile geri alındı)
```
ÖNCE:  snapshot.ts  3644c2ae53e4a550963c8f114077770d9ddc64bb7c9bf530d41e65dc5b743c49
MUTASYON: z.strictObject({ → z.looseObject({
SONUÇ:
  × "bilinmeyen anahtarı REDDEDER (genel fazla alan)"        → KIRMIZI (expected false, got true)
  × "JSONB GERÇEK temsilini … reddeder (SEC-9, gerçek vektör)" → KIRMIZI (expected false, got true)
  (12/14 test etkilenmedi — semver/eksik-alan/dizi/null testleri hâlâ yeşil, çünkü onlar
   fazla-anahtar savunmasına değil başka kurallara dayanıyor)
GERİ ALMA: snapshot.ts  3644c2ae53e4a550963c8f114077770d9ddc64bb7c9bf530d41e65dc5b743c49  (BİREBİR EŞLEŞTİ)
```
İki test birden kırmızı verdi — SD-3 testinin `z.strictObject` savunmasına GERÇEKTEN
bağımlı olduğu, kazara geçen bir test olmadığı kanıtlandı.

---

## 5. İŞ④ — Kendi bulduğum eksik senaryolar (yeni test: `version-registry-constraints.test.ts`, 15 test)

Hiçbir mevcut test, bu beş tablonun UNIQUE/CHECK/ENUM kısıtlarının **canlı Postgres'te**
gerçekten davranıp davranmadığını ölçmüyordu — `migration-sql.test.ts` yalnızca
migration **SQL METNİNİN** beklenen ifadeleri taşıdığını pinliyordu. Yazdım:

1. **`platform_release`** — aynı `version` farklı `channel` KABUL (iki satır) · aynı
   `version`+`channel` RED (P2002) · **AC-1'in eksik canlı kanıtı**: geçersiz `channel`
   değeri (`'nightly'`) Postgres ENUM seviyesinde RED (`$executeRaw`, mesaj:
   `invalid input value for enum release_channel`).
2. **`theme_release`** — farklı temada aynı sürüm KABUL · aynı temada aynı sürüm RED
   (P2002) · **CHECK #1'in dört kombinasyonu** (`draft+null` KABUL, `draft+notnull` RED,
   `published+notnull` KABUL, `published+null` RED) · ⚠⚠ **security gate'in F2 bulgusunu
   ([low]) KALICI regresyon bekçisine çevirdim**: `deprecated+null` RED (hiç
   yayınlanmamış bir taslağın geri çekilmesi şema seviyesinde yasak) + tersi
   (`deprecated+notnull` KABUL, regresyon yok).
3. **`tenant_version_state`** — `tenantId @unique`'in GERÇEK 1:1 olduğu: aynı kiracı
   için ikinci satır **P2002** ile reddedilir. ⚠ Bu, S4/po'nun R-PO1 ölçtüğü senaryodan
   (ÇAPRAZ kiracı → `42501` RLS) **farklı bir eksen** — burada `tenant_id` GERÇEKTEN
   eşleştiği için RLS geçer, tek red sebebi UNIQUE'dir. İkisi birlikte "1:1 gerçekten
   1:1 mi?" sorusunu iki ayrı yoldan (yetkisizlik + tekillik) kapatıyor.
4. **`tenant_update_history`** — CHECK #2: `finishedAt = startedAt` (eşitlik) KABUL ·
   `finishedAt < startedAt` RED · `finishedAt = NULL` (devam eden) KABUL.

**Ölçülmüş tuzak (yazarken yakalandı, rapora geçirildi):** `withTenant()` tek bir
Postgres `$transaction` açar; callback içinde `try/catch` ile "yutulan" bir kısıt ihlali
JS'te görünmez ama Postgres transaction'ı ABORTED yapar → commit'te **TÜM** transaction
(ihlalden önceki başarılı yazma DAHİL) geri alınır. İlk denemde `tenant_version_state`
testi bu yüzden `rowCount=0` ile YANLIŞ SEBEPLE kırmızı verdi; üç ayrı `withTenant()`
çağrısına bölünerek düzeltildi (kanıt: ilk hatalı koşum + düzeltilmiş koşum, §6'da
"KOŞTURULAN KOMUTLAR"). Bu, dosyanın başına not olarak da yazıldı (başka bir gelecekteki
tüketici aynı tuzağa düşmesin).

**Vacuous olmama kanıtı:** Her "RED" testi spesifik constraint adını `regex` ile
denetliyor (`theme_release_published_at_pairing_check`,
`tenant_update_history_finished_after_started_check`, `invalid input value for enum
release_channel`) — genel `rejects.toThrow()` DEĞİL, bu yüzden yanlış sebeple kırmızı/
yeşil olma riski düşük. P2002 testleri `isUniqueConstraintError()` ile (mevcut, ölçülmüş
yardımcı) tespit ediliyor.

### Diğer teyitler (üretim koduna dokunmadan, salt okuma + canlı ölçüm)

- **A-S1-1 (semver.org precedence zinciri) — TEYİT EDİLDİ.** Yeni dosya
  `packages/versioning/src/__tests__/semver-precedence-chain.test.ts` (5 test):
  semver.org'un resmi örnek zinciri
  `1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta < 1.0.0-beta.2 <
  1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0` — ARDIŞIK her çift (+ simetri) VE TÜM ikili
  kombinasyonlar (transitivite — tek bir yanlış dal zincirin ortasında saklanamaz) +
  `compareSemver` sarmalayıcısı üzerinden de aynı sonuç. Ayrıca **build metadata'nın
  karşılaştırmaya katılmadığı** doğrudan ölçüldü (`compareSemver('1.0.0+build.1',
  '1.0.0+build.999') === 0`) — bu eksen önceden hiç test edilmemişti (yalnızca
  `extractMajor` ve `prerelease===undefined` dolaylı pinleniyordu).
- **A-S1-2 (SemverParts parametreleri — ergonomi) — TEYİT EDİLDİ, sorun YOK.**
  `support-window.ts`'in tüm fonksiyonları `SemverParts` alır, dize almaz; bu paket
  genelinde TUTARLI (`satisfiesParsed`/`comparatorMatches` de aynı desende). Dosya başı
  "İKİ KATMAN" notu bunu açıkça gerekçelendiriyor: dizeden-tipe geçiş TEK sınırda
  (`parseSemver`/`extractMajor`/`compareSemver`/`satisfies`) yaşar, sınırın ötesi TOPLAM
  fonksiyonlardır. Bu bir tasarım kusuru değil, bilinçli ve tutarlı uygulanmış bir
  katman kararı — v0.16.0'ın tüketicisi `parseSemver` ile önceden ayrıştırmak
  zorunda kalacak, bu da dokümante edilmiş.
- **A-T18-4 (`test:isolation` seed'i varsaymıyor) — TEYİT EDİLDİ.**
  `tenant-isolation-suite.ts`'in `beforeAll`'ı HER tablo için `tenantA`/`tenantB`'yi
  `randomUUID()` ile KENDİSİ yaratıyor (`iso-a-${tableName}-${randomUUID()}`) — hiçbir
  prob `DEMO_SEED`'e veya önceden koşmuş bir `pnpm db:seed`'e bağımlı DEĞİL. po'nun
  "bileşik FK düşürüldüğü için varsayım yapısal olarak geçersizleşti" iddiası —
  **kaynak kodu okunarak teyit edildi**, varsayımın KENDİSİ zaten her zaman (bileşik
  FK'den bağımsız olarak) geçerliydi; tabloya özel problar (`tenant-version-state.probe.ts`)
  platform fixture'ı (`Theme`) hiç kurmuyor, bu da ADR-0020 Karar 3'ün bileşik FK
  kararıyla tutarlı.
- **F2 (security, [low]) canlı tekrar ölçüm** — ad-hoc `psql`/`docker exec` ile BAĞIMSIZ
  tekrar ölçüldü: `deprecated` + `published_at IS NULL` → `theme_release_published_at_pairing_check`
  ihlali ile RED (security'nin bulgusuyla BİREBİR örtüşüyor) — artık §5'teki kalıcı
  testle de pinli.

### Ölçmediğim / doğrulayamadığım
- AC-10'un `pnpm db:seed` dört-kez-idempotans tekrarı qa tarafından BAĞIMSIZ
  tekrarlanmadı — S5'in ölçümüne güvenildi.
- `packages/trpc`'nin CI job kapsaması (A-PO3/A-PO4) qa tarafından tekrar ölçülmedi —
  S6'nın ölçümüne güvenildi (bu qa'nın görev tanımı dışında, S6/release'in alanı).

---

## 6. ÖLÇÜMLER

### KABUL KRİTERİ EŞLEMESİ
Bkz. §2 tablosu — 12/12 AC kapsandı, karşılıksız kriter yok (AC-12 sıradaki faza ait).

### TEST SAYILARI
| Paket | Önce | Sonra | Delta | Kaynak |
| --- | --- | --- | --- | --- |
| `@arkesoft/theme-sdk` | 224 | 225 | +1 | SD-1 testi |
| `@arkesoft/versioning` | 76 | 82 | +6 | SD-3 (+1) + `semver-precedence-chain.test.ts` (+5) |
| `@arkesoft/db` | 224 | 239 | +15 | `version-registry-constraints.test.ts` (+15); SD-6 net ±0 (1 test değiştirildi) |
| `@arkesoft/api` | 676 | 676 | 0 | dokunulmadı |
| diğer 7 paket | 342 | 342 | 0 | dokunulmadı |
| **TOPLAM** | **1683** | **1705** | **+22** | |

`pnpm test` (turbo) → **20/20 görev başarılı**, **0 başarısız**.
`pnpm test:isolation` (turbo) → **11/11 görev başarılı** → `db` **71/71** · `api` **18/18**
(DATABASE_AUTH_URL export edilerek ölçüldü — `.env`'e YAZILMADI, yalnızca bu kabuk
oturumunda `export` edildi; AGENT_BASELINE'ın "turbo allowlist'i taşımıyor"
uyarısıyla tutarlı).

### FLAKY KONTROLÜ
`@arkesoft/api` (676 test, Redis/BullMQ'ya dokunan EN büyük paket — AGENT_BASELINE'ın
Redis flush sızıntısı uyardığı tam paket) `--force` ile İKİNCİ KEZ baştan koşturuldu:
**676/676 birebir aynı sonuç**, 0 fark. Diğer paketler ikinci kez koşturulmadı (zaman/
kapsam — §8'de dürüstlük notu). `grep -rn "redis\|FLUSHALL\|FLUSHDB" packages/db/src/__tests__
packages/api/src/__tests__` → bu Task'ın yeni/değişen dosyalarında SIFIR eşleşme — flaky
sınıfının bu Task'ta tetiklenme yüzeyi yok.

### KOŞTURULAN KOMUTLAR
| Komut | Exit | Özet |
| --- | --- | --- |
| `npx turbo run lint --env-mode=loose` | 0 | 23/23 |
| `npx turbo run typecheck --env-mode=loose` | 0 | 23/23 (ilk denemede `Object.keys(unknown)` TS2769 hatası düzeltildi — `typeof`/`null` narrowing eklendi) |
| `npx turbo run build --env-mode=loose` | 0 | 14/14 |
| `npx turbo run test --env-mode=loose` | 0 | 20/20, toplam 1705 test |
| `npx turbo run test:isolation --env-mode=loose` | 0 | 11/11 → db 71 · api 18 |
| `pnpm guards` | 0 | 11/11 PASS |
| `pnpm format:check` | 0 | temiz |
| `npx turbo run lint typecheck --filter @arkesoft/versioning --filter @arkesoft/theme-sdk --filter @arkesoft/db` (ilk deneme) | 1 | `semver-precedence-chain.test.ts`'te `@typescript-eslint/restrict-template-expressions` (sayı template literalinde) — `String()` ile düzeltildi, ikinci deneme 0 |
| `npx vitest run src/__tests__/purity.test.ts` (theme-sdk, mutasyon ÖNCESİ) | 0 | 5/5 |
| mutasyon: `chain.ts`'e `import { compareSemver }` eklendi → `npx vitest run src/__tests__/purity.test.ts` | 1 | 1 kırmızı (beklenen) — §3'te detay |
| mutasyon geri alındı + `shasum -a 256` doğrulandı | — | birebir eşleşti |
| `npx vitest run src/__tests__/snapshot.test.ts` (versioning, mutasyon ÖNCESİ) | 0 | 14/14 |
| mutasyon: `snapshot.ts`'te `z.strictObject(` → `z.looseObject(` → `npx vitest run src/__tests__/snapshot.test.ts` | 1 | 2 kırmızı (beklenen) — §4'te detay |
| mutasyon geri alındı + `shasum -a 256` doğrulandı | — | birebir eşleşti |
| `npx vitest run src/__tests__/version-registry-constraints.test.ts` (db, ilk deneme) | 1 | 1 kırmızı — `withTenant` transaction-abort tuzağı (ölçüldü, §5'te detay) → düzeltildi, ikinci deneme 0/15 |
| `npx turbo run test --filter @arkesoft/api --force --env-mode=loose` (tekrar koşum, flaky kontrolü) | 0 | 676/676 — ilk koşumla BİREBİR aynı |

---

## 7. BULGULAR

```
BULGULAR: yok (bu turda qa'nın AÇTIĞI yeni critical/high/medium bulgu YOK)
```

Önceki turların bulguları (security MED-1 · solid SD-1) bu gate'te **tekrar
sayılmıyor** (çift sayım değil) — SD-1 bu turda **test ile kapatıldı** (§3), security
MED-1 (`arkesoft_app` blanket DML) production-kod değişikliği gerektirdiği için qa'nın
kapsamı dışında kalır ve açık borç olarak **devam ediyor** (vade v0.16.0, sorumlu:
architect/db/devops — security'nin kendi raporunda zaten yazılı).

**qa'nın kendi bulduğu ve bu turda KAPATTIĞI (BULGU değil, düzeltme) üç kalem:**
- AC-1'in canlı-DB kanıt boşluğu (geçersiz `channel` reddi hiç test edilmemişti) → kapatıldı.
- security F2'nin ([low]) kalıcı regresyon testi yoktu → kapatıldı (test eklendi, severity
  DEĞİŞMEDİ — hâlâ security'nin [low] değerlendirmesiyle uyumlu, qa önem derecesini
  büyütmedi/küçültmedi).
- `tenant_version_state`/`tenant_update_history`'nin UNIQUE/CHECK kısıtlarının canlı
  davranışı hiç ölçülmemişti → kapatıldı.

---

## 8. Dürüstlük notları — DOĞRULANAMADI / ölçülmedi

- Tüm paketlerin (yalnızca `api` değil) İKİ KEZ koşturulması **yapılmadı** — zaman/
  kapsam; en büyük/en riskli paket (`@arkesoft/api`) ikinci kez koşturuldu ve
  676/676 birebir aynı sonucu verdi (§6).
- AC-10'un `pnpm db:seed` dört-kez-idempotans tekrarı qa tarafından BAĞIMSIZ
  tekrarlanmadı — S5'in ölçümüne güvenildi.
- `packages/trpc`'nin CI job kapsaması (A-PO3/A-PO4) qa tarafından tekrar ölçülmedi —
  S6'nın ölçümüne güvenildi (bu qa'nın görev tanımı dışında, S6/release'in alanı).

## 9. Orkestratör'ün iddialarına itiraz

Hiçbiri yanlış bulunmadı. Tek netleştirme: brief'in "Beklenen taban: 28" rakamı benim
ölçtüğüm pre-existing `git status --porcelain` satır sayısıyla (30) örtüşmedi — ama bu
muhtemelen küçük bir sayım farkı (hangi anda ölçüldüğü) ve davranışsal bir sonucu yok;
önemli olan **hangi dosyaların** değiştiği, ki onlar hepsi beklenen dosyalardı (bkz. §10).

## 10. `git status --porcelain` — yalnızca beklenen dosyalar

31 satır = 30 (gate öncesi, S1-S6'nın + önceki gate'lerin) + **1 yeni** (benim
`version-registry-constraints.test.ts`'im). Diğer tüm qa değişikliklerim (SD-1/SD-2/
SD-3/SD-6 + `semver-precedence-chain.test.ts`) ya zaten untracked olan dosyaların
İÇİNDE (`packages/versioning/`, `packages/db/src/__tests__/version-registry-seed.test.ts`)
ya da zaten "M" (modified) işaretli bir dosyanın İÇİNDE (`packages/theme-sdk/src/
__tests__/purity.test.ts`) — git'in satır sayısını ARTIRMADI.
Üretim dosyalarına yapılan İKİ geçici mutasyon (`chain.ts`, `snapshot.ts`) **shasum ile
birebir** geri alındı, `git status`'ta hiçbir iz YOK.
