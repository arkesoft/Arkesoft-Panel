// @arkesoft/api — IncomingHttpHeaders → Web Headers (FIX turu 1, madde 11 —
// solid M-2, medium)
//
// `auth.controller.ts`/`auth-context.middleware.ts`/`sessions.service.ts`'in
// ÜÇ birebir kopyasının BİRLEŞTİRİLMİŞ hâli. ÖNCEKİ gerekçe (her üç dosyada
// da) "dosya sahipliği" idi — solid gate'in haklı tespiti: sahiplik bir
// SÜREÇ kısıtıdır, tasarım gerekçesi DEĞİLDİR. Üçü de AYNI tüketici için
// (Better Auth'un Web `Request`/`getSession`/`revokeSession(s)` yüzeyi)
// AYNI dönüşümü yapıyordu — kopyalardan biri ayrışırsa (ör. çoğul başlık
// davranışı) Better Auth'a giden isteğin SESSİZCE farklılaşması riski vardı.
//
// Saf, framework-bağımsız (`express`/`fastify` import YOK — K-A1).

import type { HttpRequestHeaders } from './http-request.types.js'

/** `IncomingHttpHeaders` şeklini (dizi/`undefined` dahil) Web `Headers`'a çevirir. */
export function toWebHeaders(headers: HttpRequestHeaders): Headers {
  const result = new Headers()

  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        result.append(name, item)
      }
    } else {
      result.set(name, value)
    }
  }

  return result
}
