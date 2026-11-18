# T-024 — `solid` gate, tur 2 (DAR)

> Bu dosyayı **Orkestratör** yazdı: `solid` ajanının dosya yazma yetkisi yok ve bu turda
> "hiçbir depo dosyasını değiştirme" kısıtı vardı (AGENT_BASELINE §5). İçerik ajanın
> handoff paketinden birebir alınmıştır.

```
GATE: solid
SONUÇ: PASS
KAPSAM: DAR (tur 2) — yeni tam tarama YAPILMADI. Denetlenen: M1/M2 kapanışı,
        iki "yolu üstünde" low, değişen satırların kendi eksenlerime etkisi.
```

**Kapsam gerekçesi:** tur 1'de `PASS` verildi, yüzey değişti (`scripts/playwright/a11y.ts`
496 → 581 satır, ölçüldü) ⇒ `WORKFLOW.md` yeniden koşum tablosu → **DAR**.

## Bulgular

| Önem       | Yer                                                                                                          | Özet                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Sorumlu    | Vade        |
| ---------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------- |
| **medium** | `scripts/playwright/a11y.ts:166`                                                                             | M2'nin iddia düzeltmesi **yarım** kapandı. Dosya başı (`:44-56`) "yapısal olarak imkânsız" önermesini çürütüp "koşum kapsamına bağlı"ya çevirdi, ama `ALLOWED_VIOLATIONS`'ın **kendi docblock'u** çürütülen önermeyi **aynen** taşıyor. Girdi eklemek isteyen geliştiricinin vardığı ilk yer 105 satırlık başlık değil, sabitin docblock'udur ⇒ "imkânsız" diye okur, tam `pnpm test:e2e` disiplinini atlar. `security` tur 1'in F3/d bulgusunun kapatılmamış ikinci örneği. | `frontend` | bu tur      |
| low        | `apps/admin/e2e/a11y-helper-self-test.spec.ts:62,161`                                                        | low #6 düzeltme yorumları `a11y.ts:479` / `:482` diye atıf veriyor; dosya aynı fix'te 496 → 581 satıra büyüdüğü için **iki atıf da bayat**. Gerçek satırlar: ihlal dalı `:558`, incomplete dalı `:561`. `:479-482` bugün `staleAllowlistEntries` filtresini gösteriyor — atıf **yanlış bir yere** işaret ediyor, boşluğa değil.                                                                                                                                    | `frontend` | `v0.0.20.5` |
| low        | `scripts/playwright/a11y.ts:507-511,569-574` (tüketici: `apps/admin/e2e/accessibility.spec.ts:137-140`)      | Yeni `staleAcknowledgedEntries`, üç ack girdisinin **her koşumda** eşleşmesini zorunlu kılıyor. Önceden bir `incomplete`'in gelmemesi zararsızdı; artık **kırmızı**. Fail-closed yönü **doğru** (bilerek), ama iyi huylu bir belirsizliği sert hataya çeviriyor: spec `expect(dialog).toBeVisible()`'dan sonra tarıyor, Radix overlay'in animasyon/montaj durumuna bağlı bir `color-contrast` incomplete'i kaçarsa test "bayat girdi" diye kırılır. **Ölçülmedi.**      | `qa`       | `v0.0.20.5` |

⚠ Son `low` için ajanın notu: *"gelmiyorsa girdiyi değil, **taramanın bekleme noktasını**
düzelt — ack'i silmek susturma olur."*

## M1 — `targetSnippets` redaksiyonu: **KAPANDI**

- **Tek kısıtlama noktası mı?** Evet. `redactSensitivePatterns()` (`:335-338`) eşleme-maskeleme
  mantığının tek sahibi; `redactAxeDetail()` (`:359`) ve `formatResultSummary()` (`:401`)
  ikisi de onu çağırıyor. Depo genelinde grep: `***@***` / `[REDACTED-FIXTURE]` / `replaceAll`
  yalnızca `a11y.ts`'te — **ikinci redaksiyon kopyası yok**.
- **Mesajın tüm dize kaynakları sayıldı mı?** `formatResultSummary` (`:397-415`) altı kaynaktan
  kuruluyor: `result.id`, `impact`, düğüm sayısı, `helpUrl` (dördü axe'ın sabit sözlüğü/sayı,
  kullanıcı verisi taşıyamaz), `targetSnippets` ✓ redakte, `failureSummary` ✓ redakte.
  `expectNoAccessibilityViolations`'ın eklediği satırlar (`:555`, `:563-574`) yalnızca `scanName`
  (kapalı birleşim) + `ruleId`/`reason` (depoda statik) taşıyor. **Kaçan axe-kaynaklı dize yok.**
- **Kesme sırası?** İki yerde de redaksiyon **önce**: `:401` `truncate(redactSensitivePatterns(...), 80)`,
  `:359` `truncate(redactSensitivePatterns(input), 200)`.
- **Etkinlik ölçümü (teorik değil):** `createVerifiedFixtureUser` (`verified-fixture-user.ts:50`)
  `e2e-a11y-<ts>-<rastgele>@arkesoft.test` üretiyor; bu biçim `EMAIL_PATTERN`'e (`:302`) uyuyor
  ⇒ düzeltme bu spec'in **gerçekten ürettiği** veri için etkili. Ayrıca `g` bayraklı modül
  seviyesi regex + `replaceAll` durum sızdırmaz (`Symbol.replace` `lastIndex`'i sıfırlar)
  ⇒ çağrılar arası yanlış-negatif yok.
- **Gerekçe zinciri:** `:82-99` çürütülen önermeyi adlandırıyor, kanıtı `axe.js:7905` + `:7914-7931`
  olarak veriyor, sıranın tersinin neden sır sızdıracağını **karşıt örnekle** açıklıyor.
  `stringifyFirstTarget` docblock'u (`:362-372`) da "güvenli" iddiasından "güvenli DEĞİL,
  redaksiyon çağıranın işi"ye çevrilmiş.

**DRY önerisi bilerek YAZILMADI:** `truncate(redactSensitivePatterns(x), N)` kompozisyonu iki
yerde farklı `N` ile tekrar ediyor. Ajan ölçtü: `redactAndTruncate(x, N)` sarmalayıcısı davranışı
değiştirmez, fail-closed yönünü değiştirmez ⇒ **kazanç tur açmaya değmez**.

## M2 — doğrulamanın koşum kapsamından ayrılması: **KOD KAPANDI, DOKÜMAN YARIM**

- **Asimetri doğru yönde.** Boş-alan döngüleri (`:520-531`, `:532-553`) artık
  `entry.scanName !== scanName` filtresi **taşımıyor**. Bayatlık kontrolleri (`:479-483`,
  `:507-511`) `entry.scanName === scanName` kapsamını **koruyor** ⇒ tur 1'deki açık uyarı
  ("bayat-girdi filtresi KALDIRILMAMALI") ihlal edilmemiş.
- **`staleAcknowledgedEntries` kopyala-yapıştır sapması yok.** `:467-483` (allowlist) ve
  `:492-511` (ack) satır satır karşılaştırıldı: yapısal olarak özdeş, `matchedAckKeys.add(...)`
  doğru değişkeni kullanıyor, stale filtresi doğru diziyi ve doğru `Set`'i tarıyor. Hata mesajı
  da sapmamış (`:571-572` "hiçbir `incomplete` ile eşleşmedi", allowlist'ten kopyalanmış
  "ihlalle" değil).
- **`:34-43` iddiası başlıkta düzeltildi** (`:38-56`), fonksiyon docblock'u (`:440-453`) de
  asimetriyi açıklıyor — **ancak** ikinci örneği `:166`'da duruyor (yukarıdaki `medium`).

## İki "yolu üstünde" `low`

- **low #4 — KAPANDI.** `accessibility.spec.ts:64` artık `| undefined`; runtime guard `:124-126`'da
  gerçek `Error` fırlatıyor (yutma yok, `null`'a çevirme yok). `fixtureUser:56` ile simetri,
  superadmin emsaline atıf `:61-62`.
- **low #6 — KAPANDI.** `İHLAL:` öneki `:64-66`, `:89-91`; `BEYAN EDİLMEMİŞ incomplete:` öneki
  `:164-166`. Önekler `a11y.ts:558`/`:561`'deki gerçek dal metinleriyle birebir ⇒ assert'ler artık
  hangi **dalın** tetiklendiğini kanıtlıyor. `frontend`'in gruplama düzeltmesi doğru:
  `/İHLAL:.*(label|button-name)/s` — önceki ön eksiz `label` dalı yanlış-pozitif riski kapandı.
- **Opsiyonel `low` (`toAllowlistKey` + `Set`): dokunulmamış, yeniden açılmadı.**

## Ölçümler

İncelenen dosya **4** (+2 doğrulama okuması) · `any` **0** · `@ts-ignore` **0** · gerekçesiz `as`
**0** (değişen satırlarda) · en büyük fonksiyon `expectNoAccessibilityViolations` `:458-581` =
**124 satır** (tur 1'de 89 → +35; hâlâ tek sorumluluk: doğrula-ve-kır) · yeni medium **1** ·
yeni low **2** · FAIL kuralı: high/critical **0** ⇒ **PASS**.

## DOĞRULANAMADI

- `pnpm test:e2e` / Playwright / `pnpm build` / `pnpm test:isolation` **koşturulmadı** (`Bash`
  aracı yok + bu turda yasak). Dolayısıyla üç ack girdisinin her koşumda eşleştiği, öz-testin
  beş assert'inin yeni öneklerle geçtiği ve dal metinlerinin çalışma zamanında birebir ürediği
  **ölçülmedi** — statik kod okumasıyla gerekçelendirildi.
- `.gitignore`, `ci.yml`, iki `vitest.isolation.config.ts` ve doküman değişiklikleri
  **incelenmedi** — DAR kapsam, M1/M2 ile ilişkisiz.
- **Kapsam dışı gözlem (`security`'nin TAM turuna devredildi, fix 2 tarafından doğurulmadı):**
  `FIXTURE_TENANT_SLUG_PATTERN` (`a11y.ts:314`) yalnızca superadmin biçimini kopyalıyor;
  `apps/admin/e2e/fixtures/tenant-cleanup.ts:79`'un biçimi (`/^e2e-[a-z0-9-]*\d{10,}$/`) **farklı**
  ve bu desenle eşleşmez. Admin a11y spec'i kiracı slug'ı üretmediği için bugün etkisiz.
