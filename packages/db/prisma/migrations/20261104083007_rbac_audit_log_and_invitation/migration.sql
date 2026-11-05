-- @arkesoft/db — `audit_log` + `tenant_invitation` tabloları, `audit_action`
-- enum'u ve her iki tablonun tenant izolasyonu RLS politikası
-- (ROADMAP v0.0.14, T-014/S1, architect K-A1 birebir)
--
-- EXPAND (tek adım, YIKICI DEĞİL): yalnızca YENİ bir enum tipi, İKİ YENİ tablo,
-- dört yeni indeks, iki yabancı anahtar ve o iki tablonun RLS politikası
-- eklenir. Hiçbir mevcut kolon kaldırılmaz, hiçbir mevcut kolona zorunluluk
-- eklenmez, hiçbir mevcut kısıt veya tipin karşılığı değiştirilmez → bir
-- ÖNCEKİ uygulama sürümü bu şemayla sorunsuz çalışır (bu iki tabloyu HİÇ
-- okumaz) ve platform rollback'i şema rollback'i GEREKTİRMEZ (CLAUDE.md §10
-- md 10 TETİKLENMİYOR, ROADMAP Sürüm Politikası "expand/contract").
--
-- ⚠ `tenant_membership.user_id` yabancı anahtarının silme aksiyonu BU
-- MIGRATION'DA DEĞİŞTİRİLMEDİ (architect K-A12 — bağlayıcı). Aksiyonu
-- değiştirmek mevcut kısıtın kaldırılmasını gerektirir ve migration kümesi
-- linter'ının yıkıcı ifade kuralını tetikler; o kuralı "kendi değişikliğimizi
-- geçirmek için" gevşetmek CLAUDE.md §10 md 6 ihlalidir. İlgili değişmez
-- (her kiracının tam olarak bir sahibi olması) bu sürümde UYGULAMA KODUNDA
-- zorlanır; veritabanı biçimi v0.0.19'a (hesap silme/GDPR yüzeyi) sıralandı.
-- Gerekçenin tamamı `prisma/schema.prisma` → `TenantMembership.user` satırının
-- üstündeki yorumda.
--
-- VERİ TAŞIMA YOK: iki tablo da yeni ve boş doğar, dönüştürülecek mevcut satır
-- yoktur → idempotency sorusu bu migration için OLUŞMUYOR (karşılaştır:
-- `<ts>_tenant_theme_selection`, orada backfill'in `WHERE … IS NULL` koruması
-- ZORUNLUYDU).
--
-- RLS BLOĞU ELLE YAZILIR (Prisma şeması RLS ÜRETMEZ) ve biçim
-- `<ts>_job_table/migration.sql`'in `job` için yazdığından BAYT-BİREBİR
-- KOPYALANMIŞTIR — tahmin edilmemiştir. Gerekçe: `src/catalog-lint.ts`'in
-- `buildCanonicalPolicyExpression()`'ı politika ifadesini BAYT-BİREBİR
-- karşılaştırır (`POLICY_USING_NOT_CANONICAL` /
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
-- ⚠ Her iki tablo için politika ADI tablo adından türetilir
-- (`<tablo>_tenant_isolation`) — canlı katalog linter'ı tablo başına TAM OLARAK
-- BİR politika satırı bekler (K-E5 md 6), bu yüzden iki tabloya AYNI politika
-- adı verilemez ve ikinci bir politika eklenemez.
--
-- `GRANT` BU DOSYADA BİLEREK YOK (K-E2: rol/sahiplik/GRANT DDL'i migration
-- kümesine GİRMEZ): `sql/bootstrap-roles.sql`'in 4. bölümündeki
-- `ALTER DEFAULT PRIVILEGES FOR ROLE arkesoft_migrator` sayesinde migrator'ın
-- yarattığı bu iki tablo `arkesoft_app`'e otomatik SELECT/INSERT/UPDATE/DELETE
-- verir. Bunun GERÇEKTEN olduğu VARSAYILMAZ, canlı katalog linter'ının
-- `APP_ROLE_MISSING_DML_PRIVILEGE` kuralıyla her `test:isolation` koşumunda
-- ÖLÇÜLÜR.
--
-- ⚠ ÖLÇÜM NOTU (T-013'ün dersi, bu dosyayı okuyan herkes için): FORCE RLS'li bir
-- tabloda satır sayımı, tablo SAHİBİ rolüyle (`arkesoft_migrator`) ve tenant
-- context ayarlanmadan yapılırsa İÇERİKTEN BAĞIMSIZ her zaman 0 döner. Doğru
-- ölçüm `rolbypassrls=t` olan rolle VEYA context'i ayarlanmış bir oturumda
-- yapılır — aksi halde "tablo boş" sonucu kanıt DEĞİLDİR.
--
-- Geri alma yolu (NO FORCE / satır seviyesi güvenliği kapatma) ve genel RLS
-- hata ayıklama notları `docs/development.md`'de yazılıdır.

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('member_invited', 'member_invitation_accepted', 'member_role_changed', 'member_removed');

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "action" "audit_action" NOT NULL,
    "subject" TEXT NOT NULL,
    "diff" JSONB NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_invitation" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "tenant_role" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "invited_by_user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_created_at_idx" ON "audit_log"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "audit_log_tenant_id_id_key" ON "audit_log"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_invitation_tenant_id_email_key" ON "tenant_invitation"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_invitation_tenant_id_token_hash_key" ON "tenant_invitation"("tenant_id", "token_hash");

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_invitation" ADD CONSTRAINT "tenant_invitation_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EnableRowLevelSecurity (elle; bkz. dosya başı)
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_tenant_isolation" ON "audit_log"
  USING ("tenant_id" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));

ALTER TABLE "tenant_invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_invitation" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_invitation_tenant_isolation" ON "tenant_invitation"
  USING ("tenant_id" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));
