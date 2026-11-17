# T-022 — GATE `security`, tur 2 (dar kapsam: F1/F2 kapanış doğrulaması)

- **Tarih:** 2026-11-17
- **Sürüm:** v0.0.20.1
- **Kapsam:** tur 1'in `medium` (F1) ve `low` (F2) bulgularının kapanışı + `devops`'un
  "dürüst sınır"ı hakkında karar. Yeni tarama YAPILMADI (dördüncü eksen avı
  tekrarlanmadı).

```
GATE: security
SONUÇ: PASS
```

---

## 1. F1 (`medium`) — ham test günlüğünün ANONİM indirilebilir artefakta yüklenmesi

**KAPANDI** (iki yeni, ayrı bulgu ile — aşağıda M1/L1).

### 1.1 Süzgeç `tee`'den ÖNCE mi ve HER İKİ pipeline'da mı — EVET

`.github/actions/run-gates/action.yml`:

- `:90-94` — "Birim/entegrasyon testleri": `pnpm exec turbo run test … 2>&1 | node scripts/redact-test-log.ts | tee /tmp/arkesoft-ci-test-output.log`
- `:140-144` — "Tenant izolasyon süiti": aynı sıra, ayrı dosya (`…-isolation-output.log`)

Süzgeç her iki hatta da `tee`'den ÖNCE; dolayısıyla hem konsol (job log) hem artefakt
dosyası aynı anda redakte ediliyor. `retention-days: 1` iki yükleme adımında da var
(`:115`, `:155`).

### 1.2 `pipefail` korunmuş mu — EVET (canlı ölçüldü)

`set -o pipefail` iki `run:` bloğunun da ilk satırı (`:91`, `:141`). Canlı ölçüm:

```
set -o pipefail; { echo "secret=…"; exit 7; } | node scripts/redact-test-log.ts | tee …
→ pipeline-exit=7      (artefakt içeriği: "secret=[REDACTED]")
```

Sahte yeşil üretmiyor; üreticinin gerçek çıkış kodu korunuyor.

### 1.3 Beş sır biçiminin beşi de kapsanıyor mu — EVET (elle beslendi)

`node scripts/redact-test-log.ts < <fikstür>` ile ölçüldü:

| # | Biçim                                     | Sonuç                                      |
| - | ----------------------------------------- | ------------------------------------------ |
| 1 | `otpauth://…?secret=…`                    | `secret=[REDACTED]`, URI'nin kalanı korundu |
| 2 | `.env` değerleri (`BETTER_AUTH_SECRET` …) | `[REDACTED]` — ham değer eşleşmesi **0**   |
| 3 | JSON `cookie`/`authorization`/`set-cookie`| üçü de `[REDACTED]`                        |
| 4 | ham `Set-Cookie` başlığı                  | `…session_token=[REDACTED]; Path=/; HttpOnly; Secure; SameSite=Lax` (öznitelikler korundu) |
| 5 | tek başına base32 TOTP sırrı              | `[REDACTED]`                               |

Tanı metni **korundu**: `AssertionError`, `- Expected: 200`, `+ Received: 401`, yığın
izi, dosya yolları aynen geçti. S7'nin varoluş sebebi (flake teşhisi) zedelenmedi.

Biçim 2 için ek doğrulama — `devops`'un "ad ile değil DEĞER ile maskeleniyor" iddiası
doğru ve CI'da gerçekten etkin:

- `auth-secret-leak.test.ts:45` → `BASE_ENV = parseEnv(apiEnvSchema)`, yani değer
  **kök `.env`'den** geliyor; süzgecin okuduğu dosyanın **aynısı**.
- CI'ın `api` job'u `setup-workspace`'i `create-env` varsayılanıyla (`'true'`) çağırıyor
  → `.env`, `.env.example`'dan üretiliyor ⇒ süzgecin "bilinen değerler" katmanı CI'da
  **boş değil**.
- Kök `.env` ile **varsayılan** (override'sız) yolda ölçüldü: çıktıda ham değer
  eşleşmesi `0`, `[REDACTED]` eşleşmesi `1`. (Değer rapora **basılmadı**.)

`.env.example` anahtar adı taraması: `SECRET_KEY_NAME_PATTERN` dört hassas anahtarı
yakalıyor (`POSTGRES_PASSWORD`, `MEILI_MASTER_KEY`, `S3_SECRET_ACCESS_KEY`,
`BETTER_AUTH_SECRET`). Desene takılmayan üç ad (`DATABASE_AUTH_URL`, `S3_ACCESS_KEY_ID`,
`AUTH_BASE_URL`) sır taşımıyor — `DATABASE_AUTH_URL`'ün gömülü parolası zaten
`POSTGRES_PASSWORD` değeriyle birebir aynı olduğu için alt-dizge eşleşmesiyle **o da**
maskeleniyor. Kaçan bir biçim bulunmadı (ANSI istisnası için L1'e bakınız).

### 1.4 Süzgecin kendisi risk mi — HAYIR (sızıntı yönünde fail-CLOSED)

- Kök `.env` **yalnızca okunuyor** (`readFileSync`), yazma yok. Okunan değerler hiçbir
  akışa yazılmıyor; yalnızca `includes`/`split-join` ile karşılaştırılıyor.
- `.env` **yoksa**: katman 2 sessizce devre dışı, diğer dört maskeleyici çalışmaya devam
  ediyor, çıkış 0 (ölçüldü — olmayan override dosyasıyla).
- `.env` **okunamazsa** (override bir dizine ayarlanarak `EISDIR` üretildi): script
  stderr'e bir satır yazıyor, **stdout'a 0 satır** çıkıyor ve exit 0 veriyor. Yani
  redaksiyonsuz geçiş **olmuyor** — günlük tamamen kayboluyor (teşhis kaybı + üreticinin
  SIGPIPE ile düşüp adımı gürültülü kırmızıya çevirmesi beklenir). Sızıntı ekseninde
  fail-CLOSED. (Not: `main().catch` mesajı "kalan girdi redaksiyonSUZ geçmiş olabilir"
  diyor; ölçüm bunun **aksini** gösterdi — metin olduğundan daha korkutucu, bulgu
  değil.)
- Satır bazlı `try/catch` (`:209-217`) ham satırı yazıyor — bu tek nokta fail-OPEN; ama
  maskeleyiciler yalnızca `String.replace`/`split` kullandığı için pratikte fırlatacak
  bir yol yok. Bulgu açmıyorum.

### 1.5 `ARKESOFT_REDACT_ENV_FILE_OVERRIDE` saldırgan kontrolünde olabilir mi — HAYIR (anlamlı kazanç yok)

- Değişken hiçbir workflow/action dosyasında **ayarlanmıyor**; gate adımlarının `env:`
  bloğunda yalnızca `FILTER` var.
- `ci.yml` tetikleyicisi `pull_request` (⚠ `pull_request_target` **değil**). Fork PR'ı
  workflow dosyasını değiştirip değişkeni set **edebilir** — ama aynı PR süzgeci tamamen
  **silebilir** de; her iki durumda da sızan içerik **saldırganın kendi fork'unun** test
  çıktısıdır ve fork koşumuna repo sırrı verilmez. Ayrıcalık kazancı yok.
- Override'ın kötü yöne etkisi yalnızca katman 2'yi devre dışı bırakmak; path traversal
  mümkün olsa bile dosya sadece "maskelenecek değer listesi" üretmek için okunuyor ve
  içeriği hiçbir yere yazılmıyor.

### 1.6 Yeni bulgu — M1 (`medium`): yeni `guards` adımı, koruduğunu iddia ettiği regresyonu GÖREMİYOR

`scripts/guards.sh:971-1027` (`check_secrets_raw_log_upload_boundary`) **iki eksende
kör**; ikisi de mutasyonla ölçüldü (gerçek dosyalar değiştirilmedi, kopya üzerinde):

- **(A) Dizin kapsamı.** Tarama `find ".github/workflows" -maxdepth 1` ile **yalnızca
  workflow** dosyalarını geziyor. `tee` + `upload-artifact` ikilisi ise
  `.github/actions/run-gates/action.yml` içinde — yani **hiç bakılmayan** dizinde.
  Üstelik awk durum makinesi `^jobs:` bloğu arıyor; composite action'da böyle bir blok
  **yok**, dolayısıyla dosya o dizine taşınsa bile eşleşmezdi.
  _Mutasyon:_ `run-gates/action.yml`'den `| node scripts/redact-test-log.ts` satırı
  silinmiş + `secrets.GITHUB_TOKEN` eklenmiş kopya → **BULGU YOK**.
- **(B) Tetikleyici koşul.** Kural bir job'da **üç** şeyi birden arıyor: `secrets.`,
  redaksiyonsuz `tee`, `upload-artifact`. Oysa `ci.yml`'de `secrets.` **hiç geçmiyor**
  (ölçüldü: tek kullanım `release.yml:82`). F1'in gerçek riski de `secrets.*` değildi,
  `.env`/ephemeral değerlerdi.
  _Mutasyon:_ `secrets.*` taşımayan, ham `tee` + `upload-artifact` yapan bir workflow
  job'u → **BULGU YOK**.

Saldırı/regresyon senaryosu: bir geliştirici (ya da gelecekteki bir refactor) yarın
`action.yml`'den redaksiyon borusunu kaldırır veya `retention-days`'i geri büyütür;
`pnpm guards` ve CI **yeşil** kalır, F1 sessizce geri döner ve public depoda anonim
indirilebilir ham günlük yeniden yayınlanır. `devops`'un "ihlal fikstürü → 1" kanıtı
doğru ama **bu Task'ın ürettiği şekle değil**, workflow-içi bir fiktif şekle bakıyor.

**Önerilen düzeltme (`devops`):** taramayı (1) `.github/actions/**/action.yml`
dosyalarını da kapsayacak şekilde genişlet (composite action'lar için `jobs:` durum
makinesi yerine dosya-bütünü değerlendirme), (2) tetikleyici koşuldan `secrets.`
şartını **kaldır** — "redaksiyonsuz `tee` çıktısı `upload-artifact` ile yükleniyor"
tek başına ihlal sayılsın, (3) `retention-days`'in 1'i aşmadığını da aynı adımda
doğrula.

### 1.7 Yeni bulgu — L1 (`low`): süzgeç ANSI renk kaçışlarına duyarsız

Ölçüldü: bu depoda vitest, çıktısı **bir boruya** yazılırken bile ANSI kaçışı üretiyor
(`npx vitest run src/__tests__/normalize-request-path.test.ts` çıktısında `ESC[36m`
vb. mevcut; 44/44 geçti). Beş maskeleyicinin hiçbiri satırdan önce ANSI sıyırmıyor.
Sentetik ölçüm (fikstürle):

- Renk kodu değeri **sarmalıyorsa** (`ESC[32m'<değer>'ESC[39m`) → maskeleme **çalışıyor**.
- Renk kodu jetonun **ortasına** düşerse (karakter düzeyli diff vurgusu)
  → `secret=[REDACTED]ESC[32mY3DPEHPK3PXPJBSWESC[39m` — sırrın **16 karakteri ham kaldı**.
- Renk kodu base32 koşusunun **hemen önüne** tırnak/boşluk olmadan düşerse
  (`"ESC[2mJBSW…`) → `\b[A-Z2-7]{16,}\b` sınırı bozuluyor, **hiç maskelenmiyor**.

Gerçek vitest çıktısının bir sırrı jeton ortasından bölüp bölmediğini **ölçmedim** —
bu yüzden `low`. Bugün sızabilecek değerler zaten §2'deki ephemeral/dev-only sınıf.
**Önerilen düzeltme (`devops`):** maskeleyicileri uygulamadan önce satırın ANSI
sıyrılmış bir kopyasını çıkar; herhangi bir maske tetiklendiyse **sıyrılmış+maskelenmiş**
satırı yaz (renk kaybı bir teşhis artefaktı için kabul edilebilir bedel).

---

## 2. KARAR — `devops`'un "dürüst sınır"ı: **KABUL EDİLEBİLİR KALAN RİSK**

İddia: "hiçbir biçim imleci taşımayan bir sır (ör. `log-correlation.test.ts`'teki gömülü
sabit fikstür) yakalanmaz." Kararı ölçerek verdim — sorulan şey, o yoldan **kalıcı** bir
değerin geçip geçemeyeceğiydi:

1. **`ci.yml` içinde `secrets.` hiç geçmiyor** (ölçüldü: `grep -n "secrets\." ci.yml
   release.yml .github/actions/*/action.yml` → **tek** eşleşme `release.yml:82`,
   `GITHUB_TOKEN`). `release.yml` ise `run-gates`'i çağırmıyor, test günlüğü
   yüklemiyor. ⇒ Bugün redakte edilen akışa **hiçbir kalıcı repo sırrı girmiyor**.
2. **CI'ın `.env`'i `.env.example`'dan üretiliyor** (setup-workspace `create-env`
   varsayılanı `'true'`) ⇒ o dosyadaki değerler zaten public depoda düz metin.
3. **Adı verilen fikstürler** (`apps/api/src/__tests__/log-correlation.test.ts:227-228`:
   `'oturum-cerezi-degeri-9f1a2b3c'`, `'Bearer gizli-erisim-tokeni-7d8e9f'`) **kaynak
   dosyada sabit yazılı** — public depoda herkesin okuyabildiği değerler. Marjinal ifşa
   **sıfır**.
4. Kalan şekilsiz değerler (oturum jetonu, DB kimlikleri) **job ömrüyle sınırlı**;
   runner ve ephemeral Postgres iş bitince yok oluyor.

⇒ Kalan risk gerçekten `security` tur 1'in "critical DEĞİL" gerekçesiyle **aynı sınıf**.
**Ek düzeltme turu GEREKTİRMİYOR.** Şartım şu: bu sonucu doğru tutan şey ("akışa kalıcı
sır girmiyor") **otomatik olarak korunmuyor** — tam da bu işi yapması beklenen
`guards` adımı M1'de ölçüldüğü gibi kör. M1 kapandığında kabul kararı kendini
savunabilir hâle gelir.

### Önerilen ROADMAP teknik borç satırları (metin `docs` içindir, ben yazmadım)

```
| T-022/sec-M1 | medium | scripts/guards.sh:971 — `check_secrets_raw_log_upload_boundary`
  yalnızca `.github/workflows/*.yml` tarar ve bir job'da `secrets.` görmeyi şart koşar;
  ham `tee`+`upload-artifact` ikilisi `.github/actions/run-gates/action.yml`'de olduğu
  ve `ci.yml` hiç `secrets.` taşımadığı için redaksiyon borusunun silinmesi mutasyonla
  ÖLÇÜLDÜ: guard 0 bulgu veriyor. Kapsamı composite action'lara genişlet, `secrets.`
  şartını kaldır, `retention-days ≤ 1` kontrolünü ekle. | devops | v0.0.21 |

| T-022/sec-L1 | low | scripts/redact-test-log.ts — maskeleyiciler ANSI renk kaçışlarına
  duyarsız; vitest boruya yazarken de renk üretiyor (ölçüldü). Kaçış jetonun ortasına
  düşerse kısmi, base32 koşusunun hemen önüne düşerse tam maskeleme kaybı oluşuyor
  (sentetik fikstürle ölçüldü). Maskelemeyi ANSI sıyrılmış kopya üzerinde yap. | devops | v0.0.21 |

| T-022/sec-F2 | low | apps/api/src/http/normalize-request-path.ts:322-341 — `'//'`/`'///'`
  ailesi artık `canonical` olduğu için `matchesPrefixOrUnparsablePercentEncoding`'in
  tutucu `true` güvencesini KAYBETTİ. Bugün erişilemez (path-to-regexp `/trpc/*path`
  için `false`); `/trpc` öneki OLMAYAN, önek tabanlı ikinci bir guard tüketicisi
  eklenirse `high`'a büyür. | backend | tüketici eklendiğinde |
```

---

## 3. F2 (`low`) — `normalize-request-path.ts` JSDoc'u koddan genişti

**KAPANDI.**

- JSDoc artık **koda eşit**: `:308-320` tutucu `true`'nun **yalnızca**
  `undecodable`/`unparsable` için geçerli olduğunu söylüyor; kod da tam olarak bunu
  yapıyor (`:349` ve `:351` — her iki fail-CLOSED `true` **yerinde**, `canonical` dalı
  normal `startsWith`'e gidiyor).
- `:322-341` açık bir **"⚠ BİLİNEN SINIRLAMA"** bloğu taşıyor: §1.5 fix'inin
  `unparsable` kümesini daralttığı, `'//'`/`'///'` ailesinin artık `canonical` olup
  `false` döndüğü, bunun ÖLÇÜLDÜĞÜ ve bugün erişilemez olduğu yazılı.
- Uyarım **birebir yazılı** (`:336-340`): _"İkinci, daha geniş bir rotaya … bağlı bir
  tüketici eklenirse bu `high`'a büyür — ROADMAP teknik borcuna kaydedilmesi
  gerekir"_. Borç satırı metni yukarıda (`T-022/sec-F2`).
- **Davranış değişmedi** (kod diff'i satır satır karşılaştırıldı): `canonicalizeRequestPath`
  birleştirmesi `resolve → decode → fold → strip` sırasını koruyor;
  `normalizeRequestPath` `undecodable`'da ham pathname üzerinde fold+strip'e devam
  ediyor (eski `decodePathnameSafely` davranışı), `unparsable`'da ham `rawUrl` dönüyor
  (tur 1'de incelenen davranışın aynısı); `matchesPrefix…` iki hata dalında da `true`.
  Üç sonuçlu union `assertNever` ile exhaustive. Hedefli koşum:
  `npx vitest run src/__tests__/normalize-request-path.test.ts` → **44/44 geçti**.

---

## 4. BULGULAR

```
BULGULAR:
  - [SEV: medium] scripts/guards.sh:971-1027 — `check_secrets_raw_log_upload_boundary`
    yalnızca `.github/workflows/*.yml` tarıyor (`find -maxdepth 1`) ve awk durum makinesi
    `^jobs:` bloğu arıyor; F1'in düzeltmesi ise `.github/actions/run-gates/action.yml`
    (composite action, `jobs:` bloğu YOK) içinde. Ayrıca kural bir job'da `secrets.`
    görmeyi şart koşuyor, `ci.yml`'de ise `secrets.` HİÇ geçmiyor. Mutasyonla ölçüldü:
    (A) redaksiyon borusu silinmiş action.yml → guard 0 bulgu; (B) `secrets.*` taşımayan
    ham `tee`+`upload-artifact` job'u → guard 0 bulgu. Senaryo: bir sonraki refactor
    redaksiyonu veya `retention-days: 1`'i geri alır, `pnpm guards` + CI yeşil kalır,
    public depoda anonim indirilebilir ham test günlüğü sessizce geri döner —
    kapatılan bulgu KORUNMASIZ. — Düzeltme: taramayı `.github/actions/**/action.yml`'e
    genişlet, `secrets.` şartını kaldır (redaksiyonsuz `tee` + `upload-artifact` tek
    başına ihlal), `retention-days ≤ 1` kontrolü ekle. — devops
  - [SEV: low] scripts/redact-test-log.ts:126-192 — beş maskeleyicinin hiçbiri satırdan
    ANSI kaçışlarını sıyırmıyor; bu depoda vitest boruya yazarken de renk üretiyor
    (ölçüldü). Renk kodu jetonun ORTASINA düşerse sırrın kalanı ham kalıyor; base32
    koşusunun hemen önüne düşerse `\b` sınırı bozulup maskeleme HİÇ çalışmıyor (ikisi de
    sentetik fikstürle ölçüldü). Gerçek vitest diff'inin jetonu bölüp bölmediği
    ÖLÇÜLMEDİ ⇒ `low`. — Düzeltme: maskelemeyi ANSI sıyrılmış kopya üzerinde uygula,
    maske tetiklendiyse sıyrılmış satırı yaz. — devops
```

**FAIL kuralı:** 1 `medium` + 1 `low` ⇒ **PASS** (1-2 `medium` → PASS, bulgular teknik
borca kaydedilir). `medium` için ayrı düzeltme turu zorunlu değil; borç satırı yeterli.

---

## 5. ÖLÇÜMLER

- **İncelenen dosya:** 8 — `.github/actions/run-gates/action.yml`,
  `scripts/redact-test-log.ts`, `scripts/guards.sh` (20. adım),
  `apps/api/src/http/normalize-request-path.ts`, `.github/workflows/ci.yml` (hedefli),
  `.github/workflows/release.yml` (hedefli), `.github/actions/setup-workspace/action.yml`,
  `apps/api/src/__tests__/auth-secret-leak.test.ts` (hedefli).
- **Koşturulan komutlar:** `node scripts/redact-test-log.ts` (6 ayrı fikstür: beş sır
  biçimi · `.env` varsayılan yolu · olmayan override · dizin override · ANSI fikstürü ·
  `pipefail` + `tee` zinciri), `awk` ile guard mutasyon testi (2 mutasyon),
  `npx vitest run src/__tests__/normalize-request-path.test.ts` → **44/44 geçti**
  (161 ms, `apps/api` dizininden).
- **`pipefail` ölçümü:** `(… exit 7) | redact | tee` → **pipeline-exit=7**, artefakt
  içeriği redakte.
- **Sır biçimi kapsaması:** 5/5 (ANSI'siz girdide); kaçan biçim yok. ANSI'li girdide
  2 alt-vaka kısmi/tam kaçırıyor (L1).
- **`pnpm audit`:** **koşturulmadı** — gerekçe: bu turda bağımlılık yüzeyi
  DEĞİŞMEDİ (`pnpm-lock.yaml` değişiklik listesinde yok; `package.json`'daki tek
  değişiklik `test:e2e` script'ine `--continue` eklenmesi). Tur 1'in audit ölçümü
  geçerli kalır.
- **Tenant izolasyon listesi (CLAUDE.md §7):** bu turun kapsamındaki değişiklikler
  (CI pipeline süzgeci + JSDoc) tenant'a bağlı bir kaynak, tablo, prosedür veya kuyruk
  işi EKLEMİYOR ⇒ karşılanmayan madde **yok**. `normalize-request-path.ts`'in
  davranışı tur 1'e göre değişmedi (madde 12 "hata mesajı sızdırmıyor" dahil).
- **Ortam koşulları:** ölçümler yerel makinede, yalnızca okuma ve stdin/stdout
  süzgeci ile alındı; Playwright/`pnpm test`/`test:isolation` **koşturulmadı**,
  konteyner/port durumu değiştirilmedi, kök `.env` **yalnızca okundu** (içeriği rapora
  basılmadı), geçici dosyalar `$CLAUDE_JOB_DIR/tmp` altında kaldı.
