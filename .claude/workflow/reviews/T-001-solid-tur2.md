# T-001 · solid gate · Tur 2 (Düzeltme Turu 1 sonrası)

Tarih: 2026-10-26
Sürüm: v0.0.3 — Prisma kurulumu ve ilk modeller

> Bu dosyayı Orkestratör yazdı. `solid` gate ajanının yazma aracı yoktur (bilinçli kısıt:
> gate ajanları kod düzeltmez). İçerik ajanın döndürdüğü handoff paketidir. Ajan komut
> çalıştırmadı — salt okuma incelemesi; `63 test` / `exit 0` iddiaları `db`'nin raporu,
> ajan yalnızca dosya içeriğinden vaka sayısını saydı (guard-policy 52 ✓).

```
GATE: solid
SONUÇ: PASS
```

**PASS gerekçesi (AGENT_BASELINE §4):** 0 critical · 0 high · **0 medium** · 8 low →
yalnızca low ⇒ PASS, bulgular teknik borca kaydedilir. Tur 1'in üç `medium` bulgusunun
**üçü de kapandı**; yeni kod Tur 1'deki koddan ölçülebilir biçimde daha iyi (politika
saflaştırıldı, 52 saf birim testi, allowlist uydurulmadı).

---

## Tur 1 medium bulgularının durumu

### L1 — `DATABASE_URL` üç yerde Zod'suz · `zod` ölü bağımlılık → **KAPANDI**

- Tek nokta gerçekten tek: `src/env.ts:42-49` →
  `parseEnv(infraEnvSchema.pick({ DATABASE_URL: true, NODE_ENV: true }))`. `packages/db/src`
  genelinde `DATABASE_URL` okuyan başka satır yok (grep: yalnızca `env.ts:43,46` ve
  `run-guarded-prisma.ts:144`'teki çocuk-env sabitlemesi) — üç `requireDatabaseUrl()` kopyası
  fiilen silindi, **yeni tekrar doğmadı.**
- Dört çağrı yeri farklı başarısızlık modlarını koruyor: `run-guarded-prisma.ts:168-172`
  (stderr + exit 1) · `seed.ts:41-47` (stderr + exit 1, derinlik savunması) ·
  `__tests__/helpers/test-client.ts:21` (çıplak `throw`, bilinçli try/catch'siz, gerekçesi
  `:13-14`).
- `EnvValidationError` kimliğine/`issues` alanına **bağlanılmamış** — her üç yer de
  `error instanceof Error` ile daralıyor (`seed.ts:44`, `run-guarded-prisma.ts:171`).
  v0.0.4 `AppError` geçişi serbest.
- `zod` `packages/db/package.json`'dan **tamamen** çıktı (dep/devDep ikisinde de yok, `:39-52`),
  `@arkesoft/config` dep'e taşındı (`:40`).

### L2 — vaka adı gövdesiyle uyumsuz · `primaryDomain` test edilmiyor → **KAPANDI**

- `tenant.test.ts:58` artık `'Soft delete sonrası slug serbest kalmaz'` (gövde birebir bunu
  yapıyor) · `:90` `'Soft delete sonrası e-posta serbest kalmaz'` → `user.create` → `deletedAt`
  → tekrar `create` → `isUniqueConstraintError` (gerçek davranış, tautolojik değil) · `:121`
  `'Aynı primaryDomain ile ikinci tenant reddedilir'` → iki farklı `slug`, aynı `primaryDomain`
  (**slug çakışmasıyla yanlış sebepten geçme riski kapatılmış** — doğru kurgu).
- Üç vakanın **adı gövdesiyle uyumlu**; Tur 1'in asıl şikâyeti giderildi. `__tests__/tenant.test.ts`
  içinde `User` vakası bulunması bulgu değil (Tur 1 düzeltmesi bunu açıkça seçenek sunmuştu).

### L3 — guard build garantisi olmadan `dist/`'ten koşuyordu → **KAPANDI**

- `packages/db/package.json:30,32,33,34,35` — **beşinin hepsinde**
  `pnpm run build && node dist/run-guarded-prisma.js <komut>`. Desen dosya içinde tutarlı;
  `deploy:31` ve `verify:36` bilinçli olarak dışarıda.
- **Bağlayıcı sıralama kuralı tutuluyor:** sarmalayıcı çağrısı her beş script'te zincirin
  **son** segmenti, arkasına komut eklenmemiş → `pnpm db:push --url=…` kullanıcı argümanı
  `process.argv`'ye düşüyor, **S1'in sınıfı yapısal olarak kapalı.** Kök `package.json:29-36`
  yalnızca `pnpm --filter … run <script>` delegasyonu yapıyor, araya segment sokmuyor →
  zincir kökten de bozulmuyor.

### Bu tura alınan iki low → **KAPANDI**

- `migration-sql.test.ts`: ölü `not.toContain('DROP COLUMN')` kaldırıldı (`:61-62`), yerine
  indeks değişmezi mekanik doğrulanıyor (`:106-113`); regex
  `CREATE UNIQUE INDEX "[^"]+" ON "tenant_membership"\("tenant_id",` üretilen SQL'e birebir
  uyuyor (`migration.sql:63`).
- Boş-dize kaçışı (`guard-policy.ts:108-113` + `:119` üç koşul) ve `::1` ölü kodu
  (`normalizeHostname` `:55-59` + test `guard-policy.test.ts:22`) yeniden yazılan politikada
  kapandı.

---

## BULGULAR

### [SEV: low] `packages/db/prisma.config.ts:30-38`

Yorum **bayat ve kodla çelişiyor**: artık var olmayan `"seed": "pnpm run build && prisma db seed"`
script'ini tırnak içinde aktarıyor (gerçek hâli `package.json:33`), ve `migrate dev`/
`migrate reset`'in seed kancasının build garantisini "KAPSAMAZ" diyerek `docs/development.md`'de
bir tuzak notuna yönlendiriyor — oysa architect K1-L3 bu riskin **kapandığını** ve docs'un o notu
**yazmayacağını** bağlayıcı olarak karara bağladı. Downstream `docs` ajanı bu yoruma bakarsa
yanlış belge yazar.
**Düzeltme:** yorumu yeni script zinciriyle güncelle; "kapsamaz" cümlesini sil veya "yalnızca
`prisma` doğrudan çağrılırsa" diye daralt. **Sorumlu:** db (docs'a not)

### [SEV: low] `run-guarded-prisma.ts:175-184` + `seed.ts:50-53` + `test-client.ts:24-26`

Üç çağrı yeri de ayrımlı birleşimi yalnızca `if (decision.kind === 'reject')` ile daraltıyor;
`allow` dalı **örtük kalan her şey**. Bugün iki varyant olduğu için doğru, ama birleşime üçüncü
bir varyant (ör. `'warn'`) eklenirse üç çağrı yeri de sessizce **fail-open** olur — bir guard için
yanlış yön. CLAUDE.md §4 bu yapı için exhaustive `switch` + `assertNever` istiyor.
Ek olarak aynı satırlarda (`run-guarded-prisma.ts:167`, `seed.ts:40`)
`ReturnType<typeof readDatabaseEnv>` kullanılmış; `env.ts:25` zaten `DatabaseEnv` adını dışa
veriyor (paket içi).
**Düzeltme:** `switch (decision.kind)` + `assertNever`; `DatabaseEnv` tipini doğrudan kullan.
**Sorumlu:** db

### [SEV: low] `guard-policy.ts:239,248,251,257,266,275,278` + `guard-policy.test.ts:76,84`

`resolveExtraArgs` **altı farklı ret sebebi** için neredeyse aynı mesajı üretiyor
(`İzin verilmeyen argüman: "<ad>"`; yalnızca tekrar dalı ayrışıyor). Sonucu: 52 testin reddetme
vakalarının çoğu `expect(…kind).toBe('reject')` ile yetinmek zorunda ve **hangi dalın reddettiğini
ayırt edemiyor.**
**Somut etkisi:** `:108-113`'teki "boş veritabanı adı → doğrudan ret" dalı ayırt edici testten
yoksun — her iki vaka (`:76`, `:84`) yerel olmayan host kullandığı için dal **silinse bile**
kaçış kapısından geçip yeşil kalır; dalı gerçekten yakalayan senaryo (`localhost` + boş veritabanı
adı) hiç yok.
**Düzeltme:** ret mesajlarını sebebe göre ayır (geçersiz değer / eksik değer / bilinmeyen bayrak /
boolean'a değer) ve testlerde `decision.message`'a da assert et;
`env('postgresql://u:p@localhost:5432/')` vakasını ekle.
**Sorumlu:** db (test tarafı `qa` ile ortak)

### [SEV: low] `env.ts:36-40` + `run-guarded-prisma.ts:47-51`

İki yorum kodla çelişiyor. **(a)** `env.ts:38-40` "`production`'ın koşulsuz reddi … tek bir
`if (NODE_ENV === 'production')` dize kontrolüyle **değil**" diyor; `guard-policy.ts:101` tam
olarak o kontrol. **(b)** `run-guarded-prisma.ts:47-48` "paket kökünün iki değil **üç** dizin
altında durur" diyor; `dist/run-guarded-prisma.js` paket kökünün **bir** dizin altındadır (üç,
kök `.env`'e giden `../../../` segment sayısı). **Yanlış yorum, doğru koddan daha tehlikelidir**
(CLAUDE.md §4 yorum disiplini).
**Düzeltme:** (a)'da "şema bilinmeyen değerleri eler, politika `production`'ı reddeder" demekle
yetin; (b)'yi `PACKAGE_ROOT`/`.env` segment sayısını ayrı ayrı anlatacak şekilde düzelt.
**Sorumlu:** db

### [SEV: low] `run-guarded-prisma.ts:154-161`

B yolu (`resolvePrismaCliPath()`) iki `throw new Error(…)` noktası taşıyor (`:83`, `:95`) ve
`runPrisma` içinden **`fail()`'den geçmeden** fırlıyor: dosyanın özenle kurduğu
`[run-guarded-prisma] <Türkçe mesaj>` + exit 1 deseni kırılır, kullanıcı ham yığın izi görür.
Ayrıca B yolunun tamamı (A-V15) **hiç test edilmemiş** — ölü kod sayılmadı (tanımlı yedek yol),
ama tek regresyon koruması yok.
**Düzeltme:** `runPrisma` içindeki B yolunu `try/catch` ile sarıp `fail()`'e bağla;
`resolvePrismaCliPath`'i saf/enjekte edilebilir hâle getirip (ör. `createRequire`'ı parametre al)
birim testine bağlamayı v0.0.4 borcuna yaz. **Sorumlu:** db

### [SEV: low] `tenant.test.ts:16-31` + `membership.test.ts:21-31`

Temizlik defteri (`createdTenantIds`/`createdUserIds` + `afterAll` iki `deleteMany`) artık iki
dosyada **birebir aynı 13 satır**; Tur 1'de `tenant.test.ts`'te yalnızca tenant defteri vardı,
bu turda `createdUserIds` eklenince tekrar büyüdü. İki kopya aynı sebeple (temizlik stratejisi)
değişir → **gerçek tekrar.** Aynı dosyalardaki `create → mükerrer create → catch →
isUniqueConstraintError` blokları **tekrar değildir** (farklı davranışlar, birleştirilmemeli).
**Düzeltme:** `__tests__/helpers/` altına `createCleanupRegistry()` koy. **Sorumlu:** db

### [SEV: low] `migration-sql.test.ts:81-86,93-99,109-112`

Üç `for` döngüsünün hiçbiri "en az bir kez döndü" güvencesi taşımıyor;
`extractCreatedTableNames` (`:45-50`) bir gün hiç eşleşme döndürmezse testler **sıfır assertion
ile yeşil** geçer. Bu, S4'ün kapatmaya çalıştığı tam failure modu ("linter her şey yolunda der").
Bugün `:53`'teki vaka `extractCreateTableBody` fırlattığı için erken alarm veriyor, bu yüzden low.
**Düzeltme:** `expect(createdTables).toHaveLength(3)` (veya `.length).toBeGreaterThan(0)`) ekle.
**Sorumlu:** db

### [SEV: low] `run-guarded-prisma.ts:174` + `seed.ts:49` + `test-client.ts:23`

`ARKESOFT_CONFIRM_DESTRUCTIVE` **üç yerde** doğrudan `process.env`'den okunuyor; `env.ts` başlığı
kendini "DATABASE_URL/NODE_ENV doğrulaması, **tek** nokta" (`:1`) diye tanımlıyor ama ikinci
yıkıcı-işlem değişkeni o noktanın dışında kalıyor. Değişken adı veya semantiği (ör. `trim()`)
değişirse üç dosya birlikte değişir. L1 sınıfının küçük bir yansıması, ama **medium değil**:
burada çoğaltılan bir doğrulama mantığı yok, tip yükseltmesi yok ve serbest biçimli bir onay
token'ına Zod şeması dayatmak tören olur — asıl mesele okuma yerinin merkezileşmemesi.
Politikaya **parametre olarak** geçilmesi (saflık) bilinçli ve doğru, korunmalı.
**Düzeltme:** `env.ts`'e `readDestructiveConfirmation(): string | undefined` ekleyip üç çağrı
yerini ona bağla. **Sorumlu:** db

---

## Tur 1 low bulgularının akıbeti

| Tur 1 low                                                        | Durum                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `migration-sql.test.ts` ölü `DROP COLUMN` assertion'ı            | **KAPANDI** (`:59-62`, gerekçe yorumuyla)                                                                                                                                                                                                                                            |
| `migration-sql.test.ts` yorumu "gelecekteki her migration"       | **AÇIK** — `:56-58` yeniden yazılmış ama hâlâ "gelecekteki her migration için yıkıcı ifadeler yasak" diyor; `readInitMigrationSql` (`:18-30`) yalnızca `_init` okuyor. Kural beyanı ↔ test kapsamı ayrımı yoruma girmemiş. **(security Tur 2'de bunu T2-1 medium olarak yükseltti)** |
| `process.loadEnvFile` import'ların görsel olarak üstünde         | **KISMEN** — yeni dosya doğru desende (`run-guarded-prisma.ts:45`, import'ların **altında**). Eski iki yer değişmedi: `prisma.config.ts:8`, `vitest.config.ts:11`. `.env` yokken fırlatma davranışı da aynı (artık **üç** çağrı yeri) → v0.0.12 CI borcu                             |
| `seed.ts` `String(error)` yığın izi kaybı                        | **AÇIK** — `seed.ts:103` aynen duruyor (düzeltme turu kapsamında değildi). Aynı dosyanın `:44` satırı artık doğru daraltmayı yapıyor → desen dosya içinde tutarsız                                                                                                                   |
| Test temizlik defteri tekrarı                                    | **AÇIK ve büyüdü** → yukarıdaki 6. bulgu                                                                                                                                                                                                                                             |
| `packages/config/eslint/base.js:42-47` yorum blokları ayrılmamış | **AÇIK** — birebir aynı. **devops**                                                                                                                                                                                                                                                  |
| Çıplak `export {}` gerekçesi                                     | **DÜŞTÜ** — `guard-local-database.ts` silindi, yeni dosyalarda çıplak `export {}` yok                                                                                                                                                                                                |
| `test-client.ts:15` hata mesajı `pnpm db:seed`'e yönlendirmiyor  | **DEĞİŞTİ, AÇIK** — eski mesaj tamamen kalktı (`requireDatabaseUrl` silindi); seed'lenmiş DB ön koşulunu bildiren teşhis hâlâ yok, `tenant.test.ts:33`/`membership.test.ts:39` boş DB'de yine `expected null not to be null` verir (`qa` ile ortak)                                  |

---

## Teyit edilen bilinçli kararlar (bulgu yazılmadı)

- `env.ts` / `guard-policy.ts` / `run-guarded-prisma.ts` `src/index.ts`'ten **dışa açılmıyor** —
  `index.ts:11-34` tam **9 çalışma-zamanı export'u** (K2/AC4 ✓).
- `createPrismaClient` (`client.ts:46-50`) `process.env`'e dokunmuyor, saf fabrika;
  `CreatePrismaClientOptions` (`:24-26`) değişmemiş.
- Eski guard dosyası silinmiş; `src` altında yalnızca **yorum** referansı var (`env.ts:6`,
  `guard-policy.ts:14`, `run-guarded-prisma.ts:48`) — çalıştırılabilir bayat referans yok.
- `migrate reset` kullanıcı bayrağı kabul etmiyor; `--force` sarmalayıcıdan sabit
  (`guard-policy.ts:186`), testi var (`guard-policy.test.ts:121-129,227-229`).
- **Allowlist uydurulmamış:** `guard-policy.ts:168-181` `--skip-seed`/`--skip-generate`'in Prisma
  7.10.1'de bulunmadığını `--help` çıktısıyla belgeleyip listeden çıkarmış; `--create-only`/
  `--port` teyitli. Doğru davranış.
- **R-A7 gerekçe yorumu yeni dosyalarda da var:** `run-guarded-prisma.ts:33-34`
  (`process.stderr.write`, pino v0.0.4) ✓ — `guard-policy.ts` hiç I/O yapmadığı için gerekmiyor ✓
- B yolu ölü kod sayılmadı (A-V15); yalnızca test ve hata yolu low ile işaretlendi.
- **K3:** üç yorum yerinde ve **yalnızca yorum** — `src/tenancy.ts:15-29`,
  `infra/docker-compose.yml:26-30`, `.env.example:21-25`; hiçbir anahtar/değer/servis değişmemiş
  (ikisi de okunarak teyit edildi).
- `turbo.json` değişmemiş ✓ ve `test`/`lint`/`typecheck` hepsi `dependsOn: ["^build", …]`
  (`:19-29`) → `@arkesoft/config` dep'e taşınması turbo zincirinde **boşluk üretmiyor.**
- `guard-policy.ts` gerçekten **saf**: dosyada `process`, `exit`, `fs`, `spawn` eşleşmesi yok;
  tek import `import type { DatabaseEnv }` (`:30`). Ayrımlı birleşim kullanılmış, boolean bayrak
  yığını **yok**. Argüman ayrıştırıcısı **tam dize eşleşmesi** yapıyor (`:246`
  `candidate.name === flagName`); prefix/regex ile bayrak tanıma yok, testi var
  (`guard-policy.test.ts:289-291`).

## Katman / bağımlılık / ölü kod

- **Döngü yok (bağımsız doğrulandı):** `packages/db/package.json:40` → `@arkesoft/config`;
  `packages/config/package.json:34-45` yalnızca dış paketlere bağımlı (`zod`, eslint ailesi),
  hiçbir `@arkesoft/*` girdisi yok. Yön `apps/* → packages/*` korunuyor; bu turda hiçbir
  `apps/*` dosyası değişmedi.
- `packages/db` **iş mantığı içermiyor**: şema/migration/seed/istemci fabrikası/taksonomi +
  yıkıcı komut araçları. `guard-policy.ts` bir DB-araç politikasıdır, alan kuralı değil → doğru
  paket. Sunum mantığı, sağlayıcı dallanması (`if (provider === …)`) yok.
- `PLATFORM_LEVEL_TABLES` **artık tüketiliyor** (`migration-sql.test.ts:11,79,91`) → Tur 1'in
  "henüz tüketilmiyor" notu ve S4'ün ters kontrolü kapandı.
- Kullanılmayan export/import bulunmadı. **Bilgi notu (bulgu değil):**
  `packages/db/dist/guard-local-database.js` yerel derleme çıktısı olarak diskte kalmış (tsc
  silinen kaynağın çıktısını budamıyor); `.gitignore:12` `dist/` olduğu için repoya girmiyor ve
  hiçbir script onu çağırmıyor — architect'in "silinmiş ad `MODULE_NOT_FOUND` verir" garantisi
  yalnızca `pnpm --filter @arkesoft/db run clean` sonrası birebir doğru.
  _(security bunu Tur 2'de T2-3 low olarak ayrıca raporladı; Orkestratör artefaktı temizledi.)_

---

## ÖLÇÜMLER

- İncelenen dosya: **24** (bu turda yeni/değişen 10 · `packages/db` 16 · `packages/config` 3 ·
  kök+infra 5)
- İncelenen satır: **~1.250** (yalnızca değişen kapsam)
- `any`: **0** · `@ts-ignore`/`@ts-expect-error`: **0** · `eslint-disable`: **0** ·
  gerekçesiz `as` zorlaması: **0** (yeni kodda tek assertion sınıfı `as const`)
- Açık dönüş tipi: **22/22** fonksiyon (yeni dosyalarda istisnasız)
- En büyük fonksiyon: `seed.ts:39-100` `main()` **62 satır** · `guard-policy.ts:225-285`
  `resolveExtraArgs` **61 satır** (yarısı yorum + erken ret) · `run-guarded-prisma.ts:77-99`
  `resolvePrismaCliPath` 23 satır
- Test: 4 dosya / **63 vaka** (guard-policy 52 — dosyadan birebir sayıldı: 18 + 34; tenant 5,
  membership 2, migration-sql 4). `skip`/`only`/`todo`: **0**. `it.each` kullanımı DRY açısından
  yerinde (2 tablo, 8 vaka).
- Kontrol edilen kategori: **12/12**
- Bulgu dağılımı: **0 critical / 0 high / 0 medium / 8 low**
- Kapatılan Tur 1 bulgusu: **3 medium** (L1, L2, L3) + **2 low** (ölü assertion, boş-dize
  kaçışı/`::1`)
- Kalan Tur 1 low: 5 açık + 1 kısmen + 1 düştü
- Komut çalıştırılmadı (salt okuma; `lint`/`typecheck`/`test`/`build` çıktıları `qa` gate'inin
  kapsamında)
