# ADR-0008 — Sır Taşıyan Tabloların Tipi ve Linti ile Korunması

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-29
- **Karar verenler:** Architect (T-006, gate: qa, security, solid)
- **İlgili versiyon:** `v0.0.5` (ROADMAP v0.0.5 kapsamında uygulanır)

---

## Bağlam

ADR-0007, tek veritabanında kiracı izolasyonunu **Row Level Security (RLS)** ile sağlamayı tanımladı. Ancak v0.0.5, Better Auth kütüphanesini entegre ederek **parola hash'leri ve oturum belirteçleri taşıyan üç yeni tablo** tanıtıyor:

- `account` — parola hash'i (`password` kolonu)
- `session` — oturum belirteci (`token` kolonu)
- `verification` — doğrulama belirteci (`value` kolonu)

Bu tablolar **yapisal olarak RLS ile korunamaz**: giriş anında henüz bir asıl (principal) yok — `current_setting('app.tenant_id')` dayalı bir `USING` yüklemini tanımlamak imkânsız. Parola doğrulaması uygulama kodunda yapılır ve bunu başarmak için **hash'i okumak zorunlu**. RLS, kimliği belirleyen sorgunun _kendisini_ koruyamaz.

Aynı zamanda bu tablolar **platform seviyesi**dir — kullanıcı bir veya birden fazla kiracıda olabilir, bir kiracıya ait bir oturum değil. Öte yandan, bir kod hatasında `account.findMany()` çağrısı tüm hash'leri döndürebilir → **platform çapında hesap ele geçirme riski**.

Bu karar, veritabanı seviyesi RLS yetersiz kaldığında koruma sağlamak için **üç katmanlı bir mekanizm** tanımlıyor:

1. **Derleme zamanı (birincil):** TypeScript `Pick<>` ile izin verilen modeller allowlist'lenmiştir.
2. **Lint zamanı (ikincil):** `no-restricted-imports` kuralı tam istemci yüzeyine erişimi kısıtlar.
3. **Çalışma zamanı (üçüncü):** HTTP yanıt ve log yüzeyleri denetlenerek kontrol edilir.

---

## Karar

Parola hash'leri ve oturum/doğrulama belirteçleri aşağıdaki mekanizmalarla korunur:

### 1. **Derleme Zamanı: `Pick<>` ile İzin Verilen Üyelerin Allowlist'i (T-006 FIX Tur 3)**

`packages/db/src/client.ts`'te:

```typescript
export const AUTH_SECRET_BEARING_MODELS = ['account', 'session', 'verification'] as const

export type AppPrismaDatabase = Pick<PrismaDatabase, 'tenant' | 'user' | 'tenantMembership'>

export type TenantTransactionClient = Pick<TransactionClient, 'tenantMembership'>
```

Sonuç:

- `PrismaService.db` (uygulamanın tenant kapsamlı kodu) → `AppPrismaDatabase` tipi; yalnızca üç üyeye erişim
- `withTenant()` callback'i → `TenantTransactionClient` tipi; yalnızca `tenantMembership`'e erişim
- Listelenmeyen her üye (sır taşıyan üç model, `$transaction`, `$extends`, `$queryRaw`, `$disconnect` vb.) **derleme hatası**; `pnpm typecheck` zorunlu kılar
- `$queryRaw` yalnızca `PrismaService.connectionProbe` erişimcisi (sağlık denetimi) üzerinden açılır; genel uygulama kodu **erişemez**

**Mekanizm değişimi:** Başlangıç `Omit<>` (deny-list, kapalı olması gereken listeyi yazmak) beş kez atlatıldı (`createPrismaClient` import'u · `AUTH_INSTANCE` export'u · `$transaction` ×2 · `$extends`) — hepsi aynı yapısal sebepten. Deny-list, Prisma istemcisinin **evrilen/üretilen** tip yüzeyinde yeni üye eklenince otomatik açılır (fail-open). **`Pick<>` allowlist** ise yalnızca açıkça listeleneni açar; Prisma'nın ileride ekleyeceği yeni `$`-metodlar otomatik **kapalı** gelir (fail-closed). **Bağlayıcı kural:** `Omit` tabanlı deny-list'e artık dönülmeyecek; allowlist'e yeni üye ekleme **açık karar** ve **kod incelemesi** gerektirir. Ölçülmüş gerçek üyelerin kullanımı: `tenant` 32 · `user` 5 · `tenantMembership` 1. `$queryRaw` artık `AppPrismaDatabase`'den çıkarılmıştır; tek tüketici (`PrismaService.connectionProbe`) özel bir erişimci (getter) üzerinden sağlanır.

### 2. **Lint Zamanı: `no-restricted-imports` ile Kontrol Edilen Yüzey**

`apps/api/eslint.config.mjs`'te, tam Prisma istemci yüzeyini taşıyan import'lar yasaklanır:

- `PrismaDatabase`, `AuthPrismaDatabase`, `AUTH_SECRET_BEARING_MODELS`, `createPrismaClient` türleri ve sabitleri yalnızca `apps/api/src/{prisma,auth}/**` içinde import edilebilir
- Diğer modüller daraltılmış `AppPrismaDatabase` veya `TenantTransactionClient` ile çalışır
- Kural, derleme zamanı garantisini (katman 1) destekler: yeteneği veren fabrika ve tam istemci yüzeyine erişim birlikte yasaklanır

### 3. **Çalışma Zamanı: Yanıt ve Log Yüzeyleri**

**HTTP yanıt gövdesi:** Her yanıtın serializer'ı (hata veya başarı) `account.password`, `session.token`, `verification.value` alanlarını **asla** içermez.

**Log redaction:** `PINO_REDACT_PATHS` içine sır taşıyan alanlar eklenir; `pnpm test`'in log yakalama testi Better Auth kütüphanesi dahil tüm çıktıyı denetler.

### 4. **Borç Ölçümü: RLS'siz Platform Tabloları**

| Metrik                                        | v0.0.13 sonrası                                | v0.0.5 sonrası                                                    | Sonraki adım                                               |
| --------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| RLS'siz filtresiz okunabilir platform tablosu | 3 (`tenant`, `app_user`, `_prisma_migrations`) | **6** (+ `session`, `account`, `verification`)                    | v0.0.14: `arkesoft_auth` rolü + tablo REVOKE + kolon GRANT |
| Kimlik bilgisi taşıyan kolon                  | 0                                              | **3** (`account.password`, `session.token`, `verification.value`) | v0.0.14: rol/kolon ayrımı + özel katalog linter kuralı     |
| En kötü durum                                 | Kiracı/kullanıcı listesi sızması               | **Platform çapında hesap ele geçirme**                            | Veritabanı seviyesi rol ayrımı                             |

**v0.0.14'ün işi:**

- `arkesoft_auth` rolü (`NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, üç hash/token tablosunu okuyabilir — diğer hiçbir tablo okuyamaz)
- Platform tablolarına tablo bazlı `REVOKE`, hash/token kolonlarına kolon bazlı `GRANT`
- Katalog linter'ına **kolon yetkisi kural sınıfı** eklenmesi
- İkinci Prisma istemcisi/havuzu (env'de üçüncü bağlantı URL, operatör kırılması #2)

---

## Değerlendirilen Alternatifler

| Alternatif                                     | Avantaj                                                           | Dezavantaj                                                                                                                                                                                                              | Neden Seçilmedi                                |
| ---------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Seçildi: Üç katman (type/lint/test)**        | Derleme zamanı garantisi, mevcut desenle senkron, sıfır maliyetli | Veritabanı seviyesi koruma değil                                                                                                                                                                                        | —                                              |
| Kolon bazlı `REVOKE` + derleme                 | Veritabanı seviyesi, tam mekanik                                  | `WHERE token = $1` gibi sorgular kolon için `SELECT` yetkisi ister → **giriş kırılır**. Ayrıca `has_table_privilege(…,'SELECT')`'i `false` yapıp `APP_ROLE_MISSING_DML_PRIVILEGE` ile **CI'ı kırar**.                   | İki neden: işlevsellik kaybı + CI kırılması    |
| `arkesoft_auth` rolü v0.0.5'te                 | Veritabanı seviyesi, tam çözüm                                    | K-E8 uygulamaya uyumsuzluk: kimlik bilgisi (`DATABASE_AUTH_URL`) `apiEnvSchema`'ya girer → operatör kırılması #2 (v0.0.13'teki ilk operatör kırılmasından bağımsız). Ayrıca beş rol havuzu/sürücü yönetim karmaşıklığı. | v0.0.14'e alındı, iptal edilmedi; yine işlemde |
| Prisma `omit: { account: { password: true } }` | Model seviyesi, tipler otomatik daraltılır                        | Better Auth adaptörü `account` delegesini kendisi okur (şema nesnesinden). Adaptörün kendisini kırar.                                                                                                                   | Ön koşul (Better Auth) adaptasyon yapamıyor    |
| `SECURITY DEFINER` / `LEAKPROOF` işlevler      | Veritabanı seviyesi                                               | Adaptör, veritabanı işlevini doğrudan çağırmaz — SQL sorgu `WHERE` cümlesinde `session.token`'ı taşır, işlev bu alanı filtrelerken gizli kalması imkânsız.                                                              | Uygulanabilir yol yok                          |
| Platform tablolarına RLS                       | Veri/tablolar izole                                               | Giriş sorgusu (`SELECT "account"."password" WHERE "account"."provider_id"=…`) henüz bir asıl yok → `current_setting('app.tenant_id')` tanımsız. Politika döner `NULL` → satır filtreli → **giriş başarısız**.           | Yapısal olarak imkânsız                        |

---

## Olumlu Sonuçlar

1. **Derleme zamanı garantisi:** PM riski 1'in tarif ettiği senaryo — doğrudan `db.account.findMany()` veya `tx.account.findMany()` çağrısı — artık **tip hatasıdır**. Bu doğrudan erişimler, lint kuralını atlatmayı gerektirir. **Dolaylı yollar** (`$extends`, `$queryRaw` vb.) allowlist dışında bırakılır veya açıkça kabul edilir. Tüm yollar — açık ve latent — `packages/db/src/client.ts`'in `Pick<>` üye listesi, olumsuz pinler ve açıklamalar bölümünde kaydedilmiş olmalıdır. `Pick` yapısal fail-closed olduğu için, Prisma yükseltmesinde veya yeni üye eklenmesinde `typecheck` bozulmadan bildirilir.
   - **Ek not (T-006 FIX tur 1, gate: security):** İlk uygulamada, lint katmanının **yetenek veren fabrika fonksiyonu** (kontrol edilen import'lardan biri) kapsam dışında kalması saptanmıştır. Daha sonraki turda, yeteneği veren export de yasak kümeye alınmıştır. Bu tarihsel hata, belgelendirmenin hiç olmayan bir kontrolü "kapalı" olarak gösterebileceğini, sonraki ajanların ADR'yi okuyup yüzeyi **kapalı sandığını** gösterir. **Belgelenmiş ama gerçekleşmeyen bir kontrol, var olmayan ama belgelenmemiş bir kontrolden daha tehlikelidir.**
   - **Ek not (T-006 FIX tur 2, gate: security):** `$transaction()` callback parametresi de sır taşıyan delegeleri içeriyor. Deny-list daraltması yalnızca **anahtar adlarını** (`account`, `session`, `verification`) kapsıyor; bu anahtarlara **başka bir yoldan** erişen API'ler bu anahtarları yine taşıyabilir. Callback'inin `TenantTransactionClient`'a daraltılması ölçüldü (güvenli görünür, ama `withTenant`'ın tenant GUC adımını atladığında "narrow = güvenli" yanılgısına yol açar), ama bilerek seçilmedi — yerine `$transaction` üyesi allowlist dışında bırakıldı (`AppPrismaDatabase` ve `TenantTransactionClient` tanımlarında).
   - **Ek not (T-006 FIX tur 3, gate: security):** Beşinci kaçış kapısı `db.$extends({})` — Prisma'nın istemciyi genişleten API'si. Deny-list dersinin son tekrarı. Başlangıçta `Omit<>` seçildiğinde `$extends` istenen yol (ileride Prisma'nın kendi iç işlem istemcisinden bilerek düşürmesi) olarak kaydedilmişti (`client.ts` yorumu `ITXClientDenyList`'i sayar), ama `AppPrismaDatabase`'in kendisinde aynı soruyla sorulmamıştı. Allowlist'e geçişle **yedi kapı da kapalı**: `Pick<…, 'tenant' | 'user' | 'tenantMembership'>` yalnızca şu üçünü açar; sır taşıyan üç model, `$transaction`, `$extends`, `$queryRaw`, `$disconnect` vb. hepsi **derleme hatası** (ölçüldü: `db.$extends({}).account.findMany()` → **TS2339**). Ölçülmüş kapı tarihi sayısı (7) ve yapısal hatanın ortak kökü (deny-list fail-open) → **FIX tur 3'te jenerik pin** yazıldı (`packages/db/src/__tests__/type-pins/auth-model-narrowing.pin.ts`): tüm `$`-önekli Prisma üyeleri ve allowlist'in kendisine yapılan her eklenti kapalı-dünya ölçümü ile yaklanır.
   - **Ek not (T-006 FIX tur 4, gate: solid):** `tenantMembership` allowlist'te kalırken `$disconnect` (`0` tüketici üretim ve testte) allowlist dışında bırakılmıştır. Ayrım: `tenantMembership` **active bir izolasyon testi** (`context`'siz okunun `0` satır döndüğünü pinleyen test) ile **gerçek güvenlik değişmezi** olarak kurulmuştur; bu testin varlığı bir kontrol olarak işlev görür. `$disconnect` sadece test teardown'ında kullanılır ve hayat döngüsü kontrol kapısıyla yapılandırılır — testvarya tarafından olmaz. Bu yüzden `tenantMembership` allowlist'te **gerekli**, `$disconnect` allowlist dışında **kesindir**.

2. **Mevcut desen ile senkron:** `tenant-context.ts` iç içe `withTenant()`'ı zaten yapısal olarak kısıtlıyor; tip daraltması aynı kaldıraç mekanizmasını koruma amacı için yeniden kullanıyor.

3. **Lint kapısı:** Tam istemci yüzeyine (`AuthPrismaDatabase`) erişim imzası `AuthModule` dosya yoludur. Prisma istemci yüzey kısıtlaması `no-restricted-imports` kuralı ile uygulanır; `apps/api` altında yalnızca `src/prisma/**` ve `src/auth/**` modülleri tam istemciye erişebilir.

4. **Çalışma zamanı doğrulama:** AC6 ve AC8 testleri yanıt ve log yüzeylerini yakalanmış Better Auth logger'ı dahil denetleyip, tüm veri erozyonunun sızıntısını kontrol eder.

---

## Olumsuz Sonuçlar

1. **Veritabanı seviyesi koruma değil:** `arkesoft_app` rolü (çalışma zamanı) üç tabloyu **filtresiz** okuyabilir. Bir kod hatasında, meşru bir `$queryRaw`, dolaylı bir `$extends` yolu, ya da DB kimlik bilgisini ele geçiren saldırgan tüm hash'leri alır. **Bu bir veritabanı garantisi DEĞİLDİR ve öyle sunulmamalıdır.**

2. **v0.0.14 borcu:** Üç katmanlı mekanizm derleme/lint/yanıt katmanlarındaki hataları yakalar ama veritabanı seviyesi eksiklik kalır. v0.0.14 **`arkesoft_auth` rolü ile bu açığı kapatacak**, ancak **ikinci operatör kırılması** (env'de üçüncü bağlantı URL) getiriyor.

3. **Katalog linter genişlemesi:** v0.0.14'ün kolon yetkisi denetlemesi v0.0.5'te planlanmıyor; yalnızca tablo seviyesinde RLS kontrolleri var.

4. **Kapalı olan kaçış yolları (v0.0.5 sonunda):** Yapısal olarak yedi ayrı kaçış kapısı keşfedildi; altısı allowlist mekanizması ile kapalı, biri latent. Bulgu tarihçesi:

| Tur | Kapı                                                       | Nasıl kapandı                                                              |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | `createPrismaClient` import'u                              | Lint jetonu (R-1 katman 2)                                                 |
| 1   | `AUTH_INSTANCE` export'u                                   | `AUTH_SESSION_READER` (`{userId, sessionId}`)                              |
| 2   | `$transaction` (`AppPrismaDatabase`)                       | Allowlist dışında                                                          |
| 2   | `$transaction` (`TenantTransactionClient`, iç içe)         | Allowlist dışında                                                          |
| 3   | `$extends`                                                 | Allowlist dışında                                                          |
| 4   | `$queryRaw` (`AppPrismaDatabase` genel yüzeyi)             | **Allowlist dışında** — `PrismaService.connectionProbe` erişimci           |
| 5   | `private readonly client` → `#client` (ECMAScript private) | **Runtime barrier** — özel alan erişimi derleme + çalışma zamanında kapalı |
| —   | `Parameters<typeof withTenant>[0]`                         | **Kapalı DEĞİL** — K-E5 ile bilinçli (v0.0.14 borcu)                       |

**Dersler:** Yedi kapı aynı yapısal sebepten açıldı — deny-list mekanizması fail-open (yeni Prisma üyesi = otomatik açık). Allowlist (fail-closed) ile v0.0.5 kapandı. **Latent kapı (`Parameters<>`)** — withTenant imzası daraltılamaz (PO sapması 1) çünkü strict callback tipleri `PrismaService`'i uyumsuz yapar. **FIX tur 3'te** jenerik kapalı-dünya pini yazıldı: `AppPrismaDatabase` ve `TenantTransactionClient` anahtar kümeleri allowlist'in tam tersini kanıtlayarak, sesizce yapılan her yetkisiz genişlemeyi (yeni bir `$`-metot veya allowlist'e seyyari ekleme) yakarlar.

---

## Gözden Geçirme Koşulları

Bu karar aşağıdaki durumlar gerçekleşirse yeniden değerlendirilir:

1. **Better Auth başka bir bağımlı kimlik bilgisi modeli getirse** (ör. API anahtarları, OAuth token'ları) — allowlist'e yeni model eklenir (açık karar, kod incelemesi gerekir).

2. **v0.0.14'e kadar veritabanı seviyesi RLS'i geri açmak gerekirse** (ör. saldırı senaryosu keşfedilirse) — `arkesoft_auth` rolü hızlandırılabilir veya geçici kolon `REVOKE` uygulanır (CI kırılır, operatör adımı gerekir).

3. **Derleme zamanı daraltmasının başka bir model üzerinde çoğaltılması gerekirse** — allowlist'in başka bir modüle taşınması gerekirse, jenerik bir `Pick<Client, ModelNames>` fabrikatörü yazılabilir (ama henüz gerekmiş değil).

4. **Better Auth, Prisma adaptörü yazarken `SELECT` yapması için `$transaction` yetkisi istese** — Üzün yolu `authPrismaClient` başarısız olur; jenerik adaptör yolu kopyası ve ayrı `DATABASE_AUTH_URL` gerekir (v0.0.14'e taşınır).

---

## İlişkili Kararlar ve Çapraz Referanslar

- **ADR-0007** (v0.0.13): RLS + rol ayrımı tespiti. O karar şu bulguya dayalıydı: "Kimlik bilgisi tabloları için RLS yazılamaz → veritabanı seviyesi başka bir yolu var mı?" Bu ADR, "yok" cevabını verir ve üç katmanlı tipi çözüm tanımlar.
  - **Durum:** ADR-0007'nin `Durum:` satırı **DEĞİŞMEZ** — Bu ADR ADR-0007'nin yerini almaz, **sınırını çizer**. İkisi beraber okunur.

- **CLAUDE.md §7** (Tenant izolasyon kontrol listesi): Kontrol maddeleri içinde prosedür türü ("Prosedür `tenantProcedure` mi") ve giriş doğrulaması ("Girdideki hiçbir `id` doğrudan güvenilmiyor") olmak üzere iki unsur bulunur; v0.0.5'te bunlar HTTP katmanında (`AuthGuard` ve giriş validasyonu) karşılanır.

- **T-006 / ROADMAP v0.0.5**: "Kimlik doğrulama" görevi bu ADR'nin çerçevesini kurar.

- **ROADMAP v0.0.14**: ADR-0008'in v0.0.14 borcunun (veritabanı seviyesi rol ayrımı ve kolon yetkisi) detayları Teknik Borç tablosunda belirtilmiştir.

---

## Notlar

- **"Veritabanı garantisi değildir" neden açıkça yazılıyor?** Bazı okur bu kararı "sızıntı kapalı" olarak anlar; açıkça yazılmazsa operasyon ekibi v0.0.14 kapalı olduktan sonra "neden veritabanı seviyesi yok" sorusunu sorar. Karar **tartışılmış ve bilinçli reddetilmiş**.

- **Neden İkinci `app.module.ts` yazıcısı S6'da geliyor?** `AuthContextMiddleware` (S5 → S6 arası yazılan) `app.module.ts`'in `configure()` method'una eklenecek; bu `AuthModule` import'ünün (S5) ardından gelir, ancak parametreleri `AuthGuard` (S6) tarafından sağlanan `TenantMembership` kontrolüne bağlı. S5 → S6 → alt görev sırı bağlı.

- **Neden Prisma `omit` çalışmadı?** Better Auth adaptörü Prisma modelini kendisi çağırır. Model tanımında `omit`'e bakılsa bile, adaptör dış bir Prisma istemcisinden (farklı bir sürücü veya özel kullanım) model üzerinde direkt işlem yapar ve o tanımı görmez. Ek olarak her yerde `omit` tutarlılığını sağlamak mekanik bir senkronizasyon sorunudur. Bu yüzden model seviyesi kısıtlama **çekirdek kodda** uygulanabilir değildir; derleme zamanı tip daraltması ile dış erişim yapısal olarak engellenir.

- **Yol tabanlı log redaction'ın sınırı (v0.0.17 gözlemlenebilirlik):** `PINO_REDACT_PATHS` yol tabanlı maskeleme sağlar (ör. `account.password`, `session.token`). Ancak serbest metin alanlarına (hata mesajları, log çıktıları) gömülü PII'yi (e-posta adresleri, telefon numaraları, TCKN) yakalayamaz. Örnek: `causeMessage` sağlayıcı SMTP yanıtını içerse, `"550 5.1.1 <user@example.com>: Recipient address rejected"` mesajındaki adres yol tabanlı kurallarla maskelenmez. İçerik düzeyinde redaction (regex, PII tanıyıcı) gereklidir ve v0.0.17 planlaması kapsamında ele alınmalıdır. Geçici çözüm: serbest metin alanlarında müşteri verisi (e-posta, ad) yazılmaz; yalnızca sağlayıcı tarafından dönen kodlar/referanslar (request ID, SMTP kod) tutulur.

- **Tekrarlanan ders: Deny-list fail-open → Allowlist fail-closed.** Bu proje üç kez aynı yapısal hatayla karşılaştı: (1) T-004'te sezgisel eşik (`count > 3`) yazıldı → üçüncü eşik bypass edildi → çözüm **kanonik tam eşitlik** (`count === 3`, yeni bir kısıtlama seçeneği kuramaz). (2) T-006 gate: S5'te Better Auth'un `disabledPaths` "kapalı yolları söyle" listesine güvenildi → yolun "benzeri" atlatıldı → çözüm **kendi `AuthPathSet` allowlist**'i (yalnızca açık yolları söyle). (3) T-006 FIX turu 3'te `Omit<>` deny-list — kapalı yolları söyle — beş kez atlatıldı → çözüm **`Pick<>` allowlist** (yalnızca açık yolları söyle). **Ortak kök:** kontrol etmediğin bir yapı (eşik sayısı, çerçeve yapılandırması, Prisma istemci tipi) **geliştiğinde**, deny-list **otomatik açılır** (gözden kaçırılan yeni eşik/yol/üye), allowlist **otomatik kapalı** kalır. **v0.0.5'ten sonra kural:** veri/yapı sınırı tanımlanırsa, **akı tamamen allowlist** (açık olması istenen listeyi yaz); deny-list asla kullanılmayacak. **İstatistik:** T-004 eşiği 3 kez, T-006 S5 yolu 1 kez, T-006 FIX3 `Omit<>` 5 kez atlatıldı — bypass sayısı arttıkça mekanizma gücü artmıştır (sezgisel eşik → kanonik eşitlik → derleyici-zorunlu allowlist → jenerik anahtar-pin).
