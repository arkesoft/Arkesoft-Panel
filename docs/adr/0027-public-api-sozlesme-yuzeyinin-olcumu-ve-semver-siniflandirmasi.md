# ADR-0027 — Public API Sözleşme Yüzeyinin Ölçümü ve Semver Sınıflandırması

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-19
- **Karar verenler:** architect (T-026); kaynak kararlar: ADR-0009 (paketler arası sözleşme
  sınırları ve port deseni), ADR-0020 Karar 1 (semver'in nerede saklandığı — kiracı sürüm
  durumu), ADR-0013 (tema sözleşmesi, `generate-contract-schema.ts` deseni — doğrudan emsal);
  ölçümler: `backend` S1 (`build-contract-surface.ts`), `backend` S2
  (`classify-contract-change.ts`)
- **İlgili versiyon:** `v0.0.22` (bkz. `ROADMAP.md`)

---

## Bağlam

`packages/trpc`'nin dışa açtığı public API yüzeyinde kırıcı değişiklik tespiti son yedi
sürüm boyunca **elle analizle** yapılıyordu (`ROADMAP.md:824`). `ROADMAP.md:3588` bunu açık
bir teknik borç olarak kaydetmişti: kök `package.json`'da `test:contract` script'i yoktu,
ama `CLAUDE.md` (§6, §9) ve `ROADMAP.md` (7 yerde, ör. `:2461`) bu komutu **var olan bir
mekanizma** gibi anlatıyordu. `v0.0.11`'in public API etkisi ("yalnızca ekleme") gibi
iddialar koşturulmamış bir komuta atıfla yazılmıştı.

Sıfırdan başlanmıyor: `packages/theme-sdk` aynı sınıf problemi (sözleşme sapmasının
sürüm kontrolünde bir dosyaya üretilmesi + testle doğrulanması) zaten çözmüştü
(`generate-contract-schema.ts` → `docs/theme-contract.schema.json` →
`contract-schema.test.ts`). Bu ADR, aynı deseni **public API sözleşme yüzeyi** için
uygularken theme-sdk'nin iki tercihinden **bilerek ayrıldığı** yerleri (serileştirme
seçenekleri) ve Zod v4'ün bu depoda ilk kez kullanılan yerleşik bir yeteneğini
(`z.toJSONSchema()`) gerekçelendirir.

Ölçülen yüzey: 7 namespace / 17 prosedür (`job`, `platform`, `tenant`, `registration`,
`session`, `member`, `storefront`). `@arkesoft/trpc` bugün `0.8.3`
(`packages/trpc/package.json:3`) — `ROADMAP.md:16` (`0.6.1`) ve `:1788` (`→0.7.0`) **bayat**,
bu ADR'nin kayda geçirdiği güncel değer `0.8.3`'tür.

## Karar

1. **Versiyon etkisi:** platform `minor` (kök `0.10.3` → `0.11.0`), `@arkesoft/trpc`
   `patch` (bugünkü ölçüm `0.8.3`). **Public API hareket etmiyor** — bu sürüm yüzeyi
   **ölçer**, değiştirmez (17 prosedür sabit, alan eklenmiyor/değişmiyor).
2. **Serileştirme mekanizması:** Zod v4'ün yerleşik `z.toJSONSchema()`'sı kullanılır.
   `packages/theme-sdk` kendi serileştiricisini yazmamıştı, aynı API'yi çağırmıştı
   (`packages/theme-sdk/src/json-schema.ts`); bu desen tekrar kullanılır. Yazılan kod
   çağrı + kanonikleştirmedir, şema yorumlayıcısı değildir. Yeni bağımlılık yok (`zod`
   zaten `packages/trpc`'nin doğrudan bağımlılığı).
3. **`io` parametresi her çağrıda açıkça yazılır** (girdi şeması `{ io: 'input' }`, çıktı
   şeması `{ io: 'output' }`) — varsayılana (`'output'`) güvenmek **yasak**. Ölçülen gerekçe:
   üç `.default()` alanı (`job.list`, `platform.tenantList`, `platform.auditLog`'un `limit`
   alanı) girdide opsiyonel, çıktıda zorunludur; yanlış `io` ile `required` dizisi sessizce
   şişer. `A-T26-1` bunu koşturarak kanıtladı: `jq`, üçünün de `input.required`'ında `null`
   döndüğünü doğruladı.
4. **`unrepresentable: 'throw'` korunur** (varsayılan, açıkça yazılı) — `theme-sdk`'nin
   `'any'` tercihi devralınmaz. `'any'` temsil edilemeyen alanı sessizce `{}` yapar; bu bir
   kırıcı-değişiklik dedektöründe kör noktadır. Bugün risk ölçülü sıfırdır (17 prosedürün
   17'sinde `.transform()`/`.custom()`/`.pipe()`/`.refine()` yok); risk doğarsa fonksiyon
   gürültülü fırlatır.
5. **İki katmanlı sınıflandırma mimarisi.** Katman 1 (anlamsal/SINIFLANDIRAN): diskteki
   yapı ↔ bellekteki yapı yapısal karşılaştırılır, her fark bir `reason` koduna ve bir
   semver sınıfına eşlenir. Katman 2 (bayt/DETERMİNİZM): Katman 1 temizse dosya bayt-birebir
   karşılaştırılır (biçimsel sapmaları — prettier ayarı, anahtar sırası, `zod` sürümü —
   yakalar). "Kırıldı" Katman 2'nin, "ne sınıfta" Katman 1'in sorusudur.
6. **Kural tablosu ve genel sınıf agregasyonu.** 17 ayırt edici `reason` kodu üretilir
   (aşağıda tam liste); genel sınıf tüm farkların **en ağırı**dır (`MAJOR > MINOR > PATCH`,
   hiç fark yoksa `PATCH`). `generator` bloğundaki sapma (`zod`/`@trpc/server` sürüm
   değişimi) bu sıralamaya **katılmaz** — `GeneratorDriftReport.changed` olarak ayrı
   raporlanır (`GENERATOR_DRIFT` bir sınıf değildir).
7. **Çıktıda opsiyonel→zorunlu bilinçli aşırı-sıkılıkla `MAJOR` sayılır** (fail-closed).
   Teorik olarak kırıcı değildir (tüketici zaten alanı okuyordu) ama (a) ROADMAP §2
   girdi/çıktı ayrımı yapmıyor ve bu politikayı gevşetmek bu ADR'nin yetkisinde değil,
   (b) fail-closed bu deponun tutarlı felsefesi, (c) mutasyon girdiye veya çıktıya
   uygulansın sonuç aynı kalır. Ayırt edici `reason` (`OUTPUT_FIELD_BECAME_REQUIRED`)
   raporda görünür kalır; operatöre dönük indirgeme prosedürü `docs/api-versioning.md`'de.
8. **Alan kısıtı karşılaştırması (`compareFieldConstraint`) üç eksenle sınırlıdır**
   (enum / type / pattern), üç eksen **sırayla** denenir ve bir eksenin "değişmedi"
   demesi diğerinin değişimini gölgelemez (bir erken taslakta `type` ekseni `"string" =
   "string"` iken `UNCHANGED` dönüp `pattern` farkını gölgeliyordu; kendi pattern testleri
   bunu yakaladı, sıralı deneme buna karşı tasarlandı). Kapsam dışı eksenler (`minLength`,
   `format`, `multipleOf` vb.) fail-closed `NARROWED` sayılır — yanlış değil,
   **aşırı-sıkı**; gereğinden fazla `MAJOR` üretebilir.
9. **Girdi/çıktı şemasının var/yok geçişi (`null` ↔ nesne) bu sürümün kural tablosunda
   yoktur** — bilinçli kapsam dışı. `diffProcedureIo` bu durumda sessizce boş dizi döner;
   bir prosedür girdisiz/çıktısız hâle gelirse bu **yakalanmaz**.
10. **Adlandırma ayrımı.** Yeni kavramın adı **"sözleşme yüzeyi" / `contractSurface`**;
    *"snapshot"* jetonu `packages/versioning`'e (ADR-0020 Karar 1, kiracı sürüm durumu —
    `TenantVersionState.previousState`) rezervedir — aynı depoda iki ayrı "snapshot"
    kavramı adlandırma karışıklığı doğururdu. `pnpm test:contract` komut adı **korunur**
    (`CLAUDE.md` §6/§9 ve `ROADMAP.md:2461` onu bu adla belgeliyor).
11. **Modül yerleşimi ve mekanik kapı bağlantısı.** `contract/` altındaki saf modüller
    (`build-contract-surface.ts`, `canonicalize.ts`, `classify-contract-change.ts`)
    `packages/trpc/src/index.ts`'ten **export edilmez** — `app.router.ts`'i ithal ettikleri
    için export edilirlerse sunucu tarafı router grafiği tarayıcı paketine girer ve
    `browser-entry-closure.qa.test.ts` kırılır; tek I/O noktası `scripts/`'tir. `pnpm
    guards`'a eklenen adım üç alt kontrol yapar (script dolu, `turbo run test:contract
    --dry=json` ile görevi sahiplenen paketin tam olarak `@arkesoft/trpc` olduğunun
    doğrulanması — sahte yeşil dedektörü, artefakt+script dosyalarının var ve boş
    olmaması); sayı pini (17/7) **guards'a konmaz**, teste aittir (yalnızca canlı router
    tazeliği kanıtlayabilir). `AC-40`'ın negatif kapsam pini (`/trpc/v1`, OpenAPI, `/api/v1`
    yok) kalıcı olarak `guards.sh`'e mekanikleştirilmez — bu sürüme özgü bir kapsam pinidir,
    `qa`'nın tek seferlik ölçümüdür.

### Değerlendirilen alternatifler

| Alternatif | Neden seçilmedi |
| ---------- | --------------- |
| `zod-to-json-schema` paketi | Yeni ana bağımlılık **ve** gereksiz — Zod v4 bu yeteneği çekirdeğe aldı, paket v3 dönemi çözümü |
| `trpc-openapi` | Yeni bağımlılık **ve** yanlış problem — bu sürümün ihtiyacı OpenAPI belgesi değil semver sınıflandırması |
| Elde yazılmış Zod→JSON Schema yürüyücüsü | Zod'un iç `_zod.def` ağacını yeniden yorumlar; Zod minor sürümlerinde sessizce bayatlar, ikinci doğruluk kaynağı yaratır |
| `.d.ts` metinsel diff'i | Derleyici sürümüne göre oynar; opsiyonel↔zorunlu ayrımı metinden sınıflandırılamaz → `AC-36`/`AC-37` uygulanamaz |
| Yalnızca prosedür adlarını pinlemek | `procedure-surface.ts` bunu zaten yapıyor; alan düzeyi değişiklik görünmez kalır |
| Varsayılan `io` (örtük `'output'`) kullanmak | Üç `.default()` alanını (ölçülen: `limit`×3) sessizce zorunlu gösterir — sınıflandırıcının ana ekseni sessizce yalan söyler |
| `theme-sdk`'nin `unrepresentable: 'any'` tercihini devralmak | Temsil edilemeyen alanı sessizce `{}` yapar; bir kırıcı-değişiklik dedektöründe kör nokta |
| `AC-40`'ın negatif kapsam pinini `guards.sh`'e kalıcı mekanikleştirmek | Tek sürüme özgü bir kapsam pini — `v0.0.23` `/trpc/v1`'i **bilerek** ekleyecek ve bu kapıyı hemen silmek zorunda kalacak; "ömrü tek sürüm olan bir kapı, bir sonraki sürümün yazarına kurulmuş bir tuzaktır" (karşı emsal: `check_ac16_no_real_dns_call` — onun ufku çok sürüm ve ekseni güvenlik, bunun ufku bir sürüm ve ekseni kapsam) |

## Sonuçlar

### Olumlu

- `ROADMAP.md:3588`'teki teknik borç mekanik bir kapıyla kapanabilir hâle gelir; son yedi
  sürümdür elle yapılan semver analizi artık ölçülebilir.
- Opsiyonel↔zorunlu, alan ekleme/kaldırma, tip/enum/pattern daralma-genişleme gibi alan
  düzeyi değişiklikler ilk kez otomatik yakalanır (önceki pin yalnızca prosedür adlarını
  görüyordu).
- `GENERATOR_DRIFT` ayrımı sayesinde bir `zod`/`@trpc/server` yükseltmesinin ürettiği sapma
  flake değil, atfedilebilir ve raporlanabilir bir diff olarak doğar.

### Olumsuz ve kabul edilen maliyetler

- **Aşırı-sıkılık (kabul edilen):** `compareFieldConstraint`'in üç eksenle sınırlı olması
  ve çıktıda opsiyonel→zorunlu'nun fail-closed `MAJOR` sayılması gereğinden fazla `MAJOR`
  üretebilir. Karşı önlem: `docs/api-versioning.md`'deki gerekçeli indirgeme prosedürü.
  Vade: eksen kapsamı gerçek bir false-pozitifle ölçülürse genişletilir (gözden geçirme
  koşulu 2).
- **Kör nokta (kabul edilen):** girdi/çıktı şemasının var/yok geçişi (`null`↔nesne) bu
  sürümün kural tablosunda yok; bu durum oluşursa sınıflandırıcı sessizce hiçbir fark
  bildirmez. Karşı önlem yok — bilinçli kapsam dışı, gözden geçirme koşulu 3.
- **Programatik tüketici riski (kabul edilen):** `GENERATOR_DRIFT` genel `severity`'ye
  katılmıyor; yalnızca `classification.severity`'ye bakan bir tüketici generator
  sapmasını kaçırabilir. `formatContractChangeReport` bunu metne ekliyor ama programatik
  tüketiciler `generatorDrift.changed`'i ayrıca kontrol etmeli. Gözden geçirme koşulu 4.
- `v0.0.23`'te `v1` namespace'i eklendiğinde (305 eşleşme / 51 dosya, 7 güvenlik politika
  tablosu) bu ADR'nin K1/K9/K11 maddeleri yeniden açılacak — bu ADR'nin kendisi
  **düzenlenmeyecek**, yeni bir ADR yazılıp buraya işaretçi eklenecek.

### Etkilenen sonraki kararlar

- `v0.0.23` (`v1` namespace taşıması): prosedür yolları değişince sözleşme yüzeyi
  dosyasının tamamı yeniden üretilecek; bu ADR'nin kural tablosu o taşımanın
  "okunabilir diff'i" olarak kullanılacak (bkz. `pm`'in sıralama gerekçesi, T-026 Task
  dosyası).
- `v1.1.0` (REST köprüsü + OpenAPI): bu ADR'nin serileştirme kararı (K2) REST/OpenAPI
  üretimi için yeniden kullanılabilir biçimde tasarlanmadı — ayrı bir ADR gerekecek.

## Gözden geçirme koşulları

1. `v0.0.23`'te `/trpc/v1` namespace'i eklendiğinde: `AC-40`'ın negatif kapsam pini
   `guards.sh`'ten silinmeli, bu ADR'nin K1/K9/K11 maddeleri yeni bir ADR'de yeniden
   kararlaştırılmalı (bu ADR'nin durumu o zaman "Yerini aldı: ADR-00NN" olarak güncellenir).
2. `compareFieldConstraint`'in kapsam dışı bıraktığı eksenler (`minLength`, `format`,
   `multipleOf` vb.) gerçek bir sürümde ölçülebilir bir false-pozitif `MAJOR` üretirse,
   eksen kapsamı genişletilmeli.
3. Girdi/çıktı şemasının var/yok geçişi (`null`↔nesne) gerçek bir prosedürde yaşanırsa
   (bir prosedür girdisiz/çıktısız hâle gelirse), bu geçiş için kural tablosuna yeni bir
   `reason` kodu eklenmeli.
4. Bir programatik tüketici `generatorDrift.changed`'i atlayıp bir generator sapmasını
   kaçırdığı ölçülürse, `GENERATOR_DRIFT`'in genel `severity`'ye dahil edilip edilmeyeceği
   yeniden değerlendirilmeli.
5. Bir `zod` major/minor yükseltmesi artefaktı gözle görülür şekilde oynatırsa ve
   `GENERATOR_DRIFT` raporu bunu yeterince açıklamıyorsa (ör. CI'da yine de yanlış
   yorumlanıyorsa), serileştirmenin belirli bir `zod` sürümüne pinlenmesi
   değerlendirilmeli.

---

## Gözden geçirme notu (2026-11-19, T-026 düzeltme turu 1 — bu ADR'nin kararları DEĞİŞTİRİLMEDİ)

Bu not, Karar 1-11'i **yeniden yazmaz** — ADR'ler geçmişe dönük düzenlenmez (bkz.
`docs/adr/0000-sablon.md:49`). Burada yalnızca bu ADR kabul edildikten **sonra**, aynı
Task'ın gate turunda ölçülen iki şey kayda geçirilir:

1. **Tehdit modeli eksikliği kapatıldı — `docs/api-versioning.md` §11.** `security`
   gate'in T-026 tur 1 ölçümü: bu ADR'nin "Bağlam" ve "Sonuçlar" bölümleri depo
   görünürlüğünü hiç tartışmıyordu ve bu Task'ın handoff paketi yanlışlıkla *"depo
   private"* öncülüyle yazılmıştı. **Depo PUBLIC** — `docs/api-contract-surface.json`
   commit edildiği anda `raw.githubusercontent.com` üzerinden kimlik doğrulamasız
   okunabilir. Tam tehdit modeli (iki madde: genel public-okunabilirlik + `platform.*`
   yüzeyinin bilinçli kapsamda tutulması) operatöre dönük belgede yazılıdır:
   `docs/api-versioning.md` §11. Bu ADR'nin Karar 1-11'i bu bulgudan **etkilenmiyor** —
   serileştirme/sınıflandırma mekaniği aynı kalıyor; eksik olan **belgeleme**ydi.
2. **`platform.*` yüzeyinin kapsamda tutulması — politika kararı, bu ADR'nin değil
   `security`'nin.** `po`'nun bıraktığı açık soruya `security` T-026 tur 1'de yazılı
   bir cevap verdi: tüm router yüzeyi (`platform.*` dahil) yayımlanır, allowlist/
   denylist kurulmaz. Gerekçe ve kaynak satırları `docs/api-versioning.md` §11'de.
   Bu karar bu ADR'nin K11'ine (modül yerleşimi) ek bir kapsam notu olarak okunmalı,
   onu geçersiz kılmıyor.

Ayrıca aynı gate turunda Karar 7/8/9'un (fail-closed aşırı-sıkılık, üç eksen sınırı,
`null`↔nesne kör noktası) **operatöre dönük** yansımalarında ölçülmüş düzeltmeler
yapıldı — bunlar bu ADR'nin kararlarını değil `docs/api-versioning.md` §9'un
(bilinen kör noktalar) **iddialarının doğruluğunu** ilgilendiriyor; ayrıntı ve kaynak
satırları orada. Bu ADR'nin K8/K9 metni **değişmedi**; aşağıdaki iki nokta
yalnızca bu Task'ın gözden geçirme koşulu 2/3'ünün zamanından önce tetiklendiğini
gösteriyor, karar metnini geçersiz kılmıyor:

- K8 (üç eksen sınırı, fail-closed `NARROWED`): `solid` T-026 tur 1 ölçtü — izlenen
  üç eksenden biri `WIDENED` döndüğünde fonksiyon erken döner ve izlenmeyen bir
  eksendeki eşzamanlı daralmayı görmeyebilir (gözden geçirme koşulu 2'nin erken
  tetiklenmesi — `docs/api-versioning.md` §9 madde 1).
- K9 (`null`↔nesne kör noktası): `solid`/`security` T-026 tur 1 ölçtü — bugün
  üretimde 5 prosedürün girdisi `null` ve bu geçiş gözlemlenebilir bir fail-open
  üretiyor (gözden geçirme koşulu 3'ün erken tetiklenmesi — `docs/api-versioning.md`
  §9 madde 3).

Her iki bulgu da bu ADR'nin **kendi** gözden geçirme koşullarının (2 ve 3) erken
tetiklenmesidir — yeni bir karar gerektirip gerektirmediği, düzeltmelerin bu Task'ın
sonraki gate turlarında doğrulanmasından sonra değerlendirilmeli.

## Gözden geçirme notu (2026-11-19, T-026 düzeltme turu 2-4 — bu ADR'nin kararları hâlâ
DEĞİŞTİRİLMEDİ)

Bu not da Karar 1-11'i **yeniden yazmaz**. `solid` gate'in T-026 tur 4 ölçümü (bulgu `M2`,
`.claude/workflow/reviews/T-026-solid-tur4.md:211-238`): yukarıdaki tur 1 notu yalnızca
*"gözden geçirme koşulu 2/3 erken tetiklendi"* diyordu; tur 2 ve tur 3'te inen düzeltmeler
mekanizmayı **değiştirdi** ve bu değişiklik tur 1 notuna hiç yansıtılmadı. Sonuç: K8/K9
metni ve "Sonuçlar → Olumsuz ve kabul edilen maliyetler"in ilgili maddesi, bugün koşan
kodun **tersini** anlatıyordu. Üç somut düzeltme:

1. **K9 (yukarıda `:80-82`) artık bayat — "sessizce boş dizi döner … yakalanmaz" ifadesi
   geçerli değil.** Tur 1'in F2 düzeltmesi ve tur 3'ün S5 düzeltmesi (`backend` FIX 3)
   `null`↔non-null dalını **kaldırdı**: iki tarafın tam biri `record`, diğeri `null` ise ve
   non-null tarafın çözülmüş hedefi (`resolveFieldDiffTarget`) `properties` taşımıyorsa
   fail-closed bir `(root)` diff'i (`*_TYPE_NARROWED`/MAJOR) **eklenir**; bu durum artık
   yakalanıyor. `qa` tur 2 (mutasyonla) ve `security` tur 2 (statik akış izlemesiyle)
   bağımsız doğruladı; `solid` tur 4 kaynak satırlarını (`classify-contract-change.ts:699-731`)
   okuyarak bağımsız teyit etti. Aynı mekanizmanın `docs/api-versioning.md` §9 madde 3
   karşılığı zaten "KAPANDI" olarak güncellenmişti; bu paragraf ADR tarafındaki karşılığıdır.
2. **"Sonuçlar → Olumsuz ve kabul edilen maliyetler"deki ilgili madde (yukarıda `:133-135`,
   "Karşı önlem yok") aynı nedenle bayat.** (1)'deki düzeltme tam olarak bir karşı önlemdir
   (fail-closed `(root)` diff'i); "karşı önlem yok" ifadesi artık doğru değil. ⚠ **Ama tam
   kapanmadı** — bkz. madde 4 (`M1`), aşağıda.
3. **K8 (yukarıda `:73-77`) artık bayat — "üç eksen sırayla denenir" ifadesi geçerli değil.**
   `solid` tur 2'nin S2 bulgusu (izlenen↔izlenen eksen gölgelemesi: aynı alanda iki izlenen
   eksen zıt yönde değiştiğinde erken dönüşün birini görmeden sonuç üretmesi) üzerine
   `backend`'in FIX 2'si `compareFieldConstraint`'i sıralı erken-dönüşten **koşulsuz**
   değerlendirmeye çevirdi: üç eksen (`enum`/`type`/`pattern`) artık hepsi çalıştırılıyor ve
   sonuç `NARROWED > WIDENED` önceliğiyle katlanıyor. `solid` tur 3 bunu bağımsız doğruladı
   (elle izleme, erken dönüş yok). Karar 8'in amacı (eksen gölgelemesini önlemek) **aynı
   kalıyor**; yalnızca mekanizma "sıralı deneme"den "koşulsuz katlama"ya değişti.

**Bu düzeltmelerin dayandığı iki yapı taşı — bu ADR'ye şimdiye kadar hiç yazılmamıştı,
burada ilk kez kayda geçiriliyor (`F1`+`S1`, `S3`+`S6`):**

4. **Kök şema düğümü karşılaştırması (`F1`+`S1`).** `resolveFieldDiffTarget` dizi kökünü
   (`{type:"array",items:{...}}`) nesne-şekilli `items` alt şemasına yönlendirir;
   `stripRootStructuralKeys` kökteki `properties`/`required`/`items` **dışındaki** anahtarları
   (`type`, `additionalProperties`, `$schema` vb.) ayrı bir nesnede toplayıp kıyaslar. Bu ikisi
   birlikte (1)'deki `(root)` diff'inin ve kök `object↔array` takası/`additionalProperties`
   farkının yakalandığı katmanı oluşturuyor. ⚠ **Hâlâ açık bir artık:** `nonNullHasProperties`
   `properties`'in **varlığını** sorar, **doluluğunu** sormaz — Zod'un `z.toJSONSchema()`'sı boş
   bir nesne şemasında bile `properties: {}` ürettiği için (`json-schema-processors.cjs:440-441`,
   `solid` tur 4 ölçtü) `null ↔ z.object({})` geçişi bu dalı tetiklemez ve `0 diff`/`PATCH`
   kalır. Bu artık **bilinen bir sınırdır**, teknik borç `M1` olarak kayıtlı
   (`ROADMAP.md` → Teknik Borç → "Vadesi v0.0.23 — API sürümleme … kaynaklı borçlar (T-026)";
   sorumlu `backend`, vade `v0.0.23`); dolayısıyla madde 2'deki "karşı önlem yok" ifadesi
   **tam olarak değil, kısmen** bayattır — karşı önlem var ama bu tek dar vakada (boş
   `properties`) hâlâ eksik.
5. **Mutasyonsuz anahtar okuma ve öz `__proto__` güvenliği (`S3`+`S6`).** T-023'ün ölçtüğü
   prototip zinciri tuzağına karşı iki kural: (a) anahtar varlığı her yerde `in` operatörü
   yerine `Object.keys(...).includes(...)` ile sorgulanır (`resolveFieldDiffTarget`, eksen-
   anahtarı süzgeçleri); (b) nesne yeniden kurma `rebuilt[key] = value` ile elle atama yerine
   `Object.fromEntries(...)` ile yapılır — girdi anahtarlarından biri literal `"__proto__"`
   ise elle atama öz anahtar yaratmaz, nesnenin `[[Prototype]]`'ını değiştirir (sessiz veri
   bozulması); `Object.fromEntries` `[[DefineOwnProperty]]` kullandığı için bundan etkilenmez.
   **Bu ADR'nin Karar 1-11'inde bu kural yoktu.** Kaynak kodundaki iki yorum
   (`packages/trpc/src/contract/classify-contract-change.ts:258`, `:369`) bu kuralı FIX 3'te
   (tur 3) **"ADR-0027"ye** atfetmişti; `solid` tur 4 bu ADR'nin on bir kararının ve sekiz
   reddedilen alternatifinin **hiçbirinin** `in`/prototip zinciri hakkında olmadığını ölçtü
   (bulgu `L2`: *"tur 3'ün düzeltmesi bir yanlış atfı başka bir yanlış atıfla değiştirdi"*).
   **Bu maddenin eklenmesiyle** kural artık bu ADR'nin metninde yazılı olduğundan, kaynak
   koddaki iki "ADR-0027" atfı bundan **sonra** geçerli hâle gelir — kod dosyalarına
   dokunulmadı (bu Task'ta `docs`'un kapsamı yalnızca `.md` dosyalarıdır), yalnızca atfın
   dayanağı burada kuruldu.
6. **İçerik kapılarının bağımsız doğrulaması.** `docs/api-versioning.md` §4'teki üç
   fail-closed içerik iddiasından ikisi (`description`/`title`/`$comment`/`examples` anahtarı
   sıfır olmalı; her `default` değeri `number`/`boolean` olmalı) bu turda `qa` tarafından
   gerçek mutasyonla sınandı: bir şemaya `.describe('test')` eklenince kapı (a), bir şemaya
   `.default('x')` eklenince kapı (b) kırmızı yandı. Üçüncüsü (D6 yasak-jeton taraması) bu
   turda ayrıca mutasyonlanmadı — ayrım `docs/api-versioning.md` §4'te zaten yazılı.

Yukarıdaki altı madde de K1-K11'in metnini değiştirmiyor; 1-3 var olan kararların bugünkü
davranışla ilişkisini günceller, 4-6 şimdiye kadar bu ADR'de yazılı olmayan uygulama
kurallarını ilk kez kayda geçirir.

---

## Kullanım

- Dosya adı: `docs/adr/0027-public-api-sozlesme-yuzeyinin-olcumu-ve-semver-siniflandirmasi.md`.
- ADR'ler silinmez ve geçmişe dönük düzenlenmez. Karar değişirse yeni ADR yazılır ve
  eskisinin durumu `Yerini aldı: ADR-NNNN` olarak güncellenir.
