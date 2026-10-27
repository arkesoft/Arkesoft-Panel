# T-003 — `solid` gate · tur 2

Tarih: 2026-10-27
Sürüm: ROADMAP v0.0.12 (platform 0.0.4 → 0.0.5)
Dal: `chore/ajan-altyapisi` (değişiklikler commit edilmemiş)

```
GATE: solid
SONUÇ: FAIL
```

FAIL gerekçesi: `AGENT_BASELINE.md` §4 — **4 adet `medium`** bulgu (eşik: 3). `critical`/`high`
bulgu **yok**.

**Tur 1'in dört `medium`'u da kapandı.** Bu turun dört `medium`'u **yeni**: üçü düzeltmelerin
kendisinin doğurduğu borç (iki sessiz atlama yolu + bir yapılandırma ikizleşmesi), biri tur 1
M2'nin **kapanmayan ikinci yarısı** (türetim düzeltildi, tüketici filtresi düzeltilmedi).

> **Yöntem notu — dürüstlük şartı:** bu turda **kabuk erişimim yoktu**; hiçbir komut
> çalıştırılmadı. Tüm bulgular statik okuma + araç dokümantasyonu temelli. Üç bulgu
> (M2-2, M2-3, M2-4) `devops` tarafından tek komutla doğrulanabilir; her birinin yanına
> doğrulama komutu yazıldı.

---

## 1. Tur 1 bulgularının durumu

### Dört `medium` (FAIL'i üretenler)

| #      | Konu                                           | Durum                                  |
| ------ | ---------------------------------------------- | -------------------------------------- |
| **A1** | `ci-gate` job listesi iki yerde                | **kapandı**                            |
| **A2** | `shared` hattı elle yazılmış paket regex'i     | **kısmen kapandı** → kalıntı: **M2-4** |
| **A3** | fail-open'ın üçüncü koşulu (`base` çözülemedi) | **kapandı**                            |
| **A4** | `scripts/` hiçbir mekanik kontrolde değil      | **kapandı** → kalıntı: **M2-3**        |

**A1 — kapandı.** `ci.yml:716` artık `done < <(jq -r 'keys[]' /tmp/needs.json)` ile listeyi
`toJSON(needs)`'ten türetiyor; `ci.yml`'de **elle yazılmış ikinci job listesi kalmadı** (tüm
dosyada `for job_name in …` deseni yok). İzinli küme `ci.yml:713`'te hâlâ
`success|skipped`, `*)` dalı `ok=false` → varsayılan-reddet korunuyor. Orkestratörün
sorusuna cevap: **`toJSON(needs)` `needs:`in HER üyesini içerir** (atlanan job'lar
`"result": "skipped"` ile görünür), dolayısıyla türetim kapsam olarak tamdır — açılan yeni
boşluk türetimin _kapsamı_ değil, **jq çağrısının denetlenmemesi** (→ M2-1).

**A2 — kısmen.** `ci.yml:141` artık elle regex yerine `--dry=json`'dan türetiyor
(`.tasks[] | select(.directory | startswith("packages/")) | .package`). Elle yazılmış paket
listesi gitti ✓. Ama kümenin **tüketicisi** (`ci.yml:665` → `filter: './packages/*'`) elle
yazılmış tek seviyeli bir glob olarak kaldı; türetim `packages/themes/*`'ı kapsıyor, filtre
kapsamıyor (→ **M2-4**). Tur 1 M2'nin metni `packages/themes/*`'ı açıkça sayıyordu, bu yüzden
"kapandı" diyemiyorum.

**A3 — kapandı.** `ci.yml:94`'te `root_rule_unresolved` bayrağı var; `git diff` başarısız
olursa (`:116`) ve base/head boşsa (`:119`) ayrı ayrı kuruluyor, `:145`'te fail-open'ın
**üçüncü koşulu** olarak okunuyor ve `:155-157`'de özete **ayrı gerekçe satırı** yazılıyor.
Artık ne sessiz yutma var ne de "her şey normal" diyen yanlış özet. `git diff`'in stderr'i
`/tmp/plan-diff.log`'a alınıyor ve gerekçe satırı bu yola işaret ediyor ✓.

**A4 — kapandı (kalıntısı var).** `guards`'a iki adım eklendi: `ci.yml:406-421` (tsc
`--erasableSyntaxOnly`) ve `ci.yml:423-433` (ESLint). `scripts/eslint.config.mjs` ve
`scripts/tsconfig.json` **makul**: ikisi de paylaşılan preset'i (`@arkesoft/config`)
genişletiyor, yeni bağımlılık eklemiyor, gerekçeleri Türkçe yorumla yazılmış. ESLint adımı
A4'ün asıl yükünü gerçekten taşıyor (`strictTypeChecked` + `no-explicit-any` +
`explicit-module-boundary-types`, tip bilgisi `scripts/tsconfig.json` programından geliyor).
Kalıntı: **tsc adımı `scripts/tsconfig.json`'u hiç kullanmıyor** → `strict` kapalı (→ M2-3).

`typeRoots: ["../packages/config/node_modules/@types"]` değerlendirmesi: **kabul edilebilir,
bulgu değil** (yalnızca kırılganlık notu → L6). Gerekçe: (a) `@types/node`, `packages/config`
paketinin **beyan edilmiş** devDependency'si (`packages/config/package.json:39`), dolayısıyla
her `pnpm install --frozen-lockfile` onu o konuma kurar; (b) yeni kök bağımlılığı eklemek bu
turun kapsamı dışıydı (CLAUDE.md §2 onay şartı); (c) karar Türkçe yorumla iki dosyada
belgelenmiş. Kalıcı çözüm (kök `devDependencies`'e `eslint` + `@types/node`, ya da `scripts/`'i
gerçek workspace paketi yapmak) **T3-1** ile birlikte ele alınmalı.

### Lowlar

| #       | Konu                                                      | Durum                                                                                                                                                                                                                                                     |
| ------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C5**  | `guards` uyarı adımlarına `if: always()`                  | **kapandı** — `ci.yml:473` ve `ci.yml:492`: `always() && github.event_name == 'pull_request'`                                                                                                                                                             |
| **C6**  | Üç inline jeton `.txt`'ye taşındı                         | **kapandı** — `ci-forbidden-tokens.txt:59-61`; `container:`/`pull_request_target` kontrolleri silindi, AC5 adımında yalnızca **pozitif iddia** kaldı (`ci.yml:309`) ve o adımda bölünmüş string hilesi **kalktı** (`ci.yml:305-308` gerekçesini yazıyor)  |
| **C7**  | `.env` üretimi tek sahipte                                | **kapandı** — `prepare-db/action.yml`'de `env:init` **yok**, sahiplik `setup-workspace:74-77`'de. **R-9 korunuyor:** `guards` (`ci.yml:239-242`) `create-env: 'false'` ile çağırıyor ve `prepare-db`'yi hiç çağırmıyor → `guards` hâlâ `.env` üretmiyor ✓ |
| **C8**  | `release.yml` `setup-workspace` kullanıyor                | **kapandı** — `release.yml:49-52`; AC5 Node sürüm iddiası artık sürüm akışında da koşuyor. Bonus: `ignore-scripts: 'true'` ile en az ayrıcalık                                                                                                            |
| **C9**  | `parseSemver` ön-sürümde hata fırlatıyor                  | **kapandı** — `sync-platform-version.ts:107-127`: `(.*)$` ile ek **açıkça yakalanıyor** ve `rest.length > 0` ise hata fırlıyor; sessiz yok sayma yok                                                                                                      |
| **C10** | Ölü `dir` alanı                                           | **kapandı** — `:84` `WorkspacePackage = { name; version }`                                                                                                                                                                                                |
| **C11** | `pa`/`pb`                                                 | **kapandı** — `:132-133` `left`/`right`                                                                                                                                                                                                                   |
| **C12** | Üst seviye catch stack'i koruyor                          | **kapandı** — `:460` `error.stack ?? error.message`                                                                                                                                                                                                       |
| —       | `packages/db/package.json:29` `clean`'in `generated` yolu | **`no_change_needed`** (aşağıya bakın)                                                                                                                                                                                                                    |
| —       | `WORKSPACE_PACKAGE_GROUP_DIRS` elle eşleme (`:54`)        | **açık** — düzeltme istenmemişti, borç olarak duruyor                                                                                                                                                                                                     |
| —       | `as`'i type guard ile kaldırma önerisi (`:289`)           | **açık** — isteğe bağlı iyileştirme, borç değil                                                                                                                                                                                                           |

### Yanlış öncüle dayanan tur 1 bulgusu — `no_change_needed`

`packages/db/package.json:29` (`clean` → `generated`) bulgusu **geri çekildi**. Bağımsız olarak
doğruladım: `packages/db/prisma/schema.prisma:23` → `output = "../generated"` (`prisma/`'ya
göre çözülür → `packages/db/generated`, **kök**), `.gitignore:26` → `packages/db/generated`
(bilinen, kasıtlı artefakt, hatta sondaki `/`'un neden olmadığı yorumla açıklanmış). İki ayrı
gerçek konum var: kök `generated/` = Prisma'nın ham TS çıktısı, `dist/generated/` = onun
derlenmiş hâli (`generate` = `prisma generate && tsc -p tsconfig.prisma.json`). `clean`'in
sildiği **üç yol da gerçek**; önerim uygulansaydı `clean` ham Prisma kaynağını artık
temizlemeyecekti. `db` ajanının **reddi doğru karar**.

Eklenen yorum (`package.json:29` sonundaki `#` açıklaması) **yeterli**: iki aşamalı boru
hattını adlandırıyor, `build`'in `dist/generated`'ı koruyan budama mantığıyla
karıştırılmaması gerektiğini söylüyor. Yalnızca taşıyıcı biçim hakkında bir `low` var (L5).

---

## 2. Bu turda değerlendirilip bulgu YAZILMAYAN kalemler

- **`concurrency: cancel-in-progress: true` (`ci.yml:23-25`) — bulgu değil.** "`ci-gate`
  zorunlu check olursa iptal edilen koşum bekliyorda takılır mı?" sorusunun cevabı **hayır**,
  üç sebepten: (1) grup anahtarı `ci-${{ github.ref }}` → `pull_request` olayı
  `refs/pull/N/merge`, `push` olayı `refs/heads/<dal>` üretir; **farklı gruplar**, birbirlerini
  iptal etmezler. (2) İptal yalnızca **aynı ref için daha yeni bir koşum başladığında** olur;
  o anda iptal edilen koşumun SHA'sı artık head değildir, dal koruması head SHA'yı
  değerlendirir. (3) İptal edilen check "pending" değil **"cancelled"** raporlanır — zorunlu
  check olarak **kırmızı** sayılır, sonsuza dek beklemez. Ayrıca `ci-gate`'in `if: always()`'i
  burada yardımcı olmaz (run seviyesi iptal `always()`'i de iptal eder) ama buna ihtiyaç da yok.
- **AC13 jeton taramasının genişlemesi yanlış pozitif ÜRETMİYOR (bugün).** 15 jetonun
  tamamını dört hedef dosyada (`ci.yml`, `release.yml`, üç `action.yml`) aradım: **0 eşleşme**.
  En yakın iki geçiş kasıtlı olarak güvenli: `setup-workspace/action.yml:36` →
  `node-version-file:` (`grep -F 'node-version:'` iki nokta yüzünden eşleşmez) ve
  `ci.yml:301`/`ci.yml:534` → Türkçe iyelik ekiyle "container'ı" (`container:` değil). Bu
  genişleme bir **kısıt** doğuruyor ama hata değil → L4.
- **Katman ihlali YOK.** `scripts/sync-platform-version.ts` hâlâ hiçbir `@arkesoft/*` paketi
  **import etmiyor** (yalnızca `node:fs`, `node:path`, `node:url` + `zod`; `zod` kök
  `package.json:45`'te beyan edilmiş) → bootstrap bağımsızlığı korunuyor ✓. `scripts/`'in
  `@arkesoft/config`'e bağımlılığı **yalnızca yapılandırma düzeyinde** (`extends` +
  `eslint.config.mjs` import'u), çalışan script'in bağımlılık grafiğinde değil. Orkestratörün
  istediği ayrım: **yapılandırma yolu bağımlılığı ≠ import bağımlılığı**; ilki `scripts/` →
  `packages/*` yönünde ve izinli, ikincisi yok. Döngüsel bağımlılık yok.
- **`plan.decide` bloğunun büyümesi (`ci.yml:84-199`, ~116 satır, 12 değişken)** — tek
  sorumluluk ihlali saymıyorum: blok tek bir karar üretiyor (hangi hatlar koşacak) ve GitHub
  Actions'ta pratik birim adımın kendisi. Mantığı bir dosyaya taşımak (`scripts/plan-*.sh`)
  yeni bir yüzey + yeni bir mekanik kontrol gerektirir → kapsam genişletmesi. `ÖLÇÜMLER`'e
  ölçüm olarak kaydedildi.
- **Bilinçli desenler (yeniden raporlanmadı):** üç yapılandırma dosyasındaki `existsSync`
  tekrarı (K-B4), `apps/api/vitest.config.ts` import sırası, `ci.yml:335-337`'deki bölünmüş
  jeton string'i (kontrolün kendi `run:` bloğu tarama hedefinde — hile **gerekli**).

---

## BULGULAR

### medium

- **[SEV: medium]** `.github/workflows/ci.yml:708-722` — A1'in düzeltmesi **fail-closed bir
  yolu fail-open'a çevirdi**. Job adları `done < <(jq -r 'keys[]' /tmp/needs.json)` ile **süreç
  ikamesinden** (process substitution) okunuyor; süreç ikamesinin çıkış kodu `set -euo pipefail`
  tarafından **görülmez**. `jq` çağrısı başarısız olursa (ikili yok, bozuk/boş JSON) `while`
  döngüsü **sıfır kez** döner, `ok=true` kalır, özet tablosu boş yazılır ve adım
  `"ci-gate: tüm işler {success, skipped} kümesinde — PASS."` diyerek **0 ile çıkar**. Tur
  1'deki elle yazılmış liste bu senaryoda **fail-closed**'du (her ad için `result=null` →
  `*` dalı → `ok=false`). Tek toplayıcı check'in tasarım ilkesi açıkça "varsayılan-reddet"
  olduğu için bu bir standart ihlali. — **Düzeltme:** çıktıyı önce değişkene al (böylece
  `set -e` yakalar) ve boşluğa karşı iddia et:
  `job_names="$(jq -r 'keys[]' /tmp/needs.json)"` + `[ -n "$job_names" ] || { echo "::error::ci-gate: needs listesi türetilemedi."; exit 1; }` +
  `done <<< "$job_names"`. — `devops`
- **[SEV: medium]** `.github/workflows/ci.yml:141` — A2'nin düzeltmesi tur 1 M3'ün
  (**sessizce yutulan hata**) aynı sınıfını yeni bir yerde geri getirdi.
  `shared_names="$(… | jq -r '…' … | sort -u)"` çağrısının **çıkış kodu hiç okunmuyor**
  (`set -uo pipefail` var ama `-e` **yok**, atama da denetlenmiyor); stderr
  `/tmp/plan-shared-jq.log`'a yazılıp **kimse bakmıyor**. jq bu filtrede çökebilir: tek bir
  görev girdisinde `.directory` yok/`null` ise `startswith` `"null (null) cannot be matched"`
  ile hata verir — ve `turbo` `^2.11.10` aralığıyla kurulduğu için dry-run çıktısının şekli
  minör bir sürümde değişebilir. O durumda `shared_names` boş kalır, `schema_ok` hâlâ `true`
  olduğu için **fail-open DEVREYE GİRMEZ**, özete not düşülmez ve `shared` hattı **sessizce
  atlanır** (`ci-gate` `skipped`'ı yeşil sayar). Karşılaştırma: iki satır yukarıdaki
  `.packages[]` okuması `jq -re` + `schema_ok` ile **korunuyor** (`:129-132`) — yeni çağrı aynı
  disiplini almamış. — **Düzeltme:** jq'nun çıkış kodunu açıkça ele al ve *hata*yı *boş
  sonuç*tan ayır; hata → `schema_ok=false` (dolayısıyla fail-open + özete gerekçe), boş sonuç →
  `shared=false`. — **Doğrulama:** `printf '%s' "$raw_json" | jq -r '.tasks[] | .directory' | grep -c '^null$'`.
  — `devops`
- **[SEV: medium]** `.github/workflows/ci.yml:418-420` ile `scripts/tsconfig.json:11-16` —
  A4'ün tsc adımı **kaynak dosyayı komut satırında** veriyor; TypeScript'in belgelenmiş
  davranışı gereği _"girdi dosyaları komut satırında belirtildiğinde `tsconfig.json`
  **yoksayılır**"_. Sonuç: `scripts/tsconfig.json` bu adım tarafından **hiç okunmuyor** ve
  derleyici **varsayılanlarla** koşuyor → `strict: false`, `noUncheckedIndexedAccess: false`,
  `exactOptionalPropertyTypes: false`, `skipLibCheck: false`; ayrıca `--target es2024` preset'in
  `ES2023`'üyle çelişiyor. Üç sonucu var: (1) CLAUDE.md §4'ün zorunlu kıldığı katılık bu TS
  kaynak dosyasına **uygulanmıyor** — dosya tam da o katılık için yazılmış olmasına rağmen
  (`:115-122`, `:421-423` `undefined` korumaları yalnızca `noUncheckedIndexedAccess` altında
  anlamlı); (2) tek dosya için **iki ayrı derleyici yapılandırması** var ve sadece biri
  (ESLint'in `projectService` programı) katı — kırılgan `typeRoots` yolu da iki yerde
  (`ci.yml:419` + `scripts/tsconfig.json:15`) tekrarlanıyor; (3) `skipLibCheck` kaybı yüzünden
  `zod` veya `@types/node`'un bir yama sürümü `guards`'ı **bizim kodumuzla ilgisiz** bir sebeple
  kırmızıya çevirebilir (preset bunu `base.json:38`'de yorumla gerekçeleyerek açıkça kapatıyor).
  Ek risk — doğrulanmalı: `sync-platform-version.ts:276-279` (`const [version] = versions`
  `Set<string>`'ten geliyor → `string`; ardından `version === undefined`) **katı programda**
  TS2367 / `@typescript-eslint/no-unnecessary-condition` üretebilir; bugün yeşilse bunun
  sebebi tam olarak adımın katı olmaması olabilir. — **Düzeltme:** `erasableSyntaxOnly: true`'yu
  `scripts/tsconfig.json`'a taşı ve adımı tek satıra indir:
  `pnpm exec tsc -p scripts/tsconfig.json` (komut satırındaki bayrak listesi ve ikinci
  `typeRoots` tümüyse silinir; `*.tsbuildinfo` `.gitignore:15` ile zaten kapsanıyor). —
  **Doğrulama:** düzeltmeden sonra adımı yerel olarak koştur; TS2367 çıkarsa `:276-279`
  `const version = [...versions][0]` + mevcut `undefined` kontrolü ile düzeltilir. — `devops`
- **[SEV: medium]** `.github/workflows/ci.yml:141` ile `.github/workflows/ci.yml:665` — tur 1
  M2'nin **kapanmayan ikinci yarısı**: tetikleyici kümesi artık grafikten türetiliyor
  (`startswith("packages/")` → `packages/themes/modern` gibi **iç içe** paketleri de kapsar),
  ama o kümenin tüketicisi olan `shared` job'u hâlâ **elle yazılmış tek seviyeli** bir glob
  kullanıyor: `filter: './packages/*'`. turbo'nun filtre glob'unda `*` dizin ayırıcısını
  geçmediği için `packages/themes/*` altındaki bir paket değiştiğinde: `shared=true` olur, job
  koşar, `./packages/*` altındaki (değişmemiş, önbellekli) paketler yeşil döner ve job
  **success** raporlar — değişen tema paketi CI'da **hiç lint/typecheck/build görmez**,
  `ci-gate` yeşil kalır. `pnpm-workspace.yaml:9` `packages/themes/*`'ı **zaten** workspace
  globuna almış ve CLAUDE.md §3 iki tema paketini planlıyor, yani boşluk teorik değil
  planlanmış. `--check`'in "yeni paket drifti" kuralı bunu kapatmaz (o `.changeset/config.json`
  üyeliğini zorlar, `ci.yml`'e işaret etmez). — **Düzeltme:** filtreyi iki seviyeyi de
  kapsayacak şekilde genişlet (`filter: './packages/**'`) **veya** filtreyi aynı `--dry=json`
  kümesinden türet; `run-gates`'in tek değerli `filter:` girdisi ikinci bir filtre satırına izin
  vermiyor, bu yüzden glob genişletmesi en az dokunuşlu yol. — **Doğrulama:**
  `pnpm exec turbo run lint --filter='./packages/*' --dry=json | jq '.packages'` çıktısını
  tetikleyici türetiminin kümesiyle karşılaştır (bugün `packages/themes` diskte yok, bu yüzden
  doğrulama geçici bir boş tema paketiyle yapılmalı ya da bulgu v0.0.x tema sürümüne borç
  olarak taşınmalı). — `devops`

### low

- **[SEV: low]** `.github/workflows/ci.yml:141` ve `.github/workflows/ci.yml:170` —
  `shared_names` `.tasks[]` üzerinden türetiliyor; `.tasks[]` **görev grafiğinin tamamıdır** ve
  `turbo.json:12`'deki `dependsOn: ["^build", "generate"]` yüzünden **etkilenmeyen bağımlılıkları
  da içerir**. `apps/api` altında tek satır değişse bile `@arkesoft/{config,db,errors}#build`
  görevleri grafiğe girer → `shared=true`. Yani `shared` hattı artık pratikte **her uygulama
  değişikliğinde** koşuyor; `--affected` optimizasyonu bu hat için etkisiz. Yön güvenli
  (fazla koşmak, az koşmaktan iyidir) ama iki yan etkisi var: boşa CI dakikası ve `:170`'teki
  özet metninin **yanlış** olması ("`packages/` altında etkilenen paketler" — bunlar etkilenen
  değil, grafikteki paketler; CLAUDE.md §4 "yorum güncel ve doğru olmalı"). Not: devops'un
  "türetilen küme eski 7 paketle birebir aynı" ölçümü kök dosya değişikliği içeren bir diff'te
  alındığı için bu farkı göstermez. — **Düzeltme:** `.packages[]` ile kesiştir
  (`jq -r '[.packages[]] as $aff | .tasks[] | select((.package | IN($aff[])) and (.directory | startswith("packages/"))) | .package'`)
  ve özet metnini düzelt; ya da kesiştirmeden vazgeçilip metin "grafikte yer alan" olarak
  düzeltilsin. — `devops`
- **[SEV: low]** `.github/workflows/ci.yml:257` ile `.github/ci-forbidden-tokens.txt:51-65` —
  `min_expected_patterns=10` eşiği, kendi dosyasının başlığında **15 jetondan 8'inin
  silinmesi planlanmış** bir listeye karşı kurulmuş (`test:isolation` v0.0.13, `pnpm audit`
  v0.0.16, `test:e2e`+`playwright` v0.0.19, `test:contract` v0.0.22, `docker build`+
  `TURBO_TOKEN`+`TURBO_TEAM` v0.18.0). Aritmetik: v0.0.22'den sonra **tam 10** (sınırda),
  v0.18.0'dan sonra **7** → koruma kendi kendine kırmızıya döner ve `guards`'ı meşru bir
  sebeple bloklar. Kök sorun tasarımda: dosya **iki farklı sebeple değişen** iki kategoriyi
  (kalıcı yasaklar: `container:`, `node-version:`, `pull_request_target`, dört Prisma jetonu —
  **7 satır, asla silinmez**; geçici kapsam boşluğu işaretleri: **8 satır, sürümle silinir**)
  tek sayımla koruyor. Kırılma **gürültülü** ve mesajı kendini açıklıyor, bu yüzden `low`. —
  **Düzeltme:** dosyayı iki bölüme ayır ve korumayı sayım yerine **kalıcı alt kümeyi ada göre**
  iddia edecek şekilde yaz (ör. yedi kalıcı jetonun her birinin listede bulunduğunu doğrula);
  sayım eşiği tümüyle kalkar. — `devops`
- **[SEV: low]** `.github/workflows/ci.yml:679` — A1'den sonra denetlenen job kümesinin **tek**
  tanımı `needs:` satırı; `jobs:` altına eklenip `needs:`e eklenmeyen bir job hâlâ hiç
  okunmaz (tur 1'de "ters yön zaten güvenli" demiştim, bugün de güvenli — ama artık o yönü
  yakalayacak ikinci bir liste de yok). T-003'ün additive sözleşmesi bunu yazılı kurala
  bağlıyor; mekanik koruma yok. — **Düzeltme (isteğe bağlı, borç):** `guards`'a tek satırlık bir
  tutarlılık kontrolü — `ci.yml`'in `jobs:` anahtarları ⊆ `ci-gate.needs` ∪ `{ci-gate}`
  (actionlint bunu yapmıyor). — `devops`
- **[SEV: low]** `.github/ci-forbidden-tokens.txt:1-49` ile `.github/workflows/ci.yml:281` —
  tarama hedefi artık **tüm** `.github/workflows/*.yml` + `.github/actions/*/action.yml`.
  Bunun sonucu: bu 15 jeton o dosyaların **yorum metinlerinde de** birebir yazılamaz. Kısıt
  bugün bir yerde (`ci.yml:305-308`) belgelenmiş durumda ve `ci.yml:301`/`:534`'te Türkçe
  iyelik ekiyle dolaylı aşılmış — ama `.txt` başlığı bu kuralı **hiç söylemiyor**; başlık
  yalnızca kendi dosyasının hedef dışında olduğunu (R-6) anlatıyor. Beş yıl sonra bir yorum
  yazan kişi için keşfedilebilir değil. — **Düzeltme:** `.txt` başlığına bir satır: "bu
  jetonlar hedef dosyaların YORUMLARINDA da birebir yazılamaz; gerekirse dolaylı ifade
  kullanın (örnek: `ci.yml`)". — `devops`
- **[SEV: low]** `packages/db/package.json:29` — tur 1 bulgusu `no_change_needed` ile kapandı
  ve yerine eklenen Türkçe açıklama **içerik olarak doğru ve yeterli**; ama taşıyıcı biçim bir
  tuzak: açıklama script değerinin **içinde**, sonda bir `#` kabuk yorumu olarak duruyor
  (`rm -rf dist generated .turbo # …`). Bugün çalışıyor (pnpm `shell-emulator` kapalı, `.npmrc`
  bunu açmıyor → POSIX `sh`; yorum içindeki tek tırnaklar da ayrıştırılmıyor), ama ileride
  satırın **sonuna** bir şey eklemek isteyen (`&& rm -rf node_modules` gibi) o eklemenin
  sessizce yok sayıldığını fark etmez. — **Düzeltme:** açıklamayı `packages/db/README.md`'ye
  veya `prisma/schema.prisma`'nın `generator` bloğu yorumuna taşı; script değeri tek bir komut
  olarak kalsın. — `db`
- **[SEV: low]** `scripts/tsconfig.json:15`, `.github/workflows/ci.yml:419` ve
  `.github/workflows/ci.yml:432` — üç yerde `packages/config/node_modules` **içine** uzanılıyor
  (iki kez `@types` yolu, bir kez `.bin/eslint` ikilisi). Katman ihlali **değil** (yön doğru,
  çalışan script hâlâ hiçbir `@arkesoft/*` import etmiyor) ve bu turda **doğru takas**
  (alternatifi yeni kök bağımlılığı → onay gerektirir, kapsam dışı). Yine de bu, başka bir
  paketin **özel kurulum düzenine** beyan edilmemiş bir bağlılık: `@types/node`
  `packages/config`'in devDependency'si olmaktan çıkarsa ya da pnpm düzeni değişirse
  `guards`'taki iki adım anlaşılmaz bir hatayla kırılır. — **Düzeltme:** T3-1 ile birlikte
  kalıcı çözüm (kök `devDependencies`'e `eslint` + `@types/node`, **ya da** `scripts/`'i gerçek
  bir workspace paketi yapmak) — bu turda **değişiklik istemiyorum**, borç kaydı. — `devops`
- **[SEV: low]** `scripts/sync-platform-version.ts:54` — (**tur 1'den devrediyor, kapanmadı**)
  `WORKSPACE_PACKAGE_GROUP_DIRS` `pnpm-workspace.yaml:7-9` ile elle eşleniyor; glob değişirse
  keşif sessizce eksik kalır ve `--check` Kural 2'nin drift dedektörü körleşir. Düzeltme
  istenmemişti; borç olarak kayıtlı kalıyor. — `devops`
- **[SEV: low]** `scripts/` — (**T3-1, kapsam dışı**) birim testi hâlâ yok; üç mod, sentinel
  yokluğu, fixed grup sapması ve yeni ön-sürüm hatası (`:123-127`) davranış testi görmüyor.
  **Kapsam genişletmesi talep edilmiyor**; yalnızca borcun hâlâ açık olduğu kaydediliyor.
  Not: A4'ün iki adımı T-003.md:1031'deki T3-1 borcunun "kalıcı çözüm" tarifinin **tam olarak
  kendisi** — borç kaydı bu turdan sonra "kısmen kapandı (lint+tsc var, test yok)" diye
  güncellenmeli. — `devops`

---

## ÖLÇÜMLER

| Ölçüm                                                   | Değer                                                                                                                               |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Denetlenen dosya (bu tur)                               | **11** (+12 referans okuma)                                                                                                         |
| Komut çalıştırıldı mı                                   | **Hayır** — bu turda kabuk erişimi yoktu; tüm bulgular statik                                                                       |
| Tur 1 `medium` kapanışı                                 | **4/4** (A1 ✓, A2 kısmen → M2-4, A3 ✓, A4 ✓ → kalıntı M2-3)                                                                         |
| Tur 1 `low` kapanışı                                    | **8/11 kapandı** (C5–C12) · **1 `no_change_needed`** · **2 açık** (grup dizinleri, `as` alternatifi)                                |
| Yeni bulgu dağılımı                                     | critical 0 · high 0 · **medium 4** · low 6 (+2 devreden low)                                                                        |
| `any` kullanımı                                         | **0** (yalnızca `sync-platform-version.ts:90`'da açıklayıcı yorum)                                                                  |
| `@ts-ignore` / `@ts-expect-error` / `eslint-disable`    | **0**                                                                                                                               |
| `as` zorlaması                                          | **1** — `sync-platform-version.ts:289`, `parse` çağrısının (`:288`) hemen ardında → CLAUDE.md §2'ye uygun, gerekçesi yorumla yazılı |
| Silinemez (non-erasable) sözdizimi                      | **0** (`enum`/`namespace`/parametre özelliği/dekoratör yok)                                                                         |
| En büyük TypeScript fonksiyonu                          | `runCheck` — **63 satır** (`sync-platform-version.ts:333-395`)                                                                      |
| En büyük shell bloğu                                    | `plan.decide` — **~116 satır** (`ci.yml:84-199`); tur 1'de ~82 satırdı (+41%)                                                       |
| Dışa açılan fonksiyonların dönüş tipi                   | 15/15 açık ✓ (dosya hiçbir şey export etmiyor; tümü yerel)                                                                          |
| Boş `catch` / yutulan hata (TS)                         | **0**                                                                                                                               |
| Denetlenmeyen `jq` çağrısı (shell)                      | **2** → M2-1 (`ci.yml:716`), M2-2 (`ci.yml:141`)                                                                                    |
| Elle tutulan (grafikten türetilmeyen) paket/job listesi | **2** — `ci.yml:665` (`./packages/*` filtresi → M2-4), `script:54` (gerekçeli borç). Tur 1'de **4**'tü                              |
| AC13 jeton taraması — yanlış pozitif                    | **0/15** (dört hedef dosyada hiçbir jeton eşleşmiyor)                                                                               |
| Birim testi (`scripts/`)                                | **0** (T3-1, kapsam dışı)                                                                                                           |

## Orkestratöre notlar (bulgu değil)

- **M2-1 ve M2-2 aynı sınıfın iki örneği** (denetlenmeyen `jq`). İkisi birlikte tek bir
  düzeltme turunda kapatılabilir; ayrı bulgu yazılmasının sebebi farklı dosya/satır ve farklı
  düzeltme olmaları.
- **M2-3'ün düzeltmesi M2-3'ü kapatırken bir TS hatası açığa çıkarabilir**
  (`sync-platform-version.ts:276-279`). Bu beklenen ve istenen sonuçtur — bulgunun kendisi tam
  olarak "katı kontrol hiç koşmadı" demek. devops'a düzeltmeyi **yerel olarak koşturup** çıktıyı
  raporlaması söylenmeli; bu turda kabuk erişimim olmadığı için ben doğrulayamadım.
- **M2-4 bir sürüm borcuna taşınabilir.** `packages/themes/*` bugün diskte yok; `devops`
  filtreyi `./packages/**` yapmayı tercih etmezse, bulgu tema paketlerinin geldiği sürüme
  (ROADMAP) açık borç olarak taşınmalı — ama o sürümün kabul kriterine **yazılı** olarak
  girmeli, yoksa boşluk sessiz kalır.
- Tur 1'in iki notu hâlâ geçerli ve bu Task'ta kapanmadı: `.changeset/config.json` `fixed`
  grubunun 9 üyesi vs. PO'nun "11 üye" metni (gerçek doğru olan **9**), ve `CHANGELOG.md:26`
  sentinel metninin "Changesets bu çizginin altına yazar" demesi (yazan tek şey
  `scripts/sync-platform-version.ts`). İkisi de `docs`/`qa` yüzeyinde.
