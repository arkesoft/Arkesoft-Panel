# T-003 — `security` gate, tur 3 (son tur)

- **Tarih:** 2026-10-27
- **Sürüm:** ROADMAP v0.0.12
- **Dal:** `chore/ajan-altyapisi` (değişiklikler commit edilmemiş)
- **Yüzey (dar):** `ci.yml` AC13 adımı + `plan`/`ci-gate` fail-closed kalıpları,
  `release.yml` başlığı (`concurrency`/`timeout-minutes`),
  `.github/ci-forbidden-tokens.txt`, **yeni** `.github/ci-forbidden-tokens-permanent.txt`,
  `scripts/tsconfig.json`, `shared` job'unun `filter` girdisi
- **Tur:** 3 (artımlı — tur 2 raporu üzerine)

```
GATE: security
SONUÇ: PASS
```

FAIL kuralı (AGENT_BASELINE §4): 0 critical, 0 high, 0 medium, **3 low** → **PASS**.

Tur 2'nin 4 low'u: **2 kapandı** (B2'nin yazıldığı senaryo + B4), **2 borçta** (B1, B3 —
kullanıcı/orkestratör kararı). FIX 2'nin açtığı **1 yeni** `low` (B5 — iki dosya arası
senkron sapması).

---

## 1. Tur 2 low'larının kapanış durumu — kendi ürettiğim kanıtla

Yöntem: AC13 adımının `run:` gövdesi `ci.yml`'den **programatik olarak** (satır 285'ten
başlayarak, girinti dedent'li, 84 satır) çıkarıldı ve `.github`'ın **sandbox kopyasında**
koşturuldu. Gerçek dosyalara **hiç yazılmadı** (§5 bütünlük kanıtı). devops'un beyanı
kullanılmadı.

### B2 (AC13 eşiği) → **KAPANDI** (yazıldığı senaryo için), artığı B5'e taşındı

`min_expected_patterns` artık dosyada **yok**; yerine `ci.yml:317-337` bağımsız referans
dosyasından (`ci-forbidden-tokens-permanent.txt`) okunan **7 kalıcı jetonun ada göre**
iddiası var. Kendi koşumum:

| Vektör  | Senaryo                                                             | Beklenen | Gerçek     |
| ------- | ------------------------------------------------------------------- | -------- | ---------- |
| **V1**  | Temiz (sandbox kopyası)                                             | exit 0   | **exit 0** |
| **V2**  | **KALICI** jeton (`--accept-data-loss`) ana listeden silindi        | exit 1   | **exit 1** |
| **V3**  | **GEÇİCİ** jeton (`pnpm audit`) ana listeden silindi                | exit 0   | **exit 0** |
| **V4**  | 5 **geçici** jeton silindi (8 → 3)                                  | exit 0   | **exit 0** |
| **V8**  | Referans dosyanın **tüm** jeton satırları silindi                   | exit 1   | **exit 1** |
| **V9**  | Ana liste tamamen boşaltıldı                                        | exit 1   | **exit 1** |
| **V10** | Referansın satırları **yoruma** çevrildi                            | exit 1   | **exit 1** |
| **V11** | Referans dosya **silindi**                                          | exit 1   | **exit 1** |
| **V12** | Ana listede satır sonuna **boşluk** (`grep -qFx` tam satır kayması) | exit 1   | **exit 1** |
| **V13** | `release.yml`'e `--accept-data-loss` **enjekte** edildi             | exit 1   | **exit 1** |

- **(1) Kalıcı jeton silinince exit 1** → **V2 doğrulandı.**
- **(2) Geçici jeton silinince exit 0** → **V3/V4 doğrulandı.** Tur 1/tur 2'de yazdığım
  `pnpm audit` senaryosu artık **kasıtlı olarak serbest** (kullanıcı kararı: v0.0.16'ya
  ertelenmiş geçici işaret). Bu bir gerileme değil, kapsam kararı — bulgu olarak
  **yeniden yazılmadı**.
- **(3) `--accept-data-loss` gerçekten iddia ediliyor mu?** **EVET, iki yönlü kanıt:**
  - Enstrümanlı koşum (V15) iddia edilen tam kümeyi bastı: `container:`, `node-version:`,
    `pull_request_target`, `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`, `migrate reset`,
    `db push --force-reset`, **`--accept-data-loss`** → **7/7**.
  - `--` ayırıcısı kaldırılmış varyant (V14): `grep` jetonu **bayrak sanıp usage basıyor**
    (`[--context[=num]] [--label] …`) ve kontrol **yanlış gerekçeyle** "jeton bulunamadı"
    diyerek kırılıyor. Yani `--` **gerçekten gerekli** ve jeton gerçekten grep'e pattern
    olarak gidiyor. **Kapandı.**
- **(4) İki dosya arası senkron sapması** → **gerçek, yeni bulgu: B5** (aşağıda). Özet:
  tek yönlü sapma **fail-closed** (V2), **iki yönlü/ters yönlü sapma fail-open**
  (V5/V6/V7).

**R-6 yeni dosya için de korunuyor:** `ci-forbidden-tokens-permanent.txt` de `.txt` →
`*.yml`/`*.yaml` glob'unun dışında. Mekanik kanıt: V1 temiz koşumu **exit 0**; dosya
tarama hedefinde olsaydı içindeki `container:`/`pull_request_target` satırları kendi
kendini eşler ve exit 1 olurdu.

### B4 (`release.yml` yarışı) → **KAPANDI**

| Doğrulama                        | Sonuç                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `version-pr` `timeout-minutes`   | **EVET** — `release.yml:44` → `15`                                                           |
| `tag` `timeout-minutes`          | **EVET** — `release.yml:93` → `15` (istenmemişti, bonus)                                     |
| İş akışı seviyesi `concurrency`  | **EVET** — `release.yml:31-33`, `group: release-${{ github.ref }}`                           |
| `cancel-in-progress` **`false`** | **EVET** — `release.yml:33` **`false`**; yorum (21-30) gerekçeyi doğru kaydediyor            |
| `ci.yml`'deki `true` değişmemiş  | **EVET** — `ci.yml:23-25` `group: ci-${{ github.ref }}`, `cancel-in-progress: **true**`      |
| `tag` job'unda yazma izni        | **Hâlâ yok** — `release.yml:95-98` yorum; `permissions:` anahtarı yok → kök `contents: read` |

İkisinin zıt olması **kasıtlı ve doğru**: `ci.yml`'de iptal yalnızca eski bir gate
koşumunu düşürür (`ci-gate` varsayılan-reddet olduğu için sahte yeşil üretemez);
`release.yml`'de iptal yarı yazılmış bir sürüm commit'ini keserdi.

### B1 (YAML düz skaler `run:` atlatması) → **BORÇTA** (kapanmadı, bilinçli)

awk bloğu (`ci.yml:419-451`) tur 2'den **birebir aynı**: `in_run` durumuna yalnızca
`trimmed ~ /^run:[ \t]*\|/` veya `/^run:[ \t]*>/` ile giriliyor (satır 436); blok
göstergesiz çok satırlı düz skalerin devam satırları hâlâ taranmıyor. Tur 2'deki T4
atlatması geçerli. Talimat gereği `low` + "borçta" olarak taşındı (B3-eski → aşağıda yeni
numarayla).

### B3 (`grep -Ff` kelime sınırı / yorum satırları) → **BORÇTA**, kısmen azaltıldı

`ci-forbidden-tokens.txt:51-57`'ye D2 uyarı notu eklendi ("bu kısıt TEK YÖNLÜ değil …
yorum satırlarını da kapsıyor … dolaylı ifade kullanın"). Teknik yüzey **değişmedi**
(tarama hâlâ `grep -nFf`, yorum satırları düşülmüyor). Dokümantasyon azaltması gerçek ama
mekanik değil → `low` + "borçta".

---

## 2. FIX 2'nin yeni yüzeyi — denetlendi

### `if ! shared_names=…; then schema_ok=false; fi` (`ci.yml:165-172`) — **fail-open, ama güvenli yönde**

Kendi koşumum (jq ifadesi birebir, `set -uo pipefail`):

| Girdi                                      | `schema_ok` | `fail_open` | `shared_names` |
| ------------------------------------------ | ----------- | ----------- | -------------- |
| Geçerli: `packages/` altında etkilenen var | true        | false       | `@a`           |
| Geçerli: kesişim boş                       | true        | false       | boş            |
| `.directory` **null** (şema bozuk)         | **false**   | **true**    | boş            |
| `.tasks` hiç yok                           | **false**   | **true**    | boş            |
| `.packages` hiç yok                        | **false**   | **true**    | boş            |
| Bozuk JSON                                 | **false**   | **true**    | boş            |

`fail_open=true` → `ci.yml:220` `api=true; admin=true; …; shared=true` → **tüm hatlar
koşar**. Yani "fail-open" adı yanıltıcı; gate kapsamı açısından **fail-closed** (fazla
koşmak = daha sıkı). Sessiz bir yol **açılmadı**; geçerli boş sonuç ile jq hatası ayrı ele
alınıyor ve `sort -u` (boş girdide exit 0) jq'nun hatasını **maskelemiyor** (pipefail en
sağdaki sıfır-olmayan kodu taşır — ölçüldü). **Bulgu değil.**

### `job_names="$(jq …)"` + `[ -n "$job_names" ] || exit 1` (`ci.yml:803-810`) — **fail-closed, doğrulandı**

| `/tmp/needs.json` içeriği    | Sonuç                    |
| ---------------------------- | ------------------------ |
| `bozuk{json`                 | **exit 1** — fail-closed |
| `{}`                         | **exit 1** — "boş" dalı  |
| `[]`                         | **exit 1** — "boş" dalı  |
| `null`                       | **exit 1** — jq dalı     |
| `{"a":{"result":"failure"}}` | **exit 1** — sonuç dalı  |
| `{"a":{"result":"success"}}` | exit 0 — PASS            |

devops'un ölçümü (bozuk JSON → 1, boş obje → 1) **bağımsız olarak doğrulandı**, ayrıca
`[]` ve `null` ek vektörleri de kapanıyor. Süreç ikamesi (`< <(…)`) yerine değişkene alma
doğru düzeltme. **Bulgu değil.**

### `# shellcheck disable=SC2016` ×4 (`ci.yml:190, 195, 202, 210`) — **gerekçeli, gerçek hata susturmuyor**

Dördü de yalnızca `echo '…'` satırlarına ait ve o dizelerin içeriği **Markdown ters
tırnağı**: `` `git diff` ``, `` `turbo --affected --dry=json` ``, `` `.packages[]` ``,
`` `--affected` ``. Dördünde de **genişletilmesi gereken hiçbir kabuk değişkeni yok** —
gerçekten basılan değişkenler (`$names`, `$shared_names`) **ayrı** `printf '%s\n' "$…"`
satırlarında ve **çift tırnaklı**. Susturma kapsamı satır bazlı (dosya/blok geneli
`disable` yok). **Bulgu değil.**

### `scripts/tsconfig.json` artık gerçekten okunuyor — **hiçbir gevşetme yok**

`ci.yml:498` `pnpm exec tsc -p scripts/tsconfig.json` (dosya adı komut satırında **yok**
→ tsconfig artık yoksayılmıyor). Zincir: `scripts/tsconfig.json` → `@arkesoft/config/tsconfig/node.json` → `base.json`.
`base.json` katılığı miras alınıyor: `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`,
`noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`, `noUnusedLocals`,
`noUnusedParameters`, `allowUnreachableCode: false`, `useUnknownInCatchVariables`,
`isolatedModules`, `verbatimModuleSyntax`. `scripts/tsconfig.json`'ın `compilerOptions`
alanı **yalnızca ekliyor**: `noEmit`, `types: ["node"]` (node.json'dakiyle **aynı**),
`typeRoots`, `erasableSyntaxOnly: true`. **Hiçbir katılık bayrağı `false`'a çekilmemiş,
hiçbir `skipLibCheck`/`strict` gevşetmesi yok.** **Bulgu değil.**

### `filter: './packages/**'` — yüzeyi **genişletti**, enjeksiyon yüzeyi açmadı

İki bağımsız kontrol:

1. **Enjeksiyon:** değer `run-gates/action.yml`'de dört adımda da `env: FILTER` üzerinden
   geçip `--filter="$FILTER"` olarak **çift tırnaklı** tüketiliyor (satır 38/39, 44/45,
   51/52, 57/58). `$FILTER` dosyada başka hiçbir yerde geçmiyor → kabuk glob genişlemesi
   **imkânsız**. `ci.yml:753` çağrısı hâlâ **literal** (olay verisi yok).
2. **Kapsam:** `pnpm-workspace.yaml` `packages/themes/*`'ı workspace üyesi sayıyor;
   turbo'nun `*` glob'u `/` geçmediği için `./packages/*` iç içe tema paketlerini
   görmezdi → `shared=true` olup tema paketi lint/typecheck/build **görmeden** geçerdi.
   `**` bu sapmayı kapatıyor. **Daha geniş = daha sıkı.** Yanlış pozitif baskısı bugün
   **sıfır**: `packages/themes/` dizini **henüz yok** (`packages/` altında yalnızca 7
   düz paket) → bugün iki glob **aynı kümeyi** seçiyor; `**` ileriye dönük bir sözleşme.
   **Bulgu değil.**

---

## 3. BULGULAR

### [SEV: low] `.github/ci-forbidden-tokens-permanent.txt` + `.github/ci-forbidden-tokens.txt` + `ci.yml:317-337` — iki dosya arası senkron koruması **tek yönlü**; ters yön ve iki yönlü sapma sessizce geçiyor

Kontrol yalnızca **"referans ⊆ ana liste"** iddiasını kuruyor. Kendi koşumum:

| Vektör | Senaryo                                                        | Sonuç      | Değerlendirme                                                    |
| ------ | -------------------------------------------------------------- | ---------- | ---------------------------------------------------------------- |
| **V2** | Kalıcı jeton **sadece ana listeden** silindi                   | **exit 1** | fail-closed — korumanın asıl amacı, çalışıyor                    |
| **V5** | Kalıcı jeton **İKİ DOSYADAN DA** silindi (aynı PR)             | **exit 0** | **fail-open** — jeton artık **hiç taranmıyor**                   |
| **V6** | Kalıcı jeton **sadece referanstan** silindi                    | **exit 0** | **fail-open** — jeton taranıyor ama **koruması sessizce kalktı** |
| **V7** | Ana listeye **yeni kalıcı** jeton eklendi, referansa eklenmedi | **exit 0** | **fail-open** — ters yön iddiası yok → yeni yasak **korumasız**  |

**Saldırı/erozyon senaryosu (somut):** Bir katkıcı veya AI ajanı yıkıcı bir Prisma
komutunu CI'ya sokmak ister (ör. `prisma db push --force-reset` ile seed'i hızlandırmak,
ya da `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`'ı iş akışına yazmak —
AGENT_BASELINE §5'in tek kullanımlık onay kapısını atlatmak). `guards` kırmızı verir.
Onay istemek yerine **aynı PR'da iki satır** siler: önce
`ci-forbidden-tokens-permanent.txt`'ten, sonra `ci-forbidden-tokens.txt`'ten. CI
**yeşile döner** (V5) ve jeton artık `.github/**` altında hiç aranmaz. İki dosyalı tasarım
bunu **bir satırlık** değişiklikten **iki satırlık** değişikliğe çıkarır — yani bir
_tamper-evidence_ mekanizması, _tamper-proof_ değil. Daha sinsi varyant V6: PR #1'de
yalnızca referanstan silinir (tarama hâlâ çalıştığı için CI yeşil, diff "ölü kopya
temizliği" gibi görünür), PR #2'de ana listeden silinir (artık iddia yok → yeşil). V7 ise
operasyonel erozyon: ileride eklenen yeni bir kalıcı yasak referansa eklenmeyi
**unutulursa** hiç korunmaz ve bunu söyleyen tek şey dosya başlığındaki Türkçe yorumdur.

**Neden `low` ve neden `medium` değil:** (a) hiçbir yolu **tek başına** bir runtime
güvenlik kontrolünü gevşetmiyor — ihlal eden jetonun **ayrıca** bir `.yml`'e yazılması
gerekir ve o değişiklik aynı diff'te görünür; (b) `main` korumalı, her değişiklik PR'dan
geçiyor; (c) V2/V8/V9/V10/V11/V12 ile **altı** sapma sınıfı fail-closed; (d) tur 2'de
`low` olan B2'nin bu artığı daralttım — o zaman **5 jeton serbest** silinebiliyordu, bugün
**tek yönlü silme imkânsız**. Gerçek net iyileşme var; kalan artık bir _meta_-koruma
boşluğu.

**Önerilen düzeltme (ucuz, CODEOWNERS gerektirmez):** iddiayı **çift yönlü eşitliğe**
çevir. Ana listede "KALICI" bölümü makine okunur bir işaretçiyle sınırla (ör.
`# >>> PERMANENT` / `# <<< PERMANENT`), o bölümü `sed`/`awk` ile çıkar ve referans
dosyayla `diff -u` al — fark varsa `exit 1`. Böylece V6 ve V7 de **gürültülü** olur
(referanstan silme veya ana listeye tek taraflı ekleme kırar) ve iki dosya yapısal olarak
senkron kalmaya zorlanır. V5'i kapatan tek şey `.github/**` için **gözden geçirici
zorunluluğu** (CODEOWNERS / branch protection) — bu bilinçli olarak ertelendi, borç olarak
kalıyor.

**Sorumlu ajan:** `devops`

---

### [SEV: low — BORÇTA] `.github/workflows/ci.yml:419-451` — ifade yasağı kontrolü çok satırlı düz skaler `run:` formunu atlıyor

Tur 2 B1'in **birebir aynısı**; awk bloğu bu turda **değişmedi** (`in_run` durumuna
yalnızca `/^run:[ \t]*\|/` ve `/^run:[ \t]*>/` ile giriliyor, satır 436). Atlatma formu ve
saldırı senaryosu tur 2 raporu §2'de ayrıntılı. YAML-farkında ayrıştırma gerektirdiği için
**bilinçli olarak borca bırakıldı** (orkestratör kararı) — tekrar `low`, şişirilmedi.
Düzeltme önerisi değişmedi: `yq`/Node `yaml` ile `steps[].run` skalerini **çözülmüş**
halde ara.

**Sorumlu ajan:** `devops`

---

### [SEV: low — BORÇTA] `.github/ci-forbidden-tokens.txt` + `ci.yml:357-375` — sabit-metin tarama yanlış pozitif baskısı (yorum satırları + kelime sınırı yok)

Tur 2 B3'ün devamı. **Kısmi azaltma gerçekleşti:** `ci-forbidden-tokens.txt:51-57`'de
açık uyarı notu var (D2) — bir sonraki katkıcı artık neden kırıldığını dosyada okuyabilir.
Teknik yüzey **aynı**: tarama `grep -nFf`, hedef `.yml`/`.yaml` dosyalarının **tamamı**
(yorumlar dahil), kelime/bağlam sınırı yok. `ci.yml:406-413`'teki `needle_a`/`needle_b`
bölme hilesi de duruyor — kontrol kendi dosyasını yazan ajanı hâlâ kaçınmaya zorluyor.
B5 ile zincirlenmesi (yorumda `container:` yazan katkıcının en kolay çıkışının jetonu
silmek olması) B5'in düzeltmesiyle **kısmen** kapanır. `low`, borçta.

**Sorumlu ajan:** `devops`

---

## 4. Değişmeyen gerçekler — talimat gereği yeniden denetlenmedi

`changesets/action` SHA pin'i (`release.yml:71` — 40 karakter, gözle doğrulandı, değişmedi) ·
`pull_request_target` yokluğu (V1 temiz koşumu ile **mekanik olarak** yine doğrulandı) ·
`secrets.*` kullanımı (`release.yml:82` tek yer, `GITHUB_TOKEN`) · `.env` izlenmemesi ·
`pnpm audit` sonucu (`multer` high, ROADMAP v0.0.16, bu değişiklikten kaynaklanmıyor) ·
`sync-platform-version.ts` Zod kapsamı + fail-closed sentinel'i · `actionlint` tedarik
zinciri · `setup-workspace` cache/`--ignore-scripts` davranışı.

**`pnpm audit` bu turda ÇALIŞTIRILMADI** (talimat; `pnpm-lock.yaml` bu turda değişmedi —
tur 2'den beri aynı `M` kaydı, yeni paket yok). Tur 1 sayıları geçerli:
critical **0** · high **1** (`multer`) · moderate **0** · low **0**.

`apps/api/src/**` ve `packages/*/src/**` **bu turda değişmedi** → denetlenmedi
(`git status`: yalnızca `.gitignore`, `package.json`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml`, `packages/{config,db}/package.json`, `packages/db/prisma*`,
`*/vitest.config.ts` + izlenmeyen `.github/`, `scripts/`, `.changeset/`).

---

## 5. Bütünlük kanıtı — gerçek dosyalar değişmedi

Tüm negatif vektörler `.github`'ın sandbox kopyasında koştu
(`…/scratchpad/sb3/.github`); her vektörden önce dizin pristine kopyadan (`.github.orig`)
yeniden kuruldu.

```
$ diff -r "/Users/kullanici/Desktop/Arkesoft Panel/.github" "$SB/.github.orig"
  -> fark YOK (gerçek .github bozulmadı)

$ git status --short | grep -E '\.github|scripts'
?? .github/
?? scripts/
  -> hâlâ tek '??' kaydı (izlenmiyor); hiçbir 'M' kaydı yok
```

Gerçek dosyaların md5'leri (koşum sonrası):

| Dosya                                       | md5                                |
| ------------------------------------------- | ---------------------------------- |
| `.github/ci-forbidden-tokens.txt`           | `5017872740004cb9bee972a26b18cea4` |
| `.github/ci-forbidden-tokens-permanent.txt` | `e8b0fd584d98f1cc246ea70e5d23ce85` |
| `.github/workflows/ci.yml`                  | `c4d51625af334f0d577196febc9ab1a7` |
| `.github/workflows/release.yml`             | `3d0d08cf240897236c602f707f66ad16` |

`git push` / `gh pr create` / `gh workflow run` **çalıştırılmadı**. Yıkıcı veritabanı
komutu **çalıştırılmadı**. `Edit`/`Write` ile hiçbir kaynak dosya değiştirilmedi (yalnızca
bu rapor yazıldı).

---

## 6. Tenant izolasyonu (CLAUDE.md §7, 14 madde)

Değişmedi: bu Task hiçbir tenant'a bağlı yüzeye dokunmuyor (yeni tablo, migration, tRPC
prosedürü, kuyruk işi, önbellek anahtarı, S3 öneki, arama indeksi, kullanıcıya dönük hata
mesajı yok). FIX 2 yalnızca CI yapılandırmasına + `scripts/tsconfig.json`'a dokundu.
**14/14 madde N/A; karşılanmayan madde yok.**

---

## ÖLÇÜMLER

- **Denenen vektör: 27**
  - AC13 veri kaynağı (sandbox): **13** (V1 temiz · V2 kalıcı silme · V3 geçici silme ·
    V4 5 geçici silme · V5 iki yönlü silme · V6 ters yön silme · V7 tek yönlü ekleme ·
    V8 referans boşaltma · V9 ana liste boşaltma · V10 referans yoruma çevirme ·
    V11 referans dosya silme · V12 satır sonu boşluk sapması · V13 `release.yml`'e
    yıkıcı jeton enjeksiyonu)
  - `--` ayırıcısı / iddia kapsamı: **2** (V14 `--` kaldırılmış varyant → grep usage
    hatası · V15 enstrümanlı koşum → iddia edilen **7/7** jeton listelendi)
  - `ci-gate` fail-closed: **6** (bozuk JSON · `{}` · `[]` · `null` · `failure` ·
    `success`)
  - `plan` `shared_names` jq: **6** (2 geçerli + 4 şema/parse hatası)
- **İncelenen dosya: 8** — `ci.yml`, `release.yml`, `ci-forbidden-tokens.txt`,
  `ci-forbidden-tokens-permanent.txt` (**yeni**), `scripts/tsconfig.json`,
  `packages/config/tsconfig/{node,base}.json`, `run-gates/action.yml`
  (+ referans: `pnpm-workspace.yaml`, tur 2 raporu)
- **Kapanan bulgu: 2/4** — B2 (yazıldığı senaryo için; artığı daraldı → B5),
  B4 (tam kapandı). **Borçta: 2/4** — B1, B3 (bilinçli, orkestratör kararı).
- **Yeni bulgu dağılımı:** critical **0** · high **0** · medium **0** · low **1** (B5)
- **Tur 3 toplam bulgu dağılımı:** critical **0** · high **0** · medium **0** ·
  low **3** (1 yeni + 2 borçta taşınan)
- **Karşılanmayan tenant izolasyon maddesi:** yok (14/14 N/A)
- **Çalıştırılmadı:** `pnpm audit` (talimat — lockfile değişmedi), `gh` komutları,
  gerçek runner üzerinde iş akışı koşumu, yıkıcı veritabanı komutu.
