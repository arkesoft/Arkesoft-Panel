// @arkesoft/storefront — Vitrinin TEK Türkçe mesaj kataloğu (ROADMAP v0.0.8,
// T-009/S6, architect A4, `docs/ux/T-009.md` "Microcopy" bölümü)
//
// Kullanıcıya dönük HİÇBİR Türkçe literal `src/pages/**`/`src/components/**`
// içinde yazılmaz — hepsi burada (CLAUDE.md §4; `apps/admin/src/messages/
// messages.ts`'in deseni). `docs/ux/T-009.md`'nin 15 benzersiz dizesi
// BİREBİR taşınır: kiracı 6 (`storefront.tenant.*`) · 404 4
// (`storefront.notFound.*`) · 503 5 (`storefront.unavailable.*`).
//
// ⚠ UX'İN NOTU BAĞLAYICI: 404'ün dört dizesinin HİÇBİRİNDE yer tutucu yok —
// AC6'nın "soft-delete edilmiş bir kiracı ile hiç var olmamış bir host BAYT
// BAYT AYNI 404 HTML'ini alır" garantisi bu dosyada da (metnin kendisinde)
// sağlanır: `notFound` altındaki dört alan SABİT string, FONKSİYON DEĞİL.
//
// `tenant.title`/`tenant.heading`/`tenant.disclosureBody`/
// `tenant.metaDescription` `{storeName}` yer tutucusu taşıdığı için
// FONKSİYON olarak tanımlanır (girdi API'den gelen kiracı adı) — bu,
// `docs/ux/T-009.md`'nin "yer tutucular tek sayılır" kuralıyla tutarlı: her
// biri TEK bir benzersiz dize/şablon olarak sayılıyor.

export const MESSAGES = {
  storefront: {
    tenant: {
      /** `<title>` — mağaza adının kendisi, ek metin yok. */
      title: (storeName: string): string => storeName,
      metaDescription: (storeName: string): string =>
        `${storeName} mağazasına hoş geldiniz. Ürünler hazırlanıyor; mağaza sahibi vitrinini doldurdukça burada göreceksiniz.`,
      /** `h1` — başlıkta ikinci bir kelime eklenmedi (ux gerekçesi: docs/ux/T-009.md). */
      heading: (storeName: string): string => storeName,
      body: 'Bu mağaza Arkesoft altyapısı üzerinde kuruldu ve şu anda hazırlanıyor. Ürünler eklendiğinde bu sayfada göreceksiniz.',
      disclosureSummary: 'Bu sayfa neden böyle görünüyor?',
      disclosureBody: (storeName: string): string =>
        `Bu, ${storeName} mağazasının Arkesoft üzerindeki ilk adımı. Mağaza sahibi ürünlerini eklemeye başladığında bu sayfa onların yerini alacak.`,
    },
    notFound: {
      title: 'Mağaza bulunamadı',
      metaDescription: 'Bu adreste bir mağaza bulunamadı.',
      heading: 'Bu adreste bir mağaza bulunamadı',
      body: 'Girdiğiniz adres hiçbir mağazaya ait değil. Adresi kontrol edin veya bağlantıyı size veren kişiden doğrusunu isteyin.',
    },
    unavailable: {
      title: 'Mağaza şu anda yanıt vermiyor',
      metaDescription:
        'Mağaza geçici olarak yanıt vermiyor. Lütfen birkaç dakika sonra tekrar deneyin.',
      heading: 'Mağaza şu anda yanıt vermiyor',
      body: 'Bu geçici bir durum. Mağaza kapatılmadı veya silinmedi; birkaç dakika içinde yeniden yanıt vermesi bekleniyor.',
      retry: 'Yeniden dene',
    },
  },
} as const
