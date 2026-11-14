# T-019 — UX: Kayıt sihirbazı ve onboarding kontrol listesi

> **Kapsam notu.** Bu belge ROADMAP v0.1.0'ın (T-019) kayıt sihirbazı + onboarding kontrol
> listesi ekranlarını tasarlar. `docs/ux/T-016-iki-faktorlu-dogrulama.md` ve
> `docs/ux/T-017-oturum-listesi-ve-step-up.md` emsal alındı (microcopy mekanizması, odak
> deseni, `Input.error` kuralı, liste semantiği kararları) — o belgeler değiştirilmedi.
> En yakın bileşen/akış emsali `apps/admin/src/features/two-factor/TwoFactorSetupWizard.tsx`
> (aynı kart içinde adım değişimi, `headingRef`+`tabIndex={-1}`+`focus()` deseni,
> controller/render ayrımı) — bu belge aynı deseni devralır.

## ⚠⚠ Yapısal gerçek — sihirbaz TEK AKIŞ DEĞİL, İKİ FAZ

Ölçüldü (`apps/api/src/auth/auth-instance.ts:690` `requireEmailVerification: true` +
`auth-instance.ts:711-717` `emailVerification.sendOnSignUp: true`, doğrulama bağlantısı
`${AUTH_BASE_URL}/auth/verify-email`'e gider — **panelin kendi URL'sine değil**;
`apps/api/src/__tests__/auth-flow.test.ts:266` "kayıt 2xx, token **null** → autoSignIn
**SKIP**"). Hesap oluşturma işlemi kullanıcıyı **otomatik oturum açtırmaz**. Bu bir tasarım
tercihi değil, bugünkü kimlik doğrulama yapılandırmasının **dayattığı** bir kısıttır ve akış
bu nedenle ikiye bölünür:

- **FAZ 1 — kimliksiz:** hesap oluştur → _"e-postanı doğrula"_ ekranı → (kullanıcı
  e-postadaki bağlantıya tıklar, bu bağlantı panelin dışında bir uca gider — ADR-0021 §3'ün
  "A-A4" notu bu zinciri mevcut Better Auth deseniyle yeniden kullanılabilir ilan ediyor,
  bu belge o ucun kendi yanıtını **yeniden tasarlamıyor**) → panelde giriş yap.
- **FAZ 2 — girişli:** mağaza adı → slug (müsaitlik kontrolü) → site tipi → _"Mağazanı
  oluştur"_ → kiracı `pending` doğar → onboarding kontrol listesi.

**Dört sihirbaz adımı sırayla zorlanır** (AC-3): 1) Hesap 2) Mağaza adı 3) Slug 4) Site tipi. E-posta doğrulaması bu dört adımın **arasına giren bir kapı**, beşinci bir
sihirbaz adımı değil — kullanıcı panelin dışına çıkar, geri döndüğünde FAZ 2'nin
başındadır.

### "Yarı yolda kalan kullanıcı" (hesap var, kiracı yok) — nereye düşer?

Bu durumun **iki alt sınıfı** var ve ikisi de tasarlandı:

1. **E-postasını henüz doğrulamadı.** `/sign-in`'de giriş denerse mevcut mekanizma zaten
   bunu karşılıyor — `EMAIL_NOT_VERIFIED` (403) kodu **zaten** katalogda:
   _"Hesabınızın e-posta adresi henüz doğrulanmadı. Giriş yapabilmek için e-postanızı
   doğrulayın."_ (`messages.ts:106-107`). Yeni bir mesaj **gerekmiyor** — bu belge bu
   mekanizmayı aynen kullanır.
2. **E-postasını doğruladı, giriş yaptı, ama hiç mağaza oluşturmadı** (Faz 2'yi hiç
   başlatmadı veya ortasında bıraktı — Faz 2'nin 3 adımı tek `createTenant` çağrısında
   **atomik** yazıldığı için ortada yarım bir kiracı KALAMAZ; kullanıcı ya hiç
   başlamamıştır ya da tamamen bırakmıştır, sunucuda iz yoktur). Bu kullanıcı giriş
   yapıp `/` (panel anasayfası) adresine düşer. **KARAR:** anasayfa, yerel olarak
   saklanmış bir kiracı kimliği (bkz. aşağıdaki "Dashboard ↔ kiracı eşleşmesi") yoksa
   kontrol listesini **hiç çağırmaz** — bunun yerine dürüst bir "henüz mağazan yok"
   çağrısı gösterir, tek eylem "Mağaza oluştur" düğmesi, bu düğme doğrudan Faz 2'nin
   başına (`/magaza-olustur`, "Mağaza adı" adımı) gönderir. **"Hesap" adımı tekrar
   SORULMAZ** — kullanıcı zaten giriş yapmış durumda.

### ⚠ VARSAYIM — Dashboard ↔ kiracı eşleşmesi (frontend/architect onayı gerekiyor)

ADR-0021 §3'ün ölçtüğü gerçek: `onboardingChecklist` **girdiden** (`tenantId`) kiracı
seçer (panelden host-tabanlı çözümleme **yapısal olarak yok**) ve "bu kullanıcının
kiracılarını listeleyen bir prosedür" bu sürümde **kapsam dışı** (ADR-0021 "Değerlendirilen
alternatifler" tablosu — çapraz kiracı okuma RLS `FORCE` altında yapısal olarak yok).
⇒ Panelin `Mağazanı oluştur` akışı başarıyla bittiğinde döndürülen `tenantId`'yi
**istemci tarafında saklaması** (öneri: `localStorage`, anahtar adı ör.
`arkesoft.lastTenantId` — **güvenlik taşımaz**, salt bir gezinme kolaylığı; sunucu her
çağrıda sahipliği zaten yeniden doğruluyor) ve anasayfanın bu değeri okuyarak
`onboardingChecklist(tenantId)` çağırması **bu belgenin önerisidir**, mimari tarafından
henüz yazılı değil. `onboardingChecklist` saklı `tenantId` ile **dört ret modundan
biriyle** (kiracı yok/üye değil/soft-delete/biçim bozuk) 404 dönerse, istemci bunu "kiracı
yok" ile **aynı** davranır (saklı değeri siler, "mağaza oluştur" çağrısına döner) — bu,
`_app.tsx`'in mevcut "zaten çıkış yapılmış" (`treatAsSignedOut`) desenine yapısal olarak
**benzer** bir "artık bu referans geçerli değil, sıfırla" deseni. `frontend`/`architect`
bu mekanizmayı (veya eşdeğer bir alternatifi) teyit etmeli; onaylanmazsa bu belgenin
Dashboard ekranının "mağaza var" dalı farklı bir kiracı seçim yoluna bağlanmalı.

## Hedef kullanıcı

Teknik bilgisi olmayan bir KOBİ sahibi. "Tenant", "slug", "subdomain", "provisioning",
"migration" gibi kelimeler hiçbir ekranda görünmez. Bu kullanıcı genelde ilk defa bir
e-ticaret/kurumsal site paneli görüyor; "mağaza adresi" kavramını (`{ad}.arkesoft.app`)
anlaşılır bir örnekle görmeli, teknik bir "alt alan adı" tanımı okumamalı. İkinci bir
kritik an: hesap oluşturduktan sonra beklemesi gerektiğinde ("e-postanı doğrula") ne
yapacağını net anlamalı — aksi hâlde panelden ayrılıp geri dönmeyebilir (dönüşüm kaybı).

## Ekranlar ve rotalar

| #   | Ekran                                         | Rota (öneri)                          | Faz                   | Kimlik                |
| --- | --------------------------------------------- | ------------------------------------- | --------------------- | --------------------- |
| 1   | Hesap oluştur                                 | `/kayit` (`_auth.kayit.tsx`)          | Faz 1, adım 1         | Yok                   |
| 2   | E-postanı doğrula (bekleme)                   | `/kayit` (aynı rota, 2. durum)        | Faz 1, kapı           | Yok                   |
| —   | (panel dışı) e-posta bağlantısı               | `${AUTH_BASE_URL}/auth/verify-email`  | Faz 1, kapı           | — (A-A4, kapsam dışı) |
| 3   | Giriş yap                                     | `/sign-in` (**değişmedi**)            | Faz 1 → Faz 2 geçişi  | Yok                   |
| 4   | Mağaza adı                                    | `/magaza-olustur` (adım 1/3)          | Faz 2, adım 2         | Var                   |
| 5   | Mağaza adresi (slug)                          | `/magaza-olustur` (adım 2/3)          | Faz 2, adım 3         | Var                   |
| 6   | Site tipi                                     | `/magaza-olustur` (adım 3/3)          | Faz 2, adım 4         | Var                   |
| 7   | Panel anasayfası — mağaza yok                 | `/` (`_app.index.tsx`, genişletilmiş) | Faz 2 öncesi/atlanmış | Var                   |
| 8   | Panel anasayfası — onboarding kontrol listesi | `/` (aynı rota, "mağaza var" durumu)  | Faz 2 sonrası         | Var                   |

Ekran 4-6 **tek rota, tek kart içinde adım değişimi** (`TwoFactorSetupWizard` deseni) —
üç ayrı sayfa yüklemesi yok. Ekran 7-8 **aynı rota** (`/`), hangi durumun gösterileceği
yukarıdaki "Dashboard ↔ kiracı eşleşmesi" kararına göre belirlenir.

⚠ **Bütçe notu (S6/ui için, karar değil, ölçülmüş gerçek):** `/kayit`, `_app.index.tsx`
ve `_auth.sign-in.tsx` bugün panelin ilk-boya rotaları arasında — `/kayit` kimliksiz ilk
ekranlardan biri olarak `bundle-budget.config.ts`'in ilk-boya listesine **üçüncü bir
giriş** olarak eklenmesi gerekebilir. Bu belge bütçe sayısına karar vermez (CLAUDE.md
§ sınırı), yalnızca S6'nın bunu _bu akışı planlarken_ ölçmesi gerektiğini not eder.

## Mutlu yol

### A. Hesap oluşturma (Faz 1)

1. Kullanıcı `/kayit`'e gelir. Form: e-posta, şifre, şifre (tekrar).
2. "Hesap oluştur" düğmesine basar.
3. Sunucu 2xx döner (oturum **açılmaz**). Ekran aynı sayfada "E-postanı doğrula" durumuna
   geçer — odak bu durumun başlığına taşınır.
4. Kullanıcı e-postasını açar, doğrulama bağlantısına tıklar (panel dışı, A-A4).
5. Kullanıcı panele döner (aynı sekme veya yeni sekme) ve "Giriş yap"a tıklar/gider.
6. `/sign-in`'de giriş yapar → `/` adresine yönlendirilir.

### B. Mağaza oluşturma (Faz 2)

1. `/`'de kayıtlı bir kiracı referansı yoksa kullanıcı "Mağaza oluştur" düğmesine basar
   → `/magaza-olustur`'a gider, "Mağaza adı" adımı (1/3) açılır, odak adımın başlığına
   gider.
2. Mağaza adını yazar (ör. "Deniz Takı Atölyesi"), "İleri"ye basar.
3. "Mağaza adresi" adımı (2/3) açılır — slug alanı, mağaza adından **türetilmiş bir
   öneriyle** önceden doldurulmuş (`"deniz-taki-atolyesi"`), düzenlenebilir. Adım
   açıldığında bu öneri için **otomatik olarak** bir müsaitlik kontrolü başlar.
4. Sonuç canlı bölgede görünür: _"Bu ad kullanılabilir."_ (yeşil onay ikonu + metin).
   Kullanıcı dilerse adresi değiştirir; her değişiklikte kısa bir gecikmeyle (debounce)
   yeniden kontrol edilir — kullanıcı yazarken istek **atılmaz**, yazmayı bitirince
   kontrol başlar ve "Kontrol ediliyor…" durumu görünür.
5. Sonuç `available` olduğunda "İleri" düğmesi etkinleşir, kullanıcı basar.
6. "Site tipi" adımı (3/3) açılır — iki seçenek: "E-ticaret (ürün satışı yapacağım)" /
   "Kurumsal site (tanıtım, bilgi amaçlı)". Kullanıcı birini seçer.
7. "Mağazanı oluştur" düğmesine basar.
8. Sunucu kiracıyı, sahiplik üyeliğini ve deneme aboneliğini **tek işlemde** oluşturur;
   kiracı kimliği yerelde saklanır, kullanıcı `/`'a yönlendirilir.
9. `/`'de onboarding kontrol listesi görünür — ilk dört adım işaretli, beşinci adım
   ("Siteni yayına al") "Yakında" etiketiyle, dürüst bir açıklama ile: mağaza **henüz
   ziyaretçilere açık değil**.

## Ekran durumları

### Hesap oluştur (Ekran 1)

| Durum            | Kullanıcı ne görür                                                                                                | Eylemler                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Normal**       | E-posta, şifre, şifre (tekrar) alanları + "Hesap oluştur" düğmesi + "Zaten hesabın var mı? Giriş yap" bağlantısı. | Formu doldurur, gönderir.           |
| **Gönderiliyor** | Düğme "Hesap oluşturuluyor…" durumuna geçer, alanlar salt okunur, çift gönderim engellenir.                       | Yok (mevcut giriş formunun deseni). |
| **Boş**          | N/A — bu bir form, veri çekmez.                                                                                   | —                                   |
| **Hata**         | Aşağıdaki "Hata durumları" tablosuna göre alan veya form seviyesi hata.                                           | Alanı düzeltir, tekrar gönderir.    |

### E-postanı doğrula (Ekran 2 — Faz 1 kapısı)

| Durum                                 | Kullanıcı ne görür                                                                                                                                                                                            | Eylemler                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Normal**                            | Başlık "E-postanı doğrula" + gönderilen e-posta adresi tekrar edilir + "Gelen kutunuzdaki bağlantıya tıklayıp giriş yapabilirsiniz." + "Giriş yap" düğmesi + "E-posta gelmedi mi? Yeniden gönder" bağlantısı. | "Giriş yap" → `/sign-in`'e gider. "Yeniden gönder" → doğrulama e-postasını tekrar tetikler. |
| **Yükleniyor (yeniden gönderiliyor)** | "Yeniden gönder" bağlantısı geçici olarak "Gönderiliyor…" metnine döner, tekrar tıklanamaz.                                                                                                                   | Yok.                                                                                        |
| **Boş**                               | N/A.                                                                                                                                                                                                          | —                                                                                           |
| **Hata**                              | Yeniden gönderme başarısız olursa kısa bir satır: "E-posta gönderilemedi. Lütfen daha sonra tekrar deneyin." (mevcut `MAIL_DELIVERY_FAILED` metni) — ana mesaj ve "Giriş yap" düğmesi **kaybolmaz**.          | Tekrar dener veya "Giriş yap"a geçer.                                                       |

### Mağaza oluştur sihirbazı (Ekran 4-6)

| Durum                           | Kullanıcı ne görür                                                                                                                                              | Eylemler                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Normal — Mağaza adı**         | Metin alanı + "İleri" düğmesi.                                                                                                                                  | Yazar, "İleri".                                              |
| **Normal — Mağaza adresi**      | Önceden doldurulmuş adres alanı + canlı müsaitlik durumu (metin + ikon) + açıklama "Mağazan şu adresten yayına girecek: `{adres}.{alan-adı}`" + "Geri"/"İleri". | Düzenler, bekler, "İleri" (yalnızca `available` iken etkin). |
| **Kontrol ediliyor (slug)**     | Canlı bölgede "Kontrol ediliyor…" metni, "İleri" devre dışı.                                                                                                    | Yok.                                                         |
| **Normal — Site tipi**          | İki radyo seçenek + açıklama cümleleri + "Geri"/"Mağazanı oluştur".                                                                                             | Seçer, gönderir.                                             |
| **Gönderiliyor (createTenant)** | "Mağazanı oluştur" düğmesi "Oluşturuluyor…" durumuna geçer, adım geri gidilemez, form salt okunur.                                                              | Yok.                                                         |
| **Boş**                         | N/A — sihirbaz veri çekmez (slug önerisi istemci tarafında türetilir).                                                                                          | —                                                            |
| **Hata**                        | Aşağıdaki "Hata durumları" tablosuna göre, adıma bağlı alan hatası veya adım-seviyesi hata.                                                                     | Alanı düzeltir veya önceki adıma döner.                      |

### Panel anasayfası (Ekran 7-8)

| Durum                                                     | Kullanıcı ne görür                                                                                                                                                          | Eylemler                                         |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Mağaza yok**                                            | "Henüz bir mağazan yok" başlığı + kısa açıklama + "Mağaza oluştur" düğmesi.                                                                                                 | "Mağaza oluştur" → `/magaza-olustur`'a gider.    |
| **Yükleniyor (kontrol listesi)**                          | Beş iskelet (skeleton) satırı — yerelde saklı bir kiracı referansı varken.                                                                                                  | Yok.                                             |
| **Normal — kontrol listesi**                              | Beş maddelik liste, her maddenin durumu (işaretli/beklemede) metinle de belirtilir; en üstte dürüst bir açıklama: "Mağazan oluşturuldu ama henüz ziyaretçilere açık değil." | Beşinci madde dışında eylem yok (bilgi listesi). |
| **Boş**                                                   | N/A — kontrol listesi her zaman tam beş madde döner (yapısal olarak sıfır madde imkânsız; `AC-19`).                                                                         | —                                                |
| **Hata (kontrol listesi yüklenemedi)**                    | "Kurulum durumun şu anda yüklenemedi." + "Yeniden dene".                                                                                                                    | "Yeniden dene".                                  |
| **Saklı referans geçersiz (404, dört ret modundan biri)** | Görünür bir hata metni **yok** — "Mağaza yok" durumuna sessizce düşer (saklı referans silinir), `_app.tsx`'in "zaten çıkış yapılmış" sessiz-geçiş deseniyle aynı mantık.    | "Mağaza oluştur"a gider.                         |

## Hata durumları

| Durum                                                     | Ne oldu                                                                                                          | Kullanıcı ne görür                                                                                                                       | Nasıl kurtulur                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **E-posta zorunlu/biçimsiz**                              | Alan boş veya e-posta biçiminde değil.                                                                           | Alanın kendi hatası: "E-posta adresinizi girin." / "Geçerli bir e-posta adresi girin."                                                   | Alanı düzeltir.                                                                        |
| **Şifre zorunlu/kısa**                                    | Alan boş veya minimum uzunluğun altında.                                                                         | "Şifrenizi girin." / "Şifreniz en az … karakter olmalı." (sunucunun gerçek kuralına göre, bkz. VARSAYIM aşağıda)                         | Alanı düzeltir.                                                                        |
| **Şifreler eşleşmiyor**                                   | "Şifre (tekrar)" alanı birincisiyle aynı değil.                                                                  | "Şifreler eşleşmiyor."                                                                                                                   | Alanı düzeltir.                                                                        |
| **Bu e-posta zaten kayıtlı**                              | Sunucu aynı e-postayla var olan bir hesap buldu.                                                                 | "Bu e-posta ile zaten bir hesap var. Giriş yapmayı deneyin." + "Giriş yap" bağlantısı                                                    | Giriş yapar veya farklı e-posta kullanır.                                              |
| **429 çok fazla deneme (kayıt)**                          | IP başına kayıt denemesi sınırı aşıldı.                                                                          | "Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin." (`RATE_LIMIT_EXCEEDED`, mevcut)                                   | Birkaç dakika bekler.                                                                  |
| **Ağ/bilinmeyen hata (Faz 1)**                            | İstek sunucuya ulaşmadı.                                                                                         | "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin." (mevcut, `MESSAGES.errors.network`)                            | Tekrar dener.                                                                          |
| **Mağaza adı zorunlu**                                    | Alan boş gönderildi.                                                                                             | "Mağazanın bir adı olmalı."                                                                                                              | Alanı doldurur.                                                                        |
| **Slug: `taken`**                                         | Bu adres başka bir mağaza tarafından kullanılıyor.                                                               | "Bu mağaza adresi başka bir mağaza tarafından kullanılıyor. Başka bir adres dene."                                                       | Adresi değiştirir.                                                                     |
| **Slug: `reserved`**                                      | Bu adres platformun kendi kullanımı için ayrılmış (12 üyelik liste, kullanıcıya sayılmaz).                       | "Bu adres platform tarafından kullanıldığı için seçilemez. Başka bir adres dene."                                                        | Adresi değiştirir.                                                                     |
| **Slug: `invalidFormat`**                                 | Adres kurala uymuyor (harf/rakam/tire dışında karakter, baş/son tire, vb.).                                      | "Bu adreste yalnızca küçük harf, rakam ve tire kullanılabilir; tire ile başlayıp bitemez."                                               | Adresi düzeltir.                                                                       |
| **Slug: `unreachable`**                                   | Adres kuralına uygun **ama** tam adresi (mağaza adresi + platform alan adı) çok uzun olduğu için kullanılamıyor. | "Bu mağaza adresi şu an kullanılamıyor çünkü tam adresi çok uzun oluyor. Daha kısa bir adres dene."                                      | Daha kısa bir adres yazar.                                                             |
| **Slug: yarış kaybı (submit anında, `createTenant`)**     | Kullanıcı adımı geçtikten sonra aynı adresi başka biri aldı (AC-6).                                              | Sihirbaz "Mağaza adresi" adımına geri döner, alan hatası: "Bu mağaza adresi az önce başka biri tarafından alındı. Başka bir adres dene." | Yeni bir adres seçip tekrar ilerler.                                                   |
| **Site tipi seçilmedi**                                   | Kullanıcı "Mağazanı oluştur"a bastı ama hiçbir seçenek işaretli değil.                                           | Seçenek grubunun altında: "Bir site tipi seç."                                                                                           | Bir seçenek işaretler.                                                                 |
| **429 çok fazla deneme (mağaza oluşturma/slug kontrolü)** | Oran sınırı aşıldı.                                                                                              | "Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin." (mevcut)                                                          | Birkaç dakika bekler.                                                                  |
| **Oturum düşmüş (401, Faz 2 sihirbazı sırasında)**        | Sihirbaz doldururken oturum sona erdi.                                                                           | Görünür bir hata yok; mevcut "zaten çıkış yapılmış" deseniyle sessizce `/sign-in`'e yönlendirilir.                                       | Yeniden giriş yapar (girdiği bilgiler **kaybolur**, hiçbir şey sunucuya yazılmamıştı). |
| **Ağ/bilinmeyen hata (Faz 2)**                            | İstek sunucuya ulaşmadı.                                                                                         | "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin."                                                                | Tekrar dener (aynı adımda, girdiler kaybolmaz).                                        |
| **Kontrol listesi yüklenemedi**                           | `onboardingChecklist` ağ/sunucu hatası döndü.                                                                    | "Kurulum durumun şu anda yüklenemedi." + "Yeniden dene".                                                                                 | "Yeniden dene".                                                                        |

**VARSAYIM:** şifre minimum uzunluk kuralının gerçek değeri bu belgede sabitlenmedi —
mevcut `/sign-in` ekranı da bir uzunluk kuralı göstermiyor (yalnızca "zorunlu" kontrolü);
`backend`/`S9` gerçek kuralı netleştirirse bu belgenin "Şifreniz en az … karakter olmalı"
satırı gerçek sayıyla güncellenmeli, `docs` onaylamalı.

## Yıkıcı işlemler

Bu akışta klasik anlamda bir silme/iptal/yayından kaldırma **yok**. En yakın aday
değerlendirmesi:

| İşlem                                           | Yıkıcı mı                                                                                                                                                                           | Onay gerekir mi                                                                                                                                               | Geri alınabilir mi                                                                                                                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sihirbazdan "Geri" ile önceki adıma dönme       | **Hayır** — hiçbir veri sunucuya yazılmadı, yalnızca istemci durumu (form alanları) etkilenir, geri dönünce önceki adımın girdileri **korunur** (sihirbaz durumu bellekte tutulur). | Hayır                                                                                                                                                         | N/A — kaybedilen bir şey yok.                                                                                                                                            |
| Sihirbazı tamamlamadan sayfadan ayrılma/kapatma | **Hayır, sunucu tarafında** — `createTenant` çağrılmadan hiçbir satır yazılmaz; kullanıcı girdileri kaybeder ama platformda hiçbir iz kalmaz.                                       | Hayır (onay istemek gereksiz sürtünme olurdu)                                                                                                                 | N/A.                                                                                                                                                                     |
| "Mağazanı oluştur" (final submit)               | **Hayır, klasik anlamda** — bir şey silmiyor, yeni bir kaynak **yaratıyor**; ama slug seçimi sonradan **değiştirilemez** (bu sürümde mağaza adresi düzenleme ekranı yok).           | Hayır — ama adres alanının yanında "bu adres daha sonra değiştirilemeyebilir" türünden bir netlik sunulması **önerilir** (aşağıdaki Microcopy'de `slugHelp`). | Kısmen — yeni bir mağaza **oluşturmak** geri alınamaz bir "artık bu adres alınmış" etkisi bırakır (slug `@unique`); mağazanın kendisini silme bu sürümün kapsamında yok. |

Bu nedenle sihirbazda bir "emin misin?" onay diyaloğu **açılmaz** — tek sürtünme noktası
"Mağazanı oluştur" düğmesinin yanında slug'ın kalıcılığına dair kısa bir bilgi
cümlesidir, ayrı bir modal değildir.

## Mobil davranış (360px)

- Sihirbaz adımları 360px'te **tek sütun**, dikey istiflenmiş alanlar; "Geri"/"İleri"
  düğme çifti tam genişlikte, dikey istiflenir (yan yana değil) — uzun buton metinleri
  ("Mağazanı oluştur") kesilmeden sarmalanır.
  - İstisna: slug adımında "Geri" ve "İleri" **yan yana** kalabilir çünkü ikisi de kısa
    metin taşır ("Geri" / "İleri") — site tipi adımındaki "Mağazanı oluştur" uzun metni
    tam genişlik gerektirir, o adımda tek buton tam genişlik, "Geri" onun üstünde ayrı
    satırda.
- İlerleme göstergesi 360px'te **metin olarak** görünür ("Adım 2 / 3" gibi, Faz 2 için;
  sadece nokta/çubuk görseli **yetmez** — WCAG 1.4.1 ile aynı gerekçe, görsel bir ilerleme
  çubuğu varsa yanında bu metin de bulunur).
- Slug alanı 360px'te tam genişlik; canlı durum metni alanın **altında**, alanla aynı
  genişlikte, taşma olmadan sarmalanır (uzun hata metinleri — ör. `unreachable` — kesilip
  "…" ile kısaltılmaz).
- Site tipi radyo seçenekleri 360px'te dikey istiflenir, her seçeneğin dokunma hedefi
  (etiket + radyo birlikte) ≥44×44px.
- Onboarding kontrol listesi 360px'te **liste** olarak kalır (tablo→kart dönüşümü
  gerekmiyor, zaten `<ul>`/`<li>`, T-017'nin aynı deseni) — her madde dikey istiflenmiş
  durum rozeti + metin.
- Panel anasayfasının "Mağaza yok" CTA'sı 360px'te "Mağaza oluştur" düğmesi tam genişlik.

## Microcopy (i18n anahtarlarıyla)

**Mekanizma hatırlatması (T-016/T-017'nin bağlayıcı dersi).** Panel `MESSAGES` nesnesine
(`apps/admin/src/messages/messages.ts`) düz anahtarlarla eklenir; `packages/i18n` henüz
yok (V3, `A-T19-3`). Hata metinleri **mevcut `PanelErrorCode`'ları yeniden kullanır**
(`RATE_LIMIT_EXCEEDED`, `MAIL_DELIVERY_FAILED`, `EMAIL_NOT_VERIFIED`, `errors.network`
zaten katalogda — yeni kod **icat edilmiyor**). Slug alan hataları ise `VALIDATION_ERROR`
gövdesinin `fields.slug` anahtarına göre çözülür — CLAUDE.md §4'ün kendi örneği zaten bu
adlandırmayı kullanıyor (`errors.slug.taken`), bu belge onu **birebir** benimser.

### Beş `outcome` değeri — slug müsaitlik durumu (canlı bölge + alan hatası ikisinde de kullanılır)

| `outcome`           | Anahtar (canlı durum)             | Türkçe metin                                                                                      | Alan hatası anahtarı (submit zamanı yarış kaybı için de aynı metin) |
| ------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `available`         | `registration.slug.available`     | Bu adres kullanılabilir.                                                                          | — (hata değil)                                                      |
| `taken`             | `registration.slug.taken`         | Bu mağaza adresi başka bir mağaza tarafından kullanılıyor. Başka bir adres dene.                  | `errors.slug.taken`                                                 |
| `reserved`          | `registration.slug.reserved`      | Bu adres platform tarafından kullanıldığı için seçilemez. Başka bir adres dene.                   | `errors.slug.reserved`                                              |
| `invalidFormat`     | `registration.slug.invalidFormat` | Bu adreste yalnızca küçük harf, rakam ve tire kullanılabilir; tire ile başlayıp bitemez.          | `errors.slug.invalidFormat`                                         |
| `unreachable`       | `registration.slug.unreachable`   | Bu mağaza adresi şu an kullanılamıyor çünkü tam adresi çok uzun oluyor. Daha kısa bir adres dene. | `errors.slug.unreachable`                                           |
| _(kontrol sürüyor)_ | `registration.slug.checking`      | Kontrol ediliyor…                                                                                 | —                                                                   |

### Beş kontrol listesi adımı

| `step` (anahtar) | Türkçe madde metni                     | v0.1.0'daki durumu | Not                                                        |
| ---------------- | -------------------------------------- | ------------------ | ---------------------------------------------------------- |
| `account`        | Hesabını oluşturdun                    | **Tamam**          | Kontrol listesine ulaşan kullanıcının hesabı zaten vardır. |
| `store_identity` | Mağazanın adını ve adresini belirledin | **Tamam**          | Mağaza adı + slug, `createTenant`'ta birlikte yazılır.     |
| `site_type`      | Mağazanın türünü seçtin                | **Tamam**          | Site tipi `createTenant`'ta yazılır.                       |
| `subscription`   | Deneme aboneliğin başladı              | **Tamam**          | `trial` aboneliği otomatik, `createTenant` ile aynı anda.  |
| `provisioning`   | Siteni yayına al                       | **Yakında**        | **A-A5 kararı** aşağıda.                                   |

**A-A5 — "Yakında" gösterimi (bu belgenin kararı).** `provisioning` adımı v0.1.0'da
**her zaman** `todo` döner çünkü "Siteyi Kur" özelliğinin kendisi henüz yok (v0.2.0).
Bu, kullanıcının yapmadığı bir şey **değil** — platformun henüz sunamadığı bir özellik.
Bu ayrımı netleştirmek için beşinci madde **devre dışı bir düğme olarak render edilmez**
(odaklanabilir ama işlevsiz bir kontrol WCAG 2.1 bakımından kafa karıştırır ve
açıklamasız bırakılırsa hatalı bir deneyim olur); bunun yerine **etkileşimsiz bir liste
öğesi** olarak, yanında metin bir rozet ("Yakında") ve kısa bir açıklama ile gösterilir:
_"Bu özellik çok yakında burada olacak."_ Liste öğesinin durumu **ikonla tek başına**
iletilmez — "Yakında" kelimesi her zaman görünür metindir (WCAG 1.4.1 ile aynı gerekçe).

### Dürüst `pending` durumu — "siten hazır" DENMEZ

| Anahtar                              | Türkçe metin                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `dashboard.onboarding.pendingBanner` | Mağazan oluşturuldu ama henüz ziyaretçilere açık değil. Yayına alma adımı çok yakında burada olacak. |

Bu satır kontrol listesinin **üstünde**, sabit bir bilgi şeridi olarak her zaman görünür
(yalnızca beşinci madde "Yakında" rozetine bakarak çıkarılması gereken bir sonuç değil,
**açıkça söylenir**).

### Yeni anahtarlar — ekran içeriği

**`auth.signUp.*` (Faz 1, `/kayit` — `auth.signIn.*`'in kardeşi):**

| Anahtar                               | Metin                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `auth.signUp.title`                   | Hesap oluştur                                                                                                     |
| `auth.signUp.emailLabel`              | E-posta adresi                                                                                                    |
| `auth.signUp.passwordLabel`           | Şifre                                                                                                             |
| `auth.signUp.passwordConfirmLabel`    | Şifre (tekrar)                                                                                                    |
| `auth.signUp.submit`                  | Hesap oluştur                                                                                                     |
| `auth.signUp.submitting`              | Hesap oluşturuluyor…                                                                                              |
| `auth.signUp.emailRequired`           | E-posta adresinizi girin.                                                                                         |
| `auth.signUp.emailInvalid`            | Geçerli bir e-posta adresi girin.                                                                                 |
| `auth.signUp.passwordRequired`        | Şifrenizi girin.                                                                                                  |
| `auth.signUp.passwordConfirmRequired` | Şifrenizi tekrar girin.                                                                                           |
| `auth.signUp.passwordMismatch`        | Şifreler eşleşmiyor.                                                                                              |
| `auth.signUp.existingAccountNotice`   | Bu e-posta ile zaten bir hesap var. Giriş yapmayı deneyin.                                                        |
| `auth.signUp.goToSignIn`              | Giriş yap                                                                                                         |
| `auth.signUp.haveAccountPrompt`       | Zaten hesabın var mı?                                                                                             |
| `auth.signUp.emailPendingTitle`       | E-postanı doğrula                                                                                                 |
| `auth.signUp.emailPendingBody`        | {eposta} adresine bir doğrulama bağlantısı gönderdik. Gelen kutunuzdaki bağlantıya tıklayıp giriş yapabilirsiniz. |
| `auth.signUp.resendEmail`             | E-posta gelmedi mi? Yeniden gönder                                                                                |
| `auth.signUp.resendingEmail`          | Gönderiliyor…                                                                                                     |

**`registration.*` (Faz 2, `/magaza-olustur`):**

| Anahtar                                | Metin                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `registration.storeName.stepLabel`     | Mağaza adı                                                                   |
| `registration.storeName.inputLabel`    | Mağazanın adı                                                                |
| `registration.storeName.required`      | Mağazanın bir adı olmalı.                                                    |
| `registration.storeName.next`          | İleri                                                                        |
| `registration.slug.stepLabel`          | Mağaza adresi                                                                |
| `registration.slug.inputLabel`         | Mağazanın adresi                                                             |
| `registration.slug.help`               | Mağazan şu adresten yayına girecek: {önizleme}                               |
| `registration.slug.back`               | Geri                                                                         |
| `registration.slug.next`               | İleri                                                                        |
| `registration.slug.raceLostNotice`     | Bu mağaza adresi az önce başka biri tarafından alındı. Başka bir adres dene. |
| `registration.siteType.stepLabel`      | Site tipi                                                                    |
| `registration.siteType.legend`         | Mağazan ne türde olacak?                                                     |
| `registration.siteType.ecommerceLabel` | E-ticaret (ürün satışı yapacağım)                                            |
| `registration.siteType.corporateLabel` | Kurumsal site (tanıtım, bilgi amaçlı)                                        |
| `registration.siteType.required`       | Bir site tipi seç.                                                           |
| `registration.siteType.back`           | Geri                                                                         |
| `registration.siteType.submit`         | Mağazanı oluştur                                                             |
| `registration.siteType.submitting`     | Oluşturuluyor…                                                               |

**`dashboard.onboarding.*` (Ekran 7-8):**

| Anahtar                                     | Metin                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `dashboard.onboarding.noStoreTitle`         | Henüz bir mağazan yok                                                                                |
| `dashboard.onboarding.noStoreBody`          | Mağazanı oluşturarak başlayabilirsin, yalnızca birkaç dakika sürer.                                  |
| `dashboard.onboarding.createStoreButton`    | Mağaza oluştur                                                                                       |
| `dashboard.onboarding.checklistTitle`       | Kurulum adımların                                                                                    |
| `dashboard.onboarding.pendingBanner`        | Mağazan oluşturuldu ama henüz ziyaretçilere açık değil. Yayına alma adımı çok yakında burada olacak. |
| `dashboard.onboarding.comingSoonBadge`      | Yakında                                                                                              |
| `dashboard.onboarding.provisioningStepHelp` | Bu özellik çok yakında burada olacak.                                                                |
| `dashboard.onboarding.loadError`            | Kurulum durumun şu anda yüklenemedi.                                                                 |
| `dashboard.onboarding.stepDoneLabel`        | Tamamlandı                                                                                           |
| `dashboard.onboarding.stepTodoLabel`        | Bekliyor                                                                                             |

`common.cancel`/`errors.retryButton`/`errors.network`/`errors.genericTitle` zaten
katalogda — bu akışta **yeniden kullanılır**, yeni anahtar açılmaz.

## Erişilebilirlik niyeti — `wcag`'ın sekiz maddesi, tek tek karşılandı

① **Adım geçişlerinde odak yönetimi.** Faz 2 sihirbazının her adım geçişinde (Mağaza
adı→Slug→Site tipi, ve geri dönüşlerde) odak yeni adımın başlığına taşınır
(`headingRef` + `tabIndex={-1}` + `focus()` — `TwoFactorSetupWizard.tsx:88-90`'ın **aynı**
deseni, yeni bir strateji icat edilmez). Faz 1'in "form" → "e-postanı doğrula" geçişinde
de aynı mekanizma uygulanır. Hiçbir geçişte odak `<body>`'ye düşmez veya kaybolmaz.

② **Tüm sihirbaz klavyeyle tamamlanabilir.** Her alan `Tab` ile erişilir; "İleri"/"Geri"/
"Mağazanı oluştur" düğmeleri gerçek `<button>` (div tabanlı tıklama alanı yok); site
tipi seçenekleri gerçek radyo girdileri (ok tuşlarıyla gezinme tarayıcı varsayılanı);
form `Enter` ile gönderilebilir (ekstra `keydown` yazılmaz, mevcut giriş formunun
deseni).

③ **Slug müsaitlik sonucu `aria-live`/`role="status"` ile duyurulur.** Canlı durum
metni (`registration.slug.*` tablosundaki beş `outcome` + "Kontrol ediliyor…") bir
`role="status"` (`aria-live="polite"`) bölgesinde render edilir — debounce sayesinde
her tuş vuruşunda değil, yalnızca **sonuç değiştiğinde** duyuru tetiklenir (gürültü
engellenir).

④ **Alan hatası `aria-invalid`+`aria-describedby` ile girdiye bağlı.** Hem Faz 1'in
e-posta/şifre alanları hem de Faz 2'nin mağaza adı/slug alanları, T-016'nın kurduğu
deseni (`Input.error` prop'u, ayrı bir `role="alert"` kutusu **değil**) kullanır — hata
metni alanın **kendi** `aria-describedby`'ına bağlanır, odak hatalı alana geri döner
(`TwoFactorSetupWizard.tsx:114-121`'in aynı deseni). Site tipi seçilmediğinde hata,
seçenek grubunun (`<fieldset>`/`<legend>`) kendi açıklamasına bağlanır.

⑤ ⭐ **Müsaitlik durumu renkle TEK BAŞINA iletilmez (WCAG 1.4.1).** Her beş `outcome`
**görünür metin** taşır (yukarıdaki tablo) — yeşil/kırmızı renk veya ikon yalnızca
metnin **yanında**, metnin **yerine değil**. "Bu cihaz" rozeti (T-017) ile aynı ilke.

⑥ **Kontrol listesi liste semantiği taşır, adım durumu yalnızca ikonla iletilmez.**
Onboarding kontrol listesi `<ul>`/`<li>` (T-017'nin oturum listesiyle aynı mantık — her
madde heterojen içerik taşıyor: durum + metin + bazen rozet). Her maddenin durumu
görünür metinle de belirtilir (`dashboard.onboarding.stepDoneLabel`/`stepTodoLabel`/
`comingSoonBadge`) — bir onay ikonu **tek başına** "tamamlandı" anlamına gelmez.

⑦ **Kontrast WCAG AA.** Bu belge renk/token kararı **vermez** (o `ui`'nin işi,
CLAUDE.md §4 sınırı) — ama her metin önerisinin (hata, durum, rozet) `ui`'nin seçtiği
renk jetonlarıyla **birlikte okunabilir metin** olarak render edilmesi gerektiğini,
rengin kendisinin anlamı taşımadığını (madde ⑤) burada tekrar belirtir. Gerçek kontrast
ölçümü `wcag` gate'inin ve sonraki `ui` turunun işi.

⑧ **Yükleniyor/boş/hata durumları her liste ve formda tanımlı.** Yukarıdaki "Ekran
durumları" bölümü her ekran için dört durumu da (Normal, Yükleniyor, Boş, Hata) ayrı
ayrı tablolar hâlinde tanımlar; "Boş" durumu yapısal olarak imkânsız olan ekranlarda
(form, sihirbaz, her zaman 5 maddeli kontrol listesi) bu **açıkça N/A olarak
gerekçelendirilir**, atlanmaz.

**Ek niyetler (sekiz maddenin dışında, iyi pratik):**

- İlerleme göstergesi (Faz 2) her zaman **metin alternatifi** taşır ("Adım 2 / 3"),
  salt görsel bir ilerleme çubuğu değildir — madde ⑤'in ruhunun doğal uzantısı.
- Sihirbazın "Geri" düğmesi önceki adımın **girdilerini korur** (odak + veri kaybı
  yok) — klavye kullanıcısının adımlar arasında ileri-geri gidip gelmesi cezalandırılmaz.
- `/kayit`'in "Giriş yap" bağlantısı ve "Yeniden gönder" eylemi gerçek etkileşimli
  öğeler (bağlantı/düğme), görünüşte tıklanabilir ama işlevsiz metin değildir.

---

**RİSKLER (sonraki ajanlar için):**

1. "Dashboard ↔ kiracı eşleşmesi" (yukarıdaki VARSAYIM) bu belgenin **önerisidir**,
   mimari tarafından henüz onaylı değil — `frontend`/`architect` teyit etmeli; farklı bir
   mekanizma seçilirse Ekran 7-8'in "Mağaza yok" ↔ "kontrol listesi" geçiş koşulu
   buna göre revize edilir.
2. E-posta doğrulama bağlantısının **gerçek** tıklama deneyimi (panel dışı bir API ucu,
   `AUTH_BASE_URL`) bu belgenin **tasarlamadığı** bir alandır (A-A4, kapsam dışı) —
   kullanıcı o ucu ziyaret ettiğinde göreceği gerçek yanıt netleşmeden Ekran 2'nin
   "Giriş yap" düğmesinin tek kurtarma yolu olup olmadığı tam doğrulanamaz;
   `backend`/`qa` bu ucun gerçek yanıtını ölçmeli.
3. Şifre minimum uzunluk kuralının gerçek değeri ölçülmedi (VARSAYIM, Hata durumları
   bölümünde işaretli) — `backend` netleştirince bu belgenin ilgili satırı
   güncellenmeli.
4. Slug önerisinin mağaza adından türetilmesi (`normalizeTenantSlug`'ın istemci
   tarafında da çağrılması mı, yoksa sunucudan mı istenmesi gerektiği) bu belgede
   **belirtilmedi** — `architect`'in K1 kararı `normalizeTenantSlug()`'ı
   `packages/tenancy`'de saf bir fonksiyon olarak tanımlıyor, bu da onu **istemci
   tarafında da** çağırılabilir kılıyor (paket zaten bağımlılıksız); `frontend`/`S6`
   bunu doğrudan içe aktarıp aktarmayacağına karar vermeli.
5. Bundle bütçesi notu (Ekranlar ve rotalar bölümünde işaretli) bir **karar değil**,
   `S6`'nın ölçmesi gereken bir gerçek — sayı bu belgede verilmedi.
