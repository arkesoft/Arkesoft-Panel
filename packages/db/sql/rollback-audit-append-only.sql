-- @arkesoft/db — denetim izi EKLE-SAL (append-only) sertleştirmesi GERİ ALMA
-- (ROADMAP v0.0.20.2, T-023/S6, architect K-A17 adım ③ + "Geri alma: AYRI
-- dosya" kararı, kullanıcı kararı 2026-11-17).
--
-- AYRI DOSYA (A1-b'nin BİREBİR aynı kararı, `rollback-auth-role.sql`'in
-- dosya başı notuyla TUTARLI): bu script `rollback-auth-role.sql`'e
-- EKLENMEZ — o dosyanın yazılı sözleşmesi "yalnızca v0.0.14.1 deltasını
-- tersler"dir ve `rollback-roles.ts`'in A1-b kararı "iki SQL dosyası ASLA
-- aynı çağrıda BİRLEŞTİRİLMEZ"dir. Bu dosya YALNIZCA bu sürümün (v0.0.20.2,
-- `sql/bootstrap-roles.sql`'in §9'u) deltasını tersler.
--
-- "BAŞLANGIÇ DURUMUNA DÖNDÜ" ≠ "LİNTER YEŞİL" (`rollback-auth-role.sql`'in
-- A1-c'siyle BİREBİR aynı gerekçe): bu dosya koşturulduktan SONRA
-- `pnpm test:isolation` BEKLENEN BİÇİMDE KIRMIZIDIR — `tenancy.ts`'teki
-- `APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS` beyanı HÂLÂ iki satırı taşır
-- (kod kataloğun İLERİSİNDE), katalog ise v0.0.20.2'den ÖNCEKİ duruma
-- DÖNDÜ. Bu bir HATA DEĞİL — kuralların GERÇEKTEN ÇALIŞTIĞININ kanıtı
-- (`rollback-audit-append-only.isolation.test.ts`'in işi, S7). Katalogu
-- YENİDEN yeşile döndürmenin yolu `pnpm db:bootstrap`'i YENİDEN
-- koşturmaktır — bu dosyanın GÖREVİ DEĞİLDİR.
--
-- Koşturucu: `pnpm db:rollback-audit-append-only`
-- (`src/rollback-roles.ts 'audit-append-only'` → `prisma db execute --file
-- sql/rollback-audit-append-only.sql`, `bootstrap-roles.ts`'in BİREBİR
-- deseni: `DATABASE_BOOTSTRAP_URL` çocuk sürecin `DATABASE_URL`'ine SPAWN
-- ANINDA atanır, `shell: false`, `evaluateTargetDatabase` koruması).
--
-- IF EXISTS ZORUNLU (§9'un BİREBİR deseni): bu script taze bir veritabanına
-- karşı (bootstrap §9 hiç koşmamış) çalıştırılabilir — tablo yoksa
-- "relation does not exist" ile PATLAMAMALI.
--
-- İDEMPOTENT: `GRANT` PostgreSQL'de doğası gereği idempotenttir (aynı
-- hedefe tekrar uygulamak hata VERMEZ) — bu script üst üste koşturulabilir.
--
-- F-NEW-3 (architect, mekanik tuzak — §9'un BİREBİR aynı gerekçesi): döngü
-- değişkeni BİLEREK `secret_table_name` DEĞİL
-- (`auth-secret-tables-sql-consistency.test.ts`'in "TAM 1 eşleşme" sayımını
-- BOZMAMAK için) — `append_only_table_name` kullanılır, ayrı bir drift
-- testi (`append-only-tables-sql-consistency.test.ts`) bu dosyanın
-- `bootstrap-roles.sql`'in §9'uyla İKİ YÖNLÜ tutarlı kaldığını doğrular.

DO $do_rollback_audit_append_only$
DECLARE
  append_only_table_name text;
BEGIN
  FOREACH append_only_table_name IN ARRAY ARRAY['audit_log', 'platform_audit_log']
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = append_only_table_name
    ) THEN
      -- FIX turu 1 (solid [high] H1/F1 bulgusu, security BAĞIMSIZ doğruladı):
      -- bu satır ESKİDEN `GRANT UPDATE, DELETE, TRUNCATE` veriyordu — YANLIŞ.
      -- `arkesoft_app` sertleştirme ÖNCESİ (bölüm 4'ün blanket GRANT'i,
      -- `bootstrap-roles.sql:167` — yalnızca DÖRT fiil: SELECT/INSERT/UPDATE/
      -- DELETE) TRUNCATE TAŞIMIYORDU (canlı ölçüm: `public`teki 20 tablonun
      -- 0'ında `arkesoft_app` TRUNCATE taşıyor, M3/M3b). Eski satır bu geri
      -- almayı başlangıç durumunun ÜSTÜNE çıkarıyordu — `TRUNCATE` RLS'e TABİ
      -- DEĞİLDİR, bu yüzden geri alma betiği (bu dosyanın belgelediği
      -- `pnpm db:rollback-audit-append-only` yolu) koşturulduğu anda ele
      -- geçirilmiş bir uygulama kimliği tek `TRUNCATE audit_log` ile TÜM
      -- kiracıların denetim kaydını silebilirdi — v0.0.20.2 ÖNCESİNDE bu
      -- MÜMKÜN DEĞİLDİ. Düzeltme: yalnızca §9'un REVOKE'unun ÖNCEKİ GERÇEK
      -- durumunu (`UPDATE, DELETE`) geri ver — TRUNCATE hiçbir zaman verilmiş
      -- olmadığı için geri VERİLMEZ (§9'un savunmacı `REVOKE TRUNCATE`'i bu
      -- geri almadan SONRA da KALICI olarak etkili kalır — `pg_default_acl`
      -- yeni tabloları `arwd` (TRUNCATE İÇERMEZ) ile doğurduğu için bu
      -- `REVOKE` bugün yük taşımasa da [no-op] savunma derinliği olarak
      -- bilerek korunuyor — `bootstrap-roles.sql:424-444`/ADR-0017:417-418/
      -- `docs/development.md:519-521` ile BİREBİR aynı gerekçe).
      EXECUTE format(
        'GRANT UPDATE, DELETE ON public.%I TO arkesoft_app',
        append_only_table_name
      );
    END IF;
  END LOOP;
END
$do_rollback_audit_append_only$;
