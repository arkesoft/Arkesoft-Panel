// @arkesoft/theme-sdk — AC13'ün İKİNCİ ÜÇTE BİRİ: `src/manifest/**` hiçbir
// alanı servis-URL/önbellek alanı gibi ADLANDIRMAZ (ROADMAP v0.0.9, T-010/S5)
//
// Architect'in bağlayıcı kararı: manifest "bu varlık temaya ait, adı şu"
// der, "nereden servis edileceğini" (hangi route/CDN/önbellek başlığı)
// SÖYLEMEZ (bkz. `../asset-ref.ts` dosya başı yorumu, v0.0.10'un üç
// önbellek yolu). Bu test `src/manifest/**`'teki ÜRETİM dosyalarını (test
// dosyaları HARİÇ) TARAR ve hiçbir alan/anahtar adının servis-URL/önbellek
// ailesinden (`url`, `href`, `cacheControl`, `maxAge`, `immutable`,
// `publicPath`, `assetsPrefix`, `baseUrl`) biriyle TAM EŞLEŞMEDİĞİNİ
// doğrular.
//
// ⚠ BOŞ KÜME ÜZERİNDE GEÇMEME ZORUNLULUĞU (handoff'ta bağlayıcı) — tarama
// `scannedFieldCount > 0` assertion'ı taşır: bu OLMADAN regex'in gelecekte
// sessizce HİÇBİR ALAN BULAMAMASI ("taradım, hiçbir ihlal yok" ile "hiçbir
// şey TARAMADIM" ayırt edilemez hâle gelir) testi YANLIŞ NEDENLE yeşil
// tutardı — tıpkı `src/__tests__/purity.test.ts`'in `files.length`
// assertion'ı gibi (AYNI sınıf kusura karşı AYNI savunma, bu dosyada
// TEKRARLANIYOR çünkü farklı bir tarama kapsamı/deseni kullanıyor).
//
// Alan adı adayı regex'i: satır başında (yorum/açıklama satırları HARİÇ)
// `[isim]: ` veya `readonly [isim]: ` biçimindeki TypeScript nesne/arayüz
// üye bildirimleri VE Zod şema `shape` anahtarları (`z.strictObject({ isim:
// ... })` çağrılarının İÇİNDEKİ satırlar AYNI biçimdedir) — ikisi de aynı
// sözdizimsel şekli (`identifier: ` satır başında) paylaşır.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const MANIFEST_SRC_DIR = join(import.meta.dirname, '..')

/** Yorum satırlarını eler — yalnızca gerçek kod satırlarını bırakır (`purity.test.ts` ile AYNI yöntem). */
function codeLinesOf(filePath: string): readonly string[] {
  return readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
}

/** `src/manifest/` altındaki (test dosyaları HARİÇ) tüm `.ts` dosyalarının yolları. */
function manifestProductionSourceFiles(): readonly string[] {
  return readdirSync(MANIFEST_SRC_DIR, { withFileTypes: true, recursive: true })
    .filter(
      (entry) =>
        entry.isFile() && entry.name.endsWith('.ts') && !entry.parentPath.includes('__tests__'),
    )
    .map((entry) => join(entry.parentPath, entry.name))
}

/** Satır başında `[isim]: ` veya `readonly [isim]: ` biçimindeki bir alan bildiriminin adını yakalar. */
const FIELD_DECLARATION_PATTERN = /^\s*(?:readonly\s+)?([a-zA-Z_$][\w$]*)\??\s*:\s*\S/

/** Servis-URL/önbellek ailesinden yasaklı alan adları — TAM eşleşme, büyük/küçük harf fark etmez (dosya başı yorumu). */
const FORBIDDEN_FIELD_NAMES: ReadonlySet<string> = new Set([
  'url',
  'href',
  'cachecontrol',
  'maxage',
  'immutable',
  'publicpath',
  'assetsprefix',
  'baseurl',
])

describe('src/manifest/** — AC13: servis-URL/önbellek alanı adlandırması YOK', () => {
  it('taranan alan sayısı > 0 VE hiçbiri yasaklı isim ailesiyle TAM eşleşmiyor', () => {
    const files = manifestProductionSourceFiles()
    expect(files.length).toBeGreaterThan(0)

    const scannedFields: string[] = []
    const violations: string[] = []

    for (const filePath of files) {
      for (const line of codeLinesOf(filePath)) {
        const match = FIELD_DECLARATION_PATTERN.exec(line)
        if (match === null) {
          continue
        }

        const fieldName = match[1]
        if (fieldName === undefined) {
          continue
        }

        scannedFields.push(fieldName)

        if (FORBIDDEN_FIELD_NAMES.has(fieldName.toLowerCase())) {
          violations.push(`${filePath}: "${fieldName}" → ${line.trim()}`)
        }
      }
    }

    // ⚠ Bu assertion OLMADAN aşağıdaki `violations` kontrolü BOŞ KÜME
    // üzerinde de yeşil kalırdı (dosya başı yorumu) — regex'in bugün
    // GERÇEKTEN eşleştiğini kanıtlar.
    expect(scannedFields.length).toBeGreaterThan(0)
    expect(violations).toEqual([])
  })
})
