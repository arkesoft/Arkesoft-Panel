# T-018 — `security` gate, tur 1

- **Tarih:** 2026-11-11
- **Sürüm:** ROADMAP v0.0.21 (sürüm kayıt modeli)
- **Kapsam:** 28 değişen/yeni dosya (`packages/db`, `packages/theme-sdk`, `packages/versioning`, `.changeset`, `.github`, `pnpm-lock.yaml`, `docs/adr/0020`)

```
GATE: security
SONUÇ: PASS
BULGULAR:
  - [SEV: medium] packages/db/src/tenancy.ts:113-115 (+ packages/db/sql/bootstrap-roles.sql:167-177) — `arkesoft_app` çalışma zamanı rolü, platformun kendi sürüm kayıt defterine (`platform_release`/`theme`/`theme_release`) tam DML yetkisi kazandı. CANLI ÖLÇÜLDÜ (`SET LOCAL ROLE arkesoft_app`, `is_superuser=off`, tümü ROLLBACK): `INSERT INTO platform_release ('99.0.0','stable')` → OK · `UPDATE theme_release SET status='published', published_at=now()` → UPDATE 1 · `UPDATE theme SET status='deprecated'` → UPDATE 1 · `DELETE FROM platform_release` → DELETE 1. Karşılaştırma emsali aynı oturumda: `INSERT INTO _prisma_migrations` → SQLSTATE 42501 (daraltma deseni çalışıyor). SÖMÜRÜ YOLU BUGÜN ARANDI VE BULUNAMADI (bu yüzden `high` DEĞİL): `AppPrismaDatabase = Pick<PrismaDatabase,'tenant'|'user'|'tenantMembership'>` (client.ts:214) ve `TenantTransactionClient = Pick<TransactionClient,'tenantMembership'|'job'|'auditLog'|'tenantInvitation'>` (client.ts:266-269) — beş yeni delege HİÇBİRİNDE YOK; `apps/api/src/**` ham istemci yüzeyini eslint `no-restricted-imports` ile ithal EDEMEZ; üretim kodunda `$queryRawUnsafe`/`$executeRawUnsafe` SIFIR. KOŞULLU SENARYO (v0.16.0 ilk yazıcı/okuyucu geldiği an gerçekleşir): kiracıya dönük herhangi bir prosedürdeki bir hata Prisma istemcisine ulaşırsa (a) `channel='stable'` sahte bir `platform_release` satırı TÜM kiracıları N-2 penceresinin dışına atar ve `MANDATORY_UPGRADE_GRACE_DAYS` zorunlu yükseltme baskısı üretir (çapraz kiracı etki yarıçapı), (b) `theme_release` `draft`→`published` çevrilerek ADR-0002 Karar 8'in bağlayıcı yayın kapısı (görsel regresyon + Lighthouse) ATLATILIR, (c) kayıt defteri SİLİNEBİLİR (denetim izi kaybı) — DÜZELTME ÜÇ PARÇADIR, tek satırlık `REVOKE` DEĞİL: (1) `bootstrap-roles.sql`'e tablo bazlı `REVOKE INSERT, UPDATE, DELETE ... FROM arkesoft_app`, (2) `catalog-lint.ts:619-630`'un `APP_ROLE_MISSING_DML_PRIVILEGE` kuralı BUGÜN her sınıflandırılmış tabloda TAM DML TALEP EDİYOR → "platform kayıt defteri, salt okunur" listesi eklenmeli, (3) `seed.ts:109-181` üç platform upsert'ini BİLEREK `arkesoft_app` bağlantısında yapıyor (K-E2.2) → daraltma `pnpm db:seed`'i KIRAR, upsert'ler migrator/ayrı role taşınmalı. ⚠ (3) ADR-0020'nin "daraltma yolu belli" cümlesinde YOK. Vade: v0.16.0'ın ilk yazıcısından ÖNCE; o ana kadar kapatılmazsa önem `high`'a yükselir. ADR-0020 gözden geçirme koşulu 6 TETİKLENDİ — architect (karar), db (uygulama), devops (bootstrap-roles)
  - [SEV: low] packages/db/prisma/migrations/20261111090000_version_registry/migration.sql:226-227 — CHECK #1 `(status='draft') = (published_at IS NULL)` `deprecated` + `published_at IS NULL` kombinasyonunu REDDEDİYOR (canlı ölçüldü: `INSERT ... 'deprecated', NULL` → check constraint ihlali). Sonuç: hiç yayınlanmamış bir `draft` tema sürümü geri çekilmek istendiğinde uydurma bir `published_at` yazmak ZORUNLU olur — tam olarak ADR-0002 Karar 8 / V5 disiplininin yasakladığı "kaydı yalanla başlatma". Bugün yazıcı YOK → etki sıfır. Düzeltme: `CHECK (status <> 'published' OR published_at IS NOT NULL)` + `CHECK (status <> 'draft' OR published_at IS NULL)` ikilisi, ya da ilk yazıcıyla birlikte ele alma. Vade: v0.16.0 — db/architect
  - [SEV: low] packages/db/prisma/schema.prisma (TenantUpdateHistory.toState `Json` NOT NULL) — `NOT NULL` ANLAMLI bir anlık görüntü GARANTİ ETMİYOR: canlı ölçüldü, `'null'::jsonb` INSERT KABUL edildi (`to_state IS NULL` → `f`, değer JSON null). Savunma VAR ama MEKANİK DEĞİL: `TENANT_VERSION_SNAPSHOT_SCHEMA` JSON null'ı REDDEDİYOR (ölçüldü) ancak `fromState`/`toState`/`previousState` hiçbir yerde o şemaya BAĞLANMIYOR; bir gelecekteki okuyucu `row.toState.platformVersion` yazarsa SEC-2 sınıfı yakalanmamış `TypeError` doğar. Bugün okuyucu YOK → etki sıfır; bugün mekanik kapı İCAT EDİLMEMELİ. Düzeltme: v0.16.0'ın okuyucusu `TENANT_VERSION_SNAPSHOT_SCHEMA.parse()`'tan geçsin ve kapı o sürümde yazılsın. Vade: v0.16.0 — backend
  - [SEV: low] packages/versioning/src/snapshot.ts:40 — `themeId` biçim doğrulaması YOK (bilinçli, dosya başı gerekçeli). ÖLÇÜLDÜ: `'../../etc/passwd'` ve `"modern'; DROP TABLE theme;--"` şemadan GEÇİYOR. SÖMÜRÜ YOLU ARANDI VE BULUNAMADI: tek tüketici `apps/storefront/src/themes/registry.ts` kapalı bir `Object.hasOwn(THEME_REGISTRY, key)` haritası + fail-closed `ThemeResolutionError` (503) → dosya yolu/dinamik import YOK; SQL enjeksiyon yüzeyi YOK (Prisma parametreli, sıfır `*Unsafe`). v0.2.0'da geri alma `previousState.themeId`'yi yazarsa en kötü sonuç 503 (erişilebilirlik), veri sızıntısı DEĞİL. Düzeltme: ADR-0020'nin zaten vadelendirdiği v0.2.0 provisioning doğrulaması (`ThemeRelease`'e karşı) — backend
  - [SEV: low] packages/db/package.json:46 — `@arkesoft/themes-modern` ÜRETİM bağımlılığı (S5'in gerekçeli sapması; S5 kendisi gözden geçirme istedi). Tedarik zinciri ölçümü: (a) `pnpm-lock.yaml` diff'inde SIFIR yeni dış paket (yalnızca `link:` girdileri + katalogda ZATEN var olan sürümler: zod 4.6.7, eslint 10.13.0, typescript 6.0.3, vitest 5.0.5, @types/node 24.19.2); (b) `themes-modern` `private: true`, `exports["."]` HAM `./src/theme.config.ts`; (c) `node dist/version-registry-seed.js` ÇALIŞTI (ölçüldü, çıktı: `{"platformVersion":"0.7.0","apiVersion":"0.6.0","themeId":"modern",...}`) — `engines.node >= 24.0.0` + `.nvmrc 24` tip-sıyırmayı GARANTİ ediyor, S5'in `dependencies` gerekçesi AYAKTA. KALAN YÜZEY: `pnpm db:seed` artık tema yazarının modül-seviyesi kodunu (`defineTheme()` çağrısı) VERİTABANI BAĞLANTISI AÇIK bir süreçte yürütüyor. Bugün temalar birinci taraf/repo içi → risk yok. ADR-0002'nin "kaynak-dağıtımlı tema paketi" yönü üçüncü taraf temaya açılırsa bu kenar gerçek bir tedarik zinciri yüzeyi olur. Düzeltme önerisi: o kararın alındığı sürümde seed tema değerini manifest İTHALİ yerine derleme-zamanı üretilmiş bir JSON'dan okusun — architect
ÖLÇÜMLER:
  pnpm audit → 2 advisory: 1 high (multer, apps/api>@nestjs/platform-express transitif), 1 moderate (minimatch, eslint devDep transitif). İKİSİ DE PRE-EXISTING (T-017 ile birebir aynı). YENİ advisory: 0. Kritik: 0.
  İncelenen dosya: 28 değişen/yeni (+ 11 bağlam dosyası: catalog-lint.ts, error-body.ts, client.ts, prisma.service.ts, registry.ts, theme.config.ts, bootstrap-roles.sql, job-runner.ts, tenant-isolation-suite.ts, apps/api eslint.config.mjs, rbac migration)
  Tenant izolasyon listesi (CLAUDE.md §7) — iki kiracı tablosu için KARŞILANMAYAN madde: YOK (14/14). Üç platform tablosu için UYGULANAMAZ: md 1, 2, 3, 5, 6, 7, 11 (gerekçe aşağıda).
  CANLI RLS ÖLÇÜMÜ (arkesoft_app rolüyle, tek transaction, ROLLBACK): S1 çapraz okuma → 0/0 satır · S2 çapraz INSERT → "new row violates row-level security policy" (42501), İKİ tabloda da · S3 çapraz UPDATE → UPDATE 0, çapraz DELETE → DELETE 0 (varlık oracle'ı KAPALI) · S6 boş GUC → 0 satır, S6b NULL GUC → 0 satır (hata DEĞİL, fail-closed)
  Katalog: 5 tablo `relkind='r'`, owner `arkesoft_migrator`; `tenant_version_state`/`tenant_update_history` → `relrowsecurity=t`, `relforcerowsecurity=t`, politika `{public}` `ALL`, `qual` = `with_check` = `(tenant_id = current_setting('app.' || 'tenant_id'::text, true))`; üç platform tablosu → `rls=f` (kiracı kolonu yok)
  Kanonik politika BAYT-BİREBİR: `rbac_audit_log_and_invitation/migration.sql` + yeni migration → 4 politika gövdesi, UNIQUE BODY COUNT = 1
  CHECK kısıtları: `pg_constraint`'te İKİSİ DE VAR ve CANLI ZORLUYOR (3 red + 2 kabul ölçüldü) — metin pini `migration-sql.test.ts`'te, canlı teyit burada
  Zod/SEC-9: `TENANT_VERSION_SNAPSHOT_SCHEMA` (zod 4.6.7, `z.strictObject`) → `__proto__`/`constructor`/`prototype`/fazla anahtar/JSON null/dizi/dize/sayı HEPSİ REDDEDİLDİ; `Object.prototype.polluted === undefined`. SEC-9 sınıfı YENİDEN AÇILMAMIŞ.
  SEC-2/ReDoS: `parseSemver`/`parseRange` 13 patolojik girdide LİNEER (en kötü 50.000 jetonlu aralık → 18.44 ms; 50.000 tanımlayıcılı ön-sürüm → 1.02 ms; yakın-eşleşme geri izleme tuzakları → ≤0.44 ms). Katastrofik geri izleme YOK.
  Sır taraması: `git diff HEAD | grep -niE "(password|secret|api[_-]?key|token|BEGIN .*PRIVATE KEY|bearer|credential)"` → 0 eşleşme; 15 yeni dosyada ayrı tarama (+tckn/iban/cvv/card) → 0 eşleşme
  Enjeksiyon/dış yüzey: üretim kodunda `$queryRawUnsafe`/`$executeRawUnsafe` → 0; değişen dosyalarda redis/bullmq/queue/meilisearch/s3/minio/cacheKey/publicProcedure/@Controller/fetch( → 0 gerçek eşleşme (yalnızca "S3" alt görev etiketi yanlış pozitifleri)
  Log: diff'te eklenen tek çıktı satırı `process.stdout.write` (seed) — içeriği `platform=0.7.0, api=0.6.0, tema=modern@0.1.0`; PII/sır/kiracı kimliği YOK
  git status --porcelain → 28 satır (beklenen 28); bu rapor dosyası hariç hiçbir dosya değiştirilmedi
  Playwright / dev sunucusu / `turbo run build` / `test:isolation` KOŞTURULMADI (gerekçeler aşağıda)
```

---

## 1. `architect`'in beş çağrı gerekçesi — tek tek ölçüm

### Gerekçe 1 — `TENANT_SCOPED_TABLES` 4 → 6, iki yeni kanonik politika

**TEMİZ.** Kanonik politika gövdesi `rbac_audit_log_and_invitation/migration.sql:122-135`'ten
**bayt-birebir**: dört politika gövdesi normalize edilip karşılaştırıldı → `UNIQUE BODY
COUNT = 1`. Üç kanonik karar da yerinde: `TO` yan tümcesi YOK (`pg_policies.roles =
{public}`), `current_setting` İKİ argümanlı (`missing_ok`), `::text` cast'i YOK, `WITH
CHECK` AÇIKÇA yazılı (`polwithcheck` NULL DEĞİL — katalogdan teyit edildi).
`POLICY_USING_NOT_CANONICAL`/`POLICY_WITH_CHECK_NOT_CANONICAL` tetiklenmez.

Yedi senaryonun kritik beşi **canlı olarak** ayrıca ölçüldü (yukarıdaki ÖLÇÜMLER bloğu).
Senaryo 2'nin vacuous olmama iddiası (S4'ün R-PO1 ölçümü) **bağımsız olarak teyit
edildi**: iki tabloda da red sebebi `new row violates row-level security policy` (42501),
`unique_violation` (23505) DEĞİL.

### Gerekçe 2 — ⚠ `PLATFORM_LEVEL_TABLES` 6 → 9, `arkesoft_app`'in blanket DML'i

**BULGU (medium, yukarıda).** Yetki GERÇEK ve ÖLÇÜLDÜ; sömürü yolu BUGÜN YOK.
Temize çıkarma değil, **borç kaydı + vade**. Üç katmanlı yapısal bariyer sayesinde
`high` değil:

| Katman | Kanıt |
| --- | --- |
| Tip (`.db`) | `AppPrismaDatabase = Pick<PrismaDatabase,'tenant'\|'user'\|'tenantMembership'>` — beş yeni delege YOK |
| Tip (`withTenant`) | `TenantTransactionClient = Pick<TransactionClient,'tenantMembership'\|'job'\|'auditLog'\|'tenantInvitation'>` — iki yeni kiracı delegesi YOK |
| Lint | `apps/api/src/**` (prisma/, auth/, __tests__/ hariç) ham istemci yüzeyini ithal edemez; `src/queue/jobs/**` ayrıca `withTenant`'ı ithal edemez |
| Enjeksiyon | üretim kodunda `*Unsafe` sıfır; `AppPrismaDatabase` `$queryRaw` TAŞIMIYOR |
| Kimlik bilgisi dağılımı | `apps/storefront` DB'ye bağlanmıyor (API üzerinden okuyor) — `DATABASE_URL` yalnızca `apps/api` + `packages/db` CLI'larında |

⚠ `TenantTransactionClient`'ın iki yeni delegeyi TAŞIMAMASI bugün bir **savunma**;
v0.16.0 onu genişletmek zorunda ve genişletmenin yanına Gerekçe 2'nin daraltması
girmeli.

### Gerekçe 3 — `TenantUpdateHistory.error Json?` sözleşmesi

**TEMİZ.** S2'nin iddiası doğrulandı: `packages/errors/src/error-body.ts:71-80`
`toErrorBody()` **dört alanı ELLE yazıyor** (`code`/`message`/`details`/`requestId`),
`error`'dan spread ETMİYOR ve `error.context`'i **hiç okumuyor** (A-V25; `httpHeaders` da
okunmuyor, PO riski 8). `details`'in tek kaynağı `error.publicDetails` ve o alan zaten
**tele yazılan** alandır — tanımı gereği sır taşımaz. Emsalin mekanik olarak yürürlükte
olduğu da teyit edildi: `job-runner.ts:196` `isAppError(e) ? toErrorBody(...) :
unknownErrorBody(...)`, `:330` `toJsonErrorBody(errorBody)`, `appErrorBodySchema` ile
doğrulanıyor. `TenantUpdateHistory.error`'ın bugün yazıcısı YOK → ihlal YOK; sözleşme
**belgesel**, mekanik kapı ilk yazıcıyla gelecek (F3 ile aynı vade).

### Gerekçe 4 — iki CHECK + beş ENUM `pg_constraint` ekseninde (katalog linter'ı GÖRMEZ)

**İddianın kendisi DOĞRU** (linter `pg_constraint`'i okumuyor) — bu yüzden **elle canlı
ölçüm yaptım**, metin pinine güvenmedim:

| Test | Sonuç |
| --- | --- |
| CHECK'ler `pg_constraint`'te | İKİSİ DE VAR, `pg_get_constraintdef` beklenen ifadeler |
| `draft` + `published_at` DOLU | **RED** ✓ |
| `published` + `published_at` NULL | **RED** ✓ |
| `deprecated` + `published_at` NULL | **RED** ⚠ → F2 (low) |
| `published` + `published_at` DOLU | KABUL ✓ |
| `finished_at < started_at` | **RED** ✓ |
| `finished_at = started_at` | KABUL ✓ (prob bu eşitliğe dayanıyor — teyit) |

`architect`'in çerçevesi — "CHECK erişim veremez ve RLS'i baypas edemez, yalnızca yazmayı
kısıtlar → doğası gereği fail-closed" — **DOĞRU**; her iki kısıt da yalnızca `ADD
CONSTRAINT ... CHECK`, hiçbir `GRANT`/`SECURITY DEFINER`/`ALTER ... OWNER` yok. Beş ENUM
yalnızca `CREATE TYPE ... AS ENUM` — yetki ekseni taşımıyor.

FK'lerin dahili RI trigger'ları çerçevesi de **DOĞRU**: üç FK `ON DELETE CASCADE ON
UPDATE CASCADE` ile `tgisinternal` trigger üretir, kullanıcı tanımlı değil, mekanizma
kurulu (`tenant_id` FK deseni `audit_log`/`tenant_invitation` ile birebir). `migration.sql`
içinde `CREATE TRIGGER`/`CREATE RULE`/`CREATE FUNCTION`/`SECURITY DEFINER`/`CREATE VIEW`/
`CREATE SCHEMA` → **sıfır** (grep ile tarandı); ADR-0020 Karar 4 tutuyor.

### Gerekçe 5 — üç JSONB kolonu, SEC-2 / SEC-9 sınıfları

**SEC-9 YAPISAL OLARAK KAPALI, ÖLÇÜLDÜ.** `z.strictObject` (zod 4.6.7) `__proto__`,
`constructor`, `prototype` ve her fazla anahtarı **REDDEDİYOR**; `JSON.parse` ile üretilmiş
gerçek bir `__proto__` taşıyıcısı da reddedildi ve `Object.prototype` kirlenmedi.
Varsayılmadı — doğrulandı.

**SEC-2 kısmen açık ama erişilemez** → F3 (low). `.map` üzerinde yakalanmamış `TypeError`
sınıfı için yeni kod yolu YOK (`packages/versioning`'de dış veri üzerinde `.map` sıfır;
`comparePrereleaseIdentifiers` `split` + sınırlı indeksleme kullanıyor, `noUncheckedIndexedAccess`
daraltmaları açık). Risk yalnızca gelecekteki bir okuyucunun şemayı ATLAMASI hâlinde doğar.

⚠ **Düzeltme (brief'in sayımı):** kolon sayısı **üç değil DÖRT** JSONB'dir —
`tenant_version_state.previous_state`, `tenant_update_history.from_state`, `.to_state`,
**`.error`**. Dördüncüsünün (`error`) şeması `packages/versioning`'de değil
`@arkesoft/errors`'un `appErrorBodySchema`'sındadır (Gerekçe 3). Dördü de bugün
okuyucusuzdur.

---

## 2. Ajanların işaretlediği beş kalem — açık karar

| # | Kalem | Karar | Ölçüm |
| --- | --- | --- | --- |
| 1 | `themes-modern` → `dependencies` | **GEREKÇE KABUL, kalan yüzey `low` (F5)** | Lockfile'a 0 yeni dış paket; `node dist/...` çalıştı; `engines.node>=24` tip-sıyırmayı garanti ediyor |
| 2 | `Prisma.DbNull` seçimi | **DOĞRU, TEYİT EDİLDİ** | Canlı: `previous_state IS NULL` → `t`. Ayrıca güvenlik açısından **anlamlı**: `'null'::jsonb` olsaydı Zod'dan geçmezdi (ölçüldü: JSON null REDDEDİLİYOR) ama `IS NULL` kontrolü yapan her okuyucuyu YANILTIRDI. SQL NULL daha güvenli seçim |
| 3 | `DEMO_SEED.tenant.theme*` kaldırıldı | **TEMİZ** | `rg "DEMO_SEED\.tenant\.theme"` → exit 1 (0 eşleşme, repo geneli). Vitrinin okuma zinciri `Tenant.themeId` kolonundan okuyor, fixture'tan DEĞİL; seed o kolonu AYNI tek kaynaktan yazmaya devam ediyor (canlı: `tenant.theme_id='modern'` = `tenant_version_state.theme_id`). Sızıntı/regresyon yüzeyi AÇILMADI |
| 4 | `purity.test.ts` pin daraltması | **TESTİ GEVŞETME DEĞİL — TEMİZ** | Negatif lookahead `(?!versioning['"])` YALNIZCA `@arkesoft/versioning` + kapatan tırnağı istisna ediyor: `@arkesoft/errors` → yakalanır; `@arkesoft/versioning/alt-yol` → yakalanır (lookahead `/` karakterinde düşer); `@arkesoft/versioningfoo` → yakalanır. İKİNCİ bağımsız pin (`toEqual({zod, @arkesoft/versioning})`) üçüncü bir paketi mekanik olarak reddediyor. Üretim ithalleri ölçüldü: `manifest.ts:54` → `SEMVER_CORE_PATTERN_SOURCE`, `chain.ts:58` → `extractMajor`. **Karşılaştırma fonksiyonu (`parseSemver`/`compareSemver`/`satisfies`) üretim kodunda SIFIR** (`parseRange` yalnızca bir TEST dosyasında) → kısıtın amacı korunuyor. `@arkesoft/versioning`'in kendi saflık pini daha katı: SIFIR `@arkesoft/*` + `Date.now(`/`new Date(` yasağı, `dependencies` TAM `{zod}` |
| 5 | `updatedAt` eklemesi | **DOĞRU EMSAL SEÇİLMİŞ — TEMİZ** | Ölçüm: `AuditLog` APPEND-ONLY ve `updatedAt` BİLEREK YOK; `Job` (running→completed yaşam döngüsü) `updatedAt` TAŞIYOR. `TenantUpdateHistory` `status running→completed/failed` + `finishedAt` geç yazımı taşıdığı için `Job` emsali DOĞRU, `AuditLog` değil. `ThemeRelease` `draft→published→deprecated` taşıyor, aynı mantık. Denetim izi açısından sorun YOK: bu tablo bir **durum makinesi geçmişi**, değiştirilemez bir denetim defteri değil — değiştirilemezliğin sahibi `AuditLog`'dur ve o tabloya DOKUNULMADI |

---

## 3. CLAUDE.md §7 — madde madde

### 3.1 İki kiracı tablosu (`tenant_version_state`, `tenant_update_history`) — 14/14

| # | Madde | Sonuç | Kanıt |
| --- | --- | --- | --- |
| 1 | `tenant_id` NOT NULL | ✅ | `migration.sql:161,177` `"tenant_id" TEXT NOT NULL` |
| 2 | RLS + `current_setting` politikası | ✅ | `relrowsecurity=t`, `relforcerowsecurity=t`, `qual`/`with_check` kanonik (canlı) |
| 3 | `(tenant_id, …)` bileşik indeks | ✅ | `tenant_version_state`: `UNIQUE(tenant_id)` + `UNIQUE(tenant_id,id)`; `tenant_update_history`: `UNIQUE(tenant_id,id)` + `INDEX(tenant_id, started_at DESC)` |
| 4 | `tenantProcedure` | ➖ UYGULANAMAZ | SIFIR tRPC prosedürü/REST ucu eklendi (ölçüldü) |
| 5 | `withTenant()` üzerinden sorgu | ✅ | `seed.ts:221-273` iki upsert `withTenant` bloğunun İÇİNDE; problar `tx` üzerinden; AC-11 testi okumayı da `withTenant` içinde yapıyor. Ham `prisma.*` çağrısı YOK |
| 6 | Girdideki `id`'ye güvenilmiyor | ✅ | Girdi kaynağı YOK; tek yazıcı seed, `tenant.id`'yi 1. adımın ÇIKTISINDAN alıyor, dışarıdan DEĞİL |
| 7 | Kuyruk işi payload'ında `tenantId` | ➖ UYGULANAMAZ | SIFIR kuyruk işi eklendi (ölçüldü) |
| 8 | Dış kaynak tenant kapsamlı | ➖ UYGULANAMAZ | SIFIR Meilisearch/S3/Redis yüzeyi (ölçüldü; ADR-0020 Sonuçlar da bunu beyan ediyor) |
| 9 | Önbellek anahtarı `tenant:{id}:…` | ➖ UYGULANAMAZ | SIFIR önbellek anahtarı |
| 10 | Dosya yolu tenant önekiyle | ➖ UYGULANAMAZ | SIFIR dosya yükleme/indirme |
| 11 | `createTenantIsolationSuite()` çapraz okuma **ve** yazma | ✅ | İki prob kaydedildi (`tenant-membership.isolation.test.ts:123-134`, prob sayısı 4→6); yedi senaryo × 2 tablo; prob tamlığı kapısı taksonomiden besleniyor. Ayrıca kritik beş senaryo **bağımsız olarak canlı ölçüldü** |
| 12 | Hata mesajı başka tenant'ın varlığını sızdırmıyor | ✅ | Canlı: çapraz `UPDATE` → `UPDATE 0`, çapraz `DELETE` → `DELETE 0` — var olan yabancı satır ile hiç var olmayan satır AYNI sonucu veriyor (Prisma P2025 sınıfı). Çapraz INSERT hata metni yalnızca TABLO adını taşıyor, yabancı `tenant_id`/satır id'si TAŞIMIYOR |
| 13 | Log kayıtlarında `tenantId` | ➖ UYGULANAMAZ | Diff'te SIFIR `logger.*` çağrısı; tek çıktı satırı seed'in `process.stdout.write`'ı (kiracı olayı değil) |
| 14 | Süper admin impersonation + denetim kaydı | ➖ UYGULANAMAZ | SIFIR süper admin erişimi/prosedürü eklendi |
| 15 | Bağımlı/türetilmiş DB nesnesi yok | ✅ | VIEW/MATVIEW/FOREIGN TABLE/TRIGGER/RULE/FUNCTION → sıfır (grep + katalog `relkind='r'`). `pg_proc.prosecdef`, `pg_trigger`, `pg_rewrite`, `rolconfig` eksenlerine DOKUNULMADI |
| 16 | `SECURITY DEFINER` yok | ✅ | `migration.sql` grep → sıfır |
| 17 | `public` dışına şema yok | ✅ | `CREATE SCHEMA` → sıfır; beş tablo `nspname='public'` |

**UYGULANAMAZ sayılan 7 madde (4,7,8,9,10,13,14) için gerekçe tek ve ölçülmüş:** bu
sürümde `apps/api`/`apps/admin`/`apps/storefront`/`packages/trpc`'ye **hiç
dokunulmamıştır** (`git status` ile kanıtlı) — prosedür, kuyruk işi, dış kaynak,
önbellek, dosya yolu, istek-içi log ve süper admin yüzeyi **hiç doğmamıştır**. Bu,
T-017'de `Session` için verilen "UYGULANAMAZ" kararıyla aynı disiplin, ama **farklı
temel**: orada madde kiracı-dışı bir OLGU olduğu için uygulanamazdı; burada **kiracıya
bağlı iki tablonun 1-3, 5, 6, 11, 12, 15-17 maddeleri TAM uygulanmıştır** ve hiçbiri
atlanmamıştır.

### 3.2 Üç platform tablosu (`platform_release`, `theme`, `theme_release`)

Taksonomi kararı (**olgu KİME aittir**) **DOĞRU** — `Session`/`TwoFactor` emsaliyle aynı
sınıf: bir platform sürümü, bir tema veya bir tema sürümü platformun kendisine aittir.
`platform_release`'e `tenant_id` eklemek "aynı platform sürümü kiracı başına ayrı
yayınlanmış" demek olurdu; `theme`/`theme_release` için aynısı "aynı tema kiracı başına
ayrı yazılmış" demek olurdu. **Kabul.**

Bu üç tablo için §7 md **1, 2, 3, 5, 6, 7, 11** UYGULANAMAZ (kiracı kolonu yok → RLS
politikası, bileşik indeks, `withTenant`, sahiplik doğrulaması, kuyruk payload'ı ve
izolasyon probu ifade EDİLEMEZ). md **12** da uygulanamaz (kiracıya ait olgu yok →
sızdırılacak kiracı varlığı yok). md **15, 16, 17** uygulanır ve **karşılanmıştır**
(yukarıdaki tablo).

⚠ Ama UYGULANAMAZLIK **yetki sorusunu kapatmaz** — bu üç tablonun GERÇEK güvenlik ekseni
§7 değil, **en az yetki** ilkesidir ve orası F1'dir.

---

## 4. Koşturulan komutlar

| Komut | Exit | Özet |
| --- | --- | --- |
| `git status --porcelain` · `git diff --stat HEAD` · `git ls-files --others` | 0 | 28 satır; `apps/*` ve `packages/trpc` DOKUNULMAMIŞ |
| `pnpm audit` (+ `--json`) | 1 | 1 high (multer) + 1 moderate (minimatch), ikisi de pre-existing; 0 yeni |
| `git diff pnpm-lock.yaml` | 0 | 0 yeni dış paket; yalnızca `link:` + mevcut katalog sürümleri |
| `docker exec arkesoft-postgres psql` × 5 (introspection + 3 probe betiği) | 0 | yetki/RLS/politika/CHECK ölçümleri; **tüm yazmalar `BEGIN … ROLLBACK` içinde**, son durum doğrulandı (`platform_release`=1, `theme`=active, `theme_release`=draft, `tenant_version_state`=1) |
| `node --input-type=module` × 3 (dist üzerinden) | 0 | ReDoS zamanlaması, `strictObject` savunması, `resolveVersionRegistrySeedValues()` |
| `python3` (politika gövdesi bayt karşılaştırması) | 0 | UNIQUE BODY COUNT = 1 |
| `rg`/`grep` taramaları (sır, enjeksiyon, dış kaynak, log, DEMO_SEED) | 0/1 | her biri AYRI komut olarak koşturuldu (`&&` zinciri YOK — `grep -c` sahte yeşili tuzağı) |

**KOŞTURULMAYANLAR ve gerekçeleri:**

- **Playwright / dev sunucusu / `turbo run build`** — brief tarafından yasaklandı; `qa`
  benden sonra. Portlar 3000/3100'e dokunulmadı.
- **`pnpm test:isolation`** — BİLEREK koşturulmadı. Gerekçe: `packages/db`'nin izolasyon
  süiti `rollback-auth-role.isolation.test.ts`'i içeriyor ve brief `db:rollback-roles`
  sınıfını yasaklıyor; ikinci bir koşum rol/veri mutasyonu riski taşır. Yerine **daha
  güçlü kanıt** üretildi: aynı yedi senaryonun kritik beşini `arkesoft_app` rolüyle
  **doğrudan canlı Postgres'te** ölçtüm (geri alınabilir transaction içinde). Orkestratör'ün
  bağımsız teyit ettiği `test:isolation 11/11` (db 71 · api 18) taban olarak kabul edildi.
- **`prisma migrate reset` / `db push` / `db:reset` / `db:rollback-roles`** — yasak,
  çağrılmadı. `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` **üretilmedi/export
  edilmedi**.
- **Redis `FLUSHALL`/`FLUSHDB`/`CONFIG SET`** — çağrılmadı; Redis'e hiç dokunulmadı.
- **Kullanıcının `.env`'i** — yazılmadı, okunmadı.
- Hiçbir `prettier --write` / `eslint --fix` / `prisma format` çalıştırılmadı.

---

## 5. Orkestratör çerçevelerine itirazlar

1. **"Üç JSONB kolonu"** → **DÖRT**'tür (`previous_state`, `from_state`, `to_state`,
   **`error`**). Dördüncüsünün şeması `@arkesoft/errors`'ta (`appErrorBodySchema`),
   `packages/versioning`'de değil.
2. **ADR-0020'nin "daraltma yolu belli: `bootstrap-roles.sql`'in tablo bazlı `REVOKE`
   deseni"** cümlesi **EKSİK**. Ölçüldü: daraltma tek başına (a) `APP_ROLE_MISSING_DML_PRIVILEGE`'i
   tetikler (`catalog-lint.ts:619-630` her sınıflandırılmış tabloda TAM DML TALEP EDİYOR;
   bugün `columnGrants` istisnası yalnızca sır-taşıyan tablolar için) ve (b) `pnpm db:seed`'i
   KIRAR (`seed.ts` üç platform upsert'ini BİLEREK `arkesoft_app` bağlantısında yapıyor).
   Daraltma **üç parçalı** bir değişikliktir.
3. **`architect`'in iki çerçevesi (dahili RI trigger'ları + CHECK'in fail-closed doğası)
   DENETLENDİ ve İKİSİ DE DOĞRU.** Ama CHECK'lerin "`pg_constraint` linter'ın görüş alanı
   dışında" olması gerçek bir kör noktadır ve bu yüzden **metin pinine güvenmedim** —
   canlı zorlamayı ayrıca ölçtüm; o ölçüm F2'yi (low) ortaya çıkardı; metin pini onu
   göremezdi.

---

## 6. FAIL kuralı uygulaması

1 × `medium` + 4 × `low` → **PASS** (AGENT_BASELINE §4: "1–2 `medium` → PASS, bulgular
teknik borca kaydedilir"). `critical`/`high` **YOK**. `low`'lar için düzeltme turu
**açılmaz** (§4, 2026-11-01 kuralı) — borç satırı metinleri yukarıda, `docs` kopyalayabilir.
`medium` (F1) de 1 adet olduğu için tur açmaz ama **vadesi bağlayıcıdır**: v0.16.0'ın ilk
`platform_release`/`theme_release` yazıcısı/okuyucusundan ÖNCE kapatılmazsa önem `high`'a
yükselir ve o sürümün gate'i FAIL verir.
