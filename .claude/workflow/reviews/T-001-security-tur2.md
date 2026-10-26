# T-001 · security gate · Tur 2 (Düzeltme Turu 1 sonrası)

Tarih: 2026-10-26
Sürüm: v0.0.3 — Prisma kurulumu ve ilk modeller

> Bu dosyayı Orkestratör yazdı. `security` gate ajanının yazma aracı yoktur (bilinçli kısıt:
> gate ajanları kod düzeltmez). İçerik ajanın döndürdüğü handoff paketidir.

```
GATE: security
SONUÇ: PASS
```

**PASS gerekçesi (AGENT_BASELINE §4):** 0 critical · 0 high · **1 medium** · 3 low →
1–2 medium = PASS, bulgular teknik borca kaydedilir.

## Tur 1 bulgularının durumu

| Bulgu                                                   | SEV    | Durum                                                             |
| ------------------------------------------------------- | ------ | ----------------------------------------------------------------- |
| S1 — guard CLI bayraklarıyla atlatılabiliyordu          | high   | **KAPANDI**                                                       |
| S2 — `postgres` host + `NODE_ENV` yalnızca 'production' | medium | **KAPANDI**                                                       |
| S3 — BYPASSRLS / tablo sahipliği                        | medium | **BİLİNÇLİ ERTELENDİ** (architect K3, v0.0.13) — yeniden açılmadı |
| S4 — taksonomi ters kontrolü yok                        | medium | **KISMEN** → T2-1                                                 |
| S5 — `migrate`/`seed` guard'sız                         | medium | **KAPANDI**                                                       |

---

## BULGULAR

### [SEV: medium] T2-1 · `packages/db/src/__tests__/migration-sql.test.ts:18-30`

S4'ün iki yeni ters-kontrol assert'i **mantık olarak doğru** ama **dosya kapsamı yanlış**:
`readInitMigrationSql()` yalnızca adı `_init` ile biten migration dizinini okuyor. S4'ün yazılı
sömürü senaryosu ("v0.0.6'da `product` tablosu `tenant_id` ile eklenir, `TENANT_SCOPED_TABLES`'a
yazılmayı unutulur") tam olarak **yeni bir migration dosyasıyla** gerçekleşir ve o dosya hiç
okunmaz.

**Ampirik kanıt:** geçici `prisma/migrations/20991231235959_add_product/migration.sql`
(`CREATE TABLE "product" (… "tenant_id" TEXT NOT NULL)`, `product` her iki taksonomi dizisinde
de **yok**) → `pnpm vitest run src/__tests__/migration-sql.test.ts` → **4 passed**
(kırmızıya düşmedi). Probe silindi.

**Saldırı senaryosu:** v0.0.13'ün şema linter'ı bu diziyi allowlist olarak tükettiği için
"her şey yolunda" der → `product` RLS'siz yayına çıkar; `withTenant()` atlanan tek sorguda
A tenant'ı B'nin ürünlerini okur. **Sapma dedektörü, kurulduğu sapmayı yapısal olarak göremiyor.**

**Önerilen düzeltme:** `readInitMigrationSql()` → `readAllMigrationSql()` (dizindeki her
`*/migration.sql`'i birleştir, `_init` sonekine bağlanma); assert A/B/C birleşik metin üzerinde
koşsun.

> Not: `solid` gate'in "yorum 'gelecekteki her migration' diyor ama yalnızca `_init` okunuyor"
> low bulgusu artık S4'ün **etkinliğini** taşıyor, bu yüzden low değil medium.

**Sorumlu:** db

### [SEV: low] T2-2 · `packages/db/src/guard-policy.ts:297-298`

`resolvePrismaCommand`'ın bilinmeyen-komut dalı ret mesajında `argv.join(' ')` ile **tüm argv'yi**
yazıyor; K1.3'ün "ret mesajı token'ın adını yazar, değerini yazmaz" kuralı yalnızca bayrak
dalında uygulanmış.

**Ampirik:** `['db','execute','--url','postgres://evil/x']` →
`İzin verilmeyen komut: "db execute --url postgres://evil/x"`.

Repo script yüzeyinden **erişilemez** (beş script komut token'larını sabit yazıyor), ama bir CI
adımı veya sarmalayıcı yazım hatası bağlantı dizesini (parola dahil) CI loguna düşürür.

**Önerilen düzeltme:** yalnızca ilk iki token'ı yaz veya `=`/`://` içeren token'ları maskele;
`guard-policy.test.ts:293`'teki "değer yazmaz" assert'ini bu dala da ekle. **Sorumlu:** db

### [SEV: low] T2-3 · `packages/db/dist/guard-local-database.js`

Kaynak dosya silindi ama **derlenmiş çıktı** çalışma ağacında duruyordu ve hâlâ koşuyordu:
`node packages/db/dist/guard-local-database.js` → **exit 0** (eski, gevşek guard). `tsc`
kaldırılan kaynağın çıktısını temizlemiyor → architect'in "silinmiş ad `MODULE_NOT_FOUND`
üretir (fail-closed)" mekanizması yalnızca taze klonda / `clean` sonrası geçerli.

Repoda hiçbir referans yok (grep: yalnızca üç yorum satırı), bu yüzden low — sömürü için eski
yolun elle yazılması gerekir, ki bu architect'in beyan ettiği "keyfi çağrı" artık riskiyle aynı
sınıf.

**Önerilen düzeltme:** `"build": "rm -rf dist && tsc -p tsconfig.build.json …"` (veya `clean`
ön adımı) + `docs/development.md`'ye "fix sonrası bir kez
`pnpm --filter @arkesoft/db clean`" notu.

> **Orkestratör müdahalesi (2026-10-26):** artefakt bu makinede temizlendi. Ek bulgu:
> `pnpm db:generate && pnpm build` sonrası **turbo önbelleği bayat dosyayı geri getirdi**
> (build çıktısı cache'e o dosya varken alınmıştı) → artefakt elle silinip
> `pnpm --filter @arkesoft/db run build` ile yeniden derlendi, sonra temiz.
> Bu, `"build"`'in başına `rm -rf dist` eklenmesi önerisini güçlendiriyor: turbo cache tek
> başına bayatlığı çözmüyor.

**Sorumlu:** db

### [SEV: low] T2-4 · `packages/config/package.json:36-42` + `packages/db/package.json:40`

K2'nin `@arkesoft/config` devDep→dep taşıması, config'in **lint-only** çalışma zamanı
bağımlılıklarını `@arkesoft/db`'nin **üretim kapanışına** soktu.

**Ampirik:** `pnpm --filter @arkesoft/db list --prod --depth 1` → `@eslint/js@10.0.1`,
`eslint-config-prettier@10.1.8`, `globals@17.13.0`, `typescript-eslint@8.72.0` (+ `zod@4.6.7`)
production dalında. v0.0.12'nin `pnpm install --prod` Docker imajı ESLint araç zincirini
runtime grafiğinde taşır → **gereksiz tedarik zinciri yüzeyi.**

Bugün sömürülebilir değil: hiçbir runtime import yok ve `allowBuilds` yalnızca
`@prisma/engines` + `prisma` (postinstall engelli).

**Önerilen düzeltme:** `packages/config`'te `./env` subpath'inin tek çalışma zamanı bağımlılığı
`zod` kalsın; lint paketleri devDep/peerDep'e taşınsın.
**Sorumlu:** devops (architect teyidi ister)

---

## S1 — KAPANDI (ampirik)

Sarmalayıcıya geçiş yapısal olarak çalışıyor: pnpm kullanıcı argümanlarını zincirin son
segmentine (`node dist/run-guarded-prisma.js …`) ekliyor → argümanlar artık guard'ı **görmek
zorunda.**

Uçtan uca (gerçek `pnpm` yüzeyi, hepsi exit 1, Prisma'ya tek paket gitmeden):

| Çağrı                                                                              | Çıktı                                                    |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `pnpm db:push --url=postgresql://u:p@prod-db:5432/arkesoft`                        | `[run-guarded-prisma] İzin verilmeyen argüman: "--url".` |
| `pnpm db:push --accept-data-loss` / `--force-reset` / `--force` / `--help`         | ret, exit 1                                              |
| `pnpm db:reset --config ./baska.config.ts`                                         | `İzin verilmeyen argüman: "--config".`                   |
| `pnpm db:reset --force` / `--skip-seed`                                            | ret (kullanıcı `--force` veremiyor)                      |
| `pnpm db:migrate --schema=/etc/passwd` / `--name=../../x` / `--url=…`              | ret                                                      |
| `pnpm db:seed --url=…`                                                             | ret                                                      |
| `pnpm db:studio --port=99999`                                                      | ret                                                      |
| `pnpm db:push -- --url=…` · `pnpm --filter @arkesoft/db run push -- --force-reset` | `İzin verilmeyen argüman: "--".`                         |

**Saf politika probe'u ile 56 vektör** (`dist/guard-policy.js` doğrudan): `--` ayırıcısı,
çift bayrak (`--name=a --name=b`, `--create-only --create-only`), `--name=../../x`, `--name=`
(boş), `--name=UPPER`, 80 karakter `--name`, `--port=0`/`99999`/`5555x`/`" 5555"`, pozisyonel
(`extra`), boş dize, kısa bayraklar (`-u`, `-f`), `--URL=` (büyük harf), en-dash `–url`,
soft-hyphen gömülü `--­url`, baştaki/aradaki boşluk, `migrate deploy`/`db execute`/
`migrate resolve`/`db pull`/`generate`, boş argv, yarım komut (`db`, `migrate`) →
**hepsi REJECT.**

İzinli yüzey tam olarak beş komut: `db push` · `migrate reset` (→ `["migrate","reset","--force"]`)
· `migrate dev` (+`--name` `/^[a-z0-9_]{1,64}$/`, `--create-only`) · `db seed` ·
`studio` (+`--port` 1–65535).

`migrate reset`'in sabit `--force`'u kullanıcı tarafından **etkilenemiyor**: `spawnArgs` modül
seviyesi `as const`, `allowedFlags: []`, birleştirme `[...spec.spawnArgs, ...parsed.args]` —
ekleme yalnızca sonda ve boş.

**Kod teyitleri:** `shell: false` **açıkça yazılı** (`run-guarded-prisma.ts:146`) ·
`cwd: PACKAGE_ROOT` ve `PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))`,
`process.cwd()` kullanılmıyor · `env: { ...process.env, DATABASE_URL: databaseUrl }` doğrulanmış
değere sabitlenmiş → **TOCTOU yapısal olarak kapalı**; `prisma.config.ts`'in `env('DATABASE_URL')`'i
bu sabitlenmiş değeri okuyor. Prisma'nın AI-ajan kapısı (`CLAUDECODE`,
`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`) `...process.env` ile olduğu gibi geçiyor,
allowlist'te onu kapatan bayrak yok.

## S2 — KAPANDI (ampirik, 27 host × 3 confirmation = 81 koşum)

`postgres` artık **REJECT** (Tur 1'de exit 0'dı). `NODE_ENV` varsayılan-reddet: `staging`,
`prod`, `Production`, `PRODUCTION`, boş dize → `readDatabaseEnv()` **şemada** düşüyor (exit 1);
`production` → politikada **koşulsuz** ret, doğru `confirmation` ile de aşılmıyor; izinli yalnızca
`development`/`test`/tanımsız (→ `development`).

**Normalizasyon yeni atlatma açmadı.** `LOCALHOST` → allow (amaçlanan), `[::1]` → allow (ölü kod
bitti). REJECT: `LoCaLhOsT.attacker.com`, `localhost.attacker.com`, `evil-localhost.com`,
`localhost.`, `localhost%00.evil.com`, Kiril `lоcalhost` (→ `l%d0%becalhost`),
`127.0.0.1:5432@evil.com` ve `localhost@evil.com` (userinfo → host `evil.com`), `2130706433`,
`0x7f000001`, `127.0.0.1.`, `127.1`, `0.0.0.0`, `0`, `[::]`, `[::ffff:127.0.0.1]` (fail-closed
yanlış ret, zararsız). Köşeli parantez soyma kötüye kullanılamıyor: `[localhost]` →
`new URL()` fırlatıyor → ret. Boş DB adı artık **doğrudan** ret →
`ARKESOFT_CONFIRM_DESTRUCTIVE=""` kaçışı kapandı.

## S5 — KAPANDI (derinlik savunması dahil)

`migrate` ve `seed` script'leri sarmalayıcıdan geçiyor. İkinci katman doğrulandı:

- `DATABASE_URL=postgresql://u:p@prod.example.com:5432/arkesoft_prod node dist/seed.js` →
  `[seed] Yerel olmayan bir veritabanına … çalıştırılamaz.` **exit 1**
- `NODE_ENV=production` + localhost → `[seed] Üretim ortamında (NODE_ENV=production)
çalıştırılamaz.` exit 1 · `NODE_ENV=staging` → env şemasında ret
- `migrations.seed` kancası: `node --env-file=../../.env` ortamdaki değeri **ezmiyor** (ölçüldü:
  ambient `prod.example.com` kazandı) → kanca yolu da guard'a yakalanıyor
- İzinli yol sağlam: `pnpm db:seed` → **exit 0**

`deploy`/`generate`/`verify`'ın guard'sız kalması doğru ve **yeni yazma yolu açmıyor**:
`deploy` üretimde çalışmak zorunda (bilinçli), `generate` DB'ye bağlanmıyor (ayrıca
`build.dependsOn:["generate"]` olduğu için sarmalanması döngü üretir), `verify` salt okunur.

## S3 — ertelenmiş karar teyit edildi (yeniden açılmadı)

Üç yorum mevcut: `infra/docker-compose.yml:26-30`, `.env.example:21-25`,
`packages/db/src/tenancy.ts:15-29`. AC8 borç metni **üç ayrı satır** olarak ifade edilmiş ve
v0.0.13 kalemleri T-001 §K3'te yazılı. `CreatePrismaClientOptions` değişmemiş — doğru.

> **`docs` adımı borcu (bulgu değil):** kayıt henüz yalnızca Task dosyasında. `ROADMAP.md`'de
> **"Teknik Borç" tablosu yok**; v0.0.13'ün 4. kutusu (`ROADMAP.md:278`) hâlâ eski tek satır
> ("Ayrı DB rolü: migration için `BYPASSRLS`, uygulama için yok") — FORCE RLS, tablo sahipliği
> ve üç doğrulama sorgusundan söz etmiyor. **AC8'in karşılanması `docs` adımına bağlı.**

## S4 ters kontrolünün çalıştığı yön (kanıt)

Gerçek taksonomi dizileriyle, testin assert mantığını birebir taklit eden probe:
bugünün şeması → **YEŞİL** · taksonomide olmayan `tenant_id`'li `product` →
**KIRMIZI (assert-A)** · platform tablosu `app_user`'a `tenant_id` eklenmiş →
**KIRMIZI (assert-B)** · `tenant_id` öncü kolon değil → **KIRMIZI (assert-C, yeni 4. assert)**.
Yani **mantık doğru**; kusur yalnızca okunan dosya kümesi (T2-1).

## Yeni yüzeyin kendi riskleri

- `env.ts` / `EnvValidationError` **değeri sızdırmıyor** —
  `DATABASE_URL=http://gizli_kullanici:SUPER_GIZLI_PAROLA@host/db` ile ölçüldü: mesaj
  `DATABASE_URL: şu öneklerden biriyle başlamalı: postgresql://, postgres://` →
  `PAROLA`/`gizli_kullanici` eşleşmesi **hayır**. Tanımsız/boş değer de fail-closed.
- `guard-policy.ts` **saf**: kaynakta ve `dist`'te `process`/`require`/`node:` çalışma zamanı
  erişimi yok (tek import `import type { DatabaseEnv }`).
- `src/index.ts` **hiçbirini** sızdırmıyor: `env|guard-policy|run-guarded` grep'i `src/index.ts`
  ve `dist/index.d.ts`'te sıfır eşleşme; çalışma zamanı export sayısı **9** — eksik/fazla yok.
- 52 yeni test **sır içermiyor**: yalnızca sentetik kimlik bilgileri (`u:p`, `gizli-parola`);
  "ret mesajı DATABASE_URL'in tamamını veya parolayı içermez" ve "ret mesajı bayrağın adını
  yazar, değerini yazmaz" assert'leri gerçek.
- `zod` manifestten çıkarılmış, `packages/db/src`'te hiçbir `import … 'zod'` yok (A-V17 tuttu).
- B yolu (`resolvePrismaCliPath`) enjeksiyon yüzeyi getirmiyor: girdi
  `node_modules`'daki `prisma/package.json#bin`, `spawnSync(process.execPath, …, { shell: false })`.
  Bu ortamda hiç tetiklenmedi.

## Kapsam dışı artık risk — teyit, bulgu değil

`pnpm exec prisma db push --url=…` ve `npx prisma …` guard'sızdır (architect açıkça beyan etti:
"guard bir hız kesicidir, izolasyon sınırı değildir"). Gerçek savunma kimlik bilgisi ayrımı
(v0.0.13) + CI sırları (v0.0.12). `process.stdout/stderr.write` R-A7 kapsamında ihlal sayılmadı.
`allowBuilds` asgari (`@prisma/engines`, `prisma`) ve gerekçeli.

---

## ÖLÇÜMLER

- `pnpm audit` → **"No known vulnerabilities found"**, exit 0 · critical 0 / high 0 / moderate 0 /
  low 0 / info 0 · (123 prod + 188 dev + 48 opt = **326 bağımlılık**)
- `pnpm --filter @arkesoft/db test` → 4 dosya / **63 test**, 0 failed / 0 skipped ✅
- Kök kapı → `lint` exit 0 · `typecheck` exit 0 · `build` exit 0 · `test` exit 0 ·
  `format:check` exit 0
- Export yüzeyi → **9** (beklenen 9) ✅ · Silinen kaynak dosya → yok ✅
- İncelenen dosya → **28**
- Koşan probe'lar → `resolvePrismaCommand` **56 vektör** · `evaluateTargetDatabase`
  27 host × 3 confirmation (**81**) · `readDatabaseEnv` 9 `NODE_ENV` + 4 `DATABASE_URL` varyantı ·
  **15 uçtan uca** `pnpm` çağrısı · `seed.js` 3 derinlik savunması koşumu · S4 taksonomi probe'u
  (4 sentetik SQL) + 1 geçici migration dizini probe'u (silindi) · `--env-file` öncelik ölçümü ·
  `pnpm --filter … list --prod`
- `pnpm db:reset` **çalıştırılmadı** (kısıt). `pnpm db:studio` **başlatılmadı**.
  `pnpm db:seed` çalıştırıldı (exit 0).
- **CLAUDE.md §7 (14 madde):** karşılanan → 1, 3 (artık mekanik assert'li), 12 ·
  karşılanmayan → 2 (RLS politikası, vadeli borç v0.0.13), 11 (izolasyon süiti, v0.0.13) ·
  n/a → 4, 5, 6, 7, 8, 9, 10, 13, 14 · §7 dışı → §10.4 (BYPASSRLS) ihlali sürüyor (S3, bilinçli)
- **Bulgu muhasebesi:** kapatılan S1, S2, S5 (3) · bilinçli ertelenen S3 (1) · kısmen S4
  (1 medium kalıntı) · yeni 3 low → Tur 2 dağılımı **0 / 0 / 1 / 3**
- n/a (yüzey yok, uydurulmuş bulgu üretilmedi): ödeme/kart verisi/webhook imzası/replay/
  idempotency/oran sınırlama/SSRF/dosya yükleme/XSS/açık yönlendirme/süper admin denetim kaydı.
  KVKK: yeni kişisel veri toplanmıyor; seed fixture'ı RFC 2606 `.test` TLD'li.

**Orkestratöre not:** Tek `medium` (T2-1) `migration-sql.test.ts`'de tek fonksiyonluk bir
değişiklik. Kural gereği PASS verildi ve teknik borca kaydedilmesi gerekiyor; ancak bu kalem
**v0.0.13'ün şema linter'ının temeli** olduğu için v0.0.13'ten önce kapanması, S3'ün üç kalemiyle
birlikte izlenmesi önerilir.
