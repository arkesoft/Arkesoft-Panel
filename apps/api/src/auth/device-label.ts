// @arkesoft/api — Cihaz etiketi çözümleyicisi (ROADMAP v0.0.15.1, T-017/S7,
// architect ADR-0019 §8 "TASARIM" bölümü)
//
// ⚠⚠ K4 REVİZE (po ölçtü): bu dosya S4'ün bağımlısıdır. Dönüş tipi
// `@arkesoft/trpc`'in `DeviceBrowserWire`/`DeviceOsWire` tel enum'larından
// İTHAL edilir (`schemas/session-summary.schema.ts`) — YEREL bir
// union/enum TANIMLANMAZ. Yerel bir ayna, T-016'nın en pahalı dersiydi
// (altı ayna, dördü korumasız) — burada tekrarlanmaz.
//
// SAF FONKSİYON — I/O YOK. `await`/`fetch`/`prisma`/`process` içermez
// (DoD mekanik kanıtı: grep). Girdi tek bir `string | null` (ham User-Agent
// başlığı); çıktı iki sabit tanımlayıcıdan oluşan bir nesne.
//
// ⚠⚠ HAM UA DİZESİ BURADAN DIŞARI SIZMAZ (architect ADR-0019 §8, bağlayıcı):
// bu fonksiyon UA'yı loglamaz, döndürmez, hiçbir yan kanala yazmaz — yalnızca
// iki kapalı-dünya tanımlayıcıya indirger. Tele çıkan tek şey bu iki
// tanımlayıcıdır (`activeSessionWireSchema`'nın `browserFamily`/`osFamily`
// alanları, S4).
//
// ⚠⚠ YENİ ANA BAĞIMLILIK YOK (ADR-0019 §8, `pm`'in R7'si reddedildi): UA
// ayrıştırması elle yazılmış, tablo sürümlü, saf bir eşlemedir — harici bir
// ayrıştırma kütüphanesi eklenmez.
//
// ⚠⚠ SIRA BAĞLAYICIDIR — UA alt dizeleri İÇ İÇE geçer, yanlış sıra SESSİZCE
// yanlış etiket üretir (bu projenin avladığı kusur sınıfı, bkz. T-016):
//
//   TARAYICI EKSENİ (bu sıra bozulmaz):
//     1. `Edg/`             → 'edge'    (Edge UA'sı `Chrome/` de İÇERİR —
//                                         Chrome kontrolünden ÖNCE gelmeli)
//     2. `OPR/` / `Opera`   → 'opera'   (Opera UA'sı da `Chrome/` içerir —
//                                         Chrome kontrolünden ÖNCE gelmeli)
//     3. `SamsungBrowser/`  → 'samsung' (Samsung Internet UA'sı da
//                                         `Chrome/` içerir — Chrome
//                                         kontrolünden ÖNCE gelmeli)
//     4. `Firefox/`         → 'firefox' (ayrık motor, sıra bağımsız ama
//                                         Chrome'dan önce kontrol edilir —
//                                         Firefox UA'sı `Chrome/`/`Safari/`
//                                         İÇERMEZ, çakışma yok, netlik için
//                                         burada tutulur)
//     5. `Chrome/`          → 'chrome'  (Chrome UA'sı `Safari/` de İÇERİR —
//                                         Safari kontrolünden ÖNCE gelmeli)
//     6. `Safari/`          → 'safari'  (yalnızca yukarıdakilerin HİÇBİRİ
//                                         eşleşmediyse buraya düşer —
//                                         gerçek Safari UA'sında `Chrome/`
//                                         YOKTUR)
//     7. (hiçbiri)          → 'other'
//
//   İŞLETİM SİSTEMİ EKSENİ (bu sıra bozulmaz):
//     1. `Windows NT`                  → 'windows'
//     2. `iPhone` / `iPad` / `iOS`     → 'ios'    (⚠⚠ ÖLÇÜLDÜ, testle
//                                                   YAKALANDI — mobil Safari
//                                                   UA'sı `"like Mac OS X"`
//                                                   alt dizesini de İÇERİR
//                                                   [örn. "CPU iPhone OS
//                                                   18_1 like Mac OS X"];
//                                                   bu kontrol `Mac OS X`
//                                                   kontrolünden ÖNCE
//                                                   gelmezse her iPhone/iPad
//                                                   UA'sı SESSİZCE 'macos'
//                                                   döner — ilk yazımda TAM
//                                                   OLARAK bu hata vardı,
//                                                   `Safari / iOS (iPhone)`
//                                                   ve `(iPad)` testleri
//                                                   kırmızı çıkıp yakaladı)
//     3. `Macintosh` / `Mac OS X`      → 'macos'  (yalnızca iOS kontrolü
//                                                   eşleşmediyse — masaüstü
//                                                   Safari/Chrome UA'sı
//                                                   `iPhone`/`iPad`/`iOS`
//                                                   İÇERMEZ, bu dala düşer)
//     4. `Android`                     → 'android' (⚠ Android UA'sı `Linux`
//                                                     da İÇERİR — Linux
//                                                     kontrolünden ÖNCE
//                                                     gelmeli)
//     5. `Linux`                       → 'linux'   (yalnızca Android
//                                                     eşleşmediyse)
//     6. (hiçbiri)                     → 'other'
//
// BOŞ DİZE veya `null` → her iki eksende `'unknown'` (üst seviye kısayol,
// `resolveDeviceFamilies`'in ilk `if`'i). K5'in "yokluk `null` ile ifade
// edilir" kuralı burada GEÇERSİZDİR — `unknown` zaten VAR OLAN bir sözlük
// değeridir (bkz. `session-summary.schema.ts` satır 41-43, S4'ün yorumu).
//
// DOLU AMA HİÇBİR İMZAYLA EŞLEŞMEYEN dize (gerçek ama tanınmayan bir
// tarayıcı/İS adı, curl gibi bir CLI istemcisi, ya da anlamsız/çöp bir
// dize) → `'other'` — OS ekseni için bu kural yukarıda açıkça yazılı
// ("diğer → other"); tutarlılık için BROWSER ekseninde de AYNI kural
// uygulanır (her iki `resolve*Family` fonksiyonunun son `return`'ı).
// `unknown` yalnızca "UA başlığı YOK/BOŞ" durumunu ifade eder, "UA VAR ama
// tanıdığımız hiçbir aileye uymuyor" durumunu DEĞİL — bu ikisini AYNI
// değere eşlemek "API/CLI istemcisi panelde görünebilir, bu dalı birinci
// sınıf ele al" talimatıyla ÇELİŞİRdi (gerçekten boş bir UA ile gerçekten
// dolu ama tanınmayan bir UA aynı anlama gelmez).
//
// ⚠⚠ ÖLÇÜLMÜŞ ÇELİŞKİ — raporda ayrıca işaretlendi: görev talimatının
// "Test" bölümü `null`/`''`/"çöp dize"yi TEK bir madde olarak listeleyip
// üçünü de `unknown`/`unknown`'a bağlıyor; ama AYNI talimatın "OS ekseni"
// satırı dolu-ama-eşleşmeyen dizeler için AÇIKÇA `other` diyor, ve curl
// kararı da "`chrome` mi `other` mi" diye çerçevelenmiş (`unknown`
// SEÇENEK OLARAK verilmemiş). Üç kaynak (liste cümlesi, OS ekseni cümlesi,
// curl çerçevelemesi) birbiriyle tutarsız. Bu dosya DAHA SPESİFİK ve İKİ
// YERDE tekrarlanan kuralı ("diğer → other") temel aldı; test dosyası
// "çöp dize" durumunu `'other'/'other'` olarak assert eder ve bu seçimi
// AÇIKÇA gerekçelendirir — `null`/`''` ise ayrı ayrı `unknown`/`unknown`
// olarak test edilir.
//
// KARAR — `curl/8.7.1` → `{ browserFamily: 'other', osFamily: 'other' }`
// (curl bir TARAYICI AİLESİ değildir, hiçbir tarayıcı imzasıyla eşleşmez;
// UA dizesi hiçbir işletim sistemi imzası da taşımaz — DOLU-ama-eşleşmeyen
// kuralı HER İKİ eksende de `'other'` üretir, yukarıdaki çelişki notuyla
// AYNI gerekçe). S3'ün ölçtüğü 3 curl satırı bu dala düşer — gerçek bir
// durum, birinci sınıf ele alınır, `unknown` DEĞİL (UA başlığı BOŞ değil).
//
// KARAR — `HeadlessChrome/156.0.8078.4 ... Chrome/156.0.0.0` → 'chrome'
// (Chromium'un headless modu `Chrome/` imzasını AYNEN taşır — bu fonksiyon
// headless/headful ayrımı yapmaz, yalnızca motor ailesini sınıflandırır;
// ayrı bir 'headless' sınıfı açmak S4'ün 8 üyelik kapalı-dünya sözlüğünde
// YOK ve mevcut UA dizesindeki `Chrome/` imzası gerçek bir Chrome/Chromium
// motorunu doğru biçimde yansıtıyor).

// ⚠ Yalnızca TİP ithal edilir — bu dosyada `deviceBrowserSchema`/
// `deviceOsSchema`'nın çalışma zamanı değerine ihtiyaç YOK (dönüş değerleri
// doğrudan string literal'dir, `DeviceBrowserWire`/`DeviceOsWire` birleşimine
// yapısal olarak uyar). Şemaların `.options`'ı üzerinden üye sayısını türetme
// (S4'ün önerisi) TEST dosyasının işi — kapalı-dünya sözlükle senkronluğu
// orada doğrulanır.
import type { DeviceBrowserWire, DeviceOsWire } from '@arkesoft/trpc'

export interface DeviceFamilies {
  browserFamily: DeviceBrowserWire
  osFamily: DeviceOsWire
}

/**
 * Ham `User-Agent` başlığını iki kapalı-dünya tanımlayıcıya indirger.
 * SAF — I/O yok, ham dizeyi loglamaz/döndürmez.
 *
 * Sıra kuralları yukarıdaki dosya başlığı yorumunda yazılıdır; bu sıra
 * değiştirilirse etiketler SESSİZCE yanlış çıkar (bkz. test dosyasındaki
 * "vacuity" testleri).
 */
export function resolveDeviceFamilies(userAgent: string | null): DeviceFamilies {
  if (userAgent === null || userAgent.length === 0) {
    return { browserFamily: 'unknown', osFamily: 'unknown' }
  }

  return {
    browserFamily: resolveBrowserFamily(userAgent),
    osFamily: resolveOsFamily(userAgent),
  }
}

function resolveBrowserFamily(userAgent: string): DeviceBrowserWire {
  // Sıra bağlayıcı — dosya başlığı yorumu. Edge/Opera/Samsung, Chrome
  // imzasını da taşıdığı için Chrome'dan ÖNCE kontrol edilir.
  if (userAgent.includes('Edg/')) {
    return 'edge'
  }
  if (userAgent.includes('OPR/') || userAgent.includes('Opera')) {
    return 'opera'
  }
  if (userAgent.includes('SamsungBrowser/')) {
    return 'samsung'
  }
  if (userAgent.includes('Firefox/')) {
    return 'firefox'
  }
  if (userAgent.includes('Chrome/')) {
    return 'chrome'
  }
  if (userAgent.includes('Safari/')) {
    return 'safari'
  }
  return 'other'
}

function resolveOsFamily(userAgent: string): DeviceOsWire {
  // Sıra bağlayıcı — dosya başlığı yorumu. iOS kontrolü `Mac OS X`
  // kontrolünden ÖNCE gelir (mobil Safari UA'sı "like Mac OS X" içerir);
  // Android kontrolü `Linux` kontrolünden ÖNCE gelir (Android UA'sı
  // `Linux` da içerir).
  if (userAgent.includes('Windows NT')) {
    return 'windows'
  }
  if (userAgent.includes('iPhone') || userAgent.includes('iPad') || userAgent.includes('iOS')) {
    return 'ios'
  }
  if (userAgent.includes('Macintosh') || userAgent.includes('Mac OS X')) {
    return 'macos'
  }
  if (userAgent.includes('Android')) {
    return 'android'
  }
  if (userAgent.includes('Linux')) {
    return 'linux'
  }
  return 'other'
}
