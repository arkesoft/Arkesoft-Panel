# T-024 — wcag gate — tur 1

**Tarih:** 2026-11-18 · **Sürüm:** v0.0.20.3 · **GATE:** wcag · **SONUÇ:** PASS

---

## ⚠⚠ Bu kapının kanıtladığı ve KANITLAMADIĞI

**Bu gate kodu DEĞİŞTİRMEDİ, PLAYWRIGHT KOŞTURMADI.** Görev bu turda axe-core'un
ne yaptığını tekrar etmek değil, `@axe-core/playwright` mekanizmasının (`scripts/
playwright/a11y.ts`, ADR-0025, docs/testing.md §7) **dürüst belgelenip belgelenmediğini**
denetlemekti — kaynağı okuyarak (axe-core rule kataloğu, ConfirmDialog.tsx) ve
`git status`/`git log` ile zemin doğrulayarak.

**KANITLADI:** (a) WCAG_RULE_TAGS'in dört etiketi gerçekten axe-core 4.14.0'ın
WCAG 2.0/2.1 A/AA rule kataloğunu kapsıyor (ölçüldü, aşağıda); (b) `ALLOWED_VIOLATIONS`
boş ve `ACKNOWLEDGED_INCOMPLETE_RULE_IDS`'in üç girdisi kaynak koduna karşı
doğrulanabilir gerçek DOM kanıtı taşıyor (ConfirmDialog.tsx okundu, satır numaraları
BİREBİR eşleşti); (c) docs/testing.md §7 "erişilebilirlik artık mekanik" türünden
bir aşırı iddia TAŞIMIYOR, tam tersine bu cümleyi açıkça yasaklıyor; (d) önceki
turlarda (security/qa tur 1) ölçümle çürütülen dört iddia ("target[0] güvenli alan",
"PII riski kaynakta kapatıldı" [eksik], "dosya hiç doğmaz", ROADMAP'in bayat
zafiyet sayımı) kodda/dokümanlarda GERÇEKTEN düzeltilmiş durumda (tek tek
doğrulandı, aşağıda); (e) üretim koduna (`apps/*/src`, `packages/themes`) hiçbir
A-sınıfı düzeltme İNMEDİ — bu sürüm gerçekten test-only (`git status --porcelain`
boş döndü).

**KANITLAMADI (ve kanıtlayamaz — bu kapının yapısal sınırı):** axe'ın gerçekten
erişilebilir olup olmadığı. Odak yönetimi, klavye tuzağı, `aria-live` duyurusu,
açılmamış içerik, metin kalitesi/i18n, `best-practice` sınıfı kurallar (`h1`
eksikliği gibi) ve **WCAG 2.2 AA'nın `wcag22aa` etiketi altındaki hiçbir kriter**
bu mekanizma tarafından TARANMIYOR. Bu tur bu altı sayfanın gerçek erişilebilirliğini
elle tekrar denetlemedi (görev tanımı bunu istemedi — mekanizma denetimi, sayfa
denetimi değil) ve Playwright koşturulmadığı için bugünkü canlı DOM davranışı
bu raporda TEYİT EDİLMEDİ; güvenilen kaynak `qa`'nın bağımsız ölçtüğü koşum
sonuçları (admin 31/31, storefront 17/17, self-test 5/5).

---

## Beş madde — ayrı ayrı sonuç

### 1. `WCAG_RULE_TAGS` gerçekten WCAG 2.1 A/AA'yı kapsıyor mu?

`scripts/playwright/a11y.ts:128` — `WCAG_RULE_TAGS = ['wcag2a','wcag2aa','wcag21a','wcag21aa']`.

**Nasıl ölçtüm:** `node_modules/.pnpm/axe-core@4.14.0/node_modules/axe-core` içindeki
gerçek `axe-core` modülünü `node -e` ile yükleyip `axe.getRules()`'ı bu dört etikete
karşı filtreledim:

```
wcag2a    62 kural (area-alt, aria-allowed-attr, ... button-name, label, ...)
wcag2aa    3 kural (color-contrast, meta-viewport, valid-lang)
wcag21a    1 kural (label-content-name-mismatch)
wcag21aa   3 kural (autocomplete-valid, avoid-inline-spacing, css-orientation-lock)
wcag22aa   1 kural (target-size)      ← KÜMEDE YOK
best-practice  30 kural                ← KÜMEDE YOK (D21'in konusu)
```

**Sonuç — İDDİA = KAPSAM (kısmen):** dört etiketin birleşimi (69 kural) axe-core'un
WCAG **2.0/2.1** A/AA rule kataloğunun **tamamını** kapsıyor — a11y.ts'in kendi
yorumundaki iddia ("WCAG 2.1 A/AA uygunluk taraması") doğru ve tam, FAZLA İDDİA
EDİLMİYOR (ne "WCAG 2.2" ne "best-practice" iddiası var).

**⚠ BULGU (yeni, bu turda bulundu) — `wcag22aa` boşluğu BELGESİZ:** `wcag22aa`
etiketi **bilerek** kümede yok ve bu, axe-core'un `target-size` kuralını (WCAG
**2.5.8 Hedef Boyutu (Minimum)** — tam olarak benim kendi ajan tanımımın madde 10'da
istediği kriter) devre dışı bırakıyor. `docs/testing.md` §7'nin "axe'ın kapsamadığı
sekiz eksen" tablosunda ve `ADR-0025`'te `wcag22aa`/`2.5.8`/"WCAG 2.2" hiç
GEÇMİYOR (`grep -n "wcag22\|WCAG 2.2\|2\.2"` → sıfır eşleşme ikisinde de). Bu, bu
ajanın kendi şart tanımı ("WCAG 2.2 AA") ile kurulan mekanizmanın kapsamı (WCAG
2.1 A/AA) arasındaki farkın **hiçbir yerde kayda geçmediği** anlamına gelir —
mimari/`architect`'in ADR'de ele aldığı sekiz eksenin dışında kalan, dokuzuncu bir
eksen. Bu bir "axe yeşil ⇒ erişilebilir" tuzağı DEĞİL (çünkü iddia zaten "WCAG 2.1",
2.2 değil) ama CLAUDE.md §4 ve bu ajanın kendi görev tanımının "WCAG 2.2 AA"
dediği yerde sessiz bir sürüm farkı var — **SEV: medium**, bkz. BULGULAR.

### 2. Allowlist boş mu? Üç `ACKNOWLEDGED_INCOMPLETE` girdisi tek tek denetlendi

`ALLOWED_VIOLATIONS` (`a11y.ts:168`) — **boş**, doğrulandı (kaynak satırı okundu).

`ACKNOWLEDGED_INCOMPLETE_RULE_IDS` (`a11y.ts:223-268`) — üç girdi, **tek tek**
denetlendi:

| ruleId | domEvidence iddiası | Doğrulama |
| --- | --- | --- |
| `aria-hidden-focus` | "3 düğüm: 2 Radix focus-guard span + #root (aria-hidden, inert yok)" | ConfirmDialog.tsx OKUNDU — `@radix-ui/react-dialog` kullanılıyor (satır 44, 80-120), bileşen ELLE `focus()` çağırmıyor (dosya başı yorumu, satır 9-12) — Radix'in runtime focus-trap davranışı axe'ın statik analizinin görmediği bir mekanizma, iddia PLAUSIBLE ve kaynakla TUTARLI. |
| `color-contrast` | "1 düğüm: ConfirmDialog.tsx:84 Dialog.Title, metin rgb(15,23,42), overlay şeffaf" | ConfirmDialog.tsx:84 `Dialog.Title` İFADESİ TAM BU SATIRDA (BİREBİR eşleşti) ve `Dialog.Overlay` satır 82'de tüm ekranı kaplayan yarı şeffaf katman — axe'ın "arka plan birden fazla katmanla örtüşüyor, hesaplanamadı" senaryosu DOĞRULANDI. |
| `label-content-name-mismatch` | "ConfirmDialog.tsx:106-117 kapatma butonu, aria-label='Kapat', görünür içerik aria-hidden ×" | ConfirmDialog.tsx:106-117 BİREBİR eşleşti — `aria-label={closeLabel}` (satır 109) + `<span aria-hidden="true">×</span>` (satır 115). Dosyanın KENDİ W-2 yorumu (satır 14-23) bu alanın ÖNCEDEN gerçek bir ihlal (Label in Name) OLDUĞUNU, `closeLabel` prop'uyla DÜZELTİLDİĞİNİ belgeliyor — bugünkü `incomplete` farklı bir durumdur (mismatch yok, sadece belirsizlik), iddia TUTARLI. |

Üçünün de `reason` + `domEvidence` alanları BOŞ DEĞİL (çalışma zamanı kontrolü
`findEmptyFieldError` zaten bunu zorluyor, `a11y.ts:519-553`), `debtVersion`
hepsinde `'v0.0.20.5'` ve bu sürüm `ROADMAP.md:3903-3913`'teki "Vadesi v0.0.20.5
/ v0.0.21 / v0.0.22 — Erişilebilirlik kapısı kaynaklı borçlar (T-024)" başlığı
altında **kayıtlı** (doğrulandı, `grep -n "v0.0.20.5"` ile). **Üçü de GERÇEK —
kurgu/süsleme değil.**

### 3. `docs/testing.md` §7 sekiz eksen ad ad güncel mi, fazla iddia yok mu?

`docs/testing.md:289-320` okundu. "Kurulacak cümle" (§7, satır 302-303):
**"Kontrast ve etiket regresyonu artık mekanik; odak/klavye/duyuru `wcag`'ın elle
kontrol listesinde KALIR."** — bu cümle DAR ve DOĞRU kapsamlı (yalnızca kontrast+
etiket, "erişilebilirlik" değil). Satır 305: **"Bunun ötesinde bir iddia
('erişilebilirlik artık mekanik') yanlıştır ve YAZILMAZ"** — `grep -n "artık
mekanik"` taradım, metinde BU YASAKLI cümle **yok**, yalnızca kendi yasağını
belirten cümle var. Sekiz eksen tablosu (satır 309-320) ad ad: odak yönetimi,
`aria-live`, klavye/tuzak, açılmamış içerik, görsel/gradyan kontrast, metin
kalitesi, reflow, `best-practice` kuralları — hepsi GÜNCEL ve `wcag`'ın bu
sürümdeki gerçek sınırlarıyla TUTARLI.

**⚠ Tek eksik (madde 1'deki bulguyla AYNI):** bu sekiz eksen tablosu WCAG 2.2 AA'nın
kendi yeni kriterlerini (özellikle 2.5.8 Hedef Boyutu, ki axe-core bunun için TEK
BİR etiket eklemekle kısmen mekanize edebilirdi) **dokuzuncu bir satır olarak
listelemiyor.** Tablo "axe'ın WCAG 2.1 kapsamında kapsamadıkları" diye doğru bir
şekilde çerçevelenmiş ama "WCAG 2.2'nin tamamı kapsam dışı" cümlesi hiçbir yerde
AÇIKÇA YAZILMIYOR — gate'in kendi adı "WCAG (WCAG 2.2 AA)" olduğu için bu sessizlik
kayda değer.

### 4. "axe yeşil ⇒ PASS" demek

Bu rapor BU CÜMLEYİ KURMAZ. SONUÇ PASS'ın gerekçesi axe'ın yeşil olması DEĞİL —
gerekçe: mekanizmanın kendisi (allowlist disiplini, `incomplete` fail-closed
tasarımı, PII azaltma, tek-kaynak zorlaması) dürüst belgelenmiş, önceki turların
çürüttüğü dört iddia gerçekten düzeltilmiş, ve tek yeni bulgu (`wcag22aa` boşluğu)
yalnızca `medium` seviyesinde bir dokümantasyon eksikliği — FAIL eşiğine
(critical/high veya ≥3 medium) ULAŞMIYOR.

### 5. Üretim koduna A-sınıfı düzeltme indi mi?

**Ölçüm:** `git status --porcelain -- 'apps/admin/src' 'apps/superadmin/src'
'apps/storefront/src' 'apps/api/src' 'packages/themes'` → **boş çıktı** (exit 0,
hiçbir satır). Ayrıca `ConfirmDialog.tsx` (incomplete ack'lerinin referans aldığı
TEK üretim dosyası) okundu — dosyanın kendi yorumları T-016/wcag-FIX-turu-1/4'ten
kalma, **bu Task'a ait HİÇBİR değişiklik yok** (T-024'ün uncommitted değişiklik
listesinde bu dosya YOK). **Sonuç: üretim kodu DEĞİŞMEDİ, bu sürüm gerçekten
test-only — elle yeniden denetim gerektiren bir yüzey YOK.**

---

## BULGULAR

- [SEV: medium] `scripts/playwright/a11y.ts:128` (`WCAG_RULE_TAGS`), `docs/testing.md:309-320` (sekiz eksen tablosu), `docs/adr/0025-erisilebilirlik-kapisinin-mekanik-siniri.md` — `wcag22aa` etiketi (axe-core'un **tek** WCAG 2.2 AA kuralı, `target-size`/SC 2.5.8 Hedef Boyutu Minimum) bilerek kümeye alınmamış ama bu karar **hiçbir yerde belgelenmemiş** (`grep -n "wcag22\|WCAG 2.2"` → docs/testing.md ve ADR-0025'te sıfır eşleşme). Bu ajanın kendi görev tanımı "WCAG 2.2 AA" dediği için (ve madde 10'da açıkça 2.5.8'i istediği için) bu fark kayda değer — "iddia ≠ kapsam" denetimi başarılı (a11y.ts yalnızca "2.1" diyor, fazla iddia yok) ama kapsam farkının KENDİSİ sessiz. Önerilen düzeltme: `docs/testing.md` §7'ye dokuzuncu bir satır (WCAG 2.2 AA'nın tamamen kapsam dışı olduğu, `wcag22aa`'nın tek kuralının (`target-size`) bile dahil edilmediği) eklensin; ADR-0025'e bir "gözden geçirme notu" veya yeni borç kalemi (`D27` sınıfı) düşülsün — mimarinin bir sonraki sürümde `wcag22aa`'yı ekleyip eklememeye bilinçli karar vermesi için. — sorumlu: `docs` (dokümantasyon eksikliği) / `architect` (bilinçli karar + ADR güncellemesi).

---

## ÖLÇÜMLER

- axe-core 4.14.0 gerçek rule kataloğu `node -e` ile yüklendi: toplam 105 kural; `wcag2a`=62, `wcag2aa`=3, `wcag21a`=1, `wcag21aa`=3 (WCAG_RULE_TAGS birleşimi=69 kural), `wcag22aa`=1 (kümede yok), `best-practice`=30 (kümede yok).
- İncelenen dosyalar: `scripts/playwright/a11y.ts` (581 satır, tam okundu), `docs/testing.md` §7 (satır 287-420), `docs/adr/0025-erisilebilirlik-kapisinin-mekanik-siniri.md` (174 satır, tam okundu), `ROADMAP.md` (D21-D26 debt satırları, grep ile), `apps/admin/src/components/ConfirmDialog.tsx` (123 satır, tam okundu, satır-satır doğrulama), `apps/admin/e2e/a11y-helper-self-test.spec.ts` (5 senaryo doğrulandı), `apps/admin/e2e/accessibility.spec.ts` (iki tarama, dialog-açık mekanizması doğrulandı), `scripts/guards.sh` (`check_axe_single_source` satır 913-959 doğrulandı).
- Üretim kodu değişiklik taraması: `git status --porcelain -- apps/*/src packages/themes` → **boş** (test-only sürüm doğrulandı).
- Playwright/`pnpm test:e2e`/`pnpm build` **koşturulmadı** (görev talimatı) — bu raporun "koşum sonucu" iddiaları `qa`'nın bağımsız ölçtüğü sayılara (admin 31/31, storefront 17/17, superadmin 2 koştu/1 geçti [`D24`, T-024 regresyonu değil], self-test 5/5, guards 22/22) atıf yapar, bu turda TEKRAR ÜRETİLMEDİ.
- Önceki turlarda çürüyen 4 iddianın düzeltme durumu: 4/4 doğrulandı düzeltilmiş (`target[0]` artık `redactSensitivePatterns`'ten geçiyor — a11y.ts:397-414; `PLAYWRIGHT_NO_COPY_PROMPT` env'i eklendi — ADR-0025 gözden geçirme notu madde 2; "dosya hiç doğmaz" iddiası docs/testing.md'de düzeltilmiş hâliyle mevcut — "dosya hâlâ doğar, yalnızca PII bölümü bastırılır"; ROADMAP D26 güncel sayım — "2 high" — mevcut).
- D21-D26 borç satırlarının ROADMAP karşılığı: 6/6 doğrulandı mevcut (`ROADMAP.md:3936-3941`).

## DOĞRULANAMADI

- Bugünkü canlı DOM'un gerçekten 0/6 sayfa ihlal taşıdığı iddiası — bu turda Playwright koşturulmadığı için **tekrar üretilmedi**; `qa` tur 1'in bağımsız ölçtüğü sayılara güvenildi.
- `wcag22aa` etiketinin eklenmesi hâlinde gerçekten yeni bir ihlal çıkıp çıkmayacağı — ölçülmedi (görev kapsamı dışı, test koşturma yasağı).
