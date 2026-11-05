# T-015 · solid · Tur 3 (DAR) — kod kalitesi gate raporu

Tarih: 2026-11-05 · Sürüm: ROADMAP v0.0.14.1 · Dal: `main` (`.git/HEAD` → `ref: refs/heads/main`)

```
GATE: solid
SONUÇ: PASS
BULGULAR:
  - [SEV: low] packages/db/src/catalog-lint.ts:212-215 (ihlal eden çağrılar :1120, :1149) — `LintFinding.tableName`'in JSDoc'u "tablo bazlı olmayan kurallarda YOKTUR" diyor, ama FIX 2'nin iki yeni kuralı bu alana bir VIEW/matview adı (:1120 `relation.relationName`) ve bir FONKSİYON adı (:1149 `privilege.functionName`) yazıyor — alan adı artık taşıdığı şeyi YANLIŞ adlandırıyor ve JSDoc güncellenmedi; SD-5r ile AYNI beyan/gerçeklik sınıfı — Düzeltme: alanı `objectName`e (veya `{ kind, name }` ayrımlı özneye) çevir ya da JSDoc'u "tablo/ilişki/fonksiyon adı" diye GÜNCELLE — db
ÖLÇÜMLER: 7 dosya (hedefli bölümler) · gerçek `any` = 0 · `@ts-ignore`/`@ts-expect-error` = 0 · gerekçesiz `as` = 0 · kapsamdaki en büyük fonksiyon `lintAuthRoleSecretTableColumnPrivileges` (catalog-lint.ts:821-890, 70 satır — FIX 2'de DEĞİŞMEDİ); FIX 2'nin eklediği en büyük fonksiyon `mergeOperatorLineContinuations` (31 satır)
```

## ÜÇ BULGUMUN KAPANIŞI

| ID         | İddia                                                                | Bağımsız doğrulamam                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Sonuç       |
| ---------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **SD-5r**  | JSDoc artık var olmayan `columnOnly` satır alanına atıf yapmıyor      | `catalog-lint.ts:802-820` okudum: JSDoc β durumunu artık `isFullyColumnGranted` ile anlatıyor, `columnOnly`dan yalnızca "eskiden böyle yazıyordu" tarihsel notunda söz ediyor (:814). Alanın GERÇEKTEN yok olduğunu bağımsız doğruladım: `columnPrivilegeRowSchema` (`catalog-snapshot.ts:190-200`) dokuz alan taşıyor, `columnOnly` YOK. Gerçek davranış `catalog-lint.ts:874` = `hasColumnSelect && hasColumnInsert && hasColumnUpdate` — JSDoc ile BİREBİR. `isColumnOnlyPrivilege` repo genelinde yalnızca `:863`/`:869` YORUM satırlarında (aktif kod yok). | **KAPANDI** |
| **SD-6r**  | Satır numarası artık ham dosyadaki gerçek satırdan okunuyor           | Kodu elle izledim (`database-auth-url-no-fallback-literal.test.ts:102-132`): `rawLineNumber = rawIndex + 1`, birleşmede `previous.rawLineNumber` KORUNUYOR (:122), kullanım `:175` artık `merged.rawLineNumber`. Sentetik veriyi (`:223-229`) elle çalıştırdım: `merged` = [raw1, raw2(2+3 birleşik), raw4, raw5] → ihlal satırları **2, 5** (testin beklentisiyle aynı), birleştirilmiş dizi indeksleri **2, 4** (`:250` ile aynı). Yani test iki rakamı AYNI veriyle karşılaştırıyor — gerçek bir kayma kanıtı, implementasyon yansılaması değil.             | **KAPANDI** |
| **SD-9**   | İki sistem sınırı ayrıldı; anti-vacuity bekçisi eklendi              | İki `describe` artık AYRI ve her birinin değişme sebebi AYRI: `auth-secret-leak.test.ts:279-333` yalnızca AÇILIŞ/DI invariant'ı (`createTestApp(...)` `rejects.toThrow()`, pino "açılış durduruluyor" assert'i), `:349-403` yalnızca istek anı sınırı (`request(...)` → 500, better-call `console.error`). Bekçi `:386` `consoleErrorSpy.mock.calls.length > 0` — `request(...)` düşerse KIRMIZI olur. Seam temiz: `create-test-app.ts:242-246` opsiyonel/additive (`=== true`), varsayılan üretim kapısı devrede; `bypassAuthBootProbe` TEK çağrı noktasında (`auth-secret-leak.test.ts:360`). Üretim sınıfı `auth.module.ts:86-129` değişmedi — `onModuleInit` hâlâ logla + `throw` (fail-closed), `catch {}` yok; fixture override'ı yalnızca test grafiğinde (`auth-prisma-client-resource-boot-probe-fixture.ts:48-51`). | **KAPANDI** |

Kapanışlarda yeni katman ihlali, döngüsel bağımlılık, `any`, yutulan hata veya
sağlayıcı dallanması bulunmadı. `relationKind` `z.enum(['v','m','f'])` olduğu için
`RELATION_KIND_LABELS[relation.relationKind]` (`catalog-lint.ts:1122`) `noUncheckedIndexedAccess`
altında TOTAL — `undefined` basma riski yok.

**Ölçüm disiplini notu (vacuous grep):** kullandığım iki desen de bilerek eşleşen
örneklerle sınandı — `columnOnly` deseni 20+ gerçek satır döndürdü (yani desen çalışıyor,
"aktif kod yok" sonucu boş eşleşmeden değil, eşleşmelerin HEPSİNİN yorum olmasından
geliyor); `any|@ts-ignore|as [A-Z]` deseni kapsam dışı dosyalarda `Server as NetServer`
ve yorum içindeki `any` kelimesini yakaladı (desen çalışıyor), üretim/test kodunda gerçek
`any` SIFIR.

## EK SORU: Kaynak D ⇄ Kaynak E tek soyutlama mı olmalıydı?

**Hayır — ama S-15'in düzeltmesi E'yi İKİYE bölmeli, D'yi değil.** Bugün iki farklı
eksen var ve ikisi karışmış:

1. **Varlık ekseni** ("`public`te taksonomiye girmeyen bir nesne var") — Kaynak D
   (`catalog-snapshot.ts:587-599`) + `lintUnexpectedRelationKinds`
   (`catalog-lint.ts:1117-1128`): satır başına KOŞULSUZ bulgu, grantee sorusu YOK.
2. **Hibe ekseni** ("modellenen bir nesnede beklenmeyen grantee var") — Kaynak C
   (`readTableGrants`, `:560-574`) ve Kaynak E'nin bugünkü hâli
   (`lintUnexpectedFunctionExecuteGrantees`, `:1144-1156`, `hasPublicExecute` FİLTRESİ).

S-15'in istediği şey (`prosecdef=true` olan her fonksiyon → koşulsuz bulgu) **hibe
eksenine değil, varlık eksenine** aittir. Yani doğru şekil D ile E'yi tek okuyucuda
birleştirmek değil (`pg_class` ile `pg_proc` farklı sebeplerle değişir: relkind
etiketleri vs. fonksiyon güvenlik nitelikleri, remediation metinleri de farklı —
birleştirmek CLAUDE.md §3'ün "farklı sebeplerle değişecek ikiyi birleştirme" kuralını
ihlal eder ve katalog türü üzerinde bir discriminated union'ı zorunlu kılar), şu:

- **Okuyucu TEK kalsın:** `readFunctionPrivileges` `pg_proc`'un tek sahibi olarak kalır;
  satır şeması `isSecurityDefiner` (`p.prosecdef`) + `executeGrantees`
  (`aclexplode(p.proacl)`) ile GENİŞLETİLİR. "Ne var" sorusu burada, "beklenmiyor mu"
  sorusu lint'te kalır (K-E5 korunur).
- **Kural İKİ olsun, iki AYRI kodla:** mevcut `UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE`
  (hibe ekseni, `PUBLIC` filtresi) + yeni bir koşulsuz kod (örn.
  `UNEXPECTED_SECURITY_DEFINER_FUNCTION`), D'nin taksonomi-bağımsız desenini birebir
  tekrarlayarak. İki kod olması zorunlu: biri ileride allowlist ile gevşetilebilir
  (meşru bir `SECURITY DEFINER` yardımcı), diğeri gevşetilMEMELİ — tek kod altında
  bu ikisi birlikte susturulur.
- **Ortaklaştırılacak şey kural değil, DESEN:** "satır başına koşulsuz bulgu, mesaj
  remediation'ı adlandırır" biçimi en fazla küçük bir yardımcıyı hak eder; bugünkü
  `.map(...)` zaten o kadar kısa ki yardımcı erken soyutlama olur (KISS).

**Buna bağlı yapısal pürüz (yeni bulgu olarak aşağıda, low):** her iki yeni kural
bulgunun öznesini `LintFinding.tableName`e yazıyor — alan adı bir VIEW/fonksiyon adını
taşıdığında artık yalan söylüyor. S-15 üçüncü bir nesne türünü (fonksiyon güvenlik
niteliği) aynı alana ekleyecekse doğru hamle alanı o düzenlemede `objectName`e
(veya `{ kind, name }`) çevirmek — sonradan yapılırsa daha çok çağrı noktası dokunulur.

## YENİ BULGULAR (yalnızca kapanış kontrolünden)

| ID        | SEV | Dosya:satır                                                   | Açıklama                                                                                                                                                                                                                                                                                              | Sorumlu ajan |
| --------- | --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **SD-10** | low | `packages/db/src/catalog-lint.ts:212-215` (çağrılar `:1120`, `:1149`) | `LintFinding.tableName` JSDoc'u "tablo bazlı olmayan kurallarda YOKTUR" diyor; FIX 2'nin iki yeni kuralı bu alana VIEW adı (`:1120`) ve FONKSİYON adı (`:1149`) yazıyor. Alan adı + JSDoc, taşınan veriyi yanlış tanımlıyor — SD-5r'nin beyan/gerçeklik sınıfının aynısı, aynı dosyada. Davranış hatası YOK (tip `string`). | db           |

**Borç satırı metni (`docs` kopyalayabilir):**
`low · packages/db/src/catalog-lint.ts:212-215 · LintFinding.tableName bir VIEW/fonksiyon adını taşıyor; alan adı ve JSDoc bunu yansıtmıyor (objectName'e çevrilmeli) · db · vade: S-15 düzeltmesiyle AYNI düzenlemede, en geç v0.0.16`

## DOĞRULANAMADI

- **Test koşumu.** `Bash`'im yok; `pnpm test` / `test:isolation` / `lint` / `typecheck` /
  `build` ÇALIŞTIRILMADI. Raporladığım kapanışlar **kod okuma + elle izleme** ile
  doğrulandı; yeşil/kırmızı iddiası Orkestratörün bağımsız taban ölçümüne dayanır
  (test 1301/128, isolation 73/9, lint 21/21, typecheck 21/21, build 13/13).
  Çalıştırma gerekiyorsa havale: **Orkestratör**.
- **Canlı katalog davranışı** (S-15'in `prosecdef` iddiasının Postgres'te doğrulanması)
  benim kapsamımda değil ve DB erişimim yok — havale: **db** (`security` S-15).
