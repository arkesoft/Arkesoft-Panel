// @arkesoft/superadmin — paket boyutu bütçesi sabitleri (ROADMAP v0.0.20,
// T-021/S8, `apps/admin/bundle-budget.config.ts`'in AYNI mekanizması —
// "ilk boya" tanımı bir ÇIKARSAMA değil, BİLDİRİM + iki fail-closed
// assertion, bkz. `scripts/check-bundle-budget.ts`).
//
// Eşikler `apps/admin`'inkiyle AYNI (250 KiB JS / 50 KiB CSS) — bilinçli
// cömert tavan, bu paketin kendi ilk ölçümü ayrı bir karar GEREKTİRMEDİ
// (ikisi de Vite + React + TanStack Router + aynı `@arkesoft/ui` temeli).
// Yükseltmek gerekirse gerekçe + ROADMAP notu ister.
export const MAX_FIRST_ROUTE_JS_GZIP_BYTES = 250 * 1024

/** İlk rotanın gzip CSS bütçesi — bayt. */
export const MAX_FIRST_ROUTE_CSS_GZIP_BYTES = 50 * 1024

export interface FirstPaintEntryPointDeclaration {
  readonly label: string
  readonly routeModuleSrcPrefixes: readonly string[]
}

/**
 * İKİ giriş noktası — süper adminin iki kanonik "ilk yükleme" deneyimi:
 * kimlikli ilk ekran (`/`, kiracı listesi) ve kimliksiz ilk ekran
 * (`/giris`). `apps/admin/bundle-budget.config.ts`'in AYNI deseni.
 */
export const FIRST_PAINT_ENTRY_POINTS: readonly FirstPaintEntryPointDeclaration[] = [
  {
    label: 'kimlikli ilk ekran (/)',
    routeModuleSrcPrefixes: ['src/routes/_app.tsx', 'src/routes/_app.index.tsx'],
  },
  {
    label: 'kimliksiz ilk ekran (/giris)',
    routeModuleSrcPrefixes: ['src/routes/_auth.giris.tsx'],
  },
]

/**
 * `isDynamicEntry: true` taşıyan ama HİÇBİR giriş noktası tarafından TALEP
 * EDİLMEYEN manifest `src`'leri için fail-closed MUAFİYET listesi. Her
 * gelecekteki girdi Türkçe GEREKÇE yorumu taşımak ZORUNDA — susturma YOK.
 *
 * `/denetim-kaydi` ve `/iki-adimli-dogrulama` hiçbir giriş noktasından
 * STATİK olarak import edilmiyor; TanStack Router'ın `autoCodeSplitting`'i
 * bunları KENDİ chunk'larına ayırıyor — BİLEREK tembel: kullanıcı bu
 * rotalara gitmeden bu kodu indirmiyor, ilk boya bütçesini BÜYÜTMÜYOR.
 */
export const DELIBERATELY_LAZY_ROUTE_SRCS: readonly string[] = [
  'src/routes/_app.denetim-kaydi.tsx?tsr-split=component',
  'src/routes/iki-adimli-dogrulama.tsx?tsr-split=component',
  // `iki-adimli-dogrulama.tsx` `errorComponent` da EXPORT eder (`_app.tsx`
  // kendi `errorComponent` split'i FIRST_PAINT_ENTRY_POINTS'in `_app.tsx`
  // önekiyle ZATEN claim ediliyor — bu rota kendi başına bir giriş noktası
  // OLMADIĞI için errorComponent split'i de burada AÇIKÇA muaf tutulur).
  'src/routes/iki-adimli-dogrulama.tsx?tsr-split=errorComponent',
]
