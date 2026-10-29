# T-006 — solid gate, Tur 3 (FIX turu 2 sonrası, SON TUR)

- **Tarih:** 2026-10-29
- **Sürüm:** ROADMAP v0.0.5 (Kimlik doğrulama — Better Auth)
- **Araç kısıtı:** `Bash` YOK. Hiçbir komut çalıştırılmadı; tüm ölçümler `Read`/`Grep`/`Glob`
  ile statik tespittir. Çalıştırılamayanlar "ölçülemedi (araç yok)" olarak işaretlendi.
  **Hiçbir komut çıktısı uydurulmadı.**

```
GATE: solid
SONUÇ: PASS
```

**PASS gerekçesi (AGENT_BASELINE §4, mekanik):** `critical` 0 · `high` 0 · `medium` **2** ·
`low` 14. 1–2 `medium` → PASS, bulgular teknik borca kaydedilir.

İki `medium`'un **ikisi de belge** (ADR-0008 ve `development.md`); **üretim kodunda
`medium` veya üstü bulgu YOK**. Tur 2'nin üç medium'u **üçü de kapandı** (M-3 kısmen →
`low`'a indi).

---

## 0. Önce: tur 2'de YANILDIĞIM nokta — kabul

M-3(2b) iddiam (`development.md`'nin "kolonlara boş dize yazılır" cümlesi uydurma) **YANLIŞTI.**
Şemanın `String?` (nullable) **olmasını** "ne yazılıyor" ile karıştırdım; kolon nullable
olabilir ve yine de boş dize yazılabilir. İki bağımsız canlı ölçüm (Orkestratör 1003/1003,
`security` 1174/1174, `count(ip_address)` = satır sayısı → değerler `''`) cümlenin **doğru**
olduğunu gösterdi. Cümlenin korunması **doğru karardı**; düzeltilseydi doğru bir ifade yanlışa
çevrilecekti.

Bu, tur 2'de kendi M-6 önerimi geri almamla **aynı disiplinin tersten örneği**: bir gate'in
bulgusu yanlış olabilir ve onu ölçerek ayırmak Orkestratörün işidir. Aynı turda (2a) iddiam
(`disableIpTracking` ortam değişkeni değil) **geçerliydi** ve uygulandı; (2c) iddiam
("417+" ölçülmemiş bir sayı) **hâlâ geçerli ve hâlâ açık** → L-10.

---

## 1. Handoff'un dokuz sorusuna yargı

### 1.1 `describe-error-cause.ts` gerçekten DRY'ı çözdü mü? — **EVET, yedi çağıranla**

- **Yedi çağrı noktası / altı dosya, hepsi bağlı (ölçüldü, `Grep`):**
  `errors/domain/rate-limit-store-unavailable.error.ts:30` · `tenancy/tenant-context.middleware.ts:73` ·
  `auth/rate-limit/rate-limit.guard.ts:282` **ve** `:308` · `auth/auth-context.middleware.ts:108` ·
  `redis/redis.service.ts:46` · `redis/redis.module.ts:67`. Zorunlu dördü **ve** kapsam dışı
  üçü de bağlandı.
- **Saf mı? EVET.** Tek import `AppError` (`@arkesoft/errors`). DI yok, `process.env` yok,
  logger yok, I/O yok. `assert-never.ts` emsaliyle birebir tutarlı.
- **Yerleşim doğru mu? EVET.** `apps/api/src/errors/` — `assert-never.ts`'in yanı. `packages/errors`'a
  koymak **yanlış olurdu** (o paket yalnızca `zod`'a bağımlı ve domain mantığı taşımaz, CLAUDE.md §3).
- **Sekizinci kopya kaldı mı?** Bu indirgemenin **hayır** (`cause.message` naif okuması repoda
  kalmadı). **AMA:** `errors/error-mapping.ts:133` ile `main.ts:30` **birbirinin birebir
  kopyası** (`error instanceof Error ? (error.stack ?? error.message) : String(error)`) — ayrı
  bir 2-kopyalı aile, yeni modülün **tam yanında** ve konsolide **edilmedi** → **L-8**
  (`ÖNCEDEN VAR OLAN BORÇ`). Bunlar `describeErrorCause`'un kopyası **değildir** (`.stack`
  BİLEREK okunur, farklı amaç) — birleştirilmeleri **istenmez**, kendi aralarında
  birleştirilmeleri istenir.
- **Yeni risk (kayda değer):** modülün güvenlik değişmezi (`⚠ üçüncü taraf/serbest metin
cause ile KULLANMAYIN`, `:17-24`) **yalnızca yorumda**; adı (`describeErrorCause`) kısıtı
  taşımıyor ve çağıranlardan biri (`auth-context.middleware.ts:108`) **üçüncü taraf
  kütüphanenin** (Better Auth) beklenmeyen istisnasını geçiriyor → **L-1**. Bir tur önce
  `high` olan S-2 tam bu sınıftı. **Sızıntı ÖLÇMEDİM** — ölçülürse `high` olur.

### 1.2 `db`'nin dördüncü kapı keşfi — **pin doğru kurulmuş, K-E5 artık tutuyor (ama yorumu yanlış yerde)**

- **Negatif pin'ler doğru:** `auth-model-narrowing.pin.ts:78-81` (`AppPrismaDatabase.$transaction`)
  ve `:153-156` (`TenantTransactionClient.$transaction`), ikisi de `@ts-expect-error` ile.
  Kod tarafı: `client.ts:102` ve `:133` → `Omit<…, AuthModelName | '$transaction'>`. ✓
- **Pozitif pin'in `$queryRaw`/`$disconnect` ayağı KORUNDU:** `:62-67`. `$transaction` o
  pinden bilerek çıkarılmış ve gerekçesi `:59-60`'ta yazılı. ✓
- **"İç içe `withTenant` tipçe imkânsız" (K-E5) garantisi artık tutuyor mu? EVET — ama
  üç yerde YANLIŞ MEKANİZMAYLA anlatılıyor.** `tenant-context.ts:30-34` (üretim),
  `docs/adr/0007-…md:120-121` ve `docs/adr/0008-…md:52`/`:104` hâlâ "callback'e verilen `tx`
  (`TransactionClient`) `$transaction` metodunu **TAŞIMAZ**" diyor. Bu **ölçülerek yanlış**:
  `client.ts:114-118` + pin `:141-151` `Prisma.TransactionClient`'ın `$transaction`'ı
  **taşıdığını** (ITXClientDenyList onu içermez) kaydediyor. Sonuç tesadüfen doğru
  (`tx`, `ITXClientDenyList`'in düşürdüğü beş üye yüzünden `PrismaDatabase`'e atanamaz;
  ayrıca `WeakMap` kaydı olmadığı için fail-closed `throw` eder) — **mekanizma yanlış**
  → **L-2** (üretim yorumu) + **M-1** (ADR'ler).
- **Not:** `packages/db`'nin KENDİ `withTenant()` imzası (`tenant-context.ts:79`) hâlâ
  daraltılmamış `TransactionClient` alıyor (PO sapması 1, bilinçli) — yani `seed.ts` ve
  paket içi testler sır taşıyan delegelere erişebilir. `apps/api` tarafı `PrismaService.withTenant()`
  ile daraltılmış; **katman ihlali yok**, kapsam farkı belgeli.

### 1.3 ⚠ **Fetch spesifikasyonu bir tasarım gerekçesi MİDİR?** — **EVET. Tur 1'deki "dosya sahipliği" ile AYNI SINIF DEĞİL.**

Bu raporun en kritik yargısı. Soru "hangi kelime daha teknik duruyor" değil; ayrım **yapısal**.
Üç test uyguluyorum:

1. **Testler silinse gerekçe ayakta kalır mı?** "Mevcut test paketini kırmamak" — testler
   değişir değişmez **yanlış** olur; repoyu bir andaki hâliyle tarif eder. "Tarayıcı `Origin`'i
   güvenli metotlarda eklemez" — kontrolün **hizmet etmek zorunda olduğu istemci kümesinin**
   özelliğidir ve repodaki her test silinse de doğru kalır. Yeni başlık bu testi geçiyor.
2. **Gerekçe tehdit modelini mi yoksa yalnızca mevcut semptomu mu öngörüyor?** Fetch
   gerekçesi **yanlışlanabilir bir öngörü** üretiyor: panelin SPA'sının aynı-orijin `GET`'i
   `Origin` taşımaz. Yanlışsa meşru bir okuma reddedilir — üretim istemcisi hakkında bir
   iddia. Test gerekçesi hiçbir şey öngörmüyordu.
3. **Gerekçe kontrolü DARALTIYOR mu GENİŞLETİYOR mu?** Belirleyici olan bu ve FIX 2'yi
   FIX 1'den **derecede değil türde** ayıran da bu. Tur 1'de süreç kısıtı deliği
   **genişletti** (her metot, çerez olsun olmasın, fail-open). Tur 2'de Fetch gerekçesi
   muafiyeti **yalnızca güvenli metotlara** indirdi; CSRF için gerçekten önemli olan dal
   (güvensiz metot + `Cookie`) **fail-CLOSED** oldu ve Better Auth'un `useCookies` eşiğiyle
   birebir örtüştü. Kontrolü, spesifikasyonun "korunamaz" dediği kümeye **sıkıştıran** bir
   gerekçe iş yapıyor; kontrolü, testlerimizin gezdiği kümeye **gevşeten** bir gerekçe
   yapmıyor.

**"Kılık değiştirmiş test gerekçesi" olabilir mi? Hayır — iki ölçülebilir sebeple:**

- Muafiyet, eski testleri yeşil tutmaya **yetmiyor**: çerez gönderen POST çağrılarına
  `.set('Origin', TRUSTED_BASE_URL)` **eklendi** (`same-origin-guard.test.ts:14-15`), yani
  `backend` deliği korumak yerine **kendi testlerini değiştirmeyi** kabul etti. Tur 1
  davranışının tam tersi.
- Muafiyet **bağımsız olarak iş yapıyor**: `GET /auth/sessions` bir okuma ucudur, CSRF
  yanıtı okuyamaz → reddetmek sıfır güvenlik kazandırır, gerçek bir istemciye maliyet
  çıkarır. Kaldırılması güvenlik tiyatrosu olurdu.

**Kalan eleştiri (ve kaydediyorum):** `same-origin.guard.ts:33-35` metot-farkındalığını bir
**teste** dayandırıyor ("…regresyon testi BİLEREK `GET` kullanıyor — bu testin kendisi
metot-farkındalığının GEREKLİLİĞİNİ zaten PİNLİYOR"). Bir test **gereklilik kuramaz**;
yalnızca bir kararı kaydeder. Bu tek cümle, aksi hâlde doğru olan bir başlığın içinde tur
1'in hatasını minyatür hâlde yeniden ithal ediyor. Üstüne satır atfı da **yanlış**: o `GET`
regresyon testi `:184-191`'de (saf fonksiyon hâli `:49-53`), `:118-125`'te değil. → **L-3**.

**Tasarım boşluğu (yeni, öneri):** `SAFE_METHODS` muafiyeti bugün güvenli, çünkü
`SessionsController`'da mutasyon yapan bir güvenli-metot rotası **yok**. Bu değişmez hiçbir
yerde mekanik olarak pinli değil → ileride bir `GET /auth/sessions/revoke-all?id=…` eklenirse
guard sessizce muaf tutar. → **L-4**.

### 1.4 `auth-instance.ts` boyutu — **KÜÇÜLMEDİ, BÜYÜDÜ: 156 → 324 → 428**

- Dosya **428** satır. Kod azaldı (`extractErrorMessage` çıktı, `describeBetterAuthLogCause`
  allowlist'e indi), **yorum arttı**: `:1-122` = **122 satır dosya başı yorumu** (%28,5).
- Yorumlar **neden**i anlatıyor (CLAUDE.md §4 ✓) ve içeriği doğru. Sorun **tür**: başlık
  bir tasarım açıklaması olmaktan çıkıp **tur-tur gate muhasebesine** dönüşmüş
  ("FIX turu 1, madde 6", "FIX turu 2, madde 1 (security tur2 S-2)"). Beş yıl sonra bu
  atıflar çözümsüz olur; ayrıca bu Task'ta yakalanan 10+ bayat yorum kusurunun sürtünme
  yüzeyi tam burası. → **L-5** (öneri; CLAUDE.md'de uzunluk kuralı yok, **ihlal değil**).
- **En büyük fonksiyon: `createAuthInstance` `:305-427` = 123 satır** (tur 2: 106), ≈%90
  yapılandırma literali. **En büyük mantık fonksiyonu hâlâ `rate-limit.guard.ts:162-238`
  `canActivate` = 77 satır** (değişmedi).
- **Aynı yorum-DRY sorunu altı dosyada:** `AggregateError` ölçümü `describe-error-cause.ts:8-13`,
  `redis.service.ts:40-44`, `redis.module.ts:63-66`, `rate-limit.guard.ts:71-74`,
  `auth-context.middleware.ts:103-106`, `tenant-context.middleware.ts:68-70`'te **altı kez
  yeniden anlatılıyor**. Kod tekilleştirildi, **yorum altıya kopyalandı** → ölçüm bir gün
  revize edilirse altı yer değişmek zorunda. → **L-6** (düzeltme: her çağıran tek satır
  "bkz. `describe-error-cause.ts`").

### 1.5 `peekCount()` gerekli miydi? — **HAYIR, ama kabul edilebilir; `RATE_LIMIT_STORE_UNAVAILABLE` FAIL-CLOSED ve davranış DEĞİŞMEDİ**

- **Gerekli değildi.** `checkAndIncrement` Lua betiğinden `count`'u **zaten okuyor**
  (`rate-limit.service.ts:159`) ve `security` tur2 S-4 açıkça "yalnızca
  `RateLimitCheckResult`'a additive bir alan gerekiyor" demişti. Seçilen yol: ikinci bir
  Redis `GET` (başarısız her girişte bir ek gidiş-dönüş) + guard→interceptor arasında
  **okuma-yazma yarışı** (eşzamanlı istek `failureCount`'u şişirir; pencere dolmuşsa `0`
  okur). Gözlemlenebilirlik alanı olduğu için etki küçük → **L-7** (öneri).
- **FAIL-CLOSED korundu, davranış değişmedi:** `checkAndIncrement` `:154-158` ioredis
  reddini yakalayıp `RateLimitStoreUnavailableError` (503 + `isRetryable`) **fırlatıyor** —
  `true` dönüp geçirme **yok**. Hata sınıfının kendi yorumu (`:14-17`) bunu açıkça kayda
  geçiyor. İki test pinliyor: `rate-limit.test.ts:511` (ioredis reddi → 503) ve `:535`
  (`AggregateError` → `causeMessage` boş dize **dönmez**). Önceki 500 `INTERNAL_ERROR`
  tutarsızlığı (`/health/ready` 503 verirken) kapandı. ✓
- **Kalan asimetri:** `peekCount` ve `resetCounter` ioredis hatasını **sarmıyor** (ham
  sağlayıcı hatası adaptörden çıkıyor), `checkAndIncrement` sarıyor. Tek sınıfta iki
  konvansiyon, hiçbiri belgeli değil → **L-9**. `peekCount`/`resetCounter` kopuk
  (detached) yolda olduğu için HTTP eşlemesi gerekmiyor; bu **savunulabilir** bir karar,
  CLAUDE.md §4'ün sağlayıcı-adaptörü kuralı da `packages/integrations` için yazılmış →
  `medium` demiyorum.

### 1.6 `AUTH_SESSION_READER` → `{userId, sessionId}` — **tip GERÇEKTEN daraltıldı; `Object.keys()` testi ikramiye, ikame değil**

- **Tip:** `auth.tokens.ts:42-45` `AuthSessionReaderResult = { userId, sessionId }`;
  `:48-52` `AuthSessionReader.getSession` artık Better Auth'un çıktı tipini **döndürmüyor**.
- **Çalışma zamanı:** `auth.module.ts:129` **yeni bir nesne literali** kuruyor
  (`{ userId: result.user.id, sessionId: result.session.id }`) — ham `token` sarmalayıcıdan
  **fiilen geçmiyor**, yalnızca tipçe gizlenmiyor. Bu kritik fark: salt tip daraltması
  `as` ile aşılabilirdi; eşleme aşılamaz.
- `auth-instance-export-surface.test.ts:126` `Object.keys().sort()` tam eşleşmesi bunun
  **ek** mekanik kanıtı. S-6 kapandı, **bulgu yok**.

### 1.7 Dokuzuncu bayat yorum / sapma — **ARANDI, ÜÇ TANE BULUNDU**

- **`prisma.service.ts:31-48` yorumu `db`'nin değişikliğiyle güncellendi mi? EVET** —
  `:50-60` additive "GÜNCELLEME (FIX turu 2, security tur2 S-1)" bloğu eklendi, `$transaction`
  düşürülmesini ve `grep → 0 eşleşme` ölçümünü kaydediyor. ✓
- **`same-origin.guard.ts`'in "EŞDEĞERİ" iddiası düzeltildi mi? EVET, örnek nitelikte** —
  `:12-20` iddiayı **çürütülmüş olarak** kaydediyor, süreç gerekçesini açıkça **sahiplenip
  reddediyor** ("CLAUDE.md §10.6'nın yasakladığı yönün aynası"). Bir gate bulgusunun
  kaydedilme biçimi olarak bu turun en iyi örneği. ✓
- **ADR-0008 dördüncü kapıyı yazıyor mu? KISMEN — ve yazdığı yer YANLIŞ ÇÖZÜMÜ anlatıyor**
  → **M-1**.
- **Yeni bayatlar:** `tenant-context.ts:30-34` (**L-2**) · `same-origin.guard.ts:33-35`
  satır atfı (**L-3**) · `development.md:537-547` (**M-2**) · ADR-0007:120-121
  (`ÖNCEDEN VAR OLAN BORÇ`, **L-2** ile aynı kök).

### 1.8 `any` / `as` / `@ts-expect-error` sayımı

- **`any`: 0.** `**/src/**/*.ts` genelinde `(:|<|\()\s*any\b|any\[\]|as any` → **0 eşleşme**
  (ölçüldü). `apps/api/src/auth/**` içinde `\bany\b` → **0**.
- **`@ts-ignore`/`@ts-nocheck`: 0.**
- **`@ts-expect-error`: 10** (tur 2: 8). İkisi yeni ve **ikisi de negatif pin**
  (`auth-model-narrowing.pin.ts:79`, `:154`). Hata susturma **yok**.
- **Gerekçesiz `as X` (üretim): tur 2'de 0 → tur 3'te 1.**
  `describe-error-cause.ts:42` `value as { readonly errors?: readonly unknown[] }` — Zod
  doğrulaması **yok** (CLAUDE.md §2'nin lafzı). **`medium` DEMİYORUM** ve gerekçesi önemli:
  bu assertion **hiçbir güven kazandırmıyor** — ürettiği tek üye `readonly unknown[] | undefined`
  ve kullanılan değer hemen `instanceof Error` ile daraltılıyor (`:44`), yani "parse
  edilmemiş veriye tip verme" (kuralın hedefi) **olmuyor**; ayrıca `eslint` (tip-farkındalı,
  strict) 15/15 geçiyor, yani projenin kendi seçtiği araç bu biçimi kasıtlı olarak
  geçiriyor. **Sıfır maliyetli alternatif var:** `if ('errors' in value && Array.isArray(value.errors))`
  → assertion hiç gerekmez. → **L-11**.

### 1.9 Tur 1'in 13 `low`'u ve tur 2'nin 13 `low`'u — durum

`L-4` (çoğul `Origin` başlığı) `backend` tarafından kapsam dışı bırakıldı ve
`same-origin.guard.ts:50` yorumu bunu açıkça sahipleniyor ("ilk değer okunur, solid tur2
L-4") — **AÇIK, kabul edilmiş**, şiddet takdiri `security`/`qa`'da. Tam liste §3'te.

---

## 2. BULGULAR

### [SEV: medium]

**M-1** — `docs/adr/0008-sir-tasiyan-tablolarin-tipi-ve-linti-ile-korunmasi.md:41` · `:43` ·
`:52` · `:102` · `:104` · `:120` — **ADR'nin normatif kod bloğu artık koda UYMUYOR ve
"ek not"u UYGULANMAYAN çözümü anlatıyor.** Dört ayrı sapma:

1. `:41`/`:43` kod bloğu `Omit<PrismaDatabase, AuthModelName>` ve
   `Omit<TransactionClient, AuthModelName>` gösteriyor. Gerçek kod (`packages/db/src/client.ts:102`
   ve `:133`) **`Omit<…, AuthModelName | '$transaction'>`**. ADR'nin tek normatif tanımı,
   FIX turu 2'nin asıl düzeltmesini **içermiyor**.
2. `:102` ve `:120` düzeltmeyi "**`$transaction` callback'inin parametresi daraltılıyor**"
   diye anlatıyor. `db` bu seçeneği **ÖLÇTÜ ve BİLEREK REDDETTİ** (`client.ts:88-100`:
   narrow edilse bile `withTenant`'ın GUC adımı atlanır → "narrow = güvenli" yanılgısı;
   ayrıca Prisma'nın iç tiplerini yeniden bildirmek gerekir). Uygulanan çözüm
   `$transaction`'ı **tamamen düşürmek**. ADR, **seçilmeyen** alternatifi "yapıldı" diye
   kaydediyor — v0.0.14'te bu ADR'yi okuyup `$transaction`'ı geri açan biri boşluğu
   yeniden açar.
3. `:52` ve `:104` "iç içe `withTenant()` çağrısını yapısal olarak imkânsız kılıyor"
   mekanizmasını tekrar ediyor; bu mekanizma (`tx`'in `$transaction` taşımaması) **bu
   turda ölçülerek yanlışlandı** (`client.ts:114-118`, pin `:141-151`).
4. Tur 2 L-6'nın kalanları **açık**: `:106` lint kapısını olduğundan **dar** tarif ediyor
   (gerçek muafiyet kümesi `src/prisma/**`, `src/auth/**` **ve** `src/__tests__/**`) ve
   yine **yanlış satır aralığıyla** atıf veriyor (`eslint.config.mjs:3-20`); `:93`
   `sp_executesql` (SQL Server yordamı, PostgreSQL ADR'sinde uydurma ayrıntı); `:18`
   "yapisal", `:22` "mekanizm", `:128` "Darlama", `:132` "modül saplantıya"/"fab rikatörü",
   `:134` "Üzün yolu", `:153` "reddetilmiş" bozuk sözcükleri duruyor.

**Niçin `medium`:** ADR, bu repoda normatif bir karar kaydıdır ve kendi `:101` uyarısı bu
sınıfı **adıyla** yasaklıyor: "belgelenmiş ama gerçekleşmeyen bir kontrol, var olmayan ama
belgelenmemiş bir kontrolden daha tehlikelidir." Kod doğru; kaydı yanlış.
**Önerilen düzeltme:** `:41`/`:43`'ü `client.ts`'ten **kopyala**; `:102`/`:120`'de "callback
parametresi daraltıldı" → "`$transaction` üyesi tamamen düşürüldü; callback daraltması
ölçüldü ve `client.ts:88-100`'deki gerekçeyle reddedildi"; `:52`/`:104`'ün mekanizma
cümlesini `ITXClientDenyList` gerçeğiyle düzelt (sonuç doğru, sebep farklı); `:106` muafiyet
kümesini ve satır atfını `eslint.config.mjs`'ten doğrula; `:93` uydurma ayrıntıyı **sil**.
— **Sorumlu: architect (1–3), S9/docs (4)** — **T-006 KUSURU** (1–3 bu turda doğdu;
4 `ÖNCEDEN VAR OLAN BORÇ`, tur 2'den devredildi)

**M-2** — `docs/development.md:537-547` ("503 Kurtarma Yolu") — **runbook'un İKİ olgusal
iddiası da yanlış ve ikisi de bu Task'ın KENDİ ölçümleri/testleriyle çürütülüyor.**

1. `:539` "Kayıt sırasında SMTP hatası meydana gelirse (Mailpit down vb.)
   `POST /auth/sign-up/email` **503** döner." → **Yapısal olarak imkânsız.**
   `auth-instance.ts:54-63` (kaynak okumasıyla) better-auth'un `runInBackgroundOrAwait`'inin
   hatayı **hiçbir yapılandırmayla** yukarı fırlatmadığını kaydediyor; `security` ölçtü
   (`PROB1_STATUS=200`); repodaki **geçen bir test** bunun tersini pinliyor
   (`auth-secret-leak.test.ts:240-241`, gerçek `550` reddi → 2xx assert'i). Operatör, tam
   olarak belgede örnek verilen senaryoda (Mailpit kapalı) **asla gelmeyecek** bir durum
   kodunu arar; gerçek belirti **200 + e-posta gitmemesi**dir.
2. `:539` "yeniden kayıt denemesi 'zaten kayıtlı' hatası verir." → **Yanlış ve bilinçli
   bir güvenlik kararının tersi.** `security` ölçtü: aynı e-postayla ikinci kayıt **200 +
   UYDURMA `user.id`** döner, DB'de ikinci satır **oluşmaz** (A3/K4 hesap-varlığı
   sızdırmazlığı). Belge, kaldırılmış bir hata mesajını runbook adımı olarak sunuyor.

Kurtarma yolunun **kendisi** (`/auth/send-verification-email`, `:541-547`) geçerli ve
değerli — yanlış olan **tetikleyici tarifi**. Bu, tur 2 M-3(1)'in (oran sınırı yanlış
gruplaması) aynı sınıfı; o düzeltildi, bu bölüm atlandı.
**Önerilen düzeltme:** başlığı "E-posta gönderilemedi — kurtarma" yap; `:539`'u ölçülmüş
gerçekle değiştir ("istek **2xx** döner, kullanıcı satırı oluşur, e-posta **gitmez**;
belirti yalnızca logdadır: `causeCode: MAIL_DELIVERY_FAILED` + `providerResponseCode` —
bkz. `auth-instance.ts` dosya başı yorumu, ölçülmüş sapma"); ikinci cümleyi **sil** veya
"ikinci kayıt denemesi de 200 döner (varlık sızdırmazlığı, A3) — kullanıcıyı
`/auth/send-verification-email`'e yönlendir" yap. `architect`'in "HATA SINIFLARI"
tablosundaki 503 satırı da aynı turda uyumlanmalı.
— **Sorumlu: S9/docs (metin), architect (HATA SINIFLARI + ROADMAP borç satırı)** —
**T-006 KUSURU** (bölüm bu Task'ta yazıldı; sapma FIX 1'de ölçüldü, belgeye taşınmadı)

---

### [SEV: low]

**L-1** — `apps/api/src/errors/describe-error-cause.ts:17-24` + `:34` + `:60` ·
çağıran `apps/api/src/auth/auth-context.middleware.ts:108` — **yeni ortak modülün güvenlik
değişmezi YALNIZCA YORUMDA; adı kısıtı taşımıyor ve çağıranlardan biri zaten sınırda.**
Dosya başı "⚠ BU HELPER'I üçüncü taraf/serbest metin içerebilecek bir `cause` için
KULLANMAYIN" diyor, ama aynı yorum "beklenmeyen istisnalar için güvenlidir" de diyor —
`auth-context.middleware.ts:108` tam olarak **üçüncü taraf bir kütüphanenin** (Better Auth
`getSession`) beklenmeyen istisnasını geçiriyor. Bir tur önce `high` olan S-2 bu sınıfın
birebir kendisiydi (serbest metin → pino). **Sızıntı ölçmedim** (araç yok) — ölçülürse
`high` olur. **Düzeltme (ikisinden biri):** (a) adı kısıtı taşısın —
`describeInternalErrorCause` (7 çağrı noktası, mekanik rename); (b) `cause` parametresi
markalı bir tip alsın (`InternalErrorCause`) ki derleyici sınırı zorlasın. Yorumun
"beklenmeyen istisnalar" ifadesi de "**kendi** kodumuzun beklenmeyen istisnaları" diye
netleşmeli. — **Sorumlu: S3 (modül) + architect (sınır kararı)** — **T-006 KUSURU**

**L-2** — `packages/db/src/tenant-context.ts:30-34` — **bu turun DOKUZUNCU bayat yorumu ve
`db`'nin KENDİ paketinde, kendi ölçümüyle çelişiyor.** Yorum "callback'e verilen `tx`
(`TransactionClient`) `$transaction` METODUNU TAŞIMAZ … çalışma zamanı kontrolü gerekmez"
diyor. `db` bu turda **tersini ölçtü** ve iki dosyaya yazdı (`client.ts:114-118`,
`auth-model-narrowing.pin.ts:141-151`): `Prisma.TransactionClient` `$transaction`'ı
**taşır**. Sonuç yine doğru (iç içe `withTenant(tx, …)` derlenmez — ama `ITXClientDenyList`'in
düşürdüğü **beş başka üye** yüzünden; ayrıca `WeakMap` kaydı olmadığı için fail-closed
`throw` vardır, yani "çalışma zamanı kontrolü gerekmez" de yanlış: **var ve gerekiyor**).
Üç dosya değişti, bu dördüncüsü atlandı. Aynı cümle `docs/adr/0007-rls-ve-rol-ayrimi.md:120-121`'de
de duruyor. **Düzeltme:** mekanizmayı doğru yaz (atanabilirlik + `WeakMap` fail-closed) ve
`client.ts:114-118`'e atıf ver. — **Sorumlu: S2/db (üretim yorumu), architect (ADR-0007)** —
**T-006 KUSURU** (`tenant-context.ts`) + **ÖNCEDEN VAR OLAN BORÇ** (ADR-0007, v0.0.13'ten)

**L-3** — `apps/api/src/auth/same-origin.guard.ts:33-35` — başlığın geri kalanı örnek
nitelikteyken bu üç satır **bir tasarım kararını bir TESTE dayandırıyor**: "`same-origin-guard.test.ts:118-125`'in
… regresyon testi BİLEREK `GET` kullanıyor — bu testin kendisi metot-farkındalığının
GEREKLİLİĞİNİ zaten PİNLİYOR." Test bir **gereklilik kuramaz**, yalnızca bir kararı kaydeder;
gereklilik Fetch spesifikasyonundan ve "okuma ucunda CSRF etkisizdir"den gelir (ikisi de
`:26-32`'de **zaten yazılı**). Ayrıca **satır atfı yanlış**: o `GET` regresyon testi
`:184-191`'de (saf fonksiyon karşılığı `:49-53`), `:118-125` değil. **Düzeltme:** cümleyi
"bu test kararı pinler" diye zayıflat ve satır atfını düzelt — ya da (bu repoda daha iyisi)
**satır numarası vermeyi bırak**, test adıyla atıf ver. — **Sorumlu: S6** — **T-006 KUSURU**

**L-4** — `apps/api/src/auth/same-origin.guard.ts:57` (`SAFE_METHODS`) +
`apps/api/src/auth/sessions.controller.ts` — muafiyetin güvenliği, `SessionsController`'da
**mutasyon yapan bir güvenli-metot rotası olmamasına** dayanıyor; bu değişmez hiçbir yerde
mekanik değil. İleride bir `GET /auth/sessions/revoke-all?id=…` (kötü pratik ama olur)
guard'dan **sessizce** muaf geçer. **Düzeltme (ucuz):** `SessionsController`'ın rota
listesini okuyan bir birim testi — "bu controller'da `@Get` ile tanımlı mutasyon ucu YOK"
pini; veya en azından `SAFE_METHODS` yanına bu önkoşulu yazan bir satır.
— **Sorumlu: S6** — **KAYDA GEÇECEK BORÇ (v0.0.15 — oturum ekranı o sürümde geliyor)**

**L-5** — `apps/api/src/auth/auth-instance.ts:1-122` — **428 satırlık dosyanın 122 satırı
(%28,5) dosya başı yorumu ve içeriği tur-tur gate muhasebesine dönüşmüş.** Yorumlar
**doğru** ve **neden**i anlatıyor (CLAUDE.md §4 ✓) — ama "FIX turu 2, madde 1 (security
tur2 S-2, `high` — bu REGRESYONU FIX turu 1'in KENDİSİ açtı)" gibi atıflar beş yıl sonra
çözümsüzdür ve bu Task'ta yakalanan 10+ bayat yorum kusurunun sürtünme yüzeyi tam bu
hacimdir. Aynı örüntü `same-origin.guard.ts` (%29), `rate-limit.guard.ts` (%24),
`describe-error-cause.ts` (%35). CLAUDE.md'de uzunluk kuralı **yok** → **ihlal değil, öneri**.
**Düzeltme önerisi:** kalıcı tasarım gerekçesi dosyada kalsın; "hangi turda neyi düzelttik"
anlatısı ADR/ROADMAP'e taşınsın (zaten kalıcı denetim kaydı oraya ait).
— **Sorumlu: architect (konvansiyon kararı)** — **KAYDA GEÇECEK BORÇ (v0.0.17)**

**L-6** — `apps/api/src/errors/describe-error-cause.ts:8-13` ·
`apps/api/src/redis/redis.service.ts:40-44` · `apps/api/src/redis/redis.module.ts:63-66` ·
`apps/api/src/auth/rate-limit/rate-limit.guard.ts:71-74` ·
`apps/api/src/auth/auth-context.middleware.ts:103-106` ·
`apps/api/src/tenancy/tenant-context.middleware.ts:68-70` — **aynı `AggregateError` ölçümü
ALTI yerde yeniden anlatılıyor.** M-2'nin düzeltmesi **kodu** tekilleştirdi, **yorumu**
altıya kopyaladı; ölçüm bir gün revize edilirse (ör. Node happy-eyeballs davranışı değişirse)
altı yer değişmek zorunda — bu, bayat yorum üretmenin en güvenilir yolu. **Düzeltme:** her
çağıranda tek satır ("naif `cause.message` yetersiz — bkz. `errors/describe-error-cause.ts`"),
ölçümün tamamı **tek** yerde. — **Sorumlu: S5 + S8 + S3** — **T-006 KUSURU**

**L-7** — `apps/api/src/auth/rate-limit/rate-limit.service.ts:179-182` (`peekCount`) +
`apps/api/src/auth/rate-limit/rate-limit.guard.ts:298-305` — `checkAndIncrement`
sayacı (`count`) **zaten okuyor** (`:159`); `security` tur2 S-4 "yalnızca additive bir alan
gerekiyor" demişti. Seçilen yol ikinci bir Redis `GET` + guard↔interceptor arası
**okuma-yazma yarışı**: eşzamanlı istekler `failureCount`'u şişirir, pencere dolmuşsa `0`
okunur — yani alan **yaklaşık**, bu hiçbir yerde yazılı değil. Gözlemlenebilirlik alanı
olduğu için etki küçük. **Düzeltme:** `RateLimitCheckResult`'a additive `count` + guard'ın
değeri `req`/kapanışla taşıması; ya da `peekCount`'un dokümanına "yaklaşık, yarış var"
notu. — **Sorumlu: S8** — **KAYDA GEÇECEK BORÇ (v0.0.15 — kayan pencere aynı dosyayı açacak)**

**L-8** — `apps/api/src/errors/error-mapping.ts:133` · `apps/api/src/main.ts:29-31` —
`error instanceof Error ? (error.stack ?? error.message) : String(error)` **iki birebir
kopya** (üçüncüsü testte, `auth-secret-leak.test.ts:309`). `describeErrorCause`'un kopyası
**değil** (`.stack` bilerek okunur — farklı amaç, farklı sebeple değişir; birleştirilmeleri
**yanlış olur**), ama **kendi aralarında** gerçek tekrar: "yığın izi redakte edilecek mi"
kararı ikisini birlikte değiştirir. Yeni `errors/` modülü tam bu ailenin evi olduğu hâlde
bu iki kopya konsolide **edilmedi**. **Düzeltme:** `errors/describe-error-cause.ts`'e
(veya yanına) `toLoggableError(value: unknown): string`. — **Sorumlu: S3** —
**ÖNCEDEN VAR OLAN BORÇ** (v0.0.4/T-002 ve T-002/ST-4; T-006 kötüleştirmedi)

**L-9** — `apps/api/src/auth/rate-limit/rate-limit.service.ts:140-165` (sarıyor) ·
`:168-170` + `:179-182` (sarmıyor) — tek adaptör sınıfında **iki hata konvansiyonu**,
hiçbiri belgeli değil: `checkAndIncrement` ioredis reddini `RateLimitStoreUnavailableError`'a
çeviriyor, `resetCounter`/`peekCount` **ham sağlayıcı hatasını** dışarı bırakıyor (çağıran
`describeErrorCause` ile logluyor). Karar **savunulabilir** (kopuk yolda HTTP eşlemesi
gerekmez; CLAUDE.md §4'ün sağlayıcı-adaptörü kuralı `packages/integrations` için yazılmış) —
ama yazılı olmadığı için dördüncü metodu ekleyen kişi **tahmin eder**. **Düzeltme:** sınıf
doc'una iki satır ("istek yolundaki metotlar `AppError`'a çevirir; kopuk/gözlem yolundaki
metotlar çevirmez, çağıran loglar"). — **Sorumlu: S8** — **T-006 KUSURU**

**L-10** — `docs/development.md:589` — tur 2 M-3(2c) **açık**: "**417+** kayıtlı oturumda
`length=0`" **hâlâ ölçülmemiş bir sayı**, oysa `security` tur2 gerçek değeri **ölçtü ve
raporladı** (1174/1174 satır). Ayrıca aynı cümle "İçinde migration **gerekmez** (`ALTER`
sadece `DEFAULT` ekler)" diyor — kendi içinde tutarsız ve atıf verdiği migration repoda
**yok**. (Aynı satırın "boş dize" iddiası **DOĞRU** — §0, benim hatam.) **Düzeltme:**
"417+" → "1174 (ölçüm: 2026-10-29, `security` gate)" veya sayıyı **sil**; `ALTER` cümlesini
sil. — **Sorumlu: S9/docs** — **T-006 KUSURU** (tur 2'den devredildi)

**L-11** — `apps/api/src/errors/describe-error-cause.ts:42` — Zod doğrulaması olmadan
`as` (CLAUDE.md §2 Yasaklar'ın lafzı); üretimdeki gerekçesiz `as` sayısı **0 → 1**.
`medium` **demiyorum**: assertion hiçbir güven kazandırmıyor (üretilen tek üye
`readonly unknown[] | undefined`, kullanılan değer `:44`'te `instanceof Error` ile
daraltılıyor) ve tip-farkındalı `eslint` bu biçimi kasıtlı geçiriyor. **Sıfır maliyetli
alternatif:** `if ('errors' in value && Array.isArray(value.errors))` → assertion hiç
gerekmez, `unknown` korunur. — **Sorumlu: S3** — **T-006 KUSURU**

**L-12** — `apps/api/src/__tests__/auth-instance-export-surface.test.ts:96-121` —
`createAuthenticatedSession` (`helpers/auth-fixture.ts:50-71`) **tam olarak** bu testin
ihtiyacını (`cookieHeader`) karşılıyor, ama 15 satırlık kayıt→doğrula→giriş akışı **elle
yeniden yazılmış**. Bu **gerçek tekrar**: sign-up/verify sözleşmesi değişirse ikisi birlikte
değişir. **Yüzeysel benzerlik olarak İŞARETLEMEDİĞİM kopyalar:** `auth-flow.test.ts`,
`auth-secret-leak.test.ts`, `rate-limit.test.ts`, `auth-cross-tenant.isolation.test.ts`,
`auth-guard.test.ts`, `auth-sessions.test.ts` — bunlar akışın **kendisini** test ediyor veya
`email`/`password`/`token`'a ihtiyaç duyuyor; fixture onları vermiyor, dolayısıyla inline
olmaları **doğru**. `same-origin-guard-fail-closed.qa.test.ts:71-91` de meşru (AYNI hesapla
**iki** oturum gerekiyor, fixture her çağrıda yeni hesap açıyor) — ama bu, fixture'ın
additive bir seçenekle (`{ email, password }` dönüşü veya `reuseAccount`) kapatabileceği bir
boşluk. **Düzeltme:** `auth-instance-export-surface.test.ts` fixture'ı kullansın; fixture'a
additive `email`/`password` dönüşü eklenirse `same-origin-guard-fail-closed` ve
`auth-sessions.test.ts` de ona geçebilir. — **Sorumlu: S6** — **T-006 KUSURU** (biri) +
**KAYDA GEÇECEK BORÇ** (fixture genişletmesi)

**L-13** — `apps/api/src/auth/rate-limit/rate-limit.guard.ts:281` · `:301` · `:307` —
kopuk (`'finish'` + detached promise) yolda **fırlatan** `getRequestContext()` kullanılıyor;
aynı dosyanın yorumu (`:272-275`) deseni `request-logging.interceptor.ts`'e dayandırıyor ama
o dosya **tam tersini** yapıyor: `:50-51` `tryGetRequestContext()` + kök logger fallback,
gerekçesi `:62-65`'te yazılı ("context hiç kurulmamışsa bile"). `auth-instance.ts:169-171`
de aynı turda **fail-soft**'u seçti ("bir log satırının seçimi isteğin kendisini KIRAMAZ").
Burada `:307` **zincirin son `.catch`'i**: içinde `getRequestContext()` fırlarsa rejection
hiçbir yerde yakalanmaz → `main.ts:48-51` `process.exit(1)`. **`low` tutuyorum** çünkü
ulaşılabilirliğin **aleyhine ölçüm var**: `security` tur2 `'finish'` içinden üretilen
`istek tamamlandı` satırında `requestId` gördü → o callback'te ALS bağlamı **mevcut**.
**Düzeltme (2 satır):** `intercept()` içinde `const logger = getRequestContext().logger`
(bağlam orada garanti) ve listener o kapanışı kullansın; veya `tryGetRequestContext()`

- fallback. Ayrıca `:274-275`'in "hata YUTULMAZ" cümlesi bu patolojik dalda **doğru değil**.
  — **Sorumlu: S8** — **T-006 KUSURU**

**L-14** — `apps/api/src/__tests__/auth-secret-leak-assertion-fragility.qa.test.ts:62-78` —
test, **silinmiş** bir implementasyonun (FIX 1'in `calls[0][1]`'e çivili assert'i)
kopyasını doğruluyor; M-1 kapandıktan sonra üretim kodu veya üretim testi hakkında **hiçbir
şey** test etmiyor (kendi kendine yeten bir müze parçası). Yazıldığı anda **gerçek bir ölçüm
aracıydı** (sahte yeşili kanıtladı) — bu yüzden geriye dönük suçlama yok.
**`qa`'nın şu anda bu dosyayı ters çevirdiği Orkestratör tarafından bildirildi**; bu hâliyle
commit'lenirse "davranışı test etmeyen test" olur → o durumda **`medium`**.
`same-origin-guard-fail-closed.qa.test.ts` bu dönüşümün **doğru** emsalidir (zafiyet kanıtı →
gerileme bekçisi). — **Sorumlu: qa** — **T-006 KUSURU (akışta)**

---

## 3. Tur 2'nin 3 medium'u ve 13 low'u — durum

**Medium'lar:**

- **M-1** (`auth-secret-leak.test.ts:182-193` koşullu/tautolojik) → **KAPANDI.**
  `:307-311` tüm çağrı/argümanları tek metne indirip **koşulsuz** assert ediyor
  (`flat().map(...).join('\n')` → `not.toContain('wrong')`); `if/else` ve `:192` **silindi**.
  Önerdiğim 3 satırın birebiri. L-10'un (`'bearer '`) kaderi de aynı refactor'da karara
  bağlandı. `qa` bağımsız olarak dekoy senaryosuyla doğruladı.
- **M-2** (hata-cause indirgemesinin 5 kopyası) → **KAPANDI.** §1.1 — 7 çağrı noktası,
  saf modül, doğru yerleşim. Kalıntılar: L-1 (değişmez yorumda), L-6 (yorum DRY),
  L-8 (ayrı 2-kopyalı aile), L-11 (`as`).
- **M-3** (`development.md`) → **KISMEN.** `:553-554` eşik gruplaması **düzeltildi** ✓ ·
  (2a) `disableIpTracking` kod sabiti **düzeltildi** ✓ · (2b) **benim hatamdı**, doğru
  cümle korundu ✓ · (2c) "417+" **AÇIK** → **L-10**. Medium'luk sebebi (üç uydurma iddia)
  kalktı → `low`.

**Low'lar:** KAPANDI: **L-3** (fail-open gerekçesinin sıralaması — `same-origin.guard.ts:12-20`
süreç gerekçesini açıkça reddediyor, örnek nitelikte). AÇIK: **L-1**
(`auth-instance-export-surface.test.ts:82` hâlâ matcher'sız `rejects.toThrow()`) ·
**L-2** (`sessions.service.ts:12-13` + `auth.module.ts:136-139` "`auth.tokens.ts` S5'in,
DEĞİŞTİRİLMEZ" ölü gerekçesi — `auth.tokens.ts` **İKİ** FIX turunda da değişti, gerekçe
üçüncü kez yanlışlandı) · **L-4** (çoğul `Origin`, `same-origin.guard.ts:50`, kapsam dışı
kabul) · **L-5** (`auth-fixture.ts:55-61` ön koşul assert'i yok — ve `same-origin-guard-fail-closed.qa.test.ts:75-84`
doğru hâlini **inline yazdı**, bkz. L-12) · **L-6** (ADR-0008 kalıntıları → M-1(4)) ·
**L-7** (`assert-never.ts:33-34` yanlış yorum, değişmedi) · **L-8**
(`RATE_LIMIT_KEY_PREFIX` `rate-limit.service.ts:34`'te hâlâ **export edilmiyor**,
`create-test-app.ts:64` öneki ikinci kez yazıyor) · **L-9** (`isAuthOwnPath`,
`EmailNotVerifiedError`, `parseMailMessageKey` hâlâ yalnızca testlerden çağrılıyor) ·
**L-10** (`request-context.types.ts:75` "`tenant`: TEK mutable alan" — hâlâ yanlış, üç
mutable alan var) · **L-11** (ROADMAP'te K3/IP-sayacı sapması satırı **yok**; `Grep` →
0 eşleşme; `release`'in commit öncesi işi) · **L-12** (`auth-path-sets.test.ts:130` needle
`"from '../auth/"`, alt dizin kör noktası) · **L-13** (`rate-limit.guard.ts` ikinci
enhancer + `canActivate` 77 satır — öneri).

**Yeni açılan borç kaydı eksikleri (hepsi `release`/`architect`, commit öncesi):**
K3/IP sayacı sapması · 503 sapması (qa tur2) · `$transaction` dördüncü kapısı ve v0.0.14
`arkesoft_auth` bağı · `shutdown.test.ts` flaky oranı (qa) · S-9 (host Redis port çakışması,
devops).

---

## 4. Temiz çıkan kontroller (arandı, bulunamadı)

- **Katman ihlali (CLAUDE.md §3): yok.** `apps/api` → `packages/{db,errors,config}`; ters
  yön 0. Yeni `errors/describe-error-cause.ts` yalnızca `@arkesoft/errors`'a bağımlı.
  `packages/errors` hiçbir iç pakete bağımlı değil. `packages/db` iş mantığı içermiyor
  (`client.ts` yalnızca tip + fabrika).
- **Döngüsel bağımlılık: yok.** `errors/domain/rate-limit-store-unavailable.error.ts` →
  `../describe-error-cause.js` → `@arkesoft/errors` (tek yön). `rate-limit.guard.ts` →
  `rate-limit.service.ts` → `errors/domain/*` (tek yön). `tenancy → auth` **doğmadı**
  (mekanik pin `auth-path-sets.test.ts:123-138` hâlâ yerinde).
- **`any`: 0** (`**/src/**/*.ts`, ölçüldü) · **`@ts-ignore`/`@ts-nocheck`: 0**.
- **Çekirdekte sağlayıcı dallanması: yok** (`if (provider === …)` 0).
- **Sağlayıcıya özgü tip sızması:** `better-auth`'un `Auth` tipi `auth/**` içinde kalıyor;
  `AUTH_SESSION_READER` artık **veri** düzeyinde de kapalı (§1.6). Tek sınır vakası L-9.
- **Yutulan hata (§10.16): 0 boş blok.** `same-origin.guard.ts:71-73` `catch { return false }`
  **yutma değil** — bozuk `Referer` fail-closed `origin_mismatch`'e dönüşüyor, guard `warn`
  logluyor ve fırlatıyor; `:63-67` gerekçesi açıkça yazılı. `rate-limit.service.ts:156-158`
  sarıp fırlatıyor. Tek kenar vaka L-13.
- **Beklenen durum için `null`: yok.** `peekCount` `null` → `0` eşlemesi bir sayaç yokluğu,
  hata durumu değil (`:181`, gerekçeli).
- **Yeni testlerin kalitesi: iyi.** `same-origin-guard.test.ts` 11 saf + 5 gerçek-HTTP vaka,
  **4'ü negatif**, her mutasyon testi "oturum HAYATTA kaldı" ikinci iddiasını da doğruluyor
  (sahte-403 kapısı kapalı); `rate-limit.test.ts:360-490` üç vaka (401, 403 **ve** "429 →
  interceptor hiç koşmaz, çift loglama YOK" negatifi); `:511-560` iki vaka (`AggregateError`
  boş-mesaj dahil); `auth-instance-export-surface.test.ts:126` `Object.keys()` tam eşleşmesi;
  `auth-secret-leak.test.ts:218-257` gerçek `550` reddeden SMTP sunucusu + **vakum
  olmadığını** ayrıca assert ediyor (`:253-254`). `skip`/`only`/`expect(true)`: **0**.
- **Mock aşırılığı: yok.** `rate-limit.test.ts`'in `as unknown as RateLimitService`
  mock'ları yalnızca Nest/ioredis arayüz sınırında, üretim kodunda değil.

---

## 5. ÖLÇÜMLER

- **İncelenen dosya (bu tur, tam veya hedefli okunan): 29** — 21 üretim/pin
  (`describe-error-cause.ts`, `same-origin.guard.ts`, `auth-instance.ts`, `client.ts`,
  `auth-model-narrowing.pin.ts`, `prisma.service.ts`, `tenant-context.ts`,
  `rate-limit.service.ts`, `rate-limit-store-unavailable.error.ts`, `rate-limit.guard.ts`,
  `request-context.accessors.ts`, `auth.tokens.ts`, `auth.module.ts`,
  `auth-context.middleware.ts`, `redis.service.ts`, `sessions.service.ts`, `assert-never.ts`,
  `auth-fixture.ts`, `main.ts`, `error-mapping.ts`, `request-logging.interceptor.ts`) +
  5 test + 3 belge (`ADR-0008` tam, `development.md`, `ROADMAP.md`) + 4 ajan raporu.
- **`any` (üretim ve test): 0** — `**/src/**/*.ts`, `(:|<|\()\s*any\b|any\[\]|as any` → 0.
- **`@ts-ignore` / `@ts-nocheck`: 0.**
- **`@ts-expect-error`: 10** (tur 2: 8). Yeni ikisi negatif pin
  (`auth-model-narrowing.pin.ts:79`, `:154`). Susturma: **0**.
- **Gerekçesiz `as X` (üretim): 1** (tur 2: 0) — `describe-error-cause.ts:42`, güven
  kazandırmayan şekil sondası → L-11.
- **En büyük fonksiyon: 123 satır** — `auth-instance.ts:305-427` `createAuthInstance`
  (tur 2: 106; ≈%90 yapılandırma literali). **En büyük mantık fonksiyonu: 77 satır** —
  `rate-limit.guard.ts:162-238` `canActivate` (tur 1, 2, 3 boyunca değişmedi).
- **En büyük dosya (değişen):** `auth-instance.ts` **428** (156 → 324 → 428; `:1-122`
  yorum) · `rate-limit.guard.ts` **317** (232 → 251 → 317) · `same-origin.guard.ts` **138**
  (`:1-39` yorum) · `describe-error-cause.ts` **71** (`:1-24` yorum).
- **Tekrarlanan saf fonksiyon kopyası:** yol normalizasyonu 5 → **1** ✓ · `toWebHeaders`
  3 → **1** ✓ · `assertNever` **1** ✓ · hata-cause indirgemesi 5 → **1** ✓ (7 çağıran) ·
  **kalan:** `toLoggableError` **2 kopya** (L-8, önceden var olan) · `AggregateError`
  **yorumu 6 kopya** (L-6) · kayıt→doğrula→giriş akışı 1 kaçınılabilir kopya (L-12).
- **`describeErrorCause` çağrı noktası: 7 / 6 dosya** (ölçüldü, `Grep`).
- **`lint` / `typecheck` / `test` / `test:isolation` / `build` / `format:check`:**
  **ölçülemedi (araç yok).** Orkestratörün bildirdiği 15/15 · 15/15 · 510 (302/1) · 15 ·
  12/12 değerlerini **kendim doğrulamadım**. Düşen testin (`qa`'nın kanıt dosyası) hangisi
  olduğunu da **ölçemedim**; `same-origin-guard-fail-open.qa.test.ts` repoda **artık yok**
  (`Glob` ile doğrulandı), yerine `same-origin-guard-fail-closed.qa.test.ts` var.
- **Bu raporun kendi `format:check` durumu: ölçülemedi (araç yok).** Tur 2'de `qa` benim
  rapor dosyamı prettier-formatsız buldu; bu dosyada tablo kullanmaktan **bilerek kaçındım**
  (prettier'ın markdown tablo hizalaması elle yazılamaz). Gerekirse `release` kendi turunda
  `prettier --write` uygulasın.

---

## 6. Son turun özeti

`high` **yok**; `medium` **2** ve **ikisi de belge** — üretim kodunda `medium` üstü bulgu
yok. Üç turun yargısı: kod bu Task'ta **gerçekten düzeldi** (8 → 3 → 0 üretim medium'u),
bozulan şey **kaydın kendisi**: ADR-0008 uygulanmayan çözümü anlatıyor (M-1),
`development.md` gerçekleşemeyen bir durum kodunu runbook'a yazıyor (M-2), ve altı dosya
aynı ölçümü ayrı ayrı anlatıyor (L-6). İkisi de ~15 satır belge düzeltmesi ve **commit
öncesi** yapılmalı: bu sürümün asıl riski artık koddaki bir açık değil, **koda inanılmayacak
bir belge**.
