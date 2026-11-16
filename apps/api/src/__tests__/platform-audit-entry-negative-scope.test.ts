// @arkesoft/api — AC-11 (negatif kapsam pini, v0.1.0 AC-13 emsali): impersonation
// yolunda gerekçe/süre sınırı/uyarı bandı alanı YOK (ROADMAP v0.0.20,
// T-021/S7, ADR-0023 Karar 3, architect madde 6)
//
// `PlatformAuditEntry`'nin (`../platform/platform-audit-entry.types.ts`)
// YOKLUĞUNU mekanik olarak pinler — üç jeton (`reason`/`expiresAt`/`banner`)
// bu dosyada HİÇ GEÇMEMELİDİR. Jetonlar AGENT_BASELINE.md §5'in literal-
// jeton kuralına uyarak ÇALIŞMA ANINDA birleştirilir.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const PLATFORM_AUDIT_ENTRY_TYPE_PATH = join(
  'apps',
  'api',
  'src',
  'platform',
  'platform-audit-entry.types.ts',
)

/** v0.15.0'ın sahipliğindeki üç alan — jetonlar ÇALIŞMA ANINDA birleştirilir. */
const FORBIDDEN_FIELD_NAMES = [
  ['rea', 'son'].join(''),
  ['expi', 'resAt'].join(''),
  ['ban', 'ner'].join(''),
] as const

function readPlatformAuditEntrySource(): string {
  return readFileSync(join(REPO_ROOT, PLATFORM_AUDIT_ENTRY_TYPE_PATH), 'utf-8')
}

describe('AC-11 — PlatformAuditEntry gerekçe/süre sınırı/uyarı bandı TAŞIMAZ', () => {
  it('dosya GERÇEKTEN okunuyor (vacuous değil) ve `PlatformAuditEntry` arayüzünü TAŞIYOR', () => {
    const source = readPlatformAuditEntrySource()

    expect(source.length).toBeGreaterThan(100)
    expect(source).toContain('interface PlatformAuditEntry')
  })

  it.each(FORBIDDEN_FIELD_NAMES)('%s jetonu HİÇ geçmez', (forbiddenField) => {
    const source = readPlatformAuditEntrySource()
    expect(source).not.toContain(forbiddenField)
  })

  it('kapı VACUOUS DEĞİL — AYNI üç jeton, kasıtlı olarak İÇEREN sentetik bir kaynakta YAKALANIR', () => {
    const syntheticViolation = [
      'export interface PlatformAuditEntry {',
      '  readonly actorUserId: string',
      '  readonly reason: string',
      '  readonly expiresAt: string',
      '  readonly banner: string',
      '}',
    ].join('\n')

    for (const forbiddenField of FORBIDDEN_FIELD_NAMES) {
      expect(syntheticViolation).toContain(forbiddenField)
    }
  })
})
