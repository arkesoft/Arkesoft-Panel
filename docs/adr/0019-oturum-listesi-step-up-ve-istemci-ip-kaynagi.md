# ADR-0019 — Oturum Listesi, Step-Up Doğrulama ve İstemci IP Kaynağı

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-09
- **Karar verenler:** Architect (T-017), kullanıcı (kapsam revizyonu · IP saklama kararı ·
  IP mekanizması kararı, 2026-11-09)
- **İlgili versiyon:** `v0.0.15.1` (ROADMAP v0.0.15.1 kapsamında uygulanır)

---

## Bağlam

ROADMAP v0.0.15.1 hesap güvenliğinin ikinci dilimi: kullanıcının kendi aktif
oturumlarını listeleyip tek tek sonlandırabilmesi ve hassas işlemler için step-up
(yeniden kimlik doğrulama) kapısı. ADR-0018 bu dilimi kapsam dışı bırakmıştı (bkz.
ADR-0018 Bağlam) — bu ADR o boşluğu kapatır ve ADR-0018'e **ek değil, komşudur**.

Beş kısıt aynı anda çatışıyordu:

1. Oturum satırında tutulan IP kişisel veri sınıfındadır, ama bu özelliğin **var olma
   sebebi** tam olarak budur — veriyi gören kullanıcı verinin sahibidir. Emsal
   `packages/db/prisma/schema.prisma:456-458`'de `AuditLog.ip` için zaten kurulu:
   kişisel veri sınıfında olmak saklamayı engellemiyor, loglamayı engelliyor.
2. Platformda zaten denetlenmiş, vekil-farkında bir IP çözümü var
   (`apps/api/src/auth/rate-limit/client-ip.ts` + `AUTH_TRUSTED_PROXY_COUNT`,
   varsayılan `0`) ve denetim kaydı bu çözümü tüketiyor. Kimlik doğrulama
   kütüphanesinin kendi IP izleme mekanizması **farklı ve daha zayıf** bir semantiğe
   sahip: tek değerli `x-forwarded-for` başlığına vekil yapılandırması olmadan
   koşulsuz güveniyor (istemci kendi IP'sini uydurabilir), IPv6 adresini /64'e
   kırpıyor, soket adresine hiç düşmüyor ve test/geliştirme ortamında sabit
   `127.0.0.1` döndürerek sahte yeşil üretiyor.
3. "Son görülme" bilgisi kütüphanenin oturum yenileme penceresinden türüyor;
   ölçülen varsayılan 86400 saniye (24 saat), ürün gereksinimi ise 5 dakika veya
   daha iyi bir çözünürlük istiyor.
4. Step-up için kütüphanenin "taze oturum" mekanizması kullanılamaz: tazelik oturumun
   oluşturulma zamanından hesaplanıyor, son yeniden kimlik doğrulama zamanından değil
   — eşiği düşürmek mevcut tüm kullanıcıları kalıcı olarak "taze değil" durumuna
   düşürüp yeniden girişe zorlar. Ayrıca platformun step-up amaçlı kullandığı
   `sensitiveSessionMiddleware` tazelik kontrolü taşımıyor; tazeliği kontrol eden ayrı
   bir middleware (`freshSessionMiddleware`) zaten var ve farklı bir hata kodu
   (403 `SESSION_NOT_FRESH`) döndürüyor.
5. Dört hassas uç (2FA kurulum, kapatma, yedek kod üretimi/doğrulaması) parolayı
   gövdede zaten zorunlu kılıyor ve başarısızlıkta `INVALID_PASSWORD` (400)
   döndürüyor; iki oturum sonlandırma ucu ise hiçbir yeniden kimlik doğrulama
   istemiyor.

Ek bağlam: ADR-0018'in ekindeki en pahalı ders, T-016'da elle yazılmış altı ayna
bulunması ve bunların dördünün korumasız kalmasıydı (ADR-0018 Ek, madde 10-14). Bu
kararın kısıtlarından biri yeni bir ayna üretmemektir.

---

## Karar

### 1. Oturum satırının IP'si ve istemci dizesi platformun kendi istek bağlamından yazılır

Kimlik doğrulama kütüphanesinin IP izleme bayrağı kapalı tutulur
(`disableIpTracking: true`). Oturum satırı, kütüphanenin veritabanı oluşturma
kancasının "önce" aşamasında (`databaseHooks.session.create.before`) platformun
kendi vekil-farkında IP çözümünün ürettiği değerle doldurulur. Mekanizma ölçüldü:
`with-hooks.mjs:19-22`'deki `actualData = {...actualData, ...result.data}`
birleştirmesi platformun değerinin kütüphanenin ürettiği boş değeri ezmesini
sağlıyor. Böylece aynı isteğin IP'si hakkında tek doğruluk kaynağı kurulur; oturum
satırı ile denetim kaydı ayrışmaz. Bu yaklaşımın yan faydası, `auth-flow.test.ts:112`
satırındaki canlı `toBe(true)` pininin korunmasıdır.

### 2. IP tam saklanır, sahibine tam gösterilir, asla loglanmaz — kırpma yok

Kırpma uygulanmaz. Log yasağı iki bağımsız katmanla sağlanır: birincil katman —
hiçbir kod yolu IP'yi loglayıcıya geçirmez; ikincil katman — `PINO_REDACT_PATHS`'e
IP alan adı eklenir. Bu iki katman ayrı ayrı doğrulanır, çünkü `PINO_REDACT_PATHS`
yol tabanlıdır ve serbest metne gömülü değeri yakalamaz. Saklama süresi ayrı bir
mekanizma gerektirmez: oturum satırı zaten 7 günlük TTL ile `onDelete: Cascade`
taşıyor, dolayısıyla IP de satırla birlikte doğal olarak silinir.

### 3. "Son görülme" oturum satırının güncelleme zaman damgasıdır — yenileme penceresi 300 saniyeye çekildi

Ayrı bir alan, ayrı bir tablo veya üçüncü bir yazma mekanizması kurulmaz. Mevcut
oturum yenileme penceresi (`session.updateAge`) 300 saniyeye indirilerek "son
görülme" bilgisi bu pencereden beslenir. Bunun kabul edilen sonucu, kayan süre
sonunun çözünürlüğünün artması nedeniyle oturum ömrünün en kötü durumda 24 saate
kadar uzamasıdır — semantik zaten kayan bir pencereydi, değişen yalnızca
çözünürlüktür.

### 4. Yeniden kimlik doğrulama "parola gövdede + sunucu tarafında doğrula" desenidir

Kütüphanenin bugün hiçbir dışa açık yoldan erişilemeyen sunucu-kapsamlı parola
doğrulama ucu (`auth.api.verifyPassword`) programatik olarak kullanılır; bu uç dışa
açılan yol listesine eklenmez — erişilebilir bir "parolamı doğrula" ucu bir parola
oracle'ı olurdu. Kütüphanenin "taze oturum" mekanizması kullanılmaz ve tazelik
eşiği (`freshAge`) tanımlanmaz. Sıra bağlayıcıdır: step-up kapısı sahiplik
doğrulamasından önce çalışır — tersi olsaydı parolasız çağıran, verilen
`sessionId`'nin var olup olmadığını öğrenen bir varlık oracle'ı kazanırdı.

### 5. Tek-biçimli sinyal için yeni hata kodu icat edilmedi

Dört ucun hâlihazırda döndürdüğü `INVALID_PASSWORD` (400) platformun kanonik
"yeniden kimlik doğrulama karşılanmadı" sinyali olarak benimsenir; kendi hata
hiyerarşimizde aynı kodla bir sınıf tanımlanır. "Parola eksik" ile "parola yanlış"
durumları ayırt edilmez. Gerekçe ölçüldü: panelin hata dallanması yalnızca `code`
alanı üzerinden çalışıyor (`panel-error.ts:16-18`, HTTP durumu panel tipinde yok)
ve `INVALID_PASSWORD` zaten i18n kataloğunda tanımlı (`messages.ts:81,155`) —
dolayısıyla yeni bir i18n satırı gerekmiyor. İkinci bir ad açmak ikinci bir ayna
üretirdi.

### 6. Hassas işlem kümesi tek bir katalogda yaşar, üç mekanik kapıyla doğrulanır

Hassas işlemler dağınık koşul bloklarıyla değil, tek bir kataloğa karşı üç mekanik
kapıyla doğrulanır: (a) kataloğun her girdisinin bilinen bir rotaya karşılık geldiği
modül yüklenirken doğrulanır, (b) her girdinin oran sınırı kataloğunda da bulunduğu
test edilir, (c) kataloğu gezen tablo sürümlü bir gerçek-istek testi her girdinin
parolasız çağrıyı reddettiğini doğrular. (b) ADR-0018'in Ek'inde belgelenen "altı
ayna, dördü korumasız" sınıfını mekanik olarak kapatır: korumasız bırakılan bir
hassas işlem artık test kırmızısı üretir.

### 7. Oturum sonlandırma mutasyonları tip-paylaşımlı sözleşme katmanına taşınmadı

Ölçülmüş engel: kütüphanenin sonlandırma ucu `requireHeaders: true` taşıyor ve
kullanıcıyı çağıranın çerezinden yeniden türetiyor; sözleşme katmanının bağlamı
taşıma başlıklarını taşımaz ve bu bir tasarım kararıdır — çerezi istek-kapsamlı
depolamaya (`AsyncLocalStorage`) yaymak sırrı yaymak olurdu. Sonlandırma mevcut
kendi uçlarımızda kalır; sözleşme katmanına yalnızca okuma prosedürü eklenir.
Reddedilen üçüncü yol — ham Prisma `delete` çağrısı — iki sebeple elendi: T-008'in
bağlayıcı kararını bozar ve kütüphanenin `session.delete.after` kancasını (oturum
sonlandırıldı denetim kaydını üreten kanca) tetiklemediği için gözlemlenebilirlik
regresyonu doğurur.

### 8. Cihaz etiketi iki kapalı sözlükten oluşur, ham istemci dizesi tele çıkmaz

Cihaz etiketi tarayıcı ailesi × işletim sistemi ailesi biçiminde iki kapalı
sözlükten üretilir; sunucu sabit bir tanımlayıcı döndürür, kullanıcıya dönük metin
panelin kapalı-dünya mesaj kataloğundan gelir. İstemci dizesi ayrıştırması için
yeni bir bağımlılık eklenmez; elle yazılmış, tablo sürümlü, saf bir eşleme
kullanılır. Bu kararın dayanağı ölçüldü: `userAgent` kolonu bugün zaten dolu
(`internal-adapter.mjs:276`, `disableIpTracking` bayrağından bağımsız) —
dolayısıyla etiket sıfır yapılandırma değişikliğiyle üretilebilir. Bu ölçüm,
`schema.prisma:178-182` satırlarındaki kolon yorumunu çürütmektedir; yorumun
düzeltilmesi bu Task'ın ayrı bir alt görevinin kapsamındadır.

### 9. Oturum tablosu platform seviyesidir, kiracı kolonu ve satır güvenliği almaz

İzolasyon garantisi üç parçadan oluşur: kullanıcı kapsamlı sorgu, sahiplik
doğrulaması ve "yok" ile "yetkisiz" arasında ayrım yapmayan tek cevap (404).
Kiracı izolasyon süiti bu kaynak için çağrılmaz; yerine kullanıcı-çapraz erişim
testi zorunludur. Bu kararın yazıya geçirilme sebebi, her yeni denetçinin
CLAUDE.md §7'deki tenant kolonu beklentisini körü körüne uygulayıp yanlış bir FAIL
üretmesini önlemektir — bu kaynak için `tenant_id` beklemek yanlıştır. Not: bu
kaynağın gerçek davranışı 404'tür; ROADMAP'in kabul kriterinde yer alan 403 ifadesi
hatalıdır ve düzeltilmesi bu Task'ın ayrı bir alt görevinin kapsamındadır.

---

### Değerlendirilen alternatifler

| #   | Alternatif                                                                               | Neden seçilmedi                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Kütüphanenin IP izlemesini açmak (`disableIpTracking: false`)                             | Platformda zaten denetlenmiş vekil-farkında bir çözüm var; kütüphanenin çözümü tek değerli yönlendirme başlığına koşulsuz güveniyor (sahtecilik riski), IPv6'yı kırpıyor, soket adresine düşmüyor ve test ortamında sabit değer döndürerek sahte yeşil üretiyor — ikinci, koordinesiz bir güven ailesi doğardı |
| 2   | Tazelik eşiğini (`freshAge`) düşürerek step-up kurmak                                     | Tazelik oturumun oluşturulma zamanından hesaplanıyor; eşiği düşürmek mevcut tüm oturumları kalıcı olarak taze-değil yapar, tek çıkış yeniden girişe zorlamak olur ve kütüphanenin kendi oturum listeleme ucunu da bozar |
| 3   | 300 saniyelik bir "yetkili pencere" (sudo modu) deposu kurmak                              | Yeni bir anahtar ailesi, geçersizleştirme yolu ve arıza dalı gerektirir; kazanç sıfırdır (panel parolayı her çağrıda zaten topluyor) ve garantiyi zayıflatır (çalınan oturum pencere içinde parolasız iş yapabilir) |
| 4   | Yeni bir hata kodu tanımlayıp dört ucun yanıtını yeniden yazmak                            | Aynı olgu için ikinci bir ad ikinci bir ayna üretir; dört ucun tel sözleşmesini kırar, gözlem kancasının yanıtı değiştirmeme değişmezini bozar ve hatalı dalda başarı yanıtını da ezebilir                     |
| 5   | "Parola eksik" ile "parola yanlış" durumlarını ayırmak                                    | İki kodun tek-biçimliliğini doğrudan ihlal eder; ayrımın hiçbir tüketicisi yok                                                                                                                                 |
| 6   | Son görülme için ayrı bir kolon ve kendi yazma yolumuzu kurmak                             | Üçüncü bir yazma mekanizması olurdu; kütüphanenin yenileme penceresi bu işi zaten yapıyor ve yazma sıklığına yapısal bir üst sınır koyuyor                                                                      |
| 7   | Sonlandırmayı ham satır silme ile yapıp sözleşme katmanına taşımak                         | T-008'in bağlayıcı kararını bozar; silme kancasını tetiklemediği için oturum sonlandırıldı denetim kaydını kaybettirir                                                                                          |
| 8   | İstemci dizesi ayrıştırma kütüphanesi eklemek                                              | Yeni bir ana bağımlılık olurdu; gereksinim kaba birkaç sınıfı kapsıyor, elle yazılmış saf bir eşleme yeterli ve tablo sürümlü bir testle kapanıyor                                                              |
| 9   | Ham istemci dizesini tele koymak                                                            | Panelde yabancı dize gösterme yüzeyi ve parmak izi echo'su açardı; gerek yok                                                                                                                                    |

---

## Sonuçlar

### Olumlu

1. Bu sürüm hiç migration üretmiyor — IP ve istemci dizesi kolonları v0.0.5'te
   bilinçli bir genişletme (expand) adımı olarak eklenmişti, bu sürüm o adımın
   tüketimidir (contract); platform geri alma şema geri almayı gerektirmiyor.
2. Aynı isteğin IP'si hakkında tek doğruluk kaynağı kuruldu; oturum satırı ile
   denetim kaydı ayrışmıyor.
3. Yeni bir ana bağımlılık eklenmedi, yeni bir dış kaynak (arama, nesne deposu,
   önbellek ailesi) eklenmedi, yeni bir arka plan işi eklenmedi.
4. Hassas işlem kataloğu ile oran sınırı kataloğunun kesişimi mekanik olarak
   doğrulanıyor — korumasız bırakılan bir hassas işlem artık test kırmızısı
   üretiyor.
5. Dört mevcut ucun tel sözleşmesi değişmiyor, panele yeni bir hata kodu
   girmiyor.
6. Geri alma parçalı: IP yazımı, son görülme çözünürlüğü ve step-up kapısı
   birbirinden bağımsız, tek dosya veya tek satır düzeyinde geri alınabilir.
7. Kullanıcıya dönük her metin kapalı-dünya kataloğundan gelir; eksik çeviri
   derleme hatası üretir.

### Olumsuz ve kabul edilen maliyetler

1. Oturum ömrü en kötü durumda 24 saate kadar uzuyor (ölçüldü, kabul edildi) —
   karşı önlem düşünülmedi, çünkü semantik zaten kayan bir pencereydi.
2. Aktif oturum başına 300 saniyede en fazla bir satır güncellemesi yapılabiliyor;
   bu üst sınır yapısaldır.
3. Kanonik tek-biçimli sinyal bir satıcı sabitinin adını taşıyor
   (`INVALID_PASSWORD`) — satıcı bu adı değiştirirse davranış ayrışır; bunu
   yakalayan mekanizma tablo sürümlü bir testtir.
4. "Parola alanını hiç göndermeme" durumu satıcıya delege edilen uçlarda
   tek-biçimli değildir, çünkü satıcının gövde şeması parola alanını zorunlu
   kılıyor — panel alanı her zaman gönderdiği için bu sapma bugünkü tek
   istemciden erişilemiyor; sapma burada yazılı olarak kayıt altına alınmıştır.
5. Kiracı izolasyon kontrol listesinin yarısı bu kaynak için uygulanamıyor — bu
   bir eksiklik değil, platform seviyesi bir tablonun doğal sonucudur; bu ADR'nin
   madde 9'u bunu her yeni denetçinin körü körüne uygulamaması için yazıya
   geçirmiştir.
6. Kiracı-muaf yol listesi bir satır büyüyor ve kardinalite doğrulaması elle
   güncelleniyor — bu, inceleme görünürlüğü için bilinçli olarak kabul edilen bir
   maliyettir.
7. Oturum okuma mantığı iki taşıma noktasında yaşıyor (kendi ucumuz ve sözleşme
   katmanı); zenginleştirme tek bir fonksiyonda toplandığı için ikinci bir ayna
   doğmuyor, ama iki taşımanın bakımı sürüyor.

### Etkilenen sonraki kararlar

- Bu ADR, ADR-0018'e ek değil komşudur — ADR-0018'in "kullanıcı seviyesi 2FA olayı
  tenant denetim kaydına yazılamıyor" borcu bu kararla kapanmıyor.
- Kiracı güvenlik politikası ve üyelik işlemlerine step-up uygulanması
  `v0.1.0`'a ertelendi — bu prosedürler panel kaynağından bugün erişilemiyor;
  step-up kapısı kurulabilir ama uçtan uca doğrulanamaz.
- Yetkili pencere (sudo modu) deposu ileriki bir sürüme bırakıldı; bu kararda
  seçilen 300 saniyelik değer ROADMAP'in Varsayımlar tablosuna kaydedilir.
- Üretim ağ topolojisi kararlaştığında vekil güveni tek bir yerde
  yapılandırılacak — bu karar ikinci bir vekil-güveni ailesinin doğmasını
  önlüyor.
- Çerez süre sonu ile oturum satırı süre sonunun ayrışması bu kararla
  çözülmüyor; ROADMAP'e teknik borç olarak kaydedilir.

---

## Gözden geçirme koşulları

Bu karar aşağıdaki durumlar gerçekleşirse yeniden değerlendirilir:

1. Kimlik doğrulama kütüphanesinin ana sürümü yükseltilirse — IP çözümünün
   varsayılanları, oturum yenileme formülü, sunucu-kapsamlı parola doğrulama
   ucunun varlığı ve kanonik benimsenen hata kodunun adı yeniden ölçülmelidir.
2. Herhangi bir amaçla tazelik eşiği (`freshAge`) tanımlanmak istenirse — bu
   ADR'nin madde 4'ü yeniden değerlendirilmelidir, çünkü eşik global bir
   kütüphane ayarıdır.
3. Üretim ağ topolojisi vekil yapılandırması gerektirdiğinde — bu ADR'nin
   madde 1'i ile vekil güveninin tek bir yerde kaldığı doğrulanmalıdır.
4. Oturum satırının okunma oranı veya kullanıcı başına satır sayısı ölçülebilir
   hâle geldiğinde — bileşik indeks kararı (bugün "gerekmiyor", dayanağı akıl
   yürütme) yeniden ölçülmelidir.
5. Sonlandırmayı sözleşme katmanına taşıma ihtiyacı doğarsa — bu ADR'nin
   madde 7'si ile taşıma başlığını istek bağlamına sokmama kararı birlikte ele
   alınmalıdır.

---

## Ek (gate turları, T-017) — Altı ek bulgu

> **Not:** Bu bölüm append-only eklenmiştir. Yukarıdaki dokuz karar, dokuz
> değerlendirilen alternatif ve metni **değişmemiştir**. İlk yazımdan sonra koşan
> `security`/`solid`/`qa`/`wcag`/`perf` gate turları altı ek bulgu üretti; bunlar bu
> ekte kayda geçirildi. ROADMAP teknik borç tablosu (`Vadesi v0.0.16 — Aktif oturum
> listesi ve step-up kaynaklı borçlar`) bu bulguların türettiği borçları taşır.

### 10. Madde 7'nin (ux'in de ayrı ayrı yaptığı) "dokunmadan senkron `.focus()`" varsayımı YANLIŞTI

`@radix-ui/react-focus-scope@1.3.1`'in `FocusScope` trap'ı React commit'i bitene
kadar **aktif kalıyor** ve çağıran tarafın senkron `.focus()`'unu **geri çekiyor** —
bu kütüphane kaynağından **ve** canlı bir A/B ölçümünden doğrulandı: `setTimeout`
olmadan **tüm** odak testleri FALSE, `setTimeout(…, 0)` ile **tümü** TRUE. `docs/ux`'in
ayrı varsayımı ("Radix'in varsayılanı tetikleyiciye döner") da **yanlış** çıktı; kök
neden `ConfirmDialog`'un `<Dialog.Trigger>` **kullanmaması** — bu yüzden
`onCloseAutoFocus` NO-OP kalıyor.

### 11. `setTimeout(0)` kabul kararı (A) — ölçülmüş gerekçe

Yarış penceresi **yalnızca zorlama/senkron JS enjeksiyonuyla** tetiklenebildi: bir
mikro görev sınırında `activeElement === body` gerçekten gözlendi, ardından
`setTimeout(0)` ile kendini onardı ve **hiçbir zaman** render/erişilebilirlik ağacına
sızmadı. **Dört gerçekçi prob** (Escape+Tab, çift Escape, Escape+yeniden aç,
Escape+dışarı tıklama — hepsi gerçek klavye/fare etkileşimi) hiçbirinde `body` odağı
gözlenmedi. Karar: kullanıcıya/yardımcı teknolojiye asla gözlenebilir hale gelmeyen bu
riski `setTimeout(0)` ile kabul etmek, idiomatik Radix yolunu (`onCloseAutoFocus` +
`preventDefault`) zorlamaktan daha ucuz. Borç kaydı (ROADMAP → Teknik Borç →
"Vadesi v0.0.16 — Aktif oturum listesi ve step-up kaynaklı borçlar") `ActiveSessionsCard.tsx`/
`TwoFactorStatusCard.tsx`'in artık tek bir noktada (`use-dialog-trigger-focus.ts`)
toplandığını not eder.

### 12. `''→null` sentinel eşlemesi tek saf fonksiyona taşındı — tek mekanik bekçi test

Eşleme `SessionsService.listOwnSessions` içinde değil, saf `toSessionSummary()`
fonksiyonunda (`apps/api/src/auth/session-summary.mapper.ts`) yaşıyor; adaptör katmanı
bu dönüşümü **tekrarlamıyor**. Derleyici bu sızıntıyı **yakalamıyor**:
`{...row}` yaymalı (spread) bir varyant `tsc --noEmit --strict` altında **exit 0**
verir — tek koruma `toSessionSummary()`'nin davranış testidir, tip sistemi değil.

### 13. IP'nin loglanmadığı iki savunma bağımsız ölçüldü (`security` tur 1 ve tur 2)

Tam akışın **tüm** log çıktısında herhangi bir dotted-quad **0**,
`"ipAddress"`/`"userAgent"` anahtarı **0** — iki ayrı gate turu bağımsız ölçtü.
⚠ Sınır yazıya geçirildi: `PINO_REDACT_PATHS` **yol tabanlıdır** ve pino `*` joker
karakteri **tek seviye** derinliktedir, dolayısıyla `{a:{b:{ipAddress}}}` gibi iç içe
bir yapı **redakte edilmez**; bu ADR'nin madde 2'sindeki "ikincil katman" bu yüzden
tam bir ağ değildir — birincil ve belirleyici savunma "hiçbir kod yolu IP'yi
loglayıcıya geçirmiyor" olgusudur.

### 14. Step-up sırası iki bağımsız eksende kanıtlandı

*Davranış* ekseni: parolasız çağrı **ve** başkasının `sessionId`'si ile çağrı aynı
`400` yanıtını üretiyor, hedef satır veritabanında **duruyor** (silinmiyor). *Zamanlama*
ekseni: `durationMs: 0` — reddeden istek **hiçbir** veritabanı turu yapmıyor; doğru
parolayla yapılan çağrılarda başkasının ve var olmayan `sessionId` gövdeleri
`requestId` alanı dışında **`toStrictEqual`** eşit çıkıyor. İki eksen birlikte, step-up
kapısının sahiplik doğrulamasından **önce** çalıştığını (madde 4) hem davranışla hem
zamanlamayla doğruluyor.

### 15. `perf` ölçümleri

`session.updateAge=300` **kabul edilebilir** bulundu: yazma yalnızca `needsRefresh`
`true` olduğunda tetikleniyor → istek hacminden bağımsız, yapısal olarak üst sınırlı
(canlı mutasyonla kanıtlandı). Oturum sorgusu `Index Scan using session_user_id_idx`
kullanıyor, **0,213 ms / 21 satır**, seq scan yok, N+1 yok. `toSessionSummary()`
mapper'ının çağrı maliyeti **~0,27 µs/çağrı** — DB süresinin ~38 katı altında, ölçülebilir
bir darboğaz değil. Admin bundle'ı `/` rotasında **179,11 KiB** ile **değişmedi**; yeni
`use-dialog-trigger-focus.ts` hook'u **lazy chunk'a** girdi (**+0,13 KiB**), ana paketi
şişirmedi.
