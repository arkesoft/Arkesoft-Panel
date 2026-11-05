// @arkesoft/trpc — izin kataloğu ve rol sözlüğü değişmezleri (ROADMAP v0.0.14,
// T-014/S2, architect K-A4)
//
// Bu dosya KATALOĞUN KENDİSİNİ ölçer; prosedür yüzeyiyle tutarlılık ayrı
// dosyadadır (`authz-consistency.test.ts`). ⚠ Bu dosya `permissionProcedure`'ü
// ÇAĞIRMAZ — izin kullanım kaydını kirletmemek bağlayıcı bir kısıttır
// (`../authz/permission-usage.ts`'in dosya başı yorumu).
//
// ⚠ TOTOLOJİ KARŞITLIĞI: beklenen değerler LİTERAL yazılır, kataloğun
// kendisinden TÜRETİLMEZ. `PERMISSIONS`'tan türetilmiş bir beklenti, kataloğa
// bir izin eklendiğinde KENDİSİ de değişir ve test hiçbir şey ölçmez.

import { describe, expect, it } from 'vitest'

import { PERMISSIONS, ROLE_PERMISSIONS } from '../authz/permissions.js'
import { invitableRoleSchema, tenantRoleSchema } from '../schemas/member.schema.js'

describe('izin kataloğu (PERMISSIONS)', () => {
  it('TAM OLARAK iki izin içerir — A-PM2 bağlayıcı (ölü izin yazılmaz)', () => {
    // ⚠ Küme EŞİTLİĞİ, `toContain` DEĞİL: `toContain` fazladan (ölü) bir izni
    // GÖRMEZ ve AC3(b) tam olarak onu yasaklıyor.
    expect([...PERMISSIONS]).toEqual(['job:read', 'member:write'])
    expect(PERMISSIONS.length).toBe(2)
  })

  it('var olmayan uçların izinlerini İÇERMEZ (ROADMAP metnindeki adlar ÖRNEKTİR, teslim listesi değil)', () => {
    // Yakın-kaçırma verisi: bu üç ad ROADMAP v0.0.14 kapsam metninde GEÇİYOR
    // ama bu sürümde tüketicisi olan bir uç YOK. Eklenirlerse AC3(b) ayağı da
    // kırılır; bu satırlar o kırılmayı ADIYLA raporlar.
    const names: readonly string[] = PERMISSIONS

    expect(names).not.toContain('product:write')
    expect(names).not.toContain('order:read')
    expect(names).not.toContain('theme:publish')
    // Okuma prosedürü olmadığı için üye OKUMA izni de YOK (ince taneleme
    // architect tarafından reddedildi — üç yazma ucunun yetki sınıfı aynı).
    expect(names).not.toContain('member:read')
    expect(names).not.toContain('member:invite')
  })
})

describe('rol sözlüğü (tenantRoleSchema)', () => {
  it('BEŞ rol içerir ve kümesi LİTERAL beklentiyle birebir eşleşir', () => {
    expect(tenantRoleSchema.options).toEqual(['owner', 'admin', 'staff', 'support', 'readonly'])
  })

  it('platform yetkisi bir KİRACI ÜYELİĞİ değildir — sözlükte platform rolü YOK (R2, v0.0.20)', () => {
    const roles: readonly string[] = tenantRoleSchema.options

    expect(roles).not.toContain('platform_admin')
  })
})

describe('invitableRoleSchema — owner YAPISAL olarak dışarıda (architect K-A4)', () => {
  it("'owner' REDDEDİLİR", () => {
    expect(invitableRoleSchema.safeParse('owner').success).toBe(false)
  })

  it('diğer DÖRT rolün DÖRDÜ DE kabul edilir (red vacuous değil — şema "her şeyi reddeden" bir şema DEĞİL)', () => {
    // ⚠ Bu, yukarıdaki reddin VACUOUS OLMADIĞININ kanıtıdır: şema hiçbir şeyi
    // kabul etmiyor olsaydı ilk assert de geçerdi.
    for (const role of ['admin', 'staff', 'support', 'readonly'] as const) {
      expect(invitableRoleSchema.safeParse(role)).toEqual({ success: true, data: role })
    }
  })

  it('tam rol sözlüğünden TÜRETİLMİŞTİR — iki listenin sapması imkânsız', () => {
    // Küme eşitliği: davet edilebilir roller = tüm roller eksi `owner`.
    expect(invitableRoleSchema.options).toEqual(
      tenantRoleSchema.options.filter((role) => role !== 'owner'),
    )
  })
})

describe('ROLE_PERMISSIONS — TOTAL eşleme (fail-closed)', () => {
  it('anahtar kümesi rol sözlüğüyle BİREBİR aynı (eksik anahtar DERLENMEZ, fazla anahtar burada yakalanır)', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...tenantRoleSchema.options].sort())
  })

  it("'job:read' BEŞ ROLÜN BEŞİNDE DE açıktır — architect K-A13, semver kararı", () => {
    // ⚠ Bu assert bir ÜSLUP tercihi değil: bir rolden `job:read`'i almak
    // MEVCUT BİR YETENEĞİ KALDIRMAKTIR → sürüm etkisi MAJOR'a kayar, oysa bu
    // sürüm MINOR ve sözleşme snapshot kapısı (v0.0.22) henüz YOK.
    for (const role of tenantRoleSchema.options) {
      expect(ROLE_PERMISSIONS[role]).toContain('job:read')
    }
    // Sayı da sabitlenir: beş rolün beşi (döngünün boş küme üzerinde
    // yeşil yanmadığının kanıtı — vacuous DEĞİL).
    expect(tenantRoleSchema.options.length).toBe(5)
  })

  it("'member:write' YALNIZCA owner ve admin'de — readonly/support/staff yazma ucuna 403 alır", () => {
    const rolesWithMemberWrite = tenantRoleSchema.options.filter((role) =>
      ROLE_PERMISSIONS[role].includes('member:write'),
    )

    expect(rolesWithMemberWrite).toEqual(['owner', 'admin'])
  })

  it('her rolün izin listesi TAM olarak beklenen literal kümedir (şişme/daralma yakalanır)', () => {
    // Rol BAŞINA tam eşitlik — yukarıdaki iki assert'in birleşimi bir alanı
    // kaçırabilirdi (ör. `staff`'a `member:write` eklenmesi ilk assert'ten
    // geçerdi).
    expect(ROLE_PERMISSIONS).toEqual({
      owner: ['job:read', 'member:write'],
      admin: ['job:read', 'member:write'],
      staff: ['job:read'],
      support: ['job:read'],
      readonly: ['job:read'],
    })
  })
})
