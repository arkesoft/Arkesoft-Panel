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
// GÜVENİLİR/MUAF/EŞLEŞEN sayılması daha KÖTÜ olurdu"). TAM EŞLEŞMELİ
// küme/harita tüketen HER çağıran (iki exempt kümesi, üç yöntem+yol
// haritası) için bu GÜVENLİDİR — ham, `%` taşıyan bir yol hiçbir TEMİZ
// literalle ASLA eşleşmez, yani çağıran "korumalı" (muaf DEĞİL/politikasız
// DEĞİL) varsayılanında KALIR. TEK istisna `isPlatformAdminGuardedPath`'in
// ÖNEK testidir — ÖNEK eşleşmesinde "eşleşmeme" varsayılanı GÜVENSİZDİR
// (guard'ı ATLAR), bu yüzden o dosya bozuk kodlamayı KENDİSİ AYRICA tespit
// edip fail-closed davranır (bkz. `platform-admin-ip.guard.ts`'in
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

/**
 * `pathname`'i TEK KEZ `decodeURIComponent` ile çözer — tRPC'nin
 * `resolveResponse.ts:241`indeki `decodeURIComponent(opts.path)` ile
 * BİREBİR aynı kanonikleştirme adımı (F1/F2, security tur1). Bozuk bir
 * yüzde dizisi `decodeURIComponent`'i FIRLATIR; bu durumda ham `pathname`
 * AYNEN döner (dosya başı GÜNCELLEME yorumuna bkz — bu bir `catch {}`
 * YUTMASI DEĞİLDİR, dokümante edilmiş, bilinçli bir fail-closed varsayılan).
 */
function decodePathnameSafely(pathname: string): string {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return pathname
  }
}

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

/**
 * `rawUrl`'in (`req.url`) yol kısmını normalize eder: sorgu dizesi/fragman
 * çıkarılır, yüzde-kodlama TEK KEZ çözülür (tRPC ile BİREBİR aynı, dosya
 * başı GÜNCELLEME yorumu), sondaki `/` soyulur (kök `/` hariç). İkinci
 * parametre yalnızca `new URL()`'in RELATİF url'i çözmesi için gereken bir
 * TABAN'dır — hiçbir zaman gerçek bir ağ isteğine KARIŞMAZ.
 */
export function normalizeRequestPath(rawUrl: string): string {
  const { pathname } = new URL(rawUrl, 'http://normalize-request-path.invalid')
  const decoded = decodePathnameSafely(pathname)
  const mountFolded = foldTrpcMountPrefix(decoded)
  return stripTrailingSlashes(mountFolded)
}

/**
 * `rawUrl`'in kanonikleştirilmiş (TEK kez `decodeURIComponent` ile çözülmüş)
 * yolunun `prefix` ile BAŞLAYIP BAŞLAMADIĞINI belirler; yüzde-kodlama
 * BOZUKSA (`decodeURIComponent` FIRLAR, kanonikleştirme YAPILAMAZ) GÜVENLİ
 * VARSAYILAN olarak `true` (eşleşiyor SAY) döner — F1'in (security tur1,
 * `high`) açık şartı: "bozuk kodlamada kapsamda say". `normalizeRequestPath`
 * BUNU YAPMAZ (bozukta HAM pathname'e düşer) çünkü TAM EŞLEŞMELİ
 * tüketicileri (exempt kümeleri, rota haritaları) için ham/bozuk bir yol
 * ZATEN hiçbir literalle eşleşmediği için güvenlidir; ÖNEK eşleşmesi
 * (`isPlatformAdminGuardedPath` gibi) TERS varsayılana (eşleşmeme = güvenli)
 * sahip olduğu için AYRI, daha TUTUCU bir yardımcı gerekir — BU fonksiyon.
 * Saf, parametreli — yalnızca `platform-admin-ip.guard.ts` tüketir.
 */
export function matchesPrefixOrUnparsablePercentEncoding(rawUrl: string, prefix: string): boolean {
  const { pathname } = new URL(rawUrl, 'http://normalize-request-path.invalid')

  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return true
  }

  const mountFolded = foldTrpcMountPrefix(decoded)
  const normalized = stripTrailingSlashes(mountFolded)
  return normalized.startsWith(prefix)
}
