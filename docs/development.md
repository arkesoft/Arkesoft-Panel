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

`packages/tenancy/src/**` (host→tenant **seçici**: normalizasyon, rezerve etiketler
— v0.0.8'den itibaren `@arkesoft/tenancy`, `apps/api`'den terfi etti), `apps/api/src/tenancy/**`
(`TenantGuard`, `TenantContextMiddleware`, `TenantResolverService` — `TenantContext` **üretimi**
hâlâ burada) ve `src/request-context/**` değiştirilirken:

1. `packages/tenancy/src/__tests__/resolve-host.test.ts` (35+ vaka) — tüm host normalizasyonu ve
   saldırı vektörleri kapsamlı biçimde test edilmeli (dosya v0.0.8'de `apps/api`'den buraya
   **taşındı**, kopyalanmadı)
2. `apps/api/src/__tests__/tenant-exempt-paths.test.ts` — allowlist (`/health`, `/health/ready`)
   değişmesi algılanmalı
3. `apps/api/src/__tests__/concurrency.test.ts` (20 eşzamanlı istek) — ALS sızıntısı, shared
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

> **ROADMAP v0.0.15, T-016/S12 (K-A7) — kök `package.json`'da `db:migrate`/`db:deploy`/
> `db:push`/`db:reset`'in dördü de artık `&& pnpm db:bootstrap` ile ZİNCİRLİ.** Önceki
> davranışta operatör şema değiştiren bu dört komuttan birini koşturup `db:bootstrap`'ı
> **atlayabiliyordu** — yeni bir sır taşıyan tablo (ör. `two_factor`) oluştuğunda
> `arkesoft_auth` o tabloda yetkisiz KALIYORDU ve çalışma zamanı belirtisi yanıltıcı
> oluyordu ("girdiğim kod kabul edilmiyor" — gerçek sebep: Postgres `permission denied for
table …`, kodun kendisiyle İLGİSİZ). Artık dördü de **otomatik** olarak `bootstrap`'ı
> (idempotent) yeniden koşturuyor; operatör bunu ayrıca elle çağırmak ZORUNDA değil
> (çağırmak hâlâ zararsız — idempotent). `db:rollback-roles`/`db:rollback-auth-role`
> BİLEREK bu zincire dahil EDİLMEDİ (kasıtlı geri alma, zincirlenirse kendi etkisini anında
> tersler). `migrate dev`/`migrate reset`'in Prisma'nın kendi otomatik seed kancası (bkz.
> `packages/db/prisma.config.ts`) bu `&&` zincirinden ÖNCE, tek bir `prisma` çağrısının
> İÇİNDE koşar — yani sıra bazen `migrate` + `seed` (Prisma'nın kendi içinde) → `bootstrap`
> (zincirde) olur; bu zararsızdır çünkü seed `two_factor` gibi sır tablolarına veri
> YAZMAZ, önemli olan zincirin SONUNDA `bootstrap`'ın gerçekten koşmuş olması.
>
> **Yerel mekanik "guards" kapısı (K-A14):** `.github/workflows/ci.yml`'deki `guards`
> job'unun ağ gerektirmeyen mekanik adımları (AC13 yasak jeton taraması, AC4 GUC jeton
> taraması, AC5/AC8 pozitif/negatif iddialar, sahte-yeşil paket kümesi dedektörleri,
> `scripts/` tip+lint kontrolü, platform sürüm tutarlılığı, kurulu ise `actionlint`) artık
> `pnpm guards` (`scripts/guards.sh`) ile **yerelde de** koşuyor — önceden bu adımlar
> yalnızca CI'da görünüyordu ve T-014/T-015'te AYNI mekanik hata (bir jetonun bir yorumda
> bitişik yazılması) üç kez CI'ı kırdı. Veri kaynakları (`.github/ci-*.txt`) doğrudan
> okunur (kopyalanmaz); yalnızca tarama MANTIĞI çoğu adımda İKİ YERDE (CI + bu script)
> yaşar — `devops` `.github/**`'e yazamadığı için bu adımların GÖVDESİ CI'a taşınamaz,
> bilinçli bir sapma riski olarak kalır.
>
> **Fix turu 1 güncellemesi (T-016 fix turu 1, solid M-2 / security F5(a)(b)(c)):**
> `scripts/guards.sh`'ın hedef küme türetimi (`find .github/workflows .github/actions
...`) ÖNCEDEN iki ayrı kontrolde (AC13 ve "run bloğu içi şablon ifadesi yasağı") BAĞIMSIZ
> koşuyordu — ölçülen bir SAPMA riskiydi (ikisi bugün aynı sonucu üretiyordu ama kod iki
> kopyaydı). Artık TEK YERDE türetilip paylaşılıyor (`workflow_action_targets`) ve hedef
> küme boşsa (`.github/workflows`/`.github/actions` ikisi de yok/boş) `fail_if_targets_empty`
> ile GÜRÜLTÜLÜ hata üretiyor — önceden bu durum `grep -nFf`'i dosya argümanı OLMADAN
> çağırıp STDIN'i okumaya başlatarak ASKIDA KALIYORDU (ölçüldü, macOS bash 3.2'de farklı
> bir çöküş biçiminde, Linux/bash 4.4+'ta hang olarak). "run bloğu içi şablon ifadesi
> yasağı" kontrolünün 34 satırlık awk programı `scripts/check-run-block-template-
expression.sh`'e taşındı — bu TEK DOSYA artık hem `pnpm guards` HEM `ci.yml`'nin aynı
> adımı tarafından çağrılıyor (ci.yml'deki değişiklik DAR: yalnızca bu bir adımın awk
> gövdesi script çağrısına dönüştü, başka hiçbir kontrol değişmedi/zayıflamadı — mutasyon
> kanıtı devops T-016 fix turu 1 raporunda). Geri kalan kontroller (AC13, AC5, AC8, AC4,
> sahte-yeşil dedektörleri, scripts/ tip+lint, sürüm tutarlılığı) HÂLÂ bilinçli kopya —
> bu adımların gövdesini CI'a taşımak/CI'ı buraya yönlendirmek ayrı bir karar/ADR gerektirir.

### Dört kademeli geri alma (v0.0.13+, kademe 4: v0.0.14.1+)

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

**`pnpm db:rollback-roles`** script'i artık vardır (v0.0.14.1'den itibaren, kök
`package.json` ve `packages/db/package.json`) ve yukarıdaki `pnpm exec`/`prisma db
execute` çağrısıyla aynı dosyayı koşturur; ikisi de geçerlidir.

Bu komut bootstrap adımının etkisini geri alır: sahipliği `arkesoft` rolüne devirir, `GRANT`
ve `ALTER DEFAULT PRIVILEGES`'i iptal eder. **`DROP ROLE` YAPILMAZ** — roller küme
seviyesinde yaşar, silme bu script'in kapsamının dışındadır (bkz. ADR-0007, K-E2).

**Uyarı:** Kademe 1-3'ün her adımı `pnpm test:isolation`'ı kırmızıya düşürür — bu bilinçli
tasarım. Kapatma bir işlem değildir, imkânsızlığın adımlarıdır. ⚠ **Kademe 4'ün istisnası
aşağıda** — aynı "kırmızı" sonuç farklı bir sebepten gelir.

#### 4. Kimlik rolü ayrımını geri al (v0.0.14.1+) — dördüncü kademe, SIRAYLA İLK çalışır

```bash
pnpm db:rollback-auth-role
```

⚠⚠ **Numara eklenme sırasını kaydeder, yürütme sırasını DEĞİL.** Gerçek yürütme sırası
**4 → 1 → 2 → 3**'tür: kademe 1-3 (yukarıdaki `pnpm db:rollback-roles`) artan yıkıcılıkta
bir **kill-switch merdiveni**dir ve `arkesoft_app`'ten **her şeyi** `REVOKE` eder; kademe 4
ise yalnızca v0.0.14.1'in **deltasını** (kolon `GRANT` + tablo `REVOKE`) tersler ve
kataloğu v0.0.14'ün durumuna döndürür. Kademe 3 **önce** koşarsa `arkesoft_app` zaten
hiçbir tabloda yetki taşımaz ve kademe 4'ün "yetkiyi geri ver" adımı **tutarsız bir ara
durum** yaratır. Bu yüzden **iki ayrı dosya, iki ayrı script**
(`sql/rollback-roles.sql` ≠ `sql/rollback-auth-role.sql`, `pnpm db:rollback-roles` ≠
`pnpm db:rollback-auth-role`) — tek script'e birleştirmek, operatör sadece bu sürümün
deltasını geri almak isterken geliştirme veritabanını kademe 1-3'ün kill-switch'ine sokar.

**"Başlangıç durumuna döndü" ≠ "linter yeşil".** Kademe 4'ten sonra `pnpm test:isolation`
**beklenen biçimde KIRMIZIDIR** (`APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE` +
`AUTH_ROLE_MISSING_COLUMN_PRIVILEGE` + `AUTH_ROLE_MISSING_TABLE_PRIVILEGE`) — kod (yeni
kurallar) katalogdan **daha yeni** olduğu için. Bu bir hata değil, **kuralların
çalıştığının kanıtıdır**; kademe 1-3'ün kırmızısıyla aynı görünüp farklı bir sebepten
gelir. Yeşile dönüşün yolu: **`pnpm db:bootstrap`'i yeniden koştur** (bootstrap §7'yi
tekrar uygular). Ayrıntı ve gerekçe: `docs/adr/0017-veritabani-seviyesi-rol-ayrimi-ve-kolon-yetkisi.md`.

⚠ **Üç sır taşıyan tablonun (`account`/`session`/`verification`) veya `app_user`'ın
şeması değişirse** (yeni kolon), kolon hibesi bootstrap'ın `DO` döngüsüyle **otomatik**
genişler ama bu yalnızca `pnpm db:bootstrap` **yeniden koşturulduğunda** olur — migration
uygulandıktan sonra bu adım unutulursa yeni kolon `arkesoft_auth`'a hibelenmez ve giriş
`42501` ile düşer. Azaltma iki yönlü: bootstrap kendi kendine iyileşir, katalog linter'ı
da eksikliği CI'da yakalar (gürültülü, sessiz değil).

⚠ **İlk `SECURITY DEFINER` fonksiyon eklendiğinde** `pnpm test:isolation` **kırmızıya
düşecek** (`UNEXPECTED_SECURITY_DEFINER_FUNCTION`) ve operatör/geliştirici **elle**
`REVOKE EXECUTE … FROM PUBLIC` yazmak ve gereken `GRANT`'i vermek zorunda kalacak — bu,
PostgreSQL'in `ALTER DEFAULT PRIVILEGES`/fonksiyon ACL etkileşiminin ölçülmüş bir sınırı
(bkz. Ölçüm disiplini (k)) ve `security`'nin kabul ettiği bir davranış: _"arıza modu
fail-closed ve gürültülü"_. Bkz. CLAUDE.md §7, `SECURITY DEFINER` maddesi.

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

Linter, `packages/db/src/catalog-lint.ts`'teki `TENANT_ISOLATION_RULES` dizisinde tanımlı
kural kümesiyle tüm izolasyon şartlarını kontrol eder (kanonik sayım o diziden okunur,
burada tekrar edilmiyor — bkz. kural (g) aşağıda): tenant_id tipi, indeks, RLS, politika,
rol yetkileri, kolon yetkisi vb.

#### Taksonomiye tablo eklemenin DÖRT mekanizması (v0.0.14+)

⚠ Yukarıdaki adımlar **tek başına yeterli değildir.** `TENANT_SCOPED_TABLES`'a bir satır
eklemek, kaynak kodu başka hiçbir yerde değiştirilmeyen **dört** mekanizmayı birden devreye
sokar. Dizi v0.0.3'te `tenant_membership` ile açıldı, v0.0.11'de `job`, v0.0.14'te `audit_log`
ve `tenant_invitation` eklendi. ⚠ **Güncel üye listesi ve sayısı burada TEKRAR EDİLMİYOR:**
kanonik liste `packages/db/src/tenancy.ts`'te yaşıyor ve v0.0.14'te **kaynak ağacında dört ayrı
yere** kopyalanmış bir taksonomi sayısının dördü birden bayatlamış olarak bulundu (bkz. _Ölçüm
disiplini_ (g)).

1. **Canlı katalog linter'ı** (`packages/db/src/catalog-lint.ts`, kural kümesi `TENANT_ISOLATION_RULES`'ta yaşar) — yeni tablo için `tenant_id` kolonunu/tipini/`NOT NULL`'ını, RLS `ENABLE` + `FORCE`'unu, kanonik `USING`/`WITH CHECK` politikasını, uygulama rolünün DML yetkisini ve (v0.0.14.1'den itibaren) kimlik rolünün kolon yetkisini arar.
2. **Migration kümesi linter'ı** (`packages/db/src/__tests__/helpers/migration-set.ts`) — `"tenant_id" TEXT NOT NULL` kolonunu **ve** `tenant_id` **öncü kolonlu** bir `CREATE UNIQUE INDEX`'i şart koşar. ⚠ Bu şart, tablonun doğal bir bileşik benzersizliği olup olmadığına göre iki farklı sonuç verir — aşağıdaki ayrım.
3. **Prob tamlığı kapısı** (`packages/db/src/__tests__/helpers/tenant-isolation-suite.ts`) — tablo için bir `TenantScopedProbe` yazılmasını **zorlar**; eksikse `skip` değil, gerçek bir `expect` başarısızlığı üretir.
4. **Yedi zorunlu izolasyon senaryosu** — prob kaydedildiği an yeni tablo için de koşar (çapraz okuma, `WITH CHECK` INSERT reddi, "bulunamadı" semantiği, varlık/yetki oracle'ı, hata gövdesi, havuz sızıntısı).

**Prob kaydı TEK yerdedir:** `packages/db/src/__tests__/tenant-membership.isolation.test.ts` —
repoda `createTenantIsolationSuite()`'in **tek** çağrı noktası. İkinci bir çağrı noktası açmak
**iki dosyayı da kırar**, çünkü her çağrı kendi taksonomisini kendi problarıyla karşılaştırır.
Yeni tablo için yapılacak iş: `tenancy.ts`'e tablo adı + `__tests__/helpers/<tablo>.probe.ts`
dosyası + o tek çağrı noktasının `probes` dizisine **bir satır**. Taksonomiyi elle daraltmak
yasaktır.

⚠ **Doğal benzersizlik ayrımı (v0.0.14'te ölçüldü, iki yöne de örnek var):**

- **`job` ve `audit_log`'un doğal bileşik benzersizliği YOKTU** → migration linter'ının öncü `tenant_id` şartını karşılamak için `@@unique([tenantId, id])` **açıkça** yazılmak zorunda kaldı. Bu indeks **dekoratif değildir**: migration'dan satırı çıkarmak linter'ı `MISSING_TENANT_ID_LEADING_UNIQUE_INDEX` ile kırmızıya düşürüyor (mutasyonla ölçüldü).
- **`tenant_invitation`'ın doğal benzersizliği VARDI** (`(tenantId, email)` — bir kiracıya aynı adrese iki bekleyen davet olamaz) → yapay `(tenantId, id)` indeksi **gerekmedi**. İkinci bir benzersizlik (`(tenantId, tokenHash)`) kabul sorgusunun ideal indeksidir.

Yani yeni tablo için sorulacak soru şudur: _"bu tablonun kiracı kapsamında zaten bir iş
anlamı taşıyan bileşik benzersizliği var mı?"_ Varsa onu kullanın; yoksa `(tenantId, id)`'yi
**gerekçesiyle** yazın.

#### Append-only tablo ile izolasyon probu arasındaki gerilim

`audit_log` **append-only**'dir: şemada `updatedAt` kolonu yok ve uygulama katmanında UPDATE
yolu bulunmuyor. Buna karşın `TenantScopedProbe` sözleşmesi `updateRowById` **ve**
`deleteRowById`'ı **zorunlu** tutar, çünkü süitin 3., 4. ve 5. senaryoları tam olarak bu iki
yol üzerinden ölçülür. Probun yazdığı UPDATE/DELETE yolunun üretimde karşılığı yoktur ve bu
gerekçe `packages/db/src/__tests__/helpers/audit-log.probe.ts`'in dosya başında dört maddeyle
yazılıdır. Özü şudur ve burada tekrar edilmesi gerekiyor, çünkü aynı soru **her append-only
tabloda** yeniden sorulacak:

> Append-only, _"bu tabloya hangi SQL fiillerinin FİZİKSEL olarak uygulanabileceği"_ hakkında
> bir iddia **değildir** — uygulama rolü dört DML yetkisinin dördüne de sahiptir ve katalog
> linter'ı bunu **zorunlu tutar** — **uygulama katmanının hangi yazma yollarını AÇTIĞI**
> hakkında bir iddiadır. Prob o yolu açmıyor; onun **yokluğunda ölçülemeyecek** bir güvenlik
> özelliğini (RLS'in UPDATE/DELETE'i de filtrelediğini) ölçüyor.

İki katman çelişmiyor, **farklı şeyler hakkında konuşuyorlar** — ama bu ancak açıkça yazılırsa
denetlenebilir. ⚠ `tenant_invitation`'da bu gerekçenin karşılığı **bilerek yazılmadı ve bunun
kendisi yazıldı**: o tablo gerçekten güncellenir (tekrar davet) ve kabulde satır silinir, yani
iki yolun da üretimde **gerçek** karşılığı var.

⚠ İki kalıntı borç olarak kayıtlıdır (ROADMAP → Teknik Borç): append-only'nin **üretim yarısı**
yalnızca yazma çağrısı için kapılıydı (düzeltildi, dördüncü kapı eklendi) ve süitin ikinci
senaryosu `WITH CHECK` yarısını **bağımsız** ölçmüyor (kontrolün kendisi canlı ve çalışıyor;
bekçisi katalog linter'ının kanonik politika kuralı).

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

⚠ **ÇÜRÜTÜLEN ATIF (T-011/`qa` tur 1'de ölçüldü):** daha önce `pnpm test`'in flaky sonuçları bu
çift Redis'e atfedilmişti. **Ölçüm bunu çürüttü:** çift Redis **canlıyken** `pnpm test` üç
ardışık koşumda **957/957** geçti. Yakın sebep çift Redis **değildi** — Playwright'ın artık
bıraktığı `astro dev` süreçlerinin paylaşılan altyapıya (Postgres/Redis/Mailpit) yüklenmesiydi
(bkz. aşağıdaki "Vitrin Geliştirme" → `CLAUDECODE` tuzağı ve ADR-0014 Karar 3). Bu bölüm hâlâ geçerli bir ortam
notudur (sayaç okuma kafa karışıklığı gerçek), ama **test flakiness'inin sebebi değildir**.

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

⚠ **Bu eklemenin ölçülmüş maliyeti var (T-011/`perf`):** `turbo.json`'un global `build` görevine
eklenen bir env bildirimi, `lint`/`typecheck`'in `dependsOn: ["^build", "generate"]` zinciri
üzerinden `build`'in env-duyarlı önbellek hash'ini **devralmasına** yol açar — env değeri
değişince `lint` 19 paketten **17**'sinde, `typecheck` 19 paketten **11**'inde önbelleği kaçırır
(yalnızca bağımlılığı olmayan `@arkesoft/config` isabet eder). Bu maliyet bilinçli kabul edildi
(ADR-0014 Karar 7, kullanıcı kararı); paket-bazlı `apps/storefront/turbo.json` override'ı ile
daraltılabilir — vade v0.0.14 (bkz. ROADMAP → Teknik Borç → Vadesi v0.0.9.1).

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

## Vitrin (`apps/storefront`) Geliştirme (v0.0.8+)

### `CLAUDECODE` tuzağı — `astro dev` arka plana düşer

Astro 7.4.2'nin bağımlılığı **`am-i-vibing`** bir AI ajanı tarafından çalıştırılıp
çalıştırılmadığını ortam değişkenlerinden tespit eder. `CLAUDECODE=1` (veya
`CLAUDE_CODE_ENTRYPOINT`/`AI_AGENT`) ortamda varken `astro dev`'i **otomatik arka plana alır** ve
süreç Playwright'ın süreç ağacından **kopar** — öldürülemez hale gelir. Önceki teşhis
(_"Process exited early"_, T-009/S9, "teardown bozuk") **yanlıştı**: sorun teardown mekanizması
değil, tetikleyici ortam değişkenleriydi (ölçüldü, T-011/S3).

**✅ v0.0.9.1'den itibaren elle müdahale GEREKMİYOR:** tetikleyici önek
(`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AI_AGENT`) artık `package.json`'ın `dev`
scriptinde **ve** `playwright.config.ts`'nin `webServer.command`'ında **gömülü**. Aşağıdaki
komutu elle yazmak artık **zorunlu değil** (çalışmaya devam eder, ama gereksiz):

```bash
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AI_AGENT \
  pnpm --filter @arkesoft/storefront test:e2e
```

Bununla birlikte `playwright.config.ts`'in `reuseExistingServer`'ı artık **koşulsuz** `false`'tur
(eski `!process.env['CI']` yerelde `true`'ya düşüp bir sonraki koşumun artık süreci **yeniden
kullanmasına** — yani kalıcılaştırmasına — yol açıyordu). Bkz. ADR-0014 Karar 3.

⚠ **Bu, artık süreçlerin TEK kaynağı değildir** — turbo'nun kendi "run failed" teardown'ı
(`pnpm dev` yolunda, bu bölümün konusu olan Playwright yolundan **ayrı**) `tsc --watch`/
`node --watch`/`vite` süreçlerini öksüz bırakabilir; bu yukarıdaki iki katman tarafından
**kapsanmaz** — bkz. ADR-0014 Karar 3 ve ROADMAP → Teknik Borç → Vadesi v0.0.9.1.

### `astro dev`'in `envDir`'i repo kökünü otomatik yüklemez, ama kök `.env` artık `dev`'de ayrıca yükleniyor

**İki gerçek birlikte doğru — ikisi de yazılmalı, yoksa yanıltır:**

1. `apps/storefront`'un Vite `envDir`'i hâlâ `apps/storefront`'un kendisidir (panel'in `envDir`
   kararıyla aynı gerekçe — **bilinçli**: Vite'ın `loadEnv`'i kök `.env`'i `PUBLIC_*` için
   **taramasın**).
2. v0.0.9.1'den itibaren `createRootEnvIntegration()` adlı bir Astro entegrasyonu **`dev` dalında**
   (`command === 'dev'`) kök `.env`'i `process.loadEnvFile` ile **yüklüyor** — yani kök
   `.env`'inizdeki `APP_BASE_DOMAIN`/`STOREFRONT_API_BASE_URL` gibi değerler artık **otomatik
   vitrine ulaşıyor**, elle `export` etmeniz gerekmiyor.

`build`/`preview`/`sync` komutlarında bu entegrasyon `process.env`'e **hiç dokunmaz** (AC8) —
yalnızca `dev`'de çalışır. Ayrıntı ve tehlike mekanizması: ADR-0014 Karar 1 ve Karar 4.

### Yeni ön koşul: `STOREFRONT_API_BASE_URL`

Vitrinin sunucu taraflı tRPC istemcisi API'nin iç adresini bu değişkenden okur
(`apps/storefront/src/lib/storefront-env.ts`, açılışta fail-fast). `.env.example`'da
tanımlı; **yerel `.env`'inize de eklemeniz gerekir** (bkz. yukarıdaki `envDir` notu —
`.env.example`'a eklenmiş olması kök `.env`'inize otomatik yansımaz):

```bash
STOREFRONT_API_BASE_URL=http://127.0.0.1:3000
```

Eksikse vitrin modül yüklemede açıkça çöker (fail-closed, sessiz bozulma yok).

### Kalıcı regresyon reçetesi: `APP_BASE_DOMAIN` eksikliğini doğrulama

T-011'in kapattığı "vitrin her yolda 500 + API düşüyor" kusurunun **geri gelmediğini** doğrulamak
için `.env` dosyanızı hiç kirletmeden şu komutu çalıştırın:

```bash
APP_BASE_DOMAIN= pnpm dev
```

**İnce taraf — boş dize kullanılması bilinçlidir:** `loadEnvFile`/`--env-file-if-exists` kabukta
**zaten tanımlı** (boş da olsa) bir değeri **ezmez** (bkz. ADR-0014 Karar 1) — bu yüzden boş değer
vitrine ulaşır ve `z.string().min(1)` onu reddeder. **Kullanıcının `.env` dosyası hiç değişmez**
(`git status --short .env` boş kalır). Beklenen davranış: `pnpm dev` **exit 1**, ~2 saniye içinde,
vitrin **tek seferde** çöker (döngü yok), tek okunur Türkçe teşhis gösterilir; `apps/api` bu
senaryoda **kendi** `APP_BASE_DOMAIN` zorunluluğu yüzünden bağımsız olarak da çöker (bkz. ADR-0014
Karar 2 — bu reçete "sağlıklı kardeş görev ayakta kalır mı" sorusunu yanıtlamaz, yalnızca vitrinin
fail-closed davrandığını doğrular).

### `webServer`/`globalSetup` sıralama tuzağı

Playwright'ın `webServer` hazırlık probu `e2e/global-setup.ts`'ten **ÖNCE** koşar. `apps/api`
kapalıyken vitrin her isteğe **503** döndüğü için prob bunu "henüz hazır değil" sanıp **30 saniye**
bekler ve `global-setup.ts`'in yazdığı açıklayıcı Türkçe talimat (_"önce `apps/api`'yi
çalıştırın"_) **hiç görünmeden** jenerik `Timed out waiting 30000ms from config.webServer.`
hatasıyla düşer. Bu, katman 1/2'nin (yukarıdaki `CLAUDECODE` tuzağı) çalışmadığı anlamına
**gelmez** — yalnızca sıralama farklı bir hata mesajı üretir (T-011/`qa` tur 1'de ölçüldü).

**Çözüm:** e2e koşmadan önce `apps/api`'yi başlatıp `/health/ready`'nin 200 döndüğünü doğrulayın.

### `*.arkesoft.localhost` çözümü

Playwright/Chromium ve `curl`/`ping` test edilen tüm host kalıpları
(`demo-magaza`/`yok`/`panel`/`a.b`/`arkesoft.localhost`) **`/etc/hosts` kaydı gerekmeden**
127.0.0.1'e çözüldü (RFC 6761, `.localhost` TLD'si). Özel alan adı fixture'ları için
`.arkesoft.localhost` sonekiyle bitmeyen bir host (`<suffix>.localhost`) seçilirse
`resolveHost` doğru şekilde `custom-domain` dalına düşer ve yine `/etc/hosts` gerekmez.

### Tema sistemi (v0.0.10+) — üç ölçülmüş tuzak

#### (a) `dist/client` ile `dist/server` AYRI taranmalı — "`dist`'te var" ifadesi yetersizdir

Build çıktısında bir dizeyi bulmak, onun **o kanaldan servis edildiğini kanıtlamaz.** T-012'de
**dört ayrı ajan** (`frontend`/S8, `security`, `qa` ve Orkestratör) tema CSS kuralının
`dist/client/_astro/*.css`'te bundle edildiğini **iddia etti** — hiçbiri `dist/client` ve
`dist/server`'ı ayrı taramadan bu sonuca vardı. `perf` gerçek HTTP yanıtını, `architect` diski
ayrı ayrı ölçtü: tema kuralı **yalnızca `dist/server/**`'da** yaşıyor (satır-içi `<style>`
olarak her SSR yanıtına giriyor), `dist/client/` içinde **0 eşleşme** — harici bir tema CSS
dosyası **hiç üretilmiyor** (bkz. `docs/adr/0002-*.md` Karar 4). Dört kez tekrarlanan bu
yanlış iddia doğrulanmadan kopyalanmıştı.

**Kural:** build çıktısında bir değer/kural arayan her ajan (`perf`, `security`, `qa`,
Orkestratör) `dist/client/**` ve `dist/server/**`'ı **ayrı ayrı** taramak zorundadır.
_"`dist`'te var"_ tek başına yetersiz bir kanıttır — hangi alt dizinde olduğu, o değerin
hangi `Cache-Control` davranışına tabi olacağını belirler.

#### (b) `schema:generate` derlenmiş `dist/`'ten okur — önce `theme-sdk` build edilmeli

`packages/theme-sdk/scripts/generate-contract-schema.ts` (`schema:generate` script'i),
`src/json-schema.ts`'in **derlenmiş** hâlini (`../dist/json-schema.js`) hesaplanmış bir
`import()` yoluyla okur — `src/`'teki kaynağı **doğrudan** okumaz (gerekçe: `src/`'in iç
ithal zinciri `.js` uzantılı belirteçler taşıyor ve derlenmemiş hâlde Node'un çözümleyicisi
bunları gerçek dosyayla eşleyemiyor, `ERR_MODULE_NOT_FOUND`).

**Sonuç:** `src/`'te bir şema/manifest değişikliği yaptıktan sonra önce

```bash
pnpm --filter @arkesoft/theme-sdk build
```

koşturulmadan `pnpm --filter @arkesoft/theme-sdk run schema:generate` çalıştırılırsa, script
**eski derlenmiş `dist/`'i** okur ve `docs/theme-contract.schema.json`'ı **sessizce eski
içerikle yeniden yazar** — exit kodu 0 döner, görünürde hata yoktur. T-012'de `backend`/S3 bunu
tam bu şekilde **ölçerek** buldu: ilk denemede `git diff` **boş** çıktı ve generator "çalışmış
gibi" göründü; `build` adımı atlandığı için aslında hiçbir şey değişmemişti.

#### (c) `astro dev`'in geliştirme araç çubuğu `<body>`'ye `main`'in dışında bir `h1` enjekte eder

Astro'nun geliştirme araç çubuğu (yalnızca `astro dev`'de, üretim build'inde **yok**)
sayfaya `main`'in dışında ek `h1` öğeleri ekler (örn. "Audit", "Settings" panelleri). Çıplak
`page.locator('h1')` bu yüzden Playwright'ta **strict-mode ihlaline** düşer (birden fazla eşleşme).

İki telafi yolu vardır:

1. Locator'ı `main` kapsamına daraltmak: `page.locator('main h1')` (T-012/`S9`'un yaptığı).
2. Üretim çıktısını ölçmek: `pnpm --filter @arkesoft/storefront build` + `node dist/server/entry.mjs`
   ile gerçek üretim sunucusunu başlatıp onu ölçmek (T-012/`wcag`'ın yaptığı) — bu yol araç
   çubuğunu **yapısal olarak hiç içermez**, dolayısıyla **daha güçlü kanıt** sayılır (telafiye
   bile gerek kalmaz, sorun kendiliğinden doğmaz).

---

## Kuyruk worker'ı (v0.0.11+)

### `pnpm dev` worker'ı BAŞLATMAZ — ayrı bir `dev:worker` script'i var

Bu **bilinçli bir karardır** (T-013/K-PM3, kabul kriteri AC13 ile pinli), eksiklik değil.
Günlük geliştirmenin büyük kısmı arka plan işi gerektirmiyor ve `pnpm dev` zaten iki çocuk
süreç zinciri (`tsc --watch` + `node --watch`) çalıştırıyor; worker'ı oraya bağlamak T-011'de
ölçülmüş turbo teardown kusurunu (çocuk süreçlerin öksüz kalması) büyütürdü. Ayrım **yapısaldır**,
yalnızca script düzeyinde değil: `AppModule` yalnızca kuyruğun **üretici** modülünü import eder,
tüketici modülü yalnızca worker modülünde yaşar — yani **API süreci bir işi tüketemez**,
script'ler değişse bile.

```bash
pnpm --filter @arkesoft/api dev:worker   # geliştirmede worker (node --watch)
pnpm --filter @arkesoft/api start:worker # üretim emsali (node dist/main.worker.js)
```

İki not:

- **`dev:worker` turbo'dan geçmez.** `turbo.json`'a böyle bir görev **eklenmedi**; komut
  turbo'yu hiç devreye sokmuyor. Dolayısıyla `pnpm dev`'in paralel görev grafiğiyle etkileşmez.
- **ÖN KOŞUL: önce `pnpm dev` ya da bir kez `pnpm --filter @arkesoft/api build`.** `dev:worker`
  **ikinci bir `tsc --watch` başlatmaz**, yani derleyiciyi kendisi koşturmaz — yalnızca
  `dist/main.worker.js`'i `node --watch` ile çalıştırır. Gerekçe ölçüldü (T-013/S1):
  `apps/api/tsconfig.build.json:9` `tsBuildInfoFile: "dist/.tsbuildinfo"` ve
  `packages/config/tsconfig/base.json:34` `incremental: true` → **iki eşzamanlı watcher aynı
  `tsbuildinfo` dosyasını** yazar ve artımlı derleme durumu bozulur.

**Bu not yazılmazsa tipik yanlış teşhis şu olur:** `dist/main.worker.js` üretilmemişken
`dev:worker` anında modül bulunamadı hatasıyla düşer ve bu _"dev:worker çalışmıyor"_ diye
okunur. Çalışmayan şey script değil, eksik olan derleme adımıdır.

**Worker'ın hazır olduğu HTTP ile ölçülemez:** worker bilinçli olarak **port açmaz**
(`createApplicationContext`, `listen()` yok). Hazır olma sinyali stdout'taki yapılandırılmış log
satırıdır (`"kuyruk worker hazır"`, içinde `queueNames`, `concurrency`, `pid`). Bu metin
`apps/api/src/queue/queue-log-events.ts`'te **tek kaynakta** tutulur; bir testin veya aracın onu
beklemesi gerekiyorsa sabiti **import etmelidir**, metni ikinci kez yazmamalıdır.

### Kuyruk testlerinin iki ön koşulu

1. `pnpm infra:up` koşmuş olmalı (compose Redis'i ayakta).
2. **Homebrew `redis-server` DURDURULMUŞ olmalı:** `brew services stop redis`. Sebep yukarıdaki
   "Redis örneği tuzağı" bölümünde: homebrew loopback'i **spesifik** tuttuğu için
   `localhost:6379` compose yerine host örneğine çözülür. Doğrulama:
   `lsof -nP -iTCP:6379 -sTCP:LISTEN` **tek** dinleyici göstermeli. Geri alma:
   `brew services start redis` — ama o durumda kuyruk testleri **kasıtlı olarak** kırmızı döner.

Kuyruk testleri bu ön koşulu tahmin etmez, **ölçer**: `assertQueueCapableRedis` fail-closed bir
kapıdır ve yalnızca `NODE_ENV=test` altında koşar. Soru _"hangi host?"_ değil, _"bu Redis kuyruk
olmaya yapılandırılmış mı?"_ — iki ayar zorunludur (`appendonly=yes`, `maxmemory-policy=noeviction`),
`save` yalnızca teşhis için raporlanır. Kapı tetiklendiğinde gördüğünüz tam metin:

```
assertQueueCapableRedis: kuyruk testleri KUYRUK OLARAK YAPILANDIRILMIŞ bir Redis gerektirir — fail-closed kapı tetiklendi (AC10).

Karşılanmayan zorunlu ayarlar:
  - appendonly: beklenen 'yes', ölçülen 'no'

Ölçülen tüm değerler: appendonly='no' · maxmemory-policy='noeviction' · save='60 1'
Not: 'save' ASSERT EDİLMEZ, yalnızca teşhis için raporlanır.

Olası sebep: REDIS_URL, kuyruk için yapılandırılmamış BAŞKA bir Redis örneğine çözülüyor (homebrew redis-server varsayılanı appendonly=no).
Çözüm: (1) host örneğini durdur — brew services stop redis · (2) compose Redis'ini ayağa kaldır — pnpm infra:up · (3) 6379'da tek dinleyici kaldığını doğrula — lsof -nP -iTCP:6379 -sTCP:LISTEN
```

**Bu metni değiştiren, testi de değiştirmek zorundadır:** `assert-queue-capable-redis.test.ts`
mesajı **birebir** assert ediyor (T-013/`qa` bunu bir `low` olarak kaydetti). Kapı **teşhis eder,
düzeltmez** — kırmızı, kodun kusuru değil tasarımdır.

### İş durumunu okuyan tRPC uçları: `job.get` ve `job.list`

İkisi de **salt okunurdur**. ⚠ **Builder v0.0.14'te değişti:** ikisi de artık
`permissionProcedure('job:read')` kullanıyor (v0.0.11'de `tenantProcedure`'dü). Kimlik
doğrulaması **ve** kiracı bağlamı hâlâ zorunlu — izinli builder `tenantProcedure`'ün
**üzerine** biniyor, `publicProcedure` **değil**. ⚠ **Davranış birebir korundu:** `job:read`
izni **beş rolün beşine de** verilidir, yani dün çağırabilen her asıl bugün de çağırabiliyor;
bir rolden `job:read`'i çıkarmak ileride **ayrı ve MAJOR** bir karardır (bkz.
[ADR-0016](./adr/0016-yetki-modeli-izin-katalogu-ve-yetenek-tabanli-kiraci-baglami.md)
Karar 7). Kiracı kimliği **her zaman** oturum
bağlamından gelir, girdiden **asla** okunmaz (ADR-0009 madde 7). Şemalar:
`packages/trpc/src/schemas/job-summary.schema.ts`, router:
`packages/trpc/src/routers/job.router.ts`.

- **`job.get`** — girdi `{ jobId: string }` (en az 1 karakter), çıktı tek iş özeti.
- **`job.list`** — girdi `{ status?: JobStatus[], limit?: 1-50 (varsayılan 20), cursor?: string }`,
  çıktı `{ items, nextCursor }`. Keyset sayfalama `(createdAt DESC, id DESC)` üzerinden; `cursor`
  **önceki sayfanın SON öğesinin** `id`'sidir, `nextCursor` `null` ise sayfa son sayfadır. Boş
  `status` dizisi geçerlidir ve "hiçbir durum" demektir (sıfır satır).

İş özetinin alanları: `id` · `type` · `status` (`queued` / `running` / `completed` / `failed`) ·
`progress` (0-100 tamsayı, monoton) · `error` (`{ code, message }` veya `null`) · `createdAt` ·
`updatedAt` · `startedAt` · `completedAt` (son dördü ISO 8601 dizesi; `startedAt`/`completedAt`
`null` olabilir).

**Tele ÇIKMAYANLAR (bilinçli):** işin girdi verisi (payload) tel şemasında yok ve
veritabanı `select`'ine **hiç girmiyor** — derinlemesine savunma _"tele yazmayı unutmadık"_
değil, _"elimize hiç almadık"_; `error` yalnızca iki alan taşıyor (ayrıntı ve istek kimliği
yok); `tenantId` tel şemasında **yok**.

**Hata kodları:**

- **`JOB_NOT_FOUND`** → HTTP **404**, i18n anahtarı `errors.job.notFound`. **Üç ayrı olgu bu TEK
  hatayı üretir:** iş yok · iş **başka kiracıya ait** · imleç çözülemedi. Ayrım **yazılamaz**
  (sorgu yalnızca kiracı bağlamında koşar, uygulama kodunda kiracı karşılaştırması yoktur,
  router ve adaptörde dallanma sayısı sıfırdır) → varlık oracle'ı **yapısal olarak** kapalıdır
  (CLAUDE.md §7 madde 12). Yanıt gövdesi `requestId` dışında üç olguda **bayt düzeyinde aynıdır**.
- **Girdi doğrulama hatası** (`limit: 51`, boş `jobId`) → **`HTTP_EXCEPTION`/400**,
  `VALIDATION_ERROR` **değil**. Sebep: Zod **girdi** hatası tRPC sınırında doğuyor ve uygulama
  hata sınırının `AppError` dalına **hiç girmiyor** (ADR-0010 madde 2). Alan bazlı bir doğrulama
  gövdesi isteniyorsa bu ayrı bir sürüm kararıdır (ROADMAP → Teknik Borç).
- Oturum veya kiracı bağlamı yoksa `tenantProcedure`'ün standart hataları.

**Yazma yüzeyi YOK:** `job.cancel` / `job.retry` / `job.delete` ve toplu işlemler bu sürümde
bilinçli olarak **yazılmadı**; bir işin durumunu değiştiren tek şey kuyruğun kendisidir.

---

## Üyelik ve davet uçları (v0.0.14+)

Platformun **ilk dört mutation'ı** bu sürümde geldi: `member.invite`, `member.acceptInvitation`,
`member.updateRole`, `member.remove`. Tasarım kararlarının tamamı
[ADR-0016](./adr/0016-yetki-modeli-izin-katalogu-ve-yetenek-tabanli-kiraci-baglami.md)'da;
burada yalnızca **geliştirirken bilinmesi gerekenler** var.

### Topoloji: hangi uç hangi orijinden erişilebilir

⚠ **Üç yazma ucu (`invite`/`updateRole`/`remove`) panel host'undan erişilemez — 404 döner.**
Sebep yeni bir kısıt değil: kiracı kapsamlı prosedürler panel orijininden çözümlenmiyor
([ADR-0011](./adr/0011-panel-orijin-topolojisi-ve-kiraci-muafiyeti.md) madde 4) ve panelde
kiracı seçimi **v0.1.0**'da. Ulaşılabilir yüzey: **kiracı host'u** + sunucu/entegrasyon
istemcisi. Testler kiracıyı geliştirici başlığıyla seçiyor (mevcut tRPC testlerinin deseni),
yani gerçek host çözümleme dalını **kullanmıyorlar**; host üzerinden ölçüm `test:e2e`
yüzeyinin işidir.

⚠ **`member.acceptInvitation` bir istisnadır ve kiracı muafiyet listesine bu sürümde eklenen
yeni üyedir** (kanonik sayı, listeyi saymak zorunda olan kardinalite assertion'ındadır —
`apps/api/src/__tests__/tenant-exempt-paths.test.ts`; assertion `toContain`'e
**düşürülemez**). Kabul eden kişi tanım gereği henüz üye değildir, dolayısıyla kiracı bağlamını
host'tan alamaz; bağlamı **belirteçten** türetir. Pratik sonuçlar:

- **Oturum zorunludur** — oturumsuz istek **401** alır (kimlik muafiyet listesi büyümedi).
- **Kiracı başlığı gerekmez** ve panel orijininden erişilebilir.
- **Çıktıda kiracıya ait hiçbir alan yoktur** (tek bir `accepted` alanı) ve resolver kiracı bağlamına erişemez — kısıt tip düzeyinde pinlidir.
- **Belirteç tek kullanımlıktır:** ikinci kullanım **404**, uydurma belirteç de **404**. Tüm başarısızlık modları **tek** hata sınıfına indirgenir.

⚠ **Tüketici UI'si yok:** davet e-postasındaki bağlantının karşılığı olan panel rotası
**v0.1.0**'da gelecek. Yani bugün bağlantı **karşılıksızdır**; akışı elle denemek için
belirteci Mailpit gövdesinden okuyup isteği doğrudan atmak gerekir.

### Belirteç e-posta bağlantısının FRAGMAN'ındadır

Kabul URL'i `.../invitations/accept#token=<belirteç>` biçimindedir. **Fragman bilinçli bir
seçimdir:** belirteç sunucuya, erişim loglarına ve `Referer` başlığına **hiç gitmez**.
⚠ Pratik tuzak: Mailpit gövdesinden belirteci ayıklarken **sorgu dizesi okuyan yardımcılar
çalışmaz** (sorgu dizesi boştur ve o yardımcı fırlatır) — URL'i alıp `#token=` sonrasını
ayıklamak gerekir.

### Dışa açık kod sabitleri — kopyalamayın, import edin

Davet akışının üç iş kuralı sabiti **ortam değişkeni değildir**, `apps/api/src/member/member.constants.ts`
içinde dışa açık kod sabitidir: bekleyen davet üst sınırı, tekrar davet bekleme süresi ve
belirteç yaşam süresi. Denetim kaydının `userAgent` kırpma sınırı
`apps/api/src/audit/audit-log.writer.ts`'te. ⚠ Testler bu değerleri **import eder**; sayıyı
test dosyasına kopyalamak bu repoda yazılı olarak yasaktır.

### Operatör notu: bu sürüm HİÇBİR kırılma getirmiyor

⚠ **Yeni ortam değişkeni yok, yeni altyapı servisi yok, yeni bootstrap adımı yok.** Mailpit
`pnpm infra:up`'ta zaten ayakta ve kabul URL'inin taban adresi mevcut ortam şemasında zaten
tanımlı. Yani v0.0.13'ün iki değişkenlik kırılmasının bir benzeri **bu sürümde yaşanmıyor**.

⚠ **İkinci operatör kırılması `v0.0.14.1`'de gelecek** (`DATABASE_AUTH_URL` + ikinci Prisma
havuzu — ADR-0008'in borcu). Geçiş ve **geri alma** adımları, üç kademeli geri alma
runbook'una eklenecek **dördüncü kademe** ile birlikte **o sürümün işidir**; burada şimdiden
yazılmadı, çünkü yazılmış ama gerçekleşmemiş bir prosedür, hiç yazılmamış olandan daha
tehlikelidir (ADR-0008'in kendi dersi).

✅ **Vaat karşılandı (v0.0.14.1).** İkinci operatör kırılması geldi: `DATABASE_AUTH_URL`
artık koşulsuz zorunlu ve geçiş + geri alma adımları yazıldı — bkz. yukarıdaki
"Dört kademeli geri alma" → kademe 4 ve `.env.example:73`. Operatörün yapacağı iki iş:
mevcut `.env`'e satırı elle eklemek (`pnpm env:init` var olan dosyayı güncellemez) ve
`pnpm db:bootstrap`'i yeniden koşturmak. Ayrıntı ve gerekçe: ADR-0017.

`pnpm env:check` artık **dördüncü** bir doğrulama bloğu taşıyor: `DATABASE_AUTH_URL`'i
`databaseAuthEnvSchema`'ya göre denetler. ⚠ **Düzeltme:** bu komutun yalnızca şema
doğrulaması yaptığı, **hiçbir I/O yapmadığı** (gerçek bir veritabanı bağlantısı
kurmadığı) ölçüldü (`check-env.ts`) — önceki bir ölçümde geçen _"bağlantıyı da
kuruyor"_ ifadesi **yanlıştı**, doğrusu budur.

---

## Ölçüm disiplini (v0.0.11+)

⚠ **Başlık bilinçli olarak kural sayısı taşımıyor.** v0.0.11 beş kural yazdı (a–e), v0.0.14
üçünü ekledi (f–h) ve başlıktaki _"beş kural"_ ifadesini **kaldırdı**: bir sayıyı iki yere
yazmak, ikinci yerin bayatlaması demektir — gerekçesi (g) maddesinde.

Bu bölümdeki kuralların hepsi **fiilen yaşanmış** yanlış ölçümlerden türetildi. v0.0.11'de aynı
kusur sınıfı — _beyan ile gerçeklik arasındaki boşluk_ — **üç farklı aktör** tarafından yeniden
üretildi: Orkestratör satır sayımını yanlış rolle yapıp "tablo boş" sandı (üç kez), `qa` bayat
derleme çıktısı üzerinden mutasyon ölçüp "ölçüm boşa çıkıyor" bulgusu yazmaya hazırlandı, ve
`qa`'nın ilk lint koşumu tamamen önbellekten geldi. **Üçü de `lint`/`typecheck` ile görünmüyordu**
ve o turun 64 mutasyonunun çoğu statik kapıları yeşil geçti. Reçete
[ADR-0014](./adr/0014-pnpm-dev-env-yuklemesi-ve-gelistirme-ortami-guvenilirligi.md) Karar 8'de
yazılı (tek uygulama + tam çıktı assert'i + yakın-kaçırma içeren sentetik veri); v0.0.11 buna
**bir madde ekledi: bir assert'in boşa çıkmadığı da kanıtlanmalıdır.**

### (a) RLS'li bir tabloda satır sayımı KULLANILAN ROLE bağlıdır

`job` üzerinde `FORCE ROW LEVEL SECURITY` var ve **FORCE, tablonun sahibini de politikaya tabi
kılar.** `app.tenant_id` ayarlanmamış bir oturumda sonuç, tablonun içeriğinden **bağımsız olarak
her zaman sıfırdır**:

```bash
# YANILTICI — sahip rolle, kiracı bağlamı olmadan: her zaman 0 döner
psql -U arkesoft_migrator -d arkesoft -c "select count(*) from job;"

# DOĞRU (a) — rolbypassrls taşıyan rol (compose'un POSTGRES_USER'ı)
psql -U arkesoft -d arkesoft -c "select count(*) from job;"

# DOĞRU (b) — kiracı bağlamı kurulmuş oturum
psql -U arkesoft_app -d arkesoft \
  -c "select set_config('app.tenant_id', '<tenantId>', false); select count(*) from job;"
```

T-013'te bu hata **fiilen yapıldı**: ilk ölçüm `0` döndü, "tablo boş" diye raporlandı ve bu
sonuç **üç kez tekrarlandı**; doğru rolle ölçüldüğünde tabloda **1 satır** vardı (bayat bir
`queued` kaydı — v0.15.0'ın bayat satır tespiti borcunun ilk gerçek örneği). Rol haritası:
`arkesoft` (`rolsuper=t`, `rolbypassrls=t`) · `arkesoft_migrator` (ikisi de `f`) · `arkesoft_app`
(ikisi de `f`).

**Kural:** RLS'li bir tabloda satır sayan her ölçüm, **hangi rolle** koştuğunu yazmak zorundadır.
`arkesoft_migrator` ile kiracı bağlamsız sayım **hiçbir şey kanıtlamaz**. Bu kural Redis
ölçümleri için geçerli **değildir** (`DBSIZE`, `--scan` RLS'e tabi değil).

### (b) Bayat derleme çıktısı (`dist`) üzerinden ölçüm yapılmaz

`apps/api`, `@arkesoft/trpc`'yi **derlenmiş `dist` üzerinden** tüketir. Bir `packages/*` dosyasını
değiştirip (veya mutasyona uğratıp) **build etmeden** `apps/api` testlerini koşturmak **eski
çıktıyı** ölçer. T-013'te `qa` tam bu tuzağa düştü: bir mutasyon yeşil kaldı ve _"ölçüm boşa
çıkıyor"_ bulgusu yazılmak üzereydi; yeniden derlemeden sonra test **doğru şekilde** kırmızı
oldu.

**Kural:** `packages/*`'ta bir değişiklik yaptıktan sonra `apps/*` tarafında ölçüm yapmadan önce

```bash
pnpm --filter @arkesoft/trpc build   # veya değiştirilen paket
```

koştur. Aynı sınıf daha önce `packages/db` (guard'ın derlenmiş hâli) ve `packages/theme-sdk`
(`schema:generate`) için de yaşandı — bkz. yukarıdaki iki bölüm.

### (c) FULL TURBO bir ölçüm DEĞİLDİR

Bir kabul kriteri kapısı **önbellekten oynatılan çıktıyla** doğrulanamaz. T-013'te `qa`'nın ilk
`pnpm lint` koşumu 21/21 **cached** verdi; bu bir kanıt değil, bir kayıttır.

```bash
turbo run lint --force
turbo run typecheck --force
turbo run test --force
turbo run test:isolation --force
turbo run build --force
pnpm format:check
```

**Kural:** kabul kriteri kapısı `--force` ile ve **0 cached** olarak doğrulanır; raporda cached
sayısı yazılır. Önbellekli bir zincir yalnızca _"az önce zaten `--force` ile koştu"_ notuyla
birlikte anlamlıdır.

### (d) Literal-jeton kuralı — v0.0.11'de BEŞ kez tetiklendi

Kural `AGENT_BASELINE.md` §5'te zaten yazılı; buraya **ölçülmüş örnekleriyle** taşınıyor, çünkü
bir turda **dört ajan bağımsız olarak** aynı tuzağa düştü:

1. Bir migration/taksonomi beyanını denetleyen grep, aynı sözcük çiftini **yorumunda bitişik**
   yazdığı için kendi yorumunu buldu → kalıcı yanlış pozitif.
2. Redis yapılandırmasına **yazma** yapılmadığını denetleyen grep, yasakladığı alt komut çiftini
   yorumda bitişik gördü → beş yanlış eşleşme.
3. Bir koşul kalıbının yazılmadığını denetleyen grep, kalıbı kendi açıklama yorumunda buldu.
4. En pahalısı: `eslint.config.mjs` içinde bir **blok yorumunun içine** yazılan iki yıldız ve
   eğik çizgi dizisi **yorumu kapattı** ve `eslint` sözdizimi hatasıyla düştü — yani lint
   **tamamen** çalışamaz hâle geldi.
5. Beşincisi bugün repoda **duruyor** (`qa` `low` olarak kaydetti,
   `apps/api/src/__tests__/assert-queue-capable-redis.test.ts:16`): denetim kalıbı o yorumda
   bitişik yazılı; kapı yalnızca `packages/db` kapsamlı olduğu için **bugün** geçiyor.

**Kural:** grep ile denetlenen bir jetonu, o jetonu yasaklayan dosyanın **yorumunda bitişik
yazma**. Kalıbı Türkçe tarif et ("şu iki sözcüğün bitişik yazımı") veya jetonu çalışma anında iki
parçadan birleştir. Aynı disiplin blok yorumlarının **içeriğine** de uygulanır: yorum kapatan
dizileri tarif et, yazma.

### (e) Üç küçük sözleşme tuzağı (hepsi ölçülerek bulundu)

- **`z.string().datetime()` KULLANILAMAZ.** Zod 4.6.7'de bu yöntem `@deprecated` ve repo
  tip-bilinçli katı lint ile koştuğu için `@typescript-eslint/no-deprecated` onu **lint hatası**
  yapıyor. Doğrusu **`z.iso.datetime()`**; çıkarılan tip aynı (`string`), anlamı birebir aynı.
- **`@arkesoft/db` katman kapısının geçerli biçimi import düzeyidir.** `rg "@arkesoft/db" packages/trpc/src`
  **zaten yanlış pozitiftir** — iki dosya o paket adını v0.0.6'dan beri **yorumlarında** taşıyor.
  Geçerli kapı: `rg "from '@arkesoft/db'" packages/trpc/src` → 0 eşleşme beklenir.
- **`pnpm --filter <paket> lint typecheck build` TEK KOMUT OLARAK ÇALIŞMAZ.** pnpm ikinci ve
  üçüncü argümanı eslint'e **dosya deseni** olarak geçirir ve komut
  `No files matching the pattern "typecheck"` ile düşer. Üçü **ayrı ayrı** koşturulmalıdır.

### (f) `medium` bulgular, gate sonucu PASS olsa bile DÜZELTME TURU AÇAR

`AGENT_BASELINE.md` §4'te iki ayrı tablo var ve karıştırılmaları kolay: birincisi **FAIL/PASS**
kararını verir (üç veya daha fazla `medium` → FAIL; bir-iki `medium` → PASS), ikincisi
**düzeltme turu açılıp açılmayacağını** söyler. İkinci tablonun `medium` satırı birebir
_"Evet (sayısı kaç olursa olsun)"_ diyor ve bölümün girişi _"FAIL/PASS kararı ile düzeltme
turu açılması **ayrı şeylerdir**"_ cümlesiyle başlıyor.

⚠ **T-013'te Orkestratör bunu _"§4 otomatik tur açmıyor"_ diye okumuştu**; o Task'ta turu
kendi kararıyla açtığı için **sonuç doğru çıktı, ama gerekçe yanlıştı**. T-014'te `security`
tabloyu doğru okudu ve düzeltti → kayda geçti. **Kural:** PASS almış bir gate raporunda tek
bir `medium` varsa, düzeltme turu **koşar**; `low`'lar için **koşmaz** (onlar doğrudan ROADMAP
borç tablosuna gider).

### (g) Bir ajanın düzeltmesi KENDİSİ bayatlayabilir — çapraz referansta sembol adı kullan

T-014'te iki mertebeli bir bayatlama **ölçüldü**: bir alt görev, bir tip pininin derleme
hatasının **yanlış satıra** atıf verdiğini bulup düzeltti; düzeltme o gün doğruydu, ama aynı
alt görev doküman bloğunu büyüttüğü için **işaret ettiği satır bir yorum satırına kaydı** ve
gerçek kod **57 satır aşağıya** indi. Yani _düzeltmenin kendisi_ aynı kusur sınıfını yeniden
üretti.

**Kural** ([ADR-0014](./adr/0014-pnpm-dev-env-yuklemesi-ve-gelistirme-ortami-guvenilirligi.md)
Karar 8'in uzantısı): kalıcı bir belgede (yorum, ADR, ROADMAP, bu dosya) başka bir yere atıf
verirken **sembol adı** yaz — fonksiyon, sabit, tip, test adı. Satır numarası yalnızca
**geçici** bir gate raporunda veya handoff'ta geçerlidir. Aynı disiplinin ikinci yarısı:
**sayıyı kopyalama, kaynağa atıf ver.** T-014'te bir taksonomi sayısı dört ayrı yerde
kopyalanmış ve dördü birden bayatlamıştı; çözüm sayıları güncellemek değil, _"kanonik liste şu
dosyada yaşıyor"_ demek oldu. ⚠ Bir grep kapısıyla bayat metni avlamayı planlıyorsan kalıbını
**ölç**: T-014'te bir denetim kalıbı ters tırnaklı metni kaçırdığı için **boşa çıkmıştı** ve
kapıyı geçmek düzeltmenin yapıldığını **kanıtlamıyordu**.

### (h) `format:check` İKİ ignore dosyasını BİRLİKTE okur

⚠ Prettier 3.9, varsayılan olarak `.prettierignore` **ve** `.gitignore`'u birlikte dikkate
alır. Bir yolu kapıdan çıkarmak için iki satırdan **herhangi biri tek başına** yeterlidir;
dolayısıyla _"satırı kaldırdım, kapı yine yeşil"_ ölçümü **hiçbir şey kanıtlamaz**. T-014'te
bu **üç deneyle** ölçüldü: yalnızca `.prettierignore` satırı kaldırıldığında exit 0, yalnızca
`.gitignore` satırı kaldırıldığında exit 0, **ikisi birden** kaldırıldığında exit 1.

Buna rağmen `.prettierignore` satırı **bilinçli olarak** yazıldı: o dosyanın kendi emsal
yorumu _"`.gitignore`'dan bağımsız olarak Prettier burada da açıkça hariç tutulmalı"_ diyor.
⚠ İkinci yarısı yalnızca bir biçim sorunu da değildi: izlenmeyen, üretilmiş bir test raporu
`git status`'u kirletiyordu ve bir sonraki `git add -A` ile **yanlışlıkla commit'lenebilir**
durumdaydı.

**Kural:** bir yolun biçim kapısından muaf olduğunu kanıtlamak için **iki ignore dosyasını da**
devre dışı bırakan bir deney kurun; ve üretilmiş bir dosyayı biçimlendirmek yerine **ignore
edin** — başka bir ajanın (veya aracın) ürettiği dosyada `prettier --write` çalıştırmak
`AGENT_BASELINE.md` §5 ihlalidir.

### (i) Kolon `GRANT` sözdizimi — parantez yalnızca KENDİSİNDEN HEMEN ÖNCEKİ privilege'e uygulanır

PostgreSQL'de `GRANT SELECT, INSERT, UPDATE (col) ON tbl` yazmak kolon kısıtlamasını
**yalnızca `UPDATE`'e** uygular; `SELECT` ve `INSERT` **tablo seviyesine sızar**. Doğru
biçim her privilege için ayrı parantez:
`GRANT SELECT (%1$I), INSERT (%1$I), UPDATE (%1$I) ON tbl` (`packages/db/sql/bootstrap-roles.sql:322`).
v0.0.14.1'de `relacl`'de ampirik olarak ölçüldü; düzeltilmeseydi kolon yetkisi kuralı
**inşa gereği vacuous** olacaktı — tablo seviyesi `SELECT` varsa `has_column_privilege`
**her zaman** `true` döner (bkz. aşağıdaki (j)).

### (j) Üç ACL kataloğu, üç farklı grantee semantiği

`pg_attribute.attacl` (kolon hibeleri), `pg_class.relacl` (tablo hibeleri) ve
`pg_proc.proacl` (fonksiyon hibeleri) **aynı görünmüyor**: `attacl`'de tablo **sahibi**
`grantee` olarak **görünmez** (ölçüldü: `owner_row_count = 0`); `relacl` ve `proacl`'de
sahip **görünür**. Beklenen-grantee kümesini bir kataloğun semantiğinden diğerine
**kopyalama** — her biri için **ayrı ölç**. Kopyalanırsa kural kalıcı yanlış pozitif
verir ve ilk tepki kuralı gevşetmek olur (CLAUDE.md §10 madde 6 ihlali).

### (k) `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` ÇALIŞMIYOR

Yaygın anılan deyimin **tersi**: PUBLIC'ten önce hiç `GRANT` yazılmamışken bu komut
`pg_default_acl`'de satır üretmez ve yeni fonksiyonun `proacl`'ı `NULL` kalıp PUBLIC
EXECUTE'u sürdürür (`db` beş bağımsız denemeyle ölçtü, Orkestratör bağımsız doğruladı).
Mevcut fonksiyonlar için `REVOKE EXECUTE ON ALL FUNCTIONS … FROM PUBLIC` çalışır;
gelecekteki fonksiyonlar için **kapatma** bu Postgres sürümünde yapısal olarak
mümkün değil, **tespit** (katalog linter'ı) ile kapanıyor (`bootstrap-roles.sql` §8'de
bağlayıcı not).

### (l) `ALTER DEFAULT PRIVILEGES … ON TABLES` view ve matview'ı DA kapsar

Bir tabloya yazılan bir view, **hiçbir `GRANT` yazılmadan** uygulama rolüne sahibinin
yetkisiyle erişim verir ve kolon kısıtlamasını baypas eder (`security` ölçtü: sıfır
`GRANT` ile `SELECT FROM <view>` → tüm satırlar döndü, taksonomi tabanlı kural **0**
bulgu verdi). Bağımlı/türetilmiş nesne (view, matview, foreign tablo, fonksiyon)
eklerken katalog linter'ının görüş alanını birlikte genişlet — bkz. CLAUDE.md §7.

### (m) `42501` Prisma'da `error.code`'da DEĞİL

`$queryRaw` → `error.code = 'P2010'`; ORM çağrıları (`.create()` vb.) →
`error.code = 'P2039'`. SQLSTATE (`42501` dahil) her ikisinde de
`error.meta.driverAdapterError.cause.originalCode`'da taşınır.
`error.code === '42501'` **asla doğru olmaz** — assert her zaman `originalCode`
üzerinden yazılmalı.

### (n) turbo `strict` envMode kök komutlarda shell-exported değişkeni İLETMEZ

`DATABASE_AUTH_URL="…" pnpm test` (kök, turbo üzerinden) **düşer**;
`DATABASE_AUTH_URL="…" pnpm --filter <paket> test` (turbo'yu atlar) **geçer**. Sebep:
turbo'nun varsayılan `strict` envMode'u shell-exported değişkeni çocuk sürece iletmiyor.
Geçici çözüm: `--env-mode=loose` CLI bayrağı. ⭐ **CI'da sorun doğmuyor** çünkü `.env`
CI'da **gerçek dosya** olarak doğuyor (`pnpm env:init` = `cp .env.example .env`) ve
`vitest.config.ts` dosyaları `process.loadEnvFile` ile **dosyadan** okuyor — bu karar
`turbo.json:63-66`'da zaten belgeli. `--env-mode=loose` **kalıcı bir gereklilik değil**,
`.env`'inde ilgili satır olmayan geliştirici için **geçici kolaylık**.

### (o) Yerel kapı CI'ın ÜST KÜMESİ DEĞİL

`guards` işi **CI-only**; `pnpm lint`/`typecheck`/`test`/`build` kapsamında değildir.
T-014 FIX 2'de aynı sınıf CI'ı fiilen kırdı (bir adım düşünce sonraki adımlar
`skipped` oldu ve arkalarında kırmızı saklandı); v0.0.14.1'de bu ders **yeniden
uygulanarak** (ST-F'den sonra AC12a yeniden ölçülerek) önlendi. Yeni bir zorunlu env
veya modül seviyesi okuma eklerken `ci.yml`'in `create-env:'false'` olan job'larını
(`guards`) **ayrıca** ölç — yerelde yeşil görünmesi CI'da yeşil olacağını kanıtlamaz.

### (p) Aynı sayıyı aynı sorguyla üret

İki ajan aynı veriyi farklı sorgularla ölçüp farklı sayı raporlayabilir ve **ikisi de
doğru olabilir** — biri filtre uyguluyor, diğeri uygulamıyor olabilir, veya biri satır
sayısını, diğeri distinct bir alt kümeyi ölçüyor olabilir. v0.0.14.1'de `attacl` satırı
bir ajan tarafından **27** (distinct kolon), başka bir ajan tarafından **81**
(`aclexplode` satırı, 27 kolon × 3 privilege) raporlandı — çelişki değil, farklı
soruların yanıtı. Çelişen iki sayı görürsen önce **hangi sorgunun hangi soruyu
sorduğunu** doğrula, birini "yanlış" ilan etmeden önce.

---
