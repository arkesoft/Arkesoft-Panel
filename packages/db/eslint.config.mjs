import { nodeConfig } from '@arkesoft/config/eslint/node'
import { restrictedImportsOptions } from '@arkesoft/config/eslint/base'

// FIX turu 1 (T-005 security gate, S1): `src/client.ts` istisnası eskiden
// `'no-restricted-imports': 'off'` ile KURALIN TAMAMINI kapatıyordu — oysa
// gerekçe (yorumda da yazılı) YALNIZCA `@prisma/adapter-pg`. `'off'` o
// dosyada `@prisma/client`/`.prisma/client` yasağını da birlikte açıyordu;
// tam da #prisma dolaylamasının korunması gerektiği dosyada. Düzeltme: tüm
// listeyi KOPYALAMADAN, `@arkesoft/config/eslint/base`'in dışa açtığı
// `restrictedImportsOptions`'ı içe alıp yalnızca `@prisma/adapter-pg`
// girdisini FİLTRELEYEREK yeniden bildiriyoruz — üst listedeki başka bir
// değişiklik bu istisnayı elle senkronize etmeyi gerektirmez.
const clientFileAllowedImports = {
  ...restrictedImportsOptions,
  paths: restrictedImportsOptions.paths.filter((path) => path.name !== '@prisma/adapter-pg'),
}

export default [
  // Prisma'nın ürettiği istemci (prisma/schema.prisma → generated/) bizim
  // kaynağımız değil; `// @ts-nocheck` taşıyan üretilmiş kod lint kapsamı dışında.
  { ignores: ['generated/**'] },
  ...nodeConfig(import.meta.dirname),

  // K-E12 (T-005, v0.0.13) — ZORUNLU İSTİSNA, DOSYA KAPSAMLI.
  // `src/client.ts` tek Prisma istemci fabrikasıdır ve `@prisma/adapter-pg`'yi
  // (Prisma 7'nin sürücü adaptörü) MEŞRU olarak kurar — repoda bu paketin
  // TEK kullanım yeri (`client.ts:14`). Paket genelinde kapatma YASAK: bu
  // override `files` alanıyla yalnızca bu dosyayı hedefler, başka hiçbir
  // `packages/db/src/**` dosyası `pg`/`@prisma/adapter-pg` import edemez —
  // VE bu dosyanın kendisi de `@prisma/client`/`.prisma/client` yasağından
  // MUAF DEĞİLDİR (yalnızca `@prisma/adapter-pg` muaf).
  {
    files: ['src/client.ts'],
    rules: {
      'no-restricted-imports': ['error', clientFileAllowedImports],
    },
  },
]
