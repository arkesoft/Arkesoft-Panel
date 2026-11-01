# Geliştirme Ortamı

Bu belge yerel kurulumu anlatır. Kod standartları ve çalışma akışı için
[`CLAUDE.md`](../CLAUDE.md), sürüm planı için [`ROADMAP.md`](../ROADMAP.md).

---

## Gereksinimler

| Araç   | Sürüm      | Not                                                                |
| ------ | ---------- | ------------------------------------------------------------------ |
| Node   | **24 LTS** | `.nvmrc` ile sabit. `engines` `>=24` kabul eder.                   |
| pnpm   | **12+**    | `npm install -g pnpm` — Node 25+ dağıtımlarında corepack gelmiyor. |
| Docker | 24+        | Docker Desktop veya Colima. Compose v2+ gerekli.                   |

Node sürüm yöneticisi kullanıyorsanız (`fnm`, `nvm`) repo kökünde `.nvmrc`
otomatik okunur:

```bash
fnm use    # veya: nvm use
```

> **Dikkat:** Node 25 gibi tek numaralı hatlar LTS değildir. Üretim ve CI 24'e
> sabitlidir; yerelde de 24 kullanmak, çalışma zamanı farklarından kaynaklanan
> sürprizleri önler.

---

## İlk kurulum

```bash
pnpm install        # bağımlılıklar
pnpm infra:up       # Postgres, Redis, Meilisearch, SeaweedFS, Mailpit
pnpm env:check      # .env değerlerini şemaya göre doğrula
```

`pnpm infra:up` ilk çalıştırmada `.env.example` dosyasını `.env` olarak
kopyalar. `.env` git'e girmez; kendi değerlerinizi orada değiştirin.

İmajlar ilk seferde indirileceği için bu adım birkaç dakika sürebilir.

---

## Altyapı servisleri

| Servis           | Adres                 | Ne için                                         |
| ---------------- | --------------------- | ----------------------------------------------- |
| PostgreSQL       | `localhost:5432`      | Tek veritabanı, `tenant_id` + RLS ile izolasyon |
| Redis            | `localhost:6379`      | Önbellek ve BullMQ kuyruğu                      |
| Meilisearch      | http://localhost:7700 | Ürün arama                                      |
| SeaweedFS (S3)   | http://localhost:8333 | Nesne depolama (üretimde Cloudflare R2)         |
| SeaweedFS master | http://localhost:9333 | Yalnızca teşhis arayüzü                         |
| Mailpit SMTP     | `localhost:1025`      | Giden e-posta yakalama                          |
| Mailpit arayüzü  | http://localhost:8025 | Yakalanan e-postaları okuma                     |

### Komutlar

```bash
pnpm infra:up       # ayağa kaldır, hepsi healthy olana kadar bekle
pnpm infra:down     # durdur — VERİ KORUNUR
pnpm infra:reset    # volume'ları silip sıfırdan kur — VERİ GİDER
pnpm infra:ps       # durum
pnpm infra:logs     # canlı log (Ctrl+C ile çık)
```

`infra:up` komutu `--wait` kullanır: tüm servisler `healthy` olmadan geri
dönmez. Dönerse altyapı gerçekten hazırdır.

### Veri kalıcılığı

Dört servisin verisi isimli Docker volume'larında tutulur
(`arkesoft_postgres-data`, `arkesoft_redis-data`, `arkesoft_meilisearch-data`,
`arkesoft_seaweedfs-data`). `infra:down` veriyi korur, `infra:reset` siler.

---

## Ortam değişkenleri

Tek doğruluk kaynağı iki dosyadır:

- [`.env.example`](../.env.example) — tüm değişkenler, geliştirme değerleriyle
- [`packages/config/src/env.ts`](../packages/config/src/env.ts) — Zod şeması

Yeni bir değişken eklerken **ikisini birlikte** güncelleyin. Şema uygulama
açılışında doğrulanır; eksik veya hatalı yapılandırma çalışma anında değil
açılışta okunur bir hatayla yakalanır.

```bash
pnpm env:check
```

Çıktıda parola, API anahtarı ve bağlantı adreslerindeki kimlik bilgileri
maskelenir — terminale veya CI loguna sır düşmez.

---

## Kod komutları

```bash
pnpm dev            # tüm uygulamaların geliştirme sunucuları
pnpm build          # tüm paketleri derle
pnpm lint           # ESLint (tip bilgisine dayalı, katı)
pnpm typecheck      # tsc --noEmit
pnpm test           # Vitest (v0.0.3'ten itibaren)
pnpm format         # Prettier ile biçimlendir
```

Tek pakete odaklanmak için:

```bash
pnpm --filter @arkesoft/api dev
pnpm --filter @arkesoft/config run typecheck
```

### API'yi çalıştırma (v0.0.4+)

NestJS API uygulaması:

```bash
pnpm --filter @arkesoft/api dev      # geliştirme, dosya izlemesi
pnpm --filter @arkesoft/api start    # üretim, `dist/main.js`
```

Ortam değişkenleri: `API_PORT` (3000), `API_HOST` (0.0.0.0), `LOG_LEVEL` (debug).

**Host adından tenant çözümü:** API, `Host` başlığından otomatik tenant çözümü yapar.
Geliştirmede `*.arkesoft.localhost` adresler tarayıcı tarafından `127.0.0.1` olarak
çözülür; `/etc/hosts` düzenlemeye gerek yok.

```bash
# Tarayıcıda: http://demo-magaza.arkesoft.localhost:3000
# veya curl'de:
curl http://demo-magaza.arkesoft.localhost:3000/health
# veya (lokal host başlığı testi):
curl -H 'Host: demo-magaza.arkesoft.localhost' http://localhost:3000/health
```

**Geliştirmede yalnızca:** `NODE_ENV=development` iken `x-arkesoft-tenant: <slug>` başlığı
ile tenant seçimi yapılabilir; üretimde bu başlık yok sayılır.

```bash
curl -H 'x-arkesoft-tenant: demo-magaza' http://localhost:3000/health
```

**İçeri:** `/health` ve `/health/ready` bilinmeyen host ile bile **200** döner
(allowlist korunur); diğer tüm uçlar tenant bağlamı gerektirir.

### Hata sözleşmesi ve log (v0.0.4+)

Tüm hata yanıtları aşağıdaki yapıyı taşır:

```json
{
  "code": "TENANT_NOT_FOUND",
  "message": "errors.tenant.notFound",
  "details": {},
  "requestId": "req_<uuid>"
}
```

- **`code`:** Makine okunur hata tanımlayıcısı (SCREAMING_SNAKE_CASE)
- **`message`:** v0.0.18'e kadar **i18n anahtarı** (Türkçe metin değil)
- **`details`:** Taliye verisi (doğrulama hataları `details.fields` altında)
- **`requestId`:** İstekte benzersiz kimlik (log korelasyonu için)
- **`context` alanı asla yanıta yazılmaz** — yalnızca server log'unda görülür

### tRPC uçları (v0.0.6+)

İlk tRPC prosedürleri `/trpc/*` yolunda çalışıyor:

```bash
# session.me — geçerli kullanıcı kimliği (üye kiracılar listesi değil)
curl http://demo-magaza.arkesoft.localhost:3000/trpc/session.me \
  -H "Cookie: __Secure-better-auth.session_token=..." \
  -H "Origin: http://panel.arkesoft.localhost:5173"

# tenant.current — geçerli kiracı özeti
curl http://demo-magaza.arkesoft.localhost:3000/trpc/tenant.current \
  -H "Cookie: __Secure-better-auth.session_token=..." \
  -H "Origin: http://panel.arkesoft.localhost:5173"
```

> **⚠ v0.0.7'den itibaren `Origin` panel host'u olmak zorunda.** `AUTH_BASE_URL` artık API'nin
> kendi portunu değil, panelin tarayıcıda gördüğü orijini taşıyor (ADR-0011 madde 2). Eski örnek
> (`Origin: http://localhost:5173`) bugün **403 `CROSS_SITE_REQUEST_REJECTED`** alır — `security`
> tur 2'nin teşhisi: _"K1'in 'sessiz 403 tuzağı'nın doküman kardeşi."_ Yukarıdaki `curl` örnekleri
> bu yüzden `http://panel.arkesoft.localhost:5173` kullanıyor.

**İstemci tarafında** tipleri `@arkesoft/trpc` paketinden alıyorsunuz:

```typescript
import { createTrpcClient, type RouterOutputs } from '@arkesoft/trpc'

const client = createTrpcClient({
  url: 'http://localhost:3000/trpc',
})

const tenant = await client.tenant.current.query()
// tenant tipi RouterOutputs['tenant']['current'] ile otomatik kontrol edilir
```

**Batching kapalıdır** — `httpLink` kullanılır, `httpBatchLink` değil. Gerekçe: public
prosedürlerin kimlik muafiyeti **tam yol eşleşmesiyle** verilir (`AUTH_EXEMPT_PATHS`);
batch istekte tek HTTP yolu birden fazla prosedürü taşıyabilir ve muafiyeti sessiz
kılabilir. (Bkz. ADR-0009 madde 8.)

**Test:** `pnpm --filter @arkesoft/trpc test` hem çalışma zamanı hem tip testlerini koşar
(`vitest --typecheck` açık). Paket izole olarak hermetic koşur — Redis/Postgres bağımlılığı
yok.

Tüm istekler pino yapılandırılmış log'a yazılır:

```json
{
  "level": "info",
  "time": "2026-10-26T09:12:33.001Z",
  "service": "api",
  "version": "0.0.4",
  "requestId": "req_01J...",
  "method": "GET",
  "path": "/products",
  "statusCode": 200,
  "tenantId": "tnt_01J...",
  "durationMs": 42
}
```

`GET /health` istekleri `tenantId` alanı **içermez** (bilinmeyen host'ta çözülmez).

### ⚠️ v0.0.4'ün Güvenlik Özü: Tenant İzolasyonu

**v0.0.4 ile uygulama katmanı, tenant izolasyonunun TEK savunma hattı oldu.**

RLS politikaları v0.0.13'te geliyor. Bu pencerede `TenantContextMiddleware`,
`TenantGuard` ve `getTenantContext()` zincirindeki bir hata **doğrudan çapraz tenant
veri sızıntısıdır** ve veritabanı bunu yakalamaz.

`apps/api/src/tenancy/**` ve `src/request-context/**` değiştirilirken:

1. `src/__tests__/resolve-host.test.ts` (35+ vaka) — tüm host normalizasyonu ve
   saldırı vektörleri kapsamlı biçimde test edilmeli
2. `src/__tests__/tenant-exempt-paths.test.ts` — allowlist (`/health`, `/health/ready`)
   değişmesi algılanmalı
3. `src/__tests__/concurrency.test.ts` (20 eşzamanlı istek) — ALS sızıntısı, shared
   mutable state ve child logger karışması testsiz kalmamalı

Bu üç test **mutlaka yeşil** kalmalıdır.

**Üretim notları:**

- `X-Forwarded-Host` başlığı **okunmaz** (`trust proxy` kapalı) — proxy allowlist'i
  olmadan herkes tenant seçebilir. Üretim ingress'i `Host` başlığını **korumak
  zorundadır**.
- Servis-servis çağrılarda (v0.0.5+), güvenilir bir belirteç mekanizması kurulacak.

**Bir sürümü kapatmadan önce geçmesi zorunlu kapı:**

```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm format:check
```

---

## Veritabanı komutları (v0.0.3+)

Komutlar yalnızca yerel geliştirme veritabanına karşı çalışır. Yıkıcı işlemler allowlist'li guard'dan geçer.

### Bootstrap sırası (v0.0.13+)

v0.0.13'ten itibaren rolü ayrımı zorunludur. **Kurulum sırası kesin:**

```bash
pnpm infra:up       # Postgres ve diğer servisler ayağa kalk
pnpm db:bootstrap   # Roller oluştur (arkesoft_migrator, arkesoft_app)
pnpm db:deploy      # Migration'ları uygula (RLS politikaları dahil)
pnpm db:bootstrap   # Roller ayrımını yakınsat (defter REVOKE'u uygula)
pnpm db:seed        # Demo veri yükle
```

**Bu sıraya uymamak niye önemli?**

- `db:bootstrap` (1. kez) olmadan: `DATABASE_URL` hâlâ boş admin rolünü gösterir; `db:deploy`
  başarısız olur
- `db:deploy` olmadan: RLS politikaları yok; izolasyon garantisi yok
- `db:bootstrap` (2. kez) olmadan: `_prisma_migrations` tablosu yok olduğu için deftere yazma
  ayrıcalığı kısıtlanmaz (`arkesoft_app` INSERT yapabilir kalır)
- `db:seed` ön sıraya alınamaz: tohum tablodan (`tenant`) okuduğu için migration'lar
  gerekli

**İkinci bootstrap niye gerekli?**

`bootstrap-roles.sql`'deki `REVOKE` komutu `_prisma_migrations` tablosu üzerinde `IF EXISTS`
şartlı çalışır. İlk `db:bootstrap` çağrısında bu tablo henüz yok (sonraki `db:deploy` adımında
oluşturulur), bu yüzden REVOKE no-op'dur. Sonuç: `arkesoft_app` deftere gerekli olmayan yazma
erişimi **alır**. Düzeltme `db:deploy`'dan sonra `db:bootstrap`'i tekrar çalıştırmak —
dosya idempotent olduğu için güvenli, bu kez tablo var olduğu için REVOKE gerçekten **uygulanır**.
Ayrıntı: `.github/actions/prepare-db/action.yml` satırlarında `bootstrap` → `deploy` → `bootstrap` → `seed` sırası CI'da zaten uygulanıyor.

**Mevcut geliştirici için geçiş** (v0.0.12 ve öncesi):

`.env` dosyasına yeni değişken ekleyin:

```bash
DATABASE_MIGRATION_URL="postgresql://arkesoft_migrator:arkesoft_migrator_dev_only@localhost:5432/arkesoft"
```

(`arkesoft_migrator` parolası `packages/db/sql/bootstrap-roles.sql` dosyasının "Roller — yoksa oluştur" bölümünde tanımlanır (`CREATE ROLE arkesoft_migrator LOGIN PASSWORD` satırı). Dev-only'dir.)

`pnpm env:check` hata verirse, `.env.example`'i kontrol edin.

#### Rol parolası kısıtlı özellikleri

Bağlantı dizesinde (URL) kullanılan parola **URL-güvenli** olmalıdır. Şu karakterler
sorun çıkabilir: `@`, `:`, `/`, `?`, `#`, `[`, `]`, `%`. Dev parolaları literal
(`arkesoft_app_dev_only`, `arkesoft_migrator_dev_only`) URL-güvenlidir; bu değerleri
değiştirirseniz bağlantı dizesini test edin.

### Allowlist ve güvenlik

Yıkıcı komutlar (`db:push`, `db:reset`, `db:seed`, `migrate dev`, `migrate reset`, `studio`) guard'lı sarmalayıcıdan (`run-guarded-prisma`) geçer:

**Host kontrolü:** Yalnızca `localhost`, `127.0.0.1`, `::1` izin verilir. Uzak hostname'e karşı çalışmak reddedilir.

**`NODE_ENV` kontrolü:** Varsayılan-reddet politikası. Yalnızca `undefined`, `development`, `test` değerleri geçer; `staging`, `production` ve diğer tüm değerler reddedilir.

**Kaçış kapısı:** `ARKESOFT_CONFIRM_DESTRUCTIVE` ortam değişkeni hedef veritabanı adına
**birebir eşit** olmalı. Örneğin, `ARKESOFT_CONFIRM_DESTRUCTIVE=arkesoft` yerel
`arkesoft` veritabanına `db:reset` çalıştırır. Yanlış değer veya boş dize reddedilir.
**Kapı, üretim açısından çoklu katman savunmasının bir parçasıdır; birinci savunma
kimlik bilgisi ayrımıdır (geliştirici kabuğunda üretim `DATABASE_URL` bulunmaması).**

**Guard kapsamı:** Guard **repo script yüzeyini** korur, keyfi çağrıları korumaz.
`pnpm exec prisma db push --url=…` ve `npx prisma …` guard'sızdır. Üretim kazasına
karşı gerçek savunma v0.0.13'ün rol ayrımı (uygulama rolü `NOSUPERUSER`,
`NOBYPASSRLS`) ve v0.0.12 CI sırlarıdır. **Guard bir hız kesicidir, izolasyon sınırı
değildir.**

### Açık script'ler (guard'lı ve guard'sız)

- `db:generate` — Prisma istemcisi oluştur (DB'ye bağlanmaz, güvenli)
- `db:migrate` — `prisma migrate dev` (geliştirme, shadow DB oluşturma, **sarmalı**)
- `db:deploy` — `prisma migrate deploy` (üretim, migration'ları uygula, **sarmalı** — v0.0.13'ten itibaren `DATABASE_MIGRATION_URL` ile migrator rolü üzerinden)
- `db:verify` — doğrulama (`prisma validate`, `format --check`, `migrate diff`)
- `db:bootstrap` — roller provisioning (`arkesoft_migrator`, `arkesoft_app`, sahiplik, grant)

### Üç kademeli geri alma (v0.0.13+)

RLS ve rol ayrımını tam geri almak istiyorsanız, sırayla uygulayın:

#### 1. Politika korumasını kaldır

```bash
psql "$DATABASE_MIGRATION_URL" -c 'ALTER TABLE "tenant_membership" NO FORCE ROW LEVEL SECURITY;'
```

Bu adımdan sonra `ENABLE` hâlâ aktif; boş tenant context'te sorgu **0 satır** döner (hata değil).

#### 2. RLS devre dışı bırak

```bash
psql "$DATABASE_MIGRATION_URL" -c 'ALTER TABLE "tenant_membership" DISABLE ROW LEVEL SECURITY;'
```

Politika nesneleri korunur; **0 satır** yerine **tüm satırlar** döner (izolasyon kapanır).

#### 3. Provisioning geri al (opsiyonel — Pulumi/Helm üretim sürümü gerekli)

Üretimde Pulumi script'ine taşındığı için yerel geri alma Pulumi/Helm'de tanımlanır. Yerel
geliştirmede bootstrap'i terslemek istiyorsan, `packages/db` dizininden:

```bash
cd packages/db
DATABASE_URL="$DATABASE_BOOTSTRAP_URL" pnpm exec prisma db execute \
  --file sql/rollback-roles.sql
```

**Neden `DATABASE_URL` öneği:** `prisma db execute` bağlantı URL'sini `prisma.config.ts`'den
(`env('DATABASE_URL')`) okur (`--url` bayrağı **yoktur**). SQL sahiplik devri (`ALTER
TABLE … OWNER TO`) ve `REVOKE` yapıyor — bootstrap süper kullanıcısı gerekir. Çevresel
önek, `arkesoft_app` rolü yerine bootstrap URL'sini işleme geçirir.

**`db:rollback-roles` npm script'i yoktur.** Doğrudan `pnpm exec` ile çağırılmalı.

Bu komut bootstrap adımının etkisini geri alır: sahipliği `arkesoft` rolüne devirir, `GRANT`
ve `ALTER DEFAULT PRIVILEGES`'i iptal eder. **`DROP ROLE` YAPILMAZ** — roller küme
seviyesinde yaşar, silme bu script'in kapsamının dışındadır (bkz. ADR-0007, K-E2).

**Uyarı:** Her adım `pnpm test:isolation`'ı kırmızıya düşürür — bu bilinçli tasarım. Kapatma bir
işlem değildir, imkânsızlığın adımlarıdır.

### `withTenant()` kullanımı

Tenant context kütüphanesi (`packages/db/src/tenant-context.ts`) RLS politikalarının okuduğu Postgres GUC'u (`app.tenant_id`) çalışma zamanında ayarlar:

```typescript
import { withTenant } from '@arkesoft/db'
import { tenantDatabase } from './db' // createPrismaClient() ile oluşturulan istemci

// Tenant bağlamında veri oku/yaz
const orders = await withTenant(tenantDatabase, 'tenant-slug', async (tx) => {
  return tx.order.findMany() // RLS politikası tenant_id = 'tenant-slug' filtresi otomatik uygular
})
```

**Kurallar:**

- `withTenant()` ham `prisma.*` istemciyle çalışmaz; `createPrismaClient({ tenantContextSetting: 'app.tenant_id' })` ile oluşturulmuş istemci **gerekli**.
- Callback içinde `$transaction` çağrısı **yapılamaz** (imkânsız — callback'e verilen `tx` `$transaction` metodu taşımaz).
- Platform seviyesi tablolar (`tenant`, `app_user`) context'siz okunabilir; tenant filtresi uygulanmaz.

### Katalog linter ve yeni tablo ekleme

v0.0.13'ten itibaren yeni bir tenant'a bağlı tablo eklendiğinde şema linter'ı (`pnpm test:isolation`) otomatik RLS politikasını ve indeksi zorunlu hale getirir.

**Yeni tablo akışı:**

1. Prisma şemasına tablo ekle (`schema.prisma`): `tenant_id` kolonu (`String`, `NOT NULL`) + indeks `@@index([tenant_id])` veya `@@unique([tenant_id, ...])`.
2. `pnpm db:migrate --name <açıklama>` ile migration oluştur.
3. `src/tenancy.ts`'teki `TENANT_SCOPED_TABLES` dizisine tablo adı ekle.
4. `pnpm test:isolation` çalıştır — linter bu tabloyu otomatik kontrol eder ve RLS politikası bulunmazsa **FAIL** verir.
5. `migration.sql`'ye RLS `ENABLE`, `FORCE`, `CREATE POLICY` yaz (bkz. `packages/db/prisma/migrations/20261028153016_rls_tenant_isolation/migration.sql` şablonu).

Linter 20 kuralla tüm izolasyon şartlarını kontrol eder: tenant_id tipi, indeks, RLS, politika, rol yetkileri vb.

### Mevcut volume üzerinde geçiş (AC8)

Postgres container'ı mevcut verilerle yeniden başlatıldığında (eski `arkesoft` volume'u var) `/docker-entrypoint-initdb.d` script'leri **çalışmaz** (Postgres sadece boş veri dizininde init script'lerini çalıştırır).

`pnpm db:bootstrap` bu durumda gerekli: dolu veritabanı üzerinde idempotent rol kurulumunu çalıştırır. Koşturucu:

1. `.env` dosyasını okur (`DATABASE_BOOTSTRAP_URL`, yoksa `DATABASE_URL` kullanır).
2. `packages/db/sql/bootstrap-roles.sql`'i çalıştırır (idempotent: varolan roller tutulur, yeni roller oluşturulur).
3. Mevcut sahipliği `arkesoft_migrator`'a devrir.

Bundan sonra `pnpm db:deploy` ve `pnpm db:seed` normal akışta çalışır.

---

## Bilinmesi gereken tuzaklar

### `localhost` yerine `127.0.0.1`

Konteynerlerin `/etc/hosts` dosyasında `localhost` hem `::1` hem `127.0.0.1`
olarak tanımlı. Meilisearch ve SeaweedFS yalnızca IPv4 dinlediği için
konteyner içinden `localhost` kullanan HTTP çağrıları "connection refused"
alır. Compose healthcheck'leri bu yüzden `127.0.0.1` kullanır.

### Postgres collation Türkçe değil

Veritabanı seviyesinde `tr-TR` collation **bilinçli olarak** ayarlanmadı.
Türkçe collation noktasız `ı` / noktalı `i` karşılaştırmasını değiştirir;
`LOWER()` tabanlı aramalarda ve unique kısıtlarında beklenmeyen sonuçlar
doğurur. Türkçe sıralama gereken yerlerde (ürün adı listeleri) kolon veya
sorgu seviyesinde `COLLATE` uygulanacak — ROADMAP v0.4.0.

### `*.localhost` alt alan adları

`APP_BASE_DOMAIN=arkesoft.localhost` ayarıyla `demo.arkesoft.localhost` gibi
adresler tarayıcılar tarafından otomatik `127.0.0.1`'e çözülür; `/etc/hosts`
düzenlemeye gerek yoktur. Tenant'ın host adından çözülmesi v0.0.8'de gelecek.

### S3 `ListBuckets` boş döner

SeaweedFS yalnızca kimliği doğrulanmış kullanıcının bucket'larını listeler;
anonim erişimde `GET /` boş `<Buckets>` döner. Bucket içi listeleme
(`GET /arkesoft-dev?list-type=2`) ve nesne işlemleri normal çalışır.
Uygulama kodu `ListBuckets` çağırmaz — bucket adı yapılandırmadan gelir.
Ayrıntı: [ADR-0005](./adr/0005-yerel-s3-depolama.md).

### Veritabanı guard'ı ve derleme tazeliği

`pnpm db:push` ve `pnpm db:reset` guard'lı sarmalayıcıdan geçer ve `dist/` olmadan çalışırsa `ERR_MODULE_NOT_FOUND` ile fail-closed davranış gösterir. Guard kodu derlenmiş halden çalışır; kaynak değişti ama `dist/` güncellenmemişse:

```bash
pnpm --filter @arkesoft/db run build
```

Bu durumu çözer. Turbo cache bayat dosya tutabilir; yeniden derleme için:

```bash
pnpm --filter @arkesoft/db run clean  # dist/ + dist/generated sil
pnpm db:generate                       # prisma client yeniden üret
pnpm --filter @arkesoft/db run build   # guard derle
```

**`--name` charset sınırlaması:** `migrate dev --name <ad>` bayrak değeri `/^[a-z0-9_]{1,64}$/` regex'ini izlemek zorunda. Prisma'nın kabul ettiği kümeden daha dar (büyük harf, boşluk, ekli çizgi yasak). Detayı ROADMAP v0.0.3 → Teknik Borç (T2-2).

### Redis örneği tuzağı (v0.0.7+)

API, Docker konteyneri `arkesoft-redis`'i **değil**, bu makinede ayrıca ayakta duran **homebrew
`redis-server`**'ı (`127.0.0.1:6379`) kullanabilir. Sebep: homebrew'in loopback'i **spesifik**
tutması, Docker'ın `*:6379`'u kaybetmesine yol açar. Sayaç okuyan (oran sınırı, önbellek) herkesi
yanıltır — "neden sıfırlamadığım sayaç hâlâ dolu" gibi sorularda önce `lsof -nP -iTCP:6379
-sTCP:LISTEN` ile hangi sürecin dinlediğini doğrulayın (`qa` keşfetti, `security` doğruladı).

### Vite dev sunucusu config tuzağı (v0.0.7+)

> Vite'ın HMR'ı modül kodundaki değişiklikleri yakalar, **`vite.config.ts`'teki değişiklikleri
> yakalamaz**. `server.host`, `allowedHosts`, `cors` gibi bir ayar değiştirildiğinde elle
> başlatılmış `vite --port <port> --strictPort` süreci **eski config ile çalışmaya devam eder** —
> bir sonraki ajan (`qa`/`wcag`) farkında olmadan güncelliğini kaybetmiş bir sunucuyu ölçer. Kural:
> `vite.config.ts`'e her değişiklikten sonra çalışan dev sunucusu kapatılıp yeniden başlatılmalı;
> PID'i bilmiyorsan `lsof -nP -iTCP:<port> -sTCP:LISTEN` ile bul. `--strictPort` bağlantı
> çakışmasını yakalar ama "hangi config servis ediliyor" sorusunu yakalamaz.

(Kaynak: S1 ölçümü, T-008. Gerçek bir olay: Orkestratör 13:42'den beri ayakta duran bir `vite`'ı
kapatmak zorunda kaldı çünkü bir önceki değişiklik turundan önceki yapılandırmayı servis ediyordu.)

### `turbo.json` ve `VITE_*` (v0.0.7+)

`turbo.json`'un `env` listesi bugün `VITE_*` içermiyor; panel **bilinçli olarak** hiçbir `VITE_*`
değişkeni kullanmıyor (tek orijin topolojisinde API adresi **göreli**: `url: '/trpc'`). İleride
bir `VITE_*` eklenirse `turbo.json`'un `env`'ine **eklenmeli**, yoksa cache yanlış değerle gömülü
bir derlemeyi servis eder. `envDir` repo köküne **işaret etmiyor** (bilinçli: kök `.env`'in
sırları Vite'ın görüş alanına hiç girmiyor). `ARKESOFT_PANEL_DEV_API_TARGET` **`VITE_` öneki
taşımıyor** → bundle'a asla inline edilmez. Ayrıntı: "Panel (`apps/admin`) Geliştirme" bölümü.

### `apps/api` dev script'i artık `.env`'i otomatik yükler (v0.0.7+)

Ayrıntı: "Panel (`apps/admin`) Geliştirme" bölümü, "Panel geliştirme akışı" altında.

---

## Sorun giderme

| Belirti                                   | Çözüm                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm infra:up` port çakışması veriyor    | `.env` içindeki `*_PORT` değerlerini değiştirin                                                                          |
| Bir servis `unhealthy` kalıyor            | `pnpm infra:logs` ile logu okuyun; `docker inspect <container> --format '{{range .State.Health.Log}}{{.Output}}{{end}}'` |
| `pnpm env:check` hata veriyor             | Mesajdaki değişken adlarını `.env.example` ile karşılaştırın                                                             |
| Veri bozuldu, sıfırdan başlamak istiyorum | `pnpm infra:reset`                                                                                                       |
| `pnpm install` peer bağımlılık hatası     | `.npmrc` içinde `strict-peer-dependencies=true`; hata gerçek bir uyumsuzluğu gösterir, bastırmayın                       |
| ESLint "file not found in project"        | Dosya bir `tsconfig.json`'ın `include`'u dışında; ilgili pakete ekleyin                                                  |

---

## Branch Koruması Önerileri (v0.0.12+)

CI mimarisi `ci-gate` adlı tek bir aggregate check'i raporlar. GitHub tarafındaki branch
koruması **bu önerileri takip ederse** iman doğru yerde tutulur.

> **Önemli:** Aşağıdaki ayarlar **önerildir ve uygulanması kullanıcı eylemidir**. v0.0.12 dokümandadır
> ama GitHub repository ayarlarına uygulanmamıştır. Uygulamak için GitHub repo Settings →
> Branches → Branch protection rules gidin.

### Önerilen Yapılandırma

| Ayar                                                   | Değer     | Gerekçe                                                                                                                                                                                                                                |
| ------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Required status checks**                             | `ci-gate` | Dört bağımsız hat (`api`, `admin`, `superadmin`, `storefront`) + `shared` hattının sonucunu **single aggregate check** toplayıcısı raporlar. İzolasyon attığında `ci-gate` o job'u atlar (skipped), başka hat kırmızıysa kırmızı olur. |
| **Require branches to be up to date**                  | ✓         | Merge öncesi base (`main`) ile resync. GitHub Actions secrets'a erişim (version PR için).                                                                                                                                              |
| **Require code reviews**                               | 1 onay    | Tekil review (kurucular kendi PR'larını merge edebilir; kurucudan sonra ekip büyüdüğünde artırılabilir).                                                                                                                               |
| **Require status checks to pass**                      | ✓         | `ci-gate` exit 0 olmadan merge yok.                                                                                                                                                                                                    |
| **Require conversation resolution**                    | ✓         | Review yorum'ları sonuç gerektir.                                                                                                                                                                                                      |
| **Include administrators**                             | ✓         | Kural'lar herkese uyar (kurucuların dahi).                                                                                                                                                                                             |
| **Restrict who can push to matching branches**         | —         | Bir kurucuyu seçerse onun haricinde kimse `main` push yapamaz. Monorepo toplu değişikliği daha emniyetli.                                                                                                                              |
| **Dismiss stale pull request approvals**               | ✓         | Yeni push sonrası approval'lar geçersiz; yeniden review zorunlu.                                                                                                                                                                       |
| **Require approving reviews to dismiss before pushes** | ✓         | Approval'ları geri alan push'lar sonra review gerektir.                                                                                                                                                                                |
| **Require a pull request before merging**              | ✓         | `main`'e **doğrudan push'u engeller** — `CLAUDE.md` §10 madde 20'nin ("`main` dalına doğrudan push yapmak") GitHub tarafındaki karşılığı. Her değişiklik PR üzerinden gider.                                                           |
| **Allow force pushes**                                 | kapalı    | **Force-push'u engeller** — geçmişin yeniden yazılmasını ve gözden geçirilmiş commit'lerin sessizce değiştirilmesini önler.                                                                                                            |

### Ek İhtiyaçlar

1. **GitHub Actions etkinleştirilmesi:** Repository Settings → Actions → genel olarak **etkin** olmak zorunda.
2. **PR sürüm PR'ı açma izni:** Settings → Actions → General → Workflow permissions → **"Allow GitHub Actions to create and approve pull requests"** seçilmek zorunda (`release.yml`'ın sürüm PR'ı açabilmesi için).
3. **`ARKESOFT_RELEASE_TAGGING` repo değişkeni:** Henüz tanımsız; ilk gerçek sürümde `enabled` yapılacak. Şu an `release.yml` tag atma adımı `skipped` kalır (iş akışı çalışır ama tag atılmaz).

### Kanonik Sürüm Komutu

PR merge'lendikten sonra sürüm tarafı otomatik. Yerel testler:

```bash
pnpm release:version  # changeset → sürüm yükselt → CHANGELOG güncelle + platform sürümü senkronize
```

**DİKKAT:** ~~`pnpm changeset version`~~ tek başına kullanma — kök sürümünü senkronlamaz.

---

## Kimlik Doğrulama (v0.0.5+)

### Zorunlu Ortam Değişkenleri

v0.0.5 ile Better Auth entegrasyonu iki **yeni zorunlu** ortam değişkeni getiriyor:

- **`BETTER_AUTH_SECRET`** — en az 32 karakter, rastgele bir dize (oturum şifrelemesi için)
- **`AUTH_BASE_URL`** — tam URL biçimi, ör. `http://panel.arkesoft.localhost:3000`

Olmadığında `apps/api` açılışta **fail-fast** hatası verir — sessizce başlamaz. `.env.example` dosyasından değerleri kopyalayarak `.env`'yi güncelleyin.

### E-posta Doğrulama Akışı (Mailpit)

Kayıt sırasında `POST /auth/sign-up/email` uç doğrulama e-postası gönderir. Mailpit yakalıyor:

1. **E-postayı HTTP API üzerinden oku:**

   Doğrulama e-postasının tam gövdesini alıp içindeki URL'yi çıkart:

   ```bash
   curl http://localhost:8025/api/v1/message/$(curl http://localhost:8025/api/v1/messages | jq -r '.messages[0].ID') | jq -r '.Text' | grep -oE 'https?://[^[:space:]<>"]+'
   ```

   Adım adım: son mesajı listele (`/api/v1/messages`), ID'sini al, tam gövde ile oku (`/api/v1/message/{id}`), `Text` alanından ilk URL'yi çıkart.

2. **Token parametresini al** ve doğrulama ucuna gönder:

   ```bash
   curl -X GET 'http://localhost:3000/auth/verify-email?token=<token-parametresi>'
   ```

3. Yanıt 200 ise doğrulama tamamlandı; ardından giriş yapabilir.

Mailpit arayüzü (`http://localhost:8025`) de HTML'den her e-postayı görebilir.

### E-posta Gönderilemedi — Kurtarma Yolu

Kayıt sırasında SMTP hatası meydana gelirse (Mailpit down vb.) `POST /auth/sign-up/email` **2xx** döner — istek başarılı olur ve kullanıcı satırı **veritabanında oluşur**, ama e-posta **gönderilmez**. Belirti yalnızca logda görülür: `causeCode: "MAIL_DELIVERY_FAILED"` + `providerResponseCode` ve `providerErrorCode` alanları. Yeniden kayıt denemesi de **2xx** döner ve ikinci bir satır **oluşturmaz** (varlık sızdırmazlığı, A3 kararı).

**Kurtarma:** `/auth/send-verification-email` ucuna POST yaparak doğrulama e-postasını yeniden gönderin. Bu uç **kimlik doğrulaması gerekmez** (allowlist'te) ve oturum olmadan çağrılabilir. Payload:

```json
{
  "email": "kullanici@example.com"
}
```

### Oran Sınırı Sıfırlanması

Kimlik doğrulama uçlarında oran sınırlaması vardır:

- **Giriş:** `5 başarısız/15dk` hesap başına, `20/15dk` IP başına
- **Şifre sıfırlama, kayıt ve doğrulama e-postası:** `3/saat` e-posta başına, `10/saat` IP başına

Meşru bir kullanıcı kilitlenmişse Redis sayaçlarını sıfırlamak için:

```bash
redis-cli --scan --pattern 'platform:auth:*' | xargs redis-cli DEL
```

Tüm auth sayaçlarını temizler. **Eşik değerleri** modül sabitleridir ve ortam değişkeni ile değiştirilemez — tasarım gereği (CLAUDE.md §4.4, K3 kısıtlaması).

### Log Olayları

Kimlik doğrulama uçlarından üretilen log olayları ve beklenen alanlar:

| Olay                          | level | requestId | userId | tenantId | Açıklama                                                                                                                        |
| ----------------------------- | ----- | --------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `e-posta gönderildi`          | info  | ✓         | —      | —        | Doğrulama e-postası göndermesi başladı. `userId` ve `tenantId` bu aşamada henüz yok (hesap henüz kimliksiz, platform seviyesi). |
| `kullanıcı kaydı oluşturuldu` | info  | ✓         | ✓      | —        | Hesap oluşturuldu ve doğrulandı; `userId` var. `tenantId` henüz yok (kiracı bağlantısı daha sonra).                             |
| `giriş başarılı`              | info  | ✓         | ✓      | —        | Oturum başladı; `tenantId` kimlik doğrulama uçlarında olmaz (kiracı bağlamı `/auth/*` dışında kurulur).                         |
| `giriş başarısız`             | warn  | ✓         | —      | —        | Geçersiz kimlik bilgileri. `emailMasked` alanı maskelenen e-postadır (ör. `z***@arkesoft.test`).                                |

**Not:** `tenantId` kimlik doğrulama uçlarında (`/auth/*`) hiçbir zaman var olmaz — oturum açıncaya kadar kiracı bilinmez. `requestId` tüm işaretler tarafından yapılır; `traceId` OpenTelemetry v0.0.17'de eklenecek.

### `AUTH_TRUSTED_PROXY_COUNT` Uyarısı

Oran sınırlaması IP başına da sayılır. Kubernetes ingress arkasında API çalışıyorsa **`X-Forwarded-For` başlığı okunmalı**:

- **`AUTH_TRUSTED_PROXY_COUNT=0`** (varsayılan) — XFF yok sayılır; soket adresi kullanılır → **global kilit** (tüm istekler aynı IP'den görünür, milyonların denenmesi bloke edilir)
- **`AUTH_TRUSTED_PROXY_COUNT=1`** — XFF'in (virgüllerle ayrılmış) liste içinde, `length - 1` indeksli öğe okunur (Express'in `trust proxy: 1` semantiğiyle eş değer).
- **Yanlış ayar en sık: üretimde 0 bırakılması.** v0.18.0 ingress tanımı bunu doğru ayarlamak **zorundu** tutacak

### İçerik Anahtarları Kaydı

E-posta mesajları `apps/api/src/auth/mail/messages.ts`'te tanımlanmış anahtar-metin eşlemesiyle yönetilir. İçerik anahtarları:

- `auth.emailVerification` — doğrulama e-postası
- `auth.passwordReset` — şifre sıfırlama e-postası

**PM riski 5:** `packages/i18n` modülü v0.0.18'de geliyor. Bu anahtarlar v0.0.18 öncesinde **bu dosyada kalır**; migrasyon sırasında birebir `packages/i18n` kataloguna taşınmalıdır. Aksi takdirde ilk sürümde e-postalar **boş içerik gönderir**.

### ⚠️ Tohumlanmış Kullanıcı Giriş Yapamaz

`pnpm db:seed` komutu demo bir kiracı ve üye oluşturur, ancak Better Auth `account` satırı **üretmiyor**. Sonuç: demo kullanıcı (`demo-yonetici@arkesoft.test`) giriş **başarısız** olur (kimlik bilgileri oluşturulmamışsa giriş uç noktası başarısız olur).

**Giriş için:** panel'de "Kaydol" ucu üzerinden kayıt yapmanız veya administratif olarak `account` satırı `prisma.account.create()` ile oluşturmanız gerekir. Seed enhancement v0.0.6 veya v0.0.7'de planlanmıştır.

### IP ve User-Agent Takibi (v0.0.5+)

Better Auth kütüphanesi yapılandırmasında `ipAddress.disableIpTracking: true` ayarı etkinse, `session` tablosu `ipAddress` ve `userAgent` kolonlarına **boş dize** (`''`) yazılır. Sütunlar `NULL` değil **boş string** taşır (417+ kayıtlı oturumda `length=0` değeri). KVKK açısından sorun yok (kişisel veri saklanmıyor) ama **"kolonu takip et / bırak"** sorusu **`IS NULL` ile cevaplanamaz** — v0.0.15'te normalizasyon planlanmıştır. İçinde migration **gerekmez** (`ALTER` sadece `DEFAULT` ekler).

### Literal-Token Tuzağı Uyarısı

Sürüm PR'ı, branch koruması ve tag atma scriptleri grep arama tarafından doğrulanır. Grep
kontrol **kendi metninde aranan jeton'u sözcüğün bazında bulursa** (ör. kontrol `pull_request`
yasağını arar ama iş akışı başlığında `pull_request` geçerse) → kalıcı hata, her PR sürekli
başarısız.

Kontrol metinleri:

- `ci.yml:191` — toplayıcı check liste validator'i
- `.github/ci-forbidden-tokens.txt` — aranan yasak jeton'lar

Değişiklik yapılırsa jeton'lar kendi dosyada izole (`.txt`) ve iş akışı glob'larından (`*.yml`) dışarı.

---

## Panel (`apps/admin`) Geliştirme (v0.0.7+)

### `AUTH_BASE_URL` göçü — tek orijin topolojisi (ADR-0011)

v0.0.7 ile `AUTH_BASE_URL`'in anlamı keskinleşti: artık **API'nin kendi portu değil, panelin
tarayıcıda gördüğü platform orijini**. Değer `.env.example:120`'de `:3000` → `:5173` olarak
değişti:

```bash
# v0.0.6 ve öncesi:
AUTH_BASE_URL=http://panel.arkesoft.localhost:3000
# v0.0.7'den itibaren:
AUTH_BASE_URL=http://panel.arkesoft.localhost:5173
```

Mevcut `.env` dosyanızda bu satırı **elle** güncellemeniz gerekir — `pnpm env:check` yalnızca
`.env`'i doğrular, `.env.example`'daki değişiklik otomatik yansımaz. Güncellemezseniz panel
girişi **sessizce 403** alır (`same-origin.guard.ts` ve Better Auth'un kendi origin kontrolü
`AUTH_BASE_URL`'e karşı karşılaştırır) — belirti "giriş çalışmıyor"tur, hata mesajı net değildir.

**Port, `apps/admin/src/app/panel-config.ts:20`'deki `PANEL_DEV_PORT` sabitiyle birebir aynı
olmak zorunda** (bugün `5173`); sapma aynı sessiz 403'ü üretir. `panel-origin-pin.test.ts`
`.env.example`'daki portun bu sabite eşitliğini pinler.

**Geri alma:** `AUTH_BASE_URL`'i `:3000`'e döndürüp API'yi yeniden başlatmak yeterlidir —
şema/migration rollback'i gerekmez (ADR-0011 "Geri alma" notu). Tarayıcıdan panel üzerinden giriş
bu durumda yine 403 alır (beklenen); API dışı istemciler (komut satırı, `curl`) etkilenmez.

### Panel geliştirme akışı

```bash
pnpm infra:up                                  # Postgres, Redis, Meilisearch, SeaweedFS, Mailpit
pnpm db:migrate
pnpm db:seed
pnpm --filter @arkesoft/api dev                # API, panelin vekillediği /trpc + /auth
pnpm --filter @arkesoft/admin dev               # Vite dev sunucusu, panel.arkesoft.localhost:5173
```

**İlk kurulumda zorunlu ek adım** (Playwright henüz kurulu değilse):

```bash
pnpm exec playwright install chromium
```

`pnpm --filter @arkesoft/admin test:e2e` bu adım atlanırsa tarayıcı ikili dosyası bulunamadığı
için başarısız olur. `pnpm test:e2e` (kök toplayıcı) **v0.0.19'dan itibaren** gelir; bu sürümde
yalnızca **paket düzeyinde** `pnpm --filter @arkesoft/admin test:e2e` vardır — tek proje (chromium,
masaüstü), tek spec, yerel koşum (bkz. `AGENT_BASELINE.md` komut referansı).

**`apps/api`'nin `dev` script'i `.env`'i artık otomatik yükler** (`apps/api/package.json:26`:
`node --watch --env-file-if-exists=../../.env dist/main.js`) — panel geliştiricisi `AUTH_BASE_URL`
gibi değişkenleri elle `source` etmek **zorunda değildir**. Kök neden: script `apps/api`
dizininde koştuğu için göreli `.env` yolu önceden kök `.env`'i değil `apps/api/.env`'i arıyordu
(S1 ölçtü: _".env not found" + 17 Zod hatası_); `--env-file-if-exists=../../.env` ile düzeltildi.
`start` (prod) script'ine **dokunulmadı** — prod'da env orkestrasyondan/secret yöneticisinden
gelir.

### Üretilmiş dosyalar ve gate muafiyetleri

Platformda bugün **iki** üretilmiş (derleme zamanında yeniden yazılan) kaynak dosyası vardır:
Prisma istemcisi (`packages/db`, bkz. [ADR-0001](./adr/0001-teknoloji-yigini.md)) ve
`apps/admin/src/routeTree.gen.ts` (`@tanstack/router-plugin` tarafından **her `vite build`'de**
yeniden yazılır).

`routeTree.gen.ts` **üç** yerde elle tutulan bir muafiyete sahiptir:

- `.prettierignore:22` — `apps/admin/src/routeTree.gen.ts`
- `apps/admin/eslint.config.mjs:49` — `{ ignores: ['src/routeTree.gen.ts'] }`
- `apps/admin/tsconfig.json:20` — dosya `include`'un **İÇİNDE** kalır (`"include": ["src/**/*",
"e2e/**/*", "scripts/**/*", "*.config.ts"]`); `typecheck` kapsamı **daraltılmaz**.

**Muafiyetin kapsamı yalnızca üretilmiş dosyaya aittir** — elle yazılmış kaynak taramaları (`any`,
`@ts-ignore`, `console.log`, sınıf bileşeni) bu dosyayı **kapsamaz** ve elle yazılmış koda
**genişletilemez**.

**Risk kaydı (architect, T-008 düzeltme turu 1 — birebir):**

> `routeTree.gen.ts` proje dışına karantinaya alınmaz (`include`'da kalır), ancak upstream'in
> yazdığı `@ts-nocheck` nedeniyle **içeriği tip denetiminden geçmez**. Rota bağlantısının
> doğruluğunun gerçek garantisi `tsc` değil, dosyanın her `vite build`'de **yeniden üretilmesi** ve
> e2e spec'inin dört rotayı gerçekten gezmesidir.

**Ölçülmüş ve tutan varsayım (A-A10, S1):** `routeTree.gen.ts` silinip
`pnpm --filter @arkesoft/admin build` koşulunca **md5 birebir aynı** içerikle (`2829d942a06702e5a0692cf80b89b55a`)
yeniden üretildi, build yeşil kaldı.

**AC4/AC23'ün kanonik yasak-desen tarama komutu** (pozitif include glob'ları negatif exclude'dan
**önce** verilirse ripgrep'te exclude'u **ezer** — ilk deneme bunu kanıtladı; doğru sıra: exclude
**en sonda**):

```bash
rg -n --type ts '\bany\b' apps/admin/src packages/ui/src --glob '!**/routeTree.gen.ts'
```

Bu komut **0 eşleşme** ile çıkmalı (ripgrep eşleşme bulamadığında exit 1 verir — bu "geçti"
anlamına gelir, komutun kendisinin başarısız olması değil).

**Yeni borç kaydı:** Prisma istemcisi + `routeTree.gen.ts` iki üretilmiş artefakt; üçüncüsü
doğduğunda dağınık muafiyetler tek bildirilmiş kayda (ve bir ADR'ye) terfi etmeli — bkz.
`ROADMAP.md` → Teknik Borç → Vadesi v0.0.7.

### `turbo.json` ve `VITE_*`

`turbo.json`'un `build.env` listesi bugün `VITE_*` **içermiyor** — panel bu sürümde hiçbir
`VITE_*` değişkeni kullanmıyor (tek orijin topolojisinde API adresi **göreli**: `url: '/trpc'`).
`envDir` de repo köküne **işaret etmiyor** (bilinçli: kök `.env`'in sırları Vite'ın görüş alanına
hiç girmiyor); dev-only `ARKESOFT_PANEL_DEV_API_TARGET` **`VITE_` öneki taşımıyor** → bundle'a asla
inline edilmez.

**İleride bir `VITE_*` değişkeni eklenirse** `turbo.json`'un `build.env`'ine **eklenmek
zorundadır** — yoksa turbo, yanlış değerle gömülü bir derlemeyi önbellekten servis edebilir.

### E2E operasyonel tavanı ve oran sınırı

Kimlik doğrulama oran sınırları **ayrı** sayaçlardır (`apps/api/src/auth/rate-limit/rate-limit.policy.ts:56`):
sign-in **20/15dk** (IP), sign-up **10/saat** (IP — `EMAIL_IP_LIMIT`). Panelin e2e koşumu ikisini
de tüketir. **Ölçülmüş güncel maliyet (S5, düzeltme turu 2):** tam bir koşum **4 sign-in + 3
sign-up** (`panel-flow.spec.ts` 3+3, `qa-blind-spot-and-negative-scenarios.qa.spec.ts` 1+0) →
**saatte ~3 tam koşum** (sign-up tavanı belirleyici).

Tavan aşıldığında belirti **429 + `Retry-After`**'dır. **Teşhis "flaky" DEĞİLDİR** — `qa` tur 1'de
tavana oturdu ve bir test **~51 dakika** bloke oldu; bu beklenen davranıştır (borç, bkz.
`ROADMAP.md` → Teknik Borç).

**Global `platform:auth:*` flush YASAKTIR** (AC18'in "arada flush yok" şartı). Meşru bir kilitlenme
durumunda yalnızca kendi geliştirme oturumunuzu sıfırlamak istiyorsanız yukarıdaki "Oran Sınırı
Sıfırlanması" bölümündeki komutu kullanın — ama bunu bir e2e koşum **ölçümünün ortasında**
yapmayın, sayıyı bozar.

**⚠ `pnpm test`'in yan etkisi (`qa` keşfetti, `security` ve `solid` doğruladı):** zorunlu kapı
komutu `pnpm test`, her `createTestApp()` çağrısında `platform:auth:*` namespace'ini **sıfırlar**
(`apps/api/src/__tests__/helpers/create-test-app.ts:70-79`'un `flushRateLimitCounters`'ı, T-006/S8
eklemesi — dosya başı yorumunda belgeli). **AC18'in "iki ardışık koşum" ölçümünü `pnpm test` ile
ARADA koşmayın** — sayaçlar sıfırlanır ve ölçüm geçersiz olur. Doğru sıra: `pnpm test` → **arada
hiçbir şey çalıştırmadan** iki ardışık `pnpm --filter @arkesoft/admin test:e2e`.

---
