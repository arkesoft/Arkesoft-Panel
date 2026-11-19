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
//
// GÜNCELLEME (ROADMAP v0.0.21.1, T-025/S1, `K2` mekanizması): `ADDITIONAL_
// TRUSTED_ORIGINS` türetmeye EKLENDİ. Sıra BAĞLAYICI:
// `[origin(AUTH_BASE_URL), origin(SUPERADMIN_BASE_URL)?, ...origins(ADDITIONAL)]`,
// TEKİLLEŞTİRME ile (aynı orijin iki kaynaktan gelirse liste ŞİŞMEZ —
// `toHaveLength` iddiaları anlamlı kalır). `ADDITIONAL_TRUSTED_ORIGINS`'in
// VERİLMEDİĞİ hâl (varsayılan `''`) hâlâ BAYT-BİREBİR eski davranıştır.
//
// ⚠⚠ KİRACI ORİJİNİ REDDİ BURADA — ŞEMADA (`config/api-env.ts`) DEĞİL. Bir
// girdinin hostname'i `APP_BASE_DOMAIN`'in TEK ETİKETLİ bir alt alan adıysa
// VE etiket `RESERVED_SUBDOMAINS` üyesi DEĞİLSE bu fonksiyon FIRLAR
// (`panel`/`superadmin`/`api`/`www`/`app` GEÇER; `kiraci` GEÇMEZ). Gerekçe
// (`R12`, `po` ÖLÇTÜ): `apps/api/src/__tests__/helpers/create-test-app.ts:
// 492-494` `API_ENV` sağlayıcısını `overrideProvider(API_ENV).useValue(...)`
// ile TAMAMEN override ediyor ⇒ `parseEnv`/şema doğrulamaları o testlerde
// HİÇ ÇALIŞMAZ. Bu kontrol ŞEMADA olsaydı, override edilmiş env'lerde
// ATLANIRDI; TÜRETMEDE olunca `app.init()`'te (Better Auth kurulumu VE
// `SameOriginGuard`'ın türetmeyi çağırdığı HER yerde) FIRLAR.
// `RESERVED_SUBDOMAINS` `@arkesoft/tenancy`'den TÜKETİLİR (`apps/api`'nin
// ZATEN bağımlılığı) — o pakete YAZILMAZ.
//
// ⚠ BAĞLAYICI YENİ DAVRANIŞ — bu fonksiyon ARTIK FIRLAYABİLİR, bu yüzden
// YALNIZCA AÇILIŞ ZAMANINDA çağrılabilir (bir istek işleme döngüsünde
// ÇAĞRILMAZ). `SameOriginGuard.canActivate`'in BUGÜNKÜ hâli bu fonksiyonu
// HER İSTEKTE çağırıyor (T-025/S3'ün taşıyacağı borç — türetme guard'ın
// YAPICISINA alınacak, bu turun kapsamı DEĞİL).
//
// ⚠⚠ `R13` SINIRI — virgül ayrıştırması YALNIZCA `ADDITIONAL_TRUSTED_ORIGINS`
// ortam DEĞERİNE uygulanır. `Origin` BAŞLIĞI ASLA virgülden BÖLÜNMEZ: Node
// yinelenen `Origin` başlıklarını virgülle BİRLEŞTİRİR ve bu
// `same-origin-guard-measurements.qa.test.ts:77-82`'de ÖLÇÜLMÜŞ bir
// fail-closed davranıştır ("iki ayrı `Origin:` satırı → 403
// `origin_mismatch`") — bölmek BYPASS üretir. Bu dosyadaki virgül mantığı
// (env DEĞERİ içindir) `same-origin.guard.ts`'teki başlık işleme koduna
// ASLA taşınmaz/uygulanmaz.

import { normalizeHostname, RESERVED_SUBDOMAINS } from '@arkesoft/tenancy'

import { splitAdditionalTrustedOrigins } from '../config/api-env.js'
import type { ApiEnv } from '../config/api-env.js'

/**
 * `hostname`'in `normalizedBaseDomain`'in TEK ETİKETLİ bir alt alan adı
 * olup olmadığını belirler — `@arkesoft/tenancy`'nin `resolveHost`'undaki
 * `label.includes('.')` kontrolüyle AYNI tanım (iç içe alt alan adı
 * SAYILMAZ). Çıplak taban alan adının kendisi (`hostname === normalizedBaseDomain`)
 * de SAYILMAZ — o bir alt alan adı DEĞİLDİR. Eşleşme yoksa `undefined` döner.
 */
function singleLabelSubdomain(hostname: string, normalizedBaseDomain: string): string | undefined {
  if (hostname === normalizedBaseDomain) {
    return undefined
  }

  const subdomainSuffix = `.${normalizedBaseDomain}`

  if (!hostname.endsWith(subdomainSuffix)) {
    return undefined
  }

  const label = hostname.slice(0, hostname.length - subdomainSuffix.length)

  return label.length > 0 && !label.includes('.') ? label : undefined
}

/**
 * Güvenilir tarayıcı orijinleri listesi — TAM eşleşmeli orijin dizeleri
 * (joker/alt alan adı deseni YOK). Her zaman en az bir eleman taşır
 * (`AUTH_BASE_URL`'in orijini); `SUPERADMIN_BASE_URL` verilmişse onun orijini
 * İKİNCİ eleman olarak eklenir (ADR-0023 §4, Karar 4, madde 1);
 * `ADDITIONAL_TRUSTED_ORIGINS` verilmişse (ROADMAP v0.0.21.1, T-025/S1) onun
 * orijinleri SIRAYLA en sona eklenir — tüm liste TEKİLLEŞTİRİLİR.
 *
 * Kardinalite (R-A1 azaltma (b)): `SUPERADMIN_BASE_URL` yoksa dizi **tam 1**
 * eleman, varsa **tam 2** eleman taşır — `trusted-origins.test.ts` bunu
 * `toHaveLength` ile (`toContain`'e İNDİRİLMEDEN) doğrular.
 *
 * ⚠⚠ FIRLATABİLİR (T-025/S1'den itibaren) — `ADDITIONAL_TRUSTED_ORIGINS`
 * içinde `APP_BASE_DOMAIN`'in REZERVE OLMAYAN tek etiketli bir alt alan adı
 * (bir kiracı seçicisi) varsa `Error` fırlatır. Bu dosyanın dosya başı
 * GÜNCELLEME yorumuna bak — YALNIZCA açılış zamanında çağrılabilir.
 */
export function resolveTrustedOrigins(env: ApiEnv): readonly string[] {
  const normalizedBaseDomain = normalizeHostname(env.APP_BASE_DOMAIN) ?? env.APP_BASE_DOMAIN

  const origins: string[] = [new URL(env.AUTH_BASE_URL).origin]

  if (env.SUPERADMIN_BASE_URL !== undefined) {
    origins.push(new URL(env.SUPERADMIN_BASE_URL).origin)
  }

  for (const entry of splitAdditionalTrustedOrigins(env.ADDITIONAL_TRUSTED_ORIGINS)) {
    const parsedEntry = new URL(entry)
    const origin = parsedEntry.origin
    const label = singleLabelSubdomain(parsedEntry.hostname, normalizedBaseDomain)

    if (label !== undefined && !RESERVED_SUBDOMAINS.has(label)) {
      throw new Error(
        'ADDITIONAL_TRUSTED_ORIGINS bir kiracı alt alan adı içeremez (rezerve olmayan tek etiketli alt alan adı tespit edildi)',
      )
    }

    origins.push(origin)
  }

  return [...new Set(origins)]
}
