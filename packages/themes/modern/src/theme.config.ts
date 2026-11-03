// @arkesoft/themes-modern — theme.config.ts (ROADMAP v0.0.10, T-012/S5,
// docs/ui/T-012.md "Tasarım token'ları" + "Kontrast tablosu")
//
// `modern@0.1.0` temasının manifesti. `defineTheme()`'in girdisi `unknown`
// (theme-sdk CLAUDE.md §4) — bu nesne literali, bu paketin SINIRI dışından
// (bir tema yazarının elle yazdığı yapılandırma) gelmiş gibi davranılır;
// çalışma zamanında `assertThemeManifest()` ile GERÇEKTEN doğrulanır,
// derleme zamanı tip kontrolüne GÜVENİLMEZ.
//
// ⚠ Palet + tipografi `docs/ui/T-012.md`'den HARFİYEN alındı (ui/S1'in
// DONDURDUĞU değerler, kontrast tablosu hesaplanmış) — hex'lerde
// yuvarlama/yakın renk seçimi YAPILMADI: `#2563EB`/`#FFFFFF`/`#374151`.
// `color-primary` ZORUNLU (AC3/AC4, po'nun düzeltmesi) — bu dosyanın `key`
// alanı, repodaki TEK tanım noktası olmak zorunda (bkz. S5 handoff "AC3").
//
// ⚠ `image` TİPİNDE AYAR TANIMLANMADI (pm/architect kararı, BN-1/SEC-5
// sıralama kısıtı — ROADMAP v0.0.10 Task, "KARAR — BN-1'in sıralama kısıtı
// YAPISAL olarak karşılanıyor") — bu sürüm hiçbir varlık servis çözücüsü
// GEREKTİRMEZ; `image` eklemek bu kararı yapısal olarak bozardı.
//
// ⚠ `version`/`sdkRange` — manifestin KENDİ alanları, bu paketin
// `package.json`'daki `"0.0.0"` sürümünden AYRI kavramlar (ADR-0002 Karar 8
// + Changesets kaskat kararı, S5 handoff "KARARLAR"da ayrıntı).
import { defineTheme } from '@arkesoft/theme-sdk'

/** Başlık/gövde için ortak sistem font yığını — web fontu YÜKLENMİYOR (docs/ui/T-012.md "Tipografi"). */
const SYSTEM_FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji"'

export const modernTheme = defineTheme({
  id: 'modern',
  name: 'Modern',
  version: '0.1.0',
  sdkRange: '>=0.1.0 <1.0.0',
  templates: [
    { type: 'home', slots: [] },
    { type: '404', slots: [] },
  ],
  settings: [
    {
      key: 'color-primary',
      label: 'Birincil renk',
      description: 'Başlıkların metin rengi.',
      type: 'color',
      default: '#2563EB',
      order: 1,
    },
    {
      key: 'color-surface',
      label: 'Yüzey rengi',
      description: 'Sayfa zemininin rengi (BaseLayout ile kasıtlı olarak aynı hex).',
      type: 'color',
      default: '#FFFFFF',
      order: 2,
    },
    {
      key: 'color-body',
      label: 'Gövde metni rengi',
      description: 'Gövde paragraflarının metin rengi.',
      type: 'color',
      default: '#374151',
      order: 3,
    },
    {
      key: 'font-heading',
      label: 'Başlık yazı tipi',
      description: 'Başlıklarda kullanılan yazı tipi yığını.',
      type: 'font',
      default: SYSTEM_FONT_STACK,
      order: 4,
    },
    {
      key: 'font-body',
      label: 'Gövde yazı tipi',
      description: 'Gövde metninde kullanılan yazı tipi yığını.',
      type: 'font',
      default: SYSTEM_FONT_STACK,
      order: 5,
    },
  ],
  migrations: [],
})

export default modernTheme
