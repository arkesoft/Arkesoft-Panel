# T-021 — UX: Süper admin iskeleti

> **Kapsam notu.** Bu belge ROADMAP v0.0.20'nin (T-021/S2) süper admin akışını tasarlar.
> `apps/superadmin` bugün 8 dosyalık boş bir iskelet — burada tasarlanan her şey
> sıfırdan doğacak bir SPA'nın akışıdır. `docs/ux/T-016-iki-faktorlu-dogrulama.md` ve
> `docs/ux/T-017-oturum-listesi-ve-step-up.md` emsal alındı (microcopy mekanizması,
> odak deseni, `Input.error`/liste semantiği kararları) — o belgeler **değiştirilmedi**,
> 2FA kurulum mekanizmasının kendisi (şifre onayı → kod → yedek kodlar) buradan **birebir
> yeniden kullanılır**, bu belge onu tekrar tasarlamaz.

## Ölçülmüş gerçekler ve bu belgenin okuma biçimi

Üç kaynak var: (1) `ADR-0023` ve `T-021`'in `architect` bölümünün yazılı kararları,
(2) bugünkü kod/şema okunarak ölçülen, (3) bu belgenin kendi **KARAR** etiketli tasarım
seçimi. Akışa doğrudan etkisi olanlar:

| Bulgu                                                                                                                                                                                     | Kaynak                                    | Akışa etkisi                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform_admin` yetkisi **kiracı rolü değildir**, ayrı bir platform kaydıdır; oturum bunu taşımaz, **her istekte okunur**                                                                | ADR-0023 §1, §2                           | Giriş ekranı kimlik bilgilerini doğrular, yetkiyi doğrulamaz — yetki kararı girişten **sonra**, `platform.session` çağrısında netleşir                                |
| Kapı iki basamaklı ve **sıralı**: önce platform kaydı (yoksa 403 `PLATFORM_ADMIN_REQUIRED`), sonra kişisel 2FA (kapalıysa 403 `TWO_FACTOR_REQUIRED`)                                      | ADR-0023 §2                               | Üç farklı 403'ün ikisi burada doğar; üçüncüsü (IP) ayrı bir katman                                                                                                    |
| `platform.session` **kapı dışında** — yalnızca çağıranın kendi durumunu (`isPlatformAdmin`, `twoFactorEnabled`) döner, sıfır kiracı verisi taşır                                          | T-021 architect, `tRPC` bölümü            | İstemci bu çağrıyı **ilk** yapar ve üç duruma (yetkisiz / 2FA gerekli / geçerli) göre dallanır — çoğu durumda gerçek bir 403'e hiç düşmeden doğru ekranı gösterir     |
| IP kısıtlama guard'ı **ayrı bir katman**, birincil yetkilendirme değil; liste boşsa yüzeyin tamamı kapalı (fail-closed, varsayılan)                                                       | ADR-0023 §5                               | Bu red giriş **öncesinde veya sonrasında** oluşabilir — bu belge ikisini de tek bir tam sayfa duruma eşler, tam hangi uçta tetiklendiğini (backend kararı) sabitlemez |
| Kiracı tablosu platform seviyesi (`slug`/`durum`/`oluşturulma` GUC'suz okunur), `plan` kolonu **kiracı kapsamlı** (`subscription`) ⇒ listenin yalnızca bu sütunu impersonation gerektirir | T-021 architect §①                        | Liste tek ekran, ama sunucu tarafı iki farklı okuma yolunu birleştirir — kullanıcıya bu fark **görünmez**, görünse de bir anlamı olmaz                                |
| Aktör e-postası tele çıkmaz, yalnızca `actorUserId`; `detail` JSON'ı (kiracı kimlikleri) tele çıkmaz                                                                                      | T-021 architect, `tRPC` bölümü, madde 4-5 | Denetim listesi aktörü e-posta/ad ile **gösteremez** — bu bir eksiklik değil, yazılı bir sınır; metin bunu gizlemeden kabul eder                                      |
| `TenantStatus` = `pending` / `provisioning` / `active` / `suspended` (`deleted` yok)                                                                                                      | `schema.prisma:949-956`                   | Durum sütununun dört değeri sabit, beşinci bir "silindi" durumu **yok**                                                                                               |

**VARSAYIM (bu belgenin okuma biçimi, `backend`/`S5`-`S7` kesinleştirecek):** IP guard'ı
`platform.*` tRPC yollarını kapsıyor, ama giriş (`/auth/sign-in/email`) ve 2FA doğrulama
(`/auth/two-factor/*`) uçları Better Auth'un kendi HTTP yüzeyinden gider ve ADR-0023 §5'in
lafzı ("süper admin **tRPC** yollarında") bunları kapsadığını açıkça söylemiyor. Bu belge
bu VARSAYIM'la tasarlandı: giriş ve 2FA kod ekranları IP guard'ından **etkilenmez
görünür**; red, oturum kurulduktan hemen sonraki ilk `platform.*` çağrısında (çoğunlukla
`platform.session`) ortaya çıkar. VARSAYIM yanlışsa (guard giriş uçlarını da kapsarsa) bu
belgenin IP-red durumu login ekranının **kendisinde** de aynı metinle gösterilir — tasarım
değişmez, yalnızca tetiklenme noktası değişir.

## Hedef kullanıcı

**Arkesoft'un kendi iç ekibi — platform yöneticisi.** Bu, panelin diğer tüm UX
belgelerinden farklı bir hedef kullanıcı: teknik bilgisi olmayan bir KOBİ sahibi
**değil**, kendi altyapısını tanıyan bir operasyon/mühendislik kullanıcısı. Bu yüzden
metinler "tenant", "impersonation", "GUC" gibi kelimeleri **sistem mesajlarında** (ör. IP
red metni) kullanabilir — ama kullanıcıyı suçlayıcı bir dille karşılamaz ve hiçbir zaman
sahip olunmayan bir bilgiyi (ör. izinli IP listesinin içeriği) ifşa etmez. Bu kullanıcının
üç farklı anda karşılaşabileceği üç ayrı "giremiyorum" durumu var ve bu üçü net ayrılmazsa
teşhis süresi büyür — bu belgenin en kritik işi tam olarak bu üçünü ayırmak.

## Ekranlar ve rotalar

| #   | Ekran                                               | Rota (öneri)                                               | Oturum                                           | Ne zaman görünür                                           |
| --- | --------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| 1   | **Giriş**                                           | `/giris`                                                   | Yok                                              | Uygulama açıldığında, oturum yoksa                         |
| 2   | **2FA doğrulama (giriş sırasında)**                 | `/giris` (aynı rota, 2. adım)                              | Challenge çerezi var, oturum yok                 | Girişte kullanılan hesabın **kişisel** 2FA'sı zaten açıksa |
| 3   | **2FA kurulum yönlendirmesi** (duvar + yönlendirme) | `/iki-adimli-dogrulama`                                    | Var (platform yöneticisi, kişisel 2FA'sı kapalı) | `platform.session` `twoFactorEnabled:false` döndüğünde     |
| 4   | **Kiracı listesi**                                  | `/` (ana sayfa)                                            | Var (platform yöneticisi, 2FA açık)              | Giriş tamamlandığında, varsayılan sayfa                    |
| 5   | **Platform denetim kaydı**                          | `/denetim-kaydi`                                           | Var                                              | Kullanıcı kabuktaki ilgili bağlantıya tıkladığında         |
| 6   | **Kabuk**                                           | Tüm korumalı rotaların ortak katmanı                       | Var                                              | 4 ve 5'in her ikisinde de her zaman görünür                |
| —   | **Yetkisiz** (platform yöneticisi değil)            | Herhangi bir korumalı rotada render edilen tam sayfa durum | Var ama yetkisiz                                 | `platform.session` `isPlatformAdmin:false` döndüğünde      |
| —   | **Ağ erişimi reddedildi** (IP)                      | Herhangi bir noktada render edilebilen tam sayfa durum     | Belirsiz (yukarıdaki VARSAYIM)                   | IP guard reddettiğinde                                     |

Ekran 3, 4, 5 **kabuk** içinde render edilir (Ekran 6) — kabuk ekranları değiştirmez,
etrafını sarar (navigasyon + kimlik göstergesi + çıkış). "Yetkisiz" ve "Ağ erişimi
reddedildi" durumları kabuğun **dışında** render edilir (navigasyon gösterilmez — henüz
hangi bağlantıların anlamlı olduğu bilinmiyor/erişilebilir değil).

## Mutlu yol

### A. Platform yöneticisinin kişisel 2FA'sı zaten açık (en sağlıklı yol)

1. Kullanıcı `/giris`'e gelir, e-posta + parola girer, "Giriş yap"a basar.
2. Sunucu 200 döner, gövdede `twoFactorRedirect:true` varsa (kullanıcının **kişisel**
   2FA'sı açık — bu platform yetkisinden bağımsız bir hesap ayarı) ekran aynı sayfada
   kod girme durumuna geçer, odak kod alanına taşınır.
3. Kullanıcı authenticator uygulamasındaki 6 haneli kodu girer, doğrular. Oturum kurulur.
4. İstemci `platform.session`'ı çağırır. `isPlatformAdmin:true`, `twoFactorEnabled:true`
   dönerse kullanıcı Kiracı listesine (`/`) yönlendirilir, kabuk görünür.

### B. Platform yöneticisi ama kişisel 2FA'sını henüz hiç kurmamış

1. Adım 1 aynı — e-posta + parola, "Giriş yap".
2. Sunucu 200 döner, `twoFactorRedirect` **yok** (kişisel 2FA kapalı) — oturum doğrudan
   kurulur, ikinci bir kod adımı **görünmez**.
3. İstemci `platform.session`'ı çağırır. `isPlatformAdmin:true`, `twoFactorEnabled:false`
   dönerse kullanıcı `/iki-adimli-dogrulama` duvarına yönlendirilir.
4. Duvarda "Kurulumu başlat" düğmesine basar — T-016'nın kurulum mekanizması (şifre
   onayı → authenticator bağlama + kod → yedek kodlar) **birebir** açılır; bu belge onu
   yeniden anlatmaz.
5. Kurulum tamamlanınca `platform.session` yeniden okunur, `twoFactorEnabled:true`
   olduğu görülür, kullanıcı otomatik olarak Kiracı listesine yönlendirilir.

### C. Kiracı listesini görüntüleme ve denetim kaydına geçiş

1. Kiracı listesi varsayılan açılış sayfası — dört sütun (ad, adres, plan, durum) +
   oluşturulma tarihi, sayfa boyutu üst sınırı 50 (architect kararı).
2. Kullanıcı kabuktaki "Denetim kaydı" bağlantısına basar, `/denetim-kaydi`'ne gider.
3. Kendi girişinin ve (varsa) az önceki liste görüntülemesinin ürettiği kayıtları görür —
   en yeni en üstte.
4. "Çıkış yap"a bastığında oturum sonlanır, `/giris`'e döner — onay istenmez (bkz.
   Yıkıcı işlemler).

### D. Platform yöneticisi olmayan biri yanlışlıkla bu panele girmeye çalışırsa

1. Geçerli bir e-posta/parola ile (kimliği doğru, yetkisi yok) giriş yapar — gerekirse
   kendi kişisel 2FA'sı varsa onu da tamamlar, oturum kurulur.
2. İstemci `platform.session`'ı çağırır, `isPlatformAdmin:false` döner.
3. Kullanıcı tam sayfa "Yetkisiz" durumuyla karşılanır — **eylem yok**, navigasyon yok,
   tekrar giriş önerilmez (bkz. "Üç 403" bölümü).

## ⚠⚠ Üç ayrı 403'ün ayrı görünümü

Bu panelin en kritik tasarım kararı. Üçü de 403 döner ama üçü **farklı kullanıcı
durumunu** anlatır — aynı ekranı göstermek teşhisi imkânsız kılar.

| #   | Kod                                                                             | Kullanıcının gerçek durumu                                    | Ekranda görünen başlık                                         | Eylem var mı                                                                    | "Tekrar giriş yap" önerilir mi                                                          |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | `PLATFORM_ADMIN_REQUIRED`                                                       | Giriş yaptı, kimliği doğru, ama platform yöneticisi **değil** | "Bu panele erişim yetkiniz yok"                                | **Hayır**                                                                       | **Hayır, kesinlikle** — kimlik doğru, eksik olan yetki; tekrar giriş aynı sonucu üretir |
| 2   | `TWO_FACTOR_REQUIRED`                                                           | Platform yöneticisi **ama** kişisel 2FA'sı kapalı             | "Devam etmeden önce iki adımlı doğrulamayı kurmanız gerekiyor" | **Evet** — "Kurulumu başlat"                                                    | Hayır gerekmiyor — zaten oturum açık, tek adım kurulum                                  |
| 3   | (IP guard, kod öneri: `PLATFORM_NETWORK_NOT_ALLOWED` — backend kesinleştirecek) | Doğru kişi, **yanlış ağdan** bağlanıyor                       | "Bu paneli bulunduğunuz ağdan açamazsınız"                     | **Hayır** (kullanıcı tarafında yapılacak bir şey yok) ama **teşhis edilebilir** | Hayır — ağ değişmeden sonuç değişmez                                                    |

**Üçünün metni birbirine asla karışmaz** — hiçbiri diğerinin kelimelerini ödünç almaz,
çünkü üçü de farklı bir "ne yapmalıyım" sorusuna cevap verir: 1 → kimseye bir şey
yapmayın, yöneticinizle konuşun; 2 → hemen kurulumu tamamlayın; 3 → ağınızı değiştirin
veya operasyon ekibinize sorun.

### Üçüncüsü üzerine ek not — sır sızdırmadan teşhis

`SUPERADMIN_IP_ALLOWLIST` boşken panelin **tamamı** fail-closed kapalıdır (varsayılan
davranış, bir arıza değil). Operatör bunu bilmezse "panel çalışmıyor" teşhisi sessiz bir
403'e düşer. Bu yüzden metin **hangi ortam değişkenine bakılacağını** söyler, ama o
değişkenin **içeriğini** (izinli IP'leri) asla yazmaz:

> "Bu paneli bulunduğunuz ağdan açamazsınız. Erişim, `SUPERADMIN_IP_ALLOWLIST` ortam
> değişkeniyle sınırlandırılmış olabilir — bu değişken boşsa panel tüm ağlardan kapalıdır.
> Operasyon ekibinizle bu ayarı doğrulayın."

Bu metin hangi IP'lerin izinli olduğunu **söylemez**, yalnızca nereye bakılacağını söyler.

## Ekran durumları

### 1. Giriş

| Durum            | Kullanıcı ne görür                                                                                                                                                                                                                   | Eylemler                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| **Normal**       | E-posta + parola alanları, "Giriş yap" düğmesi. (Panelin iç kullanıcıları için "hesap oluştur"/"parolamı unuttum" bağlantıları bu sürümde **yok** — platform yöneticiliği kayıttan değil, elle açılan bir platform kaydından gelir.) | Formu doldurur, gönderir.        |
| **Gönderiliyor** | Düğme "Giriş yapılıyor…" durumuna geçer, alanlar salt okunur, çift gönderim engellenir.                                                                                                                                              | Yok.                             |
| **Boş**          | N/A — form veri çekmez.                                                                                                                                                                                                              | —                                |
| **Hata**         | Aşağıdaki Hata durumları tablosuna göre alan/form seviyesi hata.                                                                                                                                                                     | Alanı düzeltir, tekrar gönderir. |

### 2. 2FA doğrulama (giriş sırasında)

| Durum          | Kullanıcı ne görür                                                                                                                                                            | Eylemler                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Normal**     | "Hesabınızı doğrulayın" başlığı + 6 haneli kod alanı + "Doğrula" + "Yedek kod kullanın" bağlantısı + geri sayan bir zaman göstergesi (T-016'nın aynı mekanizması, 10 dakika). | Kod girer, doğrular veya yedek koda geçer. |
| **Yükleniyor** | "Doğrula" düğmesi `isLoading` durumuna geçer, alan salt okunur.                                                                                                               | Yok.                                       |
| **Boş**        | N/A.                                                                                                                                                                          | —                                          |
| **Hata**       | T-016'nın aynı üç durumu — yanlış kod, deneme aşımı, oturum/challenge süresi doldu — birebir aynı metinlerle (bkz. Microcopy).                                                | "Girişe dön" veya tekrar dener.            |

### 3. 2FA kurulum yönlendirmesi (duvar)

| Durum          | Kullanıcı ne görür                                                                                                                                                                                                                                                                                                                                                     | Eylemler                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Normal**     | Tam sayfa, kapatılamaz bir durum: başlık + açıklama (_"Platform verisine erişebilmek için önce kendi hesabınızda iki adımlı doğrulamayı kurmanız gerekiyor."_) + "Kurulumu başlat" düğmesi.                                                                                                                                                                            | "Kurulumu başlat" → T-016'nın 3 adımlı kurulum mekanizması açılır (bu belgenin kapsamı dışı, aynen devralınır). |
| **Yükleniyor** | `platform.session` henüz dönmediyse bu ekran **hiç gösterilmez** — kabuk kendi yükleniyor durumunda kalır (T-016 Ekran 9'un "erken yanlış pozitif göstermeyelim" kararıyla aynı mantık).                                                                                                                                                                               | Yok.                                                                                                            |
| **Boş**        | N/A — bu ekran veri listesi değil, tek bir durumun (2FA kapalı) görünümü.                                                                                                                                                                                                                                                                                              | —                                                                                                               |
| **Hata**       | `platform.session` ağ/sunucu hatasıyla başarısız olursa bu duvar **da** gösterilmez — bunun yerine genel "Bir şeyler ters gitti" tam sayfa durumu gösterilir (aşağıdaki Kabuk tablosuna bkz.) çünkü kullanıcının gerçekten 2FA'sı kapalı mı yoksa yetkisi mi yok bilinmiyor; fail-closed varsayım burada "bilmiyorum" demektir, "2FA kurman gerekiyor" demek değildir. | "Yeniden dene".                                                                                                 |

### 4. Kiracı listesi

| Durum          | Kullanıcı ne görür                                                                                                                 | Eylemler                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Normal**     | Tablo/kart: Mağaza adı, Adres (slug), Plan, Durum (dört değerden biri), Oluşturulma tarihi. Satır sayısı sayfa başına en fazla 50. | Listeyi görüntüler (bu sürümde arama/filtre/sıralama **yok** — salt okunur, kapsam bunu istemiyor). |
| **Yükleniyor** | Beş iskelet satırı.                                                                                                                | Yok.                                                                                                |
| **Boş**        | Platformda hiç mağaza yoksa: "Henüz hiç mağaza oluşturulmamış." — bir eylem önerilmez (bu panel mağaza oluşturmaz).                | —                                                                                                   |
| **Hata**       | "Mağaza listesi şu anda yüklenemedi." + "Yeniden dene".                                                                            | "Yeniden dene".                                                                                     |

**KARAR — "Mağaza adı" sütunu task'ın yazılı dört alanına bir ekleme.** Görev tanımı
`slug`/`plan`/`durum`/`oluşturulma`'yı listeliyor; bu belge okunabilirlik için "Mağaza
adı"nı da ekliyor çünkü yalnızca `slug`'a bakarak bir mağazayı tanımak operasyon
ekibi için gereksiz bir ek adım. `architect`'in tRPC çıktısı (`name` alanı) bunu zaten
taşıyor — yeni bir sunucu değişikliği gerektirmiyor. `po`/`ui` bu eklemeyi reddedebilir,
kalan dört sütun değişmez.

### 5. Platform denetim kaydı

| Durum          | Kullanıcı ne görür                                                                                                                                                                                                                                                                                                                                                         | Eylemler                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Normal**     | Liste: Aktör (kullanıcı kimliği — e-posta **gösterilmez**, bkz. not aşağıda), Eylem (ör. "Giriş yaptı" / "Kiracı verisine erişti"), Konu, Zaman. En yeni en üstte.                                                                                                                                                                                                         | Listeyi görüntüler (bu sürümde filtre yok). |
| **Yükleniyor** | Beş iskelet satırı.                                                                                                                                                                                                                                                                                                                                                        | Yok.                                        |
| **Boş**        | N/A — bu listeyi görüntülemek için zaten giriş yapılmış olmak gerekiyor ve her giriş kendi kaydını üretiyor (bkz. Ölçülmüş gerçekler); yapısal olarak sıfır satır **beklenmez**. Gerçekleşirse (örn. kayıt yazımı başarısız olduysa) bu bir "boş" değil bir **hata**dır ve ayrı bir uyarıyla ele alınmaz — liste sessizce az sayıda satır gösterir, kullanıcıyı yanıltmaz. | —                                           |
| **Hata**       | "Denetim kaydı şu anda yüklenemedi." + "Yeniden dene".                                                                                                                                                                                                                                                                                                                     | "Yeniden dene".                             |

**Not — aktör neden e-posta değil.** `platform.auditLog` yalnızca `actorUserId` döner,
e-posta tele hiç çıkmaz (architect kararı, maskeleme tartışması bu yüzden hiç doğmuyor).
Ekranda aktör sütunu bu kimliği **olduğu gibi** gösterir — kısaltılmış/süslenmiş bir ad
**uydurulmaz**. Bu bir kusur değil, yazılı bir sınır; metin bunu gizlemez.

**Not — eylem etiketleri öneri, backend kesinleştirecek.** `PlatformAuditAction` iki
değer taşıyor (AC-8'in saydığı ikisi: giriş ve kiracı verisine erişim/impersonation
başlangıcı). Bu belge öneri etiketler kullanıyor ("Giriş yaptı" / "Kiracı verisine
erişti") — gerçek enum adları backend'den geldiğinde `frontend`/`docs` bu eşlemeyi
teyit etmeli.

### 6. Kabuk

| Durum                             | Kullanıcı ne görür                                                                                                                                                                                               | Eylemler              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **Normal**                        | Üstte/yanda navigasyon ("Kiracılar", "Denetim kaydı"), kimlik göstergesi (giriş yapan kullanıcının e-postası), "Çıkış yap" düğmesi.                                                                              | Gezinir, çıkış yapar. |
| **Yükleniyor**                    | `platform.session` dönene kadar navigasyon **render edilmez** — hangi bağlantıların geçerli olduğu henüz bilinmiyor; yalnızca bir yükleniyor göstergesi görünür.                                                 | Yok.                  |
| **Boş**                           | N/A — kabuk her zaman ya bir ekranı ya bir hata durumunu sarar.                                                                                                                                                  | —                     |
| **Hata (genel, kimlik belirsiz)** | `platform.session` ağ/sunucu hatasıyla başarısız olursa: tam sayfa "Bir şeyler ters gitti. Lütfen tekrar deneyin." + "Yeniden dene" — navigasyon **gösterilmez** (kullanıcının yetkisi bilinmiyor, fail-closed). | "Yeniden dene".       |

## Hata durumları

| Durum                                                        | Ne oldu                                                                                                                                                    | Kullanıcı ne görür                                                                                                                          | Nasıl kurtulur                                                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **E-posta/parola hatalı (401 `INVALID_EMAIL_OR_PASSWORD`)**  | Kimlik bilgileri yanlış (var olmayan hesap ile yanlış parola **aynı** cevabı üretir — kullanıcı sayımı engellenir, admin panelinin mevcut deseniyle aynı). | "E-posta veya parola hatalı."                                                                                                               | Bilgileri düzeltir.                                                                                 |
| **429 çok fazla deneme (giriş)**                             | Oran sınırı aşıldı.                                                                                                                                        | "Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin."                                                                      | Birkaç dakika bekler.                                                                               |
| **Ağ/bilinmeyen hata (giriş)**                               | İstek sunucuya ulaşmadı.                                                                                                                                   | "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin."                                                                   | Tekrar dener.                                                                                       |
| **Yanlış 2FA kodu**                                          | Girilen kod hatalı.                                                                                                                                        | "Kod doğrulanamadı. Uygulamanızdaki güncel kodu girin."                                                                                     | Tekrar dener.                                                                                       |
| **2FA deneme aşımı / kilit / süresi doldu**                  | T-016'nın aynı üç durumu.                                                                                                                                  | T-016'nın aynı üç metni (bkz. o belge, "Hata durumları").                                                                                   | "Girişe dön".                                                                                       |
| **403 `PLATFORM_ADMIN_REQUIRED`**                            | Giriş yapan kişi platform yöneticisi değil.                                                                                                                | "Bu panele erişim yetkiniz yok. Bu panel yalnızca platform yöneticileri içindir." — **tekrar giriş önerisi yok, hiçbir eylem düğmesi yok.** | Yok — kullanıcı bir yöneticiyle iletişime geçmeli (bu panelin dışında).                             |
| **403 `TWO_FACTOR_REQUIRED` (platform kapısı)**              | Platform yöneticisi ama kişisel 2FA'sı kapalı.                                                                                                             | "Devam etmeden önce iki adımlı doğrulamayı kurmanız gerekiyor." + "Kurulumu başlat"                                                         | Kurulumu tamamlar.                                                                                  |
| **403 (IP guard, öneri kod `PLATFORM_NETWORK_NOT_ALLOWED`)** | Doğru kimlik, izinli olmayan ağ.                                                                                                                           | "Bu paneli bulunduğunuz ağdan açamazsınız." + yukarıdaki ortam değişkeni ipucu.                                                             | Ağ değiştirir veya operasyon ekibine bildirir — kullanıcının kendi başına yapabileceği bir şey yok. |
| **Kiracı listesi yüklenemedi**                               | Ağ/sunucu hatası.                                                                                                                                          | "Mağaza listesi şu anda yüklenemedi." + "Yeniden dene".                                                                                     | "Yeniden dene".                                                                                     |
| **Denetim kaydı yüklenemedi**                                | Ağ/sunucu hatası.                                                                                                                                          | "Denetim kaydı şu anda yüklenemedi." + "Yeniden dene".                                                                                      | "Yeniden dene".                                                                                     |
| **`platform.session` yüklenemedi**                           | Ağ/sunucu hatası — kimlik/yetki durumu belirsiz.                                                                                                           | "Bir şeyler ters gitti. Lütfen tekrar deneyin." (navigasyon gösterilmeden)                                                                  | "Yeniden dene".                                                                                     |

## Yıkıcı işlemler

Bu kapsamda klasik anlamda bir silme/iptal/yayından kaldırma **yok** — liste salt okunur,
kiracı verisi görüntülenir ama değiştirilmez.

| İşlem                                                 | Yıkıcı mı                                                                                                                                                                                                                                                                                | Onay gerekir mi                                                                                                  | Geri alınabilir mi                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| "Çıkış yap"                                           | Hayır (klasik anlamda) — oturumu sonlandırır, veri silmez.                                                                                                                                                                                                                               | **Hayır** — anında çıkış yapılır, tekrar giriş trivial bir işlem; ek bir onay diyaloğu gereksiz sürtünme olurdu. | Evet — tekrar giriş yaparak.                                             |
| Kiracı listesini görüntüleme (impersonation tetikler) | Hayır, kullanıcı için görünür bir yıkıcılığı yok — ama **iz bırakan** bir işlemdir (denetim kaydı yazılır). Kullanıcı bunun farkında olmalı; bu farkındalık "Denetim kaydı" sayfasının her zaman erişilebilir bir navigasyon öğesi olmasıyla sağlanır, ayrı bir uyarı diyaloğuyla değil. | Hayır.                                                                                                           | N/A — görüntüleme eylemi geri alınacak bir şey değil, kaydı da silinmez. |

Bu belgenin kapsamında kiracı verisini **değiştiren** hiçbir eylem yok (düzenleme, askıya
alma, silme) — bunlar bu sürümün dışında.

## Mobil davranış (360px)

- **Giriş / 2FA ekranları:** tek sütun, T-016'nın mevcut giriş formuyla aynı dikey
  istifleme; bu panelin kullanıcı kitlesi operasyon ekibi olduğu için mobil kullanım
  sık değil, ama akış **360px'te kırılmaz**.
- **"Yetkisiz" / "Ağ erişimi reddedildi" / "2FA kurulum yönlendirmesi" duvarları:**
  360px'te tam genişlik, tek sütun, metin satır sarar — kesilip "…" ile kısaltılmaz
  (özellikle IP red metnindeki ortam değişkeni adı tek parça kalmalı, satır ortasından
  bölünmemeli).
- **Kiracı listesi:** 360px'te tablo→kart dönüşümü — her kart: üstte Mağaza adı +
  Durum rozeti aynı satırda, altında Adres (slug), altında Plan, en altta Oluşturulma
  tarihi. Durum **yalnızca renkle** değil, görünür metinle de belirtilir (WCAG 1.4.1 ile
  aynı ilke, T-019/T-016'nın tekrarlanan kararı).
- **Platform denetim kaydı:** 360px'te `<ul>`/`<li>` kart listesi (T-017'nin oturum
  listesiyle aynı mantık — heterojen içerik, tablo değil liste): Aktör kimliği kendi
  satırında, Eylem + Konu aynı satırda, Zaman en altta.
- **Kabuk:** 360px'te navigasyon bir açılır menüye (hamburger) dönüşür; kimlik
  göstergesi ve "Çıkış yap" bu menünün içinde kalır — ayrı bir sabit alt eylem çubuğu
  gerekmiyor (liste kısa, kaydırma sorunu yok — T-017'nin aynı bulgusu).

## Microcopy (i18n anahtarlarıyla)

**Mekanizma kararı (A-T21-4).** `apps/superadmin` kendi `src/messages/messages.ts`
dosyasını taşır — `apps/admin`'inkiyle **aynı mekanizma** (düz `PanelErrorCode → Türkçe
metin` eşlemesi, kapalı dünya) ama **ayrı bir dosya**, çünkü `apps/admin`'e bağımlılık
CLAUDE.md §3'ün yönünü ihlal eder. Aşağıdaki anahtarlar bu yeni dosya için önerilir;
değerler admin'in eşdeğer satırlarıyla **birebir aynı** tutuldu (tutarlılık için), kod
isimleri `PLATFORM_ADMIN_REQUIRED` ve IP red kodu **yeni** (backend kesinleştirecek).

### Giriş ve 2FA (admin'in mevcut katalogundan birebir taşınan değerler)

| Anahtar                                     | Metin                                                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.signIn.title`                         | Giriş yap                                                                                                                              |
| `auth.signIn.emailLabel`                    | E-posta adresi                                                                                                                         |
| `auth.signIn.passwordLabel`                 | Şifre                                                                                                                                  |
| `auth.signIn.submit`                        | Giriş yap                                                                                                                              |
| `auth.signIn.submitting`                    | Giriş yapılıyor…                                                                                                                       |
| `errors.INVALID_EMAIL_OR_PASSWORD`          | E-posta veya parola hatalı.                                                                                                            |
| `errors.RATE_LIMIT_EXCEEDED`                | Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.                                                                   |
| `errors.network`                            | Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.                                                                |
| `auth.twoFactor.codeInputLabel`             | Doğrulama kodu                                                                                                                         |
| `auth.twoFactor.verifyButton`               | Doğrula                                                                                                                                |
| `auth.twoFactor.useBackupCodeLink`          | Kodunuz yok mu? Yedek kod kullanın                                                                                                     |
| `errors.INVALID_CODE`                       | Kod doğrulanamadı. Uygulamanızdaki güncel kodu girin.                                                                                  |
| `errors.TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE` | Bu doğrulama denemesinin süresi doldu. Güvenlik nedeniyle yeniden giriş yapmanız gerekiyor.                                            |
| `errors.ACCOUNT_TEMPORARILY_LOCKED`         | Çok fazla hatalı deneme yapıldı. Hesabınız güvenlik nedeniyle geçici olarak kilitlendi. {dakika} dakika sonra tekrar deneyebilirsiniz. |
| `auth.twoFactor.backToSignIn`               | Girişe dön                                                                                                                             |

### Platform yetkisi ve ağ erişimi — yeni anahtarlar

| Anahtar                              | Metin                                                                                                                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `errors.PLATFORM_ADMIN_REQUIRED`     | Bu panele erişim yetkiniz yok. Bu panel yalnızca platform yöneticileri içindir.                                                                                                                                      |
| `platform.twoFactorWall.title`       | Devam etmeden önce iki adımlı doğrulamayı kurmanız gerekiyor                                                                                                                                                         |
| `platform.twoFactorWall.body`        | Platform verisine erişebilmek için önce kendi hesabınızda iki adımlı doğrulamayı kurmanız gerekiyor.                                                                                                                 |
| `platform.twoFactorWall.startButton` | Kurulumu başlat                                                                                                                                                                                                      |
| `errors.platform.networkNotAllowed`  | Bu paneli bulunduğunuz ağdan açamazsınız. Erişim, `SUPERADMIN_IP_ALLOWLIST` ortam değişkeniyle sınırlandırılmış olabilir — bu değişken boşsa panel tüm ağlardan kapalıdır. Operasyon ekibinizle bu ayarı doğrulayın. |
| `platform.unauthorized.title`        | Bu panele erişim yetkiniz yok                                                                                                                                                                                        |

### Kiracı listesi ve denetim kaydı

| Anahtar                                  | Metin                               |
| ---------------------------------------- | ----------------------------------- |
| `platform.tenantList.title`              | Mağazalar                           |
| `platform.tenantList.columnName`         | Mağaza adı                          |
| `platform.tenantList.columnSlug`         | Adres                               |
| `platform.tenantList.columnPlan`         | Plan                                |
| `platform.tenantList.columnStatus`       | Durum                               |
| `platform.tenantList.columnCreatedAt`    | Oluşturulma                         |
| `platform.tenantList.statusPending`      | Beklemede                           |
| `platform.tenantList.statusProvisioning` | Kuruluyor                           |
| `platform.tenantList.statusActive`       | Aktif                               |
| `platform.tenantList.statusSuspended`    | Askıya alınmış                      |
| `platform.tenantList.emptyTitle`         | Henüz hiç mağaza oluşturulmamış.    |
| `platform.tenantList.loadError`          | Mağaza listesi şu anda yüklenemedi. |
| `platform.auditLog.title`                | Denetim kaydı                       |
| `platform.auditLog.columnActor`          | Aktör                               |
| `platform.auditLog.columnAction`         | Eylem                               |
| `platform.auditLog.columnSubject`        | Konu                                |
| `platform.auditLog.columnCreatedAt`      | Zaman                               |
| `platform.auditLog.actionLogin`          | Giriş yaptı                         |
| `platform.auditLog.actionTenantAccess`   | Kiracı verisine erişti              |
| `platform.auditLog.loadError`            | Denetim kaydı şu anda yüklenemedi.  |

### Kabuk

| Anahtar                  | Metin                                         |
| ------------------------ | --------------------------------------------- |
| `shell.navTenants`       | Mağazalar                                     |
| `shell.navAuditLog`      | Denetim kaydı                                 |
| `shell.signOutButton`    | Çıkış yap                                     |
| `shell.sessionLoadError` | Bir şeyler ters gitti. Lütfen tekrar deneyin. |
| `common.retryButton`     | Yeniden dene                                  |

## ⚠⚠ AC-11 — Negatif kapsam notu (impersonation'ın kullanıcıya dönük yüzeyi)

Impersonation'ın bu sürümde kullanıcıya dönük hiçbir yüzeyi yok: bir **gerekçe** alanı,
bir **süre sınırı** göstergesi ve kiracıda görünür bir **uyarı bandı** — üçü de bu
belgede ve bu akışta TASARLANMADI. Üçü de v0.15.0'ın kapsamına ait; mekanizmanın kendisi
(`runImpersonated`) kullanıcıya hiç görünmez — kiracı listesini görüntülemek tek işlem,
arkasında neler olduğu kullanıcı arayüzünde **hiçbir şekilde** sorulmaz veya gösterilmez.
Bu belge bu üçünün yokluğunu bilerek ve açıkça bırakıyor ki bir sonraki sürüm bu
sahipliği kaybetmesin.

## Erişilebilirlik niyeti — `wcag`'ın elle koşacağı denetim listesi

`@axe-core/playwright` bu sürümde yok (v0.0.20.1'e bırakıldı) — aşağıdaki liste `wcag`'ın
bu **yeni uygulamanın tamamını** elle denetlerken izleyeceği numaralı kontrol listesidir.

1. **Odak sırası — giriş→2FA geçişi.** `/giris`'in form→kod geçişinde odak yeni adımın
   başlığına taşınır (`headingRef`+`tabIndex={-1}`+`focus()`, T-016/T-019'un aynı
   deseni). Hiçbir geçişte odak `<body>`'ye düşmemeli.
2. **Odak sırası — duvar ekranları.** "Yetkisiz", "Ağ erişimi reddedildi" ve "2FA
   kurulum yönlendirmesi" ekranlarının her biri kendi `h1`'ini taşır ve mount'ta odağı
   alır (T-016 Ekran 9'un "duvar kendi h1'ini taşır" kararıyla aynı).
3. **Klavye tuzağı yok.** Giriş formu, 2FA kod alanı, "Kurulumu başlat"/"Yeniden
   dene"/"Çıkış yap" düğmeleri tamamı `Tab` ile erişilir gerçek `<button>`/`<input>`
   öğeleri; hiçbir yerde `div` tabanlı tıklanabilir alan yok.
4. **Etiket↔hata ilişkisi.** Giriş formunun alan hataları (`INVALID_EMAIL_OR_PASSWORD`
   dahil) `Input`'un `error` prop'u üzerinden `aria-invalid`+`aria-describedby` ile
   alana bağlanır — ayrı bir `role="alert"` kutusu değil (T-016/T-017'nin bağlayıcı
   kuralı burada da geçerli). ⚠⚠ **DÜZELTME (`docs`, T-021 gate fazı — bu madde
   `W-3`'ü YANLIŞ tarif ediyordu, `wcag` tur 1/tur 2'de düzeltti):** gerçek `W-3`
   (`ROADMAP.md:3244`, `T-019.md:1442`) bu eksenle **ilgisiz** — **2.5.8 Hedef
   Boyutu**'dur: "Yedek kod kullanın"/"Kimlik doğrulayıcı kullanın" bağlantısının
   dokunma alanı 24×24px altında (yalnızca küçük `font-size`, dolgu/`min-height` yok).
   Etiket↔hata ilişkisi ekseni (`aria-invalid`/`aria-describedby`) **ayrı ve zaten
   temiz** bir eksendir, `W-3` ile **karıştırılmamalı**.
5. **Ekran okuyucu — durum/eylem ayrımı.** "Yetkisiz" ekranında eylem düğmesi **yok**
   kararı ekran okuyucu için de geçerli olmalı — sayfada odaklanabilir ama işlevsiz bir
   kontrol **bırakılmamalı** (T-019'un "Yakında" rozeti kararıyla aynı ilke: işlevsiz bir
   şey odaklanabilir olmamalı).
6. **Durum bilgisi renkle tek başına iletilmez (WCAG 1.4.1).** Kiracı listesindeki Durum
   sütunu her zaman görünür metin taşır (Beklemede/Kuruluyor/Aktif/Askıya alınmış),
   renk/rozet yalnızca metnin yanında.
7. **Liste semantiği.** Platform denetim kaydı `<ul>`/`<li>` (360px'te doğal kart
   görünümüne dönüşür, T-017'nin aynı deseni) — `<table>` zorlaması yok, heterojen
   içerik (aktör+eylem+konu+zaman) liste olarak daha doğru okunur.
8. **Kontrast WCAG AA.** Bu belge renk/token kararı vermez (o `ui`'nin işi) — ama her
   metin önerisinin (özellikle üç 403 durumunun başlıkları) seçilen renk jetonlarıyla
   birlikte okunabilir olması gerektiğini burada tekrar not eder; gerçek ölçüm `wcag`'ın
   ve sonraki `ui` turunun işi.
9. **Canlı bölge gürültüsü yok.** 2FA kod ekranındaki geri sayım T-016'daki aynı
   disiplinle çalışır: her saniye görsel güncellenir ama ekran okuyucuya yalnızca iki
   eşikte (kalan 60 saniye ve 0) `role="status"` ile duyurulur.
10. **Kabuk navigasyonu erişilebilir ad taşır.** "Mağazalar"/"Denetim kaydı" bağlantıları
    gerçek `<a>`/router bağlantıları, görünür metinleri erişilebilir adlarıyla aynı;
    aktif rota `aria-current="page"` ile işaretlenir.
