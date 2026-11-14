// @arkesoft/admin — normalizePanelError: üç taşıma zarfını (architect K3) TEK
// `PanelError`'a indirger (ROADMAP v0.0.7, T-008/S4, AC7).
//
// Saf, AĞSIZ, `instanceof` YOK — yalnızca YAPISAL Zod probe'ları. Şemaların
// DÖRDÜNCÜ bir kopyası DOĞMAZ (borç 1450 kısıtı): (a) için `@arkesoft/errors`,
// (b) için `@arkesoft/trpc` şeması DOĞRUDAN tüketilir.
//
// GÜNCELLEME (ROADMAP v0.1.0, T-019/S8, `panel-error.ts`'in madde 2'si):
// `AppErrorBody.details` tel tarafında SERBESTTİR (`error-body.ts:45` →
// `z.record(z.string(), z.unknown())`) — bu yüzden `details.fields` burada
// `@arkesoft/trpc`'nin `registrationFieldErrorKeySchema` KAPALI kümesiyle
// Zod ile parse edilir ve küme dışındaki HER değer (ham metin dahil) elenir.
// `extractAllowlistedFields` bu dosyanın TEK filtreleme noktasıdır — allowlist
// burada elle kopyalanmaz, doğrudan şemadan tüketilir.
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
import { registrationFieldErrorKeySchema, trpcErrorDataSchema } from '@arkesoft/trpc'
import type { RegistrationFieldErrorKey } from '@arkesoft/trpc'

import type { PanelError } from './panel-error.js'

/** Zarf (a)'nın "gövde" sarmalayıcısı — `transport-aware-fetch.ts`'in fırlattığı `Error`'ın şekli. */
const bodyEnvelopeSchema = z.object({ body: appErrorBodySchema })

/** `input.cause` derinliğini AZAMİ 1 seviye AŞAĞI açmak için kullanılan yapısal probe. */
const causeEnvelopeSchema = z.object({ cause: z.unknown() })

/** Zarf (b)'nin tRPC istemci hatasının `data` alanındaki şekli. */
const trpcEnvelopeSchema = z.object({ data: trpcErrorDataSchema })

/** Zarf (c) — Better Auth'un KENDİ gövdesi: üst düzey `code` + ham İngilizce `message`. */
const betterAuthBodySchema = z.object({ code: z.string() })

/** `details.fields`'ın YAPISAL (ama henüz içerik-doğrulanmamış) şekli — ad → bilinmeyen değer. */
const detailsFieldsEnvelopeSchema = z.object({ fields: z.record(z.string(), z.unknown()) })

/**
 * `AppErrorBody.details.fields`'ı (CLAUDE.md §4 `{ fields: { slug:
 * 'errors.slug.taken' } }` deseni) `registrationFieldErrorKeySchema`'nın
 * KAPALI kümesinden GEÇİREREK süzer (T-019/S8). Allowlist'in TEK kaynağı o
 * şema — ikinci bir elle-kopyalanmış liste burada YOK.
 *
 * Fail-closed: `details.fields` yoksa, yapısal değilse, ya da alanların
 * HİÇBİRİ kümeye uymuyorsa `null` döner — `details.fields` hiç gönderilmemiş
 * olsaydı ne olurdu ise AYNI sonuç (regresyon yok, NEGATİF TEST 2). Kümeye
 * UYMAYAN her tekil alan (ör. ham sunucu metni, uydurma anahtar) TEK TEK
 * elenir — bir alanın reddi diğer, geçerli bir alanı etkilemez.
 */
function extractAllowlistedFields(
  details: Record<string, unknown>,
): Readonly<Record<string, RegistrationFieldErrorKey>> | null {
  const envelope = detailsFieldsEnvelopeSchema.safeParse(details)
  if (!envelope.success) {
    return null
  }

  const allowlisted: Record<string, RegistrationFieldErrorKey> = {}
  for (const [fieldName, fieldValue] of Object.entries(envelope.data.fields)) {
    const parsedKey = registrationFieldErrorKeySchema.safeParse(fieldValue)
    if (parsedKey.success) {
      allowlisted[fieldName] = parsedKey.data
    }
  }

  return Object.keys(allowlisted).length > 0 ? allowlisted : null
}

/** {@link AppErrorBody}'den `PanelError`'ın `known` dalını üretir — mesaj alanı ASLA taşınmaz. */
function toKnownFromAppErrorBody(body: AppErrorBody): PanelError {
  return {
    kind: 'known',
    code: body.code,
    requestId: body.requestId,
    fields: extractAllowlistedFields(body.details),
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

  // 4. {code: z.string()} → (c). Better Auth'un gövdesi `requestId` TAŞIMAZ —
  // panel sahip olmadığı bir requestId'yi UYDURMAZ (borç 1445 kısıtı).
  const betterAuthBody = betterAuthBodySchema.safeParse(input)
  if (betterAuthBody.success) {
    const parsedBetterAuthBody = betterAuthBody.data
    // Better Auth'un gövdesi `details` TAŞIMAZ → `fields` HER ZAMAN `null`
    // (uydurulmaz — borç 1445 kısıtının `fields` karşılığı).
    return { kind: 'known', code: parsedBetterAuthBody.code, requestId: null, fields: null }
  }

  // 5. Fail-closed — hiçbir probe eşleşmedi, FIRLATMAZ.
  return { kind: 'unknown', requestId: null }
}
