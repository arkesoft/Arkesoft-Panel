// @arkesoft/trpc — izin kullanım kaydı (ROADMAP v0.0.14, T-014/S2, architect
// K-A8 ayak (b) ve (c))
//
// AC3'ün İKİ ayağının MEKANİK dayanağı burada durur. Kayıt, bir prosedürün
// hangi izinle kapılandığını BEYANDAN değil, `permissionProcedure(...)`
// çağrısının KENDİSİNDEN öğrenir:
//
//   (b) ÖLÜ İZİN YOK — `PERMISSIONS` \ kaydedilen izinler = ∅. Kataloğa
//       tüketicisi olmayan bir izin eklemek testi KIRMIZIYA düşürür.
//   (c) KAPALI DÜNYA — `PROCEDURE_SURFACE`'ın `kind: 'permission'` kayıt
//       SAYISI ile buradaki kayıt sayısı EŞİT olmak zorundadır. Bir prosedürü
//       izinli builder'dan izinsiz bir builder'a İNDİRMEK kayıt sayısını
//       düşürür → sapma → kırmızı. Tablonun kendisi bu sapmayı göremezdi
//       (tablo bir beyandır); sayım onu GÖZLEMLENEBİLİR yapar.
//
// ⚠ KAYIT ÇAĞRI ZAMANI: `recordPermissionUsage` çağrısı `permissionProcedure`
// FABRİKASI içinde, yani MODÜL DEĞERLENDİRME anında (router dosyaları
// yüklenirken) bir kez yapılır — istek başına DEĞİL. Kayıt bu yüzden "kaç
// prosedür bu izinle kapılandı" sorusunu yanıtlar, "kaç istek geldi"
// sorusunu YANITLAMAZ; sıcak yolda hiçbir maliyeti yoktur.
//
// ⚠⚠ TESTLER İÇİN BAĞLAYICI KISIT (bu kaydın bilinen tek kırılganlığı,
// raporda yazılı): kaydı OKUYAN test dosyası `permissionProcedure(...)`'ü
// KENDİSİ ÇAĞIRMAMALIDIR — çağırırsa üretim kayıtlarının yanına bir kayıt daha
// ekler ve (c) ayağının sayım assert'i YANLIŞ POZİTİF verir. Vitest her test
// dosyasını AYRI modül grafiğinde koşturduğu için (varsayılan izolasyon) bu
// kısıt DOSYA BAŞINADIR: izin middleware'inin DAVRANIŞINI sınayan testler
// ayrı bir dosyada yaşar (`permission-procedure.test.ts`), tutarlılık
// testinde (`authz-consistency.test.ts`) yalnızca ÜRETİM kayıtları bulunur.
// Sapma durumunda kapı GÜRÜLTÜLÜ kırılır (sessizce geçmez) — fail-closed.

import type { Permission } from './permissions.js'

const recordedUsages: Permission[] = []

/**
 * `permissionProcedure(permission)` fabrikasının çağırdığı tek kayıt noktası.
 * Her çağrı bir KAYIT üretir; aynı izin birden çok prosedürü kapılıyorsa o
 * izin birden çok kez kaydedilir (sayım (c) ayağı için ANLAMLI olmak zorunda,
 * bu yüzden küme DEĞİL dizi).
 */
export function recordPermissionUsage(permission: Permission): void {
  recordedUsages.push(permission)
}

/**
 * Kaydedilmiş izin kullanımlarının SIRALI listesi (çoğaltmalar KORUNUR).
 *
 * Çağıran, kaydın dolu olmasını istiyorsa prosedür tanımlarını taşıyan modül
 * grafiğini (`appRouter`) ÖNCE import etmek zorundadır — kayıt modül
 * değerlendirme yan etkisidir, tembel bir tarama değil.
 */
export function listRecordedPermissionUsages(): readonly Permission[] {
  return recordedUsages
}
