// @arkesoft/theme-sdk — `migrateThemeSettings` birim testleri (ROADMAP
// v0.0.9, T-010/S6, AC9 + mutasyonsuzluk + sessiz başarısızlık İKİNCİ KATMAN)
//
// Desen `../settings/__tests__/validate-settings.test.ts`'ten (S3) BİREBİR
// alınmıştır: prototip kirliliği iddiası İKİ assertion'la kanıtlanır —
// ikincisi olmadan birincisi YANLIŞ NEDENLE geçebilir (dosya başı yorumu,
// `migrations/run.ts`).

import { describe, expect, it } from 'vitest'

import { ThemeContractError } from '../errors.js'
import type { ThemeSettingDefinition } from '../settings/primitives.js'
import type { ThemeSettingsMigration } from '../migrations/chain.js'
import { migrateThemeSettings } from '../migrations/run.js'

/** `migrateThemeSettings`'in BAŞARISIZLIK dalının `cause` taşıyıp taşımadığını DARALTAN tip koruyucu — `as` KULLANMAZ (CLAUDE.md §2, generate-contract-schema.ts'in `isThemeContractJsonSchemaModule` desenini izler). */
function hasCause(value: unknown): value is { cause: unknown } {
  return typeof value === 'object' && value !== null && 'cause' in value
}

const PRIMARY_COLOR_DEFINITIONS: readonly ThemeSettingDefinition[] = [
  { key: 'primaryColor', type: 'color', label: 'Ana renk', default: '#000000' },
]

describe('migrateThemeSettings — pozitif durum', () => {
  it('tek adımlı zincir ayarı doğru taşır', () => {
    const migrations: readonly ThemeSettingsMigration[] = [
      {
        from: '1.0.0',
        to: '1.1.0',
        migrate: (value: unknown) => ({
          ...(value as Record<string, unknown>),
          primaryColor: '#222222',
        }),
      },
    ]

    const result = migrateThemeSettings(migrations, '1.0.0', PRIMARY_COLOR_DEFINITIONS, {
      primaryColor: '#111111',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('beklenmeyen başarısızlık')
    }
    expect(result.value).toEqual({ primaryColor: '#222222' })
  })

  it('çok adımlı zincir (1.0.0 → 1.1.0 → 2.0.0) ayarları sırayla doğru taşır', () => {
    const definitions: readonly ThemeSettingDefinition[] = [
      { key: 'primaryColor', type: 'color', label: 'Ana renk', default: '#000000' },
      { key: 'secondaryColor', type: 'color', label: 'İkincil renk', default: '#000000' },
      { key: 'tertiaryColor', type: 'color', label: 'Üçüncül renk', default: '#000000' },
    ]

    const migrations: readonly ThemeSettingsMigration[] = [
      {
        from: '1.0.0',
        to: '1.1.0',
        migrate: (value: unknown) => ({
          ...(value as Record<string, unknown>),
          secondaryColor: '#222222',
        }),
      },
      {
        from: '1.1.0',
        to: '2.0.0',
        migrate: (value: unknown) => ({
          ...(value as Record<string, unknown>),
          tertiaryColor: '#333333',
        }),
      },
    ]

    const result = migrateThemeSettings(migrations, '1.0.0', definitions, {
      primaryColor: '#111111',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('beklenmeyen başarısızlık')
    }
    expect(result.value).toEqual({
      primaryColor: '#111111',
      secondaryColor: '#222222',
      tertiaryColor: '#333333',
    })
  })

  it('fromVersion zincirin hiçbir from ile eşleşmiyorsa (migration gerekmez) ayar doğrudan hedef şemadan geçirilir', () => {
    const migrations: readonly ThemeSettingsMigration[] = [
      { from: '1.0.0', to: '1.1.0', migrate: (value: unknown) => value },
    ]

    const result = migrateThemeSettings(migrations, '1.1.0', PRIMARY_COLOR_DEFINITIONS, {
      primaryColor: '#111111',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('beklenmeyen başarısızlık')
    }
    expect(result.value).toEqual({ primaryColor: '#111111' })
  })
})

describe('migrateThemeSettings — AC9: migrate() çıktısı hedef şemadan geçmezse THEME_MIGRATION_RESULT_INVALID', () => {
  it('geçersiz renk biçimi döndüren migrate() sonrası path+code doğru raporlanır', () => {
    const migrations: readonly ThemeSettingsMigration[] = [
      {
        from: '1.0.0',
        to: '2.0.0',
        migrate: () => ({ primaryColor: 'bu-bir-hex-renk-degil' }),
      },
    ]

    const result = migrateThemeSettings(migrations, '1.0.0', PRIMARY_COLOR_DEFINITIONS, {
      primaryColor: '#111111',
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.code).toBe('THEME_MIGRATION_RESULT_INVALID')
    expect(result.issues[0]?.path).toBe('primaryColor')
  })
})

describe('migrateThemeSettings — migrate() fırlatırsa hata yutulmaz, THEME_MIGRATION_RESULT_INVALID ile sarmalanır', () => {
  it('migrate() bir hata fırlattığında issue listesiyle ok:false döner (catch {} yasak — sarmalama kanıtı)', () => {
    const migrations: readonly ThemeSettingsMigration[] = [
      {
        from: '1.0.0',
        to: '1.1.0',
        migrate: () => {
          throw new Error('sağlayıcıya özgü beklenmeyen çalışma zamanı hatası')
        },
      },
    ]

    const result = migrateThemeSettings(migrations, '1.0.0', PRIMARY_COLOR_DEFINITIONS, {
      primaryColor: '#111111',
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.code).toBe('THEME_MIGRATION_RESULT_INVALID')
    expect(result.issues[0]?.path).toBe('migrations[0].migrate')
  })

  // ⚠ B3 ZORUNLU KANIT (T-010 düzeltme turu 1/3 · parti B) — İKİ assertion
  // BİRLİKTE: (1) sır hijyeni — fırlatılan hatanın ham metni (potansiyel bir
  // sır, ör. bir bağlantı dizesi) `issue.message`'a HİÇBİR ZAMAN enterpole
  // EDİLMEZ, `message` HER ZAMAN genel-geçer sabittir. (2) ayıklanabilirlik —
  // `cause` KAYBEDİLMEZ, `result.cause` ÜZERİNDEN (bir `ThemeContractError`,
  // onun KENDİ native `Error.cause`'u orijinal hatayı taşır) erişilebilir.
  //
  // ⚠ F3 GENİŞLETMESİ (T-010 düzeltme turu 2/3, qa'nın test boşluğu bulgusu)
  // — bu test ÖNCEDEN yalnızca `JSON.stringify(result.issues)` ölçüyordu,
  // `cause`'u TAŞIYAN TAM `result` nesnesini ASLA — `cause` ÖNCEDEN
  // enumerable olduğu için `apps/api`'nin CLAUDE.md §4 gereği loglayacağı
  // GERÇEK nesne (`JSON.stringify(result)`) bu testin ÖLÇMEDİĞİ bir kanaldan
  // sızabiliyordu (`Error` örnekleri İÇİN bu sızıntı GÖRÜNMEZDİ — `message`/
  // `stack` varsayılan OLARAK non-enumerable'dır — bu yüzden bu test TEK
  // BAŞINA F3'ü YAKALAYAMAZDI; aşağıdaki iki test, bir `Error` OLMAYAN
  // fırlatmalarla — dize ve düz nesne — AYNI kanalı AÇIKÇA ölçer).
  it("migrate() fırlattığında ham hata metni (sır OLABİLİR) message'a sızmaz, AMA cause erişilebilir kalır", () => {
    const secretLeakingError = new Error('GIZLI: db://user:pass@host')
    const migrations: readonly ThemeSettingsMigration[] = [
      {
        from: '1.0.0',
        to: '1.1.0',
        migrate: () => {
          throw secretLeakingError
        },
      },
    ]

    const result = migrateThemeSettings(migrations, '1.0.0', PRIMARY_COLOR_DEFINITIONS, {
      primaryColor: '#111111',
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }

    // (1) Sır hijyeni — serileştirilmiş TÜM issue listesinde "GIZLI" metni YOK.
    const serializedIssues = JSON.stringify(result.issues)
    expect(serializedIssues).not.toContain('GIZLI')
    expect(serializedIssues).not.toContain('db://user:pass@host')

    // ⚠ F3 — serileştirilmiş TAM `result` nesnesinde (apps/api'nin GERÇEKTE
    // logladığı şey) de "GIZLI" metni YOK (`cause` non-enumerable olduğu
    // için `JSON.stringify` ona hiç inmez).
    const serializedFullResult = JSON.stringify(result)
    expect(serializedFullResult).not.toContain('GIZLI')
    expect(serializedFullResult).not.toContain('db://user:pass@host')

    // (2) Ayıklanabilirlik — `cause` erişilebilir VE orijinal hatanın
    // KENDİSİNİ (referans eşitliğiyle) taşır; SDK bunu kendisi LOGLAMADI
    // (bu test hiçbir logger/console çağrısı DOĞRULAMAZ, SADECE erişimi
    // kanıtlar — kullanım kararı ÇAĞIRANA bırakılır, dosya başı yorumu).
    if (!hasCause(result)) {
      throw new Error('beklenmeyen biçim — sonuç bir cause alanı taşımıyor')
    }
    expect(result.cause).toBeInstanceOf(ThemeContractError)
    const cause = result.cause
    if (!(cause instanceof ThemeContractError)) {
      throw new Error('beklenmeyen biçim — cause bir ThemeContractError değil')
    }
    expect(cause.cause).toBe(secretLeakingError)
  })

  // ⚠ F3 ZORUNLU KANIT (T-010 düzeltme turu 2/3, security'nin bulgusu S3) —
  // `migrate()` bir `Error` DEĞİL, ÇIPLAK bir DİZE fırlatırsa (ör. bazı
  // sağlayıcı SDK'ları bunu yapar) `cause.cause` enumerable bir DİZE sır
  // taşır — bu, ÖNCEKİ (F3'ten ÖNCEki) hâlde `JSON.stringify(result)`'a
  // DOĞRUDAN sızıyordu (ÖLÇÜLDÜ). `cause`'un NON-ENUMERABLE olması bu
  // sızıntıyı kapatır.
  it('migrate() ÇIPLAK bir dize fırlatırsa (Error DEĞİL) JSON.stringify(result) sızdırmaz', () => {
    const migrations: readonly ThemeSettingsMigration[] = [
      {
        from: '1.0.0',
        to: '1.1.0',
        migrate: () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- KASITLI: bir Error OLMAYAN fırlatma senaryosu test ediliyor (bazı sağlayıcı SDK'ları çıplak dize/nesne fırlatır), F3'ün exploit girdisi.
          throw 'GIZLI: db://user:pass@host'
        },
      },
    ]

    const result = migrateThemeSettings(migrations, '1.0.0', PRIMARY_COLOR_DEFINITIONS, {
      primaryColor: '#111111',
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }

    expect(JSON.stringify(result)).not.toContain('GIZLI')

    if (!hasCause(result)) {
      throw new Error('beklenmeyen biçim — sonuç bir cause alanı taşımıyor')
    }
    expect(result.cause).toBeInstanceOf(ThemeContractError)
    const cause = result.cause
    if (!(cause instanceof ThemeContractError)) {
      throw new Error('beklenmeyen biçim — cause bir ThemeContractError değil')
    }
    // Ayıklanabilirlik KORUNUR — DOĞRUDAN erişimle (non-enumerable OLSA
    // BİLE) orijinal dize HÂLÂ ulaşılabilir.
    expect(cause.cause).toBe('GIZLI: db://user:pass@host')
  })

  // ⚠ F3 ZORUNLU KANIT (devamı) — `migrate()` DÜZ bir nesne fırlatırsa (ör.
  // bir sağlayıcı hata gövdesini `{ code, message, context }` biçiminde
  // fırlatır) AYNI kanal AÇIKTI — bu fırlatma TÜRÜ `Error` DEĞİLDİR,
  // `message`/`stack` ENUMERABLE-OLMAMA GARANTİSİNE SAHİP DEĞİLDİR, TÜM
  // alanları (bir sır İÇERSE BİLE) varsayılan OLARAK enumerable'dır.
  it('migrate() DÜZ bir NESNE fırlatırsa (Error DEĞİL) JSON.stringify(result) sızdırmaz', () => {
    const secretLeakingPlainObject = {
      reason: 'db-connection-failed',
      connectionString: 'GIZLI: db://user:pass@host',
    }
    const migrations: readonly ThemeSettingsMigration[] = [
      {
        from: '1.0.0',
        to: '1.1.0',
        migrate: () => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- KASITLI: bir Error OLMAYAN fırlatma senaryosu test ediliyor (F3'ün exploit girdisi, yukarıdaki test ile AYNI gerekçe).
          throw secretLeakingPlainObject
        },
      },
    ]

    const result = migrateThemeSettings(migrations, '1.0.0', PRIMARY_COLOR_DEFINITIONS, {
      primaryColor: '#111111',
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }

    expect(JSON.stringify(result)).not.toContain('GIZLI')
    expect(JSON.stringify(result)).not.toContain('db://user:pass@host')

    if (!hasCause(result)) {
      throw new Error('beklenmeyen biçim — sonuç bir cause alanı taşımıyor')
    }
    expect(result.cause).toBeInstanceOf(ThemeContractError)
    const cause = result.cause
    if (!(cause instanceof ThemeContractError)) {
      throw new Error('beklenmeyen biçim — cause bir ThemeContractError değil')
    }
    expect(cause.cause).toBe(secretLeakingPlainObject)
  })

  // ⚠ F3 ZORUNLU KANIT — `cause` DOĞRUDAN erişimle hâlâ okunabilir OLSA DA
  // `Object.keys`/`for...in`/`JSON.stringify` ONU GÖRMEZ (non-enumerable).
  // Bu, "ayıklanabilirlik KORUNDU ama sızıntı kanalı KAPANDI" iddiasının
  // İKİ YÖNÜNÜ AYRI AYRI pinler.
  it('F3: result.cause DOĞRUDAN erişimle okunur AMA Object.keys(result) İÇİNDE YOK (non-enumerable)', () => {
    const migrations: readonly ThemeSettingsMigration[] = [
      {
        from: '1.0.0',
        to: '1.1.0',
        migrate: () => {
          throw new Error('herhangi bir hata')
        },
      },
    ]

    const result = migrateThemeSettings(migrations, '1.0.0', PRIMARY_COLOR_DEFINITIONS, {
      primaryColor: '#111111',
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }

    expect(Object.keys(result)).not.toContain('cause')
    expect(hasCause(result)).toBe(true)
  })
})

describe('migrateThemeSettings — B2: structuredClone klonlanamaz girdi için FIRLAR, sözleşme (ok:false) BOZULMAZ', () => {
  it('fonksiyon alanı taşıyan bir girdi (klonlanamaz) FIRLATMA YERİNE ok:false ile raporlanır', () => {
    const migrations: readonly ThemeSettingsMigration[] = [
      { from: '1.0.0', to: '1.1.0', migrate: (value: unknown) => value },
    ]

    // ⚠ Ölçülen gerçek davranış (düzeltmeden ÖNCE) — bu çağrı
    // `DOMException: () => 1 could not be cloned` FIRLATIYORDU, `expect`
    // asla çalışmıyordu. Düzeltmeden SONRA fonksiyon normal şekilde DÖNER.
    const unclonableSettings: Record<string, unknown> = { f: () => 1 }

    const result = migrateThemeSettings(migrations, '1.0.0', PRIMARY_COLOR_DEFINITIONS, {
      primaryColor: '#111111',
      ...unclonableSettings,
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('beklenmeyen başarı')
    }
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.code).toBe('THEME_MIGRATION_RESULT_INVALID')

    if (!hasCause(result)) {
      throw new Error('beklenmeyen biçim — sonuç bir cause alanı taşımıyor')
    }
    expect(result.cause).toBeInstanceOf(ThemeContractError)
  })
})

describe('migrateThemeSettings — girdi mutasyona uğramaz', () => {
  it('migrate() kendi aldığı değeri yerinde mutasyona uğratsa bile orijinal girdi parametresi değişmez', () => {
    const input: Record<string, unknown> = { primaryColor: '#111111' }
    const inputSnapshot = structuredClone(input)

    const migrations: readonly ThemeSettingsMigration[] = [
      {
        from: '1.0.0',
        to: '1.1.0',
        migrate: (value: unknown) => {
          // Kasıtlı olarak aldığı değeri YERİNDE mutasyona uğratan,
          // "iyi niyetli olmayan" bir migrate() simülasyonu — koşucu
          // `migrate()`'e asla orijinal `settings` referansını VERMEMELİDİR.
          const mutable = value as Record<string, unknown>
          mutable['mutatedByMigrate'] = true
          return mutable
        },
      },
    ]

    const result = migrateThemeSettings(migrations, '1.0.0', PRIMARY_COLOR_DEFINITIONS, input)

    expect(result.ok).toBe(true)
    // ⚠ Asıl iddia: koşucuya VERİLEN `input` nesnesi koşum sonrası HÂLÂ
    // başlangıçtaki hâliyle `toEqual`'dır — `migrate()`'in kendi aldığı
    // değeri mutasyona uğratması bile orijinali DEĞİŞTİRMEMİŞTİR.
    expect(input).toEqual(inputSnapshot)
  })
})

describe('migrateThemeSettings — sessiz başarısızlık İKİNCİ KATMAN: parse ÇIKTISI döner, ham migrate() dönüşü ASLA', () => {
  it('prototip kirliliği denemesi (1) Object.prototype KİRLENMEZ VE (2) dönen değer ham migrate() dönüşüyle REFERANS EŞİT DEĞİLDİR', () => {
    // JSON.parse, `__proto__`'yu Object.prototype'a YAZMAZ — ÖZ (own) bir
    // veri özelliği olarak kurar (bkz. `validate-settings.test.ts` aynı
    // desen, S3).
    const rawMigrateOutput: unknown = JSON.parse(
      '{"primaryColor": "#222222", "__proto__": {"polluted": "evil"}}',
    )

    const migrations: readonly ThemeSettingsMigration[] = [
      { from: '1.0.0', to: '1.1.0', migrate: () => rawMigrateOutput },
    ]

    const result = migrateThemeSettings(migrations, '1.0.0', PRIMARY_COLOR_DEFINITIONS, {
      primaryColor: '#111111',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('beklenmeyen başarısızlık')
    }

    // (1) Object.prototype GERÇEKTEN kirlenmemiş.
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()

    // (2) ⚠ BUNUN OLMADAN (1) YANLIŞ NEDENLE geçebilirdi — dönen değerin ham
    // `migrate()` dönüşüyle REFERANS EŞİT OLMADIĞINI doğrular (Zod'un parse
    // ÇIKTISININ döndürüldüğünü, ham dönüşün İLERİ TAŞINMADIĞINI kanıtlar).
    expect(result.value).not.toBe(rawMigrateOutput)
    expect(result.value).toEqual({ primaryColor: '#222222' })
  })
})
