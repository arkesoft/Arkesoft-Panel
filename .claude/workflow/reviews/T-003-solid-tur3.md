# T-003 — `solid` gate · tur 3 (son tur)

Tarih: 2026-10-27
Sürüm: ROADMAP v0.0.12 (platform 0.0.4 → 0.0.5)
Dal: `chore/ajan-altyapisi` (değişiklikler commit edilmemiş)

```
GATE: solid
SONUÇ: PASS
```

PASS gerekçesi: `AGENT_BASELINE.md` §4 — **1 adet `medium`** (eşik: 3), `critical`/`high`
bulgu **yok**. 1–2 `medium` → PASS, bulgu teknik borca kaydedilir.

**Tur 2'nin dört `medium`'u da kapandı** (4/4). Tur 2'nin dört `low`'u (D1, D2, B, C) da
kapandı. Bu turda **tek yeni `medium`** var ve sınıfı **(b)** — gerileme değil, ilk iki
turda yüzeye çıkmamış kalem.

> **Yöntem notu — dürüstlük şartı:** bu turda da **kabuk erişimim yoktu**; hiçbir komut
> çalıştırılmadı. Tüm değerlendirme statik okuma + araç dokümantasyonu temelli. Ölçüm
> gerektiren üç iddia (devops'un prob paketi ölçümü, `tsc -p` exit 0, jq/turbo boş çıktı
> şekli) **ölçüm olarak değil, "doğrulanmalı" notu olarak** işlendi — bkz. §4.

---

## 1. Tur 2 bulgularının durumu

### Dört `medium` (FAIL'i üretenler) — 4/4 **kapandı**

| #        | Konu                                             | Durum       |
| -------- | ------------------------------------------------ | ----------- |
| **M2-1** | `ci-gate` süreç ikamesi → sessiz fail-open       | **kapandı** |
| **M2-2** | `shared_names` jq çağrısı denetlenmiyordu        | **kapandı** |
| **M2-3** | `scripts/tsconfig.json` hiç okunmuyordu          | **kapandı** |
| **M2-4** | `filter: './packages/*'` iç içe paketi kaçırıyor | **kapandı** |

**M2-1 — kapandı.** `ci.yml:803-810` istenen kalıbı birebir uyguluyor:
`if ! job_names="$(jq -r 'keys[]' /tmp/needs.json)"; then … exit 1; fi` + ayrı bir
`[ -z "$job_names" ] → exit 1` iddiası + `done <<< "$job_names"` (`:821`). Süreç ikamesi
(`< <(…)`) **dosyada hiç kalmadı**. `set -euo pipefail` (`:778`) artık jq'nun hatasını
**görüyor**: `if !` ile sarıldığı için errexit atlanır ama dönüş değeri okunur, iki dal da
`exit 1` → varsayılan-reddet geri geldi. Döngü içindeki ikinci jq (`:815`) **ayrıca**
korunuyor: çıplak atama olduğu için jq çökerse `set -e` adımı düşürür (fail-closed).
Gerekçe yorumu (`:795-802`) *neden*i anlatıyor ve bash semantiğini adıyla söylüyor ✓.

**M2-2 — kapandı.** `ci.yml:164-173`: `if ! shared_names="$(…)"; then schema_ok=false; fi`.
**Hata ile geçerli-ama-boş sonuç gerçekten ayrıştırılıyor** ve ayrımın iki ucu da doğru
bağlanmış:

- jq/`sort` pipeline'ı non-zero döndürürse (`pipefail` devrede, `sort -u` boş girdide 0 ile
  çıkar → kod jq'nun hatasını taşır) → `schema_ok=false` → `:176` fail-open → `:193-196`
  özete gerekçe satırı.
- jq 0 ile çıkıp hiç satır üretmezse → `shared_names` boş, `schema_ok` **true kalır**,
  fail-open **tetiklenmez**, `:229` `shared=false` olarak değerlendirilir.

Yani tur 2'de yazdığım "aynı sınıf yeni yerde" sorunu kapandı. Ek olarak jq filtresinin
**sıralaması** da bu düzeltmeye yardım ediyor: `(.package | IN($affected[])) and (.directory
| startswith("packages/"))` — jq'nun `and`'i kısa devre yaptığı için etkilenmeyen görevlerin
`null` `.directory` alanı hiç değerlendirilmez; tip hatası yüzeyi daralmış.

**M2-3 — kapandı.** `ci.yml:498` artık tek satır: `pnpm exec tsc -p scripts/tsconfig.json`.
**Dosya adı komut satırında YOK** → TypeScript'in "girdi dosyası verilirse tsconfig
yoksayılır" davranışı devre dışı, yapılandırma gerçekten okunuyor. `erasableSyntaxOnly`
CLI'dan `scripts/tsconfig.json:24`'e taşındı, ikinci `typeRoots` tanımı CLI'dan **silindi**
(artık tek yerde: `:23`). Katılık mirası doğrulandı:
`@arkesoft/config/tsconfig/node.json` → `base.json:10-21` → `strict: true`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
`noUnusedLocals/Parameters`, `useUnknownInCatchVariables` ✓.
**Hiçbir gevşetme yok:** `scripts/tsconfig.json` yalnızca `noEmit`, `types`, `typeRoots`,
`erasableSyntaxOnly` ekliyor; `strict: false` yok, kural kapatma yok.
`skipLibCheck: true` **preset'ten** geliyor (`base.json:38`, gerekçesi yorumlu) — bu turda
eklenmiş bir gevşetme değil, deponun zaten yürürlükteki standardı.
`target` çelişkisi de gitti (CLI'daki `es2024` kalktı; artık preset'in `ES2023`'ü).

> **Tur 2 öngörüm tutmadı — kayda geçiyorum.** `sync-platform-version.ts:276-279` için
> TS2367 / `no-unnecessary-condition` beklemiştim; devops `tsc -p scripts/tsconfig.json` →
> exit 0 ölçtü. Bu, kodun `const [version] = versions` (Set üzerinden yapısal çözümleme)
> ifadesini katı modda `string | undefined` olarak tiplediğini gösterir → `:277`'deki
> `undefined` koruması **tip düzeyinde anlamlı**, ölü dal değil. Bulgu yok, düzeltme yok.

**M2-4 — kapandı.** `ci.yml:753` → `filter: './packages/**'`. devops'un geçici
`packages/themes/probe` paketiyle yaptığı ölçüm (`*` → 7 paket, probu kaçırdı; `**` → 8
paket, yakaladı) bulgunun tam olarak iddia ettiği şeyi doğruluyor. Gerekçe `:743-752`'de
Türkçe, ölçümün kendisi dahil yazılı ✓. Prob silinmiş, `git status` temiz (devops raporu).

### Dört `low` (D1, D2, B, C) — 4/4 **kapandı**

| #      | Konu                                          | Durum                                                                    |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------ |
| **D1** | `shared_names` `.packages[]` ile kesişmiyordu | **kapandı** — `ci.yml:165-169` `IN($affected[])`; özet `:211` düzeltildi |
| **D2** | `.txt` başlığında yorum-taraması notu yok     | **kapandı** — `ci-forbidden-tokens.txt:51-57`                            |
| **B**  | `min_expected_patterns` sayım eşiği           | **kapandı** — eşik kalktı, ada göre iddia geldi                          |
| **C**  | `release.yml` timeout + concurrency           | **kapandı** — `release.yml:31-33`, `:44`, `:93`                          |

**D1 — kapandı ve davranışsal olarak güvenli.** Kesişim `shared`'ı **daraltıyor**; daraltma
bu turda ayrıca gözden geçirildi ve kapsam kaybı üretmediği doğrulandı: bağımlılık yönü
`apps/*` → `packages/*` olduğu için bir uygulama değişikliği hiçbir paketi "etkilenen"
yapamaz; bir paket değiştiğinde o paketin kendisi `.packages[]`'e girer → kesişim onu
korur; paketin uygulamadan erişilebilir olan kısmı ayrıca `@arkesoft/<app>...` filtresinin
(`...` eki = bağımlılıklar dahil) kapanışında zaten lint/typecheck/build görüyor. Özet
metni (`:211`) artık "GERÇEKTEN ETKİLENEN paketler" diyor ve kesişimi gerekçesiyle
adlandırıyor — tur 2'de yanlış olan metin düzeltildi ✓.

**B — kapandı; ikinci dosya çözümü MAKUL.** `min_expected_patterns` eşiği tümüyle kalktı;
`ci.yml:317-337` artık `.github/ci-forbidden-tokens-permanent.txt`'teki yedi kalıcı jetonun
her birinin ana listede **adıyla** bulunduğunu doğruluyor. Liste `KALICI YASAKLAR`
(`ci-forbidden-tokens.txt:73-80`) ve `GEÇİCİ KAPSAM BOŞLUĞU İŞARETLERİ` (`:82-97`) olarak
ikiye ayrılmış; "GEÇİCİ" bölümden satır silmek (meşru kapsam değişimi) kontrolü
etkilemiyor ✓.

**İkinci dosya "iki kaynak" sorunu mu? Hayır — bu problemde tek kaynak yetersizdir.**
Değerlendirme: korumanın işi tam olarak "ana listeden bir satırın silinmesini yakalamak".
Referansı aynı dosyadan türetmek (ör. `sed -n '/=== KALICI/,/=== GEÇİCİ/p'`) bu işi
**yapısal olarak yapamaz** — silinen satır türetilen kümeden de düşer, kontrol kendini
onaylar. Bağımsız bir referans **zorunlu**. Referansın `ci.yml` içinde bash dizisi olması
da gerçekten imkânsız: o dosya AC13'ün tarama hedefinde, jetonlar orada bitişik yazılsa
adım kendi kendini eşler (R-6 ile aynı sınıf). Dolayısıyla **ayrı `.txt` doğru çözüm**, ve
iki dosyanın başlıkları bu gerekçeyi karşılıklı olarak yazıyor
(`ci-forbidden-tokens.txt:59-71` ↔ `ci-forbidden-tokens-permanent.txt:1-22`) ✓.
Kalan tek açık, tek yönlü ve **yeni** jetonlarla ilgili → `low` L1 olarak yazıldı.

**C — kapandı.** `release.yml:31-33` `concurrency: group: release-${{ github.ref }}` +
`cancel-in-progress: false`; gerekçe `:21-30`'da ve `ci.yml`'deki `true`'nun **tersi**
olmasının _neden_ kasıtlı olduğu açıkça yazılı ("iptal YARI YAZILMIŞ bir sürüm commit'ini
keserdi"). `ci.yml:25`'teki `true` **değişmemiş** ✓. `timeout-minutes` her iki job'da var
(`:44` = 15, `:93` = 15); `ci.yml`'de dokuz job'un dokuzunda da var (plan/repo/guards/
admin/superadmin/storefront/shared/ci-gate = 20, api = 30) ✓.

### Bilinçli desenler — yeniden raporlanmadı

| Kalem                                                    | Durum                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| Üç yapılandırma dosyasındaki `existsSync` tekrarı (K-B4) | bilinçli — yeniden raporlanmadı                             |
| `apps/api/vitest.config.ts` import sırası                | bilinçli — yeniden raporlanmadı                             |
| Bölünmüş jeton string'leri (`ci.yml:411-413`)            | bilinçli ve **gerekli** — adımın kendi `run:` bloğu hedefte |
| `packages/db` `clean` yolu (tur 2 `no_change_needed`)    | **taşıma yeterli** (aşağıda)                                |

**`packages/db` — taşıma yeterli, kapandı.** `package.json:29` artık tek bir komut:
`rm -rf dist generated .turbo` (satır sonundaki `#` kabuk yorumu **kaldırılmış** → tur 2
L5'teki "satır sonuna ekleme sessizce yok sayılır" tuzağı yok). Açıklama
`prisma/schema.prisma:21-29`'a taşınmış ve **doğru yere** konmuş: `output = "../generated"`
tanımının **hemen üstünde**, yani iki `generated` konumunun kaynağının yanında. İçerik
olarak da eksiksiz — `clean`'in üçünü de sildiğini, `build`'in `dist/generated`'ı koruyan
budama mantığıyla karıştırılmaması gerektiğini söylüyor. Türkçe, *neden*i anlatıyor,
güncel. **Ek düzeltme istemiyorum.**

---

## 2. Bu turda değerlendirilip bulgu YAZILMAYAN kalemler

- **`# shellcheck disable=SC2016` yorumları (4×: `ci.yml:190, 195, 202, 210`) — susturma
  DEĞİL, gerekçeli.** Dördü de tek tırnaklı `echo` satırlarında Markdown kod gösterimi için
  ters tırnak kullanıyor (`:191, 196, 203, 211`); SC2016 tam olarak "tek tırnakta genişleme
  olmaz" uyarısıdır ve burada **genişleme istenmiyor** — yorum bunu birinci örnekte açıkça
  yazıp (`:187-189`) kalan üçünde ona atıf veriyor. Kuralı kapatmak yerine satır bazlı
  `disable` kullanılmış, kapsam en dar. Bulgu değil. Aynı şekilde `ci.yml:122-126`'daki
  SC2181 notu da *neden*i (dolaylı `$?`'ın araya giren komutla ezilmesi riski) anlatıyor ✓.
- **`grep -qFx --` (`ci.yml:333`) doğru ve zorunlu.** Referans listedeki kalıcı jetonlardan
  biri (`ci-forbidden-tokens-permanent.txt:30`) iki tire ile başlıyor; `--` olmadan grep onu
  bilinmeyen bayrak sanar ve kontrol **yanlış gerekçeyle** kırmızıya düşerdi. `-x` tam satır
  eşleşmesi de doğru seçim: `pattern_file` satırları birebir jetonlar, alt-dize eşleşmesi
  yanlış pozitif üretebilirdi. Gerekçe `:328-332`'de yazılı ✓.
- **`if ! shared_names=…` kalıbı yeni bir sessiz yol AÇMIYOR.** Üç dal tek tek izlendi:
  (a) `schema_ok` zaten `false` ise blok hiç girilmez ve fail-open çoktan devrede; (b) jq
  hata → `schema_ok=false` → fail-open + özete gerekçe; (c) jq 0 + boş çıktı → `shared=false`.
  `shared_names`'in tek tüketicisi `:229` (`[ -n … ]`) ve `:214` (özet) — ikisi de bu üç
  durumda tutarlı.
- **AC13 taramasının "boş hedef listesi" yolu PRATİKTE erişilemez → bulgu yazmadım.**
  `ci.yml:357`/`:415`: `targets="$(find .github/workflows .github/actions …)"`. Teorik
  olarak `targets` boşsa `xargs grep` stdin'den okur ve "eşleşme yok" (exit 1) ile sessiz
  yeşile düşer. Ama hedef kümesi **`ci.yml`'in kendisini içeriyor** ve bu adım ancak
  `ci.yml` varken koşabilir → küme hiçbir koşumda boş olamaz. Dizinlerden biri yoksa `find`
  non-zero döner, `set -e` atamayı düşürür (fail-closed) ✓. Tur 2'deki M2-1 ile aynı sınıf
  görünüyor ama erişilebilirliği yok; **bulgu olarak yazmıyorum**, yalnızca kayda geçiyorum.
- **Katman ihlali / bağımlılık yönü — YOK (yeniden doğrulandı).**
  `scripts/sync-platform-version.ts` hâlâ hiçbir `@arkesoft/*` paketi **import etmiyor**
  (`:22-26` → `node:fs`, `node:path`, `node:url`, `zod`) → bootstrap bağımsızlığı korunuyor.
  `scripts/` → `@arkesoft/config` bağlantısı yalnızca **yapılandırma yolu** düzeyinde
  (`tsconfig extends` + `eslint.config.mjs` import'u + `node_modules/.bin` yolu); çalışan
  script'in bağımlılık grafiğinde değil. Döngüsel bağımlılık yok.
- **`plan.decide` bloğunun boyutu (`ci.yml:84-240`, ~157 satır)** — tur 2'deki değerlendirme
  aynen geçerli: blok **tek bir karar** üretiyor (hangi hatlar koşacak), GitHub Actions'ta
  pratik birim adımın kendisi, dışarı taşımak yeni yüzey + yeni mekanik kontrol gerektirir
  (kapsam genişletmesi). Tek sorumluluk ihlali saymıyorum; `ÖLÇÜMLER`'e ölçüm olarak girdi.
  **Not:** büyümenin tamamı gerekçe yorumu — kod satırı sayısı neredeyse sabit.
- **Borçta kalanlar (bu tur kapsamı dışı, yeniden `medium` yazılmadı):** `scripts/` birim
  testi (T3-1) · `typeRoots` kırılganlığı · `WORKSPACE_PACKAGE_GROUP_DIRS` türetimi
  (`script:54`) · `jobs:` ⊆ `ci-gate.needs` mekanik kontrolü (T3-4) · CODEOWNERS · YAML düz
  skaler `run:` taraması.

---

## BULGULAR

### medium

- **[SEV: medium]** `.github/workflows/ci.yml:111`, `:127`, `:132`, `:170`, `:191`, `:518` —
  **hata ayrıntısı yazılıp hiç okunmuyor; özet metni bulunmayan bir yere işaret ediyor.**
  `plan.decide` dört ayrı hata yolunun stderr'ini dört ayrı dosyaya alıyor
  (`/tmp/plan-diff.log`, `/tmp/plan-turbo.log`, `/tmp/plan-jq.log`,
  `/tmp/plan-shared-jq.log`) — ve bu dosyaların **hiçbiri hiçbir yerde `cat`/`echo`
  edilmiyor** (tüm `.github` ağacında doğrulandı: `/tmp/plan-` dizesi yalnızca bu beş
  satırda geçiyor, tek okuma referansı `:191`'deki **metin**). Runner iş sonunda yok
  edildiği için fail-open'ın gerçek sebebi **kalıcı olarak kaybolur**; tek görünen şey
  "`turbo --affected --dry=json` başarısız oldu ya da beklenen şemada değildi" gibi iki
  nedeni birleştiren bir cümle. Daha ağırı: `:191` özete _"ayrıntı: job loglarındaki
  `/tmp/plan-diff.log`"_ yazıyor — dosya **job loglarında değil**; bu, CLAUDE.md §4'ün
  yasakladığı **yanlış yorum/mesaj**, ve beş yıl sonra fail-open'ı teşhis etmeye çalışan
  kişiyi var olmayan bir çıktıya yönlendirir. Aynı sınıfın beşinci örneği `:518`: orada
  `turbo run test --dry=json` stderr'i `2>/dev/null` ile **tümüyle atılıyor** — `set -euo
pipefail` sayesinde adım yine kırmızıya düşer (davranış fail-closed ✓) ama kırmızının
  **sebebi hiç basılmaz**. Not: bunların hiçbiri CLAUDE.md anlamında "hata yutma" değil
  (hata olayı tespit ediliyor ve fail-open/fail-closed olarak yüzeye çıkıyor), bu yüzden
  `high` değil `medium`; kaybolan şey teşhis edilebilirliktir. — **Düzeltme:** her hata
  dalında ilgili log dosyasını job çıktısına bas (ör. `:184` civarına
  `for f in /tmp/plan-*.log; do [ -s "$f" ] && { echo "::group::$f"; cat "$f"; echo
"::endgroup::"; }; done`) ve `:191`/`:196`'daki "job loglarındaki" ifadesini gerçek duruma
  göre düzelt; `:518`'de `2>/dev/null` yerine stderr'i bir dosyaya al ve hata dalında bas.
  — **Sınıflandırma: (b)** — gerileme DEĞİL. `2>/tmp/plan-*.log` + "job loglarındaki"
  metni **FIX 1**'de (tur 1 A3/M3 düzeltmesi) geldi; tur 1 ve tur 2'de gözden kaçtı. FIX 2'nin
  katkısı yalnızca **dördüncü örneği eklemek** (`:170`, M2-2 düzeltmesinin parçası) —
  deseni yaygınlaştırdı ama açmadı. — `devops`

### low

- **[SEV: low]** `.github/ci-forbidden-tokens-permanent.txt:24-30` ile
  `.github/ci-forbidden-tokens.txt:73-80` — iki dosya çözümü **doğru** (bkz. §1 B
  değerlendirmesi), ama koruma **tek yönlü**: `guards` yalnızca `permanent ⊆ ana liste`
  iddiasını kuruyor. Sonuç: ileride **yeni** bir kalıcı yasak eklerken (ör. yeni bir yıkıcı
  Prisma bayrağı) kişi onu yalnızca ana listeye yazarsa, mekanik koruma o jetonu **hiç
  kapsamaz** ve jeton daha sonra sessizce silinebilir. Ters yön güvenli ve gürültülü
  (yalnızca referansa yazılırsa `guards` hemen kırmızı). İkinci bir sapma yüzeyi:
  `ci-forbidden-tokens.txt:73`'teki bölüm başlığı "AYNI 7 satır" diye **sayı** iddia ediyor
  — sekizinci kalıcı jeton eklendiğinde bu yorum yanlışa döner. Ayrıca `grep -qFx` ana
  listede **bölüm ayrımı yapmadan** arıyor; kalıcı bir jeton "GEÇİCİ" bölüme taşınsa kontrol
  yine yeşil kalır. — **Düzeltme:** referans dosyanın başlığına (ve PR şablonuna) "yeni
  kalıcı yasak İKİ dosyaya da eklenir" satırı ekle; `:73`'teki sayıyı metinden çıkar. İleri
  seçenek (borç): `pattern_file` yerine yalnızca ana listenin KALICI bölümünü (iki başlık
  arası) karşılaştır → bölüm taşıma da yakalanır. — `devops`
- **[SEV: low]** `.github/workflows/ci.yml:131-135` — **[DOĞRULANMALI]** `jq -re
'.packages[]'`'in `-e` bayrağı, **hiç çıktı üretilmediğinde** 4 ile çıkar (belgelenmiş
  davranış). Hiçbir workspace paketini etkilemeyen bir PR'da (ör. yalnızca `ROADMAP.md`,
  `docs/**` ya da — bu Task'ın kendi dosyaları — `scripts/**`; hiçbiri `:108`'deki
  `root_file_pattern`'e girmez) `--affected` kümesi boş olur → `schema_ok=false` →
  `:176` fail-open → **tüm hatlar koşar** ve özet "`turbo --affected --dry=json` başarısız
  oldu ya da beklenen şemada değildi" (`:196`) diyerek **var olmayan bir şema hatası**
  bildirir. Davranış yönü güvenli (fazla koşmak), ama (a) `plan` job'unun varlık sebebi olan
  `--affected` optimizasyonu bu PR sınıfı için hiç devreye girmez ve (b) gerekçe metni
  yanlıştır — teşhis eden kişiyi hayali bir turbo/jq hatasının peşine düşürür veya kontrolü
  "düzeltmek" için gevşetmeye iter. `low` çünkü yön güvenli ve kritik iddiası
  (`turbo --affected --dry=json`'ın boş kümede `"packages": []` ürettiği) **kabuk erişimim
  olmadığı için ölçülemedi**. — **Doğrulama:** `pnpm exec turbo run build --affected
--dry=json` çıktısını hiçbir paketi etkilemeyen bir base/head çiftiyle al, `.packages`
  alanına bak. — **Düzeltme (doğrulanırsa):** `jq -re` yerine `jq -e '.packages'` ile
  **alanın varlığını** doğrula, `.packages[]`'i ayrı oku; boş küme **geçerli sonuç** olarak
  ele alınsın (dört hat `false`, `shared=false`) ve fail-open'a değil "etkilenen paket yok"
  özetine düşsün. Bu, M2-2'de `shared_names` için kurulan "hata ≠ geçerli-ama-boş"
  ayrımının **aynısının** `:132`'de de kurulması demektir. — **Sınıflandırma: (b)** —
  gerileme değil; `jq -re` tur 1'den beri aynı, ilk iki turda M2-2'nin gölgesinde kaldı.
  — `devops`
- **[SEV: low]** `.github/actions/run-gates/action.yml:11` — M2-4 çağıranı düzeltti
  (`./packages/*` → `./packages/**`) ama bu composite'in `filter` girdisinin **dokümantasyon
  örneği** hâlâ eski ve artık yasaklanmış kalıbı gösteriyor: _"ör. `@arkesoft/api...` veya
  `./packages/*`"_. Beşli kapının **tek tanım yeri** burası; ileride altıncı bir çağrı yeri
  eklerken örneği kopyalayan kişi M2-4'ü birebir geri getirir. CLAUDE.md §4 — yorum güncel
  olmalı. — **Düzeltme:** örneği `./packages/**` yap ve tek seviyeli glob'un iç içe paketleri
  **kaçırdığını** bir yarım satırla söyle. — **Sınıflandırma: (a)** — FIX 2'nin doğurduğu,
  küçük ölçekli bir güncelsizlik. — `devops`
- **[SEV: low]** `.github/workflows/ci.yml:745`, `.github/ci-forbidden-tokens.txt:84` ve
  `scripts/sync-platform-version.ts:39` — üç yorum **kendi dosyasının (veya başka bir
  dosyanın) satır numarasına** atıf yapıyor: `":141"`, _"yukarıdaki satır 14-23"_,
  _"(satır 26)"_. Üçü **bugün doğru** (sırasıyla `ci.yml:141` shared türetimi,
  `ci-forbidden-tokens.txt:16-23` sürüm eşlemesi, `CHANGELOG.md:26` sentinel) ama satır
  numarası, içerik değişmeden bile kayar — bu dosyalar hâlâ aktif olarak büyüyor (iki turda
  `ci.yml` ~100 satır büyüdü). Sessizce yanlışa dönen yorum sınıfı. — **Düzeltme:**
  numara yerine **isimle** atıf (ör. "`shared_names` türetimi", "başlıktaki sürüm
  eşlemesi", "`CHANGELOG_SENTINEL` satırı"). — **Sınıflandırma: (b)**. — `devops`
- **[SEV: low]** `.github/workflows/ci.yml:357` ile `.github/workflows/ci.yml:415` — aynı
  hedef kümesi türetimi (`find .github/workflows .github/actions -type f \( -name '*.yml'
-o -name '*.yaml' \)`) **iki adımda birebir tekrarlanıyor**. Bu **gerçek tekrar**, yüzeysel
  benzerlik değil: iki kopya tek bir soruyu yanıtlıyor ("hangi dosyalar iş akışı/action
  dosyası") ve **aynı sebeple** değişir (ör. `.github/actions/*/*/action.yml` gibi daha
  derin bir düzen gelirse). Biri güncellenip diğeri unutulursa iki mekanik kontrol farklı
  yüzeyleri tarar — sessiz yeşil üretmez (her adım taradığını denetler) ama kapsam sessizce
  ayrışır. `low` çünkü tek satır ve grep'lenebilir. — **Düzeltme:** kümeyi bir kez türetip
  `$GITHUB_ENV`/dosyaya yaz, iki adım onu okusun; veya `guards`'a tek bir "tarama hedefi"
  adımı koy. — **Sınıflandırma: (b)**. — `devops`
- **[SEV: low]** `scripts/tsconfig.json:22` — `"types": ["node"]` preset'te **zaten var**
  (`packages/config/tsconfig/node.json:10`); burada tekrarlanması ölü yapılandırma. Zararsız
  ama "bu satır neden burada?" sorusunu doğuruyor ve preset `types`'ı değiştirirse bu kopya
  sessizce ezer. — **Düzeltme:** satırı sil (ya da neden açıkça tekrarlandığını yaz). —
  **Sınıflandırma: (b)**. — `devops`
- **[SEV: low]** `scripts/sync-platform-version.ts:54` — (**tur 1 ve 2'den devrediyor,
  kapanmadı; düzeltme istenmemişti**) `WORKSPACE_PACKAGE_GROUP_DIRS`
  `pnpm-workspace.yaml` ile elle eşleniyor; glob değişirse keşif sessizce eksik kalır ve
  `--check` Kural 2'nin drift dedektörü körleşir. Borç kaydı. — `devops`
- **[SEV: low]** `scripts/` — (**T3-1, kapsam dışı**) birim testi hâlâ yok; üç mod, sentinel
  yokluğu, fixed grup sapması ve ön-sürüm hatası (`:123-127`) davranış testi görmüyor.
  Kapsam genişletmesi talep edilmiyor. **Borç kaydı güncellenmeli:** A4'ün iki adımı
  (tsc + ESLint) artık **gerçekten** katı koşuyor (M2-3 kapandı) → T3-1 "kısmen kapandı
  (lint + katı tsc var, davranış testi yok)". — `devops`

---

## ÖLÇÜMLER

| Ölçüm                                                 | Değer                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Denetlenen dosya (bu tur)                             | **12** (`ci.yml`, `release.yml`, 3× `action.yml`, 2× jeton `.txt`, `scripts/tsconfig.json`, `scripts/eslint.config.mjs`, `sync-platform-version.ts`, `packages/db/package.json`, `schema.prisma`) + 4 referans okuma (`base.json`, `node.json`, `.gitignore`, `CHANGELOG.md`) |
| Komut çalıştırıldı mı                                 | **Hayır** — kabuk erişimi yok (tasarım gereği statik gate); tüm değerlendirme statik                                                                                                                                                                                          |
| **Kapanan bulgu sayısı**                              | **8/8** — 4 `medium` (M2-1…M2-4) + 4 `low` (D1, D2, B, C). Ayrıca tur 1 L5 (`db` `clean`) kapandı                                                                                                                                                                             |
| **Yeni bulgu dağılımı**                               | critical 0 · high 0 · **medium 1** · low 6 (+2 devreden borç `low`)                                                                                                                                                                                                           |
| Yeni `medium`'un sınıfı                               | **(b) ×1** — kaçırılmış kalem. **(a) gerileme: 0 `medium`**, yalnızca 1 `low` (`run-gates` örneği)                                                                                                                                                                            |
| Eskalasyon eğrisi                                     | tur 1: 4 `medium` → tur 2: 4 `medium` (3'ü (a)) → **tur 3: 1 `medium` (0'ı (a))** — yakınsıyor                                                                                                                                                                                |
| `any` kullanımı                                       | **0** (`sync-platform-version.ts:90` yalnızca açıklayıcı yorum)                                                                                                                                                                                                               |
| `@ts-ignore` / `@ts-expect-error` / `eslint-disable`  | **0**                                                                                                                                                                                                                                                                         |
| `as` zorlaması                                        | **1** — `sync-platform-version.ts:289`, Zod `parse` (`:288`) hemen ardında → CLAUDE.md §2'ye uygun                                                                                                                                                                            |
| `shellcheck disable` (shell)                          | **5** (1× SC2181 gerekçeli, 4× SC2016 gerekçeli) — hiçbiri susturma değil                                                                                                                                                                                                     |
| **Doğrulanamayan davranışsal iddia (kabuk yok)**      | **3** — (1) turbo'nun boş `--affected` çıktı şekli [low L2], (2) devops'un prob ölçümü (`*` vs `**`), (3) `tsc -p` exit 0. (2) ve (3) devops tarafından ölçüldü ve **kabul edildi**                                                                                           |
| Denetlenmeyen `jq`/komut ikamesi (shell)              | **0** — tur 2'de 2'ydi                                                                                                                                                                                                                                                        |
| Hata ayrıntısı yazılıp okunmayan yol                  | **5** (`ci.yml:111, 127, 132, 170` + `:518`) → tek `medium`                                                                                                                                                                                                                   |
| Elle tutulan (grafikten türetilmeyen) paket/job liste | **1** — `script:54` (gerekçeli borç). Tur 1'de 4, tur 2'de 2                                                                                                                                                                                                                  |
| `tsconfig` katılığı (`scripts/`)                      | **tam** — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` miras alınıyor; gevşetme 0                                                                                                                                                                       |
| En büyük TypeScript fonksiyonu                        | `runCheck` — **63 satır** (`sync-platform-version.ts:333-395`) — değişmedi                                                                                                                                                                                                    |
| En büyük shell bloğu                                  | `plan.decide` — **~157 satır** (`ci.yml:84-240`); artışın tamamı gerekçe yorumu                                                                                                                                                                                               |
| Dışa açılan fonksiyonların dönüş tipi                 | 15/15 açık ✓ (dosya hiçbir şey export etmiyor)                                                                                                                                                                                                                                |
| Boş `catch` / yutulan hata (TS)                       | **0**                                                                                                                                                                                                                                                                         |
| Birim testi (`scripts/`)                              | **0** (T3-1, kapsam dışı)                                                                                                                                                                                                                                                     |

## Orkestratöre notlar (bulgu değil)

- **Yakınsama cevabı: evet.** Üç turun `medium` eğrisi 4 → 4 → 1, ve bu turun tek
  `medium`'u **(b)** sınıfı; FIX 2 **hiç yeni `medium` gerileme doğurmadı** (tek (a) kalemi
  bir `low`: `run-gates` dokümantasyon örneği). Tur 2'nin "her tur dört yeni medium"
  görüntüsü kırıldı. `ESCALATED` gerekmez.
- **Tek `medium` tek bir düzeltme turu gerektirmez.** Teşhis basımı + iki yanlış metin
  düzeltmesi; `low` L2 ve L3 ile birlikte tek seferde kapatılabilir. §4'e göre 1 `medium`
  **PASS** olduğundan bu, teknik borç olarak da taşınabilir — karar Orkestratörün.
- **L2 (`jq -re` boş küme) ölçüm gerektiriyor.** devops tek komutla doğrulayabilir; iddia
  doğrulanırsa düzeltmesi M2-2'nin aynısı (hata ≠ geçerli-ama-boş) ve `plan` job'unu bu
  Task'ın kendi PR sınıfı (yalnızca `scripts/` + `.github/` dışı dosyalar) için anlamlı
  kılar.
- Tur 1/2'nin iki `docs`/`qa` notu hâlâ açık: `.changeset/config.json` `fixed` grubunun
  **9** üyesi vs. PO metnindeki "11 üye"; `CHANGELOG.md:26` sentinel metninin "Changesets bu
  çizginin altına yazar" demesi (yazan tek şey `scripts/sync-platform-version.ts`). İkisi de
  bu gate'in yüzeyi değil.
