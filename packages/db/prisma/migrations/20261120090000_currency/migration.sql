-- @arkesoft/db — para birimi referans tablosu: `currency` (ROADMAP v0.0.18,
-- T-027/S6, architect VERİ MODELİ birebir — AC-48/AC-49).
--
-- EXPAND (tek adım, YIKICI DEĞİL): yalnızca BİR yeni tablo ve BİR idempotent
-- seed satırı eklenir. Hiçbir mevcut kolon kaldırılmaz, hiçbir mevcut kolona
-- zorunluluk eklenmez, hiçbir mevcut kısıt/tip değiştirilmez → bir ÖNCEKİ
-- uygulama sürümü bu şemayla sorunsuz çalışır (bu tabloyu hiç okumaz, A-T27-4)
-- ve platform rollback'i şema rollback'i GEREKTİRMEZ (CLAUDE.md §10 md 10
-- TETİKLENMİYOR — hiçbir yıkıcı adım yok, iki sürüme bölmeye GEREK YOK).
--
-- ⚠⚠ RLS POLİTİKASI BU MIGRATION'DA YAZILMAZ — `currency` PLATFORM
-- SEVİYESİ tablodur (`tenant_id` TAŞIMAZ, architect VERİ MODELİ,
-- `prisma/schema.prisma` → `Currency` model doc'u). Eklenmesi
-- `UNCLASSIFIED_TABLE`/`TENANT_ID_ON_PLATFORM_TABLE` sınıfı bir hataya
-- dönüşürdü. Taksonomi kaydı `packages/db/src/tenancy.ts`'te (AYNI
-- oturumda, bu dosyayla BİRLİKTE): `currency` → `PLATFORM_LEVEL_TABLES`'ın
-- ON ÜÇÜNCÜ üyesi. `TENANT_SCOPED_TABLES` BU MIGRATION'LA DEĞİŞMEDİ (yedide
-- kaldı) — prob tamlığı kapısı KIRMIZIYA DÖNMEDİ.
--
-- `GRANT` BU DOSYADA BİLEREK YOK (`platform_admin`/`platform_audit_log`
-- migration'ının — `20261115100000_platform_admin_and_audit_log/
-- migration.sql` — BİREBİR aynı disiplini): `sql/bootstrap-roles.sql`'in
-- `ALTER DEFAULT PRIVILEGES FOR ROLE arkesoft_migrator` bölümü sayesinde
-- `arkesoft_app` bu tabloya otomatik SELECT/INSERT/UPDATE/DELETE alır
-- (`theme`/`plan`/`platform_admin`'in BİREBİR aynı duruşu). Bunun
-- GERÇEKTEN olduğu VARSAYILMAZ — canlı katalog linter'ının
-- `APP_ROLE_MISSING_DML_PRIVILEGE` kuralıyla her `test:isolation`
-- koşumunda ÖLÇÜLÜR. ⚠ `currency` BİLİNÇLİ OLARAK
-- `APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS`'a EKLENMEDİ (gerekçe
-- `tenancy.ts`'teki genişletme notunda) → bu tablodaki blanket DML yetkisi
-- `theme`/`plan`/`platform_admin` ile BİREBİR aynı ertelemeyle DARALTILMADI
-- — borç `[low]`, vade v0.4.0, sorumlu `db`.
--
-- VERİ TAŞIMA: aşağıdaki `INSERT` TEK DOĞRULUK KAYNAĞI `packages/i18n`'in
-- `SUPPORTED_CURRENCIES`'inin (bugün tek üye `TRY`, `minorUnit: 2`)
-- İŞLETİMSEL ALT KÜMESİNİ veritabanına yazar — `currency` tablosu o kümenin
-- pasif bir aynası DEĞİL, aktif olarak SEED edilen bir KAYIT defteridir;
-- doğruluğu `src/__tests__/currency-i18n-consistency.test.ts`'in iki yönlü
-- drift testiyle (AYNI oturumda) mekanik olarak doğrulanır.
-- `ON CONFLICT ("code") DO NOTHING` İKİ nedenle idempotent: (1) bu migration
-- birden fazla ortamda (dev/CI/prod) ayrı ayrı uygulanacak, (2) `prisma
-- migrate dev` bazı akışlarda TÜM migration kümesini sıfırdan yeniden
-- uygulayabilir. `packages/db/prisma/seed*` bu depoda HİÇ YOK ve seed
-- ÜRETİMDE koşmaz (ölçüldü, architect VERİ MODELİ) → migration içi `INSERT`
-- HER ortama (üretim dahil) ulaşan TEK yoldur.

-- CreateTable
CREATE TABLE "currency" (
    "code" CHAR(3) NOT NULL,
    "minor_unit" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "currency_pkey" PRIMARY KEY ("code")
);

-- SeedData (idempotent — AC-49 tek doğruluk kaynağı: @arkesoft/i18n'in SUPPORTED_CURRENCIES'i)
INSERT INTO "currency" ("code", "minor_unit") VALUES ('TRY', 2) ON CONFLICT ("code") DO NOTHING;
