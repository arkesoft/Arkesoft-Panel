T-004 — QA Gate, Tur 4 (dar)
Tarih: 2026-10-28
Sürüm: v0.0.13 önkoşulu (T2-1 kapanışı) — FIX 3 sonrası mutasyon testi, regresyon
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
?? .claude/workflow/reviews/T-004-qa-tur3.md
?? .claude/workflow/reviews/T-004-security-tur1.md
?? .claude/workflow/reviews/T-004-security-tur2.md
?? .claude/workflow/reviews/T-004-security-tur3.md
?? .claude/workflow/reviews/T-004-solid-tur1.md
?? .claude/workflow/reviews/T-004-solid-tur2.md
?? .claude/workflow/reviews/T-004-solid-tur3.md
?? .claude/workflow/tasks/T-004.md
?? packages/db/src/__tests__/helpers/migration-set-fixture.ts
?? packages/db/src/__tests__/helpers/migration-set.ts
```

(Oturum ortasında `.claude/workflow/reviews/T-004-security-tur4.md` paralel bir
ajan tarafından eklendi — bu QA turunun teslimatı değil, §3'teki
`format:check` bulgusunun kaynağı.)

Bu tur boyunca **beş geçici mutasyon** (§1) yapıldı, hepsi `cp` ile yedeklenip
`cp` ile geri alındı — **`git checkout` bir kez bile kullanılmadı**. Her
birinin sonrasında `git status --porcelain` ve `diff` ile yedekle **birebir
aynı** olduğu doğrulandı (`RESTORE_IDENTICAL_1..5`). Son durum başlangıçla
(yukarıdaki tur4 öncesi liste + `security-tur4.md`) birebir eşleşiyor.

---

## 1. MUTASYON TESTİ — beş yeni mekanizma

Her mutasyon öncesi `cp` yedeği alındı (`migration-set.ts.bak`,
`migration-set-fixture.ts.bak`), `diff` ile yedeğin kaynakla farksız olduğu
doğrulandı, mutasyon uygulandı, `pnpm --filter @arkesoft/db test` koşturuldu,
sonra `cp` ile **tam olarak** geri yüklendi ve `diff` ile `RESTORE_IDENTICAL`
onaylandı.

### 1.1 Fail-closed koşulu (`% 2 === 1`) devre dışı

`maskSingleQuotedStringLiteralsSafely` içindeki
`if (countSingleQuoteCharacters(sql) % 2 === 1)` → `if (false && ...)`.

```
Tests  4 failed | 105 passed (109)
FAIL ... C1: çift tırnaklı tanımlayıcı içindeki apostrof + sonraki literal
FAIL ... C2: $$...$$ fonksiyon gövdesindeki Türkçe blok yorumdaki apostrof + sonraki literal
FAIL ... C3: stripLineComments zincirinin bir literali kesmesi + sonraki literal
FAIL ... C5: kapanmayan (dangling) literal + sonraki literal
```

**Tam olarak beklenen 4 vaka** (C1/C2/C3/C5) kırmızı — başka hiçbir vaka
etkilenmedi. Mekanizma **doğru pinleniyor**, aşırı geniş/dar değil.

### 1.2 `UNPARSABLE_SQL` kuralı üretimi kaldırıldı

`maskingSkipped` true olduğunda `violations.push({ rule: 'UNPARSABLE_SQL', ... })`
bloğu kaldırıldı (`void maskingSkipped` ile değiştirildi; DESTRUCTIVE_STATEMENT
taraması hâlâ ham metin üzerinden çalıştığı için o kısım etkilenmedi).

```
Tests  4 failed | 105 passed (109)
FAIL ... C1 / C2 / C3 / C5 (aynı dört vaka — UNPARSABLE_SQL === true beklentisi karşılanmadı)
```

**Yalnızca o 4 vaka** kırmızı — `DESTRUCTIVE_STATEMENT` beklentileri (aynı
testlerin ilk `expect`'i) hâlâ geçti, sadece `UNPARSABLE_SQL` beklentisi
(ikinci `expect`) başarısız oldu. Gerçek repo testi (`UNPARSABLE_SQL` = 0
ihlal) etkilenmedi çünkü gerçek migration'da zaten `maskingSkipped` hiç
tetiklenmiyor. Mekanizma **doğru pinleniyor**.

### 1.3 Ayna bekçisinin girdisi `maskedSql` → ham `sql`

Bekçi döngüsü `for (const { migration, maskedSql } ...)` → `for (const {
migration, sql } ...)`, `tokenCount`/`nameCount` artık maskelenmemiş metinden
hesaplanıyor.

```
Tests  1 failed | 108 passed (109)
FAIL ... dize literali içindeki sahte "CREATE TABLE" metni artık yanlış
pozitif UNPARSABLE_CREATE_TABLE üretmez
```

**Tam olarak** `VALUES ('CREATE TABLE x')` vakası kırmızı, tek vaka. Mekanizma
**doğru pinleniyor**.

### 1.4 Gövde çapası eski `[^;]*?`'ye döndürüldü

`extractCreatedTableBodies` deseni `((?:(?!CREATE\s+TABLE)[\s\S])*?)` (negatif
ileri-bakış) → `([^;]*?)` (eski, noktalı virgül yasağı).

```
Tests  2 failed | 107 passed (109)
FAIL ... DEFAULT değerindeki noktalı virgül (DEFAULT 'a;b') artık UNPARSABLE_CREATE_TABLE üretmez
FAIL ... CHECK kısıtındaki noktalı virgül (CHECK ("id" <> ';')) artık UNPARSABLE_CREATE_TABLE üretmez
```

Görev talimatındaki tabloda yalnızca `DEFAULT 'a;b'` vakası örnek verilmişti;
gerçekte **aynı describe bloğundaki iki kardeş vaka** (DEFAULT + CHECK)
kırmızı oldu — ikisi de **aynı** noktalı-virgül-gövde-içi mekanizmasını farklı
SQL yapılarıyla sınıyor, başka bir describe/mekanizma etkilenmedi. Bu bir
dolanma (entanglement) değil: C2 düzeltmesinin tam kapsamı ("gövde noktalı
virgül içerebilir") iki senaryoyla kanıtlanmış ve mutasyon ikisini de doğru
şekilde kırıyor. Mekanizma **doğru pinleniyor** (beklenenden 1 fazla ama
aynı mekanizmanın iki kanıtı — bulgu değil, not).

### 1.5 `rootSymlinks` hedef kontrolü kaldırıldı

`migration-set-fixture.ts`'teki hedef-doğrulama bloğu (`targetContent?.migrationSql
=== undefined` → `throw`) kaldırıldı; `symlinkSync` doğrudan çağrıldı.

```
Tests  2 failed | 107 passed (109)
FAIL ... yanlış yazılmış (var olmayan) rootSymlinks hedefi fixture'ı fırlatır
FAIL ... hedefi migration.sql taşımayan (yalnızca lock içeren) bir dizine işaret eden rootSymlinks de fırlatır
```

**Tam olarak** görev talimatındaki "yanlış-hedef vakası" — iki varyantı da
(sarkan ad + lock-only hedef) kapsıyor, başka hiçbir vaka etkilenmedi.
Mekanizma **doğru pinleniyor**.

**Özet — 5/5 mutasyon beklenen (ve yalnızca beklenen) vakaları kırdı.** Hiçbir
yeni mekanizma "sahte-yeşil" sınıfına girmedi; bu Task'ta önceki turlarda dört
kez çıkan "mekanizmayı pinlemeyen vaka" deseni bu turda **hiç** tekrarlanmadı.

---

## 2. Regresyon

- `pnpm --filter @arkesoft/db test` (mutasyonlar öncesi, ×3 + restore sonrası
  ×2) → **109 passed (109)** her seferinde, **0 failed, 0 skipped**.
  Süreler: 1.41s / 1.35s / 1.43s (mutasyon öncesi), 1.37s / 1.37s (restore
  sonrası) — **flaky değil**, sonuç sabit.
- Symlink vakası (`✓ ... isDirectory() dalının gerçek pin'i`) `--reporter=verbose`
  çıktısında **`✓` (geçti)** olarak görüldü — bu makine macOS,
  `it.skipIf(process.platform === 'win32')` skip üretmedi. (`it.skip\b`/`it.only\b`
  grep'i `skipIf`'e bilerek eşleşmiyor — kelime sınırı "p" ile "I" arasında yok;
  AGENT_BASELINE'ın kabul ettiği istisna.)
- **Süre (tur3 → tur4):** tur3, 93 test → 1.25–1.30s. Tur4, 109 test →
  1.35–1.43s. Artış ≈ 0.08–0.18s, 16 yeni vaka için — eşiğin (~5s) **çok
  altında**, `medium` bulgu yok.
- `pnpm test` (kök) → `@arkesoft/errors` 35/35 · `@arkesoft/db` 109/109 ·
  `@arkesoft/api` 112/112 — **toplam 256/256**, 0 başarısız, 7/7 turbo task.
- `pnpm lint` (kök) → **EXIT 0**, 15/15 FULL TURBO.
- `pnpm typecheck` (kök) → **EXIT 0**, 15/15 FULL TURBO.
- `pnpm build` (kök) → **EXIT 0**, 12/12 FULL TURBO.
- `pnpm format:check` (kök) → **EXIT 1** — `.claude/workflow/reviews/T-004-security-tur4.md`
  Prettier formatına uymuyor. Bu dosya `security` gate ajanının **kendi**
  üretimi, `packages/db` veya bu QA turunun kapsamı dışında; AGENT_BASELINE §5
  gereği başka ajanın dosyasını `prettier --write` ile değiştirmedim.
  **BULGU (low)** — aşağıda kayıtlı, sorumlu `security`.
- **AC10:** `git status --porcelain packages/db/prisma` → boş.
  `git diff --stat -- packages/db/src/index.ts packages/db/src/tenancy.ts` → boş.
- **AC11:** `find packages/db/dist -type f | wc -l` → **64**, değişmemiş.
- **R-P1:**
  - `grep "\.each("` (migration-sql.test.ts + iki helper) → eşleşme yok.
  - `grep "\.skip\b\|\.only\b"` (aynı üç dosya) → eşleşme yok (`skipIf` kelime
    sınırı nedeniyle eşleşmiyor, yukarıda ayrıca `--reporter=verbose` ile
    gerçekten koştuğu doğrulandı).
  - `pnpm --filter @arkesoft/db exec vitest list` → **EXIT 0**, toplama fazı
    hatasız.
  - `$TMPDIR` altında `arkesoft-migration-set-*` taraması: tam test koşumu
    **öncesi** ve **sonrası** → **boş** (sızıntı yok).

---

## 3. Ara noktalar

### 3.1 Gerçek repo migration'ı — dokuz kuralın hepsinde 0 ihlal mi

Geçici bir vitest testi (`packages/db/src/__tests__/qa-tmp-realcheck.test.ts`)
yazıldı, `pnpm --filter @arkesoft/db exec vitest run qa-tmp-realcheck
--reporter=verbose` ile koşturuldu, sonra **silindi** (git'e hiç girmedi,
`git status --porcelain` silme sonrası temiz):

```
migration dirs: [ '20261026082729_init' ]
TOTAL VIOLATIONS: 0
[]
20261026082729_init single-quote count: 26 EVEN
```

**Dokuz kuralın TAMAMI** sıfır ihlal veriyor. `UNPARSABLE_SQL` özel olarak
doğrulandı: gerçek migration'da **26** tek tırnak karakteri (çift sayı) —
fail-closed yol (tek sayı şartı) **tetiklenmiyor**, beklenen davranış.

### 3.2 Kural fixture'ı gevşetildi mi

`migration-set.ts` / `migration-set-fixture.ts` hâlâ bu dalda **untracked**
(`??`) — tur 3'teki gibi `git show HEAD:...` karşılaştırması bu iki dosya için
uygulanabilir değil (ilk kez bu Task'ta ekleniyor). `migration-sql.test.ts`
(tracked, `M`) üzerinde `git diff HEAD` kümülatif bir yeniden-yazım diff'i
döndürüyor (T2-1'in orijinal tam değişimi) — bu nedenle "sadece bu tur"
gevşemesini git-diff ile ayıklamak mümkün değil. Bunun yerine:

- §1'deki **beş mutasyon testi** doğrudan kanıt: hiçbiri testi geçirmek için
  gevşetilmiş/no-op durumda değil — beşi de mutasyonla **tam beklenen**
  vakalarda kırmızıya döndü.
- Dosyanın tamamı (1162 satır) okundu: hiçbir `expect` eşiği gevşetilmiş,
  `.skip`/`.only` eklenmiş veya assertion kaldırılmış değil — yeni vakaların
  tümü `toBe(true)`/`toBe(false)`/`toHaveLength(0)`/`toThrow(/regex/)` ile
  **sıkı** doğrulanıyor.

**Gevşeme bulgusu yok.**

### 3.3 `rootFiles` ve `rootSymlinks` ikisi de kullanılıyor mu

`grep -n "rootFiles\|rootSymlinks" migration-sql.test.ts`: `rootFiles` satır
603/615 ("kök seviyesindeki migration_lock.toml" vakası); `rootSymlinks` satır
643/656 (`isDirectory()` pin testi) **ve** satır 1138/1159, 1151/1159 (yeni
hedef-doğrulama testleri, tur4 kapsamı). **Dördü de gerçek bir `it()` içinde**
çağrılıyor. Ölü parametre yok.

---

## 4. BULGULAR

- [SEV: low] `.claude/workflow/reviews/T-004-security-tur4.md` — `pnpm
format:check` bu dosya nedeniyle `EXIT 1` veriyor. Dosya bu QA turunun
  teslimatı değil, `security` gate ajanının kendi rapor dosyası; Prettier'a
  uymuyor. AGENT_BASELINE §5 ("başka ajanın dosyasını değiştirme") nedeniyle
  QA bunu düzeltmedi. — Önerilen düzeltme: `security` ajanı kendi rapor
  dosyasını Prettier formatına uygun yazsın (veya `.claude/workflow/reviews/`
  Prettier kapsamı dışına alınsın, bu bir `architect`/`devops` kararı). —
  **sorumlu ajan: security** (rapor biçimlendirmesi); kapsam genişletme kararı
  gerekiyorsa `devops`.

---

## ÖLÇÜMLER

**KABUL KRİTERİ EŞLEMESİ (bu tur, FIX 3 sonrası yeniden doğrulandı):**

| AC / Mekanizma                            | Test                                                               | Sonuç                       |
| ----------------------------------------- | ------------------------------------------------------------------ | --------------------------- |
| AC1–AC9                                   | tur 1–3'te eşlendi, bu tur değişmedi                               | 109/109 geçti               |
| AC10                                      | `prisma`/`index.ts`/`tenancy.ts` dokunulmamış                      | GEÇTİ                       |
| AC11                                      | `dist/` 64 dosya, değişmemiş                                       | GEÇTİ                       |
| Fail-closed maskeleme (tek sayıda tırnak) | C1/C2/C3/C5 + 2 regresyon vakası                                   | GEÇTİ — mutasyonla pinlendi |
| `UNPARSABLE_SQL` kuralı                   | C1/C2/C3/C5 + gerçek repo (0 ihlal) + 2 regresyon                  | GEÇTİ — mutasyonla pinlendi |
| Ayna bekçisi `maskedSql` girdisi          | "sahte CREATE TABLE" string literal vakası + UNLOGGED TABLE vakası | GEÇTİ — mutasyonla pinlendi |
| Gövde çapası negatif ileri-bakış          | DEFAULT 'a;b' + CHECK ';' vakaları                                 | GEÇTİ — mutasyonla pinlendi |
| `rootSymlinks` hedef doğrulaması          | 2 yanlış-hedef vakası                                              | GEÇTİ — mutasyonla pinlendi |

Karşılıksız kriter yok.

**TEST SAYILARI:**

- `packages/db`: **109 / 109 geçti**, **0 başarısız**, **0 skipped** (tur3'e
  göre +16 yeni test: FIX 3'ün eklediği C1/C2/C3/C5 + 2 regresyon + ayna
  bekçisi string-literal + regresyon + DEFAULT/CHECK ';' + UNLOGGED TABLE +
  2 rootSymlinks hedef testi + gerçek-repo UNPARSABLE_SQL testi).
- Kök `pnpm test`: `@arkesoft/errors` 35/35 · `@arkesoft/db` 109/109 ·
  `@arkesoft/api` 112/112 — **toplam 256/256**, 0 başarısız.
- Mutasyon 1 (fail-closed koşulu devre dışı): **4 failed / 105 passed (109)**
  — C1, C2, C3, C5 (tam olarak).
- Mutasyon 2 (`UNPARSABLE_SQL` üretimi kaldırıldı): **4 failed / 105 passed
  (109)** — aynı C1, C2, C3, C5 (tam olarak).
- Mutasyon 3 (ayna bekçisi `maskedSql` → `sql`): **1 failed / 108 passed
  (109)** — "sahte CREATE TABLE" string literal vakası (tam olarak).
- Mutasyon 4 (gövde çapası eski `[^;]*?`'ye döndü): **2 failed / 107 passed
  (109)** — DEFAULT 'a;b' + CHECK ';' (aynı mekanizmanın iki kanıtı, bkz. §1.4).
- Mutasyon 5 (`rootSymlinks` hedef kontrolü kaldırıldı): **2 failed / 107
  passed (109)** — iki yanlış-hedef varyantı (tam olarak).

**SÜRE (tur3 → tur4):**

- Tur 3: 93 test, 3 koşum → 1.25s / 1.29s / 1.30s.
- Tur 4: 109 test, 5 koşum (mutasyon dışı) → 1.41s / 1.35s / 1.43s / 1.37s / 1.37s.
- Artış ≈ 0.08–0.18s (16 yeni test için) — eşiğin (~5s) çok altında, `medium`
  bulgu yok.

**KOŞTURULAN KOMUTLAR:**

| Komut                                                                                         | Exit kodu       | Özet                                                                                  |
| --------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------- |
| `git status --porcelain` (başlangıç)                                                          | 0               | 12 yol, beklenen                                                                      |
| `cp` yedek + `diff` (migration-set.ts, migration-set-fixture.ts)                              | 0               | ikisi de yedekle farksız                                                              |
| `pnpm --filter @arkesoft/db test` (mutasyon öncesi, ×3)                                       | 0               | 109 passed her seferinde, 1.35–1.43s                                                  |
| Mutasyon 1 (fail-closed devre dışı) + test + restore                                          | 0/≠0/0          | 4 failed (C1/C2/C3/C5) / 105 passed → RESTORE_IDENTICAL                               |
| Mutasyon 2 (`UNPARSABLE_SQL` kaldırıldı) + test + restore                                     | 0/≠0/0          | 4 failed (aynı 4) / 105 passed → RESTORE_IDENTICAL                                    |
| Mutasyon 3 (ayna bekçisi `sql`) + test + restore                                              | 0/≠0/0          | 1 failed / 108 passed → RESTORE_IDENTICAL                                             |
| Mutasyon 4 (gövde çapası eski) + test + restore                                               | 0/≠0/0          | 2 failed / 107 passed → RESTORE_IDENTICAL                                             |
| Mutasyon 5 (`rootSymlinks` kontrolü kaldırıldı) + test + restore                              | 0/≠0/0          | 2 failed / 107 passed → RESTORE_IDENTICAL                                             |
| `pnpm --filter @arkesoft/db test` (restore sonrası, ×2)                                       | 0               | 109 passed, 1.37s / 1.37s                                                             |
| `pnpm --filter @arkesoft/db exec vitest run --reporter=verbose` (symlink kontrolü)            | 0               | symlink vakası `✓`, skip değil                                                        |
| `pnpm test` (kök)                                                                             | 0               | errors 35 · db 109 · api 112, toplam 256 passed                                       |
| `pnpm lint` (kök)                                                                             | 0               | 15/15 FULL TURBO                                                                      |
| `pnpm typecheck` (kök)                                                                        | 0               | 15/15 FULL TURBO                                                                      |
| `pnpm build` (kök)                                                                            | 0               | 12/12 FULL TURBO, `dist/` 64 dosya değişmedi                                          |
| `pnpm format:check` (kök)                                                                     | 1               | `T-004-security-tur4.md` (başka ajanın dosyası) — low bulgu                           |
| `git status --porcelain packages/db/prisma`                                                   | 0               | boş                                                                                   |
| `git diff --stat -- src/index.ts tenancy.ts`                                                  | 0               | boş                                                                                   |
| `pnpm --filter @arkesoft/db exec vitest list`                                                 | 0               | toplama fazı hatasız                                                                  |
| `grep ".each("` / `grep ".skip\|.only"` (3 dosya)                                             | 1 (eşleşme yok) | temiz                                                                                 |
| Geçici vitest testi — gerçek repo migration bağımsız doğrulama (yazıldı, koşturuldu, silindi) | 0               | TOTAL VIOLATIONS: 0 (9 kuralın tamamı), UNPARSABLE_SQL tetiklenmedi (26 tırnak, çift) |
| `pnpm test:isolation` / `pnpm test:e2e`                                                       | —               | bu sürümde henüz yok                                                                  |

**BULGU DAĞILIMI:** critical 0 · high 0 · medium 0 · low 1 → **PASS**

**KAPANIŞ DURUMU:** FIX 3'ün beş yeni mekanizması (fail-closed maskeleme,
`UNPARSABLE_SQL` kuralı, ayna bekçisinin maskelenmiş girdisi, gövde çapasının
negatif ileri-bakışı, `rootSymlinks` hedef doğrulaması) **tamamı** mutasyon
testiyle bağımsız olarak doğrulandı — her biri **tam olarak** beklenen vaka
kümesini kırdı, sahte-yeşil veya aşırı-geniş/dar kapsam gözlenmedi. Tek bulgu
(`low`, format:check) bu Task'ın kapsamı dışında, paralel bir ajanın kendi
rapor dosyasından kaynaklanıyor.
