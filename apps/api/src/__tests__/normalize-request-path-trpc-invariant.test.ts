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
 * Express'in `@All('trpc/*path')` rotasının ÖLÇÜLMÜŞ (security tur2 §2,
 * tur3 §2) gerçek davranışını modeller: `case sensitive routing` KAPALI,
 * `/trpc` segmenti büyük/küçük harf DUYARSIZ, segment SINIRINDA (`''` veya
 * `'/'`) eşleşir. BAĞIMSIZ yazılmıştır — `foldTrpcMountPrefix` BURADAN
 * ÇAĞRILMAZ.
 */
function expressRoutesToTrpcMount(pathname: string): boolean {
  if (pathname.length < TRPC_ENDPOINT.length) {
    return false
  }

  const candidate = pathname.slice(0, TRPC_ENDPOINT.length).toLowerCase()

  if (candidate !== TRPC_ENDPOINT) {
    return false
  }

  const boundary = pathname.charAt(TRPC_ENDPOINT.length)
  return boundary === '' || boundary === '/'
}

/**
 * `rawUrl`'in GERÇEK Express+tRPC zincirinde ÇALIŞTIRACAĞI prosedür adını
 * döner; mount eşleşmediyse, decode FIRLADIYSA veya sonuç `knownProcedurePaths`'TE
 * KAYITLI değilse `null` döner.
 */
function resolveRealTrpcProcedureName(
  rawUrl: string,
  knownProcedurePaths: ReadonlySet<string>,
): string | null {
  const { pathname } = new URL(rawUrl, INVARIANT_HARNESS_BASE)

  if (!expressRoutesToTrpcMount(pathname)) {
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

const MOUNT_VARIANTS = ['/trpc', '/TRPC', '/Trpc', '/tRpC'] as const
const DOT_TOKENS = ['.', '%2E', '%2e'] as const
const TRAILING_SLASH_COUNTS = [0, 1, 2, 3] as const

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
})
