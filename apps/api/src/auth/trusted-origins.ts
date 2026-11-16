// @arkesoft/api — güvenilir tarayıcı orijinleri (ROADMAP v0.0.20, T-021/S6,
// ADR-0023 §4 "Üçüncü tarayıcı orijini: GÜVENİLİR ORİJİN LİSTESİ")
//
// ADR-0011:85-92 bu yüzeyi BİLEREK TEK DEĞERDE bıraktı ve maliyetini yazdı:
// "İkinci bir tarayıcı orijini (süper admin paneli) geldiğinde bu yetersiz
// kalacaktır — bilinçli olarak bugün çözülmemiştir", kararı ADIYLA v0.0.20'nin
// architect'ine bıraktı. ADR-0023 §4 (a) yolunu seçti: güvenilir orijin artık
// BİR LİSTE, CORS AÇILMADAN.
//
// ⚠⚠ TEK TÜRETME FONKSİYONU — bu dosyanın VARLIK SEBEBİ. ADR-0011'in "iki
// origin kontrolü TEK KAYNAKTAN beslenir" garantisi (`:92`) burada KORUNUR:
// `apps/api/src/auth/same-origin.guard.ts` (`SameOriginGuard`) VE
// `apps/api/src/auth/auth-instance.ts` (Better Auth'un `trustedOrigins`
// seçeneği) BU fonksiyonu tüketir — orijin listesi İKİ YERDE AYRI AYRI
// TÜRETİLMEZ. `apps/api/src` içinde `AUTH_BASE_URL`'DEN orijin türeten
// (`new URL(...).origin`) TEK yer BURASIDIR (R-A1 azaltma (a)'nın mekanik
// kanıtı: `grep -rn "AUTH_BASE_URL" apps/api/src` çıktısında bu dosya DIŞINDA
// hiçbir yer `.origin` TÜRETMEZ — diğer kullanımlar `AUTH_BASE_URL`'i TAM URL
// olarak taşır, bağlantı/istek kurmak için, orijin KARŞILAŞTIRMASI için DEĞİL).
//
// ⚠⚠ JOKER / ALT ALAN ADI DESENİ YASAK (R-A1 azaltma (d), ADR-0023 §4 madde 3).
// Liste TAM EŞLEŞMELİ orijin dizeleri taşır. Bu dosyada önek/sonek tabanlı bir
// metin eşleme yardımcısı (ör. dizenin baş/son kısmıyla karşılaştırma) veya
// yıldızlı bir alt alan adı deseni KULLANILMAZ — bu yüzden bu yorum da o
// jetonları BİTİŞİK YAZMAZ (AGENT_BASELINE §5 "literal-jeton kuralı"): aksi
// halde bu dosyayı denetleyen mekanik tarama kendi açıklama metnini bulgu
// sanırdı. Mekanik kanıt dışarıdan (handoff raporunda) aynen tutulur.
//
// `SUPERADMIN_BASE_URL` VERİLMEDİĞİNDE davranış BUGÜNKÜYLE BAYT-BİREBİR
// AYNIDIR (ADR-0023 §4.5) — dönen dizi TEK elemanlıdır (`[origin(AUTH_BASE_URL)]`),
// bu yüzden `SameOriginGuard`'ın eski (tek orijinli) davranışı DEĞİŞMEZ ve bu
// değişiklik `minor`dır, operatör müdahalesi ZORUNLU DEĞİLDİR.

import type { ApiEnv } from '../config/api-env.js'

/**
 * Güvenilir tarayıcı orijinleri listesi — TAM eşleşmeli orijin dizeleri
 * (joker/alt alan adı deseni YOK). Her zaman en az bir eleman taşır
 * (`AUTH_BASE_URL`'in orijini); `SUPERADMIN_BASE_URL` verilmişse onun orijini
 * İKİNCİ eleman olarak eklenir (ADR-0023 §4, Karar 4, madde 1).
 *
 * Kardinalite (R-A1 azaltma (b)): `SUPERADMIN_BASE_URL` yoksa dizi **tam 1**
 * eleman, varsa **tam 2** eleman taşır — `trusted-origins.test.ts` bunu
 * `toHaveLength` ile (`toContain`'e İNDİRİLMEDEN) doğrular.
 */
export function resolveTrustedOrigins(env: ApiEnv): readonly string[] {
  const origins: string[] = [new URL(env.AUTH_BASE_URL).origin]

  if (env.SUPERADMIN_BASE_URL !== undefined) {
    origins.push(new URL(env.SUPERADMIN_BASE_URL).origin)
  }

  return origins
}
