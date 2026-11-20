// @arkesoft/i18n — tr-tr-errors.ts (TR_TR_ERROR_MESSAGES) testleri
// (ROADMAP v0.0.18, T-027/S5a)
//
// ⚠ Bu dosya gerçek defteri (`@arkesoft/errors`) ve gerçek kataloğu
// (`TR_TR_ERROR_MESSAGES`) OKUR — hiçbirini MUTASYONA UĞRATMAZ. Drift
// kanıtı `diffCatalogAgainstKeys`'in (catalog-diff.ts) GERÇEK veriyle tek
// seferlik, salt-okunur çağrısıyla alınır.
//
// ⚠⚠ MUTASYON KANITI bu dosyanın testiyle DEĞİL, handoff'ta elle
// çalıştırılan `pnpm typecheck` komutuyla gösterilir (bir anahtar silinip/
// eklenip derleme zamanı hatasının görülmesi, sonra Edit ile geri alınması)
// — `satisfies Record<ErrorMessageKey, string>` bunu `tr-tr-errors.ts`'te
// ZATEN mekanik olarak zorluyor.

import { errorMessageKeySchema } from '@arkesoft/errors'
import { describe, expect, it } from 'vitest'

import { diffCatalogAgainstKeys } from '../catalog-diff.js'
import { TR_TR_ERROR_MESSAGES } from '../tr-tr-errors.js'

describe('TR_TR_ERROR_MESSAGES', () => {
  it('tam olarak 35 anahtar taşır', () => {
    expect(Object.keys(TR_TR_ERROR_MESSAGES)).toHaveLength(35)
  })

  it('⚠ hiçbir değer boş dize DEĞİL', () => {
    const emptyKeys = Object.entries(TR_TR_ERROR_MESSAGES)
      .filter(([, value]) => value.length === 0)
      .map(([key]) => key)

    expect(emptyKeys).toEqual([])
  })

  it('her anahtar kapalı kümenin (errorMessageKeySchema) ÜYESİ', () => {
    for (const key of Object.keys(TR_TR_ERROR_MESSAGES)) {
      expect(errorMessageKeySchema.safeParse(key).success).toBe(true)
    }
  })

  it('⭐⭐ gerçek defter ile gerçek katalog arasında DRİFT YOK (diffCatalogAgainstKeys, salt okuma)', () => {
    const keys = errorMessageKeySchema.options

    expect(diffCatalogAgainstKeys(keys, TR_TR_ERROR_MESSAGES)).toEqual({
      missing: [],
      orphan: [],
    })
  })

  it('⭐⭐ #22 INVITATION_INVALID ve #33 ALREADY_MEMBER KASTEN birebir aynı metni taşır (oracle önleme, yazım hatası DEĞİL)', () => {
    expect(TR_TR_ERROR_MESSAGES['errors.member.invitationInvalid']).toBe(
      TR_TR_ERROR_MESSAGES['errors.member.alreadyMember'],
    )
    expect(TR_TR_ERROR_MESSAGES['errors.member.invitationInvalid']).toBe('Bu davet geçerli değil.')
  })

  it('PLATFORM_ADMIN_REQUIRED ve PERMISSION_DENIED KASITLI olarak FARKLI metin taşır (ayrık yetkilendirme guard çiftleri, oracle riski YOK)', () => {
    expect(TR_TR_ERROR_MESSAGES['errors.platform.adminRequired']).not.toBe(
      TR_TR_ERROR_MESSAGES['errors.authz.permissionDenied'],
    )
  })

  it('17 BİREBİR metinden temsilci örnekler apps/admin/src/messages/messages.ts ile KARAKTER BAZINDA eş (tam diff handoff DoD komutuyla da doğrulanır)', () => {
    expect(TR_TR_ERROR_MESSAGES['errors.auth.providerFailed']).toBe(
      'Kimlik doğrulama sağlayıcısında beklenmeyen bir sorun oluştu. Lütfen daha sonra tekrar deneyin.',
    )
    expect(TR_TR_ERROR_MESSAGES['errors.internal.unknown']).toBe(
      'Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.',
    )
    expect(TR_TR_ERROR_MESSAGES['errors.auth.invalidPassword']).toBe(
      'Şifreniz doğrulanamadı. Tekrar deneyin.',
    )
  })
})
