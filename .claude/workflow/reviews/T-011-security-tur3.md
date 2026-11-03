# T-011 — GATE: security — tur 3

- **Tarih:** 2026-11-02
- **Sürüm:** `v0.0.9.1` (platform patch 0.1.0 → 0.1.1)
- **Kapsam:** ÇOK DAR — tek soru: **FIX 2, AC8'i zayıflattı mı?**
- **Denetlenen yüzey (3 dosya):** `src/lib/__tests__/env-contract.test.ts`,
  `src/lib/__tests__/root-env-integration.test.ts`, `src/lib/storefront-env.ts`

```
GATE: security
SONUÇ: PASS
```

**Karar özeti:** FIX 2 AC8'i **zayıflatmadı**. Üretim kod yolu değişmedi, gerçek pinler
hâlâ diskteki gerçek dosyaları okuyor, kaldırılan test hiçbir güvenlik değişmezini
pinlemiyordu. FIX 2'nin **getirdiği** `medium`+ bir kusur **yok** → FAIL yok, ESCALATED yok.
Bir `medium` (artık kapsama boşluğu + onu "ölçüldü" diye beyan eden yanlış yorum) ve iki
`low` borç satırı var; AGENT_BASELINE §4: 1–2 `medium` → **PASS**.

---

## İŞ 1 · AC8 pinleri refaktör sonrası hâlâ gerçek dosyaları mı okuyor?

### 1.1 — Gerçek pinler sentetiğe çevrilmiş mi? → **HAYIR. `high` yok.**

İthal/çağrı izi takip edildi (kelime araması değil):

| Pin | Girdi kaynağı | Satır | Sonuç |
| --- | --- | --- | --- |
| P7 (`.env.example`, `PUBLIC_` sızıntı koruması) | `readFileSync(join(REPO_ROOT, '.env.example'))` | `env-contract.test.ts:307` | **GERÇEK DOSYA** |
| P6 (`playwright.config.ts`, önek sapması) | `readPlaywrightConfigRaw()` → `readFileSync(join(REPO_ROOT,'apps','storefront','playwright.config.ts'))` | `:270` → `:107-109` | **GERÇEK DOSYA** |
| P8 (`playwright.config.ts`, `astro build/preview` kapısı) | `readPlaywrightConfigRaw()` | `:347` → `:107-109` | **GERÇEK DOSYA** |

Sentetik girdi **yalnızca** üç self-test'te geçiyor ve hepsi ad olarak işaretli:
`:286-287` (sapmış önek dizgesi), `:328-333` (sentetik satır dizisi), `:374-379` (sentetik
`webServer` bloğu). Refaktör **hiçbir gerçek pini** sentetiğe çevirmedi — M1 yalnızca
gövdeye gömülü mantığı **adlandırılmış fonksiyona** çıkardı, veri kaynağını değiştirmedi.

**Tek dosya koşumu (ölçüldü):** `vitest run env-contract.test.ts root-env-integration.test.ts`
→ **17/17 geçti** (11 + 6), 215 ms.

### 1.2 — Tek nokta riski: pini VE self-test'i aynı anda yeşil bırakan hata biçimi var mı? → **VAR, ve yakalanmıyor.**

Gerçek dosyalar üzerinde mutasyon simülasyonu koşturuldu (hiçbir proje dosyası
**değiştirilmedi** — `extractWebServerCommandLine`'ın üç varyantı scratchpad'de bağımsız
bir ESM script'inde gerçek `playwright.config.ts` + gerçek `package.json` metnine uygulandı):

| Mutasyon | P6 (gerçek) | P6 self-test | P8 (gerçek) | P8 self-test | Dördü de yeşil mi |
| --- | --- | --- | --- | --- | --- |
| **yok** (HEAD) | GREEN | GREEN | GREEN | GREEN | evet (beklenen) |
| **`return raw`** — dosyanın tamamını döndür (**L1'in düzelttiği ORİJİNAL kusur**) | GREEN | GREEN | GREEN | GREEN | **EVET → MUTASYON GÖRÜNMEZ** |
| `.includes('webServer')` | RED | GREEN | RED | RED | hayır (yakalanıyor) |

**Kök neden (ölçüldü):**

- `playwright.config.ts` içinde `astro build` literal sayısı = **0**, `astro preview` = **0**.
  Dolayısıyla P8'in `not.toContain('astro build')`/`not.toContain('astro preview')`
  assert'leri "komut satırı" ile "dosyanın tamamı" arasını **ayırt edemiyor**.
- `astro dev` literal sayısı = **4** (1 komut satırı + **3 yorum satırı**) — yani P6/P8'in
  `toContain('astro dev')` tarafı dosyanın tamamında da sağlanıyor.
- P8 self-test'inin sentetik bloğunda `astro dev` **hiç geçmiyor**, bu yüzden
  `not.toContain('astro dev')` tarafı da tam-girdi mutasyonunu ayırt edemiyor.

**Sonuç:** `env-contract.test.ts:115-120`'deki beyan — *"P6, P8 VE ikisinin self-test'i AYNI
fonksiyonu çağırıyor, dolayısıyla … mutasyona karşı duyarlılık self-test'te GERÇEKTEN
ölçülüyor"* — en önemli mutasyon sınıfı (çıkarıcının kapsamını kaybetmesi = L1'in tam
kendisi) için **ölçülerek yanlış** bulundu. Aynı şekilde `:263-266`'daki *"Artık …
YALNIZCA gerçek `command:` SATIRINDA aranıyor"* bugün doğru ama **hiçbir assert**
çıkarıcının bu kapsamını pinlemiyor.

**Zayıflatma mı?** Hayır. Tur 2 öncesinde P8 self-test'i gerçek çıkarıcıyı **hiç
çağırmıyordu** (duyarlılık = 0); FIX 2 duyarlılığı 0'dan kısmî seviyeye **çıkardı**.
Kapsama boşluğu **artık/residual**, FIX 2'nin **getirdiği** bir gerileme değil. FIX 2'nin
getirdiği şey yalnızca boşluğu "ölçüldü" diye beyan eden **yorum** — o da tek başına `low`.
İkisi aynı dosyada ve aynı düzenlemede kapanacağı için tek `medium` bulgu olarak yazıldı.

---

## İŞ 2 · Re-export daraltması AC8 için iyileştirme mi, yeni risk mi?

### Ölçüm A — ES modül semantiği (Node ile doğrudan ölçüldü)

`storefront-env.ts`'in birebir yapısı (tek `export { X } from './y.js'` + üst seviyede yan
etkili çağrı) scratchpad'de yeniden kuruldu ve **yalnızca re-export edilen ad** import edildi:

```
— SADECE theSchema import edildi, env GEÇERSİZ —
   [YAN ETKİ ÇALIŞTI] barrel üst seviyesi değerlendirildi
   SONUÇ: *** FIRLADI: env geçersiz *** → re-export TEK BAŞINA eager parse TETİKLİYOR
```

**Repo içi bağımsız teyit:** `storefront-env.test.ts:26-77`'deki **şema-only** dört test,
`storefrontEnvSchema`'yı `storefront-env.js`'ten alırken **her biri** `setValidEnv()` +
`vi.resetModules()` iskelesi kurmak zorunda; dosyanın kendi başlığı (`:4-11`) bunu açıkça
yazıyor: *"statik bir `import` … ambient test ortamında bu iki değişken tanımlı DEĞİLSE
dosyanın TAMAMI (şema-only testler dahil) çökerdi."* Yani mevcut süit, şemayı tek başına
ithal etmenin eager parse'ı tetiklediğini **zaten kanıtlıyor**.

### Ölçüm B — gerçek tüketici grafiği (import izi)

```
astro.config.ts:41        → ./src/lib/root-env-integration.js
root-env-integration.ts:56 → ./storefront-env-schema.js   (parseStorefrontEnv — YAN ETKİSİZ)
```

`astro.config.ts` grafiği **`storefront-env.ts`'e ULAŞMIYOR** (ölçüldü). `storefront-env.ts`
tüketicileri: `e2e/global-setup.ts:13`, `src/middleware.ts:93`, `src/lib/api-client.ts:20`
(üçü de `storefrontEnv` sabitini alıyor — eager parse **istenen** davranış, K17) ve
`__tests__/storefront-env.test.ts` (dinamik `import()`). Re-export edilen
`storefrontEnvSchema`'nın `storefront-env.js` üzerinden **tek** tüketicisi o test dosyası —
`frontend`'in iddiası **doğrulandı**.

### Karar

**Tuzak YAPISAL OLARAK KAPANMADI — DARALDI.** İkisi birlikte doğru:

1. **Net kazanç (gerçek):** `solid`'in korktuğu tam refaktör — `root-env-integration.ts:56`'nın
   `parseStorefrontEnv`'i `'./storefront-env.js'`'ten almaya "sadeleştirilmesi" — artık bir
   **typecheck hatası**; o ad oradan export edilmiyor. Yani AC8'i ihlal edecek o spesifik
   yol mekanik bir kapıya (19/19 typecheck) takılıyor. Daraltma gerçek bir iyileştirme.
2. **Artık risk (gerçek):** kalan `storefrontEnvSchema` re-export'u **aynı** eager parse'ı
   tetikliyor (Ölçüm A). `astro.config.ts` grafiğindeki bir modül bir gün
   `import { storefrontEnvSchema } from './storefront-env.js'` yazarsa AC8 **her** `command`
   dalında ihlal olur. Üstelik dosyanın tek kalan export yüzeyi artık bir şema olduğu için
   modül **yan etkisiz bir "şema barrel'ı" gibi GÖRÜNÜYOR**; `:51-63`'teki yorum bu kalan
   kapının eager parse'ı tetiklediğini **söylemiyor**.

**Severity: `low` (borç), `medium` DEĞİL.** Gerekçe: (a) FIX 2 yüzeyi **daralttı**, genişletmedi
— bu bulgu FIX 2'nin getirdiği bir gerileme değil, kapatılmamış bir artık; (b) canlı maruziyet
**yok** — ölçülen sıfır üretim tüketicisi, `astro.config.ts` grafiği modüle ulaşmıyor;
(c) korkulan asıl yol artık tip sistemi tarafından **bloke**; (d) tetiklenmesi için
motivasyonu olmayan yeni bir import gerekiyor. §4'ün "emin değilsen bir alt seviyeyi seç"
kuralı da bu yönde.

> `solid` tur 3'te aynı soruya paralel bakıyor; bu karar **bağımsız** verildi, onun sonucu
> beklenmedi/okunmadı.

---

## İŞ 3 · Kaldırılan test AC8 kapsamasını düşürdü mü?

### 3.1 — Kaldırılan assert bir güvenlik değişmezi pinliyor muydu? → **HAYIR.**

Kaldırılan assert `existsSync(rootEnvPath)).toBe(true)` idi. Üç bağımsız gerekçe:

1. **Polarite ters.** Assert, git tarafından **izlenmeyen, sır taşıyan** bir dosyanın
   **VARLIĞINI** doğruluyordu. Sızıntı koruması bir dosyanın var olmasını değil, sırrın
   yanlış sürece/bundle'a **geçmemesini** pinler. Bir sır dosyasının varlığını assert etmek
   hiçbir sızıntı değişmezi üretmez. (Ölçüldü: `.env` diskte var — 2957 bayt;
   `git ls-files .env` **boş** → izlenmiyor.)
2. **Hiçbir kod yolu egzersiz edilmiyordu.** `root-env-integration.ts`'in ne `command`
   kapısına ne `loadEnvFile` çağrısına ne `parseStorefrontEnv`'e dokunuyordu.
3. **AC8'in kanıtı bu assert'e bağlı değil.** AC8'in dört pini —
   `root-env-integration.test.ts:84-126`'daki `build`/`preview`/`sync` testleri ve
   `env-contract.test.ts:213-246`'daki P4 — mekanizmayı `vi.spyOn(process,'loadEnvFile')` +
   `not.toHaveBeenCalled()` ile ölçüyor. Bu assert `.env`'in var olup olmamasından
   **bağımsız**: kapı `command !== 'dev'`'de `existsSync`'e **hiç ulaşmadan** `return`
   ediyor (`root-env-integration.ts:93-95`). Dolayısıyla kaldırma AC8 kapsamasından
   **sıfır** eksiltti.

### 3.2 — Test edilmeyen `existsSync === false` kolu bir **güvenlik** boşluğu mu? → **HAYIR, salt kapsama boşluğu.**

Kolun kendisi **fail-closed** ve **daha az** şey yapıyor:

```
existsSync(rootEnvPath) === false
  → process.loadEnvFile ÇAĞRILMAZ   (dosya okuma YOK, process.env yazma YOK)
  → parseStorefrontEnv(process.env) yine çalışır
      → env eksik/geçersizse FIRLAR → hook fırlar → astro dev sıfır-dışı çıkar,
        4321'de DİNLEMEYE BAŞLAMADAN (A2)
```

`false` kolunun **daha fazla** env yüklediği, bir sırrı `process.env`'e soktuğu veya
`PUBLIC_*` yoluyla bundle'a taşıdığı **hiçbir girdi yok** — bu kol yapısal olarak
`true` kolundan **daha güvenli** taraf. Güvenlik açısından test edilmemesi maruziyet
üretmiyor. Salt kapsama borcu; `root-env-integration.test.ts:213-215` bunu zaten borç
olarak kaydetmiş durumda (sorumlu qa/devops, v0.0.14).

### 3.3 — Ölçülen yan etki (güvenlik dışı, `low`)

`root-env-integration.test.ts:147` ve `:180`'deki `expect(loadEnvFileSpy).toHaveBeenCalledTimes(1)`
assert'leri kök `.env`'in **var olmasına bağlı**: `vi.spyOn` `mockImplementation` olmadan
orijinali **çağırır**, ve hook `loadEnvFile`'ı yalnızca `if (existsSync(rootEnvPath))`
içinde çağırır. Temiz bir klonda bu iki assert "expected 1 call, got 0" ile düşer.
Kaldırılan assert bu bağımlılığı **okunur bir mesajla belgeliyordu**; artık hata iki test
sonra ve daha anlaşılmaz bir biçimde yüzeye çıkıyor. **Bağımlılığın kendisi FIX 2 öncesinden
geliyor** (FIX 2 o satırlarda yalnızca `as` → `toHaveBeenCalledWith` düzenlemesi yaptı);
FIX 2 yalnızca **teşhis edilebilirliği** düşürdü. Güvenlik gerilemesi değil.

---

## BULGULAR

```
BULGULAR:
  - [SEV: medium] apps/storefront/src/lib/__tests__/env-contract.test.ts:122-124
    (+ yanlış beyan :115-120, :263-266)
    — AC8/sızıntı pinlerinin ortak çıkarıcısı `extractWebServerCommandLine`'ın KAPSAMINI
      hiçbir assert pinlemiyor. ÖLÇÜLDÜ (gerçek dosyalar üzerinde mutasyon simülasyonu):
      çıkarıcı `return raw`'a (dosyanın tamamını döndür — L1'in düzelttiği ORİJİNAL kusur)
      bozulursa P6, P6 self-test, P8 VE P8 self-test'in DÖRDÜ DE YEŞİL kalıyor. Nedeni
      ölçüldü: `playwright.config.ts`'te `astro build` = 0 ve `astro preview` = 0 literal,
      `astro dev` = 4 (1 komut + 3 YORUM); P8'in sentetik bloğunda ise `astro dev` = 0.
      Somut senaryo: bir geliştirici çıkarıcıyı (ör. çok satırlı `command` desteklemek için)
      kapsam kaybettirecek şekilde düzenler → P6/P8 sessizce etkisizleşir → sonraki bir PR
      `webServer.command`'ı `astro build && astro preview`'e çevirdiğinde kapı kırmızı
      VERMEZ; o alt süreç `playwright.config.ts:83-86`'da yüklenen kök `.env`'i (içinde
      `BETTER_AUTH_SECRET` + rol parolaları) miras alır ve Vite'ın `loadEnv`'i `process.env`'den
      `PUBLIC_*` topladığı için bir sır istemci bundle'ına girebilir.
      ⚠ Bu boşluk FIX 2'nin GETİRDİĞİ bir gerileme DEĞİL (tur 2'de duyarlılık SIFIRDI,
      FIX 2 onu kısmî seviyeye çıkardı); FIX 2'nin getirdiği, boşluğu "GERÇEKTEN ölçülüyor"
      diye beyan eden YORUM — yanıltıcı güvenlik dokümantasyonu.
    — Önerilen düzeltme: P8 self-test'inin sentetik bloğuna, `command:` satırından ÖNCE
      `astro dev` jetonu taşıyan bir YORUM satırı ekle (gerçek dosyanın şeklini birebir
      taklit eder) — tam-girdi mutasyonunda `not.toContain('astro dev')` kırmızıya düşer.
      Ek olarak her iki self-test'e tek-satır değişmezini pinle
      (`expect(line.includes('\n')).toBe(false)`). `:115-120` ve `:263-266` yorumlarını
      ölçülen gerçeğe göre düzelt.
    — Sorumlu ajan: qa

  - [SEV: low] apps/storefront/src/lib/storefront-env.ts:64 (yorum boşluğu :51-63)
    — Re-export daraltması tuzağı DARALTTI ama KAPATMADI: kalan `storefrontEnvSchema`
      re-export'u da aynı modül-yükleme-anı `parseStorefrontEnv(process.env)` çağrısını
      TETİKLİYOR (Node ESM ile ölçüldü; repo içi teyit: `storefront-env.test.ts:4-11`
      + `:26-77`'nin zorunlu `setValidEnv()` iskelesi). `astro.config.ts` grafiğindeki bir
      modül bir gün bu adı buradan ithal ederse AC8 her `command` dalında ihlal olur.
      Bugün maruziyet YOK: ölçülen sıfır üretim tüketicisi; `astro.config.ts:41` →
      `root-env-integration.ts:56` → `storefront-env-schema.js` zinciri modüle ULAŞMIYOR.
      Daraltma net kazanç: `solid`'in korktuğu `parseStorefrontEnv` sadeleştirmesi artık
      typecheck hatası. Dosya artık yan etkisiz bir "şema barrel'ı" gibi GÖRÜNÜYOR ve
      `:51-63` yorumu kalan kapının eager parse tetiklediğini SÖYLEMİYOR.
    — Önerilen düzeltme: re-export'u TAMAMEN kaldır; `storefront-env.test.ts`'in
      `describe('storefrontEnvSchema')` bloğunu `storefront-env-schema.js`'ten ithal etmeye
      çevir (bonus: o dört test `setValidEnv()` + `vi.resetModules()` iskelesinden kurtulur).
      Ara adım olarak `:51-63`'e tek cümle ekle: "bu adı BURADAN ithal etmek de eager
      parse'ı tetikler; yan etkisiz sürüm `storefront-env-schema.js`'tedir."
    — Sorumlu ajan: frontend — vade: v0.0.14 borç penceresi

  - [SEV: low] apps/storefront/src/lib/__tests__/root-env-integration.test.ts:147,180
    — Kaldırılan `.env` varlık assert'i hiçbir güvenlik değişmezi pinlemiyordu (İŞ 3.1) ama
      bu iki `toHaveBeenCalledTimes(1)` assert'i kök `.env`'in VARLIĞINA bağlı (`vi.spyOn`
      `mockImplementation` olmadan orijinali çağırır; hook `loadEnvFile`'ı yalnızca
      `existsSync` doğruyken çağırır). Temiz klonda hata artık okunur bir "kök .env yok"
      mesajı yerine iki test sonra "expected 1 call, got 0" olarak çıkıyor. Bağımlılık FIX 2
      öncesinden geliyor; FIX 2 yalnızca teşhis edilebilirliği düşürdü. Güvenlik gerilemesi
      DEĞİL.
    — Önerilen düzeltme: bu iki testin başına açık bir ön koşul kontrolü (ör. `.env` yoksa
      anlamlı mesajla düşen bir `expect`) veya `loadEnvFile`'a `mockImplementation(() => {})`
      ekleyerek assert'i dosya varlığından BAĞIMSIZLAŞTIR.
    — Sorumlu ajan: qa — vade: v0.0.14 borç penceresi
```

---

## ÖLÇÜMLER

| Ölçüm | Sonuç |
| --- | --- |
| `pnpm audit` | **ÇALIŞTIRILMADI** — handoff talimatı; bağımlılık yüzeyi değişmedi (3 dosyanın hiçbiri `package.json`/lockfile değil, `git status` ile doğrulandı). Tur 1'de ölçülmüştü. |
| İncelenen dosya sayısı | **7** — kapsam 3: `env-contract.test.ts`, `root-env-integration.test.ts`, `storefront-env.ts`; bağlam 4: `root-env-integration.ts`, `playwright.config.ts`, `astro.config.ts`, `storefront-env.test.ts` |
| Tenant izolasyon listesi — karşılanmayan madde | **YOK — 14 maddenin HİÇBİRİ tetiklenmiyor.** Değişiklik DB/şema/RLS, tRPC prosedürü, kuyruk işi, önbellek anahtarı, S3 öneki, arama indeksi, dosya yükleme veya kiracı verisine **dokunmuyor** (2 test dosyası + 1 re-export daraltması). Tur 1'de 14/14 ölçüldü; yüzey değişimi o ölçümü geçersizleştirmiyor. |
| Tek dosya test koşumu | `env-contract.test.ts` + `root-env-integration.test.ts` → **17/17 geçti** (11 + 6), 215 ms |
| Mutasyon simülasyonu | 3 mutasyon sınıfı × 4 assert, gerçek `playwright.config.ts` + gerçek `package.json` metni üzerinde (proje dosyası **değiştirilmedi**) |
| ESM semantiği ölçümü | `storefront-env.ts` yapısının birebir kopyası + Node → re-export edilen adın tek başına ithali üst seviye yan etkiyi **tetikliyor** |
| `astro build` / `astro preview` literal sayısı (`playwright.config.ts`) | **0 / 0** — İŞ 1.2 kök nedeni |
| `astro dev` literal sayısı (`playwright.config.ts`) | **4** (1 komut satırı + 3 yorum satırı) |
| `.env` durumu | diskte **VAR** (2957 B), `git ls-files .env` **boş** → izlenmiyor, `.gitignore:7` |

### Ölçülemeyenler (§5)

- **FIX 2'nin diff'i ölçülemedi.** `env-contract.test.ts`, `root-env-integration.test.ts`
  ve `root-env-integration.ts` **git tarafından izlenmiyor** (`?? ` durumunda), FIX 2 öncesi
  sürüm diskte yok → `git diff` ile satır-satır karşılaştırma **yapılamadı**. Değişim yüzeyi
  handoff'un beyanı + dosyaların kendi `T-011/S4 — QA düzeltme turu 2` yorum kayıtları
  üzerinden doğrulandı; "üretim mantığı değişmedi" iddiası `storefront-env.ts` (izlenen
  dosya, `git diff` ile teyit) ve `root-env-integration.ts`'in mevcut içeriği üzerinden
  dolaylı olarak doğrulandı.
- **Canlı `astro dev`/`astro build` koşumu yapılmadı** (handoff yasağı) — AC8'in çalışma
  zamanı davranışı bu turda **yeniden ölçülmedi**; tur 1'in altı yollu doğrulamasına ve
  P4 + dört kapı testine dayanıldı.
- **`pnpm build` / `pnpm test` / Playwright koşturulmadı** (handoff yasağı; `perf` tur 3
  ile paralellik).
