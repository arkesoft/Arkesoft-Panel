// @arkesoft/api — TwoFactorComplianceService (ROADMAP v0.0.15, T-016/S6,
// ADR-0018)
//
// `AuthGuard`'ın ÜÇÜNCÜ zorlama kapısının (`owner` rolü için 2FA uyumluluğu)
// HESAPLAMA mantığı BURAYA çıkarıldı — `AuthGuard` bu sınıfın
// `assertOwnerCompliance`'ını (ZORLAR, FIRLATIR) tüketir. BU sınıfın TEK
// tüketicisi `AuthGuard`'dır (ÖNCEKİ yorum "İKİ TÜKETİCİ, TEK hesaplama"
// derdi — YANLIŞ, FIX turu 3/③'te DÜZELTİLDİ, solid tur3 bulgusu).
//
// GÜNCELLEME (T-016 FIX turu 2/M-4) — `session.me` zincirinin "servis"
// katmanı BU sınıfın `evaluateOwnerStatus`'unu TÜKETMEZ: `packages/trpc`'ye
// eklenen port (`ports/session-security-read.port.ts`) ve onun adaptörü
// (`apps/api/src/trpc/ports/session-security-read.port.adapter.ts`)
// BİLİNÇLİ OLARAK BU servisten BAĞIMSIZ kuruldu — adaptör `PrismaService.db.
// user` tablosunu KENDİSİ okur, `evaluateOwnerStatus`'u HİÇ ÇAĞIRMAZ (iki
// okuma AYNI tabloyu, AYNI kolonu sorgular ama KOD YOLU PAYLAŞILMAZ). Bu,
// "raporlanan, yazılmayan parça" (ÖNCEKİ yorumun iddiası) DEĞİL, BİLİNÇLİ
// bir mimari karardır — gerekçe: `session.me`'nin ihtiyacı (çağıranın KENDİ
// `twoFactorEnabled` bayrağı, rol/politika FARK ETMEZ) bu sınıfın
// `evaluateOwnerStatus`'unun ihtiyacından (SADECE `owner` rolü, kiracı
// POLİTİKASINA BAĞLI üç durumlu sonuç) YAPISAL OLARAK FARKLIDIR; ortak bir
// taban çıkarmak bu noktada YAPAY bir soyutlama olurdu. Beş yıl sonra okuyan
// kişi bu YÜZDEN bu iki yolu "tamamlanmamış bir zincir" OLARAK OKUMAMALI —
// BİLİNÇLİ olarak AYRI kurulmuş iki bağımsız okuma.
//
// GÜNCELLEME (T-016 FIX turu 1, madde 3/M-1, solid) — DI KAYDI ARTIK VAR:
// `auth.module.ts`'in `providers` dizisine EKLENDİ, `AuthGuard` bu sınıfı
// `@Inject` İLE alır (ÖNCEKİ manuel `new TwoFactorComplianceService(prismaService)`
// kaldırıldı). ÖNCEKİ gerekçe ("AuthGuard'ın DI imzasını değiştirmemek için
// manuel kurulum") solid'in somut senaryosuyla ÇÖZÜLDÜ: tek etkilenen test
// dosyası (`auth-guard.test.ts`) ikinci argümanı DOLDURACAK şekilde
// GÜNCELLENDİ. İkinci GERÇEK tüketici (ör. `session.me` zincirinin port
// adaptörü) eklendiğinde EK bir DI değişikliği GEREKMEZ — provider ZATEN
// kayıtlı.

import { Inject, Injectable } from '@nestjs/common'
import type { Logger } from 'pino'

import type { CurrentUserIdentity } from './auth-resolution.types.js'
import { TwoFactorRequiredError } from '../errors/domain/two-factor-required.error.js'
import { PrismaService } from '../prisma/prisma.service.js'

/**
 * `session.me`'nin istemciye taşıması GEREKEN üç durum (po "zincir bütün"
 * notu, `handoff-out.md`'ye bkz.) — isimler İSTEMCİNİN ayırt etmesi gereken
 * üç anlamla BİREBİR: (i) `not_required`, (ii) `satisfied`, (iii)
 * `setup_required` (kuruluma YÖNLENDİRME sinyali).
 */
export type TwoFactorComplianceStatus = 'not_required' | 'satisfied' | 'setup_required'

@Injectable()
export class TwoFactorComplianceService {
  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  /**
   * Belirli bir kiracıda `owner` rolündeki bir kullanıcının 2FA uyumluluk
   * durumunu hesaplar — FIRLATMAZ, saf OKUMA.
   *
   * ⚠ ÇAĞIRAN rolü ÖNCEDEN `owner` olarak doğrulamış OLMALIDIR — bu metot
   * rolü KENDİSİ sorgulamaz (`AuthGuard` ZATEN üyelik satırını `role` seçerek
   * okudu; burada tekrar sorgulamak gereksiz ÜÇÜNCÜ bir okuma olurdu).
   *
   * SIRA BİLİNÇLİ (`TenantSecurityService.updateSecurityPolicy`'nin AYNI
   * "önce ucuz okuma" deseni): kiracının politikası KAPALIYSA ikinci sorgu
   * (`user.twoFactorEnabled`) HİÇ ATILMAZ.
   *
   * ⚠ PLATFORM SEVİYESİ OKUMA, gerekçe yorumu (CLAUDE.md §3/§7): `tenant`
   * KİRACIYA BAĞLI değil, KİRACININ KENDİSİDİR, RLS'i YOK — `tenant` delegesi
   * `TenantTransactionClient`'IN allowlist'inde OLMADIĞI için `withTenant()`
   * içinden erişilemez; bu okuma `PrismaService.db` (platform seviyesi,
   * `AppPrismaDatabase`) üzerinden gider. `app_user` de PLATFORM SEVİYESİ bir
   * tablodur (`AUTH_SECRET_BEARING_TABLES`'TA YOK) — `arkesoft_app` bu
   * tabloyu okuyabilir, `two_factor` (sır taşıyan, YETKİSİZ) DEĞİL.
   *
   * ⚠ `tenant === null` (teorik, hard-delete — üretimde yol YOK) BİLİNÇLİ
   * OLARAK `not_required` SAYILIR — bu sınıfın tek tüketicisi `AuthGuard`,
   * tenant varlığını `TenantGuard` ZATEN doğruladı; burada tekrar
   * doğrulamak (veya farklı bir hatayla fırlatmak) iki guard'ın AYNI
   * anomaliyi İKİ FARKLI şekilde raporlamasına yol açardı.
   */
  async evaluateOwnerStatus(tenantId: string, userId: string): Promise<TwoFactorComplianceStatus> {
    const tenant = await this.prismaService.db.tenant.findUnique({
      where: { id: tenantId },
      select: { requireTwoFactorForOwner: true },
    })

    if (tenant?.requireTwoFactorForOwner !== true) {
      return 'not_required'
    }

    const user = await this.prismaService.db.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    })

    return user?.twoFactorEnabled === true ? 'satisfied' : 'setup_required'
  }

  /**
   * `AuthGuard`'ın zorlama kapısı — {@link evaluateOwnerStatus} `setup_required`
   * dönerse 403 `TwoFactorRequiredError` FIRLATIR. `context`/log PII İÇERMEZ
   * (CLAUDE.md §4/§7) — `tenantId`/`userId` ZATEN child logger'a bağlı,
   * burada İKİNCİ KEZ geçirilmez (`TenantMembershipRequiredError` dalının
   * AYNI gerekçesi, `auth.guard.ts`).
   */
  async assertOwnerCompliance(
    identity: CurrentUserIdentity,
    tenantId: string,
    logger: Logger,
  ): Promise<void> {
    const status = await this.evaluateOwnerStatus(tenantId, identity.userId)

    if (status === 'setup_required') {
      logger.warn('owner için 2FA zorunlu ama kurulu değil')
      throw new TwoFactorRequiredError(identity.userId, tenantId)
    }
  }
}
