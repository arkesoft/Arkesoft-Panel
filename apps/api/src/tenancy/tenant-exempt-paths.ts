// @arkesoft/api — tenant gerektirmeyen uç allowlist'i (ROADMAP v0.0.4,
// T-002/ST-5, architect K5/K-A4)
//
// FAIL-CLOSED TASARIM: varsayılan davranış "tenant zorunlu" — bu küme bir
// OPT-IN listesi DEĞİL, tam tersine bir OPT-OUT'tur. v0.0.5'ten sonra eklenen
// bir uç bu kümeye eklenmediği sürece tenant'sız AÇILAMAZ (AC7). Bu yüzden
// küme KASITLI OLARAK küçük tutulur ve TAM EŞLEŞME kullanılır — prefix/regex
// eşleşmesi burada YASAKTIR (bir gün `/health-check-bypass` gibi bir uç
// prefix'le yanlışlıkla muaf olabilir).
//
// Sabit TEK dosyada tanımlanır (K-A4, bağlayıcı): `TenantContextMiddleware`
// (ST-5) bu kümeyi OKUYARAK tenant çözümünü atlayıp `{ kind: 'exempt' }`
// yazan TEK aktif tüketicidir — `TenantGuard` (ST-5) ise bu kümeyi AYRICA
// SORGULAMAZ, middleware'in ürettiği `TenantResolution.kind === 'exempt'`
// sonucuna GÜVENİR (bkz. `tenant.guard.ts` dosya başı yorumu — tek kaynaktan
// okunan tek karar, iki yerde tekrarlanan path-eşleştirme mantığı YOK).
//
// Birim testi (`tenant-exempt-paths.test.ts`) kümenin TAM OLARAK bu on dört
// elemandan oluştuğunu assert eder — listeyi büyütmek bu testi DEĞİŞTİRMEYİ,
// yani kod inceleme görünürlüğünü ZORUNLU kılar (R4 telafisi #2).
// ⚠ O testin kardinalite assertion'ı `toContain`'e DÜŞÜRÜLEMEZ ve `.size`
// kontrolü KALDIRILAMAZ: inceleme görünürlüğü TAM OLARAK bu iki assert'ten
// geliyor. Küme eşitliği ELLE güncellenir.
//
// GÜNCELLEME (ROADMAP v0.0.5, T-006/S5, architect "TENANT İZOLASYONU" bölümü,
// PM riski 6 — BEKLENEN): 2 → 12. Gerekçe: panel giriş yüzeyi platform host'u
// `panel.arkesoft.{APP_BASE_DOMAIN}`'dir; `panel` `@arkesoft/tenancy`'nin
// `reserved-subdomains.ts:30`'unda REZERVE → `resolveHost` onu
// `reserved_subdomain` ile ÇÖZÜMSÜZ bırakır.
// Muafiyet OLMADAN hiçbir auth ucuna erişilemez (panel host'unda kiracı asla
// çözülemez — bu BEKLENEN, panel kiracı değildir).
//
// Eklenen 10 eleman, üç grup:
//   (1) 7 Better Auth delege yolu (`AUTH_DELEGATED_PATHS`, `auth-delegated-
//       paths.ts`'in TAM AYNI yedi literal'i — BİLEREK import EDİLMEDİ, PM
//       R3/architect bağlayıcı: "üretim kodunda tenancy → auth bağımlılığı
//       YOKTUR, listeler literal yazılır" — inceleme görünürlüğü AC9'un asıl
//       özelliği). A-G6 ölçümü yedinci yolu `/auth/forget-password`'den
//       GERÇEK sürümdeki `/auth/request-password-reset`'e DÜZELTTİ (bkz.
//       `auth-delegated-paths.ts` dosya başı yorumu).
//   (2) 3 kendi oturum ucumuz (`/auth/sessions`, `/auth/sessions/revoke`,
//       `/auth/sessions/revoke-all` — S6 YAZACAK, tenant'tan muaf ama
//       KİMLİKTEN muaf DEĞİL; `AUTH_EXEMPT_PATHS`'e (S6) GİRMEZLER).
//
// İKİ KÜME AYRI KALIR (PM R3, bağlayıcı): bu küme ("kiracı gerekmez") ile
// S6'nın `AUTH_EXEMPT_PATHS`'i ("kimlik gerekmez") İKİ AYRI güvenlik kararı —
// birleştirilmez. `/auth/sessions*` üçlüsü KİRACIDAN muaf (bu kümede) ama
// KİMLİKTEN muaf DEĞİL (`AUTH_EXEMPT_PATHS`'te YOK).
//
// FIX turu 1, madde 11 (solid M-1, bağlayıcı) — yol normalizasyonu ARTIK
// ortak `http/normalize-request-path.ts`'ten İTHAL EDİLİR (BEŞ kopyadan
// biriydi, bu dosya ORİJİNAL — dördü BUNDAN kopyalanmıştı). Ortak modül NE
// `tenancy`'ye NE `auth`'a bağımlı — PM R3'ün "tenancy → auth bağımlılığı
// YOKTUR" ilkesi KORUNUR (`http/` iki modülden de bağımsız bir KATMAN).
//
// GÜNCELLEME (ROADMAP v0.0.7, T-008/S3, architect K2, ADR-0011): 12 → 13,
// DÖRDÜNCÜ grup eklendi:
//   (4) 1 panel yüzeyi ucu (`/trpc/session.me`) — panel host'u
//       (`panel.arkesoft.{APP_BASE_DOMAIN}`) REZERVE bir alt alan adıdır
//       (`@arkesoft/tenancy`'nin `reserved-subdomains.ts:30`'u) → `resolveHost` onu `reserved_subdomain`
//       ile ÇÖZÜMSÜZ bırakır, bu ÖNCEKİ (1)/(2) grupları gibi tenant kavramı
//       BU uç için HİÇ geçerli değil. Muafiyet KİMLİK muafiyeti DEĞİLDİR
//       (`AUTH_EXEMPT_PATHS`'e HİÇBİR satır EKLENMEDİ, 9'da kalır) —
//       `session.me` `protectedProcedure` (oturumsuz 401) ve dönüş tipi
//       (`SessionIdentity`, `packages/trpc/src/schemas/session-identity.
//       schema.ts`) yalnızca `{userId, sessionId}` taşır, `tenantId`/`slug`/
//       `status` o tipe YAPISAL OLARAK giremez (sızdırmazlık tiple sağlanır,
//       testle değil). Mekanizma TAM EŞLEŞME + `allowBatching: false`
//       (`@arkesoft/trpc/server`) değişmezine dayanır — `trpc.controller.ts`
//       dosya başı yorumunun GÜNCEL hâline bkz. (ADR-0011).
//
// GÜNCELLEME (ROADMAP v0.0.14, T-014/S4, architect K-A9, ADR-0016 madde 6):
// 13 → 14, BEŞİNCİ grup eklendi:
//   (5) 1 YETENEK TABANLI kiracı bağlamı ucu (`/trpc/member.acceptInvitation`).
//
// ⚠⚠ BU, LİSTEDEKİ İLK VE TEK **YAZMA** UCUDUR — önceki on üçü ya I/O'suz
// prob, ya kimlik delegasyonu, ya kullanıcının kendi oturumları, ya da bir
// okuma. Bu yüzden muafiyetin gerekçesi bir cümleyle GEÇİŞTİRİLEMEZ:
// ADR-0016 madde 6, muafiyeti "GENEL BİR KİRACI KAYNAĞI DEĞİLDİR" diye
// nitelendiren DÖRT KOŞULA bağlar ve dördü de BU uç için sağlanır:
//
//   A. TEK DAYANAK YÜKSEK ENTROPİLİ BİR YETENEK BELİRTECİDİR — 256 bit
//      CSPRNG çıktısı; diskte yalnızca `sha256` ÖZETİ saklanır (ham belirteç
//      ASLA); süresi DOLAR (7 gün); TEK KULLANIMLIKTIR (kabul edilince satır
//      SİLİNİR). Çağıranın BEYAN ETTİĞİ bir kiracı kimliği YOKTUR — girdi
//      şemasında kiracı alanı YOK ve eklenemez.
//   B. BELİRTEÇTEN TÜREYEN BAĞLAM TEK BİR KİRACI KAPSAMLI BLOKTA KULLANILIR
//      ve o blokta BAŞKA kiracı verisi OKUNMAZ (yalnızca bu davetin satırı,
//      yeni üyelik ve denetim kaydı). Oturum sahibinin e-postası bloğun
//      DIŞINDA, PLATFORM seviyesinde okunur.
//   C. ÇIKTI ŞEMASI KİRACIYA AİT HİÇBİR ALAN TAŞIMAZ (tek `accepted` alanı)
//      ve resolver kiracı bağlamına ERİŞMEZ — erişemez de, çünkü builder'ı
//      kiracıyı daraltmıyor. Aksi hâlde geçerli bir belirteç bir kiracı
//      OKUMA yüzeyine dönüşürdü.
//   D. TÜM BAŞARISIZLIK MODLARI TEK HATA SINIFINA İNDİRGENİR — "belirteç yok",
//      "süresi geçmiş", "e-posta eşleşmiyor", "ikinci kez kullanıldı",
//      "biçim bozuk" ve "kiracı çözülemedi" AYNI 404'ü verir. Ayırmak
//      belirteci bir VARLIK ORACLE'ına çevirirdi.
//
// ⚠ BU MUAFİYET KİMLİK MUAFİYETİ DEĞİLDİR: `AUTH_EXEMPT_PATHS`'e HİÇBİR satır
// EKLENMEDİ. ⚠ O kümenin BÜYÜKLÜĞÜ burada TEKRARLANMIYOR — kanonik kaynağı
// `auth/auth-exempt-paths.ts`, kardinalite assertion'ı
// `__tests__/auth-exempt-paths.test.ts`. Gerekçe ÖLÇÜLDÜ: yukarıdaki (4)
// numaralı v0.0.7 paragrafı o kümeyi "9'da kalır" diye yazıyor, oysa küme
// v0.0.8'in eklemesiyle ONDAN BÜYÜK — kopyalanan sayı kaçınılmaz olarak
// bayatlıyor (teknik borç, `docs`'a bildirildi). v0.0.14 aynı hatayı
// TEKRARLAMIYOR. Kabul eden kişinin OTURUMU ZORUNLUDUR
// (`protectedProcedure`, oturumsuz 401) — belirteç kiracıyı kanıtlar, KİMLİĞİ
// kanıtlamaz; üyelik hangi kullanıcıya yazılacağı oturumdan okunur.
// ⚠ Kümeye bir sonraki ekleme BU GEREKÇE SEVİYESİNİ karşılamak zorundadır;
// yolu eklemek bir satır, NEDEN eklendiğini yazmak işin kendisidir.

import { normalizeRequestPath } from '../http/normalize-request-path.js'

/** Tenant çözümü gerektirmeyen, tam eşleşmeli on dört uç. */
export const TENANT_EXEMPT_PATHS: ReadonlySet<string> = new Set([
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
  // (5) ROADMAP v0.0.14 — YETENEK tabanlı kiracı bağlamı; dört koşul dosya
  // başı yorumunda SAYILI. Kümenin TEK yazma ucu.
  '/trpc/member.acceptInvitation',
])

/**
 * Bir istek URL'sinin (`req.url`) {@link TENANT_EXEMPT_PATHS}'teki bir yolla
 * TAM eşleşip eşleşmediğini belirler.
 *
 * - Yol `new URL(rawUrl, 'http://exempt-path-check.invalid').pathname`'den
 *   alınır — sorgu dizesi/fragman bu karşılaştırmaya KARIŞMAZ.
 * - Sondaki `/` SOYULUR (`/health/` da `/health` ile eşleşir) — kök yol `/`
 *   hariç (onu soymak boş dizeye düşürür).
 * - BÜYÜK/KÜÇÜK HARF DUYARLIDIR: `/HEALTH` muaf DEĞİLDİR → tenant ister →
 *   fail-closed (K5'in "varsayılan tenant zorunlu" kararının doğal sonucu).
 */
export function isTenantExemptPath(rawUrl: string): boolean {
  return TENANT_EXEMPT_PATHS.has(normalizeRequestPath(rawUrl))
}
