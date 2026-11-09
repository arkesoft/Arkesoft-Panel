// @arkesoft/admin — paket boyutu bütçesi sabitleri (ROADMAP v0.0.7, T-008/S5,
// architect K7, AC16; DÜZELTME TURU 1 — architect Karar 1)
//
// `scripts/check-bundle-budget.ts` BU dosyadan okur — eşik burada TEK yerde
// tanımlanır. Değer architect'in K7'sinden: "250 KB bilinçli cömert — amaç
// tavanı dosyaya yazmak" (AC16). Yükseltmek architect gerekçesi + ROADMAP
// notu ister (AC16). DÜZELTME TURU 1 — eşikler DEĞİŞMEDİ, bu bir AC16
// revizyonu DEĞİL (bkz. script dosya başı yorumu): değişen architect'in
// "ilk rota" TANIMI (K7), AC16'nın lafzı/eşiği/"aşım build'i kırar" şartı
// SABİT.
export const MAX_FIRST_ROUTE_JS_GZIP_BYTES = 250 * 1024

/** İlk rotanın gzip CSS bütçesi — bayt. */
export const MAX_FIRST_ROUTE_CSS_GZIP_BYTES = 50 * 1024

/**
 * İlk boya giriş noktasının BİLDİRİMİ (architect Karar 1 — ÇIKARSAMA DEĞİL,
 * BİLDİRİM): `dist/.vite/manifest.json`'da "ilk boya" diye bir alan YOK;
 * entry'nin `dynamicImports`'u TanStack Router'ın `autoCodeSplitting`'inin
 * ürettiği DÖRT rota split'ini AYRIMSIZ listeliyor ve biri (`_auth.sign-in`)
 * kimlikli ilk boyanın PARÇASI DEĞİL — mekanik ayrım manifest'ten
 * TÜRETİLEMEZ. `routeModuleSrcPrefixes` manifest'teki `src` alanının (`?`
 * ÖNCESİ kısmıyla) ÖNEK eşleştiği her girdiyi (TanStack'ın `?tsr-split=
 * component`/`=errorComponent` ve ileride doğacak her split SONEKİ dahil)
 * o giriş noktasının BİLEŞENİ sayar.
 */
export interface FirstPaintEntryPointDeclaration {
  readonly label: string
  readonly routeModuleSrcPrefixes: readonly string[]
}

/**
 * İKİ giriş noktası — ölçülmüş yeni sayılar (DÜZELTME TURU 1): `/` ≈ 175 KiB
 * (eski ölçüm 131.38 = bütçenin %52.6'sı; yeni ölçüm bütçenin ~%70'i),
 * `/sign-in` ≈ 155 KiB. Eşik İKİSİNİN MAKSİMUMUNA bağlanır (script'te).
 */
export const FIRST_PAINT_ENTRY_POINTS: readonly FirstPaintEntryPointDeclaration[] = [
  {
    label: 'kimlikli ilk ekran (/)',
    routeModuleSrcPrefixes: ['src/routes/_app.tsx', 'src/routes/_app.index.tsx'],
  },
  {
    label: 'kimliksiz ilk ekran (/sign-in)',
    routeModuleSrcPrefixes: ['src/routes/_auth.sign-in.tsx'],
  },
]

/**
 * `isDynamicEntry: true` taşıyan ama HİÇBİR giriş noktası tarafından
 * TALEP EDİLMEYEN manifest `src`'leri için fail-closed MUAFİYET listesi
 * (architect Karar 1, assertion B). BUGÜN BOŞ — dört dinamik girdinin
 * DÖRDÜ DE yukarıdaki iki giriş noktasından biri tarafından talep ediliyor.
 * Her gelecekteki girdi Türkçe GEREKÇE yorumu taşımak ZORUNDA (emsal:
 * `tenant-exempt-paths.ts`'in 12→13 kardinalite assertion'ı — susturma YOK,
 * `scripts/__tests__/check-bundle-budget.test.ts`'teki kardinalite testi
 * `.length === 0`'ı pinler).
 *
 * DÜZELTME TURU 2 (`solid` tur 2 L-N6 — bağlayıcı, İŞ 5): buradaki her
 * eleman `check-bundle-budget.ts`'te `src === allowed` (TAM EŞİTLİK) ile
 * eşleşir — ÖNEK (`startsWith`) DEĞİL. ÖLÇÜLDÜ: eski `startsWith`
 * eşleşmesiyle TEK bir `'src/routes/'` satırı eklemek assertion B'yi
 * TÜMÜYLE etkisizleştirirdi (architect Risk 2'nin yasakladığı "assertion
 * B'yi kaldırmak" sonucunun GÖRÜNMEZ eşdeğeri — liste BOŞ kalır, yasak
 * ihlal edilmiş SAYILMAZ, ama mekanizma zaten ÖLÜDÜR). Yukarıdaki
 * `FIRST_PAINT_ENTRY_POINTS.routeModuleSrcPrefixes`'in ÖNEK eşleşmesi
 * BİLİNÇLİ farklı bir karar (TanStack'ın split soneklerini VE ileride
 * doğacak her split'i kendiliğinden kapsamak, fazla sayma yönü GÜVENLİ) —
 * O listeyi tam eşitliğe ÇEVİRME, yalnızca BU (muafiyet) listesi TAM
 * eşitlik taşır.
 */
// ROADMAP v0.0.15 (T-016/S10) EKLEMESİ — `/hesap/guvenlik` rotası
// (`_app.hesap.guvenlik.tsx`, 2FA ekranları) hiçbir giriş noktasından
// (`/` veya `/sign-in`) STATİK olarak import edilmiyor; TanStack Router'ın
// `autoCodeSplitting`'i bunu KENDİ chunk'ına ayırıyor (ÖLÇÜLDÜ, `vite build`
// sonrası `dist/.vite/manifest.json`'daki TAM `src` değeri aşağıda) — BİLEREK
// tembel: kullanıcı bu rotaya gitmeden bu kodu indirmiyor, ilk boya bütçesini
// BÜYÜTMÜYOR. Satır KALDIRILIRSA (perf) FAIL-CLOSED B bunu yakalar.
export const DELIBERATELY_LAZY_ROUTE_SRCS: readonly string[] = [
  'src/routes/_app.hesap.guvenlik.tsx?tsr-split=component',
]
