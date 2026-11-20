// @arkesoft/errors — error-message-keys (kod → i18n anahtarı kayıt defteri)
// birim testleri (ROADMAP v0.0.18, T-027/S2, architect R-1 KARARI)
//
// Ölçülen sayılar (bkz. error-message-keys.ts dosya başı yorumu):
//   - 32 × apps/api/src/errors/domain/*.error.ts (bijektif kod/anahtar)
//   - 1 × apps/storefront/src/themes/registry.ts (THEME_RESOLUTION_FAILED)
//   - 2 × jenerik (error-body.ts: HTTP_EXCEPTION, INTERNAL_ERROR)
//   ⇒ 35 BENZERSİZ anahtar (docs/ux/T-027.md'nin 35 satırlık tablosuyla birebir)
//   - + 2 × Money programcı hatası (S5b'de doğacak) → mevcut
//     errors.internal.unknown'a eşlenir, YENİ anahtar AÇMAZ
//   ⇒ 37 KOD, 35 ANAHTAR.

import { describe, expect, expectTypeOf, it } from 'vitest'

import { ERROR_MESSAGE_KEYS, errorMessageKeySchema } from '../error-message-keys.js'
import type { ErrorMessageKey } from '../error-message-keys.js'

describe('ERROR_MESSAGE_KEYS', () => {
  it('tam olarak 37 kod taşır (32 domain + 1 storefront + 2 jenerik + 2 Money)', () => {
    expect(Object.keys(ERROR_MESSAGE_KEYS)).toHaveLength(37)
  })

  it('değerleri tam olarak 35 benzersiz anahtara indirgenir', () => {
    const uniqueValues = new Set(Object.values(ERROR_MESSAGE_KEYS))

    expect(uniqueValues.size).toBe(35)
  })

  it('her değer errorMessageKeySchema kümesinin ÜYESİDİR (pozitif kanıt)', () => {
    for (const value of Object.values(ERROR_MESSAGE_KEYS)) {
      expect(errorMessageKeySchema.safeParse(value).success).toBe(true)
    }
  })

  // ⚠ Mevcut `error-body.test.ts` pinlerinin (`'errors.http.generic'` /
  // `'errors.internal.unknown'`) defterden okuma geçişinden SONRA da BAYT-EŞ
  // kaldığının birebir kanıtı — AC-51'in tel sözleşmesi değişmedi şartı.
  it('jenerik iki kodun anahtarı error-body.ts pinleriyle birebir aynı', () => {
    expect(ERROR_MESSAGE_KEYS.HTTP_EXCEPTION).toBe('errors.http.generic')
    expect(ERROR_MESSAGE_KEYS.INTERNAL_ERROR).toBe('errors.internal.unknown')
  })

  // A-PO27-2 (BAĞLAYICI, po) — Money'nin iki kodu programcı hatasıdır,
  // kullanıcıya özel metin GÖSTERİLMEZ ⇒ mevcut jenerik anahtara eşlenir,
  // yazıcıları henüz doğmadığı için (S5b) burada "her kodun yazıcısı var"
  // testi YAZILMAZ (S2→S5b arası kırmızı pencere açmamak için).
  it('Money programcı hatalarının ikisi de errors.internal.unknown anahtarına eşlenir (çok-bire, kasıtlı)', () => {
    expect(ERROR_MESSAGE_KEYS.FRACTIONAL_MINOR_UNIT).toBe('errors.internal.unknown')
    expect(ERROR_MESSAGE_KEYS.CURRENCY_MISMATCH).toBe('errors.internal.unknown')
  })
})

describe('errorMessageKeySchema', () => {
  it('tam olarak 35 benzersiz anahtar taşır (kapalı küme)', () => {
    expect(errorMessageKeySchema.options).toHaveLength(35)
    expect(new Set(errorMessageKeySchema.options).size).toBe(35)
  })

  // ⚠ NEGATİF KANIT — katalogda/defterde olmayan bir anahtar REDDEDİLİR.
  // Küme dışındaki her değer (ham sunucu metni dahil) `null`'a elenecek
  // (S7'nin `normalize-panel-error.ts`'i); bu test o fail-closed davranışın
  // şema düzeyindeki ÖN KOŞULU.
  it('kümede olmayan bir anahtarı REDDEDER (negatif kanıt)', () => {
    expect(errorMessageKeySchema.safeParse('errors.uydurma.anahtar').success).toBe(false)
  })

  it('boş dizeyi ve rastgele bir ham sunucu metnini REDDEDER', () => {
    expect(errorMessageKeySchema.safeParse('').success).toBe(false)
    expect(errorMessageKeySchema.safeParse('Beklenmeyen bir hata oluştu.').success).toBe(false)
  })
})

describe('ErrorMessageKey tip testi', () => {
  // ⭐ `ErrorMessageKey` genel `string` DEĞİL — kapalı 35 anahtarlık
  // birleşimdir. Bu assert YALNIZCA `pnpm typecheck` (`tsc --noEmit`)
  // tarafından denetlenir; `vitest run` altında `expectTypeOf` çağrıları
  // çalışma zamanında no-op'tur (expect-type kütüphanesinin kendi belgelediği
  // davranış), bu yüzden dosya normal `.test.ts` olarak KALABİLİR — ayrı bir
  // `.test-d.ts` + `vitest.config.ts` değişikliği GEREKMEZ.
  // ⚠ `.not.toBeString()` BİLEREK KULLANILMAZ: `expect-type`'ın `toBeString`
  // denetimi "T, string'i GENİŞLETİR mi" sorar (`extends`) — bir string
  // literal BİRLEŞİMİ bu soruya da `true` döner, bu yüzden o yardımcı burada
  // YANLIŞ pozitif verir. `toEqualTypeOf` ise TAM (iki yönlü) eşitlik ister;
  // `ErrorMessageKey` genel `string`'e TAM EŞİT OLMADIĞI için bu negatif
  // assert doğru aracı kullanır.
  it('ErrorMessageKey genel string tipine TAM EŞİT DEĞİL, kapalı bir birleşimdir', () => {
    expectTypeOf<ErrorMessageKey>().not.toEqualTypeOf<string>()
  })

  // Totoloji karşıtı (packages/trpc/src/__tests__/router-output.test-d.ts
  // deseninin aynısı): beklenen birleşim LİTERAL yazılır, `error-message-keys.ts`
  // dosyasının KENDİ listesinden TÜRETİLMEZ — aksi hâlde kaynak dosyadan bir
  // anahtar silinirse bu test de SESSİZCE küçülür ve hiçbir şey YAKALAMAZ.
  it('ErrorMessageKey TAM OLARAK 35 literal anahtarın birleşimidir (totoloji karşıtı)', () => {
    expectTypeOf<ErrorMessageKey>().toEqualTypeOf<
      | 'errors.auth.accountTemporarilyLocked'
      | 'errors.auth.crossSiteRequestRejected'
      | 'errors.auth.emailNotVerified'
      | 'errors.auth.invalidPassword'
      | 'errors.auth.providerFailed'
      | 'errors.auth.rateLimitExceeded'
      | 'errors.auth.rateLimitStoreUnavailable'
      | 'errors.auth.sessionNotFound'
      | 'errors.auth.tenantMembershipRequired'
      | 'errors.auth.twoFactorRequiredForOwner'
      | 'errors.auth.unauthenticated'
      | 'errors.authz.permissionDenied'
      | 'errors.dependency.unavailable'
      | 'errors.http.generic'
      | 'errors.internal.unknown'
      | 'errors.job.enqueueFailed'
      | 'errors.job.handlerMissing'
      | 'errors.job.identifierMissing'
      | 'errors.job.notFound'
      | 'errors.job.payloadInvalid'
      | 'errors.mail.deliveryFailed'
      | 'errors.member.alreadyMember'
      | 'errors.member.invitationInvalid'
      | 'errors.member.invitationResendTooSoon'
      | 'errors.member.ownerMembershipProtected'
      | 'errors.member.pendingInvitationLimitReached'
      | 'errors.platform.adminRequired'
      | 'errors.platform.networkNotAllowed'
      | 'errors.requestContext.unavailable'
      | 'errors.tenant.contextRequired'
      | 'errors.tenant.notFound'
      | 'errors.tenant.resolutionFailed'
      | 'errors.theme.resolutionFailed'
      | 'errors.twoFactor.setupRequiredBeforeEnforcement'
      | 'errors.validation.failed'
    >()
  })

  it('ERROR_MESSAGE_KEYS değerleri ErrorMessageKey tipine atanabilir (derleme zamanı)', () => {
    expectTypeOf(ERROR_MESSAGE_KEYS.TENANT_NOT_FOUND).toEqualTypeOf<'errors.tenant.notFound'>()
    expectTypeOf(ERROR_MESSAGE_KEYS.HTTP_EXCEPTION).toExtend<ErrorMessageKey>()
  })
})
