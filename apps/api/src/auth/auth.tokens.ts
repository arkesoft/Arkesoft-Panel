// @arkesoft/api — Auth modülü DI token'ları (ROADMAP v0.0.5, T-006/S5; FIX
// turu 1, madde 3 — F1(b), high; ROADMAP v0.0.15.1, T-017/S8a — SESSION_LIST_READER)
//
// DI KURALI (bağlayıcı, architect R2, `config.tokens.ts`/`prisma.tokens.ts`
// deseniyle AYNI): her enjekte edilen parametre açık `@Inject(TOKEN)` taşır;
// token `Symbol()` olarak tanımlanır (referans eşitliği, dize eşitliği değil).

import type { Auth } from 'better-auth'

import type { CurrentUserIdentity } from './auth-resolution.types.js'
import type { SessionSummary } from './sessions.service.js'

/** Yapılandırılmış Better Auth örneğini (`createAuthInstance` çıktısı) sağlayan provider'ın token'ı. */
export const AUTH_INSTANCE = Symbol('AUTH_INSTANCE')

/**
 * FIX turu 1, madde 3 (F1(b), high) — `AuthModule`'ün `src/auth` DIŞINA
 * (`AppModule.configure()`'un kaydettiği `AuthContextMiddleware`) açtığı
 * yüzey artık TAM `Auth` (`auth.api.listSessions`/`revokeSession`/...
 * HEPSİ) DEĞİL, yalnızca bu DARALTILMIŞ token'dır. ÖLÇÜLDÜ: `exports:
 * [AUTH_INSTANCE]` ile `src/auth` DIŞINDAKİ herhangi bir modül
 * `auth.api.listSessions()`'ı çağırıp ham `session.token`'ı okuyabiliyordu
 * (`tsc 0 hata`) — HTTP allowlist'inin (`/list-sessions` 404) KORUMADIĞI bir
 * DI yan yolu. `AuthContextMiddleware`'in ihtiyacı olan TEK yüzey
 * `getSession`'dır; `SessionsService`/`AuthGuard` (AuthModule'ün KENDİ
 * providers'ı, bu export'a bağımlı DEĞİL) `AUTH_INSTANCE`'ı MODÜL İÇİNDEN
 * normal şekilde enjekte etmeye devam eder.
 *
 * FIX turu 2, madde 7 (security tur2 S-6, `low`) — F1(b) yalnızca METOT
 * yüzeyini daraltmıştı (`getSession` dışındaki her şey KALKTI), VERİ yüzeyi
 * DARALTILMAMIŞTI: `getSession`'ın döndürdüğü nesne Better Auth'un KENDİ
 * çıktı şemasıydı ve HAM `session.token`'ı TAŞIYORDU — `src/auth` DIŞINDAKİ
 * herhangi bir (gelecekteki) tüketici `r?.session.token` okuyabiliyordu
 * (ÖLÇÜLDÜ: `tsc`/`eslint` 0 hata). `AuthSessionReader.getSession` artık
 * Better Auth'un tipini DEĞİL, bu MODÜLDE tanımlı MİNİMAL bir sonucu
 * ({@link AuthSessionReaderResult}) döner — `AuthContextMiddleware`'in
 * ihtiyacı TAM BU İKİ alandır (`:89-93`), ham `token`/`expiresAt`/diğer
 * Better Auth alanları bu token'dan GEÇMEZ. Eşleme `auth.module.ts`'in
 * `useFactory`'sinde yapılır (`AUTH_INSTANCE`'ın KENDİSİ, HALA tam `Auth`,
 * `AuthModule` İÇİNDE kalır — bu daraltma YALNIZCA bu export'un sözleşmesi).
 */
export const AUTH_SESSION_READER = Symbol('AUTH_SESSION_READER')

/** {@link AuthSessionReader}'ın döndürdüğü, VERİ düzeyinde daraltılmış sonuç — ham `token` YOK. */
export type AuthSessionReaderResult = {
  readonly userId: string
  readonly sessionId: string
}

/** `AUTH_SESSION_READER` token'ının taşıdığı, `getSession`'a (METOT) VE sonucuna (VERİ) DARALTILMIŞ arayüz. */
export type AuthSessionReader = {
  readonly getSession: (
    input: Parameters<Auth['api']['getSession']>[0],
  ) => Promise<AuthSessionReaderResult | null>
}

/**
 * ROADMAP v0.0.15.1, T-017/S8a, po ⭐ KISIT (b) — `auth.module.ts:26-31`'in
 * YAZILI RED KARARININ ("ikinci bir token eklemek DEĞERLENDİRİLDİ VE
 * REDDEDİLDİ") kısmi GERİ ALINMASI. Bu DAHA ÖNCE reddedilen "tam kimlik
 * örneği token'ı" (`AUTH_INSTANCE`'ın KENDİSİ) DEĞİLDİR — `AUTH_SESSION_READER`
 * İLE AYNI daraltma disiplinine uyan, YENİ ve AYRI bir ÜÇÜNCÜ token:
 * `SessionsService`'in TAM yüzeyini (`revokeOwnSession`/`revokeAllOwnSessions`
 * DAHİL) değil, YALNIZCA okuma metodunu dışa açar.
 *
 * GERİ ALMA GEREKÇESİ (po'nun ölçtüğü yapısal kısıt): `apps/api/eslint.config.mjs:
 * 61-75` `AuthPrismaDatabase` ithalini `src/{prisma,auth}/**` DIŞINDA
 * YASAKLAR — `packages/trpc`'nin `SessionListReadPort`'unu `apps/api`'de
 * UYGULAYAN adaptör (T-017/S9, `src/trpc/**`) bu yüzden `SessionsService`'in
 * zaten yaptığı Prisma okumasını TEKRARLAYAMAZ; `SessionsService`'e DELEGE
 * ETMEK ZORUNDADIR. Delege edebilmesi için `TrpcModule`'ün `AuthModule`'den
 * BİR ŞEY import etmesi gerekir — ama `SessionsService`'in KENDİSİNİ
 * (sınıf olarak) `exports`'a koymak `revokeOwnSession`/`revokeAllOwnSessions`'ı
 * da (step-up/sahiplik DAVRANIŞI taşıyan YAZMA metotları) dışa açardı. Bu
 * token METOT YÜZEYİNİ `listOwnSessions`'a DARALTIR — tıpkı
 * `AUTH_SESSION_READER`'ın `getSession`'a daraltması gibi. `:26-31`'in
 * yazılı iddiası ("dışa açılan yüzey TEK token'a daraltıldı") bu yüzden
 * artık BAYATTIR ve o dosyadaki yorum GÜNCELLENMİŞTİR — ama İKİNCİ token
 * YAZMA yüzeyi AÇMAZ, yalnızca OKUMA.
 */
export const SESSION_LIST_READER = Symbol('SESSION_LIST_READER')

/** `SESSION_LIST_READER` token'ının taşıdığı, `listOwnSessions`'a DARALTILMIŞ arayüz. */
export type SessionListReader = {
  readonly listOwnSessions: (identity: CurrentUserIdentity) => Promise<readonly SessionSummary[]>
}
