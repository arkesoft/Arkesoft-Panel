// @arkesoft/db — `session.ip_address`/`session.user_agent` CANLI teyidi
// (ROADMAP v0.0.15.1, T-017/S3 — ÖLÇÜM alt görevi)
//
// GEREKÇE: `architect` `better-auth@1.7.14`'ün `internal-adapter.mjs:275-276`'sını
// KAYNAKTAN okudu (Orkestratör doğruladı) ama canlı Postgres'e SQL koşturamadı.
// Okuduğu satırlar:
//   ipAddress: headers ? getIP(headers, options) || "" : "",
//   userAgent: headers?.get("user-agent") || "",
// Buradan İKİ çıkarım çıkardı: (1) `userAgent` `disableIpTracking`'den TAMAMEN
// BAĞIMSIZ — header mevcutken GERÇEK değer satıra yazılıyor; (2) `ipAddress`
// `getIP` `null` döndürdüğünde `NULL` DEĞİL, boş dize (`''`) olarak yazılıyor.
// Bu dosya o iki çıkarımı CANLI veritabanında ölçer ve tekrarlanabilir bir
// regresyon testine çevirir — DB ajanının görevi ÖLÇMEK, şemayı/yorumunu
// DÜZELTMEK DEĞİL (bkz. `packages/db/prisma/schema.prisma:178-182`'nin
// "TANIMLANIR ama DOLDURULMAZ" yorumu — bu dosyanın altıncı testi o yorumun
// `userAgent` kısmını kısmen ÇÜRÜTÜYOR, ama yorumun KENDİSİNE DOKUNULMADI;
// düzeltme S6'nın kapsamı).
//
// CANLI ÖLÇÜM (2026-11-09, `arkesoft-postgres` konteyneri, `arkesoft_auth`
// rolüyle bağlanıp ölçüldü — ölçüm öncesi/sonrası toplam satır sayısı AYNI
// kaldı, hiçbir yazma yapılmadı):
//   toplam satır            : 33336
//   user_agent dolu (≠ '')  : 44     (ör. gerçek değer: "curl/8.7.1" VE
//                                     gerçek tarayıcı UA'ları — Chrome/
//                                     HeadlessChrome; Playwright/manuel curl
//                                     testlerinden geliyor)
//   user_agent boş dize     : 33292
//   user_agent NULL         : 0
//   ip_address dolu (≠ '')  : 0
//   ip_address boş dize     : 33336
//   ip_address NULL         : 0
//
// KARAR: çıkarım (2) — ipAddress'in `''` olduğu — TAM DOĞRULANDI (33336/33336
// boş dize, sıfır NULL). Çıkarım (1) — userAgent'in BAĞIMSIZ MEKANİZMASI
// (header mevcutken gerçek değer yazılması, `disableIpTracking` tarafından
// BASTIRILMAMASI) DOĞRULANDI (44 satırda gerçek UA var, hiçbiri NULL değil) —
// AMA "bugün HER satırda dolu" iddiası DOĞRU DEĞİL: 33336 satırın yalnızca
// %0.13'ü (44) dolu, kalan %99.87'si boş dize. Kök sebep muhtemelen bu paylaşılan
// geliştirme veritabanındaki oturumların BÜYÜK ÇOĞUNLUĞUNUN `User-Agent`
// başlığı GÖNDERMEYEN otomatik istemcilerden (örn. supertest'in varsayılan
// istemcisi) gelmesi — bu dosyanın `packages/db` kapsamında yorum/tahmin
// olarak kalır, kök sebep araştırması bu alt görevin KAPSAMI DIŞINDA.
// Bu nüans S7'nin "sıfır yapılandırmayla cihaz etiketi" tasarımı için RİSK
// olarak Orkestratöre bildirilir — testin KENDİSİ bunu "en az bir satır
// doldu" ile (evrensel değil) doğru kapsamda tutar.
//
// ROL SEÇİMİ: `testMigrationPrisma` (`arkesoft_migrator`, tablo SAHİBİ)
// kullanılır — `testAuthPrisma`/`getTestAuthPrisma()` DEĞİL. Gerekçe: kök
// `.env`'de `DATABASE_AUTH_URL` TANIMLI DEĞİL (yalnızca `.env.example`'da —
// ölçüldü), `getTestAuthPrisma()`'yı normal `pnpm --filter @arkesoft/db test`
// hattında (bu dosya `.isolation.test.ts` DEĞİL) çağırmak o komuta YENİ bir
// zorunlu env bağımlılığı eklerdi — `helpers/test-client.ts`'in R-PO1/R-PO2
// tembellik gerekçesiyle BİREBİR aynı risk. `session` PLATFORM SEVİYESİ
// (RLS YOK, `PLATFORM_LEVEL_TABLES`) olduğu için `arkesoft_migrator` bağlantısı
// içerik okumaya YETERLİ — canlı ölçüldü (`arkesoft_migrator` ile
// `SELECT count(*) FROM session` 0 satır DEĞİL döndü). `token` kolonu
// (sır taşıyan taşıyıcı kimlik) bu dosyada HİÇBİR sorguda OKUNMAZ/YAZDIRILMAZ.
//
// VACUITY BEKÇİSİ: "satır varsa assert et" deseni (`if (cond) { expect(...) }`,
// ELSE'siz) satır YOKSA assert'in SESSİZCE hiç koşmamasına ve testin SAHTE
// YEŞİL dönmesine yol açar (T-016'nın bir güvenlik assert'inin tam bu şekilde
// boşaldığı emsal). Bu dosyadaki HER veri-bağımlı test (④/⑤) bu riski İKİ
// mekanizmayla KAPATIR: (a) `if`/`else`'in HER iki dalında da TAM OLARAK bir
// `expect(...)` çağrısı vardır (satır yoksa dal `DOĞRULANAMADI` durumunu
// AÇIKÇA assert eder, atlamaz); (b) `expect.assertions(1)` test gövdesinin
// BAŞINDA bildirilir — hangi dal koşarsa koşsun test sonunda TAM 1 assertion
// koşmadıysa Vitest testi KIRMIZI yapar (gelecekte biri `if`/`else`'den birini
// erken `return` ile assertion'sız bırakırsa bu mekanik olarak YAKALANIR).
//
// PIN GÜNCELLEMESİ (⑤, T-017/S6 GELDİ): `ip_address` için ÖNCEKİ mutlak
// beklenti ("HER satırda `''`, asla NULL") S6'nın `auth-instance.ts`'in
// `databaseHooks.session.create.before`'u IP'yi DOLDURMAYA başlamasıyla
// — YUKARIDAKİ UYARININ TAHMİN ETTİĞİ GİBİ — KASITLI OLARAK KIRILDI (bu
// İSTENEN davranıştı, "bozuk test" SAYILMADI). ⑤ testi BU YÜZDEN
// GEVŞETİLMEDİ/`skip` EDİLMEDİ — S3'ün türettiği "mutlak satır sayısı
// DEĞİL, varlık/oran" kuralına göre YENİDEN YAZILDI (bu dosyanın başındaki
// VACUITY BEKÇİSİ ilkesiyle AYNI disiplin): ESKİ satırlar (S6'dan ÖNCE
// yazılmış, bu alt görev onları GERİYE DÖNÜK düzeltmez) HÂLÂ `''` kalır,
// bu yüzden "HER satır X" iddiası artık YAPISAL OLARAK YANLIŞ olurdu — yeni
// beklenti "EN AZ BİR satırda `ip_address` artık `''` DEĞİL (gerçek IP VEYA
// `NULL`)", S6'nın hook'unun GERÇEKTEN çalıştığının VARLIK kanıtı. Satır
// yoksa (bu paylaşılan DB'de S6-SONRASI hiçbir `session.create` HENÜZ
// koşmadıysa) test DOĞRULANAMADI der, sessizce atlamaz (vacuity bekçisi).
//
// FIX TURU 1 DÜZELTMESİ (`solid` Tur 1, H-1, high — db/S3 sorumlu): ⑤'in
// İLK sürümü `totalRows > 0` dalının İÇİNE İKİNCİ bir kaçış koymuştu
// (`populatedOrNullIpAddressCount === 0` → `toBe(0)` ile YEŞİL, `> 0` →
// `toBeGreaterThan(0)` ile YEŞİL). Sonuç: değişkenin HER OLASI DEĞERİ için
// test YEŞİL dönüyordu — "S6'nın hook'u GERÇEKTEN çalışıyor" ile "hook hiç
// çalışmıyor" durumları AYIRT EDİLEMİYORDU, oysa bu yorum bloğu testi
// "hook'un çalıştığının VARLIK KANITI" diye İLAN EDİYORDU (beyan ↔
// gerçeklik boşluğu). ④'ün (yukarıda, `:153-174`) tek-kaçışlı (yalnızca
// "tablo boş") disiplinine ÇEKİLDİ: aşağıdaki `totalRows > 0` dalında TEK
// bir DOĞRUDAN assertion vardır, ikinci bir "DOĞRULANAMADI" sığınağı YOKTUR.
//
// ÜÇ SEÇENEK DEĞERLENDİRİLDİ (Orkestratör'ün bıraktığı seçim):
//   (1) iç kaçışı KALDIR — SEÇİLEN.
//   (2) sorguyu S6-SONRASI bir sınıra kapsamla (`createdAt > X` veya testin
//       kendi yarattığı satır) — REDDEDİLDİ: S6'nın hook'u `apps/api`'nin
//       Better Auth örneğinde yaşıyor (`auth-instance.ts`), `packages/db`
//       bu hook'u TETİKLEYEMEZ (`apps/*` → `packages/*` bağımlılık yönü,
//       CLAUDE.md §3) — `packages/db` burada ham bir satır INSERT etse bile
//       hook'un KENDİSİNİ test etmez, yalnızca kendi yazdığı sabit değeri
//       doğrulardı (totolojinin BAŞKA bir biçimi).
//   (3) ⑤'i KALDIR, gerçek korumaya (`apps/api/src/__tests__/
//       session-ip-and-last-seen.test.ts:147-150`) ATIF yap — REDDEDİLDİ:
//       bu, `packages/db`'nin regresyon yüzeyini TAMAMEN terk ederdi; ④ ile
//       AYNI disiplinle düzeltilebilecek bir testi SİLMEK orantısız.
//
// (1)'İN CI/TEMİZ-DB GÜVENLİĞİ (ÖLÇÜLDÜ, mutlak satır sayısına DEĞİL):
// `resolveSessionIpAddressForCreateHook` (`apps/api/src/auth/
// auth-instance.ts:271-273`) `clientIp`'i OLDUĞU GİBİ döndürür — S6-SONRASI
// KOD HİÇBİR satıra `''` YAZMAZ (yalnızca gerçek IP veya `null`). Bu yüzden
// `totalRows > 0` dalına BİR CI koşumunda GİRİLDİYSE (yani en az bir
// `session.create` bu koşumda GERÇEKTEN çalıştıysa), o satır(lar) YAPISAL
// OLARAK `populatedOrNullIpAddressCount`'a KATILIR — aşağıdaki assertion
// paylaşılan geliştirme veritabanının BİRİKMİŞ geçmişine (`''` yazan eski
// satırlar + yeni satırlar) BAĞIMLI DEĞİLDİR, S6-SONRASI kodun KENDİ
// semantiğine bağımlıdır. Tersi (hiçbir `session.create` bu koşumda
// ÇALIŞMADI) `totalRows === 0`'a düşer ve YUKARIDAKİ (değişmeyen) "tablo
// boş" kaçışına girer — o dal bu FIX'in KAPSAMI DIŞINDA, `④` ile AYNI kalır.
// Canlı ÖLÇÜM (2026-11-10, paylaşılan dev DB, `arkesoft_migrator`): toplam
// 37311 satır, `ip_address IS NULL OR ip_address <> ''` → 3169 (sıfır DEĞİL)
// — iç kaçış kaldırılmadan ÖNCE DE bu koşumda hiç TETİKLENMİYORDU (ölü kod),
// kaldırılması bu ortamda davranışı DEĞİŞTİRMEZ; CI'ın efemer Postgres'inde
// de AYNI yapısal garanti geçerlidir (ölçüm için `qa`/`db` FIX turu raporuna
// bakın).

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { testMigrationPrisma } from './helpers/test-client.js'

/** `information_schema.columns`'tan okunan tek satırın şekli — Zod ile doğrulanır (CLAUDE.md §4). */
const sessionColumnRowSchema = z.object({
  columnName: z.string(),
  dataType: z.string(),
  isNullable: z.boolean(),
})

/** `pg_indexes`'ten okunan tek satırın şekli. */
const sessionIndexRowSchema = z.object({
  indexName: z.string(),
  indexDef: z.string(),
})

describe('session tablosu meta veri kolonları — canlı teyit (T-017/S3)', () => {
  it('ip_address ve user_agent kolonları katalogda VAR (şema sözleşmesi)', async () => {
    const rows = await testMigrationPrisma.$queryRaw`
      SELECT
        column_name::text AS "columnName",
        data_type::text AS "dataType",
        (is_nullable = 'YES') AS "isNullable"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'session'
        AND column_name IN ('ip_address', 'user_agent')
      ORDER BY column_name
    `
    const parsed = z.array(sessionColumnRowSchema).parse(rows)

    expect(parsed).toEqual([
      { columnName: 'ip_address', dataType: 'text', isNullable: true },
      { columnName: 'user_agent', dataType: 'text', isNullable: true },
    ])
  })

  it('② YARDIMCI ÖLÇÜM: tenant_id kolonu YOK — session platform seviyesi (CLAUDE.md §7 uygulanamazlığının dayanağı)', async () => {
    const rows = await testMigrationPrisma.$queryRaw`
      SELECT column_name::text AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'session'
        AND column_name = 'tenant_id'
    `
    const parsed = z.array(z.object({ columnName: z.string() })).parse(rows)

    expect(parsed).toEqual([])
  })

  it('③ YARDIMCI ÖLÇÜM: user_id üzerinde indeks VAR (@@index([userId]) karşılığı)', async () => {
    const rows = await testMigrationPrisma.$queryRaw`
      SELECT
        indexname::text AS "indexName",
        indexdef::text AS "indexDef"
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'session'
        AND indexname = 'session_user_id_idx'
    `
    const parsed = z.array(sessionIndexRowSchema).parse(rows)

    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.indexDef).toContain('user_id')
  })

  it('④ MEKANİZMA KANITI: user_agent header mevcutken GERÇEK değer satıra yazılıyor (en az bir satır) — satır yoksa DOĞRULANAMADI', async () => {
    expect.assertions(1)

    const totalRows = await testMigrationPrisma.session.count()

    if (totalRows === 0) {
      // Vacuity bekçisi (b): tablo BOŞ — architect'in çıkarımı bu koşumda
      // DOĞRULANAMADI. Bu dal da TAM OLARAK bir assertion üretir, sessizce
      // atlanmaz.
      expect(totalRows).toBe(0)
      return
    }

    // 2026-11-09 canlı ölçüm: 33336 satırdan 44'ü dolu (ör. "curl/8.7.1" ve
    // gerçek tarayıcı UA'ları) — "en az bir satır dolu" MEKANİZMAYI kanıtlar,
    // "her satır dolu" İDDİASINI KANITLAMAZ (bkz. dosya başı KARAR notu).
    const nonEmptyUserAgentCount = await testMigrationPrisma.session.count({
      where: { userAgent: { not: '' } },
    })

    expect(nonEmptyUserAgentCount).toBeGreaterThan(0)
  })

  it('⑤ PIN GÜNCELLEMESİ (T-017/S6, FIX turu 1 — solid H-1 düzeltmesi): ip_address artık BAZI satırlarda boş dize DIŞINDA (gerçek IP veya NULL) — en az bir satır bunu kanıtlar; satır yoksa DOĞRULANAMADI', async () => {
    expect.assertions(1)

    const totalRows = await testMigrationPrisma.session.count()

    if (totalRows === 0) {
      // Vacuity bekçisi (b): tablo BOŞ — bu koşumda DOĞRULANAMADI.
      expect(totalRows).toBe(0)
      return
    }

    // S6'nın hook'u (`resolveSessionIpAddressForCreateHook`,
    // apps/api/src/auth/auth-instance.ts) YENİ satırları ('' DEĞİL — gerçek
    // IP veya NULL) yazar; ESKİ satırlar (S6'dan ÖNCE) hâlâ '' kalabilir —
    // bu yüzden MUTLAK bir "her satır X" iddiası DEĞİL, VARLIK iddiası
    // (S3'ün türettiği kural). ④'ün disiplini TEKRARLANIR: bu daldan
    // itibaren İKİNCİ bir "DOĞRULANAMADI" kaçışı YOKTUR (dosya başı FIX
    // TURU 1 notuna bakın, solid Tur 1 H-1) — assertion DOĞRUDAN'dır ve
    // KIRMIZI verebilir.
    const populatedOrNullIpAddressCount = await testMigrationPrisma.session.count({
      where: {
        OR: [{ ipAddress: null }, { ipAddress: { not: '' } }],
      },
    })

    expect(populatedOrNullIpAddressCount).toBeGreaterThan(0)
  })
})
