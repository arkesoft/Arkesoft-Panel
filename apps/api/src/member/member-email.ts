// @arkesoft/api — davet e-postası normalizasyonu (ROADMAP v0.0.14, T-014/S4,
// architect K-A1 · A-DB2'nin zorlayıcısı)
//
// ⚠⚠ A-DB2 (veri katmanının varsayımı, BURADA KARŞILANIR): davet tablosunun
// `(tenant_id, email)` benzersizlik kısıtı NORMALİZE EDİLMEMİŞ bir değerle
// DELİNİR — `A@x.com` ve `a@x.com` iki AYRI satır üretir, "bu adrese zaten
// davet var mı" kontrolü atlanır ve bekleyen davet üst sınırı aynı posta
// kutusu için defalarca aşılabilir. Normalizasyon bir VERİTABANI KISITI
// DEĞİLDİR; yazma ve karşılaştırma yolunun sözleşmesidir ve o yol BURADAN
// geçer.
//
// ⚠ TEL ŞEMASI BU İŞİ YAPMADI ve bu bilinçliydi (sözleşme katmanının yazılı
// kararı): şema bir `.transform()` ile girdiyi SESSİZCE değiştirmez —
// sözleşme katmanı doğrular, dönüştürmez. Dönüşüm uygulama katmanının işidir.
//
// ⚠⚠ YEREL DUYARLI KÜÇÜLTME (`toLocaleLowerCase`) KULLANILMAZ VE BU
// PLATFORMDA ÖZELLİKLE TEHLİKELİDİR: Türkçe yerelinde `'I'` karakteri
// NOKTASIZ `'ı'`ya düşer (`'I'.toLocaleLowerCase('tr')` → `'ı'`), yani
// `ILKE@x.com` adresi `ılke@x.com`a dönüşürdü — var olmayan bir posta
// kutusu. `String.prototype.toLowerCase()` yerel duyarsızdır (Unicode
// varsayılan büyük/küçük eşlemesi) ve bu yüzden TEK doğru seçimdir. Çalışma
// zamanı yerelinin (`process.env.LANG`, konteyner imajı) bu fonksiyonu
// etkilememesi bir rastlantı değil, seçimin SEBEBİDİR.
//
// ⚠ KAPSAM: yalnızca büyük/küçük harf ve kenar boşluğu. Nokta soyma,
// `+etiket` ayıklama gibi SAĞLAYICIYA ÖZGÜ normalizasyonlar YAPILMAZ —
// `a.b@gmail.com` ile `ab@gmail.com` RFC 5321'e göre FARKLI posta
// kutularıdır; eşitlemek bir kiracının davetini yanlış kişiye açardı.

/**
 * Davet e-postasını saklama/karşılaştırma biçimine çevirir.
 *
 * Yazma yolunda (davet oluşturma) ve karşılaştırma yolunda (kabul anında
 * oturum e-postası ↔ davet adresi) AYNI fonksiyon kullanılır — iki yerde iki
 * farklı normalizasyon, kısıtı delmenin en kolay yoludur.
 */
export function normalizeMemberEmail(raw: string): string {
  return raw.trim().toLowerCase()
}
