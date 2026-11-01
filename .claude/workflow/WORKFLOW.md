# Arkesoft — Çok Ajanlı Geliştirme Döngüsü

> Kullanıcıdan gelen **her** görev veya sürüm isteği bu döngüden geçer. Döngü dışına
> çıkmak ve doğrudan kod yazmak yasaktır.

Ana Claude Code oturumu = **Orkestratör**. Ajanları çağırır, handoff paketlerini taşır,
gate sonuçlarını toplar, kullanıcıya rapor eder. **Ajanlar birbirini çağırmaz.**

---

## Döngü

```
Kullanıcı isteği
     │
     ▼
[0] ORKESTRATÖR → Task dosyası (.claude/workflow/tasks/T-xxx.md)
     ▼
[1] pm ────────► kapsam, kabul kriterleri, trivial mi
     │              └─ kapsam DEĞİŞTİ/DARALDI → kullanıcıya sor
     ▼
[2] architect ─► teknik tasarım + versiyon etkisi + risk
     │              └─ major (kırıcı) → kullanıcıya sor
     ▼
[3] po ────────► alt görevler, bağımlılık grafiği, paralel gruplar
     ▼
[4] TASARIM     ux → ui                  (yalnızca frontend varsa)
     ▼
[5] ÜRETİM      db → backend ║ frontend ║ devops
                (db önce; backend db'yi bekler; frontend tRPC tiplerini bekler)
     ▼
[6] GATE'LER    solid ║ qa  (her zaman)  +  security* ║ wcag* ║ perf*
                (*yüzeyi varsa — kararı architect verir ve gerekçelendirir)
     │
     ├─ FAIL → [7] DÜZELTME (en fazla 3 tur)
     │            yalnızca critical/high/medium için; low → borç tablosu
     │            bulgular sorumlu üretim ajanına gider
     │            yeniden koşum: FAIL veren TAM · PASS+yüzey değişti DAR
     │                           PASS+yüzey aynı koşmaz
     │            düzeltme YENİ yüzey eklediyse o gate TAM koşar
     │            3. tur sonunda hâlâ FAIL → ESCALATED, kullanıcıya sun
     │
     └─ hepsi PASS
     ▼
[8] docs ──────► doküman, changeset, CHANGELOG
     ▼
[9] release ───► kabul kriteri komutlarını KOŞAR, versiyon bump, ROADMAP işareti,
                 commit mesajı (commit ATILMAZ)
     ▼
[10] ORKESTRATÖR → final rapor + commit onayı
```

---

## 16 ajan

| Faz     | Ajan        | Model  | Rol                                       |
| ------- | ----------- | ------ | ----------------------------------------- |
| Karar   | `pm`        | opus   | Kapsam, iş değeri, kabul kriterleri       |
| Karar   | `architect` | opus   | Teknik tasarım, versiyon etkisi, ADR      |
| Karar   | `po`        | opus   | Alt görevler, bağımlılık, paralel gruplar |
| Tasarım | `ux`        | sonnet | Akış, durumlar, Türkçe microcopy          |
| Tasarım | `ui`        | sonnet | shadcn bileşen planı, token'lar           |
| Üretim  | `db`        | sonnet | Prisma şema, migration, RLS, seed         |
| Üretim  | `backend`   | sonnet | NestJS, tRPC, BullMQ, adaptörler          |
| Üretim  | `frontend`  | sonnet | Astro + Vite/React                        |
| Üretim  | `devops`    | sonnet | compose, Helm, Pulumi, CI, env            |
| Gate    | `qa`        | sonnet | Kabul kriteri → test, negatif senaryolar  |
| Gate    | `security`  | opus   | OWASP, tenant sızıntısı, sır, PII         |
| Gate    | `solid`     | opus   | SOLID/DRY/KISS, katman, tip disiplini     |
| Gate    | `wcag`      | sonnet | WCAG 2.2 AA                               |
| Gate    | `perf`      | sonnet | Core Web Vitals, N+1, bundle              |
| Kapanış | `docs`      | sonnet | README, ADR, changeset, CHANGELOG         |
| Kapanış | `release`   | sonnet | Versiyon bump, ROADMAP, commit mesajı     |

Her gate ajanı raporunu **hem** handoff olarak Orkestratöre döndürür **hem de**
`.claude/workflow/reviews/<task>-<gate>-tur<n>.md` dosyasına yazar.

Ortak sözleşme: `.claude/workflow/AGENT_BASELINE.md`

---

## Kısayollar ve bayraklar

| Komut                        | Davranış                                  |
| ---------------------------- | ----------------------------------------- |
| `/run <görev>`               | Tam döngü (pm trivial derse kısalır)      |
| `/run v0.3.0`                | ROADMAP sürümünü Task'a çevirip tam döngü |
| `/run --full <görev>`        | Trivial kısayolunu kapat                  |
| `/run --skip-design <görev>` | UX/UI atla (yalnızca backend işleri)      |
| `/run --gates-only T-xxx`    | Mevcut Task'ı yalnızca gate'lerden geçir  |
| `/status`                    | Tüm Task durumları + teknik borç          |

**Trivial kısayolu:** PM bir görevi trivial (tek dosya, davranış değişikliği yok)
işaretlerse [2]–[5] atlanır; yalnızca ilgili üretim ajanı + `solid` + `qa` koşar.

---

## Paralellik kuralları

- Bağımsız ajanlar **aynı mesajda** çağrılır → gerçekten paralel koşar.
- **Aynı dosyaya iki ajan aynı anda yazamaz.** `po` alt görevleri dosya bazında
  çakışmasız böler; çakışma kaçınılmazsa sıralı çalışır.
- Değiştirilemez sıralar: `db` → `backend` → `frontend`, `ux` → `ui` → `frontend`.
- **Aynı `dist/`'e yazan iki ajan paralel koşmaz.** Tek ajan build koşturur, diğerlerine
  açıkça yasaklanır.

### Gate'ler paralel koşar — İKİ İSTİSNA DIŞINDA (2026-11-01)

Gate'ler **salt-okunur değil**: `perf` ve `qa` kasıtlı bozma yapıyor (dosya değiştirip geri
alıyor). T-008'de `perf`'in Deney A/C enjeksiyonları, `security` ölçüm yaparken ağacı değiştirdi;
`security` fark edip ölçümlerini tekrarladı ama bu bir Orkestratör hatasıydı.

| İstisna                                                  | Kural                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Dosya değiştiren gate** (`perf`, `qa` — kasıtlı bozma) | Ölçüm yapan gate'lerle (`security`, `solid`) **paralel koşmaz**. Önce ölçenler, sonra bozanlar; ya da tersi. |
| **Aynı portu isteyen gate** (`qa`, `wcag` — Playwright)  | Port ajan başına ayrılabilir (aşağıdaki kalıp) ama **oran sınırı marjini** bağlayıcı kalıyor — bkz. uyarı.   |

Her gate'in briefinde **koşturmaması gereken şey açıkça yazılır** ("Playwright koşturma",
"`admin build` koşturma") — yoksa çakışma sessizce yanlış ölçüm üretir.

### Playwright'ı farklı portta koşturma kalıbı (ölçülmüş, `devops` 2026-11-01)

Port, Vite + Playwright + API'nin beklediği origin'de **birlikte** kaymak zorunda. Üçü ayrı
ayrı kayarsa **sessiz 403** doğar (ADR-0011 madde 1-2). `devops` bunu negatif kontrolle
kanıtladı: yalnızca Vite portunu kaydırmak `sign-up` çağrısını düşürüyor.

```bash
# 1) İkinci API süreci — AYRI AUTH_BASE_URL ile (apps/api altında).
#    Node'un --env-file-if-exists'i önceden export edilmiş değeri EZMEZ, kod değişmez.
API_PORT=3100 AUTH_BASE_URL="http://panel.arkesoft.localhost:5273" \
  node --env-file-if-exists=../../.env dist/main.js

# 2) O API'ye bakan e2e koşumu
ARKESOFT_PANEL_E2E_PORT=5273 ARKESOFT_PANEL_DEV_API_TARGET=http://127.0.0.1:3100 \
  pnpm --filter @arkesoft/admin test:e2e
```

Süreci başlatan gate ajanı **işi bitince kendi kapatır** — aksi hâlde port ve Redis bağlantısı
sızdırır.

> **⚠ Kazanç sınırlı — `devops` ölçtü.** `platform:auth:*` oran sınırı sayacı **IP bazlı** ve
> port/origin bileşeni **yok** (`rate-limit.guard.ts:173`). İki eşzamanlı API süreci **aynı
> sayaç uzayını paylaşır** → port ayrımı oran sınırı çakışmasını **çözmez**. İki tam suite
> = 8 sign-in + 6 sign-up: tavanların altında ama **marjin yok**; üçüncü bir tüketici 429
> üretir ve "flaky" gibi görünür. Bu yüzden `qa` ve `wcag`'ı **tam** suite ile eşzamanlı
> koşturmak hâlâ riskli; dar `--grep` koşumları güvenli. Kalıcı çözüm ROADMAP'te
> (`Vadesi v0.0.15`, scope'a origin/port bileşeni).

---

## Gate FAIL kuralı

| Durum                            | Sonuç                         |
| -------------------------------- | ----------------------------- |
| En az bir `critical` veya `high` | **FAIL**                      |
| ≥ 3 `medium`                     | **FAIL**                      |
| 1–2 `medium`                     | PASS, teknik borca kaydedilir |
| Yalnızca `low`                   | PASS, teknik borca kaydedilir |

**Düzeltme turu yalnızca `critical`/`high`/`medium` için açılır.** `low` bulgular doğrudan
ROADMAP teknik borç tablosuna gider — ayrıntı `AGENT_BASELINE.md` §4, "Bulgunun sonucu ne olur".

---

## Gate turları ve yeniden koşum kapsamı (2026-11-01)

Ölçüm: T-008'de iki tam gate turu **2.6M token** harcadı. Tur 2 **sıfır `high`** buldu
(2 `medium` + 21 `low`) ama tur 1 kadar pahalıydı, çünkü her gate'e **tam yeniden denetim**
yaptırıldı. Kural artık şu:

| Gate'in önceki turdaki sonucu    | Yeniden koşum kapsamı                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **FAIL** verdi                   | **TAM** — bulduğu her şeyi yeniden denetler + yeni bulgu arar                                            |
| **PASS** verdi, yüzeyi değişti   | **DAR** — yalnızca _"kendi önceki bulgularım kapandı mı"_ + değişen dosyalar. Yeni alan taraması **yok** |
| **PASS** verdi, yüzeyi değişmedi | **Koşmaz.** Sonucu taşınır, Orkestratör bunu kayda geçirir                                               |

**"Yüzeyi değişti" ne demek:** o gate'in kendi bulgularının dosyaları ya da o gate'in denetlediği
katman (örn. `security` için `apps/api` + env + bağımlılıklar; `perf` için build çıktısı + bütçe)
düzeltme turunda değişti mi — `git diff --stat` ile **ölçülür**, tahmin edilmez.

### ⚠ DAR kapsamın kör noktası — düzeltmenin DOĞURDUĞU hata

DAR kapsam yalnızca _"önceki bulgularım kapandı mı"_ sorar. **Bir düzeltmenin eklediği YENİ
yüzeyde doğan yeni hatayı göremez.**

Ölçülmüş vaka (T-008): `wcag` tur 1'de "skip-link yok" diye `low` yazdı. S5 skip-link'i ekledi.
`wcag` tur 2'de **skip-link'in hiçbir şeyi atlamadığını** buldu (`<main>`'in `tabIndex`'i yok →
odak `<body>`'ye düşüyor, sonraki Tab skip-link'e geri dönüyor → WCAG 2.4.1 karşılanmıyor) —
`medium`. Bu bulgu **tur 1'de yoktu**, çünkü denetlenen şey tur 1'de **mevcut değildi**. DAR
kapsamla koşsaydı **kaçardı**.

**Bağlayıcı kural:** düzeltme turunda **yeni dosya, yeni bileşen, yeni prop veya yeni kullanıcı
yüzeyi** eklendiyse, o yüzeyi denetleyen gate **DAR değil TAM** koşar — PASS vermiş olsa bile.
Orkestratör bunu `git diff --stat` ile ölçer: **`create mode` / yeni export / yeni DOM öğesi
varsa TAM.** Yalnızca mevcut satırların değiştiği (refactor, yorum, eşik) düzeltmelerde DAR
yeterlidir.

**Dar brief nasıl yazılır:** önceki turun bulgularını handoff'a **birebir kopyala**, "her biri için
`KAPANDI`/`AÇIK` kararı ver" de, ve **"yeni alan taraması yapma"** diye açıkça yaz. Rapor
dosyasını okutma — bulgular zaten brief'in içinde.

**Üç tur sınırı değişmedi:** 3. turda hâlâ FAIL varsa Task `ESCALATED`, kullanıcıya sorulur.

---

## Risk tabanlı gate seçimi (2026-11-01)

Beş gate'i koşulsuz koşturmak israftır. **Hangi gate'lerin yüzeyi olduğunu `architect` belirler**
ve Task dosyasına yazar; Orkestratör ona uyar.

| Gate       | Koşar mı                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `solid`    | **Her zaman** — kod kalitesi ve katman sınırı her sürümde var                                                    |
| `qa`       | **Her zaman** — kabul kriteri her sürümde var                                                                    |
| `security` | Yeni endpoint/prosedür/kuyruk işi · kiracı tablosu · env · bağımlılık · auth yüzeyi · dış sağlayıcı varsa        |
| `wcag`     | **Yalnızca** render edilen arayüz değiştiyse (`apps/admin`, `apps/superadmin`, `apps/storefront`, `packages/ui`) |
| `perf`     | **Yalnızca** bundle, sorgu, önbellek veya build çıktısı değiştiyse                                               |

`architect` "bu gate'in yüzeyi yok" derken **gerekçe yazar** (ör. _"v0.0.9 `theme-sdk`
sözleşmesi — render edilen arayüz yok, `wcag` N/A"_). Gerekçesiz atlama **yasak**; şüphede
koştur.

---

## Maliyet kaydı (2026-11-01)

Yukarıdaki üç kuralın (bağlam özeti, `low` → borç, dar yeniden koşum) işe yarayıp yaramadığı
**ölçülmeden bilinemez**. Orkestratör her Task dosyasına kapanışta şu tabloyu ekler:

| Aşama | Ajan sayısı | Token | Ajan süresi |
| ----- | ----------- | ----- | ----------- |

**Taban çizgisi — T-008 (optimizasyon ÖNCESİ):** görünen toplam **~4.8M token / ~5.5 saat**
(sıkıştırma öncesi üretim fazı hariç; onunla birlikte **~7M**). Dağılım: gate tur 1 1.42M ·
`architect` 0.19M · düzeltme turu 1 0.96M · gate tur 2 1.18M · düzeltme turu 2 0.63M ·
`docs`+`release` 0.45M.

**Hedef:** benzer büyüklükte bir sürümde **~2.5–3M token**. Sapma varsa sebebi Task dosyasına
yazılır — kural yanlışsa düzeltilir, uygulanmadıysa Orkestratör hatası olarak kaydedilir.

---

## Kullanıcıya sorma koşulları (yalnızca bu 6)

1. PM kapsamı daralttı veya değiştirdi
2. Architect `major` (kırıcı) versiyon etkisi tespit etti
3. Yeni ana bağımlılık gerekiyor
4. 3 düzeltme turundan sonra hâlâ FAIL
5. Bir ajan `NEEDS_INPUT` döndü ve makul varsayımla ilerlenemiyor
6. Git commit / push / dış servise yazma

Diğer her belirsizlikte Orkestratör en makul varsayımı seçer, Task dosyasına
`VARSAYIM:` olarak yazar ve kesintisiz devam eder.

### 6. koşulun özel hâli: yıkıcı veritabanı komutları

`prisma migrate reset` (ve `db push --force-reset`) bir AI ajanı tarafından çağrıldığında
Prisma kendi güvenlik kapısını devreye sokar: komut, kullanıcının onay mesajının **birebir
metni** `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` ortam değişkenine yazılmadan çalışmaz.

- Onay **tek kullanımlıktır.** Her yeni çağrı dizisi için yeniden sorulur.
- Orkestratör sorarken Prisma'nın şart koştuğu beş şeyi söylemek zorundadır: tam CLI komutu,
  gerekçe, verinin **geri dönüşsüz** silineceği, bunun yalnızca geliştirme veritabanları için
  olduğu ve hedefin üretim olup olmadığına dair kendi değerlendirmesi.
- Ajanlar bu kapıyı **atlatamaz**; ortam değişkenini kendileri üretemez. Gerekirse
  `DURUM: NEEDS_INPUT` ile Orkestratöre dönerler.

---

## Klasör düzeni

```
.claude/
├── agents/              16 ajan tanımı
├── commands/            run.md, status.md
└── workflow/
    ├── WORKFLOW.md          bu dosya
    ├── AGENT_BASELINE.md    ajanların ortak sözleşmesi
    ├── tasks/               T-xxx.md — her görev için bir dosya
    ├── reviews/             <task>-<gate>-tur<n>.md gate raporları
    └── templates/           task.md, handoff-in.md, handoff-out.md, gate-report.md
```

---

## İlerleme bildirimi

Orkestratör her adımda kullanıcıya **tek satır** yazar; ayrıntı Task dosyasında kalır.

```
T-014 · PM   · kapsam onaylandı, 4 kabul kriteri
T-014 · ARCH · versiyon etkisi: minor, 2 risk
T-014 · PO   · 6 alt görev, 3 paralel grup
T-014 · BUILD· db DONE ║ backend DONE ║ frontend DONE
T-014 · GATE · qa PASS, security FAIL(1 high), solid PASS, wcag PASS, perf PASS → FIX 1/3
T-014 · GATE · security PASS → DOCS
T-014 · DONE · v0.5.0, commit onayı bekliyor
```
