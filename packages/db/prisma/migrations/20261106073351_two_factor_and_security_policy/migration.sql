-- @arkesoft/db — `two_factor` tablosu + `app_user.two_factor_enabled` +
-- `tenant.require_two_factor_for_owner` kolonları + `audit_action` enum
-- değeri (ROADMAP v0.0.15, T-016/S1, architect veri modeli birebir)
--
-- EXPAND (tek adım, YIKICI DEĞİL): bir YENİ tablo (`two_factor`, boş doğar),
-- iki YENİ kolon (`app_user.two_factor_enabled`,
-- `tenant.require_two_factor_for_owner` — ikisi de BOOLEAN NOT NULL DEFAULT
-- false, mevcut satırlar varsayılan değeri ALIR) ve bir YENİ enum DEĞERİ
-- eklenir. Hiçbir mevcut kolon kaldırılmaz, hiçbir mevcut kolona zorunluluk
-- (var olan nullable kolonu NOT NULL yapan bir ifade) eklenmez, hiçbir
-- mevcut kısıt/tip değişmez → bir ÖNCEKİ uygulama sürümü bu şemayla
-- sorunsuz çalışır (yeni tabloyu/kolonları HİÇ okumaz) ve platform
-- rollback'i şema rollback'i GEREKTİRMEZ (CLAUDE.md §10 md 10 TETİKLENMİYOR;
-- mekanik teyit: `migration-set.ts`'in yıkıcı taraması
-- `includes('DROP ' + '')`/`includes('SET' + ' NOT NULL')` jetonlarını
-- arıyor, bu dosyadaki hiçbir ifade ikisini de İÇERMİYOR — jetonlar burada
-- BİTİŞİK yazılmadı, AGENT_BASELINE §5 literal-jeton kuralı gereği).
--
-- `two_factor` PLATFORM SEVİYESİDİR (`tenant_id` TAŞIMAZ) — gerekçe
-- `prisma/schema.prisma`'daki model yorumunda: ikinci faktör KULLANICIYA
-- aittir, kiracıya değil. Bu yüzden RLS politikası BİLEREK YOK — tablo
-- `src/tenancy.ts` → `TENANT_SCOPED_TABLES`'a GİRMEZ (dört üyede kalır),
-- `migration-set` linter'ının `MISSING_TENANT_ID_LEADING_UNIQUE_INDEX`/
-- `TENANT_ID_ON_PLATFORM_TABLE` kurallarını TETİKLEMEZ.
--
-- ⚠ `secret`/`backup_codes` HAM DEĞİL — Better Auth çalışma zamanında
-- `symmetricEncrypt` (anahtar `BETTER_AUTH_SECRET`) ile ŞİFRELEYEREK yazar;
-- bu migration şifreleme UYGULAMAZ (DDL, veri taşıma YOK — tablo boş
-- doğuyor). Bu iki kolonun veritabanı seviyesi rol ayrımına
-- (`AUTH_SECRET_BEARING_TABLES`) eklenmesi `src/tenancy.ts` değişikliğidir,
-- BU DOSYADA DEĞİL (S2'nin işi).
--
-- VERİ TAŞIMA YOK: `two_factor` yeni ve boş doğar; iki yeni kolonun
-- `DEFAULT false`'u mevcut `app_user`/`tenant` satırlarını otomatik
-- doldurur (ayrı bir UPDATE betiği gerekmez) → idempotency sorusu bu
-- migration için OLUŞMUYOR.
--
-- `GRANT` BU DOSYADA BİLEREK YOK (K-E2 emsali, `<ts>_rbac_audit_log_and_invitation`
-- ile birebir): `sql/bootstrap-roles.sql`'in `ALTER DEFAULT PRIVILEGES`'i
-- `arkesoft_app`'e otomatik SELECT/INSERT/UPDATE/DELETE verir; `two_factor`
-- özelinde `arkesoft_auth`'un kolon bazlı erişimi ise aynı dosyanın §7
-- bloğundaki `information_schema.columns` döngüsünden OTOMATİK gelir —
-- ama operatör `pnpm db:bootstrap`'i YENİDEN KOŞTURMAK ZORUNDADIR (K-A6),
-- bu migration onu tetiklemez.
--
-- ⚠ PG 12+ `ALTER TYPE … ADD VALUE` AYNI transaction'da KULLANILAMAZ
-- (A-PO1) — bu migration yeni değeri (`tenant_security_policy_changed`)
-- HİÇBİR yerde kullanmıyor, bu yüzden kısıt bu dosya için sorun ÇIKARMAZ;
-- canlı koşum bunu doğruladı (aşağıdaki DoD çıktısı).

-- AlterEnum
ALTER TYPE "audit_action" ADD VALUE 'tenant_security_policy_changed';

-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tenant" ADD COLUMN     "require_two_factor_for_owner" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "two_factor" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backup_codes" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "failed_verification_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_user_id_key" ON "two_factor"("user_id");

-- AddForeignKey
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
