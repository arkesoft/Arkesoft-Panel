# T-026 — `security` gate, tur 1

- **Tarih:** 2026-11-19
- **Sürüm:** ROADMAP v0.0.22
- **Kapsam:** `docs/api-contract-surface.json` artefaktının **yayımlanması** + onu üreten
  hat (`packages/trpc/contract/**`, `packages/trpc/scripts/**`, `scripts/guards.sh`
  eklentisi, `turbo.json`, `package.json`×2, `tsconfig.json`)
- **Yöntem:** **statik** denetim. Komut koşturma yasağı (`qa` paralel koşuyor, run-owner
  kapısı aktif) nedeniyle hiçbir test/build/audit komutu çalıştırılmadı; yalnızca
  `rg`/`grep`/`jq`/`git` (okuma)/`node -p` kullanıldı.

```
GATE: security
SONUÇ: PASS
```

---

## 0. ⚠⚠ ÖNCE: handoff'un bir öncülü OLGUSAL OLARAK YANLIŞ

Handoff şöyle diyordu: _"⚠ Depo **private**; `pnpm-lock.yaml` zaten aynı bilgiyi taşıyor"_.

**Depo PUBLIC.** Depo içinde, birbirinden bağımsız **dört** yerde ölçülmüş olarak yazılı:

- `.github/actions/run-gates/action.yml:73` — "Depo PUBLIC (ölçüldü) ve bu artefakt ANONİM indirilebilir"
- `.github/workflows/ci.yml:1543` — "BU DEPO PUBLIC olduğu için ANONİM indirilebilir hâle geliyor"
- `scripts/redact-test-log.ts:7` — "`security` F1 ÖLÇTÜ: depo PUBLIC"
- `.gitignore:53`, `scripts/playwright/base.ts:111,137`, önceki gate raporları (T-024 `security` tur 1/2/4, T-020 S-4)

Bu, bu gate'in tehdit modelini **kökten** belirler ve "ölçülmüş tuzaklar" listesindeki
_"kendi gerekçemiz olgusal olarak yanlış olabilir"_ sınıfının bu Task'taki ilk vakasıdır.

**Sonuç:** "artefakt HTTP üzerinden servis edilmiyor" ölçümü **doğru** (aşağıda §4) ama
**taşıyıcı bir azaltma DEĞİL** — artefakt commit edildiği anda `raw.githubusercontent.com`
üzerinden **kimlik doğrulamasız** okunabilir hâle gelir. Bu gate'in kararı bu varsayımla
verildi; yine de **PASS**, çünkü **marjinal açıklama sıfır** (ölçüm §5).

---

## 1. EKSEN 1 — `.default()` değerleri artefakta giriyor

**SONUÇ: TEMİZ.** Nasıl ölçüldüm (iddiadan bağımsız, yapısal):

```bash
jq '[paths | select(.[-1]=="default")] | length' docs/api-contract-surface.json   # → 3
```

Üçünün tamamı ve **tam değerleri**:

| Yol                                                | Değer |
| -------------------------------------------------- | ----- |
| `procedures.job.list.input.properties.limit`        | `20`  |
| `procedures.platform.auditLog.input.properties.limit`   | `50`  |
| `procedures.platform.tenantList.input.properties.limit` | `20`  |

Üçü de sayfalama üst sınırı tamsayısı ⇒ **hassas değil**. `architect`'in verdiği
kaynak satırlarıyla (`platform.schema.ts:89`, `:159`, `job-summary.schema.ts:169`)
sayı **ve** anlam uyuyor. Artefaktta **başka** `default` anahtarı **yok** (jq yol
taraması tüm derinlikleri kapsar — tek seviye değil).

⚠ Ama bu eksenin **mekanik kapısı yok** — bkz. F2.

## 2. EKSEN 2 — `.describe()` → `description` emisyonu

**SONUÇ: TEMİZ, üç bağımsız ölçümle.**

1. **Kaynak tarafı (teyit):** `rg -e '\.describe\(' -e '\.meta\(' -e '\.register\('`
   → `packages/trpc/src` + `packages/trpc/scripts`: **0 eşleşme / 64 dosya / 464 699 bayt
   tarandı**. (Komut gerçekten çalıştı — `--stats` bayt sayısı bunun kanıtı, "boş çıktı"
   değil.)
2. **ÜRETİLEN ARTEFAKT tarafı (handoff'un ısrarla istediği ölçüm):**
   `jq '[paths | select(.[-1]=="description" or .[-1]=="title" or .[-1]=="$comment" or .[-1]=="examples" or .[-1]=="deprecated" or .[-1]=="readOnly" or .[-1]=="writeOnly")] | length'`
   → **0**. Ham `grep -cE '"(description|title|\$comment|examples|deprecated)"\s*:'` → **0**
   (jq'den bağımsız ikinci yol).
3. **Dolaylı kanal:** artefaktın **tüm** anahtar kümesini çıkardım (`jq [paths|.[-1]]|unique`).
   Üretilen şema anahtarları **tam olarak**: `$schema additionalProperties anyOf const
   default enum format items maxLength maximum minLength minimum pattern properties
   required type` + alan adları + `generator/formatVersion/namespaceCount/procedureCount/
   operation/input/output`. `$ref`/`$defs`/`description` **hiç yok** ⇒ Zod bu sürümde
   başka bir yoldan (`.meta()` dahil) metin **emit etmiyor**.
4. **Transitif şemalar:** `packages/trpc/src/schemas/trpc-error-data.schema.ts:22`
   `@arkesoft/errors`'tan `appErrorBodySchema` ithal ediyor; repo genelinde (`packages`
   + `apps`) `.describe(` taraması **yalnızca** Playwright `test.describe` eşleşmeleri
   verdi (18 adet, tamamı `*.spec.ts`) ⇒ Zod `.describe()` **hiçbir** pakette yok.

## 3. EKSEN 3 — `enum` değerleri + `platform.*` yüzeyinin yayımlanması

**SONUÇ: TEMİZ; politika kararı aşağıda bağlandı.** 16 `enum` düğümünün tamamını ve
tek `const` düğümünü listeledim. Yayımlanan domain sözlüğü: iş durumları, rol adları
(`owner/admin/staff/support/readonly`), kiracı durumları, onboarding adımları,
tarayıcı/OS aileleri, slug sonuç kodları, site türleri ve **süper admin denetim
eylemleri** (`platform_admin_signed_in`, `tenant_impersonation_started`).

**Hiçbir enum değeri sır, kimlik, kiracı verisi veya iç ana bilgisayar adı taşımıyor**
(doğrulama: artefakt genelinde `demo|magaza|arkesoft|tnt_|usr_|@` → 0 eşleşme).

### ⭐ POLİTİKA KARARI — `platform.*` yayımlanmaya DEVAM EDER (bilinçli)

`po`'nun bana bıraktığı soruya karar: **tüm router yüzeyi, `platform.*` dahil,
yayımlanır; allowlist/denylist KURULMAZ.** Üç ölçülmüş gerekçe:

1. **Marjinal açıklama sıfır.** Artefaktın `platform.*` altındaki **her** değeri aynı
   PUBLIC depoda **zaten takip edilen** kaynakta var: iki denetim eylemi
   `packages/trpc/src/schemas/platform.schema.ts:138-141` **ve**
   `packages/db/prisma/schema.prisma:1236-1238` **ve**
   `packages/db/prisma/migrations/20261115100000_platform_admin_and_audit_log/migration.sql:69`;
   `limit` üst sınırları `platform.schema.ts:147`; prosedür yolları
   `packages/trpc/src/routers/platform.router.ts`. (Dördü de `git ls-files` ile takip
   edildiği teyit edildi.) Artefakt **yeni bilgi üretmiyor**, var olanı **projeksiyon
   ediyor**.
2. **Hariç tutmak güvenliği DÜŞÜRÜR.** `platform.*` deponun **en yüksek yetkili**
   yüzeyi. Dışlanırsa süper admin girdi/çıktılarındaki kırıcı değişiklik (ör.
   `platform.auditLog` çıktısından bir alanın sessizce düşmesi, `platform.tenantList`
   girdisinin genişlemesi) **hiçbir kapıyı kırmaz**. Kapsama almak bir tespit
   kazancıdır.
3. **Elle tutulan dışlama listesi, bu deponun ÖLÇÜLMÜŞ sessiz-sapma sınıfıdır.**
   CLAUDE.md §7'nin son maddesi (T-016'da mutasyonla ölçüldü): kural dizinin _üzerinde_
   dönerse, listeye **hiç** eklenmeyen nesne **sıfır bulguyla** geçer. Bir
   `EXCLUDED_NAMESPACES` dizisi aynı tuzağı sözleşme hattına taşır.

⚠ Kararın şartı: bu **yazılı** olmalı. ADR-0027 bugün `platform.*`'ın yayımlanmasına
**hiç değinmiyor** ⇒ F1.

## 4. "Artefakt HTTP üzerinden servis edilmiyor" — ÖLÇÜM

**Uygulama içi servis yolu YOK (doğrulandı):**

- `rg -n 'api-contract-surface' .` (hidden dahil) → 17 eşleşme; **tamamı** yorum/doküman/
  üretici/test. `apps/**` içinde **sıfır** referans.
- `ServeStatic|express.static|useStaticAssets|serveStatic|publicDir` → `apps/**`'te
  artefaktla ilgili **sıfır** eşleşme (tek `'docs'` eşleşmesi
  `apps/api/src/__tests__/registration.test.ts:164` ve o **rezerve alt alan adı
  listesi** — `docs` kiracıya verilmiyor, ilgisiz ama olumlu).
- `.github/workflows/*.yml` + `actions/*/action.yml` içinde `docs/**` yükleyen/yayımlayan
  adım **yok**.

⚠ **Ama** (§0): depo PUBLIC olduğundan artefakt commit edildiğinde **zaten** anonim
okunabilir. Bu ölçüm "sızmıyor" demez, "**uygulama** bir ek kanal açmıyor" der.

## 5. D6 yasak jetonları — BAĞIMSIZ teyit

Orkestratör'ün "0" ölçümünü bağımsız olarak doğruladım, **iki** farklı yöntemle:

1. **Ham dosya taraması:** `/Users/`, `/home/`, `/var/folders`, `/private/`, `C:\`,
   `file://`, `node_modules`, `.local`, `localhost`, `127.0.0.1`, `.internal`,
   `arkesoft.app` → **0 eşleşme**. Karşıt kanıt (tarama vacuous değil): bu makinenin
   gerçek jetonları `node -p` ile okundu — `Kullanc-MacBook-Pro.local` / `kullanici` /
   `/Users/kullanici`; **hiçbiri** dosyada yok.
2. **Yanlış-pozitif tuzağından arınmış değer taraması:** `pattern`/`$schema`/`format`
   anahtarları **hariç** tutularak (ISO-8601 regex'leri tarih gibi görünür — naif bir
   tarama burada FP verirdi) tüm string değerler çıkarıldı ve
   `[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{2}:[0-9]{2}:[0-9]{2}|[0-9]{10,}|uuid|ULID` desenleriyle
   tarandı → **0 eşleşme**. Kalan string değerler **tamamen**: `generator.{zod,trpcServer}`
   semver'leri, `operation` değerleri, `required` dizisi elemanları (alan adları), `enum`
   üyeleri, `type` adları.

⇒ **zaman damgası / mutlak yol / makine adı / rastgele kimlik: 0.** D6 bu artefakt için
**karşılanıyor**. ⚠ Yine de **mekanik kapısı yok** (kontrol `docs/api-versioning.md:81-85`
ile **elle** inceleme olarak tanımlı) — F2.

## 6. `generator` bloğu bir bilgi sızıntısı mı?

**Hayır — marjinal açıklama sıfır (ölçüldü).** `zod 4.6.7` ve `@trpc/server 11.19.0`
aynı PUBLIC depoda takip edilen `pnpm-lock.yaml`'da **zaten** birebir var
(`pnpm-lock.yaml:381,597` → `zod@4.6.7`; `:849,2550` → `@trpc/server@11.19.0`).
Saldırgan için yeni bilgi yok. Bulgu **yazılmadı** (SEV atamadım).

## 7. `S2`'nin ÜÇ KÖR NOKTASI — güvenlik değerlendirmesi

### (1) `compareFieldConstraint` üç eksenle sınırlı → fail-CLOSED

**Güvenlik açısından SORUN DEĞİL.** `minLength`/`format`/`multipleOf` değişimi
`isSchemaEqual` false + üç eksende fark yok ⇒ `classify-contract-change.ts:331-334`
**`NARROWED`** (= `MAJOR`) döner. Aşırı-sıkı, **yanlış değil**; kaçırma yönünde hata
üretmiyor. Bulgu yok.

### (2) Girdi/çıktı şemasının VAR/YOK geçişi (`null`↔nesne) — **BU BİR fail-OPEN MU?**

**Cevap: EVET, sınıflandırıcı bu eksende fail-OPEN'dır** — ama **kanal tek katmanla
kapalıdır**. Ölçüm:

- `classify-contract-change.ts:520-522`: `beforeSchema === null || afterSchema === null`
  → `return []`. Çağıran (`:699-702`) `diffs`'i `reduce` ile birleştirdiği için sonuç
  `severity: 'PATCH'`, `diffs: []` ⇒ **"hiç değişiklik yok" cevabından AYIRT EDİLEMEZ.**
  Modülün geri kalanı (kıyaslanamaz küme → `NARROWED`, bilinmeyen eksen → `NARROWED`,
  `inputs.length>1` → **fırlat**) fail-CLOSED iken bu dal **izin verici** cevabı veriyor.
  Asimetri kodda gerekçelenmemiş ("kapsam dışı" denmiş).
- ⚠⚠ Daha kritik tespit: **Katman 1 testi bu geçişi YAKALAMAZ.**
  `contract-surface.test.ts:319-329` diskteki belgeyi canlı belgeyle
  `classifyContractChange` ile karşılaştırıp `diffs.length === 0` + `'PATCH'` bekliyor.
  `.input()` bir prosedürden kaldırılırsa disk=nesne / canlı=`null` ⇒ `[]` ⇒ bu test
  **YEŞİL KALIR**. Yani "anlamsal freshness" katmanı bu sınıfta **sessiz**.
- ⭐ **Kanalı kapatan tek şey Katman 2:** `input: null` artefakta **açıkça** yazılıyor
  (`build-contract-surface.ts:85-88`; artefaktta `"input": null` → satır 308, 446, 505,
  520, 536) ⇒ bayt-birebir testi (`contract-surface.test.ts:276-283`) **kırılır**.
- **Somut senaryo (teorik değil):** geliştirici bir prosedürü argümansız hâle getirir
  (`.input()` kaldırılır) ⇒ Katman 2 kırmızı ⇒ rapor/dokümantasyonun yönlendirdiği
  `contract:generate` koşturulur (`classify-contract-change.ts:746` o satırı **kendisi**
  öneriyor) ⇒ sınıflandırıcı **`PATCH`** der ⇒ girdi doğrulamasının **tamamen kalktığı**
  bir değişiklik "kırıcı değil" olarak sürüm alır. Etki: semver yanlışlığı **ve**
  CLAUDE.md §4'ün "her dış veri Zod ile parse edilir" kuralının kaybının **görünmez**
  kalması.
- ⭐ Olumlu: bu fail-open davranışı **hiçbir test tarafından PİNLENMEMİŞ**
  (`classify-contract-change.test.ts`'te `input: null` geçişi için assert yok — 27 `it()`
  tarandı). T-023'ün "test kapatılan hatayı pinler" tuzağına **düşülmemiş**; düzeltme
  bir testi gevşetmeyi gerektirmez.

⇒ **F3 (medium).**

### (3) `GENERATOR_DRIFT` genel `severity`'ye katılmıyor

**Bugün sömürülebilir değil:** `rg` ile ölçtüm — `classifyContractChange` /
`formatContractChangeReport`'un **test dışı hiçbir çağıranı yok** (S4'ün CI tüketicisi bu
sürümde yok). `formatContractChangeReport:749-755` sapmayı metne **her zaman** yazıyor ve
ADR-0027 (`:138`) + `docs/api-versioning.md:155-160` programatik tüketici uyarısını
**açıkça** belgeliyor. ⇒ **F4 (low)** — borç satırı; v0.0.23'ün CI tüketicisi yazılmadan
**önce** kapanmalı.

## 8. Tenant izolasyonu değerlendirmesi (CLAUDE.md §7, 17 madde)

**Karşılanmayan madde: YOK.** Gerekçe ölçülmüş, "uygulanamaz" diye geçiştirilmedi:

- Değişiklik **tek bir** prosedür, tablo, sorgu, kuyruk işi, önbellek anahtarı, S3 öneki
  veya arama indeksi **eklemiyor/değiştirmiyor**. `git status` + `git diff --stat`:
  `packages/trpc/src/routers/**` ve `packages/trpc/src/schemas/**` **el değmemiş**
  (X9 doğrulandı — çıktı tamamen boş). Hiçbir `.prisma`/`.sql` dosyası diff'te yok ⇒
  §7'nin 14-17. maddeleri (türetilmiş DB nesnesi, `SECURITY DEFINER`, şema açma, sır
  taşıyan tablo) **uygulanamaz**, kör noktaya girecek bir nesne eklenmedi.
- **Artefakt kiracı verisi taşımıyor** (ölçüldü): hiçbir kiracı id'si, slug'ı, adı,
  e-postası, IP'si yok — yalnızca alan **adları**, enum **üyeleri** ve araç sürümleri.
  `ipAddress`/`token`/`sessionId` yalnızca **alan adı** olarak var, **değer** olarak
  değil.
- Çapraz-kiracı okuma/yazma yüzeyi **genişlemedi** ⇒ `createTenantIsolationSuite()`
  gerektiren yeni kaynak yok.

Yan ölçüm (kapsam dışı, bulgu değil): `session.me`'nin yayımlanan `sessionId` alanı
oturum **jetonu değil**, Better Auth oturum **kaydı id'si** —
`apps/api/src/auth/auth.module.ts:184` (`sessionId: result.session.id`). Artefakt bir sır
alanının varlığını **ilan etmiyor**.

## 9. Diğer güvenlik eksenleri (hepsi temiz)

- **Enjeksiyon / komut / yol:** yeni kodda `child_process`/`execSync`/`eval`/`fetch`
  **yok** (`rg` → 0). `generate-contract-surface.ts`'in yazdığı yol
  (`DOCS_CONTRACT_SURFACE_PATH`) `import.meta.url`'den **sabit** hesaplanıyor, kullanıcı
  girdisi interpolasyonu yok ⇒ path traversal **imkânsız**. `process.env` **hiç
  okunmuyor**; `process.argv[1]` yalnızca giriş-modülü tespiti için (`:244`).
- **`scripts/guards.sh` eklentisi:** tüm değişken genişletmeleri **tırnaklı**, `eval`
  yok. `pnpm exec turbo run test:contract --dry=json` **görev çalıştırmaz** (dry) ⇒
  run-owner kapısını tetiklemez. `set -uo pipefail` (`:50`) **ayarlı** ⇒ `if ! var=$(turbo | jq | sort -u)`
  dalı gerçekten erişilebilir; turbo boş dönse bile küme karşılaştırması **fail-closed**
  (`""` ≠ `@arkesoft/trpc`) ⇒ çift emniyet.
- **Sır yönetimi / repoya sır girişi:** 15 değişen/yeni dosyanın tamamında
  `password|secret|api[_-]?key|PRIVATE KEY|bearer|AKIA…|ghp_…` taraması → tek eşleşme
  `scripts/guards.sh:1194`, **bu diff'in parçası değil** (yeni blok `:1224`'ten sonra
  başlıyor) ve zaten bir **kontrol mesajının metni**. `.env`/kimlik bilgisi dosyası
  eklenmemiş.
- **Yeni bağımlılık:** **yok.** `pnpm-lock.yaml` **değişmemiş** (git status), iki
  `package.json` diff'i **yalnızca** `scripts` alanına dokunuyor. `prettier` kökte
  **mevcut** bir `devDependency` (`catalog:`).
- **Yayımlanan pakete sızma riski yok (iddianın mekanik teyidi):**
  `tsconfig.json`'a `scripts/**/*` eklenmesi dağıtımı **etkilemiyor** —
  `packages/trpc/tsconfig.build.json` `include` **hâlâ** yalnızca `["src/**/*"]` ve
  `package.json` `files: ["dist"]` ⇒ `scripts/` (ve dolayısıyla `prettier`'a yapılan
  ithalat) `dist/`'e **girmiyor**, tüketiciye **gitmiyor**.
- **`.gitignore` / kazara artefakt:** `dist/`, `build/`, `coverage/`, `.turbo/`,
  `.vitest/` ignore'lu; `git ls-files | grep -E '(dist|build|coverage|\.turbo)/'` →
  **0 satır** (takip edilen türetilmiş dosya yok). `?? ` listesinin tamamı bilinçli
  üretim çıktısı. `docs/api-contract-surface.json` **bilerek** sürüm kontrolüne
  girecek (henüz `git add` edilmedi).
- **KVKK:** artefakt kişisel veri **içermiyor** (§8). Yeni veri toplama/saklama yok.

---

## BULGULAR

- **[SEV: medium]** `packages/trpc/src/__tests__/contract-surface.test.ts:276-283`
  (+ `scripts/guards.sh:1305-1330`) — **Otomatik yayımlama hattının içerik kapısı yok.**
  Hat, `.default()` değerlerini ve (bugün 0 olan) `.describe()` metinlerini artefakta
  **birebir** yazıp **PUBLIC** bir depoya commit ediyor; iki kapının **hiçbiri** içeriği
  denetlemiyor — bayt testi yalnızca "disk == yeniden üretilen" diyor (yeniden üretim bunu
  **her zaman** sağlar), `guards.sh` alt kontrol 3 yalnızca **varlık** denetliyor. D6
  disiplini bugün `docs/api-versioning.md:81-85`'te **elle inceleme** olarak tanımlı.
  **Somut senaryo:** geliştirici bir şemaya `z.string().default(process.env.SMTP_FROM ?? '…')`
  veya `.describe('Yalnızca X müşterisi için; iç sağlayıcı kimliği …')` ekler (ya da
  `.default(() => new Date().toISOString())` gibi **hesaplanan** bir varsayılan) ⇒
  `contract:generate` **değerlendirilmiş** değeri artefakta gömer ⇒ bayt testi kırmızı
  yanar, geliştirici dokümanın yönlendirdiği gibi yeniden üretir ve diff'i "beklenen
  gürültü" sayıp **anonim okunabilir** bir dosyaya commit eder. Kaybedilen: iç bilgi /
  ortam değeri; yan etki: D6 determinizminin sessiz ihlali.
  **Düzeltme (ucuz, bugünkü ölçümle önemsiz):** `contract-surface.test.ts`'e fail-closed
  bir **içerik** iddiası ekle — (a) artefaktta `description`/`title`/`$comment`/`examples`
  anahtarı **0** (bugün 0 ⇒ ilk emisyonda kırılır), (b) her `default` değeri
  `number`/`boolean` (bugün 3 sayı), (c) D6 yasak jeton regex'i (mutlak yol / ISO zaman
  damgası / UUID-ULID) artefaktın `pattern` **dışındaki** string değerlerinde **0**.
  — **sorumlu: `backend` (S1/S2)**, ikincil `devops` (aynı iddia `guards.sh`'e de konabilir).

- **[SEV: medium]** `packages/trpc/src/contract/classify-contract-change.ts:520-522` —
  **Sınıflandırıcının `null`↔nesne dalı fail-OPEN.** Girdi/çıktı şemasının var/yok
  geçişinde boş dizi dönüyor ⇒ `severity: 'PATCH'` + `diffs: []`, "değişiklik yok"tan
  ayırt edilemez; modülün diğer tüm bilinmeyen durumları fail-CLOSED `NARROWED`/fırlatma
  iken bu dal izin verici. Katman 1 testi (`contract-surface.test.ts:319-329`) bu sınıfı
  **yakalamıyor** (ölçüldü); kanalı **yalnızca** Katman 2 bayt testi kapatıyor ⇒
  "tek katman ≠ kapalı kanal" sınıfı. **Somut senaryo** §7(2)'de: `.input()` kaldırılır,
  bayt testi kırılır, yeniden üretilir, sınıflandırıcı `PATCH` der ve **girdi
  doğrulamasının tamamen kalktığı** bir değişiklik kırıcı olmayan sürümle gider.
  **Düzeltme:** `null`↔nesne geçişinde fail-CLOSED davran — ya mevcut
  `INPUT_FIELD_REMOVED`/`OUTPUT_FIELD_REMOVED` sınıfını üret, ya da (kapsam dışı kalması
  gerekiyorsa) `resolveSingleInputParser`'ın deseniyle **gürültülü fırlat**; sessiz `[]`
  dönme. Hiçbir test bu davranışı pinlemiyor ⇒ düzeltme test gevşetmesi gerektirmez.
  — **sorumlu: `backend` (S2)**

- **[SEV: low]** `docs/adr/0027-public-api-sozlesme-yuzeyinin-olcumu-ve-semver-siniflandirmasi.md`
  (Sonuçlar bölümü) + `docs/api-versioning.md:58-62` — **Tehdit modeli yazılı değil.**
  İki doküman da (a) artefaktın **PUBLIC** bir depoda yayımlandığını ve dolayısıyla
  **anonim okunabilir** olduğunu, (b) `platform.*` (süper admin + denetim kaydı)
  yüzeyinin **tamamının** bilinçli olarak yayımlandığını **hiç** söylemiyor. Handoff'un
  "depo private" öncülü (§0) bu boşluğun doğrudan sonucudur. Sömürü değil, **yanlış
  gerekçeye dayanarak gelecekte alınacak karar** riski.
  **Borç satırı:** `[low]` — ADR-0027'nin "Olumsuz ve kabul edilen maliyetler" bölümüne
  iki cümle: "Artefakt PUBLIC depoda yayımlanır; içeriği kamuya açık kabul edilir" +
  "`platform.*` dahil tüm router yüzeyi bilinçli olarak kapsamdadır (gerekçe: marjinal
  açıklama sıfır — kaynak zaten public; dışlama listesi CLAUDE.md §7'nin sessiz-sapma
  sınıfını üretir)". — **sorumlu: `docs` (S4)** — **vade: v0.0.22 (bu sürümde, `docs` turu)**

- **[SEV: low]** `packages/trpc/src/contract/classify-contract-change.ts:135-139,699-708`
  — **`GENERATOR_DRIFT` genel `severity`'ye katılmıyor.** Bugün programatik tüketici
  **yok** (ölçüldü) ve ADR-0027:138 + `api-versioning.md:155-160` uyarıyı belgeliyor ⇒
  bugün sömürülebilir değil. Ama v0.0.23'ün CI adımı `classification.severity`'ye bakarsa
  bir `zod`/`@trpc/server` yükseltmesinin ürettiği doğrulama semantiği değişimi sessiz
  geçer.
  **Borç satırı:** `[low]` — v0.0.23'te sözleşme kapısının CI tüketicisi yazılırken
  `generatorDrift.changed` **ayrıca** okunacak (veya tipi, tüketiciyi buna zorlayacak
  şekilde `severity`'yi `GeneratorDriftReport` olmadan okunamaz kılacak) — **sorumlu:
  `devops`** — **vade: v0.0.23**

**FAIL kuralı uygulaması:** 0 critical, 0 high, **2 medium**, 2 low ⇒ AGENT_BASELINE §4
tablosu "1–2 `medium` → PASS, bulgular teknik borca kaydedilir". ⇒ **PASS.**
⚠ İki `medium` de **ucuz** ve bu sürümde kapatılabilir; Orkestratör düzeltme turu açmayı
seçerse ikisi **aynı dosya ailesinde** (`packages/trpc/src/contract/**` +
`src/__tests__/contract-surface.test.ts`) tek turda kapanır.

## ÖLÇÜMLER

- **İncelenen dosya:** **15** (5 değişen: `package.json`, `packages/trpc/package.json`,
  `packages/trpc/tsconfig.json`, `turbo.json`, `scripts/guards.sh` · 10 yeni: artefakt,
  2 doküman, 2 script, 3 `contract/**` modülü, 2 test) + bağlam için 9 dosya
  (`platform.schema.ts`, `session.router.ts`, `session-identity.schema.ts`,
  `auth.module.ts`, `schema.prisma`, `pnpm-lock.yaml`, `tsconfig.build.json`,
  `.gitignore`, `registration.test.ts`).
- **Tenant izolasyon listesinden karşılanmayan madde:** **YOK** (hiçbir yeni kiracıya
  bağlı kaynak/DB nesnesi eklenmedi; `routers/**` + `schemas/**` el değmemiş — X9
  doğrulandı).
- **Eksen 1 (`default`):** 3 anahtar, üçü de sayfalama tamsayısı (20/50/20) — temiz.
- **Eksen 2 (`description`):** artefaktta **0** (jq + ham grep); kaynakta `.describe(`/
  `.meta(`/`.register(` **0/64 dosya/464 699 bayt**; repo genelinde Zod `.describe()` **0**.
- **Eksen 3 (`enum`):** 16 düğüm + 1 `const`; sır/kimlik/kiracı verisi **0**.
- **D6 yasak jeton:** mutlak yol/home/makine adı **0**; zaman damgası/rastgele kimlik
  **0** (`pattern`/`$schema`/`format` hariç tutularak — FP tuzağı kapatıldı); karşıt
  kanıt: gerçek makine jetonları (`Kullanc-MacBook-Pro.local`, `kullanici`,
  `/Users/kullanici`) dosyada **yok**.
- **Artefakt:** `md5 3671b25e253478b90a40cb86902a9064`, 21 981 bayt, `formatVersion=1`,
  `namespaceCount=7`, `procedureCount=17` (jq ile bağımsız okundu; tazelik ölçümü komut
  yasağı nedeniyle devralındı).
- **Sır taraması:** 15 dosyada 0 yeni eşleşme (tek hit `guards.sh:1194`, diff dışı).
- **Yeni bağımlılık:** 0 (`pnpm-lock.yaml` değişmemiş).
- **`pnpm audit`:** **ÇALIŞTIRILMADI** — komut koşturma yasağı (`qa` paralel, run-owner
  kapısı aktif). Telafi edici ölçüm: bağımlılık grafiği bu Task'ta **değişmedi**
  (lockfile ve `dependencies` alanları el değmemiş) ⇒ bu değişikliğin bağımlılık riski
  **sıfır delta**.

## DOĞRULANAMADI

1. **`pnpm audit` kritik/yüksek/orta/düşük sayıları** — komut yasağı. Delta sıfır olduğu
   için bu turda bloke edici değil; `qa`/`devops` ilk uygun koşumda raporlasın.
2. **Artefaktın tazeliği/determinizmi** (iki koşumun birebirliği, `md5` eşleşmesi) —
   üretim fazından **devralındı**, bağımsız olarak yeniden üretilemedi (`contract:generate`
   çalıştırmak gerekirdi). Dosyanın `md5`'i ve yapısı diskte doğrulandı; "yeniden üretim
   aynı baytı verir" iddiası **test edilmedi**.
3. **Depo görünürlüğü ağ üzerinden teyit edilmedi** — `gh api`/ağ çağrısı izinli değil.
   Dayanak: depo içinde **dört** bağımsız, "ölçüldü" notlu yazılı kayıt (§0) + `origin`
   `https://github.com/arkesoft/Arkesoft-Panel.git`. Bu kayıtların kendisi bayatlamış
   olabilir; **ama** bu gate'in kararı her iki varsayımda da aynı (marjinal açıklama
   sıfır).
4. **F2/F3'ün mutasyonla kanıtı** — statik tur; mutasyon testi (ör. `.input()` kaldırıp
   Katman 1'in yeşil kaldığını **koşturarak** görmek) komut yasağı nedeniyle yapılamadı.
   F3'ün fail-open'ı **kod okumasıyla** (satır 520-522 + 699-702 + test dosyasının
   assert'leri) kanıtlandı; koşum kanıtı yok.
