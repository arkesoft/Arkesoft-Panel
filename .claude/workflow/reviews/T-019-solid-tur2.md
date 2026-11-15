# T-019 — `solid` gate, TUR 2

- **Tarih:** 2026-11-15
- **Sürüm:** ROADMAP v0.1.0
- **Dal:** `feat/v0.0.21-surum-kayit-modeli`
- **Araç kısıtı:** `Bash` YOK — tüm ölçümler `Read`/`Grep`/`Glob`.
- **Tam gerekçeler, negatif kanıtların uzun gövdesi ve tasarım görüşleri:**
  `docs/gates/T-019-solid-tur2.md` (bu dosyanın birebir kaynağı).

```
GATE: solid
SONUÇ: PASS
BULGULAR:
  - [SEV: medium] apps/api/src/__tests__/helpers/create-test-redis-connection.ts:108 — Q-1'in TÜM kök neden düzeltmesini taşıyan mutasyonun (4000 ms etkin `commandTimeout`) SIFIR pini var; silinse hiçbir test kırılmaz, tek belirti flake'in geri dönmesi — backend
  - [SEV: medium] apps/api/src/__tests__/test-harness-redis-profile-isolation.test.ts:24 — bir `.test.ts`, ikinci bir `.test.ts`'i modül olarak import ediyor ⇒ yabancı 10 test her koşumda İKİNCİ kez koşuyor (3 + 10 = `qa`'nın raporladığı 13) ve yeni kapının kendi ölçümü kirleniyor — backend/qa
  - [SEV: low] apps/api/src/registration/registration.service.ts:200 — yorum VAR OLMAYAN bir dosyaya atıf yapıyor (`plan-limits.schema.ts`), üstelik :75-80 onu bilerek açmadığını yazıyor — backend/docs
  - [SEV: low] apps/admin/src/features/registration/StoreWizard.tsx:55 — `resolveSlugStatusTextColorClassName`'in son dalı `W-1` bölünmesinden sonra ERİŞİLEMEZ hâle geldi (tur 1'de "anlamlı" diye bulgu yazılmamıştı) — frontend
  - [SEV: low] apps/admin/src/features/registration/slug-outcome-message.ts:33 — `resolveSlugLiveStatusMessage` ÜRETİMDE sıfır çağıran (artık yalnızca kendi modülü + test); modülün ÜÇÜNCÜ fazla-geniş export yüzeyi — frontend
  - [SEV: low] apps/admin/src/features/registration/StoreWizard.tsx:191-224 — JSX içinde yalnızca iki değeri destructure etmek için IIFE; çağrı bileşen tepesine taşınabilir (`progressLabel` emsali) — frontend
  - [SEV: low] apps/api/eslint.config.mjs:271-425 — R-P1 invaryantı bu turda 6 blok × 6 kısıtlama (36 el ile tutulan hücre) oldu; invaryantı doğrulayan MEKANİK kapı yok (invaryant bu turda DOĞRU, bulgu doğrulanabilirlik hakkında) — devops/backend
  - [SEV: low] apps/api/src/__tests__/rate-limit-policy.test.ts:153 — runtime doğrulaması olmayan `as [string, string]` (CLAUDE.md §2); dosyadaki aynı desenin 4. kopyası — backend
ÖLÇÜMLER: incelenen dosya 25 (tamamı veya ilgili blokları) · yeni kodda `any` 0 · `@ts-ignore` 0 · `@ts-expect-error` 11 (hepsi gerekçeli tip pini) · runtime doğrulamasız `as`: üretim 0, yeni test kodu 1 · en büyük YENİ fonksiyon `assertSoleRunOwnership()` 63 satır · en büyük dokunulan fonksiyon `StoreWizard()` 238 satır (JSX, DEĞİŞMEDİ) · boş `catch` 0 · tur 1'in 11 `low`'u: 11 DURUYOR, 0 kapandı
```

**FAIL/PASS gerekçesi (`AGENT_BASELINE` §4):** `critical`/`high` 0, `medium` 2 (≤2 ⇒
PASS, borca yazılır), `low` 6. Tur 1'in dört `medium`'undan üçü kapandı, biri
çürütülüp kabul edildi ⇒ kapıyı kapatan bulgu kalmadı.

## Tur 1'in dört bulgusu

| Bulgu | Durum             | Kanıt                                                      |
| ----- | ----------------- | ---------------------------------------------------------- |
| `M1`  | KAPANDI           | beş mutasyon ekseni de kırmızı veriyor; sign-in'de kalıntı yok |
| `M2`  | ÇÜRÜTÜLDÜ (kabul) | `docs/ui/…:233` "her zaman görünür" — kendim okudum         |
| `M3`  | KAPANDI           | tip daraltıldı, 5 negatif pin, doc iki eksene ayrıldı       |
| `M4`  | KAPANDI           | `SET…NX` + 2 Lua betiği; kalıntı risk dosyada yazılı        |

- `M1` mutasyon izi: `:48` bozulursa `test:42`; `:51` (`'invalid_format'`→
  `'invalid_string'`, tur 1'in verdiği senaryo) bozulursa `test:50`; `:54` bozulursa
  `test:62`; `!== undefined` guard'ları kalkarsa `test:56`/`test:69`; `:45` erken
  dönüşü kalkarsa `test:34` düşer. Dosyada **7** `it` var (handoff +8 diyor ⇒ 1 fark
  ölçülemedi).
- `M3` ek doğrulama: `prisma.service.ts:168-173` faz-3 callback'ini
  `TenantTransactionClient`'a daraltıyor ⇒ `packages/db`'nin geniş `TransactionClient`
  imzası `apps/api`'ye sızmıyor; doc'un "`plan`'a yazan ikinci tip yolu yok" iddiası
  **doğru**. SQL ayağı (`R-A6`) ayrımı yazılı — tekrar yazılmadı.

## Tur 1'in 11 `low`'u — 11/11 DURUYOR

`slug.ts:64,80,83` · `trpc-rate-limited-paths.ts:54` · `slug-outcome-message.ts:24,87-104`
· `registration-query.ts:113,135` · `registration.test.ts:114` ·
`registration-flow.spec.ts:328` · `registration-flow.spec.ts:42,46,50,51` ·
`StoreWizard.tsx:58-63` · `StoreWizard.tsx:168-178,257-…` ·
`registration.service.ts:249` (niteliği değişti: iki yeni fırlatma dalından sonra
`?? {}` **erişilemez** oldu ⇒ "sessiz varsayılan" + "ölü dal", hâlâ `low`) ·
`packages/tenancy/package.json:6`.

## Temiz çıkan yeni eksenler

Tekrarın gerçek kapanması (doğru kesim çizgisi: metin çağırana, Zod sözlüğü ortak
eve) · katman/bağımlılık yönü (tek istisna M-B'nin test↔test bağı) · sağlayıcı
dallanması yok, oran sınırı guard'ı gevşetilmemiş · yutulan hata yok, iki yeni
fırlatma loud · yeni testlerde negatif kapsam gerçek (`plan-limits-schema.test.ts`
7 negatif vaka) · tip disiplini (`any` 0; tek `as any` kümesi **üretilen**
`routeTree.gen.ts`) · isimlendirme ve yorum kalitesi (tek bayat yorum = L-A).

## Tasarım sorularına görüş (özet)

- `planLimitsSchema`'nın `registration.service.ts` içinde yaşaması **katman ihlali
  değil**; `AC-13`'ün invaryantı da **fazla katı değil** (tek sabitlik dosya
  allowlist'i, ikinci meşru okuyucu doğduğunda `ReadonlySet`'e çevirmek gevşetme
  değil ifade düzeltmesidir). Bulgu yazılmadı.
- `create-test-redis-connection.ts`'in `ioredis` iç davranışına bağımlılığı **ölçülmüş
  ve belgelenmiş**; alternatifler üretim union'ını kirletirdi ⇒ seçim doğru. Eksik olan
  tek şey o davranışın pini = **M-A**.
- `REDIS_CLIENT` override'ının koşulsuz olması bugün **hiçbir kapsamı silmiyor**
  (üretim profili `redis-connection-profiles.test.ts:254-259`'da bağımsız pinli);
  ayrı bulgu yazılmadı.
- `StoreWizard.tsx`'in iki `<p>`'sinde sunum/mantık ayrımı **korunmuş** (karar saf
  `.ts`'te, mutasyon notlu testi var); kalan iki kusur sunum ekseninde ve `low`.

## DOĞRULANAMADI

`pnpm lint/typecheck/test/test:isolation/build/guards` çıktıları · admin test tabanının
167→175 olması (7 `it` saydım) · M-B'nin çift koşumunun vitest çıktısıyla teyidi
(aritmetik kapatıyor, ham çıktı üretilmedi) · `git show --stat`/`git diff` ·
ESLint `patterns`'ın göreli yollarda fiilen tetiklendiği (`qa` ölçtü, devralmadım).

## ⚠ ÖLÇÜM TUZAĞI (`AGENT_BASELINE` §5 sınıfı)

`Grep`'i **açık `path` vermeden** çağırmak bu oturumda kökü cwd (`apps/api`) olarak
çözdü ve `TURKISH_CASE_FOLD_SOURCE` / `deriveFallbackNameFromEmail` için "No matches
found" döndürdü — "tur 1'in iki `low`'u kendiliğinden kapandı" yanlış sonucu
neredeyse yazılıyordu. Mutlak repo kökü verilerek tekrarlandığında ikisi de yerinde
bulundu. **Kural:** repo geneli iddia üreten her `Grep` çağrısına mutlak `path`
verilecek; boş çıktı, yol doğrulanmadan "yok" sayılmayacak.
