// @arkesoft/trpc — sözleşme yüzeyi NESNESİNİ Prettier UYUMLU bir dizeye
// çeviren TEK serileştirici (ROADMAP v0.0.22, T-026/S1, architect madde 6
// "TEK serileştirici" — theme-sdk V7 bağlayıcı kısıtının emsali)
//
// ⚠ BU DOSYA `src/` DIŞINDADIR — saflık pini `src/**`'i tarasa bile bu
// dizini kapsamaz (bu paket henüz bir saflık pini TAŞIMIYOR, ama desen
// theme-sdk'nin `scripts/serialize-schema.ts`'iyle BİREBİR aynı: `scripts/`
// Node yerleşiklerine VE `prettier`'a erişebilir — bu paketin
// `package.json`'ındaki `dependencies` listesi [`@arkesoft/errors`,
// `@trpc/client`, `@trpc/server`, `zod`] bu dosyayı KAPSAMAZ, çünkü
// `prettier` kök workspace'in ZATEN var olan bir `devDependency`'sidir,
// YENİ bir ana bağımlılık EKLENMEDİ ve YAYINLANAN pakette, `dist/`'te,
// `files: ["dist"]` nedeniyle hiç BULUNMAZ — `scripts/` ASLA `dist/`'e
// derlenmez, `tsconfig.build.json`'ın `include` alanı yalnızca `src/**/*`).
//
// ⚠⚠ GÖRELİ İTHALAT YOK (BİLEREK) — `../src/contract/canonicalize.js`'i
// BURADA İTHAL ETMEK, bu dosyanın `scripts/generate-contract-surface.ts`
// tarafından DOĞRUDAN `.ts` uzantısıyla dinamik olarak çalıştırılmasını
// (derlenmemiş kaynaktan, `dist/` BEKLEMEDEN) KIRARDI: `src/contract/
// canonicalize.ts` kendi içinde göreli `.js` belirteçleri TAŞIMASA bile
// (bugün sıfır ithalatı var), paketin HER YERİNDE kurulu NodeNext kuralı
// (`generate-contract-surface.ts`'in dosya başı yorumu, theme-sdk V-PO1
// emsali) bu dosyanın scripts/'te KALMASININ sebebidir — `canonicalizeJsonValue`
// zaten KENDİ TEK I/O'sundan ARINMIŞ (SAF) bir fonksiyon, çağıran (script/
// test) onu KENDİSİ dinamik/statik olarak yükler ve BU dosyaya önceden
// kanonikleştirilmiş bir değer VERİR — bu yüzden `serializeContractSurface`
// kanonikleştirme YAPMAZ, SADECE stringify + Prettier biçimlendirir (tek
// sorumluluk, theme-sdk'nin `serialize-schema.ts`'inin AYNI tasarımı: TEK
// dış bağımlılık, `prettier`, ÇIPLAK/bare belirteç — BAŞKA hiçbir göreli
// dosya İTHAL EDİLMEZ).
//
// ⚠ "AYNI SERİLEŞTİRİCİ" KISITI (madde 6): `scripts/generate-contract-
// surface.ts` (üretim CLI'si) VE `src/__tests__/contract-surface.test.ts`
// BU dosyadaki TEK fonksiyonu çağırır (biri dinamik `.ts` ithalatıyla,
// diğeri STATİK ithalatla — vitest'in çözümleyicisi ikisini de destekler) —
// iki ayrı biçimlendirme mantığı YOKTUR; theme-sdk'nin V7'si "iki kopyanın
// sapma ürettiğini" (`R-A5`) YAŞADI, burada tekrarlanmaz.
//
// D5 (architect madde 5): prettier GERÇEK HEDEF YOLLA (`targetFilePath`)
// çağrılır — kök yapılandırmanın `*.json` override'ını (`trailingComma:
// 'none'`) `resolveConfig` otomatik SEÇTİRİR, bu yüzden `docs/api-contract-
// surface.json`'IN GERÇEK yoluyla çağrıldığında `pnpm format:check`'in o
// dosyayı tararken ÜRETECEĞİ sonuçla BİREBİR eşleşir.

import { format, resolveConfig } from 'prettier'

/**
 * ÖNCEDEN kanonikleştirilmiş (`canonicalizeJsonValue()`'nun çıktısı) bir
 * değeri Prettier UYUMLU bir JSON dizesine çevirir. Bu fonksiyon KENDİSİ
 * kanonikleştirme YAPMAZ (dosya başı yorumu) — girdinin anahtar/`required`
 * sırası ZATEN kararlı olduğu VARSAYILIR.
 */
export async function serializeContractSurface(
  canonicalDocument: unknown,
  targetFilePath: string,
): Promise<string> {
  const resolvedConfig = await resolveConfig(targetFilePath)
  return format(JSON.stringify(canonicalDocument), {
    ...resolvedConfig,
    filepath: targetFilePath,
  })
}
