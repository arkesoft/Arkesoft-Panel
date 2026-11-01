# T-008 — security gate, tur 1

- **Tarih:** 2026-11-01
- **Sürüm:** ROADMAP v0.0.7 (platform 0.0.6 → 0.0.7), `minor`
- **Kapsam:** `apps/api/src/{http/*, tenancy/tenant-exempt-paths.ts, trpc/trpc.controller.ts, auth/auth.controller.ts, app.module.ts}` · `apps/admin/**` · `packages/ui/**` · `packages/config/eslint/react.js` · `.env.example` · `pnpm-workspace.yaml` · `pnpm-lock.yaml`
- **Referanslar:** ADR-0011 taslağı (madde 1–4), ADR-0009 madde 7/8, ADR-0010 madde 3/4 + Ek, CLAUDE.md §7 (14 madde), T-007 security tur1/tur2 (taban çizgisi)

```
GATE: security
SONUÇ: PASS
BULGULAR:
  - [SEV: low] pnpm-workspace.yaml:270 + pnpm-lock.yaml — `pnpm audit` taban çizgisi aştı: v0.0.6 = `kritik 0 · high 1 · orta 0 · düşük 0`, şimdi `kritik 0 · high 1 · orta 1 · düşük 0`. Yeni orta: `minimatch@3.1.5` (GHSA-g3hv-75wg-m249, globparts amplification DoS, yama >=11.0.1). ATFEDİLME ÖLÇÜLDÜ, iddiaya dayanmıyor: `git diff pnpm-lock.yaml | grep minimatch` → `+ minimatch@3.1.5` (yani bu sürümde EKLENDİ) ve `pnpm why minimatch` (packages/config içinde) → `minimatch@3.1.5 └─┬ eslint-plugin-jsx-a11y@6.10.2 └── @arkesoft/config (devDependencies)` → zinciri bu sürümün eklediği eslint eklentisi açıyor. Saldırı senaryosu ZAYIF ve bu yüzden `low`: ReDoS/amplification için saldırganın KONTROL ETTİĞİ bir glob deseninin minimatch'e verilmesi gerekir; bu repoda minimatch'i besleyen tek girdi bizim kendi ESLint/Prettier yapılandırmalarımızdır (operatör kontrolünde) ve paket YALNIZCA devDependency — `apps/admin/dist` taramasında minimatch izi 0, üretim çalışma zamanına ULAŞMIYOR. Önerilen düzeltme: ROADMAP teknik borcuna satır (vade: `eslint-plugin-jsx-a11y`'nin ESLint 10 destekli bir sürümü veya bakımlı bir alternatifi geldiğinde); bu sürümde aksiyon gerekmiyor. — devops
  - [SEV: low] pnpm-workspace.yaml:283-292 — `eslint-plugin-jsx-a11y@6.10.2` 2024-10-26'dan beri yayın almamış (iki yıl) ve `peerDependencies.eslint` `^3...^9` ile katalog `eslint@^10.13.0`'ı KAPSAMIYOR. S1 bunu dürüstçe kaydetmiş; ben FONKSİYONEL boşluk olmadığını ÖLÇTÜM: kasıtlı ihlal probu (`<img src="/a.png" />`) → `jsx-a11y/alt-text` kuralı GERÇEKTEN tetikledi (eslint çıktısı ÖLÇÜMLER'de) ve `flatConfigs.recommended.languageOptions` içeriği yalnızca `{parserOptions:{ecmaFeatures:{jsx:true}}}` — `parser`'ı EZMİYOR, dolayısıyla typescript-eslint'in tip-bilgili kuralları (ve onların taşıdığı güvenlik kısıtları) KAYBOLMUYOR. Risk bugün değil GELECEKTE: bakımsız bir eklenti lint zincirinde bir tedarik zinciri yüzeyidir ve bir sonraki ESLint ana sürümünde SESSİZCE devre dışı kalabilir (o anda `jsx-a11y` kapsamı kaybolur, `pnpm lint` yeşil kalır). Önerilen düzeltme: borç satırı + bir sonraki ESLint yükseltmesinde eklentinin GERÇEKTEN kural tetiklediğini mekanik olarak doğrulayan bir prob testi. — devops
  - [SEV: low] apps/admin/vite.config.ts:76 — `server.host: true` dev sunucusunu TÜM ağ arayüzlerine bağlıyor ve Vite'ın `allowedHosts` kontrolü IP-literal `Host` değerlerini GEÇİRİYOR. ÖLÇTÜM (canlı dev sunucusu, curl): `Host: panel.arkesoft.localhost:5173` → 200 · `Host: evil.example.com` → **403 "Blocked request"** (fail-closed, A-A1 DOĞRULANDI) · `Host: 127.0.0.1:5173` → **200**. Saldırı senaryosu: geliştirici güvenilmeyen bir ağda (kafe/ortak çalışma alanı) `pnpm dev` koşarken aynı ağdaki herhangi biri `http://<gelistirici-ip>:5173/` ile panel SPA'sını yükleyebilir. SOMUT KAZANÇ YOK ve bu yüzden `low`: bundle'da sır 0 (ölçüldü), oturum olmadan hiçbir veri gelmiyor (AC3 yapısal), ve `API_HOST=0.0.0.0` ZATEN yürürlükte (v0.0.4 kararı, bu sürüme atfedilmez) → vekil API'ye YENİ bir erişim yolu AÇMIYOR; `changeOrigin: false` ile `Host`/`Origin` forward edilse bile saldırganın oturum çerezi yok ve aynı başlıkları doğrudan `:3000`'e de gönderebilirdi. Ayrıca `host: true` GEREKSİZ görünüyor: `panel.arkesoft.localhost` 127.0.0.1'e çözülüyor, Vite'ın varsayılan bağlanması bunu zaten servis eder. Önerilen düzeltme: `host: true`'yu kaldır veya `host: '127.0.0.1'` yap (cihaz testi gerekirse gerekçeyle geri gelir). — frontend
  - [SEV: low] apps/admin/e2e/panel-flow.spec.ts:25,113-128 — e2e fixture kullanıcıları KALICI ve parolaları REPOYA COMMIT'Lİ: `FIXTURE_PASSWORD = 'arkesoft-e2e-fixture-password-123'`; `createVerifiedFixtureUser` koşum başına 3 yeni kullanıcı oluşturup e-postasını DOĞRULUYOR ve HİÇBİRİNİ SİLMİYOR (ben bir koşum yaptım: 8/8 yeşil, 3 yeni doğrulanmış kullanıcı daha). Saldırı senaryosu: spec bir gün paylaşılan bir dev/staging ortamına yöneltilirse (bugün V5 gereği YEREL), orada parolası repoda açıkça yazılı, e-postası doğrulanmış hesaplar birikir; deseni bilen biri (`e2e-<timestamp>-<rand>@arkesoft.test` + sabit parola) oturum açabilir. BUGÜN ETKİ SINIRLI ve bu yüzden `low`: fixture kiracı ÜYELİĞİ oluşturmuyor → bu hesaplar yalnızca `session.me`'ye (`{userId, sessionId}`) ulaşır, kiracı-kapsamlı hiçbir şeye ulaşmaz (ÖLÇTÜM: panel host'undan `tenant.current` → 404). Aynı desen `apps/api/src/__tests__/helpers/auth-fixture.ts`'te ÖNCEDEN VAR (bu sürüm yeni bir ÜRETİCİ ekliyor, sınıfı icat etmiyor). Önerilen düzeltme: koşum başına rastgele parola + `afterAll` temizliği; kalıcı çözüm v0.0.19'un test verisi fabrikaları. — qa (vade v0.0.19)
  - [SEV: low] apps/admin/e2e/panel-flow.spec.ts — AC8'in RENDER yarısı mekanik olarak ölçülmemiş: spec'te kasıtlı BAŞARISIZ giriş testi YOK (grep `errors\.|Invalid email|INVALID_EMAIL|hatalı` → **0 eşleşme**). Yani ham İngilizce sunucu mesajının ekrana düşebileceği TEK yüzey (zarf c, giriş yolu) yalnızca birim testiyle korunuyor. GÜVENLİK AÇIĞI DEĞİL, eksik gerileme bekçisi — sızdırmazlığı YAPISAL olarak doğruladım: `panel-error.ts`'te `message`/`userMessageKey` alanı YOK (grep: yalnızca yorumda geçiyor), `resolveErrorMessage` bilinmeyen kodu jenerik metne düşürüp KODU BASMIYOR, `apps/admin/src`'te `dangerouslySetInnerHTML`/`innerHTML`/`console.*` → **0**. Önerilen düzeltme: spec'e "yanlış parolayla giriş → ekranda `/\berrors\.[a-z]/` 0 ve `Invalid email or password` 0, Türkçe katalog metni görünür" testi. — qa
  - [SEV: low] apps/admin/src/routes/_app.tsx:140-160 — Çıkış KISMEN başarısız olduğunda yerel önbellek ve ekrandaki kimlik OLDUĞU GİBİ kalıyor: temizlik yalnızca `kind === 'signed-out'` VEYA `SESSION_NOT_FOUND` dallarında yapılıyor; başka her hata (ağ kopması, 429 `RATE_LIMIT_EXCEEDED`, 403 `CROSS_SITE_REQUEST_REJECTED`) menü içinde bir `role="alert"` mesajı gösterip kabuğu KORUYOR. Saldırı senaryosu: ortak kullanılan bir bilgisayarda kullanıcı "Çıkış yap"a basar, istek başarısız olur, menü içindeki küçük uyarıyı fark etmeden ekrandan ayrılır; `better-auth.session_token` çerezi geçerli kalır (ÖLÇTÜM: `Max-Age=604800`, yani 7 gün, `HttpOnly; SameSite=Lax; Domain=.arkesoft.localhost`). Seçilen davranış SAVUNULABİLİR ve bu yüzden `low`: oturum gerçekten CANLI olduğu için yerel olarak temizlemek "çıktım" yanılsaması üretir — daha kötüsü olurdu; kullanıcıya DA söyleniyor. Kalan risk uyarının GÖRÜNÜRLÜĞÜ. Önerilen düzeltme: başarısız çıkışı menü içi küçük bir satır yerine kalıcı/belirgin bir uyarıya taşımak (ux kararı). — ux + frontend
  - [SEV: low] apps/admin/vite.config.ts:89-91 (`build.manifest: true`) — `dist/.vite/manifest.json` dağıtılabilir çıktının İÇİNDE üretiliyor; tek tüketicisi derleme-sonrası bütçe script'i (`scripts/check-bundle-budget.ts`), tarayıcı ona İHTİYAÇ DUYMUYOR. Üretimde ingress `dist`'i statik servis edeceği için `/.vite/manifest.json` kimlik doğrulamasız okunabilir hâle gelir. BUGÜN İÇERİK ÖNEMSİZ ve bu yüzden `low` (ölçtüm: 4 kaynak yolu — `src/routes/_app.tsx`, `_app.index.tsx`, `_auth.sign-in.tsx` — hepsi kullanıcının adres çubuğunda zaten gördüğü rotalar; sır 0). ASIL SENARYO İLERİDE: manifest uygulama büyüdükçe HER lazy rotayı listeler — v0.0.14 (RBAC) ile izne tabi rotalar geldiğinde oturumsuz bir ziyaretçi panelin TAM rota yüzeyini (hangi modüllerin var olduğunu) tek dosyadan sayabilir. Önerilen düzeltme: ingress/CDN kuralında `/.vite/` yolunu reddet veya manifest'i `dist` DIŞINA yaz (`build.manifest` yerine bir plugin/`outDir` dışı yol); v0.0.14'ten ÖNCE kapatılmalı. — devops (vade v0.0.14)
ÖLÇÜMLER: aşağıdaki "Ölçümler" bölümü (gerçek komut çıktıları)
```

**FAIL kuralı uygulaması (AGENT_BASELINE §4):** `critical 0 · high 0 · medium 0 · low 7` → **PASS**; yedi bulgu teknik borca kaydedilir.

---

## Ölçümler

### Zorunlu kapı (Orkestratör ölçümü doğrulandı)

| Komut                 | Çıktı                                                                                        | Orkestratör iddiası | Sonuç        |
| --------------------- | -------------------------------------------------------------------------------------------- | ------------------- | ------------ |
| `pnpm lint`           | `Tasks: 17 successful, 17 total`                                                              | 17/17               | ✅ doğrulandı |
| `pnpm typecheck`      | `Tasks: 17 successful, 17 total`                                                              | 17/17               | ✅ doğrulandı |
| `pnpm test`           | ui 13 · errors 48 · admin 26 · trpc 26 · db 166 · api 334 → **613** (41 api dosyası dahil)   | 613                 | ✅ doğrulandı |
| `pnpm test:isolation` | db 14 + api 2 = **16**, `Tasks: 8 successful`                                                  | 16                  | ✅ doğrulandı |
| `pnpm build`          | `Tasks: 12 successful, 12 total`                                                              | 12/12               | ✅ doğrulandı |
| `pnpm format:check`   | `All matched files use Prettier code style!`                                                   | temiz               | ✅ doğrulandı |
| `pnpm --filter @arkesoft/admin test:e2e` | `8 passed (5.5s)` — AC3 guard negatifi dahil                                | —                   | ✅ (ben koştum) |

### `pnpm audit`

```
2 vulnerabilities found
Severity: 1 moderate | 1 high
```

| Seviye       | Sayı  | Bulgu                                                       | Taban çizgisi (v0.0.6, T-007 tur2)       |
| ------------ | ----- | ----------------------------------------------------------- | ---------------------------------------- |
| kritik       | **0** | —                                                           | 0 → değişmedi                            |
| **high**     | **1** | `multer >=2.0.0 <2.5.0` GHSA-q7qp-rjg7-q26m, 4 yol          | 1 (aynı bulgu) → **artış YOK**, vade v0.0.16 (atfedilmez) |
| **orta**     | **1** | `minimatch <11.0.1` GHSA-g3hv-75wg-m249, 60 yol             | **0 → 1, ARTIŞ** (bulgu 1)               |
| düşük        | **0** | —                                                           | 0 → değişmedi                            |

Toplam bağımlılık: 740 (prod 289 / dev 380 / opt 71).

**Orta bulgunun atfedilmesi (ölçülerek, iddiaya dayanmıyor):**

```
$ git diff pnpm-lock.yaml | grep -E "^[-+].*minimatch" | sort -u
+      minimatch: 3.1.5
+  minimatch@3.1.5:

$ cd packages/config && pnpm why minimatch
minimatch@3.1.5
└─┬ eslint-plugin-jsx-a11y@6.10.2
  └── @arkesoft/config@0.0.3 (devDependencies)
```

→ Yeni savunmasız yolu bu sürümün eklediği `eslint-plugin-jsx-a11y@6.10.2` açıyor. (Önceden var olan `minimatch@10.2.6` yolu `eslint`'ten geliyor ve o da `<11.0.1`; advisory'nin kendisi T-007'den sonra yayınlanmış olabilir — ama **bu sürüm kesinlikle YENİ bir savunmasız yol ekliyor**, bu yüzden bulgu kaydedildi.)

### Tedarik zinciri — 19 katalog girdisi

| Kontrol                                                | Sonuç                                                                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 7 gün kuralı (V2) uygulandı mı                         | ✅ Üç paket elendi ve gerekçesi katalogda tarihli: `@tanstack/react-query` 5.105.0 (5 gün) → **5.104.5** · `@hookform/resolvers` 7.0.0 (teslim günü) → **6.0.0** · `tailwindcss` **4.3.3** teyitli |
| `minimumReleaseAgeExclude` izin kaydı                  | ✅ **POZİTİF DOĞRULANDI YOK** — `grep -nE "minimumReleaseAge" pnpm-workspace.yaml .npmrc` → tek eşleşme bir **yorum satırı** (satır 199), gerçek bir alan **yok** |
| `onlyBuiltDependencies` / install script izni genişledi mi | ✅ Değişmedi (grep: yeni satır yok)                                                                                                       |
| Her girdinin Türkçe gerekçesi + yayın tarihi           | ✅ 19/19                                                                                                                                       |
| Peer uyumsuzluğu                                       | ⚠ Tek kalem: `eslint-plugin-jsx-a11y@6.10.2` peer'ında ESLint 10 yok → **bulgu 2** (fonksiyonel boşluk ÖLÇÜLDÜ: yok)                          |

### ÖZEL DİKKAT 1 — orijin topolojisi (ADR-0011 madde 1-2)

**① CORS başlığı HİÇ üretiliyor mu — canlı HTTP, 12 prob**

`node --env-file=.env apps/api/dist/main.js` ile GERÇEK API (supertest değil), `curl -D -`:

| Prob                                                                 | Durum   | `cache-control`     | `vary`                            | `etag` | `access-control-*` | `x-powered-by` |
| -------------------------------------------------------------------- | ------- | ------------------- | --------------------------------- | ------ | ------------------ | -------------- |
| `GET /trpc/session.me` çerezsiz + Origin: panel                      | **401** | `no-store, private` | `Cookie`                          | yok    | **yok**            | **yok**        |
| `GET /trpc/session.me` çerezsiz + Origin: evil                       | **401** | `no-store, private` | `Cookie`                          | yok    | **yok**            | **yok**        |
| `OPTIONS /trpc/session.me` + preflight başlıkları + Origin: evil     | **401** | `no-store, private` | `Cookie`                          | yok    | **yok**            | **yok**        |
| `GET /trpc/tenant.current` panel host'u                              | **404** | `no-store, private` | `Cookie`                          | yok    | **yok**            | **yok**        |
| `GET /auth/sessions` çerezsiz                                        | **401** | `no-store, private` | `Cookie`                          | yok    | **yok**            | **yok**        |
| `GET /health`                                                        | **200** | `no-store, private` | `Cookie`                          | yok    | **yok**            | **yok**        |
| `GET /tamamen-bilinmeyen`                                            | **404** | `no-store, private` | `Cookie`                          | yok    | **yok**            | **yok**        |
| `GET /auth/bilinmeyen-yol`                                           | **404** | `no-store, private` | `Cookie`                          | yok    | **yok**            | **yok**        |
| `POST /auth/sign-in/email` doğru parola + Origin: panel              | **200** | `no-store, private` | `Cookie`                          | yok    | **yok**            | **yok**        |
| `GET /trpc/session.me` **kimlikli** + Origin: panel                  | **200** | `no-store, private` | `Cookie` **+** `trpc-accept, accept` (iki satır) | yok | **yok** | **yok** |
| `GET /trpc/session.me` kimlikli + Origin: **evil**                   | **403** `CROSS_SITE_REQUEST_REJECTED` | `no-store, private` | `Cookie` | yok | **yok** | **yok** |
| `POST /auth/sessions/revoke-all` kimlikli + Origin: panel            | **200** | `no-store, private` | `Cookie`                          | yok    | **yok**            | **yok**        |

→ **`access-control-allow-*` 12/12 probda HİÇ ÜRETİLMEDİ.** "Allow-Origin asla `*`" / "keyfi Origin yansıtılmıyor" garantileri **başlığın hiç var olmamasıyla** sağlanıyor — değer kontrolünden güçlü (ADR-0011 madde 1).

Statik taramayla çapraz kontrol:

```
$ grep -rniE "enableCors|from 'cors'|access-control-allow" --include=*.ts --include=*.mjs --include=*.yaml apps packages infra | <test dosyaları ve yorumlar hariç>
0 eşleşme (üretim kodunda CORS açan satır YOK)
```

**② `same-origin.guard.ts` ve `auth-instance.ts` dokunuldu mu**

```
$ git diff --stat apps/api/src/auth/same-origin.guard.ts apps/api/src/auth/auth-instance.ts \
                  apps/api/src/errors/app-exception.filter.ts apps/api/src/config/api-env.ts apps/api/src/main.ts
(boş çıktı — BEŞİ DE DEĞİŞMEDİ)
```

→ S3'ün "dokunmadım" iddiası doğrulandı. `trustedOrigins` eklenmedi, `disableOriginCheck` dokunulmadı (dev/prod'da **açık** kalıyor).

**③ Vite `server.cors: false` — dev-only yüzey, kapatılması doğru**

Canlı dev sunucusu ölçümü: `GET /` + `Origin: https://evil.example.com` → yanıtta `access-control-allow-*` **yok** (Vite'ın varsayılan `cors: true`'su `Access-Control-Allow-Origin` eklerdi). Başka bir etkisi **bulunamadı**: HMR websocket'i CORS'a dayanmıyor; `allowedHosts` zaten yabancı host'u 403 ile kesiyor; modül/asset istekleri aynı orijin. Değişiklik **dev'i prod'a daha sadık kılıyor** (prod'da `apps/api` bu başlığı hiç üretmiyor — yukarıda ölçüldü) → **doğru karar, olumsuz etki yok**.

**④ Port birliği — yeterli mi**

| Taraf                           | Kaynak                                                      | Değer |
| ------------------------------- | ----------------------------------------------------------- | ----- |
| Kod sabiti                      | `apps/admin/src/app/panel-config.ts:PANEL_DEV_PORT`         | 5173  |
| Vite dev sunucusu               | `vite.config.ts` → `port: PANEL_DEV_PORT, strictPort: true` | 5173  |
| Playwright `webServer`          | `playwright.config.ts` → `vite --port ${PANEL_DEV_PORT} --strictPort` (`vite preview` **değil**, varsayılanı 4173 olduğu için) | 5173 |
| `.env.example`                  | `AUTH_BASE_URL=http://panel.arkesoft.localhost:5173`        | 5173  |
| Pin testi                       | `panel-origin-pin.test.ts` → `.env.example` portu == `PANEL_DEV_PORT` | ✅ yeşil |

**Yeterli mi: KOD TARAFI İÇİN EVET, ÇALIŞMA ZAMANI İÇİN KISMEN.** Pin testi `.env.example`'ı (şablon) bağlıyor, gerçek `.env`'i / üretim sırrını **bağlamıyor** — bağlayamaz da (`.env` git'te izlenmiyor, üretimde secret yöneticisinde). **Bu bir bulgu DEĞİL, çünkü sapmanın yönü fail-closed:** port sapması 403 (**reddetme**) üretir, atlatma üretmez; üretimde port yok (443/443) → sapma yapısal olarak imkânsız; operatör geçişi `.env.example`'da ve ADR'de yazılı. S3'ün ikinci turda fixture'ı literal yerine `BASE_ENV.AUTH_BASE_URL`'den türetmesi doğru çözüm — `same-origin-guard.test.ts` diff'ini okudum, **negatif ikizler (eşleşmeyen Origin / `sec-fetch-site: cross-site`) literal kaldı**, guard mantığı **gevşetilmedi**.

### ÖZEL DİKKAT 2 — muafiyet kümesi 12 → 13 (ADR-0011 madde 3)

**ADR-0011 madde 3'ün üç koşulu — her birini kendim doğruladım:**

| # | Koşul                                                      | Kanıt (kaynak kodu okunarak)                                                                                                                      | Sonuç |
| - | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1 | Çıktı şeması kiracıya ait HİÇBİR alan taşımıyor            | `packages/trpc/src/schemas/session-identity.schema.ts` → `z.object({ userId: z.string(), sessionId: z.string() })` — **iki alan, opsiyonel yok**. `tenantId`/`slug`/`status` bu tipe **yapısal olarak giremez** | ✅ |
| 2 | Prosedür `protectedProcedure` — kimlik zorunlu kalıyor     | `session.router.ts` → `me: protectedProcedure.output(sessionIdentitySchema).query(...)`. HTTP ölçümü: çerezsiz `GET /trpc/session.me` → **401 `UNAUTHENTICATED`** | ✅ |
| 3 | Resolver `ctx.tenant`'a HİÇ dokunmuyor                      | Resolver gövdesi tek ifade: `({ ctx }) => ({ userId: ctx.auth.userId, sessionId: ctx.auth.sessionId })` — `ctx.tenant` **yok**                      | ✅ |

→ Sızdırmazlık **testle değil tipin şekliyle** sağlanıyor (ADR-0011'in kendi iddiası doğrulandı).

**Kümelerin durumu:**

```
TENANT_EXEMPT_PATHS = 13 eleman (dördüncü grup: '/trpc/session.me')
AUTH_EXEMPT_PATHS   =  9 eleman — $ git diff --stat apps/api/src/auth/auth-exempt-paths.ts → BOŞ (değişmedi)
```

**Kardinalite assertion'ı gevşetilmemiş (diff okundu):**

```
-    expect(TENANT_EXEMPT_PATHS.size).toBe(12)
+    expect(TENANT_EXEMPT_PATHS.size).toBe(13)
...
     expect(new Set(TENANT_EXEMPT_PATHS)).toEqual(new Set(EXPECTED_EXEMPT_PATHS))   ← DEĞİŞMEDİ
```

`.size` **kaldırılmadı**, `toContain`'e **düşürülmedi**, küme eşitliği **elle** 13'e çıkarıldı, "on iki"→"on üç" **üç yerde** (liste yorumu, dosya başı dördüncü grup, test yorumu) aynı değişiklikte güncellendi.

**`tenant.current` panel host'undan erişilemez kalmış mı (R1):** ✅ canlı HTTP → **404 `TENANT_NOT_FOUND`**.

**Mekanizmanın dayandığı değişmezlik — tam eşleşme + batching kapalı. ATLATMA DENEMELERİ (canlı HTTP, geçerli çerezle):**

| Deneme                                                   | Sonuç | Yorum                                              |
| -------------------------------------------------------- | ----- | -------------------------------------------------- |
| `/trpc/session.me,tenant.current?batch=1&input={}`       | **404** `TENANT_NOT_FOUND` | Toplu yol tam eşleşmiyor → muafiyet YOK, fail-closed |
| `/trpc/session.me?batch=1&input={"0":{}}`                | **400** `HTTP_EXCEPTION`   | `allowBatching: false` reddediyor (ADR-0009 madde 8 — `create-trpc-request-handler.ts:94` doğrulandı) |
| `/trpc/SESSION.ME` (büyük harf)                           | **404**                    | `isTenantExemptPath` büyük/küçük harf duyarlı → fail-closed |
| `/trpc/session.me%2F..%2Ftenant.current` (kodlanmış gezinme) | **404**                 | `new URL().pathname` kodlanmış `%2F`'yi çözmüyor → eşleşme yok |
| `/trpc/session.me/../tenant.current`                      | **404**                    | Normalizasyon sonrası `tenant.current` → muaf değil |
| `/trpc/session.me/` (sondaki slash)                       | **200** `{userId, sessionId}` | **Kasıtlı** (`normalizeRequestPath` sondaki `/`'ı soyuyor) — AYNI prosedür, AYNI iki alan → yetki yükselmesi YOK |
| `/trpc/tenant.current` (taban)                            | **404**                    | ✅ |

→ **Hiçbir atlatma yolu bulunamadı. Muafiyet mekanizması fail-closed.**

### ÖZEL DİKKAT 3 — önbellek başlığı: T-007'deki 0/5 bulgumun kapanışı

**① 0/5 → 5/5 — KENDİ ÖLÇÜMÜM (gerçek HTTP, supertest DEĞİL):** yukarıdaki 12 prob tablosu. İlgili beş sınıf:

| # | Sınıf                                                       | Durum | `cache-control`     | `vary`   | `ETag` |
| - | ----------------------------------------------------------- | ----- | ------------------- | -------- | ------ |
| 1 | Kimlikli **200** (`GET /trpc/session.me` + çerez)            | 200   | `no-store, private` | `Cookie` + `trpc-accept, accept` | **yok** |
| 2 | **401** `AuthGuard` reddi (çerezsiz)                         | 401   | `no-store, private` | `Cookie` | **yok** |
| 3 | **403** `SameOriginGuard` reddi (yabancı Origin)             | 403   | `no-store, private` | `Cookie` | **yok** |
| 4 | **404** `TenantGuard` reddi (`/auth/bilinmeyen-yol`)         | 404   | `no-store, private` | `Cookie` | **yok** |
| 5 | **404** eşleşmeyen Nest rotası (`/tamamen-bilinmeyen`)       | 404   | `no-store, private` | `Cookie` | **yok** |

→ **T-007'de ölçtüğüm 0/5 artık 5/5. BULGU KAPANDI.** (T-007 tur1 medium + tur2 medium + tur2 low'un üçü birden.)

**T-007 tur2'de bıraktığım medium — `GET /auth/sessions` önbellek başlıkları:** canlı ölçüm → `401` (çerezsiz) ve `200` (kimlikli, `revoke-all` sonrası oturum kontrolünde) yanıtlarının ikisi de `cache-control: no-store, private` + `vary: Cookie` taşıyor, `etag` **yok**. T-007'de ölçtüğüm hâl `cache-control: null, vary: null, etag: W/"b1-..."` idi. → **KAPANDI.**

**② `trpc.controller.ts`'teki iki literal silindi mi (borç 1453):**

```
$ grep -rn "'no-store" --include=*.ts apps packages | <test hariç>
apps/api/src/http/no-store-response-headers.ts:39:  res.setHeader('cache-control', 'no-store, private')

$ grep -rn "setHeader(res, 'vary'|setHeader('vary'" --include=*.ts apps/api/src | <test hariç>
apps/api/src/http/no-store-response-headers.ts:40:  res.setHeader('vary', 'Cookie')
```

→ Politika literalleri **tek modülde**, ikinci kopya **0**. Borç 1453 kapandı.

**③ İki forward döngüsünde `vary` `appendHeader` ile mi yazılıyor:** diff okundu, **evet** — `trpc.controller.ts:106-118` ve `auth.controller.ts:89-101`'de `lowerName === 'vary'` → `httpAdapter.appendHeader`; `cache-control` → `continue` (hiç yazılmıyor, politika platformun); `set-cookie` dalı **değişmedi**. **CANLI KANIT:** kimlikli `GET /trpc/session.me` yanıtında **iki ayrı `vary` satırı** geldi — `vary: Cookie` **ve** `vary: trpc-accept, accept` → middleware'in `Cookie`'si **ezilmedi**, tRPC'nin kendi değeri **kaybolmadı**.

**④ Better Auth delege yanıtları başlıkları alıyor mu:** ✅ `POST /auth/sign-in/email` → **200** + `cache-control: no-store, private` + `vary: Cookie` + `set-cookie: better-auth.session_token=…; Max-Age=604800; Domain=.arkesoft.localhost; Path=/; HttpOnly; SameSite=Lax` → oturum durumu **ve** çerez taşınıyor, önbellek politikası **da** yazılmış.

**⑤ ETag kapatma `main.ts` VE `createTestApp()` ikisinde de etkin mi:** ✅ **İKİSİNDE DE**, iki bağımsız kanıtla: (a) `main.ts`'ten başlatılan gerçek süreçte 12/12 probda `etag` **yok** (benim ölçümüm) · (b) `createTestApp()` üzerinden koşan `no-store-headers.test.ts` 5/5 + `trpc-http.test.ts`'in `expect(response.headers['etag']).toBeUndefined()` assertion'ı yeşil (334/334). `HttpHardeningInitializer` modül grafiğinde (`app.module.ts` `providers`) olduğu için ek kablolama gerekmedi; `@Inject(HttpAdapterHost)` S3'ün ikinci turda bulduğu zorunluluk. `x-powered-by` da 12/12 probda **yok**.

`app.module.ts` **yalnızca ekleme**: `git diff --numstat apps/api/src/app.module.ts` → **`24  0`** (silinen satır 0) → K-A5'in bağladığı `RequestContext → Tenant → Auth` **göreli** sırası korunuyor.

**Testler gevşetilmedi, GÜÇLENDİRİLDİ:** `trpc-http.test.ts` diff'i `expect(typeof response.headers['etag']).toBe('string')` → `expect(response.headers['etag']).toBeUndefined()` (varlık → yokluk). `trpc-cross-tenant.isolation.test.ts` diff'i **yalnızca yorum** (12→13 sayısı), hiçbir assertion değişmedi.

### ÖZEL DİKKAT 4 — panelin sır yüzeyi (K5)

**`apps/admin/dist/**` sır taraması — DEĞER bazlı (ad bazlı değil), gerçek `.env`'den okunan değerlerle:**

| Değişken               | `dist` eşleşmesi |
| ---------------------- | ---------------- |
| `BETTER_AUTH_SECRET`   | **0**            |
| `POSTGRES_PASSWORD`    | **0**            |
| `MEILI_MASTER_KEY`     | **0**            |
| `S3_SECRET_ACCESS_KEY` | **0**            |
| `S3_ACCESS_KEY_ID`     | **0**            |
| `DATABASE_URL`         | **0**            |
| `REDIS_URL`            | **0**            |
| `MAIL_FROM_ADDRESS`    | **0**            |
| **TOPLAM**             | **0**            |

Ad bazlı tarama da **0** (tek görünen eşleşme `MAIL_DELIVERY_FAILED` adlı **hata kodu** — yanlış pozitif).

**`dist`'te mutlak API URL'i / iç host adı / veritabanı dizesi:**

```
$ grep -rhoE "https?://[A-Za-z0-9._:/-]+" apps/admin/dist/ | sort -u
http://json-schema.org/draft-04/schema      https://json-schema.org/draft/2020-12/schema
http://json-schema.org/draft-07/schema      https://react.dev/errors/
http://localhost                            https://tailwindcss.com
http://www.w3.org/{1998/Math/MathML, 1999/xlink, 2000/svg, XML/1998/namespace}
```

→ **Mutlak API URL'i yok, iç host adı yok, `127.0.0.1`/`:3000`/`panel.arkesoft` yok.** Tek `http://localhost` TanStack Router'ın iç geri düşüş orijini (`this.origin ||= window?.origin … : 'http://localhost'`) — zararsız kütüphane sabiti.

```
$ grep -rcoE "postgres(ql)?://|redis://|mongodb://|mysql://" apps/admin/dist/   → her dosyada 0
$ grep -rc "VITE_" apps/admin/dist/                                            → her dosyada 0
```

**Dev-only kol `ARKESOFT_PANEL_DEV_API_TARGET`:** `VITE_` öneki **yok** (`vite.config.ts:47-49`), yalnızca `vite.config.ts`'in Node tarafında `process.env`'den okunuyor, Zod `z.string().pipe(z.url()).default('http://127.0.0.1:3000')` ile fail-fast. `dist`'te `ARKESOFT_PANEL_DEV_API_TARGET` **0 eşleşme** → bundle'a inline edilmedi. ✅

**`envDir`:** `envDir: import.meta.dirname` — kök `.env`'e **işaret etmiyor**; dosyanın yorumu bunun `vite`'ın hangi `cwd`'den çağrıldığına bağlı kaymayı da kapattığını açıklıyor (varsayılana güvenilmemiş, fail-closed). `apps/admin/` dizininde `.env` dosyası **yok** → hiçbir `VITE_*` kök `.env`'den sızamaz. ✅

**Yeni zorunlu env: YOK** (`infraEnvSchema`/`pnpm env:check` değişmedi; `api-env.ts` `git diff` boş). Tek operatör kalemi `AUTH_BASE_URL`'in **değeri** — `.env.example`'da 17 satırlık geçiş **ve geri alma** notuyla belgeli.

### ÖZEL DİKKAT 5 — üç zarf ve panelin hata yüzeyi

**① Mesaj alanı yokluğu YAPISAL mı:**

```
$ grep -nE "message|userMessageKey" apps/admin/src/errors/panel-error.ts
5:// `code` SCREAMING_SNAKE_CASE + `message` HAM İngilizce, `details`/`requestId`
9:// 1. Hiçbir mesaj alanı taşınmaz (ne `message` ne `userMessageKey`) → panelin
```

→ İki eşleşmenin **ikisi de yorum**. Tip gövdesi:

```ts
export type PanelError =
  | { readonly kind: 'known'; readonly code: string; readonly requestId: string | null }
  | { readonly kind: 'unknown'; readonly requestId: string | null }
```

→ **Mesaj alanı yok. Panelin sunucudan gelen bir metni ekrana basması yapısal olarak imkânsız.** `normalizePanelError`'ın beş probe'unun **hiçbiri** `message`'ı çıktıya taşımıyor (dosya okundu); zarf (c) dalı yalnızca `code`'u alıp `requestId: null` yazıyor.

**② Ham İngilizce mesaj veya `errors.*` anahtarı ekrana çıkabilir mi:** **HAYIR.** Render yolu `resolveErrorMessage(code: string)` → `isPanelErrorCode(code)` değilse `GENERIC_ERROR_MESSAGE` (Türkçe), **kod ekrana BASILMIYOR** (birim testi bunu assert ediyor: `expect(message).not.toContain('TOTALLY_UNKNOWN_CODE_XYZ')`). Katalogdaki 19 mesajın hiçbiri `/\berrors\.[a-z]/` ile eşleşmiyor (birim testi) ve `INVALID_EMAIL_OR_PASSWORD` metninin `'invalid email or password'` içermediği de test edilmiş. Panelde `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function` → **0**; `console.*` → **0**; `localStorage`/`sessionStorage`/`document.cookie` → **0**; `href=`/`target=`/`window.open`/`location.` → **0** (açık yönlendirme yüzeyi yok). React varsayılan kaçışı dışında metin enjeksiyon yüzeyi bulunamadı.

**③ `requestId` ekranda — sızıntı mı meşru izlenebilirlik mi:** **meşru.** `formatSupportCodeLine` → `"Destek kodu: req_<uuid4>"`. Değer bizim `RequestContextMiddleware`'imizin ürettiği korelasyon kimliği; kiracı/kullanıcı/oturum bilgisi **kodlamıyor** (canlı ölçüm: `req_4bf36d00-20e7-428b-99be-21913b5dd0b7` — rastgele uuid), zaten `x-request-id` başlığında istemciye dönüyor. Panel **sahip olmadığı** `requestId`'yi **uydurmuyor**: `requestId === null` → satır hiç üretilmiyor (borç 1445 kısıtı korunmuş); zarf (c)'de `requestId` **her zaman null** olduğu için giriş hatasında destek kodu **gösterilmiyor**. ✅

**④ `transport-aware-fetch` gövdeyi log'a/konsola sızdırıyor mu:** **hayır.** Gövde **bir kez** okunuyor (`Response.clone()` yok), `appErrorBodySchema` uyarsa `Object.assign(new Error('transport_rejection'), { body })` fırlatılıyor — `console.*` çağrısı **0**, dosyada da repoda da. Fırlatılan `Error.body` yakalanmazsa tarayıcı konsoluna düşer ama içeriği bizim kendi `AppErrorBody`'miz (`code` + i18n anahtarı + `details` + `requestId`) — **sır/PII yok**. Başarılı yanıtın gövdesine **hiç dokunulmuyor**.

**⑤ A-A5 enumeration — KENDİ ÖLÇÜMÜM (gerçek uç, gerçek kullanıcı):**

```
--- yanlış parola, VAR OLAN kullanıcı ---
{"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}   status=401
--- VAR OLMAYAN kullanıcı ---
{"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}   status=401
```

→ **Gövde ve durum BİREBİR AYNI.** Better Auth kullanıcı sayımını engelliyor (S3'ün ölçümü doğrulandı).

**Panelin Türkçe metni bu ayrımı sızdırıyor mu: HAYIR.** `messages.ts:105` → `INVALID_EMAIL_OR_PASSWORD: 'E-posta veya parola hatalı.'` — hangisinin yanlış olduğunu **söylemiyor**; "böyle bir kullanıcı yok"/"kullanıcı yok"/"bulunamadı" ifadelerinin **yokluğu birim testiyle pinli** (`messages.test.ts:37-44`). ux dokümanı da aynı kararı kayda geçirmiş. ✅

**Üç zarfın normalizasyonu:** `normalize-panel-error.ts` okundu — beş sıralı probe, `instanceof` **yok**, **fırlatmıyor** (fail-closed `{kind:'unknown'}`), `cause` derinliği **2 ile sınırlı** (döngüsel `cause` zinciri sonsuz özyinelemeye girmiyor — DoS yüzeyi yok), 3→4 sırası gerekçesiyle yazılı, dördüncü zarf şeması kopyası **doğmamış** (`@arkesoft/errors` ve `@arkesoft/trpc` şemaları doğrudan tüketiliyor). `auth-rest.ts` `credentials: 'same-origin'` (**`include` değil**). ✅

### ÖZEL DİKKAT 6 — tarayıcı yüzeyinin kendisi

**① `allowedHosts` fail-closed mu — KENDİ ÖLÇÜMÜM (canlı dev sunucusu):**

```
Host: panel.arkesoft.localhost:5173  → 200
Host: evil.example.com               → 403  "Blocked request. This host ("evil.example.com") is not allowed."
Host: 127.0.0.1:5173                 → 200   (Vite IP-literal Host'lara izin veriyor — DNS rebinding hostname gerektirdiği için standart davranış)
```

→ **Hostname tabanlı DNS rebinding'e karşı fail-closed (A-A1 doğrulandı).** IP-literal kabulü + `server.host: true` → **bulgu 3** (low, dev-only).

**② Çıkışta önbellek temizliği — sıra doğru mu:** ✅ `_app.tsx:148-152` → `signOut()` → **`queryClient.clear()`** → **`await navigate({ to: '/sign-in' })`**. Temizlik navigasyondan **ÖNCE** → eski kimlik bir kare **görünemez**. `clear()` seçilmiş (`removeQueries(['session'])` değil) → yeni ekran eklendiğinde unutulma riski **yok**, fail-closed. e2e bunu uçtan uca doğruluyor (çıkış sonrası `/sign-in`, form boş, panele doğrudan gidiş tekrar girişe yönlendiriyor — 8/8 yeşil). Kısmi başarısızlık dalı → **bulgu 6** (low).

**③ Guard `beforeLoad`'da mı:** ✅ `_app.tsx` `createFileRoute('/_app')({ beforeLoad: async ({ context }) => { ... } })` — `component`'ten **önce**, yani **bileşen hiç render edilmeden**. `UNAUTHENTICATED` → `throw redirect({ to: '/sign-in' })`. Oturum iptal edildiğinde de bu dala düşüyor (ölçtüm: `revoke-all` sonrası aynı çerezle istek → `UNAUTHENTICATED`). Diğer hatalar `errorComponent`'e gidiyor ve **kabuk render EDİLMİYOR** (ux'in "sahip olmadığın veriyi gösterme" kararı). **AC3 yapısal olarak sağlanıyor** ve e2e'de ölçülü: `page.content()` ne seed'li `demo-yonetici@arkesoft.test`'i ne `Demo Yönetici`'yi ne de herhangi bir `@arkesoft.test` dizesini **içermiyor** (test 1 yeşil, ben koşturdum).

**④ e2e gerçek kullanıcı oluşturuyor — üretim davranışına sızıyor mu:** ✅ **hayır.** `e2e/**` yalnızca `playwright.config.ts`'in `testDir`'ında; `apps/admin/tsconfig.json` tek proje olsa da `e2e` üretim bundle'ında **yok** (`dist` taraması: `e2e-`/`FIXTURE_PASSWORD`/`arkesoft.test`/`8025` → eşleşme yok — Vite yalnızca `index.html`'den ulaşılabilen grafiği derliyor). `.env`/seed verisi sızmıyor: spec seed kullanıcısını **kullanmıyor**, kendi kullanıcısını üretiyor; `playwright-report/` ve `test-results/` **ikisi de `.gitignore`'da** (`.gitignore:34-35`, `git check-ignore` ile doğrulandı) → Playwright'ın sayfa anlık görüntüsü içeren `error-context.md`'si repoya **giremiyor**. Fixture kullanıcılarının kalıcılığı → **bulgu 4** (low).

### CLAUDE.md §7 — 14 madde, madde madde

v0.0.7 **hiçbir** kiracı tablosu, kiracı-kapsamlı sorgu, kuyruk işi veya mutation eklemiyor. `git diff --stat` ile doğruladım: `packages/db/**` içinde şema/migration değişikliği **yok** (yalnızca `vitest.config.ts`).

| #      | Madde                                                      | Durum                                                                                                                                                                      |
| ------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | Tabloda `tenant_id` NOT NULL                               | **N/A** — yeni tablo yok (Prisma şeması değişmedi)                                                                                                                         |
| 2      | RLS etkin + `current_setting('app.tenant_id')`             | **N/A** — yeni tablo yok                                                                                                                                                   |
| 3      | `(tenant_id, …)` bileşik indeks                            | **N/A** — yeni tablo yok                                                                                                                                                   |
| 4      | `tenantProcedure`/`permissionProcedure`, `publicProcedure` değil | **N/A + DOĞRULANDI** — yeni prosedür yok; muafiyete alınan `session.me` **`protectedProcedure`** (kimlik zorunlu, 401 ölçüldü) ve kiracı-kapsamlı **değil**. `AUTH_EXEMPT_PATHS`'e satır eklenmedi → hiçbir `publicProcedure` HTTP'de erişilebilir kılınmadı |
| 5      | `withTenant(tenantId)` üzerinden sorgu, ham `prisma` yok    | **N/A** — panel DB'ye erişmiyor; `AuthGuard`'ın mevcut `withTenant` üyelik sorgusu **değişmedi** (`auth.guard.ts` diff boş)                                                 |
| 6      | Girdiden gelen `id`'ler için sahiplik doğrulanıyor (IDOR)   | **N/A + DOĞRULANDI** — v0.0.7 **girdili** prosedür getirmiyor (`session.me` girdisiz, `.input()` yok); panel hiçbir kaynak `id`'si göndermiyor. Kimlik **tamamen sunucu tarafı ALS'den** (`ctx.auth`) geliyor → istemcinin etkileyebileceği bir `id` **yok** → **IDOR yüzeyi bu sürümde doğmuyor** |
| 7      | Kuyruk işi payload'ında `tenantId` + worker context         | **N/A** — kuyruk işi yok                                                                                                                                                   |
| 8      | Dış kaynak (Meilisearch/S3/önbellek) tenant kapsamlı        | **N/A** — bu sürüm Meilisearch/S3'e dokunmuyor; sunucu tarafı önbellek yok                                                                                                 |
| **9**  | **Önbellek anahtarı `tenant:{tenantId}:…`, global anahtarda tenant verisi yok** | **AKTİF ÖDEME — KAPANDI.** Sunucu tarafı önbelleği **yok** (o yarı N/A), ama **HTTP önbellek düzleminde** benim T-007'de ölçtüğüm 0/5 → **5/5** (yukarıdaki tablo): her yanıt `no-store, private` + `Vary: Cookie`, `ETag` yok, **guard reddi dahil**. Önbellek anahtarına **kimlik boyutu** (`Vary: Cookie`) eklendi ve saklama tamamen kapatıldı → "paylaşımlı önbellek kimlikli 200'ü saklayıp kimliksiz isteğe servis eder, guard zinciri atlanır" sınıfı **kapandı** |
| 10     | Yüklenen/indirilen dosya yolu tenant önekiyle doğrulanıyor   | **N/A** — dosya yükleme/indirme yüzeyi yok (v0.0.16). Panelde `FormData`/`input type="file"` → **0**                                                                        |
| 11     | `createTenantIsolationSuite()` ile çapraz okuma+yazma testi | **N/A** — yeni kiracı kaynağı yok. **Yerine** AC5'in pini: `tenant.current` panel host'undan **404** (canlı ölçüm) + kardinalite assertion'ı 13. `pnpm test:isolation` 16/16 yeşil, `trpc-cross-tenant.isolation.test.ts` diff'i **yalnızca yorum** |
| 12     | Hata mesajı başka tenant'ın varlığını sızdırmıyor           | **KORUNUYOR + GÜÇLENDİ.** `tenant.current` panel host'unda → `404 TENANT_NOT_FOUND` (jenerik, "yetkisiz vs. yok" ayrımı **yapmıyor**). Panel tarafında: `PanelError` **hiçbir mesaj alanı taşımıyor** → sunucudan gelen metin ekrana **basılamıyor**; bilinmeyen kod jenerik Türkçe mesaja düşüyor, **kod da basılmıyor**. Enumeration ayrımı ölçüldü: yanlış parola ≡ var olmayan kullanıcı (aynı kod, aynı durum, aynı Türkçe metin) |
| 13     | Log kayıtlarında `tenantId` var                             | **DEĞİŞMEDİ** — `logging/**` diff boş. Panel host'unda kiracı `exempt` olduğu için `tenantId` **bilinçli** boş (kiracı yok, uydurulmuyor). Canlı log satırlarında `requestId`/`method`/`handler`/`statusCode` var, sır/PII yok |
| 14     | Süper admin impersonation + denetim kaydı                   | **N/A** — süper admin v0.0.20. Bu sürümde süper admin işlemi, impersonation veya müşteri verisine erişen platform işlemi **yok**                                            |

**Karşılanmayan madde numarası: YOK.** Dokuz madde N/A (gerekçeleri yukarıda), madde 9 **aktif ödeme olarak kapandı**, madde 4/6/12 doğrulandı, madde 13 değişmedi.

**AC22 mekanik taramaları (ben koşturdum):**

```
$ grep -rniE "x-arkesoft-tenant|tenantId|tenant_id|tenantSlug" apps/admin/src packages/ui/src
0 eşleşme
```

→ Panel kiracı kimliğini **gövdede, başlıkta veya sorgu dizesinde göndermiyor** (ADR-0011 madde 4 doğrulandı, ADR-0009 madde 7 ihlal edilmiyor).

### Diğer güvenlik kontrolleri

| Kontrol                            | Sonuç                                                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sır jetonu taraması (diff)         | `git diff \| grep -niE "(password\|secret\|api[_-]?key\|token\|BEGIN .*PRIVATE KEY)"` → gerçek sır **0**. Eşleşmeler: `.env.example`'ın önceden var olan dev yer tutucusu (`..._change_me_32plus`, **bağlam satırı, değişmedi**), `js-tokens`/`@tokenizer` paket adları, `COLOR_TOKENS` export'u, `session_token=abc` test fixture'ı |
| Sır jetonu taraması (yeni dosyalar)| Tek kalem: `e2e/panel-flow.spec.ts:25` fixture parolası → **bulgu 4**                                                                                                                                                      |
| Enjeksiyon — ham SQL               | Bu sürümde ham SQL **eklenmedi** (`$queryRaw`/`$executeRaw` diff'te 0)                                                                                                                                                     |
| Enjeksiyon — komut/dosya yolu      | `child_process`/`exec`/`spawn` → 0. `scripts/check-bundle-budget.ts` yalnızca `node:fs`/`node:path`/`node:zlib`, girdisi kendi `dist/.vite/manifest.json`'u (kullanıcı girdisi yok)                                        |
| Enjeksiyon — XSS                   | `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function` → **0** (`apps/admin/src` + `packages/ui/src`). `packages/ui`'de `href=`/`target=`/`rel=` → **0** (`target="_blank"` + `rel` eksikliği sınıfı doğmuyor)        |
| Açık yönlendirme                   | `window.open`/`location.`/`document.write` → **0**. Yönlendirme yalnızca TanStack Router'ın `redirect({to:'/sign-in'})`/`navigate({to:'/'})` ile, hedefler **sabit literal** — kullanıcı girdisinden türetilen hedef **yok** |
| Girdi doğrulama (Zod)              | `vite.config.ts` env kolu Zod · `signInFormSchema` Zod (sunucu doğrulaması **yerine geçmiyor**, dosya başı yorumunda yazılı) · `normalize-panel-error.ts` beş Zod probe · `panel-origin-cors.test.ts` yanıt gövdesini Zod'dan geçiriyor · e2e'nin Mailpit okuması tip koruyucu fonksiyonlarla daraltılıyor. `any`/`@ts-ignore` → 0 (lint+typecheck yeşil) |
| Ödeme / kart verisi                | **N/A** — bu sürümde ödeme yüzeyi yok, kart verisi yok                                                                                                                                                                     |
| Webhook imza / replay / idempotency| **N/A** — webhook yok                                                                                                                                                                                                      |
| Oran sınırlama                     | `apps/api/src/auth/rate-limit/**` **değişmedi** (`git diff --stat` boş). Giriş/kayıt/şifre sıfırlama `platform:auth:<routeKey>:<scope>:<hmacHex>` ile IP **ve** e-posta kapsamında sınırlı; anahtarlarda **ham e-posta/IP yok** (HMAC). `/trpc`'nin oran sınırsızlığı **v0.0.14'e atfedilmiş** (brief), bu sürüm onu büyütmüyor — `session.me` artık erişilebilir ama reddi (401/404) ucuz ve veri taşımıyor |
| SSRF                               | Kullanıcının verdiği URL'e istek atan kod **yok**. Tek dış hedef `ARKESOFT_PANEL_DEV_API_TARGET` — **operatör** kontrolünde, dev-only, Zod `z.url()` ile doğrulanıyor, `VITE_` öneki yok                                   |
| Dosya yükleme / path traversal     | **N/A** — yükleme yüzeyi yok (v0.0.16)                                                                                                                                                                                     |
| KVKK — fazla veri toplama          | **Azaldı sayılabilir:** `session.me` yalnızca `{userId, sessionId}` döndürüyor; `email`/`name` **bilinçli yok** → Topbar maskeli e-posta bile **gösteremiyor**, `userId` kısaltması `aria-hidden` dekoratif rozet. Panel hiçbir kişisel veriyi `localStorage`/`sessionStorage`'a yazmıyor (grep 0). Üçüncü tarafa veri gönderen kod yok (analitik/telemetri/CDN çağrısı 0). Silme talebi akışını bozan değişiklik yok |
| Güvenlik kontrollerinin lint tarafı| Kasıtlı ihlal probu (geçici dosya, **ölçümden hemen sonra silindi**) → **dört kuralın hepsi tetikledi**: `@arkesoft/trpc/server` yasağı (sunucu kodunun tarayıcı grafiğine girmesini engelleyen kontrol), React sınıf bileşeni yasağı (**R-P1 birleştirmesinin çalıştığının kanıtı**), `react-hooks/rules-of-hooks`, `jsx-a11y/alt-text` |

Lint prob çıktısı (ham):

```
/…/apps/admin/src/zz-security-probe.tsx
   2:10  error  'Component' import from 'react' is restricted. Sınıf tabanlı React bileşeni yasak (CLAUDE.md §2)…  no-restricted-imports
   5:1   error  '@arkesoft/trpc/server' import is restricted from being used. Sunucu alt yolu tarayıcı grafiğine girmez (ADR-0009 §6)…  no-restricted-imports
  11:21  error  React Hook "useState" is called conditionally…  react-hooks/rules-of-hooks
  18:10  error  img elements must have an alt prop…  jsx-a11y/alt-text
✖ 4 problems (4 errors, 0 warnings)
```

### Geçici dosya disiplini

Tek geçici prob dosyası (`apps/admin/src/zz-security-probe.tsx`, başında `// GEÇİCİ — SİLİNİR` yorumuyla) oluşturuldu, ölçüm alındı ve **aynı turda silindi**. Başlattığım API süreci kapatıldı; `scratchpad` altındaki geçici log/pid/gövde dosyaları silindi.

```
$ git status --short | grep -i probe
(boş — prob dosyası YOK)
```

`apps/admin/dist` ve `test-results/` `.gitignore`'da → repoya giremiyor.

### Bu sürüme ATFEDİLMEYEN (brief gereği, yeniden ölçüldü ve teyit edildi)

- `platform:auth:*` Redis anahtar uzayının global oluşu — v0.0.5 borcu; `rate-limit/**` bu sürümde **değişmedi**.
- `/trpc` oran sınırsızlığı — v0.0.14; `RateLimitGuard`'ın `/trpc`'de anında `true` dönmesi **değişmedi**.
- `account`/`session`/`verification` tablolarının RLS'siz oluşu — ADR-0008, yapısal, v0.0.14; şema **değişmedi**.
- `multer` GHSA-q7qp-rjg7-q26m (1 high) — v0.0.16; **artış yok**, aynı tek bulgu.
- `shutdown.test.ts` flaky — T-002; bu turda 334/334 yeşil geldi.
- Oturum çerezinin `Domain=.arkesoft.localhost` ile tüm alt alan adlarına taşınması — v0.0.5 kararı; bu sürüm çerez yapılandırmasına **dokunmadı** (`auth-instance.ts` diff boş).
