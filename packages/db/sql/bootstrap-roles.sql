-- @arkesoft/db — rol ayrımı provisioning (ROADMAP v0.0.13, T-005/S2, architect K-E2)
--
-- Bu dosya bir Prisma MIGRATION'ı DEĞİLDİR; `prisma/migrations/`'ta YAŞAMAZ ve
-- `migration-set.ts`/`migration-sql.test.ts` TARAFINDAN TARANMAZ (o bekçi yalnızca
-- `prisma/migrations/` altını okur). Bu kasıtlı — K-E2 roller/sahiplik/GRANT'in
-- migration kümesine GİRMEMESİ gerektiğini belirliyor (küme seviyesi nesneler,
-- `CREATEROLE` migrator'da yok, shadow DB'de "already exists" ile patlar).
--
-- Koşturucu: `pnpm --filter @arkesoft/db run db:bootstrap`
--   (`src/bootstrap-roles.ts` → `prisma db execute --file sql/bootstrap-roles.sql`).
--   DÜZELTME (FIX turu 1, solid [low] bulgusu): bu yorum ESKİDEN `--url
--   <DATABASE_BOOTSTRAP_URL>` bayrağından bahsediyordu — `prisma db execute`
--   BÖYLE BİR BAYRAK TAŞIMAZ (`bootstrap-roles.ts:20-26`'da ampirik olarak
--   belgelendi). Gerçek mekanizma: `DATABASE_BOOTSTRAP_URL` çocuk sürecin
--   `DATABASE_URL` ortam değişkenine SPAWN ANINDA (bellekte, dosyaya
--   yazılmadan) atanır; `prisma.config.ts`'in `datasource.url`'ü
--   (`env('DATABASE_URL')`) bunu okur.
--
-- İDEMPOTENT (AC8) — kullanıcının Postgres volume'u DOLU, `/docker-entrypoint-
-- initdb.d` BU DOSYAYI koşturmaz (yalnızca boş veri dizininde çalışır); bu
-- yüzden script üst üste koşturulabilir OLMAK ZORUNDA:
--   - `CREATE ROLE` → `DO $$ IF NOT EXISTS $$` ile korumalı (yalnızca yoksa
--     oluşturur; parola/nitelik ikinci adımda YAKINSATILIR).
--   - `ALTER ROLE` nitelikleri her koşuda aynı hedefe YAKINSAR (ikinci koşuda
--     no-op'a yakın).
--   - `OWNER TO` / `GRANT` / `ALTER DEFAULT PRIVILEGES` / `REVOKE` zaten
--     doğası gereği idempotent (aynı hedefe tekrar uygulamak hata vermez).
--
-- PAROLALAR LİTERAL (V-P3, S1'in `.env`/`.env.example`'ıyla BİREBİR): bu
-- değerler yalnızca geliştirme içindir (mevcut `docker-compose.yml`/`.env`
-- desenindeki gibi) — DDL'de bağlanabilir parametre YOKTUR (`CREATE/ALTER
-- ROLE ... PASSWORD $1` PostgreSQL'de geçersizdir), bu yüzden dinamik bir
-- enjeksiyon YOKTUR: değerler burada YAZARIN kendisi tarafından sabitlenmiş
-- statik metindir, kullanıcı girdisinden türetilmez (`run-guarded-prisma.ts`
-- deseniyle aynı "dev-only literal" kararı). Üretimde bu dosya HİÇ koşmaz —
-- üretim provisioning'i Pulumi/Helm + secret yöneticisi (ROADMAP v0.18.0).
--
-- `DROP ROLE` YOK (K-E2 reddedilen: paylaşılan nesnelere bağımlı olabilir,
-- geri alınamaz) — bkz. `rollback-roles.sql`.

-- =============================================================================
-- 1) Roller — yoksa oluştur, nitelikleri her koşuda yakınsa
-- =============================================================================

DO $do_create_migrator$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arkesoft_migrator') THEN
    CREATE ROLE arkesoft_migrator LOGIN PASSWORD 'arkesoft_migrator_dev_only';
  END IF;
END
$do_create_migrator$;

DO $do_create_app$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arkesoft_app') THEN
    CREATE ROLE arkesoft_app LOGIN PASSWORD 'arkesoft_app_dev_only';
  END IF;
END
$do_create_app$;

-- `arkesoft_migrator`: `CREATEDB` (shadow DB için, A-E2), tabloların SAHİBİ
-- olacak (aşağıda), `NOBYPASSRLS` (K-E2/V2/CLAUDE.md §10.4 — BYPASSRLS asla).
ALTER ROLE arkesoft_migrator WITH
  LOGIN
  CREATEDB
  NOSUPERUSER
  NOCREATEROLE
  NOBYPASSRLS
  PASSWORD 'arkesoft_migrator_dev_only';

-- `arkesoft_app`: çalışma zamanı rolü. `NOSUPERUSER`, `NOBYPASSRLS`,
-- `NOCREATEDB`, `NOCREATEROLE`, yalnızca DML (GRANT'ler aşağıda).
ALTER ROLE arkesoft_app WITH
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOBYPASSRLS
  PASSWORD 'arkesoft_app_dev_only';

-- =============================================================================
-- 2) Sahiplik devri — pg_tables VE pg_type (enum'lar) — `format('%I')` ile
--    tanımlayıcı alıntılama. `_prisma_migrations` DAHİL (migrator ona INSERT
--    edebilmeli). `REASSIGN OWNED BY` KULLANILMIYOR (K-E2 — paylaşılan
--    nesneleri de kapsar, denetlenemez); bunun yerine açık, denetlenebilir
--    bir döngü.
-- =============================================================================

DO $do_own_tables$
DECLARE
  table_record RECORD;
BEGIN
  FOR table_record IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO arkesoft_migrator', table_record.tablename);
  END LOOP;
END
$do_own_tables$;

DO $do_own_enums$
DECLARE
  enum_record RECORD;
BEGIN
  FOR enum_record IN
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'e'
  LOOP
    EXECUTE format('ALTER TYPE public.%I OWNER TO arkesoft_migrator', enum_record.typname);
  END LOOP;
END
$do_own_enums$;

-- =============================================================================
-- 3) Şema erişimi — `arkesoft_migrator` şemada yeni nesne (tablo/tip)
--    oluşturabilmeli (PostgreSQL 15+ `public` şemasında `CREATE` varsayılan
--    olarak PUBLIC'ten alınmış, şema sahibinin AÇIKÇA vermesi gerekir).
--    `arkesoft_app` yalnızca `USAGE` alır — DDL hakkı YOK.
-- =============================================================================

GRANT USAGE, CREATE ON SCHEMA public TO arkesoft_migrator;
GRANT USAGE ON SCHEMA public TO arkesoft_app;

-- =============================================================================
-- 4) DML yetkisi — mevcut tablolar + gelecekteki tablolar (AC9 parametrikliği)
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO arkesoft_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO arkesoft_app;

-- AC9: `TENANT_SCOPED_TABLES`'a (veya herhangi bir tabloya) yeni bir tablo
-- eklendiğinde `arkesoft_migrator` onu oluşturduğu anda `arkesoft_app` otomatik
-- DML yetkisi alır — elle `GRANT` yazmaya gerek YOK.
ALTER DEFAULT PRIVILEGES FOR ROLE arkesoft_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO arkesoft_app;

ALTER DEFAULT PRIVILEGES FOR ROLE arkesoft_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO arkesoft_app;

-- =============================================================================
-- 5) Şema üzerinde genel (PUBLIC pseudo-role) DDL hakkını kapat
-- =============================================================================

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- =============================================================================
-- 6) En az yetki daraltması — Prisma migration defteri (FIX turu 2, B3:
--    qa/solid Tur 2 [low] BAĞIMSIZ bulgu)
-- =============================================================================
--
-- Bölüm 4'teki blanket "GRANT ... ON ALL TABLES"/"ALTER DEFAULT PRIVILEGES"
-- `_prisma_migrations`'ı da kapsar (migrator'ın oluşturduğu HER tabloya
-- otomatik DML veren mekanizma TABLO ADINA göre filtrelenemez — PostgreSQL'in
-- `ALTER DEFAULT PRIVILEGES`'i desen/isim istisnası TANIMAZ). Sonuç: çalışma
-- zamanı rolü (`arkesoft_app`) Prisma'nın KENDİ migration defterine
-- INSERT/UPDATE/DELETE yapabiliyordu — `security`/`qa` Tur 2 ampirik olarak
-- ÖLÇTÜ. Bu tenant izolasyonunu ETKİLEMİYOR (platform seviyesi, `tenant_id`
-- taşımıyor) ama en az yetki SAPMASI: API katmanında bir SQL enjeksiyonu bu
-- deftere satır ekleyip/silebilirdi. Hedef: yalnızca SELECT kalsın.
--
-- VAROLUŞ KOŞULLU (K-E2/AC8 ile AYNI gerekçe): bootstrap İDEMPOTENT olmak
-- ZORUNDA ve `prepare-db`'nin BAĞLAYICI sırası bootstrap → deploy → seed'dir
-- (bkz. dosya başı) — bootstrap, migrator `migrate deploy` ile
-- `_prisma_migrations`'ı OLUŞTURMADAN ÖNCE koşar (ampirik ölçüldü: taze
-- konteynerde bootstrap anında bu tablo YOK). Koşulsuz bir `REVOKE ... ON
-- TABLE public._prisma_migrations ...` taze DB'de "relation does not exist"
-- ile PATLAR ve AC1/AC8'in kritik düzeltmesini (FIX turu 1) YENİDEN KIRAR —
-- bu yüzden `IF EXISTS` koruması ZORUNLU. Pratik sonuç: BİR DEFAYA MAHSUS
-- taze bir veritabanında bu REVOKE o AN uygulanmaz (tablo henüz yok), AMA
-- bootstrap-roles.sql İDEMPOTENT olduğu için `pnpm db:bootstrap`'ın
-- SONRAKİ her koşumunda (örn. mevcut/dolu bir volume'a karşı tekrar
-- çalıştırıldığında, AC8'in asıl senaryosu) tablo artık VAR ve REVOKE
-- UYGULANIR — bu dosyanın tasarım amacı ZATEN "üst üste koşturulabilir
-- olmak" (bkz. dosya başı İDEMPOTENT notu). CI TARAFI KAPANDI (AYNI FIX
-- turunda, devops): `prepare-db`'nin sırası artık bootstrap → deploy →
-- bootstrap (2. GEÇİŞ) → seed'dir (`.github/actions/prepare-db/action.yml:
-- 63-78`) — ikinci `db:bootstrap` çağrısı `_prisma_migrations` tablosu
-- `db:deploy` tarafından OLUŞTURULDUKTAN SONRA koşar, bu yüzden yukarıdaki
-- REVOKE o geçişte GERÇEKTEN uygulanır (ampirik doğrulandı: eski sırada
-- `arkesoft_app`'in deftere yetkisi `DELETE,INSERT,SELECT,UPDATE`; yeni
-- sırada yalnızca `SELECT`). YEREL kurulum yolu (tek seferlik `pnpm
-- db:bootstrap`, ikinci geçiş olmadan) bu paragrafın kapsamı DIŞINDA —
-- `docs/development.md` yerel adımı AYRICA kapatıyor (ikinci bootstrap
-- çağrısı belgeye ekleniyor); burada iz bırakılan tek şey CI akışının
-- kapandığı.
DO $do_revoke_migrations_ledger$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = '_prisma_migrations'
  ) THEN
    REVOKE INSERT, UPDATE, DELETE ON TABLE public._prisma_migrations FROM arkesoft_app;
  END IF;
END
$do_revoke_migrations_ledger$;
