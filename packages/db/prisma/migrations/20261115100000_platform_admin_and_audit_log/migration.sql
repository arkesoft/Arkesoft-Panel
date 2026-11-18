-- @arkesoft/db — süper admin platform kimliği: `platform_admin`,
-- `platform_audit_log` tabloları ve `platform_audit_action` enum'u (ROADMAP
-- v0.0.20, T-021/S3, architect VERİ MODELİ birebir, ADR-0023 Karar 1/3).
--
-- EXPAND (tek adım, YIKICI DEĞİL): yalnızca BİR yeni enum tipi, İKİ yeni
-- tablo, ÜÇ yeni indeks ve BİR yabancı anahtar eklenir. Hiçbir mevcut kolon
-- kaldırılmaz, hiçbir mevcut kolona zorunluluk eklenmez, hiçbir mevcut
-- kısıt/tipin karşılığı değiştirilmez, `enum TenantRole`/`tenant_membership`
-- DDL'ine BU MIGRATION'DA HİÇ DOKUNULMAZ (ADR-0023 Karar 1 — platform
-- yetkisi bir üyelik değildir) → bir ÖNCEKİ uygulama sürümü bu şemayla
-- sorunsuz çalışır (bu iki tabloyu HİÇ okumaz) ve platform rollback'i şema
-- rollback'i GEREKTİRMEZ (CLAUDE.md §10 md 10 TETİKLENMİYOR, ROADMAP Sürüm
-- Politikası "expand/contract").
--
-- VERİ TAŞIMA YOK: iki tablo da YENİ ve BOŞ doğar, dönüştürülecek mevcut
-- satır yoktur → idempotency sorusu bu migration için OLUŞMUYOR.
--
-- ⚠⚠ RLS POLİTİKASI BU MIGRATION'DA YAZILMAZ — ikisi de PLATFORM SEVİYESİ
-- tablodur (`tenant_id` TAŞIMAZLAR, ADR-0023 Karar 1/3). `tenant_membership`/
-- `subscription` vb. kiracı tablolarının aksine `ENABLE ROW LEVEL SECURITY`/
-- `FORCE ROW LEVEL SECURITY`/`CREATE POLICY` bloğu YOKTUR — eklenmesi
-- `UNCLASSIFIED_TABLE`/`TENANT_ID_ON_PLATFORM_TABLE` sınıfı bir hataya
-- dönüşürdü. Taksonomi kaydı `packages/db/src/tenancy.ts`'te (aynı
-- oturumda, bu dosyayla BİRLİKTE): `platform_admin` → `PLATFORM_LEVEL_
-- TABLES`'ın ON BİRİNCİ üyesi, `platform_audit_log` → ON İKİNCİ üyesi.
-- ⭐ `TENANT_SCOPED_TABLES` BU MIGRATION'LA DEĞİŞMEDİ (yedide kaldı) — prob
-- tamlığı kapısı (`tenant-isolation-suite.ts`) KIRMIZIYA DÖNMEDİ
-- (v0.0.21/v0.1.0'ın BİREBİR TERSİ, po/architect bağlayıcı not).
--
-- `GRANT` BU DOSYADA BİLEREK YOK (K9 — önceki migration'larla BİREBİR aynı
-- disiplin): rol/sahiplik/GRANT DDL'i migration kümesine GİRMEZ.
-- `sql/bootstrap-roles.sql`'in `ALTER DEFAULT PRIVILEGES FOR ROLE
-- arkesoft_migrator` bölümü sayesinde migrator'ın yarattığı bu İKİ tablo da
-- `arkesoft_app`'e otomatik SELECT/INSERT/UPDATE/DELETE verir. Bunun
-- GERÇEKTEN olduğu VARSAYILMAZ, canlı katalog linter'ının
-- `APP_ROLE_MISSING_DML_PRIVILEGE` kuralıyla her `test:isolation` koşumunda
-- ÖLÇÜLÜR. ⚠ `arkesoft_app`'in bu iki PLATFORM tablosu üzerindeki blanket
-- DML yetkisi bu migration'da DARALTILMADI — `theme`/`theme_release`/
-- `platform_release`/`plan`'ın BİREBİR aynı ertelemesi; bu sürüm o kayıtlı
-- borcu (ROADMAP:3106, tamper-evidence) BÜYÜTÜYOR — kullanıcı kararıyla
-- v0.0.20.1'e bırakıldı, `security` gate'i bunu YENİ bir bulgu SANMAMALI.
--
-- `platform_admin.user_id` → `app_user`'a `ON DELETE CASCADE` FK: bu BİR
-- YETKİDİR (`AuditLog.actor_user_id`'nin OLGU kararının TAM TERSİ) —
-- kullanıcı silinince platform yetkisi YETİM KALAMAZ, DÜŞMELİDİR.
-- `platform_audit_log.actor_user_id`'de YABANCI ANAHTAR YOKTUR
-- (`AuditLog.actor_user_id`'nin BİREBİR gerekçesi — "kim yaptı" bir
-- OLGUDUR, denetim izi aktörden UZUN YAŞAR).
--
-- ⚠⚠ `platform_admin`'de `status` kolonu BİLEREK YOKTUR — bu sürümde onu
-- yazacak bir yüzey olmadığı için ölü bir sözlük olurdu ("ölü sözlük, ölü
-- iznin kardeşidir" — `prisma/schema.prisma` → `AuditAction` doc'u). Yetki =
-- satırın VARLIĞI; iptal = satırın SİLİNMESİ.
--
-- `platform_audit_action` İKİ değer taşır — İKİSİ DE bu sürümde tüketilir
-- (AC-8 `öncesi + 2` sayımı tam bu ikisiyle yapılır) ⇒ ölü sözlük YOKTUR.
-- Değer EKLEMEK `ALTER TYPE … ADD VALUE` ile additive'dir.
--
-- İndeksler: `platform_admin_user_id_key` (tekil, `userId @unique` — ayrı
-- bir `@@index` GEREKMEZ, tekil kısıt zaten B-tree indekstir).
-- `platform_audit_log_created_at_idx` (genel okuma — platform denetim
-- listesi) ve `platform_audit_log_actor_user_id_created_at_idx` (aktör
-- bazlı okuma). RLS'in zaten eklediği bir `tenant_id = …` yüklemi YOKTUR
-- (platform tablosu) — bu yüzden iki tabloda da `tenant_id` öncü bileşik
-- indeks şartı (migration linter'ının `MISSING_TENANT_ID_LEADING_UNIQUE_
-- INDEX` kuralı) UYGULANMAZ.

-- CreateEnum
CREATE TYPE "platform_audit_action" AS ENUM ('platform_admin_signed_in', 'tenant_impersonation_started');

-- CreateTable
CREATE TABLE "platform_admin" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_log" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "action" "platform_audit_action" NOT NULL,
    "subject" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_admin_user_id_key" ON "platform_admin"("user_id");

-- CreateIndex
CREATE INDEX "platform_audit_log_created_at_idx" ON "platform_audit_log"("created_at" DESC);

-- CreateIndex
CREATE INDEX "platform_audit_log_actor_user_id_created_at_idx" ON "platform_audit_log"("actor_user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "platform_admin" ADD CONSTRAINT "platform_admin_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
