// @arkesoft/api — Mailpit test okuyucusu (ROADMAP v0.0.5, T-006/S4, architect
// "Mailpit okuyucusu" bölümü)
//
// AC4(b) BAĞLAYICI: "yalnızca 'token üretildi' assert'i KABUL EDİLMEZ" —
// gerçek Mailpit HTTP API'sinden (`infra/docker-compose.yml`'in açtığı
// `:8025`) GERÇEKTEN teslim edilmiş mesaj okunur. Bu dosya o okuma yüzeyini
// taşır; S5/S6 kayıt→doğrulama uçtan uca testinde bunu TÜKETECEK.
//
// CLAUDE.md §4: "dış dünyadan gelen her veri Zod ile parse edilir" — Mailpit
// HTTP API'sinin yanıtı da dış veridir, tipi burada Zod ile DOĞRULANIR,
// ayrıştırılmamış JSON'a asla tip VERİLMEZ.
//
// Yeni bir env değişkeni EKLENMEDİ (KESİN YASAK) — `127.0.0.1:8025`
// `infra/docker-compose.yml:177`'nin varsayılan port eşlemesiyle aynı, test
// dosyalarının mevcut deseniyle (`shutdown.test.ts`) TUTARLI (literal host/port).

import { z } from 'zod'

/** Mailpit HTTP API'sinin varsayılan tabanı (`infra/docker-compose.yml`). */
const MAILPIT_BASE_URL = 'http://127.0.0.1:8025'

const mailpitAddressSchema = z.object({
  Name: z.string(),
  Address: z.string(),
})

/** `GET /api/v1/messages`'ın liste öğesi — özet (gövde İÇERMEZ). */
const mailpitMessageSummarySchema = z.object({
  ID: z.string(),
  Subject: z.string(),
  From: mailpitAddressSchema.nullable(),
  To: z.array(mailpitAddressSchema),
  Created: z.string(),
})

const mailpitMessagesListResponseSchema = z.object({
  total: z.number(),
  messages: z.array(mailpitMessageSummarySchema),
})

/** `GET /api/v1/message/{id}`'in tam gövdesi — düz metin + HTML dahil. */
const mailpitMessageDetailSchema = z.object({
  ID: z.string(),
  Subject: z.string(),
  From: mailpitAddressSchema.nullable(),
  To: z.array(mailpitAddressSchema),
  Text: z.string(),
  HTML: z.string(),
})

export type MailpitMessageSummary = z.infer<typeof mailpitMessageSummarySchema>
export type MailpitMessageDetail = z.infer<typeof mailpitMessageDetailSchema>

/** Mailpit'in beklenmeyen bir yanıt verdiğinde fırlatılır (ağ hatası değil — şekil hatası). */
export class MailpitResponseShapeError extends Error {
  constructor(endpoint: string, cause: unknown) {
    super(`Mailpit yanıtı beklenen şekilde değil: ${endpoint}`, { cause })
    this.name = 'MailpitResponseShapeError'
  }
}

/** Mailpit'in beklenmeyen bir HTTP durumu döndürdüğünde fırlatılır. */
export class MailpitRequestFailedError extends Error {
  constructor(endpoint: string, status: number) {
    super(`Mailpit isteği başarısız: ${endpoint} → HTTP ${String(status)}`)
    this.name = 'MailpitRequestFailedError'
  }
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(`${MAILPIT_BASE_URL}${path}`)

  if (!response.ok) {
    throw new MailpitRequestFailedError(path, response.status)
  }

  return response.json()
}

/** Mailpit'teki tüm mesajların özetini (en yeni en üstte) okur. */
export async function listMailpitMessages(): Promise<readonly MailpitMessageSummary[]> {
  const raw = await fetchJson('/api/v1/messages')
  const parsed = mailpitMessagesListResponseSchema.safeParse(raw)

  if (!parsed.success) {
    throw new MailpitResponseShapeError('/api/v1/messages', parsed.error)
  }

  return parsed.data.messages
}

/** Tek bir mesajın tam gövdesini (düz metin + HTML) okur. */
export async function getMailpitMessage(id: string): Promise<MailpitMessageDetail> {
  const raw = await fetchJson(`/api/v1/message/${encodeURIComponent(id)}`)
  const parsed = mailpitMessageDetailSchema.safeParse(raw)

  if (!parsed.success) {
    throw new MailpitResponseShapeError(`/api/v1/message/${id}`, parsed.error)
  }

  return parsed.data
}

/**
 * Belirli bir alıcıya (e-posta adresi, büyük/küçük harf duyarsız) gönderilmiş
 * EN YENİ mesajın tam gövdesini okur. Bulunamazsa throw eder — "token
 * üretildi" varsayımıyla sessizce `undefined` DÖNMEZ, çağıran testi (AC4(b))
 * açıkça BAŞARISIZ kılar.
 */
export async function findLatestMailpitMessageTo(recipient: string): Promise<MailpitMessageDetail> {
  const target = recipient.toLowerCase()
  const summaries = await listMailpitMessages()

  const match = summaries.find((summary) =>
    summary.To.some((address) => address.Address.toLowerCase() === target),
  )

  if (match === undefined) {
    throw new Error(`Mailpit'te ${recipient} alıcısına gönderilmiş mesaj bulunamadı`)
  }

  return getMailpitMessage(match.ID)
}

/** Test izolasyonu için Mailpit'teki TÜM mesajları siler. */
export async function deleteAllMailpitMessages(): Promise<void> {
  const response = await fetch(`${MAILPIT_BASE_URL}/api/v1/messages`, { method: 'DELETE' })

  if (!response.ok) {
    throw new MailpitRequestFailedError('/api/v1/messages (DELETE)', response.status)
  }
}

/**
 * Bir metindeki İLK `http(s)://` URL'sini çıkarır. Bulunamazsa throw eder —
 * "belirteç üretildi" varsayımıyla sessizce boş string DÖNMEZ (AC4(b)).
 */
export function extractFirstUrl(text: string): string {
  const match = /https?:\/\/[^\s<>"]+/.exec(text)

  // `noUncheckedIndexedAccess`: `match[0]` (tam eşleşme) her zaman TANIMLIDIR
  // (başarılı bir `exec` çağrısında) ama tip sistemi bunu bilmez — açık
  // kontrol, `as`'a BAŞVURMADAN daraltır.
  const url = match?.[0]

  if (url === undefined) {
    throw new Error('metinde http(s) URL bulunamadı')
  }

  return url
}

/**
 * Bir URL'nin belirli bir sorgu parametresini okur. Parametre yoksa throw
 * eder. `extractFirstUrl` ile birleştirilerek gövdeden belirteç çıkarmanın
 * genel yüzeyini oluşturur (ör. `extractQueryParam(extractFirstUrl(text), 'token')`).
 */
export function extractQueryParam(url: string, paramName: string): string {
  const value = new URL(url).searchParams.get(paramName)

  if (value === null || value.length === 0) {
    throw new Error(`URL'de '${paramName}' sorgu parametresi bulunamadı: ${url}`)
  }

  return value
}
