# T-023 — GATE `security`, tur 3

- **Tarih:** 2026-11-18
- **Sürüm:** ROADMAP v0.0.20.2
- **Kapsam:** ÇOK DAR — tur 2'nin `medium` (M1) ve `low` bulgusunun FIX turu 2'de
  kapatılıp kapatılmadığının doğrulanması + FIX 2'nin getirdiği tek güvenlik sorusu
  (§9 yorumunun `M2` regex'ine etkisi). **Yeni tarama yapılmadı**; tur 1-2'nin dört
  mutasyonu, `REVOKE` etkinlik ölçümü, "başka yol" taraması ve iddia grep'i
  **tekrarlanmadı**.

```
GATE: security
SONUÇ: PASS
BULGULAR:
  - [SEV: low] packages/db/src/__tests__/helpers/foreach-array-sql-consistency.test.ts:25-41 — Meta-testin ÜÇ negatif vakasının TAMAMI uzunluğu FARKLI diziler kullanıyor (2v1, 1v2, 0v1). Bu yüzden "uzunluk eşitliği kısayolu" sınıfındaki fail-open mutasyon meta-testten KAÇIYOR: fonksiyon gövdesine `if (sqlTables.length === declaredTableNames.length) { return }` eklendiğinde meta-test 4/4 YEŞİL, dört eski çağıran 8/8 YEŞİL, `tsc` exit 0, `eslint` exit 0 (canlı ölçüldü, bu tur). Senaryo: bir geliştirici/ajan yardımcıyı "hızlandırmak" için uzunluk kısayolu eklerse, SQL ve TS listeleri AYNI SAYIDA ama FARKLI içerikte (örn. bir tablo adında yazım hatası) olduğunda sürüklenme sessizce geçer. Üretimde bugün SÖMÜRÜLEBİLİR bir açık DEĞİL — gerçek implementasyon doğru; bu yalnızca bekçinin mutasyon direnci. — Düzeltme: meta-teste AYNI uzunluk / FARKLI içerik negatif vakası ekle (`expectForeachArrayMatchesDeclaredSet('etiket','BEYAN',['a','b'],['a','c'])` → `.toThrow()`); bu vaka canlı ölçüldü: mutasyon altında KIRMIZI, gerçek implementasyon altında YEŞİL (vacuity değil). — sorumlu ajan: db
ÖLÇÜMLER: bkz. aşağıdaki "ÖLÇÜMLER" bölümü
```

---

## (a) M1 — 12 miras anahtarın CANLI sonucu

Ölçüm `packages/db/dist/rollback-target.js` (derlenmiş, src'den YENİ:
src `02:21:33` / dist `02:54:47`) üzerinde, `Object.getOwnPropertyNames(Object.prototype)`
ile anahtarlar **dinamik** toplanarak yapıldı — liste elle yazılmadı.

| anahtar                | `in {}` | `Object.hasOwn({}, …)` | `isRollbackTarget(…)` |
| ---------------------- | ------- | ---------------------- | --------------------- |
| `constructor`          | true    | false                  | **false**             |
| `__defineGetter__`     | true    | false                  | **false**             |
| `__defineSetter__`     | true    | false                  | **false**             |
| `hasOwnProperty`       | true    | false                  | **false**             |
| `__lookupGetter__`     | true    | false                  | **false**             |
| `__lookupSetter__`     | true    | false                  | **false**             |
| `isPrototypeOf`        | true    | false                  | **false**             |
| `propertyIsEnumerable` | true    | false                  | **false**             |
| `toString`             | true    | false                  | **false**             |
| `valueOf`              | true    | false                  | **false**             |
| `__proto__`            | true    | false                  | **false**             |
| `toLocaleString`       | true    | false                  | **false**             |

**12/12 → `false`.** Miras anahtarlarda `true` dönen sayısı = **0** (beklenen 0).
Tur 2'de saydığım on iki anahtarın **tamamı** denendi.

Üç geçerli hedef → `roles` **true**, `auth-role` **true**, `audit-append-only` **true**.
Ek girdiler: `""`, `"bilinmeyen"`, `"Roles"` (büyük harf), `"roles "` (boşluklu),
`"prototype"` → hepsi **false** (büyük/küçük harf ve boşluk toleransı YOK — doğru).

## (b) Geçersiz hedefle `spawnSync` yolu FAIL-CLOSED

⚠ Asıl kapı buydu. `node dist/rollback-roles.js <geçersiz>` **yedi** kez çağrıldı
(**geçerli hedefle HİÇ çağrılmadı** — gerçek geri alma koşturulmadı):

| argüman            | exit  | çıktı                                                            |
| ------------------ | ----- | ---------------------------------------------------------------- |
| `toString`         | **1** | `[rollback-roles] İlk argüman "roles" … olmalı — alınan: "toString".`         |
| `__proto__`        | **1** | aynı Türkçe mesaj, `alınan: "__proto__"`                                      |
| `constructor`      | **1** | aynı Türkçe mesaj, `alınan: "constructor"`                                    |
| `valueOf`          | **1** | aynı Türkçe mesaj, `alınan: "valueOf"`                                        |
| `hasOwnProperty`   | **1** | aynı Türkçe mesaj, `alınan: "hasOwnProperty"`                                 |
| `bilinmeyen-hedef` | **1** | aynı Türkçe mesaj, `alınan: "bilinmeyen-hedef"`                               |
| (argüman yok)      | **1** | aynı Türkçe mesaj, `alınan: "(boş)"`                                          |

`ERR_INVALID_ARG_TYPE` **YOK**, sessiz koşum **YOK**, `prisma db execute` **hiç
spawn edilmedi** (süreç `resolveTarget` içinde `fail()` ile sonlanıyor — guard ve env
okumasından bile ÖNCE). Tur 2'nin fail-OPEN gerilemesi **kapandı**.

## (c) Yeni modülün SAFLIĞI (db'nin asıl gerekçesi — ölçüldü)

`dist/rollback-target.js` `process.exit` ve `process.stderr.write` **enstrümante
edilerek** import edildi:

- import sonrası `process.exit` çağrı sayısı = **0**
- import sırasında stderr yazımı = **[]** (boş)
- modülün export anahtarları = **`['isRollbackTarget']`** (tek export, yan etki yok)

⇒ Modül gerçekten saf; `guard-policy.ts`/`env.ts` deseni doğru uygulanmış.
Birim testi DB'ye ve `main()`'e dokunmadan koşuyor: `rollback-target.test.ts`
**5/5 PASS** (146 ms).

## (d) `low` — meta-test mutasyonu (iki mutasyon sınıfı)

Yöntem: yardımcı dosyanın **bayt birebir** yedeği `/tmp` altına alındı
(`shasum` ile doğrulandı), mutasyonlar `python3` ile tek çapaya uygulandı, her
mutasyondan sonra `cp` ile **bayt birebir** geri yüklendi. `git` yazma komutu
kullanılmadı. (Bu turda `Edit` aracım yoktu; `Write`+`cp` ile transkripsiyon
riski olmayan yol seçildi.)

**Taban:** 3 dosya / **12 test YEŞİL**.

| mutasyon                                                                   | meta-test                   | dört eski çağıran  | `tsc`  | `eslint` |
| -------------------------------------------------------------------------- | --------------------------- | ------------------ | ------ | -------- |
| **M-A** — koşulsuz erken `return` (db'nin iddia ettiği sınıf)              | **3 failed / 1 passed** 🔴  | **8 passed** 🟢    | —      | —        |
| **M-B** — `if (sqlTables.length === declaredTableNames.length) return`     | **4 passed** 🟢 (KAÇIYOR)   | **8 passed** 🟢    | exit 0 | exit 0   |

- **M-A: db'nin ölçümü BİREBİR doğrulandı** — meta-test "3 failed/1 passed" ile
  kırmızı, dört eski çağıran değişmeden yeşil. Benim tur 2 `low` bulgumun özü
  (dolaylı/pozitif sinyale güvenen dört çağıran) **kapandı**: artık o mutasyonu
  yakalayan bir bekçi var.
- **M-B: kaçıyor** → yukarıdaki `low` bulgusu. Önerdiğim ek vaka
  (`['a','b']` vs `['a','c']`) **M-B altında KIRMIZI**, gerçek implementasyon
  altında **YEŞİL** — yani hem gerekli hem yeterli, hem de vacuity değil
  (geçici prob dosyasıyla ölçüldü, dosya **silindi**).

**Geri yükleme ispatı:** yardımcının hash'i başlangıç ve bitişte **aynı**:
`4ed3ad75646c4c84ffaa794e913b206b94cfd8280e5d19b75bbbaa26a19cd1ea`.
Geçici prob dosyası (`zz-security-probe.test.ts`) silindi — `helpers/` dizininde
kalıntı **yok**. Restore sonrası: `tsc` exit 0, `eslint` exit 0,
hedefli 4 dosya / **17 test PASS**.

## (e) §9 yorumunun `M2` regex'ine ETKİSİ — ETKİSİ YOK (teyit)

Bu, FIX 2'nin getirdiği tek güvenlik sorusuydu: etkiliyorsa kapatılan `high`
(denetim izi `TRUNCATE` asimetrisi) **korumasız** kalırdı.

Yapısal gerekçe: `extractExactlyOneQuotedVerbList` regex'i dosyanın tamamına
**değil**, `extractAuditAppendOnlyDoBlock`'un döndürdüğü `$do_…$` bloğuna karşı
koşuyor. Yeni asimetri yorumu (`:424`, `:444` civarı) **DO bloğundan ÖNCE**.

| ölçüm                                                       | sonuç                                                          |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| `bootstrap-roles.sql` `$do_audit_append_only$` jeton sayısı | **2** (satır 475 açılış, 491 kapanış) — yorumda **0** geçiş     |
| §9 DO bloğunun satır aralığı                                 | **475..491** ⇒ yorum satırları 424/444 blok DIŞINDA             |
| `M2` regex, **tüm dosyada**                                  | **2** eşleşme                                                   |
| `M2` regex, **DO bloğunda**                                  | **1** eşleşme (test TAM 1 bekler) ✅                            |
| DO bloğu içindeki `--` yorum satırı                          | **0** (blok saf SQL — satır 475-491 tamamı okundu)              |

Tüm dosyadaki ikinci eşleşme **satır 298** = §7'nin **gerçek SQL satırı**
(`EXECUTE format('REVOKE ALL ON public.%I FROM arkesoft_app', …)`), bir yorum
**değil** — yani blok daraltmasının gerekçesi meşru ve yeni yorumla ilgisiz.
Eşleşen tek dize: `'REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM arkesoft_app'`
(üç fiil, pinli). Geri alma dosyasında: `'GRANT UPDATE, DELETE ON public.%I TO
arkesoft_app'` — tüm dosyada da blokta da **1** eşleşme, `TRUNCATE` jetonu **yok**.

**Ek kontrol (handoff'un sormadığı ama aynı sınıf):** `extractForeachLiteralArray`
regex'i **tüm dosyaya** karşı koşuyor ve TAM 1 eşleşme istiyor ⇒ yoruma gömülmüş bir
`FOREACH … IN ARRAY ARRAY[...]` ikinci eşleşme üretip testi kırardı. Ölçüm: dört SQL
dosyasının **dördünde de TAM 1** eşleşme ve **hiçbirinin yorumunda `FOREACH` geçişi
yok** (0 satır). CLAUDE.md §5 "literal-jeton kuralı" bu turda **ihlal edilmemiş**.

Canlı teyit: `append-only-tables-sql-consistency.test.ts` **5/5 PASS** — db'nin
"5/5 ölçtüm" iddiası doğrulandı.

## (f) Veritabanı SERTLEŞTİRİLMİŞ — ispat

Bu turda **hiçbir DDL koşturulmadı** (geri alma CLI'ı yalnızca geçersiz hedeflerle
çağrıldı ve `spawnSync`'e hiç ulaşmadı). `arkesoft-postgres` / db `arkesoft`
üzerinde `has_table_privilege('arkesoft_app', …)` ile ölçülen son durum:

```
       tablo        | sel | ins | upd | del | trunc
--------------------+-----+-----+-----+-----+-------
 audit_log          | t   | t   | f   | f   | f
 platform_audit_log | t   | t   | f   | f   | f
 tenant_membership  | t   | t   | t   | t   | f
```

⇒ Handoff'un istediği hedef durumla **birebir aynı**. `ROLLBACK` /
`pnpm db:bootstrap` gerekmedi. `FLUSHDB`/`DROP`/`TRUNCATE` çalıştırılmadı,
konteyner durdurulmadı, `docker context` değiştirilmedi, kök `.env`'e yazılmadı
(içeriği bu rapora basılmadı).

## (g) Ölçüm yükü (AGENT_BASELINE §4 ders 2)

- `docker ps -q | wc -l` = **25 konteyner**
- `uptime` load averages = **3.98 / 4.44 / 4.50** (sakin makine DEĞİL)
- Node **v25.8.1**, Vitest **v5.0.5**
- Ölçümler saat **03:03–03:10** arasında alındı; ortam bozulması gözlenmedi.

Not: bu turun ölçümleri **determinist** sınıftadır (saf fonksiyon, metin
ayrıştırma, katalog sorgusu) — flake eksenine tabi değil; yük yine de kayda geçti.

## (h) DOĞRULANAMADI

1. **`pnpm audit`** — handoff'un açık talimatıyla tekrarlanmadı (tur 2:
   `pnpm-lock.yaml` değişmedi). Bağımlılık ekseni bu turda **ölçülmedi**.
2. **Geçerli hedefle geri alma yolu** (`roles` / `auth-role` / `audit-append-only`)
   — yasaklandığı için koşturulmadı. Mutlu yol yalnızca statik pinler ve
   `qa`'nın AC-15 izolasyon ölçümüyle kapsanıyor; benim bu turda doğrudan kanıtım yok.
3. **Tur 2'nin karşı-olgusu** ("eski `in` sürümü `spawnSync`'e ULAŞIYOR") bu turda
   tekrar üretilmedi — tur 2'de ölçülmüştü, talimatla tekrarlanmadı.
4. **Tam süit** (`pnpm lint` / `pnpm test` / `pnpm test:isolation` / `test:e2e`)
   koşturulmadı — `qa` tur 1'in kapsamı (13 zorla koşum, flake yok). Benim
   koşumlarım yalnızca hedefli dosyalar.
5. **Tenant izolasyon 14 maddesi** bu turda yeniden denetlenmedi — tur 1-2'de
   denetlendi, bu tur ÇOK DAR kapsamla sınırlıydı.

## ÖLÇÜMLER

- **`pnpm audit`:** çalıştırılmadı (talimat); tur 2 sonucu geçerli,
  `pnpm-lock.yaml` değişmedi ⇒ kritik/yüksek/orta/düşük **değişmedi**.
- **İncelenen dosya sayısı:** 7 (`rollback-target.ts`, `rollback-roles.ts`,
  `rollback-target.test.ts`, `foreach-array-sql-consistency.ts`,
  `foreach-array-sql-consistency.test.ts`,
  `append-only-tables-sql-consistency.test.ts`, `sql/bootstrap-roles.sql` §9)
  + 3 SQL dosyası regex ölçümü için tarandı.
- **Koşturulan test:** hedefli 4 dosya / **17 test PASS**; mutasyon altında
  M-A **3 failed/1 passed**, M-B **4 passed** (kaçış).
- **Canlı prob:** 12 miras anahtar + 3 geçerli hedef + 7 ek girdi = **22** girdi;
  7 geçersiz CLI çağrısı; 1 saflık probu; 2 mutasyon + 2 bayt-birebir geri yükleme.
- **Tenant izolasyon listesinden karşılanmayan madde:** **yok** (bu turun kapsamı
  tenant verisine dokunmuyor; §7 md 14/15/16 — türetilmiş nesne, `SECURITY DEFINER`,
  sır taşıyan tablo — bu değişiklikte **değişmedi**; tur 1-2'de doğrulanmıştı).
- **FAIL kuralı:** 0 critical, 0 high, 0 medium, **1 low** ⇒ **PASS**
  (AGENT_BASELINE §4: yalnızca `low` → PASS, borç tablosuna kaydedilir,
  düzeltme turu açılmaz).
