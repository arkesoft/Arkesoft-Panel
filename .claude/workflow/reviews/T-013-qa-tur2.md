# T-013 · `qa` · tur 2 (DAR kapsam)

**Tarih:** 2026-11-03 · **Sürüm:** ROADMAP v0.0.11 (BullMQ kuyruk altyapısı) · **Dal:** `chore/ajan-altyapisi`
**Kapsam:** DAR — tur 1'de PASS verdim, yüzey değişti → yalnızca **Q-1'in kapanışı** + `backend`'in
iddialarının doğrulanması. **Yeni tarama YAPILMADI**, yeni bulgu aranmadı, `low`'lar tekrar
raporlanmadı, M-2 ve R-S7-1'e dokunulmadı.

```
GATE: qa
SONUÇ: PASS
BULGULAR:
  - [SEV: low] apps/api/src/queue/job-runner.ts:329 — R-FIX1-1 DOĞRULANDI (`backend`'in kendi beyan ettiği borç, YENİ bulgu değil): `recordTerminalFailure` hâlâ `where: { id: params.jobId }` ile KOŞULSUZ yazıyor → `completed` bir satır, teorik yeniden teslimde terminal başarısızlık yaşarsa `failed` + dolu `error`'a DÖNEBİLİR ve `completedAt` DOLU KALIR. ⚠ Düzeltilen tel garantisini İHLAL ETMİYOR (kaynak okunarak doğrulandı, gerekçe §6) — `low` kararı YERİNDE. Borç metnine EKLENMESİ gereken nüans: ortaya çıkan `failed` + dolu `completedAt` durumu BEYAN EDİLMEMİŞ ve hiçbir testle pinlenmemiş — simetriyi kurarken o durumu da pinle — backend · vade v0.0.12
ÖLÇÜMLER: aşağıda (§1–§7)
```

**§4 FAIL kuralı:** 0 `critical` · 0 `high` · **0 yeni `medium`** · 1 doğrulanmış `low` → **PASS**.
R-S7-1 (tur 1'in ikinci `medium`'u) bu turda **açılmadı**, ROADMAP borcunda duruyor ve
**çift sayılmamak için yeniden bulgu olarak yazılmadı**; `shutdown.test.ts`'e dokunulmadı.

---

## ⚠⚠ 1 · NET SATIR: **Q-1 KAPANDI.**

Devralma değil — **kendi koşumum ve kendi mutasyonumla** kapandı. Üç ayaklı kanıt:

| Ayak | Ölçüm | Sonuç |
| --- | --- | --- |
| Düzeltme yerinde | `job-runner.ts:522` → `where: { id: jobId, status: { in: [JobStatus.queued, JobStatus.running] } }` — ADIM 3'ün (`:462`) **birebir ikizi** | ✅ |
| Prob yeşil | `qa-job-completed-error-invariant.test.ts` → **2 passed**, exit 0 | ✅ |
| Prob vacuous DEĞİL | Yüklem çıkarıldı → **1 failed / 1 passed**, kırmızı `:267`'de | ✅ |

Tur 1'de kırmızı olan yol (2) artık **yeşil** ve **regresyon testi olarak repoda yaşıyor**.

---

## 2 · (a) BEKLENTİLER GEVŞETİLDİ Mİ, KESKİNLEŞTİRİLDİ Mİ → **KESKİNLEŞTİRİLDİ**

`backend`'in iddiasını **kaynağı okuyarak** değerlendirdim. Yol (2)'nin assert'leri tur 1 → tur 2:

| Assert | Tur 1 (benim kırmızı probum) | Tur 2 (repoda) | Değerlendirme |
| --- | --- | --- | --- |
| `afterTerminal.status` | `failed` | `failed` | korundu |
| `afterTerminal.error` | not null | not null | korundu |
| `publishedEnvelopes` | 1 | 1 | korundu |
| `handlerCalls` | 2 | 2 | korundu |
| **Tel değişmezi (çift)** | **yok** | `not.toEqual({ isCompleted: true, hasError: true })` | ⬆ **EKLENDİ** |
| `status` | `toBe(completed)` | `toBe(failed)` | **değişti** (aşağıda) |
| `progress` | yok | `toBe(0)` | ⬆ **EKLENDİ** |
| `completedAt` | yok | `toBeNull()` | ⬆ **EKLENDİ** |
| `error` | `toBeNull()` | `not.toBeNull()` | **değişti** (aşağıda) |
| `publishedEnvelopes` (son) | yok | `toHaveLength(1)` | ⬆ **EKLENDİ** |

**Assert sayısı 7 → 10.** Dört assert **eklendi**, hiçbiri kaldırılmadı.

### İki değişen assert neden gevşetme DEĞİL

Tur 1 bulgumda **iki düzeltme yolu** önermiştim — birebir alıntı:
*"ADIM 5'e ADIM 3'ün durum yüklemini ekle **(ve/veya `error`'ı temizlenebilir kıl)**; alternatif:
yorumu dürüstçe daralt"*. `backend` **birinci yolu** seçti (+ beyanı daralttı).

- `expect(status).toBe(completed)` **kusurun fotoğrafıydı** — "ADIM 5 koşulsuz yazdı" olgusunu
  pinliyordu, bir **gereksinimi** değil. Düzeltmeden sonra doğru beklenti "terminal satır geri
  çevrilmedi"dir.
- `expect(error).toBeNull()`, **seçilmeyen** yolun (hata kolonunu temizleme) beklentisiydi. Seçilen
  yolda doğru beklenti `not.toBeNull()` — ve bu **daha kısıtlayıcıdır**: terminal sonucun
  korunduğunu da zorlar.
- Yerine gelen **çift üzerinden doğrudan değişmez assert'i**, iki alanı durumdan türetmeden
  ölçüyor ve **ilk sırada** duruyor → yüklem bir gün kaldırılırsa dosyanın ilk kırmızısı
  **değişmezin kendisi** olur. Bunu mutasyonla **ölçtüm**: kırmızı tam o satırda (`:267`).

**Karşılanmayan garanti bırakılmadı:** `job-summary.schema.ts` artık garantiyi iki mekanik
dayanağıyla yazıyor **ve** garanti edilmeyeni (*"terminal muhasebeden sonra başaran iş `failed` +
dolu `error` kalır"*) açıkça söylüyor. Beyan ile test **aynı şeyi** söylüyor.

---

## 3 · (b) YOL (1) DEĞİŞMEDİ — `backend`'in yöntemi doğrulandı, **artı bağımsız ikinci çapa**

`backend`'in gerekçesi doğru: dosya git'te **untracked** (`git status` → `?? qa-job-...test.ts`),
bu yüzden `git diff --stat` **boş döner ve yanıltıcıdır**. `diff -u` yöntemi yerinde.

**(i) `backend`'in çapası** — `backend-fix1/qa-probe.test.ts.orig` vs repo: **tam iki hunk**
— `@@ -13,17 +13,21 @@` (dosya başı yorumu) ve `@@ -203,4 +207,72 @@` (**dosya sonuna saf ekleme**).
Yol (1)'in `it` bloğunda **tek `-` satırı yok**. ✅

**(ii) ⚠ KENDİ bağımsız çapam** — `backend`'in yedeğine güvenmedim. Tur 1'de **kendi**
scratchpad'ime bıraktığım `m1-probe-full.test.ts.bak` (md5 `d3c3d73449c8b9658d42ace061b9e9ba`,
tur 1 raporumdaki değerle **birebir aynı**, `backend`'in hiç erişmediği dosya) içindeki yol (1)
gövdesini repodaki gövdeyle karşılaştırdım:

```
--- tur1 scratch path(1) BODY      +++ repo path(1) BODY
@@ -31,6 +31,8 @@
     // ARA denemeler terminal DEĞİL → `Job.error` HİÇ yazılmadı, DLQ zarfı YOK.
+    // ⚠ Satır denemeler arasında `running` KALIYOR (`queued`'a geri DÖNMÜYOR) —
+    // ölçüm, varsayım değil.
```

**Tek fark iki satırlık bir YORUM** — onu da tur 1'de nihai hâli yazarken **ben** ekledim.
**Her `expect(...)` satırı bayt-birebir aynı.** İki bağımsız çapa aynı sonucu veriyor. ✅

---

## 4 · (c) MUTASYON — fiilen uygulandı, kırmızı görüldü, **md5 ile birebir geri alındı**

Mutasyon **yalnızca ADIM 5'in** satırına uygulandı (`perl` ile `$. == 522` hedefli);
ADIM 3'ün (`:462`) birebir aynı metinli satırı **kasıtlı olarak korundu** ve doğrulandı.

| Adım | Eylem | `job-runner.ts` md5 | Prob sonucu |
| --- | --- | --- | --- |
| 1 | Pristine | `d057ee8629f98bd2eb271c68435de190` | **2 passed** (exit 0) |
| 2 | `:522` → `where: { id: jobId },` | `7e74eb55e1174033ceb12c90f5e70fbe` | **1 failed / 1 passed** (exit 1) |
| 3 | md5 ile geri alma | `d057ee8629f98bd2eb271c68435de190` ✅ **birebir** | **2 passed** (exit 0) |

Ölçülen kırmızı — **doğrudan değişmezin kendisi**, `backend`'in beyanıyla birebir:

```
FAIL src/__tests__/qa-job-completed-error-invariant.test.ts >
  TERMİNAL başarısızlıktan sonra yeniden teslim → satır terminal KALIR, …
AssertionError: expected { isCompleted: true, hasError: true } to not deeply equal
                         { isCompleted: true, hasError: true }
 ❯ src/__tests__/qa-job-completed-error-invariant.test.ts:267:12
```

⚠ **Yol (1) mutasyon altında YEŞİL kaldı** — tur 1 ölçümümle **birebir aynı**. Bu beklenen:
yol (1) ara denemeleri ölçer, ADIM 5'in yüklemi o yolda devreye girmez.

⚠ **VACUITY — `backend`'in tenantId probunu TEKRARLAMAYA GEREK KALMADI:** mutasyonun kırmızı
vermesi, ADIM 5'in o satıra **gerçekten ulaşıp yazdığını** zaten kanıtlıyor (ulaşmasa mutasyon
etkisiz kalırdı). Bu, `backend`'in sahte-payload probundan **daha güçlü** bir kanıt.

⚠ **Ölçüm disiplini:** `packages/trpc` değiştiği için **ölçmeden önce `turbo run build --force`**
koştum (tur 1'in bayat `dist` tuzağı); tüm turbo komutları **`--force`** ile (FULL TURBO tuzağı).

---

## 5 · (d) AC11 TAM KAPI — **kendi koşumum, `--force`, 0 cached**

| # | Komut | Exit | Önbellek | Ölçüm |
| -- | --- | --- | --- | --- |
| 1 | `turbo run lint --force` | **0** | **0 cached / 21** | 21/21, 16.088s |
| 2 | `turbo run typecheck --force` | **0** | **0 cached / 21** | 21/21, 6.166s |
| 3 | `turbo run test --force --concurrency=1` | **0** | **0 cached / 18** | 18/18, **1151 test**, 1m25.691s |
| 4 | `turbo run test:isolation --force` | **0** | **0 cached / 10** | 10/10, **34 test** (db 21 + api 13) |
| 5 | `turbo run build --force` | **0** | **0 cached / 13** | 13/13, 4.418s |
| 6 | `pnpm format:check` | **0** | — | *All matched files use Prettier code style!* |

**Eşikler karşılandı:** `pnpm test` ≥1151 → **1151** ✅ · `test:isolation` ≥34 → **34** ✅

### `pnpm test` paket kırılımı (toplam 1151)

```
@arkesoft/theme-sdk   223     @arkesoft/trpc          48
@arkesoft/ui           23     @arkesoft/db           172
@arkesoft/errors       48     @arkesoft/api          431   (tur1 430 → +1)
@arkesoft/tenancy      39     @arkesoft/admin         37
@arkesoft/themes-mod.   5     @arkesoft/storefront   125
                              ------------------------------
                              TOPLAM                1151
```

**0 skipped · 0 todo** — iki bağımsız kontrol: (a) özet satırlarında `skip|todo` eşleşmesi **0**;
(b) kaynak taraması `\.(skip|only)\(|skipIf|todo\(` → T-013 test dizinlerinde **0 eşleşme**.
**Eşik düşürülmemiş, susturma yok.**

**Isolation +1 doğrulandı:** api 12 → 13; eklenen `queue-tenant-context.isolation.test.ts:350`
**blok (6)** — *"sarmalayıcının KENDİ durum yazımları kiracıya kapsamlı: A payload'ı B'nin işini
`completed` YAPAMIYOR"* → sarmalayıcının kendi yazımları için **çapraz YAZMA** testi. Gerçek bir
tenant izolasyon yazma probu, sayı şişirmesi değil. ✅

---

## 6 · (e) AC4 ve AC6 — düzeltme ADIM 5'e dokundu, **ikisini de kendim koşturdum**

`vitest run --reporter=verbose queue-happy-path.test.ts queue-dlq.test.ts` → **exit 0 · 20 passed / 2 dosya**
(`queue-enqueue.test.ts` de dahil edilince **39 passed / 3 dosya**, exit 0).

**AC4 — kritik olan: yüklem mutlu yolu ENGELLEMİYOR:**
- ✓ `iş completed oluyor; progress 100, startedAt ve completedAt DOLU`
- ✓ `durum geçişi İDEMPOTENT: aynı iş İKİ KEZ koşuyor, startedAt KORUNUYOR (K1.c)`
- ✓ `TERMİNAL olmayan satır completed/failed iken running'e GERİ ÇEVRİLMİYOR`
- ✓ `reportProgress MONOTON: geri gitmek 0 satır günceller, 100'e KIRPILIR`

**AC6 — 4/4 yeşil:** 3 deneme → DLQ'da 1 kayıt + `failed` + 4. deneme yok · `isRetryable: false`
hiç yeniden denenmiyor · `AppError` olmayan hata gövdesi jenerik · şemayı karşılamayan payload
yeniden denenmiyor.

**AC4/AC6 REGRESYON YOK.** ✅

---

## 7 · (f) R-FIX1-1 `low` MU → **EVET, `low` DOĞRU**

**Tek iddia, tek değerlendirme** (yeni yüzey taranmadı). `backend`'in gerekçesi:
*"düzeltilen tel garantisini ihlal etmez"*. **Kaynağı okuyarak değerlendirdim: gerekçe DOĞRU.**

Garantinin metni: *"`status === 'completed'` ile dolu bir `error` birlikte GÖRÜLEMEZ"* — bir
**birliktelik (conjunction)** iddiası.

`recordTerminalFailure` (`:327-331`):
```ts
where: { id: params.jobId },                                        // koşulsuz
data:  { status: JobStatus.failed, error: toJsonErrorBody(errorBody) },  // AYNI yazma
```

- Hata kolonunu yazan **tek yol** burası ve **aynı yazmada** `status`'u `failed` yapıyor →
  hata yazıldığı anda durum **`completed` değil**. Koşulsuz `where` bu dayanağı **zayıflatmıyor,
  GÜÇLENDİRİYOR**: önceki durum ne olursa olsun ikisi **atomik olarak birlikte** yazılıyor.
  Bu, beyandaki **mekanik dayanak (1)**'in birebir kendisi.
- `completed` yazan tek yol ADIM 5 ve artık `queued|running` yüklemli → dolu bir `error`'ın
  üzerine `completed` **yazılamaz** (**dayanak (2)**, mutasyonla ölçüldü).
- Tüm sıralamalarda (`completed` → terminal başarısızlık → yeniden teslim → başarı) sonuç
  `failed` + error'da **kilitli** kalıyor; `completed` + dolu error **ulaşılamaz**.

**→ Tel garantisi ihlal EDİLMİYOR.** Dolayısıyla `high`/`medium`'a yükseltmek için handoff'un
koyduğu koşul (*"eğer ihlal ediyorsa bu `low` değil"*) **gerçekleşmedi**.

**Dürüst nüans (borç metnine eklenmeli, YENİ bulgu değil):** asimetrinin ürettiği durum
`failed` + dolu `error` + **dolu `completedAt`**. Şemanın tamamını okudum — `completedAt`
`z.iso.datetime().nullable()`, `status` ile **hiçbir korelasyon beyan edilmiyor**, dolayısıyla
yazılı bir garanti ihlali yok; ama bu durum **beyan edilmemiş ve hiçbir testle pinlenmemiş**.
Simetri v0.0.12'de kurulurken o durumun da pinlenmesi gerekir. Tur 1'deki Q-1'den farkı net:
Q-1 **versiyonlanan bir birimin YAZILI garantisini** çürütüyordu (→ `medium`), bu ise yazılı
hiçbir şeyi çürütmüyor (→ `low`).

---

## 8 · (g) ORTAM — temiz, artık bırakılmadı

```
Redis DBSIZE = 3
  arkesoft:queue:tenant.provision:meta            TTL -1  (A-S5-1'in yapısal beklentisi)
  arkesoft:queue:tenant.provision.dlq:meta        TTL -1
  arkesoft:queue:tenant.provision:stalled-check   TTL 2s  ← BullMQ'nun geçici muhasebe
                                                    anahtarı (AC4/AC6 koşumumun artığı),
                                                    KENDİ KENDİNE düşer — sızıntı DEĞİL
askıda iş: tenant.provision + .dlq × wait/active/delayed/failed → 8/8 BOŞ (LLEN=0, ZCARD=0) ✅

job tablosu — ⚠ DOĞRU ROLLE ölçüldü (Orkestratör'ün üçüncü tuzağı):
  SELECT current_user, rolbypassrls → arkesoft | t      ← bypass YETKİSİ doğrulandı
  TOPLAM: 1 satır
  h8vxzdu17sn1fi34xgabemc8 | g76qz8ph7o8f6tfvdmerqem1 | tenant.provision | queued | 0
    | 2026-11-03 14:07:38.438+00
  → S5'in BİLİNEN artığı; id ve zaman damgası tur 1'dekiyle BİREBİR aynı. SİLİNMEDİ.
  → YENİ bayat satır YOK. Kendi probumun `test.qa-error-invariant-probe` satırları YOK
    → `afterAll` temizliği çalışıyor (prob 3 kez koştu, 0 artık).

Üretim kodu: job-runner.ts md5 = d057ee8629f98bd2eb271c68435de190 (pristine ile BİREBİR)
FLUSHALL / FLUSHDB / CONFIG SET / migrate reset        → 0 (hiç çalıştırılmadı)
Dokunulmayan yasak listesi: shutdown.test.ts · worker-shutdown.test.ts ·
  fixtures/shutdown-child.ts · ROADMAP.md · CHANGELOG.md · docs/** · .env · main.ts
  → hepsi değişmemiş. git commit/push YOK.
```

**Flaky kontrolü (dar):** prob 3 koşum (pristine/mutasyon/geri alma) — yol (1) **3/3 yeşil**;
AC4/AC6 **2 koşum** (39 passed, 20 passed) — ikisi de exit 0; tam süit 1 koşum.
**Flaky davranış ÖLÇÜLMEDİ.**

**Bu turda değiştirdiğim dosya:** YOK. Mutasyon geçici, md5 ile birebir geri alındı.
🚫 Üretim kodunda kalıcı tek satır değişiklik yok.
