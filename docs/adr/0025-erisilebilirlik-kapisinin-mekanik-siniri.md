# ADR-0025 — Erişilebilirlik kapısının mekanik sınırı

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-18
- **Karar verenler:** architect (T-024); kaynak: kullanıcı onayı 2026-11-17
  (`@axe-core/playwright` bağımlılığı, test-only `devDependency`), keşif ölçümü
  (`devops`, T-024)
- **İlgili versiyon:** `v0.0.20.3`

---

## Bağlam

`wcag` gate'i dört sürüm boyunca (T-016, T-019, T-020, T-021) erişilebilirlik
denetimini **elle** yaptı: her sürümde aynı sınıf bulguları (odak yönetimi,
`aria-live` muhakemesi, kontrast hesabı) yeniden, insan dikkatine bağlı olarak
koşturdu. Bu hem tekrarlı hem de insan dikkatine bağımlı bir maliyetti.

`@axe-core/playwright` bu işin bir kısmını mekanikleştirebilir (kontrast, form
etiketi/erişilebilir ad, ARIA geçerliliği, `html[lang]`, başlık düzeni) ama
**tamamını değil**: axe statik bir DOM anlık görüntüsü üzerinde çalışır, tuş
basmaz, odak akışını gözlemlemez, duyuru (`aria-live`) muhakemesi yapmaz ve
kapalı/DOM'da olmayan içeriği göremez. Bu sınırı **belgelemeden** entegre etmek,
bir sonraki ajanın (veya insanın) "axe yeşil ⇒ erişilebilir" sonucuna varmasına
yol açar — bu, bu sürümün en büyük riskidir: mekanik bir kapının varlığı, onun
**kapsamadığı** eksenler için elle denetimin sessizce bırakılmasına davet
çıkarabilir.

Ayrıca axe'ın `incomplete` sonucu (ör. gradyan üstü kontrast — hesaplanamadı,
ihlal değil) sessizce yutulursa kapı sahte yeşil verir; ve axe'ın ham sonucu
(`node.html`) DOM parçacığının görünür metnini (fixture e-postası, kiracı slug'ı)
taşıyabilir — CI'ın Playwright artefaktları public depoya `if: always()` +
7 gün saklama ile yükleniyor.

## Karar

1. Erişilebilirlik kapısı `@axe-core/playwright` ile kurulur; **altı sayfa**
   taranır (admin `/sign-in` + `/hesap/guvenlik` dialog açıkken; superadmin
   `/giris` + `/`; storefront kök + `404`), **ikisi oturum içi** (admin ve
   superadmin'in ikinci sayfası).
2. Kural etiket kümesi `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa` — **tek yerde**
   sabit (`scripts/playwright/a11y.ts`'in `WCAG_RULE_TAGS` sabiti); yardımcı
   başka bir etiket yapılandırmasını dışa açmaz.
3. Daraltmanın **tek yolu** tipli, gerekçeli, **varsayılan boş** bir allowlist
   (`ALLOWED_VIOLATIONS`, `A11yScanName` kapalı birleşimiyle anahtarlanır);
   `disableRules`/`exclude`/`include` çağıranlara **dışa açılmaz**. Bir
   allowlist girdisi hiçbir gerçek ihlalle eşleşmiyorsa (bayat girdi) test
   **kırılır** — "eklenip unutulan" bir ack kalıcı olamaz.
4. `incomplete` sonucu **sessizce yutulmaz** — her biri `testInfo.annotations`'a
   ad ad yazılır; `ACKNOWLEDGED_INCOMPLETE_RULE_IDS`'te beyan edilmemiş bir
   `incomplete` testi kırar.
5. `AxeBuilder.analyze()`'in ham sonucu yardımcının (`expectNoAccessibilityViolations`)
   dışına çıkmaz; çağıran ne ham sonucu ne `include`/`exclude`/`disableRules`
   seçeneklerini görür.
6. axe'ın **bulamadıkları** belgelenir (`docs/testing.md` §7); `wcag` gate'i
   **kaldırılmaz**, görevi mekanizmayı tekrar etmekten onu **denetlemeye**
   daralır.
7. Bekçinin kendisi (yardımcı) elle doğrulanmaz — her CI koşumunda çalışan bir
   **mutasyon öz-testi** (`apps/admin/e2e/a11y-helper-self-test.spec.ts`, beş
   senaryo: iki ihlal enjeksiyonu + iki geri alma + bir `incomplete` tetikleme)
   kendi disiplinini doğrular.
8. PII kaynakta azaltılır: `node.html` yardımcı içinde **hiç okunmaz**. Hata
   mesajı yalnızca `ruleId`, `impact`, düğüm sayısı, `helpUrl` ve ilk üç düğümün
   `target[0]`'ından (≤ 80 karakter) kurulur; `failureSummary`
   `redactAxeDetail()`'den geçer. Gerekçe: `ci.yml:1558`'in `if: always()`'i +
   `:1565`'in `retention-days: 7`'si + depo **public** olması — artefakt yeşil
   koşumda da anonim indirilebilir; `scripts/redact-test-log.ts` bu borunun
   dışında kalır (`action.yml:93,143`) ve sır biçimini hedefler, PII'yi değil.
9. 320 px reflow viewport'u `reflowMobileDevice` (`scripts/playwright/base.ts`)
   ile **türetilir** — paylaşılan `mobileDevice` sabiti (412 px, görsel
   regresyonun da tükettiği) **değiştirilmez**.
10. Piksel değiştiren hiçbir düzeltme bu sürümde yapılmaz — öznitelik/sınıf
    seviyesinde (CSS/`aria-*`, az satır) kapanan ihlaller bu sürümde düzeltilir
    (triyaj sınıfı A); yeniden tasarım isteyen (B) veya piksel değiştiren (C)
    ihlaller `v0.0.20.5`'e borç olarak kaydedilir.

### Değerlendirilen alternatifler

| Alternatif | Neden seçilmedi |
| --- | --- |
| `wcag`'ı elle sürdürmek, axe eklememek | Dört sürümdür aynı maliyeti tekrarlıyor; ROADMAP'in hedefi tam olarak bunun mekanikleşmesi |
| `jsx-a11y`'ye güvenmek | Statik lint kuralı, çalışma zamanı DOM'unu görmez; dinamik dialog/odak durumlarını kapsamaz |
| Yardımcıyı `packages/`'a taşımak | Playwright'ın TS dönüştürücüsü `node_modules`'ü hariç tutar; bir workspace paketinden ham `.ts` ihraç edilip e2e spec'inden import edilemez — `sql.ts`/`totp.ts`/`mailpit.ts` ile aynı kısıt |
| Allowlist'i çağıran tarafından geçirilen bir parametre yapmak | Her spec kendi daraltmasını tanımlayabilir hâle gelir — "tek daraltma yolu allowlist" sözleşmesi mekanik değil yalnızca tasarımla korunurdu |
| `incomplete`'i koşulsuz kırmak | Gradyan üstü kontrast gibi axe'ın gerçekten hesaplayamadığı durumlar için elle doğrulanmış, gerekçeli bir kayıt mekanizması olmadan her yeni `incomplete` sürümü sonsuza kırardı |
| `incomplete`'i yok saymak | AC-21'in konusu tam olarak bu — sessiz yeşil üretirdi |
| `mobileDevice`'ı global olarak 320 px yapmak | `storefront-visual-mobile` aynı sabiti kullanıyor; değişiklik tüm mobil görsel referansları geçersiz kılar, bu sürümü tek başına `L`'ye çıkarır |
| `redact-test-log.ts` ile sonradan maskelemek | Bu boru `test:e2e`'de hiç yok ve sır biçimini hedefliyor; axe'ın riski görünür metin PII'si — "üretme, sonra maskele" değil kaynakta üretmeme kararı alındı |

## Sonuçlar

### Olumlu

- Kontrast ve etiket regresyonu artık her CI koşumunda mekanik olarak
  denetleniyor; `wcag`'ın dört sürümdür tekrarladığı iş bir kısmı için bitti.
- Allowlist/`incomplete` ack'lerinin "bayat girdi = kırmızı" tasarımı, gerekçesiz
  veya unutulmuş bir susturmanın kalıcı sessiz yeşil üretmesini yapısal olarak
  engelliyor.
- `wcag`'ın görevi küçülmedi, **netleşti**: artık hangi sekiz eksenin kendi
  sorumluluğunda kaldığı açıkça yazılı.
- PII riski (R5) kaynakta kapatıldı — ek bir maskeleme borusu veya disiplinine
  bağımlı değil.

### Olumsuz ve kabul edilen maliyetler

- axe'ın kapsamadığı sekiz eksen (bkz. `docs/testing.md` §7) hâlâ tamamen insan
  dikkatine bağlı — bu ADR bunu **çözmüyor**, kayda geçiriyor. Karşı önlem:
  `wcag`'ın daralan elle kontrol listesi + bu bölümün güncel tutulması
  (gözden geçirme koşulu 2).
- Üç `incomplete` bulgusu (`admin-account-security-dialog` taramasında
  `aria-hidden-focus`, `color-contrast`, `label-content-name-mismatch`) elle
  doğrulandı ve `v0.0.20.5`'te yeniden değerlendirilecek şekilde kayıtlı — bu
  bir susturma değil, DOM kanıtıyla desteklenmiş bir kayıttır.
- `D21`: superadmin `/giris`'te `h1` yok; `page-has-heading-one` axe'ın
  `best-practice` etiketinde ve `WCAG_RULE_TAGS` kümesinde değil ⇒ uygunluk
  hatası değil ama kör nokta. Düzeltmek bu sürümü test-only olmaktan çıkarırdı.
- `D22`: `apps/superadmin/e2e/fixtures/platform-admin.ts`'in
  `SUPERADMIN_TRUSTED_ORIGIN`'i `:5174`'e sabit, port-taşınabilir değil.
- `D23`: `scripts/playwright/a11y.ts`'teki fixture slug deseni
  `platform-admin.ts`'in deseniyle elle senkron; mekanik bir eşitlik kapısı yok.

### Etkilenen sonraki kararlar

- `v0.0.20.5`: triyaj sınıf B/C ihlalleri ve üç `incomplete` kaydının yeniden
  değerlendirilmesi.
- `v0.0.22`: `D23`'ün mekanik eşitlik kapısı önerisi, `totp.ts`'in aynı sınıf
  sapma riskiyle birlikte değerlendirilebilir.

## Gözden geçirme koşulları

1. Allowlist (`ALLOWED_VIOLATIONS`) ikiden fazla girdiye çıkarsa.
2. `wcag` axe'ın yeşil olduğu bir yüzeyde `critical`/`high` bir bulgu
   raporlarsa (axe'ın kapsamı iddia edilenden daha dar olduğu anlamına gelir).
3. axe-core veya Playwright bir ana sürüm geçişinde kural kimliklerini
   (`ruleId`) değiştirirse.

## Gözden geçirme notu — ölçümle düzeltme (`docs`, T-024 gate turu, 2026-11-18)

Bu ADR geçmişe dönük düzenlenmez; aşağıdaki üç madde yukarıdaki kararların
metnini **değiştirmez**, ölçümle çürüdükleri yeri kayda geçirir. Düzeltmeler
koda zaten uygulandı — ayrıntı ve kaynak satırları `docs/testing.md` §7'de.

1. **Madde 8'in "güvenli" sınıflandırması çürüdü (`security` tur 1, SEV: medium).**
   Madde 8 `target[0]`'ın (≤ 80 karakter kesme) kendiliğinden güvenli bir alan
   olduğunu ima ediyordu. Ölçüm: axe-core `4.14.0`'ın seçici üreticisi
   (`axe.js:7905`, `ignoredAttributes`) yalnızca `class`/`style`/`id`/`tabindex`/
   `aria-*`'ı dışlıyor; `axe.js:7914-7936`+`:7940` diğer her özniteliğin
   **< 31 karakterlik** ham değerini seçiciye gömüyor — kesme uzunluğu bunu
   engellemiyordu. Düzeltme (`scripts/playwright/a11y.ts:397-414`): `target[0]`
   artık `failureSummary` ile **aynı** `redactSensitivePatterns()` adımından,
   kesmeden **önce** geçiyor. `qa` tur 1 mutasyonla doğruladı (F2): enjekte
   edilen e-posta mesajda `***@***` olarak çıktı, ham hâli sızmadı.
2. **"Olumlu" bölümünün "PII riski (R5) kaynakta kapatıldı — ek bir maskeleme
   borusuna bağımlı değil" cümlesi eksikti (`security` tur 1, SEV: high).**
   Madde 8'in kapattığı kanal (`node.html` okunmaması) **farklı** bir kanaldı;
   Playwright'ın **kendisi** (`lib/index.js:662-680`, `_takePageSnapshot()`)
   başarısız bir testte tam sayfa ARIA anlık görüntüsünü `error-context.md`'ye
   (`errorContext.js:75-81`, `# Page snapshot`) yazıyordu ve bu dosya
   `ci.yml:1558`'in `if: always()` + `:1565`'in `retention-days: 7`'siyle public
   depoya yükleniyordu — madde 8'in savunduğu alanı hiç kapsamayan, bağımsız
   bir sızıntı yüzeyi. Düzeltme: `test:e2e`'ye `PLAYWRIGHT_NO_COPY_PROMPT: '1'`
   env'i (`ci.yml:1604`) + `turbo.json`'un `passThroughEnv`'i eklendi; bu env
   `_takePageSnapshot()`'ı hiç çağırmaz. `qa` tur 1 iki yönlü ölçtü: env'siz
   koşumda PII çıplak göründü, env'li koşumda `# Page snapshot` bölümü hiç
   yoktu. ⚠ **Not:** dosyanın kendisi hâlâ doğar (yalnızca bu bölüm bastırılır)
   — ayrıntı `docs/testing.md` §7.
3. **Madde 2'nin düzeltmesi de EKSİKTİ — "kapattık" iddiası iki bağımsız
   kanaldan yalnızca birini kapsıyordu (`security` tur 2, SEV: high, `T-024
   fix turu 3`'te devops tarafından düzeltildi).** Madde 2'nin notu
   `PLAYWRIGHT_NO_COPY_PROMPT`'un Playwright'ın ARIA anlık görüntüsü üretme
   yolunu kapattığını söylüyordu; bu yalnızca **`_takePageSnapshot()`**
   (düz `Error` ile düşen, matcher-olmayan başarısızlıklar) için doğruydu.
   Playwright'ın **ikinci, bağımsız** bir yolu var:
   `playwright-core`'un `_ariaSnapshotForExpect()`'i — bir **matcher**
   (`expect(locator).toBeVisible()` gibi) düştüğünde, eleman görünmez/
   bulunamazsa `document.body`'nin TAMAMININ ARIA ağacını alıp
   `matcherResult.ariaSnapshot` → `workerProcessEntry.js:830-831` →
   `errorContext.js:67-73` üzerinden `# Error details` bölümünün **içine**
   ek bir ```yaml``` bloğu olarak yazar. Bu dal `PLAYWRIGHT_NO_COPY_PROMPT`'u
   **hiç görmez** (env, `_takePageSnapshot()`'ın İÇİNDEKİ bir erken-dönüş;
   `_ariaSnapshotForExpect()` o fonksiyonu hiç çağırmaz) — iki dal birbirini
   dışlar (`playwright/lib/index.js:666`), yani bu env'in kapattığı dal, tam
   olarak matcher hatalarında zaten çalışmayan daldı. `security`'nin gerçek
   Playwright 1.64.1 koşumuyla (repo dışı, yalnızca `page.setContent`) aldığı
   ampirik kanıt: env SET iken üretilen `error-context.md`'de `# Page
   snapshot` yok ama `# Error details` içinde fixture e-postası, IP, UA ve
   kiracı slug'ı **çıplak** çıktı. Sömürü yolu somut ve bu sürümün kendi
   spec'lerinde var: `apps/admin/e2e/accessibility.spec.ts:134`
   (`expect(terminateTrigger).toBeVisible()`, oturum-içi `/hesap/guvenlik`)
   ve `apps/superadmin/e2e/accessibility.spec.ts:110`
   (`expect(heading "Mağazalar").toBeVisible()`, kiracı listesi) — ikisi de
   matcher tabanlı ve `a11y.ts`'in redaksiyonu bu dizeye hiç erişemez; madde
   8'in "kaynakta kapatıldı" ifadesi bu kanal için **eksikti**. Düzeltme
   (kod, geçmişe dönük değil — bu ADR'nin kararı değişmedi, uygulaması
   genişledi): `ci.yml`'in Playwright artefakt yükleme adımının `path:`
   listesine `!apps/*/test-results/**/error-context.md` eklendi (**birincil**
   savunma, `devops` iki sırayla gerçek `@actions/glob` ile sınadı — hariç
   tutma deseni kapsayan desenden SONRA gelmezse etkisiz kalıyor);
   `PLAYWRIGHT_NO_COPY_PROMPT` **korundu** (**ikincil** savunma, matcher-dışı
   hatalar için hâlâ geçerli); `if: always()` → `if: failure()` (**üçüncü**
   katman, artefakt yükleme yüzeyini küçültür). ⭐ **Ders — bu Task'ta aynı
   dosya ailesinde ikinci kez yaşandı (önce madde 1'in `target[0]`'ı, şimdi
   bu madde 8):** tek katmanlı bir savunmanın "kapattık" denmesi, kanalın
   **tek** olduğu ölçülmediyse erkendir. Ayrıntı ve tam kaynak satırları:
   `docs/testing.md` §7, "PII azaltma" bölümü.
4. **Madde 8'in "kaynakta kapatıldı" iddiası, madde 3'ün düzeltmesinden
   SONRA bile EKSİKTİ — hâlâ açık bir dördüncü kanal vardı (`security` tur 3,
   SEV: high; FIX turu 4'te `devops` tarafından, kullanıcı onayıyla — kota
   dışı dördüncü FIX turu — kapatıldı).** Madde 3'ün düzeltmesi iki ARIA
   anlık görüntüsü kanalını (`_takePageSnapshot()` ve
   `_ariaSnapshotForExpect()`) kapattı, ama ikisi de `error-context.md`
   dosyasına yazılıyordu; `scripts/playwright/base.ts`'in
   `video: 'retain-on-failure'` ayarı **ayrı, bağımsız bir üretim yolu**
   taşıyordu ve o ana kadar hiçbir katman onu kapsamıyordu. Ölçüm: bu ayar
   `trace: 'on-first-retry'`'ın aksine `retries` sayısına **bağlı değildir**
   — Playwright son deneme başarısız olduğunda videoyu deneme sayısından
   bağımsız saklar. `security` tur 3'ün ampirik koşumu (repo dışı `/tmp`,
   gerçek Playwright 1.64.1, yalnızca `page.setContent`): başarısız testte
   `video.webm` üretildi (10.842 bayt); `ffmpeg` ile çıkarılan karede
   sentetik e-posta/IP/user-agent/kiracı slug'ı **okunabilir**. `if:
   failure()` bu kanalda **hiçbir koruma sağlamıyordu** — video tam olarak
   başarısızlıkta doğuyor, artefakt yükleme adımı tam olarak o anda
   çalışıyordu; iki koşul birbirini filtrelemiyordu. Düzeltme (kod, geçmişe
   dönük değil — bu ADR'nin kararı değişmedi, uygulaması genişledi):
   Playwright artefakt yükleme adımının `path:` listesine
   `!apps/*/test-results/**/*.webm` ve `!apps/*/test-results/**/trace.zip`
   eklendi. `security` tur 4 bu düzeltmeyi `devops`'un ölçümüne güvenmeden
   sıfırdan, iki ayrı `@actions/glob` sürümüyle ve genişletilmiş bir
   derinlik ekseniyle yeniden ölçtü: `error-context.md`/`video.webm`/
   `trace.zip` sonuç listesinde sıfır, teşhis değeri taşıyan dosyalar
   (`test-failed-1.png`, `.last-run.json`, görsel `-actual.png`/`-diff.png`)
   korunuyor. ⚠ Hafifletici (dürüstlük için kayıtlı, derecelendirmeyi
   düşürmedi): bu Task'ın verisi sentetik e2e fixture verisi; video
   `trace.zip`'in aksine çerez/`Authorization` başlığı taşımıyordu. `security`
   tur 4 ayrıca `test:e2e` adımının kendi **stdout**'unu (public Actions job
   log) **beşinci, ayrı bir kanal** olarak ölçtü (SEV: medium) — bu kanal
   artefakt tabanlı dört önlemin hiçbirinin kapsamında değil; ayrıntı ve
   borç kaydı (`D31`): `docs/testing.md` §7, "Düzeltme notu #3". ⭐ **Ders —
   bu Task'ta aynı dosya ailesinde üçüncü ve dördüncü kez yaşandı:** bir
   savunmanın kapsamı, kapattığı kanal **sayılmadan** ilan edilemez.

---

## Kullanım

Bu ADR geçmişe dönük düzenlenmez. Yukarıdaki on kararın biri değişirse yeni bir
ADR yazılır ve bu dosyanın durumu `Yerini aldı: ADR-NNNN` olarak güncellenir.
