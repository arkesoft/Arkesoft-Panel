// @arkesoft/api — `solid` tur 2 M-1'in ölçümü, KASITLI BOZMA ile kanıt (QA,
// T-006 tur 2, Orkestratör görev maddesi 4)
//
// `auth-secret-leak.test.ts:182-193`'ün `if (calls.length > 0)` dalı YALNIZCA
// `consoleErrorSpy.mock.calls[0][1]`'i okur — İLK çağrının İKİNCİ argümanı.
// `solid`'in iddiası: kütüphane sırayı değiştirirse, araya BAŞKA bir
// `console.error` çağrısı girerse VEYA hata farklı bir argüman indeksine
// kayarsa `rawError` `undefined` olur, `String(undefined)` → `'undefined'`
// → `not.toContain('wrong')` SESSİZCE geçer — test GERÇEK sızıntıyı
// KAÇIRABİLİR ama YİNE YEŞİL kalır.
//
// Önce bu repoda GERÇEKTEN ölçüldü (bu dosyanın ilk taslağı, HTTP ile
// `createTestApp` kullanıyordu): bugünkü `better-auth@1.7.14` + Prisma
// sürümünde yanlış `DATABASE_URL` şifresi senaryosu `better-call`'un
// `console.error`'ını HİÇ TETİKLEMİYOR (`consoleErrorSpy.mock.calls.length
// === 0`) — bu da `auth-secret-leak.test.ts:189-192`'nin `else` dalının
// solid'in BAĞIMSIZ OLARAK tespit ettiği "zorunlu olarak doğru" (tautolojik)
// kolunun BUGÜN GERÇEKTEN çalışan kol olduğunu doğrular (solid'in M-1 madde
// 2'si).
//
// AŞAĞIDAKİ test, madde 1'in (pozisyon kırılganlığı) kütüphane davranışından
// BAĞIMSIZ, saf bir kanıtıdır: `consoleErrorSpy`'a KENDİMİZ iki çağrı
// enjekte ediyoruz — biri DEKOY (ikinci argümansız, "başka bir kütüphanenin
// ilgisiz uyarısı" benzetimi), biri GERÇEK SIR SIZINTISI (ikinci argümanı
// `DATABASE_URL` şifresini TAŞIYAN bir `Error`). `auth-secret-leak.test.ts
// :182-193`'ün assert MANTIĞI BİREBİR kopyalanır (üretim kodu DEĞİŞMEDİ,
// mevcut test DOSYASI DEĞİŞMEDİ). Amaç: o mantığın POZİSYONA ÇİVİLİ
// olduğunu ve GERÇEK bir sızıntı calls[1]'de dururken SESSİZCE PASS
// verdiğini göstermek.
//
// `no-console` ikisi de KASITLI devre dışı: `console.error`'un GERÇEK
// (spy ile mock'lanmış) çağrısı gerekiyor — test KONUSU tam olarak bu çağrı
// yolu, enjekte edilen `logger` bu senaryoyu TAŞIYAMAZ.

import { describe, expect, it, vi } from 'vitest'

describe('solid tur 2 M-1 — auth-secret-leak.test.ts:182-193 POZİSYONA ÇİVİLİ, kasıtlı bozma kanıtı', () => {
  it('calls[0] bir DEKOY, GERÇEK sızıntı calls[1]’de → mevcut testin mantığı SESSİZCE PASS verir (sahte yeşil)', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    // 1) DEKOY — ikinci argümansız, "başka bir kütüphanenin ilgisiz
    //    uyarısı" (solid'in senaryosu: "kütüphane sırayı değiştirirse").
    // eslint-disable-next-line no-console -- bkz. dosya başı yorumu
    console.error('ilgisiz-üçüncü-parti-uyarısı')

    // 2) GERÇEK SIZINTI — DATABASE_URL şifresini TAŞIYAN bir hata,
    //    better-call'un bugün ÖLÇÜLEN çağrı biçimiyle AYNI (message, cause).
    // eslint-disable-next-line no-console -- bkz. dosya başı yorumu
    console.error(
      'Failed to run background task:',
      new Error(
        'connection failed: postgresql://arkesoft_app:wrong@127.0.0.1:1/arkesoft?schema=public',
      ),
    )

    // Ön koşul: GERÇEK bir sızıntı VAR ve calls[1]'de duruyor (bu test
    // kurgusunun kendisi anlamsız olmasın diye doğrulanıyor).
    expect(consoleErrorSpy.mock.calls.length).toBe(2)
    const secondCallText = String(consoleErrorSpy.mock.calls[1]?.[1])
    expect(secondCallText).toContain('wrong')

    // ⚠ `auth-secret-leak.test.ts:182-193`'ÜN BİREBİR KOPYASI — üretim kodu
    // ve mevcut test dosyası DEĞİŞMEDİ, yalnızca BURADA tekrarlanıyor.
    if (consoleErrorSpy.mock.calls.length > 0) {
      const [firstCall] = consoleErrorSpy.mock.calls
      const rawError: unknown = firstCall?.[1]
      const rawErrorText =
        rawError instanceof Error ? (rawError.stack ?? rawError.message) : String(rawError)
      // KANIT (solid M-1, madde 1): mevcut testin mantığı burada
      // `rawErrorText === 'undefined'` görür (dekoyun ikinci argümanı yok),
      // `'wrong'` İÇERMEZ → PASS verir — GERÇEK sızıntı (yukarıda
      // doğrulanan calls[1]) TAMAMEN GÖRMEZDEN GELİNİR. Bu, "sır sızıntısı
      // kapısı çalışmadan yeşil kalabilir" demektir — sahte yeşil KANITLANDI.
      expect(rawErrorText).toBe('undefined')
      expect(rawErrorText).not.toContain('wrong')
    } else {
      throw new Error('beklenmeyen durum: calls.length 0 olmamalıydı (ön koşul ihlali)')
    }

    consoleErrorSpy.mockRestore()
  })
})

// FIX turu 2, madde 5 — DOĞRULAMA (QA tur 3, Orkestratör madde 5): AYNI
// DEKOY+GERÇEK-SIZINTI senaryosu, `auth-secret-leak.test.ts:298-311`'in
// ARTIK ÜRETİMDE OLAN (düzeltilmiş) mantığının BİREBİR KOPYASIYLA. Beklenen:
// mantık ARTIK calls[1]'deki gerçek sızıntıyı DA görür (tüm çağrı/argümanlar
// tek metne indirgenip KOŞULSUZ taranıyor) — "wrong" metinde BULUNUR. Bu,
// gerçek bir üretim testinde `expect(allCallsText).not.toContain('wrong')`
// çağrısının ARTIK KIRMIZI (doğru şekilde) vereceğinin kanıtıdır; burada o
// assert'i TERSİNE çeviriyoruz (`toContain`) ki BU dosya YEŞİL kalsın ve
// kanıtı BARINDIRSIN (üretim dosyasını taklit eden GERÇEK assert kendi
// dosyasında — `auth-secret-leak.test.ts:311` — zaten koşuyor).
describe('solid tur2 M-1 FIX — düzeltilmiş mantık DEKOY+GERÇEK-SIZINTI senaryosunu YAKALAR', () => {
  it('calls[0] DEKOY, calls[1] GERÇEK sızıntı → DÜZELTİLMİŞ mantık (tüm çağrı/argüman, koşulsuz) sızıntıyı GÖRÜR', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    // eslint-disable-next-line no-console -- bkz. dosya başı yorumu
    console.error('ilgisiz-üçüncü-parti-uyarısı')
    // eslint-disable-next-line no-console -- bkz. dosya başı yorumu
    console.error(
      'Failed to run background task:',
      new Error(
        'connection failed: postgresql://arkesoft_app:wrong@127.0.0.1:1/arkesoft?schema=public',
      ),
    )

    // ⚠ `auth-secret-leak.test.ts:307-310`'un BİREBİR KOPYASI (FIX turu 2,
    // madde 5'in düzeltmesi) — if/else YOK, pozisyona ÇİVİLİ değil.
    const allCallsText = consoleErrorSpy.mock.calls
      .flat()
      .map((value) => (value instanceof Error ? (value.stack ?? value.message) : String(value)))
      .join('\n')

    // KANIT: düzeltilmiş mantık artık calls[1]'deki sızıntıyı GÖRÜYOR —
    // gerçek üretim testindeki `expect(allCallsText).not.toContain('wrong')`
    // bu durumda KIRMIZI verirdi (doğru davranış). Burada tersini assert
    // ediyoruz ki BU kanıt dosyası kendisi YEŞİL kalsın.
    expect(allCallsText).toContain('wrong')

    consoleErrorSpy.mockRestore()
  })
})
