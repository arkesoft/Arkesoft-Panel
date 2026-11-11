# T-017 — security gate, tur 2 (**DAR kapsam**)

- **Tarih:** 2026-11-10
- **Sürüm:** ROADMAP v0.0.15.1 (aktif oturum listesi + step-up auth)
- **Kapsam:** DAR — tur 1'de PASS verildi, yüzey değişti. WORKFLOW [7]: _"yalnızca kendi
  bulgularının kapanışı, yeni tarama YOK"_. Yeni OWASP taraması, yeni bağımlılık taraması
  ve CLAUDE.md §7'nin tam yeniden değerlendirmesi **yapılmadı** (tur 1'de yapıldı).
- **`pnpm audit` TEKRAR KOŞTURULMADI** — `package.json`/`pnpm-lock.yaml` FIX turunda
  değişmedi (kanıt: handoff ölçümü + `find -newermt` çıktısında yok), tur 1 sonucu aynen
  geçerli.
- **Koşturulmayanlar:** Playwright, `apps/admin` dev sunucusu, `turbo run build`.

```
GATE: security
SONUÇ: PASS
BULGULAR:
  - [SEV: low] apps/api/src/auth/auth-instance.ts (+ apps/api/src/__tests__/rate-limit.test.ts, apps/api/src/__tests__/session-revoke-idempotency.test.ts) — FIX turu 1'in BİLDİRİLEN yüzeyi EKSİK: handoff `apps/api` için 7 dosya bildirdi, `find -newermt '2026-11-10T20:05:00'` 10 dosya buldu. `auth-instance.ts` (ÜRETİM dosyası, AC9 birincil savunmasının ve `session.create.before` IP yazım kancasının sahibi) mtime 20:45:20 ile FIX penceresinin İÇİNDE ama bildirimde YOK. DAR kapsamlı bir gate, bildirilen yüzeye güvenerek karar verir — bildirim eksikse bu dosyadaki bir sızıntı gate'in görüş alanı dışında kalırdı (handoff'un kendi uyardığı sınıf). Saldırı senaryosu ÖLÇÜLMEDİ: dosyanın güvenlikle ilgili yüzeyini elle denetledim ve değişmezleri SAĞLAM buldum (aşağıda, İş ① ek ölçüm) — bu yüzden `low`, davranış kusuru DEĞİL, izlenebilirlik kusuru. ⚠ FIX turunun İÇERİK düzeyinde diff'i DOĞRULANAMADI (FIX öncesi anlık görüntü yok, dosya HEAD'e göre zaten T-017 bütünüyle değişik). — Düzeltme: Orkestratör `backend`'e 20:45'te `auth-instance.ts`'te ne değiştiğini sorsun; FIX turu bildirimleri bundan sonra `find -newermt` çıktısıyla karşılaştırılarak üretilsin. — Orkestratör / backend
ÖLÇÜMLER: incelenen dosya 18 · koşturulan test dosyası 4 (17/17 ✓, tek temiz koşum) · pnpm audit TEKRAR KOŞTURULMADI (yeni bağımlılık yok; tur 1: critical 0 / high 1 pre-existing multer / moderate 1 pre-existing minimatch / low 0) · tenant izolasyon listesinden karşılanmayan madde: YOK (0) — `session` platform seviyesi tablo, 10 madde UYGULANAMAZ (tur 1 kararı, bu turda değişmedi) · yakalanan log satırı 85 (6 başarılı giriş, 25 tamamlanan istek) · log akışında dotted-quad 0, `ipAddress` jetonu 0, IPv6 loopback 0
```

---

## İş ① — 9. denetim noktasının (tele sızma disiplini) YENİ YERİ

Disiplin `sessions.service.ts`'in `rows.map` gövdesinden **yeni saf fonksiyona** taşındı:
`apps/api/src/auth/session-summary.mapper.ts` → `toSessionSummary(row, currentSessionId)`.

### Soru 1 — Ham `userAgent` hâlâ tele çıkmıyor mu? → **ÇIKMIYOR**

Nasıl ölçtüm:

1. **Yayma taraması.** `grep -nE '\.\.\.'` → mapper + servis + adaptörde **5 eşleşme, hepsi
   YORUM İÇİNDE**; kodda **tek bir yayma yok**. `toSessionSummary` 8 alanı adıyla tek tek
   seçiyor (`session-summary.mapper.ts:60-71`), `toActiveSessionWire` de 8 alanı tek tek
   (`session-list-read.port.adapter.ts:49-58`).
2. **Jeton taraması.** `userAgent` kod (test dışı) eşleşmeleri: `sessions.service.ts:100`
   (`select`), `session-summary.mapper.ts:45` (**girdi** satır tipi), `:58`
   (`resolveDeviceFamilies(row.userAgent)` — **tek meşru kullanım**), `device-label.ts`
   (parametre). Dönüşte **alan olarak yok**; `activeSessionWireSchema`'da da yok.
3. `{...row}` yayması **geri gelmedi** (madde 1).

### Soru 2 — `'' → null` sentinel eşlemesi hâlâ TEK noktada mı? → **TEK NOKTADA**

`grep -rn "=== ''"` → üretim kodunda **tek eşleşme**:
`session-summary.mapper.ts:67`. Adaptörde (`session-list-read.port.adapter.ts:54`)
`ipAddress: summary.ipAddress` — **koşul/eşleme yok, doğrudan atama**; çift dönüşüm
**yok**. Adaptör dosyasının FIX turunda değişmediği teyit edildi (mtime listesinde yok,
yalnızca onun **testi** değişti).

### Soru 3 — `SessionSummary` tipinin taşınması bir sır alanını yüzeye çıkardı mı? → **ÇIKARMADI**

- Tip `sessions.service.ts:82-92`'de **kaldı**; mapper onu `import type` ile alıyor
  (`session-summary.mapper.ts:32`) → çalışma zamanında erir, döngüsel bağımlılık yok.
- `SessionSummary` alanları: `id, createdAt, updatedAt, expiresAt, ipAddress,
  browserFamily, osFamily, isCurrent` — `token`, hash, `userAgent`, `userId` **yok**.
- **Ek ölçüm (ayrıcalık genişlemesi):** mapper `src/auth/**` içinde, yani R-1 katman 2'nin
  tam DB istemci yüzeyini ithal edebildiği **ayrıcalıklı** bölgede. İthalleri ölçtüm — üç
  satır: `@arkesoft/trpc` (tip), `device-label.js`, `SessionSummary` (tip). **Prisma/DB
  yüzeyi ithali YOK** → yeni dosya ayrıcalıklı bölgeyi genişletmiyor.
- Gözlem (bulgu değil): mapper `SessionSummaryRow`'u **export** ediyor ve bu tip
  `userAgent: string | null` içeriyor. Değer sızıntısı değil, tip yüzeyi; tüketicileri
  ölçtüm → yalnızca `sessions.service.ts` + kendi testi.

### Soru 4 — 5. vaka ("ham `userAgent` sızmaz") GERÇEKTEN ölçüyor mu? → **ÖLÇÜYOR, totoloji DEĞİL**

İki aşamalı kanıt (ikisi de **scratchpad'de**, proje dosyalarına dokunulmadı):

1. **Derleyici bu regresyonu YAKALAMIYOR.** `{...row}` yaymalı bir varyantı, bildirilmiş
   `SessionSummary` dönüş tipiyle `tsc --noEmit --strict` ile derledim → **TSC-EXIT: 0**.
   TypeScript'in fazla-özellik kontrolü yayma üzerinden geçmiyor. Yani bu sızıntının **tek
   mekanik bekçisi testin kendisi**.
2. **Testin iki assert'i mutanta KIRMIZI veriyor.** Aynı mutantı, testin 5. vakasının iki
   assert'iyle koşturdum:
   - `not.toHaveProperty('userAgent')` → **KIRMIZI** (alan sızdı)
   - `JSON.stringify(summary)).not.toContain('Mozilla')` → **KIRMIZI**
   - mutant çıktısı: `…,"userAgent":"Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0",…`

   Sızıntı **erişilebilir**: `SESSION_SUMMARY_SELECT` (`sessions.service.ts:100`)
   `userAgent`'ı gerçekten okuyor, yani satır çalışma zamanında ham dizeyi **taşıyor**.

`'' → null` vakası 1 için mutasyon iddiası **analitik olarak kesin** (`expect('')
.toBeNull()` kırmızı verir) — ayrı koşum yapmadım, bunu ölçüm olarak saymıyorum.

### Soru 5 — AC9 probe'u zayıflatıyor mu? + AC9 BAĞIMSIZ ÖLÇÜMÜN TEKRARI

**Probe PII taşımıyor ve AC9'u zayıflatmıyor.** `session-ip-not-logged.test.ts:153-154`:
probe `s8b-ac9-positive-pin-<rastgele 8 hex>` + `{ probe: 'ac9-positive-pin' }` — IP, e-posta,
parola, token **yok**. Konumu da doğru: **iki negatif assert'ten ÖNCE** koşuyor (`:199`),
yani `LOG_LEVEL=error|silent` durumunda negatif assert'ler artık **vacuously yeşil olamaz**
— bu AC9'u **güçlendiriyor**.

**Bağımsız AC9 ölçümünü TEKRARLADIM** (test dosyası değiştiği için), ve bilerek **değişmemiş**
bir test dosyası üzerinden: `session-ip-and-last-seen.test.ts` (mtime 11-10 öncesi, FIX
listesinde yok) `createTestApp()`'i **bellek stream'i VERMEDEN** kurar → pino `stdout`'a
yazar, `.env`'de `LOG_LEVEL=debug` → **her seviye akar**; test `X-Forwarded-For:
203.0.113.77` ile tam giriş akışı koşturur ve satırın IP'sini DB'de assert eder.

Dört test dosyasının tek temiz koşumunun **tüm stdout'unu** yakalayıp ölçtüm:

| Ölçüm                                              | Sonuç                                                                                                                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yakalanan satır / JSON log satırı                  | 97 / **85**                                                                                                                                                       |
| **POZİTİF PİN** (akış vacuous değil)               | `giriş başarılı` **6**, `istek tamamlandı` **25**                                                                                                                  |
| **Herhangi bir dotted-quad** `([0-9]{1,3}\.){3}…`  | **0**                                                                                                                                                             |
| `ipAddress` jetonu                                 | **0**                                                                                                                                                            |
| IPv6 loopback (`::1`, `::ffff`)                    | **0**                                                                                                                                                            |
| Bilinen test IP'leri (`203.0.113`, `198.51.100`, `127.0.0.1`) | **0**                                                                                                                                                  |
| Log anahtarlarının **tam envanteri**               | `context, durationMs, emailMasked, handler, level, messageKey, method, msg, queueCount, requestId, service, sessionId, statusCode, time, userId, version` — `ip`/`ipAddress`/`userAgent` **YOK** |

Statik teyit (birincil savunma): istek child logger'ı **yalnızca `requestId`** bağlıyor
(`request-context.middleware.ts:74`); hiçbir logger çağrı yerine ip/adres geçmiyor
(`grep` → tek eşleşme `zod-validation.pipe.ts:55`, o da "p**ip**e" yüzünden; gövdesi
`fieldKey/issueCode/zodMessage`); `auth-instance.ts`'in logger çağrıları
`userId`/`sessionId` taşıyor, IP taşımıyor.

**Kendi ölçümümün ürettiği ek doğrulama:** loglanan `sessionId` bir **taşıyıcı token
DEĞİL**. Salt-okuma sorgusu: `SELECT count(*) FROM session WHERE id = token` → **0**, ve
`count(DISTINCT token) = count(DISTINCT id)` → `t`. Bulgu yok.

---

## İş ② — Tur 1'in beş `low`'u: kötüleşme var mı?

`find -newermt '2026-11-10T20:05:00'` + kesin `mtime` ölçümü:

| #      | Dosya                                          | mtime                | Karar                                                             |
| ------ | ---------------------------------------------- | -------------------- | ----------------------------------------------------------------- |
| **F1** | `auth/rate-limit/rate-limit.policy.ts:152` + `pathOf :137-142` | 11-10 **19:46:09** (FIX sınırının **ÖNCESİ**) | **DEĞİŞMEDİ** → kötüleşme yok. `step-up/sensitive-operations.ts` de değişmedi (11-09 19:22). ⭐ `solid` bağımsız olarak `pathOf`'un **kaldırılması** yönünde görüş verdi → borç kaydına **birleşik gerekçe** geçer. |
| **F2** | `rate-limit.policy.ts:258-275` (step-up bütçesi rota başına) | aynı dosya, aynı mtime | **DEĞİŞMEDİ** → kötüleşme yok. Bütçe hâlâ rota başına (6 uç × 5/15dk). |
| **F3** | `__tests__/rate-limit.test.ts` (429 uçtan uca eksik) | 11-10 20:08:36       | **KAPANDI** (aşağıda)                                              |
| **F4** | `trpc-http.test.ts` (tRPC kullanıcı-çapraz pini eksik) | FIX penceresinin ÖNCESİ | **KAPANDI** (aşağıda)                                              |
| **F5** | `auth/rate-limit/client-ip.ts:83` (IP biçim doğrulaması yok) | 11-**04** 12:27:03   | **DEĞİŞMEDİ** → kötüleşme yok.                                     |

Ek kötüleşme taramaları (hepsi temiz):

- `test.skip/only/todo`, `it.fails` → T-017'nin **hiçbir** test dizininde **0** eşleşme
  (api, trpc, db, admin).
- `where: {}` / filtresiz `findMany|updateMany|deleteMany` → `apps/api/src`,
  `packages/trpc/src`, `apps/admin/src`'te **0** eşleşme.
- XSS yüzeyi (`dangerouslySetInnerHTML|innerHTML|eval(|new Function`) →
  `apps/admin/src/features` + `components`'te **0** eşleşme (IP'yi basan
  `ActiveSessionsCard` dahil).
- Sır taraması, FIX turunda değişen 9 kaynak dosya üzerinde
  (`password|secret|api_key|token|BEGIN … PRIVATE KEY`): tüm eşleşmeler **meşru geçiş
  yolu** — `step-up.service.ts:79` (`body: { password }` → `verifyPassword`),
  `sessions.service.ts:146/155` (`token` **sunucu tarafında** okunur, sahiplik
  doğrulandıktan sonra `revokeSession`'a verilir, istemciye **asla** dönmez),
  `TwoFactorStatusCard.tsx` (form durumu). **Sabit yazılmış sır yok, loglanan sır yok.**
  `InvalidPasswordError`'un `context`'i **bilerek `{}`** — denenen parolayı da kullanıcıyı
  da taşımıyor.
- `MESSAGES.common.close = 'Kapat'` (`messages.ts:335`) — düz arayüz etiketi, **sır/PII
  yok**. ✓
- `packages/db/.../session-metadata-columns.test.ts` — gevşetme **yok**; `②` maddesi
  `session`'da `tenant_id` **olmadığını** hâlâ assert ediyor (tur 1'in "platform seviyesi →
  §7'nin 10 maddesi UYGULANAMAZ" dayanağı **ayakta**), `③` `user_id` indeksini,
  `④`/`⑤` vacuity bekçili mekanizma pinlerini koruyor.

### F3 / F4 kapanış kararı: **İKİSİ DE KAPANDI**

- **F3 KAPANDI.** `rate-limit.test.ts:1565` ve `:1632` — **iki** yeni `describe`:
  `POST /auth/sessions/revoke` ve `POST /auth/sessions/revoke-all`, her biri "5 yanlış
  parola → **tam** `[400,400,400,400,400]`, 6.sı **429** + `Retry-After` tanımlı +
  gövde `code === 'RATE_LIMIT_EXCEEDED'`" (`:1613-1626`). İstediğimden **fazlası**:
  ikinci uç ve ayrı kova da pinlendi. Vacuity riski yok — ara denemeler `toBe(400)` ile
  **tam** pinli, yani erken 429 sahte yeşil üretemez.
- **F4 KAPANDI.** `trpc-http.test.ts:235-266` — iki kullanıcılı `session.list` turu,
  **çift yönlü** kesişim-boş assert'i (`:261-262`) **ve** vacuity bekçisi:
  `expect(resultA.length).toBeGreaterThanOrEqual(1)` + aynısı B için (`:253-254`), üstüne
  `isCurrent` sayısı **tam 1** (`:266`). İki boş liste "kesişim yok" diye yeşil
  **olamaz**. Kapsamsız bir `findMany` 37k+ satır döndürüp bu pini kırardı → yük taşıyor.

---

## Değiştirmediğimin kanıtı

`git status --porcelain` çıktısı turun başındaki anlık görüntüyle **birebir aynı**; benim
yazdığım tek dosya bu rapor (`.claude/workflow/reviews/T-017-security-tur2-dar.md`).
Mutasyon denemelerinin tamamı oturum scratchpad'inde yaşadı; `prettier --write` /
`eslint --fix` / `prisma format` **koşturulmadı**. Yıkıcı DB komutu koşturulmadı,
`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` **üretilmedi**; Redis'e `FLUSHALL`/`FLUSHDB`/
`CONFIG SET` **gönderilmedi**; tek DB erişimi iki salt-okuma `count(*)` sorgusu
(`arkesoft-postgres`, 5432, isimle seçildi).
