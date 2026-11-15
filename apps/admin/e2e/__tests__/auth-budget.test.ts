// @arkesoft/admin — `auth-budget.ts` değişmez testi (ROADMAP v0.0.19,
// T-020/S5, ADR-0022 Karar 3 (K3), po'nun "AC-4 MEKANİZMASI" bölümü).
//
// ⚠⚠ `R-C` (po buldu, Orkestratör doğruladı): bu dosya `vitest.config.ts`'in
// `include`'u GENİŞLETİLMEDEN KOŞMAZDI (eski `include`:
// `['src/**/*.test.ts', 'scripts/**/*.test.ts']` — `e2e/` HİÇ kapsanmıyordu)
// ⇒ `AC-4`'ün TAMAMI sessizce sahte olurdu. `vitest.config.ts`'e
// `'e2e/**/*.test.ts'` EKLENDİ (bu alt görevin AYRILMAZ parçası).
//
// ÜÇ DEĞİŞMEZ (dördüncüsü — pin tazeliği — `guards.sh`'e gidiyor, T-020/S7,
// BURADA YAZILMAZ):
//   1. Fail-closed kapsama: `e2e/` kökündeki HER `*.spec.ts` dosyası
//      `SPEC_AUTH_COST`'ta bir anahtar olarak VAR mı.
//   2. Çarpan değişmezi: `e2e/responsive/**` içinde `/auth/sign-in/email`
//      veya `/auth/sign-up/email` jetonunun HİÇBİR biçimi YOK.
//   3. Toplam: `Σ signIn ≤ AUTH_IP_LIMITS.signIn` ve
//      `Σ signUp ≤ AUTH_IP_LIMITS.signUp`.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { AUTH_IP_LIMITS, SPEC_AUTH_COST } from '../auth-budget.js'

/** `e2e/` kökü — bu test dosyasının `__tests__` üst dizini. */
const E2E_ROOT = fileURLToPath(new URL('..', import.meta.url))
const RESPONSIVE_ROOT = join(E2E_ROOT, 'responsive')

/** `dir` ALTINDAKİ TÜM dosyaları (alt dizinler dahil) MUTLAK yolla döner. */
function listFilesRecursively(dir: string): readonly string[] {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entryName of entries) {
    const entryPath = join(dir, entryName)
    const entryStats = statSync(entryPath)
    if (entryStats.isDirectory()) {
      files.push(...listFilesRecursively(entryPath))
    } else if (entryStats.isFile()) {
      files.push(entryPath)
    }
  }
  return files
}

/** `e2e/` kökünden POSIX (`/`) ayraçlı göreli yol — `SPEC_AUTH_COST`'un anahtar biçimi. */
function toPosixRelativePath(absolutePath: string): string {
  return relative(E2E_ROOT, absolutePath).split(sep).join('/')
}

describe('auth-budget — fail-closed değişmezler (T-020/S5, ADR-0022 K3)', () => {
  it('e2e/ kökündeki her *.spec.ts dosyası SPEC_AUTH_COST tablosunda bir anahtar olarak var (fail-closed kapsama)', () => {
    const specFiles = listFilesRecursively(E2E_ROOT)
      .filter((filePath) => filePath.endsWith('.spec.ts'))
      .map(toPosixRelativePath)

    // ⚠ Bu assertion'ın BOŞ kümeye karşı sessizce PASS olmaması için —
    // bugün dört gerçek spec dosyası + bir responsive spec'i VAR, bu sayı
    // SIFIR OLAMAZ (olursa bu testin KENDİSİ bir regresyonu kaçırıyor
    // demektir).
    expect(specFiles.length).toBeGreaterThan(0)

    const missingFromBudgetTable = specFiles.filter((specFile) => !(specFile in SPEC_AUTH_COST))
    expect(missingFromBudgetTable).toEqual([])
  })

  it('e2e/responsive/** içinde /auth/sign-in/email veya /auth/sign-up/email jetonunun hiçbir biçimi yok (çarpan değişmezi)', () => {
    const responsiveFiles = listFilesRecursively(RESPONSIVE_ROOT)
    expect(responsiveFiles.length).toBeGreaterThan(0)

    const forbiddenTokens = ['/auth/sign-in/email', '/auth/sign-up/email']
    const violations: string[] = []
    for (const filePath of responsiveFiles) {
      const contents = readFileSync(filePath, 'utf8')
      for (const token of forbiddenTokens) {
        if (contents.includes(token)) {
          violations.push(`${toPosixRelativePath(filePath)} → "${token}"`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('beyan edilen toplam sign-in/sign-up maliyeti gerçek sınırların altında kalıyor (toplam)', () => {
    const totals = Object.values(SPEC_AUTH_COST).reduce(
      (accumulator, cost) => ({
        signIn: accumulator.signIn + cost.signIn,
        signUp: accumulator.signUp + cost.signUp,
      }),
      { signIn: 0, signUp: 0 },
    )

    expect(totals.signIn).toBeLessThanOrEqual(AUTH_IP_LIMITS.signIn)
    expect(totals.signUp).toBeLessThanOrEqual(AUTH_IP_LIMITS.signUp)
  })
})
