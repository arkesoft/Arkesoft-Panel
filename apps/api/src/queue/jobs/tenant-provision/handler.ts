// @arkesoft/api — `tenant.provision` İSKELETİ (ROADMAP v0.0.11, T-013/S6,
// kapsam md 9)
//
// ⚠⚠ BU HANDLER GERÇEK İŞ YAPMAZ — ve bu bir eksiklik değil, KAPSAM KARARI
// (R-A11): gerçek kurulum (kiracı doğrulama, seed, tema kurulumu, arama
// indeksi, DNS, SSL, smoke test, `active`'e geçiş) v0.2.0'ın işidir ve o
// sürümün bağımlılıkları (v0.1.0, v0.0.19) HENÜZ TAMAMLANMADI — yani bugün
// gerçek kurulum YAPILAMAZ BİLE. Bu sürümde kanıtlanan şey ALTYAPIdır:
// adımlar koşuyor, her adım `tenantId` + `jobId` ile loglanıyor ve `progress`
// monoton ilerliyor.
//
// ⚠ `progress` ÖLÜ ALAN DEĞİL (PM riski R4): iskelet HER adımda
// `ctx.reportProgress()` çağırır. Son adımın hedefi BİLEREK 100 DEĞİL —
// `progress: 100` yazımı sarmalayıcının TAMAMLAMA adımına aittir (AC4). Son
// adım 100 yazsaydı, sarmalayıcının tamamlama yazımı test tarafından
// GÖZLEMLENEMEZDİ (iki yazıcı aynı değeri üretirdi).
//
// ⚠ VERİTABANINA DOKUNMUYOR: `ctx.withTenantDb` bu iskelette ÇAĞRILMIYOR
// çünkü yazacak gerçek bir şey yok. Yüzeyin gerçekten kiracıya kapsamlı
// olduğu (ve başka kiracıya ERİŞEMEDİĞİ) AC5'in izolasyon testinde, aynı
// sarmalayıcıdan geçen bir PROB handler'ı ile ölçülür.
//
// DI YOK (K5 katman 3): bu bir Nest provider'ı DEĞİL, düz bir fonksiyon →
// `PRISMA_CLIENT` token'ına DI ile erişemez. Bir servise ihtiyaç duyarsa o
// servis `tx`'i PARAMETRE olarak almak zorundadır (`TenantScopedProbe`
// emsali). Dördüncü katman olarak `apps/api/eslint.config.mjs`'in BEŞİNCİ
// dosya kümesi bu dizinde `PrismaService`/`withTenant`/`PrismaDatabase`
// importunu YASAKLAR.

import type { JobContext, JobHandler } from '../../job-definition.js'
import { TENANT_PROVISION_STEP_LOG_EVENT } from '../../queue-log-events.js'
import type { TenantProvisionPayload } from './payload.schema.js'

/** Tek bir kurulum adımı: adı (İngilizce, kararlı) ve bitiminde ulaşılan ilerleme. */
export type TenantProvisionStep = {
  readonly name: string
  readonly progressPercent: number
}

/**
 * Kurulum iskeletinin adımları. ⚠ Adlar v0.2.0'ın GERÇEK adımlarının
 * yerleşimini şimdiden sabitler (ROADMAP v0.2.0 maddeleriyle aynı sıra):
 * doğrulama → varsayılan veri → tema kurulumu → arama indeksi.
 *
 * ⚠ En büyük hedef 80: kalan 20 puan sarmalayıcının TAMAMLAMA yazımına
 * aittir (dosya başı yorumu).
 */
export const TENANT_PROVISION_STEPS: readonly TenantProvisionStep[] = [
  { name: 'validate-tenant', progressPercent: 20 },
  { name: 'seed-defaults', progressPercent: 40 },
  { name: 'install-theme', progressPercent: 60 },
  { name: 'build-search-index', progressPercent: 80 },
]

/**
 * Kiracı kurulum iskeleti. Her adımı loglar ve ilerlemeyi yazar; gerçek yan
 * etkisi YOKTUR.
 *
 * `payload` kullanılmıyor gibi görünse de imzada DURUR: `JobHandler<P>`
 * sözleşmesi payload'ı parse edilmiş olarak verir ve `ctx.tenantId` ile aynı
 * kiracıyı taşır (sarmalayıcı bağlamı PARSE EDİLMİŞ payload'dan kurar).
 * ⚠ `_payload` adı BİLEREK alt çizgili — iskeletin payload'ı TÜKETMEDİĞİ
 * burada okunur olsun, v0.2.0 onu kullandığında ad da düzelsin.
 */
export const tenantProvisionHandler: JobHandler<TenantProvisionPayload> = async (
  _payload: TenantProvisionPayload,
  ctx: JobContext,
): Promise<void> => {
  for (const step of TENANT_PROVISION_STEPS) {
    // Gövdedeki `tenantId`/`jobId` `ctx.logger`'a BIND'LİDİR (sarmalayıcı
    // `logger.child({ tenantId, jobId, jobName })` veriyor) — burada tekrar
    // yazılmaz, UNUTULAMAZ da.
    ctx.logger.info(
      { step: step.name, progressPercent: step.progressPercent },
      TENANT_PROVISION_STEP_LOG_EVENT,
    )

    await ctx.reportProgress(step.progressPercent)
  }
}
