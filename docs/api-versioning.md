# API Sürümleme

> Bu belge `v0.0.22` (`T-026`, `AC-39`) ile kuruldu. Mekanik dayanağı
> `docs/adr/0027-public-api-sozlesme-yuzeyinin-olcumu-ve-semver-siniflandirmasi.md` —
> tasarım gerekçeleri ve reddedilen alternatifler orada; burada **operatöre dönük**
> prosedürler var.

---

## 1. Dört versiyonlanan birim

Arkesoft'ta dört ayrı birim kendi semver'ini taşır:

| Birim              | Nerede yaşar                                                         | Bugünkü sürüm                                                                                                          |
| ------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Platform** (kök) | `arkesoft` + 11 paketlik `fixed` grup (`@arkesoft/versioning` dahil) | `0.10.3` (bu sürümle `0.11.0`'a çıkar — bkz. `ADR-0027` Karar 1)                                                       |
| **`theme-sdk`**    | `packages/theme-sdk`                                                 | ayrı semver, bu sürüm etkilemiyor                                                                                      |
| **Her tema**       | `packages/themes/<tema>`                                             | ayrı semver (ör. `modern`, `corporate`), bu sürüm etkilemiyor                                                          |
| **Public API**     | `packages/trpc`'nin dışa açtığı prosedür yüzeyi                      | `@arkesoft/trpc` paket sürümü `0.8.3` taşıyıcı; **sözleşme yüzeyi** bu sürümde **hareket etmiyor** (17 prosedür sabit) |

Dördünün ayrı taşınma gerekçesi ve tam sürüm politikası `ROADMAP.md` → _Sürüm Politikası_
bölümünde. Bu belge yalnızca **Public API** satırının mekanik tarafını anlatır.

## 2. Yol bazlı major kuralı — `/trpc/v1` HENÜZ UYGULANMADI

`ROADMAP.md`'nin sürüm politikası public API için yol (path) bazlı major kuralını
tanımlar: `v1`, `v2` gibi sürümler yan yana yaşar (`/trpc/v1`, `/trpc/v2`).

**⚠ Bugün (`v0.0.22`) bu kural yalnızca politika düzeyinde var — koşan koddaki namespace
yapısı düz (namespace'siz): `job`, `platform`, `tenant`, `registration`, `session`,
`member`, `storefront`, kök `app.router.ts`.** `/trpc/v1` taşıması **kapsamlı bir karar**
gerektiriyor çünkü prosedür yolu `apps/api`'de bir **politika anahtarı** — tenant muafiyet
tablosu, oran sınırı tablosu, auth muafiyet tablosu gibi yedi güvenlik politika tablosunda
string anahtar olarak geçiyor (53 giriş). Bu taşıma **`v0.0.23`'e açılmış bir kapsam
slotu** olarak ROADMAP'e yazılmıştır (bu sürümde **uygulanmaz**, yalnızca kapsam
kararlaştırılmıştır).

⇒ `/trpc/v1` bugün **henüz uygulanmadı**. Bir istemci kodu `/trpc/v1/...` çağırırsa 404
alır; bu beklenen davranıştır, hata değildir.

## 3. Sözlük ayrımı — "sözleşme yüzeyi" ≠ "snapshot"

Bu depoda iki farklı kavram vardı ve adlandırma çakışıyordu:

- **`packages/versioning`**'deki `TenantVersionState.previousState` — bir **kiracının**
  rollback için tutulan önceki sürüm durumu (ADR-0020 Karar 1). Bu kavramın adı
  **"snapshot"**tır ve bu jeton ona **rezervedir**.
- **`packages/trpc`**'deki yeni kavram — public API'nin **router yüzeyinin** (prosedür
  adı, işlem türü, girdi/çıktı şema şekli) sürüm kontrolünde tutulan tek bir üretilmiş
  dosyaya projeksiyonu. Bu kavramın adı **"sözleşme yüzeyi" / `contractSurface`**'dir;
  dosyası `docs/api-contract-surface.json`.

`ROADMAP.md`'nin _"sözleşme snapshot testi"_ ifadesi (ör. kapsam maddesinde,
`ROADMAP.md:1739` bloğu) **bu ikinci kavrama** — yani sözleşme yüzeyi testine — işaret
eder. Komut adı (`pnpm test:contract`) de bu ikinci kavrama bağlıdır ve **korunmuştur**;
`CLAUDE.md` §6/§9 ve `ROADMAP.md:2461` onu bu adla belgeliyor, değiştirilmedi.

## 4. Sözleşme yüzeyi — yenileme komutu

Sözleşme yüzeyi dosyası (`docs/api-contract-surface.json`) elle düzenlenmez. Yüzey
**kasıtlı** değiştiğinde (yeni prosedür, alan eklendi/kaldırıldı, tip değişti) şu komut
dosyayı yeniden üretir:

```bash
pnpm --filter @arkesoft/trpc run contract:generate
```

Ardından doğrulama (sözleşme yüzeyi testi, odaklı takma ad):

```bash
pnpm test:contract
```

`test:contract`, `packages/trpc`'nin normal `vitest` glob'unda yaşayan
`src/__tests__/contract-surface.test.ts` dosyasının odaklı bir takma adıdır
(`packages/trpc/package.json` → `"test:contract": "vitest run
src/__tests__/contract-surface.test.ts"`). Kök zorunlu kapı (`pnpm test`) bu dosyayı
**zaten** koşturur; `pnpm test:contract` aynı testi tek başına, odaklı çalıştırmak
içindir.

**Determinizm:** üretim komutu art arda iki kez koşturulduğunda çıkan dosya bayt-birebir
aynı olmalıdır (md5 eşleşmesi). Aynı değilse bu bir tasarım kusurudur — rastgele kimlik,
zaman damgası, mutlak yol veya sıralanmamış bir dizi sızmış olabilir; dosyayı elle
düzeltmeyin, `ADR-0027`'nin D1-D7 determinizm önlemlerinden hangisinin ihlal edildiğini
bulun.

⚠⚠ **İçerik kapısı — bir `default`/`description` artefakta görünmesi "beklenen gürültü"
DEĞİLDİR, KAPI İHLALİDİR.** `security` gate'in T-026 tur 1 ölçümü (dosya:
`.claude/workflow/reviews/T-026-security-tur1.md:277-296`): bu depo PUBLIC
(bkz. §11 — Tehdit modeli) ve `pnpm --filter @arkesoft/trpc run contract:generate`
diskteki şemaların `.default()` değerlerini ve (bugün 0 olan) `.describe()`/`.meta()`
metinlerini artefakta **birebir** yazar. Bugün artefaktta `description`/`title`/
`$comment`/`examples` anahtarı **0** ve üç `default` değerinin üçü de sayfalama
tamsayısı (`job.list`, `platform.auditLog`, `platform.tenantList` — `limit`). Sömürü
senaryosu: bir geliştirici bir şemaya `z.string().default(process.env.SMTP_FROM ?? '…')`
veya iç bilgi içeren bir `.describe(...)` ekler ⇒ `contract:generate` **değerlendirilmiş**
değeri artefakta gömer ⇒ bayt testi (Katman 2) kırmızı yanar ⇒ geliştirici **bu belgenin
söylediği gibi** yeniden üretir ve diff'i "beklenen gürültü" sayıp PUBLIC/anonim okunabilir
bir dosyaya commit eder. `backend` T-026 düzeltme turu 1'de `contract-surface.test.ts`'e
üç fail-closed içerik iddiası ekledi: (a) `description`/`title`/`$comment`/`examples`
anahtarı **0**, (b) her `default` değeri `number`/`boolean`, (c) D6 yasak-jeton regex'i
artefaktın `pattern` **dışındaki** string değerlerinde **0**.

⭐ **(a) ve (b) bu turda (düzeltme turu 2) `qa` tarafından mutasyonla bağımsız
doğrulandı:** `qa` bir şemaya `.describe('test')` ekleyip kapı (a)'nın kırmızı yandığını,
bir şemaya `.default('x')` ekleyip kapı (b)'nin kırmızı yandığını ölçtü (bu turun handoff
özetine göre). ⚠ **(c) bu turda bağımsız doğrulanmadı** — D6 taraması `walkJsonEntries`
üzerinden yürüyor ve bu fonksiyonun dizi elemanlarını ziyaret etmediği ayrıca ölçüldü
(bkz. §9 madde 6); (c)'nin kendisinin kırmızı yanıp yanmadığı bu turda ayrıca
mutasyonlanmadı, yalnızca (a) ve (b) mutasyonlandı.

Bu üçü **geçmezse** yayın durdurulur — "test kırıldı, nasıl yeşile çevirebilirim" sorusunun
cevabı **asla** "bu kontrolü gevşet" olamaz (bkz. `AGENT_BASELINE.md` §5 "testi gevşetme"
yasağı).

## 5. Kullanımdan kaldırma (deprecation) politikası

`ROADMAP.md`'nin sürüm politikası: duyuru → `Deprecation` ve `Sunset` başlıkları → **en
az 12 ay** paralel yaşam → kapatma.

⚠ Bu mekanizma (`Deprecation`/`Sunset` HTTP başlıkları + log uyarısı) **bu sürümde
uygulanmadı** — bkz. §6, kalem `X3`. Bugün kullanımdan kaldırılacak hiçbir public API
yüzeyi yok (sıfır tüketici); mekanizma gerçek bir kullanımdan kaldırma ihtiyacı
doğduğunda kurulacak.

## 6. Ertelenen kalemler

ROADMAP `v0.0.22` kapsamı beş maddeden ikiye daraltıldı (kullanıcı onayı, 2026-11-19).
Ertelenen üç kalem:

| Kod  | Kalem                                           | Vade        | Not                                                                                                                                                                 |
| ---- | ----------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X1` | `/trpc/v1` namespace taşıması                   | **v0.0.23** | Yukarıda §2 — mekanik bir yeniden adlandırma değil, 7 güvenlik politika tablosunu (53 giriş) etkiler                                                                |
| `X2` | REST köprüsü `/api/v1/*` + OpenAPI üretimi      | **v1.1.0**  | Sıfır tüketici + çözülmemiş tasarım sorusu (köprü tarayıcıdan mı çağrılacak — ADR-0026 madde 7'nin kasten reddettiği kiracı orijini güvenilir listesiyle kesişiyor) |
| `X3` | `Deprecation`/`Sunset` başlıkları + log uyarısı | **v1.1.0**  | Sıfır tüketici — kullanımdan kaldırılacak hiçbir şey yok; ilk gerçek kullanım iki major sonrasını gerektirir                                                        |

## 7. Gerekçeli indirgeme prosedürü — `OUTPUT_FIELD_BECAME_REQUIRED` gördüğünde ne yapılır

Sınıflandırıcı, **çıktı** şemasında bir alanın opsiyonelden zorunluya geçmesini
**bilerek aşırı-sıkı** biçimde `MAJOR` olarak raporlar (`ADR-0027` Karar 7) — teorik
olarak bu kırıcı değildir (tüketici zaten o alanı okuyordu), ama tasarım fail-closed
tercih etmiştir.

Bir operatör raporda `OUTPUT_FIELD_BECAME_REQUIRED` gördüğünde:

1. **İndirgemeyi kod değiştirerek yapmayın.** Sınıflandırıcının kural tablosu bu ADR'nin
   kararıdır; tek bir `reason` için istisna açmak tutarlılığı bozar.
2. Değişikliğin gerçekten zararsız olduğunu (tüketicinin alanı her zaman okuduğunu)
   **elle doğrulayın** — istemci kodunda (`apps/admin`, `apps/superadmin`,
   `apps/storefront`) o alanın zaten varlık kontrolüyle değil doğrudan okunduğunu
   gösterin.
3. Zararsızsa, sürüm notunda ve PR açıklamasında bu raporu **`MINOR` olarak elle
   indirgeyin** ve gerekçeyi yazın (hangi istemci dosyası, hangi satır alanı zaten
   zorunlu gibi okuyordu). Mekanik rapor `MAJOR` demeye devam eder; indirgeme kararı
   **insan onayıyla** ve **yazılı gerekçeyle** PR'a girer.
4. Zararlı olduğundan şüpheleniyorsanız (ör. eski bir istemci alanı okumuyor
   olabilir), raporu **olduğu gibi** `MAJOR` kabul edin.

⚠⚠ **Bu indirgeme prosedürü yalnızca `OUTPUT_FIELD_BECAME_REQUIRED` için geçerlidir —
başka hiçbir `reason` kodu için indirgeme yapılmaz.** Bu bölümün önceki hâli indirgemenin
`INPUT_FIELD_BECAME_OPTIONAL` dışındaki her "aşırı-sıkı" `MAJOR` raporuna
uygulanabileceğini söylüyordu; bu genişletme, §9'daki kör noktaların o anki güncelliğine
dayanıyordu ve §9 bu Task ailesinde **dört kez** bayatladı (bkz. §9 başındaki düzeltme
geçmişi notları). Somut risk: bir operatör, §9'un hangi eksenin hâlâ gölgelendiğini
(madde 1) veya kök düğümün hangi alt kümesinin hâlâ kıyaslanmadığını (madde 2) bilmeden
`INPUT_TYPE_NARROWED`/`OUTPUT_TYPE_WIDENED` gibi başka bir kodu "zararsız" sayıp elle
indirgeyebilir — gerçekte `MAJOR` olan bir değişiklik `MINOR`'a düşer. ⇒ Başka bir
`reason` kodu için gerçekten zararsız olduğuna inanıyorsanız bu, operatörün kendi
kararıyla çözülecek bir durum **değildir**; `ADR-0027`'nin kural tablosunda bir
değişiklik gerektirir, yani yeni bir ADR kararı gerektirir.

## 8. `GENERATOR_DRIFT` prosedürü

Sözleşme yüzeyi dosyası, onu üreten araç zincirinin çözülmüş sürümlerini gömer
(`generator: { zod, trpcServer }`). Bir `pnpm up` sonrası `zod` veya `@trpc/server`
minor sürümü JSON Schema çıktısının **biçimini** (anahtar sırası, `$schema` değeri,
küçük gösterim farkları) oynatabilir — bu, sözleşmenin kendisinin değil **üretim
aracının** değiştiğini gösterir.

Sınıflandırıcı bunu **ayrı** bir rapor olarak taşır: `GENERATOR_DRIFT` bir semver sınıfı
**değildir** (genel `severity`'ye katılmaz), `GeneratorDriftReport.changed` alanıdır.
Tasarımın amacı bunu **flake'ten atfedilebilir bir diff'e çevirmektir** —
**sıfırlamaz**. Yani bir `zod` yükseltmesi sonrası `pnpm test:contract` kırmızı
yanarsa:

1. Raporu okuyun: `GENERATOR_DRIFT — zod X → Y, @trpc/server A → B` satırı varsa kök
   neden sözleşme değişikliği değil araç zinciri yükseltmesidir.
2. `pnpm --filter @arkesoft/trpc run contract:generate` ile dosyayı yeniden üretin.
3. Diff'i inceleyin: yalnızca `generator` bloğu ve biçimsel farklar değiştiyse commit'e
   dahil edin. `procedures` altında anlamsal bir fark varsa (yeni `reason` satırları),
   bu **ayrıca** sınıflandırılmalı ve sürüm etkisi buna göre değerlendirilmelidir.

⚠ **Programatik tüketici uyarısı:** `generatorDrift.changed`, genel `severity` alanına
katılmadığı için **yalnızca `classification.severity`'ye bakan** bir CI adımı bir
generator sapmasını fark etmeyebilir. `formatContractChangeReport`'un ürettiği metin
rapor bunu her zaman satır olarak ekler; programatik bir tüketici yazıyorsanız
`generatorDrift.changed`'i **ayrıca** kontrol edin.

## 9. Bilinen kör noktalar (operatöre dönük)

> ⚠ **Düzeltme geçmişi (2026-11-19, T-026 düzeltme turu 1):** bu bölümün önceki hâli
> madde 1'de _"bu eksenlerden biri değişirse sınıflandırıcı **her zaman** fail-closed
> `NARROWED` döner"_ diyordu. Bu iddia **ölçümle çürütüldü** — `solid` gate'in T-026
> tur 1 raporu, bulgu F3 (medium): izlenen üç eksenden biri aynı alanda `WIDENED`
> yönünde değişirse fonksiyon **o eksenin sonucuyla erken döner** ve izlenmeyen bir
> eksendeki eşzamanlı daralmayı hiç görmez (kaynak:
> `.claude/workflow/reviews/T-026-solid-tur1.md:70-82`). Madde 1 aşağıda bu ölçüme göre
> düzeltildi. Ayrıca aynı turda iki yeni kör nokta ölçüldü (madde 2 ve 3, aşağıda) —
> önceden bu listede **yoktu**; `solid` tur 1 (F1, F2) ve `security` tur 1 raporlarının
> ölçtüğü somut, üretimde erişilebilir vakalardır.

> ⚠ **Düzeltme geçmişi (2026-11-19, T-026 düzeltme turu 2):** aşağıdaki maddeler tur 1'den
> sonra tekrar güncellendi — gerekçe, `solid` tur 2'nin bulgusu (S4, medium): `backend`'in
> FIX 1'i kaynak dosyayı ve ilişkili test dosyalarını değiştirdiği için tur 1'de verilen
> satır atıfları (`:520-522`, `:525-533`, `:311-335`, `:262-296`, `:293`) **ölü** hâle
> geldi. Bu turdan itibaren bu bölümde **satır numarası verilmiyor** — değişmeye açık
> kaldığı için kararlı kalan fonksiyon adlarına (`compareFieldConstraint`,
> `resolveFieldDiffTarget`, `hasUntrackedConstraintChange`) veya `reason` koduna atıf
> var. Durum bu turda `qa` ve `security`'nin **bağımsız** doğrulamasına dayanıyor — ikisi
> ayrı yöntemle çalıştı: `qa` mutasyonla, `security` statik akış izlemesiyle. Bu sayede
> F2 (madde 3) ve F4 (madde 5) artık **"kapandı"** olarak yazılabiliyor; F3 (madde 1) ve
> F1 (madde 2) hâlâ **kısmen** kapalı — kalan yarısı aşağıda isimle anılıyor, "kapandı"
> **denmiyor**, çünkü bu ikisini bu turda `backend` hâlâ ele alıyor ve çıktısı bu belge
> yazılırken görülemedi.

> ⚠ **Düzeltme geçmişi (2026-11-19, T-026 düzeltme turu 3 — SON TUR):** tur 2'nin
> açık bıraktığı F3 (madde 1) ve F1 (madde 2) bu turda tekrar ölçüldü — `backend`'in
> FIX 2'si üzerine `solid` tur 3 **bağımsız** doğruladı. Sonuç: madde 1 artık
> **tamamen** kapandı (hem izlenen↔izlenmeyen hem izlenen↔izlenen eksen gölgelemesi);
> madde 2 **kısmen** kapandı (`object↔array` kök takası ve `additionalProperties`/
> `$schema`/kök `type` kapandı, ama `null`↔non-null kök geçişi `backend`'in **bu
> turdaki** (FIX 3) çalışmasına bırakıldı — çıktısı bu belge yazılırken görülemediği
> için "kapandı" denmiyor); madde 6 (`walkJsonEntries` dizi körlüğü) mutasyonla
> kapandı olarak doğrulandı. Satır numarası yerine fonksiyon adı/`reason` kodu
> kullanımına devam ediliyor — bu Task ailesinde satır atıfları art arda **beş kez**
> bayatladı (tur 1 ve tur 2'nin önceki hâlleri dahil).

> ⚠ **Düzeltme geçmişi (2026-11-19, T-026 düzeltme turu 4 — gate SON tur):** madde 2'nin
> tur 3 hâli _"`null`↔non-null kök geçişi `backend`'in bu turdaki çalışmasına bırakıldı"_
> diyordu — bu artık bayat. `solid` tur 4 ölçtü (`.claude/workflow/reviews/T-026-solid-tur4.md:21-58`):
> FIX 3 bu geçişi kapattı, ama **tam değil** — boş `properties` taşıyan bir nesne
> (`z.object({})`) ile `null` arasındaki geçiş hâlâ `0 diff`/`PATCH` üretiyor
> (`nonNullHasProperties` yalnızca `properties` anahtarının varlığını soruyor, doluluğunu
> değil). Madde 2 aşağıda bu ölçüme göre düzeltildi; kalan dar vaka teknik borç `M1`'dir
> (`ROADMAP.md` → Teknik Borç). Aynı turda `solid` ADR-0027'nin K8/K9 metninin ve
> "Sonuçlar → Olumsuz" bölümünün bu düzeltmelerin **tersini** söylediğini ölçtü (bulgu
> `M2`) — ADR'nin kendisi geçmişe dönük düzenlenmedi, düzeltme ADR'nin "Gözden geçirme
> notu" bölümüne ek olarak işlendi (bkz. `docs/adr/0027-…md`).

1. **Alan kısıtı karşılaştırması üç eksenle sınırlı:** `enum`, `type`, `pattern`.
   `minLength`, `format`, `multipleOf` gibi başka JSON Schema kısıtları ayrı eksen olarak
   hâlâ **izlenmiyor**. İzlenen üç eksenin **hiçbiri** değişmediğinde sınıflandırıcı
   fail-closed **`NARROWED`** (yani `MAJOR`) döner — bu **yanlış değil, aşırı-sıkıdır**.
   ⭐ **İzlenen↔izlenmeyen eksen gölgelemesi KAPANDI.** Önceki turda ölçülen örnek
   (`z.string().regex(/^[A-Z]+$/)` → `z.string().min(3)`: `pattern` kaldırılırken aynı
   alanda izlenmeyen `minLength` ekleniyordu ve sonuç sessizce `MINOR`/`WIDENED`
   çıkıyordu) artık doğru sınıfı (`MAJOR`) üretiyor — `qa` tur 2 (mutasyonla) ve
   `security` tur 2 (statik akış izlemesiyle) **bağımsız** doğruladı. Düzeltme, aynı
   alanda izlenmeyen bir kısıtın da değiştiğini ayrıca tespit ediyor (fonksiyon adıyla:
   `hasUntrackedConstraintChange` — bu turun handoff özetine göre). Rapor `MAJOR`
   derse ve değişiklik üç eksenin dışındaysa §7'deki gerekçeli indirgeme prosedürünü
   (yalnızca `OUTPUT_FIELD_BECAME_REQUIRED` için) izleyin.
   ⭐ **İzlenen↔izlenen eksen gölgelemesi KAPANDI.** Önceki turda `solid` tur 2'nin
   `medium` (bulgu S2) olarak işaretlediği kör nokta — `compareFieldConstraint` aynı
   alanda izlenen iki eksen (örn. `enum` ve `pattern`) zıt yönde değişirse erken dönüp
   birini görmeden sonuç üretmesi — bu turda `solid` tur 3 tarafından **bağımsız**
   doğrulandı: `compareFieldConstraint` artık üç izlenen ekseni (`enum`, `type`,
   `pattern`) dizi literali üzerinde **koşulsuz** çağırıyor, aralarında erken dönüş
   **yok**. `solid` tur 3 ayrıca bir `NARROWED`→`WIDENED` geçişinin küme argümanıyla
   **üretilemeyeceğini** doğruladı.
2. **Kök şema düğümünün kendisi — iki ayrı alt durum, biri kapandı, biri açık.**
   Önceki turda ölçülen (`solid` tur 1, F1, `high`) dizi-köklü çıktı deliği — kökü
   **nesne olmayan** bir şemada (ör. `{"type":"array","items":{…}}`) alan döngüsünün
   hiç çalışmaması, sıfır fark / `PATCH` üretmesi — dizi kökünün `items` alt şemasının
   karşılaştırmaya girmesiyle (`resolveFieldDiffTarget`, `solid` tur 2 doğruladı)
   kısmen kapanmıştı. Bu turda `solid` tur 3 kök düğümün kendisini elle izleyerek
   ayırdı:
   ⭐ **`object↔array` kök takası ve `additionalProperties`/`$schema`/kök `type`
   KAPANDI.** `stripRootStructuralKeys` süzgeci bu üç vakayı filtreliyor —
   `solid` tur 3 bunu **bağımsız** doğruladı (elle izleme): kök tipi `object`'ten
   `array`'e (veya tersine) değiştiğinde ve kökteki `additionalProperties`/`$schema`/
   `type` alanları değiştiğinde artık fark üretiliyor.
   ⭐ **`null`↔non-null kök geçişi kapandı; tek artık: boş şekilli nesne
   (`z.object({})`) — bkz. `M1`.** `backend`'in FIX 3'ü iki tarafın tam biri `record`
   diğeri `null` olduğu durumda, non-null tarafın çözülmüş hedefi `properties`
   taşımıyorsa fail-closed bir `(root)` diff'i (`*_TYPE_NARROWED`/MAJOR) ekliyor;
   `qa` tur 2 (mutasyonla) ve `security` tur 2 (statik akış izlemesiyle) bağımsız
   doğruladı, `solid` tur 4 kaynağı okuyarak teyit etti. ⚠ **Ama "tamamen kapandı"
   da yanlış olur:** `nonNullHasProperties` `properties`'in **varlığını** sorar,
   **doluluğunu** sormaz — Zod'un `z.toJSONSchema()`'sı boş bir nesne şemasında bile
   `properties: {}` ürettiği için `null ↔ z.object({})` geçişi bu dalı tetiklemez ve
   `0 diff`/`PATCH` kalır (`solid` tur 4 ölçtü). Bu tek dar vaka teknik borç `M1`
   olarak kayıtlı (`ROADMAP.md` → Teknik Borç → "Vadesi v0.0.23 — API sürümleme …
   kaynaklı borçlar (T-026)"; sorumlu `backend`, vade `v0.0.23`) — bugün üretimde
   **erişilemez** (artefaktta boş `properties` eşleşmesi 0).
3. ⭐ **Girdi/çıktı şemasının var/yok geçişi KAPANDI.** Önceki turda ölçülen boşluk
   (`solid` tur 1 F2 / `security` tur 1, `high`/`medium`): bir prosedürün girdisi veya
   çıktısı `null`'dan bir nesneye (veya tersine) geçtiğinde sınıflandırıcı sessizce
   hiçbir fark bildirmiyordu (fail-open `PATCH`). `qa` tur 2 (mutasyonla) ve `security`
   tur 2 (statik akış izlemesiyle) **bağımsız** doğruladı: bu geçiş artık doğru sınıfı
   (`MAJOR`) üretiyor. `docs/api-contract-surface.json`'da girdisi `null` olan **5**
   prosedür (`platform.session`, `session.list`, `session.me`,
   `storefront.currentTenant`, `tenant.current`) kendi aralarında (`null`→`null`) hâlâ
   **0 diff** üretir — bu **beklenen** davranıştır (bu beş prosedür bugün hâlâ girdi
   almıyor); kapanan kör nokta, biri `null`'dan nesneye geçtiğinde ortaya çıkan
   sessiz-kaçırmaydı.
4. **`GENERATOR_DRIFT` genel `severity`'ye katılmaz.** Yukarıda §8'de anlatıldı —
   yalnızca `classification.severity`'ye bakan programatik bir tüketici bir generator
   sapmasını kaçırabilir. **Açık kalan madde** — v0.0.23'ün CI tüketicisi yazılırken
   `generatorDrift.changed`'in ayrıca okunması gerekir (`security` T-026 tur 1, düşük
   öncelikli teknik borç).
5. ⭐ **Totolojik doğrulayıcı (F4) KAPANDI.** Bu belgede önceden ayrı bir madde olarak
   yoktu; bu turun handoff özetine göre sınıflandırıcıyı sınayan bir doğrulama yolunun
   kendi çıktısını referans aldığı (totoloji) bir bulguydu. `qa` tur 2 (mutasyonla) ve
   `security` tur 2 (statik akış izlemesiyle) **bağımsız** doğruladı ki bu artık
   düzeldi.
6. ⭐ **`walkJsonEntries` dizi körlüğü KAPANDI.** D6 yasak-jeton taraması (bkz. §4
   içerik kapısı (c)) ve genel JSON yürüyüşü `walkJsonEntries` üzerinden gidiyor; bu
   fonksiyon önceki turda bir dizinin **elemanlarını** gezmiyordu. Sonuç o zaman: bir
   `z.enum([...])` listesi çalışma zamanı verisinden (ör. bir diziden) üretilseydi,
   dizinin elemanları PUBLIC artefakta girebilir ve D6 taraması bunu **görmezdi** —
   hiçbir kapı yanmazdı (o turda **bugün temiz** notu düşülmüştü: mevcut 42 enum
   değerinin tamamı kaynak kodunda sabit tanımlıydı, sömürülebilir bir örnek üretimde
   yoktu). Bu turda `solid` tur 3 **bağımsız** doğruladı — mutasyonla kanıtlandı:
   fonksiyona `visit(\`${key}[]\`, item)`çağrısı eklenmiş; mutasyon öncesi`leaks=[]`,
mutasyon sonrası `leaks=[{"key":"enum[]",…}]` dönüyor.

## 10. `reason` kodu referansı

⚠ **Bu tablonun kaynağı:** aşağıdaki kod listesi
`packages/trpc/src/contract/classify-contract-change.ts`'in `ProcedureChangeReason`
(3 kod) ve `FieldChangeReason`(14 kod) union tiplerinden **türetilir** (toplam **17**).
**Sayı değişirse bu tablo buradan elle güncellenir** — otomatik türetme yok. Kod sayımı
dört ayrı gate turunda (T-026 tur 1-4) tekrar tekrar sayıldı ve **17**'de sabit kaldı; son
doğrulama `solid` tur 4 (`.claude/workflow/reviews/T-026-solid-tur4.md:152-156`). Düzeltme
geçmişi: bu paragrafın önceki hâli _"bkz. aşağıdaki sorular, Orkestratöre soruldu"_
diyordu — dosyada böyle bir bölüm **yoktu** (ölü atıf, `solid` tur 4 bulgu `L4`); kaldırıldı.

Sınıflandırıcının (`packages/trpc/src/contract/classify-contract-change.ts`) üretebileceği
17 ayırt edici kod:

**Prosedür seviyesi (alan yok):**

| Kod                 | Anlamı                     | Sınıf |
| ------------------- | -------------------------- | ----- |
| `PROCEDURE_ADDED`   | Yeni prosedür              | MINOR |
| `PROCEDURE_REMOVED` | Prosedür kaldırıldı        | MAJOR |
| `OPERATION_CHANGED` | `query`↔`mutation` değişti | MAJOR |

**Alan seviyesi — girdi (`INPUT_*`) ve çıktı (`OUTPUT_*`) ayrı ayrı):**

| Kod                            | Anlamı                                                               | Sınıf |
| ------------------------------ | -------------------------------------------------------------------- | ----- |
| `INPUT_OPTIONAL_FIELD_ADDED`   | Girdiye yeni opsiyonel alan                                          | MINOR |
| `OUTPUT_OPTIONAL_FIELD_ADDED`  | Çıktıya yeni opsiyonel alan                                          | MINOR |
| `INPUT_REQUIRED_FIELD_ADDED`   | Girdiye yeni zorunlu alan                                            | MAJOR |
| `OUTPUT_REQUIRED_FIELD_ADDED`  | Çıktıya yeni zorunlu alan                                            | MINOR |
| `INPUT_FIELD_REMOVED`          | Girdi alanı kaldırıldı                                               | MAJOR |
| `OUTPUT_FIELD_REMOVED`         | Çıktı alanı kaldırıldı                                               | MAJOR |
| `INPUT_FIELD_BECAME_REQUIRED`  | Girdi alanı opsiyonelden zorunluya                                   | MAJOR |
| `OUTPUT_FIELD_BECAME_REQUIRED` | Çıktı alanı opsiyonelden zorunluya (⚠ bkz. §7 — bilinçli aşırı-sıkı) | MAJOR |
| `INPUT_FIELD_BECAME_OPTIONAL`  | Girdi alanı zorunludan opsiyonele                                    | MINOR |
| `OUTPUT_FIELD_BECAME_OPTIONAL` | Çıktı alanı zorunludan opsiyonele                                    | MAJOR |
| `INPUT_TYPE_NARROWED`          | Girdi alanı tip/enum/pattern daraldı                                 | MAJOR |
| `OUTPUT_TYPE_NARROWED`         | Çıktı alanı tip/enum/pattern daraldı                                 | MAJOR |
| `INPUT_TYPE_WIDENED`           | Girdi alanı tip/enum genişledi                                       | MINOR |
| `OUTPUT_TYPE_WIDENED`          | Çıktı alanı tip/enum genişledi                                       | MAJOR |

**Ayrı (sınıf değil):** `GENERATOR_DRIFT` — bkz. §8.

Genel sınıf, bir koşumda üretilen tüm kodların **en ağırı**dır (`MAJOR > MINOR > PATCH`;
hiç fark yoksa `PATCH`).

⚠⚠ **`(root)` rezerve edilmiş bir alan-adı sentinel'idir, bir tip değildir.** Kök
düzeyindeki farklar (bkz. §9 madde 2 — `resolveFieldDiffTarget`) rapor çıktısında alan
adı olarak literal `"(root)"` dizesiyle görünür; bu, gerçek bir alan adıyla **aynı
biçimde** raporlanır. Bir prosedürün girdi/çıktı şeması gerçekten `(root)` adında bir
alan taşıyorsa (ör. `z.object({ '(root)': z.string() })`), rapor çıktısını programatik
tüketen bir araç ikisini **ayırt edemez**. `solid` tur 3 bu riski ölçtü ve bir tip
değişikliği **önermedi** (4 dokunuş, 0 davranış kazancı) — bu paragraf o kararın belge
karşılığıdır. Rapor tüketen bir araç yazılıyorsa önce şema alan adlarının `(root)` olup
olmadığı kontrol edilmeli.

## 11. Tehdit modeli — `docs/api-contract-surface.json` PUBLIC bir depoda yayımlanıyor

⚠⚠ Bu bölüm `security` gate'in T-026 tur 1 ölçümüyle açıldı
(`.claude/workflow/reviews/T-026-security-tur1.md:19-37, 97-122, 313-324`) — önceki
handoff paketi yanlışlıkla _"depo private"_ varsayımıyla yazılmıştı; bu varsayım
olgusal olarak yanlıştı ve bu bölümün eksikliğinin **doğrudan sonucuydu**.

**1. Artefakt, commit edildiği anda kimlik doğrulamasız okunabilir.** Bu depo **PUBLIC**
— depo içinde birbirinden bağımsız dört yerde ölçülmüş olarak yazılı
(`.github/actions/run-gates/action.yml:73`, `.github/workflows/ci.yml:1543`,
`scripts/redact-test-log.ts:7`, `scripts/playwright/base.ts:111,137`); Orkestratör
`gh repo view` ile `visibility=PUBLIC` olarak ayrıca teyit etti. `docs/api-contract-surface.json`
bu depoya commit edildiğinde **hiçbir uygulama içi servis adımı olmadan bile**
`raw.githubusercontent.com` üzerinden kimlik doğrulamasız okunabilir hâle gelir.
"Uygulama bu dosyayı HTTP ile servis etmiyor" ölçümü **doğru** ama bu bir azaltma
**değildir** — depo görünürlüğü zaten o kanalı açık tutuyor. Bu yüzden §4'teki
determinizm ve içerik kapısı disiplini (bkz. yukarıdaki ⚠⚠ not) salt bir kalite
kontrolü değil, **tek gerçek bariyerdir**.

**2. `platform.*` (süper admin + denetim kaydı) yüzeyi BİLİNÇLİ olarak kapsamda —
allowlist/denylist KURULMADI.** `security`'nin T-026 tur 1'de verdiği politika kararı,
üç ölçülmüş gerekçeyle:

- **Marjinal açıklama sıfır.** Artefaktın `platform.*` altındaki her değer aynı PUBLIC
  depoda **zaten** takip edilen bir kaynakta var: denetim eylemleri
  (`packages/trpc/src/schemas/platform.schema.ts:138-141`,
  `packages/db/prisma/schema.prisma:1236-1238`, ilgili migration SQL), sayfalama üst
  sınırları (`platform.schema.ts:147`), prosedür yolları (`platform.router.ts`). Artefakt
  **yeni bilgi üretmiyor**, var olanı projeksiyon ediyor.
- **Hariç tutmak güvenliği DÜŞÜRÜR.** `platform.*` deponun en yüksek yetkili yüzeyi.
  Dışlanırsa süper admin girdi/çıktısındaki bir kırıcı değişiklik (ör.
  `platform.auditLog` çıktısından bir alanın sessizce düşmesi) kırıcı-değişiklik
  dedektörünün **dışında** kalır — kapsama almak bir tespit kazancıdır, kayıp değil.
- **Elle tutulan bir dışlama listesi, bu deponun ölçülmüş sessiz-sapma sınıfıdır**
  (`CLAUDE.md` §7'nin son maddesi, T-016'da mutasyonla ölçüldü — "dört liste" vakası):
  kural dizinin **üzerinde** döndüğünde, listeye hiç eklenmeyen nesne sıfır bulguyla
  geçer. Bir `EXCLUDED_NAMESPACES` dizisi aynı tuzağı sözleşme hattına taşırdı.

⇒ **Karar:** tüm router yüzeyi, `platform.*` dahil, yayımlanmaya devam eder; bir
allowlist/denylist **kurulmayacak**. Bu karar yazılıdır — bundan sonra bu kararı
değiştirecek biri önce bu bölümü ve `ADR-0027`'nin gözden geçirme notunu okumalı.
