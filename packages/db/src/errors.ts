// @arkesoft/db — Prisma hata daraltma yardımcıları (ROADMAP v0.0.3, T-001/ST-3)
//
// Prisma'nın hata SINIFLARI (`PrismaClientKnownRequestError` vb.) paket dışına
// sızdırılmaz — tüketiciler Prisma'ya bağımlı hale gelmesin (AC4 ruhu). Bunun
// yerine `unknown` üzerinden çalışma zamanı alan (duck-typing) daraltması
// yapılır; v0.0.4'ün `VALIDATION_ERROR` alan eşlemesi bu fonksiyonu çağıracak.

/**
 * Prisma'nın bilinen hata kodlarından bu pakette kullanılanlar. İç kullanım
 * içindir, dışa açılmaz.
 */
const PRISMA_ERROR_CODES = {
  /** Benzersizlik (unique) kısıtı ihlali — AC2(c)/(d) ve AC7/V1 testlerinde tetiklenir. */
  UNIQUE_CONSTRAINT_VIOLATION: 'P2002',
} as const

/** Hatanın Prisma'nın tanıdığı `code` alanını taşıyıp taşımadığını daraltır. */
function hasPrismaErrorCode(error: unknown): error is { readonly code: unknown } {
  return typeof error === 'object' && error !== null && 'code' in error
}

/**
 * Hatanın bir Prisma benzersizlik kısıtı ihlali (P2002) olup olmadığını söyler.
 * Prisma hata sınıfını `instanceof` ile değil, `unknown` üzerinden alan
 * daraltmasıyla tespit eder — sınıf paket dışına sızmaz, tüketici yalnızca
 * bu `boolean` sonucu görür.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return hasPrismaErrorCode(error) && error.code === PRISMA_ERROR_CODES.UNIQUE_CONSTRAINT_VIOLATION
}
