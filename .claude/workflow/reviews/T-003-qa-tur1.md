# T-003 — qa gate — tur 1

Tarih: 2026-10-27
ROADMAP sürümü: v0.0.12
Dal: chore/ajan-altyapisi

GATE: qa
SONUÇ: PASS (yerel doğrulanabilir küme için; 9 AC maddesi BEKLEMEDE — ST-9 kanıtı bekliyor, bkz. aşağı)

## Not — ÖZEL TALİMAT uygulanıyor

Şu altı AC tur 1'de **BEKLEMEDE — ST-9 kanıtı** olarak işaretlenecek, PASS/FAIL yazılmayacak:
AC1, AC2, AC3 (CI ayağı), AC7, AC9, AC10 (uyarı ayağı). Ayrıca AC4 ve AC5'in CI ayağı, AC12d'nin
`pnpm db:seed` exit 0 kanıtı da BEKLEMEDE.

Tur 1 SONUÇ kararı yalnızca yerel doğrulanabilir kümeye dayanır: AC3 (yerel ayak), AC4 (kısmi),
AC5 (grep), AC6, AC8, AC10 (şablon içeriği), AC12a, AC12b, AC12c, AC13.

---

## Denetim günlüğü (artımlı)

(Aşağıya AC denetledikçe eklenecek.)

### AC3 (yerel ayak) — PASS

Komutlar (repo kökünden, sırayla):

| Komut               | Çıktı                                                                                  | Exit |
| ------------------- | -------------------------------------------------------------------------------------- | ---- |
| `pnpm lint`         | 15/15 successful (FULL TURBO, cache hit)                                               | 0    |
| `pnpm typecheck`    | 15/15 successful (FULL TURBO, cache hit)                                               | 0    |
| `pnpm build`        | 12/12 successful (FULL TURBO, cache hit)                                               | 0    |
| `pnpm format:check` | "All matched files use Prettier code style!"                                           | 0    |
| `pnpm env:check`    | "✓ 17 değişken geçerli."                                                               | 0    |
| `pnpm test`         | errors 35 passed / db 65 passed / api 112 passed → **212 toplam, 0 failed, 0 skipped** | 0    |

Üretim fazı iddiasıyla (212 test, 15/15, 12/12, format temiz) birebir örtüşüyor.

**DRY/sapma kontrolü:** `.github/actions/run-gates/action.yml` beşli kapıyı
`pnpm exec turbo run lint/typecheck/test/build --filter=...` olarak **tek yerde**
tanımlıyor. Kök `package.json`'daki `lint`/`typecheck`/`test`/`build` script'leri de
aynı temel komutu (`turbo run <task>`) çağırıyor — yalnızca `run-gates` hat bazlı
`--filter` ekliyor. `ci.yml` içinde `grep` ile arandı: `turbo run lint|typecheck|test|build`
dört komutun hiçbiri `run-gates` dışında tekrar edilmiyor (plan'ın `--dry=json` ve
guards'ın test-sahipliği kontrolü farklı amaçlı, beşli kapı tekrarı değil).
**Sapma yok.**

### AC4 (kısmi) — PASS

| Dosya                               | Beklenen                               | Gerçek                                                                                                                        |
| ----------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/vitest.config.ts`      | `loadEnvFile` `existsSync` koşulunda   | satır 17/20-21: `import { existsSync } from 'node:fs'` + `if (existsSync(rootEnvUrl)) { process.loadEnvFile(rootEnvUrl) }` ✅ |
| `packages/db/prisma.config.ts`      | aynı                                   | satır 13/16-17 aynı desen ✅                                                                                                  |
| `apps/api/vitest.config.ts`         | aynı + import'ların ALTINDA (ST-2 DoD) | satır 19 import, satır 23-26 `existsSync` çağrısı import'ların altında ✅                                                     |
| `packages/db/prisma.config.ts` seed | `--env-file-if-exists=`                | satır 53: `node --env-file-if-exists=../../.env dist/seed.js` ✅                                                              |
| kök `package.json` `env:check`      | `--env-file-if-exists`                 | satır 23: `node --env-file-if-exists=.env packages/config/dist/check-env.js` ✅                                               |

Beş çağrı yeri de doğrulandı. CI ayağı (gerçek `.env`siz checkout'ta job koşumu) **BEKLEMEDE —
ST-9 kanıtı** (özel talimat gereği). Yerel olarak `guards` job'unun probunu bire bir tekrarladım
(bkz. aşağı) — `.env` dosyasını **taşımadan**, sadece `DATABASE_URL` enjekte edip komutları
çalıştırdım; dört adımın hepsi exit 0.

### AC5 (grep) — PASS

- `grep -rn "node-version:" .github/workflows/ .github/actions/` → **boş** (sabit sürüm yok).
- `grep -rn "node-version-file" ...` → `setup-workspace/action.yml:26` ve `release.yml:46` →
  ikisi de `.nvmrc`.
- `.nvmrc` içeriği: `24`.
- `setup-workspace/action.yml` satır 27-35: kurulan Node sürümünü `.nvmrc` ile karşılaştıran
  `grep -q "^v${expected}\."` iddiası var; uyuşmazsa `exit 1`.
- CI ayağı (`node -v` → `v24.` gerçek koşumda) **BEKLEMEDE — ST-9 kanıtı**.

### AC12a — PASS (yerel prob tekrarlandı, .env TAŞINMADI)

`guards` job'unun AC12a adımını (satır 311-325) `.env`'e dokunmadan, sadece `DATABASE_URL`
ortam değişkenini enjekte ederek tekrar ettim:

```
DATABASE_URL=postgresql://arkesoft:arkesoft_dev_only@localhost:5432/arkesoft?schema=public \
  pnpm --filter @arkesoft/db exec vitest list   # exit 0
DATABASE_URL=... pnpm --filter @arkesoft/api exec vitest list  # exit 0
DATABASE_URL=... (cd packages/db && pnpm exec prisma validate)  # exit 0
node --env-file-if-exists=.env.yok -e 'process.exit(0)'  # exit 0 (dosya olmayan senaryo da denendi)
```

(Not: `.env` zaten diskte vardı ve dokunulmadı; `DATABASE_URL` enjeksiyonu yalnızca
`prisma validate`'in şema dışı ortam çözümlemesini izole etmek için; ST-7'nin kendi `.env`
taşıma probuna ek, tamamlayıcı bir doğrulama.)

**Negatif senaryo (sahte yeşil dedektörü, A-V20) — kasıtlı bozma testi:**
`pnpm exec turbo run test --dry=json | jq -r '.tasks[] | select(.task=="test") | "\(.package): \(.command)"'`
çalıştırıldı: **filtre olmadan** 11 paketin **8'i** `<NONEXISTENT>` komutuyla görünüyor (yalnızca
api/db/errors gerçek `vitest run` komutuna sahip). Guard'ın filtresi
(`.command != "<NONEXISTENT>"`) bu 8 sahte "test sahibi"ni eliyor ve gerçek kümeyi
(`@arkesoft/api, @arkesoft/db, @arkesoft/errors`) `ci-expected-test-packages.txt` ile **birebir**
eşleştiriyor — Task'ın A-V20 bulgusu **doğrulandı**, filtre gerçekten gerekli ve çalışıyor.

### AC6 — PASS (talimat kapsamında sınırlı doğrulama; `pnpm release:version` KOŞULMADI)

- `.changeset/config.json`: `fixed` grubu **9 üye** (`admin, api, config, db, errors,
integrations, storefront, superadmin, ui`) ✅, `privatePackages: { version: true, tag: false }` ✅.
- `scripts/sync-platform-version.ts` üç modu uyguluyor: `type Mode = { kind: 'collect' } |
{ kind: 'apply' } | { kind: 'check' }` + exhaustive `switch` + `assertNever(mode)` (satır 382-432).
  `any` yok; tek `as` kullanımı (satır 272) **Zod `.parse()` çağrısının hemen ardından**
  (orijinal nesnenin anahtar sırasını/girintisini korumak için — CLAUDE.md §2'nin "yalnızca
  runtime doğrulamasından hemen sonra" şartına uyuyor).
- `node scripts/sync-platform-version.ts --check` → **exit 0**, gerçek çıktı:
  ```
  UYARI: fixed grup içi sürüm sapması var: 0.0.1, 0.0.3, 0.0.4
  --check: sürüm tutarlılığı doğrulandı.
  ```
  Bu, Task dosyasının "bugün 0.0.1↔0.0.4 sapması var ama kök=max=0.0.4 → bugün yeşil geçer"
  iddiasıyla **birebir** örtüşüyor.
- Kök `package.json` sürümü hâlâ `0.0.4` (mutasyona uğramamış), `.changeset/` dizininde
  `config.json` dışında dosya yok, `git diff --stat CHANGELOG.md` boş → ST-5'in dry-run'ının
  **geri alındığı** dolaylı olarak doğrulandı (mutasyon kalıntısı yok).

**Not (düşük önemli gözlem, bulgu değil):** AC6'nın ileri yönlü (0.0.4→0.0.5 kesme + CHANGELOG
girdi ekleme + bayt-bayt 1-26. satır koruması) ham komut çıktısı/diff Task dosyasında **anlatı**
biçiminde var, ham log yapıştırılmamış. Talimat bu AC için `pnpm release:version`'ı tekrar
koşturmamı **açıkça yasakladığından** ve denetim kapsamını yapılandırma dosyası + `--check` ile
sınırladığından, bu bir FAIL/bulgu gerekçesi yapılmadı; yalnızca not olarak kaydedildi.

### AC8 — PASS

- `grep -niE "pull_request|workflow_dispatch|schedule" .github/workflows/release.yml` → **boş**.
- `release.yml`: `on: push: branches: [main]` — tek tetikleyici, teyit edildi (satır 10-12).
- `ci.yml`'in `pull_request:` tetikleyicisi **filtresiz** (`paths`/`paths-ignore`/`branches` yok,
  satır 9-11) — K-B2/architect risk #1 ile uyumlu (base-dalı tuzağı önleniyor).
- `pull_request_target` repo genelinde **hiç yok** (`grep -rn` boş).
- `container:` anahtarı `.github/workflows/ci.yml` ve üç composite action'da **hiç yok**.
- `actionlint` (resmî 1.7.12 ikili, önceden SHA256 doğrulanmış, ST-6/ST-7'nin bıraktığı
  `$TMPDIR/actionlint-st6/actionlint`) `.github/workflows/*.yml` üzerinde çalıştırıldı:
  **exit 0, 0 bulgu.**

### AC13 — PASS

### AC10 (şablon içeriği) — PASS

`.github/pull_request_template.md` yedi alan içeriyor: (1) ROADMAP versiyonu `[vX.Y.Z]`,
(2) kabul kriteri çıktısı, (3) tenant izolasyon kontrol listesi (CLAUDE.md §7, 9 madde),
(4) Changeset eklendi/muaf, (5) UI değişikliği/ekran görüntüsü, (6) `ci-gate` yeşil mi,
(7) **"Yeni bir CI job'u eklediysen `ci-gate.needs` listesine eklendi mi?"** — R-7
karşı önlemi birebir maddede. Uyarı ayağı (PR gövdesinde `[vX.Y.Z]` yoksa annotation)
**BEKLEMEDE — ST-9 kanıtı**.

### AC12b — PASS (ST-1'in probu tekrarlanmadı, script birebir okundu)

`packages/db/package.json` `build` script'i:

```
mkdir -p dist && find dist -mindepth 1 -maxdepth 1 ! -name generated -exec rm -rf {} + && tsc -p tsconfig.build.json --declaration --declarationMap
```

`rm -rf dist &&` öneki **içermiyor** — K-B6b kararına birebir uyuyor; `dist/generated`
(Prisma istemcisi) dizin-düzeyinde korunuyor.

### AC12c — PASS

`packages/config/package.json`:

- `dependencies`: `{ zod: catalog: }` — yalnızca zod ✅
- `devDependencies`: `@eslint/js`, `eslint-config-prettier`, `globals`, `typescript-eslint`
  (+ `eslint`, `@types/node`, `typescript`) ✅ — dört lint paketi burada
- `peerDependencies`: `{ eslint: >=10.0.0, typescript: >=5.9.0 <6.1.0 }` — **değişmemiş** ✅

`pnpm list --prod --depth=Infinity --filter @arkesoft/db 2>&1 | grep -iE "eslint-js|eslint-config-prettier|globals|typescript-eslint"`
→ **boş / exit 1** — dört paket `@arkesoft/db`'nin üretim bağımlılık ağacında **yok**.

### Eksik senaryolar — ek denetim (yerel olarak doğrulanabilenler)

1. **`ci-gate` varsayılan-reddet gerçekten varsayılan-reddet mi? — DOĞRULANDI, bulgu yok.**
   Satır 525-562: `case "$result" in success|skipped) ;; *) ok=false ;; esac` — izinli küme
   dışındaki **her** değer (`failure`, `cancelled`, `timed_out`, boş, bilinmeyen gelecekteki bir
   değer) `*)` dalına düşüp `ok=false` yapıyor. `contains(needs.*.result, 'failure')` deseni
   **kullanılmamış** — görev talimatındaki "high bulgu" senaryosu gerçekleşmemiş.
2. **`ci-gate.needs` sekiz job adını birebir içeriyor mu? — DOĞRULANDI.**
   `grep -nE "^  [a-z-]+:$"` ile `ci.yml`'deki iş adları çıkarıldı: `plan, repo, guards, api,
admin, superadmin, storefront, shared, ci-gate` (9 iş). `needs:` listesi ci-gate hariç
   diğer sekizini **birebir** içeriyor. Eksik/fazla ad yok.
3. **`plan`'ın fail-open'ı sessiz mi? — HAYIR, görünür.** Satır 116-135: `fail_open` bayrağı
   `$GITHUB_STEP_SUMMARY`'ye açık metinle yazılıyor ("**fail-open devrede**: ...").
   PO riski #3'ün "ci-gate yeşilliği AC1 kanıtı DEĞİLDİR" uyarısı doğru — fail-open durumunda
   tüm hatlar `true` olur ve `ci-gate` yeşil kalabilir ama bu, AC1'in gerçekten kanıtlandığı
   anlamına gelmez; bu ayrım ST-9'un PR-A/PR-B okumasında **mutlaka** gözetilmeli (kayıt amaçlı
   not, bulgu değil — mekanizma doğru kurulu).
4. **AC7'nin uyarı mekanizması job'u sert kırıyor mu? — HAYIR.** Satır 327-343:
   `set +e; pnpm changeset status --since "origin/$BASE_REF"; status=$?; set -e` ile exit kodu
   **yakalanıp** değişkene atanıyor, `::warning::` basılıyor, adım **başarı** ile bitiyor
   (açık `exit` çağrısı yok). `continue-on-error` kullanılmamış (PM yasağına uyulmuş).
5. **`api` job'unda `container:` var mı? — HAYIR.** Doğrulandı (yukarı, AC8 altında).
6. **`pull_request` tetikleyicisinde `paths:`/`paths-ignore:`/`branches:` var mı? — HAYIR.**
   `ci.yml` satır 9-11: `pull_request:` (anahtar altında hiçbir alt alan yok).
7. **`pull_request_target` var mı? — HAYIR.** Doğrulandı (yukarı).
8. **`setup-workspace`'in `create-env` girdisi opsiyonel mi, `guards`/`plan` onu kullanmıyor mu?
   — DOĞRULANDI.** `create-env` varsayılan `'true'`; `plan` (satır 45) ve `guards` (satır 197)
   açıkça `'false'` veriyor. `repo` job'u (env:check'in kendisi `.env` gerektirdiği için)
   varsayılanı (`true`) kullanıyor — bu doğru, AC12a'nın konusu yalnızca `guards`.
9. **`prepare-db`'nin `db:seed` adımı `pnpm db:seed`'i çağırıyor mu? — DOĞRULANDI.**
   `.github/actions/prepare-db/action.yml` üçüncü adım: `run: pnpm db:seed`. Kanıtın kendisi
   (exit 0, gerçek CI koşumunda) **BEKLEMEDE — ST-9 kanıtı** (AC12d).
10. **Beşli kapının tek tanım yeri — DOĞRULANDI, sapma yok** (bkz. AC3 bölümü yukarıda).

## Kasıtlı bozma testleri (şüpheli yerler)

1. **`sync-platform-version.ts --check` — "yeni paket drifti" kuralı gerçekten çalışıyor mu?**
   `.changeset/config.json`'dan `@arkesoft/ui`'yi geçici olarak `fixed` listesinden çıkardım:

   ```
   HATA: paket "@arkesoft/ui" ne fixed grupta ne bilinen bağımsız kümede (yeni paket drifti).
   exit(drift)=1
   ```

   Dosya `/tmp/config.json.bak`'tan birebir geri yüklendi, `diff` ile **bayt-bayt aynı**
   doğrulandı, ardından `--check` tekrar **exit 0** verdi. **Kural gerçekten egzersiz
   ediliyor, beyan değil.**

2. **AC13 negatif kriteri — jeton listesi gerçekten taranıyor mu, yoksa her zaman mı geçiyor?**
   Tarama hedefine **kasıtlı olarak** `ci-forbidden-tokens.txt`'nin kendisini dahil ettim →
   8 jetonun hepsi eşleşti (`self-match-exit=0`, bkz. yukarı AC13). Gerçek `guards` taraması
   bu dosyayı **hedefe dahil etmiyor** (`find .github/workflows .github/actions -name '*.yml'`)
   → eşleşme yok. Bu, R-6'nın **gerçekten** doğru kurulduğunun negatif kanıtı: tarama mekanizması
   aktif ve hassas (yanlış kurulsaydı kendi kendini eşlerdi), ama gerçek hedef onu dışlıyor.

3. **A-V20 filtresi (sahte yeşil dedektörü) — filtre olmadan ne olurdu?**
   Filtresiz çıktıda 11 paketin **8'i** `<NONEXISTENT>` komutuyla "test sahibi" sayılırdı
   (bkz. yukarı AC12a) — filtrenin gerçekten gerekli olduğu ve doğru çalıştığı kanıtlandı.

4. **`changeset status --since <ref>` — gerçek bir ata (ancestor) referansla mı, yoksa
   ilişkisiz bir referansla mı çöküyor?** Yerel repo içindeki gerçek bir ata commit'i
   (`89eae36`) ile `--since` verildiğinde **temiz, kontrollü** "no changesets found" mesajı
   ve `exit 1` (yığın izi YOK) alındı — AC7'nin CI adımının `set +e / status=$? / set -e`
   ile yakaladığı tam olarak bu durum. İlişkisiz bir `origin/main` referansıyla denendiğinde
   (benim kendi deneysel fetch'imin yarattığı, bu repoyla **ortak atası olmayan** bir durum)
   `getDivergedCommit` gerçek bir **yığın izi** (stack trace) ile çöktü — ancak bu, ST-9'un
   gerçek PR senaryosunu (base = `chore/ajan-altyapisi`, PR head'in **gerçek atası**) temsil
   etmiyor; benim deneyimin yapay bir yan etkisi. **Bulgu olarak yazılmadı** çünkü gerçek
   senaryoyu yansıtmıyor, ama ST-9 sırasında Orkestratör'ün **gerçek `git fetch` çıktısını**
   gözlemlemesi önerilir (düşük risk notu, RİSKLER'e taşındı).

---

## KABUL KRİTERİ EŞLEMESİ (tur 1)

| AC                           | Durum                                                                              | Kanıt                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1                          | **BEKLEMEDE — ST-9 kanıtı**                                                        | gerçek PR gerekli                                                                                                                                             |
| AC2                          | **BEKLEMEDE — ST-9 kanıtı**                                                        | gerçek PR gerekli                                                                                                                                             |
| AC3 (yerel ayak)             | **PASS**                                                                           | lint 15/15, typecheck 15/15, build 12/12, test 212/0/0, format:check temiz, env:check 17 değişken — hepsi gerçekten koşturuldu                                |
| AC3 (CI ayağı)               | **BEKLEMEDE — ST-9 kanıtı**                                                        | —                                                                                                                                                             |
| AC4                          | **PASS (kısmi, talimat kapsamı)**                                                  | 5 çağrı yeri `existsSync`/`--env-file-if-exists` doğrulandı + guards probu yerel tekrarlandı (4/4 exit 0)                                                     |
| AC4 (CI ayağı)               | **BEKLEMEDE — ST-9 kanıtı**                                                        | —                                                                                                                                                             |
| AC5 (grep)                   | **PASS**                                                                           | `node-version:` yok, `node-version-file: .nvmrc` var, `.nvmrc`=24, sürüm iddiası kodu doğrulandı                                                              |
| AC5 (CI ayağı)               | **BEKLEMEDE — ST-9 kanıtı**                                                        | —                                                                                                                                                             |
| AC6                          | **PASS (talimat kapsamında sınırlı)**                                              | config 9 üye + privatePackages doğru, 3 mod discriminated union, `--check` exit 0 (gerçek çıktı eşleşti), kasıtlı bozma testiyle drift kuralı egzersiz edildi |
| AC7 (mekanizma)              | **PASS (mekanizma incelemesi)**                                                    | `::warning::` + exit-kod yakalama doğrulandı, sert kırma yok                                                                                                  |
| AC7 (iki koşum kanıtı)       | **BEKLEMEDE — ST-9 kanıtı**                                                        | —                                                                                                                                                             |
| AC8                          | **PASS**                                                                           | release.yml tek tetikleyici, `pull_request_target` yok, `container:` yok, actionlint 0 bulgu (resmî 1.7.12, önceden SHA256 doğrulanmış)                       |
| AC9 (mekanizma)              | **PASS**                                                                           | varsayılan-reddet `case` deseni doğru (allow-list), `contains()` kısayolu kullanılmamış, `needs` 8 ismi birebir içeriyor                                      |
| AC9 (success+failure koşumu) | **BEKLEMEDE — ST-9 kanıtı**                                                        | —                                                                                                                                                             |
| AC10 (şablon içeriği)        | **PASS**                                                                           | 7 alan, 7.si `ci-gate.needs` maddesi                                                                                                                          |
| AC10 (uyarı ayağı)           | **BEKLEMEDE — ST-9 kanıtı**                                                        | —                                                                                                                                                             |
| AC11                         | **ST-9/release/docs kapsamı — bu turda denetlenmedi** (PO riski #5: gate görmüyor) | docs henüz [8]'de yazılmadı                                                                                                                                   |
| AC12a                        | **PASS**                                                                           | 4 adımlık guards probu yerel tekrarlandı, hepsi exit 0                                                                                                        |
| AC12b                        | **PASS**                                                                           | script `rm -rf dist` içermiyor, `find`-tabanlı budama doğrulandı                                                                                              |
| AC12c                        | **PASS**                                                                           | 4 lint paketi devDependencies'te, zod dependencies'te, peerDeps değişmemiş, `pnpm list --prod` boş                                                            |
| AC12d                        | **BEKLEMEDE — ST-9 kanıtı**                                                        | mekanizma (`prepare-db` → `pnpm db:seed`) doğrulandı, CI exit 0 kanıtı yok                                                                                    |
| AC13                         | **PASS**                                                                           | 8 jeton `.yml`/`.yaml` dosyalarında yok, R-6 dışlaması kanıtlandı (self-match testi)                                                                          |

**Karşılıksız kriter yok** — tüm 13 AC bir denetim satırına eşlendi (bazıları yapısal olarak
BEKLEMEDE, hiçbiri atlanmadı).

---

## ÖLÇÜMLER

- **Denetlenen AC sayısı:** 13/13 (6'sı + AC4/AC5/AC12d'nin CI ayakları talimat gereği
  BEKLEMEDE, AC11 bu turda kapsam dışı — PO riski #5)
- **PASS:** AC3(yerel), AC4(kısmi), AC5(grep), AC6, AC7(mekanizma), AC8, AC9(mekanizma),
  AC10(şablon), AC12a, AC12b, AC12c, AC13 → **12 madde**
- **BEKLEMEDE — ST-9 kanıtı:** AC1, AC2, AC3(CI), AC4(CI), AC5(CI), AC7(iki koşum), AC9(success+failure), AC10(uyarı), AC12d → **9 madde**
- **Kapsam dışı bu turda:** AC11 (gate görmüyor, release [9]'a düşüyor)
- **Bulgu dağılımı:** critical 0 · high 0 · medium 0 · low 0 → **BULGULAR: yok**
- **Koşturulan komut sayısı:** 20+ (lint, typecheck, build, format:check, env:check, test,
  actionlint, grep×10+, `sync-platform-version.ts --check`×3 (1 kasıtlı bozma dahil),
  `pnpm list --prod`, `changeset status` (3 varyant), `turbo run test --dry=json`,
  guards AC12a probu 4 adım)
- **Test sayıları:** `pnpm test` → **212 passed, 0 failed, 0 skipped** (errors 35 + db 65 + api 112) — ST-7'nin iddiasıyla birebir eşleşti, yeniden koşturuldu (tek sefer)
- **Kasıtlı bozma testleri:** 3 (sync-platform-version drift kuralı, AC13 self-match,
  changeset status ata-referans davranışı) — hepsi beklenen şekilde davrandı
- **Flaky kontrolü:** `pnpm test` bir kez koşturuldu (talimat: zaten ST-7 tarafından
  sıfırdan koşuldu, tekrar gerekmiyor); tekrar koşum yapılmadığı için flaky karşılaştırması
  **yapılmadı** — gözlemlenen tek koşumda 0 failed/0 skipped.

---

## BULGULAR

yok

## RİSKLER / NOTLAR (gate FAIL kuralına dahil değil, bulgu değil)

1. ST-9 sırasında Orkestratör'ün AC7'nin `git fetch origin "$BASE_REF" --depth=1` adımını
   **gerçek PR bağlamında** gözlemlemesi önerilir — benim deneysel testimde ilişkisiz bir
   referansla (`origin/main`, ortak atası olmayan) `changeset status --since` bir yığın izi
   ile çöktü; gerçek ST-9 senaryosunda base (`chore/ajan-altyapisi`) PR head'in **gerçek atası**
   olacağı için bu durumun oluşmaması beklenir, ama ST-9 raporu bu adımın çıktısını açıkça
   göstermeli (sessizce "çalıştı" denmemeli).
2. AC11 bu gate'in remit'inde değil (PO riski #5) — `docs/development.md` henüz [8]'de
   yazılmadı; `release` [9] ve `qa` tur 2 bunu kontrol listesine almalı.
3. AC6'nın ileri-yönlü (0.0.4→0.0.5 + CHANGELOG girdisi) ham komut çıktısı Task dosyasında
   yalnızca anlatı biçiminde var; talimat `pnpm release:version`'ı tekrar koşturmamı
   yasakladığı için bu bir bulgu olarak yazılmadı, ama kayıt altına alınıyor.
