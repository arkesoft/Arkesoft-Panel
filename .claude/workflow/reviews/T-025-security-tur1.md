# T-025 — `security` gate, tur 1

- **Tarih:** 2026-11-19
- **Sürüm:** ROADMAP v0.0.21.1 (semver sınıfı: `patch`)
- **Dal:** `feat/v0.0.21-surum-kayit-modeli`
- **Denetlenen yüzey:** 9 dosya (7 değişmiş + 2 yeni), 645 ekleme / 48 silme

```
GATE: security
SONUÇ: PASS
```

---

## 1. `architect`'in verdiği dört işin sonucu

### (a) `R1`'in bağımsız ölçümü — ⚠⚠ `architect`'in gerekçesi **DOĞRULANDI**

**Nasıl ölçtüm:** depo dışı (`/tmp/arkesoft-secfetch-probe`, koşum sonunda silindi), **gerçek
TLS** + **gerçek HTTP** sentetik Playwright koşumu. `setContent` **kullanılmadı** — gerekçe:
`setContent` sayfanın orijinini `about:blank` yapar, kardeş alt alan adı orijini **üretemez**,
yani ölçülmesi istenen eksen tam olarak kaybolur. Bunun yerine:

- kendi imzaladığım sertifikayla (`/tmp`, openssl) bir `node:https` sunucusu **ephemeral portta**
  (`listen(0)`) — kullanıcının portlarına/DB'ye/Docker'a/Redis'e **dokunulmadı**;
- Chromium `--host-resolver-rules=MAP *.arkesoft.app 127.0.0.1:<ephemeral>` ile başlatıldı;
- çerez `Domain=.arkesoft.app`, `SameSite=Lax`, `Secure`, `HttpOnly` (üretimdeki
  `crossSubDomainCookies` hâli);
- dört tetikleyici: form `GET` (üst seviye gezinme), form `POST`, `<img>` alt kaynağı,
  `fetch(no-cors, credentials:'include')`.

**⚠ İlk denemem geçersizdi ve bunu kontrol yakaladı:** Playwright `route` ile isteği karşılayıp
`request.allHeaders()` okuduğumda `Sec-Fetch-Site` **her vakada** `(YOK)` döndü — **aynı-orijin
kontrolü de** `(YOK)` verdiği için ölçümün kendisinin geçersiz olduğu anlaşıldı (route
kesmesi, başlıklar ağ katmanında eklenmeden önce koşuyor). Ayrıca düz `http` de geçersizdir:
Fetch Metadata başlıkları yalnızca "potentially trustworthy" URL'lere eklenir. Bu yüzden
ölçüm gerçek TLS'e taşındı ve **üç yönlü kontrol** (kardeş alt alan adı / gerçek çapraz-site /
aynı-orijin) ile geçerliliği kanıtlandı.

**Ham sonuç (gerçek TLS, gerçek istek):**

| Sayfa orijini                | Tetikleyici      | `Sec-Fetch-Site` | `Origin`                     | `Referer`                     | Çerez           |
| ---------------------------- | ---------------- | ---------------- | ---------------------------- | ----------------------------- | --------------- |
| `https://kiraci.arkesoft.app` | form GET (nav)   | **`same-site`**  | (yok)                        | `https://kiraci.arkesoft.app/` | **GÖNDERİLDİ**  |
| `https://kiraci.arkesoft.app` | form POST (nav)  | **`same-site`**  | `https://kiraci.arkesoft.app` | `https://kiraci.arkesoft.app/` | **GÖNDERİLDİ**  |
| `https://kiraci.arkesoft.app` | `<img>` GET      | **`same-site`**  | (yok)                        | `https://kiraci.arkesoft.app/` | **GÖNDERİLDİ**  |
| `https://kiraci.arkesoft.app` | `fetch` no-cors  | **`same-site`**  | (yok)                        | `https://kiraci.arkesoft.app/` | **GÖNDERİLDİ**  |
| `https://evil.example.com` (KONTROL) | form GET | `cross-site`     | (yok)                        | `https://evil.example.com/`    | gönderildi (Lax üst-seviye GET) |
| `https://evil.example.com` (KONTROL) | form POST | `cross-site`    | `https://evil.example.com`   | `https://evil.example.com/`    | **GÖNDERİLMEDİ** |
| `https://panel.arkesoft.app` (KONTROL) | hepsi  | `same-origin`    | —                            | —                             | gönderildi      |

**Sonuç — net:** kardeş alt alan adı (`kiraci.arkesoft.app` → `panel.arkesoft.app`) tarayıcıda
**`same-site`** üretir, **`cross-site` ÜRETMEZ**; ve çerez (`Domain=.arkesoft.app`, `Lax`)
**dört tetikleyicinin hepsinde gönderilir**. Guard'ın birinci dalı yalnızca `cross-site`'ı
reddettiği için bu istekleri **görmez**; onları yakalayan **tek** kapı `Referer` dalıdır.
⇒ **Yol (a)'nın reddi (`K1`) olgusal olarak doğrudur.** Muafiyet verilseydi, platformun
üçüncü taraflara dağıttığı bir alt alan adındaki sayfa, çerezli bir `GET`'i hiçbir kapıya
takılmadan geçirirdi. `architect`'in `DOĞRULANAMADI` listesindeki bu madde **artık ölçüldü**.

**Ek ölçüm — artık risk (aynı harness):** saldırgan sayfası `Referrer-Policy: no-referrer`
uygularsa kardeş alt alan adından gelen **çerezli `GET`**'te `Origin` yok, `Referer` yok,
`Sec-Fetch-Site` = `same-site` ⇒ guard'ın **üçüncü dalı** + güvenli-metot muafiyeti ⇒ istek
**GEÇER**. Bu T-025'in getirdiği bir gerileme **değil** (`K1` bugünkü davranışı korudu);
sömürülebilirliği ölçtüm, bkz. bulgu **F4**. `POST` + `no-referrer` hâlinde tarayıcı
`Origin: null` gönderir (başlık **yok** değil) ⇒ ikinci dal `origin_mismatch` ile **reddeder**
(fail-closed, `'null'` hiçbir güvenilir liste üyesi olamaz çünkü liste `new URL().origin`
çıktılarından kurulur).

### (b) Kiracı orijini reddinin mutasyon sınaması — **KONTROL GERÇEKTEN ZORLUYOR**

**Nasıl ölçtüm:** `apps/api/src/auth/trusted-origins.ts:128-132`'deki `throw` bloğu
`if (false && …)` ile devre dışı bırakıldı (dosya önce `/tmp`'ye bayt kopyalandı).

| Koşum                      | Sonuç                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Mutasyonlu                 | **2 test KIRMIZI / 19 yeşil** — `trusted-origins.test.ts` → _"`kiraci.<APP_BASE_DOMAIN>` FIRLAR"_ (`expected [Function] to throw an error`) **ve** `same-origin-guard-diagnostics.test.ts` → _"(d)-1 … app.init() aşamasında FIRLAR"_ (`promise resolved "{ app: NestApplication… }" instead of rejecting`) |
| Mutasyon geri alındıktan sonra | **21/21 yeşil**                                                                                                      |

İki ayrı katman (saf fonksiyon **ve** gerçek `app.init()`) kırmızıya düştü; kalan 19 test
yeşil kaldı ⇒ öldürme **hedefli**, yan hasar yok. `(d)-3` negatif kontrolü (`panel.…` →
FIRLAMAZ) mutasyonlu koşumda da yeşil kaldı ⇒ iddia "her şey fırlıyor" değil, **ayırt edici**.

**Geri alma ölçülerek gösterildi:**

```
7f5d02c65693cfb071b2da903668a4ce07cd118e7de862bb9139130ad62ea805  apps/api/src/auth/trusted-origins.ts
496ec5d227f32ab9c17e017a9b2bdf03ac0e28e9fe4d06aab4e02841c84104e6  apps/api/src/auth/same-origin.guard.ts
```

Bu iki sha256, mutasyondan **önce** alınan taban değerlerle **birebir aynıdır**
(`diff` → fark yok); `git status --porcelain` çıktısı turun başındaki anlık görüntüyle
**özdeş**; `grep -rn "MUTASYON\|mutationLeaked" apps/api/src/auth` → **iz yok**.

### (c) Log alanlarının PII/orijin türetmediği — **DOĞRULANDI, boşluk savunması da ÇALIŞIYOR**

**Nasıl ölçtüm:** (1) kaynak okuması, (2) **gerçek koşum çıktısındaki ham NDJSON kaydı**,
(3) üretim koduna uygulanan **ikinci bir mutasyon**.

Gerçek koşumdan alınan ham kayıt (`same-origin-guard` ailesi, mutasyonsuz):

```json
{"level":"warn","time":"2026-11-19T07:58:23.057Z","service":"api","version":"0.10.2",
 "requestId":"req_f665e7e2-…","userId":"LBdA6qkv…","reason":"missing_origin_with_cookie",
 "branch":"headers_absent","trustedOriginCount":1,"trustedOriginSources":["AUTH_BASE_URL"],
 "msg":"aynı-orijin olmayan istek reddedildi"}
```

- `trustedOriginSources` **env değişkeni ADLARINI** taşıyor (`determineTrustedOriginSources`,
  `same-origin.guard.ts:262-274` — dizi literalleri `'AUTH_BASE_URL'` / `'SUPERADMIN_BASE_URL'` /
  `'ADDITIONAL_TRUSTED_ORIGINS'`; hiçbir yerde `env.<alan>` **değeri** okunmuyor, yalnızca
  "boş mu / tanımlı mı" sorusu soruluyor). ✅
- `trustedOriginCount` yalnızca `this.trustedOrigins.length` ⇒ **sayı**. ✅
- İsteğin `Origin`/`Referer`/`Sec-Fetch-Site` **değeri** `context`'e de, loga da, yanıta da
  konmuyor; `CrossSiteRequestRejectedError` boş `context` ile fırlatılıyor
  (`"context":{}` — yukarıdaki koşumun `error` kaydında ölçüldü). ✅

**`AC-28`'in negatif iddiası boşluğa düşmüyor — mutasyonla kanıtlandı:** guard'ın `warn`
nesnesine `mutationLeakedReferer: singleHeaderValue(req.headers, 'referer')` eklendiğinde
`same-origin-guard-diagnostics.test.ts` **kırmızıya düştü**:

```
AssertionError: expected '{"level":"info",…' not to contain 'http://probe-d24.arkesoft.test:65123'
+ … "branch":"referer_header","mutationLeakedReferer":"http://probe-d24.arkesoft.test:65123/attacker-form" …
```

Boşluk savunmasının üç ayağı da **yerinde**: (1) jeton ayırt edici (`probe-d24.arkesoft.test`,
port `65123` — depoda başka hiçbir yerde geçmiyor), (2) pozitif yarı (`toHaveLength(1)` +
`reason`/`branch`/`count`/`sources` eşitlikleri) **aynı testte ve negatif taramadan ÖNCE**
koşuyor ⇒ "kayıt hiç üretilmedi" durumu negatifi yalancı yeşile düşüremez, (3) tarama tam
URL + hostname + port + `probe-d24` alt dizesini ayrı ayrı kapsıyor. Mutasyon geri alındı,
sha256 birebir doğrulandı (yukarıda).

**Ek — sır sızıntısı kanalı yok:** `ADDITIONAL_TRUSTED_ORIGINS` girdisi userinfo taşıyorsa
(`https://user:pass@host`) şema **reddediyor** ve hata mesajı **değeri yazmıyor**
(`api-env.ts` → `validateAdditionalTrustedOriginEntry`, sabit Türkçe mesajlar);
`parseEnv` de yalnızca `path: message` üretiyor, girdi **değerini hiç** taşımıyor
(`packages/config/src/env.ts:228-233`, okundu) ⇒ bozuk/parolalı bir env değeri açılış
hatasıyla loga **düşmez**.

### (d) `/trpc` yüzeyinde red davranışı — **GERÇEK HTTP'YLE TEYİT EDİLDİ**

**Nasıl ölçtüm:** `apps/api` dizininden `npx vitest run same-origin-guard-trpc-surface
--reporter=verbose` (gerçek Nest uygulaması, gerçek supertest HTTP, gerçek oturum çerezi):
**5/5 yeşil**.

| Vaka                                                              | İddia            | Ölçülen |
| ----------------------------------------------------------------- | ---------------- | ------- |
| 1/5 `GET /trpc/session.me` + çerez + güvenilmeyen `Referer`        | `403` + `CROSS_SITE_REQUEST_REJECTED` | ✅ |
| 2/5 aynısı **güvenilir** `Referer` ile (pozitif kontrol)          | `not.toBe(403)`  | ✅ |
| 3/5 `GET` + çerez, **başlıksız** (üçüncü dal)                      | `not.toBe(403)`  | ✅ |
| 4/5 `POST /trpc/registration.createTenant` + güvenilmeyen `Referer` | `403` + kod      | ✅ |
| 5/5 `Sec-Fetch-Site: cross-site` + `GET`                           | `403` + kod      | ✅ |

**Assert yönleri kontrol edildi (T-023 dersi — "test kapatılan hatayı pinleyebilir"):**
negatif vakalar `toBe(403)` **ve** `code: 'CROSS_SITE_REQUEST_REJECTED'` eşleşmesi istiyor ⇒
403 başka bir kapıdan (ör. `TenantGuard`/`PlatformAdminIpGuard`) gelse test **geçmez**;
iki pozitif kontrol (`2/5`, `3/5`) `not.toBe(403)` ile negatif pinlerin boşluğa düşmesini
engelliyor. Guard'ın bu yüzeyde **gerçekten kayıtlı** olduğu bağımsız olarak doğrulandı:
`trpc.controller.ts:205-206` → `@UseGuards(SameOriginGuard, PlatformAdminIpGuard)` +
`@All('trpc/*path')`.

⚠ `3/5` bilinçli olarak **üçüncü dalın muafiyetini pinliyor** — yani (a)'da ölçtüğüm artık
riski (F4) de pinlemiş oluyor. Bu bir hata değil, `K1`'in yazılı kararı; ama F4 kapatıldığında
**bu testin de değişmesi gerekecek** ve bunu bilmek gelecekteki ajanın işi.

---

## 2. Ek olarak aranan altı maddenin sonucu

| # | Konu | Ölçüm | Sonuç |
| - | ---- | ----- | ----- |
| 1 | **`R13` — virgül semantiği karıştı mı?** | `grep -rn --include='*.ts' "split(','" apps/api/src` → `api-env.ts:69` (env değeri), `rate-limit/client-ip.ts:73`, `platform-admin-ip.guard.ts:78`, 3 test dosyası. `grep -rn splitAdditionalTrustedOrigins apps/api/src` → **tek argüman her yerde `env.ADDITIONAL_TRUSTED_ORIGINS`** (`trusted-origins.ts:123`, `same-origin.guard.ts:269`, test aynası). `same-origin.guard.ts` içinde **hiç** `split` yok; `singleHeaderValue` yalnızca dizi→ilk-eleman indirgemesi yapıyor. | ✅ **Karışmamış.** Başlık değeri hiçbir yerde virgülden bölünmüyor; `measurements.qa` testinin pinlediği fail-closed davranış (iki `Origin:` satırı → 403) korunuyor. Bypass yok. |
| 2 | **`S3`'ün drift riski** | `determineTrustedOriginSources` (`same-origin.guard.ts:262-274`) üç env alanını `resolveTrustedOrigins`'ten **bağımsız** biliyor. Diagnostics testi (`:75-87`) bu fonksiyonun **aynasını** kuruyor ⇒ ayna, `resolveTrustedOrigins`'i değil **guard'ın kendi listesini** doğruluyor. | ⚠ **Drift mümkün ve bugünkü testler yakalamaz** → bulgu **F3** (`low`). Bugün **yanlış teşhis** üretebileceği tek hâl: tekilleştirme kayması (`SUPERADMIN_BASE_URL` = `AUTH_BASE_URL` ise `count=1` ama `sources` iki ad listeler). Güvenlik etkisi yok (yalnızca log). |
| 3 | **Fail-fast'in DoS yüzeyi** | `resolveTrustedOrigins`'in üretim çağrıcıları: `auth-instance.ts:693` ve `same-origin.guard.ts:291` (**yapıcı**) — ikisi de açılış. Guard `@Injectable()`, **istek kapsamlı değil** ⇒ istek başına fırlama yok. Env'i çalışma zamanında etkileyen bir yol **yok** (`ADDITIONAL_TRUSTED_ORIGINS` yalnızca şema/türetme/teşhis'te okunuyor; istek verisinden beslenen hiçbir yazma yok). `S5`'in sıra iddiası ölçüldü: `(d)-1` reddi koşturulduğunda **tek satır bile log üretilmiyor** (`RoutesResolver`/`Mapped … route`/`Nest application successfully started`/kuyruk/prisma kayıtlarının **hiçbiri**), oysa başarılı açılışlar bu beşini de basıyor ⇒ fırlama **rota kaydından ve DB/Redis/kuyruk kurulumundan ÖNCE**. | ✅ **Uzaktan tetiklenebilir DoS yüzeyi yok.** Yalnızca operatör hatası uygulamayı açılmaz yapar — bilinçli fail-closed. ⚠ `S5`'in "6-7 ms" sayısını **yeniden üretemedim** (ölçtüğüm izolasyon ~25 ms test süresiydi); iddianın **yük taşıyan** yarısı (DB/Redis'ten önce) doğrulandı, milisaniye değeri `DOĞRULANAMADI`. |
| 4 | **Tedarik zinciri** | `git diff --stat -- pnpm-lock.yaml` → **boş** (lock değişmemiş, doğrulandı); `package.json`/`apps/api/package.json` değişmemiş ⇒ yeni bağımlılık **yok**. `pnpm audit` koştu: **0 kritik / 1 high (`multer@2.4.0`, geçişli `@nestjs/platform-express`) / 3 moderate (`minimatch`, `astro`, `@astrojs/node`) / 1 low (`astro`)**. | ✅ T-025 **hiçbirini getirmedi**. Dördü de ROADMAP borç tablosunda **kayıtlı** (`multer` → satır 3756/4123, `minimatch`/`astro`/`@astrojs/node` → `F7`/`D26`, satır 3838/3971) ve sayım T-024 tur 4'ün ölçümüyle **birebir aynı** ⇒ yeni bulgu yazılmadı. |
| 5 | **Tenant izolasyonu (§7) + `R9`/`R10`** | Aşağıdaki §4. | ✅ Kabul edilebilir; artık sınırlar F2/F4'te. |
| 6 | **`.env.example` ↔ kod** | Yedi iddia tek tek sınandı (§3). | ⚠ Biri ayrıştı → **F1** (`low`). |

### §3 — `.env.example:184-204` iddialarının tek tek sınanması

| İddia | Kod | Sonuç |
| ----- | --- | ----- |
| "Opsiyonel; tanımlanmazsa liste bayt-birebir bugünküyle aynı" | `.default('')` → `splitAdditionalTrustedOrigins('')` → `[]` | ✅ |
| "TOPLAMALI — çıkarma/değiştirme yok" | `origins.push(...)`, sıra `[AUTH, SUPERADMIN?, ...ADDITIONAL]`, `new Set` ile tekilleştirme | ✅ |
| "TAM EŞLEŞMELİ" | `trustedOrigins.includes(origin)` / `includes(new URL(referer).origin)` | ✅ |
| "KİRACI ORİJİNİ YASAK … açılışta REDDEDİLİR" | `trusted-origins.ts:126-132`; mutasyonla zorlandığı kanıtlandı (iş (b)) | ✅ |
| "Rezerve etiketler (`panel`/`superadmin`/`api`/`www`/`app`) geçer" | `RESERVED_SUBDOMAINS` **12** etiket: + `admin`, `cdn`, `static`, `assets`, `mail`, `status`, `docs` | ❌ **F1** |
| "Joker/alt alan adı deseni YOK, üst sınır 8" | `WILDCARD_CHARACTER = '\u{2A}'` kontrolü + `MAX_ADDITIONAL_TRUSTED_ORIGINS = 8` (test `MAX+1` ile kırmızı) | ✅ |
| "biçim hatası açılışta GÜRÜLTÜLÜ RET (sessiz 403 değil)" | `superRefine` dört kural + türetmede `new URL()`; testler mesaj regex'iyle (`/joker karakter/`, `/en fazla/` …) iddia ediyor ⇒ boş değil | ✅ |

---

## 3. BULGULAR

```
BULGULAR:
  - [SEV: low] .env.example:199-200 (+ packages/tenancy/src/reserved-subdomains.ts:25-38) —
    Belge/kod ayrışması: yorum rezerve etiketleri "(panel/superadmin/api/www/app)" diye
    PARANTEZ İÇİNDE ve "ör." İBARESİZ sayıyor, ama mekanik kontrol `RESERVED_SUBDOMAINS`'in
    TAMAMINI (12 etiket) geçiriyor — belgede geçmeyen yediden üçü (`cdn`, `static`, `assets`)
    varlık/CDN barındıran etiketlerdir. Saldırı senaryosu: operatör, ölçtüğüm gibi
    `*.arkesoft.app`'in panelle `same-site` olduğunu ve `Domain=.arkesoft.app` çerezinin
    gönderildiğini bilmeden `ADDITIONAL_TRUSTED_ORIGINS=https://assets.arkesoft.app` yazar;
    bu origin mekanik kontrolü SESSİZCE geçer ve o origin üzerinde HTML barındırabilen
    herkes (ileride kiracı yüklemeleri CDN'den servis edilirse: kiracı kullanıcısı) panele
    karşı tam CSRF kazanır. Bugün sömürülebilir DEĞİL (o origin'i kimse env'e yazmadı ve
    CDN yüzeyi henüz tenant HTML servis etmiyor), bu yüzden `low`. Önerilen düzeltme: (i)
    yorumu `RESERVED_SUBDOMAINS`'e atıf yapacak şekilde düzelt, (ii) tercihen allowlist'i
    `RESERVED_SUBDOMAINS` yerine GERÇEK tarayıcı orijini olan etiketlere (`panel`,
    `superadmin`, `api`, `www`, `app`) daralt — `RESERVED_SUBDOMAINS` "tenant slug'ı olamaz"
    listesidir, "güvenilir tarayıcı orijini olabilir" listesi DEĞİL. — sorumlu: docs (i) /
    architect+backend (ii, v0.0.22)
  - [SEV: low] apps/api/src/auth/trusted-origins.ts:115 ↔ :126 — Mekanik kiracı reddinin
    KANONİKLEŞTİRME ASİMETRİSİ: taban alan adı `normalizeHostname()` ile normalize ediliyor
    (sondaki nokta siliniyor, resolve-host.ts:102), girdinin hostname'i ise HAM
    (`parsedEntry.hostname`). Ölçtüm (trusted-origins.ts:81-95'in birebir kopyası +
    gerçek `new URL`): `https://kiraci.arkesoft.app.` (FQDN kök noktası) → `endsWith('.arkesoft.app')`
    FALSE → `label=undefined` → REDDEDİLMEZ, güvenilir listeye eklenir. Aynı sınıf: kiracının
    KENDİ alan adı (`Tenant.primaryDomain`, schema.prisma:147) hiç kapsanmıyor. ⭐ Sömürüye
    dönüşmüyor — gerçek tarayıcıyla ölçtüm: sondaki noktalı host panel için `Sec-Fetch-Site:
    cross-site` üretiyor ve `Lax` çerez POST/alt-kaynakta GÖNDERİLMİYOR ⇒ guard'ın BİRİNCİ
    dalı zaten reddediyor; özel alan adı da tanımı gereği `cross-site`. Bu yüzden `low`
    (savunma derinliği hijyeni, aktif açık değil). Önerilen düzeltme: girdinin hostname'ini
    de `normalizeHostname(parsedEntry.hostname) ?? parsedEntry.hostname` ile geçir (tek
    satır) ve `.env.example`'a "kiracı özel alan adları da yazılmamalı" cümlesini ekle.
    — sorumlu: backend + docs, vade v0.0.22
  - [SEV: low] apps/api/src/auth/same-origin.guard.ts:262-274 — Teşhis kaynağı listesi
    PARALEL: `determineTrustedOriginSources` hangi env alanlarının katkıda bulunduğunu
    `resolveTrustedOrigins`'ten bağımsız biliyor; `same-origin-guard-diagnostics.test.ts:75-87`
    bu fonksiyonun AYNASI olduğu için drift'i yakalamaz (ayna da aynı yöne kayar). Dördüncü
    bir kaynak eklenirse log sessizce eksik `sources` basar; bugün üretilebilen tek yanlışlık
    tekilleştirme kayması (`SUPERADMIN_BASE_URL === AUTH_BASE_URL` → `count=1`, `sources`
    iki ad). Veri sızıntısı/yetki etkisi YOK — yalnızca teşhis doğruluğu, bu yüzden `low`.
    Önerilen düzeltme: `trustedOriginCount >= trustedOriginSources.length` değişmezini
    doğrulayan bir test VEYA `resolveTrustedOrigins`'in kaynak adlarını da döndürdüğü tek
    bir türetme (⚠ ikincisi `R7` imza pinini kırar, ADR gerektirir). — sorumlu: backend,
    vade v0.0.22
  - [SEV: low] apps/api/src/auth/same-origin.guard.ts:197-207 (pinleyen test:
    apps/api/src/__tests__/same-origin-guard-trpc-surface.test.ts:86-98) — KALICI ARTIK
    RİSK, T-025 getirmedi ama PİNLEDİ: kardeş alt alan adındaki bir sayfa
    `Referrer-Policy: no-referrer` uygularsa çerezli bir `GET`'te üç başlığın hiçbiri
    gelmez (gerçek tarayıcıyla ÖLÇTÜM: `Sec-Fetch-Site: same-site`, `Origin` yok, `Referer`
    yok, çerez GÖNDERİLDİ) ⇒ üçüncü dal + güvenli-metot muafiyeti ⇒ istek GEÇER. Saldırı
    senaryosu: `kiraci.arkesoft.app`'te sayfa barındırabilen bir kiracı, panel kullanıcısının
    tarayıcısında kimlikli `GET /trpc/<query>` çağrıları tetikler. Etki ÖLÇÜLDÜ ve SINIRLI:
    (i) `createTrpcRequestHandler` `allowMethodOverride` AÇMIYOR (packages/trpc/src/handler/
    create-trpc-request-handler.ts:99-106) ⇒ `GET` ile MUTASYON çağrılamaz; (ii) `apps/api`
    hiçbir yerde CORS açmıyor (`grep -rni cors apps/api/src` → yalnızca yorum/test) ⇒ yanıt
    gövdesi OKUNAMAZ; kalan etki sorgu yürütülmesi + log/oran bütçesi tüketimi. Bu yüzden
    `low`. Önerilen düzeltme (gelecek sürüm, ADR'li): `Sec-Fetch-Site` başlığı VARSA
    `same-origin` dışındaki her değeri reddet — ölçümüm `same-site`'ın bu toplulukta
    panel-dışı bir sayfa anlamına geldiğini gösteriyor; bu, üçüncü dalı metot muafiyetine
    dokunmadan kapatır ve `3/5` testinin güncellenmesini gerektirir. — sorumlu: architect
    (karar) + backend (uygulama), vade v0.0.22
```

**FAIL kuralı uygulaması:** `critical` 0, `high` 0, `medium` 0, `low` 4 ⇒ **PASS**
(AGENT_BASELINE §4). `low` bulgular için düzeltme turu **açılmaz**; dördü de yukarıdaki
borç satırı metniyle ROADMAP teknik borç tablosuna taşınacak.

---

## 4. Tenant izolasyonu değerlendirmesi (CLAUDE.md §7, 14 madde)

Bu değişiklik **yeni tablo, yeni prosedür, yeni kuyruk işi, yeni dış kaynak anahtarı
eklemiyor** (ölçüldü: diff'te Prisma şeması, `packages/db`, router tanımı, kuyruk tanımı
**yok**). Madde bazında:

| Madde | Durum |
| ----- | ----- |
| `tenant_id` NOT NULL / RLS / bileşik indeks / sır-taşıyan tablo listeleri / `SECURITY DEFINER` / `public` dışı şema / türetilmiş DB nesnesi (7 madde) | **N/A** — DB nesnesi eklenmedi |
| Prosedür tipi (`tenantProcedure`/`permissionProcedure`) | **N/A** — prosedür eklenmedi; değişiklik TÜM `/trpc` yüzeyini koruyan bir guard'ı sertleştiriyor |
| `withTenant()` / ham `prisma` | **N/A** — sorgu eklenmedi |
| Girdiden gelen `id`'ler, sahiplik doğrulaması (IDOR) | **N/A** — guard girdi `id`'si okumuyor; yalnızca başlık okur |
| Kuyruk işi payload'ında `tenantId` | **N/A** |
| Hata mesajı başka tenant'ın varlığını sızdırmıyor | ✅ **ÖLÇÜLDÜ** — red yanıtı tek kod/tek gövde: `AppErrorBody`'nin dört sabit alanı, `details: {}`, orijin değeri/teşhis alanı **yok** (diagnostics testi (c) yarısı; mutasyonla boşluk savunması da doğrulandı) |
| Log kayıtlarında `tenantId` | ✅ altyapı seviyesinde — `request-context.middleware.ts:72` / `accessors.ts:75`: tenant çözülünce `logger.child({ tenantId })` bağlanır; benim koşumlarım kiracı-muaf uçlardaydı, bu yüzden alanı görmedim (beklenen) |
| Süper admin erişimi → denetim/impersonation kaydı | **N/A** — süper admin yolu değişmedi; `PlatformAdminIpGuard` zinciri **dokunulmadı** (`trpc.controller.ts:205` aynı) |

**`R9` değerlendirmesi:** bu sürümün ürettiği tek izolasyon riski doğru teşhis edilmiş ve
**mekanik olarak** kapatılmış; mutasyonla zorlandığını kanıtladım (iş (b)). Kapsam sınırları
F2'de ölçüldü (sondaki nokta + özel alan adı) ve ikisi de tarayıcı tarafında `cross-site`
üretiyor ⇒ guard'ın birinci dalı ikinci bir katman olarak duruyor ("tek katman ≠ kapalı
kanal" tuzağının tersi: burada **iki** katman ölçüldü).

**`R10` asimetrisi (kiracı reddi yalnızca yeni yuvada mekanik) — KABUL EDİLEBİLİR.** Gerekçe
ölçüldü: `AUTH_BASE_URL`'in bugünkü varsayılanı `http://panel.arkesoft.localhost:5173`
(`.env.example:145`) ve `panel` **rezerve** olduğu için kontrol oraya uygulansa bu değer
geçerdi; ama operatörlerin kullanabileceği `local.arkesoft.localhost` sınıfı **bugün geçerli**
yapılandırmalar açılışta ölürdü ⇒ `patch` sınıfı ve §4.5 garantisi kırılırdı. İki eski yuva
yapısal (panel/süper admin tabanı, operatör zaten kendi yüzeyini yazar); yeni yuva ise
"**liste uzat**" yüzeyi olduğu için asıl risk oradadır ve mekanik kontrol tam oraya kondu.
⚠ Tek eksik: `.env.example`'ın `AUTH_BASE_URL`/`SUPERADMIN_BASE_URL` yorumları aynı uyarıyı
**taşımıyor** — F1/F2'nin düzeltme önerisine dahil edildi.

---

## 5. ÖLÇÜMLER

- **`pnpm audit`:** 0 kritik / **1 high** (`multer@2.4.0`, geçişli) / **3 moderate**
  (`minimatch`, `astro`, `@astrojs/node`) / **1 low** (`astro`). `pnpm-lock.yaml` **değişmedi**
  (`git diff --stat` boş) ⇒ hiçbiri T-025 kaynaklı değil; dördü de ROADMAP'te kayıtlı.
- **İncelenen dosya sayısı:** 9 değişen/yeni dosya (7 M + 2 ??) + bağımsız doğrulama için
  okunan 11 dosya (`trpc.controller.ts`, `create-trpc-request-handler.ts`, `auth.module.ts`,
  `tenancy.module.ts`, `reserved-subdomains.ts`, `resolve-host.ts`, `packages/config/src/env.ts`,
  `request-context/*`, `superadmin-config.ts`, `schema.prisma`, `panel-origin-cors.test.ts`)
  = **20 dosya**.
- **Test koşumları (hepsi `apps/api` dizininden `npx vitest run <desen>`; Turbo önbelleği
  devrede DEĞİL — vitest doğrudan çağrıldı):**
  - taban: `trusted-origins` **17/17**, `same-origin-guard` ailesi (5 dosya) **40/40**,
    `same-origin-guard-trpc-surface` tek başına **5/5** (verbose, test adlarıyla)
  - **mutasyon 1** (kiracı reddi kapatıldı): **2 kırmızı / 19 yeşil** → geri alındı → **21/21**
  - **mutasyon 2** (guard logu `Referer` değerini sızdırdı): diagnostics **1 kırmızı / 3 yeşil**
    → geri alındı
  - kapanış koşumu: `same-origin-guard` + `trusted-origins` → **6 dosya / 57 test yeşil**
- **Sentetik tarayıcı ölçümü:** Chromium (Playwright 1.64.1), gerçek TLS, 3 orijin topolojisi
  × 4 tetikleyici = **12 ölçüm** + `no-referrer` varyantı **4** + sondaki-nokta varyantı **4**
  = **20 ham ölçüm**. Harness geçerliliği üç yönlü kontrolle kanıtlandı
  (`same-origin` / `same-site` / `cross-site` üçü de gözlendi).
- **Ölçüm koşulları (AGENT_BASELINE §4 ders 2):** `load averages: 26.65 10.74 7.04`,
  **25 Docker konteyneri** çalışıyor, kullanıcının 3000/5173/5174 portları ve Redis DB 9
  anahtarlarına **dokunulmadı**; `pnpm test:e2e`/`pnpm build`/`pnpm test` **koşturulmadı**
  (kurallara uygun).
- **Depo bütünlüğü:** mutasyona uğrayan iki dosya sha256 ile **birebir** geri yüklendi;
  `git status --porcelain` tur başındaki anlık görüntüyle **özdeş**; `/tmp` artıkları silindi.
- **Karşılanmayan tenant izolasyon maddesi:** **yok** (11 madde N/A — DB nesnesi/prosedür/
  kuyruk işi eklenmedi; 3 madde ✅ ölçüldü).

## 6. DOĞRULANAMADI

1. **`S5`'in "6-7 ms'de fırlıyor" sayısı.** Fırlamanın **DB/Redis/kuyruk kurulumundan ve
   rota kaydından önce** olduğunu ölçtüm (hiç log satırı üretilmiyor); milisaniye değerini
   yeniden üretmedim (gözlediğim izolasyon ~25 ms test süresiydi, modül import'u dahil).
2. **Üretim tarayıcı dağılımı.** Tüm tarayıcı ölçümleri **Chromium 1248** üzerindedir.
   Firefox/Safari `Sec-Fetch-*` ve sondaki-nokta kanonikleştirmesinde farklı davranabilir;
   F2/F4'ün "ikinci katman var" gerekçesi Chromium için ölçülmüştür.
3. **Süper admin e2e (`S6`, 9/9, port 5274).** Kurallar gereği koşturulmadı; `qa` teyit edecek.
4. **`pnpm lint` / `pnpm typecheck` / `pnpm build`.** Bu turda koşturulmadı (build yasak,
   diğer ikisi `qa`'nın kapsamı). Mutasyonların iz bırakmadığı sha256 ile gösterildi.
5. **Kalıcı 403 akışında oran sınırı.** `/trpc` yüzeyinde `RateLimitGuard` anında `true`
   dönüyor (`trpc.controller.ts:39` zinciri, `rate-limit.policy.ts` dört rota) ⇒ reddedilen
   her istek bir `warn` + bir `error` log satırı üretir. Bu **T-025 öncesinden** var olan,
   tüm hata yollarında ortak bir log-amplifikasyon yüzeyidir; bu turda ölçülmedi, bulgu
   yazılmadı (kapsam dışı).
