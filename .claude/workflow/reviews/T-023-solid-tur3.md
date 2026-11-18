# T-023 — GATE `solid`, tur 3 (DAR doğrulama: M1 + M2 + kalan `low`'lar)

Tarih: 2026-11-18
Sürüm: ROADMAP v0.0.20.2
Dal: `feat/v0.0.21-surum-kayit-modeli`
Yöntem: **statik** inceleme (`Bash` aracı YOK — hiçbir komut çalıştırılmadı, hiçbir test
koşturulmadı, `git diff` alınmadı; bu rapordaki her iddia dosya metninden okunmuştur)
Kapsam: **YENİ TARAMA YOK.** Yalnızca tur 2'nin iki `medium`'u (M1, M2), beş `low`'u ve
FIX 2'nin kendi getirdiği yüzey.

```
GATE: solid
SONUÇ: PASS
```

---

## M1 — `isRollbackTarget` fail-open tip yüklemi → **KAPANDI**

Dört sorunun dördü de olumlu:

1. **Yüklem sağlam mı → EVET.** `packages/db/src/rollback-target.ts:54-56`
   `Object.hasOwn(ROLLBACK_TARGETS, value)` — prototip zinciri taranmıyor;
   `'toString'`/`'__proto__'`/`'constructor'` artık `false` (fail-closed). `in` operatörü
   bu dosyada **hiç** kalmadı.
2. **Yeni modül gerçekten saf mı → EVET.** `rollback-target.ts`'in `import` satırı
   **sıfır**, modül gövdesinde çağrı/IIFE/`process.*` erişimi **yok**; dosya yalnızca bir
   `type` (`:34`), bir `const` nesne literali (`:42-46`) ve bir fonksiyon (`:54-56`)
   içeriyor. `main()` **yok** — `rollback-roles.ts:235`'teki yan etkili `main()` çağrısı
   import grafiğinin **dışında** kaldı. Desen `guard-policy.ts`/`env.ts` ile tutarlı:
   `rollback-roles.ts:59` yalnızca ithal ediyor, ters yönde bağımlılık yok (grep:
   `rollback-target`'ı ithal eden tek üretim dosyası `rollback-roles.ts`, tek test
   `__tests__/rollback-target.test.ts`).
3. **`:100-107` yorumu düzeltildi mi → EVET.** Aynı jsdoc şimdi `rollback-roles.ts:105-111`
   ve metni *"Doğrulama `isRollbackTarget` (`./rollback-target.js`) ÜZERİNDEN yapılır —
   `Object.hasOwn` tabanlı, prototip zincirini TARAMAZ"* diyor. Tur 2'nin yanlış cümlesi
   (*"`SQL_PATHS`'in anahtar kümesine üyelik sorar"*) **yok**.
4. **`Record<RollbackTarget, true>` dördüncü hedefte `tsc`'yi kırar mı → EVET** (statik
   izleme): `rollback-target.ts:42` beyanı `Readonly<Record<RollbackTarget, true>>`;
   `RollbackTarget`'a dördüncü üye eklenip nesne literali güncellenmezse literal hedef
   tipin zorunlu anahtarını taşımaz ⇒ "missing property" hatası. Aynı yapısal zorlama
   `rollback-roles.ts:93` (`Readonly<Record<RollbackTarget, string>>`) ile **ikinci kez**
   kurulu ⇒ yeni bir hedef eklendiğinde hem hedef kümesi hem SQL yolu güncellenmek
   **zorunda**.

**Birim testi gerçekten davranışı test ediyor:** `rollback-target.test.ts:22-24` üç geçerli
hedef, `:27-29` geçersiz dize, `:31-39` miras anahtar vakası. `:35-36`'daki iki satır
(`'toString' in {} === true`, `Object.hasOwn({}, 'toString') === false`) testin
**anti-vacuity** ayağı: iddianın dayandığı JavaScript olgusunu önce kendisi kanıtlıyor,
yani `isRollbackTarget('toString') === false` assert'i "zaten her dize false dönüyor"
yüzünden yeşil kalamıyor (`:27-29` + `:22-24` birlikte pozitif/negatif kontrolü
kapatıyor). Dosya `src/**/*.test.ts` desenine uyuyor ve `.isolation.test.ts` **değil** ⇒
`vitest.config.ts:29`/`:42` gereği normal `pnpm test` hattında koşar (bekçi atıl değil).

**Fazla çözüm gerekçeli, erken soyutlama değil:** ayrı modül, kapsamı büyütmeden
`isRollbackTarget`'ı test edilebilir kılan **tek** yol (import anında `process.exit`
riski); `guard-policy.ts`/`env.ts` emsali mevcut.

---

## M2 — kapanan `high`'ın mekanik bekçisi → **KAPANDI**

Üç sorunun üçü de olumlu:

1. **Assert gerçekten fiil listesini okuyor mu → EVET, dolaylı değil.**
   `append-only-tables-sql-consistency.test.ts:98-116`
   (`extractExactlyOneQuotedVerbList`) SQL metnindeki `format(...)`'in ilk dize
   argümanını regex ile yakalayıp `,` ile bölüyor ve **dizi** döndürüyor; `:159`
   `toEqual(['UPDATE','DELETE','TRUNCATE'])`, `:164` `toEqual(['UPDATE','DELETE'])` —
   `arrayContaining`/`includes` değil, **sıralı tam küme**. Ham metinde
   `includes('TRUNCATE')` araması **kullanılmıyor**; bu önemli, çünkü rollback dosyasının
   DO bloğu `TRUNCATE` jetonunu **yorum içinde** altı kez taşıyor
   (`rollback-audit-append-only.sql:51-67`) — naif bir jeton taraması kalıcı yanlış
   pozitif üretirdi. `:169`'un `not.toContain(...)` satırı ayrıştırılmış **dizi**
   üzerinde çalışıyor, metin üzerinde değil.
2. **Blok izolasyonu doğru mu → EVET, §7 ile karışmıyor** (bağımsız ölçüm):
   `$do_audit_append_only$` jetonu `bootstrap-roles.sql`'de **tam iki kez** var (`:475`
   açılış, `:491` kapanış) ve dosyadaki diğer **on bir** `DO` bloğunun hiçbiri bu adı
   taşımıyor (`$do_secret_table_privileges$`, `$do_own_tables$` …) ⇒
   `extractAuditAppendOnlyDoBlock` (`:65-72`) tam `475-491` aralığını döndürür. §7'nin
   `'REVOKE ALL ON public.%I FROM arkesoft_app'` satırı `bootstrap-roles.sql:298`'de,
   yani `$do_secret_table_privileges$` bloğunun (`:279-341`) içinde — **çıkarılan bloğun
   dışında**. `db`'nin anlattığı "2 eşleşme" tuzağı gerçek: dosya **tamamına** karşı
   koşan bir regex :298 ve :485'i birlikte yakalar (grep ile doğruladım, iki satır) ⇒
   blok daraltması zorunluydu ve doğru yapılmış. İkinci bir `%I` biçimli ifade sonradan
   eklenirse `:106-113` *"TAM 1 eşleşme bekleniyordu"* hatasıyla **fail-closed** düşer.
3. **Regex yorumdan etkilenmiyor mu → TEYİT EDİLDİ (5/5 ölçümü doğru).** `db`'nin §9'a
   eklediği 26 satırlık asimetri yorumu (`bootstrap-roles.sql:424-449`) `$do_...$`
   bloğunun **dışında** (`:475`'ten önce) ⇒ fiil listesi regex'inin görüş alanında hiç
   değil. Rollback dosyasındaki yorum (`:51-67`) blok **içinde** ama regex `'` ile
   başlayıp hemen `GRANT `/`REVOKE ` ile devam eden bir dizi arıyor; yorum metninde
   `GRANT` kelimesinden **önce** tırnak yok (backtick var; `GRANT'i`, `4'ün` gibi
   apostroflarda tırnak fiilin **arkasında**) ⇒ eşleşme sayısı 1. Elle karakter düzeyinde
   doğruladım.

**İki yönlü kanıt statik olarak izlenebilir:** rollback `:69`'a `, TRUNCATE` eklenirse
`:164` `toEqual` üç üyeli diziyle düşer; bootstrap `:485`'ten `TRUNCATE` çıkarılırsa `:159`
iki üyeli diziyle düşer. `db`'nin ve `qa`'nın bağımsız mutasyon ölçümleriyle tutarlı.

**Kalıntı (bulgu olarak aşağıda `low`, M2'yi yeniden açmaz):** bekçi **var olan** `format(
'<FİİL> … ON public.%I <YÖN> arkesoft_app')` ifadesini pinler. Aynı DO bloğuna `%I`
kullanmayan, farklı biçimli yeni bir `GRANT` ifadesi (örn. tablo adı literal) eklenirse
eşleşme sayısı 1 kalır ve test yeşil kalır. Orijinal boşluktan **çok** daha dar; borç
satırı olarak kaydedildi.

---

## Kalan `low`'ların TAM durumu — *"KALAN: yok"* **DOĞRU DEĞİL** (5/5 değil, **3 KAPANDI + 2 KISMEN**)

| #   | Tur 2 `low`'u                                                                                  | Durum                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | `production-write-path-grep.qa.test.ts:308-311`                                                 | **KAPANDI** — yeni metin `:308-322`, iki katmanlı iddiayı doğru anlatıyor (uygulama katmanı + rol yetkisi); eski *"dördüne de sahiptir"* cümlesi geçmiş zamana alınmış ve ne zaman yanlışlaştığı yazılı.                                                                                                                                                              |
| L2  | Yedi bayat yorum konumu                                                                         | **7/7 KAPANDI** — `catalog-lint-live.isolation.test.ts:117-126` · `catalog-lint.ts:213-229` · `tenant-isolation-suite.ts:23-32`, `:50-60`, `:91-105`, `:355-361` · `audit-log.probe.ts:48-64`. Altısında düzeltme **hangi** cümlenin neden yanlışlaştığını da kaydediyor (yeniden gerileme için iz bırakıyor).                                                        |
| L3  | `catalog-lint-live.isolation.test.ts` — aynı 8 satırlık yorumun dört kez kopyası (D16 kökü)      | **KISMEN** — aşağıda bulgu. Dört nokta "pointer" olmadı; 8 satırlık blok **7 satırlık, hâlâ birebir aynı** bloğa dönüştü (`:154-160`, `:196-202`, `:230-236`, + dördüncü vaka) ⇒ drift sınıfı kapanmadı.                                                                                                                                                              |
| L4  | `security`'nin `low`'u — paylaşılan yardımcının etkisizleştirilmesi                             | **KAPANDI** — `helpers/foreach-array-sql-consistency.test.ts` yardımcıyı **doğrudan** çağırıyor: üç negatif (`:25-41`, fazla/eksik/boş) + bir **pozitif kontrol** (`:47-51`). Erken `return` mutasyonu `:27`'yi kırar; "her zaman fırlatan" ters mutasyonu `:49` yakalar. Davranış testi, implementasyon yansıması değil.                                             |
| L5  | Geri alma merdiveni + §9 asimetrisinin tek yerde olması                                         | **KISMEN** — merdiven **beş kademe** oldu (`docs/development.md:496-529`), yürütme sırası `5 → 4 → 1 → 2 → 3` **iki** yerde yazılı (`:456-471`, `:505-508`), asimetri **üç** yerde var. ⚠ Ama (a) üç yerin **gerekçesi** birbiriyle çelişiyor ve biri olgusal olarak yanlış, (b) `rollback-roles.ts:1-10` dosya başı **hâlâ** *"kademe 3 + kademe 4"* diyor — ikisi de aşağıda bulgu. |

---

## YENİ BULGULAR (yalnızca FIX 2'nin kendi yüzeyi + kapanmayan kalıntılar)

### [SEV: low] `packages/db/sql/bootstrap-roles.sql:434-437` — §9 asimetrisinin gerekçesi ÜÇ yerde TUTARSIZ; bu kopya olgusal olarak YANLIŞ (`arwd` TRUNCATE İÇERMEZ)

Üç yerin **kararı** aynı ve doğru ("`TRUNCATE` geri verilmez"), ama **neden**i çelişiyor:

- `bootstrap-roles.sql:434-437`: *"`pg_default_acl` … YENİ eklenecek her tabloyu
  `arkesoft_app`e `arwd` — **yani TRUNCATE DAHİL** — ile DOĞURUYOR"* ⇒ savunmanın **yük
  taşıdığını** söylüyor.
- `docs/adr/0017-…md:417-418` ve `docs/development.md:519-521`: *"`arwd` (`TRUNCATE`
  **içermez**) … bu savunma bugün **yük taşımasa da (no-op)** savunma derinliği olarak
  korunur"* ⇒ tam tersini söylüyor.

Hangisi doğru, aynı dosyadan ölçülebilir: `bootstrap-roles.sql:173-174`
`ALTER DEFAULT PRIVILEGES … GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO
arkesoft_app` ⇒ ACL harfleri `a`(INSERT)`r`(SELECT)`w`(UPDATE)`d`(DELETE); TRUNCATE `D`
harfidir ve **verilmiyor**. ⇒ ADR ve `development.md` **doğru**, `bootstrap-roles.sql`
**yanlış**. `rollback-audit-append-only.sql:64-67` aynı yanlış izlenimi daha üstü kapalı
veriyor (*"`arwd` ile doğurduğu için savunma derinliği olarak korunuyor"*).

Hatanın yönü güvenli taraf (yanlış metin savunmayı **korumaya** teşvik eder) ve M2'nin yeni
pini (`:159` `toEqual([… ,'TRUNCATE'])`) §9'dan `REVOKE TRUNCATE`'in çıkarılmasını
mekanik olarak engelliyor ⇒ `low`. Ama metin, dosyanın kendi uyardığı "BEYAN ≠ GERÇEKLİK"
sınıfına düşüyor ve üç kanonik kayıttan birini çürütülebilir kılıyor.

**Önerilen düzeltme:** `bootstrap-roles.sql:435-436`'daki *"yani TRUNCATE DAHİL"* ifadesini
ADR-0017:417-418'in doğru cümlesiyle hizala (`arwd` → TRUNCATE içermez; savunma bugün
no-op, bilinçli savunma derinliği) ve `rollback-audit-append-only.sql:64-67`'yi aynı
cümleye bağla. **Sorumlu ajan:** `db` · **Vade:** v0.0.21

### [SEV: low] `packages/db/src/rollback-roles.ts:73-87` — FIX 2'nin ürettiği YETİM jsdoc bloğu: hiçbir beyanı belgelemiyor

`RollbackTarget` tipi `rollback-target.ts`'e taşındı ama jsdoc'u bu dosyada kaldı. Şimdi
`:73-87`'deki `/** Kademe 3/4/5'in hedef SQL dosyasını seçen CLI argümanı … */` bloğunu
boş satır ve **ikinci bir** jsdoc (`:89-92`, `SQL_PATHS`'in kendi dokümanı) izliyor ⇒ ilk
blok hiçbir sembole bağlanmıyor; içeriği (`'audit-append-only'` genişletmesi + M1 taşıma
gerekçesi) `rollback-target.ts:1-53`'te **zaten** var. Yorum tekrarı + ölü doküman:
`rollback-target.ts`'in tip yorumu güncellenirse bu kopya sessizce bayatlar.

**Önerilen düzeltme:** bloğu sil veya tek satırlık bir atıfla (`// Hedef kümesi ve
doğrulaması: ./rollback-target.ts`) değiştir. **Sorumlu ajan:** `db` · **Vade:** v0.0.21

### [SEV: low] `packages/db/src/rollback-roles.ts:1-10` — dosya başı HÂLÂ "kademe 3 + kademe 4" (tur 2'de raporlandı, KAPANMADI)

Üçüncü hedef (`audit-append-only`, kademe 5) `:74-80` ve `:93-97`'de var, `docs/development.md:496`
artık beşinci kademeyi belgeliyor; ama dosya başı başlığı ve `:5-10`'un komut listesi
**iki** script sayıyor (`pnpm db:rollback-roles`, `pnpm db:rollback-auth-role`) —
`pnpm db:rollback-audit-append-only` **yok**. Dosyanın ilk okunan on satırı yeni operatör
komutunu gizliyor.

**Önerilen düzeltme:** başlığı "kademe 3 + kademe 4 + kademe 5" yap, `:5-10`'a üçüncü
script satırını ekle. **Sorumlu ajan:** `db` · **Vade:** v0.0.21

### [SEV: low] `packages/db/src/__tests__/catalog-lint-live.isolation.test.ts:154-160, 196-202, 230-236` (+ dördüncü vaka) — D16 birleştirmesi anlamı korudu ama TEKRARI KALDIRMADI

Soruya cevap: **anlam kaybı yok** — her çağrı noktası hâlâ _neden_ gerçek beyanı geçirdiğini
söylüyor ve kanonik açıklama `:112-126`'da duruyor. Ama **tekrar kapanmadı**: dört noktanın
her biri *"GEREKÇE TEKRARLANMADI … bkz. dosya başındaki 'sağlıklı durum' testinin yorumu …
bu vaka AYNI, GERÇEK beyanı AYNI sebeple (eski dört-DML kuralının `audit_log`/
`platform_audit_log` için ürettiği SAHTE bulgu gürültüsünü önlemek) kullanır"* metnini
**birebir, 7 satır** taşıyor (32 → ~28 satır). Yani işaretçi, işaret ettiği gerekçeyi
**yeniden anlatıyor** ⇒ tur 2'nin bulgusundaki drift sınıfı (biri güncellenir, üçü kalır →
dosya kendi içinde çelişir) **aynen duruyor**. İkincil bir netlik sorunu: metin *"dosya
başındaki"* diyor, kanonik yorum ise `:112-126`'da, yani `it` bloğunun **içinde**.

**Önerilen düzeltme:** çağrı noktalarında tek satır bırak (`// Gerekçe: :112-126 (kanonik)`)
ve gerekçeyi tekrarlamayı bırak. **Sorumlu ajan:** `db` · **Vade:** v0.0.21

### [SEV: low] `packages/db/src/__tests__/append-only-tables-sql-consistency.test.ts:98-116` — yeni bekçi YALNIZCA mevcut `%I` biçimli ifadeyi pinler

`extractExactlyOneQuotedVerbList`'in deseni `'<FİİL> … ON public.%I <YÖN> arkesoft_app'`
biçimine bağlı. Mevcut satırın fiil listesinin **her iki yönde** değişmesi yakalanır (M2
kapandı) ve ikinci bir `%I` biçimli ifade "TAM 1 eşleşme" hatasıyla fail-closed düşer;
ancak DO bloğuna `%I` **kullanmayan** yeni bir ifade (örn. `'GRANT TRUNCATE ON
public.audit_log TO arkesoft_app'`) eklenirse eşleşme sayısı 1 kalır ve iki test de yeşil
kalır. AC-15 testi SQL'i koşturmadığı için (semantiği TS'te yeniden ifade ediyor) o eksen de
boşluğu kapatmıyor.

**Önerilen düzeltme (ucuz):** desende `public\.%I`'yi `public\.\S+` benzeri bir forma
genişlet veya DO bloğunda `GRANT`/`REVOKE` jetonu sayısını ayrıca pinle.
**Sorumlu ajan:** `db` · **Vade:** v0.0.21

---

## Bu turda bakılmayanlar

Yeni tarama yapılmadı (handoff talimatı). Tur 2'nin "Doğrulanan iddialar" bölümündeki dokuz
madde (katman/bağımlılık yönü, paket yüzeyi, `as` zorlamaları, DRY, erken soyutlama,
isimlendirme, AC-12(c), snapshot `canTruncate`) **yeniden ölçülmedi**; yalnızca FIX 2'nin
dokunduğu dosyalarda jeton taraması tekrarlandı. `D2`/`D3`/`D11`/`D12`/`D13`/`D14` borçları
kapsam dışı.

FIX 2'nin getirdiği yüzeyde ek kontroller (hepsi temiz): yeni modül `index.ts`'ten export
**edilmiyor** (grep: `rollback-target` yalnızca `rollback-roles.ts` ve kendi testinden ithal
ediliyor) ⇒ paket yüzeyi büyümedi; yeni dosya adları kebab-case (`rollback-target.ts`,
`rollback-target.test.ts`); yeni fonksiyon adları camelCase, tip PascalCase, sabit
SCREAMING_SNAKE_CASE (`ROLLBACK_TARGETS`); dışa açılan `isRollbackTarget`'ın dönüş tipi
açık (`value is RollbackTarget`).

---

## ÖLÇÜMLER

- İncelenen dosya: **16** (tamamı okunan 7: `rollback-target.ts`, `rollback-target.test.ts`,
  `rollback-roles.ts`, `append-only-tables-sql-consistency.test.ts`,
  `rollback-audit-append-only.sql`, `helpers/foreach-array-sql-consistency.ts`,
  `helpers/foreach-array-sql-consistency.test.ts` + kısmi okunan 9: `bootstrap-roles.sql`,
  `catalog-lint.ts`, `tenant-isolation-suite.ts`, `audit-log.probe.ts`,
  `catalog-lint-live.isolation.test.ts`, `production-write-path-grep.qa.test.ts`,
  `docs/development.md`, `docs/adr/0017-…md`, `vitest.config.ts`)
- FIX 2 dosyalarında jeton taraması: `any` **0** · `@ts-ignore` **0** ·
  `@ts-expect-error` **0** · boş `catch {}` **0** · `console.*` **0** (tek eşleşme
  `rollback-roles.ts:41`, yasağı **anlatan** yorum) · yeni `as` **0**
- FIX 2'de yeni yazılan en büyük fonksiyon: `extractExactlyOneQuotedVerbList`
  (`append-only-tables-sql-consistency.test.ts:98-116`, **19 satır**); `isRollbackTarget`
  **3 satır**. Depodaki en büyük fonksiyon değişmedi: `lintCatalog` (`catalog-lint.ts`,
  **104 satır**)
- Yeni test: `rollback-target.test.ts` **5 vaka** (3 geçerli hedef `it.each` + 1 geçersiz +
  1 miras anahtar) · fiil listesi pini **2 `it`** · yardımcı meta-testi **4 `it`**
- M1 **KAPANDI** · M2 **KAPANDI** · tur 2 `low`'ları: **3 KAPANDI, 2 KISMEN**
- Bu turun bulguları: critical **0** · high **0** · medium **0** · low **5**
- Komut çalıştırılmadı (`Bash` aracı yok) — test koşumu, `git diff`, `prettier --write`
  **hiçbiri** bu rapora ait değil. ⚠ Biçimlendirmeyi Orkestratör kapatmalı
  (AGENT_BASELINE §5).
