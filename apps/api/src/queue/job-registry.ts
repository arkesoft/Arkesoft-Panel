// @arkesoft/api — İŞ KAYIT DEFTERİ (ROADMAP v0.0.11, T-013/S5, architect K4)
//
// ⚠⚠ BU DOSYA, `apps/api/src/queue/*.ts` İÇİNDE İŞ TÜRÜ ADININ GEÇTİĞİ TEK
// YERDİR. Kuyruk çekirdeği (`queue.module.ts`, `queue.service.ts`,
// `queue-lifecycle.service.ts`) bu diziyi GEZER; hiçbiri bir iş türünün
// adını bilmez, hiçbirinde türe özgü dallanma YOKTUR (CLAUDE.md §10 md 12).
// Denetim: `rg "if \(.*type ===" apps/api/src/queue/` → 0 eşleşme.
//
// İKİNCİ İŞ TÜRÜ = BİR SATIR: tanımı yaz, `JOB_DEFINITIONS` dizisine ekle.
// `QueueModule` o işin `Queue`'sunu + DLQ `Queue`'sunu, worker (T-013/S6)
// `Worker`'ını otomatik kurar. v0.0.11'de İKİNCİ İŞ TÜRÜ YOK (kapsam dışı) —
// istenen şey MEKANİZMA, ikinci kuyruk değil.
//
// ⚠ v0.0.11'in payload şeması: kiracı kurulum iskeleti EK ALAN TAŞIMAZ
// (R-A11 — gerçek kurulum adımları v0.2.0'ın darboğazı), bu yüzden taban
// şema DOĞRUDAN kullanılıyor. T-013/S6 handler'ı için ek alan gerekirse
// `jobPayloadBaseSchema.extend({...})` ile KENDİ şemasını kurar ve aşağıdaki
// `payloadSchema` satırını ona çevirir — tek satır, additive.

import type { JobDefinition } from './job-definition.js'
import type { JobPayloadBase } from './job-payload.base.js'
// T-013/S6 EKLEMESİ (tek satır, additive — yukarıdaki yorumun öngördüğü
// değişiklik): payload şeması artık iş paketinin KENDİ dosyasından geliyor
// (`jobs/tenant-provision/payload.schema.ts`), taban şemadan DOĞRUDAN değil.
// Değer v0.0.11'de AYNI (`jobPayloadBaseSchema`); kazanç, şeklin iş türünün
// handler'ının YANINDA tek kaynak olması — v0.2.0 ek alan eklediğinde bu
// dosya DEĞİŞMEZ.
//
// ⚠ BARREL (`jobs/tenant-provision/index.js`) DEĞİL, ŞEMA DOSYASI DOĞRUDAN:
// barrel handler'ı da dışa açıyor, yani onu import etmek HANDLER MODÜLÜNÜ
// ÜRETİCİNİN (API süreci) modül grafiğine SOKARDI. S5'in "kayıt defteri
// handler'ı import etmez" kararı (`job-definition.ts` dosya başı) tam olarak
// bunu engelliyor; barrel yalnızca TÜKETİCİ (worker) tarafının yüzeyidir.
import { tenantProvisionPayloadSchema } from './jobs/tenant-provision/payload.schema.js'
import { JOB_ATTEMPTS, TENANT_PROVISION_CONCURRENCY } from './queue-constants.js'

/**
 * Kiracı kurulum (provisioning) işi. v0.0.11'de İSKELET: adımlarını
 * loglayan, gerçek iş yapmayan pipeline (T-013/S6'nın handler'ı).
 *
 * Kuyruk adı = iş adı. DLQ adı `buildDlqQueueName()` ile türetilir — ikinci
 * bir literal YOK.
 */
export const TENANT_PROVISION_JOB: JobDefinition<JobPayloadBase> = {
  name: 'tenant.provision',
  payloadSchema: tenantProvisionPayloadSchema,
  concurrency: TENANT_PROVISION_CONCURRENCY,
  attempts: JOB_ATTEMPTS,
}

/**
 * Platformun TÜM iş türleri. `as const` + `readonly`: çalışma zamanında
 * kayıt defterine iş EKLENEMEZ (kuyruk topolojisi süreç ömrü boyunca
 * sabittir; dinamik kayıt, `QueueModule`'ün kurduğu `Queue` kümesiyle
 * kayıt defterini ayrıştırırdı).
 *
 * ⚠ Tip `readonly JobDefinition<JobPayloadBase>[]` DEĞİL, `as const`:
 * tüketiciler (T-013/S6) eleman tiplerini TEK TEK görebilsin.
 */
export const JOB_DEFINITIONS = [TENANT_PROVISION_JOB] as const
