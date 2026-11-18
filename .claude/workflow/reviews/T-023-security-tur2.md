# T-023 — `security` gate, tur 2 (TAM YENİDEN DENETİM)

- **Tarih:** 2026-11-18
- **Sürüm:** v0.0.20.2 (platform 0.10.2)
- **Dal:** `feat/v0.0.21-surum-kayit-modeli`
- **Yüzey:** `git diff --stat HEAD` → 55 dosya, +1616/−224

```
GATE: security
SONUÇ: PASS
BULGULAR:
  - [SEV: medium] packages/db/src/rollback-roles.ts:109-111 — `isRollbackTarget` fail-OPEN: `in` operatörü prototip zincirini de tarar, bu yüzden `toString`/`valueOf`/`constructor`/`__proto__`/`hasOwnProperty`/`isPrototypeOf`/`toLocaleString`/`propertyIsEnumerable`/`__defineGetter__`/`__defineSetter__`/`__lookupGetter__`/`__lookupSetter__` (12 miras anahtar) GEÇERLİ bir `RollbackTarget` sayılır (canlı ölçüldü). Senaryo: bir operatör ya da CI otomasyonu `pnpm db:rollback-audit-append-only` yerine hedefi dinamik kurup `valueOf` gibi bir değer geçirdiğinde tasarlanan "anlamlı hata + exit 1" kapısı AÇILIR; `SQL_PATHS[target]` bir fonksiyon/nesne döner, `string` olarak tiplenir (tip yüklemi YALAN SÖYLER, CLAUDE.md §4 "dış veriye parse edilmeden tip verilmez" ihlali), `spawnSync` değeri sessizce dizeye zorlar ve `prisma db execute --file "function toString() { [native code] }"` çalışır — operatör, yıkıcı-komşu bir aracın geri almayı YAPIP yapmadığını hata metninden ANLAYAMAZ. Değişiklik öncesi kod (`target === 'roles' || target === 'auth-role'`) fail-CLOSED'du ⇒ regresyon. `resolveTarget` için HİÇBİR birim testi yok (grep: 0). ⚠ Keyfi dosya yolu enjeksiyonu BUGÜN mümkün DEĞİL (miras anahtarların değerleri saldırgan kontrolünde değil; `pnpm audit`'te prototype-pollution danışmanlığı yok) — bu yüzden `high` DEĞİL. — Düzeltme: `Object.hasOwn(SQL_PATHS, value)` (canlı doğrulandı: `toString`/`__proto__` → `false`, `roles` → `true`) veya `SQL_PATHS` için `Object.create(null)`; + `resolveTarget` için üç geçerli / bir geçersiz / bir miras-anahtar vakası taşıyan birim testi — db
  - [SEV: low] packages/db/src/__tests__/helpers/foreach-array-sql-consistency.ts:69-96 — Paylaşılan `expectForeachArrayMatchesDeclaredSet` İKİ drift süitinin TEK assert noktası: fonksiyonu erken `return` ile etkisizleştiren 3 satırlık bir değişiklik (mutasyon B) 6 testin TAMAMINI SAHTE YEŞİL yaptı; `npx eslint` ve `tsc --noEmit` İKİSİ DE SESSİZ kaldı. Refactor öncesi aynı etkisizleştirme İKİ dosyada ayrı ayrı yapılmak zorundaydı ⇒ sahte-yeşil patlama yarıçapı 1→2 süite çıktı. ⚠ Kazara BOZULMA yönünde tek nokta arızası DEĞİL (mutasyon A: ayrıştırmayı bozdum → DÖRT test, İKİ dosyada da KIRMIZI, tablo adını adlandıran mesajlarla). — Düzeltme: yardımcının KENDİSİ için bir meta-test (bilerek uyuşmaz iki küme verip `.toThrow()` beklemek) — bugün hiç yok; `solid`'in kopya-kaldırma kararı doğruydu, eksik olan meta-kapı — db (borç satırı, düzeltme turu açmaz)
ÖLÇÜMLER: pnpm audit → 0 kritik / 2 high / 3 moderate / 1 low (tur 1 ile BİREBİR aynı; `pnpm-lock.yaml` DEĞİŞMEDİ — `git status`/`git diff --stat` boş ⇒ bu sürüm bağımlılık yüzeyine DOKUNMUYOR, altı danışmanlığın tamamı mevcut Astro/@astrojs/node zinciri, T-023 kaynaklı DEĞİL). İncelenen dosya: 24 derinlemesine / 55 değişen dosyanın tamamı yüzeyde. Karşılanmayan tenant izolasyon maddesi: YOK (yeni tablo/prosedür/kuyruk işi/migration YOK ⇒ 14 maddenin 11'i N/A; madde 14 bu sürümde linter'ın görüş alanını GENİŞLETİYOR — `canTruncate` ekseni eklendi). Testler: `packages/db` birim 260/260 · `packages/db` izolasyon 86/86 · katalog-lint birim 75/75. Makine yükü: load avg 4.82 (başlangıç) → 4.04 (izolasyon koşumu anında) → 3.18 (kapanış); 25 konteyner çalışıyor. Mutasyon: 5 uygulandı, 5'i Edit/kopya ile geri alındı, md5 ile KALINTISIZ doğrulandı.
```

---

## (a) F1–F5 — KAPANDI / KAPANMADI

| # | Tur 1 bulgusu                                                   | Durum          | Kanıt                                                                                                                                                                                     |
| - | --------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1** | `high` · rollback hiç verilmemiş `TRUNCATE`'i veriyordu     | ✅ **KAPANDI** | **CANLI ölçüldü** (aşağıda). `GRANT UPDATE, DELETE` — `TRUNCATE` yok. §9'un savunmacı `REVOKE TRUNCATE`'i kaldı. `S7` assert'leri (AC-15 kümesi 4, `toEqual`) hatayı artık PİNLEMİYOR      |
| **F2** | `medium` · `ON UPDATE CASCADE` ekseni belgesiz               | ✅ **KAPANDI** | `ROADMAP:1432` (ana paragraf) · `ROADMAP:3793` (`D2` satırı) · `docs/adr/0017…:433` + `:441` · kök `CHANGELOG.md` + `packages/db/CHANGELOG.md`. Altı yerde `onDelete: Cascade, onUpdate: Cascade` birlikte |
| **F3** | `medium` · patlama yarıçapı dar yazılmış                     | ✅ **KAPANDI** | `ROADMAP:1434`, `ROADMAP:3793`, `ADR-0017:433`, iki `CHANGELOG` → *"herhangi bir kiracı bağlamındaki uygulama rolü herhangi bir kiracının…"* + `tenant` RLS taşımaz + `D6` çapraz atfı      |
| **F4** | `low` · `rolconfig`/`pg_temp`                                 | ✅ **KAPANDI** (borç) | `ROADMAP:3799` → `D13`, vade *"ilk `SECURITY DEFINER` ihtiyacından önce; en geç v0.0.22"*. Canlı teyit: `pg_roles.rolconfig` üç çalışma zamanı rolünde de `NULL`                     |
| **F5** | `low` · KAPI 4 kökü                                           | ✅ **KAPANDI** (borç) | `ROADMAP:3800` → `D14`, vade *"bir sonraki `apps/api` dokunuşu"*                                                                                                                      |
| ⚠ | `packages/db/CHANGELOG.md` kopyası (tur 1'de kaçırdım)         | ✅ **KAPANDI** | Kök ve paket metni BİREBİR; diğer 13 `CHANGELOG` yalnızca bağımlılık yükseltmesi taşıyor (iddia metni YOK)                                                                                 |

### F1'in CANLI kanıtı (transaction içinde, `ROLLBACK`'li)

`sql/rollback-audit-append-only.sql`'in `DO` bloğunun **birebir semantiği** tek bir
`BEGIN … ROLLBACK` içinde uygulandı (gerçek script koşturulMADI — DB'yi
sertleştirmeden çıkarırdı):

```
--- 0) BAŞLANGIÇ (sertleştirilmiş) ---
 audit_log          | upd f | del f | trunc f
 platform_audit_log | upd f | del f | trunc f

--- 1) ROLLBACK SEMANTİĞİ (GRANT UPDATE, DELETE) ---
 audit_log          | upd t | del t | trunc_must_be_false f   ← ⭐ TRUNCATE GELMEDİ
 platform_audit_log | upd t | del t | trunc_must_be_false f   ← ⭐ TRUNCATE GELMEDİ

--- 1b) HAM ACL ---
 audit_log          | {arkesoft_migrator=arwdDxtm/…, arkesoft_app=arwd/…}
 platform_audit_log | {arkesoft_migrator=arwdDxtm/…, arkesoft_app=arwd/…}
```

**`arwd` = BAŞLANGIÇ DURUMUNUN BAYT-BİREBİR AYNISI.** Bağımsız iki tanık:

1. Sertleştirmenin hedefi OLMAYAN tabloların bugünkü ACL'i: `tenant` ve
   `tenant_membership` → `arkesoft_app=arwd/arkesoft_migrator` (aynı dize).
2. `pg_default_acl` (`defaclobjtype='r'`) → `{arkesoft_app=arwd/arkesoft_migrator}` ⇒
   `arkesoft_migrator`'ın `public`te doğurduğu YENİ tablolar da `TRUNCATE` **almıyor**.

⇒ Rollback artık başlangıç durumunun **ÜSTÜNE ÇIKMIYOR**. Tur 1'in `high`'ı kapandı.

## (b) İleri-geri bir tur sonrası durum KAYMIŞ mı — **HAYIR**

Aynı transaction içinde §9 `REVOKE UPDATE, DELETE, TRUNCATE` **yeniden** uygulandı:

```
--- 2) İLERİ-GERİ TUR (§9 tekrar) ---
 audit_log          | upd f | del f | trunc f
 platform_audit_log | upd f | del f | trunc f
--- 3) ROLLBACK SONRASI (DB'de hiçbir şey değişmedi) ---
 audit_log          | upd f | del f | trunc f
 platform_audit_log | upd f | del f | trunc f
```

**Asimetri gerçek ama ZARARSIZ, hatta doğru yönde:** §9 `TRUNCATE`'i çeker, rollback onu
geri vermez ⇒ bir ileri-geri tur sonrası durum `{upd t, del t, trunc f}`, yani
**v0.0.20.2 öncesi GERÇEK başlangıç durumu** (`arwd`). Kayma **yukarı** (daha yetkili)
değil; `TRUNCATE` hiçbir zaman verilmemişti, bu yüzden "geri verilmemesi" bir kayıp
değil. §9'un `REVOKE TRUNCATE`'i rollback'ten SONRA da kalıcı etkili — `pg_default_acl`
yeni tabloları `arwd` ile doğurduğu için bu savunma bugün **yük taşımıyor**
(no-op), ama savunma derinliği olarak zararsız. **Bulgu değil.**

## (c) Paylaşılan yardımcının tek-nokta-arızası mutasyonu

| Mutasyon                                                                                   | Sonuç                                                                                                                                        | Değerlendirme                      |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **A** — `extractForeachLiteralArray`'in ayrıştırmasını boz (`.slice(1)`)                   | ⭐ **İKİ dosyada da KIRMIZI**: 4 test / 6 (`auth-secret` 2 + `append-only` 2). Mesajlar tabloyu ADLANDIRDI (`[account]`, `[audit_log]`)       | ✅ **Tek nokta arızası DEĞİL**     |
| **B** — `expectForeachArrayMatchesDeclaredSet`'i erken `return` ile etkisizleştir (3 satır) | ⚠⚠ **6/6 YEŞİL = SAHTE YEŞİL.** `npx eslint <dosya>` → 0 bulgu; `tsc --noEmit` → 0 hata                                                      | ⚠ `low` bulgu (yukarıda)           |

Yani: **bozulma** yönünde fail-closed (A), **etkisizleştirme** yönünde fail-open (B) ve
B'nin patlama yarıçapı refactor ile 1→2 süiteye çıktı. Yardımcının kendisi için meta-test
yok. Her iki mutasyon `Edit`/kopya ile geri alındı (md5 `f850d9a5…` teyitli).

## (d) 4. mutasyonun YENİDEN KOŞUMU — tespit **HÂLÂ GEÇERLİ**

Mutasyon (gerçekçi varyant): `platform_audit_log`'u **üç yerden AYNI ANDA** sil —
`tenancy.ts`'in beyanı + `bootstrap-roles.sql` §9 dizisi + `rollback-audit-append-only.sql`
dizisi.

| Tanık                                              | Sonuç                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `append-only-tables-sql-consistency.test.ts`       | ⚠ **YEŞİL** (üçü de tutarlı: `{audit_log}` ≡ `{audit_log}`)                                                               |
| `auth-secret-tables-sql-consistency.test.ts`       | ⚠ YEŞİL (ayrı küme)                                                                                                       |
| `tsc --noEmit` (`Exclude<>` pin dahil)             | ⚠ **YEŞİL**                                                                                                                |
| ⭐ **`catalog-lint-live.isolation.test.ts` (DB)**   | ⭐⭐ **KIRMIZI, TAM 1 bulgu:** `APP_ROLE_MISSING_DML_PRIVILEGE` / `platform_audit_log` — *"`arkesoft_app` rolü … SELECT/INSERT/UPDATE/DELETE yetkilerinin tamamına sahip değil"* |

⇒ **"Dördüncü tanık (veritabanı)" tespiti HÂLÂ GEÇERLİ** ve `catalog-lint-live`'ın dört
`[]` jetonunun gerçek beyana çevrilmesi sonucu **DEĞİŞTİRMEDİ** — çünkü tanıklığı yapan
tek çağrı noktası zaten `toEqual([])` taşıyan "sağlıklı durum" testiydi; diğer dördü
`.some()` tabanlı ve bu mutasyona duyarsız (dosyanın kendi yorumu bunu doğru tespit
ediyor). Üstelik beyanı **tamamen boşaltma** varyantı ÜÇÜNCÜ bir tanığa da çarpıyor:
`expectForeachArrayMatchesDeclaredSet`'in `toBeGreaterThan(0)` anti-vakum bekçisi.
`architect`'in "tamamlayıcı iki kural" tasarımı **mekanik olarak çalışıyor**. ⇒ `M4`
kararı **(b)** (iddiayı daralt + `D11`'e yaz) **doğru**; bulgu değil.

## (e) `export` sızıntısı — **YOK**

| Eksen                                      | Ölçüm                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/index.ts`'e sızdı mı      | **HAYIR** — `git diff packages/db/src/index.ts` **BOŞ**; barrel `isPrivilegeDeniedError`'ı export etmiyor                   |
| Üretim kodu import edebilir mi             | **HAYIR** — `package.json` `exports` yalnızca `"."` → `dist/index.d.ts` (alt yol haritası YOK); `files: ["dist"]`           |
| Derlenmiş çıktıda var mı                   | **HAYIR** — `tsconfig.build.json` `exclude: ["src/__tests__"]`; `ls packages/db/dist/__tests__` → **dizin yok**             |
| Gerçek tüketici                            | Tek: `platform-tables.isolation.test.ts:56` (aynı paket, aynı `__tests__` ağacı)                                            |

⇒ *"42501'i beklenen sayan bir yol"* üretim yüzeyinde **doğmuyor**. Ayrıca fonksiyonun
kendisi fail-closed: `P2039` **VE** Zod ile parse edilmiş `originalCode === '42501'` —
iki koşul birden; `safeParse` başarısızlığı `false` döner. İzolasyon süitinin "varlık/yetki
oracle'ı" özelliği de korunmuş: senaryo 4 **var olan yabancı satır** ile **var olmayan
satırı** aynı ret sınıfına bağlıyor, senaryo 5 (`serializeError`) yabancı `tenantId`/satır
id'sinin 42501 gövdesinde de sızmadığını canlı doğruluyor (86/86 yeşil).

## (f) Type-guard fail-closed mu — **HAYIR** (bulgu `M1`, yukarıda)

```
true  roles                  string
true  auth-role              string
true  audit-append-only      string
false bogus                  -            ← istenen davranış
true  toString               function     ← GUARD BYPASS
true  valueOf                function     ← GUARD BYPASS
true  constructor            function     ← GUARD BYPASS
true  __proto__              object       ← GUARD BYPASS
… (12 miras anahtar)
Object.hasOwn: toString→false, __proto__→false, roles→true   ← düzeltme doğrulandı
spawnSync(non-string arg): HATA VERMEDİ (sessiz dize zorlaması)
```

**Keyfi dosya yolu enjekte edilebilir mi: HAYIR.** Saldırgan yalnızca anahtar ADINI
seçer; değer `SQL_PATHS` aramasından gelir ve miras anahtarlar için fonksiyon/nesne
döner — saldırgan kontrolünde bir dize değil. `Object.prototype` kirletmesi olan bir
bağımlılık **gelecekte** bu zinciri `prisma db execute --file <saldırgan dizesi>`'ne
çevirebilir; bugün `pnpm audit`'te böyle bir danışmanlık **yok** ⇒ `high` yazmadım.
`evaluateTargetDatabase` yıkıcı-hedef kapısı her durumda ÖNCE koşuyor.

## (g) İddia dürüstlüğü grep'i (CHANGELOG'lar DAHİL) — **TEMİZ**

`grep -rn "değiştirilemez|silinemez|immutable|tamper-evidence"` (`*.md`, `*.ts`, `*.sql`,
`*.prisma`; `node_modules` hariç). Denetim izi bağlamındaki **her** satır ya iddianın
**açık çürütmesi** ya da ilgisiz:

- `ROADMAP:1378` — *"önceki başlık `tamper-evidence` diyordu — bu **yanlıştı**"*
- `ROADMAP:1435` + `ADR-0017:441`/`:447` — *"**'silinemez' iddiası `audit_log` için yanlıştır**"*; sertleştirme cümlesi *"yalnızca eklenebilir; güncelleme/silme/TRUNCATE yetkisi yok"*
- `ROADMAP:3531` — *"✅ KAPANDI … ⚠ 'Tamper-evident' **hâlâ değil**"*
- İlgisiz: Astro `immutable` cache header'ı, v0.0.14 *"son `owner` silinemez"* iş kuralı, Redis `noeviction`, `AGENT_BASELINE.md` başlığı, geçmiş Task dosyaları

**CHANGELOG ekseni (15 dosya tek tek sayıldı):** iddia metnini yalnızca kök `CHANGELOG.md`
ve `packages/db/CHANGELOG.md` taşıyor, **ikisi birebir aynı** ve ikisi de (i) *"tamper-evident
olduğu anlamına gelmez"* uyarısını, (ii) `ON DELETE` **ve** `ON UPDATE` eksenlerini,
(iii) *"herhangi bir kiracının … `tenant` tablosu RLS taşımadığı için"* cümlesini taşıyor.
Diğer 13 paket `CHANGELOG`'u yalnızca bağımlılık yükseltmesi / *"No changes in this
release."* içeriyor. Eski dar ifade (*"o kiracının"*) ürün belgelerinde **kalmadı**
(kalan iki eşleşme: `ROADMAP:1434` — zaten *"herhangi bir kiracının"* ile birlikte aynı
cümlede, ve `tasks/T-023.md:73` — tarihsel `pm` metni, ürün belgesi değil).

## (h) Veritabanı SERTLEŞTİRİLMİŞ — ispat

```
     tablename      |                  durum
--------------------+-----------------------------------------
 audit_log          | sel t | ins t | upd f | del f | trunc f
 platform_audit_log | sel t | ins t | upd f | del f | trunc f
 tenant_membership  | sel t | ins t | upd t | del t | trunc f
```

İstenen matrisle **birebir**. Ek bağımsız ölçümler:

- `information_schema.role_table_grants`: iki denetim tablosunda `arkesoft_app` → yalnızca `INSERT, SELECT`; `arkesoft_migrator` (tablo sahibi) tam set (= `D5`, yapısal olarak kapatılamaz).
- **Baypas rolü taraması:** `rolcanlogin` taşıyan dört rolün tamamı için `UPDATE/DELETE/TRUNCATE` → `arkesoft_app` **f/f/f**, `arkesoft_auth` **f/f/f**, yalnızca `arkesoft_migrator` + superuser `t`. ⇒ `REVOKE`'un yanından dolaşan ikinci bir çalışma zamanı rolü **yok**.
- `pg_roles.rolconfig` → üç çalışma zamanı rolünde de `NULL` (`D13`'ün bugünkü durumu).
- `M3/M3b` bağımsız teyit (anti-vakumlu): `public`te **20** tablo; `arkesoft_app` TRUNCATE taşıyan **0**, `arkesoft_auth` TRUNCATE taşıyan **0**, `arkesoft_app` SELECT taşıyan **16** (⇒ sorgu boşa çıkmıyor).
- Üretim yazma yolu taraması: `auditLog.create` (1) + `platformAuditLog.create` (1) + iki okuma; `update`/`delete`/`upsert` **0** ⇒ `REVOKE` hiçbir üretim yolunu kırmıyor. KAPI 4'ün anti-vacuity assert'leri (`.platformAuditLog.create` → `toBe(1)`) bunu mekanikleştiriyor.
- **Prob kalıntısı YOK:** tüm DDL probları `BEGIN … ROLLBACK` içinde; `pnpm db:bootstrap` / gerçek rollback script'i **koşturulMADI**; `FLUSHDB`/`DROP`/`TRUNCATE` **yok**; kullanıcının verisine dokunulmadı; `docker context` değişmedi; hiçbir konteyner durdurulmadı; kök `.env` okunmadı/yazılmadı; 3000/5173/5174 portlarına dokunulmadı; Playwright/e2e **koşturulMADI**.
- **Mutasyon kalıntısı YOK (md5):** `catalog-lint.ts` `858c4235…`, `tenancy.ts` `f33fb836…`, `bootstrap-roles.sql` `04b99f84…`, `rollback-audit-append-only.sql` `c1da0dae…`, `foreach-array-sql-consistency.ts` `f850d9a5…` — beşi de mutasyon ÖNCESİ değerle aynı. `git diff --stat` izlenen dosyalarda orijinal satır sayılarını koruyor. Doğrulama koşumu: birim **260/260**, izolasyon **86/86**.

## (i) Makine yükü

| An                                | load avg (1/5/15) | Konteyner |
| --------------------------------- | ----------------- | --------- |
| Tur başlangıcı (02:01)            | 4.82 / 4.73 / 4.79 | 25        |
| İzolasyon süiti koşarken (02:05)  | 4.04 / 4.04 / 4.37 | 25        |
| Tur kapanışı (02:09)              | 3.18 / 3.23 / 3.93 | 25        |

Makine **sakin değil** (kullanıcının ~25 konteyneri + paralel `solid` tur 2). İzolasyon
süiti 4.54 sn'de 86/86 yeşil geçti; bu turda flake **gözlenmedi** — ancak tek koşum
%6,7'lik bir flake'in yokluğunu **kanıtlamaz**; bu turun iddiası yalnızca *"benim
mutasyonlarım kalıntı bırakmadı"*dır, AC-13'ün flake aritmetiği `qa`/`release`'in işi.
`turbo` kullanılmadı (doğrudan `npx vitest run`) ⇒ önbellek kaynaklı sahte yeşil riski
bu ölçümler için **yok**.

## (j) DOĞRULANAMADI

1. **`D5` (tablo sahibi / superuser ekseni)** — `arkesoft_migrator` ve `arkesoft` tüm
   fiilleri taşıyor. Yapısal olarak kapatılamaz, borçta kayıtlı; ölçtüm, bulgu YAZMADIM.
2. **`D2` FK cascade'in canlı tekrarı** — tur 1'de canlı ölçmüştüm; bu turda
   **tekrarlamadım** (bilinçli kapsam dışı, `D2` borçta `medium`). Bu turun F2/F3
   doğrulaması yalnızca **belge** eksenindedir.
3. **CI'ın iki geçişli `prepare-db`'si** — yerel tek geçişli; §9'un *"ikinci geçişte
   gerçekten uygulanır"* iddiası **CI'da** ölçülmedi (yerelde zincirli `db:migrate &&
   db:bootstrap` ile bugün uygulanmış durumda olduğunu ACL'den gördüm).
4. **`pnpm guards` / `format:check` / `pnpm test:isolation --force` ×n** — Orkestratörün
   ölçümüne güvendim, bu turda tekrar koşturmadım (yüzeyi `packages/db` dışına çıkan
   kapılar `qa`/`release`'in işi). Kendi raporum için `prettier --write` koştum.
5. **Grep-tabanlı KAPI 4'ün yapısal limiti** — `const { platformAuditLog } =
   prisma.platform; platformAuditLog.delete(…)` gibi destructure edilmiş bir yazım altı
   needle'ın HİÇBİRİYLE eşleşmez. Bu **zaten** `D9` borcu (`Omit<…,'update'|'delete'|
   'upsert'>` derleme garantisi). ⚠ Bu sürümden sonra bu limitin **arkasında** veritabanı
   seviyesi `REVOKE` var ⇒ artık tek bariyer değil; yeni bulgu yazmadım.
