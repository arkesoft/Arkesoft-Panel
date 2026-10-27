import { nodeConfig } from '@arkesoft/config/eslint/node'

export default [
  // Prisma'nın ürettiği istemci (prisma/schema.prisma → generated/) bizim
  // kaynağımız değil; `// @ts-nocheck` taşıyan üretilmiş kod lint kapsamı dışında.
  { ignores: ['generated/**'] },
  ...nodeConfig(import.meta.dirname),
]
