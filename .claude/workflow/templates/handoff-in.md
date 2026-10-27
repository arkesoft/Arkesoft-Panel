# Gelen handoff paketi (Orkestratör → Ajan)

Orkestratör her ajan çağrısında bu paketi birebir doldurur.

```
TASK: T-xxx
AJAN: <ad>
AMAÇ: <tek cümle — bu ajanın bu çağrıda ne üretmesi gerektiği>

GİRDİLER:
  - <önceki ajan çıktısı: dosya yolu>
  - ROADMAP sürümü: vX.Y.Z (Hedef / Kapsam / Kabul kriteri)
  - Alt görev ID'leri: <po tablosundan>
  - Dokunulacak dosyalar: <po tablosundan — bu listenin dışına çıkma>

KISITLAR:
  - .claude/workflow/AGENT_BASELINE.md §2 (değiştirilemez kısıtlar)
  - <bu göreve özel ek kısıtlar>

BEKLENEN ÇIKTI: <dosya yolu + format>

TAMAMLANMA TANIMI:
  - [ ] <po tablosundan, ölçülebilir>
  - [ ] <...>
```

## Düzeltme turu için ek alan

Gate FAIL sonrası üretim ajanına dönerken:

```
DÜZELTME TURU: <n>/3
DÜZELTİLECEK BULGULAR:
  - [SEV: high] <dosya:satır> — <açıklama> — <önerilen düzeltme> — <kaynak gate>
KAPSAM: yalnızca yukarıdaki bulgular. Başka değişiklik yapma.
```
