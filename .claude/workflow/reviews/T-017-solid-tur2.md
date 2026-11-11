# T-017 — `solid` gate, TUR 2 (TAM yeniden denetim)

- **Tarih:** 2026-11-10
- **Sürüm:** ROADMAP v0.0.15.1 (aktif oturum listesi + step-up auth)
- **Kapsam:** TAM yeniden denetim (tur 1 FAIL → WORKFLOW [7])
- **Araç kısıtı:** Bash YOK. Tüm ölçümler `Read`/`Grep`/`Glob` ile dosya içeriği ve
  **derlenmiş `dist` çıktısı** üzerinden yapıldı. Komut gerektiren hiçbir iddia
  uydurulmadı.

```
GATE: solid
SONUÇ: PASS
```

---

## 0. Önceki turun bulgularının kapanış doğrulaması

| Bulgu               | Karar       | Kanıt (`dosya:satır`)                                                                                                                                                                                                                                                                                 |
| ------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H-1** (high)      | **KAPANDI** | `packages/db/src/__tests__/session-metadata-columns.test.ts:239-245` — `totalRows > 0` dalında **tek, doğrudan** assertion (`toBeGreaterThan(0)`); ikinci (totolojik) kaçış dalı **yok**. Gerekçe bloğu `:85-127`. Kalan "temiz DB" kaçışı **H-1'in kalıntısı DEĞİL** → ayrı bulgu **S-1** (low), §2. |
| **M-1** (medium)    | **KAPANDI** | `apps/api/src/__tests__/session-ip-not-logged.test.ts:153-154` (probe emisyonu) → `:199` (`expect(fullLogText).toContain(positivePinProbe)`) → `:205`/`:211` (iki negatif assert). Pozitif pin negatiflerden **ÖNCE** koşuyor; `LOG_LEVEL=silent` koşumunda `:199` kırmızı verir.                     |
| **M-2** (medium)    | **KAPANDI** | `apps/api/src/auth/session-summary.mapper.ts:67` — sentinel eşlemesi **tek noktada**. `sessions.service.ts:123` mapper'a devrediyor. `session-list-read.port.adapter.ts:54` ikinci dönüşüm yapmıyor. Pin: `session-summary-mapper.test.ts:40-46`. Totoloji giderildi: `session-list-read-port-adapter.test.ts:123-125`. |
| **L-1**             | **KAPANDI** | `packages/trpc/src/schemas/session-summary.schema.ts:14-18` ve `:81-84` — atıf artık `toSessionSummary()` / `session-summary.mapper.ts`.                                                                                                                                                               |
| **L-2**             | **KAPANDI** | `apps/api/src/__tests__/step-up.test.ts:142` — test adı assertion'ı (`:147-149`, `.resolves.toBeUndefined()`) doğru tarif ediyor; assertion'a dokunulmamış.                                                                                                                                            |
| **L-3**             | **KAPANDI** | `apps/admin/src/features/sessions/active-sessions-controller.ts:193` (`export const INITIAL_STATE`) ← `ActiveSessionsCard.tsx:56` (import + alias). Yerel kopya yok.                                                                                                                                   |
| **L-6**             | **KAPANDI** | `apps/api/src/auth/step-up/step-up.service.ts:18-21` — satır numarası yerine `SessionsService.revokeOwnSession()` fonksiyon adı atfı.                                                                                                                                                                  |
| **L-4 / L-5 / L-7** | BORÇ        | Bilinçli olarak dokunulmadı (tur 1 kararı). Yeniden denetimde durumları değişmemiş.                                                                                                                                                                                                                   |

### Ölçümle doğrulanan üç yardımcı iddia

1. **Döngüsel bağımlılık çalışma zamanında YOK** — `backend`'in iddiası **doğru**.
   Ölçüm: `apps/api/dist/auth/session-summary.mapper.js:28` tek `import` satırını taşır
   (`./device-label.js`); `sessions.service.js`'e **hiçbir** emit edilmiş import yok
   (`import type` silinmiş). Tip seviyesindeki kenar için → **S-6** (low).
2. **⑤ CI'da YANLIŞ KIRMIZI veremez** — `db`'nin yapısal argümanı **doğru**.
   Ölçüm: (a) `packages/db/src` içinde `session` satırı yazan **hiçbir** kod yok
   (`session.create` yalnızca yorumlarda geçiyor); (b) `packages/db/package.json:36`
   seed'i `session` tablosuna yazmıyor; (c) `apps/api/src/auth/auth-instance.ts:271-273`
   `clientIp`'i olduğu gibi döndürür → S6 sonrası kod **asla `''` yazmaz**.
   Dolayısıyla "satır var ama hepsi `''`" (tek kırmızı senaryosu) **imkânsız**.
3. **AC'nin gerçek CI pini `apps/api`'de ve vacuous DEĞİL** —
   `apps/api/src/__tests__/session-ip-and-last-seen.test.ts:147`
   (`expect(sessionRow.ipAddress).toBe(FORWARDED_TEST_IP)`) kaçış dalı olmayan, tam
   değer assertion'ı. `packages/db` ⑤'in katkısı bu nedenle **sıfır ek kapsam**.

### Çerçevelere düzeltme (handoff'un "yanlışsam söyle" daveti)

- `session-summary.mapper.ts:25-27` ve `session-summary-mapper.test.ts:10-13`
  **"üç vaka"** diyor; dosyada **beş** `it()` var (`:40`, `:48`, `:56`, `:64`, `:72`).
  Orkestratör'ün "5 vaka" ifadesi **gerçeğe uygun**, dosyaların kendi yorumu **bayat**
  → **S-5** (low).
- "`SessionSummary`'yi 3 dosya import ediyor" — ölçüm: **dört** tip tüketicisi var
  (`sessions.controller.ts:41`, `auth.tokens.ts:11`,
  `trpc/ports/session-list-read.port.adapter.ts:43`, + yeni `session-summary.mapper.ts:32`).
  Mapper hariç üç → **çerçeve doğru**.

---

## 1. ⚠⚠ H-1'in "temiz DB'de vacuous" kalıntısı — KARAR

**Karar: H-1'in kalıntısı DEĞİL. Yeni, ayrı bir `low` (S-1).**

Gerekçe (kendi tur-1 ölçütümü uygulayarak):

- Tur 1'deki kusur tanımım **"değişkenin her olası değeri için yeşil"** idi: ⑤ o
  hâlde **hiçbir ortamda** kırmızı veremezdi, oysa kendini "hook'un VARLIK KANITI" ilan
  ediyordu. Bugün `:239-245`'te **tek, doğrudan** assertion var ve satır varsa
  **kırmızı verebilir** (mutasyon kanıtı `db` tarafından gösterildi). Beyan ↔ gerçeklik
  boşluğu **kapandı**.
- Kalan dal (`:225-229`, ④'te `:202-208`) farklı bir sınıf: **koşullu atlama**. Bu dal
  T-017'den **önce** tasarlanmış, dosyanın "VACUITY BEKÇİSİ" bölümünde (`:59-68`)
  **açıkça ilan edilmiş** ve ④ için **daha önce kabul edilmiş** bir desen.
- Maliyeti **ölçüldü ve sıfır**: AC'nin pini `session-ip-and-last-seen.test.ts:147`'de
  **vacuous olmayan** biçimde duruyor. Temiz DB'de ⑤ hiçbir şey ölçmez ama **hiçbir
  kapsam da kaybolmaz**; yanlış kırmızı da veremez (§0.2).
- `AGENT_BASELINE.md` §4'e göre `high` = "yanlış davranış üreten hata / eksik yetki /
  AC karşılanmaması". Hiçbiri geçerli değil. "Emin değilsen bir alt seviye" kuralıyla
  → **low**.

**Ama kusur gerçek:** CI'da hiçbir şey ölçmeyen bir test, kendi başlığında kendini
"VARLIK kanıtı" ilan etmeye devam ediyor. `db`'nin reddettiği **(3)** seçeneği
(⑤'i kaldırıp `apps/api`'deki gerçek korumaya atıf yapmak) bugünkü ölçümle
**orantısızlık argümanını kaybediyor**: silmek **sıfır CI kapsamı** kaybeder.
Önerim borç satırı olarak S-1'de.

---

## 2. BULGULAR

```
BULGULAR:
  - [SEV: medium] apps/admin/src/features/sessions/ActiveSessionsCard.tsx:85,126-130
    ↔ apps/admin/src/features/two-factor/TwoFactorStatusCard.tsx:81,89-93 —
    Radix `FocusScope` odak-geri-verme geçici çözümü (ref bildirimi +
    `setTimeout(…,0)` + `.focus()` + ~8 satır gerekçe yorumu) İKİ kartta BİREBİR
    tekrarlanıyor; tetikleyici yakalama (`dialogTriggerRef.current =
    event.currentTarget`) dört çağrı yerinde elle yazılmış (ActiveSessionsCard:302,322;
    TwoFactorStatusCard:230,240). Bu YÜZEYSEL benzerlik DEĞİL: iki kopya AYNI
    bilgiyi (ConfirmDialog'un `Dialog.Trigger` kullanmaması + Radix trap'ının
    mikro-görev davranışı) kodluyor ve TEK bir sebeple (ConfirmDialog `Dialog.Trigger`
    benimserse veya Radix davranışı değişirse) BİRLİKTE değişmek zorunda.
    Başarısızlık senaryosu: `ConfirmDialog` `Dialog.Trigger` benimsendiğinde geliştirici
    bir kartı günceller, diğerinde geçici çözüm kalır → çifte `.focus()` veya ölü
    kod; `apps/admin/vitest.config.ts:15` (`environment: 'node'`, DOM YOK) render
    testini yapısal olarak yasakladığı ve e2e pini de bulunmadığı (bkz. sonraki
    bulgu) için regresyon SESSİZCE yayına çıkar —
    Düzeltme: `apps/admin/src/hooks/use-dialog-trigger-focus.ts` (paylaşılan hook,
    `{ dialogTriggerRef, captureTrigger, focusDialogTrigger }` döner) — gerekçe yorumu
    TEK yerde yaşar. Not: `apps/admin` bugün hiç özel hook taşımıyor (ölçüldü:
    `use[A-Z]` bildirimi sıfır), yani bu ilk hook olur; CLAUDE.md §4 "fonksiyon
    bileşeni + hook" bunu zaten öngörüyor. Tek kullanımlık soyutlama DEĞİL — iki
    çağrı yeri ZATEN var — frontend

  - [SEV: medium] apps/admin/e2e/panel-flow.spec.ts (eksik test; emsal :256-282) —
    `wcag` W-1 (high) düzeltmesinin davranışını pinleyen HİÇBİR otomatik test yok.
    Ölçüldü: `apps/admin/e2e` altında `ConfirmDialog|Vazgeç|Sonlandır|Kapat`
    eşleşmesi SIFIR; admin birim testleri DOM'suz (`vitest.config.ts:15`) olduğu için
    odak davranışını ölçemez. Oysa AYNI davranış için KURULU ve yeşil bir emsal var:
    `panel-flow.spec.ts:256-282` UserMenu'de `Escape` → `await expect(trigger)
    .toBeFocused()` zincirini pinliyor (`:282`). Başarısızlık senaryosu:
    `setTimeout(…,0)` sarmalayıcısı bir refactor'da kaldırılır (ya da
    `focusDialogTrigger()` çağrısı `onOpenChange` dalından düşer) → odak yine
    `<body>`'ye düşer, `pnpm lint/typecheck/test/test:e2e` **tamamı yeşil kalır**;
    kusur ancak elle erişilebilirlik incelemesiyle bulunur (tur 1'de de öyle
    bulundu) —
    Düzeltme: `panel-flow.spec.ts:256-282`'nin desenini oturum kartı için tekrarla:
    "Sonlandır"a odaklan → diyalog açılsın → `Escape` → `await expect(trigger)
    .toBeFocused()`. İkinci kart (`TwoFactorStatusCard`) için de aynı pin — qa

  - [SEV: low] packages/db/src/__tests__/session-metadata-columns.test.ts:225-229
    (ve ④, :202-208) — temiz veritabanında (CI'ın efemer Postgres'i, `session` 0
    satır) test "tablo boş" dalına girer, `expect(totalRows).toBe(0)` totolojisini
    koşar ve YEŞİL döner: hiçbir şey ölçmez. Dosya başlığı (`:80-81`) ⑤'i hâlâ
    "S6'nın hook'unun GERÇEKTEN çalıştığının VARLIK kanıtı" diye ilan ediyor —
    bu beyan temiz DB'de karşılanmıyor. §1'de gerekçelendirildiği gibi bu H-1'in
    kalıntısı değil ve kapsam kaybı sıfır (gerçek pin:
    `apps/api/src/__tests__/session-ip-and-last-seen.test.ts:147`) —
    Düzeltme (biri): (a) ⑤'i KALDIR ve başlıkta `session-ip-and-last-seen.test.ts:147`'ye
    atıf bırak — bugünkü ölçümle sıfır CI kapsamı kaybeder, `db`'nin "orantısız"
    gerekçesi artık geçerli değil; ya da (b) ⑤/④'ün başlığını "KAPIYI TUTAN test"
    yerine "ölçüm notu — veri varsa doğrular, yoksa atlar" olarak düzelt, böylece
    beyan ↔ gerçeklik boşluğu kapansın. Vade: v0.0.16 — db

  - [SEV: low] apps/admin/src/components/ConfirmDialog.tsx:34-37 — yorum
    "`ConfirmDialog`'un TEK tüketicisi `TwoFactorStatusCard.tsx` … (iki tüketici de
    aynı dosyada) … kamusal sözleşmesini değiştirmek güvenli" diyor. Bu artık YANLIŞ:
    aynı dosyanın `:21-23`'ü doğru biçimde "İKİ JSX tüketicisi" sayıyor ve ikincisi
    BAŞKA bir dosyada (`ActiveSessionsCard.tsx:439`). İki yorum bloğu çelişiyor ve
    bayat olan, kırıcı sözleşme değişikliğinin GEREKÇESİ olarak duruyor.
    Başarısızlık senaryosu: sonraki geliştirici `:34-37`'ye güvenip "tek tüketici,
    serbestçe değiştirebilirim" diye zorunlu bir prop daha ekler, ikinci tüketiciyi
    (ve olası üçüncüyü) gözden kaçırır —
    Düzeltme: `:34-37`'deki "TEK tüketicisi" cümlesini güncelle (iki tüketici,
    iki ayrı dosya) — frontend

  - [SEV: low] apps/api/src/auth/session-summary.mapper.ts:25-27 ve
    apps/api/src/__tests__/session-summary-mapper.test.ts:10-13 — iki yorum da
    "üç vaka" diyor, dosyada BEŞ `it()` var (`:40`, `:48`, `:56`, `:64`, `:72`);
    sonradan eklenen `isCurrent` türetimi ve "ham `userAgent` sızmaz" vakaları
    yorumda yok. Yorum kodun gerisinde kaldı (CLAUDE.md §4 — güncelliğini yitirmiş
    yorum). Başarısızlık senaryosu: kapsam yorumdan okunur, iki vaka "yok" sanılıp
    tekrar yazılır —
    Düzeltme: iki yorumu beş vakayı sayacak şekilde güncelle — backend

  - [SEV: low] apps/api/src/auth/session-summary.mapper.ts:32 ←→
    apps/api/src/auth/sessions.service.ts:66 — dosyalar arası **tip seviyesinde**
    döngü: servis mapper'dan `toSessionSummary` (değer) alır, mapper servisten
    `SessionSummary` (yalnızca tip) alır. Çalışma zamanında döngü YOK — ölçüldü:
    `apps/api/dist/auth/session-summary.mapper.js:28` yalnızca `./device-label.js`
    import eder. Bu yüzden `high` DEĞİL. Yine de kenar TS modül grafiğinde duruyor ve
    aynı desen `auth.tokens.ts:11` ↔ `sessions.service.ts:65` çiftinde de var (yani
    iki yerde) — biri `import type`'ı değer importuna çevirirse (ör. tipin yanına bir
    sabit eklenirse) gerçek bir TDZ/undefined-at-import riski doğar —
    Düzeltme: `SessionSummary`'yi `apps/api/src/auth/session-summary.types.ts`'e taşı;
    dört tip tüketicisi (`sessions.controller.ts:41`, `auth.tokens.ts:11`,
    `session-list-read.port.adapter.ts:43`, `session-summary.mapper.ts:32`) oradan
    okur. Kapsam dışı dosyalara dokunduğu için bu sürümde DEĞİL. Vade: v0.0.16 — backend

  - [SEV: low] apps/admin/src/features/two-factor/TwoFactorStatusCard.tsx:61-66 —
    `INITIAL_MANAGE_STATE`, `two-factor-manage-controller.ts:42`'deki (dışa
    AÇILMAYAN) `INITIAL_STATE`'in alan VE değer olarak BİREBİR kopyası. L-3'ün
    ikizi; `frontend`'in bildirimi **doğrulandı**. Başarısızlık senaryosu: durum
    tipine beşinci bir alan eklenir, controller'ın `INITIAL_STATE`'i güncellenir,
    kartın kopyası güncellenmezse — `TwoFactorManageState` zorunlu alanlı olduğu için
    bugün derleme hatası verir, yani sessiz bozulma riski YOK; bu nedenle `low`.
    Kökeni T-016, T-017'nin regresyonu DEĞİL —
    Düzeltme: `two-factor-manage-controller.ts:42`'yi `export` et, kartta import et
    (L-3 ile BİREBİR aynı düzeltme). `frontend`'in §10.13 kapsam disiplini DOĞRU idi;
    bu satır **ROADMAP teknik borcuna** yazılır, bu sürümde düzeltme turu açmaz.
    Vade: v0.0.16 — frontend

  - [SEV: low] apps/api/src/__tests__/session-list-read-port-adapter.test.ts:125 —
    `expect(['127.0.0.1','::1','::ffff:127.0.0.1']).toContain(row.ipAddress)`.
    `:123-124` (`not.toBeNull()` + `not.toBe('')`) bu testin DAVRANIŞSAL iddiasını
    (adaptör alanı bozmadan taşır, sentinel sızmaz) ZATEN tam olarak taşıyor;
    `:125` buna kapsam EKLEMEZ, çünkü IP çözümlemesinin kendisi başka yerde
    (`session-ip-and-last-seen.test.ts:147`) ve DAHA GÜÇLÜ biçimde pinli. Karşılığında
    testi ortamın soket gösterimine bağlar. `backend`'in "farklı OS/Node'da dördüncü
    biçim → kırmızı" risk bildirimine **KATILIYORUM**, ama "totolojiyi gidermenin
    maliyeti" çerçevesine **KATILMIYORUM**: totolojiyi `:123-124` gideriyor, `:125`
    bedava gelen bir kırılganlık. Başarısızlık senaryosu: IPv6'sız bir konteynerde
    veya Node'un soket gösterimi değişen bir sürümünde CI, ürün hatası olmadan
    kırmızı olur ve ekip allowlist'e dördüncü dize ekler (testin anlamı daha da
    azalır) — Düzeltme: `:125`'i kaldır, `:123-124` kalsın. Vade: v0.0.16 — backend

  - [SEV: low] apps/api/src/auth/session-summary.mapper.ts:57 — `const devices:
    { browserFamily: DeviceBrowserWire; osFamily: DeviceOsWire }` satır içi yapısal
    tip bildirimi, `device-label.ts:128-131`'in ZATEN dışa açtığı `DeviceFamilies`
    arayüzünün elle yazılmış kopyası; `@arkesoft/trpc`'ten iki tip importu (`:29`)
    **yalnızca** bu bildirim için var. Başarısızlık senaryosu: `DeviceFamilies`'e
    üçüncü bir alan eklenirse bu bildirim onu sessizce görünmez kılar (daraltılmış
    hedef tipe atama hata vermez) — Düzeltme: bildirimi kaldır (çıkarım yeterli) veya
    `DeviceFamilies` olarak yaz; `:29` importu da düşer — backend
```

**FAIL kuralı uygulaması (`AGENT_BASELINE.md` §4):** `critical`/`high` = **0**;
`medium` = **2** → **PASS** (iki `medium` teknik borca kaydedilir, düzeltme turu
AÇILMAZ; yedi `low` doğrudan borç tablosuna).

---

## 3. Yeni kusur ARANAN, bulunmayan eksenler (negatif sonuçlar)

| Eksen                           | Ölçüm                                                                                                                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `any` / `@ts-ignore` / `as`     | `apps/api/src/auth/*session*` → eşleşme **0**. `apps/admin/src/features` → tek eşleşme `ActiveSessionsCard.tsx:56` ve o bir **import alias**'ı (`INITIAL_STATE as INITIAL_SESSIONS_STATE`), tip zorlaması DEĞİL. `as const` sayılmaz. |
| Katman ihlali                   | `session-summary.mapper.ts` doğru katmanda (`apps/api/src/auth`): Prisma importu YOK, DI YOK, I/O YOK; yalnızca `@arkesoft/trpc` tipleri + yerel `device-label.js`. `apps/*` → `packages/*` yönü korunuyor. `packages/ui` veri çekmiyor (kartlar `apps/admin`'de). |
| Çekirdekte sağlayıcı dallanması | Yok. `StepUpService` sağlayıcı adı bilmiyor; `isAPIError` daraltması adaptör sınırında (`step-up.service.ts:83`), Better Auth tipi dışarı sızmıyor (`InvalidPasswordError`/`AuthProviderFailedError`).                              |
| Yutulan hata                    | `catch {}` yok. `active-sessions-controller.ts:315-317`'nin boş `catch`'i hatayı **yutmuyor**: `{kind:'unknown'}` `PanelError`'una çevirip `MESSAGES.errors.network`'e (ölçüldü: `messages.test.ts:86`) kullanıcıya **gösteriyor**; `normalize-panel-error.ts:87`'nin kurulu fail-closed deseniyle birebir aynı. Bulgu DEĞİL. |
| Tek sorumluluk                  | Karar mantığı iki kartta da controller'a çıkarılmış (`active-sessions-controller.ts`, `two-factor-manage-controller.ts`); kartlar yalnızca render + yan etki. `toSessionSummary()` tek işi yapıyor. |
| Test kalitesi (davranış mı)     | `active-sessions-controller.test.ts` **12 davranış testi**, mutlu yol dışında beş senaryo (400/401/404/429/fırlatan ağ) + iki no-op savunması + negatif sıralama vakası; assertion'lar sonuç/durum üzerinde, implementasyon yansılaması yok. `session-summary-mapper.test.ts`'in beş vakası **beş ayrı şeyi** ölçüyor (örtüşme yok: `''→null` mutasyon-öldürücü, `null→null` ters eşlemeyi yakalar, gerçek IP korunur, `isCurrent` türetimi, `userAgent` sızmazlığı). |
| Ölü kod                         | `DEVICE_*_COUNT` exportları test seviyesi olarak gerekçeli (`active-sessions-controller.ts:63-73`); `resolveIpDisplayValue`'nun `''` dalı tel şeması `string \| null` olduğu için **erişilebilir** (ölü değil). |
| İsimlendirme                    | `session-summary.mapper.ts` kebab-case ✓, `SessionSummaryRow`/`DeviceFamilies` PascalCase ✓, `toSessionSummary`/`focusDialogTrigger` camelCase ✓, `closeLabel`/`isCurrent`/`isMutating` ✓, `TRANSIENT_NOTICE_MS`/`INITIAL_STATE` SCREAMING_SNAKE ✓. `data`/`temp`/`handle*`/`process*` belirsiz adı yok (`handleConfirm` olayı adlandırıyor, veriyi değil). |

### `closeLabel`'ın ZORUNLU olması — doğru karar (bulgu değil)

Katılıyorum, üç ölçülmüş sebeple:

1. Varsayılan değer vermek metni `ConfirmDialog.tsx` içinde sabitlerdi → CLAUDE.md
   §10.17 ihlali. `wcag`/`frontend`'in gerekçesi geçerli.
2. "Kırıcı sözleşme" maliyeti **ölçüldü ve sıfır**: bileşen `apps/admin`'e yerel
   (`packages/ui`'den dışa açılmıyor), tüketicisi **iki** JSX çağrısı
   (`ActiveSessionsCard.tsx:447`, `TwoFactorStatusCard.tsx:368`) ve ikisi de
   güncellenmiş; eksik bırakılması **derleme hatası** olurdu.
3. Metin kaynağı doğru: `MESSAGES.common.close` (`messages.ts:335`) — ikinci bir
   metin kaynağı icat edilmemiş.

`setTimeout(…,0)`'ın idiomatikliği hakkında **görüş bildirmedim** — handoff'un
kararıyla `wcag`'e bırakıldı. Yalnızca DRY/tutarlılık eksenini değerlendirdim.

---

## 4. ÖLÇÜMLER

```
ÖLÇÜMLER:
  - İncelenen dosya: 22 (TS/TSX kaynak + test + 1 derlenmiş `dist` çıktısı + 1 vitest
    config); ek olarak 7 hedefli `Grep` taraması (any/as, setTimeout, hook bildirimi,
    e2e odak/diyalog, SessionSummary tüketicileri, MESSAGES.common, session yazıcıları).
  - Bulunan `any`: 0 · `@ts-ignore`/`@ts-expect-error`: 0 · gerekçesiz `as` tip
    zorlaması: 0 (tek `as` eşleşmesi import alias'ı, `ActiveSessionsCard.tsx:56`).
  - En büyük fonksiyon: `ActiveSessionsCard()` — `ActiveSessionsCard.tsx:68-371`,
    **304 satır** (gövdenin ~%85'i JSX; karar/mutasyon mantığı ZATEN
    `active-sessions-controller.ts`'e çıkarılmış ve diyalog `SessionStepUpDialog`'a
    ayrılmış, bu yüzden SRP bulgusu AÇILMADI). İkinci: `TwoFactorStatusCard()`
    `:68-308` (241 satır). En büyük mantık fonksiyonu: `handleConfirm()` `:159-205`
    (47 satır). `toSessionSummary()` 17 satır.
  - Bulgu dağılımı: critical 0 · high 0 · medium 2 · low 7.
  - Tur 1 bulgularının kapanışı: H-1 ✓ · M-1 ✓ · M-2 ✓ · L-1 ✓ · L-2 ✓ · L-3 ✓ ·
    L-6 ✓ (7/7). L-4/L-5/L-7 bilinçli borç.
  - DOĞRULANAMADI (Bash yok): `pnpm lint/typecheck/test/test:isolation/build/guards`
    tarafımdan KOŞTURULMADI — Orkestratör'ün tek temiz koşumuna dayanıldı, kendi
    ölçümlerim yalnızca dosya içeriği ve emit edilmiş `dist` çıktısıdır.
```
