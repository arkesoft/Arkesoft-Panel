// @arkesoft/theme-sdk — `THEME_ASSET_REF_SCHEMA` birim testleri (ROADMAP
// v0.0.9, T-010/S5, AC13'ün ikinci üçte biri + path doğrulaması ·
// T-010 düzeltme turu 1/3 · parti A, H1: kara listeden izin listesine)

import { describe, expect, it } from 'vitest'

import { THEME_ASSET_REF_SCHEMA } from '../asset-ref.js'

function parsePath(path: string): boolean {
  return THEME_ASSET_REF_SCHEMA.safeParse({ source: 'theme-asset', path }).success
}

describe('THEME_ASSET_REF_SCHEMA — kabul', () => {
  it('göreli, basit bir yol kabul edilir', () => {
    const result = THEME_ASSET_REF_SCHEMA.safeParse({
      source: 'theme-asset',
      path: 'assets/hero.jpg',
    })
    expect(result.success).toBe(true)
  })
})

describe('THEME_ASSET_REF_SCHEMA — AC13 red: path servis yolu/URL olamaz', () => {
  it.each([
    ['mutlak URL (https://)', 'https://evil.example.com/hero.jpg'],
    ['mutlak URL (data:)', 'data:image/png;base64,AAAA'],
    ['baştaki /', '/assets/hero.jpg'],
    ['.. segmenti', 'assets/../../etc/passwd'],
    ['ters eğik çizgi', 'assets\\hero.jpg'],
  ])('"%s" → THEME_ASSET_REF_INVALID (path: "%s")', (_label, path) => {
    const result = THEME_ASSET_REF_SCHEMA.safeParse({ source: 'theme-asset', path })

    expect(result.success).toBe(false)
    if (result.success) {
      throw new Error('beklenmeyen başarı')
    }
    const issue = result.error.issues[0]
    if (issue?.code !== 'custom') {
      throw new Error('beklenmeyen issue biçimi')
    }
    expect(issue.params).toEqual({ themeContractErrorCode: 'THEME_ASSET_REF_INVALID' })
    expect(issue.path).toEqual(['path'])
  })

  it('source "theme-asset" dışında bir değer reddedilir (literal)', () => {
    const result = THEME_ASSET_REF_SCHEMA.safeParse({
      source: 'external-url',
      path: 'assets/hero.jpg',
    })
    expect(result.success).toBe(false)
  })

  it('bilinmeyen alan reddedilir (strictObject)', () => {
    const result = THEME_ASSET_REF_SCHEMA.safeParse({
      source: 'theme-asset',
      path: 'assets/hero.jpg',
      url: 'https://cdn.example.com/hero.jpg',
    })
    expect(result.success).toBe(false)
  })
})

// ⚠ H1 ZORUNLU KANIT (T-010 düzeltme turu 1/3 · parti A) — `security`'nin
// 36 girdisinin tamamı: 22 eski atlatma (AŞAĞIDA HEPSİ artık REDDEDİLİYOR,
// `'a..b/c.jpg'` HARİÇ — bkz. aşağıdaki AYRI blok, BİLİNÇLİ KABUL) + 14
// doğru red (KORUNUYOR).
describe('THEME_ASSET_REF_SCHEMA — H1: eski kara listenin 22 atlatması artık YAPISAL olarak reddediliyor', () => {
  it.each([
    ['baştaki boşluk + mutlak yol', ' /etc/passwd'],
    ['baştaki boşluk + ".."', ' ../x'],
    ['URL kodlu ".." (küçük harf)', '%2e%2e%2fsecrets.env'],
    ['URL kodlu ".." (büyük harf)', '%2E%2E/secrets.env'],
    ['çift URL kodlu ".."', '%252e%252e%252fsecrets.env'],
    ['dört nokta + çift /', '....//secrets.env'],
    ['üç nokta + /', '.../secrets.env'],
    ['tam genişlik nokta (fullwidth)', '\uFF0E\uFF0E/secrets.env'],
    ['tek nokta öncüsü (one dot leader)', '\u2024\u2024/secrets.env'],
    ['NUL bayt', 'a.jpg\0.png'],
    ['CRLF enjeksiyonu', 'a\r\nX-Injected: 1'],
    ['satır sonu (\\n)', 'a\nb'],
    ['sekme (\\t)', 'a\tb'],
    ['RTL geçersiz kılma', 'a\u202eb'],
    ['rakamla başlayan şema öneki', 'a1:/foo'],
    ['boş dize', ''],
    ['yalnızca nokta', '.'],
    ['sondaki /', 'assets/'],
    ['baştaki ./', './a.jpg'],
    ['NUL bayt + ".." segmenti', 'a/..\0/b'],
    ['8 KB yol', `${'a'.repeat(8192)}.jpg`],
  ])('"%s" artık reddediliyor (path: %j)', (_label, path) => {
    expect(parsePath(path)).toBe(false)
  })

  it('BİLİNÇLİ KARAR: "a..b/c.jpg" — "\\.\\." bir SEGMENT olarak yasaktır, ALT DİZE olarak DEĞİL; "a..b" meşru bir dizin adı olduğu için KABUL EDİLİR (dosya başı yorumu, asset-ref.ts)', () => {
    expect(parsePath('a..b/c.jpg')).toBe(true)
  })
})

// ⚠ Bu blok 13 vaka taşır; mevcut "AC13 red" bloğundaki `'mutlak URL
// (https://)'` vakası (1 tane, değiştirilmedi) ile BİRLİKTE toplam 14
// "doğru red" senaryosu KORUNUYOR (ZORUNLU KANIT #1).
describe('THEME_ASSET_REF_SCHEMA — H1: doğru red senaryoları KORUNUYOR', () => {
  it.each([
    ['".." segmenti (tek)', '../x'],
    ['ters eğik çizgili ".."', '..\\x'],
    ['yalnızca ".."', '..'],
    ['iç içe ".." zinciri', './a/../../b'],
    ['mutlak dosya sistemi yolu', '/etc/passwd'],
    ['protokolsüz mutlak URL', '//evil.com/x'],
    ['UNC yolu', '\\\\evil\\share'],
    ['Windows sürücü yolu (\\)', 'C:\\Windows\\System32'],
    ['Windows sürücü yolu (/)', 'C:/Windows/System32'],
    ['file: şeması', 'file:///etc/passwd'],
    ['data: şeması', 'data:text/plain,hi'],
    ['javascript: şeması', 'javascript:alert(1)'],
    ['JAVASCRIPT: şeması (büyük harf)', 'JAVASCRIPT:alert(1)'],
  ])('"%s" reddedilmeye devam ediyor (path: %j)', (_label, path) => {
    expect(parsePath(path)).toBe(false)
  })
})
