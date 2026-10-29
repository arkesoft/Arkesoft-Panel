# T-006 — security gate, Tur 3 (FIX turu 2 sonrası — SON TUR)

- **Tarih:** 2026-10-29
- **Sürüm:** ROADMAP v0.0.5 (Kimlik doğrulama — Better Auth)
- **Dal:** `main`, commit atılmadı (89 dosya izlenmiyor/değişmiş — başlangıç sayısıyla aynı)
- **Araç:** `Bash` VAR. Her iddia ya komut çıktısı ya kütüphane/üretilen kaynak okuması
  ile işaretlendi. Koşulmayan komut "çalıştırılmadı" yazıldı. **Hiçbir çıktı uydurulmadı.**
- **Prob dosyaları:** `apps/api/src/zzsecprobe/{p5,p6}.ts` (2 tip probu) ·
  `apps/api/src/__tests__/zzsecprobe-tur3{,b}.test.ts` + `zzsec3-{smtp,origin,origin2,ba,logs,redis,redispw}.test.ts`
  (9 davranış probu). **HEPSİ SİLİNDİ.** Ölçüm çıktıları **scratchpad**'e yazıldı
  (`.../scratchpad/{smtp,origin,origin2,ba,logs,redis,redis2,redispw,probe6}.json`).
  Kanıt: `git status --porcelain | wc -l` → **89** (başlangıçla aynı) ·
  `git status --porcelain | grep -iE "zzsec|secprobe"` → **boş** ·
  `find . -iname "*zzsec*"` (node_modules/.git hariç) → **boş** · `git stash list` → **0**.
  `git checkout`/`restore`/`clean`/`stash`/`commit` **hiç çağrılmadı**.

```
GATE: security
SONUÇ: FAIL
```

**FAIL gerekçesi (AGENT_BASELINE §4, mekanik):** 1 `high` + 1 `medium`.
`critical` **yok** — çapraz kiracı sızıntısı, kimlik doğrulama atlatma veya
kimlik bilgisi sızıntısı **ölçülerek arandı ve bulunamadı**.

**Tek `high`, FIX turu 2'nin açtığı yeni bir regresyon DEĞİL** — ADR-0008'in
mekanizmasının **BEŞİNCİ** kaçış kapısı; tur 1/2'de aranmamış, bu turda
handoff'un talimatıyla arandı ve **derleme + lint + çalışma zamanı** üçlüsünde
ölçüldü. Tur 2'nin **on bulgusunun dokuzu KAPANDI** (biri KISMEN).

---

## 1. Raporun en kritik parçası — BEŞİNCİ KAÇIŞ KAPISI: `$extends`

### 1.1 Ölçüm (derleme zamanı)

Prob `apps/api/src/zzsecprobe/p5.ts` (muafiyet DIŞI dizin, şimdi silindi):

```ts
import type { PrismaService } from '../prisma/prisma.service.js'

export function p5a(p: PrismaService): Promise<unknown> {
  return p.db.$extends({}).account.findMany()
}
export function p5b(p: PrismaService): Promise<unknown> {
  return p.db.$extends({}).session.findMany({ select: { token: true } })
}
export function p5c(p: PrismaService): Promise<unknown> {
  return p.db.$extends({}).verification.findMany({ select: { value: true } })
}
export function p5d(p: PrismaService): Promise<unknown> {
  return p.db.$extends({}).$transaction(async (tx) => tx.account.findMany())
}
```

```
pnpm exec tsc --noEmit                        → exit 0, 0 hata
pnpm exec eslint src/zzsecprobe/p5.ts         → exit 0, 0 hata
```

**Sanity kontrolü (bu ölçümün geçerliliği için ZORUNLU):** aynı dizine kasıtlı
bir tip hatası konduğunda `tsc` onu **gördü** →
`src/zzsecprobe/p5sanity.ts(1,14): error TS2322` — yani `tsc` bu dizini
**gerçekten tarıyor**, `p5.ts`'in sessiz geçişi kapsam dışı kalmaktan değil.

**Yasak jeton ithal edilmedi** (`PrismaDatabase`/`AuthPrismaDatabase`/
`AUTH_SECRET_BEARING_MODELS`/`createPrismaClient` **yok**), `any`/`as`/
`@ts-ignore`/`@ts-expect-error` **yok**. **p5d dahil** dördü de geçti — yani
`db`'nin FIX turu 2'de `Omit<>`'a eklediği `'$transaction'` **de** `$extends`
üzerinden **geri geliyor**.

### 1.2 Ölçüm (ÇALIŞMA ZAMANI — tur 1 ve 2'de hiçbir kapı için yapılmamıştı)

Prob `apps/api/src/__tests__/zzsecprobe-tur3.test.ts`: gerçek `createTestApp()`,
gerçek Postgres, `app.get(PrismaService)` → `prisma.db.$extends({})`:

```
PROBE5_RUNTIME={"accountRows":3,
                "totalAccountsPlatformWide":1844,
                "firstHashPrefix":"eb37e01b2c8f","hashLen":161,
                "sessionTokenSample":"slTDHm","sessionRows":3,
                "verificationRows":0,"verificationValueSample":null}
```

- **1844** `account` satırı **platform çapında** sayıldı (`.count()`).
- Gerçek parola hash'leri döndü (**161 karakter**, scrypt).
- `session.token` ham olarak döndü.
- Yani bu bir tip boşluğu **değil**, çalışan bir veri yolu.

### 1.3 Niçin bu kapı DÖRDÜNCÜDEN (ve ADR'nin kabul ettiği `$queryRaw`'dan) DAHA KÖTÜ

**`db`'nin (b) seçeneğini reddetme gerekçesi burada GEÇERSİZ.** `db` şöyle
yazdı (`packages/db/src/client.ts:88-95`):

> Ham `db.$transaction(...)` `PrismaService.withTenant()`'ı atlar ve tenant
> GUC'u (`set_config`) **hiç kurulmaz** → callback daraltılsa bile RLS politikası
> **boş/filtrelenmiş** sonuç döner. Bu, "narrow = güvenli" yanılgısına yol açan
> **SESSİZ bir doğruluk hatası**.

`$extends` yolunda bu **koruyucu yan etki YOK**:
`account`/`session`/`verification` tablolarında **RLS zaten hiç yok** (DB
ölçümü aşağıda: `relrowsecurity` = `f`), dolayısıyla GUC'un kurulmamış olması
**hiçbir şeyi filtrelemiyor**. Sorgu **tam, doğru ve eksiksiz** veri döndürüyor
(1844/1844). Geliştiriciyi uyaracak **hiçbir sinyal yok** — ne tip hatası, ne
lint, ne boş sonuç, ne hata.

`$queryRaw`'dan farkı: `$queryRaw` ADR-0008:113-114'te **açıkça kabul edilmiş
kalan risk**tir ve ham SQL yazmak bir geliştiriciye "burada dikkatli ol" sinyali
verir. `$extends` ise Prisma'nın **birinci sınıf, belgelenmiş, teşvik edilen**
API'sidir (client extensions: soft-delete, computed field, sorgu loglama —
bu projenin v0.0.6+ ihtiyaç duyacağı tam o şeyler) ve **hiçbir uyarı sinyali
taşımaz**.

### 1.4 Boşluğun nasıl gözden kaçtığı — ölçülmüş kanıt

`$extends`, repoda **yalnızca bir yerde** geçiyor: `db`'nin kendi düzeltme
yorumunun **içindeki liste literalinde**
(`packages/db/src/client.ts:117-118` ve `auth-model-narrowing.pin.ts:40-41`):

```
"ITXClientDenyList" = ['$connect','$disconnect','$on','$use','$extends']
  — `$transaction`'ı İÇERMEZ
```

```
grep -rn '\$extends' apps packages docs .claude --include=*.ts --include=*.md \
  | grep -v packages/db/generated
→ yalnızca 2 satır, İKİSİ de yukarıdaki yorum (+ dist kopyası)
```

Yani `db`, `$extends`'in **istemciyi genişleten bir API olduğunu** yazıya
dökmüş (Prisma'nın kendisi onu iç işlem istemcisinden **bu yüzden** düşürüyor),
ama **`AppPrismaDatabase`'in kendisinde** aynı soruyu sormamış. ADR-0008:102'nin
kendi talimatı ("**bu tipi döndüren veya kabul eden hangi başka API var** sorusu
da sorulmalıdır") burada **uygulanmamış**.

Tip pini de boşluğu **açıkta bırakıyor**: `$extends`
`pinAppPrismaDatabaseRetainsCoreMethods`'ta (pozitif) **yok**,
`pinAppPrismaDatabaseDropsTransaction`'da (negatif) **yok** — yani CI'da
**hiçbir yönde** pinli değil.

### 1.5 Üretilen istemci kaynağı (iddianın mekanizması)

`packages/db/generated/internal/class.ts:185-188`:

```ts
$transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => ...): ...

$extends: runtime.Types.Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<OmitOpts>, ExtArgs,
  runtime.Types.Utils.Call<Prisma.TypeMapCb<OmitOpts>, { extArgs: ExtArgs }>>
```

`$extends`'in dönüş tipi `AppPrismaDatabase`'den **türetilmiyor** — Prisma'nın
**TypeMap**'inden yeniden inşa ediliyor. `Omit<>` ile düşürülmüş anahtarlar
TypeMap'te **durmaya devam ettiği** için dönen istemci **tam** yüzeye sahip.
Desen tam olarak ADR-0008:120'nin yazdığı şey: **`Omit<>` anahtar düşürür,
yetenek düşürmez** — ve `$extends` o yeteneği **TypeMap'ten yeniden üretir**.

### 1.6 Diğer aranan yollar — ÖLÇÜLDÜ, KAPALI

| Yol                                                                    | Ölçüm                                                                                                                                                                         | Sonuç                                                                      |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `tx.$extends({})` (`TenantTransactionClient` üzerinde)                 | `tsc` → **TS2339: Property '$extends' does not exist on type 'TenantTransactionClient'**                                                                                      | **KAPALI** — Prisma'nın `ITXClientDenyList`'i `$extends`'i zaten düşürüyor |
| `$on`                                                                  | `$on<V extends LogOpts>`, `LogOpts = never` → çağrılabilir değer **yok**                                                                                                      | **KAPALI** (dönüş tipi tam `PrismaClient` ama erişilemez)                  |
| `$use`                                                                 | Prisma 7.10.1 üretilen `class.ts`'te **hiç yok** (`grep` → 0)                                                                                                                 | **YOK**                                                                    |
| `$connect`/`$disconnect`                                               | `Promise<void>`                                                                                                                                                               | **İLGİSİZ**                                                                |
| `PRISMA_CLIENT` DI yan yolu                                            | Prob `zzsecprobe-tur3b`: başka modülden `@Inject(PRISMA_CLIENT)` → **`Nest can't resolve dependencies of the EvilService`** (`PrismaModule.exports` yalnızca `PrismaService`) | **KAPALI** ✓ temiz kontrol                                                 |
| `AUTH_PRISMA_CLIENT` DI yan yolu                                       | `auth.module.ts:202` `exports: [AUTH_SESSION_READER]` — token dışa **kapalı**                                                                                                 | **KAPALI** ✓                                                               |
| `AUTH_SESSION_READER` veri yüzeyi                                      | `auth.module.ts:126-131` factory **yalnızca** `{userId, sessionId}` döner                                                                                                     | **KAPALI** ✓ (tur 2 S-6 kapandı)                                           |
| **`withTenant` (`@arkesoft/db`) + `Parameters<typeof withTenant>[0]`** | `tsc`+`eslint` **exit 0** (prob `p6`) — ama çalışma zamanı örneği **DI'dan alınamıyor**                                                                                       | **LATENT / ALTINCI KAPI** → `low` bulgu **S3-6**                           |
| `Prisma.TransactionClient` (namespace, yasak kümede değil)             | `tsc`+`eslint` **exit 0** — tam delege erişimi veren bir tip; ama onu **üretecek** örnek yok                                                                                  | **LATENT** (S3-6'nın parçası)                                              |

---

## 2. İkinci kritik parça — ALLOWLIST'İN BAŞKA HATA YOLLARINDAKİ ÖLÇÜMÜ

Tur 2'nin SMTP sunucusu **yeniden kuruldu** (`net.createServer`, `apiEnv.SMTP_PORT`
ona yönlendirildi) ve **BEŞ ayrı arıza modu** denendi. Sahte sunucu, SMTP yanıt
metinlerine **kasıtlı olarak** kimlik bilgisi gömdü
(`probe-smtp-user` / `ProbeP4ssw0rd!`) ve alıcı adresini `550` satırına koydu.
Her koşuda pino bellek stream'inin **tamamı** tarandı.

| #   | Arıza modu                                                                                 | HTTP | ham e-posta | host adı | kimlik bilgisi (kullanıcı) | kimlik bilgisi (parola) | SMTP serbest metni |
| --- | ------------------------------------------------------------------------------------------ | ---- | ----------- | -------- | -------------------------- | ----------------------- | ------------------ |
| 1   | `550 5.1.1 <adres>: Recipient address rejected` (tur 2'nin vakası)                         | 200  | **false**   | false    | false                      | false                   | **false**          |
| 2   | `530/535 ... authentication failed: ... user probe-smtp-user with password ProbeP4ssw0rd!` | 200  | false       | false    | **false**                  | **false**               | **false**          |
| 3   | Selamlama hiç gelmiyor → `greetingTimeout`                                                 | 200  | false       | false    | false                      | false                   | false              |
| 4   | SMTP olmayan çöp yanıt → protokol hatası                                                   | 200  | false       | false    | false                      | false                   | false              |
| 5   | Çözülemeyen host (`no-such-host-zzsec3.invalid`) → DNS hatası                              | 200  | false       | false    | false                      | false                   | false              |

Loglanan **tek** satır (mod 1, aynen):

```json
{
  "level": "error",
  "time": "2026-10-29T17:13:41.802Z",
  "service": "api",
  "version": "0.0.4",
  "causeCode": "MAIL_DELIVERY_FAILED",
  "causeClassName": "Error",
  "providerErrorCode": "EENVELOPE",
  "providerResponseCode": 550,
  "msg": "Failed to run background task:"
}
```

Diğer modlarda aynı şekil: `providerErrorCode` ∈ `{EENVELOPE, EPROTOCOL, EDNS}`,
`providerResponseCode` ∈ `{550, 530, (yok)}`, `causeClassName` = `"Error"`.

**Yargı: `backend`'in allowlist kararı DOĞRU ve ÖLÇÜLEREK ETKİLİ.** Maskeleme
yerine allowlist seçmesinin gerekçesi ("maskeleme yalnızca bilinen bir deseni
yakalar") **doğrulandı**: mod 2'de bir **parola** ve bir **kullanıcı adı** SMTP
serbest metninde geldi — bir e-posta regex'i bunların **hiçbirini** yakalamazdı,
allowlist **ikisini de** tuttu. `causeClassName` (`cause.constructor.name`)
veri **taşımıyor** (beş modun hepsinde `"Error"`).

**Kalan tek yüzey (`low`, S3-4):** `extractProviderErrorFields`
(`auth-instance.ts:217-221`) `record['code']`'u **yalnızca `typeof === 'string'`**
diye doğruluyor — uzunluk/desen sınırı **yok**. nodemailer'ın `.code`'u bugün
enum benzeri (`EENVELOPE`/`ECONNECTION`/`EAUTH`/`EDNS`/`ESOCKET`/`EPROTOCOL`/
`ETIMEDOUT`), ama bir sonraki sağlayıcı adaptörü oraya serbest metin koyarsa
kanal **sessizce yeniden açılır** — ve bu kanalın kapalı olduğunu iddia eden
yorum (`:201-207` "SERBEST METİN DEĞİLDİR ... alıcı/host/kimlik bilgisi
TAŞIYAMAZ") **tipin kendisi tarafından zorlanmıyor**.

---

## 3. `SameOriginGuard` — (a)–(g) ÖLÇÜMLERİ

Gerçek HTTP + gerçek Postgres + gerçek oturum çerezi. (e)–(g) için ham `net`
soketi (`supertest` çoğul başlık ve `Origin: null` gönderemiyor).

| #        | Girdi                                                                    | Ölçülen                                                                                                        | Oturum sonrası                                                      |
| -------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **(a)**  | `POST /auth/sessions/revoke-all` + `Cookie` + **hiç origin başlığı yok** | **403** `{"code":"CROSS_SITE_REQUEST_REJECTED","message":"errors.auth.crossSiteRequestRejected","details":{}}` | **200** (hayatta — sahte-403 DEĞİL)                                 |
| **(b)**  | `GET /auth/sessions` aynı koşul                                          | **200**                                                                                                        | —                                                                   |
| **(c)**  | `POST revoke-all` + `Referer: <AUTH_BASE_URL>/panel/guvenlik`            | **200**                                                                                                        | **401** → mutasyon GERÇEKTEN oldu, `Referer` fallback **çalışıyor** |
| **(d)**  | `Referer: https://evil.example.com/x`                                    | **403**                                                                                                        | —                                                                   |
| **(d2)** | `Referer: evil` (ayrıştırılamaz)                                         | **403**                                                                                                        | —                                                                   |
| **(e)**  | **çoğul `Origin`**: güvenilir **önce**, evil sonra                       | **403**                                                                                                        | 200 (hayatta)                                                       |
| **(e2)** | **çoğul `Origin`**: evil önce, güvenilir sonra                           | **403**                                                                                                        | 200 (hayatta)                                                       |
| **(f)**  | `Origin: null`                                                           | **403**                                                                                                        | 200 (hayatta)                                                       |
| **(g)**  | `Sec-Fetch-Site: same-origin` **yalanı** + hiç `Origin` yok              | **403**                                                                                                        | 200 (hayatta)                                                       |
| **(g2)** | `Sec-Fetch-Site: same-origin` + `Origin: evil`                           | **403**                                                                                                        | 200 (hayatta)                                                       |

**solid L-4 (çoğul `Origin`) ÖLÇÜLEREK KAPANDI — kapsam dışı bırakılmış olsa da.**
Mekanizma: Node'un HTTP ayrıştırıcısı yinelenen `Origin` başlıklarını `", "` ile
**tek dizede birleştirir**, `singleHeaderValue` diziyi görmez ama birleşik dize
güvenilir orijine **eşit olmadığı** için `origin_mismatch` → **403**. Yani
fail-closed sonuç, `Array.isArray` kontrolü olmadan **kazara** elde edilmiş.
İstismar edilebilirlik takdirim: **yok** (iki yönde de 403). Ama `low`
not: koruma **tasarımdan değil, Node'un başlık birleştirme davranışından**
geliyor; bir gün `Array` biçimi dönerse `value[0]` güvenilir orijini
döndürebilir ve kapı **sessizce açılır**. → **S3-5**.

**(g) `validateOrigin` ile eşdeğerlik — ARTIK GERÇEKTEN EŞDEĞER, ÖLÇÜLDÜ.**
Tur 2'de bu iddiayı kütüphane **kaynağını okuyarak** çürütmüştüm; bu turda
**gerçek HTTP ile iki taraf da** ölçüldü. Better Auth'un kendi kontrolü test
ortamında (`NODE_ENV=test` → `disableOriginCheck: true`, `auth-instance.ts:364`)
**kapalı** olduğu için ölçüm `apiEnv.NODE_ENV = 'development'` (yani `.env`'in
**gerçek** değeri, üretim/geliştirme dalı) ile yapıldı:

```
signUp + Origin: <güvenilir>                → 200
signUp + Origin: https://evil.example.com   → 403 {"code":"INVALID_ORIGIN"}
signOut + Cookie + hiç Origin yok           → 403 {"code":"MISSING_OR_NULL_ORIGIN"}
signOut + Cookie + Origin: evil             → 403 {"code":"INVALID_ORIGIN"}
signOut + Cookie + Referer: <güvenilir>     → 200
```

Delege uçların dört dalı ile `SameOriginGuard`'ın dört dalı **birebir
örtüşüyor** (403 missing-origin-with-cookie, 403 mismatch, `Referer` fallback,
güvenli metot muafiyeti). **Dosya başı yorumundaki "EŞDEĞERİ" iddiası artık
DOĞRU.** → tur 2 **S-3 KAPANDI**.

### 3.1 "Güvenli metotlar için fail-open DOĞRU karar mı?" — YARGIM: EVET

`backend`'in gerekçesi (Fetch spesifikasyonu: `Origin` yalnızca güvensiz
metotlarda/cross-origin GET'te eklenir) doğru ve ölçüm (b) = 200 bunun
**gerekli** olduğunu gösteriyor. "Bilgi sızdırma" endişesine üç ölçülmüş cevap:

1. **`SameSite=Lax` top-level GET'te çerezi gönderir** — doğru. Ama CSRF ile
   yapılan bir okuma, yanıtı **okuyamaz**: `grep -rn "enableCors\|cors"
apps/api/src/main.ts apps/api/src/app.module.ts` → **0 eşleşme**. CORS hiç
   açılmamış → Same-Origin Policy gereği çapraz-site bir sayfa
   `GET /auth/sessions` yanıtının gövdesine **erişemez**.
2. Modern tarayıcıda çapraz-site bir `GET` **`Sec-Fetch-Site: cross-site`**
   taşır ve guard'ın **birinci** dalı onu zaten reddeder (`:88-90`).
3. Yanıt gövdesi (AC6, tur 2'de ölçüldü) `{id, createdAt, updatedAt, expiresAt,
isCurrent}` — ham `token`/hash **yok**. Sızsa bile sızan şey oturum
   **sayısı/tarihi**.

→ Fail-open burada **doğru ve ölçülebilir biçimde maliyetsiz**. Bulgu yazmıyorum.

---

## 4. Tur 2'nin ON bulgusunun durumu — HEPSİ BAĞIMSIZ DOĞRULANDI

| #                      | Bulgu                                                         | Tur 3 durumu                                                                | Kanıt                                                                                                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S-1** (`high`)       | `$transaction` kaçış kapısı                                   | **KAPANDI** (3. ve 4. kapı) — **ama BEŞİNCİSİ ÖLÇÜLDÜ**                     | `client.ts:102,133` `Omit<…, AuthModelName \| '$transaction'>`; iki negatif pin (`auth-model-narrowing.pin.ts:78-81`, `:140+`) `@ts-expect-error` ile **gerçekten tetikleniyor** (`typecheck` exit 0 = pinler çalışıyor); `tx.$extends` **TS2339 ile reddediliyor**. **Yeni:** §1 → **S3-1** |
| **S-2** (`high`)       | `causeMessage` ham e-posta                                    | **KAPANDI** — **5 arıza modunda ölçüldü**                                   | §2. `rawEmailInLogs=false` ×5; kimlik bilgisi (kullanıcı **ve** parola) de sızmıyor. Kalan: `low` **S3-4**                                                                                                                                                                                   |
| **S-3** (`medium`)     | `SameOriginGuard` fail-open + "eşdeğeri" iddiası              | **KAPANDI** — eşdeğerlik **iki taraflı HTTP ölçümüyle** doğrulandı          | §3 + §3.1. (a) 403, (c) `Referer` çalışıyor, (d/e/f/g) 403; BA'nın dört dalı birebir örtüşüyor                                                                                                                                                                                               |
| **S-4** (`medium`)     | `giriş başarısız` olayı hiç yok                               | **KAPANDI** — `emailMasked` **gerçekten maskeli**, `failureCount` **doğru** | §5.1. 3 ardışık yanlış parola → `failureCount` **1, 2, 3** (sayaçla birebir), `emailMasked: "z***@arkesoft.test"`, `rawEmailInAnyLine: false`, `requestId` **var**. **Yeni sızıntı AÇILMADI**                                                                                                |
| **S-5** (`medium`)     | olay loglarında `requestId` yok, giriş isteğinde `userId` yok | **KAPANDI**                                                                 | §5.2. Dört olayın **hepsinde** `requestId`; `giriş başarılı` → `userId`+`sessionId`; `kullanıcı kaydı oluşturuldu` → `userId`; sign-in delege `istek tamamlandı` satırı → `userId: "co1sDBad…"` ✓. Kalan iki ayak `low` **S3-7**                                                             |
| **S-6** (`low`)        | `AUTH_SESSION_READER` ham `token` döndürüyor                  | **KAPANDI** — bağımsız doğrulandı                                           | `auth.tokens.ts:42-52` `AuthSessionReaderResult = {userId, sessionId}`; `auth.module.ts:126-131` factory **yalnızca o iki alanı** map ediyor; ham `token` **hiç geçmiyor**                                                                                                                   |
| **S-7** (`low`)        | ioredis hatası `AppError`'a sarılmıyor (500)                  | **KAPANDI — FAIL-OPEN'A ÇEVRİLMEDİ**                                        | §5.3. **503** `RATE_LIMIT_STORE_UNAVAILABLE`, `isRetryable: true`; üç uç da reddediliyor. Logda mutlak dosya yolu **yok** (`logsHaveAbsolutePaths: false`)                                                                                                                                   |
| **S-8** (`low`)        | `AggregateError.message === ""`                               | **KAPANDI**                                                                 | §5.3. `redis://localhost:6399` (çift yığın, S-8'in tam senaryosu) → `causeMessage: "connect ECONNREFUSED ::1:6399"`; `errorMessageEmptyString: false`. 7 çağıran bağlı                                                                                                                       |
| **S-9** (`low`, ortam) | Host seviyesinde ikinci `redis-server`                        | **AÇIK — YENİDEN DOĞRULANDI, daha keskin kanıtla**                          | `docker exec arkesoft-redis redis-cli --scan --pattern 'platform:auth:*'` → **0 anahtar**; `redis-cli --scan …` (host) → **4 anahtar** (TTL 900/3600, gerçek sayaç değerleri). Uygulama **host** örneğine yazıyor, compose servisine **değil**                                               |
| **S-10** (`low`)       | Belirteç URL sorgu parametresinde                             | **AÇIK (değişmedi, kabul)**                                                 | `auth-instance.ts:105-109` `buildAuthLinkUrl` aynı; sunucu tarafı sızıntı yok (`url` loglanmıyor)                                                                                                                                                                                            |

**Tur 2'nin kendi "FAIL'i kaldıran asgari küme"si (4 madde) → 4/4 karşılandı.**

---

## 5. Diğer ölçümler

### 5.1 `giriş başarısız` olayı (tur 2 S-4) — gerçek NDJSON

```json
{"level":"warn","requestId":"req_71f2ed6c-…","reason":"invalid_credentials",
 "failureCount":1,"emailMasked":"z***@arkesoft.test","msg":"giriş başarısız"}
{"level":"warn","requestId":"req_2b232189-…","reason":"invalid_credentials",
 "failureCount":2,"emailMasked":"z***@arkesoft.test","msg":"giriş başarısız"}
{"level":"warn","requestId":"req_35ca2adb-…","reason":"invalid_credentials",
 "failureCount":3,"emailMasked":"z***@arkesoft.test","msg":"giriş başarısız"}
```

`failureCount` monoton ve **sayacın gerçek değeriyle uyumlu** (`peekCount`,
`rate-limit.guard.ts:299`). `emailMasked` `maskEmail()`'den geçmiş. Ham e-posta
log hattının **hiçbir yerinde** yok. Kampanya artık **sessiz değil** — tur 2'nin
credential-stuffing senaryosuna uyarı kuralı yazılabilir alan **var**.

### 5.2 Korelasyon (tur 2 S-5) — gerçek NDJSON

| Olay                                      | `requestId` | `userId`         | `traceId` |
| ----------------------------------------- | ----------- | ---------------- | --------- |
| `e-posta gönderildi`                      | ✓           | **✗**            | ✗         |
| `kullanıcı kaydı oluşturuldu`             | ✓           | ✓                | ✗         |
| `giriş başarılı`                          | ✓           | ✓ (+`sessionId`) | ✗         |
| `istek tamamlandı` (sign-in delege, 200)  | ✓           | ✓ `co1sDBad…`    | ✗         |
| `istek tamamlandı` (`GET /auth/sessions`) | ✓           | ✓                | ✗         |

**`resolveEventLogger()` fail-soft dalı (handoff'un özel sorusu):** ALS bağlamı
yoksa enjekte edilen **kök** logger'a düşer — satır **yazılır** ama `requestId`
**taşımaz**. Bu bir gözlemlenebilirlik **boşluğu** mu? Bugün **hayır**: ölçülen
beş olayın **hepsi** `requestId` taşıyor, yani tüm üretim çağrı yolları ALS
içinde. Dal ileride (v0.0.11 kuyruk, programatik çağrı) **sessizce** aktifleşir
ve o satırlar korelasyonsuz olur — ama fail-soft'un **kendisi doğru karar**
(bir log satırının seçimi kayıt/giriş akışını kıramaz). → `low` **S3-7**.

### 5.3 Oran sınırlama deposu arızası — YÖNTEM DAHİL

**Yöntem (tur 2 S-9 uyarısı gereği `docker stop` KULLANILMADI):**
`apiEnv.REDIS_URL` ulaşılamaz bir porta çevrildi (`redis://127.0.0.1:6399` ve
ayrıca çift yığın `redis://localhost:6399`) ve `createTestApp`'in
`platform:auth:*` flush adımını **atlamak** için ham `AppModule` +
`Test.createTestingModule` + `API_ENV`/`ROOT_LOGGER` override kullanıldı.

```
POST /auth/sign-in/email        → 503 {"code":"RATE_LIMIT_STORE_UNAVAILABLE", …}
POST /auth/sign-up/email        → 503 {"code":"RATE_LIMIT_STORE_UNAVAILABLE", …}
POST /auth/request-password-reset → 503 {"code":"RATE_LIMIT_STORE_UNAVAILABLE", …}
GET  /health/ready              → 503 DEPENDENCY_UNAVAILABLE {"redis":"down","database":"up"}
log: "isRetryable":true   logsHaveAbsolutePaths=false   errorMessageEmptyString=false
causeMessage (çift yığın) = "connect ECONNREFUSED ::1:6399"   ← S-8 KAPANDI
```

→ **FAIL-CLOSED.** Redis yokken istek **gerçekten reddediliyor**; iki yol
(`/health/ready` ve oran sınırlama) artık **tutarlı** (ikisi de 503).
`Retry-After` başlığı 503'te **yok** — `low` değerinde bile değil, not.

### 5.4 Redis URL kimlik bilgisi logda sızıyor mu — YENİ KONTROL

`REDIS_URL = redis://probeuser:zzSecretRedisPw3Probe@127.0.0.1:6379` (host
Redis parola istemiyor → `WRONGPASS`):

```
passwordInLogs=false   userInLogs=false
signin:  503  bodyHasPw=false
health:  503  bodyHasPw=false
log: {"causeMessage":"WRONGPASS invalid username-password pair or user is disabled.", …}
```

→ **Temiz.** ioredis hata mesajı bağlantı dizesini **taşımıyor**;
`describeErrorCause` kanalı kimlik bilgisi **sızdırmıyor**. (Bu, `describe-error-cause.ts`'in
kendi "iç/teknik nedenler için güvenlidir" iddiasının **ölçülmüş** desteğidir.)

### 5.5 ADR-0008 metni gerçeği yansıtıyor mu

| ADR satırı                 | İddia                                                                                                                                                                                  | Gerçek                                                                                                                                             | Durum           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `:102` (Ek not, FIX tur 2) | `$transaction` callback'i kapısı + "bu tipi döndüren/kabul eden hangi başka API var" talimatı                                                                                          | **DOĞRU ve YAZILI** — dördüncü kapı belgelenmiş ✓                                                                                                  | ✓               |
| `:120` (Olumsuz 4)         | "`Omit<>` anahtar düşürür, o modele yönelen başka tüm yolları kapatmaz"                                                                                                                | **DOĞRU** (ve §1'in tam teşhisi)                                                                                                                   | ✓               |
| **`:100`**                 | "`tx.account.findMany()` artık **tip hatasıdır**. **Yanlışlıkla yazmak imkânsız**; bilerek yazmak ise hem derleme zamanı daraltmasını **hem de lint kuralını atlatmayı gerektiriyor**" | **HÂLÂ YANLIŞ — üçüncü turda üçüncü kez çürütüldü.** `p.db.$extends({}).account.findMany()` **ikisinden hiçbirini** atlatmayı gerektirmiyor (§1.1) | **AÇIK → S3-2** |
| **`:114`** (Olumsuz 1)     | "`$transaction` callback'i tam Prisma istemcisini taşıyabilir"                                                                                                                         | **BAYATLADI** — o kapı FIX turu 2'de **kapandı**. ADR **kapanmış** bir kapıyı açık, **açık** olanı (`$extends`) **hiç** anmıyor                    | **AÇIK → S3-2** |
| `$extends`                 | —                                                                                                                                                                                      | ADR'de **hiç geçmiyor** (`grep` → 0)                                                                                                               | **AÇIK → S3-2** |

---

## 6. CLAUDE.md §7 — 14 maddenin bu değişiklik için doğrulanması

| #      | Madde                                                                   | Durum                                                                                                                                                                                |
| ------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1      | `tenant_id` NOT NULL                                                    | ✓ (FIX turu yeni tablo eklemedi; `tenant_membership` taşıyor)                                                                                                                        |
| **2**  | RLS etkin + `current_setting('app.tenant_id')` politikası               | **KARŞILANMIYOR** — `session`/`account`/`verification`/`app_user`/`tenant` `relrowsecurity = f`. **Bilinçli + belgelenmiş** (ADR-0007/0008, yapısal)                                 |
| 3      | `(tenant_id, …)` bileşik indeks                                         | ✓ (yeni sorgulanan kolon yok)                                                                                                                                                        |
| 4      | `tenantProcedure`/`permissionProcedure`                                 | ✓ HTTP eşdeğeri: `AuthGuard` + `SameOriginGuard` (tRPC v0.0.9)                                                                                                                       |
| **5**  | **Sorgular `withTenant(tenantId)` üzerinden; ham `prisma` çağrısı yok** | **KARŞILANMIYOR — YENİ.** `$extends` hem `AppPrismaDatabase` daraltmasını hem `withTenant`'ı atlıyor; 1844 satır **tenant context'siz** okundu (§1.2) → **S3-1**                     |
| 6      | Girdideki `id` güvenilmiyor, sahiplik doğrulanıyor                      | ✓ (tur 2: saldırgan çerezi + kurban `sessionId` → 404; kurbanın oturumu silinmedi)                                                                                                   |
| 7      | Kuyruk payload'ında `tenantId`                                          | N/A (kuyruk v0.0.11)                                                                                                                                                                 |
| **8**  | Dış kaynak tenant'a kapsamlı                                            | **Sapma** — sayaç öneki `platform:auth:` (R1, bilinçli; anahtarlar HMAC'li, kiracı verisi taşımıyor)                                                                                 |
| 9      | Önbellek anahtarı `tenant:{tenantId}:…`                                 | Madde 8 ile aynı sapma; başka önbellek yok                                                                                                                                           |
| 10     | Dosya yolu tenant önekiyle                                              | N/A (dosya yüzeyi yok)                                                                                                                                                               |
| 11     | Çapraz okuma **ve** yazma testi                                         | ✓ `auth-cross-tenant.isolation.test.ts` + `pnpm test:isolation` **15 yeşil**. **Not:** hiçbir izolasyon testi `$extends` yolunu kapsamıyor — **kapsayamaz** (derleme zamanı boşluğu) |
| 12     | Hata mesajı başka tenant'ın varlığını sızdırmıyor                       | ✓ (tur 2: yetkisiz vs var olmayan **birebir aynı** 404 gövdesi)                                                                                                                      |
| **13** | Loglarda `tenantId`                                                     | **Sapma** — `/auth/*` `tenantId` taşımıyor (`tenant-exempt`, kimlik platform seviyesi). Ölçüldü: `tenantId: false`                                                                   |
| 14     | Süper admin impersonation + denetim kaydı                               | N/A (v0.0.14)                                                                                                                                                                        |

**Karşılanmayan madde numaraları: 2 · 5 · 8 · 13.**
Bunlardan **2, 8, 13** tur 2'de de aynıydı ve **bilinçli + belgelenmiş** sapmalar.
**Madde 5 YENİ ve belgelenmemiş** — bu turun `high` bulgusu.

---

## 7. Temiz çıkan kontroller (arandı, ÖLÇÜLDÜ, bulunamadı)

| Kontrol                       | Sonuç                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sır repoya girmiş mi          | `git diff \| grep -niE "(password\|secret\|api[_-]?key\|token\|BEGIN .*PRIVATE KEY)"` **koşuldu**: tek somut değer `.env.example:99` `BETTER_AUTH_SECRET=arkesoft_dev_only_better_auth_secret_change_me_32plus` — **kasıtlı yer tutucu**. `git check-ignore -v .env` → `.gitignore:7`; `git ls-files .env` → **izlenmiyor** ✓. Üretken desen taraması (`BEGIN … PRIVATE KEY`, `sk_live`, `pk_live`, `AKIA…`, `ghp_…`) tüm `apps`/`packages`/`docs`/`.claude`/`infra`'da → **0 eşleşme** |
| Kart verisi                   | Bu sürümde ödeme yüzeyi **yok** → saklanmıyor/loglanmıyor ✓                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Ödeme imza/replay/idempotency | Bu sürümde webhook/ödeme **yok** → N/A (v0.9.0)                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Enjeksiyon                    | `$queryRawUnsafe`/`$executeRawUnsafe` eslint ile yasak, `src`'de **0** kullanım; `withTenant`'ın `set_config`'i etiketli şablon + bağlı parametre; mail HTML'inde `escapeHtml()`; açık yönlendirme `isTrustedOrigin`'den geçiyor (ölçüldü §3: `Origin: evil` → 403 `INVALID_ORIGIN`)                                                                                                                                                                                                    |
| XSS / yönlendirme             | `callbackURL`/`redirectTo` üretim/geliştirmede **403** ile reddediliyor (§3 ölçümü)                                                                                                                                                                                                                                                                                                                                                                                                     |
| SSRF / dosya yükleme          | Kullanıcı verdiği URL'e istek **yok** (tek dış çağrı `SMTP_HOST`, env'den); dosya yükleme yüzeyi **yok**                                                                                                                                                                                                                                                                                                                                                                                |
| RLS durumu değişmiş mi        | DB ölçümü: `tenant_membership` **t/t** + politika `tenant_membership_tenant_isolation`; diğer 6 tablo **f/f** — **tur 2 ile birebir aynı**, FIX turu RLS'e dokunmadı ✓                                                                                                                                                                                                                                                                                                                  |
| KVKK — IP/UA saklanıyor mu    | **HAYIR.** `SELECT length(ip_address), length(user_agent), count(*) FROM session GROUP BY 1,2` → **tek grup: `0, 0, 2387`**. 2387 satırın **tamamı** boş dize ✓. Şemada yeni PII kolonu **yok** (`tckn`/`phone`/`birth`/`address` → 0 eşleşme)                                                                                                                                                                                                                                          |
| CORS                          | `enableCors`/`cors` → **0 eşleşme** → çapraz-site okuma SOP ile kapalı (§3.1'in dayanağı)                                                                                                                                                                                                                                                                                                                                                                                               |
| CSRF varsayılanı              | `disableOriginCheck: env.NODE_ENV === 'test'` (`auth-instance.ts:364`); `.env` `NODE_ENV=development`, şema varsayılanı da `development` → üretim/geliştirmede kontrol **AÇIK** (ölçüldü §3: 403'ler geldi). Fail-closed varsayılan ✓                                                                                                                                                                                                                                                   |
| Oran sınırlama kapsamı        | Dört uç; fail-closed (§5.3); hesap sayacı atlatma denemeleri tur 2'de tüketildi, bu turda değişmedi                                                                                                                                                                                                                                                                                                                                                                                     |
| Süper admin / denetim kaydı   | Bu sürümde **yok** (v0.0.14) → N/A                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `pnpm audit`                  | **critical 0 · high 1 · moderate 0 · low 0** — tek `high` `multer` GHSA-q7qp-rjg7-q26m (geçişli, `@nestjs/platform-express`), **T-006 öncesinden**, vade v0.0.16. **AC11 ✓** (mevcut 1 aşılmadı; `better-auth`/`nodemailer` yeni zafiyet getirmedi)                                                                                                                                                                                                                                     |
| Yeni bağımlılık               | FIX turu 2 **yeni bağımlılık eklemedi** (`git diff` `package.json` dosyalarında yeni paket yok)                                                                                                                                                                                                                                                                                                                                                                                         |

---

## BULGULAR

### [SEV: high]

**S3-1** — `packages/db/src/client.ts:102` · `:133` ·
`packages/db/src/__tests__/type-pins/auth-model-narrowing.pin.ts:62-81` ·
`docs/adr/0008-sir-tasiyan-tablolarin-tipi-ve-linti-ile-korunmasi.md:100,114` —
**ADR-0008'in BEŞİNCİ kaçış kapısı: `$extends` `AppPrismaDatabase`'ten
düşürülmemiş ve tam istemci yüzeyini (sır taşıyan üç delege + `$transaction`
dahil) GERİ VERİYOR. Derleme zamanı, lint ve çalışma zamanının ÜÇÜ de ölçüldü;
üçü de sessizce geçti.**
→ **`T-006 KUSURU`**

`AppPrismaDatabase = Omit<PrismaDatabase, AuthModelName | '$transaction'>`
**dört** anahtar düşürür. `$extends` **korunur** — ve üretilen istemci
(`packages/db/generated/internal/class.ts:187`) onun dönüş tipini
`AppPrismaDatabase`'den **türetmez**, Prisma'nın **TypeMap**'inden yeniden inşa
eder. `Omit<>` ile düşürülen anahtarlar TypeMap'te **durmaya devam ettiği** için
dönen istemci **tam** yüzeye sahiptir.

**Ölçüm — derleme zamanı** (§1.1): `p.db.$extends({}).account.findMany()`,
`…session.findMany({select:{token:true}})`, `…verification.findMany({select:{value:true}})`
ve `…$extends({}).$transaction(async (tx) => tx.account.findMany())` →
`pnpm exec tsc --noEmit` **exit 0, 0 hata**;
`pnpm exec eslint src/zzsecprobe/p5.ts` **exit 0, 0 hata**. Yasak jeton
ithal edilmedi; `any`/`as`/`@ts-ignore`/`@ts-expect-error` yok. Aynı dizine
konan kasıtlı hata `tsc` tarafından **yakalandı** (TS2322) → ölçüm kapsam dışı
kalmaktan değil, boşluktan geçti.

**Ölçüm — çalışma zamanı** (§1.2): gerçek `createTestApp()` + gerçek Postgres,
`app.get(PrismaService)` →
`PROBE5_RUNTIME={"accountRows":3,"totalAccountsPlatformWide":1844,
"firstHashPrefix":"eb37e01b2c8f","hashLen":161,"sessionTokenSample":"slTDHm",…}`.
**1844 hesap satırı platform çapında sayıldı**, 161 karakterlik gerçek parola
hash'leri ve ham `session.token` değerleri döndü.

**Niçin bu kapı DÖRDÜNCÜDEN DAHA KÖTÜ (§1.3):** `db`'nin (b) seçeneğini
reddetme gerekçesi — "ham `$transaction` tenant GUC'unu kurmaz → RLS boş/filtreli
döner → **sessiz doğruluk hatası**" — burada **GEÇERSİZ**:
`account`/`session`/`verification`'da **RLS zaten hiç yok** (DB ölçümü:
`relrowsecurity = f`), bu yüzden GUC'un kurulmaması **hiçbir şeyi filtrelemiyor**.
Sorgu **tam ve doğru** veri döndürüyor. Geliştiriciyi uyaracak **hiçbir sinyal
yok**: ne tip hatası, ne lint, ne boş sonuç, ne hata, ne de ADR'de bir satır.
`$queryRaw`'dan farkı: o ADR-0008:113-114'te **açıkça kabul edilmiş** bir risk ve
ham SQL yazmak zaten bir dikkat sinyali; `$extends` ise Prisma'nın **birinci
sınıf, belgelenmiş, teşvik edilen** API'si (client extensions: soft-delete,
computed field, sorgu loglama — v0.0.6+'nın tam ihtiyaç duyacağı şeyler).

**Niçin GÖZDEN KAÇTI — ölçülmüş kanıt (§1.4):** `$extends` repoda **yalnızca**
`db`'nin kendi düzeltme yorumundaki liste literalinde geçiyor
(`client.ts:117-118`, `auth-model-narrowing.pin.ts:40-41`:
`ITXClientDenyList = ['$connect','$disconnect','$on','$use','$extends']`). Yani
`db`, `$extends`'in **istemciyi genişleten** bir API olduğunu yazıya dökmüş —
Prisma onu iç işlem istemcisinden **bu yüzden** düşürüyor — ama aynı soruyu
`AppPrismaDatabase`'in **kendisi** için sormamış. ADR-0008:102'nin **kendi
talimatı** ("bu tipi döndüren veya kabul eden hangi başka API var") burada
uygulanmamış. Tip pini de boşluğu açıkta bırakıyor: `$extends` ne pozitif
(`pinAppPrismaDatabaseRetainsCoreMethods`, `:62-67`) ne negatif
(`pinAppPrismaDatabaseDropsTransaction`, `:78-81`) pinde — **CI'da hiçbir yönde
pinli değil**.

**İstismar senaryosu (kim, hangi girdiyle, ne elde eder):** v0.0.6+ geliştiricisi
(saldırgan değil, **kendi ekibimiz**) ürün/sipariş uçlarında Prisma'nın standart
genişletme deyimini kullanacak — ör. soft-delete filtresi veya sorgu süresi
loglaması için `const db = this.prisma.db.$extends(softDelete)`. O noktadan
sonra `db.account` / `db.session` **derlenir, lint'ten geçer, çalışır ve tam
veriyi döndürür**; hiçbir kapı uyarmaz. Kiracı kapsamlı bir uçta yazılmış tek bir
`db.account.findMany()` (veya bir `include`/`select` hatası) **platformdaki tüm
parola hash'lerini ve oturum belirteçlerini** kiracı yöneticisinin
okuyabileceği bir yanıt gövdesine taşır → **platform çapında hesap ele
geçirme**. Bu PM riski 1'in birebir kendisidir; ADR-0008:100 onu
"artık tip hatasıdır, **yanlışlıkla yazmak imkânsız**" diye kapanmış sayıyor.

**Niçin `critical` değil (önem derecesini şişirmiyorum):** bugün dış bir
saldırganın ulaşabileceği bir sızıntı **yok** — `apps/api/src` içinde
`$extends` kullanımı **sıfır** (`grep` → 0) ve boşluk ancak **bizim** gelecekte
yazacağımız kodla gerçekleşir. Sınıfı, tur 2'de `high` verdiğim S-1 ile
**birebir aynı**; tutarlılık için `high`. Ama şunu kayda geçiriyorum: etkisi
S-1 ile aynı, **olasılığı ve sessizliği S-1'den yüksek**.

**Önerilen düzeltme (asgari, üç parça):**

1. `packages/db/src/client.ts:102` → `Omit<PrismaDatabase, AuthModelName | '$transaction' | '$extends'>`.
   `apps/api/src` içinde `$extends` kullanımı **sıfır** olduğu için hiçbir
   çağrıyı kırmaz (`$transaction` düşürmesinin birebir aynı gerekçesi).
   `TenantTransactionClient`'ta gerek **yok** — Prisma'nın `ITXClientDenyList`'i
   `$extends`'i zaten düşürüyor (ölçüldü: TS2339).
2. `auth-model-narrowing.pin.ts` → `pinAppPrismaDatabaseDropsTransaction`'ın
   **birebir ikizi** olarak `pinAppPrismaDatabaseDropsExtends`
   (`@ts-expect-error` + `return db.$extends`). Pinsiz düzeltme, bir sonraki
   Prisma yükseltmesinde **sessizce** geri açılır.
3. **Jenerik kapı (asıl talep):** `Omit<>`'un düşürdüğü **anahtar listesini**
   tek bir `AppClientDeniedKeys` birleşim tipinde topla ve `PrismaDatabase`'in
   `$`-önekli **tüm** üyeleri için bir tip pini yaz ("yeni bir `$` metodu
   gelirse, ya pozitif ya negatif pinde **olmak zorunda**"). Üç turda **üç
   kapı** aynı sebepten açıldı; dördüncüsünü aramak yerine **sınıfı** kapatmak
   gerekiyor — bu, ADR-0008:102/120'nin kendi tavsiyesinin mekanik hâli.
   — **Sorumlu: S2 (`db`, `packages/db/src/client.ts` + tip pini), architect
   (ADR-0008:100/114 ve "NE KAPANDI" tablosu — bkz. S3-2)**

---

### [SEV: medium]

**S3-2** — `docs/adr/0008-sir-tasiyan-tablolarin-tipi-ve-linti-ile-korunmasi.md:100`
· `:114` — **ADR-0008'in metni iki yönde de gerçeği YANSITMIYOR: KAPANMIŞ bir
kapıyı açık, AÇIK olanı hiç anmıyor. `:100`'ün ana iddiası ÜÇ ARDIŞIK TURDA
ÜÇÜNCÜ KEZ çürütüldü.**
→ **`T-006 KUSURU`**

İki doğrulanabilir hata (§5.5 tablosu):

1. **`:100`** — "`tx.account.findMany()` artık **tip hatasıdır**. **Yanlışlıkla
   yazmak imkânsız**; bilerek yazmak ise hem derleme zamanı daraltmasını **hem
   de lint kuralını atlatmayı gerektiriyor**." → `p.db.$extends({}).account.findMany()`
   **ikisinden hiçbirini** atlatmayı gerektirmiyor (ölçüldü, S3-1). Bu cümle
   tur 1'de (lint kapısı), tur 2'de (`$transaction`) ve şimdi tur 3'te
   (`$extends`) **üç kez** çürütüldü; her turda yanına bir "Ek not" eklendi ama
   **cümlenin kendisi hiç düzeltilmedi**.
2. **`:114`** (Olumsuz Sonuçlar 1) — "`$transaction` callback'i tam Prisma
   istemcisini taşıyabilir" → o kapı **FIX turu 2'de kapandı** (iki negatif pin,
   ölçüldü). ADR şu anda **kapanmış** bir kapıyı kalan risk olarak sayıyor ve
   **gerçekten açık** olanı (`$extends`) **hiç anmıyor** (`grep '\$extends'`
   ADR'de → **0**).

**Niçin bu bir güvenlik bulgusu:** ADR'nin **kendi** `:101` uyarısı
("**belgelenmiş ama gerçekleşmeyen bir kontrol, var olmayan ama belgelenmemiş
bir kontrolden daha tehlikelidir**") burada **tam olarak** ihlal ediliyor. Bir
v0.0.6+ geliştiricisi veya sonraki bir ajan ADR'yi okuyup `$extends` yüzeyini
**kapalı sanacak**; `:114`'ü okuyup **yanlış** kapıya (`$transaction`) dikkat
edecek. Risk, kodun kendisinden **bağımsız** olarak belgeden doğuyor.

**Niçin `high` değil:** ADR, `:114`'te "**Bu bir veritabanı garantisi DEĞİLDİR
ve öyle sunulmamalıdır**" ve `:120`'de doğru genel desen ("`Omit<>` anahtar
düşürür, o modele yönelen başka tüm yolları kapatmaz") uyarılarını **taşıyor**
— dikkatli okuyan uyarılmış oluyor. Hatalı olan **spesifik** iddialar.

**Önerilen düzeltme:** `:100`'ün "yanlışlıkla yazmak imkânsız" cümlesini
**sil**; yerine ölçülmüş hâli yaz ("`db.account`/`tx.account` **doğrudan**
erişimi tip hatasıdır; **dolaylı** yollar — `$extends`, `$queryRaw` — ayrı
ayrı düşürülmek/kabul edilmek zorundadır ve listesi `client.ts`'in `Omit<>`
anahtar kümesidir"). `:114`'ten kapanmış `$transaction` ayağını çıkar, yerine
`$extends`'i (S3-1 kapanana kadar) **açık kalan risk** olarak yaz; kapandıktan
sonra "kabul edilen kalan risk" listesini **`$queryRaw` + S3-6'nın latent
yolu** olarak güncelle. Ayrıca `:102`'nin talimatını bir **kontrol listesine**
çevir (yeni bir `$` metodu → pozitif veya negatif pin **zorunlu**).
— **Sorumlu: architect (ADR metni), docs (S9 — yayına alma)**

---

### [SEV: low]

**S3-3** — `packages/db/src/tenant-context.ts:30-34` — yorum **"İÇ İÇE ÇAĞRI
YAPISAL OLARAK İMKÂNSIZ: `callback`'e verilen `tx` (`TransactionClient`)
`$transaction` METODUNU TAŞIMAZ"** diyor. **Öncül ÖLÇÜLEREK YANLIŞ:** prob
`p6`'da `Parameters<Parameters<typeof withTenant>[2]>[0]['$transaction']`
**derlendi** (`tsc` exit 0) — `Prisma.TransactionClient` `$transaction`'ı
**taşıyor** (`db`'nin kendi dördüncü-kapı bulgusunun temeli bu). Sonuç
("iç içe `withTenant` derlenmez") **doğru** ama **başka bir sebepten**: `tx`
`$connect`/`$extends` taşımadığı için `PrismaDatabase` parametresine
**atanamıyor**. Yani ADR-0008:101'in tarif ettiği sınıf: doğru sonucu **yanlış
mekanizmayla** gerekçelendiren bir yorum — bir gün `withTenant`'ın imzası
gevşerse koruma sanılan şey **yok olur** ve kimse farkı anlamaz.
→ **`ÖNCEDEN VAR OLAN BORÇ`** (yorum v0.0.13/T-005/S3'te yazıldı), **ama
yanlışlığı T-006'nın FIX turu 2'sinde ÖLÇÜLDÜ ve düzeltilmedi.**
**Düzeltme:** öncülü gerçekle değiştir ("`tx`, `$connect`/`$extends` gibi
`ITXClientDenyList` üyelerini taşımadığı için `PrismaDatabase` parametresine
atanamaz; `$transaction` ÜYESİ ise `TransactionClient`'ta **vardır** — bkz.
`client.ts`'in `TenantTransactionClient` doc'u").
— **Sorumlu: S2 (`db`)**

**S3-4** — `apps/api/src/auth/auth-instance.ts:209-222`
(`extractProviderErrorFields`) · `:201-207` (yorum) — allowlist'in
`providerErrorCode` alanı `record['code']`'u **yalnızca `typeof === 'string'`**
diye doğruluyor; **uzunluk veya desen sınırı yok**. Dosyanın kendi yorumu
"**SERBEST METİN DEĞİLDİR** — sabit, küçük bir değer kümesinden gelir,
alıcı/host/kimlik bilgisi **TAŞIYAMAZ**" diyor, ama bunu **tip zorlamıyor** —
bu bir **sözleşme iddiası**, mekanik kontrol değil. Bugün güvenli (ölçüldü,
§2: beş arıza modunda `EENVELOPE`/`EPROTOCOL`/`EDNS`); risk, v0.9.0'da ikinci
bir mail/SMS sağlayıcısı adaptörü `.code`'a serbest metin koyduğunda kanalın
**sessizce** yeniden açılması. Bu, S-2'nin **tam olarak** kapatmak için
tasarlandığı sınıf.
→ **`T-006 KUSURU`** (alan bu FIX turunda yazıldı)
**Düzeltme:** `providerErrorCode`'u allowlist'li bir birleşime (nodemailer'ın
bilinen kodları) ya da en azından `/^[A-Z][A-Z0-9_]{0,31}$/` desenine bağla;
uymayan değer `undefined` dönsün. Üç satır, mevcut testi kırmaz.
— **Sorumlu: S5**

**S3-5** — `apps/api/src/auth/same-origin.guard.ts:50-54` (`singleHeaderValue`)
— çoğul `Origin` başlığında **fail-closed sonuç ÖLÇÜLDÜ** (§3: (e) ve (e2)
**403**, oturum iki durumda da **hayatta**), yani solid L-4 **istismar
edilebilir değil**. Ama koruma **tasarımdan gelmiyor**: Node'un HTTP
ayrıştırıcısı yinelenen `Origin`'leri `", "` ile **tek dizede birleştirdiği**
için birleşik dize güvenilir orijine eşit olmuyor → `origin_mismatch`.
`Array.isArray(value) ? value[0] : value` dalı **hiç çalışmıyor**; çalıştığı
gün (başka bir HTTP adaptörü — K-A1 fastify geçişi **planlı** — veya bir ara
katman dizi biçimi verirse) `value[0]` **güvenilir orijini** döndürüp ikinci
başlığı sessizce yutabilir. Repodaki yerleşik refleks ters yönde:
`request-context.types.ts:29` `multiple_host_headers` → **reddet**.
→ **`KAYDA GEÇECEK BORÇ`** (bugün etkisiz; v0.18.0 ters vekil/fastify
kararıyla birlikte gözden geçirilsin)
**Düzeltme:** `Array.isArray(value)` → yeni bir `SameOriginViolationReason`
üyesi (`multiple_origin_headers`); `assertNever` zaten exhaustive tutuyor.
— **Sorumlu: S6 + architect (v0.18.0 kaydı)**

**S3-6** — `packages/db/src/index.ts:30` (`withTenant` dışa açık) ·
`packages/db/src/tenant-context.ts:76-80` (callback `TransactionClient`) ·
`packages/db/src/index.ts` (`export type { Prisma }`) ·
`apps/api/eslint.config.mjs:50-55` (yasak jeton kümesi) — **ALTINCI (latent)
kapı: yasak jetonların HİÇBİRİNİ ithal etmeden tam istemci tipini TÜRETMEK
mümkün.** Prob `p6`, `tsc` **exit 0** + `eslint` **exit 0**:

```ts
import { withTenant } from '@arkesoft/db' // yasak kümede DEĞİL
type FullClient = Parameters<typeof withTenant>[0] // = PrismaDatabase
export function p6b(client: FullClient, tenantId: string): Promise<unknown> {
  return withTenant(client, tenantId, async (tx) => tx.account.findMany())
}
```

`packages/db`'nin `withTenant()` imzası callback'e **daraltılmamış**
`TransactionClient` verir (PO sapması 1 gereği bilerek — daraltma yalnızca
`PrismaService.withTenant()` sarmalayıcısında). Ayrıca
`export type { Prisma }` ile `Prisma.TransactionClient` de serbest (lint'ten
geçiyor, ölçüldü).
**Bugün istismar edilemez — ÖLÇÜLDÜ:** çalışma zamanı örneği yok. Prob
`zzsecprobe-tur3b` başka bir modülden `@Inject(PRISMA_CLIENT)` denedi →
`Nest can't resolve dependencies of the EvilService (?) … Symbol(PRISMA_CLIENT)`
(`PrismaModule.exports` yalnızca `PrismaService`). `AUTH_PRISMA_CLIENT` de
dışa kapalı (`auth.module.ts:202`). **İki temiz kontrol** — bu yüzden `low`.
Kapı, biri `PRISMA_CLIENT`'ı `exports`'a eklediği veya `PrismaDatabase`
döndüren bir yardımcı yazdığı **gün** açılır; S3-1'in düzeltmesi bunu
**kapatmaz**.
→ **`KAYDA GEÇECEK BORÇ`** (v0.0.14 — `arkesoft_auth` rolü bu sınıfı
veritabanı seviyesinde zaten kapatacak)
**Düzeltme (düşük maliyet, şimdi):** `withTenant`'ı `prismaClientSurfaceRestriction`
yasak jeton kümesine ekle (`apps/api` içinde onu doğrudan ithal eden tek dosya
`src/prisma/prisma.service.ts` — zaten muaf dizinde, ölçüldü) ve ADR-0008:114'ün
"kabul edilen kalan risk" listesine bu yolu **yaz**.
— **Sorumlu: S2 (lint jetonu) + architect (ADR kaydı, v0.0.14 bağı)**

**S3-7** — `apps/api/src/auth/auth-instance.ts:176` (`resolveEventLogger`) ·
`:190` (`e-posta gönderildi`) — tur 2 S-5'in iki **kalan** ayağı: (a)
`e-posta gönderildi` olayı `requestId` **taşıyor** ama `userId` **taşımıyor**
(ölçüldü, §5.2 — kullanıcı o noktada **var**, `kullanıcı kaydı oluşturuldu`
satırında `userId` **yazılı**); (b) beş olayın **hiçbirinde** `traceId` **yok**
— CLAUDE.md §4'ün "Her kayıtta şunlar bulunur: … `traceId` …" listesi
karşılanmıyor (OpenTelemetry v0.0.17). (c) `resolveEventLogger`'ın fail-soft
dalı bugün **hiç tetiklenmiyor** (beş olayın hepsi `requestId` taşıyor → tüm
üretim yolları ALS içinde) ama v0.0.11'in kuyruk işlerinde **sessizce**
aktifleşir ve o satırlar korelasyonsuz olur. Fail-soft kararının **kendisi
doğru** (bir log satırının seçimi akışı kıramaz).
→ (a) **`T-006 KUSURU`** (ucuz: `sendAuthMail`'e `userId` parametresi) ·
(b) ve (c) **`KAYDA GEÇECEK BORÇ`** (v0.0.17 gözlemlenebilirlik; (c) için
v0.0.11'de kuyruk işi ALS bağlamı kurmak **zorunlu** olmalı)
— **Sorumlu: S5 (a), architect + release (b/c kaydı)**

**S3-8** — (ortam, repo defekti değil — **ölçüm uyarısı, TUR 2'DEN TEKRARLANIYOR**)
Bu makinede host seviyesinde ikinci bir `redis-server` 6379'u dinliyor ve
uygulama **ona** yazıyor. Bu tur daha keskin bir kanıtla doğrulandı:

```
docker exec arkesoft-redis redis-cli --scan --pattern 'platform:auth:*'  → 0 anahtar
redis-cli --scan --pattern 'platform:auth:*'                             → 4 anahtar
  platform:auth:post-auth-sign-up-email:account:24b9513a82fc1df8 => 1 ttl=3600
  platform:auth:post-auth-sign-in-email:ip:e3c148812f623fe6      => 2 ttl=900
  …
```

Yani oran sınırlama sayaçları compose servisinde **değil**, host örneğinde.
Sonuçlar: (a) `docker stop arkesoft-redis` ile yapılan **hiçbir** Redis ölçümü
kanıt sayılamaz (bu turda bu yüzden **ulaşılamaz URL + ham `AppModule`**
yöntemi kullanıldı, §5.3); (b) geri alma kolunun hangi örneğe gittiği
belirsiz; (c) testlerin "gerçek Redis" iddiası host örneğine düşüyor.
→ **`ÖNCEDEN VAR OLAN BORÇ`** (ortam)
**Düzeltme:** `infra:up`'a port çakışması kontrolü (veya compose portunu
`6380`'e taşıma kararı) + runbook'a not. **Bu bir sonraki tur olmayacağı için,
commit öncesi devops'a bildirilmesi tek şans.**
— **Sorumlu: devops**

**S3-9** — `apps/api/src/__tests__/rate-limit.test.ts` ·
`apps/api/src/__tests__/helpers/create-test-app.ts:70,159`
(`flushRateLimitCounters`) — **`pnpm test` HERMETİK DEĞİL: ölçüldü ve
tekrarlandı.** `pnpm test` ilk koşuda **6 test düştü** (rate-limit.test.ts'in
AC7 blokları); `platform:auth:*` anahtarları silindikten sonra **aynı komut
510/510 yeşil** döndü; `rate-limit.test.ts` **tek başına** 28/28 yeşil.

```
pnpm test (1. koşu)                         → exit 1, api 6 failed / 297 passed
redis-cli --scan 'platform:auth:*' | xargs redis-cli DEL
pnpm test (2. koşu)                         → exit 0, api 303/303, toplam 510/510
```

Sebep (solid tur2 L-8(b) bunu **önceden söylemişti**): IP sayacı
**platform kapsamlı** (`platform:auth:…:ip:<hmac>`) ve tüm test dosyaları
**aynı loopback IP'den** bağlanıyor; `createTestApp`'in flush'ı dosya
**başında** koşuyor ama vitest dosyaları **paralel** çalıştırıyor — bir
dosyanın istekleri başka bir dosyanın sayaç eşiğini tüketiyor, ya da bir
dosyanın flush'ı başka bir dosyanın sayacını **ortasında** siliyor. Benim prob
koşularım (toplam ~20 `sign-in`/`sign-up` isteği, TTL 900/3600 sn) ilk koşuyu
**ben tetikledim**; ama mekanizma benden bağımsız: aynı makinede `pnpm dev`
çalıştırıp giriş denemiş bir geliştirici, sonraki 15 dakika içinde `pnpm test`
koşarsa **aynı altı testi kırmış olur**.
**Güvenlik yönü:** brute-force savunmasının **tek regresyon kapısı** (AC7)
alakasız trafikle hem **kırmızıya** hem **yeşile** çevrilebiliyor → o kapının
verdiği güvence **ölçülemez**. CLAUDE.md §6: "Flaky test düzeltilir veya
kaldırılır."
→ **`T-006 KUSURU`** (hem test hem paylaşılan flush bu sürümde doğdu)
**Düzeltme:** rate-limit testlerini kendi vitest projesine/`fileParallelism:
false` bloğuna al **veya** (tercih edilen) sayaç anahtarına test koşusuna özgü
bir önek enjekte et (`RATE_LIMIT_KEY_PREFIX`'i `rate-limit.service.ts:33`'ten
**export et** — solid L-8(a) bunu zaten istiyor — ve `ApiEnv`'den
türetilebilir kıl); böylece hem çapraz-dosya hem çapraz-süreç girişim biter.
— **Sorumlu: qa (+ S8 önek export'u)**

**S3-10** — `apps/api/src/auth/auth-instance.ts:364-365`
(`disableOriginCheck: env.NODE_ENV === 'test'`) — **tek bir ortam değişkeni
değeri, tüm delege `/auth/*` uçlarının CSRF/origin korumasını kapatıyor** ve
bu durum HTTP seviyesinde **pinli değil**. Ölçüldü (§3): `NODE_ENV=test` →
`POST /auth/sign-out` + `Origin: https://evil.example.com` → **200
`{"success":true}"`** (oturum gerçekten kapandı); `NODE_ENV=development` →
**403 `INVALID_ORIGIN`**. Varsayılan **fail-closed** (`env.ts:67`
`.default('development')`, enum üç değerle sınırlı) ve `NODE_ENV=test` ile
yapılmış bir dağıtım `useSecureCookies`'i de kapatacağı için başka bir yolla
da fark edilir — bu yüzden `low`. Kalan gerçek boşluk: süitte bu kontrolün
dev/prod'da **AÇIK olduğunu** HTTP seviyesinde doğrulayan bir test **yok**
(`auth-flow.test.ts:117` yalnızca `auth.options` nesnesini pinliyor), yani
birisi koşulu `true`'ya sabitlerse **hiçbir test kırılmaz**.
→ **`T-006 KUSURU`** (alan bu sürümde yazıldı)
**Düzeltme:** `auth-flow.test.ts`'e `apiEnv: {...BASE_ENV, NODE_ENV:
'development'}` ile tek bir HTTP testi: `POST /auth/sign-out` + `Cookie` +
`Origin: evil` → **403** ve oturum **hayatta**. Benim ölçümüm bu testin
birebir iskeletidir.
— **Sorumlu: qa (test), S5 (gerekçe yorumu)**

**S3-11** — `pnpm audit` → `multer` GHSA-q7qp-rjg7-q26m (`high`, DoS,
`>=2.0.0 <2.5.0`, geçişli: `@nestjs/platform-express` → `multer`, 4 yol).
**T-006 ÖNCESİNDEN**; FIX turu 2 yeni bağımlılık **eklemedi**, `better-auth`
ve `nodemailer` **yeni zafiyet getirmedi** → **AC11 karşılanıyor** (mevcut 1
`high` aşılmadı). Vade **v0.0.16**. Bugün istismar yüzeyi **yok**: dosya
yükleme ucu bu sürümde **mevcut değil** (`multer` hiç devreye girmiyor).
→ **`ÖNCEDEN VAR OLAN BORÇ`** (v0.0.16)
— **Sorumlu: devops/release (kayıt)**

---

## ÖLÇÜMLER

| Ölçüm                                                | Değer                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`pnpm audit`**                                     | **critical 0 · high 1 · moderate 0 · low 0** (`multer`, T-006 öncesi, v0.0.16)                                                                                                                                                                                                                                                                                                                                                                                         |
| `pnpm lint`                                          | **exit 0** — 15/15 görev                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `pnpm typecheck`                                     | **exit 0** — 15/15 görev                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `pnpm test`                                          | **1. koşu: exit 1** (api 6 düştü / 297 geçti) → `platform:auth:*` flush → **2. koşu: exit 0, 510/510** (errors 41 + db 166 + api 303), 43 dosya. Bkz. **S3-9**                                                                                                                                                                                                                                                                                                         |
| `pnpm test:isolation`                                | **exit 0** — **15** test (db 14 + api 1)                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `pnpm build`                                         | **exit 0** — 12/12                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `pnpm format:check`                                  | **exit 1 — 4 dosya:** `T-006-{qa,security,solid}-tur2.md` + `auth-secret-leak-assertion-fragility.qa.test.ts`. **Dördü de gate ajanı (`qa`/`solid`/`security`) üretimi**, FIX turunun üretim kodu değil. Üretim/test kaynak ağacının geri kalanı temiz                                                                                                                                                                                                                 |
| **İncelenen dosya (tam okunan)**                     | **24** — 9 üretim `apps/api/src/auth/**` (`auth-instance`, `same-origin.guard`, `auth.tokens`, `auth.module`, `rate-limit.guard`, `smtp-mail-transport`, …) · 3 `errors/**` · 4 `prisma`/`redis` · 4 `packages/{db,config}/src` (`client.ts`, `tenant-context.ts`, `index.ts`, `env.ts`) · `eslint.config.mjs` · ADR-0008 · 2 test/helper/pin                                                                                                                          |
| Okunan üretilen/kütüphane kaynağı                    | **3** — `packages/db/generated/internal/class.ts` (`PrismaClient` arayüzü, `$extends`/`$transaction` imzaları), `generated/internal/prismaNamespace.ts:1333` (`TransactionClient` tanımı), `better-auth@1.7.14` origin-check davranışı (bu turda **kaynak değil, HTTP ile** ölçüldü)                                                                                                                                                                                   |
| **Yazılan/koşturulan prob**                          | **11** — 2 tip probu (`p5`, `p6`) + 9 davranış probu (`$extends` runtime, `PRISMA_CLIENT` DI, SMTP ×5 mod, SameOrigin a–d, ham soket e–g, Better Auth dev-mode, log olayları, Redis ulaşılamaz ×2, Redis parola). **Tamamı SİLİNDİ**, çıktılar scratchpad'de                                                                                                                                                                                                           |
| **Kaçış kapısı araması**                             | **9 yol denendi:** `$extends` (**AÇIK**) · `$extends().$transaction` (**AÇIK**) · `tx.$extends` (kapalı, TS2339) · `$on` (çağrılamaz) · `$use` (Prisma 7'de yok) · `$connect`/`$disconnect` (ilgisiz) · `PRISMA_CLIENT` DI (kapalı, Nest reddetti) · `AUTH_PRISMA_CLIENT`/`AUTH_SESSION_READER` (kapalı) · `withTenant`+`Parameters<>` (**latent**, DI'dan ulaşılamaz)                                                                                                 |
| SMTP arıza modu                                      | **5** (550 alıcı reddi · 530/535 kimlik doğrulama + gömülü kullanıcı/parola · selamlama zaman aşımı · protokol hatası · DNS hatası) → **5/5'te** ham e-posta/host/kimlik bilgisi **YOK**                                                                                                                                                                                                                                                                               |
| `SameOriginGuard` vakası                             | **10** (a, a2, b, c, c2, d, d2, e, e2, f, g, g2 — 4'ü ham soketle) → fail-closed dalların **hepsi 403**, güvenli metot 200, `Referer` fallback çalışıyor                                                                                                                                                                                                                                                                                                               |
| Better Auth karşılaştırma vakası                     | **5** (`NODE_ENV=development` ile) → `INVALID_ORIGIN` ×2, `MISSING_OR_NULL_ORIGIN` ×1, `Referer` 200, güvenilir `Origin` 200 → **eşdeğerlik DOĞRULANDI**                                                                                                                                                                                                                                                                                                               |
| **Tenant izolasyon listesinden karşılanmayan madde** | **2 · 5 · 8 · 13.** Bunlardan **2, 8, 13** bilinçli + belgelenmiş sapma (tur 2 ile aynı); **madde 5 YENİ ve belgelenmemiş** → S3-1                                                                                                                                                                                                                                                                                                                                     |
| DB ölçümü — RLS                                      | `tenant_membership` **t/t** + politika `tenant_membership_tenant_isolation`; `session`/`account`/`verification`/`app_user`/`tenant`/`_prisma_migrations` **f/f** — **tur 2 ile birebir aynı**                                                                                                                                                                                                                                                                          |
| DB ölçümü — KVKK                                     | `SELECT length(ip_address), length(user_agent), count(*) FROM session GROUP BY 1,2` → **tek grup: `0, 0, 2387`** → 2387 satırın tamamı boş dize, kişisel veri **tutulmuyor**                                                                                                                                                                                                                                                                                           |
| DB ölçümü — `$extends` etkisi                        | `account.count()` (genişletilmiş istemciyle, tenant context'siz) → **1844**                                                                                                                                                                                                                                                                                                                                                                                            |
| Bulgu dağılımı                                       | **critical 0 · high 1 · medium 1 · low 9**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Tur 2 bulgularının kaderi                            | **KAPANDI 9/10** (S-1 · S-2 · S-3 · S-4 · S-5 · S-6 · S-7 · S-8 · + S-1'in dördüncü kapısı) · **AÇIK 2** (S-9 ortam → S3-8, S-10 kabul → değişmedi)                                                                                                                                                                                                                                                                                                                    |
| **Çalıştırılmadı**                                   | `pnpm test:e2e` (v0.0.19) · `pnpm test:visual` · `pnpm test:contract` (bu sürümde konu doğmuyor) · Lighthouse/k6 (`perf` koşmuyor) · **gerçek üretim SMTP sağlayıcısıyla allowlist doğrulaması** (sağlayıcı yok; yerine sahte sunucuya **kasıtlı gömülü kimlik bilgisi** konarak ölçüldü — §2 mod 2) · **`$extends` boşluğunun gerçek bir üretim ucundan istismarı** (`apps/api/src`'de `$extends` kullanımı **0**; senaryo yapısal çıkarım, veri erişimi ise ÖLÇÜLDÜ) |

---

## FAIL'i kaldıran asgari küme

1. **S3-1** (`high`, tek başına FAIL üretiyor) — `packages/db/src/client.ts:102`:
   `Omit<PrismaDatabase, AuthModelName | '$transaction' | '$extends'>` +
   `auth-model-narrowing.pin.ts`'e `pinAppPrismaDatabaseDropsExtends` negatif
   pini. `apps/api/src`'de `$extends` kullanımı **0** olduğu için hiçbir çağrıyı
   kırmaz. **Üçüncü parça (jenerik `$`-metot pini) atlanabilir ama atlanırsa
   dördüncü bir kapı için dördüncü bir tur gerekir** — ve bu son turdu.
2. **S3-2** (`medium`) — ADR-0008 `:100` ve `:114` gerçekle uyumlanır;
   `$extends` (ve S3-6'nın latent yolu) kalan risk listesine yazılır.
   **S3-1 ile AYNI PR'da olmalı** — aksi hâlde ADR yine olmayan bir kontrolü
   kapalı gösterir.

Bu ikisi kapanırsa kalan **9 `low`** teknik borca kaydedilir ve gate **PASS**
olur (AGENT_BASELINE §4: yalnızca `low` → PASS).

**Commit öncesi mutlaka iletilmesi gerekenler (bir sonraki tur YOK):**

- **S3-8** — devops'a: `docker stop arkesoft-redis` ile yapılan Redis ölçümleri
  **geçersiz**; port çakışması runbook'a girmeli.
- **S3-9** — qa'ya: `pnpm test` bu makinede **hermetik değil**; CI'da aynı
  sınıf kırılma (paralel dosyalar, aynı IP) **beklenmeli**.
- **S3-6** — architect'e: `PRISMA_CLIENT` **asla** `exports`'a eklenmemeli;
  bu kısıt ADR-0008'e yazılı değil.

---

## Not — AGENT_BASELINE §4'e uyum beyanı

Bu son turdu ve `FAIL` vermek Task'ı `ESCALATED` yapıyor. Şiddet dereceleri
**gevşetilmedi**: tek `high`, tur 2'de aynı sınıf için verdiğim `high` ile
**tutarlı**; `critical` **verilmedi** çünkü bugün dış saldırgana açık bir
sızıntı **ölçülemedi** ve `apps/api/src`'de `$extends` kullanımı **sıfır**.
Tersi de yapılmadı: `$extends` kapısının **kapandığını** yazmak, ADR-0008:101'in
kendi diliyle "belgelenmiş ama gerçekleşmeyen bir kontrol" üretmek olurdu —
üç turda üç kez düşülen tuzağın dördüncüsü. **Gerçekten açık olanı "kapandı"
yazmaktansa `ESCALATED` çok daha iyi.** Düzeltme maliyeti ölçüldü ve küçüktür:
bir `Omit<>` birleşimine **bir jeton**, bir negatif tip pini, iki ADR paragrafı.
