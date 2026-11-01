# T-008 · `perf` gate · tur 2

Tarih: 2026-11-01
Sürüm: ROADMAP v0.0.7 (platform 0.0.6 → 0.0.7)
Task: `.claude/workflow/tasks/T-008.md`

```
GATE: perf
SONUÇ: PASS
```

## 0. Tur 1 bulgusunun kapanış kararı

**KAPANDI.**

Tur 1'in tek `medium` bulgusu ("AC16 bütçesi gerçek rota kodunu ölçmüyor — ~29 KiB/%18
kör nokta") `architect`'in Düzeltme Turu 1 Karar 1'i ile **gerçekten kapatılmış**;
iddia değil, aşağıda üç bağımsız kanıtla ölçüldü (§2, §3). Script yeniden yazıldı
(`check-bundle-budget.ts`), yapılandırma bildirim şekline dönüştü
(`bundle-budget.config.ts`), ve ayrı bir mekanik bekçi (`check-compiled-css-contract.ts`,
Karar 2) `wcag` H1 kök nedenini (Tailwind v4 `text-(--x)` → yanlış CSS özelliği) kapattı.

**Doğru ifade (architect'in bağlayıcı yorum kuralına uyularak):** ölçülen sayı
131.38 → 174.53 KiB çıktı; bu **"bütçe aşıldı" veya "gevşetildi" değildir** — eşik
250/50 KiB **değişmedi**, ölçümün kapsamı rota kodunu da içerecek şekilde
**düzeltildi**. Kullanım %52.6 → %69.8, tavan aynı.

## 1. Kendi koşumum — üç sayı, AC16

Komut: `pnpm --filter @arkesoft/admin build` (repo kökünden, kendi koşumum)

```
$ vite build && node ./scripts/check-compiled-css-contract.ts && node ./scripts/check-bundle-budget.ts && rm -rf dist/.vite
vite v8.3.5 building client environment for production...
✓ 381 modules transformed.
dist/assets/index-B9K055UW.css          13.97 kB │ gzip:   3.65 kB
dist/assets/_app-BunF0vcC.js             0.46 kB │ gzip:   0.32 kB
dist/assets/auth-rest-Dckl2fhm.js        0.53 kB │ gzip:   0.30 kB
dist/assets/ErrorState-Bh4Dg1Cg.js       0.75 kB │ gzip:   0.41 kB
dist/assets/_app.index-BnzBbVmu.js       1.02 kB │ gzip:   0.49 kB
dist/assets/messages-_osBa0GN.js        12.53 kB │ gzip:   4.85 kB
dist/assets/dist-BHhf5sRv.js            31.76 kB │ gzip:   9.98 kB
dist/assets/_auth.sign-in-Bz6n26xx.js   39.25 kB │ gzip:  13.85 kB
dist/assets/_app-kNh9SgJu.js            96.83 kB │ gzip:  33.06 kB
dist/assets/index-B5uqXwWL.js          420.70 kB │ gzip: 131.28 kB
✓ built in 355ms

[check-compiled-css-contract] taranan CSS dosyası sayısı: 1, bildirim sayısı: 332, @theme token tanımı: 24, kaynakta referans verilen token sayısı: 23
[check-compiled-css-contract] PASS — N1/N2/P1/P2 hepsi geçti.

[bundle-budget] paylaşılan çekirdek — JS (gzip): 131.47 KiB, CSS (gzip): 3.56 KiB
[bundle-budget] kimlikli ilk ekran (/) — JS (gzip): 174.53 KiB / bütçe 250.00 KiB (%69.8, rezerv 75.47 KiB)
[bundle-budget] kimlikli ilk ekran (/) — CSS (gzip): 3.56 KiB / bütçe 50.00 KiB (%7.1, rezerv 46.44 KiB)
[bundle-budget] kimliksiz ilk ekran (/sign-in) — JS (gzip): 154.81 KiB / bütçe 250.00 KiB (%61.9, rezerv 95.19 KiB)
[bundle-budget] kimliksiz ilk ekran (/sign-in) — CSS (gzip): 3.56 KiB / bütçe 50.00 KiB (%7.1, rezerv 46.44 KiB)
[bundle-budget] MAKSİMUM — JS (gzip): 174.53 KiB / bütçe 250.00 KiB (%69.8, rezerv 75.47 KiB)
[bundle-budget] MAKSİMUM — CSS (gzip): 3.56 KiB / bütçe 50.00 KiB (%7.1, rezerv 46.44 KiB)
exit 0 (aşım yok)
```

S5'in task dosyasında bildirdiği sayılarla **birebir eşleşiyor** (131.47 / 174.53 / 154.81 / 3.56).
Orkestratör'ün bildirdiği `lint 17/17 · typecheck 17/17 · format:check temiz · test 624 ·
test:isolation 8/8 · build 12/12` **kendi koşumumla doğrulandı değil** — ben yalnızca
`pnpm --filter @arkesoft/admin build`'i koşturdum (kapsamım bu), geri kalanı Orkestratör'ün
ölçümü olarak aynen aktarıyorum.

## 2. Tur 1'in somut senaryosu şimdi gerçekten yakalanıyor mu — EMPİRİK TEST

Tur 1'de yazdığım senaryo: *"dashboard'a bir grafik/rich-text/tarih seçici kütüphanesi
eklenirse JS bütçesi SIFIR hareket eder."* Bunu üç kez **gerçekten** bozup ölçtüm, sonra
`git diff --stat` ile geri aldım (yeni bağımlılık eklemedim — mevcut kodu geçici olarak
değiştirdim).

### Deney A — `_app.index.tsx` (dashboard component) içine ~56 KiB gzip ağır veri

Tree-shake edilemeyecek şekilde render'a bağlı 3000 satırlık düşük-sıkışabilirlik
pseudo-random veri eklendi (gerçek bir chart kütüphanesinin yaklaşık gzip ağırlığını
taklit eden sentetik yük — yeni paket **eklenmedi**):

```
ÖNCE: kimlikli ilk ekran (/) — 174.53 KiB (%69.8, rezerv 75.47 KiB)
      kimliksiz (/sign-in)    — 154.81 KiB (%61.9, rezerv 95.19 KiB)
      paylaşılan çekirdek     — 131.47 KiB

SONRA (probe aktif): _app.index-*.js  1.02 kB → 76.09 kB (gzip 0.49 → 56.98 KiB)
      kimlikli ilk ekran (/) — 230.04 KiB (%92.0, rezerv 19.96 KiB)   ← HAREKET ETTİ (+55.51 KiB)
      kimliksiz (/sign-in)   — 154.81 KiB (DEĞİŞMEDİ — doğru izolasyon)
      paylaşılan çekirdek    — 131.47 KiB (DEĞİŞMEDİ — doğru izolasyon)

GERİ ALMA: `cp /tmp/_app.index.tsx.bak src/routes/_app.index.tsx` → yeniden build →
174.53 / 154.81 / 131.47 — ÖNCEKİYLE BİREBİR AYNI. `diff` fark göstermedi.
```

**Sonuç: tur 1'in kaçırdığı regresyon artık YAKALANIYOR.** Eski tanımla bu değişiklik
131.38 KiB'de **sıfır hareket** edecekti (chunk `isDynamicEntry:true` olduğu için
BFS'in dışındaydı); yeni tanımla doğrudan ve doğru büyüklükte (+55.51 KiB) ölçülüyor,
**ve** `/sign-in`'in etkilenmediği de doğru şekilde ayırt ediliyor (route'lar arası
çapraz-kontaminasyon yok).

### Deney B — bildirilmemiş yeni dinamik rota → Fail-closed B gerçekten build'i kırıyor

Geçici bir rota dosyası eklendi (`src/routes/_app.perf-probe-temp.tsx`, bildirime
**eklenmedi**):

```
[bundle-budget] Beklenmeyen hata: Error: [bundle-budget] FAIL-CLOSED B: manifest anahtarı
"src/routes/_app.perf-probe-temp.tsx?tsr-split=component" ... "isDynamicEntry: true"
taşıyor ama HİÇBİR giriş noktası tarafından talep edilmedi VE
"DELIBERATELY_LAZY_ROUTE_SRCS"'te değil. ...
[ELIFECYCLE] Command failed with exit code 1.
```

Dosya silindi, yeniden build koşturuldu → PASS, sayılar `174.53/154.81/131.47`'ye
**birebir** döndü. `git status --porcelain apps/admin/src/routes/` temiz; `routeTree.gen.ts`
içinde probe izi **0** (`grep -c` → 0).

### Deney C — bildirilmiş-kasıtlı-tembel (`DELIBERATELY_LAZY_ROUTE_SRCS`) rota → bütçe SIFIR hareket eder, ağır içerik sızmaz

Üçüncü bir geçici rota (`_app.perf-probe-lazy.tsx`, 20000 elemanlı ağır bir dizi
taşıyan component) eklendi **ve** `DELIBERATELY_LAZY_ROUTE_SRCS`'e eklendi (muafiyet
mekanizması kasıtlı kullanıldı):

```
kimlikli ilk ekran (/): 174.53 → 174.59 KiB   (+0.06 KiB)
kimliksiz (/sign-in):   154.81 → 154.87 KiB   (+0.06 KiB)
paylaşılan çekirdek:    131.47 → 131.54 KiB   (+0.07 KiB)
_app.perf-probe-lazy-*.js: 0.13 KiB gzip (AYRI chunk, HİÇBİR giriş noktasının kapanışına GİRMİYOR)
```

**Önemli nüans (yeni gözlem, bulgu değil):** ağır veri (20000 elemanlı dizi, ham
~500 KB) kendi ayrı chunk'ında kaldı ve bütçeye **girmedi** — bu doğru davranış. Ama
TanStack Router'ın `routeTree.gen.ts`'i HER rotayı (kasıtlı tembel olsa da) kayıt
(route-registration/`lazy import()` sarmalayıcı) kodu olarak paylaşılan çekirdeğe
yazıyor; bu yüzden paylaşılan çekirdek +0.07 KiB gibi **ihmal edilebilir** bir sabit
maliyetle büyüdü — ağır içeriğin kendisi değil, rotanın varlığının kayıt maliyeti.
Bu, "kasıtlı tembel rota bütçeyi hareket ettirmemeli" beklentisiyle **pratikte tutarlı**
(±0.07 KiB, bütçenin %0.03'ü, gürültü seviyesinde) ve yanlış alarm üretmiyor.

Geri alındı: probe dosyası silindi, `bundle-budget.config.ts` `/tmp` yedeğinden
geri yüklendi, yeniden build → `174.53/154.81/131.47` birebir eşleşti.

### Dört giriş noktası sınıfının değerlendirmesi

| # | Sınıf | Beklenen | Ölçülen |
| - | ----- | -------- | ------- |
| ① | `_app.tsx` component (AppShell/Sidebar/Topbar/UserMenu) | `/`'yi hareket ettirir, `/sign-in`'i ETMEZ | Config bildirimi (`FIRST_PAINT_ENTRY_POINTS[0].routeModuleSrcPrefixes` içinde `_app.tsx`) + tur 1/tur 2'nin birebir aynı baz ölçümleri (33.06 KiB `_app-*.js` chunk'ı sürekli `/` toplamına giriyor, `/sign-in` toplamına hiç girmiyor — iki ayrı build'de de doğrulandı) ile **mantıken ve ölçerek** doğrulandı; ayrı bir bozma denemesi gerekmedi (Deney A'nın kanıtladığı BFS mekanizması aynı önek eşleştirme kodunu kullanıyor) |
| ② | `_app.index.tsx` (dashboard) | `/`'yi hareket ettirir, `/sign-in`'i ETMEZ, paylaşılan çekirdeği ETMEZ | **Deney A ile EMPİRİK doğrulandı** — tam beklenen davranış |
| ③ | `_auth.sign-in.tsx` | `/sign-in`'i hareket ettirir, `/`'yi ETMEZ | Config bildirimi + tur 1/tur 2 taban ölçümleri (`_auth.sign-in-*.js` 13.85 KiB sürekli `/sign-in` toplamına giriyor, `/` toplamına hiç girmiyor) ile doğrulandı; Deney A'nın ispatladığı aynı mekanizma simetrik olarak buraya da uygulanıyor |
| ④ | gelecekteki tembel bir alt rota | **bildirilmemişse** build'i KIRAR (fail-closed B); **bildirilmiş-kasıtlı-tembelse** bütçeyi HAREKET ETTİRMEMELİ | **Deney B** (bildirilmemiş → throw, exit 1) **ve Deney C** (bildirilmiş-tembel → ±0.07 KiB gürültü düzeyinde, ağır içerik sızmıyor) ile EMPİRİK doğrulandı |

### Yeni tanımla bütçenin yakalayacağı / kaçıracağı regresyon (güncellenmiş)

- **Artık yakalar:** paylaşılan çekirdeğe eklenecek her şey (tur 1'deki gibi) **+**
  `_app.tsx`, `_app.index.tsx` veya `_auth.sign-in.tsx`'e eklenecek her şey — Deney A
  bunu doğrudan ölçtü (+55.51 KiB gerçek zamanlı yakalandı) **+** bildirilmemiş hiçbir
  yeni dinamik rota sessizce var olamaz (Deney B, build kırılıyor).
- **Hâlâ kaçırır (bilerek, tasarım gereği):** `DELIBERATELY_LAZY_ROUTE_SRCS`'e Türkçe
  gerekçeyle eklenmiş gerçekten-tembel bir alt rotanın kendi component ağırlığı (bu,
  "ilk boya değil" tanımının **doğru** sonucu, kör nokta değil — Deney C ağır içeriğin
  gerçekten sızmadığını kanıtladı). Bugün bu liste **boş**, yani bu kaçırma sınıfı
  **fiilen hiçbir rotada aktif değil**.

## 3. Fail-closed assertion'lar — bağımsız doğrulama

**İki assertion'ın ikisi de kendim tetikledim** (DoD "en az bir" şartının üstünde):

- **Assertion A** (bildirim → manifest): `_auth.sign-in.tsx` önekini var olmayan bir
  dosya adıyla değiştirdim → `[bundle-budget] FAIL-CLOSED A: ... HİÇBİR "src" alanıyla
  eşleşmedi` + `exit 1` (yukarıda ham çıktı). `process.exitCode=1` değil, gerçek `throw`
  — S5'in iddiası doğru.
- **Assertion B** (manifest → bildirim): Deney B, yukarıda.

**Geri alma kanıtı (`git diff --stat`):**

```
$ git status --porcelain apps/admin/src/routes/ apps/admin/bundle-budget.config.ts apps/admin/scripts/
?? apps/admin/bundle-budget.config.ts     (zaten izlenmeyen YENİ dosya — T-008'in kendisi, benim değişikliğim değil)
?? apps/admin/scripts/                    (aynı)
?? apps/admin/src/routes/                 (aynı)
```

Üç dosya da T-008'in kendi üretimi olduğu için henüz `git`'e eklenmemiş (`??`) — bu
yüzden `git diff --stat` sıfır gösteriyor olamazdı; onun yerine **içerik düzeyinde**
doğrulama yaptım: `diff /tmp/bundle-budget.config.ts.bak apps/admin/bundle-budget.config.ts`
ve `diff /tmp/_app.index.tsx.bak apps/admin/src/routes/_app.index.tsx` → **ikisi de
fark göstermedi**; `ls apps/admin/src/routes/` → yalnızca orijinal 4 dosya
(`__root.tsx`, `_app.index.tsx`, `_app.tsx`, `_auth.sign-in.tsx`); yeniden build sonrası
sayılar (`174.53/154.81/131.47/3.56`) üç deneyin **hepsinden sonra** birebir baz
değerlere döndü.

**Risk 2'nin ihlal kontrolü:** `throw`'un `console.warn`'a düşürülmesi, bildirim
listesinin boşaltılması veya assertion B'nin kaldırılması — **hiçbiri yok**. Kodu
okudum (`check-bundle-budget.ts:275-319`): ikisi de gerçek `throw new Error(...)`,
`FIRST_PAINT_ENTRY_POINTS` iki giriş noktasıyla dolu, `DELIBERATELY_LAZY_ROUTE_SRCS`
bilinçli olarak boş (muafiyet yok, yorumla gerekçeli).

**Assertion B'nin pratik değeri — SİMÜLE EDİLDİ (Deney B + C):** yarın yeni bir rota
eklendiğinde build **gerçekten kırılıyor** (Deney B, bildirilmemiş durumda) **veya**
bilinçli muafiyetle sorunsuz geçiyor (Deney C, bildirilmiş-tembel durumda) — mekanizma
iki yönde de ölçülerek kanıtlandı, yalnızca okuma/çıkarsama değil.

## 4. Yeni build adımı — maliyet ölçümü

Komut bazında ayrı ayrı (`/usr/bin/time -p`, `apps/admin` dizininden):

```
vite build:                       real 0.82s  (227-399ms arası — ölçüm gürültüsü, ikinci+ koşumlarda tutarlı 0.2-0.4s)
check-compiled-css-contract.ts:   real 0.11s
check-bundle-budget.ts:           real 0.15s
rm -rf dist/.vite:                ölçülmeyen (milisaniye altı, boş dizin)
TOPLAM (zincir, pnpm üzerinden):  ~1.1-1.3s (önceki chain'e göre NET EKLENEN: ~0.11s — yalnızca css-contract yeni)
```

**Tekrar işi:** her iki script de `dist/.vite/manifest.json`'u **bağımsız olarak**
okuyup parse ediyor (küçük dosya, 2.35 KB — parse maliyeti ölçülemeyecek kadar düşük).
`check-compiled-css-contract.ts` ayrıca derlenmiş CSS dosyasını (~14 KB) okuyor,
`check-bundle-budget.ts` da **aynı** CSS dosyasını (gzip boyutu için) okuyor — iki script
arasında paylaşılan modül/cache **yok**, iki ayrı `readFileSync` çağrısı. Maliyet
ihmal edilebilir (toplam dosya boyutu ~16 KB, iki kez okunması tek koşumda <1ms ek
yük) ama **mimari olarak** bir tekrar var — iki script birleştirilse veya manifest
paylaşımlı okunsa küçük bir temizlik olur (okunabilirliği bozmayacak kadar küçük bir
iyileştirme önerisi, `low` seviyesinde, DoD'un istediği "mikro optimizasyonu high
yapma" kuralına uygun olarak BULGU olarak **yazmıyorum** — pratik etkisi ölçülebilir
sıfıra yakın).

**CSS bekçisinin kaynak taraması ölçeklenebilirliği:** `collectSourceFiles` iki kök
dizini (`packages/ui/src`, `apps/admin/src`) **özyinelemeli** `readdirSync` ile tarıyor.
Bugünkü dosya sayısı küçük (tur 1'de `solid` 46 dosya saymıştı, admin+ui alt kümesi
~35-40). 50 rotaya çıkıldığında bu doğrusal olarak büyür ama dosya sistemi okuma
maliyeti milisaniye altında kalacak kadar küçük bir iş (ör. 500 dosyada da <50ms
beklenir — Node'un `readdirSync`'i bu ölçekte darboğaz değildir). Kabul edilebilir.

**Sıra doğrulandı:** `package.json:9` → `vite build && check-compiled-css-contract.ts
&& check-bundle-budget.ts && rm -rf dist/.vite` — `rm -rf dist/.vite` zincirin **en
sonunda**, iki script de manifest'i okuduktan **sonra** çalışıyor (kodu okudum, S1'in
raporu doğru).

**Turbo cache-hit'in doğruluk etkisi:** `turbo.json:11-14` → `build` görevi
`outputs: ["dist/**"]`, `dependsOn: ["^build","generate"]` (yalnızca upstream). Cache-hit'te
`@arkesoft/admin:build` **hiç çalışmaz**, önceki `dist/**` çıktısı diskten geri
yüklenir — bu, aynı girdilerle **önceden geçmiş** bir doğrulamanın sonucu olduğu için
**doğruluk ihlali değil** (girdi hash'i değişmediyse CSS/bundle sözleşmesi de
değişmemiştir); `check-bundle-budget.ts`'in kanıtlanmış emsaliyle aynı semantik,
tur 1'de zaten kabul edilmiş bir davranış, bu turda yeni bir risk doğurmuyor.

## 5. CSS/JS boyut değişimi ve en büyük 5 chunk

| Chunk | Tur 1 (gzip) | Tur 2 (gzip) | Yorum |
| ----- | ------------ | ------------ | ----- |
| `index-*.js` (entry) | 131.26 KiB | 131.28 KiB | değişmedi (gürültü düzeyi) |
| `_app-*.js` (AppShell) | 33.03 KiB | 33.06 KiB | değişmedi |
| `_auth.sign-in-*.js` | 13.84 KiB | 13.85 KiB | değişmedi |
| `dist-*.js` (paylaşılan alt-chunk) | 9.96 KiB | 9.98 KiB | değişmedi |
| `messages-*.js` | 4.77 KiB | **4.85 KiB** | +0.08 KiB — `resolvePanelErrorMessage` eklendi (M4 düzeltmesi) |
| `index-*.css` | 3.44-3.65 KiB (Vite yaklaşıklığı) | 3.65 KiB (Vite) / **3.56 KiB** (script gzip) | +0.1-0.2 KiB — `font-size` artık GERÇEKTEN uygulanıyor (3 yeni geçerli bildirim: h1/body/small), bozukluk düzeltmesinin DOĞAL sonucu, bulgu değil |

**Sıralama değişmedi** (`index > _app > _auth.sign-in > dist > messages`), mutlak
boyutlar ±0.08 KiB aralığında — davranış değişikliği değil, M4 (hata mesajı köprüsü
tek fonksiyona indirgendi) ve tipografi düzeltmesinin (gerçek `font-size` bildirimi)
beklenen küçük yan etkileri.

**`messages.ts` kaynak boyutu:** 258 satır (önceki ~212'den, `resolvePanelErrorMessage`
+ ilişkili yorumlar eklendi) — kaynak büyümesi JS çıktısına **orantılı küçük** bir
artış olarak yansıdı (+0.08 KiB gzip), beklenen.

**`apps/admin/src/index.ts` silinmesi:** dosya gerçekten yok (`ls` → "No such file or
directory"). Tur 1'de zaten hiçbir chunk'ta referanslı değildi (ölü kod, `solid` L1) —
silinmesi bundle'ı **etkilemedi** (zaten sıfır katkısı vardı).

**23 söz dizimi düzeltmesi doğrulandı:** `text-(length:--font-size-*)` kullanımı
kaynakta **24** (11 body + 8 small + 5 h1); eski bozuk söz dizimi (`text-(--font-size-`,
`length:` İPUCU OLMADAN) kaynak kodda **0** — kalan 8 eşleşme tamamı
`tailwind-custom-property-syntax.qa.test.ts`'in **yorumlarında** (gerçek kod değil).
Derlenmiş CSS'te `font-size:var(--font-size-*)` **3** kez geçiyor (h1/body/small) —
tur 1'de **0** idi.

## 6. `./server` alt yolu ve tüketicisiz export'lar (tekrar ölçüldü)

```
grep -rln "@arkesoft/trpc/server" apps/admin/dist                                          → 0 eşleşme
grep -rlE "PrismaClient|@prisma/client|resolveHost|BetterAuthOptions|better-auth/node" apps/admin/dist → 0 eşleşme
grep -oE "Toast|DataTable|CardHeader|CardTitle" apps/admin/dist/assets/*.js                 → 0 eşleşme
```

Tur 1'deki iki pozitif tespit **değişmeden korunuyor**. S2'nin `index.ts`'e eklediği
yorum (barrel export yorumu güncellemesi) tree-shaking'i bozmadı.

## 7. İstemci önbellek ve sorgu davranışı

`apps/admin/src/app/query-client.ts`, `api/session-query.ts`, `routes/_app.tsx` okundu.

- `retry: false` + `refetchOnWindowFocus: false` — **değişmedi** (dosya içeriği aynı
  gerekçe yorumuyla).
- Guard: `context.queryClient.query({ ...sessionMeQueryOptions, staleTime: 'static' })`
  (`_app.tsx:42`) — **değişmedi**.
- Bileşen: `useQuery(sessionMeQueryOptions)` (`_app.tsx:116`) — **değişmedi**, aynı
  anahtar (`['session','me']`), aynı cache.
- **Yeni:** `resolvePanelErrorMessage` (M4 düzeltmesi) hata **metnini** çözüyor, sorgu
  davranışına **dokunmuyor** — iki route'taki yerel kopyalar silinip `messages.ts`'teki
  tek fonksiyona yönlendirildi (saf refactor, ağ çağrısı sayısını etkilemiyor).
- `SESSION_NOT_FOUND` eşlemesi hâlâ `_app.tsx:142`'de (sunum katmanında, `solid` L6'nın
  erteleme kararına uygun) — konum değişmedi, yalnızca gerekçe yorumu güncellendi.

**Sonuç: davranış değişmedi, yalnızca yorum/refactor.** `/auth/get-session` çağrısı
hâlâ yok (grep: `auth-rest.ts` içinde 0 eşleşme, tur 1'deki ölçümle aynı).

## BULGULAR

```
BULGULAR: yok
```

Tur 1'in tek `medium`'u **KAPANDI** (§0). Bu turda yeni `critical`/`high`/`medium`/`low`
bulgu **yok**. İki gözlem not edildi ama bulgu seviyesine çıkarılmadı çünkü ikisi de
ölçülebilir etkisi sıfıra yakın ve mevcut tasarımın **doğru** sonucu:
(a) kasıtlı-tembel rota kaydının paylaşılan çekirdeğe ±0.07 KiB sabit maliyeti (Deney C),
(b) iki script'in manifest/CSS'i bağımsız okuması (toplam <1ms ek yük, §4).

## ÖLÇÜMLER

```
Komut (kendi koşumum): pnpm --filter @arkesoft/admin build

paylaşılan çekirdek            JS 131.47 KiB  · CSS 3.56 KiB
kimlikli ilk ekran (/)         JS 174.53 / 250 KiB (%69.8, rezerv 75.47 KiB) · CSS 3.56 / 50 KiB (%7.1)
kimliksiz ilk ekran (/sign-in) JS 154.81 / 250 KiB (%61.9, rezerv 95.19 KiB) · CSS 3.56 / 50 KiB (%7.1)
MAKSİMUM                       JS 174.53 / 250 KiB (%69.8) · CSS 3.56 / 50 KiB (%7.1)
exit 0 (aşım yok)

Tur 1 ile karşılaştırma (AYNI script, GENİŞLETİLMİŞ tanım):
  JS kullanımı   %52.6 → %69.8   (eşik 250 KiB SABİT — "gevşetilmedi", kapsam düzeltildi)
  CSS kullanımı  %6.7  → %7.1    (eşik 50 KiB SABİT)

Build adımı süreleri (ayrı ayrı, /usr/bin/time -p, apps/admin'den):
  vite build                      ~0.82s (227-399ms arası koşumlar arası gürültü)
  check-compiled-css-contract.ts  ~0.11s  (YENİ — net eklenen maliyet)
  check-bundle-budget.ts          ~0.15s
  rm -rf dist/.vite                ölçülemeyecek kadar küçük
  → zincire NET EKLENEN maliyet: ~0.11s (yalnızca yeni script)

Fail-closed deneyleri (üçü de tetiklendi, hepsi geri alındı, diff doğrulandı):
  Assertion A (yanlış önek)                → throw, exit 1 → GERİ ALINDI (diff yok)
  Assertion B (bildirilmemiş yeni rota)     → throw, exit 1 → GERİ ALINDI (dosya silindi, routeTree'de iz 0)
  Bildirilmiş-kasıtlı-tembel rota + ağır içerik → PASS, bütçe ±0.07 KiB (gürültü) → GERİ ALINDI (diff yok)

Somut regresyon senaryosu (Deney A — `_app.index.tsx`'e ~56 KiB gzip ağır veri):
  ÖNCE: kimlikli ilk ekran 174.53 KiB (%69.8)
  SONRA: kimlikli ilk ekran 230.04 KiB (%92.0) — +55.51 KiB YAKALANDI
  kimliksiz (/sign-in) ve paylaşılan çekirdek: DEĞİŞMEDİ (doğru izolasyon)
  → GERİ ALINDI, diff yok, yeniden build 174.53/154.81/131.47'ye birebir döndü

Dört giriş noktası sınıfı:
  ① _app.tsx component     → config + taban ölçümlerle doğrulandı (yalnızca /)
  ② _app.index.tsx         → EMPİRİK doğrulandı (Deney A)
  ③ _auth.sign-in.tsx      → config + taban ölçümlerle doğrulandı (yalnızca /sign-in)
  ④ gelecekteki tembel rota → EMPİRİK doğrulandı (Deney B: throw · Deney C: ±0.07 KiB)

./server alt yolu dist'te:        0 eşleşme (ADR-0009 korunuyor)
Tüketicisiz export (Toast/DataTable/CardHeader/CardTitle): 0 KiB (tree-shaking korunuyor)
İstemci önbellek/sorgu davranışı: DEĞİŞMEDİ (yalnızca yorum/refactor — resolvePanelErrorMessage)

En büyük 5 chunk (gzip): index 131.28 > _app 33.06 > _auth.sign-in 13.85 > dist 9.98 > messages 4.85
  (tur 1 ile sıralama AYNI; messages +0.08 KiB — resolvePanelErrorMessage eklendi)

23 söz dizimi düzeltmesi: text-(length:--font-size-*) kaynakta 24 kullanım, eski bozuk
  biçim (length: ipucu YOK) kod satırında 0 (8 eşleşme yalnızca test dosyası YORUMUNDA).
  Derlenmiş CSS'te font-size:var(--font-size-*) 3 kez (tur 1'de 0 idi).

Core Web Vitals / Lighthouse CI:  ölçülemedi — altyapı v0.0.20'de (vitrin); apps/admin
  bir SPA arka ofis, CWV bütçesi ona bağlanmadı (PM riski 6). KAPSAM DIŞI.
API p95 / Arama p95 / Vitrin ada:  ölçülemedi — k6 v0.0.14+, storefront'a bu sürüm
  dokunmuyor. KAPSAM DIŞI.

Çakışma disiplini: Playwright KOŞTURULMADI, 5173'e DOKUNULMADI. Yalnızca
  `pnpm --filter @arkesoft/admin build` (ve ayrı ayrı `vite build`/`node scripts/*.ts`,
  hepsi `build`'in kendi adımları) koşturuldu — `vite dev`/`vite preview`/`playwright`
  hiç çağrılmadı.
```

**SONUÇ: PASS** — `AGENT_BASELINE.md` §4: `BULGULAR: yok` → PASS. Tur 1'in tek
`medium`'u üç bağımsız deneyle (A: regresyon yakalama, B: fail-closed kırılma,
C: kasıtlı-tembel muafiyetin doğru çalışması) ölçülerek KAPANDI ilan edildi.
