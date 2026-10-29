-- @arkesoft/db — tenant izolasyonu RLS politikası (ROADMAP v0.0.13, T-005/S3,
-- architect K-E3 bağlayıcı taslağı birebir)
--
-- Şema BU migration'da DEĞİŞMİYOR (K-E4) — Prisma şemasına yeni kolon/tablo
-- eklenmiyor, yalnızca Postgres satır seviyesi güvenlik (RLS) etkinleştirilip
-- politika tanımlanıyor. Rol/sahiplik/GRANT DDL'i bu migration'a BİLEREK
-- GİRMEZ (K-E2.3) — o küme seviyesi provisioning `sql/bootstrap-roles.sql`
-- üzerinden bootstrap süper kullanıcısıyla, ayrı bir yoldan koşar.
--
-- `TO` yan tümcesi BİLEREK YOK (= TO PUBLIC): politika `TO arkesoft_app`
-- yazılsaydı, FORCE ile RLS'e tabi olan tablo sahibi `arkesoft_migrator` için
-- uygulanabilir politika kalmazdı → varsayılan ret → seed'in insert'i
-- başarısız olurdu (PM riski 1, architect K-E2.1).
--
-- `current_setting` İKİ argümanlı (`missing_ok = true`) kullanılır: tek
-- argümanlı hâli GUC hiç ayarlanmamışken hata fırlatır; bu paketin
-- kabul kriteri context'siz bir oturumda "0 satır, hata değil" bekliyor.
-- `::text` cast'i yazılmaz — `current_setting` zaten `text` döner.
--
-- `WITH CHECK` açıkça yazılır (varsayılan kopyalanmaya güvenilmez) ki canlı
-- katalog linter'ı `polqual` ve `polwithcheck`'in ikisinin de NULL olmadığını
-- bağımsız olarak doğrulayabilsin.
--
-- Bu dosyada yıkıcı hiçbir ifade yoktur (tablo/kolon kaldırma, zorunluluk
-- ekleme) — tek işlem RLS'i açmak ve politika eklemek; geri alma yolu
-- (NO FORCE / DISABLE ROW LEVEL SECURITY) `docs/development.md`'de yazılıdır.

ALTER TABLE "tenant_membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_membership" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_membership_tenant_isolation" ON "tenant_membership"
  USING ("tenant_id" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true));
