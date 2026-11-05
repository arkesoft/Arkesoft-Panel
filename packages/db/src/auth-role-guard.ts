// @arkesoft/db — `arkesoft_auth` bağlantısının GERÇEKTEN kısıtlı bir rolle
// kurulduğunu ÇALIŞMA ZAMANINDA doğrulayan NEGATİF yetenek probu (ROADMAP
// v0.0.14.1, T-015 FIX turu 1 — security Tur 1 [medium] S-2(b) bulgusu).
//
// SORUN (ölçülmüş, FIX turu 1 handoff'u): `lintCatalog`'un auth-rolü
// kurallarının ÜRETİM çağrı noktası SIFIR — `catalog-lint`/`catalog-snapshot`
// yalnızca test süitlerinde (`*.isolation.test.ts`) koşuyor. `apps/api`
// açılışta `current_user`i ASLA assert ETMİYOR; `DATABASE_AUTH_URL`
// koşulsuz zorunlu olsa bile `??`/`||` ile SESSİZCE `DATABASE_URL`'e
// düşülürse (R-PM4/K-A4'ün "en düşük dirençli yanlış yol"u) tüm derleme
// zamanı kapıları YEŞİL kalır ve gerçek bağlantı GENİŞ yetkili rolle
// (`arkesoft_app`) kurulur — operatörün en düşük dirençli hatası
// `DATABASE_AUTH_URL`i `DATABASE_URL`in BİREBİR AYNISI yapmaktır (üretimde
// `arkesoft_auth` rolü/§7 DDL'i HİÇ koşmamışsa, bkz. `bootstrap-roles.sql`
// vade notu v0.18.0) — bu durumda derleme zamanı hiçbir şey FARK ETMEZ.
//
// ÇÖZÜM — NEGATİF PROB: `lintCatalog`'un statik/offline doğrulamasının
// TERSİNE, bu fonksiyon VERİLEN bağlantının `current_user`ının BİLİNEN bir
// platform tablosunda (`tenant` — `tenancy.ts`'in `AUTH_ROLE_TABLE_
// PRIVILEGE_EXPECTATIONS`sinde arkesoft_auth için HİÇ listelenmeyen bir
// tablo, bkz. o dosyadaki beklenti tablosu) SELECT yetkisi TAŞIMADIĞINI
// `has_table_privilege` İLE sorar. `true` dönerse rol BEKLENENİN AKSİNE
// geniş yetkilidir — FAIL-CLOSED: hata YUTULMAZ, fırlatılır.
//
// KOŞTURULABİLİR YARDIMCI, APPS/API'NİN SÖZLEŞMESİ DEĞİL (T-015 FIX turu 1
// kararı — `backend`'e devredilen kısım): bu fonksiyonun NE ZAMAN
// çağrılacağı (açılışta BİR KEZ, her istekte DEĞİL) ve BAŞARISIZLIK anında
// açılışın düşüp düşmeyeceği `apps/api`'nin DI/yaşam döngüsü kararıdır —
// `packages/db` yalnızca KOŞTURULABİLİR, saf bir yardımcı sağlar (CLAUDE.md
// §3 paket sınırı: `packages/db` iş mantığı/çalışma zamanı orkestrasyonu
// İÇERMEZ, yalnızca şema/RLS/rol doğrulaması sağlar).
//
// TABLO ADI LİTERAL YAZIMI BAĞLAYICI DEĞİL (AGENT_BASELINE §5 literal-jeton
// kuralı yalnızca GUC AYAR ADINI — (`app.` + `tenant_id`) — hedefler, CI'nin
// taraması bu dosyayı KAPSASA bile burada o jeton YOK): `tenant` bir Postgres
// GUC ayarı değil, sabit bir platform tablosu adıdır; bu fonksiyon
// taksonomiden BAĞIMSIZ, SABİT bir prob tablosu kullanır (K-E5'in "hangi
// tablo sır taşıyor" ayrımı burada KONU DEĞİL).
//
// ⚠ LİTERAL-JETON KURALI (AGENT_BASELINE §5): yukarıdaki GUC ayar adı bu
// dosyada BİTİŞİK YAZILMAZ. CI'ın `guards` işi (AC4) `app.` + `tenant_id`
// jetonunu mekanik `grep` ile tarar ve izinli tek adresi
// `packages/db/src/tenant-context.ts`tır; bu yorum bitişik yazılırsa kendi
// kendini eşler ve kapı KALICI YANLIŞ POZİTİF verir (aynı kusur sınıfı başka
// bir GUC fonksiyon adında da yaşandı — bkz. `invitation-token.ts` ve
// `assert-queue-capable-redis.test.ts`'teki aynı kural). İki parçayı burada
// yeniden birleştirip "düzeltme" YAPMA.

import { z } from 'zod'

import type { PrismaDatabase } from './client.js'

/** `assertAuthRoleIsRestricted()`'ın probunun hedef tablosu. */
const PROBE_TABLE_NAME = 'tenant'

const probeRowSchema = z.object({ hasAccess: z.boolean() })

/**
 * `assertAuthRoleIsRestricted()` başarısız olduğunda fırlatılır — bağlantının
 * `current_user`ı {@link PROBE_TABLE_NAME} tablosunda SELECT yetkisine sahip
 * (beklenen: sahip OLMAMALI). En olası sebep: `DATABASE_AUTH_URL`in sessizce
 * `DATABASE_URL`e (geniş yetkili `arkesoft_app`) düşmesi veya rolün yanlış
 * `GRANT` alması. `apps/api` bu hatayı YAKALAYIP açılışı düşürmeli veya en az
 * `error` seviyesinde loglamalı — SESSİZCE yutmamalı (bağlayıcı kısıt, FIX
 * turu 1 handoff'u).
 */
export class AuthRoleNotRestrictedError extends Error {
  constructor(probeTableName: string) {
    super(
      `assertAuthRoleIsRestricted(): bağlantının current_user'ı "${probeTableName}" tablosunda ` +
        'SELECT yetkisine sahip — bu KISITLI bir kimlik doğrulama rolünün davranışı DEĞİL ' +
        '(negatif yetenek probu, fail-closed). "DATABASE_AUTH_URL" sessizce "DATABASE_URL"e ' +
        'düşmüş olabilir veya rol yanlış GRANT almış olabilir — açılışı KONTROL EDİN.',
    )
    this.name = 'AuthRoleNotRestrictedError'
  }
}

/**
 * NEGATİF yetenek probu (R-PM4/security S-2(b)): verilen bağlantının
 * GERÇEKTEN kısıtlı bir rolle kurulduğunu ÇALIŞMA ZAMANINDA doğrular.
 * {@link PROBE_TABLE_NAME} tablosunda `has_table_privilege(current_user, …,
 * 'SELECT')` `false` OLMALI — `tenancy.ts`'in `AUTH_ROLE_TABLE_PRIVILEGE_
 * EXPECTATIONS`sinde bu tablo arkesoft_auth için HİÇ listelenmiyor (ADR-0017
 * borcu, "diğer tüm tablolar: hiçbir yetki yok" beyanının canlı ucu).
 *
 * `true` dönerse {@link AuthRoleNotRestrictedError} fırlatır (FAIL-CLOSED —
 * sessizce geçmez). `checkDatabaseConnection()` (`health.ts`) İLE AYNI dar
 * parametre tipi deseni: `Pick<PrismaDatabase, '$queryRaw'>` — çağırana
 * GEREĞİNDEN GENİŞ bir istemci yüzeyi VERİLMEZ.
 *
 * Çağıranın (`apps/api`) sorumluluğu: AÇILIŞTA BİR KEZ çağırmak (her istekte
 * DEĞİL) ve hatayı ya açılışı düşürerek ya da en az `error` seviyesinde
 * loglayarak ele almak — bu fonksiyon yalnızca PROBU çalıştırır, sonucun
 * yaşam döngüsü kararını VERMEZ.
 */
export async function assertAuthRoleIsRestricted(
  db: Pick<PrismaDatabase, '$queryRaw'>,
): Promise<void> {
  const rows = await db.$queryRaw`
    SELECT has_table_privilege(current_user, ${`public.${PROBE_TABLE_NAME}`}, 'SELECT') AS "hasAccess"
  `
  const parsed = z.array(probeRowSchema).parse(rows)
  const result = parsed[0]
  if (result === undefined) {
    throw new Error(
      'assertAuthRoleIsRestricted(): has_table_privilege sorgusu boş döndü — beklenmeyen ortam.',
    )
  }

  if (result.hasAccess) {
    throw new AuthRoleNotRestrictedError(PROBE_TABLE_NAME)
  }
}
