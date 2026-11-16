// @arkesoft/superadmin — `auth-budget.ts` değişmez testi (ROADMAP v0.0.20,
// T-021/S10, `apps/admin/e2e/__tests__/auth-budget.test.ts`'in AYNI deseni —
// ADR-0022 Karar 3 (K3)).
//
// ⚠⚠ Bu dosyanın Playwright TARAFINDAN yüklenip "Cannot read properties of
// undefined (reading 'config')" ile ÇÖKMEMESİ `playwright.config.ts`'in
// `testMatch: '**/*.spec.ts'` sabitlemesine BAĞLIDIR (dosya başı yorumuna
// bkz.) — bu dosya `.test.ts`, Playwright'ın ARADIĞI desen DEĞİL.
//
// İKİ DEĞİŞMEZ (`apps/admin`'in ÜÇÜNDEN biri — "çarpan sıfırı" — BU
// uygulamada `responsive/`/`visual/` dizini OLMADIĞI için YOKTUR, A-T21-5,
// `auth-budget.ts`'in dosya başı notu. Üçüncü değişmez — pin tazeliği —
// `guards.sh`'e gidiyor, BURADA YAZILMAZ):
//   1. Fail-closed kapsama: `e2e/` kökündeki HER `*.spec.ts` dosyası
//      `SPEC_AUTH_COST`'ta bir anahtar olarak VAR mı.
//   2. Toplam: `Σ signIn ≤ AUTH_IP_LIMITS.signIn` ve
//      `Σ signUp ≤ AUTH_IP_LIMITS.signUp`.
import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { AUTH_IP_LIMITS, SPEC_AUTH_COST } from '../auth-budget.js'

/** `e2e/` kökü — bu test dosyasının `__tests__` üst dizini. */
const E2E_ROOT = fileURLToPath(new URL('..', import.meta.url))

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

describe('auth-budget — fail-closed değişmezler (T-021/S10, ADR-0022 K3)', () => {
  it('e2e/ kökündeki her *.spec.ts dosyası SPEC_AUTH_COST tablosunda bir anahtar olarak var (fail-closed kapsama)', () => {
    const specFiles = listFilesRecursively(E2E_ROOT)
      .filter((filePath) => filePath.endsWith('.spec.ts'))
      .map(toPosixRelativePath)

    // ⚠ Bu assertion'ın BOŞ kümeye karşı sessizce PASS olmaması için — bugün
    // iki gerçek spec dosyası VAR, bu sayı SIFIR OLAMAZ (olursa bu testin
    // KENDİSİ bir regresyonu kaçırıyor demektir).
    expect(specFiles.length).toBeGreaterThan(0)

    const missingFromBudgetTable = specFiles.filter((specFile) => !(specFile in SPEC_AUTH_COST))
    expect(missingFromBudgetTable).toEqual([])
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
