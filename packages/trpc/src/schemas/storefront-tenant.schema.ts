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

// GÜNCELLEME (ROADMAP v0.0.10, T-012/S4, architect tRPC SÖZLEŞMESİ): `themeId`/
// `themeVersion` EKLENDİ — yukarıdaki R9 TELAFİSİ'nin (satır 32-35) adıyla önceden
// ödediği genişleme. Düz (flat) şekil KORUNUYOR (`{ name, themeId, themeVersion }`,
// AC8) — iç içe `{ theme: {...} | null }` daha iyi tiplenirdi ama kullanıcıya
// duyurulmuş kabul kriterinin şeklini değiştirmek bedele değmez. Yasal olmayan
// durum (`themeId`/`themeVersion`'dan tam biri null) bu katmanda ENGELLENMEZ —
// kapı DB CHECK kısıtı (`(theme_id IS NULL) = (theme_version IS NULL)`) + tek
// eşleme fonksiyonu + tüketicide (vitrin kayıt defteri) adlandırılmış hatadır.
//
// `themeVersion` semver-DOĞRULANMAZ, `themeId` slug-DOĞRULANMAZ — bilinçli.
// `THEME_ID_PATTERN`/`SEMVER_CORE_PATTERN_SOURCE` theme-sdk barrel'ında YOK
// (`packages/theme-sdk/src/index.ts:26-34`); burada yeniden yazmak İKİNCİ bir
// doğruluk kaynağı olurdu. Değer bizim kendi DB'mizden geliyor; gerçek kapı
// TÜKETİCİDE ve daha güçlü: vitrin kayıt defteri TAM EŞLEŞME araması ile
// bilinmeyen id VE sürümü reddeder (AC2, ROADMAP v0.0.10/T-012/S7).
//
// İKİSİ DE `.nullable()` — KALICI olarak nullable, bu sürümün geçici bir
// eksiği DEĞİL. `apps/api` doğrulayamadığı bir seçimi İCAT ETMEZ: hangi tema
// modüllerinin kurulu olduğu storefront DERLEME ÇIKTISININ özelliğidir
// (A3/A4), `apps/api` bunu bilemez. Varsayılanı uygulayan taraf VİTRİNDİR —
// `apps/api` coalesce ETMEZ (port `storefront-tenant-read.port.ts:20-26`
// TOTAL kalır, `null` dönmez; alan değeri `null` OLABİLİR, bu port'un kendisinin
// dönüşü `null` olması ile AYNI şey DEĞİLDİR).
// ⚠ BAĞLAYICI: bu iki alanı İLERİDE non-null yapmak MAJOR'dır (`ROADMAP.md:1380`,
// "MINOR = yalnızca ekleme") — "temizlik" gerekçesiyle daraltılamaz.

import { z } from 'zod'

export const storefrontTenantSchema = z.object({
  name: z.string(),
  themeId: z.string().nullable(),
  themeVersion: z.string().nullable(),
})

/** {@link storefrontTenantSchema}'nın çıkarılan tip karşılığı. */
export type StorefrontTenant = z.infer<typeof storefrontTenantSchema>
