// @arkesoft/api — TENANT_EXEMPT_PATHS testleri (ROADMAP v0.0.4, T-002/ST-5,
// architect K-A4/K5, R4 telafisi #2)
//
// Kümenin TAM OLARAK on dört elemandan oluştuğunu assert eder — listeyi
// büyütmek bu testi DEĞİŞTİRMEYİ (inceleme görünürlüğünü) ZORUNLU kılar.
//
// GÜNCELLEME (ROADMAP v0.0.5, T-006/S5): 2 → 12 (gerekçe `tenant-exempt-
// paths.ts` dosya başı yorumunda — panel host'u rezerve alt alan adı,
// muafiyet olmadan hiçbir auth ucuna erişilemez).
//
// GÜNCELLEME (ROADMAP v0.0.7, T-008/S3, architect K2, ADR-0011): 12 → 13
// (`/trpc/session.me` — dördüncü grup, gerekçe `tenant-exempt-paths.ts`
// dosya başı yorumunda). `.size`'ı gevşetmek / `toContain`'e düşmek yasak —
// küme eşitliği ELLE güncellendi.
//
// GÜNCELLEME (ROADMAP v0.0.14, T-014/S4, architect K-A9, ADR-0016 madde 6):
// 13 → 14 (`/trpc/member.acceptInvitation` — BEŞİNCİ grup ve kümenin İLK
// YAZMA ucu; muafiyetin DÖRT koşulu `tenant-exempt-paths.ts` dosya başı
// yorumunda tek tek SAYILI). ⚠ Kardinalite assertion'ı KORUNDU: `.size`
// kontrolü ne kaldırıldı ne `toContain`'e düşürüldü — küme eşitliği yine
// ELLE güncellendi. ⚠ `AUTH_EXEMPT_PATHS` BU sürümde DEĞİŞMEDİ; büyüklüğü
// BURADA TEKRARLANMIYOR (kendi kardinalite assertion'ı
// `auth-exempt-paths.test.ts`'te yaşıyor ve ÖLÇÜLDÜ: oradaki sayı,
// `tenant-exempt-paths.ts`'in v0.0.7 paragrafının kopyaladığı sayıdan
// FARKLI — v0.0.8 o kümeye bir satır eklemişti). İki eksenin birlikte
// oynamadığının mekanik kanıtı `auth-path-sets.test.ts` ve
// `auth-exempt-paths.test.ts`'tedir.
//
// GÜNCELLEME (ROADMAP v0.0.15, T-016/S5, po'nun ölçümü + bu alt görevin
// KENDİ doğrulaması): 14 → 20, ALTINCI grup — `tenant-exempt-paths.ts`
// dosya başı yorumunda gerekçeli altı two-factor yolu. Kardinalite
// assertion'ı yine KORUNDU (`.size`/küme eşitliği ELLE güncellendi).
//
// GÜNCELLEME (ROADMAP v0.0.15.1, T-017/S9, ADR-0019 §9 + `/trpc/session.me`
// emsali): 20 → 21, YEDİNCİ grup — `/trpc/session.list` (gerekçe
// `tenant-exempt-paths.ts` dosya başı yorumunda). ⚠ Kardinalite assertion'ı
// KORUNDU: `.size` kontrolü ne kaldırıldı ne `toContain`'e düşürüldü — küme
// eşitliği yine ELLE güncellendi. `AUTH_EXEMPT_PATHS` BU satırla DEĞİŞMEDİ
// (12'de kalır).

import { describe, expect, it } from 'vitest'

import { isTenantExemptPath, TENANT_EXEMPT_PATHS } from '../tenancy/tenant-exempt-paths.js'

const EXPECTED_EXEMPT_PATHS = [
  '/health',
  '/health/ready',
  '/auth/sign-up/email',
  '/auth/sign-in/email',
  '/auth/sign-out',
  '/auth/verify-email',
  '/auth/send-verification-email',
  '/auth/request-password-reset',
  '/auth/reset-password',
  '/auth/sessions',
  '/auth/sessions/revoke',
  '/auth/sessions/revoke-all',
  '/trpc/session.me',
  '/trpc/member.acceptInvitation',
  '/auth/two-factor/enable',
  '/auth/two-factor/disable',
  '/auth/two-factor/get-totp-uri',
  '/auth/two-factor/generate-backup-codes',
  '/auth/two-factor/verify-totp',
  '/auth/two-factor/verify-backup-code',
  '/trpc/session.list',
] as const

describe('TENANT_EXEMPT_PATHS', () => {
  it('tam olarak yirmi bir eleman taşır', () => {
    expect(TENANT_EXEMPT_PATHS.size).toBe(21)
  })

  it('küme TAM OLARAK beklenen yirmi bir elemandır', () => {
    expect(new Set(TENANT_EXEMPT_PATHS)).toEqual(new Set(EXPECTED_EXEMPT_PATHS))
  })

  it.each(EXPECTED_EXEMPT_PATHS)('%s tam eşleşmeyle muaftır', (path) => {
    expect(isTenantExemptPath(path)).toBe(true)
  })

  it('sondaki "/" soyulur — /health/ de muaftır', () => {
    expect(isTenantExemptPath('/health/')).toBe(true)
  })

  it('/HEALTH muaf DEĞİLDİR — büyük/küçük harf DUYARLI (fail-closed)', () => {
    expect(isTenantExemptPath('/HEALTH')).toBe(false)
  })

  it('prefix eşleşmesi YASAK — /health/x muaf değildir', () => {
    expect(isTenantExemptPath('/health/x')).toBe(false)
  })

  it('kök yol "/" muaf değildir', () => {
    expect(isTenantExemptPath('/')).toBe(false)
  })

  it('sorgu dizesi/fragman karşılaştırmaya karışmaz', () => {
    expect(isTenantExemptPath('/health?foo=bar')).toBe(true)
    expect(isTenantExemptPath('/health/ready?x=1')).toBe(true)
  })

  it('tamamen ilgisiz bir yol muaf değildir', () => {
    expect(isTenantExemptPath('/products')).toBe(false)
  })

  // ROADMAP v0.0.6, T-007/S6, architect riski 8 — muafiyet kümesi regresyonu:
  // `/trpc/*`'nin GERİ KALANI (yalnızca `/trpc/session.me` ve v0.0.14'te
  // eklenen `/trpc/member.acceptInvitation` HARİÇ) BİLİNÇLİ OLARAK bu kümede
  // DEĞİL — tam eşleşme, prefix/regex YASAK.
  it('/trpc/tenant.current MUAF DEĞİLDİR — tRPC yüzeyinin GERİ KALANI kiracı bağlamından muaf değil', () => {
    expect(isTenantExemptPath('/trpc/tenant.current')).toBe(false)
  })

  // GÜNCELLEME (ROADMAP v0.0.8, T-009/S7, ADR-0012): `/trpc/storefront.
  // currentTenant` `AUTH_EXEMPT_PATHS`'e eklendi (kimlik ekseni) AMA bu
  // kümeye (kiracı ekseni) EKLENMEDİ — vitrin ziyaretçisi KİMLİKSİZDİR ama
  // KİRACISIZ DEĞİLDİR, kiracı `Host`'tan ÇÖZÜLMEK ZORUNDADIR
  // (`TenantGuard`'ın çözümsüz host'u 404 ile reddetme davranışı KORUNUR).
  // Kardinalite assert'i BU satırla DEĞİŞMEDİ — iki ekseni OYNAMADIĞININ
  // mekanik kanıtı budur.
  it('/trpc/storefront.currentTenant MUAF DEĞİLDİR — kimlik ekseni açıldı, kiracı ekseni OYNAMADI', () => {
    expect(isTenantExemptPath('/trpc/storefront.currentTenant')).toBe(false)
  })

  // GÜNCELLEME (ROADMAP v0.0.14, T-014/S4): davet AKIŞININ diğer üç ucu
  // kiracı kapsamlıdır ve muafiyet YALNIZCA kabul ucuna verildi. Bu üç assert
  // muafiyetin namespace'e DEĞİL tek bir yola verildiğinin kanıtıdır — prefix
  // eşleşmesi olsaydı davet/rol/çıkarma uçları da sessizce muaf olurdu.
  it.each(['/trpc/member.invite', '/trpc/member.updateRole', '/trpc/member.remove'])(
    '%s MUAF DEĞİLDİR — muafiyet namespace’e değil TEK yola verildi',
    (path) => {
      expect(isTenantExemptPath(path)).toBe(false)
    },
  )
})
