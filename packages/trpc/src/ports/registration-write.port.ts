// @arkesoft/trpc — RegistrationWritePort (ROADMAP v0.1.0, T-019/S3, architect
// "TRPC SÖZLEŞMESİ" bölümü, ADR-0021 §4)
//
// Port BİLDİRİLİR (burada), `apps/api`'de UYGULANIR (ayrı alt görev, S9).
// ADR-0009 madde 3: port TOTAL'dır — "slug alınmış"/"slug rezerve"/"slug
// erişilemez" durumları BURAYA `Result` birleşimi veya `boolean` olarak
// GELMEZ, adaptör mevcut `ValidationError` mekanizmasını kullanarak alan
// bazlı bir `AppError` fırlatır (architect F3 çürütmesi — YENİ bir `AppError`
// sınıfı AÇILMAZ); bu port bir `if (sonuç === 'taken')` dalı YAZDIRMAZ.
//
// ⚠⚠ KAYIT YAZIMI TEK TRANSACTION'DIR (ADR-0021 §4, `withNewTenant()`) —
// kiracı satırı VE `tenant_membership(owner)`/`subscription` satırları AYNI
// transaction'da yazılır; bu bağlayıcı sıra PORTUN ARKASINDADIR, sözleşme
// katmanı sırayı GÖRMEZ. İki fazlı bir yazım (kiracı sonra üyelik) bu
// arayüzün TASARIMINDA YOKTUR — tek metot, tek dönüş, dallanma SIFIR.

import type { CreateTenantInput, CreateTenantResult } from '../schemas/registration.schema.js'

export interface RegistrationWritePort {
  /**
   * Yeni bir kiracı yaratır. `actorUserId` YARATAN kimliktir — kayıt anında
   * henüz bir kiracı/üyelik YOKTUR, bu yüzden `tenantId` PARAMETRESİ YOKTUR
   * (ADR-0021 §2 koşul A: "kiracı henüz yok çünkü bu çağrı onu yaratıyor").
   * `actorUserId` aynı zamanda yaratılan kiracıda `tenant_membership(owner)`
   * satırının ÖZNESİDİR (F7) — sahiplik bu çağrının YAN ETKİSİDİR, ayrı bir
   * davet/kabul adımı YOKTUR.
   *
   * Dönen `status` HER ZAMAN `'pending'`dir (AC-1); `slug` REDDEDİLİRSE
   * (alınmış/rezerve/biçim bozuk/erişilemez) port `AppError` fırlatır ve
   * HİÇBİR satır yazılmaz — sahipsiz kiracı sınıfı `withNewTenant()`'ın tek
   * transaction garantisiyle YAPISAL olarak İMKÂNSIZDIR (ADR-0021 §4).
   *
   * ⚠⚠ Dönüş değeri OPAK `tenantId`'yi TAŞIMAZ (ADR-0021 §3.1 DÜZELTMESİ,
   * T-019/S3 düzeltme turu) — adaptör yaratılan satırın iç kimliğini
   * KULLANIR (örn. `onboardingChecklist`/sonraki adımlar için gerekirse
   * kendi tarafında), ama bu portun SÖZLEŞMESİ onu çağırana GERİ VERMEZ;
   * çağıran kiracısını `slug` İLE tanır.
   */
  createTenant(actorUserId: string, input: CreateTenantInput): Promise<CreateTenantResult>
}
