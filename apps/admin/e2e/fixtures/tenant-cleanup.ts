// @arkesoft/admin — e2e veri fabrikası temizliği: tenant + app_user (+ onun
// CASCADE ile giden tenant_membership/session/account/two_factor satırları)
// (ROADMAP v0.0.19, T-020/S5, ADR-0022 Karar 1 — K1, dört zorunlu koruma;
// v0.0.20, T-021/S9, ADR-0022 Karar 1 — ⭐ GÜNCELLEME — alt süreç
// yardımcısının gövdesi `scripts/playwright/sql.ts`'e TAŞINDI).
//
// NEDEN BU DOSYA VAR (architect D-1, bağlayıcı): `registration-flow.spec.ts`
// HER koşumda bir `tenant` + `app_user` + `tenant_membership` SIZDIRIYOR
// (eskiden `afterAll` yoktu, yalnızca `context.close()` vardı); `panel-flow.
// spec.ts` ve `session-security-dialog-focus.qa.spec.ts` da kendi fixture
// kullanıcılarını SIZDIRIYORDU. Bu dosya üçünün de teardown'ını taşır.
//
// İKİ FABRİKA, PAYLAŞILAN TEK ALT SÜREÇ MODÜLÜ (ADR-0022 Karar 1, ⭐
// GÜNCELLEME, 2026-11-15): `apps/storefront/e2e/fixtures/
// custom-domain-tenant.ts` AYNI Docker konteyneri içinde SQL çalıştıran
// alt süreç yolunu kullanır (Prisma/`@arkesoft/db` YOK — K2'nin "ikinci test-only bağlantı
// profili AÇILMAYACAK" kararını BOZMAZ, `apps/admin`'in `package.json`'ında
// `@arkesoft/db` bağımlılığı/devDependency'si zaten YOK). Bu alt sürecin
// GÖVDESİ artık BU İKİ dosyada BAĞIMSIZ kopya DEĞİL — TEK paylaşılan
// modülde (`scripts/playwright/sql.ts`); gerekçe o modülün dosya başı
// yorumunda ve ADR-0022'nin güncelleme bloğunda (sapma `solid` tur2'de
// ~117 satır/+%41 ölçüldü, üçüncü fabrika kopyayı üçe çıkaracaktı). Bu
// dosyada KALAN: kendi `e2e-` önek deseni (`E2E_FIXTURE_EMAIL_PATTERN`,
// `E2E_FIXTURE_TENANT_SLUG_PATTERN`), kendi tablo/temizlik mantığı
// (`deleteFixtureUserByEmail`/`deleteFixtureTenantBySlug`/
// `sweepOrphanedE2eFixtures`) ve paylaşılan modüle geçirilen kendi hata
// metni öneki (`'tenant-cleanup'`).
//
// TABLO ADLARI (packages/db/prisma/schema.prisma, DOKUNULMADI, OKUNDU):
// kiracı → `tenant` (kolon `slug`), kullanıcı → `app_user` (R3 — model adı
// `User`, tablo adı `app_user`, kolon `email`). `TenantMembership.tenant` VE
// `TenantMembership.user` İKİSİ DE `onDelete: Cascade` (`schema.prisma:414,
// 428`) — `tenant` veya `app_user` satırını silmek `tenant_membership`'i
// YETİM BIRAKMAZ. `Session`/`Account`/`TwoFactor` da `onDelete: Cascade`
// (`schema.prisma:266,299,394`) — `app_user` silinince hepsi gider. Bu
// yüzden çağıran sırasıyla ÖNCE `deleteFixtureTenantBySlug` (varsa) SONRA
// `deleteFixtureUserByEmail` çağırır — ikisi de SIFIR satır eşleşirse
// (zaten silinmiş/hiç oluşmamışsa) sessizce no-op'tur (idempotent).
//
// KORUMA (c) — Kapsamlı silme: ÇIPLAK `DELETE FROM tenant`/`DELETE FROM
// "app_user"` YASAK. Her silme KENDİ fail-closed biçim denetiminden geçmek
// zorunda (aşağıdaki iki regex). Seed'in `demo-yonetici@arkesoft.test`
// kullanıcısı BU BİÇİME UYMAZ (ÖLÇÜLDÜ: `panel-flow.spec.ts:160` bu
// e-postayı SEED'İN sabit kullanıcısı olarak anıyor — sabit bir ad, zaman
// damgası YOK) ⇒ `@arkesoft.test` domain'i TEK BAŞINA yetersiz bir sınır
// olurdu (seed verisiyle ÇAKIŞIRDI), bu yüzden biçim denetimi zaman
// damgası segmentini de ZORUNLU kılıyor. Tenant slug biçimi
// `store-wizard-controller.ts:136`'nın `normalizeTenantSlug` çıktısıdır
// (OKUNDU, UYDURULMADI — `packages/tenancy/src/slug.ts:102-112`): testler
// mağaza adını BİLEREK `E2E Mağaza ${Date.now()}` ile giriyor, normalize
// edilince `e2e-magaza-<13 haneli zaman damgası>` olur.
//
// KORUMA (d) — Bu dosyanın paylaşılan modül üzerinden GERÇEKLEŞEN Docker
// konteyneri alt süreç çağrısı kullanımı `scripts/guards.sh`'in ADR-0022
// K1(d) taramasının GÖRÜŞ ALANINDA: `apps/admin/src/**`'e tek bir satır
// sızarsa o tarama KIRMIZI verir; kabuk-çağrısı mekanizmasını/düzyazısını
// kullanan dosya kümesi artık TAM OLARAK `scripts/playwright/sql.ts`
// olmak ZORUNDADIR — bu dosyanın KENDİSİ o jetonları TAŞIMAZ.
import { querySqlRows, runSql } from '../../../../scripts/playwright/sql.js'

/** Bu fabrikanın paylaşılan modüle geçirdiği hata metni öneki. */
const SQL_ERROR_LABEL = 'tenant-cleanup'

/**
 * E2E fixture kullanıcılarının e-posta biçimi — `<önek>-<13+ haneli zaman
 * damgası>-<rastgele alfasayısal kuyruk>@arkesoft.test`. Dört gerçek üretici
 * BU BİÇİME uyuyor (`verified-fixture-user.ts:118`, `panel-flow.spec.ts:121`,
 * `session-security-dialog-focus.qa.spec.ts:148` — üçü de `Date.now()` +
 * `Math.random().toString(36).slice(2,10)` kullanıyor), seed'in sabit
 * `demo-yonetici@arkesoft.test`'i UYMUYOR (zaman damgası segmenti YOK).
 */
const E2E_FIXTURE_EMAIL_PATTERN = /^[a-z0-9-]+-\d{10,}-[a-z0-9]{1,10}@arkesoft\.test$/

/**
 * E2E fixture tenant slug biçimi — `e2e-` önek + zaman damgalı segment
 * ZORUNLU (`normalizeTenantSlug('E2E Mağaza 1731712345678')` →
 * `e2e-magaza-1731712345678`, OKUNDU — `packages/tenancy/src/slug.ts`).
 */
const E2E_FIXTURE_TENANT_SLUG_PATTERN = /^e2e-[a-z0-9-]*\d{10,}$/

/**
 * Bir e2e fixture kullanıcısını (ve `app_user`'a CASCADE ile bağlı
 * `session`/`account`/`two_factor`/`tenant_membership` satırlarını)
 * e-postasıyla siler. Biçim UYMUYORSA fırlatır — ÇIPLAK silme YOK (dosya
 * başı koruma (c)). Eşleşen satır YOKSA (zaten silinmiş) sessizce no-op.
 */
export function deleteFixtureUserByEmail(email: string): void {
  if (!E2E_FIXTURE_EMAIL_PATTERN.test(email)) {
    throw new Error(
      `tenant-cleanup: "${email}" e2e fixture e-posta biçimine uymuyor — fail-closed kapı tetiklendi (çıplak silme reddedildi)`,
    )
  }
  runSql(`DELETE FROM app_user WHERE email = '${email}';`, SQL_ERROR_LABEL)
}

/**
 * Bir e2e fixture kiracısını slug'ıyla siler — `tenant_membership` satırı
 * `tenant_id` FK'sinin `ON DELETE CASCADE`'iyle (packages/db şeması,
 * DOKUNULMADI) birlikte gider; `app_user` satırına bu fonksiyon DOKUNMAZ
 * (çağıran `deleteFixtureUserByEmail`'i AYRICA çağırmalı). Biçim
 * UYMUYORSA fırlatır — ÇIPLAK silme YOK (dosya başı koruma (c)). Eşleşen
 * satır YOKSA (zaten silinmiş/hiç oluşturulamamış) sessizce no-op.
 */
export function deleteFixtureTenantBySlug(slug: string): void {
  if (!E2E_FIXTURE_TENANT_SLUG_PATTERN.test(slug)) {
    throw new Error(
      `tenant-cleanup: "${slug}" e2e fixture tenant slug biçimine uymuyor — fail-closed kapı tetiklendi (çıplak silme reddedildi)`,
    )
  }
  runSql(`DELETE FROM tenant WHERE slug = '${slug}';`, SQL_ERROR_LABEL)
}

/**
 * ⚠ İDEMPOTENT ÖNEK SÜPÜRMESİ (`globalTeardown`'ın TEK çağıranı, bkz.
 * `../global-teardown.ts`). Tek testin kendi `afterAll`'ı bir çökme/timeout
 * yüzünden ÇALIŞMAZSA bırakılan satırları temizler. `LIKE` yalnızca
 * ADAY satırları Postgres'ten ÇEKMEK için kullanılır (geniş tarama) —
 * GERÇEK silme kararı koruma (c)'nin AYNI katı regex'inden geçen satırlar
 * İÇİN verilir (seed verisi `LIKE` ile ADAY olabilir ama regex'i GEÇEMEZ,
 * bkz. dosya başı koruma (c)). Hiç aday yoksa (önceki koşumun kendi
 * `afterAll`'ları başarıyla temizlediği durum — NORMAL YOL) iki döngü de
 * SIFIR kez döner ⇒ idempotent.
 */
export function sweepOrphanedE2eFixtures(): void {
  // ⚠ ÖLÇÜLMÜŞ DÜZELTME (T-020/S5, gerçek altyapıda bulundu): bu sorgu
  // ESKİDEN gevşek bir `LIKE` kullanıyordu (yalnızca Postgres'ten ADAY
  // ÇEKMEK için) — bu depoda `@arkesoft.test` domaini `apps/api`'nin KENDİ
  // Vitest fixture'ları TARAFINDAN DA kullanıldığından (ÖLÇÜLDÜ: 56785
  // satır), gevşek sorgu TEK SEFERDE >1MB metin döndürdü ve alt süreç
  // çağrısı VARSAYILAN tampon sınırını AŞTI. Sorgu BURADA JS regex'iyle
  // BİREBİR aynı POSIX düzenli ifadeye (`~`) SIKILAŞTIRILDI — Postgres'in
  // KENDİSİ dar adayı (ÖLÇÜLDÜ: 471/56785) döner, JS regex'i AYNI
  // katılıkta İKİNCİ bir savunma katmanı olarak KALIR (dosya başı koruma
  // (c), tek nokta ARIZASI yok).
  const candidateSlugs = querySqlRows(
    `SELECT slug FROM tenant WHERE slug ~ '^e2e-[a-z0-9-]*[0-9]{10,}$';`,
    SQL_ERROR_LABEL,
  )
  for (const slug of candidateSlugs) {
    if (E2E_FIXTURE_TENANT_SLUG_PATTERN.test(slug)) {
      deleteFixtureTenantBySlug(slug)
    }
  }

  const candidateEmails = querySqlRows(
    `SELECT email FROM app_user WHERE email ~ '^[a-z0-9-]+-[0-9]{10,}-[a-z0-9]{1,10}@arkesoft\\.test$';`,
    SQL_ERROR_LABEL,
  )
  for (const email of candidateEmails) {
    if (E2E_FIXTURE_EMAIL_PATTERN.test(email)) {
      deleteFixtureUserByEmail(email)
    }
  }
}
