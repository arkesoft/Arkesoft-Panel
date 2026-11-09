# T-016 · `perf` gate · tur 1 — PASS (2 low)

> ⚠ Bu dosyayı **Orkestratör** yazdı: `perf` ajanının araç setinde `Write` yok.
> İçerik ajanın handoff raporundan birebir.

## SONUÇ: PASS — `critical`/`high`/`medium` **yok**, 2 `low`

## K1 (architect koşulu) — ÖLÇÜLDÜ, İDDİA DOĞRULANDI

`auth.guard.ts:150-157` + `two-factor-compliance.service.ts:81-97`:

| Rol | AuthGuard'ın **ek** sorgusu (R2 üyelik sorgusu hariç) |
| --- | --- |
| owner **değil** | **0** — `if (membership.role === owner)` **yapısal olarak** atlanır |
| owner + politika **kapalı** | **1** — `tenant.findUnique` (PK okuma) |
| owner + politika **açık** | **2** — + `user.findUnique` (PK okuma) |

Canlı kanıt: `auth-guard-two-factor-enforcement.test.ts` **15/15** (gerçek Postgres+HTTP),
içinde *"politika KAPALI → `userFindUnique` **toHaveBeenCalledTimes(0)**"* (`:106-110`) ve
*"YAKIN-IŞKA: owner DEĞİL + politika AÇIK + 2FA KAPALI → **403 ALMAZ** (200)"* (`:327`).
`TwoFactorComplianceService` **singleton** (`grep -n "Scope"` → 0 satır → varsayılan
`DEFAULT`, istek başına kurulmuyor).

**⚠ K1 DIŞI AMA AYNI SINIF (Orkestratör'ün özel uyarısı doğrulandı):** `session.me` artık
`SessionSecurityReadPort` → `user.findUnique` ile **1 yeni PK okuması** yapıyor ve bu
**rol/politika fark etmeksizin HER çağıran için** çalışıyor. ADR'nin kendi yorumu bunu
kabul ediyor: *"DB okuması YOK iddiası bu TEK alan için geçerliliğini kaybetti."*
`_app.tsx`'in `beforeLoad`'ında `staleTime:'static'` ile cache'lendiği için **sayfa/sekme
açılışında bir kez** + üç `invalidate` noktasında tetikleniyor → **döngüsel/N+1 değil**,
sabit maliyetli PK okuması. → `low` bulgu (aşağıda).

## K2 (po koşulu) — ÖLÇÜLDÜ, ham çıktı

```
[bundle-budget] paylaşılan çekirdek — JS (gzip): 134.81 KiB, CSS (gzip): 3.96 KiB
[bundle-budget] kimlikli ilk ekran (/) — JS (gzip): 179.39 KiB / bütçe 250.00 KiB (%71.8, rezerv 70.61 KiB)
[bundle-budget] kimlikli ilk ekran (/) — CSS (gzip): 3.96 KiB / bütçe 50.00 KiB (%7.9, rezerv 46.04 KiB)
[bundle-budget] kimliksiz ilk ekran (/sign-in) — JS (gzip): 161.31 KiB / bütçe 250.00 KiB (%64.5, rezerv 88.69 KiB)
[bundle-budget] kimliksiz ilk ekran (/sign-in) — CSS (gzip): 3.96 KiB / bütçe 50.00 KiB (%7.9, rezerv 46.04 KiB)
[bundle-budget] MAKSİMUM — JS (gzip): 179.39 KiB / bütçe 250.00 KiB (%71.8, rezerv 70.61 KiB)
[bundle-budget] MAKSİMUM — CSS (gzip): 3.96 KiB / bütçe 50.00 KiB (%7.9, rezerv 46.04 KiB)
```
İki bağımsız koşumda (cache hit **ve** `--force` ile cache-bypass) **birebir aynı**.
`DELIBERATELY_LAZY_ROUTE_SRCS.length === 1` pini
(`scripts/__tests__/check-bundle-budget.test.ts:136`) gerçek listeyle **tutarlı**.

**Tembel rota gerçekten ayrı chunk** (manifest okumasıyla): `isDynamicEntry: true`,
`_app.hesap.guvenlik-D1E4Puvm.js` (**19.81 kB** raw / **5.22 kB** gzip), `index.html`
entry'sinin **statik** `imports` kapanışında **DEĞİL**, yalnızca `dynamicImports`'ta.
⚠ Ölçülmüş mekanizma: `check-bundle-budget.ts:179-203` yalnızca **statik** `imports` BFS
yapıyor, `dynamicImports` **izlenmiyor** → MAKSİMUM hesabı bu dosyayı **saymıyor**.
(Orkestratör doğruladı: dosya diskte mevcut, 19812 bayt.)

## Radix bundle katkısı — ÖLÇÜLDÜ (geçici deney, GERİ ALINDI)

`role:"dialog"` dizesi (dropdown-menu'de **yok**, dialog'a özgü) minified çıktıda
**yalnızca** `_app.hesap.guvenlik-D1E4Puvm.js` içinde — ana bundle'da, paylaşılan
`@arkesoft/ui` dist'inde ve ilk boya chunk'ında **yok**.

Deney: `ConfirmDialog.tsx`'teki Radix importu geçici olarak düz `<div>`'e indirgendi:
```
ilk ekran JS : 179.02 KiB  (önce 179.39 — Δ 0.37 KiB, gürültü seviyesi)
guvenlik chunk: 3.62 KiB   (önce 5.22  — Δ ≈1.60 KiB)
```
→ **Radix'in ~1.6 KiB'ı tembel chunk'ta; ana bundle'a sızma YOK.**
**Geri alma:** `shasum -a 256 ConfirmDialog.tsx` deney öncesi/sonrası **birebir**
(`28168371a8368dc6…`) — ⭐ Orkestratör **bağımsız doğruladı, aynı hash**.
Rebuild sonrası MAKSİMUM tekrar **179.39 KiB**.

## ALTI ÖLÇÜM BAŞLIĞI

1. **Bundle** — ölçüldü, sorun yok (ham çıktı + manifest BFS + Radix deneyi).
2. **N+1 / ek sorgu** — ölçüldü, sorun yok; ölçeklenen bir N+1 **değil** (yukarıdaki tablo,
   15/15 + 11/11 canlı test).
3. **Oran sınırı maliyeti** — ölçüldü, sorun yok. Her 2FA isteğinde **2** Redis `EVAL`
   (IP her zaman + hesap varsa); her `EVAL` **tek** Lua betiği (`INCR` + şartlı `EXPIRE` +
   `PTTL`) = **tek round-trip**. Desen K3'ün orijinal 4 rotasıyla **aynı**, 6 yeni rotaya
   genişledi (4→10) ama **istek başına maliyet artmadı**. `two-factor-scope-cookie.ts`
   ayrıştırması **yalnızca** 2 rota için; `resolveRateLimitPolicy` eşleşmezse `canActivate`
   anında `return true` → *"her istekte"* **değil**; in-memory `split(';')`, **I/O yok**.
4. **Önbellek stratejisi** — ölçüldü, sorun yok. `retry:false` + `refetchOnWindowFocus:false`;
   `session.me` `staleTime:'static'` → sayfa içi gezinmede **tekrar istek yok**.
   `invalidateSessionIdentity()` tam **3** çağrı (`sign-in.tsx:139`,
   `TwoFactorSetupWizard.tsx:71`, `TwoFactorStatusCard.tsx:78`) — üçü de **gerçek durum
   değişikliği**; gereksiz refetch **bulunamadı**.
5. **Gereksiz client JS** — ölçüldü, sorun yok. Astro `client:*` **N/A** (admin Vite+React;
   `apps/storefront`'a **hiç** dokunulmadı — `git status`'ta **0** satır).
6. **`ChallengeCountdown`** — `DOĞRULANAMADI`: **profiler/render-count ölçülmedi**.
   Statik: `secondsRemaining` state **bileşene lokal** → React modeline göre üst bileşeni
   yeniden render **etmez**; `onExpire` `useRef` ile tutuluyor, bağımlılık zincirine
   girmiyor. **Çerçeve garantisi, gerçek ölçüm değil** → `low`.

## BULGULAR (2 low)

- **low** · `session.router.ts:21-27` + `session-security-read.port.adapter.ts:32-39` —
  `session.me` **tüm roller için** 1 yeni PK okuması yapıyor (K1 tanımı dışında, aynı
  mimari sınıf). Tek indeksli PK; test loglarında istek süreleri **0-4 ms**.
  ⚠ Formel p95 `DOĞRULANAMADI` (k6 koşulmadı). → `backend`/`docs` (ROADMAP borcu)
- **low** · `ChallengeCountdown.tsx:32,42-49` — saniyelik local-state; profiler ölçümü yok.
  Öneri: render-count testi. → `frontend`/`qa`

## ÖLÇÜLEMEYENLER (dürüst sınırlar)
- **Core Web Vitals (LCP/INP/CLS):** Lighthouse CI altyapısı repoda **yok**
  (`find . -iname "lighthouserc*"` → **0**) **ve** bu Task `apps/storefront`'a dokunmuyor.
- **API/arama p95:** k6 yük testi **koşulmadı**. Gözlemsel `durationMs` 0-206 ms (tek
  istekli ortam, **yük altında değil**) → p95 iddiası için **yeterli değil**.
- **Admin ilk yük** (<300 KiB hedefi): **179.39 KiB** → bütçe içinde (kendi 250 KiB
  bütçesinin **%71.8**'i).

## HİJYEN
`git status --porcelain` **131 → 131** (değişmedi; `dist/` `.gitignore`'da).
Arka plan süreci **başlatmadı** (tüm komutlar `build`/`vitest run` olarak tamamlandı).
⚠ Port 3000'deki **kullanıcının yabancı süreci (PID 11734)** ve bu gate tarafından
**başlatılmamış** `turbo run dev` süreçleri (PID 34252/34270/34278) **dokunulmadı**.
