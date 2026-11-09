# T-016 — UX: İki faktörlü doğrulama (TOTP) ve oturum güvenliği

> **Kapsam notu.** v0.0.15 bu sürümde yalnızca backend mekanizmasını teslim ediyor
> (kullanıcının bağlayıcı kararı: "mekanizmayı teslim et, ekran v0.1.0"). Bu belge hiçbir
> ekranı bu sürümde inşa ETTİRMEZ — v0.1.0'ın `ux`/`ui`/`frontend` turlarının girdisidir.
> İkinci bağlayıcı karar: QR kodu **görüntüsü üretilmiyor**; kurulum ekranı kullanıcıya
> `otpauth://` bağlantısını ve elle girilebilir anahtarı gösterir, QR tarama adımı bu
> belgede **yok**.

## Ölçülmüş gerçekler

Üç kategori var ve bu belgede **birbirine karıştırılmadı**: (1) gerçek bir sunucuya HTTP
isteği atılarak canlı ölçülen, (2) `better-auth@1.7.14` paketinin kaynak kodu okunarak
ölçülen (HTTP ile canlı doğrulanmamış ama kodun kendisinden okunmuş), (3) bu belgenin
**tasarım kararı**. Her bulgunun yanına hangisi olduğu yazıldı.

### (1) Canlı HTTP ölçümü (S4, gerçek sunucu + Vitest entegrasyon testi)

| Senaryo                                          | HTTP  | Gövde                                                                                             |
| ------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------- |
| `sign-in/email`, 2FA **kapalı** (kontrol)        | `200` | `{redirect:false, token:…, user:{…, twoFactorEnabled:false}}`                                     |
| `sign-in/email`, 2FA **açık**                    | `200` | `{twoFactorRedirect:true, twoFactorMethods:["totp"]}`                                             |
| `two-factor/enable` (şifre doğru, session var)   | `200` | `{totpURI:"otpauth://...", backupCodes:[...]}` — **ikisi aynı çağrıda birlikte gelir**            |
| `two-factor/verify-totp`, **doğru** kod          | `200` | `{token:…, user:{…}}` (yeni oturum)                                                               |
| `two-factor/verify-totp`, **yanlış** kod         | `401` | `{message:"Invalid code", code:"INVALID_CODE"}`                                                   |
| 10. yanlış deneme (toplam, hesap seviyesi)       | `401` | hâlâ `INVALID_CODE` — kilit bu denemede henüz uygulanmaz                                          |
| 11. deneme (10'u aştıktan sonra, yeni challenge) | `429` | `{code:"ACCOUNT_TEMPORARILY_LOCKED", …}` + `Retry-After` başlığı, kod doğru/yanlış **fark etmez** |
| `two_factor` challenge çerezi                    | —     | `Max-Age=600` (**10 dakika**)                                                                     |

**⚠ Akışın en kritik noktası:** 2FA açık hesapta giriş **401 DEĞİL, 200 döner** ve
gövdede `twoFactorRedirect:true` taşır. `ROADMAP.md:1065` bunu _"kodsuz giriş 401"_ diye
yazıyor ve bu **yanlış** — düzeltmesi `docs`/S13'in işi, bu belge kodu **doğru** gerçeğe
göre tasarladı: giriş formu her zaman 200 alır, gövdedeki `twoFactorRedirect` alanına göre
ikinci adıma geçer, HTTP durumuna göre değil.

### (2) Better Auth kaynak kodu okunarak ölçülen (S4/S5'in dosya başı yorumları, HTTP ile canlı doğrulanmadı)

| Bulgu                                                                                                                                                                               | Kaynak                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Challenge **başına** en fazla **5** yanlış deneme; 6.'sı `TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE` (`400`) ile o challenge'ı geçersiz kılar — yeni bir sign-in (yeni challenge) gerekir. | `verify-two-factor.mjs:70-98`, `beginAttempt(5)`                               |
| Hesap seviyesi kilit eşiği **10** deneme / **900 saniye** (kodlanmış sabit, kütüphane varsayılanına örtük güvenilmedi)                                                              | `account-lockout.constants.ts` (bu alt görevin kendi dosyası)                  |
| `enable` → `POST /two-factor/enable` (`sessionMiddleware`), `disable` → `POST /two-factor/disable` (`sensitiveSessionMiddleware` — **step-up** gerektirir)                          | `plugins/two-factor/index.mjs`                                                 |
| `get-totp-uri`, `generate-backup-codes` → ikisi de `sessionMiddleware` (normal oturum yeterli, step-up **gerekmiyor**)                                                              | `plugins/two-factor/{totp,backup-codes}/index.mjs`                             |
| `verify-totp`, `verify-backup-code` → **middleware yok**, kimlik yalnızca `two_factor` çerezinden gelir                                                                             | aynı dosyalar                                                                  |
| `generateTOTP` ve `viewBackupCodes` `serverOnly()` — **HTTP router'a hiç kaydolmaz**, hiçbir uçtan çağrılamaz                                                                       | aynı dosyalar — bu yüzden "yedek kodları tekrar göster" gibi bir uç **yoktur** |

**Önemli sonuç (DOĞRULANAMADI olarak işaretlenen tek nokta):** `verify-totp`/`verify-backup-code`'un
challenge çerezi **hiç yoksa veya süresi dolmuşsa** ürettiği tam hata gövdesi bu alt
görevde HTTP ile ölçülmedi. Bu belge bu boşluğu **istemci tarafı sayaçla** kapatıyor (bkz.
Hata durumları §"Challenge süre aşımı") — sunucunun tam olarak ne döndüreceğine bel
bağlamıyor.

### (3) Diğer teslim edilen alt görevlerin ölçtüğü/kararlaştırdığı gerçekler

- `tenant.requireTwoFactorForOwner` (boolean, `TenantSummary`'nin katkısal alanı,
  `tenant-read.port.adapter.ts`) — kiracı güvenlik politikasının wire alan adı.
- `owner`, politikayı **kapalıdan açığa** çevirirken **kendi** 2FA'sı kapalıysa `409`
  `TWO_FACTOR_SETUP_REQUIRED` alır (`errors/domain/two-factor-setup-required.error.ts`),
  `userMessageKey: 'errors.twoFactor.setupRequiredBeforeEnforcement'` **zaten backend'de
  sabitlenmiş** — bu belge bu anahtarı **birebir** kullanıyor, yeni bir anahtar icat
  etmiyor.
- `ACCOUNT_TEMPORARILY_LOCKED` hatasının `userMessageKey`'i de backend'de zaten
  sabit: `errors.auth.accountTemporarilyLocked`.
- `session.me` üç durumu ayırt edecek: (i) 2FA gerekli değil, (ii) gerekli ve kurulmuş,
  (iii) **gerekli ama kurulmamış**. Bu üçüncü durum bu belgenin "2FA gerekli" banner/duvar
  tasarımının veri kaynağıdır.
- Kurulum/doğrulama uçları (`enable`/`verify-totp`/`get-totp-uri`/`generate-backup-codes`/`disable`)
  tenant-politika zorlamasından **muaf** — aksi hâlde 2FA'sız owner kendini kurma
  ekranından da 403 ile kilitlerdi (ölümcül kilit). Bu, "2FA gerekli duvarı"nın CTA'sının
  **her zaman** erişilebilir olduğunu garanti eder.

### (4) Bu belgenin kendi tasarım kararları (ölçülmedi, aşağıda `TASARIM KARARI:` ile işaretli)

Rotalar, ekran bölme (kaç adım), buton metinleri, backup kodların gösterim sırası, 403
duvarının tam hata kodu (S6 bu alt görevle **paralel** koşuyor, henüz kesinleşmedi) —
bunların hepsi bu belgenin önerisidir, v0.1.0'da `architect`/`backend`/`frontend`
tarafından doğrulanmalı.

---

## Hedef kullanıcı

**Birincil — mağaza sahibi (`owner`) ve ekibindeki üyeler.** Teknik bilgisi yok;
"TOTP", "challenge", "secret", "payload" gibi kelimeler hiçbir ekranda görünmez. Bu
kullanıcı grubu için 2FA iki farklı duyguyla karşılanır: (a) kendi isteğiyle
etkinleştiren biri için bu bir **güven artışı** ("hesabım daha güvenli"); (b) kiracı
politikası tarafından **zorunlu kılınan** bir `owner` için bu bir **engel**
("girebiliyorum ama bir şeye erişemiyorum, neden?") — metinler ikinci grubu asla
suçlayıcı bir dille karşılamaz, sorunu net tarif eder ve tek bir CTA ile çözüme götürür.

**İkincil — kiracı sahibi/owner, güvenlik politikası ekranında.** Bu kullanıcı başka
`owner`'ların hesaplarını zorlamanın sonucunu (onları ilk girişlerinde bir ekranla
karşılaşacaklarını) bilerek karar vermeli — toggle'ın yanındaki bilgi metni bunu açıkça
söyler.

## Ekranlar ve rotalar

**Hiçbiri bu sürümde inşa edilmiyor** — rotalar v0.1.0 için öneridir, admin uygulamasının
mevcut dosya-rotası deseniyle (`_auth.sign-in.tsx`, `_app.index.tsx`) tutarlı yazıldı.

| #   | Ekran                                                                   | Önerilen rota                                                                                                                          | Ne zaman görünür                                           | Oturum                                              |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| 1   | **Hesap güvenliği** — 2FA durum kartı                                   | `_app.hesap.guvenlik` (`/hesap/guvenlik`)                                                                                              | Herhangi bir üye kendi hesap ayarlarına girdiğinde         | Her üye (owner'a özel değil — 2FA kişisel bir ayar) |
| 2   | **2FA kurulumu** — 3 adımlı sihirbaz (şifre → kod onayı → yedek kodlar) | Ekran 1 üzerinde modal/adım akışı, ayrı rota değil                                                                                     | "Etkinleştir" butonuna basıldığında                        | Her üye                                             |
| 3   | **Giriş sırasında kod girme**                                           | `_auth.sign-in` rotasının ikinci adımı (aynı sayfa, state değişimi — yeni bir sayfa yüklemesi yok, hassas bir token URL'de taşınmıyor) | `sign-in/email` yanıtı `twoFactorRedirect:true` döndüğünde | Henüz oturum yok (challenge çerezi var)             |
| 4   | **Yedek kod ile giriş**                                                 | Ekran 3'ün alt modu ("Kodunuz yok mu?" bağlantısı)                                                                                     | Kullanıcı authenticator'a erişemiyorsa                     | Henüz oturum yok                                    |
| 5   | **Yedek kodları yönet** (yeniden oluştur)                               | Ekran 1 üzerinde, 2FA açıkken görünen bir eylem                                                                                        | Kullanıcı "Yeni yedek kodlar oluştur"a bastığında          | Her üye                                             |
| 6   | **Kiracı güvenlik politikası**                                          | `_app.ayarlar.guvenlik` (`/ayarlar/guvenlik`)                                                                                          | Owner, tenant ayarlarına girdiğinde                        | Yalnızca `owner`                                    |
| 7   | **"2FA gerekli" duvarı/banner**                                         | Route-agnostic — `_app` layout'ta persistan banner + korumalı rotalarda interstitial                                                   | `session.me` durumu (iii) olduğunda                        | `owner`, politika açık, kendi 2FA'sı kapalı         |

**Kapsam dışı (bu belgede tasarlanmadı):** aktif oturum listesi, şifre politikası/HIBP
kontrolü, genel step-up auth ekranı (yalnızca 2FA'yı devre dışı bırakma eylemi için
şifre istenmesi bu belgede VAR — genel mekanizma değil). Bunlar ROADMAP v0.0.15'in aynı
versiyonunda ama **başka alt görevlerin** UX'i.

## Mutlu yol

### A. Kendi isteğiyle 2FA kurma

1. Kullanıcı Hesap güvenliği ekranına gider, 2FA kartı "Kapalı" durumda, "Etkinleştir"
   butonu görünür.
2. **Adım 1 — şifre onayı:** "Etkinleştir"e basınca bir şifre alanı açılır (aynı ekranda,
   ayrı sayfa değil). Kullanıcı şifresini yazıp onaylar → `two-factor/enable` çağrılır.
   **TASARIM KARARI:** şifre adımı ayrı bir ekran değil, aynı akışın ilk adımı — ölçülen
   gerçek (`enable` çağrısı zaten `password` alanı istiyor) bunu tek adımda birleştirmeyi
   doğal kılıyor.
3. **Adım 2 — uygulamanızı bağlayın:** `enable` yanıtından gelen `totpURI`'den türetilmiş
   **manuel anahtar** büyük, kopyalanabilir bir metin olarak gösterilir; `otpauth://`
   bağlantısının kendisi "Gelişmiş kullanıcılar için" kapalı bir açılır alanda durur
   (T-009'daki `<details>/<summary>` deseniyle tutarlı). Kısa yönerge: _"Authenticator
   uygulamanızda hesap ekleyin, 'manuel giriş' seçin, bu anahtarı yapıştırın."_ Altında
   tek bir 6 haneli kod girişi + "Doğrula" butonu.
4. Kullanıcı uygulamasındaki kodu girer, "Doğrula"ya basar → `verify-totp` çağrılır
   (oturum çerezi ile, challenge çerezi değil — bu adım zaten oturum açıkken yapılıyor).
   Başarılıysa 2FA o anda etkinleşir ("2FA etkinleştirildi" olayı).
   **TASARIM KARARI — sıralama gerekçesi:** backup kodlar `enable` yanıtında zaten
   mevcut, ama kullanıcıya **önce kod doğrulaması başarılı olduktan sonra** gösterilir.
   Çünkü doğrulama başarısız olursa/kullanıcı vazgeçerse henüz çalışmayan bir yöntem
   için "yedek" kodu saklamak kafa karıştırır; önce ana yöntemin çalıştığı kanıtlanır.
5. **Adım 3 — yedek kodlar:** Doğrulama başarılı olunca, adım 1'in cevabında zaten
   elde tutulan `backupCodes` listesi gösterilir. Başlık: _"Bunlar yedek kodlarınız —
   bir daha gösterilmeyecek."_ Kopyala/indir butonları + "Bu kodları güvenli bir yere
   kaydettim" onay kutusu işaretlenmeden "Bitti" butonu etkin olmaz.
6. "Bitti"ye basınca sihirbaz kapanır, kart "Açık" duruma döner.

### B. Giriş sırasında 2FA

1. Kullanıcı e-posta/şifre ile normal giriş formunu gönderir.
2. Sunucu **200** döner ve gövdede `twoFactorRedirect:true` + `twoFactorMethods:["totp"]`
   varsa, form aynı sayfada ikinci adıma geçer (yeni bir sayfa yüklemesi yok). **401
   bekleyen bir kontrol yazılmaz** — bu akışın tek doğru tetikleyicisi budur.
3. Kullanıcı 6 haneli kodu girer, "Doğrula"ya basar → `verify-totp` (bu kez
   `two_factor` challenge çerezi ile). Başarılıysa yeni oturum kurulur, kullanıcı
   panele yönlendirilir.
4. Kodu/authenticator'ı yoksa "Kodunuz yok mu? Yedek kod kullanın" bağlantısına basar,
   aynı ekranda alan "8 karakterli yedek kod"a döner, `verify-backup-code` çağrılır.

### C. Owner, kiracı için 2FA'yı zorunlu kılıyor

1. Owner, Kiracı güvenlik politikası ekranına gider, "Owner için iki adımlı
   doğrulamayı zorunlu kıl" anahtarını açar.
2. Kendi 2FA'sı **açıksa** → anahtar hemen "Açık" olur, kısa bir bilgi notu görünür:
   _"Bu ayarı açtığınızda, iki adımlı doğrulaması olmayan diğer mağaza sahipleri bir
   sonraki girişlerinde bunu tamamlamaları için yönlendirilecek."_
3. Kendi 2FA'sı **kapalıysa** → `409 TWO_FACTOR_SETUP_REQUIRED`, anahtar görsel olarak
   "Kapalı"ya geri döner (optimistik güncelleme geri alınır), anahtarın altında bir
   satır: _"Bu ayarı açmadan önce kendi hesabınızda iki adımlı doğrulamayı
   etkinleştirmeniz gerekiyor."_ + "Şimdi kur" bağlantısı (Ekran 2'ye gider).

### D. 2FA'sı olmayan owner, politika açıldıktan sonra panele giriyor

1. Owner normal şekilde giriş yapar (kendi 2FA'sı kapalı olduğu için `twoFactorRedirect`
   **hiç tetiklenmez** — bu, Better Auth'un kullanıcı bazlı 2FA kontrolü ile kiracı
   politikasının **ayrı** zorlama noktaları olduğunun doğal sonucu).
2. Panel açılır açılmaz, `session.me` durumu (iii) ise, sayfanın üstünde kapatılamayan
   bir banner belirir: _"Hesabınız için iki adımlı doğrulama gerekiyor — [Şimdi kur]."_
3. Owner korumalı bir kaynağa (örn. üye/güvenlik ayarları) gitmeye çalışırsa ve banner'ı
   görmeden/okumadan tıklamışsa, "2FA gerekli" duvarı (tam sayfa interstitial) ile
   karşılaşır — aynı tek CTA, farklı bağlam (derin bağlantı/yer imi senaryosu için
   güvenlik ağı).
4. "Şimdi kur"a basınca Ekran 2 açılır; kurulum tamamlanınca banner/duvar kaybolur ve
   owner önceden gitmek istediği sayfaya geri döner.

## Ekran durumları

### 1. Hesap güvenliği — 2FA durum kartı

| Durum               | Kullanıcı ne görür                                                                                                                                                                                                         | Eylemler                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Normal — kapalı** | "İki adımlı doğrulama: Kapalı" + kısa açıklama + "Etkinleştir" butonu.                                                                                                                                                     | "Etkinleştir" → Ekran 2 açılır.                   |
| **Normal — açık**   | "İki adımlı doğrulama: Açık" + kurulum tarihi (varsa backend'den; yoksa gösterilmez, uydurulmaz) + "Devre dışı bırak" + "Yeni yedek kodlar oluştur".                                                                       | İki eylemden biri seçilir (bkz. Yıkıcı işlemler). |
| **Yükleniyor**      | Kart alanı iskelet/placeholder gösterir (durum bilinmeden "Etkinleştir"/"Devre dışı bırak" **hiçbiri** render edilmez — yanlış eylemi tıklatmamak için).                                                                   | Yok.                                              |
| **Boş**             | N/A — bu kart her zaman iki durumdan birini (açık/kapalı) gösterir, "veri yok" diye üçüncü bir hâl yok.                                                                                                                    | —                                                 |
| **Hata**            | Kart durumu çekilemezse: "Güvenlik ayarlarınız şu anda yüklenemedi." + "Yeniden dene" butonu. Sayfanın geri kalanı (varsa diğer hesap ayarları) render edilmeye devam eder — tek bir kartın hatası tüm sayfayı kilitlemez. | "Yeniden dene".                                   |

### 2. 2FA kurulumu — Adım 1 (şifre onayı)

| Durum                   | Kullanıcı ne görür                                                                                                                                       | Eylemler                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Normal**              | Tek şifre alanı + "Devam et" butonu + "Neden şifremi istiyorsunuz?" kısa açıklama (bir satır, açılır ibare değil — tek cümle, gerek yok).                | Şifre girer, gönderir.           |
| **Yükleniyor**          | "Devam et" butonu `isLoading` durumuna geçer (metin "Doğrulanıyor…"), alan salt okunur — mevcut giriş ekranındaki AYNI desen (`isSubmitting`).           | Yok — ikinci tıklama engellenir. |
| **Boş**                 | N/A — form her zaman tek alan.                                                                                                                           | —                                |
| **Hata — yanlış şifre** | Alan altında "Şifreniz doğrulanamadı. Tekrar deneyin." (field-level, `role="alert"`), alan temizlenmez (yalnızca şifre gizlenir), odak alana geri döner. | Tekrar dener.                    |
| **Hata — ağ/sunucu**    | Genel hata satırı: "İsteğiniz işlenemedi. Lütfen tekrar deneyin." (mevcut panelin jenerik hata deseniyle aynı).                                          | "Tekrar dene".                   |

### 3. 2FA kurulumu — Adım 2 (uygulama bağlama + kod onayı)

| Durum                 | Kullanıcı ne görür                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Eylemler                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Normal**            | Manuel anahtar (büyük, kopyalanabilir, monospace) + kısa yönerge + kapalı "Bağlantıyı göster" açılır alanı (otpauth URI) + 6 haneli kod girişi + "Doğrula" butonu.                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Anahtarı kopyalar, uygulamasına girer, kod yazar, doğrular. |
| **Yükleniyor**        | "Doğrula" `isLoading`, kod alanı salt okunur.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Yok.                                                        |
| **Boş**               | N/A.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | —                                                           |
| **Hata — yanlış kod** | "Kod doğrulanamadı. Uygulamanızdaki güncel kodu girin." (field-level), kod alanı temizlenir, odak alana geri döner. Deneme sayısı **görünür değil** — bu adımda hesap kilidi riski yoktur (oturum zaten açık, bu bir challenge değil), sınırsız yeniden deneme serbest. ⚠ **Tutarsızlık (`frontend` ölçtü, T-016 FIX turları):** "kod alanı temizlenir" burada tasarım niyeti olarak doğru, ama kodda bunu yapan bir `resetField` çağrısı YOK — alan bugün temizlenmiyor. Düzeltme kodda, bu belgenin kapsamı dışında; borç olarak kaydedildi (ROADMAP → Teknik Borç → Vadesi v0.0.16, "docs/ui:154 · docs/ux:213" satırı). | Tekrar dener.                                               |
| **Hata — ağ/sunucu**  | Genel hata satırı + "Tekrar dene". Manuel anahtar ekranda **kalır** (kullanıcı kaybetmez, aynı `enable` yanıtından).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | "Tekrar dene".                                              |

### 4. 2FA kurulumu — Adım 3 (yedek kodlar)

| Durum          | Kullanıcı ne görür                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Eylemler                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Normal**     | Başlık "Bunlar yedek kodlarınız — bir daha gösterilmeyecek.", kodların listesi (sıralı liste, her biri ayrı satır), "Tümünü kopyala" + "Metin dosyası indir" butonları, "Bu kodları güvenli bir yere kaydettim" onay kutusu, kutu işaretlenmeden pasif "Bitti" butonu.                                                                                                                                                                                                              | Kopyalar/indirir, kutuyu işaretler, "Bitti". |
| **Yükleniyor** | N/A — bu ekranın verisi zaten adım 1'in yanıtından elde bellekte; ek bir ağ çağrısı yok.                                                                                                                                                                                                                                                                                                                                                                                            | —                                            |
| **Boş**        | N/A — liste her zaman sunucudan gelen gerçek kod sayısı kadar dolu gelir (sabit sayı gömülmez).                                                                                                                                                                                                                                                                                                                                                                                     | —                                            |
| **Hata**       | N/A — bu ekran bir API çağrısı yapmaz, sadece elde tutulan veriyi gösterir. Teorik olarak kullanıcı sayfayı bu ekrandayken yenilerse veri **kaybolur** (API bu kodları ikinci kez döndürmez — `viewBackupCodes` HTTP'den erişilemez) → bu durumda 2FA zaten **etkin**dir ama kullanıcı kodları görmemiştir; ekran yeniden açıldığında "Hesap güvenliği" kartında "Yeni yedek kodlar oluştur" eylemiyle karşılanır (bkz. Hata durumları, "Sayfa yenilenirse yedek kodlar kaybolur"). | —                                            |

### 5. Giriş sırasında kod girme

| Durum                                            | Kullanıcı ne görür                                                                                                                                                                                       | Eylemler                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Normal**                                       | "Hesabınızı doğrulayın" başlığı + 6 haneli kod alanı + "Doğrula" + "Kodunuz yok mu? Yedek kod kullanın" bağlantısı + kalan süre göstergesi (10:00'dan geri sayar — istemci tarafı, bkz. Hata durumları). | Kod girer, doğrular veya yedek koda geçer. |
| **Yükleniyor**                                   | "Doğrula" `isLoading`, kod alanı salt okunur.                                                                                                                                                            | Yok.                                       |
| **Boş**                                          | N/A.                                                                                                                                                                                                     | —                                          |
| **Hata — yanlış kod**                            | "Kod doğrulanamadı. Uygulamanızdaki güncel kodu girin." Kalan deneme sayısı **bu challenge için** gösterilmez (sunucu bunu dönmüyor) ama 5. yanlış denemeden sonra farklı bir hata gelir (aşağıya bkz.). | Tekrar dener.                              |
| **Hata — challenge aşıldı/süresi doldu/kilitli** | Bkz. Hata durumları — üç farklı metin, üçü de aynı CTA'ya ("Girişe dön") çıkar.                                                                                                                          | "Girişe dön".                              |

### 6. Yedek kod ile giriş

| Durum                               | Kullanıcı ne görür                                                                                                        | Eylemler                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Normal**                          | "Yedek kodunuzu girin" + tek metin alanı (8 karakter) + "Doğrula" + "Authenticator kodunu kullan" (Ekran 5'e geri döner). | Kod girer, doğrular.                        |
| **Yükleniyor**                      | "Doğrula" `isLoading`.                                                                                                    | Yok.                                        |
| **Boş**                             | N/A.                                                                                                                      | —                                           |
| **Hata — geçersiz/kullanılmış kod** | "Bu yedek kod geçerli değil veya daha önce kullanıldı. Başka bir kod deneyin."                                            | Başka kod dener veya authenticator'a döner. |
| **Hata — challenge aşıldı/kilitli** | Ekran 5 ile aynı üç durum (challenge paylaşımlı).                                                                         | "Girişe dön".                               |

### 7. Yedek kodları yönet (yeniden oluştur)

| Durum          | Kullanıcı ne görür                                                                                                                                                                                                                                                                                                                                           | Eylemler          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| **Normal**     | "Yeni yedek kodlar oluştur" butonu, basıldığında onay diyaloğu (bkz. Yıkıcı işlemler). Onaylanırsa Ekran 4 ile **aynı** tek seferlik gösterim tekrar çalışır.                                                                                                                                                                                                | Onaylar/vazgeçer. |
| **Yükleniyor** | Diyalog "Oluşturuluyor…" durumuna geçer.                                                                                                                                                                                                                                                                                                                     | Yok.              |
| **Boş**        | N/A.                                                                                                                                                                                                                                                                                                                                                         | —                 |
| **Hata**       | Diyalog içinde "Yeni kodlar oluşturulamadı. Lütfen tekrar deneyin." eski kodlar (varsayım: backend eskilerini henüz silmediyse) etkisini **korur** — kullanıcıya "eski kodlarınız hâlâ geçerli" diye **güvence verilmez** çünkü bu backend davranışı bu alt görevde ölçülmedi (DOĞRULANAMADI); metin yalnızca "tekrar deneyin" der, bir garanti iddia etmez. | "Tekrar dene".    |

### 8. Kiracı güvenlik politikası

| Durum                                | Kullanıcı ne görür                                                                                                                                             | Eylemler                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Normal**                           | "Owner için iki adımlı doğrulamayı zorunlu kıl" anahtarı (açık/kapalı) + bilgi notu (duruma göre değişen metin, bkz. Mutlu yol C).                             | Anahtarı değiştirir (onay diyaloğu kapatırken, bkz. Yıkıcı işlemler). |
| **Yükleniyor**                       | Anahtar iskelet durumunda, tıklanamaz.                                                                                                                         | Yok.                                                                  |
| **Boş**                              | N/A — anahtar her zaman iki durumdan biri.                                                                                                                     | —                                                                     |
| **Hata — 409 (kendi 2FA'sı kapalı)** | Anahtar eski haline geri döner + satır: "Bu ayarı açmadan önce kendi hesabınızda iki adımlı doğrulamayı etkinleştirmeniz gerekiyor." + "Şimdi kur" bağlantısı. | "Şimdi kur" → Ekran 2.                                                |
| **Hata — ağ/sunucu**                 | Anahtar eski haline döner + genel hata satırı.                                                                                                                 | "Tekrar dene".                                                        |

### 9. "2FA gerekli" banner / duvar

| Durum               | Kullanıcı ne görür                                                                                                                                                                                                                              | Eylemler                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Normal (banner)** | Sayfanın üstünde, kapatılamayan (×'siz) ince bir şerit: "Hesabınız için iki adımlı doğrulama gerekiyor." + "Şimdi kur" bağlantısı. Diğer sayfa içeriği normal çalışır — bu bir modal **değil**.                                                 | "Şimdi kur" → Ekran 2.                                                                                |
| **Normal (duvar)**  | Korumalı bir rotaya doğrudan gidildiğinde (yer imi/derin bağlantı), o rotanın içeriği **hiç render edilmez**; tam sayfa: "Bu bölüm için iki adımlı doğrulama gerekli" + aynı CTA + "Panele dön" bağlantısı.                                     | "Şimdi kur" veya "Panele dön".                                                                        |
| **Yükleniyor**      | `session.me` henüz dönmediyse banner/duvar **gösterilmez** (varsayılan: yok sayılır, veri gelince karar verilir) — erken "gerekli" yanlış pozitifi yanıltıcı olurdu.                                                                            | Yok.                                                                                                  |
| **Boş**             | N/A — bu, `session.me`'nin üç durumundan biri; "boş" ayrı bir hâl değil.                                                                                                                                                                        | —                                                                                                     |
| **Hata**            | `session.me` çekilemezse banner/duvar **gösterilmez** (fail-open **görüntü** tarafında — asıl yetki zorlaması zaten her istekte sunucu tarafında ayrıca kontrol edilir, bu sadece bir UI ipucu; sunucu kararını istemci asla geçersiz kılamaz). | Sayfa normal yüklenmeye çalışır; korumalı bir kaynağa erişim denenirse sunucu 403 ile zaten durdurur. |

## Hata durumları

| Durum                                                                                                     | Ne oldu                                                                       | Kullanıcı ne görür                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Nasıl kurtulur                                                                                                               |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Yanlış kod (401 `INVALID_CODE`)**                                                                       | Girilen TOTP/yedek kod hatalı.                                                | "Kod doğrulanamadı. Uygulamanızdaki güncel kodu girin."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Doğru kodu tekrar girer.                                                                                                     |
| **Challenge başına 5 deneme aşımı (`400 TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE`, kaynak okumasıyla ölçüldü)** | Aynı giriş denemesinde 5 kez yanlış kod girildi, bu challenge artık geçersiz. | "Bu doğrulama denemesinin süresi doldu. Güvenlik nedeniyle yeniden giriş yapmanız gerekiyor."                                                                                                                                                                                                                                                                                                                                                                                                                                                        | "Girişe dön" — e-posta/şifreyi tekrar girer, yeni bir challenge (yeni 5 hak) başlar.                                         |
| **Hesap kilidi (429 `ACCOUNT_TEMPORARILY_LOCKED`, 900 sn)**                                               | Toplamda (challenge'lar arası) 10 yanlış deneme yapıldı.                      | "Çok fazla hatalı deneme yapıldı. Hesabınız güvenlik nedeniyle geçici olarak kilitlendi. {dakika} dakika sonra tekrar deneyebilirsiniz." (`{dakika}` sunucunun `Retry-After` başlığından hesaplanır, sabit "15" gömülmez).                                                                                                                                                                                                                                                                                                                           | Süre dolana kadar bekler; buton bu süre boyunca devre dışı, otomatik yeniden deneme **yapılmaz** (kullanıcı kendi tetikler). |
| **Challenge süre aşımı (600 sn, canlı ölçülen `Max-Age`)**                                                | Kullanıcı kodu girmek için 10 dakikadan fazla bekledi.                        | İstemci tarafı sayaç 0'a ulaştığında kod alanı kilitlenir: "Doğrulama süreniz doldu. Güvenliğiniz için tekrar giriş yapmanız gerekiyor." — sunucunun bu durumda tam olarak ne döneceği bu alt görevde ölçülmedi (**DOĞRULANAMADI**); istemci bunu **proaktif** olarak (sunucuya sormadan, kendi sayacıyla) gösterir, böylece belirsiz bir sunucu hatasına bağımlı kalınmaz. Eğer kullanıcı sayaç dolmadan gönderirse ve sunucu beklenmeyen bir hata dönerse, jenerik "İsteğiniz işlenemedi" satırına düşer — bu da aynı "Girişe dön" CTA'sına çıkar. | "Girişe dön".                                                                                                                |
| **403 duvarı (owner, politika açık, kendi 2FA'sı kapalı — tam hata kodu S6 ile paralel, DOĞRULANAMADI)**  | Owner korumalı bir kaynağa erişmeye çalıştı.                                  | "Bu bölüm için iki adımlı doğrulama gerekli." + "Şimdi kur"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Ekran 2'yi tamamlar, kurulum bitince aynı kaynağa erişebilir.                                                                |
| **409 "önce kendin kur" (`TWO_FACTOR_SETUP_REQUIRED`)**                                                   | Owner, kendi 2FA'sı kapalıyken politikayı açmaya çalıştı.                     | "Bu ayarı açmadan önce kendi hesabınızda iki adımlı doğrulamayı etkinleştirmeniz gerekiyor." + "Şimdi kur"                                                                                                                                                                                                                                                                                                                                                                                                                                           | Önce kendi 2FA'sını kurar, sonra politikayı açar.                                                                            |
| **Yedek kod geçersiz/tükenmiş**                                                                           | Girilen yedek kod hiç var olmayan veya daha önce kullanılmış bir kod.         | "Bu yedek kod geçerli değil veya daha önce kullanıldı. Başka bir kod deneyin."                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Başka bir yedek kod dener veya authenticator koduna döner.                                                                   |
| **Sayfa yenilenirse yedek kodlar kaybolur**                                                               | Kullanıcı Ekran 4'teyken (henüz "Bitti" demeden) sayfayı yeniler/kapatır.     | Bir hata **mesajı yok** — kullanıcı Hesap güvenliği ekranına döner, 2FA zaten "Açık" görünür (çünkü doğrulama adımı tamamlandı). Kodları bir daha göremeyeceği için "Yeni yedek kodlar oluştur" eylemiyle karşılanır.                                                                                                                                                                                                                                                                                                                                | "Yeni yedek kodlar oluştur" (Ekran 7).                                                                                       |
| **Ağ hatası (herhangi bir adımda)**                                                                       | İstek sunucuya hiç ulaşmadı/yanıt parse edilemedi.                            | "İsteğiniz işlenemedi. Lütfen tekrar deneyin." (mevcut panelin jenerik ağ hatası satırıyla aynı metin).                                                                                                                                                                                                                                                                                                                                                                                                                                              | "Tekrar dene".                                                                                                               |

## Yıkıcı işlemler

| İşlem                                                          | Onay gerekir mi                                                                                                                                                                                                                                                  | Geri alınabilir mi                                                                                                                                        | Geri alma süresi                        |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **2FA'yı devre dışı bırakma**                                  | **Evet** — "2FA'yı devre dışı bırakırsanız hesabınız yalnızca şifreyle korunur. Devam edilsin mi?" diyaloğu + şifre tekrar istenir (ölçülen `sensitiveSessionMiddleware`, step-up).                                                                              | **Hayır, gerçek anlamda değil** — yeniden etkinleştirme **yeni** bir kurulum (yeni gizli anahtar, yeni yedek kodlar); eski yedek kodlar güvenli SAYILMAZ. | Yok — anında etkili.                    |
| **Yedek kodları yeniden oluşturma**                            | **Evet** — "Yeni kodlar oluşturursanız eski yedek kodlarınız artık çalışmaz. Devam edilsin mi?" (backend bunu zorunlu kılmıyor — `sessionMiddleware` yeterli — ama bu istemci tarafı ek bir güvenlik sürtünmesi, **TASARIM KARARI**, çünkü eylem geri alınamaz). | Hayır — eski set geçersiz kabul edilir (davranışın kendisi bu belgede HTTP ile doğrulanmadı, ama güvenli varsayım budur).                                 | Yok.                                    |
| **Kiracı politikasını kapatma (owner zorunluluğunu kaldırma)** | **Evet, hafif** — "Bu ayarı kapatırsanız mağaza sahipleri iki adımlı doğrulama olmadan panele erişebilir. Devam edilsin mi?" (tip-to-confirm değil, standart onay/vazgeç).                                                                                       | **Evet, tamamen** — istenildiği an tekrar açılabilir; veri silinmiyor.                                                                                    | Sınırsız (anında geri alınabilir ayar). |
| **Kiracı politikasını açma**                                   | Hayır — güvenliği artıran bir eylem, sürtünme gerekmiyor. Yalnızca **bilgilendirme** notu var (bkz. Mutlu yol C).                                                                                                                                                | Evet, istenildiğinde kapatılabilir.                                                                                                                       | Sınırsız.                               |

## Mobil davranış (360px)

- **Kod girişi (Ekran 3/5/6):** tek bir metin alanı, altı (veya yedek kod için sekiz)
  karakter; `inputmode="numeric"`, `autocomplete="one-time-code"` davranışı önerilir
  (tam bileşen/markup kararı `ui`'nin — burada yalnızca davranış gereksinimi var).
  Segmentli (kutu-kutu) giriş **önerilmiyor**: ekran okuyucu ve odak yönetimi tek
  alana göre daha basit ve hataya daha az açık.
- **Manuel anahtar/URI kopyalama (Ekran 3):** manuel anahtar tam genişlikte, satır
  sarabilen monospace blok; "Kopyala" butonu tam genişlik, dokunma hedefi ≥44×44px.
  `otpauth://` bağlantısı kapalı açılır alanın içinde — 360px'te bu alan açıldığında
  içerik satır sarar, kesilmez.
- **Yedek kodlar (Ekran 4):** liste dikey, her kod kendi satırında, büyük punto/boşluklu
  (yanlış kopyalamayı azaltmak için). "Tümünü kopyala" ve "İndir" butonları **sabit alt
  eylem çubuğunda** (sticky bottom bar) — liste uzun olursa kaydırılırken butonlar her
  zaman erişilebilir kalır. "Bitti" butonu da bu çubukta, onay kutusu işaretlenene kadar
  devre dışı görünümde.
- **Giriş kod ekranı (Ekran 5/6):** sanal klavye açıldığında "Doğrula" butonu ekran
  dışına taşmayacak şekilde sabit konumlandırılır (sticky) — kullanıcı klavyeyi
  kapatmak zorunda kalmaz.
- **Kiracı güvenlik politikası (Ekran 8):** tek anahtar + tek bilgi/hata satırı,
  360px'te yapısal değişiklik gerekmiyor (liste/tablo yok).
- **Banner (Ekran 9, normal durum):** 360px'te başlık ve CTA bağlantısı alt alta
  (iki satır), şerit yüksekliği içerik kadar büyür — metin kesilip "…" ile
  kısaltılmaz.

## Yedek kodların UX'i

Bu, 2FA'nın en çok destek talebi üreten parçası — tasarım burada özellikle temkinli:

1. **Tek seferlik gösterim, gerçek bir kısıtlama.** Better Auth'un `viewBackupCodes`
   uç noktası HTTP router'a hiç kaydolmuyor (ölçüldü, kaynak okuması) — yani **hiçbir
   ekran** "yedek kodlarımı tekrar göster" diye bir özellik sunamaz, çünkü böyle bir
   API yok. Tek seçenek "Yeniden oluştur" (yeni set, eskisini geçersiz kılar). Ekranlar
   bunu gizlemez, Adım 3/Ekran 4'ün başlığı bunu doğrudan söyler: "bir daha
   gösterilmeyecek."
2. **Kaybetme riskine karşı sürtünme.** "Bu kodları güvenli bir yere kaydettim" onay
   kutusu işaretlenmeden "Bitti"/"Kapat" **pasif** kalır — kullanıcı yanlışlıkla
   ekranı kapatıp kodları kaybetme riskini en azından bir kez bilinçli olarak
   onaylamış olur. Bu bir kilit değil, geri dönüş yolu olmayan tek ekran için bir
   son kontrol noktası.
3. **Kopyalama/indirme ikisi de sunulur.** "Tümünü kopyala" (panoya, satır satır) ve
   "Metin dosyası indir" (`.txt`, dosya adı jenerik — örn. `arkesoft-yedek-kodlar.txt`,
   mağaza/kullanıcı kimliği dosya adına **gömülmez**). Kopyalama başarılı olduğunda
   kısa bir "Kopyalandı" durumu (bkz. Erişilebilirlik — `role="status"`, hata değil).
4. **"Kalan kod sayısı" bildirimi — DOĞRULANAMADI/sınırlama.** Bugünkü backend
   yüzeyi (`viewBackupCodes` dahili, dışa açık değil) canlı bir "kalan N kod" sayacı
   **sunmuyor**. Bu belge sahip olunmayan bir veriyi uydurmuyor (CLAUDE.md'nin genel
   dürüstlük ilkesi, T-009'daki "vitrin sahip olmadığı şeyi göstermez" kararıyla aynı
   disiplin). Tasarım telafisi: ekranda yalnızca kurulum/oluşturma **tarihi** gösterilir
   (varsa backend bunu sağlıyorsa; sağlamıyorsa hiç gösterilmez), ve "Yeniden oluştur"
   eylemi her zaman erişilebilir tutulur — kullanıcı şüphelendiğinde ("kaç kod
   kullandım hatırlamıyorum") tüm seti güvenle sıfırlayabilir. **Öneri (bu belgenin
   kapsamı dışında, v0.1.0+ backend'e not):** her başarılı yedek-kod girişinde
   kullanıcıya bir bildirim/e-posta gönderilmesi, "kalan sayı" sorununu dolaylı olarak
   çözer — bu belge bunu **zorunlu kılmıyor**, sadece not ediyor.

## Microcopy (i18n anahtarlarıyla)

**⚠ Önemli — gerçek mekanizma uyarısı.** `apps/admin/src/messages/messages.ts`'in
ölçülen gerçek deseni, CLAUDE.md'nin örnek verdiği gibi noktalı bir anahtar kataloğu
**değil**: düz bir `PanelErrorCode` (SCREAMING_SNAKE_CASE, sunucunun `code` alanıyla
birebir) → Türkçe mesaj eşlemesi (`resolveErrorMessage(code)`, kapalı dünya,
`satisfies Record<PanelErrorCode, string>`). Backend'in `AppError.userMessageKey`
alanı ise noktalı biçimde yazılıyor (`errors.auth.accountTemporarilyLocked`,
`errors.twoFactor.setupRequiredBeforeEnforcement` — ikisi de zaten kodda sabit).
Bu iki dünya **bugün birbirine bağlı değil**; v0.1.0'ın `frontend` ajanı bunu
uzlaştırmalı (ya `PanelErrorCode`'a yeni kodlar eklenir ve `userMessageKey`
e eşlenir, ya da panel `userMessageKey`'i okuyan ikinci bir çözücüye geçer — bu
belgenin kapsamı dışında, **RİSKLER**'de bildirildi). Aşağıdaki tablo **her ikisini
de** veriyor: gerçek mekanizmaya uygun `PanelErrorCode` önerisi + görevin istediği
noktalı anahtar (traceability için).

| Bağlam                                                                    | Önerilen `PanelErrorCode`                                                                                  | Önerilen noktalı anahtar                          | Türkçe metin                                                                                                                           |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Yanlış TOTP/yedek kod (401)                                               | `INVALID_CODE`                                                                                             | `errors.twoFactor.invalidCode`                    | Kod doğrulanamadı. Uygulamanızdaki güncel kodu girin.                                                                                  |
| Challenge başına 5 deneme aşımı (400)                                     | `TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE`                                                                       | `errors.twoFactor.challengeAttemptsExceeded`      | Bu doğrulama denemesinin süresi doldu. Güvenlik nedeniyle yeniden giriş yapmanız gerekiyor.                                            |
| Hesap kilidi (429)                                                        | `ACCOUNT_TEMPORARILY_LOCKED` (zaten backend'de `errors.auth.accountTemporarilyLocked`)                     | `errors.auth.accountTemporarilyLocked`            | Çok fazla hatalı deneme yapıldı. Hesabınız güvenlik nedeniyle geçici olarak kilitlendi. {dakika} dakika sonra tekrar deneyebilirsiniz. |
| Challenge süre aşımı (istemci sayacı, 600 sn)                             | — (sunucu hatası değil, istemci durumu)                                                                    | `auth.twoFactor.challengeExpired`                 | Doğrulama süreniz doldu. Güvenliğiniz için tekrar giriş yapmanız gerekiyor.                                                            |
| 403 duvarı (owner, politika + kurulmamış 2FA — DOĞRULANAMADI, S6 paralel) | `TWO_FACTOR_REQUIRED_BY_POLICY` (öneri, S6 kesinleştirecek)                                                | `errors.twoFactor.requiredByTenantPolicy`         | Bu bölüm için iki adımlı doğrulama gerekli.                                                                                            |
| 409 "önce kendin kur" (zaten backend'de sabit)                            | `TWO_FACTOR_SETUP_REQUIRED`                                                                                | `errors.twoFactor.setupRequiredBeforeEnforcement` | Bu ayarı açmadan önce kendi hesabınızda iki adımlı doğrulamayı etkinleştirmeniz gerekiyor.                                             |
| Yedek kod geçersiz/kullanılmış                                            | `INVALID_BACKUP_CODE` (öneri)                                                                              | `errors.twoFactor.invalidBackupCode`              | Bu yedek kod geçerli değil veya daha önce kullanıldı. Başka bir kod deneyin.                                                           |
| Şifre onayı hatalı (kurulum adım 1)                                       | `INVALID_PASSWORD` (öneri — mevcut `INVALID_EMAIL_OR_PASSWORD` ile karıştırılmaz, bu bağlamda e-posta yok) | `errors.twoFactor.passwordConfirmationFailed`     | Şifreniz doğrulanamadı. Tekrar deneyin.                                                                                                |

**UI metinleri (hata değil — ekran içeriği), önerilen anahtar kökü `account.security.twoFactor.*` / `auth.twoFactor.*`:**

| Anahtar                                                   | Metin                                                                                                                                         |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `account.security.twoFactor.statusOffTitle`               | İki adımlı doğrulama: Kapalı                                                                                                                  |
| `account.security.twoFactor.statusOnTitle`                | İki adımlı doğrulama: Açık                                                                                                                    |
| `account.security.twoFactor.enableButton`                 | Etkinleştir                                                                                                                                   |
| `account.security.twoFactor.disableButton`                | Devre dışı bırak                                                                                                                              |
| `account.security.twoFactor.regenerateBackupCodesButton`  | Yeni yedek kodlar oluştur                                                                                                                     |
| `account.security.twoFactor.disableConfirmTitle`          | İki adımlı doğrulamayı devre dışı bırak                                                                                                       |
| `account.security.twoFactor.disableConfirmBody`           | 2FA'yı devre dışı bırakırsanız hesabınız yalnızca şifreyle korunur. Devam edilsin mi?                                                         |
| `account.security.twoFactor.regenerateConfirmBody`        | Yeni kodlar oluşturursanız eski yedek kodlarınız artık çalışmaz. Devam edilsin mi?                                                            |
| `auth.twoFactor.setupPasswordLabel`                       | Şifreniz                                                                                                                                      |
| `auth.twoFactor.setupPasswordHelp`                        | Güvenliğiniz için şifrenizi tekrar girmenizi istiyoruz.                                                                                       |
| `auth.twoFactor.setupContinue`                            | Devam et                                                                                                                                      |
| `auth.twoFactor.manualKeyLabel`                           | Manuel anahtar                                                                                                                                |
| `auth.twoFactor.manualKeyInstructions`                    | Authenticator uygulamanızda hesap ekleyin, "manuel giriş" seçin, bu anahtarı yapıştırın.                                                      |
| `auth.twoFactor.showUriToggle`                            | Bağlantıyı göster (gelişmiş kullanıcılar için)                                                                                                |
| `auth.twoFactor.copyButton`                               | Kopyala                                                                                                                                       |
| `auth.twoFactor.copiedStatus`                             | Kopyalandı                                                                                                                                    |
| `auth.twoFactor.codeInputLabel`                           | Doğrulama kodu                                                                                                                                |
| `auth.twoFactor.verifyButton`                             | Doğrula                                                                                                                                       |
| `auth.twoFactor.backupCodesTitle`                         | Bunlar yedek kodlarınız — bir daha gösterilmeyecek.                                                                                           |
| `auth.twoFactor.backupCodesSavedCheckbox`                 | Bu kodları güvenli bir yere kaydettim                                                                                                         |
| `auth.twoFactor.backupCodesCopyAll`                       | Tümünü kopyala                                                                                                                                |
| `auth.twoFactor.backupCodesDownload`                      | Metin dosyası indir                                                                                                                           |
| `auth.twoFactor.setupDoneButton`                          | Bitti                                                                                                                                         |
| `auth.twoFactor.challengeTimeRemaining`                   | Kalan süre: {dakika}:{saniye}                                                                                                                 |
| `auth.twoFactor.useBackupCodeLink`                        | Kodunuz yok mu? Yedek kod kullanın                                                                                                            |
| `auth.twoFactor.useAuthenticatorLink`                     | Authenticator kodunu kullan                                                                                                                   |
| `auth.twoFactor.backupCodeInputLabel`                     | Yedek kod                                                                                                                                     |
| `auth.twoFactor.backToSignIn`                             | Girişe dön                                                                                                                                    |
| `account.security.twoFactor.wallTitle`                    | Bu bölüm için iki adımlı doğrulama gerekli.                                                                                                   |
| `account.security.twoFactor.wallCta`                      | Şimdi kur                                                                                                                                     |
| `account.security.twoFactor.wallBackToPanel`              | Panele dön                                                                                                                                    |
| `account.security.twoFactor.bannerTitle`                  | Hesabınız için iki adımlı doğrulama gerekiyor.                                                                                                |
| `tenant.security.requireOwnerTwoFactorLabel`              | Owner için iki adımlı doğrulamayı zorunlu kıl                                                                                                 |
| `tenant.security.requireOwnerTwoFactorEnabledNote`        | Bu ayarı açtığınızda, iki adımlı doğrulaması olmayan diğer mağaza sahipleri bir sonraki girişlerinde bunu tamamlamaları için yönlendirilecek. |
| `tenant.security.requireOwnerTwoFactorDisableConfirmBody` | Bu ayarı kapatırsanız mağaza sahipleri iki adımlı doğrulama olmadan panele erişebilir. Devam edilsin mi?                                      |

**Örnek (sahte) `otpauth://` URI'si — gerçek sır değil, açıkça örnek:**

```
otpauth://totp/Arkesoft:ornek%40magaza.com?secret=ORNEKSAHTEGIZLIANAHTAR234567&issuer=Arkesoft&algorithm=SHA1&digits=6&period=30
```

Manuel anahtar (aynı sahte değer, okunabilir gruplanmış — gruplama genişliği `ui`'nin
kararı, burada yalnızca okunabilirlik gereksinimi var): `ORNK SAHT EGIZ LIAN AHTA R234 567`

## Erişilebilirlik niyeti

- **Odak yönetimi, mevcut desenle tutarlı.** `_auth.sign-in.tsx`'teki kanıtlanmış
  örüntü (`headingRef` + `tabIndex={-1}` + mount'ta `focus()`) her adım/ekran
  geçişinde **tekrarlanır**: kullanıcı Adım 1'den Adım 2'ye geçtiğinde odak yeni
  adımın başlığına taşınır, ekran okuyucu yeni bağlamı duyurur.
- **Hata mesajları, mevcut desenle tutarlı.** Form gönderim hataları
  `role="alert"` kutusunda (sign-in ekranındaki AYNI desen) — yeni bir canlı bölge
  türü icat edilmiyor. Alan bazlı hatalar (`Input`'un `error` prop'u, zaten
  `aria-invalid`/`aria-describedby` taşıyan mevcut bileşen) kullanılır.
- **Kod girişi klavyeyle tam kullanılabilir:** tek metin alanı, `Tab` ile gelinir,
  karakterler normal yazılır, `Enter` formu gönderir (ekstra `keydown` yönetimi
  yazılmaz — tarayıcı/form varsayılanı).
- **Geri sayım, canlı bölge spamı üretmez.** Kalan süre görseli her saniye güncellenir
  ama **ekran okuyucuya her saniye duyurulmaz** — bu WCAG 4.1.3 (durum mesajları)
  açısından gürültü olurdu. Yalnızca iki eşikte `role="status"` (polite) güncellenir:
  kalan 60 saniyeye düştüğünde ("Doğrulama süreniz 1 dakika içinde dolacak") ve 0'a
  ulaştığında ("Doğrulama süreniz doldu"). Aradaki her saniyelik görsel güncelleme
  `aria-hidden` bir öğede kalır.
- **Yedek kodlar gerçek bir liste.** `<ol>`/`<li>` kullanılır (sıra numarası anlamlı
  olmasa da) — ekran okuyucu "liste, N öğe" ve konumunu ("öğe 3/N") duyurur; `div`
  yığını değil.
- **Kopyalama geri bildirimi `role="status"`, hata değil.** "Kopyalandı" metni
  `aria-live="polite"` bir bölgede belirir — `role="alert"` kullanılmaz çünkü bu bir
  hata değil, bir onay.
- **Banner kapatılamaz ama engelleyici değil.** `role="region"` + `aria-label`
  taşıyan, sayfa akışının **dışında** (modal odak kilidi yok) bir şerit; ilk
  göründüğünde bir kez `role="status"` ile duyurulur, sonraki sayfa geçişlerinde
  tekrar tekrar duyurulmaz (aynı banner DOM'da kalıyorsa).
- **Duvar (tam sayfa interstitial) kendi `h1`'ini taşır** ve mount'ta odağı alır —
  T-009'daki "her sayfa tam olarak bir `h1`" disipliniyle tutarlı.
- **Anahtar (toggle) kontrolü gerçek bir switch/checkbox rolü taşır**, erişilebilir
  adı görünür etiketle birebir ("Owner için iki adımlı doğrulamayı zorunlu kıl").
  409 reddi anahtarın **yanındaki** hata metnine `aria-describedby` ile bağlanır —
  ekran okuyucu kullanıcısı "neden geri döndü" bağlantısını kaçırmaz.
- **Renk kontrastı** bu belgede hesaplanmadı (bu turda `ui` koşmuyor, renk/token
  kararı yok) — v0.1.0'da `ui`/`wcag` T-009'daki ölçüm disipliniyle (WCAG bağıl
  parlaklık formülü, yaklaşıklık işaretsiz) doğrulamalı.
