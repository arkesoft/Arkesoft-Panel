// @arkesoft/versioning — tek giriş noktası (ROADMAP v0.0.21, T-018/S1)
//
// Tüketiciler HER ZAMAN bu dosyadan import eder, iç dosya yoluna
// (`./semver.js` vb.) girmez (`packages/errors`/`packages/theme-sdk`'nın
// `src/index.ts` emsali).

export {
  compareSemver,
  compareSemverParts,
  extractMajor,
  parseSemver,
  SEMVER_CORE_PATTERN_SOURCE,
  SEMVER_FORMAT_PATTERN,
} from './semver.js'
export type { SemverParts } from './semver.js'

export { isThemeReleaseCompatibleWithSdk, parseRange, satisfies, satisfiesParsed } from './range.js'
export type { RangeComparator, RangeOperator, SemverRange } from './range.js'

export {
  countPlatformMinorsBehind,
  isPlatformVersionSupported,
  isPublicApiMajorSupported,
  isThemeSdkVersionSupported,
  isThemeVersionSupported,
  MANDATORY_UPGRADE_GRACE_DAYS,
  PLATFORM_SUPPORTED_MINOR_WINDOW,
  PUBLIC_API_SUNSET_MONTHS,
  resolveMandatoryUpgradeDeadline,
  resolvePublicApiSunsetDate,
  THEME_SDK_SUPPORTED_MAJOR_WINDOW,
  THEME_SUPPORTED_MAJOR_WINDOW,
} from './support-window.js'

export { TENANT_VERSION_SNAPSHOT_SCHEMA } from './snapshot.js'
export type { TenantVersionSnapshot } from './snapshot.js'
