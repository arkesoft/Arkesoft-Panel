T-004 — QA Gate, Tur 2
Tarih: 2026-10-28
Sürüm: v0.0.13 önkoşulu (T2-1 kapanışı) — düzeltme turu 1 sonrası yeniden doğrulama
Dal: `main`

GATE: qa
SONUÇ: PASS

---

## 0. Başlangıç durumu

`git status --porcelain` (repo kökü, oturum başı):

```
 M packages/db/src/__tests__/migration-sql.test.ts
?? .claude/workflow/reviews/T-004-qa-tur1.md
?? .claude/workflow/reviews/T-004-security-tur1.md
?? .claude/workflow/reviews/T-004-solid-tur1.md
?? .claude/workflow/tasks/T-004.md
?? packages/db/src/__tests__/helpers/migration-set-fixture.ts
?? packages/db/src/__tests__/helpers/migration-set.ts
```

Bu tur boyunca yapılan **iki geçici mekanik değişiklik** (AC3 ters probu + tautoloji
mutasyon testi) yedekten (`cp`) geri alındı, **`git checkout` kullanılmadı** (tur 1'in
F1 bulgusu bu turda tekrarlanmadı). Her ikisinin sonrasında `git status --porcelain`
yukarıdakiyle **birebir aynı** doğrulandı (bkz. §1, §4).

---

## 1. AC3 — Ters prob (yeniden koşturuldu)

### Mekanik

1. Başlangıç `git status --porcelain` → yukarıda.
2. `cp packages/db/src/__tests__/helpers/migration-set.ts "$TMPDIR/ac3-migration-set.bak"`
   → `diff` farksız (yedek doğrulandı).
3. `readMigrationSet` içine, `readdirSync` sonrası, **tek satır** eklendi:
   ```ts
   entries = entries.filter((entry) => entry.name.endsWith('_init'))
   ```
4. `pnpm --filter @arkesoft/db test` → **gerçek terminal çıktısı (birebir)**:

```
 ❯ src/__tests__/migration-sql.test.ts (24 tests | 17 failed) 32ms
   ❯ migration-set — prob süiti (K-C9 birincil fixture) (5)
     × AC1: migration.sql içeren her dizin okunur, yalnızca lock taşıyan dizin dışlanır
     × AC2 — ASIL PROB: taksonomide olmayan tenant_id'li tablo hata fırlatır
     × AC8: hata mesajı suçlu migration dizininin adını taşır
     × AC4 — tautoloji değil: aynı fixture, taksonomiye "invoice" eklenince hata çıkmaz
   ❯ migration-set — prob süiti (AC5: "_init" sonekine bağımlılık yok) (1)
     × AC5: hiçbir dizin adı "_init" ile bitmese de doğrulama tüm dizinleri okur
   ❯ migration-set — prob süiti (AC7: üç ayrı iki-yönlülük vakası) (8)
     × AC7a, AC7b, AC7c, AC7c-ek (B1), C1 (lowercase), C1 (double-space), B2, AC7d
   ❯ migration-set — prob süiti (security tur1 bulgu1: gevşek ad deseni vs katı gövde deseni) (3)
     × A-1, A-2, A-3
   ❯ migration-set — prob süiti (C5: kök seviyesindeki migration_lock.toml bir dizin değildir) (1)
     × V3-kök

 Test Files  1 failed | 4 passed (5)
      Tests  17 failed | 68 passed (85)
   Start at  10:01:02
   Duration  1.46s
```

(Hata mesajları tur 1'deki ile aynı sınıftan — ör. AC2 "expected [Function] to throw an
error" fırlamadı; AC1 beklenen 3 dizin yerine 1 döndü; `pnpm recursive run` → `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`.)

5. **Geri alma (yedekten, `git checkout` KULLANILMADI):**
   `cp "$TMPDIR/ac3-migration-set.bak" packages/db/src/__tests__/helpers/migration-set.ts`
   → `diff` **farksız** (`RESTORE_IDENTICAL`).
6. `git status --porcelain` → adım 1 ile **birebir aynı**.
7. Süit yeniden koşturuldu → **85 passed (85)**, 0 failed/0 skipped, Duration 1.34s.

**AC3 SONUCU: kanıtlanmış, F1 riski tekrarlanmadı.** Düzeltme turu 11 yeni vaka ekledi;
ters probun etkisi tur 1'deki 8 yerine **17 vakayı** kırmızıya çevirdi — tüm yeni
vakaların da K-C9 fixture'ının çok-dizinli okunmasına bağımlı olduğunu gösteriyor
(sahte-yeşil riski tüm yeni testlere de sirayet ediyordu, şimdi hepsi gerçek koruma
altında).

---

## 2. Tautoloji kontrolü — mutasyon testi (A-1/A-2 ayrımı)

`UNPARSABLE_CREATE_TABLE` kuralının üretildiği `push` bloğu geçici olarak devre dışı
bırakıldı (`continue`'a indirildi), yedekten geri alındı (`$TMPDIR/ac-mutation-migration-set.bak`).

**Sonuç:** `Tests 1 failed | 84 passed (85)` — **sadece** `A-2` kırıldı; `A-1`
(`UNCLASSIFIED_TABLE`, farklı kural) ve `A-3` (regresyon kontrolü) **etkilenmedi**.
→ A-1/A-2 ayrımı **tautoloji değil**, iki farklı kuralı bağımsız olarak ölçüyor.
Geri alma doğrulandı (`diff` farksız, `git status --porcelain` başlangıçla aynı).

---

## 3. İkinci mutasyon — V3-kök'ün gerçekten `isDirectory()` filtresini mi kanıtladığı

`readMigrationSet` içindeki `if (!entry.isDirectory()) { continue }` bloğu geçici
olarak yorum satırıyla değiştirildi (filtre tamamen kaldırıldı), yedekten geri alındı
(`$TMPDIR/ac-mutation2.bak`).

**Sonuç:** `Tests 85 passed (85)` — **hiçbir test kırılmadı**, "V3-kök" dahil.

**Yorum:** `readMigrationSet`, dizin olmayan bir girdi (kök seviyesindeki
`migration_lock.toml`) için `join(baseDirectoryPath, entry.name, 'migration.sql')` yolunu
oluşturup `existsSync` ile kontrol ediyor; bu yol bir dosyanın "alt dizini" olamayacağı
için `existsSync` zaten `false` döner. Yani **`existsSync` kontrolü, `isDirectory()`
kontrolü olmadan da aynı girdiyi filtreler** — ikisi bu özel girdi için **redundant**.
"V3-kök" testinin adı ve yorumları (`migration-sql.test.ts:552`, `migration-set.ts:216-220`,
solid gate tur1 bulgu C5'in düzeltmesi) açıkça **"isDirectory() filtresiyle dışlanır"**
iddiasında bulunuyor — ama mutasyon kanıtlıyor ki bu iddia **doğrulanmamış**: testi
geçirmek için `isDirectory()` dalının var olması **gerekmiyor**.

Bu, solid gate tur1'in **aynı bulguyu** (C5, `low`) zaten tespit ettiği ve düzeltme
turunun (yeni `rootFiles` parametresi + "V3-kök" vakası) **kapatmaya çalıştığı** ama
**fiilen kapatamadığı** bir durum — düzeltme, solid'in istediği mekanizmayı (kök
seviyesine gerçek bir dosya yazmak) doğru şekilde kurdu, ama bu mekanizma hâlâ
`existsSync` yarısından ayrışmıyor çünkü üretim kodunun kendisi (`migration-set.ts`)
iki kontrolü **sıralı ve örtüşen** biçimde uyguluyor. Üretim davranışı **yanlış değil**
(gerçek Prisma düzeninde doğru çalışıyor) — yalnızca test, iddia ettiği izolasyonu
sağlamıyor. Bu `AGENT_BASELINE`'ın "eksik test" tanımına (medium) uyuyor; solid gate
tur1'in aynı kategorideki iki bulgusu (AC7c "SET NOT NULL" dalı, `stripLineComments`
doğrulaması) de `medium` olarak kayıtlıydı ve bu turda gerçekten kapatıldı — bu
üçüncüsü ise **kapatılamadı**.

Geri alma doğrulandı (`diff` farksız, `git status --porcelain` başlangıçla aynı;
`pnpm lint`/`typecheck` sonrasında **cache hit** (15/15) vermesi dosya içeriğinin
hash düzeyinde öncekiyle aynı olduğunu bağımsızca teyit ediyor).

---

## 4. Diğer örneklem doğrulamaları (kod okuması + testin geçtiği doğrulandı)

| Vaka   | İddia                                                       | Doğrulama                                                                                                        | Sonuç                  |
| ------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------- |
| A-1    | taksonomide yok, tek satır → `UNCLASSIFIED_TABLE`           | kod okuması + mutasyon testi (§2)                                                                                | DOĞRU                  |
| A-2    | taksonomide var, tek satır → `UNPARSABLE_CREATE_TABLE`      | mutasyon testi (§2)                                                                                              | DOĞRU                  |
| A-3    | kanonik çok satırlı → ihlal yok                             | kod okuması, `violations.toHaveLength(0)`                                                                        | DOĞRU (regresyon yok)  |
| B1     | `SET NOT NULL` ayrı vaka                                    | `generateSetNotNullStatement` + `AC7c-ek` testi mevcut                                                           | DOĞRU                  |
| B2     | yorumda `DROP COLUMN`, ifade `CREATE TABLE` → `not.toThrow` | kod okuması, `stripLineComments` yorum satırını atıyor                                                           | DOĞRU                  |
| C1 ×2  | küçük harf `drop column` / çift boşluk `SET  NOT NULL`      | `\bDROP\s`/`\bSET\s+NOT\s+NULL\b` + `toUpperCase()` normalizasyonu                                               | DOĞRU                  |
| AC7d   | tek kolonlu `tenant_id` UNIQUE INDEX → ihlal (C8 kasıtlı)   | regex sondaki virgül (`"tenant_id",`) iki+ kolon şartı koyuyor                                                   | DOĞRU                  |
| V3-kök | kökte `migration_lock.toml` → migration sayılmaz            | **DOĞRU ama iddia edilen mekanizma (`isDirectory()`) değil, `existsSync` tarafından sağlanıyor — bkz. §3 bulgu** | KISMEN — bkz. BULGULAR |

**Tautoloji kontrolü sonucu:** A-1/A-2 ayrımı mutasyonla kanıtlandı, tautoloji değil.

---

## 5. Regresyon ve komut çıktıları

- `pnpm --filter @arkesoft/db test` (restore sonrası, 4 ayrı koşum): **85 passed (85)**
  her seferinde, 0 failed/0 skipped. Süre: 1.34s / 1.32s / 1.63s / 1.61s — **flaky değil**
  (sonuç sabit, yalnızca duration doğal varyans; eşik aşımı yok).
- `pnpm test` (kök, tüm paketler): `@arkesoft/errors` 35 passed · `@arkesoft/db`
  **85 passed** · `@arkesoft/api` 112 passed — **0 failed**, diğer paketler
  **etkilenmemiş** (regresyon yok).
- `pnpm lint` (kök) → **EXIT 0**, 15/15 FULL TURBO.
- `pnpm typecheck` (kök) → **EXIT 0**, 15/15.
- `pnpm build` (kök) → **EXIT 0**, 12/12; `packages/db/dist` **64 dosya** (tur 1 ile
  aynı, fark yok).
- `pnpm format:check` (kök) → **EXIT 0**, "All matched files use Prettier code style!"
- `git status --porcelain packages/db/prisma` → **boş** (AC10).
- `git diff --stat -- packages/db/src/index.ts packages/db/src/tenancy.ts` → **boş** (AC10).
- `pnpm --filter @arkesoft/db exec vitest list` → **EXIT 0**; `$TMPDIR` altında
  `arkesoft-migration-set-*` taraması **önce de sonra da boş** (R-P1 temiz, sızıntı yok).
- `grep "\.each("` / `grep "\.skip\|\.only"` → **eşleşme yok** (R-P1, testi gevşetme yasağı).
- `pnpm test:isolation` / `pnpm test:e2e` → **bu sürümde henüz yok** (kök `package.json`'da
  tanımlı değil; AGENT_BASELINE §6: v0.0.13 / v0.0.19'dan itibaren).

---

## 6. Son durum doğrulaması

```
$ git status --porcelain
 M packages/db/src/__tests__/migration-sql.test.ts
?? .claude/workflow/reviews/T-004-qa-tur1.md
?? .claude/workflow/reviews/T-004-qa-tur2.md        ← bu rapor, QA'nın kendi çıktısı
?? .claude/workflow/reviews/T-004-security-tur1.md
?? .claude/workflow/reviews/T-004-solid-tur1.md
?? .claude/workflow/tasks/T-004.md
?? packages/db/src/__tests__/helpers/migration-set-fixture.ts
?? packages/db/src/__tests__/helpers/migration-set.ts
```

Oturum başlangıcındaki durumla **birebir aynı** (bu rapor dosyası hariç — beklenen).
İki geçici prob/mutasyon değişikliği de (§1, §2, §3) yedekten tam olarak geri alındı;
`pnpm lint`/`pnpm typecheck`'in restore sonrası **cache hit** vermesi (dosya hash'i
değişmedi) bunu bağımsızca doğruluyor.

---

## 7. BULGULAR

- [SEV: medium] `packages/db/src/__tests__/migration-sql.test.ts:552-578` ("V3-kök" vakası)
  - `packages/db/src/__tests__/helpers/migration-set.ts:204-206` (`if (!entry.isDirectory())`) —
    **Düzeltme turu solid gate tur1'in C5 bulgusunu ("isDirectory() yarısı hiçbir fixture'da
    kanıtlanmıyor") kapatmaya çalıştı ama fiilen kapatamadı.** Yeni `rootFiles` parametresi
    gerçekten kullanılıyor (ölü kod değil) ve kökte `migration_lock.toml` gerçekten yazılıyor —
    ama mutasyon testiyle kanıtlandı (bu rapor §3): `readMigrationSet`'teki `isDirectory()`
    kontrolü tamamen kaldırılsa bile **85 testin hepsi (V3-kök dahil) hâlâ geçiyor**, çünkü
    `existsSync(join(..., entry.name, 'migration.sql'))` bir dosyanın (dizin olmayan girdinin)
    "alt yolunu" sorguladığında zaten `false` dönüyor — iki kontrol bu girdi için çakışıyor
    (redundant). Test adı ve üç ayrı yorum (`migration-sql.test.ts:552`,
    `migration-set.ts:216-220`, T-004.md S1 tanımı) "isDirectory() filtresiyle dışlanır"
    iddiasında bulunuyor; bu iddia şu an **doğrulanmamış durumda** — `entry.isDirectory()`
    dalı regresyona girse (örn. yanlışlıkla silinse veya ters çevrilse) hiçbir test bunu
    yakalamaz. Üretim davranışı **bozuk değil** (gerçek Prisma düzeninde doğru çalışıyor,
    iki kontrol de doğru sonuca varıyor) — yalnızca bu test, iddia ettiği izolasyonu
    sağlamıyor. Kategori olarak solid gate tur1'in **aynı turda gerçekten kapatılmış** iki
    kardeş bulgusuyla (AC7c "SET NOT NULL" dalı, `stripLineComments` doğrulaması) birebir
    aynı sınıf — ama bu üçüncüsü kapatılamadı.
    — Önerilen düzeltme: `isDirectory()` dalını **gerçekten** izole eden bir vaka ekle — ör.
    kökte bir dosya **adını** migration dizin adı deseniyle **aynı biçimde** ama bir dosya
    olarak yazıp (örn. `19800101000099_fixture_file_not_dir` adında bir **dosya**, dizin değil)
    `readdirSync` onu dönerken `entry.isDirectory()` `false`, ama altında gerçekten
    `migration.sql` **olamayacağı** için `existsSync` zaten koruyacaktır — bu yüzden gerçek
    izolasyon için ya `migration-set.ts`'te kontrolleri **ayrı ayrı** test edilebilir hâle
    getirecek bir iç API gerekir, ya da yorum/test adı "V3'ün **her iki** yarısı birlikte
    kanıtlanıyor, ayrı ayrı değil" şeklinde **daraltılmalı** (iddiayı küçültmek, testi
    gevşetmek değil). İkinci yol daha ucuz ve dürüst.
    — Sorumlu ajan: `db` (dosya sahibi, S1) — teknik borca kaydedilsin.

Başka bulgu yok. (Tur 1'in `low` bulgusu — `git checkout -- <dizin>` talimatı — Orkestratör
tarafından düzeltildi, tur 2 mekaniği tek dosya yoluna + `cp` tabanlı yedeklemeye geçti;
bu turda **tekrarlanmadı**, kapanmış kabul edildi.)

---

## ÖLÇÜMLER

**KABUL KRİTERİ EŞLEMESİ (AC1–AC11, bu tur yeniden doğrulandı):**

| AC         | Test                                                              | Sonuç                                                         |
| ---------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| AC1        | "AC1: migration.sql içeren her dizin okunur…"                     | GEÇTİ                                                         |
| AC2        | "AC2 — ASIL PROB…"                                                | GEÇTİ, AC3 ters probuyla kırmızıya döndüğü yeniden kanıtlandı |
| AC3        | Ters prob — §1                                                    | GEÇTİ (17 vaka kırmızı, F1 riski yok)                         |
| AC4        | "AC4 — tautoloji değil…"                                          | GEÇTİ, ters prob + mutasyonla iki kez kanıtlandı              |
| AC5        | "AC5: hiçbir dizin adı _init ile bitmese de…"                     | GEÇTİ                                                         |
| AC6        | boş küme → `EMPTY_MIGRATION_SET`                                  | GEÇTİ                                                         |
| AC7a/b/c/d | dört ayrı vaka                                                    | GEÇTİ                                                         |
| AC8        | hata mesajı dizin adını taşır                                     | GEÇTİ                                                         |
| AC9        | 85 ≥ 65 (ve ≥ 76), 0 failed/0 skipped, lint+typecheck+build yeşil | GEÇTİ                                                         |
| AC10       | `prisma`/`index.ts`/`tenancy.ts` dokunulmamış                     | GEÇTİ                                                         |
| AC11       | `dist/` 64 dosya, değişmemiş                                      | GEÇTİ                                                         |

Karşılıksız kriter yok.

**TEST SAYILARI:**

- `packages/db` toplam: **85 / 85 geçti**, 0 başarısız, 0 skipped (tur 1'e göre net **+9**: 76→85)
- AC3 ters prob koşumu (geçici, geri alındı): **17 failed / 68 passed (85)**
- Tautoloji mutasyonu (geçici, geri alındı): **1 failed / 84 passed (85)** — yalnızca A-2
- İkinci mutasyon (`isDirectory()` kaldırıldı, geçici, geri alındı): **0 failed / 85 passed (85)** — bulgu §3/§7
- Kök `pnpm test`: `@arkesoft/errors` 35/35 · `@arkesoft/db` 85/85 · `@arkesoft/api` 112/112 — **toplam 232/232**, 0 başarısız

**SÜRE (tur1 → tur2):**

- Tur 1: 1.39s (65) → 1.41s/1.32s (76)
- Tur 2: 85 test, 4 koşum → 1.34s / 1.32s / 1.63s / 1.61s
- Artış tur1'in son ölçümüne (1.32s, 76 test) göre: **~0–0.3s** → **eşiğin (~5s) çok altında,
  `medium` bulgu yok**. Flaky değil — tüm koşumlarda sonuç 85/85 sabit, yalnızca duration
  doğal varyans gösteriyor.

**KOŞTURULAN KOMUTLAR:**

| Komut                                                              | Exit kodu       | Özet                                                             |
| ------------------------------------------------------------------ | --------------- | ---------------------------------------------------------------- |
| `git status --porcelain` (başlangıç)                               | 0               | 6 yol (3 gate raporu dahil), beklenen                            |
| `cp migration-set.ts → $TMPDIR/ac3-*.bak` + `diff`                 | 0               | yedek doğrulandı                                                 |
| `pnpm --filter @arkesoft/db test` (AC3 ters prob)                  | ≠0              | 17 failed / 68 passed (85) — beklenen kırmızı                    |
| `cp $TMPDIR/ac3-*.bak → migration-set.ts` + `diff`                 | 0               | `RESTORE_IDENTICAL`                                              |
| `pnpm --filter @arkesoft/db test` (restore sonrası, ×4)            | 0               | 85 passed, her seferinde                                         |
| mutasyon 1 (`UNPARSABLE_CREATE_TABLE` devre dışı) + test + restore | 0/≠0/0          | 1 failed (A-2) / 84 passed → restore `RESTORE_IDENTICAL`         |
| mutasyon 2 (`isDirectory()` kaldırıldı) + test + restore           | 0/0/0           | 85 passed (bulgu §7) → restore `RESTORE_IDENTICAL`               |
| `pnpm test` (kök)                                                  | 0               | errors 35 · db 85 · api 112, toplam 232 passed                   |
| `pnpm lint` (kök)                                                  | 0               | 15/15 FULL TURBO                                                 |
| `pnpm typecheck` (kök)                                             | 0               | 15/15 (restore sonrası cache hit — hash eşitliği bağımsız kanıt) |
| `pnpm build` (kök)                                                 | 0               | 12/12, `dist/` 64 dosya değişmedi                                |
| `pnpm format:check` (kök)                                          | 0               | temiz                                                            |
| `git status --porcelain packages/db/prisma`                        | 0               | boş                                                              |
| `git diff --stat -- src/index.ts tenancy.ts`                       | 0               | boş                                                              |
| `pnpm --filter @arkesoft/db exec vitest list`                      | 0               | tmpdir artığı önce/sonra yok                                     |
| `grep ".each("` / `grep ".skip\|.only"`                            | 1 (eşleşme yok) | temiz                                                            |
| `pnpm test:isolation` / `pnpm test:e2e`                            | —               | bu sürümde henüz yok                                             |

**BULGU DAĞILIMI:** critical 0 · high 0 · medium 1 · low 0 → **PASS**
(AGENT_BASELINE §4: 1–2 medium → PASS, teknik borca kaydedilir).
