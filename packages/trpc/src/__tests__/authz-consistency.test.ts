// @arkesoft/trpc — AC3: izin kataloğu ↔ çağrı yerleri tutarlılığı, ÜÇ AYAK
// (ROADMAP v0.0.14, T-014/S2, architect K-A8, pm S4)
//
// ⚠⚠ BU DOSYA `permissionProcedure`'Ü ÇAĞIRMAZ ve ÇAĞIRMAMALIDIR. Gerekçe
// `../authz/permission-usage.ts`'in dosya başında yazılı: kayıt modül
// değerlendirme yan etkisidir, bu dosyada bir çağrı ÜRETİM kayıtlarının
// yanına fazladan kayıt ekler ve (c) ayağının çoğul-küme assert'ini YANLIŞ
// POZİTİFE düşürür. Vitest her test dosyasını ayrı modül grafiğinde
// koşturduğu için kısıt DOSYA BAŞINADIR; izin kapısının DAVRANIŞ testleri
// `member-procedures.test.ts`'te yaşar.
//
// ÜÇ AYAK (architect K-A8):
//   (a) çağrı yeri ⊂ katalog     → BİRİNCİL mekanizma `tsc` (parametre tipi
//       `Permission`); buradaki assert İKİNCİ savunma hattıdır.
//   (b) ölü izin yok             → `PERMISSIONS` \ kaydedilen = ∅
//   (c) KAPALI DÜNYA             → `PROCEDURE_SURFACE` ↔ router envanteri küme
//       eşitliği + izinli kayıtların ÇOĞUL KÜMESİ = izin kullanım kaydı
//
// ⚠ (c) ayağı olmadan (a) ve (b) "YENİ EKLENEN BİR PROSEDÜRÜN İZİNSİZ
// OLMASINI" GÖREMEZ — ikisi de yalnızca izinli prosedürlere bakar. Bu dosyanın
// en değerli assert'i o kör noktayı kapatandır.

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { PERMISSIONS } from '../authz/permissions.js'
import { listRecordedPermissionUsages } from '../authz/permission-usage.js'
import { PROCEDURE_SURFACE } from '../authz/procedure-surface.js'
import type { ProcedureOperation } from '../authz/procedure-surface.js'
import { appRouter } from '../routers/app.router.js'

// ---------------------------------------------------------------------------
// Router envanteri — A-A2'nin ÖLÇÜLMÜŞ cevabı
// ---------------------------------------------------------------------------
//
// A-A2 "varsayım olarak kabul edilmeyecek, ölçülecek" diye işaretlendi. ÖLÇÜM
// SONUCU: `@trpc/server@11.19.0`'ın `appRouter._def.procedures` alanı, kayıt
// anahtarları NOKTALI TAM YOL (`namespace.action`) olan DÜZ bir nesnedir ve
// her değer `_def.type` alanında `'query'`/`'mutation'` taşır. Birincil yol
// (iç API + Zod parse) bu yüzden KULLANILABİLİR — grep yedeğine DÜŞÜLMEDİ.
//
// ⚠ İç API'ye dayanmanın bedeli AÇIKÇA ödeniyor: okunan şekil Zod ile PARSE
// edilir, bu yüzden bir tRPC yükseltmesi alanı kaldırırsa/yeniden adlandırırsa
// bu dosya GÜRÜLTÜLÜ kırılır (sessizce boş envanter üretip assert'leri
// vacuous yapmaz). İç API yalnızca TESTTE kullanılır — üretim kodu `_def`
// okumaz.
//
// ⚠ `z.object()` BURADA KULLANILAMAZ: prosedür kayıtlarının değerleri
// FONKSİYONDUR (`typeof === 'function'`) ve Zod'un nesne ayrıştırıcısı
// fonksiyonu nesne saymaz. Bu yüzden kayıt `z.record(z.string(), z.unknown())`
// ile ayrıştırılır, `_def.type` ise güvenli daraltmayla okunup AYRI bir şemayla
// doğrulanır.

const procedureRecordSchema = z.record(z.string(), z.unknown())
const procedureOperationSchema = z.enum(['query', 'mutation'])

/**
 * `value`'nun `key` adlı özelliğini taşıdığını daraltır — `any`/`as` YOK
 * (`harness.ts`'teki `hasProperty`'nin aynısı, FONKSİYON değerlerini de kabul
 * edecek biçimde genişletilmiş: tRPC'nin prosedür kayıtları fonksiyondur).
 * Spread/`Reflect.get` KULLANILMAZ: ilki ENUMERABLE olmayan bir alanı
 * sessizce kaybeder, ikincisi `any` döndürür.
 */
function hasProperty<Key extends string>(value: unknown, key: Key): value is Record<Key, unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') && value !== null && key in value
  )
}

/** `value[key]`'i `unknown` olarak okur; yoksa `undefined`. */
function readProperty(value: unknown, key: string): unknown {
  return hasProperty(value, key) ? value[key] : undefined
}

/** Router'ın GERÇEK prosedür envanteri: noktalı tam yol → işlem türü. */
function readRouterInventory(): ReadonlyMap<string, ProcedureOperation> {
  // ⚠ `appRouter._def` TİPLİ erişimle de okunabilirdi; bilerek `unknown`
  // üzerinden okunuyor ki iç API'nin şekli DEĞİŞTİĞİNDE kırılma yeri tek ve
  // AÇIK olsun (Zod'un `parse`'ı) — tip sisteminin sessiz bir `unknown`
  // genişlemesine değil.
  const procedures = procedureRecordSchema.parse(
    readProperty(readProperty(appRouter, '_def'), 'procedures'),
  )
  const inventory = new Map<string, ProcedureOperation>()

  for (const [path, procedure] of Object.entries(procedures)) {
    const operation = procedureOperationSchema.parse(
      readProperty(readProperty(procedure, '_def'), 'type'),
    )
    inventory.set(path, operation)
  }

  return inventory
}

/**
 * `PROCEDURE_SURFACE`'ın izinle kapılanan girdilerinin izin adları
 * (çoğaltmalar KORUNUR — çoğul küme karşılaştırması için gerekli).
 *
 * `flatMap` + ternary kullanılır, `filter(...).map(...)` DEĞİL: ikincisi
 * ayrımlı birleşimi DARALTMAZ ve `entry.permission` erişimi derlenmezdi
 * (tip predicate'i yazmak ikinci bir doğruluk kaynağı olurdu).
 */
function declaredPermissions(): readonly string[] {
  return Object.values(PROCEDURE_SURFACE).flatMap((entry) =>
    entry.builder === 'permission' ? [entry.permission] : [],
  )
}

describe('A-A2 — envanter kaynağının kendisi (ölçüm, varsayım değil)', () => {
  it('router envanteri BOŞ DEĞİL ve yol/işlem çiftlerini LİTERAL beklentiyle birebir verir', () => {
    // ⚠ VACUOUS OLMAMA KANITI: aşağıdaki tüm ayaklar bu envantere dayanıyor.
    // Envanter boş dönerse küme eşitliği assert'leri "boş küme = boş küme"
    // diye YEŞİL yanardı. Bu yüzden envanter LİTERAL olarak sabitlenir.
    const inventory = readRouterInventory()

    expect([...inventory.entries()].sort()).toEqual([
      ['job.get', 'query'],
      ['job.list', 'query'],
      ['member.acceptInvitation', 'mutation'],
      ['member.invite', 'mutation'],
      ['member.remove', 'mutation'],
      ['member.updateRole', 'mutation'],
      ['session.list', 'query'],
      ['session.me', 'query'],
      ['storefront.currentTenant', 'query'],
      ['tenant.current', 'query'],
      ['tenant.updateSecurityPolicy', 'mutation'],
    ])
  })

  it('izin kullanım kaydı BOŞ DEĞİL (ayak (b) ve (c) bu kayıt üzerinde çalışıyor)', () => {
    // İkinci VACUOUS OLMAMA kanıtı: kayıt boşsa (b)'nin küme çıkarması ve
    // (c)'nin çoğul-küme karşılaştırması anlamsızlaşır.
    expect(listRecordedPermissionUsages().length).toBeGreaterThan(0)
  })
})

describe('AC3 ayak (a) — her çağrı yeri KATALOGDA var olan bir izin veriyor', () => {
  it('PROCEDURE_SURFACE içindeki her izin adı katalogdadır (ikinci savunma hattı; birincil mekanizma tsc)', () => {
    const catalog: readonly string[] = PERMISSIONS

    expect(declaredPermissions().length).toBeGreaterThan(0)
    for (const permission of declaredPermissions()) {
      expect(catalog).toContain(permission)
    }
  })

  it('kaydedilen her izin de katalogdadır (çalışma zamanı tarafı)', () => {
    const catalog: readonly string[] = PERMISSIONS

    for (const permission of listRecordedPermissionUsages()) {
      expect(catalog).toContain(permission)
    }
  })
})

describe('AC3 ayak (b) — ölü izin YOK', () => {
  it('PERMISSIONS \\ kaydedilen izinler = ∅ (kataloğa tüketicisi olmayan izin eklenemez)', () => {
    const used = new Set<string>(listRecordedPermissionUsages())
    const dead = PERMISSIONS.filter((permission) => !used.has(permission))

    expect(dead).toEqual([])
  })

  it('iki yönlü: kaydedilen izin kümesi = katalog kümesi (fazla/eksik ikisi de kırmızı)', () => {
    expect([...new Set(listRecordedPermissionUsages())].sort()).toEqual([...PERMISSIONS].sort())
  })
})

describe('AC3 ayak (c) — KAPALI DÜNYA: beyan edilen yüzey = gerçek yüzey', () => {
  it('yol kümeleri BİREBİR eşit — tabloyu güncellemeden prosedür eklemek KIRMIZIDIR', () => {
    const inventory = readRouterInventory()

    expect([...inventory.keys()].sort()).toEqual(Object.keys(PROCEDURE_SURFACE).sort())
  })

  it('kayıt sayıları eşit ve ON BİR (tablonun boş olmadığının kanıtı; ROADMAP v0.0.15.1, T-017/S4)', () => {
    const inventory = readRouterInventory()

    expect(Object.keys(PROCEDURE_SURFACE).length).toBe(11)
    expect(inventory.size).toBe(Object.keys(PROCEDURE_SURFACE).length)
  })

  it("her yolun beyan edilen `operation` değeri router'ın KENDİ kaydıyla eşleşiyor (beyan değil, ölçüm)", () => {
    const inventory = readRouterInventory()

    for (const [path, entry] of Object.entries(PROCEDURE_SURFACE)) {
      expect(inventory.get(path)).toBe(entry.operation)
    }
  })

  it("izinli kayıtların ÇOĞUL KÜMESİ = izin kullanım kaydı — bir prosedürü izinsiz builder'a İNDİRMEK sapma üretir", () => {
    // ⚠⚠ (c) ayağının EN DEĞERLİ assert'i. Çoğul küme (sıralı dizi)
    // karşılaştırılır, yalnızca SAYI değil: bu biçim hem "izinli prosedür
    // sayısı düştü" (builder indirgemesi) hem de "tablodaki izin adı
    // değişti" sapmasını yakalar.
    expect([...listRecordedPermissionUsages()].sort()).toEqual([...declaredPermissions()].sort())
  })

  it('altı prosedür izinle kapılıdır (sayı LİTERAL — assert boş küme üzerinde yeşil yanmıyor; ROADMAP v0.0.15, T-016/S7)', () => {
    expect(declaredPermissions().length).toBe(6)
    expect(listRecordedPermissionUsages().length).toBe(6)
  })

  it('izinsiz beyan edilen yollar TAM OLARAK bilinen BEŞ istisnadır (builder beyanı inceleme görünürlüğü; ROADMAP v0.0.15.1, T-017/S4 — session.list EKLENDİ)', () => {
    // ⚠ TABLONUN KAPATAMADIĞI DELİK BURADA GÖRÜNÜR OLUR: bir prosedürü
    // `builder: 'tenant'` diye BİLEREK beyan etmek mekanik olarak
    // yakalanamaz. Bu assert o beyanı bir KARDİNALİTE + AD listesine bağlar:
    // izinsiz bir yol eklemek/çıkarmak bu satırı elle değiştirmeyi
    // ZORUNLU kılar (`apps/api`'deki kiracı-muaf yol listesinin kardinalite
    // assertion'ıyla aynı sınıf mekanizma). `toContain`'e DÜŞÜRÜLEMEZ.
    const ungated = Object.entries(PROCEDURE_SURFACE)
      .filter(([, entry]) => entry.builder !== 'permission')
      .map(([path, entry]) => [path, entry.builder])

    expect(ungated.sort()).toEqual([
      ['member.acceptInvitation', 'protected'],
      ['session.list', 'protected'],
      ['session.me', 'protected'],
      ['storefront.currentTenant', 'publicTenant'],
      ['tenant.current', 'tenant'],
    ])
  })
})
