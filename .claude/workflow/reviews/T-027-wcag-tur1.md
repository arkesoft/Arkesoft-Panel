# T-027 — wcag gate — tur 1

Tarih: 2026-11-20 · Sürüm: v0.0.18 (Çoklu dil ve para birimi altyapısı) · Branch: feat/v0.0.21-surum-kayit-modeli

GATE: wcag
SONUÇ: PASS

## Kapsam notu (dar, architect/po'nun ölçümüyle doğrulandı)

S7'nin dokunduğu 11 dosya bağımsız olarak grep ile tekrar doğrulandı:
`apps/{admin,superadmin}/src/errors/{panel-error,normalize-panel-error}.ts`,
`.../src/messages/messages.ts`, `apps/superadmin/src/lib/format-platform-date.ts`
+ 4 test dosyası. **0/11 JSX/bileşen** — `grep -l "return (\|<div\|<p " <11 dosya>` → 0 eşleşme,
`.tsx` uzantılı dosya yok. DOM yapısı, ARIA niteliği, CSS, odak yönetimi **dokunulmadı**.
Değişen tek şey: `PanelError` → Türkçe metin çözümleme mantığı (hangi kod hangi metne
düşüyor) ve iki panelin platform-kodu aynasının merkezi deftere taşınması.

⇒ Playwright/axe **koşturulmadı** — maliyet/fayda değerlendirmesi: T-024'ün axe taraması
DOM/ARIA'ya bakar, bu Task'ta DOM/ARIA **0** satır değişti (yukarıdaki ölçüm). Yeni
etkileşimli öğe yok, yeni ARIA niteliği yok, yeni landmark yok. Statik inceleme bu eksende
yeterli; Playwright koşmanın marjinal kanıt değeri bu Task için düşük.

## 1. Render yolu ve duyuru (`aria-live`) — ölçüldü

`resolvePanelErrorMessage`'ın (ve superadmin karşılığının) üretim tüketicileri bağımsız
olarak grepleniyor:

```
apps/admin/src/{routes/_app.tsx, routes/_auth.sign-in.tsx, routes/_auth.kayit.tsx,
  features/registration/StoreWizard.tsx, features/sessions/ActiveSessionsCard.tsx,
  features/sessions/active-sessions-controller.ts, features/two-factor/*.tsx}
apps/superadmin/src/{routes/_app.tsx, routes/_auth.giris.tsx,
  routes/iki-adimli-dogrulama.tsx, features/two-factor/*.tsx}
```

Hepsi mevcut `role="alert"` / `role="status"` bölgelerine yazıyor (örnek:
`ActiveSessionsCard.tsx:202,218,225,442`; `ErrorState.tsx` iki panelde `role="alert"`
kapsayıcı, `apps/admin/src/components/ErrorState.tsx:41`,
`apps/superadmin/src/components/ErrorState.tsx:38`). Bu bölgeler **S7'nin dosya
listesinde yok** — dokunulmadı, hâlâ aynı. ⇒ Yeni/eski metin **aynı duyuru mekanizmasından**
geçiyor; 15 koddan 15'i artık jenerik yerine özel metin aldığı için **duyurulan metin
değişti ama duyuru yolu değişmedi**.

⚠ Not: Bugün bu kodların (ör. `INVITATION_INVALID`, `ALREADY_MEMBER`,
`PENDING_INVITATION_LIMIT_REACHED`, `OWNER_MEMBERSHIP_PROTECTED`) hiçbiri için
`apps/admin/src`'te gerçek bir çağrı yeri (üye/davet ekranı) **yok** — ölçüldü:
`grep -rln "ALREADY_MEMBER\|INVITATION_INVALID\|PENDING_INVITATION_LIMIT_REACHED\|OWNER_MEMBERSHIP_PROTECTED" apps/admin/src --include="*.tsx"` → **0 eşleşme**. Bu kodlar bugün
yalnızca `JOB_*` ailesiyle aynı durumda: katalogda var, ekranda yok. Gelecekte bir üye/davet
UI'ı eklendiğinde bu bulgunun "duyuru yolu" varsayımı **o ekranın kendi** `role="alert"`
kapsayıcısına bağlıdır — bu Task'ın kapsamı dışı, not olarak bırakılıyor.

## 2. Metin uzunluğu / kesilme riski — ölçüldü

35 anahtarın tamamının karakter sayısı çıkarıldı (script ile). En uzun: `errors.member.
pendingInvitationLimitReached` (YENİ, #26) **128 karakter**. Önceki en uzun (taşınan/
yeniden kullanılan ailede) `errors.auth.accountTemporarilyLocked` **121 karakter**.
Fark **7 karakter** — `ux`'in "mevcut 17 metinle aynı uzunluk sınıfı" iddiası doğrulandı
(büyüme ihmal edilebilir, iki/üç cümlelik yapı korunuyor). `ErrorState.tsx`'in mesaj
`<p>`'si `max-w-md` + sabit yükseklik/`overflow-hidden`/`truncate` **taşımıyor** — metin
serbestçe satır kırar, 320px genişlikte veya 200% zoom'da kesilme riski yok (statik CSS
incelemesi; sınıf listesinde `line-clamp`/`overflow` **0 eşleşme**).

## 3. `INVITATION_INVALID` / `ALREADY_MEMBER` ayırt edilemezliği — architect'in sorduğu soru, cevaplandı

**WCAG ihlali değil.** Gerekçe: WCAG 3.3.1 (Hata Tanımlama) hatanın **var olduğunun ve
neyle ilgili olduğunun** metinle bildirilmesini ister ("Bu davet geçerli değil" bunu
karşılıyor — davetin kullanılamaz olduğu açık); kök nedenin (sahte token / zaten üye)
ayırt edilmesini **istemez**. Daha önemlisi: bu belirsizlik **ekran okuyucu kullanıcısını
sighted kullanıcıya göre dezavantajlı kılmıyor** — iki kullanıcı grubu da **aynı** metni
görüyor/işitiyor, bilgi asimetrisi yok. Bu, erişilebilirlik sorunlarının tanımı olan
"bir grubun diğerine göre daha az bilgiye/işleve erişmesi" kalıbına uymuyor; bu tamamen
güvenlik/UX kararı (docs/ux/T-027.md'nin "Oracle taraması" bölümünde yazılı).

⭐ Düşük öncelikli, çözüm turu AÇMAYAN öneri (güvenlik kararını bozmadan, iki kod için
**ortak** kalacak şekilde): metne bir sonraki-adım cümlesi eklenebilir — örn. "Daveti
gönderen kişiden yeni bir davet isteyin." — bu, `PERMISSION_DENIED` gibi diğer jenerik
mesajların zaten taşıdığı eylem-çağrısı desenine (WCAG 3.3.3 Hata Önerisi, AA) daha
yakın olurdu. Metin İKİ kod için de **aynı** eklenirse ayırt edilebilirlik doğmaz.

## 4. AC-50 — tarih biçimi, ekran okuyucu okuması

`format-platform-date.test.ts`'in AC-50 testi `formatPlatformDate(x) === formatDate(x)`
(seçeneksiz çağrı) doğruluyor; `format-date.ts`'in varsayılanları (`dateStyle: 'medium'`,
`timeStyle: 'short'`, `locale: 'tr-TR'`) eski yerel `Intl.DateTimeFormat('tr-TR', {...})`
çağrısıyla **bayt-eş**. ⇒ Çıktı dizesi değişmedi, ekran okuyucunun tarih okuma davranışı
(örn. VoiceOver/NVDA'nın yerelleştirilmiş tarih telaffuzu) **bu Task'tan etkilenmiyor**.

## 5. JOB_* jenerik metinler — eylem sunuyor mu

5 `JOB_*` metninin hepsi bir eylem çağrısı taşıyor ("tekrar deneyin", "sayfayı yenileyip
tekrar deneyin") — WCAG 3.3.3 (Hata Önerisi, AA) ruhuna uygun; kuyruk/handler/iş adı
sızdırmıyor (ux'in kendi kontrolü + bağımsız okuma ile doğrulandı). Bu kodlar bugün
kullanıcıya hiç ulaşmıyor (architect/ux'in ölçümü, yukarıda #2'de de doğrulandı) — ölü
olmaları erişilebilirlik riski değil, ileride bir UI eklendiğinde bu metinler zaten
eylem-çağrısı deseniyle hazır.

## 6. WCAG 2.2 yeni kriterleri ve mobil/zoom

Yeni etkileşimli öğe **0**, yeni hedef (`button`/`a`) **0**, sürükle-bırak **0**,
tekrarlayan veri girişi akışı **0** ⇒ 2.4.11 / 2.5.7 / 2.5.8 / 3.3.7 bu Task'ta **konusuz**
(mevcut T-024 borcu `D28`, hedef boyutu, bu Task'ın parçası değil). 320px/200% zoom: yalnızca
metin içeriği değişti, kapsayıcı CSS'i (`ErrorState.tsx`, consumer `<p>` etiketleri)
dokunulmadı — regresyon riski yok (madde 2'nin CSS incelemesiyle aynı kanıt).

## Kontrol listesi

- [x] axe taraması — **koşturulmadı, gerekçeli** (DOM/ARIA 0 satır değişti, madde "Kapsam notu")
- [~] Klavye akışı — konusuz (yeni etkileşimli öğe yok)
- [~] Tab sırası / klavye tuzağı — konusuz (DOM değişmedi)
- [~] Modal/sheet odak yönetimi — konusuz (bu Task modal eklemiyor/değiştirmiyor)
- [x] Görünür odak göstergesi — konusuz (buton/öğe eklenmedi, mevcut `ErrorState`/consumer bileşenleri dokunulmadı)
- [x] Kontrast — konusuz (yeni renk/token yok; metin rengi sınıfları değişmedi)
- [~] Form etiketleri — konusuz (form alanı eklenmedi/değiştirilmedi)
- [x] Hata metni/renk — mevcut desen (ikon yok, yalnızca metin + `role="alert"`) korunuyor
- [x] ARIA doğruluğu/gerekliliği — `role="alert"`/`role="status"` kullanımı **değişmedi** (madde 1)
- [x] Buton/bağlantı metni anlaşılırlığı — konusuz (buton metni eklenmedi)
- [~] `alt` metni — konusuz (görsel yok)
- [x] Durum duyurusu (`aria-live`/`role="alert"`/`role="status"`) — madde 1'de ölçüldü, PASS
- [~] `prefers-reduced-motion` — konusuz (animasyon eklenmedi)
- [x] WCAG 2.2 yeni kriterleri — madde 6, konusuz
- [x] 320px / 200% zoom — madde 2'de CSS incelemesiyle doğrulandı

BULGULAR:
  - [SEV: low] docs/ux/T-027.md:95,106 (`#22 INVITATION_INVALID` / `#33 ALREADY_MEMBER`) —
    kasıtlı aynı metin ("Bu davet geçerli değil."). WCAG ihlali DEĞİL (madde 3'te
    gerekçelendirildi — belirsizlik tüm kullanıcılar için simetrik, 3.3.1 hatayı
    tanımlama şartını karşılıyor). Öneri (düzeltme turu AÇMAZ, güvenlik kararını
    bozmadan): metne iki kod için ORTAK bir sonraki-adım cümlesi eklenebilir
    ("Daveti gönderen kişiden yeni bir davet isteyin.") — WCAG 3.3.3'e daha yakın olur.
    Sorumlu ajan: `ux` (gelecek bir alt görevde, bu Task'ın kapsamı değil).

ÖLÇÜMLER:
  - axe ihlal sayısı: koşturulmadı (gerekçeli, bkz. "Kapsam notu")
  - İncelenen dosya sayısı: 11 (S7 çıktısı, 6 üretim + 5 test, 0 JSX) + `docs/ux/T-027.md`
    (35 satırlık tablo) + 2× `ErrorState.tsx` (referans, dokunulmadı) + 11 consumer dosyası
    (`resolvePanelErrorMessage` render noktaları, referans, dokunulmadı) + `format-date.ts` +
    `format-platform-date.ts` + ilgili test dosyaları
  - En kötü/en uzun metin: `errors.member.pendingInvitationLimitReached` 128 karakter
    (önceki maksimum 121 karakter, +7 — ihmal edilebilir büyüme)
  - Kontrast: ölçülmedi — konusuz (yeni/değişen renk token'ı 0, `security` ve `solid`
    raporlarında da aynı kapsam daralması teyitli)
  - DOM/ARIA diff: 0 satır (bağımsız grep ile doğrulandı, `po`'nun ölçümüyle tutarlı)
