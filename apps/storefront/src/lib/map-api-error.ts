// @arkesoft/storefront — mapApiError: iki taşıma zarfını TEK
// `StorefrontApiFailure`'a indirger (ROADMAP v0.0.8, T-009, düzeltme turu 2,
// architect'in yerleşim kararı).
//
// Saf, AĞSIZ, `instanceof` YOK — yalnızca YAPISAL Zod probe'ları. FIRLATMAZ
// (fail-closed). Şemaların ÜÇÜNCÜ bir kopyası DOĞMAZ: zarf (a) için
// `@arkesoft/errors`'un `appErrorBodySchema`'sı, zarf (b) için
// `@arkesoft/trpc`'nin `trpcErrorDataSchema`'sı DOĞRUDAN tüketilir — burada
// kopyalanan şey kural DEĞİL, ~15 satır tesisat (architect'in gerekçesi).
//
// PANELİN BEŞ PROBE'UNDAN İKİSİ (`apps/admin/src/errors/
// normalize-panel-error.ts`) BİLİNÇLİ OLARAK YOK:
//   - panelin probe 3 (çıplak `appErrorBodySchema`): storefront'un TEK HTTP
//     çağıranı `src/lib/storefront-server-fetch.ts`'in ponyfill'idir ve o
//     ponyfill gövdeyi HER ZAMAN `{body, status}` ile SARAR (düzeltme turu
//     2'nin "yol 2"si) — çıplak bir `AppErrorBody`'nin BU çağıran dışında
//     storefront'a ulaşacağı bir yol YOK (A-N2 ÖLÇÜMÜ: `rg -n "fetch\(|new
//     Request\(" apps/storefront/src` ponyfill'in İÇİNDEKİ `node:http`
//     `request()` çağrısı DIŞINDA bir HTTP çağıran BULAMADI — handoff'ta
//     ham çıktı).
//   - panelin probe 4 (Better Auth `{code}`): storefront'ta `/auth/*` yüzeyi
//     HİÇ YOK (storefront kimliksiz ziyaretçiye hizmet eder, ADR-0012 madde
//     3/4).
// Her iki eksik probe'un hatalı yolu ZATEN fail-closed → `unavailable` (503,
// SEO açısından DOĞRU taraf) — YANLIŞ bir `not-found` (404) DEĞİL.
//
// SIRALI (ayırt edici anahtarlar `status`/`body` vs `data` AYRIK olduğu için
// sıra DAVRANIŞSAL DEĞİL; inceleme belirliliği için SABİTLENİR):
//   1. zarf (a) — taşıma reddi: `{status, body: AppErrorBody}`, `error`'a
//      DOĞRUDAN sonra `error.cause`'a (AZAMİ 1 seviye aşağı — panelin
//      bağlayıcı derinlik sınırının storefront karşılığı). `status === 404`
//      → `not-found`, aksi hâlde `unavailable`.
//   2. zarf (b) — tRPC zarfı: `{data: TrpcErrorData}`, YALNIZCA `error`'a
//      doğrudan. `data.httpStatus === 404` → `not-found`, aksi hâlde
//      `unavailable`.
//      ⚠ BU DAL BUGÜN ÜRETİMDE TETİKLENMİYOR (`TenantGuard` HTTP seviyesinde
//      ÖNCE reddediyor — kiracı muafiyeti AÇILMADI, ADR-0012 madde 2).
//      SİLİNMEZ: ADR-0012 madde 8'in lafzı ve GELECEKTEKİ prosedür hataları
//      için KORUNUR (terfi tetikleyicisi: üçüncü tüketici `apps/superadmin`
//      v0.0.20 VEYA dördüncü bir zarf şekli — o noktada `packages/trpc`'nin
//      `.` alt yoluna, YALNIZCA probe ilkelleri olarak TERFİ edilir).
//   3. Hiçbiri → `{kind: 'unavailable'}`. FIRLATMAZ. Zaman aşımı,
//      `ECONNREFUSED`, 5xx, HTML, `null`, `undefined`, DÖNGÜSEL `cause` →
//      hepsi BURAYA.
//
// Atıflar: ADR-0010 madde 4 (iki zarf gerçeğinin İLK belgelendiği yer, v0.0.7
// eki) · ADR-0012 madde 12 (bu dosyanın yerleşim kararının gerekçesi,
// `docs` S6 sonrası fazda işleyecek) · kardeş modül:
// `apps/admin/src/errors/normalize-panel-error.ts` (panelin BEŞ probe'u,
// v0.0.7/S4, AC7).
import { z } from 'zod'

import { appErrorBodySchema } from '@arkesoft/errors'
import { trpcErrorDataSchema } from '@arkesoft/trpc'

/** Vitrinin bir API çağrısı başarısız olduğunda ayırt ettiği İKİ sonuç — `src/middleware.ts`'in (K21) 404/503 eşlemesinin TEK girdisi. */
export type StorefrontApiFailure = { readonly kind: 'not-found' } | { readonly kind: 'unavailable' }

/** Zarf (a)'nın "taşıma reddi" şekli — `storefront-server-fetch.ts`'in yol 2'sinin fırlattığı `Error`'ın yapısı. */
const transportRejectionEnvelopeSchema = z.object({ status: z.number(), body: appErrorBodySchema })

/** `error.cause`'u AZAMİ 1 seviye AŞAĞI açmak için kullanılan yapısal probe — döngüsel `cause` zincirine GİRMEZ (tek seviye). */
const causeEnvelopeSchema = z.object({ cause: z.unknown() })

/** Zarf (b) — tRPC istemci hatasının `data` alanındaki şekli. */
const trpcEnvelopeSchema = z.object({ data: trpcErrorDataSchema })

/** `status`'tan {@link StorefrontApiFailure}'a eşler — `httpStatus`/`status` TABANLI, kod literali (`TENANT_NOT_FOUND`) OKUNMAZ (ADR-0012 madde 8'in lafzı). */
function toFailureFromStatus(status: number): StorefrontApiFailure {
  return status === 404 ? { kind: 'not-found' } : { kind: 'unavailable' }
}

/**
 * Bilinmeyen bir hatayı {@link StorefrontApiFailure}'a indirger. Saf, AĞSIZ,
 * `instanceof` YOK, FIRLATMAZ (fail-closed) — hiçbir probe eşleşmezse
 * `{kind: 'unavailable'}` döner.
 */
export function mapApiError(error: unknown): StorefrontApiFailure {
  // 1. Zarf (a) — error'a DOĞRUDAN.
  const directTransportRejection = transportRejectionEnvelopeSchema.safeParse(error)
  if (directTransportRejection.success) {
    return toFailureFromStatus(directTransportRejection.data.status)
  }

  // 1. Zarf (a) — error.cause üzerinden (AZAMİ 1 seviye aşağı).
  const causeEnvelope = causeEnvelopeSchema.safeParse(error)
  if (causeEnvelope.success) {
    const nestedTransportRejection = transportRejectionEnvelopeSchema.safeParse(
      causeEnvelope.data.cause,
    )
    if (nestedTransportRejection.success) {
      return toFailureFromStatus(nestedTransportRejection.data.status)
    }
  }

  // 2. Zarf (b) — error'a DOĞRUDAN (bugün üretimde tetiklenmiyor, dosya başı yorumu).
  const trpcEnvelope = trpcEnvelopeSchema.safeParse(error)
  if (trpcEnvelope.success) {
    return toFailureFromStatus(trpcEnvelope.data.data.httpStatus)
  }

  // 3. Fail-closed — hiçbir probe eşleşmedi, FIRLATMAZ.
  return { kind: 'unavailable' }
}
