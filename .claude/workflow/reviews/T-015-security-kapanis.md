# T-015 — security · KAPANIŞ KONTROLÜ

- Tarih: 2026-11-05
- Sürüm: ROADMAP v0.0.14.1
- Kapsam: **DAR** (S-15 kapanışı + FIX 3 regresyon yüzeyi). Yeni tarama YAPILMADI.

```
## AJAN: security · KAPANIŞ KONTROLÜ · KAPSAM: DAR · SONUÇ: KAPANDI
Dal: main        (`git branch --show-current` → main)
```

---

## 1. S-15 KAPANDI MI → **EVET**

Kendi probum: `/private/tmp/.../scratchpad/s15-probe.mjs` (scratchpad, üretim dosyası
DEĞİL). `DATABASE_MIGRATION_URL` (`arkesoft_migrator`), her mutasyon
`$transaction` + sentinel `ROLLBACK` içinde, `DROP FUNCTION` YOK.
`readCatalogSnapshot`/`lintCatalog` `packages/db/dist`'ten (build 13/13 sonrası,
`isSecurityDefiner`/`functionExecuteGrantees` dist'te DOĞRULANDI).

### POZİTİF — S-15'in BİREBİR iki satırı

```sql
CREATE FUNCTION public.__sec_closing_sd() RETURNS text LANGUAGE sql SECURITY DEFINER
  AS $$ SELECT password FROM public.account LIMIT 1 $$;
REVOKE EXECUTE ON FUNCTION public.__sec_closing_sd() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.__sec_closing_sd() TO arkesoft_app;
```

Ham ölçüm:

| Alan                                       | Ölçülen                                                              |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `has_function_privilege('public', …)`      | `false`  ← PUBLIC'ten REVOKE edilmiş                                 |
| `has_function_privilege('arkesoft_app',…)` | `true`   ← app GRANT'li (kaçış yolu GERÇEKTEN açık)                  |
| `has_function_privilege('arkesoft_auth',…)`| `false`                                                              |
| `proacl`                                   | `{arkesoft_migrator=X/arkesoft_migrator,arkesoft_app=X/arkesoft_migrator}` |
| snapshot satırı                            | `{hasPublicExecute: false, isSecurityDefiner: true}`                 |
| `UNEXPECTED_SECURITY_DEFINER_FUNCTION`     | **tam 1 bulgu** (`tableName: "__sec_closing_sd"`)                    |
| `UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE`    | **0** (hibe ekseni kapalı — doğru)                                   |
| `totalFindings`                            | **1** · diğer kurallardan gürültü: **0**                             |

Tur 3'te bu senaryo `findingsForProbe: []` veriyordu. **Aynı mutasyon artık
yakalanıyor.** S-15 kapandı.

### NEGATİF KONTROL — `prosecdef = false`, AYNI iki satır

```sql
CREATE FUNCTION public.__sec_closing_si() RETURNS text LANGUAGE sql AS $$ SELECT 'x'::text $$;
REVOKE EXECUTE … FROM PUBLIC;  GRANT EXECUTE … TO arkesoft_app;
```

snapshot: `{hasPublicExecute: false, isSecurityDefiner: false}` →
`UNEXPECTED_SECURITY_DEFINER_FUNCTION`: **0** ·
`UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE`: **0** · `totalFindings`: **0**.
**Yeni kural `prosecdef=false` için DÜŞMÜYOR** — yanlış pozitif yok.
(Not: hibe ekseni de doğru şekilde susuyor — PUBLIC gerçekten REVOKE edilmiş.)

### AYIRT EDİLEBİLİRLİK — üç kombinasyonu KENDİM ölçtüm

| Durum                                      | Beklenen            | Ölçülen                                       |
| ------------------------------------------ | ------------------- | --------------------------------------------- |
| `prosecdef=true` + PUBLIC hibesi YOK       | yalnızca YENİ kod   | ✔ `SD`=1, `EXEC_PRIV`=0 (prob 1)              |
| `prosecdef=false` + PUBLIC hibesi VAR      | yalnızca ESKİ kod   | ✔ `SD`=0, `EXEC_PRIV`=1 (prob 3)              |
| `prosecdef=true` + PUBLIC hibesi VAR       | İKİSİ BİRDEN        | ✔ `SD`=1, `EXEC_PRIV`=1 (prob 4, `proacl` `=X/` korunmuş) |
| `prosecdef=false` + PUBLIC hibesi YOK      | HİÇBİRİ             | ✔ ikisi de 0 (prob 2 — negatif kontrol)       |

Dördüncü satır benim eklediğim ek kontroldür (handoff tablosunda yoktu) ve
"kural çifti sessiz kalabiliyor mu" sorusunu kapatır: evet, doğru durumda
ikisi de sessiz.

---

## 2. FIX 3 YENİ BİR DELİK AÇTI MI → **HAYIR** (dört soru, hepsi ölçüldü)

### (a) `proacl` asimetrisi ateşlenme kararına giriyor mu?

**Girmiyor — ölçüldü.** `lintUnexpectedSecurityDefinerFunctions`
(`packages/db/src/catalog-lint.ts:1223-1247`) `.filter((p) => p.isSecurityDefiner)`
ile ateşlenir; `functionExecuteGrantees` yalnızca `granteeList` dizesini kurar.
Ampirik kanıt: prob 2'de `arkesoft_app`'e EXECUTE hibesi VAR (grantee satırları
üretildi) ama `prosecdef=false` olduğu için bulgu **0**. Grantee verisi kararı
etkilemiyor.

`proacl` asimetrisi `db`'nin ölçtüğü gibi doğrulandı: **`relacl` ile AYNI**,
`attacl`'in tersi — bir `GRANT`/`REVOKE` ACL'i materyalize ettiği an sahip rol
(`arkesoft_migrator`) açık `grantee` satırına dönüşüyor
(`{arkesoft_migrator=X/arkesoft_migrator,…}`).

**AMA teşhisi yanıltıyor** — bu benim yeni ölçümüm, aşağıda `S-17 [low]`:
1. **PUBLIC `-` olarak basılıyor.** Prob 4: `proacl` `{=X/arkesoft_migrator,…}`
   → `grantee::regrole::text` = `"-"`. Mesaj bunu "Şu anki **adlandırılmış**
   EXECUTE hibeleri: `"-"` (EXECUTE), …" diye listeliyor. `-` adlandırılmış bir
   rol DEĞİL, PUBLIC'in kendisi — mesajı okuyan operatör en kritik bilgiyi
   (fonksiyonu HERKES yürütebiliyor) bir tireden çıkarmak zorunda.
2. **Sahip rol gürültü.** `arkesoft_migrator` her materyalize ACL'de listede
   çıkıyor; "kime verilmiş" sorusunun yanıtı değil.
3. Bunların hiçbiri **yanlış negatif** üretmiyor: hibe ekseni `grantee`
   listesini HİÇ okumuyor, `has_function_privilege('public', …)` kullanıyor ve
   `proacl IS NULL` (varsayılan PUBLIC) durumunu da doğru yakalıyor — prob 3'te
   doğrulandı.

### (b) `functionExecuteGrantees` ölü veri alanı mı (S-4 sınıfı)?

**Değil — tüketiliyor, ölçüldü.** Mesaj içeriği hibelerle BİRLİKTE değişti:
prob 1 → `"arkesoft_migrator" (EXECUTE), "arkesoft_app" (EXECUTE)`;
prob 4 → `"-", "arkesoft_migrator", "arkesoft_auth"`. `isGrantable` alanı da
şemada var ve bu kuralda okunmuyor — ama o alan Kaynak B/C'de (`lintColumnGrantGrantees`,
`lintTableGrantGrantees:1125`) ateşlenme kararına GİRİYOR, yani S-4 sınıfı
"hiç tüketilmeyen alan" değil. Kaynak E'nin `isGrantable`'ı bugün hiçbir kuralda
okunmuyor; bunu **yeni bulgu olarak yazmıyorum** çünkü `WITH GRANT OPTION`'lı
bir EXECUTE hibesi `isSecurityDefiner` kuralını zaten KOŞULSUZ tetikler
(`prosecdef=false` + grant option için kaçış senaryosu kurulamıyor: o fonksiyon
sahip yetkisiyle çalışmaz) — somut saldırı senaryosu ölçemedim, teorik risk için
bulgu açmıyorum.

### (c) Koşulsuz kural `authRole` kapısının DIŞINDA — yanlış pozitif kaynağı mı?

**Bugün değil, ölçüldü.** Dondurulmuş `catalog-lint-live.isolation.test.ts`'in
çağrı deseniyle birebir aynı çağrıyı (`authRole` GEÇİRİLMEDEN) canlı veritabanında
koşturdum:

```
pgProcPublicCount: 0 · functionExecuteGranteesCount: 0 · unexpectedRelationsCount: 0
tablesCount: 10 · rolesCount: 2
findingsWithoutAuthRole: []
```

`public`'te 0 fonksiyon → yeni kural **hiç** ateşlenmiyor. `lintCatalog`'un
`authRole` kapısı dışındaki üç çağrısı (`lintUnexpectedRelationKinds`,
`lintUnexpectedFunctionExecuteGrantees`, `lintUnexpectedSecurityDefinerFunctions`,
`catalog-lint.ts:1295-1304`) dondurulmuş çağrı noktası için boş dönüyor.
Yapısal değil **empirik** bir olgu ve kodda böyle belgelenmiş
(`catalog-lint.ts:1184`, `1211`) — meşru bir `SECURITY DEFINER` fonksiyon
eklendiği gün o dosyanın "sağlıklı durum" testi kırmızıya döner; bu kurulan
tripwire'ın TASARIM GEREĞİ davranışıdır, gevşetme değil allowlist gerektirir.

### (d) İki kural kodu ileride AYRI susturulabilir mi?

**Evet — hem yapısal hem çalışma zamanı kanıtı var.** İki ayrı saf fonksiyon,
iki ayrı `filter` yüklemi (`isSecurityDefiner` vs `hasPublicExecute`), iki ayrı
`findings.push` (`catalog-lint.ts:1299` ve `:1304`), `TENANT_ISOLATION_RULES`'ta
iki ayrı kod. Çalışma zamanı ayrışması prob 1 (yalnızca yeni) ve prob 3
(yalnızca eski) ile ölçüldü. Birinin `filter`'ına eklenecek bir allowlist
diğerinin yüklemine dokunmaz.

---

## 3. YANLIŞ POZİTİF KONTROLÜ

- Sağlıklı taban, `authRole`'suz: `lintCatalog` → **`[]`** (prob 0).
- ROLLBACK'ler sonrası taban TEKRAR ölçüldü: `lintCatalog` → **`[]`** (prob 6).
- Saf fixture süiti bağımsız koşturuldu:
  `pnpm exec vitest run src/__tests__/catalog-lint.test.ts` → **67/67 geçti**.

---

## YENİ BULGULAR

| ID       | SEV     | Dosya:satır                                                   | Açıklama                                                                                                                                                                                                                                                                                                                                                                      | Sorumlu ajan |
| -------- | ------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **S-17** | **low** | `packages/db/src/catalog-lint.ts:1230-1233` (+`:1244`)        | `UNEXPECTED_SECURITY_DEFINER_FUNCTION`'ın teşhis mesajındaki "adlandırılmış EXECUTE hibeleri" listesi ÜÇ şekilde yanıltıcı (hepsi ÖLÇÜLDÜ, ateşlenme kararını ETKİLEMEZ): (1) PUBLIC `"-"` (tire) olarak basılıyor ve "adlandırılmış" diye etiketleniyor (prob 4); (2) tablo/fonksiyon SAHİBİ `arkesoft_migrator` her materyalize ACL'de gürültü olarak listeleniyor (prob 1/4/5); (3) `functionName` İMZA taşımadığı için aşırı yüklenmiş (overload) fonksiyonlarda hibe listesi KARIŞIYOR — prob 5'te `()` imzasına verilen `arkesoft_app` ile `(int)` imzasına verilen `arkesoft_auth` hibeleri AYNI mesajda çıktı. Saldırı senaryosu: bir operatör bu mesajı okuyup "hibe `arkesoft_auth`'a verilmiş, app erişemiyor" sonucuna varabilir; gerçekte app erişiyor → yanlış teşhis, triyajda kaybedilmiş zaman. Veri sızıntısı veya kaçırılmış bulgu YOK (ateşlenme satır bazlıdır: prob 5'te 2 pg_proc satırından yalnızca SD olan 1'i bulgu üretti). | db           |

**Önerilen düzeltme (S-17, v0.0.15 vadeli):** okuyucuda
`grant_info.grantee = 0` satırını `'PUBLIC'` olarak etiketle (ya da ayrı bir
boolean alan taşı), sahip rolü (`p.proowner`) grantee listesinden teşhis amaçlı
çıkar, ve `functionName` yerine `p.oid::regprocedure::text` (imzalı ad) taşı.
Üçü de tek okuyucuda (`readFunctionPrivileges`,
`packages/db/src/catalog-snapshot.ts:675-704`) ve tek mesaj kurucusunda toplanıyor.

⚠ **Bu bulgu `low`** → `AGENT_BASELINE.md` §4'e göre PASS, düzeltme turu
AÇMAZ, ROADMAP teknik borç tablosuna gider. **Task ESCALATED olmaz.**
`medium` veya üstü yeni bulgu **YOK**.

---

## KALINTI YOK KANITI

Tüm mutasyonlarım `$transaction` + sentinel `ROLLBACK` içindeydi; `DROP
FUNCTION`/`DROP TABLE`/`DROP ROLE` KULLANILMADI. Problar bittikten sonra
bağımsız ölçüm:

```
public'te fonksiyon (pg_proc)                : 0
public'te view/matview/foreign (relkind v,m,f): 0
arkesoft* rol sayısı (pg_roles)              : 4
lintCatalog(canlı taban)                     : []
```

Orkestratörün FIX 3 sonrası tabanıyla (4 rol · 0 fonksiyon · 0 view/matview/foreign)
BİREBİR aynı. Kalıntı yok.

`pnpm db:rollback-roles` (kademe 3) ÇALIŞTIRILMADI. `prisma migrate reset`/
`db push --force-reset` ÇALIŞTIRILMADI, onay jetonu sentezlenmedi.
`.env` dosyasına YAZILMADI (yalnızca `set -a; . .env` ile okundu).
Redis'e dokunulmadı. Üretim dosyası DEĞİŞTİRİLMEDİ (`git status` diff'i
turun başındakiyle aynı).

---

## DOĞRULANAMADI

1. **`pnpm audit`** bu turda ÇALIŞTIRILMADI — gerekçe: FIX 3 hiçbir bağımlılık
   eklemedi/değiştirmedi (`git diff -- "**/package.json" pnpm-workspace.yaml
   pnpm-lock.yaml` → yalnızca İKİ `scripts` satırı, `dependencies`/
   `devDependencies` DEĞİŞMEMİŞ, lockfile DOKUNULMAMIŞ). Mevcut `multer`
   geçişli `high` borçtaki kayda atıftır, çift sayılmadı.
2. **`pnpm test:isolation`'ın 74/9'u** bu turda yeniden koşturulmadı —
   `DATABASE_AUTH_URL` kullanıcının `.env`'inde YOK ve o dosyaya yazmak yasak.
   Orkestratörün `--force` ölçümü (api 18/4 + db 56/5) taban olarak alındı;
   kendi kanıtımı ondan BAĞIMSIZ, doğrudan `DATABASE_MIGRATION_URL` üzerinden
   ürettim.
3. **Kaynak E'nin `isGrantable` alanının hiçbir kuralda okunmaması**: yapısal
   olarak doğru (ölçüldü), ama somut bir kaçış senaryosu KURAMADIM —
   `WITH GRANT OPTION`'lı bir EXECUTE hibesi `SECURITY DEFINER` fonksiyonda
   zaten koşulsuz yakalanıyor, `SECURITY INVOKER`'da ise çağıranın kendi
   yetkisi geçerli. Teorik risk için bulgu AÇMADIM.
