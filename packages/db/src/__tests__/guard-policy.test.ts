// @arkesoft/db — guard-policy saf birim testleri (ROADMAP v0.0.3,
// T-001 Gate Tur 1 düzeltmesi, architect K1.7)
//
// Bu dosya DB'YE BAĞLANMAZ — `evaluateTargetDatabase`/`resolvePrismaCommand`
// saf fonksiyonlardır, girdi/çıktı dışında yan etkisi yoktur. `vitest.config.ts`'in
// seri koşum kısıtını (V6/A-V14) ETKİLEMEZ.

import { describe, expect, it } from 'vitest'

import { evaluateTargetDatabase, resolvePrismaCommand } from '../guard-policy.js'
import type { DatabaseEnv } from '../env.js'

function env(databaseUrl: string, nodeEnv: DatabaseEnv['nodeEnv'] = 'development'): DatabaseEnv {
  return { databaseUrl, nodeEnv }
}

describe('evaluateTargetDatabase', () => {
  describe('host allowlist — izin', () => {
    it.each([
      ['localhost', 'postgresql://u:p@localhost:5432/arkesoft'],
      ['127.0.0.1', 'postgresql://u:p@127.0.0.1:5432/arkesoft'],
      ['::1 (brackets, Node biçimi)', 'postgresql://u:p@[::1]:5432/arkesoft'],
      ['LOCALHOST (büyük harf)', 'postgresql://u:p@LOCALHOST:5432/arkesoft'],
    ])('%s → allow', (_label, url) => {
      expect(evaluateTargetDatabase(env(url), undefined)).toEqual({ kind: 'allow' })
    })
  })

  describe('host allowlist — ret', () => {
    it.each([
      ['postgres (S2 — çıkarıldı)', 'postgresql://u:p@postgres:5432/arkesoft_prod'],
      ['db.staging.example.com', 'postgresql://u:p@db.staging.example.com:5432/arkesoft'],
      ['evil-localhost.com', 'postgresql://u:p@evil-localhost.com:5432/arkesoft'],
      ['localhost.attacker.com', 'postgresql://u:p@localhost.attacker.com:5432/arkesoft'],
    ])('%s → reject', (_label, url) => {
      const decision = evaluateTargetDatabase(env(url), undefined)
      expect(decision.kind).toBe('reject')
    })
  })

  it('NODE_ENV=production → reject, doğru confirmation ile de AŞILMAZ', () => {
    const decision = evaluateTargetDatabase(
      env('postgresql://u:p@localhost:5432/arkesoft', 'production'),
      'arkesoft',
    )
    expect(decision.kind).toBe('reject')
  })

  it('NODE_ENV=production + yerel olmayan host → reject', () => {
    const decision = evaluateTargetDatabase(
      env('postgresql://u:p@db.staging.example.com:5432/arkesoft_prod', 'production'),
      undefined,
    )
    expect(decision.kind).toBe('reject')
  })

  describe('kaçış kapısı (ARKESOFT_CONFIRM_DESTRUCTIVE)', () => {
    const remoteUrl = 'postgresql://u:p@db.staging.example.com:5432/arkesoft_prod'

    it('doğru veritabanı adı → allow', () => {
      expect(evaluateTargetDatabase(env(remoteUrl), 'arkesoft_prod')).toEqual({ kind: 'allow' })
    })

    it('yanlış ad → reject', () => {
      expect(evaluateTargetDatabase(env(remoteUrl), 'yanlis-ad').kind).toBe('reject')
    })

    it('boş confirmation → reject', () => {
      expect(evaluateTargetDatabase(env(remoteUrl), '').kind).toBe('reject')
    })

    it('confirmation tanımsız → reject', () => {
      expect(evaluateTargetDatabase(env(remoteUrl), undefined).kind).toBe('reject')
    })

    it('boş veritabanı adı — doğru boş confirmation bile eşleşmez (DOĞRUDAN reddedilir)', () => {
      const decision = evaluateTargetDatabase(
        env('postgresql://u:p@db.staging.example.com:5432/'),
        '',
      )
      expect(decision.kind).toBe('reject')
    })

    it('boş veritabanı adı + dolu confirmation → reject (hedef kanıtlanamıyor)', () => {
      const decision = evaluateTargetDatabase(
        env('postgresql://u:p@db.staging.example.com:5432/'),
        'herhangi-bir-ad',
      )
      expect(decision.kind).toBe('reject')
    })
  })

  it('DATABASE_URL ayrıştırılamıyorsa fail-closed reddedilir', () => {
    const decision = evaluateTargetDatabase(env('bu-bir-url-degil'), undefined)
    expect(decision.kind).toBe('reject')
  })

  it("ret mesajı DATABASE_URL'in tamamını veya parolayı İÇERMEZ", () => {
    const decision = evaluateTargetDatabase(
      env('postgresql://gizli-kullanici:gizli-parola@db.staging.example.com:5432/arkesoft_prod'),
      undefined,
    )
    expect(decision.kind).toBe('reject')
    if (decision.kind === 'reject') {
      expect(decision.message).not.toContain('gizli-parola')
      expect(decision.message).not.toContain('gizli-kullanici')
      expect(decision.message).not.toContain('postgresql://')
    }
  })
})

describe('resolvePrismaCommand', () => {
  describe("komut allowlist'i", () => {
    it("db push → allow, spawnArgs birebir, migrator rolü + guard'lı (FIX turu 2/B2)", () => {
      expect(resolvePrismaCommand(['db', 'push'])).toEqual({
        kind: 'allow',
        spawnArgs: ['db', 'push'],
        role: 'migrator',
        requiresTargetGuard: true,
      })
    })

    it("migrate reset → allow, --force SARMALAYICI tarafından sabit eklenir, migrator rolü + guard'lı", () => {
      expect(resolvePrismaCommand(['migrate', 'reset'])).toEqual({
        kind: 'allow',
        spawnArgs: ['migrate', 'reset', '--force'],
        role: 'migrator',
        requiresTargetGuard: true,
      })
    })

    it("migrate dev → allow, migrator rolü + guard'lı", () => {
      expect(resolvePrismaCommand(['migrate', 'dev'])).toEqual({
        kind: 'allow',
        spawnArgs: ['migrate', 'dev'],
        role: 'migrator',
        requiresTargetGuard: true,
      })
    })

    it("db seed → allow, app rolü + guard'lı (K-E2: BİLİNÇLİ)", () => {
      expect(resolvePrismaCommand(['db', 'seed'])).toEqual({
        kind: 'allow',
        spawnArgs: ['db', 'seed'],
        role: 'app',
        requiresTargetGuard: true,
      })
    })

    it("studio → allow, app rolü + guard'lı", () => {
      expect(resolvePrismaCommand(['studio'])).toEqual({
        kind: 'allow',
        spawnArgs: ['studio'],
        role: 'app',
        requiresTargetGuard: true,
      })
    })

    it('migrate deploy → allow (FIX turu 1 — artık sarmalanıyor), migrator rolü + MUAF (requiresTargetGuard: false, FIX turu 2/B2)', () => {
      expect(resolvePrismaCommand(['migrate', 'deploy'])).toEqual({
        kind: 'allow',
        spawnArgs: ['migrate', 'deploy'],
        role: 'migrator',
        requiresTargetGuard: false,
      })
    })

    it('migrate deploy ek bayrak kabul etmez → reject', () => {
      expect(resolvePrismaCommand(['migrate', 'deploy', '--schema=/tmp/x.prisma']).kind).toBe(
        'reject',
      )
    })

    it('db execute → reject (script yüzeyinde yok)', () => {
      expect(resolvePrismaCommand(['db', 'execute']).kind).toBe('reject')
    })

    it('boş argv → reject', () => {
      expect(resolvePrismaCommand([]).kind).toBe('reject')
    })
  })

  // FIX turu 2 (B1 + B2, qa/solid Tur 2 [medium] BAĞIMSIZ bulgular):
  // `['migrate','deploy']` jetonu artık TEK yerde (`COMMANDS` allowlist'i)
  // tanımlı — eskiden `run-guarded-prisma.ts`'teki AYRI
  // `resolveDatabaseRole`/`requiresDestructiveTargetGuard` fonksiyonlarının
  // kapsadığı ALTI komutun TAMAMI + bilinmeyen komut dalı burada,
  // `resolvePrismaCommand`'in döndürdüğü `role`/`requiresTargetGuard`
  // alanları üzerinden pinlenir (B1'in "main() import anında koşmadan
  // test edilebilsin" talebi; B2'nin "üç yerde ayrı tanım" bulgusu — ikisi
  // AYNI tek kaynağa taşınarak birlikte kapanır).
  describe("AYRICALIK SINIRI — role/requiresTargetGuard (FIX turu 1'in kalbi, artık TEK kaynaktan)", () => {
    it.each([
      ['migrate dev', ['migrate', 'dev'], 'migrator', true],
      ['migrate reset', ['migrate', 'reset'], 'migrator', true],
      ['db push', ['db', 'push'], 'migrator', true],
      ['db seed', ['db', 'seed'], 'app', true],
      ['studio', ['studio'], 'app', true],
      ['migrate deploy', ['migrate', 'deploy'], 'migrator', false],
    ] as const)(
      '%s → role=%s, requiresTargetGuard=%s',
      (_label, argv, role, requiresTargetGuard) => {
        const decision = resolvePrismaCommand(argv)
        expect(decision.kind).toBe('allow')
        if (decision.kind === 'allow') {
          expect(decision.role).toBe(role)
          expect(decision.requiresTargetGuard).toBe(requiresTargetGuard)
        }
      },
    )

    it('bilinmeyen komut → reject (role/requiresTargetGuard yapısal olarak OKUNAMAZ — "reject" dalında bu alanlar YOK)', () => {
      const decision = resolvePrismaCommand(['migrate', 'resolve'])
      expect(decision.kind).toBe('reject')
    })
  })

  describe("bayrak allowlist'i — migrate dev", () => {
    it('--name <değer> (ayrık token) → allow', () => {
      expect(resolvePrismaCommand(['migrate', 'dev', '--name', 'add_product'])).toEqual({
        kind: 'allow',
        spawnArgs: ['migrate', 'dev', '--name', 'add_product'],
        role: 'migrator',
        requiresTargetGuard: true,
      })
    })

    it('--name=<değer> (eşittirli) → allow', () => {
      expect(resolvePrismaCommand(['migrate', 'dev', '--name=add_product'])).toEqual({
        kind: 'allow',
        spawnArgs: ['migrate', 'dev', '--name=add_product'],
        role: 'migrator',
        requiresTargetGuard: true,
      })
    })

    it('--create-only → allow', () => {
      expect(resolvePrismaCommand(['migrate', 'dev', '--create-only'])).toEqual({
        kind: 'allow',
        spawnArgs: ['migrate', 'dev', '--create-only'],
        role: 'migrator',
        requiresTargetGuard: true,
      })
    })

    it('--name değeri "-" ile başlıyorsa → reject (bayrak kaçırma)', () => {
      expect(resolvePrismaCommand(['migrate', 'dev', '--name', '--force-reset']).kind).toBe(
        'reject',
      )
    })

    it('--name değeri yoksa (son token) → reject', () => {
      expect(resolvePrismaCommand(['migrate', 'dev', '--name']).kind).toBe('reject')
    })

    it('--name değeri charset dışı (büyük harf) → reject', () => {
      expect(resolvePrismaCommand(['migrate', 'dev', '--name', 'Add-Product']).kind).toBe('reject')
    })

    it('--name değeri boş (--name=) → reject', () => {
      expect(resolvePrismaCommand(['migrate', 'dev', '--name=']).kind).toBe('reject')
    })
  })

  describe("bayrak allowlist'i — db push (hiçbir ek bayrak yok)", () => {
    it("--name db push'ta RET edilir (migrate dev'e özgü)", () => {
      expect(resolvePrismaCommand(['db', 'push', '--name', 'add_product']).kind).toBe('reject')
    })

    it('--url=... → reject', () => {
      expect(
        resolvePrismaCommand(['db', 'push', '--url=postgresql://u:p@prod-db:5432/arkesoft']).kind,
      ).toBe('reject')
    })

    it('--force-reset → reject', () => {
      expect(resolvePrismaCommand(['db', 'push', '--force-reset']).kind).toBe('reject')
    })

    it('--accept-data-loss → reject', () => {
      expect(resolvePrismaCommand(['db', 'push', '--accept-data-loss']).kind).toBe('reject')
    })
  })

  describe("bayrak allowlist'i — migrate reset (hiçbir ek bayrak yok — Prisma 7.10.1'de --skip-seed/--skip-generate mevcut değil)", () => {
    it('--config=./baska.config.ts → reject', () => {
      expect(resolvePrismaCommand(['migrate', 'reset', '--config', './baska.config.ts']).kind).toBe(
        'reject',
      )
    })

    it("kullanıcı kendi --force'unu veremez → reject", () => {
      expect(resolvePrismaCommand(['migrate', 'reset', '--force']).kind).toBe('reject')
    })

    it('--schema=/tmp/x.prisma → reject', () => {
      expect(resolvePrismaCommand(['migrate', 'reset', '--schema=/tmp/x.prisma']).kind).toBe(
        'reject',
      )
    })
  })

  describe("bayrak allowlist'i — studio", () => {
    it('--port <değer> (ayrık) → allow', () => {
      expect(resolvePrismaCommand(['studio', '--port', '5555'])).toEqual({
        kind: 'allow',
        spawnArgs: ['studio', '--port', '5555'],
        role: 'app',
        requiresTargetGuard: true,
      })
    })

    it('--port=<değer> → allow', () => {
      expect(resolvePrismaCommand(['studio', '--port=5555'])).toEqual({
        kind: 'allow',
        spawnArgs: ['studio', '--port=5555'],
        role: 'app',
        requiresTargetGuard: true,
      })
    })

    it('--port geçersiz aralık (0) → reject', () => {
      expect(resolvePrismaCommand(['studio', '--port=0']).kind).toBe('reject')
    })

    it('--port geçersiz aralık (70000) → reject', () => {
      expect(resolvePrismaCommand(['studio', '--port=70000']).kind).toBe('reject')
    })

    it('--port sayısal olmayan → reject', () => {
      expect(resolvePrismaCommand(['studio', '--port=abc']).kind).toBe('reject')
    })
  })

  describe('genel ayrıştırma kuralları', () => {
    it('bilinmeyen bayrak → reject', () => {
      expect(resolvePrismaCommand(['studio', '--unknown-flag']).kind).toBe('reject')
    })

    it('çıplak pozisyonel argüman → reject', () => {
      expect(resolvePrismaCommand(['migrate', 'dev', 'add_product']).kind).toBe('reject')
    })

    it('"--" tek başına → reject', () => {
      expect(resolvePrismaCommand(['migrate', 'dev', '--']).kind).toBe('reject')
    })

    it('boş dize argüman → reject', () => {
      expect(resolvePrismaCommand(['studio', '']).kind).toBe('reject')
    })

    it('aynı bayrağın tekrarı → reject', () => {
      expect(resolvePrismaCommand(['migrate', 'dev', '--name', 'a', '--name', 'b']).kind).toBe(
        'reject',
      )
    })

    it('prefix eşleşmesi YASAK — "--nam" "--name" olarak kabul edilmez', () => {
      expect(resolvePrismaCommand(['migrate', 'dev', '--nam', 'add_product']).kind).toBe('reject')
    })

    it('ret mesajı reddedilen bayrağın ADINI yazar, DEĞERİNİ YAZMAZ', () => {
      const decision = resolvePrismaCommand([
        'db',
        'push',
        '--url=postgresql://gizli:parola@prod-db:5432/arkesoft',
      ])
      expect(decision.kind).toBe('reject')
      if (decision.kind === 'reject') {
        expect(decision.message).toContain('--url')
        expect(decision.message).not.toContain('gizli')
        expect(decision.message).not.toContain('parola')
        expect(decision.message).not.toContain('postgresql://')
      }
    })
  })
})
