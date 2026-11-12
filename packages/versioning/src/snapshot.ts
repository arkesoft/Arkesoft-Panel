// @arkesoft/versioning — `TenantVersionState.previousState` anlık görüntü
// şeması (ROADMAP v0.0.21, T-018/S1, ADR-0020 Karar 1 + "Sürüm Politikası
// §5 — Rollback prosedürü")
//
// `ROADMAP.md` §5 madde 1: "Güncelleme öncesi `TenantVersionState.
// previousState` ... alınır." madde 2: "'Geri Al' tek işlemle: versiyon
// durumunu GERİ YAZ, ..." — yani bir anlık görüntü kiracının sürüm
// BİLEŞİMİNİN DÖRT alanının TAMAMINI taşımak ZORUNDADIR, yoksa "Geri Al"
// eksik bir duruma döner. Bu şema o DÖRT alanı pinler (AC-6 "YETERLİLİK
// PİNİ" — biri çıkarılırsa `__tests__/snapshot.test.ts` KIRMIZIYA döner).
//
// ⚠ `themeId` BİÇİMİ BU PAKETTE DOĞRULANMAZ (bilinçli, `z.string().min(1)`
// dışında bir kısıt YOK). Tek kaynak `packages/theme-sdk`'nın
// `THEME_ID_PATTERN`'ıdır (`manifest/manifest.ts:67`) ve bu paket oraya
// bağımlı OLAMAZ (ADR-0020 Karar 2'nin KATMANI tersine çevirirdi — döngü:
// theme-sdk zaten bu paketten semver desenini ithal ediyor). Deseni BURADA
// KOPYALAMAK, tam olarak AC-8b'nin yasakladığı "semver çekirdek deseninin
// ikinci kez tanımlanması" sapma SINIFININ `themeId` karşılığı olurdu —
// bu yüzden bilerek YAPILMADI.
//
// ⚠ `z.strictObject` BİLİNÇLİ — bilinmeyen anahtar REDDEDİLİR. Bu, ölçülmüş
// SEC-9 sınıfına (prototip kirlenmesi — ör. `"__proto__"` gibi bir anahtarın
// JSONB'den okunup bir nesneye sessizce karışması) karşı YAPISAL bir
// savunmadır; `TenantVersionState.previousState` bir JSONB kolonundan
// okunur ve CLAUDE.md §4 "JSONB kolonları okunurken Zod ile parse edilir"
// kuralının bu paketteki karşılığıdır.

import { z } from 'zod'

import { SEMVER_FORMAT_PATTERN } from './semver.js'

/**
 * Bir kiracının sürüm bileşiminin anlık görüntüsü — dört alan, Sürüm
 * Politikası §5'in "Geri Al" akışının GERİ YAZACAĞI tam küme (dosya başı
 * notu, AC-6).
 */
export const TENANT_VERSION_SNAPSHOT_SCHEMA = z.strictObject({
  platformVersion: z.string().regex(SEMVER_FORMAT_PATTERN),
  // ⚠ themeId biçimi burada DOĞRULANMAZ — dosya başı notu.
  themeId: z.string().min(1),
  themeVersion: z.string().regex(SEMVER_FORMAT_PATTERN),
  apiVersion: z.string().regex(SEMVER_FORMAT_PATTERN),
})

export type TenantVersionSnapshot = z.infer<typeof TENANT_VERSION_SNAPSHOT_SCHEMA>
