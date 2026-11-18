-- @arkesoft/db — sürüm kayıt modeli: `platform_release`, `theme`,
-- `theme_release`, `tenant_version_state`, `tenant_update_history` tabloları,
-- beş yeni ENUM ve iki yeni tenant tablosunun RLS politikası (ROADMAP v0.0.21,
-- T-018/S2, architect VERİ MODELİ birebir, ADR-0020 Karar 1/3/4).
--
-- EXPAND (tek adım, YIKICI DEĞİL): yalnızca BEŞ YENİ enum tipi, BEŞ YENİ tablo,
-- SEKİZ yeni indeks, ÜÇ yabancı anahtar, İKİ yeni CHECK kısıtı ve İKİ tenant
-- tablosunun RLS politikası eklenir. Hiçbir mevcut kolon kaldırılmaz, hiçbir
-- mevcut kolona zorunluluk eklenmez, hiçbir mevcut kısıt/tipin karşılığı
-- değiştirilmez → bir ÖNCEKİ uygulama sürümü bu şemayla sorunsuz çalışır (bu
-- beş tabloyu HİÇ okumaz) ve platform rollback'i şema rollback'i GEREKTİRMEZ
-- (CLAUDE.md §10 md 10 TETİKLENMİYOR, ROADMAP Sürüm Politikası
-- "expand/contract"). `Tenant` tablosunun DDL'ine BU MIGRATION'DA
-- DOKUNULMAZ — `Tenant.themeId`/`Tenant.themeVersion`'ın DEPRECATED ayna
-- kolon ilanı yalnızca `prisma/schema.prisma` doc yorumunda (ADR-0020 Karar 1,
-- beş fazlı takvim orada).
--
-- VERİ TAŞIMA YOK: beş tablo da YENİ ve BOŞ doğar, dönüştürülecek mevcut satır
-- yoktur → idempotency sorusu bu migration için OLUŞMUYOR (karşılaştır:
-- `<ts>_tenant_theme_selection`, orada backfill'in `WHERE … IS NULL` koruması
-- ZORUNLUYDU). Seed'in idempotency sorumluluğu AYRI bir alt görevdir (S5).
--
-- ⚠⚠ RLS BLOĞU ELLE YAZILIR (Prisma şeması RLS ÜRETMEZ) ve biçim
-- `20261104083007_rbac_audit_log_and_invitation/migration.sql:122-135`'ten
-- BAYT-BİREBİR KOPYALANMIŞTIR — tahmin edilmemiştir (R-A1, architect/po
-- bağlayıcı). Gerekçe: `src/catalog-lint.ts`'in
-- `buildCanonicalPolicyExpression()`'ı politika ifadesini BAYT-BİREBİR
-- karşılaştırır (`POLICY_USING_NOT_CANONICAL` / `POLICY_WITH_CHECK_NOT_CANONICAL`);
-- kanonik biçimden en küçük sapma (farklı boşluk, `::text` cast'i, tek
-- argümanlı `current_setting`) bulgu üretir. Kopyalanan üç karar ve
-- gerekçeleri (o dosyadan devralınır):
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
-- Politika ADI tablo adından türetilir (`<tablo>_tenant_isolation`) — canlı
-- katalog linter'ı tablo başına TAM OLARAK BİR politika satırı bekler.
--
-- ⚠⚠ `@@unique([tenantId, id])` İKİ KİRACI TABLOSUNDA DA VAR (R-A2, bağlayıcı):
-- `migration-set.ts`'in `MISSING_TENANT_ID_LEADING_UNIQUE_INDEX` kuralı
-- `tenant_id` ÖNCÜ KOLONLU, EN AZ İKİ kolonlu bir UNIQUE INDEX ister.
-- `tenant_version_state` bu yüzden İKİ UNIQUE INDEX taşır:
-- `UNIQUE(tenant_id)` (gerçek 1:1 değişmezi, `tenantId @unique`) VE
-- `UNIQUE(tenant_id, id)` (linter şartı) — ikincisi birincinin ÖNEKİ, artık,
-- ama ADR-0020 Sonuçlar'ın kabul ettiği bilinçli maliyettir (`Job`/`AuditLog`
-- emsali). `tenant_update_history`'nin doğal bileşik benzersizliği YOKTUR,
-- bu yüzden `UNIQUE(tenant_id, id)` TEK gerekli indekstir (`Job`/`AuditLog`
-- emsali, birebir).
--
-- `GRANT` BU DOSYADA BİLEREK YOK (K9 — ADR-0020 Karar, `rbac_audit_log_and_
-- invitation/migration.sql:54-60` ile BİREBİR aynı disiplin): rol/sahiplik/
-- GRANT DDL'i migration kümesine GİRMEZ. `sql/bootstrap-roles.sql`'in 4.
-- bölümündeki `ALTER DEFAULT PRIVILEGES FOR ROLE arkesoft_migrator` sayesinde
-- migrator'ın yarattığı bu BEŞ tablo da `arkesoft_app`'e otomatik
-- SELECT/INSERT/UPDATE/DELETE verir (ileriye dönük mekanizma). Bunun
-- GERÇEKTEN olduğu VARSAYILMAZ, canlı katalog linter'ının
-- `APP_ROLE_MISSING_DML_PRIVILEGE` kuralıyla her `test:isolation` koşumunda
-- ÖLÇÜLÜR. ⚠ `arkesoft_app`'in bu üç PLATFORM tablosu (`platform_release`,
-- `theme`, `theme_release`) üzerindeki blanket DML yetkisi bu migration'da
-- DARALTILMADI — incelemesi `security` gate'ine bırakıldı (ADR-0020 Sonuçlar).
--
-- İKİ YENİ CHECK KISITI (elle SQL, `tenant_theme_selection_pairing_check`
-- emsali): `theme_release_published_at_pairing_check`
-- (`(status = 'draft') = (published_at IS NULL)`) ve
-- `tenant_update_history_finished_after_started_check`
-- (`finished_at IS NULL OR finished_at >= started_at`). İkisi de YENİ
-- tablolarda, İKİ CHECK de YIKICI DEĞİLDİR (satır yok, kısıt ANINDA sağlanır).
-- İKİNCİ bir CHECK (`triggered_by` ↔ `triggered_by_user_id` eşleşmesi)
-- BİLEREK YAZILMAZ — CHECK bugünkü bir YAZICININ ihlal edebileceği değişmezi
-- korur, bu sürümde HİÇ yazıcı yok (ADR-0020).
--
-- `channel` İKİ değer taşır (`stable`, `canary`) — Sürüm Politikası §4'ün
-- tanımladığı ÜÇÜNCÜ değer (`dev`) BİLEREK YOK ("ölü sözlük, ölü iznin
-- kardeşidir"). `rolled_back` (`update_status`) BİLEREK YOK
-- (`AuditAction.revoked` emsali). İkisi de `ALTER TYPE … ADD VALUE` ile
-- additive bir migration'dır (vade: v0.16.0).
--
-- ⚠⚠ `theme.id` DOĞAL ANAHTARDIR (`cuid(2)` DEĞİL) — ADR-0020 Karar 3.
-- `theme`/`theme_release`/`platform_release` PLATFORM SEVİYESİDİR
-- (`tenant_id` TAŞIMAZLAR); `tenant_version_state`/`tenant_update_history`
-- KİRACIYA BAĞLIDIR. Taksonomi kaydı `packages/db/src/tenancy.ts`'te (K7,
-- aynı oturumda — bu dosyayla BİRLİKTE).
--
-- `TenantVersionState.themeId`'den `ThemeRelease`'e BİLEŞİK YABANCI ANAHTAR
-- YAZILMAZ (ADR-0020 Karar 3 — üç gerekçe orada). Referans bütünlüğü yazma
-- yolunda (v0.2.0) zorlanır.
--
-- Geri alma yolu (NO FORCE / satır seviyesi güvenliği kapatma) ve genel RLS
-- hata ayıklama notları `docs/development.md`'de yazılıdır. ⚠ Bu sürümün geri
-- alması `release` tarafından PR açıklamasına yazılacak EK bir kısıt taşır:
-- `packages/theme-sdk@0.1.2` `@arkesoft/versioning`'i import ettiği için
-- platform ve theme-sdk AYRI AYRI geri alınamaz (ADR-0020 Sonuçlar) — bu
-- migration'ın KENDİSİ o kısıtı doğurmaz, yalnızca aynı commit'in bir
-- parçasıdır.

-- CreateEnum
CREATE TYPE "release_channel" AS ENUM ('stable', 'canary');

-- CreateEnum
CREATE TYPE "theme_status" AS ENUM ('active', 'deprecated');

-- CreateEnum
CREATE TYPE "theme_release_status" AS ENUM ('draft', 'published', 'deprecated');

-- CreateEnum
CREATE TYPE "update_trigger" AS ENUM ('tenant_user', 'platform_auto');

-- CreateEnum
CREATE TYPE "update_status" AS ENUM ('running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "platform_release" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "channel" "release_channel" NOT NULL,
    "released_at" TIMESTAMPTZ(3) NOT NULL,
    "notes" TEXT,
    "min_api_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "theme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "theme_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "theme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "theme_release" (
    "id" TEXT NOT NULL,
    "theme_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "sdk_range" TEXT NOT NULL,
    "changelog" TEXT,
    "status" "theme_release_status" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "theme_release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_version_state" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "platform_version" TEXT NOT NULL,
    "theme_id" TEXT NOT NULL,
    "theme_version" TEXT NOT NULL,
    "api_version" TEXT NOT NULL,
    "last_updated_at" TIMESTAMPTZ(3) NOT NULL,
    "previous_state" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_version_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_update_history" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "from_state" JSONB,
    "to_state" JSONB NOT NULL,
    "triggered_by" "update_trigger" NOT NULL,
    "triggered_by_user_id" TEXT,
    "status" "update_status" NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "finished_at" TIMESTAMPTZ(3),
    "error" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_update_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_release_version_channel_key" ON "platform_release"("version", "channel");

-- CreateIndex
CREATE INDEX "platform_release_channel_released_at_idx" ON "platform_release"("channel", "released_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "theme_release_theme_id_version_key" ON "theme_release"("theme_id", "version");

-- CreateIndex
CREATE INDEX "theme_release_theme_id_status_published_at_idx" ON "theme_release"("theme_id", "status", "published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_version_state_tenant_id_key" ON "tenant_version_state"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_version_state_tenant_id_id_key" ON "tenant_version_state"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_update_history_tenant_id_id_key" ON "tenant_update_history"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "tenant_update_history_tenant_id_started_at_idx" ON "tenant_update_history"("tenant_id", "started_at" DESC);

-- AddForeignKey
ALTER TABLE "theme_release" ADD CONSTRAINT "theme_release_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_version_state" ADD CONSTRAINT "tenant_version_state_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_update_history" ADD CONSTRAINT "tenant_update_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK #1 (elle; bkz. dosya başı) — draft/publishedAt eşleşme değişmezi
ALTER TABLE "theme_release" ADD CONSTRAINT "theme_release_published_at_pairing_check"
  CHECK (("status" = 'draft') = ("published_at" IS NULL));

-- CHECK #2 (elle; bkz. dosya başı) — bitiş zamanı başlangıçtan önce olamaz
ALTER TABLE "tenant_update_history" ADD CONSTRAINT "tenant_update_history_finished_after_started_check"
  CHECK ("finished_at" IS NULL OR "finished_at" >= "started_at");

-- EnableRowLevelSecurity (elle; bkz. dosya başı — R-A1, byte-birebir kopya)
ALTER TABLE "tenant_version_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_version_state" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_version_state_tenant_isolation" ON "tenant_version_state"
  USING ("tenant_id" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));

ALTER TABLE "tenant_update_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_update_history" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_update_history_tenant_isolation" ON "tenant_update_history"
  USING ("tenant_id" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));
