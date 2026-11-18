# T-021 — GATE: `solid` · Tur 2 (DAR kapsam)

- Tarih: 2026-11-16
- Sürüm: ROADMAP v0.0.20 (süper admin iskeleti)
- Ajan: `solid` (Kod Kalitesi)
- Araçlar: `Read` / `Grep` / `Glob` (⚠ `Bash` yok — hiçbir komut koşturulmadı,
  hiçbir dosya değiştirilmedi)
- Kapsam: **DAR** — tur 1'in kendi bulgularının kapanışı + tur 1'den **sonra
  doğan üç kalıcı altyapı dosyasının** kalite ekseni. **Yeni genel tarama
  YAPILMADI.**

```
GATE: solid
SONUÇ: PASS
BULGULAR: 0 critical · 0 high · 0 medium · 7 low
```

**FAIL kuralı uygulaması (AGENT_BASELINE §4):** `critical`/`high` **yok**,
`medium` **yok** ⇒ **PASS**. Yedi `low`'un tamamı **borçtur, düzeltme turu
AÇMAZ** (§4, "Bulgunun sonucu ne olur"). Borç satırlarının metni §6'da
`docs`'un kopyalayabileceği biçimde hazır.

---

## 1. TUR 1'İN İKİ `medium`'U — AYRI AYRI TEYİT

### M1 — `ensureSignInRecorded` idempotency işareti ⇒ **KAPANDI** ✅

**Kod teyidi (elle okundu):** `apps/api/src/platform/impersonation.service.ts`
— `await this.writeAuditRow({...})` **:181-188**, `this.#recordedSignInSessionIds.add(entry.sessionId)`
**:190**. Erken dönüş (`:160-162`) aynen duruyor. ⇒ Tur 1'in istediği **tek
satırlık** taşıma **birebir** yapılmış.

**Testin gerçekten ayırt edici olduğunu kod okumasıyla doğruladım**
(`apps/api/src/__tests__/platform-impersonation-audit-count.test.ts:213-253`):

| Sıra                          | DÜZELTME ÖNCESİ (`add` önde)                         | DÜZELTME SONRASI (`add` arkada)              |
| ----------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| Çağrı 1 (`create` FIRLAR)     | `has`=false → `add` → `create` fırlar                | `has`=false → `create` fırlar, `add` **YOK** |
| Çağrı 2 (retry, aynı session) | `has`=**true** → **erken dönüş**, `create` ÇAĞRILMAZ | `has`=false → `create` **BAŞARILI** → `add`  |
| `create` toplam               | **1**                                                | **2**                                        |

⇒ `:252`'nin `toHaveBeenCalledTimes(2)` iddiası düzeltme olmadan **kırmızı**
olur. `backend`'in raporladığı **1 → 2** mutasyon kanıtı, gerçek DB'deki
**0 → 1**'in doğru karşılığı — ⚠ **koşturulmadı** (`DOĞRULANAMADI`, §5).

⭐ **Aşırı-düzeltme karşıt kanıtı da var** (`:255-268`): hatasız üç çağrı ⇒
`create` **1 kez**. İdempotency **regrese olmamış**.

#### ⚠⚠ Yarış durumu **KABUL EDİLEBİLİR** — gerekçe beş ölçüme dayanıyor

Soru meşru: düzeltme, "eşzamanlı iki istek ⇒ iki satır" penceresini **açıyor**
(eskiden ikinci istek `has()`'te erken dönüyordu). Yine de kabul ediyorum:

1. **Takasın YÖNÜ doğru.** Eski hata: satır **kalıcı olarak kayboluyordu**
   (süreç ömrü boyunca). Yeni bedel: satır **fazladan bir kez yazılabiliyor**.
   Bir denetim izinde eksik satır **doğruluk deliğidir** (sürümün "her platform
   erişimi yapısal olarak iz bırakır" hedefi düşer); fazla satır **görünür ve
   zararsızdır** (denetçi erişimi görür, iki kez). Sessiz kaybı nadir bir
   kopyayla takas etmek **doğru yön**.
2. **Yarış penceresi bu sürümün rutin arayüz yolundan ERİŞİLEMİYOR** (ölçtüm):
   iki korumalı prosedür **iki ayrı rotada** yaşıyor —
   `tenantListQueryOptions` (`apps/superadmin/src/api/tenant-list-query.ts:13`)
   → `TenantListView.tsx:34` → rota `_app.index.tsx`;
   `auditLogQueryOptions` (`apps/superadmin/src/api/audit-log-query.ts:13`)
   → `AuditLogView.tsx:27` → rota `_app.denetim-kaydi.tsx`. Bir sayfada
   **tek** korumalı sorgu mount olur, anahtarlar ayrı
   (`['platform','tenantList']` / `['platform','auditLog']`) ve TanStack
   anahtar bazında **tekilleştirir**. `platform.session` ise `protectedProcedure`
   (`platform.router.ts:51`) ⇒ **hiç yazmaz**. Yarışa ulaşmak için aynı
   oturumda **iki sekmenin iki farklı rotada neredeyse aynı anda** açılması
   gerekir.
3. **Mevcut hiçbir kesin-sayım iddiasını flaky YAPMIYOR.**
   `platform-impersonation-audit-count.test.ts`'in **her** çağrı yeri sırayla
   `await` ediliyor (`:152-169`, `:177-182`, `:263-265`); dosyada `Promise.all`
   **yok** (mekanik tarama). Playwright de sayfalar arasında **sırayla**
   gezinir ⇒ AC-8'in "öncesi + 2" değişmezi korunur.
4. **ADR-0023 aynı YÖNDEKİ bedeli zaten YAZILI olarak kabul ediyor**
   ("süreç restart/çoklu instance'ta en fazla bir ek satır"). Yeni pencere
   **yeni bir bedel sınıfı açmıyor**, mevcut sınıfı genişletiyor.
5. **Bedel kaynakta ve vadeli** (`impersonation.service.ts:173-180`): kalıcı,
   DB tabanlı (`sessionId` kolonlu) idempotency v0.15.0'a not düşülmüş.

⇒ **M1 için yeni bulgu YAZMIYORUM.** (Yorumun _biçimi_ hakkında bir `low` var:
**L7**.)

### M2 — Mailpit dördüncü kopya ⇒ **KAPANDI** ✅

**Mekanik teyit (`Grep`, repo kökü açık `path` ile, `node_modules` hariç —
AGENT_BASELINE §4 dersi 4):**

| Ölçüm                              | Tur 1 | Tur 2 | Teyit                                                                                                                                                                                                              |
| ---------------------------------- | ----- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `findVerificationToken` **tanımı** | 4     | **1** | `scripts/playwright/mailpit.ts:113`                                                                                                                                                                                |
| ... **ithal eden** çağıran         | 0     | **4** | `apps/admin/e2e/helpers/verified-fixture-user.ts:32` · `apps/admin/e2e/panel-flow.spec.ts:34` · `apps/admin/e2e/session-security-dialog-focus.qa.spec.ts:64` · `apps/superadmin/e2e/fixtures/platform-admin.ts:70` |
| `MAILPIT_BASE_URL` **tanımı**      | 5     | **2** | `scripts/playwright/mailpit.ts:105` + `apps/api/src/__tests__/helpers/mailpit-client.ts:20` (**bilerek ayrı** Vitest yardımcısı, gerekçesi `mailpit.ts:41-45`)                                                     |

⇒ Tur 1'in talebi (**gövde `scripts/playwright/`'e taşınsın, dört çağıran
ithal etsin**) **tam** karşılanmış. ⭐ Taşıma **kapsamı aşmamış**: dosya
yalnızca "doğrulama bağlantısının token'ını oku" sorumluluğunu taşıyor, dört
çağıranın kendi `sign-up`/`sign-in` zinciri **yerinde kalmış** — farklı
sebeplerle değişecek şeyler **birleştirilmemiş** (doğru DRY sınırı).
⭐ `label` parametresinin **eklenmemesi** de doğru: dört kopyanın hata metinleri
birebir aynıydı, `sql.ts`'in "çağıran kendi önekini verir" deseni burada
**gereksiz genelleme** olurdu (KISS).

#### ⚠⚠ K1(d)-benzeri kapı EKLENMEMESİ — gerekçeyi **DEĞERLENDİRDİM**

**Sonuç: kabul ediyorum — ama `devops`'un yazdığı gerekçenin TAŞIYICI ayağı
yazdığı üç ayak DEĞİL.**

`devops`'un (a)/(b)/(c) ayakları (salt okuma · dev-only hedef · düz `fetch` ⇒
enjeksiyon yüzeyi yok) **doğru**, ama **M2'nin sormadığı** bir soruyu
cevaplıyor: M2 bir **güvenlik** bulgusu değildi, `ROADMAP:3267`/R4
kalibrasyonuna dayanan bir **tekrar (DRY)** bulgusuydu. K1(d)'nin koruduğu şey
"ayrıcalıklı yazma yolunun `apps/*/src/**`'e sızması"; M2'nin istediği koruma
"**beşinci bir kopyanın doğması**". Bunlar **farklı mekanizmalar** — birini
çürütmek diğerini kapatmaz.

Gerekçeyi yine de **yeterli** buluyorum, iki **kendi ölçümüme** dayanarak:

1. **Yineleme olasılığı yapısal olarak düştü.** Kopyalar dört kez doğdu çünkü
   **ev yoktu**. Bugün `scripts/playwright/` dört yardımcı taşıyor
   (`sql.ts`/`totp.ts`/`base.ts`/`mailpit.ts`) ⇒ konvansiyon **görünür**, ve
   "başkaları doğrulama e-postasını nasıl okuyor?" diye arayan geliştirici artık
   **tek tanım** + dört ithal görüyor (yukarıdaki tablo), dört rakip gövde değil.
2. **Kopya-tespit kapısı KISS ekseninde net kazanç DEĞİL.** Böyle bir kapının
   `apps/api/src/__tests__/helpers/mailpit-client.ts`'i (**meşru, yazılı
   gerekçeli** istisna) allowlist'e alması **zorunlu** olurdu ⇒ kapının kendisi
   bir istisna listesi doğurur. Kendi kontrol listemin 6. maddesi (gereksiz
   karmaşıklık) burada **kapının aleyhine** işliyor.

⇒ **Kapı eksikliği için bulgu YAZMIYORUM**; ⚠ gerekçenin **çerçevelemesi** için
bir `low` yazıyorum (**L6**) — beş yıl sonra o yorumu okuyan kişi "tekrar riski
incelenip reddedilmiş" sanmamalı; reddedilen şey **enjeksiyon riskiydi**,
tekrar riski **borca yazıldı**.

---

## 2. TUR 1'İN ON `low`'U — İSTENEN İKİ TEYİT

### L3/L4 (bayat yorumlar) — ⚠ **İKİSİ DE HÂLÂ BAYAT**, ikisi de duruyor

| Tur 1 | Dosya:satır                                            | Bugünkü metin                                                   | Çelişen gerçek                                                                                                                        |
| ----- | ------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| L1    | `packages/trpc/src/routers/platform.router.ts:28-32`   | "`AUTH_EXEMPT_PATHS`/`TENANT_EXEMPT_PATHS`'E EKLENMEZ"          | Üç yol `tenant-exempt-paths.ts`'te **var** (24→27); yorumun `AUTH_` yarısı doğru                                                      |
| L2    | `packages/trpc/src/schemas/platform.schema.ts:128-131` | "`platform.session`'ın girişi `platform_admin_signed_in` yazar" | `platform.session` **hiç yazmaz** (`impersonation.service.ts:130-148`); satırı `platform-admin-read.port.adapter.ts:33-45` yolu yazar |

⇒ **İki satır da duruyor.** `S11 docs`'un devri **ikisini de** kapsamalı.
`low` oldukları için bu gate **tur açmıyor** (§4).

### L10 (dual-markup) — `TenantListView.tsx` **ETKİLENMEDİ** ✅

`Sidebar.tsx` iki kez değişti (FIX 1 + FIX 2) ama
`apps/superadmin/src/features/tenants/TenantListView.tsx` **dokunulmamış**:
aynı beş alan hâlâ **iki kez** projekte ediliyor — `DataTable` yolunda
`:78-95` (`name`/`slug`/`plan`/`status`/`createdAt`), `<ul>` yolunda
`:104-135` (`:111`, `:125`, `:128`, `:121`, `:131`); `planName ?? …` **iki**
yerde (`:81`, `:128`), `formatPlatformDate` **iki** yerde (`:94`, `:131`).
⇒ Tur 1'in `low` borcu **aynen geçerli**, yan etki **yok**.

---

## 3. ÜÇ YENİ DOSYA — KALİTE EKSENİ (sorulan üç sorunun cevabı)

### ① `scripts/e2e-env-passthrough-check.ts` — **385 satır MAKUL** ✅ (bir çekinceyle)

**Cevap: evet, karmaşıklık/koruma dengesi doğru.** Gerekçe:

- **Gerçek kod ≈ 250 satır** (`:61-385`); kalan ~60 satır dosya başı gerekçesi.
- **Üç ölçülmüş kaçırma** var (`:12-19`: T-020/S9c, T-021/S10, T-021 FIX 2).
  Üç kez kaçıran elle bir tarama, mekanikleştirmeyi **hak eder**.
- **Erken soyutlama YOK** (kontrol listem md. 6): factory yok, eklenti arayüzü
  yok, yapılandırma dosyası yok, tek kullanımlık sarmalayıcı yok. Düz dosya,
  altı fonksiyon, tek amaç, tek `TARGET_TASK` sabiti (`:68`). **KISS'i geçiyor.**
- **Reddedilen alternatif yazılı ve doğru** (`:35-39`): TypeScript Compiler API
  ile tip akışı takibi ⇒ yeni ana bağımlılık ⇒ Orkestratör onayı (CLAUDE.md §2).
  Kapsamı aşmamak **doğru karar**.
- **Fail-closed refleksi var** (`:355-359`): şemada `z.object` bulunamazsa kapı
  "doğrulanamadı ⇒ ihlal" diyor. ⭐ Bu, kendi kör noktasını **sessiz yeşile**
  değil **kırmızıya** çeviren doğru tasarım.
- **`devops` kendi kapısını negatif test etmiş ve kör nokta bulmuş** (`:106-118`:
  `turbo.json`'dan `STOREFRONT_API_BASE_URL` elle silindiğinde kapı **yeşil
  kaldı**) ⇒ (B) dalı, bu turda **gerçekten olan** bug'ın tek koruyucusu.
  Satır başına en zayıf parça aynı zamanda **tek gerçek kanıtı olan** parça.

**Çekince (⇒ L2):** `extractZodObjectKeys` (`:128-145`) tek bir non-greedy
regex'le **ilk** `z.object({…})`'i yakalıyor. Şema iç içe bir `z.object`
kazanırsa gövde **erken kapanır** ve fonksiyon **kısmi** bir anahtar kümesi
döner — fail-closed dalı **yalnızca sıfır** anahtarı yakalar, **kısmiyi
yakalamaz** ⇒ kapı sessizce **yarı kör** olur. Bugün tetiklenmiyor: hedef şema
(`apps/storefront/src/lib/storefront-env-schema.ts:29-32`) **düz ve iki alanlı**,
dosyada **tek** `z.object` var (okudum).

### ② `scripts/playwright/mailpit.ts` — **temiz** ✅ (tek `low`: dead export)

Tek sorumluluk net, tip guard'lar `unknown` + daraltma, hatalar yutulmuyor
(dört ayrı `throw`, sessiz boş dönüş **yok** — `:130`, `:135`, `:140`, `:152`),
yorumlar Türkçe ve *neden*i anlatıyor, isimlendirme kurallı. `any` **0**,
`@ts-ignore` **0**. Gövde taşınan kodla bayt-eşit olduğu için `as Record<string,
unknown>` idiyomu (`:91`, `:98`) **bu turun regresyonu değil** ⇒ bulgu yazmadım.
⚠ Tek yeni kusur: `MAILPIT_BASE_URL` **export edilmiş ama dışarıda sıfır
tüketicisi var** (**L1**).

### ③ `apps/superadmin/src/__tests__/Sidebar.test.ts` — **BİÇİM KABUL EDİLEBİLİR** ✅ (koşullu)

**Cevap: evet — `fs.readFileSync` + regex ile kaynak metni üzerinde drift testi
bu bağlamda kabul edilebilir.** Dört gerekçe:

1. **Kısıt gerçek ve yazılı:** paketin Vitest kararı `environment: 'node'`
   (DOM yok), `jsdom`/`@testing-library/react` **yeni bağımlılık yasağına**
   takılıyor, `apps/superadmin/e2e/**` bu turda dokunulamaz — T-008/S4'ün
   yazılı kararı. Kaynak-metin pini **ilk tercih değil, son çare** olarak
   seçilmiş ve bu **dosyada belgelenmiş** (`:4-23`).
2. **Davranış ayrıca ve DÜZGÜN test ediliyor:** `closeMobileNavAndRestoreFocus`
   saf fonksiyona ayrıştırılmış (`Sidebar.tsx:72-78`) ve `:39-47` (çağrıldı mı)
   - `:81-93` (**sıra garantisi**, `callOrder` ile) gerçek davranışı ölçüyor.
     Regex testi **davranışın yerine geçmiyor**, bir **kararı** (tek çağrı noktası)
     pinliyor.
3. **İki sayımı da gerçek kaynağa karşı elle doğruladım — ikisi de DOĞRU:**
   `closeMobileNavAndRestoreFocus(setIsMobileNavOpen,` ⇒ `Sidebar.tsx:98`'de
   **1** eşleşme; tanım (`:72`, parametre `setIsOpen`, ayrı satır) **eşleşmiyor**
   (testin `:58-62` gerekçesi doğru). `/^\s*setIsMobileNavOpen\(false\)\s*$/gm`
   ⇒ `:145` ve `:161` = **2**; `:117`'deki `setIsMobileNavOpen((previous) => …)`
   eşleşmiyor, dosya başı yorumlarındaki (`:14`, `:30`) aynı metin `//` ile
   başladığı için eşleşmiyor (testin `:68-74` gerekçesi doğru).
4. **Gerçekçi regresyon biçimi YAKALANIYOR:** ölü çağrı link dalına geri
   gelirse Prettier onu her iki girinti seviyesinde de tek satırda tutar
   (`closeMobileNavAndRestoreFocus(setIsMobileNavOpen, () => {` ≈ 62 karakter,
   100'ün altında) ⇒ sayım 1→2 olur ve test **kırmızıya** düşer. Hata modu
   **sessiz yeşil değil, gürültülü kırmızı**.

**Koşullar (⇒ L5):** dördüncü test (`:95-107`) **birinciyle gereksiz yere
örtüşüyor** ve adı testi **yanlış tanıtıyor** — "negatif kanıt deseni" diyor
ama negatif senaryo **yok**; iddiası (`toBeGreaterThan(0)`) birinci testin
`toHaveBeenCalledOnce()`'ından **kesin olarak daha zayıf** ⇒ sıfır ek kapsam.

---

## 4. BULGULAR

### low

- **[SEV: low] `scripts/playwright/mailpit.ts:105`** — `MAILPIT_BASE_URL`
  `export` edilmiş ama **modül dışında sıfır tüketicisi** var. Mekanik tarama
  (repo kökü, `node_modules` hariç): jeton yalnızca **kendi dosyasında**
  (`:117`, `:126`) ve **ayrı** bir sabit olarak `apps/api/src/__tests__/helpers/mailpit-client.ts:20`'de
  geçiyor; dört e2e çağıranın **hiçbiri** ithal etmiyor (yalnızca
  `findVerificationToken`'ı alıyorlar). ⚠ Bu, projenin **kendi reddettiği**
  desen ve tur 1'in **L3**'üyle aynı sınıf ("ölü sözlük, ölü iznin kardeşidir",
  `schema.prisma:995-999`; architect'in "tüketici 0 ⇒ red" muhasebesi).
  **Düzeltme:** `export` anahtar sözcüğünü kaldır (modül-yerel `const` yap) —
  bir tüketici doğduğunda geri eklemek tek kelime. **Sorumlu:** `devops`.
  **Vade:** v0.0.20.1.

- **[SEV: low] `scripts/e2e-env-passthrough-check.ts:128-145`** —
  `extractZodObjectKeys` **kısmi** anahtar kümesi dönebilir ve bu **sessizdir**.
  `:130`'daki `/z\.object\(\s*\{([\s\S]*?)\}\s*\)/` non-greedy'dir: şema iç içe
  bir `z.object({…})` (veya `}` içeren herhangi bir alan) kazanırsa gövde **ilk**
  `})`'de kapanır ve o noktadan **sonraki alanlar hiç çıkarılmaz** ⇒ o anahtarlar
  `allowed` kümesine karşı **hiç denetlenmez**. Fail-closed dalı (`:355-359`)
  yalnızca **sıfır** anahtarı yakalar; **kısmi**yi yakalamaz. Ayrıca regex
  dosyadaki **ilk** `z.object`'i alır — şema dosyası ikinci bir şema kazanırsa
  **yanlış** nesne okunur. ⚠ Bu, kapının **var olma sebebiyle aynı sınıf** bir
  kör nokta (sessizce eksik denetim). Bugün tetiklenmiyor:
  `storefront-env-schema.ts:29-32` düz, iki alanlı, dosyada tek `z.object`
  (okundu).
  **Mutasyon tarifi (kanıt için):** `storefront-env-schema.ts`'in şemasına
  `APP_BASE_DOMAIN`'den **sonra** iç içe bir alan ekle
  (`NESTED: z.object({ X: z.string() }),`) ve ardına yeni bir üst seviye alan
  (`ZZZ_NEW_VAR: z.string(),`) koy; `turbo.json`'a `ZZZ_NEW_VAR`'ı **EKLEME** →
  `node scripts/e2e-env-passthrough-check.ts` ⇒ **beklenen (bugünkü, hatalı)
  sonuç:** çıkış kodu **0** (yeşil, ihlal bildirilmez); **istenen sonuç:**
  çıkış kodu **1**.
  **Düzeltme:** çıkarılan anahtar sayısını şemadaki üst seviye alan sayısıyla
  karşılaştır (uyuşmazlık ⇒ ihlal), veya gövde içinde dengelenmemiş `{` görülürse
  fail-closed düş. **Sorumlu:** `devops`. **Vade:** v0.0.20.1.

- **[SEV: low] `scripts/e2e-env-passthrough-check.ts:167-168`** — **belgelenmemiş
  üçüncü kör nokta:** küçük/karışık harfli ortam değişkeni okumaları **her iki
  regex'e de görünmez**. `NAMED_ENV_PATTERN` yalnızca `[A-Z0-9_]+` kabul eder
  (`process.env.npm_lifecycle_event` eşleşmez), `BARE_ENV_PATTERN`'in
  `(?!\.\w|\[)` negatif ileri-bakışı ise **aynı** okumayı dışlar ⇒ ne (A) ne (B)
  dalına düşer, **sessizce yok sayılır**. ⚠ Dosya başı (`:21-59`) kör noktaları
  **titizlikle** sayıyor (bütün-nesne geçişi, satır-içi `//` sınırı) — bu üçüncüsü
  **listede yok**, dolayısıyla okuyan kişi kapsamı **olduğundan geniş** sanır.
  Bugün ihlal **üretmiyor** (bu projede env adları SCREAMING_SNAKE_CASE,
  CLAUDE.md §4). **Düzeltme:** ya deseni `[A-Za-z0-9_]+`'e genişlet, ya da kör
  noktayı dosya başı listesine **yaz**. **Sorumlu:** `devops`. **Vade:** v0.0.22.

- **[SEV: low] `scripts/e2e-env-passthrough-check.ts:205-206`** — runtime
  doğrulaması **olmayan** çift `as` zorlaması:
  `(entry as unknown as { parentPath?: string; path?: string }).parentPath` ve
  aynı satır grubunda ikinci bir `as unknown as { path?: string }`. CLAUDE.md §2:
  "`as` ile tip zorlama yalnızca runtime doğrulamasından hemen sonra kabul
  edilir." ⭐ Aynı dosyanın `:277` ve `:291`'deki `as Record<string, unknown>`
  kullanımları **gerçek runtime kontrolünden sonra** geliyor (`typeof … !==
'object' || … === null`) ⇒ **onlar kurallı**; sorun yalnızca `:205-206`'da.
  Etki sınırlı (yanlış yol ⇒ `readFileSync` **gürültülü** fırlatır), ama
  `as unknown as` tam olarak tip denetleyicisini **devre dışı bırakan** biçim.
  **Düzeltme:** `'parentPath' in entry && typeof entry.parentPath === 'string'`
  ile daralt — Node sürüm farkı da **runtime'da** çözülmüş olur.
  **Sorumlu:** `devops`. **Vade:** v0.0.20.1.

- **[SEV: low] `apps/superadmin/src/__tests__/Sidebar.test.ts:95-107`** —
  dördüncü test **birinciyle örtüşüyor** ve **adı yanlış**. İddiası
  `expect(focusToggle.mock.calls.length).toBeGreaterThan(0)`; aynı sözleşmeyi
  `:45-46` zaten **daha kesin** biçimde doğruluyor
  (`toHaveBeenCalledExactlyOnceWith(false)` + `toHaveBeenCalledOnce()`) ⇒ bu test
  **sıfır ek kapsam** sağlıyor (birinci test kırmızı olmadan bu test asla kırmızı
  olamaz). ⚠ Adı "negatif kanıt deseni" diyor ama dosyada **negatif senaryo yok**;
  yorumu (`:96-98`) **başka bir yerde** (handoff'ta, elle) yapılmış bir mutasyon
  koşumuna atıf veriyor — yani ad ve yorum, testin **yapmadığı** bir şeyi vaat
  ediyor. Beş yıl sonra okuyan kişi burada bir güvence olduğunu **sanar**.
  **Düzeltme:** testi **kaldır** (birinci test sözleşmeyi zaten taşıyor), veya
  gerçekten negatif yap (ör. `focusToggle` fırlatırsa `setIsOpen`'in **yine de**
  çağrılmış olduğu). **Sorumlu:** `frontend`. **Vade:** v0.0.20.1.

- **[SEV: low] `scripts/playwright/mailpit.ts:47-71`** — kapı eklenmeme
  gerekçesi **sorulmayan soruyu** cevaplıyor. Üç ayak ((a) salt okuma,
  (b) dev-only hedef, (c) düz `fetch` ⇒ enjeksiyon yüzeyi yok) **enjeksiyon/
  ayrıcalıklı-yazma** riskini çürütüyor; oysa M2 bir **güvenlik** bulgusu
  değildi, `ROADMAP:3267`/R4 kalibrasyonuna dayanan bir **tekrar** bulgusuydu
  (beşinci kopyanın doğması). Taşıyıcı cümle — "üçüncü bir Mailpit kopyası
  doğarsa bunu yakalayacak mekanik bir kapı YOK" (`:67-71`) — 25 satırlık
  gerekçenin **sonuna** gömülmüş. ⚠ Risk: beş yıl sonra okuyan kişi "tekrar
  riski incelenip **reddedilmiş**" sonucunu çıkarır; oysa reddedilen
  **enjeksiyon** riskiydi, tekrar riski **borca yazıldı**.
  **Düzeltme:** yorumu iki başlığa ayır — "K1(d) burada gerekmez **çünkü
  enjeksiyon yüzeyi yok**" ve "**tekrar** riski: mekanik kapı yok, borç
  kayıtlı"; ikincisinin en ucuz biçimini de yaz (tanım **sayısı** iddiası:
  `findVerificationToken` tanımı **tam 1** + `apps/api` yardımcısı istisnası —
  K1(d)'nin konum/jeton kapısıyla **aynı şey değil**).
  **Sorumlu:** `docs` (S11) + `devops`. **Vade:** v0.0.22.

- **[SEV: low] `apps/api/src/platform/impersonation.service.ts:164-180` ·
  `apps/superadmin/src/components/Sidebar.tsx:9-31` ·
  `scripts/playwright/mailpit.ts:1-71`** — **gate turu tarihçesi üretim
  dosyalarının başlıklarında birikiyor.** Üç örnek: 10 satırlık bir fonksiyonun
  üstünde **17 satır** düzeltme anlatısı (`impersonation.service.ts`, "ÖNCEDEN
  … çağrılıyordu"); bir bileşen başlığında **iki ayrı** "DÜZELTME (… FIX turu
  …)" bloğu (`Sidebar.tsx:9`, `:21`); **80 satırlık** bir yardımcının üstünde
  **71 satır** başlık (`mailpit.ts`). ⚠ Kontrol listemin 12. maddesi: yorum
  *neden*i anlatmalı. Bu blokların **neden** kısmı (kabul edilen bedel, reddedilen
  alternatif, vade) **kalmalı** — ör. `impersonation.service.ts:173-180`'in yarış
  bedeli **taşıyıcıdır**. Ama **"eskiden şöyleydi"** kısmı beş yıl sonra
  **gürültüdür**: o bilgi git geçmişinde ve `docs/gates/` raporlarında zaten
  kalıcı. ⚠ Bu bir stil tartışması **değil**, ölçülebilir bir eğilim: tarihçe
  her turda **büyüyor** ve asla küçülmüyor.
  **Düzeltme:** düzeltme anlatılarını _"Bedel: … · Alternatif X reddedildi çünkü
  … · Vade: v0.15.0"_ biçimine sıkıştır; tur/vaka anlatısını gate raporuna
  (`docs/gates/T-021-*.md`) bırak, kaynakta **atıf** ver.
  **Sorumlu:** `docs` (S11). **Vade:** v0.0.22.

---

## 5. ÖLÇÜMLER

- **İncelenen dosya:** **11** (tam veya hedefli bölüm) —
  `apps/api/src/platform/impersonation.service.ts:90-209` ·
  `apps/api/src/platform/platform-admin-read.port.adapter.ts` (tam) ·
  `apps/api/src/__tests__/platform-impersonation-audit-count.test.ts` (tam) ·
  `packages/trpc/src/routers/platform.router.ts` (tam) ·
  `packages/trpc/src/schemas/platform.schema.ts:115-182` ·
  `scripts/e2e-env-passthrough-check.ts` (tam, 385) ·
  `scripts/playwright/mailpit.ts` (tam, 153) ·
  `apps/superadmin/src/__tests__/Sidebar.test.ts` (tam, 108) ·
  `apps/superadmin/src/components/Sidebar.tsx` (tam, 170) ·
  `apps/superadmin/src/features/tenants/TenantListView.tsx:60-139` ·
  `apps/storefront/src/lib/storefront-env-schema.ts` (tam).
- **Mekanik tarama:** **4** (`Grep`/`Glob`, hepsi **açık `path`** ile —
  AGENT_BASELINE §4 dersi 4): Mailpit jetonları (repo kökü, `node_modules`
  hariç) · `apps/superadmin/src` içinde `tenantList`/`auditLog`/`useQuery`/
  `httpBatchLink` · `apps/api/src/platform` test taraması (**0 sonuç** — testler
  `apps/api/src/__tests__/`'te, `Glob` ile bulundu; ⚠ "sonuç yok ≠ bulgu yok"
  dersi burada **ikinci kez** işe yaradı) · `**/*platform*{test,spec}*.ts`.
- **`any` sayısı:** üç yeni dosyada **0**. `@ts-ignore`/`@ts-expect-error`:
  **0**. `eslint-disable`: **0**.
- **Doğrulanmamış `as` zorlaması:** **2** (ikisi de
  `e2e-env-passthrough-check.ts:205-206`, ⇒ **L4**). Kurallı `as` (runtime
  kontrolünden sonra): `:277`, `:291`. Test double `as unknown as PrismaService`
  (`platform-impersonation-audit-count.test.ts:45`) — `auth-guard-two-factor-
enforcement.test.ts`'in **yerleşik** emsali, bulgu **değil**.
- **En büyük fonksiyon (yeni dosyalarda):** `e2e-env-passthrough-check.ts:304-383`
  (`main`) → **80 satır**. İkinci: `:253-302` (`parseTurboJson`) → **50** ·
  `mailpit.ts:113-153` (`findVerificationToken`) → **41** ·
  `:216-250` (`scan`) → **35**. ⭐ `main`'in 80 satırı **bulgu değil**: tespit +
  raporlama bir CLI script'inde idiyomatik tek birimdir, iç içe **iki** döngü
  ve **tek** ihlal listesi taşıyor (erken soyutlama yok).
- **`DOĞRULANAMADI`:**
  - **Hiçbir komut koşturulmadı** (`Bash` aracı yok) ⇒ bu raporun **tüm**
    sonuçları **statik okuma**. `pnpm guards`'ın 19. adımının bugün **yeşil**
    olduğunu, `pnpm test`'in M1 testlerini **geçtiğini** ve `backend`'in
    **1 → 2** mutasyon koşumunu bu gate **teyit etmedi** — M1 için yazdığım
    teyit, testin **ayırt edici olduğunun kod okumasıyla** türetilmesidir
    (§1 tablosu), koşum kanıtı değildir.
  - **L2'nin negatif kanıtı** koşturulamadı — mutasyon tarifi §4'te yazılı.
  - **Prettier biçimlendirme varsayımı** (§3③ madde 4: ölü çağrı geri gelirse
    tek satırda kalır ⇒ regex yakalar) **koşturularak** doğrulanmadı; satır
    uzunluğu **elle** sayıldı (≈62 < 100).
  - **Yarış durumunun kendisi üretilmedi** (eşzamanlı iki istek). §1'deki
    "rutin yoldan erişilemez" sonucu **kod okumasından** türetildi
    (iki rota, iki query anahtarı, `Promise.all` yokluğu), **yük altında
    ölçülmedi**.
  - ⚠ **Bu raporda `prettier --write` çalıştırılamadı** (`Bash` yok) —
    AGENT_BASELINE §5 gereği biçimlendirmeyi **Orkestratör** kapatır.

---

## 6. TEKNİK BORÇ SATIRLARI (`docs`/`S11` kopyalayabilir)

| SEV | Dosya:satır                                                                 | Açıklama                                                                                                      | Sorumlu       | Vade      |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------- | --------- |
| low | `scripts/playwright/mailpit.ts:105`                                         | `MAILPIT_BASE_URL` export edilmiş, modül dışında **sıfır** tüketici (ölü export)                              | devops        | v0.0.20.1 |
| low | `scripts/e2e-env-passthrough-check.ts:128-145`                              | `extractZodObjectKeys` iç içe/ikinci `z.object`'te **kısmi** küme döner — fail-closed yalnızca sıfırı yakalar | devops        | v0.0.20.1 |
| low | `scripts/e2e-env-passthrough-check.ts:167-168`                              | Küçük harfli env okumaları **her iki** regex'e de görünmez; kör nokta dosya başı listesinde **yok**           | devops        | v0.0.22   |
| low | `scripts/e2e-env-passthrough-check.ts:205-206`                              | Runtime doğrulaması olmayan çift `as unknown as` zorlaması (CLAUDE.md §2)                                     | devops        | v0.0.20.1 |
| low | `apps/superadmin/src/__tests__/Sidebar.test.ts:95-107`                      | Dördüncü test birinciyle örtüşüyor, iddiası daha zayıf, adı ("negatif kanıt") testi yanlış tanıtıyor          | frontend      | v0.0.20.1 |
| low | `scripts/playwright/mailpit.ts:47-71`                                       | Kapı-yok gerekçesi **enjeksiyon** riskini çürütüyor; M2'nin sorduğu **tekrar** riski sona gömülü              | docs + devops | v0.0.22   |
| low | `impersonation.service.ts:164-180` · `Sidebar.tsx:9-31` · `mailpit.ts:1-71` | Gate turu **tarihçesi** üretim başlıklarında birikiyor; _neden_ kalmalı, "eskiden şöyleydi" gitmeli           | docs (S11)    | v0.0.22   |

⚠ **Tur 1'den devreden, hâlâ AÇIK iki `low`** (bu turda **teyit edildi**,
yeniden sayılmadı): `packages/trpc/src/routers/platform.router.ts:28-32` ve
`packages/trpc/src/schemas/platform.schema.ts:128-131` — **ikisi de hâlâ
bayat**, `S11 docs`'un devri **ikisini birden** kapsamalı. Tur 1'in diğer sekiz
`low`'u da ROADMAP borç tablosuna taşınmayı bekliyor (`docs/gates/T-021-solid-tur1.md` §6).
