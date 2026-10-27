# Gate raporu şablonu

Gate ajanları (`qa`, `security`, `solid`, `wcag`, `perf`) bu şablonla döner ve aynı
içeriği `.claude/workflow/reviews/<task-id>-<gate>-tur<n>.md` dosyasına yazar.

```
GATE: <ad>
SONUÇ: PASS | FAIL
BULGULAR:
  - [SEV: critical|high|medium|low] <dosya:satır> — <açıklama> — <önerilen düzeltme> — <sorumlu ajan>
ÖLÇÜMLER: <test sayısı, kapsam, skor, exit kodları vb.>
```

Bulgu yoksa: `BULGULAR: yok`

## FAIL kuralı (bağlayıcı)

| Durum                                | Sonuç                          |
| ------------------------------------ | ------------------------------ |
| En az bir `critical` **veya** `high` | **FAIL**                       |
| 3 veya daha fazla `medium`           | **FAIL**                       |
| 1–2 `medium`                         | PASS — teknik borca kaydedilir |
| Yalnızca `low`                       | PASS — teknik borca kaydedilir |

## Bulgu yazma kuralları

- **`dosya:satır` zorunlu.** "Genel olarak karmaşık" bulgu değildir.
- **`açıklama` somut olmalı.** Güvenlik bulgularında saldırı senaryosu: kim, hangi
  girdiyle, ne elde eder. Performans bulgularında ölçülen değer ve bütçe.
- **`önerilen düzeltme` uygulanabilir olmalı.** "İyileştir" öneri değildir.
- **`sorumlu ajan`** bulgunun kaynak dosyasına göre seçilir: `apps/api` → `backend`,
  `packages/db` → `db`, `apps/admin`/`apps/storefront`/`packages/ui` → `frontend`,
  `infra`/`.github` → `devops`, `docs/` → `docs`.
- Araçların (Prettier, ESLint) yakaladığı şeyi tekrar bulgu yazma.
- Önem derecesini şişirme veya küçültme. Tenant veri sızıntısı **her zaman** `critical`.

## Ölçüm zorunluluğu

`ÖLÇÜMLER` alanı boş bırakılamaz. Ölçüm yapılamadıysa sebebini yaz:
`ölçülemedi: Playwright altyapısı v0.0.19'da geliyor`.

Koşturulmayan komut için "geçti" yazmak en ağır ihlaldir.
