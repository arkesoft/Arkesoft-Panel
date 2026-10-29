# T-006 — solid gate, Tur 2 (FIX turu 1 sonrası)

- **Tarih:** 2026-10-29
- **Sürüm:** ROADMAP v0.0.5 (Kimlik doğrulama — Better Auth)
- **Araç kısıtı:** `Bash` YOK. Hiçbir komut çalıştırılmadı; tüm ölçümler `Read`/`Grep`
  ile statik tespittir. Çalıştırılamayanlar "ölçülemedi (araç yok)" olarak işaretlendi.
  **Hiçbir komut çıktısı uydurulmadı.**

```
GATE: solid
SONUÇ: FAIL
```

**FAIL gerekçesi (AGENT_BASELINE §4, mekanik):** 3 `medium` (≥3 medium = FAIL).
`critical` **yok**, `high` **yok** — tur 1'in tek `high`'ı ve 8 medium'un **7'si**
gerçekten kapandı. Kalan üç medium'un toplam düzeltme maliyeti ~3 satır test,
bir helper taşıması ve iki paragraf belge.

---

## 1. En kritik iki yargı

### 1.1 M-6 — `backend` HAKLI, önerim (a) YANLIŞTI; üçüncü yol VAR ama bugünkü davranış GÜVENLİ

**Geri alıyorum.** Tur 1'de önerdiğim "IP sayacının başarıda sıfırlanması"
**kendisi bir atlatma yolu açar** ve `backend`'in gerekçesi doğrudur:

- Paylaşılan NAT/ofis IP'si + saldırganın **kendi geçerli hesabı** → kurbana 19
  hatalı parola, sonra kendi hesabıyla 1 başarılı giriş → sayaç sıfır → döngü
  **sınırsız** tekrarlanır. IP sınırının **tüm amacı** (paylaşılan kaynaktan toplu
  deneme) bu şekilde tamamen etkisizleşir. Hesap sayacının sıfırlanması bu riski
  taşımaz (sıfırlanan hesap kimliği doğrulanmış sahibine ait).
- Bugünkü davranış K3'ten **gevşek değil, KATI** yöndedir ("20 deneme" < "20
  başarısız"). Gevşetme olsaydı yargım farklı olurdu.

**Üçüncü yol var ve sağlamdır: sıfırlama DEĞİL, İADE (`DECR` 1).**

- 2xx sonrası IP sayacından **bir** birim geri verilir → net etki "yalnızca
  başarısızlar sayılır" (K3'ün metni **birebir**), ama saldırganın bir başarısı
  pencereyi **sıfırlamaz**, yalnızca 1 deneme kazandırır → `backend`'in tespit
  ettiği açık **oluşmaz**.
- **Varlık-sızdırmazlık BOZULMAZ:** ön artırım (kullanıcı aramasından **önce**)
  olduğu gibi kalır; iade **yalnızca** 2xx'te olur ve 2xx'i saldırgan zaten
  gözlemliyor. Var olmayan e-posta ile yanlış parola **ikisi de** non-2xx'te kalır,
  **ikisi de** sayılır → status/gövde/`Retry-After` dağılımı ayırt edilemez.
- **Ama yalnızca `sign-in`'de:** `sign-up/email`, `send-verification-email`,
  `request-password-reset`'te **2xx'in KENDİSİ istismardır** (mail bombing). Oralarda
  iade uygulanırsa IP sınırı sınırsızlaşır — `backend`'in bulduğu açığın **ayna
  görüntüsü**. Bu yüzden `rate-limit.policy.ts`'te `resetAccountOnSuccess`'in yanına
  **rota bazlı** bir `refundIpOnSuccess` gerekir; blanket çözüm **yoktur**.
  (Maliyet: bir `DECR` + bir bayrak + bir test. Yapısal engel yok.)

**Karar:** `backend`'in seçtiği yol (davranışı koru + belgele + eksik negatif testi
yaz) tur 1'de **kendi yazdığım (b) seçeneğini** karşılıyor. Mekanik doğrulama:

| Talep (tur 1, seçenek b)          | Durum                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `rate-limit.policy.ts` yorumu     | ✅ `rate-limit.policy.ts:44-51`                                                                                               |
| Davranış kaydı (kod)              | ✅ `rate-limit.guard.ts:38-55`                                                                                                |
| **Eksik negatif test**            | ✅ `rate-limit.test.ts:596-651` — 20 **başarılı** giriş → 21. istek **doğru parolayla** 429; gerçek HTTP, gerçek Redis, pinli |
| ROADMAP teknik borç satırı        | ❌ YOK (`ROADMAP.md`'de M-6/K3 sapması aranan tüm biçimlerde eşleşmedi) → **L-11**                                            |
| architect riski 4'ün güncellemesi | ❌ YOK → **L-11**                                                                                                             |

→ **M-6 gate bulgusu olarak KAPANDI.** Kalan iki kalem `release`/`architect`
sorumluluğunda, `low`.

### 1.2 `SameOriginGuard` FAIL-OPEN — tasarım MEŞRU, GEREKÇENİN YAZIMI M-2 sınıfı

Soru: "test uyumluluğu bir tasarım gerekçesi mi?" **Hayır, asla.** Ama bu dosyada
**iki ayrı şey** var ve ayrılmaları gerekir:

**(a) Kararın kendisi — SAĞLAM, bulgu yazmıyorum.** `Origin`/`Sec-Fetch-Site` hiç
gönderilmemişse reddetmemek, Origin tabanlı CSRF savunmasının **standart** biçimidir
ve saldırı modeline uyar: tarayıcılar çapraz-orijin POST'ta (klasik `<form>` dahil)
`Origin`'i **daima** gönderir → asıl saldırı yüzeyi "Origin VAR ve EŞLEŞMİYOR"
dalında kapanıyor. Ayrıca `kiracı.arkesoft.app` → `panel.arkesoft.app` senaryosu
(`crossSubDomainCookies`'in zorunlu sonucu, architect riski 3) `Sec-Fetch-Site:
cross-site` ile **yakalanmaz** — ama `origin_mismatch` dalıyla **yakalanır**;
`same-origin-guard.test.ts:38-42` tam bu vakayı pinliyor. Gerekçenin **meşru hâli
yorumun içinde ZATEN var** (`same-origin.guard.ts:16-21`).

**(b) Gerekçenin SIRALAMASI — M-2'nin aynı sınıfı, ama sonucu farklı.**
`same-origin.guard.ts:13-16` başlığı "FAIL-OPEN, BİLİNÇLİ (**mevcut test paketini
KIRMAMAK için**)" diyor; meşru sebep (eksik başlık saldırı kanıtı değildir +
tarayıcı davranışı) **parantez içinde** kalıyor. Beş yıl sonra okuyan kişi
"testlerimiz yüzünden açık bıraktık" cümlesini görür ve iki yanlıştan birini yapar:
kontrole güvenmez, ya da "düzeltip" 10 test dosyasını kırar.

**M-2'den farkı (bilinçli ayrım):** M-2'de süreç kısıtı **gerçek kodun üç kopyasını**
üretmişti → medium. Burada süreç kısıtı yalnızca **yanıltıcı bir yorum** üretiyor;
kod, doğru tasarımın zaten alacağı şekilde. → **`low` (L-3)**, düzeltme üç satır:
tasarım gerekçesini **başa** al, test uyumluluğunu "yan fayda" olarak yaz.

Tek gerçek tasarım boşluğu: çoğul `Origin` başlığı → **L-4**.

---

## 2. Tur 1'in HER bulgusunun durumu

| #        | Bulgu                                            | Durum                                                                                                          |
| -------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **H-1**  | `expect(true).toBe(true)` (tautolojik kapı)      | **KAPANDI** — gerçek assert `auth-secret-leak.test.ts:187`; repoda `expect(true)` 0. _Yeni kalıntı: **M-1**_   |
| **M-1**  | Yol normalizasyonu 5 kopya                       | **KAPANDI** — `http/normalize-request-path.ts`; **5/5** çağıran import ediyor, kopya kalmadı                   |
| **M-2**  | `toWebHeaders` 3 kopya + "dosya sahipliği"       | **KAPANDI** — `http/to-web-headers.ts`; **3/3** çağıran import ediyor                                          |
| **M-3**  | Var olmayan testi iddia eden yorum               | **KAPANDI** — dördüncü test `auth-path-sets.test.ts:93-104` (önerdiğim assert'in birebiri) + yorum düzeltildi  |
| **M-4**  | `renderMailMessage(key: string)`                 | **KAPANDI** — `messages.ts:137-142` `MailMessageKey`; `parseMailMessageKey` ayrı; `auth-instance.ts:117` ithal |
| **M-5**  | LOG DESENİ `logger.child({userId})` yok          | **KAPANDI** — `auth-context.middleware.ts:99` + 4 `info` olayı (`auth-instance.ts:133,298,309,315`)            |
| **M-6**  | IP sayacı başarıları da sayıyor                  | **KAPANDI (gerekçesi KABUL EDİLDİ)** — §1.1; kalan ROADMAP kaydı → **L-11**                                    |
| **M-7**  | `development.md` 4 hata                          | **KISMEN — 3/4 kapandı, 4.'sü YANLIŞ DÜZELTİLDİ + yeni uydurma bölüm** → **M-3**                               |
| **M-8**  | ADR-0008 6 sapma                                 | **KISMEN — 4/6 kapandı** (bcrypt→yok, eslint bloğu→gerçek, §7 numaraları→metin, satır atfı→başlık) → **L-6**   |
| **L-1**  | `AUTH_PRISMA_CLIENT` token'ın yeri               | **AÇIK — gerekçesi ARTIK GEÇERSİZ** → **L-2**                                                                  |
| **L-2**  | `isAuthOwnPath` üretim tüketicisi yok            | **KISMEN** — dördüncü normalizasyon kopyası gitti; export hâlâ test-only → **L-9**                             |
| **L-3**  | `assert-never.ts:32-34` yanlış yorum             | **AÇIK (değişmedi)** → **L-7**                                                                                 |
| **L-4**  | `create-test-app.ts:64` önek kopuk               | **KISMEN** — adlandırılmış helper `:70` geldi; önek hâlâ kopuk, çağrı hâlâ koşulsuz → **L-8**                  |
| **L-5**  | İkinci Prisma havuzu                             | **AÇIK (gerekçeli, kabul)** — `auth.module.ts:63-74`, v0.0.14 ADR kararı; kayıt `release`'de                   |
| **L-6**  | `*.guard.ts` içinde interceptor                  | **AÇIK (öneri)** — `rate-limit.guard.ts:209`                                                                   |
| **L-7**  | `canActivate` 77 satır                           | **AÇIK (öneri)** — `rate-limit.guard.ts:122-198`, **77** satır (değişmedi; dosya 232→251)                      |
| **L-8**  | `EmailNotVerifiedError` fırlatılmıyor            | **AÇIK (meşru)** → **L-9** ile birleşti                                                                        |
| **L-9**  | `auth-fixture.ts` ön koşul assert'i yok          | **AÇIK (değişmedi)** → **L-5**                                                                                 |
| **L-10** | `bearer` boş-geçerli assert                      | **AÇIK** — `auth-secret-leak.test.ts:136`; **M-1**'in kapsamında                                               |
| **L-11** | `emailVerified` boolean öneki (kütüphane kısıtı) | **AÇIK (kabul)** — `schema.prisma:126` bölgesinde §4 sapma notu hâlâ yok; kayıt `release`                      |
| **L-12** | `MailTransport` v0.9.0 taşıma borcu              | **AÇIK** — ROADMAP satırı yok; kayıt `release`                                                                 |
| **L-13** | `zz-security-gate-probe.test.ts` (süreç)         | **KAPANDI** — dosya repoda **yok** (`Glob`/`Grep` ile aranan tüm biçimlerde 0 eşleşme)                         |

**İki çıkarım gerçekten DRY'ı çözdü mü? Evet, ölçüldü.** `normalizeRequestPath` beş
çağrı noktasında (`auth-delegated-paths.ts:49`, `auth-exempt-paths.ts:31`,
`auth-own-paths.ts:19`, `rate-limit.policy.ts:22`, `tenant-exempt-paths.ts:52`),
kopya **kalmadı**. `toWebHeaders` üç dosyada (`auth.controller.ts:40`,
`auth-context.middleware.ts:34`, `sessions.service.ts:37`). **`http/` SAF kaldı** —
dizinin tamamında dışa tek bağımlılık `./http-request.types.js`; `tenancy → auth`
bağımlılığı **doğmadı** (PM R3 korunur) ve bu ayrıca `auth-path-sets.test.ts:123-138`
ile mekanik olarak pinli.

**`AUTH_SESSION_READER` tasarımı: zarif, bulgu yok.** Tip gerçekten yalnızca
`getSession` (`auth.tokens.ts:29-31`), `exports: [AUTH_SESSION_READER]`
(`auth.module.ts:194`) tam `Auth` yüzeyini kapatıyor, `.bind()` defansif ve
maliyetsiz. `auth.tokens.ts` **iki kavram taşımıyor** — ikisi de DI token'ı, dosyanın
amacı tam bu. (Zayıf nokta testinde: **L-1**.)

---

## BULGULAR

### [SEV: medium]

**M-1** — `apps/api/src/__tests__/auth-secret-leak.test.ts:182-193` — **H-1'in
düzeltmesi yalnızca KOŞULLU olarak etkili; `else` dalı yine tautolojik ve yorumu bunu
İNKÂR EDİYOR.** Üç ayrı sorun:

1. `:183-184` yalnızca **`calls[0][1]`**'i okur — ilk `console.error` çağrısının
   **ikinci** argümanı. Konum seçimi ölçülmüş (`auth-instance.ts:44-53`,
   `better-auth@1.7.14`) ama **tek bir çağrıya ve tek bir argüman indeksine** çivili:
   kütüphane sırayı değiştirir, araya başka bir `console.error` girer veya hata
   `args[0]`/`args[2]`'ye kayarsa `rawError` `undefined` olur, `String(undefined)`
   → `'undefined'` → `not.toContain('wrong')` **sessizce geçer**. Bir **sır sızıntısı
   kapısı** için bu, H-1'in dar bir tekrarı: kapı çalışmadan yeşil kalabilir.
2. `:192` `expect(consoleErrorSpy.mock.calls.length).toBe(0)` — `if (length > 0)`'ın
   `else` dalında, `length === 0` **zorunlu olarak** doğrudur. Tautolojik.
3. `:189-192` yorumu birebir "**tautoloji DEĞİL**" diyor. Yanlış yorum,
   yorumsuzdan kötüdür — ve bu, H-1'in **tam olarak** eleştirdiği şeydir.

**Önerilen düzeltme (3 satır, dallanma YOK):** tüm çağrıları ve tüm argümanları tek
metne indir, koşulsuz assert et —
`const all = consoleErrorSpy.mock.calls.flat().map(v => v instanceof Error ? (v.stack ?? v.message) : String(v)).join('\n')` →
`expect(all).not.toContain('wrong')`. Çağrı hiç olmadıysa `all` boş dizedir ve assert
yine **anlamlıdır** (vakum değil, sızıntı yok). `if/else` ve `:192` **silinir**.
L-10'un (`:136` `'bearer '`) kaderi de aynı refactor'da karara bağlanır.
— **Sorumlu: S6**

**M-2** — `apps/api/src/auth/auth-instance.ts:147-160` ·
`apps/api/src/auth/auth-context.middleware.ts:103` ·
`apps/api/src/auth/rate-limit/rate-limit.guard.ts:243`
(bağlam, kapsam dışı: `tenancy/tenant-context.middleware.ts:67`,
`redis/redis.service.ts:40`) — **"bilinmeyen `cause` → loglanabilir mesaj"
indirgemesinin BEŞ kopyası; biri DÜZELTİLDİ, dördü BİLİNEN HATALI biçimde kaldı ve
İKİSİ bu Task'ta YENİ YAZILDI.**

Bu yüzeysel benzerlik **değil**: `extractErrorMessage` (`:147`) tam olarak naif
biçimin **yanlış** olduğu ölçüldüğü için doğdu — dosyanın kendi yorumu (`:139-145`)
"Node `net.connect()` IPv4+IPv6 denediğinde nodemailer `AggregateError`'a sarar,
`AggregateError.message` **HER ZAMAN BOŞTUR**" diyor. Aynı arıza modeli diğer
kopyaları **doğrudan** vurur: `rate-limit.guard.ts:243` ve `redis.service.ts:40`
**Redis bağlantı hatasını** logluyor — `127.0.0.1` üzerinde çift yığın (happy
eyeballs) `AggregateError` üreten **tam o senaryo**. Sonuç: operatör
`errorMessage: ''` görür. Yani beş kopya "aynı sebeple değişmek zorunda" olduğunu
**ölçümle kanıtlamış**, ama değişiklik tek kopyada kalmış.

İkinci sorun **yerleşim**: genel amaçlı bir hata indirgeyicisi (`extractErrorMessage`

- `describeBetterAuthLogCause`) sağlayıcıya özgü bir fabrika dosyasının
  (`auth-instance.ts`, Better Auth örneği kurar) içinde duruyor ve "birim testi için"
  `export` ediliyor — dosya tek sorumluluğundan taşmış (324 satır, tur 1'de 156).

**Önerilen düzeltme:** `apps/api/src/errors/describe-error-cause.ts` (saf, DI'sız;
`assert-never.ts`'in yanı — **aynı birleştirme emsali**), `{ causeCode, causeMessage }`
döner, `AggregateError` ayağı içinde; dört log çağıranı onu import eder.
`auth-instance.ts` yalnızca Better Auth'un logger adaptörünü tutar.
— **Sorumlu: S5 + S8 (çağıranlar), architect (yerleşim onayı)**

**M-3** — `docs/development.md:553` · `:587-589` — **iki doğrulanabilir hata; biri
tur 1'in M-7(4)'ünü YANLIŞ düzeltti, biri YENİ ve UYDURMA.**

1. `:553` — "**Giriş ve şifre sıfırlama:** `5 başarısız/15dk` hesap başına,
   `20/15dk` IP başına". **Şifre sıfırlama bu değerleri KULLANMIYOR:**
   `rate-limit.policy.ts:78-84` → `request-password-reset` **`'reset'` penceresi** +
   `EMAIL_ACCOUNT_LIMIT = 3` + `EMAIL_IP_LIMIT = 10` (yani **3/saat** ve
   **10/saat**), K3 ve AC7 ("şifre sıfırlama: **4.** istek 429") ile birebir. Doğru
   gruplama {giriş} ↔ {şifre sıfırlama, kayıt, doğrulama e-postası}; belge şifre
   sıfırlamayı **yanlış kümeye** koymuş. Bu bir **runbook hatası**: operatör 6.
   istekte kilit bekler, gerçek kilit **4.** istektedir.
2. `:587-589` — "IP ve User-Agent Takibi" bölümü **üç uydurma iddia** taşıyor:
   (a) "`disableIpTracking` **ortam değişkeni**" — ortam değişkeni **değil**, kod
   sabiti (`auth-instance.ts:270`; `apiEnvSchema`'da böyle bir anahtar yok, `Grep`
   ile tüm repo tarandı); (b) "kolonlara **boş dize** yazılır. Sütunlar `NULL`
   değil" — `schema.prisma:126-127` `ipAddress String?` / `userAgent String?`
   (**nullable**) ve projenin kendi kararı (`schema.prisma:112`, T-006:353)
   "TANIMLANIR ama **DOLDURULMAZ**"; belgenin `IS NULL` çıkarımı ve "v0.0.15
   normalizasyonu" bu yanlış öncülün üzerine kurulu; (c) "**417+** kayıtlı oturumda
   `length=0` değeri" — **ölçülemez bir sayı** (kimse 417 oturum saymadı);
   "`ALTER` sadece `DEFAULT` ekler" diye anılan bir migration **yok**.

Tur 1'de yazdığım ilke aynen geçerli: **"ölçülmedi" yazmak, uydurmaktan iyidir.**
**Önerilen düzeltme:** `:551-554` dört rotayı **iki satırlık tabloya** çevir
(giriş: 5/20 · 15 dk; diğer üçü: 3/10 · 60 dk) ve değerleri
`rate-limit.policy.ts:43-56`'dan **kopyala**; `:587-589` bölümünü ya sil ya
`schema.prisma:112-116` + `auth-instance.ts:270`'in gerçeğiyle (kod sabiti, kolon
nullable, **doldurulmuyor**, v0.0.15'in yıkıcı migration'a ihtiyaç duymaması için
bilinçli expand) yeniden yaz — ölçülmemiş sayı **yazılmaz**.
— **Sorumlu: S9**

---

### [SEV: low]

**L-1** — `apps/api/src/__tests__/auth-instance-export-surface.test.ts:70` —
`await expect(moduleBuilder.compile()).rejects.toThrow()` **matcher'sız**. Test tüm
`AppModule`'ü derliyor; `compile()` **herhangi** bir sebeple (ör. eager bir
provider'ın kurulum hatası) patlarsa test yeşil kalır ve iddia ettiği şeyi
(`AUTH_INSTANCE` DI yan yolunun kapalılığı) **kanıtlamaz**. Regresyon yönü doğru
çalışıyor (`exports` geri eklenirse `compile()` başarılı olur → test kırmızı), bu
yüzden `low`. **Düzeltme:** `.rejects.toThrow(/AUTH_INSTANCE/)` — Nest'in
`UnknownDependenciesException` mesajı token'ın `toString()`'ini taşır; dosyanın kendi
yorumu (`:13`) bu sınıfı zaten adlandırıyor. — **Sorumlu: S6**

**L-2** — `apps/api/src/auth/sessions.service.ts:12-14` +
`apps/api/src/auth/auth.module.ts:127-131` — **tur 1'in L-1'i açık ve tek gerekçesi
artık KANITLANABİLİR ŞEKİLDE YANLIŞ.** İki dosya da `AUTH_PRISMA_CLIENT`'ın
`auth.tokens.ts` yerine servis dosyasında durmasını "`auth.tokens.ts` **S5'in,
DEĞİŞTİRİLMEZ**" diye gerekçelendiriyor — oysa `auth.tokens.ts` **bu FIX turunda
değiştirildi** (`:26` `AUTH_SESSION_READER` eklendi). Gerekçe buharlaştı; token
`*.tokens.ts` dosyalarına bakan kişinin bulamadığı yerde kalmaya devam ediyor.
**Düzeltme:** token `auth.tokens.ts`'e taşınsın (saf ekleme) veya iki yorumdaki ölü
gerekçe silinsin. — **Sorumlu: S6**

**L-3** — `apps/api/src/auth/same-origin.guard.ts:13-16` — fail-open kararının
**başlık gerekçesi** bir süreç kısıtı ("mevcut test paketini KIRMAMAK için"); meşru
tasarım gerekçesi (`:16-21`) parantezde kalmış. Ayrıntılı yargı §1.2'de.
**Düzeltme:** tasarım gerekçesini başa al, test uyumluluğunu "yan fayda" olarak yaz.
— **Sorumlu: S6**

**L-4** — `apps/api/src/auth/same-origin.guard.ts:36-40` — `singleHeaderValue` çoğul
`Origin`/`Sec-Fetch-Site` başlığında **ilk değeri** okuyor ("çoğul başlık
GEÇERSİZDİR" yorumu bunu kabul ediyor). Bu repoda **güven taşıyan** bir başlığın
çoğullanmasına verilen yerleşik cevap **ret**tir:
`request-context.types.ts:29` `multiple_host_headers` → kiracı çözülmez. Aynı
fail-closed refleksi burada uygulanmıyor. Tarayıcı iki `Origin` göndermez, ama ara
katman gönderebilir. **Düzeltme:** `Array.isArray(value)` → ihlal say (yeni
`SameOriginViolationReason` üyesi; `assertNever` zaten exhaustive tutuyor).
İstismar edilebilirlik takdiri `security`'nin. — **Sorumlu: S6 + security (şiddet)**

**L-5** — `apps/api/src/__tests__/helpers/auth-fixture.ts:55-61` — tur 1'in L-9'u
**değişmedi**: `sign-up` (`:55`) ve `verify-email` (`:61`) yanıtlarının durumu
assert edilmiyor; kayıt 429/503 dönerse arıza ilk olarak
`findLatestMailpitMessageTo`'da "mesaj yok" diye yüzeye çıkar ve **yanıltıcı teşhis**
üretir. Fixture artık **beş** test dosyasının ön koşulu (`same-origin-guard.test.ts`
dahil) → yanıltıcı teşhisin yarıçapı büyüdü. `:73-74` anlamsız yeniden-export de
yerinde. — **Sorumlu: S6**

**L-6** — `docs/adr/0008-...md:105` · `:93` · `:125,:129,:131,:150` · `:154` —
**M-8'in kalıntısı (6'dan 4'ü kapandı; aktif yanıltıcı iddialar gitti → `medium`'dan
`low`'a indirdim).** Kalanlar: (a) `:105` lint kapısını **olduğundan dar** tarif
ediyor ("erişim imzası `AuthModule` dosya yoludur") — gerçek muafiyet kümesi
`src/prisma/**`, `src/auth/**` **ve `src/__tests__/**`'tır (`eslint.config.mjs:258`);
bu, ADR'nin **kendi** `:101` uyarısının ("belgelenmiş ama gerçekleşmeyen bir kontrol
daha tehlikelidir") ihlal edildiği yer; (b) `:105` yine **satır numarasıyla** atıf
veriyor (`eslint.config.mjs:3-20`) ve o aralık **kuralın kendisi değil**, R-P1 yorumu
— kural `:46-60`, dosya kümeleri `:195-270` (M-8(5)'in ROADMAP için düzeltilen
hatası burada tekrarlanmış); (c) `:93` reddedilen alternatifte **`sp_executesql`**
geçiyor — bu bir **SQL Server** yordamı, PostgreSQL ADR'sinde uydurma ayrıntı;
(d) `:154`'ün Prisma `omit` anlatısı **aynı belgenin `:92`'siyle** çelişiyor;
(e) `:125` "Darlama", `:129` "modül saplantıya dönüşür"/"fab rikatörü", `:131`
"Üzün yolu", `:150` "reddetilmiş", `:18` "yapisal", `:22` "mekanizm" — bozuk
sözcükler duruyor (Prettier/ESLint bunları yakalamaz, bu yüzden bulgu). Ek olarak
`docs/development.md:570` "zorundu tutacak" aynı sınıf. **Düzeltme:** (a)–(d)
düzeltilsin; doğrulanamayan ayrıntı **silinsin**. — **Sorumlu: S9**

**L-7** — `apps/api/src/errors/assert-never.ts:33-34` — tur 1'in L-3'ü
**değişmedi**: yorum "tüm çağıranlar discriminated union **ETİKETLERİ** üzerinde
çalışır" diyor; gerçekte `auth.guard.ts:78` (`auth` — `authenticated` varyantı
`userId`/`sessionId`, `failed` varyantı `cause`), `auth.guard.ts:131` (`tenant`),
`rate-limit.guard.ts:105` (etiket ✓) ve `error-mapping.ts` çağıranlarının çoğu
**birleşimin tamamını** geçiyor; `:37` `JSON.stringify(value)` bunları hata mesajına
serileştirirdi. Bugün `never` garantisi altında erişilemez. — **Sorumlu: S3**

**L-8** — `apps/api/src/__tests__/helpers/create-test-app.ts:64` — tur 1'in L-4'ü
**kısmen**: flush artık adlandırılmış (`:70` `flushRateLimitCounters`) ama
(a) `RATE_LIMIT_KEY_PREFIX` (`rate-limit.service.ts:33`) hâlâ **export edilmiyor** ve
önek `:64`'te ikinci kez yazılı — değişirse flush **sessiz no-op**, dört rate-limit
`describe`'ı **flaky**; (b) `:159` çağrısı 15+ test dosyasının paylaştığı fabrikada
hâlâ **koşulsuz**. — **Sorumlu: S8**

**L-9** — `apps/api/src/auth/auth-own-paths.ts:33` ·
`apps/api/src/errors/domain/email-not-verified.error.ts:26` ·
`apps/api/src/auth/mail/messages.ts:152` — **üretim tüketicisi olmayan üç export**
(`isAuthOwnPath`, `EmailNotVerifiedError`, `parseMailMessageKey` — `Grep`: üçü de
yalnızca testlerden çağrılıyor). Üçü de **gerekçeli** (küme görünürlüğü · hata kodu
kayıt defteri · v0.0.11 kuyruk payload'ı) ve `parseMailMessageKey`'i **ben
önerdim** — bu yüzden ölü kod ilan etmiyorum. **Tek talep:** üçü için ROADMAP'e
**son kullanma satırı** (v0.0.11/v0.0.14'te hâlâ tüketicisi yoksa silinir); yoksa
kalıcı iskelet olurlar. — **Sorumlu: release (kayıt), gözden geçirme v0.0.11/v0.0.14**

**L-10** — `apps/api/src/request-context/request-context.types.ts:75` — yorum
**yarım güncellenmiş**: `:67-74` doğru şekilde "ÜÇ yazıcı"ya çevrilmiş (M-5
düzeltmesi, ölçüldü — üç yazıcı gerçekten var), ama hemen altındaki `:75`
"`tenant`: **TEK** mutable alan" cümlesi artık **yanlış** — aynı blokta `auth`
(`:77`) ve `logger` (`:67`) de mutable, tipte (`:85-87`) üç mutable alan var.
— **Sorumlu: S6**

**L-11** — `ROADMAP.md` (teknik borç tablosu) + `rate-limit.guard.ts:49-50` —
**M-6'nın iki kalan ayağı.** (a) K3'ten bilinçli sapmanın ROADMAP borç satırı **yok**
(`Grep`: eşleşme 0) ve architect riski 4 "başarılar da sayılır" ölçüsüyle
**güncellenmemiş** — kod yorumu kalıcı denetim kaydının **yerini tutmaz**;
(b) `rate-limit.guard.ts:49-50` "K3'ün metni **DAHA GENEL** yazılmış olabilir" ifadesi
**ters**: K3'ün metni (`20 başarısız`) uygulamadan **DAHA DAR**, davranış daha
**geniş/katı**. §1.1'deki iade (refund) seçeneği de kayda değer.
— **Sorumlu: release (ROADMAP), architect (K3 + riski 4), S8 (yorum)**

**L-12** — `apps/api/src/__tests__/auth-path-sets.test.ts:123-124` — `describe`
başlığı "'tenancy' üretim kodu 'auth' modülünden import **ETMEZ**" diyor; kontrol
yalnızca `"from '../auth/"` dizesini arıyor. `listTenancyTsFiles` (`:107`) **alt
dizinlere iniyor** → ileride bir `tenancy/<alt>/x.ts` dosyası `from '../../auth/`
yazarsa kapı **sessizce** geçer. Bugün `tenancy/` düz (7 dosya, alt dizin yok) → etki
yok, ama mekanik kapının kapsamı iddiasından dar. **Düzeltme:** needle'ı
`/from '(\.\.\/)+auth\//` yap veya başlığı kontrolün gerçek kapsamına indir.
— **Sorumlu: S6**

**L-13** — `apps/api/src/auth/rate-limit/rate-limit.guard.ts:209` (tur 1 L-6) ve
`:122-198` (tur 1 L-7) **açık, öneri olarak kalıyor**: `*.guard.ts` dosyası ikinci
bir enhancer türü (`RateLimitAccountResetInterceptor`) export ediyor ve
`canActivate` **77 satır / 8 iş**. Dosya 232 → **251** satır (büyüme tamamı M-6
gerekçe yorumu — yani **doğru** yöne büyüme). CLAUDE.md'de fonksiyon uzunluğu kuralı
yok → **ihlal değil, öneri**. — **Sorumlu: S8**

---

## Temiz çıkan kontroller (arandı, bulunamadı)

| Kontrol                             | Sonuç                                                                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `any` (üretim)                      | **0** — `apps/api/src` + `packages/*/src` genelinde `\bany\b` yalnızca yorum/JSDoc; `packages/db/generated/**` üretilmiş çıktı (kapsam dışı)                                                                                         |
| `@ts-ignore` / `@ts-nocheck`        | **0**                                                                                                                                                                                                                                |
| `@ts-expect-error`                  | **8**, hepsi **negatif pin**: `auth-model-narrowing.pin.ts:83,85,87,116,118,120` · `client-options.pin.ts:45` · `prisma-with-tenant.test.ts:111`. Hata susturma **yok**                                                              |
| Gerekçesiz `as X` (üretim)          | **0** — `apps/api/src` üretim ağacında tek eşleşme `auth-instance.ts:78` `import type { Logger as PinoLogger }` (takma ad). `as unknown as` **yalnızca** testlerde, framework arayüzü mock'u                                         |
| Katman ihlali (CLAUDE.md §3)        | **Yok.** `apps/api` → `packages/{db,errors,config}`; ters yön 0. Yeni `http/` dizini **saf** (dışa tek bağımlılık kendi tip dosyası)                                                                                                 |
| Döngüsel bağımlılık                 | **Yok.** `tenancy → auth` **doğmadı** (mekanik pin: `auth-path-sets.test.ts:123-138`); `http/` iki modülden de bağımsız; `request-context.types.ts:19 → auth/auth-resolution.types.ts` bağı **type-only** ve karşı tarafı import yok |
| Çekirdekte sağlayıcı dallanması     | **Yok** — `if (provider === …)` 0 eşleşme. `prismaAdapter(…, {provider:'postgresql'})` yapılandırma                                                                                                                                  |
| Sağlayıcıya özgü tip sızması        | **Yok** — `nodemailer` tek import noktası; `better-auth`'un `Auth` tipi `auth/**` içinde; **F1(b) ile DI yan yolu da kapandı** (`AUTH_SESSION_READER`)                                                                               |
| Boş `catch` / yutulan hata (§10.16) | **0 boş blok.** `auth-context.middleware.ts:100` → `{kind:'failed'}` + `error` log → `AuthGuard` 503; `rate-limit.guard.ts:241` → yanıt zaten gönderildi, `error` loglanıyor                                                         |
| Beklenen durum için `null`          | **Yok** — `sessions.service.ts:93` `SessionNotFoundError` fırlatıyor (K5)                                                                                                                                                            |
| `expect(true)` / `skip` / `todo`    | **0** (H-1 kapandı; `zz-security-gate-probe.test.ts` repoda yok)                                                                                                                                                                     |
| Yeni testlerin kalitesi             | `same-origin-guard.test.ts` **örnek nitelikte**: saf fonksiyon (5 vaka, 2'si negatif) + gerçek HTTP; `:98-102` PoC'un **asıl** iddiasını (oturum **hayatta** kaldı) ayrıca doğruluyor → sahte-403 kapısı kapalı                      |
| `rate-limit.test.ts:596-651`        | Gerçek davranış testi: 20 **başarılı** giriş → 21. istek **doğru parolayla** 429. Hesap sayacının her başarıda sıfırlanması sayesinde 429'un **yalnızca** IP ayağından gelebileceği argümanı kodda yazılı (`:639-641`) ve geçerli    |

---

## ÖLÇÜMLER

| Ölçüm                                                                       | Değer                                                                                                                                                                        |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| İncelenen dosya (bu tur, tam okunan)                                        | **23** (10 üretim `auth/**` + 3 `http/**`/`errors/**` + 1 `request-context` + 1 `eslint.config.mjs` + 5 test/helper + ADR-0008 + `development.md` (hedefli) + 2 görev/rapor) |
| `any` (üretim kodu)                                                         | **0**                                                                                                                                                                        |
| `@ts-ignore` / `@ts-nocheck`                                                | **0**                                                                                                                                                                        |
| `@ts-expect-error`                                                          | **8** — hepsi negatif pin (tur 1'de 7 saymıştım; sekizincisi `client-options.pin.ts:45`, T-006 öncesi, susturma değil)                                                       |
| Gerekçesiz `as X` (üretim)                                                  | **0**                                                                                                                                                                        |
| En büyük fonksiyon                                                          | **106 satır** — `auth-instance.ts:219-324` `createAuthInstance` (≈%90 yapılandırma literali). **En büyük mantık fonksiyonu: 77** — `rate-limit.guard.ts:122-198` (değişmedi) |
| En büyük dosya (yeni/değişen)                                               | `auth-instance.ts` **324** (tur 1: 156; artışın 71 satırı dosya başı yorumu) · `rate-limit.guard.ts` **251** (tur 1: 232; artış tamamı M-6 gerekçesi)                        |
| Tekrarlanan saf fonksiyon kopyası                                           | yol normalizasyonu **5 → 1 ✓** · `toWebHeaders` **3 → 1 ✓** · `assertNever` **1 ✓** · **YENİ: hata→mesaj indirgemesi 5 kopya** (1 yetkin + 4 naif) → M-2                     |
| `lint` / `typecheck` / `test` / `test:isolation` / `build` / `format:check` | **ölçülemedi (araç yok)** — Orkestratörün bildirdiği 15/15 · 15/15 · **492** · 15 · 12/12 · temiz değerlerini **kendim doğrulamadım**                                        |

---

## Bir sonraki tur için — FAIL'i kaldıran asgari küme

`high` **yok**; medium sayısını 2'ye indirmek yeter. Maliyet sırasıyla:

1. **M-1** — `auth-secret-leak.test.ts:182-193`: `if/else` sil, tüm çağrı/argümanları
   tek metne indir, koşulsuz assert. **~3 satır.**
2. **M-3** — `development.md:551-554` eşik tablosu (değerler
   `rate-limit.policy.ts:43-56`'dan kopyalanır) + `:587-589` ya sil ya gerçeğiyle
   yaz. **~10 satır belge.**
3. **M-2** — `errors/describe-error-cause.ts` + 4 import. Bu üçüncüsü **tek başına
   borç olarak da bırakılabilir** (1–2 medium PASS'tir), ama `AggregateError`
   ayağının Redis log yolunda eksik olduğu **ölçülmüş** bir teşhis kaybıdır.

`low` bulgular teknik borca kaydedilebilir. **L-11 commit öncesi yazılmalı** — M-6
bilinçli bir K3 sapmasıdır ve kalıcı kaydı yalnızca kod yorumunda durmamalı.
