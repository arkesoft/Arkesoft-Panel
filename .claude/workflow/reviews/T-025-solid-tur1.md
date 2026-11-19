# T-025 — `solid` gate, tur 1

- **Tarih:** 2026-11-19
- **Sürüm:** ROADMAP v0.0.21.1
- **Kapsam:** 9 değişen dosya (7 `M` + 2 `??`), 645 ekleme / 48 silme (Orkestratör ölçtü)
- **Araç kısıtı:** `Bash` YOK ⇒ hiçbir komut koşturulmadı. Ölçülemeyen her şey
  `DOĞRULANAMADI` altında.

```
GATE: solid
SONUÇ: PASS
```

FAIL kuralı (`AGENT_BASELINE` §4): 0 critical, 0 high, **2 medium**, 9 low ⇒ 1–2 medium =
**PASS**, bulgular teknik borca. `low` bulgular tur açmaz.

---

## 1. Sekiz maddenin sonucu

### (1) `same-origin.guard.ts` — SRP: dört sorumluluk mu? → **HAYIR, bölünme gerekmiyor**

Gerekçe SRP'nin kendi tanımıyla ("değişmek için kaç ayrı sebep") ölçüldü:

| Değişim sebebi                             | Hangi dosya değişir                                              | Guard değişir mi             |
| ------------------------------------------ | ---------------------------------------------------------------- | ---------------------------- |
| Orijin güven politikası (dal sırası, metot) | `detectViolationAgainstTrustedOrigins` (aynı dosya, saf fonksiyon) | Sınıf **değişmez**           |
| Yeni güvenilir orijin kaynağı (env alanı)  | `trusted-origins.ts` **+** `determineTrustedOriginSources`         | **Evet** (bkz. `M1`)         |
| Log şekli / teşhis alanı                    | `canActivate`                                                     | Evet (zaten guard'ın işi)    |
| Hata gövdesi / tel sözleşmesi               | `CrossSiteRequestRejectedError`                                   | Sınıf **değişmez**           |

Sınıfın kendisi **50 satır** (`:276-325`), gövdesinde **tek** karar çağrısı + tek log +
tek `throw` var; karar mantığı saf fonksiyonlara, türetme `trusted-origins.ts`'e
delegedir. Yapıcıdaki iki satır (`:291-292`) "kurulum", davranış değil. Bir Nest guard'ı
için bu kanonik şekildir — ayrı bir `SameOriginPolicy` sınıfı çıkarmak bugün **tek
kullanımlı bir sarmalayıcı** üretir (KISS ihlali) ve `M1`'deki asıl kuplajı (paralel env
listesi) **taşımaz, yalnızca yerini değiştirir**. Bölünme **önerilmiyor**.

Tek yapısal not `M1`'in içinde: `determineTrustedOriginSources` **guard'da değil,
`trusted-origins.ts`'te** (kardeşinin yanında) dursa drift *görünür* olurdu. Bu
**opsiyonel**; `M1`'in zorunlu kısmı test tarafı.

### (2) `determineTrustedOriginSources` drift riski → **DRY ihlali DEĞİL, ölçüm boşluğu** (`M1`, medium)

Ölçüldü: ortada **mantık** tekrarı yok (normalize/kiracı-reddi tekrarlanmamış, yalnızca
"bu alan boş mu" sorusu var) ama **üç** dosya aynı üç alanlık listeyi bağımsız biliyor:

1. `apps/api/src/auth/trusted-origins.ts:117-135` (gerçek türetme)
2. `apps/api/src/auth/same-origin.guard.ts:262-274` (ad listesi)
3. `apps/api/src/__tests__/same-origin-guard-diagnostics.test.ts:75-87` (testin **üçüncü**
   kopyası)

**Dördüncü kaynak senaryosu (ölçülmüş sonuç):** yalnızca (1)'e eklenirse (2) ve (3) **kendi
aralarında tutarlı kalır** ⇒ test yeşil, log sessizce eksik raporlar. Yani drift'in
**mekanik dedektörü yok** ve testin beklenen değeri üretim mantığının *aynası* olduğu için
assert "davranışı" değil "implementasyonu" doğruluyor. `M1` bunu ölçülebilir hâle getirir.

Bu bir **DRY ihlali değildir** (CLAUDE.md'nin "farklı sebeplerle değişecek iki şeyi
birleştirme" uyarısı burada geçerli: biri *orijin üretir*, diğeri *ad üretir*), **test
kalitesi** bulgusudur.

### (3) İki giriş noktası asimetrisi → **kabul edilebilir; `low` borç** (`L8`)

Ölçüldü (grep, tüm `**/*.ts`): `detectSameOriginViolation`'ın **üretim tüketicisi sıfır**
(yalnızca `same-origin-guard.test.ts`'in 11 + 6 çağrısı ve yorumlar).
`detectSameOriginViolationAgainstTrustedOrigins`'in **tek** üretim tüketicisi
`canActivate:297`.

Asıl kriter şu: **iki karar implementasyonu var mı?** YOK — ikisi de
`detectViolationAgainstTrustedOrigins`'i (`:171-208`) çağırıyor; dal mantığı tek yerde.
Bilgi kaybı (`?.reason`) yalnızca **üretimde kullanılmayan** yolda yaşıyor, yani
"zenginleştirilmiş bilgi kaybolup üretim kararını zayıflatıyor" durumu **yok**. Maliyet:
bir fazladan dışa açık fonksiyon + `AC-26` matrisinin 6 vakasının aynada koşması.
Kaldırmanın maliyeti 17 çağrı yerinin mekanik göçü, kazancı yalnızca yüzey daraltma ⇒
**tur açmaya değmez** (T-024'teki aynı ölçüm disiplini).

### (4) `api-env.ts` (+122) → **temiz**, 1 low (`L9`)

- Ölü kod yok; `MAX_ADDITIONAL_TRUSTED_ORIGINS` (test + şema), `splitAdditionalTrustedOrigins`
  (3 tüketici) kullanılıyor.
- Kopya mantık yok: bölme tek fonksiyonda, kiracı reddi bilinçli olarak türetmede (`R12`).
- `any` **0**, `@ts-ignore` **0**, runtime doğrulamasız `as` **0**.
- Dönüş tipleri açık: `splitAdditionalTrustedOrigins(): readonly string[]`,
  `validateAdditionalTrustedOriginEntry(): string | undefined`.
- **Değer sızdırmıyor — mekanik olarak doğrulandı:** beş mesajın hiçbiri `entry`/`raw`
  interpolasyonu taşımıyor (`:99,103,107,111,115`), kardinalite mesajı yalnızca sabiti
  yazıyor (`:214`); `parseEnv` de yalnızca `issue.path` + `issue.message` yüzeye çıkarıyor
  (`packages/config/src/env.ts:228-231`, OKUNDU) ⇒ değer hiçbir katmanda sızmıyor.
- **`'\u{2A}'` GEREKÇELİ** (gizem değil): `AGENT_BASELINE` §5 literal-jeton kuralı +
  emsal `trusted-origins.ts:21-27`. Bu dosya jokeri *denetleyen* koddur; glifi bitişik
  yazmak kendi taramasını kalıcı yanlış-pozitife düşürürdü. Okunabilirlik bedeli
  `WILDCARD_CHARACTER` adı ve "U+002A ASTERISK" açıklamasıyla (`:74-84`) ödenmiş.
- Şema-içi `superRefine` yerleşimi doğru: üst sınır aşılınca `return` ile erken çıkıyor
  (`:217`) ⇒ 9+ girdide 9 ayrı mesaj yerine tek mesaj; bilinçli.

### (5) Üç test dosyası → **AC'ler karşılanıyor**, 1 medium (`M2`) + 3 low

- **`AC-26` (dört göz) karşılandı:** `same-origin-guard.test.ts:298-305` matrisi
  `GET`/`POST` × güvenilir/güvenilmeyen `Referer`'ı (hepsi çerezli) **açıkça** iddia ediyor,
  üstüne `HEAD`/`OPTIONS` ekliyor. Assert **yönü doğru**: `GET` + güvenilmeyen `Referer` →
  `origin_mismatch` (**sıkı** taraf), muafiyet yalnızca üçüncü dalda kalıyor.
- **T-023 tuzağı (kapatılan hatayı pinleme) arandı — bulunmadı.** Tek "izin verilir"
  pini `trpc-surface 3/5` ve `same-origin-guard.test.ts:207` (üçüncü dal + güvenli metot)
  ki bu **tasarlanmış** muafiyet, kapatılmış bir açık değil (guard dosya başı
  `:33-42`'nin gerekçesi).
- **`AC-28` boşluk savunması gerçekten çalışıyor:** (a) kayıt varlığı `toHaveLength(1)` ile
  **önce** pinleniyor (`diagnostics:229`), (b) negatif tarama ayırt edici jetonla
  (`probe-d24` + `65123`) ve hostname/port/alt-dize dörtlüsüyle yapılıyor
  (`:242-245`), (c) gövde alan listesi **kapalı küme** olarak iddia ediliyor (`:207-212`).
  Bu üçü birlikte vacuity'yi kapatıyor.
- **Boşluk:** aynı dosyadaki `trustedOriginSources` iddiası bu disiplinin **dışında**
  kalmış (`M1`), ve `(d)-1/(d)-2` çıplak `rejects.toThrow()` kullanıyor (`M2`).
- `trpc-surface 2/5` ve `3/5`'in `not.toBe(403)` zayıflığı **bulgu değil**: amacı negatif
  pinlerin "her şey 403" hâline düşmediğini göstermek ve bunu yapıyor; uca ait `toBe(200)`
  pini zaten `no-store-headers.test.ts:101-108`'de var (dosya başı yorumu ölçmüş) ⇒ kapsam
  boşluğu yok.

### (6) `createMemoryLogStream` kopyası → **bu turda DOĞRU**, borç satırı yazıldı (`L7`)

Ölçüldü: `apps/api` içinde `function createMemoryLogStream` tanımlayan **18** dosya (yeni
dosya dahil). ⚠ Kopyalar **birebir değil** — üç farklı dönüş yüzeyi ölçüldü:
`getRecords` yalnız (`trpc-error-boundary-logging.test.ts:122-143`), `getFullText` yalnız
(`session-ip-not-logged.test.ts:87-99`), **ikisi birden** (yeni dosya `:107-131`).
T-021'de `solid` M2'nin paylaşıma zorladığı `findVerificationToken` vakası **dört BİREBİR
kopya** idi; buradaki durum o emsale **uymuyor**. Ayrıca paylaşılan bir helper'ın
`logRecordSchema` davranışı 17 süiti birden etkiler ⇒ çıkarma **additive** yapılmalı ve
ayrı bir Task'ta. `architect`'in "kapsam dışı" kararı **ölçümle doğrulandı**.

### (7) Katman / bağımlılık yönü → **ihlal YOK, döngü YOK**

- `apps/api` → `@arkesoft/tenancy` **yeni bağ değil**: `apps/api/package.json:34`'te
  zaten var; `RESERVED_SUBDOMAINS` daha önce de tüketiliyor
  (`__tests__/registration.test.ts:53`), `normalizeHostname` `tenancy/tenant-resolver.service.ts:32`'de.
  Yön `apps/* → packages/*` korunuyor; `packages/tenancy`'nin hiç bağımlılığı yok ⇒ döngü
  imkânsız. `trusted-origins.ts` o pakete **yazmıyor**, yalnızca saf sabiti okuyor.
- Dosyalar arası döngü yok: `auth/* → config/api-env.ts` tek yönlü (`api-env.ts` `auth`'tan
  hiçbir şey ithal etmiyor).
- `apps/superadmin/e2e` → `apps/superadmin/src` ithali **kabul edilebilir**: aynı uygulama
  içi, `apps/* → apps/*` çapraz ithal değil; emsal **ikilidir** —
  `apps/superadmin/playwright.config.ts:31` **ve** `vite.config.ts:31` aynı modülü aynı
  fonksiyon için ithal ediyor. Üçü aynı `resolveSuperadminDevPort` çağrısıyla **birlikte
  kayıyor**, ki `D22`'nin kök nedeni tam da bunun olmamasıydı. Fixture `apps/api`'den
  ithal **etmiyor** (dosya başı kısıtı korunmuş).

### (8) `.env.example` ↔ kod → **tutarlı**, 1 low (`L5`)

| `.env.example` iddiası (satır)                        | Kod karşılığı                                | Sonuç                   |
| ----------------------------------------------------- | -------------------------------------------- | ----------------------- |
| "üst sınır 8 orijin" (`:202`)                         | `api-env.ts:58` `= 8`, `:211` `>` karşılaştırma | ✅                      |
| "Opsiyonel… bayt-birebir aynı" (`:185-186`)           | `api-env.ts:207` `.default('')`               | ✅                      |
| "TOPLAMALI — çıkarma/değiştirme YOK" (`:189`)         | `trusted-origins.ts:134` `origins.push`       | ✅                      |
| "virgülle ayrılmış, TAM EŞLEŞMELİ" (`:189-190`)       | `splitAdditionalTrustedOrigins` + `includes`  | ✅                      |
| "kiracı orijini açılışta REDDEDİLİR" (`:196-198`)     | `trusted-origins.ts:128-132` `throw`          | ✅                      |
| "biçim hatası GÜRÜLTÜLÜ RET" (`:203`)                 | `api-env.ts:208-226` `superRefine`            | ✅                      |
| "Rezerve etiketler (`panel/superadmin/api/www/app`)"  | `reserved-subdomains.ts:25-38` → **12 etiket** | ⚠ eksik sayım → `L5`    |
| 4 ayrı biçim kuralı tek "biçim hatası" olarak özetli  | `api-env.ts:99/103/107/111/115`               | ⚠ `L5` (yol/sorgu farkı) |

---

## 2. Bulgular

### `M1` — [SEV: medium] `apps/api/src/__tests__/same-origin-guard-diagnostics.test.ts:75-87, 237` — `trustedOriginSources` iddiası ortam bağımlı ve üretimin aynası

**Ölçüm:** beklenen değer (`expectedTrustedOriginSources`) üretim fonksiyonunun
(`same-origin.guard.ts:262-274`) satır satır aynası ve **aynı gerçek `process.env`'den**
besleniyor (`:65` `parseEnv(apiEnvSchema)`). ⇒ `SUPERADMIN_BASE_URL` ve
`ADDITIONAL_TRUSTED_ORIGINS` tanımsızken (CI'ın beklenen hâli) beklenen değer
`['AUTH_BASE_URL']`'e iner ve `determineTrustedOriginSources`'ın **iki koşul dalı da hiç
koşmaz** — fonksiyon gövdesi `['AUTH_BASE_URL']` sabitine indirgense bile test **yeşil
kalır**. Kardeş dosya `trusted-origins.test.ts:21-28` **tam bu tuzağı** (`po` ölçtü)
açıkça nötrleyerek sertleştirmiş; bu dosya o dersi uygulamamış. Ayrıca aynı üç alanlık
liste üç dosyada paralel yaşıyor (bkz. §1.2), drift'in mekanik dedektörü yok.
**`AC-28` karşılanıyor** — bu, AC'nin değil, dört teşhis alanından **birinin** pin
gücünün bulgusudur.

**Önerilen düzeltme (güvenlik etkisi ÖLÇÜLDÜ: sıfır — yalnızca test, üretim dosyasına tek
satır dokunmaz, fail-closed yönü değişmez, yalnızca kapsam ekler):** `R11/R12` describe'ı
zaten `createTestApp({ apiEnv })` ile env kuruyor (`:291-305`, rezerve alt alan adı vakası
`FIRLAMIYOR`). Aynı env'le kurulan uygulamada bir ihlal isteği atıp
`trustedOriginSources`'un `['AUTH_BASE_URL', 'ADDITIONAL_TRUSTED_ORIGINS']` **ve**
`trustedOriginCount`'un bir artmış olduğunu iddia etmek üçüncü dalı da pinler.
_Opsiyonel yapısal:_ `determineTrustedOriginSources`'ı `trusted-origins.ts`'e (kardeşinin
yanına) taşımak drift'i tek dosyada görünür kılar — davranış değişmez (saf fonksiyon,
log içeriği aynı), guard'ın `splitAdditionalTrustedOrigins` ithali düşer.
**Sorumlu ajan:** `qa` (test) / opsiyonel yapısal kısım `backend`.

### `M2` — [SEV: medium] `apps/api/src/__tests__/same-origin-guard-diagnostics.test.ts:272, 286` — çıplak `rejects.toThrow()` reddi yanlış sebebe atfedebilir

**Ölçüm:** `(d)-1` "kiracı alt alan adı reddi"ni iddia ediyor ama argümansız
`toThrow()` **herhangi bir** init hatasını (DB, port, başka env) kabul eder. Ek olarak
`describe` başlığı reddi **"guard'ın YAPICISINDAKİ türetme"ye** atfediyor; oysa
`resolveTrustedOrigins` açılışta **iki** yerden çağrılıyor (`same-origin.guard.ts:291`
**ve** `auth-instance.ts`'in `trustedOrigins` seçeneği, `trusted-origins.ts:12-14`'ün
kendi ifadesi) ⇒ test guard'ın yapıcısını **izole etmiyor**, hangi çağrının fırlattığını
ayırt edemez. `(d)-3` negatif kontrolü (rezerve etiket → fırlamaz) atfın yarısını
kurtarıyor (hata gerçekten `ADDITIONAL_TRUSTED_ORIGINS` değerine bağlı), bu yüzden
`high` değil `medium`.

**Önerilen düzeltme (güvenlik etkisi ÖLÇÜLDÜ: sıfır — test yalnızca **sıkılaşır**, yanlış
hata artık geçmez; üretim mesajı zaten var, Türkçe ve değer sızdırmıyor):**
`(d)-1` için `rejects.toThrow(/kiracı alt alan adı içeremez/)`
(`trusted-origins.ts:129-131` literali), `(d)-2` için en az `rejects.toThrow(TypeError)`
veya `/Invalid URL/`. Başlıktaki "guard'ın YAPICISINDAKİ" atfı "açılış zamanlı türetmede
(guard yapıcısı **veya** `auth-instance`)" olarak düzeltilmeli.
**Sorumlu ajan:** `qa`.

---

## 3. `low` bulgular — **tur açmaz**, ROADMAP teknik borç satırları

> `AGENT_BASELINE` §4 istisnası: `M1`/`M2` düzeltmesi aynı dosyada yolu üstündeyse
> `L4`/`L6` de kapatılabilir.

- **`L1`** [low] `apps/api/src/auth/trusted-origins.ts:54-58` — **bayat yorum**:
  "`SameOriginGuard.canActivate`'in BUGÜNKÜ hâli bu fonksiyonu HER İSTEKTE çağırıyor
  (T-025/S3'ün taşıyacağı borç … bu turun kapsamı DEĞİL)". S3 **aynı değişiklikte** yaptı
  (`same-origin.guard.ts:290-293`). Bu yorum, yorumun kendisinin savunduğu değişmezin
  (`yalnızca açılış zamanında çağrılır`) tersini anlatıyor. Vade: `docs`/`release` turu.
  **Sorumlu:** `backend`.
- **`L2`** [low] `apps/api/src/auth/same-origin.guard.ts:43-52` — **bayat ileri atıf**:
  "TAM bir metot×dal matrisiyle PİNLENMEMİŞTİR (o matris `S4`'ün kapsamı)". S4'ün matrisi
  gönderildi (`same-origin-guard.test.ts:287-334`). Doğru metin: "ikinci dal × dört metot
  pinli; birinci/üçüncü dal × `HEAD`/`OPTIONS` hâlâ pinli değil". **Sorumlu:** `backend`.
- **`L3`** [low] `apps/api/src/auth/same-origin.guard.ts:251-253` — JSDoc "**KATKIDA
  BULUNAN** ortam değişkeni adları" **ölçülebilir biçimde yanlış**: tekilleştirme
  yüzünden `SUPERADMIN_BASE_URL === AUTH_BASE_URL` iken alan listede görünür ama listeye
  eleman **eklemez** (`trusted-origins.test.ts:132-141` tam bu vakayı ölçüyor: iki kaynak →
  1 eleman). Doğru ifade: "tanımlı / boş olmayan alan adları". **Sorumlu:** `backend`.
- **`L4`** [low] `apps/api/src/__tests__/trusted-origins.test.ts:180-187` — **sınır
  pinlenmemiş**: yalnızca `MAX+1` reddi test ediliyor; `>` → `>=` mutasyonu (tam 8 girdinin
  reddi) **hiçbir testi kırmaz**. Mutasyonun yönü fail-**closed** (geçerli yapılandırmayı
  açılışta gürültülü reddeder) ⇒ güvenlik etkisi yok, bu yüzden `low`. Düzeltme: tam
  `MAX_ADDITIONAL_TRUSTED_ORIGINS` girdiyle `not.toThrow()` + `toHaveLength(9)` vakası
  (yalnızca test, additive). **Sorumlu:** `qa`.
- **`L5`** [low] `.env.example:199` ve `:202-203` — belge/kod eksik sayımı: parantezli
  beş rezerve etiket, `packages/tenancy/src/reserved-subdomains.ts:25-38`'deki **12**
  etiketin alt kümesi ("ör." yok ⇒ kapalı liste gibi okunuyor); ayrıca dört ayrı biçim
  kuralı tek "biçim hatası" olarak özetlenmiş — özellikle **yol/sorgu/fragment reddi**
  (`api-env.ts:114`) kardeş `SUPERADMIN_BASE_URL`'in *sessiz orijine indirme* davranışından
  **farklı** olduğu için operatör tuzağı. **Sorumlu:** `docs`.
- **`L6`** [low] `apps/api/src/__tests__/same-origin-guard.test.ts:25` + `:33` — aynı
  modülden **iki ayrı import satırı**; gerekçesi (alt görevin "yalnızca ekleme" kısıtı)
  alt görev bittiği için **artık geçerli değil**. Birleştirme davranış değiştirmez.
  **Sorumlu:** `qa`.
- **`L7`** [low] `apps/api/src/__tests__/same-origin-guard-diagnostics.test.ts:107-131` —
  `createMemoryLogStream` 18. kopya (ölçüldü). Bu turda **doğru karar** (§1.6); borç olarak
  kaydı: üç farklı dönüş yüzeyinin birleşimi bu dosyada oluştu ⇒ ileride
  `__tests__/helpers/memory-log-stream.ts` **additive** olarak çıkarılabilir, 17 dosyanın
  göçü ayrı Task. ⚠ Dosya başı yorumu "20+ dosya" diyor, ölçülen **18**. **Sorumlu:** `qa`.
- **`L8`** [low] `apps/api/src/auth/same-origin.guard.ts:224-231` — `detectSameOriginViolation`
  **üretimde sıfır tüketicili** dışa açık fonksiyon (grep ölçtü); yalnızca testleri
  değişmeden tutmak için yaşıyor. Karar mantığı tek yerde olduğu için **tasarım kokusu
  sayılmadı** (§1.3). İleride bu dosya açıldığında 17 çağrı yeri mekanik göçle
  (`[new URL(x).origin]` + `?.reason`) kapatılabilir; davranış değişmez.
  **Sorumlu:** `backend`.
- **`L9`** [low] `apps/api/src/config/api-env.ts:99,103,107,111,115,214` — mesajlar
  değişken adını **tekrar** ediyor; `parseEnv` zaten `"<KEY>: <message>"` biçiminde
  önekliyor (`packages/config/src/env.ts:229-230`) ⇒ operatör çıktısı
  "ADDITIONAL_TRUSTED_ORIGINS: ADDITIONAL_TRUSTED_ORIGINS içindeki bir girdi…" oluyor.
  Aynı dosyadaki diğer mesajlar (`:38-42`, `:127`, `:145-146`) öneki tekrarlamıyor ⇒
  konvansiyon sapması. Öneki kaldırmak mevcut test matcher'larını (`/joker karakter/`,
  `/en fazla/` vb.) **kırmaz** (ölçüldü). **Sorumlu:** `backend`.

---

## 4. ÖLÇÜMLER

- **İncelenen dosya:** 9 kapsam-içi (`same-origin.guard.ts`, `trusted-origins.ts`,
  `api-env.ts`, `same-origin-guard.test.ts`, `trusted-origins.test.ts`,
  `same-origin-guard-trpc-surface.test.ts`, `same-origin-guard-diagnostics.test.ts`,
  `platform-admin.ts`, `.env.example`) + 7 referans dosya (`resolve-host.ts`,
  `reserved-subdomains.ts`, `packages/config/src/env.ts`, `trpc-error-boundary-logging.test.ts`,
  `session-ip-not-logged.test.ts`, `superadmin-config.ts` greps, `T-025.md`).
- **`any`:** 0 (tek eşleşme `diagnostics.test.ts:195`'teki **Türkçe yorum metni**).
  **`@ts-ignore`/`@ts-expect-error`:** 0. **`eslint-disable`:** 0.
  Runtime doğrulamasız `as` **0** (yalnızca iki `as const` literal daraltması —
  `same-origin-guard.test.ts:300-305`, tip seviyesi, çalışma zamanı zorlaması değil).
- **En büyük fonksiyon (üretim):** `detectViolationAgainstTrustedOrigins`
  `same-origin.guard.ts:171-208` = **38 satır** (yorumlar dahil; 4 dal, 7 ifade).
  Takip: `canActivate` 30 satır, `validateAdditionalTrustedOriginEntry` 27 satır,
  `resolveTrustedOrigins` 25 satır, `determineTrustedOriginSources` 13 satır.
- **En büyük test gövdesi:** `same-origin-guard-diagnostics.test.ts:183-246` = **64 satır**
  (tek `it`, (a)+(b)+(c) bilinçli olarak **aynı koşumda** — boşluk savunmasının şartı,
  bölünmesi iddiayı zayıflatırdı).
- **En büyük bildirim:** `apiEnvSchema` nesne literali `api-env.ts:125-227` = 103 satır
  (şema bildirimi, fonksiyon değil).
- **Dışa açık fonksiyon dönüş tipi eksiği:** 0.
- **Guard sınıfı:** 50 satır, 2 alan, 1 metot.
- **Katman ihlali:** 0. **Döngüsel bağımlılık:** 0 (paket ve dosya seviyesi).
- **Sağlayıcıya özgü dallanma (`if (provider === …)`):** 0 — bu yüzey sağlayıcı taşımıyor.
- **Yutulan hata:** 0 (`catch` blokları: `same-origin.guard.ts:155` ve `api-env.ts:98` —
  ikisi de **fail-closed** dönüş üretiyor ve gerekçesi yorumlu; boş `catch {}` yok).
- **`createMemoryLogStream` kopyası:** 18 dosya (`apps/api`, ölçüldü), 3 farklı dönüş yüzeyi.
- **`RESERVED_SUBDOMAINS` kardinalitesi:** 12 (belge 5 sayıyor → `L5`).

## 5. DOĞRULANAMADI

`Bash` aracı yok; aşağıdakilerin hiçbiri koşturulmadı, **tahminle PASS verilmedi** —
bunlar `qa` gate'inin ölçümüne bırakıldı:

1. `pnpm lint` / `pnpm typecheck` / `npx vitest run same-origin-guard*` /
   `npx vitest run trusted-origins` — **koşturulmadı**. Testlerin gerçekten yeşil olduğu,
   özellikle `(d)-1/(d)-2`'nin `app.init()` aşamasında gerçekten fırladığı
   **doğrulanamadı** (statik okumayla beklenen davranış: fırlar).
2. Nest'in guard yapıcısını **ne zaman** çağırdığı (modül init vs. ilk istek) kaynaktan
   doğrulanmadı ⇒ "fail-fast açılışa çekildi" (`R11`) iddiası statik olarak **makul**ama
   ölçülmedi. `M2`'nin "iki çağrı yerinden hangisi fırlıyor" sorusu da bu ölçüme bağlı.
3. CI ortamında `SUPERADMIN_BASE_URL` / `ADDITIONAL_TRUSTED_ORIGINS`'in tanımlı olup
   olmadığı okunamadı ⇒ `M1`'in "iki dal hiç koşmaz" sonucu **CI için** kesinleşmedi;
   ortam bağımlılığının **kendisi** zaten bulgunun konusu.
4. `git diff` okunmadı (yalnızca çalışma ağacının güncel hâli okundu) ⇒ hangi satırın bu
   Task'ta eklendiği Orkestratör'ün verdiği yüzey listesine **güvenilerek** kabul edildi.
5. `git status`'ta kapsam dışı üç yol daha görünüyor (`apps/admin/e2e/panel-flow.spec.ts`,
   `apps/admin/e2e/helpers/`, `apps/admin/e2e/registration-flow.spec.ts`). Handoff'un
   değişen yüzeyinde **yoklar** ⇒ **incelenmedi**; T-025'e ait olup olmadıkları
   doğrulanamadı.
6. `prettier --check` koşturulamadı ⇒ bu raporun biçimlendirmesini **Orkestratör**
   kapatmalı (`AGENT_BASELINE` §5, `Bash`'siz gate ajanı kuralı).
