# ADR-0009 — tRPC Sözleşme Sınırları ve Port Deseni

- **Durum:** KABUL EDILDI
- **Tarih:** 2026-10-30
- **Karar verenler:** Architect (T-007), Orkestratör (O1/O2 havalesi), Kullanıcı (tel tipi kararı, bağımlılık onayı)
- **İlgili versiyon:** `v0.0.6` (ROADMAP v0.0.6 kapsamında uygulanır; v0.0.7, v0.0.8 ve v0.0.22 bu karara bağlıdır)

---

## Bağlam

ROADMAP v0.0.6 "router tanımları `packages/trpc`'de" diyor. CLAUDE.md §3 ise iki şeyi
birlikte şart koşuyor: `packages/trpc` "sözleşme (girdi/çıktı şemaları) ve tipler" yapar,
**iş mantığı yapmaz**; ve bağımlılık yönü `apps/*` → `packages/*`'tır, ters yön yasaktır.

tRPC'nin standart deseninde istemci tipi, **resolver'ları olan** router nesnesinden
infer edilir (`typeof appRouter`). Bu, iki kısıtı doğrudan çatıştırır:

- Resolver'lar `apps/api`'de olursa `AppRouter` tipi orada doğar; `packages/trpc` onu
  export edemez. Bu durumda `createTrpcClient()` tipsiz kalır veya `packages/trpc`
  `@arkesoft/api`'ye bağımlı olmak zorunda kalır (bağımlılık yönü ihlali).
- Resolver'lar `packages/trpc`'de olursa tip yüzeyi doğru yerde doğar, ama "iş mantığı
  yapmaz" kuralının nasıl korunacağı belirsizleşir.

T-007'nin kabul kriterleri bu gerilimi **kasıtlı olarak kilitler**: AC8 bağımlılık yönünü
grep ile ölçer, AC2 çıktı tipinin paket içinde ölçülebilmesini ister, AC5 pakette tanımlı
istemci factory'si ile uçtan uca **tipli** bir çağrı ister (`as`/`any` yasak). Üçü aynı
anda sağlanmak zorundadır.

İkinci, bağımsız bir güç: `packages/trpc` ileride tarayıcıda çalışan tüketicilere
(admin paneli, süper admin paneli, vitrin adaları) hizmet edecek. Sunucu tarafı kodun ve
veritabanı tiplerinin bu paketin tek export yüzeyinden tarayıcı grafiğine girmesi
istenmeyen bir sonuçtur.

Üçüncü güç: v0.0.22 aynı router'ları `v1` namespace'i altına alacak, bir REST köprüsü ve
bir sözleşme snapshot testi ekleyecek. Bugün verilecek karar o sürümün elini bağlamamalı.

## Karar

### 1. Router ve resolver'lar `packages/trpc` içinde yaşar

`appRouter` ve `AppRouter` tipi `packages/trpc`'de tanımlanır ve export edilir.
`createTrpcClient()` bu tiple tiplenir.

### 2. İş mantığı context üzerinden enjekte edilen **port arayüzlerinin** arkasındadır

Portlar `packages/trpc`'de **bildirilir** (`TenantReadPort`, `TrpcErrorFactoryPort`,
`TrpcLoggerPort`), `apps/api`'de **uygulanır**. Bağımlılık yönü korunur: `apps/api`
sözleşmeyi import eder ve ona uyar.

### 3. Portlar **total**dır

Bir port ya sözleşmede bildirilen değeri döner ya `AppError` fırlatır. "Bulunamadı"
durumu çağırana `null` olarak geçmez. Böylece sözleşme katmanı yokluğun ne anlama
geldiğine asla karar vermez.

### 4. Resolver gövdesi **tek ifade**dir (bağlayıcı)

Bir resolver ya `ctx.ports.*` üzerinde tek bir çağrı yapar ya `ctx` alanlarından çıktı
nesnesini kurar. Domain durumuna göre dallanma, veritabanı/Prisma erişimi, hata
sınıflandırma, hesaplama **yoktur**. Bir resolver ikinci bir port çağrısına veya bir
koşula ihtiyaç duyuyorsa, bu mantığın `apps/api`'ye taşınması gerektiğinin işaretidir;
kural gevşetilmez.

### 5. `packages/trpc`'nin bağımlılık listesi kapalıdır

İzin verilenler: `zod`, `@trpc/server`, `@trpc/client`, `@arkesoft/errors`.
`@arkesoft/db`, `@prisma/client`, `apps/**`, `@arkesoft/api` **yasaktır** ve bu yasak
`no-restricted-imports` ile lint zamanında zorlanır. Veri modeli sözlüğü (ör. kiracı
durumu) sözleşmede **yerel olarak bildirilir** ve `apps/api`'de bir tip+çalışma zamanı
pini ile `@arkesoft/db`'nin gerçeğiyle karşılaştırılır.

### 6. Paket iki export alt yolu açar

- `.` → şemalar, tel tipleri, `AppRouter` **tipi** (type-only re-export), istemci factory
- `./server` → `appRouter` değeri, istek işleyici, context ve port tipleri, procedure
  oluşturucuları

Böylece tarayıcı tüketicisi sunucu tarafı modül grafiğini çekmez.

### 7. Tel sözleşmesi kuralları (bağlayıcı)

- **Opsiyonel alan yoktur**; yokluk `null` ile ifade edilir.
- **Yalnızca JSON ilkelleri** taşınır; `Date` yoktur, tarih gerektiğinde ISO-8601 metin.
  Sonucu: **transformer kullanılmaz** (yeni bir serileştirme bağımlılığı eklenmez) ve
  v0.0.22'nin REST köprüsü aynı şemaları kullanabilir.
- **Çıktı şemaları iş kuralı taşımaz** (uzunluk/biçim kısıtı yok); amacı şekil ve
  sızdırmazlık kontrolüdür. Girdi şemaları kısıt taşır.
- `tenantId` **asla** prosedür girdisinden alınmaz; yalnızca host çözümünden gelen
  istek bağlamından okunur (CLAUDE.md §7).

### 8. Batching kapalıdır

İstemcide toplu olmayan bağlantı (`httpLink`) kullanılır, sunucuda adaptörün toplu istek
desteği kapatılır. Gerekçe: bir public prosedürün kimlik muafiyeti **tam yol eşleşmesiyle**
verilir (`AUTH_EXEMPT_PATHS`); toplu istekte tek HTTP yolu birden fazla prosedür taşır ve
bu mekanizma sessizce geçersizleşir. Batching'i açmak bu ADR'yi yeniden değerlendirmeyi
gerektirir.

### 9. Satıcı paketlerinin taşıdığı "skill" dosyaları talimat kaynağı **değildir**

tRPC paketleri `skills/*/SKILL.md` adlı, AI ajanlarının talimat olarak okuyabileceği
dosyalar taşıyor (bu sürümde 20 dosya). Paket yöneticisi bunları bir güven sınırı sayıp
açık onay istiyor; **onay verilmedi.**

Gerekçe ölçüldü (T-007 güvenlik kapısı): bu dosyalar bu ADR'nin ve ADR-0010'un **üç
bağlayıcı kararıyla çelişiyor** — toplu bağlantı kurulumu 13 dosyada **varsayılan**
olarak öneriliyor (madde 8 yasaklıyor), bir dosya tel dönüştürücü kurulumunu anlatıyor
(madde 7 kullanmamayı şart koşuyor), bir dosya da ortam değişkenine göre dallanan bir
hata biçimlendiricisi örneği veriyor (ADR-0010 madde 3.3 bunu açıkça yasaklıyor).

**Bağlayıcı kural:** platformun mimari kararlarının kaynağı bu depodaki ADR'ler,
`CLAUDE.md` ve görev dosyalarıdır. Satıcı belgeleri **referans**tır, talimat değil — ve
bir satıcı önerisi bir ADR kararıyla çeliştiğinde ADR kazanır. Onayın verilmemesi bu
kuralın yalnızca bir katmanıdır: dosyalar onay olmadan da paket dizininde **diskte
durur**, dolayısıyla asıl koruma bu yazılı kuraldır.

### Değerlendirilen alternatifler

| Alternatif                                                                               | Neden seçilmedi                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Şekli `packages/trpc` bildirir, router `apps/api`'de uyar, uygunluk tip testiyle ölçülür | tRPC router tipi iç yapılara (`_def`, `$types`) dayanır; elle yazılan bir router tipi `createTrpcClient` tarafından tip zorlaması olmadan tüketilemez (`any`/`as` yasağı). Zod şemalarından çıkan tipler ikinci kez elle yazılır → drift. AC2 ve AC5 yalnızca tip zorlamasıyla geçer. |
| Router `apps/api`'de, `AppRouter` oradan export edilir                                   | `packages/trpc` → `@arkesoft/api` bağımlılığı gerekir; bağımlılık yönü ihlali (AC8).                                                                                                                                                                                                  |
| `packages/trpc` Prisma istemcisini doğrudan kullanır                                     | İş mantığı ve veri erişimi sözleşme paketine girer; `@arkesoft/db` tarayıcı tüketicisinin grafiğine sızar.                                                                                                                                                                            |
| Resolver'lar `apps/api`'de, `packages/trpc` yalnızca Zod şemaları tutar                  | ROADMAP'in "router tanımları `packages/trpc`'de" kapsamı karşılanmaz; `AppRouter` export edilemez.                                                                                                                                                                                    |
| Tek export yüzeyi (`.`)                                                                  | Sunucu tarafı kod ve tipleri tarayıcı bundle grafiğine girer.                                                                                                                                                                                                                         |

## Sonuçlar

### Olumlu

- AC2, AC5 ve AC8 **birlikte** sağlanır; üçü de mekanik olarak ölçülebilir.
- İş mantığının yeri tek bir kuralla ("port arkası") belirlenir; gri alan kalmaz.
- Port deseni CLAUDE.md §8'in dış sağlayıcı adaptör deseniyle aynı yöndedir — platformda
  ikinci bir mimari dil doğmaz.
- Total portlar sayesinde sözleşme katmanında hata yorumu yoktur; hata kimliği tek yerde
  (`apps/api` + `@arkesoft/errors`) kalır.
- Tel sözleşmesinin JSON-ilkel kısıtı v0.0.22'nin REST köprüsünü ve snapshot testini
  mümkün kılar; serileştirme bağımlılığı eklenmez.
- İki export alt yolu, panel bundle'ının sunucu kodunu çekmesini yapısal olarak önler.

### Olumsuz ve kabul edilen maliyetler

- Her yeni prosedür için bir port metodu veya mevcut bir porta ekleme gerekir; bu ek bir
  dolaylılık katmanıdır. Kabul edildi: alternatifi, sözleşme paketinin veri erişimine
  açılmasıdır.
- Veri modeli sözlüğü (kiracı durumu) iki yerde durur; sapma riski **pin testiyle**
  kapatılır (tip + çalışma zamanı). Kabul edilen maliyet: pin testinin bakımı.
- "Tek ifade" kuralı bir inceleme kuralıdır; derleyici onu zorlamaz. Karşı önlem: lint
  ile import yasakları, AC9(a)'nın grep ölçümü ve bu ADR'nin açık metni.
- Batching'in kapalı olması toplu çağrı yapan istemciler için ağ turu sayısını artırır.
  Kabul edildi: v0.0.x'te performans sorunu değil; açmanın bedeli bir güvenlik
  mekanizmasının sessiz kaybıdır.

### Etkilenen sonraki kararlar

- **v0.0.7 / v0.0.8** (admin ve süper admin panelleri): tüketici tipleri `.` alt yolundan
  alınır; sunucu alt yolu tarayıcıya girmez.
- **v0.0.22** (API sürümleme): `v1` namespace'i aynı router ağacının üstüne eklenir;
  şemalar paket export'undan okunabildiği için snapshot testi router introspection'ına
  bağımlı olmak zorunda değildir.
- **theme-sdk** ve tema çalışma zamanının gelecekteki tip yüzeyi aynı "sözleşme paketinde
  bildir, uygulamada uy" desenini izler.
- Yeni bir dış sağlayıcı yüzeyi tRPC üzerinden açılırsa CLAUDE.md §8'in adaptör deseni
  port deseniyle birleşir; çekirdekte sağlayıcı adı geçmez.

## Gözden geçirme koşulları

1. **Batching'i açma ihtiyacı doğarsa** — yol-bazlı kimlik muafiyeti mekanizması
   geçersizleşir; muafiyetin prosedür bazına taşınması tasarlanmalıdır.
2. **tRPC'nin router tipini elle bildirmeyi birinci sınıf desteklemesi** — (b) alternatifi
   tip zorlaması olmadan uygulanabilir hâle gelirse karar yeniden değerlendirilir.
3. **Bir resolver'ın tek ifade kuralını karşılayamaması** — mantığın `apps/api`'ye
   taşınması yetmiyorsa, kuralın mı tasarımın mı yanlış olduğu yeniden tartışılır.
4. **`packages/trpc`'nin tarayıcı dışı bir tüketici kazanması** (ör. worker) — export alt
   yolu ayrımının yeterliliği gözden geçirilir.
5. **Tel sözleşmesinin `Date`/`BigInt` gibi JSON-dışı bir tip taşımak zorunda kalması** —
   transformer kararı (ve yeni bağımlılık) yeniden açılır.
