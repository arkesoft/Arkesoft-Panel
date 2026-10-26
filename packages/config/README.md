# @arkesoft/config

Monorepo genelinde paylaşılan araç yapılandırmaları. Tek doğruluk kaynağı burasıdır;
hiçbir paket kendi başına ESLint/TypeScript kuralı tanımlamaz.

## tsconfig

| Preset                | Kimler kullanır                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `tsconfig/base.json`  | Doğrudan kullanılmaz; katılık kurallarının tamamı burada                                  |
| `tsconfig/node.json`  | `apps/api`, `packages/db`, `packages/trpc`, `packages/theme-sdk`, `packages/integrations` |
| `tsconfig/react.json` | `apps/admin`, `apps/superadmin`, `apps/storefront`, `packages/ui`                         |

```jsonc
// paket/tsconfig.json
{
  "extends": "@arkesoft/config/tsconfig/node.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "tsBuildInfoFile": "dist/.tsbuildinfo",
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"],
}
```

**Yol içeren seçenekler (`outDir`, `rootDir`, `include`, `exclude`) base'de tutulmaz.**
TypeScript `extends` ile gelen göreli yolları tanımlandığı dosyaya göre çözer; base
`node_modules` içinde yaşadığı için bu alanlar oraya yazılırsa yanlış dizine çıktı üretir.

`declaration` ve `declarationMap` tsconfig'de değil, `build` script'inde bayrak olarak
verilir. Böylece aynı tsconfig ile `tsc --noEmit` tip kontrolü çakışmadan çalışır.

## ESLint

```js
// paket/eslint.config.mjs
import { nodeConfig } from '@arkesoft/config/eslint/node'

export default nodeConfig(import.meta.dirname)
```

React/tarayıcı paketleri için `@arkesoft/config/eslint/react` → `reactConfig`.

Açık olan kural setleri: `@eslint/js` recommended + `typescript-eslint`
`strictTypeChecked` + `stylisticTypeChecked`, üzerine CLAUDE.md §2 ve §4'ü zorlayan
Arkesoft kuralları ve isimlendirme sözleşmesi. Prettier ile çakışan biçim kuralları
en sonda kapatılır.

Tip bilgisine dayalı kurallar `projectService: true` ile çalışır: her dosyanın tipleri
en yakın `tsconfig.json`'dan okunur. `.js`/`.mjs` yapılandırma dosyaları tip bilgisi
olmadan lint edilir.

## Prettier

Kökteki `prettier.config.mjs` buradaki yapılandırmayı yeniden dışa aktarır. Prettier
yapılandırmayı dosya ağacında yukarı doğru aradığı için tek dosya tüm monorepo'yu kapsar.

## Tailwind

`tailwind/theme.css` — Tailwind v4 `@theme` token iskeleti. **Şu an yer tutucu:**
Tailwind henüz kurulu değil ve bu dosya hiçbir yerden içe alınmıyor. Token değerleri
v0.0.7'de kesinleşecek.

## Sürüm notu

TypeScript `6.0.3`'e sabitlenmiştir. Gerekçe: `typescript-eslint` 8.x type-aware lint
için `typescript >=4.8.4 <6.1.0` istiyor; TypeScript 7 (native port) henüz desteklenmiyor.
Bkz. `ROADMAP.md` → Varsayımlar A13.
