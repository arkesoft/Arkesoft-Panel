// @arkesoft/trpc — storefront.currentTenant tel sözleşmesi (ROADMAP v0.0.8,
// T-009/S5, architect K3, ADR-0012)
//
// `TenantSummary` (`tenant-summary.schema.ts`) KASITLI OLARAK yeniden
// KULLANILMAZ. Ölçülmüş gerekçe: Zod 4'te `z.object()` bilinmeyen anahtarları
// SOYAR — yani `.output(storefrontTenantSchema)`'ya bir `TenantSummary`
// değeri verilse bile çıktı `{name}`'e İNER; bu "soyma yoluna güvenmek"
// demek, beş alanın (id/slug/status/primaryDomain/name) RESOLVER'A KADAR
// GERÇEKTEN GELMESİ anlamına gelir. `.output()`'un KALDIRILMASI, `.loose()`/
// `.passthrough()` EKLENMESİ veya bu şemanın GENİŞLETİLMESİ beşini BİRDEN
// tele yazar. Sızdırmazlık bu yüzden PORTUN DÖNÜŞ TİPİNE dayanır
// (`StorefrontTenantReadPort.findPublicTenant`), serileştirmeye DEĞİL.
//
// Alan alan gerekçe (architect K3):
//   name          — VAR. Prosedürün TEK varlık sebebi. `TrpcTenantState`
//                   (`context/trpc-context.types.ts`) bu alanı BİLEREK
//                   TAŞIMIYOR → port çağrısı KAÇINILMAZ.
//   id            — YOK. Tüketicisi 0; opak iç kimliği internete açmak
//                   bedelsiz bir ilişkilendirme tutamacı.
//   slug          — YOK. Alt alan adı dalında host'tan ZATEN biliniyor;
//                   ÖZEL alan adı dalında slug döndürmek `magaza.com`
//                   ziyaretçisine aynı dükkânın İKİNCİ, DUYURULMAMIŞ
//                   adresini açıklar.
//   status        — YOK. PM A3: durum kapısı v0.1.0 → dallanma yok. Askıya
//                   alınma bir FATURALAMA/UYUM durumudur, anonim ziyaretçiye
//                   açıklanması TİCARİ SIZINTI.
//   primaryDomain — YOK. Tüketicisi yok VE aktif zararlı: SEO'nun
//                   sabit-alan-adı defektini (R10) DAVET eder.
//   planId,
//   deletedAt     — YOK. `TenantSummary`'de de yok (bilinçli).
//
// R9 TELAFİSİ (bağlayıcı): çıktı tek alanlı da olsa OBJE, çıplak `string`
// DEĞİL. Tek sebep: v0.0.10 `themeId`/`themeVersion`'ı EKLEME olarak
// getirebilsin (ROADMAP Sürüm Politikası §2: "Public API: MINOR = yalnızca
// ekleme"). Çıplak `string` seçilse v0.0.10 MAJOR olurdu.

import { z } from 'zod'

export const storefrontTenantSchema = z.object({ name: z.string() })

/** {@link storefrontTenantSchema}'nın çıkarılan tip karşılığı. */
export type StorefrontTenant = z.infer<typeof storefrontTenantSchema>
