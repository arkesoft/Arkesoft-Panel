# T-019 — `solid` gate, TUR 1

- **Tarih:** 2026-11-14 · **Sürüm:** ROADMAP v0.1.0 · **Dal:** `feat/v0.0.21-surum-kayit-modeli`
- ⚠ **Ayrıntı, negatif kanıtlar, "temiz çıkan eksenler" ve DOĞRULANAMADI listesi:**
  `docs/gates/T-019-solid-tur1.md` (Orkestratör'ün brief'inde istenen kanonik yol).
  Bu dosya `AGENT_BASELINE §3.2`'nin denetim kaydıdır; **tek doğruluk kaynağı yukarıdaki
  dosyadır**, ikinci kez açıklama yazılmadı (çift kopya sapması önlendi).

```
GATE: solid
SONUÇ: FAIL
BULGULAR:
  - [SEV: medium] apps/admin/src/routes/_auth.kayit.tsx:49-85 — `_auth.sign-in.tsx:70-90`'ın birebir kopyası (aynı fonksiyon adları, aynı Zod `type` literalleri); üçü de modül-private ve `.tsx` içinde ⇒ `vitest.config.ts:21`'in `*.test.ts` include'u yüzünden yapısal olarak test edilemez — ortak saf `.ts` modülüne terfi et — frontend
  - [SEV: medium] apps/admin/src/features/registration/OnboardingChecklistCard.tsx:75-77 — `pendingBanner` sorgu durumundan bağımsız, koşulsuz render ediliyor; yükleniyor VE hata dallarında da kiracı durumu hakkında iddia basıyor (hata dalıyla çelişiyor), `seed.ts:206`'nın `active` demo kiracısı için yanlış — banner'ı `isSuccess` dalına taşı + e2e:336-340 pinini güncelle — frontend
  - [SEV: medium] packages/db/src/tenant-context.ts:142 — `PlatformTenantWriter` `plan` delegesine TAM DML veriyor, doc "OKUMASI için" diyor; `withTenant()` callback'i `plan`'ı hiç görmez ⇒ `withNewTenant()` bu eksende YENİ yetki veriyor — `plan`'ı `Pick<…,'findUnique'>`'a daralt (olmazsa doc'u düzelt) — db
  - [SEV: medium] apps/api/src/__tests__/helpers/create-test-app.ts:134-151 — "üçüncü fail-closed kapı" atomik değil (GET→SET TOCTOU, eşzamanlı başlangıçta İKİ koşum da flush eder) + pid yeniden kullanımı yanlış-pozitif üretir + marker koşumdan 120 sn uzun yaşar — `SET … NX` + dönüş kontrolü, pid sahipliği doğrulaması — backend
  - [SEV: low] packages/tenancy/src/slug.ts:64-80 — `TURKISH_CASE_FOLD` anahtarları ile `TURKISH_CASE_FOLD_SOURCE` karakter sınıfı iki paralel liste; sapma sessiz no-op — regex'i `Object.keys()`'ten üret — backend
  - [SEV: low] apps/api/src/auth/rate-limit/trpc-rate-limited-paths.ts:38-40 — `isTrpcRateLimitedPath` ölü export (repoda tek eşleşme kendi tanımı) — sil — backend
  - [SEV: low] apps/admin/src/features/registration/slug-outcome-message.ts:24,50-67 — `resolveSlugFieldErrorMessage`+`FIELD_ERROR_KEY_BY_OUTCOME` sıfır üretim tüketicisi (canlı ters tablo `store-wizard-controller.ts:85-93`); `SLUG_LIVE_STATUS_MESSAGE_KEY_COUNT` sayacı `satisfies`'in zaten verdiği garantiyi tekrar ediyor — ölü yüzeyi kaldır — frontend
  - [SEV: low] apps/admin/src/api/registration-query.ts:113-116 — `deriveFallbackNameFromEmail`: kalıcı `User.name` alanının DEĞERİ sunum katmanında icat ediliyor (bugünkü zarar ölçülmüş sıfır) — karar architect/ux'e — architect
  - [SEV: low] apps/api/src/__tests__/registration.test.ts:114 — `.catch(() => undefined)` temizlik hatasını sessizce yutuyor (S14'ün artık-satır flake sınıfı) — backend
  - [SEV: low] apps/admin/e2e/registration-flow.spec.ts:326-341 — "yükleniyor" assertion'ı sabit 400 ms sahte gecikmeyle yarışıyor; route'u açık bir promise ile tut — frontend
  - [SEV: low] apps/admin/e2e/helpers/verified-fixture-user.ts:42-54 · apps/admin/e2e/registration-flow.spec.ts:38-53 — dış JSON elle yazılmış EKSİK predicate + `as Record<string, unknown>` ile daraltılıyor (CLAUDE.md §4 Zod şartı); desen önceden var ⇒ ortak Zod zarf parser'ı borç satırı — frontend/docs
  - [SEV: low] apps/admin/src/features/registration/StoreWizard.tsx:58-63 — `resolveStepProgressLabel`: ayrımlı birleşim üzerinde iç içe ternary + sabit `'3'`, `assertNever` tamlık guard'ı yok (CLAUDE.md §4) — frontend
  - [SEV: low] apps/admin/src/features/registration/StoreWizard.tsx:142-151,169-178,242-251 — adım başlığı bloğu üç kez birebir tekrar (4. kopya `_app.kurulum.$slug.tsx:32-38`) — `WizardStepHeader` — frontend
  - [SEV: low] apps/api/src/registration/registration.service.ts:199 — `trialPlanLimits ?? {}`: kritik anlık görüntü kolonunda sessiz varsayılan (testle pinli olduğu için low) — backend
  - [SEV: low] packages/tenancy/package.json:6 — `description` bayat: paket artık slug gramerinin de tek evi — docs
ÖLÇÜMLER: incelenen dosya 41 · üretim kodunda `any` 0 · `@ts-ignore` 0 · gerekçesiz `as` 0 (üretim) / 6 (yeni e2e, elle predicate içinde) · en büyük fonksiyon `StoreWizard()` 238 satır (JSX, karar mantığı dışarıda); en büyük mantık fonksiyonu `RegistrationService.onboardingChecklist()` 51 satır · `TENANT_SLUG_PATTERN` kaynak ağaçlarında tam 1 literal · `app.tenant_id` üretimde tam 1 ev · ölü export 2 · boş `catch` 0
```

**FAIL gerekçesi:** `AGENT_BASELINE §4` — 4 `medium` (≥3 ⇒ FAIL). `critical`/`high` **sıfır**;
dört medium da yerel ve mekanik. Dağıtım: M1+M2 → `frontend`, M3 → `db`, M4 → `backend`.

**Kök `pnpm test` flake'i (devredilen bulgu):** flake'in kendisi `solid`'in kapısı değil
(`qa`/`release`). Hangi testin düştüğü **DOĞRULANAMADI** (Bash yok). Ama S7'nin *tespit*
mekanizması statik olarak kusurlu (M4) ve kök koşumdaki flake'in **yeni sebebi o kapı
olabilir** ⇒ M4 bu turda düzeltilir; üretim sayaç anahtarının süreç kapsamına alınması
(`auth.module.ts`) **teknik borç** kalır; `qa` koşarken `create-test-app.ts:143`'ün hata
metninin çıktıda görünüp görünmediğini raporlamalı.
