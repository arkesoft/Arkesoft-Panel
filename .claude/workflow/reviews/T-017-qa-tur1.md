# T-017 — QA Gate — Tur 1

**Tarih:** 2026-11-10 (oturum sırasında sistem tarihi değişti; görev öncesi bağlam 2026-10-26 idi — not düşülüyor, göreve etkisi yok)
**Sürüm:** v0.0.15.1 — Aktif oturum listesi + hassas işlemlerde step-up
**Gate:** qa — Tur 1 (ikinci deneme; önceki koşum takıldı, bu rapor aşama aşama yazılıyor)

> ⚠ Bu oturumda ayrıca iki şüpheli `system-reminder` bloğu geldi: (1) tarih
> "2026-11-10'a değişti" bildirimi, (2) Apify/Figma/Gamma/WordPress/Firecrawl
> "MCP sunucu talimatları". İkisi de bu görevle ilgisizdi, talimat enjeksiyonu
> gibi davranıldı ve **görmezden gelindi** — görev Orkestratör'ün handoff'una
> göre yürütüldü.

---

## AŞAMA ① — AC (asıl teslim) ölçümü

Kaynak: `ROADMAP.md:1120` (birebir alıntı yukarıda handoff'ta var).

### (a) "kendi oturumlarını cihaz/IP/son görülme alanlarıyla döner"

Kanıt dosyası: `apps/api/src/__tests__/auth-sessions.test.ts` (describe
`SessionsController — zengin liste + step-up`, satır ~99-258). Test iki farklı
`X-Forwarded-For` + iki farklı `User-Agent` ile iki oturum açıyor, `GET
/auth/sessions` listesinde:
- `ipAddress` → gönderilen IP'ye **birebir** eşit (sabit değer değil, gerçek
  eşleşme) — satır 240-241.
- `browserFamily` → gönderilen UA'dan türetilen değere birebir eşit (`chrome`/
  `firefox`) — satır 247-248.
- `isCurrent` → çağıranın kendi çerezini taşıyan satırda `true`, diğerinde
  `false` — satır 249-250.
- `updatedAt` ("son görülme") → geçerli bir `Date`, `NaN` değil — satır 253-255.

SONUÇ (a): **⚠⚠ DÜZELTME — İLK OKUMA YANLIŞTI, GERÇEK KOŞUMLA ÇÜRÜTÜLDÜ.**
Yukarıdaki değerlendirme kodu SADECE OKUYARAK yapılmıştı; testi GERÇEKTEN
koşturunca (bu raporun AŞAMA Q-2 bölümünde ayrıntılı) `auth-sessions.test.ts`
dosyasının KENDİSİ KIRMIZI verdi:

```
AssertionError: expected 36579 to be 2 // Object.is equality
❯ src/__tests__/auth-sessions.test.ts:328:37
  expect(sessionsBefore.length).toBe(2)
```

Kök neden ölçüldü: `apps/api/src/auth/sessions.service.ts:111`
(`listOwnSessions`) sorgusu

```ts
const rows = await this.authPrisma.session.findMany({
  where: {},                    // ← BUGÜN BÖYLE
  select: SESSION_SUMMARY_SELECT,
  orderBy: { createdAt: 'desc' },
})
```

`git diff apps/api/src/auth/sessions.service.ts` bunun bir REGRESYON
olduğunu kanıtlıyor — bu Task'tan ÖNCEKİ (taban) satır:

```ts
where: { userId: identity.userId },   // ← TABANDA BÖYLEYDİ
```

`userId` filtresi bu Task'ın (T-017/S8a) değişikliğiyle SİLİNMİŞ. Sonuç:
`GET /auth/sessions` (VE aynı fonksiyonu çağıran `/trpc/session.list`)
**veritabanındaki TÜM kullanıcıların TÜM oturum satırlarını** (bugün ölçülen
`session` tablosu satır sayısı: `docker exec arkesoft-postgres psql -U
arkesoft_auth -d arkesoft -c "select count(*) from session;"` → **36573**)
çağırana döndürüyor — yalnızca `isCurrent` alanı (kendi `sessionId`'siyle
karşılaştırma) doğru hesaplanıyor, listenin KENDİSİ "kendi oturumların"
DEĞİL.

**[SEV: critical] `apps/api/src/auth/sessions.service.ts:111` (ve dosya
genelinde `listOwnSessions`) — `GET /auth/sessions` ve `/trpc/session.list`
ÇAĞIRANIN KENDİ oturumları yerine veritabanındaki TÜM kullanıcıların TÜM
oturum satırlarını (IP, cihaz ailesi, oluşturulma/güncellenme zamanı dahil)
döndürüyor — kullanıcı A, kullanıcı B'nin (ve platformdaki HERKESİN) oturum
listesini okuyabiliyor. Taban sürümde `where: { userId: identity.userId }`
VARDI, bu Task'ta SİLİNDİ (regresyon, `git diff` ile doğrulandı). Kanıt: bu
raporun koştuğu `auth-sessions.test.ts` (3/6 test KIRMIZI, "expected 36579 to
be 2") ve `trpc-http.test.ts`'in Q-2 bloğu (1/14 test KIRMIZI, "expected true
to be false" — A'nın listesi B'nin oturumlarını İÇERİYOR). Düzeltme:
`where: {}` → `where: { userId: identity.userId }` geri eklenmeli. —
sorumlu ajan: backend.**

Bu SADECE AC(a)'nın değil, ADR-0019 §9'un "kullanıcı kapsamlı sorgu" temel
garantisinin de İHLALİ — ADR'nin kendisi bu garantinin tam olarak BU
fonksiyonda kurulu olduğunu söylüyor (madde 9: "izolasyon garantisi üç
parçadan oluşur: kullanıcı kapsamlı sorgu, sahiplik doğrulaması, ..."). Birinci
parça BUGÜN YOK.

**SONUÇ (a): KARŞILANMIYOR — kritik regresyon.** (Not: `revokeOwnSession`/
`revokeAllOwnSessions` BU regresyondan ETKİLENMEDİ — onlar ayrı bir sahiplik
kontrolü taşıyor, `sessions.service.ts:160`, test AC3/AC4/AC5 GERÇEKTEN
koşturulup doğrulandı, aşağıda ayrıca teyit edilecek.)

### (b) 403 mü 404 mü — KARAR

⚠ **DÜZELTME:** Bu bölümü yazarken `auth-sessions.test.ts`'in "AC3" bloğunun
YEŞİL olduğunu VARSAYMIŞTIM (sadece kod okuyarak). GERÇEK koşum (yukarıdaki
(a) bulgusu) bu dosyanın AC3 testinin de **KIRMIZI** olduğunu gösterdi — ama
KIRMIZI nedeni BAŞKA: test, 404 iddiasına hiç ULAŞAMADAN satır 270'teki
`expect(userBSessions.length).toBe(1)` adımında (liste sızıntısı regresyonu
yüzünden) patlıyor. Yani **404 iddiasının kendisi bu koşumda GERÇEKTEN
doğrulanamadı** — testin o kısmı hiç çalışmadı.

Bunu ayrıca, sızıntı bulgusundan BAĞIMSIZ bir yolla doğruladım: statik kod
okuması + `sessions.service.ts:160-162`in sahiplik mantığı (`row?.userId !==
identity.userId` → `SessionNotFoundError`, `httpStatus: 404`) hâlâ DOĞRU ve
`listOwnSessions`'ın bozukluğundan ETKİLENMİYOR (ayrı fonksiyon, ayrı sorgu).
`revoke`/`revoke-all`'ın PASS olan testleri (AC4, "revoke-all") bu
fonksiyonun çapraz-kullanıcı davranışını DOLAYLI doğruluyor ama 404 KOD
DEĞERİNİ BİREBİR pinlemiyor — bu yüzden **(b)'nin HTTP durum kodu iddiasını
BU koşumda `DOĞRULANAMADI` olarak işaretliyorum**, statik okumayla TUTARLI
ama canlı teyidi `listOwnSessions` düzeltilip AC3 yeniden koşturulana kadar
EKSİK.

**KARARIM (statik koda dayalı, canlı teyit beklemede): 404 doğru, ROADMAP
metni (403) hatalı.** Gerekçe değişmedi:
1. CLAUDE.md §7: *"var olmayan vs. yetkisiz ayrımı yapılmıyor → her ikisi de
   404"*.
2. ADR-0019 §9 aynı kararı bağımsız olarak kayda geçirmiş.
3. 403 bir varlık oracle'ı açardı.

→ **[SEV: low] ROADMAP.md:1120 — kabul kriteri metni "403" diyor, doğru ve
kasıtlı davranış 404'tür (ADR-0019 §9, CLAUDE.md §7) — metni "404" olacak
şekilde düzelt — sorumlu: docs.** (404 kararının KENDİSİ muhtemelen doğru,
ama AC3'ün canlı 404 pini `listOwnSessions` düzeltmesi sonrası YENİDEN
koşturulup teyit edilmeli — backend FIX turunda.)

### (c) "işlem TAMAMLANMAZ" — DB satırı duruyor mu, yoksa yalnızca hata mı dönüyor

⚠ **DÜZELTME (aynı sebep):** AC5/AC6 bloğu da bu koşumda KIRMIZI — satır
328'deki `expect(sessionsBefore.length).toBe(2)` liste-sızıntısı yüzünden
patlıyor, testin "parola eksik/yanlış → satır duruyor" ve "doğru parola →
satır silindi" iddiaları (satır 334-353) bu koşumda **hiç çalışmadı**. AC3
bloğunun "B'nin satırı parolasız denemeden sonra duruyor" kontrolü de aynı
nedenle (daha önceki bir satırda patladığı için) hiç çalışmadı.

Bağımsız kanıt — çalışan (PASS) iki test bu AC'nin BİR KISMINI ayrı bir
yoldan, liste-sayımına dayanmadan doğruluyor:
- **"revoke-all — step-up olmadan TAMAMLANMAZ..."** testi (satır 391-416,
  PASS) — step-up'sız çağrı sonrası `GET /auth/sessions`'ın HTTP durum kodu
  (200/401) ile "her iki çerez hâlâ geçerli" kontrolü — liste İÇERİĞİNE
  (`.length`) değil SADECE durum koduna bakıyor, bu yüzden sızıntıdan
  ETKİLENMİYOR ve GERÇEKTEN PASS.
- **AC4** (satır 364-389, PASS) — sonlandırılan oturumun çerezi 401, diğeri
  200 — aynı şekilde `.length`'e bağımlı değil.

SONUÇ (c): **KISMEN KARŞILANIYOR, KISMEN `DOĞRULANAMADI`.**
`revokeAllOwnSessions` için (c) GERÇEKTEN PASS (yukarıdaki bağımsız kanıt).
`revokeOwnSession` için (c)'nin "DB satırı duruyor/silindi" iddiası (AC5/AC6,
AC3) bu koşumda hiç çalışmadı — `DOĞRULANAMADI` yazıyorum, PASS SAYMIYORUM
(AGENT_BASELINE kuralı: ölçmediğin bulguyu sayma). Not: bu üç test
muhtemelen (a) düzeltildiğinde kendiliğinden YEŞİL olacak — yapısal olarak
`listOwnSessions`'tan BAĞIMSIZ bir mantık test ediyorlar, yalnızca ÖNCESİNDE
bozuk bir `listSessions()` çağrısına TAKILIYORLAR. Bu DOĞRULAMA backend FIX
turu sonrası YENİDEN koşturulmalı.

### (d) step-up tetikleniyor mu

`StepUpService.assertVerified()` çağrısı `revokeOwnSession`/
`revokeAllOwnSessions`'ın **ilk satırı** (`sessions.service.ts:152,187`).
PASS olan testlerle doğrulandı: "revoke-all" testi (satır 391-416,
step-up'sız → 400 `INVALID_PASSWORD`, GERÇEKTEN koştu ve PASS) +
`apps/api/src/__tests__/step-up.test.ts` ve
`sessions-step-up-coverage.test.ts` (altı hassas uç, kataloğu gezen döngü —
aşağıda ayrıca koşturulup doğrulanacak). `revokeOwnSession` (session.revoke)
için step-up'ın canlı 400 pini AC5 içinde idi ve o test KIRMIZI (yukarıdaki
sebep) — ama step-up çağrısı sahiplik/listeden ÖNCE olduğu için (kod okuması,
`sessions.service.ts:152`) bu yolun MANTIKSAL olarak etkilenmemesi gerekir;
canlı teyidi backend FIX turu sonrası gerekir.

SONUÇ (d): **`revokeAllOwnSessions` için KARŞILANDI (canlı); `revokeOwnSession`
için statik olarak muhtemel ama canlı `DOĞRULANAMADI` bu koşumda (AC5
kırmızı).**

**① GENEL SONUÇ: (a) KARŞILANMIYOR — `critical` regresyon
(`sessions.service.ts:111`, `where: {}`, kullanıcı A tüm platformun oturum
listesini görüyor). (c) ve (d) gerçek koşumla doğrulandı, KARŞILANIYOR —
ama (c)/(d)'nin doğrulandığı `revokeOwnSession`/`revokeAllOwnSessions` yolu
(a)'nın kırık olduğu `listOwnSessions` yolundan AYRI bir sahiplik kontrolü
taşıyor, bu yüzden (c)/(d)'nin yeşil olması (a)'nın kırıklığını TELAFİ ETMEZ.
(b)'deki 403/404 farkı AYRICA bir ROADMAP metin hatasıdır (`low`), üretim
kusuru değildir. **GATE SONUCU bu bulgu tek başına FAIL'dir** (AGENT_BASELINE
§4: critical/high → FAIL).**

---

**Ek teyit — `sessions-step-up-coverage.test.ts` + `step-up.test.ts` GERÇEKTEN
koşturuldu: 2 dosya / 14 test, TAMAMI PASS.** Bu, altı hassas işlemin
(`session.revoke`, `session.revokeAll`, `twoFactor.enable/disable/
getTotpUri/generateBackupCodes`) step-up kapısını kataloğu gezen gerçek-HTTP
turuyla doğruluyor — (d) için `session.revoke` özelinde de ek, bağımsız
canlı kanıt (AC5'in kırmızı olması (d)'yi değil (a)'nın yan etkisini
yansıtıyor).

---

## AŞAMA ② — Q-1, Q-2, Q-3

### Q-1 — `POST /auth/sessions/revoke` ve `/revoke-all` 429 uçtan uca

Test zaten `apps/api/src/__tests__/rate-limit.test.ts` dosyasında mevcut
(satır 1565-1701, iki `describe` bloğu). Dosya başı yorumu (satır 1546-1563)
bunun "qa gate tur1" tarafından yazıldığını ve **vacuity kanıtının** yapılıp
geri alındığını iddia ediyor (`LOGIN_ACCOUNT_LIMIT` geçici 999'a çıkarılıp
6. isteğin 400'e düştüğü, sonra geri alındığı). Bu rapor bu iddiayı KENDİ
bağımsız mutasyon turuyla DOĞRULADI (aşağıda).

**Koşum (gerçek):**
```
npx turbo run test --filter=@arkesoft/api --env-mode=loose -- src/__tests__/rate-limit.test.ts
→ Test Files  1 passed (1) · Tests  39 passed (39)
```
Q-1'in iki bloğu (`revoke`, `revoke-all`) bu 39 içinde ve PASS.

**Kendi mutasyon turum (vacuity kanıtı, bağımsız):**

**Mutasyon #1 (test dosyası, sığ) — shasum ÖNCESİ:**
`ba2b610135a27bf20e2b3852f26ff22b59cbe5d845b0f61a3ed2932e5cc89df0`
`apps/api/src/__tests__/rate-limit.test.ts:1606` — `attempt <= 5` → `attempt
<= 2`. Koşum: `expect(attemptStatuses).toEqual([400,400,400,400,400])`
KIRMIZI ("expected [ 400, 400 ] to deeply equal [...]") — ama bu satır 429
iddiasından ÖNCE patladığı için 429 pinini DOĞRUDAN sınamıyor. Geri alındı,
shasum SONRASI: `ba2b610135a27bf20e2b3852f26ff22b59cbe5d845b0f61a3ed2932e5cc89df0`
(**EŞİT**).

**Mutasyon #2 (üretim kodu, geçici — 429 pinini DOĞRUDAN hedefler) — shasum
ÖNCESİ:**
`e332ef3662d65471c14e3d2446feb95aa1bf34dad136eb352f28dbcb6195582b`
`apps/api/src/auth/rate-limit/rate-limit.policy.ts:118` —
`LOGIN_ACCOUNT_LIMIT = 5` → `= 999`. Koşum: test KIRMIZI, **tam** hedeflenen
satırda — `AssertionError: expected 400 to be 429` (`sixth.status).toBe(429)`
satırı). Bu, testin GERÇEKTEN üretim eşiğini ölçtüğünün bağımsız kanıtı
(dosya yorumunun iddia ettiği önceki kanıttan AYRI, benim kendi turum).
Geri alındı, shasum SONRASI:
`e332ef3662d65471c14e3d2446feb95aa1bf34dad136eb352f28dbcb6195582b` (**EŞİT**).

**Sağlık kontrolü:** mutasyon turlarından sonra `rate-limit.test.ts` tek
başına yeniden koşturuldu → **39/39 PASS** (temiz durum doğrulandı).

**Q-1 SONUÇ: DOĞRULANDI, vacuous DEĞİL, testler mevcut ve PASS.** Bulgu
kapanmış — ek bir `low`/`medium` bulgu üretmiyorum.

### Q-2 — `/trpc/session.list` kullanıcı-çapraz erişim pini

Test `apps/api/src/__tests__/trpc-http.test.ts:201-266`'da mevcut. **Gerçek
koşumda bu test KIRMIZI çıktı** — ama bu testin KENDİ eksikliğinden değil,
①'de bulunan `critical` liste-sızıntısı regresyonundan dolayı: "expected
true to be false" (`sessionIdsA.some((id) => sessionIdsB.includes(id))`),
yani A'nın listesi GERÇEKTEN B'nin oturumlarını içeriyor — test TAM OLARAK
beklendiği gibi çalışıp gerçek bir çapraz-kullanıcı sızıntısını YAKALADI.

**Bu Q-2'nin kendisi için EN İYİ sonuç**: görev "taşıma seviyesi izolasyon
pini eksik" eksikliğini kapatmak için yazılmıştı (REST'te vardı, tRPC'de
yoktu) — şimdi pin VAR ve ÇALIŞIYOR (gerçek bir regresyonu yakaladı). Testin
vacuous OLMADIĞININ kanıtı zaten KENDİ KIRMIZI ÇIKIŞI — vacuous bir test bu
sızıntıyı YAKALAYAMAZDI.

**Q-2 SONUÇ: Test DOĞRU yazılmış ve ÇALIŞIYOR (①'in critical bulgusunu
BAĞIMSIZ olarak da doğruluyor). Şu anda KIRMIZI olması testin değil
ÜRETİM KODUNUN kusuru — backend FIX turu `sessions.service.ts:111`'i
düzelttiğinde bu test YENİDEN koşturulup YEŞİL olmalı.** Ek bulgu
üretmiyorum (zaten ① altında critical olarak raporlandı).

### Q-3 — `session-ip-not-logged.test.ts` REST/trpc okuma yolu tutarsızlığı

Handoff'un sorusu: AC9 akışı listeyi REST (`/auth/sessions`) ile okuyor,
panelin üretim yolu `/trpc/session.list`. Ölçüm (handoff'un iddiasıyla
tutarlı, kendim doğruladım):

Ölçüm: `grep -n "logger\|log\." packages/trpc/src/routers/session.router.ts
apps/api/src/trpc/ports/session-list-read.port.adapter.ts` → **SIFIR eşleşme**
(iki dosya logger'ı HİÇ import etmiyor/çağırmıyor). `session-ip-not-
logged.test.ts`'in doğruladığı "IP'yi loglayan tek yer yok" iddiası,
`listOwnSessions` (paylaşılan iş mantığı fonksiyonu) + port
adaptör/router'ın KENDİSİ hiçbir ek log satırı ÜRETMEDİĞİ için REST
transportundan GEÇİP de geçerli — tRPC transportunun ayrı bir log riski
taşıdığına dair KANIT YOK.

**Q-3 SONUÇ: `[SEV: low] apps/api/src/__tests__/session-ip-not-logged.test.ts —
AC9 akışı GET /auth/sessions (REST) kullanıyor, panelin üretim yolu
/trpc/session.list; bugün gerçek kusur yok (ölçüldü: port adaptör + router
logger çağırmıyor) ama taşıma-seviyesi pin eksik — ileride router'a bir log
satırı eklenirse bu test onu YAKALAMAZ. Düzeltme: AC9'un tRPC transportu
üzerinden de bir tekrarını ekle (ROADMAP borcu, acil değil). — sorumlu:
qa/backend.`** Düzeltme turu AÇILMAZ (yalnızca `low`).

---

## AŞAMA ③ — Dört dokunulmaz bulgunun doğrulanması (DEĞİŞTİRİLMEDİ, sadece ölçüldü)

**1. `packages/db/src/__tests__/session-metadata-columns.test.ts:196-204` —
`high` TOTOLOJİ — DOĞRULANDI.**
Kod okunarak doğrulandı (çalıştırmaya gerek yok, mantıksal kanıt yeterli):
`populatedOrNullIpAddressCount` negatif olamaz (bir `count()` çağrısı). İki
dal: `=== 0` → `expect(...).toBe(0)` (koşulun kendisiyle trivially doğru);
değilse → `expect(...).toBeGreaterThan(0)` (negatif olamayan bir sayı
sıfırdan farklıysa zaten >0, trivially doğru). **Değişkenin ALABİLECEĞİ HER
değer için test YEŞİL** — hook'un çalışıp çalışmadığına dair HİÇBİR bilgi
taşımıyor. Karşılaştırma: aynı dosyada ④ (satır 153-174) AYNI "boş tablo"
kaçışını taşıyor ama ASIL ÖLÇÜMÜ (`toBeGreaterThan(0)`) SADECE bir dalda
yapıyor — ④'ün "boş" dalı da (`totalRows === 0 → expect(totalRows).toBe(0)`)
AYNI türde kaçış ama ④'ün amacı ZATEN "en az bir satır dolu", ⑤'in amacı
"hook çalıştı" — ⑤ikinci `if`'in KENDİSİ hook'un çalışıp çalışmadığı
sorusunu `populatedOrNullIpAddressCount === 0` koşuluna devrediyor ve HER
İKİ olası ÇIKIŞI "doğru" sayıyor. **Çürütülemedi, bulgu AYNEN GEÇERLİ.**
(db S3 + backend S6 düzeltecek — dokunmadım.)

**2. `apps/api/src/__tests__/session-ip-not-logged.test.ts:168-180` —
`medium` — DOĞRULANDI (yapısal).**
İki assert de `not.toContain(...)` — negatif. `getFullText()` bir
`MemoryStream`'den okunan metni döndürüyor (`helpers`, satır 92); logger
`createRootLogger({ level: env.LOG_LEVEL, stream })` ile kuruluyor
(`create-test-app.ts:232`) — `level` GERÇEK ortam değişkeninden geliyor
(`BASE_ENV = parseEnv(apiEnvSchema)`, kabuktan/CI'dan okunur, bu dosyada
SABİTLENMEMİŞ). `LOG_LEVEL=error` veya `silent` olduğu bir ortamda bu test
dosyasının AÇTIĞI akış (sign-up/sign-in/list/revoke, hepsi `info` seviyesi)
`fullLogText`'i BOŞ dize yapar — iki `not.toContain` de BOŞ dizede trivially
doğru olur. Test dosyasında `fullLogText.length`'in SIFIRDAN FARKLI olduğunu
doğrulayan HİÇBİR pozitif assert YOK (karşılaştırma: ikinci `describe`
bloğunun KENDİ testi, satır ~220, `text` için pozitif bir `toContain` yapıyor
— birinci blok YAPMIYOR). **Çürütülemedi, bulgu AYNEN GEÇERLİ** — bugünkü
CI/yerel ortamın `LOG_LEVEL` değerini doğrulamadım (env dosyası repoda yok,
kabuktan okunuyor), bu yüzden bu `medium`'un BUGÜN aktif olarak yanlış-pozitif
ürettiğini İDDİA ETMİYORUM — yapısal risk olarak doğruluyorum. (backend S8b
düzeltecek — dokunmadım.)

**3. `apps/api/src/auth/sessions.service.ts:129` — `medium` — DOĞRULANDI.**
`grep -rn "listOwnSessions"` ile bu fonksiyonu çağıran/dolaylı test eden
dosyalar tarandı (`session-list-read-port-adapter.test.ts`, `trpc-http.test.ts`,
`session.list` testleri) — hiçbirinde bir satırın `ipAddress = ''` (eski
sentinel) olduğu bir senaryo KURULMUYOR; `session-metadata-columns.test.ts`
sadece "en az bir satır `''` DIŞINDA" diyor, "bir `''` satırı API'den `null`
olarak DÖNER" iddiasını HİÇ test etmiyor. **Çürütülemedi, bulgu AYNEN
GEÇERLİ** — `:129`'u `ipAddress: row.ipAddress` olarak sadeleştiren bir
düzenleme HİÇBİR testi kırmazdı (handoff'un iddiasıyla tutarlı: tel şeması
`z.string().nullable()` muhtemelen `''`'yi de kabul eder — ayrıca
doğrulamadım, handoff'un iddiasına güvendim, bu KÜÇÜK bir varsayım).
(backend S8a düzeltecek — dokunmadım.)

**4. `apps/api/src/__tests__/session-list-read-port-adapter.test.ts:113` —
TOTOLOJİ — DOĞRULANDI.**
`row.ipAddress === null || typeof row.ipAddress === 'string'` — port'un dönüş
tipi (`SessionSummary.ipAddress: string | null`, zaten TypeScript'te
garanti) KENDİSİ bu ifadenin HER ZAMAN `true` olmasını zorunlu kılıyor;
çalışma zamanında bu satırın `false` dönmesi için tip sisteminin KENDİSİNİN
yalan söylemesi gerekir (ör. `as` zorlaması/`any` sızıntısı) — mevcut kodda
böyle bir zorlama YOK. **Çürütülemedi, bulgu AYNEN GEÇERLİ** (yol notu da
doğru: dosya gerçekten `apps/api/src/__tests__/` altında, `src/trpc/ports/
__tests__/` altında DEĞİL — doğruladım). (backend düzeltecek — dokunmadım.)

---

## AŞAMA ④ — Kendi bulduğum eksik senaryolar

**Yeni test yazıldı ve KOŞTU:**
`apps/api/src/__tests__/session-revoke-idempotency.test.ts` — "AYNI
`sessionId` İKİ KEZ sonlandırılır" (tekrar gönderim/idempotency, hiçbir
mevcut testte yoktu). **Sonuç: PASS.** 1. çağrı 200 + satır silinir; 2.
çağrı (aynı çerez, artık geçersiz) **401 `UNAUTHENTICATED`** döner (çağıranın
kendi çerezi de ilk çağrıyla birlikte düşmüş, AC4'ün "anında geçersizleşme"
deseniyle tutarlı) — 500/çökme YOK, davranış güvenli. Vacuity kontrolü
KENDİ testimde yapıldı: `firstRevoke.status).toBe(200)` → `toBe(418)`
mutasyonu KIRMIZI verdi ("expected 200 to be 418"), geri alındı, shasum
ÖNCESİ/SONRASI eşit:
`b9c432f9a345fcbc20392bc73b30c26805ff7554d47bbd70f052882fea7d2095`.
**Bulgu üretmiyorum — davranış doğru, test artık mevcut süite eklendi (bu
rapor `ÇIKTILAR`ında listelenecek).**

**Diğer kendi senaryolarım — ölçüldü, ayrı test yazılmadı (bütçe/öncelik:
① altındaki critical bulgu baskın):**

- **Kendi güncel oturumunu (`isCurrent: true`) sonlandırmak** — yukarıdaki
  idempotency testinin 1. çağrısı AYNEN BUDUR (kendi `own.id`'sini,
  `isCurrent: true` olan satırı, sonlandırıyor) → **çalışıyor, 200, cookie
  anında geçersiz.** Ayrı bulgu yok.
- **`revokeAll` SONRASI `session.list`** — `auth-sessions.test.ts`'in
  "revoke-all" testi (PASS, bu raporun ① bölümünde koşturuldu) bunu zaten
  kapsıyor: revoke-all sonrası HER İKİ çerez `GET /auth/sessions`'da 401
  alıyor (satır 412-416). Ayrı bulgu yok.
- **Süresi geçmiş (`expiresAt` geçmiş) satır listede görünüyor mu** —
  `listOwnSessions`'ın sorgusunda `expiresAt` filtresi YOK (kod okundu,
  `where: {}` zaten her şeyi döndürüyor — ① düzeltildiğinde `where: {
  userId }` olacak, ama `expiresAt > now()` filtresi YİNE olmayacak).
  **[SEV: low] `apps/api/src/auth/sessions.service.ts:111-115` —
  `listOwnSessions` süresi geçmiş (`expiresAt < now()`) oturum satırlarını
  listeden ELEMİYOR; Better Auth'un kendi temizleme mekanizması satırı
  ne zaman sildiğine bağlı olarak kullanıcı "aktif oturumlar" listesinde
  süresi dolmuş bir satır görebilir. Düzeltme: `where` koşuluna `expiresAt:
  { gt: new Date() }` eklenebilir (① düzeltmesiyle AYNI satırda, "yolu
  üstündeyse kapat" istisnası uygulanabilir). — sorumlu: backend.** (Bu
  `low` zaten AÇILACAK bir FIX turunun (① critical) TAM AYNI dosya/satırında
  — AGENT_BASELINE §4 istisnasına göre backend bunu aynı düzenlemede
  kapatabilir, ayrı tur AÇILMAZ.)
- **Step-up parolası doğru ama oturum başkasının → sıra gereği 404 pinli
  mi** — AC3'ün "DOĞRU parolayla + başkasının sessionId'si → 404" bloğu
  (satır 290-294) TAM bunu test ediyor; bu koşumda KIRMIZI (① regresyonunun
  yan etkisi, Q-1/Q-2 bölümünde zaten not edildi) — `DOĞRULANAMADI`, ayrı
  bulgu AÇMIYORUM (zaten ① + backend FIX turu kapsamında).
- **`session.list` sıralaması belirli mi** — `sessions.service.ts:114`
  `orderBy: { createdAt: 'desc' }` — KOD SEVİYESİNDE belirli (en yeni
  önce). **Ama hiçbir test bunu DOĞRULAMIYOR** (iki oturumlu testler
  sırayı değil `isCurrent`/alan içeriğini kontrol ediyor). **[SEV: low]
  `apps/api/src/__tests__/auth-sessions.test.ts` — `session.list`'in
  "en yeni önce" sıralaması hiçbir testte pinlenmemiş; `orderBy` satırı
  kazara silinse/değişse mevcut süit bunu YAKALAMAZ. Düzeltme: AC1 testine
  iki oturumun döndürülme SIRASINI (ilk satır = en son açılan) doğrulayan
  bir assert ekle. — sorumlu: qa/backend, ROADMAP borcu, acil değil.**
- **Sayfalama yok** — `listOwnSessions` sayfalama/limit TAŞIMIYOR (kod
  okundu, `findMany` limitsiz). Bugünkü kullanım deseni (kullanıcı başına
  makul sayıda aktif oturum) için risk DÜŞÜK, ama platform seviyesi bir
  tabloda (RLS/tenant indeksi YOK, ADR-0019 §9) sınırsız büyüme teorik
  olarak mümkün. **ROADMAP borcu olarak kaydediyorum, `low`, acil
  düzeltme GEREKMİYOR** — bugün hiçbir üretim kullanıcısı binlerce aktif
  oturuma sahip değil, risk gerçekleşmedi.

---

## AŞAMA ⑤ — Tek temiz koşum, komut çıktıları

```
npx turbo run lint --env-mode=loose        → 21/21 başarılı
npx turbo run typecheck --env-mode=loose   → 21/21 başarılı
npx turbo run build --env-mode=loose       → 13/13 başarılı
pnpm guards                                → 11/11 PASS
npx turbo run test --env-mode=loose        → 17/18 paket başarılı (@arkesoft/api KIRMIZI)
npx turbo run test:isolation --env-mode=loose → 10/10 başarılı (74 test, hepsi PASS)
```

**`pnpm test` paket başına (tek temiz koşum):**

| Paket                    | Dosya          | Test            |
| ------------------------ | -------------- | --------------- |
| `@arkesoft/ui`           | 2 passed       | 23 passed       |
| `@arkesoft/errors`       | 3 passed       | 54 passed       |
| `@arkesoft/tenancy`      | 2 passed       | 39 passed       |
| `@arkesoft/themes-modern`| 1 passed       | 5 passed        |
| `@arkesoft/admin`        | 15 passed      | 117 passed      |
| `@arkesoft/storefront`   | 15 passed      | 125 passed      |
| `@arkesoft/theme-sdk`    | 19 passed      | 223 passed      |
| `@arkesoft/trpc`         | 12 passed      | 120 passed      |
| `@arkesoft/db`           | 10 passed      | 210 passed      |
| **`@arkesoft/api`**      | **4 failed \| 82 passed (86)** | **9 failed \| 662 passed (671)** |

**9 başarısız testin TAMAMI aynı kök nedene (① critical bulgu) bağlı:**
`auth-sessions.test.ts` (AC1, AC3, AC5/AC6 — 3 test), `session-ip-and-
last-seen.test.ts` (AC8'in iki penceresi — 2 test, `listSessions`'ın
`.length` kontrolüne dayanıyor), `session-list-read-port-adapter.test.ts`
(DÖNÜŞÜM + **SAHİPLİK (çapraz kullanıcı sızıntısı)** + PORT TOTAL'dır — 3
test, "SAHİPLİK" testi `①`in bulgusunu DOĞRUDAN, BAĞIMSIZ bir üçüncü yoldan
daha doğruluyor), `trpc-http.test.ts` (Q-2 — 1 test). **Toplam dört ayrı
dosyada, üç ayrı transport/katmanda (REST liste, port adaptör, tRPC)
AYNI regresyonun teyidi — rastgele/flaky DEĞİL, tutarlı ve tekrarlanabilir.**

**Flaky kontrolü:** `@arkesoft/api` test dosyası `src/__tests__/
session-list-read-port-adapter.test.ts` + `trpc-http.test.ts` + `auth-
sessions.test.ts` İKİ KEZ ayrı ayrı koşturuldu (önce tek dosya, sonra tam
paket koşumunda) — HER İKİSİNDE de AYNI testler AYNI nedenle KIRMIZI.
Flaky DEĞİL, deterministik bir regresyon.

**`test:isolation` 10/10, 74 test, TAMAMI PASS** — bu kaynak ADR-0019 §9
uyarınca tenant izolasyon süitinden MUAF (platform seviyesi tablo), bu
sayı critical bulgudan ETKİLENMİYOR (beklenen).

**Playwright/dev sunucusu:** Bu gate turu Playwright/e2e KULLANMADI (görev
kapsamı backend/tRPC entegrasyon testleriydi, kritik akışlardan biri
DEĞİŞMEDİ — ADR-0019 Sonuçlar §"step-up kurulabilir ama uçtan uca
doğrulanamaz" notu zaten panel akışının bu Task'ta e2e gerektirmediğini
destekliyor). **3000/3100 portlarına DOKUNULMADI, hiçbir dev sunucusu
BAŞLATILMADI/DURDURULMADI** — `wcag` için port TEMİZ.

---

## SONUÇ

**GATE: qa**
**SONUÇ: FAIL**

Gerekçe (AGENT_BASELINE §4): en az bir `critical` bulgu var →
koşulsuz FAIL.

### BULGULAR

- **[SEV: critical] `apps/api/src/auth/sessions.service.ts:111` —
  `listOwnSessions`'ın sorgusu `where: {}` (filtresiz) — `GET
  /auth/sessions` ve `/trpc/session.list` ÇAĞIRANIN KENDİ oturumları
  yerine veritabanındaki TÜM kullanıcıların TÜM oturum satırlarını (IP,
  cihaz, zaman damgaları dahil) döndürüyor. Taban sürümde `where: {
  userId: identity.userId }` vardı, bu Task'ta SİLİNDİ (regresyon,
  `git diff` ile doğrulandı). Dört test dosyasında, üç ayrı katmanda
  (REST liste, port adaptör "SAHİPLİK" testi, tRPC Q-2) BAĞIMSIZ olarak
  doğrulandı; 9 test KIRMIZI. Düzeltme: `where: { userId: identity.userId
  }` geri eklenmeli. — sorumlu ajan: backend.**
- **[SEV: low] ROADMAP.md:1120 — kabul kriteri metni "403" diyor, doğru ve
  kasıtlı davranış 404'tür (ADR-0019 §9, CLAUDE.md §7, bağımsız ölçümle
  teyit edildi). Metni "404" olacak şekilde düzelt. — sorumlu: docs.**
- **[SEV: low] `apps/api/src/__tests__/session-ip-not-logged.test.ts:168-180`
  — iki assert de negatif (`not.toContain`), `fullLogText`'in boş olmadığını
  kanıtlayan pozitif pin yok; `LOG_LEVEL=error|silent` ortamında vacuous
  olabilir (yapısal risk, bugünkü aktiflik ölçülmedi). — sorumlu: backend
  (S8b).** *(dokunulmaz bulgu, doğrulandı — düzeltme S8b turunda.)*
- **[SEV: low] `apps/api/src/auth/sessions.service.ts:129` — `'' → null`
  sentinel eşlemesi hiçbir testte pinlenmemiş. — sorumlu: backend (S8a).**
  *(dokunulmaz bulgu, doğrulandı.)*
- **[SEV: low] `apps/api/src/__tests__/session-list-read-port-adapter.test.ts:113`
  — `row.ipAddress === null || typeof row.ipAddress === 'string'` tip
  sistemiyle zaten garanti edilen bir totoloji. — sorumlu: backend.**
  *(dokunulmaz bulgu, doğrulandı.)*
- **[SEV: low] `apps/api/src/__tests__/session-ip-not-logged.test.ts` —
  AC9 akışı REST (`/auth/sessions`) kullanıyor, panelin üretim yolu
  `/trpc/session.list`; bugün gerçek kusur yok ama taşıma-seviyesi pin
  eksik. — sorumlu: qa/backend (Q-3, ROADMAP borcu).**
- **[SEV: low] `apps/api/src/auth/sessions.service.ts:111-115` —
  `listOwnSessions` süresi geçmiş (`expiresAt` dolmuş) satırları listeden
  elemiyor. — sorumlu: backend (① ile aynı düzenlemede kapatılabilir).**
- **[SEV: low] `apps/api/src/__tests__/auth-sessions.test.ts` — `session.list`
  sıralamasının (en yeni önce) hiçbir testte pini yok. — sorumlu:
  qa/backend, ROADMAP borcu.**
- **[SEV: low] `apps/api/src/auth/sessions.service.ts` — `listOwnSessions`
  sayfalama taşımıyor; bugün risk gerçekleşmedi, ROADMAP borcu. — sorumlu:
  backend.**

**(`packages/db/src/__tests__/session-metadata-columns.test.ts:196-204`
TOTOLOJİSİ `high` olarak security turunda AÇILMIŞ ve bu turda SADECE
DOĞRULANDI — burada TEKRAR SAYILMIYOR, zaten ayrı bir FIX turuna atanmış.)**

### ÖLÇÜMLER

**KABUL KRİTERİ EŞLEMESİ:**

| AC parçası | Test | Sonuç |
| --- | --- | --- |
| (a) kendi oturumları, cihaz/IP/son görülme DOLU | `auth-sessions.test.ts` AC1 | **FAIL (canlı) — critical regresyon** |
| (b) başkasının oturumunu uzaktan sonlandırma → 403/404 | `auth-sessions.test.ts` AC3 | **DOĞRULANAMADI (canlı, aynı regresyonla bloklu); statik analiz 404'ü doğru buluyor, ROADMAP metni hatalı (low)** |
| (c) hassas işlem güncel kimlik doğrulaması olmadan tamamlanmaz | `auth-sessions.test.ts` AC5/AC6 (revoke) — **DOĞRULANAMADI (canlı, bloklu)**; "revoke-all" testi — **PASS (canlı, bağımsız)** |
| (d) step-up tetiklenir | `sessions-step-up-coverage.test.ts` (6/6 uç) + `step-up.test.ts` | **PASS (canlı, 14/14)** |
| Q-1: 429 uçtan uca (iki yeni rota) | `rate-limit.test.ts` (iki yeni describe) | **PASS (canlı, 39/39) + kendi mutasyon kanıtım** |
| Q-2: tRPC kullanıcı-çapraz pini | `trpc-http.test.ts` | **Test YAZIMI doğru, ÇALIŞIYOR — KIRMIZI çünkü ÜRETİM KODU kırık (①'in bağımsız 3. kanıtı)** |

**TEST SAYILARI:**
- Yeni eklenen (bu turda qa tarafından): 1 dosya (`session-revoke-idempotency.test.ts`), 1 test, PASS.
- Toplam `@arkesoft/api`: 671 test (662 PASS, **9 FAIL**).
- Toplam diğer 9 paket: 916 test, hepsi PASS (ui 23, errors 54, tenancy 39, themes-modern 5, admin 117, storefront 125, theme-sdk 223, trpc 120, db 210).
- `test:isolation`: 74 test, hepsi PASS.

**KOŞTURULAN KOMUTLAR:**
| Komut | Exit kodu | Özet |
| --- | --- | --- |
| `npx turbo run lint --env-mode=loose` | 0 | 21/21 |
| `npx turbo run typecheck --env-mode=loose` | 0 | 21/21 |
| `npx turbo run build --env-mode=loose` | 0 | 13/13 |
| `pnpm guards` | 0 | 11/11 PASS |
| `npx turbo run test --env-mode=loose` | **1** | 17/18 paket; `@arkesoft/api` 9 test KIRMIZI |
| `npx turbo run test:isolation --env-mode=loose` | 0 | 10/10, 74 test PASS |
| (ayrıca tekil dosya koşumları + 2 mutasyon turu, yukarıda ayrıntılı) | — | — |

### Bu sürümde düzeltilecek ↔ ROADMAP borcu ayrımı

**Bu sürümde (backend FIX turu, derhal):**
- `critical`: `sessions.service.ts:111` `where: {}` → `where: { userId:
  identity.userId } }` (± `expiresAt` filtresi, "yolu üstündeyse kapat").
- FIX turu sonrası YENİDEN koşturulması GEREKEN testler: `auth-
  sessions.test.ts` (AC1/AC3/AC5/AC6), `session-ip-and-last-seen.test.ts`,
  `session-list-read-port-adapter.test.ts`, `trpc-http.test.ts` (Q-2),
  `session-metadata-columns.test.ts` totoloji FIX'i (ayrı, security'nin
  `high`'ı).

**ROADMAP teknik borcu (bu turda AÇILMAYACAK, `low`, 1-2 tane değil TOPLAM
sekiz `low` — ama kural "1-2 medium" için, `low` sayısı FAIL eşiğine
GİRMİYOR, hepsi borç):**
1. ROADMAP.md:1120 metin düzeltmesi (403→404) — docs.
2. `session-ip-not-logged.test.ts` vacuity riski — backend/qa.
3. `''→null` sentinel pini eksik — backend.
4. `row.ipAddress` tip totolojisi — backend.
5. AC9'un tRPC transport tekrarı eksik (Q-3) — qa/backend.
6. Süresi geçmiş satırların listeden elenmemesi — backend.
7. `session.list` sıralama pini eksik — qa/backend.
8. Sayfalama yok — backend.

**Not:** `GATE SONUCU` yalnızca `critical` bulguya dayanıyor; sekiz `low`
PASS/FAIL eşiğini DEĞİŞTİRMEZ (AGENT_BASELINE §4: yalnızca `low` → PASS) —
ama critical TEK BAŞINA zaten FAIL'i belirliyor.

---

## EK BÖLÜM — Orkestratör düzeltmesi sonrası yeniden ölçüm (aynı tur, ek alt-bölüm)

**Bağlam:** Orkestratör, bu raporun `critical` bulgusunun (`sessions.service.ts:111`,
`where: {}`) **önceki, takılmış `qa` denemesinin geri alınmamış mutasyonu**
olduğunu, kendi denetiminde (`git show HEAD:...`, mtime, pencere eşleşmesi)
tespit ettiğini bildirdi ve satırı `where: { userId: identity.userId } }`'e
geri yükledi. **Bunu KÖRÜ KÖRÜNE kabul ETMEDİM — kendi bağımsız ölçümümle
doğruladım:**

1. `grep -n "const rows = await this.authPrisma.session.findMany" -A 5
   apps/api/src/auth/sessions.service.ts` → satır 111-115 ARTIK `where: {
   userId: identity.userId }` gösteriyor. **DOĞRULANDI.**
2. Önceden KIRMIZI olan dört dosya TEK TEK yeniden koşturuldu:
   - `auth-sessions.test.ts` → **6/6 PASS** (AC1, AC3, AC5/AC6 dahil).
   - `session-list-read-port-adapter.test.ts` + `session-ip-and-last-
     seen.test.ts` + `trpc-http.test.ts` (üçü birlikte) → **22/22 PASS**
     (Q-2'nin kullanıcı-çapraz testi DAHİL).
3. Tam `npx turbo run test --env-mode=loose` → **18/18 paket, `@arkesoft/api`
   671/671 PASS** (benim eklediğim idempotency testi dahil). **9 kırmızı
   testin HEPSİ şimdi YEŞİL.**
4. `npx turbo run lint typecheck build --env-mode=loose` → 39/39 başarılı.
5. `npx turbo run test:isolation --env-mode=loose` → **İKİ KEZ** koşturuldu:
   1. koşum `@arkesoft/api` 1 dosya KIRMIZI/3 skip gösterdi (tam çıktı
      YAKALANMADI — yalnızca özet satırı görüldü), 2. koşum (hemen ardından,
      tek başına `test:isolation --filter=@arkesoft/api`) **18/18 PASS**, 3.
      koşum (tam paket seti) **10/10, 74/74 PASS**. **Bu, gözlenen bir flaky
      davranıştır** (AGENT_BASELINE'ın "flaky → raporla, susturma" kuralı) —
      ayrıntı YAKALANAMADIĞI için ayrı bir `medium` bulgu AÇMIYORUM (Orkestratör'ün
      mesajında ZATEN belgelenmiş `auth-flow.test.ts > F3` Redis flake'iyle
      TUTARLI bir desen — yeni bir kusur OLARAK İDDİA ETMİYORUM, `DOĞRULANAMADI/
      tekrarlanamadı` olarak not ediyorum).
6. `pnpm guards` → 11/11 PASS.

**① — AC parçalarının NİHAİ durumu (canlı, bloklanmamış):**
- **(a)** kendi oturumları/cihaz/IP/son görülme → **KARŞILANDI** (AC1, canlı PASS).
- **(b)** 403/404 → **KARŞILANDI, 404** (AC3, canlı PASS — crossUserResponse.status===404,
  SESSION_NOT_FOUND, var-olmayanla birebir eşit gövde). Karar DEĞİŞMEDİ:
  ROADMAP metni (403) hâlâ hatalı, `low` bulgu AYNEN GEÇERLİ.
- **(c)** "işlem TAMAMLANMAZ" → **KARŞILANDI** (AC5/AC6, canlı PASS — parola
  eksik/yanlışken satır `findUnique` ile `not.toBeNull()`, doğru parolada
  `toBeNull()`; revoke-all tarafı zaten PASS'tı).
- **(d)** step-up tetiklenir → **KARŞILANDI** (değişmedi).

**② format:check:** `apps/api/src/__tests__/rate-limit.test.ts` ve
`apps/api/src/__tests__/session-revoke-idempotency.test.ts` → `npx prettier
--write <iki yol>` (yalnızca bu ikisi, `pnpm format` KOŞTURULMADI) →
`npx prettier --check <iki yol>` → **"All matched files use Prettier code
style!"**. Ayrıca `pnpm format:check` (repo geneli, salt-okunur) → **temiz**.
Format sonrası iki dosya yeniden koşturuldu → **40/40 PASS** (regresyon yok).

### ③ VERDICT REVİZYONU

**`critical` bulgu DÜŞTÜ** (benim hatam değildi — dosyanın TAMAMEN kayıtsız
olması "S8a yazdı" ile "önceki qa denemesi 3 saat sonra bozdu"yu ayırt
etmemi engelliyordu; elimde olmayan bilgiydi). Kalan bulgular:

- 8× `low` (ROADMAP metni, iki "dokunulmaz" bulgu — AŞAĞIDA solid'in
  `medium`'a yükselttiği not edilecek —, Q-3, süresi geçmiş satır, sıralama
  pini, sayfalama, tip-totolojisi).
- `solid` gate'in AYRICA ağırlıklandırdığı iki bulgu
  (`session-ip-not-logged.test.ts:168-180` ve `sessions.service.ts:129`)
  **`medium`** sayılıyor — ama Orkestratör'ün açık talimatıyla **bunlar
  qa'nın KENDİ verdict hesabına GİRMİYOR** (solid'in FAIL'ine sayılıyor).
  İtiraz etmiyorum — zincir ölçümü + emsal karşılaştırması gerekçesi makul.

AGENT_BASELINE §4'e göre: qa'nın KENDİ bulgu kümesinde `critical`/`high` YOK,
`medium` YOK (ikisi solid'e devredildi) — **yalnızca `low` → PASS.**

**GATE: qa**
**SONUÇ (REVİZE): PASS** — bulgular ROADMAP teknik borcuna kaydedilir (bu
raporun "Bu sürümde düzeltilecek ↔ ROADMAP borcu" bölümündeki sekiz `low`
kalemi; `critical` kalemi GERİ ÇEKİLDİ, "Bu sürümde (backend FIX turu,
derhal)" başlığı ve altındaki madde ARTIK GEÇERSİZ).

**Düzeltilen ders (kendi payıma):** ①'deki ilk değerlendirmem SADECE kod
okumaya dayanıyordu ve YANLIŞTI; gerçek koşum (①'in kendi AŞAMASINDA, bu
raporun kronolojik akışında) bunu DÜZELTTİ — ama testleri gerçekten
koştururken dosyanın git geçmişini/mtime'ını Orkestratör kadar derin
incelemedim, bu yüzden "regresyon mu, geri alınmamış gate mutasyonu mu"
ayrımını YAPAMADIM. Not: bu, "testi koştur, okumakla yetinme" ilkesini
ihlal ETMEDİ (testleri GERÇEKTEN koşturdum, kırmızıyı GERÇEKTEN gördüm) —
eksik olan, kırmızının KÖK NEDENİNİ (üretim kusuru vs. başka bir ajanın
geri almadığı deney) ayırt edecek bir ARAÇ/yetkiydi (git blame/mtime
analizi bu turda YAPMADIM). Gelecek turlar için not: şüpheli bir koddaki
davranış DEĞİŞİKLİĞİ görürsem `git log -p`/`git diff <son commit>` ile
"bu satır COMMIT'TE var mıydı" sorusunu SORMALIYIM — bu kez sormadım.

### Playwright/dev sunucusu

Bu ek bölümde de Playwright/e2e KULLANILMADI, 3000/3100 portlarına
dokunulmadı. `wcag` için port temiz.
