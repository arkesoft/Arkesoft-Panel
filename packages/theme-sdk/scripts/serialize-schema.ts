// @arkesoft/theme-sdk — şema NESNESİNİ Prettier UYUMLU bir dizeye çeviren TEK
// serileştirici (ROADMAP v0.0.9, T-010/S7, V7 bağlayıcı kısıtı).
//
// ⚠ BU DOSYA `src/` DIŞINDADIR — saflık pini (`src/__tests__/purity.test.ts`)
// kapsamı `src/**` ile sınırlıdır, `scripts/`'i TARAMAZ. `scripts/` Node
// yerleşiklerine VE (bu dosyada) `prettier`'a erişebilir — bu paketin kapalı
// bağımlılık listesi (`dependencies: { zod }`) bu dosyayı KAPSAMAZ, çünkü
// `prettier` bir `devDependency`'dir (kök workspace'te zaten vardı, yeni ana
// bağımlılık EKLENMEDİ) ve YAYINLANAN pakette (`dist/`, `files: ["dist"]`)
// bulunmaz — `scripts/` hiçbir zaman `dist/`'e girmez (tsconfig.build.json
// dosya başı yorumu).
//
// ⚠ "AYNI SERİLEŞTİRİCİ" KISITI (V7): `scripts/generate-contract-schema.ts`
// (üretim CLI'si) VE `src/__tests__/contract-schema.test.ts` (AC12 bayatlık
// testi) bu dosyadaki TEK fonksiyonu çağırır — iki ayrı biçimlendirme
// mantığı YOKTUR (bkz. generate-contract-schema.ts'in dosya başı yorumu:
// kopya sayısı `rg` ile 1 olarak kanıtlanır).

import { format, resolveConfig } from 'prettier'

/**
 * Bir JSON Schema NESNESİNİ (`buildThemeContractJsonSchema()`'nın çıktısı)
 * kanonik, Prettier UYUMLU bir JSON dizesine çevirir.
 *
 * `targetFilePath` Prettier'a İKİ şeyi SEÇTİRİR: (a) doğru `parser` (dosya
 * uzantısından), (b) kök yapılandırmanın `*.json` override'ı (`packages/
 * config/prettier/index.js`: `trailingComma: 'none'`) — `docs/theme-contract.
 * schema.json`'IN GERÇEK yoluyla çağrıldığında `pnpm format:check`'in o
 * dosyayı tararken ÜRETECEĞİ sonuçla BİREBİR eşleşir (V7, R-D).
 */
export async function serializeThemeContractJsonSchema(
  schema: unknown,
  targetFilePath: string,
): Promise<string> {
  const resolvedConfig = await resolveConfig(targetFilePath)
  return format(JSON.stringify(schema), {
    ...resolvedConfig,
    filepath: targetFilePath,
  })
}
