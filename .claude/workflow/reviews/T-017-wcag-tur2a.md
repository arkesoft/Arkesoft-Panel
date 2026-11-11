# T-017 — wcag gate — tur 2a

Tarih: 2026-11-11
Sürüm: v0.0.15.1
Kapsam: SADECE İş ① (setTimeout(0) kararı) ve İş ② (6 ölçümün gerçek ekranda teyidi).
İş ③ (axe + tam klavye turu) bu turun kapsamı DIŞINDA — wcag tur 2b yapacak.

## Durum (devam ediyor — aşama aşama güncelleniyor)

Zemin doğrulandı:
- 5173 boş (lsof exit 1, LISTEN yok)
- 3000 → PID 11734 (kullanıcının, DOKUNULMADI)
- 3100 → PID 63279 (kullanıcının, DOKUNULMADI)


## Oran sınırı bütçesi — ölçüm (başlangıç)

Komut: `redis-cli -p 6379 keys 'platform:auth:*'` (ve db0-3 taranarak `-n <i>` ile,
`RATE_LIMIT_KEY_PREFIX = 'platform:auth'` kaynağı `apps/api/src/auth/rate-limit/rate-limit.service.ts:34`
okunarak doğrulandı). Sonuç: **0 anahtar** (tüm db'lerde) — önceki pencereler
(15 dk login, 1 saat email) süresi dolmuş durumda. **Ölçülen bütçe: 20/20 login-ip,
10/10 email-ip TAM** (şu an sıfırdan).


## İŞ ② — qa'nın testi gerçek ekranda koşturuldu (ADIM 1)

⚠ Keşif: port 3000'de Arkesoft API DEĞİL, kullanıcının ilgisiz bir Next.js projesi
("CNC CAD/CAM & Nesting") çalışıyor (`curl -i POST :3000/auth/sign-up/email` → 404,
gövde Next.js `_next/static` HTML'i). `lsof -iTCP -sTCP:LISTEN` ile doğrulandı: 3000 ve
3100'de SADECE kullanıcının iki süreci var, Arkesoft `apps/api` hiçbir yerde ÇALIŞMIYORDU.
İlk koşum bu yüzden sign-up adımında `expect(signUpResponse.ok()).toBe(true)` → false ile
düştü (altyapı eksikliği, davranış hatası DEĞİL).

Çözüm: Arkesoft `apps/api`'yi **3000'e DOKUNMADAN** 3001'de başlattım (dist önceden
build edilmişti, yeniden derleme yapmadım):
```
cd apps/api && API_PORT=3001 DATABASE_AUTH_URL="postgresql://arkesoft_auth:arkesoft_auth_dev_only@localhost:5432/arkesoft?schema=public" \
  node --env-file-if-exists=../../.env dist/main.js &
```
(`.env`'e YAZILMADI — sadece kabuk env değişkeni, Node `--env-file` zaten var olan
`process.env` değerini EZMEZ.) Doğrulama: `curl -X POST :3001/auth/sign-in/email` → 401
(sunucu canlı, beklenen "geçersiz kimlik bilgisi" yanıtı).

admin'in vite proxy hedefi `ARKESOFT_PANEL_DEV_API_TARGET` ile 3001'e yönlendirildi
(`vite.config.ts:61`, K5 — dev-only opsiyonel override, kod değişikliği YOK):
```
cd apps/admin && ARKESOFT_PANEL_DEV_API_TARGET=http://127.0.0.1:3001 \
  npx playwright test e2e/session-security-dialog-focus.qa.spec.ts --reporter=line
```
Playwright kendi `webServer`'ını (vite, 5173, `--strictPort`) kendi başlattı/durdurdu.

**SONUÇ: 2 passed (4.9s)** — qa'nın dosyası DEĞİŞTİRİLMEDİ, orijinal haliyle koştu.


## İŞ ① — setTimeout(0) kararı — YARIŞ SENARYOSU ÖLÇÜMÜ

Mekanizma doğrulandı (kod okuma): `ActiveSessionsCard.tsx:126-130` (`focusDialogTrigger`)
VE `TwoFactorStatusCard.tsx:89-92` **BİREBİR AYNI** `setTimeout(() => ref.current?.focus(), 0)`
deseni — iki kartta da tek bir paylaşılan `dialogTriggerRef`, "tekil Sonlandır" VE "Tüm
oturumları sonlandır" VE "Devre dışı bırak" tetikleyicilerinin hepsi bu ref'e yazıyor.
Yarış ölçümü tek kartta (ActiveSessionsCard) yapıldı, sonuç KOD SEVİYESİNDE ikinci karta
GENELLENEBİLİR (aynı kütüphane sürümü, aynı mekanizma, aynı event-loop zamanlaması).

Scratchpad probe: `wcag-race-probe.spec.ts` + `wcag-race-probe.config.ts`
(`apps/admin/playwright.config.ts`'in webServer/baseURL ayarlarının BİREBİR kopyası,
sadece `testDir` scratchpad'e çevrildi — depoya hiçbir dosya YAZILMADI). Koşum:
```
ARKESOFT_PANEL_DEV_API_TARGET=http://127.0.0.1:3001 npx playwright test \
  --config=".../scratchpad/wcag-race-probe.config.ts" --reporter=line
```

**Gerçekçi etkileşim probları (CDP üzerinden `page.keyboard`/`page.mouse`, GERÇEK bir
kullanıcının/AT'nin erişebileceği hız) — DÖRDÜ DE TEMİZ, body odağı YOK:**
- PROB1 (Escape, hemen ardından `await` İLE ayrılmış ama minimal gecikmeli Tab):
  sonuç `{"tag":"A","text":"İçeriğe geç"}` — odak ÖNCE tetikleyiciye döndü, Tab SONRA
  doğru bir sonraki öğeye (atla bağlantısı) geçti. **`isBody` hiçbir ADIMDA true değil.**
- PROB2 (art arda çift Escape): final odak `BUTTON "Sonlandır"` — tetikleyici.
- PROB3 (Escape → hemen yeniden aç): dialog yeniden açılınca odak `INPUT` —
  **bu BEKLENEN davranış** (`SessionStepUpDialog` HER İKİ `dialogKind` için de bir
  parola `Input`'u render ediyor, `ActiveSessionsCard.tsx:412-469`; açılışta
  `passwordInputRef.current?.focus()` ÇAĞRILIYOR, :434). Body DEĞİL, yanlış pozitif
  değil.
- PROB4 (Escape → hemen sayfanın boş bir köşesine tıklama): final odak
  `BUTTON "Sonlandır"` — tetikleyici.

**PROB5 — ZORLAMA prob (GERÇEKÇİ DEĞİL, `page.evaluate` İÇİNDE `document.dispatchEvent`
ile SENKRON native `keydown` + aynı closure'da art arda `activeElement` örneklemesi):**
```
sync-after-dispatch     → INPUT  (isBody:false)
after-microtask         → BODY   (isBody:TRUE)   ⚠ ölçülen GEÇİCİ pencere
after-setTimeout0-A      → BUTTON (isBody:false)  — focusDialogTrigger() ÇALIŞTI
after-setTimeout0-B      → BUTTON (isBody:false)  — kalıcı
final (100ms sonra)      → BUTTON "Sonlandır"
```

**YORUM — "tetikledim" / "tetikleyemedim" açık cevap:** PROB5 ile yarış penceresini
**TETİKLEDİM** — bir mikro görev sınırında `document.activeElement === document.body`
GERÇEKTEN ölçüldü, `frontend`'in kaynak-kodu okuyarak çıkardığı sonuçla BİREBİR örtüşüyor.
AMA bu pencereye ulaşmak için **gerçekçi olmayan** bir teknik gerekti: `page.evaluate`
İÇİNDE senkron `dispatchEvent` + AYNI JS çalışma turunda `activeElement` sorgusu — gerçek
bir kullanıcının klavyesi, ekran okuyucusu veya hatta CDP üzerinden gönderilen
`page.keyboard.press` (PROB1/2/4, GERÇEK round-trip gecikmesi taşıyor) bu pencereye HİÇ
GİREMEDİ (dördü de `isBody` hiç görmedi). Pencere bir boyama/render turu İÇİNDE DEĞİL,
TEK bir senkron JS yürütmesinin mikro görev arası — tarayıcı bu noktada hiçbir çerçeve
boyamaz, ekran okuyucuya hiçbir AX ağacı güncellemesi gitmez (DOM "body'ye odaklı" olarak
hiçbir zaman RENDER EDİLMİYOR/DUYURULMUYOR).

**KARAR: (A) — `setTimeout(0)` KABUL, bu sürümde DEĞİŞİKLİK YOK.**
Gerekçe: ölçülen pencere gerçek ama (1) yalnızca zorlama/senkron JS enjeksiyonuyla
ulaşılabiliyor, GERÇEKÇİ klavye/fare/AT etkileşimiyle (4 ayrı prob, hepsi adversarial
hız denemesi) HİÇ ulaşılamadı; (2) render/AX ağacı güncellemesinden ÖNCE kendi kendini
onarıyor (aynı JS turu içinde, `setTimeout(0)` FIFO güvencesiyle) → WCAG 2.4.3 "Focus
Order" bir KULLANICIYA/AT'YE GÖZLENEBİLİR davranışı tanımlar, bu geçiş hiçbir zaman
gözlenebilir hale GELMİYOR.

**ÖNEM DERECESİ: `low`** (teknik borç — AGENT_BASELINE §4: "low — isimlendirme, ölü
kod, iyileştirme önerisi"; bu tam olarak bu kategori: daha idiomatik bir desen
[`onCloseAutoFocus` + `preventDefault`] MEVCUT ve maliyeti düşük [`qa`'nın testi
davranış seviyesinde yazıldı, YENİDEN YAZILMAZ] ama bugünkü desen GÖZLENEBİLİR bir
hataya yol AÇMIYOR). `high`/`medium` değil — ikisi de "gerçek, gözlenebilir yanlış
davranış" gerektirir (AGENT_BASELINE §4), burada YOK.

Borç satırı (ROADMAP teknik borç tablosu için):
- [SEV: low] `apps/admin/src/features/sessions/ActiveSessionsCard.tsx:126-130`,
  `apps/admin/src/features/two-factor/TwoFactorStatusCard.tsx:89-92` — odak-döndürme
  `setTimeout(0)` ile yapılıyor; idiomatik Radix yolu `Dialog.Content`'in
  `onCloseAutoFocus` + `event.preventDefault()` + özel `.focus()`'udur (artık
  `ConfirmDialog`'a `closeLabel` prop'u zaten eklendiği için "dokunmadan" kısıtı
  kalkmış durumda). Ölçülen risk `low` (bkz. yukarıdaki PROB1-5) — vade önerisi:
  bir sonraki `ConfirmDialog`/dialog-odak dokunuşunda "yolu üstündeyse kapat".
  Sorumlu ajan: `frontend`.


## Oran sınırı bütçesi — ölçüm (bitiş, tur 2b/perf için devir notu)

Komut: `redis-cli -p 6379 GET/TTL <anahtar>` (salt okunur, `FLUSHALL`/`CONFIG SET`
KULLANILMADI).

| Rota                              | Kullanılan/Sınır | TTL (kalan saniye) |
| ---------------------------------- | ----------------- | ------------------- |
| `sign-up/email` IP (EMAIL_IP_LIMIT) | 5/10               | ~3296 (≈55 dk)       |
| `sign-in/email` IP (LOGIN_IP_LIMIT) | 9/20               | ~586 (≈10 dk)        |
| `two-factor/enable` IP             | 2/20               | —                    |
| `two-factor/verify-totp` IP        | 2/20               | —                    |

**tur 2b ve `perf` için devir:** `sign-up/email` IP bütçesinin **YARISI (5/10)** bu turda
tüketildi (2 bağımsız koşum × 2 sign-up); TTL ~55 dk içinde sıfırlanacak. `sign-in/email`
IP bütçesi 9/20 (TTL ~10 dk içinde sıfırlanacak). **tur 2b axe/klavye turunda YENİ
sign-up çağrısı yapmadan önce bu tabloyu tekrar ÖLÇMESİ önerilir** — pencereler kısa
(15dk/1sa) olduğu için muhtemelen sıfırlanmış olacak ama garanti değil.

## TAMAMLANMA

1. **İŞ ① KARARI: (A) — `setTimeout(0)` KABUL.** Yukarıdaki PROB1-5 ölçümlerine bkz.
   Yarış penceresini **TETİKLEDİM** (PROB5, zorlama/senkron JS enjeksiyonuyla) AMA
   gerçekçi klavye/fare etkileşimiyle (PROB1/2/3/4) **TETİKLEYEMEDİM**. Önem: `low`
   (teknik borç, `frontend`'e devir, vade: dialog-odak dosyalarına bir sonraki dokunuşta).

2. **İŞ ②: altı ölçümün gerçek ekranda, iki kartta bağımsız teyidi — TAMAMLANDI.**
   `qa`'nın değiştirilmemiş `apps/admin/e2e/session-security-dialog-focus.qa.spec.ts`
   dosyası GERÇEK tarayıcıda (chromium), GERÇEK API (3001'de başlatılan `apps/api`),
   GERÇEK oturumla (`/hesap/guvenlik`) İKİ KEZ bağımsız koşturuldu:
   ```
   cd apps/admin && ARKESOFT_PANEL_DEV_API_TARGET=http://127.0.0.1:3001 \
     npx playwright test e2e/session-security-dialog-focus.qa.spec.ts --reporter=line
   ```
   Her iki koşumda **2 passed** (sıfır flake) — İKİ KART (ActiveSessionsCard,
   TwoFactorStatusCard) ve ALTI assert (Escape/Vazgeç/Kapat odak dönüşü + ad ayrımı)
   TÜMÜ `true`:
   | Ölçüm                                   | ActiveSessionsCard | TwoFactorStatusCard |
   | ---------------------------------------- | ------------------- | --------------------- |
   | escapeReturnsFocusToTrigger               | true                 | true                   |
   | cancelClickReturnsFocusToTrigger          | true                 | true                   |
   | closeIconClickReturnsFocusToTrigger       | true                 | true                   |
   | cancelButtonFoundByName ("Vazgeç" exact)  | true                 | true                   |
   | closeIconFoundByDistinctName ("Kapat")    | true                 | true                   |
   | closeIconNoLongerSharesCancelName (=0)    | true                 | true                   |

3. **SONUÇ: PASS** (bu turun kapsamı — yalnızca İş ① ve İş ②). `critical`/`high` yok,
   `medium` yok; tek bulgu `low` (İş ① borç satırı) → AGENT_BASELINE §4: "yalnızca low
   → PASS, borç tablosuna kaydedilir."

4. **Altyapı notu (düzeltme turu GEREKTİRMEZ, kayıt amaçlı):** port 3000'de Arkesoft
   `apps/api` DEĞİL, kullanıcının ilgisiz bir Next.js projesi çalışıyordu; gerçek
   `apps/api` hiçbir yerde ayakta değildi. Kendi başlattığım 3001'deki süreci (PID 96573)
   iş bitince KAPATTIM. **3000 (PID 11734) ve 3100 (PID 63279)'A HİÇ DOKUNULMADI**
   (`lsof` ile başta ve sonda doğrulandı, PID'ler DEĞİŞMEDİ).

5. **Temizlik kanıtı:**
   - `lsof -iTCP:5173 -sTCP:LISTEN` → boş (Playwright kendi webServer'ını kapattı).
   - `lsof -iTCP:3001 -sTCP:LISTEN` → boş (kendim kapattım, `kill 96573`).
   - `find apps packages -name "*.scratch.*" -o -name "wcag-race-probe*"` → 0 sonuç
     (scratchpad dosyaları SADECE `/private/tmp/.../scratchpad/` içinde:
     `wcag-race-probe.spec.ts`, `wcag-race-probe.config.ts`).
   - `git status --porcelain | wc -l` → **75** (bu rapor dosyasının kendisi dahil;
     depo içinde hiçbir ÜRETİM/kod dosyası değiştirilmedi — Orkestratörün başta ölçtüğü
     74'e bu raporun +1'i eklendi).

