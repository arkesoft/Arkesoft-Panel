// @arkesoft/admin — Oturum sonlandırma REST istemcisi (ROADMAP v0.0.15.1,
// T-017/S11, ADR-0019 §7 "SONLANDIRMA tRPC'NİN PARÇASI DEĞİL — REST'te")
//
// ⚠⚠ İSİM ÇAKIŞMASI BİLEREK ÖNLENDİ (po'nun uyarısı, Orkestratör
// doğruladı): `apps/admin/src/api/session-query.ts` (TEKİL "session",
// `session.me`) ZATEN VAR — bu dosya `sessions-rest.ts` (ÇOĞUL
// "sessions") adıyla BİR HARF uzaklıkta ama farklı bir uçlar kümesini
// (`/auth/sessions/revoke`, `/auth/sessions/revoke-all`) kapsar. Oturum
// LİSTESİ (`session.list`) tRPC üzerinden gider — o, `api/sessions-
// query.ts`'te (bu dosyanın KARDEŞİ, AYRI dosya).
//
// `auth-rest.ts`/`two-factor-rest.ts`'teki AYNI desen: `better-auth/client`
// EKLENMEZ (ADR-0011, tek orijin topolojisi), `credentials: 'same-origin'`,
// hata gövdesi `normalizePanelError`'a verilir (Better Auth'un KENDİ
// gövdesi — zarf (c)).
//
// ⚠⚠ PAROLA BU DOSYADA ASLA LOGLANMAZ (CLAUDE.md §4) — fonksiyonlar saf
// `fetch` çağrısı yapar, yan etki olarak konsola/loga YAZMAZ.
//
// Her iki uç ADR-0019 §Karar 4'ün step-up sırasını (parola → sahiplik)
// SUNUCUDA zorluyor — bu dosya o sırayı TEKRAR ETMEZ, yalnızca gövdeyi
// taşır; "eksik"/"yanlış" parola AYRIMI sunucu tarafında YOK (tek kod
// `INVALID_PASSWORD`, `errors/normalize-panel-error.ts`'in zarf (c)'si).
import { normalizePanelError } from '../errors/normalize-panel-error.js'
import type { PanelError } from '../errors/panel-error.js'
import { AUTH_SESSIONS_REVOKE_ALL_PATH, AUTH_SESSIONS_REVOKE_PATH } from '../app/panel-config.js'
import { parseJsonSafely } from './http/parse-json-safely.js'

export type RevokeSessionResult =
  { readonly kind: 'revoked' } | { readonly kind: 'error'; readonly error: PanelError }

/**
 * `POST /auth/sessions/revoke` — başka bir cihazın oturumunu sonlandırır.
 * Sunucu parolayı sahiplik kontrolünden ÖNCE doğrular (ADR-0019 §Karar 4) —
 * bu fonksiyon o sırayı ZORLAMAZ, yalnızca `{sessionId, password}` gövdesini
 * taşır.
 */
export async function revokeSession(
  sessionId: string,
  password: string,
): Promise<RevokeSessionResult> {
  const response = await fetch(AUTH_SESSIONS_REVOKE_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, password }),
  })

  if (response.ok) {
    return { kind: 'revoked' }
  }

  const body = await parseJsonSafely(response)
  return { kind: 'error', error: normalizePanelError(body) }
}

/**
 * `POST /auth/sessions/revoke-all` — çağıranın KENDİ oturumu DAHİL tüm
 * oturumlarını sonlandırır (ADR-0019 §Karar 1). Başarı yanıtı bir hata
 * DEĞİLDİR ama çağıranı kimliksiz bırakır — bu fonksiyon o sonucu
 * YORUMLAMAZ (sunum/veri ayrımı, CLAUDE.md §9); çağıran (konteyner
 * bileşen) başarı dalını mevcut `treatAsSignedOut` desenine BAĞLAR.
 */
export async function revokeAllSessions(password: string): Promise<RevokeSessionResult> {
  const response = await fetch(AUTH_SESSIONS_REVOKE_ALL_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  })

  if (response.ok) {
    return { kind: 'revoked' }
  }

  const body = await parseJsonSafely(response)
  return { kind: 'error', error: normalizePanelError(body) }
}
