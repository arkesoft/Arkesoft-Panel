# ADR-0021 — Girdi kaynaklı kiracı seçimi ve kiracısız prosedür sınıfları

- **Durum:** Önerildi
- **Tarih:** 2026-11-12
- **Karar verenler:** architect (T-019), Orkestratör, kullanıcı
- **İlgili versiyon:** `v0.1.0` (bkz. `ROADMAP.md`)

---

## Bağlam

`packages/trpc/src/trpc.ts:12-15` prosedür merdivenini iki eksenin çarpımı olarak
tanımlar: **kimlik** (yok/zorunlu) × **kiracı** (yok/zorunlu). Dört hücreden üçü bugün
kullanımda:

|                 | kiracı host'tan ÇÖZÜLÜ                      | kiracı ÇÖZÜLMEMİŞ                                                           |
| --------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| **kimlik YOK**  | `publicTenantProcedure` — ADR-0012          | `publicProcedure` — **hiç kullanılmıyor**                                    |
| **kimlik VAR**  | `tenantProcedure` / `permissionProcedure`   | `protectedProcedure` — `session.me`, `session.list`, `member.acceptInvitation` |

`CLAUDE.md` §7'nin kontrol listesi _"Prosedür `tenantProcedure` (veya
`permissionProcedure`) kullanıyor; `publicProcedure` değil"_ der ve **tek** istisna olarak
`publicTenantProcedure`'ü (ADR-0012 §1) adlandırır. Yani sağ üst hücrenin üç mevcut
sakini (`session.me`, `session.list`, `member.acceptInvitation`) §7'nin lafzında
**adlandırılmamış** hâlde yaşıyor; gerekçeleri `apps/api/src/tenancy/tenant-exempt-paths.ts`
dosya başı yorumuna dağılmış durumda ve o dosya `:111-112`'de şunu şart koşuyor:
_"Kümeye bir sonraki ekleme BU GEREKÇE SEVİYESİNİ karşılamak zorundadır."_

v0.1.0 (kayıt → kiracı oluşturma → alt alan adı) bu hücreye **üç** yeni sakin ekliyor ve
ikisi niteliksel olarak yeni:

1. **Kiracı henüz YOK ÇÜNKÜ BU ÇAĞRI ONU YARATIYOR** — `registration.createTenant`.
   Yetkilendirilecek bir kiracı yoktur; sahiplik _kontrol edilmez_, _kurulur_.
2. **Kiracı VAR ama host'tan ÇÖZÜLEMİYOR** — `registration.onboardingChecklist`.
   Ölçülmüş yapısal gerçek: panel `panel.{APP_BASE_DOMAIN}` host'unda servis edilir, bu
   etiket `packages/tenancy/src/reserved-subdomains.ts`'in rezerve listesindedir,
   `resolveHost` onu `reserved_subdomain` ile çözümsüz bırakır, ve panelin tRPC
   istemcisinin URL'si görelidir (`apps/admin/src/app/panel-config.ts:65` →
   `TRPC_URL = '/trpc'`). Sonuç: `tenant.current` dahil **hiçbir** kiracı kapsamlı
   prosedür panelden çağrılamaz (ölçüldü: `apps/admin/src` içinde `tenant.current`
   çağrısı sıfır; panel yalnızca `session.*` çağırıyor). Bu, `ROADMAP.md:3113`'ün
   **architect**'e ve **v0.1.0**'a atanmış açık borcudur.

Çatışan güçler:

- `ADR-0009 madde 7` bağlayıcı biçimde _"`tenantId` ASLA prosedür girdisinden alınmaz;
  yalnızca host çözümünden gelen istek bağlamından okunur"_ der.
- `CLAUDE.md` §7 _"Girdideki hiçbir `id` doğrudan güvenilmiyor; sahiplik doğrulanıyor"_
  der — yani girdiden id almayı yasaklamaz, **güvenmeyi** yasaklar.
- `withTenant()` + RLS `FORCE` mimarisi çapraz kiracı okumayı **yapısal olarak**
  imkânsız kılar; "bu kullanıcının kiracıları" sorusunun bugün bir cevap yolu yoktur.
- `ADR-0011` panel orijin topolojisini bilinçli olarak tek host'ta sabitledi; onu
  kiracı başına host'a çevirmek _"bir hesap → birden fazla mağaza"_ vaadiyle çatışır.

Karar şimdi gerekiyor çünkü v0.1.0 olmadan kiracı hiç doğmuyor ve kontrol listesi
hiçbir yoldan servis edilemiyor.

## Karar

### 1. Dördüncü hücre (`publicProcedure`) v0.1.0'da AÇILMAYACAK

Slug müsaitlik kontrolü **anonim olmayacak**. Gerekçe ROADMAP'in kendi sihirbaz
sırasıdır (`:1282` — _"hesap → mağaza adı → slug (müsaitlik kontrolü) → site tipi"_)
ve ölçülmüş kimlik davranışıdır (`apps/api/src/auth/auth-instance.ts:690`
`requireEmailVerification: true`; `auth-flow.test.ts:266` — kayıt bir oturum
üretmez): kullanıcı slug adımına geldiğinde doğrulanmış ve oturum açmış durumdadır.
`AUTH_EXEMPT_PATHS` bu sürümde **on iki üyede kalır**.
`packages/trpc/src/authz/procedure-surface.ts:56-58`'in _"o builder bir gün bir
prosedürü kaplarsa bu birleşimi genişletmek AÇIK bir karar olacak"_ notu
**tetiklenmez**; `builder` birleşimi değişmez.

### 2. Üçüncü hücrenin (`protectedProcedure` · kiracı çözülmemiş) BEŞ ZORUNLU KOŞULU

Bu hücreyi kullanan ve `TENANT_EXEMPT_PATHS`'e eklenen her prosedür beşini birden
karşılamak zorundadır (ADR-0016 §6'nın dört koşulunun genelleştirilmiş hâli):

- **A. BEYAN EDİLEN KİRACI KİMLİĞİNE ASLA GÜVENİLMEZ.** Girdi bir kiracı seçici
  taşıyorsa, o seçici yalnızca _hangi_ kiracı bağlamının kurulacağını belirler;
  _erişim hakkını_ belirlemez. Hak, bağlam kurulduktan sonra `tenant_membership`
  üzerinden **kiracı kapsamlı blok içinde** doğrulanır.
- **B. SAHİPLİK DOĞRULAMASI İLK İŞTİR.** Doğrulama başarılı olmadan hiçbir kiracı
  verisi okunmaz veya yazılmaz. Kiracı satırının kendisi (platform tablosu) dahi
  doğrulamadan **sonra** okunur — aksi hâlde prosedür bir varlık oracle'ına dönüşür.
- **C. TÜM RET MODLARI TEK HATA SINIFINA İNDİRGENİR.** "Kiracı yok", "üye değilsin",
  "soft-delete edilmiş", "biçim bozuk" — dördü de **aynı 404**. Ayırmak kiracı
  varlığını sızdırır (`CLAUDE.md` §7, ADR-0010 §5).
- **D. ÇIKTI YALNIZCA ÇAĞIRANIN KENDİ KİRACISINA AİT VERİ TAŞIR** ve başka hiçbir
  kiracının varlığına dair bilgi taşımaz.
- **E. SUİSTİMAL YÜZEYİ BEYAN EDİLİR VE ORAN SINIRINA BAĞLANIR.** Prosedür başına
  istek başına veritabanı maliyeti, numaralandırma/üretme oranı ve uygulanan oran
  sınırı politikası yazılı olarak beyan edilir (ADR-0012 koşul D'nin genişletilmiş
  hâli).

`ADR-0009 madde 7`'ye bu ADR **adlandırılmış bir istisna** açar: _"`tenantId` prosedür
girdisinden alınmaz"_ kuralı **kiracı host'tan çözülebildiği** prosedürler için
yürürlükte kalır; çözülemediği hücrede koşul A+B birlikte aynı güvenlik garantisini
sağlar. İstisna hücreye bağlıdır, prosedüre değil — `tenantProcedure` kullanan hiçbir
prosedür girdiden kiracı almaya başlayamaz.

### 3. v0.1.0'ın üç prosedürü ve koşul kanıtları

| Prosedür                             | Builder                | Kiracı kaynağı                 | A                              | B                           | C                            | D                           | E                                                                            |
| ------------------------------------ | ---------------------- | ------------------------------ | ------------------------------ | --------------------------- | ---------------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `registration.checkSlugAvailability` | `protectedProcedure`   | yok (kiracı kavramı geçersiz)  | —                              | —                           | ✓                            | ✓ tek `outcome` alanı       | ✓ 1 tekil indeks okuması; oran sınırı `sessionUserId` kapsamı; istemci debounce |
| `registration.createTenant`          | `protectedProcedure`   | **yaratılır**                  | — (girdide kiracı seçici yok)  | — (sahiplik _kurulur_)      | ✓                            | ✓ yalnızca yeni satır       | ✓ oran sınırı; sert kota v0.17.0 (bkz. Sonuçlar)                              |
| `registration.onboardingChecklist`   | `protectedProcedure`   | **girdiden (`slug`)**          | ✓                              | ✓                           | ✓ dört ret → aynı 404        | ✓ yalnızca adım anahtarı + durum | ✓ 2 okuma; slug zaten herkese açık                                        |

### 3.1 Keşif (discovery) ≠ Erişim (access)

§2'nin beş koşulu **erişim** sorusunu çözer: _"çağıran bu kiracıya dokunabilir mi?"_
**Keşif** sorusunu — _"çağıran hangi kiracıya dokunmak istediğini nasıl bilir?"_ —
çözmez ve bu ADR onu bilerek çözmez.

Keşif için platform seviyesinde bir `user → tenant` projeksiyonu gerekir ve
**yoktur**: bağ yalnızca `tenant_membership`'te yaşar, o tablo kiracıya bağlıdır ve
RLS `FORCE` taşır; kiracı bağlamı kurulmamışken sorgu **sıfır satır** döner. Üç
teorik çıkış da kapalıdır (`CLAUDE.md` §10 md 4 `BYPASSRLS`; §7 `SECURITY DEFINER`;
`tenant_membership`'e ikinci permissive politika — izolasyonu gevşetir **ve** canlı
katalog linter'ının _"tablo başına tam bir politika"_ kuralını kırar).

⇒ **Seçici insan-okunur ve herkese açık olmak ZORUNDADIR**, iç kimlik değil. Bu
yüzden seçici `tenantId` değil **`slug`**'dır. Slug kullanıcının genel adresidir;
yeni bir cihazda **kullanıcı tarafından hatırlanabilir**, rotada taşınabilir
(`/kurulum/{slug}`), yer imlenebilir. Bir cuid2 bunların hiçbiri değildir ve
`storefront-tenant.schema.ts:19-21` iç kimliği tele koymayı ayrıca reddediyor.
Simetrik karar: `registration.createTenant`'ın çıktısı da `tenantId` **taşımaz**
(`{ slug, status }`) — iç kimlik tele hiç çıkmaz.

İstemci tarafı hatırlama (son kullanılan slug) **bir kolaylıktır, doğruluk kaynağı
değildir**: kaybı kullanıcıyı kilitlemez, yalnızca adresini bir kez yazdırır.
⚠ Hatırlanan slug yoksa gösterilen seçici girdisinin ret mesajı **tek cümledir**:
"yok olan slug" ile "başkasının slug'ı" ayırt **edilmez** (koşul C).

`checkSlugAvailability`'nin `taken` çıktısı bir kiracının **varlığını** bildirir. Bu
**yeni bir bilgi sınıfı değildir**: `{slug}.{APP_BASE_DOMAIN}` adresinin çözülüp
çözülmediği bugün anonim olarak gözlemlenebilir (ADR-0012 koşul D bu numaralandırma
oranını zaten beyan ettiriyor). Değişen şey bilginin **maliyeti ve oranıdır** ⇒ kapı
oran sınırı ve doğrulanmış hesap şartıdır, çıktı maskeleme değildir. Soft-delete
edilmiş bir kiracının slug'ı `slug @unique` nedeniyle hâlâ tutulduğundan müsaitlik
**soft-delete edilmiş satırları da dikkate alarak** hesaplanır; aksi hâlde kontrol
"müsait" der, kayıt benzersizlik ihlaliyle patlar.

### 4. Kayıt yazımı TEK TRANSACTION olacak

`packages/db/src/tenant-context.ts`'e `withNewTenant()` eklenir: tek transaction
içinde (1) platform `tenant` satırı yazılır, (2) tenant GUC'u o satırın id'sine
`set_config(…, true)` ile bağlı parametre olarak ayarlanır, (3) kiracı kapsamlı
satırlar (`tenant_membership(owner)`, `subscription`) yazılır. Gerekçe `CLAUDE.md` §4
(_"Çok kayıtlı yazma işlemleri transaction içinde"_) ve ölçülmüş yapısal duvardır:
`AppPrismaDatabase` `$transaction` taşımaz (`client.ts:214`), `TenantTransactionClient`
`tenant` taşımaz (`client.ts:266-269`). GUC adı literali **yalnızca**
`tenant-context.ts`'te geçmeye devam eder (K-E12/AC4 jeton taraması korunur). Bu
fonksiyon **yeni bir yetki vermez**: çağıranın GUC'u keyfi bir kiracıya
ayarlayabilmesi bugünkü `withTenant(herhangiBirId, …)` ile birebir aynıdır — bu,
ileride yanlış okunmaması için fonksiyonun doc yorumunda yazılıdır.

### 5. `CLAUDE.md` §7'ye madde eklenmesi ÖNERİLİR, bu ADR ile UYGULANMAZ

§7'nin ilgili maddesi bu hücreyi bugün kapsamıyor. Önerilen madde, §2'nin beş
koşuluna atıf veren tek satırdır. ⚠ `CLAUDE.md`'ye hiçbir ajan dokunmaz (T-018
emsali) — düzenleme Orkestratör'ün ve kullanıcının kararıdır.

### Değerlendirilen alternatifler

| Alternatif                                                                            | Neden seçilmedi                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Slug müsaitliğini `publicProcedure` ile anonim açmak                                  | Gereksiz: kullanıcı o adımda zaten oturumlu (ROADMAP`:1282` + `requireEmailVerification: true` ölçümü). Platformun hiç kullanılmamış anonim builder'ını bir UX kolaylığı için ilk kez açmak, `AUTH_EXEMPT_PATHS`'i büyütmek ve anonim numaralandırma oranını artırmak demekti.                                 |
| Paneli kiracı başına host'ta servis etmek (`{slug}.…/panel`)                           | `ADR-0011`'in panel orijin topolojisini bozar, _"bir hesap → birden fazla mağaza"_ vaadiyle çatışır, ve o host bugün **vitrindir**.                                                                                                                                                                           |
| `onboardingChecklist`'i `tenantProcedure` yapıp `/trpc/tenant.*`'ı kiracı muafiyetine almak | Muafiyet `TenantGuard`'ın 404'ünü kapatır (ADR-0012'nin bağlayıcı kararı) ve kiracı bağlamı yine kurulmaz — prosedür `ctx.tenant`'a erişemez, yani çalışmaz.                                                                                                                                             |
| Kontrol listesini `createTenant` yanıtından istemci durumunda tutmak                  | Sayfa yenilemede kaybolur; `AC-19`'un _"sunucudan okur"_ şartını ihlal eder; iş kuralını istemciye taşır (`CLAUDE.md` §10 md 15).                                                                                                                                                                             |
| Kullanıcının kiracılarını listeleyen bir prosedür (tam tenant switcher)                | Çapraz kiracı okuma gerektirir → `withTenant` + RLS `FORCE` altında **yapısal olarak yok** (`ROADMAP:3113`). v0.1.0 kapsamında değil; v0.1.0 kullanıcısının tam bir kiracısı var.                                                                                                                              |
| Kayıt yazımını iki fazda bırakıp telafi (compensation) yazmak                          | `CLAUDE.md` §4'ü ihlal eder ve kaçınılmaz bir hata sınıfı doğurur: sahipsiz kiracı, kalıcı olarak tutulan slug, kullanıcının kendi kiracısına erişememesi.                                                                                                                                                     |
| `TenantStatus` enum'una `deleted` eklemek                                              | `schema.prisma:814-815` (A-V8) ve `T-001.md:1217` bunu zaten yasaklıyor; çift doğruluk kaynağı doğurur (ADR-0020 Karar 1'in kapattığı sınıf) ve yayınlanmış bir çıktı enum'unu genişletmek tartışmalı biçimde MAJOR'dır.                                                                                      |
| `session.me`'ye kiracı/slug sinyali eklemek                                            | §2'nin koşul A/B'si burada **işlemez** — ikisi de çağıranın verdiği bir seçicinin varlığını varsayar, `session.me`'nin seçicisi yoktur. Seçicisiz yol platform seviyesi bir `user → tenant` projeksiyonu ister; yoktur ve üç çıkışı da kapalıdır (§3.1).                                                       |
| Platform seviyesi `TenantOwnership` ayna tablosu                                       | Üyeliğin **ikinci doğruluk kaynağı** olurdu — ADR-0020 Karar 1'in kapattığı borç sınıfının, hem de en güvenlik-kritik ilişki üzerinde tekrarı. Ayrıca kapsam genişletmesi.                                                                                                                                    |
| `tenant_membership`'e `user_id` tabanlı ikinci politika                                | Permissive politikalar OR'lanır → kiracı izolasyonu gevşer; ayrıca canlı katalog linter'ının "tablo başına tam bir politika" kuralını kırar.                                                                                                                                                                  |
| `Session`'a `activeTenantId` kolonu                                                    | `session` delegesi `AppPrismaDatabase` allowlist'inde yok (`client.ts:214`) ve `AUTH_SECRET_BEARING_TABLES` üyesidir (`tenancy.ts:196-201`) → `apps/api` onu `AuthModule` dışında okuyamaz/yazamaz; tip ve lint katmanı birden engeller.                                                                      |
| Seçiciyi `tenantId` (cuid2) tutup yalnızca istemcide saklamak                           | Yeni cihaz/gizli pencere/temizlenmiş depolama → kullanıcı **kendi kiracısına ulaşamaz** ve panelin kurtarma yolu yok; v0.1.0'ın hedefini kısmen boşa düşürür.                                                                                                                                                 |

## Sonuçlar

### Olumlu

- `ROADMAP:3113`'ün **erişim** yarısı cevaplandı (seçici + blok içi sahiplik
  doğrulaması); **keşif** yarısı cevaplanmadı ve bu ADR onu bilerek cevaplamıyor
  (§3.1). Satır **açık kalır**, vadesi **v0.0.20**'ye kayar.
  ⚠ Bu, bu ADR'nin ilk taslağındaki _"yapısal soru cevaplandı"_ iddiasının
  **architect tarafından yapılan düzeltmesidir** — iddia fazla genişti.
- Anonim yüzey **büyümedi**: `AUTH_EXEMPT_PATHS` on iki üyede kaldı, `publicProcedure`
  hâlâ hiç kullanılmıyor, `procedure-surface.ts`'in builder birleşimi değişmedi.
- Kayıt yazımı atomik: sahipsiz kiracı sınıfı yapısal olarak imkânsız.
- Beş koşul, bundan sonraki her `TENANT_EXEMPT_PATHS` eklemesi için ölçülebilir bir
  kabul kapısı oluşturdu (o dosyanın `:111-112`'deki şartının karşılığı).
- Tam tenant switcher (v0.0.20/süper admin ve çok kiracılı panel) bu deseni **aynen**
  devralabilir; yeni bir mimari karar gerekmeyecek.

### Olumsuz ve kabul edilen maliyetler

- **`ADR-0009 madde 7` artık koşullu.** Kuralın mutlaklığı kayboldu; yerine hücreye
  bağlı bir istisna geldi. Karşı önlem: istisna **hücreye** bağlı, prosedüre değil —
  `tenantProcedure` kullanan hiçbir prosedür girdiden kiracı alamaz, ve bu
  `tenant.router.ts`'in dosya kapsamlı beyanıyla görünür kalır.
- **Doğrulanmış bir kullanıcı sınırsız kiracı üretebilir.** Sert kota kullanıcının
  owner üyeliklerini kiracılar arası saymayı gerektirir ⇒ bugün yapısal olarak yok
  (bu, `ROADMAP:3113`'ün duvarının **ikinci bağımsız örneğidir** ve ADR'nin o satıra
  verdiği cevabın sınırını gösterir). Karşı önlem v0.1.0'da **oran sınırıdır**; sert
  kota v0.17.0'a (abonelik/limit enforcement) kayıtlı borçtur.
- **`withNewTenant` ikinci bir GUC yazıcı yoldur.** Güvenlik-kritik yüzey bir
  fonksiyondan ikiye çıktı. Karşı önlem: aynı dosya, aynı sabit, aynı `WeakMap`
  kaydı, aynı fail-closed kontrolleri, ve `PlatformTenantWriter`'ın daraltıldığını
  doğrulayan negatif tip pini.
- **`subscription` tablosu çapraz kiracı okunamaz.** v0.17.0'ın MRR/churn panosu bu
  mimaride doğrudan yazılamaz; ayrı bir okuma yolu (ayrı rol veya `SECURITY INVOKER`
  view) ve ayrı bir ADR gerekecek.
- **`arkesoft_app` `plan` tablosunda blanket DML taşıyor** (çalışma zamanı rolü plan
  limitlerini güncelleyebilir). T-018'in `theme`/`theme_release`/`platform_release`
  için yaptığı birebir aynı erteleme; `security` gate'e devredildi.
- **Slug'ını tamamen unutan ve istemci saklamasını temizleyen kullanıcı destek
  gerektirir.** v0.1.0'da bedel sınırlı: gelir öncesi, provisioning öncesi, kullanıcı
  başına bir kiracı, ve slug kullanıcının kendi genel adresi. Karşı önlem olarak
  _"mağaza adresin"_ bilgilendirme postası **bu sürümde EKLENMEDİ** (tek mevcut kayıt
  postası `sendOnSignUp`'tır ve slug **doğmadan önce** gider —
  `auth-instance.ts:711-716`); adıyla borca yazıldı. Yapısal çözüm kiracı listesidir
  ve çapraz kiracı okuma cevabını bekler (v0.0.20+).

### Etkilenen sonraki kararlar

- **ADR-0012** değiştirilmez; bu ADR onun kardeşidir (farklı hücre).
- **ADR-0016 §6**'nın dört koşulu bu ADR'nin beş koşulunun **özel hâli** olarak
  okunacaktır; `member.acceptInvitation` geriye dönük olarak beşini de karşılar.
- **ADR-0011** (panel orijin topolojisi) **değişmez** ve bu ADR onu korumanın bedelini
  açıkça ödemektir.
- **`ROADMAP:3113` AÇIK KALIR**, vadesi **v0.0.20**'ye kayar (§3.1): erişim yarısı
  cevaplandı, **keşif** yarısı çapraz kiracı okuma cevabını bekliyor. `session.me`'nin
  kiracı politikası (`setup_required`) sinyalini taşıma boşluğu **ayrı** bir kalemdir
  ve bu ADR onu da kapatmaz.
- **v0.17.0** iki yeni yükümlülük devralır: sert kiracı kotası ve çapraz kiracı
  abonelik okuma yolu.

## Gözden geçirme koşulları

- Kayıt öncesi (anonim) bir slug müsaitlik kontrolü ürün olarak gerekirse → §1 yeniden
  değerlendirilir ve `publicProcedure`'ün ilk açılışı kendi ADR'sini hak eder.
- Çok kiracılı panel/tenant switcher geldiğinde (v0.0.20 veya sonrası) → §2'nin koşul
  A/B'si bir **liste** prosedürü için yeniden ölçülmelidir; bugünkü desen tek kiracı
  seçicisi varsayıyor.
- `withTenant` mimarisi çapraz kiracı okumaya bir yol açarsa (ayrı rol, view, ayrı
  havuz) → sert kota ve §2 koşul E yeniden ele alınır.
- `ADR-0011`'in panel orijin topolojisi değişirse → bu ADR'nin varlık sebebinin yarısı
  ortadan kalkar ve §3 sadeleşebilir.
- `CLAUDE.md` §7'ye önerilen madde eklenirse → §5 güncellenir.
- Bir kullanıcının **ikinci kiracısı** olabildiği an (çok kiracılı panel) → slug tabanlı
  tek seçici yetmez; §3.1 ve keşif yolu yeniden ele alınır.
