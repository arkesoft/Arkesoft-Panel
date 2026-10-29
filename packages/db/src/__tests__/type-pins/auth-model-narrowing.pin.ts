// @arkesoft/db — tip pin'leri: `AppPrismaDatabase`/`TenantTransactionClient`'ın
// `Pick<>` ALLOWLIST'inin NEYİ İZİN VERDİĞİNİ ve NEYİ YASAKLADIĞINI ölçer
// (ROADMAP v0.0.5, T-006/S2, architect A-G3, "MADDE 2 — R-1 KARARI",
// FIX turu 3 — `Omit<>` deny-list'ten `Pick<>` allowlist'e geçiş; "son
// temizlik" — `security` tur4 S4-1, ALTINCI KAPI (`$queryRaw`) kapatıldı)
//
// Bu dosya ÇALIŞMA ZAMANI testi DEĞİLDİR — `.test.ts` ile BİTMİYOR,
// `vitest.config.ts`'in `include: ['src/**/*.test.ts']` deseni bu dosyayı
// YAKALAMAZ (bilerek: `client-options.pin.ts` deseniyle AYNI — pin'in TEK
// kanıtı derleme zamanıdır). Kanıt tamamen `pnpm typecheck`'in derlemesinden
// gelir — bu dosyadaki herhangi bir satır DERLENMEZSE (pozitif pin) veya
// `@ts-expect-error` GERÇEKTEN tetiklenMEZSE (negatif pin) veya jenerik pin'in
// tuple'a düşen tipi `true`'ya atanamazsa (jenerik pin) A-G3 ihlal edilmiş
// olur. Her pin fonksiyonu erişilen üyeleri DOĞRUDAN bir nesne literalinde
// DÖNDÜRÜR — ara yerel değişken YOK (ne `void` operatörü — `@typescript-eslint/
// no-meaningless-void-operator` bunu çağrı olmayan üyelerde yasaklar — ne de
// "kullanılmayan değişken" `tsc`/eslint çifte uyarısı doğar).
//
// TARİHÇE (beş kaçış kapısı, hepsi AYNI mekanizma hatası — `client.ts`'in
// `AppPrismaDatabase`/`TenantTransactionClient` doc'unda TAM TARİHÇE):
//   S2 (bu dosyanın ilk sürümü)  — `Omit<PrismaDatabase, AuthModelName>`,
//                                  SADECE `account`/`session`/`verification`
//                                  düşürülüyordu.
//   FIX turu 2 (security tur2)  — `$transaction` İKİ YERDE (üst seviye VE
//                                  `TenantTransactionClient`'ın kendi
//                                  `$transaction`'ı, iç içe çağrımda) deny-
//                                  list'e EKLENDİ.
//   FIX turu 3 (security tur3) — `$extends`: `p.db.$extends({}).account.
//                                  findMany()` tsc 0/eslint 0 ile derleniyordu
//                                  VE ÇALIŞMA ZAMANINDA 1844 parola hash'i
//                                  okundu (ölçüldü, prob SİLİNDİ). Deny-list
//                                  mekanizması YAPISAL olarak fail-open —
//                                  çözüm artık bir ALTINCI jeton eklemek
//                                  DEĞİL, `Omit<>`'ten `Pick<>`'E geçmek:
//                                  `client.ts`'teki tip o turda YALNIZCA
//                                  AÇIKÇA listelenen dört üyeyi (`tenant`,
//                                  `user`, `tenantMembership`, `$queryRaw`)
//                                  İÇERİYORDU — `$extends` dahil KALAN HER
//                                  ŞEY listelenmeden OTOMATİK dışarıdaydı.
//   "Son temizlik" (security     — ALTINCI KAPI: `$queryRaw`'ın KENDİSİ
//   tur4 S4-1, BU SÜRÜM)           allowlist'TE KALMASI, yetkiyi "1 çağrı
//                                  yolu" (`health.ts`) değil, `.db`
//                                  getter'ını gören HER `apps/api` servisine
//                                  veriyordu. Ölçüldü (prob, SİLİNDİ):
//                                  `db.$queryRaw` ile `account`/`session`
//                                  tablolarından parola hash'i okuyan bir
//                                  çağrı tsc 0/eslint 0 ile derlenip çalışma
//                                  zamanında 2830 satır okudu. `$queryRaw`
//                                  allowlist'ten ÇIKARILDI — `AppPrismaDatabase`
//                                  artık YALNIZCA üç üye (`tenant`/`user`/
//                                  `tenantMembership`) içerir; tek meşru
//                                  tüketici (`health.ts`) kendi dar, tek
//                                  üyeli tipini (`Pick<PrismaDatabase,
//                                  '$queryRaw'>`)
//                                  `PrismaService.connectionProbe`'tan alır.
//
// Bu dosyadaki pin'ler ÜÇ KATMANDIR (Task handoff'unun "Pinler" bölümü,
// bağlayıcı):
//   1. POZİTİF  — allowlist'in üç üyesinin (`AppPrismaDatabase`: `tenant`/
//                 `user`/`tenantMembership`) HEPSİ erişilebilir.
//   2. NEGATİF  — `account`/`session`/`verification`/`$transaction`/
//                 `$extends`/`$disconnect`/`$queryRaw` ERİŞİLEMEZ
//                 (`@ts-expect-error` ×12, her biri GERÇEK `TS2339`/
//                 `TS2578` üretir) — isim bazlı, YALNIZCA bilinen kaçış
//                 kapılarını/dışarıda bırakılan üyeleri kapsar.
//   3. JENERİK  — `AppPrismaDatabase`'in (ve `TenantTransactionClient`'ın)
//                 anahtar kümesi beklenenle TAM denk (`Exclude<>` İKİ YÖNLÜ
//                 `never`). İSİM BAZLI DEĞİL — ama bunun anlamı "Prisma'nın
//                 YENİ bir `$`-metot eklemesini bu pin yakalar" DEĞİLDİR:
//                 `Pick<>`'in KENDİSİ (allowlist doğası) yeni bir Prisma
//                 üyesini zaten otomatik dışarıda tutar, bu pin ona HİÇ
//                 GEREK KALMADAN yeşil kalır. Bu pin'in GERÇEK işi,
//                 `client.ts`'teki `Pick<>` literaline SESSİZCE eklenen bir
//                 üyeyi (allowlist'in YETKİSİZ GENİŞLEMESİ) yakalamaktır —
//                 ayrıntı KATMAN 3'ün kendi doc'unda. `security` tur3'ün
//                 açık uyarısı: "jenerik pin atlanırsa altıncı kapı için
//                 bir tur daha gerekir" — bu EN ÖNEMLİ pin'dir, atlanamaz.
//
// `__tests__/` altında olduğu için S5'in AC4 mekanik GUC jeton taraması
// (kapsam: `**/src/**/*.ts` eksi `__tests__/**`) bu dosyayı TARAMAZ — burada
// literal GUC adı da yoktur, konu dışı.

import type { AppPrismaDatabase, TenantTransactionClient } from '../../client.js'

// ---------------------------------------------------------------------------
// KATMAN 1 — POZİTİF PİN'LER
// ---------------------------------------------------------------------------

/**
 * POZİTİF PİN 1 (A-G3, FIX turu 3; güncellendi "son temizlik"te) —
 * `AppPrismaDatabase` üzerinde `Pick<>`'in AÇIKÇA listelediği üç üyenin
 * HEPSİ erişilebilir olmalıdır: `tenant`, `user`, `tenantMembership`.
 * `tenant`/`user` üretim kod yolunda ÖLÇÜLEN gerçek çağrı sayısıyla
 * gerekçeli (`client.ts` doc'u, grep > 0); `tenantMembership` `.db` üzerinden
 * ÜRETİMDE SIFIR çağrıyla, ama bir izolasyon TESTİNİN
 * (`prisma-with-tenant.test.ts` Vaka 2) TEK tüketicisi olarak BİLİNÇLİ
 * TUTULUYOR — gerekçe `client.ts` doc'unda (`solid` tur4 L4-3). `$queryRaw`
 * BİLEREK BURADA YOK ("son temizlik", `security` tur4 S4-1 — ALTINCI KAPI
 * kapatıldı): tek meşru tüketicisi artık `PrismaService.connectionProbe`'un
 * AYRI, tek üyeli tipi. Bu fonksiyon hiçbir yerden çağrılmaz — varlığı
 * DERLENMESİ yeterlidir.
 *
 * `$disconnect` BİLEREK BURADA YOK (önceki `Omit<>` sürümünde pozitif pindeydi)
 * — `Pick<>`'e taşınmadı (`client.ts` doc'u: `apps/api`'de `.db.$disconnect()`
 * SIFIR çağrı, hep `#client` üzerinden). Aşağıdaki
 * `pinAppPrismaDatabaseDropsDisconnect` NEGATİF pini bunu kanıtlar.
 */
export function pinAppPrismaDatabaseRetainsAllowlistedMembers(db: AppPrismaDatabase): {
  tenant: AppPrismaDatabase['tenant']
  user: AppPrismaDatabase['user']
  tenantMembership: AppPrismaDatabase['tenantMembership']
} {
  return {
    tenant: db.tenant,
    user: db.user,
    tenantMembership: db.tenantMembership,
  }
}

/**
 * POZİTİF PİN 2 (A-G3, FIX turu 3, `TenantTransactionClient` için) —
 * `withTenant()`'ın KENDİ imzası bu tipi kullanMAZ (PO sapması 1), ama tip
 * dışa açıldığı için KENDİ doğruluğu ayrı ölçülür: `tenantMembership`
 * (`Pick<>`'in TEK üyesi, `client.ts` doc'unun `apps/api` grep ölçümü:
 * `tx.tenantMembership` DIŞINDA `tx.*` erişimi SIFIR) erişilebilir kalmalıdır.
 */
export function pinTenantTransactionClientRetainsAllowlistedMember(tx: TenantTransactionClient): {
  tenantMembership: TenantTransactionClient['tenantMembership']
} {
  return { tenantMembership: tx.tenantMembership }
}

// ---------------------------------------------------------------------------
// KATMAN 2 — NEGATİF PİN'LER (isim bazlı; bilinen kaçış kapıları VE
// bilinçli olarak dışarıda bırakılan üyeler)
// ---------------------------------------------------------------------------

/**
 * NEGATİF PİN (A-G3, R-1'in asıl iddiası) — `account`/`session`/`verification`
 * delegeleri `AppPrismaDatabase` üzerinde ERİŞİLEMEZ OLMALIDIR. Her satırdaki
 * `@ts-expect-error` GERÇEKTEN bir tip hatası bulmazsa (ör. `Pick<>` listesine
 * bir gün bu üyelerden biri yanlışlıkla eklenirse) `pnpm typecheck`
 * KIRMIZIYA döner — "kullanılmayan `@ts-expect-error` yönergesi" hatası
 * (`tsconfig`'in `strict` modunda bu yönerge GERÇEK bir hata BEKLER). Bu,
 * PM riski 1'in tarif ettiği tam senaryonun (`tx.account.findMany()` ile tüm
 * hash'lerin dökülmesi) artık DERLENMEDİĞİNİN mekanik kanıtıdır. Dönüş tipi
 * KASITLI OLARAK `unknown` alanlar taşır — asıl iddia `@ts-expect-error`
 * satırının KENDİSİDİR, dönüş değeri hiçbir yerde tüketilmez.
 */
export function pinAppPrismaDatabaseDropsSecretDelegates(db: AppPrismaDatabase): {
  account: unknown
  session: unknown
  verification: unknown
} {
  return {
    // @ts-expect-error — "account" Pick<> allowlist'inde YOK, AppPrismaDatabase'de erişilemez.
    account: db.account,
    // @ts-expect-error — "session" Pick<> allowlist'inde YOK, AppPrismaDatabase'de erişilemez.
    session: db.session,
    // @ts-expect-error — "verification" Pick<> allowlist'inde YOK, AppPrismaDatabase'de erişilemez.
    verification: db.verification,
  }
}

/**
 * NEGATİF PİN (FIX turu 2'nin ÖLÇTÜĞÜ üçüncü/dördüncü kaçış kapısı, `Pick<>`
 * altında da GEÇERLİ kalmalı) — `$transaction` `AppPrismaDatabase` üzerinde
 * ERİŞİLEMEZ OLMALIDIR. `Pick<>` listesinde `'$transaction'` YOK — bu satır
 * derlenirse (hata ÜRETMEZSE) `Pick<>` listesine bir gün bu üye eklendiği
 * anlamına gelir.
 */
export function pinAppPrismaDatabaseDropsTransaction(db: AppPrismaDatabase): unknown {
  // @ts-expect-error — "$transaction" Pick<> allowlist'inde YOK, AppPrismaDatabase'de erişilemez.
  return db.$transaction
}

/**
 * NEGATİF PİN (FIX turu 3, BEŞİNCİ kaçış kapısı, `security` tur3 + `qa` tur3
 * bağımsız ölçüm) — `$extends` `AppPrismaDatabase` üzerinde ERİŞİLEMEZ
 * OLMALIDIR. Önceki `Omit<>` sürümünde bu üye HİÇ listelenmemişti — tam bu
 * yüzden `p.db.$extends({}).account.findMany()` `tsc 0, eslint 0` ile
 * derleniyordu ve ÇALIŞMA ZAMANINDA 1844 parola hash'i okundu (geçici prob,
 * ÖLÇÜLDÜ, SİLİNDİ). `Pick<>` allowlist'inde `'$extends'` YOK — bu satır
 * derlenirse (hata ÜRETMEZSE) beşinci kaçış kapısı YENİDEN açılmış demektir.
 */
export function pinAppPrismaDatabaseDropsExtends(db: AppPrismaDatabase): unknown {
  // @ts-expect-error — "$extends" Pick<> allowlist'inde YOK, AppPrismaDatabase'de erişilemez (BEŞİNCİ kaçış kapısı, FIX turu 3).
  return db.$extends
}

/**
 * NEGATİF PİN (FIX turu 3) — `$disconnect` `AppPrismaDatabase` üzerinde
 * ERİŞİLEMEZ OLMALIDIR. Önceki `Omit<>` sürümünde pozitif pindeydi (korunduğu
 * kanıtlanıyordu); `Pick<>`'e geçişte ÖLÇÜLEREK (bkz. `client.ts` doc'u)
 * `apps/api`'de `.db.$disconnect()` çağrısının SIFIR olduğu görüldü, bu yüzden
 * allowlist'e TAŞINMADI. Bu pin o kararın mekanik kanıtıdır.
 */
export function pinAppPrismaDatabaseDropsDisconnect(db: AppPrismaDatabase): unknown {
  // @ts-expect-error — "$disconnect" Pick<> allowlist'inde YOK (kullanılmıyor, bkz. client.ts doc'u), AppPrismaDatabase'de erişilemez.
  return db.$disconnect
}

/**
 * NEGATİF PİN ("son temizlik", ROADMAP v0.0.5, T-006, `security` tur4 S4-1
 * — ALTINCI KAPI) — `$queryRaw` `AppPrismaDatabase` üzerinde ERİŞİLEMEZ
 * OLMALIDIR. Önceki sürümde bu üye allowlist'TEYDİ ("1 çağrı yolu:
 * `health.ts`" gerekçesiyle) — `security` tur4'ün ölçtüğü asıl hata: bu
 * ölçüt GERÇEKLEŞEN çağrıyı ölçer, ERİŞEBİLEN çağıranı (`.db` getter'ını
 * gören HER servis) ÖLÇMEZ. `db.$queryRaw` ile `account`/`session`
 * tablolarından ham SQL okuyan bir çağrı `tsc 0`/`eslint 0` ile derlenip
 * çalışma zamanında 2830 parola hash'i okudu (ÖLÇÜLDÜ, prob SİLİNDİ). Bu
 * satır derlenirse (hata ÜRETMEZSE) altıncı kapı YENİDEN açılmış demektir.
 * Tek meşru tüketici (`health.ts`) artık KENDİ dar tipini
 * (`Pick<PrismaDatabase, '$queryRaw'>`, `PrismaService.connectionProbe`
 * üzerinden) kullanır, bu tipten DEĞİL.
 */
export function pinAppPrismaDatabaseDropsQueryRaw(db: AppPrismaDatabase): unknown {
  // @ts-expect-error — "$queryRaw" Pick<> allowlist'inde YOK, AppPrismaDatabase'de erişilemez (ALTINCI KAPI, "son temizlik").
  return db.$queryRaw
}

/**
 * NEGATİF PİN (A-G3, `TenantTransactionClient` için) — `account`/`session`/
 * `verification` delegeleri burada da ERİŞİLEMEZ OLMALIDIR.
 */
export function pinTenantTransactionClientDropsSecretDelegates(tx: TenantTransactionClient): {
  account: unknown
  session: unknown
  verification: unknown
} {
  return {
    // @ts-expect-error — "account" Pick<> allowlist'inde YOK, TenantTransactionClient'ta erişilemez.
    account: tx.account,
    // @ts-expect-error — "session" Pick<> allowlist'inde YOK, TenantTransactionClient'ta erişilemez.
    session: tx.session,
    // @ts-expect-error — "verification" Pick<> allowlist'inde YOK, TenantTransactionClient'ta erişilemez.
    verification: tx.verification,
  }
}

/**
 * NEGATİF PİN (FIX turu 2'nin ÖLÇTÜĞÜ dördüncü kaçış kapısı — iç içe
 * `$transaction`, `Pick<>` altında da GEÇERLİ kalmalı) — `$transaction`
 * `TenantTransactionClient` üzerinde de ERİŞİLEMEZ OLMALIDIR. `Pick<>`
 * listesinde (`'tenantMembership'` TEK üye) `'$transaction'` YOK.
 */
export function pinTenantTransactionClientDropsTransaction(tx: TenantTransactionClient): unknown {
  // @ts-expect-error — "$transaction" Pick<> allowlist'inde YOK, TenantTransactionClient'ta erişilemez.
  return tx.$transaction
}

/**
 * NEGATİF PİN (FIX turu 3, tamlık için — `Prisma.TransactionClient`'ın
 * KENDİSİ zaten Prisma'nın `ITXClientDenyList`'i yüzünden `$extends`
 * TAŞIMAZ, ama `Pick<>` allowlist'i de AYRICA bunu dışarıda bırakır; bu pin
 * HER İKİ katmanın da aynı sonuca vardığını kanıtlar).
 */
export function pinTenantTransactionClientDropsExtends(tx: TenantTransactionClient): unknown {
  // @ts-expect-error — "$extends" Pick<> allowlist'inde YOK (ve Prisma'nın ITXClientDenyList'inde zaten yok), TenantTransactionClient'ta erişilemez.
  return tx.$extends
}

// ---------------------------------------------------------------------------
// KATMAN 3 — JENERİK PİN (isim bazlı değil, kapalı dünya — EN ÖNEMLİSİ)
// ---------------------------------------------------------------------------

/**
 * Beklenen `AppPrismaDatabase` anahtar kümesi — `client.ts`'in `Pick<>`
 * literaliyle BİREBİR aynı üç üye ("son temizlik"te `$queryRaw` ÇIKARILDI,
 * `security` tur4 S4-1). Bu birleşim tipi DEĞİŞTİĞİNDE (`client.ts`'teki
 * `Pick<>` listesi değiştiğinde) bu dosya da GÜNCELLENMEK ZORUNDADIR — bu,
 * allowlist'e yeni üye eklemenin "kod incelemesi gerektiren açık bir karar"
 * olmasının mekanik zorlayıcısıdır.
 */
type ExpectedAppPrismaDatabaseKeys = 'tenant' | 'user' | 'tenantMembership'

/** `AppPrismaDatabase`'de olup beklenen kümede OLMAYAN anahtarlar (fazlalık). */
type AppPrismaDatabaseExtraKeys = Exclude<keyof AppPrismaDatabase, ExpectedAppPrismaDatabaseKeys>

/** Beklenen kümede olup `AppPrismaDatabase`'de OLMAYAN anahtarlar (eksiklik). */
type AppPrismaDatabaseMissingKeys = Exclude<ExpectedAppPrismaDatabaseKeys, keyof AppPrismaDatabase>

/**
 * ⚠ JENERİK PİN — EN ÖNEMLİSİ (FIX turu 3, Task handoff'unun açık uyarısı:
 * "jenerik `$`-metot pini atlanırsa dördüncü/altıncı kapı için bir tur daha
 * gerekir"). Yukarıdaki pozitif/negatif pin'lerin TÜMÜ İSİM
 * BAZLIDIR — `account`, `session`, `$transaction`, `$extends` gibi BİLİNEN
 * adları test eder. Prisma bir yükseltmede YENİ bir `$`-metot eklerse (adını
 * BİLMEDEN, ör. hipotetik bir `$accelerate`/`$metrics`) VEYA biri `client.ts`
 * `Pick<>` literaline SESSİZCE bir üye eklerse, isim bazlı negatif pin'lerin
 * HİÇBİRİ bunu YAKALAYAMAZ — yeni üyenin adı bilinmeden `@ts-expect-error`
 * yazılamaz.
 *
 * Bu pin KAPALI DÜNYA varsayımı yapar: `AppPrismaDatabase`'in anahtar kümesi
 * (`keyof`) beklenen kümeyle (`ExpectedAppPrismaDatabaseKeys`) İKİ YÖNLÜ
 * `Exclude<>` ile karşılaştırılır. Sonuç HER İKİ yönde de `never` değilse
 * (fazla VEYA eksik anahtar varsa) aşağıdaki `satisfies`/atama bir TUPLE
 * tipine çözülür ve `true` literaline UYMAZ — `pnpm typecheck` TS2322 ile
 * KIRMIZIYA döner. `Pick<>`'in KENDİSİ zaten yeni bir Prisma `$`-metodunu
 * otomatik dışarıda tutar (allowlist doğası) — bu pin'in asıl işi, SESSİZCE
 * `Pick<>` listesine eklenen bir üyeyi (yetkisiz genişleme) yakalamaktır.
 */
type AssertNoExtraAppPrismaDatabaseKeys = AppPrismaDatabaseExtraKeys extends never
  ? true
  : ['FAZLA ANAHTAR — Pick<> listesine izinsiz eklenmiş üye', AppPrismaDatabaseExtraKeys]

type AssertNoMissingAppPrismaDatabaseKeys = AppPrismaDatabaseMissingKeys extends never
  ? true
  : [
      'EKSİK ANAHTAR — beklenen allowlist üyesi Pick<> listesinden düştü',
      AppPrismaDatabaseMissingKeys,
    ]

export function pinAppPrismaDatabaseKeysExactlyMatchAllowlist(): {
  noExtraKeys: AssertNoExtraAppPrismaDatabaseKeys
  noMissingKeys: AssertNoMissingAppPrismaDatabaseKeys
} {
  return { noExtraKeys: true, noMissingKeys: true }
}

/** Beklenen `TenantTransactionClient` anahtar kümesi — `client.ts`'in `Pick<>` literaliyle BİREBİR aynı TEK üye. */
type ExpectedTenantTransactionClientKeys = 'tenantMembership'

type TenantTransactionClientExtraKeys = Exclude<
  keyof TenantTransactionClient,
  ExpectedTenantTransactionClientKeys
>

type TenantTransactionClientMissingKeys = Exclude<
  ExpectedTenantTransactionClientKeys,
  keyof TenantTransactionClient
>

type AssertNoExtraTenantTransactionClientKeys = TenantTransactionClientExtraKeys extends never
  ? true
  : ['FAZLA ANAHTAR — Pick<> listesine izinsiz eklenmiş üye', TenantTransactionClientExtraKeys]

type AssertNoMissingTenantTransactionClientKeys = TenantTransactionClientMissingKeys extends never
  ? true
  : [
      'EKSİK ANAHTAR — beklenen allowlist üyesi Pick<> listesinden düştü',
      TenantTransactionClientMissingKeys,
    ]

/**
 * ⚠ JENERİK PİN — `TenantTransactionClient` için AYNI kapalı dünya ölçümü.
 */
export function pinTenantTransactionClientKeysExactlyMatchAllowlist(): {
  noExtraKeys: AssertNoExtraTenantTransactionClientKeys
  noMissingKeys: AssertNoMissingTenantTransactionClientKeys
} {
  return { noExtraKeys: true, noMissingKeys: true }
}
