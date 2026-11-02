// @arkesoft/storefront — e2e global setup (ROADMAP v0.0.8, T-009/S9, qa —
// ÜRETİM ROLÜNDE)
//
// GEREKÇE (handoff'un "ÖNERİLİYOR, zorunlu değil" notu): API süreci kapalıyken
// `/trpc/storefront.currentTenant`'a yapılan HER çağrı middleware'in catch
// bloğunda bağlantı hatasına düşer ve 503'e eşlenir — bu durumda AC4/AC5/AC6
// testlerinin TAMAMI "beklenen 200/404 ama 503 geldi" gibi ANLAŞILMAZ,
// yanıltıcı bir diff'le kırılır (en pahalı teşhis sınıfı: geliştirici önce
// middleware'i/host çözümünü şüpheli görür, asıl sebep ayakta olmayan bir
// süreçtir). Bu dosya bu teşhis maliyetini SIFIRLAR: API ayakta değilse
// koşum BAŞLAMADAN, hangi komutların çalıştırılması gerektiğini ADIYLA
// sayan Türkçe bir hata fırlatır.
import { storefrontEnv } from '../src/lib/storefront-env.js'

const READINESS_TIMEOUT_MS = 5_000

export default async function globalSetup(): Promise<void> {
  const readinessUrl = `${storefrontEnv.STOREFRONT_API_BASE_URL}/health/ready`

  let response: Response
  try {
    response = await fetch(readinessUrl, { signal: AbortSignal.timeout(READINESS_TIMEOUT_MS) })
  } catch (error) {
    throw new Error(buildUnreadyMessage(readinessUrl, error), { cause: error })
  }

  if (!response.ok) {
    throw new Error(buildUnreadyMessage(readinessUrl, `HTTP ${String(response.status)}`))
  }
}

/** Hem ağ hatası hem HTTP-olmayan-2xx için AYNI, eksiksiz teşhis metnini üretir. */
function buildUnreadyMessage(readinessUrl: string, cause: unknown): string {
  return [
    `e2e ön koşulu karşılanmadı: ${readinessUrl} yanıt vermiyor.`,
    'Bu e2e paketi `apps/api`nin ÇALIŞIYOR olmasını gerektirir (storefront SSR',
    'middleware her isteği sunucu-taraflı tRPC çağrısıyla çözer). Sırayla:',
    '  1. pnpm infra:up',
    '  2. pnpm db:migrate',
    '  3. pnpm db:seed',
    '  4. pnpm --filter @arkesoft/api dev  (ayrı bir terminalde, AÇIK bırakın)',
    '',
    `Gözlenen sebep: ${String(cause)}`,
  ].join('\n')
}
