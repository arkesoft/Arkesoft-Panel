// @arkesoft/admin — normalizePanelError: üç taşıma zarfını (architect K3) TEK
// `PanelError`'a indirger (ROADMAP v0.0.7, T-008/S4, AC7).
//
// Saf, AĞSIZ, `instanceof` YOK — yalnızca YAPISAL Zod probe'ları. Şemaların
// DÖRDÜNCÜ bir kopyası DOĞMAZ (borç 1450 kısıtı): (a) için `@arkesoft/errors`,
// (b) için `@arkesoft/trpc` şeması DOĞRUDAN tüketilir.
//
// SIRALI (BAĞLAYICI, architect K3):
//   1. `{ body: appErrorBodySchema }` — `input` VEYA `input.cause` (AZAMİ 2
//      derinlik) → (a)
//   2. `{ data: trpcErrorDataSchema }` → (b)
//   3. `appErrorBodySchema` doğrudan → (a)
//   4. `{ code: z.string() }` → (c) — Better Auth'un KENDİ gövdesi
//   5. — → `{ kind: 'unknown', requestId: null }`, FIRLATMAZ (fail-closed:
//      bozuk/`null`/HTML/döngüsel gövde dahil — her `safeParse` çağrısı
//      fırlamaz, `cause` derinliği 2 ile SINIRLI olduğu için döngüsel bir
//      `cause` zinciri sonsuz özyinelemeye GİRMEZ).
//
// 3 → 4 SIRASI ZORUNLU (yoruma yazılması istendi): Zod `z.object` GEVŞEK —
// fazladan alan görmezden gelinir — bu yüzden tam dört alanlı
// `{code,message,details,requestId}` (zarf a) probe 4'ün `{code:
// z.string()}` şemasına DA uyar. 3 DAHA DAR (message/details/requestId'yi
// DA zorunlu kılar) ve bu yüzden ÖNCE denenir; aksi hâlde zarf (a) hiçbir
// zaman 3'e ulaşmadan 4'e (zarf c, `requestId: null`) yanlış sınıflanırdı.
import { z } from 'zod'

import { appErrorBodySchema } from '@arkesoft/errors'
import type { AppErrorBody } from '@arkesoft/errors'
import { trpcErrorDataSchema } from '@arkesoft/trpc'

import type { PanelError } from './panel-error.js'

/** Zarf (a)'nın "gövde" sarmalayıcısı — `transport-aware-fetch.ts`'in fırlattığı `Error`'ın şekli. */
const bodyEnvelopeSchema = z.object({ body: appErrorBodySchema })

/** `input.cause` derinliğini AZAMİ 1 seviye AŞAĞI açmak için kullanılan yapısal probe. */
const causeEnvelopeSchema = z.object({ cause: z.unknown() })

/** Zarf (b)'nin tRPC istemci hatasının `data` alanındaki şekli. */
const trpcEnvelopeSchema = z.object({ data: trpcErrorDataSchema })

/** Zarf (c) — Better Auth'un KENDİ gövdesi: üst düzey `code` + ham İngilizce `message`. */
const betterAuthBodySchema = z.object({ code: z.string() })

/** {@link AppErrorBody}'den `PanelError`'ın `known` dalını üretir — mesaj alanı ASLA taşınmaz. */
function toKnownFromAppErrorBody(body: AppErrorBody): PanelError {
  return { kind: 'known', code: body.code, requestId: body.requestId }
}

export function normalizePanelError(input: unknown): PanelError {
  // 1. {body: appErrorBodySchema} — input DOĞRUDAN.
  const directBody = bodyEnvelopeSchema.safeParse(input)
  if (directBody.success) {
    return toKnownFromAppErrorBody(directBody.data.body)
  }

  // 1. {body: appErrorBodySchema} — input.cause (azami 2. derinlik).
  const causeEnvelope = causeEnvelopeSchema.safeParse(input)
  if (causeEnvelope.success) {
    const nestedBody = bodyEnvelopeSchema.safeParse(causeEnvelope.data.cause)
    if (nestedBody.success) {
      return toKnownFromAppErrorBody(nestedBody.data.body)
    }
  }

  // 2. {data: trpcErrorDataSchema} → (b).
  const trpcEnvelope = trpcEnvelopeSchema.safeParse(input)
  if (trpcEnvelope.success) {
    return toKnownFromAppErrorBody(trpcEnvelope.data.data.appError)
  }

  // 3. appErrorBodySchema doğrudan → (a).
  const directAppError = appErrorBodySchema.safeParse(input)
  if (directAppError.success) {
    return toKnownFromAppErrorBody(directAppError.data)
  }

  // 4. {code: z.string()} → (c). Better Auth'un gövdesi `requestId` TAŞIMAZ —
  // panel sahip olmadığı bir requestId'yi UYDURMAZ (borç 1445 kısıtı).
  const betterAuthBody = betterAuthBodySchema.safeParse(input)
  if (betterAuthBody.success) {
    const parsedBetterAuthBody = betterAuthBody.data
    return { kind: 'known', code: parsedBetterAuthBody.code, requestId: null }
  }

  // 5. Fail-closed — hiçbir probe eşleşmedi, FIRLATMAZ.
  return { kind: 'unknown', requestId: null }
}
