// @arkesoft/api — normalizeRequestPath / matchesPrefixOrUnparsablePercentEncoding
// birim testleri (T-021 FIX turu 1, madde F1/F2 — security tur1, `high`)
//
// Kök neden: `normalizeRequestPath` ÖNCEDEN `new URL(...).pathname`
// kullanıyordu — WHATWG URL yüzde-kodlamayı (`%2E` → `.`) ÇÖZMEZ. tRPC'nin
// `resolveResponse.ts:241`i `decodeURIComponent(opts.path)` ile ÇÖZER;
// iki katman AYNI yolu FARKLI görüyordu (F1: `PlatformAdminIpGuard`'ın
// önek testi; F2: `resolveRateLimitPolicy`'nin TAM EŞLEŞMESİ) — kanıt
// zinciri `docs/gates/T-021-security-tur1.md` §1.

import { describe, expect, it } from 'vitest'

import {
  matchesPrefixOrUnparsablePercentEncoding,
  normalizeRequestPath,
} from '../http/normalize-request-path.js'

describe('normalizeRequestPath — yüzde-kodlama tRPC ile BİREBİR aynı şekilde ÇÖZÜLÜR', () => {
  it('kodlanmamış yol DEĞİŞMEDEN döner', () => {
    expect(normalizeRequestPath('/trpc/platform.tenantList')).toBe('/trpc/platform.tenantList')
  })

  it('%2E (büyük harf) "." olarak ÇÖZÜLÜR', () => {
    expect(normalizeRequestPath('/trpc/platform%2EtenantList')).toBe('/trpc/platform.tenantList')
  })

  it('%2e (küçük harf) "." olarak ÇÖZÜLÜR — hex büyük/küçük harf DUYARSIZ', () => {
    expect(normalizeRequestPath('/trpc/platform%2etenantList')).toBe('/trpc/platform.tenantList')
  })

  it("sorgu dizesi decode'a KARIŞMAZ (query string ayrı ayrıştırılır)", () => {
    expect(normalizeRequestPath('/trpc/platform.session?input=%7B%7D')).toBe(
      '/trpc/platform.session',
    )
  })

  it('sondaki "/" decode SONRASINDA soyulur', () => {
    expect(normalizeRequestPath('/trpc/platform%2EtenantList/')).toBe('/trpc/platform.tenantList')
  })

  // ⚠⚠ BOZUK KODLAMA (`%ZZ`) — `decodeURIComponent` FIRLAR. Bu fonksiyon
  // sessizce HAM (çözülmemiş) pathname'e düşer — TAM EŞLEŞMELİ tüketiciler
  // (exempt kümeleri, rota haritaları) için güvenli varsayılan: ham, `%`
  // taşıyan bir yol hiçbir TEMİZ literalle eşleşmez (dosya başı GÜNCELLEME
  // yorumuna bkz, `http/normalize-request-path.ts`).
  it("bozuk yüzde dizisi (%ZZ) FIRLATMAZ, ham pathname'e düşer", () => {
    expect(normalizeRequestPath('/trpc/platform%ZZtenantList')).toBe('/trpc/platform%ZZtenantList')
  })

  it('bozuk yüzde dizisi ham literalle hiçbir TEMİZ yolla eşleşmez (dolaylı kanıt)', () => {
    expect(normalizeRequestPath('/trpc/platform%ZZtenantList')).not.toBe(
      '/trpc/platform.tenantList',
    )
  })

  // T-021 FIX turu 3 (security tur2, F1-TUR2/F2-TUR2, `high`) — NEGATİF
  // REGRESYON: `/trpc` MOUNT segmenti Express'in `case sensitive routing`
  // ayarı KAPALI olduğu için büyük/küçük harf DUYARSIZ eşleşiyordu
  // (`@All('trpc/*path')` `/TRPC/...`'i de ÇALIŞTIRIYORDU) ama bu fonksiyon
  // önceden mount önekini KANONİKLEŞTİRMİYORDU. Üç varyantın (dosya başı
  // GÜNCELLEME yorumu) ÜÇÜ DE artık AYNI küçük harfli mount önekine
  // indirgenmeli — prosedür adı (`platform.tenantList`) DEĞİŞMEDEN kalır.
  it.each(['/TRPC/platform.tenantList', '/Trpc/platform.tenantList', '/tRpC/platform.tenantList'])(
    '%s → mount öneki küçük harfe KANONİKLEŞİR, prosedür adı DEĞİŞMEZ (F1-TUR2/F2-TUR2 regresyonu)',
    (url) => {
      expect(normalizeRequestPath(url)).toBe('/trpc/platform.tenantList')
    },
  )

  // Vacuous DEĞİL — mount öneki OLMAYAN bir büyük/küçük harf varyantı
  // (örn. prosedür adının İÇİNDEKİ harfler) DEĞİŞTİRİLMEMELİ.
  it('mount öneki DIŞINDAKİ büyük/küçük harf DEĞİŞMEZ', () => {
    expect(normalizeRequestPath('/trpc/Platform.TenantList')).toBe('/trpc/Platform.TenantList')
  })

  // Sınır kontrolü — `/trpcX/...` gibi bitişik bir segment YANLIŞLIKLA
  // "mount önekiyle eşleşti" sayılmamalı (önek GENİŞLEMEDİ).
  it("'/trpcX/...' mount öneki SAYILMAZ (sınır kontrolü)", () => {
    expect(normalizeRequestPath('/TRPCX/foo')).toBe('/TRPCX/foo')
  })
})

describe('matchesPrefixOrUnparsablePercentEncoding — ÖNEK testi için TUTUCU varsayılan', () => {
  it('kodlanmamış yol öneke uyuyorsa true', () => {
    expect(
      matchesPrefixOrUnparsablePercentEncoding('/trpc/platform.tenantList', '/trpc/platform.'),
    ).toBe(true)
  })

  it('kodlanmamış yol öneke UYMUYORSA false (vacuous DEĞİL)', () => {
    expect(
      matchesPrefixOrUnparsablePercentEncoding('/trpc/tenant.current', '/trpc/platform.'),
    ).toBe(false)
  })

  it("%2E ÇÖZÜLÜR ve öneke UYAR → true (F1'in asıl düzeltmesi)", () => {
    expect(
      matchesPrefixOrUnparsablePercentEncoding('/trpc/platform%2EtenantList', '/trpc/platform.'),
    ).toBe(true)
  })

  it('%2e (küçük harf) de ÇÖZÜLÜR ve öneke UYAR → true', () => {
    expect(
      matchesPrefixOrUnparsablePercentEncoding('/trpc/platform%2etenantList', '/trpc/platform.'),
    ).toBe(true)
  })

  // ⚠⚠ BOZUK KODLAMA — "kapsamda say" (security tur1'in AÇIK şartı):
  // `normalizeRequestPath`'in TERSİNE, bu fonksiyon bozuk kodlamada `true`
  // döner çünkü ÖNEK testinin "eşleşmeme" varsayılanı GÜVENSİZDİR (guard'ı
  // ATLAR).
  it("bozuk yüzde dizisi (%ZZ) → true (tutucu, guard'ı ATLAMAZ)", () => {
    expect(
      matchesPrefixOrUnparsablePercentEncoding('/trpc/platform%ZZtenantList', '/trpc/platform.'),
    ).toBe(true)
  })

  it("önek GENİŞLEMEDİ — kapsam dışı bir namespace'in kodlanmış hâli de kapsam dışı kalır", () => {
    expect(
      matchesPrefixOrUnparsablePercentEncoding('/trpc/platformX%2Efoo', '/trpc/platform.'),
    ).toBe(false)
  })

  // T-021 FIX turu 3 (security tur2, F1-TUR2, `high`) — NEGATİF REGRESYON:
  // `isPlatformAdminGuardedPath`'in TEK üretim tüketicisi bu fonksiyondur.
  // Üç varyant ÖNCEDEN `false` dönüyordu (guard ANINDA `true`, üç
  // fail-closed dalın HİÇBİRİ değerlendirilmiyordu) — kanıt zinciri
  // `docs/gates/T-021-security-tur2.md` §1(d). Düzeltmeden SONRA üçü de
  // KAPSAMDA sayılmalı.
  it.each(['/TRPC/platform.tenantList', '/Trpc/platform.tenantList', '/tRpC/platform.tenantList'])(
    "%s → ARTIK öneke UYAR (F1-TUR2 regresyonu, guard'ı ATLAMAZ)",
    (url) => {
      expect(matchesPrefixOrUnparsablePercentEncoding(url, '/trpc/platform.')).toBe(true)
    },
  )

  // Vacuous DEĞİL — kapsam DIŞI bir namespace'in MOUNT öneki büyük/küçük
  // harf varyantı da kapsam DIŞI kalmalı (önek GENİŞLEMEDİ).
  it('/TRPC/tenant.current KAPSAM DIŞIDIR (mount öneki değişti, namespace değişmedi)', () => {
    expect(
      matchesPrefixOrUnparsablePercentEncoding('/TRPC/tenant.current', '/trpc/platform.'),
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// T-022/S2 adım⑤ — AC-5: `//` ailesi (architect §1.5, ASIL BULGU). İKİ
// fonksiyon için AYRI vaka blokları — `normalizeRequestPath` VE
// `matchesPrefixOrUnparsablePercentEncoding` BAĞIMSIZ varsayılanlara sahip
// (biri HAM `rawUrl`'e düşer, diğeri TUTUCU `true` döner — dosya başı
// fonksiyon yorumlarına bkz), bu yüzden tek bir ortak blok YANILTICI olurdu.
// ---------------------------------------------------------------------------

describe('normalizeRequestPath — "//" ailesi (T-022/S2 adım⑤, AC-5, §1.5 ASIL BULGU)', () => {
  // ⭐⭐ ASIL BULGU'nun REGRESYON TESTİ: FIX ÖNCESİ `normalizeRequestPath(
  // '//evil.example/trpc/session.me')` WHATWG'i authority (`//host/...`)
  // olarak yorumlayıp `/trpc/session.me`'YE İNDİRGERDİ — bu değer
  // `TENANT_EXEMPT_PATHS`'TE GERÇEKTEN VAR (`tenant-exempt-paths.ts:205`) ⇒
  // `isTenantExemptPath` fail-OPEN dönerdi (architect ⓵ ASIL BULGU). FIX
  // SONRASI `//` hiçbir authority'ye ÇÖZÜLMEZ — host `evil.example` YUTULMAZ,
  // yol LİTERAL kalır ve GERÇEK exempt literaliyle ASLA eşleşmez.
  it("//evil.example/trpc/session.me → LİTERAL kalır, /trpc/session.me'YE İNDİRGENMEZ (fail-open KAPANDI)", () => {
    const result = normalizeRequestPath('//evil.example/trpc/session.me')
    expect(result).toBe('//evil.example/trpc/session.me')
    expect(result).not.toBe('/trpc/session.me')
  })

  // `//`'nin KENDİSİ (sonuna hiçbir segment EKLENMEMİŞ) `stripTrailingSlashes`
  // TARAFINDAN kök `/`'e DARALTILIR (T-021 FIX turu 4'ün BİLEREK korunan
  // davranışı, dosya başı GÜNCELLEME yorumu — "TAMAMEN eğik çizgiden oluşan
  // bir dize kök `/`'e iner") — BU, authority YORUMUNDAN (host yutma)
  // KAYNAKLANMAZ (ölçüldü: FIRLAMAZ, `//` hiçbir HOST'A çözülmedi, sadece
  // SONDAKİ eğik çizgiler soyuldu); `/` {@link TENANT_EXEMPT_PATHS}'TE
  // (`tenancy/tenant-exempt-paths.ts`) BİR LİTERAL DEĞİL ⇒ fail-open SINIFINA
  // GİRMEZ.
  it('// → host/authority YORUMU YOK, FIRLAMAZ; stripTrailingSlashes kök "/"e DARALTIR (authority KAYNAKLI DEĞİL)', () => {
    expect(normalizeRequestPath('//')).toBe('/')
  })

  it('/// → AYNI gerekçeyle kök "/"e DARALIR (authority yorumu YOK, sadece sondaki eğik çizgiler soyuldu)', () => {
    expect(normalizeRequestPath('///')).toBe('/')
  })

  // `%2F` → decode SONRASI `/`'ye çözülür; `//%2F` → decode SONRASI `///`'e
  // çözülür ve `stripTrailingSlashes` kök `/`'e indirger — bu BİLİNÇLİ bir
  // davranış (decode HER ZAMAN sondaki `/` soyulmadan ÖNCE yapılır, dosya
  // başı yorumu), authority YORUMU YOK (host yutulmadı) olduğu için fail-open
  // SINIFINA GİRMEZ.
  it('//%2F → decode SONRASI "///" olur, kök "/"e DARALIR (authority yorumu YOK)', () => {
    expect(normalizeRequestPath('//%2F')).toBe('/')
  })

  // ⭐⭐ NO-OP DEĞİŞMEZİ (architect, bağlayıcı): `//` İLE BAŞLAMAYAN her
  // girdide çıktı §1.5 FIX'İNDEN ETKİLENMEZ — aşağıdaki beş eksenin (`\`,
  // nokta-segment, `%`, `?`, `#`) HER BİRİ TEK leading eğik çizgili bir
  // girdiyle temsil edilir; değerler FIX ÖNCESİ (`new URL(rawUrl, ORIGIN)`,
  // relatif çözüm) VE FIX SONRASI (`new URL(ORIGIN + rawUrl)`, birleştirme)
  // arasında BAĞIMSIZ OLARAK ÖLÇÜLDÜ, İKİSİ DE AYNI (rapora bkz) — bir TEK
  // leading `/` için relatif çözüm İLE birleştirme YAPISAL OLARAK eşdeğerdir
  // (WHATWG "absolute-path" referansı tabanın YOLUNU TAMAMEN DEĞİŞTİRİR,
  // authority ASLA YENİDEN YORUMLANMAZ).
  it.each([
    // `\` ekseni — WHATWG'in `http` ÖZEL şema tersine eğik çizgi/eğik çizgi
    // EŞDEĞERLİĞİ (BAĞIMSIZ, bu fix'ten ÖNCE de VARDI).
    ['/trpc\\platform.tenantList', '/trpc/platform.tenantList'],
    // nokta-segment ekseni — pm'in R-3 karşı örneği (§1.5 yorumu).
    ['/trpc/a/../platform.tenantList', '/trpc/platform.tenantList'],
    // `%` ekseni — mevcut testlerin ÜZERİNE, TEK leading `/` ile (decode HER
    // ZAMAN yapılır — bu fix'ten BAĞIMSIZ, dosya başındaki "%2E ÇÖZÜLÜR"
    // testiyle AYNI davranış).
    ['/trpc/platform%2EtenantList', '/trpc/platform.tenantList'],
    // `?` ekseni — sorgu dizesi.
    ['/trpc/platform.session?input=%7B%7D', '/trpc/platform.session'],
    // `#` ekseni — fragman.
    ['/trpc/platform.session#frag', '/trpc/platform.session'],
  ])('%s → "//" İLE BAŞLAMIYOR ⇒ çıktı §1.5 FIX\'İNDEN ETKİLENMEZ: %s', (rawUrl, expected) => {
    expect(normalizeRequestPath(rawUrl)).toBe(expected)
  })
})

describe('matchesPrefixOrUnparsablePercentEncoding — "//" ailesi (T-022/S2 adım⑤, AC-5)', () => {
  // `normalizeRequestPath`'in TERSİNE bu fonksiyon TUTUCU varsayılana sahip —
  // ama "//" ailesi `unparsable` ÜRETMEZ (ORIGIN+rawUrl HER ZAMAN
  // ayrıştırılabilir, dosya başı yorumu), bu yüzden `true`'ya DÜŞMEZ; GERÇEK
  // (literal) yol üzerinden `startsWith` değerlendirilir.
  it('//evil.example/trpc/session.me bir /trpc/platform. ÖNEKİYLE eşleşmez (host yutulmadı, literal kaldı)', () => {
    expect(
      matchesPrefixOrUnparsablePercentEncoding('//evil.example/trpc/session.me', '/trpc/platform.'),
    ).toBe(false)
  })

  it('// bir /trpc/platform. ÖNEKİYLE eşleşmez (unparsable DEĞİL, literal "//" önekle UYUŞMUYOR)', () => {
    expect(matchesPrefixOrUnparsablePercentEncoding('//', '/trpc/platform.')).toBe(false)
  })

  it('/// bir /trpc/platform. ÖNEKİYLE eşleşmez', () => {
    expect(matchesPrefixOrUnparsablePercentEncoding('///', '/trpc/platform.')).toBe(false)
  })

  it('//%2F bir /trpc/platform. ÖNEKİYLE eşleşmez (decode SONRASI "///" → kök "/"e daralır)', () => {
    expect(matchesPrefixOrUnparsablePercentEncoding('//%2F', '/trpc/platform.')).toBe(false)
  })

  // ⭐⭐ NO-OP DEĞİŞMEZİ — `normalizeRequestPath` bloğuyla BİREBİR aynı beş
  // eksen, AYNI gerekçe (bu fonksiyonun KENDİ öneki `/trpc/platform.` ile).
  it.each([
    ['/trpc\\platform.tenantList', true],
    ['/trpc/a/../platform.tenantList', true],
    ['/trpc/platform%2EtenantList', true],
    // `?`/`#` eksenleri — pathname "/trpc/platform.session" olarak çözülür,
    // bu da "/trpc/platform." ÖNEKİYLE EŞLEŞİR ("platform.session"
    // "platform." ile BAŞLAR) — `false` BEKLEMEK YANLIŞ olurdu (ölçüldü).
    ['/trpc/platform.session?input=%7B%7D', true],
    ['/trpc/platform.session#frag', true],
  ])('%s → "//" İLE BAŞLAMIYOR ⇒ çıktı §1.5 FIX\'İNDEN ETKİLENMEZ: %s', (rawUrl, expected) => {
    expect(matchesPrefixOrUnparsablePercentEncoding(rawUrl, '/trpc/platform.')).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// `qa` tur 1, FIX turu 1 — test kapsamı boşluğu kapatıldı. `backend` FIX turu
// 1'de ÖLÇTÜ VE SAKLAMADI: "`matchesPrefixOrUnparsablePercentEncoding`'in
// `unparsable` dalı (gerçek `new URL(...)` constructor FIRLAMASI,
// `resolveCanonicalPathnameOrUnparsable`'ın `catch` bloğu) HİÇBİR mevcut
// testle kapsanmıyor — dalı bilerek bozdum (`return true`→`return false`),
// 47 testin 47'si YEŞİL KALDI". §1.5 fix'i (`/` İLE BAŞLAYAN girdiler için
// `new URL(ORIGIN + rawUrl)` BİRLEŞTİRMESİ) bu dalı `/`-öneki olan girdiler
// için pratikte erişilemez kıldı (security'nin 8.377 girdilik taraması —
// `//` ailesinin hiçbiri FIRLAMIYOR) — AMA fonksiyonun İKİNCİ dalı (`/` İLE
// BAŞLAMAYAN girdiler, `new URL(rawUrl, ORIGIN)` GERÇEK relatif çözüm) HÂLÂ
// fırlayabiliyor: `rawUrl` kendi şemasını/authority'sini taşıyan bir
// absolute-form dizgeyse (`ORIGIN` taban olarak YOK SAYILIR) ve bu
// authority'nin host'u WHATWG'in host ayrıştırma algoritmasını BAŞARISIZ
// kılıyorsa (örn. eşleşmeyen `[` ile biten bir IPv6 literal, veya host'suz
// `http://`) constructor GERÇEKTEN FIRLAR.
//
// Bağımsız doğrulama (node, bu fonksiyonun KENDİ mantığıyla, üretim kodu
// İTHAL EDİLMEDEN — totolojik DEĞİL): `http://[::1`, `http://`,
// `http://host:abc/` (geçersiz port), `http://example.com:99999999999999999999/`
// (port taşması) — DÖRDÜ DE "Invalid URL" FIRLATIYOR, Node'un `URL` sınıfının
// WHATWG spec'e BAĞLI, implementasyondan BAĞIMSIZ bir davranışı (host/port
// ayrıştırma başarısızlığı spec'in KENDİSİNDE tanımlı bir hata durumu).
//
// ⚠ Bu girdi `req.url` için GERÇEKÇİ DEĞİL (Node'un http sunucusu normal bir
// istekte `req.url`'i her zaman `/` ile BAŞLATIR — absolute-form
// request-target, yalnızca proxy senaryolarında VEYA elle oluşturulmuş ham
// bir soket isteğinde görülür). AMA bu fonksiyonun KENDİSİ saf, parametreli
// ve rastgele dizge kabul eden bir birim — dal birim SEVİYESİNDE GERÇEKTEN
// erişilebilir (aşağıdaki testler bunu KANITLIYOR), bu yüzden "ölü kod"
// İLAN EDİLEMEZDİ; kapatılması gereken GERÇEK bir boşluktu.
// ---------------------------------------------------------------------------

describe('normalizeRequestPath — "unparsable" dalı (gerçek new URL(...) FIRLAMASI — qa FIX turu 1)', () => {
  it('absolute-form, bozuk IPv6 host ("http://[::1") → new URL(...) GERÇEKTEN fırlar, HAM rawUrl AYNEN döner', () => {
    const rawUrl = 'http://[::1'
    expect(normalizeRequestPath(rawUrl)).toBe(rawUrl)
  })

  it('"http://" (host YOK) → AYNI "unparsable" dalı, HAM rawUrl AYNEN döner', () => {
    const rawUrl = 'http://'
    expect(normalizeRequestPath(rawUrl)).toBe(rawUrl)
  })
})

describe('matchesPrefixOrUnparsablePercentEncoding — "unparsable" dalı (gerçek new URL(...) FIRLAMASI — qa FIX turu 1)', () => {
  // `normalizeRequestPath`'in TERSİNE bu fonksiyon TUTUCU varsayılana sahip —
  // `unparsable`'da "kapsamda SAY" döner (security F1'in şartı, dosya başı
  // fonksiyon yorumuna bkz), HAM dizgeye değil.
  it('absolute-form, bozuk IPv6 host ("http://[::1") → new URL(...) GERÇEKTEN fırlar, TUTUCU true döner', () => {
    expect(matchesPrefixOrUnparsablePercentEncoding('http://[::1', '/trpc/platform.')).toBe(true)
  })

  it('"http://" (host YOK) → AYNI "unparsable" dalı, TUTUCU true döner', () => {
    expect(matchesPrefixOrUnparsablePercentEncoding('http://', '/trpc/platform.')).toBe(true)
  })
})
