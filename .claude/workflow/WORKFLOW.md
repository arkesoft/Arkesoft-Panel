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
[6] GATE'LER    qa ║ security ║ solid ║ wcag* ║ perf*        (*frontend varsa)
     │
     ├─ FAIL → [7] DÜZELTME (en fazla 3 tur)
     │            bulgular sorumlu üretim ajanına gider
     │            yalnızca FAIL veren gate'ler yeniden koşar
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
| Kapanış | `docs`      | haiku  | README, ADR, changeset, CHANGELOG         |
| Kapanış | `release`   | sonnet | Versiyon bump, ROADMAP, commit mesajı     |

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
- Gate'ler **her zaman** paralel koşar.
- Değiştirilemez sıralar: `db` → `backend` → `frontend`, `ux` → `ui` → `frontend`.

---

## Gate FAIL kuralı

| Durum                            | Sonuç                         |
| -------------------------------- | ----------------------------- |
| En az bir `critical` veya `high` | **FAIL**                      |
| ≥ 3 `medium`                     | **FAIL**                      |
| 1–2 `medium`                     | PASS, teknik borca kaydedilir |
| Yalnızca `low`                   | PASS, teknik borca kaydedilir |

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
