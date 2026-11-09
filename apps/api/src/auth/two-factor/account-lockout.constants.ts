// @arkesoft/api — 2FA hesap kilitleme sabitleri (ROADMAP v0.0.15, T-016/S4)
//
// Better Auth'un `two-factor` eklentisi (ÖLÇÜLDÜ, `better-auth@1.7.14`,
// `plugins/two-factor/verify-two-factor.mjs:117-182`) hesap seviyesinde bir
// kilitleme mekanizmasını ZATEN KENDİ İÇİNDE taşıyor: `accountLockout`
// seçeneği (`maxFailedAttempts`/`durationSeconds`), `two_factor` tablosunun
// `failedVerificationCount`/`lockedUntil` kolonlarını ATOMİK `incrementOne()`
// çağrılarıyla günceller. `packages/db/prisma/schema.prisma`'daki `TwoFactor`
// modeli (S1) bu KOLON ADLARIYLA BİREBİR eşleşecek şekilde ELLE yazıldı (şema
// dosya başı yorumu, "Better Auth'un `symmetricEncrypt`'i" paragrafı) — bu
// yüzden BURADA ikinci, BAĞIMSIZ bir sayaç/kilit mekanizması YAZILMAZ: aynı
// satırı iki ayrı yazıcı güncellerse (bizim kodumuz + eklentinin kendi
// `incrementOne`'ı) yarış durumu doğar ve `failedVerificationCount` tutarsız
// hâle gelir.
//
// Bu dosyanın TEK amacı: eklentinin varsayılanlarıyla SAYISAL OLARAK AYNI
// olan eşiği (10 deneme / 900 saniye) modül sabiti olarak AÇIKÇA tanımlamak
// — CLAUDE.md §4 "sihirli sayı gömme" disiplini `auth-instance.ts`'in
// `twoFactor({accountLockout: {...}})` çağrısında bu adlandırılmış
// sabitlerle YAPILIR, eklentinin dokümante edilmemiş varsayılanına ÖRTÜK
// GÜVENİLMEZ (kütüphane bir SONRAKİ sürümde varsayılanı değiştirirse bizim
// davranışımız SABİT kalır).
//
// `errors/domain/account-temporarily-locked.error.ts`'in dosya başı yorumu:
// eklentinin kendi ürettiği 429 yanıtı `AuthController`'ın delege yolunda
// OLDUĞU GİBİ forward edilir (`auth-provider-failed.error.ts`'in AYNI
// "Better Auth'un KENDİ normal hata yanıtları dönüştürülmez" ilkesi) — bu iki
// sabit bugün yalnızca BU yapılandırma çağrısında ve testlerde tüketilir.

/** Ardışık başarısız ikinci faktör doğrulaması, hesap kilitlenmeden önce. */
export const ACCOUNT_LOCKOUT_MAX_FAILED_ATTEMPTS = 10

/** Kilitlenme süresi (saniye). */
export const ACCOUNT_LOCKOUT_DURATION_SECONDS = 900
