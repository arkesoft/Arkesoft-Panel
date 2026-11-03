T-011 · Alt görev S6 · AJAN: qa · tarih: 2026-11-02 · sürüm: v0.0.9.1 (platform patch 0.1.0 → 0.1.1)

GATE: qa
SONUÇ: PASS

BULGULAR:
  - [SEV: low] `apps/storefront/e2e/global-setup.ts` — Playwright, `webServer`'ın hazırlık probunu (HTTP 503'ü "henüz hazır değil" sayarak sonsuz tekrar eden mantık) `globalSetup`'tan ÖNCE çalıştırıyor. `apps/api` kapalıyken storefront her istekte 503 döndürdüğü için webServer probu asla 2xx/3xx görmüyor ve 30s sonra jenerik `Error: Timed out waiting 30000ms from config.webServer.` ile düşüyor — `global-setup.ts`'in yazdığı açıklayıcı Türkçe "apps/api çalışıyor olmalı, sırayla: pnpm infra:up / db:migrate / db:seed / pnpm --filter @arkesoft/api dev" mesajı HİÇ görünmüyor çünkü globalSetup bu noktaya erişmiyor. Bu Task'ın kapsamı (katman 1+2, env süzmesi/artık süreç) dışında, önceden var olan bir durum; AC3/AC4'ün ölçümünü etkilemedi (apps/api'yi elle başlatınca 3/3 temiz geçti) ama ilk ölçüm turunda yanlışlıkla katman 1+2'nin başarısız olduğu sanılabilecek yanıltıcı bir hata mesajı üretti. — önerilen düzeltme: `playwright.config.ts`'e `webServer.url` kontrolünü 503'te de "teşhis amaçlı globalSetup'ı tetikle" şeklinde değiştirmek zor (Playwright API kısıtı); daha pratik çözüm `README`/`docs/development.md`'ye "e2e koşmadan önce apps/api sağlıklı olmalı, yoksa jenerik bir webServer timeout'u görürsünüz" notu eklemek. — sorumlu ajan: docs (vade: teknik borç, aceleye gerek yok, AC3/AC4'ü bloke etmiyor).

ÖLÇÜMLER:

KABUL KRİTERİ EŞLEMESİ:
  AC3 (e2e yolunda artık `astro dev` süreci kalmaması) → `pnpm --filter @arkesoft/storefront test:e2e` × 3 tekrar × 2 ardışık koşum, öncesi/sonrası `pgrep -fl 'astro dev'` → GEÇTİ (3/3, hepsi boş)
  AC4 (`pnpm test` varsayılan eşzamanlılıkta ≥952 yeşil, flaky değil) → `pnpm test` × 3 ardışık koşum, `--concurrency=1` KULLANILMADI → GEÇTİ (3/3, her koşumda 952/952, 0 fail)
  A5 (katman 1+2 AC3'ü tek başına karşılıyor mu) → yukarıdaki AC3 ölçümü → KARAR: EVET, karşılıyor — katman 3 (`globalTeardown`) EKLENMEDİ

TEST SAYILARI:
  AC3: yeni test eklenmedi (ölçüm görevi) · 11/11 e2e testi × 6 koşum (3 tekrar × 2 ardışık) = 66/66 geçti, 0 fail
  AC4: 952/952 × 3 ardışık koşum = 2856/2856 geçti, 0 fail, 0 flaky

KOŞTURULAN KOMUTLAR:
  `lsof -nP -iTCP:6379 -sTCP:LISTEN` → exit 0 → iki dinleyici: `redis-ser` PID 1445 (homebrew, 127.0.0.1+[::1]:6379) ve `com.docke` PID 5321 (docker-compose, *:6379) — halka 4, kapsam dışı, ortam notu, dokunulmadı
  `pgrep -fl 'astro dev|turbo|vite|tsc --watch|node --watch'` (İŞ 1, koşum öncesi) → exit 1 (boş) → artık süreç yok
  `lsof -nP -iTCP:3000 -sTCP:LISTEN` (İŞ 1) → exit 1 (boş) → port serbest
  `pnpm --filter @arkesoft/storefront test:e2e` (ilk deneme, apps/api KAPALIYKEN) → exit 1 → `Timed out waiting 30000ms from config.webServer.` — bu AC3'ün kendi ölçümü DEĞİL, eksik ön koşulun (apps/api) teşhisi; `DEBUG=pw:webserver` ile doğrulandı: webServer probu sürekli HTTP 503 alıyor (Astro SSR, API'ye ulaşamadığı için 503 döndürüyor), Playwright 503'ü "henüz hazır değil" sayıp 30s dolana kadar bekliyor
  `pnpm --filter @arkesoft/api dev` (arka plan, tek seferlik, AC3/AC4 ölçümünden önce ön koşulu sağlamak için) → `/health/ready` 1s içinde 200 → ardından AC4 ölçümünü bozmamak için süreç `kill` edildi ve `pgrep`/`lsof` ile temizliği doğrulandı
  AC3 — Tekrar 1/2/3, her birinde: öncesi `pgrep -fl 'astro dev'` → exit 1 (boş) → `pnpm --filter @arkesoft/storefront test:e2e` (koşum A) → 11 passed → `pnpm --filter @arkesoft/storefront test:e2e` (koşum B, ikinci ardışık) → 11 passed → sonrası `pgrep -fl 'astro dev'` → exit 1 (boş) — 3/3 tekrar, 6/6 koşum, hepsi temiz
  AC4 — Koşum 1/2/3, her birinde: öncesi `pgrep -fl 'astro dev'` → exit 1 (boş) → `pnpm test` (varsayılan eşzamanlılık, `--concurrency=1` KULLANILMADI) → `Tasks: 16 successful, 16 total` → toplam test: 23(ui)+39(tenancy)+48(errors)+37(admin)+78(storefront)+217(theme-sdk)+32(trpc)+166(db)+312(api) = **952/952**, 0 fail — 3/3 koşum aynı sonuç, flaky YOK
  Koşum 3 sonrası geniş `pgrep -fl 'astro dev|turbo|vite|tsc --watch|node --watch'` → exit 1 (boş); `lsof` 3000/4321/5173 → üçü de exit 1 (boş) — tüm süreçler kapalı, portlar serbest
  `git status --short` → katman 3 EKLENMEDİ, Grup 1-3'ün bıraktığı dosyalar (astro.config.ts, package.json, playwright.config.ts, storefront-env.ts, check-env.ts, env.ts, turbo.json, + yeni test dosyaları) dışında bu gate turundan kaynaklı HİÇBİR değişiklik yok

A5 KARARI (gerekçeli): 3/3 temiz → **`globalTeardown` EKLENMEDİ**. Gerekçe (bağlayıcı, task'ın verdiği metinle): kaldırılabilir bir kök neden (katman 1: `env -u` dedektör temizliği) varken ve davranış 3/3 tekrar + 6/6 koşumda doğrulanmış şekilde temizken, ayrıca bir süreç katili eklemek kapının kendisini riskli kılar (yanlış süreç öldürme riski — bkz. dosya başı A-M5/A-M7 notları). Katman 1+2 AC3'ü **tek başına** karşılıyor.

S5'İN (b) MEKANİZMASININ AYRIMI: S5'in ölçtüğü "turbo abort teardown'ı `pnpm dev` yolunda `tsc --watch`/`node --watch`/`vite`'ı öksüz bırakıyor" mekanizması bu turda **test EDİLMEDİ ve EDİLMEMELİYDİ** — bu Task'ın kapsamı yalnızca e2e (AC3) yolu. Bu gate turunda `pnpm dev`/turbo abort senaryosu hiç tetiklenmedi (yalnızca `pnpm test` ve `pnpm --filter test:e2e` koşuldu, ikisi de normal/başarılı tamamlandı, abort yok); dolayısıyla (b) bu ölçümde ne doğrulandı ne çürütüldü — zaten task'ın DOKUNMA listesi `turbo.json`'u ve kapsam dışı bırakıyor. Not: AC3 ölçümü sırasında ön koşulu sağlamak için elle başlattığım `pnpm --filter @arkesoft/api dev` süreci de `tsc --watch` + `node --watch` kullanıyordu (apps/api'nin kendi dev script'i) — bunu AC4'ten önce bilinçli olarak `kill` ettim ki (b)'ye benzer bir artık süreç AC4 ölçümünü bulandırmasın; bu benim ölçüm hijyenimdi, (b) mekanizmasının kendisinin bir kanıtı değil.

EŞZAMANLILIK/EŞİK: Turbo eşzamanlılığı DEĞİŞTİRİLMEDİ (`turbo.json`'a dokunulmadı). `--concurrency=1` hiçbir AC4 koşumunda KULLANILMADI. Eşik düşürülmedi, test gevşetilmedi.

KATMAN 3 DURUMU: Eklenmedi. `git status --short` bu gate turundan kaynaklı sıfır değişiklik gösteriyor (yukarıdaki komut çıktısı).

SÜREÇ/PORT TEMİZLİĞİ (tur sonu): `pgrep -fl 'astro dev|turbo|vite|tsc --watch|node --watch'` boş · 3000/4321/5173 serbest.
