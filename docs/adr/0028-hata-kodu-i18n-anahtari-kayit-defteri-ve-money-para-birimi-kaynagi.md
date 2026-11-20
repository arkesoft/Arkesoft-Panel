# ADR-0028 — Hata Kodu↔i18n Anahtarı Kayıt Defterinin Yerleşimi, `PanelError`'ın Kapalı Küme Altında Anahtar Taşıması ve `Money`'nin Para Birimi Kaynağı

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-20
- **Karar verenler:** architect (T-027, "R-1 KARARI" + "Money" + "VERİ MODELİ" bölümleri);
  gate'ler: `solid` tur 1-3, `security` tur 1-2, `qa` tur 1-2 (bağımsız ölçümlerle
  doğruladı/düzeltti — aşağıda); kaynak karar: ADR-0010 madde 3.6 ve `:229-232` (bu ADR
  o paragrafı **yürürlüğe koyar**, değiştirmez).
- **İlgili versiyon:** `v0.0.18` (bkz. `ROADMAP.md`)

---

## Bağlam

`v0.0.18` platforma iki altyapı taşıyor: kullanıcıya dönük hata metinleri için merkezi bir
mesaj kataloğu (`packages/i18n`) ve para tutarları için tamsayı-kuruş bir `Money` değer
nesnesi. İkisi de `CLAUDE.md`'nin kuruluştan beri yazılı iki yasağına cevap:

- §4: *"Kullanıcıya dönük hata mesajları `i18n` kataloğundan gelir, kodda sabit (hardcoded)
  yazılmaz."* — ölçüm (`pm`, T-027): üretimde **35 benzersiz** `userMessageKey` literal
  olarak hata sınıflarına gömülüydü, karşılığı üretilmiyordu.
- §2/§10: *"Para birimi float ile tutulmayacak."* — ölçüm: `Money` yoktu, para kolonu **0**.

İki soru bu sürümden uzun yaşayacak ve kodun içinde cevaplanırsa altı ay sonra okuyan kişi
gerekçeyi bulamayacak:

1. **Panel, sunucudan gelen `userMessageKey`'i okuyup Türkçe metne çevirebilir mi?**
   ADR-0010 madde 3.6 ve `panel-error.ts:9-11` bağlayıcı bir garanti taşıyor: *"panel hiçbir
   zarftan gelen metni ekrana basmaz… panelin sunucudan gelen bir metni ekrana basması
   YAPISAL olarak İMKÂNSIZ."* `pm`'in ön ölçümü (T-027) bunu çözülmesi gereken bir **ikilem**
   olarak sundu: (a) çözümleyiciyi ekle ama tüketicisi **sıfır** olsun, (b) ADR-0010 §3.6'yı
   ihlal et.
2. **32 domain hata sınıfının `userMessageKey` literali ile 15-16 panel metninin elle
   tutulan ikinci kopyası arasındaki "otomatik çapraz kontrol MÜMKÜN DEĞİL" defekti
   (`apps/admin/src/messages/messages.ts:12-19`, M7) nerede kapanır?** `packages/errors`
   kuruluşundan beri **yalnızca `zod`'a bağımlıdır** (CLAUDE.md §3); defter buraya konursa
   `packages/i18n`'e bağımlı olamaz.
3. **`Money`'nin kabul ettiği para birimi kümesinin tek doğruluk kaynağı nerede durur** —
   `Currency` veritabanı tablosunda mı, `packages/i18n`'in statik modülünde mi? İlki
   `packages/i18n`'i veritabanına bağımlı kılar (CLAUDE.md §3: `theme-sdk`/`i18n` gibi
   paketler tenant verisine/veritabanına erişmez); ikincisi iki ayrı listenin senkron
   kalmasını gerektirir (migration SQL, TypeScript import edemez).

## Karar

### Karar 1 — `pm`'in (a)/(b) ikilemi yanlış ikilem; üçüncü yol zaten ADR-0010'da yazılıydı

ADR-0010 `:229-232` bu yönü **önceden taahhüt etmişti**: *"i18n çözümlemesi geldiğinde
(v0.0.18): tel gövdesi değişmez…; normalize tip o zaman i18n anahtarını da taşımaya
başlar ve katalog anahtarı koddan anahtara kayar."* `v0.0.18` bu paragrafı **plandan
uygulanmış karara** çevirir (bkz. ADR-0010'a eklenen append-only not).

`PanelError`, telden gelen `message` alanını **kapalı bir küme altında** taşır:

```ts
readonly messageKey: ErrorMessageKey | null   // string DEĞİL
```

`normalize-panel-error.ts` → `errorMessageKeySchema.safeParse(body.message)`; küme dışındaki
**her** değer (ham sunucu metni dahil) `null`'a elenir — `extractAllowlistedFields`'in
(aynı dosya) kardeşi, **aynı tek filtreleme noktasında**. `security` tur 1 bunu **21 düşman
girdi → 21 elendi / 0 sızdı** (ham TR/EN metin, XSS yükü, `''`, uydurma anahtar, önek
eşleşmesi, sayı, nesne/`toString` tuzağı, dizi, iç içe nesne, `null`/`undefined`/`true`,
üç prototip-kirliliği vakası, `JSON.parse` prototip kirliliği nesnesi, `Symbol.toPrimitive`
tuzağı, `String` sarmalayıcı) matrisiyle ampirik olarak doğruladı; tek filtreleme noktası
**mekanik olarak** kanıtlandı: `kind: 'known'` üretim kodunda **tam 2** yerde kuruluyor,
ikisi de `normalize-panel-error.ts` içinde (`apps/admin` `:114`,`:162` ·
`apps/superadmin` `:61`,`:102`); `: PanelError =` elle kurulumu üretimde **0**.

⇒ `panel-error.ts:9-11`'in garantisi **gevşemedi**; ham metin taşıma yasağı **kapalı kümeye
devredildi**. ADR-0010 madde 3.6 **ihlal edilmedi**.

### Karar 2 — kod↔anahtar defteri `packages/errors/src/error-message-keys.ts`'te durur, `i18n`'de değil

`ErrorMessageKey` birleşimi (35 üye) ve `code → anahtar` eşleme sabiti
(`ERROR_MESSAGE_KEYS`, 37 kod → 35 anahtar, çok-bire) `packages/errors`'ta yaşar. Bağımlılık
yönü: `zod ← errors ← i18n ← {admin, superadmin}`; `db → i18n` yalnızca `devDependency` ve
yalnızca `__tests__` import eder.

Bu zorunluluktur, tercih değildir: defter `packages/i18n`'de olsaydı, `packages/errors/src/
error-body.ts`'in iki jenerik hata fabrikası (`'errors.http.generic'`/
`'errors.internal.unknown'`) o paketten okumak zorunda kalırdı ⇒ `errors → i18n` **ve**
`i18n → errors` = **döngü** (CLAUDE.md §3 yasağı). `packages/errors`'ın "yalnızca `zod`"
kısıtı `packages/errors/package.json`'ın **0 satır diff**'iyle korunur (`error-message-keys.ts`
eklendi, bağımlılık eklenmedi).

Kapanış üç kat, hepsi mekanik: (1) üretim tarafı — 33 yazıcı (32 domain hata sınıfı +
`apps/storefront/src/themes/registry.ts`) defterden **okur**, literal yazmaz; `tsc`+ESLint
bunu zorlar (2) katalog tarafı — `tr-tr-errors.ts`'teki katalog nesnesi
`satisfies Record<ErrorMessageKey, string>` taşır ⇒ eksik **ve** fazla anahtar
`tsc --noEmit`'i kırar (mutasyonla kanıtlandı: bir anahtar silindiğinde 4 hata, fazladan bir
anahtar eklendiğinde 1 hata) (3) çalışma zamanı — saf `diffCatalogAgainstKeys()` +
fixture'larla negatif kanıt.

İki panelin (`apps/admin`, `apps/superadmin`) elle tuttuğu platform-kodu aynası
(M7'nin defekti) merkezi deftere taşındı; `apps/superadmin`'in aynası **kendi en alakalı iki
hatasını** (`PLATFORM_ADMIN_REQUIRED`, `PLATFORM_NETWORK_NOT_ALLOWED`) hiç tanımıyordu —
bu, merkezi deftere taşınınca **yapısal olarak** ortadan kalktı (ikinci bir panel aynasını
elle güncellemeyi bekleyen bir adım kalmadı).

### Karar 3 — `Money`'nin para birimi kaynağı `packages/i18n`'in `SUPPORTED_CURRENCIES`'idir, `Currency` veritabanı tablosu değil

`packages/i18n/src/currencies.ts`'teki `SUPPORTED_CURRENCIES` **tek doğruluk kaynağıdır**.
`packages/db`'nin `Currency` tablosu bunun **işletimsel alt kümesidir**
(`currency.code ⊆ SUPPORTED_CURRENCIES`) — veritabanı asla `i18n`'e yazmaz, tersine
`packages/db` `@arkesoft/i18n`'e **yalnızca devDependency** olarak bağlıdır (üretim
bağımlılık grafiği değişmez) ve iki yönlü bir drift testi
(`currency-i18n-consistency.test.ts`) iki listeyi senkron tutar: kod varlığı + `minor_unit`
eşitliği + `['TRY']` pini + negatif kanıt.

İki liste kaçınılmazdır (migration SQL, TypeScript modülü import edemez); emsal birebir
kurulu: `packages/db/src/__tests__/helpers/append-only-tables-sql-consistency.test.ts`.

`Currency` tablosu platform seviyesindedir (`tenant_id` yok, RLS yok), `PLATFORM_LEVEL_TABLES`
dizisine 13. üye olarak eklendi; üç listeye (`APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS`,
`AUTH_SECRET_BEARING_TABLES` + üç kardeşi, yetki DDL'i) **bilerek eklenmedi** — sır
taşımıyor ve `theme`/`plan`/`platform_admin`'in birebir aynı blanket-DML ertelemesini
miras alıyor (gerekçe `packages/db/src/tenancy.ts:139-146`'da yazılı; borç `[low]`,
vade v0.4.0, bkz. ROADMAP Teknik Borç).

`Money`'nin kendisi `BigInt` tabanlı tamsayı aritmetiğidir; para birimi uyuşmazlığı
(`add`/`subtract`/`compare`/`equals`) ve kesirli kuruş (`FractionalMinorUnitError`) **her
zaman fırlatır**. Yuvarlama yalnızca `multiplyByRatio`'da mümkündür ve `mode`
(`'half-up' | 'half-even'`) **zorunludur**, varsayımı yoktur — sessiz/kazara yuvarlama
yapısal olarak imkânsızdır (mutasyon kanıtı: `mode`'suz çağrı `tsc`'yi `TS2554` ile kırar).

#### Düzeltme: güvenli tamsayı koruması tek noktaya indirildi

İlk uygulamada `Money.of`/`add`/`subtract`/`multiplyBy` yalnızca `Number.isInteger`
denetliyordu; güvenli tamsayı aralığı denetimi (`toSafeIntegerFromBigInt`) yalnızca
`multiplyByRatio`'da vardı. Üç bağımsız gate (`solid`, `security`, `qa`) aynı deliğe
yakınsadı: `Money.of(999999999999999,'TRY').multiplyBy(11)` sessizce `10999999999999988`
döndürüyordu (doğrusu `10999999999999989` — 1 kuruş sessiz kayıp), aynı hesap
`multiplyByRatio({11,1})` ile **fırlatıyordu** (asimetri). Düzeltme: `Money.of`'a
`Number.isSafeInteger` eklendi; `add`/`subtract`/`multiplyBy` sonucu **aynı tek noktadan**
(`Money.of`) geçtiği için dördü de aynı garantiyi kazandı — ikinci bir `BigInt` yoluna
geçirmeye gerek kalmadı (aşağıdaki "Değerlendirilen alternatifler" madde 5).

`solid` tur 2'de bu düzeltmenin **matematiksel ispatını** bağımsız olarak kurdu:
IEEE-754 round-to-nearest **monoton**dur ve `±2^53` tam temsil edilir ⇒ gerçek sonuç
`|s| ≥ 2^53` ise yuvarlanmış kayan nokta sonucu da `|fl(s)| ≥ 2^53` olmak **zorundadır**
⇒ *"yanlışlıkla güvenli"* bir değere yuvarlanma **yapısal olarak imkânsızdır**. `security`
bunu 1.307.651 çağrıyla iki yönlü (sessiz-yanlış / yanlış-pozitif) ampirik olarak sınadı:
**0 / 0**.

### Değerlendirilen alternatifler

| # | Alternatif | Neden seçilmedi |
| --- | --- | --- |
| 1 | Panelin çözümleyicisini ekleyip tüketicisini açmamak (sıfır tüketicili çözümleyici) | `pm`'in ön ölçümünün sunduğu seçenekti; ADR-0010 `:229-232`'nin önceden taahhüt ettiği üçüncü yol (kod↔anahtar eşlemesi kalıcı kalır, anahtar taşımaya başlar) hem sıfır-tüketici sorununu hem §3.6 ihlalini aynı anda çözdüğü için gerek kalmadı — **yanlış ikilem** olarak değerlendirildi. |
| 2 | Panelin sunucudan gelen ham metni doğrudan göstermesi (ADR-0010 §3.6'yı gevşetmek) | Bağlayıcı garantiyi (`panel-error.ts:9-11`) geriye dönük ihlal eder; kapalı küme yaklaşımı aynı sonucu (okunabilir metin) garantiyi **gevşetmeden** verir. |
| 3 | Kod↔anahtar defterini `packages/i18n`'e koymak | `packages/errors/src/error-body.ts`'in iki jenerik fabrikası defterden okumak zorunda kalır ⇒ `errors ↔ i18n` döngüsü oluşur (CLAUDE.md §3 yasağı). `packages/errors`'ın "yalnızca `zod`" sözleşmesi bu yönü zorluyor. |
| 4 | `add`/`subtract`/`multiplyBy`'ı `multiplyByRatio` ile aynı `BigInt` yoluna geçirmek | Girdiler zaten `Money.of`'tan geçmiş güvenli tamsayılar; IEEE-754 argümanı (yukarıda) bu dört işlem için `Number.isSafeInteger` kapısının **yeterli ve sıkılaştırıcı monoton** olduğunu gösteriyor — ek bir `BigInt` yolu gerek olmadan aynı garantiyi `Money.of`'un tek noktasından veriyor. `solid`/`security` bağımsız olarak doğruladı (ispat + 1.307.651 ampirik vaka). |
| 5 | `Currency`'nin para birimi allowlist'ini `packages/i18n`'den **türetmek** (kopya listeyi tamamen kaldırmak) | Migration SQL TypeScript modülü import edemez; iki liste kaçınılmaz. Kopyalama + iki yönlü drift testi (emsal: `append-only-tables-sql-consistency.test.ts`) seçildi. |
| 6 | `ExchangeRate` tablosunu bu sürümde dahil etmek | Yazıcısı yok ⇒ sıfır satırlık boş olgu tablosu doğardı; kullanıcı onaylı kapsam daraltmasıyla **v1.5.0**'a ertelendi (`PlanStatus` enum'unun aynı gerekçeyle atlanması emsal gösterildi). |
| 7 | `en-US` içeriğini bu sürümde dahil etmek | Üretimde dil seçici / `Accept-Language` tüketicisi **0** (ölçüldü); format çok-dilli kalır (sentetik `'xx-XX'` fixture'ıyla kanıtlanır), içerik çevirisi kullanıcı onaylı kapsam daraltmasıyla **v1.5.0**'a ertelendi. |
| 8 | Üç panel-kodu kesişimini (`EMAIL_NOT_VERIFIED`, `ACCOUNT_TEMPORARILY_LOCKED`, `INVALID_PASSWORD`) panelin ikinci (sağlayıcı) tablosundan **silmek** | `solid` tur 1 tarafından **reddedildi** (monoton değil): panelin sağlayıcı tablosunu daraltır; merdivenin basamak sırası ileride değişirse bu kodlar jenerik mesaja düşebilir — bugün olmayan bir gerileme yolu açar. Seçilen çözüm: kesişimi **koddan türeten** bir mekanik pin testi (`ERROR_MESSAGES[code] === TR_TR_ERROR_MESSAGES[ERROR_MESSAGE_KEYS[code]]`) — hiçbir vakayı gevşetmez, yalnızca drift'i yakalar; `qa` tarafından iki panelde yazıldı. |

## Sonuçlar

### Olumlu

- İki panelin elle tuttuğu platform-kodu aynası (`apps/admin`, `apps/superadmin`) merkezi
  bir deftere taşındı; `apps/superadmin`'in kendi en alakalı iki hatasını (platform admin/
  ağ kısıtı) tanımaması gibi bir sapma artık **yapısal olarak** doğamaz.
- Yeni bir `errors.*` anahtarı eklemek `tsc --noEmit`'i hem eksik hem fazla yönde kıracağı
  için kataloğun kendisi davranışsal bir kapı hâline geldi.
- `Money`'nin güvenli tamsayı koruması dört işlemin dördünde de aynı tek noktadan geçer;
  v0.4.0 (fiyat) ve v0.7.0 (checkout) sessiz para kaybı sınıfına karşı korunmuş bir temel
  üzerine kurulacak.
- `Currency`'nin tek doğruluk kaynağı `packages/i18n` olduğu için `packages/db`'nin üretim
  bağımlılık grafiğine veritabanı-dışı bir paket **girmedi** (yalnızca devDependency).

### Olumsuz ve kabul edilen maliyetler

- `packages/i18n/src/` bugün **14 üretim dosyası** taşıyor — deponun en büyük düz `src`'si
  (emsallerin ~3 katı). Saflık testi (`purity.test.ts`) `readdirSync`'i `recursive`
  **olmadan** çağırıyor; alt dizin açılırsa bu **aynı değişiklikte** `{recursive: true}`'ya
  çevrilmek zorunda, aksi hâlde test sessizce hiçbir şey taramaz (sahte yeşil). Tetik
  koşulu: `v1.5.0`'ın ikinci locale **içeriği**. Vade v1.5.0 (ROADMAP Teknik Borç).
- `Currency` tablosunun `arkesoft_app` için blanket-DML yetkisi (`DELETE,INSERT,SELECT,
  UPDATE`) daraltılmadı — bugün zararsız (okuyucu 0, FK 0, tek satır) ama ilk para kolonu
  `currency.code`'a FK verdiğinde gerçek bir para-manipülasyon yüzeyine döner. Vade v0.4.0.
- `packages/i18n/src/__tests__/purity.test.ts`'in yan-etki importu süzgeci (`import
  '@arkesoft/db'`, `from`'suz) kaçırıyor; `@arkesoft/config` devDependency olarak iki
  katmandan (saflık deseni + `dependencies` pinleme testi) da kaçıyor. Vade v0.4.0.
- Açık-dünya `resolveMessage` çözümleyicisinin üretim tüketicisi bugün **0**; eksik çeviri
  boş dize (`''`) ile geri düşmeden `''` döner (garantinin gerçek sahibi katalog testi,
  çözümleyici değil). İkinci locale içeriği geldiğinde (v1.5.0) bu davranış yeniden
  gözden geçirilmeli.

### Etkilenen sonraki kararlar

- ADR-0010 madde 3.6 ve `:229-232` **değiştirilmedi**, yürürlüğe konuldu (append-only not
  eklendi).
- ADR-0016'nın gözden geçirme koşulu 2 (`@RequirePermission()` dekoratörünün ikinci
  tüketici kazanması) ile aynı sınıf bir koşul burada da açık: REST iş yüzeyi açılırsa
  kod↔anahtar defterinin fiziksel yeri (bugün `packages/errors`) yeniden değerlendirilmeli.

## Gözden geçirme koşulları

1. **`v1.5.0`'da `en-US` içeriği eklenirse** — `message-resolver.ts`'in açık-dünya
   `resolveMessage` çözümleyicisi ilk gerçek tüketicisini kazanır; boş dize geri düşme
   davranışı (yukarıdaki borç) o zaman kapatılmalı.
2. **`v1.5.0`'da `ExchangeRate` tablosu eklenirse** — `Currency`'nin "tek doğruluk kaynağı
   `packages/i18n`" kararı yeniden değerlendirilmeli; döviz kuru verisi (zaman serisi,
   sağlayıcı kaynaklı) `i18n`'in statik modülüne **uymaz**, veritabanı o veri için doğal
   kaynak olacaktır.
3. **`v0.4.0`'da ilk para kolonu `currency.code`'a FK verdiğinde** — `tenancy.ts:139-146`'da
   yazılı borç kapatılmalı: `bootstrap-roles.sql` §9'un sabit fiil üçlüsü genelleştirilip
   `currency` `arkesoft_app` için salt-okunur hâle getirilmeli.
4. **REST iş yüzeyi açılırsa (ADR-0016 gözden geçirme koşulu 2 tetiklenirse)** — kod↔anahtar
   defterinin ikinci bir tüketicisi (izin dekoratörünün emsaliyle) doğar; defterin
   `packages/errors`'ta durma gerekçesi (yalnızca `zod` kısıtı) o noktada yeniden
   doğrulanmalı.

---

## Kullanım

Bu ADR, `ROADMAP.md` `v0.0.18` sürümünün (T-027) üç bağlayıcı kararını kayda geçirir. İlgili
ölçümler: `.claude/workflow/tasks/T-027.md` (üretim logları + gate turları 1-3),
`.claude/workflow/reviews/T-027-{security,solid,qa,wcag}-tur*.md`.
