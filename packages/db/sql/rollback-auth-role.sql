-- @arkesoft/db — `arkesoft_auth` yetki ayrımı GERİ ALMA, kademe 4 (ROADMAP
-- v0.0.14.1, T-015/ST-G, architect KARAR A1).
--
-- ⚠⚠ SIRA UYARISI (A1-a, bağlayıcı — `rollback-roles.sql`'in dosya başı ile
-- BİRLİKTE okunmalı): bu dosyanın NUMARASI "4"TÜR ama YÜRÜTME SIRASI İLK'tir
-- (4 → 1 → 2 → 3). Kademe 1-3 (`rollback-roles.sql`) artan YIKICILIKTA bir
-- kill-switch MERDİVENİDİR ve `arkesoft_app`'ten HER ŞEYİ `REVOKE` eder; BU
-- dosya ise v0.0.14.1'in DELTASINI (yalnızca bootstrap-roles.sql §7'nin
-- uyguladığı değişikliği) TERSLER. Kademe 3 ÖNCE koşarsa `arkesoft_app`
-- zaten HİÇBİR tabloda yetki TAŞIMAZ ve bu dosyanın "GRANT ... TO
-- arkesoft_app" adımı tutarsız bir ARA DURUM yaratır (3'ün attığı yetkiyi bu
-- dosya GERİ VERİR). Operatör sırayı KARIŞTIRMAMALI: önce bu dosya (gerekirse
-- TEK BAŞINA, platform geri almasının YERİNE), sonra (ayrı bir karar olarak)
-- kademe 1→2→3.
--
-- "BAŞLANGIÇ DURUMUNA DÖNDÜ" ≠ "LİNTER YEŞİL" (A1-c, bağlayıcı): bu dosya
-- koşturulduktan SONRA `pnpm test:isolation` BEKLENEN BİÇİMDE KIRMIZIDIR —
-- `catalog-lint.ts`'in (kod) kuralları `tenancy.ts`'teki beklenti tablosunu
-- HÂLÂ taşır, ama katalog artık v0.0.14 durumuna DÖNDÜ (kod kataloğun
-- İLERİSİNDE). Bu bir HATA DEĞİL — kuralların GERÇEKTEN ÇALIŞTIĞININ kanıtı.
-- Katalogu YENİDEN yeşile döndürmenin yolu `pnpm db:bootstrap`'i YENİDEN
-- koşturmaktır (bootstrap §7'yi tekrar uygular) — bu dosyanın GÖREVİ
-- DEĞİLDİR.
--
-- Koşturucu: `pnpm db:rollback-auth-role` (`src/rollback-roles.ts 'auth-role'`
-- → `prisma db execute --file sql/rollback-auth-role.sql`, `bootstrap-
-- roles.ts`'in BİREBİR deseni: `DATABASE_BOOTSTRAP_URL` çocuk sürecin
-- `DATABASE_URL`'ine SPAWN ANINDA atanır, `shell: false`,
-- `evaluateTargetDatabase` koruması).
--
-- `DROP ROLE` YOK (ADR-0007 K-E2, `rollback-roles.sql`'in BİREBİR gerekçesi):
-- roller küme seviyesinde yaşar, paylaşılan nesnelere BAĞIMLI olabilir, geri
-- ALINAMAZ. `arkesoft_auth` rolünün KENDİSİ (nitelikleri, parolası) BU
-- DOSYADA DOKUNULMAZ — yalnızca ÜÇ sır taşıyan tablo + `app_user` üzerindeki
-- YETKİ DELTASI tersleniyor.
--
-- AMPİRİK ÖLÇÜM (bu alt görev, `db`): `REVOKE ALL ON public.<tablo> FROM
-- arkesoft_auth` TEK KOMUTU hem TABLO seviyesi hem KOLON seviyesi (`attacl`)
-- hibeleri AYNI ANDA temizler — `bootstrap-roles.sql:291,301`'in "REVOKE ALL
-- başa sıfırlama" yorumuyla TUTARLI, canlı veritabanında transaction içinde
-- doğrulandı (`ROLLBACK` ile kalıntısız): `REVOKE ALL` öncesi
-- `aclexplode(attacl)` üç satır (INSERT/SELECT/UPDATE) döndürüyordu, SONRASINDA
-- `0 satır`. Bu yüzden ST-D'nin kullandığı pozisyonel `%1$I` kolon listesi
-- BURADA GEREKMİYOR — `REVOKE ALL` kolon listesi TAŞIMADIĞI için GRANT'teki
-- "parantez yalnızca önceki privilege'e uygulanır" tuzağı (ST-C/ST-D'nin
-- ölçtüğü) BU SÖZ DİZİMİNDE YAPISAL OLARAK OLUŞAMAZ.
--
-- IF EXISTS ZORUNLU (R-PM2/ST-D'nin BİREBİR deseni): bu script taze bir
-- veritabanına karşı (bootstrap §7 hiç koşmamış) çalıştırılabilir — tablo
-- yoksa "relation does not exist" ile PATLAMAMALI.
--
-- İDEMPOTENT: `REVOKE`/`GRANT` PostgreSQL'de doğası gereği idempotenttir
-- (aynı hedefe tekrar uygulamak hata VERMEZ) — bu script üst üste
-- koşturulabilir.

-- =============================================================================
-- 1) Üç sır taşıyan tablo (`account`, `session`, `verification`):
--    arkesoft_auth'un TÜM (kolon + tablo) yetkisini al, arkesoft_app'in
--    v0.0.14 durumundaki TAM DML'ini GERİ VER.
-- =============================================================================
DO $do_rollback_secret_table_privileges$
DECLARE
  secret_table_name text;
BEGIN
  -- GENİŞLETME (ROADMAP v0.0.15, T-016/S2, architect K-A5): `two_factor`
  -- EKLENDİ — `bootstrap-roles.sql:284`'ün (dış döngü sabit literal dizi)
  -- BİREBİR aynası. Eklenmezse kademe 4 geri alması `two_factor`'ı atlar ve
  -- rollback sonrası `arkesoft_auth` o tabloda yetkili, `arkesoft_app`
  -- yetkisiz kalır — tutarsız bir ara durum.
  FOREACH secret_table_name IN ARRAY ARRAY['account', 'session', 'verification', 'two_factor']
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = secret_table_name
    ) THEN
      -- `arkesoft_auth`un bu tablodaki HER yetkisini (kolon SELECT/INSERT/
      -- UPDATE + tablo DELETE) tek komutla temizler — yukarıdaki AMPİRİK
      -- ÖLÇÜM notuna bakın.
      EXECUTE format('REVOKE ALL ON public.%I FROM arkesoft_auth', secret_table_name);

      -- `arkesoft_app`in v0.0.14'teki TAM DML'ini geri ver (bootstrap-
      -- roles.sql §4'ün blanket `GRANT`inin bu tablo için ST-D'nin `REVOKE
      -- ALL`ıyla aldığı hâlin tersi).
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO arkesoft_app',
        secret_table_name
      );
    END IF;
  END LOOP;
END
$do_rollback_secret_table_privileges$;

-- =============================================================================
-- 2) `app_user`: arkesoft_auth'un TABLO bazlı SELECT/INSERT/UPDATE'ini al.
--    `arkesoft_app`in bu tablodaki yetkisi hiçbir zaman REVOKE EDİLMEMİŞTİ
--    (ST-D/architect kararı — `app_user` kapsam dışı, ikisi de erişir) —
--    burada DOKUNULMAZ.
-- =============================================================================
DO $do_rollback_app_user_auth_privileges$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'app_user'
  ) THEN
    -- `REVOKE ALL` burada da güvenli: arkesoft_auth bu tabloda DELETE hiç
    -- taşımadı (A-N1), `REVOKE ALL` zaten taşımadığı bir yetkiyi almaya
    -- çalışmak hata ÜRETMEZ.
    REVOKE ALL ON public.app_user FROM arkesoft_auth;
  END IF;
END
$do_rollback_app_user_auth_privileges$;

-- NOT (A1-c ile aynı gerekçe): `arkesoft_auth` rolünün NİTELİKLERİ (LOGIN,
-- NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS, parola) BİLEREK BURADA
-- GERİ ALINMAZ — rol küme seviyesinde VAR OLMAYI sürdürür (`DROP ROLE`
-- yasağı). Bu dosya SADECE v0.0.14.1'in yetki DELTASINI tersler.
