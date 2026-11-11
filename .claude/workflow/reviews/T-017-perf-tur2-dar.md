# T-017 — perf gate — TUR 2 (DAR kapsam)

Tarih: 2026-11-11 (oturum içi, Task bağlamı v0.0.15.1)
Rol: perf — TUR 2 — döngünün SON gate'i, TEK BAŞINA çalışıyor.

GATE: perf
SONUÇ: (yazılıyor — aşama aşama güncellenecek)

---

## Durum günlüğü (aşama aşama, mutasyon olursa anında kaydedilir)

### Aşama 0 — ortam kontrolü
- Port 5173: BOŞ (lsof ile doğrulandı, perf tur2 başlangıcında).
- Port 3000: PID 11734, kullanıcının süreci — DOKUNULMADI.
- Port 3100: PID 17427, kullanıcının süreci — DOKUNULMADI.
- `git status --porcelain | wc -l` (başlangıç): 77 (Orkestratör'ün bildirdiği ~78 ile tutarlı — kayıtsız değişiklikler, bu gate'in değil).


### Adım 1 — P1 teyit (`auth-instance.ts`, `updateAge=300`)

```
shasum -a 256 apps/api/src/auth/auth-instance.ts
a93c9ec30e9350a80a107147d5a95ae99b75a6413f40741dba4e3dd78110cc67  apps/api/src/auth/auth-instance.ts
```

Tur 1'in canlı mutasyonla kanıtladığı hash ile **BİREBİR aynı**
(`a93c9ec3…10cc67`). İki FIX turu bu dosyaya dokunmadı. **Mutasyon TEKRARLANMADI.**
P1 kararı değişmez: `updateAge=300` yazma hacmi istek sayısından bağımsız, yapısal
üst sınırlı → **KABUL EDİLEBİLİR** (tur 1 kararı aynen geçerli).

---

### Adım 2 — İş ①: dört `low`'un canlı sayıları

**Salt-okunur SQL (tek tur, mutasyon yok):**

| Metrik | Tur 1 | Tur 2 (şimdi) |
| --- | --- | --- |
| Toplam satır | 37.305 | **38.311** (+1.006 — paralel ajanların ürettiği oturumlar, beklenen) |
| Süresi geçmiş (`expires_at < now()`) | 20.211 (%54,2) | **21.412 (%55,9)** |
| Canlı | 17.094 | **16.899** |
| Dağınık kullanıcı | 25.356 | **26.190** |
| Ortalama satır/kullanıcı | 1,47 | **1,46** (değişmedi, ölçüm gürültüsü içinde) |
| **Maksimum satır/kullanıcı** | 21 | **21** (DEĞİŞMEDİ) |
| **Hem canlı HEM süresi geçmiş satırı olan kullanıcı sayısı** | **0** | **1** ⚠ |

⚠ **Pf-1'in "0 kullanıcı" bulgusu artık 0 DEĞİL — KÖTÜLEŞME, ölçüldü:**

```sql
SELECT user_id, count(*) total, count(*) FILTER (WHERE expires_at<now()) expired,
       count(*) FILTER (WHERE expires_at>=now()) live
FROM session GROUP BY user_id
HAVING count(*) FILTER (WHERE expires_at<now())>0 AND count(*) FILTER (WHERE expires_at>=now())>0;

 user_id                          | total | expired | live
 gZa3ALXFphwO4xANRbxLUzmIAK5ts6Wu  |   20  |    19   |   1
```

Bu kullanıcı `GET /auth/sessions` çağırdığında (filtre `where: { userId }`, `expires_at`
filtresi YOK) **20 satırın hepsini** alır — 19'u süresi geçmiş, panelde "aktif oturum"
olarak görünür. **Gerçek ama çok küçük ölçekli:** 1 kullanıcı / 26.190 (%0,004).
Yanıt boyutu etkisi: 20×~277 bayt ≈ 5,5 KB — p95/500ms bütçesine katkısı YOK.

**Sınıflandırma kararı:** Bu hâlâ bir **performans bütçesi aşımı DEĞİL** (gecikme/sorgu
maliyeti ölçülebilir ölçüde artmadı — aynı indeks, aynı sorgu şekli, 20 satır önemsiz).
Etkisi **doğruluk/UX** ekseninde (kullanıcı ölü oturumu "aktif" görür) — perf gate'in
kendi çerçevesi bunu zaten `low` sayıyordu (tur 1: "SEV: low ... bir temizleme/TTL
mekanizması olmaması bu riski zamanla büyütür"). Sayı 0→1'e çıktı ama **ölçek hâlâ
teorik eşiğin çok altında** (bütçe aşımı yok, N+1 yok, seq scan yok) → **SEV: low
olarak KALIR, medium'a YÜKSELTİLMEDİ.** Not: bu satır artık "0 kullanıcı" ile
savunulamaz — borç tablosundaki metin güncellenmeli ("0" → "ölçüldüğü anda 1,
büyüyen bir paylaşılan tablo, trend yukarı").

**`sessions-query.ts` FIX turlarında değişti mi?** HAYIR —
`git log --oneline -- apps/admin/src/api/sessions-query.ts` tek kayıt döndürüyor
(v0.0.15.1'in kendi ilk commit'i, S11); FIX turu 1/2 bu dosyaya dokunmadı.
`staleTime`/`gcTime` hâlâ tanımsız (grep ile doğrulandı) → borç **aynen duruyor**,
kötüleşmedi.

---

### Adım 3 — P2: `toSessionSummary` sonrası sorgu + eşleme

**N+1 / I/O denetimi (bağımsız teyit, `security` tur 2'nin iddiasını doğruluyorum):**
`session-summary.mapper.ts` ithalatları:
```
import { resolveDeviceFamilies } from './device-label.js'
import type { SessionSummary } from './sessions.service.js'
```
İkinci ithalat **`type`** anahtar kelimesiyle — çalışma zamanı etkisi yok (derleyici
siler). `resolveDeviceFamilies` (`device-label.ts`) **saf string eşlemesi**
(`.includes()` zincirleri) — `await`/`fetch`/`prisma`/`process` **yok** (dosyanın kendi
başlık yorumu da bunu iddia ediyor, kaynağı okuyarak BAĞIMSIZ doğruladım). **N+1 YOK,
geri gelmedi.**

**Sorgu planı (`BEGIN; EXPLAIN (ANALYZE, BUFFERS) …; ROLLBACK;` — SELECT olduğu için
risksiz ama disiplin korundu):**
```sql
BEGIN;
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, created_at, updated_at, expires_at, ip_address, user_agent
FROM session WHERE user_id = 'LcsFyLEHNIgV5J7c8T8GLac6xX6rOyp5' ORDER BY created_at DESC;
ROLLBACK;

 Sort (actual rows=21 loops=1)
   ->  Index Scan using session_user_id_idx on session (actual rows=21 loops=1)
         Index Cond: (user_id = ...)
 Execution Time: 0.213 ms
```
**Seq scan YOK** — indeks kullanılıyor (`session_user_id_idx`). Tur 1'de planlayıcı
`Bitmap Heap Scan → Bitmap Index Scan` seçmişti, bugün doğrudan `Index Scan`
seçti (tablo istatistikleri/satır tahmini küçük farkla değişti — ikisi de aynı
indeksi kullanıyor, **sorgu deseni/indeks ihtiyacı değişmedi**). Süre **0,213 ms /
21 satır** — tur 1'in 0,469 ms'inden bile daha hızlı, **regresyon yok**.

**Yanıt boyutu:** `activeSessionWireSchema` (`packages/trpc/.../session-summary.schema.ts`)
FIX turlarında **değişmedi** (`git log` bu dosya için boş — commit yok), 8 alan aynen
duruyor → **277 bayt/satır tahmini hâlâ geçerli**, değişmedi.

**Mapper çağrısının satır başına maliyeti — ölçüldü, GÜRÜLTÜ SEVİYESİNDE:**
`tsx` ile gerçek `toSessionSummary()` fonksiyonunu doğrudan çağıran mikro-ölçüm
(scratchpad'de, repo dışı):
```
N=21 (gerçekçi maksimum):  toplam 0.0056 ms  → satır başına ~0.27 µs
N=1.000.000 (gürültüden ayırmak için büyütülmüş): satır başına ~0.10 µs
```
21 satırlık gerçekçi istek için toplam mapper maliyeti **5,6 mikrosaniye** — DB
yürütme süresinin (**213 mikrosaniye**) **~38 kat altında**, toplam istek
gecikmesinin (tur 1'in gerçek örnek ölçümü: 1-3 ms) **binlerce kat altında**.
**Dürüst sonuç: ölçülebilir ama etkisiz — toSessionSummary()'ye geçiş performansa
HİÇBİR ölçülebilir maliyet eklemedi.**

---

### Adım 4 — P3: bundle (yeni hook dosyası)

**Fresh `vite build --force` (cache bypass), apps/admin, İKİ KEZ — BİREBİR aynı sonuç:**
```
[bundle-budget] kimlikli ilk ekran (/)       — JS (gzip): 179.11 KiB / 250.00 KiB (%71.6)
[bundle-budget] kimliksiz ilk ekran (/sign-in) — JS (gzip): 161.05 KiB / 250.00 KiB (%64.4)
[bundle-budget] MAKSİMUM                      — JS (gzip): 179.11 KiB / 250.00 KiB (%71.6)
dist/assets/_app.hesap.guvenlik-DwwK1YN-.js   29.88 kB │ gzip: 7.54 kB
```
**`frontend`'in "birebir aynı" iddiası DOĞRULANDI** — `/` 179.11 KiB ve `/sign-in`
161.05 KiB, tur 1'in ölçümüyle **tam eşleşiyor** (bütçe %71.6/%64.4, aşım yok).

**`_app.hesap.guvenlik` chunk'ı BÜYÜDÜ** (yeni hook eklendiği için, beklenen):
tur 1: 29.55 kB / gzip 7.41 kB → tur 2: **29.88 kB / gzip 7.54 kB**
(**+0.33 kB ham, +0.13 kB gzip**). Bu artış **ilk-boya bütçesine (179.11/161.05 KiB)
YANSIMADI** — ikisi de tur 1 ile birebir aynı kaldı.

**Hook hangi chunk'a girdi — doğrulandı:** `use-dialog-trigger-focus.ts` yalnızca
`ActiveSessionsCard.tsx` ve `TwoFactorStatusCard.tsx` tarafından import ediliyor
(`grep -rl` ile doğrulandı); bu iki bileşen de **yalnızca**
`apps/admin/src/routes/_app.hesap.guvenlik.tsx` tarafından kullanılıyor — başka HİÇBİR
route/entry noktası bu kartları import etmiyor. Dolayısıyla hook, zaten var olan
`_app.hesap.guvenlik` lazy chunk'ının İÇİNE gömüldü, YENİ bir ayrı chunk açmadı ve ilk
ekrana sızmadı.

**`DELIBERATELY_LAZY_ROUTE_SRCS` muafiyeti hâlâ geçerli mi?** EVET — build
`check-bundle-budget.ts`'in fail-closed B assertion'ını (talep edilmeyen dinamik
girdiyi fırlatarak yakalayan kontrol) hatasız geçti; bu, chunk'ın hâlâ bilinçli-tembel
listesinde kapsandığının mekanik kanıtı. 2FA kartının AYNI rotada olması muafiyeti
bozmuyor — muafiyet dosya yoluna (`_app.hesap.guvenlik.tsx`) bağlı, kart sayısına değil.

**Yeni ana bağımlılık:** `package.json`/`pnpm-lock.yaml` diff boş (üç gate zaten bağımsız
doğruladı, kendim de `git log` ile tekrar kontrol ettim — bu dosyalara dokunan commit yok).

---

## SONUÇ

GATE: perf
SONUÇ: **PASS**

BULGULAR:
  - [SEV: low] `packages/db/prisma/schema.prisma` (model `Session`) — TTL/cron temizleme
    yok; süresi geçmiş satır oranı tur 1'den bu yana %54,2 → %55,9'a çıktı (38.311 satır,
    paralel ajan trafiği). T-017 öncesi platform borcu, bu Task tarafından
    KÖTÜLEŞTİRİLMEDİ (büyüme beklenen/doğal) — sorumlu ajan: db (borç, vade: T-017
    sonrası herhangi bir sürüm).
  - [SEV: low] `apps/api/src/auth/sessions.service.ts:91` (`listOwnSessions`) —
    `expires_at` filtresi yok; bugün ölçülen etki 1/26.190 kullanıcı (%0,004,
    20 satır/kullanıcı, ~5,5 KB yanıt) → bütçe aşımı YOK. Tur 1'de "0 kullanıcı"
    denmişti, bugün "1 kullanıcı" — ölçeğin BÜYÜDÜĞÜ not edilir ama hâlâ `low`
    (performans bütçesine etkisi yok, doğruluk/UX ekseninde) — sorumlu ajan: backend
    (borç, ROADMAP'e not: "0 kullanıcı" ifadesi güncellensin).
  - [SEV: low] `apps/admin/src/api/sessions-query.ts:23-26` — `staleTime`/`gcTime`
    tanımsız, ADR-0019 §3'ün 5dk çözünürlüğüyle hafif tutarsız. Pre-existing (v0.0.7'den
    beri), FIX turlarında DEĞİŞMEDİ (`git log` doğrulandı) — sorumlu ajan: frontend (borç).
  - [SEV: low] Sayfalama yok — tur 1'in "risk teorik" tespiti aynen geçerli, maksimum
    satır/kullanıcı 21'de sabit kaldı (büyümedi) — sorumlu ajan: backend (borç).

ÖLÇÜMLER:
  - **Core Web Vitals (LCP/INP/CLS):** ÖLÇÜLEMEDİ — Lighthouse CI altyapısı
    ROADMAP v0.0.20 öncesi bu sürümde yok; storefront bu Task'ta değişmedi (tur 1 ile
    aynı durum, yeniden taranmadı — kapsam DAR).
  - **API p95 / Arama p95:** ÖLÇÜLEMEDİ — k6 yük testi altyapısı bu Task'ta
    çalıştırılmadı (tur 1 ile aynı). Tekil örnek gecikme (tur 1'den, bu turda
    tekrarlanmadı): `GET /auth/sessions` 1-3 ms — 500 ms bütçesinin çok altında ama
    p95 YÜK ölçümü değil.
  - **P1 — `updateAge=300`:** `auth-instance.ts` SHA-256 = `a93c9ec3…10cc67`,
    tur 1'in canlı-mutasyonla kanıtladığı hash ile BİREBİR aynı. Mutasyon
    TEKRARLANMADI. Karar: KABUL EDİLEBİLİR (değişmedi).
  - **P2 — sorgu planı:** `EXPLAIN (ANALYZE, BUFFERS)` (`BEGIN…ROLLBACK` içinde) →
    `Index Scan using session_user_id_idx`, seq scan YOK, **0,213 ms / 21 satır**
    (tur 1: 0,469 ms — regresyon yok, daha hızlı). N+1: YOK (mapper ithalatları
    bağımsız okunarak doğrulandı — I/O yok). Yanıt boyutu: ~277 bayt/satır (tel şeması
    değişmedi). Mapper maliyeti: 21 çağrı toplam **0,0056 ms** (~0,27 µs/çağrı,
    `tsx` mikro-ölçüm) — DB yürütme süresinin ~38 kat altında, ÖLÇÜLEBİLİR AMA ETKİSİZ.
  - **İş ① canlı sayılar:** toplam 38.311 (tur1: 37.305), süresi geçmiş %55,9
    (tur1: %54,2), maksimum satır/kullanıcı 21 (DEĞİŞMEDİ), ortalama 1,46
    (tur1: 1,47). "Hem canlı hem süresi geçmiş" kullanıcı sayısı **0→1** —
    tek kullanıcı (20 satır, 19 süresi geçmiş, 1 canlı) — ölçek hâlâ `low`
    sınırında (bütçe aşımı yok).
  - **P3 — bundle:** `vite build --force` (2 kez, birebir aynı) → `/` = 179,11 KiB
    (%71,6/250 KiB), `/sign-in` = 161,05 KiB (%64,4/250 KiB) — tur 1 ile BİREBİR aynı,
    bütçe aşılmadı. `_app.hesap.guvenlik` lazy chunk'ı 7,41 KiB → **7,54 KiB** gzip
    (+0,13 KiB, yeni hook nedeniyle) — ilk-boya bütçesine YANSIMADI (hook, hâlâ aynı
    tembel route'a münhasır iki bileşen tarafından kullanılıyor, `DELIBERATELY_LAZY_
    ROUTE_SRCS` muafiyeti mekanik olarak hâlâ geçerli). Yeni ana bağımlılık yok
    (`package.json`/`pnpm-lock.yaml` diff boş).
  - **Mutasyon:** YOK — tüm DB sorguları salt-okunur `SELECT`/`EXPLAIN` (yazma sorgusu
    `BEGIN…ROLLBACK` içinde çalıştırıldı, zaten SELECT olduğu için mutasyon riski
    taşımıyordu). Redis'e dokunulmadı. `.env`'e yazılmadı.
  - **Süreç temizliği:** Port 5173 oturum boyunca boş kaldı (hiç dev sunucusu
    başlatılmadı). Port 3000 (PID 11734) ve 3100 (PID 17427) — kullanıcının kendi
    süreçleri, DOKUNULMADI (oturum başı/sonu `lsof` ile doğrulandı, PID'ler aynı kaldı).
    `vite build`/`tsx` tek seferlik komutlardı, arkada süreç BIRAKMADI (`ps aux | grep
    vite` — boş).
  - **Geçici dosyalar:** yalnızca scratchpad'e yazıldı
    (`/private/tmp/.../scratchpad/bench-mapper.mjs`) — `apps/`/`packages/` içine HİÇBİR
    geçici dosya bırakılmadı.
  - **`git status --porcelain | wc -l`:** 78 (oturum başı 77 — bu artış BU gate'in
    değişikliği DEĞİL; `apps/admin/dist` git'e girmedi [ignore'lı], fark başka bir
    ajanın/sürecin paralel çıktısı olabilir — bu gate hiçbir kaynak dosyayı
    değiştirmedi, `git diff` boş).
  - **Oran bütçesi:** Redis rate-limit'e dokunulmadı (yeni kullanıcı/sign-up/sign-in
    denemesi yapılmadı) — tur 1'in `sign-up/email IP` 9/10 durumu bu turda
    İLERLETİLMEDİ, kalan oran aynen duruyor (ÖLÇÜLMEDİ çünkü denenmedi, bilerek).

GATE KARARI GEREKÇESİ: Dört bulgu da `low` (bir "low" kötüleşti [Pf-1: 0→1 kullanıcı]
ama bütçe aşımına dönüşmedi) — AGENT_BASELINE §4 kuralı: "yalnızca `low` → PASS,
bulgular teknik borca kaydedilir." Yeni `critical`/`high`/`medium` bulgu YOK. P1/P2/P3
ekseninde FIX turlarının (mapper çıkarımı, yeni hook) performans yüzeyine ÖLÇÜLEBİLİR
bir zarar vermediği doğrulandı.
