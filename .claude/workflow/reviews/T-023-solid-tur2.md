# T-023 — GATE `solid`, tur 2 (TAM yeniden denetim)

Tarih: 2026-11-18
Sürüm: ROADMAP v0.0.20.2
Dal: `feat/v0.0.21-surum-kayit-modeli`
Yöntem: **statik** inceleme (`Bash` aracı YOK — hiçbir komut çalıştırılmadı, hiçbir test
koşturulmadı, hiçbir ölçüm bu rapordan gelmiyor)

```
GATE: solid
SONUÇ: PASS
```

---

## Özet

Tur 1'in `high`'ı (geri almanın `TRUNCATE` vermesi) **gerçekten kapandı** ve üç `medium`'un
üçü de kapandı — ikisi (kopya `isPrivilegeDeniedError`, kopya `FOREACH` ayrıştırıcısı)
**doğru** şekilde, yani süreç kısıtı yerine tasarım kararı verilerek. Yeni paylaşılan
yardımcı **gerçek tekilleştirmedir**, yanlış soyutlama değil (gerekçe aşağıda).

FAIL yok: `critical` 0 · `high` 0 · `medium` 2 · `low` 5. İki `medium`'un ikisi de
**kapanan `high`'ın etrafında**: (F1) geri alma hedefini seçen tip yüklemi, bir `low`
kapatılırken **sağlam olmayan** hâle geldi; (F2) kapanan `high`'ın kendisi **mekanik olarak
korunmuyor** — rollback SQL'ine `TRUNCATE` geri eklenirse bugün **hiçbir test kırmızı
olmaz**.

⚠⚠ **Ölçüm hijyeni (zorunlu okuma — aşağıda ayrı bölüm):** denetim sırasında
`packages/db/src/tenancy.ts` **iki okumam arasında değişti** (beyan satırı yok → var).
Paralel koşan `security` tur 2'nin mutasyonu olduğu sonucuna vardım ve **bulgu
yazmadım**; ama Orkestratör bunu doğrulamalı.

---

## Tur 1 bulgularının durumu

### `high` — `rollback-audit-append-only.sql` `TRUNCATE` veriyordu → **KAPANDI**

Kanıt (beşi de ayrı):

- `packages/db/sql/rollback-audit-append-only.sql:68-71` — `GRANT UPDATE, DELETE ON
  public.%I TO arkesoft_app`; `TRUNCATE` **yok**.
- `packages/db/sql/bootstrap-roles.sql:457-460` — §9'un savunmacı
  `REVOKE UPDATE, DELETE, TRUNCATE`'i **kaldı** (önerilen hâl).
- `packages/db/src/__tests__/rollback-audit-append-only.isolation.test.ts:240-243` —
  `restoredFalseVerbs = ['canUpdate', 'canDelete']` (3→2).
- Aynı dosya `:287-295` — canlı assert `canUpdate: true, canDelete: true,
  canTruncate: false`.
- Yanlış yorum (`:51-53`'ün eski hâli) **düzeltildi**, yerine ölçümlü gerekçe yazıldı
  (`rollback-audit-append-only.sql:51-67`).

### AC-15'in yeni dört'lü kümesi — **gevşetilmedi, sayı DOĞRU**

Soru 4'ün cevabı: 4 = **2 tablo × 2 fiil**, mekanik olarak doğru.
`lintAppRoleTablePrivilegeExpectations` (`catalog-lint.ts:780-798`) **fiil başına bir**
bulgu üretir; geri alma DDL'i (`rollback-…isolation.test.ts:176-184`) iki tabloda iki fiil
geri verir ⇒ tam 4 `APP_ROLE_UNEXPECTED_PRIVILEGE`. Test **yük taşımaya devam ediyor**,
beş bağımsız ayakla:

1. `:260` `toEqual(expectedFindings)` — `.some()`/`arrayContaining` değil, **sıralı tam
   küme**.
2. `:268-271` — bu kural **dışında** hiçbir kuralın ateşlenmediği ayrı assert (eski
   `APP_ROLE_MISSING_DML_PRIVILEGE`'ın yeniden silahlanmadığının ters-istikamet kanıtı).
3. `:245-249` — beyanın o iki fiil için **gerçekten** `false` taşıdığı runtime assert'i
   (beklenen kümenin sessizce küçülmesini kapatır).
4. `:282-296` — canlı yetki ölçümü, bulgu kümesinden **bağımsız**; `canTruncate: false`
   burada pinli. Fiil ekseni bu assert ile kapanıyor — bulgu matcher'ı yalnızca
   `rule`+`tableName`'e baktığı için (`:251-258`) tek başına yetmezdi.
5. `:302` + `:309` — `S_healthy ≠ S_rolledback` ve `ROLLBACK` sonrası kalıntı yok.

### `medium` M2 — kopya `isPrivilegeDeniedError` → **KAPANDI**

- `packages/db/src/__tests__/helpers/tenant-isolation-suite.ts:181` — `export` eklendi
  (`:174-180` gerekçesi: süreç kısıtı ≠ tasarım kararı).
- `packages/db/src/__tests__/platform-tables.isolation.test.ts:56` — import; ~37 satırlık
  kopya (Zod şeması + SQLSTATE sabiti + fonksiyon) **silindi** (grep: `packages/db` içinde
  `isPrivilegeDeniedError` beyanı **tek**).
- Soru 2'nin cevabı: **paket yüzeyi olmadı.** Dosya `src/__tests__/helpers/` altında ve
  `packages/db/tsconfig.build.json:11` `src/__tests__`'ü derlemeden **dışlıyor**;
  `packages/db/package.json:7-12` yalnızca `dist`'i export ediyor ⇒ `index.ts`'e sızma
  **yapısal olarak imkânsız**. `__tests__` altından `export` etmek burada **doğru yer**:
  emsali aynı dizindeki `createTenantIsolationSuite`/`TenantScopedProbe` export'ları.
- Üçüncü bir benzer blok (`auth-role-privileges.isolation.test.ts:95-131`) **bilerek
  birleştirilmedi** ve bu doğru: `z.looseObject` + `.code`'a **hiç** assert etmeme kararı
  (`:87-94`) farklı bir sebeple değişir (T-015'ten, bu Task'ın kapsamı dışında).

### `medium` M3 — kopya `FOREACH` yardımcıları → **KAPANDI, soyutlama DOĞRU**

Soru 1'in cevabı — **gerçek tekilleştirme**, dört gerekçeyle:

- İki çağıranın ihtiyacı **birebir aynı sözleşme**: "bir SQL dosyasının metninden
  `FOREACH <değişken> IN ARRAY ARRAY[...]` literalini çıkar, **dosya başına TAM 1**
  eşleşme zorla, `tenancy.ts`'teki beyanla **iki yönlü** küme karşılaştır". Bu sözleşmenin
  **tek bir değişme sebebi** var (Postgres söz dizimi / FIX turu 3'ün YOL A kararı) ⇒
  birleştirme doğru yönde.
- `loopVariableName` **sızdıran parametre değil**: davranışı değiştiren tek şey ve
  F-NEW-3'ün kısıtının (iki dosyada farklı döngü değişkeni) **doğal** ifadesi. Parametre
  olmasaydı iki ayrı kopya **zorunlu** olurdu — yani kısıt soyutlamayı engellemiyordu,
  aksine parametreyi **gerektiriyordu**.
- `declaredSetLabel` yalnızca **hata mesajı** için; karşılaştırma mantığına girmiyor
  (`foreach-array-sql-consistency.ts:86-95`). Mesaj parametresi soyutlamayı sızdırmaz.
- Birleşmemesi gerekenler birleşmedi: `expectDoBodyHasIfExistsGuard`
  (`append-only-…test.ts:57-73`) ve `AUTH_SECRET_BEARING_TABLES ⊆
  AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS` kapısı (`auth-secret-…test.ts:124-158`) **kendi
  dosyalarında kaldı** — farklı sebeplerle değişirler.

Tek kalıntı (bulgu değil, not): yardımcının `label` parametresi, çağıranda
`loopVariableName`'i **metin olarak ikinci kez** taşıyor (`append-only-…test.ts:78` ile
`:80`) ⇒ ileride biri değişip diğeri kalırsa mesaj yanıltır. Davranışa etkisi yok.

### `medium` M4 — fazla iddialı "beşinci liste yapısal olarak oluşamaz" → **KAPANDI (b)**

- `docs/adr/0017-…md:416-425` — iddia **üç parçaya** bölündü; (3) "ekleme yönü tamamen
  açıktır" **açıkça** yazıldı ve `D11` borcuna bağlandı.
- `packages/db/src/catalog-lint.ts:273-278` — eski "yapısal olarak oluşamaz" cümlesi
  **yok**, yerine nötr "iki kural tamamlayıcı" tarifi.
- `packages/db/src/tenancy.ts:307-322` — aynı şekilde `D11`'e atıf yapıyor.
- `append-only-tables-sql-consistency.test.ts:18-23` — "üçü de aynı anda eksik kalırsa üçü
  de tutarlı görünür" **kendi dosyasında** yazılı.
- (b) seçiminin gerekçesi (yeni kural + fixture + tip-pin yüzeyi açmamak) `solid`
  açısından **savunulabilir**: (a) yalnızca TRUNCATE eksenini kapatırdı, ekleme yönünü
  kapatmazdı.

### Altı `low`'un durumu — **beşi KAPANDI, biri KAPANMADI**

- Bayat/yanlış yorumlar: **KISMEN.** `catalog-lint.ts:405-410`, `:688-696`, `:757-762`,
  `audit-log.probe.ts:38-47`, `catalog-lint.test.ts:1353-1361` ve `:1576-1585`
  **düzeltildi**. ⚠ `apps/api/src/__tests__/production-write-path-grep.qa.test.ts:308-311`
  **HÂLÂ eski ve HÂLÂ yanlış** (tur 1 bu satırı adıyla ve "öncelikli" diyerek yazmıştı) ⇒
  aşağıda yeniden raporlandı.
- `t` → `tableName`: **KAPANDI** (`audit-append-only.isolation.test.ts:31-40,46,52` —
  Zod şeması, tip ve SQL takma adı birlikte).
- Totolojik üçüncü `it`: **KAPANDI** (`append-only-…test.ts:94-98` — silindi, gerekçesi
  yorumda).
- `catalog-lint-live`'ın dört `[]` jetonu: **KAPANDI** (`:156`, `:199`, `:234`, `:292`
  gerçek beyanı geçiriyor). ⚠ Yan etki: `:117-119`'daki açıklama **bayatladı** (aşağıda).
- `rollback-roles.ts` üç yer → iki yer: **KAPANDI ama GERİLEME ÜRETTİ** ⇒ F1.
- `catalog-lint.ts:1193-1199` vakumu: **KAPANDI ve fixture GERÇEKTEN yük taşıyor.**
  Soru 7'nin cevabı: `catalog-lint.test.ts:1304-1325` beklenti tablosunda **olmayan** bir
  tabloda (`tenant`) `arkesoft_auth` için **yalnızca** `canTruncate: true` kuruyor; diğer
  dört fiil `false`. `lintAuthRoleUnexpectedTablePrivileges`'in yüklemi
  (`catalog-lint.ts:1202-1208`) beş terimli `||` olduğu için `|| privilege.canTruncate`
  silinince bu satır **hiçbir** terimi tetiklemez ⇒ `toEqual([...tek bulgu])` **kırmızı**
  olur. Kural tüm `snapshot.privileges` üzerinde döndüğü (`:1191`) ve fixture satırı
  **eklediği** için tam 1 bulgu determinist.

---

## YENİ BULGULAR

### [SEV: medium] `packages/db/src/rollback-roles.ts:109-111` — `isRollbackTarget` tip yüklemi SAĞLAM DEĞİL (`in` operatörü `Object.prototype` anahtarlarında da `true`); yüklem GİZLİ BİR `as` gibi davranıyor

Soru 3'ün cevabı: yüklem **doğru değil**.

```ts
function isRollbackTarget(value: string): value is RollbackTarget {
  return value in SQL_PATHS
}
```

`SQL_PATHS` düz bir nesne literali (`:87-91`) ⇒ prototip zinciri `Object.prototype`'tır ve
`in` **kalıtılan** anahtarları da görür: `'toString' in SQL_PATHS === true`. Aynısı
`constructor`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`, `__proto__` için de geçerli.
Sonuç zinciri:

1. `node dist/rollback-roles.js toString` (veya yukarıdaki adlardan biri) çağrıldığında
   `resolveTarget` (`:118-129`) **hata vermez**, değeri `RollbackTarget`'a **daraltır**.
2. `SQL_PATHS[target]` (`:238`) tipi `string`'dir (`Record<RollbackTarget, string>`), ama
   çalışma zamanında **`undefined`**'dır — `noUncheckedIndexedAccess` burada **devre
   dışıdır**, çünkü anahtar tipi birleşimin kendisi.
3. `runPrismaDbExecute(env.databaseUrl, undefined)` → `spawnSync('prisma', ['db',
   'execute', '--file', undefined])` ⇒ Node `ERR_INVALID_ARG_TYPE` `TypeError`'ı atar;
   operatör dosyanın yazdığı anlamlı Türkçe hatayı (`:123-128`) **görmez**.

Bu, tur 1'in `low`'unu kapatırken üretilmiş bir **gerileme**: eski üçlü `||` zinciri
sağlamdı. Üstelik `:100-107`'deki gerekçe yorumu *"`SQL_PATHS`'in anahtar kümesine üyelik
sorar"* diyor — **yanlış**; sorduğu şey prototip dahil üyeliktir. Derece `high` değil
(yıkıcı eylem tetiklenmiyor, `evaluateTargetDatabase` koruması hâlâ çalışıyor), ama yüklem
**yalan söylüyor** ve bu dosya yıkıcı DDL koşturan operatör giriş noktası.

**Önerilen düzeltme:** `return Object.hasOwn(SQL_PATHS, value)` (tip yüklemi KALIR — TS
`Object.hasOwn`'u kendiliğinden daraltmaz). Yorum da düzeltilir.

**Sorumlu ajan:** `db`

---

### [SEV: medium] `packages/db/sql/rollback-audit-append-only.sql:68-71` + `packages/db/src/__tests__/append-only-tables-sql-consistency.test.ts:76-103` — kapanan `high`'ın MEKANİK BEKÇİSİ YOK: rollback SQL'ine `TRUNCATE` geri eklenirse hiçbir test kırmızı olmaz

Tur 1'in `high`'ı düzeltildi ama düzeltmeyi **koruyan** otomatik kapı yok. Üç ölçüm:

- Drift testi SQL **metnini** yalnızca iki eksende okuyor: `FOREACH` **tablo dizisi**
  (`:80`, `:89` → `extractForeachLiteralArray`) ve `IF EXISTS`/`pg_tables` varlığı
  (`:57-73`). **Fiil listesi hiçbir yerde okunmuyor.**
- AC-15 testi SQL dosyasını **koşturmuyor**; semantiğini TypeScript'te **yeniden ifade
  ediyor** (`rollback-audit-append-only.isolation.test.ts:176-184`; gerekçesi `:29-34`'te
  yazılı ve kendi içinde doğru). Dolayısıyla dosya ile test **birbirinden bağımsız iki
  beyandır**; dosyaya `, TRUNCATE` eklemek testin ürettiği durumu **etkilemez**.
- `pnpm guards` sınıfı mekanik kapılarda bu fiil için jeton taraması yok (bu sürümde
  eklenmedi).

Yani v0.0.20.2'nin **en kritik** satırı (bir `TRUNCATE` hibesinin bütün kiracıların
denetim kaydını tek komutla silebilmesi — `security` bunu bağımsız olarak ölçtü) bugün
yalnızca **yorumla** korunuyor (`rollback-…sql:51-67`). Bu, projenin kendi dersi olan
"BEYAN ≠ GERÇEKLİK" sınıfı: beyan güçlü, bekçi yok.

**Önerilen düzeltme (düşük maliyet, mevcut dosyanın içinde):** drift testine üçüncü bir
assert — rollback SQL metnindeki `GRANT` ifadesinin fiil listesinin **tam olarak**
`UPDATE, DELETE` olduğu **ve** `TRUNCATE` jetonunu **içermediği**; bootstrap §9'un
`REVOKE`'unun ise üç fiili taşıdığı. Literal-jeton kuralına takılmıyor (bu test dosyası
kendi taradığı dosya değil).

**Sorumlu ajan:** `db` (S6/S7 dosyaları)

---

### [SEV: low] Bayat/yanlış yorum kümesi — biri tur 1'de adıyla yazılmış ve KAPANMAMIŞ, üçü FIX turunun kendisinin ÜRETTİĞİ yeni bayatlık

- `apps/api/src/__tests__/production-write-path-grep.qa.test.ts:308-311` — ⚠ **tur 1'de
  raporlandı, kapanmadı:** *"uygulama rolü dört DML yetkisinin dördüne de sahiptir ve
  bunu `catalog-lint` ZORUNLU tutuyor"* → v0.0.20.2'den sonra **iki denetim tablosu için
  de yanlış** (tam tersi zorunlu). Dosyanın KAPI 4 bloğu bu sürümde düzenlendi, cümle
  bırakıldı. **Sorumlu:** `backend`.
- `packages/db/src/__tests__/catalog-lint-live.isolation.test.ts:117-119` — *"Aşağıdaki
  `vaka (a)-(d)` testleri BİLEREK `[]` İLE KALDI"* → `:156`, `:199`, `:234`, `:292` artık
  **gerçek beyanı** geçiriyor; cümle kendi dosyasının 40 satır aşağısıyla çelişiyor.
  **Sorumlu:** `db`.
- `packages/db/src/catalog-lint.ts:213-224` — *"`APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS` bu
  alt görevde (①) BİLEREK BOŞ (`[] as const`, `tenancy.ts`)"* → S6'dan sonra yanlış. Aynı
  dosyanın `:405-410`/`:688-696`/`:757-762` noktaları düzeltildi, **dosya başı atlandı**.
  **Sorumlu:** `db`.
- `packages/db/src/__tests__/helpers/tenant-isolation-suite.ts:50-52` — *"bu adımda HENÜZ
  DEĞİL — DDL yok, davranış bugünle BİREBİR aynı kalır"* (K-A17 adım ②'nin anlık hâli) →
  DDL S6'da uygulandı. Aynı dosyada `:23-27` (senaryo 3/4 "P2025 ile tespit edilir",
  koşulsuz), `:92-95` jsdoc (*"görünmezse Prisma P2025 fırlatır"*) ve `:342-343` (*"Delete
  RLS tarafından filtrelendiği için"*) `audit_log` probu için artık **yanlış**.
  **Sorumlu:** `db`.

**Vade önerisi:** v0.0.21 (yolu üstünde kapanır).

---

### [SEV: low] `packages/db/src/__tests__/helpers/audit-log.probe.ts:48-54` — probun kendi gerekçe cümlesi artık GERÇEĞİN TERSİ: bu prob RLS'in UPDATE/DELETE filtrelemesini ARTIK ÖLÇMÜYOR

Dosya `:48-54`'te hâlâ *"Prob o yolu açmıyor; onun YOKLUĞUNDA ölçülemeyecek bir güvenlik
özelliğini (RLS'in UPDATE/DELETE'i de filtrelediğini) ölçüyor"* diyor. §9'dan sonra
`arkesoft_app`'in `UPDATE`/`DELETE` denemesi **RLS'e hiç gelmeden** `42501` ile reddediliyor
(dosyanın kendi `:157-166`'sı ve `mutationRejection: 'privilege-denied'` bunu doğru
anlatıyor) ⇒ senaryo 3/4 artık **yetki katmanını** ölçüyor, RLS'i değil.

Kapsam borcu **değil** (daha güçlü garanti zayıfını kapsıyor; RLS'in UPDATE/DELETE ekseni
diğer altı probda ve katalog linter'ının kanonik politika kuralında ölçülmeye devam
ediyor) — ama cümle, dosyanın kendisinin uyardığı "BEYAN ≠ GERÇEKLİK" sınıfına düşüyor.

**Önerilen düzeltme:** madde 3'ün son cümlesini güncelle: prob bugün **yetki reddini**
ölçüyor; RLS ekseni bu tablo için **artık ulaşılamaz** ve bu bilinçli.

**Sorumlu ajan:** `db` · **Vade:** v0.0.21

---

### [SEV: low] `packages/db/src/__tests__/catalog-lint-live.isolation.test.ts:148-155, 191-198, 226-233, 284-291` — aynı 8 satırlık gerekçe yorumu DÖRT KEZ birebir kopyalanmış (32 satır)

Dört çağrı noktası aynı açıklamayı **kelime kelime** taşıyor. Kod tekrarı değil ama aynı
sınıf: biri güncellenip üçü unutulduğunda dosya kendi içinde çelişir — nitekim `:117-119`
şu anda tam olarak bu şekilde çelişiyor (üstteki `low`). Tek bir dosya başı notu + çağrı
noktalarında tek satırlık atıf aynı işi yapardı.

**Sorumlu ajan:** `db` · **Vade:** v0.0.21

---

### [SEV: low] `docs/development.md:426-479` + `packages/db/src/rollback-roles.ts:1-10` — yeni operatör komutu geri alma merdiveninde YOK; dosya başı "kademe 3 + kademe 4" diyor; §9'un asimetrisi DDL'in yanında yazılı değil

`pnpm db:rollback-audit-append-only` kök ve paket `package.json`'larında var
(`package.json:36`, `packages/db/package.json:33`) ve `rollback-roles.ts:73-79` ondan
*"Kademe 3/4/5"* diye söz ediyor; ama:

- `docs/development.md`'nin geri alma merdiveni yalnızca **kademe 1-3** ve **kademe 4**
  bölümlerini içeriyor (`:426-479`). Beşinci kademe **hiç yok** ⇒ `:455-464`'ün
  **yürütme sırası** uyarısı (*"gerçek sıra 4 → 1 → 2 → 3"*) artık **eksik**: yeni
  kademenin merdivende nereye oturduğu yazılı değil, oysa kademe 3'ten **sonra**
  koşturulması kademe 4 için belgelenen **tutarsız ara durumun** aynısını üretir
  (`arkesoft_app` hiçbir tabloda yetki taşımazken iki denetim tablosunda `UPDATE, DELETE`
  kazanır).
- `rollback-roles.ts:1-10` dosya başı hâlâ *"kademe 3 + kademe 4"* diyor (üçüncü hedef
  eklendi, başlık güncellenmedi).
- Soru 5'in cevabı: §9'un asimetrisi (geri alma `TRUNCATE`'i **bilerek** geri vermiyor;
  §9'un `REVOKE TRUNCATE`'i `pg_default_acl` gerekçesiyle **kalıcı** savunma)
  **belgelenmiş ama tek yerde**: `rollback-audit-append-only.sql:62-67` ve S7 testinin
  `:162-170`/`:277-280` yorumları. `bootstrap-roles.sql` §9'un yorumunda (`:411-447`) ve
  `ADR-0017` Ek'inde (`:401-405`) **yok** ⇒ §9'u okuyan birinin "simetriyi geri getirme"
  refleksi kapanan `high`'ı yeniden açabilir (F2 bu riski mekanik olarak kapatmıyor).

**Sorumlu ajan:** `docs` (merdiven + ADR notu) · `db` (dosya başı) · **Vade:** v0.0.21

---

## Doğrulanan iddialar (bağımsız, statik — bulgu DEĞİL)

1. **Katman ve bağımlılık yönü** — ihlal yok. `catalog-lint.ts`'in iç paket importu
   **sıfır** (beyan `LintCatalogOptions.appRoleTablePrivilegeExpectations` parametresi
   olarak geliyor, `:194-202`); `packages/db`'de iş mantığı yok (yalnızca şema/rol/katalog
   doğrulaması); `apps/api` değişikliği **tek test dosyası**; `packages/ui`/panel/`trpc`
   yüzeyi **hiç** dokunulmadı; döngüsel bağımlılık yok.
2. **Paket yüzeyi büyümedi** — `packages/db/package.json:7-12` yalnızca `dist`;
   `tsconfig.build.json:11` `src/__tests__`'ü dışlıyor ⇒ yeni `export`'ların (helper,
   `isPrivilegeDeniedError`) tamamı **test-içi**.
3. **Yasak jeton taraması** — `packages/db/src` ve değişen `apps/api` test dosyasında:
   `any` **0**, `@ts-ignore` **0**, boş `catch {}` **0**, `console.*` **0**.
   `@ts-expect-error` yalnızca T-023 **dışındaki** tip-pin dosyalarında (negatif pin
   deseni, bilinçli).
4. **`as` zorlamaları — üçü de meşru.** (a) `catalog-lint.ts:367`
   `Object.keys(PRIVILEGE_VERB_LABELS) as readonly PrivilegeVerbKey[]` —
   `Readonly<Record<PrivilegeVerbKey, string>>` kapalı kayıt + fazla alan kontrolü
   sayesinde **sağlam**; ⚠ tur 1'in "tek `as`" ölçümü bunu **atlamıştı**, düzeltiyorum.
   (b)/(c) `rollback-auth-role.isolation.test.ts:253` ve
   `rollback-audit-append-only.isolation.test.ts:212` — vitest `expect.objectContaining`'in
   tipsiz dönüşü; dış veri değil, gerekçesi yazılı.
5. **Tekrar (DRY) — yeni tekrar yok.** `lintAppRoleTablePrivilegeExpectations`
   (`:764-802`) ile `lintAppRoleDmlPrivileges` (`:680-739`) **ayrışık** ve birbirini
   `continue` ile dışlıyor (`:709`); `AppRoleTablePrivilegeExpectationLike` ile
   `AuthRoleTablePrivilegeExpectationLike`'ın ayrı tutulması (`:332-346`) doğru karar —
   farklı sebeplerle değişirler (`ADR-0017:431` bunu kayda geçirmiş).
6. **Erken soyutlama yok.** `MutationRejectionKind` iki üyeli union, **ikisi de** bugün
   gerçekten kullanılıyor (`audit-log.probe.ts:166` `'privilege-denied'`, diğer altı prob
   `'record-not-found'`), `assertNever` ile exhaustive
   (`tenant-isolation-suite.ts:208-217`) ve alan **zorunlu** (`:75`).
7. **İsimlendirme (CLAUDE.md §4)** — yeni dosya adları kebab-case
   (`foreach-array-sql-consistency.ts`, `rollback-audit-append-only.sql`), tipler
   PascalCase, boolean alanların tamamı `can*` önekli (`canSelect`…`canTruncate`), kural
   kodları SCREAMING_SNAKE_CASE, belirsiz kısaltma kalmadı (`t` → `tableName` kapandı).
8. **AC-12(c) tamamlayıcılığı** — zincir elle yeniden izlendi: `catalog-lint.ts:697-699`
   (beyan → Set) → `:709` (`continue`) → `:724-735` (dört-DML yüklemi);
   `catalog-lint.test.ts:1499-1527` bunu DB'siz **kodda** kanıtlıyor. Sınırı artık ADR'de
   doğru yazılı (M4).
9. **Snapshot `canTruncate`** — Zod'da opsiyonel **değil, zorunlu**
   (`catalog-snapshot.ts:209`) ve SQL'de okunuyor (`:522`); üç tüketim noktası
   (`catalog-lint.ts:358-367`, `:988-998` sınıfı, `:1202-1208`) ⇒ ölü veri değil.

---

## ⚠⚠ ÖLÇÜM HİJYENİ — denetim sırasında çalışma ağacı DEĞİŞTİ (bulgu olarak YAZILMADI)

`packages/db/src/tenancy.ts` dosyasını bu denetimde **iki kez** okudum:

- **1. okuma** (offset 270): `APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS` **tek satır**
  taşıyordu (`audit_log`); dizi `:342`'de kapanıyordu, `platform_audit_log` satırı
  **YOKTU**.
- **2. okuma** (dakikalar sonra, offset 331): **iki satır** (`audit_log` `:334-341`,
  `platform_audit_log` `:342-349`), dizi `:350`'de kapanıyor.

Yani dosya iki okuma **arasında** değişti. Yorumum: paralel koşan `security` tur 2'nin
**mutasyon ölçümü** (beyan satırını sil → kırmızıyı gör → `Edit` ile geri al) — handoff'un
*"`security` aynı dosyalara bakıyor (yazmıyor)"* notuyla çelişiyor, çünkü mutasyon
**yazmadır**. AGENT_BASELINE §5 ("kendi gürültünü bulgu sanma") ve T-019'un dört dersi
gereği **bulgu yazmadım**. İki uyarı:

1. ⚠ Eğer bu bir mutasyon **değilse**, tek satırlık beyan **gerçek bir gerilemedir** ve
   sonucu `critical`/`high` sınıfıdır: `append-only-tables-sql-consistency.test.ts`
   (iki SQL dizisi 2 üye, beyan 1 üye ⇒ `extraInSql` boş değil),
   `catalog-lint-live.isolation.test.ts:103-123`'ün sağlıklı durum `toEqual([])`'i (eski
   kural `platform_audit_log` için yeniden silahlanır) ve AC-15 (2 beklenen vs 3 gerçek
   bulgu) **kırmızıya** döner.
   ⇒ **Orkestratör `git diff packages/db/src/tenancy.ts` ile derhal doğrulamalı.**
2. ⚠ Mutasyon yarıda kalırsa (ajan düşer/iptal edilir) satır **silinmiş kalır** —
   kullanıcının MEMORY'sinde kayıtlı "ajan commit'lenmemiş dosyayı sildi" vakasının aynı
   sınıfı. Eşzamanlı mutasyon ölçümü ile gate denetimi **aynı anda koşturulmamalı**.

Bu dosyaya dayanan diğer ölçümlerim (beyan iki satır, pin gerçek sabiti tüketiyor, drift
testi iki yönlü) **2. okumaya** göredir.

---

## Kapsam dışı bırakılanlar (handoff talimatı — raporlanmadı)

`D2` FK cascade (iki eksen, çapraz kiracı) · `D3` bütünlük kanıtı · `D11` "ekleme yönü"
boşluğu + `CLAUDE.md §7` maddesi · `D12` `po` süreç boşluğu · `D13` `rolconfig`/`pg_temp` ·
`D14` KAPI 4 kökü.

---

## ÖLÇÜMLER

- İncelenen dosya: **22** (`packages/db/src` 9, `packages/db/src/__tests__` 8,
  `packages/db/sql` 2, `apps/api` 1, `package.json` ×2 + `tsconfig` ×2 tarandı) + **3**
  doküman (`docs/development.md`, `docs/adr/0017-…md`, `ROADMAP.md` ilgili bölümleri)
- `any`: **0** · `@ts-ignore`: **0** · boş `catch`: **0** · `console.*`: **0** ·
  gerekçesiz `as`: **0** (toplam `as` **3**, üçü de değerlendirildi — madde 4)
- En büyük fonksiyon (değişen dosyalarda): `lintCatalog`
  (`packages/db/src/catalog-lint.ts:1443-1546`, **104 satır**). Bu sürümde **yeni
  yazılan** fonksiyonların en büyüğü: `lintAppRoleTablePrivilegeExpectations`
  (`:764-802`, **39 satır**)
- Tur 1 bulgularının kapanışı: `high` **1/1 KAPANDI** · `medium` **3/3 KAPANDI** ·
  `low` **5/6 KAPANDI**, **1 KAPANMADI** (`production-write-path-grep.qa.test.ts:308-311`)
- Bu turun bulguları: critical **0** · high **0** · medium **2** · low **5**
- Komut çalıştırılmadı (`Bash` aracı yok) — test koşumu, `git diff`, `prettier --write`
  **hiçbiri** bu rapora ait değil. ⚠ Biçimlendirmeyi Orkestratör kapatmalı
  (AGENT_BASELINE §5).
