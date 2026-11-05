// @arkesoft/api — davet YETENEK belirteci (ROADMAP v0.0.14, T-014/S4,
// architect K-A1/K-A9, ADR-0016 madde 6 KOŞUL A)
//
// Belirtecin biçimi: `"<kiracı kimliği>.<gizli yarı>"`.
//
// ⚠ KİRACI KİMLİĞİNİN BELİRTEÇTE TAŞINMASI BİR SIZINTI DEĞİL, İSTİSNANIN
// ÖN KOŞULUDUR: kabul eden kişi TANIM GEREĞİ henüz üye değildir, bu yüzden
// kiracı bağlamını host'tan ALAMAZ (üyelik muhafızı onu keserdi). Kiracı
// kimliği opak bir cuid2'dir; belirteci ELİNDE TUTAN kişi zaten o kiracıya
// davet edilmiş kişidir. Kimliği belirteçten OKUMAK, çağıranın BEYAN ETTİĞİ
// bir kiracı kimliğine güvenmekten kategorik olarak farklıdır — girdi
// şemasında kiracı alanı YOKTUR ve olamaz.
//
// ⚠⚠ HAM BELİRTEÇ ASLA SAKLANMAZ — diskte yalnızca `sha256` ÖZETİ durur
// (K-A1). İki ölçülmüş sonucu var: (1) davet tablosu kimlik bilgisi taşıyan
// modeller listesine GİRMEZ (o liste üç üyede kalır) ve (2) veritabanını
// okuyabilen bir saldırgan geçerli bir belirteç ÜRETEMEZ.
//
// ⚠ ÖZET HAM BELİRTECİN TAMAMI ÜZERİNDEN ALINIR (yalnızca gizli yarı
// üzerinden DEĞİL): böylece bir kiracının belirtecinin gizli yarısı başka
// bir kiracı kimliğiyle birleştirilerek YENİDEN KULLANILAMAZ — ikinci
// kiracının tablosunda o özet BULUNMAZ. Arama zaten `(tenant_id, token_hash)`
// çifti üzerinden yapılır, yani savunma iki katmanlıdır.
//
// ⚠ BU DOSYA HİÇBİR ŞEY LOGLAMAZ ve ham belirteç bir hata bağlamına (dolayısıyla
// loga) GEÇMEZ: ayrıştırma başarısızlıkları PARAMETRESİZ tek bir hata sınıfına
// indirgenir (ADR-0016 madde 6 koşul D).

import { createHash, randomBytes } from 'node:crypto'

import { InvitationInvalidError } from '../errors/domain/invitation-invalid.error.js'
import { INVITATION_SECRET_BYTES } from './member.constants.js'

/**
 * Kiracı kimliği ile gizli yarıyı ayıran karakter. ⚠ Her iki yarı da bu
 * karakteri İÇEREMEZ: kiracı kimliği cuid2'dir (yalnızca küçük harf + rakam),
 * gizli yarı `base64url`'dür (harf, rakam, `-`, `_`). Ayrıştırma bu yüzden
 * İLK ayırıcıya göre yapılır ve belirsizlik taşımaz.
 */
const TOKEN_SEPARATOR = '.'

/**
 * Belirtecin KİRACI YARISININ karakter sınıfı.
 *
 * ⚠⚠ BU DESEN BİR GÜVENLİK KAPISIDIR (ROADMAP v0.0.14, T-014 düzeltme turu 1 —
 * `security` medium #2). Kiracı kimlikleri veri katmanının cuid2 üreticisinden
 * gelir ve ÖLÇÜLDÜ: tablodaki kimliklerin TAMAMI 24 karakterlik KÜÇÜK HARF +
 * RAKAM dizgisidir. Bu sınıfın dışındaki her bayt, karşılığı OLAMAYACAK bir
 * belirteçtir.
 *
 * ⚠ DESEN `trim()` KONTROLÜNÜ KAPSAR VE AŞAR: önceki kapı yalnızca BOŞLUK
 * karakterlerini arıyordu, oysa NUL baytı (U+0000) bir boşluk karakteri
 * DEĞİLDİR — `trim()` onu SOYMAZ. ÖLÇÜLDÜ: NUL taşıyan bir kiracı yarısı
 * kiracı bağlamı kuran katmanın boşluk kapısından da geçiyor ve PostgreSQL
 * `set_config`'in bağlı parametresinde `22021 invalid byte sequence for
 * encoding "UTF8": 0x00` ile REDDEDİYORDU → `AppError` DEĞİL, jenerik bir
 * HTTP 500 + istek başına bir `error` seviyeli HAM kayıt (mesaj + yığın izi).
 * Bu, ADR-0016 madde 6 KOŞUL D'nin "tüm başarısızlık modları AYNI 404"
 * değişmezini AYIRT EDİLEBİLİR kılıyordu ve bu uca kiracı ÜYELİĞİ bile
 * gerekmiyor (kiracı bağlamından muaf yol).
 *
 * ⚠⚠ DÜZELTME ÇAĞIRAN TARAFTADIR: kiracı kapsamlı istemcinin boşluk kapısını
 * sertleştirmek DEĞERLENDİRİLDİ ve REDDEDİLDİ (ADR-0003 madde 1) — o kapı veri
 * katmanının kendi sözleşmesidir, uygulama girdisinin doğrulayıcısı değil.
 */
const TENANT_ID_PATTERN = /^[a-z0-9]+$/

/** Üretilen belirteç ve diske yazılacak özeti. */
export type IssuedInvitationToken = {
  /** ⚠ YALNIZCA e-postaya gider. Tele ÇIKMAZ, loga YAZILMAZ, diske KAYDEDİLMEZ. */
  readonly token: string
  /** Diske yazılan tek değer. */
  readonly tokenHash: string
}

/** Belirteçten türetilen, kabul sorgusunun ihtiyaç duyduğu iki alan. */
export type ParsedInvitationToken = {
  readonly tenantId: string
  readonly tokenHash: string
}

/** Ham belirtecin `sha256` özetini onaltılık (hex) olarak üretir. */
function hashInvitationToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex')
}

/**
 * Yeni bir davet belirteci üretir. Gizli yarı kriptografik olarak güvenli bir
 * kaynaktan gelir (`node:crypto`'nun CSPRNG'si) — `Math.random` TÜRETİLEBİLİR
 * bir dizidir ve bir yetenek belirtecinde KULLANILAMAZ.
 */
export function issueInvitationToken(tenantId: string): IssuedInvitationToken {
  const secret = randomBytes(INVITATION_SECRET_BYTES).toString('base64url')
  const token = `${tenantId}${TOKEN_SEPARATOR}${secret}`

  return { token, tokenHash: hashInvitationToken(token) }
}

/**
 * Ham belirteci kiracı kimliği + özet çiftine ayrıştırır.
 *
 * ⚠ BAŞARISIZLIKTA `null` DÖNMEZ, FIRLATIR (CLAUDE.md §4: "beklenen durumlar
 * için hata fırlat, `null` döndürüp çağıranı tahmine zorlamayın"). Fırlatılan
 * sınıf kabul akışının TEK hata sınıfıdır (ADR-0016 madde 6 koşul D): biçim
 * bozukluğu ile "davet yok" ayrımı çağıran tarafından YAZILAMAZ, çünkü
 * ayrımı taşıyan bir dönüş değeri YOKTUR.
 *
 * ⚠ Kiracı kimliğinin KİMLİK KARAKTER SINIFINDA olması burada zorlanır ve bu
 * bir kolaylık değil bir ZORUNLULUK: sınıf dışında bir bayt taşıyan kiracı
 * kimliğiyle kiracı bağlamı kurmaya çalışmak veri katmanında HAM bir hata
 * fırlatır (yani 500 üretirdi) — oysa bu girdi, geçersiz bir belirteçten başka
 * bir şey değildir ve 404 ile cevaplanmalıdır. ⚠ Kapı T-014 düzeltme turu 1'de
 * `trim()`'den {@link TENANT_ID_PATTERN}'e GENİŞLETİLDİ: boşluk kontrolü NUL
 * baytını geçiriyordu (gerekçenin tamamı desenin dokümanındadır) ve desen
 * boşluk kontrolünü KAPSADIĞI için ikinci bir kapı GEREKMEZ.
 */
export function parseInvitationToken(rawToken: string): ParsedInvitationToken {
  const separatorIndex = rawToken.indexOf(TOKEN_SEPARATOR)

  if (separatorIndex <= 0 || separatorIndex === rawToken.length - 1) {
    throw new InvitationInvalidError()
  }

  const tenantId = rawToken.slice(0, separatorIndex)

  if (!TENANT_ID_PATTERN.test(tenantId)) {
    throw new InvitationInvalidError()
  }

  return { tenantId, tokenHash: hashInvitationToken(rawToken) }
}
