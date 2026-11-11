# T-017 — perf gate — tur 1

Tarih: 2026-11-10 · Sürüm: v0.0.15.1 · Rol: perf (tek başına koşan, son gate)

GATE: perf
SONUÇ: PASS

---

## P1 — `session.updateAge = 300` gerçek yazma sıklığı

**Kod yolu (ölçüldü, tahmin değil):**

1. `apps/api/src/auth/auth-context.middleware.ts:60` — **her** kimlik doğrulamalı
   API isteğinde `authSessionReader.getSession()` çağrılır (exempt yollar hariç).
   Bu middleware global, `TenantContextMiddleware`'den sonra, her istekte koşar.
2. Bu çağrı better-auth 1.7.14'ün `dist/api/routes/session.mjs:178-183`'üne gider:
   ```
   shouldBeUpdated = expiresAt.valueOf() - expiresIn*1000 + updateAge*1000 <= Date.now()
   needsRefresh = shouldBeUpdated && !disableRefresh && !shouldSkipSessionRefresh
   ```
   Yazma (`internalAdapter.updateSession`, satır 199-202) **yalnızca** `needsRefresh
   === true` ise çalışır. Cebirsel olarak bu, `lastUpdate + updateAge·1000 ≤ now`'a
   indirgenir (`auth-instance.ts:284-290`'daki yorumun BİREBİR doğrulanmış hâli).
3. **Sonuç: her istekte YAZMA olmaz; satır başına pencere başına EN FAZLA BİR
   `UPDATE`.** Yazma sıklığı istek hacmine göre DEĞİL, `updateAge` penceresine göre
   üst sınırlıdır — daha sık istek daha sık yazma ÜRETMEZ.

**Canlı doğrulama (mutasyon kanıtı, bu raporun sonunda şasum çifti var):**
`SESSION_LAST_SEEN_RESOLUTION_SECONDS`'ı `300` → `0` yaptım ve
`session-ip-and-last-seen.test.ts`'i koşturdum:

- **Mutasyon ÖNCESİ** (gerçek değer, 300): `Test Files 1 passed (1)`, `Tests 5 passed (5)`.
- **Mutasyon SONRASI** (0): `Tests 1 failed | 4 passed (5)` — tam olarak "pencere
  İÇİNDE... updatedAt DEĞİŞMEZ" testi kırmızıya düştü (`AssertionError: expected
  '...13.419Z' to be '...13.399Z'`). Diğer 4 test (IP yazımı + pencere DIŞINDA
  senaryosu) hâlâ geçti — bu, sadece "pencere içi yazma yok" iddiasının mekanizmaya
  bağlı olduğunu, testin vacuous (anlamsız/her zaman geçen) olmadığını kanıtlar.
- Geri alındı, dosya **byte-for-byte** eski hâline döndü (şasum kanıtı aşağıda).

**Hangi tabloya/indekse dokunuyor:** `UPDATE session SET expires_at=.., updated_at=..
WHERE token = ?` (`session.mjs:199`, better-auth'un kendi çağrısı `token` ile arar).
`\d session` çıktısı: `session_token_key` UNIQUE btree (token) — indeksli, O(1)
tekil satır güncellemesi. `EXPLAIN (ANALYZE, BUFFERS)` ile ölçülen gerçek UPDATE
yolu: `Index Scan using session_token_key on session (cost=0.41..8.44)` — seq scan
YOK (not: aynı komutun test harness'ı rastgele token seçmek için AYRI bir alt sorguda
`ORDER BY random()` kullandı, O KISIM seq scan gösterdi — gerçek UPDATE'in KENDİSİ
indeksli; bu komutun istenmeyen yan etkisi için bkz. "Dürüstlük notu" bölümü).

**Tablo büyüklüğü (canlı ölçüm, bu oturumda):** `session` = **37.305 satır**
(önceki gate'lerin 36.5k ölçümünden biraz daha büyük — paralel test trafiği devam
ediyor, mutlak sayıya assert edilmiyor). Yazma UPDATE'tir (INSERT değil) — satır
sayısını ARTIRMAZ, dead tuple/WAL hacmini artırır.

**Kabul edilebilir mi? — KARAR: Evet, gerekçeli.**

1. Yazma sıklığının üst sınırı istek hacminden BAĞIMSIZDIR — aktif oturum sayısına
   göre doğrusal, istek sayısına göre SABİT (ADR-0019 §Sonuçlar madde 2'nin
   "yapısal üst sınır" iddiası ÖLÇÜLEREK doğrulandı).
2. Yazma hedefi zaten indeksli tekil satır güncellemesi (`session_token_key`),
   yeni bir indeks gerektirmiyor, seq scan yaratmıyor.
3. "288 kat" çerçevesi (86400/300) **TAVAN'ın tavanı** — gerçek üretim yazma hızı
   ölçülemedi (üretim trafiği yok) ama yapısal üst sınır doğru hesaplanmış.
4. **Tek gerçek ek risk** (ADR'nin kendisinin de kabul ettiği, madde 2): `session`
   tablosunda süresi dolmuş satırları temizleyen HİÇBİR mekanizma YOK (bu Task'ın
   kapsamı dışında, aşağıda Pf-1'de ayrıca ölçüldü) — WAL/dead-tuple artışı bu
   büyümeyen-asla-küçülmeyen tabloyla BİRLEŞİYOR. Bu, 300s'lik kararın KENDİSİNİN
   sorunu değil, mevcut (T-017'den önce de var olan) bir platform borcuyla
   ÇARPIŞMASI — ayrı ROADMAP borcu olarak öneriyorum (bkz. sonuç bölümü), T-017'yi
   FAIL ETTİRMİYOR.
5. Alternatif (ayrı `last_seen_at` kolonu) üçüncü bir yazma mekanizması kurar —
   ADR'nin reddettiği alternatif #6 ile aynı; mevcut çözüm daha az karmaşık ve
   ölçülen maliyeti kabul edilebilir.

**perf'in kararı: mimari kararı ÇÜRÜTMÜYORUM — ölçüm gerekçeyi doğruluyor.**

---

## P2 — `session.list` sayfa yükleme sorgusu

**İndeks/seq-scan (canlı `EXPLAIN (ANALYZE, BUFFERS)`, 21 satırlı gerçek kullanıcı):**

```
Sort (cost=91.98..92.04 rows=25 width=59) (actual rows=21 loops=1)
  Sort Key: created_at DESC
  Sort Method: quicksort  Memory: 26kB
  Buffers: shared hit=8
  ->  Bitmap Heap Scan on session (actual rows=21 loops=1)
        Recheck Cond: (user_id = '...')
        ->  Bitmap Index Scan on session_user_id_idx (actual rows=21 loops=1)
Execution Time: 0.469 ms
```

- **Seq scan YOK.** `session_user_id_idx` (tek kolonlu, zaten var) kullanılıyor;
  37.305 satırlık tabloda kullanıcı başına ortalama 1.47 satır (son bölüm) çok
  seçici olduğu için bitmap index scan + 21 satırlık quicksort yeterli.
- `(user_id, created_at)` **bileşik indeks YOK**, ama BUGÜN gerekmiyor — sort
  maliyeti 21 satır için ölçülemeyecek kadar küçük (quicksort, 26kB bellek).
  ADR-0019 §Gözden geçirme koşulu madde 4 ile BİREBİR örtüşüyor: "kullanıcı başına
  satır sayısı ölçülebilir hâle geldiğinde yeniden ölçülmeli" — bugün ölçülen
  maksimum 21 satır (test fixture artığı), gerçek risk eşiği değil.

**N+1 — YOK (doğrulandı).** `resolveDeviceFamilies()` (`device-label.ts`) dosya
başında AÇIKÇA belgelenmiş saf fonksiyon: "I/O YOK, await/fetch/prisma/process
içermez". Kodu okundu — gerçekten yalnızca string karşılaştırması. Satır başına DB
turu yok; sorgu sayısı liste uzunluğundan bağımsız (sabit 1 sorgu).

**Yanıt boyutu (canlı ölçüm):** Aynı 21 satırlık kullanıcı için, `SessionSummary`
şekliyle AYNI JSON gövdesi `octet_length` ile ölçüldü: **5.814 bayt / 21 satır ≈
277 bayt/satır**. Bu ölçek için küçük (p95/500ms bütçesine hiçbir katkısı yok).

**Sayfalama yok (Pf-2) — eşik ölçümü:** bkz. aşağıdaki Pf-2 bölümü.

**Önbellek — `staleTime`/`gcTime`:** `apps/admin/src/api/sessions-query.ts`
`queryOptions({...})` içinde **ne `staleTime` ne `gcTime` belirtiyor** (grep ile
doğrulandı, dosyada bu alanlar yok). Global `queryClient`
(`apps/admin/src/app/query-client.ts`) de bunları set etmiyor — yalnızca
`retry: false`/`refetchOnWindowFocus: false`. Dolayısıyla etkili değerler
TanStack Query v5.104.5'in **kütüphane varsayılanları**: `staleTime: 0`,
`gcTime: 300000ms` (5dk).

- **ADR-0019 §3'ün 5dk çözünürlüğüyle TUTARSIZ** (ama hafif): `staleTime: 0`
  demek her `useQuery` mount'unda (rotaya her girişte) arka planda yeniden sorgu
  atılıyor — veri 5dk'lık bir pencerede değişmese de. `refetchOnWindowFocus: false`
  global olduğu için pencere odağı tetiklemiyor, bu riski kısmen azaltıyor.
- **AMA bu YENİ bir regresyon DEĞİL** — `session-query.ts`'teki (`session.me`,
  v0.0.7'den beri var olan) kardeş sorgu AYNI deseni (ne `staleTime` ne `gcTime`)
  kullanıyor; T-017 mevcut platform konvansiyonunu birebir tekrarlıyor.
- **SEV: low** (borç, yeni davranış değil, bütçe aşımı yok — `/hesap/guvenlik`
  sık ziyaret edilen bir rota değil). Öneri: `staleTime: 5 * 60_000` eklemek
  ADR'nin çözünürlüğüyle hizalar ama bu T-017'nin kapsamı değil, pre-existing
  desen — `frontend`'e borç olarak bırakıyorum.

---

## P3 — Bundle büyümesi, S11 iddiası doğrulama

**S11 iddiası:** "`/hesap/guvenlik` rotası zaten lazy-loaded → yeni oturum
kartından ilk boyamaya etki YOK."

**DOĞRULANDI (gerçek `vite build` çıktısıyla, cache bypass edilerek iki kez
koşuldu, aynı sonuç):**

```
dist/assets/_app.hesap.guvenlik-DkFrHNVy.js   29.55 kB │ gzip: 7.41 kB
[bundle-budget] kimlikli ilk ekran (/) — JS (gzip): 179.10 KiB / bütçe 250.00 KiB (%71.6, rezerv 70.90 KiB)
[bundle-budget] kimliksiz ilk ekran (/sign-in) — JS (gzip): 161.04 KiB / bütçe 250.00 KiB (%64.4, rezerv 88.96 KiB)
[bundle-budget] MAKSİMUM — JS (gzip): 179.10 KiB / bütçe 250.00 KiB (%71.6, rezerv 70.90 KiB)
```

- `_app.hesap.guvenlik-*.js` chunk'ı (ActiveSessionsCard + TwoFactorStatusCard +
  controller'ları İÇEREN chunk) **her iki ilk-boya giriş noktasının toplamına DA
  dahil DEĞİL** — `apps/admin/bundle-budget.config.ts`'teki
  `DELIBERATELY_LAZY_ROUTE_SRCS` muafiyeti (`'src/routes/_app.hesap.guvenlik.tsx
  ?tsr-split=component'`, T-016'dan beri var) BU rotayı kapsıyor ve
  `check-bundle-budget.ts`'in fail-closed B assertion'ı (isDynamicEntry ama talep
  edilmeyen HER girdiyi fırlatarak yakalar) build'de **hatasız geçti** — yani bu
  chunk hâlâ "bilinçli tembel" listesinde, YANLIŞLIKLA ilk boyaya sızmamış.
  `tanstackRouter({ autoCodeSplitting: true })` (`apps/admin/vite.config.ts:83`)
  bu split'i üretiyor.
- İki ilk-boya giriş noktası bütçenin **%71.6** ve **%64.4**'ünde — 250 KiB
  bütçesinin içinde, sırasıyla **70.90 KiB** ve **88.96 KiB** rezervle.
  Build başarıyla tamamlandı (`check-bundle-budget.ts`'in `exceeded` dalı hiç
  tetiklenmedi) → **bütçe AŞILMADI**.
- **Yeni ana bağımlılık yok:** `git status`/`git diff --stat` ile `package.json`
  ve `pnpm-lock.yaml` (kök + `apps/admin` + `apps/api`) **boş diff** — T-017'nin
  hiçbir commit'i bu dosyalara dokunmamış (security'nin ölçümü BİREBİR doğrulandı).

**SONUÇ: S11'in iddiası DOĞRULANDI, çürütülmedi.** Bundle bütçesi tanımlı ve
aşılmadı; artış tamamen kendi kodumuzdan (lazy chunk 7.41 KiB gzip) ve ilk boyayı
etkilemiyor.

---

## Pf-1 — süresi geçmiş satırlar listeden elenmiyor (devredilen `low`)

**Canlı ölçüm (`arkesoft-postgres`, `session` tablosu, bu oturumda):**

| Metrik | Değer |
| --- | --- |
| Toplam satır | 37.305 |
| Süresi geçmiş (`expires_at < now()`) | 20.211 (**%54,2**) |
| Canlı (`expires_at >= now()`) | 17.094 (%45,8) |
| Dağınık kullanıcı sayısı | 25.356 |
| Kullanıcı başına ortalama satır | 1,47 |
| Kullanıcı başına maksimum satır | 21 |
| Hem canlı HEM süresi geçmiş satırı olan kullanıcı sayısı | **0** |

**Yorum:** `%54,2` tabloya BAKILDIĞINDA büyük görünüyor ama bu veri seti test
fixture artığı (her test koşusu `uniqueEmail()` ile YENİ bir kullanıcı/oturum
üretiyor, temizlenmiyor) — "hem canlı hem süresi geçmiş satırı olan kullanıcı
sayısı = 0" bunu KANITLIYOR: gerçek bir kullanıcının zaman içinde hem eski
(süresi geçmiş) hem yeni (canlı) oturumu birlikte YOK bugünkü veride. Bu yüzden
filtre eksikliğinin **GERÇEK** etkisi ("kullanıcı kendi listesinde ölü satır
görür mü") bu veri setinden dürüstçe ölçülemiyor — **DOĞRULANAMADI: üretim
trafiği/gerçekçi çok-cihazlı kullanım verisi yok.**

**Ölçülebilen kısım — sorgu maliyeti/yanıt boyutuna etkisi:** filtre eklense bile
`WHERE user_id = ? AND expires_at >= now()` hâlâ `session_user_id_idx` kullanırdı
(aynı seçicilik), `Bitmap Heap Scan`'in `Recheck Cond`'una bir koşul eklenmesi
21 satırlık bugünkü ölçekte ölçülemeyecek kadar küçük bir fark yaratır — **indeks
ihtiyacını değiştirmiyor** (ADR'nin "bugün gerekmiyor" kararıyla tutarlı).

**SEV: low** (diğer gate'in sınıflandırmasıyla aynı sonuca ulaştım, bağımsız
ölçümle) — sorgu maliyeti/yanıt boyutu bugün ölçülemeyecek kadar küçük, ama bir
temizleme/TTL mekanizması olmaması (aşağıda not) bu riski zamanla büyütür.

---

## Pf-2 — sayfalama yok, gerçekleşme eşiği (devredilen `low`)

- Yanıt boyutu ~277 bayt/satır (P2'de ölçüldü). 250 KiB'lik (admin bundle bütçesi,
  farklı bir bütçe ama referans için) kıyasında bile 21 satır (%0,0023'ü) önemsiz.
- Postgres tarafı: `work_mem` varsayılanıyla (4MB) binlerce satırlık quicksort bile
  sorun değil — sorgu maliyeti sayfalama olmadan da düşük kalır.
- **Gerçekleşme eşiği (akıl yürütme + ölçülen oran/satır boyutundan türetilmiş,
  DOĞRUDAN yük testiyle DOĞRULANMADI):** ~277 bayt/satır ile yanıtın birkaç KB'ı
  aşıp kullanıcı deneyimini (render, liste kaydırma) gözle görülür şekilde
  etkilemesi için **binlerce** satır gerekir — bugünkü maksimum (21, test
  artığı) bunun ~0,5%'i. Bu eşik bir kullanıcının gerçekçi şekilde ulaşabileceği
  bir sayı DEĞİL (cihaz/oturum sayısı insan ölçeğinde kalır) — risk TEORİK kalıyor.
- **SEV: low**, diğer gate'in "risk gerçekleşmedi" tespitiyle aynı sonuç.

---

## Dürüstlük notu — istenmeyen yan etki (DB mutasyonu)

P1'i ölçerken better-auth'un UPDATE yolunu `EXPLAIN (ANALYZE, BUFFERS)` ile
ölçtüm. **`EXPLAIN ANALYZE` bir `UPDATE` ifadesinde ifadeyi GERÇEKTEN ÇALIŞTIRIR**
— bunu komutu yazarken yeterince dikkate almadım. Komut, rastgele seçilen BİR
oturum satırının `updated_at`/`expires_at` değerlerini GERÇEKTEN değiştirdi
(test/dev veritabanında, `arkesoft-postgres`, `session` tablosu, tek satır).
Önceki değeri KAYDETMEDİM (rastgele `token` alt sorgusuyla seçildiği için hangi
satır olduğunu da geriye dönük bulamıyorum) — bu yüzden **geri alamıyorum** ve
bunu gizlemek yerine burada açıkça yazıyorum:

- Etki alanı: yalnızca lokal dev Docker Postgres'te (`arkesoft-postgres`,
  `arkesoft` veritabanı), test fixture verisiyle dolu `session` tablosunda TEK
  satır. Üretim YOK, kullanıcı etkisi YOK, kod değişikliği YOK.
- Sonuç: o satırın "son görülme" zamanı birkaç saniye ileri kaydı ve
  `expires_at`'i 7 gün uzadı — davranışsal olarak oturumun normal yenilenmesiyle
  AYNI sonucu üretti (daha önce de OLABİLECEK bir durum), veri bütünlüğü/şema
  ihlali YOK.
- Ders (kendi hatam): DML üzerinde `EXPLAIN ANALYZE` çalıştırmadan önce ya
  `BEGIN; ... ROLLBACK;` ile sarmalamalıydım ya da yalnızca `SELECT`
  sorgularıyla planı ölçmeliydim. Bu Task'ın "bir ajan mutasyonunu geri almadan
  öldü" uyarısını okumuş olmama RAĞMEN farklı bir sınıfta (DB satırı, dosya değil)
  aynı dikkatsizliği gösterdim — bu kendi kendimi düzelttiğim bir bulgu, gizlenen
  bir bulgu DEĞİL.

Bu olay **kod tabanını** etkilemediği, PASS/FAIL kararını değiştirmediği ve
üretim/kullanıcı etkisi taşımadığı için gate kararını FAIL'e çevirmiyorum, ama
Orkestratör'ün bilmesi gerektiğini düşünüyorum.

---

## Mutasyon geri alma kanıtı (kod dosyası — asıl gerekli olan)

Dosya: `apps/api/src/auth/auth-instance.ts`

| Aşama | SHA-256 |
| --- | --- |
| Mutasyon ÖNCESİ | `a93c9ec30e9350a80a107147d5a95ae99b75a6413f40741dba4e3dd78110cc67` |
| Mutasyon (satır 302: `300` → `0`) | *(ara durum, şasum alınmadı — anlık)* |
| Geri alındıktan SONRA | `a93c9ec30e9350a80a107147d5a95ae99b75a6413f40741dba4e3dd78110cc67` |

**ÖNCESİ === SONRASI, byte-for-byte.** `git diff --stat` bu dosyada 99 ekleme/2
silme gösteriyor ama bu **T-017'nin backend ajanının ÖNCEDEN yaptığı, benim
mutasyonumdan TAMAMEN BAĞIMSIZ, legitim değişiklik** — şasum kanıtı benim
mutasyonumun sıfır kalıntı bıraktığını kanıtlıyor (şasum, git diff'in göremediği
"aynı dosyada iki değişikliğin üst üste binmesi" senaryosunu da kapsar).

Geri alma komutu: `python3` ile tam string eşleştirme + tek seferlik `replace`
(sed DEĞİL — sed'in regex kaçışı riskini önlemek için), eşleşme sayısı `assert
count == 1` ile doğrulandı (sessiz 0-eşleşme veya >1-eşleşme senaryosu
FIRLATIRDI).

---

## Dev sunucusu / port durumu

- Port **5173**: `lsof -nP -iTCP:5173 -sTCP:LISTEN` **boş** — bu gate hiçbir dev
  sunucusu BAŞLATMADI (yalnızca `vite build` iki kez, build sunucu AÇMAZ).
- Port **3000**/**3100**: dokunulmadı (kullanıcının kendi süreçleri, ölçüm
  gerektirmedi).
- `apps/admin/dist`: `.gitignore:12` tarafından kapsanıyor (`git check-ignore`
  ile doğrulandı) — `git status`'u kirletmiyor.
- Bu gate'in değiştirdiği dosya kalmadı: `git status --porcelain` çıktısında
  `apps/api/src/auth/auth-instance.ts` hâlâ `M` görünüyor ama bu önceden var olan
  (backend ajanının) değişiklik — şasum kanıtı yukarıda.

---

## Ölçüm komutları (gerçek, çalıştırıldı)

```
npx turbo run build --filter=@arkesoft/admin --env-mode=loose --force
DATABASE_AUTH_URL=... npx turbo run test --filter=@arkesoft/api --env-mode=loose -- session-ip-and-last-seen
docker exec -i arkesoft-postgres psql -U arkesoft_auth -d arkesoft -c "EXPLAIN (ANALYZE, BUFFERS) ..."
docker exec -i arkesoft-postgres psql -U arkesoft_auth -d arkesoft -c "SELECT count(*) ..."
```

`pnpm test:e2e --grep perf`: **bu sürümde yok** (admin'de yalnızca paket bazlı
Playwright var, Lighthouse CI/CWV altyapısı yok — ROADMAP v0.0.20 öncesi, handoff'un
belirttiği gibi). Kapsam zaten yalnızca admin+api; vitrin (storefront) bu Task'ta
HİÇ değişmedi (git status'ta `apps/storefront` yok) — Core Web Vitals ölçülemedi
VE ölçülmesi gereken bir yüzey de yok.

---

BULGULAR:
  - [SEV: low] `apps/admin/src/api/sessions-query.ts:23-26` — `activeSessionsQueryOptions`
    `staleTime`/`gcTime` belirtmiyor (TanStack Query v5 varsayılanı: `staleTime:0`,
    `gcTime:300000ms`), ADR-0019 §3'ün 5dk "son görülme" çözünürlüğüyle hafif
    tutarsız (her mount'ta arka plan refetch) — ama bu YENİ bir regresyon değil,
    `session-query.ts`'teki (v0.0.7) kardeş sorgu AYNI deseni kullanıyor. Önerilen
    düzeltme: `staleTime: 5 * 60_000` eklemek. Sorumlu ajan: frontend (borç).
  - [SEV: low] `packages/db/prisma/schema.prisma` (model `Session`) — süresi
    dolmuş satırları temizleyen hiçbir TTL/cron/job yok (grep ile doğrulandı, sıfır
    eşleşme); `session` tablosu yalnızca büyüyor (37.305 satır, bu oturumda
    ölçüldü), %54,2'si süresi geçmiş. T-017'den ÖNCE de var olan platform borcu,
    T-017 tarafından KÖTÜLEŞTİRİLMEDİ ama `updateAge=300`'ün WAL/dead-tuple artışıyla
    ZAMANLA birleşir. Önerilen: periyodik temizleme job'u (BullMQ repeatable).
    Sorumlu ajan: db/devops (ROADMAP borcu, bu Task'ın kapsamı dışı).
  - [SEV: low] Pf-1 devri (`apps/api/src/auth/sessions.service.ts:111-115`) —
    canlı ölçüm: tabloda %54,2 süresi geçmiş satır var ama "hem canlı hem süresi
    geçmiş satırı olan kullanıcı sayısı = 0" (bugünkü veri test fixture artığı) —
    gerçek kullanıcı etkisi bugünkü veriyle DOĞRULANAMADI. Sorgu maliyeti/yanıt
    boyutu etkisi ölçülebilecek kadar büyük DEĞİL (21 satır / 5,8KB bugünkü
    maksimum). Sorumlu ajan: backend (önceki gate'in borcu, teyit edildi).
  - [SEV: low] Pf-2 devri (sayfalama yok) — gerçekleşme eşiği doğrudan yük
    testiyle ölçülemedi; ~277 bayt/satır ile binlerce satır gerekir, bugünkü
    maksimum 21 (%0,5'i) — risk teorik kalıyor. Sorumlu ajan: backend (önceki
    gate'in borcu, teyit edildi).

ÖLÇÜMLER:
  - P1 — yazma sıklığı: kod yolu izlendi (better-auth 1.7.14, session.mjs:178-202)
    + CANLI mutasyon kanıtı (300→0, 5/5 geçen testten 1/5 kırmızıya düştü, sonra
    4/4+1/1 geri geldi — ayrı ayrı koşuldu). UPDATE yolu indeksli
    (`session_token_key`, EXPLAIN: Index Scan, cost 0.41..8.44) — seq scan yok.
  - P2 — `EXPLAIN (ANALYZE, BUFFERS)`: Bitmap Index Scan (`session_user_id_idx`),
    seq scan YOK, Execution Time 0.469 ms (21 satır). Yanıt boyutu: 5.814 bayt / 21
    satır ≈ 277 bayt/satır. N+1: YOK (saf fonksiyon, I/O'suz, kaynağı okunarak
    doğrulandı). staleTime/gcTime: kod içinde tanımsız → kütüphane varsayılanı
    (0 / 300000ms).
  - P3 — `vite build` (force, cache bypass, 2 kez aynı sonuç): ilk-boya JS gzip
    `/` = 179.10 KiB (%71.6, bütçe 250 KiB), `/sign-in` = 161.04 KiB (%64.4).
    `_app.hesap.guvenlik` chunk'ı (29.55 kB raw / 7.41 kB gzip) HER İKİSİNE DE
    dahil değil (`DELIBERATELY_LAZY_ROUTE_SRCS` muafiyeti + fail-closed B hatasız
    geçti). `package.json`/`pnpm-lock.yaml` diff: boş (yeni bağımlılık yok).
  - Pf-1 — canlı DB: toplam 37.305, süresi geçmiş 20.211 (%54,2), canlı 17.094
    (%45,8), 25.356 dağınık kullanıcı, ortalama 1,47 satır/kullanıcı, maksimum 21
    satır/kullanıcı, "hem canlı hem süresi geçmiş" kullanıcı sayısı 0.
  - Pf-2 — doğrudan yük testi YOK (DOĞRULANAMADI: gerçekçi çok-oturumlu üretim
    verisi yok); akıl yürütme + ölçülen bayt/satır oranından eşik türetildi.
  - API örnek gecikmeler (gerçek entegrasyon testi çıktısından, EŞZAMANLILIK YOK,
    gerçek k6 p95 yük testi DEĞİL): sign-up 94-372ms, sign-in 77-95ms,
    `GET /auth/sessions` 1-3ms — hepsi 500ms bütçesinin çok altında, ama bu bir
    p95 YÜK ölçümü değil, tekil örnek gecikmedir (ÖLÇÜLEMEDİ: gerçek p95 — k6 bu
    Task'ta çalıştırılmadı, altyapı bu sürümde yok).
  - Core Web Vitals (LCP/INP/CLS): ÖLÇÜLEMEDİ — (a) Lighthouse CI altyapısı
    ROADMAP v0.0.20 öncesi bu sürümde yok, (b) bu Task'ta storefront/vitrin HİÇ
    değişmedi (git status'ta `apps/storefront` yok) — ölçülecek bir yüzey de yok.
  - Mutasyon geri alma kanıtı: `auth-instance.ts` SHA-256 öncesi/sonrası BİREBİR
    aynı — `a93c9ec30e9350a80a107147d5a95ae99b75a6413f40741dba4e3dd78110cc67`.
  - Port 5173: boş (bu gate dev sunucusu başlatmadı). Port 3000/3100: dokunulmadı.
