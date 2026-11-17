# T-022 — UX: İki faktörlü kurulumun yeniden gösterimi (sayfa yenileme sonrası)

> **Kapsam notu.** Bu belge T-016'nın (`docs/ux/T-016-iki-faktorlu-dogrulama.md`) 2FA
> kurulum sihirbazını **yeniden tasarlamıyor** — tek bir ekranın (Ekran 3 / "Adım 2 —
> uygulama bağlama + kod onayı") **tek bir yeni durumunu** ekliyor: sayfa yenilemesi
> (veya sekme kapat/aç, çökme sonrası dönüş) yüzünden kurulumun **aynı anahtarla**
> sürdürüldüğü durum. ADR-0024'ün bağlayıcı kararı: anahtar **artık yenilenmiyor**
> (`get-totp-uri` önce denenir, yalnızca `TOTP_NOT_ENABLED` ise `enable`'a düşülür);
> bu belge yalnızca **o durumda kullanıcıya ne söyleneceğini** tasarlıyor.
>
> **İki uygulama, bir metin.** `apps/superadmin` ve `apps/admin` birebir aynı kök
> nedeni taşıyor (`two-factor-setup-controller.ts`, ADR-0024 bağlamı) ve
> `MESSAGES.auth.twoFactor` bloğu bugün **ikisinde de aynı anahtar kümesiyle** duruyor
> (`apps/superadmin/src/messages/messages.ts:138-172` ↔
> `apps/admin/src/messages/messages.ts:306-341`, satır satır eşit). Bu belgenin
> önerdiği metin **ikisine de birebir aynı dizgeyle** girer — akışlar farklı olsa da
> (aşağıda) metin sapmaz.

## Hedef kullanıcı

**`apps/admin`:** mağaza sahibi/ekip üyesi — teknik bilgisi yok, 2FA burada
**gönüllü** bir kart eylemi. Sayfa yenilemesi onun için büyük olasılıkla
"bir şey bozuldu mu?" korkusu — metin bunu **sakinleştirici** ve açık olmalı, "QR'ı
tekrar okutmana gerek yok" güvencesini net vermeli.

**`apps/superadmin`:** 3-5 Arkesoft çalışanı — 2FA burada **zorunlu bir kapı**
(route kendisi sihirbazdır, atlanamaz). Bu kullanıcı grubu teknik olarak daha
rahat ama kapı zorunlu olduğu için sayfa yenilemesi sonrası **otomatik olarak**
aynı ekrana geri döner — "neden hâlâ buradayım" sorusuna metin aynı anda cevap
vermeli: kurulum zaten başlamıştı, anahtar değişmedi.

Her iki grup için de **yasak kelime:** "TOTP", "secret", "session", "mount",
"controller", "state". Metin yalnızca "anahtar", "kod", "yedek kod" der.

## Ekranlar ve rotalar

Yeni ekran **yok**. Değişen tek yüzey, T-016'nın zaten tanımladığı Ekran 3'ün
("2FA kurulumu — Adım 2: uygulama bağlama + kod onayı") **içeriğine koşullu bir
paragraf eklenmesi**:

| #   | Ekran                                     | Dosya                                                              | Rota/konum                                                                | Ne zaman görünür                                                                                         |
| --- | ----------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | 2FA kurulumu — Adım 2 (`apps/admin`)      | `apps/admin/src/features/two-factor/TwoFactorSetupWizard.tsx`      | `TwoFactorStatusCard` içinde, "Etkinleştir"e basınca açılan kart-içi adım | Kullanıcı "Etkinleştir"e **her bastığında** (kart kapanıp yeniden açıldıktan sonra da)                   |
| 2   | 2FA kurulumu — Adım 2 (`apps/superadmin`) | `apps/superadmin/src/features/two-factor/TwoFactorSetupWizard.tsx` | `routes/iki-adimli-dogrulama.tsx` — zorunlu kapı, kabuksuz tam sayfa      | Kullanıcı bu rotaya **her girişinde** (ilk kurulum veya yarıda kalmış kurulumdan sonra sayfa yenilemesi) |

**Akış farkı (bilinçli, metin bunu değiştirmez):** `apps/admin`'de sihirbaz bir kartın
içinde yaşıyor; kullanıcı sekmeyi/sayfayı yenilerse `TwoFactorStatusCard`'ın
`wizardOpen` durumu `false`'a döner ve kullanıcı **"Etkinleştir"e tekrar basmak
zorunda kalır** (`TwoFactorStatusCard.tsx:73,110`). `apps/superadmin`'de sihirbaz
zorunlu kapının kendisi olduğu için sayfa yenilemesi kullanıcıyı **otomatik** aynı
adıma geri getirir — ekstra bir tıklama yok. İki akış da aynı sonuca çıkıyor: yeni bir
sihirbaz örneği (`useState(() => new TwoFactorSetupController(...))`), sunucudan
**get-totp-uri ile** aynı anahtarı alıyor. Metin, hangi yoldan geldiğine bakmaksızın
**aynı**.

## Mutlu yol

### A. Kurulum kesintiye uğrar, sonra sürdürülür (yeni senaryo — bu belgenin konusu)

1. Kullanıcı 2FA kurulumuna başlar (şifre adımı → "uygulama bağlama" adımı); manuel
   anahtarı authenticator'ına ekler.
2. Kod girmeden sayfayı yeniler (veya sekmeyi kapatıp açar, tarayıcı çöker/yeniden
   açılır, `apps/admin`'de karttan çıkıp tekrar "Etkinleştir"e basar).
3. Sihirbaz yeniden açıldığında şifre adımına döner (T-016 ile aynı); kullanıcı
   şifresini tekrar girer.
4. **Bu belgenin eklediği davranış:** "uygulama bağlama" adımı yeniden açıldığında
   gösterilen manuel anahtar **adım 1'deki ile birebir aynıdır** — kullanıcının
   authenticator'ına **ikinci bir kayıt eklemesine gerek yoktur**, adım 1'de okuttuğu
   kod hâlâ çalışır. Manuel anahtar yönergesinin (`manualKeyInstructions`) altında
   yeni bir bilgi satırı belirir: kurulumun zaten başlamış olduğunu ve yedek kodların
   bu ekranda bir daha gösterilemeyeceğini söyler (metin aşağıda, Microcopy).
5. Kullanıcı authenticator'ındaki (adım 1'de eklediği, **hâlâ geçerli**) koddan
   üretilen 6 haneli kodu girer, "Doğrula"ya basar → başarılı.
6. **Yedek kodlar bu seferde gösterilmez** (sunucu bu çağrıda onları döndürmüyor) —
   sihirbaz doğrudan "tamamlandı" durumuna geçer; kullanıcı "Hesap güvenliği"
   ekranında 2FA'yı "Açık" görür ve istediği an "Yeni yedek kodlar oluştur" eylemiyle
   (T-016 Ekran 7) kendi yedek kodlarını üretebilir.

### B. Kesintisiz, ilk kurulum (değişmeyen yol — T-016'dan referans)

T-016'nın "Mutlu yol A" senaryosu **değişmeden** geçerli: `enable` çağrılır, yeni
anahtar + yedek kodlar aynı yanıtta gelir, bu belgenin eklediği bilgi satırı
**görünmez** (çünkü yedek kodlar mevcuttur — aşağıdaki durum tablosuna bkz.).

## Ekran durumları

### 2FA kurulumu — Adım 2 (uygulama bağlama + kod onayı), her iki uygulama

T-016'nın bu ekran için tanımladığı dört durumun **üzerine**, "normal" durumun
**iki alt varyantı** olarak okunmalı — yükleniyor/boş/hata T-016'dan değişmiyor.

| Durum                                                        | Kullanıcı ne görür                                                                                                                                                                                                                                                                                                  | Eylemler                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Normal — ilk kurulum** (yedek kodlar bu oturumda üretildi) | Manuel anahtar + yönerge + kod alanı. **Yeni bilgi satırı YOK** — bu ekranda "yeni anahtar, yeni başlangıç" dışında söylenecek bir şey yok, T-016 ile birebir aynı.                                                                                                                                                 | Kodu girer, doğrular.                                                                      |
| **Normal — sürdürülen kurulum** ⭐ (bu belgenin eklediği)    | Manuel anahtar + yönerge **+ hemen altında bilgi satırı**: _"Kurulum zaten başlatılmıştı — aynı anahtarla devam edin; yedek kodlar bu ekranda tekrar gösterilemez."_ (`setupResumedNotice`, aşağıda). Manuel anahtarın değeri adım 1'dekiyle **birebir aynı** — kullanıcı authenticator'ına yeni bir kayıt eklemez. | Kodu girer, doğrular (authenticator'daki **ilk** kayıttan üretilen kod hâlâ kabul edilir). |
| **Yükleniyor**                                               | T-016 ile aynı — "Doğrula" `isLoading`, alan salt okunur. Bilgi satırı (varsa) yükleniyor sırasında **kaybolmaz**, ekranda kalır.                                                                                                                                                                                   | Yok.                                                                                       |
| **Boş**                                                      | N/A — T-016 ile aynı, bu adımın verisi her zaman dolu gelir.                                                                                                                                                                                                                                                        | —                                                                                          |
| **Hata — yanlış kod**                                        | T-016 ile aynı: "Kod doğrulanamadı. Uygulamanızdaki güncel kodu girin." Bilgi satırı (varsa) **ekranda kalır** — hata, sürdürülen kurulum bilgisini geçersiz kılmaz.                                                                                                                                                | Tekrar dener.                                                                              |
| **Hata — ağ/sunucu**                                         | T-016 ile aynı: genel hata satırı + "Tekrar dene".                                                                                                                                                                                                                                                                  | "Tekrar dene".                                                                             |

**Ayrım kuralı (frontend'e):** hangi varyantın gösterileceği sunucudan gelen **yedek
kod listesinin varlığına** bağlıdır — "ilk kurulum" çağrısı (`enable`) her zaman yedek
kodlarla birlikte gelir, "sürdürülen kurulum" çağrısı (`get-totp-uri`) hiçbir zaman
yedek kod döndürmez. Bu belge bir ekran bayrağı icat etmiyor; var olan veri ayrımını
(yedek kod var/yok) metin kararına bağlıyor.

## Hata durumları

Bu belge **yeni bir hata sınıfı eklemiyor**. Tek not: ADR-0024'ün sunucu tarafı
düzeltmesi (`get-totp-uri` önce denenir, `TOTP_NOT_ENABLED` ise `enable`'a düşülür)
kullanıcıya **asla** bir hata olarak görünmez — bu dallanma şifre adımının
"Doğrula"/"Devam et" yüklenme durumunun **arkasında**, sessizce olur. Kullanıcı hiçbir
zaman "anahtar kontrol ediliyor" gibi bir ara durum görmez; yalnızca şifre adımından
uygulama bağlama adımına geçer (ilk kurulumda olduğu gibi aynı geçiş hissi).

**Tek gerçek hata ihtimali** (backend sorumluluğu, bu belge yalnızca kaydediyor):
sunucudaki hata kodu literali (`TOTP_NOT_ENABLED`) beklenmedik şekilde eşleşmezse
fallback hiç tetiklenmez ve kullanıcı şifre adımında genel "İsteğiniz işlenemedi"
hatasını görür (T-016'nın zaten var olan "Hata — ağ/sunucu" satırı, **yeni bir metin
gerekmiyor**). Bu senaryonun mekanik olarak yakalanması `backend`/S3'ün sözleşme
testinin işi; bu belge yalnızca kullanıcının o anda **var olan jenerik hata
metninden** fazlasını görmeyeceğini teyit ediyor.

## Yıkıcı işlemler

Bu ekranda **yeni bir yıkıcı işlem yok** — silme/iptal/yayından kaldırma akışı
eklenmiyor. Ama bir **davranışsal risk** var ve metin bunu önlemek için tasarlandı:

- **Risk:** kullanıcı "bilgi satırını" okumadan veya yanlış yorumlayarak,
  authenticator uygulamasındaki **doğru** kaydı silip yeniden eklemeye kalkışabilir
  ("belki anahtar değişti, eskisini silip yenisini eklemeliyim" varsayımıyla). Bu,
  kullanıcının **çalışan** bir kaydı gereksiz yere silmesi ve kendi kendine yeni bir
  karışıklık yaratması anlamına gelir — teknik olarak geri alınamaz değil (kullanıcı
  ekrandaki aynı manuel anahtarı tekrar ekleyebilir) ama **gereksiz bir sürtünme ve
  kafa karışıklığıdır**.
- **Önlem (metinle):** bilgi satırı kesinlikle _"anahtar yenilendi"_ **demez** —
  tam tersine _"**aynı** anahtarla devam edin"_ der; bu, kullanıcıyı authenticator
  kaydına **dokunmamaya** açıkça yönlendirir. Onay diyaloğu/ek sürtünme **gerekmiyor**
  çünkü işlem bir buton tıklaması değil, salt bilgilendirme — kullanıcının eylemi
  zaten "kodu gir" ile sınırlı.
- **Yedek kodların kaybı — geri alınamaz ama zararsız sınır, açıkça söyleniyor:**
  sürdürülen kurulumda yedek kodlar **bu ekranda bir daha gösterilmez** (sunucu
  sınırı, T-016'nın zaten kabul ettiği `viewBackupCodes`'un HTTP'den erişilemez
  olması ile aynı sınıf). Bu **geri alınamaz** bir kayıp değil — kurulum
  tamamlandıktan sonra kullanıcı "Yeni yedek kodlar oluştur" ile (T-016 Ekran 7,
  kendi onay diyaloğuyla) istediği an yeni bir set üretebilir. Bilgi satırı bu sınırı
  **gizlemez**, açıkça söyler ("yedek kodlar bu ekranda tekrar gösterilemez").

## Mobil davranış (360px)

Yeni bilgi satırı, T-016'nın Ekran 3 için zaten tanımladığı mobil düzene **ek bir
yapısal değişiklik getirmiyor**:

- Manuel anahtar bloğunun (`manualKeyLabel` + `code` + `manualKeyInstructions`)
  **son çocuğu** olarak eklenir — aynı tam genişlikte, satır sarabilen metin bloğu;
  ayrı bir kart/kutu/arka plan rengi **yok** (T-016'nın "Gelişmiş kullanıcılar için"
  `<details>` alanından **önce** gelir, onunla karışmaz).
- 360px'te metin iki satıra sarabilir, kesilmez, "…" ile kısaltılmaz (T-016'nın genel
  kuralı, burada tekrar).
- Dokunma hedefi gerektirmiyor (düz metin, buton/bağlantı yok) — mobil odak sırasına
  (`Tab`/okuyucu okuma sırası) yeni bir durak eklemiyor, sadece okunacak içerik
  ekliyor.

## Microcopy (i18n anahtarlarıyla)

### Yeni anahtar — `MESSAGES.auth.twoFactor.setupResumedNotice`

| Alan                                            | Değer                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Anahtar adı**                                 | `MESSAGES.auth.twoFactor.setupResumedNotice`                                                                                                                                                                                                                                                                                                                                      |
| **Türkçe metin (birebir, iki uygulamada AYNI)** | `Kurulum zaten başlatılmıştı — aynı anahtarla devam edin; yedek kodlar bu ekranda tekrar gösterilemez.`                                                                                                                                                                                                                                                                           |
| **Girdiği dosyalar**                            | `apps/superadmin/src/messages/messages.ts` **ve** `apps/admin/src/messages/messages.ts` — `MESSAGES.auth.twoFactor` nesnesinde, `manualKeyInstructions` anahtarının **hemen altına** eklenir (her iki dosyada da `manualKeyInstructions` zaten art arda aynı sırada duruyor: `apps/superadmin/src/messages/messages.ts:144-146`, `apps/admin/src/messages/messages.ts:312-314`).  |
| **Yerleşim (render)**                           | `TwoFactorSetupWizard.tsx`'in `state.step === 'totp'` dalında, manuel anahtar bloğunu saran `<div className="flex flex-col gap-1">`'in **son çocuğu** olarak, `manualKeyInstructions` paragrafının **hemen altında** — `<details>`/`showUriToggle` alanından **önce**. Superadmin: `TwoFactorSetupWizard.tsx:196-198`'in altı. Admin: `TwoFactorSetupWizard.tsx:221-223`'ün altı. |
| **Gösterim koşulu**                             | `state.step === 'totp' && state.backupCodes === null`. Bu koşul yeni bir bayrak gerektirmez — `backupCodes: readonly string[] \| null` alanı zaten var (`two-factor-setup-controller.ts`, her iki uygulamada); `null` **yalnızca** `get-totp-uri` çağrısının sonucuysa oluşur, `enable` her zaman dolu bir liste döner.                                                           |
| **"Anahtar yenilendi" DEMEZ**                   | ✅ Metin hiçbir biçimde "yenilendi", "değişti", "sıfırlandı" gibi bir fiil taşımıyor; "aynı anahtarla devam edin" ifadesi anahtarın **değişmediğini** açıkça söylüyor (ADR-0024'ün bağlayıcı semantiği).                                                                                                                                                                          |
| **Canlı bölge (`aria-live`)**                   | **Hayır, gerekmiyor** — gerekçe "Erişilebilirlik niyeti" bölümünde.                                                                                                                                                                                                                                                                                                               |

### Değişmeyen anahtarlar (bu belge referans veriyor, DEĞİŞTİRMİYOR)

T-016'nın tanımladığı `MESSAGES.auth.twoFactor.*` kümesi (`manualKeyLabel`,
`manualKeyInstructions`, `showUriToggle`, `codeInputLabel`, `verifyButton`,
`backupCodesTitle`, vb.) **aynen kalır** — bu belge yalnızca bir anahtar ekliyor.

### `ERROR_MESSAGES`/`PanelErrorCode` kapalı dünyasına **EKLENMEZ**

`TOTP_NOT_ENABLED` sunucudan gelen bir kod olsa da **içeride tüketiliyor** — yani
kullanıcıya hiçbir ekranda bu kod **doğrudan** gösterilmiyor (fallback sessizce
`enable`'a düşüyor). `resolveErrorMessage`/`ERROR_MESSAGES`'ın kapalı dünyasına bu
kod **girmez**; kullanıcıya dönük tek metin yukarıdaki `setupResumedNotice`'tır ve o
da bir hata değil, bilgilendirme metnidir — `MESSAGES.auth.twoFactor` altında, hata
kataloğunun **dışında**.

## Erişilebilirlik niyeti

- **Klavye akışı değişmiyor.** Yeni metin bir buton/bağlantı/form alanı
  **taşımıyor** — `Tab` sırasına yeni bir durak eklenmiyor, sadece okunacak statik
  içerik ekleniyor. Manuel anahtar kodunu kopyalama, kod alanına geçiş, "Doğrula"
  butonu — hepsi T-016'daki sırasıyla aynı kalıyor.
- **Odak yönetimi değişmiyor.** `TwoFactorSetupWizard.tsx`'in zaten var olan deseni
  (`headingRef.current?.focus()`, her `state.step` değişiminde) **sürdürülen
  kurulumda da aynen çalışır** — adım "totp"a geçtiğinde odak adımın `h2` başlığına
  gider, ekran okuyucu kullanıcısı oradan **doğal okuma sırasıyla** aşağı ilerlerken
  manuel anahtarı, yönergeyi ve (varsa) yeni bilgi satırını sırayla duyar.
- ⚠⚠ **Canlı bölge (`aria-live`) GEREKMİYOR — gerekçeli karar:**
  1. Bilgi satırı **asenkron bir güncelleme değil** — adımın `h2`'sine odağın
     taşındığı **aynı render**'ın bir parçası olarak DOM'a girer (controller'ın
     `submitPassword` metodu tek bir `setState` çağrısıyla hem `step: 'totp'`'u hem
     `backupCodes` alanını birlikte yazıyor; ikisi arasında kullanıcının zaten
     okumaya başladığı bir ekranı "sonradan değiştiren" bir ikinci an **yok**).
  2. Odak zaten yeni adımın başlığına taşındığı için ekran okuyucu kullanıcısı bu
     metni **doğal doküman sırasıyla** (başlık → manuel anahtar → yönerge → bu
     satır → kod alanı) karşılayacak; `aria-live` eklemek **aynı metni iki kez**
     duyurur (bir kez odak sırasında doğal okuma, bir kez canlı bölge olayı) — bu,
     T-016'nın geri sayım için zaten reddettiği **"canlı bölge spamı"**yla aynı
     sınıf bir gürültü (`docs/ux/T-016-iki-faktorlu-dogrulama.md`, "Erişilebilirlik
     niyeti" → "Geri sayım, canlı bölge spamı üretmez").
  3. Metin ne bir hata (`role="alert"` yanlış — kullanıcı hiçbir şeyi
     yanlış yapmadı) ne de geçici bir onay (`role="status"`, "Kopyalandı" gibi —
     bu metin geçip gitmiyor, adım boyunca **kalıcı**) — kategorisi
     `manualKeyInstructions`/`showUriToggle` ile **birebir aynı**: kalıcı, statik,
     adıma bağlı açıklama metni. O ikisi de `aria-live` taşımıyor; tutarlılık için
     bu da taşımamalı.
     ⇒ **Sonuç:** düz `<p>`, `role` yok, `aria-live` yok. `wcag`'in bu kararı
     denetlerken bakacağı şey canlı bölge **yokluğunun** gerekçeli olup olmadığı —
     yukarıdaki üç madde o gerekçedir.
- **Hata durumunda metin kaybolmaz.** Yanlış kod/ağ hatası durumunda bilgi satırı
  ekranda **kalır** (adım değişmiyor, yalnızca `errorMessage` dolduruluyor) — ekran
  okuyucu kullanıcısı tekrar denerken "aynı anahtarla devam ediyorum" bilgisini
  kaybetmez.
- **Renk/kontrast** bu belgede değerlendirilmedi — `ui` bu turda **açılmadı** (yeni
  bileşen/token yok, mevcut `<p className="text-(length:--font-size-small)
text-(--color-text-secondary)">` deseni `manualKeyInstructions` ile **aynı sınıf**
  kullanılarak önerilir, zaten WCAG AA için önceden doğrulanmış bir jeton); yeni bir
  kontrast hesaplaması gerektirmiyor.
