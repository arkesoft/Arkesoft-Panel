-- @arkesoft/db — rol ayrımı provisioning GERİ ALMA, kademe 3 (ROADMAP v0.0.13,
-- T-005/S2, architect "Geri alma — üç kademe" bölümü)
--
-- Üç kademeli geri almanın SON adımı. Kademe 1 (`NO FORCE ROW LEVEL SECURITY`)
-- ve kademe 2 (`DISABLE ROW LEVEL SECURITY`) RLS migration'ına aittir (S3),
-- BU DOSYA DEĞİL. Bu dosya yalnızca bootstrap-roles.sql'in sahiplik/GRANT
-- etkisini tersler — şema geri alma (DROP TABLE/COLUMN) GEREKTİRMEZ.
--
-- Koşturucu: bu dosyanın `bootstrap-roles.ts`'teki bir karşılığı YOK (henüz
-- `pnpm db:rollback-roles` script'i eklenmedi — v0.0.14 borcu, `docs`
-- runbook'ta bunu açıkça yazar). Elle koşturma, `bootstrap-roles.ts:138`'in
-- (`childEnv = { ...process.env, DATABASE_URL: bootstrapUrl }`) karşılığı:
--     cd packages/db
--     DATABASE_URL="$DATABASE_BOOTSTRAP_URL" pnpm exec prisma db execute \
--       --file sql/rollback-roles.sql
-- DÜZELTME (FIX turu 1, solid [low] bulgusu): bu yorum ESKİDEN `--url
-- <DATABASE_BOOTSTRAP_URL>` bayrağından bahsediyordu — `prisma db execute`
-- BÖYLE BİR BAYRAK TAŞIMAZ (`bootstrap-roles.ts:20-26`, ampirik). Önek
-- (`DATABASE_URL=... pnpm exec ...`) ortamda ZATEN tanımlı bir `.env`
-- değerini EZER (Node v25.8.1 ile ölçüldü: ortamda tanımlı değer KAZANIR) —
-- `prisma.config.ts:16-18`'in `existsSync` korumalı `loadEnvFile`'ı önekin
-- önüne geçmez.
--
-- `DROP ROLE` YOK (K-E2) — `arkesoft_migrator`/`arkesoft_app` başka
-- nesnelere (açık bağlantılar, bekleyen `GRANT`ler) bağımlı olabilir ve bu
-- geri alınamaz; roller küme seviyesinde yaşar, silmek bu script'in
-- kapsamının DIŞINDADIR.
--
-- Sahiplik `arkesoft` (bootstrap süper kullanıcısı, `.env`'teki
-- `DATABASE_BOOTSTRAP_URL`/`POSTGRES_USER`) rolüne GERİ DEVREDİLİR.
-- DÜZELTME (FIX turu 1, qa/security Tur 1 [low] bulgusu): bu başlık ESKİDEN
-- "bootstrap öncesi durumla BİREBİR aynı sahip" diyordu — PostgreSQL 15+'ta
-- bu YANLIŞTI (ölçüldü: `template1`'in `nspacl`'ı bozulmamış durumda PUBLIC
-- yalnızca `USAGE` taşıyor, `CREATE` HİÇ YOK). Bu dosya SADECE bootstrap'ın
-- AÇTIĞI sahiplik/GRANT'leri tersler; PG15 öncesi bir "varsayılan"ı
-- YENİDEN AÇMAZ (bkz. aşağıdaki 4. adım).

-- =============================================================================
-- 1) Sahiplik geri — tablolar ve enum'lar `arkesoft`'a
-- =============================================================================

DO $do_revert_tables$
DECLARE
  table_record RECORD;
BEGIN
  FOR table_record IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO arkesoft', table_record.tablename);
  END LOOP;
END
$do_revert_tables$;

DO $do_revert_enums$
DECLARE
  enum_record RECORD;
BEGIN
  FOR enum_record IN
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'e'
  LOOP
    EXECUTE format('ALTER TYPE public.%I OWNER TO arkesoft', enum_record.typname);
  END LOOP;
END
$do_revert_enums$;

-- =============================================================================
-- 2) Gelecekteki tablolar için otomatik DML yetkisini geri al
-- =============================================================================

ALTER DEFAULT PRIVILEGES FOR ROLE arkesoft_migrator IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM arkesoft_app;

ALTER DEFAULT PRIVILEGES FOR ROLE arkesoft_migrator IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM arkesoft_app;

-- =============================================================================
-- 3) Mevcut tablolar/sekanslar üzerindeki DML yetkisini geri al
-- =============================================================================

REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM arkesoft_app;
REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM arkesoft_app;

-- =============================================================================
-- 4) Şema erişimini geri al
-- =============================================================================

REVOKE USAGE, CREATE ON SCHEMA public FROM arkesoft_migrator;
REVOKE USAGE ON SCHEMA public FROM arkesoft_app;
-- DÜZELTME (FIX turu 1, qa/security Tur 1 [low] bulgusu): `GRANT CREATE ON
-- SCHEMA public TO PUBLIC` BİLEREK BURADA DEĞİL. PostgreSQL 15+'ta PUBLIC
-- varsayılan olarak bu yetkiyi HİÇ TAŞIMAZ (ölçüldü: `version()` →
-- "PostgreSQL 17.11"; `template1`in `nspacl`'ı bozulmamış, PUBLIC yalnızca
-- `USAGE`). Bu GRANT'i eklemek bootstrap ÖNCESİNDEN DAHA AÇIK bir duruma
-- geçerdi — `bootstrap-roles.sql`'in `REVOKE CREATE ON SCHEMA public FROM
-- PUBLIC`'i PG17'de zaten no-op'tur (derinlikli savunma, doğru); rollback
-- onu TERSE ÇEVİRMEZ.

-- NOT: `arkesoft_migrator`/`arkesoft_app` rollerinin NİTELİKLERİ (LOGIN,
-- CREATEDB, NOSUPERUSER, NOBYPASSRLS, parola) bilerek BURADA GERİ ALINMAZ —
-- bu kademe yalnızca sahiplik/GRANT'i tersler; roller küme seviyesinde var
-- olmayı sürdürür (`DROP ROLE` yasağı, K-E2). Rollback sonrası
-- `pnpm test:isolation` KIRMIZIYA döner — bu bilinçli bir kill-switch
-- özelliğidir (architect, "Her kademe test:isolation'ı kırmızıya düşürür").
