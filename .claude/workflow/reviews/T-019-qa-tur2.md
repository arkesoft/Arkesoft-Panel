# T-019 — `qa` gate, TUR 2 (DAR KAPSAM — `Q-1` doğrulaması + `AC-17` hükmü + e2e teyidi)

- **Tarih:** 2026-11-15 (02:33 — 03:20, +03)
- **Sürüm:** ROADMAP v0.1.0, platform `0.8.0`
- **Dal:** `feat/v0.0.21-surum-kayit-modeli`, commit `9d33820` + commit'lenmemiş düzeltme
  turlarının tamamı (bkz. `git status`/`git diff --stat` — değişiklik yok, salt okuma)
- **Kapsam:** Tur 1'in 19 AC tablosu **yeniden açılmadı**. Bu tur yalnızca: (①) `Q-1`'in
  "düzeltildi" iddiasının bağımsız doğrulanması, (②) `AC-17`'nin altı zorunlu kapıyla
  yeniden hükme bağlanması, (③) temiz bir e2e teyidi.

```
GATE: qa
SONUÇ: FAIL
```

FAIL kuralı (AGENT_BASELINE §4): bu turda **`Q-1` kapanmadı** — aynı `high` bulgu, **yeni
ve daha güçlü kanıtla**, açık kalıyor ⇒ tek başına FAIL yeterli. `AC-17` bu yüzden
**FAIL** olarak yeniden hükme bağlanıyor. 19 AC'nin geri kalanı bu turda yeniden
denetlenmedi (brief kapsamı dar tuttu) — tur 1'deki PASS'ler geçerliliğini koruyor.

---

## ⭐ İŞ ① — `Q-1` BAĞIMSIZ DOĞRULAMA — SONUÇ: **KAPANMADI**

### Ortam hazırlığı (önce yapıldı)

- Port `3100`'deki **bayat** süreç (PID `86404`, başlangıç 00:04:15) **durduruldu**.
- `pnpm --filter @arkesoft/api build` çalıştırıldı — tsc artımlı derleyici **hiçbir dosyayı
  yeniden yazmadı** (`find dist -newermt ... ` → 0 sonuç) ⇒ dist zaten kaynakla senkron
  (son `registration.service.js` yazımı 23:58:33, kaynağın son değişimi 23:45:14 —
  dist kaynaktan **sonra**).
- Yeni süreç başlatıldı: `API_PORT=3100 node --env-file-if-exists=../../.env dist/main.js`
  → PID `59213`, başlangıç 02:34:23. `/health` → **200**. Log'da **0** `error`/`fatal`
  kaydı (`grep -ic '"level":"(error|fatal)"'` → 0).
- Port `3000`'deki kullanıcı süreci (PID `12878`) **dokunulmadı**. Port `5173` e2e'nin
  kendi `webServer` bloğu tarafından başlatıldı (reuseExistingServer, CI değil).

### Koşum sırası (brief'in talep ettiği gibi: önce e2e, sonra `pnpm test` döngüsü)

E2E (İş ③) önce koşuldu (aşağıda) — rate-limit sayacı temizken. Ardından **tam 18
sıralı** kök `pnpm test` koşumu yapıldı (⚠ 1 ek deneme harness'in varsayılan 2 dk
zaman aşımına çarpıp `SIGTERM` ile kesildi, **gerçek bir test sonucu üretmediği için
sayılmadı** — `timeout` parametresi 300000ms'e çıkarılıp tekrar başlatıldı).

**18/18 koşum sıralı** (hiçbir koşum paralel çalışmadı — her komut öncekinin `EXIT`
kodu alınana kadar beklendi).

| #      | Saat (başlangıç) | Sonuç          | `validation.test.ts` süresi        | Not                                                                                                                                                                                |
| ------ | ---------------- | -------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | 02:37:08         | 20/20          | 1304ms                             | temiz                                                                                                                                                                              |
| 2      | 02:39:27         | 20/20          | 1294ms                             | temiz                                                                                                                                                                              |
| 3      | 02:41:44         | 20/20          | 1292ms                             | temiz                                                                                                                                                                              |
| 4      | 02:44:02         | 20/20          | 1345ms                             | temiz                                                                                                                                                                              |
| 5      | 02:46:21         | 20/20          | 1308ms                             | temiz                                                                                                                                                                              |
| 6      | 02:48:40         | 20/20          | 1267ms                             | temiz                                                                                                                                                                              |
| 7      | 02:50:52         | 20/20          | 1236ms                             | temiz                                                                                                                                                                              |
| 8      | 02:53:04         | 20/20          | 1252ms                             | temiz                                                                                                                                                                              |
| 9      | 02:55:16         | 20/20          | 1270ms                             | temiz                                                                                                                                                                              |
| 10     | 02:57:28         | 20/20          | 1324ms                             | temiz                                                                                                                                                                              |
| 11     | 02:59:47         | 20/20          | 1284ms                             | temiz                                                                                                                                                                              |
| 12     | 03:02:07         | 20/20          | 1262ms                             | temiz                                                                                                                                                                              |
| 13     | 03:04:20         | 20/20          | 1238ms                             | temiz                                                                                                                                                                              |
| 14     | 03:06:33         | 20/20          | 1251ms                             | temiz                                                                                                                                                                              |
| **15** | **03:08:53**     | **19/20 FAIL** | 1225ms (bu dosyanın KENDİSİ geçti) | **`auth-flow.test.ts` → "F3 — şifre sıfırlama mevcut oturumları ÖLDÜRÜR (revokeSessionsOnPasswordReset)" → `Error: Command timed out` → `ioredis@6.0.0/built/Command.js:207:33`**  |
| **16** | **03:11:51**     | **19/20 FAIL** | 1283ms (bu dosyanın KENDİSİ geçti) | **`rate-limit.test.ts` → "F1 (high) — /auth/two-factor/verify-totp: 2FA KURULUM ONAYI modu..." → AYNI imza: `Error: Command timed out` → `ioredis@6.0.0/built/Command.js:207:33`** |
| 17     | 03:14:28         | 20/20          | 1280ms                             | temiz                                                                                                                                                                              |
| 18     | 03:16:41         | 20/20          | 1272ms                             | temiz                                                                                                                                                                              |

**Toplam: 16/18 temiz, 2/18 kırmızı (≈ %11.1 ölçülen oran).**

### ⚠⚠ Bu ölçümün anlamı — KRİTİK

1. **`validation.test.ts`'in kendisinde 6151ms'lik sıçrama bir daha GÖRÜNMEDİ** — 18
   koşumun tamamında dar bantta (**1225–1345ms**). Bu, `backend`'in round-trip azaltım
   düzeltmesinin **bu spesifik dosya için** gerçekten yardımcı olduğunu destekliyor.
2. **AMA flake KAPANMADI — BAŞKA DOSYALARA YAYILDI.** İki çöküşün ikisi de **TAMAMEN
   AYNI** kök imzayı taşıyor (`ioredis@6.0.0/built/Command.js:207:33`, "Command timed
   out") ama **`validation.test.ts` DEĞİL** — biri `auth-flow.test.ts`, biri
   `rate-limit.test.ts`. Bu, flake'in `validation.test.ts`'e veya K7'nin hedef aldığı
   TOCTOU'ya özgü olmadığını, Redis'e bağımlı **HER** `createTestApp()` tabanlı testin
   maruz kaldığı **genel bir kaynak/zamanlama sınıfı** olduğunu doğruluyor —
   tur 1'deki "muhtemelen genel kaynak baskısı" hipotezini **güçlendiriyor**,
   çürütmüyor.
3. **İki çöküş ARDI ARDINA geldi** (koşum 15, 16 — 14 temiz koşumdan sonra). Bu, `backend`'in
   45 ardışık temiz koşumuyla **AÇIKÇA ÇELİŞEN** bir gözlem: aynı sınıf flake, aynı
   oturumda, hem "uzun temiz seri" (14) hem "arka arkaya iki kırmızı" üretebiliyor —
   yani deterministik bir eşik değil, gerçekten olasılıksal/kaynak-bağımlı.
4. **Ortam farkı — `backend`'in "boş makine" iddiasıyla ÇELİŞEN ölçüm:** Bu turun
   koşumları SIRASINDA (a) port `3100`'de CANLI bir `apps/api` dev süreci çalışıyordu
   (İş③ için ben başlattım, loop boyunca kapatmadım) ve bu süreç test harness'iyle
   **AYNI** Redis'e bağlıydı (`Q-2`'nin tam olarak işaret ettiği paylaşım) — `docker
stats` ile ölçüldü: bu makine aynı anda **12+ konteynerlik `istoccom` stack'i**,
   `cnc_proje` ve `moneyprinterturbo` projelerini de çalıştırıyordu (toplam 20+ konteyner,
   gerçek CPU/ağ/disk I/O üretiyor). Bu **"boş makine" DEĞİL** — gerçekçi, meşgul bir
   geliştirici makinesi. `backend`'in 45 ardışık yeşili hangi ortamda ölçtüğü
   bilinmiyor; benim ortamım farklıydı ve **gerçek bir kırmızı üretti**.
5. **Olasılık değerlendirmesi:** 18 bağımsız koşumda ölçülen oran **%11.1** (2/18).
   Tur 1'in tahmini **%15**'lik oranıyla **aynı büyüklük mertebesinde** — istatistiksel
   olarak **"iyileşme yok" ile tutarlı**, "düzeltildi" ile **tutarsız**. Sıfır-hata
   hipotezi (`p=0`, "tamamen kapandı") bu 18 koşumda **doğrudan çürütüldü** — `p=0`
   iken 2 kırmızı gözlenme olasılığı tanım gereği 0'dır.

### Hüküm: `Q-1` **KAPANMADI**. Bulgu **AYNI `high`** severitede **açık** kalıyor,

imza genişletilmiş olarak güncellendi.

| SEV                                 | dosya:satır                                                                                                                                                | bulgu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | sorumlu ajan                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **high** `Q-1` (güncellenmiş, AÇIK) | `apps/api/src/__tests__/auth-flow.test.ts` (F3) + `apps/api/src/__tests__/rate-limit.test.ts` (F1) + `node_modules/.pnpm/ioredis@6.0.0/.../Command.js:207` | Kök `pnpm test` **hâlâ güvenilir yeşil DEĞİL**. `backend`'in `create-test-app.ts` round-trip azaltımı `validation.test.ts`'in KENDİ maruziyetini daralttı (18/18 koşumda bu dosya artık dar bantta, 6151ms sıçraması YOK) ama kök neden (muhtemelen genel Redis komut işleme/zamanlayıcı baskısı altında `ioredis` komut zaman aşımı) **başka dosyalara (auth-flow.test.ts, rate-limit.test.ts) kaymış durumda** — `backend`'in KENDİ beyanı ("kanıtlanmış bir kök-neden onarımı DEĞİL") bu ölçümle **doğrulandı**. | `backend` (kök nedeni Redis bağlantı havuzu/komut kuyruğu seviyesinde teşhis et — dosya bazlı "sertleştirme" yaklaşımı whack-a-mole üretiyor) |

---

## İŞ ② — `AC-17` HÜKMÜ: **FAIL**

| Kapı | Komut                                               | Sonuç          | Sayı                                                                                               |
| ---- | --------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| 1    | `pnpm lint`                                         | PASS           | 23/23 (cache)                                                                                      |
| 2    | `pnpm typecheck`                                    | PASS           | 23/23 (cache)                                                                                      |
| 3    | `pnpm build`                                        | PASS           | 14/14 (cache)                                                                                      |
| 4    | `pnpm guards`                                       | PASS           | 14/14 mekanik adım                                                                                 |
| 5    | `pnpm test:isolation`                               | PASS           | 11/11 görev (`@arkesoft/db` 6 dosya/78 test + `@arkesoft/api` 5 dosya/22 test = 11 dosya/100 test) |
| 6    | **`pnpm test`** (CLAUDE §6 zorunlu kapının parçası) | **GÜVENİLMEZ** | **16/18 koşum temiz, 2/18 kırmızı (≈%11.1)** — bkz. İş ①                                           |
| ek   | `pnpm format:check`                                 | PASS           | temiz                                                                                              |

CLAUDE §6'daki zorunlu kapı metni birebir: _"`pnpm lint && pnpm typecheck && pnpm test &&
pnpm test:isolation && pnpm build && pnpm guards` — **hepsi yeşil olmak zorunda**."_
`&&` zinciri **tek bir kırmızı** `pnpm test` koşumunda **tüm zinciri** durdurur. Ölçülen
%11 oranla bu zincir **~9 koşumda 1 kez** gerçek bir geliştiricinin/CI'ın önünde
kırmızı yanar. ⇒ **AC-17 FAIL** — tur 1'deki hükümle **aynı sonuç**, ama bu turda
**daha fazla kanıtla** (18 koşum vs. 3, iki farklı dosyada yakalanmış ikinci bir
kırmızı imza).

---

## İŞ ③ — E2E TEYİDİ: **PASS (22/22)**

**Sıra (brief'in talep ettiği gibi, rate-limit bütçesi temizken önce):**

1. API `:3100` yeniden derlendi (`pnpm --filter @arkesoft/api build` — tsc artımlı,
   zaten senkron) + bayat süreç (PID 86404) öldürüldü + yeni süreç başlatıldı (PID
   59213, 02:34:23) → `/health` 200, log'da 0 error/fatal.
2. Panel 5173 — Playwright'ın kendi `webServer` bloğu üzerinden (vite dev, `--strictPort`),
   port kaydırılmadı.
3. Komut: `ARKESOFT_PANEL_DEV_API_TARGET=http://127.0.0.1:3100 pnpm --filter @arkesoft/admin test:e2e`
   — çalıştırıldı **02:34:33 — 02:34:51** (18.0s, workers:1).

**Sonuç: 22/22 PASS** (tur 1'deki 21/22'den **daha iyi** — tur 1'in tek sahte kırmızısı
olan `session-security-dialog-focus.qa.spec.ts:322`, `Q-2`'nin rate-limit sızıntısı
yüzünden 429 almıştı; bu turda bütçe temizdi ve **o test de geçti**):

- `panel-flow.spec.ts` — **9/9** PASS (regresyon dahil)
- `qa-blind-spot-and-negative-scenarios.qa.spec.ts` — **7/7** PASS
- `registration-flow.spec.ts` (T-019'un KENDİ testleri) — **4/4** PASS
- `session-security-dialog-focus.qa.spec.ts` — **2/2** PASS

T-019'un kendi dört testi (AC-1, AC-3, AC-19 ucu uca) **geçti**. Üretim kodundaki
tur 2/3 değişikliklerinin (`StoreWizard.tsx`, `slug-outcome-message.ts`, oran sınırı
yolu, Zod parse, `create-test-app.ts`) hiçbiri bu akışı bozmadı.

**Rate-limit bütçe durumu (bitişte):** `docker exec arkesoft-redis redis-cli keys '*'`
→ yalnızca `platform:test-harness:run-owner` (K7'nin kendi anahtarı); **hiçbir**
`platform:auth:*` sayacı kalıcı değil — bütçe şu an **tamamen temiz**, sonraki ajan için
risk yok.

---

## ÖLÇÜMLER

**KOŞTURULAN KOMUTLAR:**

| Komut                                                                                        | Exit      | Özet                                                           |
| -------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------- |
| `pnpm --filter @arkesoft/api build` (restart öncesi)                                         | 0         | artımlı, 0 dosya yeniden yazıldı (zaten senkron)               |
| `ARKESOFT_PANEL_DEV_API_TARGET=http://127.0.0.1:3100 pnpm --filter @arkesoft/admin test:e2e` | 0         | **22/22 PASS**, 02:34:33–02:34:51                              |
| `pnpm test` × 18 (kök, sıralı)                                                               | 16×0, 2×1 | **16/18 temiz (20/20), 2/18 kırmızı (19/20)** — bkz. tablo İş① |
| `pnpm lint`                                                                                  | 0         | 23/23 (cache)                                                  |
| `pnpm typecheck`                                                                             | 0         | 23/23 (cache)                                                  |
| `pnpm build`                                                                                 | 0         | 14/14 (cache)                                                  |
| `pnpm guards`                                                                                | 0         | 14/14 mekanik adım                                             |
| `pnpm test:isolation`                                                                        | 0         | 11/11 görev, 100 test (db 78 + api 22)                         |
| `pnpm format:check`                                                                          | 0         | temiz                                                          |

**KABUL KRİTERİ EŞLEMESİ:** bu tur AC'leri yeniden açmadı — tur 1 tablosu geçerli,
tek değişen hüküm **AC-17 (FAIL, yeniden doğrulandı)**.

**TEST SAYILARI:** yeni eklenen test **0** (bu tur test yazmadı — kapsam "mevcut
iddiayı doğrula" idi, eksik senaryo bulunmadı). Toplam geçen (temiz koşumda) **20/20
paket · `@arkesoft/api` 720/720 (90 dosya) · `@arkesoft/admin` 175/175 (21 dosya)**;
en kötü koşumda (15 veya 16) **719/720** (1 dosya `Command timed out` ile çöktü,
kalan testler o dosyada **çalışmadı**, "başarısız" değil "kesildi").

**DOĞRULANAMADI:** `Q-1`'in TAM kök nedeni (hangi Redis komutunun hangi koşulda
zaman aşımına uğradığı — `auth-flow.test.ts`/`rate-limit.test.ts` loglarında sadece
`Command.js:207:33`'teki jenerik ioredis zaman aşımı görülüyor, hangi komut/hangi
bağlantı olduğu enstrümantasyon olmadan görünmüyor) — bu `qa` kapsamında teşhis
aracı kullanılmadı, `backend`'e devrediliyor.

---

## KALINTI RİSK HÜKMÜ — teknik borç olarak taşınabilir mi?

**Hayır, önerim: taşınmasın, `backend`'e üçüncü bir düzeltme turu açılsın.** Gerekçe:

1. Bu, kozmetik bir flake değil — **zorunlu kapının** (`pnpm test`, CLAUDE §6) bir
   parçası ve CLAUDE §10 madde 5 ("kabul kriteri çalıştırılmadan versiyon bitti ilan
   etmek yasak") doğrudan bu kapıya dayanıyor. %11 oranla **CI'da da aynı sıklıkta**
   kırmızı yanması beklenir (CI makinesi "boş" olsa da — bu ölçüm zaten "meşgul
   makine" ile "boş makine" arasında fark OLDUĞUNU gösterdi, ama CI'ın GCP/GitHub
   runner'ı da paylaşımlı kaynaklıdır, "boş" garantisi yok).
2. `backend`'in kendi beyanı ("kanıtlanmış bir kök-neden onarımı DEĞİL") + bu turun
   ölçümü (flake başka dosyalara kaydı) **birlikte** şunu gösteriyor: mevcut düzeltme
   bir **belirti** (validation.test.ts'in 4× ardışık `createTestApp()` + K7 TOCTOU'nun
   round-trip sayısı) üzerinde çalıştı, **hastalığın** kendisi (ioredis komut zaman
   aşımı — muhtemelen bağlantı havuzu/komut kuyruğu doygunluğu, 90 paralel worker'ın
   hepsi ayrı Redis bağlantısı açtığı için) hâlâ orada.
3. Teknik borca yazmanın riski: her yeni `backend`/`db` ajanı kendi makinesinde
   **~1/9** ihtimalle sahte kırmızı görüp (a) gerçek bir regresyonu flake sanıp görmezden
   gelecek **ya da** (b) gerçek bir flake'i kendi değişikliğinin hatası sanıp zaman
   kaybedecek — ikisi de CLAUDE §10 ihlali riskini büyütür.
4. **Taşınabilecek olan** şey kapsamın boyutu değil: "kaç dosyayı tek tek sertleştireceğiz"
   whack-a-mole'u sürdürülebilir değil. `backend`'e önerilen yön — `createTestApp()`'ın
   Redis bağlantı/komut zaman aşımı ayarlarını (ioredis `commandTimeout`/bağlantı havuzu
   boyutu) **90 worker eşzamanlı paralellik** varsayımıyla yeniden gözden geçirmek,
   ya da testleri `isolate:false`'a çekip (log'un kendi önerisi: "~9.74s faster with
   isolate:false") paylaşılan worker sayısını düşürmek — **gerekçeli bir mimari karar**,
   dosya-bazlı yama değil.

**Sonuç:** `Q-1` teknik borç tablosuna **yazılmamalı**; üçüncü bir `backend` düzeltme
turu gerekli. Bu, Orkestratör'ün kullanıcıya taşıyacağı karar için girdidir — nihai
karar bende değil.

---

## SONUÇ

**SONUÇ: FAIL.** `Q-1` **kapanmadı** (aynı `high` bulgu, daha güçlü ve genişlemiş
kanıtla açık) ⇒ `AC-17` **FAIL**. E2E **22/22 PASS** — ürün davranışı sorunsuz, T-019'un
kendi dört testi geçti, regresyon yok. FAIL'in nedeni tur 1'de olduğu gibi **güvenilirlik/
altyapı** (zorunlu kapının `pnpm test` bacağı), **ürün davranışı değil**.
