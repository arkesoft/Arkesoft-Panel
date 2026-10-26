// @arkesoft/api — TenantResolverService (ROADMAP v0.0.4, T-002/ST-5,
// architect K-A4/K-A5)
//
// `TenantContext` DEĞERİNİ üretebilen TEK yer burasıdır — fabrika (bkz.
// `toResolvedContext` altta) MODÜL İÇİ kalır, dışa açılmaz. Bu, K-A5'in
// bağlayıcı kararı: istek girdisinden (başlık, body, query) tenant
// UYDURULAMAZ; her `TenantContext` ya buradaki BİR Prisma okumasından
// (slug/primaryDomain tekil indeksi) ya da hiç üretilmez.
//
// GİRDİ ÖNCELİĞİ (K-A4, bağlayıcı):
//   1. `env.NODE_ENV !== 'production'` VE `x-arkesoft-tenant` TEK değerli VE
//      BOŞ değilse → değer YALNIZCA slug olarak yorumlanır (asla alan adı).
//      `NODE_ENV` burada `API_ENV` PROVIDER'INDAN okunur, `process.env`'den
//      DEĞİL — testler provider override ile çalışır, GLOBAL MUTASYON YOK
//      (AC6). Üretimde başlık VARSA bile TAMAMEN YOK SAYILIR
//      (`header_rejected_in_production`) — host'a GERİ DÜŞÜLMEZ: üretimde bu
//      başlığı göndermek Kullanıcı Onayı #1'in kapattığı deliği DENEME
//      sinyalidir, kendi başına gözlemlenebilir bir "çözümsüz" sonuç olmalı
//      (R4 telafisi #7).
//   2. Aksi hâlde `Host` başlığından (`resolve-host.ts`, SAF fonksiyon).
//
// SORGU BÜTÇESİ: istek başına EN FAZLA 1 `findUnique`, AYRIK dallar (slug
// XOR primaryDomain, asla ikisi). ÇÖZÜMSÜZ hâllerin HİÇBİRİNDE sorgu
// ATILMAZ — ucuz ret, host taraması DoS yüzeyi DEĞİL. `select` MİNİMAL:
// `name` ALINMAZ (context iş verisi taşımaz). ÖNBELLEK YOK (A-V26, RLS
// yokken hatalı bir önbellek anahtarı doğrudan çapraz tenant sızıntısıdır).

import { Inject, Injectable } from '@nestjs/common'
import type { Tenant } from '@arkesoft/db'

import type { NodeEnv } from '@arkesoft/config/env'

import type { ApiEnv } from '../config/api-env.js'
import { API_ENV } from '../config/config.tokens.js'
import type { HttpRequestHeaders } from '../http/http-request.types.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { TenantContext, TenantResolution } from '../request-context/request-context.types.js'
import { normalizeHostname, resolveHost } from './resolve-host.js'

/** `TenantResolverService`'in Prisma'dan okuduğu MİNİMAL satır şekli — `name` YOK. */
type TenantRow = Pick<Tenant, 'id' | 'slug' | 'status' | 'deletedAt'>

/**
 * `resolve()`'un DAR dönüş tipi — `TenantResolution`'ın TAMAMI DEĞİL: bu
 * servis `pending`/`exempt` ÜRETMEZ (onlar middleware'in işi, yukarıdaki
 * dosya başı yorumu) ve beklenmedik hatada FIRLATIR (`failed` bir DÖNÜŞ
 * DEĞERİ değil, `TenantContextMiddleware`'in `catch` bloğu ÜRETİR). Bu dar
 * tip sayesinde `TenantContextMiddleware`'deki `kind === 'resolved'` dalının
 * ELSE'i yalnızca `unresolved`'a daralır — `.reason` erişimi TİP GÜVENLİDİR.
 */
type ResolvedOrUnresolvedTenantResolution = Extract<
  TenantResolution,
  { readonly kind: 'resolved' | 'unresolved' }
>

const TENANT_SELECT = { id: true, slug: true, status: true, deletedAt: true } as const

/** `x-arkesoft-tenant` geliştirici başlığının sınıflandırılmış sonucu (modül içi). */
type DevHeaderClassification =
  | { readonly kind: 'absent' }
  | { readonly kind: 'use-slug'; readonly slug: string }
  | {
      readonly kind: 'unresolved'
      readonly reason: 'multiple_host_headers' | 'header_rejected_in_production'
    }

/**
 * `x-arkesoft-tenant` başlığını K-A4'ün girdi önceliği kuralına göre
 * sınıflandırır. SAF, modül içi — DI'ya bağımlı değil, test ediliş
 * `TenantResolverService.resolve()` üzerinden dolaylı yapılır.
 */
function classifyDevHeader(
  headerValue: string | string[] | undefined,
  nodeEnv: NodeEnv,
): DevHeaderClassification {
  if (headerValue === undefined) {
    return { kind: 'absent' }
  }

  if (Array.isArray(headerValue)) {
    if (headerValue.length === 0) {
      return { kind: 'absent' }
    }
    // Dizi (çoklu `x-arkesoft-tenant` başlığı) → İLK DEĞER SEÇİLMEZ, direkt
    // çözümsüz (K-A4). Üretimde zaten başlık YOK SAYILACAĞI için üretimde bu
    // dal `header_rejected_in_production` ile raporlanır — ortam bilgisi
    // sebep adında da kaybolmaz.
    return nodeEnv === 'production'
      ? { kind: 'unresolved', reason: 'header_rejected_in_production' }
      : { kind: 'unresolved', reason: 'multiple_host_headers' }
  }

  if (headerValue.length === 0) {
    return { kind: 'absent' }
  }

  if (nodeEnv === 'production') {
    return { kind: 'unresolved', reason: 'header_rejected_in_production' }
  }

  return { kind: 'use-slug', slug: headerValue }
}

@Injectable()
export class TenantResolverService {
  /** `APP_BASE_DOMAIN` açılışta `resolve-host.ts`'in AYNI normalizasyonundan geçer (K-A4). */
  private readonly normalizedBaseDomain: string
  private readonly nodeEnv: NodeEnv

  constructor(
    @Inject(API_ENV) env: ApiEnv,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
  ) {
    const normalized = normalizeHostname(env.APP_BASE_DOMAIN)

    // `APP_BASE_DOMAIN` `infraEnvSchema`'da boş olmayan bir dize olarak
    // doğrulanmıştır (`nonEmptyString`); `new URL('http://' + ...)` boş
    // olmayan bir host için (host kısmı) pratikte HER ZAMAN ayrıştırılabilir.
    // Bu dal yalnızca YANLIŞ YAPILANDIRMAYA karşı erken ve AÇIK bir açılış
    // hatasıdır (sessizce `undefined` tenant eşlemesiyle ilerlemek yerine).
    if (normalized === undefined) {
      throw new Error(
        `TenantResolverService: APP_BASE_DOMAIN ("${env.APP_BASE_DOMAIN}") normalize edilemedi.`,
      )
    }

    this.normalizedBaseDomain = normalized
    this.nodeEnv = env.NODE_ENV
  }

  /**
   * Bir isteğin tenant'ını çözer. Dönüş değeri HER ZAMAN `TenantResolution`
   * birleşiminin `resolved`/`unresolved` dallarından biridir — `exempt`/
   * `pending` burada ÜRETİLMEZ (onlar `TenantContextMiddleware`'in/
   * `RequestContextMiddleware`'in işi).
   */
  async resolve(headers: HttpRequestHeaders): Promise<ResolvedOrUnresolvedTenantResolution> {
    const devHeader = classifyDevHeader(headers['x-arkesoft-tenant'], this.nodeEnv)

    if (devHeader.kind === 'unresolved') {
      return { kind: 'unresolved', reason: devHeader.reason }
    }

    if (devHeader.kind === 'use-slug') {
      return this.resolveBySlug(devHeader.slug, 'dev-header')
    }

    const hostResult = resolveHost(headers['host'], this.normalizedBaseDomain)

    switch (hostResult.kind) {
      case 'unresolved':
        return { kind: 'unresolved', reason: hostResult.reason }
      case 'subdomain':
        return this.resolveBySlug(hostResult.slug, 'subdomain')
      case 'custom-domain':
        return this.resolveByPrimaryDomain(hostResult.host)
      default:
        return assertNeverHostResult(hostResult)
    }
  }

  private async resolveBySlug(
    slug: string,
    source: TenantContext['source'],
  ): Promise<ResolvedOrUnresolvedTenantResolution> {
    // `tenant_slug_key` tekil indeksi — TEK sorgu, `findFirst` DEĞİL.
    const row = await this.prismaService.db.tenant.findUnique({
      where: { slug },
      select: TENANT_SELECT,
    })

    return TenantResolverService.toResolution(row, source)
  }

  private async resolveByPrimaryDomain(
    host: string,
  ): Promise<ResolvedOrUnresolvedTenantResolution> {
    // `tenant_primary_domain_key` tekil indeksi — TEK sorgu, `mode: 'insensitive'` YOK
    // (indeksi bypass eder).
    const row = await this.prismaService.db.tenant.findUnique({
      where: { primaryDomain: host },
      select: TENANT_SELECT,
    })

    return TenantResolverService.toResolution(row, 'custom-domain')
  }

  /**
   * `TenantContext` DEĞERİNİ üreten TEK yer (K-A5 — bu metodun `private
   * static` olması BİLİNÇLİ: dışa açılmaz, yalnızca BU sınıfın başarılı bir
   * Prisma okumasından sonra çağrılır).
   *
   * `deletedAt` filtresi KODDA, çekimden SONRA uygulanır — `where`'e
   * eklenmesi sorguyu `findFirst`'e düşürür ve tekil indeks okumasını bozar
   * (K-A4, bağlayıcı). `status === 'suspended'` ÇÖZÜLMÜŞ SAYILIR, context'e
   * YAZILIR, burada HTTP'de ENGELLENMEZ — bu davranış v0.1.0/v0.0.8 kararı,
   * burada kural İCAT EDİLMEZ.
   */
  private static toResolution(
    row: TenantRow | null,
    source: TenantContext['source'],
  ): ResolvedOrUnresolvedTenantResolution {
    if (row === null) {
      return { kind: 'unresolved', reason: 'no_row' }
    }

    if (row.deletedAt !== null) {
      return { kind: 'unresolved', reason: 'soft_deleted' }
    }

    const tenant: TenantContext = {
      id: row.id,
      slug: row.slug,
      status: row.status,
      source,
    }

    return { kind: 'resolved', tenant }
  }
}

/** `resolveHost`'un dönüş birleşiminin EXHAUSTIVE olduğunu derleme zamanında kanıtlar. */
function assertNeverHostResult(value: never): never {
  throw new Error(`tenant-resolver.service.ts: beklenmeyen host sonucu — ${JSON.stringify(value)}`)
}
