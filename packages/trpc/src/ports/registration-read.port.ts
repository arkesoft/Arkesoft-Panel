// @arkesoft/trpc — RegistrationReadPort (ROADMAP v0.1.0, T-019/S3, architect
// "TRPC SÖZLEŞMESİ" bölümü, ADR-0021)
//
// Port BİLDİRİLİR (burada), `apps/api`'de UYGULANIR (ayrı alt görev, S9).
// İKİ FARKLI TOTALLİK BİÇİMİ taşır — `job-read.port.ts`'in tek-örnek
// emsalinden FARKLI olarak bu dosyada İKİ metot, İKİ AYRI sebepten TOTAL'dır:
//
//   · `checkSlugAvailability` — kiracı kavramı GEÇERSİZDİR (henüz kiracı
//     yok); FIRLATMAZ, her girdi için {@link SlugAvailabilityOutcome}
//     üreten BEŞ değerli bir sonuç döner (`'available'` DAHİL). Soft-delete
//     edilmiş bir kiracının slug'ı `slug @unique` yüzünden HÂLÂ TUTULUR —
//     bu yüzden müsaitlik soft-delete edilmiş satırları da DİKKATE ALARAK
//     hesaplanır (ADR-0021 §3): aksi hâlde kontrol "müsait" derdi, kayıt
//     benzersizlik ihlaliyle PATLARDI (AC-6'nın yarış senaryosunun BİR
//     kademe ÖNCESİ).
//
//   · `onboardingChecklist` — ADR-0021 §2'nin BEŞ koşulu BAĞLAYICIDIR; seçici
//     `slug`'dır, `tenantId` DEĞİL (ADR-0021 §3.1 DÜZELTMESİ, T-019/S3
//     düzeltme turu — `slug` kullanıcının GENEL adresidir, opak `tenantId`
//     YENİ bir cihazda BİLİNEMEZ): (A) `slug` girdiden GELİR ama GÜVENİLMEZ —
//     yalnızca hangi bağlamın KURULACAĞINI seçer. (B) SAHİPLİK DOĞRULAMASI
//     İLK İŞTİR: kiracı satırının KENDİSİ (platform tablosu) doğrulamadan
//     ÖNCE OKUNMAZ — aksi hâlde bu fonksiyon bir VARLIK ORACLE'INA dönüşürdü.
//     (C) DÖRT ret modu ("kiracı yok", "üye değil", "soft-delete", "biçim
//     bozuk") AYNI `AppError`'a (404) indirgenir — bu arayüzün BİÇİMİ o
//     garantiyi taşır: ayrımı ifade edebilecek bir dönüş değeri (`null`,
//     `Result` birleşimi) YOKTUR, çağıran o ayrımı YAZAMAZ bile. (D) çıktı
//     YALNIZCA çağıranın kendi kiracısına ait adım/durum çiftleri taşır.

import type { OnboardingChecklist, SlugAvailability } from '../schemas/registration.schema.js'

export interface RegistrationReadPort {
  /**
   * Bir slug'ın kayıt için müsait olup olmadığını kontrol eder. `tenantId`
   * PARAMETRESİ YOKTUR — bu uç kiracı kapsamlı DEĞİLDİR (ADR-0021 §1,
   * `protectedProcedure` · kiracı kavramı geçersiz). Oran sınırı/
   * numaralandırma savunması (ADR-0021 §3 koşul E) BU PORTUN DIŞINDADIR —
   * HTTP katmanında (`apps/api` oran sınırı politikası) uygulanır; bu
   * fonksiyon dallanmaz, FIRLATMAZ.
   */
  checkSlugAvailability(slug: string): Promise<SlugAvailability>

  /**
   * Bir kiracının onboarding kontrol listesini döndürür. `actorUserId`
   * kimlik bağlamından (`ctx.auth.userId`) gelir, `slug` GİRDİDEN (ADR-0021
   * §3.1 DÜZELTMESİ — seçici `tenantId` DEĞİL `slug`) — ikisi birlikte
   * sahiplik doğrulamasının İKİ girdisidir (ADR-0021 §2 koşul A+B, dosya başı
   * yorumu). Doğrulama BAŞARISIZ olursa (kiracı yok / üye değil / soft-delete
   * / biçim bozuk) port AYNI `AppError`'ı (404) fırlatır; bu fonksiyon
   * `null`/`undefined` DÖNMEZ ve o dört durumu AYIRT EDEBİLECEK bir dönüş
   * değeri TAŞIMAZ.
   */
  onboardingChecklist(actorUserId: string, slug: string): Promise<OnboardingChecklist>
}
