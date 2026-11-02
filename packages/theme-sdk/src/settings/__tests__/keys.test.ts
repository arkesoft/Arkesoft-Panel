// @arkesoft/theme-sdk — `SETTING_KEY_SCHEMA`/`isUnsafeSettingKey` birim
// testleri (ROADMAP v0.0.9, T-010 düzeltme turu 1/3 · parti A, M1:
// biçim/uzunluk doğrulaması eksikliği)

import { describe, expect, it } from 'vitest'

import { SETTING_KEY_SCHEMA, isUnsafeSettingKey } from '../keys.js'

function parseKey(key: string): boolean {
  return SETTING_KEY_SCHEMA.safeParse(key).success
}

describe('SETTING_KEY_SCHEMA — M1 ZORUNLU KANIT: eski hâlde kabul edilen 7 girdi artık reddediliyor', () => {
  it.each([
    ['boş dize', ''],
    ['yalnızca boşluk', ' '],
    ['yol geçişi benzeri', '../x'],
    ['satır sonu içeren', 'a\nb'],
    ['Object.prototype üyesi (toString)', 'toString'],
    ['HTML benzeri işaret', '<script>'],
    ['5000 karakter', 'a'.repeat(5000)],
  ])('"%s" reddediliyor', (_label, key) => {
    expect(parseKey(key)).toBe(false)
  })
})

describe('SETTING_KEY_SCHEMA — meşru anahtarlar (camelCase VE kebab-case) kabul edilir', () => {
  it.each(['primaryColor', 'heading-font', 'show-banner', 'column-count', 'a', 'A1'])(
    '"%s" kabul ediliyor',
    (key) => {
      expect(parseKey(key)).toBe(true)
    },
  )
})

// ⚠ F5 ZORUNLU KANIT (T-010 düzeltme turu 2/3, qa'nın bulgusu) — Parti A'nın
// (tur 1/3) kara liste genişletmesi (3 → 9 ad) ÖNCEDEN BURADA yalnızca ÜÇ
// adla ÖLÇÜLÜYORDU — `Set`'ten (keys.ts) beş yeni addan HERHANGİ biri
// SİLİNSE bile bu describe YEŞİL kalırdı (183/183 test etkisiz). Artık
// `it.each` DOKUZ adın TAMAMINI koşturur — describe adı da kara listenin
// GERÇEK boyutunu söyler.
describe('SETTING_KEY_SCHEMA — dokuz adlı kara liste izin listesinin İÇİNDE kalır', () => {
  it.each([
    '__proto__',
    'constructor',
    'prototype',
    'toString',
    'toLocaleString',
    'valueOf',
    'hasOwnProperty',
    'isPrototypeOf',
    'propertyIsEnumerable',
  ])('"%s" hem isUnsafeSettingKey hem şema tarafından reddedilir', (key) => {
    expect(isUnsafeSettingKey(key)).toBe(true)
    expect(parseKey(key)).toBe(false)
  })
})

describe('SETTING_KEY_SCHEMA — tam sınırda uzunluk', () => {
  it('128 karakter kabul edilir, 129 karakter reddedilir', () => {
    expect(parseKey('a'.repeat(128))).toBe(true)
    expect(parseKey('a'.repeat(129))).toBe(false)
  })
})
