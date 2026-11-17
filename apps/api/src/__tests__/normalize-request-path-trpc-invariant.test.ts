// @arkesoft/api — normalizeRequestPath ↔ @trpc/server DEĞİŞMEZLİK testi
// (T-021 FIX turu 4, security tur3 F8 `high`, DoD İŞ①)
//
// KAYNAK BULGU: `docs/gates/T-021-security-tur3.md` §3.1/§3.8 madde 2.
// `security`'nin önerdiği TEK değişmez, üç FIX turunun (yüzde-kodlama →
// tur1, büyük/küçük harf → tur3, sondaki eğik çizgi → tur4/BU dosya) ÜÇÜNÜ
// DE aynı anda yakalayan TEK testtir:
//
//   HER prosedür × HER mutasyon jetonu için:
//   tRPCçözer(P) ≠ null  ⇒  normalizeRequestPath(P) === '/trpc/' + tRPCçözer(P)
//
// ⚠⚠ `tRPCçözer` BU DOSYADA, `@trpc/server@11.19.0`'ın GERÇEK kaynağından
// (node_modules'tan OKUNDU — kendi yorum UYDURULMADI) BAĞIMSIZ OLARAK
// yeniden implemente edilir:
//   - kesme mantığı: `fetchRequestHandler.ts:17-39`'un `trimSlashes` + pozisyon
//     tabanlı `slice(endpoint.length)`'inin BİREBİR kopyası (iki ayrı
//     `trimSlashes` çağrısı — BAŞ+SON birer kez, TOPLAM baştan bir, sondan
//     bir soyulur, dosya başı yorumu `normalize-request-path.ts`'te).
//   - decode: `resolveResponse.ts:241`'deki `decodeURIComponent(opts.path)`.
//   - mount eşleşmesi: Express'in ÖLÇÜLMÜŞ (`docs/gates/T-021-security-tur2.md`
//     §2, `-tur3.md` §2) `case sensitive routing` KAPALI davranışı — `/trpc`
//     segmenti büyük/küçük harf DUYARSIZ, segment SINIRINDA eşleşir. Bu,
//     `normalize-request-path.ts`'in `foldTrpcMountPrefix`'İ DEĞİL — AYRI,
//     bağımsız yazılmış bir model; test `normalizeRequestPath`'in İÇ
//     fonksiyonlarını ÇAĞIRMAZ, aksi halde DEĞİŞMEZLİK testi totolojik
//     (kendi kendini doğrulayan) olurdu.
//
// `tRPCçözer(P) ≠ null` demek "P, GERÇEK Express+tRPC zincirinde var olan bir
// prosedürü ÇALIŞTIRIR" demektir (mount eşleşmedi VEYA decode FIRLADI VEYA
// sonuç `appRouter`'da KAYITLI değilse `null`).
//
// ⭐ JETON KÜMESİ SEÇİMİ (gerekçe, DoD talebi): security tur3 35.840 yol
// taradı ve TEK bir ihlal ŞEKLİ buldu (§3.2). Bu test o 35.840'ı TEKRARLAMAZ
// — üç BİLİNEN eksenin (yüzde-kodlama, büyük/küçük harf, sondaki eğik çizgi)
// HER BİRİNİ VE İKİLİ/ÜÇLÜ KOMBİNASYONLARINI temsil eden KÜÇÜK bir küme
// seçildi: 4 mount varyantı (`/trpc`/`/TRPC`/`/Trpc`/`/tRpC`) × 3 nokta
// kodlaması (`.`/`%2E`/`%2e`) × 4 sondaki eğik çizgi arity'si (0-3) = prosedür
// başına 48 kombinasyon. `appRouter`'ın TÜM gerçek prosedürleri (sabit
// kodlanmamış, `appRouter._def.procedures`'tan OKUNUR — bugün 17) ile
// çarpıldığında ~816 kombinasyon: pür string işlemi, I/O YOK, milisaniyeler
// içinde koşar — security'nin 35.840'lık taramasının runtime'ı BU testin
// HEDEFİ DEĞİL (bir PR kapısında HER koşumda çalışacak, "makul" kalmalı).
// Diğer eksenler (Unicode, matrix parametresi, null byte, çift kodlama vb.)
// security tur3'ün KENDİ taramasında SIFIR ihlal ÜRETTİ (§3.2) — bu testin
// konusu DEĞİL, tekrar taranmaları israf olurdu.

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

// ⚠ `@arkesoft/trpc/server`'ın SUNUCU tarafı modül grafiği — bu dosya zaten
// `apps/api`'nin tRPC adaptöründe aynı alt yoldan import ediliyor
// (`trpc.controller.ts`), yeni bir bağımlılık EKLENMEDİ.
import { appRouter } from '@arkesoft/trpc/server'

import { normalizeRequestPath } from '../http/normalize-request-path.js'

// ---------------------------------------------------------------------------
// `appRouter`'ın GERÇEK envanteri — `packages/trpc/src/__tests__/
// authz-consistency.test.ts`'in ÖLÇTÜĞÜ AYNI iç API şekli (`_def.procedures`,
// düz nesne, anahtar NOKTALI TAM YOL). O dosya bu paketten EXPORT EDİLMİYOR
// (iç denetim aracı, `procedure-surface.ts` dosya başı yorumu) — bu yüzden
// okuma TEKRAR, BAĞIMSIZ olarak (yalnızca yol kümesi için, operation TÜRÜ bu
// testin KONUSU DEĞİL) yazılır. Tüketilen ad "bir fonksiyon" dönen değerler
// için `z.record` ayrıştırması gerektirir — AYNI gerekçe.
// ---------------------------------------------------------------------------

const procedureRecordSchema = z.record(z.string(), z.unknown())

function hasProperty<Key extends string>(value: unknown, key: Key): value is Record<Key, unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') && value !== null && key in value
  )
}

function readProperty(value: unknown, key: string): unknown {
  return hasProperty(value, key) ? value[key] : undefined
}

function readRouterProcedurePaths(): ReadonlySet<string> {
  const procedures = procedureRecordSchema.parse(
    readProperty(readProperty(appRouter, '_def'), 'procedures'),
  )
  return new Set(Object.keys(procedures))
}

// ---------------------------------------------------------------------------
// `tRPCçözer` — @trpc/server@11.19.0'ın GERÇEK kesme/decode/mount mantığının
// BAĞIMSIZ ikinci implementasyonu (dosya başı GÜNCELLEME yorumuna bkz).
// ---------------------------------------------------------------------------

const TRPC_ENDPOINT = '/trpc'
const INVARIANT_HARNESS_BASE = 'http://normalize-request-path-trpc-invariant.invalid'

/** `@trpc/server`'ın `fetchRequestHandler.ts`'indeki `trimSlashes`'in BİREBİR kopyası. */
function trimSlashesOnce(path: string): string {
  const withoutLeading = path.startsWith('/') ? path.slice(1) : path
  return withoutLeading.endsWith('/') ? withoutLeading.slice(0, -1) : withoutLeading
}

/**
 * Express'in ROTA KATMANI (`router/index.js`'in `parseurl`/legacy
 * `url.parse` tabanlı eşleşmesi — M-2/M-3, architect ⓵) GERÇEKTE ne
 * görüyorsa AYNEN onu üretir: `req.url`'İN KENDİSİ, sorgu dizesi/fragman
 * SOYULMUŞ (`url.parse`'ın yaptığı TEK normalizasyon), WHATWG `..` ÇÖZÜMÜ
 * YOK, host/authority YORUMU YOK (`slashesDenoteHost` varsayılan KAPALI —
 * ölçüldü, `node -e "require('url').parse('//evil.example/x')"` → `host:
 * null`, `pathname: '//evil.example/x'` DEĞİŞMEDEN). T-022/S2 adım①
 * (⚠⚠ MODELLEME DÜZELTMESİ): bu fonksiyon ÖNCEDEN `new URL(rawUrl, base)
 * .pathname` (WHATWG) ALIYORDU — bugünkü jeton kümesinde (mount büyük/
 * küçük harf, nokta kodlaması, sondaki eğik çizgi — HİÇBİRİ `//`/`..`
 * TAŞIMIYOR) WHATWG `pathname` ile ham request-target TESADÜFEN AYNI
 * olduğu için test YANLIŞ MODELLEMEYLE DE yeşil geliyordu. `//` ekseni
 * eklendiğinde (adım③) bu ikisi AYRIŞIR — Express ROTA eşleşmesi HAM
 * request-target üzerinden, tRPC'nin KENDİ prosedür çözümü (aşağıdaki
 * `resolveRealTrpcProcedureName`'in WHATWG adımı) ayrı bir aşamadır.
 */
function rawRequestTargetPath(rawUrl: string): string {
  const queryOrFragmentIndex = rawUrl.search(/[?#]/)
  return queryOrFragmentIndex === -1 ? rawUrl : rawUrl.slice(0, queryOrFragmentIndex)
}

/**
 * Express'in `@All('trpc/*path')` rotasının ÖLÇÜLMÜŞ (security tur2 §2,
 * tur3 §2) gerçek davranışını modeller: `case sensitive routing` KAPALI,
 * `/trpc` segmenti büyük/küçük harf DUYARSIZ, segment SINIRINDA (`''` veya
 * `'/'`) eşleşir. BAĞIMSIZ yazılmıştır — `foldTrpcMountPrefix` BURADAN
 * ÇAĞRILMAZ. ⚠ Girdi {@link rawRequestTargetPath}'in ÜRETTİĞİ HAM yoldur
 * (WHATWG `pathname` DEĞİL — yukarıdaki fonksiyon başı yorumuna bkz).
 */
function expressRoutesToTrpcMount(rawPath: string): boolean {
  if (rawPath.length < TRPC_ENDPOINT.length) {
    return false
  }

  const candidate = rawPath.slice(0, TRPC_ENDPOINT.length).toLowerCase()

  if (candidate !== TRPC_ENDPOINT) {
    return false
  }

  const boundary = rawPath.charAt(TRPC_ENDPOINT.length)
  return boundary === '' || boundary === '/'
}

/**
 * `rawUrl`'in GERÇEK Express+tRPC zincirinde ÇALIŞTIRACAĞI prosedür adını
 * döner; mount eşleşmediyse, WHATWG ayrıştırması FIRLADIYSA, decode
 * FIRLADIYSA veya sonuç `knownProcedurePaths`'TE KAYITLI değilse `null`
 * döner.
 *
 * ⚠⚠ İKİ AYRI AŞAMA, İKİ AYRI PARÇALAYICI (T-022/S2 adım① düzeltmesi):
 * (1) ROTA eşleşmesi — Express'in GERÇEKTEN gördüğü HAM request-target
 *     ({@link rawRequestTargetPath}), WHATWG YORUMU YOK.
 * (2) tRPC'nin KENDİ prosedür çözümü — `trpc.controller.ts:114`'ün BİREBİR
 *     aynısı, WHATWG `new URL(rawUrl, baseUrl).pathname` ÜZERİNDEN (dosya
 *     başı GÜNCELLEME yorumu, §1.5). Bu adım FIRLARSA (`new URL('//', …)`
 *     gibi) SADIK davranış `null`'dır — `trpc.controller.ts`'in kendisi de
 *     bu durumda isteği ÇALIŞTIRAMAZ; normalizer'a UYDURULMAZ (totoloji
 *     yasak, architect ⓵ dosya başı notu).
 */
function resolveRealTrpcProcedureName(
  rawUrl: string,
  knownProcedurePaths: ReadonlySet<string>,
): string | null {
  const rawPath = rawRequestTargetPath(rawUrl)

  if (!expressRoutesToTrpcMount(rawPath)) {
    return null
  }

  let pathname: string

  try {
    ;({ pathname } = new URL(rawUrl, INVARIANT_HARNESS_BASE))
  } catch {
    return null
  }

  // `fetchRequestHandler.ts:37-39`'un BİREBİR kopyası: `pathname` ÖNCE
  // kendi başına `trimSlashes`'lenir, SONRA mount uzunluğu kadar (İÇERİK
  // DEĞİL, POZİSYON — tur3'ün ÖLÇTÜĞÜ, BİLEREK KORUNAN davranış) kesilir ve
  // SONUÇ TEKRAR `trimSlashes`'lenir.
  const trimmedPathname = trimSlashesOnce(pathname)
  const trimmedEndpoint = trimSlashesOnce(TRPC_ENDPOINT)
  const slicedPath = trimmedPathname.slice(trimmedEndpoint.length)
  const trpcPath = trimSlashesOnce(slicedPath)

  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(trpcPath)
  } catch {
    return null
  }

  return knownProcedurePaths.has(decodedPath) ? decodedPath : null
}

// ---------------------------------------------------------------------------
// Mutasyon jetonu üretimi — dosya başı "JETON KÜMESİ SEÇİMİ" gerekçesi.
// ---------------------------------------------------------------------------

// T-022/S2 adım③ (R-3, `//` ekseni) — `MOUNT_VARIANTS` ÖNCEDEN TEK öncü eğik
// çizgiyi (`/trpc`) SABİT varsayıyordu. `MOUNT_SLASH_PREFIXES` bunu AYRI bir
// eksene çıkarır: `''` (hiç öncü eğik çizgi YOK — `new URL(rawUrl, base)`'in
// RELATİF bir yol olarak çözdüğü, M-5'in İLGİLENMEDİĞİ dejenere uç),
// `'/'` (BUGÜNKÜ, tek öncü — mevcut dört varyantla BİREBİR aynı davranış,
// regresyon YOK), `'//'` (M-5'in ÖLÇTÜĞÜ ASIL eksen: `expressRoutesToTrpcMount`
// ÖNCEKİ harness'in `rawRequestTargetPath` modeliyle — adım① — VE GERÇEK
// `path-to-regexp@8.4.2`'nin `match('/trpc/*path')`'i İLE BAĞIMSIZ OLARAK
// ÖLÇÜLDÜ: `//trpc/...` HİÇBİRİYLE EŞLEŞMEZ, `false` döner — TrpcController'ın
// KENDİ, İÇ rotası çift eğik çizgili bir mount'u asla GÖRMEZ; `'//'`'nin
// middleware zincirine girişi — M-5 — AYRI, GLOBAL `'*path'` rotasına
// özgüdür, BU rotaya DEĞİL). Üç öncü × dört harf varyantı = 12 mount
// varyantı (önceki 4'ün YERİNE DEĞİL, ÜZERİNE — `'/'` alt kümesi BUGÜNKÜ 4
// varyantla TAM ÖRTÜŞÜR, hiçbir mevcut vaka KAYBOLMAZ).
const MOUNT_SLASH_PREFIXES = ['', '/', '//'] as const
const TRPC_MOUNT_CASE_VARIANTS = ['trpc', 'TRPC', 'Trpc', 'tRpC'] as const
const MOUNT_VARIANTS = MOUNT_SLASH_PREFIXES.flatMap((prefix) =>
  TRPC_MOUNT_CASE_VARIANTS.map((core) => `${prefix}${core}`),
)
const DOT_TOKENS = ['.', '%2E', '%2e'] as const
const TRAILING_SLASH_COUNTS = [0, 1, 2, 3] as const

// T-022/S2 adım③ — architect'in R-3 bulgusundaki DÖRT "hedef" (`pm`'in
// R-3 riskinde VE architect ⓵'in ASIL BULGU'sunda BİREBİR aynı dört literal):
// PROSEDÜR ADI TAŞIMAYAN, bağımsız ham URL'ler. Express'in `/trpc/*path`
// rotası (`path-to-regexp@8.4.2`, yukarıdaki yorum) bunların HİÇBİRİYLE
// eşleşmez (`'/'`/`'//'`/`'//e'`/`'//e'` → beşten az karakter VEYA `/trpc`
// öneki YOK) ⇒ `resolveRealTrpcProcedureName` HER ZAMAN `null` döner —
// değişmezin antecedent'i (`trpcResolved ≠ null`) HİÇBİRİ İÇİN tetiklenmez.
// Bu VACUOUS bir "geçer" DEĞİL — `it.each` ile AYRICA, doğrudan `null`
// döndüğü MEKANİK olarak assert edilir (aşağıya bkz) ki gelecekte
// `expressRoutesToTrpcMount`/`rawRequestTargetPath` sessizce GEVŞERSE bu
// dosya SESSİZCE vacuous kalmaz, GÜRÜLTÜLÜ kırılır.
const STANDALONE_AUTHORITY_AMBIGUOUS_TARGETS = [
  '//',
  '///',
  '//evil.example',
  '//evil.example/x',
] as const

/** Prosedür yolundaki İLK `.`'ı (namespace/action ayracı) `dotToken` ile değiştirir. */
function applyDotToken(procedurePath: string, dotToken: string): string {
  const dotIndex = procedurePath.indexOf('.')

  if (dotIndex === -1) {
    // Vacuous DEĞİL — appRouter'ın TÜM prosedürlerinin "namespace.action"
    // biçiminde olduğu varsayımı burada MEKANİK olarak doğrulanır; bozulursa
    // test SESSİZCE atlamaz, GÜRÜLTÜLÜ fırlatır.
    throw new Error(
      `normalize-request-path-trpc-invariant.test.ts: "${procedurePath}" bir "." TAŞIMIYOR — appRouter prosedür adlandırma varsayımı BOZULDU`,
    )
  }

  return procedurePath.slice(0, dotIndex) + dotToken + procedurePath.slice(dotIndex + 1)
}

function buildCandidateUrls(procedurePath: string): readonly string[] {
  const candidates: string[] = []

  for (const mountVariant of MOUNT_VARIANTS) {
    for (const dotToken of DOT_TOKENS) {
      const mutatedProcedurePath = applyDotToken(procedurePath, dotToken)

      for (const trailingSlashCount of TRAILING_SLASH_COUNTS) {
        candidates.push(`${mountVariant}/${mutatedProcedurePath}${'/'.repeat(trailingSlashCount)}`)
      }
    }
  }

  return candidates
}

// ---------------------------------------------------------------------------
// Değişmezlik testi
// ---------------------------------------------------------------------------

describe('normalizeRequestPath — tRPC ile DEĞİŞMEZLİK (security tur3 F8, DoD İŞ①)', () => {
  const knownProcedurePaths = readRouterProcedurePaths()
  const procedurePaths = [...knownProcedurePaths]

  it('appRouter envanteri BOŞ DEĞİL (vacuous testi önler)', () => {
    expect(procedurePaths.length).toBeGreaterThan(0)
  })

  it(
    'tRPCçözer(P) ≠ null ⇒ normalizeRequestPath(P) === "/trpc/" + tRPCçözer(P) ' +
      '(HER appRouter prosedürü × temsilci mutasyon jetonu kümesi)',
    () => {
      const violations: {
        readonly rawUrl: string
        readonly trpcResolved: string
        readonly normalized: string
        readonly expected: string
      }[] = []
      let resolvedCandidateCount = 0

      for (const procedurePath of procedurePaths) {
        for (const rawUrl of buildCandidateUrls(procedurePath)) {
          const trpcResolved = resolveRealTrpcProcedureName(rawUrl, knownProcedurePaths)

          if (trpcResolved === null) {
            continue
          }

          resolvedCandidateCount += 1

          const normalized = normalizeRequestPath(rawUrl)
          const expected = `/trpc/${trpcResolved}`

          if (normalized !== expected) {
            violations.push({ rawUrl, trpcResolved, normalized, expected })
          }
        }
      }

      // Vacuous DEĞİL — jeton kümesinin en az bir alt kümesi GERÇEKTEN
      // tRPC'ye ulaşıyor mu (aksi halde `violations` hep boş olur ve test
      // hiçbir şey KANITLAMAZ).
      expect(resolvedCandidateCount).toBeGreaterThan(0)
      expect(violations).toEqual([])
    },
  )

  // T-022/S2 adım③ — dosya başı `STANDALONE_AUTHORITY_AMBIGUOUS_TARGETS`
  // yorumuna bkz: bu DÖRT hedef HİÇBİR appRouter prosedürünün ÖNÜNE
  // EKLENMEDEN, kendi başlarına test edilir. Vacuous DEĞİL — `null` dönüşü
  // BURADA doğrudan assert edilir (yukarıdaki değişmez testinin aksine,
  // bunlar `continue` ile SESSİZCE atlanmaz).
  it.each(STANDALONE_AUTHORITY_AMBIGUOUS_TARGETS)(
    '%s → Express /trpc/*path rotası EŞLEŞMEZ ⇒ tRPCçözer null döner (R-3 hedefi, vacuous DEĞİL)',
    (rawUrl) => {
      expect(resolveRealTrpcProcedureName(rawUrl, knownProcedurePaths)).toBeNull()
    },
  )
})
