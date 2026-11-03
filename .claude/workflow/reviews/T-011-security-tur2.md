# T-011 · GATE: security · tur 2 (DAR kapsam)

Tarih: 2026-11-02 · Sürüm: ROADMAP v0.0.9.1 patch · Kapsam: **DAR** — yalnızca tur 1
bulgularının kapanışı. Yeni tarama YAPILMADI (tur 1'in AC8 altı-yol doğrulaması, 14 maddelik
kiracı izolasyon ölçümü, `pnpm audit`, `.env` yüzeyi, enjeksiyon, teşhis mesajı, Vite `fs.deny`
ölçümleri TEKRARLANMADI).

```
GATE: security
SONUÇ: PASS
```

FIX 1'in **getirdiği** hiçbir `medium`+ bulgu yok. Tur 1'in `[medium]`'u KAPANDI; iki `low`'un pini
KISMİ (kalan risk daraldı, kaybolmadı); üçüncü `low` yeniden açıldı.

---

## İŞ 1 — tur 1 `[medium]` bulgusunun kapanışı

**Tur 1 bulgusu:** `root-env-integration.test.ts` — AC8'in "yapısal garanti" pini, korumak istediği
yan etkiyi ölçmüyordu; `beforeEach`'in `process.env = { ...ORIGINAL_ENV }` ataması yüzünden
`toBeUndefined()` assert'i `loadEnvFile` çağrılsa bile geçiyordu.

### KARAR: **KAPANDI**

**(1) Yeni assert sandbox env anlambiliminden bağımsız mı → EVET.**

Üretim çağrı noktası `apps/storefront/src/lib/root-env-integration.ts:99`:

```ts
process.loadEnvFile(rootEnvPath)
```

Bu, çağrı anında **global `process` nesnesi üzerinde bir özellik aramasıdır**;
`vi.spyOn(process, 'loadEnvFile')` tam o özelliği değiştirir. Assert (`not.toHaveBeenCalled()`)
spy'ın **çağrı kaydını** okur, `process.env`'e **hiç bakmaz** — dolayısıyla tur 1'de tarif ettiğim
tuzak (`process.env`'in düz bir nesneyle değiştirilmesi, yerel env yazmasının görünmemesi) bu
assert'i **etkileyemez**. Mekanizma ile assert arasında artık `process.env` aracı yok.

**Dosya içi pozitif kontrol (assert'in boş/vacuous OLMADIĞININ kanıtı):** aynı dosyada `dev`
dalları `expect(loadEnvFileSpy).toHaveBeenCalledTimes(1)` (`:136`, `:168`) assert ediyor ve
**geçiyor** → spy üretim çağrısını gerçekten **gözlemliyor**. `dev`'de "1", `build`/`preview`/`sync`'te
"0" — aynı spy mekanizmasıyla ölçülmüş iki yönlü kontrol.

**Ölçüm:** `pnpm --filter @arkesoft/storefront exec vitest run src/lib/__tests__/root-env-integration.test.ts`
→ **7/7 geçti, 210ms** (vitest 5.0.5, node v25.8.1). Tek dosya koşumu → dosya sırasına bağımlı değil.

**(2) Dört dalın tamamı kapsandı mı → EVET, boşta dal yok.**

| Dal          | Dosya:satır                            | Assert                              |
| ------------ | -------------------------------------- | ----------------------------------- |
| `build`      | `root-env-integration.test.ts:76, 87`  | `not.toHaveBeenCalled()`            |
| `preview`    | `root-env-integration.test.ts:94, 100` | `not.toHaveBeenCalled()`            |
| `sync`       | `root-env-integration.test.ts:107, 113`| `not.toHaveBeenCalled()`            |
| P4 `build`   | `env-contract.test.ts:185, 196`        | `not.toHaveBeenCalled()` + `mockRestore()` (`:198`) |

Kapının yönü (**non-dev yüklemez**) 4/4 kapsanmış. P4'ün `dev` dalında (`:200-208`) çağrı sayısı
assert'i yok ama o dalın konusu fırlatma davranışı; kapı yönü için eksik değil.

**(3) Spy doğru kurulup geri alınıyor mu → KISMİ (yeni `low`, pin güvenilirliğini bozmuyor).**

`root-env-integration.test.ts` **beş** spy kuruyor (`:76, :94, :107, :129, :163`) ve **hiçbirini geri
almıyor**: `afterEach` (`:61-64`) yalnızca `process.env` + `vi.resetModules()`;
`apps/storefront/vitest.config.ts`'te `restoreMocks`/`clearMocks`/`mockReset` **yok** (okundu).
`env-contract.test.ts` P4 ise `mockRestore()` çağırıyor (`:198`) — tutarsız.

Etkisi **ölçülerek sınırlandı**, pin güvenilmez hale gelmiyor:

- **Sayaç birikmesi yok:** `:136` bir çağrı tükettikten sonra `:168`'in
  `toHaveBeenCalledTimes(1)` assert'i **geçiyor** → vitest 5.0.5'te her `vi.spyOn` taze sayaç
  veriyor. Biriken bir sayaç olsaydı `:168` "2" görüp **kırmızı** olurdu.
- **Dosya dışına sızma yüzeyi yok:** storefront test dosyalarında `process.loadEnvFile`'ı tüketen
  **tek** diğer dosya `env-contract.test.ts` (çağrı/spy noktası grep'i ile ölçüldü; `dist/**` hariç).
  O da kendi spy'ını geri alıyor. Ayrıca `vitest.config.ts` `pool`/`isolate` **override etmiyor** →
  vitest varsayılanı dosya başına izolasyon. Sızsa bile `spyOn` varsayılanı **call-through** olduğu
  için davranış sessizce değişmez.

→ Borç satırı (aşağıda B1). Tur 1'in `medium`'u bu bulgu ile **yeniden açılmıyor**: kör assert
sorunu ortadan kalktı, kalan şey hijyen.

**(4) Mutlak yol karşılaştırması repo kökünü mü gösteriyor → EVET.**

Ölçüm (node path aritmetiği, dosya değiştirilmeden):

```
REPO_ROOT (test, __tests__'ten 5 yukarı) = /Users/kullanici/Desktop/Arkesoft Panel
test beklentisi join(REPO_ROOT,'.env')   = /Users/kullanici/Desktop/Arkesoft Panel/.env
üretim resolveRootEnvPath()              = /Users/kullanici/Desktop/Arkesoft Panel/.env
EŞİT? = true
```

İki türetme **bağımsız** (`__tests__`'ten 5 yukarı · `lib`'ten 4 yukarı) — dosya taşınırsa test
**gürültülü** kırılır, bu istenen yön. Kırılganlık: her ikisi de kaynak yerleşimindeki
`import.meta.dirname`'e dayanıyor; vitest kaynaktan koştuğu için bugün geçerli. Tur 1'in zayıf
`endsWith('.env')` kontrolü (`/etc/anything.env` gibi ilgisiz yolu geçiren) kapandı.

---

## İŞ 2 — iki `low`'un pin doğrulaması

### low #1 (`PUBLIC_*` → istemci paketi zinciri) · P7 · KARAR: **KISMİ** (kalan yüzey daraldı, `low` kalıyor)

P7 (`env-contract.test.ts:257-263`) `.env.example`'da `^PUBLIC_` satırını yasaklıyor; P7 self-test
(`:269-275`) filtrenin yakaladığını sentetik içerikle kanıtlıyor. Orkestratörün gerçek dosya
mutasyonu da kırmızı verdi.

**Pin beklediğimden GENİŞ çıktı (yeni ölçüm):** CI'ın kök `.env`'i, `.env.example`'ın **birebir
kopyası**:

- `package.json:23` → `"env:init": "[ -f .env ] || (cp .env.example .env && ...)"`
- `.github/actions/setup-workspace/action.yml` → `create-env` girdisi **varsayılan `'true'`**, adım
  `pnpm env:init` çalıştırıyor
- `.github/workflows/ci.yml:984-1003` (`storefront` job'u) → `setup-workspace`'i argümansız çağırıyor,
  ardından `run-gates` (lint/typecheck/test/test:isolation/build)

→ P7, CI'da materyalize olan `.env`'i **geçişli olarak** pinliyor. Kalan **tek** kapsanmayan yüzey:
geliştiricinin **elle düzenlediği yerel `.env`** (git izlemiyor, CI'da yok) — bu Task'ta sentinel ile
fiilen yaşanan senaryo tam olarak buydu.

**Kararım: bu kabul edilebilir bir sınır, ama kalan risk BELGELENMELİ** (sorumlu `docs`), çünkü
yüzey teorik değil, bu Task'ta bir kez gerçekleşti. Mekanik kapatma seçeneği de borç olarak
kaydedilmeli (B2): `root-env-integration.ts`'in `dev` dalında, `loadEnvFile`'dan **sonra**,
`process.env`'de `PUBLIC_` önekli anahtar varsa fırlatan bir koruma — bu, yerel `.env`'i de
yakalayan tek mekanik çözüm. (Kod değişikliği olduğu için `low` disiplini gereği bu turda
istenmiyor.)

**P7'nin iki hassasiyet sınırı (aynı borç satırına):**

- `line.startsWith('PUBLIC_')` — baştaki boşluklu satırı (` PUBLIC_X=1`) **kaçırır**; Node'un
  `loadEnvFile` ayrıştırıcısı boşluğu kırpıp anahtarı **yükler**. `export PUBLIC_X=1` biçimi de kaçar.
- P7 önek **değerini** pinliyor, önek **yapılandırmasını** pinlemiyor: `envPrefix` repoda hiçbir
  yerde ayarlı değil (grep: `apps`/`packages` altında `envPrefix` **yok** → Astro varsayılanı
  `["PUBLIC_"]` yürürlükte), ama biri `envPrefix: ['APP_']` yazarsa P7 **ilgisiz** hale gelir ve
  hiçbir assert bunu yakalamaz.

### low #2 (`playwright.config.ts`'in kapısız ikinci kök `.env` yüklemesi) · P8 · KARAR: **KISMİ**

Kök neden **değişmedi**: `apps/storefront/playwright.config.ts:83-86` kök `.env`'i **koşucu
sürecine kapısız** yükliyor; `webServer.command` çocuğu bunu **miras** alır.

**Handoff'un sorduğu üç alternatif aslında KAPSANIYOR** — ama yasaklardan değil, **pozitif
assert'ten** ötürü. `expect(webServerCommandLine).toContain('astro dev')` (`:294`) bir
allowlist gibi davranıyor: metninde `astro dev` **geçmeyen** her komut pini **kırmızıya** düşürür →
`vite preview`, `node ./dist/server/entry.mjs`, `pnpm --filter @arkesoft/storefront preview`
hepsi yakalanır. İki `not.toContain` (`:295-296`) yalnızca ek bir güvenlik ağı.

**Kalan iki gerçek boşluk (bu yüzden KISMİ):**

1. **Hem `astro dev` içeren hem build yapan bileşik komut.** Örnek:
   `command: 'pnpm --filter @arkesoft/storefront build && astro dev --port X'` veya
   `'vite build && astro dev'` → `astro dev` **var**, `astro build`/`astro preview` **yok** → P8
   **yeşil**, ama build alt süreci kök `.env`'i miras alır ve `PUBLIC_*` istemci paketine girebilir.
   Yani tur 1'de tarif ettiğim bypass yolunun **bir varyantı açık kalıyor**.
2. **Tek satır / tek `webServer` varsayımı.** P8 `command:` ile başlayan **ilk** satırı alıyor
   (`:286-288`). Bugün öyle bir satır tam **1** adet (ölçüldü, `playwright.config.ts:108`). Ama
   Playwright `webServer`'ı **dizi** olarak destekliyor; ikinci bir girdi ya da çok satırlı template
   literal komut pinin **görüş alanı dışında** kalır.

Önerilen güçlendirme (borç B3): komutu ham metinde aramak yerine tek kaynaktan (export edilen
sabit) assert etmek, ya da allowlist regex'i (`/^env( -u \w+)* astro dev --port \$\{/`) + `command:`
satır **sayısının** 1 olduğunun assert'i.

### low #3 (`check-env.ts` sabit satır numaraları) · KARAR: **AÇIK — yeniden açıldı**

`packages/config/src/check-env.ts:98-99` bugün hâlâ birebir:

```
'  - `APP_BASE_DOMAIN`         (`.env.example:14`)',
'  - `STOREFRONT_API_BASE_URL` (`.env.example:130`)',
```

`.env.example`'a bir satır eklenmesi bu referansları sessizce geçersiz kılar ve operatörü **yanlış
satıra** yönlendirir. Güvenlik etkisi yok (teşhis metni, sır içermiyor) → `low`. Sorumlu `devops`,
ROADMAP borcu.

---

## BULGULAR

```
BULGULAR:
  - [SEV: low] apps/storefront/src/lib/__tests__/root-env-integration.test.ts:61-64,76,94,107,129,163 —
    Beş `vi.spyOn(process,'loadEnvFile')` hiç geri alınmıyor (`afterEach` yalnızca `process.env` +
    `resetModules`; `apps/storefront/vitest.config.ts`'te `restoreMocks` yok). Sızan bir spy ilkesel
    olarak başka testleri sessizce etkileyebilir; bu Task'ta etkisi ölçülerek sınırlandı (sayaç
    birikmesi YOK — `:168` yeşil; `loadEnvFile`'ı tüketen tek diğer dosya `env-contract.test.ts`
    kendi spy'ını restore ediyor; `pool`/`isolate` override edilmemiş). —
    Düzeltme: `afterEach`'e `vi.restoreAllMocks()` veya config'e `restoreMocks: true`. — qa
  - [SEV: low] apps/storefront/src/lib/__tests__/env-contract.test.ts:257-263 —
    P7 yalnızca `.env.example`'ı pinliyor; geliştiricinin elle düzenlediği yerel kök `.env` (bu
    Task'ta sentinel ile fiilen yaşandı) kapsanamıyor. Ayrıca filtre baştaki boşluklu/`export`
    biçimli satırı kaçırıyor ve Astro `envPrefix` YAPILANDIRMASI hiç pinlenmiyor. —
    Düzeltme: kalan riski belgele (docs); mekanik kapatma borcu olarak `root-env-integration.ts`'in
    `dev` dalına `loadEnvFile` SONRASI "PUBLIC_ önekli anahtar varsa fırlat" koruması. — docs (+ backend borç)
  - [SEV: low] apps/storefront/src/lib/__tests__/env-contract.test.ts:284-297 —
    P8, `astro dev` İÇEREN ama aynı zamanda build yapan bileşik komutu (ör.
    `pnpm ... build && astro dev --port X`) yakalamıyor; ayrıca `command:` ile başlayan İLK satıra
    bakıyor (Playwright `webServer` DİZİ olabilir, komut çok satırlı template literal olabilir).
    Kök neden değişmedi: `playwright.config.ts:83-86` kapısız kök `.env` yüklemesi. —
    Düzeltme: ham metin yerine tek-kaynak sabitten assert; allowlist regex + `command:` satır
    sayısı == 1 assert'i. — qa (pin), devops (kök neden)
  - [SEV: low] packages/config/src/check-env.ts:98-99 —
    Operatör teşhisinde sabit `.env.example:14` / `:130` satır numaraları; `.env.example`
    düzenlenince sessizce yanlış satıra yönlendirir (YENİDEN AÇILDI, tur 1'de de vardı). —
    Düzeltme: satır numarası yerine anahtar adıyla referans ver veya satırı çalışma anında bul. — devops
```

FAIL kuralı (AGENT_BASELINE §4): `critical`/`high` **yok**, `medium` **0** → **PASS**.

---

## ÖLÇÜMLER

- **`pnpm audit`: ÇALIŞTIRILMADI** (bilinçli). Gerekçe: kapsam DAR; Orkestratörün ölçtüğü yüzey
  diffinde `package.json` ve kilit dosyası **yok** → bağımlılık yüzeyi tur 1'e göre değişmedi.
  Tur 1 sonucu geçerli kabul edildi; kritik/yüksek/orta/düşük sayıları bu turda **yeniden ölçülmedi**.
- **İncelenen dosya: 11** — değişen 4 (`storefront-env.ts`, `storefront-env-schema.ts`,
  `root-env-integration.test.ts`, `env-contract.test.ts`) + bağlam 7 (`root-env-integration.ts`,
  `playwright.config.ts`, `apps/storefront/vitest.config.ts`, `.github/workflows/ci.yml`,
  `.github/actions/setup-workspace/action.yml`, `.github/actions/run-gates/action.yml`,
  `packages/config/src/check-env.ts`).
- **Koşturulan test (yalnızca tek dosya, port bağlamayan):**
  - `vitest run src/lib/__tests__/root-env-integration.test.ts` → **7/7 geçti**, 210ms
  - `vitest run src/lib/__tests__/env-contract.test.ts` → **11/11 geçti**, 198ms (P1-P8 + 3 self-test)
  - `pnpm test` / `pnpm build` / `astro dev` / Playwright **koşturulmadı** (handoff yasağı).
- **Kiracı izolasyon listesi — karşılanmayan madde: YOK.** Bu yüzeyde veritabanı sorgusu, tRPC
  prosedürü, kuyruk işi, önbellek/S3/arama anahtarı veya kiracıya bağlı kaynak **yok**; 14 maddenin
  tamamı tur 1'de ölçüldü ve bu turda değişen dosyalar o yüzeye **dokunmuyor**.
- **Sır taraması (değişen 4 dosya, hedefli):** `SECRET|PASSWORD|TOKEN|API_KEY|uzun base64 benzeri
  literal` → **eşleşme yok**. `root-env-integration.ts`'in yorumunda `BETTER_AUTH_SECRET` **anahtar
  adı** olarak geçiyor, **değer değil** — kural ihlali değil.
- **Ölçemediklerim (§5 dürüstlük):**
  - Sızan spy'ın **dosyalar arası** etkisini doğrudan ölçemedim (ölçmek için test dosyası yazmak
    gerekirdi — mutasyon/yazma yasağı). Dolaylı kanıtla sınırlandırdım: tek tüketici dosya restore
    ediyor + `pool`/`isolate` override edilmemiş + tam süit 958/958 × 3 yeşil (Orkestratör ölçümü).
  - FIX 1'in mutasyon kanıtlarını (kapının taşınması, `.env.example`'a `PUBLIC_X`,
    `astro preview` sapması) **kendim üretmedim** — Orkestratörün ölçtüğü sonuçları kabul ettim;
    kod/dosya mutasyonu bu turda bana yasak.
