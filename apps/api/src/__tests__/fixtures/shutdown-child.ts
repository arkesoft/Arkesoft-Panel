// @arkesoft/api — AC11 kapanış testi için çocuk süreç yardımcıları (ROADMAP
// v0.0.4, T-002/ST-7, architect K-A3/K-A8, R-P5)
//
// AC11'in DETERMİNİSTİK ölçümü (K-A8): `?application_name=arkesoft-api-ac11`
// EKLİ bir `DATABASE_URL` ile GERÇEK bir Nest süreci (derlenmiş `dist/main.js`)
// AYRI bir OS sürecinde başlatılır; `shutdown.test.ts` DB'ye giden en az bir
// istek atıp SIGTERM gönderir, exit kodunu VE `pg_stat_activity`'deki satır
// sayısını doğrular.
//
// NEDEN `dist/main.js` (DERLENMİŞ JS), KAYNAK `.ts` DEĞİL: NestJS'in legacy
// dekoratörleri (`experimentalDecorators`) ÇALIŞMA ZAMANI DÖNÜŞÜMÜ gerektirir
// (`__decorate` yardımcı çağrıları). Bu dönüşümü yalnızca `tsc` (derleme) ve
// vitest'in esbuild'i (in-process testler, `createTestApp`) yapar. Node'un
// YERLEŞİK TypeScript tip-soyma modu SADECE tip ANNOTASYONLARINI SİLER,
// dekoratör SÖZDİZİMİNİ DÖNÜŞTÜRMEZ; `tsx`/`ts-node` KULLANILAMAZ (CLAUDE.md
// yasakları + T-001 precedenti). AYRI bir OS süreci için TEK güvenilir yol
// budur — bu yüzden {@link buildApiForShutdownTest} çocuk süreci başlatmadan
// ÖNCE `dist`'i `tsc -p tsconfig.build.json` ile TAZELER (AC12'nin beşli
// kapısında `test`/`build` sırası garanti değildir — bu test KENDİ tazeliğini
// garanti eder).
//
// (ampirik olarak doğrulandı: build + spawn + SIGTERM → `exit 0`,
// `pg_stat_activity` satırı 1→0; bkz. ST-7 üretim log notları.)

import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** `pg_stat_activity`'de aranacak, bu teste ÖZEL bağlantı adı (K-A8). */
export const SHUTDOWN_CHILD_APPLICATION_NAME = 'arkesoft-api-ac11'

/**
 * Diğer testlerin portuyla ÇAKIŞMAYAN, bu teste özel sabit port. (Diğer
 * testler `supertest` ile doğrudan `http.Server`'a bağlanır, GERÇEKTEN
 * `listen()` ÇAĞIRMAZ — bu test ise GERÇEK bir OS sürecini GERÇEK bir porta
 * bağlar.)
 */
export const SHUTDOWN_CHILD_PORT = 39_111

const API_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const MAIN_JS_PATH = fileURLToPath(new URL('../../../dist/main.js', import.meta.url))

/** `databaseUrl`'e `application_name` sorgu parametresini EKLER/DEĞİŞTİRİR. */
export function withApplicationName(databaseUrl: string, applicationName: string): string {
  const url = new URL(databaseUrl)
  url.searchParams.set('application_name', applicationName)
  return url.toString()
}

/**
 * `dist/main.js`'i TAZELER. Senkron çalışır (test `beforeAll`'u bunu
 * BEKLEMELİ) — derleme birkaç saniye sürebilir, bu KASITLI: testin kendi
 * tazeliğini garanti etmesi, önceden koşmuş `pnpm build`'e güvenmekten daha
 * değerlidir (AC12'nin beşli kapısında sıra garanti değildir).
 */
export function buildApiForShutdownTest(): void {
  execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.build.json'], {
    cwd: API_ROOT,
    stdio: 'pipe',
  })
}

export type ShutdownChildHandle = {
  readonly child: ChildProcessWithoutNullStreams
  readonly exited: Promise<{
    readonly code: number | null
    readonly signal: NodeJS.Signals | null
  }>
}

/**
 * `dist/main.js`'i AYRI bir OS sürecinde başlatır. `DATABASE_URL`
 * {@link SHUTDOWN_CHILD_APPLICATION_NAME} ile işaretlenir; `API_PORT`
 * {@link SHUTDOWN_CHILD_PORT}'a sabitlenir. Diğer TÜM ortam değişkenleri
 * ÇAĞIRAN SÜREÇTEN (vitest'in `process.env`'i, `vitest.config.ts`'in
 * `loadEnvFile`'ı ile doldurduğu) devralınır.
 */
export function startShutdownChild(): ShutdownChildHandle {
  const baseDatabaseUrl = process.env['DATABASE_URL']

  if (baseDatabaseUrl === undefined) {
    throw new Error(
      "startShutdownChild: process.env.DATABASE_URL tanımlı değil (vitest.config.ts kök .env'i yüklemeli).",
    )
  }

  const child = spawn('node', [MAIN_JS_PATH], {
    cwd: API_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: withApplicationName(baseDatabaseUrl, SHUTDOWN_CHILD_APPLICATION_NAME),
      API_PORT: String(SHUTDOWN_CHILD_PORT),
    },
    stdio: 'pipe',
  })

  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on('exit', (code, signal) => {
      resolve({ code, signal })
    })
  })

  return { child, exited }
}
