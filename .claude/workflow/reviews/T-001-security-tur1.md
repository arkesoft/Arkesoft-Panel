# T-001 · security gate · Tur 1

Tarih: 2026-10-26
Sürüm: v0.0.3 — Prisma kurulumu ve ilk modeller

> Bu dosyayı Orkestratör yazdı. `security` gate ajanının yazma aracı yoktur (bilinçli
> kısıt: gate ajanları kod düzeltmez). Rapor, ajanın döndürdüğü handoff paketinin
> birebir içeriğidir.

```
GATE: security
SONUÇ: FAIL
```

**FAIL gerekçesi (AGENT_BASELINE §4, otomatik):** 1 `high` (guard atlatma) → FAIL.
Ayrıca 4 `medium` (≥3) bağımsız olarak da FAIL üretirdi.

Bulgu dağılımı: **0 critical / 1 high / 4 medium / 8 low**

---

## BULGULAR

### [SEV: high] `packages/db/package.json:32,35`

Yıkıcı komut guard'ı **iletilen CLI bayraklarıyla tamamen atlatılabiliyor.**
`"push": "node dist/guard-local-database.js && prisma db push"` zincirinde pnpm, kullanıcı
argümanlarını zincirin **son** komutuna ekliyor; guard ayrı bir süreç olduğu için onları hiç
görmüyor.

**Ampirik kanıt:** `pnpm db:push --help` → kabuk satırı
`node dist/guard-local-database.js && prisma db push --help` olarak basıldı, guard exit 0 verdi,
bayrak prisma'ya ulaştı. `prisma db push --help` çıktısı
`--url  Override the datasource URL from the Prisma config file` ve
`--force-reset` / `--accept-data-loss` seçeneklerini doğruluyor.

**Saldırı senaryosu:** geliştirici/CI
`pnpm db:push --url=postgresql://u:p@prod-db:5432/arkesoft --accept-data-loss --force-reset`
çalıştırır; guard yereldeki `.env`'in `DATABASE_URL`'ini okuyup geçirir, prisma ise **üretim
veritabanına** şema dayatıp veri kaybı üretir. `ARKESOFT_CONFIRM_DESTRUCTIVE` hiç istenmez.
Aynı sınıf: `migrate reset --config ./baska.config.ts` (reset `--config`/`--schema`
destekliyor, `--help` çıktısıyla doğrulandı).

Guard'ın R5'teki tüm sözleşmesi bu yolla düşüyor ve varlığı **yanlış güven veriyor.**

**Önerilen düzeltme:** guard'ı ön-kontrol değil **sarmalayıcı** yap —
`"push": "node dist/run-guarded-prisma.js db push"`; sarmalayıcı `process.argv` üzerinden
iletilen argümanları da denetlesin (`--url`, `--config`, `--schema`, `--force-reset` görürse
reddet), sonra prisma'yı kendisi `spawn` etsin.

**Sorumlu:** db (architect R5 kararının yeniden açılması gerekiyor)

### [SEV: medium] `packages/db/src/guard-local-database.ts:34-39,81`

Allowlist'teki `postgres` host adı + `NODE_ENV` kontrolünün yalnızca `'production'` dizesine
birebir bakması, guard'ı yerel olmayan hedeflerde **sessizce açıyor.**

**Doğrudan koşuldu:** `DATABASE_URL=postgresql://u:p@postgres:5432/arkesoft_prod` → **exit 0**
(NODE_ENV boş); `NODE_ENV=staging` ile de **exit 0**, onay istenmedi.

**Saldırı senaryosu:** compose/k8s ağında servis adı `postgres` olan bir staging (veya adı
`production` olmayan herhangi bir) ortamda konteyner içinden `pnpm db:reset` →
`prisma migrate reset --force` staging veritabanını geri dönüşsüz siler; guard tek bir uyarı
üretmez.

**Önerilen düzeltme:** (a) `postgres` girdisini allowlist'ten çıkar veya yalnızca
`NODE_ENV ∈ {undefined, 'development', 'test'}` iken geçerli say; (b) NODE_ENV kontrolünü
**varsayılan-reddet** yap (üretim dışında olduğunu kanıtla, üretim olmadığını varsayma).

**Sorumlu:** db

### [SEV: medium] `infra/docker-compose.yml:26` + `.env.example:21` + `packages/db/src/client.ts:47`

Uygulamanın tek veritabanı rolü **süper kullanıcı ve `BYPASSRLS` taşıyor**; v0.0.13'ün RLS
borcunu kapatması bu hâliyle **sessizce etkisiz kalır.**

**Ampirik:** `select rolname, rolsuper, rolbypassrls from pg_roles` → `arkesoft | t | t`;
`pg_tables` → üç tablonun da `tableowner = arkesoft`. `DATABASE_URL` bu rolü kullanıyor ve
`createPrismaClient` onu doğrudan adaptöre veriyor.

Postgres'te süper kullanıcı RLS'i tamamen atlar, tablo **sahibi** de
`FORCE ROW LEVEL SECURITY` olmadan atlar → v0.0.13 politikaları yazıldığında **hiçbir satırı
filtrelemez.** CLAUDE.md §10.4'ün ("BYPASSRLS rolünü uygulama koduna vermek") lafzına aykırı.

**Bugün sömürülebilir değil** (tüketici yok, tenant verisi yok —
`grep -rn "@arkesoft/db" apps packages` → sıfır eşleşme), bu yüzden `critical`/`high` değil;
ama görevde istenen "v0.0.13'ün borcu kapatmasını riskli kılan somut şey" tam olarak budur.

**Önerilen düzeltme:** v0.0.13 kapsamına üç kalem yazılsın ve AC8 teknik borç satırı yalnızca
"politika yok" değil **"rol ayrımı + FORCE RLS yok"** diye kaydedilsin:

1. `BYPASSRLS`'siz, süper olmayan, tablo sahibi **olmayan** `arkesoft_app` rolü
2. her tenant tablosunda `ALTER TABLE … FORCE ROW LEVEL SECURITY`
3. `CreatePrismaClientOptions`'a transaction başına `SET LOCAL app.tenant_id` kancası

**Sorumlu:** architect (karar) + devops (compose/env)

### [SEV: medium] `packages/db/src/tenancy.ts:19,26` + `src/__tests__/migration-sql.test.ts:52`

RLS hazırlığının "mekanizma, niyet değil" garantisi **tek yönlü**: test yalnızca
`TENANT_SCOPED_TABLES`'taki tabloların `tenant_id TEXT NOT NULL` taşıdığını doğruluyor;
**şemada `tenant_id` taşıyan ama taksonomide olmayan** tabloyu yakalayan ters kontrol yok.
`PLATFORM_LEVEL_TABLES` hiçbir yerde tüketilmiyor (`grep` ile doğrulandı: yalnızca export +
yorum).

Bugünkü taksonomi şemayla tutarlı (3 tablo, `tenant_membership` tek tenant tablosu — `psql` ve
`migration.sql:41` ile teyit edildi).

**Saldırı senaryosu:** v0.0.6'da `product` tablosu `tenant_id` ile eklenir,
`TENANT_SCOPED_TABLES`'a yazılmayı unutur; v0.0.13 şema linter'ı bu diziyi **allowlist** olarak
tükettiği için "her şey yolunda" der, `product` RLS'siz yayına çıkar ve `withTenant()` atlanan
tek sorguda A tenant'ı B'nin ürünlerini okur.

**Önerilen düzeltme:** `migration-sql.test.ts`'e iki assert ekle — (a) `migration.sql`'deki her
`CREATE TABLE` ya `PLATFORM_LEVEL_TABLES` ya `TENANT_SCOPED_TABLES` içinde
(`_prisma_migrations` istisnası hariç); (b) gövdesinde `"tenant_id"` geçen hiçbir tablo
`PLATFORM_LEVEL_TABLES`'ta değil.

**Sorumlu:** db (test)

### [SEV: medium] `packages/db/package.json:30,33` + `prisma.config.ts:38`

Yerel olmayan veritabanına **yazma yolu bütünüyle korumasız**; guard yalnızca `push`/`reset`'e
takılı. `"migrate": "prisma migrate dev"` ve `"seed": "pnpm run build && prisma db seed"`
guard'sız.

Architect'in gerekçesi ("üretimde `migrate deploy` çalışmak zorunda") `db:migrate` için geçerli
**değil**: üretim yolu ayrı bir script (`"deploy": "prisma migrate deploy"`,
`package.json:31`) — yani `migrate dev`'i korumak üretimi kırmaz.

**Saldırı senaryosu:** ortamda staging/üretim `DATABASE_URL` tanımlı bir kabukta `pnpm db:seed`
→ demo tenant / `demo-yonetici@arkesoft.test` / owner üyeliği müşteri veritabanına **onaysız ve
sessizce** upsert edilir (**gerçek bir owner yetkisi doğurur**); `pnpm db:migrate` ayrıca shadow
DB yaratır ve `migrations.seed` kancasını aynı hedefe tetikler.

**Önerilen düzeltme:** `migrate` ve `seed` script'lerini de aynı sarmalayıcı/guard'dan geçir
(`deploy` hariç tutulur, gerekçe yorumuyla).

**Sorumlu:** db

### [SEV: low] `packages/db/src/guard-local-database.ts:94`

Kaçış kapısı **boş dizeyle eşleşebiliyor**: `confirmation !== undefined && confirmation === databaseName`
kontrolü `databaseName === ''` olduğunda `ARKESOFT_CONFIRM_DESTRUCTIVE=""` ile sağlanıyor.
Doğrudan koşuldu: `DATABASE_URL=postgresql://u:p@db.prod.example.com` (yol kısmı yok →
`databaseName = ''`) + boş confirm → **exit 0**. CI'da tanımsız bir secret'ın boş dizeye düşmesi
bu ikiliyi gerçekçi kılıyor.

**Önerilen düzeltme:** `databaseName.length > 0` ve `confirmation.length > 0` ön koşulu ekle.
**Sorumlu:** db

### [SEV: low] `packages/db/src/guard-local-database.ts:34-39`

Allowlist girdisi `::1` **ölü kod** ve büyük harfli host reddediliyor. `postgresql:` özel
olmayan bir şema olduğu için Node `URL#hostname`'i ne köşeli parantezden arındırıyor ne küçük
harfe çeviriyor: `[::1]` → `"[::1]"`, `LOCALHOST` → `"LOCALHOST"`. İkisi de exit 1 aldı.
Yön **güvenli** (fail-closed, yanlış ret), ama belgelenen davranış ile gerçek uyuşmuyor.

**Olumlu teyit:** spoofing denemelerinin hiçbiri geçmedi — `evil-localhost.com`,
`localhost.attacker.com`, `postgresql://localhost@evil.com/db` (userinfo), `2130706433`,
`0x7f000001`, `127.0.0.1.` → hepsi exit 1.

**Önerilen düzeltme:** hostname'i `.toLowerCase()` + köşeli parantez soyma ile normalize et,
allowlist'e `[::1]` ekle. **Sorumlu:** db

### [SEV: low] `packages/db/src/tenancy.ts:9-13`

`tenant_membership` RLS politikası yok. **Bilinçli ve vadeli teknik borç olarak teyit edildi**
(R4/AC8, vade v0.0.13), `critical` değil:
`grep -rn "@arkesoft/db" apps packages --include='*.ts'` → sıfır eşleşme, hiçbir paket
`@arkesoft/db`'yi `dependencies`'ine almamış, veritabanında yalnızca 3 satır demo fixture var →
sızabilecek tenant verisi yok.

Şema RLS'e hazır: `migration.sql:41` `"tenant_id" TEXT NOT NULL`, `migration.sql:63` unique
indeksin **öncü** kolonu, `pg.Pool` paket dışına sızmıyor (`dist/index.d.ts` grep'i boş).

Borcun kapanabilmesi için yukarıdaki BYPASSRLS bulgusu da çözülmeli. **Sorumlu:** docs (borç kaydı)

### [SEV: low] `packages/db/prisma/schema.prisma:79-80`

`onDelete: Cascade` çifti, kullanıcı hard delete'inde tenant'ın **son `owner` üyeliğini sessizce
siliyor** (R-A10 teyit edildi) → sahibi olmayan, yönetilemez tenant. Bugün hiçbir uygulama kodu
hard delete yapmıyor; veri modeli hatası değil **iş kuralı eksiği.**

**Önerilen düzeltme:** v0.0.14 "son owner silinemez" kuralı + silme akışında owner devri; borç
tablosuna yaz. **Sorumlu:** docs

### [SEV: low] `packages/db/src/seed.ts:28` + `guard-local-database.ts:60` + `__tests__/helpers/test-client.ts:15`

`DATABASE_URL` üç yerde `process.env`'den **Zod'suz** okunuyor (yalnızca boşluk kontrolü).
CLAUDE.md §4 "dış dünyadan gelen her veri (env) Zod ile parse edilir" diyor ve `zod`
`packages/db/package.json:43`'te dependency olarak **bildirilmiş ama hiç kullanılmıyor**
(`grep` ile doğrulandı). Etkisi düşük (hatalı değer bağlantı hatasına düşer).

**Önerilen düzeltme:** v0.0.4'te `@arkesoft/config` env şemasını tüket veya paket içinde dar bir
Zod şeması kur. **Sorumlu:** db

> Not: `solid` gate'i aynı bulguyu `medium` olarak işaretledi (üç kopyanın aynı sebeple
> değişmesi + bildirilmiş ama kullanılmayan bağımlılık açısından). Düzeltme turunda
> `medium` seviyesinden ele alındı.

### [SEV: low] `packages/db/package.json:32,35`

`push`/`reset` **derlenmiş** guard'ı (`dist/guard-local-database.js`) çağırıyor ama `seed`'in
yaptığı gibi önce `build` çalıştırmıyor. Dosya yoksa fail-closed (`node yok.js` → exit 1,
doğrulandı); ancak guard mantığı sıkılaştırıldığında `dist` bayat kaldığı sürece **eski guard**
koşmaya devam eder.

**Önerilen düzeltme:** `"reset": "pnpm run build && node dist/… && …"`. **Sorumlu:** db

### [SEV: low] `packages/db/src/seed.ts:77`

stdout'a **tam e-posta** yazılıyor (`demo-yonetici@arkesoft.test`). Değer RFC 2606 ayrılmış
`.test` TLD'li sabit bir **fixture**, gerçek PII değil ve yapılandırılmış log değil → KVKK
ihlali sayılmadı. Ancak CLAUDE.md §4 maskeleme kuralı (`a***@example.com`) v0.0.4'te pino
geldiğinde bu desenin kopyalanmasını engellemek için şimdi işaretlendi.

**Önerilen düzeltme:** satırda yalnızca `slug` bırak veya e-postayı maskele. **Sorumlu:** db

### [SEV: low] `packages/config/eslint/base.js:52-64`

AC4 kuralı `@prisma/client` ve `.prisma/client*` desenlerini kapatıyor ama **`pg` ile
`@prisma/adapter-pg`'yi kapatmıyor**; bir `apps/*` dosyası kendi ham `pg.Pool`'unu kurup
v0.0.13'ün `withTenant()` zorunluluğunu atlayabilir.

**Bugün engelli:** pnpm katı çözümleme nedeniyle `apps/api`'den `require.resolve('pg')` →
`MODULE_NOT_FOUND` (doğrulandı).

**Önerilen düzeltme:** v0.0.13'te `withTenant()` zorunlu yol olurken kuralı bu iki paketle
genişlet. **Sorumlu:** devops

---

## OLUMLU TEYİTLER (bulgu değil)

- **Repoda sır yok:** `git ls-files | grep '\.env'` → yalnızca `.env.example`; `.gitignore:11`
  `.env`'i yoksayıyor. Kod içinde gerçek sır eşleşmesi yok (yalnızca `check-env.ts`'in maskeleme
  deseni ve `env.ts`'in şema anahtar adları).
- `DEMO_SEED` (`seed-data.ts:18-29`) parola/token/anahtar **içermez**; `seed.ts` kullanıcıya
  hiçbir kimlik bilgisi yazmaz (Better Auth v0.0.5).
- Guard reddetme mesajı **gerçekten** yalnızca host + DB adı içeriyor; `DATABASE_URL` ve parola
  hiçbir dalda yazılmıyor (kod + 11 senaryonun stderr çıktısıyla doğrulandı).
  `prisma.config.ts` hiçbir şey loglamıyor. `packages/config/src/check-env.ts:14,32` ayrıca URL
  kimlik bilgisini `//***:***@` ile maskeliyor.
- `NODE_ENV=production` **koşulsuz** reddediyor; kaçış kapısı bu kontrolü **aşmıyor**
  (ST-4 raporu teyit edildi: kontrol sırası `guard-local-database.ts:81 → 88 → 93`).
- `DATABASE_URL` tanımsız/geçersizse guard **fail-closed** reddediyor (satır 59-73).
- `process.loadEnvFile` ortamdaki değeri **ezmiyor** (`FOO=from_ambient` testi) → guard ile
  Prisma CLI aynı `DATABASE_URL`'i görüyor, aralarında **TOCTOU/sapma yok**; CI enjeksiyonu da
  guard tarafından denetleniyor.
- Export yüzeyi temiz: `dist/index.d.ts` 9 çalışma-zamanı export'u;
  `grep -nE 'Pool|PoolConfig|PrismaPg|PrismaClientKnownRequestError|new PrismaClient'` →
  eşleşme yok. `Prisma` yalnızca **tip** olarak açılmış, değer tarafı sızmıyor.
- Veri modeli: `TenantRole`'de `platform_admin` **yok** (doğru — platform yetkisi üyelik değil)
  ve `role` için **default yok** (doğru — sessiz varsayılan yetki kazası engellenir).
- `migration.sql` yıkıcı ifade içermiyor; **ham SQL/enjeksiyon yüzeyi yok** (tüm sorgular Prisma
  istemcisi üzerinden, `$queryRaw*` kullanımı yok).

---

## ÖLÇÜMLER

- **`pnpm audit` → "No known vulnerabilities found", exit 0** (kritik 0 / yüksek 0 / orta 0 /
  düşük 0). Yeni bağımlılıklar: `prisma` 7.10.1, `@prisma/client` 7.10.1,
  `@prisma/adapter-pg` 7.10.1, `pg` 8.23.1, `@types/pg` 8.23.1, `vitest` 5.0.5 — hepsi birinci
  taraf (Prisma/pg/Vitest), bakımlı, lisanslar permissive. `allowBuilds` haritası **asgari ve
  gerekçeli** (`@prisma/engines`, `prisma`); blanket izin yok, `@prisma/client` bilinçli olarak
  dışarıda — install-script riski iki resmi Prisma paketiyle sınırlı, kök `postinstall`
  eklenmemiş. Bu kalemde bulgu yok.
- **İncelenen dosya: 24** (`packages/db`'nin 21 dosyası + `packages/config/eslint/base.js`,
  `packages/config/src/check-env.ts`, kök `package.json`/`pnpm-workspace.yaml`/`turbo.json`/
  `.gitignore`/`.env.example`/`infra/docker-compose.yml` referansları dahil).
- **Koşan komutlar:** `pnpm audit` · `pnpm db:push --help` (argüman iletimi kanıtı — guard
  exit 0 + bayrak prisma'ya ulaştı) · `npx prisma db push --help` / `migrate reset --help`
  (`--url`/`--config` varlığı) · guard'ın **11 senaryolu** izole koşumu
  (`node dist/guard-local-database.js`) · `node` URL-ayrıştırma probu (**14 hostname varyantı**)
  · `loadEnvFile` ezme testi · `docker exec … psql` ile `pg_roles`/`pg_tables`
  (`rolsuper=t`, `rolbypassrls=t`) · `node -e import('./dist/index.js')` (9 export) · `grep` ile
  sır / `@prisma/client` / `zod` / taksonomi tüketimi taramaları · `require.resolve('pg')`
  `apps/api`'den → `MODULE_NOT_FOUND`.
  **`pnpm db:reset` ÇALIŞTIRILMADI** (kısıt gereği).
- **CLAUDE.md §7 kapsamı (14 madde):** karşılanan **1, 3, 12** · karşılanmayan **2** (RLS
  politikası — vadeli borç, v0.0.13) ve **11** (izolasyon süiti — v0.0.13, AC3 kapıya dahil
  etmiyor) · n/a **4, 5, 6, 7, 8, 9, 10, 13, 14** (tRPC/withTenant/kuyruk/dış kaynak/dosya/
  logger/süper admin bu sürümde yok). §7 dışı ama bağlantılı: **§10.4 (BYPASSRLS rolü) ihlal
  ediliyor** — yukarıdaki medium.
- Kontrol listesinde **yüzeysiz (n/a)** maddeler: ödeme/kart/webhook/oran sınırlama/SSRF/dosya
  yükleme/XSS/süper admin denetim kaydı — **uydurulmuş bulgu üretilmedi.**
