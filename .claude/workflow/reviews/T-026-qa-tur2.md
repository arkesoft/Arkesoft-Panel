# T-026 — qa gate (tur 2, ⚠ DAR kapsam)

Tarih: 2026-11-19 · Sürüm: v0.0.22 · Platform: minor (0.10.3→0.11.0) · @arkesoft/trpc: patch (0.8.3)

> ⚠⚠ **DAR TUR.** Tur 1 PASS verdi (bulgu yok) ama yüzey değişti (backend'in FIX 1
> düzeltmeleri: F1/F2/F3/F4 + security'nin içerik kapısı) ⇒ WORKFLOW.md kuralı
> "PASS + yüzey değişti → DAR". Bu tur **sadece** dört kalemi yeniden ölçer:
> (1) AC-36/AC-37 sınıflandırıcı mutasyonu, (2) AC-33/AC-35 determinizm,
> (3) zorunlu kapı (6 komut), (4) üç içerik kapısının mutasyonla sınanması.
> AC-34/AC-38/AC-39/AC-40 **yeniden ölçülmedi** — tur 1'de PASS, yüzeyleri bu
> turda değişmedi (yalnızca hızlı teyit, aşağıda not).

GATE: qa
SONUÇ: PASS

## BULGULAR

- [SEV: low] `docs/api-versioning.md:210-217,228-230,241-243` — §9 madde 1/2/3'ün
  "DURUM" notları F1/F2/F3'ün kapandığını **bağımsız olarak doğrulayamadım** diyor
  (backend'in el yazısı not, tur 1 sırasında yazılmış). ⭐ Bu turda **ben** F1/F2/F3'ü
  mutasyonla bağımsız doğruladım (aşağıdaki ÖLÇÜMLER): kök şema düğümü artık
  kıyaslanıyor, `null`↔nesne fail-open yok, `hasUntrackedConstraintChange` önce
  koşuyor — üçü de rapordaki beklenen davranışı veriyor. Not artık **bayat** —
  gate tur 2 PASS'ı geldiği için `docs` bu üç paragrafı güncelleyip "DURUM: gate
  tur 2 (qa) ile doğrulandı" şeklinde kapatabilir. Davranış hatası değil, yalnızca
  belge/gerçek senkronizasyonu. Sorumlu ajan: `docs`.

Bulgu `low` → düzeltme turu açılmaz, borç tablosuna kaydedilir.

## ÖLÇÜMLER

### KABUL KRİTERİ EŞLEMESİ — bu turun dört kalemi

| # | Kriter | Test/komut | Sonuç |
| --- | --- | --- | --- |
| 1a | AC-36 (MAJOR) — `job-summary.schema.ts:170` `cursor` `.optional()` SİLİNDİ | `pnpm test:contract` (mutasyonlu) + doğrudan `classifyContractChange`/`formatContractChangeReport` çağrısı (derlenmiş `dist/` üzerinden, bkz. KOŞTURULAN KOMUTLAR) | GEÇTİ — exit 1, **2 FAIL/29 PASS**; rapor: `[MAJOR] girdi job.list · "cursor" OPSİYONELDEN ZORUNLUYA (INPUT_FIELD_BECAME_REQUIRED)` / `SONUÇ: MAJOR`. Mutasyon `Write`(kopya)/`python3` ile GERİ ALINDI, `diff` orijinalle BİREBİR, 31/31 yeniden PASS |
| 1b | AC-37 (MINOR) — aynı dosyaya `label: z.string().optional(),` EKLENDİ | aynı mekanizma | GEÇTİ — exit 1, **2 FAIL/29 PASS**; rapor: `[MINOR] girdi job.list · yeni OPSİYONEL alan: "label" (INPUT_OPTIONAL_FIELD_ADDED)` / `SONUÇ: MINOR`. ⚠ **F3 yan etki kontrolü**: `label` eklemesi `compareFieldConstraint`/`hasUntrackedConstraintChange` yoluna HİÇ girmiyor (yeni alan, mevcut alanın kısıt değişimi değil) ⇒ MINOR beklentisi **BOZULMADI**, ölçüldü. Mutasyon GERİ ALINDI, `diff` orijinalle BİREBİR, 31/31 yeniden PASS |
| 1c | `.default()` taşıyan üç `limit` alanı mutasyon hedefi seçilmedi mi | — | DOĞRULANDI — her iki mutasyon da `cursor`/`label` alanlarına uygulandı, `limit` alanlarına HİÇ dokunulmadı (`job-summary.schema.ts`, `platform.schema.ts` el değmemiş) |
| 2 | AC-33/AC-35 — determinizm, md5 tur1 ile AYNI mı | `pnpm test:contract` (temiz ağaç) + `pnpm --filter @arkesoft/trpc run contract:generate` ×2 | GEÇTİ — temiz ağaçta exit 0, 31/31 PASS. İki `contract:generate` koşumunda md5 **`3671b25e253478b90a40cb86902a9064`** — tur 1'deki değerle **BİREBİR AYNI**. `git diff --stat docs/api-contract-surface.json` her ikisinde de BOŞ (dosya oynamadı) |
| 3 | Zorunlu kapı — 6 komut yeniden koştu mu | `pnpm lint && pnpm typecheck && pnpm test && pnpm test:isolation && pnpm build && pnpm guards` | GEÇTİ — **6/6 exit 0** (aşağıda tek tek) |
| 4a | İçerik kapısı (a) — `.describe('test')` eklenince KIRMIZI mı | `jobGetInputSchema.jobId` alanına `.describe('test')` eklendi → `pnpm test:contract` | GEÇTİ (kapı ÇALIŞIYOR) — exit 1, **3 FAIL/28 PASS**; kapı (a) mesajı: `AssertionError: expected [ 'description' ] to deeply equal []`. Mutasyon GERİ ALINDI |
| 4b | İçerik kapısı (b) — string `.default('x')` eklenince KIRMIZI mı | aynı alana `.default('x')` eklendi | GEÇTİ (kapı ÇALIŞIYOR) — exit 1, **3 FAIL/28 PASS**; kapı (b) mesajı: `AssertionError: expected false to be true` (`typeof value === 'number' || 'boolean'` reddetti). Mutasyon GERİ ALINDI, `pnpm --filter @arkesoft/trpc build` + `pnpm test:contract` ile 31/31 yeniden PASS teyit edildi |

⚠ **Kapı (c) (D6 jeton taraması) mutasyonla sınanmadı** — task'ın mutasyon reçetesi
(a) ve (b)'yi açıkça istedi, (c) "veya" bağlacıyla opsiyonel bırakıldı; (a) ve (b)
ikisi de **gerçekten** kırmızı verdiğini kanıtladığı için boş-yeşil riski zaten
kapatıldı (security'nin bulgusunun amacı buydu). (c) **DOĞRULANAMADI** olarak
aşağıya not edildi.

### ⚠ Hızlı teyit — bu turda YENİDEN ölçülmeyen kalemler (tur 1 PASS, yüzey değişmedi)

- **AC-34** — tur 1'de zaten KISMİ KANIT ile PASS (namespace/prosedür ekleme canlı
  router'da mutasyonla tekrarlanmadı, `apps/*` dokunmama riski gerekçesiyle). Bu
  turda sınıflandırıcı değişti ama `madde 9`/"Katman 1 bağlantısı" testlerinin
  KENDİSİ **değişmedi** (yalnızca `classifyContractChange`'in iç mantığı değişti,
  testin ne beklediği aynı) — yukarıdaki kalem 2'nin PASS'ı (`toHaveLength(17)`/
  `toBe(7)` dahil, 31/31 çalıştı) bu kriterin hâlâ tuttuğunu dolaylı doğruluyor.
- **AC-38** — `pnpm guards` çıktısında `test:contract komut zinciri — script +
  sahte yeşil + sözleşme dosyası (T-026/S3) PASS` satırı AYRI satır olarak
  GÖRÜLDÜ (bkz. KOŞTURULAN KOMUTLAR), 23/23 PASS.
- **AC-39** — `docs/api-versioning.md` okundu: §11 "Tehdit modeli —
  `docs/api-contract-surface.json` PUBLIC bir depoda yayımlanıyor" **EKLENMİŞ**
  (satır 297), §9 "Bilinen kör noktalar" **GÜNCELLENMİŞ** (F1/F2/F3'ü anlatan
  "Düzeltme geçmişi" notu + madde 1/2/3'ün gözden geçirilmiş metni, satır 181-248).
  ⚠ Yukarıdaki `low` bulgu bu bölümün DURUM notlarının artık bayat olduğunu
  söylüyor — içerik var/güncellendi kriteri YİNE DE karşılanıyor.
- **AC-40** — `git diff --stat` + `git status --porcelain`'de `apps/**` satırı
  HİÇ YOK (yalnızca kök `package.json`, `packages/trpc/package.json`,
  `packages/trpc/tsconfig.json`, `scripts/guards.sh`, `turbo.json` değişti;
  `docs/*`, `packages/trpc/scripts/`, `packages/trpc/src/__tests__/*`,
  `packages/trpc/src/contract/` yeni/izlenmemiş). Zorunlu kapı 6/6 (kalem 3).

### TEST SAYILARI

- `packages/trpc` `test:contract` (temiz ağaç): **1 dosya / 31 test, 31/31 PASS**
- AC-36 mutasyonlu koşum: **29 PASS / 2 FAIL** (beklenen FAIL)
- AC-37 mutasyonlu koşum: **29 PASS / 2 FAIL** (beklenen FAIL)
- İçerik kapısı (a) mutasyonlu koşum: **28 PASS / 3 FAIL** (beklenen FAIL — (a) + 2 freshness testi)
- İçerik kapısı (b) mutasyonlu koşum: **28 PASS / 3 FAIL** (beklenen FAIL — (b) + 2 freshness testi)
- `pnpm test` (kök): **21/21 görev PASS**, `@arkesoft/trpc` test paketi 195/195 (kapsar), `@arkesoft/api` **878/878 PASS**
- `pnpm test:isolation`: **11/11 görev PASS**, `@arkesoft/api` **31/31 PASS**
- `pnpm guards`: **23/23 PASS** (yeni T-026/S3 adımı dahil, AYRI satır)
- Tüm mutasyonlar sonrası nihai doğrulama: `test:contract` **31/31 PASS**, `git status --porcelain` BAŞLANGIÇLA BİREBİR aynı (tek fark: `security` ajanının paralel yazdığı `T-026-security-tur2.md` — benim değil)

### KOŞTURULAN KOMUTLAR

| Komut | Exit | Özet |
| --- | --- | --- |
| `pnpm test:contract` (temiz ağaç, başlangıç) | 0 | 31/31 PASS, `@arkesoft/trpc:test:contract` → `cache bypass, force executing` |
| `pnpm test:contract` (AC-36 mutasyonlu: `cursor` zorunlu) | 1 | 29 PASS/2 FAIL |
| `node` tek-satır (derlenmiş `dist/` üzerinden `classifyContractChange`+`formatContractChangeReport`, mutasyonlu) | 0 (script başarıyla çalıştı, rapor METNİ doğrulandı) | `[MAJOR] girdi job.list · "cursor" OPSİYONELDEN ZORUNLUYA (INPUT_FIELD_BECAME_REQUIRED)` / `SONUÇ: MAJOR` |
| Mutasyon GERİ ALMA (kopya) | — | `diff` BOŞ, orijinalle birebir |
| `pnpm test:contract` (AC-37 mutasyonlu: `label` eklendi) | 1 | 29 PASS/2 FAIL |
| `node` tek-satır (AC-37, derlenmiş `dist/`) | 0 | `[MINOR] girdi job.list · yeni OPSİYONEL alan: "label" (INPUT_OPTIONAL_FIELD_ADDED)` / `SONUÇ: MINOR` |
| Mutasyon GERİ ALMA | — | `diff` BOŞ |
| `pnpm --filter @arkesoft/trpc run contract:generate` ×2 | 0, 0 | md5 iki koşumda da `3671b25e253478b90a40cb86902a9064` (tur 1 ile AYNI); `git diff --stat` ikisinde de BOŞ |
| `pnpm lint` | 0 | 23/23 görev PASS |
| `pnpm typecheck` | 0 | 23/23 görev PASS |
| `pnpm test` | 0 | 21/21 görev PASS, `@arkesoft/api` 878/878 (138.98s alt-süreç), bilinen flake (2FA backup-code) **tek koşumda yeşil** |
| `pnpm test:isolation` | 0 | 11/11 görev PASS, `@arkesoft/api` 31/31 (11.16s), bilinen flake (D25) **tek koşumda yeşil** |
| `pnpm build` | 0 | 14/14 görev PASS |
| `pnpm guards` | 0 | 23/23 PASS, `test:contract komut zinciri — … (T-026/S3) PASS` AYRI satır |
| `pnpm test:contract` (içerik kapısı a mutasyonlu: `.describe('test')`) | 1 | 28 PASS/3 FAIL, `expected [ 'description' ] to deeply equal []` |
| Mutasyon GERİ ALMA | — | `diff` BOŞ |
| `pnpm test:contract` (içerik kapısı b mutasyonlu: `.default('x')`) | 1 | 28 PASS/3 FAIL, `expected false to be true` ((b)'nin number/boolean kontrolü) |
| Mutasyon GERİ ALMA + `pnpm --filter @arkesoft/trpc build` + `pnpm test:contract` | 0 | 31/31 PASS (nihai doğrulama) |

**Turbo önbellek durumu (AGENT_BASELINE §4 ders 3):** `@arkesoft/trpc:test:contract`
HER koşumda `cache bypass, force executing` olarak raporlandı (ilk koşumda görülen
hash değişse de davranış tutarlı — sahte yeşil riski yok). `pnpm test`/`test:isolation`
görev sayıları (21/21, 11/11) kısmen `cached` (9 cached / 21, 9 cached / 11) —
cache hit olan paketler bu Task'ın dokunmadığı paketler (`@arkesoft/db`, `@arkesoft/ui`
vb.); `@arkesoft/trpc` ve `@arkesoft/api`'nin kendisi her seferinde gerçek çalıştı
(force-executing / cache miss görüldü).

**Ortam ölçüm koşulları (AGENT_BASELINE §4 ders 2):** `uptime` → load average
3.31/5.17/5.24 (tur 1'in 15.45/8.45/5.48'inden daha sakin), 25 Docker konteyneri
çalışıyor, port 3000 (pid 12878, dokunulmadı) hariç kısıt ihlali yok. Tek koşum;
bilinen flake'ler (2FA backup-code, D25) **ikisi de yeşildi** ⇒ task talimatına göre
(“kırmızı gelirse ikinci kez koştur”) ikinci koşum GEREKMEDİ.

## MUTASYONLARIN GERİ ALINDIĞININ KANITI

Dört mutasyon uygulandı (AC-36, AC-37, içerik kapısı (a), içerik kapısı (b)); hepsi
`packages/trpc/src/schemas/job-summary.schema.ts` dosyasında, hepsi orijinal dosyanın
`/tmp/job-summary.schema.ts.orig-qa` kopyasından `cp`/`Write` ile GERİ ALINDI
(hiçbir `git checkout`/`restore`/`stash` KULLANILMADI). Her geri almadan sonra
`diff /tmp/job-summary.schema.ts.orig-qa src/schemas/job-summary.schema.ts` BOŞ
çıktı verdi (birebir aynı).

**Nihai doğrulama:** `git status --porcelain` çalışmanın BAŞINDAKİyle BİREBİR aynı
— tek fark `.claude/workflow/reviews/T-026-security-tur2.md` (benim YAZMADIĞIM,
paralel koşan `security` ajanının çıktısı). `docs/api-contract-surface.json`'ın
md5'i ÇALIŞMA SIRASINDA hiçbir an tur 1'deki değerden SAPMADI (her `contract:generate`
sonrası doğrulandı). `packages/trpc/dist/` derlenmiş çıktısı her mutasyon/geri
alma döngüsünde yeniden derlendi (dist, git'te İZLENMİYOR — `.gitignore`'da — bu
yüzden `git status`'a hiç girmedi).

## DOĞRULANAMADI

- İçerik kapısı (c) (D6 jeton deseni: ISO tarih/saat, 10+ hane, uuid/ULID)
  mutasyonla SINANMADI — görev talimatı (a)/(b)'yi istedi, (c) opsiyonel bırakıldı.
  (a) ve (b)'nin GERÇEKTEN kırmızı verdiği kanıtlandığı için "boş-yeşil" riski
  genel olarak kapatıldı, ama (c)'nin KENDİ regex'inin GERÇEKTEN eşleştiğini
  (ör. bir enum değerine `"2026-01-01"` benzeri bir dize eklenip kapının kırıldığını)
  bu turda doğrudan GÖRMEDİM.
- AC-41 (changeset) — `release` ajanının işi, bu turun kapsamı dışı (görev talimatı).
- `pnpm test:e2e` — bu sürüm `apps/*`'a dokunmuyor, hiçbir AC e2e gerektirmiyor;
  komut ÇALIŞTIRILMADI (tur 1'le AYNI gerekçe).
- AC-34'ün namespace/prosedür EKLEME senaryosu canlı router'da GERÇEK bir mutasyonla
  bu turda da TEKRARLANMADI — tur 1'in DOĞRULANAMADI notu AYNEN geçerli, bu kriter
  bu turun DAR kapsamının dışında (yalnızca hızlı teyit istendi).
