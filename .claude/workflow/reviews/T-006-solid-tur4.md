# T-006 — solid gate, Tur 4 (FIX turu 3 sonrası, dar kapsam)

- **Tarih:** 2026-10-29
- **Sürüm:** ROADMAP v0.0.5 (Kimlik doğrulama — Better Auth)
- **Araç kısıtı:** `Bash` YOK. Hiçbir komut çalıştırılmadı; tüm ölçümler `Read`/`Grep`/`Glob`
  ile statik tespittir. Çalıştırılamayanlar "ölçülemedi (araç yok)" olarak işaretlendi.
  **Hiçbir komut çıktısı uydurulmadı.**
- **Kapsam:** dar — yalnızca FIX turu 3'ün dokunduğu yüzeyler (`packages/db/src/client.ts`,
  tip pini, `docs/adr/0008`, `docs/development.md`, yeni/değişen `*.qa.test.ts`) ve tur 3'ün
  açık bulgularının durumu. Tur 3'te temiz çıkan yüzeyler yeniden ölçülmedi.

```
GATE: solid
SONUÇ: PASS
```

**PASS gerekçesi (AGENT_BASELINE §4, mekanik):** `critical` 0 · `high` 0 · `medium` **2** ·
`low` 11. 1–2 `medium` → PASS, bulgular teknik borca kaydedilir.

**Üretim kodunda `medium` veya üstü bulgu YOK — üçüncü tur üst üste.** İki `medium`'un
ikisi de **yine belge** (ADR-0008 ve `development.md`) — ve ikisi de tur 3'ün M-1/M-2'sinin
**düzeltmesinin kendi içinde** doğdu. Tur 3'ün iki belge medium'unun **asıl iddiaları
KAPANDI**; kapanışın kenarlarında iki yeni sapma açıldı.

---

## 0. Tek paragrafta yargı

`Pick<>` geçişi **mekanizma olarak doğru ve bu Task'ın en iyi tasarım kararı**: beş turda
beş kez atlatılan deny-list'in yerine, altıncı kapıyı **adını bilmeden** kapatan bir
allowlist geldi; jenerik kapalı-dünya pini **gerçekten yazıldı** ve hata mesajı
**okunabilir**. Kodda bu turda `high` yok, `any` yok, yeni katman ihlali yok. Buna karşılık
tur 3'ün kapanış teşhisi ("asıl risk koda inanılmayacak bir belge") **hâlâ geçerli**: FIX 3
mekanizmayı iki tip takma adında ve ADR'nin normatif bloğunda değiştirdi, ama **`Omit<>`
kelimesini bir geliştiricinin bakacağı diğer beş yerde bıraktı** — ikisi üretim kodu yorumu
(`prisma.service.ts`, `health.ts`), üçü ADR'nin kendi metni; ADR'nin **BAĞLAYICI kuralı**
(`:55`) ile **Gözden Geçirme Koşulları** bölümü (`:143`, `:147`) artık **birbirinin tersini**
söylüyor. On üçüncü sapma arandı ve **bulundu** (§5).

---

## 1. Tur 3'ün iki belge medium'u GERÇEKTEN kapandı mı?

### 1.1 M-1 (ADR seçilmeyen alternatifi "yapıldı" diye kaydediyordu) — **ASIL İDDİA KAPANDI (3/4), bir kalem AÇIK, bir YENİ ÇELİŞKİ**

Dört alt maddenin tek tek ölçümü:

1. **Normatif kod bloğu artık `Pick` mi? EVET, birebir.** `docs/adr/0008-…md:41-46` →
   `Pick<PrismaDatabase, 'tenant' | 'user' | 'tenantMembership' | '$queryRaw'>` ve
   `Pick<TransactionClient, 'tenantMembership'>`. Kaynak: `packages/db/src/client.ts:136-139`
   ve `:168`. **Kelime kelime aynı.** ✓ KAPANDI
2. **"Callback parametresi daraltılıyor" ifadesi kalktı mı? EVET — ve doğru yöne çevrildi.**
   `:105` artık "Callback'inin `TenantTransactionClient`'a daraltılması **ölçüldü** (güvenli
   görünür, ama … 'narrow = güvenli' yanılgısına yol açar), ama **bilerek seçilmedi** — yerine
   `$transaction` üyesi allowlist dışında bırakıldı" diyor. `db`'nin reddetme gerekçesi
   (`client.ts` eski `:88-100`) artık ADR'de **reddedilmiş alternatif** olarak duruyor, "yapıldı"
   diye değil. ✓ KAPANDI (satır atfı yanlış → **L4-5**)
3. **"İmkânsız" gitti mi? EVET.** `:103`'ün eski "yanlışlıkla yazmak **imkânsız**" cümlesi
   **silinmiş**; yerine "artık **tip hatasıdır** … **Dolaylı yollar** (`$extends`, `$queryRaw`
   vb.) allowlist dışında bırakılır veya açıkça kabul edilir" geldi — üç turda üç kez
   çürütülen iddia **artık ortada yok**. (Dosyada kalan iki "imkânsız" — `:18` ve `:97` —
   RLS'in kimlik sorgusunda **yazılamaz** olmasıyla ilgili ve **doğru**; onlar hedef değildi.)
   ✓ KAPANDI
4. **Beş kapı tablosu doğru mu? EVET. Latent altıncı kayıtlı mı? EVET.**
   `:126-133` altı satır: tur 1 ×2 (lint jetonu, `AUTH_SESSION_READER`), tur 2 ×2
   (`$transaction` iki tip), tur 3 `$extends` → **"Allowlist dışında"**, tur 3
   `Parameters<typeof withTenant>[0]` → **"Kapalı DEĞİL — K-E5 ile bilinçli (v0.0.14
   borcu)"**. `security` tur3'ün latent altıncı kapısı (S3-6) **adıyla kayıtlı**. ✓
   (Bölüm **başlığı** hâlâ yanlış → **L4-6**)

**BAĞLAYICI kural var mı? EVET** — `:55` "`Omit` tabanlı deny-list'e artık dönülmeyecek;
allowlist'e yeni üye ekleme **açık karar** ve **kod incelemesi** gerektirir." Aynı kural
`client.ts:108-110`'da da yazılı (iki yerde, tutarlı).

**AMA — M-1'in arıza SINIFI aynı belgede YENİDEN doğdu:** ADR'nin üç ayrı yeri hâlâ okura
`Omit<>` kullanmasını söylüyor, biri de **normatif özet**: `:24` (üç katmanlı mekanizmanın

1. katmanı: "TypeScript `Omit<>` ile sır taşıyan modeller daraltılır"), `:143` ("yeni model
   bazlı `Omit` eklenir"), `:147` ("jenerik bir `Omit<Client, ModelNames>` fab rikatörü
   yazılabilir"). → **M4-1**. M-1(4)'ün biçimsel kalıntıları (bozuk sözcükler, `sp_executesql`,
   yanlış lint kümesi/satır atfı) **hiç dokunulmamış** → **L4-8**.

### 1.2 M-2 (runbook'un iki yanlış iddiası) — **İKİSİ DE KAPANDI; yeni tablo iki yanlış getirdi**

- **"503 döner" → gitti.** `docs/development.md:539` artık: "`POST /auth/sign-up/email`
  **2xx** döner — istek başarılı olur ve kullanıcı satırı **veritabanında oluşur**, ama
  e-posta **gönderilmez**. Belirti yalnızca logda: `causeCode: "MAIL_DELIVERY_FAILED"` +
  `providerResponseCode` ve `providerErrorCode`." **Metin ↔ kaynak uyumu ölçüldü:**
  `security` tur3 §2'nin beş arıza modunun **hepsi** HTTP **200** verdi ve loglanan satır
  birebir `causeCode: MAIL_DELIVERY_FAILED` + `providerErrorCode` + `providerResponseCode`
  taşıyor (`auth-instance.ts:199-221` alan üreticileri). ✓ **UYUYOR**
- **"zaten kayıtlı hatası" → gitti.** `:539` son cümle: "Yeniden kayıt denemesi de **2xx**
  döner ve ikinci bir satır **oluşturmaz** (varlık sızdırmazlığı, A3 kararı)." `security`
  tur3'ün ölçümüyle (200 + uydurma `user.id`, DB'de ikinci satır yok) **uyuyor**. ✓
- **Başlık** da "E-posta Gönderilemedi — Kurtarma Yolu" oldu; kurtarma adımı (`:541-547`)
  korundu. ✓
- **YENİ:** aynı turda eklenen "Log Olayları" tablosu (`:564-575`) iki olgusal hata taşıyor
  ve **kendi notuyla çelişiyor** → **M4-2**.
- **Tur 2 M-3(2c) / tur 3 L-10 hâlâ AÇIK:** `:602` "**417+** kayıtlı oturumda `length=0`"
  — `security` iki turda iki kez gerçek değeri ölçtü (1174, sonra 2387) ve belge hâlâ
  ölçülmemiş sayıyı taşıyor; aynı cümlenin "İçinde migration **gerekmez** (`ALTER` sadece
  `DEFAULT` ekler)" ayağı da duruyor → **L4-11**.

---

## 2. ⚠ `Pick` MEKANİZMASININ KOD KALİTESİ (raporun birinci kritik parçası)

### 2.1 Allowlist'in kendisi savunulabilir mi? — **EVET; dört üyeden ÜÇÜ ölçümle gerekçeli, BİRİ değil**

Her üyeyi bağımsız `grep` ile doğruladım (`apps/api`, `__tests__` ayrımı yapılarak):

- **`tenant`** — üretimde **var**: `tenancy/tenant-resolver.service.ts:168` ve `:181`
  (`.db.tenant.findUnique`). ✓ gerekçeli
- **`user`** — üretimde **var**: `auth/auth-context.middleware.ts:70` (`.db.user.findUnique`).
  ✓ gerekçeli
- **`$queryRaw`** — üretimde **var ama DOLAYLI**: `apps/api` doğrudan çağırmıyor;
  `health/checks/database.health-check.ts:23` → `checkDatabaseConnection(this.prismaService.db)`
  → `packages/db/src/health.ts:47-48` `db.$queryRaw\`SELECT 1\``. `client.ts:124-127`'nin
tarifi **birebir doğru** ve paket sınırı (CLAUDE.md §3: ham SQL `packages/db`'de kalır)
  **korunuyor**. ✓ gerekçeli
- **`tenantMembership`** — **üretimde SIFIR.** `grep` (`apps/api`): tek eşleşme
  `__tests__/prisma-with-tenant.test.ts:86`. Üretimde üyelik okuması `withTenant()`
  callback'inin `tx.tenantMembership`'i üzerinden gidiyor (yani `TenantTransactionClient`'ın
  üyesi, `AppPrismaDatabase`'in değil). → **L4-3**

**Fazladan üye var mı? Bir tane, sınırda.** `client.ts`'in kendi kuralı (`:133-134`):
"Allowlist'te **KULLANILMAYAN** üye TUTMAK ('belki bir gün gerekir') allowlist'in değerini
düşürür" — `$disconnect` tam bu gerekçeyle **dışarıda bırakıldı**. `tenantMembership`'in
`.db` üzerindeki tek tüketicisi bir **test**; `client.ts:118-123` bunu **dürüstçe kaydediyor**
("`__tests__` DIŞINDA YOK"), ama tip pini aynı şeyi **yanlış** kaydediyor
(`auth-model-narrowing.pin.ts:68-70`: "Her biri … grep ölçümüyle GEREKÇELİ (**üretim kod
yolunda gerçek çağrı sayısı > 0**)"). Kural ya "hiç çağrısı olmayan üye dışarıda" (o zaman
`tenantMembership` kalır, pin yorumu düzeltilmeli) ya da "üretimde çağrısı olmayan üye
dışarıda" (o zaman üye çıkar, test tam istemciyi kullanır) — **ikisi aynı anda yazılı
olamaz**. Bu bir `high` değil: `tenantMembership` **sır taşımaz**, RLS politikası **var**
(`tenant_membership` t/t), ve testin pinlediği şey (context'siz okuma 0 satır döner) gerçek
bir izolasyon değişmezi. **`low` + öneri.**

### 2.2 Jenerik pin tasarımı — **NİYET KODDA YAZILI, hata mesajı ANLAŞILIR; başlık yorumu ne yaptığını YANLIŞ anlatıyor**

`security` bunu "altıncı kapı için yedinci tur gerekmemesinin tek yolu" diye işaretlemişti.
Üç soruya ayrı cevap:

- **Niyet kodda mı, yalnızca yorumda mı? KODDA.** `auth-model-narrowing.pin.ts:225`
  `ExpectedAppPrismaDatabaseKeys` **açık bir birleşim literali**, `:228`/`:231` **iki yönlü**
  `Exclude<>` (fazlalık **ve** eksiklik), `:253-262` sonucu `true` literaline atıyor.
  `:272-293` aynı yapı `TenantTransactionClient` için. Hiçbir adım yoruma bağlı değil —
  **derleyici zorluyor**. ✓ Ayrıca `:271`'in "`client.ts`'in `Pick<>` literaliyle BİREBİR
  aynı" cümlesi **doğru** (ölçüldü: dört üye, aynı sıra, aynı jetonlar).
- **Prisma bir yükseltmede üye eklerse hata mesajı anlaşılır mı? SORU YANLIŞ KURULMUŞ — ve
  cevabı pinin KENDİ başlığında YANLIŞ yazılı.** `AppPrismaDatabase` bir `Pick<>` olduğu
  için `keyof AppPrismaDatabase` **Prisma ne eklerse eklesin dört anahtarda kalır**; jenerik
  pin o durumda **yeşil kalır ve kalmalıdır** (yeni üye zaten erişilemez — fail-closed'ın
  tanımı). Pin dosyasının başlığı (`:46-52`) ise bunun tersini iddia ediyor: "**İSİM BAZLI
  değil** — Prisma ileride YENİ bir `$`-metot eklerse (adını BİLMEDEN) bile **bu pin
  yakalar**." Bu **yanlış**, ve aynı dosya `:249-251`'de **doğrusunu** yazıyor: "`Pick<>`'in
  KENDİSİ zaten yeni bir Prisma `$`-metodunu otomatik dışarıda tutar — bu pin'in asıl işi,
  **SESSİZCE `Pick<>` listesine eklenen bir üyeyi** yakalamaktır." İki cümle aynı dosyada,
  biri yanlış. → **L4-4**
- **Asıl senaryoda (biri `Pick<>` listesine üye ekler) mesaj anlaşılır mı? EVET, örnek
  nitelikte.** Hata, `true`'nun bir tuple'a atanamaması olarak düşer ve tuple'ın **birinci
  elemanı Türkçe açıklama**, ikincisi **suçlu anahtar**: `['FAZLA ANAHTAR — Pick<> listesine
izinsiz eklenmiş üye', AppPrismaDatabaseExtraKeys]` (`:255`) / `['EKSİK ANAHTAR — beklenen
allowlist üyesi Pick<> listesinden düştü', …]` (`:260`). `tsc`'nin TS2322 metni bu diziyi
  **olduğu gibi** yazdırır — yani geliştirici "neden kırmızı" sorusunu **hata çıktısından**
  yanıtlar, dosyayı açmadan. Bu, T-004'ün "kanonik tam eşitlik" dersinin tip düzeyindeki
  doğru uygulaması. **Bulgu yok — kredi.**

### 2.3 Yedi negatif pin fazla mı? — **İKİSİ GEREKSİZ, BEŞİ GEREKLİ; TEKRAR YOK**

`@ts-expect-error` **13** (tur 3: 10). Dağılım: `auth-model-narrowing.pin.ts` **11
yönerge / 7 fonksiyon**, `client-options.pin.ts:45` 1, `__tests__/prisma-with-tenant.test.ts:111`

1. **Susturma: 0** — hiçbiri bir derleme hatasını örtmüyor, hepsi "bu satır DERLENMEMELİ"
   iddiası.

Mantıksal olarak **yedi negatif pinin tamamı** iki jenerik pin tarafından ima ediliyor
(anahtar kümesi tam olarak dört/bir üye ise `account`/`session`/`verification`/
`$transaction`/`$extends`/`$disconnect` **zorunlu olarak** yok). Buna rağmen **tekrar
diye işaretlemiyorum** ve sebebi önemli: jenerik pin, `Pick<>` listesini **aynı repodaki
bir beklenti literaliyle** karşılaştırıyor — biri **ikisini birlikte** değiştirirse
(ör. `Pick<>`'e `'account'` ekleyip `ExpectedAppPrismaDatabaseKeys`'e de ekler) jenerik pin
**yeşil kalır**. Sır taşıyan üç delege ve onlara giden iki kapı (`$transaction`, `$extends`)
için negatif pinler **bağımsız** değişmezi kodluyor ve farklı sebeple değişirler →
birleştirilmeleri **daha kötü tasarım olurdu**.

**İstisna — `pinAppPrismaDatabaseDropsDisconnect` (`:168-171`):** bu pin bir **güvenlik
değişmezi değil**, bir **kullanım yokluğu** pinliyor ("bugün `.db.$disconnect()` çağrılmıyor").
Yarın `.db` üzerinden meşru bir `$disconnect` ihtiyacı doğarsa pin **silinmek zorunda** —
yani ileride kesinlikle yanlış olacak bir şeyi mekanikleştiriyor, hiçbir sırrı korumadan.
Simetrik olarak `pinTenantTransactionClientDropsExtends` (`:209-212`) kendi doc'unda zaten
"Prisma'nın `ITXClientDenyList`'i `$extends`'i **zaten** taşımaz" diyor — iki katmanın aynı
sonuca vardığını kanıtlamak bilgi değeri taşıyor ama ikinci bir yönergeye gerek yok.
→ **L4-4** (öneri, ihlal değil).

**Başlığın negatif katman tarifi de yanlış sayıyor:** `:43-45` "`@ts-expect-error` **×5**"
diyor; gerçek **11**, ve listelenen beş adın yanına **altıncı** bir ad (`$disconnect`)
pinlenmiş ama başlıkta **anılmıyor**. → **L4-4**.

### 2.4 `$disconnect`'in pozitif→negatif geçişi — **BELGELENMİŞ, ÜÇ YERDE, SORU KODDAN CEVAPLANIYOR**

"Neden `$disconnect` yok?" sorusunun cevabı **kodda** bulunuyor ve üçü tutarlı:

1. `client.ts:129-134` — kararın **gerekçesi ve ölçümü**: "`apps/api`'de `$disconnect()` HER
   ZAMAN `this.client` (TAM tip) üzerinden çağrılıyor (`prisma.service.ts:108`), `.db`
   üzerinden **SIFIR** çağrı" + allowlist ilkesi.
2. `auth-model-narrowing.pin.ts:72-75` — **pozitif pinden çıkarıldığının** kaydı ("önceki
   `Omit<>` sürümünde pozitif pindeydi").
3. `auth-model-narrowing.pin.ts:162-171` — kararın **mekanik kanıtı** (negatif pin).

**Ölçümü doğruladım:** `prisma.service.ts:108` `await this.client.$disconnect()` — `.db`
getter'ı üzerinden değil, enjekte edilen tam istemci üzerinden. `onModuleDestroy` tam
yüzeye zaten sahip olduğu için **davranış değişmedi** ve `PrismaService` dışında
`$disconnect` çağıran yer yok. ✓ **Bulgu yok — bu, FIX 3'ün en iyi belgelenmiş alt kararı.**

---

## 3. `auth-instance.ts` boyutu — **427 satır: ne küçüldü ne büyüdü (428 → 427)**

- **Satır: 427** (tur 1: 156 · tur 2: 324 · tur 3: 428 · tur 4: **427**).
- **Dosya başı yorumu: `:1-121`** (`:122` boş, `:123` ilk `import`) = **%28,3** (tur 3:
  %28,5). Yani FIX 3 **ne temizledi ne de yeni muhasebe yorumu ekledi** — dosyaya
  dokunulmadı.
- **En büyük fonksiyon: `createAuthInstance` `:305-427` = 123 satır** (tur 3 ile aynı),
  ≈%90 yapılandırma literali. Dosyadaki diğer sekiz fonksiyon (`:145`, `:156`, `:169`,
  `:173`, `:209`, `:248`, `:274`) hepsi küçük ve tek işli.
- **En büyük mantık fonksiyonu hâlâ `rate-limit.guard.ts:162-238` `canActivate` = 77 satır**
  (dört tur boyunca değişmedi).

**Yargım — bu bir bakım borcudur, bu turun kusuru değildir.** CLAUDE.md'de uzunluk kuralı
**yok**, yorumlar **doğru** ve **neden**i anlatıyor (§4 ✓), dolayısıyla **ihlal değil**.
Ama içerik tür olarak hâlâ tur-tur gate muhasebesi ("FIX turu 2, madde 1 (security tur2
S-2 …)") ve bu Task'ta yakalanan **on üç** bayat yorum kusurunun sürtünme yüzeyi tam bu
hacim: yorum ne kadar çok "hangi turda neyi düzelttik" anlatırsa, mekanizma değiştiğinde
**o kadar çok yer bayatlıyor** — bu turun L4-1'i (iki üretim dosyasında `Omit<>`) bunun
birebir örneği. **Borç olarak kaydedilmeli, düzeltme için bir tur daha açılmamalı**
(tur 3'teki L-5 ile aynı şiddet: `low`, öneri → **L4-11**).

---

## 4. Tur 3'ün 14 `low`'unun durumu

**KAPANDI (1):** **L-14 — kısmen/akışta.** `qa` dosyayı gerçekten çevirdi:
`auth-secret-leak-assertion-fragility.qa.test.ts:94-123` **yeni** bir `describe` — düzeltilmiş
indirgemenin dekoy+gerçek-sızıntı senaryosunu **gördüğünü** doğruluyor. Ama `:37-82` hâlâ
**silinmiş** implementasyonun kopyasını assert ediyor (müze parçası) ve `:110-113` düzeltilmiş
mantığı **inline kopyalıyor** (üretim testinden import etmiyor) → üretim testi değişirse bu
dosya yeşil kalır ve bekçi olmaktan çıkar. Tur 3'te verdiğim koşullu `medium`
("bu hâliyle commit'lenirse") **tetiklenmedi** → `low`'a indi (**L4-10**).

**AÇIK, DEĞİŞMEDİ (ölçüldü, 11):** L-1 (`describe-error-cause.ts:17-24` değişmez yalnızca
yorumda, rename **yapılmadı**, çağıran `auth-context.middleware.ts:108` yerinde) · **L-2**
(`packages/db/src/tenant-context.ts:30-34` yanlış öncül — "`tx` `$transaction` METODUNU
TAŞIMAZ … çalışma zamanı kontrolü gerekmez"; `client.ts`'in **kendi** ölçümüyle çelişiyor,
şimdi `:161-166`'da) · **L-3** (`same-origin.guard.ts:33-35` test-gerekçesi + yanlış satır
atfı `:118-125`) · L-4 · L-5 (§3) · **L-6** (`AggregateError` ölçümü hâlâ **altı** dosyada:
`describe-error-cause.ts`, `redis.service.ts`, `redis.module.ts`, `rate-limit.guard.ts`,
`auth-context.middleware.ts`, `tenant-context.middleware.ts`) · L-7 · L-8
(`error-mapping.ts:133` + `main.ts:29-31`) · L-9 · **L-10** (`development.md:602` "417+") ·
**L-11** (`describe-error-cause.ts:42` gerekçesiz `as`) · **L-13**
(`rate-limit.guard.ts:301`/`:307` kopuk yolda fırlatan `getRequestContext()`).

**BÜYÜDÜ (1):** **L-12** — kaçınılabilir "kayıt→doğrula→giriş" kopyası **1 → 3** (§5.5,
**L4-9**).

---

## 5. ⚠ ON ÜÇÜNCÜ BELGE-KOD SAPMASI — ARANDI, BULUNDU (raporun ikinci kritik parçası)

FIX 3'ün dokunduğu/komşu olduğu her dosyanın yorumunu kaynakla karşılaştırdım.

### 5.1 `client.ts`'in yeni yorumları — **TEMİZ (tek kalem hariç)**

`:74-134` ve `:141-166`'nın **her olgusal iddiası** doğrulandı: beş kapının tarihçesi
`security` tur1/2/3 raporlarıyla örtüşüyor · `ITXClientDenyList` listesi
(`['$connect','$disconnect','$on','$use','$extends']`) `security` §1.6'nın üretilen kaynak
okumasıyla aynı · "`$transaction`'ı TAŞIR" iddiası doğru · `tx.*` ölçümü
("`tx.tenantMembership` DIŞINDA sıfır") `grep` ile doğrulandı · `$queryRaw`'ın
`TenantTransactionClient`'tan **bilerek** dışarıda olması ölçümle gerekçeli. Tek kalem:
`tenantMembership`'in üretim çağrı sayısı (§2.1, L4-3) — ve orada da `client.ts` **dürüst**,
yanlış olan pin dosyası.

### 5.2 Pin dosyasının açıklaması — **İKİ İÇ ÇELİŞKİ** → L4-4 (§2.2, §2.3)

### 5.3 `prisma.service.ts`'in yorumu — **ON ÜÇÜNCÜ SAPMA, ÜRETİM KODU** → L4-1

`db`'nin `TenantTransactionClient` değişikliğinden sonra **artık doğru değil**:

- `:33-34` "`.db` getter'ı artık `PrismaDatabase` DEĞİL, `AppPrismaDatabase` döner
  (`account`/`session`/`verification` delegeleri **`Omit<>` ile DÜŞÜRÜLMÜŞ**)" — mekanizma
  artık `Pick<>`, ve daraltma **üç delegeden** ibaret değil: istemcinin **dördü hariç her
  üyesi** düşmüş durumda. Yorum korumayı olduğundan **dar** anlatıyor.
- `:50-60` "GÜNCELLEME (FIX turu 2 …): `packages/db/src/client.ts` →
  **`Omit<TransactionClient, AuthModelName | '$transaction'>`**" — bu tip ifadesi
  `client.ts`'te **artık yok** (`:168` `Pick<TransactionClient, 'tenantMembership'>`).
- `:44-46`'nın kontravaryans gerekçesi (`TransactionClient` → `TenantTransactionClient`
  atanabilirliği, ek `as` gerekmez) `Pick<>` altında **hâlâ doğru** ✓ — tek doğru kalan
  teknik ayak.

### 5.4 `packages/db/src/health.ts:42-44` — **ON DÖRDÜNCÜ SAPMA, S2'nin KENDİ paketinde** → L4-1

"`$queryRaw` her iki tipte de mevcuttur (**`Omit<>` yalnızca `AUTH_SECRET_BEARING_MODELS`
delegelerini düşürür, `$queryRaw`/`$transaction`/`$disconnect` dokunulmamış kalır**)" —
**üç yönden yanlış**: mekanizma `Omit<>` değil; `$transaction` **düşürüldü** (FIX 2);
`$disconnect` **düşürüldü** (FIX 3). Fonksiyonun **sonucu** değişmedi (`$queryRaw`
allowlist'te, `health.ts:47-48` derleniyor) — yanlış olan yine **sebep**. Bu dosya FIX 3'ün
değiştirdiği tipin **doğrudan tüketicisi**; `client.ts`, pin ve ADR güncellenirken
atlanmış.

### 5.5 ADR-0008'in yeni metni — **M4-1 + L4-5/L4-6/L4-7/L4-8**

Yeni yazılan bölümler (`:34-55`, `:103-106`, `:124-135`, `:176`) **asıl iddialarında doğru**;
sapmalar **kenarlarda** ve biri **bağlayıcı kuralla çelişiyor** (§1.1, bulgular).

### 5.6 `development.md`'nin yeni "Log Olayları" tablosu → **M4-2**

### 5.7 Yeni `*.qa.test.ts` dosyaları — **BİRİ ÖRNEK NİTELİKTE, BİRİ FIXTURE'I ATLADI**

- `auth-delegated-origin-check.qa.test.ts` **davranışı** test ediyor, **implementasyonu
  değil**: gerçek HTTP, `NODE_ENV='development'` ile **gerçek** Better Auth origin kontrolü,
  `:79-80` 403 `INVALID_ORIGIN`, `:83-86` **gerileme bekçisi** ("oturum GERÇEKTEN hayatta"),
  `:94-135` **pozitif kontrol** ("negatif testin anlamlı olduğunu kanıtlar"). Dosya başı
  (`:8-12`) neden mevcut statik pinin (`auth-flow.test.ts:117`) yetmediğini **ölçülebilir**
  biçimde anlatıyor. **Kredi — `security` tur3 S3-10'un doğru kapatılması.**
- **Ama** aynı dosya `:53-70` ve `:106-122`'de `createAuthenticatedSession`'ı
  (`helpers/auth-fixture.ts:50-71`) **kelime kelime yeniden yazıyor** — oysa fixture tam
  olarak bir `Server` alıyor (`:50-52`) ve tam olarak `cookieHeader` döndürüyor (`:38-41`),
  yani **birebir uyuyor**; ikinci kopya üstelik `cookies.length > 0` ön koşulunu
  **düşürüyor** (`:121-122`). Aynı FIX turunda yazılan
  `same-origin-guard-measurements.qa.test.ts` fixture'ı **kullanıyor** (3 çağrı) → desen
  **kendi içinde tutarsız**. → **L4-9**
- `auth-secret-leak-smtp-failure-modes.qa.test.ts`'in iki inline akışını **işaretlemiyorum**:
  kayıt **anında** SMTP arızası gerekiyor, fixture bunu veremez — **meşru**, yüzeysel
  benzerlik.

---

## 6. BULGULAR

### [SEV: medium]

**M4-1** — `docs/adr/0008-sir-tasiyan-tablolarin-tipi-ve-linti-ile-korunmasi.md:24` · `:143` ·
`:147` (karşı kutup: `:55`) — **ADR'nin kendi BAĞLAYICI kuralı belgenin üç ayrı yerinde
çürütülüyor; biri belgenin NORMATİF ÖZETİ, ikisi "ileride ne yapılacağı" talimatı. Bu, tur
3'ün M-1 arıza SINIFININ (normatif kayıt okura reddedilmiş mekanizmayı gösteriyor) aynı
belgede YENİDEN doğması.**
→ **`T-006 KUSURU`**

`:55` **bağlayıcı**: "`Omit` tabanlı deny-list'e artık dönülmeyecek." Buna karşılık:

1. `:24` — "Bağlam"ın üç katmanlı mekanizma özeti: "**Derleme zamanı (birincil): TypeScript
   `Omit<>` ile sır taşıyan modeller daraltılır.**" Bu, belgenin birinci katmanı **tanımlayan**
   cümlesi ve `:34`'teki başlıkla (`Pick<>` ile İzin Verilen Üyelerin Allowlist'i) **doğrudan
   çelişiyor**.
2. `:143` — "Gözden Geçirme Koşulları 1": "Better Auth başka bir bağımlı kimlik bilgisi
   modeli getirse … Darlama aynı desenle uygulanır veya **yeni model bazlı `Omit` eklenir**."
   **İki kez yanlış:** (a) yasaklanmış mekanizmayı öneriyor; (b) allowlist altında yeni bir
   sır taşıyan model için **hiçbir şey yapmak gerekmez** — `Pick<>` onu zaten dışarıda tutar.
   Bu, `Pick<>`'e geçişin **tek büyük kazancını** görmezden geliyor.
3. `:147` — "Gözden Geçirme Koşulları 3": "tip daraltması modül saplantıya dönüşür;
   **jenerik bir `Omit<Client, ModelNames>` fab rikatörü yazılabilir**." Yine yasaklanmış
   mekanizma, bu kez "jenerik" sıfatıyla **daha davetkâr**.

**Niçin `medium` (ve niçin `high` değil):** kod **doğru** — `client.ts:136-139`/`:168`
`Pick<>`, on bir negatif yönerge ve iki jenerik pin CI'da **tutuyor**; bugün sömürülebilir
bir açık yok. Ama ADR bu repoda **normatif karar kaydıdır** ve kendi `:104` uyarısı tam bu
sınıfı adıyla yasaklıyor ("belgelenmiş ama gerçekleşmeyen bir kontrol, var olmayan ama
belgelenmemiş bir kontrolden daha tehlikelidir"). v0.0.6'da Better Auth'un API-anahtarı
modelini ekleyen geliştirici ADR'nin "Gözden Geçirme Koşulları"nı okur, `Omit` ekler ve
**beş turda kapatılan yapısal fail-open sınıfını yeniden açar** — hem de `client.ts`'in
BAĞLAYICI kuralını hiç görmeden, çünkü ADR'yi okumak "doğru" davranıştır.
**Önerilen düzeltme:** `:24`'ü "TypeScript **`Pick<>` allowlist'i** ile yalnızca gereken
üyeler açılır" yap; `:143`'ü "**hiçbir değişiklik gerekmez** — `Pick<>` yeni modeli
otomatik dışarıda tutar; yalnızca modelin `AUTH_SECRET_BEARING_MODELS`'e eklenmesi ve
negatif pin yazılması gerekir" yap; `:147`'yi "allowlist **genişletilmez**; ikinci bir
daraltılmış tip gerekiyorsa o da `Pick<>` ile yazılır" yap. — **Sorumlu: architect** —
**T-006 KUSURU** (FIX turu 3'te doğdu: mekanizma değişti, belgenin özeti ve ileriye dönük
talimatları güncellenmedi)

**M4-2** — `docs/development.md:572` · `:575` (bölüm: `:564-575` "Log Olayları", **FIX turu
3'te M-2'yi kapatmak için YENİ yazıldı**) — **runbook'un yeni tablosu iki olgusal hata
taşıyor ve tablonun bir satırı KENDİ notuyla üç satır sonra çelişiyor. M-2 ile AYNI SINIF:
operatör, gerçekleşmeyecek bir alana göre log filtresi kurar.**
→ **`T-006 KUSURU`**

1. `:572` — `giriş başarılı` satırı **`tenantId` ✓** diyor. **Yanlış.** Üretim kodu
   `auth-instance.ts:404-406`: `const context = tryGetRequestContext()` → `eventLogger.info({
userId: session.userId, sessionId: session.id }, 'giriş başarılı')` — `tenantId` alanı
   **yazılmıyor** ve `/auth/*` yolları **tenant-exempt** olduğu için istek bağlamının
   logger'ında da yok. `security` tur3 §6 madde 13 bunu **ölçtü**: "`/auth/*` `tenantId`
   taşımıyor … **Ölçüldü: `tenantId: false`**". Üstelik aynı tablonun **üç satır altındaki
   notu** (`:575`) **doğrusunu** söylüyor: "`tenantId` kimlik doğrulama uçlarında (`/auth/*`)
   **hiçbir zaman var olmaz**." Tablo ve not **birbirini çürütüyor**; bir runbook'un
   okurunun hangisine inanacağı belirsiz.
2. `:575` — "`requestId` ve `traceId` **tüm işaretler tarafından yapılır**." Cümle hem
   **bozuk Türkçe** hem **olgusal olarak yanlış**: `security` tur3 §5.2 beş olayın
   **hepsinde** `traceId` **✗** ölçtü (OpenTelemetry bu sürümde yok, CLAUDE.md §2 yığını
   onu v0.0.17'ye koyuyor). `requestId` kısmı **doğru** (beş olayda da ölçüldü).
3. (Aynı bölüm, ikincil) Tablo "Kimlik doğrulama uçlarından üretilen log olayları" diye
   **tam bir liste** iddia ediyor ama `auth-instance.ts:371-372`'nin ürettiği
   `oturum sonlandırıldı`/`çıkış` olaylarını **içermiyor**.

**Önerilen düzeltme:** `:572`'nin `tenantId` hücresini **`—`** yap (notla tutarlı hâle gelir);
`:575`'in ikinci cümlesini "`requestId` **dört olayın hepsinde** vardır; `traceId`
**v0.0.17'ye kadar üretilmez**" ile değiştir; `oturum sonlandırıldı` satırını ekle veya
başlığı "başlıca olaylar" yap. `architect`'in LOG DESENİ tablosu da aynı turda uyumlanmalı.
— **Sorumlu: S9/docs (metin), architect (LOG DESENİ)** — **T-006 KUSURU**

---

### [SEV: low]

**L4-1** — `apps/api/src/prisma/prisma.service.ts:33-34` · `:50-60` ·
`packages/db/src/health.ts:42-44` — **ON ÜÇÜNCÜ ve ON DÖRDÜNCÜ belge-kod sapması, ikisi de
ÜRETİM KODU yorumu: FIX 3 mekanizmayı `Pick<>`'e çevirdi ama bir geliştiricinin `.db`'ye
dokunmadan önce okuyacağı iki dosyada `Omit<>` anlatısı DURUYOR.** Ayrıntı §5.3/§5.4;
özet: `prisma.service.ts:50-60` **artık var olmayan** bir tip ifadesini (`Omit<TransactionClient,
AuthModelName | '$transaction'>`) alıntılıyor, `health.ts:42-44` `$transaction`/`$disconnect`'in
"dokunulmamış kaldığını" söylüyor (ikisi de **düşürüldü**). Her iki dosyanın **sonucu**
doğru; yanlış olan **sebep** — bu, tur 3 L-2 ile **aynı sınıf**, o yüzden aynı şiddet.
**Düzeltme:** üç bloğun `Omit<>` cümlelerini `Pick<>` ile değiştir ve satır atfı yerine
**tip adıyla** atıf ver (satır numaraları bu Task'ta beş kez bayatladı).
— **Sorumlu: S3 (`prisma.service.ts`), S2/db (`health.ts`)** — **T-006 KUSURU**

**L4-2** — (birleşti, bkz. L4-1) _— numara korunuyor ki tur 3 atıfları kaymasın._

**L4-3** — `packages/db/src/client.ts:138` (`'tenantMembership'`) ·
`packages/db/src/__tests__/type-pins/auth-model-narrowing.pin.ts:68-70` — **allowlist'in dört
üyesinden biri ÜRETİMDE HİÇ KULLANILMIYOR ve pin dosyası bunun tersini iddia ediyor.**
`grep` (`apps/api`): `.db.tenantMembership` → tek eşleşme
`__tests__/prisma-with-tenant.test.ts:86`. Üretimde üyelik okuması `withTenant()` callback'i
üzerinden (`tx.tenantMembership`) gidiyor — yani `TenantTransactionClient`'ın üyesi,
`AppPrismaDatabase`'in değil. `client.ts:118-123` bunu **dürüstçe** kaydediyor ("`__tests__`
DIŞINDA YOK"), ama pin `:68-70` "Her biri … **üretim kod yolunda gerçek çağrı sayısı > 0**"
diyor — bu üye için **yanlış**. Ve `client.ts:133-134`'ün `$disconnect`'i dışarıda bırakma
gerekçesi ("KULLANILMAYAN üye TUTMAK allowlist'in değerini düşürür") bu üyeye
**uygulanmamış** → tek dosyada iki ölçüt. `medium` **demiyorum**: `tenant_membership` sır
taşımıyor, RLS politikası **var**, ve testin pinlediği şey (context'siz okuma 0 satır)
gerçek bir izolasyon değişmezi. **Düzeltme (ikisinden biri):** (a) üyeyi çıkar ve
`prisma-with-tenant.test.ts` Vaka 2'yi tam istemciyle (`__tests__` lint muafiyetinde) yaz;
(b) üyeyi tut ve **iki** yorumu düzelt — `client.ts`'e "TEST-ONLY üye, bilinçli" notu,
pin `:68-70`'e "üçü üretimde, `tenantMembership` yalnızca testte". — **Sorumlu: S2/db** —
**T-006 KUSURU**

**L4-4** — `packages/db/src/__tests__/type-pins/auth-model-narrowing.pin.ts:46-52` · `:43-45` ·
`:168-171` · `:209-212` — **pin dosyasının başlığı, kendi jenerik pininin NE YAPTIĞINI
yanlış anlatıyor ve aynı dosya 200 satır sonra doğrusunu yazıyor; negatif katmanın sayımı
da yanlış.** Üç kalem: (a) `:46-52` "Prisma ileride YENİ bir `$`-metot eklerse (adını
BİLMEDEN) bile **bu pin yakalar**" → **yanlış**; `AppPrismaDatabase` bir `Pick<>` olduğu için
`keyof` yeni üyeyi **hiç görmez**, pin yeşil kalır (ve kalmalıdır) — doğrusu `:249-251`'de
yazılı ("`Pick<>`'in KENDİSİ … bu pin'in asıl işi, SESSİZCE `Pick<>` listesine eklenen bir
üyeyi yakalamaktır"). (b) `:43-45` negatif katmanı "`@ts-expect-error` **×5**" diye sayıyor;
gerçek **11 yönerge / 7 fonksiyon**, ve pinlenen altıncı ad (`$disconnect`) başlığın
listesinde **yok**. (c) **Öneri (ihlal değil):** `pinAppPrismaDatabaseDropsDisconnect`
(`:168-171`) bir **güvenlik değişmezi değil**, bir **kullanım yokluğu** pinliyor — meşru bir
`.db.$disconnect()` ihtiyacı doğduğu gün **silinmek zorunda**; `pinTenantTransactionClientDropsExtends`
(`:209-212`) de kendi doc'una göre Prisma'nın zaten garanti ettiği şeyi ikinci kez pinliyor.
Diğer **beş** negatif pin **gerekli** ve jenerik pinle **birleştirilmemeli** (jenerik pin
beklenti literalini aynı repoda tutuyor; biri ikisini birlikte değiştirirse yeşil kalır —
sır taşıyan delegelerin pini **bağımsız** değişmez). **Düzeltme:** (a) ve (b)'yi düzelt;
(c)'yi v0.0.14'ün jenerik `$`-üye pini yazılırken gözden geçir.
— **Sorumlu: S2/db** — **T-006 KUSURU** (a, b) + **KAYDA GEÇECEK BORÇ (v0.0.14)** (c)

**L4-5** — `docs/adr/0008-…md:105` — düzeltilmiş "Ek not (FIX tur 2)" bloğu doğru içeriği
**yanlış satır atfıyla** veriyor: "(`client.ts:102,133`)". O satırlar eski `Omit<>`
sürümünün yerleriydi; tiplerin bugünkü yeri `packages/db/src/client.ts:136-139` ve `:168`.
M-1'in düzeltmesi, M-1'in kusurunu (bayat satır atfı) **yeniden üretti**. **Düzeltme:**
satır numarası yerine **tip adı** ver (`AppPrismaDatabase`/`TenantTransactionClient`).
— **Sorumlu: architect** — **T-006 KUSURU**

**L4-6** — `docs/adr/0008-…md:124` — bölüm başlığı "**Açık olan kaçış yolları (v0.0.5
sonunda):** Beş ayrı mekanizma sır taşıyan delegelere erişim **sağlayabilir**" — şimdiki
zaman, oysa hemen altındaki tablonun kolonu "**Nasıl kapandı**" ve altı satırın **beşi
kapalı**, yalnızca biri (`Parameters<typeof withTenant>[0]`) açık. Başlık tek başına
okunduğunda **beş açık kapı** olduğu izlenimi veriyor — tablonun kendisi doğru olduğu için
bu salt ifade kusuru. **Düzeltme:** "Kaçış kapısı tarihçesi — beşi **kapalı**, biri
**latent** (v0.0.14)". — **Sorumlu: architect** — **T-006 KUSURU**

**L4-7** — `docs/adr/0008-…md:106` · `:135` — **ADR, FIX 3'te TESLİM EDİLEN jenerik pini
v0.0.14 borcu olarak kaydediyor ve teslim edileni HİÇBİR YERDE anmıyor.** İki yer de
"**v0.0.14'te** jenerik (anahtar-eşitliği) pini yazılacak" diyor. Oysa jenerik kapalı-dünya
pini **bu turda yazıldı**: `auth-model-narrowing.pin.ts:253-269` (`AppPrismaDatabase`) ve
`:284-303` (`TenantTransactionClient`). ADR'nin tarif ettiği v0.0.14 işi **daha geniş**
(tüm `$`-önekli `PrismaDatabase` üyelerinin zorunlu pinlenmesi), yani borç satırı **yanlış
değil** — ama `:103`'ün kendi talimatı ("Tüm yollar … olumsuz pinler ve açıklamalar
bölümünde **kaydedilmiş olmalıdır**") mevcut jenerik pin için **uygulanmamış**. Sonuç:
ADR'yi okuyan biri, bugün var olan en güçlü mekanizmanın **var olmadığını** sanır — M-1'in
ters yönü. **Düzeltme:** `:106`'ya bir cümle: "FIX turu 3'te **iki yönlü anahtar-eşitliği
pini** yazıldı (`auth-model-narrowing.pin.ts`, `pinAppPrismaDatabaseKeysExactlyMatchAllowlist`

- `TenantTransactionClient` ikizi) — `Pick<>` listesine sessiz ekleme artık `typecheck`
  kırar; **v0.0.14'ün işi** bunu `keyof PrismaDatabase`'in tamamına genişletmek."
  — **Sorumlu: architect** — **T-006 KUSURU**

**L4-8** — `docs/adr/0008-…md:61` · `:96` · `:110` · `:18` · `:22` · `:143` · `:147` · `:149` ·
`:168` — **tur 3 M-1(4)'ün tamamı AÇIK, hiçbirine dokunulmamış.** Ölçümler: `:61` lint
muafiyet kümesini "`apps/api/src/{prisma,auth}/**`" diye veriyor, gerçek küme
`apps/api/eslint.config.mjs:258` → `['src/prisma/**', 'src/auth/**', '**src/__tests__/**'**]`
(üçüncüsü eksik) · `:110` kuralı `eslint.config.mjs:3-20`'ye atfediyor, gerçek yer `:46-56`
(kısıtlama nesnesi) + `:252-260` (uygulama bloğu); `:3-20` bir **başlık yorumu** · `:96`
`sp_executesql` (SQL Server yordamı, PostgreSQL ADR'sinde **uydurma ayrıntı**) · bozuk
sözcükler: `:18` "yapisal", `:22` "mekanizm", `:143` "Darlama", `:147` "modül saplantıya" /
"fab rikatörü", `:149` "Üzün yolu", `:168` "reddetilmiş". **Düzeltme:** muafiyet kümesini ve
satır atfını `eslint.config.mjs`'ten kopyala; `sp_executesql`'i **sil**; sözcükleri düzelt.
— **Sorumlu: S9/docs (dil), architect (olgular)** — **ÖNCEDEN VAR OLAN BORÇ** (tur 2 L-6 →
tur 3 M-1(4) → tur 4; iki turdur devrediyor)

**L4-9** — `apps/api/src/__tests__/auth-delegated-origin-check.qa.test.ts:53-70` · `:106-122` —
**tur 3 L-12'nin kaçınılabilir kopyası 1 → 3'e çıktı.** Dosya `createAuthenticatedSession`'ı
(`helpers/auth-fixture.ts:50-71`) iki kez **kelime kelime** yeniden yazıyor; fixture tam
olarak bir `Server` alıyor ve tam olarak bu testin ihtiyacını (`cookieHeader`) döndürüyor →
**birebir uyuyor**. İkinci kopya üstelik `cookies.length > 0` ön koşulunu **düşürmüş**
(`:121-122` vs `:69`), yani zayıf varyant. Aynı FIX turunda yazılan
`same-origin-guard-measurements.qa.test.ts` fixture'ı **kullanıyor** (3 çağrı) → desen bir
turun içinde **kendisiyle tutarsız**. Bu **gerçek tekrar**: sign-up/verify/sign-in sözleşmesi
değişirse üçü birlikte değişir. **İşaretlemediğim kopyalar:**
`auth-secret-leak-smtp-failure-modes.qa.test.ts` (kayıt **anında** SMTP arızası gerekiyor,
fixture veremez) ve `auth-flow.test.ts`/`rate-limit.test.ts` (akışın **kendisini** test
ediyorlar veya `email`/`password` gerekiyor) — **meşru**. **Düzeltme:**
`auth-delegated-origin-check.qa.test.ts`'in iki bloğu `createAuthenticatedSession(
testApp.app.getHttpServer())` çağırsın. — **Sorumlu: qa** — **T-006 KUSURU**

**L4-10** — `apps/api/src/__tests__/auth-secret-leak-assertion-fragility.qa.test.ts:37-82` ·
`:110-113` — **tur 3 L-14 kısmen kapandı: `qa` ikinci bir `describe` ekledi (`:94-123`,
düzeltilmiş mantığın dekoy senaryosunu GÖRDÜĞÜNÜ doğruluyor) ama dosyanın yarısı hâlâ
müze.** `:37-82` **silinmiş** bir implementasyonun (`calls[0][1]`'e çivili assert) kopyasını
doğruluyor — üretim kodu veya üretim testi hakkında hiçbir şey test etmiyor. Yeni bölüm de
üretim testinden **import etmiyor**, indirgeme mantığını `:110-113`'te **inline kopyalıyor**
→ `auth-secret-leak.test.ts:307-310` değişirse bu dosya **yeşil kalır** ve bekçi olmaktan
çıkar. Tur 3'te verdiğim koşullu `medium` **tetiklenmedi** (dosya "bu hâliyle"
commit'lenmedi) → `low`. **Düzeltme:** `:37-82`'yi sil (anlatısı `reviews/`'da kalıcı olarak
duruyor) ve `:110-113` yerine üretim testiyle **paylaşılan** bir yardımcıya (`flattenConsoleCalls`)
atıf ver — o zaman dosya gerçekten gerileme bekçisi olur.
— **Sorumlu: qa** — **T-006 KUSURU**

**L4-11** — **tur 3'ten devredilen, DEĞİŞMEDİĞİ ölçülen `low`'lar** (tek satırda, her biri
`dosya:satır`): `apps/api/src/errors/describe-error-cause.ts:17-24` (L-1, rename yapılmadı) ·
`packages/db/src/tenant-context.ts:30-34` (L-2) ·
`apps/api/src/auth/same-origin.guard.ts:33-35` (L-3) ·
`apps/api/src/auth/same-origin.guard.ts:57` + `sessions.controller.ts` (L-4) ·
`apps/api/src/auth/auth-instance.ts:1-121` (L-5, §3: 427 satırın %28,3'ü) ·
`describe-error-cause.ts:8-15` + `redis/redis.service.ts:40-44` + `redis/redis.module.ts:63-66` +
`auth/rate-limit/rate-limit.guard.ts:71-74` + `auth/auth-context.middleware.ts:103-106` +
`tenancy/tenant-context.middleware.ts:68-70` (L-6, **altı kopya hâlâ altı**) ·
`auth/rate-limit/rate-limit.service.ts:179-182` (L-7) ·
`errors/error-mapping.ts:133` + `main.ts:29-31` (L-8, **ÖNCEDEN VAR OLAN BORÇ**) ·
`auth/rate-limit/rate-limit.service.ts:140-165`/`:168-170`/`:179-182` (L-9) ·
`docs/development.md:602` (L-10, "417+" + `ALTER` cümlesi) ·
`errors/describe-error-cause.ts:42` (L-11, gerekçesiz `as`) ·
`apps/api/src/auth/rate-limit/rate-limit.guard.ts:301` + `:307` (L-13).
**Hiçbiri bu turda kötüleşmedi; hiçbiri için yeni tur gerekmiyor.**
— **Sorumlu: tur 3'teki atıflar geçerli** — **T-006 KUSURU / ÖNCEDEN VAR OLAN BORÇ (L-8) /
KAYDA GEÇECEK BORÇ (L-4, L-5, L-7)**, dağılım tur 3 raporunda

---

## 7. Temiz çıkan kontroller (bu turda arandı, bulunamadı)

- **Katman ihlali (CLAUDE.md §3): yok.** `packages/db` **iş mantığı içermiyor** — `client.ts`
  yalnızca tip + fabrika, `health.ts` yalnızca `SELECT 1`; `apps/api`'nin
  `database.health-check.ts:23` ham SQL **yazmıyor**, `checkDatabaseConnection`'a delege
  ediyor (ham SQL paket sınırında kalıyor ✓). `prisma.service.ts:99-104` `withTenant` hâlâ
  saf delegasyon. `packages/db` hiçbir uygulamaya bağımlı değil.
- **Bağımlılık yönü / döngüsel bağımlılık: temiz.** Pin dosyası yalnızca `../../client.js`
  import ediyor (tip-only). Yeni qa testleri `apps/api` içinde kalıyor. `packages/errors`
  bağımlılık yüzeyi değişmedi.
- **Soyutlama / sağlayıcı dallanması:** `if (provider === …)` **0**. `Pick<>` geçişi
  Prisma'ya özgü bir tipi **daraltıyor** ama onu `packages/db` sınırında tutuyor — sağlayıcı
  tipi `apps/api`'nin tenant yoluna **daha az** sızıyor (iyileşme).
- **`any`: 0** (`**/src/**/*.ts`, `(:|<|\()\s*any\b|any\[\]|as any` → **0 eşleşme**,
  ölçüldü) · **`@ts-ignore`/`@ts-nocheck`: 0**.
- **Yeni gerekçesiz `as`: 0.** `packages/db/src`'de bu turda eklenen `as` **yok** (tek
  eşleşme bir yorum metni: `__tests__/helpers/tenant-isolation-suite.ts:103`). Üretimdeki
  tek gerekçesiz `as` hâlâ `describe-error-cause.ts:42` (L-11, tur 3'ten).
- **Yutulan hata: yok.** FIX 3 hata yoluna dokunmadı; `catch {}` **0**.
- **Jenerik pin hata mesajı kalitesi: iyi** (§2.2) — tuple'ın birinci elemanı Türkçe
  açıklama, ikincisi suçlu anahtar; TS2322 çıktısı dosyayı açmadan anlaşılıyor.
- **Yeni qa testinin kalitesi: iyi** — `auth-delegated-origin-check.qa.test.ts` davranışı
  (gerçek HTTP + gerçek Better Auth kontrolü) test ediyor, **negatif + pozitif kontrol** ve
  **gerilema bekçisi** (`:83-86` oturum hayatta) içeriyor; statik pinin niçin yetmediğini
  `:8-12`'de ölçülebilir biçimde anlatıyor.
- **`skip`/`only`/`expect(true)`: aranmadı bu turda** — tur 3'te 0 ölçülmüştü, FIX 3'ün yeni
  test dosyalarında gözle görülen yok.

---

## 8. ÖLÇÜMLER

- **İncelenen dosya (bu tur): 17** — 10 üretim/pin (`packages/db/src/client.ts`,
  `packages/db/src/__tests__/type-pins/auth-model-narrowing.pin.ts`,
  `apps/api/src/prisma/prisma.service.ts`, `packages/db/src/health.ts`,
  `packages/db/src/tenant-context.ts` (kısmi), `packages/db/src/catalog-snapshot.ts` (kısmi),
  `apps/api/src/errors/describe-error-cause.ts`,
  `apps/api/src/health/checks/database.health-check.ts`,
  `apps/api/src/auth/same-origin.guard.ts` (kısmi),
  `apps/api/src/auth/auth-instance.ts` (kısmi)) + 3 test
  (`auth-delegated-origin-check.qa.test.ts`,
  `auth-secret-leak-assertion-fragility.qa.test.ts`, `helpers/auth-fixture.ts`) +
  1 yapılandırma (`apps/api/eslint.config.mjs`, grep) + 2 belge (`docs/adr/0008` **tam**,
  `docs/development.md` kısmi) + 1 kendi önceki raporum + 1 `security` tur3 raporu (kısmi).
- **`any` (üretim ve test): 0** — `**/src/**/*.ts` genelinde 0 eşleşme.
- **`@ts-ignore` / `@ts-nocheck`: 0.**
- **`@ts-expect-error`: 13** (tur 3: 10). Dağılım: `auth-model-narrowing.pin.ts` **11**
  (7 negatif pin fonksiyonu), `client-options.pin.ts:45` 1,
  `__tests__/prisma-with-tenant.test.ts:111` 1. **Hata susturma: 0.**
- **Pin sayımı:** **2 pozitif** (`:77`, `:98`) · **7 negatif** (`:120`, `:142`, `:156`,
  `:168`, `:177`, `:198`, `:209`) · **2 jenerik kapalı-dünya** (`:264`, `:298`).
  Handoff'un "2 pozitif · 7 negatif · 2 jenerik" sayımı **doğrulandı**.
- **Allowlist üyeleri ve ölçülen üretim çağrısı:** `tenant` **2 üretim çağrı noktası**
  (`tenant-resolver.service.ts:168`, `:181`; handoff'un "32" sayısı test dahil toplam
  olmalı) · `user` **1** (`auth-context.middleware.ts:70`) · `$queryRaw` **1 dolaylı yol**
  (`database.health-check.ts:23` → `health.ts:48`) · `tenantMembership` **0** (yalnızca
  `__tests__/prisma-with-tenant.test.ts:86`) → L4-3.
- **En büyük fonksiyon: 123 satır** — `auth-instance.ts:305-427` `createAuthInstance`
  (tur 3 ile **aynı**, ≈%90 yapılandırma literali). **En büyük mantık fonksiyonu: 77 satır** —
  `rate-limit.guard.ts:162-238` `canActivate` (dört turdur değişmedi).
- **`auth-instance.ts`: 427 satır** (156 → 324 → 428 → **427**); dosya başı yorumu
  `:1-121` = **%28,3** (tur 3: %28,5). FIX 3 bu dosyaya **dokunmadı**.
- **`packages/db/src/client.ts`: 195 satır**, bunun `:54-179`'u (≈%65) tip doc'u —
  mekanizma tarihçesi burada **tek yerde** toplanmış (doğru karar; L-6 sınıfının tersi).
- **Belge-kod sapması sayacı: 12 → 14** (bu turda 2 yeni: `prisma.service.ts`,
  `health.ts`; ayrıca ADR/runbook kalemleri M4-1/M4-2/L4-5/L4-6/L4-7).
- **Tekrarlanan saf fonksiyon kopyası:** `toLoggableError` **2** (L-8, önceden var olan) ·
  `AggregateError` **yorumu 6 kopya** (L-6, değişmedi) · kayıt→doğrula→giriş akışı
  **1 → 3 kaçınılabilir kopya** (L4-9).
- **`lint` / `typecheck` / `test` / `test:isolation` / `build` / `format:check`:**
  **ölçülemedi (araç yok).** Orkestratörün bildirdiği 15/15 · 15/15 · **517/517** · 15/15 ·
  12/12 · temiz değerlerini **kendim doğrulamadım**.
- **Bu raporun kendi `format:check` durumu: ölçülemedi (araç yok).** Tur 3'te olduğu gibi
  markdown tablosu kullanmaktan **bilerek kaçındım** (prettier'ın tablo hizalaması elle
  yazılamaz).

---

## 9. Son söz

Dört turun yargısı: **kod kazandı, kayıt geride kaldı.** `Pick<>` geçişi bu Task'ın en
olgun kararı — beş turda beş kez atlatılan bir mekanizmayı altıncı jetonla değil **sınıf
değiştirerek** kapattı, jenerik pini gerçekten yazdı ve hata mesajını okunabilir bıraktı.
Tur 3'ün iki belge medium'unun **asıl iddiaları kapandı**: ADR artık `Pick`'i anlatıyor,
runbook artık gerçekleşen davranışı yazıyor.

Ama bu turun iki `medium`'u aynı cümlenin iki yarısı: **mekanizmayı değiştirirken onu
anlatan her yeri değiştirmedik.** ADR'nin normatif özeti ve ileriye dönük talimatları hâlâ
`Omit` diyor — yani belgenin **bağlayıcı kuralı** ile **tavsiyesi** birbirine zıt; ve M-2'yi
kapatmak için yazılan yeni log tablosu, **kendi notunun** söylediğinin tersini iddia ediyor.
İkisi de ~10 satırlık belge düzeltmesi ve **commit öncesi** yapılmalı. Bu sürümün riski
koddaki bir açık değil — beş yıl sonra bu repoyu açan birinin **hangi cümleye inanacağını
bilememesi**.
