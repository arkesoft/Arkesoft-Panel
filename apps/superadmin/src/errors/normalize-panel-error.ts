// @arkesoft/superadmin — normalizePanelError: üç taşıma zarfını TEK
// `PanelError`'a indirger (ROADMAP v0.0.20, T-021/S8, `apps/admin/src/
// errors/normalize-panel-error.ts`'in AYNI deseni — `fields` kanalı
// ÇIKARILDI, bkz. `panel-error.ts` dosya başı yorumu).
//
// Saf, AĞSIZ, `instanceof` YOK — yalnızca YAPISAL Zod probe'ları.
//
// SIRALI (BAĞLAYICI):
//   1. `{ body: appErrorBodySchema }` — `input` VEYA `input.cause` (AZAMİ 2
//      derinlik) → (a)
//   2. `{ data: trpcErrorDataSchema }` → (b)
//   3. `appErrorBodySchema` doğrudan → (a)
//   4. `{ code: z.string() }` → (c) — Better Auth'un KENDİ gövdesi
//   5. — → `{ kind: 'unknown', requestId: null }`, FIRLATMAZ (fail-closed).
//
// 3 → 4 SIRASI ZORUNLU: Zod `z.object` GEVŞEK — fazladan alan görmezden
// gelinir — bu yüzden tam dört alanlı `{code,message,details,requestId}`
// (zarf a) probe 4'ün `{code: z.string()}` şemasına DA uyar. 3 DAHA DAR
// olduğu için ÖNCE denenir.
//
// GÜNCELLEME (ROADMAP v0.0.18, T-027/S7, architect R-1 KARARI,
// `apps/admin/src/errors/normalize-panel-error.ts`'in AYNI deseni): zarf
// (a)/(b) `AppErrorBody.message` artık `errorMessageKeySchema` KAPALI
// kümesinden `safeParse` EDİLİR ve `PanelError.known.messageKey`'e YAZILIR.
// Kümenin DIŞINDAKİ her değer (ham sunucu metni, boş dize, uydurma anahtar)
// `null`'a elenir. Zarf (c) (Better Auth'un KENDİ gövdesi) `message`'ı HİÇ
// PARSE ETMEZ — `messageKey` o dalda HER ZAMAN `null`'dır.
import { z } from 'zod'

import { appErrorBodySchema, errorMessageKeySchema } from '@arkesoft/errors'
import type { AppErrorBody, ErrorMessageKey } from '@arkesoft/errors'
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

/**
 * `body.message`'ı `errorMessageKeySchema`'nın KAPALI kümesinden geçirerek
 * süzer (architect R-1 KARARI). Kümenin DIŞINDAKİ her değer (ham sunucu
 * metni dahil) `null`'a elenir.
 */
function parseMessageKey(message: string): ErrorMessageKey | null {
  const parsed = errorMessageKeySchema.safeParse(message)
  return parsed.success ? parsed.data : null
}

/** {@link AppErrorBody}'den `PanelError`'ın `known` dalını üretir — mesaj alanı HAM olarak ASLA taşınmaz. */
function toKnownFromAppErrorBody(body: AppErrorBody): PanelError {
  return {
    kind: 'known',
    code: body.code,
    requestId: body.requestId,
    messageKey: parseMessageKey(body.message),
  }
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

  // 4. {code: z.string()} → (c). Better Auth'un gövdesi `requestId` TAŞIMAZ.
  // `message`'ı da HİÇ PARSE ETMEZ → `messageKey` HER ZAMAN `null`
  // (architect R-1 KARARI — `messages.ts`'in merdiveni bu kodu kendi Better
  // Auth sağlayıcı tablosundan çözer).
  const betterAuthBody = betterAuthBodySchema.safeParse(input)
  if (betterAuthBody.success) {
    return { kind: 'known', code: betterAuthBody.data.code, requestId: null, messageKey: null }
  }

  // 5. Fail-closed — hiçbir probe eşleşmedi, FIRLATMAZ.
  return { kind: 'unknown', requestId: null }
}
