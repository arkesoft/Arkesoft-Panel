// @arkesoft/api — istek yolu normalizasyonu (FIX turu 1, madde 11 — solid
// M-1, medium; T-021 FIX turu 1, madde F1/F2 — security tur1, `high`)
//
// `auth-delegated-paths.ts` · `auth-exempt-paths.ts` · `auth-own-paths.ts` ·
// `rate-limit/rate-limit.policy.ts` · `tenancy/tenant-exempt-paths.ts` ·
// `platform/platform-admin-ip.guard.ts`'in SAF, BİREBİR aynı yol
// normalizasyonunun BİRLEŞTİRİLMİŞ hâli (beş kopya, dördü T-006'da doğdu —
// dosyaların kendi yorumları "BİREBİR AYNI" diyerek bunu ZATEN beyan
// ediyordu). Bu Task `assertNever`'ın üç kopyasını TAM BU gerekçeyle (aynı
// sebeple birlikte değişmesi gereken kod, tek yerde durmalı) birleştirmeyi
// ZORUNLU kılmıştı — aynı standart burada da uygulanır.
//
// SAF (framework-bağımsız, `express`/`fastify` import YOK) — `http/`
// altında, NE `tenancy`'ye NE `auth`'a BAĞIMLI: altı çağıranın YARISI
// `tenancy/**`'de, YARISI `auth/**`'de/`platform/**`'de olduğu için modül
// `tenancy → auth` (veya tersi) bağımlılığı DOĞURMAZ (PM R3 korunur).
// `errors/assert-never.ts` İSTİSNA DEĞİL — SIFIR bağımlılıklı, zaten
// `auth/**`/`tenancy/**`/`trpc/**`'in TAMAMI TARAFINDAN BAĞIMSIZ OLARAK
// tüketilen ortak yaprak (leaf) yardımcı, döngüsel bağımlılık DOĞURMAZ.
//
// GÜNCELLEME (T-021 FIX turu 1, madde F1+F2, security tur1 `high` — birebir
// aynı kök neden İKİ bulguda): bu fonksiyon `new URL(...).pathname`
// kullanıyordu ve WHATWG URL yüzde-kodlamayı (`%2E` → `.`) ÇÖZMÜYORDU.
// `@trpc/server@11.19.0`'ın `resolveResponse.ts:241`i ise
// `decodeURIComponent(opts.path)` ile ÇÖZÜYOR — iki katman AYNI yolu FARKLI
// görüyordu: `isPlatformAdminGuardedPath`'in `startsWith('/trpc/platform.')`
// önek testi `/trpc/platform%2EtenantList` için `false` dönüyordu (guard
// anında `true`, üç fail-closed dal hiç çalışmıyordu) ama tRPC aynı isteği
// `platform.tenantList` olarak ÇÖZÜP ÇALIŞTIRIYORDU (F1). AYNI asimetri
// `resolveRateLimitPolicy`'nin `TRPC_RATE_LIMITED_PATHS`/`AUTH_DELEGATED_
// PATHS`/`AUTH_OWN_PATHS` TAM EŞLEŞMESİNİ de atlatıyordu (F2) — kanonik
// olmayan yol hiçbir politikaya eşleşmiyor, `undefined` dönüyor, ama tRPC
// prosedürü GENE çalıştırıyordu. Düzeltme ortak normalizer'a (BURAYA)
// kondu — her ALTI çağıran (yukarıdaki liste) OTOMATİK ve BİREBİR AYNI
// kanonikleştirmeyi kazanır, her birine AYRI AYRI decode EKLENMEZ.
//
// Bozuk bir yüzde dizisi (`%ZZ` gibi) `decodeURIComponent`'i FIRLATIR —
// bu fonksiyon o durumda ham (çözülmemiş) `pathname`'e DÜŞER (sessiz yutma
// DEĞİL, BİLİNÇLİ fail-closed varsayılan: `same-origin.guard.ts`'in
// `isTrustedOrigin`'İYLE AYNI desen — "ayrıştırılamayan bir değerin
// GÜVENİLİR/MUAF/EŞLEŞEN sayılması daha KÖTÜ olurdu").
//
// GÜVENLİ sınıf — KÜME ÜYELİĞİ (`.has(...)`) tüketen çağıranlar (iki exempt
// kümesi: `auth-exempt-paths.ts`, `tenancy/tenant-exempt-paths.ts`; iki
// statik yol kümesi: `auth-delegated-paths.ts`, `auth-own-paths.ts`): ham,
// `%` taşıyan bir yol hiçbir TEMİZ literalle ASLA eşleşmez, yani çağıran
// "korumalı" (muaf DEĞİL/politikasız DEĞİL) varsayılanında KALIR — eşleşme
// yokluğu BURADA güvenli taraf.
//
// ⚠ FARKLI sınıf, AYNI GÜVENCE DEĞİL (solid FIX turu 1, L-B — `rate-limit/
// rate-limit.policy.ts`'in `RATE_LIMITED_ROUTES` HARİTASI, `.get(...)` ile
// tüketilir): eşleşme yokluğu burada `undefined` döner ve `resolveRateLimitPolicy`
// bunu AYNEN yukarı iletir — `rate-limit.guard.ts` `undefined`'ı "politika
// yok" olarak okur ve FAIL-OPEN (`true`, sınırsız) döner (`rate-limit.policy.ts`
// dosya başı GÜNCELLEME yorumu, "fail-open" sözcüğü BİREBİR). Yani bu TEK
// haritada eşleşme yokluğu "korumalı" DEĞİL, "sınırsız" anlamına gelir. `low`
// kalır çünkü bu dal BUGÜN erişilebilir değil: ham/bozuk bir yol ZATEN
// `RATE_LIMITED_ROUTES`'TAKİ hiçbir temiz literalle eşleşmiyor ve bu durumda
// istenen uç GERÇEKTE sınırlanması gereken bilinen bir rota DEĞİL — ama
// ikinci, daha geniş bir rotaya bağlı tüketici eklenirse bu asimetri `high`'a
// büyür (F8'in kök nedeniyle AYNI sınıf: "eşleşme yokluğu" iki farklı
// güvenlik anlamına gelebiliyor, tüketiciye göre).
//
// TEK istisna `isPlatformAdminGuardedPath`'in ÖNEK testidir — ÖNEK
// eşleşmesinde "eşleşmeme" varsayılanı GÜVENSİZDİR (guard'ı ATLAR), bu
// yüzden o dosya bozuk kodlamayı KENDİSİ AYRICA tespit edip fail-closed
// davranır (bkz. `platform-admin-ip.guard.ts`'in
// `matchesPrefixOrUnparsablePercentEncoding`'i — BURADAKİ EK, additive
// export).
//
// Sondaki `/` SOYULUR (kök yol `/` HARİÇ) — sorgu dizesi/fragman
// karşılaştırmaya KARIŞMAZ (`new URL(...).pathname` zaten bunları ayıklar).
// Decode, sondaki `/` soyulmadan ÖNCE yapılır — kodlanmış bir sondaki
// `%2F` kazara "sonek" sayılmasın diye DEĞİL (o zaten `pathname` segmentine
// GİRMEZ), sırf tRPC'nin KENDİ sırasıyla (önce decode, sonra `trimSlashes`)
// BİREBİR aynı kalsın diye.
//
// GÜNCELLEME (T-021 FIX turu 4, security tur3, F8, `high` — ÜÇÜNCÜ eksen,
// AYNI kök nedenin ÜÇÜNCÜ ayağı): sondaki `/` ÖNCEDEN YALNIZCA BİR KEZ
// soyuluyordu. `@trpc/server@11.19.0`'ın `fetchRequestHandler.ts`'i ise
// `trimSlashes`'i İKİ KEZ çağırır (`trimSlashes(pathname)` ÖNCE, sonra
// `trimSlashes(pathname.slice(endpoint.length))` TEKRAR) — ikisi de BAŞ VE
// SON olmak üzere birer eğik çizgi soyar, net etki tRPC'nin normalizer'ın
// bıraktığı TAM BİR fazladan sondaki eğik çizgiyi tolere etmesidir
// (`POST /trpc/registration.createTenant//` kanonik yolla BİREBİR AYNI
// prosedürü çalıştırır, gerçek pinli handler'la ölçüldü — `docs/gates/
// T-021-security-tur3.md` §3.4). Bu asimetri `resolveRateLimitPolicy`'nin
// TAM EŞLEŞMESİNİ atlatıyordu: `//` varyantı `undefined` politika döndürüyor,
// `RateLimitGuard` Redis'e HİÇ dokunmadan `true` dönüyordu (ADR-0021 §2 koşul
// E'nin kabul kriteri karşılanmıyordu — slug numaralandırması + sınırsız
// kiracı oluşturma). Düzeltme: sondaki eğik çizgiler TEK TEK değil TAMAMEN
// soyulur (`stripTrailingSlashes`, kök `/` korunarak) — `///` varyantı
// tRPC'de ZATEN `NOT_FOUND`'a düştüğü için bu fail-CLOSED yönde FAZLADAN
// eşleşme üretir (gevşetme DEĞİL, security tur3 §3.8 madde 1).
//
// ⭐ ASIL düzeltme bu satır DEĞİL, DEĞİŞMEZLİK testidir
// (`__tests__/normalize-request-path-trpc-invariant.test.ts`): "appRouter'ın
// HER prosedürü × mutasyon jetonu için, tRPC prosedürü GERÇEKTEN çalıştırıyorsa
// `normalizeRequestPath` AYNI kanonik yola İNDİRGEMELİDİR" — bu TEK test
// yüzde-kodlama (FIX turu 1), büyük/küçük harf (FIX turu 3) ve sondaki eğik
// çizgi (BU tur) eksenlerinin ÜÇÜNÜ DE, bağımsız olarak yeniden keşfeder
// (`@trpc/server`'ın GERÇEK kesme/decode mantığının BAĞIMSIZ bir ikinci
// implementasyonuyla, bu dosyanın fonksiyonlarını ÇAĞIRMADAN — aksi halde
// test totolojik olurdu).

import { assertNever } from '../errors/assert-never.js'

// T-021 FIX turu 4 (security tur3, F8, `high`) — sondaki eğik çizgileri
// TAMAMEN soyar (kök `/` korunarak); dosya başı GÜNCELLEME yorumuna bkz.
// `normalizeRequestPath` VE `matchesPrefixOrUnparsablePercentEncoding`
// TARAFINDAN PAYLAŞILIR — iki ayrı kopya YAZILMAZ (solid M-1'in AYNI ilkesi).
function stripTrailingSlashes(path: string): string {
  if (path.length <= 1) {
    return path
  }

  const stripped = path.replace(/\/+$/, '')
  return stripped.length === 0 ? '/' : stripped
}

// T-021 FIX turu 3 (security tur2, F1-TUR2/F2-TUR2, `high` — AYNI kök
// nedenin İKİNCİ ekseni): yüzde-kodlama ekseni FIX turu 1'de kapandı ama
// `@trpc/server@11.19.0`'ın `fetchRequestHandler.ts:37-39`'u endpoint'i
// İÇERİĞE göre değil UZUNLUĞA göre keser (`pathname.slice(endpoint.length)`,
// önek doğrulaması YOK) VE Express'in `case sensitive routing` ayarı
// VARSAYILAN KAPALI (`main.ts`'te AÇILMIYOR, ÖLÇÜLDÜ — NestJS'in
// `ExpressAdapter` constructor'ı KENDİ `instance.use(...)` çağrısını
// `NestFactory.create()` İÇİNDE, uygulama kodunun `app.set(...)` çağırma
// ŞANSI OLMADAN ÖNCE yapar; bu ayarı `NestExpressApplication` üzerinden
// SONRADAN açmanın YOLU YOK — ÖLÇÜLDÜ, bkz. KARARLAR) ⇒ `@All('trpc/*path')`
// rotası `trpc` MOUNT segmentini BÜYÜK/KÜÇÜK HARF DUYARSIZ eşleştirir:
// `/TRPC/platform.tenantList` isteği GERÇEKTEN `platform.tenantList`
// prosedürünü ÇALIŞTIRIR ama `isPlatformAdminGuardedPath`'in önek testi VE
// `resolveRateLimitPolicy`'nin tam eşleşmesi küçük harfli literalle
// `startsWith`/`Map.get` yaptığı için `false`/`undefined` döner.
//
// Düzeltme: BU TEK, BİLİNEN mount önekini (`/trpc`) kanonikleştir — geri
// kalanı (tRPC prosedür adı, GERÇEKTEN büyük/küçük harf duyarlı bir kimlik,
// `registration.createTenant` ≠ `registration.createtenant`) AYNEN bırak.
// `/auth` BİLEREK buraya EKLENMEDİ: `AUTH_DELEGATED_PATHS`'in kendi
// fail-closed TAM EŞLEŞME allowlist'i (security tur2 §2(c), `AuthController.
// delegate`) bu eksenden ZATEN etkilenmiyor (404 ile keser) — Better Auth
// delege yüzeyinin eşleşme davranışını BURADAN değiştirmek KAPSAM DIŞI bir
// yan etki olurdu. `AUTH_OWN_PATHS`'in (tamamen statik, üç sabit yol) AYNI
// eksendeki boşluğu `rate-limit.policy.ts`'in KENDİ, dar fallback'inde
// (dosya başı GÜNCELLEME yorumu) kapatılır — oraya AYRICA bakınız.
const TRPC_MOUNT_PREFIX = '/trpc'

/**
 * `pathname`'in `/trpc` MOUNT segmentini büyük/küçük harf DUYARSIZ tanır ve
 * tanırsa küçük harfe KANONİKLEŞTİRİR; geri kalan yolu (prosedür adı)
 * DEĞİŞTİRMEDEN bırakır. Eşleşme yoksa `pathname` AYNEN döner (vacuous
 * DEĞİL — `TRPC_MOUNT_PREFIX` öneki YOKSA veya sınırda bitişik bir segment
 * (`/trpcX/...` gibi) VARSA fold UYGULANMAZ, bkz. sınır kontrolü).
 */
function foldTrpcMountPrefix(pathname: string): string {
  if (pathname.length < TRPC_MOUNT_PREFIX.length) {
    return pathname
  }

  const candidate = pathname.slice(0, TRPC_MOUNT_PREFIX.length)

  if (candidate.toLowerCase() !== TRPC_MOUNT_PREFIX) {
    return pathname
  }

  const boundary = pathname.charAt(TRPC_MOUNT_PREFIX.length)

  if (boundary !== '' && boundary !== '/') {
    return pathname
  }

  return TRPC_MOUNT_PREFIX + pathname.slice(TRPC_MOUNT_PREFIX.length)
}

// T-022/S2 adım④ (architect §1.5, ⚠⚠ `try/catch` TEK BAŞINA YETMEZ) —
// ÖNCEKİ kanonikleştirme HER ZAMAN `new URL(rawUrl, ORIGIN)` (WHATWG'in
// RELATİF çözümü) kullanıyordu. Bu, `rawUrl` `//` İLE BAŞLADIĞINDA
// PROTOCOL-RELATIVE (authority) sözdizimi olarak YORUMLANIR: `new URL(
// '//x/trpc/session.me', ORIGIN).pathname` → `/trpc/session.me` (host `x`
// YUTULUR, `/trpc/session.me` TENANT_EXEMPT_PATHS'TE GERÇEKTEN VAR) ⇒
// `isTenantExemptPath` fail-OPEN döner — `try/catch` BU VARYANTTA HİÇ
// TETİKLENMEZ (fırlamıyor, SADECE yanlış pathname üretiyor).
//
// ÇÖZÜM — WHATWG'in KENDİSİ korunur (tRPC'nin KENDİ yolu da `new URL(req.url,
// baseUrl)`, `trpc.controller.ts:114` — "Express/`parseurl` ne görüyorsa onu
// kanonikleştir" SEZGİSİ TERSİNE guard bypass YARATIR, dosya başı §1.5
// yorumuna bkz), AMA authority YORUMU YAPISAL OLARAK İMKÂNSIZ kılınır:
// `rawUrl` `/` İLE BAŞLIYORSA (BİR veya DAHA FAZLA eğik çizgi — `//`, `///`
// DAHİL) `ORIGIN` ile STRING BİRLEŞTİRMESİ yapılır (`new URL(ORIGIN +
// rawUrl)`, RELATİF ÇÖZÜM DEĞİL) — host/scheme sınırı ZATEN `ORIGIN`
// TARAFINDAN SABİTLENMİŞ olduğu için `rawUrl`'İN KENDİ `//`'si ASLA yeni bir
// authority başlatamaz, WHATWG'in PATH İÇİ dot-segment çözümü (`..`) YİNE
// ÇALIŞIR (tRPC ile AYNI davranış korunur — ölçüldü: `new URL(ORIGIN +
// '//x/trpc/session.me').pathname` → `'//x/trpc/session.me'` DEĞİŞMEDEN,
// `new URL(ORIGIN + '/trpc/a/../platform.tenantList').pathname` → HALA
// `/trpc/platform.tenantList`'E İNDİRGENİR). `/` İLE BAŞLAMAYAN bir `rawUrl`
// (ör. mount öneksiz bir göreli yol) ÖNCEKİ relatif çözüme AYNEN devam eder.
// HER İKİ DALIN fırlatması (`new URL(...)` constructor'ı) `unparsable` ile
// yakalanır — `try/catch` KALKMADI, YALNIZCA authority yorumunu
// ENGELLEMEK için BİRLEŞTİRMEYE geçildi (kuşak+askı, dosya başı §1.5
// yorumu).
const CANONICALIZATION_ORIGIN = 'http://normalize-request-path.invalid'

/**
 * `rawUrl`'in WHATWG `pathname`'ini, authority (`//host/...`) YORUMU
 * YAPISAL OLARAK İMKÂNSIZ kılınmış şekilde çözer — yukarıdaki GÜNCELLEME
 * yorumuna bkz. Ayrıştırma FIRLARSA (`new URL(...)` constructor hatası)
 * `null` döner; iki çağıran (`normalizeRequestPath`/
 * `matchesPrefixOrUnparsablePercentEncoding`) bu durumda KENDİ, AYRI
 * fail-closed varsayılanını uygular (biri HAM `rawUrl`'e düşer, diğeri
 * `true` döner) — TEK bir varsayılan BURAYA KODLANMAZ.
 */
function resolveCanonicalPathnameOrUnparsable(rawUrl: string): string | null {
  try {
    const url = rawUrl.startsWith('/')
      ? new URL(CANONICALIZATION_ORIGIN + rawUrl)
      : new URL(rawUrl, CANONICALIZATION_ORIGIN)
    return url.pathname
  } catch {
    return null
  }
}

// solid FIX turu 1, M-1 (medium) — `normalizeRequestPath` ile
// `matchesPrefixOrUnparsablePercentEncoding` AYNI dört adımlı hattı
// (resolve → decode → fold → strip) AYRI AYRI yazıyordu; paylaşılan
// yalnızca İLK adımdı, `decodeURIComponent` İKİ KEZ (ayrı `try/catch`
// bloklarında) ÇAĞRILIYORDU. Bu dosyanın KENDİ §1.5/F8 yorumlarının
// tekrarladığı ilke ("aynı sebeple birlikte değişmesi gereken kod, tek
// yerde durmalı" — `assertNever` birleştirmesiyle AYNI gerekçe) burada
// İHLAL EDİLİYORDU: son üç turda bu hat ÜÇ KEZ büyüdü (yüzde-kodlama,
// büyük/küçük harf, sondaki eğik çizgi), her biri tRPC asimetrisi kapatan
// `high` bulguydu — dördüncü bir eksen TEK fonksiyona eklenirse diğeri
// GERİDE kalır.
//
// Çözüm: hattın TAMAMI (resolve/decode/fold/strip) TEK, özel fonksiyonda
// toplanır ve sonucu ÜÇ sonuçlu bir discriminated union olarak döner —
// `canonical` (hat sorunsuz tamamlandı), `undecodable` (pathname çözüldü
// ama `decodeURIComponent` FIRLADI) veya `unparsable` (`new URL(...)`
// constructor'ı FIRLADI, pathname'e bile ULAŞILAMADI). ⚠⚠ Varsayılan
// BURAYA KODLANMAZ — iki çağıranın `undecodable`/`unparsable` yorumu
// BİLEREK TERS (biri HAM değere düşer, diğeri TUTUCU `true` döner, aşağıdaki
// iki fonksiyonun KENDİ yorumlarına bkz); bu fonksiyon SADECE üç durumu
// AYIRT EDER, hangisinin "güvenli" sayılacağına KARAR VERMEZ.
type RequestPathCanonicalization =
  | { readonly kind: 'canonical'; readonly path: string }
  | { readonly kind: 'undecodable'; readonly rawPathname: string }
  | { readonly kind: 'unparsable' }

/**
 * Dört adımlı kanonikleştirme hattının (resolve → decode → fold → strip)
 * TEK, paylaşılan implementasyonu — `decodeURIComponent` burada TEK KEZ
 * çağrılır (solid FIX turu 1, M-1). `rawUrl` hiç ayrıştırılamazsa
 * (`resolveCanonicalPathnameOrUnparsable` `null` döner) `{ kind:
 * 'unparsable' }`; pathname çözülür ama yüzde-kodlama BOZUKSA (`decodeURIComponent`
 * FIRLAR) `{ kind: 'undecodable', rawPathname }` (ham, ÇÖZÜLMEMİŞ pathname
 * TAŞINIR — `normalizeRequestPath` bunu fold+strip'e DEVAM ETTİRİR, bkz.
 * kendi yorumu); HER İKİ adım da başarılıysa `{ kind: 'canonical', path }`
 * (fold + strip UYGULANMIŞ nihai yol).
 */
function canonicalizeRequestPath(rawUrl: string): RequestPathCanonicalization {
  const pathname = resolveCanonicalPathnameOrUnparsable(rawUrl)

  if (pathname === null) {
    return { kind: 'unparsable' }
  }

  let decoded: string

  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return { kind: 'undecodable', rawPathname: pathname }
  }

  const mountFolded = foldTrpcMountPrefix(decoded)
  return { kind: 'canonical', path: stripTrailingSlashes(mountFolded) }
}

/**
 * `rawUrl`'in (`req.url`) yol kısmını normalize eder: authority yorumu
 * YAPISAL OLARAK engellenir (yukarıdaki GÜNCELLEME yorumu, §1.5), sorgu
 * dizesi/fragman çıkarılır, yüzde-kodlama TEK KEZ çözülür (tRPC ile BİREBİR
 * aynı, dosya başı GÜNCELLEME yorumu), sondaki `/` soyulur (kök `/` hariç).
 * Hat (`canonicalizeRequestPath`) `unparsable` dönerse HAM `rawUrl` AYNEN
 * döner; `undecodable` dönerse HAM (çözülmemiş) `pathname` ÜZERİNDE fold+strip
 * ADIMLARI YİNE UYGULANIR (eski `decodePathnameSafely`'nin davranışıyla
 * BİREBİR aynı — decode başarısız olsa da hat durmaz). İKİ durumda da bu TAM
 * EŞLEŞMELİ tüketiciler (exempt kümeleri, rota haritaları) için güvenli
 * varsayılan: ham/bozuk bir yol hiçbir TEMİZ literalle eşleşmez.
 */
export function normalizeRequestPath(rawUrl: string): string {
  const result = canonicalizeRequestPath(rawUrl)

  switch (result.kind) {
    case 'canonical':
      return result.path
    case 'undecodable':
      return stripTrailingSlashes(foldTrpcMountPrefix(result.rawPathname))
    case 'unparsable':
      return rawUrl
    default:
      return assertNever(result, 'normalize-request-path.ts: RequestPathCanonicalization.kind')
  }
}

/**
 * `rawUrl`'in kanonikleştirilmiş (TEK kez `decodeURIComponent` ile çözülmüş)
 * yolunun `prefix` ile BAŞLAYIP BAŞLAMADIĞINI belirler; hat
 * (`canonicalizeRequestPath`) `undecodable` VEYA `unparsable` dönerse GÜVENLİ
 * VARSAYILAN olarak `true` (eşleşiyor SAY) döner — F1'in (security tur1,
 * `high`) açık şartı: "bozuk kodlamada kapsamda say". `normalizeRequestPath`
 * BUNU YAPMAZ (bozukta/ayrıştırılamazda HAM pathname/`rawUrl`'e düşer) çünkü
 * TAM EŞLEŞMELİ tüketicileri (exempt kümeleri, rota haritaları) için ham/
 * bozuk bir yol ZATEN hiçbir literalle eşleşmediği için güvenlidir; ÖNEK
 * eşleşmesi (`isPlatformAdminGuardedPath` gibi) TERS varsayılana (eşleşmeme
 * = güvenli) sahip olduğu için AYRI, daha TUTUCU bir yardımcı gerekir — BU
 * fonksiyon. Saf, parametreli — yalnızca `platform-admin-ip.guard.ts`
 * tüketir.
 *
 * ⚠ BİLİNEN SINIRLAMA (solid FIX turu 1, L-A, `low` — T-022/S2'nin §1.5
 * fix'i `unparsable` üreten girdi kümesini DARALTTI): bu tutucu `true`
 * SADECE `canonicalizeRequestPath`'in `undecodable`/`unparsable` döndüğü
 * durumları kapsar — hat BAŞARIYLA tamamlanıp `'/'`'E DARALAN bir pathname
 * (örn. `'//'`, `'///'`) üretirse (`stripTrailingSlashes`'in KENDİ, BİLİNÇLİ
 * davranışı) BU `canonical` bir sonuçtur ve normal `startsWith` yoluna girer
 * (ÖLÇÜLDÜ: bugün `false` döner, çünkü `'/'` `prefix` ile BAŞLAMAZ —
 * `__tests__/normalize-request-path.test.ts`'in "'//' ailesi" bloğu).
 * ÖNCEDEN (§1.5 fix'ten ÖNCE) bu girdiler `new URL('//', ORIGIN)`'in
 * FIRLAMASI yüzünden `unparsable` SAYILIYORDU ve tutucu `true` alıyordu;
 * artık PARSABLE olduğu için bu güvenceyi KAYBETTİ. `low` kalır çünkü
 * `PlatformAdminIpGuard`'ın TEK üretim tüketicisi (`isPlatformAdminGuardedPath`)
 * için bu dal BUGÜN erişilebilir değil (ÖLÇÜLDÜ: `path-to-regexp@8.4.2`'nin
 * `match('/trpc/*path')`'i `//…` için `false` döner, `TrpcController`'ın
 * KENDİ rotası bu isteği HİÇ GÖRMEZ — canlı prob 404). ⚠⚠ İkinci, daha geniş
 * bir rotaya (ör. `/trpc` öneki OLMAYAN, önek-TABANLI başka bir guard)
 * bağlı bir tüketici eklenirse bu `high`'a büyür — ROADMAP teknik borcuna
 * kaydedilmesi gerekir (bu dosyanın sahibi `ROADMAP.md`'ye YAZAMAZ, `docs`/
 * `release` ajanına BIRAKILIR).
 */
export function matchesPrefixOrUnparsablePercentEncoding(rawUrl: string, prefix: string): boolean {
  const result = canonicalizeRequestPath(rawUrl)

  switch (result.kind) {
    case 'canonical':
      return result.path.startsWith(prefix)
    case 'undecodable':
      return true
    case 'unparsable':
      return true
    default:
      return assertNever(result, 'normalize-request-path.ts: RequestPathCanonicalization.kind')
  }
}
