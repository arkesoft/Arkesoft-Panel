# Arkesoft Platform

Çok kiracılı (multi-tenant) SaaS e-ticaret ve kurumsal web sitesi platformu. Müşteri panele
girer, tema seçer, "Siteyi Kur" der ve dakikalar içinde kendi alan adında çalışan, SSL'li,
ödeme ve kargo entegrasyonlu bir site elde eder.

Platform çekirdeği, tema sözleşmesi, her tema ve public API birbirinden bağımsız semantik
versiyon taşır. Müşteri hangi sürümde olduğunu görür, güncellemeyi kendisi uygular ve
bozulursa geri alır.

## Durum

**v0.0.1 — monorepo iskeleti.** Çalışan bir ürün henüz yok; yapı, araç zinciri ve kod
standartları kuruldu. Sıradaki adım `v0.0.2` (yerel altyapı servisleri).

Yol haritasının tamamı ve her sürümün kabul kriteri: [`ROADMAP.md`](./ROADMAP.md).

## Dokümanlar

| Dosya                            | İçerik                                                            |
| -------------------------------- | ----------------------------------------------------------------- |
| [`ROADMAP.md`](./ROADMAP.md)     | Sürüm sürüm yol haritası, sürüm politikası, varsayımlar           |
| [`CLAUDE.md`](./CLAUDE.md)       | Kod standartları, çalışma akışı, tenant izolasyon kontrol listesi |
| [`CHANGELOG.md`](./CHANGELOG.md) | Platform çekirdeğinin sürüm geçmişi                               |
| [`docs/adr/`](./docs/adr/)       | Mimari karar kayıtları                                            |

## Gereksinimler

- **Node 24 LTS** (`.nvmrc` ile sabit). `engines` `>=24` kabul eder.
- **pnpm 12+** — `npm install -g pnpm`

## Kurulum

```bash
pnpm install
```

## Komutlar

```bash
pnpm build          # tüm paketleri derler
pnpm dev            # geliştirme sunucularını başlatır
pnpm lint           # ESLint (tip bilgisine dayalı, katı)
pnpm typecheck      # tsc --noEmit, tüm paketler
pnpm test           # Vitest (v0.0.3'ten itibaren)
pnpm format         # Prettier ile biçimlendirir
pnpm format:check   # biçim denetimi
pnpm clean          # build çıktılarını ve önbellekleri siler
```

Bir sürümü kapatmadan önce geçmesi zorunlu kapı:

```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm format:check
```

## Yapı

```
apps/api            NestJS — iş mantığı, tRPC router'ları, kuyruk worker'ı
apps/admin          Vite + React — tenant yönetim paneli
apps/superadmin     Vite + React — Arkesoft iç paneli
apps/storefront     Astro SSR — çok kiracılı vitrin, tema runtime
packages/db         Prisma şeması, migration, seed, RLS politikaları
packages/trpc       Router tipleri, Zod şemaları, istemci
packages/ui         Paylaşılan shadcn bileşenleri
packages/theme-sdk  Tema sözleşmesi ve theme.json şeması
packages/integrations  Ödeme, kargo, e-fatura, SMS, pazaryeri adaptörleri
packages/config     Paylaşılan tsconfig / ESLint / Prettier / Tailwind preset'leri
docs/adr            Mimari karar kayıtları
```

## Katkı kuralları

Her değişiklik `ROADMAP.md`'deki bir sürüme bağlıdır. Ayrıntılar ve kod standartları
[`CLAUDE.md`](./CLAUDE.md)'de.
