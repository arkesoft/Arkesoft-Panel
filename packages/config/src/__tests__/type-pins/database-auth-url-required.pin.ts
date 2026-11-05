// @arkesoft/config — tip pin'i: `databaseAuthEnvSchema`'nın `DATABASE_AUTH_URL`
// alanının KOŞULSUZ ZORUNLU (`.optional()`/`.default()` DEĞİL) kaldığını
// derleme zamanında doğrular (ROADMAP v0.0.14.1, T-015 FIX turu 1, madde 3 —
// security S-5).
//
// SORUN (ölçülmüş, FIX turu 1 handoff'u): `architect`'in "KOŞULSUZ-ZORUNLU"
// kararı (`env.ts`, `databaseAuthEnvSchema` dosya başı yorumu) `DATABASE_AUTH_URL
// ?? DATABASE_URL` tarzı bir geri düşüşün `??`'nin SAĞ TARAFININ yapısal
// olarak ERİŞİLEMEZ olmasına dayanıyor — bu dayanak SADECE şema `.optional()`
// OLMADIĞI SÜRECE doğru. `env.ts`'e sessizce bir `.optional()` eklenirse
// (ör. "geliştirme kolaylığı" gerekçesiyle) `DATABASE_AUTH_URL` `undefined`
// olabilir hâle gelir, `??`'nin sağ tarafı YENİDEN erişilebilir olur ve
// R-PM4'ün kapattığı fail-open yolu SESSİZCE geri açılır — ama BUNU
// DENETLEYEN hiçbir mekanik kapı yoktu (dayanak PİNSİZ).
//
// Bu dosya ÇALIŞMA ZAMANI testi DEĞİLDİR — `.test.ts` ile BİTMİYOR, hiçbir
// vitest `include` deseni (bu paket şu an vitest ÇALIŞTIRMIYOR) bu dosyayı
// YAKALAMAZ. Kanıt TAMAMEN `pnpm typecheck`'in derlemesinden gelir —
// `packages/db/src/__tests__/type-pins/*.pin.ts` İLE AYNI, ÖNCEDEN VAR OLAN
// desen (bkz. o dosyaların dosya başı yorumu). `DATABASE_AUTH_URL` tipine
// `undefined` eklenirse (yani şema `.optional()` olursa) aşağıdaki
// `AssertUnconditionallyRequired` bir tuple tipine çözülür ve `true`
// literaline UYMAZ — `pnpm typecheck` TS2322 ile KIRMIZIYA döner.
//
// ⚠ KAPSAM SINIRI (dürüst not): bu pin YALNIZCA `.optional()` vektörünü
// (mevcut bulgunun BİREBİR atıfı) yakalar — `DATABASE_AUTH_URL` tipini
// DEĞİŞTİRMEYEN bir `.default('...')` eklemesi (Zod'da `.default()` sonrası
// ÇIKIŞ tipi hâlâ `string`'tir, `undefined` İÇERMEZ) bu pinin tip seviyesinde
// GÖRÜNMEZ bir alanıdır — mevcut bulgu/DoD bu vektörü istemiyor, repo
// genelinde `packages/db`'nin `.pin.ts` dosyaları da AYNI sınırı taşıyor.

import type { DatabaseAuthEnv } from '../../env.js'

/** `databaseAuthEnvSchema`'dan çıkarılan GERÇEK alan tipi (`z.infer`). */
type DatabaseAuthUrlType = DatabaseAuthEnv['DATABASE_AUTH_URL']

/** `.optional()` eklenirse `undefined` bu tipe DAHİL olur — İSTENMEYEN. */
type AllowsUndefined = undefined extends DatabaseAuthUrlType ? true : false

type AssertUnconditionallyRequired = AllowsUndefined extends false
  ? true
  : [
      'DATABASE_AUTH_URL ARTIK OPSİYONEL — R-PM4 fail-open yolu YENİDEN AÇILDI (S-5)',
      DatabaseAuthUrlType,
    ]

/**
 * ⚠ JENERİK PİN — `databaseAuthEnvSchema.shape.DATABASE_AUTH_URL` koşulsuz
 * zorunlu (`string`, `string | undefined` DEĞİL) kalmalıdır. Bu fonksiyon
 * hiçbir yerden çağrılmaz — varlığı DERLENMESİ yeterlidir.
 */
export function pinDatabaseAuthUrlIsUnconditionallyRequired(): {
  unconditionallyRequired: AssertUnconditionallyRequired
} {
  return { unconditionallyRequired: true }
}
