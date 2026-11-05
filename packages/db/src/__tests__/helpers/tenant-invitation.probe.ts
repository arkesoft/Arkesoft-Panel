// @arkesoft/db — `tenant_invitation` tablosunun `TenantScopedProbe` uygulaması
// (ROADMAP v0.0.14, T-014/S3, architect K-A0/K-A1 + po R-A7/R-PO6)
//
// NEDEN AYRI DOSYA, AMA AYRI ÇAĞRI NOKTASI DEĞİL (po R-A7, BAĞLAYICI):
// `createTenantIsolationSuite()`'in prob tamlığı kapısı ÇAĞRI BAŞINA kendi
// taksonomisini kendi problarıyla karşılaştırır → repoda `TENANT_SCOPED_TABLES`'ın
// TAMAMINI tek bir `probes` dizisiyle besleyen TEK çağrı noktası olmak ZORUNDA
// (`__tests__/tenant-membership.isolation.test.ts`). Bu dosya bir TEST DOSYASI
// DEĞİL, tabloya özel bilgiyi taşıyan bir yardımcıdır — `describe`/`it`
// İÇERMEZ. `helpers/job.probe.ts` deseninin uygulamasıdır.
//
// ⚠ `audit_log` PROBUNDAN AYRILDIĞI NOKTA (R-PO4 BURADA YOK): `TenantInvitation`
// append-only DEĞİLDİR — `updatedAt` kolonu VAR ve `schema.prisma`'nın yazılı
// sözleşmesine göre tekrar davet AYNI satırı `upsert` ile GÜNCELLER. Yani
// aşağıdaki `updateRowById`/`deleteRowById`'ın üretimde GERÇEK karşılığı var
// (güncelleme: tekrar davet · silme: davet kabul edildiğinde satır SİLİNİR,
// belirteç tek kullanımlık) → `audit-log.probe.ts`'in dosya başındaki
// "üretimde karşılığı yoktur" gerekçesinin burada BİR KARŞILIĞI YOKTUR ve
// bilerek yazılmamıştır.
//
// JENERİK SÜİT BU DOSYAYI BİLMEZ: yedi senaryonun tamamı aşağıdaki sekiz
// fonksiyon üzerinden koşar; süit `TenantInvitation`'ın alan adlarını veya
// `tenant_role` enum'unu HİÇ görmez.

import { randomUUID } from 'node:crypto'

import { TenantRole } from '../../index.js'
import type { PrismaDatabase, TransactionClient } from '../../index.js'
import type { TenantScopedProbe } from './tenant-isolation-suite.js'

/**
 * Probun yazdığı davetin geçerlilik süresi (ms). `expiresAt` NOT NULL'dır ve
 * gerçek TTL bir İŞ KURALIDIR — kayıt defteri `apps/api`'de yaşar (A-A4),
 * `packages/db` onu BİLMEZ ve bilmemelidir (CLAUDE.md §3 — bu paket iş mantığı
 * taşımaz). Buradaki değer yalnızca NOT NULL kısıtını karşılayan bir test
 * sabitidir.
 */
const PROBE_EXPIRY_MS = 60 * 60 * 1000

/**
 * Probun yazdığı `role`. `owner` BİLEREK SEÇİLMEDİ: davet edilebilir roller
 * `invitableRoleSchema` ile `owner` HARİÇ tanımlı (architect K-A4) ve prob
 * üretimdeki anlamla çelişen bir satır yazmamalı. `staff`, `tenant_membership`
 * probunun da kullandığı nötr roldür.
 */
const PROBE_ROLE = TenantRole.staff

/**
 * Probun yazdığı `invitedByUserId`. ⚠ Bu kolon FK TAŞIMAZ (S1 kararı, R-PO6'nın
 * cevabı: "daveti kim gönderdi" bir OLGUDUR — davet edenin silinmesi ne daveti
 * geçersiz kılmalı ne kullanıcı silmeyi kilitlemeli) → gerçek bir `app_user`
 * satırı GEREKMEZ; bu probun `tenant_membership` probundaki gibi bir `User`
 * bağımlılığı YOKTUR.
 *
 * ⚠ KASITLI OLARAK hiçbir kiracı kimliği TAŞIMAZ — süitin 5. senaryosu hata
 * gövdesinin yabancı `tenantId`'yi içermediğini iddia ediyor; buraya kiracı
 * kimliği koymak o iddiayı kendi kodunun sürüklediği bir yanlış pozitife açardı.
 */
const PROBE_INVITED_BY_USER_ID = 'isolation-probe-inviter'

/**
 * Context içinde (`tx`), verilen kiracı için bir `TenantInvitation` satırı
 * kurar ve id'sini döner.
 *
 * ⚠⚠ `email` VE `tokenHash` HER ÇAĞRIDA RASTGELE — BU BİR TEST HİJYENİ DEĞİL,
 * SÜİTİN DOĞRULUĞUNUN ÖN KOŞULU:
 * Tablo İKİ kiracı kapsamlı UNIQUE kısıt taşıyor (`@@unique([tenantId, email])`
 * ve `@@unique([tenantId, tokenHash])`). Süitin 2. senaryosu A context'inde
 * B'nin `tenant_id`'siyle INSERT'in REDDEDİLMESİNİ bekliyor — eğer prob SABİT
 * bir e-posta/hash kullansaydı, B'de `beforeAll`'un yazdığı satır zaten var
 * olduğu için INSERT bu kez RLS `WITH CHECK` yüzünden DEĞİL, UNIQUE kısıt
 * ihlali yüzünden reddedilirdi → `rejects.toThrow()` YEŞİL YANAR ama RLS'i HİÇ
 * ÖLÇMEZ (job probunun `progress` seçimindeki "yanlış sebeple yeşil" tuzağının
 * birebir aynı sınıfı, ADR-0014'ün "vacuous assert" kusuru). Rastgele değerler
 * UNIQUE kısıtını yoldan çıkarır, dolayısıyla reddedilmenin TEK olası sebebi
 * RLS kalır.
 *
 * ⚠ İki kiracının AYNI e-postayı taşıması ŞEMA SEVİYESİNDE SERBESTTİR
 * (kısıtlar kiracı kapsamlı); aynı kiracıda tekrarlamak değildir. Prob bu
 * özelliği ÖLÇMEZ — kiracı kapsamlı benzersizlik kısıtlarının varlığı/şekli
 * migration kümesi linter'ının ve canlı katalog linter'ının işidir (T-014/S1).
 *
 * `email` KÜÇÜK HARFLE üretilir: `randomUUID()` zaten küçük harfli onaltılık
 * üretir, yani şemanın yazılı normalizasyon sözleşmesiyle (S1 → A-DB2)
 * ÇELİŞMEZ. ⚠ O sözleşmenin ZORLAYICISI uygulama katmanındadır (T-014/S4);
 * prob bir zorlayıcı DEĞİLDİR ve öyleymiş gibi okunmamalı.
 */
async function createInvitationRow(tx: TransactionClient, tenantId: string): Promise<string> {
  // ⚠ `id` ELLE VERİLMEZ: `@default(cuid(2))` DDL'de `DEFAULT` ÜRETMEZ
  // (ADR-0003 R2) ve HAM SQL yolunda `id` zorunlu olurdu — bu prob ham SQL
  // kullanmıyor, Prisma istemcisi üzerinden yazıyor; cuid2'yi Prisma üretir.
  const invitation = await tx.tenantInvitation.create({
    data: {
      tenantId,
      email: `probe-${randomUUID()}@arkesoft.test`,
      role: PROBE_ROLE,
      // ⚠ GERÇEK BİR BELİRTEÇ ÖZETİ DEĞİL, yalnızca benzersiz bir yer tutucu.
      // Üretimde bu kolon `sha256("<tenantId>.<secret>")` taşır (architect
      // K-A1) ve HAM BELİRTEÇ HİÇ SAKLANMAZ; prob bir belirteç ÜRETMEZ, yani
      // bu dosyada bir sır YOKTUR (CLAUDE.md §10 md 7/8).
      tokenHash: `probe-token-hash-${randomUUID()}`,
      invitedByUserId: PROBE_INVITED_BY_USER_ID,
      expiresAt: new Date(Date.now() + PROBE_EXPIRY_MS),
    },
  })
  return invitation.id
}

/**
 * `tenant_invitation` tablosunun izolasyon probu — `TENANT_SCOPED_TABLES`'ın
 * DÖRDÜNCÜ üyesi.
 */
export const tenantInvitationProbe: TenantScopedProbe = {
  tableName: 'tenant_invitation',

  insertRow: (tx, tenantId) => createInvitationRow(tx, tenantId),

  findRowById: async (tx, rowId) => {
    const row = await tx.tenantInvitation.findUnique({ where: { id: rowId }, select: { id: true } })
    return row
  },

  insertRowWithForeignTenant: async (tx, foreignTenantId) => {
    await createInvitationRow(tx, foreignTenantId)
  },

  updateRowById: async (tx, rowId) => {
    // `expiresAt` seçildi — üretimdeki GERÇEK güncelleme de budur (tekrar davet
    // geçerlilik süresini uzatır). Kısıt yüzeyi yok: enum/FK/UNIQUE kısıtı
    // TAŞIMAZ, dolayısıyla reddedilmenin TEK sebebi RLS olabilir (job probunun
    // `progress` gerekçesiyle aynı). ⚠ `email`/`tokenHash` BU YÜZDEN SEÇİLMEDİ:
    // ikisi de kiracı kapsamlı UNIQUE kısıtın parçası → bir kısıt ihlali 3./4.
    // senaryonun "bulunamadı" iddiasını YANLIŞ SEBEPLE yeşile çevirebilirdi.
    await tx.tenantInvitation.update({
      where: { id: rowId },
      data: { expiresAt: new Date(Date.now() + PROBE_EXPIRY_MS) },
    })
  },

  deleteRowById: async (tx, rowId) => {
    // Üretimde de GERÇEK bir yol: davet kabul edilince satır SİLİNİR (belirteç
    // tek kullanımlık, soft delete YOK).
    await tx.tenantInvitation.delete({ where: { id: rowId } })
  },

  countAllRowsWithoutContext: async (client: PrismaDatabase) => client.tenantInvitation.count(),

  cleanupTenant: async (client: PrismaDatabase, tenantId: string) => {
    // ⚠ TEMİZLİK KİRACI ÜZERİNDEN GİDER (S1'in S3'e devrettiği ölçüm):
    // davet satırları RLS'e tabi — context'siz bir `tenantInvitation.deleteMany`
    // 0 satır etkiler ve SESSİZCE başarılı olurdu. `tenant` FK'si `onDelete:
    // Cascade` (S1'in R-PO6 kararı, TAM OLARAK bu temizliğin çalışması için)
    // olduğu için kiracıyı silmek bekleyen davetleri birlikte temizler.
    //
    // ⚠ `invitedByUserId` FK'SIZ olduğu için KULLANICI SİLMEK bu satırları
    // TEMİZLEMEZ — bu probun bir `User` temizleme adımı YOKTUR ve olmaması
    // doğrudur (prob hiç `User` satırı yaratmıyor).
    await client.tenant.delete({ where: { id: tenantId } })
  },
}
