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

**Bir sürümü kapatmadan önce geçmesi zorunlu kapı:**

```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm format:check
```

---

## Veritabanı komutları (v0.0.3+)

Komutlar yalnızca yerel geliştirme veritabanına karşı çalışır. Yıkıcı işlemler allowlist'li guard'dan geçer.

### Allowlist ve güvenlik

Yıkıcı komutlar (`db:push`, `db:reset`, `db:seed`, `migrate dev`, `migrate reset`, `studio`) beforetesi guard'lı sarmalayıcıdan (`run-guarded-prisma`) geçer:

**Host kontrolü:** Yalnızca `localhost`, `127.0.0.1`, `::1` izin verilir. Uzak hostname'e karşı çalışmak reddedilir.

**`NODE_ENV` kontrolü:** Varsayılan-reddet politikası. Yalnızca `undefined`, `development`, `test` değerleri geçer; `staging`, `production` ve diğer tüm değerler reddedilir.

**Kaçış kapısı:** `ARKESOFT_CONFIRM_DESTRUCTIVE` ortam değişkeni hedef veritabanı adına **birebir eşit** olmalı. Örneğin, `ARKESOFT_CONFIRM_DESTRUCTIVE=arkesoft` yerel `arkesoft` veritabanına `db:reset` çalıştırır. Yanlış değer veya boş dize reddedilir. **Kapı, üretim açısından çoklu katman savunmasının bir parçasıdır; birinci savunma kimlik bilgisi ayrımıdır (geliştirici kabuğunda üretim `DATABASE_URL` bulunmaması).**

**Guard kapsamı:** Guard **repo script yüzeyini** korur, keyfi çağrıları korumaz. `pnpm exec prisma db push --url=…` ve `npx prisma …` guard'sızdır. Üretim kazasına karşı gerçek savunma v0.0.13'ün rol ayrımı (uygulama rolü `NOSUPERUSER`, `NOBYPASSRLS`) ve v0.0.12 CI sırlarıdır. **Guard bir hız kesicidir, izolasyon sınırı değildir.**

### Açık script'ler (guard'sız)

- `db:generate` — Prisma istemcisi oluştur (DB'ye bağlanmaz, güvenli)
- `db:migrate` — `prisma migrate dev` (geliştirme, shadow DB oluşturma)
- `db:deploy` — `prisma migrate deploy` (üretim, migration'ları uygula; bu yolun kendi auth mekanizması var)
- `db:verify` — doğrulama (`prisma validate`, `format --check`, `migrate diff`)

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
