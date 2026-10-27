// "scripts/" bir pnpm workspace paketi DEĞİL; kök `package.json`'da "eslint" YOK
// (yeni kök bağımlılığı bu düzeltme turunun (T-003 tur 1, A4) kapsamı dışı).
// Bu config `packages/config/node_modules/.bin/eslint` ikilisiyle (zaten kurulu,
// yeni bağımlılık değil) çalıştırılmak üzere tasarlandı:
//   ./packages/config/node_modules/.bin/eslint --config scripts/eslint.config.mjs scripts
// (bkz. `.github/workflows/ci.yml` → `guards` job). `./scripts/tsconfig.json`
// tip bilgisine dayalı kuralların çalışması için gereken `@types/node`'u aynı
// şekilde packages/config'in kurulu `node_modules`'ünden ödünç alıyor.
import { nodeConfig } from '@arkesoft/config/eslint/node'

export default [...nodeConfig(import.meta.dirname)]
