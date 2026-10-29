// @arkesoft/api — istemci IP çözümü (ROADMAP v0.0.5, T-006/S8, architect
// riski 4, "client-ip.ts")
//
// SAF, DI'SIZ, test edilebilir fonksiyon — `process.env`/`ApiEnv` OKUMAZ.
// `trustedProxyCount` ÇAĞIRAN tarafından (guard, `ApiEnv.AUTH_TRUSTED_PROXY_COUNT`'u
// okuyarak) PARAMETRE olarak geçirilir.
//
// ⚠ VARSAYILAN `0` — `X-Forwarded-For` BAŞLIĞI TAMAMEN YOK SAYILIR, SOKET
// ADRESİ kullanılır (architect riski 4, bağlayıcı): k8s ingress arkasında
// istemciler İSTEMCİ-SEÇİMLİ bu başlığı KENDİLERİ UYDURABİLİR; güvenilir
// vekil sayısı doğru ayarlanmadan XFF'e güvenmek IP sayacını GLOBAL bir
// sayaca çevirir (tüm istekler aynı ingress IP'sinden görünür) ve 20/15dk
// eşiği TÜM platformu kilitler. v0.18.0 ingress bunu doğru ayarlamak
// ZORUNDA (`AUTH_TRUSTED_PROXY_COUNT`); o güne kadar varsayılan `0`
// EN GÜVENLİ tercih.
//
// `trustedProxyCount > 0` İSE standart "trust proxy sayısı" algoritması
// (Express'in `trust proxy` sayısal ayarıyla AYNI semantik): `X-Forwarded-For`
// soldan (ilk istemci) sağa (en yakın vekil) doğru BİRİKTİRİLMİŞ bir listedir;
// güvenilir `N` vekilin EKLEDİĞİ son `N` girdiyi ATARIZ, kalan en SONDAKİ
// girdi gerçek istemcidir (`index = length - N`, sınır altına DÜŞERSE en
// soldaki girdiye — en iyi tahmine — düşülür).

/**
 * `resolveClientIp`'in beklediği, adaptör-nötr istek yüzeyi. `HttpRequestLike`
 * (`http/http-request.types.ts`, PAYLAŞILAN dosya, BU alt görevde DOKUNULMADI)
 * `headers`/`method`/`url` taşır ama soket adresini TAŞIMAZ — `auth.controller.ts`'in
 * `AuthDelegationRequest` deseniyle AYNI yerel genişletme (ayrı dosyada,
 * paylaşılan tipi DEĞİŞTİRMEDEN).
 */
export interface ClientIpSourceRequest {
  readonly headers: Record<string, string | string[] | undefined>
  readonly socket?: { readonly remoteAddress?: string }
}

/** Soket adresi de YOKSA (test ortamı, Unix soketi vb.) düşülecek sentinel. */
const UNKNOWN_IP = 'unknown'

function readForwardedForHeader(headers: ClientIpSourceRequest['headers']): string | undefined {
  const value = headers['x-forwarded-for']
  return Array.isArray(value) ? value[0] : value
}

/**
 * İstemci IP'sini çözer — ASLA `undefined` dönmez, en kötü durumda
 * {@link UNKNOWN_IP} sentinel'ine düşer (rate-limit anahtarının HER ZAMAN
 * tanımlı bir dize taşıması gerekir).
 */
export function resolveClientIp(req: ClientIpSourceRequest, trustedProxyCount: number): string {
  const socketAddress = req.socket?.remoteAddress

  if (trustedProxyCount <= 0) {
    return socketAddress ?? UNKNOWN_IP
  }

  const header = readForwardedForHeader(req.headers)
  if (header === undefined || header.trim().length === 0) {
    return socketAddress ?? UNKNOWN_IP
  }

  const hops = header
    .split(',')
    .map((hop) => hop.trim())
    .filter((hop) => hop.length > 0)

  if (hops.length === 0) {
    return socketAddress ?? UNKNOWN_IP
  }

  const clientIndex = Math.max(hops.length - trustedProxyCount, 0)

  return hops[clientIndex] ?? socketAddress ?? UNKNOWN_IP
}
