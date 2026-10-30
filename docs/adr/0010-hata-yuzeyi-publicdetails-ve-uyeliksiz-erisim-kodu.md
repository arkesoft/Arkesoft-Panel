# ADR-0010 — Hata Yüzeyi: `publicDetails` Sahipliği, İki Zarf ve Üyeliksiz Erişim Kodu

- **Durum:** KABUL EDILDI
- **Tarih:** 2026-10-30
- **Karar verenler:** Architect (T-007); kaynak bulgular: solid (T-006, `error-mapping` borcu), security (T-006), Orkestratör (ÇELİŞKİ O2)
- **İlgili versiyon:** `v0.0.6` (ROADMAP v0.0.6 kapsamında uygulanır)

---

## Bağlam

v0.0.4, HTTP hata gövdesi için dört alanlı tek bir tel sözleşmesi kurdu
(`code`/`message`/`details`/`requestId`) ve "ham hata mesajı gövdeye asla girmez,
yalnızca loglanır" garantisini mekanik olarak sağladı: gövde üreten fonksiyon alanları
elle yazar, hata nesnesinden spread etmez, `context`/`httpHeaders` alanlarını hiç okumaz.

v0.0.6 ikinci bir yüzey (tRPC) ekliyor ve üç bağımsız problem aynı anda masaya geliyor:

**1. `details`'in sahibi belirsiz (v0.0.6 vadeli teknik borç, kaynak: solid).**
Bugün "bu hatanın `details`'i nedir" bilgisi `apps/api/src/errors/error-mapping.ts`
içinde bir `instanceof` zinciriyle duruyor. `details` taşıyan her yeni hata sınıfı merkezi
bir fonksiyonu düzenlemeyi zorunlu kılıyor. İkinci bir yüzey eklenince bu zincir ya
kopyalanacak ya bağımlılık yönü ters çevrilecek — ikisi de kabul edilemez.

**2. tRPC'nin varsayılan hata biçimlendiricisi sızdırır.** Ham mesajı tel üstüne yazar ve
geliştirme modunda yığın izi ekler. v0.0.4'te kurulan garanti bu yolda sıfırdan
kurulmak zorundadır.

**3. Üyeliksiz erişimde dönecek kod çelişkili.** CLAUDE.md §7 madde 12 "var olmayan ile
yetkisiz ayrımı yapılmaz, her ikisi de 404" diyor. Yürürlükteki davranış ise 403
`TENANT_MEMBERSHIP_REQUIRED` ve bu davranış bir önceki sürümde kullanıcıya duyuruldu.
İki yüzeyin farklı kod döndürmesi kabul edilemez; hangisinin doğru olduğu karara bağlı.

Ek bir yapısal gerçek: tRPC isteklerinde kimlik ve kiracı zorlaması, tRPC çağrılmadan
**önce**, platformun mevcut guard zincirinde yapılır (bu zincirin yeniden yazılmaması
bağlayıcı bir karardır). Dolayısıyla aynı yolda iki farklı hata zarfı doğar.

## Karar

### 1. `details` üretimi hata sınıfının kendisine taşınır

`AppError` taban sınıfına geçersiz kılınabilir bir `publicDetails` erişimcisi eklenir;
varsayılanı boş nesnedir. Gövde üreten fonksiyon `details`'i **yalnızca** bu alandan
okur; harici `details` parametresi kaldırılır. Alt sınıflar `override` anahtar sözcüğüyle
geçersiz kılar (`noImplicitOverride` bunu derleyici zorunluluğu yapar). Merkezi
`instanceof` zinciri silinir.

**Fail-closed:** varsayılan boş nesnedir — yeni bir hata sınıfı **açıkça** istemediği
sürece tel üstüne hiçbir şey çıkmaz. Bu, ADR-0008'in "deny-list fail-open, allowlist
fail-closed" dersinin hata alanındaki karşılığıdır.

**İki alan, iki yön, karıştırılmaz:** `context` yalnızca loglanır (PII olabilir),
`publicDetails` yalnızca tele yazılır (PII/sır içermez). Bir alt sınıf hangisine ne
koyduğunu açıkça seçmek zorundadır.

**Yapısal dayanıklılık:** hata nesnesi tanıma yapısal yedek yola (paket çoğalması) sahip
olduğundan, okunan değer şema ile doğrulanır; doğrulama başarısızsa boş nesne kullanılır.

### 2. Sınıflandırılamayan hatalar için tel gövdeleri tek yerde üretilir

"Çerçeve kaynaklı hata" ve "bilinmeyen hata" için kullanılan sabit gövdeler hata
sözleşmesi paketine, fonksiyon olarak taşınır. Her iki yüzey aynı fonksiyonları çağırır;
literal kopyası bulunmaz. İki yüzeyin aynı gövdeyi üretmesi böylece test değil **yapı**
ile sağlanır.

### 3. tRPC hata biçimlendiricisi gövdeyi elden kurar

Aşağıdaki altı kural numaralandırılmıştır çünkü üretim kodu onlara **madde numarasıyla** atıf
yapıyor (`packages/trpc/src` içinde on iki yerde); numaralandırma değişirse o atıfların
**tamamı** aynı değişiklikte güncellenmek zorundadır. Sıralama tasarım kaynağının
(T-007 teknik tasarımı, "Hata eşlemesi" bölümünün bağlayıcı kuralları) sırasıdır —
bu hizalama bilinçlidir ve bozulmamalıdır.

**3.1** Çerçevenin ürettiği hata şekli **spread edilmez**; veri nesnesi tam olarak üç
anahtarla (çerçeve kodu, HTTP durumu, tel gövdesi) elden kurulur. Yığın izi, şema hata
detayı ve yol bilgisi yapısal olarak giremez.

**3.2** Çerçevenin `message` alanı **hiç okunmaz**; mesaj her zaman i18n anahtarıdır.
Ham mesaj ve yığın izi **yalnızca** yapılandırılmış loga gider — tel gövdesine hiçbir
ortamda girmez.

**3.3** Geliştirme/üretim ayrımı **yoktur**; gövde her ortamda aynıdır. Ortam
değişkenine göre dallanma yasaktır — satıcının kendi örnek kodu bunun tersini önerse
bile (bkz. ADR-0009 madde 9).

**3.4** Alan hatasının çerçeve koduna çevrilmesi biçimlendiricide değil, tüm prosedürlerin
kökündeki bir ara katmanda yapılır — aksi hâlde gövde bir şey, HTTP durumu başka bir şey
söyler. **Uygulama notu (T-007/S4 ölçümü):** çerçevenin `next()`'i hatayı fırlatmaz,
`{ok: false, error}` **dönüş değerine** çevirir; bu yüzden ara katman `try/catch` değil
**dönüş değeri kontrolü** ile yazılır. `try/catch` deseni bu çerçevede **ölü koddur**.

**3.5** Durum↔kod haritası açık bir tablodur; bilinmeyen durum en kapalı koda düşer ve
gidiş-dönüş yapamayan durumlar testte **açıkça listelenir** (inceleme görünürlüğü).

**3.6** Tel üstünde **tek** makine-okunur kod vardır: platformun kararlı hata kodu
(`data.appError.code`). Çerçevenin kendi kod sözlüğü (`data.code`) taşıma düzeyi bir
ayrıntıdır; istemci **daima** platform koduna dallanır, çerçeve koduna değil.

### 4. `/trpc` yolunda iki zarf, tek gövde

- **Taşıma reddi** (kimlik yok, üyelik yok, kiracı çözülemedi, bağımlılık erişilemez):
  HTTP durumu + dört alanlı tel gövdesi. Bu, platformun **tüm** yüzeylerinde aynıdır.
- **Prosedür hatası:** tRPC zarfı; zarfın içindeki tel gövdesi **aynı dört alandır**.

Gerekçe: taşıma reddi bir prosedür sonucu değildir; kimlik/kiracı zorlaması tek bir yerde
yapılır ve tüm yüzeylerde tek biçimde cevaplanır. İstemci tarafında iki zarfın
normalleştirilmesi panel hata katmanının işidir (bir sonraki sürüm).

### 5. Üyeliksiz erişim **403** döner; kod `TENANT_MEMBERSHIP_REQUIRED` kalır

Her iki yüzeyde aynı kod ve aynı gövde. Değişiklik yoktur; dolayısıyla sürüm etkisi de
yoktur.

**Gerekçe — §7 madde 12'nin tehdit modeli bu yüzeyde karşılanmıyor:** kiracının varlığı
üyelik yanıtından **önce** ve **kimlik gerektirmeden** açığa çıkar: çözülemeyen bir host
404, çözülen ama oturumsuz bir istek 401 alır. Bu ayrım yapısaldır, çünkü kiracının
vitrini o host'ta herkese açık servis edilir. Üyelik yanıtını 404'e çekmek hiçbir ek
bilgiyi kapatmaz; yalnızca duyurulmuş bir davranışı bozar.

**§7 madde 12'nin korunan yarısı:** gövde başka kiracının kimliğini, kısa adını veya
görünen adını **taşımaz**; bu değerler yalnızca log bağlamına gider.

**İşlevsel kural (bağlayıcı — bu karar bir muafiyet lisansı değildir):** girdiyle
kimliklenen kiracı-kapsamlı kaynaklar (ürün, sipariş, medya, ayar) için §7 madde 12 tam
olarak bağlayıcıdır: "yok" ile "senin değil" **her ikisi de 404**. Buradaki istisna
yalnızca "host çözümünden gelen kiracının kendisi" için geçerlidir.

### Değerlendirilen alternatifler

| Alternatif                                                                           | Neden seçilmedi                                                                                                                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `details` haritasını uygulamada bırakıp ikinci yüzeye enjekte etmek                  | Borcu kapatmaz, ikinci bir doğruluk kaynağı yaratır; yeni hata sınıfı yine merkezi haritayı düzenlemeye zorlar.                                   |
| `details` haritasını ikinci yüzeye kopyalamak                                        | İki kopya sessizce birbirinden sapar; iki yüzeyin aynı gövdeyi döndürme şartı kırılır.                                                            |
| Her iki yüzeyi 404'e çekmek (üyeliksiz erişim)                                       | Hiçbir bilgi sızıntısını kapatmaz (varlık oracle'ı zaten 404/401 ayrımında), duyurulmuş davranışı bozar, changeset ve CHANGELOG maliyeti doğurur. |
| tRPC'nin varsayılan biçimlendiricisini üretimde yeterli saymak                       | Ham mesajı tel üstüne yazar; v0.0.4 garantisi ortam bayrağına bağlı hâle gelir.                                                                   |
| HTTP durumunu yanıt üstverisiyle ezmek                                               | Yalnızca HTTP yüzeyini düzeltir; HTTP dışı çağıran yanlış semantikle kalır.                                                                       |
| Guard zincirini atlayıp kimlik/üyelik zorlamasını sözleşme katmanında yeniden yazmak | Kapsam dışı; tek bir güvenlik kararının iki yerde uygulanması (ve birinin geride kalması) riski.                                                  |

## Sonuçlar

### Olumlu

- "Bu hatanın tel üstündeki detayı nedir" bilgisi hatanın kendisinde durur; yeni hata
  sınıfı hiçbir merkezi dosyayı düzenlemez.
- İki yüzey aynı gövdeyi **aynı kodu çağırarak** üretir; eşitlik yapısaldır.
- Varsayılan boş detay + zorunlu `override` sayesinde sızıntı opt-in'dir.
- Üyeliksiz erişim davranışı değişmez; bir önceki sürümde duyurulan sözleşme korunur.
- `instanceof` zincirinin kaldırılması, hata tanımanın yapısal yedek yoluyla da
  tutarlılık sağlar.

### Olumsuz ve kabul edilen maliyetler

- `publicDetails` **bilinçli** yanlış kullanımla PII taşıyabilir. Karşı önlem: varsayılan
  boş, `override` zorunlu, sınıf yorumunda iki alanın yönü yazılı ve güvenlik gate'inin
  kontrol listesine madde eklendi.
- Gövde üreten fonksiyonun imzası daralıyor; iç pakette kırıcı bir değişiklik. Tüm
  tüketiciler aynı değişiklikte güncellenir, üretilen değerler birebir aynı kalır,
  dolayısıyla platform için kırıcı sürüm doğurmaz.
- `/trpc` yolunda iki hata zarfı bulunur; istemci her ikisini tanımak zorundadır.
  Normalleştirme bir sonraki sürümün işi olarak teknik borca kaydedildi.
- Üyeliksiz erişimde 403 kalması, CLAUDE.md §7 madde 12'yi okuyan bir ajanın çelişki
  görmesine yol açabilir. Karşı önlem: madde 12'nin bağlayıcı kaldığı alan bu ADR'de
  açıkça yazıldı; §7'ye bu ADR'ye çapraz referans eklenmelidir.
- Girdi doğrulama hatalarının alan bazlı gövdeye eşlenmesi bu sürümde **tasarlanmadı**
  (girdili prosedür yok). İlk girdili prosedürün sahibi bunu tasarlamak zorundadır.

### Etkilenen sonraki kararlar

- i18n çözümlemesi (mesaj anahtarının metne dönmesi) bu gövdeyi **değiştirmez**;
  anahtar taşıma kararı korunur.
- Gözlemlenebilirlik sürümü, hata sınıflarına log seviyesi eşlemesi eklerken aynı
  "alan hatanın kendisinde durur" desenini izleyecektir.
- Public API sözleşme snapshot testi bu dört alanlı gövdeyi ve tRPC zarfının üç anahtarlı
  veri nesnesini pinleyecektir; her ikisinin genişlemesi kırıcı sürüm sorusudur.
- Veritabanı seviyesinde rol ayrımı yapılırken üretilen yeni hata sınıfları
  `publicDetails`'i varsayılan boş bırakmalıdır.

## Gözden geçirme koşulları

1. **Bir hata sınıfının `publicDetails`'inde PII/sır tespit edilirse** — mekanizma
   yetersiz demektir; alanın şema ile kısıtlanması (izin verilen anahtar kümesi)
   değerlendirilir.
2. **Girdiyle kimliklenen ilk kiracı-kapsamlı kaynak eklendiğinde** — madde 5'in
   "işlevsel kural" bölümünün uygulanıp uygulanmadığı doğrulanır.
3. **Üyeliksiz erişimde varlık oracle'ının kapatılması gerekirse** (ör. kiracı vitrinleri
   artık herkese açık servis edilmiyorsa) — 403 kararının dayandığı önerme düşer, karar
   yeniden açılır.
4. **İstemci tarafı iki zarfı normalize etmekte zorlanırsa** — taşıma reddinin de tRPC
   zarfına çevrilmesi (ve bunun kimlik/kiracı zorlamasını nereye taşıdığı) yeniden
   tartışılır.
5. **Çerçeve hata kodu sözlüğü değişirse** — durum↔kod haritası ve gidiş-dönüş testi
   güncellenir.
