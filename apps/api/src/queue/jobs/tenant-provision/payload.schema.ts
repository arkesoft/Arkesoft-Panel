// @arkesoft/api — `tenant.provision` payload şeması (ROADMAP v0.0.11,
// T-013/S6, architect K5 katman 1)
//
// ⚠ v0.0.11'DE EK ALAN YOK — bu BİLİNÇLİ ve kaynaklı (R-A11): gerçek kurulum
// adımları (doğrulama, seed, tema kurulumu, arama indeksi, DNS, SSL, smoke
// test) v0.2.0 kapsamındadır; bu sürümün işi adımlarını LOGLAYAN bir
// İSKELETtir. Bugün olmayan bir adımın parametresini şemaya eklemek, hangi
// alanların gerçekten gerektiğini TASARLANMADAN dayatırdı.
//
// NEDEN YİNE DE AYRI BİR DOSYA (taban şema doğrudan kullanılmıyor): iş
// türünün KABUL ETTİĞİ payload şekli, o işin handler'ının YANINDA durmak
// zorunda — handler payload'ı TÜKETEN taraftır ve ikisi birlikte evrilir.
// `job-registry.ts` bu şemayı REFERANSLA tüketir (tek satır), yani şeklin
// TEK kaynağı burasıdır. v0.2.0'da ek alan gerektiğinde değişiklik
// `jobPayloadBaseSchema.extend({ ... })` ile BU dosyada kalır; kayıt defteri
// ve sarmalayıcı DOKUNULMAZ.
//
// ⚠ `tenantId` ZORUNLULUĞU buradan DEĞİL, taban şemadan gelir
// (`job-payload.base.ts`) — K5 katman 1 ("`tenantId` taşımayan şemayla iş
// tanımı DERLENMEZ") bu dosyanın tabanı genişletmesiyle KORUNUR.

import { jobPayloadBaseSchema } from '../../job-payload.base.js'
import type { JobPayloadBase } from '../../job-payload.base.js'

/**
 * Kiracı kurulum işinin payload şeması. v0.0.11'de taban şemanın KENDİSİ
 * (`{ tenantId }`) — fazla anahtarları DÜŞÜRÜR (strip), yani çağıranın
 * yanlışlıkla geçirdiği bir alan ne JSONB'ye ne BullMQ'ya yazılır.
 */
export const tenantProvisionPayloadSchema = jobPayloadBaseSchema

/**
 * Handler'ın gördüğü payload tipi. `JobPayloadBase`'in TAKMA ADI değil
 * BAĞIMSIZ bir isim: v0.2.0 ek alan eklediğinde handler imzası
 * DEĞİŞMEYECEK, yalnızca bu tip genişleyecek.
 */
export type TenantProvisionPayload = JobPayloadBase
