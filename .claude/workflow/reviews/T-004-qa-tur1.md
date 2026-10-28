T-004 — QA Gate, Tur 1
Tarih: 2026-10-28
Sürüm: v0.0.13 önkoşulu (T2-1 kapanışı)
Dal: `main`

GATE: qa
SONUÇ: PASS

---

## 0. Başlangıç durumu

`git status --porcelain` (repo kökü, QA oturumu başlangıcı):

```
 M packages/db/src/__tests__/migration-sql.test.ts
?? .claude/workflow/tasks/T-004.md
?? packages/db/src/__tests__/helpers/migration-set-fixture.ts
?? packages/db/src/__tests__/helpers/migration-set.ts
```

S1 Tamamlanma Tanımı (d)'nin beklediği **3 yol** (`migration-sql.test.ts`,
`helpers/migration-set.ts`, `helpers/migration-set-fixture.ts`) ile eşleşiyor.
`.claude/workflow/tasks/T-004.md` Orkestratör'ün kendi Task kaydı, `db` sahipliği
dışında — ölçümlere dahil edilmedi.

**Oturum sonu durumu** (bu rapor dosyası hariç, aşağıda doğrulandı) **birebir aynı** —
bkz. §1 AC3 ve §6.

---

## 1. AC3 — Ters prob (qa'nın tek sahip olduğu iş)

### Mekanik, sırayla uygulandı

1. Başlangıç `git status --porcelain` → yukarıda, temiz kayıt alındı.
2. `packages/db/src/__tests__/helpers/migration-set.ts` içindeki `readMigrationSet`
   fonksiyonuna, `readdirSync` sonrası, **tek satır** eklendi:
   ```ts
   entries = entries.filter((entry) => entry.name.endsWith('_init'))
   ```
   Bu, eski `readInitMigrationSql()`'in davranışını birebir taklit eder: yalnızca
   `_init` ile biten dizin okunur, kümenin kalanı yok sayılır.
3. `pnpm --filter @arkesoft/db test` koşturuldu.
4. **Gerçek terminal çıktısı (birebir):**

```
 ❯ src/__tests__/migration-sql.test.ts (15 tests | 8 failed) 53ms
   ❯ migration-set — prob süiti (K-C9 birincil fixture) (5)
     × AC1: migration.sql içeren her dizin okunur, yalnızca lock taşıyan dizin dışlanır 10ms
     × AC2 — ASIL PROB: taksonomide olmayan tenant_id'li tablo hata fırlatır 11ms
     × AC8: hata mesajı suçlu migration dizininin adını taşır 8ms
     × AC4 — tautoloji değil: aynı fixture, taksonomiye "invoice" eklenince hata çıkmaz 4ms
   ❯ migration-set — prob süiti (AC5: "_init" sonekine bağımlılık yok) (1)
     × AC5: hiçbir dizin adı "_init" ile bitmese de doğrulama tüm dizinleri okur 1ms
   ❯ migration-set — prob süiti (AC7: üç ayrı iki-yönlülük vakası) (3)
     × AC7a: taksonomide olup hiçbir migration'da yaratılmamış tablo hata üretir 2ms
     × AC7b: "tenant_id" taşıyıp PLATFORM_LEVEL_TABLES'ta olan tablo hata üretir 1ms
     × AC7c: "DROP " veya "SET NOT NULL" içeren migration hata üretir 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 8 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  …AC1…
AssertionError: expected [ '19700101000000_fixture_init' ] to deeply equal [ '19700101000000_fixture_init', …(2) ]
- Expected
+ Received
  [
    "19700101000000_fixture_init",
-   "19700101000001_fixture_second",
-   "19700101000002_fixture_third",
  ]

 FAIL  …AC2 — ASIL PROB…
AssertionError: expected [Function] to throw an error

 FAIL  …AC8…
AssertionError: expected [Function] to throw an error
- Expected: null
+ Received: undefined

 FAIL  …AC4…
AssertionError: expected [Function] to not throw an error but 'Error: migration kümesi doğrulaması b…' was thrown
+ Received: "Error: migration kümesi doğrulaması başarısız (1 ihlal):
- [MISSING_TENANT_SCOPED_TABLE] TENANT_SCOPED_TABLES'taki \"invoice\" tablosu migration kümesinin HİÇBİRİNDE yaratılmamış."

 FAIL  …AC5…
AssertionError: expected [Function] to throw error matching /20991231236000_zzz_extra/ but got 'migration kümesi doğrulaması başarısı…'
+ Received: "migration kümesi doğrulaması başarısız (1 ihlal):
- [EMPTY_MIGRATION_SET] migration kümesi boş: en az bir \"migration.sql\" içeren dizin bekleniyor (sahte-yeşil kapısı, AC6)."

 FAIL  …AC7a… AssertionError: expected false to be true
 FAIL  …AC7b… AssertionError: expected false to be true
 FAIL  …AC7c… AssertionError: expected false to be true

 Test Files  1 failed | 4 passed (5)
      Tests  8 failed | 68 passed (76)
   Start at  09:36:49
   Duration  1.58s
```

**Sonuç yorumu — K-C9 gerekçesi doğrulandı:** `readMigrationSet` dizin bulamadığı
için **değil**, `_init` dizinini **bulduğu ve okuduğu ama kalan iki dizini (ihlal
içeren `_fixture_third` dahil) görmediği için** AC2 kırmızıya döndü (hata mesajı
"dizin bulunamadı" değil, assertion'ın kendisi — fonksiyon hiç fırlamadı).
Bu, Task'ın "eski kod _init'i bulur, okur, ihlali göremez — gerçek sahte-yeşil"
iddiasının **gerçek terminal kanıtıyla doğrulanmış hâli**. AC6 (boş küme) ve gerçek
repo süitinin 6 vakası bu probtan **etkilenmedi** (68 geçti) — probun etkisi tam
olarak hedeflenen "çok dizinli kümeyi okuma" yüzeyiyle sınırlı, yan etki yok.

5. `git checkout -- packages/db/src/__tests__/` ile geri alma denendi.
6. **(RİSK — bkz. §7, bulgu F1)** Bu komut, `migration-sql.test.ts` **tracked** ve
   `M` durumundaydı; dizin kapsamlı `checkout` onu da HEAD'teki **eski (T2-1 öncesi)**
   içeriğe döndürdü — `migration-set.ts`/`migration-set-fixture.ts` untracked oldukları
   için etkilenmedi. Bu, QA'nın kendi AC3 adımı sırasında db'nin **henüz commit
   edilmemiş teslimatını diskte sildiği** bir an oldu.
7. **Kurtarma:** AC9 süre ölçümü için önceden alınmış yedek (`migration-sql.test.ts`'in
   T2-1-sonrası hâlinin `cp` kopyası) kullanılarak dosya birebir geri yazıldı;
   `migration-set.ts`'teki tek satırlık prob değişikliği elle (orijinal okunmuş içerik)
   geri yazıldı. Doğrulama:
   - `diff <yedek> migration-sql.test.ts` → **fark yok**.
   - `grep "QA GATE T-004" migration-set.ts` → **0 eşleşme** (prob kalıntısı yok).
8. `git status --porcelain` → başlangıçla **birebir aynı** (bkz. §6).
9. Süit yeniden koşturuldu → **76 passed (76)**, 0 failed/0 skipped (bkz. §6).

**AC3 SONUCU: kanıtlanmış — kırmızı dönüş gerçek ve doğru sebepten, geri alma
(düzeltici kurtarma dahil) tam ve doğrulanmış.**

---

## 2. AC9 + süre ölçümü

### Test sayısı (gerçek çıktı)

| Durum                                                           | Dosya   | Test   | Sonuç                          |
| --------------------------------------------------------------- | ------- | ------ | ------------------------------ |
| Önce (HEAD, T2-1 öncesi `migration-sql.test.ts`, eski davranış) | 5 dosya | **65** | 65 passed, 0 failed            |
| Sonra (T-004 S1 teslimatı)                                      | 5 dosya | **76** | 76 passed, 0 failed, 0 skipped |

`db`'nin raporladığı **76** doğrulandı (PM'in V2'si "65" demişti — bağlayıcı olan
gerçek çıktı, PO'nun kendi grep sayımı **59** idi; `it.each` yok, grep sayımı test
isimlerini değil literal `it(`/`test(` satırlarını saymıştı; gerçek `vitest`
koşumu 76 — hem PM hem PO'nun tahmininden farklı, **gerçek ölçüm esas**).
Net kazanç: **+11** (65→76), AC9'un "65'in altına düşmez" eşiği **geçildi**.

### Süre (önce/sonra, `fileParallelism:false` altında)

| Koşum                                                                       | Test sayısı | Duration (vitest) |
| --------------------------------------------------------------------------- | ----------- | ----------------- |
| Önce (HEAD migration-sql.test.ts, yedek/geri-alınmış hâl üzerinden ölçüldü) | 65          | **1.39s**         |
| Sonra (T-004 teslimatı)                                                     | 76          | **1.41s**         |
| Sonra (restore sonrası doğrulama koşumu)                                    | 76          | **1.32s**         |

**Fark: ~0.02s – 0.09s aralığında, `~5 sn` eşiğinin çok altında.** `medium` bulgu
**yok**. 15 yeni vaka × `mkdtemp`/`rmSync` pratikte ölçülebilir bir yavaşlama
üretmiyor (gerçek Postgres'e bağlanan diğer dosyalar zaten dominant maliyet).

### Komut çıktıları

- `pnpm lint` (kök, turbo) → **EXIT 0**, 15/15 görev `FULL TURBO` (cache). Taze
  doğrulama: `pnpm --filter @arkesoft/db exec eslint .` → **EXIT 0**, çıktı yok (temiz).
- `pnpm typecheck` (kök) → **EXIT 0**, 15/15 görev başarılı.
- `pnpm build` (kök) → **EXIT 0**, 12/12 görev başarılı.
- `pnpm --filter @arkesoft/db test` (son doğrulama koşumu) → **76 passed (76)**,
  0 failed, 0 skipped, Duration 1.32s.

---

## 3. Kabul kriteri eşlemesi

| AC   | Doğrulama yöntemi                                                                                                                                                                          | Sonuç                                                                                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | `AC1: migration.sql içeren her dizin okunur…` — 3 dizinli fixture'da `directoryName` dizisi tam 3 eleman döndürüyor, lock-only dizin dışlanıyor                                            | GEÇTİ                                                                                                                                                                                                          |
| AC2  | `AC2 — ASIL PROB…` `toThrow()`                                                                                                                                                             | GEÇTİ (ve AC3 ters probuyla kırmızıya döndüğü doğrulandı)                                                                                                                                                      |
| AC3  | Ters prob — §1                                                                                                                                                                             | GEÇTİ (kanıt yukarıda)                                                                                                                                                                                         |
| AC4  | `AC4 — tautoloji değil…` `not.toThrow()`, aynı fixture + genişletilmiş taksonomi                                                                                                           | GEÇTİ — tautoloji değil (AC3 kırmızı koşumunda da AC2 ile **farklı** sebepten kırıldı: "throw bekleniyordu ama atmadı" değil, "atmaması bekleniyordu ama attı" — iki yönün de bağımsız çalıştığını kanıtlıyor) |
| AC5  | Davranışsal: `20991231235959_zzz_base` / `20991231236000_zzz_extra` — **hiçbiri** `_init` ile bitmiyor, doğrulama ikisini de okuyup ihlali `_zzz_extra`'da buluyor. Grep KULLANILMADI      | GEÇTİ                                                                                                                                                                                                          |
| AC6  | Boş `Map()` → `readMigrationSet` 0 döndürüyor → `validateMigrationSet` `toThrow()`. Mekanik olarak `EMPTY_MIGRATION_SET` kuralı erken dönüyor, "boş döngü=yeşil" durumu yapısal olarak yok | GEÇTİ                                                                                                                                                                                                          |
| AC7a | Taksonomide olup hiç yaratılmamış tablo → `MISSING_TENANT_SCOPED_TABLE`                                                                                                                    | GEÇTİ (ayrı vaka)                                                                                                                                                                                              |
| AC7b | `tenant_id` + `PLATFORM_LEVEL_TABLES` → `TENANT_ID_ON_PLATFORM_TABLE`                                                                                                                      | GEÇTİ (ayrı vaka)                                                                                                                                                                                              |
| AC7c | `DROP COLUMN` → `DESTRUCTIVE_STATEMENT`                                                                                                                                                    | GEÇTİ (ayrı vaka)                                                                                                                                                                                              |
| AC8  | `toThrow(/19700101000002_fixture_third/)`                                                                                                                                                  | GEÇTİ                                                                                                                                                                                                          |
| AC9  | 76 ≥ 65, 0 failed/0 skipped, lint+typecheck+build yeşil (§2)                                                                                                                               | GEÇTİ                                                                                                                                                                                                          |
| AC10 | `git status --porcelain packages/db/prisma` boş; `index.ts`/`tenancy.ts` diff boş (§6)                                                                                                     | GEÇTİ                                                                                                                                                                                                          |
| AC11 | `dist/` dosya listesi build öncesi/sonrası **birebir aynı** (64 dosya, fark yok); `tsconfig.build.json` `src/__tests__`'i `exclude` ediyor                                                 | GEÇTİ                                                                                                                                                                                                          |

**Karşılıksız kriter yok.**

---

## 4. Ek risk kontrolleri (PO/architect)

| Kontrol                                                                                   | Yöntem                                                                                                                                                                                                                                                                                                                                                                                                   | Sonuç                          |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| R-P1 — `it.each` yasağı                                                                   | `grep "it.each\|test.each"` → yalnızca yasak açıklayan yorum satırı eşleşti, gerçek kullanım yok                                                                                                                                                                                                                                                                                                         | TEMİZ                          |
| R-P1 — fixture yalnızca `it()` içinde kurulur                                             | `pnpm exec vitest list` → **EXIT 0**, 76 test ismi listelendi (toplama fazı hatasız); `$TMPDIR` öncesi/sonrası `arkesoft-migration-set-*` taraması → **artık yok** (her iki ölçümde de)                                                                                                                                                                                                                  | TEMİZ                          |
| R5 — yeni dosyalar `test-client.ts`/`env.ts`/`client.ts`/`guard-policy.ts` import etmiyor | `grep "^import"` üç dosyada → yalnızca `node:fs/os/path/url`, `vitest`, `../index.js` (taksonomi)                                                                                                                                                                                                                                                                                                        | TEMİZ                          |
| R-P6 — `mkdtemp` öneki `arkesoft-migration-set-`                                          | Kod okuması: `mkdtempSync(join(tmpdir(), 'arkesoft-migration-set-'))`                                                                                                                                                                                                                                                                                                                                    | TEMİZ, birebir eşleşiyor       |
| K-C4 — `migration-set.ts` `vitest`/`expect` import etmiyor                                | `grep "^import"` → yalnızca `node:fs`                                                                                                                                                                                                                                                                                                                                                                    | TEMİZ                          |
| R-C6 — kopya mantık (ikinci `CREATE TABLE` regex'i / ikinci taksonomi karşılaştırması)    | Kod okuması: `migration-set-fixture.ts` SQL yalnızca **yazıyor**, hiç regex/ayrıştırma yok; `migration-set.ts`'te TEK `extractCreatedTables` deseni                                                                                                                                                                                                                                                      | TEMİZ                          |
| R-C5 — sızıntı/`afterEach`                                                                | Kod okuması: `try { run(rootUrl) } finally { rmSync(root, …) }`, `afterEach` kullanılmamış                                                                                                                                                                                                                                                                                                               | TEMİZ (tasarım kararına uygun) |
| Güvenlik — `rmSync` hedefi                                                                | Kod okuması: `root` **yalnızca** `mkdtempSync` dönüşü; `rootUrl` ayrı değişken, `rmSync`'e asla verilmiyor                                                                                                                                                                                                                                                                                               | TEMİZ                          |
| `skip`/`only`                                                                             | `grep ".skip\|.only"` → eşleşme yok                                                                                                                                                                                                                                                                                                                                                                      | TEMİZ                          |
| Kural gevşetmesi (eski dosyayla karşılaştırma)                                            | `git show HEAD:…` ile eski dosya karşılaştırıldı — yıkıcı tarama artık yorum-temizlenmiş metin üzerinde (daha **az** yanlış pozitif, aynı tespit gücü), taksonomi kontrolleri artık **kümülatif** (daha **geniş** kapsam, _init'e özel değil), ters `PLATFORM_LEVEL_TABLES` kontrolü ve `tenant_id` öncü UNIQUE INDEX kontrolü mantık olarak **aynı koşulu** test ediyor, sadece girdi kapsamı genişledi | **GEVŞEME YOK**                |

---

## 5. Regresyon

`packages/db` süitinin diğer 4 dosyası (`health.test.ts`, `membership.test.ts`,
`tenant.test.ts`, `guard-policy.test.ts`) her koşumda **değişmeden geçti** (65→76
artışının tamamı `migration-sql.test.ts`'ten: 4→15, net +11). Kritik akış /
Playwright kapsamı bu Task'ta **N/A** — FRONTEND VAR MI: hayır (Task dosyası V-C5/PM
notu), `ux`/`ui`/`wcag`/`perf` koşmuyor; `test:e2e` bu sürümde henüz devrede değil
(ROADMAP/AGENT_BASELINE §6: `test:e2e` v0.0.19'dan itibaren). `test:isolation` da
henüz yok (v0.0.13'ten itibaren) — **bu sürümde henüz yok**, koşulmadı.

---

## 6. Son durum doğrulaması

```
$ git status --porcelain
 M packages/db/src/__tests__/migration-sql.test.ts
?? .claude/workflow/reviews/T-004-qa-tur1.md
?? .claude/workflow/tasks/T-004.md
?? packages/db/src/__tests__/helpers/migration-set-fixture.ts
?? packages/db/src/__tests__/helpers/migration-set.ts
```

Oturum başlangıcındaki durumla **birebir aynı** (bu rapor dosyası hariç — QA'nın
kendi çıktısı, beklenen). `git status --porcelain packages/db/prisma` → **boş**.
`git diff --stat -- packages/db/src/index.ts packages/db/src/tenancy.ts` → **boş**.
`dist/` dosya listesi (build öncesi 64 dosya / sonrası 64 dosya) → **fark yok**.

Son doğrulama koşumu: `pnpm --filter @arkesoft/db test` → **76 passed (76)**,
0 failed, 0 skipped, Duration 1.32s.

---

## 7. BULGULAR

- [SEV: low] `.claude/workflow/tasks/T-004.md` (Bağlayıcı mekanik bölümü) /
  bu gate talimatının §1 adım 5'i — "`git checkout -- packages/db/src/__tests__/`
  ile geri al" komutu, o dizinde **hem tracked+modified** (`migration-sql.test.ts`,
  `M` durumunda) **hem de untracked yeni dosyalar** (`migration-set.ts`,
  `migration-set-fixture.ts`) bir arada olduğunda **tehlikeli**: komut, AC3 probu
  için elle değiştirilen untracked dosyayı etkilemez (çünkü git onu takip etmiyor)
  ama tracked dosyayı **HEAD'teki (T2-1 öncesi) eski içeriğe** sıfırlar — yani
  db'nin henüz commit edilmemiş teslimatını diskte siler. Bu oturumda **gerçekleşti**
  ve AC9 süre ölçümü için önceden alınmış bağımsız bir yedek sayesinde fark edildi ve
  birebir kurtarıldı (§1 madde 6-7); kurtarma doğrulandı (`diff` farksız, `git status`
  başlangıçla birebir aynı, süit 76/76 yeşil). **Üretim koduna/db'nin teslimatına
  kalıcı hasar yok** — ama talimat metni gelecekteki bir QA turunda (veya bu komutu
  birebir uygulayan bir ajanın yedeksiz koşmasında) sessizce veri kaybına yol açabilir.
  Önerilen düzeltme: mekanik talimatı `git checkout -- packages/db/src/__tests__/helpers/migration-set.ts`
  gibi **yalnızca değiştirilen dosyayı** hedefleyen bir pathspec'e daraltmak, ya da
  önce `git diff -- packages/db/src/__tests__/helpers/migration-set.ts > /tmp/ac3.patch`
  alıp `git apply -R` ile geri almak. Sorumlu ajan: `po` (mekaniğin yazarı) /
  Orkestratör (Task dosyasına yansıtma).

Başka bulgu yok.

---

## ÖLÇÜMLER

**KABUL KRİTERİ EŞLEMESİ:** §3 tablosu — AC1–AC11 hepsi GEÇTİ, karşılıksız kriter yok.

**TEST SAYILARI:**

- Yeni eklenen (migration-sql.test.ts): 65 → 76 (net **+11**, 4 eski vaka 15 yeni vakayla değişti)
- Toplam `packages/db` geçen: **76 / 76**
- Toplam başarısız: **0**
- Skipped: **0**
- AC3 ters prob koşumu (geçici, geri alındı): 8 failed / 68 passed (76) — beklenen ve doğru sebepten

**SÜRE (önce/sonra, `fileParallelism:false`):**

- Önce (65 test, eski `migration-sql.test.ts`): 1.39s
- Sonra (76 test, T-004 teslimatı): 1.41s / doğrulama koşumunda 1.32s
- Artış: ~0.02–0.09s → **eşiğin (~5s) çok altında, `medium` bulgu yok**

**KOŞTURULAN KOMUTLAR:**

| Komut                                                    | Exit kodu | Özet                                                                |
| -------------------------------------------------------- | --------- | ------------------------------------------------------------------- |
| `git status --porcelain` (başlangıç)                     | 0         | 4 yol, beklenen                                                     |
| `pnpm --filter @arkesoft/db test` (sonra, 1. koşum)      | 0         | 76 passed, 1.41s                                                    |
| `pnpm --filter @arkesoft/db test` (önce, yedek dosyayla) | 0         | 65 passed, 1.39s                                                    |
| `pnpm --filter @arkesoft/db test` (AC3 ters prob)        | 1         | 8 failed / 68 passed — beklenen kırmızı                             |
| `git checkout -- packages/db/src/__tests__/`             | 0         | **yan etki**: tracked dosyayı eskiye döndürdü (bkz. bulgu)          |
| (kurtarma) dosya yedekten geri yazıldı                   | —         | `diff` farksız doğrulandı                                           |
| `pnpm --filter @arkesoft/db test` (restore sonrası)      | 0         | 76 passed, 1.32s                                                    |
| `pnpm --filter @arkesoft/db exec eslint .`               | 0         | çıktı yok, temiz                                                    |
| `pnpm --filter @arkesoft/db typecheck`                   | 0         | temiz                                                               |
| `pnpm --filter @arkesoft/db build`                       | 0         | `dist/` 64 dosya, fark yok                                          |
| `pnpm lint` (kök)                                        | 0         | 15/15 FULL TURBO                                                    |
| `pnpm typecheck` (kök)                                   | 0         | 15/15 başarılı                                                      |
| `pnpm build` (kök)                                       | 0         | 12/12 başarılı                                                      |
| `pnpm exec vitest list` (db)                             | 0         | 76 test ismi, toplama fazı hatasız, tmpdir artığı yok               |
| `pnpm test:isolation`                                    | —         | bu sürümde henüz yok (v0.0.13'ten itibaren)                         |
| `pnpm test:e2e`                                          | —         | bu sürümde henüz yok (v0.0.19'dan itibaren); FRONTEND VAR MI: hayır |

**BULGU DAĞILIMI:** critical 0 · high 0 · medium 0 · low 1 → **PASS** (AGENT_BASELINE §4: 1–2 medium/low → PASS, teknik borca kaydedilir).
