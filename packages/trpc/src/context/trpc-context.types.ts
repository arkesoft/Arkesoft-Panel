// @arkesoft/trpc — sunucu tarafı context sözleşmesi (ROADMAP v0.0.6, T-007/ST-2,
// architect K1/K5, ADR-0009)
//
// `apps/api`'nin context fabrikası (`apps/api/src/trpc/trpc-context.factory.ts`,
// S5) `getRequestContext()`'i
// YALNIZCA OKUYARAK bu şekli doldurur — context EAGER kurulur (`createContext`
// fırlamaz), `requestId` her zaman dolu. `errorFormatter`'ın `ctx` parametresi
// buna rağmen tipçe `TrpcContext | undefined`dir (@trpc/server'ın kendi
// imzası, S1'in ölçtüğü dört bilgiden #3); bu dosyanın EAGER garantisi o
// optionality'yi TİP DÜZEYİNDE ortadan kaldırmaz.

import type { TenantStatusWire } from '../schemas/tenant-summary.schema.js'
import type { JobReadPort } from '../ports/job-read.port.js'
import type { MemberWritePort } from '../ports/member-write.port.js'
import type { MembershipReadPort } from '../ports/membership-read.port.js'
import type { SessionListReadPort } from '../ports/session-list-read.port.js'
import type { SessionSecurityReadPort } from '../ports/session-security-read.port.js'
import type { TenantReadPort } from '../ports/tenant-read.port.js'
import type { TenantSecurityWritePort } from '../ports/tenant-security-write.port.js'
import type { StorefrontTenantReadPort } from '../ports/storefront-tenant-read.port.js'
import type { TrpcErrorFactoryPort } from '../ports/trpc-error-factory.port.js'

/**
 * Discriminated union — kimlik doğrulama durumu. `requireAuth` middleware'i
 * (trpc.ts) bu alanı daraltarak `protectedProcedure`/`tenantProcedure`
 * resolver'larına `kind: 'authenticated'` garantisini context override
 * mekanizmasıyla taşır.
 */
export type TrpcAuthState =
  | { readonly kind: 'authenticated'; readonly userId: string; readonly sessionId: string }
  | { readonly kind: 'anonymous' }

/**
 * Discriminated union — kiracı bağlamı durumu. `requireTenant` middleware'i
 * bu alanı daraltır. `status` {@link TenantStatusWire} — `@arkesoft/db`'den
 * İMPORT EDİLMEZ (ADR-0009 madde 5, `tenant-summary.schema.ts`'teki gerekçe).
 */
export type TrpcTenantState =
  | {
      readonly kind: 'resolved'
      readonly tenantId: string
      readonly slug: string
      readonly status: TenantStatusWire
    }
  | { readonly kind: 'absent' }

/**
 * Enjekte edilen logger portu — pino'ya (veya herhangi bir somut kütüphaneye)
 * BAĞIMLI DEĞİL (architect riski 11: aşırı yüklenmiş pino imzalarının
 * atanabilirliğine güvenilmiyor). `apps/api` ince bir adaptör geçirir
 * (`apps/api/src/trpc/trpc-logger.adapter.ts`, S5). CLAUDE.md §4 log formatı
 * (yapılandırılmış JSON, `tenantId` dolu) bu portun ARKASINDA, `apps/api`'de
 * uygulanır.
 */
export interface TrpcLoggerPort {
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
}

/**
 * Context'ten enjekte edilen tüm port arayüzlerinin toplu sözleşmesi
 * (ADR-0009 madde 2). Resolver'lar `ctx.ports.*` üzerinden tek bir çağrı
 * yapar; portlar `apps/api`'de uygulanır.
 *
 * `storefrontTenantRead` (ROADMAP v0.0.8, T-009/S5, ADR-0012) BİLEREK
 * `tenantRead`'den AYRI bir port — ikisinin dönüş tipi farklıdır
 * (`StorefrontTenant` vs. `TenantSummary`); sızdırmazlık bu ayrıma dayanır.
 *
 * ⚠⚠ `jobRead` (ROADMAP v0.0.11, T-013/S8) ZORUNLU bir üyedir — opsiyonel
 * (`?`) YAPILMASI YASAKTIR (po R-P2, bağlayıcı). Emsal: `storefrontTenantRead`
 * v0.0.8'de AYNI biçimde zorunlu eklendi ve `apps/api`'nin
 * `trpc-http.test.ts`'i bunu "v0.0.8'den itibaren ZORUNLU" diye YAZIYOR.
 * Opsiyonel bir port, bu nesneyi ELLE kuran her yerin (bugün üretimde BİR,
 * testlerde ÜÇ yer) portu doldurmayı sessizce ATLAMASINA izin verirdi —
 * prosedür çalışma zamanında `undefined` üzerinde patlardı. Zorunluluk bu
 * sapmayı DERLEME HATASINA çevirir; bu üyeyi `?` ile gevşetmek bir typecheck
 * hatasını susturmak için YAPILMAZ, doğru çözüm portu DOLDURMAKTIR.
 *
 * ⚠⚠ AYNI KURAL ÜYELİK OKUMA ve ÜYE YAZMA PORTLARI İÇİN DE BAĞLAYICIDIR
 * (ROADMAP v0.0.14, T-014/S2, po R-PM5): ikisi de ZORUNLU üyedir. Bunları
 * eklemek bu nesneyi elle kuran YEDİ yerde (üretimde bir, testlerde altı)
 * derleme hatası üretir ve bu İSTENEN davranıştır — "typecheck hatasını
 * susturmak için opsiyonel yapmak" bu dosyanın yazılı yasağıdır.
 * ⚠ Yasağı DENETLEYEN grep bu iki üye adının hemen ardından bir soru
 * işareti+iki nokta arar; bu yorum o dizgiyi BİTİŞİK YAZMAZ (AGENT_BASELINE.md
 * §5 literal-jeton kuralı) — aksi hâlde kapı kalıcı yanlış pozitif verirdi.
 */
export interface TrpcPorts {
  readonly tenantRead: TenantReadPort
  readonly storefrontTenantRead: StorefrontTenantReadPort
  readonly jobRead: JobReadPort
  /**
   * ROADMAP v0.0.14, T-014/S2 — ZORUNLU üye. `permissionProcedure`'ün rol
   * okuduğu TEK yol; port TOTAL'dır (üyelik yoksa `AppError` fırlatır).
   */
  readonly membershipRead: MembershipReadPort
  /** ROADMAP v0.0.14, T-014/S2 — ZORUNLU üye. `member.*` mutation'larının iş mantığı. */
  readonly memberWrite: MemberWritePort
  /**
   * ROADMAP v0.0.15, T-016/S7 — ZORUNLU üye (aynı kural, `memberWrite`'ın
   * emsali): `tenant.updateSecurityPolicy` mutation'ının iş mantığı. Opsiyonel
   * (`?`) YAPILMASI YASAK — bu nesneyi elle kuran her yerin portu DOLDURMASI
   * gerekir, susturma değil.
   */
  readonly tenantSecurityWrite: TenantSecurityWritePort
  /**
   * ROADMAP v0.0.15, T-016 FIX turu 2/M-4 — ZORUNLU üye (AYNI kural,
   * `tenantSecurityWrite`'ın emsali): `session.me`'nin `twoFactorEnabled`
   * alanını doldurur (`app_user.two_factor_enabled`'ın KULLANICI seviyesi
   * echo'su — KİRACIYA BAĞLI DEĞİL, `tenantSecurityWrite`'ın tersine
   * `ctx.tenant.tenantId` İLE PARAMETRELENMEZ). Opsiyonel (`?`) YAPILMASI
   * YASAK — bu nesneyi elle kuran her yerin (üretimde bir, testlerde iki yer)
   * portu DOLDURMASI gerekir, bir typecheck hatasını susturmak için GEVŞETME
   * değil.
   */
  readonly sessionSecurityRead: SessionSecurityReadPort
  /**
   * ROADMAP v0.0.15.1, T-017/S4 — ZORUNLU üye (AYNI kural, `sessionSecurityRead`'in
   * emsali): `session.list`'in tek veri kaynağı. Opsiyonel (`?`) YAPILMASI
   * YASAK — bu nesneyi elle kuran her yerin (bugün üretimde bir, testlerde
   * üç yer — `harness.ts` + `procedures.test.ts` + `member-procedures.test.ts`)
   * portu DOLDURMASI gerekir, bir typecheck hatasını susturmak için GEVŞETME
   * değil. `apps/api`'nin karşılık gelen üç literal kurulum yeri (üretim +
   * iki test dosyası) bu alt görevin KAPSAMI DIŞINDADIR — S9 kapatacak.
   */
  readonly sessionListRead: SessionListReadPort
}

/**
 * `initTRPC.context<TrpcContext>()`'in sabitlediği tek context şekli
 * (architect "tRPC sözleşmesi" bölümü). Beş alan:
 *   - `requestId`  — EAGER kurulum garantisiyle her zaman dolu (string).
 *   - `logger`     — {@link TrpcLoggerPort}, somut kütüphaneye bağımlı değil.
 *   - `auth`       — {@link TrpcAuthState}, `AuthGuard`'ın ürettiği bağlamın
 *                    OKUNMASI (yeniden yazılmaz, V2 DOĞRULANDI).
 *   - `tenant`     — {@link TrpcTenantState}, `TenantGuard`'ın ürettiği
 *                    bağlamın OKUNMASI (V2 DOĞRULANDI).
 *   - `ports`      — {@link TrpcPorts}, iş mantığına erişimin TEK yolu.
 *   - `errors`     — {@link TrpcErrorFactoryPort}, hata kodu/i18n anahtarı
 *                    sahipliği `apps/api`'de kalır; trpc'de hiçbir hata kodu
 *                    LİTERALİ yok (AC9(a)).
 */
export interface TrpcContext {
  readonly requestId: string
  readonly logger: TrpcLoggerPort
  readonly auth: TrpcAuthState
  readonly tenant: TrpcTenantState
  readonly ports: TrpcPorts
  readonly errors: TrpcErrorFactoryPort
}
