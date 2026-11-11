# T-017 · `solid` gate · tur 1

- **Tarih:** 2026-11-10
- **Sürüm:** ROADMAP v0.0.15.1 (T-017)
- **Kapsam:** v0.0.15.1'de değişen/eklenen dosyalar (api · trpc · db · errors · admin)
- **Araç kısıtı:** Bash YOK. Tüm ölçümler `Read`/`Grep`/`Glob` ile yapıldı; komut gerektiren
  hiçbir iddia raporlanmadı.

```
GATE: solid
SONUÇ: FAIL
```

**FAIL gerekçesi (AGENT_BASELINE §4, bağlayıcı):** bir `high` bulgu var (H-1 — yapısı
gereği HİÇBİR koşulda kırmızı veremeyen, ama "S6'nın hook'unun GERÇEKTEN çalıştığının
varlık kanıtı" olarak beyan edilen bir test). `high` → FAIL, düzeltme turu açılır.
Ayrıca iki `medium` (3'ten az → kendi başına FAIL üretmezdi).

---

## BULGULAR

### H-1 · `high` · `packages/db/src/__tests__/session-metadata-columns.test.ts:196-204`

**Test ⑤ bir totolojidir — her iki sonuçta da YEŞİL döner, dolayısıyla iddia ettiği
davranışı ölçmez.**

```ts
if (populatedOrNullIpAddressCount === 0) {
  expect(populatedOrNullIpAddressCount).toBe(0)   // ← 0 ise YEŞİL
  return
}
expect(populatedOrNullIpAddressCount).toBeGreaterThan(0)  // ← >0 ise YEŞİL
```

`populatedOrNullIpAddressCount`'ın **her** değeri için test geçer. Yani
"S6'nın `session.create.before` hook'u IP yazıyor" iddiası ile "hook hiç çalışmıyor"
durumu bu testle **ayırt edilemez**. Dosya başı yorumu (`:70-83`) bu testi açıkça
*"S6'nın hook'unun GERÇEKTEN çalıştığının VARLIK kanıtı"* diye beyan ediyor —
**beyan ↔ gerçeklik boşluğu**.

`expect.assertions(1)` (`:177`) **sıfır assertion**'a karşı korur, **totolojik**
assertion'a karşı KORUMAZ. Kıyas noktası aynı dosyada: test ④ (`:153-174`) yalnızca
"tablo BOŞ" kaçış dalına sahiptir (gerçekten ölçülemeyen bir durum) ve asıl dalında
kırmızı verebilir. ⑤'e eklenen **ikinci** kaçış dalı (`:196`) tam olarak testin
yakalaması gereken negatif durumu kaçış durumuna çevirmiştir.

**Gevşetmenin kendisi meşru, uygulanışı değil:** önceki mutlak pin ("her satır `''`")
S6 sonrası **yapısal olarak yanlış** hale geldiği için varlık tabanlı iddiaya geçmek
doğru karardı (CLAUDE.md §10.6 ihlali DEĞİL). Kusur, geçişin testi totolojiye
dönüştürmesidir.

**Hafifletici (dürüstçe kayıtlı):** davranışın GERÇEK regresyon koruması
`apps/api/src/__tests__/session-ip-and-last-seen.test.ts:147-150`'de vardır
(`expect(sessionRow.ipAddress).toBe(FORWARDED_TEST_IP)` + `not.toBe('')` +
`not.toBe('127.0.0.1')`). Yani üretim davranışı korumasız değil; korumasız olan
`packages/db`'nin kendi regresyon yüzeyi ve **yeşil bir testin verdiği yanlış güvence**.

**Önerilen düzeltme (biri):**
(a) `:196-202` kaçış dalını KALDIR — paylaşılan DB'de tablo boş değil ve `apps/api`
testleri S6 sonrası satır üretiyor; ya da
(b) sorguyu bir sınıra kapsamla (`where: { createdAt: { gt: S6_BOUNDARY } }`) ve
"sınır sonrası satır yok" durumunu TEK meşru `DOĞRULANAMADI` dalı yap, `count === 0`
durumunda **kırmızı** ver; ya da
(c) ⑤'i tamamen kaldır ve dosya başı yorumunda kanıtın
`session-ip-and-last-seen.test.ts:147`'de olduğunu yaz (tekrar yerine atıf).

**Sorumlu ajan:** `db` (S3) + `backend` (S6) · doğrulama: `qa`
**Vade:** BU sürümde.

---

### M-1 · `medium` · `apps/api/src/__tests__/session-ip-not-logged.test.ts:168-180`

**AC9 BİRİNCİL savunma testinin iki assert'i de negatif; `fullLogText`'in boş
olmadığını kanıtlayan hiçbir pozitif pin yok → ortam bağımlı vacuity.**

```ts
const fullLogText = getFullText()
expect(fullLogText).not.toContain('ipAddress')        // :174
expect(fullLogText).not.toContain(FORWARDED_TEST_IP)  // :180
```

`createTestApp({ stream })` logger'ı `createRootLogger({ level: env.LOG_LEVEL, stream })`
ile kurar (`apps/api/src/__tests__/helpers/create-test-app.ts:232-235`) ve `LOG_LEVEL`
**gerçek ortamdan** gelir (`BASE_ENV = parseEnv(apiEnvSchema)`, `:66`; override edilen tek
alan `AUTH_TRUSTED_PROXY_COUNT`). `LOG_LEVEL=error`/`silent` bir koşumda akış hiçbir `info`
satırı üretmez → `fullLogText` boşalır → **her iki assert vacuously yeşil**, test
hiçbir şey ölçmemiş olur ve bunu kimse fark etmez.

Bu, projenin **kendi emsalinin** kapattığı bir boşluktur: dosya başı yorumu (`:5-7`)
`two-factor-acceptance-ac4-secret-redaction-vacuity.test.ts`'in dört adımlı yapısından
"ESİNLENDİĞİNİ" yazıyor, ama o dosyanın tam bu amaçla koyduğu canlılık pini
(`:135 expect(getFullText()).toContain(knownProbeMessage)`) **taşınmamış**.

İKİNCİL savunma bloğunun pozitif pini (`:221 expect(text).toContain(probeMessage)`)
bu boşluğu KAPATMAZ — o **ayrı** bir `createTestApp()` örneği ve **ayrı** bir
stream'dir (`:190-195`).

**Önerilen düzeltme:** negatif assert'lerden ÖNCE bir canlılık pini —
`expect(fullLogText).toContain('istek tamamlandı')` (akışın kesin ürettiği satır) veya
AC4 emsalinin probe-mesajı deseni.

**Sorumlu ajan:** `backend` (S8b) · doğrulama: `qa`
**Vade:** BU sürümde (tek satır; H-1 düzeltme turuyla aynı turda kapanır).

---

### M-2 · `medium` · `apps/api/src/auth/sessions.service.ts:129` (+ `session-list-read-port-adapter.test.ts:113`)

**Bu sürümün en çok beyan edilen tasarım kararı — `'' → null` sentinel eşlemesinin
TEK NOKTADA yapılması — hiçbir testle pinlenmemiş; onu pinliyormuş gibi duran assert
bir totoloji.**

Ölçüm (üç ayrı grep ile `apps/api`, `packages/trpc`, `packages/db`, `apps/admin`):

| Yer                                           | Ne iddia ediyor                                        | Gerçekte ne ölçüyor                                                             |
| --------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `session-list-read-port-adapter.test.ts:113`  | dosya başı (B): "`ipAddress` tel sözleşmesine UYGUN"   | `row.ipAddress === null \|\| typeof row.ipAddress === 'string'` → **tip zaten bunu garanti ediyor**, assertion hiçbir girdi için kırmızı veremez |
| `auth-sessions.test.ts:80`                    | liste şeması                                           | `z.string().nullable()` → `''` **de geçerli**, eşlemeyi pinlemez                 |
| `active-sessions-controller.test.ts:73-75`    | `resolveIpDisplayValue('')`                            | **admin'in kendi** savunması, servisin eşlemesi değil                            |

Yani `sessions.service.ts:129`'u `ipAddress: row.ipAddress` olarak "sadeleştiren" bir
gelecek düzenleme **tek bir testi bile kırmazdı**: tel şeması `''`'yi kabul eder, ve
admin tarafı `resolveIpDisplayValue` (`active-sessions-controller.ts:90`,
`ipAddress.length === 0` dalı) `''`'yi de "Bilinmiyor"a eşlediği için **UI bile
bozulmaz** — regresyon her katmanda maskelenir. Eşlemenin "YALNIZCA BURADA yapılır,
adaptörde TEKRARLANMAZ" kararı (üç dosya başında bağlayıcı yazılı:
`sessions.service.ts:22-30`, `session-list-read.port.adapter.ts:27-32`) bugün
**yalnızca yorumla** korunuyor.

**Önerilen düzeltme (aynı zamanda inceleme noktası 1'in SRP reçetesi):**
`rows.map` gövdesini (`sessions.service.ts:119-134`) saf bir fonksiyona çıkar —
`function toSessionSummary(row, currentSessionId): SessionSummary` (aynı dosyada veya
`session-summary.assembler.ts`), ve üç satırlık bir birim testi ekle:
`'' → null`, `null → null`, `'198.51.100.7' → '198.51.100.7'`. DB/DI gerekmez.
Bonus: `session-list-read-port-adapter.test.ts:113`'ü gerçek bir değer assert'ine çevir.

**Sorumlu ajan:** `backend` (S8a) · doğrulama: `qa`
**Vade:** BU sürümde.

---

### L-1 · `low` · `packages/trpc/src/schemas/session-summary.schema.ts:15` ve `:78-79`

Yorum, sentinel eşlemesinin **adaptörde** yapıldığını yazıyor
(*"adaptördeki boş dize sentinel'i `null`'a eşlenir, bu şemada DEĞİL — adaptörün işi"*).
Gerçek: eşleme `apps/api/src/auth/sessions.service.ts:129`'da; adaptör onu
**bilerek tekrarlamıyor** ve bunu kendi dosya başında açıkça yazıyor
(`session-list-read.port.adapter.ts:27-32`). Yorum okuyucuyu yanlış dosyaya yönlendirir
— tam olarak M-2'deki regresyonu arayan kişiyi yanlış yere bakmaya iter.
**Düzeltme:** "adaptörde" → "`apps/api`'nin okuma servisinde (`SessionsService.listOwnSessions`)".
**Sorumlu:** `backend` (S4/S9) · **Vade:** borç (yolu üstündeyse kapat).

### L-2 · `low` · `apps/api/src/__tests__/step-up.test.ts:62`

Test adı gerçeği anlatmıyor: *"katalog TAM altı işlem taşır — **büyümesi bu testi
DEĞİL**, inceleme görünürlüğünü artırır"*, ama assertion
`expect(Object.keys(SENSITIVE_OPERATIONS)).toHaveLength(6)` katalog **büyüdüğünde de**
kırmızı verir. Ad, gelecekteki bir geliştiriciye "yedinci işlemi eklerken bu testi
güncellemem gerekmez" dedirtir. (Assertion'ın KENDİSİ doğru ve değerli — kardinalite
pini, H-1'in tersine, gerçek bir kapı.)
**Düzeltme:** adı "katalog TAM altı işlem taşır — büyütmek bu testi de güncellemeyi,
yani inceleme görünürlüğünü GEREKTİRİR" yap.
**Sorumlu:** `backend` (S5) · **Vade:** borç.

### L-3 · `low` · `apps/admin/src/features/sessions/ActiveSessionsCard.tsx:64-71`

`INITIAL_SESSIONS_STATE` ile `active-sessions-controller.ts:190-197`'deki
`INITIAL_STATE` **birebir aynı altı alan/değer** — gerçek tekrar (aynı sebeple
değişirler: controller'ın başlangıç durumu, kartın başlangıç durumunun TANIMIDIR).
Yapısal sapma (alan eklemek) typecheck'e yakalanır; **değer** sapması (ör. `dialogKind`
varsayılanının değişmesi) sessizdir ve ilk render'da iki farklı durum görünür.
**Düzeltme:** `INITIAL_STATE`'i controller'dan export et ve kartta onu kullan
(veya `useState(() => controller.getState())` sırasını çöz).
**Sorumlu:** `frontend` (S11) · **Vade:** borç.

### L-4 · `low` · `apps/admin/src/features/sessions/active-sessions-controller.ts:199-227` ↔ `apps/admin/src/features/two-factor/two-factor-manage-controller.ts:26-33`

İki kontrolcü deseni yan yana: T-016 **callback** (`onDisabled`/`onRegenerated` deps
içinde), T-017 **`ActiveSessionsOutcome` discriminated union** döndürüyor.
Tutarsızlık borcu — detaylı karar aşağıda (inceleme noktası 6).
**Sorumlu:** `frontend` · **Vade:** ROADMAP teknik borç (bu sürümde DEĞİL — kapsam dışı
refactor, CLAUDE.md §10.13).

### L-5 · `low` · `apps/api/src/__tests__/sessions-step-up-coverage.test.ts:245` ve `apps/api/src/__tests__/rate-limit-policy.test.ts:111`

`routeKey.split(' ', 2) as [string, string]` — runtime doğrulaması olmadan `as`
zorlaması (CLAUDE.md §2: "`as` yalnızca Zod doğrulamasından hemen sonra").
Hafifletici: `sessions-step-up-coverage.test.ts:248` hemen ardından
`expect(method).toBe('POST')` ile bozuk anahtarı yakalar; `rate-limit-policy.test.ts`
sabit literal listesi üzerinde çalışır. İki satır T-016'dan devralındı (`:72`, `:88`),
ikisi bu sürümde eklendi.
**Düzeltme (opsiyonel):** `destructuring` yerine `indexOf`/`slice` veya küçük bir
`parseRouteKey()` test yardımcısı.
**Sorumlu:** `backend` (S1/S8b) · **Vade:** borç.

### L-6 · `low` · `apps/api/src/auth/step-up/step-up.service.ts:20`

Yorum `sessions.service.ts:96-99`'a atıf yapıyor; `auth.api.revokeSession({ body, headers })`
deseni bugün o dosyada **165-168**'de. Bayat satır referansı (S8a dosyayı büyüttü).
**Sorumlu:** `backend` · **Vade:** borç.

### L-7 · `low` · `apps/api/src/__tests__/session-ip-not-logged.test.ts:150-154`

AC9 akış testi listeyi **`GET /auth/sessions` (REST)** üzerinden okuyor; panelin
ÜRETİMDE kullandığı okuma yolu **`/trpc/session.list`**'tir
(`apps/admin/src/api/sessions-query.ts:25`; `panel-config.ts:91-93` `GET /auth/sessions`'ı
bilerek tanımlamıyor). Yani "ipAddress hiçbir log satırında yok" iddiası üretim okuma
yolunda ölçülmemiştir. Bugün gerçek bir kusur YOK (ölçüldü: ne
`session-list-read.port.adapter.ts` ne `session.router.ts` logger çağırıyor) — bu yüzden
`low`, `medium` değil.
**Sorumlu:** `qa`/`backend` · **Vade:** borç.

---

## ON İNCELEME NOKTASININ CEVAPLARI

### 1. `SessionsService` — Tek Sorumluluk gerçekten korundu mu?

**Kısmen; bir çıkarım önerilir ama SRP ihlali olarak bulgu YAZMIYORUM.** Ölçüm: sınıf
3 metot, kod ~140 satır (197 − 56 satır dosya başı yorumu); `listOwnSessions` 25,
`revokeOwnSession` 30, `revokeAllOwnSessions` 13 satır. Kohezyon yüksek: üç metodun
tamamı "çağıranın KENDİ oturumları" ekseninde.

**S8a'nın gerekçesi ayrıştırmayı gerçekten engelliyor — ama yalnızca step-up için.**
Step-up çağrısını controller'a taşımak sırayı (parola → sahiplik) iki katmana
böler ve gelecekteki ikinci bir çağıranın (ör. bir tRPC mutation'ı) onu atlamasına izin
verir; bugünkü yer **fail-closed** olandır ve `auth-sessions.test.ts:281-289`'un sıra
kanıtı buna dayanıyor. Doğru karar.

**Ama `''→null` + cihaz etiketi + alan seçimi (satır 119-134) bir *görünüm
birleştirmesidir* ve veri erişimi + politika sınıfının içinde yaşıyor.** Somut öneri
(M-2'nin düzeltmesiyle aynı): `toSessionSummary(row, currentSessionId): SessionSummary`
saf fonksiyonu. Kazanç ölçülebilir — bugün DB'siz test edilemeyen sentinel kararı
birim testlenebilir hale gelir. `SessionViewAssembler` adında bir **sınıf** gerekmez
(tek kullanımlı factory/DI nesnesi KISS ihlali olurdu); saf fonksiyon yeterli.

### 2. `''→null` eşlemesi NEREDE olmalı — tek-noktadan-dönüşüm sağlanmış mı?

**Evet, DRY açısından sağlanmış — "sessiz eşleşmemişlik" YOK. Handoff'un endişesi
ÖLÇÜLDÜ ve çürütüldü.** Kanıt zinciri:

- `auth.module.ts:232-238` → `SESSION_LIST_READER` token'ı
  `(identity) => sessionsService.listOwnSessions(identity)`'e delege eder.
- `session-list-read.port.adapter.ts:69` → adaptör **o token'ı** çağırır, Prisma'ya
  dokunmaz.
- `sessions.controller.ts:77` → REST de **aynı metodu** çağırır.

Yani **iki tüketici var ama tek bir dönüşüm noktası var**; "biri sentinel'i görmüyor
varsayıyor" iddiası yanlış — adaptör sentinel'i görmüyor **çünkü ona hiç `''`
ulaşmıyor**, kendi iddiası doğru.

**Gerçek boşluk DRY'da değil, TESTTE** → M-2 (eşleme hiçbir testle pinli değil) ve
L-1 (şema yorumu yanlış dosyayı gösteriyor).

### 3. `SENSITIVE_OPERATIONS` + iki yükleme-zamanı kapısı — KISS mi, kırılgan mı?

**KISS tarafında; üç kapının sorumlulukları ÖRTÜŞMÜYOR.** Ölçüm:

| Kapı | Yer | Neyi ölçer | Üçünden farkı |
| ---- | --- | ---------- | ------------- |
| (a) | `sensitive-operations.ts:80-90` | routeKey **bilinen bir rota mı** | yazım hatası |
| (b) | `sensitive-operations.ts:93-103` | rota **oran sınırlı mı** | korumasız hassas işlem |
| (c) | `sessions-step-up-coverage.test.ts:242-266` | step-up **gerçekten zorlanıyor mu** | HTTP davranışı |

Üç ayrı özellik, üç ayrı başarısızlık modu → tekrar değil. `throw` at module load
kabul edilebilir: bu projede emsali var (`rate-limit.policy.ts:152-161`,
`buildPolicy`) ve etkisi deterministik (import eden her şey çöker, sessiz dal yok).

⚠ Tek not (bulgu değil, çünkü dosya **kendisi dürüstçe beyan ediyor**):
`step-up.test.ts:46-59`'daki "Kapı (b) ölçümü" testi de totolojiktir — satır 28'deki
import kapı (b)'yi zaten çalıştırır, dolayısıyla `unprotected` boş olmadan bu test
**koşamaz** bile. Ama bu dosya onu dosya başında (`:4-9`) "dolaylı doğrulama + DoD'un
istediği **ham çıktı**" olarak nitelendiriyor ve `console.info` ile gerçekten ham çıktı
üretiyor. H-1'den ayıran tam olarak budur: orada totoloji **davranış kanıtı** diye beyan
edilmiş, burada **belge** diye.

### 4. `StepUpService` ↔ `SessionsService` bağımlılık yönü / sızan soyutlama

**İncelendi, bulgu yok.** Yön tek yönlü: `SessionsService` → `StepUpService`
(`sessions.service.ts:65,106`); tersi import YOK (ölçüldü). Döngü yok.
Sağlayıcıya özgü tip **dışarı sızmıyor**: `isAPIError` daraltması
(`step-up.service.ts:81-85`) better-auth'un `APIError`'unu `InvalidPasswordError`'a,
beklenmeyeni `AuthProviderFailedError`'a çevirir — `catch` bloğu hatayı **yutmuyor**,
`cause` olarak sarmalıyor. `AuthInstance` (tam `Auth`) her iki serviste de
`AuthModule` **içinde** kalıyor; dışa açılan yüzey iki daraltılmış token
(`auth.module.ts:285`). CLAUDE.md §8 "çekirdek sağlayıcı adı bilmez" ihlali yok:
`if (provider === ...)` dallanması aranan dosyalarda **0** eşleşme.

### 5. TEST KALİTESİ (en önemli madde) — vacuity ölçümü

**Katalog döngüsü (`sessions-step-up-coverage.test.ts:242`):** boş dizi üzerinde
sessizce geçer **ama** kardinalite pini **VAR** — `step-up.test.ts:63`
`expect(Object.keys(SENSITIVE_OPERATIONS)).toHaveLength(6)`. Katalog küçülürse
`pnpm test` kırmızı olur. Handoff'un "kardinalite pini var mı?" sorusunun cevabı:
**var, ama kardeş dosyada** ve döngünün kendi dosya başı yorumu (`:11-14`) bu
bağımlılığı anmıyor. Ad hatası da yakalanır (`prepareAccountForOperation`'ın literal
karşılaştırmaları eşleşmez → ön koşul kurulmaz → 400 beklentisi kırmızı).
**Bulgu yok** (L-2 yalnızca o pinin ADININ yanıltıcı olmasıyla ilgili).

**`session-ip-not-logged.test.ts` iki assert:** **evet, boş-küme üzerinde vacuous
olabilir** → **M-1** (ölçüm: `LOG_LEVEL` zinciri, `create-test-app.ts:232-235`).
Assert #2'nin kendi gerekçesi ("#1 olmadan yetersiz olurdu", `:177-179`) doğru ama
**ikisi birlikte de** boş metin üzerinde yeşildir — eksik olan üçüncü, pozitif pindir.

**S1'in sildiği negatif pin (`rate-limit-policy.test.ts`):** **kapsam korunmuş, eksen
KAYBOLMAMIŞ.** Ölçüm: eski `['POST','/auth/sessions/revoke'] → undefined` iddiası
davranış değiştiği için **artık yanlış bir gerçeği** sabitliyordu; yerine iki pozitif
vaka (`:108-122`, tam politika nesnesi `toEqual` ile) + negatif listede
`['GET','/auth/sessions/revoke']` (`:129`) kondu. Metot-ayrımı ekseni **yaşıyor** ve
listede ikinci bir örneği de var (`['GET','/auth/sign-in/email']`, `:130`). Bu bir
gevşetme DEĞİL (CLAUDE.md §10.6 ihlali yok): yeni hâl eskisinden **daha** sıkı (tam
nesne eşitliği + iki eksen).

**S3/S6'nın gevşettiği assert (`session-metadata-columns.test.ts` ⑤):** gevşetmenin
**yönü** meşru, **uygulanışı** değil → **H-1**. `expect.assertions(1)` korumasının
"korundu" iddiası doğru ama **yetersiz** (sıfır assertion'a karşı korur, totolojiye
karşı değil).

**+61 api testinin vacuous OLMADIĞINA dair kanıt (örnekleme değil, okunarak):**
`auth-sessions.test.ts` — negatif yollar gerçek: `:337-339` (parola yok → 400 **ve
satır hâlâ duruyor**), `:347-349` (yanlış parola → aynı), `:358-359` (doğru parola →
satır **silindi**), `:293-313` (çapraz kullanıcı 404 ≡ var olmayan 404, `requestId`
çıkarılarak `toStrictEqual`), `:396-416` (step-up'sız revoke-all sonrası oturum
**hayatta**), `:419-429` (çerezsiz üç uç 401). `device-label.test.ts:152-183` — dört
sıra tuzağının her biri **çift** assert ile (`toBe` + `not.toBe`).
`session-ip-and-last-seen.test.ts:147-150` — gerçek IP + üç negatif (loopback/boş).
`sessions-step-up-coverage.test.ts:277-301` — "alan yok" ekseni iki uçta.
Bunların hiçbiri vacuous değil; istisnalar H-1/M-1/M-2'de adlandırıldı.

### 6. `ActiveSessionsController` saflığı + iki desen yan yana — SOMUT KARAR

**Saflık doğrulandı:** controller `useRef`/`Date.now()`/DOM bilmiyor (ölçüm: dosyada
`Date.now` 0 eşleşme, `ref` 0 eşleşme); tüm ref/yan etki erişimi
`ActiveSessionsCard.tsx:136-182`'deki gerçek olay işleyicisinde; `nowMs` saf
`sessionsQuery.dataUpdatedAt` (`:128`). Sonuç tipi discriminated union + `assertNever`
ile exhaustive (`:143-180`) — CLAUDE.md §4 ile birebir uyumlu.

**KARAR: yeni desen DOĞRU olandır; hizalama GEREKLİ ama BU SÜRÜMDE DEĞİL.**
Gerekçe üç ölçüme dayanıyor:
1. Yeni desen keyfi değil, **ölçülmüş bir ESLint kırmızısının** (react-hooks/refs)
   kök çözümü; eski desen o tuzağı **yapısal olarak taşıyor** (deps nesnesi render
   sırasında kurulup callback'lerle ref kapatmaya davet ediyor).
2. Yeni desen controller'ı React'ten tamamen bağımsız kılıyor → testleri
   `environment: 'node'`'da kalıyor (ikisi de bugün öyle, ama eskisi bunu
   tesadüfen koruyor).
3. `TwoFactorManageController`'ı dönüştürmek **T-017'nin kapsamı dışıdır**
   (CLAUDE.md §10.13 — "yolum üstündeydi" refactor yasak) ve lint bugün yeşil, yani
   acil bir kusur yok.

→ **L-4 olarak ROADMAP teknik borcuna**: "`TwoFactorManageController`'ı
`ActiveSessionsController`'ın Outcome desenine hizala (callback'leri deps'ten çıkar)."
Yön **eski → yeni**, tersi değil.

### 7. `device-label.ts` sıra bağımlılıkları — yorum mu test mi?

**TESTLE korunuyor, yalnızca yorumla değil.** Dördünün hepsi ayrı ayrı pinli ve her
biri **negatif** assert de taşıyor: `device-label.test.ts:152-156` (Edg/ → `edge`,
`not.toBe('chrome')`), `:159-163` (Chrome/ → `chrome`, `not.toBe('safari')`),
`:166-170` (Android → `android`, `not.toBe('linux')`), `:179-183` (iPhone → `ios`,
`not.toBe('macos')`). Ayrıca `:252-256`'da bir "vacuity referansı" (UA'nın gerçekten
her iki alt dizeyi içerdiğini doğrular) var — testin kendi ön kabulünü pinliyor. İyi iş.

**`assertNever` tamlık borcu — TEMİZE ÇIKARIYORUM.** `resolveBrowserFamily`/
`resolveOsFamily` `if` zinciri + `return 'other'` ile bitiyor, yani enum büyürse
derleyici uyarmaz. **Ama** sapma mekanik olarak yakalanır: `device-label.test.ts:22`
(`deviceBrowserSchema.options` → `toHaveLength(8)`), `:26` (`toHaveLength(7)`) ve
admin tarafında `DEVICE_BROWSER_LABEL_KEY_COUNT === DEVICE_BROWSER_WIRE_OPTION_COUNT`
(`active-sessions-controller.test.ts:40,44`). Enum büyümesi **üç** testi kırmızıya
düşürür. `if` zincirini `switch`+`assertNever`'a çevirmek burada mümkün değil
(girdi `string`, enum değil) — doğru çözüm zaten kardinalite pini. Borç kaydı
**gerekmiyor**.

### 8. `SessionListReadPortAdapter` katman sınırı — doğru katman mı?

**Evet.** Ölçüm: adaptörde Prisma importu **0** (`session-list-read.port.adapter.ts`
import blokları `:39-45`); erişim `SESSION_LIST_READER` token'ı üzerinden
(`:63`). Bu, ESLint R-1 katman 2'nin `AuthPrismaDatabase` yasağına **uyma** değil,
onu **gerektirdiği** tasarım. `updatedAt → lastSeenAt` + `Date → ISO` eşlemesi burada
doğru yerde: tel sözleşmesi (`ActiveSessionWire`) `packages/trpc`'nin, ona dönüşüm
`apps/api`'nin işi — `packages/trpc` `Date` görmeden kalıyor (K5 kuralı 2).
`packages/trpc` → `apps/api` bağımlılığı **yok** (port bildirimi `interface`, uygulama
apps'te) → bağımlılık yönü `apps/* → packages/*` korunuyor, döngü yok.
`session.router.ts:43-51` resolver'ı tek ifade, sıfır dallanma, `as`/`any` yok.

### 9. `AuthModule.exports` üçüncü token'ı — yorum artık gerçeği anlatıyor mu?

**EVET — beyan ↔ gerçeklik tutuyor; po'nun işaretlediği nokta temiz.** Ölçüm:
- `auth.module.ts:26-31` eski red kararını **bayat ilan ediyor** ve hangi kısmının
  ayakta kaldığını ayırıyor ("tam kimlik örneği token'ı HÂLÂ yeniden açılmadı").
- `:32-48` geri almanın gerekçesini + "`security`/`solid` bu kararı DENETLEYECEK"
  notunu taşıyor.
- `:285` `exports: [AUTH_SESSION_READER, SESSION_LIST_READER]` — yorumun söylediğiyle
  **birebir aynı**.
- Daraltmanın **gerçekten** daraltma olduğu doğrulandı: `SessionListReader` tipi
  (`auth.tokens.ts:84-86`) yalnızca `listOwnSessions` taşıyor; `revokeOwnSession`/
  `revokeAllOwnSessions` bu yüzeyden **tipçe erişilemez**.
- Yüzey genişlemesi gerçek bir yapısal kısıttan doğdu (ESLint R-1 katman 2), keyfi
  değil; alternatif (sınıfı export etmek) yazma yüzeyini açardı.

Tek kalan nüans: `auth.module.ts:36-40` ve `auth.tokens.ts:66-79` **aynı gerekçeyi
iki yerde** anlatıyor. Bu bir DRY ihlali değil (yorum, kod değil) ama ikisi ayrı
ayrı bayatlayabilir. Bulgu yazmıyorum.

### 10. Ölü kod / kullanılmayan export + `pathOf` tekrarı — KARAR

**`pathOf` ↔ `splitRouteKey`: DRY ihlali DEĞİL, meşru kapsülleme. S5 doğru karar
verdi.** Gerekçe ölçülerek:
- Tekrarlanan "mantık" iki satırlık `indexOf(' ')`+`slice`; **politika tablosu**
  (gerçek ikinci ayna riski) tekrarlanmadı — S5 `resolveRateLimitPolicy()`'yi çağırdı
  (`sensitive-operations.ts:95`).
- İki fonksiyonun **sözleşmeleri farklı**: `pathOf` (`rate-limit.policy.ts:139-142`)
  toleranslı (boşluk yoksa dizenin tamamı), `splitRouteKey`
  (`sensitive-operations.ts:49-55`) **fail-fast** (fırlatır) ve method+path **ikisini**
  döner. Farklı sebeplerle değişecek iki şeyi birleştirmek daha kötü bir tasarım olurdu.
- → `sensitive-operations.ts:36-38`'deki "S1'e `pathOf`'u dışa açması için küçük bir ek
  tur önerilir" notu **TAKİP EDİLMEMELİ**; o turu açmak iki satır paylaşmak için iki
  farklı hata semantiğini birleştirirdi. Bu notun kendisi ROADMAP borcuna
  **girmemeli** — kapatılmalı.

**Ölü kod / kullanılmayan export taraması (`Grep` ile):** `pathOf` ve
`RATE_LIMITED_ROUTES` export EDİLMİYOR ve edilmemeli (kapsülleme doğru).
`DEVICE_*_COUNT` dörtlüsü (`active-sessions-controller.ts:70-73`) yalnızca testler
tarafından tüketiliyor — bu projenin yazılı emsali (`ERROR_MESSAGES_KEY_COUNT`),
kabul. `resolveSessionIpAddressForCreateHook` (`auth-instance.ts:271-273`) kimlik
fonksiyonu + test için export: **KISS ihlali saymıyorum** — gerçek bir regresyonu
(`clientIp ?? ''`) pinliyor ve testi (`session-ip-and-last-seen.test.ts:74-79`) o
kararı assert ediyor. Yorum satırına alınmış kod, erişilemeyen dal, "sonra
kullanacağız" dosyası: **0**.

⚠ Tek gerçek ölü **yüzey**: `GET /auth/sessions` (REST) artık panelde üretim
tüketicisi olmayan ikinci bir okuma yüzeyi (liste tRPC'ye taşındı) — L-7'de
kayıtlı; T-006'nın K6 HTTP sözleşmesi olduğu için **silinmesini önermiyorum**, ama
AC9 testinin onu üretim yolu sanması bir ölçüm boşluğu.

---

## ÜÇ İŞARETLİ KALEM — AÇIK KARAR

**(1) S8a'nın kapsam dışı üç dosyası — TEMİZE ÇIKAR.** Ölçüldü:
- `helpers/auth-fixture.ts:38-49,79` — **tamamen additive**: `AuthenticatedSession`'a
  `password` alanı eklendi, `{ cookieHeader, userId }` destructuring yapan mevcut
  çağıranlar etkilenmiyor; gerekçe dosyanın kendi yazılı ilkesine dayandırılmış.
- `same-origin-guard.test.ts` — 403 iddialarının **hiçbirine** parola eklenmemiş
  (`:168-184`, `:186-197`, `:215-234`): guard step-up'tan **önce** koşuyor, o testler
  orijinal hâliyle duruyor. Parola **yalnızca** gerçekten gereken tek pozitif vakaya
  eklenmiş (`:236-247`, Referer fallback İZİN VERİR) ve gerekçesi satır içinde yazılı.
  **Hiçbir assert gevşetilmemiş, hiçbir eksen kaybolmamış.**
- Değişiklik "yapısal değişikliği yapan alt görevin işidir" ilkesine uygun; S8a'nın
  "denetlenmeli" talebi karşılandı → **bulgu yok**.

**(2) S11'in `panel-config.ts`'e eklediği iki sabit — TEMİZE ÇIKAR.**
`panel-config.ts:87-95` iki yol sabitini T-016'nın altı 2FA sabitiyle (`:76-85`)
**birebir aynı desende** ekliyor, göreli yol (K5), `VITE_*` yok, `process.env` yok.
Ayrıca `GET /auth/sessions`'ın **neden** eklenmediğini açıkça yazıyor. Doğru dosya,
doğru desen → bulgu yok.

**(3) S9'un jeton tuzağını proaktif önlemesi — TEMİZE ÇIKAR ve ÖRNEK ALINMALI.**
`session-list-read.port.adapter.ts`'in dosya başı yorumunda Prisma sınıf adları
bilerek yazılmamış ("sır taşıyan modeller sabiti, `@arkesoft/db`" diye dolaylı
anılmış). AGENT_BASELINE §5 literal-jeton kuralının doğru uygulanışı.

---

## ÖLÇÜMLER

- **İncelenen dosya:** 39 (api 15 kaynak + 9 test · trpc 4 · db 1 test · errors 1 ·
  admin 9)
- **`any` kullanımı:** **0** (`\bany\b` taraması, 22 dosyalık değişim kümesinde —
  yalnızca `session.router.ts:46`'daki *yorum* metninde "any" kelimesi geçiyor)
- **`@ts-ignore` / `@ts-expect-error`:** **0**
- **Runtime doğrulaması olmayan `as` zorlaması:** **4** (hepsi test dosyalarında,
  `as [string, string]`; 2'si bu sürümde eklendi → L-5)
- **En büyük fonksiyon:** `ActiveSessionsCard()` —
  `apps/admin/src/features/sessions/ActiveSessionsCard.tsx:76-340`, **265 satır**
  (büyük kısmı JSX; karar mantığı controller'a çıkarılmış, iç içe en büyük mantık
  bloğu `handleConfirm` 46 satır). Sunucu tarafında en büyük:
  `SessionsService.revokeOwnSession` **30 satır**.
- **Döngüsel bağımlılık:** 0 (ölçüm: `packages/trpc` → `apps/api` importu yok;
  `sessions.service ↔ step-up.service` tek yönlü; `auth.tokens ↔ sessions.service`
  tek yönlü — token `sessions.service.ts:72`'de tanımlı, modül oradan ithal ediyor)
- **Çekirdekte sağlayıcı dallanması (`if (provider === …)`):** 0
- **Yutulan hata (`catch {}` / hatayı `null`'a çevirme):** 0 —
  `active-sessions-controller.ts:312-314`'teki `catch` hatayı `PanelError{kind:'unknown'}`'a
  **dönüştürüp** kullanıcıya gösteriyor (mevcut `_auth.sign-in.tsx` emsali), sessizce
  devam etmiyor
- **Komut koşturulmadı** (Bash erişimi yok) — taban ölçümler Orkestratör'ün tek temiz
  koşumundan alındı, bu raporda yeniden iddia edilmedi

## DÜZELTME / BORÇ AYRIMI

| Bulgu | SEV | Bu sürümde | ROADMAP borcu |
| ----- | --- | ---------- | ------------- |
| H-1 (⑤ totolojik test) | high | ✅ **zorunlu** | — |
| M-1 (AC9 canlılık pini) | medium | ✅ (tek satır, aynı tur) | — |
| M-2 (sentinel testi yok + saf mapper) | medium | ✅ | — |
| L-1 (şema yorumu yanlış dosyayı gösteriyor) | low | yolu üstündeyse | ✓ |
| L-2 (yanıltıcı test adı) | low | yolu üstündeyse | ✓ |
| L-3 (`INITIAL_STATE` tekrarı) | low | — | ✓ |
| L-4 (iki kontrolcü deseni) | low | — | ✓ |
| L-5 (test içi `as` zorlaması) | low | — | ✓ |
| L-6 (bayat satır referansı) | low | yolu üstündeyse | ✓ |
| L-7 (AC9 üretim okuma yolunu ölçmüyor) | low | — | ✓ |

**Kapatılması gereken not (borç DEĞİL, iptal):** `sensitive-operations.ts:36-38`'in
"S1'e `pathOf`'u dışa açması için ek tur" önerisi — inceleme noktası 10'daki gerekçeyle
**takip edilmemeli**.
