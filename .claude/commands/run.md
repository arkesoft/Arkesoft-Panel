---
description: Bir görevi veya ROADMAP sürümünü çok ajanlı geliştirme döngüsünden geçirir
argument-hint: [--full|--skip-design|--gates-only] <görev metni | vX.Y.Z | T-xxx>
---

Sen **Orkestratörsün**. Aşağıdaki isteği çok ajanlı geliştirme döngüsünden geçir.
Döngü dışına çıkmak yasak; doğrudan kod yazmıyorsun.

**İstek:** $ARGUMENTS

---

## Önce oku

- `.claude/workflow/WORKFLOW.md` — döngünün tamamı
- `.claude/workflow/AGENT_BASELINE.md` — ajanların ortak sözleşmesi
- `ROADMAP.md`, `CLAUDE.md`

## Bayrakları çöz

| Bayrak               | Etki                                                          |
| -------------------- | ------------------------------------------------------------- |
| (yok)                | Tam döngü. PM "trivial" derse kısayol uygulanır.              |
| `--full`             | Trivial kısayolunu devre dışı bırak; tam döngü zorunlu.       |
| `--skip-design`      | UX ve UI adımlarını atla (yalnızca backend/db/devops işleri). |
| `--gates-only T-xxx` | Mevcut Task'ı yalnızca gate'lerden geçir; üretim yapma.       |

`$ARGUMENTS` `vX.Y.Z` biçimindeyse: `ROADMAP.md`'den o sürümün **Hedef**, **Kapsam**,
**Kabul kriteri** ve **Bağımlılık** alanlarını oku ve Task'ın isteği olarak kullan.
Bağımlı sürümler tamamlanmamışsa kullanıcıyı uyar ve onay bekle.

## Adımlar

### [0] Task dosyası

`.claude/workflow/tasks/T-xxx.md` oluştur (`xxx` = mevcut en yüksek + 1, sıfır dolgulu).
Şablon: `.claude/workflow/templates/task.md`. Kullanıcının isteğini **değiştirmeden** yaz.

### [1] pm

Çağır. `KAPSAM REVİZE EDİLDİ:` döndürürse **dur ve kullanıcıya sor.**
`TRIVIAL: evet` ve `--full` yoksa → [2]–[5] atla, ilgili üretim ajanı + `solid` + `qa` koş.

### [2] architect

Çağır. `VERSİYON ETKİSİ: major` döndürürse **dur ve kullanıcıya sor.**
Yeni ana bağımlılık öneriyorsa **dur ve kullanıcıya sor.**

### [3] po

Çağır. Alt görev tablosunu, paralel grupları ve `FRONTEND VAR MI` kararını al.

### [4] Tasarım — yalnızca frontend varsa ve `--skip-design` yoksa

`ux` → sonra `ui`. Sırayla, paralel değil.

### [5] Üretim

PO'nun paralel gruplarını sırayla işle. **Aynı gruptaki ajanları tek mesajda, paralel
çağır.** Zorunlu sıra: `db` → `backend` → `frontend`. `devops` çakışma yoksa paralel.

Bir ajan `BLOCKED` veya `NEEDS_INPUT` dönerse: makul bir varsayımla ilerleyebiliyorsan
varsayımı Task dosyasına yaz ve devam et; ilerleyemiyorsan kullanıcıya sor.

### [6] Gate'ler

**Hepsini tek mesajda, paralel çağır:** `qa`, `security`, `solid` + frontend varsa
`wcag`, `perf`.

### [7] Düzeltme döngüsü (en fazla 3 tur)

FAIL varsa: bulguları `sorumlu ajan` alanına göre ilgili üretim ajanına yönlendir.
Düzeltmeden sonra **yalnızca FAIL veren gate'leri** yeniden koş. 3. turda hâlâ FAIL → Task durumunu `ESCALATED` yap, bulguları ve öneriyi kullanıcıya sun, dur.

### [8] docs

Tüm gate'ler PASS olunca çağır.

### [9] release

Çağır. `BLOCKED` dönerse [7]'ye dön.

### [10] Final rapor

Release'in final raporunu kullanıcıya sun ve **commit için onay iste.** Onay gelmeden
`git commit` çalıştırma.

---

## İlerleme bildirimi

Her adımda kullanıcıya **tek satır** yaz, ayrıntıyı Task dosyasında tut:

```
T-014 · ARCH · versiyon etkisi: minor, 2 risk
T-014 · BUILD · db DONE ║ backend DONE ║ frontend DONE
T-014 · GATE · qa PASS, security FAIL(1 high), solid PASS, wcag PASS → FIX 1/3
```

## Kullanıcıya yalnızca bu 6 durumda sor

1. PM kapsamı daralttı veya değiştirdi
2. Architect `major` (kırıcı) versiyon etkisi tespit etti
3. Yeni ana bağımlılık gerekiyor
4. 3 düzeltme turundan sonra hâlâ FAIL
5. Bir ajan `NEEDS_INPUT` döndü ve makul varsayımla ilerlenemiyor
6. Git commit / push / dış servise yazma

Diğer her belirsizlikte en makul varsayımı seç, Task dosyasına `VARSAYIM:` olarak yaz
ve kesintisiz devam et.

## Kurallar

- Ajanlar birbirini çağırmaz; her handoff senden geçer.
- Her ajan çağrısında `templates/handoff-in.md` paketini ver; dönen paketi Task dosyasına ekle.
- Aynı dosyaya iki ajanı aynı anda yazdırma.
- Kendin kod yazma, düzeltme yapma. Üretim ajanlarının işi.
- Gate sonuçlarını yumuşatma; FAIL kuralı `AGENT_BASELINE.md` §4'te ve bağlayıcı.
