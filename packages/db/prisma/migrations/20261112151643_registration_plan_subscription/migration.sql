-- @arkesoft/db — kayıt modeli: `plan`, `subscription` tabloları, iki yeni
-- ENUM (`site_type`, `subscription_status`), `tenant.site_type` kolonu ve
-- `subscription` için RLS politikası (ROADMAP v0.1.0, T-019/S1, architect
-- VERİ MODELİ birebir, ADR-0021 §4).
--
-- EXPAND (tek adım, YIKICI DEĞİL): yalnızca İKİ yeni enum tipi, İKİ yeni
-- tablo, bir NULLABLE kolon (DB `DEFAULT` YOK — tablo rewrite yok), İKİ
-- yeni indeks, İKİ yabancı anahtar ve `subscription` için RLS politikası
-- eklenir. Hiçbir mevcut kolon kaldırılmaz, hiçbir mevcut kolona
-- zorunluluk eklenmez, hiçbir mevcut kısıt/tipin karşılığı değiştirilmez →
-- bir ÖNCEKİ uygulama sürümü bu şemayla sorunsuz çalışır (bu iki tabloyu
-- HİÇ okumaz, `tenant.site_type`'ı hiç yazmaz/okumaz) ve platform
-- rollback'i şema rollback'i GEREKTİRMEZ (CLAUDE.md §10 md 10
-- TETİKLENMİYOR, ROADMAP Sürüm Politikası "expand/contract").
--
-- ⚠⚠ `Tenant.planId` BU MIGRATION'DA FK KAZANMAZ (bilerek — ADR-0021 §4):
-- kolon DEPRECATED ilan edildi (`prisma/schema.prisma` → `Tenant` model
-- doc'u), tek doğruluk kaynağı `subscription.plan_id`'dir. FK yazmak
-- T-018'in kapattığı çift doğruluk kaynağı borcunu yeniden doğururdu.
--
-- VERİ TAŞIMA YOK: `plan`/`subscription` YENİ ve BOŞ doğar, `tenant.
-- site_type` NULLABLE olarak eklenir (mevcut satırlar `NULL` kalır) —
-- dönüştürülecek mevcut satır yoktur, idempotency sorusu bu migration için
-- OLUŞMUYOR. Backfill BİLEREK YAZILMAZ ("bir iş seçimini uydurmak veri
-- icat etmek olurdu") — demo kiracıya değeri seed yazar (S1, seed.ts).
--
-- ⚠⚠ RLS BLOĞU ELLE YAZILIR (Prisma şeması RLS ÜRETMEZ) ve biçim
-- `20261111090000_version_registry/migration.sql:233-246`'dan BAYT-BİREBİR
-- KOPYALANMIŞTIR — tahmin edilmemiştir. Gerekçe: `src/catalog-lint.ts`'in
-- `buildCanonicalPolicyExpression()`'ı politika ifadesini BAYT-BİREBİR
-- karşılaştırır (`POLICY_USING_NOT_CANONICAL` / `POLICY_WITH_CHECK_NOT_CANONICAL`).
-- Kopyalanan üç karar ve gerekçeleri (o dosyadan devralınır):
--   1. `TO` yan tümcesi YOK (= TO PUBLIC). `TO arkesoft_app` yazılsaydı, FORCE
--      ile RLS'e tabi olan tablo SAHİBİ (`arkesoft_migrator`) için uygulanabilir
--      politika kalmaz → varsayılan ret → migration/seed kırılırdı. Linter bunu
--      `POLICY_RESTRICTED_TO_ROLE` ile ayrıca zorlar.
--   2. `current_setting` İKİ argümanlı (`missing_ok = true`): tek argümanlı hâli
--      GUC hiç ayarlanmamışken HATA fırlatır; kabul kriteri context'siz bir
--      oturumda "0 satır, hata değil" bekliyor.
--   3. `WITH CHECK` AÇIKÇA yazılır (varsayılan kopyalanmaya güvenilmez) ki canlı
--      katalog linter'ı `polqual` ve `polwithcheck`'in İKİSİNİN DE NULL
--      olmadığını bağımsız doğrulayabilsin.
-- Politika ADI tablo adından türetilir (`<tablo>_tenant_isolation`).
--
-- ⚠⚠ `subscription`'da `@@unique([tenantId])` **VE** `@@unique([tenantId,
-- id])` İKİSİ BİRLİKTE VAR (`tenant_version_state`'in birebir emsali):
-- `migration-set.ts`'in `MISSING_TENANT_ID_LEADING_UNIQUE_INDEX` kuralı
-- `tenant_id` ÖNCÜ KOLONLU, EN AZ İKİ kolonlu bir UNIQUE INDEX ister —
-- `UNIQUE(tenant_id)` tek başına bu şartı KARŞILAMAZ. Birincisi GERÇEK 1:1
-- değişmezi ve BEDAVA İDEMPOTENCY, ikincisi migration linter'ının şartı
-- (ikincisi birincinin ÖNEKİ, artık, ama bilinçli kabul edilen maliyettir).
--
-- `GRANT` BU DOSYADA BİLEREK YOK (K9 — ADR-0020/ADR-0021 Karar, önceki
-- migration'larla BİREBİR aynı disiplin): rol/sahiplik/GRANT DDL'i migration
-- kümesine GİRMEZ. `sql/bootstrap-roles.sql`'in `ALTER DEFAULT PRIVILEGES
-- FOR ROLE arkesoft_migrator` bölümü sayesinde migrator'ın yarattığı bu İKİ
-- tablo da `arkesoft_app`'e otomatik SELECT/INSERT/UPDATE/DELETE verir. ⚠
-- `arkesoft_app`'in `plan` tablosu üzerindeki bu blanket DML yetkisi bu
-- migration'da DARALTILMADI — incelemesi `security` gate'ine bırakıldı
-- (`theme`/`theme_release`/`platform_release` için yapılan BİREBİR aynı
-- erteleme, ADR-0021 Sonuçlar).
--
-- `plan`/`subscription` taksonomi kaydı `packages/db/src/tenancy.ts`'te (K7,
-- aynı oturumda — bu dosyayla BİRLİKTE): `plan` → `PLATFORM_LEVEL_TABLES`
-- (DOKUZDAN ONA), `subscription` → `TENANT_SCOPED_TABLES` (ALTIDAN YEDİYE).
-- ⚠ `subscription`'ın taksonomiye eklenmesi prob tamlığı kapısını
-- (`tenant-isolation-suite.ts`) BİLEREK kırmızıya döndürür — prob kaydı
-- AYRI bir alt görevin (S5) işidir, `skip` DEĞİL, gerçek bir `expect`
-- başarısızlığı (job/audit_log/tenant_invitation emsali).

-- CreateEnum
CREATE TYPE "site_type" AS ENUM ('ecommerce', 'corporate');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('active');

-- AlterTable
ALTER TABLE "tenant" ADD COLUMN     "site_type" "site_type";

-- CreateTable
CREATE TABLE "plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "limits" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'active',
    "limits" JSONB NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_tenant_id_key" ON "subscription"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_tenant_id_id_key" ON "subscription"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- EnableRowLevelSecurity (elle; bkz. dosya başı — bayt-birebir kopya)
ALTER TABLE "subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscription" FORCE ROW LEVEL SECURITY;

CREATE POLICY "subscription_tenant_isolation" ON "subscription"
  USING ("tenant_id" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));
