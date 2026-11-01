# Gelen handoff paketi (Orkestratör → Ajan)

Orkestratör her ajan çağrısında bu paketi birebir doldurur.

> **Token disiplini (2026-11-01).** `BAĞLAM ÖZETİ` bloğu **zorunlu** ve geniş okumaların yerini
> tutar. Ölçüm: T-008'de ajanlara `T-008.md`'nin tamamı (1254 satır) + on gate raporu (12–50 KB
> each) + `ROADMAP.md` (1400+ satır) okutuldu; tek sürümde ~25 ajan çağrısı ≈ **7M token**.
> Orkestratör sentezi zaten yazıyor — ham kaynağı tekrar taratmak işi iki kez yapmaktır.
> Kural: **özette olanı ajana okutma, özete yaz.**

```
TASK: T-xxx
AJAN: <ad>
AMAÇ: <tek cümle — bu ajanın bu çağrıda ne üretmesi gerektiği>

BAĞLAM ÖZETİ (azami ~100 satır — ajan bunun dışına çıkmak için gerekçe yazar)
  SÜRÜM: vX.Y.Z — <hedef tek cümle>
  ÖLÇÜLMÜŞ DURUM: <lint/typecheck/test/isolation/build/format sayıları — ajan bunları
    TEKRAR KOŞTURMAZ, yalnızca kendi doğrulayacağı şeyi koşturur>
  ÖNCEKİ TURLARIN ÖZÜ: <kararlar ve neden; ham rapor DEĞİL>
  BU ÇAĞRIYA AİT BULGULAR: <birebir kopyalanmış — SEV, dosya:satır, açıklama,
    önerilen düzeltme, kaynak gate>
  BAĞLAYICI KARARLAR: <architect/ADR maddeleri, madde numarasıyla>
  BU SÜRÜME ATFEDİLMEYECEK: <önceki sürümlerin borçları, vade etiketiyle>

GİRDİLER (yalnızca GERÇEKTEN gerekenler — "şunu da oku" demek maliyet)
  - Dokunulacak dosyalar: <po tablosundan — bu listenin dışına çıkma>
  - <okunması zorunlu dosya: yol + NEDEN gerektiği>

KISITLAR:
  - .claude/workflow/AGENT_BASELINE.md §2 (değiştirilemez kısıtlar)
  - CLAUDE.md § <yalnızca ilgili bölüm numaraları>
  - KOŞTURMA: <çakışan komutlar — "Playwright koşturma", "admin build koşturma">
  - <bu göreve özel ek kısıtlar>

BEKLENEN ÇIKTI: <dosya yolu + format>

TAMAMLANMA TANIMI:
  - [ ] <po tablosundan, ölçülebilir>
  - [ ] <...>
```

## Grep/tarama şartı yazarken

**Kapsamı açıkça yaz: "kod satırlarında, yorumlar hariç".** Bu atlandığında ajanlar şartı
geçirmek için kendi açıklayıcı yorumlarını bozdu — T-007'de iki, T-008'de bir kez. Kapsam
yazıldığında tekrar olmadı.

## Düzeltme turu için ek alan

Gate FAIL sonrası üretim ajanına dönerken:

```
DÜZELTME TURU: <n>/3
DÜZELTİLECEK BULGULAR:
  - [SEV: high] <dosya:satır> — <açıklama> — <önerilen düzeltme> — <kaynak gate>
KAPSAM: yalnızca yukarıdaki bulgular. Başka değişiklik yapma.
YOLU ÜSTÜNDEYSE KAPAT: <aynı dosyada/aynı düzenlemede kapanan low'lar — varsa>
```

`low` bulgular için **düzeltme turu açılmaz** (`AGENT_BASELINE.md` §4) — tek istisna yukarıdaki
"yolu üstündeyse" satırı.

## Gate'i DAR yeniden koşarken

PASS vermiş bir gate'i yüzeyi değiştiği için yeniden koşturuyorsan:

```
KAPSAM: DAR YENİDEN KOŞUM
  Önceki turda PASS verdin. Aşağıdaki bulguların KAPANDI/AÇIK durumunu belirle.
  YENİ ALAN TARAMASI YAPMA. Rapor dosyasını okuma — bulgular aşağıda birebir var.
ÖNCEKİ BULGULARIN:
  - [SEV: low] <dosya:satır> — <açıklama birebir>
DEĞİŞEN DOSYALAR (git diff --stat ile ölçüldü): <liste>
```
