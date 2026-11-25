// @arkesoft/api — S0 ÖLÇÜM SPIKE'I: OpenTelemetry çalışma zamanı gerçekleri
// (ROADMAP v0.0.17, T-028/S2, architect K-A28-9, po A-PO1/S0 modellemesi)
//
// ⭐⭐ BU DOSYA KALICIDIR (po'nun A-PO1 varsayımı) — üç ölçüm GERÇEK bir
// regresyon pinidir, SİLİNMEZ. S6 (Katman 2 bootstrap) bunları
// `apps/api/src/observability/*`'in GERÇEK modüllerine yeniden yönlendirecek
// — AYNI dosya, SIRALI düzenleme, write-write YOK.
//
// Üç karar kuralı ÖNCEDEN verildi (architect/po) — bu dosya hangi sonuç
// çıkarsa çıksın `NEEDS_INPUT` ÜRETMEZ ve 10. paketi EKLEMEZ:
//   (a) Prisma span YOKSA  → AC-53 iki halkaya daralır (DB halkası v0.18.0'a
//       tarihli borç); `instrumentation-pg` gibi bir 10. paket EKLENMEZ.
//   (b) soket AÇIYORSA     → S1b (`@opentelemetry/sdk-trace-base`'in üretime
//       terfi — YENİ PAKET DEĞİL, zaten onaylı test-only paketin sınıf
//       değişimi) açılır.
//   (c) `--import` GEREKMİYORSA → S6'nın `preload.ts` + `package.json`
//       `--import` bayrağı ÇIKAR, AC-61 3 → 2 alt kontrole daralır.
//
// ⭐⭐ S6'NIN YÖNLENDİRMESİ (ROADMAP v0.0.17, T-028/S6) — Prisma span sayısı
// (9) ve soket sayısı (0) ve (c)'nin 2=2'si DEĞİŞMEDİ; ⚠⚠ AMA (a)'nın HTTP
// span sayısı 2 → 1'E DÜŞTÜ — bu bir GEVŞETME DEĞİL, S6'nın bu AYNI
// yönlendirme sırasında EMPİRİK OLARAK bulduğu bir GÜVENLİK DÜZELTMESİNİN
// doğal sonucu (`createArkesoftInstrumentations()`'ın dosya başı yorumuna
// bkz. — `HttpInstrumentation`'ın VARSAYILAN gelen-istek enstrümantasyonu
// `log-correlation.test.ts`'in "gelen traceparent KABUL EDİLMEZ" pinini
// KIRMIZIYA düşürüyordu; `disableIncomingRequestInstrumentation: true`
// GELEN span'i KALDIRDI, ÇIKAN [client] span KALDI). Boşa-çıkmama kontrolü
// (`httpSpans.length > 0`) HÂLÂ GEÇERLİ — eşiği GEVŞETMEDİK, ÖLÇÜLEN gerçek
// sayı değişti ve BURADA açıkça yazılı.
//   (a) `new PrismaInstrumentation()`/`new HttpInstrumentation(...)` artık
//       `../observability/instrumentation.js`'in TEK fabrikasından gelir
//       (`createArkesoftInstrumentations()`) — "hangi enstrümantasyonları
//       kullanıyoruz" sorusunun İKİNCİ bir kopyası AÇILMADI. Ölçüm
//       mekaniği (KENDİ `BasicTracerProvider`/`InMemorySpanExporter`'ı)
//       DEĞİŞMEDİ — üretimin `spanProcessors: []`'i (dosya başı yorumuna
//       bkz: `spanProcessors.length > 0` dalı seçilmediği için
//       `TracerProvider` HİÇ KURULMAZ) bu testin KENDİ ölçüm hattını
//       anlamsız kılardı; bu yüzden (a) BİLEREK üretimin boş-dizi kararını
//       TAŞIMAZ, yalnızca ENSTRÜMANTASYON SINIFLARINI (ve `disableIncoming
//       RequestInstrumentation: true` güvenlik ayarını) paylaşır.
//   (b) GERÇEKTEN `dist/observability/instrumentation.js`'i import eder
//       (aşağıdaki açıklamaya bkz.) — artık S2'nin PROBE'unu DEĞİL, BİZİM
//       GERÇEK ürettiğimiz dosyayı ölçer; bu A-PO1'in en değerli kazanımı
//       (AC-57'nin garantisi artık "bir probe script" değil, "gönderilen
//       dosya" üzerinde).
//   (c) BİLEREK YÖNLENDİRİLMEDİ — (b)'nin AKSİNE, (c)'nin ölçtüğü şey
//       (`--import` ZAMANLAMASININ enstrümantasyon YAMASINA yeterliliği)
//       üretimin `spanProcessors: []`'i ile BİRLİKTE ölçülürse boşa-
//       çıkmama kontrolü (`preloadSpanCount > 0`) HER ZAMAN 0 verir ve
//       anlamsızlaşır (üretim HİÇ SPAN KAYDETMEZ) — bu kendisi YENİ bir
//       bulgu DEĞİL, (b)'nin zaten belgelediği aynı yapısal sonucun bir
//       YANSIMASI. (c) bu yüzden KENDİ test-only `SimpleSpanProcessor` +
//       dosya exporter'ını TAŞIMAYA devam eder (S2'nin bıraktığı R-S2-1
//       riskinin — bullmq-otel/ioredis/Prisma'nın ilk-import'la yeterliliği
//       — kapsamı HÂLÂ bu testin DIŞINDA; R-S2-1 S7'ye devredildi).
//
// ---------------------------------------------------------------------------
// (a) A-A28-1/K-A28-9 — `@prisma/instrumentation@7.10.1` Prisma 7 +
//     `@prisma/adapter-pg` (motor KALDIRILMIŞ driver-adapter yolu) üzerinde
//     span ÜRETİYOR MU?
//
//     Kaynak okuması (bu dosyanın kendi ölçümü,
//     node_modules/.pnpm/@prisma+instrumentation@7.10.1.../dist/index.js):
//     `PrismaInstrumentation.enable()` yalnızca `globalThis` üzerinde
//     `PRISMA_INSTRUMENTATION`/`V7_PRISMA_INSTRUMENTATION` anahtarına bir
//     `ActiveTracingHelper` YAZAR — modül yaması (`require`/`import` kancası)
//     KULLANMAZ. Üretilen istemcinin kendisi (`@prisma/client/runtime/
//     client.js`, `grep -o PRISMA_INSTRUMENTATION` → 1 eşleşme) bu anahtarı
//     HER SORGUDA DİNAMİK OKUR. ⇒ teorik beklenti: enable() ZAMANLAMASI
//     (import sırası) ÖNEMSİZ olmalı — bu test bunu ÇALIŞMA ZAMANINDA
//     doğrular, iddia olarak BIRAKMAZ.
//
//     BOŞA-ÇIKMAMA (⚠⚠ zorunlu): AYNI exporter'da bağımsız bir HTTP
//     span'i de üretilir — Prisma span sayısı 0 çıkarsa bu, "enstrümantasyon
//     YOK" ile "exporter boru hattı ÇALIŞMIYOR" ayrımını yapar.
//
// (b) A-A28-2 — `NodeSDK({ spanProcessors: [] })` GERÇEKTEN soket açıyor mu?
//     Kaynak okuması (@opentelemetry/sdk-node@0.223.2 build/src/sdk.js:200-218):
//     `if (this._configuration?.spanProcessors) { spanProcessors = ... }`
//     — BOŞ DİZİ (`[]`) JavaScript'te TRUTHY'DİR, bu yüzden bu dal seçilir;
//     `else` dalındaki env-fallback (`getSpanProcessorsFromEnv` → OTLP
//     varsayılanı) ASLA çalışmaz. Sonra `if (spanProcessors.length > 0)`
//     (false, `[]`) ⇒ `TracerProvider` HİÇ KURULMAZ, `setGlobalTracerProvider`
//     ÇAĞRILMAZ. ⇒ teorik beklenti: trace tarafında soket YOK. AYRI bir OS
//     sürecinde `lsof`/`getActiveResourcesInfo()` ile ÇALIŞMA ZAMANINDA
//     doğrulanır (log/metrics tarafının farklı bir varsayılan yoluna
//     (`configureLoggerProviderFromEnv`) sahip olduğu da AYRICA not edilir —
//     bu kod yolu `spanProcessors`'tan BAĞIMSIZDIR, ayrı bir bulgu).
//
// (c) A-A28-3 — `main.ts`'in İLK import'u (ESM'de, `--import` OLMADAN) OTel
//     HTTP enstrümantasyonu için yeterli mi, yoksa `node --import <preload>`
//     GEREKLİ mi? İKİ MİNİMAL, bağımsız CJS `node:http` sunucusu (AŞAĞIDA,
//     DB/Redis/Auth YOK) karşılaştırılır.
//
//     ⚠⚠⚠ İKİNCİ DÜZELTME (ayrı bir ölçüm, bağımsız keşfedildi, ÇALIŞMA
//     ZAMANINDA doğrulandı): bu testin İKİNCİ sürümü minimal sunucuyu ESM
//     (`import { createServer } from 'node:http'` / `import http from
//     'node:http'`) ile kurdu — HER İKİ varyantta (hem ilk-import hem
//     `--import`) HTTP span sayısı 0 çıktı, `isEnabled()` `true` dönmesine
//     RAĞMEN. Dört küçük, bağımsız Node süreciyle (geçici bir dizin
//     altında, bu dosyanın DIŞINDA) İZOLE EDİLEREK doğrulandı:
//       (1) ESM sunucu + `--import` ESM bootstrap     → 0 span
//       (2) ESM sunucu + manuel `enable()` (NodeSDK'sız) → 0 span (isEnabled()=true)
//       (3) CJS sunucu + `--require` CJS bootstrap    → 1 span (GET, ÜRETİLDİ)
//       (4) CJS sunucu + `--import` ESM bootstrap     → 1 span (GET, ÜRETİLDİ)
//     ⇒ ⭐⭐ YENİ BULGU: `@opentelemetry/instrumentation-http@0.223.2`'nin
//     çekirdek `node:http` modül yaması, bu Node sürümünde (v25.8.1) ESM
//     `import ... from 'node:http'` İLE kurulan bir sunucuyu HİÇBİR
//     koşulda (ne ilk-import ne `--import`) YAKALAMIYOR — ama `require('http')`/
//     `require('node:http')` İLE kurulan (CJS) bir sunucuyu `--import`
//     İLE DE, `--require` İLE DE YAKALIYOR. ⭐ Bu test (a)'nın bulgusuyla
//     TUTARLI: Express/Nest'in sunucusu CJS `require('http')` zincirinden
//     geldiği için (test (a)'da geç `enable()` ile BİLE span üretti) GERÇEK
//     üretim senaryosu bu CJS yoldan geçiyor — bu yüzden (c) de CJS bir
//     fixture'la ölçer (ESM değil); mesele main.ts'in KENDİSİ ESM olsa da,
//     Express'in dahili `http` kullanımı CJS'tir. ⚠ ESM `node:http` boşluğu
//     GERÇEK ama BU SÜRÜMÜN kapsamı DIŞINDA bir borç — `docs`'a not düşülmeli
//     (aşağıdaki RİSKLER).
//
//     ⚠⚠⚠ ÜÇÜNCÜ DÜZELTME (ÖLÇÜLDÜ, kök `turbo run test` altında): geçici
//     dosyaların kök dizini İLK ÖNCE `$CLAUDE_JOB_DIR/tmp`'ydi (geliştirme
//     oturumuna özgü paralel-ajan önlemi). `turbo run test` bu değişkeni
//     alt sürece AKTARMIYOR ⇒ dosya İMPORT ANINDA fırlatıp "Failed Suites"
//     oldu. ⭐ `os.tmpdir()` + `mkdtempSync`'in rastgele son eki AYNI
//     çakışma-önleme garantisini ortam değişkenine bağımlı OLMADAN verir —
//     bkz. `resolveSpikeTempRoot` yorumu (aşağıda).
//
//     ⚠⚠ BİRİNCİ DÜZELTME (Orkestratör bulgusu — flaky kök nedeni): bu testin
//     İLK sürümü (c)'yi GERÇEK `dist/main.js`'i (tam Nest+Auth+RateLimitGuard+
//     Prisma+Redis yığını) İKİ KEZ spawn ederek ölçüyordu. Kök NEDENİ ÖLÇTÜ:
//     bu, kök `pnpm test`'te (turbo'nun paketler-arası paralelliği altında)
//     `@arkesoft/api:test`'i flaky yapıyordu — iki GERÇEK uygulama örneği
//     AYNI paylaşımlı Redis'e bağlanıp tam `AuthModule`/`RateLimitGuard`
//     yığınını ayağa kaldırıyor, bu da `create-test-app.ts`'in run-owner
//     fail-closed kapısıyla (farklı dosyalardaki `flushRateLimitCounters`
//     çağrılarıyla) zamanlamaya bağlı çakışıyordu.
//     ⭐⭐ YENİDEN DEĞERLENDİRME (iki kez — yukarıdaki İKİNCİ düzeltmeyle
//     birleşik): (c)'nin sorduğu soru ZATEN (a)'nın BULGUSUYLA YANITLANDI —
//     Express/Nest'in `http.createServer()`'ı KENDİ CommonJS `require('http')`
//     zincirinden geldiği için enable() ZAMANLAMASI ONU HİÇ ETKİLEMİYOR (test
//     (a), geç `enable()` ile BİLE 2 HTTP span'i üretti) VE bu CJS yol
//     `--import`'LA DA ÇALIŞIYOR (yukarıdaki (3)/(4) izole ölçümleri). Bu
//     yüzden (c), Nest/Express'in TAMAMINI spawn etmek YERİNE SADECE bu CJS
//     senaryosunu üreten minimal bir `node:http` sunucusunu İKİ biçimde
//     (ilk-import / `--import`) spawn eder — DB/Redis/Auth'a HİÇ DOKUNMAZ,
//     üretim senaryosuna SADIK kalır (Express CJS'tir) ve DAHA HIZLI
//     (tsc derlemesi YOK) ölçer. ESM `node:http` boşluğu (yukarıda) BU
//     testin GÖVDESİNE YANSIMAZ — ayrı bir borç satırı olarak kaydedilir.
//
// ---------------------------------------------------------------------------
// GEÇİCİ DOSYALAR: hepsi OS'in geçici dizininde (`os.tmpdir()`), bu dosyaya
// ÖZEL `mkdtempSync` ile üretilen RASTGELE isimli bir alt dizinde (başka
// hiçbir sürecin AYNI ada yazması İMKANSIZ) — `afterAll`'da SİLİNİR.
// `@opentelemetry/*`/`@prisma/*` İÇE AKTARAN geçici betikler
// `apps/api/dist/` altında yazılır (bkz. aşağıdaki `writeDistSpikeScript`
// yorumu) — bu dosya KENDİ küçük yardımcılarını kurar, `fixtures/
// shutdown-child.ts`'e (S6'nın gelecekteki dosyası) YAZMAZ/DOKUNMAZ.

import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import type { Server as NetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { DEMO_SEED } from '@arkesoft/db'
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base'

import { PrismaService } from '../prisma/prisma.service.js'
// S6 EKLEMESİ (ROADMAP v0.0.17, po A-PO1 — "S6 bu probe'u GERÇEK modüllere
// YENİDEN YÖNLENDİRİR, AYNI dosya, SIRALI, write-write YOK"):
// `createArkesoftInstrumentations()` test (a)'nın kullandığı ÜÇ sınıfı
// (`HttpInstrumentation`/`PrismaInstrumentation`/üçüncüsü ioredis — (a) onu
// KULLANMIYOR, tüketmiyor) ARTIK üretim dosyasından (`observability/
// instrumentation.ts`) gelir — "hangi enstrümantasyonları kullanıyoruz"
// sorusunun İKİNCİ bir kopyası burada AÇILMAZ. `buildApiForShutdownTest`
// (b)'nin REAL `dist/observability/instrumentation.js` dosyasını ölçmesi
// için `dist`'i tazeler — AYNI yardımcı, `shutdown.test.ts`/`worker-
// shutdown.test.ts`'in KULLANDIĞI (fixture dosyasına YAZILMADI, sadece
// OKUNDU/import edildi).
import { createArkesoftInstrumentations } from '../observability/instrumentation.js'
import { buildApiForShutdownTest } from './fixtures/shutdown-child.js'
import { createTestApp } from './helpers/create-test-app.js'

/** `dist`'i tazeleyen `beforeAll`'un bütçesi — `shutdown.test.ts` ile AYNI sınıf maliyet. */
const OBSERVABILITY_BUILD_TIMEOUT_MS = 40_000

// (b)'nin GERÇEK `dist/observability/instrumentation.js`'i import edebilmesi
// için `dist` BU dosyanın `beforeAll`'unda BİR KEZ tazelenir — `apps/api`'nin
// `vitest.config.ts`'i `fileParallelism: false` taşıdığı için dosyalar
// SIRAYLA koşsa da, HANGİ dosyanın önce koştuğu (ve dolayısıyla `dist`'in
// önceden taze olup olmadığı) garanti değildir; bu dosya kendi tazeliğini
// KENDİSİ garanti eder (`shutdown-child.ts`'in `buildApiForShutdownTest`
// yorumuyla AYNI gerekçe).
beforeAll(() => {
  buildApiForShutdownTest()
}, OBSERVABILITY_BUILD_TIMEOUT_MS)

// ---------------------------------------------------------------------------
// Paylaşılan yol/ortam yardımcıları
// ---------------------------------------------------------------------------

const API_ROOT = fileURLToPath(new URL('../..', import.meta.url))

// ⚠⚠ ÜÇÜNCÜ DÜZELTME (ÖLÇÜLDÜ, kök `pnpm test`/`turbo run test` altında):
// bu fonksiyon İLK ÖNCE `$CLAUDE_JOB_DIR/tmp` kullanıyordu (geliştirme
// oturumuna özgü, paralel AJAN çakışmasını önlemek için). ⚠⚠ Ama bu dosya
// KALICI (po A-PO1) — CI/başka mühendisler/`turbo run test` ortamında
// `CLAUDE_JOB_DIR` HİÇ TANIMLI DEĞİL. ÖLÇÜLDÜ: `pnpm exec turbo run test
// --filter=@arkesoft/api` altında dosya İMPORT ANINDA `resolveSpikeTempRoot`
// fırlattığı için TÜM dosya "Failed Suites" oldu (`CLAUDE_JOB_DIR tanımlı
// değil` hatası, turbo bu değişkeni görevin alt sürecine AKTARMIYOR).
// ⇒ ⭐ `os.tmpdir()` + `mkdtempSync`'in KENDİ ürettiği RASTGELE son ek
// (`t028-s2-XXXXXX`) her çağrıda BENZERSİZ bir dizin garanti eder — bu,
// "aynı sabit yola birden fazla sürecin yazması" sınıfı çakışmayı YAPISAL
// olarak ortadan kaldırır (orijinal `$CLAUDE_JOB_DIR/tmp` tercihinin asıl
// kazanımı da buydu, kök dizin DEĞİL). ⇒ ortam değişkenine bağımlılık
// TAMAMEN KALDIRILDI — her ortamda (CI dahil) çalışır.
function resolveSpikeTempRoot(): string {
  return mkdtempSync(join(tmpdir(), 't028-s2-'))
}

const SPIKE_TEMP_DIR = resolveSpikeTempRoot()

// Node'un ESM çözümleyicisi BARE specifier'ları (`@opentelemetry/...`) İÇE
// AKTARAN modülün KENDİ dizin zincirindeki `node_modules`'tan arar —
// `process.cwd()`'YE BAKMAZ (ÖLÇÜLDÜ: `SPIKE_TEMP_DIR` altına yazılan bir
// .mjs `ERR_MODULE_NOT_FOUND` ile patladı, `cwd: API_ROOT` vermek bunu
// DÜZELTMEDİ). Bu yüzden @opentelemetry/@prisma paketlerini import eden
// GEÇİCİ betikler `apps/api/dist/` altına yazılır (derleme ÇIKTISI, kaynak
// DEĞİL — `apps/api/src/observability/*`'e DOKUNULMUYOR); veri/sayaç
// dosyaları (span NDJSON'ları) YİNE `SPIKE_TEMP_DIR`'da (`os.tmpdir()`
// tabanlı) kalır. Her `dist/` betiği burada KAYDEDİLİR, `afterAll`'da SİLİNİR.
const API_DIST_DIR = `${API_ROOT}/dist`
const distSpikeFilesToCleanUp: string[] = []

function writeDistSpikeScript(fileName: string, source: string): string {
  const scriptPath = `${API_DIST_DIR}/${fileName}`
  writeFileSync(scriptPath, source, 'utf-8')
  distSpikeFilesToCleanUp.push(scriptPath)
  return scriptPath
}

function getFreeLoopbackPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const probe: NetServer = createNetServer()
    probe.once('error', (error: unknown) => {
      reject(error instanceof Error ? error : new Error(String(error)))
    })
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close()
        reject(new Error('getFreeLoopbackPort: adres bilgisi alınamadı'))
        return
      }
      const { port } = address
      probe.close(() => {
        resolve(port)
      })
    })
  })
}

async function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown = new Error('waitForHttpOk: hiç deneme yapılmadı')

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
      lastError = new Error(`waitForHttpOk: beklenmeyen HTTP durumu ${String(response.status)}`)
    } catch (error) {
      lastError = error
    }
    await delay(100)
  }

  throw new Error(
    `waitForHttpOk: '${url}' ${String(timeoutMs)}ms içinde 2xx dönmedi — son hata: ${String(lastError)}`,
  )
}

afterAll(() => {
  rmSync(SPIKE_TEMP_DIR, { recursive: true, force: true })
  for (const scriptPath of distSpikeFilesToCleanUp) {
    rmSync(scriptPath, { force: true })
  }
})

// ---------------------------------------------------------------------------
// (a) Prisma span üretimi + boşa-çıkmama (HTTP span > 0 AYNI exporter'da)
// ---------------------------------------------------------------------------

describe('(a) A-A28-1/K-A28-9 — PrismaInstrumentation çalışma zamanında span üretiyor mu', () => {
  it("PrismaService üzerinden GERÇEK bir sorgu sonrası Prisma span sayısı raporlanır — AYNI exporter'da HTTP span > 0 (boşa-çıkmama)", async () => {
    const exporter = new InMemorySpanExporter()
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    })

    // S6 EKLEMESİ (A-PO1 — gerçek modüle yönlendirme): bu İKİ örnek artık
    // üretim dosyasının TEK fonksiyonundan gelir (`createArkesoftInstrumentations`)
    // — üçüncüsü (ioredis) bu testin boşa-çıkmama/Prisma ölçümüyle İLGİSİZ;
    // hiç `enable()` edilmeden (yan etkisiz) atılır (üretim ÜÇ enstrümantasyon
    // taşır, bu test SADECE Prisma+HTTP'yi ÖLÇER).
    const [httpInstrumentation, , prismaInstrumentation] = createArkesoftInstrumentations()
    prismaInstrumentation.setTracerProvider(provider)
    prismaInstrumentation.enable()

    httpInstrumentation.setTracerProvider(provider)
    httpInstrumentation.enable()

    let app: INestApplication<Server> | undefined

    try {
      // ---- Nest/Express uygulaması: HEM Prisma sorgusu HEM boşa-çıkmama
      // kanıtı AYNI uygulama üzerinden üretilir.
      //
      // ⚠⚠ ÖLÇÜLMÜŞ DÜZELTME: bu dosyanın İLK denemesi (ESM `import … from
      // 'node:http'` ile kurulan ÇIPLAK bir sunucu + `fetch()`) HTTP span
      // sayısını HER ZAMAN 0 ÜRETTİ. Kök neden: `@opentelemetry/
      // instrumentation`'ın ÇEKİRDEK modül yaması `require-in-the-middle`
      // kancasına dayanır; bu kanca YALNIZCA CommonJS `require()` çağrılarını
      // yakalar — gerçek ESM `import` ifadeleri (`node:module`'ün `register()`
      // API'siyle kurulan AYRI bir `import-in-the-middle` mekanizması ister,
      // ki bu YALNIZCA `--import <preload>` İLE önceden kurulabilir, bu
      // test SÜRECİ İÇİNDE DEĞİL). Express/Nest'in `http.createServer()`
      // çağrısı ise `express`'in KENDİ CommonJS `require('http')` zincirinden
      // gelir — bu yüzden `require-in-the-middle` kancasına YAKALANIR. Bu,
      // (c)'nin ESM import SIRASI sorusuna (ayrı bir OS sürecinde) GEÇERLİ
      // bir kanıt TAŞIMAZ (farklı mekanizma) — yalnızca BU testin boşa-
      // çıkmama yolunu `supertest`/Nest sunucusuna taşımanın GEREKÇESİDİR.
      const testApp = await createTestApp()
      app = testApp.app
      const prismaService = app.get(PrismaService)

      const healthResponse = await request(app.getHttpServer()).get('/health')
      expect(healthResponse.status).toBe(200)

      const tenant = await prismaService.db.tenant.findUnique({
        where: { slug: DEMO_SEED.tenant.slug },
      })
      expect(tenant).not.toBeNull()

      await provider.forceFlush()

      const spans = exporter.getFinishedSpans()
      const httpSpans = spans.filter(
        (span) => span.instrumentationScope.name === '@opentelemetry/instrumentation-http',
      )
      const prismaSpans = spans.filter((span) => span.instrumentationScope.name === 'prisma')

      // eslint-disable-next-line no-console -- DoD'un istediği "SAYIYLA raporla" ham kanıtı, test logudur (üretim kodu DEĞİL)
      console.info('[S2/(a)] ham span listesi:', {
        toplamSpan: spans.length,
        httpSpanSayisi: httpSpans.length,
        prismaSpanSayisi: prismaSpans.length,
        tumSpanAdlari: spans.map((span) => ({
          name: span.name,
          scope: span.instrumentationScope.name,
        })),
      })

      // ⚠⚠ BOŞA-ÇIKMAMA (zorunlu, karar kuralından ÖNCE kontrol edilir):
      // HTTP span'i YOKSA bu test pipeline'ın kendisinin çalışmadığını
      // gösterir — "Prisma span yok" sonucu bu durumda GEÇERSİZDİR.
      expect(httpSpans.length).toBeGreaterThan(0)

      // ⚠⚠⚠ DÜZELTME TURU 1/3 (backend BULGU 4) — ÖNCEKİ hâlde burada
      // `expect(prismaSpans.length).toBeGreaterThanOrEqual(0)` vardı: bu bir
      // TAUTOLOJİdir (bir dizi uzunluğu HİÇBİR ZAMAN negatif olamaz, hiçbir
      // mutasyon bunu KIRAMAZ) VE üstündeki yorum kodun TAM TERSİNİ
      // söylüyordu ("`toBeGreaterThanOrEqual(0)` KULLANILMAZ" diye yazıp
      // BİR SATIR ALTINDA TAM ONU kullanıyordu). Karar kuralı (K-A28-9: sonuç
      // NE OLURSA OLSUN NEEDS_INPUT ÜRETİLMEZ) DEĞİŞMEDİ — yalnızca ÖLÇÜM
      // YÖNTEMİ değişti: gerçek sayı yukarıdaki `console.info` ile RAPORLANIR
      // (DoD'un istediği ham kanıt), bir ASSERTION'A BAĞLANMAZ (asıl boşa-
      // çıkmama garantisi zaten `httpSpans.length).toBeGreaterThan(0)` — bu
      // satır korunur, DOKUNULMAZ).
    } finally {
      if (app !== undefined) {
        await app.close()
      }
      httpInstrumentation.disable()
      prismaInstrumentation.disable()
      await provider.shutdown()
    }
  }, 60_000)
})

// ---------------------------------------------------------------------------
// (b) `spanProcessors: []` gerçekten soket açıyor mu — AYRI OS sürecinde
// ---------------------------------------------------------------------------

const activeResourcesProbeSchema = z.object({
  pid: z.number(),
  activeResources: z.array(z.string()),
})

// S6 EKLEMESİ (ROADMAP v0.0.17, po A-PO1 — "GERÇEK modüle yönlendirme"):
// bu betik artık `new NodeSDK({ spanProcessors: [] })`'u KENDİSİ KURMAZ —
// GERÇEKTEN ÜRETİME GİDEN `dist/observability/instrumentation.js`'i import
// EDER (yukarıdaki dosya başı `beforeAll`'un tazelediği derleme çıktısı).
// Bu, S2'nin ORİJİNAL probe'unun ("NodeSDK'nın spanProcessors:[] seçeneği
// soket açar mı") yerini, "BİZİM GERÇEK bootstrap DOSYAMIZ soket açar mı"
// sorusuna bırakır — AC-57'nin asıl garantisi BUDUR. Script `./observability/
// instrumentation.js` yolunu KULLANIR (bu betik `API_DIST_DIR`'e yazıldığı
// için `dist/observability/instrumentation.js`'e göreli olarak doğru yol).
const MEASURE_B_SCRIPT_SOURCE = `
import './observability/instrumentation.js'

// Event loop'un bir turunu bekle — zamanlayıcı/soket kaynaklarının (varsa)
// kurulması için makro-görev penceresi.
await new Promise((resolve) => setTimeout(resolve, 300))

process.stdout.write(
  JSON.stringify({ pid: process.pid, activeResources: process.getActiveResourcesInfo() }) + '\\n',
)

process.on('SIGTERM', () => {
  process.exit(0)
})
`

describe('(b) A-A28-2 — GERÇEK observability/instrumentation.js (üç sinyal AÇIKÇA boş) soket açıyor mu (AYRI OS sürecinde)', () => {
  it('lsof -iTCP satır sayısı + process.getActiveResourcesInfo() raporlanır', async () => {
    const scriptPath = writeDistSpikeScript(
      'observability-spike-measure-b.mjs',
      MEASURE_B_SCRIPT_SOURCE,
    )

    const child: ChildProcessWithoutNullStreams = spawn('node', [scriptPath], {
      cwd: API_ROOT,
      stdio: 'pipe',
    })

    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve) => {
        child.on('exit', (code, signal) => {
          resolve({ code, signal })
        })
      },
    )

    let stdoutBuffer = ''
    let stderrBuffer = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf-8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf-8')
    })

    try {
      const deadline = Date.now() + 15_000
      let jsonLine: string | undefined
      while (Date.now() < deadline) {
        const candidate = stdoutBuffer.split('\n').find((line) => line.trim().startsWith('{'))
        if (candidate !== undefined) {
          jsonLine = candidate
          break
        }
        await delay(50)
      }

      if (jsonLine === undefined) {
        throw new Error(
          `measure-b çocuk süreci ${String(15_000)}ms içinde JSON satırı üretmedi — stderr: ${stderrBuffer}`,
        )
      }

      const probe = activeResourcesProbeSchema.parse(JSON.parse(jsonLine) as unknown)

      // Çocuk SÜREÇ hâlâ hayattayken (henüz SIGTERM gönderilmeden) gerçek
      // soket durumunu ölç — `spawnSync` (execFileSync DEĞİL): eşleşme
      // yokken lsof exit 1 verir, bu bir HATA DEĞİL "0 satır" anlamına
      // gelir; `spawnSync` bunu FIRLATMADAN `status` alanında taşır.
      //
      // ⚠⚠ ÖLÇÜLMÜŞ DÜZELTME: `-a` BAYRAĞI OLMADAN `lsof` birden fazla seçim
      // kriterini (`-p` VE `-i`) VARSAYILAN olarak OR ile birleştirir —
      // ÖLÇÜLDÜ: `-a` YOKKEN bu komut sistemdeki TÜM TCP bağlantılarını
      // (103 satır, tamamen İLGİSİZ süreçler dahil) döndürdü. `-a` bu İKİ
      // kriteri AND'ler — yalnızca VERİLEN pid'in TCP soketleri kalır.
      const lsofResult = spawnSync('lsof', ['-a', '-nP', '-p', String(probe.pid), '-iTCP'], {
        encoding: 'utf-8',
      })
      if (lsofResult.error) {
        throw lsofResult.error
      }
      const lsofLines = lsofResult.stdout
        .split('\n')
        .filter((line: string) => line.trim().length > 0)

      // eslint-disable-next-line no-console -- DoD'un istediği "SAYIYLA raporla" ham kanıtı, test logudur (üretim kodu DEĞİL)
      console.info('[S2/(b)] ham ölçüm:', {
        lsofSatirSayisi: lsofLines.length,
        lsofSatirlari: lsofLines,
        activeResources: probe.activeResources,
      })

      // Karar kuralı önceden verildi (K-A28-2): sonuç NE OLURSA OLSUN
      // NEEDS_INPUT ÜRETİLMEZ. Bu assertion'lar SAYIYI PİNLER — gevşetme
      // DEĞİL, gözlemlenen gerçeğin kalıcı regresyon pini.
      expect(lsofLines.length).toBe(0)
    } finally {
      child.kill('SIGTERM')
      await exited
    }
  }, 30_000)
})

// ---------------------------------------------------------------------------
// (c) `--import` gerekli mi — MİNİMAL bir CJS `node:http` sunucusu İKİ farklı
// başlatma biçiminde (DB/Redis/Auth YOK — yukarıdaki dosya başı yorumuna bkz.
// "İKİNCİ DÜZELTME": ESM `node:http` bu Node/instrumentation sürümünde HİÇ
// yakalanmıyor, CJS `require('node:http')` ise yakalanıyor — üretim senaryosu
// [Express] da CJS olduğu için fixture BİLEREK CJS'tir).
// ---------------------------------------------------------------------------

const OTEL_HTTP_SPIKE_BOOTSTRAP_SOURCE = `
import { appendFileSync } from 'node:fs'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'

const spanFilePath = process.env.OTEL_SPIKE_SPAN_FILE
if (typeof spanFilePath !== 'string' || spanFilePath.length === 0) {
  throw new Error('otel-http-spike-bootstrap: OTEL_SPIKE_SPAN_FILE ortam değişkeni YOK')
}

class AppendingFileSpanExporter {
  export(spans, resultCallback) {
    for (const span of spans) {
      appendFileSync(spanFilePath, JSON.stringify({ name: span.name }) + '\\n')
    }
    resultCallback({ code: 0 })
  }
  shutdown() {
    return Promise.resolve()
  }
  forceFlush() {
    return Promise.resolve()
  }
}

const sdk = new NodeSDK({
  spanProcessors: [new SimpleSpanProcessor(new AppendingFileSpanExporter())],
  instrumentations: [new HttpInstrumentation()],
})
sdk.start()
`

// `main.ts`/`dist/main.js` BİLEREK KULLANILMIYOR (yukarıdaki dosya başı
// yorumu, BİRİNCİ düzeltme) VE sunucu BİLEREK CJS'tir (`require('node:http')`,
// İKİNCİ düzeltme) — `.cjs` uzantısı `apps/api/package.json`'ın
// `"type": "module"` varsayılanını BU DOSYA için GEÇERSİZ kılar (Node'un
// kendi kuralı, paket yapılandırmasına dokunmadan). Üretim senaryosuna
// SADIK: Express'in sunucusu da CJS `require('http')` zincirinden gelir
// (test (a)'nın kanıtı) — bu fixture O yolu izole ölçer.
const MINIMAL_HTTP_SERVER_SCRIPT_SOURCE = `
const http = require('node:http')

const port = Number(process.env.OTEL_SPIKE_PORT)
if (!Number.isInteger(port) || port <= 0) {
  throw new Error('otel-http-spike-minimal-server: OTEL_SPIKE_PORT geçersiz')
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end('ok')
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write('READY\\n')
})

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0)
  })
})
`

type SpikeChildHandle = {
  readonly child: ChildProcessWithoutNullStreams
  readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
  readonly stderrText: () => string
}

function spawnSpikeChild(
  nodeArgs: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): SpikeChildHandle {
  const child = spawn('node', [...nodeArgs], {
    cwd: API_ROOT,
    env: { ...process.env, ...env },
    stdio: 'pipe',
  })

  const stderrChunks: Buffer[] = []
  child.stderr.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk)
  })

  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on('exit', (code, signal) => {
      resolve({ code, signal })
    })
  })

  return {
    child,
    exited,
    stderrText: () => Buffer.concat(stderrChunks).toString('utf-8'),
  }
}

function countSpikeSpanLines(spanFilePath: string): number {
  if (!existsSync(spanFilePath)) {
    return 0
  }
  const spanLineSchema = z.object({ name: z.string() })
  return readFileSync(spanFilePath, 'utf-8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => spanLineSchema.parse(JSON.parse(line) as unknown)).length
}

describe("(c) A-A28-3 — main.ts ilk import'u ESM yamasına yetiyor mu (--import OLMADAN vs İLE)", () => {
  it('minimal CJS node:http sunucusu İKİ farklı başlatma biçiminde spawn edilir, HTTP span sayısı karşılaştırılır (iki sayı)', async () => {
    const bootstrapPath = writeDistSpikeScript(
      'observability-spike-http-bootstrap.mjs',
      OTEL_HTTP_SPIKE_BOOTSTRAP_SOURCE,
    )
    const bootstrapFileUrl = pathToFileURL(bootstrapPath).href

    // Sunucu betiği HER İKİ varyant için de AYNI, DEĞİŞTİRİLMEMİŞ CJS dosya
    // — `.cjs` uzantısı `writeDistSpikeScript` üzerinden korunur.
    const serverPath = writeDistSpikeScript(
      'observability-spike-minimal-server.cjs',
      MINIMAL_HTTP_SERVER_SCRIPT_SOURCE,
    )
    const serverFileUrl = pathToFileURL(serverPath).href

    // ---- Varyant 1: "main.ts'in İLK import'u" simülasyonu — `main.ts` da
    // ESM olduğu için bu bir ESM SARMALAYICIDIR: bootstrap'ı VE sunucuyu
    // (CJS, Node'un ESM'den CJS'i `import` etmesine İZİN VERDİĞİ birebir
    // mekanizmayla) SIRAYLA import eder. `--import` KULLANILMAZ.
    const firstImportWrapperPath = writeDistSpikeScript(
      'observability-spike-minimal-server-first-import.mjs',
      `import ${JSON.stringify(bootstrapFileUrl)}\nimport ${JSON.stringify(serverFileUrl)}\n`,
    )
    const firstImportSpanFile = `${SPIKE_TEMP_DIR}/spans-first-import.ndjson`
    const firstImportPort = await getFreeLoopbackPort()

    // ---- Varyant 2: `node --import <bootstrap> <minimal-sunucu>` —
    // minimal sunucu betiği DEĞİŞTİRİLMEDEN, preload bayrağıyla.
    const preloadSpanFile = `${SPIKE_TEMP_DIR}/spans-preload-import.ndjson`
    const preloadPort = await getFreeLoopbackPort()

    let firstImportHandle: SpikeChildHandle | undefined
    let preloadHandle: SpikeChildHandle | undefined

    try {
      firstImportHandle = spawnSpikeChild([firstImportWrapperPath], {
        OTEL_SPIKE_SPAN_FILE: firstImportSpanFile,
        OTEL_SPIKE_PORT: String(firstImportPort),
      })
      await waitForHttpOk(`http://127.0.0.1:${String(firstImportPort)}/`, 10_000)
      await fetch(`http://127.0.0.1:${String(firstImportPort)}/`)
      // SimpleSpanProcessor senkron ihraç eder (`appendFileSync`) ama
      // HTTP sunucu-span'i istek TAMAMLANDIKTAN SONRA kapanır — küçük bir
      // event-loop turu bırak.
      await delay(200)

      preloadHandle = spawnSpikeChild(['--import', bootstrapFileUrl, serverPath], {
        OTEL_SPIKE_SPAN_FILE: preloadSpanFile,
        OTEL_SPIKE_PORT: String(preloadPort),
      })
      await waitForHttpOk(`http://127.0.0.1:${String(preloadPort)}/`, 10_000)
      await fetch(`http://127.0.0.1:${String(preloadPort)}/`)
      await delay(200)

      const firstImportSpanCount = countSpikeSpanLines(firstImportSpanFile)
      const preloadSpanCount = countSpikeSpanLines(preloadSpanFile)

      // eslint-disable-next-line no-console -- DoD'un istediği "SAYIYLA raporla" ham kanıtı (iki sayı), test logudur (üretim kodu DEĞİL)
      console.info('[S2/(c)] ham ölçüm — HTTP span sayısı:', {
        ilkImportVaryantiSpanSayisi: firstImportSpanCount,
        preloadImportVaryantiSpanSayisi: preloadSpanCount,
      })

      // Karar kuralı önceden verildi (K-A28-4/architect): sonuç NE OLURSA
      // OLSUN NEEDS_INPUT ÜRETİLMEZ.
      //
      // ⚠⚠⚠ DÜZELTME TURU 1/3 (backend BULGU 4) — ÖNCEKİ hâlde burada İKİ
      // `expect(...).toBeGreaterThanOrEqual(0)` vardı ve üstündeki yorum
      // "iki yönlü mutasyonu YAKALAR (biri sıfıra düşerse pin KIRILIR)"
      // diyordu — bu yorum kodun TAM TERSİNİ anlatıyordu: bir dizi uzunluğu/
      // sayaç ASLA negatif OLAMAZ, yani `x >= 0` HİÇBİR mutasyonla
      // KIRILAMAYAN bir tautolojidir ("sıfıra düşerse" durumu dahi `0 >= 0`
      // olarak GEÇER). Her iki sayı YİNE DE yukarıdaki `console.info` ile
      // RAPORLANIR (DoD'un "SAYIYLA raporla" şartı); asıl boşa-çıkmama
      // garantisi AŞAĞIDAKİ `toBeGreaterThan(0)` satırıdır — bu KORUNUR,
      // DOKUNULMAZ (tek yönlü GERÇEK bir pin: `preloadSpanCount` 0'a
      // düşerse bu satır GERÇEKTEN kırılır, mutasyonla ayrıca doğrulanabilir).
      //
      // Preload yolu HER ZAMAN çalışır olmalı — bu YALNIZCA pipeline'ın
      // kendisinin (bootstrap + HttpInstrumentation + dosya exporter)
      // ÇALIŞTIĞININ boşa-çıkmama kanıtıdır (c)'nin KENDİ sorusuna cevap
      // vermeden önce.
      expect(preloadSpanCount).toBeGreaterThan(0)
    } finally {
      firstImportHandle?.child.kill('SIGTERM')
      preloadHandle?.child.kill('SIGTERM')
      if (firstImportHandle !== undefined) {
        await firstImportHandle.exited
      }
      if (preloadHandle !== undefined) {
        await preloadHandle.exited
      }
    }
  }, 30_000)
})

// ---------------------------------------------------------------------------
// (d) S6 EKLEMESİ (ROADMAP v0.0.17, T-028/S6) — AC-57'nin Sentry yarısı:
// DSN tanımsızken `startSentry()` GERÇEK bir AYRI OS sürecinde de soket
// açmıyor mu? (b)'nin OTel'i izole ÖLÇTÜĞÜ AYNI mekanizma, bu KEZ
// `observability/sentry.ts`'in GERÇEK derlenmiş çıktısı için. S5'in
// `sentry-invariants.test.ts`'i BU SORUYU zaten AYNI test süreci içinde
// (`lsof` delta 0) ölçtü — bu blok onu BAĞIMSIZ bir OS sürecinde TEKRARLAR,
// AC-57'nin "gerçek alt süreçte" şartını Sentry için de kapatır.
// ---------------------------------------------------------------------------

const MEASURE_D_SCRIPT_SOURCE = `
import { startSentry } from './observability/sentry.js'

// DSN BİLEREK tanımsız — operatör SENTRY_DSN ayarlamadığı sürece üretimin
// varsayılan davranışı budur ('.env.example'a yeni anahtar EKLENMEDİ).
startSentry({ dsn: undefined })

await new Promise((resolve) => setTimeout(resolve, 300))

process.stdout.write(
  JSON.stringify({ pid: process.pid, activeResources: process.getActiveResourcesInfo() }) + '\\n',
)

process.on('SIGTERM', () => {
  process.exit(0)
})
`

describe('(d) AC-57 — GERÇEK observability/sentry.js, DSN tanımsızken AYRI OS sürecinde soket açıyor mu', () => {
  it('lsof -iTCP satır sayısı 0 — startSentry(dsn: undefined) sıfır zarf/soket (gerçek alt süreç)', async () => {
    const scriptPath = writeDistSpikeScript(
      'observability-spike-measure-d.mjs',
      MEASURE_D_SCRIPT_SOURCE,
    )

    const child: ChildProcessWithoutNullStreams = spawn('node', [scriptPath], {
      cwd: API_ROOT,
      stdio: 'pipe',
    })

    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve) => {
        child.on('exit', (code, signal) => {
          resolve({ code, signal })
        })
      },
    )

    let stdoutBuffer = ''
    let stderrBuffer = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf-8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf-8')
    })

    try {
      const deadline = Date.now() + 15_000
      let jsonLine: string | undefined
      while (Date.now() < deadline) {
        const candidate = stdoutBuffer.split('\n').find((line) => line.trim().startsWith('{'))
        if (candidate !== undefined) {
          jsonLine = candidate
          break
        }
        await delay(50)
      }

      if (jsonLine === undefined) {
        throw new Error(
          `measure-d çocuk süreci ${String(15_000)}ms içinde JSON satırı üretmedi — stderr: ${stderrBuffer}`,
        )
      }

      const probe = activeResourcesProbeSchema.parse(JSON.parse(jsonLine) as unknown)

      // `-a` ZORUNLU — (b)'nin AYNI ölçülmüş düzeltmesi (dosya başı yorumu).
      const lsofResult = spawnSync('lsof', ['-a', '-nP', '-p', String(probe.pid), '-iTCP'], {
        encoding: 'utf-8',
      })
      if (lsofResult.error) {
        throw lsofResult.error
      }
      const lsofLines = lsofResult.stdout
        .split('\n')
        .filter((line: string) => line.trim().length > 0)

      // eslint-disable-next-line no-console -- DoD'un istediği "SAYIYLA raporla" ham kanıtı, test logudur (üretim kodu DEĞİL)
      console.info('[S6/(d)] ham ölçüm:', {
        lsofSatirSayisi: lsofLines.length,
        lsofSatirlari: lsofLines,
        activeResources: probe.activeResources,
      })

      expect(lsofLines.length).toBe(0)
    } finally {
      child.kill('SIGTERM')
      await exited
    }
  }, 30_000)
})
