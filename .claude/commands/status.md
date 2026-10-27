---
description: Tüm Task'ların durumunu, aktif düzeltme turlarını ve teknik borç özetini gösterir
argument-hint: '[T-xxx]'
---

Sen Orkestratörsün. Çok ajanlı döngünün mevcut durumunu raporla.

**Hedef:** $ARGUMENTS (boşsa tüm Task'lar)

## Yapılacaklar

1. `.claude/workflow/tasks/` altındaki tüm `T-*.md` dosyalarını oku.
2. `.claude/workflow/reviews/` altındaki gate raporlarını tara.
3. `$ARGUMENTS` bir Task ID ise (`T-014` gibi) yalnızca onun ayrıntılı durumunu göster.

## Çıktı formatı

```
AKTİF GÖREVLER
┌──────┬────────────────────────────┬──────────────┬─────────┬──────────┐
│ ID   │ Başlık                     │ Durum        │ Sürüm   │ Tur      │
├──────┼────────────────────────────┼──────────────┼─────────┼──────────┤
│ T-014│ Ürün varyant yönetimi      │ GATE         │ minor   │ FIX 1/3  │
│ T-013│ Tenant provisioning işi    │ DONE         │ 0.2.0   │ —        │
└──────┴────────────────────────────┴──────────────┴─────────┴──────────┘

ESKALASYON BEKLEYEN
- T-011 · 3 tur sonunda security FAIL (1 critical) · kullanıcı kararı bekliyor

SON GATE SONUÇLARI (en güncel Task)
QA ✓   Security ✗ (1 high)   SOLID ✓   WCAG ✓   Perf —

TEKNİK BORÇ (tüm Task'lardan)
| Kaynak | SEV    | Dosya:satır              | Açıklama           | Sorumlu  |
|--------|--------|--------------------------|--------------------|----------|
| T-009  | low    | apps/api/src/x.ts:42     | ölü export         | backend  |
Toplam: <n> bulgu (medium: <n>, low: <n>)

ÖZET
Tamamlanan: <n> · Devam eden: <n> · Eskalasyon: <n>
Son tamamlanan sürüm: vX.Y.Z (ROADMAP'te sıradaki: vX.Y.Z)
```

## Kurallar

- Yalnızca dosyalardaki gerçek duruma dayan; tahmin veya tamamlama yapma.
- Task dosyası yoksa "Henüz Task oluşturulmadı. `/run <görev>` ile başlat." yaz.
- Hiçbir şeyi değiştirme — bu komut salt okunur.
- Ajan çağırma.
