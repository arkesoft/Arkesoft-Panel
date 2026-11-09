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

-- `arkesoft_auth` (ROADMAP v0.0.14.1, T-015/ST-A, ADR-0008 borcu): kimlik
-- doğrulama rolü. Yalnızca üç hash/belirteç tablosunu (kolon bazlı) ve
-- `app_user`'ı (tablo bazlı, DELETE hariç) okur/yazar — başka hiçbir tabloya
-- erişemez. Tablo/kolon `GRANT`/`REVOKE`'u ST-D'nin işi (bu dosyanın §7'si);
-- bu adım yalnızca rolün VAR OLMASINI sağlar, hiçbir yetkiyi DEĞİŞTİRMEZ.
DO $do_create_auth$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arkesoft_auth') THEN
    CREATE ROLE arkesoft_auth LOGIN PASSWORD 'arkesoft_auth_dev_only';
  END IF;
END
$do_create_auth$;

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

-- `arkesoft_auth`: kimlik doğrulama rolü (architect "Bağlayıcı yetki beyanı",
-- T-015). `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOBYPASSRLS` — en az
-- yetki, DIĞER İKİ rolle BİREBİR aynı nitelik kümesi (yalnızca DML, DDL hakkı
-- yok). Tablo/kolon yetkisi (SELECT/INSERT/UPDATE kolon bazlı, DELETE tablo
-- bazlı üç tabloda; `app_user`'da DELETE HARİÇ tablo bazlı) bu dosyanın §7'si
-- — ST-D'nin işi, BURADA verilmez.
ALTER ROLE arkesoft_auth WITH
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOBYPASSRLS
  PASSWORD 'arkesoft_auth_dev_only';

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

-- `arkesoft_auth`: yalnızca `USAGE` — `CREATE` YOK (ADR-0008 borcu, T-015/
-- ST-A). ⛔ Bu rol için `ALTER DEFAULT PRIVILEGES` BİLEREK AÇILMAZ (architect
-- K-A17/mevcut karar 1): `arkesoft_app`'in aşağıdaki (§4) blanket "gelecekte
-- eklenen her tabloya otomatik DML" mekanizması bu role KASITLI olarak
-- UYGULANMAZ — gelecekte eklenen her tablo `arkesoft_auth` için varsayılan
-- olarak KAPALI gelsin (fail-closed). Üç hash/belirteç tablosuna ve
-- `app_user`'a kolon/tablo bazlı yetki ELLE ve AÇIKÇA verilir (§7, ST-D'nin
-- işi) — yeni bir tablo eklenince bu role OTOMATİK yetki AKMAZ.
GRANT USAGE ON SCHEMA public TO arkesoft_auth;

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

-- =============================================================================
-- 7) arkesoft_auth — sır taşıyan üç tabloda kolon bazlı yetki + arkesoft_app'in
--    bu üç tablodaki yetkisinin tablo bazlı REVOKE'u (ROADMAP v0.0.14.1,
--    T-015/ST-D, ADR-0008'in v0.0.14'e vadeli borcunun kapanışı)
-- =============================================================================
--
-- SIRA KISITI (bağlayıcı, T-015/pm R-PM1/R-PM2/architect K-A17): bu bölüm
-- `catalog-lint.ts`'in kolon yetkisi kural sınıfından (ST-C) SONRA, AYNI
-- commit'te uygulanır — sıra ters olsaydı linter bu REVOKE'u uyguladığı AN
-- (DDL ile tadil edilmiş kural arasındaki pencerede) bulgu üretir ve CI
-- kırmızıya döner (§10 md 6 — "linteri gevşetme baskısı").
--
-- KAPSAM (kullanıcı kararı 2026-11-05, R-PM6 — po'nun revize ettiği ROADMAP
-- madde 4): yalnızca `account`/`session`/`verification`. `tenant`/`app_user`
-- KAPSAM DIŞI — `arkesoft_app` onları hâlâ tam DML ile yönetir
-- (ADR-0008:53'ün ölçtüğü canlı kullanım `tenant` 32, `user` 5,
-- `tenantMembership` 1); `app_user` AŞAĞIDA AYRI bir blokta
-- `arkesoft_auth`a hibe alır ama `arkesoft_app`tan REVOKE EDİLMEZ (ikisi de
-- bu tabloya erişir — Better Auth `findUserByEmail`, `internal-adapter.mjs:585`).
--
-- IF EXISTS ZORUNLU (R-PM2, `_prisma_migrations` emsalinin BİREBİR deseni,
-- yukarıdaki bölüm 6'ya bakın): bootstrap `migrate deploy`'dan ÖNCE koşar,
-- o anda bu üç tablo ve `app_user` HENÜZ YOKTUR (taze veritabanı) —
-- koşulsuz `REVOKE`/`GRANT` "relation does not exist" ile PATLAR. CI zaten
-- İKİ GEÇİŞLİ (`.github/actions/prepare-db/action.yml:54-56` → `:65-67` →
-- `:82-84`) — ikinci geçişte bu tablolar `migrate deploy` tarafından
-- OLUŞTURULMUŞ olur ve blok GERÇEKTEN uygulanır. Yerel TEK geçişli
-- `pnpm db:bootstrap` bunu uygulamaz — ama artık SESSİZ DEĞİL: canlı
-- izolasyon probu (ST-E) bunu fail-closed yakalar.
--
-- KOLON LİSTESİ ELLE YAZILMAZ: `information_schema.columns` üzerinde dönen
-- `DO` döngüsü `format(...)` ile her kolona `GRANT SELECT, INSERT, UPDATE`
-- üretir — şemaya yeni bir kolon eklenince bir SONRAKİ `pnpm db:bootstrap`
-- koşusu KENDİ KENDİNE iyileşir; linter (ST-C) de sapmayı CI'da yakalar
-- (iki yönlü kapalı, R-PM2 KARAR 2).
--
-- DELETE KOLON BAZLI VERİLEMEZ (PostgreSQL'de kolon yetkisi yalnızca
-- SELECT/INSERT/UPDATE/REFERENCES için TANIMLIDIR) — bu yüzden TABLO bazlı,
-- AYRI bir `GRANT DELETE` ile verilir (architect "Bağlayıcı yetki beyanı").
--
-- SEKANS `GRANT USAGE` EKLENMEDİ (K-A11, ST-A0⑤'in ölçtüğü olgu): dört
-- tablonun 36 kolonunda `pg_get_serial_sequence` boş, `public` şemasında
-- `pg_sequences` 0 satır (hepsi `cuid(2)` metin PK, Prisma uygulama
-- seviyesinde üretir) — gereksiz yetki eklenmedi.
DO $do_secret_table_privileges$
DECLARE
  secret_table_name text;
  column_record RECORD;
BEGIN
  -- GENİŞLETME (ROADMAP v0.0.15, T-016/S2, architect K-A5 DÜZELTME 1): `two_factor`
  -- EKLENDİ. ⚠ Bu DIŞ dizi SABİT LİTERALDİR — kolon döngüsü İÇTEDİR (aşağıda);
  -- mevcut bir tabloya yeni kolon eklendiğinde o kolon OTOMATİK hibelenir, ama
  -- YENİ bir tablo bu diziye ELLE eklenmedikçe hiç ziyaret edilmez ve
  -- `arkesoft_app`'in o tablodaki yetkisi `ALTER DEFAULT PRIVILEGES` ile
  -- OTOMATİK gelip REVOKE EDİLMEZ (task dosyasının "§7 kendiliğinden
  -- hallediyor" iddiası bu ekleme için YANLIŞTI — ölçüldü, architect düzeltti).
  FOREACH secret_table_name IN ARRAY ARRAY['account', 'session', 'verification', 'two_factor']
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = secret_table_name
    ) THEN
      -- `arkesoft_app`in bu tablodaki TÜM (tablo bazlı) yetkisini al —
      -- `APP_ROLE_RETAINS_SECRET_TABLE_PRIVILEGE`'ın kapandığı yer.
      EXECUTE format('REVOKE ALL ON public.%I FROM arkesoft_app', secret_table_name);

      -- `arkesoft_auth`u BAŞTAN AL (idempotency + aşağıdaki hatanın temizliği):
      -- bu koşunun kendisi KOLON bazlı yetki veriyor, ama Postgres'in `GRANT`
      -- söz dizimi hatalı yazılırsa (parantezsiz bırakılan privilege TABLO
      -- bazlı olur) tablo seviyesi SIZINTI üretebilir — AMPİRİK OLARAK
      -- ÖLÇÜLDÜ (ilk ST-D koşusunda `relacl`de "arkesoft_auth=ar.../..."
      -- göründü). `REVOKE ALL` her koşuda SIFIRDAN başlar, bir sonraki
      -- `GRANT` adımı DOĞRU şekli YENİDEN kurar — çalışma zamanı garantisi
      -- kalıntıya BAĞIMLI DEĞİL.
      EXECUTE format('REVOKE ALL ON public.%I FROM arkesoft_auth', secret_table_name);

      -- Her kolona KOLON bazlı SELECT/INSERT/UPDATE — `AUTH_ROLE_MISSING_
      -- COLUMN_PRIVILEGE`/`AUTH_ROLE_TABLE_LEVEL_PRIVILEGE_ON_SECRET_TABLE`nin
      -- kapandığı yer. Kolon adı literali YOK — `%I` + `format()`.
      --
      -- ⚠⚠ SÖZ DİZİMİ UYARISI (ampirik olarak ÖLÇÜLDÜ — ilk ST-D koşusu):
      -- PostgreSQL'in `GRANT` söz dizimi `(kolon listesi)`'ni YALNIZCA
      -- KENDİSİNDEN ÖNCE gelen privilege'e uygular — `GRANT SELECT, INSERT,
      -- UPDATE (col) ON …` YAZILIRSA SELECT ve INSERT TABLO BAZLI, yalnızca
      -- UPDATE kolon bazlı olur (`relacl`de "arkesoft_auth=ar.../…" olarak
      -- GÖRÜLDÜ — tam olarak bu anti-vacuity kuralının YAKALAMASI GEREKEN
      -- kusur). Doğru biçim: HER privilege'in kendi `(kolon)` yan tümcesini
      -- TAŞIMASI — `%1$I` pozisyonel biçimlendiricisiyle AYNI kolon adı ÜÇ
      -- KEZ tekrarlanır.
      FOR column_record IN
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = secret_table_name
      LOOP
        EXECUTE format(
          'GRANT SELECT (%1$I), INSERT (%1$I), UPDATE (%1$I) ON public.%2$I TO arkesoft_auth',
          column_record.column_name,
          secret_table_name
        );
      END LOOP;

      -- TABLO bazlı DELETE (DELETE kolon bazlı tanımlı değil) —
      -- `AUTH_ROLE_MISSING_TABLE_PRIVILEGE`nin kapandığı yer.
      EXECUTE format('GRANT DELETE ON public.%I TO arkesoft_auth', secret_table_name);
    END IF;
  END LOOP;
END
$do_secret_table_privileges$;

-- `app_user`: TABLO bazlı SELECT/INSERT/UPDATE, DELETE YOK (A-N1 — en az
-- yetki; `user.deleteUser` ucu `auth-instance.ts`'te AÇILMAMIŞ). Better
-- Auth'un `findUserByEmail`'i bu tabloya bakar (`internal-adapter.mjs:585`)
-- ve Better Auth TEK Prisma istemcisi kullandığı için bu erişim başka bir
-- role DEVREDİLEMEZ (kullanıcı kararı 2026-11-05, ROADMAP madde 1 düzeltmesi).
-- `arkesoft_app`tan REVOKE EDİLMEZ — bu tablo kapsam dışı (yukarıdaki not).
DO $do_app_user_auth_privileges$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'app_user'
  ) THEN
    GRANT SELECT, INSERT, UPDATE ON public.app_user TO arkesoft_auth;
  END IF;
END
$do_app_user_auth_privileges$;

-- =============================================================================
-- 8) Fonksiyon yürütme hakkı — MEVCUT fonksiyonlarda PUBLIC'ten REVOKE
--    (FIX turu 2, security Tur 2 [medium] S-8 bulgusu — YOL (a)'nın
--    EMPİRİK OLARAK ÇALIŞAN yarısı, bkz. aşağıdaki AMPİRİK ÖLÇÜM notu)
-- =============================================================================
--
-- ÖLÇÜLEN AÇIK (M14): PostgreSQL'de bir fonksiyon `SECURITY DEFINER` ile
-- oluşturulup HİÇBİR `GRANT` yazılmazsa `pg_proc.proacl` NULL kalır — VE
-- tablo/sekansın TERSİNE, fonksiyonlar için EXECUTE yetkisinin VARSAYILANI
-- PUBLIC'TİR. Böyle bir fonksiyon tablo SAHİBİNİN (`arkesoft_migrator`)
-- yetkisiyle çalışır ve kolon bazlı kısıtlamayı BAYPAS edebilir.
--
-- ⚠⚠ AMPİRİK ÖLÇÜM (FIX turu 2, `db` ST-A0 emsali — canlı Postgres 17.11'de
-- transaction+ROLLBACK içinde BEŞ bağımsız deneme): `ALTER DEFAULT
-- PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` — mimari'nin ilk
-- önerdiği "YOL (a)'nın tam hâli" — PUBLIC'ten ÖNCE HİÇ `GRANT` yazılmamış
-- bir (rol, şema, 'f') üçlüsünde HİÇBİR KATALOG SATIRI üretmez (ampirik
-- ölçüm: `pg_default_acl`'de satır sayısı komuttan ÖNCE ve SONRA BİREBİR
-- aynı kaldı, HEM `FOR ROLE arkesoft_migrator` HEM `arkesoft_migrator`'a
-- doğrudan bağlanıp AYNI komutu kendi rolü için çalıştırarak İKİ YOLDAN
-- doğrulandı) — bu yüzden YENİ oluşturulan bir fonksiyonun `proacl`'ı NULL
-- KALMAYA devam eder ve `arkesoft_app` EXECUTE edebilmeyi SÜRDÜRÜR. Daha da
-- çarpıcısı: (rol,şema,'f') üçlüsü için BAŞKA bir role (`arkesoft_auth`)
-- `GRANT EXECUTE` ile bir satır MATERYALİZE edildiğinde bile, o satır
-- YENİ fonksiyonun `proacl`'ında sabit PUBLIC girdisiyle (`=X/<sahip>`)
-- BİRLİKTE görünür — yani (rol,şema,'f') için VAROLAN bir satır PUBLIC'in
-- hibesini SİLMEZ, yalnızca EKLER. Sonuç: bu mekanizma üzerinden
-- `public`e eklenecek bir SONRAKİ fonksiyonun varsayılanını fail-closed
-- yapmak bu Postgres sürümünde YAPISAL OLARAK mümkün DEĞİL (mimari'nin
-- "YOL (a)" önerisi bu KISIMDA ÇALIŞMIYOR — bu, mimari'nin değil, Postgres'in
-- `ALTER DEFAULT PRIVILEGES`/fonksiyon ACL etkileşiminin ÖLÇÜLMÜŞ bir
-- sınırıdır).
--
-- KARAR: bu bölüm yalnızca MEVCUT (bugün SIFIR, ölçüldü: `pg_proc` → 0
-- satır) fonksiyonlardan PUBLIC'in EXECUTE'unu ALIR — bu kısım AMPİRİK
-- OLARAK doğrulandı ve ÇALIŞIR (gerçek bir fonksiyon üzerinde ölçüldü:
-- `REVOKE` öncesi `has_function_privilege('arkesoft_app', …, 'EXECUTE')`
-- = true, SONRASI = false). GELECEKTEKİ fonksiyonlar için KAPATMA (a) BU
-- MEKANİZMAYLA MÜMKÜN OLMADIĞI için TESPİT (b) ZORUNLU HÂLE GELDİ —
-- `catalog-snapshot.ts`'teki `readFunctionPrivileges` (Kaynak E) +
-- `catalog-lint.ts`'teki `UNEXPECTED_FUNCTION_EXECUTE_PRIVILEGE` kuralı:
-- `public`teki HER fonksiyon için PUBLIC'in (hâlâ) EXECUTE edip ETMEDİĞİNİ
-- `has_function_privilege('public', …, 'EXECUTE')` ile sorar — bugün SIFIR
-- fonksiyon olduğu için yanlış pozitif SIFIR, ilk fonksiyon eklendiği AN
-- (PUBLIC hibesi varsayılan olarak VAR OLACAĞI için) kural ATEŞLENİR ve
-- açık bir `REVOKE EXECUTE … FROM PUBLIC` ile o fonksiyona ÖZEL kapatılması
-- ZORUNLU kılınır.
--
-- İDEMPOTENT: `REVOKE … FROM PUBLIC` sıfır fonksiyonla da hatasız (hiçbir şey
-- yapmaz).
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
