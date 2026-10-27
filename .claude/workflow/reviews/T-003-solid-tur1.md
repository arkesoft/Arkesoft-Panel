# T-003 — `solid` gate · tur 1

Tarih: 2026-10-27
Sürüm: ROADMAP v0.0.12 (platform 0.0.4 → 0.0.5)
Dal: `chore/ajan-altyapisi` (değişiklikler commit edilmemiş)

```
GATE: solid
SONUÇ: FAIL
```

FAIL gerekçesi: `AGENT_BASELINE.md` §4 — **4 adet `medium`** bulgu (eşik: 3). `critical`/`high`
bulgu **yok**; mimari, katman ve tip disiplini açısından kod sağlam.

## Kapsam

Denetlenen yüzey (T-003 ST-1…ST-7):

- `scripts/sync-platform-version.ts` (asıl hedef, tek gerçek TypeScript dosyası)
- `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- `.github/actions/{setup-workspace,run-gates,prepare-db}/action.yml`
- `.github/ci-forbidden-tokens.txt`, `.github/ci-expected-test-packages.txt`
- `.changeset/config.json`
- `packages/db/{vitest.config.ts,prisma.config.ts,package.json}`, `apps/api/vitest.config.ts`,
  `packages/config/package.json`, kök `package.json`

Referans olarak okundu (denetlenmedi): `pnpm-workspace.yaml`, `CHANGELOG.md:26` (sentinel),
`.prettierignore`. Kapsam dışı (T-002'de denetlendi, bu Task'ta değişmedi): `apps/api/src/**`,
`packages/{db,errors}/src/**`. `.github/pull_request_template.md` bu gate'in yüzeyinde
verilmedi — denetlenmedi.

### Önceden bildirilen bilinçli desenler — bulgu olarak YAZILMADI

1. `if (existsSync(url)) process.loadEnvFile(url)` satırının üç yapılandırma dosyasında
   tekrarlanması (architect K-B4, bootstrap döngüsü riski) — DRY ihlali sayılmadı.
2. `apps/api/vitest.config.ts:19-26`'da `loadEnvFile` çağrısının import'ların altında, modül
   gövdesinde durması (T-002'de kabul edilen bilinçli desen) — yeniden raporlanmadı.
3. `guards`'taki üç kontrolde jetonun iki parçalı string birleştirmesiyle kurulması
   (`ci.yml:232-234, 246-248, 280-282`) — "obfuscation" sayılmadı. **Üçü de yorumla
   belgelenmiş** (`ci.yml:228-231, 245, 277-279) → bu başlıktan `low` bulgu çıkmadı.

### Değerlendirilip bulgu YAZILMAYAN kalemler

- **`admin`/`superadmin`/`storefront` job'larının kopyala-yapıştır benzerliği
  (`ci.yml:441-490`):** `matrix` ile birleştirilemez — GitHub'da job seviyesindeki `if:`
  ifadesinde `matrix` bağlamı **yoktur**, dolayısıyla hat başına `skipped` raporlayan ayrı
  check üretilemez (AC1/AC9'un mülkü). Dinamik matris tek bir check adı üretir ve v0.18.0'ın
  "job adları bugünden sabit" sözleşmesini bozar. **Yapısal olarak zorunlu tekrar → bulgu değil.**
- **Beşli kapının tek tanım yeri:** `run-gates/action.yml:27-42`. `ci.yml` hiçbir yerde
  `turbo run lint|typecheck|build` komutunu tekrarlamıyor; `guards`'taki
  `turbo run test --dry=json` (`ci.yml:298`) farklı amaçlı (sahte yeşil dedektörü), tekrar değil.
  `format:check`/`env:check`'in `repo` job'unda olması bölünme değil, repo seviyesinde tek
  koşum kararı. ✓
- **İki `.txt` ölü değil:** `ci-forbidden-tokens.txt` → `ci.yml:203`,
  `ci-expected-test-packages.txt` → `ci.yml:297`. ✓
- **Katman/bağımlılık yönü:** `scripts/sync-platform-version.ts` hiçbir `@arkesoft/*` paketini
  import etmiyor (yalnızca `node:*` + `zod`), `zod` kök `package.json:45`'te **beyan edilmiş**
  (hayalet bağımlılık yok). Bootstrap bağımsızlığı korunmuş. ✓
- **Döngüsel bağımlılık:** `ci-gate` kendini `needs`'e almıyor (`ci.yml:528`); `needs` grafiği
  tek yönlü. ✓
- **Tip sıyırma kısıtı:** script'te `enum`/`namespace`/yapıcı parametre özelliği/dekoratör
  **yok** → `node` ile derlemesiz koşum güvende. ✓
- **Tek `as` (`scripts/sync-platform-version.ts:272`):** `rootPackageJsonSchema.parse(parsed)`
  çağrısının **hemen** ardında (satır 271) ve CLAUDE.md §2'nin "yalnızca runtime doğrulamasından
  sonra" kuralına **uyuyor**. Gerekçe (anahtar sırası + girinti korunsun diye Zod'un yeniden
  inşa ettiği nesne değil orijinal `JSON.parse` çıktısı mutasyona uğratılıyor) **makul** —
  Zod `.loose()` sonuç nesnesini şema anahtarlarından başlayarak yeniden kurduğu için `version`
  alanı dosyanın başına taşınır ve diff kirlenir. Kurallı, belgeli ve tek kullanım → **ihlal
  değil**; yalnızca L8'deki daha temiz alternatif öneriliyor.

## BULGULAR

### medium

- **[SEV: medium]** `.github/workflows/ci.yml:528` ve `.github/workflows/ci.yml:549` —
  `ci-gate`'in denetlediği job listesi **iki ayrı yerde** elle yazılı: bir kez
  `needs: [plan, repo, guards, api, admin, superadmin, storefront, shared]`, bir kez de
  `for job_name in plan repo guards api admin superadmin storefront shared`. Bu, "varsayılan
  reddet" iddiasını fiilen **ad listesine dayalı izin listesine** çeviriyor: `needs`'e eklenip
  döngüye eklenmeyen bir job'ın `failure` sonucu **hiç okunmaz** → `ci-gate` yeşil kalır
  (sessiz sahte yeşil). Drift teorik değil, **planlanmış**: T-003 "additive sözleşme" tablosu
  v0.0.13 ve v0.0.19 için "`ci.yml`'e +1 job, `ci-gate.needs`'e ekle" diyor, döngüden hiç söz
  etmiyor. — **Düzeltme:** listeyi `toJSON(needs)`'in kendisinden türet:
  `for job_name in $(jq -r 'keys[]' /tmp/needs.json); do …` (ikinci liste tümüyle silinir;
  ters yön zaten güvenli — `needs`'te olmayan ad `null` döner ve `*` dalına düşer). — `devops`
- **[SEV: medium]** `.github/workflows/ci.yml:145` — `shared` hattının tetiklenmesi
  `^@arkesoft/(config|db|errors|integrations|theme-sdk|trpc|ui)$` **elle yazılmış paket
  listesine** bağlı. Bu, architect'in K-B2.2'deki bağlayıcı gerekçesinin ("bağımlılık grafiği
  bilgisi turbo'dan gelir, elle yazılmaz; elle liste grafikten **kaçınılmaz olarak** sapar")
  tam da yasakladığı şey. Sonuç bugün doğru (7/7 paket listede) ama `packages/versioning`,
  `packages/i18n` (CLAUDE.md §3'te planlı) veya `packages/themes/*` eklendiğinde: paketi
  oluşturan commit lock dosyasını değiştirdiği için kök-dosya kuralıyla kurtulur, **sonraki**
  commit'ler (`packages/versioning/src/**` tek başına) hiçbir hattı tetiklemez → o paket CI'da
  **hiç lint/typecheck/build görmez** ve `ci-gate` yeşil kalır. `--check`'in "yeni paket
  drifti" kuralı bu boşluğu kapatmaz (o yalnızca sürüm grubu üyeliğini zorlar, `ci.yml`'e
  işaret etmez). — **Düzeltme:** kümeyi aynı `--dry=json` çıktısından türet, ör.
  `jq -r '.tasks[] | select(.directory | startswith("packages/")) | .package'` ya da
  `.packages[]`'i `pnpm -r list --json --depth -1` yollarıyla eşle; elle regex kalmasın. — `devops`
- **[SEV: medium]** `.github/workflows/ci.yml:96-102` — `git diff` hatası ve boş base
  **sessizce yutuluyor**: `[ -n "$TURBO_SCM_BASE" ]` yanlışsa veya `git diff` başarısız olursa
  `root_rule` `false` kalır, `$GITHUB_STEP_SUMMARY`'ye hiçbir not düşmez ve özet "turbo
  `--affected` çıktısı başarıyla ayrıştırıldı" diyerek **her şey normalmiş gibi** rapor eder.
  Bu, K-B2.5'in bağlayıcı kuralından sapma: _"base SHA **çözülemezse**, `--dry=json` başarısız
  olursa veya JSON beklenmedikse → tüm hatlar true"_ — üç koşuldan **yalnızca ikisi**
  uygulanmış. `fail_open` (satır 116-119) sadece turbo'nun da çökmesine bel bağlıyor; satır
  91-93'teki yorum bunu varsayım olarak yazıyor ama garanti değil (yeni dal push'unda
  `github.event.before` sıfır SHA'dır; boş/geçersiz `TURBO_SCM_BASE` ile turbo kendi
  varsayılan base'ine düşüp **başarıyla** yanlış bir küme üretebilir → hat yanlışlıkla
  atlanır, `ci-gate` yeşil). CLAUDE.md §4 "hatayı sessizce yutma" ile de çelişiyor.
  — **Düzeltme:** her iki dalda da `fail_open=true` kur ve özete tek satır gerekçe yaz
  (`base çözülemedi → tüm hatlar koşuyor`). — `devops`
- **[SEV: medium]** `scripts/sync-platform-version.ts:1-443` (dosyanın tamamı) — bu Task'ın tek
  gerçek TypeScript dosyası **hiçbir mekanik kontrolün kapsamında değil**: `scripts/` bir
  workspace paketi olmadığı için `pnpm lint` (`turbo run lint` → paket başına `eslint .`) ve
  `pnpm typecheck` (paket başına `tsc`) bu dosyaya **hiç bakmıyor**; kökte `eslint.config.*`
  ve `tsconfig.json` yok; birim testi de yok. Yani dosyanın başındaki üç sözleşme — `any`
  yasağı, açık dönüş tipleri, **silinebilir (erasable) olmayan sözdizimi yasağı (satır 8-10)** —
  bugün yalnızca **insan incelemesiyle** korunuyor. `ci.yml:291` yalnızca `--check` yolunu
  koşturuyor; `--apply`/`--collect` yollarındaki bir tip veya sözdizimi hatası ancak **sürüm
  kesilirken** (kök `package.json` + `CHANGELOG.md` mutasyonu sırasında) ortaya çıkar.
  Not: `format:check` dosyayı kapsıyor (`.prettierignore` dışlamıyor) ama Prettier tip veya
  sözdizimi sözleşmesi doğrulamaz. — **Düzeltme (ucuz, bu sürümde yapılabilir):** `guards`
  job'una iki adım ekle —
  `pnpm exec tsc --noEmit --erasableSyntaxOnly --module nodenext --target es2024 scripts/sync-platform-version.ts`
  (satır 8-10'daki kısıtı **mekanik** hale getirir) ve `pnpm exec eslint scripts`. Birim testi
  (üç mod + sentinel yokluğu + fixed grup sapması) `scripts/` için test altyapısı gerektirdiği
  için **T3-1 borcuna** bırakılabilir; bu Task'ta kapsam genişletmesi talep edilmiyor. — `devops`

### low

- **[SEV: low]** `scripts/sync-platform-version.ts:84` ve `:144` — `WorkspacePackage.dir` alanı
  dolduruluyor ama **hiçbir yerde okunmuyor** (ölü alan). — **Düzeltme:** tipten ve
  `push` çağrısından kaldır. — `devops`
- **[SEV: low]** `scripts/sync-platform-version.ts:101` — `parseSemver` deseni
  `^(\d+)\.(\d+)\.(\d+)` sonda `$` taşımıyor; ön-sürüm (prerelease) ve build eki **sessizce
  yok sayılıyor**. `0.0.5-rc.1` ile `0.0.5` `compareSemver` için **eşit** → Changesets'in
  pre-release modu kullanılırsa `--check` Kural 1 kök ile fixed grup arasındaki gerçek farkı
  yeşil geçirir. — **Düzeltme:** ön-sürüm ekini ya karşılaştırmaya kat ya da görüldüğünde
  açıkça hata fırlat ("bu script ön-sürümleri desteklemiyor"); sessiz yok sayma kalmasın. — `devops`
- **[SEV: low]** `scripts/sync-platform-version.ts:115-116` — `pa` / `pb` kısaltma değişken
  adları (CLAUDE.md §4 "kısaltma ve belirsiz ad" yasağı). — **Düzeltme:** `partsA`/`partsB`
  veya `left`/`right`. — `devops`
- **[SEV: low]** `scripts/sync-platform-version.ts:54` — `WORKSPACE_PACKAGE_GROUP_DIRS`
  `pnpm-workspace.yaml:7-9` ile elle eşleniyor (yorum bağımlılığı kabul ediyor ama mekanik
  bağ yok). Workspace glob'u değişirse keşif sessizce eksik kalır → `--check` Kural 2'nin
  "yeni paket drifti" dedektörü de sessizce körleşir. — **Düzeltme:** YAML ayrıştırıcısı
  (yeni bağımlılık) gerekmiyor — `pnpm -r list --json --depth -1` çıktısı ad+sürüm+yol veriyor;
  hem bu sabit hem `discoverWorkspacePackages`'in dosya gezinmesi tek bir mekanik kaynakla
  değişebilir. — `devops`
- **[SEV: low]** `scripts/sync-platform-version.ts:271-272` — tek `as` kuralla uyumlu ve
  gerekçesi makul (yukarıdaki "bulgu yazılmayan kalemler" başlığına bakın), ama `as`'i tümüyle
  kaldıran daha temiz bir yol var: `function isJsonObject(value: unknown): value is Record<string, unknown>`
  tipi **runtime kontrolüyle** daraltır; `parse`'ın dönüşünü atmak yerine `parse` doğrulama,
  type guard daraltma yapar. — **Düzeltme:** isteğe bağlı iyileştirme, borç değil. — `devops`
- **[SEV: low]** `scripts/sync-platform-version.ts:436-442` — üst seviye `catch` hatayı
  yutmuyor (mesaj + `exitCode = 1` ✓) ama **yığın izini (stack) düşürüyor**. `--check` CI'da
  koşarken beklenmeyen bir programlama hatası (ör. `TypeError`) tek satır mesaj olarak görünür,
  teşhis zorlaşır. — **Düzeltme:** `error instanceof Error ? (error.stack ?? error.message) : String(error)`.
  — `devops`
- **[SEV: low]** `.github/actions/prepare-db/action.yml:10-12` ile
  `.github/actions/setup-workspace/action.yml:53-56` — `.env` üretim sorumluluğu **iki
  composite action'a** dağılmış. `api` job'u (`ci.yml:424-428`) ikisini de çağırıyor →
  `pnpm env:init` aynı job'da **iki kez** koşuyor (idempotent olduğu için zararsız, ama
  "hangi action .env'in sahibi" sorusunun iki cevabı var). — **Düzeltme:** `prepare-db`'den
  `env:init` adımını çıkar ve açıklamasına "çağıran `setup-workspace`'i `create-env: 'true'`
  ile koşturmuş olmalı" yaz; ya da tersi. — `devops`
- **[SEV: low]** `.github/workflows/release.yml:40-50` — `setup-workspace` composite action'ı
  varken pnpm kurulumu + `.nvmrc`'den Node + `pnpm install --frozen-lockfile` adımları **elle
  kopyalanmış**. Gerçek tekrar (ortak tanım zaten mevcut ve yedi job onu kullanıyor) ve yan
  etkisi var: `setup-workspace:29-39`'daki **Node sürüm iddiası** (AC5 koruması) sürüm
  akışında çalışmıyor. — **Düzeltme:** `uses: ./.github/actions/setup-workspace` +
  `with: { create-env: 'false' }`. — `devops`
- **[SEV: low]** `.github/workflows/ci.yml:199-384` — `guards` job'u iki farklı sorumluluğu
  taşıyor: **bloklayan** statik kontroller (AC13, container, node-version, release tetikleyici,
  `--check`, sahte yeşil, `.env` probu, actionlint) ve **bloklamayan** danışma uyarıları
  (AC7 changeset, AC10 PR gövdesi). Adımların hiçbirinde `if: always()` yok → erken bir
  bloklayan adım kırmızıya dönerse **uyarı adımları hiç koşmaz** ve PR yazarı changeset/sürüm
  etiketi geri bildirimini kaybeder. — **Düzeltme:** iki uyarı adımına
  `if: ${{ always() && github.event_name == 'pull_request' }}` ekle (veya uyarıları ayrı bir
  `advice` job'una taşı ve `ci-gate.needs`'e ekle). — `devops`
- **[SEV: low]** `.github/workflows/ci.yml:232-234, 246-248, 280-282` — üç yasak jeton
  (`container:`, `node-version:`, `pull_request_target`) `ci.yml` içinde **inline** tutulurken
  diğer sekizi tek kaynak `.github/ci-forbidden-tokens.txt`'de; "yasak jeton" kavramının iki
  kaynağı var. Bölünmüş string hilesi **yalnızca kontrol kendi taradığı dosyanın içinde
  yaşadığı için** gerekiyor — jetonlar `.txt`'ye taşınsa tarama hedefi `*.yml/*.yaml` ile
  sınırlı olduğundan (`ci.yml:216`) kendi kendini eşleme sorunu **ortadan kalkar** ve hile de
  gereksizleşir (`grep -F "node-version:"` `node-version-file:` ile eşleşmez). Takas: `.txt`
  taraması jeton başına özel hata mesajı veremiyor ve `node-version` adımının pozitif iddiası
  (`node-version-file` var mı, `ci.yml:253`) yerinde kalmalı. — **Düzeltme:** üç jetonu `.txt`'ye
  taşımayı değerlendir; taşınmazsa `.txt` başlığına "bu listenin dışında ci.yml içinde inline
  tutulan üç jeton daha var" notunu ekle (ikinci kaynak en azından **keşfedilebilir** olsun).
  — `devops`
- **[SEV: low]** `packages/db/package.json:29` — `clean` script'i `rm -rf dist generated .turbo`
  diyor; paket kökünde `generated/` dizini **yok** (Prisma çıktısı `dist/generated`, bkz.
  `imports` satır 13-18 ve K-B6b `find` budaması). Ölü/yanıltıcı yol — ST-1'in dokunduğu
  dosyada, hemen `build` satırının yanında duruyor ve "generated nerede yaşıyor" sorusunu
  bulanıklaştırıyor. — **Düzeltme:** `generated` jetonunu kaldır. — `db`

## ÖLÇÜMLER

| Ölçüm                                               | Değer                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Denetlenen dosya                                    | **15** (+3 referans okuma)                                                                  |
| `any` kullanımı                                     | **0** (yalnızca `sync-platform-version.ts:90`'da açıklayıcı yorum)                          |
| `@ts-ignore` / `@ts-expect-error`                   | **0**                                                                                       |
| `as` zorlaması                                      | **1** — `sync-platform-version.ts:272`, Zod `parse`'ın **hemen** ardında → kurala uygun     |
| Silinemez (non-erasable) sözdizimi                  | **0** (`enum`/`namespace`/parametre özelliği/dekoratör yok)                                 |
| En büyük TypeScript fonksiyonu                      | `runCheck` — **63 satır** (`sync-platform-version.ts:316-378`)                              |
| En büyük shell bloğu                                | `plan.decide` — **~82 satır** (`ci.yml:75-156`)                                             |
| Dışa açık fonksiyonların dönüş tipi                 | 15/15 açık ✓                                                                                |
| Boş `catch` bloğu / yutulan hata (TS)               | **0**                                                                                       |
| Yutulan hata (shell)                                | **1** → M3 (`ci.yml:96-102`)                                                                |
| Elle tutulan (grafikten türetilmeyen) paket listesi | **4** — `ci.yml:145`, `ci.yml:549`, `script:48`, `script:54` (ikisi bulgu, ikisi gerekçeli) |
| Bulgu dağılımı                                      | critical 0 · high 0 · **medium 4** · low 11                                                 |
| Birim testi (bu Task'ta eklenen)                    | **0** (M4'ün parçası; `scripts/` test altyapısı yok → T3-1)                                 |

## Orkestratöre notlar (bulgu değil)

- **`.changeset/config.json:5-17` `fixed` grubu 9 üye**, PO'nun ST-4 DoD'si "11 üye" diyor.
  Gerçekte doğru olan **9**'dur: architect'in K-B1 tablosundaki `@arkesoft/versioning` ve
  `@arkesoft/i18n` paketleri **henüz repoda yok** (11 = 9 fixed + `theme-sdk` + `trpc`).
  Listede olsalardı `resolveFixedGroupVersion` (`script:249`) "workspace'te bulunamadı" diye
  fırlardı. Metin uyuşmazlığı; `qa`'nın DoD okuması için not düşülüyor.
- **`CHANGELOG.md:26` sentinel metni yanıltıcı:** "Changesets bu çizginin altına yazar" diyor,
  oysa K-B1.4 gereği Changesets kök `CHANGELOG.md`'yi **hiç açmıyor** — yazan tek şey
  `scripts/sync-platform-version.ts`. Dosya bu Task'ta değişmediği için bulgu yazılmadı;
  **[8] docs** satırı güncellerken düzeltsin (sentinel **metni** değişirse `script:40`'taki
  sabit de aynı commit'te değişmek zorunda — eşleşme birebir).
- **İleride tekrar riski:** `packages/versioning` (CLAUDE.md §3: "semver karşılaştırma")
  hayata geçtiğinde repoda **iki** semver karşılaştırıcısı olacak. Script'in bootstrap
  bağımsızlığı (hiçbir `@arkesoft/*` import etmemesi) **bağlayıcı** olduğu için bugün doğru
  olan budur; o sürümde bilinçli karar gerekecek.
