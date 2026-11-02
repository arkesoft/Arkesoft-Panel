T-010 — QA — düzeltme turu 3/3 (2026-11-02, v0.0.9 theme-sdk)

GATE: qa
SONUÇ: PASS

BULGULAR: yok (bu turdaki tek kalem — solid'in bulduğu, qa'nın bağımsız doğruladığı `medium` — kapatıldı; aşağıda kanıt)

KAPATILAN BULGU: `schema-from-definitions.test.ts:60-71` · SEV: medium (solid T-010-solid-tur2)
  Sorun: `migrateThemeSettings` için altı-anahtar testi `{}` (boş) girdisine karşı çalışıyordu;
  `assertDefinitionsAreAcceptable()` devre dışı bırakılsa bile zorunlu `toggle` alanı eksikliğinden
  `ok:false` dönüyordu — test ön kontrolden BAĞIMSIZDI, ayırt edici değildi. Ayrıca `issues[0].code`/
  `.path` hiçbir testte doğrulanmıyordu; `run.ts:296-306`'nın genel-geçer (fallback) dalı yanlışlıkla
  her zaman alınsa hiçbir test fark etmezdi.

ÇÖZÜM (uygulandı, tek dosya): `packages/theme-sdk/src/settings/__tests__/schema-from-definitions.test.ts`
  1. Altı girdinin TÜMÜ `{ [key]: true }` ile test edildi (kendi anahtarını SAĞLayan girdi) —
     ön kontrol kaldırılsa `z.object({[key]: z.boolean()})` bu girdiyi KABUL EDER (herhangi bir
     dize geçerli bir JS nesne özelliği adıdır) → artık `ok:false` sonucu GERÇEKTEN
     `assertDefinitionsAreAcceptable`'a bağlı.
  2. `issues[0]` için `toMatchObject({ code, path, message })` eklendi — `THEME_SETTING_KEY_UNSAFE`/
     `"[0].key"` (altı-anahtar bloğu) ve `THEME_SETTING_INVALID`/`"[1].key"` (EXPLOIT #1, yinelenen
     "hero"). `message` `THEME_CONTRACT_MESSAGES` sabitlerinden alındı — `expect.any(String)` KULLANILMADI.
  3. Describe/test başlıkları ölçtükleri şeyi doğru yansıtacak şekilde yeniden yazıldı.

ÖLÇÜMLER:

KABUL KRİTERİ EŞLEMESİ:
  Kriter → Test → Sonuç
  - "Altı güvensiz/geçersiz key, migrateThemeSettings'te GERÇEKTEN ön kontrolden REDDEDİLİR
    (girdiden bağımsız değil)" → `F1 — migrateThemeSettings: GİRDİ KENDİ anahtarını SAĞLASA
    BİLE altı girdi {ok:false} döner...` (it.each × 6) → GEÇTİ (22/22)
  - "issues[0].code/path/message run.ts:296-306'nın genel-geçer dalını YAKALAR" → aynı blok +
    EXPLOIT #1 testi → GEÇTİ, mutasyonla DOĞRULANDI (aşağıda)
  - "Gerileme yok" → `schemaFromDefinitions`/`deriveDefaultSettings` altı-anahtar blokları,
    EXPLOIT #2, F2 pin testi (`migration-run.test.ts`) → GEÇTİ

TEST SAYILARI:
  - Değişen dosyadaki test sayısı: 22 → 22 (sayı DEĞİŞMEDİ, fixture/assertion güçlendirildi)
  - theme-sdk paketi: 217/217 (taban ile BİREBİR aynı)
  - Toplam (turbo run test --concurrency=1): 940/940 (taban: 940) — gerileme YOK
  - test:isolation: 9/9 görev, 4/4 test (taban: 9/9) — gerileme YOK

ZORUNLU KANIT #1 — AYIRT EDİCİLİK (mutasyon, geri alındı):
  `schema-from-definitions.ts`'teki `assertDefinitionsAreAcceptable(definitions)` çağrısı
  yorum satırına alındı → `npx vitest run src/settings/__tests__/schema-from-definitions.test.ts`:
    Test Files 1 failed (1) · Tests 20 failed | 2 passed (22)
  Yeşil kalan 2 test, BEKLENEN "gerileme yok" testleriydi (yinelenmeyen key ile ok:true/değer
  bekleyen testler) — diğer 20 TÜMÜ kırmızıya düştü. Mutasyon `cp` ile geri alındı;
  `git status --short` → dosyada diff YOK (byte-eşit karşılaştırmayla teyit edildi).

ZORUNLU KANIT #2 — KOD/YOL İSABETİ (mutasyon, geri alındı):
  `run.ts:297`'deki `schemaConstructionError instanceof ThemeContractError` koşulu
  `false && (...)` ile ZORLA genel-geçer (fallback) dalına yönlendirildi →
  `npx vitest run src/settings/__tests__/schema-from-definitions.test.ts`:
    Tests 7 failed | 15 passed (22)
  Kırmızıya düşen TAM OLARAK `code`/`path` assertion'ı taşıyan 7 test (6 altı-anahtar + EXPLOIT #1);
  yalnızca `ok` kontrolü yapan diğer testler (schemaFromDefinitions/deriveDefaultSettings blokları,
  EXPLOIT #2, "gerileme yok" testleri) yeşil kaldı — bu, yeni assertion'ların gerçekten o kod
  yolunu kapattığının kanıtı. Mutasyon geri alındı; `diff` ile byte-eşitlik teyit edildi.

ZORUNLU KANIT #3 — GERİLEME YOK + F2 pin teyidi:
  - `turbo run test --concurrency=1`: 16/16 görev başarılı, 940/940 test (api 312, theme-sdk 217,
    db 166, storefront 66, tenancy 39, admin 37, trpc 32, ui 23, errors 48) — tabanla BİREBİR aynı.
  - `test:isolation`: 9/9 görev, 4/4 test — tabanla aynı.
  - Kök kapı: `pnpm lint` 19/19 · `pnpm typecheck` 19/19 · `pnpm build` 13/13 · `pnpm format:check` temiz.
  - F2 pin teyidi (handoff'ta istenen): `run.ts`'teki `structuredClone` etrafındaki `try`/`catch`
    GEÇİCİ olarak kaldırıldı → `src/__tests__/migration-run.test.ts`'teki B2 testi
    (`DataCloneError: () => 1 could not be cloned.`) KIRMIZIYA döndü (1 failed/12). Mutasyon
    geri alındı; `diff` ile byte-eşitlik teyit edildi — F2 pini SAĞLAM, bu turda BOZULMADI.

KOŞTURULAN KOMUTLAR:
  - `pnpm lint` → exit 0 → 19/19 görev başarılı
  - `pnpm typecheck` → exit 0 → 19/19 görev başarılı
  - `pnpm build` → exit 0 → 13/13 görev başarılı
  - `pnpm format:check` → exit 0 → "All matched files use Prettier code style!"
  - `npx turbo run test --concurrency=1` → exit 0 → 16/16 görev, 940/940 test
  - `pnpm test:isolation` → exit 0 → 9/9 görev, 4/4 test
  - `npx vitest run src/settings/__tests__/schema-from-definitions.test.ts` (üç kez: temiz, mutasyon#1, mutasyon#2) → sırasıyla 22 geçti / 20 kırmızı / 7 kırmızı
  - `npx vitest run src/__tests__/migration-run.test.ts` (temiz + F2 mutasyonu) → 12 geçti / 1 kırmızı(F2)
  - `pnpm test:e2e` → bu Task'ta kritik akışa dokunulmadı (yalnızca test dosyası güçlendirildi), koşturulmadı — gerekçe: üretim davranışı DEĞİŞMEDİ, Playwright kapsamı dışı.
  - `pnpm test:contract` → bu turda ilgisiz (public API/adaptör sözleşmesi dokunulmadı), koşturulmadı.

DOKUNULAN DOSYA: `packages/theme-sdk/src/settings/__tests__/schema-from-definitions.test.ts` (tek dosya).
ÜRETİM KODU: dokunulmadı (yalnızca iki geçici mutasyon kanıtı, her biri `cp` ile byte-eşit geri alındı).
