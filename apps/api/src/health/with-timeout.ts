// @arkesoft/api — zaman aşımı sarmalayıcısı (ROADMAP v0.0.4, T-002/ST-6,
// architect K-A8)
//
// `/health/ready`'nin HTTP bütçesi — bu bir İŞ KURALI değil (K-A3/K-A8 notu:
// `checkDatabaseConnection`/redis `ping()` kendileri zaman aşımı sarmalaması
// YAPMAZ, bu bütçe çağıranın — `apps/api`'nin — sorumluluğu).
//
// `READINESS_CHECK_TIMEOUT_MS` SABİTTİR, ENV DEĞİL (K-A8, bağlayıcı — env
// yüzeyi büyümesin). `clearTimeout` HER DURUMDA `finally`'de çağrılır — sarkan
// zamanlayıcı KALMAZ (AC11'in "SIGTERM sonrası açık handle yok" garantisiyle
// aynı disiplin; `redis.service.ts` da bu fonksiyonu yaşam döngüsü kapanışı
// için yeniden kullanır).

/** `/health/ready`'nin her bağımlılık kontrolü için sabit zaman aşımı bütçesi. */
export const READINESS_CHECK_TIMEOUT_MS = 2000

/**
 * `promise` `ms` milisaniye içinde tamamlanmazsa reddeder (zaman aşımı
 * hatası); tamamlanırsa sonucu/hatasını OLDUĞU GİBİ iletir. Asılı (hiç
 * dönmeyen) bir promise verilse bile zamanlayıcı HER DURUMDA temizlenir.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`zaman aşımı: ${String(ms)}ms içinde tamamlanmadı`))
      }, ms)

      promise.then(
        (value) => {
          resolve(value)
        },
        // Orijinal reddetme NEDENİNİ DEĞİŞTİRMEDEN iletiyoruz (`unknown` —
        // çağıranın verdiği promise her türden bir değerle reddedebilir).
        // `prefer-promise-reject-errors` BİLEREK devre dışı: hatayı
        // sarmalamak orijinal hata tipini/stack'ini kaybettirir.
        (error: unknown) => {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(error)
        },
      )
    })
  } finally {
    clearTimeout(timer)
  }
}
