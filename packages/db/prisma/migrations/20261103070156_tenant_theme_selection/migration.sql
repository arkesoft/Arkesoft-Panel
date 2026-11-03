-- @arkesoft/db — kiracı tema seçimi (ROADMAP v0.0.10, T-012/S2, architect
-- VERİ MODELİ birebir)
--
-- EXPAND (tek adım, YIKICI DEĞİL): iki NULLABLE kolon eklenir. DB seviyesinde
-- `DEFAULT` BİLEREK YOK — platform varsayılan teması tek kaynakta, vitrinin
-- derleme zamanı kayıt defterinde yaşar (ADR-0002 Karar 5); bu migration'ın
-- backfill'i o kaynağın YERİNE GEÇMEZ.
-- `NOT NULL` BU SÜRÜMDE YOK (CLAUDE.md §10 md 10, expand/contract) — promosyon
-- en erken v0.3.0, ayrı PR + ROADMAP'te işaretli.
-- `DROP`/`RENAME`/`SET NOT NULL` YOK → platform rollback'i şema rollback'i
-- gerektirmez (ROADMAP.md:1416).
-- AlterTable
ALTER TABLE "tenant" ADD COLUMN     "theme_id" TEXT,
ADD COLUMN     "theme_version" TEXT;

-- İDEMPOTENT BACKFILL: `WHERE theme_id IS NULL` ZORUNLU — bu migration'ı
-- ikinci kez (örn. `migrate reset` sonrası tekrar) çalıştırmak, zaten tema
-- seçmiş bir satırı GERİ YAZMAZ. ⚠ `modern`/`0.1.0` burada DONMUŞ TARİHSEL
-- bir olgudur — v0.0.10 tarihinde platform varsayılanı bu değerdi; CANLI
-- varsayılanın KAYNAĞI bu satır DEĞİLDİR (ADR-0002 Karar 5, K2). Vitrin
-- seçim yoksa (yeni satırlarda `theme_id IS NULL` kalabilir) kendi derleme
-- zamanı kayıt defterinden okur.
UPDATE "tenant" SET "theme_id" = 'modern', "theme_version" = '0.1.0' WHERE "theme_id" IS NULL;

-- EŞLEŞME DEĞİŞMEZİ: `(theme_id IS NULL) = (theme_version IS NULL)` — iki
-- kolon TEK kavram, iki yasal olmayan kombinasyon var. CHECK kısıtı YIKICI
-- DEĞİLDİR: yukarıdaki backfill tüm mevcut satırları ikisi de dolu hâle
-- getirdiği için kısıt ANINDA sağlanır; eski sürümün `INSERT`'leri (ikisini de
-- NULL bırakan) kısıtı zaten SAĞLAR. A-A4 ölçümü (db agent, T-012/S2
-- handoff): `prisma migrate dev` bu kısıtı DRİFT olarak raporlamıyor (ham
-- çıktı handoff'ta) → kısıt eklenmesi SEÇİLDİ.
ALTER TABLE "tenant" ADD CONSTRAINT "tenant_theme_selection_pairing_check"
  CHECK (("theme_id" IS NULL) = ("theme_version" IS NULL));
