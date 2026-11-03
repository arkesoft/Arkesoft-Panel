// @arkesoft/storefront — AC3'ün BAĞLAYICI DÜZELTMESİ: `theme-css.ts` hiçbir
// GERÇEK ayar anahtarının (ör. `modern@0.1.0`'ın `color-primary` ailesi)
// literal metnini TAŞIMAZ (ROADMAP v0.0.10, T-012/S7, Orkestratör kararı)
//
// `@arkesoft/theme-sdk/src/manifest/__tests__/no-service-url-fields.
// test.ts`'in grep tabanlı drift-pin DESENİ (BİREBİR) burada da kullanılır:
// yorum satırları ELENİR (`codeLinesOf`), kalan KOD metninde gerçek anahtar
// dizelerinden HİÇBİRİ ARANMAZ.
//
// ⚠ BOŞ KÜME ÜZERİNDE GEÇMEME ZORUNLULUĞU (aynı emsal) — taranacak anahtar
// listesi `modernTheme.manifest.settings`'TEN CANLI OKUNUR (bu dosyada elle
// YAZILMAZ, SDK'nın gerçek sözleşmesinden TÜRER) ve `length > 0` doğrulanır
// — regex'in bugün GERÇEKTEN bir şey aradığını kanıtlar.
//
// ⚠⚠ MUTASYON KANITI (handoff'ta ham çıktıyla raporlanır, bu test
// DOSYASINDA DEĞİL — bir testin kendi kaynağını çalışma anında mutasyona
// uğratması güvenilmez bir desen olurdu): `../theme-css.ts`'e GEÇİCİ olarak
// gerçek bir anahtar literali (`'color-primary'`) eklenip bu test
// KOŞTURULDU, KIRMIZI döndüğü doğrulandı, ardından değişiklik GERİ ALINDI.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { modernTheme } from '@arkesoft/themes-modern'

const THEME_CSS_SOURCE_PATH = join(import.meta.dirname, '..', 'theme-css.ts')

/** Yorum satırlarını eler — `no-service-url-fields.test.ts` ile AYNI yöntem. */
function codeLinesOf(filePath: string): readonly string[] {
  return readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
}

describe('theme-css.ts — AC3 (düzeltilmiş): gerçek ayar anahtarı literali SIFIR', () => {
  it('taranan gerçek anahtar sayısı > 0 VE hiçbiri theme-css.ts kod satırlarında GEÇMİYOR', () => {
    const realSettingKeys = modernTheme.manifest.settings.map((setting) => setting.key)
    expect(realSettingKeys.length).toBeGreaterThan(0)

    const codeText = codeLinesOf(THEME_CSS_SOURCE_PATH).join('\n')

    const violations = realSettingKeys.filter((key) => codeText.includes(key))

    expect(violations).toEqual([])
  })
})
