# T-006 — solid gate, Tur 1

- **Tarih:** 2026-10-29
- **Sürüm:** ROADMAP v0.0.5 (Kimlik doğrulama — Better Auth)
- **Dal:** `main`
- **Araç kısıtı:** `Bash` YOK. Hiçbir komut çalıştırılmadı; tüm ölçümler `Read`/`Grep`
  ile yapılan statik tespitlerdir. Çalıştırılamayan ölçümler "ölçülemedi (araç yok)"
  olarak işaretlendi. **Hiçbir komut çıktısı uydurulmadı.**

```
GATE: solid
SONUÇ: FAIL
```

FAIL gerekçesi (AGENT_BASELINE §4, mekanik): **1 high** (tek başına FAIL) **+ 8 medium**
(≥3 medium tek başına FAIL). `critical` yok. Bulguların tamamı **tasarım/bakım
kalitesi**; davranışsal güvenlik ihlali, `any`, katman ihlali veya döngüsel bağımlılık
**bulunmadı** — bu sürümün mühendislik disiplini genel olarak yüksektir (ayrıntı:
"Temiz çıkan kontroller").

---

## 0. Madde 1 — ÜÇ KAPSAM DIŞI DOKUNUŞ, ayrı yargı

### 0.1 S6 → yedi mevcut test dosyası: **GEREKLİ / MİNİMAL**

İddia doğrulandı: hiçbir `expect` gevşetilmedi. `git diff` **okunamadı** (`Bash` yok),
bu yüzden dosyaların **mevcut hâli** satır satır okundu ve her dokunuşun şekli tespit
edildi:

| Dosya                                       | Dokunuşun şekli                                                                               | Yargı                                 |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------- |
| `tenant-guard.test.ts:39-42`                | `RequestContext` fixture'ına zorunlu yeni alan `auth: {kind:'pending'}`                       | **GEREKLİ/MİNİMAL** (tip zorunluluğu) |
| `error-mapping.test.ts:171-175`             | aynı — `auth: {kind:'pending'}`                                                               | **GEREKLİ/MİNİMAL**                   |
| `tenant-resolution.test.ts:30-34`           | `authenticatedCookieForTenant()` ön adımı eklendi; AC assert'leri aynı                        | **GEREKLİ/MİNİMAL**                   |
| `concurrency.test.ts:68-72`                 | beş tenant'a üye tek kimlik kuruluyor; odak (ALS karışması) değişmedi                         | **GEREKLİ/MİNİMAL**                   |
| `validation.test.ts:31-35`                  | ön kimlik; "AC14'ün KENDİ assert'leri (400/201, details.fields) DEĞİŞMEDİ"                    | **GEREKLİ/MİNİMAL**                   |
| `log-correlation.test.ts:119-123`           | eşleşme **GÜÇLENDİRİLDİ**: `msg` tek başına yetmez, `requestId` header'la birebir eşit olmalı | **GEREKLİ/MİNİMAL (güçlendirme)**     |
| `auth-delegation-allowlist.test.ts:100-120` | ön kimlik + DEMO_SEED üyeliği; **dört 404 assert'i korundu** (`:142,:150,:158,:167`)          | **GEREKLİ/MİNİMAL**                   |

Gevşetme arandı ve **bulunamadı**: `expect(true)`, `toBeTruthy()`, `skip`, `todo`,
`expect.assertions(0)` taramaları bu yedi dosyada **temiz** (tek `expect(true)`
istisnası S6'nın **yeni** dosyasında — bulgu H-1).

### 0.2 S8 → `create-test-app.ts` koşulsuz Redis flush: **GEREKLİ / MEŞRU, ama borç bıraktı**

- **Meşruiyet:** PO sahiplik tablosu bu dosyayı "SIRALI PAYLAŞIMLI (S5 → S6)" olarak
  tanımlıyor; S8 **son yazıcı** ve yalnızca **ekleme** yapmış (`:26-42` yorum,
  `:63-79` fonksiyon, `:157-159` çağrı). Mevcut hiçbir opsiyon alanı kırılmamış.
  **Sahiplik ihlali YOK.**
- **Gereklilik:** `RateLimitGuard` global (`APP_GUARD`) + sayaçlar **platform
  kapsamlı** + tüm test dosyaları **aynı Redis'e aynı loopback IP'den** bağlanıyor →
  çapraz dosya sayaç birikmesi S8 öncesi yazılmış 8 testi kırıyor. Bu **gerçek** bir
  teknik zorunluluk; alternatifi (opt-in bayrak) **sahibi olmadığı 8 dosyaya dokunmayı**
  gerektirirdi. Verilen kısıtlar altında **daha az invaziv** olan yol seçilmiş.
- **Sahte yeşil mi? HAYIR.** Flush `app.init()`'ten **sonra bir kez** koşar; eşik
  davranışı aynı app örneği üzerinde gerçek HTTP ile ölçülür ve **eşikler
  gevşetilmemiş**: `rate-limit.test.ts:485` (5 → 6. istek 429), `:569` (20 → 21.),
  `:607` (3 → 4.), `:723` (var olan/var olmayan e-posta ayırt edilemez). Flush'ın
  işlevi DB truncate'in işleviyle aynı: **test izolasyonu**, assert gevşetmesi değil.
- **Bıraktığı borç:** bulgu L-4 (önek literali tek doğruluk kaynağından kopuk +
  paylaşılan fabrikada koşulsuz yan etki).

**Yargı: GEREKLİ / MİNİMAL (borç kaydıyla).**

### 0.3 S3 → `tenant-guard.test.ts` eklemesi: **GEREKLİ / MİNİMAL**

`pending → 500` davranışını doğrulayan test gerçekten yoktu; DoD bunu istiyor.
`tenant-guard.test.ts:55` `expect(() => guard.canActivate(...)).toThrow(...)` —
mevcut hiçbir assert'i değiştirmeyen, **tek yönlü ekleme**. `auth.guard.ts`'in
simetrik `pending` dalı da `auth-guard.test.ts:81,96`'da pinlendi. **Yargı: GEREKLİ /
MİNİMAL.**

---

## BULGULAR

### [SEV: high]

**H-1** — `apps/api/src/__tests__/auth-secret-leak.test.ts:148-195` — **davranışı test
etmeyen test.** İkinci `describe` bloğunun tek assert'i `:193` `expect(true).toBe(true)`
— **hiçbir koşulda kırılamaz**. Blok, `better-call router.mjs:93`'ün `console.error`
çağrısının **ham `DATABASE_URL` şifresini sızdırıp sızdırmadığını** ölçüyor (`:183-185`
`rawErrorText.includes('wrong')`) ama sonucu **assert etmek yerine `console.info` ile
yazdırıyor** (`:172,:180,:182`). Sızıntı varsa test **yeşil kalır**; yoksa da yeşil
kalır. Üç ayrı sorun: (a) tautolojik assert, `pnpm test` sayısını şişirir ve "kapsandı"
izlenimi verir — CLAUDE.md §6 "`test.skip` ile kalıcı susturma yasak" maddesinin daha
sinsi biçimi; (b) bir **sır sızıntısı ölçümü** kod tarafında **pinlenmemiş** — sonuç
yalnızca test stdout'unda, kalıcı denetim kaydı yok; (c) `console.info` + üç
`eslint-disable no-console` (CLAUDE.md §4 `console.*` yasağı) ölçüm raporu için
kullanılıyor, oysa ölçümün yeri **ajan raporu**, kalıcı test değil.
**Önerilen düzeltme:** bloğu ikiye ayır — (1) **gerçek assert**: `expect(rawErrorText)
.not.toContain('wrong')` (sızıntı yoksa bu kalıcı bir regresyon kapısıdır; varsa test
kırmızı olur ve bulgu `security`'ye gider, hangisi doğruysa **o** kayda geçer);
(2) ölçüm metinleri testten **çıkarılıp** `security`/`qa` raporuna taşınsın.
`expect(true).toBe(true)` **silinsin**. — **Sorumlu: S6**

> Not: Sızıntının **gerçekte olup olmadığı ölçülemedi (araç yok)**. Bulgu sızıntı
> iddiası değil, **kapının yokluğu** hakkındadır.

---

### [SEV: medium]

**M-1** — `apps/api/src/auth/auth-delegated-paths.ts:76-78` ·
`apps/api/src/auth/auth-exempt-paths.ts:46-48` ·
`apps/api/src/auth/auth-own-paths.ts:29-31` ·
`apps/api/src/auth/rate-limit/rate-limit.policy.ts:98-100` ·
(mevcut) `apps/api/src/tenancy/tenant-exempt-paths.ts:74-76` — **aynı saf yol
normalizasyonunun BEŞ kopyası**; dördü bu Task'ta doğdu.

```ts
const { pathname } = new URL(rawUrl, 'http://…invalid')
const normalizedPathname =
  pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
```

Bu **yüzeysel benzerlik değil, gerçek tekrar**: dört dosyanın kendi yorumu
"`tenant-exempt-paths.ts` ile **BİREBİR AYNI** normalizasyon" diyor
(`auth-exempt-paths.ts:41-43`, `auth-own-paths.ts:25-26`, `rate-limit.policy.ts:90-92`,
`auth-delegated-paths.ts:67-73`) — yani **aynı sebeple birlikte değişmek zorunda**
olduğu açıkça beyan edilmiş. Beş kopyadan biri (ör. sorgu dizesi veya büyük/küçük harf
semantiği) sessizce ayrışırsa **fail-closed/fail-open kararları arasında tutarsızlık**
doğar ve hiçbir test bunu yakalamaz. Bu Task architect/PO kısıtı 4 ile **tam bu
gerekçeyle** `assertNever`'ın üç kopyasını birleştirmeyi **zorunlu** kıldı (dördüncü
kopya doğmasın diye); aynı standart burada uygulanmamış.
**Önerilen düzeltme:** `apps/api/src/http/normalize-request-path.ts` (saf, DI'sız,
framework-bağımsız) → beş çağıran onu import eder. `tenancy → auth` bağımlılığı
**doğmaz** (ortak dosya `http/` altında, iki modülden de bağımsız) — PM R3 ihlal
edilmez. — **Sorumlu: S5 (2 kopya), S6 (2 kopya), S8 (1 kopya)**

**M-2** — `apps/api/src/auth/auth.controller.ts:52-70` ·
`apps/api/src/auth/auth-context.middleware.ts:47-65` ·
`apps/api/src/auth/sessions.service.ts:52-70` — **`toWebHeaders()`'ın ÜÇ birebir
kopyası.** Üçü de `IncomingHttpHeaders` → Web `Headers` dönüşümünü aynı şekilde
(dizi `append`, `undefined` atla, tekil `set`) yapar; üçü de aynı tüketici için
(Better Auth'un Web `Request`/`getSession` yüzeyi) vardır → **aynı sebeple değişir**.
Gerekçe olarak iki dosyada **dosya sahipliği** yazılmış
(`auth-context.middleware.ts:42-45` "İTHAL EDİLEMEZ — o dosya S5'in",
`sessions.service.ts:51` "S5'in dosyası değiştirilmez"). Dosya sahipliği bir **süreç
kısıtıdır, tasarım gerekçesi değildir**; beş yıl sonra kodu okuyan kişi üç kopyanın
sebebini kodda bulamaz. Ayrıca kopyalardan birinin (ör. `set-cookie` çoğul başlık
davranışı) ayrışması Better Auth'a giden isteğin sessizce farklılaşmasına yol açar.
**Önerilen düzeltme:** `apps/api/src/http/to-web-headers.ts` (saf fonksiyon, mevcut
`http/http-request.types.ts`'in yanına) → üç çağıran import eder. Sahiplik çatışması
**Orkestratör kararıyla** çözülür; gate turunda bu dosya tek bir sahibe verilmelidir.
— **Sorumlu: S5 + S6 (Orkestratör sahiplik kararı gerekir)**

**M-3** — `apps/api/src/auth/auth-exempt-paths.ts:17-19` — **dosya başı yorumu var
olmayan bir mekanik garantiyi iddia ediyor.** Yorum birebir şunu diyor: _"ayrıca
`auth-path-sets.test.ts`'in ÜÇÜNCÜ testi tam bu YEDİ literalin
`AUTH_DELEGATED_PATHS`'teki (yöntem, yol) çiftleriyle birebir örtüştüğünü MEKANİK
olarak doğrular; sapma orada YAKALANIR."_ **Böyle bir test YOK.**
`auth-path-sets.test.ts`'in üçüncü bloğu (`:63-84`) şunları doğrular:
(1) `AUTH_DELEGATED_PATHS ⊆ TENANT_EXEMPT_PATHS` (`:64-69`),
(2) `AUTH_OWN_PATHS ⊆ TENANT_EXEMPT_PATHS` (`:71-75`),
(3) `AUTH_OWN_PATHS ∩ AUTH_EXEMPT_PATHS = ∅` (`:77-83`).
**Hiçbiri `AUTH_EXEMPT_PATHS` ↔ `AUTH_DELEGATED_PATHS` karşılaştırması yapmıyor.**
`auth-exempt-paths.test.ts:29` ise kümeyi **test dosyasına yeniden yazılmış literal
listeye** (`EXPECTED_EXEMPT_PATHS`) karşı kontrol ediyor — `AUTH_DELEGATED_PATHS`'e
hiç bakmıyor. Sonuç: yedi yolu **import etmek yerine literal yazma** kararının TEK
gerekçesi olan "sapma mekanik yakalanır" iddiası **yanlış**; sekizinci bir delege yol
eklenip `AUTH_EXEMPT_PATHS`'e eklenmezse o uç **sessizce kimlik ister** (yön
fail-closed, bu iyi — ama şifre sıfırlama gibi bir uç **çalışmaz hâle gelir** ve
hiçbir birim testi kırılmaz).
**Önerilen düzeltme:** `auth-path-sets.test.ts`'e **dördüncü** test:
`new Set([...AUTH_EXEMPT_PATHS].filter(p => p.startsWith('/auth/')))` ===
`new Set([...AUTH_DELEGATED_PATHS].map(extractPath))`. Test yazılmazsa yorum
**düzeltilmelidir** — yanlış yorum, yorumsuzdan kötüdür. — **Sorumlu: S6**

**M-4** — `apps/api/src/auth/mail/messages.ts:134` + `apps/api/src/auth/auth-instance.ts:69`
— **derleme zamanı anahtar garantisi, var olmayan bir tüketici için feda edilmiş
(erken genelleme).** `renderMailMessage(key: string, …)` bilerek daraltılmamış `string`
alıyor; gerekçe `:130-132` "ileride kuyruk payload'ından okunan `messageKey`" — yani
**v0.0.11'in henüz var olmayan** tüketicisi. Bedeli bugün ödeniyor:
`MailMessageKey` (`:115`) **export edilmiş ama hiçbir yerde kullanılmıyor**, ve tek
gerçek çağıran `auth-instance.ts:69` anahtar birleşimini
`'auth.emailVerification' | 'auth.passwordReset'` olarak **ikinci kez elle yazıyor**.
Sonuç: katalogdaki bir anahtar yeniden adlandırılırsa `auth-instance.ts` **derlenmeye
devam eder** ve hata ancak **gerçek kayıt/şifre-sıfırlama isteğinde** çalışma anında
patlar (`:136` throw → `MailDeliveryFailedError` → **503**). Yani "eksik anahtar sessiz
geçmesin" amacı, kolayca derleme zamanında verilebilecekken **üretim isteğine**
ertelenmiş.
**Önerilen düzeltme:** `renderMailMessage(key: MailMessageKey, …)` (derleme zamanı
garantisi) + dış kaynaklı anahtarlar için ayrı `parseMailMessageKey(raw: string):
MailMessageKey` (mevcut `isMailMessageKey` guard'ı zaten var); `auth-instance.ts:69`
yerel birleşimi silip `MailMessageKey`'i import etsin. — **Sorumlu: S4 (imza) + S5
(çağıran)**

**M-5** — `apps/api/src/auth/auth-context.middleware.ts:114-118` — **architect'in
bağlayıcı LOG DESENİ'ndeki `logger.child({ userId })` UYGULANMAMIŞ.** Tasarım birebir
şunu yazıyor: _"Taban + **`userId`** (`AuthContextMiddleware` → `logger.child({userId})`,
`tenantId` child'ının **üzerine** → §7 madde 13 ✓)"_. Kodda `context.auth` yazılıyor
ama `context.logger` **değiştirilmiyor**; karşılaştırma noktası
`tenancy/tenant-context.middleware.ts:53`'te desen zaten kurulu
(`context.logger = context.logger.child({ tenantId })`).
Ölçülen sonuç (`Grep`): `apps/api/src`'te `logger.child` **tek** üretim çağrısı var
(tenant), `userId` taşıyan log satırı **ikidir** (`auth.guard.ts:105`,
`auth-context.middleware.ts:106`) — ikisi de `warn`. Yani **başarılı** bir isteğin
hiçbir log kaydı (`request-logging.interceptor.ts:56`'nın "istek tamamlandı" kaydı
dahil) `userId` **taşımıyor**. Bu CLAUDE.md §4 "Log formatı — **Her kayıtta şunlar
bulunur**: … `userId` …" maddesinin doğrudan karşılanmaması ve v0.0.5'in §7 madde 13'ü
"ilk kez uygulanabilir hâle getiren sürüm" olma iddiasının boşa düşmesidir. Yan etki:
bir hesabın ne zaman girdiği/çıktığı/oturum sonlandırdığı **loglardan izlenemez**
(architect'in `info` iş olayı listesi — kayıt / doğrulama e-postası / giriş / çıkış /
oturum sonlandırıldı — kodda **hiç** yok; tek `info` kaynağı jenerik istek logu).
**Önerilen düzeltme:** `authenticated` dalında
`context.logger = context.logger.child({ userId: result.user.id })`
(+ `request-context.types.ts:67-69`'un "TEK YAZICI `TenantContextMiddleware`" yorumu
güncellenir) ve en az `oturum sonlandırıldı` için bir `info` olayı
(`sessions.service.ts`). — **Sorumlu: S6**

**M-6** — `apps/api/src/auth/rate-limit/rate-limit.guard.ts:115-119` — **IP sayacı
BAŞARILI istekleri de sayıyor; K3 "başarısız" diyor.** Guard, IP kapsamını
`policy.ipLimit` için handler'dan önce **koşulsuz** artırıyor ve
`RateLimitAccountResetInterceptor` (`:190-232`) sıfırlamayı **yalnızca `account`
kapsamında** yapıyor (`:207-211`, yorum `:36` "IP sayacı SIFIRLANMAZ — K3 yalnızca
hesabı anar"). K3'ün metni ise: _"IP başına **20 başarısız** / 15 dk"_. Uygulanan
davranış "20 **deneme**/15 dk"dır. Varlık-sızdırmazlık kısıtı **ön artırımı** zorunlu
kılıyor (bu doğru), ama başarıdan sonra IP sayacını **düşürmeyi/sıfırlamayı**
engellemez — başarı sonrası sıfırlama hiçbir varlık bilgisi sızdırmaz (sayaç zaten
artırılmıştır). Pratik sonuç: paylaşılan NAT/ofis IP'sinden 15 dk içinde 20 **başarılı**
giriş yapan meşru kullanıcılar 429 alır; `AUTH_TRUSTED_PROXY_COUNT=0` varsayılanıyla
ters vekil arkasında bu **tüm platformu** kapsar (architect riski 4 bu yüzeyi XFF
açısından not etmiş, ancak **başarıların da sayıldığını** not etmemiş → risk ölçüsü
eksik yazılmış). Ek olarak bu yol **test edilmemiş**: `rate-limit.test.ts:569`
yalnızca 20 **başarısız** denemeyi kapsıyor; "başarılı girişler IP sayacını tüketir mi"
senaryosu yok.
**Önerilen düzeltme:** ya (a) `resetAccountOnSuccess` deseninin IP eşdeğeri eklenir
(2xx'te IP sayacı da sıfırlanır/azaltılır) ve negatif test yazılır, ya da (b) K3'ten
**bilinçli sapma** olarak kayda geçirilir (ROADMAP teknik borç + `rate-limit.policy.ts`
yorumu) ve architect riski 4 bu ölçüyle güncellenir. Davranışsal şiddet takdiri
`qa`/`security`'ye aittir — solid'in tespiti **karar ile uygulama arasındaki sapma** ve
**eksik negatif test**tir. — **Sorumlu: S8 (uygulama) + architect (K3 sapma kaydı)**

**M-7** — `docs/development.md:520` · `:561-562` · `:576` · `:547` — **auth bölümünde
doğrulanabilir dört hata; biri çalışmayan runbook komutu, biri uydurma kimlik bilgisi.**

1. `:520` — `curl http://localhost:8025/api/v1/messages | jq '.data[0].Raw.Data' |
grep -oP 'verify\?token=\K[^&]*'` **çalışmaz, üç ayrı sebeple**: Mailpit liste
   yanıtının kökü `{ total, messages[] }`'tir, `.data` **yoktur**
   (`__tests__/helpers/mailpit-client.ts:36-39`, Zod şeması gerçek API'ye karşı
   doğrulanmış); liste öğesinde `Raw.Data` **yoktur** (özet şeması `:28-34`, gövde
   ancak `/api/v1/message/{id}`'den gelir, `:42-49`); ve bağlantının yolu
   `/auth/verify-email?token=` olduğu için `verify\?token=` regex'i **eşleşmez**
   (`auth-instance.ts:138`).
2. `:561-562` — `AUTH_TRUSTED_PROXY_COUNT` algoritması **tersine anlatılmış**: "XFF'in
   **ilk** adresi (ingress IP) yok sayılır" deniyor; `client-ip.ts:61-72` ise
   `index = max(hops.length - N, 0)` ile **sağdan N girdiyi** atıyor — XFF'in **ilk**
   (en sol) girdisi **istemcidir**, ingress değil. Tek vekilli kurulumda önerilen değer
   tesadüfen doğru çıkar, ama çok vekilli kurulumda operatör ters yönde akıl yürütür.
3. `:576` — "demo kullanıcı (`demo@example.com` / `password`)" **uydurma**: gerçek
   değer `packages/db/src/seed-data.ts:26` → `demo-yonetici@arkesoft.test`, ve
   `seed-data.ts:4-6` "**Hiçbir sır/parola/token/API anahtarı İÇERMEZ**" diyor — seed
   bir **parola tanımlamıyor**, dolayısıyla `password` diye bir kimlik bilgisi yok.
4. `:547` — "Giriş ve şifre sıfırlama uçlarında oran sınırlaması vardır" **eksik**:
   kullanıcı onaylı kapsam genişletmesi `/auth/sign-up/email` ve
   `/auth/send-verification-email` uçlarını da kapsıyor (`rate-limit.policy.ts:78-85`,
   **3/saat hesap · 10/saat IP**). Belge dört rotadan ikisini ve ikinci eşik çiftini
   hiç anmıyor; `:555` de yalnızca "5, 20, 15 dakika" diyor.

Dördü de **kod okunarak** doğrulandı; hiçbiri çalıştırma gerektirmedi.
**Önerilen düzeltme:** `:520` komutu `mailpit-client.ts`'in gerçek yollarına göre
yeniden yazılsın (veya "arayüzü `:8025`'te açın" ile değiştirilsin); `:561-562` XFF
anlatımı `client-ip.ts:16-22` yorumundan **birebir** türetilsin; `:576` seed değerleri
`seed-data.ts`'ten alınsın ve "seed parola üretmez" gerçeği yazılsın; `:547/:555`
dört rota + iki eşik çifti tabloya dönüştürülsün. — **Sorumlu: S9**

**M-8** — `docs/adr/0008-sir-tasiyan-tablolarin-tipi-ve-linti-ile-korunmasi.md` —
**kabul edilmiş bir ADR'de altı doğrulanabilir sapma.** ADR, R-1 kararının kalıcı
denetim kaydıdır; bugünkü hâliyle kodu **yanlış** tarif ediyor:

1. `:18` — "Parola doğrulaması uygulama kodunda (**`bcrypt`** doğrulaması) yapılır".
   Better Auth varsayılanı **scrypt**'tir; T-006 Task dosyasının R-1 bölümü de
   "**scrypt** doğrulaması uygulama kodunda" diyor. ADR, Task'ın kendi metniyle çelişiyor.
2. `:58-70` — gösterilen eslint bloğu **repoda yok**: gerçek kural
   `apps/api/eslint.config.mjs:50` ve `importNames` **üç** jeton taşıyor
   (`['PrismaDatabase', 'AuthPrismaDatabase', 'AUTH_SECRET_BEARING_MODELS']`), ADR
   yalnızca birini gösteriyor. Ayrıca `selector` / `include` / `exclude` alanları
   `no-restricted-imports` seçeneği **değildir** — ADR çalışmayan bir yapılandırma
   örneği veriyor.
3. `:80` — "`toErrorBody` serializer'ı `account.password`, `session.token`,
   `verification.value` alanlarını asla içermez. **AC6** 'oturum listesi ham token
   içermez' … testi bu garantiyi doğrular." İki ayrı mekanizma karıştırılmış:
   `toErrorBody` **hata gövdesini** üretir; AC6 garantisini veren yer
   `sessions.service.ts:72-77`'nin açık `SESSION_SUMMARY_SELECT`'idir.
4. `:155` — CLAUDE.md §7 madde numaraları **yanlış/yer değiştirmiş**: "Madde 2
   'Prosedür `tenantProcedure` mi'" (gerçekte madde **4**), "Madde 4
   '`tenant_membership` kontrolü'" (§7'de böyle bir madde yok).
5. `:159` — "borç tablosu **satırları 683 ve 684**" — `ROADMAP.md`'ye **satır numarası**
   ile atıf; ilk eklemede kayar, kalıcı belgede sürdürülemez.
6. `:140,:144,:146,:165,:169` — "Darlama", "modül saplantıya dönüşür", "fab rikatörü",
   "Üzün yolu", "reddetilmiş" + `:169`'un Prisma `omit`/sürüm anlatısı Task dosyasının
   gerekçesiyle (`omit` → "Better Auth'un kendisini kırar") örtüşmeyen, doğrulanamayan
   ayrıntılar içeriyor.

**Önerilen düzeltme:** 1–5 düzeltilsin (2 için gerçek `eslint.config.mjs:41-55` bloğu
kopyalansın; 5 için satır numarası yerine **başlık** atfı); 6'da doğrulanamayan
ayrıntılar **silinsin** — ADR'de "ölçülmedi" yazmak, uydurmaktan iyidir.
— **Sorumlu: S9**

---

### [SEV: low]

**L-1** — `apps/api/src/auth/sessions.service.ts:39` — `AUTH_PRISMA_CLIENT` DI token'ı
**servis dosyasında** tanımlı; `auth.module.ts:55` onu servis modülünden import ediyor
(`import { AUTH_PRISMA_CLIENT, SessionsService } from './sessions.service.js'`).
Projede DI token'larının yeri belli: `auth/auth.tokens.ts`, `config/config.tokens.ts`,
`logging/logging.tokens.ts`, `health/health.tokens.ts`. Gerekçe olarak yazılan
"`auth.tokens.ts` S5'in, DEĞİŞTİRİLMEZ" (`:12-14`) bir **süreç** kısıtıdır; sonuç,
token aramak isteyen kişinin `*.tokens.ts` dosyalarına bakıp bulamamasıdır.
**Düzeltme:** token `auth.tokens.ts`'e taşınsın (saf ekleme). — **Sorumlu: S6**

**L-2** — `apps/api/src/auth/auth-own-paths.ts:17-34` — **üretim tüketicisi olmayan
export.** `Grep` ölçümü: `isAuthOwnPath` ve `AUTH_OWN_PATHS` yalnızca
`__tests__/auth-path-sets.test.ts`'ten çağrılıyor; `apps/api/src` üretim ağacında
**sıfır** çağrı. Dosyanın kendi yorumu da bunu kabul ediyor (`:11-14`). `AUTH_OWN_PATHS`
Set'i (inceleme görünürlüğü + kesişim testi) savunulabilir; ancak `isAuthOwnPath()`
**test-only bir API**'dir ve aynı zamanda M-1'deki normalizasyonun **dördüncü**
kopyasıdır. **Düzeltme:** `isAuthOwnPath` silinsin (testler `AUTH_OWN_PATHS.has()`
kullanır) veya M-1'in ortak helper'ı üzerinden yazılsın. — **Sorumlu: S6**

**L-3** — `apps/api/src/errors/assert-never.ts:32-34` — **yorum, çağıranların yaptığını
yanlış tarif ediyor.** Yorum: _"bu fonksiyon HİÇBİR ZAMAN PII/sır taşıyan bir değerle
çağrılmaz — tüm çağıranlar discriminated union **ETİKETLERİ** üzerinde çalışır."_
Gerçekte dört çağırandan **üçü birleşimin TAMAMINI** geçiyor:
`auth.guard.ts:78` (`auth` — `authenticated` varyantı `userId`/`sessionId`, `failed`
varyantı `cause` taşır), `auth.guard.ts:121` (`tenant`), `error-mapping.ts:150`
(`classified` — içinde ham hata nesnesi). `:37` `JSON.stringify(value)` bunları hata
mesajına serileştirirdi. Bugün **erişilemez** (tip `never`), bu yüzden `low`; ama yorum
yanlış ve ileride birleşime üye eklenirse mesaj gerçekten veri taşır.
**Düzeltme:** ya çağıranlar `auth.kind`/`tenant.kind` **etiketini** geçsin, ya da yorum
gerçeği yazsın ("çağıranlar birleşimin tamamını geçer; `JSON.stringify` yalnızca tip
sisteminin `never` garantisi altında güvenlidir"). — **Sorumlu: S3**

**L-4** — `apps/api/src/__tests__/helpers/create-test-app.ts:64` — `'platform:auth:*'`
öneki **tek doğruluk kaynağından kopuk** yeniden yazılmış. Kanonik sabit
`rate-limit.service.ts:33` `RATE_LIMIT_KEY_PREFIX = 'platform:auth'` ama **export
edilmiyor**. Önek bir gün değişirse flush **sessizce no-op** olur ve dört rate-limit
`describe`'ı çapraz kirlenmeyle **flaky** hâle gelir — hata mesajı da nedeni
göstermez. İkinci sorun: flush, **15 test dosyasının paylaştığı** fabrikada
**koşulsuz** bir yan etkidir; bir test ileride ölçüm dizisinin **ortasında**
`createTestApp()` çağırırsa sayaçlar sessizce silinir ve o test sahte yeşile düşer
(`rate-limit.test.ts:543-547` yazarların bu riski bildiğini gösteriyor).
**Düzeltme:** `RATE_LIMIT_KEY_PREFIX` export edilip import edilsin; flush ayrıca
**adlandırılmış** bir helper olarak dışa verilsin (`flushRateLimitCounters(app)`) ve
fabrikadaki koşulsuz çağrı orta vadede opt-in'e dönsün. — **Sorumlu: S8**

**L-5** — `apps/api/src/auth/auth.module.ts:63-73` — **ikinci Prisma istemcisi/bağlantı
havuzu.** `AuthPrismaClientResource` `createPrismaClient({databaseUrl})` ile süreçte
**ikinci** bir havuz açıyor (yaşam döngüsü `OnModuleDestroy` ile doğru yönetiliyor,
`:70-72`). Gerekçe (`:4-16`) geçerli: `PrismaModule` ham `PRISMA_CLIENT` token'ını
**dışa açmıyor** ve `PrismaService.db` daraltılmış. Ama alternatif vardı:
`PrismaModule`, R-1 katman 2 lint'inin zaten koruduğu bir token'ı (`AuthPrismaDatabase`
tipiyle) **yalnızca** `AuthModule`'e export edebilirdi — lint kapısı (`src/auth/**`
istisnası) bu durumda da geçerli kalırdı. Bedel: süreç başına **2× DB bağlantı havuzu**
(k8s'te replika × 2 havuz, `perf`/`devops` ilgi alanı) ve kapanış sırasında iki ayrı
`$disconnect`. **Düzeltme önerisi (öneri, ihlal değil):** v0.0.14'te `arkesoft_auth`
rolü/ikinci havuz zaten gelecek; havuz sayısı kararı **o ADR'de** tek yerden verilsin
ve bugünkü ikinci havuz **ölçülmüş borç** olarak kaydedilsin. — **Sorumlu: architect
(v0.0.14), kayıt: S9**

**L-6** — `apps/api/src/auth/rate-limit/rate-limit.guard.ts:190` — `*.guard.ts`
dosyasında **ikinci bir enhancer türü** (`RateLimitAccountResetInterceptor`) export
ediliyor. Repoda yerleşik ad kuralı rolü dosya adında taşıyor
(`request-logging.interceptor.ts`, `app-exception.filter.ts`, `tenant.guard.ts`,
`zod-validation.pipe.ts`). CLAUDE.md §4 tablosu yalnızca **kebab-case** şart koşuyor,
bu yüzden **ihlal değil, öneri**: `rate-limit-account-reset.interceptor.ts` olarak
ayrılırsa `APP_INTERCEPTOR` kaydı dosya adından bulunabilir hâle gelir. Gerekçe olarak
yazılan "'Yeni' dosya listesine YENİ bir dosya EKLENMEDİ" (`:29-30`) bir süreç
kısıtıdır. — **Sorumlu: S8**

**L-7** — `apps/api/src/auth/rate-limit/rate-limit.guard.ts:103-179` — `canActivate`
**77 satır** ve sekiz iş yapıyor: rota çözümü → pencere seçimi → IP çözümü → IP sayacı →
gövdeden hesap anahtarı → hesap sayacı → aday toplama → "katı olan kazanır" seçimi →
log → throw. CLAUDE.md'de fonksiyon uzunluğu kuralı **yok**, bu yüzden **öneri**
(T-005'te `catalog-lint.ts`'in 587 satırını da `low` işaretledim, tutarlılık için aynı
ölçek). Okunabilirlik için `evaluateScopes(policy, req): ExceededCandidate[]` ve
`reportExceeded(candidates)` olarak ikiye ayrılabilir. — **Sorumlu: S8**

**L-8** — `apps/api/src/errors/domain/email-not-verified.error.ts` — **bugün hiçbir
üretim kod yolunda fırlatılmayan sınıf** (dosyanın kendisi `:4-22`'de dürüstçe
bildiriyor; `Grep`: `EmailNotVerifiedError` yalnızca kendi dosyası + birim testinde).
Yargım: **meşru, ölü kod olarak işaretlenmemeli.** Üç sebep: (a) architect'in HATA
SINIFLARI tablosu bağlayıcı ve `code`/`httpStatus`/`context` üçlüsünü **kararlı tel
sözleşmesi** olarak tanımlıyor — sınıf, kodun kayıt defteri; (b) K4(2)'nin HTTP
karşılığı Better Auth'un delege yanıtında zaten mevcut, yani kod **davranışsal olarak
var**, yalnızca bizim hiyerarşimizden geçmiyor; (c) sınıf 11 satır ve testi var.
**Tek talep:** v0.0.14'te hâlâ fırlatılmıyorsa **silinsin** — bu, ROADMAP borç satırı
olarak kayda geçmeli, yoksa kalıcı iskelet olur. — **Sorumlu: kayıt S9 / gözden geçirme
v0.0.14**

**L-9** — `apps/api/src/__tests__/helpers/auth-fixture.ts:55-57` — fixture `sign-up`
yanıtının durumunu **assert etmiyor**; kayıt 429/503 dönerse hata ilk olarak
`findLatestMailpitMessageTo` içinde "mesaj bulunamadı" diye yüzeye çıkar ve **yanıltıcı**
bir teşhis üretir. Aynı desen `rate-limit.test.ts:453-462` `signUpAndVerify`'da da var.
**Düzeltme:** `expect(response.status).toBeLessThan(400)` (ön koşul assert'i).
Ek olarak `:73-74` `deleteAllMailpitMessages`'ı **yeniden dışa açıyor** — çağıranlar
`mailpit-client.js`'ten doğrudan import edebilir; anlamsız sarmalayıcı (KISS).
— **Sorumlu: S6**

**L-10** — `apps/api/src/__tests__/auth-secret-leak.test.ts:132-133` — hiç gönderilmemiş
bir başlığın yokluğunu assert eden **boş geçerli** satır (yorumun kendisi "hiç
gönderilmedi" diyor). Zarar vermiyor ama assert sayısını gerçek kapsam olmadan
artırıyor; `:142`'nin `not.toContain('ipAddress')` kontrolü de **alan adı dizesine**
dayanıyor (kırılgan — alan adı değişirse sessizce geçer). **Düzeltme:** `bearer`
kontrolü ya gerçek bir `Authorization` başlığı göndererek anlamlı hâle getirilsin ya da
silinsin. — **Sorumlu: S6**

**L-11** — `packages/db/prisma/schema.prisma:91` — `emailVerified Boolean` CLAUDE.md §4
isimlendirme tablosunun "Boolean → `is`/`has`/`can` öneki" kuralına **uymuyor**
(`isEmailVerified` olurdu). **Kabul edilmesi gerekir**: Better Auth'un Prisma adaptörü
modele **Prisma alan adıyla** erişir (A-G2), alan adı `emailVerified` olmak
**zorundadır**; `fields` eşlemesi eklemek R-1'in yüzeyini büyütür. Şema yorumu
(`:76-82`) alanın neden böyle olduğunu açıklıyor ama **§4'ten bilinçli sapma olduğunu
yazmıyor**. **Düzeltme:** şemaya tek satır — "CLAUDE.md §4 boolean öneki kuralından
**kütüphane sözleşmesi gereği** sapma; `fields` eşlemesi bilinçli olarak eklenmedi."
— **Sorumlu: S2 (yorum) / kayıt S9**

**L-12** — `apps/api/src/auth/mail/mail-transport.types.ts` yerleşimi — **S4'ün kararına
KATILIYORUM, ama koşullu.** CLAUDE.md §8 dış sağlayıcı reçetesini "ödeme, kargo,
e-fatura, SMS, pazaryeri, ERP" olarak **sayıyor** — işlemsel e-posta bu listede yok; §8'in
tüm mekaniği (`TenantIntegrationConfig`, `providerRegistry`, tenant başına şifreli
kimlik bilgisi) **kiracının seçtiği** sağlayıcılar içindir. `packages/integrations`'ın
kendi `package.json:6` açıklaması da mail'i saymıyor. Dolayısıyla §3 tablosunun "dış
sağlayıcı adaptörleri" satırıyla **gerilim var ama ihlal yok**. §8'in **ruhu** ise
gerçekten uygulanmış ve bunu ölçtüm: `nodemailer` **tek** dosyada
(`smtp-mail-transport.ts:26-27`), sağlayıcıya özgü tip (`Transporter`) arayüz dışına
**sızmıyor**, `MailTransport`/`MailEnvelope` sağlayıcı-nötr, çekirdekte
`if (provider === …)` **yok**, hata `MailDeliveryFailedError`'a **çevriliyor**
(`:74-81`), `close()` bilinçli olarak arayüzün **dışında** (`:84-93`). v0.9.0
taşınabilirliği korunmuş: `SmtpMailTransportConfig` `ApiEnv`'den **ayrı** tutulmuş
(`mail-transport.types.ts:68-82`) ve env eşlemesi **yalnızca** `auth.module.ts:80-88`'de.
**Tek eksik:** "v0.9.0'da `packages/integrations/src/mail/`'e taşınacak" taahhüdü
yalnızca **dosya yorumunda** (`:14-17`) duruyor; `ROADMAP.md`'de borç satırı yok →
unutulur. **Düzeltme:** ROADMAP v0.9.0'a tek satır borç kaydı. — **Sorumlu: S9**

**L-13** — `apps/api/src/__tests__/zz-security-gate-probe.test.ts` — **inceleme
yüzeyimde olmayan, gate fazı sırasında ortaya çıkan dosya.** İlk `Glob` taramamda
**yoktu**, sonraki `Grep`'te çıktı; başlığı (`:1-2`) _"GEÇİCİ — security gate bağımsız
ölçüm probu (T-006). SİLİNECEK."_ ve `appendFileSync` ile dosyaya yazıyor (`:5`).
Üç nedenle Orkestratöre bildiriyorum: (a) AGENT_BASELINE §5 "**gate ajanları kod
düzeltmez**" ve "başka ajanın dosyasını değiştirme" maddeleri gate ajanlarının test
ağacına dosya **eklemesini** de kapsar; (b) dosya 8 `it(` bloğu içeriyor → **AC1'in
`test` sayısı ölçümünü kirletir** (473 figürü bu dosyayı içeriyor olabilir); (c)
`:121` tautolojik `expect(true).toBe(true)` taşıyor — H-1 ile aynı sınıf.
**Düzeltme:** commit öncesi **silinmesi doğrulanmalı**; test sayısı ölçümü dosya
silindikten sonra yeniden alınmalı. Alt göreve bulgu **yazmıyorum** — bu bir süreç
maddesidir. — **Sorumlu: Orkestratör / `security`**

---

## Temiz çıkan kontroller (arandı, bulunamadı)

Bu bölüm bilinçli: FAIL kararı **tasarım borcu** üzerinedir, mühendislik disiplini
üzerine değil.

| Kontrol                                                    | Sonuç                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `any` (CLAUDE.md §10.2)                                    | **0** — `apps/api/src`, `packages/db/src`, `packages/errors/src` genelinde `\bany\b` yalnızca **yorum/JSDoc** içinde (ör. `validation.test.ts:60` "`response.body` `any`'dir" açıklaması). Üretim kodunda sıfır.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `@ts-ignore` / `@ts-nocheck`                               | **0**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@ts-expect-error`                                         | **7**, **hepsi negatif pin**: `auth-model-narrowing.pin.ts:83,85,87,116,118,120` (R-1 daraltmasının mekanik kanıtı) + `prisma-with-tenant.test.ts:111`. Hata susturma **yok**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `as X` tip zorlaması (üretim)                              | **0** — `auth/**` içinde yalnızca `as const` (`sessions.service.ts:77`) ve `import type { Logger as PinoLogger }` (takma ad). `as unknown as` **yalnızca testlerde**, framework arayüzü mock'lamak için.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Boş `catch` / yutulan hata (§10.16)                        | **0** boş blok. Dört `catch` incelendi: `auth-context.middleware.ts:119` → `{kind:'failed', cause}` + `error` log → `AuthGuard` 503'e çevirir; `auth.controller.ts:140` → `AuthProviderFailedError`; `smtp-mail-transport.ts:74` → `MailDeliveryFailedError`; `rate-limit.guard.ts:222` → yanıt **zaten gönderilmiş** (`'finish'`), `error` loglanıyor, yutma değil.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Beklenen durum için `null` dönüşü                          | **Yok** — `sessions.service.ts:112` sahiplik başarısızlığında `SessionNotFoundError` **fırlatıyor** (K5), `null` dönmüyor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Çekirdekte sağlayıcı dallanması (§10.12)                   | **Yok** — `if (provider === …)` sıfır eşleşme. `prismaAdapter(…, {provider:'postgresql'})` yapılandırma, dallanma değil.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Sağlayıcıya özgü tip sızması                               | **Yok** — `nodemailer` tek import noktası (`smtp-mail-transport.ts:26`); `Transporter` arayüz dışına çıkmıyor. `better-auth`'un `Auth` tipi `auth/**` içinde kalıyor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Katman ihlali (CLAUDE.md §3)                               | **Yok** — `apps/api` → `packages/{db,errors,config}`; ters yön sıfır. `packages/db` iş mantığı **almadı** (yalnızca şema + taksonomi + tip takma adları; `tenancy.ts:54-68` iki dizi). `packages/errors` runtime'da **yalnızca `zod`** (`app-error.ts:40`, `error-body.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Döngüsel bağımlılık                                        | **Yok.** Tek aday: `request-context/request-context.types.ts:19` → `auth/auth-resolution.types.ts` ve `auth/auth-context.middleware.ts:39` → `request-context/**`. **Dosya grafiği asiklik** — `auth-resolution.types.ts` **hiçbir şey import etmiyor** ve bağ **type-only**. Dizin düzeyinde simetrik tip yerleşiminin `TenantResolution`'dan farklı olması tutarsızlıktır ama döngü değildir (gerekçe `auth-resolution.types.ts:10-16`'da yazılı).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `assertNever` tek kopya                                    | **✓** — üç kopya birleştirildi (`errors/assert-never.ts`), dört çağıran onu import ediyor, **dördüncü kopya yazılmadı** (PO kısıtı 4 karşılandı).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `packages/db` çıplak `throw new Error`                     | **Büyümedi.** T-006'nın dokunduğu dosyalarda (`client.ts`, `tenancy.ts`, `health.ts`, `index.ts`) **sıfır yeni** çıplak throw. Mevcut 6 üretim örneği (`tenant-context.ts:83,90`, `catalog-snapshot.ts:228`, `run-guarded-prisma.ts:126,138`, `bootstrap-roles.ts:91,103`) T-005 borcu olarak **aynı yerde**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Hata sınıfları `AppError` türevi                           | **✓ yedisi de.** `code` SCREAMING_SNAKE, `userMessageKey` i18n anahtarı (sabit metin yok, §10.17 ✓), `context` PII/sır **taşımıyor** (en hassası `RateLimitExceededError` → `{scope:'account'                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 'ip', retryAfterSeconds}`; ham e-posta/IP **yok**). `httpHeaders`additive ve`toErrorBody`'ye **girmiyor** (`error-mapping.ts:85-89`+`error-mapping.test.ts:118` pini). |
| Better Auth hatalarının çevrilmemesi                       | **Kabul ediyorum, ihlal yazmıyorum.** CLAUDE.md §4 "dış sağlayıcı hataları adaptör içinde `IntegrationError`'a çevrilir; sağlayıcıya özgü tip adaptör dışına çıkmaz" maddesi **tip sızması** hakkındadır. Burada sızan bir **tip yok**: `AuthController` delege yanıtını `Response` olarak alıp ham gövdeyi forward ediyor (`:98-116`), yanıt şekli `auth-flow.test.ts`'in `betterAuthErrorBodySchema`'sıyla pinli. Better Auth burada **adaptör arkasındaki sağlayıcı değil, uç noktanın kendisi**; onun `INVALID_EMAIL_OR_PASSWORD` kararını `AppError`'a çevirmek iş kuralını **iki yere** kopyalamak olurdu. **Ama bir borç var:** istemci artık **iki farklı hata tel şekli** görüyor (bizim `{code,message,details,requestId}` ve Better Auth'un kendi şekli). v0.0.7'nin panel giriş ekranı ikisini de ayrıştırmak **zorunda**. Bu, ROADMAP'e **borç satırı** olarak girmeli (gate bulgusu değil, sözleşme kararı). |
| K7 kapsam sızması                                          | **Yok** — `auth-probe.controller.ts` `__tests__/helpers/` altında, `AppModule.controllers`'a **hiç** eklenmemiş; `createTestApp({smokeControllers})` ile sarmalanıyor. Dosya `session.me`/`get-session` adlarını **taşımıyor** (K7 pini) ve `/auth/get-session` gerçek HTTP'de **404** (`auth-delegation-allowlist.test.ts:145-151`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Test kalitesi (davranış mı implementasyon mı)              | Genel olarak **davranış**. Örnekler: `auth-guard.test.ts:81-175` discriminated union'ın **her dalını** (mutlu yol + 500 + 401 + iki "TenantGuard'ın işi" dalı) davranış üzerinden pinliyor; `rate-limit.test.ts:431-448` 30 eşzamanlı istekle **atomikliği** gerçek Redis'te ölçüyor; `:723` varlık-sızdırmazlığı iki e-posta sınıfını karşılaştırarak doğruluyor. Mock kullanımı **ölçülü**: `RateLimitService` yalnızca guard birim testinde sahte, servis **gerçek Redis** ile ayrıca test edilmiş. Tek istisna H-1.                                                                                                                                                                                                                                                                                                                                                                                                    |
| Negatif/kenar durum testleri                               | **Var** — `isAuthDelegatedPath` için 6 negatif vaka (`auth-delegation-allowlist.test.ts:71-80`), büyük/küçük harf duyarlılığı (`:82-85`), sorgu dizesi (`:87-89`), `client-ip.test.ts` 10 blok, `auth-exempt-paths.test.ts` `/HEALTH`/`/health/x`/`/` sınırları.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `MaxListenersExceededWarning` (S8 bildirdi)                | **Tasarım kokusu değil, test ortamı etkisi.** Altı `createTestApp()` örneği aynı süreçte aynı Redis/`process` nesnelerine listener bağlıyor. Üretimde süreç başına **tek** uygulama örneği var. Bulgu yazmıyorum; `qa`'nın gürültü değerlendirmesine bırakıyorum.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `AUTH_DELEGATED_PATHS` ↔ `TENANT_EXEMPT_PATHS` tutarlılığı | **Mekanik olarak pinli** (`auth-path-sets.test.ts:64-69`). S5'in literal yazma + S6'nın testte import ederek karşılaştırma çözümü **doğru**: üretim kodunda `tenancy → auth` bağımlılığı yok, sürüklenme testte yakalanıyor. **Tek boşluk M-3'te** (`AUTH_EXEMPT_PATHS` ayağı pinsiz). Ek **low gözlem:** `AUTH_EXEMPT_PATHS` **yöntem körü** (`/auth/verify-email` tüm metotlar için muaf) ama `AUTH_DELEGATED_PATHS` yöntem duyarlı (`GET /auth/verify-email`) — bugün zararsız (küme dışı her şey 404) ama asimetri hiçbir testte pinli değil; M-3'ün düzeltmesi bunu da kapatmalı.                                                                                                                                                                                                                                                                                                                                     |
| S8'in politika haritası doğrulaması                        | **İyi, fazla değil.** `rate-limit.policy.ts:48-64` `buildPolicy()` dört rota anahtarını **modül yüklenirken** `AUTH_DELEGATED_PATHS`'e karşı doğruluyor ve sapmada **fırlatıyor**. Bu, architect'in `forget-password` yazım hatasının bir daha sessizce kopyalanmasını **yapısal olarak** engelliyor — tam olarak doğru refleks, maliyeti bir `if`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `forget-password` kalıntısı                                | **Temiz.** `Grep` ölçümü: dört üretim/test yerinde geçiyor ve **dördü de doğru kullanım** — `auth-delegated-paths.ts:20`, `tenant-exempt-paths.ts:34`, `rate-limit.policy.ts:14,56` **düzeltmeyi belgeleyen** yorumlar; `auth-delegation-allowlist.test.ts:74` ise `POST /auth/forget-password` → `false` diyen **negatif pin**. Beşinci yer `.claude/workflow/tasks/T-006.md:407` (architect'in orijinal metni — tarihsel kayıt, dokunulmaz). **Üretim allowlist'inde yanlış ad YOK.**                                                                                                                                                                                                                                                                                                                                                                                                                                    |

---

## ÖLÇÜMLER

| Ölçüm                                                                            | Değer                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| İncelenen dosya (tam okunan)                                                     | **36** (21 `auth/**` + 7 `errors/**` + 4 `packages/db` + `api-env.ts` + `request-context.types.ts` + `app-error.ts`/`redaction.ts` + 8 test/helper — çakışmalar tekilleştirildi)                                                                                                                |
| İncelenen dosya (kısmi/hedefli)                                                  | **8** (`schema.prisma`, `development.md`, `ROADMAP.md`, `prisma.service.ts`, `rate-limit.test.ts`, `auth-guard.test.ts`, `auth-delegation-allowlist.test.ts`, `auth-path-sets.test.ts`)                                                                                                         |
| `any` (üretim kodu)                                                              | **0**                                                                                                                                                                                                                                                                                           |
| `@ts-ignore` / `@ts-nocheck`                                                     | **0**                                                                                                                                                                                                                                                                                           |
| `@ts-expect-error`                                                               | **7** — hepsi negatif pin (T-005'te 2 idi; artış R-1 daraltmasının **kanıt** yüzeyinden geliyor, susturmadan değil)                                                                                                                                                                             |
| Gerekçesiz `as X` (üretim)                                                       | **0**                                                                                                                                                                                                                                                                                           |
| En büyük fonksiyon                                                               | **77 satır** — `rate-limit.guard.ts:103-179` `RateLimitGuard.canActivate` (ikinci: `auth-context.middleware.ts:74-128` `use()` = **55**; üçüncü: `auth-instance.ts:107-156` = **50**, çoğu yapılandırma literali)                                                                               |
| En büyük yeni dosya                                                              | **232 satır** — `rate-limit.guard.ts` (iki export). Sonra: `auth.module.ts` 177, `auth-instance.ts` 156, `rate-limit.service.ts` 154, `auth.controller.ts` 150, `messages.ts` 140, `sessions.service.ts` 138, `auth-context.middleware.ts` 129, `auth.guard.ts` 125, `rate-limit.policy.ts` 103 |
| Tekrarlanan saf fonksiyon kopyası                                                | yol normalizasyonu **5** · `toWebHeaders` **3** · `assertNever` **1 (birleştirildi ✓)**                                                                                                                                                                                                         |
| `it(`/`it.each(` blok sayısı (`apps/api`)                                        | **200** toplam; `zz-security-gate-probe.test.ts`'in 8 bloğu **hariç 192**. `it.each` çalışma anında çoğaldığı için bu **test vakası sayısı değildir** — Orkestratörün 473 figürü **doğrulanamadı**.                                                                                             |
| `pnpm lint` / `typecheck` / `test` / `test:isolation` / `build` / `format:check` | **ölçülemedi (araç yok)** — `Bash` izni yok. Orkestratörün bildirdiği 15/15 · 15/15 · 473 · 15 · 12/12 · temiz değerleri **kendim doğrulamadım**.                                                                                                                                               |
| Üretim kodunda `console.*`                                                       | **0** (yalnızca yorum atıfları + `auth-secret-leak.test.ts`'in üç `eslint-disable`'lı ölçüm satırı → H-1)                                                                                                                                                                                       |

---

## Bir sonraki tur için

Kapatılması **zorunlu** (FAIL'i kaldıran asgari küme): **H-1** (tek başına FAIL) ve
medium sayısını 2'ye indirecek kadar medium. En düşük maliyetli yol:

1. **H-1** — `expect(true).toBe(true)` → gerçek assert (veya bloğu sil, ölçümü rapora taşı). 5 satır.
2. **M-3** — dördüncü küme testi (veya yanlış yorumu düzelt). ~8 satır.
3. **M-1** + **M-2** — iki ortak helper (`http/normalize-request-path.ts`,
   `http/to-web-headers.ts`) + 8 import. Sahiplik çatışması Orkestratör kararı ister.
4. **M-4** — `renderMailMessage` imzasını `MailMessageKey`'e daralt + `auth-instance.ts`
   yerel birleşimini sil. ~6 satır.
5. **M-5** — tek satır `logger.child({userId})` + `request-context.types.ts` yorumu.
6. **M-7/M-8** — `docs` düzeltmeleri (S9); **M-6** ya düzeltme ya **kayıtlı sapma**.

`low` bulgular teknik borca kaydedilebilir; **L-13 commit öncesi doğrulanmalı**
(yabancı test dosyası repoda kalmamalı).
