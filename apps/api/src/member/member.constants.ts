// @arkesoft/api — davet akışının iş kuralı sabitleri (ROADMAP v0.0.14,
// T-014/S4, architect A-A4)
//
// ⚠ ÜÇÜ DE ORTAM DEĞİŞKENİ DEĞİL, DIŞA AÇIK KOD SABİTİDİR (A-A4, bağlayıcı):
// değerleri operatör başına değişmez, bir dağıtımda bir kiracının 7 gün
// diğerinin 30 gün TTL'i olması istenen bir şey değil. Env'e taşımak üçüncü
// bir zorunlu ortam değişkeni ve yeni bir operatör kırılması üretirdi —
// `devops` alt görevi bu yüzden AÇILMADI.
//
// ⚠ `export`: kabul kriteri testleri (ayrı alt görev) bu değerleri
// KOPYALAMAZ, buradan okur. Kopyalanmış bir beklenti sabit değiştiğinde
// sessizce yanlışlanır — T-013'ün "beyan ≠ gerçeklik" dersi.
//
// ⚠ ÜÇÜ BİRLİKTE, ORAN SINIRI MEKANİZMASINI AÇMADAN kötüye kullanım yüzeyini
// kapatır (architect K-A9, R-PM9'un cevabı): oran sınırı bu sürümde hiçbir
// tRPC prosedürünü kapsamıyor (vade v0.1.0) — davet ucu ise e-posta GÖNDEREN
// bir yazma ucudur. Üst sınır kiracı başına TOPLAM yüzeyi, bekleme süresi
// ADRES başına tekrarı, TTL ise bir belirtecin ömrünü sınırlar.

/** Davet belirtecinin ömrü — 7 gün (architect A-A4). */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Bir kiracının aynı anda tutabileceği BEKLEYEN (süresi dolmamış) davet
 * sayısının üst sınırı (architect A-A4).
 */
export const PENDING_INVITATION_LIMIT = 50

/**
 * AYNI adrese iki davet arasındaki asgari süre — 60 sn (architect A-A4).
 * Ölçüm noktası davet satırının son güncellenme anıdır (tekrar davet aynı
 * satırı günceller), yani "son gönderimden bu yana geçen süre".
 */
export const INVITATION_RESEND_COOLDOWN_MS = 60 * 1000

/**
 * Davet belirtecinin gizli yarısının ENTROPİSİ (bayt). 32 bayt = 256 bit
 * kriptografik rastgelelik (architect K-A1).
 *
 * ⚠ TUZLAMA/ARGON GEREKMEZ ve bu ölçülmüş bir karardır: parola hash'lerinde
 * tuz+yavaş KDF gerekir çünkü parolalar DÜŞÜK entropilidir ve sözlük
 * saldırısına açıktır. 256 bitlik bir CSPRNG çıktısında kaba kuvvet yüzeyi
 * YOKTUR — tek yönlü bir özet (sha256) "diskteki satırı okuyan belirteci
 * üretemez" garantisi için YETERLİDİR ve sabit zamanlı tek bir indeks
 * aramasına izin verir.
 */
export const INVITATION_SECRET_BYTES = 32

/**
 * Kabul bağlantısının panel yolu. ⚠ Belirteç URL'in FRAGMAN (`#`) kısmında
 * taşınır (architect K-A9, bağlayıcı): fragman sunucuya GÖNDERİLMEZ — ne
 * erişim loglarına, ne `Referer` başlığına, ne de yönlendirme zincirine
 * düşer. Sorgu dizesinde taşımak belirteci bu üç yere birden yazardı.
 *
 * ⚠ Bu rotanın panelde bir karşılığı BU SÜRÜMDE YOKTUR (rota v0.1.0) — davet
 * bağlantısı bugün yalnızca sunucu/entegrasyon istemcisiyle tüketilebilir.
 * Bu bir eksik değil, panel kiracı seçiminin bu sürümde kapsam dışı
 * olmasının doğal sonucudur.
 */
export const INVITATION_ACCEPT_PATH = '/invitations/accept'
