// @arkesoft/storefront — storefront-env.ts testleri (ROADMAP v0.0.8,
// T-009/S6, DoD "env fail-fast")
//
// ⚠ Bu dosyada `storefront-env.ts`'in STATİK `import`'u KASITLI OLARAK
// YOK: modülün `export const storefrontEnv = parseStorefrontEnv(process.
// env)` satırı YÜKLEME ANINDA çalışır (K17'nin istediği TAM davranış) —
// statik bir `import` HOISTED olduğu için `process.env`'i önceden
// ayarlamak İMKANSIZ olurdu ve ambient test ortamında bu iki değişken
// tanımlı DEĞİLSE dosyanın TAMAMI (şema-only testler dahil) çökerdi. Bu
// yüzden HER test, geçerli bir `process.env` kurduktan SONRA
// `vi.resetModules()` + dinamik `import()` ile TAZE bir modül örneği alır.
import { afterEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

function setValidEnv(): void {
  process.env['APP_BASE_DOMAIN'] = 'arkesoft.localhost'
  process.env['STOREFRONT_API_BASE_URL'] = 'http://127.0.0.1:3000'
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.resetModules()
})

describe('storefrontEnvSchema', () => {
  it('geçerli bir ortamı kabul eder', async () => {
    setValidEnv()
    vi.resetModules()
    const { storefrontEnvSchema } = await import('../storefront-env.js')

    const result = storefrontEnvSchema.safeParse({
      APP_BASE_DOMAIN: 'demo.arkesoft.localhost',
      STOREFRONT_API_BASE_URL: 'http://127.0.0.1:3000',
    })

    expect(result.success).toBe(true)
  })

  it('APP_BASE_DOMAIN boşsa reddeder', async () => {
    setValidEnv()
    vi.resetModules()
    const { storefrontEnvSchema } = await import('../storefront-env.js')

    const result = storefrontEnvSchema.safeParse({
      APP_BASE_DOMAIN: '',
      STOREFRONT_API_BASE_URL: 'http://127.0.0.1:3000',
    })

    expect(result.success).toBe(false)
  })

  it('STOREFRONT_API_BASE_URL geçerli bir URL değilse reddeder', async () => {
    setValidEnv()
    vi.resetModules()
    const { storefrontEnvSchema } = await import('../storefront-env.js')

    const result = storefrontEnvSchema.safeParse({
      APP_BASE_DOMAIN: 'arkesoft.localhost',
      STOREFRONT_API_BASE_URL: 'not-a-url',
    })

    expect(result.success).toBe(false)
  })

  it('STOREFRONT_API_BASE_URL eksikse reddeder', async () => {
    setValidEnv()
    vi.resetModules()
    const { storefrontEnvSchema } = await import('../storefront-env.js')

    const result = storefrontEnvSchema.safeParse({
      APP_BASE_DOMAIN: 'arkesoft.localhost',
    })

    expect(result.success).toBe(false)
  })
})

describe('storefront-env.ts modül yükleme (K17 — açılışta fail-fast)', () => {
  it('geçerli ortamda modül başarıyla yüklenir ve storefrontEnv dolu döner', async () => {
    setValidEnv()
    vi.resetModules()

    const { storefrontEnv } = await import('../storefront-env.js')

    expect(storefrontEnv).toEqual({
      APP_BASE_DOMAIN: 'arkesoft.localhost',
      STOREFRONT_API_BASE_URL: 'http://127.0.0.1:3000',
    })
  })

  it('STOREFRONT_API_BASE_URL eksikse modül YÜKLENİRKEN fırlar (süreç açılışta durur)', async () => {
    setValidEnv()
    delete process.env['STOREFRONT_API_BASE_URL']
    vi.resetModules()

    await expect(import('../storefront-env.js')).rejects.toThrow()
  })

  it('APP_BASE_DOMAIN eksikse modül YÜKLENİRKEN fırlar', async () => {
    setValidEnv()
    delete process.env['APP_BASE_DOMAIN']
    vi.resetModules()

    await expect(import('../storefront-env.js')).rejects.toThrow()
  })
})
