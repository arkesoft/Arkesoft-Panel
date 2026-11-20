// @arkesoft/i18n — tr-TR hata metni kataloğu (ROADMAP v0.0.18, T-027/S5a)
//
// Kaynak: `docs/ux/T-027.md`'nin 35 satırlık tablosu. Metinler bu dosyaya
// TAŞINIRKEN DEĞİŞTİRİLMEDİ:
//   - 17 `BİREBİR`      — `apps/admin/src/messages/messages.ts:103-125`'ten
//     KARAKTER BAZINDA kopyalandı (bir boşluk/nokta farkı
//     `apps/admin/src/__tests__/messages.test.ts`'i kırar).
//   - 2  `YENİDEN KULLANIM` — aynı dosyanın Better Auth ailesinden
//     (`messages.ts:154-158`, `ACCOUNT_TEMPORARILY_LOCKED`/`INVALID_PASSWORD`).
//   - 16 `YENİ`          — `docs/ux/T-027.md`'nin yazdığı metinler.
//
// ⭐⭐ #22 `errors.member.invitationInvalid` ile #33
// `errors.member.alreadyMember`'ın AŞAĞIDA KASTEN BİREBİR AYNI metni
// taşıması bir YAZIM HATASI DEĞİL, bir GÜVENLİK KARARIDIR: iki kod
// arasındaki fark kullanıcıya ayırt edilebilir OLMAMALI, yoksa bir jeton
// deneyen saldırgan iki yanıtı karşılaştırarak jetonun sahte mi yoksa
// gerçek-ama-kullanılamaz mı olduğunu öğrenebilir — bir JETON GEÇERLİLİK
// ORACLE'I doğar (Orkestratörün bulgusu, `ux` düzeltme turu 1; önceki metin
// "Bu davet **artık** geçerli değil." idi, "artık" kelimesi davetin bir
// zamanlar var/geçerli olduğunu ima ediyordu). `satisfies Record<
// ErrorMessageKey, string>` için iki ayrı anahtarın aynı değeri taşıması
// TAMAMEN NORMALDİR — bu bir eksiklik/çakışma değildir.
//
// `PLATFORM_ADMIN_REQUIRED`/`errors.platform.adminRequired` ile
// `PERMISSION_DENIED`/`errors.authz.permissionDenied` KASITLI OLARAK FARKLI
// metin taşır — ikisi aynı isteğin alternatif dalları DEĞİL, birbirinden
// AYRIK iki yetkilendirme guard'ının (platformAdminProcedure vs
// permissionProcedure) ürünüdür; karşılaştırılabilecek "sahte" bir dal YOK
// (`docs/ux/T-027.md`'nin "Oracle taraması" bölümü, tam gerekçe orada).
//
// Beş `JOB_*` anahtarının metni kuyruk adı/handler adı/iş-tipi adı/retry
// sayısı İÇERMEZ — bu kodlar kullanıcıya HİÇ ulaşmaz (kuyruk altyapı
// hatası), ama katalog her kodun bir metni olmasını `satisfies` ile
// ZORUNLU kılar.
//
// ⚠⚠ KAPANIŞ MEKANİZMASI: `satisfies Record<ErrorMessageKey, string>` —
// eksik VEYA fazla anahtar `tsc --noEmit`'i KIRAR (`ErrorMessageKey`,
// `@arkesoft/errors`'ın 35 üyelik kapalı birleşimi, sonlu bir eşleme —
// indeks imzası DEĞİL).

import type { ErrorMessageKey } from '@arkesoft/errors'

export const TR_TR_ERROR_MESSAGES = {
  'errors.auth.accountTemporarilyLocked':
    'Çok fazla hatalı deneme yapıldı. Hesabınız güvenlik nedeniyle geçici olarak kilitlendi. Lütfen daha sonra tekrar deneyin.',
  'errors.auth.crossSiteRequestRejected':
    'Bu istek güvenlik nedeniyle reddedildi. Sayfayı yenileyip tekrar deneyin.',
  'errors.auth.emailNotVerified':
    'Hesabınızın e-posta adresi henüz doğrulanmadı. Giriş yapabilmek için e-postanızı doğrulayın.',
  'errors.auth.invalidPassword': 'Şifreniz doğrulanamadı. Tekrar deneyin.',
  'errors.auth.providerFailed':
    'Kimlik doğrulama sağlayıcısında beklenmeyen bir sorun oluştu. Lütfen daha sonra tekrar deneyin.',
  'errors.auth.rateLimitExceeded':
    'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.',
  'errors.auth.rateLimitStoreUnavailable':
    'Sistem şu anda yoğun. Lütfen birkaç dakika sonra tekrar deneyin.',
  'errors.auth.sessionNotFound': 'Oturumunuz bulunamadı. Lütfen tekrar giriş yapın.',
  'errors.auth.tenantMembershipRequired': 'Bu işlem için bir mağazaya üye olmanız gerekiyor.',
  'errors.auth.twoFactorRequiredForOwner':
    'Bu hesap için iki adımlı doğrulama zorunludur. Devam etmek için kurulumu tamamlayın.',
  'errors.auth.unauthenticated': 'Bu işlemi yapabilmek için giriş yapmanız gerekiyor.',
  'errors.authz.permissionDenied': 'Bu işlemi gerçekleştirme yetkiniz yok.',
  'errors.dependency.unavailable':
    'Sistem şu anda geçici olarak kullanılamıyor. Lütfen daha sonra tekrar deneyin.',
  'errors.http.generic': 'İsteğiniz işlenemedi. Lütfen tekrar deneyin.',
  'errors.internal.unknown': 'Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.',
  'errors.job.enqueueFailed': 'İşleminiz başlatılamadı. Lütfen daha sonra tekrar deneyin.',
  'errors.job.handlerMissing': 'İsteğiniz şu anda işlenemedi. Lütfen daha sonra tekrar deneyin.',
  'errors.job.identifierMissing':
    'İşleminiz şu anda takip edilemedi. Lütfen sayfayı yenileyip tekrar deneyin.',
  'errors.job.notFound': 'Aradığınız işlem bulunamadı.',
  'errors.job.payloadInvalid': 'İsteğiniz işlenemedi. Lütfen tekrar deneyin.',
  'errors.mail.deliveryFailed': 'E-posta gönderilemedi. Lütfen daha sonra tekrar deneyin.',
  // ⭐⭐ KASTEN BİREBİR AYNI metin — `errors.member.invitationInvalid` ile
  // (dosya başı yorumuna bakınız: güvenlik kararı, yazım hatası DEĞİL).
  'errors.member.alreadyMember': 'Bu davet geçerli değil.',
  'errors.member.invitationInvalid': 'Bu davet geçerli değil.',
  'errors.member.invitationResendTooSoon':
    'Bu daveti az önce gönderdiniz. Lütfen yeniden göndermeden önce birkaç dakika bekleyin.',
  'errors.member.ownerMembershipProtected':
    'Mağaza sahibinin üyeliği bu şekilde kaldırılamaz veya değiştirilemez.',
  'errors.member.pendingInvitationLimitReached':
    'Bekleyen davet sayısı sınırına ulaşıldı. Yeni davet göndermeden önce bekleyen davetlerden bazılarını tamamlayın veya iptal edin.',
  'errors.platform.adminRequired': 'Bu işlem için yönetici yetkisi gerekiyor.',
  'errors.platform.networkNotAllowed':
    'Bu işlem güvenlik nedeniyle bulunduğunuz konumdan gerçekleştirilemiyor.',
  'errors.requestContext.unavailable':
    'İsteğiniz işlenemedi. Lütfen sayfayı yenileyip tekrar deneyin.',
  'errors.tenant.contextRequired': 'Bu işlem için mağaza bağlamı gerekiyor.',
  'errors.tenant.notFound': 'İstenen mağaza bulunamadı.',
  'errors.tenant.resolutionFailed':
    'Mağaza bilgisi şu anda çözümlenemedi. Lütfen daha sonra tekrar deneyin.',
  'errors.theme.resolutionFailed':
    'Mağaza şu anda yanıt vermiyor. Lütfen daha sonra tekrar deneyin.',
  'errors.twoFactor.setupRequiredBeforeEnforcement':
    'Bu ayarı açmadan önce kendi iki adımlı doğrulamanızı kurmanız gerekiyor.',
  'errors.validation.failed':
    'Girdiğiniz bilgilerde bir sorun var. Lütfen alanları kontrol edip tekrar deneyin.',
} satisfies Record<ErrorMessageKey, string>
