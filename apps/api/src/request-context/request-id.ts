// @arkesoft/api — istek kimliği üretimi/doğrulaması (ROADMAP v0.0.4, T-002/ST-4,
// architect K-A5/K-A7)
//
// `uuid`/`ulid` paketleri BİLEREK yok — `node:crypto`'nun yerleşik `randomUUID()`'ı
// yeterli, yeni ana bağımlılık gerektirmez.

import { randomUUID } from 'node:crypto'

/**
 * İstemciden gelen `x-request-id` değerinin kabul edilebilir biçimi. CRLF/log
 * injection ve HTTP başlık enjeksiyonunu kapatan tek kapı — bu desenin dışına
 * çıkan HER değer (kontrol karakteri, CR/LF, aşırı uzunluk, boş dize) reddedilir.
 */
const INCOMING_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

/** Yeni bir platform istek kimliği üretir: `'req_' + randomUUID()`. */
export function generateRequestId(): string {
  return `req_${randomUUID()}`
}

/**
 * İstemciden gelen `x-request-id` başlık değerini çözümler.
 *
 * İstemci değeri **yalnızca** tek değerli (dizi değil — çoklu `x-request-id`
 * başlığı başlık enjeksiyonu/karışıklık riski taşır) VE
 * {@link INCOMING_REQUEST_ID_PATTERN}'e uyuyorsa kullanılır. Aksi hâlde
 * **sessizce** yeni bir kimlik üretilir — istemciye hata dönülmez, istek
 * normal şekilde işlenir; yalnızca korelasyon kimliği platformun kendi
 * ürettiği değer olur. Sessiz davranışın gerekçesi: bu bir doğrulama hatası
 * değil, bir güvenlik kararıdır (CRLF/log injection ve başlık enjeksiyonu
 * kapanır) — istemciyi reddetmek yerine zararsız bir değerle devam edilir.
 */
export function resolveIncomingRequestId(headerValue: string | string[] | undefined): string {
  if (typeof headerValue !== 'string') {
    return generateRequestId()
  }

  if (!INCOMING_REQUEST_ID_PATTERN.test(headerValue)) {
    return generateRequestId()
  }

  return headerValue
}
