# T-027 — `solid` gate, tur 2 (TAM yeniden denetim)

Tarih: 2026-11-20 · Sürüm: ROADMAP v0.0.18 · Task: `.claude/workflow/tasks/T-027.md`

GATE: solid
SONUÇ: PASS

Tur 1'in üç `medium`'u (M1 `Money` güvenli tamsayı asimetrisi, M2 `guards` alt kontrol 3a'nın
kullanımı pinlememesi, M3 panel metin ikizliği) **üçü de kapandı** — ölçümler aşağıda.
Düzeltme turunun getirdiği yeni kod üzerinde **2 `medium` + 7 `low`** bulgu var;
`AGENT_BASELINE.md` §4 tablosu: 1–2 `medium` ⇒ **PASS + teknik borç**.

---

## 1. Tur 1 bulgularının durumu — ölçüldü

### M1 — KAPANDI, ve matematiksel iddia DENETLENDİ (spot check değil, ispat)

`packages/i18n/src/money.ts:103-107` `Number.isSafeInteger` kapısını ekledi,
`Number.isInteger`'ı (:100) **çıkarmadı** ⇒ `FractionalMinorUnitError`'ın "yalnızca kesirli"
semantiği korundu. `add` (:125), `subtract` (:131), `multiplyBy` (:144), `multiplyByRatio`
(:164) **dördü de** sonucu `Money.of`'a geçiriyor ⇒ tek nokta, kopya denetim açılmadı.

`backend`'in 2. kararı (`multiplyByRatio`'nun `BigInt` yoluna geçirmeme kararı) **doğru** ve
gerekçesi yalnızca altı spot check'ten güçlü — **ispat edilebilir**:

- Yuvarlama (round-to-nearest-even) **monoton**dur ve `2^53` IEEE-754 double'da **tam
  temsil edilir**. Dolayısıyla gerçek sonuç `s ≥ 2^53` ise `fl(s) ≥ fl(2^53) = 2^53`
  ⇒ `Number.isSafeInteger(fl(s))` **false** ⇒ `Money.of` fırlatır. "Yanlışlıkla güvenli"
  bir değere yuvarlanma **imkânsız**.
- **Negatif taraf simetrik:** `−2^53` de tam temsil edilir, `s ≤ −2^53 ⇒ fl(s) ≤ −2^53`
  ⇒ `MIN_SAFE_INTEGER = −(2^53−1)` sınırının dışında ⇒ yakalanır.
- **`add`/`subtract` taşma riski yok:** iki güvenli tamsayının toplamı en fazla `2^54−2`
  ⇒ `Infinity` üretilemez. `MAX − 1 + 2 = 2^53` → `[2^53, 2^54)` ızgarasında ulp = 2,
  `fl = 2^53` → `isSafeInteger(2^53)` **false** ⇒ yakalanır. Ara değer kaçışı yok.
- **`multiplyBy` `Infinity` üretebilir** (`1e300` çarpan) ama
  `Number.isSafeInteger(Infinity)` **false** ⇒ `Money.of` yakalar.

⇒ İddia **çürümedi**. **Tek artık sızıntı** ölçüldü ve `low` L1 olarak kayda geçti:
`amountMinor === 0` iken çarpım her çarpan için 0'dır ⇒ `Money.zero('TRY').multiplyBy(1e300)`
**başarılı olur** (sonuç matematiksel olarak doğru, ama girdi değişmezi zorlanmıyor).
İddia **yazılı** (`money.ts:17-27`) — ancak yazılı öncül `multiplyBy` için **yanlış** (L1).

### M2 — KAPANDI

`scripts/guards.sh:1482-1492` alt kontrol 3a-ii: `moneyRestrictedSyntaxSelectors`'ın
**tanım + kullanım = tam 2** geçişi pinleniyor. `base.js`'te ölçüldü: `:190` tanım + `:386`
kullanım, yorumda **hiç geçmiyor** ⇒ beklenen sayı 2 doğru. `devops`
`rawSqlRestrictedSyntaxSelectors`'ın sayısını (1 tanım + `:254`, `:384` = 3) **kopyalamadı**;
gerekçe `:1475-1481`'de yazılı. Silme senaryosu artık **yakalanıyor**.
⚠ Kapanmayan kardeş delik `medium` S1 olarak aşağıda.

### M3 — KAPANDI (pin gerçekten drift'i yakalıyor)

`apps/admin/src/__tests__/messages.test.ts:198-206` ve
`apps/superadmin/src/__tests__/messages.test.ts:179-187`. Pin **iki tarafı da çalışma
zamanında okuyor** (`resolveErrorMessage(code)` ↔ `TR_TR_ERROR_MESSAGES[ERROR_MESSAGE_KEYS[code]]`)
⇒ hangi taraf drift ederse kırmızı olur. Ek ölçüm: üç kodun defter değeri **ayrı ayrı özel
anahtar** (`errors.auth.accountTemporarilyLocked`, `…emailNotVerified`, `…invalidPassword` —
`error-message-keys.ts:107,112,113`), jenerik anahtara eşlenmiyor ⇒ karşılaştırma **anlamlı**
(aksi hâlde panel metnini jenerik metne eşitlemeye zorlardı).
⚠ Kapanmayan iki kalıntı: **ölülük** (L3) ve pinin **elle tutulan girdi listesi** (L4).

---

## 2. BULGULAR

- [SEV: medium] `scripts/guards.sh:1450-1511` + `packages/config/eslint/base.js:32` —
  **AC-47'nin float-para kuralının davranışsal kapsamı SIFIR.** Altı fixture
  `IGNORES`'ta (`'eslint/__fixtures__/**'`, `base.js:32`) ⇒ `pnpm lint` onları **hiç
  değerlendirmiyor**; depoda ESLint'i programatik koşturan **tek dosya yok** (ölçüm:
  `ESLint|Linter|loadESLint` için depo geneli tarama → 0 eşleşme; `packages/config`'in
  `test` script'i/dosyası yok). 24. adımın koruması yalnızca metin: 3a `MONEY_NAME_SOURCE =`
  tek kopya (:1453), 3a-ii değişken adı iki geçiş (:1485), 3b altı fixture'ın **yalnızca
  VARLIĞI** (:1502-1508, içerik okunmuyor, lint edilmiyor). **Somut senaryo:**
  `MONEY_NAME_SOURCE`'u hiçbir şeye uymayan bir desene çevir (ör. `'(?!)'`) **veya**
  `base.js:386`'daki spread'i **yorum satırına al** ⇒ üç alt kontrol de PASS,
  `pnpm lint` yeşil, AC-47'nin tüm float-para koruması **ölü**. Gerçek üretim kodunda
  float-para ihlali olmadığı için `pnpm lint`'in yeşil kalması kuralın **aktif de inert de**
  olmasıyla tutarlı ⇒ ikinci ağ yok. **Önerilen düzeltme:** `base.js`'in flat config'ini
  ESLint API'si ile yükleyip altı fixture'ı `--no-ignore` eşdeğeriyle lint eden bir vitest —
  3 pozitif `no-restricted-syntax` raporlamalı, 3 negatif raporlamamalı. **Monoton
  sıkılaştırma** (bugün geçen hiçbir vaka kaybolmaz). — sorumlu: `qa` (koşucu) + `devops`
  (kapı metni)
- [SEV: medium] `packages/i18n/src/__tests__/money-safe-integer-range.test.ts:23-62` —
  **gerçek tekrar:** düzeltme turu `money.test.ts:67-98`'e altı test ekledi ve bunlar bu
  dosyanın **5/5 vakasını aynı literallerle** tekrarlıyor: `999999999999999 × 11`
  (:24-32 ↔ :88-93), `MAX + 2` toplama (:34-39 ↔ :78-81), `−MAX − 2` çıkarma (:41-46 ↔
  :83-86), `of(MAX+2)` (:48-54 ↔ :73-76), `multiplyByRatio(MAX, 2/1)` referansı (:56-61 ↔
  :162-167). İkisi **aynı sebeple** değişir (güvenli aralık sözleşmesi) ⇒ yüzeysel benzerlik
  değil, çift bakım yükü. Ayrıca dosya başı (:4-17) **hâlâ** defekti açık ilan ediyor
  ("dört metod tutarsızdır… SESSİZCE yanlış bir `number` DÖNDÜRÜYOR", "Bugünkü üretim kodu bu
  testleri KIRMIZI geçirir — bu KASITLIDIR") — düzeltmeden sonra **ikisi de yanlış**; bu
  dosyayı okuyan gelecekteki bir bakımcı üretimin bozuk olduğuna inanır. **Öneri:** tek ev
  seç (qa'nın dosyasını koru + `money.test.ts:67-98`'i kaldır **veya** tersi) ve kalan
  dosyanın başlığını bugünkü gerçeğe göre yeniden yaz. — sorumlu: `qa` (dosyanın sahibi)
- [SEV: low] `packages/i18n/src/money.ts:17-27` (öncül) + `:138-145` (kod) — yazılı gerekçe
  `multiplyBy` için **yanlış öncül** taşıyor: *"İki girdi de zaten güvenli tamsayı olduğundan
  (önceki bir `Money.of` çağrısından geçmiş oldukları için)"*. `quantity` **hiç** `Money.of`'tan
  geçmez; `:139` yalnızca `Number.isInteger` denetler ⇒ `1e300` ve `2^53` **kabul edilir**.
  Sonuç monotonluk sayesinde yine doğru (bkz. §1), ama **artık sızıntı** var:
  `amountMinor === 0` iken çarpım her çarpan için 0 ⇒ `Money.zero('TRY').multiplyBy(1e300)`
  **fırlatmaz**. Test edilmiş `multiplyBy` çarpanları: 3, 0, 1.5, 11 (`money.test.ts:57-97`)
  ⇒ güvenli-olmayan çarpan vakası **hiç test edilmemiş**. Öneri: `:139`'a
  `Number.isSafeInteger(quantity)` ekle + öncül cümlesini düzelt + tek negatif test.
  ⚠ **Güvenlik etkisi dürüst kaydı:** bu bir **sıkılaştırma**, ama **monoton değil** — bugün
  başarılı olan tek bir vakayı (sıfır tutar × güvenli-olmayan çarpan → 0) reddeder. Saklamıyorum.
  — sorumlu: `backend`
- [SEV: low] `packages/i18n/src/money.ts:103-107` — yeni kapı çıplak `Error` fırlatıyor, üç
  satır yukarıdaki kardeşi (`:100-102`) `FractionalMinorUnitError` (AppError, kararlı `code`)
  fırlatıyor ⇒ `Money.of`'un iki kapısı **iki ayrı hiyerarşide**; çağıran taşmayı kesirlilikten
  `code` ile ayırt edemez (CLAUDE.md §4 "Tek hiyerarşi: `AppError`"). Dosyanın **mevcut
  deseniyle tutarlı** (`:61`, `:69`, `:140` de çıplak `Error`; dördü de programcı hatası) ⇒
  net borç **önceden var olan ve tek biçimli**, bu yüzden `low`. Öneri: `Money`'nin üçüncü
  programcı hatası için defterde bir kod aç (`MONEY_AMOUNT_OUT_OF_SAFE_RANGE` →
  `errors.internal.unknown`, katalog 35'te kalır) veya dört çıplak `Error`'u birlikte taşı;
  vade **v0.4.0** (ilk gerçek `Money` tüketicisi). — sorumlu: `backend`
- [SEV: low] `apps/admin/src/messages/messages.ts:104-105,134-135,138` +
  `apps/superadmin/src/messages/messages.ts:52,54` — tur 1'in ikinci gözlemi **KAPANMADI:
  ölü veri.** `classifyErrorResolutionStep` (admin `:251` / superadmin `:181`) defteri
  (3. basamak) Better Auth tablosundan (4. basamak) **ÖNCE** sorguluyor; `EMAIL_NOT_VERIFIED`,
  `ACCOUNT_TEMPORARILY_LOCKED`, `INVALID_PASSWORD` **ikisinde de** kayıtlı
  (`error-message-keys.ts:107,112,113`) ⇒ bu üç `ERROR_MESSAGES` satırına üretimde **hiçbir
  yoldan erişilmiyor**. Ölçüm: `resolveErrorMessage`'ın üretimdeki tek çağrı yeri 4. basamak
  (`messages.ts:711`); `apps/admin/src` genelinde başka üretim çağrısı **yok**. qa'nın pini
  drift'i engellediği için risk sınırlı; ama dosya başı (`:39-43`) yalnızca
  `EMAIL_NOT_VERIFIED`'ı gerekçelendiriyor, diğer ikisi için **hiç not yok**. Öneri: satırları
  koru ve her ikizlik için tek cümle yaz ("3. basamak kazanır; bu satır Better Auth'un
  doğrudan yolunun **eşit** kopyasıdır, qa pini eşitliği zorlar") — veya L4'ün türetilmiş
  listesiyle birlikte kapat. — sorumlu: `frontend`
- [SEV: low] `apps/admin/src/__tests__/messages.test.ts:199` +
  `apps/superadmin/src/__tests__/messages.test.ts:180` — pinin girdi listesi **elle tutulan
  bir kopya**, oysa hesaplanabilir: `PANEL_ERROR_CODES.filter((c) => Object.hasOwn(ERROR_MESSAGE_KEYS, c))`.
  Ölçüm: bugünkü kesişim admin'de tam 3 (9 Better Auth kodu ∩ 37 defter kodu), superadmin'de
  tam 2 (8 ∩ 37 — `EMAIL_NOT_VERIFIED` superadmin'in tablosunda yok) ⇒ listeler **bugün
  eksiksiz**, pin çalışıyor. Ama `PANEL_ERROR_CODES`'a defterde de var olan yeni bir kod
  eklenirse pin onu **sessizce kapsamaz** — tam olarak bu Task'ın başka yerde kapattığı
  elle-ayna sınıfı (CLAUDE.md §7'nin "dört liste" uyarısıyla aynı mekanik). Doğru desen
  **aynı dosyada** emsalli: `messages.ts:282` `REGISTRATION_FIELD_ERROR_KEYS`'i zod
  şemasından **türetiyor**. Türetilmiş sürüm `expect(dualCodes.length).toBeGreaterThan(0)`
  ile yazılmalı, yoksa boş dizi "sıfır assertion ile yeşil" olur. — sorumlu: `qa`
- [SEV: low] `apps/admin/src/messages/messages.ts:141-147` — yorum **artık alınmayan bir
  yolu** anlatıyor: *"`retryAfterSeconds` `null` ise çağıran {@link ERROR_MESSAGES}.ACCOUNT_TEMPORARILY_LOCKED'ın
  jenerik metnini kullanmalı"*. Ölçüm: tek çağıran `TwoFactorChallengeForm.tsx:61-64`,
  `null` dalında `resolvePanelErrorMessage(error)`'a düşüyor ⇒ metin **3. basamaktan**
  (`TR_TR_ERROR_MESSAGES['errors.auth.accountTemporarilyLocked']`) geliyor, `ERROR_MESSAGES`'tan
  değil. Bugün bayt-eş (qa pini) ⇒ davranış hatası yok, yalnızca yanlış kaynak adresi.
  L3 ile **aynı düzenlemede** kapanır ("yolu üstündeyse kapat"). — sorumlu: `frontend`
- [SEV: low] `scripts/guards.sh:1409-1517` — tek fonksiyonda **dört bağımsız alt kontrol**
  (109 satır) ve fail-closed davranışı **devralınmış**: alt kontrol 2 `base.js` yokluğunu
  açık `else` ile ihlal sayıyor (`:1435-1437`), ama 3a (`:1451`) ve 3a-ii (`:1482`)
  `if [ -f … ]` kullanıp **`else` yazmıyor** ⇒ dosya yoksa ikisi **sessiz no-op**. Bugün
  net davranış fail-closed (2 yukarıda ateşliyor); ama alt kontrol 2 kaldırılır veya sıra
  değişirse iki kontrol sessizce körleşir. Öneri: alt kontrol başına bir fonksiyon (aynı
  `run_step` içinde kalarak) veya 3a/3a-ii'ye kendi `else … violation=true` dalı.
  — sorumlu: `devops`
- [SEV: low] `packages/i18n/src/money.ts:144` + `packages/i18n/src/format-money.ts:26` —
  **negatif sıfır sunuma ulaşıyor.** `Money.of(-5,'TRY').multiplyBy(0)` → `-5 * 0 = -0`;
  `Number.isInteger(-0)` ve `Number.isSafeInteger(-0)` **ikisi de true** ⇒ `Money.of` `-0`'ı
  saklar. `formatMoney` bunu bölüyor (`-0 / 100 = -0`) ve doğrudan
  `Intl.NumberFormat.format`'a veriyor; ES2020+ motorları negatif sıfırı **işaretli**
  biçimler ⇒ "-₺0,00". `Money.of(-0, 'TRY')` da aynı yere gider. `multiplyByRatio` etkilenmez
  (`Number(0n)` → `+0`), `subtract` de etkilenmez (eşit değerlerde `+0`).
  ⚠ **Yürütülerek ölçülmedi** — bu gate'in `Bash` aracı yok; `format-money.test.ts:18-20`
  yalnızca `Money.zero` (`+0`) vakasını pinliyor, `-0` vakası **testsiz**. Öneri: `Money.of`'ta
  normalize et (`amountMinor === 0 ? 0 : amountMinor` — sayısal olarak özdeş, **monoton**) +
  tek test. — sorumlu: `backend`, doğrulama `qa`

### `devops`'un `low` derecelendirmesine değerlendirme (handoff'un sorusu)

`check_axe_single_source` / `check_slug_grammar_single_source` için **`low` doğru** ve
kapsamı büyütmeme kararı **doğruydu** — gerekçe ölçülebilir: o iki eksende **ikinci bir
davranışsal ağ var**. `TENANT_SLUG_PATTERN`'in `.test(input)` çağrısı düşürülürse
`packages/tenancy/src/__tests__/slug.test.ts` kırmızı olur; axe ekseni e2e koşumunda
gerçekten çalışır. Float-para ekseninde **ikinci ağ yok** (yukarıdaki `medium` S1) — bu
yüzden aynı sınıf orada `low` değil, `medium`. Ağın sahibi `devops` değil `qa`.

---

## 3. Yeniden ölçülen temiz eksenler (tur 1'in ölçümleri korunuyor)

- `any` **0**, `@ts-ignore`/`@ts-expect-error` **0** (i18n `src/` + `packages/errors/src` +
  iki panelin mesaj/hata dosyaları). `eslint-disable` **1** — `money.ts:116`, gerekçeli,
  değişmedi. **Üretimde `as` zorlaması 0**; dört `as never` yalnızca testte
  (`money.test.ts:45,51,184,190`) ve tek üyeli `SupportedCurrencyCode` birleşiminde
  uyuşmazlık kurmanın tek yolu olduğu için kaçınılmaz.
- **Döngüsel bağımlılık yok.** `packages/i18n` deps = **tam olarak** `{zod, @arkesoft/errors}`
  (`package.json:25-28`, `purity.test.ts:90-106` ile pinli); `error-message-keys.ts` yalnızca
  `zod` ithal ediyor ⇒ architect'in uyardığı `errors → i18n` yönü **yapısal olarak
  üretilemez**. `packages/db` → `i18n` yalnızca devDependency. Yön `apps/* → packages/*`
  korunuyor.
- **"Sıfır assertion ile yeşil" yeniden üretilmemiş.** Dört yeni `it.each` bloğu
  (admin `:168`, `:199`; superadmin `:152`, `:180`) **boş olamayan literal dizi** kullanıyor.
  Yeni i18n test dosyasında döngü yok. Önceki beş türetilmiş döngü değişmedi ve uzunluk pini
  yerinde (admin `:85` `ERROR_MESSAGES_KEY_COUNT === PANEL_ERROR_CODES.length`).
  ⚠ Tek uyarı L4'te: türetilmiş listeye geçilirse uzunluk guard'ı **zorunlu**.
- **İki panelin merdiveni birebir aynı:** 5 üyeli `ErrorResolutionStep` + `switch` +
  `assertNever` (admin `:230-260`/`:700-717` ≡ superadmin `:169-181`/`:342-360`).
- **Katman sınırları:** `packages/i18n` içinde db/trpc/HTTP ithali yok
  (`purity.test.ts:42-67` desenleri); `packages/ui` dokunulmadı; sunum katmanında iş kuralı
  yok; `format-money.ts:1-12` float bölmesinin **yalnızca gösterim** sınırında olduğunu
  gerekçesiyle yazılı tutuyor.
- **`src/` düz kaldı** ⇒ `purity.test.ts:37`'nin `recursive` olmayan `readdirSync`'i tüm
  üretim dosyalarını görüyor; yeni test dosyası `src/__tests__/` altında (doğru şekilde
  kapsam dışı).

ÖLÇÜMLER: incelenen dosya **24** (i18n `src` 12 üretim + 10 test, `packages/errors`
`error-message-keys.ts`, iki panelin `messages.ts` + `messages.test.ts`,
`packages/config/eslint/base.js` + 6 fixture adı, `scripts/guards.sh` 24. adım) ·
`any` **0** · `@ts-ignore` **0** · üretimde `as` zorlaması **0** · `eslint-disable` **1**
(gerekçeli) · en büyük fonksiyon: TS **19 satır** (`classifyErrorResolutionStep`,
`apps/admin/src/messages/messages.ts:242-260`; `Money.of` 9 → 11 satıra çıktı, tur 1'in
26 satırlık maksimumu **aşılmadı**), shell **109 satır**
(`check_ac45_ac46_error_catalog_and_money_lint_guards`, `scripts/guards.sh:1409-1517` — L6) ·
döngüsel bağımlılık **0** · bulgu: **2 medium + 7 low** · komut çalıştırılmadı (bu gate'in
`Bash` aracı yok; tüm ölçümler `Read`/`Grep`/`Glob` ile statik).
