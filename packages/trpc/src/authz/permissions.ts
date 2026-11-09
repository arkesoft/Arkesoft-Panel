// @arkesoft/trpc — izin kataloğu ve rol → izin eşlemesi (ROADMAP v0.0.14,
// T-014/S2, architect K-A4)
//
// KATALOĞUN FİZİKSEL YERİ BİR TASARIM KARARIDIR (architect K-A4): katalog SAF
// VERİDİR (I/O yok, veri katmanı import'u yok) ve public API yüzeyinin
// PARÇASIDIR — bir izni daraltmak semver olayıdır. `apps/api`'ye koymak her
// istekte bir port çağrısı daha eklerdi ve kataloğu sözleşme paketinde TİPSİZ
// bir isim listesine indirirdi.
//
// ⚠⚠ BU DOSYA ÇALIŞMA ZAMANINDA `trpc.ts`'i, `routers/`'ı VEYA `handler/`'ı
// ÇEKMEZ ve ÇEKMEMELİDİR: `src/index.ts` (TARAYICI girişi) bu dosyadan DEĞER
// export eder ve o girişin sunucu tarafı modül grafiğini çekmediği `rg` ile
// doğrulanır (`index.ts`'in dosya başı sözleşmesi). Buraya bir builder
// import'u eklemek o sözleşmeyi SESSİZCE kırar — tek import'u
// `../schemas/member.schema.js`'tir ve o dosya da yalnızca `zod`'a bağlıdır.
//
// ⚠ TAM OLARAK İKİ İZİN (A-PM2 bağlayıcı, architect K-A4): var olmayan uçlar
// için yer tutucu izin YAZILMAZ. ROADMAP v0.0.14 kapsam metnindeki izin adları
// ÖRNEKTİR, teslim listesi DEĞİL — ölü bir izin (hiçbir prosedürün tüketmediği
// izin) AC3(b)'yi KIRAR ve kataloğu "belgelenmiş ama gerçekleşmeyen kontrol"
// sınıfına düşürür. `member:read` de bilerek YOKTUR: üye OKUMA prosedürü
// bugün yok.
//
// ⚠ İNCE TANELEME REDDEDİLDİ (architect K-A4): davet/rol değiştirme/çıkarma
// için ayrı izinler (ör. davet etme izni ile çıkarma izninin ayrışması)
// değerlendirildi ve reddedildi — üç yazma ucunun YETKİ SINIFI AYNIDIR
// (hepsi kiracının üye listesini değiştirir). Ayrıştırmak iki ölü izin daha
// üretirdi.
//
// GÜNCELLEME (ROADMAP v0.0.15, T-016/S7, architect md 2): `security:write`
// EKLENDİ — üç izne çıktı. ⭐ PLATFORMUN İLK OWNER-MÜNHASIR İZNİ, bilinçli:
// `tenant.updateSecurityPolicy` owner 2FA zorunluluğunu açıp kapatır ve bu
// ayar OWNER'LARI kiracıdan kilitleyebilir (ADR-0018). `admin`'e vermek ALT
// bir rolün ÜST bir role kısıt dayatmasına izin verirdi — bu platformun
// yetki modelinde başka hiçbir izinde yoktur (bugüne kadarki ikisi de rol
// HİYERARŞİSİ içinde aşağı doğru işliyordu). ⚠ `security:read` BİLEREK
// YAZILMADI (`member:read`'in aynı gerekçesi, yukarıda) — okuma ihtiyacı
// `tenant-summary.schema.ts`'e katkısal bir alanla karşılanır, ayrı bir
// izin/prosedür DOĞURMAZ.

import type { TenantRoleWire } from '../schemas/member.schema.js'

/**
 * İzin kataloğu — platformun TÜM izin adlarının kapalı dünyası.
 *
 * `as const` bir üslup tercihi değil, {@link Permission}'ın literal birleşim
 * tipi olarak doğmasının TEK yoludur; `permissionProcedure`'ün girdi tipi bu
 * birleşim olduğu için KATALOĞA GİRMEMİŞ bir izin adıyla bir prosedür
 * kapılamak DERLEME HATASIDIR (AC3 ayak (a) — birincil mekanizma test değil,
 * `tsc`).
 */
export const PERMISSIONS = ['job:read', 'member:write', 'security:write'] as const

/** {@link PERMISSIONS}'ın literal birleşim tipi — `permissionProcedure`'ün girdi tipi. */
export type Permission = (typeof PERMISSIONS)[number]

/**
 * Rol → izin eşlemesi.
 *
 * ⚠⚠ `Record<TenantRoleWire, …>` TAM OLMAK ZORUNDADIR ve bu FAIL-CLOSED
 * mekanizmanın ta kendisidir: rol sözlüğüne yeni bir rol eklenince
 * (`member.schema.ts`) bu nesne EKSİK ANAHTARLA DERLENMEZ → yeni bir rolün
 * sessizce "izinsiz" ya da (daha kötüsü) "varsayılan olarak her şeye yetkili"
 * kalması İMKÂNSIZ. Bu yüzden `Partial<>` veya indeks imzası KULLANILMAZ.
 *
 * ⚠ `job:read` BEŞ ROLÜN BEŞİNDE DE açıktır ve bu bir SEMVER kararıdır
 * (architect K-A13, S5 teyidi): `job.get`/`job.list` dün `tenantProcedure` ile
 * çağrılabiliyordu, yani kiracının HER üyesi okuyabiliyordu. İzinli builder'a
 * taşırken `readonly`/`support`'tan bu yeteneği almak MEVCUT BİR YETENEĞİ
 * KALDIRMAK olurdu → sürüm etkisi MAJOR'a kayardı; oysa bu sürüm MINOR ve
 * `pnpm test:contract` (vade v0.0.22) henüz YOK. Beş role de vererek
 * sıkılaştırma KATKISAL kalır. Bir rolden `job:read`'i çıkarmak ileride ayrı
 * bir MAJOR karardır.
 *
 * `member:write` yalnızca `owner` ve `admin`'de: `staff`/`support`/`readonly`
 * kiracının üye listesini değiştiremez (ROADMAP v0.0.14 kabul kriteri —
 * `readonly` rolü yazma ucuna 403 alır).
 *
 * `security:write` YALNIZCA `owner`'da (ROADMAP v0.0.15, T-016/S7, architect
 * md 2) — `admin` DAHİL hiçbir başka rol owner 2FA zorunluluğunu değiştiremez.
 */
export const ROLE_PERMISSIONS: Readonly<Record<TenantRoleWire, readonly Permission[]>> = {
  owner: ['job:read', 'member:write', 'security:write'],
  admin: ['job:read', 'member:write'],
  staff: ['job:read'],
  support: ['job:read'],
  readonly: ['job:read'],
}
