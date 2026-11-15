// @arkesoft/api — test harness'ına ÖZEL Redis bağlantı profili (ROADMAP
// v0.1.0, T-019 düzeltme turu 4, Q-1 — kullanıcı kararı: "Test harness'a
// kendi Redis profili", CLAUDE.md §4.5 tetikleyici 4 ile açılan tur)
//
// NEDEN BU DOSYA VAR (ÖLÇÜLDÜ, bu turun KENDİ ölçümü — raporun KARARLAR
// bölümünde ham çıktı var): sentetik ama GERÇEK Redis komut trafiği üreten
// bir yük altında (40 eşzamanlı `ioredis` bağlantısından sürekli SET/GET
// pipeline + ~4 sn'de bir ~2 sn süren tek-iş-parçacıklı `EVAL` busy-loop
// bloğu, arkesoft-redis'e karşı) `pnpm --filter @arkesoft/api test --
// auth-flow.test.ts rate-limit.test.ts` İKİ AYRI koşumda İKİSİNDE de
// kırmızı verdi — `RATE_LIMIT_STORE_UNAVAILABLE` + `causeMessage: "Command
// timed out"` (ioredis@6.0.0, `Command.js:207:33`), `qa`'nın tur 2'de
// GERÇEK yabancı konteyner yükü altında gözlediği İMZANIN BİREBİR AYNISI.
// Bağımsız bir prob bağlantısıyla (production 'health' profiliyle BİREBİR
// AYNI seçenekler, `create-redis-connection.ts`'ten SALT-OKUNUR import,
// üretim koduna DOKUNULMADAN) ÖLÇÜLDÜ: AYNI sentetik yük altında tekli
// komutlar (`SET`) TUTARLI OLARAK ~2000–2142ms sürüyor (tek bir busy-loop
// bloğunun ömrü) — `'health'` profilinin 1500ms `commandTimeout`'u bu
// aralığın ORTASINDA kalıyor, yani test harness'ının fail-fast eşiği
// GERÇEK (ama GEÇİCİ, kendi kendine düzelen) komut gecikmesinden DAHA
// DÜŞÜK. Bu eşik PRODUCTION'da DOĞRUDUR (K1.a, R-A4) — kusur test
// harness'ının bu eşiği MİRAS ALMASIDIR.
//
// ⚠⚠ MEKANİK İZOLASYON — bu profil PRODUCTION'a SIZAMAZ, DÖRT katman:
//   1. Bu dosya `src/__tests__/` altında. `apps/api/tsconfig.build.json`
//      bu dizini TAMAMEN `exclude` eder — `pnpm --filter @arkesoft/api
//      build` dist'e bu dosyadan HİÇBİR satır YAZMAZ (bu turun raporunda
//      `tsc -p tsconfig.build.json --outDir <geçici dizin>` çıktısıyla
//      ÖLÇÜLDÜ: dosya dist'te YOK).
//   2. `apps/api/eslint.config.mjs`'e eklenen `noTestHelpersImportRestriction`
//      deseni — ÜRETİM dosyalarının (`src/prisma/**`, `src/auth/**` ve
//      genel `src/**/*.ts` üretim bloğu; `__tests__` dizini bilerek MUAF)
//      `__tests__/**` altındaki HERHANGİ bir dosyaya import atmasını
//      `pnpm lint`'te KIRMIZI yapar.
//   3. `test-harness-redis-profile-isolation.test.ts` — statik grep
//      taraması, lint'ten BAĞIMSIZ (`qa`'nın `production-write-path-grep.
//      qa.test.ts` deseninin birebir kopyası) — lint yanlışlıkla devre
//      dışı bırakılsa/atlansa bile bu test KIRMIZI olur.
//   4. `create-redis-connection.ts`/`redis.module.ts`/`queue.module.ts`
//      BYTE-EŞİT kalır (bu turun raporunda `git diff` ile kanıtlanan) —
//      `RedisConnectionProfile` union'ı (`'health'|'queue'`) HİÇBİR YENİ
//      DEĞER ALMAZ, `REDIS_CLIENT` provider'ının ÜRETİM fabrikası
//      (`createHealthRedisConnection`) HİÇBİR test profilini SEÇEMEZ.
//      Test harness'ı bu bağlantıyı YALNIZCA `createTestApp()`'in
//      `moduleBuilder.overrideProvider(REDIS_CLIENT)` ÇAĞRISIYLA (Nest'in
//      KENDİ test-only DI override API'si) enjekte eder — PRODUCTION kod
//      yolu (`main.ts` → `AppModule`) `Test.createTestingModule` HİÇ
//      KULLANMAZ, yani bu override'a ERİŞEMEZ.
//
// ⚠ R-A4 AYNEN KORUNUR: `createRedisConnection({ profile: 'health' })`
// ÇAĞRILIR — üretimdekiyle BİREBİR aynı dört seçenek (zorunlu `'error'`
// dinleyicisi, `retryStrategy`, `maxRetriesPerRequest` DAHİL) kurulur ve
// YARATILAN istemcinin `commandTimeout`'u SONRADAN büyütülür.
// `buildRedisConnectionOptions('health')`'in DÖNÜŞ DEĞERİ DEĞİŞMEZ (o
// fonksiyon ve onun pin testi — `redis-connection-profiles.test.ts` — AYNEN
// 1500/2000/1 görür); yalnızca BU dosyanın YARATTIĞI istemcinin ÇALIŞMA
// ZAMANI örneği mutasyona uğrar. Bu mümkündür ÇÜNKÜ `ioredis@6.0.0`
// `commandTimeout`'u HER KOMUTTA `this.options.commandTimeout`'tan DİNAMİK
// okur (ÖLÇÜLDÜ: `ioredis/built/Redis.js:368-369` →
// `command.setTimeout(this.options.commandTimeout)`, HER `sendCommand`
// çağrısında) — yeniden bağlanmaya veya ikinci bir istemciye GEREK YOK, ve
// `options` alanı `ioredis`'in KENDİ tip tanımında `readonly` DEĞİL
// (`Redis.d.ts:49`: `options: RedisOptions;`).
//
// `connectTimeout` BİLEREK DEĞİŞTİRİLMEDİ ('health'in 2000ms'si kalır) — bu
// turun ölçtüğü flake'ler KOMUT (`sendCommand`) seviyesindeydi, İLK TCP
// bağlantısı seviyesinde DEĞİL (zaten kurulu, yerel, canlı bir Redis'e).
// Değişim yüzeyi KASITLI OLARAK tek alana (commandTimeout) DAR tutuldu.

import { createRedisConnection } from '../../redis/create-redis-connection.js'
import type { RedisConnectionLogger } from '../../redis/create-redis-connection.js'
import type { Redis } from 'ioredis'

/**
 * ÖLÇÜME DAYALI DEĞER (bu turun raporu, KARARLAR bölümü) — sentetik yük
 * altında (bkz. dosya başı yorumu) bağımsız bir prob bağlantısı (production
 * 'health' profiliyle BİREBİR aynı seçenekler) tekli komutların TUTARLI
 * OLARAK ~2000–2142ms sürdüğünü, eşzamanlı İKİ yük üreticisi çakıştığında
 * (deliberately aşırı, gerçekçi tekil senaryodan daha ağır) bir ANLIK
 * 11282ms tepe gördüğünü ölçtü. `4000`:
 *   (a) tutarlı ~2000-2142ms olayının ÜSTÜNDE ~1.9× pay bırakır,
 *   (b) Vitest'in DOKUNULMAYAN 5000ms `testTimeout`'unun 1000ms ALTINDA
 *       kalır — tek bir yavaş komut testin KENDİ zaman aşımına
 *       ÇARPMADAN, BİZİM `RateLimitStoreUnavailableError`/"Command timed
 *       out" imzamızla (daha BİLGİLENDİRİCİ) başarısız olur,
 *   (c) SONSUZ DEĞİL — sürekli ÇOK AĞIR tıkanıklıkta (çift yük üreticisi
 *       tepesi gibi) test HÂLÂ başarısız olur, asılı KALMAZ (CLAUDE.md §10
 *       madde 6'nın ruhu: eşik GEVŞETİLMEDİ, yalnızca test harness'ının
 *       YANLIŞ MİRAS ALDIĞI üretim eşiği düzeltildi).
 */
export const TEST_HARNESS_REDIS_COMMAND_TIMEOUT_MS = 4000

/**
 * Test harness'ının Redis bağlantısı. `createTestApp()` İÇİNDE
 * `REDIS_CLIENT` provider'ını override etmek için kullanılır (bkz. dosya
 * başı yorumu, izolasyon katman 4).
 */
export function createTestHarnessRedisConnection(
  url: string,
  logger: RedisConnectionLogger,
): Redis {
  const client = createRedisConnection({ url, profile: 'health', logger })

  // ⚠ Dosya başı yorumu: ioredis `commandTimeout`'u HER KOMUTTA DİNAMİK
  // okur — bu atama GEÇMİŞE etki ETMEZ (istemci bu fonksiyonun İÇİNDE,
  // henüz hiçbir komut göndermeden YARATILIR, bekleyen bir komut YOKTUR),
  // SONRAKİ her komuta uygulanır.
  client.options.commandTimeout = TEST_HARNESS_REDIS_COMMAND_TIMEOUT_MS

  return client
}
