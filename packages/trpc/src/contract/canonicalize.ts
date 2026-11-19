// @arkesoft/trpc — JSON değerinin KANONİK (deterministik) sıralanmış biçimi
// (ROADMAP v0.0.22, T-026/S1, architect madde 5 "Determinizm — yedi önlem")
//
// 🚫 BU DOSYA `src/index.ts`'TEN EXPORT EDİLMEZ: bir iç derleme aracıdır
// (sözleşme yüzeyi artefaktının üretim hattının parçası), public API yüzeyi
// DEĞİLDİR. `../routers/app.router.js` gibi sunucu tarafı bir modülü İTHAL
// ETMEZ (bu dosya genel amaçlı bir JSON yardımcısıdır), ama tutarlılık için
// aynı dosya başı uyarısı burada da tekrarlanır (emsal: `authz/procedure-
// surface.ts:28-30`, `contract/build-contract-surface.ts`'in dosya başı
// yorumu).
//
// ⚠ SAF: dosya YAZMAZ, Node yerleşiklerini İTHAL ETMEZ, `process.`'e
// erişmez, hiçbir dış pakete bağımlı DEĞİLDİR (yalnızca JS yerleşikleri).
//
// D1 + D2 (architect madde 5, "Determinizm — yedi önlem", BU dosyanın
// kapsadığı İKİ önlem):
//   D1 nesne anahtarları ÖZYİNELEMELİ KANONİK (alfabetik) sıralanır —
//      `docs/api-contract-surface.json`'ın `git diff`'i anahtar sırası
//      rastgeleliğinden ETKİLENMESİN (Zod'un `z.toJSONSchema()`'sının ürettiği
//      anahtar sırası dahili uygulama ayrıntısıdır, SÖZLEŞME DEĞİLDİR).
//   D2 `required` dizisi SIRALANIR (alan adlarının listesi, konumsal anlam
//      TAŞIMAZ) — AMA diğer diziler (`enum`/`oneOf`/`anyOf`, dizi elemanları
//      vb.) SIRASI KORUNUR: bunlar KONUMSAL anlam taşır (`oneOf[0]` "color"
//      ilkelidir, `oneOf[7]` "group" — sırayı değiştirmek ŞEMANIN ANLAMINI
//      değiştirir). Bu yüzden `canonicalizeJsonValue` dizileri yalnızca
//      ELEMAN bazında özyinelemeli işler, dizinin KENDİSİNİ SIRALAMAZ —
//      istisna yalnızca anahtarı TAM OLARAK `"required"` olan alanlardır.
//
// ⚠ `as`/`any` KULLANILMAZ: `unknown`'dan dizi/nesne/ilkel ayrımı ÇALIŞMA
// ZAMANI tip koruyucularıyla ({@link isUnknownArray}, {@link isJsonRecord})
// yapılır (emsal: `authz-consistency.test.ts`'in `hasProperty`'si — Zod
// GEREKMİYOR, çünkü burada doğrulanan bir DIŞ DÜNYA girdisi değil, ZATEN
// üretilmiş bir JSON değerinin yapısal şeklidir).

/** `value`'nun bir dizi olduğunu `unknown[]` olarak daraltır — `Array.isArray`'in yerleşik imzası (`arg is any[]`) BİLEREK kullanılmaz, akışa `any` sızdırmasın diye bu sarmalayıcı `unknown[]` döner. */
function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

/** `value`'nun DÜZ bir nesne (dizi/`null`/ilkel DEĞİL) olduğunu daraltır. */
function isJsonRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !isUnknownArray(value)
}

/** `required` anahtarının sıralanacağı TEK nokta — dosya başı yorumunun D2 maddesi. */
const SORTED_ARRAY_FIELD_NAME = 'required'

/**
 * Bir JSON değerini (nesne/dizi/ilkel karışımı) KANONİK biçime çevirir:
 * nesne anahtarları özyinelemeli alfabetik sıralanır (D1), `required`
 * dizileri sıralanır (D2), BAŞKA hiçbir dizinin eleman SIRASI değiştirilmez.
 * Girdiyi MUTASYONA UĞRATMAZ — her seviyede YENİ bir nesne/dizi üretir.
 *
 * ⚠ Dönüş tipi BİLEREK `unknown`'dır (`any` DEĞİL) — bu fonksiyon genel
 * amaçlı bir YENİDEN SIRALAMA aracıdır, girdinin NOMİNAL tipini (ör.
 * `ContractSurfaceDocument`) korumaz/iddia etmez; çağıran (`scripts/
 * generate-contract-surface.ts`, test) sonucu doğrudan `JSON.stringify()`'a
 * verir — o noktada nominal tipe ihtiyaç YOKTUR.
 */
export function canonicalizeJsonValue(value: unknown): unknown {
  if (isUnknownArray(value)) {
    return value.map((item) => canonicalizeJsonValue(item))
  }

  if (isJsonRecord(value)) {
    // ⚠⚠ DÜZELTME (S6, T-026 düzeltme tur 3, `solid` medium bulgusu —
    // "`__proto__` düzeltmesi aşağı akışta etkisiz"): eski gövde
    // `canonical[key] = ...` İLE köşeli-parantez atamasıyla kuruluyordu.
    // Girdi anahtarlarından biri LİTERAL `"__proto__"` İSE (`JSON.parse` bunu
    // meşru bir ÖZ anahtar olarak üretebilir — `classify-contract-change.ts`
    // `stripRootStructuralKeys`/`stripTrackedAxisKeys`'in AYNI gerekçesi)
    // `canonical['__proto__'] = v` öz anahtar YARATMAZ, `canonical`'ın
    // boş nesne LİTERALİNDEN DEVRALDIĞI `[[Prototype]]`'ı DEĞİŞTİRİR ⇒
    // `JSON.stringify` bu bilgiyi GÖRMEZ, girdi SESSİZCE kaybolur —
    // `classify-contract-change.ts`'teki `isSchemaEqual`/
    // `hasUntrackedConstraintChange` BU fonksiyondan geçtiği için sapma
    // orada da GÖRÜNMEZ hale gelirdi. `Object.fromEntries`
    // `[[DefineOwnProperty]]` KULLANDIĞI için bu özel duruma düşmez — girdi
    // "__proto__" taşıyorsa KANONİK çıktı da GERÇEK bir öz "__proto__"
    // anahtarı taşır, bilgi KAYBOLMAZ.
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => {
          const propertyValue = value[key]
          const canonicalValue =
            key === SORTED_ARRAY_FIELD_NAME && isUnknownArray(propertyValue)
              ? [...propertyValue].sort()
              : canonicalizeJsonValue(propertyValue)
          return [key, canonicalValue]
        }),
    )
  }

  return value
}
