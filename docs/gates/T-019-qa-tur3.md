# T-019 — `qa` gate, TUR 3 (ÇOK DAR — `Q-1` kendi yük koşullarında doğrulama + `AC-17` hükmü)

- **Tarih:** 2026-11-15 (04:16 — 04:57, +03)
- **Sürüm:** ROADMAP v0.1.0, platform `0.8.0`
- **Dal:** `feat/v0.0.21-surum-kayit-modeli`, commit `9d33820` + dört turun tamamının
  commit'lenmemiş diff'leri (`git status`/`git diff --stat` bu turun BAŞINDA ve SONUNDA
  **aynı** — 16 değiştirilmiş + 13 izlenmeyen dosya, satır sayısı 29/29, drift yok).
- **Kapsam:** Tur 1'in 19 AC tablosu yeniden açılmadı. Bu tur yalnızca: (①) `Q-1`'in kendi
  (organik, yabancı konteyner) yük koşullarında bağımsız doğrulanması — **kullanıcı kararı
  ile açılan 4. backend düzeltme turunun sonucu**, (②) dört katmanlı izolasyonun örnekleme
  ile doğrulanması, (③) `AC-17`'nin altı zorunlu kapıyla yeniden hükme bağlanması.
  **E2E bu turda KOŞULMADI** (brief'in açık yasağı — tur 2'de 22/22 alındı ve o koşumdan
  sonra üretim kodu değişmedi, tekrar koşmak bilgi üretmez).

```
GATE: qa
SONUÇ: PASS
```

FAIL kuralı (AGENT_BASELINE §4): bu turda **0 `critical`, 0 `high`, 0 `medium`** bulgu
ölçüldü. `Q-1` (tur 1-2'nin `high` bulgusu) bu turun kendi ölçümüyle **kapandı** (aşağıda
gerekçe) ⇒ `AC-17` **PASS** olarak yeniden hükme bağlanıyor. 1 `low` not (bilgilendirici,
düzeltme turu açmıyor).

---

## ⭐⭐ İŞ ① — `Q-1` KENDİ YÜK KOŞULLARINDA DOĞRULAMA — SONUÇ: **KAPANDI**

### ⭐ Ölçüm koşullarının dürüst beyanı — tur 2 ile KARŞILAŞTIRILABİLİRLİK

| Zaman               | `uptime` load avg (1/5/15 dk) | `docker ps` sayısı | Not                                                                                                                                                              |
| ------------------- | ----------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Koşum başı, 04:16   | **2.81 / 3.72 / 5.10**        | **26**             | `istoccom` stack'i (12), `cnc_proje` (4), `moneyprinterturbo` (2), `arkesoft` altyapısı (5+) — tur 2'nin "20+ konteyner" beyanıyla AYNI sınıf, sayıca DAHA FAZLA |
| Koşum ortası, 04:44 | 3.89 / 5.86 / 5.88            | 26                 | load avg tur 2'nin bildirdiği aralıkla tutarlı (meşgul, boş DEĞİL)                                                                                               |
| Koşum sonu, 04:56   | **3.49 / 4.60 / 5.23**        | **26**             | konteynerler DURDURULMADI/ÖLDÜRÜLMEDİ (kullanıcının projeleri, dokunulmadı)                                                                                      |

**Değerlendirme: bu ölçüm tur 2 ile KARŞILAŞTIRILABİLİR, DAHA AĞIR bir organik yük
altında yapıldı** (26 konteyner > tur 2'nin "20+"; load avg aynı mertebede, 2.8-5.9
arası). Makine **sakin DEĞİLDİ** — bu, aşağıdaki 15/15 temiz sonucun kanıt değerini
**yükseltiyor**, düşürmüyor.

### Koşum sırası — **15/15 SIRALI, PARALEL YOK**

Kök `pnpm test` **tam 15 kez, art arda, her koşumun `EXIT` kodu alınana kadar beklenerek**
koşturuldu (04:21:00 — 04:56:36, toplam ~35.5 dk). Hiçbir koşum kendi başka bir koşumuyla
veya başka bir `pnpm test`/`pnpm test:isolation` çağrısıyla ÇAKIŞMADI (K7 sahiplik
mekanizması hiçbir koşumda devreye girmedi — `grep -l "BAŞKA BİR test koşumu" run*.log`
→ 0 eşleşme, 15/15).

| #   | Başlangıç | `EXIT` | `@arkesoft/api` dosya/test | `auth-flow.test.ts` | `rate-limit.test.ts` | Not                                                                 |
| --- | --------- | ------ | -------------------------- | ------------------- | -------------------- | ------------------------------------------------------------------- |
| 1   | 04:21:00  | 0      | 91/91 · 733/733            | 1695ms              | 11132ms              | temiz                                                               |
| 2   | 04:23:17  | 0      | 91/91 · 733/733            | 1678ms              | 11153ms              | temiz                                                               |
| 3   | 04:25:46  | 0      | 91/91 · 733/733            | 1744ms              | 11091ms              | temiz                                                               |
| 4   | 04:28:07  | 0      | 91/91 · 733/733            | 1759ms              | 11133ms              | temiz                                                               |
| 5   | 04:30:25  | 0      | 91/91 · 733/733            | 1708ms              | 11084ms              | temiz                                                               |
| 6   | 04:32:43  | 0      | 91/91 · 733/733            | 1731ms              | 11081ms              | temiz                                                               |
| 7   | 04:35:03  | 0      | 91/91 · 733/733            | 1705ms              | 11049ms              | temiz                                                               |
| 8   | 04:37:22  | 0      | 91/91 · 733/733            | 1690ms              | 11224ms              | temiz                                                               |
| 9   | 04:39:40  | 0      | 91/91 · 733/733            | 1711ms              | 11106ms              | temiz                                                               |
| 10  | 04:42:25  | 0      | 91/91 · 733/733            | 1696ms              | **16256ms**          | temiz — **süre sıçraması, ama FAIL YOK** (bkz. aşağıdaki `low` not) |
| 11  | 04:44:48  | 0      | 91/91 · 733/733            | 1841ms              | 11120ms              | temiz                                                               |
| 12  | 04:47:06  | 0      | 91/91 · 733/733            | 1807ms              | 11072ms              | temiz                                                               |
| 13  | 04:49:25  | 0      | 91/91 · 733/733            | 1698ms              | 11137ms              | temiz                                                               |
| 14  | 04:51:43  | 0      | 91/91 · 733/733            | 1700ms              | 11066ms              | temiz                                                               |
| 15  | 04:54:24  | 0      | 91/91 · 733/733            | 1705ms              | 11093ms              | temiz                                                               |

**Toplam: 15/15 temiz, 0/15 kırmızı (≈%0 ölçülen oran).** `grep -c "✗" run*.log` →
0, 15/15. Hiçbir koşumda `"failed"` sayısı sıfırdan farklı değil (`grep "Tests.*failed"
run*.log | grep -v " 0 failed"` → 0 satır).

### ⭐⭐ Hüküm — triangülasyon, tek ölçüme dayanmıyor

1. **Mekanik izolasyon doğrulandı** (bkz. İş②) — `commandTimeout`'un 4000ms'e çıkarılması
   gerçek, üretim koduna sızmayan, bağımsız doğrulanmış bir değişiklik.
2. **İstatistiksel iyileşme BÜYÜK:** tur 2'de 18 koşumda ölçülen oran %11.1 (2/18); bu
   turda 15 koşumda **%0 (0/15)**. Eğer gerçek flake oranı HÂLÂ %11.1 olsaydı, 15 ardışık
   temiz koşum gözlemleme olasılığı $0.889^{15} \approx 0.17$ (%17) — düşük ama imkânsız
   değil. **Ancak** bu rakamı TEK BAŞINA kanıt saymıyorum — aşağıdaki nedenden ötürü.
3. **Nedensel açıklama ÖLÇÜLEBİLİR ve bağımsız doğrulandı:** `backend`'in senaryosu
   ("`'health'` profilinin 1500ms `commandTimeout`'u, gerçek ~2000-2140ms komut
   gecikmesinin ALTINDA kalıyordu; test harness'ı şimdi 4000ms kullanıyor, ~1.9× pay")
   `redis-connection-profiles.test.ts`'in R-A4 pinlerini BOZMADAN doğrulandı (19/19,
   aşağıda) — yani production'ın DAVRANIŞI değişmedi, sadece test harness'ının EŞİĞİ
   büyüdü. Bu, salt istatistiksel şans değil, **mekanizması anlaşılan** bir düzeltme.
4. **Önceki 3 turun ortak hatası tekrarlanmadı:** bu turun ölçümü SAKİN makinede
   YAPILMADI — makine en az tur 2 kadar (muhtemelen biraz daha) meşguldü (26 konteyner,
   load avg 2.8-5.9), yani "flake sakin makinede görünmez" tuzağına düşülmedi.

**Sonuç: `Q-1` KAPANDI** — yüksek güvenle (triangüle edilmiş kanıt: mekanik izolasyon +
nedensel açıklama + 15/15 temiz koşum aynı/daha ağır yükte), ama **mutlak kesinlikle
DEĞİL** (olasılıksal bir süreç kalıcı olarak sıfır riskli hale gelmiş OLMAYABİLİR — bu,
tek bir gate turunun ispat edebileceği bir şey değil). Teknik borç olarak **izlenmesi
önerilir** (aşağıdaki `low` not), ama **düzeltme turu açılmasını GEREKTİRMİYOR**.

### `low` not (düzeltme turu açmaz, teknik borca kaydedilsin)

| SEV             | dosya:satır                                 | not                                                                                                                                                                                                                                                                                                                                                  | sorumlu ajan                                     |
| --------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **low** `Q-1-b` | `apps/api/src/__tests__/rate-limit.test.ts` | Koşum 10'da bu dosyanın TOPLAM süresi 11066-11224ms bandının dışına çıkıp **16256ms**'e sıçradı (tek koşumda, FAIL ÜRETMEDEN). 14/15 koşumda dar bantta (11049-11224ms). Bu, ortam yükünün test SÜRESİNE hâlâ yansıdığını gösteriyor — şu an 4000ms `commandTimeout` payı bunu YUTUYOR ama izlenmeli (CI'da süre bütçesi/flaky-süre alarmı önerisi). | `devops`/`backend` (izleme, düzeltme turu DEĞİL) |

---

## İŞ ② — DÖRT KATMANLI İZOLASYON — ÖRNEKLEME İLE DOĞRULAMA

Dördünün HEPSİ bağımsız doğrulandı (brief en az ikisini istiyordu, mekanik olanlar
önceliklendirildi):

1. **Üretim derlemesinde test kodu YOK (mekanik):** `apps/api` içinde `rm -rf dist &&
npx tsc -p tsconfig.build.json` ile TEMİZ bir derleme yapıldı (CI'ın yaptığının
   birebir eşdeğeri); `find dist -iname "*__tests__*"` → **SIFIR sonuç**. Derleme
   sonrası `dist/main.js` sağlam, çalışan `:3100` süreci `/health` → **200** (rebuild
   süreci etkilemedi, ayrı PID/bellek alanı).
2. **eslint kısıtlaması CANLI test edildi:** `apps/api/src/redis/redis.module.ts`'e geçici
   bir ihlal satırı eklendi (`import { createTestHarnessRedisConnection } from
'../__tests__/helpers/create-test-redis-connection.js'`) → `npx eslint
src/redis/redis.module.ts` **KIRMIZI** (`no-restricted-imports`, beklenen mesajla:
   _"Üretim kodu test harness yardımcılarını import EDEMEZ..."_). Dosya **byte-eşit**
   geri alındı (`diff` → boş çıktı) ve `git diff --stat apps/api/src/redis/redis.module.ts`
   boş (hiçbir iz kalmadı). Revert sonrası `npx eslint` **temiz**.
3. **Grep taraması (lint-bağımsız üçüncü katman) AYNI ihlali bağımsız yakaladı:** ihlal
   hâlâ dosyadaydı iken `npx vitest run
src/__tests__/test-harness-redis-profile-isolation.test.ts` çalıştırıldı →
   **"HİÇBİR üretim dosyası `__tests__` altındaki bir modülü import ETMİYOR"** testi
   **KIRMIZI** oldu, bulduğu satır birebir eklediğim ihlal satırıydı
   (`{"file": "apps/api/src/redis/redis.module.ts", "statement": "import {
createTestHarnessRedisConnection } from ..."}`). Revert sonrası bu dosya **13/13**
   yeşil.
4. **`RedisConnectionProfile` union hâlâ `'health' | 'queue'`** — üçüncü değer **YOK**
   (`grep -n "RedisConnectionProfile" create-redis-connection.ts` ile doğrulandı, satır
   82). `redis.module.ts` ve `queue.module.ts`'in `git diff --stat` çıktısı **tamamen
   boş** (hiç dosya listelenmiyor çünkü HEAD'den beri hiç değişmemişler) — backend'in
   "byte-eşit" iddiası bu turda da doğrulandı.
5. **`redis-connection-profiles.test.ts` (R-A4 pinleri) — 19/19 yeşil**, dokunulmadı.
   `test-harness-redis-profile-isolation.test.ts` ile birlikte (`13/13`) toplam
   **32/32** — ikisi birlikte çalıştırıldığında da (`npx vitest run` iki dosya) 527ms'de
   **32 passed** (ayrı dosya, bağımsız doğrulama).

**Sonuç: dört katmanın HEPSİ bağımsız doğrulandı, hepsi tutuyor.** `backend`'in tur 4
raporundaki mekanik izolasyon iddiaları **abartılı veya yanlış DEĞİL**.

---

## İŞ ③ — `AC-17` HÜKMÜ: **PASS**

| Kapı | Komut                 | Sonuç    | Sayı                                                                                                    |
| ---- | --------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| 1    | `pnpm lint`           | PASS     | **23/23** paket                                                                                         |
| 2    | `pnpm typecheck`      | PASS     | **23/23** paket                                                                                         |
| 3    | `pnpm build`          | PASS     | **14/14** paket                                                                                         |
| 4    | `pnpm guards`         | PASS     | **14/14** mekanik adım                                                                                  |
| 5    | `pnpm test:isolation` | PASS     | **11/11** görev (`@arkesoft/db` 6 dosya/78 test + `@arkesoft/api` 5 dosya/22 test = 11/100)             |
| 6    | **`pnpm test`** (kök) | **PASS** | **15/15 koşum temiz (≈%0 kırmızı)** — bkz. İş ①, `@arkesoft/api` her koşumda 91/91 dosya · 733/733 test |
| ek   | `pnpm format:check`   | PASS     | temiz (`prettier --check .` → "All matched files use Prettier code style!")                             |

CLAUDE §6 zorunlu kapı metni: _"`pnpm lint && pnpm typecheck && pnpm test && pnpm
test:isolation && pnpm build && pnpm guards` — hepsi yeşil olmak zorunda."_ Bu turun
15 bağımsız ölçümünde zincirin TAMAMI **15/15 kez** sorunsuz yeşile ulaşırdı.

⇒ **AC-17 PASS** — tur 1-2'nin FAIL hükmü **tersine çevriliyor**: `pnpm test`'in
güvenilmezliği (Q-1), bu turun kendi (daha ağır/karşılaştırılabilir organik yük altında)
15 koşumluk ölçümüyle **kapandı** olarak değerlendiriliyor.

---

## ÖLÇÜMLER

**KABUL KRİTERİ EŞLEMESİ:** bu tur AC'leri yeniden açmadı — tur 1 tablosundaki 17 PASS +
1 kısmen DOĞRULANAMADI/PASS (AC-9) + 1 DOĞRULANAMADI/PASS (AC-18, versiyon artışı henüz
release adımında) geçerliliğini koruyor. **Tek değişen hüküm: `AC-17` → PASS** (bu tur).

**TEST SAYILARI:** bu tur yeni test YAZMADI (kapsam "mevcut iddiayı kendi yük koşullarında
doğrula" idi, eksik senaryo bulunmadı — brief bunu zaten net söylüyordu). Her 15 koşumda
toplam geçen: **20/20 paket · `@arkesoft/api` 733/733 (91 dosya) · toplam en kötü koşumda
başarısız 0**. `pnpm test:isolation`: **100/100 test, 11/11 dosya**.

**KOŞTURULAN KOMUTLAR:**

| Komut                                                                                                            | Exit          | Özet                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------- |
| `pnpm test` (kök) × 15, sıralı, 04:21–04:56                                                                      | 15×0          | **15/15 temiz** — bkz. tablo İş①                                              |
| `rm -rf dist && npx tsc -p tsconfig.build.json` (apps/api, dist izolasyon kontrolü)                              | 0             | `find dist -iname "*__tests__*"` → 0 sonuç                                    |
| `npx eslint src/redis/redis.module.ts` (ihlal eklenmiş hâlde)                                                    | 1             | beklenen `no-restricted-imports` hatası — kısıtlama canlı doğrulandı          |
| `npx eslint src/redis/redis.module.ts` (revert sonrası)                                                          | 0             | temiz                                                                         |
| `npx vitest run test-harness-redis-profile-isolation.test.ts` (ihlal eklenmiş hâlde)                             | 1             | beklenen grep-tabanlı test KIRMIZI, bulduğu satır birebir ihlal               |
| `npx vitest run redis-connection-profiles.test.ts test-harness-redis-profile-isolation.test.ts` (revert sonrası) | 0             | **32/32** (19+13)                                                             |
| `pnpm lint`                                                                                                      | 0             | 23/23                                                                         |
| `pnpm typecheck`                                                                                                 | 0             | 23/23                                                                         |
| `pnpm build`                                                                                                     | 0             | 14/14                                                                         |
| `pnpm guards`                                                                                                    | 0             | 14/14 mekanik adım                                                            |
| `pnpm test:isolation`                                                                                            | 0             | 11/11 görev, 100 test (db 78 + api 22)                                        |
| `pnpm format:check`                                                                                              | 0             | temiz                                                                         |
| `pnpm --filter @arkesoft/admin test:e2e`                                                                         | **KOŞULMADI** | brief'in açık yasağı (İş④) — tur 2'de 22/22, üretim kodu sonrasında değişmedi |

**ORTAM DOĞRULAMASI:** API `:3100` (PID bilinmiyor, Orkestratörün tur 4 sonrası
yeniden başlattığı süreç) → `/health` **200**, bu turdaki `dist` temiz-derleme denemesi
(izolasyon kontrolü için) çalışan süreci BOZMADI (ayrı bellek alanı/PID). Port `3000`
(kullanıcının `demo-site` projesi) **dokunulmadı**. Kullanıcının 26 konteynerlik
(`istoccom`, `cnc_proje`, `moneyprinterturbo`) stack'i **durdurulmadı/öldürülmedi**.

**DOĞRULANAMADI:** `Q-1`'in sıfır-risk olduğu MUTLAK kesinlikle kanıtlanamaz (bkz. İş①
hüküm bölümü — olasılıksal bir süreç) — bu `qa` kapsamının doğası, tek bir gate turunun
aşamayacağı bir sınır. Teknik borca `low` not olarak taşınan izleme önerisi (`Q-1-b`)
bunun somut karşılığı.

---

## SONUÇ

**SONUÇ: PASS.** `Q-1` KAPANDI (triangüle kanıt: mekanik izolasyon bağımsız doğrulandı +
nedensel açıklama ölçülebilir + 15/15 temiz koşum, tur 2 ile karşılaştırılabilir/daha ağır
organik yük altında) ⇒ `AC-17` **PASS** olarak yeniden hükme bağlandı. Dört katmanlı
izolasyonun HEPSİ bağımsız doğrulandı (iki istenen katmandan fazlası). Üretim koduna
**hiçbir** değişiklik yapılmadı (tüm testler okuma + geçici/geri-alınan ihlal + temiz
derleme denemesiydi). `git status` bu turun başında ve sonunda **birebir aynı** (29
satır, drift yok). E2E bu turda bilerek koşulmadı (brief yasağı). 1 `low` not (`Q-1-b`,
izleme önerisi) teknik borç tablosuna taşınabilir, düzeltme turu gerektirmiyor.
