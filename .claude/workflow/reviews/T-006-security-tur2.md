# T-006 — security gate, Tur 2 (FIX turu 1 sonrası)

- **Tarih:** 2026-10-29
- **Sürüm:** ROADMAP v0.0.5 (Kimlik doğrulama — Better Auth)
- **Dal:** `main`, commit atılmadı (83 dosya izlenmiyor/değişmiş)
- **Araç:** `Bash` VAR. Her iddia ya komut çıktısı ya kütüphane kaynağı okuması ile
  işaretlendi. Koşulmayan komut "çalıştırılmadı" yazıldı. **Hiçbir çıktı uydurulmadı.**
- **Prob dosyaları:** `apps/api/src/zzsecprobe/**` (2 tip probu) ·
  `apps/api/src/__tests__/zzsecprobe{2,3,4,5}.test.ts` (5 davranış probu) ·
  `apps/api/zz-redis-probe{,2}.mjs` — **HEPSİ SİLİNDİ**, `apps/api/dist/zzsecprobe/`
  derleme kalıntısı da silindi; `git status | grep -iE 'zz|secprobe'` → **boş**.

```
GATE: security
SONUÇ: FAIL
```

**FAIL gerekçesi (AGENT_BASELINE §4, mekanik):** 2 `high` + 3 `medium`.
`critical` **yok** — çapraz kiracı sızıntısı, kimlik doğrulama atlatma veya
kimlik bilgisi sızıntısı **ölçülerek arandı ve bulunamadı**.

---

## 0. Tur 1 raporu DİSKTE YOK — kapsam uyarısı

`.claude/workflow/reviews/T-006-security-tur1.md` **mevcut değil** (`ls` ile
doğrulandı; dizinde `T-006-qa-tur1.md`, `T-006-solid-tur1.md`,
`T-006-solid-tur2.md` var). Tur 1 kota kesintisiyle yarıda kaldığı için rapor
diske yazılamamış. Bu yüzden:

- **F1(a), F1(b), F2, F3, F4, F5, F6** → handoff'ta adlandırıldıkları için
  **bağımsız olarak yeniden ölçüldü**, durumları aşağıda.
- Handoff "3 high + 3 medium + 4 low" diyor ama **adlandırılmamış 3 medium/low**
  için elimde metin yok → **doğrulanamadı**, uydurmuyorum. Orkestratör o üçünü
  biliyorsa ayrıca sorması gerekir.

---

## 1. Tur 1'in bulgularının durumu

| #                       | Bulgu                                                            | Durum                                                                                       | Kanıt                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1(a)**               | Lint kaçış kapıları (`createPrismaClient` yasak kümesinde değil) | **KISMEN — jeton eklendi ama YENİ ve DAHA GENİŞ bir kapı ölçüldü**                          | `eslint.config.mjs:50-55` dört jeton; ama **S-1**: `db.$transaction` ile yasak jeton **hiç ithal etmeden** `tx.account`/`tx.session` erişimi `tsc` 0 + `eslint` 0                       |
| **F1(b)**               | `AUTH_INSTANCE` export'tan çıkarıldı                             | **KISMEN**                                                                                  | `auth.module.ts:194` `exports: [AUTH_SESSION_READER]`, `AUTH_PRISMA_CLIENT` dışa **kapalı** ✓. Ama dönen nesne hâlâ ham `session.token` taşıyor → **S-6** (`low`)                       |
| **F2**                  | Mail hatası yutuluyor                                            | **KISMEN — "503 gerçekleştirilemez" DOĞRULANDI, ama düzeltme YENİ bir sızıntı açtı**        | Kaynak + ölçüm (§2.1). Sapmanın kendisi kabul edilebilir borç; `causeMessage` **tam e-posta sızdırıyor** → **S-2** (`high`)                                                             |
| **F3**                  | Şifre sıfırlama oturumları öldürmüyor                            | **KAPANDI — uçtan uca ölçüldü**                                                             | §2.3: çerez A **ve** B → 401, sıfırlayan oturum da öldü, eski parola 401                                                                                                                |
| **F4**                  | CSRF/origin `process.env`'e düşüyordu                            | **KAPANDI**                                                                                 | `auth-instance.ts:278-279` `ApiEnv.NODE_ENV`; `NODE_ENV` varsayılanı `development` (`env.ts:67`) → üretim/geliştirmede **açık**; kütüphane kaynağı `origin-check.mjs` doğrulandı (§2.4) |
| **F5**                  | `SameOriginGuard` yok                                            | **KISMEN — guard var, FAIL-OPEN kararı YANLIŞ ve "eşdeğerdir" iddiası ÖLÇÜLEREK ÇÜRÜTÜLDÜ** | §2.2 → **S-3** (`medium`)                                                                                                                                                               |
| **F6**                  | Log deseni uygulanmadı                                           | **KISMEN — iki ayağı eksik**                                                                | `giriş başarısız` + `failureCount` olayı **hiç yok** → **S-4**; olay loglarında `requestId` **yok**, giriş isteğinin satırında `userId` **yok** → **S-5**                               |
| F1 tur1'in asıl değeri  | ADR-0008'in ana iddiası                                          | **İDDİA HÂLÂ YANLIŞ**                                                                       | ADR-0008:100 "`tx.account.findMany()` artık tip hatasıdır… yanlışlıkla yazmak imkânsız" → **S-1 ile ölçülerek çürütüldü**                                                               |
| Adlandırılmamış 3 bulgu | —                                                                | **doğrulanamadı** (tur 1 raporu diskte yok)                                                 | §0                                                                                                                                                                                      |

---

## 2. Raporun en kritik dört parçası

### 2.1 F2 — "503 gerçekleştirilemez" DOĞRU; sapma kabul edilebilir; AMA düzeltme sır/PII sızdırıyor

**(1) İddia bağımsız doğrulandı — kaynak okuması.**
`better-auth@1.7.14`, `dist/context/create-context.mjs:215-226`:

```js
async runInBackgroundOrAwait(promise) {
  try {
    if (options.advanced?.backgroundTasks?.handler) {
      if (promise instanceof Promise) options.advanced.backgroundTasks.handler(
        promise.catch((e) => { logger.error("Failed to run background task:", e) }))
    } else await promise
  } catch (e) { logger.error("Failed to run background task:", e) }
}
```

**İKİ dalın İKİSİ de yutuyor:** handler tanımlıysa `promise.catch()` reddi
handler'a **ulaşmadan** tüketiyor; tanımlı değilse `try/catch` tüketiyor.
Mail gönderen dört çağıran da bu fonksiyondan geçiyor (`grep`):
`api/routes/sign-up.mjs:245` · `api/routes/password.mjs:82` ·
`api/routes/email-verification.mjs:201` ve `:266`.
→ **`backend` HAKLI. Hiçbir yapılandırmayla 503 üretilemez.**

**(2) Sapma kabul edilebilir mi? Kısmen — `low` borç, güvenlik bulgusu DEĞİL.**
Gözlemlenebilirlik düzeldi, kullanıcı deneyimi düzelmedi: kayıt **200** dönüyor
(ölçüldü: `PROB1_STATUS=200`), satır oluşuyor, kullanıcı "e-posta yolda"
sanıyor, architect'in kurtarma yolu (`/auth/send-verification-email`) için
**tetikleyici yok** (UI v0.0.7). Bu bir **güvenlik** açığı değil (sızıntı yok,
yetki atlatma yok, para kaybı yok) — ürün davranışı sapması. Bu yüzden F2'nin
bu ayağını `high` tutmuyorum: **`low` borç**, sahibi `docs` (akışı yaz) +
`architect` (HATA SINIFLARI tablosundaki 503 satırını gerçekle uyumla veya
senkron gönderimi BA hook zincirinden çıkarmayı v0.0.11'e bağla).

**(3) `causeMessage` sır/PII sızdırıyor mu? EVET — ÖLÇÜLDÜ.**
Prob: alıcıyı `550 5.1.1 <adres>: Recipient address rejected` ile reddeden
asgari bir SMTP sunucusu kuruldu (`net.createServer`), `apiEnv.SMTP_PORT` ona
yönlendirildi, `POST /auth/sign-up/email` atıldı, pino bellek stream'i tarandı:

```
PROB1_STATUS=200
PROB1_LOG={"level":"error",...,"causeCode":"MAIL_DELIVERY_FAILED",
  "causeMessage":"Can't send mail - all recipients were rejected: 550 5.1.1
  <f2leak-d67fbce1-fa7@arkesoft.test>: Recipient address rejected: User unknown",
  "msg":"Failed to run background task:"}
PROB1_RAW_EMAIL_IN_LOGS=true
```

**Tam e-posta adresi ham olarak log'a yazıldı.** → **S-2** (`high`).

### 2.2 F5 — FAIL-OPEN kararı YANLIŞ; "delege uçların ZATEN aldığı korumanın EŞDEĞERİ" iddiası ÖLÇÜLEREK ÇÜRÜTÜLDÜ

**Ölçüm (gerçek HTTP, gerçek Postgres):** iki oturum açıldı, ikincisinin
çereziyle `Origin` **ve** `Sec-Fetch-Site` **hiç gönderilmeden**
`POST /auth/sessions/revoke-all`:

```
PROB3_REVOKE_ALL_NO_HEADERS=200
PROB3_OTHER_SESSION_AFTER=401      ← mutasyon GERÇEKTEN oldu, sahte-200 değil
PROB3_SEC_FETCH_LIE=200            ← Sec-Fetch-Site: same-origin güvenle kabul ediliyor
```

**Asıl bulgu burada:** `same-origin.guard.ts:3-5` bu guard'ı "Better Auth'un
delege ettiği uçların **ZATEN aldığı** korumanın KENDİ uçlarımızdaki
**EŞDEĞERİ**" diye tanımlıyor. Kütüphane kaynağı
(`dist/api/middlewares/origin-check.mjs`, `validateOrigin`) bunun **yanlış**
olduğunu gösteriyor:

```js
const originHeader = origin || headers.get("referer") || ""
const useCookies = headers.has("cookie")
...
if (!(forceValidate || useCookies)) return
...
if (!originToValidate || originToValidate === "null")
  throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.MISSING_OR_NULL_ORIGIN)
```

İki ölçülmüş fark:

1. **İstek `Cookie` TAŞIYORSA** (yani CSRF'in tanımı gereği tek ilgili durum)
   Better Auth, `Origin` **ve** `Referer` yokken **403 ile REDDEDER** —
   **fail-CLOSED**. Bizim guard aynı dalda **fail-OPEN**.
2. Better Auth `Origin` yokken **`Referer`'a düşer**; bizim guard `Referer`'ı
   **hiç okumuyor** (`same-origin.guard.ts:54-62`).

→ Guard, taklit ettiğini söylediği korumadan **tam olarak önemli olan dalda
daha zayıf**. "Eşdeğeri" iddiası dosya yorumundan **çıkarılmalı veya karar
fail-closed'a çevrilmeli**.

**"Test uyumluluğu bir güvenlik kararının gerekçesi olabilir mi?" → HAYIR.**
CLAUDE.md §10.6 testi gevşetmeyi yasaklıyor; burada tersi yapıldı — **kontrol**
testler için gevşetildi, ki bu daha kötüdür (test gevşetmesi görünür, kontrol
gevşetmesi görünmez). Ve maliyet ölçülebilir biçimde küçük: fail-closed kriteri
"**`Cookie` başlığı VAR ama `Origin`/`Referer` ikisi de YOK → reddet**" olursa
üretim davranışı tarayıcı gerçeğiyle birebir örtüşür; test tarafında gereken şey
çerez gönderen supertest çağrılarına `.set('Origin', env.AUTH_BASE_URL)`
eklemek — **tarayıcının zaten yaptığı şey**. Bu bir güvenlik ödünü değil, test
yardımcısı işidir.

**Tarayıcı gerçeği (spesifikasyon, ölçüm değil — bu satır "ölçülmedi"):**
`Origin`, GET/HEAD dışındaki tüm isteklerde gönderilir; klasik çapraz-site
`<form method=POST>`'ta modern tarayıcıların hepsi gönderir.
`Sec-Fetch-Site` Chrome 76+/Firefox 90+/Safari 16.4+ — **tüm modern
tarayıcılarda var ama evrensel değil** (eski Safari/IE, bazı WebView'lar yok).
Bu yüzden `medium`, `high` değil: somut istismar **Origin göndermeyen bir
UA** gerektiriyor.

**Somut senaryo:** kiracı `kiraci.arkesoft.app`'in HTML'ine sahip (ürünün tüm
önermesi bu). Çerez `Domain=.arkesoft.app` + `SameSite=Lax` →
`kiraci.arkesoft.app` → `panel.arkesoft.app` **AYNI SİTE**, top-level POST'ta
çerez **gönderilir**. `Origin` göndermeyen bir UA ile kurban o sayfayı açar,
otomatik gönderilen `<form method=POST action=".../auth/sessions/revoke-all">`
guard'dan geçer → kurbanın **tüm panel oturumları silinir** (zorla çıkış /
kullanılamazlık), tekrarlanabilir. `revoke` (gövdede `sessionId` ister) ve
`sessions` (okuma, CSRF yanıtı okuyamaz) için etki yok; delege uçlar BA'nın
fail-closed dalıyla korunuyor.

### 2.3 F3 — KAPANDI (uçtan uca, çoklu oturum dahil)

```
PROB2_LIST_BEFORE=200 [iki oturum]
PROB2_RESET_STATUS=200             ← sıfırlama çerez A İLE gönderildi
PROB2_AFTER_A=401 PROB2_AFTER_B=401  ← sıfırlayan oturum DA öldü
PROB2_OLD_PASSWORD_SIGNIN=401
```

pino'da iki ayrı `oturum sonlandırıldı` satırı (iki `sessionId`) görüldü.
`sign-out`/`revoke`/`revoke-all`/`suspended`/`deletedAt` yolları **bozulmadı**:
`pnpm test` **494 yeşil** (41+166+287), `pnpm test:isolation` **15 yeşil**.

### 2.4 solid M-2 — Redis: oran sınırlama FAIL-CLOSED; boş mesaj iddiası DOĞRU ama GÜVENLİK bulgusu DEĞİL

**Önce bir ölçüm uyarısı (S-9):** `docker stop arkesoft-redis` Redis arızasını
**simüle etmiyor** — bu makinede **host seviyesinde ikinci bir `redis-server`**
(PID 1445) 127.0.0.1:6379 **ve** [::1]:6379'u dinliyor. Konteyner durdurulmuş
hâlde `PING` → `+PONG`, `EVAL` → 17 ms'de başarılı, `/health/ready` → **200**.
Bu yüzden ölçümü ulaşılamaz bir URL ile (ham `AppModule`, `createTestApp`'in
flush'ını atlayarak) yaptım:

```
PROB6_signin=500 body={"code":"INTERNAL_ERROR","message":"errors.internal.unknown",...}
PROB6_signup=500 body={"code":"INTERNAL_ERROR",...}
PROB6_HEALTH_READY=503   (context: {"checks":{"database":"up","redis":"down"}})
```

→ **FAIL-CLOSED.** Sayaç yazılamadığında istek **geçmiyor**, reddediliyor.
solid M-2'nin "oran sınırlama fail-open mu olur" sorusunun cevabı **hayır**.
Kalan iki kusur güvenlik değil: (a) ioredis hatası `AppError`'a sarılmıyor →
503/`isRetryable` yerine 500 `INTERNAL_ERROR` (**S-7**, `low`); (b) boş mesaj
iddiası **doğrulandı**:

```
redis://localhost:6399  | AggregateError | messageLen=0 | message=""
                        | errors=['connect ECONNREFUSED ::1:6399','connect ECONNREFUSED 127.0.0.1:6399']
redis://127.0.0.1:6399  | Error          | messageLen=35 | "connect ECONNREFUSED 127.0.0.1:6399"
```

`.env:31` `REDIS_URL=redis://localhost:6379` → **çift yığın biçim, yani canlı
yapılandırma tam bu arıza modunda**; `redis.module.ts`'in
`logger.warn({ errorMessage: error.message })` satırı operatöre
`errorMessage: ""` gösterir. **Gözlemlenebilirlik kaybı GERÇEK ve ÖLÇÜLDÜ**,
ama fail-open **değil** → **S-8** (`low`). solid'in
`errors/describe-error-cause.ts` önerisi güvenlik gerekçesiyle değil,
olay müdahalesi gerekçesiyle haklı.

---

## BULGULAR

### [SEV: high]

**S-1** — `apps/api/src/prisma/prisma.service.ts:72` ·
`packages/db/src/client.ts:82` ·
`packages/db/src/__tests__/type-pins/auth-model-narrowing.pin.ts:44-50` ·
`docs/adr/0008-...md:50,100` — **R-1'in BİRİNCİL (derleme zamanı) katmanı
`db.$transaction` üzerinden atlatılıyor; ADR-0008'in ana iddiası ölçülerek
yanlış.**

`AppPrismaDatabase = Omit<PrismaDatabase, 'account'|'session'|'verification'>`
yalnızca **üç anahtarı** düşürür. `$transaction` **korunur** — ve projenin
kendi **pozitif** tip pini (`pinAppPrismaDatabaseRetainsCoreMethods`) bunu
açıkça **garanti eder**. Ama `$transaction`'ın callback parametresi
`Prisma.TransactionClient`'tır ve **daraltılmamıştır**: üç sır taşıyan delegeyi
İÇERİR.

**Ölçüm (prob dosyası `apps/api/src/zzsecprobe/f1-escape.ts`, muafiyet DIŞI dizin):**

```ts
import type { PrismaService } from '../prisma/prisma.service.js'
export function probeA(p: PrismaService): Promise<unknown> {
  return p.db.$transaction(async (tx) => tx.account.findMany())
}
export function probeA2(p: PrismaService): Promise<unknown> {
  return p.db.$transaction(async (tx) => tx.session.findMany({ select: { token: true } }))
}
export function probeB(p: PrismaService): Promise<unknown> {
  return p.db.$queryRaw`SELECT password FROM account`
}
```

`pnpm exec tsc --noEmit` → **exit 0, 0 hata**.
`pnpm exec eslint src/zzsecprobe/f1-escape.ts` → **exit 0, 0 hata**.
**Yasak jeton ithal edilmedi** (`PrismaDatabase`/`AuthPrismaDatabase`/
`AUTH_SECRET_BEARING_MODELS`/`createPrismaClient` **yok**), `any`/`as`/
`@ts-ignore`/`@ts-expect-error` **yok**. İki katman da sessizce geçti.

Ek ölçüm: `withTenant(p.db, …)` **derlenmiyor** (`@ts-expect-error` gerçekten
tetiklendi) → yetkili yol doğru daraltılmış; açık olan **tam olarak
yetkisiz-ama-engellenmemiş** yol. Yasak kümesinde **olmayan** diğer jetonlar:
`TransactionClient`, `Prisma` (namespace), `withTenant` — üçünün importu da
lint'ten geçiyor (ayrıca ölçüldü).

**İstismar senaryosu (kim, hangi girdiyle, ne elde eder):** v0.0.6+ geliştiricisi
(saldırgan değil, **kendi ekibimiz**) kiracı kapsamlı bir uçta çok adımlı bir
sorgu yazacak. Prisma'nın standart deyimi `prismaService.db.$transaction(...)`
ve tip pini onun **kullanılabilir olduğunu garanti ediyor**. `tx` tam istemci
olduğu için `tx.account.findMany()` veya
`tx.session.findMany({select:{token:true}})` **derlenir, lint'ten geçer,
inceleme dışında hiçbir kapı uyarmaz**. Platformdaki **tüm parola hash'leri ve
oturum belirteçleri** o uca döner (uç kiracı kapsamlı olduğu için kiracı
yöneticisinin erişebileceği bir yanıt gövdesine girebilir) → **platform çapında
hesap ele geçirme**. Bu, PM riski 1'in birebir kendisidir ve ADR-0008:100 onu
"artık **derlenmiyor**, yanlışlıkla yazmak **imkânsız**" diye kapatmış sayıyor.
ADR-0008:113'ün kabul ettiği kalan risk yalnızca **`$queryRaw`**'dır;
**tipli `$transaction` delegesi kabul edilen risk listesinde YOK.**
ADR-0008:101'in kendi uyarısı burada ihlal ediliyor: "belgelenmiş ama
gerçekleşmeyen bir kontrol, hiç olmayandan daha tehlikelidir."

**Önerilen düzeltme (üç seçenek, biri yeter):** (a) `AppPrismaDatabase`'in
`$transaction` üyesini de daralt — callback parametresi
`TenantTransactionClient` olacak şekilde yeniden beyan et (`Omit` + kesişim);
(b) `$transaction`'ı `AppPrismaDatabase`'ten **tamamen** düş (tüm transaction'lar
`PrismaService.withTenant()`'tan geçsin — mimari niyet zaten bu) ve pozitif tip
pinini **negatife** çevir; (c) en azından `auth-model-narrowing.pin.ts`'e
`@ts-expect-error`'lu bir **negatif pin** ekle (`db.$transaction(tx => tx.account)`)
ki boşluk kapanana kadar CI'da **görünür** olsun. `$queryRaw` ayağı ADR'de zaten
kabul edilmiş durumda bırakılabilir.
— **Sorumlu: S2 (`db`, `packages/db/src/client.ts` + tip pini), architect
(ADR-0008:50/100 metni ve "NE KAPANDI" tablosu)**

---

**S-2** — `apps/api/src/auth/auth-instance.ts:147-185` (`extractErrorMessage` +
`describeBetterAuthLogCause`) · `packages/errors/src/redaction.ts:58-82` —
**F2'nin düzeltmesi, kullanıcının TAM e-posta adresini pino log'una ham olarak
yazıyor. AC8 ve CLAUDE.md §4/§10.7 doğrudan ihlali — bu bir REGRESYON, FIX
turunun kendisi açtı.**

`describeBetterAuthLogCause` `AppError` dalında `extractErrorMessage(cause.cause)`
ile **ham SMTP/nodemailer hatasının `.message`'ına** iniyor ve onu
`causeMessage` alanına **olduğu gibi** koyuyor. `PINO_REDACT_PATHS`
**yol tabanlıdır** — serbest metin bir dizenin **içindeki** adresi
yakalayamaz; `causeMessage` zaten listede de yok. Dosya başı yorumu
(`:54-58`) "yalnızca `.code`/`.message` dizeleri okunur, bu yüzden AC8
BOZULMAZ" diyor — **yanlış öncül**: AC8 ham parola/token'ın yanı sıra
**"tam e-posta"**yı da açıkça yasak kümesine koyuyor, ve sağlayıcı mesajı tam
o adresi taşıyor.

**Ölçüm:** §2.1(3). Alıcıyı reddeden SMTP sunucusu → `PROB1_LOG` satırında
`<f2leak-d67fbce1-fa7@arkesoft.test>`, `PROB1_RAW_EMAIL_IN_LOGS=true`,
istek yine **200**.

**İstismar/olay senaryosu:** Saldırgan gerekmiyor — **her** mail teslim
başarısızlığı (yanlış yazılmış alan adı, greylisting, dolu posta kutusu,
sağlayıcı reddi, kurumsal filtre) müşterinin tam adresini log hattına yazıyor.
Loglar Loki/Sentry'ye gidiyor (CLAUDE.md §2 yığını): veritabanından **farklı**
saklama süresi, **farklı** erişim listesi, KVKK silme talebi akışının
**kapsamadığı** bir kopya. Loki'ye okuma erişimi olan bir operatör/alt yüklenici
(veya Sentry hesabı ele geçirilirse saldırgan) **müşteri e-posta listesini**
toplar. Ayrıca `request-password-reset` ucu herkese açık ve oran sınırlı olsa da
3/saat/e-posta + 10/saat/IP ile **hedefli** sorgulanabilir: var olmayan bir
adrese istek mail denemesi doğurmaz, var olana doğurur → teslim hatası
üretilebilen adresler log'a ham düşer.
**İleri risk (ölçülmedi, yapısal):** aynı alan, SMTP AUTH kullanan bir üretim
sağlayıcısının `535 ... authentication failed` yanıtını da aynı yolla
loglayacak; bugün `SMTP_USER`/`SMTP_PASSWORD` **yok** (Mailpit auth istemiyor),
bu yüzden bugün kimlik bilgisi sızmıyor — ama ilk gerçek sağlayıcıda bu alan
**kimlik bilgisi taşıyan** bir kanal olur.

**Niçin `critical` değil:** sızan veri kiracılar arası değil, kimlik bilgisi
değil ve isteği yapanın **kendi** adresi; hedef bir iç log deposu, açık internet
değil. Ama açıkça yazılı bir kabul kriterinin (AC8) ve §10.7'nin ihlali →
`high`.

**Önerilen düzeltme:** `causeMessage`'ı **sağlayıcı serbest metni olarak kabul
etme**. En küçük düzeltme: `describeBetterAuthLogCause`'un döndürdüğü mesajı
`packages/errors`'a eklenecek bir **içerik düzeyinde** maskeleyiciden geçir
(e-posta deseni → `maskEmail()`); tercih edilen düzeltme: `causeMessage`'ı
tamamen bırak ve yalnızca `causeCode` + `cause.constructor.name` +
(nodemailer'ın yapılandırılmış `error.code`/`error.responseCode` gibi)
**allowlist'lenmiş** alanları logla. `PINO_REDACT_PATHS`'e `causeMessage`
eklemek **yetmez** (alanı tümden siler, F2'nin kazandığı teşhisi geri alır).
AC8'in log yakalama testine **bu vaka** (teslim hatası → ham adres yok)
eklenmeli, yoksa kapı yine sessiz kalır.
— **Sorumlu: S5 (`auth-instance.ts`) + S3 (`packages/errors` maskeleyici) +
S6 (AC8 testine vaka)**

---

### [SEV: medium]

**S-3** — `apps/api/src/auth/same-origin.guard.ts:13-21` (karar + gerekçe) ·
`:54-62` (`detectSameOriginViolation`) — **`SameOriginGuard` fail-open, ve
"delege uçların ZATEN aldığı korumanın EŞDEĞERİ" iddiası kütüphane kaynağı
okunarak ÇÜRÜTÜLDÜ: BA aynı dalda fail-CLOSED, ayrıca `Referer`'a düşüyor.**

Ölçüm, kaynak alıntısı, yargı ve maliyet analizi §2.2'de. Özet:
`Cookie` **var**, `Origin`/`Sec-Fetch-Site`/`Referer` **yok** →
`POST /auth/sessions/revoke-all` **200** ve mutasyon **gerçekleşti**
(diğer oturum 401). Better Auth aynı girdide **403 `MISSING_OR_NULL_ORIGIN`**
atar. Gerekçenin başlığı bir **süreç kısıtı** ("mevcut test paketini
KIRMAMAK") — CLAUDE.md §10.6'nın yasakladığı yönün aynası.

**Önerilen düzeltme:** fail-open'ı **daralt**, kaldırmak zorunda değilsin:
`Origin`/`Sec-Fetch-Site` **ve** `Referer` üçü de yok **VE istek `Cookie`
taşıyorsa** → ihlal (`missing_origin`, yeni `SameOriginViolationReason` üyesi;
`assertNever` zaten exhaustive tutuyor). Çerez taşımayan istek etkilenmez →
araçlar/sağlık probları kırılmaz. `Origin` yokken `Referer`'ın origin'ine
düşülsün (BA'nın aynı sırası). Test tarafında, çerez gönderen supertest
çağrılarına `.set('Origin', <AUTH_BASE_URL>)` — tarayıcının zaten yaptığı şey;
`auth-fixture.ts`/`create-test-app.ts`'te tek yardımcıyla toplanabilir.
Ayrıca dosya başı yorumundan **"EŞDEĞERİ" iddiası silinmeli** veya
"delege uçlardan **daha zayıf**" diye düzeltilmeli. solid L-4 (çoğul `Origin`
başlığı) aynı düzeltmede kapanır — şiddet takdirim: `low`, aynı dalda ucuz.
— **Sorumlu: S6 + architect (kararın onayı)**

---

**S-4** — `apps/api/src/auth/auth-instance.ts` (olay listesi) ·
T-006 "LOG DESENİ" — **architect'in BAĞLAYICI olay listesindeki
`warn giriş başarısız (reason, failureCount)` olayı HİÇ YOK; başarısız giriş
denemeleri yapılandırılmış bir kayıt BIRAKMIYOR.**

**Ölçüm:** `grep -rn "failureCount" apps packages` (node_modules dışı) →
**0 satır**. `grep -rn "başarısız" apps/api/src` → eşleşenler yalnızca Redis
quit, mail cause, tenant çözümü ve test başlıkları; **giriş** olayı yok.
Gerçek akışta ölçülen tek iz Better Auth'un kendi satırı:
`{"level":"warn","time":...,"service":"api","version":"0.0.4","msg":"Invalid password"}`
ve `...,"msg":"User not found"` — İngilizce kütüphane metni, **`userId` yok,
`emailMasked` yok, `reason` yok, `failureCount` yok, `requestId` yok** (S-5).

**Saldırı senaryosu:** Saldırgan kurban hesabına eşik altında (4 deneme/15 dk)
parola denemesi yapar, veya 500 farklı hesaba hesap başına 1 deneme (credential
stuffing — hesap sayacı hiç tetiklenmez, IP sayacı 20/15dk ile yavaşlatır ama
dağıtık IP'de o da yok). `warn oran sınırı aşıldı` **hiç üretilmez**, çünkü eşik
aşılmaz. Sonuç: kampanya **tamamen sessiz** geçer; uyarı kuralı yazılacak bir
alan yok, olaydan sonra "hangi hesaplar hedeflendi" sorusu **cevaplanamaz** ve
v0.0.15'in anomali tespiti besleyecek veriyi bulamaz. CLAUDE.md §10.18'in
ruhu (müşteri verisi üzerinde denetim kaydı) ve architect'in açık kararı
karşılanmıyor.

**Önerilen düzeltme:** `databaseHooks` ile gözlemlenemediği için
(başarısızlıkta satır yazılmaz) olayı **`RateLimitGuard`/interceptor'ın
bildiği yerden** üret: `RateLimitAccountResetInterceptor` zaten yanıt durumunu
`'finish'`te görüyor — 401/403 ise `logger.warn({ reason: <status→kod>,
failureCount: <sayaç değeri>, emailMasked: maskEmail(accountValue) },
'giriş başarısız')`. `checkAndIncrement` sayaç değerini **zaten** biliyor
(`count`), yalnızca `RateLimitCheckResult`'a additive bir alan gerekiyor.
— **Sorumlu: S8 (sayaç alanı + olay) veya S5/S6 (BA logger köprüsünü
`reason`/`emailMasked` ile zenginleştir)**

---

**S-5** — `apps/api/src/auth/auth-instance.ts:133,298,309,315`
(`logger` = ROOT logger) · `apps/api/src/auth/auth-exempt-paths.ts:35-45` —
**Bu sürümün en güvenlik-ilgili dört olayı `requestId` TAŞIMIYOR; giriş
isteğinin kendi satırı da `userId` TAŞIMIYOR → olay ile istek
İLİŞKİLENDİRİLEMİYOR.**

**Ölçüm (gerçek NDJSON, probdan):**

```
{"level":"info",...,"userId":"JoGcmN…","sessionId":"NB4y3E…","msg":"giriş başarılı"}
{"level":"info",...,"requestId":"req_735912be…","method":"POST",
 "handler":"AuthController.delegate","statusCode":200,"msg":"istek tamamlandı"}
{"level":"info",...,"emailMasked":"f***@arkesoft.test",
 "messageKey":"auth.emailVerification","msg":"e-posta gönderildi"}
```

İlk satırda `requestId`/`traceId` **yok** (olaylar `createAuthInstance`'a
enjekte edilen **kök** logger'dan çıkıyor, istek kapsamlı child'dan değil).
İkinci satırda `userId` **yok** — çünkü `/auth/sign-in/email`
`AUTH_EXEMPT_PATHS`'te, `AuthContextMiddleware` `{kind:'exempt'}` yazıp
`child({userId})` bağlamadan dönüyor; oysa istek **tam da** bir kullanıcıyı
kimliklendirdi. Üçüncü satırda `userId` de yok. Aynı durum
`kullanıcı kaydı oluşturuldu` ve `oturum sonlandırıldı` için de geçerli
(`userId` var, `requestId` yok). CLAUDE.md §4 "Her kayıtta şunlar bulunur:
… requestId … userId …" karşılanmıyor; F6'nın "`userId` **her** kimlikli
kayıtta var mı" sorusunun cevabı **hayır**.

**Olay müdahalesi senaryosu:** Şüpheli bir IP/zaman penceresi verildiğinde
hangi `giriş başarılı` olaylarını ürettiği **belirlenemez** (olay satırında
korelasyon anahtarı yok, yalnızca zaman damgası var ve yüksek eşzamanlılıkta
zaman eşlemesi belirsiz). Tersi de geçerli: ele geçtiği bilinen bir hesap için
`userId`'den istek zincirine (`requestId` → `istek tamamlandı` → kaynak,
süre, durum) **gidilemez**. v0.0.14'ün `AuditLog`'u bu olayları devralacak;
korelasyonsuz devralırsa borç kalıcılaşır.

**Önerilen düzeltme:** olayları üreten dört çağrı, kök logger yerine
istek kapsamlı logger'ı kullansın — `getRequestContext()` bu noktalarda
**erişilebilir** (BA handler'ı bizim controller'ımızdan, aynı ALS bağlamında
çağrılıyor); istek dışı bir çağrı olasılığı için kök logger'a düşen küçük bir
yardımcı yeter. Ayrıca `AuthContextMiddleware`, `exempt` dalında **da** oturum
çözülebiliyorsa `child({userId})` bağlayabilir (muafiyet "kimlik **zorunlu**
değil" demek, "kimlik **bilinmesin**" demek değil) — veya `sign-in` başarılı
olduğunda `istek tamamlandı` satırına `userId`'yi olay tarafından eklenen
bağlamdan taşı.
— **Sorumlu: S5 (olay logger'ı) + S6 (`AuthContextMiddleware` exempt dalı)**

---

### [SEV: low]

**S-6** — `apps/api/src/auth/auth.tokens.ts:26-31` ·
`apps/api/src/auth/auth.module.ts:194` — F1(b) **metot** yüzeyini daralttı,
**veri** yüzeyini daraltmadı. `AUTH_SESSION_READER` `AuthModule`'den **export
ediliyor**, dolayısıyla `src/auth` **dışındaki** herhangi bir modül enjekte
edebilir ve `getSession()`'ın döndürdüğü nesneden **ham `session.token`**'ı
okuyabilir. **Ölçüm** (prob `apps/api/src/zzsecprobe/f1b-session-token.ts`,
muafiyet dışı dizin): `const r = await reader.getSession({headers});
return r?.session.token` → `tsc` **exit 0**, `eslint` **exit 0**.
**Niçin `low`:** `getSession` yalnızca **verilen başlıklardaki** oturumu
çözer, yani çağıranın zaten sahip olduğu belirteci döner — başka kullanıcının
belirteci elde edilemez. Gerçek kusur, `auth.tokens.ts:14-24`'ün bu yolun
**kapandığı** izlenimi vermesi. **Düzeltme:** ya provider `{ userId,
sessionId }`'e indirgenmiş bir sonuç döndürsün (`AuthContextMiddleware`'in
ihtiyacı tam bu ikisi — `:89-93`), ya da yorum "ham belirteç hâlâ dönüyor,
tüketici sayısı birden fazlaya çıkarsa daraltılmalı" diye dürüstleşsin.
— **Sorumlu: S6**

**S-7** — `apps/api/src/auth/rate-limit/rate-limit.service.ts:141` —
Redis ulaşılamazken ioredis hatası **`AppError`'a sarılmıyor**: istek
**500 `INTERNAL_ERROR`** oluyor (ölçüldü, §2.4), oysa durum tam olarak
`DEPENDENCY_UNAVAILABLE`/503 + `isRetryable: true` sınıfı
(`/health/ready` aynı arızada **doğru** şekilde 503 + `{"redis":"down"}`
döndürüyor — iki yol tutarsız). CLAUDE.md §4 "dış sağlayıcı hataları
adaptör içinde çevrilir; sağlayıcıya özgü tip adaptör dışına çıkmaz"
ihlali. Yan etki: log'daki `rawMessage` alanı ioredis'in tam yığın izini
(mutlak dosya sistemi yolları dahil) taşıyor — tel üzerine **çıkmıyor**
(gövde `code/message/details/requestId` ile temiz, ölçüldü), yalnızca logda.
**Güvenlik yönü olumlu:** davranış **fail-closed**. **Düzeltme:**
`checkAndIncrement` etrafında `try/catch` → mevcut bir `AppError` türevine
(ör. `TenantResolutionFailedError` deseninde bir `RateLimitStoreUnavailableError`,
503 + `isRetryable`) çevir; **fail-open'a çevirme** (o bir `high` olurdu).
— **Sorumlu: S8**

**S-8** — `apps/api/src/redis/redis.module.ts` (`client.on('error')` →
`{ errorMessage: error.message }`) · `apps/api/src/auth/rate-limit/rate-limit.guard.ts:243`
— solid M-2'nin `AggregateError` iddiası **ÖLÇÜLEREK DOĞRULANDI** ve canlı
yapılandırmayı etkiliyor: `.env:31` `redis://localhost:6379` çift yığın
(IPv4+IPv6) → bağlantı hatası `AggregateError`, `message.length === 0`
(ölçüm §2.4). Operatör `errorMessage: ""` görür. **Güvenlik bulgusu DEĞİL**
(oran sınırlama fail-closed, S-7) — ama brute-force savunmasını taşıyan
bağımlılığın arıza nedeni kaybolduğu için olay müdahalesini yavaşlatır.
solid'in `apps/api/src/errors/describe-error-cause.ts` birleştirmesi bu ayağı
kapatır; **S-2'nin maskeleyicisi de aynı modülde durmalı** ki beş kopya
birlikte düzelsin. — **Sorumlu: S8 + architect (yerleşim onayı)**

**S-9** — (ortam, repo defekti değil — **ölçüm uyarısı**) Bu makinede host
seviyesinde ikinci bir `redis-server` (PID 1445, `lsof`: `127.0.0.1:6379`
**ve** `[::1]:6379` LISTEN) çalışıyor ve `arkesoft-redis` konteyneri
durdurulduğunda `PING` → `+PONG`, `EVAL` → 17 ms, `/health/ready` → **200**
veriyor. Sonuçlar: (a) `docker stop arkesoft-redis` Redis arızasını
**simüle etmiyor** — bu yöntemle yapılan hiçbir ölçüm kanıt sayılamaz
(benim ilk denemem bu yüzden geçersizdi, ulaşılamaz URL'e geçtim);
(b) geri alma kolunun (`redis-cli --scan --pattern 'platform:auth:*' | xargs
redis-cli DEL`) hangi örneğe gittiği belirsiz; (c) `platform:auth:*`
sayaçları ve testlerin "gerçek Redis" iddiası compose servisi **yerine** host
örneğine düşüyor olabilir. **Düzeltme:** `infra:up`'a port çakışması kontrolü
(veya compose portunu `6380`'e taşıma kararı) + runbook'a not.
— **Sorumlu: devops**

**S-10** — `apps/api/src/auth/auth-instance.ts:105-109` (`buildAuthLinkUrl`) —
doğrulama ve sıfırlama belirteçleri **URL sorgu parametresinde** (`?token=…`)
taşınıyor; `GET /auth/verify-email` bir **taşıyıcı sırla** çağrılıyor.
Bugün sunucu tarafında sızıntı **yok** (ölçüldü: `istek tamamlandı` satırı
`method` + `handler` taşıyor, **`url` taşımıyor**; `verify-email` isteğinde
gövde/sorgu loglanmıyor). Kalan yüzey istemci ve altyapı tarafında: tarayıcı
geçmişi, açılan sayfadaki üçüncü taraf kaynaklara giden `Referer`, ve
v0.18.0'da API'nin önüne girecek ters vekil/CDN erişim logları (varsayılan
olarak sorgu dizesini **loglar**). **Düzeltme:** v0.0.15'e not — belirteci
POST gövdesine taşıyan bir onay sayfası, ve bugünden itibaren
**devops kısıtı**: ingress/CDN erişim loglarında `/auth/*` için sorgu dizesi
**kaydedilmeyecek**. Belirteç TTL'si (`AUTH_VERIFICATION_TTL_SECONDS`=3600)
ve tek kullanımlılık bu riski sınırlıyor.
— **Sorumlu: architect (v0.0.15), devops (ingress log kısıtı), docs**

---

## 3. Temiz çıkan kontroller (arandı, ÖLÇÜLDÜ, bulunamadı)

| Kontrol                                      | Sonuç                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tenant izolasyonu §7 — 14 madde**          | **Karşılanmayan madde YOK.** İki **bilinçli, belgelenmiş** sapma: madde 2 (`session`/`account`/`verification` için RLS **yapısal olarak** yazılamaz, ADR-0008) ve madde 8 (sayaç öneki `platform:auth:` — R1, kiracı kapsamlı değil, anahtarlar hiçbir kiracı verisi taşımıyor). DB ölçümü: `relrowsecurity`/`relforcerowsecurity` → `tenant_membership` **t/t**, `session`/`account`/`verification`/`app_user`/`tenant` **f/f** — taksonomiyle birebir                                                                                                                                                                                                                                                                                               |
| **IDOR — başka kullanıcının oturumu**        | `POST /auth/sessions/revoke` saldırgan çereziyle kurbanın `sessionId`'si → **404**; var olmayan `sessionId` → **404**; **gövdeler birebir aynı** (`{"code":"SESSION_NOT_FOUND","message":"errors.auth.sessionNotFound","details":{}}`) → K5 ✓. Kurbanın oturumu ölçümden sonra **hâlâ 200** (silinmedi)                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Yetkisiz vs var olmayan ayrımı**           | Yukarıdaki ikisi ayırt edilemez ✓. Allowlist dışı tüm `/auth/*` → **404** (ham Nest mesajı sızmıyor)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Hesap varlığı sızıntısı (A3)**             | **A3 TUTTU.** Aynı e-postayla ikinci kayıt → **200** + **UYDURMA** `user.id` (`csCUmYhH…` ≠ `btsBzolH…`); DB ölçümü: `SELECT email,count(*) FROM app_user WHERE email LIKE 'enum-exists-%'` → **1 satır**, `app_user_email_key` UNIQUE mevcut → ikinci satır **oluşmadı**, sızıntı **yok**. `request-password-reset` var olan vs var olmayan → **birebir aynı** 200 + aynı mesaj. `send-verification-email` → birebir aynı `{"status":true}`. `sign-in` yanlış parola vs bilinmeyen kullanıcı → **birebir aynı** 401 `INVALID_EMAIL_OR_PASSWORD`. Tek ayrım K4'ün **bilinçli kabul ettiği** 403 `EMAIL_NOT_VERIFIED`                                                                                                                                  |
| **Doğrulanmamış hesap (AC5)**                | Giriş → **403 `EMAIL_NOT_VERIFIED`**, `Set-Cookie` **yok** (ölçüldü: `setCookie=false`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Oturum listesi yüzeyi (AC6)**              | `GET /auth/sessions` gövdesi: `{id, createdAt, updatedAt, expiresAt, isCurrent}` — **ham `token`/hash YOK** (ölçüldü)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Ham soket allowlist atlatma**              | Tur 1'in 14 denemesi **tekrarlandı + 4 yeni** = **18**, hepsi `/auth/list-sessions` ve `/auth/get-session` hedefli, geçerli çerezle, gerçek dinleyen porta ham `net` soketiyle: `//auth/…`, `/auth//…`, `/auth/./…`, `…/../…`, `%6cist-sessions`, `%20`, `?x=1`, `#frag`, `/AUTH/…`, `/auth/List-Sessions`, `;a=b`, `%2e%2e`, `..%2f`, `%2f..%2f` → **18/18 = 404, tokenInBody=false**. `http/normalize-request-path.ts` birleştirmesi **atlatma AÇMADI**                                                                                                                                                                                                                                                                                             |
| **Enjeksiyon**                               | `$queryRawUnsafe`/`$executeRawUnsafe` eslint ile yasak (hesaplanmış erişim dahil, `base.js:127-134`); `src` içinde **0** kullanım. `withTenant`'ın `set_config`'i etiketli şablon + bağlı parametre. Mail HTML'inde `escapeHtml()` (`messages.ts:57-63`), `url` sunucu tarafında kuruluyor. Açık yönlendirme: `callbackURL`/`redirectTo` üretim/geliştirmede `isTrustedOrigin`'den geçiyor                                                                                                                                                                                                                                                                                                                                                            |
| **`trustedOrigins` genişlemesi**             | Kütüphane kaynağı (`context/helpers.mjs:60-80`): `trustedOrigins` = **yalnızca** `baseURL` origin'i. `crossSubDomainCookies` listeyi **genişletmiyor** → üretimde kiracı alt alan adından gelen `Origin` delege uçlarda **reddedilir**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **CSRF/origin varsayılanı**                  | `NODE_ENV` varsayılanı `development` (`packages/config/src/env.ts:67`) → `disableOriginCheck`/`disableCSRFCheck` **false** = kontrol **açık**. Fail-closed varsayılan ✓                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Sır loglama / repoya girme**               | `git diff \| grep -niE "(password\|secret\|api[_-]?key\|token\|BEGIN .*PRIVATE KEY)"` **koşuldu**: tek somut değer `.env.example:99` `BETTER_AUTH_SECRET=arkesoft_dev_only_better_auth_secret_change_me_32plus` — **kasıtlı yer tutucu** (`change_me`, dosyanın kendi yorumu `:93` üretimde secret yöneticisi diyor). Kalan tüm eşleşmeler `PINO_REDACT_PATHS` girdileri, Prisma kolon adları (`token`, `password`, `access_token`), Zod alan adları, yorumlar ve test sabitleri. `.env` **gitignore'da** ve izlenmiyor. Özel anahtar / gerçek API anahtarı **yok**. Çalışma loglarında parola/`session.token`/`verification.value`/`Set-Cookie`/`Cookie`/`BETTER_AUTH_SECRET` **görülmedi**; e-posta `emailMasked` ile maskeli — **tek istisna S-2** |
| **KVKK — IP/UA saklanıyor mu**               | **HAYIR.** DB ölçümü: `SELECT length(ip_address), length(user_agent), count(*) FROM session GROUP BY 1,2` → **tek grup: `0, 0, 1174`**. Yani 1174 oturum satırının **tamamında** boş dize; `count(ip_address)=1174` (NULL değil, **boş dize**). Kişisel veri **tutulmuyor** ✓                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Oran sınırlama kapsamı**                   | Dört uç (`sign-in/email`, `sign-up/email`, `send-verification-email`, `request-password-reset`); eşikler modül sabiti (`rate-limit.policy.ts:43-56`), `process.env`/`ApiEnv` okuması **yok**; anahtar HMAC'li, ham e-posta/IP **yok**; artırım kullanıcı aramasından **önce** (varlık-sızdırmazlık)                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Hesap sayacı atlatma denemeleri**          | `email` farklı büyük/küçük harf/boşluk → `trim().toLowerCase()` ile **aynı** anahtar; dizi/nesne/eksik `email` → Zod `safeParse` başarısız → hesap kapsamı atlanır **ama** BA kendi şemasıyla 400 verir, yani **başarılı giriş yolu** açılmaz; `Content-Type` değiştirme → Express ayrıştırmaz → BA boş gövdeyle 400. **Atlatma bulunamadı**                                                                                                                                                                                                                                                                                                                                                                                                          |
| **IP sayacı (`AUTH_TRUSTED_PROXY_COUNT=0`)** | XFF **tamamen yok sayılıyor**, soket adresi kullanılıyor → sahte IP ile sayaç atlatma **yok**. `>0` hâlinde `hops[len-N]` standart semantik (yanlış ayarın riski architect riski 4'te kayıtlı, v0.18.0)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **`x-request-id` enjeksiyonu**               | `resolveIncomingRequestId` (`request-id.ts:33-43`) desen doğrulaması yapıyor, uymazsa **kendi** id'sini üretiyor → log satırı kırma / yanıt başlığı bölme **yok**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **SSRF / dosya yükleme**                     | Bu sürümde kullanıcı verdiği URL'e istek **yok** (tek dış çağrı sabit SMTP host'u; `AUTH_BASE_URL` env'den); dosya yükleme yüzeyi **yok**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Süper admin / impersonation**              | Bu sürümde **yok** (v0.0.14) → denetim kaydı maddesi N/A                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **`pnpm audit`**                             | **critical 0 · high 1 · moderate 0 · low 0** — tek `high` `multer` GHSA-q7qp-rjg7-q26m (geçişli, `@nestjs/platform-express`), T-006 öncesinden, vade **v0.0.16**. **AC11 ✓** (mevcut 1 aşılmadı; `better-auth` + `nodemailer` **yeni zafiyet getirmedi**)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### solid tur 2'nin M-3(2b)'si HAKKINDA — DÜZELTME (`docs`/S9 için bağlayıcı)

solid M-3(2b), `docs/development.md:587-589`'un "kolonlara **boş dize** yazılır,
sütunlar `NULL` değil" cümlesini **uydurma** ilan etti (gerekçe: `schema.prisma:126-127`
`String?` yani nullable). **Ölçüm bunu çürütüyor:** çalışma zamanı davranışı
gerçekten boş dize yazıyor — 1174/1174 satır `length = 0` ve `count()` NULL
saymadığı hâlde 1174 → **değerler `''`, `NULL` değil**. Kolonun **tipi** nullable
olabilir; **yazılan değer** boş dizedir. Yani belge bu noktada **DOĞRU**.
S9 bu cümleyi "düzeltirse" **doğru bir ifadeyi yanlışa çevirir**.
(solid M-3(2a) — "`disableIpTracking` ortam değişkeni" — ve (2c) — "417+ kayıt"
sayısı — eleştirileri **geçerli**: ilki kod sabiti `auth-instance.ts:270`,
ikincisi ölçülmemiş bir sayı. Bugünkü **ölçülmüş** sayı: **1174** oturum satırı.)

---

## ÖLÇÜMLER

| Ölçüm                                                | Değer                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm audit`                                         | **critical 0 · high 1 · moderate 0 · low 0** (`multer`, T-006 öncesi, v0.0.16)                                                                                                                                                                                                                                       |
| `pnpm lint`                                          | **exit 0** — 15/15 görev                                                                                                                                                                                                                                                                                             |
| `pnpm typecheck`                                     | **exit 0** — 15/15 görev                                                                                                                                                                                                                                                                                             |
| `pnpm test`                                          | **exit 0** — **494** test (errors 41 + db 166 + api 287), 43 dosya. Temel çizgi 492 → **+2** (paralel koşan `qa` ajanının yeni dosyası)                                                                                                                                                                              |
| `pnpm test:isolation`                                | **exit 0** — **15** test (db 14 + api 1)                                                                                                                                                                                                                                                                             |
| `pnpm build`                                         | **exit 0** — 12/12                                                                                                                                                                                                                                                                                                   |
| `pnpm format:check`                                  | **exit 1 — 2 dosya:** `.claude/workflow/reviews/T-006-solid-tur2.md` ve `apps/api/src/__tests__/auth-secret-leak-assertion-fragility.qa.test.ts`. **İkisi de bu tur paralel koşan gate ajanlarının (`solid`, `qa`) ürettiği dosyalar**, FIX turunun üretim kodu değil. Üretim/test kaynak ağacının geri kalanı temiz |
| İncelenen dosya (tam okunan)                         | **31** — 15 üretim `apps/api/src/auth/**` · 3 `http/**` · 4 `prisma`/`redis`/`request-context` · 4 `packages/{db,errors,config}/src` · `eslint.config.mjs` · 4 test/helper/pin                                                                                                                                       |
| Okunan kütüphane kaynağı                             | **6** — `better-auth@1.7.14`: `context/create-context.mjs`, `context/helpers.mjs`, `api/middlewares/origin-check.mjs`, `auth/trusted-origins.mjs`, `api/routes/*` (grep), `ioredis@6.0.0` davranış probu                                                                                                             |
| Yazılan/koşturulan prob                              | **7** (2 tip probu + 5 davranış probu) + 2 bağımsız `.mjs` probu — **tamamı silindi**                                                                                                                                                                                                                                |
| Ham soket atlatma denemesi                           | **18** (tur 1'in 14'ü + 4 yeni) → **18/18 404**, hiçbirinde `token` yok                                                                                                                                                                                                                                              |
| Tenant izolasyon listesinden **karşılanmayan** madde | **YOK**. Bilinçli + belgelenmiş sapma: **madde 2** (ADR-0008, yapısal) ve **madde 8** (R1, `platform:auth:`)                                                                                                                                                                                                         |
| Bulgu dağılımı                                       | **critical 0 · high 2 · medium 3 · low 5**                                                                                                                                                                                                                                                                           |
| Çalıştırılmadı                                       | `pnpm test:e2e` (v0.0.19), `pnpm test:visual`, `pnpm test:contract` (bu sürümde konu doğmuyor), Lighthouse/k6 (`perf` koşmuyor), **gerçek üretim SMTP sağlayıcısıyla `causeMessage` kimlik bilgisi sızıntısı** (sağlayıcı yok — S-2'nin ileri riski **ölçülmedi**, yapısal çıkarım)                                  |

---

## FAIL'i kaldıran asgari küme

1. **S-1** — `packages/db/src/client.ts`: `AppPrismaDatabase`'ten `$transaction`'ı
   düş **veya** callback'ini `TenantTransactionClient`'a daralt; tip pinini
   negatife çevir; ADR-0008:100'ü gerçekle uyumla. _(En kritik — ADR'nin ana
   iddiası.)_
2. **S-2** — `auth-instance.ts`: `causeMessage`'ı maskele/allowlist'le;
   AC8 testine "teslim hatası → ham adres yok" vakası.
3. **S-3** — `same-origin.guard.ts`: `Cookie` var + `Origin`/`Referer`/
   `Sec-Fetch-Site` hiçbiri yok → **reddet**; `Referer` fallback; "eşdeğeri"
   iddiasını düzelt; test yardımcısına `Origin`.
4. **S-4** veya **S-5** — ikisinden **biri** kapanırsa medium sayısı 2'ye düşer
   (1–2 medium PASS'tir). İkisi de aynı dosyada ve aynı logger değişikliğiyle
   birlikte kapanabilir — **ikisini birlikte yapmak daha ucuz**.

`low` bulgular teknik borca kaydedilebilir. **S-9 commit öncesi devops'a
bildirilmeli** — aksi hâlde bir sonraki tur `docker stop` ile yapılmış geçersiz
bir Redis ölçümünü kanıt sayar.
