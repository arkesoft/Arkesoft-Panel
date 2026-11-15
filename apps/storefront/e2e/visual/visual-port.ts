// @arkesoft/storefront — görsel regresyon port/host-gateway çözümü
// (ROADMAP v0.0.19, T-020/S6, ADR-0022 Karar 4/5).
//
// `e2e/e2e-port.ts`'in (DOKUNULMADI) KARDEŞİ, AMA AYRI bir modül — iki ayrı
// sunucu kimliğini (DEV `astro dev`:4321 vs ÜRETİM `node dist/server/
// entry.mjs`:4322) TEK bir port sabitinde karıştırmamak için BİLİNÇLİ
// olarak kopyalanmadı/paylaşılmadı (`storefrontUrl`'ü ÇAĞIRMAK, görsel
// projelerin DEV portuna kazara bağlanmasını mümkün kılardı).
//
// `DEFAULT_VISUAL_PORT = 4322` — `astro.config.ts:19` yorumunun belirttiği
// `process.env.PORT` önceliği + bu paketin DEV portu `4321`'den (S4'ün
// dosyası, DOKUNULMADI) bilinçli olarak farklı: `run-visual.sh` ÜRETİM
// sunucusunu (ADR Karar 5) AYNI makinede, DEV sunucusuyla ÇAKIŞMADAN
// başlatabilsin.
//
// ⚠ ÖLÇÜLDÜ (bu alt görev, geliştirme makinesi): bu makinede port 4322
// BAŞKA BİR (Arkesoft dışı) projenin dev sunucusu tarafından işgal edilmiş
// durumda (`lsof -nP -iTCP:4322` → ilgisiz bir Astro süreci). Bu, varsayılan
// DEĞERİ DEĞİŞTİRMEZ (CI'da ve temiz bir geliştirme makinesinde çakışma
// YOKTUR) — yalnızca `ARKESOFT_STOREFRONT_VISUAL_PORT` override'ının NEDEN
// var olduğunu doğrular (devops raporu KOŞTURULAN KOMUTLAR'da ayrıntı).
const DEFAULT_VISUAL_PORT = 4322

export function resolveStorefrontVisualPort(override: string | undefined): number {
  return override !== undefined && override.length > 0 ? Number(override) : DEFAULT_VISUAL_PORT
}

export const STOREFRONT_VISUAL_PORT = resolveStorefrontVisualPort(
  process.env['ARKESOFT_STOREFRONT_VISUAL_PORT'],
)

/** Görsel koşumun üretim sunucusu için host+port birleşimi. */
export function storefrontVisualUrl(host: string, pathname = '/'): string {
  return `http://${host}:${String(STOREFRONT_VISUAL_PORT)}${pathname}`
}

/**
 * ⚠⚠ BRIEF'TE OLMAYAN, BU ALT GÖREVDE ÖLÇÜLMÜŞ BULGU — Chromium `*.localhost`
 * ana bilgisayar adlarını KENDİ ağ servisi içinde SABİT OLARAK döngüsel
 * (loopback) adrese çözer; bu, konteynerin KENDİ `/etc/hosts`'una
 * `--add-host demo-magaza.arkesoft.localhost:host-gateway` ile eklenen
 * GERÇEK host-gateway IP'sini GÖRMEZDEN GELİR (ÖLÇÜLDÜ: `curl`/Node'un
 * `dns.lookup`'ı `/etc/hosts`'u DOĞRU okuyup host-gateway IP'sini
 * döndürüyor, AMA aynı konteynerde çıplak bir Chromium `page.goto` ile
 * `net::ERR_CONNECTION_REFUSED` veriyordu — tarayıcı konteynerin KENDİ
 * `127.0.0.1`'ine bağlanmaya çalışıyordu, orada HİÇBİR ŞEY dinlemiyor çünkü
 * üretim sunucusu HOST makinede çalışıyor). ÇÖZÜM (ölçülerek doğrulandı):
 * Chromium'un KENDİ `--host-resolver-rules` bayrağıyla bu iki ana bilgisayar
 * adını AÇIKÇA host-gateway IP'sine haritalamak — bu bayrak `/etc/hosts`'u
 * BAYPAS EDEN Chromium'un dahili çözücüsünü GERİ KAZANDIRIR.
 * `run-visual.sh` bu IP'yi (`docker run --add-host …:host-gateway` ile aynı
 * mekanizmayı kullanan bir ön-adım) çözüp `ARKESOFT_STOREFRONT_VISUAL_
 * HOST_GATEWAY_IP` ortam değişkenine yazar; bu değişken YOKSA (örn. Docker
 * DIŞINDA, doğrudan `playwright test --project=storefront-visual-*`
 * çalıştırılırsa — bağlayıcı DEĞİL, `playwright.config.ts` tarayıcı +
 * sunucu AYNI makinede olduğu için bayrağa gerek KALMAZ) `undefined` döner
 * ve çağıran bayrağı EKLEMEZ.
 */
export function buildVisualHostResolverRulesArgument(): string | undefined {
  const gatewayIp = process.env['ARKESOFT_STOREFRONT_VISUAL_HOST_GATEWAY_IP']
  if (gatewayIp === undefined || gatewayIp.length === 0) {
    return undefined
  }

  return [
    `--host-resolver-rules=MAP demo-magaza.arkesoft.localhost ${gatewayIp}`,
    `MAP yok.arkesoft.localhost ${gatewayIp}`,
  ].join(',')
}
