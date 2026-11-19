# T-026 — `security` gate, tur 2 (DAR kapsam)

- **Tarih:** 2026-11-19
- **Sürüm:** ROADMAP v0.0.22 (T-026)
- **Kapsam:** ⚠ **DAR** — WORKFLOW.md kuralı gereği (tur 1 PASS verdi, yüzey değişti):
  **yalnızca kendi tur 1 bulgularımın kapanışı + handoff'ta adı geçen `in` operatörü
  sorusu**. **Yeni tam tarama YAPILMADI.** Tenant izolasyonu 14 maddesi, `pnpm audit`,
  sır taraması, SSRF/dosya yüzeyi, KVKK eksenleri bu turda **yeniden taranmadı** —
  tur 1 ölçümleri geçerli kabul edildi (yüzey değişimi yalnızca
  `packages/trpc/src/contract/classify-contract-change.ts` ve
  `packages/trpc/src/__tests__/contract-surface.test.ts` içinde).
- **Araç kısıtı:** ⚠ `qa` paralel koştuğu için run-owner kapısı aktifti ⇒ **hiçbir test
  koşturulmadı**. Bu turun tamamı **statik** (okuma + `rg`/`jq`/`git diff`). Mutasyon
  kanıtı üretilemedi; ölçülemeyen her şey `DOĞRULANAMADI` altında.

```
GATE: security
SONUÇ: PASS
```

---

## 1. Tur 1 bulgularının kapanış durumu

### [medium → KAPANDI] "Otomatik yayımlama hattının içerik kapısı yok"

Üç kapı `packages/trpc/src/__tests__/contract-surface.test.ts:412-469`'de. **Assert
yönleri bağımsız denetlendi** — sorulan asıl soru buydu ("boş bir yeşil mi?"):

| Kapı                            | Satır     | Assert'in yönü                                                                           | Bayatlar mı?                                                                            |
| ------------------------------- | --------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| (a) `description/title/$comment/examples` | `:413-430` | `expect(foundKeys).toEqual([])` — **"sıfır olmalı"**                                      | **Hayır.** Sayıya pin yok; ilk emisyonda kırmızı yanar.                                 |
| (b) `default` değer tipi        | `:432-448` | `expect(defaultValues.length).toBeGreaterThan(0)` **+** her değer için `number\|boolean` | **Hayır.** ⭐ `=== 3` diye pinlenmemiş; yeni bir sayısal `default` eklenmesi testi kırmaz. |
| (c) D6 yasak jeton deseni       | `:450-468` | `expect(leaks).toEqual([])` — **"sıfır olmalı"**                                          | **Hayır.**                                                                              |

**Vacuity (boş yeşil) denetimi — geçti.** Üç kapı da aynı gezici
(`walkJsonEntries`, `:396-410`) üzerinden çalışıyor; gezicinin gerçekten
özyinelediğinin kanıtı (b)'nin `toBeGreaterThan(0)` satırı: `default` düğümü
artefaktta **6 seviye derinde**. `jq` ile bağımsız teyit:

```
procedures.job.list.input.properties.limit.default           = 20
procedures.platform.auditLog.input.properties.limit.default  = 50
procedures.platform.tenantList.input.properties.limit.default = 20
```

Üçü de `number` ⇒ (b) bugün geçiyor **ve** boş değil. (a) ve (c) kendi başlarına
vacuous olabilirdi; (b) aynı geziciyi non-vacuous kanıtladığı için üçü birlikte
geçerli.

**(c) senin tur 1 §5 regex'ini doğru uyguluyor:**
`/\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2}|\d{10,}|uuid|ULID/i` — ISO tarih, saat, epoch,
uuid/ULID; `pattern`/`$schema`/`format` anahtarlarının **değerleri** hariç tutulmuş
(tur 1'in "naif tarama FP verir" ölçümüyle birebir). ⇒ **Desen doğru aktarılmış.**

⚠ **Ama bir kör nokta var** — aşağıda F-S1 (yeni bulgu).

### [medium → KAPANDI] `null`↔nesne fail-OPEN

Erken dönüş gerçekten kaldırılmış (`classify-contract-change.ts:585-611`, gerekçe
yorumu `:591-603`). **Yön doğrulaması (yeni fail-OPEN veya yanlış pozitif doğdu mu):**

- **Yanlış pozitif riski — YOK.** `null` → `resolveFieldDiffTarget(null)` → `null`
  (`:246-248`, `isJsonRecord` değil ⇒ aynen döner) → `readSchemaProperties(null)` →
  `{}` (`:172-173`), `readSchemaRequired(null)` → boş `Set` (`:181-182`) ⇒
  `allFieldNames` **boş** ⇒ `:618`'deki döngü gövdesi **hiç çalışmaz** ⇒ `diffs = []`.
  Döngüden sonra (`:690`) doğrudan `return diffs` — ek kıyas yok.
- **`backend`'in "5 prosedür hâlâ 0 diff" iddiası — TEYİT EDİLDİ (statik + artefakt
  ölçümü).** `jq` ile sayıldı: `input === null` olan **tam 5** prosedür var
  (`platform.session`, `session.list`, `session.me`, `storefront.currentTenant`,
  `tenant.current`); `output === null` olan **0**. Beşinin de iki tarafı `null` ⇒
  yukarıdaki akışla 0 diff. ⚠ Çalıştırılabilir kanıt Katman 1 testidir
  (`contract-surface.test.ts:332-344`, `diffs` uzunluğu 0 + `PATCH`) — **koşum sahibi
  `qa`**, ben koşturmadım.
- **Fail-OPEN kapandı mı — KISMEN.** Nesne-şekilli girdiler için **evet**
  (`null` → `z.object({x: z.string()})` artık `INPUT_REQUIRED_FIELD_ADDED`/MAJOR).
  Nesne **olmayan** kök şemalar için **hayır** — bkz. F-S3 (yeni, `low`).

### [low → KAPANDI] Tehdit modeli yazılı değil

`docs/api-versioning.md` §11 (`:297-337`). Olgusal denetim bölüm 3'te — **doğru**.

### [low → AÇIK, bilinçli] `GENERATOR_DRIFT` severity

Değiştirilmemiş; v0.0.23 teknik borcu olarak kalıyor (tur 1 kararı, değişmedi).
Borç satırı: `[SEV: low] packages/trpc/src/contract/classify-contract-change.ts:717-724
— generator sapması sınıflandırmaya katılmıyor, ayrı raporlanıyor; sapma tek başına
yüzeyi değiştirmediği sürece doğru, ama "sessiz sapma" riskini v0.0.23'te yeniden
değerlendir — sorumlu: architect.`

---

## 2. ⚠⚠ `in` OPERATÖRÜ — güvenlik değerlendirmesi

**Yer:** `packages/trpc/src/contract/classify-contract-change.ts:619-620`

```ts
const existedBefore = fieldName in beforeProperties
const existsAfter = fieldName in afterProperties
```

**Mekanizma teyit edildi.** `beforeProperties`/`afterProperties` ya `{}` nesne
literali (`:173`, `:176`) ya da `JSON.parse`/Zod çıktısı bir düz nesnedir — her
ikisinin de prototipi `Object.prototype`'tır. `allFieldNames` **yalnızca**
`Object.keys()` ile kurulur (`:613-616`, doğru), ama `:619-620` prototip zincirini
yürür ⇒ `toString`/`constructor`/`valueOf`/`__proto__` adlı bir alan için
`existedBefore`/`existsAfter` **her zaman `true`** döner. ⇒ `_FIELD_ADDED` ve
`_FIELD_REMOVED` dalları atlanır. **T-023'ün sınıfı doğru teşhis edilmiş.**

⚠ Ayrıca bu, dosyanın **kendi yazılı değişmezini ihlal ediyor**:
`classify-contract-change.ts:333` — _"`in` operatörü KULLANILMAZ, T-023'ün prototip
zinciri tuzağı, AGENT_BASELINE.md §5"_. Aynı dosya 286 satır sonra `in` kullanıyor.

### ⭐ Ama handoff'un öncülü ölçümle KISMEN ÇÜRÜDÜ (onuncu vaka)

Handoff: _"`INPUT_REQUIRED_FIELD_ADDED` kaçar ⇒ **fail-OPEN**"_. **Reason kodu için
doğru, severity için DEĞİL.** `severity` tüm `diffs` üzerinden **maksimum** alınarak
hesaplanıyor (`:782-785`, `combineSeverity`, MAJOR>MINOR>PATCH). Dalları tek tek
izledim:

| Senaryo (alan adı `toString`)        | Gerçek sınıf                   | `in` tuzağıyla üretilen                                                | Net severity |
| ------------------------------------ | ------------------------------ | ---------------------------------------------------------------------- | ------------ |
| ZORUNLU girdi alanı **eklendi**      | `INPUT_REQUIRED_FIELD_ADDED`/MAJOR | `INPUT_FIELD_BECAME_REQUIRED`/**MAJOR** (`:638`) + `TYPE_NARROWED`/MAJOR | **MAJOR** ✅ |
| ZORUNLU girdi alanı **kaldırıldı**   | `INPUT_FIELD_REMOVED`/MAJOR    | `INPUT_FIELD_BECAME_OPTIONAL`/MINOR (`:647`) **+** `TYPE_NARROWED`/MAJOR | **MAJOR** ✅ |
| OPSİYONEL alan eklendi/kaldırıldı    | MINOR / MAJOR                  | `TYPE_NARROWED`/MAJOR                                                  | **MAJOR** ✅ |

**Severity'yi kurtaran mekanizma:** `compareFieldConstraint(beforeProperties[f],
afterProperties[f])` (`:658-661`). Prototipten gelen değer bir **fonksiyondur**
(`Object.prototype.toString`); `isSchemaEqual` onu `JSON.stringify` ile
`undefined`'a indirger, gerçek şema düğümü bir dizeye ⇒ asla eşit değil ⇒
`hasUntrackedConstraintChange` → fail-closed **`NARROWED`/MAJOR** (`:386-388`,
F3 düzeltmesinin yan faydası). ⇒ Tuzak **gürültü** (yanlış `reason`/açıklama)
üretiyor, **severity düşürmüyor**.

**Tek gerçek severity düşüşü** çok daraltılmış bir köşede: alan adı **tam olarak
`__proto__`** _ve_ şeması `{}`'e serileşiyorsa (`z.any()`/`z.unknown()`). O zaman
`{}['__proto__']` → `Object.prototype` → kanonikleştirilince `'{}'` → iki taraf eşit
⇒ hiç diff yok ⇒ gerçek MAJOR (`FIELD_REMOVED`) **PATCH** görünür.

### Erişilebilirlik — ÖLÇÜLDÜ

- **Bugünkü artefaktta 0.** `jq` ile tüm anahtar adları çıkarılıp
  `toString|valueOf|constructor|hasOwnProperty|isPrototypeOf|propertyIsEnumerable|toLocaleString|__proto__|__defineGetter__|__lookupGetter__`
  ile tarandı ⇒ **eşleşme yok** (17 prosedür).
- **Zod'da tanımlanabilir mi? EVET.** `z.object({ toString: z.string() })` tamamen
  geçerlidir ve `properties.toString` olarak emisyona girer. ⇒ Teorik değil,
  _gelecekte_ erişilebilir; bugün erişilemez.

### ⇒ Derecelendirme: **[SEV: low]** (F-S2)

Gerekçe, kendi kuralıma göre: somut saldırı senaryosu kurulamıyor (bu bir tenant
sızıntısı/auth atlatma/para kaybı **değil**, sürüm sınıflandırma raporunun doğruluğu);
bugünkü yüzeyde **erişilemez**; erişilse bile severity **korunuyor** (yalnızca
`__proto__`+`{}` köşesi hariç). "Emin değilsen bir alt seviyeyi seç" kuralı uygulandı.
⚠ Ama **düzeltilmeli**: dosyanın kendi `:333` değişmezini ihlal ediyor ve düzeltme iki
satırlık (`Object.keys(beforeProperties).includes(fieldName)` — `:250`/`:345`'in zaten
kullandığı desen).

---

## 3. `docs` §11'in olgusal denetimi — DOĞRU, fazla/eksik iddia YOK

`docs/api-versioning.md:297-337`. **On dosya:satır atfının tamamı `sed` ile tek tek
açılıp doğrulandı:**

| Atıf                                | İçerik teyidi                                 |
| ----------------------------------- | --------------------------------------------- |
| `.github/actions/run-gates/action.yml:73` | ✅ "Depo PUBLIC (ölçüldü) … ANONİM indirilebilir" |
| `.github/workflows/ci.yml:1543`     | ✅ "DEPO PUBLIC olduğu için ANONİM indirilebilir" |
| `scripts/redact-test-log.ts:7`      | ✅ "`security` F1 ÖLÇTÜ: depo PUBLIC"          |
| `scripts/playwright/base.ts:111,137` | ✅ her ikisi de "depo PUBLIC"                  |
| `platform.schema.ts:138-141`        | ✅ `platformAuditActionSchema = z.enum([…])`   |
| `platform.schema.ts:147`            | ✅ `PLATFORM_AUDIT_LOG_MAX_LIMIT = 100`        |
| `schema.prisma:1236-1238`           | ✅ `enum PlatformAuditAction` + `tenant_impersonation_started` |

**Üç gerekçem doğru aktarılmış** (marjinal açıklama sıfır / hariç tutmak güvenliği
düşürür / elle tutulan dışlama listesi bu deponun ölçülmüş sessiz-sapma sınıfı),
hiçbiri çarpıtılmamış, karar cümlesi ("allowlist/denylist KURULMAYACAK") tur 1
kararımla birebir.

⭐ **Bağımsız teyit (docs'un yapmadığı bir ölçüm):** "marjinal açıklama sıfır"
iddiasını artefakt üzerinden doğruladım — `jq` ile çıkarılan tüm `enum` değerleri
(`platform_admin_signed_in`, `tenant_impersonation_started`, rol/durum/tarayıcı/OS
sabitleri) **istisnasız** depoda zaten takip edilen kaynaklarda var; artefakt yeni
bilgi üretmiyor. ⇒ İddia **fazla değil**.

Eksik iddia da bulamadım: §11 "uygulama bu dosyayı servis etmiyor" azaltmasının
**azaltma olmadığını** açıkça yazıyor — tur 1'in en önemli nüansı korunmuş.

---

## 4. Tedarik zinciri

- `pnpm-lock.yaml`: **DEĞİŞMEDİ** (`git status` + `git diff HEAD` ile iki kez ölçüldü;
  dosya ne `M` ne `??` listesinde).
- `package.json` / `packages/trpc/package.json` diff'i **yalnızca script ekliyor**
  (`test:contract`, `contract:generate`) — **hiçbir `dependencies`/`devDependencies`
  satırı değişmemiş**. ⇒ Yeni ana bağımlılık yok, geçişli bağımlılık yüzeyi değişmedi.
- ⚠ `pnpm audit` **bu turda KOŞTURULMADI** (run-owner kapısı). Tur 1 ölçümü geçerli;
  lockfile değişmediği için sonucun değişmesi **yapısal olarak mümkün değil**.

---

## 5. BULGULAR

```
BULGULAR:
  - [SEV: medium] packages/trpc/src/__tests__/contract-surface.test.ts:396-410, 450-468 —
    İçerik kapısı (c)'nin gezicisi `walkJsonEntries` DİZİ ELEMANLARI için `visit()`
    ÇAĞIRMIYOR (yalnızca kayıt anahtarları için çağırıyor; `:397-402` dizide sadece
    özyineliyor). ⇒ Dizi içindeki DİZE değerleri D6 yasak jeton taramasının DIŞINDA.
    Somut senaryo: bir geliştirici `z.enum([...])`'u çalışma zamanı verisinden
    (ör. gerçek tenant slug'ları, iş kimlikleri, bir ortam listesi) üretirse bu
    değerler PUBLIC depodaki `docs/api-contract-surface.json`'a girer ve
    `raw.githubusercontent.com` üzerinden kimlik doğrulamasız okunabilir — üç kapının
    hiçbiri kırmızı yanmaz. (Aynı kör nokta `required: [...]` alan adları için de
    geçerli.) Bugün sızıntı YOK: artefaktaki 42 enum değerinin tamamı kaynakta
    takip edilen sabitler (jq ile tek tek doğrulandı). — Düzeltme: `walkJsonEntries`
    dizi dalında da eleman başına `visit(key, item)` çağır (üst anahtarı taşıyarak,
    ör. `visit(`${key}[]`, item)`) veya (c)'ye ayrı bir "dizi içi dize" geçişi ekle;
    (a)/(b)'yi değiştirme. — backend
  - [SEV: low] packages/trpc/src/contract/classify-contract-change.ts:619-620 —
    `in` operatörü prototip zincirini yürüyor (T-023 sınıfı); `toString`/`constructor`/
    `valueOf`/`__proto__` adlı bir alan "zaten vardı/hâlâ var" görünür ⇒ `_FIELD_ADDED`/
    `_FIELD_REMOVED` dalları atlanır ve YANLIŞ `reason`/açıklama raporlanır. Severity
    `:386-388`'in fail-closed `NARROWED`'ı ve `:782-785`'in maksimum birleştirmesi
    sayesinde MAJOR kalıyor (tek istisna: alan adı tam olarak `__proto__` VE şeması
    `{}` ise gerçek MAJOR, PATCH görünür). Bugünkü 17 prosedürde böyle bir alan adı
    YOK (ölçüldü) ⇒ erişilemez; ama Zod'da tanımlanması serbest. Ayrıca dosyanın
    KENDİ `:333` değişmezini ("`in` KULLANILMAZ") ihlal ediyor. — Düzeltme:
    `Object.keys(beforeProperties).includes(fieldName)` (dosyanın `:250`/`:345`'te
    zaten kullandığı desen). — backend (vade: v0.0.23, ya da F-S1 düzeltmesi açılırsa
    "yolu üstündeyse kapat")
  - [SEV: low] packages/trpc/src/contract/classify-contract-change.ts:585-611, 591-603 —
    F2 düzeltmesi fail-OPEN'i YALNIZCA nesne-şekilli şemalar için kapattı. Kök düğüm
    (ör. `.input(z.string())`) hiçbir yerde kıyaslanmıyor: `readSchemaProperties`
    `{}` döndüğü için `null` → `z.string()` (girdisiz prosedüre ZORUNLU skaler girdi
    eklenmesi — gerçek MAJOR) ve `z.string()` → `z.number()` hâlâ `PATCH` sınıflanır.
    Bugün erişilemez (17 prosedürün girdisi: 12 `object`, 5 `null`; çıktısı: 16
    `object`, 1 `array` — ölçüldü), ama `:598-601`'deki yorum düzeltmenin kapsamını
    olduğundan GENİŞ anlatıyor. — Düzeltme: ya kök düğüm için
    `compareFieldConstraint(beforeDiffTarget, afterDiffTarget)` ekle (nesne olmayan
    kökler için), ya da `:591-603` yorumunu "yalnızca nesne-şekilli şemalar"
    sınırıyla düzelt ve borcu ROADMAP'e yaz. — backend (vade: v0.0.23)
```

**FAIL kuralı:** 1 `medium` + 2 `low` ⇒ **PASS** (AGENT_BASELINE.md §4: 1–2 `medium`
→ PASS, bulgular teknik borca).

---

## 6. ÖLÇÜMLER

- **Kapsam:** DAR (tur 2). **Yeni tam tarama yapılmadı** — tenant izolasyonu 14
  maddesi, sır taraması, SSRF/dosya, KVKK, `pnpm audit` **yeniden taranmadı**.
- **İncelenen dosya: 6** — `classify-contract-change.ts` (841 satır, hedefli
  bölümler: 162-409, 455-691, 697-792), `contract-surface.test.ts:250-469`,
  `canonicalize.ts` (78 satır, tam), `docs/api-versioning.md:297-337`,
  `docs/api-contract-surface.json` (jq ile), `package.json`+`packages/trpc/package.json`
  (diff).
- **Artefakt ölçümleri (jq):** 17 prosedür / 7 namespace; `input === null`: **5**;
  `output === null`: **0**; kök `input.type`: 12×`object` + 5×`null`; kök
  `output.type`: 16×`object` + 1×`array`; `default` düğümü: **3**, hepsi `number`;
  `description/title/$comment/examples` anahtarı: **0**; `Object.prototype` adlı
  anahtar: **0**; benzersiz `enum` değeri: **42**, hepsi kaynakta takip edilen sabit.
- **Tenant izolasyon listesinden karşılanmayan madde: YOK** (bu değişiklik yeni tablo,
  prosedür, kuyruk işi veya DB nesnesi **eklemiyor**; `classify-contract-change.ts`
  saf bir derleme-zamanı karşılaştırıcısıdır, tenant verisine erişmez).
- **`pnpm audit`: KOŞTURULMADI** (run-owner kapısı, `qa` paralel). Lockfile
  değişmediği için tur 1 sonucu yapısal olarak geçerli.
- **Çalıştırılan komutlar:** yalnızca salt-okunur — `git status/diff`, `jq`, `grep`,
  `sed -n` (dosya okuma), `wc`, `ls`. Hiçbir `pnpm`/`vitest`/`turbo` çağrısı yok.

## 7. DOĞRULANAMADI

1. **Üç içerik kapısının ve Katman 1 testinin GERÇEK koşum sonucu.** Assert yönlerini
   ve vacuity'yi statik + `jq` ölçümüyle doğruladım, ama `vitest` koşturmam yasaktı.
   ⇒ "Bugün 3/3 PASS" iddiası **benim ölçümüm değil**; koşum sahibi `qa`.
2. **F2 düzeltmesinin mutasyon kanıtı** (`backend`'in "eski satırı geri ekle → 2 FAIL"
   ölçümü). Mutasyon testi yapamadım; akışı satır satır izleyerek **statik** doğruladım.
3. **`in` tuzağının çalışma zamanı davranışı.** Severity tablosunu kaynak okuyarak
   türettim; `node -p` ile bile olsa gerçek bir `classifyContractChange` çağrısı
   yapmadım. ⇒ `__proto__`+`{}` köşesi **analitik** bir sonuçtur, ölçülmüş değil.
4. **`pnpm audit`** (yukarıda).
