// @arkesoft/api — AC10 KAPISI: kuyruk-yetenekli Redis probu
// (ROADMAP v0.0.11, T-013/S4, architect K2)
//
// NE SORUYOR: "bağlandığım Redis, KUYRUK OLMAK için yapılandırılmış mı?"
// NE SORMUYOR: "hangi host?" — o soruyu `create-test-app.ts:119-147`'nin
// hostname allowlist'i zaten soruyor ve bu kapı onu KALDIRMAZ, ÜSTÜNE EKLENİR.
//
// NEDEN HOSTNAME YETMİYOR (ÖLÇÜLDÜ, T-013/S1 — varsayım değil): 6379'da iki
// Redis dinleyicisi vardı ve İKİSİ DE `127.0.0.1`'e çözülüyordu —
//   redis-ser 1445 (homebrew) → 127.0.0.1:6379 + [::1]:6379   appendonly=no
//   com.docke 5321 (compose)  → *:6379                        appendonly=yes
// Spesifik bağlama kazandığı için `redis://localhost:6379` HOMEBREW örneğine
// gidiyordu. Homebrew örneği `appendonly=no` taşıdığı için kuyruk işleri
// yeniden başlatmayı ATLATAMAZ — ama hostname allowlist'inden compose ile
// BİREBİR AYNI şekilde geçer. Yani hostname bu soruya YAPISAL OLARAK cevap
// veremez; kapı KİMLİĞİ değil YETENEĞİ ölçmek zorunda.
//
// NEDEN "yanıltıcı yeşil" GERÇEK BİR RİSK: `infra/docker-compose.yml:49`
// birebir şunu yazıyor — "appendonly: kuyruktaki işler container yeniden
// başlayınca kaybolmasın". Yapılandırılmamış bir Redis üzerinde kuyruk
// testleri GEÇER (işler bellekte durur, test aynı süreçte biter), ama işler
// kalıcı DEĞİLDİR ve `maxmemory-policy` eviction'lıysa BullMQ anahtarları
// SESSİZCE SİLİNEBİLİR. Bu kapı o cümleyi makineye çeviriyor.
//
// NE ASSERT EDİLİYOR (`REQUIRED_QUEUE_REDIS_CONFIG`):
//   appendonly       == 'yes'         → işler yeniden başlatmayı atlatmalı
//   maxmemory-policy == 'noeviction'  → kuyruk anahtarları sessizce silinemez
// NE ASSERT EDİLMİYOR (`DIAGNOSTIC_ONLY_QUEUE_REDIS_CONFIG`):
//   save  → RDB anlık görüntü ayarı imajlar/sürümler arasında MEŞRU biçimde
//           değişir (ölçüldü: compose `60 1`); assert edilse kapı KIRILGAN
//           olurdu. Yalnızca HATA MESAJINDA raporlanır — teşhisi hızlandırır.
//
// FAIL-CLOSED, ÜÇ KATMAN:
//   (a) İLK satır `process.env['NODE_ENV'] !== 'test'` → fırlat. Redis'e
//       HİÇBİR komut gitmeden önce. Emsal ve gerekçe `create-test-app.ts:130-139`
//       (`process.env` BİLEREK — `ApiEnv.NODE_ENV`'i testler KENDİ senaryoları
//       için override EDEBİLİR, bu kapı o override'dan ETKİLENMEMELİ).
//   (b) Beklenen değer KARŞILANMAZSA fırlatır — tam eşleşme, kırpma YOK,
//       büyük/küçük harf normalizasyonu YOK. `'YES'`, `' yes'`, `''` hepsi
//       KIRMIZI. Gerekçe: Redis bu değerleri küçük harfle ve kırpılmış döner;
//       normalizasyon eklemek kapının ölçtüğü şeyi GEVŞETİR.
//   (c) Anahtar HİÇ DÖNMEZSE (boş `CONFIG GET` yanıtı) de fırlatır — sessizce
//       geçmez. Yanıt ŞEKLİ tanınmazsa (null, sayı, karışık dizi) de fırlatır.
//
// ⚠ ENV'DEN GEVŞETİLEMEZ: bu dosyada `process.env`'in TEK geçtiği yer (a)
// kapısıdır. `REQUIRED_QUEUE_REDIS_CONFIG` bir MODÜL SABİTİ — env'den OKUNMAZ
// (K-A8 emsali). `SKIP` + `_QUEUE_REDIS_CHECK` biçiminde bir kaçış kapısı
// BİLEREK YOK; kapının tüm amacı bu. (Jeton yine BİTİŞİK YAZILMADI —
// literal-jeton kuralı, yukarı bkz.)
//
// ⚠ LİTERAL-JETON KURALI (AGENT_BASELINE §5): bu dosyanın ve testinin
// "yalnızca okuma" iddiası `rg -i "CONFIG" + boşluk + "SET"` ile denetlenir →
// o jeton çifti bu dosyada BİTİŞİK YAZILMAZ, yoksa denetim kendi yorumumuzu
// bulup KALICI YANLIŞ POZİTİF üretir. Aşağıda "CONFIG'in yazma alt komutu"
// diye geçiyor.
//
// ⚠ CONFIG'in YAZMA alt komutu ASLA ÇAĞRILMAZ. Kapı yalnızca OKUR. Enjekte edilen okuyucu
// yüzeyi (`QueueRedisConfigReader`) `'GET'` alt komutunu TİP SEVİYESİNDE
// sabitler → bu dosya (ve onu kullanan testler) başka bir alt komut
// çağıramaz. Negatif testler gerçek yapılandırmayı DEĞİŞTİRMEK yerine SAHTE
// yanıt veren bir okuyucu enjekte eder.
//
// ⚠ ÜRETİMDE KOŞMAZ: `CONFIG GET` yönetilen Redis'lerde yasaklı olabilir
// (üretim hazırlığı v0.18.0). Risk üretimde de gerçek (eviction'lı Redis
// BullMQ anahtarlarını sessizce siler) → v0.18.0 borç satırı.

import { z } from 'zod'

/**
 * `CONFIG GET` okuyabilen EN KÜÇÜK yüzey. ioredis `Redis` örneği bunu YAPISAL
 * olarak karşılar (`assertQueueCapableRedis(redisClient)` doğrudan çalışır);
 * negatif testler aynı yüzeyi sahte yanıtla uygular. Alt komut `'GET'` olarak
 * SABİTLENMİŞTİR — CONFIG'in yazma alt komutu bu yüzeyden çağrılamaz.
 */
export type QueueRedisConfigReader = {
  config(subcommand: 'GET', parameter: string): Promise<unknown>
}

/**
 * Ölçülen değerler. Anahtar `CONFIG GET` parametresi; değer `undefined` ise
 * Redis o parametre için HİÇBİR değer döndürmedi.
 */
export type QueueRedisConfigMeasurement = ReadonlyMap<string, string | undefined>

/**
 * MODÜL SABİTİ — env'den OKUNMAZ, gevşetilemez (K-A8 emsali). Değerler
 * `infra/docker-compose.yml:54`'ün (`--appendonly yes`) ve kuyruk anahtarlarının
 * silinemezliğinin (`noeviction`) makine karşılığı.
 */
const REQUIRED_QUEUE_REDIS_CONFIG: ReadonlyMap<string, string> = new Map([
  ['appendonly', 'yes'],
  ['maxmemory-policy', 'noeviction'],
])

/**
 * ASSERT EDİLMEZ — yalnızca hata mesajında raporlanır (dosya başı yorumu:
 * `save` imajlar arasında meşru biçimde değişir, assert kapıyı kırılgan yapar).
 */
const DIAGNOSTIC_ONLY_QUEUE_REDIS_CONFIG: readonly string[] = ['save']

/** Ölçülemeyen değer için mesaj gösterimi — boş dizeden ('') AYIRT EDİLEBİLİR olmak zorunda. */
const UNREAD_VALUE_LABEL = '<CONFIG GET hiçbir değer döndürmedi>'

/**
 * `CONFIG GET` yanıtı iki şekilde gelebilir: RESP2 düz çift dizisi
 * (`['appendonly', 'yes']`) veya RESP3 eşlemesi (`{ appendonly: 'yes' }`).
 * Dizi birlikte ÖNCE denenir (dizi aynı zamanda bir nesnedir). Tanınmayan şekil
 * parse HATASI üretir — `as` ile zorlama YOK (CLAUDE.md §4).
 */
const configGetReplySchema = z.union([z.array(z.string()), z.record(z.string(), z.string())])

/** Beklenen değeri karşılamayan tek bir parametrenin ölçüm sonucu. */
type QueueRedisConfigFailure = {
  readonly parameter: string
  readonly expected: string
  readonly measured: string | undefined
}

function formatMeasuredValue(measured: string | undefined): string {
  return measured === undefined ? UNREAD_VALUE_LABEL : `'${measured}'`
}

/**
 * Tek parametrenin değerini yanıttan çıkarır. Çift dizisi İKİ adımla taranır
 * (`indexOf` DEĞİL — bir DEĞER parametre adıyla aynı olsaydı yanlış hizalardı).
 * Parametre yanıtta yoksa `undefined` döner (çağıran bunu BAŞARISIZLIK sayar).
 */
function extractConfigValue(parameter: string, reply: unknown): string | undefined {
  const parsed = configGetReplySchema.safeParse(reply)

  if (!parsed.success) {
    throw new Error(
      `assertQueueCapableRedis: CONFIG GET ${parameter} yanıtının şekli tanınmadı — fail-closed kapı tetiklendi (beklenen RESP2 çift dizisi veya RESP3 eşlemesi). Zod: ${parsed.error.message}`,
    )
  }

  const entries = parsed.data

  if (Array.isArray(entries)) {
    for (let index = 0; index + 1 < entries.length; index += 2) {
      if (entries[index] === parameter) {
        return entries[index + 1]
      }
    }
    return undefined
  }

  return entries[parameter]
}

function buildFailureMessage(
  failures: readonly QueueRedisConfigFailure[],
  measurement: QueueRedisConfigMeasurement,
): string {
  const failureLines = failures.map(
    (failure) =>
      `  - ${failure.parameter}: beklenen '${failure.expected}', ölçülen ${formatMeasuredValue(failure.measured)}`,
  )

  const measuredSummary = [...measurement.entries()]
    .map(([parameter, value]) => `${parameter}=${formatMeasuredValue(value)}`)
    .join(' · ')

  return [
    'assertQueueCapableRedis: kuyruk testleri KUYRUK OLARAK YAPILANDIRILMIŞ bir Redis gerektirir — fail-closed kapı tetiklendi (AC10).',
    '',
    'Karşılanmayan zorunlu ayarlar:',
    ...failureLines,
    '',
    `Ölçülen tüm değerler: ${measuredSummary}`,
    `Not: '${DIAGNOSTIC_ONLY_QUEUE_REDIS_CONFIG.join("', '")}' ASSERT EDİLMEZ, yalnızca teşhis için raporlanır.`,
    '',
    'Olası sebep: REDIS_URL, kuyruk için yapılandırılmamış BAŞKA bir Redis örneğine çözülüyor (homebrew redis-server varsayılanı appendonly=no).',
    "Çözüm: (1) host örneğini durdur — brew services stop redis · (2) compose Redis'ini ayağa kaldır — pnpm infra:up · (3) 6379'da tek dinleyici kaldığını doğrula — lsof -nP -iTCP:6379 -sTCP:LISTEN",
  ].join('\n')
}

/**
 * Bağlanılan Redis'in kuyruk olmaya yapılandırıldığını ÖLÇER; değilse fırlatır.
 * Kuyruk kullanan her entegrasyon testinin İLK satırında çağrılır.
 *
 * Yalnızca okur — CONFIG'in yazma alt komutu çağrılmaz, hiçbir anahtar
 * yazılmaz/silinmez.
 *
 * @param reader `CONFIG GET` okuyabilen istemci (ioredis `Redis` örneği uyar).
 * @returns Ölçülen tüm değerler (zorunlu + yalnızca-teşhis), çağıranın raporlaması için.
 * @throws NODE_ENV test değilse; zorunlu bir ayar karşılanmazsa; değer hiç
 *   dönmezse; yanıt şekli tanınmazsa.
 */
export async function assertQueueCapableRedis(
  reader: QueueRedisConfigReader,
): Promise<QueueRedisConfigMeasurement> {
  // Dosya başı yorumu (a) — KASITLI OLARAK `process.env['NODE_ENV']`
  // (`ApiEnv` DEĞİL): testler KENDİ senaryoları için `apiEnv.NODE_ENV`'i
  // override edebilir; bu kapı o override'dan ETKİLENMEMELİ. Bu dosyada
  // `process.env`'in TEK geçtiği yer burasıdır.
  const realNodeEnv = process.env['NODE_ENV']
  if (realNodeEnv !== 'test') {
    throw new Error(
      `assertQueueCapableRedis yalnızca NODE_ENV=test ortamında koşabilir — fail-closed kapı tetiklendi (ölçülen process.env.NODE_ENV: ${String(realNodeEnv)})`,
    )
  }

  const measurement = new Map<string, string | undefined>()

  for (const parameter of [
    ...REQUIRED_QUEUE_REDIS_CONFIG.keys(),
    ...DIAGNOSTIC_ONLY_QUEUE_REDIS_CONFIG,
  ]) {
    const reply = await reader.config('GET', parameter)
    measurement.set(parameter, extractConfigValue(parameter, reply))
  }

  const failures: QueueRedisConfigFailure[] = []

  for (const [parameter, expected] of REQUIRED_QUEUE_REDIS_CONFIG) {
    const measured = measurement.get(parameter)
    // Tam eşleşme — kırpma/büyük-küçük harf normalizasyonu YOK (dosya başı
    // yorumu (b)); `undefined` de karşılaştırmayı DOĞAL olarak başarısız kılar
    // (dosya başı yorumu (c)).
    if (measured !== expected) {
      failures.push({ parameter, expected, measured })
    }
  }

  if (failures.length > 0) {
    throw new Error(buildFailureMessage(failures, measurement))
  }

  return measurement
}
