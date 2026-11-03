// @arkesoft/api — `tenant.provision` iş paketinin TEK giriş noktası
// (ROADMAP v0.0.11, T-013/S6)
//
// İş paketinin TÜKETİCİ (worker) tarafına dönük yüzeyi BU dosyadır: worker
// modülü handler'ı buradan alır, iç dosya yerleşimine (ör. v0.2.0'da
// adımların ayrı dosyalara bölünmesi) bağımlı olmaz.
//
// ⚠ TEK İSTİSNA, GEREKÇELİ: `job-registry.ts` (ÜRETİCİ tarafı) şemayı
// `payload.schema.js`'ten DOĞRUDAN import eder, bu barrel'dan DEĞİL — barrel
// handler'ı da dışa açtığı için onu import etmek handler modülünü API
// sürecinin modül grafiğine sokardı. S5'in "kayıt defteri handler'ı import
// etmez" kararı (`job-definition.ts` dosya başı) bunu yasaklıyor.
//
// ⚠ BURADA `RunnableJobDefinition` KURULMAZ: tanım ↔ handler eşleşmesi
// `queue-worker.module.ts`'teki TEK `registerJobRunner()` çağrısında yapılır,
// çünkü tanımın KENDİSİ (kayıt defterindeki nesne) üretici tarafında yaşıyor
// ve worker'ın onun KOPYASINI üretmemesi gerekiyor (tamlık kapısı nesne
// kimliğini doğruluyor).

export { tenantProvisionHandler, TENANT_PROVISION_STEPS } from './handler.js'
export type { TenantProvisionStep } from './handler.js'
export { tenantProvisionPayloadSchema } from './payload.schema.js'
export type { TenantProvisionPayload } from './payload.schema.js'
