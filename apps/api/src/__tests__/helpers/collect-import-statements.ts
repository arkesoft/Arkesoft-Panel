// @arkesoft/api — paylaşılan import-ifadesi tarayıcısı (ROADMAP v0.1.0,
// T-019 düzeltme turu 5, `solid` tur 2 M-B)
//
// NEDEN BU DOSYA VAR: `collectImportStatements` önceden
// `production-write-path-grep.qa.test.ts` içinde tanımlıydı ve
// `test-harness-redis-profile-isolation.test.ts` onu doğrudan O `.test.ts`
// dosyasından import ediyordu (`.test.ts` → `.test.ts` importu). Vitest bir
// test dosyasını topladığında import ettiği her modülü de DEĞERLENDİRİR —
// `production-write-path-grep.qa.test.ts` kendisi de bir test dosyası
// olduğundan, kendi `describe`/`it` blokları (10 adet) ikinci dosyanın
// içinde İKİNCİ KEZ koşuyordu (`qa` tur 3 ölçtü: 13 = kendi 3 + yabancı 10).
// Bu yalnızca gereksiz iş değil — bir KAPI 2 ihlali "Redis profili
// izolasyonu" dosyasında raporlanıp okuyan ajanı YANLIŞ yere gönderebilirdi.
//
// Düzeltme: saf, test çatısına bağımsız fonksiyon buraya taşındı; iki test
// dosyası da ARTIK birbirini değil, bu paylaşılan yardımcıyı import ediyor.
// `__tests__/helpers/**` zaten yalnızca yardımcı barındırır, `.test.ts` ile
// bitmez — Vitest'in `src/**/*.test.ts` deseni bu dosyayı bağımsız bir test
// dosyası olarak TOPLAMAZ.

/**
 * Bir TypeScript kaynağının `import` ifadelerini çıkarır ve her ifadeyi TEK
 * SATIRA indirger. SAF fonksiyon (dosya okumaz) — bu yüzden sentetik kaynakla
 * doğrudan ölçülebilir.
 *
 * ⚠ Yorumlar BİLEREK kapsam dışı ve bu ölçülmüş bir gerekliliktir: denetim
 * yazma kapısının dosya başı yorumu "logger" kelimesini zaten ANIYOR
 * (iddiasını yazıyor) — yorumları da tarayan bir kapı kendi gerekçe metnini
 * ihlal sanardı.
 *
 * ⚠⚠ NEDEN SATIR BAZLI SÜZME YETMİYOR — `qa` TUR 1'DE ÖLÇÜLMÜŞ KÖR NOKTA
 * (`solid` tur 1, L-4): bu kapının ilk biçimi yalnızca `import` ile BAŞLAYAN
 * satırları süzüyordu. TypeScript import'ları ÇOK SATIRLI yazılabilir ve o
 * biçimde jeton İKİNCİ/ÜÇÜNCÜ satıra düşer; birinci satır `import` ile başlar
 * ama jetonu TAŞIMAZ → kapı YEŞİL kalır. `qa` bunu varsaymadı, ÖLÇTÜ: denetim
 * yazma kapısına gerçek, çözülebilen ve TÜKETİLEN çok satırlı bir logger
 * import'u eklendiğinde `pnpm typecheck` EXIT 0 verdi ve KAPI 3 **7/7 yeşil**
 * geçti. Düzeltme: ifadeler kapanış tırnağına kadar BİRLEŞTİRİLİR.
 */
export function collectImportStatements(source: string): string[] {
  const statements: string[] = []
  let pending: string | undefined

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim()

    if (pending === undefined) {
      if (!line.startsWith('import')) {
        continue
      }
      pending = line
    } else {
      pending = `${pending} ${line}`
    }

    // Bir import ifadesi modül yolunun kapanış tırnağıyla (isteğe bağlı `;`)
    // biter. Kapanmayan ifade SONRAKİ satırla birleşmeye devam eder.
    if (/['"];?$/.test(pending)) {
      statements.push(pending)
      pending = undefined
    }
  }

  return statements
}
