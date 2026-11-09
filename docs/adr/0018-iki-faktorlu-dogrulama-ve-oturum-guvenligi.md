# ADR-0018 — İki Faktörlü Doğrulama ve Oturum Güvenliği

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-06
- **Karar verenler:** Architect (T-016, gate: qa, security, solid)
- **İlgili versiyon:** `v0.0.15` (ROADMAP v0.0.15 kapsamında uygulanır)

---

## Bağlam

ROADMAP v0.0.15 hesap güvenliğini MVP seviyesine çıkarmayı hedefliyordu: TOTP tabanlı
2FA (kurulum, doğrulama, kapatma, yedek kodlar) ve owner rolü için 2FA zorunlu kılma.
Kullanıcı kararıyla (2026-11-06) kapsam üçe bölündü — bu ADR yalnızca **teslim edilen**
kısmı (md 1 tam, md 2'nin mekanizması) kapsar; aktif oturum listesi, step-up auth ve
şifre politikası/HIBP kontrolü `v0.0.15.1`/`v0.0.15.2`'ye taşındı ve bu ADR'nin dışındadır
(bkz. ROADMAP `v0.0.15.1`/`v0.0.15.2`).

Platform zaten Better Auth üzerinde kurulu (ADR-0008) ve parola hash'i/oturum
belirteci/doğrulama belirteci taşıyan üç tablo `arkesoft_auth` rolü + kolon bazlı
`GRANT`/`REVOKE` ile veritabanı seviyesinde korunuyor (ADR-0017). Bu teslim dördüncü bir
sır taşıyan tablo (`two_factor`) ekliyor ve ADR-0017'nin kendi "Gözden geçirme
koşulları" §1'inin öngördüğü genişlemeyi tetikliyor: _"v0.0.15'in 2FA'sı yeni sır
taşıyan kolonlar eklerse `AUTH_SECRET_BEARING_TABLES`/`AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS`
genişletilir"_ (ADR-0017:266-269).

---

## Karar

### 1. Better Auth'un KENDİ `twoFactor` eklentisi kullanıldı — yeni ana bağımlılık YOK

`better-auth@1.7.14`'ün bildirilmiş alt yolu (`./plugins/two-factor`, 8 HTTP ucu) 2FA
mekanizmasını sağlıyor; sıfırdan yazılan bir uç kümesi yerine bu eklenti kullanıldı →
CLAUDE.md §2'nin yeni ana bağımlılık onayı **gerekmedi** (mevcut `better-auth`'un bir alt
yolu, zaten bildirilmiş bağımlılık).

`accountLockout` **açıkça** yapılandırıldı (**10 deneme / 900 sn**), eklentinin
varsayılanına bırakılmadı. Gerekçe: `auth-instance.ts:36-40` oran sınırlama için tam
bunu reddetmişti — _"iki ayrı, koordinesiz eşik AYNI anda çalışmasın"_. Varsayılana
bırakmak, platformun kendi oran sınırlama mekanizmasıyla koordinesiz ikinci bir eşik
doğururdu.

⚠ **Ölçülmüş ek gerçek:** eklentinin **challenge başına** sınırı **5**, hesap seviyesi
sınırı **10** — iki kademeli ve kullanıcıya **farklı** şey söylenmesi gerekiyor (bir
challenge'ın 5 denemede geçersiz kalması, hesabın 10 denemede kilitlenmesinden farklı bir
olaydır).

### 2. TOTP port'u `node:crypto` ile RFC 6238/4226'yı kendi uyguladı

`@better-auth/utils/otp` import etmek **phantom dependency** olurdu: geçişli (transitive)
bir paket, `package.json`'da bildirilmemiş. Bunun yerine RFC 6238 (TOTP) ve RFC 4226
(HOTP) `node:crypto` ile kendi uygulandı ve RFC 6238 **Ek B** test vektörleriyle
doğrulandı (12/12).

### 3. `two_factor` platform seviyesi tablo — `tenant_id` YOK

Kullanıcı kimliği (hesap güvenliği) kiracıya bağlı değil; bir kullanıcının 2FA durumu
hangi kiracıda üye olduğundan bağımsızdır. `two_factor` tablosu platform seviyesinde
tanımlandı, `tenant_id` kolonu **yok**, RLS politikası **yok** (platform tabloları için
zaten reddedilen bir mekanizma, ADR-0008 Bağlam).

ADR-0017'nin katalog yapıları genişletildi:
`AUTH_SECRET_BEARING_TABLES` **3→4**, `PLATFORM_LEVEL_TABLES` **5→6**,
`AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS` **4→5** (`packages/db/src/tenancy.ts`).

### 4. Rol ayrımı ateşlendi — `arkesoft_auth` kolon bazlı, `arkesoft_app` sıfır

`arkesoft_auth` → `two_factor` tablosunda **27 kolon hibesi** (**9 kolon × 3 yetki**:
SELECT/INSERT/UPDATE) + tablo bazlı `DELETE`. `arkesoft_app` → **tamamen yetkisiz**
(canlı prob: `permission denied for table two_factor`, SQLSTATE **42501**).

⚠ **SQLSTATE `error.code`'da DEĞİL.** ADR-0017'nin zaten belgelediği yüzey burada da
geçerli: `error.code` `$queryRaw` çağrısında **P2010**, ORM çağrısında (`.create()` vb.)
**P2039** — gerçek SQLSTATE (`42501`) her ikisinde de
`error.meta.driverAdapterError.cause.originalCode`'da. `.code === '42501'` **asla**
doğru olmaz; bu teslimin canlı yetki testleri `originalCode` üzerinden assert eder.

### 5. İki hata kodu, iki statü, bilinçli ayrım

`TWO_FACTOR_SETUP_REQUIRED` (**409** — politika henüz değişmedi, kendini kilitlememe
kontrolü tetiklendi) vs `TWO_FACTOR_REQUIRED` (**403** — politika zaten açık, erişim
reddi). Aynı hata sınıfını iki farklı statüyle kullanmak `AppError`'ın
code↔httpStatus **sabit** eşlemesini bozardı (CLAUDE.md §4 "Hata yönetimi deseni") — bu
yüzden iki ayrı kod, iki ayrı sınıf.

### 6. Kendini kilitlememe, iki yönlü

(a) Politikayı (owner için 2FA zorunlu) açan owner **kendisi** önce 2FA kurmuş olmalı —
⚠ **yalnızca ÇAĞIRAN kullanıcı** denetlenir. _"Kiracının başka 2FA'sız owner'ı var mı"_
sorgusu **bilinçli olarak yazılmadı**: böyle bir sorgu başka kullanıcıların güvenlik
durumunu (2FA açık/kapalı) çağırana sızdırır — bu CLAUDE.md §7'nin "başka tenant'ın
varlığını sızdırma" ilkesinin aynı ailesindeki bir ihlal olurdu.

(b) Politika açıkken 403 `TWO_FACTOR_REQUIRED` alan bir owner **kilitli değildir** —
altı 2FA ucunun (kurulum, doğrulama, kapatma, yedek kod üretme/doğrulama, durum sorgusu)
hepsi `TENANT_EXEMPT_PATHS` üyesi, dolayısıyla politika kontrolünün kendisi bu uçları
bloklayamaz; owner kendi 2FA'sını kurup politikayı karşılayabilir.

### 7. Denetim kaydı ayrımı — kullanıcı seviyesi olay `audit_log`'a yazılamaz

Kullanıcı seviyesi 2FA olayı (kurulum, kapatma, yedek kod yenileme) `audit_log`'a
**yazılamaz** — tablo `tenantId` **NOT NULL** ve bu olaylar bir kiracıya bağlı değil.
Telafi: **pino** olay logu (`userId` ile, `tenantId` **yok**).

Kiracı seviyesi değişiklik (owner için 2FA zorunlu kılma politikasının açılıp
kapanması) ise **yazılır** — bu bir tenant ayarı değişikliğidir ve kiracıya bağlıdır:
`AuditAction` **4→5** (yeni değer: `tenant_security_policy_changed`), `subject` =
`tenantId`.

### 8. Sır yönetimi — `PINO_REDACT_PATHS` genişletildi, `code` BİLİNÇLİ OLARAK eklenmedi

`PINO_REDACT_PATHS` **+=** `totpURI`, `backupCodes`, `*.secret` (`secret` zaten vardı).

⚠ `code` (hata kodu, örn. `INVALID_CODE`, `TWO_FACTOR_REQUIRED`) **bilinçli olarak
eklenmedi**: hata kodları kullanıcıya dönük ve tanı (diagnostic) için gereklidir, sır
değildir. CLAUDE.md §4'ün "asla loglanmaz" listesi (şifre, token, çerez, API anahtarı,
kart verisi, TCKN, tam adres, tam e-posta) `code` alanını kapsamıyor; `code`'u maskelemek
operasyon ekibinin hatayı teşhis etme yeteneğini gerekçesiz azaltırdı.

### 9. Allowlist genişletmesi — fail-closed korundu, joker/prefix EKLENMEDİ

`AUTH_DELEGATED_PATHS` **7→13**, `AUTH_EXEMPT_PATHS` **10→12**, `TENANT_EXEMPT_PATHS`
**14→20**, yeni `AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS` (**4** yol). Her yol **tek tek**
yazıldı; joker (`*`) veya prefix eşleşmesi **eklenmedi** — ADR-0011/ADR-0012'nin
kurduğu fail-closed allowlist deseniyle tutarlı.

⚠ **`verify-totp`/`verify-backup-code` oturumsuz çağrılıyor** (2FA doğrulaması henüz
tamamlanmadığı için henüz geçerli bir oturum yok) → bu iki yol `AUTH_EXEMPT_PATHS`'e
girmezse `AuthGuard` isteği **401 `UNAUTHENTICATED`** ile, Better Auth'a hiç
ulaştırmadan keser. Bu, canlı bir mutasyonla kanıtlandı (yol allowlist'ten çıkarılınca
istek `AuthGuard`'da düşüyor).

`send-otp`/`verify-otp` (eklentinin e-posta/SMS tabanlı ikinci faktör uçları) **bilerek
delege edilmedi** — `otpOptions` yapılandırılmadı, dolayısıyla bu uçlar işlevsiz; onları
allowlist'e eklemek **kullanılmayan bir yüzeyi açardı** (fail-closed'ın tersi: gereksiz
saldırı yüzeyi).

---

### Değerlendirilen Alternatifler

| #   | Alternatif                                                                             | Neden seçilmedi                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Sıfırdan yazılan 2FA uç kümesi** (Better Auth eklentisi yerine)                        | Better Auth zaten bildirilmiş bir bağımlılık ve bir `twoFactor` eklentisi sunuyor; sıfırdan yazmak oturum/çerez/kilitleme mantığını tekrar ederdi ve mevcut güvenlik incelemesinden (Better Auth'un kendi test kapsamı) faydalanmazdı |
| 2   | **`@better-auth/utils/otp` import etmek**                                               | Geçişli (transitive) bağımlılık, `package.json`'da bildirilmemiş → phantom dependency; kendi RFC 6238/4226 uygulaması bildirilmiş bağımlılık yüzeyini değiştirmedi                                           |
| 3   | **`two_factor` tablosuna `tenant_id` eklemek**                                          | Kullanıcı kimliği kiracıya bağlı değil; zorla bir `tenant_id` eklemek kullanıcının üye olmadığı bir kiracıyı seçmeyi gerektirirdi veya anlamsız bir sentinel değer icat ederdi                                |
| 4   | **`two_factor` için tek rolde (yalnızca `arkesoft_app`) tablo bazlı `GRANT`**            | ADR-0017'nin kurduğu kolon bazlı sır koruması baypas edilirdi; dördüncü sır taşıyan tablo ilk üçünden daha az korunurdu                                                                                       |
| 5   | **Tek hata sınıfı, bağlamla (`context`) ayrım** (409 vs 403 yerine)                      | `AppError`'ın code↔httpStatus **sabit** eşlemesi bozulurdu (CLAUDE.md §4); aynı kod iki farklı HTTP durumuna eşlenemez                                                                                        |
| 6   | **Politika açılırken kiracının TÜM owner'larının 2FA durumunu sorgulamak**              | Başka kullanıcıların güvenlik durumunu çağırana sızdırır — CLAUDE.md §7'nin varlık sızdırmama ilkesiyle aynı aileden bir ihlal                                                                                |
| 7   | **Kullanıcı seviyesi 2FA olayını sentinel bir `tenantId` ile `audit_log`'a yazmak**      | `tenantId` NOT NULL kısıtını anlamsız bir değerle doldurmak denetim kaydının "kiracıya ait olay" semantiğini bozardı; `pino` olay logu PII/sır maskelemesiyle zaten yeterli                                   |
| 8   | **`code` alanını `PINO_REDACT_PATHS`'e eklemek**                                        | Hata kodları sır değildir, kullanıcıya dönük ve teşhis için gereklidir; maskelemek operasyonel görünürlüğü gerekçesiz azaltırdı                                                                                |
| 9   | **Joker/prefix allowlist girdisi** (örn. `/auth/two-factor/*`)                           | Fail-closed deseni her yolun **açıkça** incelenmesini gerektiriyor; joker, ileride eklenecek ilgisiz bir uç için sessizce muafiyet doğurabilir                                                                |
| 10  | **`accountLockout`'u eklentinin varsayılanına bırakmak**                                 | `auth-instance.ts:36-40` bunu zaten reddetmişti — koordinesiz, aynı anda çalışan iki eşik güvenlik davranışını tahmin edilemez kılar                                                                          |

---

## Sonuçlar

### Olumlu

1. **2FA sıfır yeni ana bağımlılıkla teslim edildi** — Better Auth'un bildirilmiş alt
   yolu + kendi RFC 6238/4226 uygulaması.
2. **Veritabanı seviyesi sır koruması dördüncü tabloya genişledi**, ADR-0017'nin
   kurduğu mekanizma özel durum yaratmadan tekrar kullanıldı.
3. **Kendini kilitlememe iki yönlü ve ölçülü** — ne politikayı açan owner kendini
   kilitleyebilir, ne de 403 alan bir owner gerçekten erişimden mahrum kalır.
4. **İki ayrı, doğru eşlenmiş hata kodu** `AppError`'ın sabit code↔httpStatus
   sözleşmesini korudu.
5. **Allowlist'ler açık, tek tek yazılmış yollarla genişledi** — joker girilmedi,
   fail-closed deseni korundu; oturumsuz çağrılan iki uç mutasyonla kanıtlı şekilde
   doğru kategoriye yazıldı.

### Olumsuz ve kabul edilen maliyetler

1. **Kullanıcı seviyesi 2FA olayları tenant `audit_log`'una hiç girmiyor** (yapısal,
   `tenantId` NOT NULL) — denetim izi artık iki ayrı mekanizmaya (tenant audit log +
   pino olay logu) bölünmüş durumda, aktöre göre hangisinin kullanılacağı okuyucunun
   bilmesi gereken bir ayrım.
2. **`session.me`'nin `TENANT_EXEMPT_PATHS` üyeliği**, owner-2FA-zorunlu politikasının
   panelden görülebilmesini **yapısal olarak** engelliyor — borç tablosuna kaydedildi
   (vade v0.1.0).
3. **Katalog linter'ının `AUTH_SECRET_BEARING_TABLES` ↔ `AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS`
   çapraz doğrulaması hâlâ yok** — bir tablo yalnızca birincisinden çıkarılırsa linter
   sessiz kalır (mutasyonla ölçüldü, borç tablosuna kaydedildi).
4. **İki ayrı sayısal eşik** (challenge başına 5, hesap başına 10) kullanıcıya/destek
   ekibine farklı anlatılmak zorunda — karmaşıklık yüzeyi büyüdü.
5. **`session.me` henüz `twoFactorEnabled` taşımıyor** — panel bu bilgiyi yalnızca
   sign-in anında yakalayıp `sessionStorage`'a yazıyor; borç tablosuna kaydedildi.

### Etkilenen sonraki kararlar

- **ADR-0017'nin Gözden geçirme koşulu 1 bu ADR'yle tetiklendi ve karşılandı** —
  `AUTH_SECRET_BEARING_TABLES`/`PLATFORM_LEVEL_TABLES`/`AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS`
  genişletildi, ADR-0017'nin `Durum:` satırı **değişmedi**.
- **ROADMAP v0.1.0'ın owner-2FA-zorunlu panel ekranı** bu ADR'nin madde 9'undaki
  `TENANT_EXEMPT_PATHS` kararına ve yukarıdaki olumsuz sonuç 2'ye bağımlı — kiracı
  seçimi geldiğinde bu karar yeniden değerlendirilmeli.
- **`packages/trpc`'nin bir sonraki MINOR'ü** `session.me`'ye `twoFactorEnabled`
  eklediğinde yukarıdaki olumsuz sonuç 5 kapanır.

---

## Gözden geçirme koşulları

Bu karar aşağıdaki durumlar gerçekleşirse yeniden değerlendirilir:

1. **Better Auth'un `twoFactor` eklentisi yeni bir HTTP ucu yayınlarsa veya kilitleme
   semantiğini değiştirirse** (sürüm yükseltmesi) — allowlist'ler ve `accountLockout`
   yapılandırması yeniden ölçülmeli.
2. **ADR-0011/ADR-0012'nin panel-kiracı topolojisi gözden geçirilirse** (v0.1.0 kiracı
   seçimi) — `session.me`'nin `TENANT_EXEMPT_PATHS` üyeliği yeniden değerlendirilmeli.
3. **`packages/trpc` girdili/çıktılı bir mutation ile `twoFactorEnabled` taşırsa** —
   yukarıdaki olumsuz sonuç 5 kapanır, panel sign-in-anlık yakalama deseni kaldırılabilir.
4. **Katalog linter'ına iki liste arasında çapraz doğrulama kural sınıfı eklenirse** —
   yukarıdaki olumsuz sonuç 3 kapanır.

---

## İlişkili Kararlar ve Çapraz Referanslar

- **ADR-0008** (v0.0.5): sır taşıyan tabloların tip/lint/log katmanı koruması — bu
  ADR'nin `two_factor` için izlediği desenin kökeni.
- **ADR-0017** (v0.0.14.1): `arkesoft_auth` rolü + kolon bazlı `GRANT`/`REVOKE` +
  katalog linter'ı kolon yetkisi kuralı — bu ADR bu mekanizmanın **ilk tüketicisidir**
  (ADR-0017 Gözden geçirme koşulu 1).
- **ADR-0011** (panel orijin topolojisi) / **ADR-0012** (vitrin yüzeyi): panel
  host'undan kiracı kapsamlı prosedürlere erişilememesi ve `TENANT_EXEMPT_PATHS`
  mekanizması — owner-2FA-zorunlu panel ekranının v0.1.0'a ertelenme gerekçesi.
- **ADR-0016** (yetki modeli, izin kataloğu): `AuditLog`/`AuditAction` deseni — bu
  ADR'nin `tenant_security_policy_changed` eklemesi bu desenin devamıdır.
- **ROADMAP v0.1.0**: owner için 2FA zorunlu kılmanın panel ekranı ve kiracı seçimi bu
  ADR'nin madde 6/9 kararlarına bağımlı.

---

## Notlar

- **Prisma'nın SQLSTATE yüzeyi burada da `.code`'da değildir** — ADR-0017'nin zaten
  belgelediği davranış (`$queryRaw` → `P2010`, ORM → `P2039`, gerçek SQLSTATE
  `error.meta.driverAdapterError.cause.originalCode`'da) `two_factor` tablosu için de
  aynen geçerli; bu teslimin canlı yetki testleri de `originalCode` üzerinden assert
  eder.
- **Challenge-başına ve hesap-başına eşikler farklı olaylardır.** Challenge'ın 5
  denemede geçersiz kalması kullanıcıyı yeniden bir challenge başlatmaya yönlendirir;
  hesabın 10 denemede kilitlenmesi `429 ACCOUNT_TEMPORARILY_LOCKED` + `Retry-After`
  döner. İkisi aynı mesajla anlatılırsa kullanıcı "neden kilitlendim" sorusuna yanlış
  cevap alır.

---

## Ek (dört düzeltme turu, T-016) — Altı ek karar

> **Not:** Bu bölüm append-only eklenmiştir. Yukarıdaki dokuz karar, on reddedilen
> alternatif ve metni **değişmemiştir**. İlk yazımdan sonra koşan dört düzeltme turu
> (`security`/`solid`/`qa`/`perf` gate'lerinin FAIL/`medium` bulgularına karşılık) altı
> ek karar üretti; bunlar bu ekte kayda geçirildi. `docs/development.md` ve ROADMAP
> teknik borç tablosu bu kararların türettiği borçları taşır.

### 10. Altı 2FA ucu oran sınırına alındı (`security` F1, `high` → düzeltildi)

`rateLimit: { enabled: false }` Better Auth'un **kendi** `/two-factor/*` kuralını
(pencere 10/maks 3) kapatıyordu; platformun Redis tabanlı oran sınırı guard'ı ise bu
uçları **kapsamıyordu** ve listelenmeyen rotada **`return true`** ile **fail-open**
davranıyordu → `disable` ucu, canlı bir oturum çerezine sahip ama parolayı bilmeyen bir
saldırgan için **sınırsız bir parola oracle'ı** hâline geliyordu.

**Düzeltme:** `RATE_LIMITED_ROUTES` **4 → 10**; iki yeni kapsam kaynağı eklendi:
`sessionUserId` (`AsyncLocalStorage`'daki `auth.userId`, **ek sorgu yok**) ve
`twoFactorChallengeOrSession`. ⚠ **Üçüncü, ayrı bir eşik ailesi kurulmadı** — mevcut
`login` penceresi/eşikleri yeniden kullanıldı; Karar 1'in _"iki koordinesiz eşik aynı
anda çalışmasın"_ ilkesi korundu (bkz. ROADMAP → Varsayımlar → `A-RL1`). **Yeni env
değişkeni YOK.**

⚠ **Ölçülmüş ek gerçek:** eklentinin kendi kilitleme çağrıları (`totp/index.mjs:137-166`)
**üçü de** `isSignIn` koşuluna bağlı → reklam edilen 10/900 eşiği **oturum yolunda**
(kurulum onayı gibi `isSignIn=false` çağrılarda) **hiç çalışmıyor**; bu boşluk platformun
kendi katmanındaki oran sınırıyla telafi edildi.

Kanıt: `disable` ucuna 5× yanlış parola (400) → **6.: 429** (`retryAfterSeconds:900`).

### 11. Kapsam zehirlenmesi kapatıldı (`security` S2-1 + `solid` N-1 — iki gate aynı dosyaya yakınsadı)

`two_factor` çerezi `session_token`'dan **önce** okunuyordu, ama Better Auth oturum
varken bu çereze **hiç bakmıyor** (`verify-two-factor.mjs:14-15`: `getSessionFromCtx`
**önce** çalışıyor) → aynı istekte iki okuyucu **farklı değere** bakabiliyordu;
saldırgan her isteğe **yeni rastgele** bir `two_factor` değeri ekleyerek oran sınırı
guard'ına **taze bir kova** açtırabiliyordu.

**Düzeltme:** öncelik **ters çevrildi** — `session_token` kazanır. Gerekçe
**kaynaktan doğrulandı**: ön-giriş (2FA henüz tamamlanmamış) akışında `session_token`
çerezi **zaten yok** (`two-factor/index.mjs:290-291`: `deleteSessionCookie(ctx, true)` +
`deleteSession`) → öncelik ters çevrilmesi meşru akışı **bozmuyor**. Çerez adı türetmesi
de **canlı karşılaştırma testiyle** üretim davranışına bağlandı; ortak bir modül
**reddedildi** (`auth-instance.ts` çerez adını hiç hesaplamıyor, yalnızca boolean
döndürüyor — ortak modül sahte bir tek-kaynak izlenimi verirdi).

⚠ **Çapraz hesap kilitleme (DoS) bu yolla MÜMKÜN DEĞİL** — kapsam değeri kurbanın
**kendi gizli** çerezi olduğu için saldırgan başka bir kullanıcının kovasını
dolduramıyor; bu yüzden bulgu `high` **değil**, `medium` verildi.

### 12. `disable` denetim boşluğu + yanıltıcı olay düzeltildi (`security` F2)

`disable` ve `generate-backup-codes` çağrıları **hiçbir denetim kaydına yazılmıyordu**,
üstüne `session.create.after` kancası **koşulsuz** _"giriş başarılı"_ olayı yazıyordu →
bir saldırgan 2FA'yı kapattığında günlükte görünen tek iz _"giriş başarılı"_ + _"oturum
sonlandırıldı"_ çifti oluyordu (sıradan bir yeniden-giriş gibi okunur, kapatma eylemi
görünmez kalırdı).

**Düzeltme:** `disable` ve `generate-backup-codes` için iki ayrı pino olay kaydı
eklendi; `session.create.after` **yola duyarlı** hâle getirildi
(`isNonLoginSessionCreation` + `hasExistingSessionAtCreation` yardımcılarıyla) — artık
2FA'yı kapatmanın ürettiği oturum yeniden-kurma olayı _"giriş başarılı"_ olarak
etiketlenmiyor. `loginEvents.length === 1` ve `relabeledEvents.length === 2` canlı
testle pinlendi.

### 13. `session.me` artık `twoFactorEnabled: boolean` döndürüyor (katkısal, MINOR) — `packages/trpc` sözleşmesi fiilen değişti

Sebep (`solid` M-4, veri kaybı senaryosu): `apps/admin` 2FA durumunu `sessionStorage`'da
tutuyordu; `sessionStorage` **sekme başınadır** ve state makinesinin "bu mount'ta
`enable` çağrıldı mı" bayrağı da mount başınaydı → ikinci bir sekme açıldığında
`enable` **ikinci kez** çağrılıp yeni bir TOTP sırrı üretiyor ve ilk sekmenin
authenticator kaydını geçersizleştiriyordu.

**Düzeltme:** `SessionSecurityReadPort` arayüzü + adaptör + Zod şeması + resolver
eklendi; `session.me` artık `twoFactorEnabled` taşıyor; `apps/admin`'in
`sessionStorage` tabanlı deposu **silindi**, panel artık durumu sunucudan okuyor.

⚠ **Düzeltilmesi gereken bir iddia — ama bu ADR'nin METNİNDE değil, kodda.**
`packages/trpc`'nin `session-identity.schema.ts:7`'sindeki (T-007, architect K5) kod
yorumu _"session.me yolunda HİÇBİR DB okuması yoktur (K5)"_ diyordu; bu iddia
`twoFactorEnabled` eklenmesiyle (bu karar) **bu tek alan için** geçerliliğini kaybetti —
`perf` ölçtü: `twoFactorEnabled` **her çağıran için** `SessionSecurityReadPort` üzerinden
**1 PK okuması** yapıyor. Bu kodun **kendi** yorumunda zaten düzeltilmiş durumda
(`session-identity.schema.ts:9-19`, `trpc-wire-contract.pin.ts`'teki istisna tip pini) —
bu ADR eki bunu ayrıca **belgeler**, ADR'nin önceki dokuz kararının hiçbiri bu iddiayı
taşımıyordu (bu ADR'nin kendi "DB okuması yok" cümlesi yok; K5 iddiası T-007'nin (v0.0.6) kod
yorumu — hangi ADR'ye bağlı olduğu bu ekte DOĞRULANAMADI). Bu okuma N+1 **değildir** (`staleTime:'static'` ile sayfa
açılışında bir kez okunur). Formel p95 etkisi **DOĞRULANAMADI** (k6 koşulmadı; gözlemsel
0-4 ms, yük altında ölçülmedi) — bkz. ROADMAP → Teknik Borç → Vadesi v0.0.16.

### 14. Tek-kaynak sıkılaştırmaları

- `TwoFactorComplianceService` **DI'ya** taşındı — testteki `new Proxy` hilesi kaldırıldı.
- **Dört nokta artık mekanik kontrole bağlı** (kaynaktan doğrulandı,
  `auth-secret-tables-sql-consistency.test.ts`): bu TEK dosya, üretim SQL metnini `fs`
  ile okuyup parse ederek **iki** aynayı (`bootstrap-roles.sql:291`'in ve
  `rollback-auth-role.sql:70`'in `FOREACH` dizileri) `AUTH_SECRET_BEARING_TABLES`'a karşı
  bir **drift testiyle** doğruluyor (dizilerin kendisi hâlâ elle yazılı — YOL B, bilinçli
  seçim, bkz. dosyanın kendi gerekçe yorumu — ama artık ayrışırlarsa test KIRMIZI olur) ve
  **üçüncü** olarak `AUTH_SECRET_BEARING_TABLES ⊆ AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS
  (columnLevel: true)` alt küme kontrolünü ekliyor. **Dördüncü** nokta ayrı bir mekanizma
  ile kapandı: `rollback-auth-role.isolation.test.ts`'in DDL taklidi artık
  `AUTH_SECRET_BEARING_TABLES` dizisi üzerinden **türetiliyor** (`Prisma.sql` +
  `Prisma.raw()` ile; `$executeRawUnsafe` **yasak**, K-E12). Bu dördü birlikte
  ADR-0017'nin kendi ekinin (madde 330-361) işaret ettiği "üç elle yazılmış ayna"
  borcunun **üçünü de** kapatıyor (ROADMAP → Teknik Borç → Vadesi v0.1.0, ilgili satır
  kapatıldı). ⚠ **Kapanmayan kök boşluk:** bu dört kontrolün hiçbiri, bir tablo
  **baştan** `AUTH_SECRET_BEARING_TABLES`'a hiç eklenmezse (dördü de "tutarlı ama eksik"
  kalır) bunu yakalayamaz — ROADMAP → Teknik Borç → Vadesi v0.1.0'daki açık satır bu
  kalan boşluğu taşıyor.
- `two_factor.verified` sütununun DEFAULT değeri `true` → **`false`** (fail-open →
  fail-closed); yeni migration `20261109054748_two_factor_verified_default_false`
  (expand/contract ile tutarlı — mevcut satırlar geriye dönük etkilenmiyor, yeni
  satırlar güvenli varsayılanla açılıyor).

### 15. `guards`'ın mekanik adımları yerele taşındı (K-A14)

`scripts/guards.sh` eklendi (11 adım, `pnpm guards` ile çalışır) — bu Task'ta AC4
taraması CI'ı **üç kez** kırmıştı. AC4'ü tarayan awk programı ortak bir script'e
(`scripts/check-run-block-template-expression.sh`) çıkarıldı; **hem** `guards.sh`
**hem** `ci.yml` bu scripti çağırıyor — `security` tam eşdeğerliği doğruladı (mesaj
metni, hedef kaynak seçimi, `::error::` biçimi, exit kodu birebir; gevşetme yok). Kalan
dokuz adım hâlâ iki dosyada elle kopya (ROADMAP → Teknik Borç → Vadesi v0.0.15.1) —
`solid`: bu dar kapsam **süreç olarak doğruydu**, patlama yarıçapı sınırlı. Ayrıca
`db:migrate`/`db:deploy`/`db:push`/`db:reset` komutlarının **dördü** `&& pnpm
db:bootstrap` ile zincirlendi (K-A7).
