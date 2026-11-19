# ADR-0026 — Güvenilir Orijin Yüzeyinin Çok Değerliliği ve Reddedilen İsteğin Teşhis Edilebilirliği

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-19
- **Karar verenler:** architect (T-025); kaynak kararlar: ADR-0023 §4 (genişletiliyor, yerini
  almıyor), ADR-0011 gözden geçirme koşulu, kullanıcı onayı 2026-11-19 (ROADMAP `v0.0.21.1`
  açılışı), `security` gate tur 1 (T-025, bağımsız ölçüm — aşağıda)
- **İlgili versiyon:** `v0.0.21.1` (bkz. `ROADMAP.md`)

---

## Bağlam

Borç `D24` (ROADMAP teknik borç, `qa` tur 1, T-024'te `--trace=on` gerçek ağ kaydıyla
ölçüldü): tarayıcı `GET /trpc/platform.session` çağrısında hiç `Origin` taşımıyor
(`Sec-Fetch-Site: same-origin`, yalnızca `Referer`) ama `SameOriginGuard` yine de **403**
`CROSS_SITE_REQUEST_REJECTED` döndürüyordu. Borcun ilk tarifi *"`Referer` dalının güvenli-metot
muafiyeti yok"* diyordu; `pm`'in kod okuması (T-025) bunun **eksik** olduğunu gösterdi — muafiyet
yalnızca üçüncü dalda (`Origin` ve `Referer` ikisi de yok) var, asimetri `Origin`↔`Referer`
arasında değil. `pm` ayrıca borcun patlama yarıçapının `/auth/sessions` değil **`/trpc`'nin
tamamı** olduğunu ölçtü: `SameOriginGuard` iki ayrı yerde kayıtlı
(`apps/api/src/auth/sessions.controller.ts:70` ve `apps/api/src/auth/trpc.controller.ts:205`,
`@All('trpc/*path')`).

Kök neden `D22` ile iç içe geçmişti: `SUPERADMIN_BASE_URL` tek yuvalı, opsiyonel bir env
değişkeni; ayarlanmazsa güvenilir orijin listesi tam 1 eleman olur ve süper admin panelinin
dev sunucusu varsayılan olmayan bir portta koşarken (örn. CI dışı bir geliştirme ortamı,
e2e koşumu) **oturum içi tüm uçlar** 403 alır. Bu, `T-022`/`T-024`'ün koşum ortamını ısıran,
tekrarlayan bir tuzaktı.

Düzeltme için iki temel yol vardı:

- **(a)** `Referer` dalına da güvenli-metot (`GET`/`HEAD`/`OPTIONS`) muafiyeti vermek,
- **(b)** kök nedeni (`D22`) çözmek: güvenilir orijin listesini çok değerli yapmak, guard'ın
  karar mantığına dokunmadan.

(a) ilk bakışta "eksik muafiyeti tamamlamak" gibi görünüyordu; ama bu bir CSRF kontrolünün
gevşetilmesi anlamına gelir ve bağımsız ölçüm (aşağıda) bunun gerçek bir risk olduğunu
doğruladı.

## Karar

**(c) = (b) + iki eklenti** seçildi; **(a) açıkça reddedildi.**

### 1. `Referer` dalı güvenli metotlarda da sıkı kalır — bugünkü davranış pinlenir

`detectViolationAgainstTrustedOrigins`'in karar mantığı **değişmez**. Güvenli-metot muafiyeti
**yalnızca üçüncü dalda** (`Origin` ve `Referer` ikisi de yok) kalır; `Origin` ve `Referer`
dallarının hiçbirine metot muafiyeti **eklenmez**. `D24`'ün "eksik muafiyet" okuması
reddedilir — bu bir eksiklik değil, bilinçli olarak korunan bir davranıştır.

Bu davranış daha önce hiçbir testte **pinlenmemişti** (`pm`'in `P1` ölçümü:
`same-origin-guard.test.ts`'in o zamanki GET regresyon vakaları hep `Referer`'sızdı, `Referer`
dalının vakaları hep `POST`'tu). T-025 bunu `same-origin-guard.test.ts`'e eklenen yeni bir
`describe` ile pinledi: metot (`GET`/`POST`/`HEAD`/`OPTIONS`) × güven (güvenilir/güvenilmeyen
`Referer`) matrisinin dört gözü, hepsi çerezli, **iki giriş noktasında** (saf fonksiyon +
gerçek HTTP, `same-origin-guard-trpc-surface.test.ts`). `GET` × güvenilmeyen `Referer` →
`origin_mismatch` vakası **ilk kez** bu turda pinlendi.

#### Yol (a) neden reddedildi — dört ölçülmüş gerekçe

**(i) (a) gerçek bir gevşetmedir ve `Sec-Fetch-Site` onu yakalamaz — bu artık ölçüldü, varsayılmadı.**
`architect`'in tasarım dokümanı bu reddi `kiraci.<alan-adı>` → `panel.<alan-adı>`'ın aynı
kayıtlı alan adı olduğu ve tarayıcının `cross-site` değil `same-site` üreteceği **varsayımına**
dayandırmıştı; `architect` kendi `DOĞRULANAMADI` listesinde bunu açıkça yazmıştı (`Bash` aracı
yok, hiçbir gerçek tarayıcı ölçümü yapılamadı). `security` gate (T-025 tur 1) bunu **gerçek
TLS + gerçek HTTP** ile ölçtü: kendi imzalı sertifika, `/tmp`'te ephemeral bir `node:https`
sunucusu (depo dışı, koşum sonunda silindi), Chromium `--host-resolver-rules` ile üç orijin
topolojisi (kardeş alt alan adı / gerçek çapraz-site kontrolü / aynı-orijin kontrolü) ve dört
tetikleyici (form `GET`, form `POST`, `<img>`, `fetch`):

| Sayfa orijini | Tetikleyici | `Sec-Fetch-Site` | Çerez (`Domain=.<alan-adı>`, `Lax`) |
| --- | --- | --- | --- |
| kardeş alt alan adı (örn. `kiraci.<alan-adı>`) | form GET | **`same-site`** | GÖNDERİLDİ |
| kardeş alt alan adı | form POST | **`same-site`** | GÖNDERİLDİ |
| kardeş alt alan adı | `<img>` GET | **`same-site`** | GÖNDERİLDİ |
| kardeş alt alan adı | `fetch` (no-cors) | **`same-site`** | GÖNDERİLDİ |
| **KONTROL** — gerçek çapraz-site (`evil.example.com`) | form POST | `cross-site` | GÖNDERİLMEDİ |
| **KONTROL** — aynı orijin (panel) | hepsi | `same-origin` | GÖNDERİLDİ |

Dört tetikleyicinin dördünde de `Sec-Fetch-Site: same-site` ve çerez teslimi ölçüldü; guard'ın
birinci dalı yalnızca `cross-site`'ı reddettiği için bu istekleri **görmüyor** — onları
yakalayan **tek kapı `Referer` dalı**. Yol (a) seçilseydi, platformun üçüncü taraflara
dağıttığı bir alt alan adındaki (`kiraci.<alan-adı>`) bir sayfa, çerezli bir `GET`'i hiçbir
kapıya takılmadan geçirebilirdi. `architect`'in yol (a)'yı reddetme gerekçesi bu ölçümle
**olgusal olarak doğrulandı**.

⚠ **`security`'nin kendi ilk ölçüm denemesi geçersizdi — ve bunu bir kontrol vakası yakaladı.**
Playwright `route` kesmesiyle (`request.allHeaders()`) ölçüldüğünde `Sec-Fetch-Site` **her
vakada** boş döndü; `security` bunu **aynı-orijin kontrol vakasının da** boş dönmesinden
fark etti (gerçek tarayıcı davranışında aynı-orijin isteklerde bu başlık dolu gelmeliydi).
Kök neden: `route` kesmesi, başlıklar ağ katmanında eklenmeden **önce** çalışıyor. Ölçüm bu
yüzden gerçek TLS + gerçek ağ isteğine taşındı. **Ders:** kontrol vakası (burada "aynı-orijin"
satırı) olmasaydı geçersiz ölçüm "doğru" sanılıp ADR'ye öyle girecekti — üç yönlü kontrol
(`same-origin`/`same-site`/`cross-site`'ın üçü de gözlenmiş olması) bir ölçüm harness'inin
geçerliliğinin kendisi için de gerekli bir kanıttır.

**(ii) Bugünkü sıkı davranış daha önce bağımsız ölçülmüş ve bir ADR'ye girmiştir.**
`security` gate (T-009, ADR-0012 hazırlığı) dört vakayı ham ölçtü ve `docs/adr/0012-vitrin-yuzeyi-anonim-trpc-kiraci-host-ve-onbellek.md:106-116`'ya yazdı: `Referer:
https://evil.example.com/` → 403; `Sec-Fetch-Site` yok + `Referer` yok + `GET` → 200. Yol (a)
uygulansaydı bu önceden ölçülmüş ve belgelenmiş davranış **geriye dönük yanlışa düşerdi**.

**(iii) Depoda tam bu değişiklik sınıfını bekleyen bir bekçi var.**
`same-origin-guard-fail-closed.qa.test.ts:16-18` kendi amacını şöyle yazıyor: *"biri …
`SAFE_METHODS` kümesini genişletirse bu test kırmızı verir"*. Yol (a) tam olarak bu
genişletmedir; önceki bir FIX turunun fail-open daraltmasını kısmen geri alırdı.

**(iv) Yanıt okunamazlığı yeterli savunma değildir.** CORS yanıt gövdesini gizler, ama
`GET`'in yan etkilerini gizlemez: `/trpc`'de bir `query` yapısal olarak yan etkisiz değildir
(oran-sınırı sayaçları, oturum dokunuşu, log/denetim yazımı), tRPC `GET` toplu (batch) çağrı
kabul eder, zamanlama/hata-kodu yan kanalı kalır. `pm`'nin ölçtüğü gibi patlama yarıçapı
`/trpc`'nin tamamıdır.

### 2. Güvenilir orijin yüzeyi üçüncü, N-değerli, toplamalı bir kaynak kazanır

`apps/api/src/auth/trusted-origins.ts`'teki `resolveTrustedOrigins` artık üçüncü bir ortam
değişkenini tüketir: **`ADDITIONAL_TRUSTED_ORIGINS`** — opsiyonel, varsayılan `''`, virgülle
ayrılmış, **tam eşleşmeli** orijin listesi. Türetme sırası bağlayıcıdır:
`[origin(AUTH_BASE_URL), origin(SUPERADMIN_BASE_URL)?, ...origins(ADDITIONAL)]`, tekilleştirme
ile (`new Set`). Fonksiyonun **imzası değişmez** (`ApiEnv` alır, `readonly string[]` döner) —
`SameOriginGuard` ve Better Auth'un `trustedOrigins` seçeneği (`auth-instance.ts`) **tek
kaynaktan** beslenmeyi sürdürür (ADR-0011/ADR-0023'ün garantisi korunur).

Sekiz bağlayıcı kısıt:

1. **Tek türetme fonksiyonu** — `resolveTrustedOrigins` dışında hiçbir yerde orijin türetilmez.
2. **Tam eşleşme** — her girdi şema seviyesinde doğrulanır: `http`/`https` mutlak URL; joker
   karakter yok; kullanıcı adı/parola bileşeni yok; `/` dışında yol/sorgu/fragment yok.
3. **CORS açılmaz** — ADR-0023 §4 madde 2 aynen yürürlükte; bu ADR onu gevşetmiyor.
4. **`toHaveLength` kardinalite iddiası korunur** — `toContain`'e indirilmedi; liste büyüdükçe
   test elle güncellenmek zorunda, bu bilinçli görünürlük maliyetidir (ADR-0023 §4 madde 4'ün
   emsali).
5. **ADR-0023 §4.5 bayt-birebir garantisi korunur** — `ADDITIONAL_TRUSTED_ORIGINS` verilmezse
   davranış sürüm öncesiyle tamamen aynıdır; bu yüzden değişiklik `patch` sınıfındadır.
6. **Açılışta fail-fast** — fonksiyon artık fırlayabilir (kardinalite üst sınırı 8, biçim
   hataları, kiracı orijini reddi); bu yüzden **yalnızca açılış zamanında** çağrılabilir.
   `SameOriginGuard` türetmeyi `canActivate`'ten yapıcıya taşıdı — istek başına `new URL()`
   ayrıştırması artmıyor, tam tersine **hiç yapılmıyor** (önceden istek başına 1-2 kez).
7. **Kiracı orijini reddi** — bir girdinin hostname'i `APP_BASE_DOMAIN`'in tek etiketli bir alt
   alan adıysa ve etiket `RESERVED_SUBDOMAINS` üyesi değilse (`panel`/`superadmin`/`api`/`www`/
   `app` ve `RESERVED_SUBDOMAINS`'in diğer üyeleri geçer; bir kiracı slug'ı geçmez) açılışta
   `Error` fırlatılır. Bu kontrol kasıtlı olarak **şemada değil türetmede** yaşar: test
   altyapısının bir kısmı (`createTestApp({ apiEnv })`) `ApiEnv` sağlayıcısını tamamen
   `overrideProvider` ile değiştirir, bu durumda şema doğrulamaları hiç çalışmaz; türetmede
   olduğu için kontrol `app.init()`'in her yolunda (override edilmiş env'lerde de) çalışır.
8. **Yalnızca açılışta çağrılır** — bkz. madde 6.

### 3. Reddedilen istek teşhis edilebilir olur — orijin değeri loglanmadan

İç `detectViolationAgainstTrustedOrigins` artık `{ reason, branch }` döner; `branch`:
`'sec_fetch_site' | 'origin_header' | 'referer_header' | 'headers_absent'`. Geriye uyumlu,
tek-orijin alan `detectSameOriginViolation`'ın dönüş tipi **değişmez** (bugün sıfır üretim
tüketicisi var, yalnızca testlerde kullanılıyor). `SameOriginGuard.canActivate` reddedilen
istek için log kaydına dört alan ekler:

| Alan | Değer | Neden sızdırmaz |
| --- | --- | --- |
| `reason` | mevcut üç değer | değişmiyor |
| `branch` | hangi dal reddetti | `origin_mismatch`'i ikiye ayırır — `D24` sınıfının imzası `branch:'referer_header'`'dır |
| `trustedOriginCount` | sayı (1..8) | yalnızca kardinalite, orijin değeri değil |
| `trustedOriginSources` | katkıda bulunan env değişkeni **adları** (`'AUTH_BASE_URL'` vb.) | **ad**, değer değil |

**İsteğin `Origin`/`Referer` değeri ne loga ne yanıta yazılır** — guard'ın önceden var olan
kuralı (`:181-185`, "istek orijininin değeri loglanmaz") bu eklentiyle **bozulmaz**. HTTP yanıt
sözleşmesi değişmez: red hâlinde gövde yine tek kod/tek gövde (`CROSS_SITE_REQUEST_REJECTED`);
teşhis alanları yalnızca sunucu logunda görünür.

Operatör ayrımı: `branch:'referer_header'` + `trustedOriginCount:1` + `trustedOriginSources:
['AUTH_BASE_URL']` ⇒ *"süper admin orijini hiç yapılandırılmamış"* (yapılandırma hatası). Aynı
dal + `trustedOriginCount:3` + dolu kaynak listesi ⇒ *"liste tam, gelen orijin gerçekten
yabancı"* (gerçek ihlal).

**Boşluk (vacuity) savunması — `security` gate ölçtü, boşluğa düşmediği kanıtlandı.** Negatif
iddia ("orijin değeri logda yok") ayırt edici bir jetonla (`probe-d24.arkesoft.test:65123`)
test edildi; aynı testte **pozitif** yarı (teşhis alanlarının varlığı, `toHaveLength`/eşitlik
iddiaları) negatif taramadan **önce** koşuyor — "kayıt hiç üretilmedi" durumu negatif iddiayı
boşa düşüremez. `security` bunu ikinci bir mutasyonla doğruladı: guard'ın log nesnesine
`Referer` değerini sızdıran bir alan eklendiğinde (`mutationLeakedReferer: singleHeaderValue(...)`)
`same-origin-guard-diagnostics.test.ts` **kırmızıya düştü** (1 kırmızı/3 yeşil); mutasyon geri
alındı, dosyanın sha256'sı mutasyon öncesiyle **birebir** doğrulandı
(`496ec5d227f32ab9c17e017a9b2bdf03ac0e28e9fe4d06aab4e02841c84104e6`).

### Karar 1'in bozulmaya dirençli olduğu — `qa` gate'in kasıtlı bozma sınaması

`qa` gate, Karar 1'in (yol (a) reddinin) testler tarafından gerçekten yakalandığını
doğrulamak için `same-origin.guard.ts`'in `Referer` dalına geçici bir mutasyon uyguladı
(güvenli metotlarda `Referer` denetimini atlayan bir dal — yol (a)'nın canlı simülasyonu).
Mutasyonlu koşum: **3 dosya kırmızı / 2 geçti, 9 test kırmızı / 32 geçti**; kırılan testler tam
isabetliydi (`AC-26` matrisinin `GET`/`HEAD`/`OPTIONS` + güvenilmeyen `Referer` vakaları, iki
giriş noktasında). Dosya mutasyon sonrası **sha256 birebir** olarak geri yüklendi (hash,
`security`'nin tur 1'de kaydettiği taban değerle özdeş); geri alma sonrası tüm süit (41/41)
tekrar yeşile döndü. Bu, Karar 1'i koruyan testlerin **boşa düşmediğinin**, kaynaktan bağımsız
bir kanıtıdır.

`qa` ayrıca `K1` kararını tersine çeviren ayrı bir mutasyon uyguladı: **3 dosya / 9 test**
kırmızı oldu, sonra sha256 birebir geri yükleme ile 41/41 yeşile döndü — aynı sınıf kanıt,
ikinci bağımsız turda tekrarlandı.

### Değerlendirilen alternatifler

| Alternatif | Neden seçilmedi |
| --- | --- |
| **(a)** `Referer` dalına güvenli-metot muafiyeti | Gerçek bir CSRF gevşetmesidir; kardeş alt alan adının tarayıcıda `same-site` (değil `cross-site`) ürettiği ve çerezin dört tetikleyicide de gönderildiği `security` gate tarafından **gerçek TLS/HTTP ile ölçüldü** (yukarıda); `same-origin-guard-fail-closed.qa.test.ts`'in bilerek yazılmış bekçisini kısmen geri alırdı; ADR-0012'nin önceden ölçülmüş, belgelenmiş davranışını geriye dönük yanlışa düşürürdü |
| Hiçbir şey yapma / yalnızca belgele | Belge zaten vardı (`.env.example:168-173`, "port AYNI OLMAK ZORUNDADIR, sapma sessiz 403 üretir") ve yetmedi — eksik olan **teşhis edilebilirlikti**, belge değil |
| CORS açmak / joker ya da alt alan adı deseni / `Origin` yansıtması | ADR-0023 §4 madde 2 ve 3'ün bağlayıcı yasağı; bu ADR o yasağı **genişletiyor**, kaldırmıyor |
| Orijini `Host` başlığından türetmek | İstemci tarafından kontrol edilen bir bayt üzerine yetkilendirme kurmak olurdu |
| `SUPERADMIN_BASE_URL`'i virgüllü bir listeye çevirmek | Mevcut, dokunulmuş bir ortam değişkeninin **anlamını** değiştirirdi; ADR-0023 §4.5'in bayt-birebir garantisini ve CI'ın iki `env:` bloğuyla kurduğu sözleşmeyi bozardı |
| Reddedilen isteğin orijin **değerini** loglamak | Kimlik avı/hedef alan adı sızıntısı riski; guard'ın önceden var olan "değer loglanmaz" kuralını (`:181-185`) doğrudan ihlal ederdi |
| ADR-0023'ü yerinde değiştirmek | `docs/adr/0000-sablon.md:49` — "ADR'ler silinmez ve geçmişe dönük düzenlenmez"; karar değişince yeni ADR yazılır |

## Sonuçlar

### Olumlu

- `D24`'ün kök nedeni (`D22` ile birlikte) kapanıyor; süper admin dev sunucusu varsayılan
  olmayan bir portta koşarken oturum içi tüm uçların 403 alması sona eriyor — tek bir API
  süreci artık panel + süper admin + bir test/geliştirme portu için **aynı anda** güvenilir
  olabiliyor (çok değerli listenin yapısal kazancı; iki yuvalı eski modelde bu üçlü ifade
  edilemezdi).
- Hiçbir CSRF kontrolü gevşemedi; `Referer` dalının sıkı davranışı ilk kez pinlendi.
- Yanlış yapılandırma artık loglardan teşhis edilebiliyor — operatör "ben mi yanlış
  yapılandırdım yoksa gerçek bir saldırı mı" sorusunu orijin değerine ihtiyaç duymadan
  yanıtlayabiliyor.
- Türetme açılış zamanına taşındığı için istek başına maliyet **azaldı** (önceden istek başına
  1-2 `new URL()`, şimdi hiç).
- Geri alma tek commit `revert`; migration yok, veri dönüşümü yok. Kısmi geri alma kolu da var:
  kodu geri almadan `ADDITIONAL_TRUSTED_ORIGINS`'i boşaltmak davranışı sürüm öncesine
  bayt-birebir döndürür.

### Olumsuz ve kabul edilen maliyetler

- **`R9` — yeni değişken operatöre kiracı orijinini listeye yazma imkânı verir** (kardeş
  alt alan adı CSRF savunmasını o kiracı için iptal ederdi). **Mekanik olarak kapatıldı**
  (yukarıdaki kiracı orijini reddi); `security` gate bunu mutasyonla sınadı (`throw` bloğu
  `if (false && …)` ile devre dışı bırakıldı → 2 test kırmızı, iki ayrı katmanda — saf
  fonksiyon ve gerçek `app.init()`; mutasyon geri alındıktan sonra 21/21 yeşil; dosya
  sha256 birebir geri yüklendi).
- **`R10` — kabul edilen asimetri.** Kiracı orijini reddi **yalnızca** `ADDITIONAL_TRUSTED_ORIGINS`'e
  mekanik olarak uygulanır; `AUTH_BASE_URL`/`SUPERADMIN_BASE_URL` aynı kontrolü **taşımaz**,
  yalnızca belgeyle korunur. Bilinçli: `AUTH_BASE_URL`'in varsayılanı
  `http://panel.arkesoft.localhost:5173`dür ve `panel` rezerve bir etiket olduğu için kontrol
  oraya uygulansa bu geçerdi — ama operatörlerin kullanabileceği `local.arkesoft.localhost`
  sınıfı bugün geçerli yapılandırmalar açılışta ölürdü, bu da ADR-0023 §4.5 garantisini ve
  `patch` sürüm sınıfını bozardı. İki eski yuva yapısal (panel/süper admin tabanı, operatör
  zaten kendi yüzeyini yazıyor); asıl risk "liste uzat" yüzeyi olan yeni yuvada ve mekanik
  kontrol tam oraya kondu. `security` gate bunu **kabul edilebilir** ölçtü; `low` borç olarak
  kayıtlı.
- **`R11` — türetmenin gerçekten açılış zamanlı olduğu, Nest'in guard örnekleme fazına
  bağlıdır ve doğrudan ölçülemedi** (`Bash` aracı yok döneminde `architect` için; `security`
  gate ise `(d)-1` reddinin tetiklendiği koşumda **hiçbir** rota kaydı/DB/Redis/kuyruk log
  satırının üretilmediğini gözlemleyerek — yani fırlamanın bu üçünden **önce** olduğunu —
  dolaylı olarak doğruladı). Düşüş emniyeti: Better Auth tüketicisi (`auth-instance.ts`)
  zaten kendi fabrikasında açılışta türetiyor; fail-fast garantisi guard'ın zamanlamasından
  bağımsız duruyor.
- **`R13` — virgül ayrıştırması yalnızca env değerine uygulanır, başlık değerine asla.**
  Node'un yinelenen `Origin` başlıklarını virgülle birleştirdiği ölçülmüş bir davranıştır
  (`same-origin-guard-measurements.qa.test.ts`); bu nedenle başlık değeri hiçbir yerde
  virgülden bölünmez — bölünürse bu fail-closed davranış bypass'a dönerdi. `security` gate
  bunu bağımsız olarak doğruladı: `apps/api/src` içinde `split(','` çağrılarının tamamı
  tek argüman olarak yalnızca `env.ADDITIONAL_TRUSTED_ORIGINS` alıyor; `same-origin.guard.ts`
  içinde hiç `split` yok.
- **Kalıcı artık risk, bu ADR'nin getirdiği bir gerileme değil ama pinlenen bir davranış
  (bulgu `F4`, `security` gate, `low`):** kardeş alt alan adındaki bir sayfa
  `Referrer-Policy: no-referrer` uygularsa, çerezli bir `GET`'te `Sec-Fetch-Site`, `Origin`,
  `Referer` üçü de gelmez ⇒ guard'ın üçüncü dalı + güvenli-metot muafiyeti ⇒ istek **geçer**.
  Bu T-025'in getirdiği bir gerileme değildir (Karar 1 bugünkü davranışı değiştirmeden
  pinledi) — sınırları ölçülmüştür: `createTrpcRequestHandler` `allowMethodOverride`
  açmıyor (`GET` ile mutasyon çağrılamaz) ve `apps/api` hiçbir yerde CORS açmıyor (yanıt
  gövdesi okunamaz); kalan etki sorgu yürütülmesi + log/oran-sınırı bütçesi tüketimidir. Bu
  davranış `same-origin-guard-trpc-surface.test.ts:86-98`'de **kasıtlı olarak pinlenmiştir**
  (üçüncü dal + güvenli metot → 403 **değil**) — F4'ü kapatan bir gelecek değişiklik bu testi
  de güncellemek zorunda kalacaktır. Düzeltme ayrı bir ADR gerektirir (aşağıdaki "Açık kalan
  konu").
- Güvenilir orijin listesi artık **üç** kaynaklı; `determineTrustedOriginSources`
  (`same-origin.guard.ts`) bu üç alanı `resolveTrustedOrigins`'ten **bağımsız** bilir — dördüncü
  bir kaynak eklenirse ikisi birbiriyle tutarlı kalabilir ve drift mekanik olarak
  yakalanmayabilir (`low` borç, bkz. ROADMAP).

### Etkilenen sonraki kararlar

- **ADR-0023'ün durumu değişmez.** Bu ADR onun §4 madde 1'ini (tek türetme fonksiyonu
  garantisi) genişletir; §4 madde 2 (CORS kapalı), madde 3 (joker/alt alan adı yasağı),
  madde 4 (kardinalite assertion'ı) ve §4.5 (bayt-birebir garanti) **aynen yürürlükte**,
  bu ADR tarafından değiştirilmemiştir. ADR-0023 **yerini almaz**, ADR-0023 genişler.
- **Açık kalan konu (ayrı ADR gerektirir):** kiracı/özel alan adı orijinlerinin tarayıcıdan
  doğrudan `/trpc` çağırması (bugün vitrin bunu sunucu tarafından yapıyor; React adaları tek
  tek izlenmedi) — bu ADR'nin kapsamı dışıdır, `X3` olarak kayıtlıdır.
- Bulgu `F4`'ün kapatılması (bir sonraki sürüm, mimari karar gerektirir): `Sec-Fetch-Site`
  başlığı **varsa** `same-origin` dışındaki her değeri reddetmek; bu üçüncü dalı metot
  muafiyetine dokunmadan kapatır ama `same-origin-guard-trpc-surface.test.ts`'in `3/5`
  vakasının güncellenmesini gerektirir.

## Gözden geçirme koşulları

1. **Üretim dağıtımı gerçekleştiğinde** — bu ADR'nin tüm ölçümleri geliştirme/CI ortamında
   yapılmıştır (`infra/` bugün tek dosya, Pulumi/Helm yok); gerçek bir üretim dağıtımında
   `ADDITIONAL_TRUSTED_ORIGINS`'in operasyonel disiplini (kim ekliyor, ne zaman) yeniden
   değerlendirilmelidir.
2. **Vitrin tarayıcıdan `/trpc` çağırdığında** — bugün vitrin sunucu tarafından fetch ediyor;
   bir React adası tarayıcıdan `/trpc` çağırırsa `X3`'ün açık konusu zorunlu hale gelir.
3. **Dördüncü bir tarayıcı yüzeyi geldiğinde** — ADR-0023'ün gözden geçirme koşulu 1 ile
   aynı tetikleyici; listenin elle tutulan yapısı (kardinalite assertion'ı) yeniden
   değerlendirilir.
4. **`Sec-Fetch-Site` politikası genişletilmek istendiğinde** — bulgu `F4`'ün kapatılması
   tam olarak bu genişletmedir; yukarıdaki "Etkilenen sonraki kararlar" bölümüne bakın.
5. **Liste çalışma zamanında beslenmek istendiğinde** — bugün liste yalnızca açılışta,
   ortam değişkenlerinden kurulur; çalışma zamanı güncellemesi (örn. bir yönetim ucu)
   istenirse "yalnızca açılışta çağrılabilir" bağlayıcı kısıtı ve fail-fast garantisi
   yeniden tasarlanmalıdır.
