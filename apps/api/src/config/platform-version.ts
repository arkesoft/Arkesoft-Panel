// @arkesoft/api — platform sürümü (ROADMAP v0.0.4, T-002/ST-2, architect K-A8)
//
// `apps/api`'nin sürümü platformla LOCKSTEP tutulur (T-001 precedenti) — ayrı
// bir "platform version" kaynağı icat edilmez, doğrudan BU paketin
// `package.json`'ı okunur. `/health`'in `version` alanı bu değeri taşır; test
// bu değerin hem `apps/api/package.json` hem kök `package.json` sürümüyle
// eşitliğini doğrular (ikisi lockstep tutulduğu sürece eşit kalır).
//
// Dış dünyadan gelen her veri Zod ile parse edilir (CLAUDE.md §4) — bir JSON
// dosyasının okunması da dış veridir; `JSON.parse` çıktısına Zod'suz tip
// verilmez.
//
// YOL HESABI: bu modül derlenince `dist/config/platform-version.js` olur.
// `src/config/` ile `dist/config/` AYNI derinlikte olduğu için kaynak ve
// derlenmiş hâlde AYNI bağıl yol çalışır:
//   dist/config/platform-version.js → ../../package.json
//   = dist/config -> (..) dist -> (..) apps/api/package.json

import { readFileSync } from 'node:fs'

import { z } from 'zod'

const packageJsonSchema = z.object({
  version: z.string().min(1, 'boş olamaz'),
})

/**
 * `apps/api/package.json`'ı okur, Zod ile doğrular ve sürüm alanını döner.
 * Geçersiz/okunamayan dosyada Zod/`fs` hatası ÇAĞIRANA iletilir (yutulmaz).
 */
export function resolvePlatformVersion(): string {
  const raw = readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')
  const parsed = packageJsonSchema.parse(JSON.parse(raw) as unknown)
  return parsed.version
}
