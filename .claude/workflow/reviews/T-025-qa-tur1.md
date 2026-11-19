# T-025 — `qa` gate, tur 1

- **Tarih:** 2026-11-19
- **Sürüm:** ROADMAP v0.0.21.1 (semver sınıfı: `patch`)
- **Dal:** `feat/v0.0.21-surum-kayit-modeli`
- **Önceki gate'ler:** `solid` PASS (0 critical/high, 2 medium → FIX turu 1'de kapandı, 9 low) ·
  `security` PASS (0 critical/high/medium, 4 low)
- **Bu turda tek başıma koştum** — eşzamanlı başka ajan/koşum yok (run-owner kapısı
  (`create-test-app.ts:287-291`) gereği).

```
GATE: qa
SONUÇ: FAIL
```

FAIL kuralı (`AGENT_BASELINE` §4): 1 `high` (AC-31 changeset eksik) ⇒ **FAIL**
(kritik/high tek bir bulgu yeterli). 1 `medium` (prettier) eşiği tek başına FAIL
üretmez ama high zaten FAIL belirliyor.

---

## 1. KABUL KRİTERİ EŞLEMESİ

| AC | Kriter (özet) | Test / komut | Sonuç |
| --- | --- | --- | --- |
| AC-26 | `Referer` dalı pinlendi; metot×güven matrisinin dört gözü, iki giriş noktasında | `npx vitest run same-origin-guard` → `same-origin-guard.test.ts` `AC-26` describe'ı (12 vaka, 2 giriş noktası) | **GEÇTİ** (41/41, dosya 5/5) |
| AC-27 | Orijin yüzeyi ≥3 orijin, joker yok, `toHaveLength` korunur, §4.5 bayt-birebir | `npx vitest run trusted-origins` | **GEÇTİ** (17/17) |
| AC-28 | Teşhis iki yönlü: değer yokluğu + alan varlığı, boşluk savunmalı | `npx vitest run same-origin-guard-diagnostics --reporter=verbose` | **GEÇTİ** (5/5) |
| AC-29 | Port taşınabilirliği uçtan uca, 5174 dışı port | API `API_PORT=3100` + `ADDITIONAL_TRUSTED_ORIGINS=...5274`, superadmin e2e `ARKESOFT_SUPERADMIN_E2E_PORT=5274` | **GEÇTİ** (9/9 — bağımsız teyit, aşağıda ayrıntı) |
| AC-30 | Fikstürde sabit `5174` yok | `grep -rn "5174" apps/superadmin/e2e` | **GEÇTİ** (eşleşme yok) |
| AC-31 | Zorunlu kapı 6 komut exit 0 **+ changeset VAR** | `pnpm lint/typecheck/test/test:isolation/build/guards` | **KISMİ — komutlar GEÇTİ, changeset YOK → high bulgu** |
| AC-32 | Gevşetmiyorsa yazılı karar kaydı; ≥2 regresyon testi (`POST`+güvenilmeyen Referer→403, `Sec-Fetch-Site:cross-site`→403) | Regresyon testleri: `same-origin-guard.test.ts:194-242`, `same-origin-guard-trpc-surface.test.ts` 4/5+5/5 | **Regresyon testleri GEÇTİ.** Yazılı karar kaydı (ADR-0026) mimarın tasarımında açıkça `docs` ajanına (gates SONRASI) atanmış — bu turda **henüz yok**, beklenen (DOĞRULANAMADI'da not edildi, bulgu değil) |

---

## 2. KOŞTURULAN KOMUTLAR — gerçek çıktı

| Komut | Dizin | Exit | Özet |
| --- | --- | --- | --- |
| `npx vitest run same-origin-guard` | `apps/api` | 0 | 5 dosya / 41 test geçti |
| `npx vitest run trusted-origins` | `apps/api` | 0 | 1 dosya / 17 test geçti |
| `npx vitest run same-origin-guard-trpc-surface --reporter=verbose` | `apps/api` | 0 | 5/5 geçti (ad listesiyle) |
| `npx vitest run same-origin-guard-diagnostics --reporter=verbose` | `apps/api` | 0 | 5/5 geçti (M1/M2 düzeltme testleri dahil) |
| `grep -rn "5174" apps/superadmin/e2e` | kök | — | eşleşme yok (AC-30) |
| API dev (`API_PORT=3100 ADDITIONAL_TRUSTED_ORIGINS=http://superadmin.arkesoft.localhost:5274 SUPERADMIN_IP_ALLOWLIST=127.0.0.1 REDIS_URL=redis://127.0.0.1:6379/9 pnpm --filter @arkesoft/api dev`) | kök | — | `Nest application successfully started`, `/health` 200 |
| `ARKESOFT_SUPERADMIN_E2E_PORT=5274 ARKESOFT_SUPERADMIN_DEV_API_TARGET=http://127.0.0.1:3100 pnpm --filter @arkesoft/superadmin test:e2e` | kök | 0 | **9/9 geçti**: accessibility.spec.ts 2/2, sidebar-focus-return.qa 2/2, superadmin-authz 2/2, superadmin-flow 2/2, two-factor-setup-reload 1/1 |
| `pnpm lint` | kök | 0 | 23/23 görev (api:lint **cache miss**, taze koştu) |
| `pnpm typecheck` | kök | 0 | 23/23 görev (api:typecheck **cache miss**, taze koştu) |
| `pnpm test` (×2, ardışık) | kök | 0 / 0 | api:test **"cache bypass, force executing"** (önbelleğe güvenilmiyor) — ikisinde de 105 dosya/878 test (api), toplam 21/21 görev; diğer paketler: tenancy 100, ui 23, versioning 82, errors 54, themes-modern 5, superadmin 76, storefront 126, theme-sdk 225, admin 185, trpc 145, db 272 — hepsi geçti, iki koşumda da aynı sayılar |
| `pnpm test:isolation` (×2, ardışık) | kök | 0 / 0 | db 86 + api 31 = 117 test, iki koşumda da aynı (flake GÖZLENMEDİ bu turda; bilinen oran ~%6.7, bu örnekleme onu çürütmez/doğrulamaz) |
| `pnpm build` | kök | 0 | 14/14 görev |
| `pnpm guards` | kök | 0 | 22/22 mekanik adım PASS |
| `pnpm format:check` (AC-31 dışı, ekstra sanity) | kök | **1** | **`apps/api/src/auth/same-origin.guard.ts` prettier uyumsuz** — bkz. bulgu M1 |

---

## 3. KASITLI BOZMA SINAMASI (vacuity kontrolü)

`K1` kararının (yol (a) reddi: `Referer` dalına güvenli-metot muafiyeti verME) testler
tarafından **gerçekten** yakalandığını doğrulamak için `same-origin.guard.ts`'in
`Referer` dalına geçici bir mutasyon uygulandı (güvenli metotlarda `Referer`
denetimini atlayan `isSafeMethodQaMutation` dalı — yol (a)'nın simülasyonu):

- **Mutasyonlu koşum:** `npx vitest run same-origin-guard` → **3 dosya kırmızı / 2 geçti,
  9 test kırmızı / 32 geçti**. Kırılan testler tam isabetli: `AC-26` matrisinin `GET`/`HEAD`/
  `OPTIONS` + güvenilmeyen `Referer` vakaları (iki giriş noktasında, 6 test), `trpc-surface`
  1/5, `diagnostics` (a)+(b)+(c) ve (d)-4.
- **Geri alma:** dosya orijinal içeriğiyle **bayt-birebir** yeniden yazıldı; `sha256`
  mutasyon ÖNCESİ/SONRASI `496ec5d227f32ab9c17e017a9b2bdf03ac0e28e9fe4d06aab4e02841c84104e6`
  (security gate'in tur1'de kaydettiği hashle **özdeş**). Geri alma sonrası
  `npx vitest run same-origin-guard` → **5/5 dosya, 41/41 test** tekrar yeşil.
  `git status --porcelain` geri alma sonrası turun başındaki anlık görüntüyle özdeş
  (7 `M` + 5 `??`, aynı dosya listesi).

**Sonuç:** AC-26/AC-28/AC-32'nin K1'i koruyan testleri **vacuous DEĞİL** — gerçek bir
geri adım atıldığında kırmızı veriyorlar.

---

## 4. BULGULAR

```
BULGULAR:
  - [SEV: high] .changeset/ (dosya YOK) — AC-31'in açık şartı "changeset VAR
    (apps/api/src dokunuldu ⇒ zorunlu) ve semver sınıfını gerekçesiyle yazıyor"
    KARŞILANMIYOR. Ölçüldü: `.changeset/` dizininde yalnızca `config.json` var,
    hiçbir `.md` changeset dosyası yok (`ls -la .changeset/`); kök `package.json`
    hâlâ `0.10.2` (architect'in tasarladığı `0.10.3` hedefine YÜKSELTİLMEDİ);
    `CHANGELOG.md`/`git log -- .changeset/` bu Task'a ait hiçbir giriş göstermiyor.
    CLAUDE.md §5 madde 5 ve §10/11 ("Changeset'siz davranış değişikliği göndermek"
    yasak) + bu Task'ın kendi AC-31'i üçü birden bunu zorunlu kılıyor; apps/api/src
    davranışı GERÇEKTEN değişti (yeni env yüzeyi, yeni fail-fast red, yeni log
    alanları — mimarın kendi tanımıyla "test-only DEĞİL"). Düzeltme: `pnpm changeset
    add` ile Türkçe, kullanıcıya dönük özet + `patch` sınıfı (architect'in
    gerekçesiyle) eklenmeli. — sorumlu ajan: backend (CLAUDE.md §5 madde 5'in
    atadığı adım; alternatif olarak release üstlenebilir, ama release henüz bu
    Task'ta çalışmadı)
  - [SEV: medium] apps/api/src/auth/same-origin.guard.ts:128-131 — `pnpm format:check`
    bu dosyada KIRMIZI (`prettier --check .` → "Code style issues found").
    ÖLÇÜLDÜ: tek fark `SameOriginViolationBranch` union tipinin çok satırlı
    biçimi; prettier tek satıra ("'sec_fetch_site' | 'origin_header' |
    'referer_header' | 'headers_absent'") indirmek istiyor. Davranışsal etki
    SIFIR (tip bildirimi, yalnızca biçim) ama bu **CI'ı KIRAR** — ÖLÇÜLDÜ:
    `.github/workflows/ci.yml:348` `pnpm format:check` çalıştırıyor. Repo
    genelinde PRETTIER UYUMSUZ tek dosya bu (diğer 6 değişen/2 yeni dosyada
    sıfır uyumsuzluk). Mutasyon testi öncesi ALINAN sha256 ile doğrulandı — bu
    uyumsuzluk QA'nın bu turdaki hiçbir yazma işleminden KAYNAKLANMIYOR,
    backend'in turundan kalma. Düzeltme: `prettier --write
    apps/api/src/auth/same-origin.guard.ts` (dosyanın SAHİBİ çalıştırmalı — QA
    kendi dosyası olmayan bir dosyada `--write` ÇALIŞTIRAMAZ, AGENT_BASELINE
    §5). — sorumlu ajan: backend
```

---

## 5. ÖLÇÜMLER

**KABUL KRİTERİ EŞLEMESİ:** §1'deki tablo (7 AC, 6 GEÇTİ + 1 kısmi).

**TEST SAYILARI:**
- Bu Task'ın kapsamındaki yeni/değişen test dosyaları: `same-origin-guard.test.ts`
  (+78 satır, AC-26 describe'ı eklendi), `trusted-origins.test.ts` (+137 satır,
  4 yeni describe), `same-origin-guard-diagnostics.test.ts` (YENİ, 5 test),
  `same-origin-guard-trpc-surface.test.ts` (YENİ, 5 test).
- T-025 kapsamı toplam (same-origin-guard ailesi + trusted-origins): **6 dosya /
  58 test**, hepsi geçti (0 başarısız).
- `apps/api` paket geneli (`pnpm test`): **105 dosya / 878 test**, iki ardışık
  koşumda da aynı sayı, 0 başarısız.
- `pnpm test` kök toplayıcı: **21/21 görev**, tüm paketler (tenancy 100, ui 23,
  versioning 82, errors 54, themes-modern 5, superadmin 76, storefront 126,
  theme-sdk 225, admin 185, trpc 145, db 272, api 878) geçti.
- `pnpm test:isolation`: **11/11 görev**, db 86 + api 31 = 117 test, iki ardışık
  koşumda da aynı, 0 başarısız (flake bu örneklemde gözlenmedi).
- `apps/superadmin test:e2e` (port 5274/3100): **9/9 geçti** (11.3s).
- Kasıtlı mutasyon koşumu: **9 test KIRMIZI / 32 geçti** (hedefli, yan hasar
  yok) → geri alındıktan sonra **41/41 yeşil**.

**KOŞTURULAN KOMUTLAR:** §2'deki tablo (hepsi exit 0, `format:check` hariç exit 1).

**AC-29 ölçüm koşulları (R8):**
- Komutun birebir metni: Terminal A —
  `API_PORT=3100 ADDITIONAL_TRUSTED_ORIGINS=http://superadmin.arkesoft.localhost:5274 SUPERADMIN_IP_ALLOWLIST=127.0.0.1 REDIS_URL=redis://127.0.0.1:6379/9 pnpm --filter @arkesoft/api dev`;
  Terminal B — `ARKESOFT_SUPERADMIN_E2E_PORT=5274 ARKESOFT_SUPERADMIN_DEV_API_TARGET=http://127.0.0.1:3100 pnpm --filter @arkesoft/superadmin test:e2e`.
- `docker ps` sayısı: ölçüm öncesi/sonrası **25** (değişmedi, kullanıcının
  konteynerlerine dokunulmadı).
- Load avg: ölçüm öncesi `2.96 6.06 7.49`, e2e koşumu sonrası `4.40 5.62 7.11`.
- An: 2026-11-19 11:21–11:23 (yerel saat, +03).
- Redis DB 9 `DBSIZE`: ölçüm öncesi **8**, sonrası **28** (S6'nın "önce 0, sonra 23"
  ölçümünden farklı taban — bu DB kalıcı bir test havuzu, taban zamana göre
  değişir; **silinmedi**, ADDITIONAL_TRUSTED_ORIGINS ortam override'ı yalnızca
  kabukta kaldı, kök `.env` değiştirilmedi).
- Dev sunucusu temizliği: arka plan süreçleri (`sh` sarmalayıcı + `tsc --watch`
  + `node dist/main.js`, 3 PID) testler bittikten sonra `kill` ile durduruldu;
  port 3100 serbest, kullanıcının 3000/5173/5174 portlarına hiç dokunulmadı
  (ölçüldü: `lsof -i :3100` boş, `lsof -i :3000 -i :5173 -i :5174` 4 satır —
  kullanıcının kendi süreçleri, öncesiyle aynı).
- Bilinen eski süreç `pid 29693` (sahibi belirsiz `tsc --watch`) ve kullanıcının
  `demo-site` (pid 12878, port 3000) hiç dokunulmadı.

---

## 6. DOĞRULANAMADI

1. **ADR-0026'nın içeriği** — dosya henüz **mevcut değil**; architect'in tasarımında
   bu dosyanın yazımı açıkça `docs` ajanına atanmış (modül yerleşimi tablosu) ve
   iş akışı sırasına göre `docs` adımı bu gate'lerden **SONRA** gelir. Bu yüzden
   AC-32'nin "karar ADR notuna yazıldı" yarısı bu turda **ölçülemedi** (bulgu
   olarak YAZILMADI — zamanlaması beklenen; eksikse `docs` turunda yakalanmalı).
2. **Bilinen flake oranının (%6.7) bu örneklemde ölçülememesi.** İki ardışık
   `test:isolation` koşumu (117 test) yeşil geldi; bu, AGENT_BASELINE §4 ders 1'in
   uyardığı gibi flake'in YOKLUĞUNU KANITLAMAZ — yalnızca bu iki koşumda
   gözlenmedi.
3. **`pnpm test:contract`, `pnpm test:e2e` (kök), `pnpm test:visual`** — Task'ın
   AC listesinde YOK (architect: `packages/trpc` dokunulmadı ⇒ sözleşme sabit;
   `wcag`/`perf` gate'leri DOM/performans yüzeyi olmadığı için gerekçeli
   ATLANDI) ⇒ bu turda koşturulmadı, "bu Task kapsamında istenmedi" olarak
   kabul edildi, "bu sürümde henüz yok" DEĞİL.
4. **Üretim tarayıcı dağılımı / gerçek staging ortamı** — security gate'in zaten
   işaretlediği sınır, bu turda tekrar ölçülmedi (kapsam dışı, security'nin işi).
