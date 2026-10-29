# T-006 — Güvenlik Gate, Tur 4 (dar kapsam)

- **Tarih:** 2026-10-29
- **Sürüm:** ROADMAP v0.0.5 (T-006), FIX turu 3 sonrası
- **Dal:** `main` (commit atılmadı, 95 dosya çalışma ağacında)
- **Kapsam:** Orkestratör handoff'u — madde 1 (altıncı kapı araması), madde 2
  (jenerik pin), madde 3 (tur 3 bulgularının kaderi), madde 4 (gerileme kontrolü),
  madde 5 (CLAUDE.md §7 madde 2 · 5 · 8 · 13)

```
GATE: security
SONUÇ: PASS
```

> **PASS, "sır sızıntısı kapandı" DEMEK DEĞİLDİR.** FIX 3'ün ÜSTLENDİĞİ iş
> (derleme zamanı `Pick<>` allowlist'i) **ölçülerek karşılandı**; tur 3'ün `high`
> bulgusu **KAPANDI**. Ancak **altıncı kapı** (`$queryRaw`, S4-1) **AÇIK** ve
> çalışma zamanında **2830 parola hash'i** okuduğu ÖLÇÜLDÜ. Bu bulgu `medium`
> olarak derecelendirildi (gerekçe S4-1 içinde) ve `AGENT_BASELINE.md` §4 kuralı
> 1–2 `medium` için PASS diyor. **Düzeltmesi 3 dosyada ~6 satırdır** ve
> Orkestratör'ün bunu v0.0.5 içinde bloklamayan bir yama olarak almasını
> öneriyorum — bkz. S4-1 "önerilen düzeltme".

---

## 1. ⚠ ALTINCI KAPI ARAMASI — `Pick<>` gerçekten fail-closed mı?

### 1.1 Negatif yüzey — ÖLÇÜLDÜ, 19/19 REDDEDİLDİ

Geçici prob (`apps/api/src/secprobe/gate-a.ts`, ÜRETİM kod yolu — `prisma`/`auth`/
`__tests__` DIŞI, lint bloğu (1) geçerli), `npx tsc -p apps/api/tsconfig.json`:

| Erişim                                                       | Tip                       | Sonuç                            |
| ------------------------------------------------------------ | ------------------------- | -------------------------------- |
| `db.$extends`                                                | `AppPrismaDatabase`       | **TS2339** ✓                     |
| `db.$transaction`                                            | `AppPrismaDatabase`       | **TS2339** ✓                     |
| `db.$on`                                                     | `AppPrismaDatabase`       | **TS2339** ✓                     |
| `db.$use`                                                    | `AppPrismaDatabase`       | **TS2339** ✓                     |
| `db.$connect`                                                | `AppPrismaDatabase`       | **TS2339** ✓                     |
| `db.$disconnect`                                             | `AppPrismaDatabase`       | **TS2339** ✓                     |
| `db.$executeRaw`                                             | `AppPrismaDatabase`       | **TS2339** ✓                     |
| `db.$metrics`                                                | `AppPrismaDatabase`       | **TS2339** ✓                     |
| `db.$applyPendingMigrations`                                 | `AppPrismaDatabase`       | **TS2339** ✓                     |
| `db.account` / `.session` / `.verification`                  | `AppPrismaDatabase`       | **TS2339 ×3** ✓                  |
| `tx.account` / `.session` / `.verification`                  | `TenantTransactionClient` | **TS2339 ×3** ✓                  |
| `tx.$transaction` / `tx.$queryRaw` / `tx.tenant` / `tx.user` | `TenantTransactionClient` | **TS2339 ×4** ✓                  |
| **`db.$queryRaw`**                                           | `AppPrismaDatabase`       | **DERLENİYOR** (allowlist üyesi) |

`$queryRawUnsafe`/`$executeRawUnsafe` ayrıca `packages/config/eslint/base.js:124-136`
`no-restricted-syntax` (nokta **ve** hesaplanmış erişim) ile yasaklı.

**Mekanizma iddiası DOĞRULANDI:** `Pick<>` fail-closed. `$extends` dahil
listelenmeyen her üye otomatik kapalı. Tur 3'ün `high`'ı **KAPANDI**.

### 1.2 ⚠ ALTINCI KAPI — `$queryRaw`, ÖLÇÜLDÜ, AÇIK

`apps/api/src/secprobe/gate-b.ts` (üretim kod yolu, `PrismaService` dışı bir dizin):

```ts
export async function probeQueryRawSecretRead(db: AppPrismaDatabase) {
  return db.$queryRaw<{ email: string; password: string }[]>`
    SELECT u.email, a.password FROM "account" a JOIN "app_user" u ON u.id = a.user_id`
}
```

- `npx tsc -p apps/api/tsconfig.json --noEmit` → **0 hata**
- `npx eslint src/secprobe/gate-b.ts` → **exit 0, 0 hata**

**Çalışma zamanı (gerçek Nest DI grafiği, `AppModule` ithal eden geçici modül,
SADECE `@Inject(PrismaService)` enjekte eden SIRADAN bir servis):**

```
C1_HASH_SAYISI= 2830
C1_ORNEK_HASH_PREFIX= 2d9b73a…[MASKELI]
```

Doğrudan `@arkesoft/db` üzerinden ikinci ölçüm (scratchpad probu):

```
TOPLAM_PAROLA_HASH= 2759
TOPLAM_SESSION= 2863
TENANT_MEMBERSHIP_CTX_YOK= 0     ← RLS tenant tablolarında SAĞLAM
```

`psql` doğrulaması (`pg_class.relrowsecurity`):

```
 session           | f      account | f      verification | f
 tenant            | f      app_user| f      tenant_membership | t
```

→ **S4-1**

### 1.3 Delege / promise GERİ YOLU — ÖLÇÜLDÜ, YOK

`gate-f.ts`, altı kapalı-dünya `Extract<>` kontrolü, hepsi `never` (tsc 0 hata):

| Yüzey                                                   | `account`/`session`/`verification` geri yolu | `$`-metot geri yolu |
| ------------------------------------------------------- | -------------------------------------------- | ------------------- |
| `AppPrismaDatabase['tenant']` (delege)                  | `never` ✓                                    | `never` ✓           |
| `ReturnType<…['tenant']['findMany']>` (`PrismaPromise`) | `never` ✓                                    | `never` ✓           |
| `AppPrismaDatabase['tenant']['fields']`                 | —                                            | `never` ✓           |
| `AppPrismaDatabase['$queryRaw']`                        | —                                            | `never` ✓           |

**`$extends`'in "TypeMap'ten yeniden inşa" numarasının bir benzeri YOK.**

### 1.4 Diğer genişletme girişimleri — ÖLÇÜLDÜ

| Girişim                                                                                    | tsc        | eslint | Çalışma zamanı        | Sonuç                                              |
| ------------------------------------------------------------------------------------------ | ---------- | ------ | --------------------- | -------------------------------------------------- |
| `p.withTenant('t', async (tx: TransactionClient) => tx.account.findMany())`                | **TS2345** | —      | —                     | **KAPALI** ✓ (`strictFunctionTypes` kontravaryans) |
| `withTenant(p.db, 't', …)` (`as` yok)                                                      | **TS2345** | —      | —                     | **KAPALI** ✓                                       |
| `p.client` (assertion yok)                                                                 | **TS2341** | —      | —                     | **KAPALI** ✓                                       |
| `tx.account` (callback içinde, assertion yok)                                              | **TS2339** | —      | —                     | **KAPALI** ✓                                       |
| `@Inject(PRISMA_CLIENT) full: Parameters<typeof withTenant>[0]`                            | **0**      | **0**  | **ÇÖZÜLEMEDİ**        | **LATENT** → S4-6                                  |
| `(p as unknown as { client: Parameters<typeof withTenant>[0] }).client.account.findMany()` | **0**      | **0**  | **2894 satır OKUNDU** | **AÇIK** → S4-2                                    |

`PRISMA_CLIENT` çözümleme hatasının birebir metni:

```
Nest can't resolve dependencies of the WidenService (?). Please make sure that the
argument Symbol(PRISMA_CLIENT) at index [0] is available in the WidenModule module.
```

(`PrismaModule` `@Global()` ama `exports: [PrismaService]` — ham token dışa açılmıyor.)

---

## 2. ⚠ JENERİK PİN — BAĞIMSIZ OLARAK SINANDI, 4/4 ÇALIŞIYOR

`packages/db/src/client.ts` **scratchpad'e `cp` ile yedeklendi**
(`shasum 45e93025…`), dört sınama yapıldı, **byte-birebir geri alındı**
(`shasum 45e93025…`, `git status --porcelain | wc -l` → 95, başlangıçla aynı).

| #   | Değişiklik                                                                      | `tsc -p packages/db` sonucu                                                                                                 |
| --- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | `AppPrismaDatabase` Pick'ine `'account'`                                        | **TS2578** (`pin.ts:126`, isim bazlı negatif pin) + **TS2322** (`pin.ts:268`, jenerik pin — mesajda `"account"` **adıyla**) |
| 2   | `AppPrismaDatabase` Pick'ine **isim bazlı pinde OLMAYAN** `'$executeRawUnsafe'` | **TS2322** (`pin.ts:268`) — mesaj: `["FAZLA ANAHTAR — Pick<> listesine izinsiz eklenmiş üye", "$executeRawUnsafe"]`         |
| 3   | `TenantTransactionClient` Pick'ine `'session'`                                  | **TS2578** (`pin.ts:185`) + **TS2322** (`pin.ts:302`)                                                                       |
| 4   | `TenantTransactionClient` Pick'ine isimsiz `'$executeRaw'`                      | **TS2322** (`pin.ts:302`) — adı mesajda                                                                                     |

**SINAMA 2 ve 4 belirleyicidir:** isim bazlı hiçbir pin'in kapsamadığı bir üye
eklendiğinde **yalnızca jenerik pin** yakalıyor ve **ihlal eden anahtarın adını
hata mesajına yazıyor**. Prisma yükseltmesinde `Pick<>` literaline sessiz bir
ekleme yapılırsa `pnpm typecheck` KIRMIZI döner. **Jenerik pin GERÇEKTEN koruyor.**

Geri alma sonrası `tsc -p packages/db --noEmit` → **0 hata**.

**Tek kusur:** pin dosyasının KATMAN 3 **başlık** yorumu (`:46-49`) "Prisma
ileride YENİ bir `$`-metot eklerse (adını BİLMEDEN) bile bu pin yakalar" diyor.
**Yakalamaz** — yeni bir Prisma üyesi `keyof AppPrismaDatabase`'e hiç girmez (o
`Pick<>`'in işi, ki `Pick<>` onu zaten yapıyor). Pin'in gerçek işi `:249-251`'de
DOĞRU yazılı. → **S4-7** (`low`)

---

## 3. Tur 3 bulgularının kaderi

| Tur 3                                                        | SEV      | Durum                                                            | Kanıt                                                                                                                                                                                    |
| ------------------------------------------------------------ | -------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S3-1** `$extends` beşinci kapı                             | `high`   | **KAPANDI**                                                      | §1.1 — 19/19 TS2339; `$extends` artık negatif pinde (`pin.ts:156-159`) ve jenerik pin'in kapalı-dünyası dışında                                                                          |
| **S3-2** ADR-0008 metni                                      | `medium` | **KISMEN**                                                       | `Pick` normatif blok YAZILI (:34-55, 7 geçiş); `:103`'teki "imkânsız" **KALKTI**; latent altıncı **KAYITLI** (:133). **AMA yeni çelişkiler girdi** → **S4-3**                            |
| **S3-3** `tenant-context.ts` yorumu                          | `low`    | **ölçülmedi** — önceden var olan borç (handoff talimatı)         | —                                                                                                                                                                                        |
| **S3-4** `providerErrorCode` sınırsız                        | `low`    | **DEĞİŞMEDİ**                                                    | `auth-instance.ts:219` `record['code']` hâlâ sınırsız string → **S4-8**                                                                                                                  |
| **S3-5** `singleHeaderValue`                                 | `low`    | **ölçülmedi** — `same-origin.guard.ts` FIX3'te DEĞİŞMEDİ         | —                                                                                                                                                                                        |
| **S3-6** `Parameters<typeof withTenant>[0]`                  | `low`    | **AÇIK, `low` KALIYOR**                                          | §1.4 — tip+lint 0, ama DI **çözülemedi**. Göreli ağırlığı **artmadı**: bariyer (DI export'u) değişmedi → **S4-6**                                                                        |
| **S3-7** log ayakları                                        | `low`    | **ölçülmedi** — `auth-instance.ts` log yolları FIX3'te DEĞİŞMEDİ | —                                                                                                                                                                                        |
| **S3-8** Redis ölçüm uyarısı                                 | `low`    | **ölçülmedi** — ortam notu                                       | —                                                                                                                                                                                        |
| **S3-9** `pnpm test` hermetik değil                          | `low`    | **KAPANDI**                                                      | `platform:auth:*` = **0** (öncesi), `pnpm test` → **310/310**, flush YAPILMADAN **ikinci** koşu → **310/310**, sonrası yine **0**. S8'in `create-test-app.ts` flush'ı kök nedeni çözmüş. |
| **S3-10** `disableOriginCheck`/`disableCSRFCheck` HTTP testi | `low`    | **KAPANDI**                                                      | `auth-delegated-origin-check.qa.test.ts` (NODE_ENV=`development`, evil Origin → 403 INVALID_ORIGIN) + 3 kardeş test → **4 dosya / 8 test yeşil**                                         |
| **S3-11** `pnpm audit` multer                                | `low`    | **DEĞİŞMEDİ**                                                    | 1 high, GHSA-q7qp-rjg7-q26m → **S4-9**                                                                                                                                                   |

---

## 4. Gerileme kontrolü (madde 4)

FIX3'te **değişen TS/MD dosyalarının tamamı** (`find -newermt "2026-10-29 20:00"`,
`dist`/`generated` hariç): `client.ts` · `auth-model-narrowing.pin.ts` ·
`auth.module.ts` · 7 test dosyası · ADR-0008 · `development.md` · 6 review .md.

| Yüzey                                                                                               | Durum                              | Kanıt                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `errors/describe-error-cause.ts` (SMTP serbest metin yasağı)                                        | **DEĞİŞMEDİ** (mtime 19:33 < FIX3) | dosya başı ⚠ yasağı yerinde (`:17-24`)                                                                                                                |
| SMTP sır sızıntısı (bir mod yeniden ölçüldü)                                                        | **TEMİZ**                          | `auth-secret-leak-smtp-failure-modes.qa.test.ts` + `auth-secret-leak.test.ts` → yeşil                                                                 |
| `SameOriginGuard`                                                                                   | **YERİNDE**                        | `sessions.controller.ts:51` `@UseGuards(SameOriginGuard)`; `same-origin-guard-fail-closed.qa.test.ts` yeşil                                           |
| Delege uçların origin kontrolü                                                                      | **YERİNDE**                        | `auth-instance.ts:364-365` `env.NODE_ENV === 'test'` ile SINIRLI; `development` ölçümünde 403                                                         |
| `revokeSessionsOnPasswordReset: true`                                                               | **YERİNDE**                        | `auth-instance.ts:336`                                                                                                                                |
| Oran sınırlama fail-closed                                                                          | **YERİNDE**                        | `rate-limit.service.ts:156-157` → `throw new RateLimitStoreUnavailableError(cause)` (Redis arızası = **reddet**, geç değil)                           |
| `AuthModule` dışa açılan yüzey                                                                      | **DARALMIŞ, GERİLEME YOK**         | `auth.module.ts:202` `exports: [AUTH_SESSION_READER]`; `AUTH_INSTANCE` ve `AUTH_PRISMA_CLIENT` (tam `AuthPrismaDatabase`) dışa **AÇILMIYOR**          |
| `AuthModule`'un ikinci istemcisi                                                                    | **FAIL-CLOSED**                    | `auth.module.ts:68` `createPrismaClient({ databaseUrl })` — `tenantContextSetting` **verilmemiş** → o istemcide `withTenant()` `throw` eder (tasarım) |
| `AUTH_SECRET_BEARING_MODELS`/`PrismaDatabase`/`AuthPrismaDatabase`/`createPrismaClient` lint yasağı | **YERİNDE**                        | `apps/api/eslint.config.mjs:46-60`, 4 blok ayrık (R-P1)                                                                                               |
| Sır repoya girdi mi                                                                                 | **HAYIR**                          | `.env` `.gitignore:7`'de; `.env.example` yalnızca `*_dev_only_*`/`*_change_me_*` yer tutucuları; diff'te gerçek sır yok                               |

---

## 5. CLAUDE.md §7 — madde 2 · 5 · 8 · 13

| #      | Madde                                                                       | Durum                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2**  | RLS etkin + politika `current_setting('app.tenant_id')` ile karşılaştırıyor | **KARŞILANMIYOR — bilinçli + belgelenmiş.** `pg_class.relrowsecurity`: `account`/`session`/`verification` = `f` (ayrıca `tenant`/`app_user` = `f`, v0.0.13'ten devreden). ADR-0008 bunu yapısal olarak gerekçelendiriyor; v0.0.14 `arkesoft_auth` rolü. Tur 3 ile **AYNI**.                                                                                                                                                     |
| **5**  | Sorgular `withTenant()` üzerinden; ham `prisma` çağrısı yok                 | **KARŞILANMIYOR — ama artık BELGELENMİŞ.** `$extends` kapandı; yerine **`$queryRaw`** (allowlist üyesi) aynı işi yapıyor: 2830 hash, tenant context YOK, tsc 0 / eslint 0 (§1.2). ADR-0008:118 bu yolu **açıkça kalan risk** olarak yazıyor — tur 3'teki "YENİ ve belgelenmemiş" durumundan farkı budur. **Teslim edilen kodda ihlal YOK** (üretimde `$queryRaw`'ın tek yolu `checkDatabaseConnection`'ın `SELECT 1`'i). → S4-1 |
| **8**  | Dış kaynak (önbellek anahtarı vb.) tenant'a kapsamlı                        | **KARŞILANMIYOR — bilinçli + belgelenmiş.** Oran sınırlama sayaçları `platform:auth:*` (kimlik öncesi, tenant bilinmiyor — K3/R1). Tur 3 ile **AYNI**.                                                                                                                                                                                                                                                                          |
| **13** | Log kayıtlarında `tenantId` var                                             | **KARŞILANMIYOR — bilinçli + belgelenmiş** (`/auth/*` uçlarında tenant bilinmez). **AMA `development.md` tablosu `giriş başarılı` için `tenantId ✓` yazıyor ve bir satır altındaki kendi notuyla çelişiyor** → **S4-4**                                                                                                                                                                                                         |

---

## BULGULAR

### [SEV: medium]

**S4-1** — `packages/db/src/client.ts:136-139` (`AppPrismaDatabase` Pick listesi)
— **KAYDA GEÇECEK BORÇ** (kapsamı T-006'nın ölçüm hatası)

**ALTINCI KAPI — `$queryRaw`.** Saldırı senaryosu (somut, çalışma zamanında
ÖLÇÜLDÜ): `PrismaService`'i enjekte eden **herhangi bir** `apps/api` servisi
(bugün ~38 çağrı yeri) tek satır yazar:

```ts
this.prismaService.db.$queryRaw`SELECT u.email, a.password FROM "account" a
  JOIN "app_user" u ON u.id = a.user_id`
```

`pnpm typecheck` **yeşil**, `pnpm lint` **yeşil**, `pnpm test` **yeşil**. Çalışma
zamanında **2830 parola hash'i** + (aynı yolla) **2863 oturum belirteci** döner;
`account`/`session`/`verification` tablolarında **RLS YOK** (`relrowsecurity=f`,
`psql` ile doğrulandı), tenant context kurulmaz, `withTenant()` atlanır, denetim
kaydı üretilmez, log sinyali sıfırdır. Kötü niyetli bir katkıcı için bu, beş
turda kapatılan kapıların **tam eşdeğeri**; dikkatsiz bir geliştirici için bir
`SELECT *` kazası platform çapında hesap ele geçirme verisi döker.

**Neden `high` DEĞİL `medium`:**

1. Teslim edilen kodda **ihlal yok** — `$queryRaw`'ın üretimdeki tek yolu
   `packages/db/src/health.ts:48`'in sabit `SELECT 1`'i (hiçbir tabloya
   dokunmaz).
2. **Belgelenmiş ve bilinçli kabul edilmiş** kalan risk: ADR-0008:118 birebir
   "meşru bir `$queryRaw` … tüm hash'leri alır. **Bu bir veritabanı garantisi
   DEĞİLDİR**". Tur 1–3'ün `high`'ları **"kapalı" diye sunulan ama açık olan**
   kontrollerdi; bu ise **"açık" diye sunulan ve açık olan** bir yol.
3. FIX 3'ün ÜSTLENDİĞİ mekanizma iddiası (`Pick<>` fail-closed) **çürütülmedi** —
   §1.1'de 19/19, §2'de 4/4 ölçüldü. `$queryRaw` bir **atlatma** değil, bilinçli
   bir **allowlist üyesi**.
4. `AGENT_BASELINE.md` §4: "Emin değilsen bir alt seviyeyi seç ve gerekçesini
   açıklamaya yaz."

**T-006'nın ölçüm hatası (bulgunun asıl özü):** `client.ts:124-127` üyeyi
`"1 çağrı yolu: health.ts"` ile gerekçelendiriyor. Bu, **gerçekleşen** çağrı
sayısını ölçer; **erişebilen** çağıran sayısını ölçmez. Üye
`AppPrismaDatabase`'e verildiği için yetki `health.ts`'e değil, `.db` getter'ını
gören **her servise** verildi. `tenant`/`user`/`tenantMembership` için bu ayrım
zararsız (RLS var); `$queryRaw` için **değil**.

**Önerilen düzeltme (≈6 satır, 3 dosya + pin, DAVRANIŞ DEĞİŞİKLİĞİ YOK):**

1. `packages/db/src/health.ts:48` → imza `checkDatabaseConnection(db: Pick<PrismaDatabase, '$queryRaw'>)`
2. `apps/api/src/prisma/prisma.service.ts` → `get db()` YANINDA ayrı, tek üyeli
   bir erişimci: `get connectionProbe(): Pick<PrismaDatabase, '$queryRaw'> { return this.client }`
   — **tek tüketici** `health/checks/database.health-check.ts`
3. `packages/db/src/client.ts:136-139` → `Pick<PrismaDatabase, 'tenant' | 'user' | 'tenantMembership'>`
4. `auth-model-narrowing.pin.ts` → `ExpectedAppPrismaDatabaseKeys`'ten `'$queryRaw'`
   çıkar (jenerik pin bunu **zorunlu** kılar) + yeni negatif pin
   `pinAppPrismaDatabaseDropsQueryRaw` (`@ts-expect-error`)
5. İsteğe bağlı 3. katman: `packages/config/eslint/base.js`'in mevcut
   `no-restricted-syntax` kümesine `$queryRaw`/`$executeRaw`'ı `packages/db/**`
   DIŞINDA yasaklayan iki seçici (nokta + hesaplanmış) ekle

**Sorumlu ajan:** `db` (1, 3, 4) + `backend` (2) + `devops` (5, isteğe bağlı)

---

**S4-3** — `docs/adr/0008-sir-tasiyan-tablolarin-tipi-ve-linti-ile-korunmasi.md:24, 106, 124-135, 143, 147`
— **T-006 KUSURU** (FIX3 yeniden yazımı)

**ADR, kendi en önemli dersini kendi metninde ihlal ediyor.** Dört ölçülmüş
çelişki (`grep` ile doğrulandı):

| Satır          | Metin                                                                                   | Çelişki                                                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `:24`          | "Derleme zamanı (birincil): TypeScript **`Omit<>`** ile … daraltılır"                   | `:34` ve `:55` `Pick<>` diyor. Bir okur "Bağlam" bölümünü normatif sanabilir.                                                                                      |
| `:143`         | "Darlama aynı desenle uygulanır veya **yeni model bazlı `Omit` eklenir**"               | `:55`'in **BAĞLAYICI** kuralını ("`Omit` tabanlı deny-list'e artık dönülmeyecek") ve `client.ts:108-110`'u doğrudan ihlal ediyor                                   |
| `:147`         | "jenerik bir **`Omit<Client, ModelNames>`** fabrikatörü yazılabilir"                    | Aynı ihlal. **"Gözden Geçirme Koşulları"**, bir sonraki ajanın bu ADR'yi genişletmek için okuduğu bölümdür — ona beş kez atlatılan mekanizmaya dönmesi söyleniyor. |
| `:106`, `:135` | "**v0.0.14'te jenerik pin** yazılacak" / "**v0.0.14'te** jenerik anahtar-eşitliği pini" | Pin **FIX3'te TESLİM EDİLDİ** ve **çalışıyor** (§2, 4/4 ölçüm). ADR teslim edilmiş bir kontrolü gelecek sürüme erteliyor.                                          |

Ayrıca `:124` başlığı **"Açık olan kaçış yolları (v0.0.5 sonunda)"** ama tablo
**5 KAPALI** + 1 latent satır listeliyor; derleme zamanında **fiilen AÇIK olan tek
yol** (`$queryRaw`, S4-1) tabloda **YOK** (yalnızca `:118` düz metninde geçiyor).

Saldırı senaryosu dolaylı ama gerçek — ve ADR'nin **kendisi** `:104`'te tam bunu
tarif ediyor: _"Belgelenmiş ama gerçekleşmeyen bir kontrol, var olmayan ama
belgelenmemiş bir kontrolden daha tehlikelidir."_ v0.0.6'da Better Auth'a bir
API-anahtarı modeli gelen geliştirici `:143`'ü okur, `Omit<>` ekler, altıncı kez
fail-open bir deny-list kurar.

**Önerilen düzeltme:** `:24` → `Pick<>`; `:143`/`:147` → "**allowlist'e
(`Pick<>`) açık karar + kod incelemesiyle üye eklenir; `Omit<>` YASAK**";
`:106`/`:135` → jenerik pin'in **v0.0.5'te teslim edildiğini** ve dosya/satırını
(`auth-model-narrowing.pin.ts:253-303`) yaz; `:124` tablosuna **`$queryRaw`
satırı** ekle (`Durum: AÇIK — allowlist üyesi, bkz. S4-1`) ve başlığı
"Kaçış kapısı tarihçesi ve güncel durum" yap.

**Sorumlu ajan:** `architect` (karar metni) + `docs` (tutarlılık)

---

### [SEV: low]

**S4-2** — `apps/api/src/prisma/prisma.service.ts:74` (`private readonly client`)
— **ÖNCEDEN VAR OLAN BORÇ** (alan T-006'dan önce vardı; T-006 onu sır taşıyan
bir yüzeye çevirdi)

TypeScript `private`, çalışma zamanında **yoktur**. Ölçüldü (tsc 0, eslint 0):

```ts
const revealed = p as unknown as { readonly client: Parameters<typeof withTenant>[0] }
await revealed.client.account.findMany({ where: { password: { not: null } } })
```

Gerçek Nest DI grafiğinde çalıştırıldı → **`D1_OKUNAN_ACCOUNT_SATIRI= 2894`**.
`PrismaService` global olarak dışa açık olduğu için bu yol S4-1 ile **aynı
erişilebilirliğe** sahip.

`low` gerekçesi: `as unknown as` **CLAUDE.md §2'de açıkça yasak** ve diff'te
grep'lenebilir; S4-1 ise hiçbir kuralı ihlal etmeyen deyimsel koddur. Yine de
yasak **yalnızca gelenek** — mekanik kontrol yok.

**Önerilen düzeltme:** `private readonly client` → **`readonly #client`**
(ECMAScript private). Alan çalışma zamanında erişilemez olur, `as` ona
ulaşamaz. (`@Inject` dekoratörü yapıcı parametresinde kalır, alan gövdede
atanır.) İsteğe bağlı: `no-restricted-syntax` ile `TSAsExpression` içinde
`unknown`'a zincirli ikinci assertion'ı yasakla.
**Sorumlu ajan:** `backend` (+ `devops`, lint kuralı)

---

**S4-4** — `docs/development.md` "Log Olayları" tablosu (`giriş başarılı` satırı)
— **T-006 KUSURU** (FIX3 tabloyu ekledi)

Tablo `giriş başarılı` için **`tenantId ✓`** diyor; **bir satır altındaki kendi
notu** "`tenantId` kimlik doğrulama uçlarında (`/auth/*`) **hiçbir zaman var
olmaz**" diyor. İkisi birlikte doğru olamaz. Kod notu doğruluyor:
`auth-instance.ts:406` yalnızca `{ userId, sessionId }` bağlıyor ve
`/auth/sign-in/email` `AUTH_EXEMPT_PATHS`'te olduğu için
`AuthContextMiddleware` `tenantId` yazmıyor.

Zarar operasyoneldir: olay müdahalesinde `tenantId` ile giriş olayı arayan
operatör **hiçbir şey bulamaz** ve runbook'a güvenerek "giriş olmamış" sonucuna
varabilir.

**Önerilen düzeltme:** `giriş başarılı` satırının `tenantId` hücresini `—` yap;
açıklamaya "oturum açılırken kiracı henüz çözülmemiştir — `tenantId` bu isteğin
`istek tamamlandı` özetinde de YOKTUR" ekle. **Sorumlu ajan:** `docs`

---

**S4-5** — `apps/api/src/prisma/prisma.service.ts:33-34, 52-53` (dosya başı yorumu)
— **T-006 KUSURU** (FIX3 `client.ts`'i değiştirdi, tüketicisinin yorumunu değiştirmedi)

Yorum hâlâ bayat mekanizmayı anlatıyor: _"`account`/`session`/`verification`
delegeleri **`Omit<>`** ile DÜŞÜRÜLMÜŞ"_ (`:33-34`) ve _"`Omit<TransactionClient,
AuthModelName | '$transaction'>`"_ (`:52-53`). Gerçek: `Pick<>` allowlist.
S4-3 ile **aynı risk sınıfı**, ama kodda — `PrismaService`'i değiştirecek ajanın
okuduğu ilk 60 satır bu.

**Önerilen düzeltme:** iki pasajı `Pick<…, 'tenant' | 'user' | 'tenantMembership'>`
(S4-1 düzeltmesinden SONRA, `$queryRaw` olmadan) ve
`Pick<TransactionClient, 'tenantMembership'>` olarak güncelle; `client.ts:74-135`
tarihçesine çapraz referans ver. **Sorumlu ajan:** `backend`

---

**S4-6** — `packages/db/src/index.ts:29` (`withTenant` dışa açık, lint yasağında
DEĞİL) + `apps/api/src/prisma/prisma.module.ts` (`exports: [PrismaService]`)
— **KAYDA GEÇECEK BORÇ** (K-E5 / PO sapması 1 ile bilinçli, v0.0.14)

**Tur 3'teki `low` KORUNUYOR; göreli ağırlığı ARTMADI.** Ölçüm:
`@Inject(PRISMA_CLIENT) full: Parameters<typeof withTenant>[0]` + `full.account.findMany()`
→ **tsc 0, eslint 0** (tip ve lint katmanları bu yolu görmüyor), **ama çalışma
zamanı ÇÖZÜLEMEDİ**: `Nest can't resolve dependencies of the WidenService (?) …
Symbol(PRISMA_CLIENT) … available in the WidenModule module`. Bariyer gerçek ve
FIX3'ten etkilenmedi.

Kalan risk: bariyer **tek satırlık** ve **sıfır mekanik sinyalli** —
`PrismaModule`'ün `exports`'una `PRISMA_CLIENT` eklenirse `lint`/`typecheck`/
`test`/`test:isolation` **hepsi yeşil kalır** ve kapı açılır.

**Önerilen düzeltme (v0.0.14):** `PrismaModule.exports`'un **kanonik tam
eşitliğini** pinleyen bir test (T-004'ün `count === 3` dersi, §2'nin jenerik pin
deseni) — `exports` dizisi `[PrismaService]`'ten farklıysa kırmızı.
`withTenant`'ın imzasına **dokunulmaz** (K-E5). **Sorumlu ajan:** `architect`
(v0.0.14 borç kaydı) + `db`

---

**S4-7** — `packages/db/src/__tests__/type-pins/auth-model-narrowing.pin.ts:46-49`
— **T-006 KUSURU** (FIX3 yazımı)

KATMAN 3 başlık yorumu: _"Prisma ileride YENİ bir `$`-metot eklerse (adını
BİLMEDEN) bile bu pin yakalar."_ **Yakalamaz** — yeni bir Prisma üyesi
`keyof AppPrismaDatabase`'e hiç girmediği için `AppPrismaDatabaseExtraKeys`
`never` kalır. Bunu `Pick<>`'in kendisi halleder. Pin'in gerçek değeri
`:249-251`'de DOĞRU yazılı ("asıl işi, SESSİZCE `Pick<>` listesine eklenen bir
üyeyi yakalamak") ve bu değer **ölçüldü** (§2, SINAMA 2/4).

Yanlış yetenek iddiası, mekanizmanın **kanıt dosyasında** duruyor — gelecekte
"Prisma yükseltmesi pin ile kapsanıyor" varsayımına yol açar.

**Önerilen düzeltme:** `:46-49`'u `:249-251` ile hizala: yeni Prisma üyesini
**`Pick<>`'in kendisi** kapatır; jenerik pin **allowlist'in yetkisiz
genişlemesini** kapatır. **Sorumlu ajan:** `db`

---

**S4-8** — `apps/api/src/auth/auth-instance.ts:219` — **ÖNCEDEN VAR OLAN BORÇ**
(tur 3 S3-4, DEĞİŞMEDİ)

`providerErrorCode: typeof record['code'] === 'string' ? record['code'] : undefined`
— uzunluk sınırı ve allowlist YOK. Düşmanca/hatalı yapılandırılmış bir SMTP
sağlayıcısı `.code` alanına serbest metin (PII dahil) koyarsa log'a ham geçer.
Kapsam dar: `.code` nodemailer'da enum benzeri (`'EENVELOPE'`), ama sözleşme
garanti değil.

**Önerilen düzeltme:** Zod ile `z.string().regex(/^[A-Z_]{1,32}$/)` (veya bilinen
kodların allowlist'i), eşleşmezse `'UNKNOWN'`. **Sorumlu ajan:** `backend`

---

**S4-9** — `pnpm audit` → `multer` GHSA-q7qp-rjg7-q26m — **ÖNCEDEN VAR OLAN BORÇ**
(tur 3 S3-11, DEĞİŞMEDİ)

1 `high` (DoS), geçişli: `@nestjs/platform-express > multer` (4 yol).
Savunmasız `>=2.0.0 <2.5.0`, yamalı `>=2.5.0`. v0.0.5'te dosya yükleme ucu
**YOK**, `multer` doğrudan kullanılmıyor → istismar yüzeyi bugün yok.

**Önerilen düzeltme:** `pnpm.overrides` ile `multer@>=2.5.0` sabitle veya
`@nestjs/platform-express` yükselt; v0.0.19 (dosya yükleme) ÖNCESİ zorunlu.
**Sorumlu ajan:** `devops`

---

## ÖLÇÜMLER

| Ölçüm                                                | Sonuç                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm lint`                                          | **15/15 başarılı** (FULL TURBO cache — prob dosyaları byte-birebir geri alındığı için cache isabeti meşru; ayrıca `npx eslint` ile dosya bazlı doğrudan koşuldu)                                                                                                                                                                                                                                                                                                                                                         |
| `pnpm typecheck`                                     | **15/15 başarılı**; ayrıca `npx tsc -p apps/api/tsconfig.json` ve `-p packages/db/tsconfig.json` **cache'siz, 0 hata**                                                                                                                                                                                                                                                                                                                                                                                                   |
| `pnpm test`                                          | **exit 0**, api **310/310** (35 dosya) — **flush YAPILMADAN ikinci koşu da 310/310** (S3-9 hermetiklik kapandı)                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm test:isolation`                                | **15/15** (`db` 14 + `api` 1), 6 task başarılı                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm format:check`                                  | **temiz** ("All matched files use Prettier code style!")                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **`pnpm audit`**                                     | **kritik 0 · high 1 · orta 0 · düşük 0** — tek bulgu `multer` GHSA-q7qp-rjg7-q26m (geçişli, S4-9)                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Hedefli test yeniden koşusu                          | `auth-secret-leak-smtp-failure-modes.qa` + `auth-secret-leak` + `auth-delegated-origin-check.qa` + `same-origin-guard-fail-closed.qa` → **4 dosya / 8 test yeşil**                                                                                                                                                                                                                                                                                                                                                       |
| İncelenen dosya                                      | **24 dosya okundu** (client.ts · pin dosyası · index.ts · tenant-context.ts · health.ts · prisma.service.ts · prisma.module.ts · prisma.tokens.ts · auth.module.ts · auth-instance.ts (bölüm) · same-origin.guard.ts (bölüm) · auth.controller.ts (bölüm) · rate-limit.guard/service.ts (bölüm) · describe-error-cause.ts · eslint.config.mjs · base.js (bölüm) · ADR-0008 · development.md (bölüm) · AGENT_BASELINE.md · tur3 raporu (bulgu indeksi) · 4 test dosyası) + **95 değişmiş dosya** `git status` ile tarandı |
| Yazılan/silinen prob                                 | **5 dosya** (`gate-a.ts` · `gate-b.ts` · `gate-c.test.ts` · `gate-d.ts` · `gate-e.test.ts` · `gate-f.ts`) + 1 scratchpad `.mjs`. **HEPSİ SİLİNDİ** — `apps/api/src/secprobe/` yok, `git status --porcelain \| wc -l` → **95** (başlangıçla aynı), `shasum packages/db/src/client.ts` → `45e93025…` (yedekle birebir)                                                                                                                                                                                                     |
| **Tenant izolasyon listesinden karşılanmayan madde** | **2 · 5 · 8 · 13.** **2 · 8 · 13** bilinçli + belgelenmiş sapma (tur 2/3 ile aynı). **Madde 5** hâlâ karşılanmıyor **ama artık BELGELENMİŞ** (ADR-0008:118, `$queryRaw`) — tur 3'teki "YENİ ve belgelenmemiş" durumu **düzeldi**; kalan kusur allowlist'in **kapsamı** (S4-1)                                                                                                                                                                                                                                            |
| Ölçülen ham veri                                     | 2830 / 2759 / 2894 parola hash'i (üç bağımsız yol), 2863 oturum belirteci; `relrowsecurity`: `account`/`session`/`verification`/`tenant`/`app_user` = `f`, `tenant_membership` = `t`; `tenant_membership` context'siz okuma = **0 satır** (RLS sağlam)                                                                                                                                                                                                                                                                   |
| Tur 3 `high`'ının durumu                             | **KAPANDI**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Kaçış kapısı sayacı                                  | **1–5 KAPALI** (ölçüldü) · **6 (`$queryRaw`) AÇIK, belgelenmiş** → S4-1 · **7 (`as unknown as` + TS-private) AÇIK, gelenekle yasak** → S4-2 · **latent (`Parameters<>`) tip+lint açık, DI kapalı** → S4-6                                                                                                                                                                                                                                                                                                                |

---

## Bulgu özeti

| #    | SEV    | Sınıf                 | Yer                                                 |
| ---- | ------ | --------------------- | --------------------------------------------------- |
| S4-1 | medium | KAYDA GEÇECEK BORÇ    | `packages/db/src/client.ts:136-139`                 |
| S4-3 | medium | T-006 KUSURU          | `docs/adr/0008-…md:24,106,124-135,143,147`          |
| S4-2 | low    | ÖNCEDEN VAR OLAN BORÇ | `apps/api/src/prisma/prisma.service.ts:74`          |
| S4-4 | low    | T-006 KUSURU          | `docs/development.md` Log Olayları                  |
| S4-5 | low    | T-006 KUSURU          | `apps/api/src/prisma/prisma.service.ts:33-34,52-53` |
| S4-6 | low    | KAYDA GEÇECEK BORÇ    | `packages/db/src/index.ts:29` + `prisma.module.ts`  |
| S4-7 | low    | T-006 KUSURU          | `auth-model-narrowing.pin.ts:46-49`                 |
| S4-8 | low    | ÖNCEDEN VAR OLAN BORÇ | `auth-instance.ts:219`                              |
| S4-9 | low    | ÖNCEDEN VAR OLAN BORÇ | `pnpm audit` / `multer`                             |

**0 critical · 0 high · 2 medium · 7 low → `AGENT_BASELINE.md` §4: PASS**
