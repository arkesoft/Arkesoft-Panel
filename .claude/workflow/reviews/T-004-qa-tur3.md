T-004 — QA Gate, Tur 3 (dar)
Tarih: 2026-10-28
Sürüm: v0.0.13 önkoşulu (T2-1 kapanışı) — kapanış doğrulaması, mutasyon testi, regresyon
Dal: `main`

GATE: qa
SONUÇ: PASS

---

## 0. Başlangıç durumu

`git status --porcelain` (repo kökü, oturum başı):

```
 M packages/db/src/__tests__/migration-sql.test.ts
?? .claude/workflow/reviews/T-004-qa-tur1.md
?? .claude/workflow/reviews/T-004-qa-tur2.md
?? .claude/workflow/reviews/T-004-security-tur1.md
?? .claude/workflow/reviews/T-004-security-tur2.md
?? .claude/workflow/reviews/T-004-solid-tur1.md
?? .claude/workflow/reviews/T-004-solid-tur2.md
?? .claude/workflow/tasks/T-004.md
?? packages/db/src/__tests__/helpers/migration-set-fixture.ts
?? packages/db/src/__tests__/helpers/migration-set.ts
```

Bu tur boyunca **dört geçici mutasyon** (§1–§2) yapıldı, hepsi `cp` ile yedeklenip
`cp` ile geri alındı — **`git checkout` bir kez bile kullanılmadı**. Her birinin
sonrasında `git status --porcelain` ve `diff` ile yukarıdakiyle **birebir aynı**
olduğu doğrulandı.

---

## 1. Tur 2 `medium` bulgusu — kapanış doğrulaması (MUTASYON TESTİ)

Tur 2 bulgusu: `readMigrationSet`'teki `entry.isDirectory()` filtresi hiçbir
fixture tarafından **gerçekten** pinlenmiyordu (filtre kaldırılınca 85/85 geçiyordu).
FIX 2 `rootSymlinks` parametresi + symlink vakası ekleyip bunu kapatmaya çalıştı.

**Mekanik:**

1. `cp packages/db/src/__tests__/helpers/migration-set.ts "$TMPDIR/qa3-ms.bak"` → `diff` farksız.
2. `entry.isDirectory()` bloğu kaldırıldı (python ile tek bloklu, metin eşleşmesi
   doğrulanarak değiştirildi — grep ile tek bir eşleşme olduğu önceden kontrol edildi).
3. `pnpm --filter @arkesoft/db test` → **gerçek terminal çıktısı:**

```
 FAIL  src/__tests__/migration-sql.test.ts > migration-set — prob süiti (kök
 seviyesindeki migration_lock.toml migration dizini sayılmaz) > migration.sql
 içeren bir dizine işaret eden kök sembolik bağ migration sayılmaz
 (isDirectory() dalının gerçek pin'i)
AssertionError: expected [ …(2) ] to deeply equal [ Array(1) ]
- Expected: ["19800101000014_fixture_symlink_target"]
+ Received: ["19800101000014_fixture_symlink_target", "19800101000015_fixture_symlink_alias"]

 Test Files  1 failed | 4 passed (5)
      Tests  1 failed | 92 passed (93)
```

**Kırmızıya dönen vaka: tam olarak ve yalnızca** "migration.sql içeren bir dizine
işaret eden kök sembolik bağ migration sayılmaz (isDirectory() dalının gerçek
pin'i)" — başka hiçbir vaka etkilenmedi (92/93 yeşil kaldı).

4. `cp "$TMPDIR/qa3-ms.bak" packages/db/src/__tests__/helpers/migration-set.ts` →
   `diff` **farksız** (`RESTORE_IDENTICAL`). `git status --porcelain` → başlangıçla
   **birebir aynı**.
5. Süit yeniden koşturuldu → **93 passed (93)**.

**`skipIf` uyarısı (doğrulandı):** `pnpm --filter @arkesoft/db exec vitest run
--reporter=verbose` çıktısında symlink vakası `✓` (geçti) olarak göründü — bu
makine macOS, `it.skipIf(process.platform === 'win32')` **skip üretmedi**.
Mutasyon testi bu nedenle **anlamlı**.

**SONUÇ: Tur 2'nin `medium` bulgusu kapandı.** `isDirectory()` dalı artık
symlink vakası tarafından **gerçekten** pinleniyor — filtre kaldırıldığında test
kırmızıya dönüyor.

---

## 2. Yeni vakalar gerçekten kanıtlıyor mu — örneklem mutasyon testi

Her mutasyon `cp` ile yedeklenip (`$TMPDIR/qa3-ms-mut{2,3,4}.bak`) sonra `cp` ile
geri alındı; her geri almada `diff` **farksız** ve `git status --porcelain`
başlangıçla **birebir aynı** doğrulandı (ayrıntı aşağıda her alt bölümde özetlendi,
tekrar etmiyorum — hepsi `RESTORE_IDENTICAL`).

### 2.1 Ayna bekçisi devre dışı (`if (false && tokenCount > nameCount)`)

```
 Test Files  1 failed | 4 passed (5)
      Tests  1 failed | 92 passed (93)
 FAIL ... > tırnaksız tablo adı taşıyan CREATE TABLE sessizce geçmez,
 UNPARSABLE_CREATE_TABLE üretir (ayna bekçisi)
```

**Yalnızca** tırnaksız-ad vakası kırmızıya döndü, başka hiçbir vaka etkilenmedi.
→ Bekçi **beklenen kapsamda** çalışıyor, daha geniş bir alan kaplamıyor. Bulgu yok.

### 2.2 Maskeleme no-op (`maskSingleQuotedStringLiterals` → `return sql`)

```
 Test Files  1 failed | 4 passed (5)
      Tests  2 failed | 91 passed (93)
 FAIL ... > INSERT değeri olarak "Drop Shipping" DESTRUCTIVE_STATEMENT üretmez
 FAIL ... > sütun varsayılanındaki tek tırnaklı "set not null" dizesi DESTRUCTIVE_STATEMENT üretmez
```

**İki vaka da** (`'Drop Shipping'` ve sütun varsayılanı) kırmızıya döndü. →
Bu Task'ta üç kez çıkan "mekanizmayı pinlemeyen vaka" sınıfı **bu kez
tekrarlanmadı** — maskeleme gerçekten bu iki vakayı koruyor. Bulgu yok.

### 2.3 `i` bayrağı kaldırıldı (`extractCreatedTableNames` deseni, `/gi` → `/g`)

```
 Test Files  1 failed | 4 passed (5)
      Tests  1 failed | 92 passed (93)
 FAIL ... > altı biçim varyantının her biri UNCLASSIFIED_TABLE üretir
AssertionError: biçim "küçük harf" UNCLASSIFIED_TABLE üretmedi
```

Harf-varyantı vakası (döngünün ilk assertion'ında, "küçük harf") kırmızıya döndü
→ `i` bayrağı gerçekten pinleniyor. Bulgu yok.

**Mutasyon testleri özeti:** 3/3 mutasyon beklenen vakayı (ve **yalnızca**
beklenen vakayı) kırmızıya çevirdi. Hiçbiri "sahte-yeşil" sınıfına girmedi.

---

## 3. Regresyon

- `pnpm --filter @arkesoft/db test` → **93 passed (93)**, 0 failed/0 skipped,
  **3 ayrı koşum** (mutasyon testleri dışında, restore sonrası): 1.29s / 1.30s / 1.25s
  — **flaky değil**, sonuç sabit.
- Tur 2 → Tur 3 süre artışı: tur 2'nin son ölçümleri (1.34/1.32/1.63/1.61s, 85 test)
  → tur 3 (1.25–1.38s, 93 test, symlink işlemleri dahil). **Artış yok, hatta
  minimum değer düştü** — eşiğin (~5s) çok altında, `medium` bulgu yok.
- `pnpm test` (kök) → `@arkesoft/errors` 35 passed · `@arkesoft/db` **93 passed**
  · `@arkesoft/api` 112 passed — **toplam 240 passed**, 0 başarısız. 7/7 turbo
  task başarılı.
- `pnpm lint` (kök) → **EXIT 0**, 15/15 FULL TURBO.
- `pnpm typecheck` (kök) → **EXIT 0**, 15/15 FULL TURBO.
- `pnpm build` (kök) → **EXIT 0**, 12/12 FULL TURBO.
- `pnpm format:check` (kök) → **EXIT 0**, "All matched files use Prettier code style!"
- **AC10:** `git status --porcelain packages/db/prisma` → boş. `git diff --stat --
packages/db/src/index.ts packages/db/src/tenancy.ts` → boş.
- **AC11:** `find packages/db/dist -type f | wc -l` → **64**, değişmemiş (tur 2 ile aynı).
- **R-P1:**
  - `grep "\.each("` (migration-sql.test.ts + helpers) → eşleşme yok (kökteki
    `guard-policy.test.ts`'de pre-existing, T-004 kapsamı dışı `it.each` var —
    `git log` bunun `3d4c315` merge commit'inde zaten geldiğini doğruladı, bu
    turun teslimatı değil).
  - `grep "\.skip\b\|\.only\b"` (aynı üç dosya) → eşleşme yok.
  - `pnpm --filter @arkesoft/db exec vitest list` → **EXIT 0**, toplama fazı
    hatasız.
  - `$TMPDIR`/`/tmp` altında `arkesoft-migration-set-*` taraması: **önce**, **vitest
    list sonrası**, **tam test koşumu sonrası** — üçünde de **boş** (sızıntı yok,
    symlink dahil — `rmSync(root, {recursive:true})` symlink girdisini de
    temizliyor, kalıntı yok).

---

## 4. Ara noktalar

### 4.1 Gerçek repo migration'ı hâlâ 0 ihlal veriyor mu

`packages/db`'de `tsx` ile bağımsız bir doğrulama scripti koşturuldu (yazıldı,
sonuç alındıktan sonra `rm` ile silindi — git'e hiç girmedi):

```
migration dirs: [ '20261026082729_init' ]
TOTAL VIOLATIONS: 0
[]
```

**Sekiz kuralın TAMAMI** (gerçek testin kapsadığı 5 kuralın ötesinde
`UNPARSABLE_CREATE_TABLE` ve `MISSING_TENANT_SCOPED_TABLE` dahil) sıfır ihlal
veriyor — FIX 2'nin üç desen değişikliği (ad/gövde `i` bayrağı, maskeleme, ayna
bekçisi) kanonik gerçek migration'da **yanlış pozitif üretmedi**.

### 4.2 `rootFiles` / `rootSymlinks` — ikisi de kullanılıyor mu

`grep -n "withTemporaryMigrationSet("` ile tüm çağrı noktaları tarandı: satır 593
(`rootFiles`, "kök seviyesindeki migration_lock.toml" vakası) ve satır 633
(`rootSymlinks`, symlink vakası) **her ikisi de gerçek bir `it()` içinde** çağrılıyor.
**Ölü parametre yok.**

### 4.3 Kural fixture'ı gevşetildi mi

`migration-set.ts` ve `migration-set-fixture.ts` bu dalda **untracked** (`??`) —
`git show HEAD:...` ile karşılaştırılacak önceki bir sürüm **yok** (ilk kez bu
Task'ta ekleniyor, `HEAD`'deki 114 satırlık eski `migration-sql.test.ts` tamamen
farklı bir mantığa dayanıyordu — T2-1'in kapsadığı tam yeniden yazım). Bu yüzden
git-diff tabanlı "gevşeme" karşılaştırması bu iki dosya için **uygulanabilir değil**.
Bunun yerine §2'deki üç mutasyon testi **dolaylı olarak** aynı soruyu yanıtlıyor:
üç kuralın hiçbiri (ayna bekçisi, maskeleme, `i` bayrağı) testi geçirmek için
gevşetilmiş/no-op durumda değil — üçü de mutasyonla kırmızıya döndü. `migration-sql.test.ts`
(tracked, `M`) için `git diff HEAD` okundu: yalnızca yeni `describe`/`it` blokları
eklendi, mevcut `expect` çağrılarından hiçbiri gevşetilmedi/kaldırılmadı
(satır satır karşılaştırma, bu rapor üretimi sırasında yapıldı — eşik düşürme
veya assertion kaldırma **gözlenmedi**).

---

## 5. BULGULAR

yok

---

## ÖLÇÜMLER

**KABUL KRİTERİ EŞLEMESİ (AC1–AC11, bu tur kapanış açısından yeniden doğrulandı):**

| AC                                | Test                                             | Sonuç           |
| --------------------------------- | ------------------------------------------------ | --------------- |
| AC1–AC9                           | tur 2'de eşlendi, bu tur değişmedi — 93/93 geçti | GEÇTİ           |
| AC10                              | `prisma`/`index.ts`/`tenancy.ts` dokunulmamış    | GEÇTİ           |
| AC11                              | `dist/` 64 dosya, değişmemiş                     | GEÇTİ           |
| Tur2 medium (`isDirectory()` pin) | symlink vakası + mutasyon testi (§1)             | GEÇTİ — KAPANDI |

Karşılıksız kriter yok.

**TEST SAYILARI:**

- `packages/db` toplam: **93 / 93 geçti**, **0 başarısız**, **0 skipped** (tur 2'ye
  göre net değişim yok — tur 2 FIX 2 öncesi 85, bu turun başlangıcı zaten 93;
  bu tur yeni test **eklemedi**, yalnızca doğruladı).
- Kök `pnpm test`: `@arkesoft/errors` 35/35 · `@arkesoft/db` 93/93 ·
  `@arkesoft/api` 112/112 — **toplam 240/240**, 0 başarısız.
- Mutasyon 1 (`isDirectory()` kaldırıldı, geçici, geri alındı): **1 failed / 92
  passed (93)** — yalnızca symlink vakası.
- Mutasyon 2 (ayna bekçisi devre dışı, geçici, geri alındı): **1 failed / 92
  passed (93)** — yalnızca tırnaksız-ad vakası.
- Mutasyon 3 (maskeleme no-op, geçici, geri alındı): **2 failed / 91 passed
  (93)** — "Drop Shipping" + sütun varsayılanı vakaları.
- Mutasyon 4 (`i` bayrağı kaldırıldı, geçici, geri alındı): **1 failed / 92
  passed (93)** — harf-varyantı vakası (ilk assertion, "küçük harf").

**SÜRE (tur2 → tur3):**

- Tur 2: 85 test, 4 koşum → 1.34s / 1.32s / 1.63s / 1.61s
- Tur 3: 93 test, 3 koşum (restore sonrası) → 1.29s / 1.30s / 1.25s
- **Artış yok** (tur 2'nin minimumundan (1.32s) tur 3'ün minimumuna (1.25s) —
  süre **düştü**, symlink işlemlerine rağmen). `medium` bulgu yok.

**KOŞTURULAN KOMUTLAR:**

| Komut                                                                                   | Exit kodu       | Özet                                                                                   |
| --------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------- |
| `git status --porcelain` (başlangıç)                                                    | 0               | 9 yol, beklenen                                                                        |
| `cp migration-set.ts → $TMPDIR/qa3-ms.bak` + `diff`                                     | 0               | yedek doğrulandı                                                                       |
| mutasyon 1 (`isDirectory()` kaldırıldı) + test + restore                                | 0/≠0/0          | 1 failed (symlink) / 92 passed → `RESTORE_IDENTICAL`                                   |
| `pnpm --filter @arkesoft/db exec vitest run --reporter=verbose` (symlink vaka kontrolü) | 0               | symlink vakası `✓` (skip değil)                                                        |
| mutasyon 2 (ayna bekçisi devre dışı) + test + restore                                   | 0/≠0/0          | 1 failed (tırnaksız ad) / 92 passed → `RESTORE_IDENTICAL`                              |
| mutasyon 3 (maskeleme no-op) + test + restore                                           | 0/≠0/0          | 2 failed (Drop Shipping + set not null) / 91 passed → `RESTORE_IDENTICAL`              |
| mutasyon 4 (`i` bayrağı kaldırıldı) + test + restore                                    | 0/≠0/0          | 1 failed (harf varyantı) / 92 passed → `RESTORE_IDENTICAL`                             |
| `pnpm --filter @arkesoft/db test` (restore sonrası, ×3)                                 | 0               | 93 passed her seferinde, 1.25–1.30s                                                    |
| `pnpm test` (kök)                                                                       | 0               | errors 35 · db 93 · api 112, toplam 240 passed                                         |
| `pnpm lint` (kök)                                                                       | 0               | 15/15 FULL TURBO                                                                       |
| `pnpm typecheck` (kök)                                                                  | 0               | 15/15 FULL TURBO                                                                       |
| `pnpm build` (kök)                                                                      | 0               | 12/12 FULL TURBO, `dist/` 64 dosya değişmedi                                           |
| `pnpm format:check` (kök)                                                               | 0               | temiz                                                                                  |
| `git status --porcelain packages/db/prisma`                                             | 0               | boş                                                                                    |
| `git diff --stat -- src/index.ts tenancy.ts`                                            | 0               | boş                                                                                    |
| `pnpm --filter @arkesoft/db exec vitest list`                                           | 0               | toplama fazı hatasız, tmpdir artığı önce/sonra yok                                     |
| `grep ".each("` / `grep ".skip\|.only"` (3 ilgili dosya)                                | 1 (eşleşme yok) | temiz (kökteki `guard-policy.test.ts`'in `it.each`'i T-004 kapsamı dışı, pre-existing) |
| `tsx` ile gerçek migration bağımsız doğrulama (yazıldı, sonuçlandı, silindi)            | 0               | TOTAL VIOLATIONS: 0 (8 kuralın tamamı)                                                 |
| `pnpm test:isolation` / `pnpm test:e2e`                                                 | —               | bu sürümde henüz yok                                                                   |

**BULGU DAĞILIMI:** critical 0 · high 0 · medium 0 · low 0 → **PASS**

**KAPANIŞ DURUMU:** Tur 2'nin tek `medium` bulgusu (`isDirectory()` dalının
pinlenmemesi) FIX 2'nin symlink vakasıyla **gerçekten kapandı** — mutasyon
testiyle bağımsız olarak doğrulandı. Örneklenen 3 yeni mekanizmanın (ayna
bekçisi, maskeleme, `i` bayrağı) hiçbiri sahte-yeşil değil; hepsi mutasyonla
kırmızıya döndü, hiçbiri beklenenden geniş/dar kapsamda değil.
