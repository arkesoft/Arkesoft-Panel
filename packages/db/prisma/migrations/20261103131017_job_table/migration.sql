-- @arkesoft/db — `job` tablosu + `job_status` enum'u + tenant izolasyonu RLS
-- politikası (ROADMAP v0.0.11, T-013/S2, architect K3 birebir)
--
-- EXPAND (tek adım, YIKICI DEĞİL): yalnızca YENİ bir enum tipi, YENİ bir tablo,
-- iki yeni indeks, bir yabancı anahtar ve o tablonun RLS politikası eklenir.
-- Hiçbir mevcut kolon kaldırılmaz, hiçbir mevcut kolona zorunluluk eklenmez,
-- hiçbir tipin karşılığı değiştirilmez → bir ÖNCEKİ uygulama sürümü bu şemayla
-- sorunsuz çalışır (bu tabloyu HİÇ okumaz) ve platform rollback'i şema
-- rollback'i GEREKTİRMEZ (CLAUDE.md §10 md 10 TETİKLENMİYOR, ROADMAP Sürüm
-- Politikası "expand/contract").
--
-- VERİ TAŞIMA YOK: tablo yeni ve boş doğar, dönüştürülecek mevcut satır yoktur
-- → idempotency sorusu bu migration için OLUŞMUYOR (karşılaştır:
-- `<ts>_tenant_theme_selection`, orada backfill'in `WHERE … IS NULL` koruması
-- ZORUNLUYDU).
--
-- RLS BLOĞU ELLE YAZILIR (Prisma şeması RLS ÜRETMEZ) ve biçim
-- `<ts>_rls_tenant_isolation/migration.sql`'in `tenant_membership` için
-- yazdığından KOPYALANMIŞTIR — tahmin edilmemiştir. Gerekçe:
-- `src/catalog-lint.ts`'in `buildCanonicalPolicyExpression()`'ı politika
-- ifadesini BAYT-BİREBİR karşılaştırır (`POLICY_USING_NOT_CANONICAL` /
-- `POLICY_WITH_CHECK_NOT_CANONICAL`); kanonik biçimden en küçük sapma (farklı
-- boşluk, `::text` cast'i, tek argümanlı `current_setting`) bulgu üretir.
-- Kopyalanan üç karar ve gerekçeleri (o dosyadan devralınır):
--   1. `TO` yan tümcesi YOK (= TO PUBLIC). `TO arkesoft_app` yazılsaydı, FORCE
--      ile RLS'e tabi olan tablo SAHİBİ (`arkesoft_migrator`) için uygulanabilir
--      politika kalmaz → varsayılan ret → migration/seed kırılırdı. Linter bunu
--      `POLICY_RESTRICTED_TO_ROLE` ile ayrıca zorlar.
--   2. `current_setting` İKİ argümanlı (`missing_ok = true`): tek argümanlı hâli
--      GUC hiç ayarlanmamışken HATA fırlatır; kabul kriteri context'siz bir
--      oturumda "0 satır, hata değil" bekliyor. `::text` cast'i YAZILMAZ —
--      `current_setting` zaten `text` döner.
--   3. `WITH CHECK` AÇIKÇA yazılır (varsayılan kopyalanmaya güvenilmez) ki canlı
--      katalog linter'ı `polqual` ve `polwithcheck`'in İKİSİNİN DE NULL
--      olmadığını bağımsız doğrulayabilsin. Bu yarı, çapraz kiracıya YAZMA'yı
--      (INSERT/UPDATE) kapatan yarıdır.
--
-- `GRANT` BU DOSYADA BİLEREK YOK (K-E2: rol/sahiplik/GRANT DDL'i migration
-- kümesine GİRMEZ): `sql/bootstrap-roles.sql`'in 4. bölümündeki
-- `ALTER DEFAULT PRIVILEGES FOR ROLE arkesoft_migrator` sayesinde migrator'ın
-- yarattığı bu tablo `arkesoft_app`'e otomatik SELECT/INSERT/UPDATE/DELETE
-- verir. Bunun GERÇEKTEN olduğu VARSAYILMAZ, canlı katalog linter'ının
-- `APP_ROLE_MISSING_DML_PRIVILEGE` kuralıyla her `test:isolation` koşumunda
-- ÖLÇÜLÜR.
--
-- Geri alma yolu (NO FORCE / satır seviyesi güvenliği kapatma) ve genel RLS
-- hata ayıklama notları `docs/development.md`'de yazılıdır.

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "job" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "error" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_tenant_id_status_created_at_idx" ON "job"("tenant_id", "status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "job_tenant_id_id_key" ON "job"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EnableRowLevelSecurity (elle; bkz. dosya başı)
ALTER TABLE "job" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "job" FORCE ROW LEVEL SECURITY;

CREATE POLICY "job_tenant_isolation" ON "job"
  USING ("tenant_id" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));
