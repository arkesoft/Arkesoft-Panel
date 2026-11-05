# ADR-0016 — Yetki modeli, izin kataloğu ve yetenek tabanlı kiracı bağlamı

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-04
- **Karar verenler:** pm, architect, po, db, backend, docs (T-014); gate'ler: qa, security, solid. Üç kapsam daraltması (`@RequirePermission()` dekoratörü, `platform_admin`, `arkesoft_auth` teslimi) kullanıcı onayıyla (2026-11-04).
- **İlgili versiyon:** `v0.0.14` (bkz. `ROADMAP.md`)

---

## Bağlam

v0.0.14 platforma yetki modelini getiriyor, ama bunu yaparken platformun **ilk yazma
yüzeyini** de açıyor. Bu sürümden önce ölçülen başlangıç durumu, kararların tamamını
şekillendirdi ve her maddesi iddia değil **ölçümdür**:

- **Platformda tek bir tRPC `mutation`'ı yoktu.** Beş prosedürün beşi de `query`'ydi. Yani "yetki" kavramının uygulanacağı bir yazma ucu henüz mevcut değildi.
- **`TenantRole` enum'u (beş rol) şemada zaten vardı**, fakat `role` üretim kodunda **hiçbir yerde okunmuyordu**: kimlik muhafızı üyelik satırından yalnızca `id` seçiyordu. Rol, veri modelinde var olup çalışma zamanında **hiç tüketilmeyen** bir alandı.
- **İzin kataloğu, izinli bir prosedür builder'ı ve bir izin dekoratörü yoktu**; adları yalnızca `ROADMAP.md` ve `CLAUDE.md` metinlerinde geçiyordu.
- **Oturum kiracı taşımıyor** (v0.0.5'in bağlayıcı kararı) → kiracı bazlı rol, kullanıcı bazlı oturumda **önbelleklenemez**.
- **Sözleşme paketi veri katmanını import edemez** (ADR-0009 madde 5) → izin kataloğunun fiziksel yeri bir tasarım kararıdır, üslup tercihi değil.
- **Panelde kiracı seçimi v0.1.0'da**; kiracı kapsamlı prosedürler panel orijininden erişilemez (ADR-0011 madde 4). Yani bu sürümün yazma uçlarının **tarayıcıdan tüketicisi yok**.
- **Mesaj kataloğu paketi yok** (vade v0.0.18): kullanıcıya dönük metin anahtarları hâlâ hata sınıflarında literal olarak yaşıyor.

Bu zemin üzerinde dört soru bu sürümden uzun yaşayacak ve kodun içinde cevaplanırsa altı ay
sonra okuyan kişi gerekçeyi bulamayacak:

1. **Rol her istekte nereden okunur?** Kimliğe mi eklenir, muhafıza mı, ayrı bir porta mı? Seçim, bir okuma maliyeti ile iki doğruluk kaynağı riski arasında.
2. **Yetki reddi hangi HTTP kodunu ve hangi gövdeyi üretir?** CLAUDE.md §7 madde 12 varlık oracle'ını yasaklıyor ve "her ikisi de 404" diyor; ROADMAP'in kabul kriteri ise açıkça **403** istiyor.
3. **Kiracı bağlamı her zaman host'tan mı gelir?** Davet kabulü, tanım gereği **henüz üye olmayan** bir kullanıcının yaptığı bir **yazma** işlemidir; ADR-0009 madde 7 ve ADR-0011 madde 3 bu akışı olduğu gibi ifade edemiyor.
4. **"Her kiracının bir sahibi vardır" değişmezi nerede durur?** Veritabanı kısıtı mı, uygulama kodu mu? Yanlış cevap, sahipsiz kiracı veya iki sahipli kiracı üretir.

Ayrıca ADR-0008'in bıraktığı borç bu sürüme vadeliydi. ADR-0008 §4 _Borç Ölçümü_ ve
_"v0.0.14'ün işi"_ bölümü (`docs/adr/0008-sir-tasiyan-tablolarin-tipi-ve-linti-ile-korunmasi.md:69-82`)
beş ayaklı bir teslim tarif ediyor: `arkesoft_auth` rolü, tablo bazlı `REVOKE` + kolon bazlı
`GRANT`, katalog linter'ına kolon yetkisi kural sınıfı, ikinci Prisma istemcisi ve üçüncü
zorunlu bağlantı URL'si. Bu teslim **bu sürümün kapsamına girmedi**; kullanıcı onayıyla
`v0.0.14.1` olarak ayrı ve kutulu bir sürüme **sıralandı** (ertelenmedi) — gerekçesi ve sıra
kısıtı aşağıda, _Etkilenen sonraki kararlar_ bölümünde.

**Terminoloji uyarısı (ölçüldü):** bu borca atıf veren sonraki ajanlar `"R-1 KARARI"` jetonunu
aramamalıdır — o jeton **ADR-0008'de geçmez** (repo geneli arama → 0 eşleşme); yalnızca şema ve
istemci yorumlarında yaşıyor. ADR-0008'deki muadili yukarıdaki `:69-82` aralığı, kolon bazlı
`REVOKE`'un reddi `:91`, borcun kendisi ise `:119`'dur. Yanlış jetonla arama yapan okuyucu
_"böyle bir karar yok"_ sonucuna varır; ADR-0008'in kendi dersi (`:102`) tam olarak bu sınıf
hatayı anlatıyor.

## Karar

### 1 — İzin kataloğu ve rol → izin eşlemesi sözleşme paketinde yaşar

`PERMISSIONS` (literal birleşim kaynağı) ve `ROLE_PERMISSIONS` (`Record<TenantRoleWire, …>`)
`packages/trpc/src/authz/permissions.ts` içinde tanımlanır. Gerekçe: katalog **saf veridir**
(I/O yok, veri katmanı import'u yok) **ve public API yüzeyinin parçasıdır** — bir izni
daraltmak semver olayıdır. `apps/api`'ye koymak her istekte bir port çağrısı daha eklerdi ve
kataloğu sözleşme paketinde **tipsiz bir isim listesine** indirirdi.

Katalog **tam olarak iki izin** taşır: `job:read` ve `member:write`. ROADMAP kapsam metnindeki
`product:write`/`order:read`/`theme:publish` adları **örnektir, teslim listesi değil**; tüketicisi
olmayan bir izin ("ölü izin") kataloğu _belgelenmiş ama gerçekleşmeyen kontrol_ sınıfına düşürür
ve tutarlılık testinin ikinci ayağını kırar. `member:read` de bilerek yoktur: üye okuma
prosedürü bugün yok.

`Record<TenantRoleWire, …>`'ın **tam** olması bir üslup tercihi değil, fail-closed mekanizmanın
kendisidir: rol sözlüğüne yeni bir rol eklenince eşleme **eksik anahtarla derlenmez**. Yeni bir
rolün sessizce izinsiz — ya da daha kötüsü, varsayılan olarak yetkili — kalması imkânsızdır.
`Partial<>` ve indeks imzası kullanılmaz.

Rol sözlüğünün tele kopyası (`tenantRoleSchema`) **zorunludur**, çünkü sözleşme paketi veri
katmanını import edemez (ADR-0009 madde 5). Kopyanın bekçisi **mevcut** parite pini
mekanizmasıdır (`TenantRoleWire ≡ TenantRole`); yeni bir mekanizma icat edilmedi. Davet
şemasındaki `invitableRoleSchema`, rol sözlüğünden `owner`'ı **yapısal olarak** dışlar — davetle
sahiplik verilemez ve bu, bir çalışma zamanı kontrolü değil, şemanın şeklidir.

### 2 — Rol her istekte ayrı bir port üzerinden okunur; oturumda veya kimlikte taşınmaz

`permissionProcedure(permission)`, `tenantProcedure`'ün üzerine binen **beşinci** builder
basamağıdır. Rolü üyelik okuma portundan alır, kataloğa bakar, izin yoksa hata fabrikasının
`permissionDenied` üyesini çağırır. Kimlik muhafızının üyelik sorgusu **değiştirilmedi**
(hâlâ yalnızca `id` seçiyor) ve muhafız dosyasına bu sürümde hiç dokunulmadı.

Üç ölçülmüş gerekçe:

1. **Kimliğe rol eklemek yasak.** Tel sözleşmesi pini, oturum kimliği ile istek kimliğinin anahtar kümelerinin eşitliğini pinliyor; kimliğe `role` eklemek ya pini kırar ya rolü oturum çıktısına **iter**. Rol **kiracı** bazlı, kimlik **kullanıcı** bazlıdır — kategori hatası.
2. **Muhafız bir bağlam yazıcısı değildir.** Rolü oradan taşımak istek bağlamına dördüncü (ve ilk kez bir muhafız kaynaklı) yazıcı eklemek olurdu; muhafız platformun en çok denetlenmiş güvenlik dosyasıdır.
3. **Port total olduğu için ikinci savunma hattı kuruyor.** Üyelik satırı yoksa port, muhafızın fırlattığı **aynı** hatayı fırlatır (ADR-0012'nin _"kiracı iki katmanda zorlanır"_ deseninin yetki karşılığı). HTTP dışı çağıranlar (ileride worker) için de doğru davranış.

**Açıkça kabul edilen maliyet:** izinli her istek üyelik satırını bir kez daha okur (muhafızla
toplam **iki** nokta okuması). Önbellekleme **yapısal olarak imkânsızdır** — oturum kiracı
taşımıyor. Reddedilen optimizasyon: muhafızın okumasını istek bağlamında paylaşmak; bu, rol için
istek içinde iki doğruluk kaynağı üretir ve muhafızı yazıcıya dönüştürür. v0.0.17 bunu **ölçümle**
yeniden değerlendirir.

### 3 — Yetki reddi 403 `PERMISSION_DENIED`'dır; izin adı ve rol tele değil loga girer

Gövde: kod `PERMISSION_DENIED`, HTTP **403**, mesaj anahtarı `errors.authz.permissionDenied`,
`details` **boş**. **404 değil**, çünkü §7 madde 12'nin yasakladığı şey **varlık oracle'ıdır**:
aktör bu kiracının üyesidir (muhafız doğruladı), kiracının varlığını zaten bilir ve başka bir
kiracı hakkında hiçbir şey öğrenmez — ADR-0010 madde 5'in yazılı istisnasıyla aynı sınıf. ROADMAP
kabul kriteri de 403 diyor.

İzin adı ve rol **tele girmez**; hata nesnesinin `context` alanına girer ve **sınırda loglanır**.
Bu cümlenin ikinci yarısı tasarım anında **yanlıştı** ve düzeltme turunda gerçek hâle getirildi:
`solid` ve `security` bağımsız olarak, sözleşme sınırından geçen domain hatalarının **hiçbir
yere** yazılmadığını ölçtü. Sınır artık **tek bir yapılandırılmış kayıt** yazıyor (4xx → `warn`,
5xx → `error`) ve kaydın tekliği **yapısaldır**: sınır middleware'i taban builder'a **bir kez**
bağlı, beş basamağın tamamı o tabandan türüyor ve istek gruplama (batching) kapalı → ikinci bir
kayıt yolu yok.

İki incelik bilinçlidir:

- **`context` nestelenir, spread edilmez.** Alan tipi `Record<string, unknown>` olduğu için gelen anahtarlar sınırda bilinemez; spread, bir hata sınıfının `userId` anahtarının bağlı alanı **gölgelemesine** izin verirdi. İzin listesiyle süzmek ise sözleşme paketini uygulamanın bağlam şekillerine bağlar — **bağımlılık yönünün tersi** (CLAUDE.md §3).
- **Alan adı icat edilmedi, hizalandı.** REST yolu aynı bilgiyi zaten `{ code, isRetryable, context }` biçiminde yazıyor; ikinci bir ad operatörü iki adı da bilmeye zorlardı.

Hedef öznesi ayrı alandadır (`targetUserId`), çünkü üst seviye kullanıcı alanı **aktöre** bağlıdır;
aynı anahtarı hedef için kullanmak denetim izini **yanlış atfa** düşürürdü. Üyelik reddi hatası
bu yüzden varsayılanı _"aktör"_ olan kapalı bir özne parametresi aldı ve muhafızın davranışı
**birebir** korundu.

### 4 — INV-OWNER: her kiracının tam olarak bir `owner`'ı vardır; zorlanma yeri koddur

Değişmez _"en az bir"_ değil **"tam olarak bir"**dir ve gerekçe mekaniktir, estetik değil:
_"en az bir"_ klasik **write-skew**'e açıktır (iki eşzamanlı sahip çıkarma, her biri
_"diğeri var"_ görür) ve kapatmak satır kilidi için ham sorgu gerektirir — oysa o yetenek
kiracı kapsamlı işlem istemcisinden **bilerek** dışarıda bırakılmıştır. _"Tam bir"_de her işlem
**tek sahip satırını** güncellemek zorundadır, dolayısıyla satır kilidi işi serileştirir ve ek
mekanizma gerekmez. Ürün tarafı da tutarlıdır (Shopify'ın _store owner_ emsali) ve gevşetme
yönü (çoklu sahip) **eklemelidir**.

Zorlanma, karşılaştır-ve-değiştir (CAS) deseniyle uygulama kodundadır: sahiplik devri önce
`role = 'owner'` yüklemini **`where` içinde taşıyan** bir güncellemeyle mevcut sahibi düşürür,
etkilenen satır sayısı sıfırsa 409 ile durur, sonra hedefi yükseltir ve **aynı transaction'da**
iki denetim satırı yazar. Ayrı bir devir prosedürü **yok**: devir, rol değiştirme ucunun sahip
tarafından `owner` değeriyle çağrılmasıdır.

Sıfır-satır kontrolü **yük taşıyan bir satırdır, dekoratif değil** — bu ampirik olarak
doğrulandı, bkz. _Ölçülen olgular_.

Üç veritabanı mekanizması değerlendirildi ve reddedildi (aşağıdaki alternatifler listesi).
`TenantMembership`'in kullanıcı yabancı anahtarını `Restrict`'e çevirmek de **bu sürümde
yapılmadı**: değişiklik `ALTER TABLE … DROP CONSTRAINT` gerektiriyor ve migration kümesi
linter'ının yıkıcı ifade kuralı buna bulgu üretiyor. **Kuralı kendi değişikliğimizi geçirmek
için gevşetmek yasaktır** (CLAUDE.md §10 madde 6) → güçlü biçim **sıralandı, düşürülmedi**:
panel kullanıcısını kalıcı olarak silen bir yüzey açıldığında uygulanacak. ⚠ **O sürüm bugün
ROADMAP'te TANIMLI DEĞİL** — ölçüldü: `v0.0.19` _test altyapısıdır_, KVKK veri indirme/hesap
silme akışı ise `v0.12.0`'ın kapsamında ve oradaki özne **vitrin müşterisidir**, panel
kullanıcısı değil. Borç satırı bu olguyu taşıyor.

### 5 — Denetim kaydının tek yazma yolu vardır ve iş yazmasıyla aynı transaction'da koşar

`writeAuditLog(tx, entry)` imzası, ilk parametresi kiracı kapsamlı **işlem** istemcisi olduğu
için denetim kaydının her zaman kiracı bağlamında **ve** iş yazmasıyla aynı transaction'da
yazılmasını **derleme zamanında** zorlar. Denetim ve davet tabloları, kiracı bağlamsız istemci
tipinin allowlist'ine **eklenmedi**; dolayısıyla bağlam dışından denetim yazmanın derlenebilir
bir yolu yoktur. Bu, kuyruk iş kaydının v0.0.11'de kurduğu emsalin birebir uygulanmasıdır.

`diff` kolonu **serbest JSON değildir**: eylem başına kapalı bir Zod şeması tablosu
(`Record<AuditAction, …>`) üzerinden `parse` edilir, fazla anahtarlar **düşer**, eksik anahtar
**fırlatır**. Ayrımlı birleşim yerine kayıt tipi seçilmesinin gerekçesi mekaniktir: kayıt enum
üzerinde **tam** olduğu için enum'a değer eklemek, şeması yazılana kadar derlemeyi kırar ve
`action` ile `diff` arasında **ikinci bir doğruluk kaynağı** doğmaz. `subject` kolonunun anlamı
eylem başına değişir ve bu sözleşme **tip seviyesinde** zorlanır (eylem → alan eşlemesi +
exhaustive `switch`), yalnızca yorumda beyan edilmez.

Üç kasıtlı dışlama: **e-posta hiçbir denetim satırına girmez** (bekleyen adres davet tablosunda
yaşar); `ip` ve `userAgent` **saklanır ama loglanmaz** — ikisi PII sınıfındadır, fakat denetim
kaydının varlık sebebidir ve CLAUDE.md §4'ün _"asla loglanmaz"_ listesinde yoktur; denetim izi
**aktörden uzun yaşadığı** için `actorUserId` yabancı anahtar taşımaz (`Cascade` geçmişi silerdi,
`Restrict` kullanıcı silmeyi kilitlerdi).

### 6 — Yetenek tabanlı kiracı bağlamı: dört koşullu, DAR bir istisna

Davet kabulü, kiracı bağlamını **host'tan değil**, kullanıcının elindeki **yetenek
belirtecinden** türetir. Bu, ADR-0009 madde 7'nin _"kiracı kimliği girdiden okunmaz"_ kuralına ve
ADR-0011 madde 3'ün muafiyet koşullarına **yazılı bir istisnadır** ve zorunluluğu yapısaldır:
kabul eden kişi tanım gereği henüz üye değildir, dolayısıyla kiracı host'unda üyelik muhafızı
onu keser; üyelik satırını "beklemede" olarak önceden yazmak ise imkânsızdır (üyelik satırı var
olan bir kullanıcıya bağlıdır).

**Bu istisna genel bir kiracı kaynağı DEĞİLDİR.** Dört koşulun **dördü birden** sağlanmadıkça
başka bir prosedür bu deseni kullanamaz:

- **A.** Tek dayanak, en az 256 bit entropili, diskte **yalnızca özeti** saklanan, süresi dolan, **tek kullanımlık** bir belirteçtir.
- **B.** Belirteçten türeyen bağlam **tek** bir kiracı bloğunda kullanılır ve o blokta **başka hiçbir kiracı verisi okunmaz**.
- **C.** Çıktı şeması kiracıya ait **hiçbir** alan taşımaz ve resolver kiracı bağlamına **erişmez** (builder kiracıyı daraltmadığı için **erişemez de** — kısıt tip düzeyinde pinlidir).
- **D.** **Tüm** başarısızlık modları **tek** bir hata sınıfına indirgenir.

Koşul D'nin gate turlarında bir **yedinci modu** bulundu ve kapatıldı; bugün koşul D'nin tam
olduğu ölçülerek kayda geçti (bkz. _Ölçülen olgular_).

Muafiyet yolu, kiracı muafiyet listesine **on dördüncü** üye olarak eklendi; kimlik **zorunlu
kaldı** (oturumsuz istek 401). Listenin kardinalite assertion'ı elle güncellenir ve
`toContain`'e **düşürülemez** — muafiyet eklemenin inceleme görünürlüğünü sağlayan şey bu
assertion'dır.

### 7 — `job.get` / `job.list` izinli builder'a taşındı; izin beş rolde de açık

İki okuma prosedürü de `permissionProcedure('job:read')` kullanır ve `job:read` **beş rolün
beşine de** verilidir. İki gerekçe:

1. Taşınmazsa, prosedür yüzeyi tablosunun kapalı dünya ayağı **ilk gününden bir muafiyet satırıyla** doğar ve mekanizma delinir.
2. `readonly`/`support`'tan okuma yeteneğini almak **mevcut bir yeteneği kaldırmak** olurdu → sürüm etkisi MAJOR'a kayardı; oysa bu sürüm MINOR ve sözleşme snapshot koşumu (`pnpm test:contract`, vade v0.0.22) henüz **yok**. Beş role de vererek sıkılaştırma **eklemeli** kalır.

Bir rolden `job:read`'i çıkarmak ileride **ayrı ve MAJOR** bir karardır.

### Değerlendirilen alternatifler

- **`@RequirePermission()` NestJS dekoratörü bu sürümde** — reddedildi: üretimdeki REST controller'ların tamamı sağlık probu, kimlik delegasyonu, kullanıcının kendi oturumları ve tRPC taşıma katmanıdır; **izinle kapılanacak tek bir iş ucu yok**. Dekoratör sıfır tüketiciyle doğar ve _"katalog ↔ kullanım tutarlılığı"_ kriterini **boş küme üzerinde** doğrular. İş değeri aynı mekanizmayla, gerçek çağrı yeri olan `permissionProcedure` üzerinden tamamen karşılanıyor. Kullanıcı onayıyla REST iş yüzeyi açıldığında (ufukta v0.0.20) yazılacak.
- **`platform_admin` rolünü `tenant_role` enum'una eklemek** — reddedildi, üç bağımsız ölçüm aynı yöne işaret etti: şema bu rolü **yazılı bir kararla** reddediyor (_"platform yetkisi, üyelik değildir"_) ve eklemek o kararı sessizce ters çevirip kiracı rolü enum'una **kiracı dışı anlam** yüklerdi; tüketecek panel **yok** (v0.0.20); oturum kiracı taşımadığı için platform yetkisi oturumda **taşınamaz**, ayrı mekanizma ister.
- **Rolü oturum kimliğine veya muhafızın okumasına eklemek** — reddedildi: tel pinini kırar veya rolü oturum çıktısına iter; ayrıca istek içinde rol için **iki doğruluk kaynağı** üretir (bkz. Karar 2).
- **İnce taneli izinler** (davet etme / rol değiştirme / çıkarma için ayrı izinler) — reddedildi: üç yazma ucunun **yetki sınıfı aynıdır** (hepsi kiracının üye listesini değiştirir); ayrıştırmak iki ölü izin daha üretirdi.
- **Var olmayan uçlar için yer tutucu izinler** (`product:write`, `order:read`, `theme:publish`) — reddedildi: ölü izin, tutarlılık testinin _"her izin en az bir prosedür tarafından tüketiliyor"_ ayağını kırar.
- **"En az bir `owner`" değişmezi** — reddedildi: write-skew'e açık; kapatmak için gereken satır kilidi yeteneği işlem istemcisinde bilerek yok (bkz. Karar 4 ve ölçüm).
- **Kısmi `UNIQUE INDEX … WHERE role = 'owner'`** — reddedildi: Prisma şeması kısmi indeks **ifade edemez** (migration drift yüzeyi) ve bu kısıt _"en fazla bir"_i verir, _"en az bir"_i **vermez**.
- **`BEFORE DELETE` trigger'ı** — reddedildi: üyelik tablosu `FORCE ROW LEVEL SECURITY` taşıyor; trigger'ın sorgusu kiracı GUC'u yokken **her zaman sıfır satır** görür ve değişmezi **sessizce onaylar**. `BYPASSRLS` veya `SECURITY DEFINER` ile aşmak CLAUDE.md §10 madde 4 ihlalidir.
- **`Tenant.ownerUserId` kolonu + `ON DELETE RESTRICT`** — reddedildi: sahiplik için **ikinci doğruluk kaynağı** olur; geriye dönük doldurması üyelik tablosunu okumak zorundadır ve **aynı FORCE-RLS körlüğüne** düşer.

İki alternatif daha değerlendirildi ve kararın gövdesine yazıldı: Better Auth'un doğrulama
tablosunu davet kaydı olarak kullanmak (reddedildi — o tablo sır taşıyan modeller listesinde,
erişimi kimlik modülüne kapalı) ve kiracı bağlamı kurma kapısını veri katmanında sertleştirmek
(reddedildi — ADR-0003 madde 1; doğru yer çağırandır).

## Ölçülen olgular (kayıt)

Bu bölüm, kararların gerekçelerinin **ölçülmüş** yarısını kalıcı kılar. Hiçbiri çıkarım
değildir; her biri bir alt görev veya gate turunda fiilen koşturulmuştur.

1. **INV-OWNER'ın write-skew gerekçesi ampirik olarak doğrulandı.** Canlı Postgres üzerinde iki eşzamanlı oturum: üretim varyantı (yüklem `where` içinde) ikinci oturumu **2216 ms bloke etti** ve kaybeden **tespit edildi**; reddedilen tasarım (oku-sonra-yaz) **86 ms**'de geçti, **hiç bloke olmadı** ve son durumda sahip sayısı **2** oldu. ⚠ İki ek bulgu: ham SQL'de sıfır-satır kontrolü olmadığı için **üretim varyantı da** iki sahip üretti → o kontrol **yük taşıyan bir satırdır**; ve kilidin uyku süresi kadar tutulması, kilidin **satır üzerinde** olduğunun doğrudan ölçümüdür. Aynı yarış HTTP seviyesinde de yeniden üretildi: iki eşzamanlı devir isteğinin sonucu **tam olarak biri 200, tam olarak biri 409**; kontrol etkisizleştirildiğinde sonuç `[200, 200]`'e düştü.
2. **Koşul D'nin yedinci modu vardı ve kapatıldı.** NUL baytı tel şemasını, belirteç ayrıştırıcısını ve veri katmanının boşluk kapısını **geçip** kiracı bağlamı kurulurken Postgres tarafında `22021` ile patlıyordu → sonuç **500 + ham yığın izi**. Düzeltme **çağıran tarafta** yapıldı (kiracı yarısı artık karakter sınıfıyla doğrulanıyor ve sapma **aynı** tek hataya indiriliyor); ⚠ **veri katmanının kapısı değiştirilmedi** (ADR-0003 madde 1) ve o dosyanın diff'i **sıfır satır**. `security` ikinci turda **sekizinci bir mod aradı ve bulamadı** (altı prob ailesi: biçim vakaları, desenin uç girdileri, boş yarı, gizli yarının Postgres'e hiç ulaşmaması, ham soket üzerinden başlık enjeksiyonu, e-posta şeması) → **koşul D artık tam**. Karakter sınıfları **canlı veriden** ölçülerek seçildi, biçim pinlemek için değil, hiçbir üreticiden çıkamayacak baytları kesmek için.
3. **Hata bağlamı artık sınırda loglanıyor.** Karar 3'ün _"yalnızca loga girer"_ cümlesinin ikinci yarısı, düzeltme turundan **önce gerçek değildi**: sınırdan geçen domain hataları hiçbir halkada log üretmiyordu (`solid` ve `security` bunu bağımsız olarak ölçtü). Düzeltmeden sonra kayıt **tek** ve **yapısal** olarak tektir; telde **hiçbir şey değişmediği** aynı istek kimliğiyle üretilen gövdelerin md5 karşılaştırmasıyla kanıtlandı (iki özet **birebir aynı**).
4. **Yetki reddi gövdesi `AppErrorBody` seviyesinde birebirdir, zarf seviyesinde değil.** `PERMISSION_DENIED` sözleşme katmanının **zarfı** içinde, üyelik reddi ise **düz** gelir; biri sözleşme içinden, diğeri muhafızdan fırlatılıyor. ⚠ `security` bunun **varlık oracle'ı olmadığını** ölçtü: fark hangi **katmanın** fırlattığından geliyor, **kaynağın varlığından değil**; aynı aktör aynı girdiyle her zaman aynı zarfı görür. Hedefin başka kiracıda olması ile hiç var olmaması, geri alınan bir transaction içinde kurulan iki kiracılı senaryoda **ayırt edilemez** çıktı (ikisi de sıfır satır).
5. **Kabul ucu tarayıcıdan erişilebilir, ama tüketicisi yok.** Ölçüm: oturumsuz istek **401**, kiracı başlığı **gerekmiyor**, çıktıda kiracı kimliği veya kısa adı **yok**, ikinci kullanım **404**, uydurma belirteç **404**. Üç yazma ucu ise panel host'undan **404** döner (ADR-0011 madde 4). Davet bağlantısının karşılığı olan panel rotası **v0.1.0'da**; yani bu sürüm bir yetenek vaadi değil, **sözleşmenin zorlanmasını** teslim ediyor.
6. **Davet tablosu sır taşıyan modeller listesine girmedi.** Ham belirteç **saklanmıyor**, yalnızca `sha256` özeti; özet **tam** belirteç üzerinden alınıyor, dolayısıyla bir kiracının gizli yarısı başka bir kiracı kimliğiyle **yeniden kullanılamaz**. Sonuç: `v0.0.14.1`'in kapsamı **büyümedi** ve kimlik bilgisi taşıyan kolon sayısı **üçte kaldı**.
7. **İki yeni tablonun RLS'i canlı katalogdan doğrulandı** (`rolbypassrls` taşıyan rolle, yani tablo sahibinin politikaya tabi olmasından kaynaklanan yanılgıya düşmeden): `ENABLE` + `FORCE`, tablo başına **tam bir** politika, `USING` ile `WITH CHECK` **birebir aynı**, uygulama rolü dört DML yetkisinde de yetkili ve `rolbypassrls` **kapalı**. Politika blokları kuyruk iş tablosunun migration'ına karşı **bayt-birebir**. Mekanizma ölçüldü: kiracı GUC'u yokken **0 satır**, gerçek kiracıyla **4385**, uydurma kiracıyla **0**.
8. **İzin kapısı `next()`'ten önce fırlatıyor ve üyelik satırı tam iki kez okunuyor.** İzinli bir istekte muhafızın okuması (`id` seçimi) ve izin kapısının okuması (`role` seçimi) sayıldı → **iki**, üçüncü okuma **yok**; reddedilen istekte yazma portu **hiç çağrılmıyor**. Ölçümün kendisinin boşa çıkmadığı, rolü iki kez okutan bir mutasyonla kanıtlandı.
9. **E-posta gönderimi transaction dışında ve commit'ten sonradır.** Ters sıra (gönder → commit) **ölü belirteç** üretirdi; bugünkü sırada gönderim başarısız olursa davet satırı **durur** ve hata yeniden denenebilir olarak yukarı gider. Ayrımı veren assert, taşıyıcı fırlatıldığında satırın veritabanında **kalmasıdır**; ters sıra mutasyonunda bu assert kırmızıya düştü.

## Sonuçlar

### Olumlu

- Yetki modeli **fail-closed**: yeni bir rol izinsiz kalamaz (eşleme tam), kataloğa girmemiş bir izinle prosedür kapılamak **derleme hatasıdır**, ve prosedür yüzeyi tablosu yeni bir prosedürün izinsiz doğmasını mekanik olarak görür.
- Denetim kaydı **birinci sınıf** bir yetenek: yetki değişiklikleri iş yazmasıyla aynı transaction'da, kapalı ve küçük bir `diff` ile kayda geçiyor. Rakiplerin çoğunda denetim izi üst planda ya da hiç yok.
- İzin kataloğu public API yüzeyinin parçası olduğu için **bir izni daraltmak semver olayıdır**; müşteri yetki modelinin sessizce değişmediğini görebilir. Karar 7 bu ilkeyi aynı sürümde uyguluyor: sıkılaştırma yapıldı, **kimsenin yeteneği kaldırılmadan**.
- Kiracı bağlamının yetenekten türediği tek yol **dört koşulla çitlendi** ve koşulların tamlığı ölçüldü; benzer bir uç açmak isteyen gelecek sürüm, koşulları sağlamak ya da ADR'yi tadil etmek zorunda.
- Bu sürüm **hiçbir operatör kırılması getirmiyor**: yeni ortam değişkeni, yeni altyapı servisi ve yeni global enhancer yok.

### Olumsuz ve kabul edilen maliyetler

- **İzinli her istek bir ek üyelik okuması ödüyor** ve önbellekleme oturumun kiracı taşımaması yüzünden kapalı. Karşı önlem: maliyet testle sayılıyor (tam iki okuma); yeniden değerlendirme **v0.0.17**.
- **Sahipsiz kiracı garantisi kod + kapı seviyesindedir, veritabanı garantisi değildir.** Bugün sahipsiz kiracı üretebilecek tek yol kullanıcı hard delete'idir ve **üretimde o yol yok** (grep kapısıyla pinlendi). ⚠ Bu borç **kapanmadı, taşındı**: güçlü (yabancı anahtar) biçim, panel kullanıcısı silme yüzeyi açıldığında uygulanacak ve o sürüm yıkıcı ifade kuralını **iki yönlü testle** rafine etmek zorunda. ⚠ O sürümün ROADMAP'te **tanımlı olmadığı** ölçüldü (yukarıdaki not).
- **Denetim izi tamper-evident değil ve veritabanı sertleştirmesini kendi linter'ımız engelliyor.** Uygulama rolü denetim tablosunda dört DML yetkisinin dördüne de sahip (canlı ölçüm) ve kiracı kapsamlı işlem istemcisi tablonun **tüm** delege yüzeyini açıyor → bir üretim kod yolunun denetim izini silmesi derlemeyi **kırmaz**; tek bekçi yazma çağrısını sayan grep kapısıdır. Veritabanı seviyesinde `REVOKE UPDATE, DELETE` **bugün uygulanamaz**, çünkü katalog linter'ının rol yetkisi kuralı her kiracı tablosu için dört DML'i **şart koşuyor**. Yani sertleştirmenin önündeki engel bir dış kısıt değil, **platformun kendi kuralıdır**. Çözüm yönü: ya denetim tablosu için yazma-only daraltma, ya linter kuralına **tablo başına beklenen yetki kümesi** kavramı; hangisi olursa **iki yönlü mutasyonla** kanıtlanmalı. Vade **v0.0.20** (süper admin / denetim okuma yüzeyiyle).
- **Davet edilen kişinin e-posta adresi süresiz saklanıyor**: satır yalnızca kabul anında siliniyor, süresi geçmiş davetler için temizlik işi ve iptal ucu **yok**. KVKK madde 4 ve 7 karşısında savunulamaz. Çözüm yönü: süresi geçmiş davetleri temizleyen bir kuyruk işi **veya** bir davet iptal ucu; saklama süresi belgelenmeli. ⚠ Vade **veri silme yüzeyiyle birlikte** — o sürüm bugün ROADMAP'te tanımlı değil (yukarıdaki ölçüm).
- **Mutation girdi hataları alan bazlı gövde üretmiyor.** Tel şeması hatası sözleşme sınırının `AppError` dalına hiç girmiyor, jenerik gövdeye düşüyor; CLAUDE.md §4'ün alan bazlı doğrulama sözleşmesi sözleşme yüzeyinde **henüz yok**. Bu sürüm bu dalı ilk kez yoğun kullanıyor. Vade **v0.0.18**, tüketici **v0.1.0**; yeni bir gövde şekli **icat edilmedi**.
- **Davet ucunun sürdürülebilir hacmi kapatılmadı.** İş kuralı üçlüsü (bekleyen davet üst sınırı, tazeleme bekleme süresi, yaşam süresi) **burst'ü** kapatıyor; tazeleme üst sınırı tetiklemediği için sürdürülebilir gönderim hacmi açık kalıyor. Oran sınırı mekanizması **bilerek açılmadı** (vadesi v0.1.0) ve istismar eşiği bugün yüksek: aktörün bir kiracının sahibi/yöneticisi olması gerekiyor ve **self servis kiracı açma ucu yok**. ⚠ Self servis kiracı açma ucundan **önce** kapanmalı.
- **Denetim eylem sözlüğünün tele çıkmaması bir parite pinini bugün gereksiz kılıyor.** İleride bir denetim okuma ucu eklenirse **üçüncü bir parite pini zorunlu olur**; not şemaya yazıldı.

### Etkilenen sonraki kararlar

- **`v0.0.14.1` (ADR-0008 borcunun teslimi) sıra kısıtıyla bağlıdır.** Tek bir PR içinde bile sıra bağlayıcıdır: (a) katalog linter'ına **kolon yetkisi kural sınıfı** eklenecek, (b) **mevcut** tablo yetkisi kuralı üç tablo için kolon bazlı sorguya **tadil edilecek**, (c) **ancak sonra** `REVOKE`/`GRANT` DDL'i uygulanacak. Gerekçe ölçülmüştür: tablo bazlı `REVOKE` uygulandığı **an** mevcut kural üç tablo için bulgu üretir → **linter kural sınıfı teslimin ayağı değil, ön koşuludur**. Sıra yanlış olursa CI kırmızıya döner ve **linteri gevşetme baskısı** doğar (CLAUDE.md §10 madde 6). ADR-0008'in kolon bazlı `REVOKE`'u reddetmesi (`:91`) bu teslimle **çelişmiyor**: reddedilen şey **aynı rolde** kolon `REVOKE`'uydu; kabul edilen **rol ayrımıdır** (tablo `REVOKE` uygulama rolünden, kolon `GRANT` yeni kimlik rolüne). İki iyi haber: bu sürümün iki yeni tablosu **kiracı seviyesidir**, dolayısıyla `REVOKE` işi **platform** tablolarındadır ve **kesişim yok**; davet tablosu ham belirteç saklamadığı için kimlik bilgisi taşıyan kolon sayısı **üçte kaldı**.
- **`v0.0.15` (2FA) bu sürüme bağımlıdır** ve bağımlılığı karşılayan şey **yetki modelidir**, kimlik-rol ayrımı değil → `v0.0.14.1`'in sıralanması Faz 1'i bloke etmiyor.
- **`v0.0.17`** üç kalemi devralıyor: rol okuma maliyetinin yeniden değerlendirilmesi, hata bağlamının log redaction kapsamı (ölçüldü: 22 yoldan yalnızca dördü kapsanıyor) ve platformda **hiç bulunmayan** izleme kimliği alanı.
- **`v0.0.20`** iki kalemi devralıyor: `platform_admin` (impersonation + denetim kaydıyla) ve denetim izinin tamper direnci. REST iş yüzeyi o sürümde açılırsa izin dekoratörü de oraya yazılacak.
- **`v0.0.22`** (sözleşme snapshot koşumu) geldiğinde izin kataloğundaki daraltmalar **mekanik olarak** semver olayına dönüşecek; bugün bu analiz **elle** yapılıyor.

## Gözden geçirme koşulları

Bu ADR'nin yeniden değerlendirilmesini gerektirecek beş durum:

1. **Panelde kiracı seçimi açıldığında** (v0.1.0): üç yazma ucu tarayıcıdan erişilebilir hâle gelir, davet bağlantısının bir karşılığı doğar ve _Ölçülen olgular_ 5. maddesi geçersizleşir. Aynı anda oran sınırının `member.invite`'ı kapsaması gerekir.
2. **İzinle kapılanacak ilk REST iş ucu yazıldığında**: Karar 1'in _"katalog saf veri"_ konumu korunabilir mi, yoksa katalog iki tüketici (sözleşme builder'ı + dekoratör) arasında paylaşılan üçüncü bir yere mi taşınır — bu soru o gün ölçülerek cevaplanacak.
3. **Rol okuma maliyeti ölçülebilir hâle geldiğinde** (v0.0.17): izinli istek başına bir ek nokta okuması kabul edilen maliyettir; trafik altında ölçüm bunu haklı çıkarmazsa Karar 2'nin reddettiği paylaşım yeniden değerlendirilir — ama **iki doğruluk kaynağı** itirazı hâlâ geçerli olacak.
4. **Çoklu sahiplik ürün kararı değişirse**: INV-OWNER'ın gevşetilmesi eklemelidir, fakat CAS deseni _"tam olarak bir"_e dayanıyor; gevşetme **satır kilidi stratejisinin yeniden tasarlanmasını** gerektirir.
5. **Denetim kaydının saklama süresi veya okuma yüzeyi tanımlandığında** (okuma yüzeyi için v0.0.20; saklama süresi için henüz bir sürüm **tanımlı değil**): `diff`in kapalı sözlüğü, e-postanın hiç yazılmaması ve eylem enum'unun tele çıkmaması kararları o yüzeyle birlikte yeniden okunmalı; denetim okuma ucu **üçüncü bir parite pini** gerektirir.
