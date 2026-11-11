# T-017 · `wcag` gate · tur 1 — FAIL (1 high + 1 medium + 2 low/debt)

**Tarih:** 2026-11-10 · **Sürüm:** v0.0.15.1 · **Kapsam:** `/hesap/guvenlik` —
"Aktif oturumlar" kartı + step-up parola diyaloğu (yeni), `_app.hesap.guvenlik.tsx`
(güncellendi), `ConfirmDialog.tsx`/`Card.tsx`/`Input.tsx` (okundu, DEĞİŞTİRİLMEDİ).

## GATE: wcag
## SONUÇ: FAIL

Gerekçe (AGENT_BASELINE §4): en az bir `high` bulgu → FAIL (mekanik kural, sayı
tartışmaya kapalı). 1 `high` + 1 `medium` + 2 `low` (biri kapsam dışı not).

---

## ⚠⚠ MADDE 1 — İKİ DOĞRULANAMADI KALEMİ CANLI ÖLÇÜM (ZORUNLU, yapıldı)

**Nasıl ölçüldü:** `apps/admin`'in Vite dev sunucusu gerçekten başlatıldı
(`ARKESOFT_PANEL_DEV_API_TARGET=http://127.0.0.1:3100 npx vite --port 5173
--strictPort`, `apps/api`'nin **zaten çalışan** sürecine proxy — port 3100,
T-016 tur4'ün tespit ettiği kalıcı dev süreciyle AYNI, dokunulmadı), gerçek
Mailpit (`:8025`) ile e-posta doğrulamalı iki kullanıcı oluşturuldu, iki ayrı
`BrowserContext` (iki farklı `userAgent`) ile aynı kullanıcı iki kez giriş
yaptırılarak **gerçek iki satırlı** oturum listesi üretildi. Araç:
`@playwright/test`'in `chromium` export'u (`playwright` paketi admin'de bare
olarak yok, `@playwright/test` zaten kurulu) + repodaki transitif
`axe-core@4.14.0`'ın `axe.min.js`'i doğrudan `addScriptTag` ile enjekte edildi
(resmi `@axe-core/playwright` entegrasyonu v0.0.19'da gelecek, ÖLÇÜLDÜ — henüz
yok, ROADMAP borcuna not düşüldü, aşağıda).

### (i) Odak yönetimi — ÖLÇÜLDÜ, KISMEN DOĞRU / KISMEN BOZUK

**Başarı yolu (tekil sonlandırma) — DOĞRU çalışıyor, canlı doğrulandı:**
Parola doğru girilip "Sonlandır" onaylanınca → satır listeden kalkıyor,
`role="status"` bölge "Chrome · Windows oturumu sonlandırıldı." duyuruyor,
diyalog kapanıyor (`[role=dialog]` sayısı 0), **odak gerçekten**
`CardTitle`'a (`<p tabindex="-1">Aktif oturumlar</p>`) taşınıyor —
`document.activeElement` ölçümü: `{tag:"P", text:"Aktif oturumlar",
tabIndex:"-1"}`. `<body>`'ye düşmüyor.

**404 yolu (hedef oturum zaten gitmiş) — DOĞRU çalışıyor, canlı doğrulandı
(yarış koşulu bizzat üretildi):** Diyalog açıkken, AYNI çerezle arka planda
`POST /auth/sessions/revoke` çağrısı yapılıp hedef oturum UI'dan ÖNCE
sunucuda gerçekten silindi (yanıt `{"status":true}`), ardından UI'da doğru
parolayla "Sonlandır" onaylandı → sunucu gerçekten 404 döndü → `role="alert"`
bölge "Bu oturum artık mevcut değil. Liste güncellendi." metnini taşıyor,
diyalog **otomatik kapandı** (`[role=dialog]` → 0), **odak yine `CardTitle`'a
taşındı** (aynı ölçüm: `{tag:"P", text:"Aktif oturumlar", tabIndex:"-1"}`).
KARAR ③ (frontend'in seçtiği (c) seçeneği) **tasarlandığı gibi çalışıyor**.

**400 yolu (yanlış parola) — DOĞRU çalışıyor, canlı doğrulandı:** Diyalog
AÇIK kalıyor, parola `Input`'u `aria-invalid="true"` + `aria-describedby`
alıyor, işaret ettiği `<p>` gerçekten "Şifreniz doğrulanamadı. Tekrar
deneyin." metnini taşıyor, VE `document.activeElement === passwordInput`
(ölçüldü: `isFocusedAfterError: true`) — odak alana gerçekten dönüyor.

**⚠⚠ Vazgeç/Escape/× yolu (işlem İPTAL edildiğinde) — BOZUK, canlı doğrulandı,
kök neden bulundu.** Diyalog AÇIKKEN kullanıcı **onaylamadan** vazgeçtiğinde
(Escape tuşu VEYA "Vazgeç" butonuna tıklama — ikisi de test edildi, 3 farklı
yöntemle: klavye-yalnız `Tab`+`Enter`+`Escape`, fare `.click()`, 5 ayrı
gecikme örneklemesi 0-800ms) **odak her seferinde `<body>`'ye düşüyor**,
tetikleyici "Sonlandır" butonuna DÖNMÜYOR — docs/ux/docs/ui'nin varsaydığı
"Radix'in varsayılanı" **gerçekte çalışmıyor**.

**Kök neden (kaynak kodu okunarak doğrulandı):**
`node_modules/.pnpm/@radix-ui+react-dialog@1.3.1/.../dist/index.mjs`
satır 39/54/78: `triggerRef` yalnızca `<Dialog.Trigger>` bileşeni
kullanıldığında doldurulur (`composedTriggerRef = useComposedRefs(forwardedRef,
context.triggerRef)`, `DialogTrigger`'ın İÇİNDE). Satır 174-176:
`DialogContentModal`'ın `onCloseAutoFocus`'u **yalnızca**
`context.triggerRef.current?.focus()` çağırır — genel "önceden odaklanan
öğeyi hatırla" mekanizması YOK, özel olarak `Dialog.Trigger`'a BAĞLI.
`apps/admin/src/components/ConfirmDialog.tsx` **hiçbir zaman**
`<Dialog.Trigger>` kullanmıyor (dosya baştan sona okunmuş, `Dialog.Root` +
`Dialog.Portal` + `Dialog.Content` + iki `Dialog.Close` var, `Dialog.Trigger`
YOK — tetikleyici buton HER ZAMAN `ConfirmDialog`'un DIŞINDA, çağıranın kendi
JSX'inde). Sonuç: `triggerRef.current` HER ZAMAN `null` →
`onCloseAutoFocus`'un tek satırı NO-OP → odak hiçbir yere taşınmıyor →
tarayıcı, odaklı öğe DOM'dan kalkmasa bile (bu durumda kalkmıyor, buton hâlâ
orada) varsayılan davranışla `<body>`'ye düşürüyor.

Bu **genel bir Radix/React19 ortam arızası DEĞİL** — kanıt: aynı sayfadaki
`UserMenu` (`@radix-ui/react-dropdown-menu`, FARKLI bir Radix ilkeli,
`Dialog.Trigger`'a eşdeğer bir `DropdownMenuTrigger` KULLANIYOR) için
`panel-flow.spec.ts:278-282`'nin **mevcut, CI'da yeşil** testi odağın
Escape'te tetikleyiciye **gerçekten döndüğünü** iddia ediyor ve bu repo'nun
headless ortamında dropdown-menu ailesi bu mekanizmayı **doğru** kullanıyor.
Sorun `@radix-ui/react-dialog`'un **bu spesifik kullanım biçiminde**
(`Dialog.Trigger`'sız, tamamen dışarıdan kontrollü `open`/`onOpenChange`).

**Neden şimdiye kadar yakalanmadı:** `ConfirmDialog` T-016'da oluşturuldu;
T-016 `wcag` tur1 raporu bunu AÇIKÇA `DOĞRULANAMADI` bırakmıştı ("Radix'in
kendi kapsamına + T-008 `UserMenu` emsaline güvenildi" — emsal yanlış
seçilmiş, çünkü `UserMenu` FARKLI bir Radix ilkeli ve FARKLI bir mekanizma
kullanıyor). Bu, T-016'nın güvendiği varsayımın **yanlış** olduğunu gösteren
yeni bir ölçüm — T-016'nın 2 `medium`'unun "aynı sınıfı" DEĞİL (bkz. aşağıda
T-016 regresyon kontrolü), tamamen YENİ bir kusur sınıfı.

**Etki kapsamı:** `ConfirmDialog.tsx` DEĞİŞMEDİ (T-017 "DEĞİŞMEYECEK"
kararına birebir uyuldu) — bu kusur hem T-017'nin YENİ step-up
diyaloglarında (tekil + toplu) HEM DE T-016'nın 2FA diyaloglarında (devre
dışı bırakma, yedek kod yenileme) AYNI ŞEKİLDE mevcut. T-017'nin kapsamında
rapor ediliyor çünkü bu Task'ın yeni ekranı onu doğrudan, sıkça tetikliyor
(her "vazgeç"te).

→ **BULGU B1, aşağıda, `high`.**

### (ii) 360px istifleme — ÖLÇÜLDÜ, WCAG ihlali YOK ama tasarım sapması VAR

**Tekil diyalog (`confirmLabel="Sonlandır"`, kısa metin), 360×800 viewport:**
Diyalog taşmıyor (`overflowsViewport: false`), "Vazgeç" (x:118-208) ve
"Sonlandır" (x:216-320) butonları **yan yana** (ikisi de `y:504`) —
docs/ui'nin "dikey istiflenir" beklentisi karşılanmıyor ama kırpma/taşma
YOK, her iki buton da `right ≤ 320` (dialog içeriği 328px genişlik, kenar
boşluğu bırakıyor).

**Toplu diyalog (`confirmLabel="Tüm oturumları sonlandır ve çıkış yap"`,
UZUN metin), 360×800 viewport — ekran görüntüsüyle doğrulandı:** Diyalog
hâlâ taşmıyor (`overflowsViewportX/Y: false`), butonlar yine **yan yana**
(ikisi de `y:528`, yükseklik `44px` — `h-11`'in korunduğu doğrulandı), onay
butonunun metni **buton içinde iki satıra sarıyor** ("Tüm oturumları /
sonlandır ve çıkış yap") — metin KESİLMİYOR, okunabilir kalıyor, dokunma
hedefi (44px yükseklik) korunuyor.

**Sonuç: WCAG ihlali YOK** (1.4.10 Reflow'a aykırı değil — yatay kaydırma
yok; 2.5.8 Target Size karşılanıyor — 44px; metin kesilmiyor). docs/ui'nin
RİSKLER #2'de öngördüğü **tam olarak** senaryo gerçekleşti: "metin wrap eder,
görsel olarak biraz sıkışık ama fonksiyonel olarak çalışır, hiçbir metin
kesilmez" — bu belgenin kendi tahmini doğrulandı. → **düşük öncelikli, WCAG
dışı bir tasarım sadakati borcu** (aşağıda `low`).

Liste satırlarının 360px istiflemesi (cihaz+rozet aynı satır / IP kendi
satırı / son görülme kendi satırı / tam genişlik buton) ekran görüntüsüyle
**doğrulandı** — docs/ux'in tarif ettiği birebir.

---

## BULGULAR

### B1 · **high** · `apps/admin/src/components/ConfirmDialog.tsx` (dosyanın
tamamı, kök neden: `<Dialog.Trigger>` HİÇ kullanılmıyor) — tüketiciler:
`apps/admin/src/features/sessions/ActiveSessionsCard.tsx:385-439`
(`SessionStepUpDialog`, hem tekil hem toplu)

**WCAG 2.4.3 Focus Order** (ve pratik etkisiyle 2.4.7 Focus Visible'ı da
anlamsızlaştırıyor — odak hiçbir yerde görünmüyor çünkü hiçbir yere
taşınmıyor). Kullanıcı senaryosu: klavye/ekran okuyucu kullanıcısı satırdaki
"Sonlandır"a (veya kart altındaki "Tüm oturumları sonlandır"a) ulaşır,
diyalog açılır, parola alanına odaklanır, kullanıcı fikrini değiştirip
`Escape`'e basar (ya da "Vazgeç"i tıklar/Enter'lar) — diyalog kapanır AMA
odak **hiçbir yerde değildir** (`document.activeElement === document.body`).
Ekran okuyucu kullanıcısı için bu, "doküman" gibi anlamsız/boş bir bağlam
duyurusuna düşmek demektir; klavye kullanıcısı için sonraki `Tab` basışı
**sayfanın EN BAŞINA** (skip-link) sıçrar — kullanıcı kaldığı yerden DEĞİL,
sıfırdan devam etmek zorunda kalır. Bu, docs/ux'in "Diyalog kapandığında
(Vazgeç/Escape, başarı DIŞI) → Radix'in varsayılanı tetikleyici düğmeye
döner" (açıkça yazılı varsayım) iddiasının **yanlış** olduğunu kanıtlıyor.

**Önerilen düzeltme:** `ConfirmDialog.tsx`'e dokunmadan çözülebilir — çağıran
taraf (`SessionStepUpDialog`/`TwoFactorManagePasswordDialog`) `onOpenChange`
içinde, dialog `false` olduğunda VE bir "revoked/sessionGone" sonucu
TARAFINDAN zaten ele alınmadıysa (yani düz iptal durumunda), açılıştan önce
yakalanmış bir tetikleyici-ref'e `.focus()` çağırabilir — `ActiveSessionsCard`
zaten 'revoked'/'sessionGone' için AYNI tekniği (`focusCardTitle`)
kullanıyor, iptal dalı için de benzer bir `triggerElementRef` eklenmesi
yeterli (tahmini ~10-15 satır, 2 dosya: `ActiveSessionsCard.tsx` +
`TwoFactorStatusCard.tsx`, `ConfirmDialog.tsx` DEĞİŞMEDEN kalabilir).
Alternatif: `ConfirmDialog`'a `onCancel`/`onOpenChange(false)` anında Radix'e
`onCloseAutoFocus` prop'u geçirip çağıranın kendi `triggerRef`'ini
kullanmasına izin vermek (bileşene küçük, opsiyonel bir prop ekler).

**Sorumlu ajan:** `frontend` (çözüm `architect`/Orkestratör onayı
gerektirebilir çünkü `ConfirmDialog.tsx`'in "DEĞİŞMEYECEK" kararı farklı bir
gerekçeyle (hata gösterim API'si) alınmıştı — bu, O kararla ÇELİŞMEYEN, ayrı
bir bug-fix kapsamı; `ConfirmDialog.tsx`'e dokunulmadan da çözülebileceği
yukarıda gösterildi).

**Ölçüm yöntemi (özet, üç bağımsız teyit):**
1. Klavye-yalnız: `Tab` ile tetikleyiciye odaklan → `Enter` (diyalog açılır,
   parola input'u odaklanır, ölçüldü) → `Escape` → 400ms sonra
   `document.activeElement` = `BODY`.
2. Fare: "Sonlandır" tıkla → diyalog aç → "Vazgeç"i tıkla → 0/50/150/400/800ms
   örneklemesinde **hepsinde** `BODY`.
3. Kaynak kod okuması: Radix `@radix-ui/react-dialog@1.3.1` dist dosyasında
   `triggerRef`'in yalnızca `DialogTrigger` tarafından dolduğu, `onCloseAutoFocus`'un
   başka hiçbir yedek mekanizması olmadığı doğrulandı.

### B2 · **medium** · `apps/admin/src/components/ConfirmDialog.tsx:88-99`
(× kapatma ikonu)

**WCAG 2.5.3 Label in Name / 4.1.2 Name, Role, Value** (ikili kontrol
belirsizliği). `ConfirmDialog`'un sağ üst köşesindeki ikon-only kapatma
butonu `aria-label={cancelLabel}` taşıyor — bu, **gerçek** "Vazgeç" butonuyla
**BİREBİR AYNI** erişilebilir ada sahip ("Vazgeç") oluyor. Canlı DOM sorgusu
(diyalog açıkken üç buton listelendi): `{"Vazgeç" (gerçek buton, görünür
metin="Vazgeç")}`, `{"Sonlandır"}`, `{görünür metin="×",
ariaLabel="Vazgeç"}`. Aynı diyalog içinde **iki farklı kontrol** aynı
"Vazgeç, buton" adıyla duyuruluyor — ekran okuyucu/ses-komutlu kullanıcı
ikisini ayırt edemez (fonksiyonel olarak ikisi de iptal ettiği için zararı
sınırlı, ama 2.5.3'ün "görünür metin adı yansıtmalı" ilkesi ihlal ediliyor:
görünen "×" sembolü, konuşulan ad "Vazgeç" değil). **Bu bulgu axe-core
tarafından YAKALANMADI** (axe'ın `label-content-name-mismatch` kuralı yalnızca
sembolik tek karakterleri — "×" — "kelime-benzeri" görmüyor, bu yüzden
sessiz kaldı; UserMenu'deki "DL" gibi harf dizileri için TETİKLENİYOR, bkz.
aşağıdaki kapsam dışı not) — **elle inceleme + canlı DOM sorgusuyla**
bulundu, tam da görev talimatının uyardığı "axe tek başına yeterli değil"
durumu.

**Önerilen düzeltme:** `aria-label={cancelLabel}` → ayrı, amaca özgü bir
"Kapat" metni (ör. `common.close`, zaten `accountSecurity.sessions.
sessionGoneClose` kataloğunda "Kapat" var — kavramsal olarak aynı, yeni bir
katalog girdisi `common.close` olarak genelleştirilebilir).

**Sorumlu ajan:** `frontend`/`ui` (T-016'dan kalan borç, T-017'nin yeni
diyaloglarında da aynen tüketiliyor).

### L1 · **low** (WCAG dışı, tasarım sadakati borcu) ·
`apps/admin/src/components/ConfirmDialog.tsx:73` (`flex justify-end gap-2`)

360px'te toplu diyaloğun onay/vazgeç butonları docs/ux'in istediği gibi
DİKEY istiflenmiyor, YAN YANA kalıyor (ölçüldü, ekran görüntüsüyle
doğrulandı) — metin buton içinde 2 satıra sarıyor, kırpma/taşma/dokunma
hedefi kaybı YOK, **WCAG ihlali değil**. docs/ui RİSKLER #2'nin kendi
öngördüğü "fonksiyonel ama sıkışık" sonuç. Düzeltme (opsiyonel):
`ConfirmDialog.tsx:73`'e `flex-col sm:flex-row` eklemek — `ConfirmDialog`
"DEĞİŞMEYECEK" kararıyla gerilimli, Orkestratör onayı gerektirir.
**Sorumlu:** `ui`/`frontend`, vade: isteğe bağlı/ROADMAP borcu.

### L2 · **low** (KAPSAM DIŞI — T-017'ye sayılmıyor, bilgi amaçlı) ·
`apps/admin/src/components/layout/UserMenu.tsx` (axe hedefi: `#radix-_r_0_`,
"Kullanıcı menüsü" tetikleyici butonu, T-008)

axe-core canlı taramasının **tek** bulduğu otomatik ihlal
(`label-content-name-mismatch`, impact: serious) bu buton: görünür içerik
kullanıcı baş harfleri (ör. "DL"), `aria-hidden="true"` ile sarılı, buton
`aria-label="Kullanıcı menüsü"` taşıyor — aynı ailenin UserMenu versiyonu.
Bu buton **her sayfanın üst başlığında** var, T-017 onu DEĞİŞTİRMEDİ,
T-008'den beri mevcut — bu gate'in bulduğu ama **T-017'nin kapsamı dışı**
bir platform-geneli borç. axe hiçbir zaman önceki turlarda koşmadığı için
(T-016 wcag tur1: "axe-core koşturulamadı") şimdiye kadar hiç yakalanmamıştı.
**Bu gate'in SONUÇ/FAIL sayımına DAHİL EDİLMEDİ** — ayrı bir ROADMAP borç
satırı olarak kaydı önerilir (`frontend`, herhangi bir Task, düşük öncelik).

---

## DOKUZ DENETİM NOKTASI — TEK TEK

**1. İki `DOĞRULANAMADI` kalemi** — yukarıda, ikisi de CANLI ölçüldü (bkz.
Madde 1). Odak yönetimi: BAŞARI/404/400 yolları DOĞRU, İPTAL yolu BOZUK
(B1). 360px istifleme: WCAG ihlali YOK, tasarım sapması VAR (L1).

**2. `ConfirmDialog`'un `disabled` prop'u YOK kararı** — denetlendi,
**muhakeme DOĞRU**. Kod okundu: `ConfirmDialogProps`'ta onay butonunu
dışarıdan `disabled` yapacak bir prop yok, yalnızca `isConfirming` var ve o
da `isLoading`/"Doğrulanıyor…" metnine dönüşüyor — "Kapat" durumunu temsil
edemez. (b) seçeneği gerçekten "odaklanılabilir ama işlevsiz kontrol"
üretirdi (gerçek bir 4.1.2/2.1.1 kusuru). Seçilen (c) **canlı doğrulandı**
(bkz. Madde 1.i, 404 yolu): diyalog otomatik kapanıyor, `role="alert"` bölge
doğru metni taşıyor VE **okunuyor** (DOM'da mevcut, `role="alert"`
assertive), odak **CardTitle'a doğru taşınıyor** (ezilmiyor — ölçüldü, body'e
düşmüyor, aksine Madde 1.i'nin SON bulduğu B1'in TAM TERSİ, çünkü bu dal
AÇIKÇA `focusCardTitle()` çağırıyor, Radix'in bozuk varsayılanına
GÜVENMİYOR). Ekran okuyucunun aynı anda hem yeni odaklanan `CardTitle`'ın
adını hem de `role="alert"` metnini duyurma SIRASI/çakışması gerçek bir AT
(NVDA/VoiceOver) ile doğrulanamadı — **DOĞRULANAMADI** (Playwright/axe bunu
ölçemez), ama risk düşük: aynı teknik (odak taşı + eşzamanlı live-region)
başarı dalında da kullanılıyor ve proje genelinde (`sign-in` headingRef
deseni) zaten kabul edilmiş bir örüntü.

**3. Toplu sonlandırma uyarısı** — `Dialog.Description` onay butonundan ÖNCE
render ediliyor (DOM sırası, kod okundu) ve Radix'in standart
`aria-describedby` kablolaması diyalog odaklanınca bunu bağlama sokuyor —
ekran okuyucu diyalog açılır açılmaz başlık+açıklamayı duyurur (Radix
varsayılanı, bu kısım bozuk DEĞİL, yalnızca kapanış-odak mekanizması bozuk).
Yönlendirme WCAG 3.2.5 (Change on Request) **ihlali DEĞİL** — kullanıcı
açıkça "...ve çıkış yap" yazan bir butona basıyor, değişiklik AÇIKÇA
istenmiş. Onay metni sonucu zaten söylüyor ("hemen çıkış yapılacak").

**4. Hata ayrımı — üç sunum, canlı doğrulandı:**
- **400** → `Input.error`, AYRI KUTU YOK, `aria-invalid="true"` +
  `aria-describedby` DOĞRU kuruluyor, odak alana DÖNÜYOR (hepsi canlı
  ölçüldü, "isFocusedAfterError: true").
- **404** → diyalog seviyesi `role="alert"`, canlı doğrulandı (yarış koşulu
  bizzat üretilerek), diyalog otomatik kapanıyor, odak CardTitle'a.
- **401** → kod incelendi (`handleMutationError`'da `UNAUTHENTICATED` →
  `closeDialog()` + `{kind:'unauthenticated'}` → `signOutLocallyAndRedirect()`),
  CANLI tetiklenmedi (gerçek oturum süresi dolumu/çerez geçersizleştirme
  simüle edilmedi — karmaşık, düşük risk, mevcut `treatAsSignedOut`
  deseninin BİREBİR tekrarı, bu desen başka akışlarda zaten CI'da test
  ediliyor) → **DOĞRULANAMADI (canlı)**, kod-incelemesiyle tutarlı.
  "Sessiz başarısızlık WCAG kusuru mu" sorusu: HAYIR sayılabilir — bu YENİ
  bir sessiz hata değil, platformun ZATEN var olan, başka akışlarda
  (sign-out) kabul edilmiş desenidir; yeni bir risk YOK.

**5. Parola alanı** — `<label>` ilişkisi (`Input`'un `htmlFor`/`id`
mekanizması, kod+canlı DOM doğrulandı: `getByLabel('Şifreniz')` çalıştı),
`autoComplete="current-password"` (kod okundu, satırda var),
`type="password"` (kod okundu), hata durumunda odak **gerçekten** alana
dönüyor (canlı ölçüldü). Şifre yöneticisi uyumluluğu CANLI test edilmedi
(gerçek bir tarayıcı eklentisi/şifre yöneticisi gerektirir, Playwright'ın
kapsamı dışı) — **DOĞRULANAMADI**, ama `type="password"` +
`autoComplete="current-password"` standart/beklenen kombinasyon.

**6. Liste semantiği** — kod + canlı DOM doğrulandı: `<ul>`/`<li>` (`li:has-
text("IP adresi")` seçicisiyle satırlar bulundu). "Bu cihaz" rozeti gerçek
görünür metin (kod okundu, `aria-label` YOK, doğru — ekran okuyucu satırı
okurken doğal duyurur). Her "Sonlandır" butonunun erişilebilir adı CANLI
ölçüldü ve DOĞRU: `"Chrome · Windows oturumunu sonlandır (IP 127.0.0.1, son
görülme Az önce)"` — cihaz+IP+süre ile tam disambiguasyon, aynı isimde iki
buton YOK (bu konuda, × butonunun "Vazgeç" çakışması HARİÇ — bkz. B2, O
farklı bir çift). IP `null` + aynı cihaz ailesi durumunda disambiguasyonun
zayıflayacağı (iki "Bilinmeyen cihaz, IP Bilinmiyor" satırı) docs/ui'nin
KENDİ öngördüğü düşük-olasılıklı kenar durum — test ortamında IP her zaman
`127.0.0.1` döndüğü için CANLI üretilemedi, **DOĞRULANAMADI**, zaten yazılı
borç (ui RİSKLER #3), yeni bir bulgu AÇILMADI.

**7. Yükleniyor/boş/hata durumları** — kod incelendi:
`sessionsQuery.isPending` → `Skeleton×3`; `sessionsQuery.isError` →
`role="alert"` + "Tekrar dene" `Button` (CANLI tetiklenmedi, ağ hatası
simülasyonu gerektirir, DOĞRULANAMADI ama `TwoFactorStatusCard`'ın AYNI,
zaten kabul edilmiş deseninin kopyası); "boş" durumu N/A (kod + mantık
doğrulandı — bu kaynak yapısal olarak her zaman ≥1 satır taşır, çağıranın
kendi oturumu). "Yalnızca bu cihaz" bilgi satırı CANLI test edilmedi (ikinci
oturum silindikten sonra tekrar ziyaret edilebilirdi, zaman/oran-sınırı
bütçesi nedeniyle atlandı) — **DOĞRULANAMADI**, kod `sessionsData.length >=
2` kontrolüyle tutarlı, düşük risk.

**8. IP ve cihaz metinleri** — kod okundu: `resolveIpDisplayValue` `null`/
`''` ikisini de `ipUnknown` ("Bilinmiyor")'a eşliyor; `other`/`unknown`
cihaz aileleri aynı Türkçe metne (`browserUnknown`/`osUnknown`) eşleniyor
(ui'nin kararı, `satisfies Record<...>` ile derleme-zamanı tamlık
garantili). Canlı ortamda IP her zaman `127.0.0.1` döndüğü için `null`/aynı-
görünüm çakışma senaryosu ÜRETİLEMEDİ — **DOĞRULANAMADI (canlı)**, ama
docs/ui'nin KENDİ yazılı, zaten kabul edilmiş borcu (RİSKLER #3/#4), yeni
bulgu değil.

**9. Kontrast ve klavye** — **CANLI ölçüldü**, tüm oranlar PASS:
`--color-danger-600` (hata metni) / beyaz = **6.47:1** (≥4.5 ✓),
`--color-danger-500` (destructive buton) + beyaz metin = **4.829:1** (≥4.5
✓), `--color-success-600`/`--color-success-surface` = **4.791:1** (≥4.5 ✓,
docs'un "dar pay" notuyla tutarlı), `--color-text-secondary`/surface =
**7.578:1**, `--color-border`/surface (ikincil buton kenarlığı, UI bileşeni
≥3 eşiği) = **4.759:1** (✓), `--color-focus-ring`/surface = **5.169:1** (✓).
Tüm değerler `packages/ui/src/theme.css`'teki GERÇEK, derlenmiş token
değerleri `getComputedStyle` ile okunarak hesaplandı (WCAG kontrast
formülü, relative luminance). **Tam klavye turu** (aşağıda ayrıca
detaylandırıldı) `Tab` ile tüm etkileşimli öğelere ulaşılabildiğini
gösterdi — B1 HARİÇ (iptal sonrası odak kaybı), görev **yine de
tamamlanabilir** (body'den bir sonraki Tab sayfanın başına sarar, kullanıcı
sıkışmaz, yalnızca bağlamını kaybeder — klavye TUZAĞI değil, odak SIRASI
sorunu).

---

## TAM KLAVYE TURU (adım adım, ölçüldü)

Temiz, iki-oturumlu bir kullanıcıyla `/hesap/guvenlik`'e gidildi, odak
sayfa `h1`'inde başladı (route'un mount-focus'u), ardışık `Tab` basışları:

1. `Tab` → **"Etkinleştir"** (2FA kartının butonu, DOM sırası doğru: 2FA
   kartı önce).
2. `Tab` → **"Sonlandır"** (oturum satırı butonu), erişilebilir ad:
   *"Chrome · Windows oturumunu sonlandır (IP 127.0.0.1, son görülme Az
   önce)"* — doğru, benzersiz.
3. `Tab` → **"Tüm oturumları sonlandır"** (kart altı buton).
4. `Tab` → *(ara durum: `BODY` — bu, dokümanın SONUNA ulaşıldığında
   Playwright/headless Chromium'un kendi "gerçek tarayıcı kromu yok"
   sarma artefaktı; gerçek bir tarayıcıda bu adımda odak adres çubuğuna
   gider, kullanıcı görmez — AYRI bir sorun, B1'in İÇİNDEKİ odak kaybından
   FARKLI: B1 SAYFANIN ORTASINDA, bir diyalog etkileşiminden SONRA olur,
   bu doküman SINIRINDA olur, biri gerçek kusur diğeri ölçüm artefaktı).
5. `Tab` → **"İçeriğe geç"** (skip-link, döngü baştan başlıyor).
6. `Tab` → **"Kullanıcı menüsü"**.
7. `Tab` → **"Panel"** (nav linki).
8. `Tab` → **"Hesap güvenliği"** (nav linki, aktif sayfa).
9. `Tab` → **"Etkinleştir"** (döngü tekrarlıyor, 1'e eşdeğer).

**Sonuç:** Tab sırası mantıklı ve görsel sırayla eşleşiyor (üst nav → skip-
link döngüsü → 2FA kartı → oturumlar kartı). Diyalog İÇİNDE `Tab` davranışı
(odak tuzağı VAR MI): diyalog açıkken `Tab` Radix'in `FocusScope`
`trapped` modunda döngüsel kalıyor (parola input ↔ Vazgeç ↔ Sonlandır ↔ ×
arasında) — bu KASITLI ve DOĞRU bir "tuzak" (modal diyaloğun WCAG 2.1.2
gereği budur, dışarı KAÇMAMALI); sorun yalnızca diyalog KAPANDIKTAN SONRA
odağın NEREYE gittiği (B1).

---

## AXE-CORE ÇIKTISI

4 farklı durumda koşturuldu (liste/baseline, tekil diyalog, toplu diyalog
açık, toplu diyalog 400-hata durumu): **toplam 1 benzersiz ihlal**
(`label-content-name-mismatch`, impact: **serious**, 1 node — `UserMenu`
tetikleyicisi, aynı öğe her taramada tekrar tekrar bulundu çünkü o buton
her sayfada sabit) — **bu T-017'nin kapsamı DIŞINDA** (bkz. L2). T-017'nin
KENDİ yeni yüzeylerinde (ActiveSessionsCard listesi, step-up diyaloğu normal/
400-hata durumları) axe **SIFIR** ihlal buldu. ⚠ Görev talimatının uyardığı
gibi **temiz axe raporu PASS için yeterli değildir** — B1 ve B2 axe'ın
YAKALAMADIĞI, yalnızca elle/canlı DOM inceleme ile bulunan gerçek kusurlar.

**Elle kontrol listesi (yukarıdaki 9 maddenin özeti):**
- [x] Klavye ile tüm akış tamamlanabiliyor (B1'e rağmen, tuzak yok)
- [x] Tab sırası mantıklı
- [ ] Diyalog kapanışında odak yönetimi — **İPTAL yolu BOZUK (B1)**, başarı/404/400 yolları DOĞRU
- [x] Modal odak tuzağı doğru (diyalog İÇİNDE)
- [x] Görünür odak göstergesi (`FOCUS_RING_CLASS_NAMES`, tüm interaktif öğelerde — kod okundu, kaldırılmamış)
- [x] Kontrast 4.5:1/3:1 — canlı ölçüldü, hepsi PASS
- [x] Form alanları programatik etiketli
- [x] Hatalar alanla ilişkili, renge dayanmıyor (metin + aria-invalid/describedby)
- [ ] ARIA doğru ve gerekli — **× butonunun aria-label'ı YANLIŞ (B2)**, geri kalanı doğru
- [x] Buton/bağlantı metinleri bağlamsız anlaşılıyor ("Sonlandır" kısa ama aria-label tam context taşıyor)
- [x] Görsellerde uygun alt — N/A (bu ekranda görsel yok)
- [x] Durum değişiklikleri duyuruluyor (role=status/alert, canlı doğrulandı)
- [ ] `prefers-reduced-motion` — DOĞRULANAMADI (Skeleton paylaşılan bileşen, bu ekrana özgü değil)
- [x] WCAG 2.2 yeni kriterleri — 2.5.8 hedef boyutu PASS (44px), 2.5.7 N/A (sürükle-bırak yok), 3.3.7 N/A (tekrarlayan bilgi girişi yok), 2.4.11 kod incelemesiyle düşük risk
- [x] 320px/360px davranışı — canlı ölçüldü, taşma/kırpma YOK

---

## ÖLÇÜMLER

- **axe-core:** 4 durum tarandı, 1 benzersiz ihlal (serious, kapsam dışı/L2), T-017'nin kendi yüzeylerinde 0 ihlal.
- **İncelenen bileşen/dosya sayısı:** 2 yeni (`ActiveSessionsCard.tsx` 265 satır, `active-sessions-controller.ts`), 3 okunan-değişmeyen (`ConfirmDialog.tsx`, `Card.tsx`, `Input.tsx`), 1 güncellenen rota (`_app.hesap.guvenlik.tsx`), 1 mesaj kataloğu bölümü, 2 API istemci dosyası (`sessions-rest.ts`/`sessions-query.ts`).
- **En kötü ölçülen kontrast oranı:** 4.759:1 (`--color-border`/surface, ikincil buton kenarlığı) — eşik 3:1, rahat geçiyor. En dar pay zaten docs'ta bilinen `success-600`/`success-surface` = 4.791:1 (eşik 4.5:1).
- **Canlı tarayıcı oturumları:** 7 gerçek kullanıcı (sign-up+Mailpit doğrulama+2×sign-in) oluşturuldu; sign-up oranı sınırına (10/saat varsayılan, IP bazlı) **8. denemede** ulaşıldı (429 `RATE_LIMIT_EXCEEDED`) — daha fazla yeni kullanıcı oluşturulamadı, mevcut 1 kullanıcının kimlik bilgileri yeniden kullanılarak ek axe taraması tamamlandı. **RİSK (sonraki ajan için):** sign-up oran penceresi (15 dk) dolana kadar bu IP'den yeni kullanıcı oluşturulamaz; `perf`/sonraki `wcag` turu bunu bilmeli.
- **Playwright/axe altyapısı:** resmî `@axe-core/playwright` entegrasyonu YOK (v0.0.19'da geliyor, ROADMAP'te zaten not düşülü) — bu turda transitif `axe-core@4.14.0` paketi doğrudan enjekte edilerek atlatıldı (scratchpad'deki geçici harness ile, repo'ya hiçbir dosya eklenmedi).

---

## T-016 REGRESYON KONTROLÜ

T-016 `wcag` tur1'in 2 `medium`'u (M-W1: sunucu hatası alanla ilişkisiz;
M-W2: mod geçişinde odak kaybı) tur4'te kapatılmıştı. **Bu Task'ta AYNI
SINIF geri gelmedi** — kontrol edildi:
- M-W1'in sınıfı (sunucu hatası → alandan kopuk genel kutu): T-017'nin 400
  hatası `Input.error`'a DOĞRU bağlanıyor (canlı doğrulandı, `aria-invalid`+
  `aria-describedby`+odak-dönüşü hepsi çalışıyor) — **M-W1 sınıfı YOK**.
- M-W2'nin sınıfı (mod geçişinde `useEffect` bağımlılığı eksik → odak
  taşınmıyor): T-017'de böyle bir mod geçişi YOK (tekil/toplu diyalog AYRI
  açılıp kapanıyor, aynı bileşenin İÇİNDE mod değiştirmiyor) — **uygulanamaz,
  N/A**.

**Ancak bu turda TAMAMEN YENİ bir sınıf (B1) bulundu** — T-016'nın
DOĞRULANAMADI bıraktığı ("ConfirmDialog'un Radix focus trap/Esc/odak-dönüşü
davranışı canlı test edilmedi... Radix'in kendi kapsamına + T-008 UserMenu
emsaline güvenildi") tam da bu turda canlı ölçülüp **yanlış** çıktı. Bu,
"T-016 regresyonu" değil, T-016'nın GEÇMİŞTE doğrulanamayıp güvene
dayandırdığı bir varsayımın bu turda **ilk kez** çürütülmesi.

**İki kart aynı rotada — başlık hiyerarşisi ve `role="alert"` çakışması:**
Kod + canlı DOM incelendi: tek `h1` (`Hesap güvenliği`, route'ta), her iki
kart `CardTitle` (`<p>`, kasıtlı olarak heading DEĞİL) kullanıyor —
hiyerarşi atlaması YOK çünkü ikinci bir heading seviyesi hiç AÇILMIYOR (tek
heading = tek h1). İki kartın `role="alert"` bölgeleri AYRI React state'leri
tarafından YÖNETİLİYOR (2FA kartının kendi `mutationError`'ı,
ActiveSessionsCard'ın kendi `goneNotice`/hata state'i) — aynı anda İKİSİ
DOLU olabilir mi test edilmedi (iki kartı aynı anda hata durumuna sokmak
gerekirdi, düşük öncelik) ama DOM'da BİRBİRİNİ EZEN tek bir paylaşılan
bölge YOK (her kart kendi `<p role="alert">`'ını kendi `CardContent`'i
içinde render ediyor) — yapısal olarak çakışma riski düşük, **DOĞRULANAMADI
(eşzamanlı ikili hata canlı üretilmedi)** ama kod yapısı güvenli görünüyor.

---

## BU SÜRÜMDE DÜZELTİLECEKLER ↔ ROADMAP BORCU AYRIMI

**Bu sürümde düzeltilmeli (FAIL'i kapatacak, düzeltme turu açılmalı):**
- B1 (`high`) — `ConfirmDialog` tüketicilerinde iptal-sonrası odak kaybı.
- B2 (`medium`) — × butonunun "Vazgeç" ile çakışan `aria-label`'ı.

**ROADMAP teknik borcuna kaydedilecek (bu sürümü bloklamaz):**
- L1 (`low`) — 360px'te toplu diyalog butonlarının dikey yerine yatay
  kalması (WCAG ihlali yok, tasarım sadakati farkı).
- L2 (`low`, kapsam dışı) — `UserMenu` tetikleyicisinin axe-tespitli
  `label-content-name-mismatch`'i (T-008 borcu, bu Task'ın konusu değil).
- `@axe-core/playwright` resmi entegrasyonunun eksikliği (ROADMAP'te zaten
  v0.0.19 için not düşülü, bu turun geçici atlatma yöntemi kalıcı çözüm
  DEĞİL).
- Çoklu tarayıcı (Firefox/Safari) + gerçek %200 zoom testi hâlâ yapılmadı
  (yalnızca Chromium, viewport-yaklaşıklaması — ROADMAP'te zaten not düşülü,
  bu tur da aynı sınırı tekrarladı).

---

## HİJYEN

- **Hiçbir repo dosyası değiştirilmedi/oluşturulmadı.** Yalnızca `Read`/`Bash`
  kullanıldı, `Edit`/`Write` hiç çağrılmadı.
- `git status --porcelain | wc -l` → **63** (hem tur BAŞINDA hem SONUNDA
  **birebir aynı** — ölçüldü, değişmedi). ⚠ Handoff paketi "beklenen: 62"
  diyordu; gerçek sayı baştan beri **63**'tü — bu fark BENİM
  eylemlerimden KAYNAKLANMIYOR (hiçbir `Write`/`Edit` çağrısı yapılmadı,
  yalnızca `Read` + salt-okunur `Bash` komutları + scratchpad'e yazma).
  Muhtemel sebep: handoff'un "62" sayımı, Orkestratör'ün son senkron
  anından biraz önceydi (paralel çalışan başka bir ajanın/raporun dosya
  sayısı kayması) — Orkestratör'e bildiriliyor, araştırma önerilir ama bu
  BENİM ürettiğim bir fark DEĞİL.
- Ölçüm harness'leri (`wcag-probe*.cjs`, ekran görüntüleri, ara JSON
  sonuçları) **scratchpad**'de oluşturuldu, iş bitince **silindi**
  (yalnızca KENDİ dosyalarım — scratchpad paylaşılan bir dizin, başka
  ajanların dosyalarına DOKUNULMADI).
- Kendi başlattığım `vite` dev sunucusu (port **5173**) ölçüm bitince
  **kapatıldı** (`lsof` ile doğrulandı — port şimdi boş, `perf` kullanabilir).
- Port **3000** (kullanıcının PID 11734, yabancı süreç) ve **3100**
  (kullanıcının/ortamın kalıcı `apps/api` dev süreci, PID 20714) **hiç
  dokunulmadı** — yalnızca 3100'e salt-okunur proxy hedefi olarak işaret
  edildi, süreç öldürülmedi/yeniden başlatılmadı.
- 7 gerçek test kullanıcısı (`wcag-t017*@arkesoft.test`) oluşturuldu —
  bunlar gerçek veritabanı kayıtları, silinmedi (fixture temizliği bu
  ajanın görevi/yetkisi değil, mevcut e2e fixture'larıyla aynı desen,
  hiçbiri kart verisi/sır İÇERMİYOR).
