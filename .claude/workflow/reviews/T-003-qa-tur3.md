# T-003 — qa gate — ST-9 sonrası tur 3 (düzeltme turu 2 denetimi)

Tarih: 2026-10-27
ROADMAP sürümü: v0.0.12
Dal: chore/ajan-altyapisi (commit edilmemiş)
Kapsam: FIX 2'nin (devops'un ikinci düzeltme turu) tur 1/tur 2'de doğrulanan AC
mekanizmalarını BOZMADIĞININ denetimi. Dokuz BEKLEMEDE madde bu turda da
BEKLEMEDE kalır (ST-9 kanıtı, push henüz yapılmadı). Gerçek CI koşumu,
`git push`, `gh pr create`, `gh workflow run`, `pnpm release:version`, yıkıcı
veritabanı komutu bu turda **çalıştırılmadı**.

GATE: qa
SONUÇ: PASS (FIX 2, tur 1/tur 2'de doğrulanan AC mekanizmalarını bozmadı —
regresyon yok; 9 madde hâlâ BEKLEMEDE — ST-9 kanıtı; yeni bir **medium** bulgu —
AC13'ün iki-dosyalı senkron korumasında tek-yönlü bir asimetri)

---

## Denetim günlüğü

### 1. AC13 — en çok değişen mekanizma — YENİ BULGU (medium), geri kalanı regresyon YOK

**Dosya yapısı doğrulandı:**

- `.github/ci-forbidden-tokens.txt`: `=== KALICI YASAKLAR ===` (7 satır:
  `container:`, `node-version:`, `pull_request_target`,
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`, `migrate reset`,
  `db push --force-reset`, `--accept-data-loss`) ve `=== GEÇİCİ KAPSAM
BOŞLUĞU İŞARETLERİ ===` (8 satır: `pnpm audit`, `test:isolation`,
  `test:e2e`, `test:contract`, `playwright`, `docker build`, `TURBO_TOKEN`,
  `TURBO_TEAM`) olarak iki bölüme ayrılmış. Her geçici satırın vadesi dosya
  başlığındaki yorumda (sürüm eşlemesi tablosu, satır 14-23) ayrıca var.
- `.github/ci-forbidden-tokens-permanent.txt` var; içeriği (7 satır) ana
  dosyanın KALICI bölümüyle **birebir aynı** — doğrulandı.
- **R-6 korunuyor:** her iki dosya da `.txt` uzantılı, gerçek tarama hedefi
  (`find .github/workflows .github/actions -name '*.yml' -o -name '*.yaml'`)
  ikisini de doğal olarak dışlıyor — yeni dosya da glob'un dışında.
- **Kasıtlı bozma testi 1 (gerçek tarama, scratch hedef dosya):** gerçek AC13
  grep mantığı (`grep -nFf "$pattern_file"`), içine `pnpm audit` enjekte
  edilmiş bir `ci.yml` **scratch kopyasına** karşı çalıştırıldı →
  `exit=0`, satır eşleşti (`830: run: pnpm audit`). Aynı tarama gerçek
  `.github/workflows/ci.yml`'e karşı çalıştırıldı → `exit=1` (eşleşme yok).
  **AC13 taraması gerçekten yakalıyor — beyan değil, mekanik.** Gerçek dosya
  hiç değiştirilmedi.
- **Kasıtlı bozma testi 2 (`--accept-data-loss` iddiası):** `grep -qFx --
"$required"` çağrısında `--` ayırıcısının zorunlu olduğu iddiası kod
  okumasıyla doğrulandı (satır 328-332 yorumu) — `--accept-data-loss` referans
  listede `-` ile başlayan tek satır, ayırıcı olmadan grep onu bilinmeyen
  bayrak sanıp hata verirdi. Mekanizma doğru gerekçelendirilmiş.
- **Kasıtlı bozma testi 3 (fail-closed — kalıcı jeton silinirse):** scratch
  `main.txt` kopyasından `pull_request_target` silindi, `permanent.txt`
  DEĞİŞTİRİLMEDEN AC13'ün gerçek "required_permanent ⊆ pattern_file" döngüsü
  çalıştırıldı → **YAKALANDI** (`ok=false`, "main listede yok" hatası) —
  görevin bu yöndeki iddiası (kalıcı jeton silinince exit 1) **doğrulandı**.
- **Kasıtlı bozma testi 4 (geçici jeton silinirse → exit 0 beklenir):**
  GEÇİCİ bölümden bir satır (`pnpm audit`) silinmesi `required_permanent`
  kümesini hiç etkilemiyor (o küme yalnızca KALICI 7 satırdan geliyor) →
  kalan 7 kalıcı jeton hâlâ ana listede bulunuyor → kontrol **pass** (`ok=true`)
  — iddia doğrulandı: geçici satır silmek bu korumayı tetiklemiyor.
- **YENİ BULGU — senkron sapması, TEK YÖNLÜ koruma (görevin "yeni eksik
  senaryo" maddesi):** `.github/ci-forbidden-tokens-permanent.txt`'nin
  KENDİSİ hiçbir yerde doğrulanmıyor (ne bir sabit sayım, ne başka bir
  bağımsız kaynakla karşılaştırma var). Kontrol tek yönlü bir alt küme
  denetimi yapıyor: "`permanent.txt`'teki her satır ana listede VAR mı?" —
  tersi ("ana listedeki her KALICI satır `permanent.txt`'te VAR mı?") hiç
  sorulmuyor. Bunun sonucu, **scratch'te üç adımda ampirik olarak
  kanıtlandı** (gerçek repo dosyaları değiştirilmedi):
  1. Senaryo A (klasik, tek dosya unutma — ana listeden silinir, referans
     dosya DEĞİŞMEZ): **YAKALANDI** (`ok=false`) — tur 1/tur 2'nin
     doğruladığı yön, hâlâ çalışıyor.
  2. Senaryo B adım 1 (SADECE `permanent.txt`'ten `pull_request_target`
     silinir, ana liste DEĞİŞMEZ): kontrol **YAKALAMADI** (`ok=true`) —
     beklenen, çünkü ana liste hâlâ korumayı taşıyor; ancak bu adımın
     KENDİSİ hiçbir CI kontrolünden geçmeden (hiçbir adım `permanent.txt`'in
     içeriğinin tam/değişmemiş olduğunu doğrulamıyor) sessizce birleşebilir.
  3. Senaryo B adım 2 (AYRI bir commit/PR'da, adım 1'in `permanent.txt`'i +
     ana listeden de `pull_request_target` silinir): kontrol **YAKALAMADI**
     (`ok=true`) — bu, dosyanın kendi başlık yorumunun (satır 67-71, "KALICI
     bölümden satır silmek ... hâlâ mekanik olarak engelleniyor") iddia ettiği
     garantinin TAM OLARAK tersi: iki ayrı (her biri tek başına makul/küçük
     görünen) commit'le, AC13'ün fail-closed koruması hiçbir kırmızı CI
     koşumu tetiklemeden atlatılabiliyor.
  - **Önem derecesi gerekçesi (medium, şişirilmedi/küçültülmedi):** Bu bir
    tenant izolasyonu, veri kaybı veya tek-adımlı bir bypass DEĞİL — iki ayrı,
    birbirinden bağımsız commit/PR gerektirir ve ilk adım (`permanent.txt`'in
    tek başına değişmesi) normal bakım akışında hiç olmayan, diff'te dikkat
    çekici bir değişiklik (kod incelemesi bunu yakalayabilir). Ancak mekanizma
    kendi belgelediği garantiyi (solid tur 2 B / security tur 2 B2'nin
    gerekçesi) tam karşılamıyor — "bağımsız referans dosyası" fikrinin amacı
    tam olarak bunu (iki dosyanın sessizce birlikte erimesini) önlemekti ve bu
    AC13'ün robustness iddiasını zayıflatıyor; bu yüzden `low` değil `medium`.
  - **Önerilen düzeltme:** `permanent.txt`'in kendi bütünlüğünü bağımsız
    doğrulayan bir ikinci kontrol (örn. sabit bir sayım + içerik hash'i, ya da
    "ana listedeki KALICI bölüm ⊆ permanent.txt" ters denetimi) ekle.
  - **Sorumlu ajan:** devops (ST-7 sahibi, `.github/ci-forbidden-tokens*.txt`
    ve `ci.yml` guards job'u).
- Sonuç: **AC13'ün temel mekanizması (fail-closed, R-6, tek-dosya-unutma
  koruması, gerçek tarama) regresyon YOK** — tur 1/tur 2'de doğrulanan her şey
  hâlâ çalışıyor. Yeni bulunan asimetri **yeni bir eksik senaryo**, önceki
  turlarda zaten doğru çalıştığı iddia edilen bir şeyin BOZULMASI değil.

### 2. AC9 — regresyon YOK, fail-closed sandbox'ta yeniden kanıtlandı

- `ci-gate.needs` (satır 767): `[plan, repo, guards, api, admin, superadmin,
storefront, shared]` — sekiz job, tek liste (tur 2'deki ile birebir aynı).
- Sonuç adımı (satır 771-826) `toJSON(needs)` → `/tmp/needs.json` → `jq -r
'keys[]'` ile `job_names`'e atanıyor, `set -euo pipefail` altında süreç
  ikamesi YOK (`done <<< "$job_names"`), boşsa `exit 1`.
- İzinli küme hâlâ `case ... success|skipped) ;; *) ok=false ;; esac`.
- **Kasıtlı bozma testi (sandbox, gerçek `jq` ile):**
  1. `needs.json` bozuk (`not valid json`) → `job_names="$(jq -r 'keys[]'
...)"` başarısız → **YAKALANDI** ("jq parse hatası" → exit 1 yolunu
     tetikliyor).
  2. `needs.json` geçerli ama boş (`{}`) → `jq` başarılı ama `job_names` boş
     string → ikinci guard (`[ -z "$job_names" ]`) → **YAKALANDI** (exit 1).
- Sonuç: **AC9 regresyon YOK**, bozuk/boş `needs.json` iki ayrı yoldan da
  fail-closed davranıyor (görevin istediği sandbox kanıtı tamamlandı).

### 3. AC1/AC2 mekanizması — regresyon YOK

- `plan.decide` (satır 79-240) kod okumasıyla yeniden doğrulandı:
  - `turbo run build --affected --dry=json` çıkışı `if raw_json="$(...)"` ile
    doğrudan okunuyor (SC2181 düzeltmesi, dolaylı `$?` yok).
  - `names="$(... jq -re '.packages[]' ...)"` başarısızsa `schema_ok=false`
    kalıyor (satır 131-134).
  - `shared_names`: `.tasks[] | select((.package | IN($affected[])) and
(.directory | startswith("packages/")))` — **`.packages[]` (`$affected`)
    ile kesişim ZORUNLU**, salt `.tasks[]` değil (satır 164-173). `jq` hata
    verirse (`! shared_names="$(...)"`) → `schema_ok=false` (fail-open
    tetiklenir); `jq` başarılı ama sonuç boşsa (`shared_names=""`) →
    `schema_ok` **true** kalır, fail-open **tetiklenmez**, aşağıda
    `shared=false` olarak değerlendirilir (satır 229-231) — **hata ile
    geçerli-boş ayrımı iddia edildiği gibi çalışıyor**, kod okumasıyla
    doğrulandı (tur 2'de de aynı doğrulama yapılmıştı, değişmemiş).
  - `shared` job'unun `run-gates` çağrısı `filter: './packages/**'` (satır 752) — `./packages/*` DEĞİL; yorum (satır 727-752) `packages/themes/<tema>`
    gibi iç içe paketlerin `*` ile kaçırılacağını, `**`'in bunu kapsadığını
    açıklıyor (devops'un prob paketiyle ölçtüğü iddia ediliyor — bu ölçüm bu
    turda **tekrar koşulmadı**, kod okumasıyla kabul edildi).
- **Yeni eksik senaryo kontrolü — `./packages/**` genişlemesi `shared`'ı
  gereksiz tetikler mi?** HAYIR: `filter: './packages/**'` yalnızca `shared`
  job'u ZATEN tetiklenmişken (`plan.outputs.shared == 'true'`, ki bu
  `shared_names`'in boş olmamasına bağlı) hangi paketlerin lint/typecheck/
  build'den geçeceğini belirliyor — job'un TETİKLENME sıklığını etkilemiyor
  (iki farklı karar noktası: `plan` joptetikler, `shared` job'u içindeki
  filtre neyi çalıştırır). Yeni bulgu yok.
- Sonuç: **AC1/AC2 regresyon YOK.**

### 4. AC5 regresyonu — regresyon YOK

- `grep -n 'node-version:' .github/workflows/*.yml` → **boş** (exit 1,
  eşleşme yok — tek çıkış `ci.yml` içindeki grep KOMUTUNUN METNİ, literal
  pin değil).
- `node-version-file: .nvmrc` iki yerde: `.github/actions/setup-workspace/
action.yml` (gerçek kullanım) ve `.github/workflows/ci.yml` (AC5 pozitif
  iddia adımının kendi grep komutunun metni — satır 385).
- `.nvmrc` → `24` (değişmemiş).
- Sonuç: **AC5 regresyon YOK.**

### 5. AC8 — regresyon YOK

- `release.yml` tetikleyicisi hâlâ **yalnızca** `on: push: branches: [main]`
  (dosya baştan sona okundu — `workflow_dispatch`/`pull_request`/`schedule`
  yok).
- `release.yml` satır 31-33: `concurrency: { group: release-${{ github.ref
}}, cancel-in-progress: false }` — yorum (satır 21-30) gerekçeyi açıklıyor
  (yarı yazılmış sürüm commit'ini iptal etmek zararlı olurdu).
- `release.yml` iki job'da da `timeout-minutes: 15` (`version-pr` satır 44,
  `tag` satır 93).
- `ci.yml` satır 23-25: `concurrency: { group: ci-${{ github.ref }},
cancel-in-progress: true }` — tetikleyici (`on: pull_request` + `push:
branches: [main]`) **değişmedi**, yalnızca `concurrency` eklendi.
- `cancel-in-progress`: `ci.yml` → `true`, `release.yml` → `false` — **ikisi
  de doğru yerde**, gerekçeler tutarlı (CI iptal edilebilir, sürüm akışı
  iptal edilmemeli).
- `actionlint` (homebrew üzerinden kurulu 1.7.12, `which actionlint` →
  `/opt/homebrew/bin/actionlint`) `.github/workflows/*.yml` üzerinde
  çalıştırıldı: **exit 0, 0 bulgu.** (Not: bu turda checksum'ı önceden
  doğrulanmış izole bir ikili indirilmedi — homebrew kurulumu kullanıldı;
  sürüm aynı: 1.7.12. Teşhis amaçlı salt okuma, repo dosyası değiştirilmedi.)
- Sonuç: **AC8 regresyon YOK.**

### 6. AC12b — regresyon YOK

- `packages/db/package.json`: `build` hâlâ `mkdir -p dist && find dist
-mindepth 1 -maxdepth 1 ! -name generated -exec rm -rf {} + && tsc -p
tsconfig.build.json --declaration --declarationMap` — `rm -rf dist &&`
  öneki YOK (dist/generated korunuyor).
- `clean`: `rm -rf dist generated .turbo` — **yalnızca komut**, sondaki
  açıklayıcı `#` yorumu gitmiş (açıklama artık schema.prisma'da).
- `packages/db/prisma/schema.prisma` satır 21-29: `output = "../generated"`
  açıklaması **iki** "generated" konumunu (`packages/db/generated/` ham
  çıktı, `packages/db/dist/generated/` derlenmiş hali) ve `build`/`clean`
  farkını (build sadece dist'i temizler + generated'ı korur; clean ikisini
  de siler) açıkça anlatıyor.
- `prisma validate` bu turda ayrıca çalıştırılmadı (AC12a adımı zaten
  `pnpm build` 12/12 başarılı koşumuyla ve önceki turların doğrudan
  `prisma validate` kanıtıyla dolaylı doğrulandı — tekrar gereksiz).
- Sonuç: **AC12b regresyon YOK.**

### 7. AC3 (yerel beşli kapı) — regresyon YOK

| Komut               | Sonuç                                                             | Exit |
| ------------------- | ----------------------------------------------------------------- | ---- |
| `pnpm lint`         | 15/15 successful (FULL TURBO, cache hit)                          | 0    |
| `pnpm typecheck`    | 15/15 successful (FULL TURBO, cache hit)                          | 0    |
| `pnpm build`        | 12/12 successful (FULL TURBO, cache hit)                          | 0    |
| `pnpm format:check` | "All matched files use Prettier code style!"                      | 0    |
| `pnpm test`         | errors 35 + db 65 + api 112 = **212 passed, 0 failed, 0 skipped** | 0    |

Tur 1/tur 2 ile **birebir aynı sayılar** — bir kez koşturuldu. `run-gates/
action.yml` hâlâ beşli kapının **tek tanım yeri**; dört çağrı yeri (lint,
typecheck, test[koşullu], build) hepsi `env: FILTER` + `run: ... --filter=
"$FILTER"` kullanıyor — kod okumasıyla doğrulandı, değişmemiş.

### 8. AC6 — regresyon YOK

- `node scripts/sync-platform-version.ts --check` → gerçek çıktı:
  ```
  UYARI: fixed grup içi sürüm sapması var: 0.0.1, 0.0.3, 0.0.4
  --check: sürüm tutarlılığı doğrulandı.
  ```
  `exit=0` — tur 1/tur 2 ile birebir aynı.
- `pnpm exec tsc -p scripts/tsconfig.json` → `exit=0`.
- `scripts/tsconfig.json` içeriği okundu: `strict: false` / `skipLibCheck:
true` gibi bir gevşetme YOK — `extends: "@arkesoft/config/tsconfig/
node.json"` + `erasableSyntaxOnly: true` duruyor. Dosyanın başlık yorumu
  bu bayrağın CLI'dan buraya taşınma gerekçesini (`tsc -p` ile çalıştığı için
  artık tsconfig.json yoksayılmıyor) açıklıyor.
- `./packages/config/node_modules/.bin/eslint --config scripts/eslint.config.mjs
scripts` → `exit=0`.
- `pnpm release:version` **çalıştırılmadı** (talimat yasağı); kök
  `package.json` sürümü hâlâ `0.0.4` (git diff'te değişmemiş).
- Sonuç: **AC6 regresyon YOK.**

### 9. AC4/AC12a — regresyon YOK

- Üç dosyada (`apps/api/vitest.config.ts`, `packages/db/prisma.config.ts`,
  `packages/db/vitest.config.ts`) `existsSync` deseni (`import { existsSync }
from 'node:fs'` + `if (existsSync(rootEnvUrl)) { process.loadEnvFile(...) }`)
  grep ile üçünde de doğrulandı.
- `guards` job'u `setup-workspace`'i `create-env: 'false'` ile çağırıyor
  (satır 280-283) — **`.env` ÜRETMİYOR** (R-9 korunuyor).
- `api` job'u `setup-workspace`'i girdisiz çağırıyor (satır 649-650) →
  varsayılan `create-env: 'true'` → `.env` **`setup-workspace`** üzerinden
  tek sahiplikle üretiliyor; `prepare-db` composite'i `.env` ÜRETMEZ (önceki
  turda doğrulanmıştı, bu turda dosya kendisi değişmediği için tekrar
  okunmadı).
- Sonuç: **AC4/AC12a regresyon YOK.**

### 10. AC10 (şablon) — regresyon YOK

`.github/pull_request_template.md` yedi alan duruyor; yedincisi ("Yeni job
eklemedim" / "Yeni job ekledim ve `ci-gate.needs` listesine ekledim", satır
52-53) R-7 karşı önlemini birebir içeriyor. Tenant izolasyon kontrol listesi
(satır 18-27) dokuz maddeyi + "bu PR tenant verisine dokunmuyor" muafiyet
kutusunu taşıyor.

### 11. Yeni eksik senaryo — `shellcheck disable=SC2016` gerçek bir hatayı mı susturuyor?

- Beş `shellcheck disable=SC2016` yorumu bulundu, hepsi `echo '...`'
  satırlarının içinde literal Markdown ters tırnak (`` ` ``) kullanan
  TEK TIRNAKLI metinlerin önünde (satır 188-210 civarı). SC2016 "tek
  tırnak içinde değişken genişlemez" uyarısıdır — buradaki ters tırnaklar
  Markdown kod gösterimi için **kasıtlı olarak** genişletilmemesi gereken
  literal metin (içlerinde `$` yok, genişletilecek bir şey yok). **Gerçek
  bir hatayı susturmuyor** — doğru ve dar kapsamlı bir bastırma.
  `actionlint` (shellcheck'i entegre eder) bu dosyalar üzerinde 0 bulgu
  verdiği için bu da dolaylı doğrulandı.

---

## Hâlâ BEKLEMEDE olan dokuz madde (bu turda da PASS/FAIL işaretlenmedi)

| AC                                 | Durum                                       |
| ---------------------------------- | ------------------------------------------- |
| AC1                                | BEKLEMEDE — ST-9 kanıtı (gerçek PR gerekli) |
| AC2                                | BEKLEMEDE — ST-9 kanıtı (gerçek PR gerekli) |
| AC3 (CI ayağı)                     | BEKLEMEDE — ST-9 kanıtı                     |
| AC4 (CI ayağı)                     | BEKLEMEDE — ST-9 kanıtı                     |
| AC5 (CI ayağı)                     | BEKLEMEDE — ST-9 kanıtı                     |
| AC7 (iki koşum kanıtı)             | BEKLEMEDE — ST-9 kanıtı                     |
| AC9 (success+failure gerçek koşum) | BEKLEMEDE — ST-9 kanıtı                     |
| AC10 (uyarı ayağı)                 | BEKLEMEDE — ST-9 kanıtı                     |
| AC12d (CI exit 0 kanıtı)           | BEKLEMEDE — ST-9 kanıtı                     |

Bu dokuzu bu turda da **PASS/FAIL olarak işaretlemedim** — talimat gereği
ayrı bir çağrıda (push + örnek PR sonrası) denetlenecek.

---

## ÖLÇÜMLER

- **Denetlenen AC/mekanizma sayısı:** 11 (AC13, AC9, AC1/AC2, AC5, AC8,
  AC12b, AC3-yerel, AC6, AC4/AC12a, AC10-şablon + yeni `shellcheck disable`
  taraması)
- **Regresyon var mı:** **HAYIR** — FIX 2'nin değiştirdiği hiçbir mekanizma
  tur 1/tur 2'de doğrulanan AC davranışını bozmadı.
- **Yeni bulgu:** 1 adet, `medium` (AC13'ün iki-dosyalı senkron korumasında
  tek-yönlü asimetri — ayrıntı §1).
- **Hâlâ BEKLEMEDE (9 madde):** yukarıdaki tablo.
- **KABUL KRİTERİ EŞLEMESİ (bu tur):**
  | Kriter/mekanizma                                          | Test/kanıt                                                      | Sonuç              |
  | --------------------------------------------------------- | --------------------------------------------------------------- | ------------------ |
  | AC13 — KALICI/GEÇİCİ ayrımı, fail-closed, R-6             | dosya okuma + 4 kasıtlı bozma testi (scratch)                   | GEÇTİ              |
  | AC13 — iki dosya arasında senkron sapması (yeni senaryo)  | 3 adımlı scratch simülasyonu                                    | **BULGU (medium)** |
  | AC9 — tek liste + bozuk/boş needs.json fail-closed        | kod okuma + 2 sandbox senaryosu (gerçek jq)                     | GEÇTİ              |
  | AC1/AC2 — `./packages/**`, kesişim, schema_ok ayrımı      | kod okuma (tur 1/2'de test edilmişti, bu tur tekrar doğrulandı) | GEÇTİ              |
  | AC5 — negatif/pozitif .nvmrc                              | `grep`                                                          | GEÇTİ              |
  | AC8 — tetikleyici, concurrency, timeout, actionlint       | dosya okuma + `actionlint` (homebrew 1.7.12)                    | GEÇTİ              |
  | AC12b — db build/clean, schema.prisma açıklaması          | dosya okuma                                                     | GEÇTİ              |
  | AC3 — yerel beşli kapı                                    | `pnpm lint/typecheck/build/test/format:check`                   | GEÇTİ              |
  | AC6 — `--check`, `tsc -p scripts/tsconfig.json`, eşik yok | gerçek komut                                                    | GEÇTİ              |
  | AC4/AC12a — existsSync, R-9                               | `grep` + dosya okuma                                            | GEÇTİ              |
  | AC10 — şablon yedi alan                                   | dosya okuma                                                     | GEÇTİ              |
- **TEST SAYILARI:** `pnpm test` → **212 passed / 0 failed / 0 skipped**
  (errors 35 + db 65 + api 112) — tur 1/tur 2 ile birebir aynı, **bir kez**
  koşturuldu.
- **KOŞTURULAN KOMUTLAR (gerçek, bu turda, toplam 11):**
  | Komut                                                                                   | Exit | Özet                                                                         |
  | --------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------- |
  | `pnpm lint`                                                                             | 0    | 15/15 (FULL TURBO)                                                           |
  | `pnpm typecheck`                                                                        | 0    | 15/15 (FULL TURBO)                                                           |
  | `pnpm build`                                                                            | 0    | 12/12 (FULL TURBO)                                                           |
  | `pnpm format:check`                                                                     | 0    | Prettier temiz                                                               |
  | `pnpm test`                                                                             | 0    | 212 passed, 0 failed, 0 skipped                                              |
  | `node scripts/sync-platform-version.ts --check`                                         | 0    | UYARI (bilinen fixed-grup drift) + doğrulandı                                |
  | `pnpm exec tsc -p scripts/tsconfig.json`                                                | 0    | temiz                                                                        |
  | `./packages/config/node_modules/.bin/eslint --config scripts/eslint.config.mjs scripts` | 0    | temiz                                                                        |
  | `actionlint .github/workflows/*.yml` (homebrew 1.7.12)                                  | 0    | 0 bulgu                                                                      |
  | `grep -n 'node-version:' .github/workflows/*.yml`                                       | 1    | boş (beklenen)                                                               |
  | scratch: AC13 gerçek tarama + enjekte edilmiş `pnpm audit`                              | —    | scratch_exit=0 (yakaladı), gerçek dosya exit=1 (temiz)                       |
  | scratch: AC9 bozuk/boş `needs.json` (2 senaryo)                                         | —    | her ikisi de "YAKALANDI" (fail-closed)                                       |
  | scratch: AC13 iki-dosya senkron sapması (3 senaryo — A, B-adım1, B-adım2)               | —    | A=YAKALANDI, B-adım1=YAKALANMADI (beklenen), B-adım2=YAKALANMADI (**bulgu**) |
  | `git status --porcelain` (başta ve sonda)                                               | —    | **özdeş** — hiçbir scratch testi gerçek repo dosyasına dokunmadı             |
- **Flaky kontrolü:** `pnpm test` bir kez koşturuldu (talimat gereği); sonuç
  tur 1/tur 2 ile birebir eşleşti (212/0/0) → flaky belirtisi yok.
- **Kasıtlı bozma testleri (bu tur, toplam 9):** AC13 gerçek tarama
  (`pnpm audit` enjeksiyonu), AC13 fail-closed (kalıcı jeton silme),
  AC13 fail-open-tetiklenmez (geçici jeton silme), AC13 iki-dosya senkron
  sapması (3 alt senaryo — yeni bulgu burada ortaya çıktı), AC9 bozuk
  `needs.json`, AC9 boş `needs.json` — hepsi **scratch kopyalarda**
  yapıldı; `git status` başta/sonda özdeş (kanıtlandı).

---

## BULGULAR

- [SEV: medium] `.github/ci-forbidden-tokens.txt` + `.github/ci-forbidden-tokens-permanent.txt`
  (AC13 "guards" job'u, `.github/workflows/ci.yml:317-337`) — AC13'ün
  "bağımsız referans dosyası" koruması TEK YÖNLÜ: yalnızca
  "`permanent.txt`'teki her satır ana listede var mı?" kontrol ediliyor,
  "ana listedeki her KALICI satır `permanent.txt`'te var mı?" (ters yön) hiç
  denetlenmiyor ve `permanent.txt`'in kendi bütünlüğü (sabit sayım/hash/başka
  bağımsız kaynak) hiçbir yerde doğrulanmıyor. Sonuç: bir KALICI yasağı
  (örn. `pull_request_target`) İKİ AYRI commit/PR'da (1. `permanent.txt`'ten
  satırı sil — hiçbir kontrolden geçmez, sessizce birleşir; 2. AYRI bir
  PR'da ana listeden de aynı satırı sil) atlatmak mümkün; her iki PR da
  AC13'ün kendi iddiasına (dosyanın başlık yorumu, satır 67-71: "KALICI
  bölümden satır silmek ... hâlâ mekanik olarak engelleniyor") rağmen
  **yeşil geçer**. Üç adımlı scratch simülasyonuyla ampirik olarak
  kanıtlandı (bkz. §1); gerçek repo dosyaları değiştirilmedi. — **Önerilen
  düzeltme:** `permanent.txt`'in bütünlüğünü bağımsız doğrulayan ikinci bir
  kontrol ekle (sabit satır sayısı/hash'i ya da ters alt küme denetimi:
  "ana listenin KALICI bölümü ⊆ permanent.txt"). — **Sorumlu ajan:** devops.

## RİSKLER / NOTLAR (gate FAIL kuralına dahil değil, bulgu değil)

1. Tur 2'nin RİSKLER listesindeki `concurrency: cancel-in-progress: true`'nun
   gerçek ardışık push senaryosunda GitHub'ın check-run eşlemesiyle beklenen
   gibi davranıp davranmadığı bu turda da yerel olarak doğrulanamadı — ST-9
   sırasında gözlemlenmesi önerilir (tur 2'den taşındı, hâlâ geçerli).
2. Bu turda `actionlint` için önceden SHA256 doğrulanmış izole bir ikili
   indirilmedi — homebrew'dan kurulu olan 1.7.12 sürümü kullanıldı (aynı
   sürüm numarası, ama checksum bu turda tekrar doğrulanmadı — teşhis amaçlı
   salt okuma olduğu ve verimlilik talimatı gereği kısa tutulduğu için kabul
   edilebilir, ama not düşülüyor).
3. Dokuz BEKLEMEDE madde (yukarıdaki tablo) bu turda da **PASS/FAIL olarak
   işaretlenmedi** — özel talimat gereği, push ve örnek PR'dan (ST-9) sonra
   ayrı bir çağrıda denetlenecek.
