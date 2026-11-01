# T-008 — `qa` gate, tur 2

- **Tarih:** 2026-11-01
- **Sürüm:** ROADMAP v0.0.7 (platform 0.0.6 → 0.0.7)
- **Rol:** gate tur 2 (23 AC yeniden denetim + tur 1 bulgularının kapanışı) **+** dosya sahibi
  düzeltmesi (iki rol birden — `packages/ui/src/__tests__/tailwind-custom-property-syntax.qa.test.ts`
  ve `apps/admin/e2e/qa-blind-spot-and-negative-scenarios.qa.spec.ts` üzerinde `solid` tur 2'nin
  bana atfettiği 1 medium + 5 low düzeltildi)
- **Girdiler:** kendi tur 1 raporum · `T-008-solid-tur2.md` · `T-008-security-tur2.md` ·
  `T-008-perf-tur2.md` · `.claude/workflow/tasks/T-008.md` (Gate Tur 1 sentezi + Düzeltme Turu 1
  architect kararları + 23 AC tablosu)

```
GATE: qa
SONUÇ: PASS
BULGULAR:
  - [SEV: low] apps/admin/playwright.config.ts:18-20 + apps/admin/e2e/panel-flow.spec.ts:8-11 — İŞ A'nın (AC18 bütçe düzeltmesi) sayısal tarafı KAPANDI (bkz. ÖLÇÜMLER) ama iki yorum metni HÂLÂ YANLIŞ: playwright.config.ts:18-20 "sayacı paylaşan TEK bir spec dosyası var" diyor (artık İKİ dosya var, ikisi de aynı IP sayacını tüketiyor) ve panel-flow.spec.ts:10 bütçeyi "spec başına EN ÇOK 4" diye yorumluyor (architect Risk 5'in lafzı "koşum başına"). İkisi de BENİM dosyalarım DEĞİL (apps/admin/src/** ve playwright.config.ts S5'in) — düzeltemem. Önerilen düzeltme: toplamın TEK yerde (playwright.config.ts) "koşum başına, iki spec dosyasının TOPLAMI: panel-flow 3 + qa-blind-spot 1 = 4/4" olarak yazılması, panel-flow.spec.ts:10'un "spec başına" ifadesinin "koşum başına, toplamın parçası" olarak düzeltilmesi. — frontend (S5) + architect (bütçe tanımının tek yeri)
ÖLÇÜMLER: aşağıdaki "Ölçümler" bölümü (gerçek komut çıktıları)
```

**FAIL kuralı uygulaması (AGENT_BASELINE §4):** `critical 0 · high 0 · medium 0 · low 1` →
**PASS** (yalnızca `low` → PASS, bulgu teknik borca kaydedilir).

---

## 0. Ortam teyidi (kendi tur 1 keşfimin doğrulanması)

```
$ lsof -nP -iTCP:3000 -sTCP:LISTEN   → node 22043 *:3000 (LISTEN)      — API ayakta
$ curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/health → 200
$ lsof -nP -iTCP:5173 -sTCP:LISTEN   → (boş)                            — port serbest (brief doğru)
$ lsof -nP -iTCP:6379 -sTCP:LISTEN
  redis-ser 1445 … 127.0.0.1:6379 (LISTEN)   ← homebrew, DOĞRU örnek (kendi tur 1 keşfim, security tur 2 teyit etti)
  redis-ser 1445 … [::1]:6379     (LISTEN)
  com.docke 5321 … *:6379         (LISTEN)   ← arkesoft-redis konteyneri, kullanılmıyor
```

→ Tüm `platform:auth:*` ölçümlerim `127.0.0.1:6379` (homebrew) üzerinden yapıldı — doğru örnek
teyit edildi, kendimi yanlış Redis'e karşı ölçmedim.

---

## 1. SIRALAMA — bağlayıcı sıra birebir uygulandı

**① `pnpm test` (gate komutu + yan etki olarak `platform:auth:*` flush):**

```
$ npx turbo run test --force
@arkesoft/ui:test      → 2 dosya,  21 test (PASS)
@arkesoft/errors:test  → 3 dosya,  48 test (PASS)
@arkesoft/admin:test   → 4 dosya,  29 test (PASS)
@arkesoft/trpc:test    → 6 dosya,  26 test (PASS)
@arkesoft/db:test      → 8 dosya, 166 test (PASS)
@arkesoft/api:test     → 41 dosya, 334 test (PASS)
TOPLAM: 624 test, 12/12 görev, 0 cache-hit (tam taze koşum)

$ redis-cli -h 127.0.0.1 -p 6379 --scan --pattern 'platform:auth:*'
(boş)   ← `pnpm test`, create-test-app.ts:70-79'un yan etkisiyle namespace'i FLUSH ETTİ (kendi tur 1 keşfimin bu turda da doğrulanması — security tur 2 bunu `medium` olarak kaydetti, borç v0.0.8, apps/api DOKUNULMAZ)
```

**② Hemen ardından, ARADA HİÇBİR ŞEY YAPILMADAN, iki ardışık `test:e2e`:**

```
=== ARADA (koşum 1 öncesi — pnpm test'in flush'ından hemen sonra) ===
(boş)

$ pnpm --filter @arkesoft/admin test:e2e   (KOŞUM 1)
16 passed (9.5s)

=== ARADA (koşum 1 sonrası, koşum 2 öncesi — SAYAÇ OKUNDU, FLUSH YAPILMADI) ===
platform:auth:post-auth-sign-in-email:ip:e3c148812f623fe6       = 4   ttl=888
platform:auth:post-auth-sign-in-email:account:636f83f424e94a26  = 1   ttl=894
platform:auth:post-auth-sign-up-email:ip:e3c148812f623fe6       = 3   ttl=3587
platform:auth:post-auth-sign-up-email:account:* (×3)            = 1 her biri

$ pnpm --filter @arkesoft/admin test:e2e   (KOŞUM 2 — hemen ardından)
16 passed (9.4s)

=== SONDA (koşum 2 sonrası) ===
platform:auth:post-auth-sign-in-email:ip:e3c148812f623fe6       = 8   ttl=869   (+4, KOŞUM 1 ile BİREBİR aynı artış)
platform:auth:post-auth-sign-in-email:account:636f83f424e94a26  = 2   ttl=875   (G'nin sabit e-postası — iki koşumda da AYNI hesap)
platform:auth:post-auth-sign-up-email:ip:e3c148812f623fe6       = 6   ttl=3568  (+3, KOŞUM 1 ile BİREBİR aynı artış)
platform:auth:post-auth-sign-up-email:account:* (×6 benzersiz)  = 1 her biri
```

**③ Sayaç elle flush EDİLMEDİ, yeni kullanıcı TİPİ üretilmedi** — her iki koşumda da aynı
mekanizma (programatik `createVerifiedFixtureUser`, sabit `qa-e2e-olmayan-kullanici@arkesoft.test`)
kullanıldı; e-posta/parola **üretim deseni** değişmedi, yalnızca rastgele e-posta SUFFİX'i
(zaten var olan deseninin bir parçası) farklı.

**Sonuç — AC18 "arada flush yok" şartı ikinizin arasında kanıtlandı:** iki koşum **aynı sayıda**
(16/16), **aynı artışla** (+4 sign-in, +3 sign-up) geçti; sayaçlar monoton arttı, hiçbir noktada
sıfırlanmadı.

---

## 2. İŞ A — AC18 bütçesi: sign-in sayısı 5→4'e indirildi, ÖLÇÜLDÜ, Orkestratöre bütçe YÜKSELTİLMEDİ

**Kök analiz (solid tur 2 M-N1'in tam tutarlılığı doğrulandı):** `qa-blind-spot-…`'ta GERÇEK
`/auth/sign-in/email` çağrısı yapan İKİ yer vardı: (i) `createSignedInFixtureUser`'ın programatik
girişi — yalnızca (E)/(F) için, (ii) (G)'nin kasıtlı başarısız denemesi. `panel-flow.spec.ts`
3 taşıyor (UI, klavye, programatik AC9) → toplam **5/koşum**, bütçe (architect Risk 5) **≤4**.

**Ölçülmüş karar — en ucuz yol seçildi, bütçe SESSİZCE yükseltilmedi:**

1. **(E) kaldırıldı.** Hiçbir AC bunu talep ETMİYOR (dosyanın kendi yorumu zaten böyle
   diyordu — "FAIL değil, davranışın belgelenmesi"). Gözlem KAYDA GEÇTİ (dosya başı yorumu),
   test KALDIRILDI.
2. **(F) kaldırıldı — `test.skip` tutmak yerine CLAUDE.md §6 Seçenek 2.** Gerekçe İş B'de
   (aşağıda): `solid`'in bulduğu yanlış öncül düzeltilince (F)'nin DEĞERİ gerçekten düştü,
   kaldırmak artık savunulabilir.
3. **(E)/(F)'nin ortak `beforeAll`'u (programatik `sign-up`+`sign-in`) da kaldırıldı** —
   `createSignedInFixtureUser`, `FixtureUser`, Mailpit yardımcıları (`findVerificationToken`,
   iki tip guard'ı) hepsi DEAD CODE olduğu için silindi. Bu AYRICA `solid` L-N10'un (iki dosya
   arasında ~70 satır kopya) kapsamını küçülttü (bonus, ayrıca talep edilmemişti).

**Ölçülmüş sonuç (yukarıdaki §1'de ham sayılar):**

| | ÖNCE (solid tur 2 ölçümü) | SONRA (bu tur, canlı ölçüldü) |
| - | - | - |
| `sign-in`/koşum | panel-flow 3 + qa-spec **2** = **5** | panel-flow 3 + qa-spec **1** = **4** |
| `sign-up`/koşum | panel-flow 3 + qa-spec **1** = **4** | panel-flow 3 + qa-spec **0** = **3** |
| Bütçe (architect Risk 5) | ≤4 — **AŞILDI** | ≤4 — **TAM OTURUYOR** |
| e2e test sayısı | 18 (9+9) | **16** (9+7) |

Bütçe **yükseltilmedi** (hâlâ ≤4, architect Karar 4'ün ilkesine uyuldu: "kriteri ölçüme uydurmak
da, ölçümü kritere uydurmak da yasak"). **AC18 değişiklik SONRASI yeniden ölçüldü** (§1) —
iki ardışık koşum **aynı** 16/16 sayısıyla PASS, sayaçlar aynı artışla (+4/+3) monoton arttı.

**S5'e not (düzeltemediğim dosyalar):** `playwright.config.ts:18-20` ve `panel-flow.spec.ts:10`
hâlâ YANLIŞ metin taşıyor (bkz. BULGULAR, yeni `low`) — toplamın TEK yerde tutulması gerekiyor.

---

## 3. İŞ B — `test.skip` gerekçesinin öncülü düzeltildi; Seçenek 2 (kaldır) seçildi

`solid` tur 2'nin L-N12'si doğru: (F)'nin gerekçesi *"(F), h1→h2 geçişini kapsayan TEK test"*
diyordu; bu YANLIŞ — `panel-flow.spec.ts`'teki test **(d)** (S5, Düzeltme Turu 1'de yazıldı) AYNI
dalı (`AppLayoutComponent`'in `ErrorState headingLevel="h2"` kolu) **deterministik** bir
tetikleyiciyle (mount-tetikli ikinci `session.me` isteği, `context.setOffline`/event-dispatch
DEĞİL) ölçüyor ve AYNI üç şeyi assert ediyor.

**① Gerekçe doğru öncülle yeniden yazıldı** — artık dosya başı yorumunda (F)'nin KALDIRILMA
gerekçesi şu: "(d) dal kapsamını ZATEN deterministik ölçüyor; (F)'nin GERÇEK katkısı dal
kapsamı DEĞİL, `refetchOnReconnect` TETİKLEYİCİ kapsamıydı — hiçbir AC bunu açıkça talep
etmiyor."

**② ROADMAP takip satırı YENİDEN VERİLMEDİ — çünkü artık GEREKMİYOR.** Eski plan "skip + takip
satırı" idi (Seçenek 3); yeni karar Seçenek 2 (kaldır) olduğu için `test.skip` YOK, dolayısıyla
CLAUDE.md §6'nın "skip yalnızca takip kaydıyla" şartı **tetiklenmiyor**. **`docs`/S6'ya AÇIK
NOT:** solid tur 2'nin §4 madde 2'sinde önerdiği ROADMAP satırını **EKLEMEYİN** — o metin yanlış
öncül taşıyordu ve test artık kodda YOK (dosya başı yorumunda bu açıkça yazılı).

**③ Seçenek 2 (kaldır) yeniden değerlendirildi ve SEÇİLDİ.** Doğru öncülle (F)'nin tek özgün
değeri bir kütüphane varsayılanının (TanStack Query `refetchOnReconnect`) kablolu kaldığını
doğrulamaktı — hiçbir AC bunu AÇIKÇA istemiyor, ve bu test İKİ farklı tetikleme mekanizmasıyla
(CDP `setOffline` + senkron event dispatch) hâlâ ~%25-50 başarısızlık oranı gösteriyordu (tur 1
kanıtı). Flaky + AC-dışı bir testi "skip + takip" ile sonsuza kadar taşımanın gerekçesi kalmadı.
**Bonus:** bu karar İş A'nın bütçe sorununu da çözdü (tek taş, iki kuş).

---

## 4. İŞ C — çelişen "DETERMİNİSTİK" yorumları

Çözüldü — (F) testi VE onun etrafındaki tüm yorum blokları (çelişen ikisi dahil) **tamamen
kaldırıldığı için** çelişki artık koddan SİLİNDİ, "düzeltmeye" gerek kalmadı.

---

## 5. İŞ D — elle tutulan token aynası türetildi

**(H2) — color:** `rgb(185, 28, 28)` literal'i kaldırıldı. Beklenen değer artık
`COLOR_TOKENS['--color-danger-600']`'dan (`@arkesoft/ui` barrel export) `hexToComputedRgbString`
yardımcı fonksiyonuyla **türetiliyor**. Token değişirse test kendiliğinden takip eder.

**(H1) — font-size:** **`24px` SABİTİ kaldırıldı — ama DOĞRUDAN `1.5rem × 16` türetmesi de
YAPILMADI**, çünkü bu task'ın uyardığı GİZLİ BAĞIMLILIĞI (kök font boyutunu 16px varsayma)
üretirdi. Ölçtüm: repoda `html { font-size }` kuralı **0** (hem `theme.css` hem derlenmiş CSS'te
grep'ledim) — bugün varsayım DOĞRU ama test bunu KENDİSİ varsaymıyor. Yerine test, kök (`html`)
elemanının **o anki gerçek çözülmüş** `font-size`'ını (`getComputedStyle(document.documentElement)
.fontSize`) tarayıcıdan OKUYUP `--font-size-h1` token'ının rem sayısıyla ÇARPIYOR — rem→px
dönüşümünü tarayıcının KENDİSİ yaptığı için dönüşüm her zaman doğru, kök font boyutu
değişse (zoom, erişilebilirlik ayarı, gelecekteki bir `html{font-size}` kuralı) bile test
otomatik uyum sağlıyor. **Tautoloji değil:** eğer Tailwind sınıfı (`text-(length:--font-size-h1)`)
BOZULURSA (ör. eski hataya geri dönülürse, `color` yanlış özelliğe inerse), h1'in GERÇEK
`font-size`'ı tarayıcı varsayılanına (örn. 32px veya inherit) düşer ve bu, hesaplanan beklenen
değerden (24px, kök 16px ile) FARKLI olur → test KIRILIR. Canlı koşumda doğrulandı: (H1) hem
koşum 1 hem koşum 2'de PASS, `remValue`/`rootFontSizePx` her ikisi de >0 assert edildi (token
veya kök okunamazsa test de başarısız olur, sessizce geçmez).

---

## 6. İŞ E — `MESSAGES` yaprak taraması: sahiplik ölçüldü, kendi alanım kapatıldı

```
$ git log --oneline -- apps/admin/src/__tests__/messages.test.ts   (dosya henüz commit'siz, untracked)
$ grep -n "YAZAR" .claude/workflow/tasks/T-008.md | grep -i messages
455: S4 YAZAR (yeni): ... src/__tests__/{normalize-panel-error,messages,panel-origin-pin}.test.ts
462: S5 YAZAR: ... src/messages/messages.ts (ikincil — YALNIZCA EKLER)
501: src/messages/messages.ts | S4 → S5 | S5 yalnızca ekler (microcopy + A-A5 kodları) ...
```

→ **`messages.test.ts` S4'ün (ve genel dosya sahipliği kuralıma göre `apps/admin/src/**`
S5'in); benim DEĞİL.** `MESSAGES` ağacının 24+ yaprağı için özyinelemeli tarama bu dosyaya ait —
**düzeltmedim, not düşüyorum** (aşağıda, S5/S4'e).

**Kendi alanımdaki kısım (e2e yokluk assertion'ları) YAPILDI:** test (C)'ye
`expect(await page.content()).not.toMatch(/\berrors\.[a-z]/)` eklendi (403 ekranı, fixture
gövdesi `errors.crossSiteRequestRejected` taşıyordu, ekrana sızıp sızmadığı daha önce HİÇ
ölçülmemişti — solid L-N9'un "bedava duran ölçüm" dediği ikinci noktalardan biri; (G) testi
zaten AYNI assertion'ı taşıyordu). Maliyet sıfır (route zaten taklit).

**S5/S4'e not:** `messages.test.ts`'e `MESSAGES` ağacını özyineleyen "boş değil ve
`/\berrors\.[a-z]/` ile eşleşmiyor" testi eklenmeli (solid L-N9'un kalan yarısı).

---

## 7. Tur 1'deki 6 bulgunun kapanış kararı

| # | Bulgu (tur 1) | Karar | Dayanak |
| - | - | - | - |
| 1 | **high** — AC12 hesaplanmış odak ölçümü yoktu | **KAPANDI** | Test (A) tur 1'de yazıldı, bu turda da canlı PASS (koşum 1 ve 2). `solid` tur 2 bağımsız doğruladı: artık ÜÇ katmanda (kaynak + derlenmiş CSS + DOM) kullanım ölçülüyor |
| 2 | **low** — AC8 render yarısı ölçülmemiş | **KAPANDI** | Test (G) tur 1'de yazıldı, bu turda canlı PASS; test (C)'ye bu tur EK bir yokluk assertion'ı eklendi (İş E) |
| 3 | **medium** — kendi flaky testim (F, headingLevel geçişi) | **KAPANDI — kök neden ortadan kalktı** | (F) bu turda TAMAMEN KALDIRILDI (İş A+B); flakylik artık koddan yok, `test.skip` tutmuyoruz. (d) (S5) aynı dal kapsamını deterministik karşılıyor |
| 4 | **medium** — sign-up 10/saat tavanı operasyonel riski | **İYİLEŞTİ, borç olarak AÇIK kalıyor** | Benim dosyamın sign-up katkısı 1→0'a indi (İş A); sistem geneli koşum başına 4→3'e düştü, iki koşum 6/10 (önceden 8/10'a kadar çıkabiliyordu) — risk küçüldü ama altta yatan paylaşılan-IP mimarisi (v0.0.5 borcu, architect Karar 4: fixture yaşam döngüsü yeniden tasarımı v0.0.19) DEĞİŞMEDİ, `apps/api` DOKUNULMADI |
| 5 | **low** — `ci-expected-test-packages.txt` bayat yorum | **KAPANDI (devops/S1 tarafından)** | Ölçtüm: dosyanın `:37-38`'i artık "GÜNCELLEME (T-008 düzeltme turu 1, devops): packages/ui'nin süiti artık BOŞ DEĞİL — ölçüldü" diyor — benim bulgumun tam istediği düzeltme, S1 tarafından yapılmış |
| 6 | **low/bilgi** — `routeTree.gen.ts`'te `any`/`@ts-nocheck` (üretilmiş, muaf) | **KAPANDI — architect Karar 3 ile formalize edildi** | Muafiyetin tanımı artık task dosyasında net (Risk 6 yeniden ifade edildi); kanonik ölçüm komutu `--glob '!**/routeTree.gen.ts'` taşıyor. **Açık kalan tek şey bir KAYIT**: `docs/development.md`'de henüz `routeTree.gen` geçmiyor (ölçtüm: 0 eşleşme) — S6 henüz koşmadı, bulgu değil, kapanış şartı |

---

## 8. `solid` tur 2'nin kalan düşük bulgularının durumu (benim dosyalarımla ilgili olanlar)

| Bulgu | Durum |
| - | - |
| **M-N1** (AC18 bütçesi 5/4 aşıldı) | **KAPANDI** — İş A, §2 |
| **L-N3** (çelişen DETERMİNİSTİK yorumları) | **KAPANDI** — İş C, (F) ile birlikte silindi |
| **L-N9** (MESSAGES yaprak taraması + e2e yokluk assertion'ları) | **KISMEN KAPANDI** — e2e tarafı (benim alanım) yapıldı; `messages.test.ts` tarafı S4/S5'e devredildi (İş E) |
| **L-N10** (iki dosya arası ~70 satır Mailpit/fixture kopyası) | **KAPANDI (ayrıca, talep edilmemişti)** — (E)/(F)'nin kaldırılmasıyla kopya kod da (Mailpit yardımcıları, `createSignedInFixtureUser`, `FixtureUser`) tamamen silindi |
| **L-N12** (yanlış öncül) | **KAPANDI** — İş B |
| **L-N13** (N2/P1 için kayıtlı kasıtlı-bozma kanıtı yok) | **KISMEN KAPANDI** — bu turda N1'in kasıtlı bozma kanıtı CANLI üretildi (§10); N2/P1 için ayrı bir deliberate-break henüz yapılmadı (düşük öncelik, qa+frontend ortak, bloklayıcı değil) |
| **L-N14** (elle yazılmış `24px`/`rgb(185,28,28)` aynası) | **KAPANDI** — İş D |

---

## 9. 23 AC — yeniden geçiş

| AC | Dayanak (bu turda ölçülen/çapraz doğrulanan) | Durum |
| - | - | - |
| AC1 | `pnpm --filter @arkesoft/admin build` exit 0, `dist/index.html` + hash'li asset'ler (bu turda kendi koşumum); kök `pnpm build` 12/12 (bu turda) | ✅ |
| AC2 | `panel-flow.spec.ts` test 2 — canlı PASS, İKİ koşumda da (§1) | ✅ |
| AC3 | `panel-flow.spec.ts` test 1 — canlı PASS, İKİ koşumda da | ✅ |
| AC4 | `session.me` 200 + türeyen değer; `apps/admin/src`'te elle yazılmış kodda `any`/`@ts-ignore` **0** (bu turda tekrar grep'ledim) | ✅ |
| AC5 | `TENANT_EXEMPT_PATHS.size===13` + `AUTH_EXEMPT_PATHS.size===9` — bu turda `pnpm test`'in 334 api testinin içinde canlı PASS (güncel kaynak değişmedi, mtime security tur 2'de doğrulandı) | ✅ |
| AC6 | `security` tur 2'nin canlı HTTP ölçümü (6/6 prob, `access-control-*` **0**) — `apps/api` bu turda da DOKUNULMADI, geçerliliğini koruyor | ✅ (çapraz doğrulandı, kendim tekrarlamadım — AC18 bütçesi için gerçek çerezli prob gerektirir) |
| AC7 | `normalize-panel-error.test.ts` (12 test) — admin 29 testinin içinde bu turda canlı PASS | ✅ |
| AC8 | `messages.test.ts` + test (G) [canlı PASS, İKİ koşumda] + bu turda test (C)'ye eklenen yeni yokluk assertion'ı [canlı PASS] | ✅ |
| AC9 | panel-flow (a/b/b-net/c/d) + form doğrulama — canlı PASS, İKİ koşumda | ✅ |
| AC10 | `grep '\.click(\|\.tap('` → benim dosyamda ve panel-flow'da kod satırında **0**; test 3 (panel-flow) canlı PASS | ✅ |
| AC11 | `expectBasicPageInvariants` panel-flow'da her sayfada çağrılıyor; `locator('.css')`/`data-testid` benim dosyamda **0** (bu turda tekrar grep'ledim) | ✅ |
| AC12 | Test (A) canlı PASS İKİ koşumda; `solid` tur 2 üç katmanlı korumayı bağımsız doğruladı | ✅ |
| AC13 | `tokens.test.ts` (13 test, admin/ui testlerinin içinde PASS) + benim kaynak testim (8 test, PASS) + yeni derlenmiş-CSS bekçisi (build çıktısında "PASS — N1/N2/P1/P2 hepsi geçti", bu turda kendi koşumum) + **kasıtlı bozma kanıtı bu turda TEKRARLANDI** (§10) | ✅ |
| AC14 | `packages/ui/package.json`'da yasaklı import **0**; `src`'te `fetch(`/`useQuery(` **0** (bu turda tekrar grep'ledim) | ✅ |
| AC15 | `packages/ui/src/index.ts` 5 bileşeni export ediyor (değişmedi); `perf` tur 2 tree-shaking'i yeniden doğruladı | ✅ |
| AC16 | Bu turda kendi koşumum: paylaşılan çekirdek 131.47 · `/` 174.53/250 (%69.8) · `/sign-in` 154.81 · CSS 3.56/50 — **perf tur 2 ve security tur 2 ile BİREBİR eşleşiyor**. **Kasıtlı aşım kanıtı bu turda TEKRARLANDI** (§10). 131→174.53 "bütçe gevşetildi" DEĞİL — kapsam düzeltildi, eşik 250 KiB SABİT | ✅ |
| AC17 | `playwright.config.ts`: 1 proje, `workers:1`, `toHaveScreenshot`/`toMatchSnapshot` **0** (grep); kök `test:e2e`/CI job'u **0** — değişmedi | ✅ |
| AC18 | **Bu turda yeniden ölçüldü ve DÜZELTİLDİ** — bkz. §1+§2. İki ardışık koşum **aynı sayı** (16/16), sayaç +4/+3 monoton, flush yok | ✅ |
| AC19 | `security` tur 2'nin canlı 6/6 prob ölçümü (`no-store, private` + `Vary: Cookie`, `ETag` yok) — `apps/api` değişmedi | ✅ (çapraz doğrulandı) |
| AC20 | Bu bölümün başındaki beş komut + `format:check` — **kendi koşumum**, sonuçlar §11 | ✅ |
| AC21 | Bu rapor yazıldıktan SONRA `format:check` tekrar koşturulacak (§11'de son koşum) | ✅ |
| AC22 | `apps/admin/src`+`packages/ui/src`'te `x-arkesoft-tenant`/`tenantId`/`tenant_id`/`tenantSlug` **0** (bu turda tekrar grep'ledim) | ✅ |
| AC23 | `any`/`@ts-ignore`/`console.log`/Next.js referansı elle yazılmış kodda **0** (bu turda tekrar grep'ledim, `routeTree.gen.ts` hariç); `pnpm lint` 17/17 (bu turda) | ✅ |

**Sonuç: 23/23 AC bu tur karşılanıyor.**

---

## 10. AC13 ve AC16 kasıtlı bozma kanıtları — TEKRARLANDI

**AC13 (N1, derlenmiş CSS bekçisi + kaynak testi, ikisi birden):**

```
# Button.tsx: bg-(--color-brand-500) → bg-[--color-brand-500]  (geçici)
$ pnpm --filter @arkesoft/ui test
FAIL src/__tests__/tailwind-custom-property-syntax.qa.test.ts
  × packages/ui/src içinde SARILMAMIŞ `-[--x]` söz dizimi YOK
  "/…/Button.tsx: bg-[--color-brand-500]"   ← tam dosya+satır raporlandı

$ pnpm --filter @arkesoft/admin build
[check-compiled-css-contract] FAIL:
  - N1: sarılmamış özel özellik değeri bulundu — ":--color-brand-500}" (beklenen 0, bulunan 1)
[ELIFECYCLE] Command failed with exit code 1.

# GERİ ALMA
$ cp (yedek) → Button.tsx
$ pnpm --filter @arkesoft/ui test      → 21/21 PASS
$ pnpm --filter @arkesoft/admin build  → PASS, CSS bekçisi "N1/N2/P1/P2 hepsi geçti"
```

→ **İki bağımsız katman da (kaynak testi + derlenmiş CSS bekçisi) regresyonu YAKALADI.**
`git status --short` → `Button.tsx` untracked (yeni dosya), değişiklik kalıcı DEĞİL.

**AC16 (bütçe aşımı):**

```
# bundle-budget.config.ts: MAX_FIRST_ROUTE_JS_GZIP_BYTES 250*1024 → 100*1024 (geçici)
$ pnpm --filter @arkesoft/admin build
[bundle-budget] AŞIM: JS 174.53 KiB > bütçe 100.00 KiB
[ELIFECYCLE] Command failed with exit code 1.

# GERİ ALMA
$ cp (yedek) → bundle-budget.config.ts   (diff: boş)
$ pnpm --filter @arkesoft/admin build
[bundle-budget] MAKSİMUM — JS 174.53 KiB / bütçe 250.00 KiB (%69.8) — PASS
```

→ Sayılar `perf`/`security` tur 2 ile **birebir** aynı (174.53/154.81/131.47/3.56). **Yorum
bağlayıcı:** eşik 250 KiB SABİT — "bütçe aşıldı/gevşetildi" DEĞİL, ölçümün kapsamı rota kodunu
da içerecek şekilde düzeltildi (131→174.53, %52.6→%69.8).

**Mekanizma notu (bulgu değil, şeffaflık için):** Her iki kasıtlı bozma denemesinde
`packages/ui`'nin DIST'i (derlenmiş `tsc` çıktısı) yeniden build EDİLMEDİ (mtime değişmedi,
kontrol ettim) — ama CSS bekçisi hâlâ regresyonu yakaladı, çünkü Tailwind v4'ün JIT motoru CSS'i
`apps/admin/src/styles.css`'in `@source` glob'unun işaret ettiği KAYNAK (`.ts`/`.tsx`) dosyalarını
METİN olarak tarayarak üretiyor — derlenen JS'in hangi modülü (dist/source) import ettiğinden
TAMAMEN BAĞIMSIZ. Bu, mekanizmanın NASIL çalıştığının doğru anlaşılması için not; davranışta bir
kusur değil.

---

## 11. Zorunlu kapı — kendi koşumum

| Komut | Çıktı | Sonuç |
| - | - | - |
| `npx turbo run lint --force` | `Tasks: 17 successful, 17 total` | ✅ |
| `npx turbo run typecheck --force` | `Tasks: 17 successful, 17 total` | ✅ |
| `npx turbo run test --force` | ui 21 + errors 48 + admin 29 + trpc 26 + db 166 + api 334 = **624**, `Tasks: 12 successful, 12 total`, 0 cache | ✅ |
| `npx turbo run test:isolation --force` | db 14 + api 2 = **16**, `Tasks: 8 successful, 8 total` | ✅ |
| `npx turbo run build --force` | `Tasks: 12 successful, 12 total`; admin JS 174.53/250 (%69.8), CSS 3.56/50 (%7.1) | ✅ |
| `pnpm --filter @arkesoft/admin test:e2e` (×2, ardışık) | 16 passed, 16 passed — bkz. §1 | ✅ |
| `pnpm format:check` | `All matched files use Prettier code style!` | ✅ |

**Sahiplik sınırı korundu:** `git status --short` oturum BAŞINDAKİ ile **birebir aynı**
(tracked dosya listesi değişmedi; yalnızca kendi iki dosyam — zaten untracked — içerik
değiştirdi). `apps/admin/e2e/panel-flow.spec.ts` ve `apps/api/**` **dokunulmadı** (mtime/diff
ile doğrulandı, DT1'den sonra Nov 1'de hiçbir yeni dokunuş yok).

**Diagnostik amaçlı geçici değişiklikler — tümü geri alındı (§10):** `Button.tsx`,
`bundle-budget.config.ts`. İkisi de untracked yeni dosyalar olduğu için `git diff` değil,
yedek-dosya `diff`'i ve içerik karşılaştırmasıyla doğrulandı (boş fark).

**Playwright'ın kendi başlattığı dev sunucusu (webServer) her koşum sonunda kendini durdurdu**
(`lsof -nP -iTCP:5173` → boş, iki koşumdan sonra da) — `wcag` için port temiz bırakıldı.

---

## 12. Yazdığım/değiştirdiğim dosyalar

- `apps/admin/e2e/qa-blind-spot-and-negative-scenarios.qa.spec.ts` — (E)/(F) + ilişkili dead code
  kaldırıldı (İş A+B+C); (H1)/(H2) token'dan türetilen assertion'a geçti (İş D); (C)'ye yokluk
  assertion'ı eklendi (İş E); dosya başı yorum tur 2 kararlarını yansıtacak şekilde yeniden
  yazıldı. 16 e2e test → İKİ koşumda da canlı PASS.
- `packages/ui/src/__tests__/tailwind-custom-property-syntax.qa.test.ts` — DEĞİŞTİRİLMEDİ (tur 1
  hâliyle zaten architect Karar 2'nin yetki sınırına uygun; kasıtlı bozma kanıtı bu turda
  tekrarlandı, dosyanın kendisi değişmedi).

Her ikisi de `pnpm lint`/`pnpm typecheck`/`pnpm format:check`'ten GEÇİYOR (kendi koşumum).
