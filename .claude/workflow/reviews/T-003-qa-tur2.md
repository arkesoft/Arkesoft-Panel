# T-003 — qa gate — ST-9 sonrası tur (düzeltme turu denetimi)

Tarih: 2026-10-27
ROADMAP sürümü: v0.0.12
Dal: chore/ajan-altyapisi (commit edilmemiş)
Kapsam: solid-tur1 FAIL sonrası düzeltme turunun, qa-tur1'de doğrulanan AC
mekanizmalarını BOZMADIĞININ denetimi. Dokuz BEKLEMEDE madde bu turda da
BEKLEMEDE kalır (ST-9 kanıtı, push henüz yapılmadı). Gerçek CI koşumu,
`git push`, `gh pr create`, `pnpm release:version` bu turda **çalıştırılmadı**.

GATE: qa
SONUÇ: PASS (düzeltme turu, tur 1'de doğrulanan AC mekanizmalarını bozmadı —
regresyon yok; 9 madde hâlâ BEKLEMEDE — ST-9 kanıtı)

---

## Denetim günlüğü (artımlı)

### 1. AC5 regresyonu — EN KRİTİK — regresyon YOK

- `grep -n 'node-version:' .github/workflows/*.yml` → **boş** (literal sabit sürüm
  anahtarı yok, önceki gibi).
- `node-version-file: .nvmrc` tek yerde: `.github/actions/setup-workspace/action.yml:36`.
  `release.yml` artık kendi `setup-node` adımını barındırmıyor — `release.yml:49`
  `uses: ./.github/actions/setup-workspace` ile **aynı** composite'i çağırıyor (grep
  doğrulandı, `release.yml` içinde `setup-node`/`node-version` hiç yok). İddia
  **taşınmadı, kayboldu değil** — tek kaynağa (`setup-workspace`) konsolide oldu.
  `ci.yml`'deki tüm job'lar (`plan, repo, guards, api, admin, superadmin, storefront,
shared`) da aynı composite'i çağırıyor; repo genelinde `setup-node` kullanan başka
  bir yer yok (`grep -rln "setup-node"` → yalnızca `setup-workspace/action.yml`).
- `.nvmrc` → `24` (değişmemiş).
- Pozitif iddia (`guards` job, "Sabit Node sürümü yazımı yasağı (AC5)" adımı,
  satır 297-313): artık yalnızca `grep -rn 'node-version-file'
.github/actions/setup-workspace/action.yml` ile .nvmrc referansının GERÇEKTEN
  kullanıldığını doğruluyor; negatif taraf (sabit `node-version:` yazımı yasağı)
  AC13'ün genel taramasına taşındı.
- **Kasıtlı bozma testi (gerçek dosya DEĞİL, scratch kopya üzerinde):**
  `ci.yml`'in bir scratch kopyasına `node-version: "20"` satırı eklendi, AC13'ün
  gerçek tarama komutu (`grep -nFf` pattern listesine karşı) bu scratch kopya
  üzerinde çalıştırıldı → `grep_exit=0`, satır eşleşti (`724: node-version: "20"`).
  **AC13 taraması `node-version:` jetonunu gerçekten yakalıyor** — beyan değil,
  mekanik. Gerçek repo dosyaları bu testte **hiç değiştirilmedi** (`git status`
  sonunda değişiklik yok, aşağı bkz.).
- Sonuç: **AC5 regresyon YOK.** Mekanizma taşındı (AC13'e konsolide), kapsam
  daralmadı; hem pozitif (`.nvmrc` kullanımı) hem negatif (`node-version:` yasağı)
  taraf hâlâ mekanik olarak doğrulanıyor.

### 2. AC9 mekanizması — regresyon YOK

- `ci-gate.needs` (satır 679): `[plan, repo, guards, api, admin, superadmin,
storefront, shared]` — **tek liste**, elle yazılmış ikinci bir döngü/liste
  `ci.yml` içinde yok (önceki tasarımda ikisi ayrı tutuluyordu — artık tek yer).
  Sonuç adımı (satır 683-722) listeyi **`toJSON(needs)`**'ten (`NEEDS_JSON` env
  değişkeni) türetiyor: `jq -r 'keys[]' /tmp/needs.json` ile job adları, sonra her
  biri için `.[$j].result` okunuyor. Elle döngü **gerçekten silinmiş**, ikinci bir
  kopya yok.
- İzinli küme hâlâ `case "$result" in success|skipped) ;; *) ok=false ;; esac` —
  `contains(needs.*.result, 'failure')` deseni repo genelinde yok (`grep -rn
"contains(needs"` boş).
- **Kasıtlı bozma testi (simülasyon, gerçek GitHub Actions çalışma zamanı dışında):**
  Aynı bash döngüsü üç sahte `needs.json` ile çalıştırıldı:
  - Hepsi `success`/`skipped` → `ok=true` (PASS bekleniyor, doğru).
  - Bir job `failure` → `ok=false` (FAIL bekleniyor, doğru).
  - Bir job `cancelled` → `ok=false` (FAIL bekleniyor, doğru — `contains()` deseni
    kullanılsaydı bu senaryo YANLIŞLIKLA yeşil kalabilirdi; K-B3 gerekçesi
    doğrulandı).
- Sonuç: **AC9 regresyon YOK**, mekanizma iddia edildiği gibi çalışıyor.

### 3. AC13 — regresyon YOK, fail-closed doğrulandı

- `.github/ci-forbidden-tokens.txt`: gerçek desen sayısı **15** (yorum/boş satır
  hariç, `wc -l` ile sayıldı): `pnpm audit, test:isolation, test:e2e, test:contract,
playwright, docker build, TURBO_TOKEN, TURBO_TEAM, container:, node-version:,
pull_request_target, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION, migrate reset,
db push --force-reset, --accept-data-loss`. Dört yıkıcı Prisma jetonu
  (`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`, `migrate reset`,
  `db push --force-reset`, `--accept-data-loss`) listede **var**.
- Öz-test (fail-closed) — `guards` job satır 252-261: `pattern_count` 10'un altına
  düşerse `exit 1`. **Kasıtlı bozma testi (scratch, gerçek dosyaya DOKUNULMADI):**
  tokens dosyasının yalnızca yorum satırı içeren bir kopyası oluşturuldu
  (`pattern_count=0`), aynı eşik mantığı çalıştırıldı → `exit=1` (fail-closed
  gerçekten tetikleniyor, beyan değil). Gerçek dosya (`.github/ci-forbidden-tokens.txt`,
  15 desen) ayrıca tekrar sayıldı ve değişmediği doğrulandı.
- R-6 (tarama hedefi `.txt`'yi dışlıyor): dosya hâlâ `.txt` uzantılı
  (`ls -la .github/ci-forbidden-tokens.txt`), gerçek tarama hedefi
  `find .github/workflows .github/actions -name '*.yml' -o -name '*.yaml'` —
  `.txt` doğal olarak dışarıda. Gerçek repo üzerinde tarama çalıştırıldı:
  `grep_exit=1` (eşleşme yok) → "AC13: yasak jeton bulunmadı" beklenen çıktı
  doğrulandı.
- Sonuç: **AC13 regresyon YOK**, hem desen sayısı hem fail-closed davranışı hem
  R-6 dışlaması korunuyor.

### 4. AC4/AC12a — regresyon YOK, R-9 korunuyor

- Üç dosyada (`apps/api/vitest.config.ts`, `packages/db/prisma.config.ts`,
  `packages/db/vitest.config.ts`) `existsSync` koşulu `git diff` ile tekrar
  doğrulandı — hepsi hâlâ `import { existsSync } from 'node:fs'` +
  `if (existsSync(rootEnvUrl)) { process.loadEnvFile(rootEnvUrl) }` deseninde.
  Bu dosyalar düzeltme turunun yüzeyinde DEĞİLDİ (devops'un değişiklik tablosunda
  yok) — `git diff` çıktısı tur 1'de görülenle birebir, beklenen şekilde sabit.
- `.env` sahipliği: `prepare-db/action.yml` artık **iki adım** (migration + seed),
  `.env` üretimi **kaldırılmış** — dosyanın başlığı bunu açıkça belgeliyor ("`.env`
  ÜRETMEZ — bu adımın sahibi çağıran `setup-workspace` composite'idir").
  `api` job'u (`ci.yml:571-575`) sırasıyla `setup-workspace` (girdi verilmedi →
  varsayılan `create-env: 'true'`) → `prepare-db` → `run-gates` çağırıyor; yani
  `.env` hâlâ **`setup-workspace`'in varsayılan davranışıyla** `api` job'unda
  üretiliyor, `prepare-db`'den kaldırılması bir boşluk yaratmıyor (tek sahiplik
  doğru kuruldu).
- **R-9 (guards `.env` ÜRETMİYOR) — korunuyor:** `guards` job'u `setup-workspace`'i
  **açıkça** `create-env: 'false'` ile çağırıyor (`ci.yml:239-242`); `setup-workspace`
  composite'i de `create-env` girdisi `'true'` olmadıkça `.env` üretmeyecek şekilde
  (`if: ${{ inputs.create-env == 'true' }}`) kurulu — mekanizma iki taraftan da
  doğrulandı, R-9'un anlamı bozulmadı.
- Sonuç: **AC4/AC12a regresyon YOK.**

### 5. AC6 — regresyon YOK

- `node scripts/sync-platform-version.ts --check` → gerçek çıktı:
  ```
  UYARI: fixed grup içi sürüm sapması var: 0.0.1, 0.0.3, 0.0.4
  --check: sürüm tutarlılığı doğrulandı.
  ```
  `exit=0` — tur 1'deki çıktıyla **birebir aynı**.
- `.changeset/config.json`: `fixed` grubu **9 üye** (`admin, api, config, db, errors,
integrations, storefront, superadmin, ui`), `privatePackages: { version: true,
tag: false }` — değişmemiş.
- `parseSemver`'ın ön-sürük/build eki davranışı kod okumasıyla doğrulandı (satır
  100-129): regex artık `(.*)$` ile sona kadar yakalıyor, `rest.length > 0` ise
  **açık hata fırlatıyor** ("Bu script ön-sürüm/build eki olan semver'leri
  desteklemiyor"). Önceki davranış (desen sonda `$` taşımıyordu, `0.0.5-rc.1` ==
  `0.0.5` sayılıyordu) artık mümkün değil — solid tur 1 C9 bulgusunun düzeltmesi
  doğru uygulanmış.
- `pnpm release:version` **çalıştırılmadı** (talimat yasağı); kök `package.json`
  sürümü hâlâ `0.0.4`, `.changeset/` dizininde `config.json` dışında dosya yok —
  mutasyon kalıntısı yok.
- Sonuç: **AC6 regresyon YOK.**

### 6. AC8 — regresyon YOK

- `release.yml` tetikleyicisi hâlâ **yalnızca** `on: push: branches: [main]`
  (`grep -nE 'pull_request|workflow_dispatch|schedule' .github/workflows/release.yml`
  → boş).
- `actionlint` (önceden SHA256 doğrulanmış 1.7.12 ikilisi, `$TMPDIR/actionlint-st6/
actionlint` — checksum bu turda **tekrar** `shasum -a 256 -c` ile `darwin_arm64`
  arşivine karşı doğrulandı, `OK`) `.github/workflows/*.yml` üzerinde çalıştırıldı:
  **exit 0, 0 bulgu.**
- Sonuç: **AC8 regresyon YOK.**

### 7. AC10 (şablon) — regresyon YOK

- `.github/pull_request_template.md`: yedi alan duruyor (1. ROADMAP versiyonu, 2. kabul kriteri, 3. tenant izolasyon kontrol listesi, 4. Changeset, 5. UI
  değişikliği, 6. ci-gate yeşil mi, 7. "Yeni bir CI job'u eklediysen
  `ci-gate.needs` listesine eklendi mi?"). Yedinci madde R-7 karşı önlemini
  birebir içeriyor.

### 8. AC3 (yerel) — regresyon YOK

| Komut               | Sonuç                                                             | Exit |
| ------------------- | ----------------------------------------------------------------- | ---- |
| `pnpm lint`         | 15/15 successful (FULL TURBO, cache hit)                          | 0    |
| `pnpm typecheck`    | 15/15 successful (FULL TURBO, cache hit)                          | 0    |
| `pnpm build`        | 12/12 successful (FULL TURBO, cache hit)                          | 0    |
| `pnpm format:check` | "All matched files use Prettier code style!"                      | 0    |
| `pnpm test`         | errors 35 + db 65 + api 112 = **212 passed, 0 failed, 0 skipped** | 0    |

Tur 1'deki sayılarla **birebir aynı** — bir kez koşturuldu (talimat gereği).

`run-gates/action.yml` hâlâ beşli kapının **tek tanım yeri**. Tek değişiklik:
dört çağrı yeri `--filter=${{ inputs.filter }}` yerine `env: FILTER: ${{
inputs.filter }}` + `run: ... --filter="$FILTER"` kullanıyor (security tur 1 B1
düzeltmesi — enjeksiyon yüzeyini kapatmak için). Bu, turbo'nun `--filter`
argüman ayrıştırmasını **değiştirmiyor** — yalnızca bash'in değer genişletme
noktasını `run:` metninin dışına (env:) taşıyor. Yerel `lint`/`typecheck`/
`build`/`test` komutlarıyla **anlam olarak aynı** (`turbo run <task>
--filter=<değer>`); yukarıdaki yerel koşumlar bunu zaten dolaylı doğruluyor
(kök script'ler `run-gates` ile aynı temel `turbo run <task>` komutunu
çağırıyor, filtre olmadan).

### 9. AC12b — regresyon YOK

`packages/db/package.json` `build` script'i hâlâ: `mkdir -p dist && find dist
-mindepth 1 -maxdepth 1 ! -name generated -exec rm -rf {} + && tsc ...` —
`rm -rf dist &&` öneki yok. `clean` script'ine yalnızca bir açıklayıcı yorum
eklendi (`db` ajanı tarafından yorumlandı), komutun kendisi (`rm -rf dist
generated .turbo`) değişmedi — `build` ile `clean`'in farklı amaçları
karışmıyor, `build` bozulmadı (yukarıdaki `pnpm build` 12/12 koşumu bunu zaten
doğruluyor).

### 10. AC12c — regresyon YOK

`packages/config/package.json`: dört lint paketi (`@eslint/js`,
`eslint-config-prettier`, `globals`, `typescript-eslint`) `devDependencies`'te,
`zod` tek başına `dependencies`'te, `peerDependencies` değişmemiş. (Bu dosya
düzeltme turunun yüzeyinde değildi — `git diff` çıktısı tur 1'de görülenle
aynı.)

### 11. Yeni guards kontrolleri — bloklayan mı, uyarı mı?

- **`run:` içinde `${{ }}` taraması** (satır 315-386): blok, `set -euo pipefail`
  - `exit 1` (açık `if: always()` YOK, `continue-on-error` YOK) → **bloklayan**.
    **Kasıtlı bozma testi (scratch):** bir `action.yml` kopyasının `run:` bloğu
    içine `${{ inputs.something }}` enjekte edildi → tarama `violation=true` ile
    yakaladı (gerçek script, aynen kopyalandı). **Negatif kontrol:** aynı ifade
    `env:` alanına taşınınca (ki serbesttir) → `violation=false` — yanlış pozitif
    yok. Gerçek repo üzerinde aynı tarama çalıştırıldı → `violation=false` (temiz).
- **`tsc --erasableSyntaxOnly` + `eslint scripts`** (satır 406-433): ikisi de düz
  `run:` blokları, `if:`/`continue-on-error` yok → **bloklayan**. Yerel olarak
  birebir komutlarla tekrar çalıştırıldı: tsc → `exit 0`, eslint → `exit 0`.
- Sonuç: üç yeni kontrol de gerçekten **bloklayan**, sessiz uyarıya düşürülmemiş.

### 12. AC7/AC10 uyarı adımları — `if: always()` gerçekten var mı, sıra doğru mu?

- AC7 adımı (satır 469-488): `if: always() && github.event_name == 'pull_request'`.
- AC10 adımı (satır 490-502): `if: always() && github.event_name == 'pull_request'`.
- Her ikisi de `guards` job'unun **engelleyici** adımlarından (AC13, AC5, `${{ }}`
  taraması, AC8, AC6, tsc, eslint, sahte-yeşil dedektörü, AC12a) **sonra** geliyor;
  `always()` koşulu sayesinde bu adımlardan biri erken `exit 1` verse de GitHub
  Actions bu iki adımı **atlamaz** (varsayılan koşul `success()` olurdu, atlardı).
  Bu, solid tur 1'in "erken FAIL uyarı adımlarını atlatıyor" bulgusunun (devops C5)
  gerçekten düzeltildiğini doğruluyor.
- `actionlint` indirme/çalıştırma adımları (satır 504-530) kasıtlı olarak
  `always()` taşımıyor — bunlar engelleyici kontroller olduğu için erken bir FAIL
  sonrası atlanmaları **beklenen** davranış (yalnızca danışma/uyarı adımları
  `always()` almalı, hepsi değil).

### 13. Yeni eksik senaryo — `concurrency: cancel-in-progress: true`

- `ci.yml:23-25`: `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress:
true }`. `pull_request` olayında `github.ref` = `refs/pull/<N>/merge` — PR
  başına **sabit**, farklı commit'lerde değişmiyor; bu yüzden aynı PR'a art arda
  push'larda ESKİ koşum iptal edilir, YENİ koşum (yeni HEAD SHA için) başlar.
  GitHub'ın zorunlu check mantığı birleştirme kararını **HEAD SHA'nın güncel
  check'lerine** göre verir; iptal edilen eski koşum eski bir SHA'ya ait olduğu
  için (yeni SHA'nın kendi `ci-gate` koşumu ayrıca başlar) bu PR'ı **bloklamaz** —
  standart, iyi bilinen bir GitHub Actions deseni (yeni push zaten önceki check'i
  süpürür). **Ancak** bu, ST-9'da gerçek bir PR'da (art arda hızlı push) fiilen
  gözlemlenmedi — simülasyonla (sahte `needs.json`, bkz. madde 2) yalnızca
  `ci-gate`'in BİR KOŞUM İÇİNDE bir job `cancelled` dönerse fail-closed davrandığı
  kanıtlandı; farklı SHA'lar arası GitHub'ın check-run eşleme davranışı yerel
  olarak doğrulanamaz. **Bulgu yazılmadı** (mekanizma teorik olarak doğru ve
  yaygın örüntü), ama ST-9 sırasında Orkestratör'ün art arda iki push ile gerçek
  davranışı gözlemlemesi önerilir (RİSKLER'e taşındı).
- `/tmp/needs.json` yazımı başarısız olursa: adım `set -euo pipefail` altında,
  `printf '%s' "$NEEDS_JSON" > /tmp/needs.json` başarısız olursa (`set -e`)
  script **anında** non-zero exit ile durur → `ci-gate` job'u `failure` ile
  biter → **fail-closed** (bulgu değil, mekanizma doğru).

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

Bu dokuzu bu turda **PASS/FAIL olarak işaretlemedim** — talimat gereği ayrı bir
çağrıda (push + örnek PR sonrası) denetlenecek.

---

## ÖLÇÜMLER

- **Denetlenen AC/mekanizma sayısı:** 13 (AC5, AC9, AC13, AC4/AC12a, AC6, AC8,
  AC10-şablon, AC3-yerel, AC12b, AC12c + 3 yeni guards kontrolü + AC7/AC10 sıra
  kontrolü + concurrency/fail-closed senaryoları)
- **Regresyon var mı:** **HAYIR** — düzeltme turunun değiştirdiği hiçbir mekanizma
  tur 1'de doğrulanan AC davranışını bozmadı; her biri yeniden doğrulandı (bazıları
  kasıtlı bozma testiyle).
- **Hâlâ BEKLEMEDE (9 madde):** AC1, AC2, AC3(CI), AC4(CI), AC5(CI), AC7(iki koşum),
  AC9(gerçek koşum), AC10(uyarı ayağı), AC12d — yukarıdaki tabloda detaylı.
- **KABUL KRİTERİ EŞLEMESİ (bu tur, özet):**
  | Kriter/mekanizma                             | Test/kanıt                                          | Sonuç |
  | -------------------------------------------- | --------------------------------------------------- | ----- |
  | AC5 (pozitif .nvmrc + negatif node-version:) | `grep` + scratch bozma testi                        | GEÇTİ |
  | AC9 (tek liste, toJSON(needs), allow-list)   | `grep` + sahte needs.json simülasyonu (3 senaryo)   | GEÇTİ |
  | AC13 (15 desen, fail-closed, R-6)            | `wc -l` + scratch fail-closed testi + gerçek tarama | GEÇTİ |
  | AC4/AC12a (existsSync, R-9)                  | `git diff` + `ci.yml`/`action.yml` okuma            | GEÇTİ |
  | AC6 (--check, parseSemver prerelease)        | gerçek komut + kod okuma                            | GEÇTİ |
  | AC8 (tetikleyici, actionlint)                | `grep` + actionlint (checksum yeniden doğrulandı)   | GEÇTİ |
  | AC10 şablon                                  | dosya okuma                                         | GEÇTİ |
  | AC3 yerel beşli kapı                         | `pnpm lint/typecheck/build/test/format:check`       | GEÇTİ |
  | AC12b (db build budama)                      | dosya okuma + `pnpm build`                          | GEÇTİ |
  | AC12c (lint paketleri konumu)                | dosya okuma                                         | GEÇTİ |
  | Yeni `${{ }}` taraması                       | scratch bozma + negatif kontrol + gerçek repo       | GEÇTİ |
  | Yeni tsc/eslint scripts kontrolü             | yerel komut tekrarı                                 | GEÇTİ |
  | AC7/AC10 `always()` sırası                   | kod okuma                                           | GEÇTİ |
- **TEST SAYILARI:** `pnpm test` → **212 passed / 0 failed / 0 skipped** (errors 35
  - db 65 + api 112) — tur 1 ile birebir aynı, **bir kez** koşturuldu.
- **KOŞTURULAN KOMUTLAR (gerçek, bu turda):**
  | Komut                                                                                                    | Exit | Özet                                                           |
  | -------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------- |
  | `pnpm lint`                                                                                              | 0    | 15/15 (FULL TURBO)                                             |
  | `pnpm typecheck`                                                                                         | 0    | 15/15 (FULL TURBO)                                             |
  | `pnpm build`                                                                                             | 0    | 12/12 (FULL TURBO)                                             |
  | `pnpm format:check`                                                                                      | 0    | Prettier temiz                                                 |
  | `pnpm test`                                                                                              | 0    | 212 passed, 0 failed, 0 skipped                                |
  | `node scripts/sync-platform-version.ts --check`                                                          | 0    | UYARI (fixed grup drift, bilinen) + doğrulandı                 |
  | `pnpm exec tsc --erasableSyntaxOnly ... scripts/sync-platform-version.ts`                                | 0    | temiz                                                          |
  | `./packages/config/node_modules/.bin/eslint --config scripts/eslint.config.mjs scripts`                  | 0    | temiz                                                          |
  | `actionlint .github/workflows/*.yml` (önceden SHA256 doğrulanmış 1.7.12)                                 | 0    | 0 bulgu                                                        |
  | `shasum -a 256 -c` (actionlint arşivi yeniden doğrulama)                                                 | 0    | OK (darwin_arm64)                                              |
  | `grep -rn "node-version:"` / `"node-version-file"` / `"contains(needs"` / `"setup-node"`                 | —    | beklenen desenler doğrulandı                                   |
  | scratch: AC13 gerçek tarama mantığı + enjekte edilmiş `node-version:`                                    | —    | mekanizma yakaladı (grep_exit=0)                               |
  | scratch: AC13 fail-closed (`pattern_count<10`) simülasyonu                                               | —    | exit 1 (fail-closed doğrulandı)                                |
  | scratch: ci-gate allow-list simülasyonu (3 senaryo: hepsi success/skipped, biri failure, biri cancelled) | —    | sırasıyla ok=true/false/false (doğru)                          |
  | scratch: `${{ }}` taraması (enjekte edilmiş `run:` ihlali + `env:` negatif kontrolü)                     | —    | violation=true / false (doğru)                                 |
  | gerçek repo: `${{ }}` taraması + AC13 taraması (salt okuma)                                              | —    | violation=false, grep_exit=1 (temiz)                           |
  | `git diff` (9 tracked dosya)                                                                             | —    | AC4/AC12a/AC12b/AC12c dosyalarında beklenmeyen değişiklik yok  |
  | `git status --porcelain` (başta ve sonda)                                                                | —    | **özdeş** — scratch testleri gerçek repo dosyalarına dokunmadı |
- **Flaky kontrolü:** `pnpm test` bir kez koşturuldu (talimat gereği, tur 1 ve
  devops'un ST-7/düzeltme turu koşumlarıyla üçüncü tekrar gereksiz); sonuç
  tur 1 ile birebir eşleşti (212/0/0) → flaky belirtisi yok.
- **Kasıtlı bozma testleri (bu tur, toplam 5):** AC5/AC13 birleşik negatif tarama,
  AC13 fail-closed eşiği, AC9 allow-list (3 alt senaryo), yeni `${{ }}` taraması
  (pozitif + negatif kontrol) — hepsi beklenen şekilde davrandı; hiçbiri gerçek
  repo dosyasını değiştirmedi (`git status` başta/sonda özdeş, kanıtlandı).

---

## BULGULAR

yok

## RİSKLER / NOTLAR (gate FAIL kuralına dahil değil, bulgu değil)

1. `concurrency: cancel-in-progress: true` ile art arda push senaryosunun GERÇEK
   bir PR'da (farklı HEAD SHA'lar, GitHub'ın check-run eşlemesi) beklenen gibi
   davranıp davranmadığı yerel olarak doğrulanamadı — teorik olarak doğru
   (standart desen), ama ST-9 sırasında Orkestratör'ün iki hızlı ardışık push ile
   gerçek davranışı not etmesi önerilir.
2. Tur 1'in RİSKLER listesindeki madde 1 (AC7'nin `git fetch`/`changeset status
--since` davranışının gerçek PR bağlamında gözlemlenmesi) ve madde 2 (AC11,
   `docs/development.md`) bu turda da geçerliliğini koruyor — ST-9/sonraki
   adımlarda tekrar kontrol edilmeli.
3. Dokuz BEKLEMEDE madde (yukarıdaki tablo) bu turda da **PASS/FAIL olarak
   işaretlenmedi** — özel talimat gereği, push ve örnek PR'dan (ST-9) sonra ayrı
   bir çağrıda denetlenecek.
